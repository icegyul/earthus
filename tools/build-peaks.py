#!/usr/bin/env python3
"""이름 있는 산 → EARTHUS v3 '산' 겹

산맥(mountains.json)은 덩어리의 테두리라 "저기가 히말라야" 까지만 말한다.
아이가 찾는 것은 그 안의 한 봉우리다 — 에베레스트가 몇 미터인지, 백두산이
어디 있는지.

Natural Earth 1:10m geography_regions_elevation_points 에 그 답이 들어 있다.
퍼블릭 도메인이고, 놀랍게도 **한국어 이름이 633개 중 632개** 붙어 있다.
(같은 저장소의 강 자료에는 한국어 이름이 하나도 없어 손으로 붙여야 했다.
 여기서는 그럴 필요가 없다 — 원본이 이미 갖고 있다.)

min_zoom 은 원본이 정한 '이 배율부터 보여도 된다' 값이다. 화면에 몇 개만 띄울 때
우리가 임의로 고르지 않고 이 값을 쓴다. 에베레스트가 4, 대부분이 7 언저리다.

⚠️ 높이는 원본이 적어 둔 값을 그대로 옮긴다. 산 높이는 측량 방식과 시점에 따라
   다르게 적히므로(에베레스트만 해도 8,848 과 8,849 가 함께 쓰인다) 우리가
   반올림하거나 고쳐 적지 않는다.

사용: python tools/build-peaks.py
"""

import json
import urllib.request
from pathlib import Path

SRC = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
       "master/geojson/ne_10m_geography_regions_elevation_points.geojson")
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "prototype" / "data" / "peaks.json"
CACHE = ROOT / ".tmp" / "ne-peaks.geojson"

DP = 3      # 소수 셋째 자리 ≈ 100m. 봉우리는 점이라 강보다 정밀해야 한다.

# 원본의 한국어 이름 중 손으로 고친 것. 고친 이유를 함께 적는다 — 이름을 지어내는
# 것과 잘못 옮겨진 이름을 바로잡는 것은 다르고, 그 경계는 근거가 있느냐다.
#
# 원본은 로마자 표기를 기계로 옮긴 흔적이 남아 있다. Chiri-san 을 그대로 읽어
# '치리산' 이 됐는데, 이건 매큔·라이샤워 표기(Chiri-san)의 지리산이다.
# 우리 아이들이 보는 화면에 우리 산 이름이 틀려 있으면 안 된다.
FIX = {
    "치리산":   ("지리산",   "Chiri-san = 지리산(智異山). 매큔·라이샤워 표기를 그대로 읽은 것"),
    "다테 산":  ("다테야마", "Tate-yama = 다테야마(立山). -yama 를 '산'으로 옮기면 이름이 아니게 된다"),
}

# 붙여쓰기만 바로잡는다(글자는 그대로). '앨버트 산' → '앨버트산', '이와테-산' → '이와테산'.
# 국립국어원 표기 관례가 산 이름을 붙여 쓴다. 이건 고쳐 쓰는 게 아니라 띄어쓰기다.
import re
SPACING = re.compile(r"[ \-](산)$")


def load():
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding="utf-8"))
    with urllib.request.urlopen(SRC, timeout=300) as r:
        raw = r.read()
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_bytes(raw)
    return json.loads(raw.decode("utf-8"))


def main():
    gj = load()
    items, noname, spaced, fixed = [], 0, 0, []
    for f in gj["features"]:
        p = f["properties"]
        if p.get("featurecla") != "mountain":
            continue
        ko = p.get("name_ko")
        if not ko:                      # 이름을 지어내지 않는다 — 영어만 있는 것은 뺀다
            noname += 1
            continue
        if ko in FIX:
            fixed.append(f"{ko} → {FIX[ko][0]} ({FIX[ko][1]})")
            ko = FIX[ko][0]
        ko2 = SPACING.sub('\\1', ko)
        if ko2 != ko:
            spaced += 1
            ko = ko2
        g = f.get("geometry") or {}
        if g.get("type") != "Point":
            continue
        lon, lat = g["coordinates"][:2]
        items.append({
            "ko": ko,
            "en": p.get("name"),
            "m": p.get("elevation"),
            "at": [round(lon, DP), round(lat, DP)],
            "z": p.get("min_zoom"),
            "co": p.get("nation1") or None,
            "wd": p.get("wikidataid") or None,
        })

    # 높은 것부터. 화면에 몇 개만 띄울 때 z 와 함께 쓴다.
    items.sort(key=lambda d: -(d["m"] or 0))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "schemaVersion": "earthus.peaks.v1",
        "purpose": "이름 있는 산봉우리. v3 '산' 겹.",
        "source": "Natural Earth 1:10m Physical — geography_regions_elevation_points",
        "sourceUrl": "https://www.naturalearthdata.com/",
        "mirror": "https://github.com/nvkelso/natural-earth-vector",
        "license": "Public domain",
        "licenseNote": ("Natural Earth 는 퍼블릭 도메인이며 출처 표기가 필수는 아니다. "
                        "그래도 적는다 — 어디서 왔는지 밝히는 것이 우리 규약이다."),
        "note": ("한국어 이름은 원본이 갖고 있는 name_ko 다. 없는 것은 넣지 않았다 — "
                 "이름을 지어내지 않는다. z 는 원본의 min_zoom 으로, 화면에 몇 개만 "
                 "띄울 때 우리가 고르지 않고 이 값을 쓴다."),
        "korrections": {
            "why": ("원본의 한국어 이름에 로마자 표기를 기계로 옮긴 흔적이 남아 있다. "
                    "근거가 분명한 것만 손으로 고쳤고, 고친 목록을 여기 남긴다."),
            "items": fixed,
            "spacingOnly": (f"산 이름 앞의 공백·하이픈을 붙여 쓴 것 {spaced}건 "
                            f"(글자는 그대로. '앨버트 산' → '앨버트산')"),
        },
        "caution": ("높이는 원본 값 그대로다. 산 높이는 측량 방식과 시점에 따라 다르게 "
                    "적히므로(에베레스트도 8,848 과 8,849 가 함께 쓰인다) 우리가 "
                    "반올림하거나 고쳐 적지 않는다."),
        "collected": "2026-09-03",
        "count": len(items),
        "items": items,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"산 {len(items)}개 (한국어 이름 없어 뺀 것 {noname}개)")
    for f in fixed:
        print(f"  손으로 고침: {f}")
    print(f"  띄어쓰기만 바로잡음: {spaced}건")
    print(f"  가장 높은 것: {items[0]['ko']} {items[0]['m']}m")
    print(f"{OUT}  ({OUT.stat().st_size:,} B)")


if __name__ == "__main__":
    main()
