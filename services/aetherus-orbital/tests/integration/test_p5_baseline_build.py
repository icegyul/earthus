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

        async def row_of(snapshot_id: str):
            async with get_db_session() as session:
                return (
                    await session.execute(
                        text(
                            "SELECT graph_hash, edge_count FROM baseline_graph_snapshot"
                            " WHERE id = :id"
                        ),
                        {"id": snapshot_id},
                    )
                ).mappings().one_or_none()

        # The first build may itself reuse a baseline an earlier run left behind,
        # so the count is measured after it rather than assumed to grow.
        first = await benefit_service.build_baseline(horizon_hours=24.0)
        first_id = first["data"]["baseline_snapshot_id"]
        first_row = await row_of(first_id)
        before = await operational_count()

        # Rebuilding the same inputs reuses the stored graph rather than writing
        # a duplicate. That is not a hole in append-only: append-only forbids
        # rewriting a stored row, and skipping a write rewrites nothing. The
        # earlier version of this test asserted "two builds, two rows", which
        # conflated "never overwrite" with "always write" and made the fix for
        # four million duplicate risk_edge rows look like a regression.
        repeat = await benefit_service.build_baseline(horizon_hours=24.0)
        after_repeat = await operational_count()
        if repeat["data"].get("reused_existing_baseline"):
            # Reuse serves the row that is already there and writes nothing.
            assert repeat["data"]["baseline_snapshot_id"] == first_id
            assert after_repeat == before
        else:
            assert after_repeat == before + 1

        # The stored row is untouched by the rebuild, whichever way it went.
        assert await row_of(first_id) == first_row

        # A genuinely different question appends its own row, and the first one
        # is still addressable beside it.
        second = await benefit_service.build_baseline(horizon_hours=2.0)
        second_id = second["data"]["baseline_snapshot_id"]
        if second_id != first_id:
            async with get_db_session() as session:
                kept = (
                    await session.execute(
                        text(
                            "SELECT id FROM baseline_graph_snapshot"
                            " WHERE id IN (:a, :b)"
                            " AND validation_state = 'PUBLIC_SCREENING'"
                        ),
                        {"a": first_id, "b": second_id},
                    )
                ).fetchall()
            assert len(kept) == 2
        assert await row_of(first_id) == first_row

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
