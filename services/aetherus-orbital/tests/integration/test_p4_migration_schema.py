"""Migration 005 schema verification for P4 conjunction assessment."""

import pytest
from sqlalchemy import text

REQUIRED_TABLES = {"screening_run"}
REQUIRED_COLUMNS = {
    "conjunction_event": {"screening_run_id"},
    "conjunction_snapshot": {
        "screening_run_id",
        "pc_status",
        "pc_unavailable_reason",
        "covariance_status",
        "tca_boundary_flag",
        "validation_state",
        "provenance_json",
    },
}


class TestP4Schema:
    async def test_screening_run_table_exists(self, db_session):
        result = await db_session.execute(
            text(
                """
                SELECT table_name FROM information_schema.tables
                WHERE table_schema='public' AND table_name IN ('screening_run', 'conjunction_event', 'conjunction_snapshot')
                """
            )
        )
        tables = {row[0] for row in result.fetchall()}
        assert REQUIRED_TABLES.issubset(tables)

    async def test_p4_columns_present(self, db_session):
        result = await db_session.execute(
            text(
                """
                SELECT table_name, column_name FROM information_schema.columns
                WHERE table_schema='public'
                  AND table_name IN ('conjunction_event', 'conjunction_snapshot')
                """
            )
        )
        columns: dict[str, set[str]] = {}
        for table_name, column_name in result.fetchall():
            columns.setdefault(table_name, set()).add(column_name)
        for table, required in REQUIRED_COLUMNS.items():
            assert required.issubset(columns.get(table, set())), table

    async def test_self_pair_check_enforced(self, db_session):
        result = await db_session.execute(
            text(
                """
                SELECT conname FROM pg_constraint
                WHERE conrelid = 'conjunction_event'::regclass
                  AND conname = 'conjunction_event_no_self_pair'
                """
            )
        )
        assert result.first() is not None

    async def test_snapshot_append_only_trigger_blocks_update(self, db_session):
        del db_session
        from backend.database import get_db_session

        async with get_db_session() as probe:
            found = (
                await probe.execute(
                    text(
                        """
                        SELECT 1 FROM pg_trigger
                        WHERE tgrelid='conjunction_snapshot'::regclass
                          AND tgname='conjunction_snapshot_append_only'
                          AND NOT tgisinternal
                        """
                    )
                )
            ).first()
        assert found is not None

        # Each mutation probe runs in its own short-lived session so the
        # expected trigger failure rolls back with it.
        async def _insert_probe_snapshot():
            async with get_db_session() as insert_session:
                object_ids = (
                    await insert_session.execute(
                        text("SELECT id::text FROM space_object ORDER BY id LIMIT 2")
                    )
                ).fetchall()
                if len(object_ids) < 2:
                    pytest.skip("need two stored objects for the append-only probe")
                event_id = (
                    await insert_session.execute(
                        text(
                            """
                            INSERT INTO conjunction_event (
                                primary_object_id, secondary_object_id,
                                source_event_id, tca, status
                            )
                            VALUES (
                                CAST(:a AS uuid), CAST(:b AS uuid),
                                'append-only-probe-' || gen_random_uuid()::text,
                                now(), 'RETIRED'
                            )
                            RETURNING id::text
                            """
                        ),
                        {"a": object_ids[0][0], "b": object_ids[1][0]},
                    )
                ).scalar_one()
                snapshot_id = (
                    await insert_session.execute(
                        text(
                            """
                            INSERT INTO conjunction_snapshot (
                                event_id, snapshot_at, source_grade, provenance_json
                            )
                            VALUES (
                                CAST(:event_id AS uuid), now(), 'PROBE', '{}'::jsonb
                            )
                            RETURNING id::text
                            """
                        ),
                        {"event_id": event_id},
                    )
                ).scalar_one()
            return snapshot_id

        snapshot_id = await _insert_probe_snapshot()
        async with get_db_session() as update_session:
            with pytest.raises(Exception) as update_error:
                await update_session.execute(
                    text(
                        "UPDATE conjunction_snapshot SET miss_distance_m = 1"
                        " WHERE id = CAST(:sid AS uuid)"
                    ),
                    {"sid": snapshot_id},
                )

        snapshot_id = await _insert_probe_snapshot()
        async with get_db_session() as delete_session:
            with pytest.raises(Exception) as delete_error:
                await delete_session.execute(
                    text("DELETE FROM conjunction_snapshot WHERE id = CAST(:sid AS uuid)"),
                    {"sid": snapshot_id},
                )

        assert "append-only" in str(update_error.value)
        assert "append-only" in str(delete_error.value)
        assert "append-only" in str(update_error.value)
        assert "append-only" in str(delete_error.value)

    async def test_model_registry_seeded(self, db_session):
        result = await db_session.execute(
            text(
                """
                SELECT id, version FROM model_registry
                WHERE id IN ('aetherus-ca-screening', 'foster-1992-pc')
                ORDER BY id
                """
            )
        )
        rows = {(row[0], row[1]) for row in result.fetchall()}
        assert ("aetherus-ca-screening", "p4-conservative-v1") in rows
        assert ("foster-1992-pc", "p4-encounter-plane-v1") in rows
        assert ("foster-1992-pc", "p4-encounter-plane-v2") in rows

        states = await db_session.execute(
            text(
                """
                SELECT version, validation_state
                FROM model_registry
                WHERE id = 'foster-1992-pc'
                ORDER BY version
                """
            )
        )
        pc_states = {row[0]: row[1] for row in states.fetchall()}
        assert pc_states["p4-encounter-plane-v1"] == "INVALIDATED"
        assert pc_states["p4-encounter-plane-v2"] == "VALIDATED"
