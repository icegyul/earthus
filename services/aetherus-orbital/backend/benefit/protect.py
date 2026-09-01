"""P6 pure logic: PROTECT reverse ranking and candidate-OCM evaluation.

Advisory only. Every number is a difference between two physically derived
graphs (SCREENING_RECOMPUTE_V1); nothing here fabricates a risk value, and no
command or transmission path exists anywhere in this module.
"""

from dataclasses import dataclass
from typing import Any

from backend.benefit.physical import BaselinePrime, CandidateOutcome


@dataclass(frozen=True)
class ProtectCandidateRank:
    """One 'remove k to protect Y' candidate with physically derived benefit."""

    candidate_object_id: str
    benefits: dict[str, float]  # metric -> Benefit(k -> Y)
    removed_edge_count: int
    new_edge_count: int
    changed_edge_count: int
    scenario_graph_id: str
    scenario_graph_hash: str


def rank_protect_candidates(
    baseline: BaselinePrime,
    protected_object_id: str,
    outcomes: list[CandidateOutcome],
    metrics: tuple[str, ...],
) -> list[ProtectCandidateRank]:
    """Rank REMOVE candidates by their physically derived benefit to Y.

    Ordering: primary requested metric descending, then candidate id — fully
    deterministic so equal-benefit candidates never reorder between runs.
    """
    ranks: list[ProtectCandidateRank] = []
    for outcome in outcomes:
        benefits = {
            metric: baseline.graph.object_risk(protected_object_id, metric)
            - outcome.scenario_graph.object_risk(protected_object_id, metric)
            for metric in metrics
        }
        ranks.append(
            ProtectCandidateRank(
                candidate_object_id=outcome.intervention.object_id,
                benefits=benefits,
                removed_edge_count=len(outcome.removed_edges),
                new_edge_count=len(outcome.new_edges),
                changed_edge_count=len(outcome.changed_edges),
                scenario_graph_id=outcome.scenario_graph.snapshot_id,
                scenario_graph_hash=outcome.scenario_graph.graph_hash,
            )
        )
    primary = metrics[0]
    ranks.sort(key=lambda rank: (-rank.benefits.get(primary, 0.0), rank.candidate_object_id))
    return ranks


def _edges_by_metric(deltas, value_attr: str) -> dict[str, float]:
    totals: dict[str, float] = {}
    for delta in deltas:
        metric = delta.key[2]
        value = getattr(delta, value_attr)
        if value is None:
            continue
        totals[metric] = totals.get(metric, 0.0) + float(value)
    return totals


def evaluate_ocm_candidate(
    baseline: BaselinePrime,
    outcome: CandidateOutcome,
    target_object_id: str,
    metrics: tuple[str, ...],
) -> dict[str, Any]:
    """Compare one candidate maneuver against the nominal G0'.

    Reports (never auto-judges): the target's own risk delta, the aggregate
    value of newly created edges (the new-risk signal a maneuver must never
    hide), and every object whose risk worsened under the candidate.
    """
    target_delta = {
        metric: baseline.graph.object_risk(target_object_id, metric)
        - outcome.scenario_graph.object_risk(target_object_id, metric)
        for metric in metrics
    }
    new_risk = _edges_by_metric(outcome.new_edges, "scenario_value")
    resolved_risk = _edges_by_metric(outcome.removed_edges, "baseline_value")

    worsened: list[dict[str, Any]] = []
    every_object = baseline.graph.objects() | outcome.scenario_graph.objects()
    every_object.discard(target_object_id)
    for object_id in sorted(every_object):
        for metric in metrics:
            before = baseline.graph.object_risk(object_id, metric)
            after = outcome.scenario_graph.object_risk(object_id, metric)
            if after > before:
                worsened.append(
                    {
                        "object_id": object_id,
                        "metric_type": metric,
                        "baseline_value": before,
                        "scenario_value": after,
                        "increase": after - before,
                    }
                )

    return {
        "candidate_id": outcome.intervention.label(),
        "element_overrides": outcome.intervention.element_overrides or {},
        "target_risk_delta": target_delta,
        "resolved_edge_risk": resolved_risk,
        "new_edge_risk": new_risk,
        "removed_edge_count": len(outcome.removed_edges),
        "changed_edge_count": len(outcome.changed_edges),
        "new_edge_count": len(outcome.new_edges),
        "objects_with_worsened_risk": worsened,
        "scenario_graph_id": outcome.scenario_graph.snapshot_id,
        "scenario_graph_hash": outcome.scenario_graph.graph_hash,
    }
