"""Internal P1 observability endpoints are token-gated and source-safe."""

import pytest
from httpx import AsyncClient
from pydantic import SecretStr

from backend.config import settings
from backend.main import app, get_repository


class InternalRepository:
    async def provider_health(self) -> list[dict[str, object]]:
        return [
            {
                "source_id": "celestrak_gp",
                "last_success_at": "2026-08-24T00:00:00+00:00",
                "parse_rejection_count": 0,
            }
        ]

    async def list_identity_conflicts(self) -> list[dict[str, object]]:
        return [{"id": "conflict-1", "conflict_type": "COSPAR_REUSED_DIFFERENT_CATALOG"}]

    async def list_ingestion_runs(self, limit: int) -> list[dict[str, object]]:
        assert limit == 2
        return [
            {
                "id": "run-1",
                "source_id": "celestrak_gp",
                "started_at": "2026-08-24T00:00:00+00:00",
                "finished_at": "2026-08-24T00:00:01+00:00",
                "status": "PARTIAL",
                "record_count": 1,
                "rejected_record_count": 1,
                "raw_artifact_hashes": ["sha256:" + "a" * 64],
                "cache_status": "MISS",
                "live_provider_proof": False,
                "error_status": None,
            }
        ]

    async def resolve_alias(self, source_id: str, source_key: str) -> dict[str, object] | None:
        if (source_id, source_key) == ("celestrak_gp", "25544"):
            return {"id": "object-1", "catalog_id": "25544", "identity_status": "CANONICAL"}
        return None


@pytest.mark.asyncio
async def test_internal_health_is_hidden_without_exact_token() -> None:
    original = settings.internal_admin_token
    settings.internal_admin_token = SecretStr("p1-internal-test-token")
    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get("/internal/providers/health")
    finally:
        settings.internal_admin_token = original

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_internal_routes_require_exact_token_and_expose_only_safe_metadata() -> None:
    original = settings.internal_admin_token
    token = "p1-internal-test-token"
    settings.internal_admin_token = SecretStr(token)
    app.dependency_overrides[get_repository] = lambda: InternalRepository()
    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            rejected = await client.get(
                "/internal/providers/health", headers={"X-Internal-Admin-Token": "wrong"}
            )
            denied_runs = await client.get("/internal/ingestion/runs")
            accepted = await client.get(
                "/internal/providers/health", headers={"X-Internal-Admin-Token": token}
            )
            conflicts = await client.get(
                "/internal/identity-conflicts", headers={"X-Internal-Admin-Token": token}
            )
            runs = await client.get(
                "/internal/ingestion/runs?limit=2", headers={"X-Internal-Admin-Token": token}
            )
    finally:
        app.dependency_overrides.clear()
        settings.internal_admin_token = original

    assert rejected.status_code == 404
    assert denied_runs.status_code == 404
    assert accepted.status_code == 200
    assert accepted.json()["providers"][0]["source_id"] == "celestrak_gp"
    assert conflicts.status_code == 200
    assert conflicts.json()["conflicts"][0]["id"] == "conflict-1"
    assert runs.status_code == 200
    assert runs.json()["runs"] == [
        {
            "id": "run-1",
            "source_id": "celestrak_gp",
            "started_at": "2026-08-24T00:00:00+00:00",
            "finished_at": "2026-08-24T00:00:01+00:00",
            "status": "PARTIAL",
            "record_count": 1,
            "rejected_record_count": 1,
            "raw_artifact_hashes": ["sha256:" + "a" * 64],
            "cache_status": "MISS",
            "live_provider_proof": False,
            "error_status": None,
        }
    ]


@pytest.mark.asyncio
async def test_alias_resolution_is_public_but_does_not_guess() -> None:
    app.dependency_overrides[get_repository] = lambda: InternalRepository()
    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            found = await client.get("/api/v1/objects/resolve?source_id=celestrak_gp&source_key=25544")
            absent = await client.get("/api/v1/objects/resolve?source_id=celestrak_gp&source_key=none")
    finally:
        app.dependency_overrides.clear()

    assert found.status_code == 200
    assert found.json()["catalog_id"] == "25544"
    assert absent.status_code == 404
    assert absent.json()["status"] == "UNKNOWN_OBJECT"
