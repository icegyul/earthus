"""PostgreSQL access for conjunction screening runs, events, and snapshots."""

import json
from datetime import datetime
from typing import Any

from sqlalchemy import text

from backend.database import get_db_session
from backend.orbit.models import MeanElements
from backend.benefit.models import SIMULATION_SOURCE_GRADES
from backend.config import settings
from backend.orbit.repository import _json_dict, _numeric_elements

SELECTION_POLICIES = frozenset({"EPOCH_DESC", "CATALOG_ID_ASC"})

_METRIC_COLUMN = {
    "PC": "cs.pc",
    "MAX_PC": "cs.max_pc",
    "MISS_DISTANCE": "cs.miss_distance_m",
}


class ConjunctionRepository:
    """Persist screening runs and append-only snapshots; serve stored results only."""

    async def load_screenable_solutions(
        self,
        max_objects: int,
        catalog_ids: list[str] | None = None,
        policy: str | None = None,
    ) -> list[dict[str, Any]]:
        """Load each canonical object's newest stored OMM solution.

        ``catalog_ids`` bounds the screening population to an explicit set. The
        pair count grows with the square of the population, so screening the
        whole catalogue to answer a question about six objects is the dominant
        cost at real debris scale; callers that know their scope say so, and the
        run records that it was scoped so nobody reads it as full coverage.

        ``policy`` decides WHICH objects an unscoped call retains once the
        catalogue exceeds ``max_objects`` (about a tenth of it since the
        active-satellite ingestion). EPOCH_DESC takes the freshest solutions and
        excludes simulation grades; CATALOG_ID_ASC is the historical ordering.
        A scoped call ignores the policy entirely: the caller named its objects
        and gets exactly those, probes included, because test corpora are
        legitimately simulation-graded.
        """
        policy = (policy or settings.screening_selection_policy).upper()
        if policy not in SELECTION_POLICIES:
            raise ValueError(f"unknown screening selection policy: {policy!r}")
        scoped = catalog_ids is not None
        order_by = (
            "os.epoch DESC, so.catalog_id ASC"
            if policy == "EPOCH_DESC" and not scoped
            else "so.catalog_id ASC"
        )
        exclude_simulation = policy == "EPOCH_DESC" and not scoped
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    f"""
                    SELECT
                        so.id::text AS object_id,
                        so.catalog_id,
                        os.id::text AS orbit_solution_id,
                        os.epoch,
                        os.frame,
                        os.time_system,
                        os.theory,
                        os.mean_elements_json,
                        os.quality_json,
                        os.source_id,
                        ra.content_sha256,
                        ra.retrieved_at
                    FROM space_object AS so
                    JOIN LATERAL (
                        SELECT * FROM orbit_solution
                        WHERE object_id = so.id AND format = 'OMM'
                        ORDER BY epoch DESC, created_at DESC
                        LIMIT 1
                    ) AS os ON true
                    LEFT JOIN raw_artifact AS ra ON ra.id = os.source_artifact_id
                    WHERE (:unscoped OR so.catalog_id = ANY(:catalog_ids))
                      AND (
                        NOT :exclude_simulation
                        OR upper(coalesce(os.quality_json->>'source_grade', ''))
                           <> ALL(:simulation_grades)
                      )
                    ORDER BY {order_by}
                    LIMIT :limit
                    """
                ),
                {
                    "limit": max_objects,
                    "unscoped": not scoped,
                    "catalog_ids": list(catalog_ids or []),
                    "exclude_simulation": exclude_simulation,
                    "simulation_grades": sorted(SIMULATION_SOURCE_GRADES),
                },
            )
            return [dict(row) for row in result.mappings().all()]

    @staticmethod
    def selection_rule(policy: str | None, scoped: bool) -> str:
        """Human-readable statement of what the population bound retained."""
        if scoped:
            return "explicit catalog_ids (caller-defined population; policy not applied)"
        policy = (policy or settings.screening_selection_policy).upper()
        if policy == "EPOCH_DESC":
            return (
                "freshest orbit-solution epoch first, simulation grades excluded "
                "(stale elements produce fictional conjunctions)"
            )
        return "catalog_id ASC (lowest identifiers first; historical ordering)"

    async def count_screenable_objects(self) -> int:
        """How many canonical objects hold a screenable OMM solution.

        Exists so a bounded screening can say "N of M" instead of letting a
        truncated population read as the whole catalogue — at ~19k objects the
        default 2,000-object bound covers a tenth of it.
        """
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT count(*) FROM space_object AS so
                    WHERE EXISTS (
                        SELECT 1 FROM orbit_solution
                        WHERE object_id = so.id AND format = 'OMM'
                    )
                    """
                )
            )
            return int(result.scalar_one())

    async def create_screening_run(
        self,
        window_start: datetime,
        window_stop: datetime,
        config_payload: dict[str, Any],
        config_hash: str,
        model_id: str,
        model_version: str,
        input_hash: str,
    ) -> str:
        """Open one RUNNING screening-run row and return its identifier."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    INSERT INTO screening_run (
                        window_start, window_stop, config_json, config_hash,
                        model_id, model_version, input_hash, status, data_status
                    )
                    VALUES (
                        :window_start, :window_stop, CAST(:config_json AS jsonb),
                        :config_hash, :model_id, :model_version, :input_hash,
                        'RUNNING', 'UNAVAILABLE'
                    )
                    RETURNING id::text
                    """
                ),
                {
                    "window_start": window_start,
                    "window_stop": window_stop,
                    "config_json": json.dumps(config_payload),
                    "config_hash": config_hash,
                    "model_id": model_id,
                    "model_version": model_version,
                    "input_hash": input_hash,
                },
            )
            return str(result.scalar_one())

    async def finalize_screening_run(
        self,
        run_id: str,
        *,
        status: str,
        data_status: str,
        status_reason: str | None,
        objects_considered: int,
        objects_propagated: int,
        pairs_before_screening: int,
        pairs_after_coarse: int,
        propagation_failure_count: int,
        propagation_failures: list[dict[str, Any]],
        events_found: int,
        validation_dataset_id: str | None,
        validation_dataset_version: str | None,
    ) -> None:
        """Record the terminal job state; snapshots stay untouched."""
        async with get_db_session() as session:
            await session.execute(
                text(
                    """
                    UPDATE screening_run SET
                        finished_at = now(),
                        status = :status,
                        data_status = :data_status,
                        status_reason = :status_reason,
                        objects_considered = :objects_considered,
                        objects_propagated = :objects_propagated,
                        pairs_before_screening = :pairs_before,
                        pairs_after_coarse = :pairs_after,
                        propagation_failure_count = :failure_count,
                        propagation_failures_json = CAST(:failures AS jsonb),
                        events_found = :events_found,
                        validation_dataset_id = :validation_dataset_id,
                        validation_dataset_version = :validation_dataset_version
                    WHERE id = CAST(:run_id AS uuid)
                    """
                ),
                {
                    "run_id": run_id,
                    "status": status,
                    "data_status": data_status,
                    "status_reason": status_reason,
                    "objects_considered": objects_considered,
                    "objects_propagated": objects_propagated,
                    "pairs_before": pairs_before_screening,
                    "pairs_after": pairs_after_coarse,
                    "failure_count": propagation_failure_count,
                    "failures": json.dumps(propagation_failures),
                    "events_found": events_found,
                    "validation_dataset_id": validation_dataset_id,
                    "validation_dataset_version": validation_dataset_version,
                },
            )

    async def resolve_objects_by_catalog(self, catalog_ids: list[str]) -> dict[str, str]:
        """Map catalog identifiers onto canonical object UUID strings."""
        if not catalog_ids:
            return {}
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT catalog_id, id::text FROM space_object
                    WHERE catalog_id = ANY(:catalog_ids)
                    """
                ),
                {"catalog_ids": catalog_ids},
            )
            return {str(row[0]): str(row[1]) for row in result.fetchall()}

    async def upsert_event(
        self,
        primary_object_id: str,
        secondary_object_id: str,
        source_event_id: str,
        tca: datetime,
        screening_run_id: str,
    ) -> str:
        """Return one stable event identity; refreshed runs reuse the same event."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    INSERT INTO conjunction_event (
                        primary_object_id, secondary_object_id, source_event_id,
                        tca, first_seen_at, last_seen_at, status, screening_run_id
                    )
                    VALUES (
                        CAST(:primary_id AS uuid), CAST(:secondary_id AS uuid),
                        :source_event_id, :tca, now(), now(), 'OPEN',
                        CAST(:run_id AS uuid)
                    )
                    ON CONFLICT (primary_object_id, secondary_object_id, source_event_id)
                    DO UPDATE SET
                        tca = EXCLUDED.tca,
                        last_seen_at = now(),
                        screening_run_id = EXCLUDED.screening_run_id
                    RETURNING id::text
                    """
                ),
                {
                    "primary_id": primary_object_id,
                    "secondary_id": secondary_object_id,
                    "source_event_id": source_event_id,
                    "tca": tca,
                    "run_id": screening_run_id,
                },
            )
            return str(result.scalar_one())

    async def append_snapshot(
        self,
        event_id: str,
        snapshot_at: datetime,
        metrics: dict[str, Any],
        provenance_payload: dict[str, Any],
        model_version: str,
        input_hash: str,
    ) -> str:
        """Append one immutable snapshot row; updates and deletes are blocked in SQL."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    INSERT INTO conjunction_snapshot (
                        event_id, snapshot_at,
                        miss_distance_m, relative_speed_mps,
                        pc, pc_method, pc_status, pc_unavailable_reason,
                        covariance_status,
                        max_pc, max_pc_method, max_pc_basis, max_pc_status,
                        max_pc_artifact_id, geometry_basis,
                        primary_covariance_json, secondary_covariance_json,
                        dilution_state, tca_boundary_flag,
                        source_grade, validation_state,
                        screening_run_id, model_version, input_hash, provenance_json
                    )
                    VALUES (
                        CAST(:event_id AS uuid), :snapshot_at,
                        :miss_distance_m, :relative_speed_mps,
                        :pc, :pc_method, :pc_status, :pc_unavailable_reason,
                        :covariance_status,
                        :max_pc, :max_pc_method, :max_pc_basis, :max_pc_status,
                        CAST(:max_pc_artifact_id AS uuid), :geometry_basis,
                        CAST(:primary_covariance AS jsonb), CAST(:secondary_covariance AS jsonb),
                        :dilution_state, :boundary_flag,
                        :source_grade, :validation_state,
                        CAST(:run_id AS uuid), :model_version, :input_hash,
                        CAST(:provenance AS jsonb)
                    )
                    RETURNING id::text
                    """
                ),
                {
                    "event_id": event_id,
                    "snapshot_at": snapshot_at,
                    # 공개 GP 스크리닝은 MAX_PC 를 산출하지 않는다. 근거 없는 값이
                    # 흘러들지 못하도록 기본값을 명시하고, 실제로 산출·수집한
                    # 호출자만 metrics 로 덮어쓴다. (DB 제약이 최종 방어선이다.)
                    "max_pc_basis": None,
                    "max_pc_status": "NOT_COMPUTED",
                    "max_pc_artifact_id": None,
                    # 기하 근거도 호출자가 명시해야 한다. 기본 None 은 "기록 안 됨"이며
                    # 페이로드가 이를 BASIS_UNRECORDED 로 표면화한다 — 유리한 추론 금지.
                    "geometry_basis": None,
                    **metrics,
                    "provenance": json.dumps(provenance_payload),
                    "validation_state": provenance_payload.get(
                        "validation_state", "PUBLIC_SCREENING"
                    ),
                    "run_id": provenance_payload.get("screening_run_id"),
                    "model_version": model_version,
                    "input_hash": input_hash,
                },
            )
            return str(result.scalar_one())

    async def count_events(self) -> int:
        async with get_db_session() as session:
            result = await session.execute(text("SELECT count(*) FROM conjunction_event"))
            return int(result.scalar_one())

    async def count_snapshots(self) -> int:
        async with get_db_session() as session:
            result = await session.execute(text("SELECT count(*) FROM conjunction_snapshot"))
            return int(result.scalar_one())

    async def append_only_trigger_present(self) -> bool:
        """Confirm the append-only trigger exists on conjunction_snapshot."""
        async with get_db_session() as session:
            trigger = await session.execute(
                text(
                    """
                    SELECT tgname FROM pg_trigger
                    WHERE tgrelid = 'conjunction_snapshot'::regclass
                      AND tgname = 'conjunction_snapshot_append_only'
                      AND NOT tgisinternal
                    """
                )
            )
            return trigger.first() is not None

    async def latest_run_summary(self) -> dict[str, Any] | None:
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT * FROM screening_run
                    ORDER BY started_at DESC, id LIMIT 1
                    """
                )
            )
            row = result.mappings().one_or_none()
        return _run_dict(dict(row)) if row else None

    async def list_conjunctions(
        self,
        *,
        object_ref: str | None,
        start: datetime | None,
        stop: datetime | None,
        source_grade: str | None,
        metric_type: str | None,
        threshold_min: float | None,
        threshold_max: float | None,
        limit: int,
    ) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
        """Serve stored events joined to their newest snapshot only."""
        filters = ["ce.status <> 'RETIRED'"]
        params: dict[str, Any] = {"limit": limit}
        if source_grade is None:
            # Probe/simulation rows are permanent (append-only) and must never
            # read as observed conjunctions by default. They remain reachable by
            # asking for their grade explicitly. (Adversarial review 2026-09-02.)
            filters.append(
                "(cs.source_grade IS NULL OR upper(cs.source_grade) <> ALL(:simulation_grades))"
            )
            params["simulation_grades"] = sorted(SIMULATION_SOURCE_GRADES)
        if object_ref is not None:
            filters.append(
                "(so_primary.catalog_id = :object_ref OR so_secondary.catalog_id = :object_ref"
                " OR ce.primary_object_id::text = :object_ref"
                " OR ce.secondary_object_id::text = :object_ref)"
            )
            params["object_ref"] = object_ref
        if start is not None:
            filters.append("ce.tca >= :start")
            params["start"] = start
        if stop is not None:
            filters.append("ce.tca <= :stop")
            params["stop"] = stop
        if source_grade is not None:
            filters.append("cs.source_grade = :source_grade")
            params["source_grade"] = source_grade
        if metric_type is not None:
            column = _METRIC_COLUMN.get(metric_type)
            if column is None:
                raise ValueError(f"Unsupported metric_type {metric_type}")
            if metric_type == "PC":
                filters.append("cs.pc_status = 'COMPUTED'")
            else:
                filters.append(f"{column} IS NOT NULL")
            if threshold_min is not None:
                filters.append(f"{column} >= :threshold_min")
                params["threshold_min"] = threshold_min
            if threshold_max is not None:
                filters.append(f"{column} <= :threshold_max")
                params["threshold_max"] = threshold_max

        query = text(
            f"""
            WITH latest_snapshot AS (
                SELECT DISTINCT ON (event_id) *
                FROM conjunction_snapshot
                ORDER BY event_id, snapshot_at DESC
            )
            SELECT
                ce.id::text AS event_id,
                ce.tca,
                ce.source_event_id,
                ce.first_seen_at,
                ce.last_seen_at,
                ce.status AS event_status,
                so_primary.catalog_id AS primary_catalog_id,
                so_primary.canonical_name AS primary_name,
                so_primary.id::text AS primary_object_id,
                so_secondary.catalog_id AS secondary_catalog_id,
                so_secondary.canonical_name AS secondary_name,
                so_secondary.id::text AS secondary_object_id,
                cs.id::text AS snapshot_id,
                cs.snapshot_at,
                cs.miss_distance_m,
                cs.relative_speed_mps,
                cs.pc, cs.pc_method, cs.pc_status, cs.pc_unavailable_reason,
                cs.covariance_status,
                cs.max_pc, cs.max_pc_method,
                cs.max_pc_basis, cs.max_pc_status,
                cs.geometry_basis,
                -- 외부에서 관측한 MAX_PC 는 출처 없이는 방어할 수 없다. 궤도해의
                -- 아티팩트와 별개일 수 있으므로 전용 조인으로 가져온다.
                max_pc_ra.source_id AS max_pc_source_id,
                max_pc_ra.content_sha256 AS max_pc_content_sha256,
                cs.dilution_state, cs.tca_boundary_flag,
                cs.source_grade, cs.validation_state,
                cs.model_version, cs.input_hash, cs.provenance_json
            FROM conjunction_event AS ce
            JOIN space_object AS so_primary ON so_primary.id = ce.primary_object_id
            JOIN space_object AS so_secondary ON so_secondary.id = ce.secondary_object_id
            LEFT JOIN latest_snapshot AS cs ON cs.event_id = ce.id
            LEFT JOIN raw_artifact AS max_pc_ra ON max_pc_ra.id = cs.max_pc_artifact_id
            WHERE {" AND ".join(filters)}
            ORDER BY ce.tca ASC
            LIMIT :limit
            """
        )
        async with get_db_session() as session:
            result = await session.execute(query, params)
            rows = [dict(row) for row in result.mappings().all()]
        return rows, None


def to_mean_elements(row: dict[str, Any]) -> tuple[MeanElements, dict[str, Any]]:
    """Build the P2 canonical element set plus quality metadata from one row."""
    quality = _json_dict(row.get("quality_json"))
    elements = MeanElements(
        catalog_id=str(row["catalog_id"]),
        epoch=row["epoch"],
        frame=str(row["frame"]),
        time_system=str(row["time_system"]),
        theory=str(row["theory"]),
        mean_elements=_numeric_elements(_json_dict(row.get("mean_elements_json"))),
    )
    return elements, quality


def _run_dict(row: dict[str, Any]) -> dict[str, Any]:
    payload = dict(row)
    for key, value in list(payload.items()):
        if isinstance(value, datetime):
            payload[key] = value.isoformat()
            continue
        if key in {"config_json", "error_json"} and not isinstance(value, dict | list):
            payload[key] = _json_dict(value)
        elif key == "propagation_failures_json" and not isinstance(value, list):
            parsed = _json_dict(value)
            payload[key] = parsed if parsed else []
    payload["id"] = str(payload["id"])
    return payload
