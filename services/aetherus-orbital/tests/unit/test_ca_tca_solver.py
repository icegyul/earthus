"""CA-002: TCA refinement against analytically known minima."""

import math
from datetime import UTC, datetime, timedelta

import pytest

from backend.conjunction.tca import find_tca

T0 = datetime(2026, 8, 25, tzinfo=UTC)


def _linear_state(offset, velocity):
    """Straight-line relative motion with an exactly known closest approach."""

    def state_fn(t):
        seconds = (t - T0).total_seconds()
        position = tuple(
            offset[i] + velocity[i] * seconds for i in range(3)
        )
        return position, velocity

    return state_fn


class TestKnownInteriorMinimum:
    def test_interior_minimum_time_and_distance(self):
        # Positions in km, velocities in km/s. At t*=600 s the relative offset
        # is perpendicular to the relative velocity with magnitude exactly
        # 150 m.
        v_rel = (0.300, 0.400, 0.0)  # km/s -> 500 m/s closing geometry
        t_star = 600.0
        perp = (-400.0, 300.0, 0.0)
        norm = math.hypot(*perp)
        unit = tuple(component / norm * 0.150 for component in perp)  # 150 m in km
        start_offset = tuple(-v_rel[i] * t_star + unit[i] for i in range(3))

        state_a = _linear_state((0.0, 0.0, 0.0), (7.500, 0.0, 0.100))
        state_b = _linear_state(start_offset, (7.800, 0.400, 0.100))

        result = find_tca(
            state_a,
            state_b,
            T0,
            T0 + timedelta(seconds=1200),
            coarse_step_seconds=60,
        )

        assert abs(result.miss_distance_m - 150.0) < 0.5
        observed_t = (result.tca_utc - T0).total_seconds()
        assert abs(observed_t - t_star) < 1.0
        assert result.boundary_flag is False
        assert abs(result.relative_speed_mps - 500.0) < 1e-6

    def test_deterministic_reruns_identical(self):
        state_a = _linear_state((10.0, 20.0, 30.0), (7.0, 0.4, 0.2))
        state_b = _linear_state((-900.0, 60.0, -40.0), (6.99, 0.41, 0.19))
        first = find_tca(state_a, state_b, T0, T0 + timedelta(hours=1), coarse_step_seconds=30)
        second = find_tca(state_a, state_b, T0, T0 + timedelta(hours=1), coarse_step_seconds=30)
        assert first == second


class TestBoundaryMinimum:
    def test_minimum_at_window_start_flags_boundary(self):
        # B sits ahead and flees slightly faster: the gap only grows, so the
        # global minimum lies exactly at the window's first instant.
        state_a = _linear_state((0.0, 0.0, 0.0), (7.0, 0.0, 0.0))
        state_b = _linear_state((2.0, 0.0, 0.0), (7.001, 0.0, 0.0))
        result = find_tca(
            state_a,
            state_b,
            T0,
            T0 + timedelta(minutes=40),
            coarse_step_seconds=30,
        )
        assert result.boundary_flag is True
        assert (result.tca_utc - T0).total_seconds() < 1.0

    def test_minimum_at_window_stop_flags_boundary(self):
        # The pair is converging and reaches its minimum after the window.
        state_a = _linear_state((0.0, 0.0, 0.0), (0.0, 0.0, 0.0))
        state_b = _linear_state((50_000.0, 0.0, 0.0), (-10.0, 0.0, 0.0))  # km-scale closing slowly
        result = find_tca(
            state_a,
            state_b,
            T0,
            T0 + timedelta(minutes=10),
            coarse_step_seconds=30,
        )
        assert result.boundary_flag is True


class TestMultipleMinima:
    def test_global_minimum_wins_over_local_ones(self):
        """A wiggled approach produces several local minima; the refinement
        must return the global one, not the first bracket."""

        def state_a(t):
            seconds = (t - T0).total_seconds()
            return ((7.5 * seconds,) + (0.0, 0.0), (7.5, 0.0, 0.0))

        def state_b(t):
            seconds = (t - T0).total_seconds()
            x_km = 9.0 - 3.0 * seconds + 0.2 * math.sin(2.0 * math.pi * seconds / 900.0)
            return ((x_km, 0.0, 0.0), (-3.0, 0.0, 0.0))

        result = find_tca(state_a, state_b, T0, T0 + timedelta(seconds=3600), coarse_step_seconds=15)

        # Analytic global minimum: |9000 - 3000 t + 200 sin(2π t/900)| in metres;
        # the linear crossing near t≈2.93 s dominates every later wiggle minimum.
        assert result.miss_distance_m < 250.0
        observed_t = (result.tca_utc - T0).total_seconds()
        assert 0.0 <= observed_t <= 10.0


class TestWindowValidation:
    def test_inverted_window_rejected(self):
        with pytest.raises(ValueError):
            find_tca(
                _linear_state((0, 0, 0), (1, 0, 0)),
                _linear_state((1, 0, 0), (0, 1, 0)),
                T0 + timedelta(hours=1),
                T0,
                coarse_step_seconds=30,
            )
