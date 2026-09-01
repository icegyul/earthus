"""E08 solar ephemeris — angular cross-validation against an independent source.

The original acceptance case only bounded |r| (distance), which let a
convention-mixing elements table misplace Mercury by 57 deg and Venus by
133 deg while every test stayed green (caught 2026-09-01). This test pins the
ANGULAR position of all eight planets against astropy's built-in analytic
ephemeris, so any future elements/propagation regression fails loudly.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

import numpy as np
import pytest
from astropy.coordinates import get_body_barycentric
from astropy.time import Time

from aetherus_space.runtime import PLANET_ELEMENTS, SolarSystemEphemerisEngine

# Fixed epoch: deterministic, mid-validity-range (table is valid 1800-2050).
EPOCH = datetime(2026, 9, 1, 4, 0, tzinfo=timezone.utc)
ASTROPY_EPOCH = Time("2026-09-01T04:00:00", scale="utc")

# Mean-element accuracy budget; measured worst offender is Saturn at ~0.06 deg.
MAX_ANGLE_DEG = 0.5
MAX_DISTANCE_RATIO_ERROR = 0.005

OBLIQUITY_RAD = math.radians(23.43928)
_EQ_TO_ECL = np.array(
    [
        [1.0, 0.0, 0.0],
        [0.0, math.cos(OBLIQUITY_RAD), math.sin(OBLIQUITY_RAD)],
        [0.0, -math.sin(OBLIQUITY_RAD), math.cos(OBLIQUITY_RAD)],
    ]
)


@pytest.mark.parametrize("planet", sorted(PLANET_ELEMENTS))
def test_e08_heliocentric_position_matches_independent_ephemeris(planet: str):
    engine = SolarSystemEphemerisEngine()
    state = engine.state(planet, EPOCH)
    ours = np.asarray(state.position_km)

    sun = get_body_barycentric("sun", ASTROPY_EPOCH)
    body = get_body_barycentric(planet.lower(), ASTROPY_EPOCH)
    reference_eq = np.array(
        [
            (body.x - sun.x).to("km").value,
            (body.y - sun.y).to("km").value,
            (body.z - sun.z).to("km").value,
        ]
    )
    reference = _EQ_TO_ECL @ reference_eq

    cos_angle = np.clip(
        np.dot(ours, reference) / (np.linalg.norm(ours) * np.linalg.norm(reference)),
        -1.0,
        1.0,
    )
    angle_deg = math.degrees(math.acos(cos_angle))
    distance_ratio = np.linalg.norm(ours) / np.linalg.norm(reference)

    assert angle_deg < MAX_ANGLE_DEG, (
        f"{planet}: {angle_deg:.3f} deg from independent ephemeris"
    )
    assert abs(distance_ratio - 1.0) < MAX_DISTANCE_RATIO_ERROR, (
        f"{planet}: heliocentric distance ratio {distance_ratio:.4f}"
    )
