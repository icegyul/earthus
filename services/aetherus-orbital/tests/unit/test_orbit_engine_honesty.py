"""Regression tests for the fabrications the adversarial audit found in E25/E27/E28/E29.

Each test fails if the corresponding engine goes back to inventing a value, a grade or
a validation state that it never derived from an input.
"""

from __future__ import annotations

import inspect
import random
from datetime import datetime, timedelta, timezone
from math import pi, sin

import pytest
from aetherus_domain import SourceGrade, ValidationState, canonical_hash

from aetherus_orbit.observation import GroundStationVisibilityEngine
from aetherus_orbit.runtime import (
    DebrisGenealogyOriginEngine,
    ObservationPlanningEngine,
    PhotometryRotationIntelligenceEngine,
    ReentryIntelligenceEngine,
)

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


# --------------------------------------------------------------------------- E28


def _clean_sinusoid(period_s: float = 10.0, count: int = 80, step_s: float = 0.5):
    times = [i * step_s for i in range(count)]
    return times, [sin(2 * pi * t / period_s) for t in times]


def test_e28_flat_lightcurve_yields_no_period() -> None:
    """CRITICAL: a lightcurve with zero variance carries no rotation signal."""
    engine = PhotometryRotationIntelligenceEngine()
    times = [i * 0.5 for i in range(40)]
    result = engine.estimate(times, [12.5] * len(times), min_period_s=2, max_period_s=20, steps=200)
    assert result.period_s is None
    assert result.uncertainty_s is None
    assert result.validation_state == ValidationState.INSUFFICIENT_DATA
    assert result.reason == "NO_PHOTOMETRIC_VARIANCE"


def test_e28_white_noise_yields_no_period() -> None:
    """CRITICAL: the argmax of a periodogram always exists; it is not a detection."""
    engine = PhotometryRotationIntelligenceEngine()
    rng = random.Random(20260901)
    times = [i * 0.5 for i in range(80)]
    noise = [rng.gauss(0.0, 1.0) for _ in times]
    result = engine.estimate(times, noise, min_period_s=5, max_period_s=15, steps=401)
    assert result.period_s is None
    assert result.reason == "NO_SIGNIFICANT_PERIODICITY"
    assert result.validation_state == ValidationState.INSUFFICIENT_DATA
    assert result.false_alarm_probability is not None and result.false_alarm_probability > 0.01


def test_e28_real_signal_is_still_recovered() -> None:
    """Removing fabrication must not remove the detection of an actual period."""
    engine = PhotometryRotationIntelligenceEngine()
    times, mags = _clean_sinusoid()
    result = engine.estimate(times, mags, min_period_s=5, max_period_s=15, steps=401)
    assert result.period_s is not None and abs(result.period_s - 10.0) < 0.2
    assert result.false_alarm_probability is not None and result.false_alarm_probability <= 0.01


def test_e28_uncertainty_is_not_the_grid_step() -> None:
    """HIGH: uncertainty_s must react to photometric noise, the grid step must not."""
    engine = PhotometryRotationIntelligenceEngine()
    rng = random.Random(7)
    times, clean = _clean_sinusoid()
    noisy = [value + rng.gauss(0.0, 0.05) for value in clean]

    coarse = engine.estimate(times, noisy, min_period_s=5, max_period_s=15, steps=101)
    fine = engine.estimate(times, noisy, min_period_s=5, max_period_s=15, steps=401)

    assert coarse.grid_step_s is not None and fine.grid_step_s is not None
    assert coarse.grid_step_s > fine.grid_step_s  # the grid changed by a factor of four
    assert coarse.uncertainty_s is not None and fine.uncertainty_s is not None
    # A noise-limited sigma is set by the data, so refining the grid barely moves it.
    assert coarse.uncertainty_s == pytest.approx(fine.uncertainty_s, rel=0.2)
    # And it must not simply equal the grid spacing, which is what the old code returned.
    assert coarse.uncertainty_s != pytest.approx(coarse.grid_step_s, rel=1e-6)

    quiet = engine.estimate(times, clean, min_period_s=5, max_period_s=15, steps=401)
    assert quiet.uncertainty_s is not None
    assert quiet.uncertainty_s < fine.uncertainty_s  # less noise, tighter period


def test_e28_neighbouring_grid_cells_are_not_reported_as_aliases() -> None:
    """HIGH: a clean single peak has no competing period, and ambiguity must not upgrade."""
    engine = PhotometryRotationIntelligenceEngine()
    times, mags = _clean_sinusoid()
    result = engine.estimate(times, mags, min_period_s=5, max_period_s=15, steps=401)
    assert result.aliases == ()
    assert result.reason == "SIGNIFICANT_SINGLE_PEAK"
    assert result.validation_state == ValidationState.VALIDATION_PENDING


def test_e28_alias_ambiguity_lowers_the_validation_state() -> None:
    """HIGH: competing peaks are evidence against confidence, never for it."""
    engine = PhotometryRotationIntelligenceEngine()
    times, mags = _clean_sinusoid()
    single = engine.estimate(times, mags, min_period_s=5, max_period_s=15, steps=401)

    ranked = [ValidationState.RESEARCH_ONLY, ValidationState.VALIDATION_PENDING]
    # Two superposed periods produce two genuinely separate significant peaks.
    two_tone = [sin(2 * pi * t / 10.0) + sin(2 * pi * t / 6.0) for t in times]
    ambiguous = engine.estimate(times, two_tone, min_period_s=5, max_period_s=15, steps=401)
    assert ambiguous.aliases, "a two-period lightcurve must expose the competing period"
    assert ambiguous.reason == "AMBIGUOUS_ALIASES"
    assert ranked.index(ambiguous.validation_state) < ranked.index(single.validation_state)


def test_e28_comments_match_the_single_harmonic_model() -> None:
    """HIGH: the code projects one harmonic, so no comment may claim two."""
    engine = PhotometryRotationIntelligenceEngine()
    times, mags = _clean_sinusoid()
    result = engine.estimate(times, mags, min_period_s=5, max_period_s=15, steps=401)
    assert any(item.startswith("SINGLE_HARMONIC_MODEL") for item in result.limitations)
    source = inspect.getsource(PhotometryRotationIntelligenceEngine).lower()
    assert "two-harmonic" not in source and "two harmonic" not in source


def test_e28_too_few_points_still_reports_insufficient_data() -> None:
    engine = PhotometryRotationIntelligenceEngine()
    assert engine.estimate([0, 1], [1, 2]).validation_state == ValidationState.INSUFFICIENT_DATA


# --------------------------------------------------------------------------- E27


def _tip() -> dict[str, str]:
    return {
        "nominal_utc": "2026-09-01T00:00:00+00:00",
        "window_start_utc": "2026-08-31T20:00:00+00:00",
        "window_end_utc": "2026-09-01T04:00:00+00:00",
    }


def _provenance(tip: dict[str, str]) -> dict[str, str]:
    return {
        "source_uri": "https://example.invalid/tip/2026-09-01.json",
        "retrieved_at_utc": "2026-08-31T23:00:00+00:00",
        "payload_sha256": canonical_hash(tip),
    }


def test_e27_unverified_tip_is_never_validated_or_graded() -> None:
    """HIGH: caller input alone must not earn VALIDATED_PIPELINE or OFFICIAL_PUBLIC."""
    engine = ReentryIntelligenceEngine()
    estimate = engine.ingest_tip("OBJ-1", _tip(), source_id="ANY-CALLER")
    assert estimate.validation_state == ValidationState.UNVALIDATED
    assert estimate.grade == SourceGrade.UNKNOWN
    assert estimate.provenance_status == "PROVENANCE_MISSING"


def test_e27_never_emits_validated_pipeline_even_when_verified() -> None:
    tip = _tip()
    engine = ReentryIntelligenceEngine(source_registry={"OFFICIAL-TIP": SourceGrade.OFFICIAL_PUBLIC})
    estimate = engine.ingest_tip("OBJ-1", tip, source_id="OFFICIAL-TIP", provenance=_provenance(tip))
    assert estimate.provenance_status == "INTEGRITY_VERIFIED"
    assert estimate.validation_state == ValidationState.VALIDATION_PENDING
    assert estimate.validation_state != ValidationState.VALIDATED_PIPELINE
    assert estimate.grade == SourceGrade.OFFICIAL_PUBLIC


def test_e27_unregistered_source_stays_unknown_even_when_verified() -> None:
    tip = _tip()
    engine = ReentryIntelligenceEngine(source_registry={"OFFICIAL-TIP": SourceGrade.OFFICIAL_PUBLIC})
    estimate = engine.ingest_tip("OBJ-1", tip, source_id="RANDOM-BLOG", provenance=_provenance(tip))
    assert estimate.grade == SourceGrade.UNKNOWN


def test_e27_checksum_mismatch_is_refused_not_relabelled() -> None:
    tip = _tip()
    provenance = _provenance(tip)
    tampered = dict(tip, nominal_utc="2026-09-02T00:00:00+00:00")
    engine = ReentryIntelligenceEngine(source_registry={"OFFICIAL-TIP": SourceGrade.OFFICIAL_PUBLIC})
    estimate = engine.ingest_tip("OBJ-1", tampered, source_id="OFFICIAL-TIP", provenance=provenance)
    assert estimate.provenance_status == "CHECKSUM_MISMATCH"
    assert estimate.validation_state == ValidationState.UNVALIDATED
    assert estimate.grade == SourceGrade.UNKNOWN


def test_e27_lineage_fields_are_preserved() -> None:
    """HIGH: an estimate with no URI, hash or retrieval time cannot be traced."""
    tip = _tip()
    provenance = _provenance(tip)
    engine = ReentryIntelligenceEngine()
    estimate = engine.ingest_tip("OBJ-1", tip, source_id="OFFICIAL-TIP", provenance=provenance)
    assert estimate.source_uri == provenance["source_uri"]
    assert estimate.payload_sha256 == provenance["payload_sha256"]
    assert estimate.retrieved_at_utc == datetime(2026, 8, 31, 23, tzinfo=timezone.utc)
    assert estimate.model_version


def test_e27_missing_tip_is_insufficient_data_and_versions_increment() -> None:
    engine = ReentryIntelligenceEngine()
    empty = engine.ingest_tip("OBJ-1", None, source_id="OFFICIAL-TIP")
    assert empty.nominal_utc is None
    assert empty.validation_state == ValidationState.INSUFFICIENT_DATA
    assert empty.grade == SourceGrade.UNKNOWN
    engine.ingest_tip("OBJ-1", _tip(), source_id="OFFICIAL-TIP")
    assert [item.version for item in engine.history("OBJ-1")] == [1, 2]


def test_e27_inconsistent_window_is_flagged() -> None:
    tip = {
        "nominal_utc": "2026-09-01T00:00:00+00:00",
        "window_start_utc": "2026-09-01T04:00:00+00:00",
        "window_end_utc": "2026-08-31T20:00:00+00:00",
    }
    engine = ReentryIntelligenceEngine(source_registry={"OFFICIAL-TIP": SourceGrade.OFFICIAL_PUBLIC})
    estimate = engine.ingest_tip("OBJ-1", tip, source_id="OFFICIAL-TIP", provenance=_provenance(tip))
    assert estimate.provenance_status == "INCONSISTENT_WINDOW"
    assert estimate.validation_state == ValidationState.UNVALIDATED


# --------------------------------------------------------------------------- E25


def test_e25_known_flag_alone_does_not_validate_the_lineage() -> None:
    """HIGH: a caller boolean is a claim about parentage, not a verification result."""
    engine = DebrisGenealogyOriginEngine()
    link = engine.add(
        child_id="DEB-1", parent_id="SAT-1", origin="EVENT-A",
        event_time_utc=T0, evidence_id="EV-1", known=True,
    )
    assert link.validation_state == ValidationState.UNVALIDATED
    assert link.evidence_status == "EVIDENCE_RESOLVER_NOT_CONFIGURED"


def test_e25_resolved_evidence_is_pending_never_validated_pipeline() -> None:
    engine = DebrisGenealogyOriginEngine(evidence_lookup={"EV-1": {"id": "EV-1"}}.get)
    link = engine.add(
        child_id="DEB-1", parent_id="SAT-1", origin="EVENT-A",
        event_time_utc=T0, evidence_id="EV-1", known=True,
    )
    assert link.evidence_status == "EVIDENCE_RESOLVED"
    assert link.validation_state == ValidationState.VALIDATION_PENDING
    assert link.validation_state != ValidationState.VALIDATED_PIPELINE


def test_e25_unresolvable_evidence_is_not_silently_accepted() -> None:
    engine = DebrisGenealogyOriginEngine(evidence_lookup={"EV-1": {"id": "EV-1"}}.get)
    link = engine.add(
        child_id="DEB-2", parent_id="SAT-1", origin="EVENT-A",
        event_time_utc=T0, evidence_id="MISSING", known=True,
    )
    assert link.evidence_status == "EVIDENCE_NOT_FOUND"
    assert link.validation_state == ValidationState.UNVALIDATED


def test_e25_unknown_origin_drops_the_claim() -> None:
    engine = DebrisGenealogyOriginEngine(evidence_lookup={"EV-1": {"id": "EV-1"}}.get)
    link = engine.add(
        child_id="DEB-3", parent_id="GUESS", origin="COUNTRY-X",
        event_time_utc=T0, evidence_id="EV-1", known=False,
    )
    assert link.parent_id is None and link.origin is None
    assert link.uncertainty_reason == "UNKNOWN_ORIGIN"
    assert link.validation_state == ValidationState.INSUFFICIENT_DATA


# --------------------------------------------------------------------------- E29


def _candidate(object_id: str, **overrides):
    base = {
        "object_id": object_id,
        "start_utc": T0,
        "end_utc": T0 + timedelta(minutes=5),
        "visible": True,
        "max_elevation_deg": 40.0,
        "sunlit": True,
        "eclipsed": False,
        "mount_rate_deg_s": 1.0,
    }
    base.update(overrides)
    return base


def test_e29_information_gain_is_not_claimed_to_be_computed() -> None:
    """THEATER: nothing here computes information gain, so nothing may be named that."""
    engine = ObservationPlanningEngine()
    result = engine.screen([_candidate("A", information_gain=0.9)], mount_rate_limit_deg_s=5.0)
    assert result.information_gain_status == "NOT_COMPUTED"
    assert result.ordering_basis == "CALLER_SUPPLIED_PRIORITY"
    request = result.requests[0]
    assert request.information_gain_status == "NOT_COMPUTED"
    assert request.caller_priority == 0.9
    assert not hasattr(request, "information_gain")


def test_e29_missing_priority_is_absent_not_zero() -> None:
    engine = ObservationPlanningEngine()
    requests = engine.plan([_candidate("A")], mount_rate_limit_deg_s=5.0)
    assert requests[0].caller_priority is None


def test_e29_unranked_candidates_are_not_ranked_as_worst() -> None:
    engine = ObservationPlanningEngine()
    requests = engine.plan(
        [
            _candidate("NONE", start_utc=T0, end_utc=T0 + timedelta(minutes=1)),
            _candidate("LOW", information_gain=-5.0, start_utc=T0 + timedelta(minutes=2), end_utc=T0 + timedelta(minutes=3)),
        ],
        mount_rate_limit_deg_s=5.0,
    )
    # A negative caller priority still ranks above an absent one, which is unranked.
    assert [item.object_id for item in requests] == ["LOW", "NONE"]


def test_e29_unknown_mount_rate_cannot_pass_the_limit_as_zero() -> None:
    engine = ObservationPlanningEngine()
    result = engine.screen([_candidate("A", mount_rate_deg_s=None)], mount_rate_limit_deg_s=1.5)
    assert result.requests == ()
    assert result.rejected[0]["reason"] == "MOUNT_RATE_NOT_SUPPLIED"


def test_e29_missing_illumination_and_elevation_stay_none() -> None:
    engine = ObservationPlanningEngine()
    candidate = _candidate("A")
    candidate.pop("sunlit")
    candidate.pop("eclipsed")
    candidate.pop("max_elevation_deg")
    request = engine.plan([candidate], mount_rate_limit_deg_s=5.0)[0]
    assert request.sunlit is None and request.eclipsed is None
    assert request.max_elevation_deg is None
    assert request.illumination_status == "NOT_SUPPLIED"


def test_e29_mount_rate_limit_and_visibility_still_filter() -> None:
    engine = ObservationPlanningEngine()
    result = engine.screen(
        [
            _candidate("A", information_gain=0.9),
            _candidate("B", mount_rate_deg_s=2.0, information_gain=0.5),
            _candidate("C", visible=False),
        ],
        mount_rate_limit_deg_s=1.5,
    )
    assert [item.object_id for item in result.requests] == ["A"]
    reasons = {item["object_id"]: item["reason"] for item in result.rejected}
    assert reasons == {"B": "MOUNT_RATE_EXCEEDS_LIMIT", "C": "NOT_VISIBLE"}


# --------------------------- E29 ground-station visibility


_STATION = {"station_id": "EQUATOR-0", "latitude_deg": 0.0, "longitude_deg": 0.0, "altitude_m": 0.0}


_OVERHEAD_STATE = {
    # At 2000-01-01T12:00:00Z this state is exactly at the zenith of EQUATOR-0, which is
    # also where the tracking rate peaks (~0.65 deg/s at a 10 s step).
    "object_id": "VAL-A",
    "position_km": [1270.917571, -6883.669589, 0.0],
    "velocity_km_s": [7.37536, 1.361697, 0.0],
}
_ZENITH_PASS = datetime(2000, 1, 1, 12, tzinfo=timezone.utc)


def test_e29_visibility_first_sample_rate_is_computed_not_zero() -> None:
    """HIGH: the first sample's rate used to be 0.0, clearing any mount limit for free.

    Only the very first sample clears the 85 deg elevation cut, so the whole window
    stands or falls on that sample's slew rate.  Its true rate is ~0.65 deg/s, above
    the 0.5 deg/s mount limit, so the pass must be rejected.
    """
    engine = GroundStationVisibilityEngine()
    result = engine.compute(
        object_state=_OVERHEAD_STATE, station=_STATION,
        start_utc=_ZENITH_PASS, end_utc=_ZENITH_PASS + timedelta(minutes=20),
        step_s=10.0, minimum_elevation_deg=85.0, mount_rate_limit_deg_s=0.5,
    )
    assert result.windows == (), "a sample whose rate exceeds the mount limit is not observable"

    # The same first sample is admissible once the limit actually covers its real rate.
    relaxed = engine.compute(
        object_state=_OVERHEAD_STATE, station=_STATION,
        start_utc=_ZENITH_PASS, end_utc=_ZENITH_PASS + timedelta(minutes=20),
        step_s=10.0, minimum_elevation_deg=85.0, mount_rate_limit_deg_s=5.0,
    )
    assert relaxed.windows
    assert relaxed.windows[0].start_utc == _ZENITH_PASS
    assert relaxed.windows[0].max_mount_rate_deg_s > 0.0
    assert result.provenance["mount_rate_method"] == "BACKWARD_STEP_SEEDED_ANGULAR_DIFFERENCE"


def test_e29_visibility_short_final_step_uses_the_step_actually_taken() -> None:
    """A truncated last step divided by the full step_s under-reported the slew rate."""
    engine = GroundStationVisibilityEngine()
    result = engine.compute(
        object_state=_OVERHEAD_STATE, station=_STATION,
        start_utc=_ZENITH_PASS, end_utc=_ZENITH_PASS + timedelta(seconds=25),
        step_s=10.0, minimum_elevation_deg=0.0, mount_rate_limit_deg_s=5.0,
    )
    assert result.windows and result.windows[0].sample_count == 4  # 0, 10, 20, 25 s
    # The 5 s tail covers half the angle of a 10 s step, so a per-second rate must stay
    # comparable rather than collapsing to half when divided by the wrong interval.
    assert result.windows[0].max_mount_rate_deg_s > 0.5


def test_e29_visibility_illumination_stays_uncomputed() -> None:
    engine = GroundStationVisibilityEngine()
    result = engine.compute(
        object_state=_OVERHEAD_STATE, station=_STATION,
        start_utc=_ZENITH_PASS, end_utc=_ZENITH_PASS + timedelta(minutes=10),
        step_s=10.0, minimum_elevation_deg=10.0, mount_rate_limit_deg_s=5.0,
    )
    assert result.illumination_state == "NOT_COMPUTED"
    assert result.provenance["illumination_computed"] is False
    assert result.validation_state == "SCREENING_ONLY"
