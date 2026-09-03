"""When a re-screened conjunction is actually saying something new.

The snapshot table is append-only, and every screening run wrote a row for every
candidate whether or not the assessment had moved. Measured over the stored
history, five snapshots in six carried no new information: repeated screening of
identical input produces miss distances that differ in the ninth decimal place,
because public GP geometry is not resolved anywhere near that finely.

Those rows are not free. They are the bulk of the conjunction store, they are
the bulk of what a scheduled screening would cost to keep, and they bury the
conjunctions that genuinely moved.

So a write needs a reason, and the reason is stated here rather than guessed per
caller. Two callers use it and they must not drift apart:

* ``backend.conjunction.service`` decides whether to append a snapshot at all.
* ``aetherus_integration.conjunction_promotion`` decides whether a promoted
  conjunction earns a new Intelligence revision.

They read different schemas - one has the snapshot's metric keys, the other the
adapter's payload keys - so each names its own channels and both share the
physical resolutions and the comparison itself. A second copy of "how much is a
real change" is how two answers to one question appear.
"""

from __future__ import annotations

from typing import Any, Iterable

#: Version travels with every outcome, so a record written under one rule can be
#: told from one written under another.
MATERIAL_CHANGE_POLICY = "SCREENING_MATERIAL_CHANGE_V1"

#: Absolute resolution below which a numeric channel is treated as unchanged.
#: These are physical, not tuning knobs: screening-grade geometry derived from
#: public GP elements is not meaningful below the metre, and a difference under
#: it is the arithmetic talking to itself.
RESOLUTION: dict[str, float] = {
    "miss_distance_m": 1.0,
    "relative_speed_mps": 1.0,
}

#: Probability channels, where the scale is not fixed. A move from 1e-9 to 1e-6
#: is tiny in absolute terms and is the whole story, so these compare by ratio.
RELATIVE_CHANNELS = frozenset({"pc", "max_pc"})
RELATIVE_FRACTION = 0.01

#: Channels where any change at all is material regardless of magnitude: they
#: say what *kind* of statement the row is, and that is never noise.
ALWAYS_MATERIAL = frozenset({
    "pc_status", "pc_unavailable_reason", "max_pc_status", "max_pc_basis",
    "geometry_basis", "validation_state", "covariance_status", "event_status",
    "dilution_state", "boundary_flag", "tca_boundary_flag", "tca",
    "source_grade",
})


def materially_different(
    previous: dict[str, Any] | None,
    current: dict[str, Any],
    *,
    channels: Iterable[str],
) -> tuple[bool, list[str]]:
    """Whether the assessment moved, and which channels moved.

    ``channels`` is an allowlist, deliberately, and the caller names it. The
    first version of this rule was the other way round - everything except a
    list of provenance keys - and it went wrong immediately: it recorded 870
    revisions whose reasons were ``config_hash``, ``input_hash`` and
    ``screening_run_id``, which change every time the screener runs and never
    because the conjunction moved.

    An exclusion list has to anticipate every provenance field anyone will ever
    add. An allowlist fails the other way: a new field is ignored until somebody
    decides it is an assessment, and one revision that should have fired is
    easier to notice than a thousand that should not have.

    No previous assessment means this is the first sighting, which is always
    material - there is nothing to compare it against.
    """
    if previous is None:
        return True, ["FIRST_ASSESSMENT"]

    moved: list[str] = []
    for channel in channels:
        if channel not in current:
            continue
        after = current[channel]
        before = previous.get(channel)

        if channel in ALWAYS_MATERIAL:
            if before != after:
                moved.append(channel)
            continue

        if isinstance(after, (int, float)) and isinstance(before, (int, float)):
            if channel in RELATIVE_CHANNELS:
                scale = max(abs(before), abs(after))
                if scale > 0 and abs(after - before) / scale >= RELATIVE_FRACTION:
                    moved.append(channel)
                continue
            resolution = RESOLUTION.get(channel)
            if resolution is None:
                if before != after:
                    moved.append(channel)
            elif abs(after - before) >= resolution:
                moved.append(channel)
            continue

        if before != after:
            moved.append(channel)

    return bool(moved), sorted(moved)


#: The snapshot metric keys that constitute the conjunction's assessment.
#: Everything else on a snapshot describes the observation - which run produced
#: it, which model version, what the input hash was - and changes on every
#: refresh whether or not the conjunction did.
SNAPSHOT_CHANNELS = frozenset({
    "miss_distance_m", "relative_speed_mps",
    "pc", "pc_status", "pc_unavailable_reason", "covariance_status",
    "max_pc", "max_pc_status",
    "dilution_state", "boundary_flag", "geometry_basis", "source_grade",
})
