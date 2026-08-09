"""OBIS 5도 해역 요약을 주 1회 S3에 굽는다.

⚠️ 브라우저가 OBIS를 직접 부르지 않는다. 외부 API 지연이나 장애가 잠수 화면을
   깨뜨리지 않게 마지막 정상 요약을 보존한다.
⚠️ 기록 수는 생물 개체수나 현재 분포가 아니다. 화면 문구와 함께 쓰는 정보 제품이다.
"""

from __future__ import annotations

import json
import math
import os
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

try:
    import boto3
except ImportError:  # 로컬 단위 테스트에서는 AWS SDK가 필요 없다.
    boto3 = None


BUCKET = os.environ.get("CACHE_BUCKET", "earthus-cache-kr")
SEED_KEY = os.environ.get("OBIS_SEED_KEY", "app/data/obis-cells.json")
OUTPUT_KEY = os.environ.get("OBIS_OUTPUT_KEY", "ocean/obis-summary.json")
API_ROOT = "https://api.obis.org/v3"
CELL_SIZE = 5
TOP_N = 5
USER_AGENT = "earthus-obis-summary/1.0 (https://earthus.net; weekly derived summary)"


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def cell_bounds(lat, lon):
    lat = float(lat)
    lon = ((float(lon) + 180) % 360) - 180
    if not math.isfinite(lat) or not math.isfinite(lon) or not -90 <= lat <= 90:
        raise ValueError("INVALID_COORDINATE")
    south = max(-90, math.floor((min(lat, 89.999999) + 90) / CELL_SIZE) * CELL_SIZE - 90)
    west = math.floor((lon + 180) / CELL_SIZE) * CELL_SIZE - 180
    north = min(90, south + CELL_SIZE)
    east = west + CELL_SIZE
    key = f"s{abs(south)}" if south < 0 else f"n{south}"
    key += f"_w{abs(west)}" if west < 0 else f"_e{west}"
    return key, {"south": south, "west": west, "north": north, "east": east}


def polygon_wkt(bounds):
    west, east = bounds["west"], bounds["east"]
    south, north = bounds["south"], bounds["north"]
    return f"POLYGON(({west} {south},{east} {south},{east} {north},{west} {north},{west} {south}))"


def get_json(path, params):
    url = f"{API_ROOT}/{path}?{urlencode(params)}"
    last_error = None
    for attempt in range(3):
        try:
            request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
            if attempt < 2:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"OBIS_REQUEST_FAILED:{path}:{type(last_error).__name__}")


def build_cell(bounds, anchors, fetch=get_json):
    geometry = polygon_wkt(bounds)
    statistics = fetch("statistics", {"geometry": geometry})
    facets = fetch("facet", {"geometry": geometry, "facets": "scientificName"})
    records = int(statistics.get("records", 0))
    if records < 0:
        raise ValueError("NEGATIVE_RECORD_COUNT")
    taxa = facets.get("results", {}).get("scientificName", [])
    top = []
    for item in taxa[:TOP_N]:
        if not isinstance(item, dict) or not str(item.get("key", "")).strip():
            continue
        top.append({"scientificName": str(item["key"]), "records": int(item.get("records", 0))})
    return {
        "bounds": bounds,
        "anchors": anchors,
        "records": records,
        "species": int(statistics.get("species", 0)),
        "taxa": int(statistics.get("taxa", 0)),
        "datasets": int(statistics.get("datasets", 0)),
        "speciesLevelRecords": int(statistics.get("specieslevel", 0)),
        "yearRange": statistics.get("yearrange") or None,
        "topTaxa": top,
        "retrievedAt": utc_now(),
    }


def load_json(s3, key, default=None):
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read().decode("utf-8"))
    except Exception:
        if default is not None:
            return default
        raise


def handler(event, context):
    if boto3 is None:
        raise RuntimeError("BOTO3_REQUIRED")
    s3 = boto3.client("s3", region_name=os.environ.get("CACHE_REGION", "us-east-2"))
    seed = load_json(s3, SEED_KEY)
    grouped = {}
    for item in seed.get("items", []):
        key, bounds = cell_bounds(item["lat"], item["lon"])
        group = grouped.setdefault(key, {"bounds": bounds, "anchors": []})
        group["anchors"].append({"id": item["id"], "name": item["name"]})

    previous = load_json(s3, OUTPUT_KEY, {"cells": []})
    old_cells = {item.get("id"): item for item in previous.get("cells", []) if item.get("id")}
    cells, failures, updated = [], [], []
    for index, (key, group) in enumerate(sorted(grouped.items())):
        try:
            cell = build_cell(group["bounds"], group["anchors"])
            cell["id"] = key
            cells.append(cell)
            updated.append(key)
        except Exception as error:
            print(f"OBIS_CELL_FAILED:{key}:{type(error).__name__}:{error}")
            failures.append({"id": key, "error": type(error).__name__})
            if key in old_cells:
                cells.append(old_cells[key])
        if index + 1 < len(grouped):
            time.sleep(0.25)

    if not cells:
        raise RuntimeError("NO_OBIS_SUMMARY_CELLS")
    generated = utc_now()
    output = {
        "schema": "earthus.obis-summary.v1",
        "generatedAt": generated,
        "cellSizeDegrees": CELL_SIZE,
        "coverage": seed.get("coverage"),
        "requestedCells": len(grouped),
        "updatedCells": len(updated),
        "failedCells": failures,
        "source": {
            "name": "Ocean Biodiversity Information System (OBIS), IOC-UNESCO",
            "api": "https://api.obis.org/v3/",
            "policy": "https://manual.obis.org/policy.html",
            "accessed": generated,
        },
        "limitations": {
            "ko": "관측 기록의 공간·시기·조사 노력이 고르지 않습니다. 기록 수는 개체수나 현재 분포가 아닙니다.",
            "en": "Occurrence records are uneven across space, time and sampling effort. Record counts are not abundance or current distribution."
        },
        "cells": sorted(cells, key=lambda item: item["id"]),
    }
    body = json.dumps(output, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    s3.put_object(
        Bucket=BUCKET, Key=OUTPUT_KEY, Body=body,
        ContentType="application/json; charset=utf-8",
        CacheControl="public, max-age=3600",
    )
    return {"ok": True, "generatedAt": generated, "cells": len(cells),
            "updated": len(updated), "failed": len(failures), "bytes": len(body)}
