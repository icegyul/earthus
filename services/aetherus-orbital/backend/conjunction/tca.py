"""Precise TCA refinement: coarse samples -> brackets -> scalar minimization.

Per ALGORITHM_SPEC.md the refinement minimizes the squared relative distance
inside every candidate bracket and reports the global minimum together with a
boundary flag and the relative velocity at TCA.
"""

import math
from collections.abc import Callable
from datetime import datetime, timedelta

from backend.conjunction.models import TcaResult

StateFn = Callable[[datetime], tuple[tuple[float, float, float], tuple[float, float, float]]]

_GOLDEN_RATIO = (math.sqrt(5.0) - 1.0) / 2.0
_TIME_TOLERANCE_SECONDS = 1e-4


def _squared_distance(state_a: StateFn, state_b: StateFn, t: datetime) -> float:
    r_a, _ = state_a(t)
    r_b, _ = state_b(t)
    dr = (r_a[0] - r_b[0], r_a[1] - r_b[1], r_a[2] - r_b[2])
    return dr[0] * dr[0] + dr[1] * dr[1] + dr[2] * dr[2]


def _golden_section_minimize(
    state_a: StateFn,
    state_b: StateFn,
    left: datetime,
    right: datetime,
) -> datetime:
    """Deterministically minimize squared distance inside one bracket."""
    span = (right - left).total_seconds()
    if span <= 0:
        return left
    interior_left = right - timedelta(seconds=span * _GOLDEN_RATIO)
    interior_right = left + timedelta(seconds=span * _GOLDEN_RATIO)
    f_left = _squared_distance(state_a, state_b, interior_left)
    f_right = _squared_distance(state_a, state_b, interior_right)
    while span > _TIME_TOLERANCE_SECONDS:
        if f_left <= f_right:
            right = interior_right
            interior_right = interior_left
            f_right = f_left
            span = (right - left).total_seconds()
            interior_left = right - timedelta(seconds=span * _GOLDEN_RATIO)
            f_left = _squared_distance(state_a, state_b, interior_left)
        else:
            left = interior_left
            interior_left = interior_right
            f_left = f_right
            span = (right - left).total_seconds()
            interior_right = left + timedelta(seconds=span * _GOLDEN_RATIO)
            f_right = _squared_distance(state_a, state_b, interior_right)
    midpoint = left + timedelta(seconds=(right - left).total_seconds() / 2.0)
    candidates = (left, midpoint, right)
    return min(candidates, key=lambda t: _squared_distance(state_a, state_b, t))


def find_tca(
    state_a: StateFn,
    state_b: StateFn,
    window_start: datetime,
    window_stop: datetime,
    coarse_step_seconds: int,
) -> TcaResult:
    """Refine the closest approach between two states across one bounded window."""
    if window_stop <= window_start:
        raise ValueError("TCA window stop must be later than window start")
    if coarse_step_seconds < 1:
        raise ValueError("coarse_step_seconds must be a positive integer")

    grid: list[datetime] = []
    cursor = window_start
    while cursor < window_stop:
        grid.append(cursor)
        cursor += timedelta(seconds=coarse_step_seconds)
    grid.append(window_stop)

    squared = [_squared_distance(state_a, state_b, t) for t in grid]

    brackets: list[tuple[datetime, datetime]] = []
    for i in range(1, len(grid) - 1):
        if squared[i] <= squared[i - 1] and squared[i] <= squared[i + 1]:
            brackets.append((grid[i - 1], grid[i + 1]))
    # Boundary windows can hold a monotone minimum at either edge of the window.
    brackets.append((grid[0], grid[1]))
    brackets.append((grid[-2], grid[-1]))

    best_time: datetime | None = None
    best_squared = math.inf
    refined_brackets = 0
    for left, right in brackets:
        refined = _golden_section_minimize(state_a, state_b, left, right)
        value = _squared_distance(state_a, state_b, refined)
        refined_brackets += 1
        if value < best_squared:
            best_squared = value
            best_time = refined

    if best_time is None:
        raise ValueError("TCA refinement produced no candidate")

    miss_distance_m = math.sqrt(best_squared) * 1000.0
    r_a, v_a = state_a(best_time)
    r_b, v_b = state_b(best_time)
    relative_velocity = (
        (v_a[0] - v_b[0]) * 1000.0,
        (v_a[1] - v_b[1]) * 1000.0,
        (v_a[2] - v_b[2]) * 1000.0,
    )
    relative_speed = math.sqrt(sum(component**2 for component in relative_velocity))

    edge_tolerance = timedelta(seconds=_TIME_TOLERANCE_SECONDS * 10)
    boundary_flag = (
        best_time - window_start <= edge_tolerance
        or window_stop - best_time <= edge_tolerance
    )

    return TcaResult(
        tca_utc=best_time,
        miss_distance_m=miss_distance_m,
        relative_velocity_mps=relative_velocity,
        relative_speed_mps=relative_speed,
        boundary_flag=boundary_flag,
        refined_brackets=refined_brackets,
    )


def relative_speed_mps(v_a: tuple[float, float, float], v_b: tuple[float, float, float]) -> float:
    """Relative speed in m/s between two km/s velocity vectors."""
    return math.sqrt(
        ((v_a[0] - v_b[0]) ** 2)
        + ((v_a[1] - v_b[1]) ** 2)
        + ((v_a[2] - v_b[2]) ** 2)
    ) * 1000.0
