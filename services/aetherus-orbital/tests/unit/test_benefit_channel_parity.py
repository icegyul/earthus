"""Channel parity: difference only what the counterfactual could have produced.

The attribution step computes ``baseline_value - scenario_value``. That is sound
while both graphs come from the same construction, and unsound the moment they do
not — which is the case here. ``backend/benefit/physical.py`` propagates public GP
elements, which carry no covariance, so every physically recomputed row has
``pc``/``max_pc`` of None. A baseline built from ingested CDM or an external
screening feed can carry real PC or MAX_PC edges. Differencing one against the
other yields the whole baseline value and publishes it as the benefit of removing
the object — "removing this debris eliminates this much collision probability" —
when one side simply never had the channel.

The discriminator is NOT whether the counterfactual graph is missing a channel.
Under an intervention that is frequently the correct answer: if the removed object
carried the only PC edge, then removing it really did eliminate that risk, and the
full-value benefit is right. What is wrong is differencing against a construction
that was *structurally unable* to produce the channel at all.

So the rule is about capability, not observation:

* edge deletion derives Gs from G0, so every absence is caused by the
  intervention and every difference is real;
* the physical recompute can only emit CONJUNCTION_EXPOSURE, so a baseline PC has
  nothing legitimate to be compared against and the run says INSUFFICIENT_DATA.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from backend.benefit.graph import (
    CHANNEL_ABSENT_IN_COUNTERFACTUAL,
    attribute_direct_beneficiaries,
    channel_parity_warnings,
)
from backend.benefit.models import RiskEdge, RiskGraph, ScenarioConfig
from backend.benefit.physical import PHYSICAL_RECOMPUTE_CHANNELS

A = "aaaaaaaa-0000-0000-0000-00000000000a"
B = "aaaaaaaa-0000-0000-0000-00000000000b"
C = "aaaaaaaa-0000-0000-0000-00000000000c"

_START = datetime(2026, 9, 2, tzinfo=UTC)
_END = datetime(2026, 9, 3, tzinfo=UTC)


def _feature() -> dict[str, object]:
    return {"miss_distance_m": 1200.0, "relative_speed_mps": 14100.0}


def _graph(edges: tuple[RiskEdge, ...], snapshot_id: str = "g") -> RiskGraph:
    return RiskGraph(
        snapshot_id=snapshot_id,
        horizon_start=_START,
        horizon_end=_END,
        edges=edges,
        graph_hash="0" * 64,
    )


class TestObjectRiskAggregates:
    def test_object_with_no_incident_edge_scores_zero(self):
        """Losing your edges is a real outcome and must stay measurable as 0.0."""
        graph = _graph(
            (
                RiskEdge(A, B, "PC", 3.0e-4, _feature(), {}),
                RiskEdge(A, C, "CONJUNCTION_EXPOSURE", 1.0, _feature(), {}),
            )
        )
        assert graph.object_risk(C, "PC") == 0.0

    @pytest.mark.parametrize("channel", ["PC", "MAX_PC", "CONJUNCTION_EXPOSURE"])
    def test_channels_report_population_honestly(self, channel: str):
        populated = _graph((RiskEdge(A, B, channel, 1.0, _feature(), {}),))
        assert populated.has_channel(channel) is True
        assert channel in populated.channels()
        empty = _graph((RiskEdge(A, B, "MISS_DISTANCE", 1.0, _feature(), {}),))
        assert empty.has_channel(channel) is False
        assert channel not in empty.channels()


class TestInterventionRemovedTheChannel:
    """Case (b): the counterfactual lost the channel BECAUSE of the intervention."""

    def _graphs(self):
        baseline = _graph(
            (
                RiskEdge(A, B, "PC", 4.2e-5, _feature(), {}),
                RiskEdge(A, B, "CONJUNCTION_EXPOSURE", 2.0, _feature(), {}),
                RiskEdge(B, C, "CONJUNCTION_EXPOSURE", 3.0, _feature(), {}),
            ),
            snapshot_id="baseline",
        )
        # Edge deletion removes every edge touching A, and the PC channel goes
        # with them because A carried the only one.
        scenario = _graph(
            (RiskEdge(B, C, "CONJUNCTION_EXPOSURE", 3.0, _feature(), {}),),
            snapshot_id="scenario",
        )
        return baseline, scenario

    def test_full_value_benefit_is_correct_and_still_attributed(self):
        baseline, scenario = self._graphs()
        config = ScenarioConfig(
            metric_types=("PC", "CONJUNCTION_EXPOSURE"),
            thresholds={"PC": 0.0, "CONJUNCTION_EXPOSURE": 0.0},
        )
        attributions = attribute_direct_beneficiaries(
            baseline, scenario, A, config, baseline_provenance={"baseline_graph_id": "g0"}
        )
        by_metric = {a.metric_type: a for a in attributions}
        assert "PC" in by_metric, (
            "removing the object that carried the only PC edge really does "
            "eliminate that risk; suppressing it would hide a true benefit"
        )
        assert by_metric["PC"].benefit_value == pytest.approx(4.2e-5)
        assert by_metric["CONJUNCTION_EXPOSURE"].benefit_value == pytest.approx(2.0)

    def test_edge_deletion_raises_no_parity_warning(self):
        baseline, scenario = self._graphs()
        assert channel_parity_warnings(baseline, scenario, ("PC", "CONJUNCTION_EXPOSURE")) == []


class TestRecomputeCannotProduceTheChannel:
    """Case (a): the counterfactual path could never emit the channel."""

    def _graphs(self):
        baseline = _graph(
            (
                RiskEdge(A, B, "PC", 3.0e-4, _feature(), {}),
                RiskEdge(B, C, "PC", 1.0e-4, _feature(), {}),
                RiskEdge(B, C, "CONJUNCTION_EXPOSURE", 2.0, _feature(), {}),
            ),
            snapshot_id="baseline",
        )
        scenario = _graph(
            (RiskEdge(B, C, "CONJUNCTION_EXPOSURE", 2.0, _feature(), {}),),
            snapshot_id="scenario",
        )
        return baseline, scenario

    def test_no_pc_benefit_is_attributed(self):
        baseline, scenario = self._graphs()
        config = ScenarioConfig(
            metric_types=("PC", "CONJUNCTION_EXPOSURE"),
            thresholds={"PC": 0.0, "CONJUNCTION_EXPOSURE": 0.0},
        )
        attributions = attribute_direct_beneficiaries(
            baseline,
            scenario,
            A,
            config,
            baseline_provenance={"baseline_graph_id": "g0"},
            counterfactual_channels=PHYSICAL_RECOMPUTE_CHANNELS,
        )
        assert not [a for a in attributions if a.metric_type == "PC"], (
            "a baseline PC was differenced against a recompute that cannot "
            "produce PC, publishing the whole baseline value as a benefit"
        )

    def test_the_refusal_is_recorded_not_silent(self):
        baseline, scenario = self._graphs()
        warnings = channel_parity_warnings(
            baseline, scenario, ("PC", "CONJUNCTION_EXPOSURE"), PHYSICAL_RECOMPUTE_CHANNELS
        )
        assert [w["code"] for w in warnings] == [CHANNEL_ABSENT_IN_COUNTERFACTUAL]
        assert warnings[0]["metric_type"] == "PC"
        assert warnings[0]["data_status"] == "INSUFFICIENT_DATA"

    def test_the_producible_channel_still_attributes_benefit(self):
        baseline, scenario = self._graphs()
        config = ScenarioConfig(
            metric_types=("CONJUNCTION_EXPOSURE",),
            thresholds={"CONJUNCTION_EXPOSURE": 0.0},
        )
        baseline_with_target_exposure = _graph(
            baseline.edges + (RiskEdge(A, B, "CONJUNCTION_EXPOSURE", 5.0, _feature(), {}),),
            snapshot_id="baseline",
        )
        attributions = attribute_direct_beneficiaries(
            baseline_with_target_exposure,
            scenario,
            A,
            config,
            baseline_provenance={"baseline_graph_id": "g0"},
            counterfactual_channels=PHYSICAL_RECOMPUTE_CHANNELS,
        )
        benefits = {a.beneficiary_object_id: a.benefit_value for a in attributions}
        assert benefits.get(B) == pytest.approx(5.0)

    def test_physical_recompute_declares_it_cannot_emit_probability_channels(self):
        assert "CONJUNCTION_EXPOSURE" in PHYSICAL_RECOMPUTE_CHANNELS
        assert "PC" not in PHYSICAL_RECOMPUTE_CHANNELS
        assert "MAX_PC" not in PHYSICAL_RECOMPUTE_CHANNELS
