#!/usr/bin/env python3
"""Validate hand-curated earthus space/ocean catalogues before commit."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CATALOGS = {
    "space-photos": ROOT / "prototype/data/space-photos.json",
    "sea-life": ROOT / "prototype/data/sea-life.json",
    "trenches": ROOT / "prototype/data/trenches.json",
    "ocean-comparisons": ROOT / "prototype/data/ocean-comparisons.json",
    "sat-aliases": ROOT / "prototype/data/sat-aliases.json",
    "obis-cells": ROOT / "prototype/data/obis-cells.json",
    "probes": ROOT / "prototype/data/probes.json",
}
PLACEHOLDERS = {"todo", "tbd", "unknown", "모름", "미정", "-"}
SAT_GROUPS = {"stations", "weather", "science", "nav", "comm", "earth",
              "military", "amateur", "starlink", "all"}
SEA_LIFE_GROUPS = {"whale", "fish", "cephalopod", "deep", "glow", "crustacean", "jelly"}


def text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def localized(value: Any) -> bool:
    return isinstance(value, dict) and text(value.get("ko")) and text(value.get("en"))


def credit(value: Any) -> bool:
    return text(value) and value.strip().lower() not in PLACEHOLDERS


def require(condition: bool, path: str, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(f"{path}: {message}")


def validate_space(item: dict[str, Any], path: str, errors: list[str]) -> None:
    require(localized(item.get("name")), f"{path}.name", "ko/en 이름이 모두 필요", errors)
    require(credit(item.get("credit")), f"{path}.credit", "실제 크레딧이 필요", errors)
    require(number(item.get("ra")) and 0 <= item["ra"] <= 360,
            f"{path}.ra", "0~360 범위의 숫자 필요", errors)
    require(number(item.get("dec")) and -90 <= item["dec"] <= 90,
            f"{path}.dec", "-90~90 범위의 숫자 필요", errors)
    require(item.get("telescope") in {"HST", "JWST"},
            f"{path}.telescope", "HST 또는 JWST 필요", errors)
    require(text(item.get("date")), f"{path}.date", "촬영일 필요", errors)
    require(item.get("dateKind") in {"observation", "observation-range", "release"},
            f"{path}.dateKind", "관측일·관측기간·공개일 구분 필요", errors)
    require(text(item.get("thumb")), f"{path}.thumb", "캐시 썸네일 경로 필요", errors)
    require(text(item.get("full")), f"{path}.full", "공식 원본 링크 필요", errors)
    require(text(item.get("license")), f"{path}.license", "이미지 이용 조건 필요", errors)
    if text(item.get("thumb")):
        require((ROOT / "prototype" / item["thumb"]).is_file(), f"{path}.thumb",
                "로컬 캐시 썸네일 파일이 없음", errors)
    if text(item.get("full")):
        require(item["full"].startswith("https://"), f"{path}.full",
                "HTTPS 공식 원본 링크 필요", errors)


def validate_life(item: dict[str, Any], path: str, errors: list[str]) -> None:
    require(localized(item.get("name")), f"{path}.name", "ko/en 이름이 모두 필요", errors)
    require(localized(item.get("note")), f"{path}.note", "ko/en 관측·문헌 설명 필요", errors)
    require(text(item.get("sci")), f"{path}.sci", "학명이 필요", errors)
    require(item.get("group") in SEA_LIFE_GROUPS, f"{path}.group", "허용된 생물 그룹이 필요", errors)
    require(credit(item.get("credit")), f"{path}.credit", "실제 크레딧이 필요", errors)
    require(text(item.get("license")), f"{path}.license", "사진 이용 조건이 필요", errors)
    require(text(item.get("thumb")), f"{path}.thumb", "로컬 캐시 사진 경로가 필요", errors)
    require(text(item.get("photoSourceUrl")) and item["photoSourceUrl"].startswith("https://"),
            f"{path}.photoSourceUrl", "HTTPS 사진 원문 링크가 필요", errors)
    require(text(item.get("depthSource")), f"{path}.depthSource", "깊이 출처명이 필요", errors)
    require(text(item.get("depthSourceUrl")) and item["depthSourceUrl"].startswith("https://"),
            f"{path}.depthSourceUrl", "HTTPS 깊이 출처 링크가 필요", errors)
    require(item.get("depthKind") in {"literature-range", "observation-depth"},
            f"{path}.depthKind", "문헌 범위와 단일 관측 깊이를 구분해야 함", errors)
    require(number(item.get("depthMin")) and item["depthMin"] >= 0,
            f"{path}.depthMin", "0 이상의 숫자 필요", errors)
    require(number(item.get("depthMax")) and item["depthMax"] >= 0,
            f"{path}.depthMax", "0 이상의 숫자 필요", errors)
    if number(item.get("depthMin")) and number(item.get("depthMax")):
        require(item["depthMin"] <= item["depthMax"], path,
                "depthMin은 depthMax보다 클 수 없음", errors)
        if item.get("depthKind") == "observation-depth":
            require(item["depthMin"] == item["depthMax"], path,
                    "단일 관측 깊이는 min/max가 같아야 함", errors)
            require(number(item.get("displayWindowM")) and 0 < item["displayWindowM"] <= 100,
                    f"{path}.displayWindowM", "관측 탐색창은 0 초과 100m 이하여야 함", errors)
        else:
            require("displayWindowM" not in item, f"{path}.displayWindowM",
                    "문헌 범위에는 관측 탐색창을 쓰지 않음", errors)
    require(number(item.get("sizeM")) and item["sizeM"] > 0,
            f"{path}.sizeM", "0보다 큰 숫자 필요", errors)
    require(item.get("sizeKind") in {"approximate", "minimum", "range-midpoint"},
            f"{path}.sizeKind", "크기 수치의 의미 구분이 필요", errors)
    if text(item.get("thumb")):
        require((ROOT / "prototype" / item["thumb"]).is_file(), f"{path}.thumb",
                "로컬 캐시 사진 파일이 없음", errors)


def validate_trench(item: dict[str, Any], path: str, errors: list[str]) -> None:
    require(localized(item.get("name")), f"{path}.name", "ko/en 이름이 모두 필요", errors)
    require(localized(item.get("note")), f"{path}.note", "ko/en 설명이 모두 필요", errors)
    require(localized(item.get("depthMethod")), f"{path}.depthMethod", "ko/en 측정 방법이 모두 필요", errors)
    require(credit(item.get("credit")), f"{path}.credit", "자료 크레딧이 필요", errors)
    require(text(item.get("source")), f"{path}.source", "출처 문헌명이 필요", errors)
    require(text(item.get("sourceUrl")) and item["sourceUrl"].startswith("https://"),
            f"{path}.sourceUrl", "HTTPS 원문 링크가 필요", errors)
    if "secondarySource" in item or "secondarySourceUrl" in item:
        require(text(item.get("secondarySource")), f"{path}.secondarySource",
                "두 번째 출처명이 필요", errors)
        require(text(item.get("secondarySourceUrl")) and item["secondarySourceUrl"].startswith("https://"),
                f"{path}.secondarySourceUrl", "두 번째 HTTPS 원문 링크가 필요", errors)
    require(number(item.get("lat")) and -90 <= item["lat"] <= 90,
            f"{path}.lat", "-90~90 범위의 숫자 필요", errors)
    require(number(item.get("lon")) and -180 <= item["lon"] <= 180,
            f"{path}.lon", "-180~180 범위의 숫자 필요", errors)
    require(number(item.get("depthMin")) and item["depthMin"] >= 0,
            f"{path}.depthMin", "0 이상의 깊이 필요", errors)
    require(number(item.get("depthMax")) and item["depthMax"] >= 0,
            f"{path}.depthMax", "0 이상의 깊이 필요", errors)
    if number(item.get("depthMin")) and number(item.get("depthMax")):
        require(item["depthMin"] <= item["depthMax"], path,
                "depthMin은 depthMax보다 클 수 없음", errors)


def validate_korea_card(item: dict[str, Any], path: str, errors: list[str]) -> None:
    require(text(item.get("id")), f"{path}.id", "식별자 필요", errors)
    require(localized(item.get("name")), f"{path}.name", "ko/en 이름이 모두 필요", errors)
    require(localized(item.get("note")), f"{path}.note", "ko/en 설명이 모두 필요", errors)
    require(number(item.get("averageDepthM")) and item["averageDepthM"] > 0,
            f"{path}.averageDepthM", "0보다 큰 평균수심 필요", errors)
    require(text(item.get("source")), f"{path}.source", "출처 기관명이 필요", errors)
    require(text(item.get("sourceUrl")) and item["sourceUrl"].startswith("https://"),
            f"{path}.sourceUrl", "HTTPS 원문 링크가 필요", errors)


def validate_alias(item: dict[str, Any], path: str, errors: list[str]) -> None:
    norad = str(item.get("norad", ""))
    require(norad.isdigit(), f"{path}.norad", "숫자 NORAD id 필요", errors)
    for lang in ("ko", "en"):
        names = item.get(lang)
        require(isinstance(names, list) and bool(names) and all(text(name) for name in names),
                f"{path}.{lang}", "비어 있지 않은 별칭 배열 필요", errors)
    require(item.get("group") in SAT_GROUPS, f"{path}.group", "실제 위성 그룹 필요", errors)
    require(localized(item.get("kind")), f"{path}.kind", "ko/en 종류가 모두 필요", errors)


def validate_ocean_comparison(item: dict[str, Any], path: str, errors: list[str]) -> None:
    require(localized(item.get("name")), f"{path}.name", "ko/en 이름이 모두 필요", errors)
    require(localized(item.get("note")), f"{path}.note", "ko/en 설명이 모두 필요", errors)
    require(number(item.get("depthM")) and item["depthM"] > 0,
            f"{path}.depthM", "0보다 큰 출처 기반 깊이가 필요", errors)
    require(text(item.get("source")), f"{path}.source", "출처 기관명이 필요", errors)
    require(text(item.get("sourceUrl")) and item["sourceUrl"].startswith("https://"),
            f"{path}.sourceUrl", "HTTPS 공식 출처 링크가 필요", errors)


def validate_obis_cell(item: dict[str, Any], path: str, errors: list[str]) -> None:
    require(localized(item.get("name")), f"{path}.name", "ko/en 해역 이름이 모두 필요", errors)
    require(number(item.get("lat")) and -90 <= item["lat"] <= 90,
            f"{path}.lat", "-90~90 범위의 숫자 필요", errors)
    require(number(item.get("lon")) and -180 <= item["lon"] <= 180,
            f"{path}.lon", "-180~180 범위의 숫자 필요", errors)


def validate_probe(item: dict[str, Any], path: str, errors: list[str]) -> None:
    require(text(item.get("id")), f"{path}.id", "식별자 필요", errors)
    require(localized(item.get("name")), f"{path}.name", "ko/en 이름이 모두 필요", errors)
    require(str(item.get("target", "")).lstrip("-").isdigit(),
            f"{path}.target", "Horizons 표적 번호 필요", errors)
    require(text(item.get("epoch")) and item["epoch"].endswith("Z"),
            f"{path}.epoch", "UTC 기준시점 필요", errors)
    for field in ("pos", "vel"):
        vector = item.get(field)
        require(isinstance(vector, list) and len(vector) == 3 and all(number(v) for v in vector),
                f"{path}.{field}", "유한한 3차원 벡터 필요", errors)
    require(credit(item.get("credit")), f"{path}.credit", "자료 크레딧 필요", errors)
    require(localized(item.get("method")), f"{path}.method", "ko/en 추정 방법 필요", errors)
    require(number(item.get("displayRangeYears")) and 0 < item["displayRangeYears"] <= 10,
            f"{path}.displayRangeYears", "0 초과 10년 이하 표시 범위 필요", errors)


VALIDATORS = {
    "space-photos": validate_space,
    "sea-life": validate_life,
    "trenches": validate_trench,
    "sat-aliases": validate_alias,
    "ocean-comparisons": validate_ocean_comparison,
    "obis-cells": validate_obis_cell,
    "probes": validate_probe,
}


def validate_catalog(name: str, path: Path, require_populated: bool) -> tuple[int, list[str]]:
    errors: list[str] = []
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return 0, [f"{path}: JSON을 읽을 수 없음: {exc}"]
    require(isinstance(doc, dict), name, "루트는 객체여야 함", errors)
    if not isinstance(doc, dict):
        return 0, errors
    require(text(doc.get("generated")), f"{name}.generated", "생성일 필요", errors)
    if name == "sat-aliases":
        require(text(doc.get("catalogObserved")), f"{name}.catalogObserved",
                "대조한 카탈로그 관측 시각 필요", errors)
        require(text(doc.get("source")) and text(doc.get("sourceUrl")), f"{name}.source",
                "카탈로그 출처와 URL 필요", errors)
    if name == "obis-cells":
        require(doc.get("cellSizeDegrees") == 5, f"{name}.cellSizeDegrees", "5도 셀이어야 함", errors)
        require(text(doc.get("source")) and text(doc.get("sourceUrl")), f"{name}.source",
                "OBIS 출처와 URL 필요", errors)
        require(text(doc.get("policyUrl")), f"{name}.policyUrl", "OBIS 자료 정책 URL 필요", errors)
        require(localized(doc.get("coverage")), f"{name}.coverage", "ko/en 수집 범위 설명 필요", errors)
    if name == "probes":
        require(text(doc.get("source")) and text(doc.get("sourceUrl")), f"{name}.source",
                "상태벡터 출처와 URL 필요", errors)
        require(text(doc.get("frame")), f"{name}.frame", "좌표 기준 필요", errors)
        require(isinstance(doc.get("units"), dict)
                and doc["units"].get("position") == "AU"
                and doc["units"].get("velocity") == "AU/day",
                f"{name}.units", "AU와 AU/day 단위가 필요", errors)
    items = doc.get("items")
    require(isinstance(items, list), f"{name}.items", "배열이어야 함", errors)
    if not isinstance(items, list):
        return 0, errors
    if require_populated:
        require(bool(items), f"{name}.items", "출시 검증에는 최소 1개 항목 필요", errors)
    seen: set[str] = set()
    for index, item in enumerate(items):
        item_path = f"{name}.items[{index}]"
        require(isinstance(item, dict), item_path, "객체여야 함", errors)
        if not isinstance(item, dict):
            continue
        item_id = item.get("id") if name != "sat-aliases" else str(item.get("norad", ""))
        require(text(item_id), f"{item_path}.id", "비어 있지 않은 식별자 필요", errors)
        if text(item_id):
            require(item_id not in seen, f"{item_path}.id", "중복 식별자", errors)
            seen.add(item_id)
        VALIDATORS[name](item, item_path, errors)
    if name == "trenches":
        cards = doc.get("koreaCards")
        require(isinstance(cards, list) and bool(cards), "trenches.koreaCards",
                "우리 바다 교육 카드가 최소 1개 필요", errors)
        if isinstance(cards, list):
            for index, item in enumerate(cards):
                card_path = f"trenches.koreaCards[{index}]"
                require(isinstance(item, dict), card_path, "객체여야 함", errors)
                if isinstance(item, dict):
                    validate_korea_card(item, card_path, errors)
    return len(items), errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-populated", action="store_true",
                        help="출시 게이트: 모든 카탈로그에 최소 1개 항목 요구")
    parser.add_argument("--space-min", type=int, default=0,
                        help="우주 사진 출시 게이트의 최소 항목 수")
    args = parser.parse_args()
    all_errors: list[str] = []
    counts: dict[str, int] = {}
    for name, path in CATALOGS.items():
        counts[name], errors = validate_catalog(name, path, args.require_populated)
        all_errors.extend(errors)
    if counts.get("space-photos", 0) < args.space_min:
        all_errors.append(
            f"space-photos.items: {args.space_min}건 필요, 현재 {counts.get('space-photos', 0)}건")
    if all_errors:
        for error in all_errors:
            print(f"FAIL {error}", file=sys.stderr)
        print(f"FAILED: {len(all_errors)} catalogue error(s)", file=sys.stderr)
        return 1
    summary = ", ".join(f"{name}={count}" for name, count in counts.items())
    print(f"PASS: catalogue schemas and credits validated ({summary})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
