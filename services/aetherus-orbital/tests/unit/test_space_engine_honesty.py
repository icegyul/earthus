"""Regression tests for fabricated values in the E09-E12 space engines.

Each test below fails if a specific invention returns: default index values with a
derived density factor (E10), a validation stamp granted by field presence (E11),
a self-declared live-telemetry promotion or a fabricated model identity (E12), or
"cannot compute" being reported as "no event" (E09).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from aetherus_domain import EvidenceClass, SourceGrade, ValidationState
from aetherus_space import (
    CelestialEventEngine,
    CelestialState,
    DeepSpaceMissionTrackingEngine,
    SelfDeclaredTelemetryError,
    SeparationUndefinedError,
    SmallBodyCloseApproachNormalizer,
    SpaceWeatherContextEngine,
)

T0 = datetime(2026, 8, 30, tzinfo=timezone.utc)


def _state(object_id: str, position: tuple[float, float, float]) -> CelestialState:
    return CelestialState(
        object_id, T0, position, "ICRF", "SUN", "P", "K",
        ValidationState.RESEARCH_ONLY, EvidenceClass.DERIVED,
    )


# --- E09 -------------------------------------------------------------------

def test_e09_zero_magnitude_vector_is_not_reported_as_no_event() -> None:
    eng = CelestialEventEngine()
    with pytest.raises(SeparationUndefinedError) as excinfo:
        eng.close_approach(_state("SUN", (0.0, 0.0, 0.0)), _state("MARS", (1.0, 0.0, 0.0)))
    assert "INSUFFICIENT_DATA" in str(excinfo.value)
    assert SeparationUndefinedError.validation_state is ValidationState.INSUFFICIENT_DATA


def test_e09_separation_undefined_is_catchable_as_value_error() -> None:
    # Route handlers catch ValueError; the new error must keep flowing into that
    # path instead of escaping as a 500.
    eng = CelestialEventEngine()
    with pytest.raises(ValueError):
        eng.close_approach(_state("A", (1.0, 0.0, 0.0)), _state("SUN", (0.0, 0.0, 0.0)))


def test_e09_wide_separation_still_returns_none_for_no_event() -> None:
    eng = CelestialEventEngine()
    assert eng.close_approach(
        _state("A", (1.0, 0.0, 0.0)), _state("B", (0.0, 1.0, 0.0)), threshold_deg=5.0
    ) is None


# --- E10 -------------------------------------------------------------------

def test_e10_empty_payload_yields_no_density_hint_and_explicit_status() -> None:
    st = SpaceWeatherContextEngine().normalize(
        observed_at=T0, received_at=T0, measurements={}, forecasts={},
        source_id="NOAA", now=T0,
    )
    assert st.data_status == "INSUFFICIENT_DATA"
    assert st.drag_context["status"] == "INSUFFICIENT_DATA"
    assert st.drag_context["indices"] == {}
    assert st.drag_context["density_factor"] is None
    assert st.drag_context["defaults_substituted"] is False
    # The old fabricated key must not come back under any spelling.
    assert "relative_density_factor_hint" not in st.drag_context


def test_e10_never_derives_a_density_factor_even_with_full_indices() -> None:
    # Kp and f10.7 both present: the engine still refuses to convert them, matching
    # backend/providers_live/space_weather.py ("Kp is not convertible").
    st = SpaceWeatherContextEngine().normalize(
        observed_at=T0, received_at=T0, measurements={"kp": 9.0, "f107": 300.0},
        forecasts={}, source_id="NOAA", now=T0,
    )
    assert st.drag_context["density_factor"] is None
    assert st.drag_context["density_factor_status"] == "UNAVAILABLE"
    # No scalar outside the pass-through "indices" map: any bare number here would
    # be a derived quantity with no model behind it.
    assert all(
        isinstance(value, bool) or not isinstance(value, (int, float))
        for key, value in st.drag_context.items()
        if key != "indices"
    )


def test_e10_no_defaults_are_substituted_for_missing_indices() -> None:
    st = SpaceWeatherContextEngine().normalize(
        observed_at=T0, received_at=T0, measurements={"kp": 3.0}, forecasts={},
        source_id="NOAA", now=T0,
    )
    assert "f107" not in st.drag_context["indices"]
    assert st.measurements == {"kp": 3.0}
    assert st.forecasts == {}


def test_e10_index_origin_distinguishes_measurement_from_forecast() -> None:
    st = SpaceWeatherContextEngine().normalize(
        observed_at=T0, received_at=T0, measurements={"kp": 3.0},
        forecasts={"kp": 5.0, "f107": 140.0}, source_id="NOAA", now=T0,
    )
    assert st.drag_context["indices"]["kp"] == {"value": 3.0, "origin": "MEASUREMENT"}
    assert st.drag_context["indices"]["f107"] == {"value": 140.0, "origin": "FORECAST"}


def test_e10_unverified_source_is_not_graded_official() -> None:
    st = SpaceWeatherContextEngine().normalize(
        observed_at=T0, received_at=T0, measurements={"kp": 3.0}, forecasts={},
        source_id="RANDOM_BLOG", now=T0,
    )
    assert st.source_grade is SourceGrade.UNKNOWN


def test_e10_caller_supplied_grade_is_preserved() -> None:
    st = SpaceWeatherContextEngine().normalize(
        observed_at=T0, received_at=T0, measurements={"kp": 3.0}, forecasts={},
        source_id="NOAA", source_grade=SourceGrade.OFFICIAL_PUBLIC, now=T0,
    )
    assert st.source_grade is SourceGrade.OFFICIAL_PUBLIC


def test_e10_stale_requires_an_actual_sample() -> None:
    eng = SpaceWeatherContextEngine()
    fresh = eng.normalize(
        observed_at=T0, received_at=T0, measurements={"kp": 3.0}, forecasts={},
        source_id="NOAA", stale_after_seconds=60, now=T0 + timedelta(seconds=10),
    )
    stale = eng.normalize(
        observed_at=T0, received_at=T0, measurements={"kp": 3.0}, forecasts={},
        source_id="NOAA", stale_after_seconds=60, now=T0 + timedelta(hours=2),
    )
    assert (fresh.data_status, stale.data_status) == ("OK", "STALE")


# --- E11 -------------------------------------------------------------------

BASE_NEO = {
    "object_id": "2026 AB",
    "close_approach_utc": T0,
    "nominal_distance_km": 100000.0,
    "distance_uncertainty_km": 500.0,
}


def test_e11_uncertainty_presence_does_not_grant_validation() -> None:
    st = SmallBodyCloseApproachNormalizer().normalize(BASE_NEO, source_id="ANON_TWEET")
    assert st.source_grade is SourceGrade.UNKNOWN
    assert st.validation_state is ValidationState.UNVALIDATED


def test_e11_zero_uncertainty_from_anonymous_source_is_not_validated() -> None:
    record = {**BASE_NEO, "distance_uncertainty_km": 0.0}
    st = SmallBodyCloseApproachNormalizer().normalize(record, source_id="ANON_TWEET")
    assert st.distance_uncertainty_km == 0.0
    assert st.validation_state is not ValidationState.VALIDATED_PIPELINE


@pytest.mark.parametrize("grade", list(SourceGrade))
def test_e11_normalizer_never_emits_validated_pipeline(grade: SourceGrade) -> None:
    # Nothing in this module runs a validation pipeline, so no input may produce
    # that stamp.
    st = SmallBodyCloseApproachNormalizer().normalize(
        BASE_NEO, source_id="JPL", source_grade=grade
    )
    assert st.validation_state is not ValidationState.VALIDATED_PIPELINE


def test_e11_validation_state_follows_source_grade() -> None:
    eng = SmallBodyCloseApproachNormalizer()
    official = eng.normalize(BASE_NEO, source_id="JPL", source_grade=SourceGrade.OFFICIAL_PUBLIC)
    research = eng.normalize(BASE_NEO, source_id="PAPER", source_grade=SourceGrade.RESEARCH)
    user = eng.normalize(BASE_NEO, source_id="OBS", source_grade=SourceGrade.USER_OBSERVATION)
    assert official.validation_state is ValidationState.VALIDATION_PENDING
    assert research.validation_state is ValidationState.RESEARCH_ONLY
    assert user.validation_state is ValidationState.UNVALIDATED


def test_e11_name_matches_role() -> None:
    # The class does no orbit determination or propagation; its name and docstring
    # must not claim tracking.
    doc = SmallBodyCloseApproachNormalizer.__doc__ or ""
    assert "Normalizer" in SmallBodyCloseApproachNormalizer.__name__
    assert "normalizer, not a tracker" in doc


# --- E12 -------------------------------------------------------------------

def test_e12_self_declared_live_telemetry_is_refused() -> None:
    eng = DeepSpaceMissionTrackingEngine()
    with pytest.raises(SelfDeclaredTelemetryError):
        eng.normalize(
            mission_id="X", status="CRUISE", epoch_utc=T0, source_id="CALLER",
            position_km=(1.0, 2.0, 3.0), live_telemetry=True,
        )


def test_e12_evidence_backed_live_claim_is_pending_not_validated() -> None:
    st = DeepSpaceMissionTrackingEngine().normalize(
        mission_id="X", status="CRUISE", epoch_utc=T0, source_id="DSN",
        position_km=(1.0, 2.0, 3.0), live_telemetry=True,
        telemetry_evidence_id="ev-123",
    )
    assert st.state_label == "LIVE_TELEMETRY"
    assert st.validation_state is ValidationState.VALIDATION_PENDING
    assert st.trajectory_provenance["telemetry_evidence_id"] == "ev-123"


def test_e12_missing_model_version_stays_none() -> None:
    st = DeepSpaceMissionTrackingEngine().normalize(
        mission_id="X", status="CRUISE", epoch_utc=T0, source_id="MISSION",
        position_km=None, model_version=None,
    )
    assert st.state_label == "MODELLED_STATE"
    assert st.trajectory_provenance["model_version"] is None
    assert st.trajectory_provenance["limitations"]


def test_e12_no_branch_emits_validated_pipeline() -> None:
    eng = DeepSpaceMissionTrackingEngine()
    official = eng.normalize(
        mission_id="JWST", status="OPERATIONAL", epoch_utc=T0, source_id="NASA",
        position_km=(1.0, 2.0, 3.0),
    )
    modelled = eng.normalize(
        mission_id="X", status="CRUISE", epoch_utc=T0, source_id="MISSION",
        position_km=None, model_version="m1",
    )
    assert official.validation_state is ValidationState.VALIDATION_PENDING
    assert modelled.validation_state is ValidationState.RESEARCH_ONLY
    for st in (official, modelled):
        assert st.validation_state is not ValidationState.VALIDATED_PIPELINE
