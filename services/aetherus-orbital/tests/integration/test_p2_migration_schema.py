"""P2 migration schema tests: model registry seed and ephemeris persistence rules."""

import pytest
from sqlalchemy import text

from backend.database import get_db_session


async def test_model_registry_contains_validated_sgp4_entry(db_session):
    result = await db_session.execute(
        text(
            """
            SELECT id, version, category, source_commit, config_schema, validation_state
            FROM model_registry
            WHERE id = 'sgp4-vallado'
            """
        )
    )
    row = result.mappings().one_or_none()
    assert row is not None
    assert row["category"] == "orbit_propagation"
    assert row["validation_state"] == "VALIDATED"
    datasets = row["config_schema"].get("validation_datasets", [])
    assert "sgp4-vallado-tcppver-reference-corpus" in datasets
    assert row["config_schema"].get("polar_motion_applied") is False


async def test_propagation_snapshot_unique_index_enforces_idempotent_samples():
    async with get_db_session() as session:
        indexes = await session.execute(
            text(
                """
                SELECT indexname FROM pg_indexes
                WHERE tablename = 'propagation_snapshot'
                """
            )
        )
        names = {row[0] for row in indexes.fetchall()}
    assert "uq_propagation_snapshot_sample" in names


@pytest.mark.asyncio
async def test_duplicate_sample_insert_is_ignored():
    """Two identical inserts must collapse onto one row through the unique index."""
    from datetime import UTC, datetime, timedelta

    from backend.orbit.repository import OrbitRepository

    async with get_db_session() as session:
        result = await session.execute(
            text(
                """
                SELECT so.id::text AS object_id, os.id::text AS orbit_solution_id
                FROM space_object so JOIN orbit_solution os ON os.object_id = so.id
                WHERE so.catalog_id = '25544'
                ORDER BY os.epoch DESC LIMIT 1
                """
            )
        )
        row = result.mappings().one_or_none()
    if row is None:
        pytest.skip("No P1 orbit solution available")
    repository = OrbitRepository()
    sample_time = datetime.now(UTC).replace(microsecond=0)
    samples = [
        {
            "sample_time": sample_time,
            "x_km": 1000.0 + offset,
            "y_km": -2000.0,
            "z_km": 3000.0,
            "vx_kms": 1.0,
            "vy_kms": 7.0,
            "vz_kms": -2.0,
            "lat_deg": 1.0,
            "lon_deg": 2.0,
            "alt_km": 420.0,
        }
        for offset in (0.0,)
    ]
    window_start = sample_time - timedelta(seconds=1)
    window_stop = sample_time + timedelta(seconds=1)
    first = await repository.persist_propagation_samples(
        row["object_id"],
        row["orbit_solution_id"],
        samples,
        "test-model-1",
        "test-hash-dup",
        window_start,
        window_stop,
    )
    second = await repository.persist_propagation_samples(
        row["object_id"],
        row["orbit_solution_id"],
        samples,
        "test-model-1",
        "test-hash-dup",
        window_start,
        window_stop,
    )
    assert first >= 1 and second == first
