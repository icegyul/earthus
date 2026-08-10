#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""내 위치 1년 기온 곡선용 관측소별 일자료를 만든다.

기상청이 NOAA GHCN-Daily에 제공한 한국 지상관측을 공개 CSV로 받는다.
브라우저가 관측소당 2~3MB CSV를 직접 받지 않도록 1995년 이후 일평균만 남긴다.

⚠️ 일평균은 모든 관측소에 같은 규칙을 쓴다: (일최고 + 일최저) / 2.
⚠️ 올해 자료가 하나도 없는 관측소는 색인에서 뺀다. 가까워도 끊긴 관측소를
   "지금 관측소"처럼 고르면 안 된다.
⚠️ ASOS 지점번호와 WMO 번호가 같아도 좌표가 25km 넘게 다르면 뺀다.
"""

import csv
import io
import json
import math
import os
import sys
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOY_INDEX = os.path.join(ROOT, "prototype/data/doy/index.json")
OUT = os.path.join(ROOT, "prototype/data/station-temp")
STATIONS_URL = "https://www.ncei.noaa.gov/pub/data/ghcn/daily/ghcnd-stations.txt"
CSV_URL = "https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/{sid}.csv"
UA = {"User-Agent": "earthus-station-temperature/0.1 (+https://earthus.net)"}
YEAR0 = 1995
MAX_MATCH_KM = 25


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
        return r.read().decode("utf-8", "replace")


def km(a1, o1, a2, o2):
    r = math.pi / 180
    h = math.sin((a2 - a1) * r / 2) ** 2 + math.cos(a1 * r) * math.cos(a2 * r) * math.sin((o2 - o1) * r / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def number(row, key):
    try:
        return int((row.get(key) or "").strip()) / 10
    except ValueError:
        return None


def day_mean(row):
    hi, lo = number(row, "TMAX"), number(row, "TMIN")
    return round((hi + lo) / 2, 1) if hi is not None and lo is not None else None


def main():
    os.makedirs(OUT, exist_ok=True)
    local = {str(s["s"]): s for s in json.load(open(DOY_INDEX, encoding="utf-8"))["stations"]}
    lines = fetch(STATIONS_URL).splitlines()
    matches = []
    for line in lines:
        if not line.startswith("KS"):
            continue
        sid = line[:11].strip()
        lat, lon = float(line[12:20]), float(line[21:30])
        name = line[41:71].strip()
        wmo = line[80:85].strip()
        codes = []
        if wmo.startswith("47"):
            codes.append(wmo[2:])
        if sid.startswith(("KSM00047", "KS000047")):
            codes.append(sid[-3:])
        code = next((c for c in codes if c in local), None)
        if not code:
            continue
        station = local[code]
        distance = km(lat, lon, station["la"], station["lo"])
        if distance > MAX_MATCH_KM:
            continue
        matches.append((sid, code, station, lat, lon, name))

    current_year = datetime.now(timezone.utc).year
    index = []
    for sid, code, station, lat, lon, ghcn_name in matches:
        print(f"  {station['n']} {sid}", flush=True)
        rows = csv.DictReader(io.StringIO(fetch(CSV_URL.format(sid=sid))))
        series, last = {}, None
        for row in rows:
            date = row.get("DATE", "")
            if len(date) != 10 or int(date[:4]) < YEAR0:
                continue
            value = day_mean(row)
            if value is None:
                continue
            year = int(date[:4])
            day = (datetime.strptime(date, "%Y-%m-%d") - datetime(year, 1, 1)).days
            days = 366 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 365
            arr = series.setdefault(str(year), [None] * days)
            arr[day] = value
            last = max(last or date, date)
        if str(current_year) not in series:
            continue
        doc = {
            "station": {"id": int(code), "name": station["n"], "lat": lat, "lon": lon,
                        "alt": station.get("a"), "ghcn": sid, "ghcnName": ghcn_name},
            "from": min(map(int, series)), "to": max(map(int, series)), "through": last,
            "unit": "degC", "series": series,
            "source": "기상청 관측 (NOAA GHCN-Daily 경유)",
            "method": "일평균 = (일최고 + 일최저) / 2. 최고·최저 중 하나라도 없으면 그날은 비웁니다.",
        }
        path = os.path.join(OUT, f"{code}.json")
        json.dump(doc, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        index.append({"id": int(code), "name": station["n"], "lat": lat, "lon": lon,
                      "alt": station.get("a"), "path": f"data/station-temp/{code}.json",
                      "through": last})

    index.sort(key=lambda item: item["id"])
    out = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "count": len(index), "yearFrom": YEAR0,
        "source": "기상청 관측 (NOAA GHCN-Daily 경유)", "stations": index,
    }
    json.dump(out, open(os.path.join(OUT, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"완료: {len(index)}개 관측소")


if __name__ == "__main__":
    sys.exit(main())
