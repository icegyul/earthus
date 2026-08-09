#!/usr/bin/env python3
"""ESA/Webb 공식 이미지 페이지에서 카탈로그 검수용 메타데이터를 추출한다.

페이지 구조가 바뀌거나 필수 필드가 없으면 추정하지 않고 실패한다. 이 도구는
JSON 정본을 자동 덮어쓰지 않는다. 사람이 제목과 대상을 확인할 수 있도록 후보
레코드를 표준 출력으로만 내보낸다.
"""

from __future__ import annotations

import argparse
import html
import json
import re
from datetime import datetime
from pathlib import Path


def plain(fragment: str) -> str:
    no_tags = re.sub(r"<[^>]+>", " ", fragment)
    return " ".join(html.unescape(no_tags).split())


def required(pattern: str, source: str, label: str) -> str:
    match = re.search(pattern, source, re.IGNORECASE | re.DOTALL)
    if not match:
        raise ValueError(f"필수 필드 없음: {label}")
    value = plain(match.group(1))
    if not value:
        raise ValueError(f"빈 필드: {label}")
    return value


def ra_degrees(value: str) -> float:
    parts = [float(part) for part in value.split()]
    if len(parts) != 3:
        raise ValueError(f"RA 형식 오류: {value}")
    hour, minute, second = parts
    return round((hour + minute / 60 + second / 3600) * 15, 8)


def dec_degrees(value: str) -> float:
    cleaned = value.replace("°", " ").replace("'", " ").replace('"', " ")
    parts = [float(part) for part in cleaned.split()]
    if len(parts) != 3:
        raise ValueError(f"Dec 형식 오류: {value}")
    degree, minute, second = parts
    sign = -1 if degree < 0 or value.lstrip().startswith("-") else 1
    return round(sign * (abs(degree) + minute / 60 + second / 3600), 8)


def extract(path: Path) -> dict[str, object]:
    source = path.read_text(encoding="utf-8")
    image_id = path.stem
    title = required(r'<h1[^>]*class="[^"]*my-3[^"]*"[^>]*>(.*?)</h1>', source, "title")
    ra = required(r"Position \(RA\):</th>\s*<td>(.*?)</td>", source, "RA")
    dec = required(r"Position \(Dec\):</th>\s*<td>(.*?)</td>", source, "Dec")
    credit = required(r'<div class="credit">(.*?)</div>', source, "credit")
    released = required(r"Release date:\s*</th>\s*<td[^>]*>(.*?)</td>", source, "release date")
    date = datetime.strptime(released.split(",", 1)[0], "%d %B %Y").date().isoformat()
    return {
        "id": f"esawebb-{image_id.lower()}",
        "name": {"ko": None, "en": title},
        "telescope": "JWST",
        "ra": ra_degrees(ra),
        "dec": dec_degrees(dec),
        "date": date,
        "dateKind": "release",
        "distanceLy": None,
        "thumb": f"space/thumbs/{image_id.lower()}.jpg",
        "full": f"https://esawebb.org/images/{image_id}/",
        "credit": credit,
        "license": "CC BY 4.0 · ESA/Webb",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pages", nargs="+", type=Path)
    args = parser.parse_args()
    records = []
    for path in args.pages:
        try:
            records.append(extract(path))
        except ValueError as error:
            raise SystemExit(f"{path}: {error}") from error
    print(json.dumps({"items": records}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
