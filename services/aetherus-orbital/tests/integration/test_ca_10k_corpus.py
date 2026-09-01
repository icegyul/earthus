"""CA-001: synthetic 10k injected-close-pair corpus, false-negative gate.

This corpus is VALIDATION-ONLY. It never touches the operational database and
its synthetic counts are never presented as real satellite population figures.
Ground truth is exact by construction: shells are spaced beyond the screening
threshold and intra-shell phases guarantee large natural minima, so the only
sub-threshold close approaches in the corpus are the injected pairs.
"""

import math
import time
from datetime import UTC, datetime, timedelta

import numpy as np
import pytest

from backend.conjunction.models import ScreeningConfig
from backend.conjunction.screen import coarse_screen, prepare_catalog
from backend.conjunction.tca import find_tca
from backend.orbit.frames import FrameAssumptions
from backend.orbit.models import MeanElements
from backend.orbit.propagator import Sgp4Propagator

T0 = datetime(2026, 8, 25, tzinfo=UTC)
WINDOW_HOURS = 3.0
OBJECT_COUNT = 10_000
SHELLS = 200
PER_SHELL = OBJECT_COUNT // SHELLS  # 50 objects per shell
SHELL_SPACING_KM = 60.0
BASE_ALTITUDE_KM = 450.0
THRESHOLD_M = 25_000.0
SEED = 20260825
DATASET_ID = "synthetic-10k-injected-close-pairs-v1"
DATASET_VERSION = "p4"

pytestmark = [pytest.mark.integration]


def build_corpus():
    """Deterministic 10k-object corpus with injected sub-threshold close pairs."""
    rng = np.random.default_rng(SEED)
    entries = []
    for shell in range(SHELLS):
        altitude = BASE_ALTITUDE_KM + shell * SHELL_SPACING_KM
        inclination = 30.0 + (shell % 7) * 12.0
        raan = float(rng.uniform(0.0, 360.0))
        n_rad_s = math.sqrt(398600.4418 / (6378.137 + altitude) ** 3)
        mean_motion = n_rad_s * 86400.0 / (2.0 * math.pi)
        # One plane per shell; phases equally spaced so natural intra-shell
        # minima stay hundreds of km apart.
        phase_step = 360.0 / PER_SHELL
        for slot in range(PER_SHELL):
            catalog_id = str(100_000 + shell * PER_SHELL + slot)
            entries.append(
                (
                    f"synthetic-{catalog_id}",
                    catalog_id,
                    MeanElements(
                        catalog_id=catalog_id,
                        epoch=T0,
                        frame="TEME",
                        time_system="UTC",
                        theory="SGP4",
                        mean_elements={
                            "mean_motion_rev_per_day": mean_motion,
                            "eccentricity": 0.0002,
                            "inclination_deg": inclination,
                            "ra_of_asc_node_deg": raan,
                            "arg_of_pericenter_deg": 0.0,
                            "mean_anomaly_deg": slot * phase_step,
                            "bstar": 0.0,
                        },
                    ),
                )
            )

    # Inject close pairs: give a partner the same orbit with a phase offset
    # that yields a sub-threshold minimum inside the screening window.
    injected = []
    replacements: dict[int, tuple[str, str, MeanElements]] = {}
    pair_specs = [(4, 5), (17, 23), (1001, 1002), (5000, 5009), (7777, 7783)]
    for first_slot, second_slot in pair_specs:
        primary_index = first_slot % len(entries)
        partner_index = second_slot % len(entries)
        _, _, base_elements = entries[primary_index]
        # Phase offset tuned so the initial separation is ~5 km along-track:
        # delta_phase_deg = 5 km / (2 pi r) * 360.
        radius_km = 6378.137 + BASE_ALTITUDE_KM
        delta_phase = 5.0 / (2.0 * math.pi * radius_km) * 360.0
        partner_mean = dict(base_elements.mean_elements)
        partner_mean["mean_anomaly_deg"] = (
            float(partner_mean["mean_anomaly_deg"]) + delta_phase
        )
        # Prefix 2 keeps the synthetic partner inside the SGP4 Alpha-5 numeric
        # ceiling (<= 339999) while never colliding with the 1xxxxx primaries.
        partner_catalog = "2" + base_elements.catalog_id[1:]
        replacements[partner_index] = (
            f"synthetic-{partner_catalog}",
            partner_catalog,
            MeanElements(
                catalog_id=partner_catalog,
                epoch=base_elements.epoch,
                frame="TEME",
                time_system="UTC",
                theory="SGP4",
                mean_elements=partner_mean,
            ),
        )
        injected.append((primary_index, partner_index))

    final_entries = [
        replacements.get(index, entry) for index, entry in enumerate(entries)
    ]
    return final_entries, injected


@pytest.fixture(scope="module")
def screened_corpus():
    entries, injected = build_corpus()
    prepared = prepare_catalog(entries)
    config = ScreeningConfig(
        window_hours=WINDOW_HOURS,
        coarse_step_seconds=30,
        refine_step_seconds=5,
        screening_threshold_m=THRESHOLD_M,
    )
    start = time.perf_counter()
    result = coarse_screen(prepared, T0, T0 + timedelta(hours=WINDOW_HOURS), config)
    elapsed = time.perf_counter() - start
    metrics = {
        "dataset_id": DATASET_ID,
        "dataset_version": DATASET_VERSION,
        "objects": len(entries),
        "window_hours": WINDOW_HOURS,
        "coarse_step_seconds": config.coarse_step_seconds,
        "pairs_before_screening": result.pairs_before_screening,
        "pairs_after_shell": result.pairs_after_shell,
        "pairs_after_coarse": result.pairs_after_coarse,
        "injected_pairs": len(injected),
        "runtime_seconds": round(elapsed, 3),
        "seed": SEED,
    }
    return entries, injected, result, metrics, prepared


class TestInjectedPairRecall:
    def test_every_injected_pair_survives_coarse_screen(self, screened_corpus):
        _entries, injected, result, _metrics, _prepared = screened_corpus
        candidate_pairs = {
            frozenset((c.index_a, c.index_b)) for c in result.candidates
        }
        missed = [
            (a, b)
            for a, b in injected
            if frozenset((a, b)) not in candidate_pairs
        ]
        assert not missed, (
            f"False negatives detected on validation corpus: {missed}"
        )

    def test_false_negative_rate_is_exactly_zero(self, screened_corpus):
        _entries, injected, result, metrics, _prepared = screened_corpus
        false_negatives = sum(
            1
            for a, b in injected
            if frozenset((a, b))
            not in {frozenset((c.index_a, c.index_b)) for c in result.candidates}
        )
        metrics["false_negatives"] = false_negatives
        assert false_negatives == 0

    def test_refined_tca_finds_sub_threshold_minimum(self, screened_corpus):
        entries, injected, _result, _metrics, _prepared = screened_corpus
        assumptions = FrameAssumptions(ut1_utc_offset_seconds=0.0)
        propagators = {
            index: Sgp4Propagator(entries[index][2], assumptions)
            for index in {i for pair in injected for i in pair}
        }

        def state_fn(propagator):
            def state(moment):
                sample = propagator.propagate(moment)
                return sample.r_teme_km, sample.v_teme_km_s

            return state

        window_stop = T0 + timedelta(hours=WINDOW_HOURS)
        for a, b in injected:
            tca = find_tca(
                state_fn(propagators[a]),
                state_fn(propagators[b]),
                T0,
                window_stop,
                coarse_step_seconds=30,
            )
            assert tca.miss_distance_m <= THRESHOLD_M, (a, b, tca.miss_distance_m)

    def test_extra_candidates_respect_geometric_floor(self, screened_corpus):
        """Corpus geometry proves every non-injected pair stays tens of km apart
        (shell spacing 60 km minus eccentricity wobble plus short-period
        perturbation), so any extra conservative retention must report a sampled
        minimum far above the screening threshold.
        """
        _entries, injected, result, _metrics, _prepared = screened_corpus
        injected_set = {frozenset(pair) for pair in injected}
        extra = [
            c
            for c in result.candidates
            if frozenset((c.index_a, c.index_b)) not in injected_set
        ]
        # Sampled minima only overestimate the true minimum, and the true
        # minimum is bounded well above THRESHOLD_M by construction.
        for candidate in extra:
            assert candidate.min_aligned_distance_m >= 50_000.0, candidate

    def test_metrics_recorded_for_validation_run(self, screened_corpus):
        _entries, _injected, result, metrics, _prepared = screened_corpus
        assert metrics["objects"] == OBJECT_COUNT
        assert metrics["pairs_before_screening"] == OBJECT_COUNT * (OBJECT_COUNT - 1) // 2
        assert result.objects_propagated == OBJECT_COUNT
        assert all(f.stage != "propagation" for f in result.failures)
