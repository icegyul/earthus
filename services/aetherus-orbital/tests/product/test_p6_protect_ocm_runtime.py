from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

try:
    from aetherus_orbit.intervention import CandidateOCMEvaluationEngine
except ModuleNotFoundError:
    CandidateOCMEvaluationEngine = None  # type: ignore[assignment,misc]

from aetherus_product import AetherusProductRuntime

from services.api.main import create_app

PRIMARY = {
    "object_id": "PROTECTED",
    "position_km": [7000.0, 0.0, 0.0],
    "velocity_km_s": [0.0, 7.5, 0.0],
}
ENCOUNTERS = [
    {
        "object_id": "THREAT-AHEAD",
        "position_km": [7000.0, 20.0, 0.0],
        "velocity_km_s": [0.0, 7.46, 0.0],
    },
    {
        "object_id": "OBJECT-BEHIND",
        "position_km": [7000.0, -20.0, 0.0],
        "velocity_km_s": [0.0, 7.5, 0.0],
    },
]
CANDIDATES = [
    {"candidate_id": "RADIAL-SAFE", "delta_v_m_s": [20.0, 0.0, 0.0]},
    {"candidate_id": "RETROGRADE-TRADEOFF", "delta_v_m_s": [0.0, -40.0, 0.0]},
]


def test_candidate_ocm_repropagates_and_surfaces_new_risk_without_commands() -> None:
    assert CandidateOCMEvaluationEngine is not None, "P6 candidate OCM evaluator is not implemented"
    engine = CandidateOCMEvaluationEngine()
    result = engine.evaluate(
        protected_object_id="PROTECTED",
        primary_state=PRIMARY,
        encounter_states=ENCOUNTERS,
        candidates=CANDIDATES,
        horizon_s=600.0,
        step_s=10.0,
        risk_threshold_km=5.0,
    )

    assert result.validation_state == "RESEARCH_ONLY"
    assert result.advisory_only is True
    assert result.spacecraft_command is None
    assert result.provenance["method"] == "TWO_BODY_IMPULSE_RK4"
    assert result.provenance["pc_computed"] is False
    assert len(result.candidates) == 2
    by_id = {item.candidate_id: item for item in result.candidates}
    assert by_id["RADIAL-SAFE"].protected_risk_after < by_id["RADIAL-SAFE"].protected_risk_before
    assert by_id["RADIAL-SAFE"].new_risk_object_ids == ()
    assert "OBJECT-BEHIND" in by_id["RETROGRADE-TRADEOFF"].new_risk_object_ids
    assert result.candidates[0].score > result.candidates[1].score

    repeated = engine.evaluate(
        protected_object_id="PROTECTED",
        primary_state=PRIMARY,
        encounter_states=ENCOUNTERS,
        candidates=CANDIDATES,
        horizon_s=600.0,
        step_s=10.0,
        risk_threshold_km=5.0,
    )
    assert repeated.result_hash == result.result_hash


def test_p6_api_executes_persists_and_reads_candidate_evaluation(tmp_path: Path) -> None:
    product = AetherusProductRuntime(
        db_path=str(tmp_path / "product.sqlite"),
        raw_root=tmp_path / "raw",
        fixture_root=Path(__file__).resolve().parents[2] / "fixtures" / "official",
    )
    client = TestClient(create_app(product=product))
    payload = {
        "protected_active": True,
        "primary_state": PRIMARY,
        "encounter_states": ENCOUNTERS,
        "candidates": CANDIDATES,
        "horizon_s": 600.0,
        "step_s": 10.0,
        "risk_threshold_km": 5.0,
    }
    try:
        response = client.post("/v1/protect/PROTECTED/candidates", json=payload)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["data_status"] == "RESEARCH_ONLY"
        assert body["data"]["advisory_only"] is True
        assert body["data"]["spacecraft_command"] is None
        result_hash = body["data"]["result_hash"]
        records = product.product_store.list_records(domain="ORBIT", record_type="PROTECT_RANKING")
        assert records and records[0]["payload"]["result_hash"] == result_hash
    finally:
        client.close()
        product.repo.close()
