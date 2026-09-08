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

⚠️⚠️ **바람도 같이 받는다 (2026-09-08).** Open-Meteo 는 요청 수로 한도를 세지
   변수 수로 세지 않는다 — 이미 던지는 16회 요청에 `wind_speed_10m`,
   `wind_direction_10m` 을 얹으면 **추가 요청 0회**로 1° 바람 격자가 나온다.
   왜 필요했나: 전지구 바람 격자가 5°(555km)라 **태풍이 통째로 격자 사이로
   빠진다.** 2026-09-08 실측 — 전지구 2,376칸의 최대 풍속이 23.8m/s 였고
   30m/s 이상은 0칸이었다. 같은 시각 일본 주변 5° 격자의 최대는 14.2m/s 다.
   화면에서 "태풍인데 바람이 전혀 안 느껴진다"가 된 이유가 이것이다.
   ⚠️ 1°(약 111km)도 태풍 눈벽(약 50km)을 온전히 담지는 못한다. 담는 것은
      **폭풍역**이다 — 그것만으로도 5° 가 놓치던 25~35m/s 가 살아난다.

출력  wind/pressure-ea.json   (mslp — 등압선)
      wind/wind-ea.json       (u·v — 바람 색면·입자 보강판)
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
DST_WIND = "wind/wind-ea.json"
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
    # 바람은 u/v 로 저장한다 — 클라이언트가 벡터 크기와 방향을 둘 다 쓴다.
    wu = [None] * len(pts)
    wv = [None] * len(pts)
    fail = 0
    for i in range(0, len(pts), BATCH):
        ch = pts[i:i + BATCH]
        q = urllib.parse.urlencode({
            "latitude": ",".join(f"{a:g}" for a, _ in ch),
            "longitude": ",".join(f"{o:g}" for _, o in ch),
            # ⚠️ 변수를 늘려도 **요청 수는 그대로**다. 바람은 여기 얹어서 공짜로 얻는다.
            "current": "pressure_msl,wind_speed_10m,wind_direction_10m",
            "wind_speed_unit": "ms",
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
            cur = row.get("current") or {}
            v = cur.get("pressure_msl")
            # ⚠️ 결측을 채우지 않는다. 등압선은 빈 칸을 만나면 그 구간을 안 그린다.
            if v is not None and i + k < len(vals):
                vals[i + k] = round(v, 1)
            sp, dr = cur.get("wind_speed_10m"), cur.get("wind_direction_10m")
            if sp is not None and dr is not None and i + k < len(wu):
                # ⚠️ 기상 풍향은 **불어오는 쪽**이다. 벡터는 불어가는 쪽이라 부호가 뒤집힌다.
                #    이걸 틀리면 바람이 통째로 거꾸로 흐른다(소말리 제트로 검산 가능).
                rad = math.radians(dr)
                wu[i + k] = round(-sp * math.sin(rad), 2)
                wv[i + k] = round(-sp * math.cos(rad), 2)
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

    # ── 바람 1° 보강판 ────────────────────────────────────────────────
    # ⚠️ 기압이 충분히 찼는데 바람만 비었다면 그건 응답 형식이 바뀐 것이다.
    #    없는 자료를 0 으로 채우지 않는다 — 파일을 아예 안 쓰고 이유를 남긴다.
    wok = sum(1 for a in wu if a is not None)
    wind_written = False
    if wok >= len(wu) * 0.7:
        speeds = [math.hypot(a, b) for a, b in zip(wu, wv)
                  if a is not None and b is not None]
        wdoc = {
            "time": doc["time"],
            "lat0": LAT0, "lon0": LON0, "res": RES, "nx": nx, "ny": ny,
            "unit": "m/s",
            "source": "Open-Meteo (GFS/ECMWF)",
            "filled": wok, "failed": len(wu) - wok,
            "max": round(max(speeds), 1) if speeds else None,
            "derivation": {
                "method": "WIND_DIR_TO_UV",
                "formula": "u=-speed*sin(dir), v=-speed*cos(dir)",
                "inputs": ["wind_speed_10m", "wind_direction_10m"],
            },
            "note": {
                "ko": f"동아시아 {RES}° 지상 10m 바람 격자입니다. 전지구 격자는 5°"
                      f"(약 555km)라 태풍이 격자 사이로 빠집니다. "
                      f"⚠️ 1°는 약 111km 입니다 — 태풍의 눈벽(약 50km)은 이 자료에도 "
                      f"없습니다. 담기는 것은 폭풍역의 넓이와 세기입니다.",
            },
            "u": wu, "v": wv,
        }
        wbody = json.dumps(wdoc, ensure_ascii=False, separators=(",", ":")).encode()
        s3.put_object(Bucket=BUCKET, Key=DST_WIND, Body=wbody,
                      ContentType="application/json; charset=utf-8",
                      CacheControl="public, max-age=1800")
        wind_written = True
        print(f"[wind-ea] {nx}x{ny} · 채움 {wok}/{len(wu)} · "
              f"최대 {wdoc['max']}m/s · {len(wbody)/1024:.0f}KB")
    else:
        print(f"[wind-ea] 건너뜀 — 채움 {wok}/{len(wu)} (70% 미만)")

    return {"ok": True, "nx": nx, "ny": ny, "filled": ok, "failed": fail,
            "windFilled": wok, "windWritten": wind_written}
