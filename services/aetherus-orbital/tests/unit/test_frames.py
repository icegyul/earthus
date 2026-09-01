"""Frame conversion tests: GMST, TEME->ITRF rotation invariants, geodetic round trip."""

import math
from datetime import UTC, datetime

from backend.orbit.frames import (
    EARTH_ROTATION_RATE_RAD_S,
    FrameAssumptions,
    geodetic_to_itrf,
    gmst_rad_from_ut1,
    itrf_to_geodetic,
    teme_to_itrf,
)

ASSUMPTIONS = FrameAssumptions(ut1_utc_offset_seconds=0.0)
INSTANT = datetime(2026, 8, 23, 0, 0, 0, tzinfo=UTC)


def test_gmst_is_finite_angle_and_advances_with_time():
    first = gmst_rad_from_ut1(INSTANT, 0.0)
    later = gmst_rad_from_ut1(datetime(2026, 8, 24, 0, 0, 0, tzinfo=UTC), 0.0)
    assert 0.0 <= first < math.tau
    sidereal_excess_per_day = (later - first) % math.tau
    seconds_per_century = 876600.0 * 3600.0 + 8640184.812866
    excess_sidereal_seconds_per_day = seconds_per_century / 36525.0 - 86400.0
    expected_excess = excess_sidereal_seconds_per_day * math.pi / 43200.0
    assert abs(sidereal_excess_per_day - expected_excess) < 1e-7


def test_teme_to_itrf_preserves_position_magnitude():
    r_teme = [4216.4, 4887.5, -3279.2]
    v_teme = [-5.7, 4.1, 3.4]
    r_itrf, _v_itrf = teme_to_itrf(r_teme, v_teme, INSTANT, ASSUMPTIONS)
    norm_before = math.sqrt(sum(component**2 for component in r_teme))
    norm_after = math.sqrt(sum(component**2 for component in r_itrf))
    assert abs(norm_before - norm_after) < 1e-9


def test_rotation_composition_round_trips_identity():
    r_teme = [7000.0, -1000.0, 2000.0]
    theta = gmst_rad_from_ut1(INSTANT, 0.0)
    cos_theta, sin_theta = math.cos(theta), math.sin(theta)
    inverse = [
        cos_theta * r_teme[0] - sin_theta * r_teme[1],
        sin_theta * r_teme[0] + cos_theta * r_teme[1],
        r_teme[2],
    ]
    forward = [
        cos_theta * inverse[0] + sin_theta * inverse[1],
        -sin_theta * inverse[0] + cos_theta * inverse[1],
        inverse[2],
    ]
    assert all(abs(a - b) < 1e-12 for a, b in zip(r_teme, forward, strict=False))


def test_velocity_transform_includes_omega_cross_r():
    r_teme = [7000.0, 0.0, 0.0]
    v_teme = [0.0, 7.0, 0.0]
    theta = gmst_rad_from_ut1(INSTANT, ASSUMPTIONS.ut1_utc_offset_seconds)
    _r_itrf, v_itrf = teme_to_itrf(r_teme, v_teme, INSTANT, ASSUMPTIONS)
    expected_vx = 7.0 * math.sin(theta) - EARTH_ROTATION_RATE_RAD_S * 7000.0 * math.sin(theta)
    expected_vy = 7.0 * math.cos(theta) - EARTH_ROTATION_RATE_RAD_S * 7000.0 * math.cos(theta)
    assert abs(v_itrf[0] - expected_vx) < 1e-12
    assert abs(v_itrf[1] - expected_vy) < 1e-12
    assert abs(v_itrf[2]) < 1e-12


def test_geodetic_round_trip_bounded():
    for lat_deg in (-60.0, -15.5, 0.0, 42.25, 88.0):
        for alt_km in (0.0, 420.0, 20200.0):
            r_itrf = geodetic_to_itrf(lat_deg, 137.0, alt_km)
            recovered = itrf_to_geodetic(r_itrf)
            assert abs(recovered["lat_deg"] - lat_deg) < 1e-9
            lon_delta = abs(recovered["lon_deg"] - 137.0) % 360.0
            assert min(lon_delta, 360.0 - lon_delta) < 1e-9
            assert abs(recovered["alt_km"] - alt_km) < 1e-6


def test_geodetic_ranges_hold_for_orbital_positions():
    sample_points = [geodetic_to_itrf(lat, lon, 420.0) for lat in (-90.0, 0.0, 90.0) for lon in (-180.0, 0.0, 180.0)]
    for point in sample_points:
        result = itrf_to_geodetic(point)
        assert -90.0 <= result["lat_deg"] <= 90.0
        assert -180.0 <= result["lon_deg"] <= 180.0
