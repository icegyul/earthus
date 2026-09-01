from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from math import atan2, cos, pi, radians, sin, sqrt
from typing import Any

from aetherus_domain import EvidenceClass, SourceGrade, ValidationState, canonical_hash

AU_KM = 149_597_870.7
DAY_S = 86400.0
J2000 = datetime(2000, 1, 1, 12, tzinfo=timezone.utc)

# Low-precision mean elements suitable for offline research visualization only.
# Values are intentionally tagged RESEARCH_ONLY; operational ephemerides must use JPL kernels/Horizons.
#
# Source: JPL/Standish "Keplerian Elements for Approximate Positions of the
# Major Planets" Table 1 (valid 1800 AD - 2050 AD), J2000 ecliptic frame.
# Columns: a[AU], e, I[deg], L0[deg] (mean longitude at J2000),
#          varpi[deg] (longitude of perihelion), Omega[deg] (asc. node),
#          L_rate[deg per Julian century].
# The previous table mixed conventions (its 6th column was the MEAN ANOMALY
# for Mercury/Venus but was consumed as mean longitude), which misplaced the
# inner planets by 57-133 deg; caught by angular cross-validation against
# astropy on 2026-09-01 and replaced with the canonical parameterization.
PLANET_ELEMENTS = {
    "MERCURY": (0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593, 149472.67411175),
    "VENUS": (0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255, 58517.81538729),
    "EARTH": (1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0, 35999.37244981),
    "MARS": (1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 19140.30268499),
    "JUPITER": (5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, 3034.74612775),
    "SATURN": (9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, 1222.49362201),
    "URANUS": (19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503, 428.48202785),
    "NEPTUNE": (30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574, 218.45945325),
}
JULIAN_CENTURY_DAYS = 36525.0


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise ValueError("naive datetime forbidden")
    return value.astimezone(timezone.utc)


def _solve_kepler(mean_anomaly_rad: float, eccentricity: float) -> float:
    e_anom = mean_anomaly_rad
    for _ in range(12):
        f = e_anom - eccentricity * sin(e_anom) - mean_anomaly_rad
        fp = 1 - eccentricity * cos(e_anom)
        e_anom -= f / fp
    return e_anom


def _rotate_orbit(x: float, y: float, inc: float, node: float, argp: float) -> tuple[float, float, float]:
    i, om, w = map(radians, (inc, node, argp))
    cw, sw, co, so, ci, si = cos(w), sin(w), cos(om), sin(om), cos(i), sin(i)
    x1 = (co*cw - so*sw*ci)*x + (-co*sw - so*cw*ci)*y
    y1 = (so*cw + co*sw*ci)*x + (-so*sw + co*cw*ci)*y
    z1 = (sw*si)*x + (cw*si)*y
    return x1, y1, z1


@dataclass(frozen=True)
class CelestialState:
    object_id: str
    epoch_utc: datetime
    position_km: tuple[float, float, float]
    frame: str
    observer: str
    provider: str
    kernel_version: str
    validation_state: ValidationState
    evidence_class: EvidenceClass

    @property
    def state_hash(self) -> str:
        return canonical_hash({
            "object_id": self.object_id,
            "epoch_utc": self.epoch_utc.isoformat(),
            "position_km": [round(v, 6) for v in self.position_km],
            "frame": self.frame,
            "observer": self.observer,
            "provider": self.provider,
            "kernel_version": self.kernel_version,
            "validation_state": self.validation_state.value,
        })


class SolarSystemEphemerisEngine:
    id = "E08"
    version = "0.4"
    provider = "AETHERUS_OFFLINE_KEPLER_J2000"
    kernel_version = "standish-1800-2050-v2"

    def state(self, target: str, epoch_utc: datetime, *, observer: str = "SUN", frame: str = "ICRF_APPROX") -> CelestialState:
        epoch = _aware(epoch_utc)
        target = target.upper()
        if observer.upper() != "SUN":
            if observer.upper() not in PLANET_ELEMENTS:
                raise ValueError("unsupported observer")
        if target == "SUN":
            pos = (0.0, 0.0, 0.0)
        elif target in PLANET_ELEMENTS:
            a, e, inc, mean_long0, varpi, node, l_rate_cy = PLANET_ELEMENTS[target]
            centuries = (epoch - J2000).total_seconds() / DAY_S / JULIAN_CENTURY_DAYS
            mean_long = mean_long0 + l_rate_cy * centuries
            argp = varpi - node  # argument of perihelion from longitude of perihelion
            m = radians((mean_long - varpi) % 360.0)
            ea = _solve_kepler(m, e)
            x = a * (cos(ea) - e)
            y = a * sqrt(1-e*e) * sin(ea)
            pos_au = _rotate_orbit(x, y, inc, node, argp)
            pos = tuple(v*AU_KM for v in pos_au)
        else:
            raise KeyError(f"unknown celestial target: {target}")
        if observer.upper() != "SUN":
            obs = self.state(observer, epoch, observer="SUN", frame=frame).position_km
            pos = tuple(pos[i] - obs[i] for i in range(3))
        return CelestialState(
            object_id=target,
            epoch_utc=epoch,
            position_km=pos,
            frame=frame,
            observer=observer.upper(),
            provider=self.provider,
            kernel_version=self.kernel_version,
            validation_state=ValidationState.RESEARCH_ONLY,
            evidence_class=EvidenceClass.DERIVED,
        )

    def series(self, target: str, start: datetime, stop: datetime, step: timedelta, *, observer: str = "SUN", frame: str = "ICRF_APPROX") -> list[CelestialState]:
        start, stop = _aware(start), _aware(stop)
        if step.total_seconds() <= 0 or stop < start:
            raise ValueError("invalid ephemeris range")
        out = []
        cursor = start
        while cursor <= stop:
            out.append(self.state(target, cursor, observer=observer, frame=frame))
            cursor += step
        return out


@dataclass(frozen=True)
class CelestialEventCandidate:
    event_type: str
    event_time_utc: datetime
    object_ids: tuple[str, ...]
    separation_deg: float | None
    evidence_class: EvidenceClass
    source_label: str
    rule_version: str
    validation_state: ValidationState


class SeparationUndefinedError(ValueError):
    """Angular separation cannot be formed from the supplied geometry.

    Subclasses ValueError so existing ``except ValueError`` route handlers keep
    translating it into an explicit 4xx, while callers that care can catch the
    specific case.
    """

    validation_state = ValidationState.INSUFFICIENT_DATA


class CelestialEventEngine:
    id = "E09"
    rule_version = "celestial-rules-v1"

    def close_approach(self, a: CelestialState, b: CelestialState, *, threshold_deg: float = 5.0, official: bool = False, official_source: str | None = None) -> CelestialEventCandidate | None:
        if a.epoch_utc != b.epoch_utc or a.observer != b.observer:
            raise ValueError("states must share epoch and observer")
        va, vb = a.position_km, b.position_km
        da = sqrt(sum(v*v for v in va)); db = sqrt(sum(v*v for v in vb))
        if da == 0 or db == 0:
            # A zero-magnitude position vector (e.g. the observer itself) has no
            # direction, so no angle exists. Returning None here would be read as
            # "no event", which is a different fact from "not computable"; the two
            # must stay distinguishable all the way out to the caller.
            zero = a.object_id if da == 0 else b.object_id
            raise SeparationUndefinedError(
                f"INSUFFICIENT_DATA: angular separation is undefined because '{zero}' has a "
                f"zero-magnitude position vector in observer frame '{a.observer}'; "
                "this is not the same as 'no close approach'"
            )
        dot = sum(va[i]*vb[i] for i in range(3)) / (da*db)
        dot = max(-1.0, min(1.0, dot))
        angle = atan2(sqrt(max(0.0, 1-dot*dot)), dot) * 180/pi
        if angle > threshold_deg:
            return None
        if official and not official_source:
            raise ValueError("official event requires official source")
        return CelestialEventCandidate(
            event_type="CLOSE_APPROACH_ANGULAR",
            event_time_utc=a.epoch_utc,
            object_ids=(a.object_id, b.object_id),
            separation_deg=angle,
            evidence_class=EvidenceClass.OFFICIAL if official else EvidenceClass.DERIVED,
            source_label=official_source or "AETHERUS_DERIVED_GEOMETRY",
            rule_version=self.rule_version,
            validation_state=ValidationState.VALIDATED_PIPELINE if official else ValidationState.RESEARCH_ONLY,
        )

    def official_event(self, *, event_type: str, event_time: datetime, objects: list[str], source: str) -> CelestialEventCandidate:
        return CelestialEventCandidate(event_type, _aware(event_time), tuple(objects), None, EvidenceClass.OFFICIAL, source, self.rule_version, ValidationState.VALIDATED_PIPELINE)


@dataclass(frozen=True)
class SpaceWeatherState:
    observed_at: datetime
    received_at: datetime
    measurements: dict[str, float]
    forecasts: dict[str, float]
    source_id: str
    source_grade: SourceGrade
    data_status: str
    drag_context: dict[str, Any]
    direct_orbit_correction: None = None


# Indices this engine will report as drag-relevant *context*. Naming them here
# keeps the pass-through explicit: anything outside this set is carried in
# measurements/forecasts untouched and is not described as drag context.
DRAG_RELEVANT_INDICES = ("f107", "kp", "ap")


class SpaceWeatherContextEngine:
    """Normalize a space-weather sample into an explicit, source-graded state.

    This engine performs no physical derivation. The previous version invented
    f10.7=100 / Kp=2 whenever the payload was empty and pushed them through an
    unattributed expression (0.5 + f107/200 + kp/10) to publish a
    'relative_density_factor_hint'. That number had no model name, no version and
    no unit basis, and it contradicted the sibling ingestion adapter
    (backend/providers_live/space_weather.py), which states that Kp is a
    dimensionless 0-9 activity index and must not be converted into anything.
    Since no citable model backs the expression, the derivation is removed rather
    than re-labelled: an atmospheric density factor requires a named model
    (e.g. NRLMSISE-00 / JB2008) fed with its own documented inputs, which this
    engine does not have.
    """

    id = "E10"
    version = "0.2"

    def normalize(self, *, observed_at: datetime, received_at: datetime, measurements: dict[str, float] | None, forecasts: dict[str, float] | None, source_id: str, source_grade: SourceGrade = SourceGrade.UNKNOWN, stale_after_seconds: int = 3600, now: datetime | None = None) -> SpaceWeatherState:
        observed_at, received_at = _aware(observed_at), _aware(received_at)
        now = _aware(now or datetime.now(timezone.utc))
        age = max(0.0, (now - observed_at).total_seconds())
        measurements = dict(measurements or {})
        forecasts = dict(forecasts or {})
        if not measurements and not forecasts:
            # No sample arrived. Freshness of an empty payload is meaningless, so
            # do not describe it as OK or STALE.
            data_status = "INSUFFICIENT_DATA"
        else:
            data_status = "STALE" if age > stale_after_seconds else "OK"
        observed_indices = {
            name: {"value": measurements[name], "origin": "MEASUREMENT"}
            for name in DRAG_RELEVANT_INDICES if name in measurements
        }
        for name in DRAG_RELEVANT_INDICES:
            if name not in observed_indices and name in forecasts:
                observed_indices[name] = {"value": forecasts[name], "origin": "FORECAST"}
        drag_context = {
            "status": "OK" if observed_indices else "INSUFFICIENT_DATA",
            "indices": observed_indices,
            "density_factor": None,
            "density_factor_status": "UNAVAILABLE",
            "density_factor_reason": (
                "No named atmospheric density model is wired to this engine; a factor "
                "is not derived from Kp or f10.7 here. Kp is a dimensionless 0-9 "
                "activity index and is not converted into any other quantity."
            ),
            "defaults_substituted": False,
        }
        return SpaceWeatherState(observed_at, received_at, measurements, forecasts, source_id, source_grade, data_status, drag_context)


@dataclass(frozen=True)
class SmallBodyState:
    object_id: str
    close_approach_utc: datetime | None
    nominal_distance_km: float | None
    distance_uncertainty_km: float | None
    source_id: str
    source_grade: SourceGrade
    impact_claim: str | None
    validation_state: ValidationState


# Validation state a *normalizer* may honestly assign, keyed by the grade of the
# source the record came from. No entry is VALIDATED_PIPELINE: nothing in this
# module runs a validation pipeline, so that state must be stamped by whatever
# actually validates, not by a parser.
_GRADE_TO_NORMALIZED_STATE = {
    SourceGrade.OPERATIONAL: ValidationState.VALIDATION_PENDING,
    SourceGrade.OFFICIAL_PUBLIC: ValidationState.VALIDATION_PENDING,
    SourceGrade.VALIDATION_FIXTURE: ValidationState.VALIDATION_PENDING,
    SourceGrade.PUBLIC_SCREENING: ValidationState.SCREENING_ONLY,
    SourceGrade.RESEARCH: ValidationState.RESEARCH_ONLY,
    SourceGrade.USER_OBSERVATION: ValidationState.UNVALIDATED,
    SourceGrade.UNKNOWN: ValidationState.UNVALIDATED,
}


class SmallBodyCloseApproachNormalizer:
    """Parse one small-body close-approach record into a typed, graded state.

    This is a normalizer, not a tracker: it performs no orbit determination and no
    propagation, so it cannot confirm or refine an approach. It was previously
    named ``SmallBodyTrackingEngine`` and stamped VALIDATED_PIPELINE whenever a
    ``distance_uncertainty_km`` key happened to be present -- the presence of an
    uncertainty field says nothing about whether anything validated the record.
    Validation state is now derived from the grade of the source, and the caller
    must state that grade; an unstated source is UNKNOWN/UNVALIDATED.
    """

    id = "E11"
    version = "0.2"

    def normalize(self, record: dict[str, Any], *, source_id: str, source_grade: SourceGrade = SourceGrade.UNKNOWN) -> SmallBodyState:
        raw_time = record.get("close_approach_utc")
        if isinstance(raw_time, str):
            raw_time = datetime.fromisoformat(raw_time.replace("Z", "+00:00"))
        close_time = _aware(raw_time) if isinstance(raw_time, datetime) else None
        impact_claim = record.get("impact_claim") if record.get("impact_claim_source") else None
        return SmallBodyState(
            object_id=str(record["object_id"]),
            close_approach_utc=close_time,
            nominal_distance_km=float(record["nominal_distance_km"]) if record.get("nominal_distance_km") is not None else None,
            distance_uncertainty_km=float(record["distance_uncertainty_km"]) if record.get("distance_uncertainty_km") is not None else None,
            source_id=source_id,
            source_grade=source_grade,
            impact_claim=impact_claim,
            validation_state=_GRADE_TO_NORMALIZED_STATE.get(source_grade, ValidationState.UNVALIDATED),
        )


# Compatibility alias: packages/product/aetherus_product/runtime.py still imports
# the old name. Kept only so that caller keeps working until it is updated; the
# honest name is SmallBodyCloseApproachNormalizer.
SmallBodyTrackingEngine = SmallBodyCloseApproachNormalizer


@dataclass(frozen=True)
class DeepSpaceMissionState:
    mission_id: str
    status: str
    epoch_utc: datetime
    position_km: tuple[float, float, float] | None
    state_label: str
    source_id: str
    trajectory_provenance: dict[str, Any]
    validation_state: ValidationState


class SelfDeclaredTelemetryError(ValueError):
    """A caller claimed live telemetry without a verified evidence reference."""


class DeepSpaceMissionTrackingEngine:
    """Normalize a deep-space mission state record with honest provenance.

    Two prior behaviours are removed here. (1) A caller-supplied
    ``live_telemetry=True`` boolean alone promoted the record to LIVE_TELEMETRY /
    VALIDATED_PIPELINE; services/api/registry_routes.py already refuses exactly
    that self-declaration for trajectories with a 403, so the engine must not
    grant it either -- a live claim now requires a verified evidence reference.
    (2) A missing model version was replaced with the string 'unspecified-model',
    which fabricates a model identity; None is the truthful value.

    This engine also runs no validation pipeline, so it never emits
    VALIDATED_PIPELINE; VALIDATION_PENDING is the ceiling for source-backed rows.
    """

    id = "E12"
    version = "0.2"

    def normalize(self, *, mission_id: str, status: str, epoch_utc: datetime, source_id: str, position_km: tuple[float, float, float] | None = None, live_telemetry: bool = False, model_version: str | None = None, telemetry_evidence_id: str | None = None) -> DeepSpaceMissionState:
        epoch = _aware(epoch_utc)
        limitations: list[str] = []
        if live_telemetry and not telemetry_evidence_id:
            raise SelfDeclaredTelemetryError(
                "live telemetry cannot be self-declared; supply telemetry_evidence_id "
                "from a verified provider/evidence path"
            )
        if live_telemetry:
            label = "LIVE_TELEMETRY"
            # Evidence is referenced but not verified here, so the row is pending
            # validation rather than validated.
            validation = ValidationState.VALIDATION_PENDING
        elif position_km is not None and source_id:
            label = "OFFICIAL_STATE"
            validation = ValidationState.VALIDATION_PENDING
        else:
            label = "MODELLED_STATE"
            validation = ValidationState.RESEARCH_ONLY
            if not model_version:
                # Keep None: naming a model that was never identified would make the
                # numbers look reproducible when they are not.
                model_version = None
                limitations.append(
                    "Modelled state carries no model identity; results are not reproducible."
                )
        return DeepSpaceMissionState(
            mission_id=mission_id,
            status=status,
            epoch_utc=epoch,
            position_km=position_km,
            state_label=label,
            source_id=source_id,
            trajectory_provenance={
                "source_id": source_id,
                "model_version": model_version,
                "live_telemetry": live_telemetry,
                "telemetry_evidence_id": telemetry_evidence_id,
                "limitations": limitations,
            },
            validation_state=validation,
        )
