"""A screening run cannot start work nobody bounded.

A browser test clicked through the P5 panel, the defaults in config started a
2,000-object screening over a 24-hour window, and the API server burned 500
seconds of CPU while `/ui/` went from 0.32 s to no response in 35 s. That
combination had never been run, so nothing had ever told anyone it was a
runaway.

These tests hold the guard and the line it draws: every configuration that has
actually completed still starts, and the one that ran away does not.
"""

from __future__ import annotations

import pytest

from backend.config import settings
from backend.conjunction.budget import check_screening_budget
from backend.conjunction.errors import ScreeningBudgetExceeded

BUDGET = settings.screening_max_object_hours


def _check(objects: int, window_hours: float):
    return check_screening_budget(
        objects=objects, window_hours=window_hours, budget=BUDGET
    )


class TestEveryMeasuredRunStillStarts:
    """A guard that refuses work somebody has already done gets turned off."""

    @pytest.mark.parametrize(
        ("objects", "window_hours", "measured_seconds"),
        [
            (2000, 0.25, 34),      # 2,000 x 15min
            (2000, 2.0, 429),      # 2,000 x 2h  — the new default
            (19657, 0.25, 2026),   # full-catalogue benchmark
            (1998, 6.0, 2844),     # largest run ever completed
            (150, 6.0, None),      # the scope the test suite uses
        ],
    )
    def test_a_completed_configuration_is_permitted(self, objects, window_hours, measured_seconds):
        assert _check(objects, window_hours) == objects * window_hours

    def test_the_defaults_fit_the_budget(self):
        """If the shipped defaults could not start, the guard is misconfigured."""
        _check(settings.screening_max_objects, settings.screening_window_hours)
        _check(settings.screening_max_objects, settings.benefit_horizon_hours)


class TestTheRunawayIsRefused:
    def test_the_combination_that_blocked_the_api_is_refused(self):
        """2,000 objects x 24 h — the observed runaway, worst case 5.5 hours."""
        with pytest.raises(ScreeningBudgetExceeded) as caught:
            _check(2000, 24.0)
        assert caught.value.details["requested"] == 48000

    def test_the_refusal_names_what_to_reduce(self):
        """'Too big' with no number is a dead end for whoever hits it."""
        with pytest.raises(ScreeningBudgetExceeded) as caught:
            _check(2000, 24.0)
        message = str(caught.value)
        assert "48,000 object-hours" in message
        assert f"{BUDGET:,.0f} object-hour budget" in message
        assert "Reduce the window to" in message

    def test_the_refusal_is_machine_readable(self):
        """A caller who asked for too much made a request error, not a server fault.

        Raising a bare ValueError produced a 500 with no numbers in it.
        """
        with pytest.raises(ScreeningBudgetExceeded) as caught:
            _check(19657, 24.0)
        error = caught.value
        assert error.status == "SCREEN_BUDGET_EXCEEDED"
        details = error.details
        assert details["unit"] == "OBJECT_HOURS"
        assert details["requested"] > details["budget"]
        assert details["predicted_seconds_worst_case"] > 0
        # The one number that tells the caller what to do next.
        assert 0 < details["max_window_hours_at_this_population"] < 24.0

    def test_the_full_catalogue_at_the_old_default_is_refused(self):
        """19,657 x 24 h was reachable through the API and never measured."""
        with pytest.raises(ScreeningBudgetExceeded):
            _check(19657, 24.0)


class TestTheGuardIsNotClamping:
    def test_an_oversized_request_raises_rather_than_shrinking(self):
        """Trimming the window would answer a different question silently."""
        with pytest.raises(ScreeningBudgetExceeded):
            _check(2000, 24.0)

    def test_work_is_judged_on_the_scope_that_will_run(self):
        """A scoped run pays for its own scope, not the catalogue size."""
        assert _check(150, 6.0) == 900


class TestDegenerateInputs:
    @pytest.mark.parametrize(("objects", "window_hours"), [(0, 24.0), (2000, 0.0), (0, 0.0)])
    def test_nothing_to_do_is_not_a_budget_failure(self, objects, window_hours):
        assert _check(objects, window_hours) == 0.0


class TestTheCeilingsMovedTogether:
    def test_the_window_ceiling_is_no_longer_a_week(self):
        """168 hours was seven days of unmeasured work permitted by contract."""
        from backend.conjunction.service import MAX_WINDOW_HOURS

        assert MAX_WINDOW_HOURS == 24.0

    def test_the_baseline_horizon_ceiling_matches(self):
        from backend.benefit.service import MAX_HORIZON_HOURS

        assert MAX_HORIZON_HOURS == 24.0

    def test_the_defaults_are_the_measured_two_hours(self):
        assert settings.screening_window_hours == 2.0
        assert settings.benefit_horizon_hours == 2.0
