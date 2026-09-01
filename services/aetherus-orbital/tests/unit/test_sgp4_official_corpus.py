"""Independent cross-validation against Vallado's official SGP4 reference corpus.

The expected TEME states ship inside the trusted `sgp4` distribution as
`SGP4-VER.TLE` plus the reference C++ output file `tcppver.out`.  Production
receives OMM-equivalent mean elements only; no TLE line is ever parsed by
production code here.
"""

import math
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import sgp4
from sgp4.api import Satrec

from backend.orbit.errors import PropagationError
from backend.orbit.frames import FrameAssumptions
from backend.orbit.models import MeanElements
from backend.orbit.propagator import Sgp4Propagator

_POSITION_TOLERANCE_KM = 1e-4
_VELOCITY_TOLERANCE_KM_S = 1e-7
_EXPECTED_NONZERO_ERROR_CODES = [1, 1, 6, 6, 4, 3, 6]
_HEADER_PATTERN = re.compile(r"^\s*(\d+)\s+xx\s*$")
_PACKAGE_DIR = Path(sgp4.__file__).parent


def _reference_cases() -> list[tuple[str, str]]:
    """Return every (line1, line2) element-set pair from the official corpus."""
    lines = (_PACKAGE_DIR / "SGP4-VER.TLE").read_text(encoding="ascii").splitlines()
    pairs: list[tuple[str, str]] = []
    pending_line1: str | None = None
    for line in lines:
        stripped = line.rstrip()
        if stripped.startswith("1 ") and len(stripped) > 40:
            pending_line1 = stripped
        elif stripped.startswith("2 ") and pending_line1 is not None:
            pairs.append((pending_line1, stripped))
            pending_line1 = None
    return pairs


def _expected_blocks() -> list[tuple[int, list[tuple[float, list[float], list[float]]]]]:
    """Parse tcppver.out into ordered (satnum, rows) blocks."""
    blocks: list[tuple[int, list[tuple[float, list[float], list[float]]]]] = []
    current_rows: list[tuple[float, list[float], list[float]]] | None = None
    current_satnum: int | None = None
    for line in (_PACKAGE_DIR / "tcppver.out").read_text(encoding="ascii").splitlines():
        header = _HEADER_PATTERN.match(line)
        if header:
            current_satnum = int(header.group(1))
            current_rows = []
            blocks.append((current_satnum, current_rows))
            continue
        if current_rows is None or "xx" in line or "Use previous" in line:
            continue
        fields = line.split()
        if len(fields) < 7:
            continue
        try:
            values = [float(field) for field in fields[:7]]
        except ValueError:
            continue
        current_rows.append((values[0], values[1:4], values[4:7]))
    return blocks


def _epoch_datetime(satrec: Satrec) -> datetime:
    unix_seconds = ((satrec.jdsatepoch - 2440587.5) + satrec.jdsatepochF) * 86400.0
    return datetime.fromtimestamp(unix_seconds, tz=UTC)


def _omm_equivalent_elements(satrec: Satrec) -> MeanElements:
    """Reverse-map reference attributes into canonical OMM units for production."""
    ndot_units = 1036800.0 / math.pi
    nddot_units = 2985984000.0 / 2.0 / math.pi
    radians_to_degrees = 180.0 / math.pi
    return MeanElements(
        catalog_id=str(satrec.satnum),
        epoch=_epoch_datetime(satrec),
        frame="TEME",
        time_system="UTC",
        theory="SGP4",
        mean_elements={
            "mean_motion_rev_per_day": satrec.no_kozai * 720.0 / math.pi,
            "eccentricity": satrec.ecco,
            "inclination_deg": satrec.inclo * radians_to_degrees,
            "ra_of_asc_node_deg": satrec.nodeo * radians_to_degrees,
            "arg_of_pericenter_deg": satrec.argpo * radians_to_degrees,
            "mean_anomaly_deg": satrec.mo * radians_to_degrees,
            "bstar": satrec.bstar,
            "mean_motion_dot": satrec.ndot * ndot_units,
            "mean_motion_ddot": satrec.nddot * nddot_units,
        },
    )


def test_production_omm_path_matches_official_reference_corpus():
    """Every reachable corpus state must match through the production OMM path."""
    blocks = _expected_blocks()
    cases = _reference_cases()
    assert len(blocks) == len(cases) >= 30

    error_codes_observed: list[int] = []
    compared_states = 0
    worst_position_error = 0.0
    worst_velocity_error = 0.0

    for (line1, line2), (block_satnum, expected_rows) in zip(cases, blocks, strict=False):
        reference = Satrec.twoline2rv(line1, line2)
        assert reference.satnum == block_satnum
        propagator = Sgp4Propagator(
            _omm_equivalent_elements(reference), FrameAssumptions(ut1_utc_offset_seconds=0.0)
        )

        def compare(sample, expected_r: list[float], expected_v: list[float]) -> float:
            nonlocal worst_position_error, worst_velocity_error, compared_states
            position_error = max(
                abs(actual - expected) for actual, expected in zip(sample.r_teme_km, expected_r, strict=False)
            )
            velocity_error = max(
                abs(actual - expected) for actual, expected in zip(sample.v_teme_km_s, expected_v, strict=False)
            )
            worst_position_error = max(worst_position_error, position_error)
            worst_velocity_error = max(worst_velocity_error, velocity_error)
            compared_states += 1
            return max(position_error, velocity_error * 1e3)

        try:
            epoch_sample = propagator.propagate_minutes(0.0)
        except PropagationError as error:
            error_codes_observed.append(int(error.details["sgp4_error_code"]))
            continue
        rows_by_time = {round(row[0], 6): row for row in expected_rows}
        epoch_row = rows_by_time.get(0.0)
        if epoch_row is not None:
            penalty = compare(epoch_sample, epoch_row[1], epoch_row[2])
            assert penalty < _POSITION_TOLERANCE_KM, (
                f"SAT {reference.satnum} epoch drift={penalty}"
            )

        tstart, tend, tstep = (float(field) for field in line2[69:].split())
        tsince = tstart
        while True:
            reached_end = tsince > tend
            current = tend if reached_end else tsince
            try:
                sample = propagator.propagate_minutes(current)
            except PropagationError as error:
                error_codes_observed.append(int(error.details["sgp4_error_code"]))
                break
            matched_row = rows_by_time.get(round(current, 6))
            if matched_row is not None:
                penalty = compare(sample, matched_row[1], matched_row[2])
                assert penalty < _POSITION_TOLERANCE_KM, (
                    f"SAT {reference.satnum} tsince={current}: drift={penalty}"
                )
            if reached_end:
                break
            if tsince == tstart == 0.0:
                tsince = tstep
                continue
            tsince += tstep

    assert compared_states >= 700, f"Only {compared_states} reference states were compared"
    assert error_codes_observed == _EXPECTED_NONZERO_ERROR_CODES, (
        error_codes_observed
    )
    assert worst_position_error < _POSITION_TOLERANCE_KM
    assert worst_velocity_error < _VELOCITY_TOLERANCE_KM_S


def test_absolute_time_mapping_agrees_with_minute_offsets():
    """The UTC mapping used by the API must agree with direct minute offsets."""
    line1, line2 = _reference_cases()[2]
    reference = Satrec.twoline2rv(line1, line2)
    elements = _omm_equivalent_elements(reference)
    propagator = Sgp4Propagator(elements, FrameAssumptions(ut1_utc_offset_seconds=0.0))
    for minutes in (-720.0, -15.5, 0.0, 42.25, 1440.0):
        via_offset = propagator.propagate_minutes(minutes)
        via_absolute = propagator.propagate(elements.epoch + timedelta(minutes=minutes))
        gap_seconds = abs(
            (via_absolute.sample_time - via_offset.sample_time).total_seconds()
        )
        assert gap_seconds <= 1e-6
        drift_km = max(
            abs(a - e) for a, e in zip(via_absolute.r_teme_km, via_offset.r_teme_km, strict=False)
        )
        assert drift_km <= 1e-3, f"UTC mapping drift {drift_km} km at {minutes} minutes"


def test_decayed_object_raises_instead_of_returning_values():
    """A decayed trajectory must surface an explicit QUARANTINE state, never NaN."""
    line1, line2 = next(
        (first, second)
        for first, second in _reference_cases()
        if Satrec.twoline2rv(first, second).satnum == 28872
    )
    reference = Satrec.twoline2rv(line1, line2)
    propagator = Sgp4Propagator(
        _omm_equivalent_elements(reference), FrameAssumptions(ut1_utc_offset_seconds=0.0)
    )
    with pytest.raises(PropagationError) as raised:
        for minutes in range(0, 120, 5):
            propagator.propagate_minutes(float(minutes))
    assert raised.value.details["sgp4_error_code"] == 6


def test_reference_corpus_files_are_available():
    """The independent truth data must remain present in the trusted package."""
    assert (_PACKAGE_DIR / "SGP4-VER.TLE").exists()
    assert (_PACKAGE_DIR / "tcppver.out").exists()
    assert len(_reference_cases()) >= 30
