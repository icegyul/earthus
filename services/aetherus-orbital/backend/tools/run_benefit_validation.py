"""BEN-001 / BEN-003 validation runner over a SIMULATION_ONLY corpus.

Everything this tool writes is explicitly labeled SIMULATION_ONLY:
- baseline_graph_snapshot.validation_state = 'SIMULATION_ONLY'
- risk_edge.validation_state = 'SIMULATION_ONLY'
- provenance payloads carry the dataset id and seed.

Operational paths (latest_operational_baseline, GET /v1/baselines default)
exclude these rows, so fixture numbers can never surface as live benefits,
removal recommendations, or real risk reductions. Edge endpoint objects are
REAL canonical catalog identities; only the counterfactual metric values come
from the deterministic synthetic dataset.
"""

import argparse
import asyncio
import json
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from backend.benefit.models import (
    BENEFIT_MODEL_ID,
    BENEFIT_MODEL_VERSION,
    RISK_GRAPH_MODEL_ID,
    RISK_GRAPH_MODEL_VERSION,
    VALIDATION_STATE_SIMULATION,
    BaselineConfig,
    EdgeFeature,
    RiskEdge,
    build_graph_hash,
    deterministic_horizon,
)
from backend.benefit.repository import BenefitRepository
from backend.config import settings

DATASET_DIRECT = "synthetic-remove-direct-v1"
DATASET_EQUIVALENCE = "synthetic-remove-equivalence-v1"
SEED_NOTE = "deterministic fixture values; engine outputs are always computed"

TOLERANCE_ABS = settings.benefit_equivalence_tolerance_abs


def _fixture_edges(
    pairs: list[tuple[str, str]],
    exposure_by_pair: dict[tuple[str, str], float],
    pc_by_pair: dict[tuple[str, str], float] | None,
    horizon_start: Any,
    horizon_end: Any,
) -> list[RiskEdge]:
    """Deterministic synthetic edges; values are corpus inputs, not results."""
    edges: list[RiskEdge] = []
    for object_a, object_b in pairs:
        key = (object_a, object_b) if object_a <= object_b else (object_b, object_a)
        feature = EdgeFeature(
            tca=None,
            miss_distance_m=4995.087,
            relative_speed_mps=5.589,
            boundary_flag=False,
            source_grade="SIMULATION_ONLY",
            covariance_status="PRESENT_VALID",
        )
        common = {
            "dataset": DATASET_EQUIVALENCE,
            "seed_note": SEED_NOTE,
            "horizon_start": horizon_start.isoformat(),
            "horizon_end": horizon_end.isoformat(),
        }
        exposure = float(exposure_by_pair.get(key, 0.0))
        if exposure > 0.0:
            edges.append(
                RiskEdge(
                    object_a=key[0],
                    object_b=key[1],
                    metric_type="CONJUNCTION_EXPOSURE",
                    metric_value=exposure,
                    features=feature,
                    provenance={
                        **common,
                        "method": "EVENT_COUNT_V1",
                        "unit": "event_count",
                    },
                )
            )
        if pc_by_pair and key in pc_by_pair:
            edges.append(
                RiskEdge(
                    object_a=key[0],
                    object_b=key[1],
                    metric_type="PC",
                    metric_value=float(pc_by_pair[key]),
                    features=feature,
                    provenance={
                        **common,
                        "method": "SUM_SNAPSHOT_PC_V1",
                        "covariance_gated": True,
                    },
                )
            )
    return edges


async def run_validation(output_dir: Path) -> dict[str, Any]:
    repository = BenefitRepository()
    generated_at = datetime.now(UTC)

    # --- resolve real canonical endpoints for the synthetic graph ----------
    candidates = [
        "25544",
        "48274",
        "20580",
        "25994",
        "27424",
        "33591",
        "39084",
    ]
    resolved: dict[str, str] = {}
    for catalog_id in candidates:
        row = await repository.resolve_object(catalog_id)
        if row is not None:
            resolved[catalog_id] = str(row["object_id"])
        if len(resolved) >= len(candidates):
            break
    if len(resolved) < 7:
        return {
            "passed": False,
            "reason": "Fewer than seven real canonical objects are stored; "
            "the validation corpus requires distinct identity endpoints.",
            "resolved": sorted(resolved),
        }

    by_catalog = resolved
    horizon_hours = 24.0
    # Deterministic horizon windows keep repeated validation runs idempotent.
    horizon_start, horizon_end = deterministic_horizon(DATASET_DIRECT)
    config = BaselineConfig(horizon_hours=horizon_hours)

    # ===================== BEN-001: direct REMOVE benefit ==================
    target_catalog = "25544"
    neighbor_catalog = "48274"
    bystander_catalog = "20580"
    target_id = by_catalog[target_catalog]
    neighbor_id = by_catalog[neighbor_catalog]
    bystander_id = by_catalog[bystander_catalog]
    ben001_pairs = [
        (target_id, neighbor_id),
        (neighbor_id, bystander_id),  # edge NOT incident to the target
    ]
    ben001_exposure = {
        (min(a, b), max(a, b)): value
        for (a, b), value in {(ben001_pairs[0]): 2.0, (ben001_pairs[1]): 3.0}.items()
    }
    ben001_pc = {(min(target_id, neighbor_id), max(target_id, neighbor_id)): 6.5e-4}

    direct_edges = _fixture_edges(
        ben001_pairs, ben001_exposure, ben001_pc, horizon_start, horizon_end
    )
    direct_baseline_id = f"bg-sim-{DATASET_DIRECT}"
    await _persist_simulation_graph(
        repository,
        baseline_id=direct_baseline_id,
        edges=direct_edges,
        config=config,
        horizon_start=horizon_start,
        horizon_end=horizon_end,
        dataset=DATASET_DIRECT,
        generated_at=generated_at,
    )

    scenario_direct = await repository.create_scenario(
        kind="REMOVE",
        target_object_id=target_id,
        baseline_snapshot_id=direct_baseline_id,
        effective_time=horizon_end,
        parameters={
            "dataset": DATASET_DIRECT,
            "metric_types": ["CONJUNCTION_EXPOSURE", "PC"],
        },
        assumptions=["IDEALIZED_REMOVAL"],
        requested_metrics=["CONJUNCTION_EXPOSURE", "PC"],
        model_version=BENEFIT_MODEL_VERSION,
        input_hash=f"sha256:synthetic-{DATASET_DIRECT}",
    )

    from backend.benefit.service import BenefitService

    service = BenefitService(repository)
    run_payload = await service.run_scenario(scenario_direct, recompute_mode="FULL")
    benefits_payload = await service.scenario_benefits(scenario_direct)

    beneficiaries = run_payload["data"]["beneficiaries"]
    by_metric = {row["metric_type"]: row for row in beneficiaries}
    exposure_row = by_metric.get("CONJUNCTION_EXPOSURE")
    pc_row = by_metric.get("PC")

    expected_exposure_benefit = 2.0  # target-incident share removed entirely
    neighbor_identified = False
    exposure_benefit_exact = False
    pc_value_computed = False
    if exposure_row is not None:
        neighbor_identified = str(exposure_row["beneficiary_object_id"]) == neighbor_id
        # R_neighbor(G0) = 2 + 3 (both incident exposure edges); Gs keeps the
        # neighbor-bystander edge only.
        exposure_benefit_exact = (
            abs(float(exposure_row["benefit_value"]) - expected_exposure_benefit)
            <= TOLERANCE_ABS
            and abs(float(exposure_row["baseline_value"]) - 5.0) <= TOLERANCE_ABS
            and abs(float(exposure_row["scenario_value"]) - 3.0) <= TOLERANCE_ABS
        )
    pc_expected = (min(target_id, neighbor_id), max(target_id, neighbor_id)) in ben001_pc
    if pc_row is not None and pc_expected:
        pc_value_computed = abs(float(pc_row["baseline_value"]) - 6.5e-4) <= 1e-15 and abs(
            float(pc_row["benefit_value"]) - 6.5e-4
        ) <= 1e-15

    checks_direct = {
        "neighbor_identified": neighbor_identified,
        "exposure_benefit_exact": exposure_benefit_exact,
        "pc_channel_separate": (pc_row is not None) == pc_expected,
        "pc_value_computed": pc_value_computed,
        "target_self_benefit_excluded": all(
            str(row["beneficiary_object_id"]) != target_id for row in beneficiaries
        ),
        "non_neighbor_unchanged": all(
            str(row["beneficiary_object_id"]) != bystander_id for row in beneficiaries
        ),
        "provenance_attached": all(
            isinstance(row.get("provenance"), dict) and row["provenance"]
            for row in beneficiaries
        )
        and len(beneficiaries) > 0,
        "idealized_removal_assumption": any(
            assumption == "IDEALIZED_REMOVAL"
            for assumption in run_payload["data"]["assumptions"]
        ),
        "run_persisted": bool(run_payload["data"]["run_id"]),
        "result_hash_present": bool(run_payload["provenance"]["result_hash"]),
    }

    # Repeat determinism (BEN-F03): same inputs -> same hash.
    repeat_payload = await service.run_scenario(scenario_direct, recompute_mode="FULL")
    checks_direct["repeat_same_hash"] = (
        repeat_payload["provenance"]["result_hash"]
        == run_payload["provenance"]["result_hash"]
    )

    ben001_report = {
        "gate": "BEN-001",
        "dataset_id": DATASET_DIRECT,
        "validation_only": True,
        "validation_state": VALIDATION_STATE_SIMULATION,
        "target_catalog_ids_used": sorted(resolved.keys()),
        "scenario_id": scenario_direct,
        "checks": checks_direct,
        "observed_beneficiaries": [
            {
                "beneficiary_catalog_id": _catalog_for(
                    resolved, str(row["beneficiary_object_id"])
                ),
                "metric_type": row["metric_type"],
                "baseline_value": row["baseline_value"],
                "scenario_value": row["scenario_value"],
                "benefit_value": row["benefit_value"],
                "benefit_class": row["benefit_class"],
            }
            for row in beneficiaries
        ],
        "benefits_query_status_code_shape": benefits_payload["data"]["run_status"],
        "passed": all(checks_direct.values()),
    }

    # ================== BEN-003: full vs selective equivalence =============
    # Corpus mirrors the integration test: far-band pairs are deliberately
    # disjoint from the target's neighborhood so selective recompute has
    # genuinely unaffected baseline edges to reuse.
    equivalence_target = by_catalog["25544"]
    band = {catalog: by_catalog[catalog] for catalog in resolved}
    pairs_spec = [
        (band["25544"], band["48274"], 1.0, 2.0e-4),
        (band["25544"], band["20580"], 1.0, 0.0),
        (band["48274"], band["20580"], 1.0, 3.0e-4),
        (band["20580"], band["25994"], 2.0, 0.0),
        (band["25994"], band["27424"], 1.0, 1.0e-4),
        (band["27424"], band["33591"], 2.0, 0.0),
        (band["33591"], band["39084"], 1.0, 4.0e-4),
        (band["25994"], band["39084"], 1.0, 0.0),
    ]
    equivalence_edges_input = [(first, second) for first, second, _, _ in pairs_spec]
    exposure_map = {
        (min(first, second), max(first, second)): exposure
        for first, second, exposure, _ in pairs_spec
    }
    pc_map = {
        (min(first, second), max(first, second)): pc
        for first, second, _, pc in pairs_spec
        if pc > 0.0
    }

    equivalence_edges = _fixture_edges(
        equivalence_edges_input, exposure_map, pc_map, horizon_start, horizon_end
    )
    equivalence_baseline_id = "bg-sim-synthetic-remove-equivalence-v1"
    await _persist_simulation_graph(
        repository,
        baseline_id=equivalence_baseline_id,
        edges=equivalence_edges,
        config=config,
        horizon_start=horizon_start,
        horizon_end=horizon_end,
        dataset=DATASET_EQUIVALENCE,
        generated_at=generated_at,
    )

    equivalence_scenario_target = equivalence_target
    scenario_equivalence = await repository.create_scenario(
        kind="REMOVE",
        target_object_id=equivalence_scenario_target,
        baseline_snapshot_id=equivalence_baseline_id,
        effective_time=horizon_end,
        parameters={"dataset": DATASET_EQUIVALENCE},
        assumptions=["IDEALIZED_REMOVAL"],
        requested_metrics=["CONJUNCTION_EXPOSURE", "PC", "MAX_PC"],
        model_version=BENEFIT_MODEL_VERSION,
        input_hash=f"sha256:synthetic-{DATASET_EQUIVALENCE}",
    )

    full_started = time.perf_counter()
    full_run = await service.run_scenario(scenario_equivalence, recompute_mode="FULL")
    full_ms_wall = (time.perf_counter() - full_started) * 1000.0

    fast_started = time.perf_counter()
    fast_run = await service.run_scenario(scenario_equivalence, recompute_mode="AFFECTED_SUBGRAPH")
    fast_ms_wall = (time.perf_counter() - fast_started) * 1000.0

    def beneficiary_signature(payload: dict[str, Any]) -> list[tuple[str, str, float, float, float]]:
        return sorted(
            (
                str(row["beneficiary_object_id"]),
                str(row["metric_type"]),
                round(float(row["baseline_value"]), 15),
                round(float(row["scenario_value"]), 15),
                round(float(row["benefit_value"]), 15),
            )
            for row in payload["data"]["beneficiaries"]
        )

    full_sig = beneficiary_signature(full_run)
    fast_sig = beneficiary_signature(fast_run)
    max_delta = 0.0
    for full_row, fast_row in zip(full_sig, fast_sig, strict=False):
        for full_value, fast_value in zip(full_row[2:], fast_row[2:], strict=False):
            max_delta = max(max_delta, abs(full_value - fast_value))

    checks_equivalence = {
        "beneficiary_set_identical": [row[:2] for row in full_sig]
        == [row[:2] for row in fast_sig],
        "metrics_within_tolerance": max_delta <= TOLERANCE_ABS,
        "result_hash_equal": full_run["provenance"]["result_hash"]
        == fast_run["provenance"]["result_hash"],
        "selective_reuses_baseline_edges": int(
            fast_run["data"]["edge_accounting"]["reused_baseline_edge_count"] or 0
        )
        > 0,
        "both_runs_succeeded": full_run["data"]["run_status"] == "SUCCEEDED"
        and fast_run["data"]["run_status"] == "SUCCEEDED",
    }
    ben003_report = {
        "gate": "BEN-003",
        "dataset_id": DATASET_EQUIVALENCE,
        "validation_only": True,
        "validation_state": VALIDATION_STATE_SIMULATION,
        "objects_in_graph": len({endpoint for pair in equivalence_edges_input for endpoint in pair}),
        "baseline_edge_count": full_run["data"]["edge_accounting"]["baseline_edge_count"],
        "removed_target_edge_count": int(
            full_run["data"]["edge_accounting"]["baseline_edge_count"] or 0
        )
        - int(full_run["data"]["edge_accounting"]["scenario_edge_count"] or 0),
        "tolerance_abs": TOLERANCE_ABS,
        "max_abs_metric_delta": max_delta,
        "performance": {
            "full_compute_ms_recorded": full_run["data"]["performance"]["compute_ms"],
            "affected_compute_ms_recorded": fast_run["data"]["performance"]["compute_ms"],
            "full_wall_ms_measured": round(full_ms_wall, 3),
            "affected_wall_ms_measured": round(fast_ms_wall, 3),
            "full_peak_memory_bytes": full_run["data"]["performance"]["peak_memory_bytes"],
            "affected_peak_memory_bytes": fast_run["data"]["performance"][
                "peak_memory_bytes"
            ],
            "note": (
                "Performance figures measure graph assembly cost under IDEALIZED_REMOVAL; "
                "they never substitute for the physics-equivalence requirement above."
            ),
        },
        "accuracy_vs_performance_separation": {
            "equivalence_required": True,
            "equivalence_passed": checks_equivalence["beneficiary_set_identical"]
            and checks_equivalence["metrics_within_tolerance"]
            and checks_equivalence["result_hash_equal"],
        },
        "checks": checks_equivalence,
        "passed": all(checks_equivalence.values()),
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    direct_path = output_dir / "validation-ben001.json"
    equivalence_path = output_dir / "equivalence-ben003.json"
    direct_path.write_text(json.dumps(ben001_report, indent=2, default=str) + "\n")
    equivalence_path.write_text(json.dumps(ben003_report, indent=2, default=str) + "\n")

    return {
        "passed": ben001_report["passed"] and ben003_report["passed"],
        "ben001": ben001_report,
        "ben003": ben003_report,
        "artifacts": [str(direct_path), str(equivalence_path)],
    }


async def _persist_simulation_graph(
    repository: BenefitRepository,
    *,
    baseline_id: str,
    edges: list[RiskEdge],
    config: BaselineConfig,
    horizon_start: datetime,
    horizon_end: datetime,
    dataset: str,
    generated_at: datetime,
) -> None:
    existing = await repository.get_baseline_row(baseline_id)
    if existing is None:
        endpoints: set[str] = set()
        for edge in edges:
            endpoints.update((edge.object_a, edge.object_b))
        provenance = {
            "model_id": RISK_GRAPH_MODEL_ID,
            "model_version": RISK_GRAPH_MODEL_VERSION,
            "dataset": dataset,
            "validation_only": True,
            "seed_note": SEED_NOTE,
            "benefit_model_id": BENEFIT_MODEL_ID,
            "benefit_model_version": BENEFIT_MODEL_VERSION,
            "created_at": generated_at.isoformat(),
        }
        await repository.insert_baseline_snapshot(
            snapshot_id=baseline_id,
            horizon_start=horizon_start,
            horizon_end=horizon_end,
            event_count=len(edges),
            edge_count=len(edges),
            object_count=len(endpoints),
            model_id=RISK_GRAPH_MODEL_ID,
            model_version=RISK_GRAPH_MODEL_VERSION,
            config_payload=config.to_payload(),
            config_hash=f"sim-{dataset}",
            input_hash=f"sim-input-{dataset}",
            graph_hash=build_graph_hash(edges),
            data_status="OK",
            status_reason=None,
            validation_state=VALIDATION_STATE_SIMULATION,
            provenance=provenance,
        )
    await repository.insert_risk_edges(baseline_id, edges, VALIDATION_STATE_SIMULATION)
    stored_count = await repository.count_baseline_edges(baseline_id)
    if stored_count < len(edges):
        raise RuntimeError(
            f"seed {baseline_id}: expected >= {len(edges)} edges, found {stored_count}"
        )


def _catalog_for(resolved: dict[str, str], object_id: str) -> str:
    for catalog_id, candidate in resolved.items():
        if candidate == object_id:
            return catalog_id
    return "UNKNOWN"


def main() -> None:
    parser = argparse.ArgumentParser(description="Run P5 benefit validation corpus")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("artifacts/evidence/p5"),
    )
    args = parser.parse_args()
    report = asyncio.run(run_validation(args.output_dir))
    print(json.dumps({"passed": report["passed"], "artifacts": report["artifacts"]}, indent=2))
    raise SystemExit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()
