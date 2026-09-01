"""TEME to Earth-fixed to geodetic conversion with stored time/EOP assumptions."""

import math
from dataclasses import dataclass
from datetime import datetime

from backend.orbit.time_scale import julian_date

WGS84_SEMI_MAJOR_AXIS_KM = 6378.137
WGS84_FLATTENING = 1.0 / 298.257223563
_WGS84_ECCENTRICITY_SQUARED = WGS84_FLATTENING * (2.0 - WGS84_FLATTENING)

EARTH_ROTATION_RATE_RAD_S = 7.2921158553e-5

GMST_REFERENCE_JULIAN_DATE = 2451545.0
_GMST_BASE_SECONDS = 67310.54841
_GMST_LINEAR_SECONDS = 876600.0 * 3600.0 + 8640184.812866
_GMST_QUADRATIC_SECONDS = 0.093104
_GMST_CUBIC_SECONDS = -6.2e-6
_SECONDS_PER_DEGREE = 240.0


@dataclass(frozen=True)
class FrameAssumptions:
    """The exact time/EOP assumptions behind every published frame conversion."""

    ut1_utc_offset_seconds: float
    polar_motion_applied: bool = False
    nutation_model: str = "none"
    description: str = "TEME->ITRF by IAU-82 GMST sidereal rotation; UT1 approximated from UTC"

    def config(self) -> dict[str, object]:
        """Return a JSON-serializable configuration block for hashing."""
        return {
            "gmst_model": "IAU-1982",
            "nutation_model": self.nutation_model,
            "polar_motion_applied": self.polar_motion_applied,
            "ut1_utc_offset_seconds": self.ut1_utc_offset_seconds,
        }


def gmst_rad_from_ut1(moment_utc: datetime, ut1_utc_offset_seconds: float = 0.0) -> float:
    """Return Greenwich mean sidereal angle in radians per IAU-1982."""
    jd_ut1 = julian_date(moment_utc) + ut1_utc_offset_seconds / 86400.0
    centuries = (jd_ut1 - GMST_REFERENCE_JULIAN_DATE) / 36525.0
    total_seconds = (
        _GMST_BASE_SECONDS
        + _GMST_LINEAR_SECONDS * centuries
        + _GMST_QUADRATIC_SECONDS * centuries * centuries
        + _GMST_CUBIC_SECONDS * centuries * centuries * centuries
    )
    revolutions = (total_seconds % 86400.0) / 86400.0
    return math.tau * revolutions


def teme_to_itrf(
    r_teme_km: list[float],
    v_teme_km_s: list[float],
    moment_utc: datetime,
    assumptions: FrameAssumptions,
) -> tuple[list[float], list[float]]:
    """Rotate one TEME state into ITRF using GMST about Z only."""
    theta = gmst_rad_from_ut1(moment_utc, assumptions.ut1_utc_offset_seconds)
    cos_theta = math.cos(theta)
    sin_theta = math.sin(theta)

    x, y, z = r_teme_km
    r_itrf = [
        cos_theta * x + sin_theta * y,
        -sin_theta * x + cos_theta * y,
        z,
    ]
    vx, vy, vz = v_teme_km_s
    vx_itrf = cos_theta * vx + sin_theta * vy
    vy_itrf = -sin_theta * vx + cos_theta * vy
    omega_cross_r_x = -EARTH_ROTATION_RATE_RAD_S * r_itrf[1]
    omega_cross_r_y = EARTH_ROTATION_RATE_RAD_S * r_itrf[0]
    v_itrf = [
        vx_itrf - omega_cross_r_x,
        vy_itrf - omega_cross_r_y,
        vz,
    ]
    return r_itrf, v_itrf


def itrf_to_geodetic(r_itrf_km: list[float]) -> dict[str, float]:
    """Convert one Earth-fixed position to WGS84 latitude, longitude, altitude."""
    x, y, z = r_itrf_km
    p = math.hypot(x, y)
    longitude = math.atan2(y, x)
    latitude = math.atan2(z, p)
    for _ in range(12):
        denominator = math.sqrt(1.0 - _WGS84_ECCENTRICITY_SQUARED * math.sin(latitude) ** 2)
        prime_vertical_radius = WGS84_SEMI_MAJOR_AXIS_KM / denominator
        new_latitude = math.atan2(z + _WGS84_ECCENTRICITY_SQUARED * prime_vertical_radius * math.sin(latitude), p)
        if abs(new_latitude - latitude) < 1e-13:
            latitude = new_latitude
            break
        latitude = new_latitude
    denominator = math.sqrt(1.0 - _WGS84_ECCENTRICITY_SQUARED * math.sin(latitude) ** 2)
    prime_vertical_radius = WGS84_SEMI_MAJOR_AXIS_KM / denominator
    if abs(math.cos(latitude)) < 1e-12:
        altitude = abs(z) - prime_vertical_radius * (1.0 - _WGS84_ECCENTRICITY_SQUARED)
    else:
        altitude = p / math.cos(latitude) - prime_vertical_radius
    return {
        "lat_deg": math.degrees(latitude),
        "lon_deg": math.degrees(longitude),
        "alt_km": altitude,
    }


def geodetic_to_itrf(lat_deg: float, lon_deg: float, alt_km: float) -> list[float]:
    """Inverse geodetic conversion used only to bound round-trip error in tests."""
    latitude = math.radians(lat_deg)
    longitude = math.radians(lon_deg)
    denominator = math.sqrt(1.0 - _WGS84_ECCENTRICITY_SQUARED * math.sin(latitude) ** 2)
    prime_vertical_radius = WGS84_SEMI_MAJOR_AXIS_KM / denominator
    p = (prime_vertical_radius + alt_km) * math.cos(latitude)
    z = (prime_vertical_radius * (1.0 - _WGS84_ECCENTRICITY_SQUARED) + alt_km) * math.sin(latitude)
    return [p * math.cos(longitude), p * math.sin(longitude), z]
