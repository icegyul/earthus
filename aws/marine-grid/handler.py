"""전지구 해양 격자 → 파고 · 너울 · 해수면온도 · 해류

무엇을 담나 (한 번의 요청으로 전부)
  wave    유의파고 (m)              — "파도가 얼마나 높나"
  wdir    파향 (도)
  wper    파주기 (초)
  swell   너울 높이 (m)             — 멀리서 온 긴 파도. 맑은 날에도 위험한 그것.
  sper    너울 주기 (초)
  sst     해수면온도 (°C)
  cur     해류 속도 (m/s)           — 조류가 아니라 해류다. 아래 주의 참고.
  cdir    해류 방향 (도)

⚠️ "조류"와 "해류"는 다르다. 이 자료는 **해류**다.
   조류(tide)는 달·태양의 인력으로 하루 두 번 드나드는 것이고,
   해류(current)는 바람과 밀도차로 흐르는 큰 흐름이다.
   화면에 "조류"라고 쓰면 어민·낚시하는 사람에게 틀린 정보가 된다.
   물때표가 필요한 사람에게 이걸 주면 안 된다 — 그래서 "해류"로만 표기한다.

⚠️ 육지 지점은 값이 없다. 그대로 None 으로 둔다.
   0 으로 채우면 대륙이 "파고 0m 바다"로 칠해진다.

출처: Open-Meteo Marine API (기반: 각국 파랑모델)

결과
  s3://<CACHE_BUCKET>/ocean/marine.json
  s3://<CACHE_BUCKET>/ocean/sst-global.json  (NOAA OISST 일별 관측, 1° 축약판)
"""

import json
import os
import re
import time
import urllib.parse
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

DST_BUCKET = os.environ["CACHE_BUCKET"]
DST_REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
API = "https://marine-api.open-meteo.com/v1/marine"
OISST_DAILY = ("https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/"
               "sst.day.mean.{year}.nc.ascii")

RES = 5.0
LAT_MAX = 80.0
BATCH = 100
PACE = 6.0

# ⚠️ 전지구 해양판의 SST를 5° Open-Meteo 점으로 그리면 지중해처럼 좁은 바다는
#    네 꼭짓점 중 육지가 끼어 통째로 투명해진다. SST만 NOAA OISST 0.25° 일별 관측을
#    1° 간격으로 **원격자 표본 추출**한다. 보간으로 육지 값을 만들지 않는다.
# ⚠️ 1° 전지구판의 고정 3배 확대는 4,320px이라 일부 모바일 GPU의 4,096px 텍스처
#    한도를 넘는다. 브라우저 렌더러가 4,096px 안에서 2배로 제한한다.
SST_RES = 1.0
SST_NX, SST_NY = 360, 161
SST_LAT0, SST_LON0 = -79.875, -179.875
SST_LAT_SEL = "[40:4:680]"       # -79.875 .. 80.125N, 원본 0.25°의 4칸 간격
SST_LON_SEL = "[0:4:1436]"       #   0.125 .. 359.125E, 원본 0.25°의 4칸 간격

dst = boto3.client("s3", region_name=DST_REGION)

VARS = [
    ("wave_height", "wave", 2),
    ("wave_direction", "wdir", 0),
    ("wave_period", "wper", 1),
    ("swell_wave_height", "swell", 2),
    ("swell_wave_period", "sper", 1),
    ("sea_surface_temperature", "sst", 1),
    ("ocean_current_velocity", "cur", 2),
    ("ocean_current_direction", "cdir", 0),
]


def grid_points():
    lons = [(-180.0 + i * RES) for i in range(int(360 / RES))]
    lats = [(-LAT_MAX + j * RES) for j in range(int(2 * LAT_MAX / RES) + 1)]
    return lats, lons


def fetch_batch(pts, tries=4):
    q = urllib.parse.urlencode({
        "latitude": ",".join(f"{p[0]:.2f}" for p in pts),
        "longitude": ",".join(f"{p[1]:.2f}" for p in pts),
        "current": ",".join(v[0] for v in VARS),
        "timezone": "UTC",
        # Open-Meteo 해류 기본값은 km/h다. 출력 계약은 m/s이므로 요청부터 고정한다.
        "wind_speed_unit": "ms",
        "cell_selection": "sea",
    })
    wait = 8
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(f"{API}?{q}", timeout=45) as r:
                d = json.load(r)
            rows = d if isinstance(d, list) else [d]
            for item in rows:
                current = (item or {}).get("current") or {}
                value = current.get("ocean_current_velocity")
                if value is None:
                    continue
                unit = ((item or {}).get("current_units") or {}).get("ocean_current_velocity")
                if unit == "km/h":
                    current["ocean_current_velocity"] = value / 3.6
                elif unit != "m/s":
                    raise ValueError(f"해류 단위 불명: {unit!r}")
            return rows
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == tries - 1:
                raise
            print(f"  429 — {wait}초 대기 후 재시도")
            time.sleep(wait)
            wait *= 2
    return []


def _oisst_text(url):
    request = urllib.request.Request(url, headers={"User-Agent": "earthus-marine-grid/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read().decode("utf-8", "replace")


def _oisst_time_len(year):
    """연도 파일에 실제로 올라온 날짜 수. 현재 날짜를 관측값으로 지어내지 않는다."""
    text = _oisst_text(OISST_DAILY.format(year=year).replace(".ascii", ".dds"))
    match = re.search(r"Float64 time\[time = (\d+)\]", text)
    if not match:
        raise ValueError("OISST 시간축 길이를 읽지 못함")
    return int(match.group(1))


def _oisst_values(text, ny=SST_NY, nx=SST_NX):
    """OPeNDAP ASCII 한 시간면을 남→북 행 순서로 읽는다. 육지는 None이다."""
    rows = [None] * ny
    for line in text.splitlines():
        if not line.startswith("[0]["):
            continue
        try:
            head, tail = line.split(",", 1)
            row = int(head.split("][", 1)[1].rstrip("]"))
            values = [float(value.strip()) for value in tail.split(",")]
        except (ValueError, IndexError):
            continue
        if 0 <= row < ny:
            rows[row] = [None if abs(value) > 100 else round(value, 2)
                         for value in values[:nx]]
    if any(row is None or len(row) != nx for row in rows):
        raise ValueError("OISST 격자가 완전하지 않음")
    return rows


def oisst_sst_global(now):
    """가장 최근 실제 NOAA OISST 일별 관측을 1° 전지구 격자로 만든다.

    NOAA 원본 경도는 0.125..359.875E다. 화면의 날짜변경선과 맞도록 열을 절반
    회전해 -179.875..178.125로 저장한다. 값은 보간하지 않고 8번째 원격자만 쓴다.
    """
    errors = []
    for year in (now.year, now.year - 1):
        try:
            available = _oisst_time_len(year)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{year} 시간축: {exc!r}")
            continue
        year_start = datetime(year, 1, 1, tzinfo=timezone.utc)
        today_step = (now.date() - year_start.date()).days
        last_step = min(available - 1, today_step)
        for step in range(last_step, max(-1, last_step - 8), -1):
            if step < 0:
                continue
            observed = year_start + timedelta(days=step)
            try:
                url = (f"{OISST_DAILY.format(year=year)}?"
                       f"sst[{step}:1:{step}]{SST_LAT_SEL}{SST_LON_SEL}")
                rows = _oisst_values(_oisst_text(url))
                half = SST_NX // 2
                rotated = [value for row in rows for value in (row[half:] + row[:half])]
                sea = sum(value is not None for value in rotated)
                # OISST의 정상적인 해양 비율은 약 69%다. 절반 미만이면 잘린 응답이다.
                if sea < SST_NX * SST_NY * 0.5:
                    raise ValueError(f"바다 격자 부족 ({sea}/{SST_NX * SST_NY})")
                observed_iso = observed.strftime("%Y-%m-%dT00:00:00Z")
                return {
                    "time": observed_iso,
                    "observed": observed_iso,
                    "issuedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "res": SST_RES, "lat0": SST_LAT0, "lon0": SST_LON0,
                    "nx": SST_NX, "ny": SST_NY,
                    "source": "NOAA OISST v2.1 daily observation",
                    "sourceUrl": "https://psl.noaa.gov/data/gridded/data.noaa.oisst.v2.highres.html",
                    "attribution": "NOAA PSL OISST v2.1",
                    "dataType": "observation",
                    "sampling": "0.25 degree source grid sampled every 4th cell to 1 degree",
                    "units": {"sst": "°C"}, "vars": ["sst"],
                    "sea": sea, "sst": rotated,
                }
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{observed.date().isoformat()}: {exc!r}")
    raise RuntimeError("최근 OISST를 받지 못함: " + "; ".join(errors[-4:]))


def handler(event, context):
    lats, lons = grid_points()
    ny, nx = len(lats), len(lons)
    order = [(la, lo) for la in lats for lo in lons]
    n = nx * ny

    out = {f: [None] * n for _, f, _ in VARS}
    sea = fail = 0

    for i in range(0, len(order), BATCH):
        chunk = order[i:i + BATCH]
        try:
            res = fetch_batch(chunk)
        except Exception as e:                               # noqa: BLE001
            fail += len(chunk)
            print(f"[batch {i}] 실패: {e}")
            continue
        for k, item in enumerate(res):
            idx = i + k
            if idx >= n:
                continue
            c = (item or {}).get("current") or {}
            got = False
            for key, field, nd in VARS:
                v = c.get(key)
                if v is None:
                    continue                                 # ⚠️ 육지 — 채우지 않는다
                out[field][idx] = round(v, nd) if nd else int(round(v))
                got = True
            if got:
                sea += 1
        time.sleep(PACE)

    # ⚠️ 지구의 약 70%가 바다다. 격자점의 절반도 안 차면 무언가 잘못된 것이다.
    if sea < n * 0.35:
        raise RuntimeError(f"바다 격자를 너무 못 채움 ({sea}/{n})")

    doc = {
        "time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z"),
        "res": RES, "lat0": -LAT_MAX, "lon0": -180.0,
        "nx": nx, "ny": ny,
        "source": "Open-Meteo Marine",
        "units": {"wave": "m", "wdir": "°", "wper": "s", "swell": "m",
                  "sper": "s", "sst": "°C", "cur": "m/s", "cdir": "°"},
        "vars": [f for _, f, _ in VARS],
        "sea": sea,
        **out,
    }
    body = json.dumps(doc, separators=(",", ":")).encode()
    dst.put_object(Bucket=DST_BUCKET, Key="ocean/marine.json", Body=body,
                   ContentType="application/json",
                   CacheControl="public, max-age=1800")
    counts = {f: sum(1 for v in out[f] if v is not None) for _, f, _ in VARS}
    print(f"[out] {nx}x{ny} 바다 {sea} 실패 {fail} {len(body)/1024:.0f}KB  {counts}")

    # SST 관측판 실패가 파고·너울·해류의 마지막 정상판까지 막으면 안 된다.
    # 성공했을 때만 별도 객체를 교체하고, 실패하면 S3의 마지막 정상판을 그대로 둔다.
    sst_result = {"ok": False}
    try:
        sst = oisst_sst_global(datetime.now(timezone.utc))
        sst_body = json.dumps(sst, separators=(",", ":")).encode()
        dst.put_object(Bucket=DST_BUCKET, Key="ocean/sst-global.json", Body=sst_body,
                       ContentType="application/json",
                       CacheControl="public, max-age=1800")
        sst_result = {"ok": True, "observed": sst["observed"],
                      "sea": sst["sea"], "bytes": len(sst_body)}
        print(f"[oisst] {sst['observed']} 1° 바다 {sst['sea']} {len(sst_body)/1024:.0f}KB")
    except Exception as exc:  # noqa: BLE001
        sst_result["error"] = repr(exc)
        print(f"[oisst] 마지막 정상판 유지: {exc!r}")

    return {"ok": True, "sea": sea, "failed": fail, "bytes": len(body),
            "counts": counts, "sstGlobal": sst_result}
