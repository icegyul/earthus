"""대만 중앙기상서(CWA) 실황 관측 — 태풍 주변의 표면 근거용.

무엇을 받나
  O-A0001-001  전 측후소 시간 실황
  O-B0075-001  부이·조위소 해상 실황(가용할 때만)

왜 별도 파일인가
  태풍 유사 사례 계산은 지상·부이 관측을 "진로 예측"에 넣지 않는다. 대신
  중심 반경 안에서 어느 방위에 얼마나 신선한 온도·기압·바람 근거가 있는지 센다.
  CWA 원문은 대만 형식이라, 다른 수집기가 쓰는 표준 단위/필드로 정규화한 뒤
  wind/cwa-observations.json 하나로 남긴다. 원문에 없는 값은 0으로 만들지 않는다.

비밀값
  CWA 회원 인증코드는 /earthus/cwa/api-auth-code SecureString에만 둔다.
  URL·로그·S3 산출물 어디에도 넣지 않는다.
"""

import json
import math
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
AUTH_PARAMETER = os.environ.get("CWA_AUTH_PARAMETER", "/earthus/cwa/api-auth-code")
API = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/{}"
DATASETS = (("land", "O-A0001-001"), ("buoy", "O-B0075-001"))
DST = "wind/cwa-observations.json"
STATUS_DST = "wind/status/cwa-observations.json"
UA = {"User-Agent": "earthus/0.1 (+https://earthus.net)"}

s3 = boto3.client("s3", region_name=REGION)
ssm = boto3.client("ssm", region_name=REGION)


def write_status(now, state, reason, output_written, **details):
    """마지막 관측 자료를 덮지 않고 수집기 실행 상태만 별도 기록한다.

    ⚠️ EventBridge는 handler가 ``ok: false``를 반환해도 Lambda 호출 자체는 성공으로 센다.
    그래서 자료 파일의 나이만 보면 인증 실패·부분 실패와 단순 캐시 지연을 구분할 수 없다.
    비밀값과 provider 응답 본문은 넣지 않고 상태·개수만 공개 heartbeat에 남긴다.
    """
    doc = {
        "schema": 1,
        "collector": "cwa-observations",
        "generated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "state": state,
        "reason": reason,
        "outputKey": DST,
        "outputWritten": bool(output_written),
    }
    doc.update({key: value for key, value in details.items() if value is not None})
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    s3.put_object(Bucket=BUCKET, Key=STATUS_DST, Body=body,
                  ContentType="application/json; charset=utf-8", CacheControl="no-cache")
    return doc


def number(value, lo=None, hi=None):
    """CWA의 문자열/결측 기호를 숫자로만 바꾼다. 물리 범위 밖은 결측이다."""
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(out) or out in (-99, -999, -9999):
        return None
    if lo is not None and out < lo:
        return None
    if hi is not None and out > hi:
        return None
    return out


def first(obj, *keys):
    """서로 다른 CWA 자료셋의 철자 차이를 한 곳에서 흡수한다."""
    if not isinstance(obj, dict):
        return None
    for key in keys:
        if key in obj and obj[key] not in (None, "", "-99", "-999"):
            return obj[key]
    return None


def records_list(records, keys):
    """CWA는 자료셋마다 Station/Location 및 단일 객체·배열을 다르게 쓴다."""
    if not isinstance(records, dict):
        return []
    for key in keys:
        value = records.get(key)
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            return [value]
    return []


def coordinates(row):
    geo = row.get("GeoInfo") or row.get("geoInfo") or {}
    points = geo.get("Coordinates") or geo.get("coordinates") or []
    if isinstance(points, dict):
        points = [points]
    for point in points:
        lat = number(first(point, "StationLatitude", "Latitude", "lat"), -90, 90)
        lon = number(first(point, "StationLongitude", "Longitude", "lon"), -180, 180)
        if lat is not None and lon is not None:
            return round(lat, 4), round(lon, 4)
    # 일부 해상 자료는 GeoInfo 바깥에 좌표를 둔다. 그래도 둘 다 있을 때만 쓴다.
    lat = number(first(row, "StationLatitude", "Latitude", "lat"), -90, 90)
    lon = number(first(row, "StationLongitude", "Longitude", "lon"), -180, 180)
    return (round(lat, 4), round(lon, 4)) if lat is not None and lon is not None else (None, None)


def observed(row):
    for holder in (row.get("ObsTime"), row.get("Time"), row):
        if not isinstance(holder, dict):
            continue
        nested = holder.get("ObsTime") if isinstance(holder.get("ObsTime"), dict) else holder
        value = first(nested, "DateTime", "DataTime", "dateTime", "time")
        if value:
            return str(value)
    return None


def elements(row):
    value = row.get("WeatherElement") or row.get("weatherElement") or {}
    return value if isinstance(value, dict) else {}


def normalise(row, kind):
    lat, lon = coordinates(row)
    if lat is None or lon is None:
        return None
    station_id = str(first(row, "StationId", "StationID", "LocationId", "LocationID", "id") or "").strip()
    if not station_id:
        return None
    e = elements(row)
    rec = {
        "id": f"CWA-{station_id}",
        "sourceStationId": station_id,
        "name": str(first(row, "StationName", "LocationName", "StationNameEn", "LocationNameEn") or station_id),
        "country": "TW",
        "platform": kind,
        "lat": lat,
        "lon": lon,
        "observed": observed(row),
    }
    fields = (
        ("temp_c", ("AirTemperature", "Temperature", "AirTemp"), -95, 60),
        ("humid_pct", ("RelativeHumidity", "Humidity"), 0, 100),
        ("wind_ms", ("WindSpeed", "WindSpeed_10Min"), 0, 100),
        ("wind_dir", ("WindDirection", "WindDirection_10Min"), 0, 360),
        ("pres_hpa", ("AirPressure", "SeaSurfacePressure", "StationPressure"), 800, 1100),
        ("rain_mm", ("Precipitation", "NowPrecipitation", "Rainfall"), 0, 2000),
        ("wave_m", ("WaveHeight", "SignificantWaveHeight"), 0, 40),
        ("sea_temp_c", ("SeaSurfaceTemperature", "SeaTemperature"), -5, 45),
    )
    for target, names, lo, hi in fields:
        value = number(first(e, *names), lo, hi)
        if value is not None:
            rec[target] = round(value, 2)
    return rec


def fetch(dataset, token):
    request = urllib.request.Request(
        API.format(dataset), headers={**UA, "Authorization": token, "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=90) as response:
        doc = json.loads(response.read().decode("utf-8"))
    if not isinstance(doc, dict):
        raise RuntimeError("CWA response is not JSON object")
    if str(doc.get("success", "true")).lower() == "false":
        raise RuntimeError(str(doc.get("message") or "CWA returned success=false")[:180])
    return doc


def handler(event=None, context=None):
    now_dt = datetime.now(timezone.utc)
    try:
        token = ssm.get_parameter(Name=AUTH_PARAMETER, WithDecryption=True)["Parameter"]["Value"].strip()
    except Exception as exc:  # 값은 절대 로그에 넣지 않는다.
        reason = f"cwa-auth-parameter: {type(exc).__name__}"
        write_status(now_dt, "FAILED", reason, False)
        return {"ok": False, "reason": reason}
    if not token:
        write_status(now_dt, "FAILED", "cwa-auth-parameter-empty", False)
        return {"ok": False, "reason": "cwa-auth-parameter-empty"}

    stations, feeds, failures = [], [], []
    for kind, dataset in DATASETS:
        try:
            doc = fetch(dataset, token)
            rows = records_list(doc.get("records"), ("Station", "Location"))
            parsed = [normalise(row, kind) for row in rows]
            parsed = [row for row in parsed if row]
            stations.extend(parsed)
            feeds.append({"id": dataset, "platform": kind, "sourceCount": len(rows), "usableCount": len(parsed)})
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError, RuntimeError) as exc:
            # 한 자료셋 장애가 다른 CWA 관측을 지우지 않는다. 실패도 산출물에 남긴다.
            failures.append({"id": dataset, "platform": kind, "reason": str(exc)[:180]})

    # 시간·좌표가 같은 중복 행을 임의 평균 내지 않는다. 최신 같은 표본은 하나만 남긴다.
    unique = {}
    for row in stations:
        unique[(row["platform"], row["sourceStationId"], row.get("observed"))] = row
    stations = sorted(unique.values(), key=lambda row: (row["platform"], row["sourceStationId"]))
    if not stations:
        write_status(now_dt, "FAILED", "no-usable-cwa-observations", False,
                     feedCount=len(feeds), failureCount=len(failures))
        return {"ok": False, "reason": "no-usable-cwa-observations", "feeds": feeds, "failures": failures}

    now = now_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    doc = {
        "schema": 1,
        "generated": now,
        "source": "대만 중앙기상서(CWA) Open Data · O-A0001-001 / O-B0075-001",
        "sourceEn": "Taiwan CWA Open Data · O-A0001-001 / O-B0075-001",
        "terms": "CWA Open Data Platform terms apply. Source and observation time are retained; public redistribution review remains explicit.",
        "feeds": feeds,
        "failures": failures,
        "count": len(stations),
        "landCount": sum(row["platform"] == "land" for row in stations),
        "buoyCount": sum(row["platform"] == "buoy" for row in stations),
        "stations": stations,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8", CacheControl="public, max-age=600")
    status_state = "PARTIAL" if failures else "SUCCEEDED"
    status_reason = "partial-source-failure" if failures else "all-requested-feeds-processed"
    write_status(now_dt, status_state, status_reason, True,
                 dataGenerated=now, stationCount=len(stations),
                 landCount=doc["landCount"], buoyCount=doc["buoyCount"],
                 feedCount=len(feeds), failureCount=len(failures))
    print(f"[cwa] usable {len(stations)} · land {doc['landCount']} · buoy {doc['buoyCount']} · failures {len(failures)}")
    return {"ok": True, "count": len(stations), "land": doc["landCount"],
            "buoy": doc["buoyCount"], "failures": failures, "status": status_state}
