"""Ephemeris API contract tests against the real stored P1 snapshot chain."""

import math
from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from backend.database import get_db_session


def _iso(moment: datetime) -> str:
    return moment.isoformat()


async def _latest_solution_row() -> dict | None:
    async with get_db_session() as session:
        result = await session.execute(
            text(
                """
                SELECT so.id::text AS object_id, so.catalog_id,
                       os.id::text AS orbit_solution_id, os.epoch
                FROM space_object AS so
                JOIN orbit_solution AS os ON os.object_id = so.id
                WHERE so.catalog_id = '25544'
                ORDER BY os.epoch DESC
                LIMIT 1
                """
            )
        )
        row = result.mappings().one_or_none()
    return dict(row) if row else None


pytestmark = pytest.mark.asyncio


async def test_ephemeris_happy_path_from_real_p1_snapshot(client: AsyncClient):
    solution = await _latest_solution_row()
    assert solution is not None, "P1 snapshot chain must exist for ephemeris"
    epoch = solution["epoch"]
    start = epoch - timedelta(minutes=10)
    stop = epoch + timedelta(minutes=10)

    response = await client.get(
        f"/api/v1/objects/{solution['catalog_id']}/ephemeris",
        params={"start": _iso(start), "stop": _iso(stop), "step_s": 300},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["request_id"]
    assert payload["generated_at"].endswith("+00:00")
    assert payload["data_status"] in {"OK", "STALE"}
    data = payload["data"]
    assert data["sample_count"] == 5
    provenance = payload["provenance"]
    assert provenance["model_id"] == "sgp4-vallado"
    assert provenance["frame"] == "TEME"
    assert provenance["time_system"] == "UTC"
    assert provenance["input_artifact_hashes"]
    assert provenance["config_hash"]
    assert provenance["quality_grade"] == "PUBLIC_GP"

    for sample in data["samples"]:
        state = sample["state"]
        geodetic = sample["geodetic"]
        assert state["frame"] == "TEME"
        assert all(math.isfinite(value) for value in state["r_km"])
        assert all(math.isfinite(value) for value in state["v_km_s"])
        assert -90.0 <= geodetic["lat_deg"] <= 90.0
        assert -180.0 <= geodetic["lon_deg"] <= 180.0
        assert 0.0 < geodetic["alt_km"] < 1000.0
    serialized = response.text
    assert "NaN" not in serialized and "Infinity" not in serialized


async def test_ephemeris_persists_propagation_snapshots(client: AsyncClient):
    solution = await _latest_solution_row()
    start = solution["epoch"] - timedelta(minutes=5)
    stop = solution["epoch"] + timedelta(minutes=5)
    first = await client.get(
        f"/api/v1/objects/{solution['catalog_id']}/ephemeris",
        params={"start": _iso(start), "stop": _iso(stop), "step_s": 60},
    )
    assert first.status_code == 200
    rows_first = first.json()["persistence"]["propagation_snapshot_rows_stored"]
    second = await client.get(
        f"/api/v1/objects/{solution['catalog_id']}/ephemeris",
        params={"start": _iso(start), "stop": _iso(stop), "step_s": 60},
    )
    assert second.status_code == 200
    rows_second = second.json()["persistence"]["propagation_snapshot_rows_stored"]
    assert rows_second == rows_first
    async with get_db_session() as session:
        counted = await session.execute(text("SELECT count(*) FROM propagation_snapshot"))
        total = int(counted.scalar_one())
    assert total >= rows_first > 0


async def test_ephemeris_unknown_object_is_404(client: AsyncClient):
    response = await client.get(
        "/api/v1/objects/aetherus-no-such-object/ephemeris",
        params={
            "start": "2026-08-23T00:00:00Z",
            "stop": "2026-08-23T01:00:00Z",
            "step_s": 60,
        },
    )
    assert response.status_code == 404
    assert response.json()["status"] == "UNKNOWN_OBJECT"


async def test_ephemeris_out_of_range_catalog_id_is_quarantined(client: AsyncClient):
    """An object whose ID exceeds SGP4's Alpha-5 range gets an explicit error state."""
    async with get_db_session() as session:
        result = await session.execute(
            text(
                """
                SELECT so.catalog_id
                FROM space_object so JOIN orbit_solution os ON os.object_id = so.id
                WHERE length(so.catalog_id) >= 9
                LIMIT 1
                """
            )
        )
        row = result.first()
    if row is None:
        pytest.skip("No wide-catalog object with a stored solution is available")
    catalog_id = str(row[0])
    response = await client.get(
        f"/api/v1/objects/{catalog_id}/ephemeris",
        params={
            "start": "2026-08-23T00:00:00Z",
            "stop": "2026-08-23T01:00:00Z",
            "step_s": 60,
        },
    )
    assert response.status_code == 400
    payload = response.json()
    assert payload["status"] == "QUARANTINE"


async def test_ephemeris_rejects_naive_timestamps(client: AsyncClient):
    response = await client.get(
        "/api/v1/objects/25544/ephemeris",
        params={"start": "2026-08-23T00:00:00", "stop": "2026-08-23T01:00:00Z"},
    )
    assert response.status_code == 422
    assert response.json()["status"] == "INVALID_WINDOW"


async def test_ephemeris_rejects_inverted_window(client: AsyncClient):
    response = await client.get(
        "/api/v1/objects/25544/ephemeris",
        params={
            "start": "2026-08-23T02:00:00Z",
            "stop": "2026-08-23T01:00:00Z",
            "step_s": 60,
        },
    )
    assert response.status_code == 422
    assert response.json()["status"] == "INVALID_WINDOW"


async def test_ephemeris_rejects_out_of_range_step(client: AsyncClient):
    response = await client.get(
        "/api/v1/objects/25544/ephemeris",
        params={
            "start": "2026-08-23T00:00:00Z",
            "stop": "2026-08-23T01:00:00Z",
            "step_s": 7200,
        },
    )
    assert response.status_code == 422


async def test_ephemeris_enforces_sample_cap(client: AsyncClient):
    response = await client.get(
        "/api/v1/objects/25544/ephemeris",
        params={
            "start": "2026-08-01T00:00:00Z",
            "stop": "2026-10-15T00:00:00Z",
            "step_s": 3600,
        },
    )
    assert response.status_code == 422
    payload = response.json()
    assert payload["status"] == "INVALID_WINDOW"
    assert payload["details"]["samples"] > payload["details"]["maximum_samples"]


async def test_ephemeris_never_contains_pc_or_risk_fields(client: AsyncClient):
    solution = await _latest_solution_row()
    response = await client.get(
        f"/api/v1/objects/{solution['catalog_id']}/ephemeris",
        params={
            "start": _iso(solution["epoch"]),
            "stop": _iso(solution["epoch"] + timedelta(minutes=2)),
            "step_s": 60,
        },
    )
    assert response.status_code == 200
    body = response.text.lower()
    assert '"pc"' not in body and "miss_distance" not in body and "risk" not in body


async def test_ephemeris_sample_times_are_spaced_by_step_seconds(client: AsyncClient):
    """Regression: the API grid must advance by step_s, not one second per sample."""
    solution = await _latest_solution_row()
    start = solution["epoch"] - timedelta(minutes=30)
    stop = solution["epoch"] + timedelta(minutes=30)
    response = await client.get(
        f"/api/v1/objects/{solution['catalog_id']}/ephemeris",
        params={"start": _iso(start), "stop": _iso(stop), "step_s": 120},
    )
    assert response.status_code == 200
    samples = response.json()["data"]["samples"]
    assert samples, "a valid window must return samples"
    first = datetime.fromisoformat(samples[0]["sample_time"])
    second = datetime.fromisoformat(samples[1]["sample_time"])
    last = datetime.fromisoformat(samples[-1]["sample_time"])
    assert (second - first).total_seconds() == 120
    assert (last - first).total_seconds() == 120 * (len(samples) - 1)
