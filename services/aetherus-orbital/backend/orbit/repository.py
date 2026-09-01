"""PostgreSQL access for orbit solutions and propagated ephemeris snapshots."""

import json
from typing import Any

from sqlalchemy import text

from backend.database import get_db_session
from backend.orbit.models import LoadedOrbitSolution, MeanElements


class OrbitRepository:
    """Load canonical solutions from P1 persistence and store propagation output."""

    async def latest_solution(self, object_lookup: str) -> LoadedOrbitSolution | None:
        """Return the newest stored OMM solution for one exact object identifier."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        so.id::text AS object_id,
                        so.catalog_id,
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
                    LEFT JOIN LATERAL (
                        SELECT * FROM orbit_solution
                        WHERE object_id = so.id AND format = 'OMM'
                        ORDER BY epoch DESC, created_at DESC
                        LIMIT 1
                    ) AS os ON true
                    LEFT JOIN raw_artifact AS ra ON ra.id = os.source_artifact_id
                    WHERE so.catalog_id = :lookup OR so.id::text = :lookup
                    LIMIT 1
                    """
                ),
                {"lookup": object_lookup},
            )
            row = result.mappings().one_or_none()
        if row is None or row["orbit_solution_id"] is None:
            return None
        quality = _json_dict(row["quality_json"])
        limitations = tuple(
            item for item in quality.get("limitations", []) if isinstance(item, str)
        )
        return LoadedOrbitSolution(
            elements=MeanElements(
                catalog_id=str(row["catalog_id"]),
                epoch=row["epoch"],
                frame=str(row["frame"]),
                time_system=str(row["time_system"]),
                theory=str(row["theory"]),
                mean_elements=_numeric_elements(_json_dict(row["mean_elements_json"])),
            ),
            object_id=str(row["object_id"]),
            orbit_solution_id=str(row["orbit_solution_id"]),
            source_id=row["source_id"],
            content_sha256=row["content_sha256"],
            retrieved_at=row["retrieved_at"],
            quality_grade=quality.get("source_grade"),
            limitations=limitations,
        )

    async def persist_propagation_samples(
        self,
        object_id: str,
        orbit_solution_id: str,
        samples: list[dict[str, Any]],
        model_version: str,
        input_hash: str,
        window_start: Any,
        window_stop: Any,
    ) -> int:
        """Idempotently store bounded ephemeris rows and count the stored window."""
        if not samples:
            return 0
        async with get_db_session() as session:
            await session.execute(
                text(
                    """
                    INSERT INTO propagation_snapshot (
                        object_id, orbit_solution_id, sample_time, frame,
                        x_km, y_km, z_km, vx_kms, vy_kms, vz_kms,
                        lat_deg, lon_deg, alt_km, position,
                        model_version, input_hash
                    )
                    VALUES (
                        CAST(:object_id AS uuid), CAST(:orbit_solution_id AS uuid),
                        :sample_time, 'TEME',
                        :x_km, :y_km, :z_km, :vx_kms, :vy_kms, :vz_kms,
                        :lat_deg, :lon_deg, :alt_km,
                        ST_SetSRID(ST_MakePoint(:x_km, :y_km, :z_km), 4978),
                        :model_version, :input_hash
                    )
                    ON CONFLICT (object_id, orbit_solution_id, model_version, sample_time)
                    DO NOTHING
                    """
                ),
                [
                    {
                        "object_id": object_id,
                        "orbit_solution_id": orbit_solution_id,
                        "sample_time": sample["sample_time"],
                        "x_km": sample["x_km"],
                        "y_km": sample["y_km"],
                        "z_km": sample["z_km"],
                        "vx_kms": sample["vx_kms"],
                        "vy_kms": sample["vy_kms"],
                        "vz_kms": sample["vz_kms"],
                        "lat_deg": sample["lat_deg"],
                        "lon_deg": sample["lon_deg"],
                        "alt_km": sample["alt_km"],
                        "model_version": model_version,
                        "input_hash": input_hash,
                    }
                    for sample in samples
                ],
            )
            counted = await session.execute(
                text(
                    """
                    SELECT count(*)
                    FROM propagation_snapshot
                    WHERE object_id = CAST(:object_id AS uuid)
                      AND orbit_solution_id = CAST(:orbit_solution_id AS uuid)
                      AND model_version = :model_version
                      AND sample_time >= :window_start
                      AND sample_time <= :window_stop
                    """
                ),
                {
                    "object_id": object_id,
                    "orbit_solution_id": orbit_solution_id,
                    "model_version": model_version,
                    "window_start": window_start,
                    "window_stop": window_stop,
                },
            )
            stored_count = int(counted.scalar_one())
        return stored_count

    async def count_propagation_snapshots(self) -> int:
        """Return the total persisted ephemeris row count for evidence assertions."""
        async with get_db_session() as session:
            result = await session.execute(text("SELECT count(*) FROM propagation_snapshot"))
            return int(result.scalar_one())

    async def raw_artifact_exists(self, content_sha256: str) -> bool:
        """Confirm one committed fixture hash chains back to a real P1 ingestion."""
        async with get_db_session() as session:
            result = await session.execute(
                text("SELECT 1 FROM raw_artifact WHERE content_sha256 = :hash LIMIT 1"),
                {"hash": content_sha256},
            )
            return result.first() is not None


def _json_dict(value: Any) -> dict[str, Any]:
    """Normalize JSONB driver return types without manufacturing missing values."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        parsed = json.loads(value)
        if isinstance(parsed, dict):
            return parsed
    return {}


def _numeric_elements(mean_elements: dict[str, Any]) -> dict[str, float | int | None]:
    """Keep only numeric OMM element keys with their persisted values."""
    allowed = {
        "mean_motion_rev_per_day",
        "eccentricity",
        "inclination_deg",
        "ra_of_asc_node_deg",
        "arg_of_pericenter_deg",
        "mean_anomaly_deg",
        "bstar",
        "mean_motion_dot",
        "mean_motion_ddot",
        "element_set_no",
        "rev_at_epoch",
    }
    return {key: value for key, value in mean_elements.items() if key in allowed}
