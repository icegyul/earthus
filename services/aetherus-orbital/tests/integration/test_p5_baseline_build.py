"""P5 baseline-build gates: explicit live states and append-only versioning."""

import pytest

from tests.integration.p5_sim_seed import seed_simulation_baseline, simulation_edge


class TestBaselineBuild:
    async def test_live_baseline_build_reports_explicit_state(self, benefit_service):
        payload = await benefit_service.build_baseline(horizon_hours=24.0)
        assert payload["data_status"] in {"OK", "INSUFFICIENT_DATA"}
        if payload["data_status"] == "INSUFFICIENT_DATA":
            assert payload["status_reason"] in {
                "NO_OPERATIONAL_CONJUNCTION_EVENTS_IN_HORIZON",
                "NO_COMPUTABLE_EDGES_FROM_STORED_SNAPSHOTS",
            }
            assert payload["data"]["edge_count"] == 0
            assert payload["data"]["edges_available"] is False

    async def test_baseline_versioning_appends_never_overwrites(
        self, benefit_repository, benefit_service
    ):
        from sqlalchemy import text

        from backend.database import get_db_session

        async def operational_count() -> int:
            async with get_db_session() as session:
                return int(
                    (
                        await session.execute(
                            text(
                                "SELECT count(*) FROM baseline_graph_snapshot"
                                " WHERE validation_state = 'PUBLIC_SCREENING'"
                            )
                        )
                    ).scalar_one()
                )

        before = await operational_count()
        first = await benefit_service.build_baseline(horizon_hours=24.0)
        first_id = first["data"]["baseline_snapshot_id"]
        second = await benefit_service.build_baseline(horizon_hours=24.0)
        second_id = second["data"]["baseline_snapshot_id"]
        after = await operational_count()
        assert after == before + 2
        # Both snapshots remain individually addressable: append-only versions.
        async with get_db_session() as session:
            kept = (
                await session.execute(
                    text(
                        "SELECT id FROM baseline_graph_snapshot"
                        " WHERE id IN (:a, :b) AND validation_state = 'PUBLIC_SCREENING'"
                    ),
                    {"a": first_id, "b": second_id},
                )
            ).fetchall()
        assert len(kept) == 2

    async def test_stale_and_probe_inputs_never_enter_graph(self, benefit_repository):
        from datetime import UTC, datetime

        rows = await benefit_repository.load_operational_event_rows(
            horizon_start=datetime(1970, 1, 1, tzinfo=UTC),
            horizon_end=datetime(9999, 12, 31, tzinfo=UTC),
            max_objects=100,
        )
        for row in rows:
            grade = str(row.get("source_grade") or "").upper()
            assert grade not in {"PROBE", "EVIDENCE_PROBE", "SIMULATION_ONLY"}

    async def test_simulation_baseline_round_trips_through_repository(
        self, benefit_repository
    ):
        resolved = []
        for catalog_id in ("25544", "48274"):
            row = await benefit_repository.resolve_object(catalog_id)
            if row is not None:
                resolved.append(str(row["object_id"]))
        if len(resolved) < 2:
            pytest.skip("need two stored canonical objects")
        target_id, neighbor_id = resolved[0], resolved[1]
        edges = [
            simulation_edge(target_id, neighbor_id, "CONJUNCTION_EXPOSURE", 3.0, "roundtrip"),
            simulation_edge(target_id, neighbor_id, "PC", 1.5e-4, "roundtrip"),
        ]
        baseline_id = await seed_simulation_baseline(
            benefit_repository,
            baseline_id="bg-test-roundtrip",
            edges=edges,
            dataset="roundtrip",
        )
        graph = await benefit_repository.load_baseline_graph(baseline_id)
        assert graph is not None
        assert len(graph.edges) == 2
        assert graph.object_risk(target_id, "CONJUNCTION_EXPOSURE") == 3.0
        assert abs(graph.object_risk(target_id, "PC") - 1.5e-4) < 1e-18
        row = await benefit_repository.get_baseline_row(baseline_id)
        assert row["validation_state"] == "SIMULATION_ONLY"
        assert int(row["edge_count"]) == 2
