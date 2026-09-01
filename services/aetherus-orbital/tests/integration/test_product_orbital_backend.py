from __future__ import annotations

from fastapi.testclient import TestClient

from services.api.main import create_app


class FakeP5OrbitalBackend:
    async def ephemeris(self, object_id: str, at: str | None) -> dict:
        return {
            "request_id": "p5-ephemeris",
            "generated_at": "2026-08-30T00:00:00+00:00",
            "data_status": "OK",
            "data": {"object_id": object_id, "catalog_id": "25544", "samples": []},
            "provenance": {
                "scientific_source": "P5_POSTGRES",
                "input_artifact_hashes": ["sha256:official"],
                "model_version": "sgp4-p2",
            },
            "warnings": ["PUBLIC_GP mean elements are not an operational ephemeris."],
        }

    async def conjunction_risk(self, conjunction_id: str, at: str | None) -> dict:
        return {
            "request_id": "p5-risk",
            "generated_at": "2026-08-30T00:00:00+00:00",
            "data_status": "SCREENING_ONLY",
            "data": {
                "id": conjunction_id,
                "pc": None,
                "pc_status": "NOT_COMPUTED",
                "covariance_status": "INSUFFICIENT_DATA",
            },
            "provenance": {"scientific_source": "P5_POSTGRES"},
            "warnings": ["COVARIANCE_MISSING_PUBLIC_GP"],
        }


def test_product_ephemeris_delegates_to_p5_without_fixture_fallback() -> None:
    with TestClient(create_app(orbital_backend=FakeP5OrbitalBackend())) as client:
        response = client.get(
            "/v1/objects/25544/ephemeris",
            params={"at": "2026-08-30T00:00:00+00:00"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["request_id"] == "p5-ephemeris"
    assert body["provenance"]["scientific_source"] == "P5_POSTGRES"
    assert body["provenance"]["input_artifact_hashes"] == ["sha256:official"]
    assert "fixture_class" not in body["data"]


def test_product_risk_preserves_p5_covariance_gate() -> None:
    with TestClient(create_app(orbital_backend=FakeP5OrbitalBackend())) as client:
        response = client.get("/v1/conjunctions/P5-EVENT/risk")

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["pc"] is None
    assert body["data"]["pc_status"] == "NOT_COMPUTED"
    assert body["data"]["covariance_status"] == "INSUFFICIENT_DATA"
    assert body["provenance"]["scientific_source"] == "P5_POSTGRES"
