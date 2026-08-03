# -*- coding: utf-8 -*-
"""동아시아 1° 해면기압 격자 — 등압선을 그리기 위한 것

받은 지적
  "기압배치에 고기압 저기압 배치를 등고선을 써서 보여주면 어때? 더 정확할거 같은데"

맞는 말이다. 기상학에서 기압을 읽는 방식이 그것이다 —
**등압선의 간격이 곧 바람 세기**다. 촘촘하면 세다. 색칠만으로는 그게 안 보인다.

⚠️⚠️ 그런데 기존 전지구 격자는 **5°(약 555km)** 다. 한반도 전체가 한 칸이다.
   그 격자로 매끄러운 등압선을 그리면 **없는 정밀도를 있는 척하는 것**이 된다 —
   555km 간격 점 넷을 이어 놓고 "여기 전선이 있다"처럼 보이게 된다.
   → 그래서 **이 영역만 1°(약 111km)** 로 따로 받는다.

⚠️ 범위를 동아시아로 잡은 이유
   "태풍이 북태평양 고기압 가장자리를 따라 간다"를 보려면 그 고기압이 화면에 들어와야
   한다. 여름 북태평양 고기압 중심은 대략 30N/150E 부근이다. 그래서 160E 까지 잡았다.
   ⚠️ 전지구를 1° 로 하면 격자가 25배(약 6만 점)라 Open-Meteo 한도에 걸린다.
      우리 사용자가 실제로 들여다보는 곳만 촘촘하게 한다.

실측(2026-08-03): 304점 6.8초. 아래 범위(1,581점)면 16회 요청, 약 11초.

출력  wind/pressure-ea.json
"""

import json
import math
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
s3 = boto3.client("s3", region_name=REGION)

DST = "wind/pressure-ea.json"
API = "https://api.open-meteo.com/v1/forecast"

# 동아시아 — 북태평양 고기압이 들어오도록 동쪽을 넓게
LAT0, LAT1 = 20.0, 50.0
LON0, LON1 = 110.0, 160.0
RES = 1.0
BATCH = 100          # ⚠️ 좌표를 URL 에 이어 붙이므로 무한정 못 늘린다


def handler(event=None, context=None):
    lats = [LAT0 + i * RES for i in range(int((LAT1 - LAT0) / RES) + 1)]
    lons = [LON0 + i * RES for i in range(int((LON1 - LON0) / RES) + 1)]
    ny, nx = len(lats), len(lons)
    pts = [(a, o) for a in lats for o in lons]

    vals = [None] * len(pts)
    fail = 0
    for i in range(0, len(pts), BATCH):
        ch = pts[i:i + BATCH]
        q = urllib.parse.urlencode({
            "latitude": ",".join(f"{a:g}" for a, _ in ch),
            "longitude": ",".join(f"{o:g}" for _, o in ch),
            "current": "pressure_msl",
            "timezone": "UTC",
        })
        # ⚠️⚠️ **Open-Meteo 는 분당 한도가 있다.** 쉬지 않고 던지면 6회쯤에서
        #    429 가 시작된다 — 실측으로 1,581점 중 600점만 채워졌다.
        #    wind-grid 에 이미 같은 로직이 있었는데 여기 안 옮겨서 그대로 걸렸다.
        #    → 걸리면 **점점 더 기다린다.** 그래도 안 되면 그 묶음만 비운다(추정 안 함).
        d = None
        wait = 8
        for attempt in range(5):
            try:
                with urllib.request.urlopen(f"{API}?{q}", timeout=60) as r:
                    d = json.load(r)
                break
            except Exception as e:                           # noqa: BLE001
                msg = str(e)
                if attempt == 4:
                    print(f"[pressure] {i} 포기 {msg[:80]}")
                    break
                print(f"[pressure] {i} 재시도 {attempt + 1} — {wait}초 ({msg[:50]})")
                time.sleep(wait)
                wait = int(wait * 1.8)
        if d is None:
            fail += len(ch)
            continue
        rows = d if isinstance(d, list) else [d]
        for k, row in enumerate(rows):
            v = (row.get("current") or {}).get("pressure_msl")
            # ⚠️ 결측을 채우지 않는다. 등압선은 빈 칸을 만나면 그 구간을 안 그린다.
            if v is not None and i + k < len(vals):
                vals[i + k] = round(v, 1)
        # ⚠️ 묶음 사이 간격. 0.25 초로는 한도에 걸렸다 — 넉넉히 둔다.
        time.sleep(1.2)

    ok = sum(1 for v in vals if v is not None)
    if ok < len(vals) * 0.7:
        return {"ok": False, "reason": f"filled {ok}/{len(vals)}"}

    got = [v for v in vals if v is not None]
    doc = {
        "time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z"),
        "lat0": LAT0, "lon0": LON0, "res": RES, "nx": nx, "ny": ny,
        "unit": "hPa",
        "source": "Open-Meteo (GFS/ECMWF)",
        "filled": ok, "failed": fail,
        "min": min(got), "max": max(got),
        "note": {
            "ko": f"동아시아 {RES}° 해면기압 격자입니다. 등압선을 그리기 위한 자료로, "
                  f"전지구 격자(5°)로는 한반도가 한 칸이라 따로 받습니다. "
                  f"⚠️ 1°는 약 111km 입니다 — 그보다 작은 기압 변화는 이 자료에 없습니다.",
        },
        "mslp": vals,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=1800")
    print(f"[pressure] {nx}x{ny} · 채움 {ok}/{len(vals)} · "
          f"{min(got):.1f}~{max(got):.1f}hPa · {len(body)/1024:.0f}KB")
    return {"ok": True, "nx": nx, "ny": ny, "filled": ok, "failed": fail}
