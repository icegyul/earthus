#!/usr/bin/env python3
"""해구가 점이 아닌 출처·한계가 있는 6,000m 연결 영역으로 배포되는지 검증한다."""

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
FOOTPRINTS = ROOT / "prototype/data/trench-footprints.json"
TRENCHES = ROOT / "prototype/data/trenches.json"


def main() -> None:
    document = json.loads(FOOTPRINTS.read_text(encoding="utf-8"))
    catalog = json.loads(TRENCHES.read_text(encoding="utf-8"))
    assert document.get("schema") == "earthus.trench-footprints.v1", "스키마 불일치"
    assert document.get("thresholdDepthM") == 6000, "NOAA 하달대 경계 6,000m 불일치"
    assert document.get("source", {}).get("doi"), "GEBCO DOI 누락"
    assert document.get("grid", {}).get("sha256"), "원본 격자 해시 누락"
    assert document.get("classificationSource", {}).get("url", "").startswith("https://"), "하달대 기준 출처 누락"
    assert document.get("limitations", {}).get("ko") and document.get("limitations", {}).get("en"), "공식 경계 아님 문구 누락"
    basemap = ROOT / "prototype" / document.get("basemap", {}).get("path", "")
    assert basemap.is_file() and basemap.stat().st_size < 150_000, "경량 수심 지구 이미지 누락 또는 과대"
    with Image.open(basemap) as image:
        assert list(image.size) == document["basemap"]["size"] == [2048, 1024], "수심 지구 이미지 크기 불일치"

    features = document.get("features")
    assert isinstance(features, list) and len(features) == 7, "연결 영역 수 불일치"
    covered = set()
    for feature in features:
        ring = feature.get("ring")
        assert isinstance(ring, list) and len(ring) >= 4 and ring[0] == ring[-1], f"{feature['id']} 닫힌 윤곽 누락"
        assert feature.get("areaKm2", 0) > 0 and feature.get("cellCount", 0) > 0, f"{feature['id']} 면적 누락"
        assert feature.get("thresholdDepthM") == 6000, f"{feature['id']} 깊이 기준 불일치"
        for lon, lat in ring:
            assert -180 <= lon <= 180 and -90 <= lat <= 90, f"{feature['id']} 좌표 범위 오류"
        for item_id in feature.get("deepIds", []):
            assert item_id not in covered, f"{item_id} 중복 영역"
            covered.add(item_id)

    expected = {item["id"] for item in catalog["items"] if item["depthMax"] >= 6000}
    assert covered == expected, f"6,000m 이상 카탈로그 최심점 누락: {covered ^ expected}"
    print(f"PASS: 7 GEBCO hadal footprints; {sum(feature['areaKm2'] for feature in features):,} km²; 9 deep points covered")


if __name__ == "__main__":
    main()
