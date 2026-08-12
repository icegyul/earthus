# -*- coding: utf-8 -*-
"""동아시아·서태평양 총가강수량(TPW) 1° 격자.

받은 지적
  "대기중 수증기량인데 뉴스에 나온 자료야 너무 선명하게 잘 보여"

기존 ``gk2aWV``는 6.3㎛ 채널이 보는 중상층 수증기 영상이다. 이 함수가 만드는 값은
지면부터 대기 상단까지 공기 기둥에 든 물의 총량(TPW)이다. 1 kg/m²는 물 깊이 1 mm와
같다. 높은 TPW만으로 비가 온다고 판정하지 않는다.

데이터 경로
  NOAA/NCEP GFS 0.25° f000 분석장 → NOMADS 변수·지역 필터 → ecCodes 해독
  → 1° 원격자만 추출(보간 없음) → s3://<CACHE_BUCKET>/wind/tpw-ea.json

⚠️ 위성 관측 영상이 아니라 GFS 모델 분석장이다. dataKind=MODEL_ANALYSIS와 run/valid 시각을
   함께 내보낸다. CIMSS MIMIC-TPW2는 시각 참고만 했고 이미지·색표·파일을 복제하지 않는다.

⚠️ Open-Meteo 지점 API 방식은 폐기했다. 100지점 묶음 단건은 성공했지만 3,276지점 전체
   연속 실행에서 429가 반복됐다. 직접 NOAA 원격자는 HTTP 1회·약 100KB이며 TPW에 별도
   상용 API gate가 필요 없다. ZIP Lambda의 ecCodes 패키징은 ``deploy-grib-python.sh``를 쓴다.
"""

import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3


BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
DST = "wind/tpw-ea.json"
NOMADS = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
UA = {"User-Agent": "earthus/0.1 (+https://earthus.net)"}

# 인도차이나 수증기 공급원부터 북태평양 날짜변경선까지. 출력은 1° 원격자다.
LAT0, LAT1 = 20.0, 55.0
LON0, LON1 = 90.0, 180.0
RES = 1.0
NATIVE_RES = 0.25
RUN_HOURS = (0, 6, 12, 18)
# 가장 최근 회차부터 시도하고 아직 없으면 6시간 전으로 물러난다.
# 고정 지연을 두면 이미 올라온 12z를 06z로 보여주는 시간이 길어진다.
RUN_DELAY_HOURS = 0

s3 = boto3.client("s3", region_name=REGION)


def grid_points():
    lats = [LAT0 + i * RES for i in range(int((LAT1 - LAT0) / RES) + 1)]
    lons = [LON0 + i * RES for i in range(int((LON1 - LON0) / RES) + 1)]
    return lats, lons


def candidate_runs(now_utc=None, count=8):
    """아직 게시되지 않은 최신 회차 하나에 고정하지 않고 6시간씩 뒤로 찾는다."""
    now_utc = now_utc or datetime.now(timezone.utc)
    t = now_utc - timedelta(hours=RUN_DELAY_HOURS)
    hour = max((h for h in RUN_HOURS if h <= t.hour), default=18)
    if hour > t.hour:
        t -= timedelta(days=1)
    t = t.replace(hour=hour, minute=0, second=0, microsecond=0)
    return [t - timedelta(hours=6 * i) for i in range(count)]


def filter_url(run):
    day, hh = run.strftime("%Y%m%d"), run.hour
    params = {
        "dir": f"/gfs.{day}/{hh:02d}/atmos",
        "file": f"gfs.t{hh:02d}z.pgrb2.0p25.f000",
        "var_PWAT": "on",
        "lev_entire_atmosphere_(considered_as_a_single_layer)": "on",
        "subregion": "",
        "toplat": f"{LAT1:g}",
        "leftlon": f"{LON0:g}",
        "rightlon": f"{LON1:g}",
        "bottomlat": f"{LAT0:g}",
    }
    return f"{NOMADS}?{urllib.parse.urlencode(params)}"


def fetch_latest_grib(now_utc=None):
    errors = []
    for run in candidate_runs(now_utc):
        url = filter_url(run)
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=90) as response:
                raw = response.read()
            if raw[:4] != b"GRIB" or len(raw) < 1_000:
                raise ValueError(f"GRIB 아님 ({len(raw)} bytes)")
            return raw, run, url
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{run:%Y%m%d%H}:{str(exc)[:80]}")
    raise RuntimeError("NOAA GFS TPW 회차를 못 찾음: " + " | ".join(errors))


def _stamp(date_value, time_value):
    """GRIB date/time 정수를 UTC ISO-8601로 바꾼다. 없는 시각은 만들지 않는다."""
    if date_value is None or time_value is None:
        return None
    return datetime.strptime(
        f"{int(date_value):08d}{int(time_value):04d}", "%Y%m%d%H%M"
    ).replace(tzinfo=timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def decode_grib(raw):
    """0.25° PWAT 메시지를 1° 원격자로 줄인다. 보간·평균·결측 채움은 하지 않는다."""
    import eccodes as ec

    gid = ec.codes_new_from_message(raw)
    try:
        short_name = str(ec.codes_get(gid, "shortName"))
        units = str(ec.codes_get(gid, "units"))
        if short_name != "pwat":
            raise ValueError(f"PWAT가 아닌 GRIB: {short_name}")
        if units not in {"kg m**-2", "kg m-2"}:
            raise ValueError(f"예상하지 않은 PWAT 단위: {units}")

        native_values = ec.codes_get_values(gid)
        native_lats = ec.codes_get_array(gid, "latitudes")
        native_lons = ec.codes_get_array(gid, "longitudes")
        if not (len(native_values) == len(native_lats) == len(native_lons)):
            raise ValueError("GRIB 좌표/값 길이가 다름")

        # 0.25° 정수 키로 바꾸면 부동소수점 126.999999 같은 오차에 흔들리지 않는다.
        factor = round(1 / NATIVE_RES)
        native = {}
        for lat, lon, value in zip(native_lats, native_lons, native_values):
            if 0 <= float(lon) <= 360:
                native[(round(float(lat) * factor), round(float(lon) * factor))] = float(value)

        lats, lons = grid_points()
        values = []
        for lat in lats:
            for lon in lons:
                value = native.get((round(lat * factor), round(lon * factor)))
                # 범위 밖 값을 0/100으로 자르지 않고 결측으로 남긴다.
                values.append(round(value, 1) if value is not None and 0 <= value <= 100 else None)

        issued_at = _stamp(ec.codes_get(gid, "dataDate"), ec.codes_get(gid, "dataTime"))
        valid_at = _stamp(ec.codes_get(gid, "validityDate"), ec.codes_get(gid, "validityTime"))
        return values, issued_at, valid_at, {
            "shortName": short_name,
            "name": str(ec.codes_get(gid, "name")),
            "units": units,
            "nativePoints": len(native_values),
            "nativeResolutionDegrees": NATIVE_RES,
        }
    finally:
        ec.codes_release(gid)


def handler(event=None, context=None):
    raw, requested_run, source_url = fetch_latest_grib()
    values, issued_at, valid_at, native_meta = decode_grib(raw)
    lats, lons = grid_points()
    ny, nx = len(lats), len(lons)
    filled = sum(value is not None for value in values)
    failed = len(values) - filled
    if filled < len(values) * 0.98:
        raise RuntimeError(f"TPW 격자를 충분히 못 채움 ({filled}/{len(values)})")
    if not issued_at or not valid_at:
        raise RuntimeError("GFS run/valid 시각이 없는 TPW는 publish하지 않음")

    finite = [value for value in values if value is not None]
    now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    document = {
        "schemaVersion": "earthus.tpw-grid.v1",
        "signalType": "TOTAL_COLUMN_WATER_VAPOUR",
        "dataKind": "MODEL_ANALYSIS",
        "time": valid_at,
        "observedAt": None,
        "observedAtMissingReason": "NOT_AN_OBSERVATION",
        "issuedAt": issued_at,
        "validAt": valid_at,
        "receivedAt": now,
        "generatedAt": now,
        "lat0": LAT0,
        "lon0": LON0,
        "res": RES,
        "nx": nx,
        "ny": ny,
        "region": {"south": LAT0, "west": LON0, "north": LAT1, "east": LON1},
        "field": "tpw",
        "unit": "kg/m²",
        "displayUnit": "mm",
        "conversion": "1 kg/m² = 1 mm liquid water depth",
        "source": "NOAA/NCEP GFS via NOMADS",
        "provider": "NOAA National Centers for Environmental Prediction",
        "dataset": "GFS 0.25 degree analysis f000 · PWAT entire atmosphere",
        "model": "gfs_0p25",
        "modelRun": issued_at,
        "requestedRun": requested_run.isoformat().replace("+00:00", "Z"),
        "sourceUrl": source_url,
        "providerUrl": "https://www.nco.ncep.noaa.gov/pmb/products/gfs/",
        "termsUrl": "https://www.weather.gov/disclaimer",
        "attribution": "NOAA/NCEP GFS · NOMADS",
        "licenseStatus": "APPROVED_FREE",
        "commercialGate": None,
        "derivation": "Native 0.25° GFS grid subsampled to exact 1° grid points; no interpolation",
        "native": native_meta,
        "filled": filled,
        "failed": failed,
        "min": min(finite),
        "max": max(finite),
        "n": filled,
        "gribBytes": len(raw),
        "note": {
            "ko": "대기 기둥 전체 수증기량을 물 깊이(mm)로 나타낸 NOAA GFS 모델 분석장입니다. "
                  "강수 관측이나 강수 예보가 아니며, 화면 숫자는 1° 원격자입니다.",
            "en": "NOAA GFS analysis of total-column water vapour, expressed as liquid-water depth (mm). "
                  "This is neither observed nor forecast rainfall; displayed values are native 1° samples.",
        },
        "tpw": values,
    }
    body = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    s3.put_object(
        Bucket=BUCKET,
        Key=DST,
        Body=body,
        ContentType="application/json; charset=utf-8",
        CacheControl="public, max-age=1800",
    )
    print(f"[tpw] {nx}x{ny} · {filled}/{len(values)} · {min(finite):.1f}~{max(finite):.1f}mm "
          f"· run {issued_at} · GRIB {len(raw)/1024:.0f}KB · JSON {len(body)/1024:.0f}KB")
    return {
        "ok": True,
        "nx": nx,
        "ny": ny,
        "filled": filled,
        "failed": failed,
        "issuedAt": issued_at,
        "validAt": valid_at,
        "gribBytes": len(raw),
        "bytes": len(body),
    }
