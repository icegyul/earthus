"""전지구 대기질 격자 → 색상 오버레이용 JSON

무엇을 담나 (한 번의 요청으로 전부)
  pm25   초미세먼지 PM2.5 (µg/m³)
  pm10   미세먼지 PM10 (µg/m³)
  dust   먼지 질량 — **황사·사막 모래바람**이 이 값으로 보인다 (µg/m³)
  o3     오존 (µg/m³)
  uv     자외선 지수
  aod    에어로졸 광학두께 — 연기·먼지가 햇빛을 얼마나 가리는지
  aqi    대기질 지수 (유럽 기준)
  aqiUs  대기질 지수 (미국 기준)

⚠️ 왜 AQI 를 두 개 담나
   같은 공기를 두고 유럽과 미국이 다른 숫자를 낸다. 계산식이 다르기 때문이다.
   하나만 담고 "대기질 지수"라고 부르면, 다른 기준을 쓰는 나라 사용자에게
   틀린 값을 보여주게 된다. 둘 다 담고 화면에서 어느 기준인지 밝힌다.

⚠️ 황사를 "황사"라고 단정하지 않는다.
   dust 는 먼지 질량이다. 그게 고비사막에서 왔는지, 사하라에서 왔는지,
   공사장에서 났는지 이 값만으로는 모른다. 화면에는 "먼지"라고 쓰고,
   바람 방향과 함께 보여줘서 사람이 판단하게 한다.

왜 서버에서 만드나 — wind-grid 와 같은 이유다.
  Open-Meteo 는 지점 API 라 타일을 주지 않는다. 전지구 5° 격자면 24회 요청이다.
  브라우저마다 하게 두면 사용자 수만큼 곱해진다.

출처: Open-Meteo Air Quality API (기반: CAMS — Copernicus 대기 감시)

결과
  s3://<CACHE_BUCKET>/wind/air.json

⚠️ 왜 air/ 가 아니라 wind/ 아래인가
   버킷 정책의 공개 접두사가 정해져 있다(app·celestrak·clouds·wind·events·ocean·solar).
   air/ 로 올렸더니 파일은 생겼는데 브라우저에서 403 이 났다 (실측).
   접두사를 늘리려면 버킷 정책을 고쳐야 하는데 배포 계정에 그 권한이 없다.
   대기 자료도 기상이므로 wind/ 아래 두는 것이 뜻에도 맞는다.
"""

import json
import math
import os
import time
import urllib.parse
import urllib.error
import urllib.request
from datetime import datetime, timezone

import boto3

DST_BUCKET = os.environ["CACHE_BUCKET"]
DST_REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
API = "https://air-quality-api.open-meteo.com/v1/air-quality"

RES = 5.0
LAT_MAX = 80.0
BATCH = 100
PACE = 6.0                # wind-grid 과 같은 이유 — 쉬지 않고 던지면 429 가 난다

dst = boto3.client("s3", region_name=DST_REGION)

# (응답 키, 우리 필드, 반올림 자리)
VARS = [
    ("pm2_5", "pm25", 1),
    ("pm10", "pm10", 1),
    ("dust", "dust", 1),
    ("ozone", "o3", 0),
    ("uv_index", "uv", 1),
    ("aerosol_optical_depth", "aod", 2),
    ("european_aqi", "aqi", 0),
    ("us_aqi", "aqiUs", 0),
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
    })
    wait = 8
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(f"{API}?{q}", timeout=45) as r:
                d = json.load(r)
            return d if isinstance(d, list) else [d]
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == tries - 1:
                raise
            print(f"  429 — {wait}초 대기 후 재시도")
            time.sleep(wait)
            wait *= 2
    return []


def handler(event, context):
    lats, lons = grid_points()
    ny, nx = len(lats), len(lons)
    order = [(la, lo) for la in lats for lo in lons]
    n = nx * ny

    out = {f: [None] * n for _, f, _ in VARS}
    ok = fail = 0

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
                    continue
                # ⚠️ 없는 값을 0 으로 채우지 않는다. 0 µg/m³ 는 "매우 깨끗함"이라는
                #    뜻이 돼서, 자료가 없는 곳이 가장 깨끗한 곳으로 칠해진다.
                out[field][idx] = round(v, nd) if nd else int(round(v))
                got = True
            if got:
                ok += 1
            else:
                fail += 1
        time.sleep(PACE)

    if ok < n * 0.4:
        raise RuntimeError(f"격자를 절반도 못 채움 ({ok}/{n})")

    doc = {
        "time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z"),
        "res": RES, "lat0": -LAT_MAX, "lon0": -180.0,
        "nx": nx, "ny": ny,
        "source": "Open-Meteo Air Quality (CAMS)",
        "units": {"pm25": "µg/m³", "pm10": "µg/m³", "dust": "µg/m³",
                  "o3": "µg/m³", "uv": "index", "aod": "unitless",
                  "aqi": "European AQI", "aqiUs": "US AQI"},
        "vars": [f for _, f, _ in VARS],
        "filled": ok,
        **out,
    }
    body = json.dumps(doc, separators=(",", ":")).encode()
    dst.put_object(Bucket=DST_BUCKET, Key="wind/air.json", Body=body,
                   ContentType="application/json",
                   CacheControl="public, max-age=1800")
    counts = {f: sum(1 for v in out[f] if v is not None) for _, f, _ in VARS}
    print(f"[out] {nx}x{ny} 채움 {ok} 실패 {fail} {len(body)/1024:.0f}KB  {counts}")
    return {"ok": True, "filled": ok, "failed": fail, "bytes": len(body), "counts": counts}
