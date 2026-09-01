"""Health check and infrastructure tests."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient):
    """Test /health endpoint returns expected structure."""
    response = await client.get("/health")
    assert response.status_code in (200, 503)

    data = response.json()
    assert "status" in data
    assert "version" in data
    assert "timestamp" in data
    assert "phase" in data
    assert data["phase"] == "P5"
    assert "services" in data
    assert "scientific_features" in data


@pytest.mark.asyncio
async def test_api_status_endpoint(client: AsyncClient):
    """Test /api/v1/status endpoint."""
    response = await client.get("/api/v1/status")
    assert response.status_code == 200

    data = response.json()
    assert data["phase"] == "P5"
    assert "implemented_phases" in data
    assert "P0" in data["implemented_phases"]
    assert data["implemented_phases"]["P0"]["status"] == "PASSED"
    assert "P2" in data["implemented_phases"]
    assert data["implemented_phases"]["P2"]["status"] == "PASSED"


@pytest.mark.asyncio
async def test_root_endpoint(client: AsyncClient):
    """The root path serves the explore UI shell when the frontend is present."""
    response = await client.get("/")
    assert response.status_code == 200
    assert "aetherus" in response.text.lower()


@pytest.mark.asyncio
async def test_docs_available(client: AsyncClient):
    """Test OpenAPI docs are available."""
    response = await client.get("/api/docs")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_openapi_exposes_executable_celestrak_ingestion_contract(client: AsyncClient):
    """The generated API contract includes the real P0 ingestion route."""
    response = await client.get("/api/openapi.json")

    assert response.status_code == 200
    assert "/api/v1/ingestions/celestrak/omm/{catalog_id}" in response.json()["paths"]
    assert "/api/v1/ingestions/spacetrack/gp/{catalog_id}" in response.json()["paths"]
