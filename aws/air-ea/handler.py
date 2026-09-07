"""동아시아 대기질 격자 → 미세먼지 · 황사 · 오존 · 자외선 (0.5°)

무엇을 담나 — 전지구판(air-grid)과 **같은 필드, 같은 이름**이다.
  pm25   초미세먼지 PM2.5 (µg/m³)
  pm10   미세먼지 PM10 (µg/m³)
  dust   먼지 질량 — 고비·타클라마칸에서 오는 모래바람이 이 값으로 보인다 (µg/m³)
  o3     오존 (µg/m³)
  uv     자외선 지수
  aod    에어로졸 광학두께
  aqi    대기질 지수 (유럽 기준)
  aqiUs  대기질 지수 (미국 기준)

⚠️⚠️ **왜 따로 만드나 — 5° 는 먼지를 네모로 만든다.**
   전지구판은 5° = 약 550km 다. 2026-09-07 실측:

     전지구 5° 판이 본 것   40°N: 100E=349 · 105E=407 µg/m³
     같은 시각 0.5° 실제값  40°N: 96E=245 · 98E=473 · 100E=341 · 102E=351
                               · 104E=**817** · 106E=62 · 108E=8 · 110E=0

   최고농도 817 이 격자 사이로 통째로 빠졌고, 그 자리에는 550km 짜리 네모
   한 칸이 대신 그려졌다. 사용자 신고가 정확히 그 네모였다("먼지도 저기
   부분만 네모야"). 색을 부드럽게 칠해도 없는 자료가 생기지는 않는다 —
   자료를 더 촘촘히 재는 수밖에 없다.

⚠️ 왜 하필 0.5° 인가
   바탕 모델(CAMS 전지구)이 약 0.4°(44km)다. 그보다 촘촘히 뽑으면 없는 정밀도를
   만들어내는 것이고, 그보다 성기면 위처럼 봉우리를 놓친다. 0.4° 에 가장 가까우면서
   동아시아 보강판들(marine-ea · sst-anom-ea)과 **같은 칸**이 되는 값이 0.5° 다.

⚠️⚠️ **상자를 해양 보강판보다 서쪽으로 넓게 잡는다 (20~50°N, 90~150°E).**
   처음엔 해양 보강판과 같은 114~150°E 로 만들었는데, 정작 문제의 먼지 봉우리
   (40°N 104°E, 817µg/m³)가 **상자 왼쪽 밖**이었다. 고비·타클라마칸은 대략
   85~110°E 에 있다 — 발원지를 안 담으면 "황사가 어디서 오고 있나"를 못 본다.
   바다는 한반도 주변만 촘촘하면 되지만, 먼지는 **오는 길**을 함께 봐야 한다.
   ⚠️ 판마다 상자가 다르다(marine-ea 114~150·pressure-ea 110~160·여기 90~150).
      화면 쪽 FINE_BOX 표와 반드시 같이 고친다 — 어긋나면 상자 밖을 보는데도
      보강판을 받거나, 안을 보는데 안 받는다.

⚠️ 전지구판을 **대체하지 않는다.** 화면은 전지구 5° 판을 깔고 이 판을 그 위에
   덧그린다(prototype/js/gridoverlay.js). 그래서 상자 밖이 비지 않고,
   이 수집이 한 회차 실패해도 화면에서 대기질이 사라지지 않는다.

⚠️ 황사를 "황사"라고 단정하지 않는다. dust 는 먼지 질량이다. 어디서 왔는지는
   이 숫자에 없다 — 화면에는 "먼지"라고 쓰고 바람과 함께 보여 사람이 판단하게 한다.

출처: Open-Meteo Air Quality API (기반: CAMS — Copernicus 대기 감시)

결과
  s3://<CACHE_BUCKET>/wind/air-ea.json
  s3://<CACHE_BUCKET>/wind/status/air-ea.json

⚠️ 왜 air/ 가 아니라 wind/ 아래인가 — 버킷 정책의 공개 접두사가 정해져 있다.
   air/ 로 올리면 파일은 생기는데 브라우저에서 403 이 난다(실측, air-grid 머리말 참고).
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
OUTPUT_KEY = "wind/air-ea.json"
STATUS_DST = "wind/status/air-ea.json"
COLLECTOR_REVISION = "air-ea.2026-09-07.n2"
API = "https://air-quality-api.open-meteo.com/v1/air-quality"

RES = 0.5
LAT0, LAT1 = 20.0, 50.0
LON0, LON1 = 90.0, 150.0
BATCH = 100
# ⚠️ 쉬지 않고 던지면 429 가 난다.
#    실측(2026-09-07, ap-northeast-2): 100지점 한 번이 약 5.5초, PACE 3.0 을 더해
#    36회에 305초였다. 넓힌 상자는 74회이므로 7.5×74 ≈ 555초 — timeout 900초 안이다.
PACE = 2.0

dst = boto3.client("s3", region_name=DST_REGION)

# (응답 키, 우리 필드, 반올림 자리) — 전지구판과 같은 표를 쓴다.
# ⚠️ 여기를 air-grid 와 다르게 두면 같은 이름의 두 판이 다른 뜻이 된다.
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
    lons = [LON0 + i * RES for i in range(int(round((LON1 - LON0) / RES)) + 1)]
    lats = [LAT0 + j * RES for j in range(int(round((LAT1 - LAT0) / RES)) + 1)]
    return lats, lons


def _previous_success():
    """직전 성공시각만 이어받는다. 상태 파일이 없거나 손상되면 추측하지 않는다."""
    try:
        body = dst.get_object(Bucket=DST_BUCKET, Key=STATUS_DST)["Body"].read(32768)
        doc = json.loads(body)
        value = doc.get("lastSuccessAt") if isinstance(doc, dict) else None
        return value if isinstance(value, str) and value.endswith("Z") else None
    except Exception:  # noqa: BLE001 — 첫 실행·옛 배포에는 상태 파일이 없다.
        return None


def write_status(started_at, state, reason, output_written, **details):
    """last-good 격자와 이번 실행 상태를 분리해 기록한다.

    ⚠️ Lambda timeout 은 Python 예외가 아니라 프로세스 강제 종료다. 제한시간 직전
       스스로 멈춰 이 heartbeat 를 남겨야, 옛 자료가 정상처럼 보이지 않는다.
    """
    completed = datetime.now(timezone.utc)
    previous_success = _previous_success()
    last_success = (completed.strftime("%Y-%m-%dT%H:%M:%SZ")
                    if state == "SUCCEEDED" else previous_success)
    doc = {
        "schema": 2,
        "collector": "air-ea",
        "revision": COLLECTOR_REVISION,
        "generated": completed.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "lastAttemptAt": started_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "lastSuccessAt": last_success,
        "state": state,
        "reason": reason,
        "outputKey": OUTPUT_KEY,
        "lastGood": OUTPUT_KEY if last_success else None,
        "outputWritten": bool(output_written),
        "latencyMs": round((completed - started_at).total_seconds() * 1000),
        "quota": "UNKNOWN",
        "estimatedCost": "UNKNOWN",
    }
    doc.update({key: value for key, value in details.items() if value is not None})
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    dst.put_object(Bucket=DST_BUCKET, Key=STATUS_DST, Body=body,
                   ContentType="application/json; charset=utf-8", CacheControl="no-cache")
    return doc


def deadline_near(context, reserve_ms=120000):
    """상태 기록과 남은 batch 하나에 필요한 시간을 남긴다."""
    remaining = getattr(context, "get_remaining_time_in_millis", lambda: 900000)()
    return remaining < reserve_ms


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
            with urllib.request.urlopen(f"{API}?{q}", timeout=60) as r:
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
    started_at = datetime.now(timezone.utc)
    lats, lons = grid_points()
    ny, nx = len(lats), len(lons)
    order = [(la, lo) for la in lats for lo in lons]
    n = nx * ny

    out = {f: [None] * n for _, f, _ in VARS}
    ok = fail = 0

    for i in range(0, len(order), BATCH):
        if deadline_near(context):
            # ⚠️ 반쯤 채운 격자를 올리지 않는다. 구멍 난 판을 올리면 화면에서
            #    "거기는 공기가 없다"가 된다 — 지난 회차의 온전한 판을 그대로 둔다.
            reason = "lambda-deadline-near-before-complete-grid"
            write_status(started_at, "FAILED", reason, False,
                         processedPointCount=i, totalPointCount=n,
                         sampleCount=ok, missing=fail)
            print(f"[deadline] {i}/{n} 에서 중단 — 지난 판을 유지한다")
            return {"ok": False, "status": "FAILED", "reason": reason,
                    "processed": i, "total": n}
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

    # ⚠️ 대기질은 바다 위에도 값이 있다. 육지·바다 구분이 없으므로 거의 다 차야
    #    정상이다(실측 100/100). 많이 비면 API 쪽 문제이지 지형 때문이 아니다.
    if ok < n * 0.6:
        reason = f"usable-grid-too-small:{ok}/{n}"
        write_status(started_at, "FAILED", reason, False,
                     processedPointCount=n, totalPointCount=n,
                     sampleCount=ok, missing=fail)
        raise RuntimeError(f"격자를 너무 못 채움 ({ok}/{n})")

    doc = {
        "time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z"),
        "res": RES, "lat0": LAT0, "lon0": LON0,
        "nx": nx, "ny": ny,
        "source": "Open-Meteo Air Quality (CAMS)",
        "region": "East Asia and dust corridor 20-50N 90-150E",
        "units": {"pm25": "µg/m³", "pm10": "µg/m³", "dust": "µg/m³",
                  "o3": "µg/m³", "uv": "index", "aod": "unitless",
                  "aqi": "European AQI", "aqiUs": "US AQI"},
        "vars": [f for _, f, _ in VARS],
        "filled": ok,
        **out,
    }
    body = json.dumps(doc, separators=(",", ":")).encode()
    dst.put_object(Bucket=DST_BUCKET, Key=OUTPUT_KEY, Body=body,
                   ContentType="application/json",
                   CacheControl="public, max-age=1800")
    counts = {f: sum(1 for v in out[f] if v is not None) for _, f, _ in VARS}
    write_status(started_at, "SUCCEEDED", "air-ea-grid-written", True,
                 dataGenerated=doc["time"], sourceObservedAt=doc["time"],
                 processedPointCount=n, totalPointCount=n,
                 sampleCount=ok, missing=fail, failureCount=fail,
                 outputBytes=len(body))
    print(f"[out] {nx}x{ny} 채움 {ok} 실패 {fail} {len(body)/1024:.0f}KB  {counts}")
    return {"ok": True, "filled": ok, "failed": fail, "bytes": len(body), "counts": counts}
