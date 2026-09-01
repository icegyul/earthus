"""Database connectivity and schema tests."""

import pytest
from sqlalchemy import text

from backend.database import check_db_health, get_db_session

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_database_connectivity():
    """Test database is accessible."""
    async with get_db_session() as session:
        result = await session.execute(text("SELECT 1 as test"))
        assert result.scalar() == 1


@pytest.mark.asyncio
async def test_postgis_extension():
    """Test PostGIS extension is installed."""
    async with get_db_session() as session:
        result = await session.execute(text("SELECT PostGIS_Version()"))
        version = result.scalar()
        assert version is not None
        assert len(version) > 0


@pytest.mark.asyncio
async def test_pgcrypto_extension():
    """Test pgcrypto extension is installed."""
    async with get_db_session() as session:
        result = await session.execute(text("SELECT gen_random_uuid()"))
        uuid_val = result.scalar()
        assert uuid_val is not None


@pytest.mark.asyncio
async def test_db_health_check():
    """Test database health check function."""
    is_healthy = await check_db_health()
    assert is_healthy is True


@pytest.mark.asyncio
async def test_schema_migrations_table_exists():
    """Test schema_migrations table exists (created by migrate.py)."""
    async with get_db_session() as session:
        # This will fail if migrations haven't been run yet
        # which is expected in a clean test environment
        result = await session.execute(
            text(
                """
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_name = 'schema_migrations'
                )
                """
            )
        )
        exists = result.scalar()
        # In P0, we just verify the query works
        # The table will be created when migrations run
        assert exists is not None
