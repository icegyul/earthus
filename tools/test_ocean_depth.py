#!/usr/bin/env python3
"""ocean-depth Lambda의 보간·경계·출처 응답을 네트워크 없이 검증한다."""

import importlib.util
import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HANDLER = ROOT / "aws/ocean-depth/handler.py"


def load_module():
    spec = importlib.util.spec_from_file_location("earthus_ocean_depth", HANDLER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    build_spec = importlib.util.spec_from_file_location(
        "earthus_build_depth", ROOT / "tools/build_depth_grid.py")
    build = importlib.util.module_from_spec(build_spec)
    build_spec.loader.exec_module(build)
    reduced = build.minimum_bins(build.np.array([
        [-10, -20, -30, -40],
        [-1_000, -15, -35, -45],
    ], dtype=build.np.int16), cells=2)
    assert reduced.tolist() == [-1_000, -45], "평균이 아니라 셀 최솟값을 보존해야 함"

    module = load_module()
    # 남서→북동: -100, -200 / -300, -400m. 네 셀 중심의 가운데는 -250m다.
    module._grid_bytes = struct.pack("<hhhh", -100, -200, -300, -400)
    module._manifest = {
        "generatedAt": "2026-08-09T00:00:00+00:00",
        "source": {
            "title": "The GEBCO_2026 Grid",
            "credit": "GEBCO Bathymetric Compilation Group 2026",
            "doi": "10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa",
            "url": "https://www.gebco.net/",
            "created": "2026-04-17",
        },
        "output": {
            "shape": [2, 2], "resolutionDegrees": 0.1, "bytes": 8,
            "sha256": "synthetic",
        },
        "limitations": ["Not for navigation or safety at sea."],
    }
    module._trenches = [{
        "id": "test-trench", "name": {"ko": "시험 해구", "en": "Test Trench"},
        "lat": -89.9, "lon": -179.9, "depthMin": 9000, "depthMax": 9100,
        "source": "test", "credit": "test",
    }]

    exact = json.loads(module.handler({
        "queryStringParameters": {"lat": "-89.95", "lon": "-179.95"}
    }, None)["body"])
    assert exact["elevationM"] == -100 and exact["depthM"] == 100

    middle_response = module.handler({
        "queryStringParameters": {"lat": "-89.9", "lon": "-179.9"}
    }, None)
    middle = json.loads(middle_response["body"])
    assert middle_response["statusCode"] == 200
    assert middle["elevationM"] == -250 and middle["depthM"] == 250
    assert middle["nearbyTrench"]["id"] == "test-trench"
    assert middle["source"]["doi"].startswith("10.5285/")
    assert middle["sample"]["sourceGridCellsPerCoarseCell"] == 576
    assert "항해" in middle["safety"]

    invalid = module.handler({"queryStringParameters": {"lat": "91", "lon": "0"}}, None)
    assert invalid["statusCode"] == 400
    print("PASS: ocean-depth interpolation, provenance, safety, and validation")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
