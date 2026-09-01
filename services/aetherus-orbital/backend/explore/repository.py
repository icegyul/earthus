"""Read-only PostgreSQL access for the P3 explore catalog."""

from datetime import datetime
from typing import Any

from sqlalchemy import text

from backend.database import get_db_session


class ExploreRepository:
    """Serve catalog rows strictly from canonical P1 objects and P2 solutions."""

    async def catalog_rows(self, limit: int) -> list[dict[str, Any]]:
        """Return canonical objects joined to their newest stored OMM solution."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        so.id::text AS object_id,
                        so.catalog_id,
                        so.canonical_name,
                        so.cospar_id,
                        so.object_type,
                        so.origin_code,
                        so.status AS object_status,
                        os.id::text AS orbit_solution_id,
                        os.epoch,
                        os.frame,
                        os.time_system,
                        os.theory,
                        os.mean_elements_json,
                        os.quality_json,
                        os.source_id,
                        ra.content_sha256,
                        ra.retrieved_at
                    FROM space_object AS so
                    JOIN LATERAL (
                        SELECT * FROM orbit_solution
                        WHERE object_id = so.id AND format = 'OMM'
                        ORDER BY epoch DESC, created_at DESC
                        LIMIT 1
                    ) AS os ON true
                    LEFT JOIN raw_artifact AS ra ON ra.id = os.source_artifact_id
                    ORDER BY os.epoch DESC, so.catalog_id ASC
                    LIMIT :limit
                    """
                ),
                {"limit": limit},
            )
            return [dict(row) for row in result.mappings().all()]

    async def count_objects(self) -> int:
        """Count every canonical space object row without inventing coverage."""
        async with get_db_session() as session:
            result = await session.execute(text("SELECT count(*) FROM space_object"))
            return int(result.scalar_one())

    async def count_objects_with_solution(self) -> int:
        """Count distinct objects whose latest record chain reaches an OMM solution."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT count(DISTINCT object_id) FROM orbit_solution
                    WHERE format = 'OMM'
                    """
                )
            )
            return int(result.scalar_one())

    async def source_health(self) -> list[dict[str, Any]]:
        """Summarize per-source last activity from real ingestion runs only."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        ds.id AS source_id,
                        MAX(ir.started_at) FILTER (
                            WHERE ir.status IN ('SUCCEEDED', 'PARTIAL')
                        ) AS last_success_at,
                        MAX(ir.started_at) AS last_attempt_at,
                        COUNT(*) FILTER (
                            WHERE ir.status IN ('SUCCEEDED', 'PARTIAL')
                        ) AS successful_runs,
                        COUNT(*) AS total_runs
                    FROM data_source AS ds
                    LEFT JOIN ingestion_run AS ir ON ir.source_id = ds.id
                    GROUP BY ds.id
                    ORDER BY ds.id
                    """
                )
            )
            rows = [dict(row) for row in result.mappings().all()]
        now = datetime.now(rows[0]["last_attempt_at"].tzinfo) if rows else None
        for row in rows:
            row["last_success_age_s"] = (
                (now - row["last_success_at"]).total_seconds()
                if row["last_success_at"] is not None and now is not None
                else None
            )
        return rows
