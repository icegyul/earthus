"""A screening run has to fit in a bounded amount of work.

A browser test clicked through the P5 panel and started a screening with the
defaults that were sitting in config — 2,000 objects over a 24-hour window. The
API server then burned 500 seconds of CPU with no output and stopped answering
``/health`` at all; ``/ui/`` went from 0.32 s to no response in 35 s. Nobody had
ever run that combination, so nobody knew it was a runaway.

The guard is a budget on ``objects × window_hours``, and that product is used
because it predicts the measured cost about as well as anything simple can:

======================  =============  ========  =================
run                     object-hours   measured  s per object-hour
======================  =============  ========  =================
2,000 obj x 0.25 h                500      34 s              0.068
2,000 obj x 2 h                 3,996     429 s              0.107
19,657 obj x 0.25 h             4,914   2,026 s              0.412
2,000 obj x 6 h                11,988   2,844 s              0.237
======================  =============  ========  =================

The budget sits just above the largest measured run (11,988 object-hours, which
completed in 47 minutes), because a guard that refuses work somebody has already
done successfully is a guard that will be turned off. The combination that ran
away — 2,000 x 24 h = 48,000 object-hours, worst case 5.5 hours — is four times
over and is refused.

Keeping the ordinary path quick is the defaults' job, not the budget's: the
screening window and the benefit horizon both default to 2 hours, which is 4,000
object-hours at the default population and was measured at 429 s.

**Refused, not silently clamped.** Trimming the window would answer a different
question than the caller asked and hand back a shorter horizon that looks like
the requested one. The population bound (``max_objects``) does clamp, but it
also reports ``population_truncated``; a window has no such label, so the honest
move is to say no and name what to reduce.
"""

from __future__ import annotations

from backend.conjunction.errors import ScreeningBudgetExceeded

#: What the budget is denominated in, so a caller can report the rule it hit.
BUDGET_UNIT = "OBJECT_HOURS"

#: Slowest rate observed across the four measured runs above. Used only to put a
#: human-readable duration in the refusal, never to decide it.
WORST_SECONDS_PER_OBJECT_HOUR = 0.412


def _refusal(*, objects: int, window_hours: float, budget: float) -> ScreeningBudgetExceeded:
    """Build the refusal with every number the caller needs to act on."""
    requested = objects * window_hours
    predicted = requested * WORST_SECONDS_PER_OBJECT_HOUR
    affordable_hours = budget / objects if objects else 0.0
    return ScreeningBudgetExceeded(
        f"screening work {requested:,.0f} object-hours "
        f"({objects:,} objects x {window_hours:g} h) exceeds the "
        f"{budget:,.0f} object-hour budget; at the slowest measured rate that is "
        f"about {predicted / 60:.0f} minutes. "
        f"Reduce the window to {affordable_hours:.2f} h or fewer at this "
        f"population, or lower max_objects.",
        {
            "unit": BUDGET_UNIT,
            "requested": round(requested, 1),
            "budget": budget,
            "objects": objects,
            "window_hours": window_hours,
            "predicted_seconds_worst_case": round(predicted),
            "max_window_hours_at_this_population": round(affordable_hours, 2),
        },
    )


def check_screening_budget(*, objects: int, window_hours: float, budget: float) -> float:
    """Refuse a run that is larger than the budget; return the work it will do.

    ``objects`` is the population that will actually be propagated, not the
    catalogue size, so a scoped run is judged on its own scope.
    """
    if objects <= 0 or window_hours <= 0:
        return 0.0
    work = objects * float(window_hours)
    if work > budget:
        raise _refusal(
            objects=objects, window_hours=float(window_hours), budget=float(budget)
        )
    return work
