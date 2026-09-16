"""EARTHUS 공개 날씨 API — 한국, 캐시 기반 (v1)

왜 필요한가
  외부 개발자가 "earthus API 키로 날씨 기능을 넣고 싶다"고 다른 AI에게 물었더니
  그런 API가 존재하지 않아 대답을 못 받은 사건에서 시작됐다. 검색·GEO 설정 문제가
  아니라 애초에 공개 API 자체가 없었다.

이게 절대로 하지 않는 것
  기상청 API 허브를 실시간으로 호출하지 않는다. 허브 키 하나를 Lambda 15개가
  공유하고 있고(aws/KMA-HUB-BUDGET.md), 하루 쿼터가 빠듯해 공개 API 남용이
  본 앱 전체를 묵음(403)시킬 수 있다. 그래서 이 함수는 **이미 만들어진 캐시본만**
  읽는다 — kma-aws(현재 관측)와 kma-fcst(동네예보)가 각자 스케줄대로 갱신해 둔
  s3://<CACHE_BUCKET>/wind/kma-aws.json, wind/kma-fcst.json.

인증 — 아주 단순한 1차 버전
  자동 가입은 없다. 관리자가 s3://<CACHE_BUCKET>/app/public-api/keys.json 에
  키를 손으로 추가한다. 요청은 x-api-key 헤더로 보낸다.
  사용량 카운트는 app/public-api/usage/<YYYY-MM-DD>.json 에 베스트에포트로 적는다
  (동시 요청이 겹치면 카운트가 살짝 씹힐 수 있다 — 이 규모에선 감내한다.
   나중에 트래픽이 늘면 DynamoDB 원자 카운터로 옮긴다).

엔드포인트
  GET /v1/health                       — 키 없이 됨. 캐시 나이만 알려준다.
  GET /v1/weather?lat=&lon=            — 가장 가까운 관측지점 현재값 + 예보.
"""

import json
import os
import time
import urllib.parse
from datetime import datetime, timezone

import boto3

BUCKET = os.environ.get("CACHE_BUCKET", "earthus-cache-kr")
REGION = os.environ.get("CACHE_REGION", "us-east-2")
ALLOW_ORIGIN = os.environ.get("ALLOW_ORIGIN", "*")

KEYS_KEY = "app/public-api/keys.json"
USAGE_PREFIX = "app/public-api/usage/"
OBS_KEY = "wind/kma-aws.json"
FCST_KEY = "wind/kma-fcst.json"

DAILY_LIMIT_DEFAULT = 1000

_s3 = boto3.client("s3", region_name=REGION)

# 콜드 스타트 사이에 재사용 — 매 요청마다 관측소 736개짜리 JSON을 다시 받지 않는다.
_cache = {"obs": None, "obs_t": 0, "fcst": None, "fcst_t": 0, "keys": None, "keys_t": 0}
CACHE_TTL = 300  # 5분. 원본 갱신 주기(시간당)보다 훨씬 짧게 잡아 부담 없이 짧게 둔다.


def _get_json(key, cache_field, ttl=CACHE_TTL):
    now = time.time()
    if _cache[cache_field] is not None and now - _cache[cache_field + "_t"] < ttl:
        return _cache[cache_field]
    try:
        body = _s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
        data = json.loads(body)
    except _s3.exceptions.NoSuchKey:
        data = None
    _cache[cache_field] = data
    _cache[cache_field + "_t"] = now
    return data


def _haversine_km(lat1, lon1, lat2, lon2):
    from math import radians, sin, cos, atan2, sqrt
    r = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return r * 2 * atan2(sqrt(a), sqrt(1 - a))


def _nearest(points, lat, lon, lat_key="lat", lon_key="lon"):
    best, best_d = None, None
    for p in points:
        plat, plon = p.get(lat_key), p.get(lon_key)
        if plat is None or plon is None:
            continue
        d = _haversine_km(lat, lon, plat, plon)
        if best_d is None or d < best_d:
            best, best_d = p, d
    return best, best_d


def _reply(code, body, extra_headers=None):
    headers = {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": ALLOW_ORIGIN,
        "access-control-allow-headers": "content-type, x-api-key",
        "access-control-allow-methods": "GET, OPTIONS",
        "cache-control": "no-store",
    }
    if extra_headers:
        headers.update(extra_headers)
    return {"statusCode": code, "headers": headers, "body": json.dumps(body, ensure_ascii=False)}


def _check_key(headers):
    """x-api-key 검증 + 오늘치 사용량 베스트에포트 증가.
    반환: (ok, error_reply_or_None, key_str_or_None)"""
    key = None
    for k, v in (headers or {}).items():
        if k.lower() == "x-api-key":
            key = v
            break
    if not key:
        return False, _reply(401, {"error": "x-api-key 헤더가 필요합니다"}), None

    keys_doc = _get_json(KEYS_KEY, "keys", ttl=60)
    entry = (keys_doc or {}).get("keys", {}).get(key)
    if not entry or entry.get("active") is False:
        return False, _reply(403, {"error": "유효하지 않은 API 키입니다"}), None

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    usage_key = f"{USAGE_PREFIX}{today}.json"
    try:
        usage = json.loads(_s3.get_object(Bucket=BUCKET, Key=usage_key)["Body"].read())
    except _s3.exceptions.NoSuchKey:
        usage = {}
    except Exception:
        usage = {}

    limit = entry.get("dailyLimit", DAILY_LIMIT_DEFAULT)
    count = usage.get(key, 0)
    if count >= limit:
        return False, _reply(429, {"error": "오늘 호출 한도를 넘었습니다", "dailyLimit": limit}), None

    usage[key] = count + 1
    try:
        _s3.put_object(
            Bucket=BUCKET, Key=usage_key,
            Body=json.dumps(usage, ensure_ascii=False).encode("utf-8"),
            ContentType="application/json",
        )
    except Exception:
        pass  # 사용량 기록 실패는 요청 자체를 막을 이유가 아니다

    return True, None, key


def _handle_health():
    obs = _get_json(OBS_KEY, "obs")
    fcst = _get_json(FCST_KEY, "fcst")
    return _reply(200, {
        "status": "ok",
        "obsGeneratedAt": (obs or {}).get("generated"),
        "fcstGeneratedAt": (fcst or {}).get("generated"),
    })


def _handle_weather(qs):
    try:
        lat = float(qs.get("lat", [None])[0])
        lon = float(qs.get("lon", [None])[0])
    except (TypeError, ValueError):
        return _reply(400, {"error": "lat, lon 쿼리 파라미터가 필요합니다 (숫자)"})
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return _reply(400, {"error": "lat/lon 범위가 올바르지 않습니다"})

    obs = _get_json(OBS_KEY, "obs")
    fcst = _get_json(FCST_KEY, "fcst")
    if not obs or not fcst:
        return _reply(503, {"error": "캐시 자료를 아직 준비하지 못했습니다"})

    ob_station, ob_dist = _nearest(obs.get("stations", []), lat, lon)
    fc_point, fc_dist = _nearest(fcst.get("points", []), lat, lon)

    out = {
        "query": {"lat": lat, "lon": lon},
        "observed": None,
        "forecast": None,
        "sourceNote": "대한민국 기상청(공공누리 제1유형). 이 응답은 시간 단위로 캐시된 자료이며 실시간 재조회가 아닙니다.",
    }
    if ob_station:
        out["observed"] = {
            "stationId": ob_station.get("id"),
            "stationName": ob_station.get("name"),
            "distanceKm": round(ob_dist, 1) if ob_dist is not None else None,
            "observedAt": obs.get("observedKst"),
            "tempC": ob_station.get("temp_c"),
            "humidityPct": ob_station.get("humid_pct"),
            "windMs": ob_station.get("wind_ms"),
            "windDirDeg": ob_station.get("wind_dir"),
            "rainMm": ob_station.get("rain_mm"),
        }
    if fc_point:
        hourly = fc_point.get("hourly") or []
        out["forecast"] = {
            "stationId": fc_point.get("id"),
            "stationName": fc_point.get("name"),
            "distanceKm": round(fc_dist, 1) if fc_dist is not None else None,
            "baseKst": fc_point.get("baseKst"),
            "hourly": hourly[:12],
            "daily": fc_point.get("daily"),
        }
    return _reply(200, out)


def handler(event, context):
    method = ((event.get("requestContext") or {}).get("http") or {}).get("method", "GET")
    if method == "OPTIONS":
        return _reply(204, {})

    raw_path = event.get("rawPath", "/")
    qs = urllib.parse.parse_qs(event.get("rawQueryString", ""))
    headers = event.get("headers") or {}

    if raw_path.rstrip("/") in ("", "/v1/health", "/health"):
        return _handle_health()

    if raw_path.rstrip("/") in ("/v1/weather", "/weather"):
        ok, err, _key = _check_key(headers)
        if not ok:
            return err
        return _handle_weather(qs)

    return _reply(404, {"error": "없는 경로입니다", "available": ["/v1/health", "/v1/weather"]})
