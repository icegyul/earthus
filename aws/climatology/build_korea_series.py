#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""한국 일별 기온 1973~오늘 — 기상청 관측을 그대로

왜 따로 만드나 (받은 요청)
  "한국은 국내 자료를 수집 가능한곳을 찾아서 그래프 그려줘"

  전지구 격자(CPC 0.5°)로 한국을 자르면 칸이 몇 개 안 되고, 그 칸은 바다와 산을
  뭉뚱그린 값이다. 한국처럼 작은 나라는 **실제 관측소**를 쓰는 게 맞다.

자료를 어디서 받나
  기상청 API(data.go.kr)는 인증키가 필요하다 — 키 없이는 401 이다 (실측).
  그런데 **기상청이 GHCN-Daily 에 자료를 제공**하고 있고, 그쪽은 키가 필요 없다.
  즉 같은 관측값을 공개 경로로 받을 수 있다.
    관측소 목록  ghcnd-stations.txt  (KS = 대한민국, 56곳)
    자료         .../access/{ID}.csv (관측소별 전체 기간)
  ⚠️ 값은 0.1°C 단위 정수다. 그대로 쓰면 10배가 된다.

⚠️ 관측소 구성을 해마다 바꾸면 안 된다.
   관측소가 늘고 줄면 "전국 평균"이 그때마다 튄다. 기온이 변한 게 아니라
   더한 관측소가 바뀐 것인데 그래프에는 기온 변화처럼 보인다.
   그래서 **1973~오늘 내내 자료가 있는 10곳으로 고정**한다 (실측으로 고른 것):
     목포·울릉도·인천·부산(AST)·춘천·강릉·포항·부산·여수·제주
   ⚠️ 서울은 빠져 있다. 서울 관측소(KSM00047108)가 2025-08 에서 끊겼다.
      가장 큰 도시라 넣고 싶지만, 중간에 끊긴 관측소를 넣으면 그해부터 평균이
      튄다. 자료가 다시 이어지면 그때 넣는다.

⚠️ 이건 "전국 평균 기온"이 아니라 "이 10개 관측소의 평균"이다.
   기상청이 내는 전국 평균과는 관측소 구성이 달라 값이 조금 다르다.
   화면에도 그렇게 적는다.

출력
  s3://<CACHE_BUCKET>/wind/series/korea-daily.json
"""

import csv
import io as _io
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

import boto3

BUCKET = os.environ.get("CACHE_BUCKET", "earthus-cache-kr")
REGION = os.environ.get("CACHE_REGION", "us-east-2")
UA = {"User-Agent": "earthus-korea/0.1 (+globe app)"}
CSV = "https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/{sid}.csv"

# 1973~오늘 내내 TMAX·TMIN 이 있는 관측소만 (실측으로 확인)
STATIONS = [
    ("KS000047165", "목포"),
    ("KS000047115", "울릉도"),
    ("KS000047112", "인천"),
    ("KSW00043213", "부산(AST)"),
    ("KSM00047101", "춘천"),
    ("KSM00047105", "강릉"),
    ("KSM00047138", "포항"),
    ("KSM00047159", "부산"),
    ("KSM00047168", "여수"),
    ("KSM00047184", "제주"),
]
YEAR0 = 1973

s3 = boto3.client("s3", region_name=REGION)


def fetch(sid):
    u = CSV.format(sid=sid)
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=300) as r:
        return r.read().decode("utf-8", "replace")


def day_mean(row):
    """관측소의 그날 평균. TAVG 가 있으면 그걸, 없으면 (최고+최저)/2.

    ⚠️ 값은 0.1°C 단위다. 10 으로 나눠야 한다.
    ⚠️ TAVG 와 (최고+최저)/2 를 섞어 쓰면 관측소마다 기준이 달라진다.
       그래서 **모든 관측소에 같은 규칙**을 적용한다: 최고·최저가 둘 다 있으면
       그걸 쓰고, 없을 때만 TAVG 로 메운다.
    """
    def num(k):
        v = (row.get(k) or "").strip()
        try:
            return int(v) / 10.0
        except ValueError:
            return None
    mx, mn = num("TMAX"), num("TMIN")
    if mx is not None and mn is not None:
        return (mx + mn) / 2.0
    return num("TAVG")


def main():
    now = datetime.now(timezone.utc)
    # 연도 → 일자 → [관측소 값들]
    acc = {}
    used = []
    for sid, name in STATIONS:
        try:
            raw = fetch(sid)
        except Exception as e:                               # noqa: BLE001
            print(f"  ✗ {name} ({sid}) 실패 {e!r}"[:110])
            continue
        n = 0
        for row in csv.DictReader(_io.StringIO(raw)):
            d = (row.get("DATE") or "")
            if len(d) != 10 or d[:4] < str(YEAR0):
                continue
            v = day_mean(row)
            if v is None:
                continue
            y, m, dd = int(d[:4]), int(d[5:7]), int(d[8:10])
            doy = (datetime(y, m, dd) - datetime(y, 1, 1)).days
            acc.setdefault(y, {}).setdefault(doy, []).append(v)
            n += 1
        used.append({"id": sid, "name": name, "days": n})
        print(f"  ✓ {name:10} {n:,}일")

    if len(used) < len(STATIONS) - 2:
        raise RuntimeError(f"관측소를 너무 많이 못 받았다 ({len(used)}/{len(STATIONS)})")

    need = len(used)
    series = {}
    for y in sorted(acc):
        leap = y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)
        nd = 366 if leap else 365
        row = []
        for doy in range(nd):
            vs = acc[y].get(doy) or []
            # ⚠️ 관측소 몇 곳이 빠진 날은 값을 넣지 않는다.
            #    빠진 채로 평균 내면 그날만 남쪽(또는 북쪽) 관측소로 치우쳐
            #    기온이 실제로 오르내린 것처럼 보인다. 두 곳까지만 봐준다.
            row.append(round(sum(vs) / len(vs), 2) if len(vs) >= need - 2 else None)
        series[str(y)] = row

    doc = {
        "generated": now.strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "기상청 관측 (NOAA GHCN-Daily 경유)",
        "sourceEn": "Korea Meteorological Administration observations via NOAA GHCN-Daily",
        "unit": "degC",
        "stations": used,
        "method": {
            "ko": "관측소별 일평균 = (일최고 + 일최저) / 2, 그 뒤 관측소 평균. "
                  "관측소 구성을 1973년부터 고정했습니다 — 관측소가 늘고 줄면 "
                  "기온이 변한 게 아닌데도 평균이 튀기 때문입니다.",
            "en": "Per-station daily mean = (max + min) / 2, then averaged across stations. "
                  "The station set is fixed from 1973 onward: if stations came and went, the "
                  "average would jump for reasons that have nothing to do with temperature.",
        },
        "note": {
            "ko": "⚠️ 기상청이 발표하는 '전국 평균 기온'과는 관측소 구성이 달라 값이 조금 "
                  "다릅니다. 이건 여기 적힌 관측소들의 평균입니다.",
            "en": "⚠️ This differs slightly from the KMA's official national mean because the "
                  "station set is different. It is the mean of the stations listed here.",
        },
        "series": series,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key="wind/series/korea-daily.json", Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=3600")
    ys = sorted(series)
    print(f"✅ {ys[0]}~{ys[-1]} ({len(ys)}년) · 관측소 {len(used)}곳 · {len(body)/1024:.0f}KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
