"""Benefit engine orchestration: stored P4 input in, honest states out.

The live catalog currently holds zero operational conjunction events; every
entry point therefore carries explicit INSUFFICIENT_DATA / NO_BASELINE_EDGES
states instead of numbers, beneficiaries, or fabricated benefit values.
"""

import time
import tracemalloc
import uuid
from datetime import UTC, datetime
from typing import Any

from backend.benefit.errors import (
    BaselineMissingError,
    BenefitsNotReadyError,
    ScenarioInvalidError,
    ScenarioNotFoundError,
)
from backend.benefit.graph import (
    apply_idealized_removal,
    attribute_direct_beneficiaries,
    build_baseline_edges,
    default_horizon_bounds,
    result_hash,
    select_affected_objects,
)
from backend.benefit.models import (
    BENEFIT_MODEL_ID,
    BENEFIT_MODEL_VERSION,
    COUNTERFACTUAL_METHODS,
    IDEALIZED_REMOVAL,
    METHOD_IDEALIZED,
    METHOD_PHYSICAL,
    METRIC_CHANNELS,
    RISK_GRAPH_MODEL_ID,
    RISK_GRAPH_MODEL_VERSION,
    VALIDATION_STATE_OPERATIONAL,
    VALIDATION_STATE_SIMULATION,
    BaselineConfig,
    ScenarioConfig,
    build_baseline_config_hash,
    build_graph_hash,
    build_scenario_config_hash,
)
from backend.benefit.physical import (
    PHYSICAL_MODEL_VERSION,
    build_entries,
    run_physical_counterfactual,
)
from backend.benefit.repository import BenefitRepository, new_baseline_snapshot_id
from backend.config import settings
from backend.conjunction.models import ScreeningConfig
from backend.conjunction.repository import ConjunctionRepository, to_mean_elements

MAX_HORIZON_HOURS = 168.0


class BenefitService:
    """Build baseline risk graphs and run REMOVE counterfactual scenarios."""

    def __init__(self, repository: BenefitRepository | None = None) -> None:
        self.repository = repository or BenefitRepository()

    # ------------------------------------------------------------------ #
    # Baseline risk graph (G0)
    # ------------------------------------------------------------------ #

    async def build_baseline(
        self,
        *,
        horizon_hours: float | None = None,
        validation_state: str = VALIDATION_STATE_OPERATIONAL,
    ) -> dict[str, Any]:
        """Derive one immutable baseline graph snapshot from stored P4 results."""
        requested_hours = (
            settings.benefit_horizon_hours if horizon_hours is None else float(horizon_hours)
        )
        if not 0.01 <= requested_hours <= MAX_HORIZON_HOURS:
            raise ScenarioInvalidError(
                "Baseline horizon must lie between 0.01 and 168 hours",
                {"horizon_hours": requested_hours},
            )
        config = BaselineConfig(
            horizon_hours=requested_hours,
            shell_margin_km=settings.benefit_shell_margin_km,
            max_objects=settings.benefit_max_objects,
        )
        config_hash = build_baseline_config_hash(config)
        horizon_start, horizon_end = default_horizon_bounds(datetime.now(UTC), requested_hours)

        event_rows = await self.repository.load_operational_event_rows(
            horizon_start=horizon_start,
            horizon_end=horizon_end,
            max_objects=config.max_objects,
            validation_state=validation_state,
        )
        build = build_baseline_edges(event_rows, config)

        warnings: list[str] = []
        stale_cutoff = datetime.now(UTC).timestamp() - (
            settings.default_data_age_warning_hours * 3600.0
        )
        stale_snapshots = 0
        source_grades: set[str] = set()
        for row in event_rows:
            grade = row.get("source_grade")
            if grade:
                source_grades.add(str(grade))
            snapshot_at = row.get("snapshot_at")
            if isinstance(snapshot_at, datetime) and snapshot_at.timestamp() < stale_cutoff:
                stale_snapshots += 1
        if stale_snapshots:
            warnings.append(
                f"{stale_snapshots} latest snapshots exceed the configured data-age "
                "threshold; the baseline is built from STALE P4 input."
            )
        if build.skipped_events:
            warnings.append(
                f"{len(build.skipped_events)} events were skipped for structural reasons."
            )

        if build.edges:
            data_status = "OK"
            status_reason = None
        elif build.considered_events == 0:
            data_status = "INSUFFICIENT_DATA"
            status_reason = "NO_OPERATIONAL_CONJUNCTION_EVENTS_IN_HORIZON"
        else:
            data_status = "INSUFFICIENT_DATA"
            status_reason = "NO_COMPUTABLE_EDGES_FROM_STORED_SNAPSHOTS"

        from backend.benefit.models import build_graph_hash, build_input_hash

        snapshot_id = new_baseline_snapshot_id()
        provenance = {
            "model_id": RISK_GRAPH_MODEL_ID,
            "model_version": RISK_GRAPH_MODEL_VERSION,
            "metric_channels": list(METRIC_CHANNELS),
            "aggregation": "SUM_INCIDENT_EDGES_V1",
            "upstream": {
                "considered_events": build.considered_events,
                "skipped_events": build.skipped_events,
                "source_grades": sorted(source_grades),
            },
            "stale_snapshot_count": stale_snapshots,
            "validation_state": validation_state,
            "miss_distance_policy": (
                "MISS_DISTANCE stays a screening feature on each edge; it is never "
                "converted into a benefit number."
            ),
        }
        input_hash_value = build_input_hash(build.edge_seeds)

        await self.repository.insert_baseline_snapshot(
            snapshot_id=snapshot_id,
            horizon_start=horizon_start,
            horizon_end=horizon_end,
            event_count=build.event_count,
            edge_count=len(build.edges),
            object_count=build.object_count,
            model_id=RISK_GRAPH_MODEL_ID,
            model_version=RISK_GRAPH_MODEL_VERSION,
            config_payload=config.to_payload(),
            config_hash=config_hash,
            input_hash=input_hash_value,
            graph_hash=build_graph_hash(build.edges),
            data_status=data_status,
            status_reason=status_reason,
            validation_state=validation_state,
            provenance=provenance,
        )
        await self.repository.insert_risk_edges(snapshot_id, build.edges, validation_state)

        baseline_row = await self.repository.get_baseline_row(snapshot_id)
        assert baseline_row is not None
        return self._baseline_payload(
            baseline_row=baseline_row,
            warnings=warnings,
        )

    async def get_baseline(self, snapshot_id: str) -> dict[str, Any]:
        baseline = await self.repository.get_baseline_row(snapshot_id)
        if baseline is None:
            raise BaselineMissingError(
                "No baseline graph exists with the supplied identifier",
                {"baseline_snapshot_id": snapshot_id},
            )
        return self._baseline_payload(baseline, warnings=[])

    async def list_baselines(self, include_simulation: bool) -> dict[str, Any]:
        rows = await self.repository.list_baselines(
            include_simulation=include_simulation,
            limit=settings.benefit_baselines_page_limit,
        )
        return {
            "request_id": str(uuid.uuid4()),
            "generated_at": _now(),
            "data_status": "OK" if rows else "UNAVAILABLE",
            "status_reason": None if rows else "NO_BASELINE_GRAPH_BUILT",
            "data": {
                "count": len(rows),
                "baselines": [
                    {
                        "baseline_snapshot_id": row["id"],
                        "created_at": row["created_at"],
                        "data_status": row["data_status"],
                        "status_reason": row["status_reason"],
                        "edge_count": row["edge_count"],
                        "object_count": row["object_count"],
                        "event_count": row["event_count"],
                        "graph_hash": row["graph_hash"],
                        "config_hash": row["config_hash"],
                        "input_hash": row["input_hash"],
                        "validation_state": row["validation_state"],
                        "horizon": row["horizon"],
                    }
                    for row in rows
                ],
            },
        }

    # ------------------------------------------------------------------ #
    # REMOVE scenario lifecycle
    # ------------------------------------------------------------------ #

    async def create_remove_scenario(
        self,
        *,
        target_ref: str,
        baseline_snapshot_id: str | None,
        effective_time_raw: str | None,
        metric_types: list[str] | None,
        recompute_mode: str,
        counterfactual_method: str = METHOD_PHYSICAL,
    ) -> dict[str, Any]:
        """Create an immutable REMOVE scenario definition.

        ``counterfactual_method`` selects the derivation engine: the default
        SCREENING_RECOMPUTE_V1 physically re-runs P4 over the modified object
        set; IDEALIZED_REMOVAL is the legacy edge-deletion research simulation
        and its outputs stay SIMULATION_ONLY.
        """
        unknown = [m for m in (metric_types or []) if m not in METRIC_CHANNELS]
        if unknown:
            raise ScenarioInvalidError(
                "Unsupported benefit metric channel; channels are never merged",
                {"unsupported_metric_types": unknown, "supported": list(METRIC_CHANNELS)},
            )
        if recompute_mode not in ("FULL", "AFFECTED_SUBGRAPH"):
            raise ScenarioInvalidError(
                "recompute_mode must be FULL or AFFECTED_SUBGRAPH",
                {"recompute_mode": recompute_mode},
            )
        if counterfactual_method not in COUNTERFACTUAL_METHODS:
            raise ScenarioInvalidError(
                "counterfactual_method must be one of the registered engines",
                {
                    "counterfactual_method": counterfactual_method,
                    "supported": list(COUNTERFACTUAL_METHODS),
                },
            )

        target = await self.repository.resolve_object(target_ref)
        if target is None:
            from backend.ingestion.errors import UnknownObjectError

            raise UnknownObjectError(
                "No canonical object matches the requested removal target"
            )

        if baseline_snapshot_id is None:
            latest = await self.repository.latest_operational_baseline()
            if latest is None:
                raise BaselineMissingError(
                    "No operational baseline risk graph exists; build one from "
                    "stored conjunction results first",
                    {"hint": "POST /api/v1/baselines"},
                )
            baseline_snapshot_id = str(latest["id"])
        baseline = await self.repository.get_baseline_row(baseline_snapshot_id)
        if baseline is None:
            raise BaselineMissingError(
                "The referenced baseline graph does not exist",
                {"baseline_snapshot_id": baseline_snapshot_id},
            )
        if int(baseline.get("edge_count") or 0) == 0:
            raise BaselineMissingError(
                "The referenced baseline graph contains no edges; a REMOVE "
                "counterfactual cannot be computed",
                {
                    "baseline_snapshot_id": baseline_snapshot_id,
                    "status_reason": baseline.get("status_reason"),
                },
            )

        effective_time = None
        if effective_time_raw is not None:
            from backend.orbit.time_scale import require_utc_datetime

            effective_time = require_utc_datetime(effective_time_raw, "effective_time")

        metrics = tuple(metric_types) if metric_types else METRIC_CHANNELS
        thresholds = {
            metric: float(settings.benefit_thresholds.get(metric, 0.0)) for metric in metrics
        }
        scenario_config = ScenarioConfig(
            metric_types=metrics,
            thresholds=thresholds,
            recompute_mode=recompute_mode,
            counterfactual_method=counterfactual_method,
        )
        parameters = {
            **scenario_config.to_payload(),
            "target_catalog_id": target["catalog_id"],
            "target_object_id": target["object_id"],
            "baseline_graph_hash": baseline["graph_hash"],
        }
        if counterfactual_method == METHOD_PHYSICAL:
            assumptions = [
                METHOD_PHYSICAL,
                "No actual object is removed, commanded, or altered.",
                "Counterfactual graphs G0' and Gs are both derived by re-running "
                "the P4 pipeline (SGP4 -> coarse screening -> refined TCA) over "
                "the stored solution set, with the target excluded from Gs.",
                "Newly created conjunction edges are detected and reported, "
                "never structurally denied.",
                "Environment/fragmentation benefit is NOT_COMPUTED in P5.",
            ]
        else:
            assumptions = [
                IDEALIZED_REMOVAL,
                "No actual object is removed, commanded, or altered.",
                "Counterfactual deletes every baseline edge incident to the target.",
                "SIMULATION_ONLY: no physics is recomputed on this path.",
                "Environment/fragmentation benefit is NOT_COMPUTED in P5.",
            ]
        input_hash = _scenario_input_hash(parameters, baseline["input_hash"])

        scenario_id = await self.repository.create_scenario(
            kind="REMOVE",
            target_object_id=target["object_id"],
            baseline_snapshot_id=str(baseline["id"]),
            effective_time=effective_time,
            parameters=parameters,
            assumptions=assumptions,
            requested_metrics=list(metrics),
            model_version=BENEFIT_MODEL_VERSION,
            input_hash=input_hash,
        )
        stored = await self.repository.get_scenario(scenario_id)
        assert stored is not None
        return self._scenario_payload(stored)

    async def get_scenario_payload(self, scenario_id: str) -> dict[str, Any]:
        scenario = await self.repository.get_scenario(scenario_id)
        if scenario is None:
            raise ScenarioNotFoundError()
        return self._scenario_payload(scenario)

    async def run_scenario(
        self, scenario_id: str, recompute_mode: str | None = None
    ) -> dict[str, Any]:
        """Execute one immutable scenario run (synchronous, bounded)."""
        scenario = await self.repository.get_scenario(scenario_id)
        if scenario is None:
            raise ScenarioNotFoundError()
        if scenario["kind"] != "REMOVE":
            raise ScenarioInvalidError(
                "Only REMOVE scenarios are executable in P5",
                {"kind": scenario["kind"]},
            )
        mode = recompute_mode or str(
            (scenario.get("parameters") or {}).get("recompute_mode", "FULL")
        )
        if mode not in ("FULL", "AFFECTED_SUBGRAPH"):
            raise ScenarioInvalidError(
                "recompute_mode must be FULL or AFFECTED_SUBGRAPH",
                {"recompute_mode": mode},
            )

        method = str(
            (scenario.get("parameters") or {}).get(
                "counterfactual_method", METHOD_IDEALIZED
            )
        )
        if method not in COUNTERFACTUAL_METHODS:
            raise ScenarioInvalidError(
                "Scenario carries an unknown counterfactual_method",
                {"counterfactual_method": method},
            )

        metrics = tuple(scenario["requested_metrics"]) or METRIC_CHANNELS
        thresholds = {
            metric: float(settings.benefit_thresholds.get(metric, 0.0)) for metric in metrics
        }
        run_config = ScenarioConfig(
            metric_types=metrics,
            thresholds=thresholds,
            recompute_mode=mode,
            counterfactual_method=method,
        )
        config_hash = build_scenario_config_hash(run_config)
        run_validation_state = (
            VALIDATION_STATE_OPERATIONAL
            if method == METHOD_PHYSICAL
            else VALIDATION_STATE_SIMULATION
        )
        run_id = await self.repository.create_scenario_run(
            scenario_id=scenario_id,
            recompute_mode=mode,
            config_hash=config_hash,
            thresholds=thresholds,
            validation_state=run_validation_state,
        )

        if method == METHOD_PHYSICAL:
            return await self._run_physical_scenario(
                scenario=scenario,
                scenario_id=scenario_id,
                run_id=run_id,
                mode=mode,
                metrics=metrics,
                thresholds=thresholds,
                run_config=run_config,
            )

        started = time.perf_counter()
        tracemalloc.start()
        try:
            baseline = await self.repository.load_baseline_graph(
                str(scenario["baseline_snapshot_id"])
            )
            if baseline is None:
                raise BaselineMissingError(
                    "The scenario's baseline graph has disappeared",
                    {"baseline_snapshot_id": scenario["baseline_snapshot_id"]},
                )

            target_id = str(scenario["target_object_id"])
            envelopes = await self.repository.load_object_envelopes(settings.benefit_max_objects)
            target_envelope = envelopes.get(target_id)
            affected = select_affected_objects(
                baseline, target_id, envelopes, target_envelope, _baseline_cfg_from_graph(baseline)
            )

            counterfactual = apply_idealized_removal(
                baseline, target_id, f"{scenario_id}:{mode}", affected
            )
            attributions = attribute_direct_beneficiaries(
                baseline,
                counterfactual.scenario_graph,
                target_id,
                run_config,
                baseline_provenance=self._baseline_provenance_summary(scenario),
            )
            _, peak_bytes = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()

        compute_ms = int((time.perf_counter() - started) * 1000)
        payload_for_hash = {
            "scenario_id": scenario_id,
            "kind": scenario["kind"],
            "target_object_id": target_id,
            "baseline_snapshot_id": scenario["baseline_snapshot_id"],
            # recompute_mode deliberately excluded: the hash binds scientific
            # content so FULL and AFFECTED_SUBGRAPH must produce equal hashes.
            "metric_types": list(metrics),
            "thresholds": {key: thresholds[key] for key in sorted(thresholds)},
            "effective_time": scenario.get("effective_time"),
        }
        hash_value = result_hash(payload_for_hash, attributions, counterfactual.scenario_graph)

        warnings: list[dict[str, Any]] = [
            {
                "code": "IDEALIZED_REMOVAL_SIMULATION",
                "message": (
                    "This is a counterfactual simulation. No actual object was removed "
                    "and no command was issued."
                ),
            }
        ]
        if not baseline.edges:
            data_status = "INSUFFICIENT_DATA"
            status_reason = "BASELINE_HAS_NO_EDGES"
            final_status = "SUCCEEDED"
        elif counterfactual.removed_edge_count == 0:
            data_status = "INSUFFICIENT_DATA"
            status_reason = "NO_BASELINE_EDGES_FOR_TARGET"
            final_status = "SUCCEEDED"
            warnings.append(
                {
                    "code": "NO_BASELINE_EDGES_FOR_TARGET",
                    "message": (
                        "The target has no incident baseline edges; no beneficiary is "
                        "attributed and no number is invented."
                    ),
                }
            )
        else:
            data_status = "OK"
            status_reason = None
            final_status = "SUCCEEDED"

        await self.repository.finalize_scenario_run(
            run_id,
            status=final_status,
            data_status=data_status,
            status_reason=status_reason,
            affected_object_count=len(affected.object_ids),
            affected_edge_count=counterfactual.removed_edge_count + counterfactual.affected_incident_edge_count,
            reused_baseline_edge_count=counterfactual.reused_edge_count,
            baseline_edge_count=len(baseline.edges),
            scenario_edge_count=len(counterfactual.scenario_graph.edges),
            compute_ms=compute_ms,
            peak_memory_bytes=int(peak_bytes),
            input_hash=str(scenario["input_hash"]),
            model_id=BENEFIT_MODEL_ID,
            result_hash_value=hash_value,
            warnings=warnings,
            error=None,
        )
        await self.repository.insert_benefit_results(run_id, attributions)

        stored_run = await self.repository.latest_succeeded_run(scenario_id)
        assert stored_run is not None
        return await self._run_payload(scenario, stored_run, affected=affected)

    async def _run_physical_scenario(
        self,
        *,
        scenario: dict[str, Any],
        scenario_id: str,
        run_id: str,
        mode: str,
        metrics: tuple[str, ...],
        thresholds: dict[str, float],
        run_config: ScenarioConfig,
    ) -> dict[str, Any]:
        """SCREENING_RECOMPUTE_V1: derive G0' and Gs by re-running P4 physics."""
        target_id = str(scenario["target_object_id"])
        started = time.perf_counter()
        tracemalloc.start()

        async def _finalize_insufficient(reason: str, message: str) -> dict[str, Any]:
            _, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            await self.repository.finalize_scenario_run(
                run_id,
                status="SUCCEEDED",
                data_status="INSUFFICIENT_DATA",
                status_reason=reason,
                affected_object_count=0,
                affected_edge_count=0,
                reused_baseline_edge_count=0,
                baseline_edge_count=0,
                scenario_edge_count=0,
                compute_ms=int((time.perf_counter() - started) * 1000),
                peak_memory_bytes=int(peak),
                input_hash=str(scenario["input_hash"]),
                model_id=BENEFIT_MODEL_ID,
                result_hash_value=None,
                warnings=[
                    _physical_disclaimer(),
                    {"code": reason, "message": message},
                ],
                error=None,
            )
            stored_run = await self.repository.latest_succeeded_run(scenario_id)
            assert stored_run is not None
            return await self._run_payload(scenario, stored_run, affected=None)

        try:
            stored_baseline = await self.repository.load_baseline_graph(
                str(scenario["baseline_snapshot_id"])
            )
            if stored_baseline is None:
                raise BaselineMissingError(
                    "The scenario's baseline graph has disappeared",
                    {"baseline_snapshot_id": scenario["baseline_snapshot_id"]},
                )

            solutions = await ConjunctionRepository().load_screenable_solutions(
                settings.screening_max_objects
            )
            entries, skipped_inputs = build_entries(solutions, to_mean_elements)
            if all(entry.object_id != target_id for entry in entries):
                return await _finalize_insufficient(
                    "TARGET_NOT_PROPAGABLE",
                    "The removal target has no propagable stored solution; the "
                    "physical counterfactual refuses to invent one.",
                )
            if len(entries) < 2:
                return await _finalize_insufficient(
                    "NO_PROPAGABLE_SOLUTIONS",
                    "Fewer than two propagable solutions exist; no pair physics "
                    "can be recomputed.",
                )

            horizon_start = _parse_utc(scenario["horizon_start"])
            horizon_end = _parse_utc(scenario["horizon_end"])
            window_hours = max(
                (horizon_end - horizon_start).total_seconds() / 3600.0, 0.01
            )
            screening_config = ScreeningConfig(
                window_hours=window_hours,
                coarse_step_seconds=settings.screening_coarse_step_seconds,
                screening_threshold_m=settings.screening_threshold_m,
                shell_margin_km=settings.screening_shell_margin_km,
                max_objects=settings.screening_max_objects,
                hbr_m=settings.screening_hbr_m,
                refine_step_seconds=settings.screening_refine_step_seconds,
            )

            envelopes = await self.repository.load_object_envelopes(
                settings.benefit_max_objects
            )
            affected = select_affected_objects(
                stored_baseline,
                target_id,
                envelopes,
                envelopes.get(target_id),
                _baseline_cfg_from_graph(stored_baseline),
            )

            baseline_prime_id = new_baseline_snapshot_id()
            scenario_graph_id = new_baseline_snapshot_id()
            counterfactual = run_physical_counterfactual(
                entries=entries,
                target_object_id=target_id,
                affected_object_ids=affected.object_ids,
                window_start=horizon_start,
                window_stop=horizon_end,
                screening_config=screening_config,
                graph_config=_baseline_cfg_from_graph(stored_baseline),
                recompute_mode=mode,
                baseline_snapshot_label=baseline_prime_id,
                scenario_snapshot_label=scenario_graph_id,
                ut1_utc_offset_seconds=settings.ut1_utc_offset_seconds,
            )

            attributions = attribute_direct_beneficiaries(
                counterfactual.baseline_prime,
                counterfactual.scenario_graph,
                target_id,
                run_config,
                baseline_provenance={
                    **self._baseline_provenance_summary(scenario),
                    "counterfactual_method": METHOD_PHYSICAL,
                    "recompute_input_hash": counterfactual.input_hash,
                },
            )
            _, peak_bytes = tracemalloc.get_traced_memory()
        finally:
            if tracemalloc.is_tracing():
                tracemalloc.stop()

        compute_ms = int((time.perf_counter() - started) * 1000)

        for role, graph, run_stats in (
            ("SCENARIO_BASELINE_PRIME", counterfactual.baseline_prime, counterfactual.baseline_run),
            ("SCENARIO_COUNTERFACTUAL", counterfactual.scenario_graph, counterfactual.scenario_run),
        ):
            await self.repository.insert_baseline_snapshot(
                snapshot_id=graph.snapshot_id,
                horizon_start=graph.horizon_start,
                horizon_end=graph.horizon_end,
                event_count=len(run_stats.event_rows),
                edge_count=len(graph.edges),
                object_count=len(graph.objects()),
                model_id=RISK_GRAPH_MODEL_ID,
                model_version=PHYSICAL_MODEL_VERSION,
                config_payload=_baseline_cfg_from_graph(stored_baseline).to_payload(),
                config_hash=build_scenario_config_hash(run_config),
                input_hash=counterfactual.input_hash,
                graph_hash=graph.graph_hash,
                data_status="OK" if graph.edges else "INSUFFICIENT_DATA",
                status_reason=None if graph.edges else "NO_RECOMPUTED_EDGES",
                validation_state=VALIDATION_STATE_OPERATIONAL,
                provenance={
                    "role": role,
                    "scenario_id": scenario_id,
                    "scenario_run_id": run_id,
                    "counterfactual_method": METHOD_PHYSICAL,
                    "recompute_mode": mode,
                    "pipeline": {
                        "pairs_before_screening": run_stats.pairs_before_screening,
                        "pairs_after_coarse": run_stats.pairs_after_coarse,
                        "tca_refinements": run_stats.tca_refinements,
                        "objects_propagated": run_stats.objects_propagated,
                        "compute_ms": run_stats.compute_ms,
                    },
                    "stored_baseline_snapshot_id": str(scenario["baseline_snapshot_id"]),
                },
            )
            await self.repository.insert_risk_edges(
                graph.snapshot_id, list(graph.edges), VALIDATION_STATE_OPERATIONAL
            )

        warnings: list[dict[str, Any]] = [
            _physical_disclaimer(),
            {
                "code": "PHYSICAL_RECOMPUTE_ACCOUNTING",
                "baseline_prime_graph_id": baseline_prime_id,
                "scenario_graph_id": scenario_graph_id,
                "removed_edges": len(counterfactual.removed_edge_keys),
                "new_edges": len(counterfactual.new_edge_keys),
                "changed_edges": len(counterfactual.changed_edge_keys),
                "reused_edges": counterfactual.reused_edge_count,
                "recomputed_edges": counterfactual.recomputed_edge_count,
                "baseline_tca_refinements": counterfactual.baseline_run.tca_refinements,
                "scenario_tca_refinements": counterfactual.scenario_run.tca_refinements,
                "recompute_input_hash": counterfactual.input_hash,
                "skipped_inputs": len(skipped_inputs),
            },
        ]
        anomaly = bool(counterfactual.new_edge_keys)
        if anomaly:
            warnings.append(
                {
                    "code": "ANOMALOUS_NEW_EDGES_FOR_REMOVE",
                    "message": (
                        "The recomputed scenario graph contains edges absent from "
                        "G0'; under independent propagation a REMOVE must not "
                        "create edges. Results are PARTIAL for investigation."
                    ),
                    "edges": [list(key) for key in counterfactual.new_edge_keys],
                }
            )
        if stored_baseline.graph_hash != counterfactual.baseline_prime.graph_hash:
            warnings.append(
                {
                    "code": "INPUT_DRIFT_FROM_STORED_BASELINE",
                    "message": (
                        "G0' recomputed from current solutions differs from the "
                        "stored baseline graph; benefits are attributed against "
                        "G0' and both graphs are persisted for comparison."
                    ),
                    "stored_graph_hash": stored_baseline.graph_hash,
                    "recomputed_graph_hash": counterfactual.baseline_prime.graph_hash,
                }
            )
        if counterfactual.failures:
            warnings.append(
                {
                    "code": "PROPAGATION_FAILURES_PRESENT",
                    "failures": counterfactual.failures,
                }
            )

        if not counterfactual.baseline_prime.edges:
            data_status = "INSUFFICIENT_DATA"
            status_reason = "NO_RECOMPUTED_BASELINE_EDGES"
        elif not counterfactual.removed_edge_keys:
            data_status = "INSUFFICIENT_DATA"
            status_reason = "NO_BASELINE_EDGES_FOR_TARGET"
        elif anomaly or counterfactual.failures:
            data_status = "PARTIAL"
            status_reason = (
                "ANOMALOUS_NEW_EDGES_FOR_REMOVE"
                if anomaly
                else "COMPLETED_WITH_PROPAGATION_FAILURES"
            )
        else:
            data_status = "OK"
            status_reason = None
        final_status = "PARTIAL" if data_status == "PARTIAL" else "SUCCEEDED"

        payload_for_hash = {
            "scenario_id": scenario_id,
            "kind": scenario["kind"],
            "target_object_id": target_id,
            "baseline_snapshot_id": scenario["baseline_snapshot_id"],
            "counterfactual_method": METHOD_PHYSICAL,
            # recompute_mode deliberately excluded: FULL and AFFECTED_SUBGRAPH
            # are independent computation paths that must agree numerically.
            "metric_types": list(metrics),
            "thresholds": {key: thresholds[key] for key in sorted(thresholds)},
            "effective_time": scenario.get("effective_time"),
        }
        hash_value = result_hash(
            payload_for_hash, attributions, counterfactual.scenario_graph
        )

        await self.repository.finalize_scenario_run(
            run_id,
            status=final_status,
            data_status=data_status,
            status_reason=status_reason,
            affected_object_count=len(affected.object_ids),
            affected_edge_count=(
                len(counterfactual.removed_edge_keys)
                + counterfactual.recomputed_edge_count
            ),
            reused_baseline_edge_count=counterfactual.reused_edge_count,
            baseline_edge_count=len(counterfactual.baseline_prime.edges),
            scenario_edge_count=len(counterfactual.scenario_graph.edges),
            compute_ms=compute_ms,
            peak_memory_bytes=int(peak_bytes),
            input_hash=counterfactual.input_hash,
            model_id=BENEFIT_MODEL_ID,
            result_hash_value=hash_value,
            warnings=warnings,
            error=None,
        )
        await self.repository.insert_benefit_results(
            run_id, attributions, validation_state=VALIDATION_STATE_OPERATIONAL
        )

        stored_run = await self.repository.latest_succeeded_run(scenario_id)
        assert stored_run is not None
        return await self._run_payload(scenario, stored_run, affected=affected)

    async def scenario_benefits(self, scenario_id: str) -> dict[str, Any]:
        """Serve persisted beneficiaries for the latest completed run."""
        scenario = await self.repository.get_scenario(scenario_id)
        if scenario is None:
            raise ScenarioNotFoundError()
        run = await self.repository.latest_succeeded_run(scenario_id)
        if run is None:
            pending = await self.repository.latest_run_any(scenario_id)
            if pending is not None:
                raise BenefitsNotReadyError(
                    f"Latest run {str(pending['id'])[:8]} is {pending['status']}; "
                    "benefits require SUCCEEDED",
                )
            raise BenefitsNotReadyError("Scenario has never been executed")
        return await self._benefits_payload(scenario, run)

    # ------------------------------------------------------------------ #
    # Payload shaping
    # ------------------------------------------------------------------ #

    def _baseline_provenance_summary(self, scenario: dict[str, Any]) -> dict[str, Any]:
        baseline_prov = scenario.get("baseline_provenance") or {}
        return {
            "baseline_snapshot_id": scenario["baseline_snapshot_id"],
            "baseline_graph_hash": scenario.get("baseline_graph_hash"),
            "baseline_data_status": scenario.get("baseline_data_status"),
            "baseline_validation_state": scenario.get("baseline_validation_state"),
            "upstream_model": baseline_prov.get("model_id"),
            "upstream_model_version": baseline_prov.get("model_version"),
            "p4_source_grades": baseline_prov.get("upstream", {}).get("source_grades", []),
            "screening_horizon": horizon_label_from_parts(
                scenario.get("horizon_start"), scenario.get("horizon_end")
            ),
        }

    def _baseline_payload(
        self, baseline_row: dict[str, Any], *, warnings: list[str]
    ) -> dict[str, Any]:
        provenance = baseline_row.get("provenance") or {}
        return {
            "request_id": str(uuid.uuid4()),
            "generated_at": _now(),
            "data_status": baseline_row["data_status"],
            "status_reason": baseline_row["status_reason"],
            "data": {
                "baseline_snapshot_id": baseline_row["id"],
                "horizon": horizon_label_from_parts(
                    baseline_row["horizon_start"], baseline_row["horizon_end"]
                ),
                "event_count": baseline_row["event_count"],
                "edge_count": baseline_row["edge_count"],
                "object_count": baseline_row["object_count"],
                "graph_hash": baseline_row["graph_hash"],
                "edges_available": int(baseline_row["edge_count"] or 0) > 0,
            },
            "provenance": {
                "model_id": baseline_row["model_id"],
                "model_version": baseline_row["model_version"],
                "config_hash": baseline_row["config_hash"],
                "input_hash": baseline_row["input_hash"],
                "graph_hash": baseline_row["graph_hash"],
                "validation_state": baseline_row["validation_state"],
                "upstream": provenance.get("upstream", {}),
                "stale_snapshot_count": provenance.get("stale_snapshot_count", 0),
            },
            "warnings": warnings,
        }

    def _scenario_payload(self, scenario: dict[str, Any]) -> dict[str, Any]:
        parameters = scenario.get("parameters") or {}
        return {
            "request_id": str(uuid.uuid4()),
            "generated_at": _now(),
            "data": {
                "scenario_id": str(scenario["id"]),
                "kind": scenario["kind"],
                "status": scenario["status"],
                "target": {
                    "object_id": str(scenario["target_object_id"]),
                    "catalog_id": scenario.get("target_catalog_id"),
                    "canonical_name": scenario.get("target_name"),
                },
                "baseline_snapshot_id": scenario["baseline_snapshot_id"],
                "baseline_validation_state": scenario.get("baseline_validation_state"),
                "effective_time": scenario.get("effective_time"),
                "parameters": parameters,
                "requested_metrics": scenario.get("requested_metrics", []),
                "assumptions": scenario.get("assumptions", []),
                "model_version": scenario["model_version"],
                "input_hash": scenario["input_hash"],
            },
            "warnings": [
                {
                    "code": "IDEALIZED_REMOVAL_SIMULATION",
                    "message": "No actual object is removed; research simulation only.",
                }
            ],
        }

    async def _run_payload(
        self,
        scenario: dict[str, Any],
        run: dict[str, Any],
        affected: Any = None,
    ) -> dict[str, Any]:
        thresholds = run.get("thresholds_json") or {}
        beneficiaries = await self.repository.load_run_beneficiaries(
            str(run["id"]), thresholds
        )
        data_status = run.get("data_status") or "UNAVAILABLE"
        affected_disclosure: list[dict[str, Any]] = []
        if affected is not None:
            affected_disclosure = [
                {
                    "object_id": object_id,
                    "reasons": affected.reason_for(object_id),
                }
                for object_id in sorted(affected.object_ids)
            ]
        return {
            "request_id": str(uuid.uuid4()),
            "generated_at": _now(),
            "data_status": data_status,
            "status_reason": run.get("status_reason"),
            "data": {
                "scenario_id": str(run["scenario_id"]),
                "run_id": str(run["id"]),
                "run_status": run["status"],
                "kind": scenario["kind"],
                "target": {
                    "object_id": str(scenario["target_object_id"]),
                    "catalog_id": scenario.get("target_catalog_id"),
                    "canonical_name": scenario.get("target_name"),
                },
                "baseline_snapshot_id": scenario["baseline_snapshot_id"],
                "recompute_mode": run.get("recompute_mode"),
                "assumptions": scenario.get("assumptions", []),
                "beneficiary_count": len(beneficiaries),
                "beneficiaries": beneficiaries,
                "edge_accounting": {
                    "baseline_edge_count": run.get("baseline_edge_count"),
                    "scenario_edge_count": run.get("scenario_edge_count"),
                    "affected_edge_count": run.get("affected_edge_count"),
                    "reused_baseline_edge_count": run.get("reused_baseline_edge_count"),
                    "affected_object_count": run.get("affected_object_count"),
                },
                "affected_objects": affected_disclosure,
                "performance": {
                    "compute_ms": run.get("compute_ms"),
                    "peak_memory_bytes": run.get("peak_memory_bytes"),
                },
            },
            "provenance": {
                "model_id": run.get("model_id"),
                "model_version": scenario["model_version"],
                "config_hash": run.get("config_hash"),
                "input_hash": run.get("input_hash"),
                "result_hash": run.get("result_hash"),
                "thresholds": thresholds,
                "baseline_graph_hash": scenario.get("baseline_graph_hash"),
                "baseline_validation_state": scenario.get("baseline_validation_state"),
            },
            "warnings": run.get("warnings_json", []),
        }

    async def _benefits_payload(
        self, scenario: dict[str, Any], run: dict[str, Any]
    ) -> dict[str, Any]:
        thresholds = run.get("thresholds_json") or {}
        beneficiaries = await self.repository.load_run_beneficiaries(
            str(run["id"]), thresholds
        )
        return {
            "request_id": str(uuid.uuid4()),
            "generated_at": _now(),
            "data_status": run.get("data_status") or "OK",
            "status_reason": run.get("status_reason"),
            "data": {
                "scenario_id": str(run["scenario_id"]),
                "run_id": str(run["id"]),
                "run_status": run["status"],
                "kind": scenario["kind"],
                "target": {
                    "object_id": str(scenario["target_object_id"]),
                    "catalog_id": scenario.get("target_catalog_id"),
                    "canonical_name": scenario.get("target_name"),
                },
                "assumptions": scenario.get("assumptions", []),
                "beneficiary_count": len(beneficiaries),
                "beneficiaries": beneficiaries,
            },
            "provenance": {
                "model_id": run.get("model_id"),
                "model_version": scenario["model_version"],
                "config_hash": run.get("config_hash"),
                "input_hash": run.get("input_hash"),
                "result_hash": run.get("result_hash"),
                "thresholds": thresholds,
                "baseline_snapshot_id": scenario["baseline_snapshot_id"],
                "baseline_graph_hash": scenario.get("baseline_graph_hash"),
                "baseline_validation_state": scenario.get("baseline_validation_state"),
            },
            "warnings": [
                {
                    "code": "IDEALIZED_REMOVAL_SIMULATION",
                    "message": "Benefit values are counterfactual simulations, not outcomes.",
                }
            ],
        }


def _physical_disclaimer() -> dict[str, Any]:
    return {
        "code": "PHYSICAL_COUNTERFACTUAL_SIMULATION",
        "message": (
            "Counterfactual graphs are physically recomputed (SCREENING_RECOMPUTE_V1), "
            "but this remains an advisory simulation: no actual object was removed "
            "and no command was issued."
        ),
    }


def _parse_utc(value: Any) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(str(value))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def _baseline_cfg_from_graph(graph: Any) -> BaselineConfig:
    hours = max((graph.horizon_end - graph.horizon_start).total_seconds() / 3600.0, 0.01)
    return BaselineConfig(horizon_hours=hours)


def horizon_label_from_parts(start: Any, end: Any) -> str:
    return f"{start}/{end}"


def _scenario_input_hash(parameters: dict[str, Any], baseline_input_hash: Any) -> str:
    import hashlib
    import json

    serialized = json.dumps(
        {"parameters": parameters, "baseline_input_hash": baseline_input_hash},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _now() -> str:
    return datetime.now(UTC).isoformat()
