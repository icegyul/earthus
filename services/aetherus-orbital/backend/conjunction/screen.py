"""Conservative coarse conjunction screening.

The filter chain is deliberately conservative: orbit-shell envelopes prune only
pairs that provably cannot approach, and every sampled-distance decision adds a
margin that bounds the motion that can happen between samples. A true close
approach can therefore never be filtered out (false-negative target is zero on
the validated corpus).
"""

import math
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime

import numpy as np
from sgp4.api import SatrecArray, jday

from backend.conjunction.models import CandidatePair, ScreeningConfig
from backend.orbit.errors import PropagationError
from backend.orbit.models import MeanElements
from backend.orbit.propagator import build_satrec_from_mean_elements

_EARTH_RADIUS_KM = 6378.137
_MU_KM3_S2 = 398600.4418
_PAIR_CHUNK = 4096

#: Real debris families sit in nearly identical shells, so the radial envelope
#: filter leaves most pairs for the level-one sampled-distance scan, and that
#: scan dominates a screening run. The scan is chunk-independent and spends its
#: time inside NumPy (which releases the GIL), so threads cut wall-clock without
#: copying the shared position grid and without touching the conservative filter
#: chain itself.
#:
#: What the filter actually leaves, measured 2026-09-03 over the stored
#: catalogue (the 2026-09-01 figure of "~10% pruned" predates the
#: active-satellite ingestion and no longer describes this population):
#:
#:      objects   total pairs   shell survivors
#:        2,000     1,999,000       727,999  (36.4%)
#:        5,000    12,497,500     5,240,173  (41.9%)
#:       10,000    49,995,000    26,862,710  (53.7%)
#:       19,657   193,188,996    96,207,658  (49.8%)
#:
#: The survivor *fraction* rises with population - more objects fill the same
#: shells - so the level-one input grows faster than the pair count alone
#: suggests. At full catalogue the survivor list is ~6.5 GB on its own.
_LEVEL_ONE_PARALLEL_MIN_CHUNKS = 4


def _level_one_workers(chunk_count: int) -> int:
    """Bound worker count by chunks and CPUs; 1 keeps the sequential path."""
    if chunk_count < _LEVEL_ONE_PARALLEL_MIN_CHUNKS:
        return 1
    configured = os.environ.get("AETHERUS_SCREENING_WORKERS")
    if configured:
        try:
            requested = int(configured)
        except ValueError:
            requested = 0
        if requested > 0:
            return min(requested, chunk_count)
    return max(1, min(chunk_count, (os.cpu_count() or 2) - 1, 8))


@dataclass(frozen=True)
class ScreenableObject:
    """One propagable object prepared for vectorized screening."""

    index: int
    catalog_id: str
    object_id: str
    perigee_km: float
    apogee_km: float


@dataclass(frozen=True)
class ScreeningFailure:
    """One object excluded from screening with an explicit machine-readable reason."""

    catalog_id: str
    object_id: str
    stage: str
    reason: str


@dataclass(frozen=True)
class PreparedCatalog:
    """Objects that initialized cleanly plus every explicit exclusion."""

    objects: list[ScreenableObject]
    satrecs: list
    failures: list[ScreeningFailure]


@dataclass(frozen=True)
class CoarseScreenResult:
    """Screening statistics required by the provenance contract."""

    candidates: list[CandidatePair]
    pairs_before_screening: int
    pairs_after_shell: int
    pairs_after_coarse: int
    objects_propagated: int
    failures: list[ScreeningFailure] = field(default_factory=list)


def orbital_envelopes(elements: MeanElements) -> tuple[float, float]:
    """Perigee/apogee altitudes in km derived from canonical mean elements."""
    raw = elements.mean_elements
    mean_motion_value = raw.get("mean_motion_rev_per_day")
    eccentricity_value = raw.get("eccentricity")
    if mean_motion_value is None or eccentricity_value is None:
        raise PropagationError(
            "Mean motion and eccentricity are required for screening envelopes",
            {"catalog_id": elements.catalog_id},
        )
    mean_motion_rev_per_day = float(mean_motion_value)
    eccentricity = float(eccentricity_value)
    if mean_motion_rev_per_day <= 0.0:
        raise PropagationError(
            "Mean motion must be positive", {"catalog_id": elements.catalog_id}
        )
    if not 0.0 <= eccentricity < 1.0:
        raise PropagationError(
            "Eccentricity must lie in [0, 1) for closed orbits",
            {"catalog_id": elements.catalog_id},
        )
    n_rad_s = mean_motion_rev_per_day * 2.0 * math.pi / 86400.0
    semi_major_km = (_MU_KM3_S2 / (n_rad_s * n_rad_s)) ** (1.0 / 3.0)
    perigee_km = semi_major_km * (1.0 - eccentricity) - _EARTH_RADIUS_KM
    apogee_km = semi_major_km * (1.0 + eccentricity) - _EARTH_RADIUS_KM
    return perigee_km, apogee_km


def prepare_catalog(
    entries: list[tuple[str, str, MeanElements]],
) -> PreparedCatalog:
    """Initialize one SGP4 record per stored solution; exclusions stay explicit."""
    objects: list[ScreenableObject] = []
    satrecs: list = []
    failures: list[ScreeningFailure] = []
    for _index, (object_id, catalog_id, elements) in enumerate(entries):
        try:
            envelopes = orbital_envelopes(elements)
            satrec = build_satrec_from_mean_elements(elements)
        except PropagationError as error:
            failures.append(
                ScreeningFailure(
                    catalog_id=catalog_id,
                    object_id=object_id,
                    stage="initialization",
                    reason=str(error.details.get("reason") or error.message),
                )
            )
            continue
        objects.append(
            ScreenableObject(
                index=len(objects),
                catalog_id=catalog_id,
                object_id=object_id,
                perigee_km=envelopes[0],
                apogee_km=envelopes[1],
            )
        )
        satrecs.append(satrec)
    return PreparedCatalog(objects=objects, satrecs=satrecs, failures=failures)


def shell_survivor_pairs(
    objects: list[ScreenableObject], threshold_m: float, shell_margin_km: float
) -> list[tuple[int, int]]:
    """Radial-envelope filter: prune only provably separated shells.

    Two objects can only approach if their radial envelopes overlap within the
    screening threshold; otherwise the minimum possible range already exceeds
    it and the pair can never become a true event.
    """
    limit_km = threshold_m / 1000.0 + 2.0 * shell_margin_km
    ordered = sorted(objects, key=lambda obj: obj.perigee_km)
    survivors: list[tuple[int, int]] = []
    for position, first in enumerate(ordered):
        for second in ordered[position + 1 :]:
            # Sorted by perigee: once the radial gap bound exceeds the limit,
            # every later pair involving `first` is separated even wider.
            if second.perigee_km - first.apogee_km > limit_km:
                break
            survivors.append((first.index, second.index))
    return survivors


def coarse_screen(
    prepared: PreparedCatalog,
    window_start: datetime,
    window_stop: datetime,
    config: ScreeningConfig,
) -> CoarseScreenResult:
    """Run the conservative cascade over one bounded UTC window."""
    objects = prepared.objects
    total_pairs = len(objects) * (len(objects) - 1) // 2
    if len(objects) < 2:
        return CoarseScreenResult(
            candidates=[],
            pairs_before_screening=total_pairs,
            pairs_after_shell=0,
            pairs_after_coarse=0,
            objects_propagated=len(objects),
            failures=list(prepared.failures),
        )

    grid = _grid_times(window_start, window_stop, config.coarse_step_seconds)
    jd_array, fr_array = _jday_arrays(grid)
    error_codes, positions, velocities = _propagate_array(
        SatrecArray(prepared.satrecs), jd_array, fr_array
    )

    live_objects, propagation_failures = _apply_error_codes(objects, error_codes)
    all_failures = [*prepared.failures, *propagation_failures]

    shell_pairs = shell_survivor_pairs(
        live_objects, config.screening_threshold_m, config.shell_margin_km
    )

    candidates: list[CandidatePair] = []
    refinement_failures: list[ScreeningFailure] = []
    catalog_by_index = {obj.index: obj.catalog_id for obj in live_objects}
    chunks = [
        shell_pairs[start : start + _PAIR_CHUNK]
        for start in range(0, len(shell_pairs), _PAIR_CHUNK)
    ]

    def level_one(chunk: list[tuple[int, int]]) -> list[tuple[tuple[int, int], int]]:
        return _level_one_chunk(chunk, positions, velocities, config)

    workers = _level_one_workers(len(chunks))
    if workers > 1:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            # map preserves chunk order, so candidate ordering — and therefore
            # every downstream hash — stays identical to the sequential path.
            survivor_sets = list(pool.map(level_one, chunks))
    else:
        survivor_sets = [level_one(chunk) for chunk in chunks]

    for survivors in survivor_sets:
        chunk_candidates, failures = _level_two_grouped(
            survivors,
            prepared.satrecs,
            grid,
            window_start,
            window_stop,
            config,
            catalog_by_index=catalog_by_index,
        )
        candidates.extend(chunk_candidates)
        refinement_failures.extend(failures)

    return CoarseScreenResult(
        candidates=candidates,
        pairs_before_screening=total_pairs,
        pairs_after_shell=len(shell_pairs),
        pairs_after_coarse=len(candidates),
        objects_propagated=len(live_objects),
        failures=[*all_failures, *refinement_failures],
    )


def _grid_times(start: datetime, stop: datetime, step_seconds: int) -> list[datetime]:
    from datetime import timedelta

    grid: list[datetime] = []
    cursor = start
    while cursor < stop:
        grid.append(cursor)
        cursor += timedelta(seconds=step_seconds)
    grid.append(stop)
    return grid


def _jday_arrays(grid: list[datetime]) -> tuple[np.ndarray, np.ndarray]:
    jd_list: list[float] = []
    fr_list: list[float] = []
    for moment in grid:
        jd, fr = jday(
            moment.year,
            moment.month,
            moment.day,
            moment.hour,
            moment.minute,
            moment.second + moment.microsecond / 1_000_000.0,
        )
        jd_list.append(jd)
        fr_list.append(fr)
    return np.asarray(jd_list, dtype=float), np.asarray(fr_list, dtype=float)


def _propagate_array(
    array, jd_array: np.ndarray, fr_array: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Run one vectorized SGP4 pass; returns ``(errors, positions, velocities)``."""
    errors, positions, velocities = array.sgp4(jd_array, fr_array)
    return (
        np.asarray(errors, dtype=np.int64),
        np.asarray(positions, dtype=np.float64),
        np.asarray(velocities, dtype=np.float64),
    )


def _apply_error_codes(
    objects: list[ScreenableObject], error_codes: np.ndarray
) -> tuple[list[ScreenableObject], list[ScreeningFailure]]:
    live: list[ScreenableObject] = []
    failures: list[ScreeningFailure] = []
    for obj in objects:
        codes = error_codes[obj.index]
        failed = codes[codes != 0]
        if failed.size:
            failures.append(
                ScreeningFailure(
                    catalog_id=obj.catalog_id,
                    object_id=obj.object_id,
                    stage="propagation",
                    reason=f"SGP4 error code {int(failed[0])} during screening window",
                )
            )
        else:
            live.append(obj)
    return live, failures


_ACCELERATION_PAD_KM_S2 = 0.01


def _level_one_chunk(
    chunk: list[tuple[int, int]],
    positions: np.ndarray,
    velocities: np.ndarray,
    config: ScreeningConfig,
) -> list[tuple[tuple[int, int], int]]:
    """Coarse aligned-sample scan with honest per-pair inter-sample margins.

    The margin uses the pair's own sampled maximum relative speed plus an
    acceleration pad bounding inter-sample velocity drift, multiplied by the
    safety factor: together they bound how much closer the pair can get
    between grid points. All comparisons are in metres.
    Returns ``(pair, argmin_index)`` survivors.
    """
    if not chunk:
        return []
    left_indices = np.fromiter((pair[0] for pair in chunk), dtype=np.intp)
    right_indices = np.fromiter((pair[1] for pair in chunk), dtype=np.intp)

    rel = positions[left_indices] - positions[right_indices]
    distances_m = np.linalg.norm(rel, axis=2) * 1000.0
    argmin = distances_m.argmin(axis=1)
    min_level1_m = distances_m[np.arange(len(chunk)), argmin]

    relative_speed = np.linalg.norm(
        velocities[left_indices] - velocities[right_indices], axis=2
    ).max(axis=1)
    relative_speed_upper = (
        relative_speed + _ACCELERATION_PAD_KM_S2 * config.coarse_step_seconds
    )
    margin_level1_m = (
        relative_speed_upper * 1000.0 * config.coarse_step_seconds * config.safety_factor
    )

    keep = min_level1_m - margin_level1_m < config.screening_threshold_m
    return [
        (chunk[int(row)], int(argmin[int(row)]))
        for row in np.nonzero(keep)[0]
    ]


def _level_two_grouped(
    survivors: list[tuple[tuple[int, int], int]],
    satrecs: list,
    coarse_grid: list[datetime],
    window_start: datetime,
    window_stop: datetime,
    config: ScreeningConfig,
    catalog_by_index: dict[int, str] | None = None,
) -> tuple[list[CandidatePair], list[ScreeningFailure]]:
    """Re-propagate survivor pairs on fine local grids, batched per argmin group.

    Pairs sharing a coarse-grid minimum index are refined together with one
    vectorized propagation over a window expanded by the safety factor, so no
    close approach can escape the finer sampling either.
    """
    from datetime import timedelta

    fine_step = max(config.refine_step_seconds, 1)
    expansion_samples = int(math.ceil(config.safety_factor)) + 2
    half_span = timedelta(seconds=expansion_samples * config.coarse_step_seconds)

    groups: dict[int, list[tuple[int, int]]] = {}
    for pair, center_index in survivors:
        groups.setdefault(center_index, []).append(pair)

    candidates: list[CandidatePair] = []
    failures: list[ScreeningFailure] = []
    for center_index, pairs in groups.items():
        center_time = coarse_grid[min(center_index, len(coarse_grid) - 1)]
        lo_time = max(center_time - half_span, window_start)
        hi_time = min(center_time + half_span, window_stop)
        fine_times: list[datetime] = []
        cursor = lo_time
        while cursor <= hi_time:
            fine_times.append(cursor)
            cursor += timedelta(seconds=fine_step)
        if not fine_times:
            continue

        involved = sorted({index for pair in pairs for index in pair})
        row_of = {satellite: row for row, satellite in enumerate(involved)}
        sub_array = SatrecArray([satrecs[index] for index in involved])
        jd_array, fr_array = _jday_arrays(fine_times)
        errors, positions, velocities = _propagate_array(sub_array, jd_array, fr_array)
        broken_rows = {int(row) for row in np.nonzero(errors.any(axis=1))[0]}
        for row in sorted(broken_rows):
            satellite_index = involved[row]
            failures.append(
                ScreeningFailure(
                    catalog_id=catalog_by_index.get(satellite_index, str(satellite_index))
                    if catalog_by_index
                    else str(satellite_index),
                    object_id=str(satellite_index),
                    stage="propagation_refine",
                    reason="SGP4 error during candidate refinement",
                )
            )

        for left, right in pairs:
            row_left = row_of[left]
            row_right = row_of[right]
            if row_left in broken_rows or row_right in broken_rows:
                continue
            rel = positions[row_left] - positions[row_right]
            distances = np.linalg.norm(rel, axis=1)
            refined_min_m = float(distances.min()) * 1000.0
            rel_speeds = np.linalg.norm(
                velocities[row_left] - velocities[row_right], axis=1
            )
            relative_speed_upper = float(rel_speeds.max()) + (
                _ACCELERATION_PAD_KM_S2 * fine_step
            )
            margin_level2_m = (
                relative_speed_upper * 1000.0 * fine_step * config.safety_factor
            )
            if refined_min_m - margin_level2_m < config.screening_threshold_m:
                candidates.append(
                    CandidatePair(
                        index_a=left,
                        index_b=right,
                        min_aligned_distance_m=refined_min_m,
                        sample_count_used=int(distances.size),
                    )
                )
    return candidates, failures
