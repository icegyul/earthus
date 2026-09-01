from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

try:
    from backend.phase_status import build_phase_manifest
    from services.api.security import issue_staging_token
except ModuleNotFoundError:
    build_phase_manifest = None  # type: ignore[assignment,misc]
    issue_staging_token = None  # type: ignore[assignment,misc]

from aetherus_product import AetherusProductRuntime

from services.api.main import create_app


def _runtime(tmp_path: Path) -> AetherusProductRuntime:
    return AetherusProductRuntime(
        db_path=str(tmp_path / "p12.sqlite"),
        raw_root=tmp_path / "raw",
        fixture_root=Path(__file__).resolve().parents[2] / "fixtures" / "official",
    )


def test_staging_mutations_fail_closed_without_auth_adapter(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("AETHERUS_ENV", "staging")
    monkeypatch.delenv("AETHERUS_AUTH_MODE", raising=False)
    monkeypatch.delenv("AETHERUS_AUTH_HMAC_SECRET", raising=False)
    product = _runtime(tmp_path)
    client = TestClient(create_app(product=product))
    try:
        response = client.put(
            "/v1/operations/private/fleet",
            headers={"X-Aetherus-Tenant": "SPOOF", "X-Aetherus-User": "SPOOF", "X-Aetherus-Plan": "OPERATIONS"},
            json={"value": {"object_ids": []}},
        )
        assert response.status_code == 503
        assert response.json()["detail"] == "BLOCKED_AUTH_PROVIDER"
    finally:
        client.close()
        product.repo.close()


def test_staging_hmac_auth_overrides_spoofed_identity(monkeypatch, tmp_path: Path) -> None:
    assert issue_staging_token is not None, "P12 staging auth is not implemented"
    secret = "aetherus-staging-test-secret-32-bytes-minimum"
    monkeypatch.setenv("AETHERUS_ENV", "staging")
    monkeypatch.setenv("AETHERUS_AUTH_MODE", "hmac-staging")
    monkeypatch.setenv("AETHERUS_AUTH_HMAC_SECRET", secret)
    monkeypatch.setenv("AETHERUS_TRUSTED_AUTH_ADAPTER", "1")
    token = issue_staging_token(secret=secret, tenant_id="TENANT-A", user_id="DEVICE-TESTER", plan="OPERATIONS", ttl_seconds=600)
    product = _runtime(tmp_path)
    client = TestClient(create_app(product=product))
    try:
        denied = client.put("/v1/operations/private/fleet", json={"value": {"object_ids": []}})
        accepted = client.put(
            "/v1/operations/private/fleet",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Aetherus-Tenant": "SPOOFED-TENANT",
                "X-Aetherus-User": "SPOOFED-USER",
                "X-Aetherus-Plan": "FREE",
            },
            json={"value": {"object_ids": ["VAL-A"]}},
        )
        assert denied.status_code == 401
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["provenance"]["tenant_id"] == "TENANT-A"
        assert product.get_private_state(tenant_id="TENANT-A", key="fleet") == {"object_ids": ["VAL-A"]}
        assert product.get_private_state(tenant_id="SPOOFED-TENANT", key="fleet") is None
    finally:
        client.close()
        product.repo.close()


def test_production_rejects_staging_hmac_adapter(monkeypatch, tmp_path: Path) -> None:
    assert issue_staging_token is not None, "P12 staging auth is not implemented"
    secret = "aetherus-staging-test-secret-32-bytes-minimum"
    monkeypatch.setenv("AETHERUS_ENV", "production")
    monkeypatch.setenv("AETHERUS_AUTH_MODE", "hmac-staging")
    monkeypatch.setenv("AETHERUS_AUTH_HMAC_SECRET", secret)
    monkeypatch.setenv("AETHERUS_TRUSTED_AUTH_ADAPTER", "1")
    token = issue_staging_token(secret=secret, tenant_id="TENANT-A", user_id="TESTER", plan="OPERATIONS", ttl_seconds=600)
    product = _runtime(tmp_path)
    client = TestClient(create_app(product=product))
    try:
        response = client.put(
            "/v1/operations/private/fleet",
            headers={"Authorization": f"Bearer {token}"},
            json={"value": {}},
        )
        assert response.status_code == 503
        assert response.json()["detail"] == "BLOCKED_PRODUCTION_IDP"
    finally:
        client.close()
        product.repo.close()


@pytest.mark.asyncio
async def test_p6_p12_status_requires_hash_verified_executable_evidence(monkeypatch, tmp_path: Path) -> None:
    assert build_phase_manifest is not None, "P12 phase evidence is not implemented"
    phases = {
        phase: {
            "status": "PASSED",
            "tests": [f"tests/{phase.lower()}"],
            "runtime_evidence": [f"artifact-{phase.lower()}"],
            "gates": ["INPUT_COMPUTE_DB_API_UI_TEST_EVIDENCE"],
        }
        for phase in ("P6", "P7", "P8", "P9", "P10", "P11", "P12")
    }
    manifest = build_phase_manifest(phases=phases, source_commit="test-commit")
    path = tmp_path / "phase-status.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")
    monkeypatch.setenv("AETHERUS_PHASE_EVIDENCE_PATH", str(path))

    from backend.main import api_status

    status = await api_status()
    assert status["phase"] == "P12"
    assert all(status["implemented_phases"][phase]["status"] == "PASSED" for phase in phases)
    assert status["phase_evidence"]["manifest_hash"] == manifest["manifest_hash"]


def test_staging_readiness_uses_staging_secret_without_claiming_production_secrets(monkeypatch, tmp_path: Path) -> None:
    secret = "aetherus-staging-test-secret-32-bytes-minimum"
    monkeypatch.setenv("AETHERUS_ENV", "staging")
    monkeypatch.setenv("AETHERUS_AUTH_MODE", "hmac-staging")
    monkeypatch.setenv("AETHERUS_AUTH_HMAC_SECRET", secret)
    monkeypatch.setenv("AETHERUS_TESTS_PASS", "1")
    monkeypatch.setenv("AETHERUS_BACKUP_VERIFIED", "1")
    monkeypatch.setenv("AETHERUS_LIVE_PROVIDER_VERIFIED", "1")
    monkeypatch.setenv("AETHERUS_PRODUCTION_SECRETS_CONFIGURED", "0")
    product = _runtime(tmp_path)
    client = TestClient(create_app(product=product))
    try:
        response = client.get("/v1/platform/readiness")
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["staging_ready"] is True
        assert data["production_ready"] is False
        assert data["secret_scope"] == "STAGING_HMAC"
        assert "BLOCKED_PRODUCTION_SECRETS" in data["production_blockers"]
    finally:
        client.close()
        product.repo.close()
