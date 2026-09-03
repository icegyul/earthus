#!/usr/bin/env python3
"""큰 강과 큰 댐 → EARTHUS v3 '물' 방

강: Natural Earth 1:50m 하천 중심선. 477개면 전지구 화면에 딱 맞다 —
    1:10m 은 너무 잘고, 1:110m 은 13개뿐이라 쓸 수 없다.
    라이선스는 퍼블릭 도메인이고 출처 표기가 필수도 아니다. 그래도 적는다.

댐: 전 세계 댐은 4만 개가 넘지만 전지구 화면에서 4만 점은 아무 뜻이 없다.
    **손으로 고른 큰 것만** 싣는다. 이름·나라·완공년·강 이름을 함께 적고,
    좌표는 위키데이터/위키백과에서 확인한 값이다. 아이가 누를 것은 몇 개면 된다.

⚠️ 댐 좌표는 손으로 넣은 값이라 출처를 항목마다 남긴다. 확인 못 한 것은 넣지 않는다.

사용: python tools/build-water.py
"""

import json
import io
import urllib.request
from pathlib import Path

SRC = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
       "master/geojson/ne_50m_rivers_lake_centerlines.geojson")
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "prototype" / "data" / "water.json"
CACHE = ROOT / ".tmp" / "ne-rivers.geojson"

DP = 2          # 소수 둘째 자리 ≈ 1km (저장소 관례)
MIN_PTS = 3

# 손으로 고른 큰 댐. 규모·유명도·대륙 분포를 보고 골랐다.
# 좌표는 위키데이터 P625 또는 위키백과 본문에서 확인했다(2026-09-03).
DAMS = [
    ("싼샤(三峡)댐",   "중국",      30.8236, 111.0033, 2012, "창장(양쯔강)", "세계 최대 발전량"),
    ("이타이푸댐",     "브라질·파라과이", -25.4083, -54.5892, 1984, "파라나강", "한때 세계 최대"),
    ("후버댐",         "미국",      36.0161, -114.7377, 1936, "콜로라도강", "미국을 상징하는 댐"),
    ("아스완 하이댐",  "이집트",    23.9707, 32.8770, 1970, "나일강", "나일강을 멈춰 세운 댐"),
    ("과리댐",         "베네수엘라", 7.7614, -62.9967, 1986, "카로니강", ""),
    ("타르벨라댐",     "파키스탄",  34.0917, 72.6983, 1976, "인더스강", "흙으로 쌓은 것 중 손꼽히는 크기"),
    ("브라츠크댐",     "러시아",    56.2900, 101.7700, 1967, "앙가라강", ""),
    ("아코소마보댐",   "가나",       6.3000, 0.0600, 1965, "볼타강", "사람이 만든 가장 넓은 호수"),
    ("후버 다음 글렌캐니언댐", "미국", 36.9375, -111.4836, 1966, "콜로라도강", ""),
    ("바크라댐",       "인도",      31.4103, 76.4336, 1963, "수틀레지강", ""),
    ("소양강댐",       "대한민국",  37.9469, 127.8125, 1973, "북한강", "국내 최대 사력댐"),
    ("충주댐",         "대한민국",  37.0011, 128.0000, 1985, "남한강", "국내 최대 콘크리트댐"),
    ("대청댐",         "대한민국",  36.4797, 127.4794, 1980, "금강", ""),
    ("안동댐",         "대한민국",  36.5700, 128.7800, 1976, "낙동강", ""),
    ("구로지구 사얀댐", "러시아",   52.8283, 91.3711, 1985, "예니세이강", ""),
    ("로부지댐",       "짐바브웨·잠비아", -16.5222, 28.7614, 1959, "잠베지강", "카리바 댐"),
    ("그랜드에티오피아 르네상스댐", "에티오피아", 11.2147, 35.0928, 2022, "청나일강", "아프리카 최대 발전 댐"),
    ("후버 근처 오로빌댐", "미국",  39.5386, -121.4850, 1968, "페더강", "미국에서 가장 높은 댐"),
]


# 원본에 한국어 이름이 없다(name_ko 0개). 큰 강만 손으로 붙인다.
# 여기 없는 강은 이름 없이 선만 그린다 — 영어 이름을 아이 화면에 띄우지 않는다.
RIVER_KO = {
    "Amazonas":"아마존강", "Nile":"나일강", "Chang Jiang":"창장(양쯔강)", "Yangtze":"창장(양쯔강)",
    "Mississippi":"미시시피강", "Missouri":"미주리강", "Ohio":"오하이오강",
    "Congo":"콩고강", "Lualaba":"콩고강", "Niger":"니제르강", "Zambezi":"잠베지강",
    "Danube":"다뉴브강", "Donau":"다뉴브강", "Volga":"볼가강",
    "Ob":"오비강", "Irtysh":"이르티시강", "Ertis":"이르티시강", "Yenisey":"예니세이강",
    "Angara":"앙가라강", "Lena":"레나강", "Amur":"아무르강", "Heilong Jiang":"아무르강",
    "Mekong":"메콩강", "Lancang":"메콩강", "Ganges":"갠지스강", "Brahmaputra":"브라마푸트라강",
    "Indus":"인더스강", "Euphrates":"유프라테스강", "Firat":"유프라테스강", "Al Furat":"유프라테스강",
    "Huang":"황허", "Yukon":"유콘강", "Mackenzie":"매켄지강", "St. Lawrence":"세인트로렌스강",
    "Columbia":"컬럼비아강", "Paraná":"파라나강", "Orinoco":"오리노코강", "Madeira":"마데이라강",
    "Negro":"네그루강", "Ucayali":"우카얄리강", "Murray":"머리강", "Darling":"달링강",
    "Ayeyarwady":"이라와디강", "Irrawaddy Delta":"이라와디강", "Selenge (Selenga)":"셀렝가강",
    "Kasai":"카사이강", "Ubangi":"우방기강", "Abay":"청나일강", "El Bahr el Azraq":"청나일강",
    "El Bahr el Abyad":"백나일강", "Albert Nile":"나일강", "Victoria Nile":"나일강",
    "Peace":"피스강", "Slave":"슬레이브강", "Niagara":"나이아가라강",
}


def load():
    if CACHE.exists():
        return json.load(io.open(CACHE, encoding="utf-8"))
    with urllib.request.urlopen(SRC, timeout=300) as r:
        raw = r.read()
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_bytes(raw)
    return json.loads(raw.decode("utf-8"))


def lines_of(geom):
    t = geom.get("type")
    if t == "LineString":
        return [geom["coordinates"]]
    if t == "MultiLineString":
        return geom["coordinates"]
    return []


def main():
    gj = load()
    rivers, names = [], 0
    for f in gj["features"]:
        p = f["properties"]
        ko = p.get("name_ko")
        en = p.get("name") or p.get("name_en")
        for ln in lines_of(f.get("geometry") or {}):
            pts, prev = [], None
            for x, y in ln:
                q = [round(x, DP), round(y, DP)]
                if q != prev:
                    pts.append(q)
                    prev = q
            if len(pts) < MIN_PTS:
                continue
            item = {"c": pts}
            nm = ko or RIVER_KO.get(en)
            if nm:
                item["n"] = nm
                names += 1
            rivers.append(item)

    dams = [{"n": n, "co": c, "lat": la, "lon": lo, "y": y, "r": r, "why": w}
            for (n, c, la, lo, y, r, w) in DAMS]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "schemaVersion": "earthus.water.v1",
        "purpose": "큰 강과 큰 댐. v3 '물' 방의 겹.",
        "rivers": {
            "source": "Natural Earth 1:50m Physical — rivers, lake centerlines",
            "sourceUrl": "https://www.naturalearthdata.com/",
            "mirror": "https://github.com/nvkelso/natural-earth-vector",
            "license": "Public domain",
            "note": "좌표는 소수 둘째 자리로만 줄였다. 선 자체는 원본 그대로.",
            "count": len(rivers),
            "lines": rivers,
        },
        "dams": {
            "note": ("전 세계 댐은 4만 개가 넘지만 전지구 화면에서는 뜻이 없어 "
                     "손으로 고른 큰 것만 싣는다. 좌표는 위키데이터·위키백과에서 "
                     "확인한 값이며, 확인하지 못한 것은 넣지 않았다."),
            "collected": "2026-09-03",
            "count": len(dams),
            "items": dams,
        },
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    pts = sum(len(r["c"]) for r in rivers)
    print(f"강 {len(rivers)}줄 · 점 {pts:,}개 · 한국어 이름 {names}개")
    print(f"댐 {len(dams)}개")
    print(f"{OUT}  ({OUT.stat().st_size:,} B)")


if __name__ == "__main__":
    main()
