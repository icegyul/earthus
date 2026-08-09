#!/usr/bin/env python3
"""가벼운 달·행성 매니페스트의 필수 출처·좌표·표시 한계를 검증한다."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "prototype/data/celestial-bodies.json"
EXPECTED = {"mercury", "venus", "moon", "mars", "jupiter", "saturn", "uranus", "neptune"}


def main() -> None:
    document = json.loads(PATH.read_text(encoding="utf-8"))
    assert document.get("positionNotice", {}).get("ko"), "표현 한계 문구 누락"
    bodies = document.get("bodies")
    assert isinstance(bodies, list), "bodies 배열 누락"
    ids = [body.get("id") for body in bodies]
    assert len(ids) == len(set(ids)), "천체 id 중복"
    assert set(ids) == EXPECTED, f"천체 목록 불일치: {set(ids) ^ EXPECTED}"

    for body in bodies:
        assert body.get("name", {}).get("ko") and body.get("name", {}).get("en"), f"{body['id']} 이름 누락"
        assert float(body.get("radiusKm", 0)) > 0, f"{body['id']} 반지름 오류"
        assert str(body.get("sourceUrl", "")).startswith("https://"), f"{body['id']} 출처 URL 누락"
        assert body.get("summary", {}).get("ko"), f"{body['id']} 설명 누락"
        for feature in body.get("features", []):
            assert -90 <= float(feature["lat"]) <= 90, f"{body['id']} 위도 오류"
            assert -180 <= float(feature["lon"]) <= 180, f"{body['id']} 경도 오류"

    moon = next(body for body in bodies if body["id"] == "moon")
    apollo = next(item for item in moon["features"] if item["name"]["en"] == "Apollo 11 landing site")
    assert abs(apollo["lat"] - 0.67409) < 1e-8 and abs(apollo["lon"] - 23.47298) < 1e-8
    assert {item["name"]["en"] for item in moon["orbiters"]} == {"LRO", "Danuri"}
    assert all(item["sourceUrl"].startswith("https://") for item in moon["orbiters"])
    print("PASS: 8 celestial bodies; sources, coordinates, Apollo 11 and lunar orbiter disclaimers present")


if __name__ == "__main__":
    main()
