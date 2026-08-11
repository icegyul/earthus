"""황사·미세먼지 이동 계산을 위한 모델·관측 동시 증거 보존.

현재 CAMS 기반 5° 격자와 AirKorea 측정소 실측을 같은 회차에 묶는다. 이력 없이 한 장면만
보고 발원지나 이동 순서를 만들지 않는다. 서로 다른 6개 회차가 쌓이기 전에는 계산 준비 상태도
열지 않으며, 종료 사건 검증 전에는 LAB 보고서를 만들지 않는다.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

BUCKET = os.environ.get("CACHE_BUCKET", "earthus-cache-kr")
REGION = os.environ.get("CACHE_REGION", "us-east-2")
MODEL_KEY = "wind/air.json"
OBS_KEY = "wind/korea-air-obs.json"
OUTPUT_KEY = "archive/air-evidence/latest.json"
ARCHIVE = "archive/air-evidence"
BOUNDS = {"latFrom": 15.0, "latTo": 60.0, "lonFrom": 85.0, "lonTo": 150.0}
MODEL_MAX_AGE_HOURS = 3
OBS_MAX_AGE_HOURS = 2
MIN_SEQUENCE_SNAPSHOTS = 6

s3 = boto3.client("s3", region_name=REGION)


def parse_time(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _read(key):
    return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())


def _previous():
    try:
        return _read(OUTPUT_KEY)
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") in ("NoSuchKey", "404", "AccessDenied"):
            return None
        raise


def extract_model(document):
    try:
        nx, ny = int(document["nx"]), int(document["ny"])
        res = float(document["res"])
        lat0, lon0 = float(document["lat0"]), float(document["lon0"])
    except (KeyError, TypeError, ValueError) as error:
        raise RuntimeError("invalid air grid geometry") from error
    fields = {name: document.get(name) or [] for name in ("dust", "pm10", "pm25", "aod")}
    cells = []
    missing = {name: 0 for name in fields}
    for iy in range(ny):
        lat = lat0 + iy * res
        if not BOUNDS["latFrom"] <= lat <= BOUNDS["latTo"]:
            continue
        for ix in range(nx):
            lon = lon0 + ix * res
            if not BOUNDS["lonFrom"] <= lon <= BOUNDS["lonTo"]:
                continue
            index = iy * nx + ix
            cell = {"lat": lat, "lon": lon}
            for name, values in fields.items():
                value = values[index] if index < len(values) else None
                cell[name] = value
                if value is None:
                    missing[name] += 1
            cells.append(cell)
    if not cells:
        raise RuntimeError("no model cells in East Asia bounds")
    return cells, missing


def extract_stations(document):
    stations = []
    missing = {"coordinates": 0, "pm10": 0, "pm25": 0}
    for raw in document.get("stations") or []:
        lat, lon = raw.get("lat"), raw.get("lon")
        if lat is None or lon is None:
            missing["coordinates"] += 1
            continue
        try:
            lat, lon = float(lat), float(lon)
        except (TypeError, ValueError):
            missing["coordinates"] += 1
            continue
        if not (32.0 <= lat <= 39.5 and 124.0 <= lon <= 132.5):
            missing["coordinates"] += 1
            continue
        station = {
            "name": raw.get("name"), "sido": raw.get("sido"), "kind": raw.get("kind"),
            "atKst": raw.get("at"), "lat": lat, "lon": lon,
            "pm10": raw.get("pm10"), "pm25": raw.get("pm25"),
            "pm10_24h": raw.get("pm10_24h"), "pm25_24h": raw.get("pm25_24h"),
        }
        if station["pm10"] is None:
            missing["pm10"] += 1
        if station["pm25"] is None:
            missing["pm25"] += 1
        if raw.get("flags"):
            station["flags"] = raw["flags"]
        stations.append(station)
    return stations, missing


def _age_hours(now, value):
    stamp = parse_time(value)
    if not stamp:
        return None
    return round((now - stamp).total_seconds() / 3600, 2)


def build(model, observations, previous=None, now=None):
    now = now or datetime.now(timezone.utc)
    cells, model_missing = extract_model(model)
    stations, station_missing = extract_stations(observations)
    model_age = _age_hours(now, model.get("time"))
    obs_age = _age_hours(now, observations.get("generated"))
    reasons = []
    if model_age is None or model_age < -1 or model_age > MODEL_MAX_AGE_HOURS:
        reasons.append(f"model stale or invalid: {model_age}h")
    if obs_age is None or obs_age < -1 or obs_age > OBS_MAX_AGE_HOURS:
        reasons.append(f"observations stale or invalid: {obs_age}h")
    if not stations:
        reasons.append("no located AirKorea stations")

    stable = json.dumps({
        "modelTime": model.get("time"), "observationGeneratedAt": observations.get("generated"),
        "cells": cells, "stations": stations,
    }, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    content_hash = hashlib.sha256(stable).hexdigest()
    changed = not previous or previous.get("contentHash") != content_hash
    previous_count = int((previous or {}).get("snapshotCount") or 0)
    snapshot_count = previous_count + 1 if changed else previous_count
    return {
        "schemaVersion": 1,
        "generatedAt": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "status": "INPUT_STALE" if reasons else "READY_TO_ARCHIVE",
        "public": False,
        "reportPublished": False,
        "contentHash": content_hash,
        "changed": changed,
        "snapshotCount": snapshot_count,
        "input": {
            "model": {
                "source": model.get("source"), "validAt": model.get("time"),
                "ageHours": model_age, "resolutionDeg": model.get("res"),
                "cellN": len(cells), "missing": model_missing,
            },
            "observations": {
                "source": "한국환경공단 에어코리아", "generatedAt": observations.get("generated"),
                "observedKst": observations.get("observedKst"), "ageHours": obs_age,
                "stationN": len(stations), "missing": station_missing,
            },
            "bounds": BOUNDS,
        },
        "modelCells": cells,
        "stations": stations,
        "gate": {
            "minimumDistinctSnapshots": MIN_SEQUENCE_SNAPSHOTS,
            "currentDistinctSnapshots": snapshot_count,
            "sequenceCalculationAllowed": not reasons and snapshot_count >= MIN_SEQUENCE_SNAPSHOTS,
            "labReportAllowed": False,
            "reasons": reasons or [
                "시간 순서 계산 전 최소 6개 서로 다른 회차 필요",
                "종료 사건과 사후 관측 검증 전 LAB 보고서 금지",
            ],
        },
        "limits": {
            "ko": "CAMS 기반 5° 모델과 한국 실측을 같은 회차로 보존한 자료입니다. 한 장면만으로 발원지·유입 경로·건강 영향을 판정하지 않습니다.",
            "notForecast": True,
        },
    }


def handler(event, context):
    previous = _previous()
    payload = build(_read(MODEL_KEY), _read(OBS_KEY), previous=previous)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    s3.put_object(Bucket=BUCKET, Key=OUTPUT_KEY, Body=body,
                  ContentType="application/json; charset=utf-8", CacheControl="private, no-store")
    if payload["changed"]:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        s3.put_object(Bucket=BUCKET, Key=f"{ARCHIVE}/{stamp}.json", Body=body,
                      ContentType="application/json; charset=utf-8", CacheControl="private, no-store")
    return {
        "ok": payload["status"] == "READY_TO_ARCHIVE",
        "public": False,
        "changed": payload["changed"],
        "snapshotCount": payload["snapshotCount"],
        "modelCellN": payload["input"]["model"]["cellN"],
        "stationN": payload["input"]["observations"]["stationN"],
        "sequenceCalculationAllowed": payload["gate"]["sequenceCalculationAllowed"],
    }
