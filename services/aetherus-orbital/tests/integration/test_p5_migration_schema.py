"""Migration 007 schema verification for the P5 benefit engine."""

from sqlalchemy import text

REQUIRED_TABLES = {"baseline_graph_snapshot"}
REQUIRED_COLUMNS = {
    "risk_edge": {"created_at", "validation_state"},
    "intervention_scenario": {"requested_metrics"},
    "scenario_run": {
        "data_status",
        "status_reason",
        "recompute_mode",
        "model_id",
        "input_hash",
        "config_hash",
        "thresholds_json",
        "affected_edge_count",
        "reused_baseline_edge_count",
        "peak_memory_bytes",
        "warnings_json",
    },
}
APPEND_ONLY_TABLES = {
    "baseline_graph_snapshot",
    "risk_edge",
    "intervention_scenario",
    "benefit_result",
}


class TestP5Schema:
    async def test_baseline_table_exists(self, db_session):
        result = await db_session.execute(
            text(
                """
                SELECT table_name FROM information_schema.tables
                WHERE table_schema='public' AND table_name = 'baseline_graph_snapshot'
                """
            )
        )
        assert result.first() is not None

    async def test_p5_columns_present(self, db_session):
        result = await db_session.execute(
            text(
                """
                SELECT table_name, column_name FROM information_schema.columns
                WHERE table_schema='public'
                  AND table_name IN ('risk_edge', 'intervention_scenario', 'scenario_run')
                """
            )
        )
        columns: dict[str, set[str]] = {}
        for table_name, column_name in result.fetchall():
            columns.setdefault(table_name, set()).add(column_name)
        for table, required in REQUIRED_COLUMNS.items():
            assert required.issubset(columns.get(table, set())), table

    async def test_metric_channel_constraints(self, db_session):
        result = await db_session.execute(
            text(
                """
                SELECT conname FROM pg_constraint
                WHERE conrelid IN ('risk_edge'::regclass, 'benefit_result'::regclass)
                  AND conname LIKE '%metric_channel_check%'
                """
            )
        )
        names = {row[0] for row in result.fetchall()}
        assert len(names) == 2

    async def test_no_self_benefit_constraint(self, db_session):
        result = await db_session.execute(
            text(
                """
                SELECT 1 FROM pg_constraint
                WHERE conrelid = 'benefit_result'::regclass
                  AND conname = 'benefit_result_no_self_benefit'
                """
            )
        )
        assert result.first() is not None

    async def test_append_only_triggers_present(self, db_session):
        result = await db_session.execute(
            text(
                """
                SELECT tgrelid::regclass::text AS table_name, tgname
                FROM pg_trigger
                WHERE tgname LIKE '%append_only%' AND NOT tgisinternal
                """
            )
        )
        found = {(row[0], row[1]) for row in result.fetchall()}
        for table in APPEND_ONLY_TABLES:
            assert (table, f"{table}_append_only") in found, table

    async def test_scenario_run_terminal_transition_trigger(self, db_session):
        result = await db_session.execute(
            text(
                """
                SELECT 1 FROM pg_trigger
                WHERE tgrelid = 'scenario_run'::regclass
                  AND tgname = 'scenario_run_immutable_after_final'
                  AND NOT tgisinternal
                """
            )
        )
        assert result.first() is not None

    async def test_model_registry_seeded(self, db_session):
        result = await db_session.execute(
            text(
                """
                SELECT id, version FROM model_registry
                WHERE id IN ('aetherus-risk-graph', 'aetherus-benefit-engine')
                ORDER BY id
                """
            )
        )
        rows = {(row[0], row[1]) for row in result.fetchall()}
        assert ("aetherus-risk-graph", "p5-baseline-v1") in rows
        assert ("aetherus-benefit-engine", "p5-idealized-removal-v1") in rows
