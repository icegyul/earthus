#!/usr/bin/env python3
"""세계 산맥 폴리곤 → EARTHUS v3 '땅' 방

왜 이 파일인가: 산맥을 손으로 그릴 필요가 없다. Natural Earth 의 지리 구역
폴리곤에 `Range/mtn` 으로 분류된 산맥이 **222개** 들어 있고, 놀랍게도
**222개 전부 한국어 이름(NAME_KO)** 이 붙어 있다. Wikidata ID 도 함께 온다.

  알프스 · 톈산산맥 · 우랄산맥 · 캅카스산맥 · 히말라야산맥 · 안데스산맥 ·
  로키산맥 · 애팔래치아산맥 · 아틀라스산맥 · 남극횡단산지 …

MIN_LABEL 은 원본이 정한 라벨 우선순위다(작을수록 큰 산맥). 화면에 몇 개만
띄울 때 이 값으로 고르면 우리가 임의로 고르지 않아도 된다.

셰이프파일 대신 GeoJSON 미러를 쓴다 — 이 저장소에 셰이프파일 판독기가 없다.

출처: Natural Earth (naturalearthdata.com), 1:10m Physical, geography_regions_polys.
      GeoJSON 미러: github.com/nvkelso/natural-earth-vector
라이선스: 퍼블릭 도메인.
      "All versions of Natural Earth raster + vector map data found on this
       website are in the public domain." / "No permission is needed to use
       Natural Earth. Crediting the authors is unnecessary."
      그래도 출처는 적는다 — 우리 규약이 그렇다.

사용: python tools/build-mountains.py
"""

import json
import io
import urllib.request
from pathlib import Path

SRC = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
       "master/geojson/ne_10m_geography_regions_polys.geojson")
OUT = Path(__file__).resolve().parent.parent / "prototype" / "data" / "mountains.json"
CACHE = Path(__file__).resolve().parent.parent / ".tmp" / "ne-regions.geojson"

DP = 2            # 소수 둘째 자리 ≈ 1km. 저장소 관례(build-plates.mjs)와 같다.
MIN_PTS = 4
MIN_SPAN = 0.15   # 이보다 작은 조각은 전지구 화면에서 한 점도 안 된다


def load():
    if CACHE.exists():
        return json.load(io.open(CACHE, encoding="utf-8"))
    with urllib.request.urlopen(SRC, timeout=300) as r:
        raw = r.read()
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_bytes(raw)
    return json.loads(raw.decode("utf-8"))


def rings_of(geom):
    t = geom.get("type")
    polys = [geom["coordinates"]] if t == "Polygon" else (
        geom["coordinates"] if t == "MultiPolygon" else [])
    out = []
    for poly in polys:
        ring = poly[0]                      # 바깥 고리만. 산맥에 구멍은 의미 없다.
        if len(ring) < MIN_PTS:
            continue
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        if (max(xs) - min(xs)) < MIN_SPAN and (max(ys) - min(ys)) < MIN_SPAN:
            continue
        r, prev = [], None
        for x, y in ring:
            q = [round(x, DP), round(y, DP)]
            if q != prev:                   # 같은 자리로 반올림된 연속점은 하나로
                r.append(q)
                prev = q
        if len(r) >= MIN_PTS:
            out.append(r)
    return out


def label_point(rings):
    """가장 큰 고리의 면적중심 — 이름표를 산맥 한복판에 놓기 위해서다."""
    best, best_a = None, 0.0
    for ring in rings:
        a = cx = cy = 0.0
        for i in range(len(ring) - 1):
            x1, y1 = ring[i]
            x2, y2 = ring[i + 1]
            f = x1 * y2 - x2 * y1
            a += f
            cx += (x1 + x2) * f
            cy += (y1 + y2) * f
        a *= 0.5
        if abs(a) > abs(best_a):
            best_a = a
            best = [round(ring[0][0], DP), round(ring[0][1], DP)] if abs(a) < 1e-9 \
                else [round(cx / (6 * a), DP), round(cy / (6 * a), DP)]
    return best


def main():
    gj = load()
    items = []
    for f in gj["features"]:
        p = f["properties"]
        if p.get("FEATURECLA") != "Range/mtn":
            continue
        rings = rings_of(f.get("geometry") or {})
        if not rings:
            continue
        lp = label_point(rings)
        if not lp:
            continue
        items.append({
            "ko": p.get("NAME_KO") or p.get("NAME"),
            "en": p.get("NAME"),
            "wd": p.get("WIKIDATAID"),
            "pri": p.get("MIN_LABEL"),        # 작을수록 큰 산맥 — 화면에 고를 때 쓴다
            "at": lp,                          # 이름표 자리 [경도, 위도]
            "rings": rings,
        })

    items.sort(key=lambda d: (d["pri"] if d["pri"] is not None else 99))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "schemaVersion": "earthus.mountains.v1",
        "purpose": "세계 산맥 폴리곤. v3 '땅' 방의 겹.",
        "source": "Natural Earth 1:10m Physical — geography_regions_polys (Range/mtn)",
        "sourceUrl": "https://www.naturalearthdata.com/",
        "mirror": "https://github.com/nvkelso/natural-earth-vector",
        "license": "Public domain",
        "licenseNote": ("Natural Earth 는 퍼블릭 도메인이며 출처 표기가 필수는 아니다. "
                        "그래도 적는다 — 어디서 왔는지 밝히는 것이 우리 규약이다."),
        "note": ("좌표는 소수 둘째 자리(약 1km)로만 줄였다. 모양 자체는 원본 그대로다. "
                 "pri 는 원본의 MIN_LABEL — 화면에 몇 개만 띄울 때 우리가 임의로 고르지 "
                 "않고 이 값을 쓴다."),
        "count": len(items),
        "ranges": items,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    pts = sum(len(r) for it in items for r in it["rings"])
    print(f"산맥 {len(items)}개 · 고리 {sum(len(it['rings']) for it in items)}개 · 점 {pts:,}개")
    print(f"{OUT}  ({OUT.stat().st_size:,} B)")
    print("\n큰 것부터 열 개:")
    for it in items[:10]:
        print(f"  pri {it['pri']:>2}  {it['ko']}  ({it['en']})")


if __name__ == "__main__":
    main()
