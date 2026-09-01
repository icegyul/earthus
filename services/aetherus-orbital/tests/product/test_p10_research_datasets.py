from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

from fastapi.testclient import TestClient

try:
    from aetherus_product.datasets import ResearchDatasetBuilder
except ModuleNotFoundError:
    ResearchDatasetBuilder = None  # type: ignore[assignment,misc]

from aetherus_product import AetherusProductRuntime

from services.api.main import create_app


def _runtime(db: Path, raw: Path) -> AetherusProductRuntime:
    return AetherusProductRuntime(
        db_path=str(db),
        raw_root=raw,
        fixture_root=Path(__file__).resolve().parents[2] / "fixtures" / "official",
    )


def test_research_dataset_exports_reproducible_json_csv_and_manifest(tmp_path: Path) -> None:
    assert ResearchDatasetBuilder is not None, "P10 research dataset builder is not implemented"
    db = tmp_path / "dataset.sqlite"
    runtime = _runtime(db, tmp_path / "raw-a")
    runtime.product_store.append_record(
        domain="ORBIT",
        record_type="OBSERVATION_PLAN",
        entity_key="VAL-A:STATION-1",
        payload={"object_id": "VAL-A", "windows": [{"max_elevation_deg": 72.5}]},
        observed_at=datetime(2026, 8, 31, tzinfo=UTC),
        evidence_class="DERIVED",
        validation_state="SCREENING_ONLY",
    )
    client = TestClient(create_app(product=runtime))
    try:
        response = client.post(
            "/v1/research/datasets",
            json={
                "dataset_key": "OBSERVATION-PLANS",
                "version": "2026-08-31",
                "domain": "ORBIT",
                "record_type": "OBSERVATION_PLAN",
                "license_policy": "CC-BY-4.0",
            },
        )
        assert response.status_code == 200, response.text
        manifest = response.json()["data"]["manifest"]
        assert manifest["record_count"] == 1
        json_response = client.get("/v1/research/datasets/OBSERVATION-PLANS?format=json")
        csv_response = client.get("/v1/research/datasets/OBSERVATION-PLANS?format=csv")
        manifest_response = client.get("/v1/research/datasets/OBSERVATION-PLANS?format=manifest")
        assert json_response.status_code == csv_response.status_code == manifest_response.status_code == 200
        assert json_response.headers["content-type"].startswith("application/json")
        assert csv_response.headers["content-type"].startswith("text/csv")
        assert hashlib.sha256(json_response.content).hexdigest() == manifest["files"]["json"]["sha256"]
        assert hashlib.sha256(csv_response.content).hexdigest() == manifest["files"]["csv"]["sha256"]
        assert json.loads(manifest_response.text)["dataset_hash"] == manifest["dataset_hash"]
    finally:
        client.close()
        runtime.repo.close()

    restarted = _runtime(db, tmp_path / "raw-b")
    restarted_client = TestClient(create_app(product=restarted))
    try:
        response = restarted_client.get("/v1/research/datasets/OBSERVATION-PLANS?format=manifest")
        assert response.status_code == 200
        assert json.loads(response.text)["record_count"] == 1
    finally:
        restarted_client.close()
        restarted.repo.close()


def test_research_dataset_rejects_missing_license_and_empty_source(tmp_path: Path) -> None:
    runtime = _runtime(tmp_path / "empty.sqlite", tmp_path / "raw")
    client = TestClient(create_app(product=runtime))
    try:
        missing_license = client.post(
            "/v1/research/datasets",
            json={"dataset_key": "X", "version": "1", "domain": "ORBIT", "record_type": "NONE", "license_policy": ""},
        )
        empty = client.post(
            "/v1/research/datasets",
            json={"dataset_key": "X", "version": "1", "domain": "ORBIT", "record_type": "NONE", "license_policy": "CC-BY-4.0"},
        )
        assert missing_license.status_code == 422
        assert empty.status_code == 422
    finally:
        client.close()
        runtime.repo.close()
