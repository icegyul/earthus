#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""해수면온도 평년 기준선 (OISST 1991–2020) → 우리 5° 격자

왜 필요한가
  "이상하다"를 말하려면 "정상은 이렇다"가 있어야 한다.
  겨울인데 수온이 안 내려갔다 · 지금 바다가 평년보다 뜨겁다 —
  이런 문장은 평년값 없이는 한 글자도 쓸 수 없다.

⚠️ 예전에 이걸 한 번 틀렸다.
   열돔을 만들 때 1995–2024 **전체 날짜**를 평균 내서 16.4°C 라는 값을 얻었다.
   그건 연평균이지 "이맘때의 정상"이 아니다. 7월 값을 연평균과 비교하면
   전 세계 바다가 죄다 "이상 고온"이 된다.
   → 반드시 **같은 달력 날짜**의 평년값과 비교해야 한다.
   OISST 는 날짜별 평년값(366일)을 제공하므로 그걸 그대로 쓴다.

⚠️ 1.4GB 를 통째로 받지 않는다.
   OPeNDAP 이 부분 조회를 지원한다(실측 확인). 우리 격자에 필요한
   위경도만 stride 로 뽑으면 하루치가 몇 KB 다.

⚠️ 날짜별로 파일을 나눈다.
   366일 × 2,376점을 한 파일에 담으면 약 4MB 다. 앱은 오늘 하루치만 있으면 되는데
   4MB 를 받게 하면 안 된다. 하루치 12KB 짜리 366개로 나눈다.

출력
  s3://<CACHE_BUCKET>/ocean/clim/sst-{DDD}.json     DDD = 001..366 (연중 일자)
  s3://<CACHE_BUCKET>/ocean/clim/index.json         무엇이 있는지 + 출처·인용

출처: NOAA OISST v2.1 daily climatology 1991–2020
      https://doi.org/10.25921/RE9P-PT57
"""

import json
import os
import re
import sys
import time
import urllib.request

import boto3

BUCKET = os.environ.get("CACHE_BUCKET", "earthus-cache-kr")
REGION = os.environ.get("CACHE_REGION", "us-east-2")
UA = {"User-Agent": "earthus-climatology/0.1 (+globe app)"}

DODS = ("https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/"
        "sst.day.mean.ltm.1991-2020.nc.ascii")

# 우리 격자 (wind-grid 와 같아야 한다 — 안 맞으면 비교가 성립하지 않는다)
RES, LAT0, LON0, NX, NY = 5.0, -80.0, -180.0, 72, 33

# OISST 격자: lat = -89.875 + i*0.25 (720개), lon = 0.125 + j*0.25 (1440개)
OI_LAT0, OI_LON0, OI_STEP = -89.875, 0.125, 0.25
OI_NLAT, OI_NLON = 720, 1440

# ⚠️ 이 평년자료는 **365일**이다 (366 이 아니다 — 실측: dds 에 time = 365).
#    366 으로 요청했다가 마지막 구간에서 HTTP 400 이 났다.
#    윤년의 12월 31일(연중 366일째)은 365일째 값을 쓴다. 하루 차이는 평년값에서
#    무시할 수 있고, 없는 자료를 만들어 채우는 것보다 낫다.
DAYS = 365
CHUNK = 20                 # 한 번에 받을 날짜 수. 크게 하면 서버가 끊는다.

s3 = boto3.client("s3", region_name=REGION)


def oi_index(lat, lon):
    """우리 격자점에 가장 가까운 OISST 칸의 인덱스."""
    i = round((lat - OI_LAT0) / OI_STEP)
    lon360 = lon % 360.0
    j = round((lon360 - OI_LON0) / OI_STEP) % OI_NLON
    return max(0, min(OI_NLAT - 1, i)), j


# 우리 격자점마다 필요한 OISST 인덱스를 미리 구해 둔다
LAT_IDX = sorted({oi_index(LAT0 + iy * RES, 0)[0] for iy in range(NY)})
LON_IDX = sorted({oi_index(0, LON0 + ix * RES)[1] for ix in range(NX)})


def fetch(t0, t1):
    """[t0, t1] 날짜 구간을 우리 위경도만 뽑아 받는다."""
    li, lj = LAT_IDX, LON_IDX
    # OPeNDAP 은 [start:stride:stop] 만 되고 임의 목록은 안 된다.
    # 우리 인덱스는 등간격(20)이라 stride 로 표현된다.
    lat_sel = f"[{li[0]}:{li[1]-li[0]}:{li[-1]}]"
    lon_sel = f"[{lj[0]}:{lj[1]-lj[0]}:{lj[-1]}]"
    url = f"{DODS}?sst[{t0}:1:{t1}]{lat_sel}{lon_sel}"
    for a in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:                               # noqa: BLE001
            if a == 3:
                raise
            print(f"    재시도 {a+1}: {e!r}"[:110])
            time.sleep(5 * (a + 1))
    return ""


def parse(txt, ndays):
    """OPeNDAP ascii → [day][lat][lon] 실수 배열.

    ⚠️ 실제 형식은 '[d][la], v, v, v, …' 다 (변수명 접두어가 없다 — 실측으로 확인).
       헤더와 MAPS 부분을 건너뛰고 데이터 줄만 읽는다.
       육지는 _FillValue(-9.96921E36)로 온다 — None 으로 둔다.
    """
    out = [[[None] * len(LON_IDX) for _ in LAT_IDX] for _ in range(ndays)]
    for line in txt.split("\n"):
        m = re.match(r"^\[(\d+)\]\[(\d+)\],\s*(.+)$", line.strip())
        if not m:
            continue
        d, la = int(m.group(1)), int(m.group(2))
        if d >= ndays or la >= len(LAT_IDX):
            continue
        vals = []
        for tok in m.group(3).split(","):
            tok = tok.strip()
            try:
                v = float(tok)
            except ValueError:
                vals.append(None)
                continue
            # ⚠️ 육지는 결측이다. 0 으로 채우면 대륙이 "수온 0°C 바다"가 된다.
            vals.append(None if (v is None or abs(v) > 100) else round(v, 2))
        for k, v in enumerate(vals[:len(LON_IDX)]):
            out[d][la][k] = v
    return out


def to_our_grid(day_rows):
    """OISST 부분격자 → 우리 격자 순서(iy*nx+ix)로 편다."""
    lat_pos = {v: k for k, v in enumerate(LAT_IDX)}
    lon_pos = {v: k for k, v in enumerate(LON_IDX)}
    flat = [None] * (NX * NY)
    for iy in range(NY):
        i, _ = oi_index(LAT0 + iy * RES, 0)
        ri = lat_pos.get(min(LAT_IDX, key=lambda x: abs(x - i)))
        for ix in range(NX):
            _, j = oi_index(0, LON0 + ix * RES)
            rj = lon_pos.get(min(LON_IDX, key=lambda x: abs(x - j)))
            if ri is None or rj is None:
                continue
            flat[iy * NX + ix] = day_rows[ri][rj]
    return flat


def main():
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    written = 0
    for t0 in range(start, DAYS, CHUNK):
        t1 = min(t0 + CHUNK - 1, DAYS - 1)
        print(f"▸ {t0+1}~{t1+1}일차")
        txt = fetch(t0, t1)
        cube = parse(txt, t1 - t0 + 1)
        for k in range(t1 - t0 + 1):
            doy = t0 + k + 1
            flat = to_our_grid(cube[k])
            got = sum(1 for v in flat if v is not None)
            if got < 800:
                print(f"    ⚠️ {doy}일차 바다칸이 {got}개뿐 — 건너뜀")
                continue
            body = json.dumps({
                "doy": doy,
                "res": RES, "lat0": LAT0, "lon0": LON0, "nx": NX, "ny": NY,
                "period": "1991-2020",
                "source": "NOAA OISST v2.1 daily climatology",
                "doi": "10.25921/RE9P-PT57",
                "unit": "degC",
                "sea": got,
                "sst": flat,
            }, separators=(",", ":")).encode()
            s3.put_object(Bucket=BUCKET, Key=f"ocean/clim/sst-{doy:03d}.json",
                          Body=body, ContentType="application/json",
                          CacheControl="public, max-age=604800")
            written += 1
        print(f"    누적 {written}일 저장")
        time.sleep(1.0)

    idx = json.dumps({
        "kind": "sst-climatology",
        "period": "1991-2020",
        "days": DAYS,
        "leapNote": {
            "ko": "이 자료는 365일치입니다. 윤년의 366일째는 365일째 값을 쓰세요.",
            "en": "This climatology has 365 days. For day 366 of a leap year, use day 365.",
        },
        "res": RES, "lat0": LAT0, "lon0": LON0, "nx": NX, "ny": NY,
        "source": "NOAA OISST v2.1 daily climatology 1991-2020",
        "doi": "10.25921/RE9P-PT57",
        "keyPattern": "ocean/clim/sst-{DDD}.json",
        "note": {
            "ko": "연중 일자(1~365)별 평년 해수면온도입니다. 반드시 같은 달력 날짜끼리 "
                  "비교해야 합니다 — 연평균과 비교하면 여름 바다가 전부 이상 고온이 됩니다.",
            "en": "Climatological SST by day of year (1–365). Always compare like calendar day "
                  "with like — comparing against an annual mean makes every summer ocean look anomalous.",
        },
    }, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key="ocean/clim/index.json", Body=idx,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=86400")
    print(f"✅ {written}일 저장 완료")
    return 0


if __name__ == "__main__":
    sys.exit(main())
