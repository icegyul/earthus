"""HTTP contract tests for P0's executable CelesTrak ingestion endpoint."""

import json
from datetime import datetime
from pathlib import Path

import pytest
from httpx import AsyncClient

from backend.ingestion.errors import IdentityConflictError, ProviderUnavailableError
from backend.ingestion.models import FetchedOmmDocument
from backend.main import app, get_ingestion_service

FIXTURE_DIR = Path(__file__).parents[1] / "fixtures" / "celestrak"


class SuccessfulService:
    """Endpoint test double; normalization/persistence have their own real-path tests."""

    async def ingest_catalog_id(self, catalog_id: str) -> dict[str, object]:
        provenance = json.loads((FIXTURE_DIR / "iss-25544-2026-08-23.provenance.json").read_text())
        document = FetchedOmmDocument(
            source_id=provenance["source_id"],
            source_uri=provenance["source_uri"],
            retrieved_at=datetime.fromisoformat(provenance["retrieved_at"]),
            content=(FIXTURE_DIR / "iss-25544-2026-08-23.json").read_bytes(),
            media_type=provenance["media_type"],
        )
        assert catalog_id == "25544"
        return {
            "status": "SUCCEEDED",
            "ingestion_run_id": "run-1",
            "record_count": 1,
            "object": {"catalog_id": "25544"},
            "provenance": {"source_ids": [document.source_id]},
        }


@pytest.mark.asyncio
async def test_post_ingestion_endpoint_returns_provenance_payload() -> None:
    """The endpoint reports a persisted result shape, not a placeholder acknowledgement."""
    app.dependency_overrides[get_ingestion_service] = lambda: SuccessfulService()
    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post("/api/v1/ingestions/celestrak/omm/25544")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "SUCCEEDED"
    assert payload["record_count"] == 1
    assert payload["provenance"]["source_ids"] == ["celestrak_gp"]


@pytest.mark.asyncio
async def test_post_ingestion_endpoint_returns_explicit_provider_outage_state() -> None:
    """A 503 response must make provider unavailability explicit to API consumers."""

    class UnavailableService:
        async def ingest_catalog_id(self, catalog_id: str) -> dict[str, object]:
            raise ProviderUnavailableError("CelesTrak unavailable")

    app.dependency_overrides[get_ingestion_service] = lambda: UnavailableService()
    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post("/api/v1/ingestions/celestrak/omm/25544")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json()["status"] == "UNAVAILABLE"


@pytest.mark.asyncio
async def test_spacetrack_unconfigured_returns_503_without_provider_result() -> None:
    class UnconfiguredSpaceTrackService:
        async def ingest(self, source_id: str, catalog_id: str) -> dict[str, object]:
            assert (source_id, catalog_id) == ("spacetrack_gp", "25544")
            raise ProviderUnavailableError(
                "AUTH_REQUIRED_NOT_CONFIGURED", {"reason": "AUTH_REQUIRED_NOT_CONFIGURED"}
            )

    app.dependency_overrides[get_ingestion_service] = lambda: UnconfiguredSpaceTrackService()
    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post("/api/v1/ingestions/spacetrack/gp/25544")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json()["status"] == "UNAVAILABLE"
    assert response.json()["details"]["reason"] == "AUTH_REQUIRED_NOT_CONFIGURED"


@pytest.mark.asyncio
async def test_identity_conflict_returns_409_with_conflict_id() -> None:
    class ConflictService:
        async def ingest(self, source_id: str, catalog_id: str) -> dict[str, object]:
            assert (source_id, catalog_id) == ("spacetrack_gp", "100101")
            raise IdentityConflictError("conflict-1")

    app.dependency_overrides[get_ingestion_service] = lambda: ConflictService()
    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post("/api/v1/ingestions/spacetrack/gp/100101")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 409
    assert response.json()["status"] == "IDENTITY_CONFLICT"
    assert response.json()["details"]["conflict_id"] == "conflict-1"


@pytest.mark.asyncio
async def test_get_object_returns_explicit_insufficient_data_with_a_404() -> None:
    """An absent canonical object is a documented unavailable datum, not an empty success."""

    class EmptyService:
        async def get_object(self, object_id: str) -> None:
            assert object_id == "absent"
            return None

    app.dependency_overrides[get_ingestion_service] = lambda: EmptyService()
    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get("/api/v1/objects/absent")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json()["status"] == "UNKNOWN_OBJECT"
