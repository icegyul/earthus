# -*- coding: utf-8 -*-
"""위치 정규화 — 새 지리 격자를 만들지 않는다 (결정 ⑥).

`canonical_place()` 의 우선순위는 결정 ⑥ 그대로다:
  1. confirmed place_id      — 의심되지 않은 gazetteer 식별자
  2. normalized place hierarchy/name
  3. unknown
확정되지 않은 위치는 Truth 승격에 보수적으로 쓴다(`doubt=True` 를 돌려준다).
⚠️ `lat3/lon3` 같은 새 격자 규칙을 도입하지 않는다 — 결정 ⑥ 이 금지했다.

`place_doubt()` · `build_gazetteer()` 는 `aws/gdelt-events/handler.py` 의 것을 옮긴 것이다
(`docs/NEWS_ENGINE_REUSE_MAP.md` N2 가 승인한 이전). 알고리즘과 상수를 바꾸지 않았다.

⚠️ **지금은 사본이 둘이다.** `aws/gdelt-events/handler.py` 가 자기 것을 그대로 갖고 있고,
   이 파일은 그 복사다. gdelt-events 는 **운영에서 돌고 있는 함수**이므로 이번 구현 단계에서
   손대지 않았다(AWS 쓰기 0 · 배포 0). 한쪽으로 합치는 것은 별도 승인 대상이다.
   그때까지 두 사본이 어긋나지 않도록 `aws/_shared/tests/test_geolocate.py` 가
   상수 일치를 고정한다.

   두 사본의 차이는 **판정을 바꾸지 않는 방어 코드**뿐이다. 정확히 이 둘이다:
     · `place_doubt` 가 `gaz[hit]` 대신 `gaz.get(hit, ())` 를 쓴다 (KeyError 방지)
     · 좌표가 없어 `km_between` 이 None 을 돌려준 항목을 걸러 낸다
       (운영 사본은 `min()` 안에서 None 과 실수를 비교하려다 TypeError 가 난다)
   문턱(`FAR_KM`)과 불용어(`GAZ_STOP`), 거리 수식은 같다.

⚠️ `build_gazetteer()` 는 **원본 GDELT export 행**을 받는다. `events/global.json` 에는
   그 행이 없으므로 3G 는 이 함수를 부를 수 없다. 3G 는 파일에 이미 들어 있는
   `placeDoubt` · `placeElsewhere` 를 소비한다(실측: 150건 중 7건에만 붙어 있다).
   함수를 여기 둔 이유는 RSS 계열 출처가 들어올 때 같은 검사를 쓰기 위해서다.
"""
import re

SCHEMA = "earthus.geolocate/1"

# gdelt-events/handler.py:174 와 같은 값. 바꾸면 두 곳이 달라진다.
#   ⚠️ 처음 옮길 때 이 값을 300 으로 잘못 적었고, `tests/test_geolocate.py` 의
#      상수 대조가 그것을 잡았다. 값이 더 작으면 의심 판정이 늘어 확정 승격이 과도하게 막힌다.
FAR_KM = 600.0
GAZ_STOP = {
    "united states", "america", "european union", "washington", "national",
    "general", "central", "united kingdom", "republic", "island", "islands",
    "north", "south", "west bank", "eastern", "western", "northern", "southern",
}

# GDELT geoType → SQL location_precision (20260913_earth_event_core.sql:155)
#   1 나라 · 2 미국 주 · 3 주/광역 · 4 도시·지형물 · 5 미국 도시
GEO_TYPE_PRECISION = {
    "1": "COUNTRY",
    "2": "REGION",
    "3": "REGION",
    "4": "CITY",
    "5": "CITY",
}
LOCATION_PRECISIONS = ("EXACT_SOURCE", "CITY", "REGION", "COUNTRY", "NONE")


def km_between(a_lat, a_lon, b_lat, b_lon):
    """두 점 사이 거리(km). 같은 평면 근사를 쓰는 곳이 저장소에 이미 셋 있다 —
    `article_dedup._km` · `gdelt-events.km_between` · `news-brief`. 값이 같아야 한다."""
    import math
    try:
        lat1, lon1, lat2, lon2 = float(a_lat), float(a_lon), float(b_lat), float(b_lon)
    except (TypeError, ValueError):
        return None
    mean = math.radians((lat1 + lat2) / 2.0)
    dx = (lon2 - lon1) * 111.320 * math.cos(mean)
    dy = (lat2 - lat1) * 110.574
    return math.sqrt(dx * dx + dy * dy)


def build_gazetteer(rows, cols=None, index=None):
    """GDELT 원본 export 행으로 지명 사전을 만든다. 외부 의존이 없다.

    `rows` 는 GDELT export CSV 행 목록, `index` 는 열 이름 → 위치 사전이다.
    ⚠️ `events/global.json` 에는 이 행이 없다 — 3G 는 이 함수를 쓰지 않는다.
    """
    if not rows or not index:
        return None, {}
    width = len(cols) if cols else max(index.values()) + 1
    gaz = {}
    for row in rows:
        if len(row) < width:
            continue
        for prefix in ("Action", "Actor1", "Actor2"):
            try:
                geo_type = row[index[prefix + "Geo_Type"]]
                full = row[index[prefix + "Geo_FullName"]] or ""
                lat = row[index[prefix + "Geo_Lat"]]
                lon = row[index[prefix + "Geo_Long"]]
            except (KeyError, IndexError):
                continue
            if geo_type not in ("2", "3", "4", "5"):
                continue                      # 나라(1)는 너무 넓어 검사에 못 쓴다
            if not full or not lat or not lon:
                continue
            name = re.sub(r"\(general\)", "", full.split(",")[0]).strip().lower()
            if len(name) < 5 or name in GAZ_STOP:
                continue
            try:
                gaz.setdefault(name, set()).add((round(float(lat), 2), round(float(lon), 2)))
            except ValueError:
                pass
    if not gaz:
        return None, {}
    pattern = re.compile(r"\b(" + "|".join(re.escape(n) for n in
                                          sorted(gaz, key=len, reverse=True)) + r")\b", re.I)
    return pattern, gaz


def place_doubt(title, lat, lon, pattern, gaz):
    """제목에 나온 지명이 전부 마커에서 멀면 True (위치가 의심스럽다).

    gdelt-events 가 실측으로 잡은 것들이 이 검사의 근거다 — 베를린 기사에 모스크바 마커,
    케임브리지 기사에 짐바브웨 마커, 사람 이름을 지명으로 잡은 경우.
    """
    if not title or not pattern:
        return False, []
    hits = {m.group(1).lower() for m in pattern.finditer(title)}
    if not hits:
        return False, []                      # 지명이 없으면 판단하지 않는다
    far = []
    for hit in hits:
        distances = [km_between(lat, lon, a, b) for a, b in gaz.get(hit, ())]
        distances = [d for d in distances if d is not None]
        if not distances:
            continue
        nearest = min(distances)
        if nearest <= FAR_KM:
            return False, []                  # 하나라도 가까우면 통과
        far.append({"name": hit, "km": round(nearest)})
    if not far:
        return False, []
    return True, far[:3]


def canonical_place(record):
    """결정 ⑥ 의 우선순위로 장소 하나를 정한다.

    돌려주는 것:
      {placeKey, basis, precision, doubt, doubtDetail, name, country, lat, lon}

    `basis` 는 어느 순위로 정해졌는지다 — 'PLACE_ID' · 'NAME' · 'UNKNOWN'.
    `doubt=True` 면 Truth 승격에 보수적으로 쓴다(확정 승격 금지).

    ⚠️ 좌표를 격자로 접어 키를 만들지 않는다. 결정 ⑥ 이 `lat3/lon3` 같은 새 규칙을
       금지했다. 좌표는 결합(`event_fusion`)이 거리로 쓰고, 키에는 넣지 않는다.
    """
    record = record or {}
    doubt = bool(record.get("placeDoubt"))
    doubt_detail = record.get("placeElsewhere") or []
    geo_type = str(record.get("geoType") or "")
    precision = GEO_TYPE_PRECISION.get(geo_type, "NONE")
    name = (record.get("place") or "").strip()
    country = (record.get("country") or "").strip()
    feature_id = str(record.get("featureId") or "").strip()

    # 1순위 — 의심되지 않은 gazetteer 식별자
    if feature_id and feature_id not in ("", "0", "-1") and not doubt:
        key, basis = "gdelt:feature:%s" % feature_id, "PLACE_ID"
    # 2순위 — 정규화한 이름 계층
    elif name:
        normalized = re.sub(r"\s+", " ", name).strip().lower()
        key = "name:%s" % ("|".join(p for p in (country.lower(), normalized) if p))
        basis = "NAME"
    # 3순위 — 모른다
    else:
        key, basis, precision = "unknown", "UNKNOWN", "NONE"

    return {
        "schema": SCHEMA,
        "placeKey": key,
        "basis": basis,
        "precision": precision,
        "doubt": doubt,
        "doubtDetail": list(doubt_detail)[:3],
        "name": name or None,
        "country": country or None,
        "lat": record.get("lat"),
        "lon": record.get("lon"),
    }
