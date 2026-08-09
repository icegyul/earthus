#!/usr/bin/env python3
"""공통 3D 태양계에 쓰는 우주선 위치 자료의 출처·시각·한계를 검증한다."""

import json
import math
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "prototype/data/cosmic-spacecraft.json"
EXPECTED = {"hubble", "jwst", "voyager-1", "voyager-2"}


def main() -> None:
    document = json.loads(PATH.read_text(encoding="utf-8"))
    assert document.get("positionNotice", {}).get("ko"), "위치 표현 한계 문구 누락"
    items = document.get("items")
    assert isinstance(items, list), "items 배열 누락"
    assert {item.get("id") for item in items} == EXPECTED, "우주선 목록 불일치"

    for item in items:
        item_id = item["id"]
        assert item.get("name", {}).get("ko") and item.get("name", {}).get("en"), f"{item_id} 이름 누락"
        assert item.get("method", {}).get("ko") and item.get("method", {}).get("en"), f"{item_id} 방법 누락"
        assert item.get("credit"), f"{item_id} 크레딧 누락"
        assert str(item.get("sourceUrl", "")).startswith("https://"), f"{item_id} 출처 URL 누락"
        if item["type"] == "heliocentric-vector":
            datetime.fromisoformat(item["epoch"].replace("Z", "+00:00"))
            for field in ("pos", "vel"):
                vector = item.get(field)
                assert isinstance(vector, list) and len(vector) == 3, f"{item_id} {field} 차원 오류"
                assert all(math.isfinite(float(value)) for value in vector), f"{item_id} {field} 값 오류"
        else:
            assert item.get("distance", {}).get("ko"), f"{item_id} 거리 설명 누락"
            assert item.get("referenceDate"), f"{item_id} 자료 기준일 누락"

    print("PASS: Hubble/JWST schematic limits and Voyager 1/2 JPL epoch vectors are documented")


if __name__ == "__main__":
    main()
