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
    "sat-aliases": ROOT / "prototype/data/sat-aliases.json",
}
PLACEHOLDERS = {"todo", "tbd", "unknown", "모름", "미정", "-"}
SAT_GROUPS = {"stations", "weather", "science", "nav", "comm", "earth",
              "military", "amateur", "starlink", "all"}


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


def validate_life(item: dict[str, Any], path: str, errors: list[str]) -> None:
    require(localized(item.get("name")), f"{path}.name", "ko/en 이름이 모두 필요", errors)
    require(localized(item.get("note")), f"{path}.note", "ko/en 관측·문헌 설명 필요", errors)
    require(credit(item.get("credit")), f"{path}.credit", "실제 크레딧이 필요", errors)
    require(number(item.get("depthMin")) and item["depthMin"] >= 0,
            f"{path}.depthMin", "0 이상의 숫자 필요", errors)
    require(number(item.get("depthMax")) and item["depthMax"] >= 0,
            f"{path}.depthMax", "0 이상의 숫자 필요", errors)
    if number(item.get("depthMin")) and number(item.get("depthMax")):
        require(item["depthMin"] <= item["depthMax"], path,
                "depthMin은 depthMax보다 클 수 없음", errors)
    require(number(item.get("sizeM")) and item["sizeM"] > 0,
            f"{path}.sizeM", "0보다 큰 숫자 필요", errors)


def validate_trench(item: dict[str, Any], path: str, errors: list[str]) -> None:
    require(localized(item.get("name")), f"{path}.name", "ko/en 이름이 모두 필요", errors)
    require(credit(item.get("credit")), f"{path}.credit", "자료 크레딧이 필요", errors)
    require(text(item.get("source")), f"{path}.source", "출처 링크 또는 문헌명이 필요", errors)
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


def validate_alias(item: dict[str, Any], path: str, errors: list[str]) -> None:
    norad = str(item.get("norad", ""))
    require(norad.isdigit(), f"{path}.norad", "숫자 NORAD id 필요", errors)
    for lang in ("ko", "en"):
        names = item.get(lang)
        require(isinstance(names, list) and bool(names) and all(text(name) for name in names),
                f"{path}.{lang}", "비어 있지 않은 별칭 배열 필요", errors)
    require(item.get("group") in SAT_GROUPS, f"{path}.group", "실제 위성 그룹 필요", errors)
    require(localized(item.get("kind")), f"{path}.kind", "ko/en 종류가 모두 필요", errors)


VALIDATORS = {
    "space-photos": validate_space,
    "sea-life": validate_life,
    "trenches": validate_trench,
    "sat-aliases": validate_alias,
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
    return len(items), errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-populated", action="store_true",
                        help="출시 게이트: 모든 카탈로그에 최소 1개 항목 요구")
    args = parser.parse_args()
    all_errors: list[str] = []
    counts: dict[str, int] = {}
    for name, path in CATALOGS.items():
        counts[name], errors = validate_catalog(name, path, args.require_populated)
        all_errors.extend(errors)
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
