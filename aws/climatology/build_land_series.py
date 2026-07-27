#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""대륙별 일별 육상 기온 1979~오늘 — 대륙 그래프용

왜 CPC 인가 (다른 후보를 재보고 고른 것)
  NCEP/NCAR 재분석 1  1948년부터인데 **2026-03-17 에서 멈춰 있다** (실측).
                      "오늘까지"를 못 준다.
  ERA5               페타바이트급 zarr. 브라우저·Lambda 에서 일별 집계가 어렵다.
  CPC Global Daily   1979년부터, **어제까지** (실측: 2026-07-25). 0.5°.
                     그리고 결정적으로 **육지만** 담고 있다.

⚠️ "육지만"이 왜 결정적인가
   대륙 평균을 상자(bounding box)로 내면 바다가 섞인다. 아시아 상자에는 태평양이,
   유럽 상자에는 대서양이 들어온다. 그래서 지금 앱의 「지역별 기온」은
   "대륙 평균"이라 부르지 못하고 "지역 평균"이라고 적어 두었다.
   CPC 는 바다가 결측이라 상자를 씌워도 육지만 남는다 — 진짜 대륙 평균이 된다.

⚠️ 일평균을 (최고+최저)/2 로 만든다.
   CPC 가 주는 것이 최고·최저뿐이라 그렇다. 시간별 평균과는 조금 다르다.
   기상학에서 널리 쓰는 근사지만, 우리가 그렇게 만들었다는 사실을 파일에 적어 둔다.

⚠️ 면적 가중(cos 위도)을 한다. 안 하면 고위도가 과대평가된다.

출력
  s3://<CACHE_BUCKET>/wind/series/temp-daily.json
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

BASE = "https://psl.noaa.gov/thredds/dodsC/Datasets/cpc_global_temp/{v}.{y}.nc.ascii?{v}"

# CPC 격자: lon = 0.25 + j*0.5 (720)
#
# ⚠️ 위도는 **북에서 남으로 내려간다**: lat[0] = +89.75, lat[359] = -89.75.
#    올라간다고 가정했다가 남북이 뒤집혔다 (실측: 유럽·북극이 통째로 비고
#    북아메리카가 6월 말에 3.2°C 로 나왔다 — 사실은 남반구 바다를 보고 있었다).
#    NOAA 자료라도 축 방향은 데이터셋마다 다르다. 반드시 lat 좌표를 직접 확인할 것.
LAT_I0, LAT_I1, LAT_ST = 0, 352, 8
LON_I0, LON_I1, LON_ST = 0, 712, 8
LATS = [89.75 - i * 0.5 for i in range(LAT_I0, LAT_I1 + 1, LAT_ST)]
LONS = [0.25 + j * 0.5 for j in range(LON_I0, LON_I1 + 1, LON_ST)]

CHUNK = 90
YEAR0 = 1979

# 대륙 — [남, 서, 북, 동]. CPC 는 바다가 결측이라 상자만으로 육지가 걸러진다.
REGIONS = {
    "land":      None,                       # 전 육지
    "asia":      (5, 60, 75, 150),
    "europe":    (35, -10, 71, 40),
    "africa":    (-35, -18, 37, 52),
    "namerica":  (15, -168, 72, -52),
    "samerica":  (-56, -82, 13, -34),
    "oceania":   (-48, 110, -10, 180),
    "arctic":    (66, -180, 90, 180),
    "kr":        None,        # 원해상도로 따로 받는다 (아래 COUNTRIES)
}

# 나라 단위 — 4° 격자로는 한국이 두세 칸밖에 안 잡힌다.
# 그래서 나라는 **원해상도(0.5°)** 로 작은 상자만 따로 받는다. 요청이 작아 부담이 없다.
# ⚠️ 그래도 "그 나라 평균 기온"이라기보다 "그 상자 안 육지 평균"이다.
#    국경이 아니라 사각형이므로, 화면에도 그렇게 적는다.
COUNTRIES = {
    # 이름: (남, 서, 북, 동)
    "kr": (33.0, 125.5, 38.7, 129.6),
}

s3 = boto3.client("s3", region_name=REGION)


def idx_lat(lat):
    """CPC 위도 → 인덱스. ⚠️ 북에서 남으로 내려간다."""
    return max(0, min(359, int(round((89.75 - lat) / 0.5))))


def idx_lon(lon):
    return max(0, min(719, int(round(((lon % 360) - 0.25) / 0.5))))


def fetch_box(var, year, t0, t1, box, tries=3):
    """작은 상자만 원해상도로."""
    s_, w_, n_, e_ = box
    i0, i1 = idx_lat(n_), idx_lat(s_)          # 북이 작은 인덱스
    j0, j1 = idx_lon(w_), idx_lon(e_)
    u = (BASE.format(v=var, y=year)
         + f"[{t0}:1:{t1}][{i0}:1:{i1}][{j0}:1:{j1}]")
    for a in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=180) as r:
                return r.read().decode("utf-8", "replace"), (i0, j0)
        except Exception as e:                               # noqa: BLE001
            if a == tries - 1:
                print(f"    상자 실패 {var} {year}: {e!r}"[:100])
                return "", (i0, j0)
            time.sleep(4 * (a + 1))
    return "", (i0, j0)


def box_means(txt_x, txt_n, ndays, i0):
    """상자 안 면적가중 일평균. 결측(바다)은 뺀다."""
    def rows(txt):
        out = {}
        for line in txt.split("\n"):
            m = re.match(r"^\[(\d+)\]\[(\d+)\],\s*(.+)$", line.strip())
            if not m:
                continue
            d, la = int(m.group(1)), int(m.group(2))
            vals = []
            for tok in m.group(3).split(","):
                try:
                    v = float(tok.strip())
                except ValueError:
                    continue
                vals.append(None if abs(v) > 200 else v)
            out.setdefault(d, {})[la] = vals
        return out
    A, B = rows(txt_x), rows(txt_n)
    res = []
    for d in range(ndays):
        a, b = A.get(d, {}), B.get(d, {})
        num = den = 0.0
        for la in a:
            if la not in b:
                continue
            lat = 89.75 - (i0 + la) * 0.5
            w = math.cos(math.radians(lat))
            for k, vx in enumerate(a[la]):
                vn = b[la][k] if k < len(b[la]) else None
                if vx is None or vn is None:
                    continue
                num += ((vx + vn) / 2.0) * w
                den += w
        res.append(round(num / den, 3) if den else None)
    return res


def in_box(lat, lon, box):
    if box is None:
        return True
    s, w, n, e = box
    if lat < s or lat > n:
        return False
    lon = ((lon + 180) % 360) - 180
    return (w <= lon <= e) if w <= e else (lon >= w or lon <= e)


def fetch(var, year, t0, t1, tries=4):
    u = (BASE.format(v=var, y=year)
         + f"[{t0}:1:{t1}][{LAT_I0}:{LAT_ST}:{LAT_I1}][{LON_I0}:{LON_ST}:{LON_I1}]")
    wait = 6
    for a in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=300) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:                               # noqa: BLE001
            if a == tries - 1:
                print(f"    실패 {var} {year} {t0}-{t1}: {e!r}"[:110])
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

def cube(txt, ndays):
    """[day][lat_i] → 경도별 값 목록. 결측(바다)은 빼고 담는다."""
    out = {}
    for line in txt.split("\n"):
        m = re.match(r"^\[(\d+)\]\[(\d+)\],\s*(.+)$", line.strip())
        if not m:
            continue
        d, la = int(m.group(1)), int(m.group(2))
        if d >= ndays or la >= len(LATS):
            continue
        vals = []
        for k, tok in enumerate(m.group(3).split(",")):
            try:
                v = float(tok.strip())
            except ValueError:
                continue
            # ⚠️ 바다는 결측(-9.96921E36)이다. 0 으로 채우면 대양이 0°C 육지가 된다.
            if abs(v) > 200:
                continue
            if k < len(LONS):
                vals.append((LONS[k], v))
        out.setdefault(d, {})[la] = vals
    return out


def means(cmax, cmin, ndays):
    """대륙별 면적가중 일평균. 일평균 = (최고+최저)/2."""
    res = {k: [] for k in REGIONS}
    for d in range(ndays):
        a, b = cmax.get(d, {}), cmin.get(d, {})
        for name, box in REGIONS.items():
            num = den = 0.0
            for la in a:
                if la not in b:
                    continue
                lat = LATS[la]
                w = math.cos(math.radians(lat))
                bm = dict(b[la])
                for lon, vx in a[la]:
                    vn = bm.get(lon)
                    if vn is None or not in_box(lat, lon, box):
                        continue
                    num += ((vx + vn) / 2.0) * w
                    den += w
            res[name].append(round(num / den, 3) if den else None)
    return res


def main():
    y0 = int(sys.argv[1]) if len(sys.argv) > 1 else YEAR0
    now = datetime.now(timezone.utc)
    y1 = now.year

    try:
        obj = s3.get_object(Bucket=BUCKET, Key="wind/series/temp-daily.json")
        series = json.loads(obj["Body"].read().decode()).get("series", {})
    except Exception:                                        # noqa: BLE001
        series = {}
    for k in REGIONS:
        series.setdefault(k, {})

    for year in range(y0, y1 + 1):
        # ⚠️ kr 기준으로 본다. land 만 보면 한국을 넣기 전에 받은 해가 영영 안 채워진다.
        if str(year) in series.get("kr", {}) and year < y1:
            print(f"▸ {year} 이미 있음")
            continue
        leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
        ndays = 366 if leap else 365
        if year == y1:
            # ⚠️ 오늘 날짜가 아니라 **파일에 있는 날 수**를 쓴다 (위 file_days 참고)
            ndays = file_days(BASE.format(v="tmax", y=year).replace(".ascii?tmax", ".dds"),
                              now.timetuple().tm_yday)
        print(f"▸ {year}")
        acc = {k: [] for k in REGIONS}
        ok = True
        for t0 in range(0, ndays, CHUNK):
            t1 = min(t0 + CHUNK - 1, ndays - 1)
            tx = fetch("tmax", year, t0, t1)
            tn = fetch("tmin", year, t0, t1) if tx else ""
            if not tx or not tn:
                # ⚠️ 올해는 원래 반쪽이다. 못 받은 구간만 비우고 나머지는 살린다.
                #    지난 해는 다르다 — 중간이 끊긴 곡선은 "그해가 이상했다"로 읽힌다.
                if year == y1:
                    n0 = t1 - t0 + 1
                    for k in REGIONS:
                        acc[k].extend([None] * n0)
                    print(f"    {t0+1}~{t1+1}일 못 받음 — 그 구간만 비운다")
                    continue
                ok = False
                break
            n = t1 - t0 + 1
            part = means(cube(tx, n), cube(tn, n), n)
            for k in REGIONS:
                if k in COUNTRIES:
                    continue
                acc[k].extend(part[k])
            # 나라는 원해상도로 따로
            for cid, box in COUNTRIES.items():
                bx, (i0, _) = fetch_box("tmax", year, t0, t1, box)
                bn, _ = fetch_box("tmin", year, t0, t1, box)
                acc[cid].extend(box_means(bx, bn, n, i0) if bx and bn else [None] * n)
            time.sleep(0.4)
        if not ok:
            # ⚠️ 반쪽 곡선을 넣지 않는다. 끊긴 선은 "그 해가 이상했다"로 읽힌다.
            print(f"    {year} 건너뜀 — 반쪽 곡선을 넣지 않는다")
            continue
        for k in REGIONS:
            series[k][str(year)] = acc[k]
        g = [v for v in acc["land"] if v is not None]
        if g:
            print(f"    전 육지 평균 {sum(g)/len(g):.2f}°C ({len(g)}일)")

        body = json.dumps({
            "generated": now.strftime("%Y-%m-%dT%H:%M:00Z"),
            "source": "NOAA CPC Global Daily Temperature",
            "unit": "degC",
            "grid": "4° 면적가중(cos 위도) 평균 · 육지만",
            "method": {
                "ko": "일평균 = (일최고 + 일최저) / 2. CPC 가 최고·최저만 주기 때문입니다. "
                      "시간별 평균과는 조금 다릅니다.",
                "en": "Daily mean = (daily max + daily min) / 2, because CPC provides only "
                      "max and min. This differs slightly from an hourly mean.",
            },
            "regions": {
                "land": "전 육지", "asia": "아시아", "europe": "유럽", "africa": "아프리카",
                "namerica": "북아메리카", "samerica": "남아메리카",
                "oceania": "오세아니아", "arctic": "북극권", "kr": "한국",
            },
            "note": {
                "ko": "CPC 는 육지만 담고 있어 바다가 섞이지 않습니다 — 그래서 이건 "
                      "진짜 대륙 평균입니다. 남극은 관측이 거의 없어 넣지 않았습니다.",
                "en": "CPC covers land only, so no ocean is mixed in — these are true continental "
                      "means. Antarctica is omitted because it has almost no station coverage.",
            },
            "series": series,
        }, separators=(",", ":")).encode()
        s3.put_object(Bucket=BUCKET, Key="wind/series/temp-daily.json", Body=body,
                      ContentType="application/json; charset=utf-8",
                      CacheControl="public, max-age=3600")
        print(f"    저장 {len(body)/1024:.0f}KB · 연도 {len(series['land'])}개")

    print("✅ 완료")
    return 0


if __name__ == "__main__":
    sys.exit(main())
