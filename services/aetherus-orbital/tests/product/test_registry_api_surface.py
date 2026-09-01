from __future__ import annotations

import re
from pathlib import Path

import yaml
from fastapi.testclient import TestClient

from services.api.main import create_app

ROOT = Path(__file__).resolve().parents[2]


def _norm(path: str) -> str:
    path = path.replace(" optional", "")
    return re.sub(r"\{[^}]+\}", "{}", path)


def test_engine_registry_http_surface_is_fully_exposed():
    registry = yaml.safe_load((ROOT / "config" / "AETHERUS_V2_ENGINE_REGISTRY.yaml").read_text())
    expected = set()
    for section in ("engines", "llm_modules", "platform_services"):
        for item in registry[section]:
            for api in item.get("api", []) or []:
                if isinstance(api, str) and api.startswith("/"):
                    expected.add(_norm(api))
    actual = {_norm(path) for path in create_app().openapi()["paths"]}
    missing = sorted(expected - actual)
    assert len(expected) == 62
    assert missing == []


def test_e36_render_set_is_visual_only():
    app = create_app()
    client = TestClient(app)
    before = client.get("/v1/scene/ORBIT").json()["data"]
    res = client.get("/v1/orbit/render-set", params=[("view", "LEO"), ("important_ids", "VAL-B")])
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["semantic_lod_only"] is True
    assert data["scientific_hash"] == before["scientific_hash"]
    assert set(data["scientific_object_ids"]) == set(before["scientific_object_ids"])
    assert "VAL-B" in data["render_object_ids"]
