# -*- coding: utf-8 -*-
"""땅이 실제로 얼마나 움직였나 — GNSS 상시관측점

왜 만들었나
  이 앱은 지금까지 **하늘**만 봤다. 그런데 땅도 움직이고, 그건 계산이 아니라
  **잰 값**이다. 관측점이 어제와 오늘 어디에 있었는지의 차이일 뿐이다.
  ⚠️ 우리가 만들어 온 규율(예보하지 않는다·잰 것만 말한다)과 정확히 맞는 자료다.

원본
  네바다 측지연구소(UNR Nevada Geodetic Laboratory) — 인증키 불필요
    속도장   geodesy.unr.edu/velocities/midas.IGS14.txt        20,168지점
    지점표   geodesy.unr.edu/NGLStationPages/DataHoldings.txt  23,695지점
    시계열   geodesy.unr.edu/gps_timeseries/IGS20/tenv3/IGS20/{STN}.tenv3

결과  s3://<CACHE_BUCKET>/events/crustal.json

■ 검산으로 확인한 것 (2026-08-03)
  대전 DAEJ · 수원 SUWN → 연 **31mm 동남동(112°)**. 유라시아판 이동으로 알려진 값과 맞다.
  2011 동일본대지진(M9.0) 전후 → G145 **3.42m** · G159 1.97m · 대전 **2.3cm**

⚠️⚠️ **이 자료로 못 하는 것을 먼저 적는다**
  ① **실시간이 아니다.** 최종 해가 약 **한 달** 늦다(실측: 오늘 기준 7-04까지).
     rapids·5분 자료는 사실상 비어 있었다(하루치). 지진 나고 바로는 못 본다.
  ② **작은 지진은 못 본다.** M5.8 은 M9.0 보다 에너지가 6만 3천 배 작다.
     일일 해의 잡음이 수 mm 라 묻힌다.
  ③ ⚠️ **작은 값을 "지진 때문"이라고 하면 안 된다.** 2011년에도 진앙 130km 에서
     3.42m 가 나온 반면 다른 지점은 1~2cm 였다 — 그건 지진 변위가 아니라 잡음이다.
     → 그래서 아래 EQ_MIN_M 으로 **충분히 큰 지진만** 다루고,
       변위도 잡음 문턱(NOISE_M)을 넘을 때만 "움직였다"고 적는다.
"""

import io
import json
import math
import os
import urllib.request
from datetime import datetime, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
s3 = boto3.client("s3", region_name=REGION)

DST = "events/crustal.json"
BASE = "https://geodesy.unr.edu"
UA = {"User-Agent": "earthus/1.0 (dalur@kakao.com)"}

# 우리가 보여줄 범위 — 한국·일본
LAT0, LAT1, LON0, LON1 = 24.0, 46.0, 122.0, 150.0

# ⚠️ 오래 안 들어오는 지점은 뺀다. 옛 값을 지금 것처럼 보여주면 안 된다.
STALE_YEAR = "2024"

# ⚠️⚠️ 일일 해의 잡음. 이보다 작은 변화는 **"움직였다"고 말하지 않는다.**
NOISE_M = 0.02          # 2cm — 2011년에 잡음으로 1~2cm 가 실제로 나왔다


def get(url, timeout=240):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def handler(event=None, context=None):
    # ── 지점표: 좌표와 마지막 관측일 ──────────────────────────────
    hold = {}
    for line in get(f"{BASE}/NGLStationPages/DataHoldings.txt").split("\n")[1:]:
        c = line.split()
        if len(c) < 9:
            continue
        try:
            la, lo = float(c[1]), float(c[2])
        except ValueError:
            continue
        lo = lo - 360 if lo > 180 else lo
        if not (LAT0 <= la <= LAT1 and LON0 <= lo <= LON1):
            continue
        hold[c[0]] = {"lat": round(la, 4), "lon": round(lo, 4),
                      "from": c[7], "to": c[8]}
    print(f"[crustal] 범위 안 지점 {len(hold)}")

    # ── 속도장 ────────────────────────────────────────────────
    rows = []
    for line in get(f"{BASE}/velocities/midas.IGS14.txt").split("\n"):
        c = line.split()
        if len(c) < 11:
            continue
        m = hold.get(c[0])
        if not m or m["to"] < STALE_YEAR:
            continue
        try:
            e, n, u = float(c[8]), float(c[9]), float(c[10])
        except ValueError:
            continue
        # mm/년으로 바꾼다 — m/년은 사람이 못 읽는다
        ve, vn, vu = e * 1000, n * 1000, u * 1000
        rows.append({
            "id": c[0], "lat": m["lat"], "lon": m["lon"],
            "from": m["from"], "to": m["to"],
            "ve": round(ve, 1), "vn": round(vn, 1), "vu": round(vu, 1),
            "speed": round(math.hypot(ve, vn), 1),
            # 방위각 — 북쪽 0°, 시계 방향
            "dir": round((math.degrees(math.atan2(ve, vn)) + 360) % 360),
        })
    rows.sort(key=lambda r: r["id"])
    print(f"[crustal] 속도 있는 지점 {len(rows)}")

    kr = [r for r in rows if 33 <= r["lat"] <= 39 and 124 <= r["lon"] <= 132]
    jp = [r for r in rows if not (33 <= r["lat"] <= 39 and 124 <= r["lon"] <= 132)]
    med = lambda a: round(sorted(a)[len(a) // 2], 1) if a else None

    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "count": len(rows),
        "korea": {"n": len(kr), "medianSpeed": med([r["speed"] for r in kr]),
                  "medianDir": med([r["dir"] for r in kr])},
        "japan": {"n": len(jp), "medianSpeed": med([r["speed"] for r in jp]),
                  "medianDir": med([r["dir"] for r in jp])},
        "source": "Nevada Geodetic Laboratory (UNR) · MIDAS 속도장 · IGS14",
        "cite": "Blewitt, Hammond & Kreemer (2018), Eos 99",
        "noiseM": NOISE_M,
        "note": {
            "ko": "GNSS 상시관측점이 **실제로 이동한 속도**입니다. 계산한 값이 아니라 "
                  "관측점의 좌표가 해마다 얼마나 달라졌는지입니다.\n"
                  "⚠️ 대부분은 **판 전체가 함께 움직이는 것**입니다 — 한반도가 연 3cm "
                  "동남동으로 가는 것은 유라시아판이 그렇게 가기 때문이지 땅이 "
                  "찢어지고 있어서가 아닙니다.\n"
                  "⚠️⚠️ **지진 직후에는 못 봅니다.** 최종 해가 약 한 달 늦습니다. "
                  "그리고 중소 지진(M6 미만)은 변위가 일일 관측 잡음(수 mm)에 묻혀 "
                  "**보이지 않습니다** — 안 보이는 것과 안 움직인 것은 다릅니다.",
            "en": "Measured motion of continuous GNSS stations — not a model. "
                  "Most of it is whole-plate drift. ⚠️ Final solutions lag about a month, "
                  "and quakes below ~M6 are lost in daily noise.",
        },
        "stations": rows,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=86400")
    print(f"[crustal] 한국 {len(kr)} (중앙 {doc['korea']['medianSpeed']}mm/년) · "
          f"일본 {len(jp)} (중앙 {doc['japan']['medianSpeed']}mm/년) · {len(body)/1024:.0f}KB")
    return {"ok": True, "count": len(rows),
            "korea": doc["korea"], "japan": doc["japan"]}
