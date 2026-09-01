from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from math import asin, atan2, cos, degrees, pi, radians, sin, sqrt
from typing import Any

import numpy as np

from .intervention import EARTH_MU_KM3_S2, _rk4, _state

WGS84_A_KM = 6378.137
WGS84_F = 1.0 / 298.257223563


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise ValueError("naive datetime forbidden")
    return value.astimezone(UTC)


def _hash(payload: Any) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    ).hexdigest()


def _julian_date(value: datetime) -> float:
    return value.timestamp() / 86400.0 + 2440587.5


def _gmst_rad(value: datetime) -> float:
    days = _julian_date(value) - 2451545.0
    return radians((280.46061837 + 360.98564736629 * days) % 360.0)


def _station_eci(station: dict[str, Any], at: datetime) -> np.ndarray:
    latitude = radians(float(station["latitude_deg"]))
    longitude = radians(float(station["longitude_deg"]))
    altitude_km = float(station.get("altitude_m", 0.0)) / 1000.0
    if not (-pi / 2 <= latitude <= pi / 2):
        raise ValueError("invalid station latitude")
    eccentricity_sq = WGS84_F * (2.0 - WGS84_F)
    prime = WGS84_A_KM / sqrt(1.0 - eccentricity_sq * sin(latitude) ** 2)
    ecef = np.array(
        [
            (prime + altitude_km) * cos(latitude) * cos(longitude),
            (prime + altitude_km) * cos(latitude) * sin(longitude),
            (prime * (1.0 - eccentricity_sq) + altitude_km) * sin(latitude),
        ]
    )
    theta = _gmst_rad(at)
    return np.array(
        [cos(theta) * ecef[0] - sin(theta) * ecef[1],
         sin(theta) * ecef[0] + cos(theta) * ecef[1],
         ecef[2]]
    )


@dataclass(frozen=True)
class VisibilityWindow:
    start_utc: datetime
    end_utc: datetime
    max_elevation_deg: float
    max_mount_rate_deg_s: float
    sample_count: int


@dataclass(frozen=True)
class VisibilityResult:
    object_id: str
    station_id: str
    windows: tuple[VisibilityWindow, ...]
    minimum_elevation_deg: float
    mount_rate_limit_deg_s: float
    illumination_state: str
    validation_state: str
    provenance: dict[str, Any]
    result_hash: str


class GroundStationVisibilityEngine:
    id = "E29"
    model_version = "E29-GMST-WGS84-SCREENING-v2"

    def compute(
        self,
        *,
        object_state: dict[str, Any],
        station: dict[str, Any],
        start_utc: datetime,
        end_utc: datetime,
        step_s: float,
        minimum_elevation_deg: float,
        mount_rate_limit_deg_s: float,
        gravity_mu_km3_s2: float = EARTH_MU_KM3_S2,
    ) -> VisibilityResult:
        start = _aware(start_utc)
        end = _aware(end_utc)
        if end <= start or (end - start).total_seconds() > 7 * 86400:
            raise ValueError("invalid visibility interval")
        if not (0 < step_s <= 300):
            raise ValueError("invalid visibility step")
        if not (-5 <= minimum_elevation_deg < 90):
            raise ValueError("invalid minimum elevation")
        if mount_rate_limit_deg_s <= 0:
            raise ValueError("invalid mount rate limit")
        object_id, position, velocity = _state(object_state)
        station_id = str(station.get("station_id") or "").strip()
        if not station_id:
            raise ValueError("station_id is required")

        state = np.concatenate((position, velocity))
        # The first sample's slew rate used to be written as 0.0, which let a pass whose
        # rate was never computed clear the mount-rate limit as if the mount were still.
        # One backward propagation step supplies a real prior line of sight instead.
        previous_los: np.ndarray | None = self._line_of_sight(
            _rk4(state, -step_s, gravity_mu_km3_s2), station, start - timedelta(seconds=step_s)
        )
        previous_dt = step_s
        samples: list[tuple[datetime, float, float]] = []
        current = start
        while current <= end:
            observer = _station_eci(station, current)
            line_of_sight = state[:3] - observer
            los_unit = line_of_sight / float(np.linalg.norm(line_of_sight))
            zenith = observer / float(np.linalg.norm(observer))
            elevation = degrees(asin(float(np.clip(np.dot(los_unit, zenith), -1.0, 1.0))))
            angle = degrees(atan2(float(np.linalg.norm(np.cross(previous_los, los_unit))), float(np.dot(previous_los, los_unit))))
            # Divide by the step actually taken; the final step may be shorter than step_s.
            mount_rate = angle / previous_dt
            samples.append((current, elevation, mount_rate))
            previous_los = los_unit
            if current == end:
                break
            dt = min(step_s, (end - current).total_seconds())
            state = _rk4(state, dt, gravity_mu_km3_s2)
            previous_dt = dt
            current += timedelta(seconds=dt)

        windows: list[VisibilityWindow] = []
        active: list[tuple[datetime, float, float]] = []
        for sample in samples:
            visible = sample[1] >= minimum_elevation_deg and sample[2] <= mount_rate_limit_deg_s
            if visible:
                active.append(sample)
            elif active:
                windows.append(self._window(active))
                active = []
        if active:
            windows.append(self._window(active))
        provenance = {
            "engine_id": self.id,
            "model_version": self.model_version,
            "frame_method": "GMST_WGS84_SCREENING",
            "propagation_method": "TWO_BODY_RK4",
            "iers_eop_used": False,
            "illumination_computed": False,
            "mount_rate_method": "BACKWARD_STEP_SEEDED_ANGULAR_DIFFERENCE",
        }
        payload = {
            "object_id": object_id,
            "station_id": station_id,
            "windows": [asdict(window) for window in windows],
            "minimum_elevation_deg": minimum_elevation_deg,
            "mount_rate_limit_deg_s": mount_rate_limit_deg_s,
            "provenance": provenance,
        }
        return VisibilityResult(
            object_id=object_id,
            station_id=station_id,
            windows=tuple(windows),
            minimum_elevation_deg=float(minimum_elevation_deg),
            mount_rate_limit_deg_s=float(mount_rate_limit_deg_s),
            illumination_state="NOT_COMPUTED",
            validation_state="SCREENING_ONLY",
            provenance=provenance,
            result_hash=_hash(payload),
        )

    @staticmethod
    def _line_of_sight(state: np.ndarray, station: dict[str, Any], at: datetime) -> np.ndarray:
        vector = state[:3] - _station_eci(station, at)
        return vector / float(np.linalg.norm(vector))

    @staticmethod
    def _window(samples: list[tuple[datetime, float, float]]) -> VisibilityWindow:
        return VisibilityWindow(
            start_utc=samples[0][0],
            end_utc=samples[-1][0],
            max_elevation_deg=max(item[1] for item in samples),
            max_mount_rate_deg_s=max(item[2] for item in samples),
            sample_count=len(samples),
        )
