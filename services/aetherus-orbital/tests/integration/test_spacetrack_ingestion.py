"""P1 source-neutral Space-Track ingestion using a fixture only for local behavior tests."""

import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import text

from backend.domain.object_identity import ObjectIdentityResolver
from backend.ingestion.models import FetchedOmmDocument
from backend.ingestion.providers.base import ObjectSelector, SourcePolicy
from backend.ingestion.ratelimit import PolicyDecision
from backend.ingestion.repository import SqlIngestionRepository
from backend.ingestion.service import IngestionService, ProviderRegistry
from backend.ingestion.storage import RawArtifactStore

pytestmark = pytest.mark.integration

FIXTURE_DIR = Path(__file__).parents[1] / "fixtures" / "celestrak"


class SpaceTrackFixtureProvider:
    policy = SourcePolicy("spacetrack_gp", 3600, 3600, True)

    def __init__(self) -> None:
        self.calls = 0
        self.marker = uuid4().hex

    def request_uri(self, selector: ObjectSelector) -> str:
        return f"https://example.test/spacetrack/{selector.catalog_id}"

    async def fetch_current(self, selector: ObjectSelector) -> FetchedOmmDocument:
        self.calls += 1
        content = json.loads((FIXTURE_DIR / "iss-25544-2026-08-23.json").read_text())
        content[0]["P1_TEST_MARKER"] = self.marker
        return FetchedOmmDocument(
            source_id="spacetrack_gp",
            source_uri=self.request_uri(selector),
            retrieved_at=datetime(2026, 8, 24, tzinfo=UTC),
            content=json.dumps(content, separators=(",", ":")).encode(),
            media_type="application/json",
        )


class NoNetworkSpaceTrackProvider:
    """Provide the real request identity while proving replay never fetches it."""

    policy = SourcePolicy("spacetrack_gp", 3600, 3600, True)

    def __init__(self) -> None:
        self.calls = 0

    def request_uri(self, selector: ObjectSelector) -> str:
        return (
            "https://www.space-track.org/basicspacedata/query/class/gp/"
            f"NORAD_CAT_ID/{selector.catalog_id}/orderby/EPOCH%20desc/limit/1/format/json"
        )

    async def fetch_current(self, selector: ObjectSelector) -> FetchedOmmDocument:
        del selector
        self.calls += 1
        raise AssertionError("raw-snapshot replay must not call the provider")


class RememberingCoordinator:
    def __init__(self) -> None:
        self.raw_artifact_id: str | None = None

    async def acquire(
        self, policy: SourcePolicy, request_fingerprint: str, now: datetime
    ) -> PolicyDecision:
        del policy, request_fingerprint, now
        if self.raw_artifact_id is None:
            return PolicyDecision("FETCH")
        return PolicyDecision("CACHE_HIT", raw_artifact_id=self.raw_artifact_id)

    async def record_success(
        self,
        policy: SourcePolicy,
        request_fingerprint: str,
        raw_artifact_id: str,
        now: datetime,
    ) -> None:
        del policy, request_fingerprint, now
        self.raw_artifact_id = raw_artifact_id

    async def record_rate_limited(self, *args: object, **kwargs: object) -> None:
        del args, kwargs

    async def record_unavailable(self, *args: object, **kwargs: object) -> None:
        del args, kwargs


@pytest.mark.asyncio
async def test_cache_hit_reuses_spacetrack_artifact_without_second_provider_call(db_session, tmp_path) -> None:
    provider = SpaceTrackFixtureProvider()
    coordinator = RememberingCoordinator()
    repository = SqlIngestionRepository()
    service = IngestionService(
        provider=None,
        repository=repository,
        artifact_store=RawArtifactStore(tmp_path),
        registry=ProviderRegistry({"spacetrack_gp": provider}),
        coordinator=coordinator,
        identity_resolver=ObjectIdentityResolver(repository),
    )

    fresh = await service.ingest("spacetrack_gp", "25544")
    cached = await service.ingest("spacetrack_gp", "25544")

    links = await db_session.execute(
        text(
            """
            SELECT relation FROM ingestion_run_artifact
            WHERE raw_artifact_id = CAST(:raw_artifact_id AS uuid)
            ORDER BY relation
            """
        ),
        {"raw_artifact_id": fresh.raw_artifact_id},
    )
    assert fresh.source_id == "spacetrack_gp"
    assert cached.cache_status == "HIT"
    assert provider.calls == 1
    assert [row[0] for row in links] == ["CREATED", "REUSED"]


@pytest.mark.asyncio
async def test_reprocesses_unparsed_spacetrack_raw_without_network_call(db_session, tmp_path) -> None:
    """A parser correction can process one already preserved live-shaped snapshot safely."""
    provider = NoNetworkSpaceTrackProvider()
    repository = SqlIngestionRepository()
    store = RawArtifactStore(tmp_path)
    content = json.loads((FIXTURE_DIR / "iss-25544-2026-08-23.json").read_text())
    for field in (
        "MEAN_MOTION",
        "ECCENTRICITY",
        "INCLINATION",
        "RA_OF_ASC_NODE",
        "ARG_OF_PERICENTER",
        "MEAN_ANOMALY",
        "BSTAR",
        "MEAN_MOTION_DOT",
        "MEAN_MOTION_DDOT",
    ):
        content[0][field] = str(content[0][field])
    content[0]["NORAD_CAT_ID"] = "999999999"
    content[0]["OBJECT_ID"] = "P1-REPROCESS-TEST"
    content[0]["P1_REPROCESS_TEST_MARKER"] = uuid4().hex
    content[0]["ELEMENT_SET_NO"] = "999"
    content[0]["REV_AT_EPOCH"] = "12345"
    document = FetchedOmmDocument(
        source_id="spacetrack_gp",
        source_uri=provider.request_uri(ObjectSelector("999999999")),
        retrieved_at=datetime(2026, 8, 24, tzinfo=UTC),
        content=json.dumps(content, separators=(",", ":")).encode(),
        media_type="application/json",
        http_status=200,
    )
    original_run_id = await repository.start_run(document.source_id, document.source_uri)
    stored = store.preserve(
        source_id=document.source_id,
        retrieved_at=document.retrieved_at,
        content=document.content,
        media_type=document.media_type,
    )
    original_link = await repository.record_or_link_raw_artifact(original_run_id, document, stored)
    await repository.complete_partial_run(
        original_run_id,
        record_count=0,
        metadata={"source_id": document.source_id, "rejected_record_count": 1},
    )
    service = IngestionService(
        provider=None,
        repository=repository,
        artifact_store=store,
        registry=ProviderRegistry({"spacetrack_gp": provider}),
        identity_resolver=ObjectIdentityResolver(repository),
    )

    result = await service.reprocess_latest_unparsed_raw("spacetrack_gp", "999999999")

    assert result is not None
    assert provider.calls == 0
    assert result.cache_status == "REPROCESSED"
    assert result.raw_artifact_id == original_link.raw_artifact_id
    assert result.raw_artifact.created is False
    assert result.record.mean_elements["mean_motion_rev_per_day"] == float(content[0]["MEAN_MOTION"])
    replay_metadata = await db_session.execute(
        text("SELECT metadata_json FROM ingestion_run WHERE id = CAST(:run_id AS uuid)"),
        {"run_id": result.ingestion_run_id},
    )
    metadata = replay_metadata.scalar_one()
    assert metadata["cache_status"] == "REPROCESSED"
    assert metadata["reprocessed_from_raw_artifact_id"] == original_link.raw_artifact_id
