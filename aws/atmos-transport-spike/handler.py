"""대기 이동 공통 엔진의 첫 비공개 재현 스파이크.

현재 FIRMS 열점군에서 500·700·850hPa 바람만 따라간 세 개의 민감도 경로를 만든다.
연기 주입고도·침강·강수 세정·화학수송을 계산하지 않으므로 **연기 예측이 아니다**.

출력은 공개 경로와 LAB 보고서에 쓰지 않는다.
  archive/atmos-transport-spike/latest.json
  archive/atmos-transport-spike/YYYYMMDDHHMM.json

이 스파이크의 목적은 시각 정렬, 벡터 적분, 결측·분산 기록을 검증하는 것이다. CAMS 직접
화학수송 자료와 과거 사건 사후검증이 붙기 전에는 중심 참고선이나 도달 시각을 공개하지 않는다.
"""

from __future__ import annotations

import json
import math
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ.get("CACHE_BUCKET", "earthus-cache-kr")
REGION = os.environ.get("CACHE_REGION", "us-east-2")
FIRE_KEY = "events/wildfire.json"
AIR_KEY = "wind/air.json"
ARCHIVE = "archive/atmos-transport-spike"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

LEVELS = (850, 700, 500)
STEP_HOURS = 3
LEADS = tuple(range(0, 25, STEP_HOURS))
MAX_SOURCES = 6
MAX_INPUT_AGE_HOURS = 6
ASIA_BOUNDS = {"latFrom": 5.0, "latTo": 75.0, "lonFrom": 80.0, "lonTo": 180.0}
UA = {"User-Agent": "earthus/0.1 (+https://earthus.net)"}

s3 = boto3.client("s3", region_name=REGION)


def parse_time(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def destination(lat, lon, toward_deg, distance_km):
    """구면 대권을 따라 이동한 좌표. 경도는 -180..180으로 정규화한다."""
    radius = 6371.0088
    angular = distance_km / radius
    bearing = math.radians(toward_deg)
    lat1, lon1 = math.radians(lat), math.radians(lon)
    lat2 = math.asin(math.sin(lat1) * math.cos(angular)
                     + math.cos(lat1) * math.sin(angular) * math.cos(bearing))
    lon2 = lon1 + math.atan2(
        math.sin(bearing) * math.sin(angular) * math.cos(lat1),
        math.cos(angular) - math.sin(lat1) * math.sin(lat2),
    )
    return round(math.degrees(lat2), 5), round((math.degrees(lon2) + 540) % 360 - 180, 5)


def toward_from_wind(from_deg):
    """기상 풍향(불어오는 쪽)을 이동 방향(가는 쪽)으로 바꾼다."""
    return (float(from_deg) + 180.0) % 360.0


def _s3_json(key):
    return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())


def select_sources(document, now):
    generated = parse_time(document.get("generated"))
    if not generated:
        raise RuntimeError("wildfire generated time missing")
    age_h = (now - generated).total_seconds() / 3600
    if age_h < -1 or age_h > MAX_INPUT_AGE_HOURS:
        raise RuntimeError(f"wildfire input stale: {age_h:.1f}h")
    selected = []
    for fire in document.get("items") or []:
        try:
            lat, lon, frp = float(fire["lat"]), float(fire["lon"]), float(fire["frp"])
        except (KeyError, TypeError, ValueError):
            continue
        if not (ASIA_BOUNDS["latFrom"] <= lat <= ASIA_BOUNDS["latTo"]
                and ASIA_BOUNDS["lonFrom"] <= lon <= ASIA_BOUNDS["lonTo"]):
            continue
        # 열점군을 산불로 확정하지 않는다. 여러 번 이어진 고신뢰 군집만 계산 입력 후보로 둔다.
        if int(fire.get("seenCount") or 0) < 2 or int(fire.get("highConf") or 0) < 1:
            continue
        selected.append({
            "id": str(fire.get("fid") or f"heat-{lat:.3f}-{lon:.3f}"),
            "lat": lat, "lon": lon, "frpMw": frp,
            "detectionsN": int(fire.get("count") or 0),
            "highConfidenceN": int(fire.get("highConf") or 0),
            "firstSeen": fire.get("firstSeen"), "lastSeen": fire.get("lastSeen"),
            "satellites": fire.get("sats") or [],
            "notConfirmedWildfire": True,
        })
    return sorted(selected, key=lambda item: item["frpMw"], reverse=True)[:MAX_SOURCES], generated


def _forecast(points):
    fields = []
    for level in LEVELS:
        fields.extend((f"wind_speed_{level}hPa", f"wind_direction_{level}hPa"))
    query = urllib.parse.urlencode({
        "latitude": ",".join(f"{point['lat']:.5f}" for point in points),
        "longitude": ",".join(f"{point['lon']:.5f}" for point in points),
        "hourly": ",".join(fields),
        "forecast_days": 2,
        "timezone": "UTC",
        "wind_speed_unit": "ms",
    })
    request = urllib.request.Request(f"{FORECAST_URL}?{query}", headers=UA)
    with urllib.request.urlopen(request, timeout=75) as response:
        payload = json.loads(response.read())
    rows = payload if isinstance(payload, list) else [payload]
    if len(rows) != len(points):
        raise RuntimeError(f"forecast point mismatch: {len(rows)}/{len(points)}")
    return rows


def _at(row, target, level):
    hourly = row.get("hourly") or {}
    times = []
    for raw in hourly.get("time") or []:
        try:
            times.append(datetime.strptime(raw, "%Y-%m-%dT%H:%M").replace(tzinfo=timezone.utc))
        except (TypeError, ValueError):
            times.append(None)
    candidates = [(abs((stamp - target).total_seconds()), index, stamp)
                  for index, stamp in enumerate(times) if stamp]
    if not candidates:
        return None
    gap, index, stamp = min(candidates)
    if gap > 90 * 60:
        return None
    try:
        speed = hourly[f"wind_speed_{level}hPa"][index]
        direction = hourly[f"wind_direction_{level}hPa"][index]
        if speed is None or direction is None:
            return None
        return {"speedMs": float(speed), "fromDeg": float(direction), "validAt": stamp}
    except (KeyError, IndexError, TypeError, ValueError):
        return None


def _air_at(document, lat, lon):
    try:
        res = float(document["res"]); lat0 = float(document["lat0"]); lon0 = float(document["lon0"])
        nx, ny = int(document["nx"]), int(document["ny"])
        ix = max(0, min(nx - 1, round((lon - lon0) / res)))
        iy = max(0, min(ny - 1, round((lat - lat0) / res)))
        index = iy * nx + ix
        return {
            "cellLat": round(lat0 + iy * res, 2), "cellLon": round(lon0 + ix * res, 2),
            "resolutionDeg": res, "validAt": document.get("time"),
            "aod": document.get("aod", [])[index],
            "pm25UgM3": document.get("pm25", [])[index],
            "dustUgM3": document.get("dust", [])[index],
            "source": document.get("source"),
            "cannotIdentifyOrigin": True,
        }
    except (KeyError, IndexError, TypeError, ValueError):
        return None


def integrate(sources, start):
    states = []
    for source in sources:
        for level in LEVELS:
            states.append({
                "sourceId": source["id"], "levelHpa": level,
                "lat": source["lat"], "lon": source["lon"],
                "points": [{"leadHour": 0, "lat": source["lat"], "lon": source["lon"],
                            "validAt": start.strftime("%Y-%m-%dT%H:%M:00Z")}],
                "missingReason": None,
            })
    for lead in LEADS[:-1]:
        active = [state for state in states if not state["missingReason"]]
        if not active:
            break
        rows = _forecast(active)
        target = start + timedelta(hours=lead)
        for state, row in zip(active, rows):
            wind = _at(row, target, state["levelHpa"])
            if not wind:
                state["missingReason"] = f"wind missing at +{lead}h"
                continue
            distance_km = wind["speedMs"] * STEP_HOURS * 3.6
            lat, lon = destination(state["lat"], state["lon"], toward_from_wind(wind["fromDeg"]), distance_km)
            state["lat"], state["lon"] = lat, lon
            state["points"].append({
                "leadHour": lead + STEP_HOURS, "lat": lat, "lon": lon,
                "validAt": (start + timedelta(hours=lead + STEP_HOURS)).strftime("%Y-%m-%dT%H:%M:00Z"),
                "windValidAt": wind["validAt"].strftime("%Y-%m-%dT%H:%M:00Z"),
                "windFromDeg": round(wind["fromDeg"]),
                "towardDeg": round(toward_from_wind(wind["fromDeg"])),
                "windSpeedMs": round(wind["speedMs"], 1),
            })
    return states


def build(now=None):
    now = now or datetime.now(timezone.utc)
    fire_doc = _s3_json(FIRE_KEY)
    air_doc = _s3_json(AIR_KEY)
    sources, fire_time = select_sources(fire_doc, now)
    if not sources:
        raise RuntimeError("no eligible heat clusters in Asia bounds")
    start = now.replace(minute=0, second=0, microsecond=0)
    scenarios = integrate(sources, start)
    for source in sources:
        source["airEvidenceAtSource"] = _air_at(air_doc, source["lat"], source["lon"])
    for scenario in scenarios:
        scenario["airEvidenceAtEnd"] = _air_at(air_doc, scenario["lat"], scenario["lon"])

    return {
        "schemaVersion": 1,
        "generatedAt": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "status": "INTERNAL_SPIKE",
        "public": False,
        "reportPublished": False,
        "input": {
            "fireSource": fire_doc.get("source"), "fireGeneratedAt": fire_time.isoformat().replace("+00:00", "Z"),
            "airSource": air_doc.get("source"), "airValidAt": air_doc.get("time"),
            "bounds": ASIA_BOUNDS, "sourceN": len(sources),
        },
        "method": {
            "id": "earthus.atmos-wind-sensitivity.v1",
            "validTimeAlignment": True,
            "levelsHpa": list(LEVELS), "stepHours": STEP_HOURS, "leadHours": list(LEADS),
            "windSource": "Open-Meteo best-match numerical weather model",
            "separateAltitudeScenarios": True,
            "centralLine": False,
            "notIncluded": [
                "smoke injection height", "emission amount", "turbulent diffusion",
                "wet and dry deposition", "precipitation scavenging", "aerosol chemistry",
                "official smoke or volcanic-ash dispersion model",
            ],
            "notForecast": True,
        },
        "sources": sources,
        "scenarios": scenarios,
        "limits": {
            "ko": "FIRMS 열점군을 실제 산불로 확정하지 않으며, 세 고도 바람만 따라간 민감도 계산입니다. 연기·화산재 경로, 도달 시각, 건강·항공 안전 판단에 쓰면 안 됩니다.",
            "en": "FIRMS heat clusters are not confirmed wildfires. These are wind-only altitude sensitivity paths, not smoke/ash tracks or arrival and safety guidance.",
        },
    }


def handler(event, context):
    payload = build()
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    generated = parse_time(payload["generatedAt"])
    stamp = generated.strftime("%Y%m%d%H%M") if generated else datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    for key in (f"{ARCHIVE}/{stamp}.json", f"{ARCHIVE}/latest.json"):
        s3.put_object(Bucket=BUCKET, Key=key, Body=body,
                      ContentType="application/json; charset=utf-8", CacheControl="private, no-store")
    complete = sum(len(item["points"]) == len(LEADS) for item in payload["scenarios"])
    return {"ok": True, "public": False, "sourceN": len(payload["sources"]),
            "scenarioN": len(payload["scenarios"]), "completeN": complete}
