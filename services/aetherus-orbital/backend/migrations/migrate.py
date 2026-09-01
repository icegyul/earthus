"""Database migration runner.

Executes SQL migrations in order from migrations/ directory.
Tracks applied migrations in schema_migrations table.
"""

import asyncio
import hashlib
import logging
import sys
from pathlib import Path

from sqlalchemy import text

from backend.database import get_db_session

logger = logging.getLogger(__name__)


def split_sql_statements(sql: str) -> list[str]:
    """Split top-level SQL statements while preserving quoted literals and comments.

    SQLAlchemy's prepared-statement path cannot execute an entire PostgreSQL migration
    file at once. This lexer keeps semicolons inside quoted strings, identifiers,
    comments, and dollar-quoted bodies out of the statement boundary calculation.
    """
    statements: list[str] = []
    buffer: list[str] = []
    index = 0
    in_single_quote = False
    in_double_quote = False
    in_line_comment = False
    in_block_comment = False
    dollar_quote: str | None = None

    while index < len(sql):
        character = sql[index]
        following = sql[index + 1] if index + 1 < len(sql) else ""

        if in_line_comment:
            buffer.append(character)
            if character == "\n":
                in_line_comment = False
            index += 1
            continue
        if in_block_comment:
            buffer.append(character)
            if character == "*" and following == "/":
                buffer.append(following)
                index += 2
                in_block_comment = False
                continue
            index += 1
            continue
        if dollar_quote is not None:
            if sql.startswith(dollar_quote, index):
                buffer.append(dollar_quote)
                index += len(dollar_quote)
                dollar_quote = None
                continue
            buffer.append(character)
            index += 1
            continue
        if in_single_quote:
            buffer.append(character)
            if character == "'" and following == "'":
                buffer.append(following)
                index += 2
                continue
            if character == "'":
                in_single_quote = False
            index += 1
            continue
        if in_double_quote:
            buffer.append(character)
            if character == '"' and following == '"':
                buffer.append(following)
                index += 2
                continue
            if character == '"':
                in_double_quote = False
            index += 1
            continue
        if character == "-" and following == "-":
            buffer.extend((character, following))
            index += 2
            in_line_comment = True
            continue
        if character == "/" and following == "*":
            buffer.extend((character, following))
            index += 2
            in_block_comment = True
            continue
        if character == "'":
            buffer.append(character)
            index += 1
            in_single_quote = True
            continue
        if character == '"':
            buffer.append(character)
            index += 1
            in_double_quote = True
            continue
        if character == "$":
            end = sql.find("$", index + 1)
            if end != -1:
                candidate = sql[index : end + 1]
                tag = candidate[1:-1]
                if not tag or tag.replace("_", "a").isalnum():
                    buffer.append(candidate)
                    index = end + 1
                    dollar_quote = candidate
                    continue
        if character == ";":
            statement = "".join(buffer).strip()
            if statement:
                statements.append(statement)
            buffer.clear()
            index += 1
            continue
        buffer.append(character)
        index += 1

    statement = "".join(buffer).strip()
    if statement:
        statements.append(statement)
    return statements


class MigrationRunner:
    """Database migration runner."""

    def __init__(self, migrations_dir: Path):
        """Initialize migration runner.

        Args:
            migrations_dir: Directory containing .sql migration files
        """
        self.migrations_dir = migrations_dir

    async def ensure_migrations_table(self) -> None:
        """Create schema_migrations table if it doesn't exist."""
        async with get_db_session() as session:
            await session.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        id SERIAL PRIMARY KEY,
                        migration_name TEXT NOT NULL UNIQUE,
                        content_hash TEXT NOT NULL,
                        applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        execution_time_ms BIGINT
                    )
                    """
                )
            )
            logger.info("Ensured schema_migrations table exists")

    async def get_applied_migrations(self) -> set[str]:
        """Get set of applied migration names."""
        async with get_db_session() as session:
            result = await session.execute(
                text("SELECT migration_name FROM schema_migrations ORDER BY id")
            )
            return {row[0] for row in result.fetchall()}

    def get_migration_files(self) -> list[tuple[str, Path]]:
        """Get sorted list of (name, path) tuples for migration files.

        Returns:
            List of (migration_name, file_path) sorted by name
        """
        if not self.migrations_dir.exists():
            logger.warning("Migrations directory does not exist: %s", self.migrations_dir)
            return []

        files = []
        for path in sorted(self.migrations_dir.glob("*.sql")):
            files.append((path.stem, path))

        return files

    async def apply_migration(self, name: str, path: Path) -> None:
        """Apply a single migration.

        Args:
            name: Migration name
            path: Path to SQL file
        """
        import time

        logger.info("Applying migration: %s", name)

        # Read migration SQL
        content = path.read_text(encoding="utf-8")
        content_hash = hashlib.sha256(content.encode()).hexdigest()

        start_time = time.time()

        async with get_db_session() as session:
            for statement in split_sql_statements(content):
                await session.execute(text(statement))

            # Record migration
            execution_time_ms = int((time.time() - start_time) * 1000)
            await session.execute(
                text(
                    """
                    INSERT INTO schema_migrations (migration_name, content_hash, execution_time_ms)
                    VALUES (:name, :hash, :time_ms)
                    """
                ),
                {"name": name, "hash": content_hash, "time_ms": execution_time_ms},
            )

        logger.info("Migration %s applied successfully in %dms", name, execution_time_ms)

    async def run(self, dry_run: bool = False) -> None:
        """Run all pending migrations.

        Args:
            dry_run: If True, only show what would be applied
        """
        logger.info("Starting migration run (dry_run=%s)", dry_run)

        # Ensure migrations table exists
        if not dry_run:
            await self.ensure_migrations_table()

        # Get applied and available migrations
        applied = await self.get_applied_migrations() if not dry_run else set()
        available = self.get_migration_files()

        if not available:
            logger.warning("No migration files found in %s", self.migrations_dir)
            return

        # Find pending migrations
        pending = [(name, path) for name, path in available if name not in applied]

        if not pending:
            logger.info("No pending migrations")
            return

        logger.info("Found %d pending migration(s)", len(pending))

        for name, path in pending:
            if dry_run:
                logger.info("Would apply: %s", name)
            else:
                await self.apply_migration(name, path)

        logger.info("Migration run complete")

    async def status(self) -> None:
        """Show migration status."""
        await self.ensure_migrations_table()

        applied = await self.get_applied_migrations()
        available = self.get_migration_files()

        print("\nMigration Status:")
        print("=" * 80)

        if not available:
            print("No migration files found")
            return

        for name, _ in available:
            status = "✓ Applied" if name in applied else "✗ Pending"
            print(f"{status:12} {name}")

        print("=" * 80)
        print(f"Applied: {len(applied)} / {len(available)}")
        print()


async def main():
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Run database migrations")
    parser.add_argument(
        "--dry-run", action="store_true", help="Show pending migrations without applying"
    )
    parser.add_argument("--status", action="store_true", help="Show migration status")
    parser.add_argument(
        "--migrations-dir",
        type=Path,
        default=Path("migrations"),
        help="Migrations directory (default: migrations/)",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
    )

    runner = MigrationRunner(args.migrations_dir)

    try:
        if args.status:
            await runner.status()
        else:
            await runner.run(dry_run=args.dry_run)
    except Exception as e:
        logger.error("Migration failed: %s", e, exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
