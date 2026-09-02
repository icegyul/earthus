"""Persist one SOCRATES bulk product: bytes → artifact → events → snapshots.

This is the first path that carries an externally computed metric into the
conjunction store, so it is where every provenance guarantee built for that
purpose is actually exercised:

* the CSV bytes are preserved content-addressed and recorded as a
  ``raw_artifact`` linked to an ``ingestion_run``, so every value points back to
  the exact document CelesTrak published and the run that fetched it;
* MAX_PC lands with ``basis=OBSERVED_EXTERNAL`` and never touches the PC
  channel — SOCRATES publishes a maximum-probability screening bound, not a
  collision probability;
* the geometry (miss distance, relative speed) is CelesTrak's too and is written
  with ``geometry_basis=OBSERVED_EXTERNAL``. Leaving that unmarked let the API
  serve it as our computation (adversarial review 2026-09-02, CRITICAL);
* rows referencing objects outside our stored catalogue are counted, never
  silently dropped. SOCRATES screens the whole public catalogue while we hold a
  subset, so most rows are expected to fall outside;
* identical bytes are never persisted twice: the artifact is reused and a
  snapshot already recorded for (event, input_hash) is skipped and counted,
  which also makes a crashed run resumable by re-running it.

Timezone note: SOCRATES TCA strings are naive UTC. They are attached with
``replace(tzinfo=UTC)`` — passing them through ``astimezone`` first would
reinterpret them in local time, the nine-hour error this project already shipped
once with OMM epochs.

Not done here, on purpose: a single transaction around the whole ingest. The
repository methods each commit, so a mid-run failure leaves the rows written so
far. The dedup guard makes that recoverable (re-run skips them) and the
``ingestion_run`` row records the failure, but the write is not atomic.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy import text

from backend.conjunction.repository import ConjunctionRepository
from backend.database import get_db_session
from backend.ingestion.storage import RawArtifactStore
from backend.providers_live import LiveProviderClient
from backend.providers_live.socrates import (
    SOURCE_ID,
    SocratesConjunction,
    SocratesResult,
    SocratesUsagePolicyError,
    fetch_socrates,
)

#: Registry id, storage key and provenance source are one identifier by design:
#: data_source.id is lowercase by house convention and RawArtifactStore requires
#: a lowercase key, so a single spelling removes a whole class of mismatch.
STORAGE_KEY = SOURCE_ID

#: The producer of the values, recorded as the snapshot's model identity. It is
#: CelesTrak's computation, not ours — the entire point of the basis columns.
MODEL_VERSION = "CELESTRAK_SOCRATES"

#: Grade for genuine feed rows. Tests must NOT use this: a synthetic row wearing
#: the real grade would be indistinguishable from observed data, which is how
#: the dev database was polluted before (audit 2026-09-02, defect 5). Tests pass
#: an explicit simulation grade (EVIDENCE_PROBE) instead.
SOURCE_GRADE_LIVE = "PUBLIC_SOCRATES"

#: Attribution recorded on the artifact of a genuine fetch. A test must override
#: it: writing "data by CelesTrak" onto synthetic bytes fabricates provenance in
#: a permanent table.
LIVE_ARTIFACT_ATTRIBUTION = "Conjunction data by CelesTrak SOCRATES"

GEOMETRY_BASIS_EXTERNAL = "OBSERVED_EXTERNAL"

_PC_UNAVAILABLE_REASON = "EXTERNAL_SCREENING_PROVIDES_NO_PC"
_REPORT_CAP = 20


@dataclass(frozen=True)
class SocratesPersistOutcome:
    """Everything a reader needs to judge what one ingestion actually did."""

    ingestion_run_id: str
    artifact_id: str
    artifact_created: bool
    raw_sha256: str
    source_uri: str
    conjunction_rows: int
    events_written: int
    snapshots_written: int
    snapshots_skipped_duplicate: int
    rows_outside_catalog: int
    tca_parse_failures: tuple[dict[str, str], ...]
    csv_skipped_rows: int
    catalog_ids_seen: int
    catalog_ids_resolved: int
    event_ids: tuple[str, ...] = field(default=())
    warnings: tuple[str, ...] = field(default=())

    def to_dict(self) -> dict[str, object]:
        return {
            "source_id": SOURCE_ID,
            "source_uri": self.source_uri,
            "ingestion_run_id": self.ingestion_run_id,
            "artifact_id": self.artifact_id,
            "artifact_created": self.artifact_created,
            "raw_sha256": self.raw_sha256,
            "conjunction_rows": self.conjunction_rows,
            "events_written": self.events_written,
            "snapshots_written": self.snapshots_written,
            "snapshots_skipped_duplicate": self.snapshots_skipped_duplicate,
            # Expectedly large: SOCRATES covers the full public catalogue and we
            # hold a subset. Reported so a small ingest is never mistaken for a
            # small feed.
            "rows_outside_catalog": self.rows_outside_catalog,
            "tca_parse_failure_count": len(self.tca_parse_failures),
            "tca_parse_failures": list(self.tca_parse_failures[:_REPORT_CAP]),
            "csv_skipped_rows": self.csv_skipped_rows,
            "catalog_ids_seen": self.catalog_ids_seen,
            "catalog_ids_resolved": self.catalog_ids_resolved,
            "event_ids": list(self.event_ids[:50]),
            "warnings": list(self.warnings),
        }


def _tca_utc(raw: str) -> datetime:
    """Attach UTC to a naive SOCRATES timestamp without reinterpreting it."""
    parsed = datetime.fromisoformat(raw)
    if parsed.tzinfo is not None:
        return parsed.astimezone(UTC)
    return parsed.replace(tzinfo=UTC)


def _source_event_id(tca: datetime) -> str:
    """Stable identity for one published conjunction of a pair.

    Truncated to the minute: successive feed updates refine TCA by fractions of
    a second, and second-precision identity would mint a new event per refresh.
    A refinement that crosses a minute boundary does open a new event while the
    old one stays OPEN — an accepted, documented limitation of this scheme.
    """
    return f"SOCRATES:{tca.strftime('%Y-%m-%dT%H:%M')}"


def _canonical_pair(object_a: str, object_b: str) -> tuple[str, str]:
    """Order the pair by object identity, not by feed column.

    Event identity is (primary, secondary, source_event_id). If the feed ever
    lists a pair in the other order, the same physical conjunction would become
    a second event; ordering by our own object ids makes identity independent of
    how CelesTrak happened to print the row.
    """
    return (object_a, object_b) if object_a <= object_b else (object_b, object_a)


async def _open_ingestion_run(fingerprint: str) -> str:
    """Make the run visible to DB-backed monitoring like every other source."""
    async with get_db_session() as session:
        result = await session.execute(
            text(
                """
                INSERT INTO ingestion_run (source_id, started_at, status, request_fingerprint)
                VALUES (:source_id, now(), 'RUNNING', :fingerprint)
                RETURNING id::text
                """
            ),
            {"source_id": SOURCE_ID, "fingerprint": fingerprint},
        )
        return str(result.scalar_one())


async def _close_ingestion_run(
    run_id: str, *, status: str, record_count: int, error: dict[str, object] | None
) -> None:
    async with get_db_session() as session:
        await session.execute(
            text(
                """
                UPDATE ingestion_run
                   SET finished_at = now(), status = :status,
                       record_count = :record_count,
                       error_json = CAST(:error AS jsonb)
                 WHERE id = CAST(:run_id AS uuid)
                """
            ),
            {
                "run_id": run_id,
                "status": status,
                "record_count": record_count,
                "error": json.dumps(error, allow_nan=False) if error is not None else None,
            },
        )


async def _insert_or_get_artifact(
    *,
    run_id: str,
    source_uri: str,
    retrieved_at: datetime,
    content_sha256: str,
    object_uri: str,
    attribution: str,
) -> tuple[str, bool]:
    """Record the artifact once; identical bytes reuse the existing row."""
    provenance = {
        "fetched_by": "backend.ingestion.socrates_service",
        "usage_policy": (
            "CelesTrak usage policy: stop immediately on any non-200; "
            "bulk file at most once per feed update."
        ),
        "attribution": attribution,
    }
    async with get_db_session() as session:
        inserted = await session.execute(
            text(
                """
                INSERT INTO raw_artifact (
                    source_id, ingestion_run_id, retrieved_at, source_uri,
                    content_sha256, media_type, object_uri, provenance_json
                )
                VALUES (
                    :source_id, CAST(:run_id AS uuid), :retrieved_at, :source_uri,
                    :content_sha256, 'text/csv', :object_uri,
                    CAST(:provenance AS jsonb)
                )
                ON CONFLICT (source_id, content_sha256) DO NOTHING
                RETURNING id::text
                """
            ),
            {
                "source_id": SOURCE_ID,
                "run_id": run_id,
                "retrieved_at": retrieved_at,
                "source_uri": source_uri,
                "content_sha256": content_sha256,
                "object_uri": object_uri,
                "provenance": json.dumps(provenance, allow_nan=False),
            },
        )
        row = inserted.scalar_one_or_none()
        if row is not None:
            return str(row), True

        existing = await session.execute(
            text(
                """
                SELECT id::text FROM raw_artifact
                WHERE source_id = :source_id AND content_sha256 = :content_sha256
                """
            ),
            {"source_id": SOURCE_ID, "content_sha256": content_sha256},
        )
        return str(existing.scalar_one()), False


async def _snapshot_exists(event_id: str, input_hash: str) -> bool:
    """Whether this event already carries a snapshot from these exact bytes."""
    async with get_db_session() as session:
        result = await session.execute(
            text(
                """
                SELECT 1 FROM conjunction_snapshot
                WHERE event_id = CAST(:event_id AS uuid) AND input_hash = :input_hash
                LIMIT 1
                """
            ),
            {"event_id": event_id, "input_hash": input_hash},
        )
        return result.scalar_one_or_none() is not None


def _snapshot_metrics(
    conjunction: SocratesConjunction, artifact_id: str, source_grade: str
) -> dict[str, object]:
    """Shape one row for append_snapshot's bind list.

    Every channel states its origin. The PC channel carries an explicit refusal:
    SOCRATES provides no collision probability, and that absence is a fact about
    the source worth recording on every row it produced.
    """
    return {
        "miss_distance_m": conjunction.tca_range_km * 1000.0,
        "relative_speed_mps": conjunction.relative_speed_km_s * 1000.0,
        # CelesTrak's numbers, not our TCA refinement.
        "geometry_basis": GEOMETRY_BASIS_EXTERNAL,
        "pc": None,
        "pc_method": None,
        "pc_status": "NOT_COMPUTED",
        "pc_unavailable_reason": _PC_UNAVAILABLE_REASON,
        "covariance_status": "INSUFFICIENT_DATA",
        **conjunction.to_metric_payload(artifact_id=artifact_id),
        "primary_covariance": None,
        "secondary_covariance": None,
        "dilution_state": None,
        # NOT NULL boolean that describes OUR TCA refinement, which never ran on
        # an external row. False is the only representable value; the provenance
        # payload states the flag is inapplicable so nobody reads it as a result.
        "boundary_flag": False,
        "source_grade": source_grade,
    }


async def persist_socrates_result(
    result: SocratesResult,
    *,
    store: RawArtifactStore,
    repository: ConjunctionRepository | None = None,
    source_grade: str = SOURCE_GRADE_LIVE,
    artifact_attribution: str = LIVE_ARTIFACT_ATTRIBUTION,
) -> SocratesPersistOutcome:
    """Write one parsed SOCRATES product into the conjunction store.

    ``source_grade`` and ``artifact_attribution`` exist so tests can mark their
    rows and their artifact as simulation instead of impersonating the live
    feed. Production callers leave both defaults.
    """
    repository = repository or ConjunctionRepository()
    run_id = await _open_ingestion_run(result.raw_sha256)

    try:
        outcome = await _persist(
            result,
            run_id=run_id,
            store=store,
            repository=repository,
            source_grade=source_grade,
            artifact_attribution=artifact_attribution,
        )
    except Exception as error:  # noqa: BLE001 - the run row must record the failure
        await _close_ingestion_run(
            run_id,
            status="FAILED",
            record_count=0,
            error={"type": type(error).__name__, "message": str(error)[:2000]},
        )
        raise

    await _close_ingestion_run(
        run_id,
        status="PARTIAL" if outcome.tca_parse_failures else "SUCCEEDED",
        record_count=outcome.snapshots_written,
        error=(
            {"tca_parse_failure_count": len(outcome.tca_parse_failures)}
            if outcome.tca_parse_failures
            else None
        ),
    )
    return outcome


async def _persist(
    result: SocratesResult,
    *,
    run_id: str,
    store: RawArtifactStore,
    repository: ConjunctionRepository,
    source_grade: str,
    artifact_attribution: str,
) -> SocratesPersistOutcome:
    stored = store.preserve(
        STORAGE_KEY, result.retrieved_at, result.raw.content, "text/csv"
    )
    artifact_id, artifact_created = await _insert_or_get_artifact(
        run_id=run_id,
        source_uri=result.source_uri,
        retrieved_at=result.retrieved_at,
        content_sha256=stored.content_sha256,
        object_uri=stored.object_uri,
        attribution=artifact_attribution,
    )

    # Validate every timestamp before the first write, so a malformed cell is a
    # counted skip rather than a mid-run abort with rows already committed.
    parsed_tca: dict[int, datetime] = {}
    tca_failures: list[dict[str, str]] = []
    for index, conjunction in enumerate(result.conjunctions):
        try:
            parsed_tca[index] = _tca_utc(conjunction.tca)
        except ValueError as error:
            tca_failures.append({"tca": conjunction.tca, "reason": str(error)})

    all_ids = sorted(
        {c.primary_catalog_id for c in result.conjunctions}
        | {c.secondary_catalog_id for c in result.conjunctions}
    )
    resolved = await repository.resolve_objects_by_catalog(all_ids)

    events: list[str] = []
    seen_events: set[str] = set()
    snapshots = 0
    duplicates = 0
    outside = 0

    for index, conjunction in enumerate(result.conjunctions):
        tca = parsed_tca.get(index)
        if tca is None:
            continue
        primary = resolved.get(conjunction.primary_catalog_id)
        secondary = resolved.get(conjunction.secondary_catalog_id)
        if primary is None or secondary is None:
            outside += 1
            continue

        first, second = _canonical_pair(primary, secondary)
        event_id = await repository.upsert_event(
            primary_object_id=first,
            secondary_object_id=second,
            source_event_id=_source_event_id(tca),
            tca=tca,
            screening_run_id=None,
        )
        if event_id not in seen_events:
            seen_events.add(event_id)
            events.append(event_id)

        if await _snapshot_exists(event_id, result.raw_sha256):
            duplicates += 1
            continue

        provenance = {
            "source_id": SOURCE_ID,
            "source_uri": result.source_uri,
            "retrieved_at": result.retrieved_at.isoformat(),
            "raw_sha256": result.raw_sha256,
            "raw_artifact_id": artifact_id,
            "ingestion_run_id": run_id,
            "row": {
                "primary_catalog_id": conjunction.primary_catalog_id,
                "secondary_catalog_id": conjunction.secondary_catalog_id,
                "tca": conjunction.tca,
                "max_probability": conjunction.max_probability,
                "dilution_km": conjunction.dilution_km,
            },
            "assumptions": (
                "CelesTrak SOCRATES maximum probability (Alfano): screening "
                "bound under CelesTrak's declared uncertainty, not an "
                "operational collision probability."
            ),
            "geometry_note": (
                "miss_distance_m and relative_speed_mps are CelesTrak's published "
                "TCA_RANGE and TCA_RELATIVE_SPEED converted to SI; no Aetherus "
                "propagation or TCA refinement ran on this row"
            ),
            "tca_boundary_flag_note": (
                "inapplicable: the boundary flag describes Aetherus TCA "
                "refinement, which does not run on externally published rows"
            ),
            "validation_state": "PUBLIC_SCREENING",
            "screening_run_id": None,
        }
        await repository.append_snapshot(
            event_id=event_id,
            snapshot_at=result.retrieved_at,
            metrics=_snapshot_metrics(conjunction, artifact_id, source_grade),
            provenance_payload=provenance,
            model_version=MODEL_VERSION,
            input_hash=result.raw_sha256,
        )
        snapshots += 1

    warnings: list[str] = []
    if not result.conjunctions:
        warnings.append("feed parsed to zero conjunctions; nothing was written")
    if snapshots == 0 and duplicates == 0 and result.conjunctions:
        warnings.append(
            "no SOCRATES pair matched the stored catalogue; the feed covers the "
            "full public catalogue and we hold a subset, but zero overlap on a "
            "debris-heavy catalogue is unusual and worth checking"
        )
    if duplicates and snapshots == 0:
        warnings.append(
            "these exact bytes were already ingested; nothing new was written"
        )

    return SocratesPersistOutcome(
        ingestion_run_id=run_id,
        artifact_id=artifact_id,
        artifact_created=artifact_created,
        raw_sha256=result.raw_sha256,
        source_uri=result.source_uri,
        conjunction_rows=len(result.conjunctions),
        events_written=len(events),
        snapshots_written=snapshots,
        snapshots_skipped_duplicate=duplicates,
        rows_outside_catalog=outside,
        tca_parse_failures=tuple(tca_failures),
        csv_skipped_rows=len(result.skipped_rows),
        catalog_ids_seen=len(all_ids),
        catalog_ids_resolved=len(resolved),
        event_ids=tuple(events),
        warnings=tuple(warnings),
    )


async def enforce_poll_interval(now: datetime | None = None) -> None:
    """Refuse a live fetch inside the registry's polling window.

    The registry row (migration 017) records ``max_poll_seconds`` as the
    mechanical form of CelesTrak's once-per-feed-update rule. The most recent
    genuine retrieval is the newest artifact for this source; fetching again
    before the window has elapsed re-downloads 16.5 MB the policy says we may
    take once per update.
    """
    now = now or datetime.now(UTC)
    async with get_db_session() as session:
        window = (
            await session.execute(
                text("SELECT max_poll_seconds FROM data_source WHERE id = :source_id"),
                {"source_id": SOURCE_ID},
            )
        ).scalar_one_or_none()
        latest = (
            await session.execute(
                text(
                    "SELECT max(retrieved_at) FROM raw_artifact WHERE source_id = :source_id"
                ),
                {"source_id": SOURCE_ID},
            )
        ).scalar_one_or_none()
    if window is None or latest is None:
        return
    next_allowed = latest + timedelta(seconds=int(window))
    if now < next_allowed:
        raise SocratesUsagePolicyError(
            "SOCRATES was fetched inside the registry polling window; wait for the "
            "next feed update rather than re-downloading the bulk file",
            {
                "source_id": SOURCE_ID,
                "last_retrieved_at": latest.isoformat(),
                "max_poll_seconds": int(window),
                "next_allowed_at": next_allowed.isoformat(),
            },
        )


async def run_socrates_ingestion(
    *,
    store: RawArtifactStore,
    repository: ConjunctionRepository | None = None,
    client: LiveProviderClient | None = None,
    enforce_policy: bool = True,
) -> SocratesPersistOutcome:
    """Fetch the live bulk product once and persist it.

    The client never retries: CelesTrak's usage policy requires stopping on any
    non-200, and ``fetch_socrates`` refuses a retrying client outright. The
    polling window from the source registry is enforced before any request.
    """
    if enforce_policy:
        await enforce_poll_interval()
    client = client or LiveProviderClient(
        source_id=SOURCE_ID,
        max_retries=0,
        # ~16.5 MB over a sometimes-slow public host; the default 15s is for
        # small JSON endpoints.
        timeout_seconds=180.0,
    )
    result = await fetch_socrates(client)
    return await persist_socrates_result(result, store=store, repository=repository)
