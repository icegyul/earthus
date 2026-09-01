"""Typed values, metric channels, and hashes for the P5 benefit engine.

Metric channels stay separate by contract (DATA_CONTRACTS.md). The raw
MISS_DISTANCE screening channel is carried as an edge feature only; it is
never converted into a benefit number and never merged with Pc.
"""

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

RISK_GRAPH_MODEL_ID = "aetherus-risk-graph"
RISK_GRAPH_MODEL_VERSION = "p5-baseline-v1"
BENEFIT_MODEL_ID = "aetherus-benefit-engine"
BENEFIT_MODEL_VERSION = "p5-idealized-removal-v1"

IDEALIZED_REMOVAL = "IDEALIZED_REMOVAL"
AGGREGATION_METHOD = "SUM_INCIDENT_EDGES_V1"
EXPOSURE_METHOD = "EVENT_COUNT_V1"

#: Counterfactual derivation methods. PHYSICAL re-runs the P4 pipeline over
#: the intervention-modified object set (the P5-gate-valid path); IDEALIZED
#: is the legacy edge-deletion research simulation and stays SIMULATION_ONLY
#: (audit 2026-09-01: docs/audit/P5_BENEFIT_AUDIT_VERDICT.md).
METHOD_PHYSICAL = "SCREENING_RECOMPUTE_V1"
METHOD_IDEALIZED = IDEALIZED_REMOVAL
COUNTERFACTUAL_METHODS = (METHOD_PHYSICAL, METHOD_IDEALIZED)

#: Benefit-capable channels. Higher values mean higher risk, so the spec
#: formula ``Benefit_i = R_i(G0) - R_i(Gs)`` applies directly. MISS_DISTANCE
#: is deliberately absent: meters are not a risk score.
METRIC_CHANNELS = ("PC", "MAX_PC", "CONJUNCTION_EXPOSURE")

VALIDATION_STATE_OPERATIONAL = "PUBLIC_SCREENING"
VALIDATION_STATE_SIMULATION = "SIMULATION_ONLY"

MAX_HORIZON_HOURS = 168.0

_SIMULATION_GRADES = frozenset({"SIMULATION_ONLY", "PROBE", "EVIDENCE_PROBE"})


def is_simulation_source_grade(grade: str | None) -> bool:
    """Classify stored conjunction sources so validation rows never go live."""
    return grade is not None and grade.upper() in _SIMULATION_GRADES


def deterministic_horizon(dataset: str) -> tuple[datetime, datetime]:
    """Stable 24h window derived from a dataset name (idempotent SIMULATION_ONLY seeds)."""
    digest = hashlib.sha256(dataset.encode("utf-8")).hexdigest()
    day_offset = int(digest[:8], 16) % 3650
    start = datetime(2026, 1, 1, tzinfo=UTC) + timedelta(days=day_offset)
    return start, start + timedelta(hours=24)


@dataclass(frozen=True)
class BaselineConfig:
    """Versioned, hashable baseline-graph configuration."""

    horizon_hours: float = 24.0
    shell_margin_km: float = 50.0
    max_objects: int = 2000

    def to_payload(self) -> dict[str, Any]:
        return {
            "horizon_hours": self.horizon_hours,
            "shell_margin_km": self.shell_margin_km,
            "max_objects": self.max_objects,
        }


def build_baseline_config_hash(config: BaselineConfig) -> str:
    """Hash the deterministic baseline configuration identity."""
    serialized = json.dumps(
        {
            **config.to_payload(),
            "model_id": RISK_GRAPH_MODEL_ID,
            "model_version": RISK_GRAPH_MODEL_VERSION,
            "metric_channels": list(METRIC_CHANNELS),
            "aggregation": AGGREGATION_METHOD,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class ScenarioConfig:
    """Versioned REMOVE-scenario execution configuration."""

    metric_types: tuple[str, ...] = METRIC_CHANNELS
    thresholds: dict[str, float] = field(
        default_factory=lambda: {"PC": 0.0, "MAX_PC": 0.0, "CONJUNCTION_EXPOSURE": 0.0}
    )
    recompute_mode: str = "FULL"  # or AFFECTED_SUBGRAPH
    counterfactual_method: str = METHOD_IDEALIZED

    def to_payload(self) -> dict[str, Any]:
        return {
            "metric_types": list(self.metric_types),
            "thresholds": {key: self.thresholds[key] for key in sorted(self.thresholds)},
            "recompute_mode": self.recompute_mode,
            "counterfactual_method": self.counterfactual_method,
            "model_id": BENEFIT_MODEL_ID,
            "model_version": BENEFIT_MODEL_VERSION,
            "aggregation": AGGREGATION_METHOD,
            "assumption": self.counterfactual_method,
        }


def build_scenario_config_hash(config: ScenarioConfig) -> str:
    serialized = json.dumps(config.to_payload(), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class EdgeFeature:
    """Screening features preserved verbatim on a risk edge."""

    tca: str | None
    miss_distance_m: float | None
    relative_speed_mps: float | None
    boundary_flag: bool | None
    source_grade: str | None
    covariance_status: str | None

    def to_payload(self) -> dict[str, Any]:
        return {
            "tca": self.tca,
            "miss_distance_m": self.miss_distance_m,
            "relative_speed_mps": self.relative_speed_mps,
            "boundary_flag": self.boundary_flag,
            "source_grade": self.source_grade,
            "covariance_status": self.covariance_status,
        }


@dataclass(frozen=True)
class RiskEdge:
    """One metric-specific edge of a risk graph.

    ``metric_value`` is the per-pair aggregate of one channel only. The
    provenance payload records every contributing event/snapshot so each value
    traces back to the immutable P4 record.
    """

    object_a: str
    object_b: str
    metric_type: str
    metric_value: float
    features: EdgeFeature
    provenance: dict[str, Any]

    def involves(self, object_id: str) -> bool:
        return self.object_a == object_id or self.object_b == object_id

    def other(self, object_id: str) -> str:
        if self.object_a == object_id:
            return self.object_b
        if self.object_b == object_id:
            return self.object_a
        raise ValueError("object is not an endpoint of this edge")

    def identity_key(self) -> tuple[str, str, str]:
        return (self.object_a, self.object_b, self.metric_type)


@dataclass(frozen=True)
class RiskGraph:
    """An immutable in-memory risk graph (baseline G0 or scenario Gs)."""

    snapshot_id: str
    horizon_start: datetime
    horizon_end: datetime
    edges: tuple[RiskEdge, ...]
    graph_hash: str

    def incident_edges(self, object_id: str) -> list[RiskEdge]:
        return [edge for edge in self.edges if edge.involves(object_id)]

    def object_risk(self, object_id: str, metric_type: str) -> float:
        """Aggregate R_i(G,h,m) over incident edges of exactly one channel."""
        return sum(
            edge.metric_value
            for edge in self.edges
            if edge.involves(object_id) and edge.metric_type == metric_type
        )

    def neighbors_of(self, object_id: str) -> set[str]:
        return {
            edge.other(object_id)
            for edge in self.edges
            if edge.involves(object_id)
        }

    def objects(self) -> set[str]:
        endpoints: set[str] = set()
        for edge in self.edges:
            endpoints.add(edge.object_a)
            endpoints.add(edge.object_b)
        return endpoints


def build_graph_hash(edges: list[RiskEdge]) -> str:
    """Deterministic content hash over the sorted edge set."""
    lines = []
    for edge in sorted(edges, key=lambda item: (*item.identity_key(),)):
        lines.append(
            "|".join(
                [
                    edge.object_a,
                    edge.object_b,
                    edge.metric_type,
                    format(edge.metric_value, ".17g"),
                ]
            )
        )
    serialized = "\n".join(lines)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def build_input_hash(edge_seeds: list[dict[str, Any]]) -> str:
    """Hash the upstream P4 inputs (event/snapshot identities + input hashes)."""
    normalized = sorted(
        (
            str(seed.get("event_id")),
            str(seed.get("snapshot_id")),
            str(seed.get("snapshot_input_hash")),
        )
        for seed in edge_seeds
    )
    serialized = json.dumps(normalized, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class BeneficiaryAttribution:
    """One persisted Benefit(k→i) row before storage."""

    beneficiary_object_id: str
    benefit_class: str
    metric_type: str
    baseline_value: float
    scenario_value: float
    benefit_value: float
    threshold: float
    horizon: str
    provenance: dict[str, Any]


def horizon_label(horizon_start: datetime, horizon_end: datetime) -> str:
    return f"{horizon_start.isoformat()}/{horizon_end.isoformat()}"


@dataclass(frozen=True)
class AffectedSelection:
    """Affected-subgraph candidate set with explicit reason codes."""

    object_ids: frozenset[str]
    reasons: dict[str, list[str]]

    def reason_for(self, object_id: str) -> list[str]:
        return self.reasons.get(object_id, [])
