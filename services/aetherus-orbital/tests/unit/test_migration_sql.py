"""Unit tests for safe execution of multi-statement SQL migration files."""

from pathlib import Path

from backend.migrations.migrate import split_sql_statements

MIGRATION_003 = (
    Path(__file__).parents[2] / "migrations" / "003_ingestion_policy_identity_and_rejections.sql"
)
MIGRATION_006 = Path(__file__).parents[2] / "migrations" / "006_p4_pc_encounter_plane_v2.sql"


def test_splits_top_level_statements_without_breaking_semicolons_inside_literals() -> None:
    """Migration execution must preserve SQL string content and execute each command once."""
    sql = """
    CREATE TABLE example (id integer, note text);
    INSERT INTO example (id, note) VALUES (1, 'source; provenance');
    -- a comment containing ; must not make an empty statement
    CREATE INDEX example_id_idx ON example (id);
    """

    statements = split_sql_statements(sql)

    assert len(statements) == 3
    assert "'source; provenance'" in statements[1]
    assert "CREATE INDEX example_id_idx" in statements[2]


def test_p1_migration_splits_every_required_schema_change_into_executable_statements() -> None:
    """Migration 003 must remain executable by the production runner's SQL lexer."""
    statements = split_sql_statements(MIGRATION_003.read_text(encoding="utf-8"))

    assert any(statement.startswith("CREATE TABLE IF NOT EXISTS ingestion_run_artifact") for statement in statements)
    assert any(
        statement.startswith("CREATE TABLE IF NOT EXISTS ingestion_record_rejection")
        for statement in statements
    )
    assert any(statement.startswith("CREATE TABLE IF NOT EXISTS identity_conflict") for statement in statements)


def test_p4_pc_correction_has_an_additive_model_registry_migration() -> None:
    """A corrected scientific method must not reuse the invalidated v1 provenance."""
    assert MIGRATION_006.is_file()

    statements = split_sql_statements(MIGRATION_006.read_text(encoding="utf-8"))

    assert any("p4-encounter-plane-v1" in statement and "INVALIDATED" in statement for statement in statements)
    assert any("p4-encounter-plane-v2" in statement for statement in statements)
    assert any("analytic-isotropic-gaussian-disk-v1" in statement for statement in statements)
