"""KTO 공개 정규화 산출물 → 여행 씬용 압축 파일 (prototype/v2-three/data/tourism/kto-discovery.json)

원본(earthus.net/tourism/kto/*)은 무장애 11.9MB · 영문 28.6MB라 브라우저에 그대로 못 싣는다.
여기서 시군구 228곳(kr-places.json 중심점) 기준으로 집계해 200KB 안쪽으로 만든다.

원칙
- 값을 만들지 않는다. 집계(개수·합계)와 최근접 배정만 한다. 배정 방식은 파일에 적는다.
- 방문자수는 이동통신 기반이라 관광객이 아니다. 그 문구를 파일 note에 그대로 싣는다.
- 각 서비스의 fetchedAt·itemCount·sourceType·semanticType을 provenance로 보존한다.

사용
  python tools/build_kto_discovery.py                 # earthus.net에서 받아서 생성
  python tools/build_kto_discovery.py --from-dir DIR  # 이미 받은 JSON 폴더에서 생성
"""
from __future__ import annotations

import argparse
import io
import json
import math
import os
import sys
import urllib.request
from datetime import datetime, timezone

BASE = "https://earthus.net/tourism/kto"
SERVICES = {
    "barrierFree": "barrierFree/areaBasedSyncList2",
    "wellness": "wellness/wellnessTursmSyncList",
    "english": "english/areaBasedSyncList2",
    "related": "related/areaBasedList1",
    "visitors": "visitors/locgoRegnVisitrDDList",
    # 집중률 원본은 164,720행 · 64MB다. 브라우저에 그대로 못 내보내므로
    # 여기서 시군구별 대표값(평균·최대·관광지 수)으로 줄여 담는다.
    "concentration": "concentration/tatsCnctrRatedList",
}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLACES = os.path.join(ROOT, "prototype", "v2-three", "data", "kr-places.json")
OUT = os.path.join(ROOT, "prototype", "v2-three", "data", "tourism", "kto-discovery.json")

# KTO 지역코드 앞 두 자리(법정동 시도 코드) → kr-places.json의 시도명 앞글자
SIDO = {
    "11": "서울", "26": "부산", "27": "대구", "28": "인천", "29": "광주", "30": "대전", "31": "울산",
    "36": "세종", "41": "경기", "43": "충청북도", "44": "충청남도", "46": "전라남도", "47": "경상북도",
    "48": "경상남도", "50": "제주", "51": "강원", "52": "전북",
}


def load(name: str, from_dir: str | None):
    if from_dir:
        path = os.path.join(from_dir, name.replace("/", "_") + ".json")
        with io.open(path, encoding="utf-8") as f:
            return json.load(f)
    url = f"{BASE}/{name}.json"
    with urllib.request.urlopen(url, timeout=180) as r:
        return json.loads(r.read().decode("utf-8"))


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def nearest_index(lat, lon, centers):
    best, bi = 1e9, -1
    for i, (clat, clon) in enumerate(centers):
        # 위도 차가 2°를 넘으면 거리 계산 없이 건너뛴다 (속도)
        if abs(clat - lat) > 2.0:
            continue
        d = haversine_km(lat, lon, clat, clon)
        if d < best:
            best, bi = d, i
    return bi, best


def provenance(doc):
    return {
        "fetchedAt": doc.get("fetchedAt"),
        "state": doc.get("state"),
        "sourceType": doc.get("sourceType"),
        "semanticType": doc.get("semanticType"),
        "operation": doc.get("operation"),
        "sourceName": (doc.get("provenance") or {}).get("sourceName"),
        "sourceUrl": (doc.get("provenance") or {}).get("sourceUrl"),
        "itemCount": len(doc.get("items") or []),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-dir")
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    with io.open(PLACES, encoding="utf-8") as f:
        places_doc = json.load(f)
    places = places_doc["items"]  # [nameKo, nameEn, province, lat, lon]
    centers = [(p[3], p[4]) for p in places]
    regions = [{
        "i": i, "nameKo": p[0], "nameEn": p[1], "province": p[2], "lat": p[3], "lon": p[4],
        "barrierFree": 0, "english": 0, "wellness": 0, "barrierFreeSample": [],
        "visitors": None,
    } for i, p in enumerate(places)]

    docs = {k: load(v, args.from_dir) for k, v in SERVICES.items()}
    unassigned = {"barrierFree": 0, "english": 0, "wellness": 0}

    # ---- 무장애 · 영문 · 웰니스: 최근접 시군구 중심점에 배정해 개수만 센다 -------------
    for svc in ("barrierFree", "english", "wellness"):
        for it in docs[svc].get("items") or []:
            pos = it.get("position") or {}
            lat, lon = pos.get("lat"), pos.get("lon")
            if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
                unassigned[svc] += 1
                continue
            bi, dist = nearest_index(lat, lon, centers)
            if bi < 0 or dist > 60:  # 60km 넘게 떨어진 점은 배정하지 않는다 (섬·오류 좌표)
                unassigned[svc] += 1
                continue
            regions[bi][svc] += 1
            if svc == "barrierFree" and len(regions[bi]["barrierFreeSample"]) < 3:
                regions[bi]["barrierFreeSample"].append(it.get("title"))

    # ---- 웰니스 202곳은 점 자체를 싣는다 (작다) ------------------------------------
    wellness_points = []
    for it in docs["wellness"].get("items") or []:
        pos = it.get("position") or {}
        if pos.get("lat") is None:
            continue
        wellness_points.append({
            "title": it.get("title"), "lat": round(pos["lat"], 5), "lon": round(pos["lon"], 5),
            "theme": it.get("wellnessThemeCode"), "contentId": it.get("externalContentId"),
        })

    # ---- 방문자수: 지역코드 → (시도 앞글자, 시군구명) 으로 kr-places에 매칭 ------------
    # ⚠️ 방문자수 스냅샷은 수집 창에 따라 하루치일 수도, 여러 날일 수도 있다.
    #    하루치를 가정하고 덮어쓰면 값은 마지막 날 것이 되는데 날짜 표시는 첫날로 남아
    #    "언제 것인지 틀린 숫자"가 만들어진다. 날짜별로 모아 하루 평균을 낸다.
    by_region = {}
    for it in docs["visitors"].get("items") or []:
        code = str(it.get("regionCode") or "")
        row = by_region.setdefault(code, {"name": it.get("regionName"),
                                          "weekday": it.get("weekdayTypeName"),
                                          "days": set(), "a": [], "b": [], "c": []})
        if it.get("metricDate"):
            row["days"].add(it["metricDate"])
        key = {"1": "a", "2": "b", "3": "c"}.get(str(it.get("visitorTypeCode")))
        value = it.get("visitorMetric")
        if key and isinstance(value, (int, float)):
            row[key].append(value)
    # 시도명은 앞글자 매칭 — '충청북도/충청남도', '경상북도/경상남도'처럼 두 글자가 같은 도가 있어
    # SIDO 값 전체(예: '충청북도')로 startswith 한다.
    matched = 0
    unmatched = []
    for code, row in by_region.items():
        sido = SIDO.get(code[:2])
        if not sido:
            unmatched.append(code)
            continue
        cands = [r for r in regions if r["province"].startswith(sido) and r["nameKo"] == row["name"]]
        if len(cands) != 1:
            unmatched.append(f"{code}:{row['name']}")
            continue
        days = sorted(row["days"])
        single = len(days) == 1
        mean = lambda xs: (sum(xs) / len(xs)) if xs else None
        cands[0]["visitors"] = {
            "regionCode": code,
            "date": days[0] if single else (f"{days[0]}~{days[-1]}" if days else None),
            "dateFrom": days[0] if days else None,
            "dateTo": days[-1] if days else None,
            "dayCount": len(days),
            "aggregation": "SINGLE_DAY" if single else "MEAN_PER_DAY",
            "weekday": row["weekday"] if single else "",
            "local": mean(row["a"]), "domestic": mean(row["b"]), "foreign": mean(row["c"]),
        }
        matched += 1

    # ---- 연관 관광지: 출발지별 상위 5개만 ------------------------------------------
    rel = {}
    for it in docs["related"].get("items") or []:
        src = it.get("sourceName")
        if not src:
            continue
        rel.setdefault(src, []).append({
            "target": it.get("targetName"), "rank": it.get("relationRank"),
            "categories": it.get("categories") or [], "month": it.get("referenceMonth"),
        })
    related = {k: sorted(v, key=lambda x: (x["rank"] or 99))[:5] for k, v in rel.items()}

    # ---- 집중률: 시군구별 대표값 ------------------------------------------------
    # 상대 집중률은 "가장 붐비는 시기를 100으로 본 예측"이지 사람 수가 아니다.
    # 그 의미를 잃지 않도록 평균·최대와 대상 관광지 수를 함께 남긴다.
    conc = {}
    for it in docs["concentration"].get("items") or []:
        district = str(it.get("districtCode") or "")
        rate = it.get("relativeConcentrationRate")
        if not district or not isinstance(rate, (int, float)):
            continue
        bucket = conc.setdefault(district, {"name": it.get("districtName"), "rates": [],
                                            "spots": set(), "dates": set()})
        bucket["rates"].append(rate)
        if it.get("tourismName"):
            bucket["spots"].add(it["tourismName"])
        if it.get("targetDate"):
            bucket["dates"].add(it["targetDate"])
    conc_matched = 0
    for code, bucket in conc.items():
        sido = SIDO.get(code[:2])
        if not sido:
            continue
        cands = [r for r in regions if r["province"].startswith(sido) and r["nameKo"] == bucket["name"]]
        if len(cands) != 1:
            continue
        dates = sorted(bucket["dates"])
        cands[0]["concentration"] = {
            "districtCode": code,
            "mean": round(sum(bucket["rates"]) / len(bucket["rates"]), 2),
            "max": round(max(bucket["rates"]), 2),
            "spotCount": len(bucket["spots"]),
            "rowCount": len(bucket["rates"]),
            "dateFrom": dates[0] if dates else None,
            "dateTo": dates[-1] if dates else None,
        }
        conc_matched += 1

    visitor_days = sorted({d for row in by_region.values() for d in row["days"]})
    CONCENTRATION_NOTE = (
        "상대 집중률은 가장 붐비는 시기를 100으로 본 예측 지수이며 실제 인원 수가 아니다. "
        "여기 담긴 값은 시군구별 평균·최대이고 원본은 관광지·날짜별 행이다."
    )
    VISITOR_NOTE = (
        "이동통신 기반 방문자수는 관광객과 같지 않다. 집계 단위를 임의로 합산하지 않는다. "
        + ("이 파일의 방문자수는 단일 기준일 스냅샷이다."
           if len(visitor_days) <= 1
           else f"이 파일의 방문자수는 {visitor_days[0]}~{visitor_days[-1]} {len(visitor_days)}일의 하루 평균이다.")
    )

    out = {
        "schemaVersion": "earthus.kto-discovery.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "builder": "tools/build_kto_discovery.py",
        "regionSource": {"file": "data/kr-places.json", "count": len(places), "note": places_doc.get("note")},
        "assignment": "무장애·영문·웰니스 좌표를 kr-places 시군구 중심점에 최근접 배정 (60km 초과는 미배정). 행정구역 폴리곤이 아니라 근사다.",
        "notes": {
            "visitors": VISITOR_NOTE,
            "concentration": CONCENTRATION_NOTE,
            "label": "KTO 데이터에서 유도한 후보는 EARTHUS DISCOVERY 로 표기한다. KTO 공식 추천이 아니다.",
        },
        "provenance": {k: provenance(v) for k, v in docs.items()},
        "unassigned": unassigned,
        "visitorsMatched": matched,
        "visitorsUnmatched": unmatched,
        "regions": [{k: v for k, v in r.items() if k != "i"} for r in regions],
        "wellnessPoints": wellness_points,
        "related": related,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with io.open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(args.out)
    print(f"wrote {args.out} ({size/1024:.0f} KB) · regions {len(regions)} · wellness {len(wellness_points)}"
          f" · visitors matched {matched}/{len(by_region)} · related sources {len(related)}"
          f" · concentration matched {conc_matched}/{len(conc)} · unassigned {unassigned}")
    if unmatched:
        print("visitors unmatched:", ", ".join(unmatched[:12]), "..." if len(unmatched) > 12 else "")


if __name__ == "__main__":
    sys.exit(main())
