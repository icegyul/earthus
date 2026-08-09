#!/usr/bin/env python3
"""3D 하늘에 쓰는 우주망원경 사진 카탈로그와 로컬 썸네일을 검증한다."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "prototype/data/space-photos.json"
EXPECTED = {"HST": 1, "JWST": 49}


def main() -> None:
    document = json.loads(CATALOG.read_text(encoding="utf-8"))
    items = document.get("items")
    assert isinstance(items, list), "items 배열 누락"
    assert len(items) == sum(EXPECTED.values()), "검증된 사진 수 불일치"

    ids = [item.get("id") for item in items]
    assert all(ids) and len(ids) == len(set(ids)), "사진 id 누락 또는 중복"

    counts = {telescope: 0 for telescope in EXPECTED}
    for item in items:
        telescope = item.get("telescope")
        assert telescope in counts, f"지원하지 않는 망원경: {telescope}"
        counts[telescope] += 1
        assert item.get("name", {}).get("ko") and item.get("name", {}).get("en"), f"{item['id']} 이름 누락"
        assert 0 <= float(item.get("ra", -1)) < 360, f"{item['id']} 적경 오류"
        assert -90 <= float(item.get("dec", -91)) <= 90, f"{item['id']} 적위 오류"
        assert item.get("dateKind") == "release", f"{item['id']} 날짜 의미가 공개일이 아님"
        assert item.get("date"), f"{item['id']} 공개일 누락"
        assert item.get("credit") and item.get("license"), f"{item['id']} 크레딧·라이선스 누락"
        assert str(item.get("full", "")).startswith("https://"), f"{item['id']} 공식 원본 URL 누락"

        thumbnail = ROOT / "prototype" / str(item.get("thumb", ""))
        assert thumbnail.is_file() and thumbnail.stat().st_size > 0, f"{item['id']} 썸네일 누락"

    assert counts == EXPECTED, f"망원경별 사진 수 불일치: {counts}"
    print("PASS: HST 1 + JWST 49; coordinates, release dates, credits, sources and thumbnails present")


if __name__ == "__main__":
    main()
