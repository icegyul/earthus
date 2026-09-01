from __future__ import annotations

from fastapi.testclient import TestClient


def test_integrated_app_preserves_product_and_p5_routes() -> None:
    from services.api.integrated import app

    with TestClient(app) as client:
        product_health = client.get("/v1/health")
        product_openapi = client.get("/openapi.json")
        p5_status = client.get("/api/v1/status")
        p5_openapi = client.get("/api/openapi.json")
        premium_shell = client.get("/app/")
        p5_shell = client.get("/ui/")

    assert product_health.status_code == 200
    assert product_openapi.status_code == 200
    assert "/v1/product/summary" in product_openapi.json()["paths"]
    assert p5_status.status_code == 200
    assert p5_openapi.status_code == 200
    assert "/api/v1/conjunctions" in p5_openapi.json()["paths"]
    assert premium_shell.status_code == 200
    assert "AETHERUS" in premium_shell.text.upper()
    assert p5_shell.status_code == 200
    assert "AETHERUS" in p5_shell.text.upper()
