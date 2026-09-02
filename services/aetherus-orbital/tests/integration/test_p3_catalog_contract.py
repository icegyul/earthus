"""P3 catalog contract tests against the real P1/P2 database chain."""

import math
from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from backend.database import get_db_session

pytestmark = pytest.mark.asyncio


async def _solution_lookup(catalog_id: str) -> dict | None:
    async with get_db_session() as session:
        result = await session.execute(
            text(
                """
                SELECT so.id::text AS object_id, so.catalog_id, os.epoch
                FROM space_object so
                JOIN orbit_solution os ON os.object_id = so.id AND os.format = 'OMM'
                WHERE so.catalog_id = :catalog_id
                ORDER BY os.epoch DESC
                LIMIT 1
                """
            ),
            {"catalog_id": catalog_id},
        )
        row = result.mappings().one_or_none()
    return dict(row) if row else None


async def test_snapshot_serves_only_real_stored_objects(client: AsyncClient):
    """Every rendered entry must exist as a canonical object with a real solution."""
    async with get_db_session() as session:
        stored = {
            str(row[0])
            for row in (
                await session.execute(
                    text(
                        """
                        SELECT so.id::text FROM space_object so
                        JOIN orbit_solution os ON os.object_id = so.id AND os.format = 'OMM'
                        """
                    )
                )
            ).all()
        }
    response = await client.get("/api/v1/catalog/snapshot")
    assert response.status_code == 200
    payload = response.json()
    catalog = payload["data"]["catalog"]
    stored_count = len(stored)
    assert stored_count, "P1 snapshot chain must exist for the explore catalog"
    positioned = [entry for entry in catalog if entry["geodetic"] is not None]
    unavailable = [entry for entry in catalog if entry["geodetic"] is None]
    for entry in catalog:
        assert entry["object_id"] in stored
        if entry["geodetic"] is not None:
            assert entry["provenance"]["orbit_solution_id"]
            assert entry["provenance"]["source_ids"]
        else:
            assert entry["position_status"] in {
                "QUARANTINE",
                "PROPAGATION_UNAVAILABLE",
                "NO_SOLUTION",
            }
            assert entry["provenance"] is None
            assert entry["warnings"]

    coverage = payload["data"]["coverage"]
    assert coverage["objects_with_solution"] == stored_count
    assert coverage["catalog_entries"] == len(catalog)
    assert coverage["positioned_markers"] == len(positioned)
    assert coverage["unavailable_entries"] == len(unavailable)
    assert coverage["catalog_entries"] == (
        coverage["positioned_markers"] + coverage["unavailable_entries"]
    )
    assert sum(coverage["unavailable_by_status"].values()) == len(unavailable)
    for entry in unavailable:
        assert entry["position_status"] in coverage["unavailable_by_status"]


async def test_snapshot_position_matches_ephemeris_api_for_same_instant(client: AsyncClient):
    """The catalog marker and the ephemeris API must agree at the same instant."""
    # Take an object the page actually serves instead of assuming the ISS is on
    # it: the snapshot page is bounded and ordered by solution epoch, so with
    # ~19k objects its composition is a fact about the catalogue, not a contract.
    first_page = await client.get("/api/v1/catalog/snapshot")
    assert first_page.status_code == 200
    positioned = [row for row in first_page.json()["data"]["catalog"] if row["geodetic"] is not None]
    assert positioned, "no positioned object on the snapshot page"
    catalog_id = str(positioned[0]["catalog_id"])

    solution = await _solution_lookup(catalog_id)
    assert solution is not None
    at = solution["epoch"] + timedelta(minutes=30)

    snapshot = await client.get("/api/v1/catalog/snapshot", params={"at": at.isoformat()})
    assert snapshot.status_code == 200
    entry = next(
        (row for row in snapshot.json()["data"]["catalog"] if row["catalog_id"] == catalog_id),
        None,
    )
    assert entry is not None and entry["geodetic"] is not None

    ephemeris = await client.get(
        f"/api/v1/objects/{catalog_id}/ephemeris",
        params={"start": at.isoformat(), "stop": (at + timedelta(minutes=1)).isoformat(), "step_s": 60},
    )
    assert ephemeris.status_code == 200
    api_sample = ephemeris.json()["data"]["samples"][0]

    assert entry["geodetic"]["lat_deg"] == pytest.approx(api_sample["geodetic"]["lat_deg"], abs=1e-9)
    assert entry["geodetic"]["lon_deg"] == pytest.approx(api_sample["geodetic"]["lon_deg"], abs=1e-9)
    assert entry["geodetic"]["alt_km"] == pytest.approx(api_sample["geodetic"]["alt_km"], abs=1e-6)
    assert entry["state"]["r_km"] == pytest.approx(api_sample["state"]["r_km"], abs=1e-6)
    assert entry["sample_time"] == api_sample["sample_time"]


async def test_snapshot_envelope_and_finite_positions(client: AsyncClient):
    response = await client.get("/api/v1/catalog/snapshot")
    assert response.status_code == 200
    payload = response.json()
    assert payload["request_id"]
    assert payload["generated_at"].endswith("+00:00")
    assert payload["data_status"] in {"OK", "STALE", "PARTIAL", "UNAVAILABLE"}
    assert payload["provenance"]["model_id"] == "sgp4-vallado"
    assert payload["provenance"]["frame"] == "TEME"
    assert "client never computes" in payload["provenance"]["position_origin"]
    for entry in payload["data"]["catalog"]:
        if entry["geodetic"] is not None:
            assert -90.0 <= entry["geodetic"]["lat_deg"] <= 90.0
            assert -180.0 <= entry["geodetic"]["lon_deg"] <= 180.0
            # The catalogue holds GEO and HEO objects since the active-satellite
            # ingestion (Chandra apogee ~139,000 km), so the old LEO-only bound
            # of 2,000 km was a premise about the data, not a contract about the
            # propagator. Finite and physically plausible is the contract.
            assert 0.0 < entry["geodetic"]["alt_km"] < 1.0e6
            assert all(math.isfinite(value) for value in entry["state"]["r_km"])
        else:
            assert entry["position_status"] in {"QUARANTINE", "PROPAGATION_UNAVAILABLE", "NO_SOLUTION"}


async def test_snapshot_bbox_viewport_query(client: AsyncClient):
    """Mid-zoom viewport queries filter server-side by the API-derived geodetic fix."""
    full = await client.get("/api/v1/catalog/snapshot")
    catalog = full.json()["data"]["catalog"]
    positioned = [entry for entry in catalog if entry["geodetic"]]
    assert positioned, "at least one positioned object is required for the viewport test"
    # Pick a target whose +/-5 deg viewport stays inside the declared lon range;
    # real objects drift across the antimeridian, which the API rejects by contract.
    target = next(
        (
            entry
            for entry in positioned
            if -175.0 <= entry["geodetic"]["lon_deg"] <= 175.0
        ),
        None,
    )
    assert target is not None, "no positioned object away from the antimeridian"
    lat = target["geodetic"]["lat_deg"]
    lon = target["geodetic"]["lon_deg"]
    bbox = f"{lat - 5},{lon - 5},{lat + 5},{lon + 5}"
    filtered = await client.get("/api/v1/catalog/snapshot", params={"bbox": bbox})
    assert filtered.status_code == 200
    returned_ids = {entry["object_id"] for entry in filtered.json()["data"]["catalog"]}
    assert target["object_id"] in returned_ids
    for entry in filtered.json()["data"]["catalog"]:
        geo = entry["geodetic"]
        assert lat - 5 <= geo["lat_deg"] <= lat + 5


async def test_catalog_status_reports_real_counts(client: AsyncClient):
    response = await client.get("/api/v1/catalog/status")
    assert response.status_code == 200
    payload = response.json()
    coverage = payload["data"]["coverage"]
    assert coverage["objects_total"] > 0
    assert coverage["objects_with_solution"] > 0
    assert coverage["global_density"] in {"AVAILABLE", "INSUFFICIENT_DATA"}
    if coverage["global_density"] == "INSUFFICIENT_DATA":
        assert "fabricate" in coverage["global_density_reason"]
    assert isinstance(coverage["sources"], list)


async def test_snapshot_never_contains_pc_or_risk_fields(client: AsyncClient):
    response = await client.get("/api/v1/catalog/snapshot")
    body = response.text.lower()
    assert '"pc"' not in body and '"tca"' not in body and '"risk"' not in body
