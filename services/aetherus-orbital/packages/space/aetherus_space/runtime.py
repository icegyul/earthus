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


class CelestialEventEngine:
    id = "E09"
    rule_version = "celestial-rules-v1"

    def close_approach(self, a: CelestialState, b: CelestialState, *, threshold_deg: float = 5.0, official: bool = False, official_source: str | None = None) -> CelestialEventCandidate | None:
        if a.epoch_utc != b.epoch_utc or a.observer != b.observer:
            raise ValueError("states must share epoch and observer")
        va, vb = a.position_km, b.position_km
        da = sqrt(sum(v*v for v in va)); db = sqrt(sum(v*v for v in vb))
        if da == 0 or db == 0:
            return None
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
    drag_context: dict[str, float]
    direct_orbit_correction: None = None


class SpaceWeatherContextEngine:
    id = "E10"
    def normalize(self, *, observed_at: datetime, received_at: datetime, measurements: dict[str, float] | None, forecasts: dict[str, float] | None, source_id: str, stale_after_seconds: int = 3600, now: datetime | None = None) -> SpaceWeatherState:
        observed_at, received_at = _aware(observed_at), _aware(received_at)
        now = _aware(now or datetime.now(timezone.utc))
        age = max(0.0, (now - observed_at).total_seconds())
        data_status = "STALE" if age > stale_after_seconds else "OK"
        measurements = dict(measurements or {})
        forecasts = dict(forecasts or {})
        f107 = measurements.get("f107", forecasts.get("f107", 100.0))
        kp = measurements.get("kp", forecasts.get("kp", 2.0))
        # Context factor only: never applied as an orbit correction here.
        drag_context = {"relative_density_factor_hint": max(0.2, min(5.0, 0.5 + f107/200 + kp/10))}
        return SpaceWeatherState(observed_at, received_at, measurements, forecasts, source_id, SourceGrade.OFFICIAL_PUBLIC, data_status, drag_context)


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


class SmallBodyTrackingEngine:
    id = "E11"
    def normalize(self, record: dict[str, Any], *, source_id: str, source_grade: SourceGrade = SourceGrade.OFFICIAL_PUBLIC) -> SmallBodyState:
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
            validation_state=ValidationState.VALIDATION_PENDING if record.get("distance_uncertainty_km") is None else ValidationState.VALIDATED_PIPELINE,
        )


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


class DeepSpaceMissionTrackingEngine:
    id = "E12"
    def normalize(self, *, mission_id: str, status: str, epoch_utc: datetime, source_id: str, position_km: tuple[float, float, float] | None = None, live_telemetry: bool = False, model_version: str | None = None) -> DeepSpaceMissionState:
        epoch = _aware(epoch_utc)
        if live_telemetry:
            label = "LIVE_TELEMETRY"
            validation = ValidationState.VALIDATED_PIPELINE
        elif position_km is not None and source_id:
            label = "OFFICIAL_STATE"
            validation = ValidationState.VALIDATED_PIPELINE
        else:
            label = "MODELLED_STATE"
            validation = ValidationState.RESEARCH_ONLY
            if not model_version:
                model_version = "unspecified-model"
        return DeepSpaceMissionState(
            mission_id=mission_id,
            status=status,
            epoch_utc=epoch,
            position_km=position_km,
            state_label=label,
            source_id=source_id,
            trajectory_provenance={"source_id": source_id, "model_version": model_version, "live_telemetry": live_telemetry},
            validation_state=validation,
        )
