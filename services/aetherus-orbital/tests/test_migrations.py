"""Migration system tests."""

from pathlib import Path

import pytest

from backend.migrations.migrate import MigrationRunner


@pytest.mark.asyncio
async def test_migration_runner_init():
    """Test MigrationRunner initialization."""
    runner = MigrationRunner(Path("migrations"))
    assert runner.migrations_dir == Path("migrations")


@pytest.mark.asyncio
async def test_get_migration_files():
    """Test discovery of migration files."""
    runner = MigrationRunner(Path("migrations"))
    files = runner.get_migration_files()

    # Should find at least 001_initial_schema.sql
    assert len(files) >= 1

    # First file should be 001_initial_schema
    names = [name for name, _ in files]
    assert "001_initial_schema" in names


@pytest.mark.asyncio
@pytest.mark.integration
async def test_ensure_migrations_table():
    """Test creation of schema_migrations table."""
    runner = MigrationRunner(Path("migrations"))

    # Should not raise
    await runner.ensure_migrations_table()

    # Verify table exists
    from sqlalchemy import text

    from backend.database import get_db_session

    async with get_db_session() as session:
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
        assert exists is True


@pytest.mark.asyncio
async def test_migration_sorting():
    """Test migrations are sorted by name."""
    runner = MigrationRunner(Path("migrations"))
    files = runner.get_migration_files()

    names = [name for name, _ in files]
    assert names == sorted(names)
