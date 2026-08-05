# -*- coding: utf-8 -*-
"""동아시아 1° 예보 격자 — 태풍 화면의 시간 이동(타임라인)용

받은 지시
  "윈디 기준으로 시간을 정해서 위치를 잡아주면 될 거 같은데" +
  "타임라인 잡고 움직이면 그 시간대 위치, 플레이 버튼으로 시간대별 움직임"

지금 화면의 등압선(pressure-grid)과 바람 입자(wind-grid)는 **실황**이다.
타임라인으로 시간을 밀면 그 시각의 **모델 예보** 기압·바람이 필요하다.
그걸 여기서 만든다 — 같은 동아시아 1° 격자로, 6시간 간격 +120시간(5일).

⚠️ 5일에서 끊는 이유: 태풍의 공식 예보(위치·반경)가 120시간까지다.
   그 너머는 격자가 있어도 태풍을 그릴 근거가 없다 — 지어내게 된다.
⚠️ 격자·범위·한도 사정은 pressure-grid/handler.py 주석 참고 (같은 격자다).
⚠️ 바람은 Open-Meteo 가 속도·방향으로 주므로 여기서 u/v(동·북 성분)로
   바꿔 둔다 — 클라이언트 입자 엔진(windfield.js)이 u/v 를 먹는다.
   기상 방향은 "불어오는 쪽"이라 u = -spd·sin(dir), v = -spd·cos(dir).

출력  wind/fx-ea.json
  { time, lat0, lon0, res, nx, ny, stepH, source,
    steps: [ { t, mslp[], u[], v[], min, max } × 21 ] }
  결측은 null 그대로 둔다 — 등압선은 빈 칸을 안 그린다(추정 금지).
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

DST = "wind/fx-ea.json"
API = "https://api.open-meteo.com/v1/forecast"

# ⚠️ pressure-grid 와 반드시 같은 격자 — 클라이언트가 같은 그리기 코드를 쓴다
LAT0, LAT1 = 20.0, 50.0
LON0, LON1 = 110.0, 160.0
RES = 1.0
BATCH = 100
STEP_H = 6            # 6시간 간격
MAX_H = 120           # +5일 — 태풍 공식 예보의 한계에 맞춘다


def handler(event=None, context=None):
    lats = [LAT0 + i * RES for i in range(int((LAT1 - LAT0) / RES) + 1)]
    lons = [LON0 + i * RES for i in range(int((LON1 - LON0) / RES) + 1)]
    ny, nx = len(lats), len(lons)
    pts = [(a, o) for a in lats for o in lons]
    nstep = MAX_H // STEP_H + 1

    # steps[k][i] = k번째 시각, i번째 점
    msl = [[None] * len(pts) for _ in range(nstep)]
    uu = [[None] * len(pts) for _ in range(nstep)]
    vv = [[None] * len(pts) for _ in range(nstep)]
    step_times = [None] * nstep
    fail = 0

    for i in range(0, len(pts), BATCH):
        ch = pts[i:i + BATCH]
        q = urllib.parse.urlencode({
            "latitude": ",".join(f"{a:g}" for a, _ in ch),
            "longitude": ",".join(f"{o:g}" for _, o in ch),
            "hourly": "pressure_msl,wind_speed_10m,wind_direction_10m",
            "windspeed_unit": "ms",
            "forecast_days": 6,          # 오늘 + 5일 → +120h 가 들어온다
            "timezone": "UTC",
        })
        # ⚠️ 분당 한도 — pressure-grid 에서 실측으로 배운 그대로: 점점 더 기다린다
        d = None
        wait = 8
        for attempt in range(5):
            try:
                with urllib.request.urlopen(f"{API}?{q}", timeout=90) as r:
                    d = json.load(r)
                break
            except Exception as e:                            # noqa: BLE001
                if attempt == 4:
                    print(f"[fx] {i} 포기 {str(e)[:80]}")
                    break
                print(f"[fx] {i} 재시도 {attempt + 1} — {wait}초 ({str(e)[:50]})")
                time.sleep(wait)
                wait = int(wait * 1.8)
        if d is None:
            fail += len(ch)
            continue
        rows = d if isinstance(d, list) else [d]

        for k, row in enumerate(rows):
            h = row.get("hourly") or {}
            times = h.get("time") or []
            if not times:
                continue
            # "지금" 정시부터 6시간 간격으로 자른다.
            # ⚠️ 배열 첫 칸은 오늘 00시(UTC)다 — 지금이 아니다. 지금 시각을 찾는다.
            now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00")
            try:
                base = times.index(now_iso)
            except ValueError:
                base = 0
            p = h.get("pressure_msl") or []
            sp = h.get("wind_speed_10m") or []
            dr = h.get("wind_direction_10m") or []
            for s_i in range(nstep):
                t_i = base + s_i * STEP_H
                if t_i >= len(times):
                    break
                if step_times[s_i] is None:
                    step_times[s_i] = times[t_i] + ":00Z"
                pv = p[t_i] if t_i < len(p) else None
                sv = sp[t_i] if t_i < len(sp) else None
                dv = dr[t_i] if t_i < len(dr) else None
                gi = i + k
                if pv is not None:
                    msl[s_i][gi] = round(pv, 1)
                if sv is not None and dv is not None:
                    rad = math.radians(dv)
                    uu[s_i][gi] = round(-sv * math.sin(rad), 1)
                    vv[s_i][gi] = round(-sv * math.cos(rad), 1)
        time.sleep(1.2)

    ok = sum(1 for v in msl[0] if v is not None)
    if ok < len(pts) * 0.7:
        return {"ok": False, "reason": f"filled {ok}/{len(pts)}"}

    steps = []
    for s_i in range(nstep):
        got = [v for v in msl[s_i] if v is not None]
        if not got:
            continue
        steps.append({
            "t": step_times[s_i], "h": s_i * STEP_H,
            "min": min(got), "max": max(got),
            "mslp": msl[s_i], "u": uu[s_i], "v": vv[s_i],
        })

    doc = {
        "time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z"),
        "lat0": LAT0, "lon0": LON0, "res": RES, "nx": nx, "ny": ny,
        "stepH": STEP_H, "maxH": MAX_H,
        "unit": {"mslp": "hPa", "uv": "m/s"},
        "source": "Open-Meteo (GFS·ECMWF 모델 예보)",
        "note": {"ko": "모델이 계산한 예보입니다. 저희 예보가 아니며, 실황과 함께 "
                       "쓰지 않도록 화면에서 '예보 보기'를 명시합니다."},
        "filled": ok, "failed": fail,
        "steps": steps,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=3600")
    print(f"[fx] {nx}x{ny} × {len(steps)}스텝 · 채움 {ok}/{len(pts)} · "
          f"{len(body) / 1024:.0f}KB")
    return {"ok": True, "steps": len(steps), "filled": ok, "bytes": len(body)}
