"""서울 관광·인간 흐름 수집기.

공개 산출물
  app/tourism/seoul-flow.json          현재 공식 혼잡·공식 예측·집계 추세
  app/tourism/health.json              수집 범위와 provider 상태
  app/tourism/history-index.json       장소별 최근 집계 인구 이력
  app/tourism/history/YYYY/MM/DD/*.json  실행 당시 정규화 snapshot (불변 기록)

⚠️ 서울시 API는 한 번에 한 장소만 조회한다. 발급 키가 없을 때는 서울시가
   공개한 ``sample`` 키로 광화문·덕수궁 한 곳만 조회하며 121곳처럼 보이게 하지 않는다.
⚠️ 일반 인증키 3개는 ``SEOUL_OPEN_DATA_KEY_1..3``에서 읽어 장소 순서대로 균등
   분배한다. 키 값은 오류·health·공개 산출물에 절대 기록하지 않는다.
⚠️ 집계 인구에서 이동 방향·법적 수용력·안전 판정을 만들지 않는다.
"""

from __future__ import annotations

import json
import os
import statistics
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ.get("CACHE_BUCKET", "earthus-cache-kr")
REGION = os.environ.get("CACHE_REGION", "us-east-2")
LEGACY_SEOUL_KEY = os.environ.get("SEOUL_OPEN_DATA_KEY", "").strip()
SEOUL_KEYS = tuple(filter(None, (
    os.environ.get("SEOUL_OPEN_DATA_KEY_1", "").strip(),
    os.environ.get("SEOUL_OPEN_DATA_KEY_2", "").strip(),
    os.environ.get("SEOUL_OPEN_DATA_KEY_3", "").strip(),
)))
if not SEOUL_KEYS and LEGACY_SEOUL_KEY:
    SEOUL_KEYS = (LEGACY_SEOUL_KEY,)
CATALOG_KEY = "app/data/tourism/seoul-121-catalog.v1.json"
OUTPUT_KEY = "app/tourism/seoul-flow.json"
HEALTH_KEY = "app/tourism/health.json"
HISTORY_INDEX_KEY = "app/tourism/history-index.json"
KST = timezone(timedelta(hours=9))
SOURCE_URL = "https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do"
LEVEL_RANK = {"여유": 1, "보통": 2, "약간 붐빔": 3, "붐빔": 4}
LEVEL_COLOR = {1: "#48d7a0", 2: "#f0cf63", 3: "#f39a54", 4: "#ef5a67"}
USER_AGENT = "earthus-tourism-flow/1.0 (+https://earthus.net)"
PROCESSOR_VERSION = "tourism-flow-collector.v2"

s3 = boto3.client("s3", region_name=REGION)


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_seoul_time(value):
    try:
        parsed = datetime.strptime(str(value).strip(), "%Y-%m-%d %H:%M").replace(tzinfo=KST)
    except (TypeError, ValueError):
        return None
    return iso(parsed)


def number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def population_range(row, forecast=False):
    prefix = "FCST" if forecast else "AREA"
    low, high = number(row.get(f"{prefix}_PPLTN_MIN")), number(row.get(f"{prefix}_PPLTN_MAX"))
    if low is None or high is None:
        return None
    return {"min": int(low), "max": int(high)}


def load_catalog():
    raw = s3.get_object(Bucket=BUCKET, Key=CATALOG_KEY)["Body"].read()
    doc = json.loads(raw.decode("utf-8"))
    places = doc.get("places") or []
    if len(places) != 121:
        raise ValueError("OFFICIAL_CATALOG_NOT_121")
    return places


def fetch_area(name, key):
    encoded_name = urllib.parse.quote(str(name), safe="")
    encoded_key = urllib.parse.quote(str(key), safe="")
    url = f"http://openapi.seoul.go.kr:8088/{encoded_key}/json/citydata_ppltn/1/5/{encoded_name}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as response:
        doc = json.loads(response.read().decode("utf-8"))
    result = doc.get("RESULT") or {}
    if result.get("CODE") not in (None, "INFO-000"):
        raise RuntimeError(f"SEOUL_PROVIDER_{result.get('CODE', 'UNKNOWN')}")
    return doc


def safe_error_reason(error):
    value = str(error)
    if value.startswith("SEOUL_PROVIDER_") or value.startswith("OFFICIAL_CATALOG_"):
        if all(character.isalnum() or character in "_-" for character in value):
            return value[:80]
    return type(error).__name__.upper()[:80]


def official_rows(raw):
    rows = (raw or {}).get("SeoulRtd.citydata_ppltn") or []
    return rows if isinstance(rows, list) else [rows]


def normalize(raw, place, received_at, now):
    rows = official_rows(raw)
    if not rows:
        return None
    row = rows[0]
    observed_at = parse_seoul_time(row.get("PPLTN_TIME"))
    observed = datetime.fromisoformat(observed_at.replace("Z", "+00:00")) if observed_at else None
    age_min = max(0, (now - observed).total_seconds() / 60) if observed else None
    replacement = str(row.get("REPLACE_YN", "")).upper() == "Y"
    reasons = []
    if age_min is None or age_min > 120:
        state, label = "UNAVAILABLE", "자료 없음"
        reasons.append("OBSERVED_AT_MISSING" if age_min is None else "OBSERVATION_TOO_OLD")
    elif age_min > 15:
        state, label = "STALE", "지난 관측"
        reasons.append("OBSERVATION_STALE")
    elif replacement:
        state, label = "DEGRADED", "제한된 실시간"
        reasons.append("PROVIDER_REPLACEMENT_VALUE")
    else:
        state, label = "LIVE", "LIVE"

    level = str(row.get("AREA_CONGEST_LVL") or "").strip() or None
    rank = LEVEL_RANK.get(level)
    forecasts = []
    if str(row.get("FCST_YN", "")).upper() == "Y":
        for forecast in row.get("FCST_PPLTN") or []:
            at = parse_seoul_time(forecast.get("FCST_TIME"))
            forecast_level = str(forecast.get("FCST_CONGEST_LVL") or "").strip() or None
            if at:
                forecasts.append({
                    "at": at, "level": forecast_level, "rank": LEVEL_RANK.get(forecast_level),
                    "populationRange": population_range(forecast, True),
                    "sourceType": "OFFICIAL_FORECAST",
                })

    code = str(row.get("AREA_CD") or place.get("code") or "").strip()
    return {
        "id": f"earthus:tourism:seoul:{code}", "code": code,
        "category": place.get("category"), "nameKo": str(row.get("AREA_NM") or place.get("nameKo")),
        "nameEn": place.get("nameEn"), "state": state, "stateLabelKo": label,
        "reasonCodes": reasons, "observedAgeMinutes": round(age_min, 1) if age_min is not None else None,
        "position": {"lat": float(place["lat"]), "lon": float(place["lon"]),
                     "source": "서울시 주요 121장소 영역"},
        "official": {
            "level": level, "rank": rank, "message": str(row.get("AREA_CONGEST_MSG") or "").strip() or None,
            "populationRange": population_range(row), "color": LEVEL_COLOR.get(rank, "#9aa6b2"),
            "replacement": replacement, "sourceType": "OFFICIAL_OBSERVATION",
        },
        "forecast": forecasts,
        "flow": {
            "scalarTrend": None,
            "direction": {"state": "UNAVAILABLE", "value": None,
                          "reason": "OD 또는 이동 경로 근거가 없어 방향 화살표를 만들지 않습니다."},
        },
        "provenance": {
            "sourceId": "seoul-citydata-ppltn", "sourceName": "서울특별시 실시간 인구데이터",
            "sourceUrl": SOURCE_URL, "observedAt": observed_at, "receivedAt": received_at,
            "schemaVersion": "earthus.tourism-flow.v1", "processorVersion": PROCESSOR_VERSION,
            "license": "공공누리 제1유형", "redisplay": "출처표시 · 상업적 이용 및 변경 가능",
        },
    }


def read_history():
    try:
        raw = s3.get_object(Bucket=BUCKET, Key=HISTORY_INDEX_KEY)["Body"].read()
        doc = json.loads(raw.decode("utf-8"))
        return doc.get("places") or {}
    except Exception:  # 첫 실행 또는 손상된 보조 이력은 현재 관측까지 막지 않는다.
        return {}


def scalar_trend(rows):
    samples = []
    for row in rows:
        try:
            at = datetime.fromisoformat(row["observedAt"].replace("Z", "+00:00"))
            samples.append((at.timestamp(), float(row["midpoint"])))
        except (KeyError, TypeError, ValueError):
            continue
    samples = sorted(set(samples))
    if len(samples) < 3:
        return {"state": "UNAVAILABLE", "direction": "UNKNOWN", "perHour": None,
                "flowDirection": None, "method": "robust pairwise median slope",
                "reason": "관측 이력이 3개 미만입니다."}
    slopes = []
    for i, first in enumerate(samples):
        for second in samples[i + 1:]:
            hours = (second[0] - first[0]) / 3600
            if hours > 0:
                slopes.append((second[1] - first[1]) / hours)
    per_hour = statistics.median(slopes) if slopes else 0
    baseline = max(1, statistics.median(row[1] for row in samples))
    ratio = per_hour / baseline
    direction = "INCREASING" if ratio >= .08 else "DECREASING" if ratio <= -.08 else "STABLE"
    return {"state": "READY", "direction": direction, "perHour": round(per_hour),
            "relativePerHour": ratio, "flowDirection": None, "sourceType": "DERIVED_TREND",
            "method": "robust pairwise median slope", "sampleCount": len(samples)}


def update_history(history, places):
    cutoff = datetime.now(timezone.utc).timestamp() - 48 * 3600
    for place in places:
        observed_at = place["provenance"].get("observedAt")
        bounds = place["official"].get("populationRange")
        if observed_at and bounds:
            rows = history.setdefault(place["code"], [])
            record = {"observedAt": observed_at, "midpoint": (bounds["min"] + bounds["max"]) / 2}
            if not any(item.get("observedAt") == observed_at for item in rows):
                rows.append(record)
            kept = []
            for item in rows:
                try:
                    when = datetime.fromisoformat(item["observedAt"].replace("Z", "+00:00")).timestamp()
                except (KeyError, TypeError, ValueError):
                    continue
                if when >= cutoff:
                    kept.append(item)
            history[place["code"]] = kept[-576:]
        place["flow"]["scalarTrend"] = scalar_trend(history.get(place["code"], []))
    return history


def put_json(key, doc, cache_control):
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    s3.put_object(Bucket=BUCKET, Key=key, Body=body,
                  ContentType="application/json; charset=utf-8", CacheControl=cache_control)


def build_snapshot(responses, catalog, mode, received_at, now, error_count=0):
    by_code = {place["code"]: place for place in catalog}
    by_name = {place["nameKo"]: place for place in catalog}
    places = []
    for raw in responses:
        row = (official_rows(raw) or [{}])[0]
        place = by_code.get(str(row.get("AREA_CD") or "")) or by_name.get(str(row.get("AREA_NM") or ""))
        if place:
            normalized = normalize(raw, place, received_at, now)
            if normalized:
                places.append(normalized)
    places.sort(key=lambda place: place["code"])
    history = update_history(read_history(), places)
    put_json(HISTORY_INDEX_KEY, {"schemaVersion": "earthus.tourism-history.v1",
                                 "updatedAt": received_at, "places": history}, "no-cache")
    states = [place["state"] for place in places]
    state = next((candidate for candidate in ("LIVE", "DEGRADED", "STALE") if candidate in states),
                 "UNAVAILABLE")
    available = sum(place["state"] != "UNAVAILABLE" for place in places)
    requested = 121 if mode == "FULL" else 1
    return {
        "schemaVersion": "earthus.tourism-flow.v1", "generatedAt": received_at, "state": state,
        "provider": {"id": "seoul-citydata-ppltn", "mode": mode,
                     "endpointClass": "OFFICIAL_PUBLIC_API"},
        "coverage": {
            "available": available, "total": 121, "requested": requested,
            "responses": len(places), "errorCount": error_count,
            "fullCoverage": mode == "FULL" and available == 121,
            "noteKo": (f"서울시 공식 {available}/121곳 응답" if mode == "FULL"
                       else "서울시 샘플 키 범위 · 광화문·덕수궁 1곳만 공식 조회"),
        },
        "quality": {
            "live": states.count("LIVE"), "degraded": states.count("DEGRADED"),
            "stale": states.count("STALE"), "unavailable": states.count("UNAVAILABLE"),
            "withOfficialForecast": sum(bool(place["forecast"]) for place in places),
            "withDirectionEvidence": 0,
        },
        "places": places,
        "source": {"name": "서울특별시 실시간 인구데이터", "url": SOURCE_URL,
                   "license": "공공누리 제1유형"},
    }


def handler(event, context):
    started = datetime.now(timezone.utc)
    received_at = iso(started)
    mode = "FULL" if SEOUL_KEYS else "SAMPLE"
    provider_keys = SEOUL_KEYS or ("sample",)
    key_stats = [{"slot": index + 1, "requested": 0, "responses": 0, "errors": 0}
                 for index in range(len(SEOUL_KEYS))]
    errors = []
    try:
        catalog = load_catalog()
        requested = catalog if mode == "FULL" else [next(place for place in catalog if place["code"] == "POI009")]
        responses = []
        with ThreadPoolExecutor(max_workers=10 if mode == "FULL" else 1) as pool:
            futures = {}
            for index, place in enumerate(requested):
                slot_index = index % len(provider_keys)
                if mode == "FULL":
                    key_stats[slot_index]["requested"] += 1
                future = pool.submit(fetch_area, place["nameKo"], provider_keys[slot_index])
                futures[future] = (place, slot_index)
            for future in as_completed(futures):
                place, slot_index = futures[future]
                try:
                    responses.append(future.result())
                    if mode == "FULL":
                        key_stats[slot_index]["responses"] += 1
                except Exception as error:  # provider 오류는 장소명과 코드만 기록한다. 키는 기록하지 않는다.
                    if mode == "FULL":
                        key_stats[slot_index]["errors"] += 1
                    errors.append({"code": place["code"], "reason": safe_error_reason(error)})
        if not responses:
            raise RuntimeError("SEOUL_PROVIDER_NO_RESPONSES")
        snapshot = build_snapshot(responses, catalog, mode, received_at, started, len(errors))
        put_json(OUTPUT_KEY, snapshot, "public, max-age=120")
        stamp = started.strftime("%Y/%m/%d/%H%M%S")
        put_json(f"app/tourism/history/{stamp}.json", snapshot, "public, max-age=31536000, immutable")
        observed_times = [place.get("provenance", {}).get("observedAt")
                          for place in snapshot["places"]
                          if place.get("provenance", {}).get("observedAt")]
        credential_pool = {
            "configured": len(SEOUL_KEYS),
            "used": sum(slot["requested"] > 0 for slot in key_stats),
            "slots": key_stats,
        }
        health = {
            "schemaVersion": "earthus.tourism-health.v1", "generatedAt": received_at,
            "state": "SUCCEEDED" if not errors else "PARTIAL", "mode": mode,
            "reason": ("PARTIAL_PROVIDER_ERRORS" if errors else
                       "SAMPLE_KEY_LIMITS_COVERAGE" if mode == "SAMPLE" else None),
            "lastAttemptAt": received_at, "lastSuccessAt": received_at,
            "sourceObservedAt": max(observed_times) if observed_times else None,
            "outputWritten": True, "sampleCount": len(snapshot["places"]),
            "missing": max(0, 121 - snapshot["coverage"]["available"]),
            "rejected": len(errors), "failureCount": len(errors),
            "quota": "UNKNOWN", "estimatedCost": "UNKNOWN",
            "revision": PROCESSOR_VERSION, "credentialPool": credential_pool,
            "requested": len(requested), "responses": len(responses), "errors": errors,
            "coverage": snapshot["coverage"],
            "providers": {
                "seoulPopulation": {"state": snapshot["state"], "source": SOURCE_URL},
                "tourismAccessibility": {"state": "UNAVAILABLE",
                    "reason": "접근성·운영시간 provider가 현재 공식 응답에 연결되지 않음"},
            },
        }
        put_json(HEALTH_KEY, health, "no-cache")
        return {"ok": True, "mode": mode, "places": len(snapshot["places"]),
                "live": snapshot["quality"]["live"], "errors": len(errors),
                "keysConfigured": credential_pool["configured"],
                "keysUsed": credential_pool["used"]}
    except Exception as error:
        last_success = None
        try:
            previous = json.loads(s3.get_object(Bucket=BUCKET, Key=HEALTH_KEY)["Body"].read())
            last_success = previous.get("lastSuccessAt")
        except Exception:  # 첫 실패거나 이전 health가 손상됐으면 성공 시각을 만들지 않는다.
            pass
        health = {"schemaVersion": "earthus.tourism-health.v1", "generatedAt": received_at,
                  "state": "FAILED", "mode": mode, "reason": safe_error_reason(error),
                  "lastAttemptAt": received_at, "lastSuccessAt": last_success,
                  "sourceObservedAt": None, "outputWritten": False,
                  "sampleCount": 0, "missing": 121 if mode == "FULL" else 1,
                  "rejected": len(errors), "failureCount": max(1, len(errors)),
                  "quota": "UNKNOWN", "estimatedCost": "UNKNOWN",
                  "revision": PROCESSOR_VERSION,
                  "credentialPool": {
                      "configured": len(SEOUL_KEYS),
                      "used": sum(slot["requested"] > 0 for slot in key_stats),
                      "slots": key_stats,
                  },
                  "providers": {"seoulPopulation": {"state": "UNAVAILABLE"}}}
        put_json(HEALTH_KEY, health, "no-cache")
        raise
