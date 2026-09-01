from __future__ import annotations

import pytest
from sqlalchemy import text

from backend.database import get_db_session


@pytest.mark.asyncio
@pytest.mark.integration
async def test_v06_product_schema_is_namespaced_and_complete() -> None:
    async with get_db_session() as session:
        result = await session.execute(
            text(
                """
                SELECT
                  to_regclass('aetherus_product.universe_revision')::text,
                  to_regclass('aetherus_product.event_revision')::text,
                  to_regclass('aetherus_product.collision_risk_assessment')::text,
                  to_regclass('public.universe_revision')::text
                """
            )
        )
        universe, revision, collision, public_collision = result.one()

    assert universe == "aetherus_product.universe_revision"
    assert revision == "aetherus_product.event_revision"
    assert collision == "aetherus_product.collision_risk_assessment"
    assert public_collision is None


@pytest.mark.asyncio
@pytest.mark.integration
async def test_v06_scientific_tables_have_append_only_triggers() -> None:
    expected = {
        "event_revision",
        "universe_revision",
        "collision_risk_assessment",
        "risk_graph_snapshot",
        "telemetry_sample",
    }
    async with get_db_session() as session:
        result = await session.execute(
            text(
                """
                SELECT event_object_table
                FROM information_schema.triggers
                WHERE trigger_schema = 'aetherus_product'
                  AND action_timing = 'BEFORE'
                  AND event_manipulation IN ('UPDATE', 'DELETE')
                """
            )
        )
        triggered = {row[0] for row in result.fetchall()}

    assert expected <= triggered
