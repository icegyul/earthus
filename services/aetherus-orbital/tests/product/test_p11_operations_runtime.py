from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

try:
    from aetherus_product.operations import DurableJobService
except ModuleNotFoundError:
    DurableJobService = None  # type: ignore[assignment,misc]

from aetherus_product import AetherusProductRuntime

from services.api.main import create_app


def _runtime(db: Path, raw: Path) -> AetherusProductRuntime:
    return AetherusProductRuntime(
        db_path=str(db),
        raw_root=raw,
        fixture_root=Path(__file__).resolve().parents[2] / "fixtures" / "official",
    )


def _headers(tenant: str, user: str = "TESTER") -> dict[str, str]:
    return {"X-Aetherus-Tenant": tenant, "X-Aetherus-User": user, "X-Aetherus-Plan": "OPERATIONS"}


def test_private_state_and_audit_are_tenant_isolated_across_restart(tmp_path: Path) -> None:
    db = tmp_path / "operations.sqlite"
    runtime = _runtime(db, tmp_path / "raw-a")
    client = TestClient(create_app(product=runtime))
    try:
        saved = client.put("/v1/operations/private/fleet", headers=_headers("TENANT-A"), json={"value": {"object_ids": ["VAL-A"]}})
        assert saved.status_code == 200, saved.text
        own = client.get("/v1/operations/private/fleet", headers=_headers("TENANT-A"))
        other = client.get("/v1/operations/private/fleet", headers=_headers("TENANT-B"))
        assert own.json()["data"]["object_ids"] == ["VAL-A"]
        assert other.status_code == 404
        audit_a = client.get("/v1/operations/audit", headers=_headers("TENANT-A")).json()["data"]
        audit_b = client.get("/v1/operations/audit", headers=_headers("TENANT-B")).json()["data"]
        assert audit_a and all(row["tenant_id"] == "TENANT-A" for row in audit_a)
        assert audit_b == []
    finally:
        client.close()
        runtime.repo.close()

    restarted = _runtime(db, tmp_path / "raw-b")
    restarted_client = TestClient(create_app(product=restarted))
    try:
        own = restarted_client.get("/v1/operations/private/fleet", headers=_headers("TENANT-A"))
        assert own.status_code == 200
        assert own.json()["data"]["object_ids"] == ["VAL-A"]
    finally:
        restarted_client.close()
        restarted.repo.close()


def test_durable_jobs_are_idempotent_and_retry_real_handlers(tmp_path: Path) -> None:
    assert DurableJobService is not None, "P11 durable jobs are not implemented"
    runtime = _runtime(tmp_path / "jobs.sqlite", tmp_path / "raw")
    attempts = {"count": 0}

    def flaky(payload):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise RuntimeError("transient")
        return {"value": payload["value"] * 2}

    service = DurableJobService(runtime.product_store)
    service.register("DOUBLE", flaky)
    first = service.submit(operation="DOUBLE", payload={"value": 4}, idempotency_key="stable-key")
    completed = service.run(first["job_id"], max_attempts=3)
    duplicate = service.submit(operation="DOUBLE", payload={"value": 4}, idempotency_key="stable-key")
    try:
        assert completed["status"] == "SUCCEEDED"
        assert completed["attempts"] == 2
        assert completed["result"] == {"value": 8}
        assert duplicate["job_id"] == first["job_id"]
        assert duplicate["status"] == "SUCCEEDED"
    finally:
        runtime.repo.close()
