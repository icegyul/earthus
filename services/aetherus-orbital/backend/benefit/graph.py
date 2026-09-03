"""Pure risk-graph construction and IDEALIZED_REMOVAL counterfactual logic.

No fabrication happens here: edges are derived only from supplied upstream P4
event/snapshot records, and every value keeps its provenance chain.
"""

import hashlib
import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from backend.benefit.models import (
    AGGREGATION_METHOD,
    EXPOSURE_METHOD,
    AffectedSelection,
    BaselineConfig,
    BeneficiaryAttribution,
    EdgeFeature,
    RiskEdge,
    RiskGraph,
    ScenarioConfig,
    build_graph_hash,
    horizon_label,
)

EARTH_RADIUS_KM = 6378.137
MU_KM3_S2 = 398600.4418


@dataclass(frozen=True)
class BaselineBuildResult:
    """Outcome of deriving G0 from stored P4 inputs."""

    edges: list[RiskEdge]
    edge_seeds: list[dict[str, Any]]
    object_count: int
    event_count: int
    considered_events: int
    skipped_events: list[dict[str, Any]] = field(default_factory=list)


def orbital_envelope(
    mean_motion_rev_per_day: float | None, eccentricity: float | None
) -> tuple[float, float] | None:
    """Perigee/apogee altitudes in km; None when elements are unusable."""
    if mean_motion_rev_per_day is None or eccentricity is None:
        return None
    n = float(mean_motion_rev_per_day)
    e = float(eccentricity)
    if n <= 0.0 or not 0.0 <= e < 1.0:
        return None
    n_rad_s = n * 2.0 * math.pi / 86400.0
    semi_major_km = (MU_KM3_S2 / (n_rad_s * n_rad_s)) ** (1.0 / 3.0)
    perigee_km = semi_major_km * (1.0 - e) - EARTH_RADIUS_KM
    apogee_km = semi_major_km * (1.0 + e) - EARTH_RADIUS_KM
    return perigee_km, apogee_km


def shells_overlap(first: tuple[float, float], second: tuple[float, float], margin_km: float) -> bool:
    """Conservative altitude-shell overlap test with an explicit margin."""
    return (
        first[1] + margin_km >= second[0] - margin_km
        and second[1] + margin_km >= first[0] - margin_km
    )


def _feature_from_row(row: dict[str, Any]) -> EdgeFeature:
    return EdgeFeature(
        tca=row["tca"].isoformat() if isinstance(row.get("tca"), datetime) else row.get("tca"),
        miss_distance_m=row.get("miss_distance_m"),
        relative_speed_mps=row.get("relative_speed_mps"),
        boundary_flag=row.get("tca_boundary_flag"),
        source_grade=row.get("source_grade"),
        covariance_status=row.get("covariance_status"),
    )


def _provenance_from_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "event_id": str(row["event_id"]),
        "snapshot_id": str(row["snapshot_id"]),
        "snapshot_at": row["snapshot_at"].isoformat()
        if isinstance(row.get("snapshot_at"), datetime)
        else row.get("snapshot_at"),
        "snapshot_input_hash": row.get("input_hash"),
        "model_version": row.get("model_version"),
        "source_grade": row.get("source_grade"),
        "validation_state": row.get("validation_state"),
        "primary_object_id": str(row["primary_object_id"]),
        "secondary_object_id": str(row["secondary_object_id"]),
        "pc_status": row.get("pc_status"),
        "pc_unavailable_reason": row.get("pc_unavailable_reason"),
    }


def build_baseline_edges(
    event_rows: list[dict[str, Any]], config: BaselineConfig
) -> BaselineBuildResult:
    """Derive metric-separated edges from latest-snapshot P4 records.

    ``event_rows`` must already be filtered to one latest snapshot per event.
    Channels:
      - PC: summed over a pair's events; only snapshots with pc_status='COMPUTED'
        contribute (covariance gating inherited from P4).
      - MAX_PC: maximum of present values.
      - CONJUNCTION_EXPOSURE: event count within the horizon (EVENT_COUNT_V1).
    MISS_DISTANCE stays a feature and never becomes a metric value.
    """
    pair_channels: dict[tuple[str, str], dict[str, Any]] = {}
    seeds: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    ordered = sorted(event_rows, key=lambda row: (str(row["tca"]), str(row["event_id"])))
    object_ids: set[str] = set()
    for row in ordered:
        primary = str(row["primary_object_id"])
        secondary = str(row["secondary_object_id"])
        if primary == secondary:
            skipped.append({"event_id": str(row["event_id"]), "reason": "SELF_PAIR"})
            continue
        object_ids.update((primary, secondary))
        key = (min(primary, secondary), max(primary, secondary))
        channel = pair_channels.setdefault(
            key,
            {"pc_sum": 0.0, "pc_count": 0, "max_pc": None, "events": []},
        )
        pc = row.get("pc")
        if row.get("pc_status") == "COMPUTED" and pc is not None:
            channel["pc_sum"] += float(pc)
            channel["pc_count"] += 1
        max_pc = row.get("max_pc")
        if max_pc is not None:
            channel["max_pc"] = (
                float(max_pc)
                if channel["max_pc"] is None
                else max(channel["max_pc"], float(max_pc))
            )
        channel["events"].append(row)
        seeds.append(
            {
                "event_id": str(row["event_id"]),
                "snapshot_id": str(row["snapshot_id"]),
                "snapshot_input_hash": row.get("input_hash"),
            }
        )

    edges: list[RiskEdge] = []
    contributing_events: set[str] = set()
    for (object_a, object_b), channel in sorted(pair_channels.items()):
        events = channel["events"]
        reference = events[0]
        feature = _feature_from_row(reference)
        base_provenance = _provenance_from_row(reference)
        common_provenance = {
            **base_provenance,
            "aggregation": AGGREGATION_METHOD,
            "contributing_event_ids": [str(event["event_id"]) for event in events],
            "contributing_snapshot_ids": [str(event["snapshot_id"]) for event in events],
        }

        if channel["pc_count"] > 0:
            edges.append(
                RiskEdge(
                    object_a=object_a,
                    object_b=object_b,
                    metric_type="PC",
                    metric_value=channel["pc_sum"],
                    features=feature,
                    provenance={
                        **common_provenance,
                        "method": "SUM_SNAPSHOT_PC_V1",
                        "covariance_gated": True,
                    },
                )
            )
            contributing_events.update(str(event["event_id"]) for event in events)
        if channel["max_pc"] is not None:
            edges.append(
                RiskEdge(
                    object_a=object_a,
                    object_b=object_b,
                    metric_type="MAX_PC",
                    metric_value=channel["max_pc"],
                    features=feature,
                    provenance={
                        **common_provenance,
                        "method": "MAX_SNAPSHOT_MAX_PC_V1",
                    },
                )
            )
            contributing_events.update(str(event["event_id"]) for event in events)
        # Exposure counts every horizon-window event for the pair regardless of
        # covariance; it is a count, not a probability, and stays separate.
        exposure = float(len(events))
        edges.append(
            RiskEdge(
                object_a=object_a,
                object_b=object_b,
                metric_type="CONJUNCTION_EXPOSURE",
                metric_value=exposure,
                features=feature,
                provenance={
                    **common_provenance,
                    "method": EXPOSURE_METHOD,
                    "unit": "event_count",
                },
            )
        )
        contributing_events.update(str(event["event_id"]) for event in events)

    return BaselineBuildResult(
        edges=edges,
        edge_seeds=seeds,
        object_count=len(object_ids),
        event_count=len(contributing_events),
        considered_events=len(ordered),
        skipped_events=skipped,
    )


def select_affected_objects(
    graph: RiskGraph,
    target_object_id: str,
    shell_candidates: dict[str, tuple[float, float]],
    target_envelope: tuple[float, float] | None,
    config: BaselineConfig,
) -> AffectedSelection:
    """Union of target-self, incident neighbors, and shell-overlap candidates.

    Under IDEALIZED_REMOVAL no new edges can appear, but conservative bounds
    still include orbit-overlap objects so equivalence checks cover them.
    """
    reasons: dict[str, list[str]] = {}
    members: set[str] = set()

    def add(object_id: str, reason: str) -> None:
        reasons.setdefault(object_id, []).append(reason)
        members.add(object_id)

    add(target_object_id, "TARGET_SELF")
    for neighbor in sorted(graph.neighbors_of(target_object_id)):
        add(neighbor, "INCIDENT_NEIGHBOR")
    if target_envelope is not None:
        for candidate_id in sorted(shell_candidates):
            if candidate_id == target_object_id or candidate_id in members:
                continue
            envelope = shell_candidates[candidate_id]
            if shells_overlap(target_envelope, envelope, config.shell_margin_km):
                add(candidate_id, "SHELL_OVERLAP_CANDIDATE")
    return AffectedSelection(object_ids=frozenset(members), reasons=reasons)


@dataclass(frozen=True)
class CounterfactualResult:
    """Scenario graph plus the bookkeeping needed for BEN-003 evidence."""

    scenario_graph: RiskGraph
    removed_edge_count: int
    reused_edge_count: int
    affected_incident_edge_count: int


def apply_idealized_removal(
    baseline: RiskGraph,
    target_object_id: str,
    snapshot_id: str,
    affected: AffectedSelection,
) -> CounterfactualResult:
    """Build Gs by deleting every target-incident edge. SIMULATION_ONLY.

    No physics is recomputed anywhere in this path: kept edges carry their
    stored P4 metric values verbatim, and no screening/TCA/Pc re-run occurs.
    Per IMPLEMENTATION_ORDER v1.2.1 this edge-deletion counterfactual does
    NOT satisfy the P5 gate; a valid P5 requires a state/trajectory
    intervention plus P4 recomputation over the affected region
    (audit: docs/audit/P5_BENEFIT_AUDIT_VERDICT.md, 2026-09-01).
    """
    removed = [edge for edge in baseline.edges if edge.involves(target_object_id)]
    kept = [edge for edge in baseline.edges if not edge.involves(target_object_id)]

    affected_incident = 0
    reused = 0
    for edge in kept:
        if edge.object_a in affected.object_ids or edge.object_b in affected.object_ids:
            affected_incident += 1
        else:
            reused += 1

    scenario_graph = RiskGraph(
        snapshot_id=snapshot_id,
        horizon_start=baseline.horizon_start,
        horizon_end=baseline.horizon_end,
        edges=tuple(kept),
        graph_hash=build_graph_hash(list(kept)),
    )
    return CounterfactualResult(
        scenario_graph=scenario_graph,
        removed_edge_count=len(removed),
        reused_edge_count=reused,
        affected_incident_edge_count=affected_incident,
    )


def attribute_direct_beneficiaries(
    baseline: RiskGraph,
    scenario: RiskGraph,
    target_object_id: str,
    config: ScenarioConfig,
    baseline_provenance: dict[str, Any],
    counterfactual_channels: frozenset[str] | None = None,
) -> list[BeneficiaryAttribution]:
    """Attribute Benefit_i(G0,Gs,h,m) to non-target objects above threshold.

    Only objects whose incident-edge sets actually differ between G0 and Gs can
    exceed a strictly-positive-difference rule; zero-delta objects are never
    beneficiaries. The target itself is structurally excluded.
    """
    # Which channels the counterfactual construction was able to produce at all.
    # Deleting edges from the baseline can only drop channels the intervention
    # itself removed, so its absences are real results; a pipeline re-run can
    # leave a channel empty for reasons unrelated to the intervention, and
    # differencing against that would attribute the whole baseline value to an
    # intervention that did not cause it.
    producible = (
        baseline.channels() if counterfactual_channels is None else counterfactual_channels
    )

    attributions: list[BeneficiaryAttribution] = []
    label = horizon_label(baseline.horizon_start, baseline.horizon_end)
    changed_objects = baseline.objects() | scenario.objects()
    changed_objects.discard(target_object_id)

    for object_id in sorted(changed_objects):
        neighbor_of_target = any(
            edge.involves(target_object_id) and edge.involves(object_id)
            for edge in baseline.edges
        )
        if not neighbor_of_target:
            # Under IDEALIZED_REMOVAL only incident neighbors can change; a
            # non-neighbor would require an indirect model P5 does not have.
            continue
        for metric_type in config.metric_types:
            if metric_type not in producible and baseline.has_channel(metric_type):
                # Recorded by channel_parity_warnings(); never silently zeroed.
                continue
            threshold = float(config.thresholds.get(metric_type, 0.0))
            baseline_value = baseline.object_risk(object_id, metric_type)
            scenario_value = scenario.object_risk(object_id, metric_type)
            benefit = baseline_value - scenario_value
            if not benefit > threshold:
                continue
            attributions.append(
                BeneficiaryAttribution(
                    beneficiary_object_id=object_id,
                    benefit_class="DIRECT" if neighbor_of_target else "INDIRECT_FRAGMENTATION",
                    metric_type=metric_type,
                    baseline_value=baseline_value,
                    scenario_value=scenario_value,
                    benefit_value=benefit,
                    threshold=threshold,
                    horizon=label,
                    provenance={
                        **baseline_provenance,
                        "aggregation": AGGREGATION_METHOD,
                        "threshold": threshold,
                        "metric_channel": metric_type,
                        "baseline_graph_id": baseline.snapshot_id,
                        "scenario_graph_id": scenario.snapshot_id,
                    },
                )
            )
    return attributions


#: 한쪽 그래프에만 존재하는 채널. 개입이 만든 차이가 아니므로 귀속하지 않는다.
CHANNEL_ABSENT_IN_COUNTERFACTUAL = "CHANNEL_ABSENT_IN_COUNTERFACTUAL"
CHANNEL_ABSENT_IN_BASELINE = "CHANNEL_ABSENT_IN_BASELINE"


def channel_parity_warnings(
    baseline: RiskGraph,
    scenario: RiskGraph,
    metric_types: tuple[str, ...],
    counterfactual_channels: frozenset[str] | None = None,
) -> list[dict[str, Any]]:
    """Report requested channels the counterfactual construction could not produce.

    Not a test of whether the counterfactual graph happens to be missing a
    channel — under an intervention that is frequently the answer, and a full
    benefit is then correct. The fault is a channel the baseline carries that
    the counterfactual path was structurally unable to emit, because the
    difference would credit the intervention with a change nobody measured.

    ``counterfactual_channels`` names what that path can emit. ``None`` means
    edge-deletion semantics, where the counterfactual is derived from the
    baseline and every absence is a genuine consequence of the intervention.
    """
    if counterfactual_channels is None:
        return []

    warnings: list[dict[str, Any]] = []
    for metric_type in metric_types:
        if not baseline.has_channel(metric_type):
            continue
        if metric_type in counterfactual_channels:
            continue
        warnings.append(
            {
                "code": CHANNEL_ABSENT_IN_COUNTERFACTUAL,
                "metric_type": metric_type,
                "baseline_graph_id": baseline.snapshot_id,
                "scenario_graph_id": scenario.snapshot_id,
                "data_status": "INSUFFICIENT_DATA",
                "message": (
                    f"the baseline carries {metric_type} but the counterfactual "
                    "recompute cannot produce that channel, so the two graphs are "
                    "not comparable on it and no benefit was attributed"
                ),
            }
        )
    return warnings


def result_hash(
    scenario_payload: dict[str, Any],
    attributions: list[BeneficiaryAttribution],
    scenario_graph: RiskGraph,
) -> str:
    """Deterministic hash binding scenario params, graph, and benefit rows."""
    rows = sorted(
        (
            attribution.beneficiary_object_id,
            attribution.metric_type,
            attribution.horizon,
            format(attribution.baseline_value, ".17g"),
            format(attribution.scenario_value, ".17g"),
            format(attribution.benefit_value, ".17g"),
        )
        for attribution in attributions
    )
    serialized = json.dumps(
        {
            "scenario": scenario_payload,
            "scenario_graph_hash": scenario_graph.graph_hash,
            "benefits": rows,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


#: The baseline horizon starts on a bucket boundary rather than at the exact
#: instant of the request.
#:
#: It used to start at ``now``, which meant no two requests ever asked the same
#: question: six seconds apart, one conjunction had aged out of the window and
#: the input hash changed. Nothing could be reused, so every call wrote another
#: ~3,000 edge rows, and risk_edge reached four million rows and 90% of the
#: database.
#:
#: Quantising costs freshness bounded by the bucket and buys the ability to
#: recognise the same question twice. The horizon that was actually used travels
#: in every payload, so a caller always knows which window their answer covers.
HORIZON_BUCKET_SECONDS = 900  # 15 minutes


def default_horizon_bounds(now: datetime, horizon_hours: float) -> tuple[datetime, datetime]:
    """Bucket-aligned [start, stop) for a baseline horizon.

    ``start`` is ``now`` floored to the bucket, never rounded up: a horizon must
    not begin in the future, or events between now and the boundary would fall
    outside a window that claims to start now.
    """
    epoch = int(now.timestamp())
    start = now.fromtimestamp(
        epoch - (epoch % HORIZON_BUCKET_SECONDS), tz=now.tzinfo
    ).replace(microsecond=0)
    return start, start + timedelta(hours=horizon_hours)
