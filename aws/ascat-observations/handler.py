"""NOAA CoastWatch ASCAT 해상풍 — 활성 태풍 주변의 위성 실측 근거.

ASCAT은 바다 표면 거칠기에서 풍향·풍속을 추정한다. 지상 관측소도, 예보도
아니다. NOAA가 4시간 묶음 HDF4로 공개한 격자 중 활성 태풍 1,000 km 안의 셀만
정규화해 ``wind/ascat-observations.json``에 남긴다.

⚠️ 셀 수를 관측소 수처럼 부르지 않는다. 같은 위성 궤도의 이웃 셀은 독립 표본이
아니다. 태풍 계산은 셀 수·덮인 방위·벡터 평균을 "현재 표면 근거"로만 보여 주며
자체 진로를 만들거나 공식 기관 경로를 움직이지 않는다.
"""

import json
import math
import os
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3
import numpy as np
from pyhdf.SD import SD, SDC

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
TRACKS_KEY = "events/cyclone-tracks.json"
DST = "wind/ascat-observations.json"
STATUS_DST = "wind/status/ascat-observations.json"
BASE = "https://coastwatch.noaa.gov/pub/socd1/coastwatch/products/ascat/4hr/hdf"
UA = {"User-Agent": "earthus/0.1 (+https://earthus.net)"}

# 화면과 태풍 계산은 800 km 반경을 쓴다. 중심이 다음 자료 전까지 이동하므로 수집은
# 1,000 km로 조금 넓게 잘라 계산 단계가 다시 정확히 800 km를 적용하게 한다.
CROP_RADIUS_KM = 1000
SEARCH_HOURS = 36
COMBINATIONS = (("B", "a"), ("B", "d"), ("C", "a"), ("C", "d"))

s3 = boto3.client("s3", region_name=REGION)


def write_status(now, state, reason, output_written, **details):
    """last-good ASCAT 셀과 실행 heartbeat를 분리한다.

    활성 태풍 주변을 위성 궤도가 지나지 않은 실행은 관측 0이나 수집기 장애가 아니다.
    자료 파일을 빈 값으로 덮지 않고, 그 결측 사유만 별도 상태 파일에 기록한다.
    """
    doc = {
        "schema": 1,
        "collector": "ascat-observations",
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


def dist_km(a_lat, a_lon, b_lat, b_lon):
    r = math.pi / 180
    d_lat, d_lon = (b_lat - a_lat) * r, (b_lon - a_lon) * r
    h = (math.sin(d_lat / 2) ** 2
         + math.cos(a_lat * r) * math.cos(b_lat * r) * math.sin(d_lon / 2) ** 2)
    return 2 * 6371 * math.asin(min(1, math.sqrt(h)))


def get_json(key):
    return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())


def active_centres():
    doc = get_json(TRACKS_KEY)
    out = []
    for storm in doc.get("storms", []):
        track = storm.get("track") or []
        if storm.get("live") is not True or not track:
            continue
        lon, lat = track[-1]
        if not (-90 <= float(lat) <= 90 and -180 <= float(lon) <= 180):
            continue
        out.append({"id": str(storm.get("id") or storm.get("name")),
                    "name": storm.get("name"), "lat": float(lat), "lon": float(lon),
                    "lastSeen": storm.get("lastSeen")})
    return out, doc.get("generated")


def candidate_names(now, satellite, orbit):
    """14 MB 디렉터리를 매번 받지 않고 예상 파일을 최신부터 HEAD 한다."""
    slots = []
    cursor = now.replace(minute=0, second=0, microsecond=0)
    cursor = cursor.replace(hour=(cursor.hour // 4) * 4)
    for delta in range(0, SEARCH_HOURS + 1, 4):
        dt = cursor - timedelta(hours=delta)
        slots.append(f"AS{dt.year}{dt.timetuple().tm_yday:03d}{dt.hour:02d}"
                     f"{satellite}{orbit}s_WW.hdf")
    return slots


def exists(url):
    request = urllib.request.Request(url, headers=UA, method="HEAD")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return int(response.status) == 200
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
        return False


def latest_files(now):
    found = []
    for satellite, orbit in COMBINATIONS:
        for name in candidate_names(now, satellite, orbit):
            url = f"{BASE}/{name}"
            if exists(url):
                found.append({"name": name, "url": url,
                              "satellite": f"Metop-{satellite}",
                              "orbit": "ascending" if orbit == "a" else "descending"})
                break
    return found


def download(url):
    request = urllib.request.Request(url, headers=UA)
    handle = tempfile.NamedTemporaryFile(prefix="ascat-", suffix=".hdf", delete=False)
    path = handle.name
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
        handle.close()
        return path
    except Exception:
        handle.close()
        try:
            os.unlink(path)
        except OSError:
            pass
        raise


def scaled(dataset):
    raw = dataset[:]
    attrs = dataset.attributes()
    return raw, float(attrs.get("scale_factor", 1)), float(attrs.get("add_offset", 0))


def file_cells(info, centres):
    path = download(info["url"])
    try:
        source = SD(path, SDC.READ)
        try:
            lat = source.select("latitude")[:]
            lon = source.select("longitude")[:]
            speed_raw, speed_scale, speed_offset = scaled(source.select("windspeed"))
            direction_raw, direction_scale, direction_offset = scaled(source.select("direction"))
            u_raw, u_scale, u_offset = scaled(source.select("u_wind"))
            v_raw, v_scale, v_offset = scaled(source.select("v_wind"))
            date_raw = source.select("cwdate")[:]
            time_raw = source.select("cwtime")[:]
            quality = source.select("quality")[:]
        finally:
            source.end()

        # 원본 fill과 물리 범위를 동시에 거른다. quality 비트 의미를 추측해 임의
        # 탈락시키지 않고 원문 그대로 남겨 이후 검증 가능하게 한다.
        speed = speed_raw.astype(np.float32) * speed_scale + speed_offset
        direction = direction_raw.astype(np.float32) * direction_scale + direction_offset
        u_wind = u_raw.astype(np.float32) * u_scale + u_offset
        v_wind = v_raw.astype(np.float32) * v_scale + v_offset
        valid = ((speed_raw != -9999) & (direction_raw != 65535)
                 & (date_raw != 65535) & (time_raw != -2147483647)
                 & np.isfinite(lat) & np.isfinite(lon)
                 & (speed >= 0) & (speed <= 75)
                 & (direction >= 0) & (direction <= 360))
        rows, cols = np.where(valid)
        cells = []
        for row, col in zip(rows.tolist(), cols.tolist()):
            rlat, rlon = float(lat[row, col]), float(lon[row, col])
            near = [storm["id"] for storm in centres
                    if dist_km(storm["lat"], storm["lon"], rlat, rlon) <= CROP_RADIUS_KM]
            if not near:
                continue
            observed = (datetime(1970, 1, 1, tzinfo=timezone.utc)
                        + timedelta(days=int(date_raw[row, col]),
                                    seconds=int(time_raw[row, col])))
            cells.append({
                "id": f"ASCAT-{rlat:.3f}-{rlon:.3f}",
                "lat": round(rlat, 3), "lon": round(rlon, 3),
                "observed": observed.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "wind_ms": round(float(speed[row, col]), 2),
                "wind_dir": round(float(direction[row, col]), 2),
                "u_ms": round(float(u_wind[row, col]), 2),
                "v_ms": round(float(v_wind[row, col]), 2),
                "qualityRaw": int(quality[row, col]),
                "satellite": info["satellite"], "orbit": info["orbit"],
                "storms": near,
            })
        return cells
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def handler(event=None, context=None):
    now = datetime.now(timezone.utc)
    try:
        centres, tracks_generated = active_centres()
    except Exception as exc:
        reason = f"cyclone-input: {type(exc).__name__}"
        write_status(now, "FAILED", reason, False)
        raise
    if not centres:
        write_status(now, "IDLE_NO_LIVE_CYCLONES", "no-live-cyclones", False,
                     activeCycloneCount=0, tracksGenerated=tracks_generated)
        return {"ok": True, "cells": 0, "reason": "no-live-cyclones",
                "status": "IDLE_NO_LIVE_CYCLONES"}

    files = latest_files(now)
    if not files:
        write_status(now, "FAILED", "no-ascat-files-in-search-window", False,
                     activeCycloneCount=len(centres), tracksGenerated=tracks_generated,
                     fileCount=0, failureCount=0)
        return {"ok": False, "reason": "no-ascat-files-in-search-window"}

    cells, failures = [], []
    for info in files:
        try:
            cells.extend(file_cells(info, centres))
        except Exception as exc:  # noqa: BLE001 — 한 파일 손상으로 다른 위성까지 버리지 않는다.
            failures.append({"file": info["name"], "reason": f"{type(exc).__name__}: {exc}"[:180]})

    # 같은 1/3도 셀이 여러 위성·궤도에 잡히면 가장 최근 관측을 남긴다. 같은 시각이면
    # 한 셀에 여러 파일을 더해 표본 수를 부풀리지 않는다.
    unique = {}
    for cell in cells:
        key = (cell["lat"], cell["lon"])
        if key not in unique or cell["observed"] > unique[key]["observed"]:
            unique[key] = cell
    cells = sorted(unique.values(), key=lambda cell: (cell["lat"], cell["lon"]))
    if not cells:
        all_files_failed = len(failures) == len(files)
        if all_files_failed:
            status_state, status_reason = "FAILED", "all-ascat-files-failed"
        elif failures:
            status_state, status_reason = "PARTIAL_NO_COVERAGE", "partial-file-failure-and-no-cells"
        else:
            status_state, status_reason = "NO_COVERAGE", "no-cells-near-live-cyclones"
        write_status(now, status_state, status_reason, False,
                     activeCycloneCount=len(centres), tracksGenerated=tracks_generated,
                     fileCount=len(files), cellCount=0, failureCount=len(failures))
        return {"ok": False, "reason": "no-cells-near-live-cyclones",
                "files": [item["name"] for item in files], "failures": failures,
                "status": status_state}

    doc = {
        "schema": 1,
        "generated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "NOAA CoastWatch · Metop-B/C ASCAT 전지구 4시간 해상풍",
        "sourceEn": "NOAA CoastWatch · Metop-B/C ASCAT global 4-hour ocean surface winds",
        "license": "NOAA CoastWatch: free use and redistribution with attribution; experimental, no warranty",
        "termsUrl": "https://oceanwatch.noaa.gov/cwn/products/vector-winds-ascat-metop-abc.html",
        "note": {
            "ko": "위성이 바다 표면 거칠기에서 계산한 해상풍 셀입니다. 관측소·예보가 아니며, 태풍 진로를 만들지 않습니다.",
            "en": "Satellite-derived ocean-surface wind cells, not stations or a forecast; they do not create a cyclone track.",
        },
        "tracksGenerated": tracks_generated,
        "cropRadiusKm": CROP_RADIUS_KM,
        "centres": centres,
        "files": [{key: item[key] for key in ("name", "satellite", "orbit")} for item in files],
        "failures": failures,
        "count": len(cells),
        "observedFrom": min(cell["observed"] for cell in cells),
        "observedTo": max(cell["observed"] for cell in cells),
        "cells": cells,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=3600")
    status_state = "PARTIAL" if failures else "SUCCEEDED"
    status_reason = "partial-file-failure" if failures else "ascat-cells-written"
    write_status(now, status_state, status_reason, True,
                 activeCycloneCount=len(centres), tracksGenerated=tracks_generated,
                 dataGenerated=doc["generated"], fileCount=len(files),
                 cellCount=len(cells), failureCount=len(failures))
    print(f"[ascat] files {len(files)} · cells {len(cells)} · failures {len(failures)}")
    return {"ok": True, "files": len(files), "cells": len(cells),
            "failures": failures, "status": status_state}
