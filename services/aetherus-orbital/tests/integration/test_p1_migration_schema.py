"""P1 migration behavior against the real PostGIS test database."""

from pathlib import Path

import pytest
from sqlalchemy import text

from backend.migrations.migrate import MigrationRunner

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_migration_003_adds_durable_provenance_identity_and_policy_schema(db_session) -> None:
    """P1 must persist reuse, rejections, conflicts, source policy, and a nine-digit catalog bound."""
    runner = MigrationRunner(migrations_dir=Path("migrations"))
    await runner.run()

    table_rows = await db_session.execute(
        text(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN (
                'ingestion_run_artifact', 'ingestion_record_rejection', 'identity_conflict'
              )
            """
        )
    )
    assert {row[0] for row in table_rows} == {
        "identity_conflict",
        "ingestion_record_rejection",
        "ingestion_run_artifact",
    }

    column_rows = await db_session.execute(
        text(
            """
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND (
                (table_name = 'ingestion_run' AND column_name = 'metadata_json')
                OR (table_name = 'raw_artifact' AND column_name = 'provenance_json')
              )
            """
        )
    )
    assert set(column_rows.fetchall()) == {
        ("ingestion_run", "metadata_json"),
        ("raw_artifact", "provenance_json"),
    }

    source_rows = await db_session.execute(
        text(
            """
            SELECT id, auth_type, max_poll_seconds
            FROM data_source
            WHERE id IN ('celestrak_gp', 'spacetrack_gp')
            ORDER BY id
            """
        )
    )
    assert source_rows.fetchall() == [
        ("celestrak_gp", "none", 7200),
        ("spacetrack_gp", "password", 3600),
    ]

    constraint_rows = await db_session.execute(
        text(
            """
            SELECT pg_get_constraintdef(constraint_row.oid)
            FROM pg_constraint AS constraint_row
            JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
            WHERE relation.relname = 'space_object'
              AND constraint_row.contype = 'c'
            """
        )
    )
    assert any("{1,9}" in row[0] for row in constraint_rows)

    index_rows = await db_session.execute(
        text(
            """
            SELECT indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'space_object_alias'
              AND indexname = 'space_object_alias_source_key_unique'
            """
        )
    )
    assert index_rows.scalar_one() == (
        "CREATE UNIQUE INDEX space_object_alias_source_key_unique "
        "ON public.space_object_alias USING btree (source_id, source_key)"
    )
