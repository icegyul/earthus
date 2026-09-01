"""PostgreSQL persistence for baseline graphs, scenarios, runs, and benefits.

Every scientific record is append-only; the migration-level triggers reject
UPDATE/DELETE, and this repository only ever INSERTs or reads.
"""

import json
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import text

from backend.benefit.errors import BaselineMissingError
from backend.benefit.models import (
    BeneficiaryAttribution,
    RiskEdge,
    RiskGraph,
    build_graph_hash,
)
from backend.database import get_db_session


def _json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


class BenefitRepository:
    """Durable storage for the P5 benefit engine."""

    async def resolve_object(self, object_ref: str) -> dict[str, Any] | None:
        """Resolve a catalog_id or canonical UUID to the canonical identity."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT id::text AS object_id, catalog_id, canonical_name
                    FROM space_object
                    WHERE catalog_id = :object_ref OR id::text = :object_ref
                    LIMIT 1
                    """
                ),
                {"object_ref": object_ref},
            )
            row = result.mappings().one_or_none()
        return dict(row) if row else None

    async def load_operational_event_rows(
        self,
        horizon_start: datetime,
        horizon_end: datetime,
        max_objects: int,
        validation_state: str = "PUBLIC_SCREENING",
    ) -> list[dict[str, Any]]:
        """Latest snapshot per non-retired event whose TCA lies in the horizon.

        Probe/simulation residues left by append-only trigger tests are
        excluded by source grade so they can never seed an operational graph.
        """
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    WITH latest_snapshot AS (
                        SELECT DISTINCT ON (event_id) *
                        FROM conjunction_snapshot
                        ORDER BY event_id, snapshot_at DESC
                    )
                    SELECT
                        ce.id::text AS event_id,
                        ce.primary_object_id::text AS primary_object_id,
                        ce.secondary_object_id::text AS secondary_object_id,
                        ce.tca,
                        cs.id::text AS snapshot_id,
                        cs.snapshot_at,
                        cs.miss_distance_m,
                        cs.relative_speed_mps,
                        cs.pc, cs.pc_status, cs.pc_unavailable_reason,
                        cs.max_pc,
                        cs.covariance_status,
                        cs.tca_boundary_flag,
                        cs.source_grade,
                        cs.validation_state,
                        cs.model_version,
                        cs.input_hash
                    FROM conjunction_event AS ce
                    JOIN latest_snapshot AS cs ON cs.event_id = ce.id
                    WHERE ce.status <> 'RETIRED'
                      AND cs.validation_state = :validation_state
                      AND (cs.source_grade IS NULL OR UPPER(cs.source_grade) NOT IN (
                          'PROBE', 'EVIDENCE_PROBE', 'SIMULATION_ONLY'
                      ))
                      AND ce.tca >= :horizon_start
                      AND ce.tca <= :horizon_end
                    ORDER BY ce.tca ASC, ce.id
                    LIMIT :row_cap
                    """
                ),
                {
                    "horizon_start": horizon_start,
                    "horizon_end": horizon_end,
                    "validation_state": validation_state,
                    "row_cap": max_objects * 8,
                },
            )
            return [dict(row) for row in result.mappings().all()]

    async def load_object_envelopes(self, max_objects: int) -> dict[str, tuple[float, float]]:
        """Perigee/apogee envelopes for shell-overlap candidate selection."""
        from backend.benefit.graph import orbital_envelope

        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT so.id::text AS object_id,
                           os.mean_elements_json
                    FROM space_object AS so
                    JOIN LATERAL (
                        SELECT mean_elements_json FROM orbit_solution
                        WHERE object_id = so.id AND format = 'OMM'
                        ORDER BY epoch DESC, created_at DESC
                        LIMIT 1
                    ) AS os ON true
                    ORDER BY so.id
                    LIMIT :limit
                    """
                ),
                {"limit": max_objects},
            )
            envelopes: dict[str, tuple[float, float]] = {}
            for row in result.mappings().all():
                elements = row.get("mean_elements_json") or {}
                if not isinstance(elements, dict):
                    continue
                envelope = orbital_envelope(
                    elements.get("mean_motion_rev_per_day"),
                    elements.get("eccentricity"),
                )
                if envelope is not None:
                    envelopes[str(row["object_id"])] = envelope
        return envelopes

    async def insert_baseline_snapshot(
        self,
        *,
        snapshot_id: str,
        horizon_start: datetime,
        horizon_end: datetime,
        event_count: int,
        edge_count: int,
        object_count: int,
        model_id: str,
        model_version: str,
        config_payload: dict[str, Any],
        config_hash: str,
        input_hash: str,
        graph_hash: str,
        data_status: str,
        status_reason: str | None,
        validation_state: str,
        provenance: dict[str, Any],
    ) -> str:
        async with get_db_session() as session:
            await session.execute(
                text(
                    """
                    INSERT INTO baseline_graph_snapshot (
                        id, horizon_start, horizon_end,
                        event_count, edge_count, object_count,
                        model_id, model_version,
                        config_json, config_hash, input_hash, graph_hash,
                        data_status, status_reason, validation_state, provenance_json
                    ) VALUES (
                        :id, :horizon_start, :horizon_end,
                        :event_count, :edge_count, :object_count,
                        :model_id, :model_version,
                        CAST(:config_json AS jsonb), :config_hash, :input_hash, :graph_hash,
                        :data_status, :status_reason, :validation_state,
                        CAST(:provenance AS jsonb)
                    )
                    """
                ),
                {
                    "id": snapshot_id,
                    "horizon_start": horizon_start,
                    "horizon_end": horizon_end,
                    "event_count": event_count,
                    "edge_count": edge_count,
                    "object_count": object_count,
                    "model_id": model_id,
                    "model_version": model_version,
                    "config_json": _json(config_payload),
                    "config_hash": config_hash,
                    "input_hash": input_hash,
                    "graph_hash": graph_hash,
                    "data_status": data_status,
                    "status_reason": status_reason,
                    "validation_state": validation_state,
                    "provenance": _json(provenance),
                },
            )
        return snapshot_id

    async def insert_risk_edges(
        self, baseline_id: str, edges: list[RiskEdge], validation_state: str
    ) -> int:
        if not edges:
            return 0
        baseline = await self.get_baseline_row(baseline_id)
        if baseline is None:
            raise BaselineMissingError(
                "Cannot attach edges to a nonexistent baseline graph",
                {"baseline_snapshot_id": baseline_id},
            )
        payload: list[dict[str, Any]] = []
        for edge in sorted(edges, key=lambda item: (*item.identity_key(),)):
            payload.append(
                {
                    "baseline_id": baseline_id,
                    "object_a": edge.object_a,
                    "object_b": edge.object_b,
                    "metric_type": edge.metric_type,
                    "metric_value": edge.metric_value,
                    "feature_json": _json(edge.features.to_payload()),
                    "provenance_json": _json(edge.provenance),
                    "validation_state": validation_state,
                    "horizon_start": _as_datetime(baseline["horizon_start"]),
                    "horizon_end": _as_datetime(baseline["horizon_end"]),
                }
            )
        async with get_db_session() as session:
            await session.execute(
                text(
                    """
                    INSERT INTO risk_edge (
                        baseline_snapshot_id, object_a, object_b,
                        metric_type, metric_value,
                        feature_json, provenance_json, validation_state,
                        horizon_start, horizon_end
                    ) VALUES (
                        :baseline_id,
                        CAST(:object_a AS uuid), CAST(:object_b AS uuid),
                        :metric_type, :metric_value,
                        CAST(:feature_json AS jsonb),
                        CAST(:provenance_json AS jsonb),
                        :validation_state,
                        :horizon_start, :horizon_end
                    )
                    ON CONFLICT (
                        baseline_snapshot_id, object_a, object_b,
                        metric_type, horizon_start, horizon_end
                    ) DO NOTHING
                    """
                ),
                payload,
            )
        return len(payload)

    async def get_baseline_row(self, snapshot_id: str) -> dict[str, Any] | None:
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT *, provenance_json AS provenance
                    FROM baseline_graph_snapshot
                    WHERE id = :snapshot_id
                    """
                ),
                {"snapshot_id": snapshot_id},
            )
            row = result.mappings().one_or_none()
        return _baseline_dict(dict(row)) if row else None

    async def latest_operational_baseline(self) -> dict[str, Any] | None:
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT *, provenance_json AS provenance
                    FROM baseline_graph_snapshot
                    WHERE validation_state = 'PUBLIC_SCREENING'
                      AND COALESCE(provenance_json->>'role', '') NOT LIKE 'SCENARIO_%'
                    ORDER BY created_at DESC, id
                    LIMIT 1
                    """
                )
            )
            row = result.mappings().one_or_none()
        return _baseline_dict(dict(row)) if row else None

    async def list_baselines(
        self, include_simulation: bool, limit: int
    ) -> list[dict[str, Any]]:
        # Scenario-role graphs (G0'/Gs persisted by physical counterfactual
        # runs) are queryable per scenario but never listed as baselines.
        role_filter = "COALESCE(provenance_json->>'role', '') NOT LIKE 'SCENARIO_%'"
        filters = (
            f"WHERE {role_filter}"
            if include_simulation
            else f"WHERE validation_state = 'PUBLIC_SCREENING' AND {role_filter}"
        )
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    f"""
                    SELECT id, created_at, horizon_start, horizon_end,
                           event_count, edge_count, object_count,
                           model_id, model_version, config_hash, input_hash,
                           graph_hash, data_status, status_reason,
                           validation_state, provenance_json AS provenance
                    FROM baseline_graph_snapshot
                    {filters}
                    ORDER BY created_at DESC, id
                    LIMIT :limit
                    """
                ),
                {"limit": limit},
            )
            return [_baseline_dict(dict(row)) for row in result.mappings().all()]

    async def load_baseline_graph(self, snapshot_id: str) -> RiskGraph | None:
        """Rebuild the immutable in-memory baseline graph from stored edges."""
        baseline = await self.get_baseline_row(snapshot_id)
        if baseline is None:
            return None
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT object_a::text AS object_a, object_b::text AS object_b,
                           metric_type, metric_value, feature_json, provenance_json
                    FROM risk_edge
                    WHERE baseline_snapshot_id = :snapshot_id
                    ORDER BY object_a::text, object_b::text, metric_type
                    """
                ),
                {"snapshot_id": snapshot_id},
            )
            rows = [dict(row) for row in result.mappings().all()]
        edges: list[RiskEdge] = []
        for row in rows:
            features = row["feature_json"] if isinstance(row["feature_json"], dict) else {}
            provenance = row["provenance_json"] if isinstance(row["provenance_json"], dict) else {}
            edges.append(
                RiskEdge(
                    object_a=str(row["object_a"]),
                    object_b=str(row["object_b"]),
                    metric_type=str(row["metric_type"]),
                    metric_value=float(row["metric_value"]),
                    features=_feature_from_payload(features),
                    provenance=provenance,
                )
            )
        return RiskGraph(
            snapshot_id=snapshot_id,
            horizon_start=_as_datetime(baseline["horizon_start"]),
            horizon_end=_as_datetime(baseline["horizon_end"]),
            edges=tuple(edges),
            graph_hash=build_graph_hash(edges),
        )

    async def count_baseline_edges(self, snapshot_id: str) -> int:
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    "SELECT count(*) FROM risk_edge WHERE baseline_snapshot_id = :snapshot_id"
                ),
                {"snapshot_id": snapshot_id},
            )
            return int(result.scalar_one())

    async def create_scenario(
        self,
        *,
        kind: str,
        target_object_id: str | None,
        baseline_snapshot_id: str,
        effective_time: datetime | None,
        parameters: dict[str, Any],
        assumptions: list[str],
        requested_metrics: list[str],
        model_version: str,
        input_hash: str,
        protected_object_id: str | None = None,
    ) -> str:
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    INSERT INTO intervention_scenario (
                        kind, target_object_id, protected_object_id,
                        baseline_snapshot_id, effective_time,
                        parameters, assumptions, status,
                        model_version, input_hash, requested_metrics
                    ) VALUES (
                        :kind, CAST(:target AS uuid), CAST(:protected AS uuid),
                        :baseline_id, :effective_time,
                        CAST(:parameters AS jsonb), CAST(:assumptions AS jsonb),
                        'DRAFT',
                        :model_version, :input_hash,
                        CAST(:requested_metrics AS jsonb)
                    )
                    RETURNING id::text
                    """
                ),
                {
                    "kind": kind,
                    "target": target_object_id,
                    "protected": protected_object_id,
                    "baseline_id": baseline_snapshot_id,
                    "effective_time": effective_time,
                    "parameters": _json(parameters),
                    "assumptions": _json(assumptions),
                    "model_version": model_version,
                    "input_hash": input_hash,
                    "requested_metrics": _json(requested_metrics),
                },
            )
            return str(result.scalar_one())

    async def object_identities(
        self, object_ids: list[str]
    ) -> dict[str, dict[str, Any]]:
        """Canonical catalog_id/name for a bounded id set (payload shaping)."""
        if not object_ids:
            return {}
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT id::text AS object_id, catalog_id, canonical_name
                    FROM space_object
                    WHERE id::text = ANY(:ids)
                    """
                ),
                {"ids": object_ids},
            )
            return {
                str(row["object_id"]): {
                    "catalog_id": row["catalog_id"],
                    "canonical_name": row["canonical_name"],
                }
                for row in result.mappings().all()
            }

    async def get_scenario(self, scenario_id: str) -> dict[str, Any] | None:
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT s.*,
                           so.catalog_id AS target_catalog_id,
                           so.canonical_name AS target_name,
                           b.validation_state AS baseline_validation_state,
                           b.data_status AS baseline_data_status,
                           b.edge_count AS baseline_edge_count,
                           b.graph_hash AS baseline_graph_hash,
                           b.horizon_start, b.horizon_end,
                           b.provenance_json AS baseline_provenance
                    FROM intervention_scenario AS s
                    LEFT JOIN space_object AS so ON so.id = s.target_object_id
                    LEFT JOIN baseline_graph_snapshot AS b
                           ON b.id = s.baseline_snapshot_id
                    WHERE s.id = CAST(:scenario_id AS uuid)
                    """
                ),
                {"scenario_id": scenario_id},
            )
            row = result.mappings().one_or_none()
        return _scenario_dict(dict(row)) if row else None

    async def create_scenario_run(
        self,
        scenario_id: str,
        *,
        recompute_mode: str,
        config_hash: str,
        thresholds: dict[str, float],
        validation_state: str = "SIMULATION_ONLY",
    ) -> str:
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    INSERT INTO scenario_run (
                        scenario_id, started_at, status,
                        recompute_mode, config_hash, thresholds_json,
                        validation_state
                    ) VALUES (
                        CAST(:scenario_id AS uuid), now(), 'RUNNING',
                        :recompute_mode, :config_hash, CAST(:thresholds AS jsonb),
                        :validation_state
                    )
                    RETURNING id::text
                    """
                ),
                {
                    "scenario_id": scenario_id,
                    "recompute_mode": recompute_mode,
                    "config_hash": config_hash,
                    "thresholds": _json(thresholds),
                    "validation_state": validation_state,
                },
            )
            return str(result.scalar_one())

    async def finalize_scenario_run(
        self,
        run_id: str,
        *,
        status: str,
        data_status: str,
        status_reason: str | None,
        affected_object_count: int,
        affected_edge_count: int,
        reused_baseline_edge_count: int,
        baseline_edge_count: int,
        scenario_edge_count: int,
        compute_ms: int,
        peak_memory_bytes: int,
        input_hash: str,
        model_id: str,
        result_hash_value: str | None,
        warnings: list[dict[str, Any]],
        error: dict[str, Any] | None,
    ) -> None:
        async with get_db_session() as session:
            await session.execute(
                text(
                    """
                    UPDATE scenario_run SET
                        finished_at = now(),
                        status = :status,
                        data_status = :data_status,
                        status_reason = :status_reason,
                        affected_object_count = :affected_objects,
                        affected_edge_count = :affected_edges,
                        reused_baseline_edge_count = :reused_edges,
                        baseline_edge_count = :baseline_edges,
                        scenario_edge_count = :scenario_edges,
                        compute_ms = :compute_ms,
                        peak_memory_bytes = :peak_memory,
                        input_hash = :input_hash,
                        model_id = :model_id,
                        result_hash = :result_hash,
                        warnings_json = CAST(:warnings AS jsonb),
                        error_json = CAST(:error AS jsonb)
                    WHERE id = CAST(:run_id AS uuid)
                    """
                ),
                {
                    "run_id": run_id,
                    "status": status,
                    "data_status": data_status,
                    "status_reason": status_reason,
                    "affected_objects": affected_object_count,
                    "affected_edges": affected_edge_count,
                    "reused_edges": reused_baseline_edge_count,
                    "baseline_edges": baseline_edge_count,
                    "scenario_edges": scenario_edge_count,
                    "compute_ms": compute_ms,
                    "peak_memory": peak_memory_bytes,
                    "input_hash": input_hash,
                    "model_id": model_id,
                    "result_hash": result_hash_value,
                    "warnings": _json(warnings),
                    "error": _json(error) if error else None,
                },
            )

    async def insert_benefit_results(
        self,
        run_id: str,
        attributions: list[BeneficiaryAttribution],
        validation_state: str = "SIMULATION_ONLY",
    ) -> int:
        if not attributions:
            return 0
        payload = []
        for attribution in attributions:
            payload.append(
                {
                    "run_id": run_id,
                    "beneficiary": attribution.beneficiary_object_id,
                    "benefit_class": attribution.benefit_class,
                    "metric_type": attribution.metric_type,
                    "baseline_value": attribution.baseline_value,
                    "scenario_value": attribution.scenario_value,
                    "benefit_value": attribution.benefit_value,
                    "horizon": attribution.horizon,
                    "provenance_json": _json(attribution.provenance),
                    "validation_state": validation_state,
                    "candidate_ref": str(
                        attribution.provenance.get("candidate_object_id")
                        or attribution.provenance.get("candidate_id")
                        or ""
                    ),
                }
            )
        async with get_db_session() as session:
            await session.execute(
                text(
                    """
                    INSERT INTO benefit_result (
                        scenario_run_id, beneficiary_object_id,
                        benefit_class, metric_type,
                        baseline_value, scenario_value, benefit_value,
                        confidence, uncertainty_low, uncertainty_high,
                        horizon, provenance_json, validation_state,
                        candidate_ref
                    ) VALUES (
                        CAST(:run_id AS uuid), CAST(:beneficiary AS uuid),
                        :benefit_class, :metric_type,
                        :baseline_value, :scenario_value, :benefit_value,
                        NULL, NULL, NULL,
                        :horizon, CAST(:provenance_json AS jsonb),
                        :validation_state,
                        :candidate_ref
                    )
                    """
                ),
                payload,
            )
        return len(payload)

    async def latest_succeeded_run(self, scenario_id: str) -> dict[str, Any] | None:
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT * FROM scenario_run
                    WHERE scenario_id = CAST(:scenario_id AS uuid)
                      AND status IN ('SUCCEEDED', 'PARTIAL')
                    ORDER BY started_at DESC, id
                    LIMIT 1
                    """
                ),
                {"scenario_id": scenario_id},
            )
            row = result.mappings().one_or_none()
        return _run_dict(dict(row)) if row else None

    async def latest_run_any(self, scenario_id: str) -> dict[str, Any] | None:
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT * FROM scenario_run
                    WHERE scenario_id = CAST(:scenario_id AS uuid)
                    ORDER BY started_at DESC, id
                    LIMIT 1
                    """
                ),
                {"scenario_id": scenario_id},
            )
            row = result.mappings().one_or_none()
        return _run_dict(dict(row)) if row else None

    async def load_run_beneficiaries(
        self,
        run_id: str,
        threshold_by_metric: dict[str, float],
    ) -> list[dict[str, Any]]:
        """Load persisted beneficiaries with their stored provenance."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT br.beneficiary_object_id::text AS beneficiary_object_id,
                           br.benefit_class, br.metric_type,
                           br.baseline_value, br.scenario_value, br.benefit_value,
                           br.confidence, br.uncertainty_low, br.uncertainty_high,
                           br.horizon, br.provenance_json AS provenance,
                           so.catalog_id, so.canonical_name
                    FROM benefit_result AS br
                    LEFT JOIN space_object AS so ON so.id = br.beneficiary_object_id
                    WHERE br.scenario_run_id = CAST(:run_id AS uuid)
                    ORDER BY br.metric_type, br.benefit_value DESC,
                             br.beneficiary_object_id
                    """
                ),
                {"run_id": run_id},
            )
            rows = [dict(row) for row in result.mappings().all()]
        enriched: list[dict[str, Any]] = []
        for row in rows:
            metric_type = str(row["metric_type"])
            threshold = float(threshold_by_metric.get(metric_type, 0.0))
            provenance = row.pop("provenance")
            enriched.append(
                {
                    **row,
                    "threshold": threshold,
                    "exceeds_threshold": float(row["benefit_value"]) > threshold,
                    "provenance": provenance if isinstance(provenance, dict) else {},
                }
            )
        return enriched


def _feature_from_payload(payload: dict[str, Any]) -> Any:
    from backend.benefit.models import EdgeFeature

    return EdgeFeature(
        tca=payload.get("tca"),
        miss_distance_m=payload.get("miss_distance_m"),
        relative_speed_mps=payload.get("relative_speed_mps"),
        boundary_flag=payload.get("boundary_flag"),
        source_grade=payload.get("source_grade"),
        covariance_status=payload.get("covariance_status"),
    )


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _as_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value))


def _decode_json_fields(payload: dict[str, Any], keys: set[str]) -> dict[str, Any]:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str):
            try:
                payload[key] = json.loads(value)
            except (TypeError, ValueError):
                payload[key] = {}
    return payload


def _baseline_dict(row: dict[str, Any]) -> dict[str, Any]:
    payload = dict(row)
    for key in ("created_at", "horizon_start", "horizon_end"):
        payload[key] = _iso(payload.get(key))
    _decode_json_fields(payload, {"config_json", "provenance"})
    payload.setdefault("horizon", horizon_label_from_row(payload))
    return payload


def horizon_label_from_row(payload: dict[str, Any]) -> str:
    start = payload.get("horizon_start")
    end = payload.get("horizon_end")
    return f"{start}/{end}"


def _scenario_dict(row: dict[str, Any]) -> dict[str, Any]:
    payload = dict(row)
    for key in ("effective_time", "created_at", "horizon_start", "horizon_end"):
        payload[key] = _iso(payload.get(key))
    _decode_json_fields(
        payload,
        {"parameters", "assumptions", "requested_metrics", "baseline_provenance"},
    )
    return payload


def _run_dict(row: dict[str, Any]) -> dict[str, Any]:
    payload = dict(row)
    for key in ("started_at", "finished_at"):
        payload[key] = _iso(payload.get(key))
    _decode_json_fields(payload, {"thresholds_json", "warnings_json", "error_json"})
    payload["id"] = str(payload["id"])
    payload["scenario_id"] = str(payload["scenario_id"])
    return payload


def new_baseline_snapshot_id() -> str:
    return f"bg-{uuid.uuid4()}"

