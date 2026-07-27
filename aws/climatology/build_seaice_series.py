#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""해빙 면적 일별 시계열 1978~오늘 — 북극·남극

왜 이 그래프인가
  기후 자료 중 사람이 가장 즉각적으로 알아보는 그림이다.
  기온은 0.7°C 가 크다는 걸 설명해야 하지만, 해빙은 "예년 다발보다 아래"가
  그대로 보인다. 설명이 필요 없다.

자료
  NSIDC Sea Ice Index v4.0 — 위성 관측 일별 해빙 면적(extent).
  1978-10-26 부터. 실측: 2026-07-24 까지 들어와 있다 (지연 2~3일).
  ⚠️ CORS 가 없어 브라우저가 직접 못 받는다 → 서버가 받아 우리 S3 에 둔다.
  ⚠️ v3.0 은 404 다. 목록을 읽어 v4.0 을 확인하고 썼다.

⚠️ '면적(extent)'과 '넓이(area)'는 다르다.
   extent = 해빙 농도 15% 이상인 격자칸의 **넓이 합** (칸 안이 다 얼지 않아도 전부 센다)
   area   = 실제로 얼음이 덮은 넓이
   NSIDC 가 기본으로 내는 것은 extent 이고, 언론이 쓰는 것도 이쪽이다.
   섞어 쓰면 값이 20~30% 차이 난다. 화면에 '면적(extent)'이라고 밝힌다.

⚠️ 1978~1987 은 격일 관측이다.
   초기 위성이 이틀에 한 번 훑었다. 빈 날을 앞뒤로 채우지 않는다 —
   메우면 "그때는 자료가 촘촘했다"고 잘못 말하게 된다. 없는 날은 없는 채로 둔다.

출력
  s3://<CACHE_BUCKET>/ocean/series/seaice-daily.json
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
UA = {"User-Agent": "earthus-seaice/0.1 (+globe app)"}

SRC = ("https://noaadata.apps.nsidc.org/NOAA/G02135/{dir}/daily/data/"
       "{L}_seaice_extent_daily_v4.0.csv")
POLES = [("north", "N", "arctic", "북극"), ("south", "S", "antarctic", "남극")]

s3 = boto3.client("s3", region_name=REGION)


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
        return r.read().decode("utf-8", "replace")


def parse(raw):
    """연도 → [366칸] 배열. 값이 없는 날은 None 그대로 둔다."""
    rd = csv.reader(_io.StringIO(raw))
    rows = list(rd)
    # 0행 헤더, 1행 단위. 2행부터 자료.
    out = {}
    last = None
    for r in rows[2:]:
        if len(r) < 4:
            continue
        try:
            y, m, d = int(r[0]), int(r[1]), int(r[2])
            v = float(r[3])
        except ValueError:
            continue
        if v <= 0:
            continue                       # 결측을 0 으로 넣지 않는다
        leap = y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)
        nd = 366 if leap else 365
        arr = out.setdefault(str(y), [None] * nd)
        doy = (datetime(y, m, d) - datetime(y, 1, 1)).days
        if 0 <= doy < nd:
            arr[doy] = round(v, 3)
        last = f"{y:04d}-{m:02d}-{d:02d}"
    return out, last


def main():
    now = datetime.now(timezone.utc)
    series, meta = {}, {}
    for d, L, key, ko in POLES:
        raw = fetch(SRC.format(dir=d, L=L))
        s, last = parse(raw)
        # ⚠️ 첫 해(1978)는 10월부터라 반쪽이다. 다른 해와 나란히 그리면
        #    "그해 겨울이 없었다"로 보인다. 뺀다.
        s.pop("1978", None)
        series[key] = s
        n = sum(1 for arr in s.values() for v in arr if v is not None)
        meta[key] = {"ko": ko, "years": len(s), "days": n, "last": last}
        print(f"  ✓ {ko}: {len(s)}년 {n:,}일 · 마지막 {last}")

    doc = {
        "generated": now.strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "NSIDC Sea Ice Index v4.0",
        "sourceUrl": "https://nsidc.org/data/g02135",
        "unit": "10^6 km²",
        "measure": {
            "ko": "면적(extent) — 해빙 농도 15% 이상인 격자칸의 넓이 합입니다. "
                  "칸 안이 다 얼지 않아도 전부 셉니다. 실제 얼음이 덮은 넓이(area)와는 "
                  "20~30% 차이가 나므로 섞어 쓰면 안 됩니다.",
            "en": "Extent — the total area of grid cells with at least 15% ice concentration, "
                  "counted whole even if partly open. This differs from ice *area* by 20–30%; "
                  "the two must not be mixed.",
        },
        "note": {
            "ko": "⚠️ 1978~1987년은 위성이 이틀에 한 번 훑어서 빈 날이 많습니다. "
                  "그 빈 날을 앞뒤 값으로 메우지 않았습니다 — 메우면 그때도 자료가 "
                  "촘촘했던 것처럼 보이기 때문입니다. "
                  "⚠️ 1978년은 10월부터라 넣지 않았습니다.",
            "en": "⚠️ From 1978 to 1987 the satellite sampled every other day, leaving gaps. "
                  "They are not filled in: filling them would imply the record was denser than "
                  "it was. ⚠️ 1978 is excluded because it starts in October.",
        },
        "poles": meta,
        "series": series,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key="ocean/series/seaice-daily.json", Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=21600")
    print(f"✅ 저장 {len(body)/1024:.0f}KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
