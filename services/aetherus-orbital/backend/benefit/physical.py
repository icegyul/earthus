"""SCREENING_RECOMPUTE_V1 — physical counterfactual engine for REMOVE scenarios.

This module derives the counterfactual by actually re-running the P4 physics
(SGP4 propagation -> conservative coarse screening -> refined TCA) in memory:

* G0' ("baseline-prime"): every propagable stored solution, target included.
* Gs  (scenario graph):   the same pipeline with the target excluded from the
  input catalog (FULL), or with only affected-set-touching pairs re-refined and
  physically-untouched edges reused from G0' (AFFECTED_SUBGRAPH).

Benefit = R_i(G0') - R_i(Gs) is therefore a difference of two physically
derived graphs, never a graph-surgery artifact. Newly created edges (possible
for trajectory-change interventions, impossible for REMOVE under independent
propagation) are detected and reported instead of being structurally denied.

Nothing here writes to the operational conjunction tables: scenario physics is
computed in memory and persisted only through the risk-graph snapshot path
with explicit scenario provenance.
"""

import hashlib
import json
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from backend.benefit.models import (
    METHOD_PHYSICAL,
    BaselineConfig,
    RiskGraph,
    build_graph_hash,
)
from backend.conjunction.models import ScreeningConfig
from backend.conjunction.screen import coarse_screen, prepare_catalog
from backend.conjunction.tca import find_tca
from backend.orbit.errors import PropagationError
from backend.orbit.frames import FrameAssumptions
from backend.orbit.propagator import Sgp4Propagator

PHYSICAL_METHOD = METHOD_PHYSICAL
PHYSICAL_MODEL_VERSION = "p5-physical-recompute-v1"


@dataclass(frozen=True)
class SolutionEntry:
    """One propagable stored solution feeding the recompute pipeline."""

    object_id: str
    catalog_id: str
    elements: Any  # MeanElements (P2 canonical)
    orbit_solution_id: str
    source_id: str | None
    source_grade: str | None
    covariance_status: str
    content_sha256: str | None


@dataclass(frozen=True)
class PipelineRun:
    """Outcome of one in-memory screening pass over an entry set."""

    event_rows: list[dict[str, Any]]
    failures: list[dict[str, Any]]
    pairs_before_screening: int
    pairs_after_coarse: int
    tca_refinements: int
    objects_propagated: int
    compute_ms: int


@dataclass(frozen=True)
class PhysicalCounterfactual:
    """Both physically derived graphs plus the comparison ledger."""

    baseline_prime: RiskGraph
    scenario_graph: RiskGraph
    removed_edge_keys: list[tuple[str, str, str]]
    new_edge_keys: list[tuple[str, str, str]]
    changed_edge_keys: list[tuple[str, str, str]]
    reused_edge_count: int
    recomputed_edge_count: int
    baseline_run: PipelineRun
    scenario_run: PipelineRun
    input_hash: str
    failures: list[dict[str, Any]] = field(default_factory=list)


def build_entries(solution_rows: list[dict[str, Any]], to_mean_elements) -> tuple[
    list[SolutionEntry], list[dict[str, Any]]
]:
    """Filter stored solutions to the SGP4/TEME/UTC subset the pipeline accepts."""
    entries: list[SolutionEntry] = []
    skipped: list[dict[str, Any]] = []
    for row in solution_rows:
        if (
            str(row.get("theory") or "").upper() != "SGP4"
            or str(row.get("frame") or "").upper() != "TEME"
            or str(row.get("time_system") or "").upper() != "UTC"
        ):
            skipped.append(
                {
                    "catalog_id": str(row.get("catalog_id")),
                    "stage": "input_filter",
                    "reason": "SOLUTION_NOT_SGP4_TEME_UTC",
                }
            )
            continue
        elements, quality = to_mean_elements(row)
        entries.append(
            SolutionEntry(
                object_id=str(row["object_id"]),
                catalog_id=str(row["catalog_id"]),
                elements=elements,
                orbit_solution_id=str(row["orbit_solution_id"]),
                source_id=row.get("source_id"),
                source_grade=quality.get("source_grade"),
                covariance_status=str(
                    quality.get("covariance_status", "INSUFFICIENT_DATA")
                ),
                content_sha256=row.get("content_sha256"),
            )
        )
    return entries, skipped


def recompute_input_hash(
    entries: list[SolutionEntry],
    config: ScreeningConfig,
    window_start: datetime,
    window_stop: datetime,
) -> str:
    serialized = json.dumps(
        {
            "method": PHYSICAL_METHOD,
            "orbit_solution_ids": sorted(entry.orbit_solution_id for entry in entries),
            "config": config.to_payload(),
            "window_start": window_start.isoformat(),
            "window_stop": window_stop.isoformat(),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _screen_entries(
    entries: list[SolutionEntry],
    window_start: datetime,
    window_stop: datetime,
    config: ScreeningConfig,
    input_hash: str,
    *,
    ut1_utc_offset_seconds: float,
    pair_filter_ids: frozenset[str] | None = None,
) -> PipelineRun:
    """Run propagate -> coarse screen -> refined TCA over one entry set.

    ``pair_filter_ids``: when given, only coarse candidates touching this
    object-id set are refined (the AFFECTED_SUBGRAPH cost saving); other
    candidates are dropped here and must be reused from the baseline run.
    """
    started = time.perf_counter()
    raw_entries = [(e.object_id, e.catalog_id, e.elements) for e in entries]
    by_object: dict[str, SolutionEntry] = {e.object_id: e for e in entries}

    prepared = prepare_catalog(raw_entries)
    screen = coarse_screen(prepared, window_start, window_stop, config)
    failures = [
        {
            "catalog_id": failure.catalog_id,
            "object_id": failure.object_id,
            "stage": failure.stage,
            "reason": failure.reason,
        }
        for failure in screen.failures
    ]
    # Identity-based mapping: prepare_catalog drops init-failing objects, so a
    # positional zip would misalign every later candidate pair (same defect as
    # the one fixed in conjunction/service.py on 2026-09-01).
    entry_by_object_id = {entry[0]: entry for entry in raw_entries}
    index_to_entry = {
        obj.index: entry_by_object_id[obj.object_id] for obj in prepared.objects
    }

    assumptions = FrameAssumptions(ut1_utc_offset_seconds=ut1_utc_offset_seconds)
    event_rows: list[dict[str, Any]] = []
    refinements = 0
    for candidate in screen.candidates:
        entry_a = index_to_entry[candidate.index_a]
        entry_b = index_to_entry[candidate.index_b]
        if pair_filter_ids is not None and not (
            entry_a[0] in pair_filter_ids or entry_b[0] in pair_filter_ids
        ):
            continue
        refinements += 1
        propagator_a = Sgp4Propagator(entry_a[2], assumptions)
        propagator_b = Sgp4Propagator(entry_b[2], assumptions)

        def state_fn(propagator):
            def inner(moment):
                sample = propagator.propagate(moment)
                return sample.r_teme_km, sample.v_teme_km_s

            return inner

        try:
            tca_result = find_tca(
                state_fn(propagator_a),
                state_fn(propagator_b),
                window_start=window_start,
                window_stop=window_stop,
                coarse_step_seconds=max(config.refine_step_seconds, 5),
            )
        except (PropagationError, ValueError) as error:
            failures.append(
                {
                    "catalog_id": f"{entry_a[1]}|{entry_b[1]}",
                    "stage": "tca_refinement",
                    "reason": str(getattr(error, "message", error)),
                }
            )
            continue
        if tca_result.miss_distance_m > config.screening_threshold_m:
            continue

        primary_id, secondary_id = sorted([entry_a[0], entry_b[0]])
        sol_a = by_object[primary_id]
        sol_b = by_object[secondary_id]
        pair_label = f"{sol_a.catalog_id}:{sol_b.catalog_id}"
        # PUBLIC_GP never carries covariance: the covariance-gated Pc rule from
        # P4 applies identically here and no probability is ever invented.
        event_rows.append(
            {
                "event_id": f"recompute:{pair_label}",
                "snapshot_id": f"recompute-snapshot:{pair_label}",
                "primary_object_id": primary_id,
                "secondary_object_id": secondary_id,
                "tca": tca_result.tca_utc,
                "snapshot_at": window_start,
                "miss_distance_m": tca_result.miss_distance_m,
                "relative_speed_mps": tca_result.relative_speed_mps,
                "tca_boundary_flag": tca_result.boundary_flag,
                "pc": None,
                "pc_status": "NOT_COMPUTED",
                "pc_unavailable_reason": "COVARIANCE_MISSING_PUBLIC_GP",
                "max_pc": None,
                "covariance_status": "INSUFFICIENT_DATA",
                "source_grade": sol_a.source_grade or sol_b.source_grade,
                "validation_state": "PUBLIC_SCREENING",
                "model_version": PHYSICAL_MODEL_VERSION,
                "input_hash": input_hash,
                "derivation": PHYSICAL_METHOD,
                "orbit_solution_ids": [sol_a.orbit_solution_id, sol_b.orbit_solution_id],
                "input_artifact_hashes": [
                    f"sha256:{sol_a.content_sha256}" if sol_a.content_sha256 else None,
                    f"sha256:{sol_b.content_sha256}" if sol_b.content_sha256 else None,
                ],
            }
        )

    return PipelineRun(
        event_rows=event_rows,
        failures=failures,
        pairs_before_screening=screen.pairs_before_screening,
        pairs_after_coarse=screen.pairs_after_coarse,
        tca_refinements=refinements,
        objects_propagated=screen.objects_propagated,
        compute_ms=int((time.perf_counter() - started) * 1000),
    )


def _graph_from_rows(
    rows: list[dict[str, Any]],
    snapshot_id: str,
    horizon_start: datetime,
    horizon_end: datetime,
    graph_config: BaselineConfig,
) -> RiskGraph:
    from backend.benefit.graph import build_baseline_edges

    build = build_baseline_edges(rows, graph_config)
    return RiskGraph(
        snapshot_id=snapshot_id,
        horizon_start=horizon_start,
        horizon_end=horizon_end,
        edges=tuple(build.edges),
        graph_hash=build_graph_hash(build.edges),
    )


def run_physical_counterfactual(
    *,
    entries: list[SolutionEntry],
    target_object_id: str,
    affected_object_ids: frozenset[str],
    window_start: datetime,
    window_stop: datetime,
    screening_config: ScreeningConfig,
    graph_config: BaselineConfig,
    recompute_mode: str,
    baseline_snapshot_label: str,
    scenario_snapshot_label: str,
    ut1_utc_offset_seconds: float,
) -> PhysicalCounterfactual:
    """Derive G0' and Gs physically; Gs never sees the target's solution."""
    input_hash = recompute_input_hash(entries, screening_config, window_start, window_stop)

    baseline_run = _screen_entries(
        entries,
        window_start,
        window_stop,
        screening_config,
        input_hash,
        ut1_utc_offset_seconds=ut1_utc_offset_seconds,
    )
    baseline_prime = _graph_from_rows(
        baseline_run.event_rows,
        baseline_snapshot_label,
        window_start,
        window_stop,
        graph_config,
    )

    scenario_entries = [e for e in entries if e.object_id != target_object_id]
    # The affected set is augmented with the target's neighbors as physically
    # observed in G0' so drift between the stored baseline and current inputs
    # can never leave a touched pair outside the recompute region.
    affected_object_ids = (
        frozenset(affected_object_ids)
        | baseline_prime.neighbors_of(target_object_id)
        | {target_object_id}
    )
    if recompute_mode == "AFFECTED_SUBGRAPH":
        # Physically-untouched edges (no endpoint in the affected set) are
        # reused from G0'; only affected-touching pairs are re-refined.
        recompute_ids = frozenset(affected_object_ids) - {target_object_id}
        scenario_run = _screen_entries(
            scenario_entries,
            window_start,
            window_stop,
            screening_config,
            input_hash,
            ut1_utc_offset_seconds=ut1_utc_offset_seconds,
            pair_filter_ids=recompute_ids,
        )
        reused_rows = [
            row
            for row in baseline_run.event_rows
            if row["primary_object_id"] not in affected_object_ids
            and row["secondary_object_id"] not in affected_object_ids
        ]
        scenario_rows = [*reused_rows, *scenario_run.event_rows]
        reused_count = len(reused_rows)
        recomputed_count = len(scenario_run.event_rows)
    else:
        scenario_run = _screen_entries(
            scenario_entries,
            window_start,
            window_stop,
            screening_config,
            input_hash,
            ut1_utc_offset_seconds=ut1_utc_offset_seconds,
        )
        scenario_rows = scenario_run.event_rows
        reused_count = 0
        recomputed_count = len(scenario_run.event_rows)

    scenario_graph = _graph_from_rows(
        scenario_rows,
        scenario_snapshot_label,
        window_start,
        window_stop,
        graph_config,
    )

    baseline_keys = {edge.identity_key(): edge for edge in baseline_prime.edges}
    scenario_keys = {edge.identity_key(): edge for edge in scenario_graph.edges}
    removed = sorted(
        key
        for key, edge in baseline_keys.items()
        if edge.involves(target_object_id) and key not in scenario_keys
    )
    new_edges = sorted(key for key in scenario_keys if key not in baseline_keys)
    changed = sorted(
        key
        for key, edge in scenario_keys.items()
        if key in baseline_keys
        and baseline_keys[key].metric_value != edge.metric_value
    )

    return PhysicalCounterfactual(
        baseline_prime=baseline_prime,
        scenario_graph=scenario_graph,
        removed_edge_keys=removed,
        new_edge_keys=new_edges,
        changed_edge_keys=changed,
        reused_edge_count=reused_count,
        recomputed_edge_count=recomputed_count,
        baseline_run=baseline_run,
        scenario_run=scenario_run,
        input_hash=input_hash,
        failures=[*baseline_run.failures, *scenario_run.failures],
    )
