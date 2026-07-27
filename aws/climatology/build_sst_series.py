#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""일별 해수면온도 시계열 1982~현재 — "스파게티" 그래프용

무엇을 만드나
  Copernicus 가 내는 것과 같은 그림의 자료다:
  해마다 한 줄씩, 1월 1일부터 12월 31일까지의 일별 전지구 평균 수온.
  올해 선이 예년 다발보다 위에 있으면 그게 곧 답이다.

왜 우리가 직접 만드나
  남의 그림을 가져다 쓰면 우리 자료와 눈금이 안 맞고, 우리가 검증할 수도 없다.
  같은 OISST 원본에서 우리 손으로 계산하면 앱의 다른 값과 이어진다.

⚠️ 면적 가중을 반드시 한다.
   위도가 높을수록 격자칸이 좁다. 그냥 평균 내면 극지가 과대평가된다.
   cos(위도)로 가중한다 — 이걸 빼면 전지구 평균이 실제보다 낮게 나온다.

⚠️ 10° 격자로 충분하다.
   전지구·대역 평균을 내는 데 0.25° 원본은 필요 없다. 10° 면 자료량이 1/1600 이고
   면적가중 평균은 사실상 같다. (앱의 지도는 5° 격자를 따로 쓴다.)

⚠️ 1981년은 9월부터라 뺀다. 반년치 곡선을 다른 해와 나란히 그리면 오해를 부른다.

출력
  s3://<CACHE_BUCKET>/ocean/series/sst-daily.json
  { region: { "global": { "1982": [365개], ... } }, ... }
"""

import json
import math
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone

import boto3

BUCKET = os.environ.get("CACHE_BUCKET", "earthus-cache-kr")
REGION = os.environ.get("CACHE_REGION", "us-east-2")
UA = {"User-Agent": "earthus-series/0.1 (+globe app)"}

BASE = ("https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/"
        "sst.day.mean.{y}.nc.ascii?sst")

# OISST 격자에서 10° 간격으로 뽑는다 (stride 40 = 10°)
LAT_I0, LAT_I1, LAT_ST = 40, 680, 40       # -79.875 … 79.875, 17개
LON_I0, LON_I1, LON_ST = 0, 1400, 40       # 0.125 … 350.125, 36개
LATS = [-89.875 + i * 0.25 for i in range(LAT_I0, LAT_I1 + 1, LAT_ST)]

CHUNK = 90
YEAR0 = 1982

# 대역 — Copernicus 가 쓰는 60°S~60°N 을 포함한다
REGIONS = {
    "global":  lambda la: True,
    "60S60N":  lambda la: -60 <= la <= 60,
    "nh":      lambda la: la > 0,
    "sh":      lambda la: la < 0,
    "tropics": lambda la: -20 <= la <= 20,
}

s3 = boto3.client("s3", region_name=REGION)


def fetch(year, t0, t1, tries=4):
    u = (f"{BASE.format(y=year)}[{t0}:1:{t1}]"
         f"[{LAT_I0}:{LAT_ST}:{LAT_I1}][{LON_I0}:{LON_ST}:{LON_I1}]")
    wait = 6
    for a in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=240) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:                               # noqa: BLE001
            if a == tries - 1:
                print(f"    실패 {year} {t0}-{t1}: {e!r}"[:110])
                return ""
            time.sleep(wait)
            wait *= 2
    return ""


def file_days(url_dds, fallback):
    """그 해 파일에 실제로 며칠이 들어 있나.

    ⚠️ "오늘이 연중 몇 일째인가"로 요청하면 안 된다. 상류 파일은 며칠 늦다.
       실측: 2026 파일은 206일(7월 25일)까지인데 208일을 달라 했더니 HTTP 400 이 났고,
       그 구간이 통째로 비었다. 파일의 .dds 를 먼저 읽어 길이를 확인한다.
    """
    try:
        with urllib.request.urlopen(urllib.request.Request(url_dds, headers=UA), timeout=60) as r:
            t = r.read().decode("utf-8", "replace")
        m = re.search(r"\[time = (\d+)\]", t)
        if m:
            return int(m.group(1))
    except Exception as e:                                   # noqa: BLE001
        print(f"    길이 확인 실패 — {fallback}일로 가정 ({e!r})"[:100])
    return fallback

def means(txt, ndays):
    """각 날짜의 대역별 면적가중 평균. 값이 없는 날은 None."""
    # day → lat_index → [값들]
    rows = {}
    for line in txt.split("\n"):
        m = re.match(r"^\[(\d+)\]\[(\d+)\],\s*(.+)$", line.strip())
        if not m:
            continue
        d, la = int(m.group(1)), int(m.group(2))
        if d >= ndays or la >= len(LATS):
            continue
        vals = []
        for tok in m.group(3).split(","):
            try:
                v = float(tok.strip())
            except ValueError:
                continue
            # 육지·결측은 _FillValue(-9.96921E36)로 온다
            if abs(v) <= 100:
                vals.append(v)
        rows.setdefault(d, {})[la] = vals

    out = {k: [] for k in REGIONS}
    for d in range(ndays):
        per_lat = rows.get(d, {})
        for name, keep in REGIONS.items():
            num = den = 0.0
            for la, vals in per_lat.items():
                lat = LATS[la]
                if not keep(lat) or not vals:
                    continue
                # ⚠️ 면적 가중. 이걸 빼면 극지가 과대평가돼 평균이 낮아진다.
                w = math.cos(math.radians(lat))
                num += sum(vals) * w
                den += len(vals) * w
            out[name].append(round(num / den, 3) if den else None)
    return out


def main():
    y0 = int(sys.argv[1]) if len(sys.argv) > 1 else YEAR0
    now = datetime.now(timezone.utc)
    y1 = now.year

    # 이어서 돌릴 수 있게 기존 파일을 읽는다
    try:
        obj = s3.get_object(Bucket=BUCKET, Key="ocean/series/sst-daily.json")
        doc = json.loads(obj["Body"].read().decode())
        series = doc.get("series", {})
    except Exception:                                        # noqa: BLE001
        series = {k: {} for k in REGIONS}

    for name in REGIONS:
        series.setdefault(name, {})

    for year in range(y0, y1 + 1):
        if str(year) in series["global"] and year < y1:
            print(f"▸ {year} 이미 있음 — 건너뜀")
            continue
        ndays = 366 if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) else 365
        if year == y1:
            # ⚠️ 오늘 날짜가 아니라 **파일에 있는 날 수**를 쓴다 (위 file_days 참고)
            ndays = file_days(BASE.format(y=year).replace(".ascii?sst", ".dds"),
                              now.timetuple().tm_yday)
        print(f"▸ {year} ({ndays}일)")
        acc = {k: [] for k in REGIONS}
        ok = True
        # 올해는 청크를 작게 — 마지막 구간에서 타임아웃이 났다 (실측)
        chunk = 45 if year == y1 else CHUNK
        for t0 in range(0, ndays, chunk):
            t1 = min(t0 + chunk - 1, ndays - 1)
            txt = fetch(year, t0, t1)
            if not txt:
                # ⚠️ 올해는 원래 반쪽이다. 못 받은 구간만 비우고 나머지는 살린다.
                #    지난 해는 다르다 — 중간이 끊긴 곡선은 "그해가 이상했다"로 읽힌다.
                if year == y1:
                    for k in REGIONS:
                        acc[k].extend([None] * (t1 - t0 + 1))
                    print(f"    {t0+1}~{t1+1}일 못 받음 — 그 구간만 비운다")
                    continue
                ok = False
                break
            part = means(txt, t1 - t0 + 1)
            for k in REGIONS:
                acc[k].extend(part[k])
            time.sleep(0.5)
        if not ok:
            print(f"    {year} 건너뜀 (자료 못 받음) — 반쪽 곡선을 넣지 않는다")
            continue
        for k in REGIONS:
            series[k][str(year)] = acc[k]
        g = [v for v in acc["global"] if v is not None]
        print(f"    전지구 평균 {sum(g)/len(g):.3f}°C  ({len(g)}일)")

        # 해마다 저장 — 중간에 끊겨도 지금까지가 남는다
        body = json.dumps({
            "generated": now.strftime("%Y-%m-%dT%H:%M:00Z"),
            "source": "NOAA OISST v2.1 daily",
            "doi": "10.25921/RE9P-PT57",
            "grid": "10° 면적가중(cos 위도) 평균",
            "regions": {
                "global": "전지구", "60S60N": "60°S–60°N", "nh": "북반구",
                "sh": "남반구", "tropics": "열대 20°S–20°N",
            },
            "note": {
                "ko": "일별 해수면온도 평균입니다. 면적 가중(cos 위도)을 적용했습니다 — "
                      "안 하면 극지가 과대평가되어 평균이 낮게 나옵니다. "
                      "1981년은 9월부터라 넣지 않았습니다.",
                "en": "Daily mean sea surface temperature, area-weighted by cos(latitude); "
                      "without that weighting the poles are over-counted and the mean comes out low. "
                      "1981 is excluded because the record starts in September.",
            },
            "series": series,
        }, separators=(",", ":")).encode()
        s3.put_object(Bucket=BUCKET, Key="ocean/series/sst-daily.json", Body=body,
                      ContentType="application/json; charset=utf-8",
                      CacheControl="public, max-age=3600")
        print(f"    저장 {len(body)/1024:.0f}KB · 연도 {len(series['global'])}개")

    print("✅ 완료")
    return 0


if __name__ == "__main__":
    sys.exit(main())
