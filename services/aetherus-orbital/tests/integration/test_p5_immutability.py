"""P5 immutability probes: append-only triggers reject UPDATE/DELETE."""

import pytest
from sqlalchemy import text

from backend.database import get_db_session
from backend.tools.generate_evidence import check_p5_persistence_immutability
from tests.integration.p5_sim_seed import seed_simulation_baseline, simulation_edge


async def _two_real_object_ids(benefit_repository):
    resolved = []
    for catalog_id in ("25544", "48274"):
        row = await benefit_repository.resolve_object(catalog_id)
        if row is not None:
            resolved.append(str(row["object_id"]))
    if len(resolved) < 2:
        pytest.skip("need two stored canonical objects")
    return resolved[0], resolved[1]


class TestImmutability:
    async def test_evidence_gate_requires_append_only_trigger_error(self):
        """Duplicate keys cannot be accepted as proof that an UPDATE hit the trigger."""
        # The old evidence helper used this stable ID. Ensure it exists so the
        # pre-fix helper takes the false-positive duplicate-key path.
        async with get_db_session() as session:
            await session.execute(
                text(
                    """
                    INSERT INTO baseline_graph_snapshot (
                        id, horizon_start, horizon_end,
                        model_id, model_version, config_json, config_hash,
                        input_hash, graph_hash, data_status,
                        validation_state, provenance_json
                    )
                    VALUES (
                        'bg-evidence-probe', now(), now(),
                        'probe', 'probe', '{}'::jsonb, 'probe', 'probe',
                        'probe', 'INSUFFICIENT_DATA', 'SIMULATION_ONLY',
                        '{}'::jsonb
                    )
                    ON CONFLICT (id) DO NOTHING
                    """
                )
            )

        evidence = await check_p5_persistence_immutability()

        assert "append-only" in evidence["append_only_error_excerpt"].lower()
        assert "duplicate key" not in evidence["append_only_error_excerpt"].lower()

    async def test_risk_edge_mutation_blocked(self, benefit_repository):
        target_id, neighbor_id = await _two_real_object_ids(benefit_repository)
        baseline_id = await seed_simulation_baseline(
            benefit_repository,
            baseline_id="bg-test-immutable-edge",
            edges=[
                simulation_edge(target_id, neighbor_id, "CONJUNCTION_EXPOSURE", 9.0, "imm")
            ],
            dataset="immutable",
        )
        # Each mutation probe runs in its own short-lived session so the
        # expected trigger failure rolls back with it.
        async with get_db_session() as update_session:
            edge_id = (
                await update_session.execute(
                    text(
                        "SELECT id::text FROM risk_edge"
                        " WHERE baseline_snapshot_id = :b LIMIT 1"
                    ),
                    {"b": baseline_id},
                )
            ).scalar_one()
            with pytest.raises(Exception) as update_error:
                await update_session.execute(
                    text(
                        "UPDATE risk_edge SET metric_value = 42"
                        " WHERE id = CAST(:i AS uuid)"
                    ),
                    {"i": edge_id},
                )
        async with get_db_session() as delete_session:
            edge_id = (
                await delete_session.execute(
                    text(
                        "SELECT id::text FROM risk_edge"
                        " WHERE baseline_snapshot_id = :b LIMIT 1"
                    ),
                    {"b": baseline_id},
                )
            ).scalar_one()
            with pytest.raises(Exception) as delete_error:
                await delete_session.execute(
                    text("DELETE FROM risk_edge WHERE id = CAST(:i AS uuid)"),
                    {"i": edge_id},
                )
        assert "append-only" in str(update_error.value)
        assert "append-only" in str(delete_error.value)

    async def test_benefit_result_mutation_blocked(self, benefit_repository, benefit_service):
        target_id, neighbor_id = await _two_real_object_ids(benefit_repository)
        baseline_id = await seed_simulation_baseline(
            benefit_repository,
            baseline_id="bg-test-immutable-benefit",
            edges=[simulation_edge(target_id, neighbor_id, "PC", 2e-5, "immb")],
            dataset="immutable-benefit",
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
            input_hash="sim-input-immb",
        )
        await benefit_service.run_scenario(scenario_id)
        run_row = await benefit_repository.latest_succeeded_run(scenario_id)
        assert run_row is not None

        async with get_db_session() as session:
            benefit_id = (
                await session.execute(
                    text(
                        "SELECT id::text FROM benefit_result"
                        " WHERE scenario_run_id = CAST(:r AS uuid) LIMIT 1"
                    ),
                    {"r": str(run_row["id"])},
                )
            ).scalar_one_or_none()
            if benefit_id is None:
                pytest.skip("scenario produced no beneficiary rows")
            with pytest.raises(Exception) as update_error:
                await session.execute(
                    text(
                        "UPDATE benefit_result SET benefit_value = 999"
                        " WHERE id = CAST(:i AS uuid)"
                    ),
                    {"i": benefit_id},
                )
        assert "append-only" in str(update_error.value)

    async def test_finalized_run_mutation_blocked(self, benefit_repository, benefit_service):
        target_id, neighbor_id = await _two_real_object_ids(benefit_repository)
        baseline_id = await seed_simulation_baseline(
            benefit_repository,
            baseline_id="bg-test-immutable-run",
            edges=[simulation_edge(target_id, neighbor_id, "PC", 3e-5, "immr")],
            dataset="immutable-run",
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
            input_hash="sim-input-immr",
        )
        payload = await benefit_service.run_scenario(scenario_id)
        run_id = payload["data"]["run_id"]

        async with get_db_session() as session:
            with pytest.raises(Exception) as rewrite_error:
                await session.execute(
                    text(
                        "UPDATE scenario_run SET result_hash = 'tampered'"
                        " WHERE id = CAST(:i AS uuid)"
                    ),
                    {"i": run_id},
                )
        assert "immutable after finalization" in str(rewrite_error.value)

    async def test_baseline_snapshot_mutation_blocked(self, benefit_repository):
        # Edgeless probe baseline: the append-only trigger must fire before any
        # FK interference is possible. A single stable probe row keeps reruns
        # from accumulating residue.
        probe_id = "bg-evidence-probe"
        if await benefit_repository.get_baseline_row(probe_id) is None:
            from datetime import UTC, datetime, timedelta

            start = datetime.now(UTC)
            await benefit_repository.insert_baseline_snapshot(
                snapshot_id=probe_id,
                horizon_start=start,
                horizon_end=start + timedelta(hours=1),
                event_count=0,
                edge_count=0,
                object_count=0,
                model_id="probe",
                model_version="probe",
                config_payload={},
                config_hash="probe",
                input_hash="probe",
                graph_hash="probe",
                data_status="INSUFFICIENT_DATA",
                status_reason=None,
                validation_state="SIMULATION_ONLY",
                provenance={"validation_only": True},
            )
        async with get_db_session() as update_session:
            with pytest.raises(Exception) as update_error:
                await update_session.execute(
                    text(
                        "UPDATE baseline_graph_snapshot SET edge_count = 77"
                        " WHERE id = :b"
                    ),
                    {"b": probe_id},
                )
        async with get_db_session() as delete_session:
            with pytest.raises(Exception) as delete_error:
                await delete_session.execute(
                    text("DELETE FROM baseline_graph_snapshot WHERE id = :b"),
                    {"b": probe_id},
                )
        assert "append-only" in str(update_error.value)
        assert "append-only" in str(delete_error.value)
