"""Raw-first, provider-neutral P1 ingestion orchestration."""

import hashlib
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal, Protocol, cast

from backend.ingestion.celestrak import CELESTRAK_SOURCE_ID, celestrak_omm_uri
from backend.ingestion.errors import (
    IdentityConflictError,
    IngestionError,
    InsufficientDataError,
    ProviderUnavailableError,
    RateLimitedError,
    UnknownObjectError,
)
from backend.ingestion.models import (
    FetchedOmmDocument,
    IdentityResolution,
    ParsedOmmRecord,
    PersistedIngestion,
    RawArtifactLink,
    ReprocessableRawArtifact,
    StoredRawArtifact,
)
from backend.ingestion.omm import parse_omm_candidates, parse_omm_document
from backend.ingestion.providers.base import ObjectSelector, OrbitProvider, SourcePolicy
from backend.ingestion.ratelimit import PolicyDecision
from backend.ingestion.redaction import Redactor
from backend.ingestion.storage import RawArtifactStore


class OmmProvider(Protocol):
    """Boundary for an OMM provider capable of returning unmodified response bytes."""

    async def fetch_omm(self, catalog_id: str) -> FetchedOmmDocument:
        """Fetch one OMM-compatible document."""


class IngestionRepository(Protocol):
    """Persistence boundary used by the ingestion transaction coordinator."""

    async def start_run(self, source_id: str, source_uri: str) -> str:
        """Create a RUNNING ingestion run."""

    async def record_raw_artifact(
        self,
        run_id: str,
        document: FetchedOmmDocument,
        object_uri: str,
        content_sha256: str,
    ) -> str:
        """Persist immutable raw artifact metadata."""

    async def persist_record(
        self, raw_artifact_id: str, record: ParsedOmmRecord
    ) -> tuple[str, str]:
        """Persist canonical identity and versioned orbit solution."""

    async def complete_run(self, run_id: str, record_count: int) -> None:
        """Mark a run successful."""

    async def fail_run(self, run_id: str, error: Exception) -> None:
        """Mark a run failed with structured error details."""

    async def get_object(self, lookup: str) -> dict[str, object] | None:
        """Load a canonical object and its latest provenance."""


class P1IngestionRepository(IngestionRepository, Protocol):
    """Additional durable provenance operations used only by source-neutral P1 paths."""

    async def record_or_link_raw_artifact(
        self,
        run_id: str,
        document: FetchedOmmDocument,
        stored: StoredRawArtifact,
    ) -> RawArtifactLink:
        """Persist one immutable raw artifact and link the active run."""

    async def find_latest_unparsed_raw_artifact(
        self, source_id: str, source_uri: str
    ) -> ReprocessableRawArtifact | None:
        """Find one provider snapshot that is durable but has no derived orbit solution."""

    async def record_rejection(
        self,
        run_id: str,
        raw_artifact_id: str,
        record_index: int,
        fragment: bytes,
        reason: str,
        details: dict[str, object],
    ) -> str:
        """Quarantine a rejected record by fragment hash only."""

    async def persist_orbit_solution(
        self,
        object_id: str,
        raw_artifact_id: str,
        source_id: str,
        record: ParsedOmmRecord,
    ) -> str:
        """Persist a source-neutral orbit solution after identity resolution."""

    async def load_cached_ingestion(
        self,
        run_id: str,
        raw_artifact_id: str,
        catalog_id: str,
        cache_status: str,
    ) -> PersistedIngestion | None:
        """Confirm a Redis raw pointer in PostgreSQL and link the new run."""

    async def complete_run(
        self, run_id: str, record_count: int, metadata: dict[str, object] | None = None
    ) -> None:
        """Mark an accepted P1 run successful."""

    async def complete_partial_run(
        self, run_id: str, record_count: int, metadata: dict[str, object] | None = None
    ) -> None:
        """Mark a P1 run partial after recording rejected rows."""

    async def mark_live_provider_proof(self, run_id: str) -> None:
        """Mark an already durable run as proven by the opt-in live integration test."""


class PolicyCoordinator(Protocol):
    """Regenerable Redis coordination boundary that fails closed."""

    async def acquire(
        self, policy: SourcePolicy, request_fingerprint: str, now: datetime
    ) -> PolicyDecision:
        """Decide whether a provider network request may begin."""

    async def record_success(
        self,
        policy: SourcePolicy,
        request_fingerprint: str,
        raw_artifact_id: str,
        now: datetime,
    ) -> None:
        """Publish a successful raw artifact and enforce the provider floor."""

    async def record_rate_limited(
        self,
        policy: SourcePolicy,
        request_fingerprint: str,
        retry_after_seconds: int,
        now: datetime,
    ) -> None:
        """Persist a terminal provider cooldown."""

    async def record_unavailable(
        self, policy: SourcePolicy, request_fingerprint: str, now: datetime
    ) -> None:
        """Prevent a tight loop after an attempted provider request fails."""


class IdentityResolver(Protocol):
    """Conservative canonical matching boundary with no merge operation."""

    async def resolve(
        self,
        raw_artifact_id: str,
        source_id: str,
        record: ParsedOmmRecord,
    ) -> IdentityResolution:
        """Resolve one parsed source record."""


class ProviderRegistry:
    """Explicit provider lookup with no source-specific fallback."""

    def __init__(self, providers: dict[str, OrbitProvider]) -> None:
        self._providers = dict(providers)

    def get(self, source_id: str) -> OrbitProvider:
        """Return the configured provider identified by the exact source ID."""
        provider = self._providers.get(source_id)
        if provider is None:
            raise ProviderUnavailableError(
                "Requested provider is not configured", {"source_id": source_id}
            )
        return provider


class _CompletedPartialRun(Exception):
    """Carry the public error after durable partial-run provenance is committed."""

    def __init__(self, error: IngestionError) -> None:
        self.error = error
        super().__init__(error.message)


class IngestionService:
    """Run fetch → immutable raw artifact → parser → PostGIS persistence in that order."""

    def __init__(
        self,
        provider: OmmProvider | None,
        repository: IngestionRepository,
        artifact_store: RawArtifactStore,
        *,
        registry: ProviderRegistry | None = None,
        coordinator: PolicyCoordinator | None = None,
        identity_resolver: IdentityResolver | None = None,
        redactor: Redactor | None = None,
    ) -> None:
        self._legacy_provider = provider
        self.repository = repository
        self.artifact_store = artifact_store
        self._registry = registry
        self._coordinator = coordinator
        self._identity_resolver = identity_resolver
        self._redactor = redactor or Redactor(())

    async def ingest_catalog_id(self, catalog_id: str) -> PersistedIngestion:
        """Keep the P0 CelesTrak API while P1 uses the provider registry."""
        if self._registry is not None:
            return await self.ingest(CELESTRAK_SOURCE_ID, catalog_id)
        return await self._ingest_legacy_celestrak(catalog_id)

    async def ingest(self, source_id: str, catalog_id: str) -> PersistedIngestion:
        """Ingest a selected provider through policy, raw storage, and identity gates."""
        if self._registry is None or self._coordinator is None:
            if source_id == CELESTRAK_SOURCE_ID and self._legacy_provider is not None:
                return await self._ingest_legacy_celestrak(catalog_id)
            raise ProviderUnavailableError("P1 ingestion service is not configured")

        selector = ObjectSelector(catalog_id)
        provider = self._registry.get(source_id)
        request_fingerprint = _request_fingerprint(source_id, selector.catalog_id)
        run_id = await self.repository.start_run(source_id, provider.request_uri(selector))
        decision: PolicyDecision | None = None
        run_finished = False
        try:
            decision = await self._coordinator.acquire(
                provider.policy, request_fingerprint, datetime.now(UTC)
            )
            if decision.kind in {"CACHE_HIT", "STALE"}:
                cache_status: Literal["HIT", "STALE"] = (
                    "HIT" if decision.kind == "CACHE_HIT" else "STALE"
                )
                cached = await _p1_repository(self.repository).load_cached_ingestion(
                    run_id,
                    _required_raw_artifact_id(decision),
                    selector.catalog_id,
                    cache_status,
                )
                if cached is None:
                    raise ProviderUnavailableError(
                        "Cached raw artifact cannot be confirmed in durable storage",
                        {"source_id": source_id},
                    )
                return cached
            if decision.kind == "RATE_LIMITED":
                raise RateLimitedError(
                    "Provider request is locally rate limited",
                    retry_after_seconds=decision.retry_after_seconds or 1,
                )
            if decision.kind == "UNAVAILABLE":
                raise ProviderUnavailableError(
                    "Redis policy coordination is unavailable", {"source_id": source_id}
                )

            document = await provider.fetch_current(selector)
            if document.source_id != source_id:
                raise InsufficientDataError(
                    "Provider source_id does not match the selected source",
                    {"source_id": document.source_id, "requested_source_id": source_id},
                )
            raw_artifact = self.artifact_store.preserve(
                source_id=document.source_id,
                retrieved_at=document.retrieved_at,
                content=document.content,
                media_type=document.media_type,
            )
            raw_link = await _p1_repository(self.repository).record_or_link_raw_artifact(
                run_id, document, raw_artifact
            )
            result, run_finished = await self._parse_resolve_and_persist(
                run_id=run_id,
                raw_link=raw_link,
                raw_artifact=raw_artifact,
                document=document,
                selector=selector,
            )
            try:
                await self._coordinator.record_success(
                    provider.policy,
                    request_fingerprint,
                    raw_link.raw_artifact_id,
                    datetime.now(UTC),
                )
            except Exception:
                # Durable raw/DB provenance has succeeded. Subsequent Redis failure remains
                # fail-closed at acquire time and cannot rewrite this completed run.
                pass
            return result
        except _CompletedPartialRun as completed:
            raise completed.error from completed
        except Exception as error:
            if not run_finished:
                await self._record_policy_failure(
                    provider.policy, request_fingerprint, decision, error
                )
                await self.repository.fail_run(run_id, self._redact_error(error))
            raise

    async def reprocess_latest_unparsed_raw(
        self, source_id: str, catalog_id: str
    ) -> PersistedIngestion | None:
        """Parse one exact preserved provider snapshot without another provider request."""
        if self._registry is None:
            raise ProviderUnavailableError("P1 ingestion service is not configured")
        selector = ObjectSelector(catalog_id)
        provider = self._registry.get(source_id)
        p1_repository = _p1_repository(self.repository)
        raw_reference = await p1_repository.find_latest_unparsed_raw_artifact(
            source_id, provider.request_uri(selector)
        )
        if raw_reference is None:
            return None
        try:
            raw_artifact, content = self.artifact_store.load_verified(
                str(raw_reference.source_id),
                str(raw_reference.content_sha256),
                str(raw_reference.media_type),
            )
        except (FileNotFoundError, RuntimeError, ValueError) as error:
            raise ProviderUnavailableError(
                "Immutable raw snapshot cannot be safely replayed",
                {"source_id": source_id, "raw_artifact_id": str(raw_reference.id)},
            ) from error
        document = FetchedOmmDocument(
            source_id=str(raw_reference.source_id),
            source_uri=str(raw_reference.source_uri),
            retrieved_at=raw_reference.retrieved_at,
            content=content,
            media_type=str(raw_reference.media_type),
            http_status=int(raw_reference.http_status),
        )
        run_id = await self.repository.start_run(source_id, document.source_uri)
        run_finished = False
        try:
            raw_link = await p1_repository.record_or_link_raw_artifact(
                run_id, document, raw_artifact
            )
            if raw_link.raw_artifact_id != str(raw_reference.id):
                raise ProviderUnavailableError(
                    "Replayed raw snapshot did not retain its immutable artifact identity",
                    {"source_id": source_id},
                )
            result, run_finished = await self._parse_resolve_and_persist(
                run_id=run_id,
                raw_link=raw_link,
                raw_artifact=raw_artifact,
                document=document,
                selector=selector,
                cache_status="REPROCESSED",
                extra_metadata={"reprocessed_from_raw_artifact_id": raw_link.raw_artifact_id},
            )
            return result
        except _CompletedPartialRun as completed:
            raise completed.error from completed
        except Exception as error:
            if not run_finished:
                await self.repository.fail_run(run_id, self._redact_error(error))
            raise

    async def _ingest_legacy_celestrak(self, catalog_id: str) -> PersistedIngestion:
        """Retain the already-tested P0 compatibility path for non-P1 construction."""
        if self._legacy_provider is None:
            raise ProviderUnavailableError("CelesTrak provider is not configured")
        normalized_catalog_id = ObjectSelector(catalog_id).catalog_id
        run_id = await self.repository.start_run(
            CELESTRAK_SOURCE_ID, celestrak_omm_uri(normalized_catalog_id)
        )
        try:
            document = await self._legacy_provider.fetch_omm(normalized_catalog_id)
            if document.source_id != CELESTRAK_SOURCE_ID:
                raise InsufficientDataError(
                    "Provider source_id does not match the configured CelesTrak ingestion source",
                    {"source_id": document.source_id},
                )
            raw_artifact = self.artifact_store.preserve(
                source_id=document.source_id,
                retrieved_at=document.retrieved_at,
                content=document.content,
                media_type=document.media_type,
            )
            raw_artifact_id = await self.repository.record_raw_artifact(
                run_id,
                document,
                raw_artifact.object_uri,
                raw_artifact.content_sha256,
            )
            matching_records = [
                record
                for record in parse_omm_document(document.content)
                if record.catalog_id == normalized_catalog_id
            ]
            if len(matching_records) != 1:
                raise InsufficientDataError(
                    "Provider response did not contain exactly one requested catalog ID",
                    {
                        "catalog_id": normalized_catalog_id,
                        "matching_record_count": len(matching_records),
                    },
                )
            record = matching_records[0]
            object_id, orbit_solution_id = await self.repository.persist_record(
                raw_artifact_id, record
            )
            await self.repository.complete_run(run_id, record_count=1)
            return PersistedIngestion(
                ingestion_run_id=run_id,
                raw_artifact_id=raw_artifact_id,
                object_id=object_id,
                orbit_solution_id=orbit_solution_id,
                record_count=1,
                source_uri=document.source_uri,
                retrieved_at=document.retrieved_at,
                raw_artifact=raw_artifact,
                record=record,
            )
        except Exception as error:
            await self.repository.fail_run(run_id, self._redact_error(error))
            raise

    async def _parse_resolve_and_persist(
        self,
        *,
        run_id: str,
        raw_link: RawArtifactLink,
        raw_artifact: StoredRawArtifact,
        document: FetchedOmmDocument,
        selector: ObjectSelector,
        cache_status: Literal["MISS", "REPROCESSED"] = "MISS",
        extra_metadata: dict[str, object] | None = None,
    ) -> tuple[PersistedIngestion, bool]:
        """Persist only one safe requested record; quarantine all malformed rows."""
        p1_repository = _p1_repository(self.repository)
        if self._identity_resolver is None:
            raise ProviderUnavailableError("P1 identity resolver is not configured")
        accepted: tuple[ParsedOmmRecord, str, Literal["CREATED", "MATCHED"], str] | None = None
        rejection_count = 0
        conflict_id: str | None = None
        unknown_object = False

        for candidate in parse_omm_candidates(document.content):
            if candidate.error is not None:
                rejection_count += 1
                await p1_repository.record_rejection(
                    run_id,
                    raw_link.raw_artifact_id,
                    candidate.index,
                    candidate.fragment,
                    "PARSE_REJECT",
                    self._error_details(candidate.error),
                )
                continue
            record = candidate.record
            if record is None:
                raise RuntimeError("OMM candidate has neither record nor error")
            if record.catalog_id != selector.catalog_id:
                rejection_count += 1
                await p1_repository.record_rejection(
                    run_id,
                    raw_link.raw_artifact_id,
                    candidate.index,
                    candidate.fragment,
                    "REQUESTED_CATALOG_MISMATCH",
                    {"requested_catalog_id": selector.catalog_id},
                )
                continue
            if accepted is not None:
                rejection_count += 1
                await p1_repository.record_rejection(
                    run_id,
                    raw_link.raw_artifact_id,
                    candidate.index,
                    candidate.fragment,
                    "DUPLICATE_REQUESTED_CATALOG",
                    {"catalog_id": selector.catalog_id},
                )
                continue
            resolution = await self._identity_resolver.resolve(
                raw_link.raw_artifact_id, document.source_id, record
            )
            if resolution.status == "IDENTITY_CONFLICT":
                rejection_count += 1
                conflict_id = resolution.conflict_id
                await p1_repository.record_rejection(
                    run_id,
                    raw_link.raw_artifact_id,
                    candidate.index,
                    candidate.fragment,
                    "IDENTITY_CONFLICT",
                    {"conflict_id": conflict_id},
                )
                continue
            if resolution.status == "UNKNOWN_OBJECT" or resolution.object_id is None:
                rejection_count += 1
                unknown_object = True
                await p1_repository.record_rejection(
                    run_id,
                    raw_link.raw_artifact_id,
                    candidate.index,
                    candidate.fragment,
                    "UNKNOWN_OBJECT",
                    {"catalog_id": selector.catalog_id},
                )
                continue
            if resolution.status not in {"CREATED", "MATCHED"} or resolution.object_id is None:
                raise RuntimeError("identity resolver returned an invalid accepted resolution")
            object_id = resolution.object_id
            identity_status: Literal["CREATED", "MATCHED"] = resolution.status
            orbit_solution_id = await p1_repository.persist_orbit_solution(
                object_id, raw_link.raw_artifact_id, document.source_id, record
            )
            accepted = (record, object_id, identity_status, orbit_solution_id)

        metadata: dict[str, object] = {
            "cache_hit": False,
            "cache_status": cache_status,
            "raw_artifact_relation": raw_link.relation,
            "rejected_record_count": rejection_count,
            "source_id": document.source_id,
        }
        if extra_metadata is not None:
            metadata.update(extra_metadata)
        if accepted is None:
            await p1_repository.complete_partial_run(run_id, 0, metadata)
            if conflict_id is not None:
                raise _CompletedPartialRun(IdentityConflictError(conflict_id))
            if unknown_object:
                raise _CompletedPartialRun(
                    UnknownObjectError("Requested record could not be resolved safely")
                )
            raise _CompletedPartialRun(
                InsufficientDataError(
                    "Provider response did not contain one usable requested catalog record",
                    {"catalog_id": selector.catalog_id, "rejected_record_count": rejection_count},
                )
            )

        record, object_id, identity_status, orbit_solution_id = accepted
        status: Literal["PARTIAL", "SUCCEEDED"] = "PARTIAL" if rejection_count else "SUCCEEDED"
        if status == "PARTIAL":
            await p1_repository.complete_partial_run(run_id, 1, metadata)
        else:
            await p1_repository.complete_run(run_id, 1, metadata)
        return (
            PersistedIngestion(
                ingestion_run_id=run_id,
                raw_artifact_id=raw_link.raw_artifact_id,
                object_id=object_id,
                orbit_solution_id=orbit_solution_id,
                record_count=1,
                source_uri=document.source_uri,
                retrieved_at=document.retrieved_at,
                raw_artifact=raw_artifact,
                record=record,
                source_id=document.source_id,
                status=status,
                cache_status=cache_status,
                identity_status=identity_status,
                rejected_record_count=rejection_count,
            ),
            True,
        )

    async def _record_policy_failure(
        self,
        policy: SourcePolicy,
        request_fingerprint: str,
        decision: PolicyDecision | None,
        error: Exception,
    ) -> None:
        """Persist terminal cooldown state without a retry or local-policy bypass."""
        if self._coordinator is None or decision is None or decision.kind != "FETCH":
            return
        if (
            isinstance(error, ProviderUnavailableError)
            and error.details.get("reason") == "AUTH_REQUIRED_NOT_CONFIGURED"
        ):
            # Local credential setup did not contact a provider, so it must not impose
            # a provider cooldown that prevents the operator from correcting it.
            return
        try:
            if isinstance(error, RateLimitedError):
                await self._coordinator.record_rate_limited(
                    policy,
                    request_fingerprint,
                    int(error.details["retry_after_seconds"]),
                    datetime.now(UTC),
                )
            else:
                await self._coordinator.record_unavailable(
                    policy, request_fingerprint, datetime.now(UTC)
                )
        except Exception:
            return

    def _redact_error(self, error: Exception) -> IngestionError:
        """Produce a secret-free structured error before failed-run persistence."""
        if isinstance(error, IngestionError):
            payload = self._redactor.redact_mapping(error.to_payload())
            details = payload.get("details", {})
            return IngestionError(
                message=str(payload.get("message", "Provider request failed")),
                status=str(payload.get("status", "UNAVAILABLE")),
                details=details if isinstance(details, dict) else {},
            )
        payload = self._redactor.redact_mapping({"message": str(error)})
        return ProviderUnavailableError(str(payload["message"]))

    def _error_details(self, error: Exception) -> dict[str, object]:
        """Redact per-record rejection metadata before its durable hash-linked row."""
        if isinstance(error, IngestionError):
            return self._redactor.redact_mapping(error.to_payload())
        return {"status": "INSUFFICIENT_DATA", "message": error.__class__.__name__}

    async def get_object(self, lookup: str) -> dict[str, object] | None:
        """Retrieve a persisted canonical object without calculating missing scientific values."""
        return await self.repository.get_object(lookup)


def build_default_artifact_store(raw_artifact_dir: str) -> RawArtifactStore:
    """Create the configured local raw-object store for the standalone P0 service."""
    return RawArtifactStore(Path(raw_artifact_dir))


def _p1_repository(repository: IngestionRepository) -> P1IngestionRepository:
    """Narrow the runtime boundary only when the P1 service path is active."""
    return cast(P1IngestionRepository, repository)


def _request_fingerprint(source_id: str, catalog_id: str) -> str:
    """Create a stable non-secret source/request key for Redis coordination."""
    return hashlib.sha256(f"{source_id}:{catalog_id}".encode()).hexdigest()


def _required_raw_artifact_id(decision: PolicyDecision) -> str:
    """Reject malformed reusable decisions rather than fetching around them."""
    if not decision.raw_artifact_id:
        raise ProviderUnavailableError("Reusable snapshot decision has no raw artifact ID")
    return decision.raw_artifact_id
