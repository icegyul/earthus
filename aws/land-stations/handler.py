"""지상 관측소 — 전 세계 METAR 실황

왜 만드나 (받은 요청)
  "해양부이가 있다면 지상 관측소도 연결해서 해양부이처럼 지상관측소에서 제공되는
   기능과 5일치 자료, 사진/영상 자료 볼 수 있게 해주면 되겠어"

  기존 '관측소' 레이어는 도시 47곳을 Open-Meteo 로 조회해 **예보**를 보여주는
  것이었다. 실제로 계기가 놓여 있는 관측소가 아니다.
  METAR 은 전 세계 공항에 실제로 설치된 관측 장비가 30분~1시간마다 내는 **실황**이다.
  해양부이와 같은 성격이라, 같은 방식으로 다룰 수 있다.

⚠️ 400건 상한이 있다 (실측)
   bbox 를 크게 잡으면 정확히 400 에서 잘린다. 미국 본토 한 번에 = 400.
   전지구를 한 번에 = 157 (이건 상한이 아니라 다른 필터로 보인다).
   그래서 타일로 나눠 받고, **정확히 상한에 걸린 타일만 넷으로 쪼갠다.**
   무조건 잘게 나누면 요청이 수백 번이 되고, 크게 두면 조용히 잘린다.

⚠️ CORS 가 없다 → 브라우저가 직접 못 부른다. 그래서 이 Lambda 가 있다.

⚠️ 왜 wind/ 아래인가
   버킷 공개 접두사가 고정이다(app·celestrak·clouds·wind·events·ocean·solar).
   land/ 로 올리면 파일은 생기는데 브라우저에서 403 이 난다 (air-grid 에서 실측).

출처: NOAA Aviation Weather Center (aviationweather.gov)

결과
  s3://<CACHE_BUCKET>/wind/stations.json
"""

import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
API = "https://aviationweather.gov/api/data/metar"
UA = {"User-Agent": "earthus/0.1 (+globe app; ground station observations)"}

CAP = 400              # 한 요청의 최대 반환 수 (실측)
MAX_DEPTH = 3          # 쪼개기 한계 — 이 이상은 요청 수가 폭발한다
PACE = 0.35

s3 = boto3.client("s3", region_name=REGION)


def fetch(bbox, tries=3):
    url = f"{API}?bbox={bbox}&format=json"
    wait = 3
    for a in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                raw = r.read().decode("utf-8", "replace").strip()
            # ⚠️ 관측소가 없는 타일(대양·남극)은 **빈 본문**을 준다. JSON 이 아니다.
            #    이걸 실패로 세면 바다 타일마다 3번씩 재시도해서 시간만 버린다.
            if not raw:
                return []
            d = json.loads(raw)
            return d if isinstance(d, list) else []
        except Exception as e:                               # noqa: BLE001
            if a == tries - 1:
                print(f"  [bbox {bbox}] 실패 {e!r}")
                return []
            time.sleep(wait)
            wait *= 2
    return []


def collect(s, w, n, e, depth, out, stats):
    """타일 하나를 받는다. 상한에 걸리면 넷으로 쪼갠다."""
    rows = fetch(f"{s},{w},{n},{e}")
    stats["req"] += 1
    time.sleep(PACE)
    if len(rows) >= CAP and depth < MAX_DEPTH:
        # ⚠️ 잘렸다. 이 안에 더 있다는 뜻이므로 쪼갠다.
        stats["split"] += 1
        ms, me = (s + n) / 2, (w + e) / 2
        for a, b, c, d in ((s, w, ms, me), (s, me, ms, e), (ms, w, n, me), (ms, me, n, e)):
            collect(a, b, c, d, depth + 1, out, stats)
        return
    for r in rows:
        sid = r.get("icaoId")
        if not sid or r.get("lat") is None:
            continue
        out[sid] = r


def clean(r):
    """METAR 응답에서 우리가 쓰는 것만. 원값을 바꾸지 않는다."""
    # visib 은 '6+' 처럼 문자열로 오기도 한다 (실측). 숫자로 억지 변환하지 않는다.
    vis = r.get("visib")
    obs = r.get("obsTime")
    clouds = r.get("clouds") or []
    return {
        "id": r.get("icaoId"),
        "name": r.get("name"),
        "lat": round(r["lat"], 4), "lon": round(r["lon"], 4),
        "elev_m": r.get("elev"),
        "temp_c": r.get("temp"), "dewp_c": r.get("dewp"),
        "wdir": r.get("wdir"), "wspd_kt": r.get("wspd"), "wgst_kt": r.get("wgst"),
        "visib": vis,
        "pres_hpa": r.get("altim"),
        # 구름 층 — 고도(ft)와 양(FEW/SCT/BKN/OVC)
        "clouds": [{"c": c.get("cover"), "b": c.get("base")} for c in clouds[:4]],
        "cat": r.get("fltCat"),
        # ⚠️ 원문 METAR 을 그대로 남긴다. 우리가 해석을 틀려도 원문에서 다시 읽을 수 있어야 한다.
        "raw": r.get("rawOb"),
        "obs": (datetime.fromtimestamp(obs, timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z")
                if obs else None),
    }


def handler(event, context):
    out, stats = {}, {"req": 0, "split": 0}
    # 30°×30° 로 시작한다. 빽빽한 곳(미국·유럽)만 저절로 쪼개진다.
    for lat in range(-90, 90, 30):
        for lon in range(-180, 180, 30):
            collect(lat, lon, lat + 30, lon + 30, 0, out, stats)

    rows = [clean(r) for r in out.values()]
    rows = [r for r in rows if r["id"] and r["lat"] is not None]
    rows.sort(key=lambda r: r["id"])

    if len(rows) < 800:
        # ⚠️ 평소 수천 곳이다. 갑자기 확 줄면 상류가 이상한 것이므로
        #    옛 파일을 덮어쓰지 않는다. 나쁜 자료로 좋은 자료를 지우면 안 된다.
        raise RuntimeError(f"관측소가 너무 적다 ({len(rows)}) — 덮어쓰지 않는다")

    withtemp = sum(1 for r in rows if r["temp_c"] is not None)
    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "NOAA Aviation Weather Center (METAR)",
        "note": {
            "ko": "공항에 실제로 설치된 관측 장비의 실황입니다. 예보가 아닙니다. "
                  "지점마다 갱신 주기가 다릅니다(보통 30~60분).",
            "en": "Live readings from instruments physically installed at airports — "
                  "not a forecast. Update interval varies by station (typically 30–60 min).",
        },
        "count": len(rows),
        "withTemp": withtemp,
        "stations": rows,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key="wind/stations.json", Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=900")
    print(f"[out] 관측소 {len(rows)}곳 (기온 있음 {withtemp}) "
          f"요청 {stats['req']}회 분할 {stats['split']}회 {len(body)/1024:.0f}KB")
    return {"ok": True, "stations": len(rows), "requests": stats["req"],
            "splits": stats["split"], "bytes": len(body)}
