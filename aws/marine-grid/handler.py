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
"""

import json
import os
import time
import urllib.parse
import urllib.error
import urllib.request
from datetime import datetime, timezone

import boto3

DST_BUCKET = os.environ["CACHE_BUCKET"]
DST_REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
API = "https://marine-api.open-meteo.com/v1/marine"

RES = 5.0
LAT_MAX = 80.0
BATCH = 100
PACE = 6.0

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
    return {"ok": True, "sea": sea, "failed": fail, "bytes": len(body), "counts": counts}
