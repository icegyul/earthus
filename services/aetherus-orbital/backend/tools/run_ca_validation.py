"""Run the CA-001 validation corpus and record its metrics as evidence.

The synthetic 10k corpus is VALIDATION-ONLY: nothing here touches the
operational database, and its numbers are never presented as real satellite
population or risk figures.
"""

import argparse
import asyncio
import json
import time
from datetime import timedelta
from pathlib import Path

from backend.conjunction.models import ScreeningConfig
from backend.conjunction.screen import coarse_screen, prepare_catalog
from backend.conjunction.tca import find_tca
from backend.orbit.frames import FrameAssumptions
from backend.orbit.propagator import Sgp4Propagator


async def run() -> dict:
    from tests.integration.test_ca_10k_corpus import (
        DATASET_ID,
        DATASET_VERSION,
        SEED,
        T0,
        WINDOW_HOURS,
        build_corpus,
    )

    entries, injected = build_corpus()
    prepared = prepare_catalog(entries)
    config = ScreeningConfig(
        window_hours=WINDOW_HOURS,
        coarse_step_seconds=30,
        refine_step_seconds=5,
        screening_threshold_m=25_000.0,
    )

    started = time.perf_counter()
    result = coarse_screen(prepared, T0, T0 + timedelta(hours=WINDOW_HOURS), config)
    runtime = round(time.perf_counter() - started, 3)

    candidate_pairs = {
        frozenset((c.index_a, c.index_b)): c for c in result.candidates
    }
    false_negatives = 0
    refined = []
    assumptions = FrameAssumptions(ut1_utc_offset_seconds=0.0)
    propagators = {}
    for pair_a, pair_b in injected:
        key = frozenset((pair_a, pair_b))
        if key not in candidate_pairs:
            false_negatives += 1
            continue
        for index in (pair_a, pair_b):
            if index not in propagators:
                propagators[index] = Sgp4Propagator(
                    entries[index][2], assumptions
                )
        def state_of(index):
            propagator = propagators[index]

            def state_fn(moment):
                sample = propagator.propagate(moment)
                return sample.r_teme_km, sample.v_teme_km_s

            return state_fn

        tca = find_tca(
            state_of(pair_a),
            state_of(pair_b),
            T0,
            T0 + timedelta(hours=WINDOW_HOURS),
            coarse_step_seconds=30,
        )
        refined.append(
            {
                "primary_catalog_id": entries[pair_a][1],
                "secondary_catalog_id": entries[pair_b][1],
                "tca_utc": tca.tca_utc.isoformat(),
                "miss_distance_m": round(tca.miss_distance_m, 3),
                "relative_speed_mps": round(tca.relative_speed_mps, 3),
                "boundary_flag": tca.boundary_flag,
            }
        )

    return {
        "dataset_id": DATASET_ID,
        "dataset_version": DATASET_VERSION,
        "validation_only": True,
        "objects": len(entries),
        "objects_propagated": result.objects_propagated,
        "window_hours": WINDOW_HOURS,
        "coarse_step_seconds": config.coarse_step_seconds,
        "refine_step_seconds": config.refine_step_seconds,
        "screening_threshold_m": config.screening_threshold_m,
        "seed": SEED,
        "pairs_before_screening": result.pairs_before_screening,
        "pairs_after_shell": result.pairs_after_shell,
        "pairs_after_coarse": result.pairs_after_coarse,
        "injected_pairs": len(injected),
        "false_negatives": false_negatives,
        "propagation_failures": [
            {"catalog_id": f.catalog_id, "stage": f.stage, "reason": f.reason}
            for f in result.failures
        ],
        "runtime_seconds": runtime,
        "injected_pair_refined_tcas": refined,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Record CA-001 corpus validation metrics")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("artifacts/evidence/p4/validation-ca001.json"),
    )
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    metrics = asyncio.run(run())
    args.output.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    print(f"CA-001 validation metrics written to {args.output}")
    print(
        f"objects={metrics['objects']} pairs_before={metrics['pairs_before_screening']} "
        f"pairs_after={metrics['pairs_after_coarse']} FN={metrics['false_negatives']} "
        f"runtime_s={metrics['runtime_seconds']}"
    )


if __name__ == "__main__":
    main()
