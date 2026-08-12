# -*- coding: utf-8 -*-
"""EARTHUS 공통 신호 계약 ``earth.signal.v1``.

기존 수집 결과를 한 번에 갈아엎지 않는다. compatibility adapter가 원 JSON을 읽어
별도 shadow 산출물을 만들 때만 이 모듈을 쓴다. 원본 필드·시각·단위는 ``source*``에
남기고, 확실하지 않은 것은 0이나 안전 상태로 바꾸지 않는다.
"""

import hashlib
import json
import math
import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo


SCHEMA_VERSION = "earth.signal.v1"
MISSING_REASONS = {
    "NOT_REPORTED", "OUT_OF_COVERAGE", "BELOW_DETECTION", "SENSOR_OFFLINE",
    "PROVIDER_DELAY", "PARSE_REJECTED", "RIGHTS_BLOCKED", "REGION_UNMAPPED",
    "TIME_UNCERTAIN", "QUALITY_REJECTED", "NOT_APPLICABLE",
}


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def iso_z(dt):
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_source_time(raw, timezone_name=None):
    """provider 시각을 UTC로 바꾼다. 모호한 local time은 추정하지 않는다."""
    if raw is None or str(raw).strip() == "":
        return None, "NOT_REPORTED"
    text = str(raw).strip()
    try:
        if re.fullmatch(r"\d{12}", text):
            naive = datetime.strptime(text, "%Y%m%d%H%M")
        else:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if parsed.tzinfo is not None:
                return iso_z(parsed), None
            naive = parsed
    except ValueError:
        return None, "TIME_UNCERTAIN"

    if not timezone_name:
        return None, "TIME_UNCERTAIN"
    try:
        zone = ZoneInfo(timezone_name)
        a = naive.replace(tzinfo=zone, fold=0)
        b = naive.replace(tzinfo=zone, fold=1)
        # DST가 뒤로 갈 때 같은 벽시계 시각이 두 번 생긴다. 어느 쪽인지 원문에 offset이
        # 없으면 하나를 고르지 않는다.
        if a.utcoffset() != b.utcoffset():
            return None, "TIME_UNCERTAIN"
        # DST가 앞으로 갈 때 존재하지 않는 local time도 왕복하면 값이 달라진다.
        back = a.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None)
        if back != naive:
            return None, "TIME_UNCERTAIN"
        return iso_z(a), None
    except (KeyError, ValueError):
        return None, "TIME_UNCERTAIN"


def stable_hash(value, length=16):
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True,
                     separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:length]


def _slug(value):
    text = re.sub(r"[^a-z0-9._-]+", "-", str(value).lower()).strip("-")
    return text or "unknown"


def make_signal_id(provider, dataset, natural_key, revision):
    return (f"{_slug(provider)}:{_slug(dataset)}:"
            f"{stable_hash(natural_key, 20)}:{stable_hash(revision, 12)}")


def previous_index(batch):
    out = {}
    for signal in (batch or {}).get("signals", []):
        key = (signal.get("identity") or {}).get("naturalKey")
        if key:
            out[key] = signal
    return out


def supersedes_for(previous, natural_key, new_revision):
    old = previous_index(previous).get(natural_key)
    if not old or old.get("revision") == new_revision:
        return None
    return old.get("signalId")


def point_geometry(lon, lat):
    try:
        lon, lat = float(lon), float(lat)
    except (TypeError, ValueError):
        return None
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        return None
    return {"type": "Point", "coordinates": [round(lon, 7), round(lat, 7)]}


def split_dateline_line(coordinates):
    """179E→179W 선을 날짜변경선에서 나눠 360° 연결선을 만들지 않는다."""
    if not coordinates or len(coordinates) < 2:
        return {"type": "LineString", "coordinates": coordinates or []}
    pts = [[float(p[0]), float(p[1])] for p in coordinates]
    parts, current = [], [pts[0]]
    for target in pts[1:]:
        lon1, lat1 = current[-1]
        lon2, lat2 = target
        delta = lon2 - lon1
        if abs(delta) <= 180:
            current.append(target)
            continue
        adjusted = lon2 + 360 if delta < -180 else lon2 - 360
        boundary = 180.0 if adjusted > lon1 else -180.0
        t = (boundary - lon1) / (adjusted - lon1)
        cross_lat = lat1 + (lat2 - lat1) * t
        current.append([boundary, cross_lat])
        parts.append(current)
        opposite = -180.0 if boundary == 180.0 else 180.0
        current = [[opposite, cross_lat], target]
    parts.append(current)
    if len(parts) == 1:
        return {"type": "LineString", "coordinates": parts[0]}
    return {"type": "MultiLineString", "coordinates": parts}


# EPSG:5186 — Korea 2000 / Central Belt 2010. aws/ecobird/tm.py의 검증된 식과 같다.
_A = 6378137.0
_INV_F = 298.257222101
_LAT0 = math.radians(38.0)
_LON0 = math.radians(127.0)
_FE, _FN = 200000.0, 600000.0
_F = 1 / _INV_F
_E2 = _F * (2 - _F)
_EP2 = _E2 / (1 - _E2)
_E1 = (1 - math.sqrt(1 - _E2)) / (1 + math.sqrt(1 - _E2))


def _meridional(phi):
    return _A * ((1 - _E2 / 4 - 3 * _E2 ** 2 / 64 - 5 * _E2 ** 3 / 256) * phi
                 - (3 * _E2 / 8 + 3 * _E2 ** 2 / 32 + 45 * _E2 ** 3 / 1024)
                 * math.sin(2 * phi)
                 + (15 * _E2 ** 2 / 256 + 45 * _E2 ** 3 / 1024) * math.sin(4 * phi)
                 - (35 * _E2 ** 3 / 3072) * math.sin(6 * phi))


_M0 = _meridional(_LAT0)


def epsg5186_to_wgs84(x, y):
    """EPSG:5186 (x,y m) → GeoJSON Point와 재현 가능한 변환 metadata."""
    try:
        x, y = float(x), float(y)
        mv = _M0 + (y - _FN)
        mu = mv / (_A * (1 - _E2 / 4 - 3 * _E2 ** 2 / 64 - 5 * _E2 ** 3 / 256))
        p1 = (mu + (3 * _E1 / 2 - 27 * _E1 ** 3 / 32) * math.sin(2 * mu)
              + (21 * _E1 ** 2 / 16 - 55 * _E1 ** 4 / 32) * math.sin(4 * mu)
              + (151 * _E1 ** 3 / 96) * math.sin(6 * mu))
        c1, t1 = _EP2 * math.cos(p1) ** 2, math.tan(p1) ** 2
        n1 = _A / math.sqrt(1 - _E2 * math.sin(p1) ** 2)
        r1 = _A * (1 - _E2) / (1 - _E2 * math.sin(p1) ** 2) ** 1.5
        d = (x - _FE) / n1
        lat = p1 - (n1 * math.tan(p1) / r1) * (
            d ** 2 / 2
            - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * _EP2) * d ** 4 / 24
            + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * _EP2 - 3 * c1 ** 2)
            * d ** 6 / 720)
        lon = _LON0 + (d - (1 + 2 * t1 + c1) * d ** 3 / 6
                       + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * _EP2 + 24 * t1 ** 2)
                       * d ** 5 / 120) / math.cos(p1)
        geometry = point_geometry(math.degrees(lon), math.degrees(lat))
        return geometry, {
            "library": "earthus.snyder_tm_inverse",
            "version": "1",
            "sourceCrs": "EPSG:5186",
            "targetCrs": "EPSG:4326",
            "axisOrder": "source[x,easting,y,northing]→target[lon,lat]",
            "gridFile": None,
        }
    except (TypeError, ValueError, ZeroDivisionError):
        return None, None


def normalize_depth(source_value):
    """해수면 기준 음의 높이를 양의 수심으로 바꾼다."""
    try:
        source_value = float(source_value)
    except (TypeError, ValueError):
        return None, None
    return abs(source_value), {
        "reference": "DEPTH_M_POSITIVE_DOWN", "unit": "m",
        "sourceValue": source_value, "sourceUnit": "m",
        "conversionId": "elevation-negative-to-depth-positive",
        "conversionVersion": "1",
    }


def convert_unit(value, source_unit, target_unit):
    if value is None:
        return None, None
    value = float(value)
    key = (str(source_unit), str(target_unit))
    rules = {
        ("K", "Cel"): (lambda x: x - 273.15, "kelvin-to-celsius"),
        ("kt", "m/s"): (lambda x: x * 0.514444, "knot-to-mps"),
        ("km/h", "m/s"): (lambda x: x / 3.6, "kmh-to-mps"),
        ("Pa", "hPa"): (lambda x: x / 100.0, "pa-to-hpa"),
        ("kg/m²", "mm"): (lambda x: x, "water-column-kgm2-to-mm"),
        ("kg m**-2", "mm"): (lambda x: x, "water-column-kgm2-to-mm"),
        ("cm", "m"): (lambda x: x / 100.0, "cm-to-m"),
    }
    if source_unit == target_unit:
        return value, None
    if key not in rules:
        raise ValueError(f"지원하지 않는 단위 변환: {source_unit}→{target_unit}")
    fn, cid = rules[key]
    return fn(value), {"conversionId": cid, "conversionVersion": "1"}


def make_envelope(*, provider, dataset, natural_key, revision, signal_type,
                  geometry, issued_at, observed_at, valid_from, valid_to, received_at,
                  source_timezone, value, unit, source_value, source_unit,
                  missing_reason=None, source_crs="EPSG:4326", coordinate_transform=None,
                  vertical=None, supersedes=None, source=None, quality=None,
                  processor=None, source_time_raw=None, time_precision=None,
                  region=None, conversion=None):
    if value is None and missing_reason not in MISSING_REASONS:
        raise ValueError("value=null이면 허용된 missingReason이 필요함")
    if value is not None and missing_reason is not None:
        raise ValueError("value가 있으면 missingReason은 null이어야 함")
    signal_id = make_signal_id(provider, dataset, natural_key, revision)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "signalId": signal_id,
        "signalType": signal_type,
        "identity": {"naturalKey": natural_key},
        "geometry": geometry,
        "crs": "EPSG:4326",
        "sourceCrs": source_crs,
        "coordinateTransform": coordinate_transform,
        "issuedAt": issued_at,
        "observedAt": observed_at,
        "validFrom": valid_from,
        "validTo": valid_to,
        "receivedAt": received_at,
        "sourceTimezone": source_timezone,
        "sourceTimeRaw": source_time_raw or {},
        "timePrecision": time_precision or {},
        "value": value,
        "unit": unit,
        "sourceValue": source_value,
        "sourceUnit": source_unit,
        "conversion": conversion,
        "vertical": vertical,
        "missingReason": missing_reason,
        "revision": revision,
        "supersedes": supersedes,
        "region": region,
        "source": source or {},
        "quality": quality or {},
        "processor": processor or {},
    }


def validate_envelope(signal):
    required = {
        "schemaVersion", "signalId", "signalType", "identity", "geometry", "crs",
        "sourceCrs", "coordinateTransform", "issuedAt", "observedAt", "validFrom",
        "validTo", "receivedAt", "sourceTimezone", "sourceTimeRaw", "value", "unit",
        "timePrecision", "sourceValue", "sourceUnit", "conversion", "vertical", "missingReason",
        "revision", "supersedes", "region", "source", "quality", "processor",
    }
    errors = []
    missing = sorted(required - set(signal))
    if missing:
        errors.append("missing:" + ",".join(missing))
    if signal.get("schemaVersion") != SCHEMA_VERSION:
        errors.append("schemaVersion")
    if signal.get("crs") != "EPSG:4326":
        errors.append("crs")
    if signal.get("value") is None and signal.get("missingReason") not in MISSING_REASONS:
        errors.append("missingReason")
    if signal.get("value") is not None and signal.get("missingReason") is not None:
        errors.append("value+missingReason")
    for field in ("source", "quality", "processor", "timePrecision"):
        if not isinstance(signal.get(field), dict):
            errors.append(field)
    source = signal.get("source") or {}
    if not {"sourceId", "provider", "dataset", "url", "termsUrl", "licenseStatus",
            "attribution", "snapshotGeneratedAt"}.issubset(source):
        errors.append("source.metadata")
    quality = signal.get("quality") or {}
    if not {"status", "reasons", "n"}.issubset(quality):
        errors.append("quality.metadata")
    processor = signal.get("processor") or {}
    if not {"name", "adapter", "version"}.issubset(processor):
        errors.append("processor.metadata")
    geom = signal.get("geometry")
    if geom and geom.get("type") == "Point":
        coordinates = geom.get("coordinates") or []
        if (len(coordinates) != 2 or not -180 <= coordinates[0] <= 180
                or not -90 <= coordinates[1] <= 90):
            errors.append("geometry")
    return errors
