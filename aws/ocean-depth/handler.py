"""earthus 수심 조회 — GEBCO 0.1도 최심 격자.

⚠️ 이 값은 항해·해상 안전용이 아니다. 0.1도 셀 안 15초 원본 576개의
최솟값을 보존한 뒤 인접 셀을 보간한다. 특정 좌표의 실측 수심으로 부르지 않는다.
"""

import json
import math
import os
import struct
from urllib.parse import parse_qs

import boto3


BUCKET = os.environ.get("CACHE_BUCKET", "earthus-cache-kr")
GRID_KEY = os.environ.get("GRID_KEY", "ocean/depth-grid.bin")
MANIFEST_KEY = os.environ.get("MANIFEST_KEY", "ocean/depth-grid.manifest.json")
TRENCH_KEY = os.environ.get("TRENCH_KEY", "app/data/trenches.json")
NEARBY_KM = float(os.environ.get("TRENCH_NEARBY_KM", "400"))

_s3 = None
_grid_bytes = None
_manifest = None
_trenches = None


def _load():
    global _s3, _grid_bytes, _manifest, _trenches
    if _grid_bytes is not None:
        return
    if _s3 is None:
        _s3 = boto3.client("s3")
    _grid_bytes = _s3.get_object(Bucket=BUCKET, Key=GRID_KEY)["Body"].read()
    _manifest = json.loads(
        _s3.get_object(Bucket=BUCKET, Key=MANIFEST_KEY)["Body"].read().decode("utf-8")
    )
    expected = int(_manifest["output"]["bytes"])
    if len(_grid_bytes) != expected:
        raise RuntimeError(f"DEPTH_GRID_SIZE_MISMATCH:{len(_grid_bytes)}:{expected}")
    try:
        doc = json.loads(_s3.get_object(Bucket=BUCKET, Key=TRENCH_KEY)["Body"].read().decode("utf-8"))
        _trenches = doc.get("items", []) if isinstance(doc, dict) else []
    except Exception:
        # 해구 카탈로그는 부가 정보다. 수심·출처·한계는 그대로 제공한다.
        _trenches = []


def _cell(row, col):
    rows, cols = _manifest["output"]["shape"]
    row = max(0, min(rows - 1, row))
    col %= cols
    return struct.unpack_from("<h", _grid_bytes, (row * cols + col) * 2)[0]


def _elevation(lat, lon):
    rows, cols = _manifest["output"]["shape"]
    resolution = float(_manifest["output"]["resolutionDegrees"])
    # 셀 중심은 남서쪽 경계에서 해상도의 절반만큼 들어간 곳이다.
    y = (lat + 90.0 - resolution / 2) / resolution
    x = (lon + 180.0 - resolution / 2) / resolution
    y = max(0.0, min(rows - 1.0, y))
    x %= cols
    y0 = int(math.floor(y))
    x0 = int(math.floor(x))
    y1 = min(rows - 1, y0 + 1)
    x1 = (x0 + 1) % cols
    fy, fx = y - y0, x - x0
    a = _cell(y0, x0) * (1 - fx) + _cell(y0, x1) * fx
    b = _cell(y1, x0) * (1 - fx) + _cell(y1, x1) * fx
    return a * (1 - fy) + b * fy


def _distance_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _nearby_trench(lat, lon):
    nearest = None
    for item in _trenches or []:
        try:
            distance = _distance_km(lat, lon, float(item["lat"]), float(item["lon"]))
        except (KeyError, TypeError, ValueError):
            continue
        if distance <= NEARBY_KM and (nearest is None or distance < nearest[0]):
            nearest = (distance, item)
    if nearest is None:
        return None
    distance, item = nearest
    return {
        "id": item.get("id"),
        "name": item.get("name"),
        "distanceKm": round(distance, 1),
        "depthMinM": item.get("depthMin"),
        "depthMaxM": item.get("depthMax"),
        "source": item.get("source"),
        "credit": item.get("credit"),
    }


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, max-age=86400",
            "access-control-allow-origin": "*",
        },
        "body": json.dumps(body, ensure_ascii=False, separators=(",", ":")),
    }


def handler(event, context):
    try:
        params = event.get("queryStringParameters") or {}
        if not params and event.get("rawQueryString"):
            params = {key: values[-1] for key, values in parse_qs(event["rawQueryString"]).items()}
        lat = float(params.get("lat"))
        lon = float(params.get("lon"))
        if not math.isfinite(lat) or not math.isfinite(lon) or not -90 <= lat <= 90:
            raise ValueError
        lon = ((lon + 180) % 360) - 180
    except (TypeError, ValueError):
        return _response(400, {"error": "LAT_LON_REQUIRED", "message": "lat(-90~90)와 lon 숫자가 필요합니다."})

    try:
        _load()
        elevation = _elevation(lat, lon)
    except Exception as error:
        print(f"DEPTH_LOAD_FAILED:{type(error).__name__}:{error}")
        return _response(503, {"error": "DEPTH_DATA_UNAVAILABLE", "message": "수심 자료를 불러오지 못했습니다."})

    output = _manifest["output"]
    source = _manifest["source"]
    is_ocean = elevation < 0
    body = {
        "lat": round(lat, 6),
        "lon": round(lon, 6),
        "elevationM": round(elevation),
        "depthM": round(-elevation) if is_ocean else 0,
        "isOcean": is_ocean,
        "resolution": "0.1° 격자 (적도에서 약 11km)",
        "method": "각 셀의 GEBCO 15초 원본 576개 중 최심값을 보존한 뒤 인접 셀 보간",
        "source": {
            "name": source["title"],
            "credit": source["credit"],
            "doi": source["doi"],
            "url": source["url"],
            "dataCreated": source["created"],
            "gridBuilt": _manifest["generatedAt"],
        },
        "sample": {"sourceGridCellsPerCoarseCell": 576, "kind": "격자 셀, 독립 관측 표본 아님"},
        "limitations": _manifest["limitations"],
        "safety": "항해·해상 안전 판단에 사용하지 마세요.",
        "gridSha256": output["sha256"],
    }
    trench = _nearby_trench(lat, lon)
    if trench:
        body["nearbyTrench"] = trench
    return _response(200, body)
