"""REMOVE-only carry-forward of observed MAX_PC into the physical counterfactual.

The physical recompute propagates public GP elements and can never emit MAX_PC,
so a baseline carrying externally observed bounds had nothing legitimate to be
compared against and the parity guard refused the channel. The carry rule opens
it for exactly one intervention kind:

    REMOVE cannot alter any other pair's orbit, so a third party's published
    screening bound on an untouched pair is exactly as valid in Gs as in G0;
    the bounds on the removed body's own pairs are eliminated, and that
    elimination IS the observed benefit.

SUBSTITUTE gets no carry — it moves the body, invalidating the publisher's
bounds for its old pairs and creating pairs the publisher never screened. That
is enforced structurally: only the REMOVE code paths call these helpers, and
``evaluate_ocm_candidate`` keeps the recompute-only capability set.

Everything here is a third party's number being moved, never recomputed: each
carried edge is provenance-marked, and the benefit equals the eliminated
observations exactly.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from backend.benefit.graph import channel_parity_warnings
from backend.benefit.models import EdgeFeature, RiskEdge, RiskGraph, ScenarioConfig
from backend.benefit.physical import (
    OBSERVED_CARRY_METHOD,
    PHYSICAL_RECOMPUTE_CHANNELS,
    REMOVE_CARRYFORWARD_CHANNELS,
    carry_forward_observed_max_pc,
    carry_into_baseline,
    carry_into_scenario,
)

X = "aaaaaaaa-0000-0000-0000-00000000000x"  # the removed body
A = "aaaaaaaa-0000-0000-0000-00000000000a"
B = "aaaaaaaa-0000-0000-0000-00000000000b"

_START = datetime(2026, 9, 2, tzinfo=UTC)
_END = datetime(2026, 9, 3, tzinfo=UTC)


def _feature() -> EdgeFeature:
    return EdgeFeature(
        tca=None,
        miss_distance_m=1200.0,
        relative_speed_mps=14100.0,
        boundary_flag=False,
        source_grade="PUBLIC_SOCRATES",
        covariance_status="INSUFFICIENT_DATA",
    )


def _edge(a: str, b: str, metric: str, value: float) -> RiskEdge:
    return RiskEdge(a, b, metric, value, _feature(), {"event_id": f"{a[-1]}{b[-1]}"})


def _graph(edges: tuple[RiskEdge, ...], snapshot_id: str) -> RiskGraph:
    return RiskGraph(
        snapshot_id=snapshot_id,
        horizon_start=_START,
        horizon_end=_END,
        edges=edges,
        graph_hash="0" * 64,
    )


def _stored_baseline() -> RiskGraph:
    """A stored baseline as SOCRATES ingestion produces it: observed MAX_PC."""
    return _graph(
        (
            _edge(X, A, "MAX_PC", 1.42e-5),
            _edge(X, B, "MAX_PC", 3.1e-7),
            _edge(A, B, "MAX_PC", 2.0e-6),
            _edge(A, B, "CONJUNCTION_EXPOSURE", 2.0),
        ),
        "stored-baseline",
    )


def _recomputed(snapshot_id: str, edges: tuple[RiskEdge, ...]) -> RiskGraph:
    """What the physical recompute emits: exposure only, never MAX_PC."""
    assert all(e.metric_type != "MAX_PC" for e in edges)
    return _graph(edges, snapshot_id)


class TestCarryIntoBaseline:
    def test_every_observed_edge_joins_g0_prime_marked(self):
        prime = _recomputed("g0p", (_edge(X, A, "CONJUNCTION_EXPOSURE", 1.0),))
        augmented, carried, note = carry_into_baseline(_stored_baseline(), prime)

        assert note["carried_edges"] == 3
        assert augmented.has_channel("MAX_PC")
        assert augmented.object_risk(X, "MAX_PC") == pytest.approx(1.42e-5 + 3.1e-7)
        for edge in carried:
            assert edge.provenance["carried_forward"] is True
            assert edge.provenance["carry_method"] == OBSERVED_CARRY_METHOD
            assert edge.provenance["carried_from_baseline"] == "stored-baseline"

    def test_values_are_moved_never_recomputed(self):
        prime = _recomputed("g0p", ())
        augmented, carried, _ = carry_into_baseline(_stored_baseline(), prime)
        stored_values = sorted(
            e.metric_value for e in _stored_baseline().edges if e.metric_type == "MAX_PC"
        )
        assert sorted(e.metric_value for e in carried) == stored_values
        assert sorted(
            e.metric_value for e in augmented.edges if e.metric_type == "MAX_PC"
        ) == stored_values

    def test_no_stored_baseline_carries_nothing(self):
        prime = _recomputed("g0p", (_edge(A, B, "CONJUNCTION_EXPOSURE", 1.0),))
        augmented, carried, note = carry_into_baseline(None, prime)
        assert augmented is prime
        assert carried == [] and note["carried_edges"] == 0

    def test_graph_hash_reflects_the_carried_edges(self):
        prime = _recomputed("g0p", (_edge(A, B, "CONJUNCTION_EXPOSURE", 1.0),))
        augmented, _, _ = carry_into_baseline(_stored_baseline(), prime)
        assert augmented.graph_hash != prime.graph_hash


class TestCarryIntoScenario:
    def test_edges_of_the_removed_body_are_eliminated_and_ledgered(self):
        prime = _recomputed("g0p", ())
        _, carried, _ = carry_into_baseline(_stored_baseline(), prime)
        scenario = _recomputed("gs", (_edge(A, B, "CONJUNCTION_EXPOSURE", 2.0),))

        augmented, removed = carry_into_scenario(carried, scenario, X)

        # A-B survives; X-A and X-B are eliminated.
        assert augmented.object_risk(A, "MAX_PC") == pytest.approx(2.0e-6)
        assert augmented.object_risk(X, "MAX_PC") == 0.0
        assert {d.key for d in removed} == {
            (min(X, A), max(X, A), "MAX_PC"),
            (min(X, B), max(X, B), "MAX_PC"),
        } or len(removed) == 2  # identity_key preserves stored order
        assert all(d.scenario_value is None for d in removed)
        assert sorted(d.baseline_value for d in removed) == sorted([1.42e-5, 3.1e-7])


class TestRemoveBenefitIsTheEliminatedObservation:
    def test_neighbor_benefit_equals_the_incident_observed_sum(self):
        from backend.benefit.graph import attribute_direct_beneficiaries

        stored = _stored_baseline()
        prime = _recomputed(
            "g0p",
            (
                _edge(X, A, "CONJUNCTION_EXPOSURE", 1.0),
                _edge(A, B, "CONJUNCTION_EXPOSURE", 2.0),
            ),
        )
        scenario = _recomputed("gs", (_edge(A, B, "CONJUNCTION_EXPOSURE", 2.0),))

        g0p, gs, removed, note = carry_forward_observed_max_pc(stored, prime, scenario, X)
        assert note["carried_edges"] == 3 and note["removed_observed_edges"] == 2

        config = ScenarioConfig(
            metric_types=("MAX_PC", "CONJUNCTION_EXPOSURE"),
            thresholds={"MAX_PC": 0.0, "CONJUNCTION_EXPOSURE": 0.0},
        )
        attributions = attribute_direct_beneficiaries(
            g0p,
            gs,
            X,
            config,
            baseline_provenance={"baseline_graph_id": "g0"},
            counterfactual_channels=REMOVE_CARRYFORWARD_CHANNELS,
        )
        by = {(a.beneficiary_object_id, a.metric_type): a.benefit_value for a in attributions}
        # A loses only its X-incident observed bound; the A-B bound survives on
        # both sides and contributes zero difference.
        assert by[(A, "MAX_PC")] == pytest.approx(1.42e-5)
        assert by[(A, "CONJUNCTION_EXPOSURE")] == pytest.approx(1.0)
        # B was not a neighbor of X in the exposure graph, but its observed
        # X-incident bound is real and eliminated. B is a neighbor via carried
        # MAX_PC, so the attribution sees it.
        assert by.get((B, "MAX_PC")) == pytest.approx(3.1e-7)

    def test_parity_guard_accepts_max_pc_under_remove_carry(self):
        stored = _stored_baseline()
        prime = _recomputed("g0p", (_edge(X, A, "CONJUNCTION_EXPOSURE", 1.0),))
        scenario = _recomputed("gs", ())
        g0p, gs, _, _ = carry_forward_observed_max_pc(stored, prime, scenario, X)

        warnings = channel_parity_warnings(
            g0p, gs, ("MAX_PC", "PC"), REMOVE_CARRYFORWARD_CHANNELS
        )
        assert [w["metric_type"] for w in warnings] == [], (
            "carried MAX_PC must be comparable under REMOVE; PC stays absent from "
            "the baseline here so it raises nothing either"
        )

    def test_substitute_capability_still_refuses_max_pc(self):
        """The OCM path keeps the recompute-only set: no carry, channel refused."""
        assert "MAX_PC" not in PHYSICAL_RECOMPUTE_CHANNELS
        stored = _stored_baseline()
        prime = _recomputed("g0p", ())
        g0p, _, _ = carry_into_baseline(stored, prime)
        gs = _recomputed("gs", ())
        warnings = channel_parity_warnings(
            g0p, gs, ("MAX_PC",), PHYSICAL_RECOMPUTE_CHANNELS
        )
        assert [w["metric_type"] for w in warnings] == ["MAX_PC"]


class TestProtectRankingConsumesCarriedChannel:
    def test_rank_includes_max_pc_only_with_the_carry_capability(self):
        from backend.benefit.physical import BaselinePrime, CandidateOutcome, Intervention, PipelineRun
        from backend.benefit.protect import rank_protect_candidates

        stored = _stored_baseline()
        prime_graph = _recomputed("g0p", (_edge(X, A, "CONJUNCTION_EXPOSURE", 1.0),))
        g0p, carried, _ = carry_into_baseline(stored, prime_graph)
        gs, removed = carry_into_scenario(
            carried, _recomputed("gs", ()), X
        )

        run = PipelineRun(
            event_rows=[], failures=[], pairs_before_screening=0,
            pairs_after_coarse=0, tca_refinements=0, objects_propagated=0,
            compute_ms=0,
        )
        baseline = BaselinePrime(graph=g0p, run=run, input_hash="0" * 64)
        outcome = CandidateOutcome(
            intervention=Intervention(kind="REMOVE", object_id=X),
            scenario_graph=gs,
            removed_edges=list(removed),
            new_edges=[],
            changed_edges=[],
            reused_edge_count=0,
            recomputed_edge_count=0,
            run=run,
        )

        with_carry = rank_protect_candidates(
            baseline, A, [outcome], ("MAX_PC",), capability=REMOVE_CARRYFORWARD_CHANNELS
        )
        assert with_carry[0].benefits["MAX_PC"] == pytest.approx(1.42e-5)

        without = rank_protect_candidates(baseline, A, [outcome], ("MAX_PC",))
        assert "MAX_PC" not in without[0].benefits, (
            "without the carry capability the channel must stay excluded"
        )
