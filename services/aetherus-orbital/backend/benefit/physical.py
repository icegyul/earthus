"""SCREENING_RECOMPUTE_V1 — physical counterfactual engine (P5/P6).

Counterfactual graphs are derived by actually re-running the P4 physics
(SGP4 propagation -> conservative coarse screening -> refined TCA) in memory:

* G0' ("baseline-prime"): every propagable stored solution, unmodified.
* Gs per intervention:    the same pipeline over the modified object set —
  REMOVE excludes the object, SUBSTITUTE replaces its mean elements (the
  candidate-OCM primitive). FULL re-screens everything; AFFECTED_SUBGRAPH
  re-refines only pairs touching the affected set and reuses the physically
  untouched G0' edges.

Removed, changed and newly created edges are detected by comparing the two
derived graphs — new edges are impossible for REMOVE under independent
propagation (asserted, reported as an anomaly if violated) and expected for
trajectory substitutions, which is exactly the candidate-OCM new-risk signal.

Nothing here writes to the operational conjunction tables: scenario physics is
computed in memory and persisted only through the risk-graph snapshot path
with explicit scenario provenance. Advisory only — no command path exists.
"""

import dataclasses
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

#: Channels the physical recompute can actually emit.
#:
#: Every recomputed row is built from propagated public GP elements, which carry
#: no covariance, so ``pc`` and ``max_pc`` are always None on this path (see the
#: row construction below, which records COVARIANCE_MISSING_PUBLIC_GP). Naming
#: that limit here lets the benefit engine refuse to difference a baseline PC
#: against a counterfactual that never had one, instead of publishing the whole
#: baseline value as the benefit of the intervention.
PHYSICAL_RECOMPUTE_CHANNELS = frozenset({"CONJUNCTION_EXPOSURE"})
from backend.conjunction.tca import find_tca
from backend.orbit.errors import PropagationError
from backend.orbit.frames import FrameAssumptions
from backend.orbit.propagator import Sgp4Propagator

PHYSICAL_METHOD = METHOD_PHYSICAL
PHYSICAL_MODEL_VERSION = "p5-physical-recompute-v1"

INTERVENTION_REMOVE = "REMOVE"
INTERVENTION_SUBSTITUTE = "SUBSTITUTE"


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
class Intervention:
    """One counterfactual modification of the input catalog."""

    kind: str  # INTERVENTION_REMOVE | INTERVENTION_SUBSTITUTE
    object_id: str
    candidate_id: str | None = None
    element_overrides: dict[str, float] | None = None  # SUBSTITUTE only

    def label(self) -> str:
        return self.candidate_id or f"{self.kind}:{self.object_id}"


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
class BaselinePrime:
    """Shared physically derived G0' for one or many interventions."""

    graph: RiskGraph
    run: PipelineRun
    input_hash: str


@dataclass(frozen=True)
class EdgeDelta:
    key: tuple[str, str, str]
    baseline_value: float | None
    scenario_value: float | None


@dataclass(frozen=True)
class CandidateOutcome:
    """One intervention's derived Gs plus the edge comparison ledger."""

    intervention: Intervention
    scenario_graph: RiskGraph
    removed_edges: list[EdgeDelta]
    new_edges: list[EdgeDelta]
    changed_edges: list[EdgeDelta]
    reused_edge_count: int
    recomputed_edge_count: int
    run: PipelineRun

    @property
    def removed_edge_keys(self) -> list[tuple[str, str, str]]:
        return [delta.key for delta in self.removed_edges]

    @property
    def new_edge_keys(self) -> list[tuple[str, str, str]]:
        return [delta.key for delta in self.new_edges]

    @property
    def changed_edge_keys(self) -> list[tuple[str, str, str]]:
        return [delta.key for delta in self.changed_edges]


@dataclass(frozen=True)
class PhysicalCounterfactual:
    """Single-REMOVE view kept for the P5 scenario service."""

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


def apply_intervention(
    entries: list[SolutionEntry], intervention: Intervention
) -> list[SolutionEntry]:
    """Return the modified input catalog; never mutates stored solutions."""
    if intervention.kind == INTERVENTION_REMOVE:
        return [e for e in entries if e.object_id != intervention.object_id]
    if intervention.kind == INTERVENTION_SUBSTITUTE:
        overrides = intervention.element_overrides or {}
        modified: list[SolutionEntry] = []
        for entry in entries:
            if entry.object_id != intervention.object_id:
                modified.append(entry)
                continue
            new_elements = dataclasses.replace(
                entry.elements,
                mean_elements={**entry.elements.mean_elements, **overrides},
            )
            modified.append(dataclasses.replace(entry, elements=new_elements))
        return modified
    raise ValueError(f"unknown intervention kind: {intervention.kind}")


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


def compute_baseline_prime(
    *,
    entries: list[SolutionEntry],
    window_start: datetime,
    window_stop: datetime,
    screening_config: ScreeningConfig,
    graph_config: BaselineConfig,
    snapshot_label: str,
    ut1_utc_offset_seconds: float,
) -> BaselinePrime:
    """Derive G0' once; every candidate intervention compares against it."""
    input_hash = recompute_input_hash(entries, screening_config, window_start, window_stop)
    run = _screen_entries(
        entries,
        window_start,
        window_stop,
        screening_config,
        input_hash,
        ut1_utc_offset_seconds=ut1_utc_offset_seconds,
    )
    graph = _graph_from_rows(
        run.event_rows, snapshot_label, window_start, window_stop, graph_config
    )
    return BaselinePrime(graph=graph, run=run, input_hash=input_hash)


def derive_candidate(
    *,
    entries: list[SolutionEntry],
    baseline: BaselinePrime,
    intervention: Intervention,
    extra_affected_ids: frozenset[str],
    window_start: datetime,
    window_stop: datetime,
    screening_config: ScreeningConfig,
    graph_config: BaselineConfig,
    recompute_mode: str,
    snapshot_label: str,
    ut1_utc_offset_seconds: float,
) -> CandidateOutcome:
    """Derive one intervention's Gs against the shared G0'.

    The affected set is the intervened object plus its G0' neighbors plus any
    caller-supplied shell candidates; the intervened object itself always sits
    in the recompute region, so a SUBSTITUTE that moves it into a new orbital
    neighborhood still gets its new-region pairs refined (coarse candidates
    touch the object and therefore pass the pair filter).
    """
    affected_ids = (
        frozenset(extra_affected_ids)
        | baseline.graph.neighbors_of(intervention.object_id)
        | {intervention.object_id}
    )
    modified_entries = apply_intervention(entries, intervention)

    if recompute_mode == "AFFECTED_SUBGRAPH":
        recompute_ids = affected_ids
        run = _screen_entries(
            modified_entries,
            window_start,
            window_stop,
            screening_config,
            baseline.input_hash,
            ut1_utc_offset_seconds=ut1_utc_offset_seconds,
            pair_filter_ids=recompute_ids,
        )
        reused_rows = [
            row
            for row in baseline.run.event_rows
            if row["primary_object_id"] not in affected_ids
            and row["secondary_object_id"] not in affected_ids
        ]
        scenario_rows = [*reused_rows, *run.event_rows]
        reused_count = len(reused_rows)
    else:
        run = _screen_entries(
            modified_entries,
            window_start,
            window_stop,
            screening_config,
            baseline.input_hash,
            ut1_utc_offset_seconds=ut1_utc_offset_seconds,
        )
        scenario_rows = run.event_rows
        reused_count = 0

    scenario_graph = _graph_from_rows(
        scenario_rows, snapshot_label, window_start, window_stop, graph_config
    )

    baseline_keys = {edge.identity_key(): edge for edge in baseline.graph.edges}
    scenario_keys = {edge.identity_key(): edge for edge in scenario_graph.edges}
    removed = [
        EdgeDelta(key=key, baseline_value=edge.metric_value, scenario_value=None)
        for key, edge in sorted(baseline_keys.items())
        if edge.involves(intervention.object_id) and key not in scenario_keys
    ]
    new_edges = [
        EdgeDelta(key=key, baseline_value=None, scenario_value=edge.metric_value)
        for key, edge in sorted(scenario_keys.items())
        if key not in baseline_keys
    ]
    changed = [
        EdgeDelta(
            key=key,
            baseline_value=baseline_keys[key].metric_value,
            scenario_value=edge.metric_value,
        )
        for key, edge in sorted(scenario_keys.items())
        if key in baseline_keys
        and baseline_keys[key].metric_value != edge.metric_value
    ]

    return CandidateOutcome(
        intervention=intervention,
        scenario_graph=scenario_graph,
        removed_edges=removed,
        new_edges=new_edges,
        changed_edges=changed,
        reused_edge_count=reused_count,
        recomputed_edge_count=len(run.event_rows),
        run=run,
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
    """Single-REMOVE convenience wrapper used by the P5 scenario service."""
    baseline = compute_baseline_prime(
        entries=entries,
        window_start=window_start,
        window_stop=window_stop,
        screening_config=screening_config,
        graph_config=graph_config,
        snapshot_label=baseline_snapshot_label,
        ut1_utc_offset_seconds=ut1_utc_offset_seconds,
    )
    outcome = derive_candidate(
        entries=entries,
        baseline=baseline,
        intervention=Intervention(
            kind=INTERVENTION_REMOVE, object_id=target_object_id
        ),
        extra_affected_ids=affected_object_ids,
        window_start=window_start,
        window_stop=window_stop,
        screening_config=screening_config,
        graph_config=graph_config,
        recompute_mode=recompute_mode,
        snapshot_label=scenario_snapshot_label,
        ut1_utc_offset_seconds=ut1_utc_offset_seconds,
    )
    return PhysicalCounterfactual(
        baseline_prime=baseline.graph,
        scenario_graph=outcome.scenario_graph,
        removed_edge_keys=outcome.removed_edge_keys,
        new_edge_keys=outcome.new_edge_keys,
        changed_edge_keys=outcome.changed_edge_keys,
        reused_edge_count=outcome.reused_edge_count,
        recomputed_edge_count=outcome.recomputed_edge_count,
        baseline_run=baseline.run,
        scenario_run=outcome.run,
        input_hash=baseline.input_hash,
        failures=[*baseline.run.failures, *outcome.run.failures],
    )
