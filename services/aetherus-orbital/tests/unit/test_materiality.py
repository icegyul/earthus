"""A stored snapshot has to be worth storing.

Every screening run used to append a row per candidate whether or not the
assessment had moved. Measured over the stored history, five snapshots in six
recorded that the screener had run again rather than that the conjunction had
changed — and a repeat run measured here writes 200 rows where it used to write
1,461.

These tests hold the two halves of that rule: noise does not become a record,
and a real change is never mistaken for noise.
"""

from __future__ import annotations

import pytest

from backend.conjunction.materiality import (
    ALWAYS_MATERIAL,
    MATERIAL_CHANGE_POLICY,
    RESOLUTION,
    SNAPSHOT_CHANNELS,
    materially_different,
)

CH = SNAPSHOT_CHANNELS


def _assessment(**overrides):
    base = {
        "miss_distance_m": 4772.0,
        "relative_speed_mps": 14300.0,
        "pc": None,
        "pc_status": "NOT_COMPUTED",
        "pc_unavailable_reason": "COVARIANCE_MISSING_PUBLIC_GP",
        "covariance_status": "INSUFFICIENT_DATA",
        "max_pc": None,
        "max_pc_status": "NOT_COMPUTED",
        "dilution_state": None,
        "boundary_flag": False,
        "geometry_basis": "COMPUTED_INTERNAL",
        "source_grade": "PUBLIC_GP",
    }
    return {**base, **overrides}


class TestNoiseDoesNotBecomeARecord:
    def test_a_ninth_decimal_difference_is_not_a_change(self):
        """The exact values that motivated this rule, from the stored history."""
        before = _assessment(miss_distance_m=2368.8409795537696)
        after = _assessment(miss_distance_m=2368.840979530972)
        moved, channels = materially_different(before, after, channels=CH)
        assert moved is False and channels == []

    def test_an_identical_assessment_is_not_a_change(self):
        moved, _ = materially_different(_assessment(), _assessment(), channels=CH)
        assert moved is False

    def test_a_field_outside_the_allowlist_cannot_make_a_change(self):
        """The first version of this rule counted screening_run_id as a change."""
        before = _assessment()
        after = {**_assessment(), "screening_run_id": "run-2", "input_hash": "abc"}
        moved, _ = materially_different(before, after, channels=CH)
        assert moved is False


class TestARealChangeIsNeverMissed:
    def test_a_first_assessment_is_always_material(self):
        moved, channels = materially_different(None, _assessment(), channels=CH)
        assert moved is True and channels == ["FIRST_ASSESSMENT"]

    def test_a_metre_of_movement_is_a_change(self):
        moved, channels = materially_different(
            _assessment(miss_distance_m=2368.0),
            _assessment(miss_distance_m=2369.5),
            channels=CH,
        )
        assert moved is True and channels == ["miss_distance_m"]

    def test_exactly_the_resolution_counts_as_a_change(self):
        """The boundary is inclusive, so a metre is a metre."""
        moved, _ = materially_different(
            _assessment(miss_distance_m=2368.0),
            _assessment(miss_distance_m=2368.0 + RESOLUTION["miss_distance_m"]),
            channels=CH,
        )
        assert moved is True

    @pytest.mark.parametrize(
        ("channel", "value"),
        [
            ("pc_status", "COMPUTED"),
            ("covariance_status", "AVAILABLE"),
            ("geometry_basis", "OBSERVED_EXTERNAL"),
            ("boundary_flag", True),
            ("source_grade", "OPERATOR"),
        ],
    )
    def test_a_status_change_is_material_at_any_magnitude(self, channel, value):
        """These say what kind of statement the row is, and that is never noise."""
        assert channel in ALWAYS_MATERIAL
        moved, channels = materially_different(
            _assessment(), _assessment(**{channel: value}), channels=CH
        )
        assert moved is True and channel in channels

    def test_a_probability_compares_by_ratio_not_by_metres(self):
        """1e-9 to 1e-6 is tiny in absolute terms and is the whole story."""
        moved, channels = materially_different(
            _assessment(pc=1e-9), _assessment(pc=1e-6), channels=CH
        )
        assert moved is True and "pc" in channels

    def test_a_probability_that_barely_moved_is_not_a_change(self):
        moved, _ = materially_different(
            _assessment(pc=1.0e-6), _assessment(pc=1.001e-6), channels=CH
        )
        assert moved is False


class TestThePolicyIsShared:
    def test_the_promotion_path_uses_this_module(self):
        """Two copies of 'how much is a real change' become two answers."""
        from aetherus_integration import conjunction_promotion

        assert conjunction_promotion.MATERIAL_CHANGE_POLICY is MATERIAL_CHANGE_POLICY
        assert conjunction_promotion.materially_different is materially_different

    def test_the_policy_version_is_reported(self):
        assert MATERIAL_CHANGE_POLICY == "SCREENING_MATERIAL_CHANGE_V1"
