# -*- coding: utf-8 -*-
"""NOAA NOMADS GFS 부분 영역 → 정확한 격자점 값. 지점 API(Open-Meteo)를 대신하는 작은 도구.

왜 생겼나 (2026-09-24, docs/OPEN-METEO-REPLACEMENT-MAP-2026-09-24.md)
  pressure-grid · fx-grid 가 동아시아 1° 격자 1,581점을 Open-Meteo 지점 API 로 100점씩 16번 받았다.
  Open-Meteo 무료 API 는 비상업 전용이다(약관: "apps that have subscriptions"). 2027-01-01 유료 개시 전에
  대량 격자부터 공공 원천으로 옮긴다. NOAA GFS 는 미국 정부 자료라 상업 이용이 된다.

무엇을 하나
  ① 최근 GFS 회차 후보를 만든다 ② NOMADS GRIB 필터 주소를 만든다(변수·레벨·부분 영역)
  ③ GRIB2 를 해독해 필요한 메시지만 고른다 ④ 원격자의 **정확한 점**만 뽑는다 — 보간하지 않는다.

무엇을 안 하나
  - GRIB 해독기는 여기 없다. `aws/gfs-cloud-forecast/grib2lite.py`(순수 파이썬, eccodes 와 오차 0 검증)를
    부르는 쪽이 넘겨준다. 여기서 경로로 읽으면 패키저(`lambda_package.cross_function_files`)가 그 관용구를
    `_shared` 모듈 안에서는 찾지 않는다 — 핸들러가 읽어서 넘기는 편이 zip 에 확실히 들어간다.
  - 없는 점을 채우지 않는다. 원격자에 그 점이 없으면 None 이다.
"""
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

BASE = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_%s.pl"
UA = "earthus/2.0 (+https://earthus.net)"
RUN_HOURS = (0, 6, 12, 18)

# 레벨 타입(코드표 4.5) — gfs-cloud-forecast/handler.py 와 같은 값이다(실자료 2026091918 f009 로 확인된 것).
LT_SURFACE, LT_ISOBARIC, LT_MSL, LT_ABOVE_GROUND = 1, 100, 101, 103

# NOMADS 필터 체크박스 이름(2026-09-20 필터 페이지에서 확인 — gfs-cloud-forecast/handler.py:69).
# ⚠️ lev_10_m_above_mean_sea_level 은 다른 레벨이다. 헷갈리지 말 것.
LEV_MSL = "lev_mean_sea_level"
LEV_10M = "lev_10_m_above_ground"
LEV_2M = "lev_2_m_above_ground"


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def candidate_runs(now=None, count=5):
    """가장 최근 회차부터 6시간씩 뒤로. 아직 안 올라온 회차는 부르는 쪽이 건너뛴다.

    ⚠️ 고정 지연을 두지 않는다(tpw-grid 와 같은 판단) — 이미 올라온 12z 를 06z 로 보여 주는 시간이 길어진다.
    """
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    hour = max(h for h in RUN_HOURS if h <= now.hour)
    top = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    return [top - timedelta(hours=6 * i) for i in range(count)]


def nearest_step(run, now=None, step_h=3):
    """지금에 가장 가까운 예보 시간(step_h 배수). 회차가 지금보다 미래면 None."""
    now = now or datetime.now(timezone.utc)
    lead = (now - run).total_seconds() / 3600.0
    if lead < -0.01:
        return None
    return int(round(lead / step_h)) * step_h


def filter_url(run, fh, *, res="0p50", variables=(), levels=(), bbox=None):
    """NOMADS GRIB 필터 주소. bbox = (south, west, north, east) — 경도는 0~360 이 아니라 그대로 준다."""
    # 0.5° 는 파일 이름이 pgrb2full 이다(1.0°/0.25° 는 pgrb2). 틀리면 NOMADS 가 500 을 준다(gfs-forecast-frames 메모).
    kind = "pgrb2full" if res == "0p50" else "pgrb2"
    q = [
        ("file", "gfs.t%sz.%s.%s.f%03d" % (run.strftime("%H"), kind, res, fh)),
        ("dir", "/gfs.%s/%s/atmos" % (run.strftime("%Y%m%d"), run.strftime("%H"))),
    ]
    q += [("var_%s" % v, "on") for v in variables]
    q += [(lev, "on") for lev in levels]
    if bbox:
        south, west, north, east = bbox
        q += [("subregion", ""), ("toplat", "%g" % north), ("leftlon", "%g" % west),
              ("rightlon", "%g" % east), ("bottomlat", "%g" % south)]
    return BASE % res + "?" + urllib.parse.urlencode(q)


def http_get(url, timeout=60, tries=3, pause=2.0, opener=None):
    """GRIB 을 받는다. GRIB 이 아니면(안내 HTML·빈 응답) 실패로 본다."""
    opener = opener or urllib.request.urlopen
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with opener(req, timeout=timeout) as r:
                raw = r.read()
            if raw[:4] != b"GRIB":
                raise ValueError("GRIB 아님 (%d bytes)" % len(raw))
            return raw
        except Exception as e:  # noqa: BLE001
            last = e
            if attempt < tries - 1:
                time.sleep(pause * (attempt + 1))
    raise last


def level_value(d):
    """첫 고정면의 값(척도 적용). 10 m above ground = 10, 2 m = 2, 500 mb = 50000(Pa)."""
    lv, sc = d.get("levelValue"), d.get("levelScale") or 0
    if lv is None:
        return None
    return lv if sc == 0 else lv / (10.0 ** sc)


def standard_key(d):
    """describe 결과 → 이 도구가 아는 필드 이름. 모르면 None(= 해독하지 않는다).

    ⚠️ 레벨 타입과 값을 **둘 다** 본다 — NOMADS 는 변수 × 레벨 교차곱을 주므로 10 m 를 켜면
       다른 레벨의 같은 변수가 딸려 올 수 있다(gfs-cloud-forecast wanted_key 가 한 번 밟은 함정).
    """
    if d.get("pdt") != 0:
        return None
    cat, num, lt = d["category"], d["number"], d["levelType"]
    if cat == 3 and num == 1 and lt == LT_MSL:
        return "prmsl"                                   # Pa
    if cat == 2 and num in (2, 3) and lt == LT_ABOVE_GROUND and level_value(d) == 10:
        return "u10" if num == 2 else "v10"              # m/s, 동·북 성분(지구 기준)
    if cat == 0 and num == 0 and lt == LT_ABOVE_GROUND and level_value(d) == 2:
        return "t2m"                                     # K
    return None


def valid_time(d):
    """GRIB 기준시각 + 예보시간. 모르면 None — 시각을 지어내지 않는다."""
    y, mo, dd, hh, mi, ss = d["refTime"]
    fh = d.get("forecastHours")
    if fh is None:
        return None
    return datetime(y, mo, dd, hh, mi, ss, tzinfo=timezone.utc) + timedelta(hours=fh)


def ref_time(d):
    y, mo, dd, hh, mi, ss = d["refTime"]
    return datetime(y, mo, dd, hh, mi, ss, tzinfo=timezone.utc)


def read_fields(raw, g2, key=standard_key):
    """GRIB 버퍼 → {이름: {"desc", "grid", "values"}}. describe 먼저, 필요한 것만 해독한다."""
    out = {}
    for secs in g2.messages(raw):
        d = g2.describe(secs)
        name = key(d)
        if name is None or name in out:
            continue
        d2, grid, values = g2.decode(secs)
        out[name] = {"desc": d2, "grid": grid, "values": values}
    return out


def point_table(field, native_res):
    """원격자 값 → {(위도 눈금, 경도 눈금): 값}. 눈금 = round(도 / native_res).

    ⚠️ 행 순서를 가정하지 않는다. grib2lite 는 북→남·서→동으로 주지만, 격자 정의(scan)를 읽어
       점마다 좌표를 계산한다 — 순서를 가정하면 뒤집힌 지도가 조용히 나온다.
    """
    g = field["grid"]
    vals = field["values"]
    ni, nj = g["ni"], g["nj"]
    dj = g["dj"] if g.get("jPositive") else -g["dj"]
    di = -g["di"] if g.get("iNegative") else g["di"]
    factor = round(1 / native_res)
    table = {}
    for j in range(nj):
        lat = g["lat1"] + j * dj
        base = j * ni
        for i in range(ni):
            lon = (g["lon1"] + i * di) % 360.0
            table[(round(lat * factor), round(lon * factor) % round(360 * factor))] = vals[base + i]
    return table


def sample(field, points, native_res):
    """points = [(lat, lon), …] — 원격자의 **정확한 점**만. 없으면 None. 보간하지 않는다."""
    table = point_table(field, native_res)
    factor = round(1 / native_res)
    full = round(360 * factor)
    out = []
    for lat, lon in points:
        v = table.get((round(lat * factor), round((lon % 360.0) * factor) % full))
        out.append(v)
    return out


def regular_points(south, north, west, east, res):
    """lat 오름차순 바깥 · lon 오름차순 안쪽 — pressure-grid/fx-grid JSON 의 배열 순서 그대로."""
    lats = [south + i * res for i in range(int(round((north - south) / res)) + 1)]
    lons = [west + i * res for i in range(int(round((east - west) / res)) + 1)]
    return lats, lons, [(a, o) for a in lats for o in lons]
