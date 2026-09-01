from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

try:
    from aetherus_orbit.debris import FragmentCloudPropagationEngine
except ModuleNotFoundError:
    FragmentCloudPropagationEngine = None  # type: ignore[assignment,misc]

from aetherus_product import AetherusProductRuntime

from services.api.main import create_app

PARENT_STATE = {
    "object_id": "VAL-A",
    "position_km": [7000.0, 0.0, 0.0],
    "velocity_km_s": [0.0, 7.5, 0.0],
}


def _runtime(db: Path, raw: Path) -> AetherusProductRuntime:
    return AetherusProductRuntime(
        db_path=str(db),
        raw_root=raw,
        fixture_root=Path(__file__).resolve().parents[2] / "fixtures" / "official",
    )


def test_genealogy_write_survives_runtime_restart(tmp_path: Path) -> None:
    db = tmp_path / "genealogy.sqlite"
    runtime = _runtime(db, tmp_path / "raw-a")
    client = TestClient(create_app(product=runtime))
    try:
        response = client.post(
            "/v1/genealogy/DEBRIS-1",
            json={
                "parent_id": "PARENT-1",
                "origin": "FRAGMENTATION_EVENT",
                "event_time_utc": "2026-08-31T00:00:00Z",
                "evidence_id": "EVIDENCE-1",
                "known": True,
            },
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["parent_id"] == "PARENT-1"
    finally:
        client.close()
        runtime.repo.close()

    restarted = _runtime(db, tmp_path / "raw-b")
    restarted_client = TestClient(create_app(product=restarted))
    try:
        response = restarted_client.get("/v1/genealogy/DEBRIS-1")
        assert response.status_code == 200
        assert response.json()["data_status"] == "OK"
        assert response.json()["data"][0]["evidence_id"] == "EVIDENCE-1"
    finally:
        restarted_client.close()
        restarted.repo.close()


def test_fragmentation_propagates_every_fragment_and_is_reproducible(tmp_path: Path) -> None:
    assert FragmentCloudPropagationEngine is not None, "P8 fragment propagation is not implemented"
    runtime = _runtime(tmp_path / "fragment.sqlite", tmp_path / "raw")
    client = TestClient(create_app(product=runtime))
    payload = {
        "kind": "FRAGMENTATION",
        "target_object_ids": ["VAL-A"],
        "parameters": {"delta_v_scale_m_s": 12.0},
        "assumptions": ["VALIDATION_FRAGMENTATION_CASE"],
        "seed": 23,
        "fragment_count": 12,
        "parent_state": PARENT_STATE,
        "encounter_states": [],
        "horizon_s": 900.0,
        "step_s": 30.0,
        "affected_distance_km": 5.0,
    }
    try:
        first = client.post("/v1/scenarios/fragmentation", json=payload)
        second = client.post("/v1/scenarios/fragmentation", json=payload)
        assert first.status_code == 200, first.text
        assert second.status_code == 200, second.text
        body = first.json()
        assert body["data_status"] == "RESEARCH_ONLY"
        assert body["data"]["observed_debris"] is False
        assert body["data"]["spacecraft_command"] is None
        assert len(body["data"]["fragments"]) == 12
        assert sum(body["data"]["shell_counts"].values()) == 12
        assert len({tuple(item["final_position_km"]) for item in body["data"]["fragments"]}) == 12
        assert second.json()["data"]["result_hash"] == body["data"]["result_hash"]
        rows = runtime.product_store.list_records(domain="ORBIT", record_type="FRAGMENTATION_RUN")
        assert rows and rows[0]["payload"]["result_hash"] == body["data"]["result_hash"]
    finally:
        client.close()
        runtime.repo.close()
