"""Service-level tests for the complete raw-to-canonical ingestion path."""

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from pydantic import SecretStr

from backend.ingestion.errors import IdentityConflictError, ProviderUnavailableError
from backend.ingestion.models import (
    FetchedOmmDocument,
    IdentityResolution,
    ParsedOmmRecord,
    PersistedIngestion,
    StoredRawArtifact,
)
from backend.ingestion.providers.base import ObjectSelector, SourcePolicy
from backend.ingestion.ratelimit import PolicyDecision
from backend.ingestion.redaction import Redactor
from backend.ingestion.service import IngestionService, ProviderRegistry
from backend.ingestion.storage import RawArtifactStore

FIXTURE_DIR = Path(__file__).parents[1] / "fixtures" / "celestrak"
RAW_FIXTURE = FIXTURE_DIR / "iss-25544-2026-08-23.json"
PROVENANCE_FIXTURE = FIXTURE_DIR / "iss-25544-2026-08-23.provenance.json"


class FixtureProvider:
    """Provider boundary that returns a recorded response captured from CelesTrak."""

    def __init__(self) -> None:
        provenance = json.loads(PROVENANCE_FIXTURE.read_text())
        self.document = FetchedOmmDocument(
            source_id=provenance["source_id"],
            source_uri=provenance["source_uri"],
            retrieved_at=datetime.fromisoformat(provenance["retrieved_at"]),
            content=RAW_FIXTURE.read_bytes(),
            media_type=provenance["media_type"],
        )

    async def fetch_omm(self, catalog_id: str) -> FetchedOmmDocument:
        assert catalog_id == "25544"
        return self.document


class RecordingRepository:
    """Records persistence calls; real PostGIS persistence is covered by integration tests."""

    def __init__(self) -> None:
        self.events: list[tuple[str, object]] = []

    async def start_run(self, source_id: str, source_uri: str) -> str:
        self.events.append(("start_run", (source_id, source_uri)))
        return "run-1"

    async def record_raw_artifact(
        self, run_id: str, document: FetchedOmmDocument, object_uri: str, content_sha256: str
    ) -> str:
        self.events.append(("record_raw_artifact", (run_id, document, object_uri, content_sha256)))
        return "raw-1"

    async def persist_record(self, raw_artifact_id: str, record: object) -> tuple[str, str]:
        self.events.append(("persist_record", (raw_artifact_id, record)))
        return "object-1", "orbit-1"

    async def complete_run(self, run_id: str, record_count: int) -> None:
        self.events.append(("complete_run", (run_id, record_count)))

    async def fail_run(self, run_id: str, error: Exception) -> None:
        self.events.append(("fail_run", (run_id, error)))


@pytest.mark.asyncio
async def test_ingests_recorded_celestrak_bytes_through_raw_storage_and_normalization(
    tmp_path: Path,
) -> None:
    """Ingestion must preserve bytes before it emits one canonical OMM solution."""
    repository = RecordingRepository()
    service = IngestionService(FixtureProvider(), repository, RawArtifactStore(tmp_path))

    result = await service.ingest_catalog_id("25544")

    assert result.record_count == 1
    assert result.record.catalog_id == "25544"
    assert result.raw_artifact.path.read_bytes() == RAW_FIXTURE.read_bytes()
    assert [event[0] for event in repository.events] == [
        "start_run",
        "record_raw_artifact",
        "persist_record",
        "complete_run",
    ]
    payload = result.to_api_payload()
    assert payload["orbit_solution"]["covariance_status"] == "INSUFFICIENT_DATA"
    assert payload["provenance"]["retrieved_at"] == "2026-08-24T12:40:40+00:00"


@pytest.mark.asyncio
async def test_provider_outage_is_recorded_as_failed_not_succeeded(tmp_path: Path) -> None:
    """A failed provider request must persist an error state rather than a synthetic record."""

    class UnavailableProvider:
        async def fetch_omm(self, catalog_id: str) -> FetchedOmmDocument:
            raise ProviderUnavailableError("provider unavailable")

    repository = RecordingRepository()
    service = IngestionService(UnavailableProvider(), repository, RawArtifactStore(tmp_path))

    with pytest.raises(ProviderUnavailableError):
        await service.ingest_catalog_id("25544")

    assert [event[0] for event in repository.events] == ["start_run", "fail_run"]


@pytest.mark.asyncio
async def test_failed_run_redacts_configured_provider_secret_before_persistence(tmp_path: Path) -> None:
    class LeakingProvider:
        async def fetch_omm(self, catalog_id: str) -> FetchedOmmDocument:
            del catalog_id
            raise ProviderUnavailableError("upstream included p1-test-secret in an error")

    repository = RecordingRepository()
    service = IngestionService(
        LeakingProvider(),
        repository,
        RawArtifactStore(tmp_path),
        redactor=Redactor.from_secret_values([SecretStr("p1-test-secret")]),
    )

    with pytest.raises(ProviderUnavailableError):
        await service.ingest_catalog_id("25544")

    persisted_error = repository.events[-1][1][1]
    assert "p1-test-secret" not in str(persisted_error)


def _p1_record(catalog_id: str = "25544") -> ParsedOmmRecord:
    return ParsedOmmRecord(
        catalog_id=catalog_id,
        object_name="TEST OBJECT",
        international_designator="P1-TEST",
        object_type="PAYLOAD",
        epoch=datetime(2026, 8, 24, tzinfo=UTC),
        frame="TEME",
        time_system="UTC",
        theory="SGP4",
        mean_elements={},
        covariance=None,
        quality_grade="PUBLIC_GP",
        limitations=("No covariance was supplied; Pc is NOT_COMPUTED.",),
    )


def _cached_result(tmp_path: Path) -> PersistedIngestion:
    raw = StoredRawArtifact(
        content_sha256="a" * 64,
        path=tmp_path / "cached.json",
        object_uri=f"file://{tmp_path}/cached.json",
        created=False,
    )
    return PersistedIngestion(
        ingestion_run_id="run-cache",
        raw_artifact_id="raw-cache",
        object_id="object-cache",
        orbit_solution_id="orbit-cache",
        record_count=1,
        source_uri="https://example.test/celestrak/25544",
        retrieved_at=datetime(2026, 8, 24, tzinfo=UTC),
        raw_artifact=raw,
        record=_p1_record(),
        source_id="celestrak_gp",
        cache_status="HIT",
        identity_status="MATCHED",
    )


class CountingProvider:
    policy = SourcePolicy("celestrak_gp", 7200, 7200, False)

    def __init__(self) -> None:
        self.calls = 0

    def request_uri(self, selector: ObjectSelector) -> str:
        return f"https://example.test/celestrak/{selector.catalog_id}"

    async def fetch_current(self, selector: ObjectSelector) -> FetchedOmmDocument:
        self.calls += 1
        raise AssertionError("cache hit must not call a provider")


class CacheCoordinator:
    async def acquire(
        self, policy: SourcePolicy, request_fingerprint: str, now: datetime
    ) -> PolicyDecision:
        del policy, request_fingerprint, now
        return PolicyDecision("CACHE_HIT", raw_artifact_id="raw-cache")


class CacheRepository:
    def __init__(self, result: PersistedIngestion) -> None:
        self.result = result
        self.started: list[tuple[str, str]] = []

    async def start_run(self, source_id: str, source_uri: str) -> str:
        self.started.append((source_id, source_uri))
        return "run-new"

    async def load_cached_ingestion(
        self, run_id: str, raw_artifact_id: str, catalog_id: str, cache_status: str
    ) -> PersistedIngestion | None:
        assert (run_id, raw_artifact_id, catalog_id, cache_status) == (
            "run-new",
            "raw-cache",
            "25544",
            "HIT",
        )
        return self.result

    async def fail_run(self, run_id: str, error: Exception) -> None:
        raise AssertionError(f"unexpected failed run: {run_id} {error}")


class ConflictIdentityResolver:
    async def resolve(
        self, raw_artifact_id: str, source_id: str, record: ParsedOmmRecord
    ) -> IdentityResolution:
        del raw_artifact_id, source_id, record
        return IdentityResolution(status="IDENTITY_CONFLICT", conflict_id="conflict-1")


@pytest.mark.asyncio
async def test_cache_hit_reuses_artifact_without_provider_call(tmp_path: Path) -> None:
    provider = CountingProvider()
    result = _cached_result(tmp_path)
    service = IngestionService(
        provider=None,
        repository=CacheRepository(result),
        artifact_store=RawArtifactStore(tmp_path),
        registry=ProviderRegistry({"celestrak_gp": provider}),
        coordinator=CacheCoordinator(),
    )

    cached = await service.ingest("celestrak_gp", "25544")

    assert cached.cache_status == "HIT"
    assert provider.calls == 0


@pytest.mark.asyncio
async def test_missing_spacetrack_credentials_do_not_create_provider_cooldown(tmp_path: Path) -> None:
    """Local credential setup is not a provider outage and must be immediately correctable."""

    class MissingCredentialProvider:
        policy = SourcePolicy("spacetrack_gp", 3600, 3600, True)

        def request_uri(self, selector: ObjectSelector) -> str:
            return f"https://example.test/spacetrack/{selector.catalog_id}"

        async def fetch_current(self, selector: ObjectSelector) -> FetchedOmmDocument:
            del selector
            raise ProviderUnavailableError(
                "AUTH_REQUIRED_NOT_CONFIGURED", {"reason": "AUTH_REQUIRED_NOT_CONFIGURED"}
            )

    class FetchCoordinator:
        def __init__(self) -> None:
            self.unavailable_calls = 0

        async def acquire(
            self, policy: SourcePolicy, request_fingerprint: str, now: datetime
        ) -> PolicyDecision:
            del policy, request_fingerprint, now
            return PolicyDecision("FETCH")

        async def record_success(self, *args: object, **kwargs: object) -> None:
            del args, kwargs

        async def record_rate_limited(self, *args: object, **kwargs: object) -> None:
            del args, kwargs

        async def record_unavailable(self, *args: object, **kwargs: object) -> None:
            del args, kwargs
            self.unavailable_calls += 1

    class FailureRepository:
        def __init__(self) -> None:
            self.failed: list[Exception] = []

        async def start_run(self, source_id: str, source_uri: str) -> str:
            assert source_id == "spacetrack_gp"
            assert source_uri.endswith("/25544")
            return "run-missing-credentials"

        async def fail_run(self, run_id: str, error: Exception) -> None:
            assert run_id == "run-missing-credentials"
            self.failed.append(error)

    coordinator = FetchCoordinator()
    repository = FailureRepository()
    service = IngestionService(
        provider=None,
        repository=repository,
        artifact_store=RawArtifactStore(tmp_path),
        registry=ProviderRegistry({"spacetrack_gp": MissingCredentialProvider()}),
        coordinator=coordinator,
    )

    with pytest.raises(ProviderUnavailableError, match="AUTH_REQUIRED_NOT_CONFIGURED"):
        await service.ingest("spacetrack_gp", "25544")

    assert coordinator.unavailable_calls == 0
    assert len(repository.failed) == 1


@pytest.mark.asyncio
async def test_identity_conflict_exposes_no_orbit_solution(tmp_path: Path) -> None:
    record = _p1_record()
    content = json.dumps(
        [
            {
                "NORAD_CAT_ID": record.catalog_id,
                "OBJECT_NAME": record.object_name,
                "OBJECT_ID": record.international_designator,
                "OBJECT_TYPE": record.object_type,
                "EPOCH": record.epoch.isoformat(),
                "MEAN_MOTION": 15.0,
                "ECCENTRICITY": 0.0,
                "INCLINATION": 0.0,
                "RA_OF_ASC_NODE": 0.0,
                "ARG_OF_PERICENTER": 0.0,
                "MEAN_ANOMALY": 0.0,
            }
        ]
    ).encode()

    class FreshProvider(CountingProvider):
        async def fetch_current(self, selector: ObjectSelector) -> FetchedOmmDocument:
            self.calls += 1
            return FetchedOmmDocument(
                source_id="celestrak_gp",
                source_uri=self.request_uri(selector),
                retrieved_at=datetime(2026, 8, 24, tzinfo=UTC),
                content=content,
                media_type="application/json",
            )

    class FreshCoordinator:
        async def acquire(
            self, policy: SourcePolicy, request_fingerprint: str, now: datetime
        ) -> PolicyDecision:
            del policy, request_fingerprint, now
            return PolicyDecision("FETCH")

        async def record_success(self, *args: object, **kwargs: object) -> None:
            del args, kwargs

        async def record_rate_limited(self, *args: object, **kwargs: object) -> None:
            del args, kwargs

        async def record_unavailable(self, *args: object, **kwargs: object) -> None:
            del args, kwargs

    class ConflictRepository(CacheRepository):
        async def record_or_link_raw_artifact(self, *args: object, **kwargs: object):
            del args, kwargs
            from backend.ingestion.models import RawArtifactLink

            return RawArtifactLink("raw-new", "CREATED")

        async def record_rejection(self, *args: object, **kwargs: object) -> str:
            del args, kwargs
            return "rejection-1"

        async def complete_partial_run(self, *args: object, **kwargs: object) -> None:
            del args, kwargs

    service = IngestionService(
        provider=None,
        repository=ConflictRepository(_cached_result(tmp_path)),
        artifact_store=RawArtifactStore(tmp_path),
        registry=ProviderRegistry({"celestrak_gp": FreshProvider()}),
        coordinator=FreshCoordinator(),
        identity_resolver=ConflictIdentityResolver(),
    )

    with pytest.raises(IdentityConflictError) as error:
        await service.ingest("celestrak_gp", "25544")

    assert error.value.details["conflict_id"] == "conflict-1"
