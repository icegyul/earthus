"""Tokyo VAAC 예보 도형과 이후 관측 도형의 비공개 기준선 검증.

공식 +6/+12/+18시간 화산재 도형을 같은 화산의 이후 관측 도형과 유효시각 기준으로 짝짓는다.
이 결과는 EARTHUS 예보가 아니며, 향후 EARTHUS 수송 계산을 같은 지표로 비교할 기준선이다.
독립 사건 10건이 쌓이기 전에는 LAB 보고서나 지도 경로에 공개하지 않는다.
"""

from __future__ import annotations

import json
import hashlib
import math
import os
import statistics
from collections import defaultdict
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

BUCKET = os.environ.get("CACHE_BUCKET", "earthus-cache-kr")
REGION = os.environ.get("CACHE_REGION", "us-east-2")
INPUT_KEY = "events/volcanic-ash-vaac.json"
OUTPUT_KEY = "archive/vaac-validation/latest.json"
ARCHIVE = "archive/vaac-validation"
MATCH_TOLERANCE_MINUTES = 90
SAMPLE_STEP_KM = 50.0
MIN_POLYGON_POINTS = 3

s3 = boto3.client("s3", region_name=REGION)


def parse_time(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def haversine(a, b):
    radius = 6371.0088
    lat1, lon1 = math.radians(float(a["lat"])), math.radians(float(a["lon"]))
    lat2, lon2 = math.radians(float(b["lat"])), math.radians(float(b["lon"]))
    dlat = lat2 - lat1
    dlon = (lon2 - lon1 + math.pi) % (2 * math.pi) - math.pi
    term = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * radius * math.asin(min(1.0, math.sqrt(term)))


def _interpolate(a, b, fraction):
    lat = float(a["lat"]) + (float(b["lat"]) - float(a["lat"])) * fraction
    lon_a, lon_b = float(a["lon"]), float(b["lon"])
    delta = (lon_b - lon_a + 180) % 360 - 180
    lon = (lon_a + delta * fraction + 540) % 360 - 180
    return {"lat": lat, "lon": lon}


def sample_polygon(points, step_km=SAMPLE_STEP_KM):
    """도형 꼭짓점 밀도 차이를 줄이도록 닫힌 변을 약 50km 간격으로 재표본한다."""
    if len(points or []) < MIN_POLYGON_POINTS:
        return []
    samples = []
    for index, start in enumerate(points):
        end = points[(index + 1) % len(points)]
        segment_km = haversine(start, end)
        divisions = max(1, math.ceil(segment_km / step_km))
        samples.extend(_interpolate(start, end, part / divisions) for part in range(divisions))
    return samples


def spherical_centroid(points):
    if not points:
        return None
    x = y = z = 0.0
    for point in points:
        lat, lon = math.radians(float(point["lat"])), math.radians(float(point["lon"]))
        x += math.cos(lat) * math.cos(lon)
        y += math.cos(lat) * math.sin(lon)
        z += math.sin(lat)
    lon = math.atan2(y, x)
    hyp = math.hypot(x, y)
    lat = math.atan2(z, hyp)
    return {"lat": math.degrees(lat), "lon": math.degrees(lon)}


def polygon_error(forecast, observed):
    forecast_samples = sample_polygon(forecast)
    observed_samples = sample_polygon(observed)
    if not forecast_samples or not observed_samples:
        return None

    def nearest(source, target):
        return [min(haversine(point, candidate) for candidate in target) for point in source]

    forward = nearest(forecast_samples, observed_samples)
    reverse = nearest(observed_samples, forecast_samples)
    all_nearest = forward + reverse
    return {
        "forecastSampleN": len(forecast_samples),
        "observedSampleN": len(observed_samples),
        "centroidErrorKm": round(haversine(spherical_centroid(forecast_samples),
                                            spherical_centroid(observed_samples)), 1),
        "symmetricMeanNearestKm": round(statistics.fmean(all_nearest), 1),
        "symmetricHausdorffKm": round(max(all_nearest), 1),
    }


def _event_sessions(advisories):
    """발행기관 종료 선언 또는 36시간 공백을 독립 사건 경계로 센다."""
    grouped = defaultdict(list)
    for item in advisories:
        key = item.get("volcanoNumber") or item.get("volcano")
        issued = parse_time(item.get("issuedAt"))
        if key and issued:
            grouped[key].append((issued, item))
    sessions = []
    for key, rows in grouped.items():
        rows.sort(key=lambda row: row[0])
        current = []
        previous_time = None
        previous_closed = False
        for issued, item in rows:
            if current and (previous_closed or (issued - previous_time).total_seconds() > 36 * 3600):
                sessions.append(current)
                current = []
            current.append(item)
            previous_time = issued
            previous_closed = bool(item.get("closedByIssuer"))
        if current:
            sessions.append(current)
    return sessions


def _session_membership(advisories):
    sessions = _event_sessions(advisories)
    membership = {}
    for session in sessions:
        first = min((item.get("issuedAt") or "") for item in session)
        key = session[0].get("volcanoNumber") or session[0].get("volcano")
        session_id = f"TOKYO:{key}:{first}"
        for item in session:
            if item.get("id"):
                membership[item["id"]] = session_id
    return sessions, membership


def pair_forecasts(advisories):
    _, membership = _session_membership(advisories)
    observations = defaultdict(list)
    for item in advisories:
        key = item.get("volcanoNumber") or item.get("volcano")
        session_id = membership.get(item.get("id"))
        observed_at = parse_time(item.get("observedAt"))
        issued_at = parse_time(item.get("issuedAt"))
        polygon = (item.get("observation") or {}).get("polygon") or []
        if key and session_id and observed_at and issued_at and len(polygon) >= MIN_POLYGON_POINTS:
            observations[(key, session_id)].append((observed_at, issued_at, item, polygon))

    pairs = []
    unmatched = []
    for advisory in advisories:
        key = advisory.get("volcanoNumber") or advisory.get("volcano")
        session_id = membership.get(advisory.get("id"))
        forecast_issued = parse_time(advisory.get("issuedAt"))
        for forecast in advisory.get("forecasts") or []:
            polygon = forecast.get("polygon") or []
            valid_at = parse_time(forecast.get("validAt"))
            if not forecast.get("available") or len(polygon) < MIN_POLYGON_POINTS or not valid_at:
                continue
            candidates = []
            for observed_at, observed_issued, observed_item, observed_polygon in observations.get((key, session_id), []):
                if forecast_issued and observed_issued <= forecast_issued:
                    continue
                gap_minutes = abs((observed_at - valid_at).total_seconds()) / 60
                if gap_minutes <= MATCH_TOLERANCE_MINUTES:
                    candidates.append((gap_minutes, observed_at, observed_item, observed_polygon))
            if not candidates:
                unmatched.append({
                    "forecastAdvisoryId": advisory.get("id"),
                    "leadHours": forecast.get("leadHours"),
                    "validAt": forecast.get("validAt"),
                    "reason": "no later observed polygon within 90 minutes",
                })
                continue
            gap_minutes, observed_at, observed_item, observed_polygon = min(candidates, key=lambda row: row[0])
            error = polygon_error(polygon, observed_polygon)
            if not error:
                continue
            pairs.append({
                "id": f"{advisory.get('id')}:+{forecast.get('leadHours')}:{observed_item.get('id')}",
                "volcano": advisory.get("volcano"),
                "volcanoNumber": advisory.get("volcanoNumber"),
                "eventSessionId": session_id,
                "forecastAdvisoryId": advisory.get("id"),
                "forecastIssuedAt": advisory.get("issuedAt"),
                "leadHours": forecast.get("leadHours"),
                "forecastValidAt": forecast.get("validAt"),
                "observedAdvisoryId": observed_item.get("id"),
                "observedAt": observed_at.isoformat().replace("+00:00", "Z"),
                "timeGapMinutes": round(gap_minutes),
                **error,
            })
    return pairs, unmatched


def _summary(pairs):
    result = {}
    for lead in (6, 12, 18):
        rows = [item for item in pairs if item["leadHours"] == lead]
        if not rows:
            result[str(lead)] = {"n": 0}
            continue
        result[str(lead)] = {
            "n": len(rows),
            "centroidMaeKm": round(statistics.fmean(item["centroidErrorKm"] for item in rows), 1),
            "centroidMedianKm": round(statistics.median(item["centroidErrorKm"] for item in rows), 1),
            "shapeMeanKm": round(statistics.fmean(item["symmetricMeanNearestKm"] for item in rows), 1),
            "hausdorffMeanKm": round(statistics.fmean(item["symmetricHausdorffKm"] for item in rows), 1),
        }
    return result


def build(document, now=None):
    now = now or datetime.now(timezone.utc)
    advisories = document.get("advisories") or []
    pairs, unmatched = pair_forecasts(advisories)
    sessions = _event_sessions(advisories)
    sessions_with_pairs = {item["eventSessionId"] for item in pairs}
    stable = json.dumps({
        "sourceContentHash": document.get("contentHash"),
        "pairs": pairs,
        "unmatched": unmatched,
    }, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {
        "schemaVersion": 1,
        "generatedAt": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "status": "INTERNAL_BASELINE",
        "public": False,
        "reportPublished": False,
        "source": document.get("source"),
        "sourceGeneratedAt": document.get("generatedAt"),
        "contentHash": hashlib.sha256(stable).hexdigest(),
        "method": {
            "id": "earthus.vaac-polygon-baseline.v1",
            "matchToleranceMinutes": MATCH_TOLERANCE_MINUTES,
            "polygonSampleStepKm": SAMPLE_STEP_KM,
            "metrics": ["spherical centroid distance", "symmetric mean nearest distance",
                        "symmetric Hausdorff distance"],
            "sessionBoundary": "issuer NO FURTHER ADVISORIES or gap over 36 hours",
            "notForecast": True,
        },
        "advisoryN": len(advisories),
        "eventSessionN": len(sessions),
        "eventSessionWithPairN": len(sessions_with_pairs),
        "pairN": len(pairs),
        "unmatchedForecastN": len(unmatched),
        "byLeadHours": _summary(pairs),
        "pairs": pairs,
        "unmatched": unmatched,
        "gate": {
            "requiredIndependentEvents": 10,
            "currentIndependentEventsWithPairs": len(sessions_with_pairs),
            "passed": len(sessions_with_pairs) >= 10,
            "labReportAllowed": False,
            "reasonKo": "공식 기관 예보의 기준선 검증일 뿐 EARTHUS 당시 계산 회차가 없어 LAB 종료 보고서를 만들지 않습니다.",
        },
    }


def handler(event, context):
    document = json.loads(s3.get_object(Bucket=BUCKET, Key=INPUT_KEY)["Body"].read())
    payload = build(document)
    previous = None
    try:
        previous = json.loads(s3.get_object(Bucket=BUCKET, Key=OUTPUT_KEY)["Body"].read())
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") not in ("NoSuchKey", "404", "AccessDenied"):
            raise
    changed = not previous or previous.get("contentHash") != payload["contentHash"]
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    s3.put_object(Bucket=BUCKET, Key=OUTPUT_KEY, Body=body,
                  ContentType="application/json; charset=utf-8", CacheControl="private, no-store")
    if changed:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        s3.put_object(Bucket=BUCKET, Key=f"{ARCHIVE}/{stamp}.json", Body=body,
                      ContentType="application/json; charset=utf-8", CacheControl="private, no-store")
    return {"ok": True, "public": False, "changed": changed, "pairN": payload["pairN"],
            "eventSessionWithPairN": payload["eventSessionWithPairN"],
            "gatePassed": payload["gate"]["passed"]}
