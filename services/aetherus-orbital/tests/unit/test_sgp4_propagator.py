"""SGP4 propagator unit tests: determinism, finite states, explicit error states."""

import math
from datetime import UTC, datetime, timedelta

import pytest

from backend.ingestion.omm import parse_omm_document
from backend.orbit.errors import PropagationError
from backend.orbit.frames import FrameAssumptions
from backend.orbit.models import MeanElements
from backend.orbit.propagator import (
    Sgp4Propagator,
    build_config_hash,
    build_satrec_from_mean_elements,
    installed_sgp4_version,
    samples_output_hash,
)

REAL_SNAPSHOT = (
    "artifacts/raw/celestrak_gp/"
    "e746e2d57908e8085bc1364a6c6a43c2b1de1f3fd2502d7b1678d6d800e8b414.json"
)

ASSUMPTIONS = FrameAssumptions(ut1_utc_offset_seconds=0.0)


def iss_elements() -> MeanElements:
    record = parse_omm_document(open(REAL_SNAPSHOT, "rb").read())[0]
    return MeanElements(
        catalog_id=record.catalog_id,
        epoch=record.epoch,
        frame=record.frame,
        time_system=record.time_system,
        theory=record.theory,
        mean_elements=record.mean_elements,
    )


def test_epoch_state_is_finite_and_physically_bounded():
    propagator = Sgp4Propagator(iss_elements(), ASSUMPTIONS)
    sample = propagator.propagate(propagator.elements.epoch)
    norm = math.sqrt(sum(component**2 for component in sample.r_teme_km))
    assert 6600.0 < norm < 7300.0
    speed = math.sqrt(sum(component**2 for component in sample.v_teme_km_s))
    assert 7.0 < speed < 8.0
    assert abs(sample.lat_deg) <= 90.0


def test_forward_and_backward_propagation_from_epoch():
    propagator = Sgp4Propagator(iss_elements(), ASSUMPTIONS)
    for offset_seconds in (-3600, -600, 0, 600, 3600):
        sample = propagator.propagate(
            propagator.elements.epoch + timedelta(seconds=offset_seconds)
        )
        altitude = sample.alt_km
        assert 300.0 < altitude < 550.0


def test_deterministic_output_hash_is_stable_across_recomputation():
    elements = iss_elements()
    first = Sgp4Propagator(elements, ASSUMPTIONS)
    second = Sgp4Propagator(elements, ASSUMPTIONS)
    start = elements.epoch
    samples_a = [
        first.propagate(start + timedelta(seconds=o)) for o in range(-300, 301, 60)
    ]
    samples_b = [
        second.propagate(start + timedelta(seconds=o)) for o in range(-300, 301, 60)
    ]
    assert samples_output_hash(samples_a) == samples_output_hash(samples_b)


def test_different_sample_times_produce_different_hashes():
    propagator = Sgp4Propagator(iss_elements(), ASSUMPTIONS)
    epoch = propagator.elements.epoch
    one = [propagator.propagate(epoch)]
    two = [propagator.propagate(epoch + timedelta(seconds=60))]
    assert samples_output_hash(one) != samples_output_hash(two)


def test_six_digit_catalog_id_initializes_without_truncation():
    """Catalog IDs at 6+ digits initialize SGP4 as integers without width truncation."""
    elements = iss_elements()
    wide = MeanElements(
        catalog_id="123456",
        epoch=elements.epoch,
        frame="TEME",
        time_system="UTC",
        theory="SGP4",
        mean_elements=dict(elements.mean_elements),
    )
    satrec = build_satrec_from_mean_elements(wide)
    assert satrec.satnum == 123456


def test_non_sgp4_theory_is_refused():
    elements = iss_elements()
    refused = MeanElements(
        catalog_id=elements.catalog_id,
        epoch=elements.epoch,
        frame=elements.frame,
        time_system=elements.time_system,
        theory="T20",
        mean_elements=dict(elements.mean_elements),
    )
    with pytest.raises(PropagationError):
        Sgp4Propagator(refused, ASSUMPTIONS)


def test_missing_required_element_is_refused_without_invention():
    elements = iss_elements()
    incomplete = MeanElements(
        catalog_id=elements.catalog_id,
        epoch=elements.epoch,
        frame="TEME",
        time_system="UTC",
        theory="SGP4",
        mean_elements={"eccentricity": elements.mean_elements["eccentricity"]},
    )
    with pytest.raises(PropagationError):
        Sgp4Propagator(incomplete, ASSUMPTIONS)


def test_grid_window_validation():
    propagator = Sgp4Propagator(iss_elements(), ASSUMPTIONS)
    start = datetime(2026, 8, 23, 0, 0, 0, tzinfo=UTC)
    stop = datetime(2026, 8, 23, 0, 10, 0, tzinfo=UTC)
    with pytest.raises(PropagationError) as raised:
        propagator.propagate_grid(stop, start, 60, 1000)
    assert raised.value.status == "INVALID_WINDOW"
    with pytest.raises(PropagationError) as raised_step:
        propagator.propagate_grid(start, stop, 0, 1000)
    assert raised_step.value.status == "INVALID_WINDOW"
    with pytest.raises(PropagationError) as raised_cap:
        propagator.propagate_grid(start, stop, 1, 10)
    assert raised_cap.value.status == "INVALID_WINDOW"
    grid = propagator.propagate_grid(start, stop, 60, 1000)
    assert len(grid) == 11


def test_grid_sample_times_are_spaced_by_the_requested_step():
    """Regression: grid samples must advance by step seconds, not one second."""
    propagator = Sgp4Propagator(iss_elements(), ASSUMPTIONS)
    start = datetime(2026, 8, 23, 0, 0, 0, tzinfo=UTC)
    stop = datetime(2026, 8, 23, 1, 30, 0, tzinfo=UTC)
    grid = propagator.propagate_grid(start, stop, 300, 1000)
    assert len(grid) == 19
    for index, sample in enumerate(grid):
        expected_time = start + timedelta(seconds=index * 300)
        assert sample.sample_time == expected_time
    assert (grid[-1].sample_time - grid[0].sample_time).total_seconds() == 90 * 60


def test_config_hash_tracks_assumptions():
    default_hash = build_config_hash(ASSUMPTIONS)
    shifted_hash = build_config_hash(FrameAssumptions(ut1_utc_offset_seconds=0.5))
    assert default_hash != shifted_hash
    assert len(default_hash) == 64


def test_installed_library_version_is_recorded():
    assert installed_sgp4_version().startswith("2.")
