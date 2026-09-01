"""P5 service-level integration tests over the real database.

All synthetic graphs are SIMULATION_ONLY; operational paths ignore them.
"""

import pytest

from backend.benefit.errors import (
    BaselineMissingError,
    BenefitsNotReadyError,
    ScenarioInvalidError,
    ScenarioNotFoundError,
)
from tests.integration.p5_sim_seed import seed_simulation_baseline, simulation_edge
from tests.integration.p5_real_seed import ensure_iss_object


async def _three_real_objects(benefit_repository):
    resolved = []
    for catalog_id in ("25544", "48274", "20580", "25994", "27424"):
        row = await benefit_repository.resolve_object(catalog_id)
        if row is not None:
            resolved.append((catalog_id, str(row["object_id"])))
    if len(resolved) < 3:
        pytest.skip("need three stored canonical objects for P5 service tests")
    return resolved


async def _seed_and_create_scenario(
    benefit_repository,
    *,
    baseline_id,
    edges,
    target_ref_index,
    metrics,
    dataset,
):
    resolved = await _three_real_objects(benefit_repository)
    target_catalog, target_id = resolved[target_ref_index]
    if edges is None:
        # Default single edge between the first two real objects.
        edges = [
            simulation_edge(resolved[0][1], resolved[1][1], "CONJUNCTION_EXPOSURE", 1.0, dataset)
        ]
    baseline = await seed_simulation_baseline(
        benefit_repository, baseline_id=baseline_id, edges=edges, dataset=dataset
    )
    scenario_id = await benefit_repository.create_scenario(
        kind="REMOVE",
        target_object_id=target_id,
        baseline_snapshot_id=baseline,
        effective_time=None,
        parameters={"dataset": dataset},
        assumptions=["IDEALIZED_REMOVAL"],
        requested_metrics=list(metrics),
        model_version="p5-idealized-removal-v1",
        input_hash=f"sim-input-{dataset}",
    )
    return resolved, target_catalog, target_id, scenario_id


class TestBenefitServiceRemove:
    async def test_ben001_direct_benefit_and_provenance(
        self, benefit_repository, benefit_service
    ):
        resolved = await _three_real_objects(benefit_repository)
        target_id = resolved[0][1]
        neighbor_id = resolved[1][1]
        bystander_id = resolved[2][1]

        edges = [
            simulation_edge(target_id, neighbor_id, "CONJUNCTION_EXPOSURE", 2.0, "ben001"),
            simulation_edge(neighbor_id, bystander_id, "CONJUNCTION_EXPOSURE", 3.0, "ben001"),
            simulation_edge(target_id, neighbor_id, "PC", 4.2e-5, "ben001"),
        ]
        baseline_id = await seed_simulation_baseline(
            benefit_repository,
            baseline_id="bg-test-ben001-service",
            edges=edges,
            dataset="synthetic-remove-direct-v1",
        )

        scenario_id = await benefit_repository.create_scenario(
            kind="REMOVE",
            target_object_id=target_id,
            baseline_snapshot_id=baseline_id,
            effective_time=None,
            parameters={"dataset": "ben001"},
            assumptions=["IDEALIZED_REMOVAL"],
            requested_metrics=["CONJUNCTION_EXPOSURE", "PC"],
            model_version="p5-idealized-removal-v1",
            input_hash="sim-input-ben001",
        )
        run_payload = await benefit_service.run_scenario(scenario_id)

        assert run_payload["data"]["run_status"] == "SUCCEEDED"
        assert run_payload["data_status"] == "OK"
        beneficiaries = run_payload["data"]["beneficiaries"]
        by_metric = {row["metric_type"]: row for row in beneficiaries}

        exposure = by_metric["CONJUNCTION_EXPOSURE"]
        assert str(exposure["beneficiary_object_id"]) == neighbor_id
        assert exposure["benefit_class"] == "DIRECT"
        # R_neighbor(G0) sums both incident exposure edges; removing the target
        # leaves only the neighbor-bystander edge in Gs.
        assert float(exposure["baseline_value"]) == 5.0
        assert float(exposure["scenario_value"]) == 3.0
        assert float(exposure["benefit_value"]) == 2.0

        pc = by_metric["PC"]
        assert abs(float(pc["baseline_value"]) - 4.2e-5) < 1e-15

        assert all(str(row["beneficiary_object_id"]) != target_id for row in beneficiaries)
        assert all(str(row["beneficiary_object_id"]) != bystander_id for row in beneficiaries)
        assert all(row["provenance"] for row in beneficiaries)
        assert any(
            assumption == "IDEALIZED_REMOVAL"
            for assumption in run_payload["data"]["assumptions"]
        )
        assert run_payload["provenance"]["result_hash"]

        benefits_payload = await benefit_service.scenario_benefits(scenario_id)
        assert benefits_payload["data"]["run_status"] == "SUCCEEDED"
        assert benefits_payload["data"]["beneficiary_count"] == len(beneficiaries)

    async def test_repeat_run_same_result_hash(self, benefit_repository, benefit_service):
        _, _, _, scenario_id = await _seed_and_create_scenario(
            benefit_repository,
            baseline_id="bg-test-repeat",
            edges=None,
            target_ref_index=0,
            metrics=["CONJUNCTION_EXPOSURE"],
            dataset="repeat",
        )
        first = await benefit_service.run_scenario(scenario_id)
        second = await benefit_service.run_scenario(scenario_id)
        assert first["provenance"]["result_hash"] == second["provenance"]["result_hash"]

    async def test_no_target_edges_explicit_state(self, benefit_repository, benefit_service):
        resolved = await _three_real_objects(benefit_repository)
        target_id = resolved[0][1]
        other_a, other_b = resolved[1][1], resolved[2][1]
        baseline_id = await seed_simulation_baseline(
            benefit_repository,
            baseline_id="bg-test-noedges",
            edges=[simulation_edge(other_a, other_b, "CONJUNCTION_EXPOSURE", 1.0, "noedges")],
            dataset="noedges",
        )
        scenario_id = await benefit_repository.create_scenario(
            kind="REMOVE",
            target_object_id=target_id,
            baseline_snapshot_id=baseline_id,
            effective_time=None,
            parameters={},
            assumptions=["IDEALIZED_REMOVAL"],
            requested_metrics=["CONJUNCTION_EXPOSURE"],
            model_version="p5-idealized-removal-v1",
            input_hash="sim-input-noedges",
        )
        payload = await benefit_service.run_scenario(scenario_id)
        assert payload["data_status"] == "INSUFFICIENT_DATA"
        assert payload["status_reason"] == "NO_BASELINE_EDGES_FOR_TARGET"
        assert payload["data"]["beneficiary_count"] == 0
        assert payload["data"]["beneficiaries"] == []

    async def test_missing_baseline_rejected(self, benefit_service, tmp_path):
        await ensure_iss_object(tmp_path / "missing-baseline-service-raw")
        with pytest.raises(BaselineMissingError):
            await benefit_service.create_remove_scenario(
                target_ref="25544",
                baseline_snapshot_id="bg-does-not-exist",
                effective_time_raw=None,
                metric_types=None,
                recompute_mode="FULL",
            )

    async def test_unknown_target_is_404_state(self, benefit_service):
        from backend.ingestion.errors import UnknownObjectError

        with pytest.raises(UnknownObjectError):
            await benefit_service.create_remove_scenario(
                target_ref="no-such-catalog-object",
                baseline_snapshot_id="bg-whatever",
                effective_time_raw=None,
                metric_types=None,
                recompute_mode="FULL",
            )

    async def test_invalid_metric_channel_rejected(self, benefit_repository, benefit_service):
        resolved = await _three_real_objects(benefit_repository)
        target_id = resolved[0][1]
        baseline_id = await seed_simulation_baseline(
            benefit_repository,
            baseline_id="bg-test-invalid-metric",
            edges=[
                simulation_edge(target_id, resolved[1][1], "CONJUNCTION_EXPOSURE", 1.0, "im")
            ],
            dataset="invalid-metric",
        )
        with pytest.raises(ScenarioInvalidError) as error:
            await benefit_service.create_remove_scenario(
                target_ref=resolved[0][0],
                baseline_snapshot_id=baseline_id,
                effective_time_raw=None,
                metric_types=["RISK_SCORE"],
                recompute_mode="FULL",
            )
        assert error.value.details["unsupported_metric_types"] == ["RISK_SCORE"]

    async def test_invalid_horizon_rejected(self, benefit_service):
        with pytest.raises(ScenarioInvalidError):
            await benefit_service.build_baseline(horizon_hours=999.0)

    async def test_unknown_scenario_not_found(self, benefit_service):
        with pytest.raises(ScenarioNotFoundError):
            await benefit_service.get_scenario_payload(
                "00000000-0000-0000-0000-000000000000"
            )

    async def test_simulation_rows_never_reach_operational_baseline(
        self, benefit_repository
    ):
        await seed_simulation_baseline(
            benefit_repository,
            baseline_id="bg-test-simulation-isolation",
            edges=[],
            dataset="simulation-isolation",
        )
        latest = await benefit_repository.latest_operational_baseline()
        rows = await benefit_repository.list_baselines(include_simulation=True, limit=50)
        simulations = [
            row for row in rows if row["validation_state"] == "SIMULATION_ONLY"
        ]
        assert simulations, "seeded SIMULATION_ONLY baselines must be listed explicitly"
        if latest is not None:
            assert latest["validation_state"] == "PUBLIC_SCREENING"

    async def test_benefits_409_before_any_run(self, benefit_repository, benefit_service):
        resolved = await _three_real_objects(benefit_repository)
        target_id, neighbor_id = resolved[0][1], resolved[1][1]
        baseline_id = await seed_simulation_baseline(
            benefit_repository,
            baseline_id="bg-test-notready",
            edges=[simulation_edge(target_id, neighbor_id, "PC", 1e-5, "notready")],
            dataset="notready",
        )
        scenario_id = await benefit_repository.create_scenario(
            kind="REMOVE",
            target_object_id=target_id,
            baseline_snapshot_id=baseline_id,
            effective_time=None,
            parameters={},
            assumptions=["IDEALIZED_REMOVAL"],
            requested_metrics=["PC"],
            model_version="p5-idealized-removal-v1",
            input_hash="sim-input-notready",
        )
        with pytest.raises(BenefitsNotReadyError):
            await benefit_service.scenario_benefits(scenario_id)
