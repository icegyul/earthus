"""API contract tests for the P3 explore catalog endpoints."""

import pytest
from httpx import AsyncClient

from backend.main import get_catalog_service

pytestmark = pytest.mark.asyncio


class StubCatalogService:
    def __init__(self, snapshot=None, status=None):
        self._snapshot = snapshot
        self._status = status

    async def snapshot(self, at_raw, bbox_raw, limit_raw):
        if self._snapshot is None:
            raise AssertionError("snapshot not expected")
        return self._snapshot

    async def catalog_status(self):
        return self._status


EMPTY_SNAPSHOT = {
    "request_id": "req-empty",
    "generated_at": "2026-08-25T00:00:00+00:00",
    "data_status": "UNAVAILABLE",
    "data": {
        "at": "2026-08-25T00:00:00+00:00",
        "catalog": [],
        "coverage": {
            "objects_total": 0,
            "objects_with_solution": 0,
            "catalog_entries": 0,
            "positioned_markers": 0,
            "positioned_ok": 0,
            "positioned_stale": 0,
            "unavailable_entries": 0,
            "unavailable_by_status": {},
            "global_density": "INSUFFICIENT_DATA",
            "global_density_reason": "No objects ingested.",
            "sources": [],
        },
    },
    "provenance": {"model_id": "sgp4-vallado"},
    "warnings": ["The catalog is empty."],
}


async def override_with(snapshot=EMPTY_SNAPSHOT, status=None):
    async def _override():
        return StubCatalogService(snapshot=snapshot, status=status)

    return _override


async def test_catalog_snapshot_empty_state_is_explicit(client: AsyncClient):
    app = client._transport.app
    app.dependency_overrides[get_catalog_service] = await override_with()
    try:
        response = await client.get("/api/v1/catalog/snapshot")
        assert response.status_code == 200
        payload = response.json()
        assert payload["data_status"] == "UNAVAILABLE"
        assert payload["data"]["catalog"] == []
        assert payload["data"]["coverage"]["global_density"] == "INSUFFICIENT_DATA"
        assert payload["warnings"]
    finally:
        app.dependency_overrides.pop(get_catalog_service, None)


async def test_catalog_snapshot_rejects_invalid_bbox(client: AsyncClient):
    response = await client.get("/api/v1/catalog/snapshot", params={"bbox": "1,2,3"})
    assert response.status_code == 422
    payload = response.json()
    assert payload["status"] == "INVALID_WINDOW"


async def test_catalog_snapshot_rejects_invalid_at(client: AsyncClient):
    response = await client.get("/api/v1/catalog/snapshot", params={"at": "2026-08-25T00:00:00"})
    assert response.status_code == 422
    assert response.json()["status"] == "INVALID_WINDOW"


async def test_catalog_snapshot_rejects_out_of_range_limit(client: AsyncClient):
    response = await client.get("/api/v1/catalog/snapshot", params={"limit": 0})
    assert response.status_code == 422


async def test_catalog_snapshot_rejects_over_cap_limit(client: AsyncClient):
    response = await client.get("/api/v1/catalog/snapshot", params={"limit": 501})
    assert response.status_code == 422


async def test_catalog_status_contract(client: AsyncClient):
    status_payload = {
        "request_id": "req-status",
        "generated_at": "2026-08-25T00:00:00+00:00",
        "data_status": "UNAVAILABLE",
        "data": {
            "coverage": {
                "objects_total": 0,
                "objects_with_solution": 0,
                "catalog_entries": 0,
                "positioned_markers": 0,
                "positioned_ok": 0,
                "positioned_stale": 0,
                "unavailable_entries": 0,
                "unavailable_by_status": {},
                "global_density": "INSUFFICIENT_DATA",
                "global_density_reason": "No objects ingested.",
                "sources": [],
            }
        },
        "provenance": {"model_id": "sgp4-vallado"},
        "warnings": [],
    }
    app = client._transport.app
    app.dependency_overrides[get_catalog_service] = await override_with(status=status_payload)
    try:
        response = await client.get("/api/v1/catalog/status")
        assert response.status_code == 200
        payload = response.json()
        coverage = payload["data"]["coverage"]
        for key in (
            "objects_total",
            "objects_with_solution",
            "catalog_entries",
            "positioned_markers",
            "unavailable_entries",
            "unavailable_by_status",
            "global_density",
            "global_density_reason",
            "sources",
        ):
            assert key in coverage
    finally:
        app.dependency_overrides.pop(get_catalog_service, None)


async def test_frontend_shell_is_served(client: AsyncClient):
    """The explore UI shell is served by the same origin as the API."""
    response = await client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "aetherus" in response.text.lower()


async def test_catalog_payload_never_contains_risk_fields(client: AsyncClient):
    """P3 renders positions only; Pc/risk/TCA fields must not exist anywhere."""
    response = await client.get("/api/v1/catalog/snapshot")
    assert response.status_code == 200
    body = response.text.lower()
    assert '"pc"' not in body
    assert '"tca"' not in body
    assert '"miss_distance"' not in body
    assert '"risk"' not in body
