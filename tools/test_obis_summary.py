#!/usr/bin/env python3
"""OBIS 5도 셀 계산과 API 응답 가공의 네트워크 없는 단위 테스트."""

from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("obis_handler", ROOT / "aws/obis-summary/handler.py")
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


def fake_fetch(path, params):
    assert params["geometry"] == "POLYGON((140 10,145 10,145 15,140 15,140 10))"
    if path == "statistics":
        return {"records": 12, "species": 3, "taxa": 4, "datasets": 2,
                "specieslevel": 9, "yearrange": [2001, 2020]}
    return {"results": {"scientificName": [
        {"key": "Species alpha", "records": 7},
        {"key": "Species beta", "records": 3},
    ]}}


def main():
    key, bounds = module.cell_bounds(11.369, 142.587)
    assert key == "n10_e140", (key, bounds)
    assert bounds == {"south": 10, "west": 140, "north": 15, "east": 145}
    key2, bounds2 = module.cell_bounds(-31.935, -177.317)
    assert key2 == "s35_w180", (key2, bounds2)
    cell = module.build_cell(bounds, [{"id": "x", "name": {"ko": "가", "en": "A"}}], fake_fetch)
    assert cell["records"] == 12 and cell["species"] == 3 and cell["datasets"] == 2
    assert cell["topTaxa"][0] == {"scientificName": "Species alpha", "records": 7}
    print("PASS: OBIS cell bounds and derived summary schema")


if __name__ == "__main__":
    main()
