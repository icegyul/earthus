"""Pure-engine tests: metric separation, attribution, counterfactual equality."""

import hashlib
import json
from datetime import UTC, datetime

from backend.benefit.graph import (
    apply_idealized_removal,
    attribute_direct_beneficiaries,
    build_baseline_edges,
    build_graph_hash,
    orbital_envelope,
    result_hash,
    select_affected_objects,
    shells_overlap,
)
from backend.benefit.models import (
    EdgeFeature,
    RiskEdge,
    RiskGraph,
    ScenarioConfig,
)

A = "11111111-1111-1111-1111-111111111111"
B = "22222222-2222-2222-2222-222222222222"
C = "33333333-3333-3333-3333-333333333333"

H0 = datetime(2026, 8, 25, tzinfo=UTC)
H1 = datetime(2026, 8, 26, tzinfo=UTC)


def make_row(
    event_id, primary, secondary, *, pc=None, pc_status="NOT_COMPUTED", max_pc=None
):
    return {
        "event_id": event_id,
        "snapshot_id": f"snap-{event_id}",
        "snapshot_at": H0,
        "input_hash": "abc123",
        "model_version": "p4-conservative-v1+sgp4",
        "source_grade": "PUBLIC_GP",
        "validation_state": "PUBLIC_SCREENING",
        "primary_object_id": primary,
        "secondary_object_id": secondary,
        "tca": H0,
        "miss_distance_m": 12000.5,
        "relative_speed_mps": 500.0,
        "pc": pc,
        "pc_status": pc_status,
        "pc_unavailable_reason": None if pc_status == "COMPUTED" else "COVARIANCE_MISSING",
        "max_pc": max_pc,
        "covariance_status": "INSUFFICIENT_DATA" if pc is None else "PRESENT_VALID",
        "tca_boundary_flag": False,
    }


def test_metric_channels_stay_separate():
    rows = [
        make_row("e1", A, B, pc=2.0e-4, pc_status="COMPUTED", max_pc=9.9e-4),
        make_row("e2", A, B),
    ]
    result = build_baseline_edges(rows, horizon_config())
    by_type = {}
    for edge in result.edges:
        by_type.setdefault(edge.metric_type, []).append(edge.metric_value)
    assert by_type["PC"] == [2.0e-4]
    assert by_type["MAX_PC"] == [9.9e-4]
    assert by_type["CONJUNCTION_EXPOSURE"] == [2.0]
    # MISS_DISTANCE never becomes a metric channel.
    assert all(edge.metric_type != "MISS_DISTANCE" for edge in result.edges)
    features = {edge.metric_type: edge.features for edge in result.edges}
    assert features["PC"].miss_distance_m == 12000.5


def horizon_config():
    from backend.benefit.models import BaselineConfig

    return BaselineConfig(horizon_hours=24.0)


def test_pc_requires_computed_status():
    rows = [make_row("e1", A, B, pc=0.5)]  # value present but status not COMPUTED
    result = build_baseline_edges(rows, horizon_config())
    assert [edge.metric_type for edge in result.edges] == ["CONJUNCTION_EXPOSURE"]


def test_ben001_direct_beneficiary_attribution_exact():
    exposure_edge = RiskEdge(
        object_a=A,
        object_b=B,
        metric_type="CONJUNCTION_EXPOSURE",
        metric_value=4.0,
        features=_feature(),
        provenance={"dataset": "unit"},
    )
    baseline = _graph([exposure_edge])
    affected = select_affected_objects(baseline, A, {}, None, horizon_config())
    counterfactual = apply_idealized_removal(baseline, A, "gs", affected)
    attributions = attribute_direct_beneficiaries(
        baseline,
        counterfactual.scenario_graph,
        A,
        ScenarioConfig(metric_types=("CONJUNCTION_EXPOSURE",), thresholds={"CONJUNCTION_EXPOSURE": 0.0}),
        baseline_provenance={"baseline_graph_id": "g0"},
    )
    assert len(attributions) == 1
    row = attributions[0]
    assert row.beneficiary_object_id == B
    assert row.benefit_class == "DIRECT"
    assert row.baseline_value == 4.0
    assert row.scenario_value == 0.0
    assert row.benefit_value == 4.0


def test_target_self_benefit_never_attributed():
    edge = RiskEdge(A, B, "CONJUNCTION_EXPOSURE", 1.0, _feature(), {})
    baseline = _graph([edge])
    affected = select_affected_objects(baseline, A, {}, None, horizon_config())
    gs = apply_idealized_removal(baseline, A, "gs", affected).scenario_graph
    attributions = attribute_direct_beneficiaries(
        baseline, gs, A, ScenarioConfig(metric_types=("CONJUNCTION_EXPOSURE",)), {}
    )
    assert all(row.beneficiary_object_id != A for row in attributions)


def test_zero_delta_non_neighbors_excluded():
    edges = [
        RiskEdge(A, B, "CONJUNCTION_EXPOSURE", 1.0, _feature(), {}),
        RiskEdge(B, C, "CONJUNCTION_EXPOSURE", 2.0, _feature(), {}),
    ]
    baseline = _graph(edges)
    affected = select_affected_objects(baseline, A, {}, None, horizon_config())
    gs = apply_idealized_removal(baseline, A, "gs", affected).scenario_graph
    attributions = attribute_direct_beneficiaries(
        baseline, gs, A, ScenarioConfig(metric_types=("CONJUNCTION_EXPOSURE",)), {}
    )
    beneficiaries = {row.beneficiary_object_id for row in attributions}
    assert beneficiaries == {B}


def test_full_and_selective_counterfactuals_identical():
    edges = [
        RiskEdge(A, B, "CONJUNCTION_EXPOSURE", 1.0, _feature(), {}),
        RiskEdge(B, C, "PC", 3.0e-4, _feature(), {}),
        RiskEdge(A, C, "MAX_PC", 5.0e-4, _feature(), {}),
    ]
    baseline = _graph(edges)
    affected = select_affected_objects(baseline, A, {}, None, horizon_config())
    full = apply_idealized_removal(baseline, A, "gs-full", affected)
    selective = apply_idealized_removal(baseline, A, "gs-fast", affected)
    assert full.scenario_graph.graph_hash == selective.scenario_graph.graph_hash
    assert sorted(full.scenario_graph.edges) == sorted(selective.scenario_graph.edges)


def test_result_hash_mode_independent_and_deterministic():
    payload = {"scenario_id": "s", "metric_types": ["PC"]}
    edge = RiskEdge(A, B, "PC", 1.0e-4, _feature(), {})
    graph = _graph([edge])
    attribution = attribute_direct_beneficiaries(
        _graph([edge]),
        _graph([]),
        A,
        ScenarioConfig(metric_types=("PC",)),
        {},
    )[0]
    first = result_hash(payload, [attribution], graph)
    second = result_hash(dict(payload), [attribution], graph)
    assert first == second
    digest = hashlib.sha256(json.dumps({"x": 1}).encode()).hexdigest()
    assert len(first) == len(digest)


def test_shell_overlap_selection_with_reason_codes():
    target_envelope = (400.0, 500.0)
    candidates = {
        "near": (450.0, 520.0),
        "far": (1400.0, 1500.0),
    }
    edge = RiskEdge(A, B, "CONJUNCTION_EXPOSURE", 1.0, _feature(), {})
    baseline = _graph([edge])
    selection = select_affected_objects(
        baseline, A, candidates, target_envelope, horizon_config()
    )
    assert "TARGET_SELF" in selection.reason_for(A)
    assert "INCIDENT_NEIGHBOR" in selection.reason_for(B)
    assert "near" in selection.object_ids and "far" not in selection.object_ids
    assert "SHELL_OVERLAP_CANDIDATE" in selection.reason_for("near")


def test_orbital_envelope_math():
    # ISS-like mean motion ~15.5 rev/day, near-circular.
    envelope = orbital_envelope(15.5, 0.0007)
    assert envelope is not None
    perigee, apogee = envelope
    assert 380.0 < perigee < 430.0
    assert apogee >= perigee
    assert shells_overlap((400.0, 420.0), (410.0, 440.0), 50.0)
    assert not shells_overlap((400.0, 420.0), (900.0, 920.0), 10.0)


def test_graph_hash_order_invariant():
    e1 = RiskEdge(A, B, "PC", 1.0, _feature(), {})
    e2 = RiskEdge(B, C, "PC", 2.0, _feature(), {})
    assert build_graph_hash([e1, e2]) == build_graph_hash([e2, e1])


def _feature() -> EdgeFeature:
    return EdgeFeature(
        tca=None,
        miss_distance_m=1000.0,
        relative_speed_mps=100.0,
        boundary_flag=False,
        source_grade="SIMULATION_ONLY",
        covariance_status="PRESENT_VALID",
    )


def _graph(edges) -> RiskGraph:
    return RiskGraph(
        snapshot_id="g0",
        horizon_start=H0,
        horizon_end=H1,
        edges=tuple(edges),
        graph_hash=build_graph_hash(list(edges)),
    )
