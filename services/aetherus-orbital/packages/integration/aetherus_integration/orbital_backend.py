"""Adapter from the premium product surface to the verified P5 science stack."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Protocol

from fastapi import HTTPException

from backend.conjunction.service import ConjunctionService
from backend.orbit.service import EphemerisService


class OrbitalScienceBackend(Protocol):
    async def ephemeris(self, object_id: str, at: datetime | str | None) -> dict: ...

    async def conjunction_risk(
        self, conjunction_id: str, at: datetime | str | None
    ) -> dict: ...


def _moment(value: datetime | str | None) -> datetime:
    if value is None:
        return datetime.now(UTC)
    parsed = datetime.fromisoformat(value) if isinstance(value, str) else value
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise HTTPException(422, "at must be an offset-aware UTC instant")
    return parsed.astimezone(UTC)


class P5PostgresOrbitalBackend:
    """Expose P5 SGP4/TCA/Pc results without re-computing them in the UI layer."""

    def __init__(
        self,
        ephemeris_service: EphemerisService | None = None,
        conjunction_service: ConjunctionService | None = None,
    ) -> None:
        self.ephemeris_service = ephemeris_service or EphemerisService()
        self.conjunction_service = conjunction_service or ConjunctionService()

    async def ephemeris(self, object_id: str, at: datetime | str | None) -> dict:
        start = _moment(at)
        result = await self.ephemeris_service.ephemeris(
            object_id,
            start.isoformat(),
            (start + timedelta(seconds=1)).isoformat(),
            1,
        )
        result.setdefault("provenance", {})["scientific_source"] = "P5_POSTGRES"
        return result

    async def conjunction_risk(
        self, conjunction_id: str, at: datetime | str | None
    ) -> dict:
        del at  # P5 snapshots are immutable and carry their own snapshot/TCA times.
        result = await self.conjunction_service.list_conjunctions(
            object_ref=None,
            start_raw=None,
            stop_raw=None,
            source_grade=None,
            metric_type=None,
            threshold_min=None,
            threshold_max=None,
            limit_raw=200,
        )
        event = next(
            (row for row in result["data"]["events"] if row["event_id"] == conjunction_id),
            None,
        )
        if event is None:
            raise HTTPException(404, "conjunction not found in P5 persisted snapshots")
        snapshot = event["latest_snapshot"]
        pc = snapshot["metrics"]["PC"]
        return {
            "request_id": result["request_id"],
            "generated_at": result["generated_at"],
            "data_status": snapshot["validation_state"],
            "data": {
                "id": conjunction_id,
                "tca": event["tca"],
                "relative_geometry": {
                    "miss_distance_m": snapshot["miss_distance_m"],
                    "relative_speed_mps": snapshot["relative_speed_mps"],
                },
                "pc": pc["value"],
                "pc_status": pc["status"],
                "pc_unavailable_reason": pc["unavailable_reason"],
                "covariance_status": snapshot["covariance_status"],
                "validation_state": snapshot["validation_state"],
            },
            "provenance": {
                **snapshot["provenance"],
                "scientific_source": "P5_POSTGRES",
                "model_version": snapshot["model_version"],
                "input_hash": snapshot["input_hash"],
            },
            "warnings": result.get("warnings", []),
        }
