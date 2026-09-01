"""Conservative coarse-screening filter behaviour."""

from datetime import UTC, datetime, timedelta

import numpy as np
import pytest

from backend.conjunction.models import ScreeningConfig
from backend.conjunction.screen import (
    coarse_screen,
    orbital_envelopes,
    prepare_catalog,
    shell_survivor_pairs,
)
from backend.orbit.errors import PropagationError
from backend.orbit.models import MeanElements

T0 = datetime(2026, 8, 25, tzinfo=UTC)


def _elements(catalog_id: str, altitude_km: float, ecc: float = 0.0005) -> MeanElements:
    n_rad_s = float(np.sqrt(398600.4418 / (6378.137 + altitude_km) ** 3))
    return MeanElements(
        catalog_id=catalog_id,
        epoch=T0,
        frame="TEME",
        time_system="UTC",
        theory="SGP4",
        mean_elements={
            "mean_motion_rev_per_day": n_rad_s * 86400.0 / (2.0 * np.pi),
            "eccentricity": ecc,
            "inclination_deg": 51.6,
            "ra_of_asc_node_deg": 120.0,
            "arg_of_pericenter_deg": 30.0,
            "mean_anomaly_deg": 0.0,
            "bstar": 0.0,
        },
    )


class TestOrbitalEnvelopes:
    def test_envelopes_bracket_mean_altitude(self):
        perigee, apogee = orbital_envelopes(_elements("1", 550.0))
        assert perigee < 550.0 < apogee
        assert apogee - perigee < 50.0

    def test_invalid_eccentricity_rejected(self):
        with pytest.raises(PropagationError):
            orbital_envelopes(_elements("1", 550.0, ecc=1.0))


class TestShellFilter:
    def test_disjoint_shells_pruned_overlapping_kept(self):
        prepared = prepare_catalog(
            [
                ("id-a", "10001", _elements("10001", 500.0)),
                ("id-b", "10002", _elements("10002", 520.0)),
                ("id-c", "10003", _elements("10003", 1400.0)),
            ]
        )
        survivors = shell_survivor_pairs(prepared.objects, 25_000.0, 50.0)
        pairs = {tuple(sorted(pair)) for pair in survivors}
        # 500 vs 1400 km shells are provably separated beyond threshold+margin.
        assert (0, 2) not in pairs
        assert (0, 1) in pairs
        assert (1, 2) not in pairs


class TestCoarseScreenEndToEnd:
    def test_close_pair_survives_and_far_pair_does_not(self):
        # Two objects sharing an orbit plane with a small phase offset stay
        # within a few km; a third object sits far away in another shell.
        close_a = _elements("20001", 550.0)
        mean_elements = dict(close_a.mean_elements)
        mean_elements["mean_anomaly_deg"] = 0.05  # ~11 km along-track offset
        close_b = MeanElements(
            catalog_id="20002",
            epoch=close_a.epoch,
            frame="TEME",
            time_system="UTC",
            theory="SGP4",
            mean_elements=mean_elements,
        )
        far = _elements("20003", 1300.0)

        prepared = prepare_catalog(
            [("id-1", "20001", close_a), ("id-2", "20002", close_b), ("id-3", "20003", far)]
        )
        config = ScreeningConfig(
            window_hours=2.0,
            coarse_step_seconds=30,
            refine_step_seconds=5,
            screening_threshold_m=25_000.0,
        )
        result = coarse_screen(prepared, T0, T0 + timedelta(hours=2), config)

        candidate_pairs = {
            tuple(sorted((c.index_a, c.index_b))) for c in result.candidates
        }
        assert (0, 1) in candidate_pairs
        assert (0, 2) not in candidate_pairs
        assert (1, 2) not in candidate_pairs
        assert result.pairs_before_screening == 3
        assert result.pairs_after_shell >= 1

    def test_self_pairs_never_generated(self):
        prepared = prepare_catalog([("id-1", "30001", _elements("30001", 700.0))])
        result = coarse_screen(
            prepared, T0, T0 + timedelta(hours=1), ScreeningConfig(window_hours=1.0)
        )
        assert result.candidates == []
        assert all(c.index_a != c.index_b for c in result.candidates)
