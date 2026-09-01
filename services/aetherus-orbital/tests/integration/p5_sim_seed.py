"""Shared SIMULATION_ONLY graph seeding helpers for P5 tests.

Every artifact these helpers persist is labeled SIMULATION_ONLY so the
operational baseline path can never consume fixture values. Horizon bounds
are derived deterministically from the dataset name so repeated seeds stay
idempotent under the append-only constraints.
"""

from typing import Any

from backend.benefit.models import (
    VALIDATION_STATE_SIMULATION,
    BaselineConfig,
    EdgeFeature,
    RiskEdge,
    build_graph_hash,
    deterministic_horizon,
)

SIM_FEATURE = EdgeFeature(
    tca=None,
    miss_distance_m=4995.087,
    relative_speed_mps=5.589,
    boundary_flag=False,
    source_grade="SIMULATION_ONLY",
    covariance_status="PRESENT_VALID",
)


def simulation_edge(
    object_a: str,
    object_b: str,
    metric_type: str,
    metric_value: float,
    dataset: str,
) -> RiskEdge:
    """One deterministic synthetic edge; the value is corpus input, not output."""
    return RiskEdge(
        object_a=min(object_a, object_b),
        object_b=max(object_a, object_b),
        metric_type=metric_type,
        metric_value=metric_value,
        features=SIM_FEATURE,
        provenance={
            "dataset": dataset,
            "validation_only": True,
            "method": "EVENT_COUNT_V1"
            if metric_type == "CONJUNCTION_EXPOSURE"
            else "SUM_SNAPSHOT_PC_V1",
        },
    )


async def seed_simulation_baseline(
    repository: Any,
    *,
    baseline_id: str,
    edges: list[RiskEdge],
    dataset: str,
) -> str:
    """Persist one immutable SIMULATION_ONLY baseline graph."""
    horizon_start, horizon_end = deterministic_horizon(dataset)
    existing = await repository.get_baseline_row(baseline_id)
    if existing is None:
        config = BaselineConfig(horizon_hours=24.0)
        endpoints: set[str] = set()
        for edge in edges:
            endpoints.update((edge.object_a, edge.object_b))
        await repository.insert_baseline_snapshot(
            snapshot_id=baseline_id,
            horizon_start=horizon_start,
            horizon_end=horizon_end,
            event_count=len(edges),
            edge_count=len(edges),
            object_count=len(endpoints),
            model_id="aetherus-risk-graph",
            model_version="p5-baseline-v1",
            config_payload=config.to_payload(),
            config_hash=f"sim-{dataset}",
            input_hash=f"sim-input-{dataset}",
            graph_hash=build_graph_hash(edges),
            data_status="OK",
            status_reason=None,
            validation_state=VALIDATION_STATE_SIMULATION,
            provenance={
                "dataset": dataset,
                "validation_only": True,
                "created_at": horizon_end.isoformat(),
            },
        )
    await repository.insert_risk_edges(baseline_id, edges, VALIDATION_STATE_SIMULATION)
    stored_count = await repository.count_baseline_edges(baseline_id)
    if stored_count < len(edges):
        raise RuntimeError(
            f"seed {baseline_id}: expected >= {len(edges)} edges, found {stored_count}"
        )
    return baseline_id
