"""태풍 유사 사례 — "과거의 비슷한 태풍들은 이후 어디로 갔나"

받은 요청
  "태풍 이동경로를 과거 유사 태풍 사례를 가지고 현 상태를 분석해서
   최종 진행 방향까지 나오게"

⚠️⚠️ 표현 규율을 코드가 지킨다 (2026-08-02 확정)
  우리는 **예보를 만들지 않는다.** 진로를 단정하면 그건 자체 예보고,
  기상업무법상 예보업무 허가 문제이며 무엇보다 우리 규율 위반이다.
  대신 **세어서 말한다**:
      "유사 태풍 12개 중 8개가 북동 전향 (67%)"
  건수가 앞에 오고 퍼센트는 괄호 안이다. 퍼센트만 쓰면 모델 예측처럼 읽힌다.
  ⚠️ 표본이 5개 미만이면 **퍼센트를 아예 빼고** 건수만 쓴다.
     3/4 를 75% 로 쓰는 순간 정밀한 척하는 거짓이 된다.
  ⚠️ 화면에는 항상 기상청·JMA 공식 예보를 나란히 둔다(프론트 담당).

무엇을 하나
  ① IBTrACS 서태평양 과거 태풍(1980~)을 받아 압축 보관 — 한 달에 한 번이면 충분
  ② 지금 살아 있는 태풍마다:
       현재 위치·진행방향·강도와 비슷한 **과거 시점**을 찾고,
       그 태풍들이 그 뒤 72시간에 어디로 갔는지 세어 분포를 만든다

출력
  s3://<CACHE_BUCKET>/ocean/ibtracs-wp.json      과거 태풍 트랙 (재사용)
  s3://<CACHE_BUCKET>/ocean/cyclone-analog.json  현재 태풍별 유사 사례 분석
"""

import gzip
import io
import json
import math
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")

IBTRACS = ("https://www.ncei.noaa.gov/data/"
           "international-best-track-archive-for-climate-stewardship-ibtracs/"
           "v04r01/access/csv/ibtracs.WP.list.v04r01.csv")
SRC_TRACKS = "events/cyclone-tracks.json"     # archiver 가 만드는 현재 태풍 경로
DST_HIST = "ocean/ibtracs-wp.json"
DST_ANALOG = "ocean/cyclone-analog.json"
SESSION_KEY = "archive/cyclone-sessions.json"   # 비공개: 당시 계산 회차 원문
REPORT_KEY = "ocean/cyclone-reports.json"       # 공개 목록: 상태·검증 수치
OFFICIAL_KEY = "events/typhoon-official.json"
ECMWF_KEY = "events/typhoon-ecmwf.json"
# 이미 수집 중인 **실측**만 쓴다. 이 파일들은 각각의 수집기가 실패할 때 옛 파일을
# 지키므로, 이 분석은 원본 갱신시각·관측시각까지 함께 싣는다.
OBS_SOURCES = (
    ("gts", "wind/gts-global.json", "stations"),
    # CWA 원문을 대만 전용 형식으로 바로 섞지 않는다. 수집기가 단위·시각·좌표를
    # 정규화한 뒤 남긴 실측만 쓴다. 없거나 수집에 실패하면 missing으로 드러난다.
    ("cwa", "wind/cwa-observations.json", "stations"),
    # 관측소가 빈 바다는 ASCAT 격자로 메운다. 셀은 관측소가 아니므로 화면에서도
    # 반드시 "위성 해상풍 셀"로 부르고 자체 진로를 만드는 입력으로 쓰지 않는다.
    ("ascat", "wind/ascat-observations.json", "cells"),
    ("metar", "wind/stations.json", "stations"),
    ("buoy", "ocean/buoys.json", "buoys"),
)
OBS_RADIUS_KM = 800
OBS_FRESH_MINUTES = 180
# NOAA가 이 제품을 NRT 24시간 이내 지연 범주로 명시하므로 위성만 24시간 창을 쓴다.
# 지상·부이 3시간과 섞어 "방금"이라고 부르지 않고 화면에 자료원별 기준을 공개한다.
ASCAT_FRESH_MINUTES = 1440
UA = {"User-Agent": "earthus/0.1 (+earthus.net)"}

# 과거 자료를 얼마나 자주 다시 받나. 태풍 시즌이 끝나야 갱신되므로 한 달이면 넉넉하다.
HIST_MAX_AGE_DAYS = 30
# ⚠️ 점의 구조를 바꾸면 이 값을 올린다. 안 올리면 보관본이 30일간 그대로 쓰여서
#    "코드는 고쳤는데 결과가 안 바뀐다"가 된다(실측으로 겪을 뻔했다).
HIST_SCHEMA = 2            # 2: 점에 성질(NATURE) 추가
# 위성 시대 이후만 쓴다. 그 전은 관측 방식이 달라 강도가 비교되지 않는다.
SEASON_FROM = 1980

# ── 유사 판정 기준 ────────────────────────────────────────────────
#  ⚠️ 2026-08-02 전면 개정. 이전에는 내가 임의로 정한 딱딱한 임계값
#     (반경 300km · 방향 ±50° · 강도 ±25kt)을 썼는데, 논문을 찾아보니
#     확립된 방식이 있었고 우리 방식에 결함이 셋 있었다.
#     상세: docs/methodology-sources.md "확인 완료 ⑤"
#
#  ① 계절을 안 봤다 — 8월 태풍에 2월 사례가 섞였다. 여름·가을은 지향류가 달라
#     같은 자리·같은 방향이어도 이후가 다르다. EPANALOG(미 해군 운영 시스템)는
#     날짜 차이를 명시적 보정 항목으로 둔다.
#  ② 딱딱한 임계값을 썼다 — 301km 는 버리고 299km 는 100% 채택했다.
#     표준(Delle Monache et al. 2013, MWR 141, 3498)은 **거리를 재서 가까운 순**으로 고른다.
#  ③ 한 시점만 비교했다 — 직전 1스텝으로 방향을 냈다. 시간창으로 비교해야 흐름이 맞는다.
#
#  표준 유사도 수식 (Delle Monache 2013):
#      ‖F_t , A_t'‖ = Σ_j (w_j / σ_fj) · sqrt( Σ_i ( F_{j,t+i} − A_{j,t'+i} )² )
#  핵심은 **각 항목을 그 항목의 표준편차 σ 로 나누는 것**이다.
#  단위가 다른 값(km · kt)을 그래야 더할 수 있다. 가중치는 원 논문처럼 1 을 기본으로 둔다.

SEASON_WINDOW_DAYS = 21    # 현재와 ±이 날짜 안에 있던 과거 사례만 (계절 정합)
WINDOW_PTS = 5             # 경로 비교에 쓰는 점 개수 (6시간 간격 → 최근 24시간)
STEP_H = 6                 # 과거 자료의 시간 간격
TOP_N = 30                 # 거리 순으로 이만큼만 채택 (임계값이 아니라 순위)
PREFILTER_KM = 900         # ⚠️ 선정 기준이 아니라 **계산량 상한**이다.
                           #    이보다 먼 것은 어차피 순위에 못 드니 미리 뺀다.
W_POS, W_SHAPE, W_WIND = 1.0, 1.0, 0.5   # 가중치 (풍속은 결측이 잦아 낮춘다)
LOOK_AHEAD_H = 72          # 그 뒤 몇 시간의 행방을 보나
MIN_SAMPLE_FOR_PCT = 5     # 표본이 이보다 적으면 퍼센트를 쓰지 않는다

DIRS = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"]
DIRS_EN = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]

s3 = boto3.client("s3", region_name=REGION)


def dist_km(a_lat, a_lon, b_lat, b_lon):
    r = math.pi / 180
    d_lat, d_lon = (b_lat - a_lat) * r, (b_lon - a_lon) * r
    h = (math.sin(d_lat / 2) ** 2
         + math.cos(a_lat * r) * math.cos(b_lat * r) * math.sin(d_lon / 2) ** 2)
    return 2 * 6371 * math.asin(math.sqrt(h))


def bearing(a_lat, a_lon, b_lat, b_lon):
    r = math.pi / 180
    y = math.sin((b_lon - a_lon) * r) * math.cos(b_lat * r)
    x = (math.cos(a_lat * r) * math.sin(b_lat * r)
         - math.sin(a_lat * r) * math.cos(b_lat * r) * math.cos((b_lon - a_lon) * r))
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def angle_diff(a, b):
    d = abs(a - b) % 360
    return d if d <= 180 else 360 - d


def dir_index(deg):
    return int((deg + 22.5) % 360 // 45)


def put(key, doc, maxage):
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=key, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl=f"public, max-age={maxage}")
    return len(body)


# ── 현재 관측 근거 ────────────────────────────────────────────────
def iso_time(value):
    """자료원별 관측 시각을 UTC datetime 으로 읽는다. 못 읽으면 None.

    ⚠️ 생성시각을 관측시각으로 대신하지 않는다. 부이는 파일이 갱신돼도 각 지점의
    송신 시각이 다르고, GTS 는 그 정시 전문 시각이 따로 있다.
    """
    if not value:
        return None
    text = str(value).strip()
    # CWA는 +08:00, 다른 자료원은 Z·숫자 UTC를 쓴다. Python 표준 파서로 먼저
    # 읽으면 공백 구분 ISO 시각도 빠뜨리지 않는다. 시간대가 빠진 CWA 시각은
    # 추측해 UTC로 바꾸지 않고 None으로 남긴다.
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is not None:
            return parsed.astimezone(timezone.utc)
    except ValueError:
        pass
    for form in ("%Y%m%d%H%M", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            parsed = datetime.strptime(text, form)
            return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
        except ValueError:
            pass
    return None


def observation_time(source, row):
    if source == "gts":
        return iso_time(row.get("tm"))
    if source == "cwa":
        return iso_time(row.get("observed"))
    if source == "ascat":
        return iso_time(row.get("observed"))
    if source == "metar":
        return iso_time(row.get("obs"))
    return iso_time(row.get("time"))


def observation_variables(source, row):
    """무엇을 실제로 잰 지 센다. 값이 없으면 0으로 만들지 않는다."""
    if source == "gts":
        return {"wind": row.get("ws") is not None,
                "pressure": row.get("pa") is not None or row.get("ps") is not None,
                "temperature": row.get("ta") is not None, "sst": False}
    if source == "metar":
        return {"wind": row.get("wspd_kt") is not None,
                "pressure": row.get("pres_hpa") is not None,
                "temperature": row.get("temp_c") is not None, "sst": False}
    if source == "cwa":
        return {"wind": row.get("wind_ms") is not None,
                "pressure": row.get("pres_hpa") is not None,
                "temperature": row.get("temp_c") is not None, "sst": False}
    if source == "ascat":
        return {"wind": row.get("wind_ms") is not None,
                "pressure": False, "temperature": False, "sst": False}
    return {"wind": row.get("wspd") is not None,
            "pressure": row.get("pres") is not None,
            "temperature": row.get("atmp") is not None,
            "sst": row.get("wtmp") is not None}


def load_observations():
    """세 자료원의 최신 관측 목록을 한 번만 읽는다.

    ⚠️ 하나라도 못 읽었다고 0곳으로 꾸미지 않는다. missing에 남겨 화면이
    '관측 공백'과 '자료원 장애'를 구분하게 한다.
    """
    rows, sources, missing = [], [], []
    for source, key, list_key in OBS_SOURCES:
        try:
            doc = json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())
            src_rows = doc.get(list_key) or []
            sources.append({
                "id": source, "path": key, "source": doc.get("source"),
                "generated": doc.get("generated"),
                "observedUtc": doc.get("observedUtc") or doc.get("observedTo"),
                "count": len(src_rows),
            })
            for row in src_rows:
                try:
                    lat, lon = float(row["lat"]), float(row["lon"])
                except (KeyError, TypeError, ValueError):
                    continue
                rows.append((source, lat, lon, row))
        except Exception as e:  # noqa: BLE001
            print(f"[obs] {source} 읽기 실패 {e!r}")
            missing.append(source)
    return {"rows": rows, "sources": sources, "missing": missing}


def observation_evidence(lat, lon, pool, now):
    """태풍 주변 표면 관측의 **분포와 신선도**를 세어 낸다.

    이 값은 진로·세기를 계산하거나 기관 예보의 가중치를 바꾸지 않는다. 지상/부이
    실측은 태풍 주변 상태를 확인하는 근거이며, 상층 지향류·위성·공식 예보와 같은
    물리량이 아니다. 아직 검증하지 않은 '관측소 점수'를 만들어 확신인 척하지 않는다.
    """
    sector_names = [("북", "N"), ("북동", "NE"), ("동", "E"), ("남동", "SE"),
                    ("남", "S"), ("남서", "SW"), ("서", "W"), ("북서", "NW")]
    sectors = [{"dir": ko, "dirEn": en, "n": 0, "freshN": 0,
                "sources": {"gts": 0, "cwa": 0, "ascat": 0, "metar": 0, "buoy": 0},
                "windN": 0, "pressureN": 0, "temperatureN": 0, "sstN": 0}
               for ko, en in sector_names]
    by_source = {k: {"n": 0, "freshN": 0, "windN": 0, "pressureN": 0,
                     "temperatureN": 0, "sstN": 0, "oldestMinutes": None,
                     "freshLimitMinutes": ASCAT_FRESH_MINUTES if k == "ascat" else OBS_FRESH_MINUTES,
                     "_windSpeeds": [], "_u": [], "_v": []}
                 for k, _, _ in OBS_SOURCES}
    # 받은 요청: 대만·필리핀·러시아 관측이 실제 계산 근거에 들어갔는지 국가별로
    # 숨기지 않는다. PH/RP와 RS/RU는 NOAA 지점표가 시기별로 다른 국가코드를 쓴다.
    regional = {"taiwan": {"n": 0, "freshN": 0, "windN": 0, "pressureN": 0, "temperatureN": 0, "sstN": 0},
                "philippines": {"n": 0, "freshN": 0, "windN": 0, "pressureN": 0, "temperatureN": 0, "sstN": 0},
                "russia": {"n": 0, "freshN": 0, "windN": 0, "pressureN": 0, "temperatureN": 0, "sstN": 0}}
    country_group = {"TW": "taiwan", "PH": "philippines", "RP": "philippines",
                     "RS": "russia", "RU": "russia"}

    for source, rlat, rlon, row in pool["rows"]:
        km = dist_km(lat, lon, rlat, rlon)
        if km > OBS_RADIUS_KM:
            continue
        sec = sectors[dir_index(bearing(lat, lon, rlat, rlon))]
        src = by_source[source]
        group = country_group.get(str(row.get("ctry") or row.get("country") or "").upper())
        country = regional.get(group) if group else None
        src["n"] += 1
        if country is not None:
            country["n"] += 1
        sec["n"] += 1
        sec["sources"][source] += 1
        observed = observation_time(source, row)
        age = ((now - observed).total_seconds() / 60) if observed else None
        # 미래 시각은 상류 시계 오차일 수 있으므로 신선하다고 처리하지 않는다.
        fresh_limit = ASCAT_FRESH_MINUTES if source == "ascat" else OBS_FRESH_MINUTES
        is_fresh = age is not None and 0 <= age <= fresh_limit
        if is_fresh:
            src["freshN"] += 1
            if country is not None:
                country["freshN"] += 1
            sec["freshN"] += 1
        if age is not None and age >= 0:
            src["oldestMinutes"] = max(src["oldestMinutes"] or 0, round(age))
        for variable, present in observation_variables(source, row).items():
            if present:
                src[f"{variable}N"] += 1
                sec[f"{variable}N"] += 1
                if country is not None:
                    country[f"{variable}N"] += 1
        if source == "ascat" and is_fresh and row.get("wind_ms") is not None:
            src["_windSpeeds"].append(float(row["wind_ms"]))
            if row.get("u_ms") is not None and row.get("v_ms") is not None:
                src["_u"].append(float(row["u_ms"]))
                src["_v"].append(float(row["v_ms"]))

    for source in by_source.values():
        speeds = source.pop("_windSpeeds")
        us, vs = source.pop("_u"), source.pop("_v")
        if speeds:
            source["meanWindMs"] = round(sum(speeds) / len(speeds), 2)
            source["maxWindMs"] = round(max(speeds), 2)
        if us and vs:
            mean_u, mean_v = sum(us) / len(us), sum(vs) / len(vs)
            source["vectorMeanWindMs"] = round(math.hypot(mean_u, mean_v), 2)
            source["vectorMeanDirectionFromDeg"] = round(
                (math.degrees(math.atan2(-mean_u, -mean_v)) + 360) % 360, 1)

    # 지점이 없다는 것은 '안전'이 아니라, 이 반경의 직접 표면 근거가 적다는 뜻이다.
    return {
        "radiusKm": OBS_RADIUS_KM, "freshWithinMinutes": OBS_FRESH_MINUTES,
        "freshnessBySource": {"surfaceMinutes": OBS_FRESH_MINUTES,
                              "ascatMinutes": ASCAT_FRESH_MINUTES},
        "at": now.strftime("%Y-%m-%dT%H:%M:00Z"),
        "n": sum(x["n"] for x in by_source.values()),
        "freshN": sum(x["freshN"] for x in by_source.values()),
        "bySource": [{"id": key, **value} for key, value in by_source.items()],
        # 0인 나라도 남긴다. "없음"과 "계산에서 빼먹음"을 구분하기 위해서다.
        "regionalEvidence": [{"id": key, **value} for key, value in regional.items()],
        "sectors": sectors,
        "sources": pool["sources"], "missing": pool["missing"],
        "note": {
            "ko": "태풍 중심 반경 800km 안의 지상·부이 실측과 ASCAT 위성 해상풍 셀을 방위별로 센 것입니다. "
                  "관측소가 적거나 자료원이 빠진 것은 안전하다는 뜻이 아니라 직접 표면 관측 근거가 제한적이라는 뜻입니다. "
                  "이 수는 자체 진로 예측이나 기관 예보 순위를 만들지 않습니다.",
            "en": "Surface and buoy observations plus ASCAT satellite wind cells within 800 km of the storm centre, counted by direction. "
                  "Sparse or missing observations mean limited direct surface evidence, not safety. This does not produce an Earthus track forecast or rank agencies.",
        },
    }


# ── ① 과거 태풍 트랙 ──────────────────────────────────────────────
def load_history():
    """보관본이 최신이면 그대로, 아니면 IBTrACS 에서 다시 만든다."""
    try:
        obj = s3.get_object(Bucket=BUCKET, Key=DST_HIST)
        doc = json.loads(obj["Body"].read())
        age = (datetime.now(timezone.utc)
               - datetime.strptime(doc["generated"], "%Y-%m-%dT%H:%M:00Z")
               .replace(tzinfo=timezone.utc)).days
        if (age < HIST_MAX_AGE_DAYS and doc.get("storms")
                and doc.get("schema") == HIST_SCHEMA):
            return doc, False
    except Exception:                                        # noqa: BLE001
        pass
    return build_history(), True


def build_history():
    """108MB CSV 를 **흘려 읽으며** 필요한 열만 남긴다.
    ⚠️ 통째로 메모리에 올리지 않는다. Lambda 가 죽는다."""
    req = urllib.request.Request(IBTRACS, headers=UA)
    storms, cur_sid, cur = {}, None, None
    col = {}
    with urllib.request.urlopen(req, timeout=600) as r:
        for i, raw in enumerate(io.TextIOWrapper(r, encoding="utf-8", errors="replace")):
            line = raw.rstrip("\n")
            if i == 0:
                for n, name in enumerate(line.split(",")):
                    col[name.strip()] = n
                continue
            if i == 1:
                continue                                     # 두 번째 줄은 단위 행
            f = line.split(",")
            if len(f) < 10:
                continue
            try:
                season = int(f[col["SEASON"]])
            except (ValueError, KeyError):
                continue
            if season < SEASON_FROM:
                continue
            iso = f[col["ISO_TIME"]].strip()
            # 6시간 간격(정시)만 — 그 사이 보간값은 유사 판정에 필요 없다
            if not iso.endswith((" 00:00:00", " 06:00:00", " 12:00:00", " 18:00:00")):
                continue
            try:
                lat = float(f[col["LAT"]]); lon = float(f[col["LON"]])
            except ValueError:
                continue
            try:
                wind = float(f[col["USA_WIND"]])
            except (ValueError, KeyError):
                wind = None
            sid = f[col["SID"]].strip()
            if sid != cur_sid:
                cur_sid = sid
                cur = storms.setdefault(sid, {
                    "sid": sid, "season": season,
                    "name": (f[col["NAME"]].strip() or "UNNAMED").title(),
                    "pts": [],
                })
            # 성질 — 열대(TS)인가 온대변질(ET)인가. 100% 채워져 있다(실측).
            nature = (f[col["NATURE"]].strip() if "NATURE" in col else "") or "NR"
            # [위도, 경도, 풍속kt, 시각, 성질] — 소수 1자리면 충분하다(약 10km)
            cur["pts"].append([round(lat, 1), round(lon, 1),
                               round(wind) if wind is not None else None,
                               iso[:13], nature])

    out = [s for s in storms.values() if len(s["pts"]) >= 8]
    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "IBTrACS v04r01 (NOAA NCEI) — 서태평양",
        "sourceEn": "IBTrACS v04r01 (NOAA NCEI) — Western Pacific",
        "license": "미국 정부 저작물 — 퍼블릭 도메인",
        "doi": "10.25921/82ty-9e16",
        "seasonFrom": SEASON_FROM,
        "schema": HIST_SCHEMA,
        "ptFields": ["lat", "lon", "windKt", "isoHour", "nature"],
        "note": {
            "ko": f"{SEASON_FROM}년 이후 서태평양 태풍의 6시간 간격 최적 경로입니다. "
                  "위성 시대 이전은 관측 방식이 달라 제외했습니다.",
            "en": f"Western Pacific best tracks since {SEASON_FROM}, 6-hourly.",
        },
        "count": len(out),
        "storms": out,
    }
    put(DST_HIST, doc, 86400)
    return doc


# ── ② 유사 사례 분석 ──────────────────────────────────────────────
def doy(iso):
    """'2019-09-05 12' → 연중 일수. 계절 비교에 쓴다."""
    try:
        d = datetime.strptime(iso[:10], "%Y-%m-%d")
        return d.timetuple().tm_yday
    except (ValueError, TypeError):
        return None


def doy_gap(a, b):
    """연중 일수 차이. ⚠️ 12월 말과 1월 초는 이웃이다 — 365 를 넘어 감는다."""
    if a is None or b is None:
        return 999
    d = abs(a - b) % 365
    return min(d, 365 - d)


def km_xy(lat0, lon0, lat, lon):
    """기준점에서의 동/북 방향 변위(km). 짧은 거리라 평면 근사로 충분하다."""
    return ((lon - lon0) * 111.32 * math.cos(math.radians((lat + lat0) / 2)),
            (lat - lat0) * 110.57)


def resample_current(track, from_iso, to_iso, n=WINDOW_PTS, step_h=STEP_H):
    """현재 경로를 과거 자료와 **같은 시간 간격**으로 다시 뽑는다.

    ⚠️ 왜 필요한가: 과거(IBTrACS)는 6시간 간격인데 현재 경로(GDACS)는 점 간격이
       일정하지 않다. 그대로 '마지막 4점'을 비교하면 서로 다른 시간 폭을 비교하게 된다.
    ⚠️ 한계: 점마다의 실제 시각이 자료에 없어 **from~to 사이 균등 간격으로 가정**한다.
       근사다. 시각이 자료에 들어오면 그걸 쓸 것.
    """
    if len(track) < 2:
        return None
    try:
        t0 = datetime.strptime(from_iso[:16], "%Y-%m-%dT%H:%M")
        t1 = datetime.strptime(to_iso[:16], "%Y-%m-%dT%H:%M")
        span_h = max(1e-6, (t1 - t0).total_seconds() / 3600)
    except (ValueError, TypeError):
        return None
    per = span_h / (len(track) - 1)          # 점 하나당 시간
    out = []
    for k in range(n):                        # 0h, -6h, -12h … 전
        want = span_h - k * step_h
        if want < 0:
            return None                       # 24시간치가 안 되면 비교하지 않는다
        f = want / per
        i0 = min(int(f), len(track) - 1)
        i1 = min(i0 + 1, len(track) - 1)
        r = f - i0
        lon = track[i0][0] + (track[i1][0] - track[i0][0]) * r
        lat = track[i0][1] + (track[i1][1] - track[i0][1]) * r
        out.append((lat, lon))
    return out                                # [최신, -6h, -12h, …]


def shape_vec(pts):
    """경로의 '모양' — 최신 점을 원점으로 둔 상대 변위들.
    ⚠️ 절대 위치를 빼기 때문에 **어디 있었나가 아니라 어떻게 움직였나**만 남는다.
       진행 방향과 속도가 함께 들어간다(예전엔 방향만 봤다)."""
    lat0, lon0 = pts[0]
    return [km_xy(lat0, lon0, la, lo) for (la, lo) in pts[1:]]


def analyse(storm, history):
    """현재 태풍 하나에 대해 과거 유사 사례를 거리 순으로 고르고 그 뒤 행방을 센다."""
    track = storm.get("track") or []
    if len(track) < 2:
        return None
    cur_lon, cur_lat = track[-1][0], track[-1][1]

    # 서태평양 밖이면 비교할 이력이 없다.
    # ⚠️ "유사 사례 0개"로 내보내면 "비슷한 게 하나도 없다"는 뜻으로 읽힌다.
    #    실제로는 **우리가 그 해역 자료를 안 가진 것**이다. 그 차이를 밝힌다.
    if not (100 <= cur_lon <= 180 and 0 <= cur_lat <= 60):
        return {"matches": 0, "bins": [], "sample": [],
                "outOfBasin": True,
                "basinNote": {
                    "ko": "서태평양 밖이라 비교할 과거 자료가 없습니다 "
                          "(우리가 받는 이력은 서태평양뿐입니다).",
                    "en": "Outside the Western Pacific; we only hold WP history."},
                "why": None}

    cur_pts = resample_current(track, storm.get("from"), storm.get("to"))
    if not cur_pts:
        return {"matches": 0, "bins": [], "sample": [],
                "shortTrack": True,
                "shortNote": {
                    "ko": "경로가 24시간에 못 미쳐 아직 비교하지 않습니다.",
                    "en": "Track shorter than 24 h — not compared yet."},
                "why": None}
    cur_shape = shape_vec(cur_pts)
    cur_doy = datetime.now(timezone.utc).timetuple().tm_yday
    cur_wind = storm.get("wind") or storm.get("severity")
    try:
        cur_wind = float(cur_wind) if cur_wind is not None else None
    except (TypeError, ValueError):
        cur_wind = None

    # ── 1차: 후보와 각 항목 거리(원 단위) 모으기 ──────────────────
    cand = []
    for h in history["storms"]:
        pts = h["pts"]
        best = None
        for i in range(WINDOW_PTS - 1, len(pts) - 1):
            lat, lon, wind, iso, nature = pts[i][0], pts[i][1], pts[i][2], pts[i][3], (pts[i][4] if len(pts[i]) > 4 else 'NR')
            # 계절 — ①번 결함 수정. 여기서 대부분이 걸러진다.
            if doy_gap(cur_doy, doy(iso)) > SEASON_WINDOW_DAYS:
                continue
            # ⚠️ 온대변질(ET) 시점은 **비교 기준으로 삼지 않는다.**
            # 실측(1980년~, 서태평양 54,284점):
            # 열대(TS)      위도 중앙 18.3° · 이동속도 중앙  9kt
            # 온대변질(ET)  위도 중앙 43.2° · 이동속도 중앙 18kt
            # 같은 자리에서 같은 방향으로 가고 있어도 그 뒤가 다르다 —
            # 다른 물리로 움직이기 때문이다. GDACS 가 주는 것은 열대저기압이므로
            # ET 시점과 짝지으면 "빠르게 북동으로 간다"는 쪽으로 결과가 쏠린다.
            #
            # ⚠️⚠️ 그렇다고 경로에서 **지우지는 않는다.** "전향하면서 온대로 바뀌어
            # 북동으로 가속했다"는 것은 실제로 일어난 일이고, 우리가 세려는
            # "그 뒤 72시간의 행방"이 바로 그것이다.
            # 기준점으로 안 쓸 뿐, 결과로는 그대로 센다.
            if nature == "ET":
                continue
            d_pos = dist_km(cur_lat, cur_lon, lat, lon)
            if d_pos > PREFILTER_KM:          # 계산량 상한 (선정 기준 아님)
                continue
            win = [(pts[i - k][0], pts[i - k][1]) for k in range(WINDOW_PTS)]
            a_shape = shape_vec(win)
            # 모양 거리 — 상대 변위 차이의 제곱합 제곱근 (Delle Monache 식의 형태)
            d_shape = math.sqrt(sum((cx - ax) ** 2 + (cy - ay) ** 2
                                    for (cx, cy), (ax, ay) in zip(cur_shape, a_shape)))
            d_wind = (abs(wind - cur_wind)
                      if (cur_wind is not None and wind is not None) else None)
            rec = {"h": h, "i": i, "d_pos": d_pos, "d_shape": d_shape, "d_wind": d_wind}
            if best is None or d_pos + d_shape < best["d_pos"] + best["d_shape"]:
                best = rec
        if best:
            cand.append(best)      # 한 태풍당 가장 가까운 시점 하나만 (표본 부풀리기 방지)

    if not cand:
        return {"matches": 0, "bins": [], "sample": [], "why": _why(cur_doy, cur_wind)}

    # ── 2차: 항목별 σ 로 정규화해 합산 → 거리 순위 ────────────────
    def sd(vals):
        v = [x for x in vals if x is not None]
        if len(v) < 2:
            return None
        m = sum(v) / len(v)
        return math.sqrt(sum((x - m) ** 2 for x in v) / (len(v) - 1)) or None

    s_pos = sd([c["d_pos"] for c in cand])
    s_shape = sd([c["d_shape"] for c in cand])
    s_wind = sd([c["d_wind"] for c in cand])
    for c in cand:
        d = W_POS * (c["d_pos"] / s_pos if s_pos else 0)
        d += W_SHAPE * (c["d_shape"] / s_shape if s_shape else 0)
        if c["d_wind"] is not None and s_wind:
            d += W_WIND * (c["d_wind"] / s_wind)
        c["dist"] = d
    cand.sort(key=lambda c: c["dist"])
    picked = cand[:TOP_N]

    # ── 3차: 그 뒤 행방 세기 ─────────────────────────────────────
    hits = []
    for c in picked:
        pts, i = c["h"]["pts"], c["i"]
        j = min(i + LOOK_AHEAD_H // STEP_H, len(pts) - 1)
        if j <= i:
            continue
        lat, lon = pts[i][0], pts[i][1]
        elat, elon = pts[j][0], pts[j][1]
        # ⚠️ 경로를 **현재 태풍 위치로 평행이동**해서 내보낸다 (EPANALOG 방식).
        #    원래 자리 좌표로 주면 지도에서 엉뚱한 곳에 그려져 비교가 안 된다.
        path = []
        for k in range(i, min(j + 1, len(pts))):
            dx, dy = km_xy(lat, lon, pts[k][0], pts[k][1])
            path.append([round(cur_lon + dx / (111.32 * math.cos(math.radians(cur_lat))), 2),
                         round(cur_lat + dy / 110.57, 2)])
        hits.append({
            "sid": c["h"]["sid"], "season": c["h"]["season"], "name": c["h"]["name"],
            "dir": dir_index(bearing(lat, lon, elat, elon)),
            "km": round(dist_km(lat, lon, elat, elon)),
            "posKm": round(c["d_pos"]),
            "path": path,          # 현재 위치 기준으로 옮긴 경로
        })

    if not hits:
        return {"matches": 0, "bins": [], "sample": [], "why": _why(cur_doy, cur_wind)}

    bins = [0] * 8
    for x in hits:
        bins[x["dir"]] += 1
    order = sorted(range(8), key=lambda k: -bins[k])
    top = order[0]
    n = len(hits)

    # 유사 사례 다발을 유료·관리자 화면에서 한눈에 읽을 수 있도록, 같은 +시간의
    # 좌표별 중앙값을 잇는다. 평균은 한 사례의 큰 이탈에 끌려가므로 중앙값을 쓴다.
    # ⚠️ 이 선에 ASCAT 바람을 임의 계수로 더하지 않는다. ASCAT은 현재 표면 근거이지
    # 미래 이동량이 아니며, 검증되지 않은 계수로 좌표를 미는 순간 지어낸 예보가 된다.
    # 최소 5개 사례가 같은 시각에 있어야 점을 남기고, 최대 72시간까지만 낸다.
    def median(values):
        ordered = sorted(values)
        mid = len(ordered) // 2
        return (ordered[mid] if len(ordered) % 2
                else (ordered[mid - 1] + ordered[mid]) / 2)

    estimate_steps = []
    max_path_len = max((len(x["path"]) for x in hits), default=0)
    for index in range(max_path_len):
        points = [x["path"][index] for x in hits if len(x["path"]) > index]
        if len(points) < 5:
            continue
        lon = median([p[0] for p in points])
        lat = median([p[1] for p in points])
        spread = median([dist_km(lat, lon, p[1], p[0]) for p in points])
        estimate_steps.append({
            "h": index * STEP_H,
            "lon": round(lon, 2), "lat": round(lat, 2),
            "n": len(points), "medianSpreadKm": round(spread),
        })

    return {
        "matches": n,
        "bins": [{"dir": DIRS[k], "dirEn": DIRS_EN[k], "n": bins[k]} for k in order if bins[k]],
        "topDir": DIRS[top], "topDirEn": DIRS_EN[top], "topN": bins[top],
        # ⚠️ 표본이 적으면 퍼센트를 만들지 않는다. null 이면 화면도 안 쓴다.
        "topPct": round(bins[top] * 100 / n) if n >= MIN_SAMPLE_FOR_PCT else None,
        "sample": sorted(hits, key=lambda x: -x["season"])[:12],
        "estimate": {
            "method": "coordinate-wise median of matched analogue paths",
            "steps": estimate_steps,
            "sampleN": n,
            "notForecast": True,
        } if len(estimate_steps) >= 2 else None,
        "candidates": len(cand),
        "why": _why(cur_doy, cur_wind),
    }


# ══════════════════════════════════════════════════════════════════
#  지향류 — 왜 이 방향으로 가는가
# ══════════════════════════════════════════════════════════════════
#  받은 요청: "태풍 경로가 중국쪽 고기압, 일본쪽 저기압 때문에 …
#              무역풍·편서풍 때문에 … 이렇게 예상된다" 식으로 설명해 달라.
#
#  ⚠️⚠️ 그런데 **"이렇게 될 것으로 예상된다"는 우리가 하면 안 되는 말**이다.
#     진로와 소멸을 단정하는 것은 예보이고, 우리는 예보 기관이 아니다.
#     대신 **왜 그 방향인지는 실제로 잰 기압장으로 설명할 수 있다.**
#
#  태풍을 미는 것은 중층(500hPa)의 흐름이다. 그 층의 지위고도에서
#  **5,880m 선**이 북태평양 고기압의 가장자리로 널리 쓰인다 —
#  태풍은 그 가장자리를 따라 돈다. 고기압이 서쪽으로 뻗어 있으면 서진하고,
#  고기압 서쪽 끝을 지나면 북상하다 편서풍대에서 북동으로 꺾인다(전향).
#
#  ⚠️ 여기서 만드는 것은 **사실(숫자)뿐**이다. 문장은 화면이 조립한다.
#     서버가 문장을 만들면 그 안의 숫자가 어디서 왔는지 확인할 수 없게 된다.

STEER_URL = "https://api.open-meteo.com/v1/forecast"
RIDGE_GPM = 5880          # 북태평양 고기압 가장자리로 널리 쓰이는 등고선
STEER_RING_DEG = 5        # 지향류를 평균 낼 고리 반경 (중심은 뺀다)
WESTERLY_LOOK_DEG = 10    # 편서풍대를 확인할 북쪽 거리


def _om_points(pts, fields):
    """Open-Meteo 다중 지점 조회. ⚠️ 지점이 하나면 배열이 아니라 객체로 온다."""
    q = urllib.parse.urlencode({
        "latitude": ",".join(f"{p[0]:.2f}" for p in pts),
        "longitude": ",".join(f"{p[1]:.2f}" for p in pts),
        "hourly": fields, "forecast_days": 2, "timezone": "UTC",
        "wind_speed_unit": "ms",
    })
    req = urllib.request.Request(f"{STEER_URL}?{q}", headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        j = json.loads(r.read())
    return j if isinstance(j, list) else [j]


def steering(lat, lon):
    """지금 태풍을 미는 환경을 **잰다**. 못 재면 None — 지어내지 않는다."""
    # ① 북쪽 자오선 (고기압이 어디까지 뻗어 있나) + ② 동서 (서쪽 끝이 어디인가)
    lats = [lat + d for d in (-5, 0, 5, 10, 15, 20) if -60 < lat + d < 60]
    lons = [lon + d for d in (-25, -15, -8, 0, 8, 15, 25)]
    # ⚠️⚠️ 지향류를 **태풍 중심에서 재면 안 된다.** 자기 소용돌이가 잡힌다.
    #    실측(DOLPHIN-26): 중심에서 238° **55 m/s** 가 나왔다 — 지향류가 아니라
    #    태풍 자신의 바람이다. 이걸 "태풍을 미는 흐름"이라고 적으면 거짓이 된다.
    #    → 중심을 비우고 **반경 STEER_RING_DEG 의 고리**에서 벡터 평균을 낸다.
    #      태풍 예보에서 쓰는 표준 방식이다(환경 흐름만 남기려는 것).
    ring = []
    for k in range(8):
        th = k * math.pi / 4
        rla = lat + STEER_RING_DEG * math.cos(th)
        rlo = lon + STEER_RING_DEG * math.sin(th) / max(0.25, math.cos(lat * math.pi / 180))
        if -60 < rla < 60:
            ring.append((rla, rlo))
    pts = ([(la, lon) for la in lats] + [(lat + 8, lo) for lo in lons]
           + ring + [(lat, lon)])
    try:
        rows = _om_points(pts, "geopotential_height_500hPa,"
                               "wind_speed_500hPa,wind_direction_500hPa,"
                               "wind_speed_700hPa,wind_direction_700hPa,"
                               "wind_speed_850hPa,wind_direction_850hPa")
    except Exception as e:                                   # noqa: BLE001
        print(f"[steer] 실패 {e!r}")
        return None
    if len(rows) != len(pts):
        return None

    now = datetime.now(timezone.utc)

    def at(i, level=500):
        h = rows[i].get("hourly") or {}
        try:
            # Open-Meteo에 timezone=UTC를 명시했지만 time 문자열에는 Z가 붙지 않는다.
            # 일반 관측 파서처럼 "시간대 없음"으로 버리면 전 층이 null이 된다.
            times = [datetime.strptime(x, "%Y-%m-%dT%H:%M").replace(tzinfo=timezone.utc)
                     for x in h.get("time") or []]
            valid = [(abs((x - now).total_seconds()), k) for k, x in enumerate(times) if x]
            if not valid:
                return (None, None, None, None)
            _, k = min(valid)
            gh = h["geopotential_height_500hPa"][k]
            return (gh, h[f"wind_speed_{level}hPa"][k],
                    h[f"wind_direction_{level}hPa"][k], times[k])
        except (KeyError, IndexError, TypeError):
            return (None, None, None, None)

    # ── 고기압이 북쪽으로 어디까지 뻗어 있나 (자오선) ──
    ridge_north = None
    for k, la in enumerate(lats):
        gh, _, _, _ = at(k)
        if gh is not None and gh >= RIDGE_GPM and la > lat:
            ridge_north = la          # 태풍보다 북쪽에서 마지막으로 넘긴 위도
    # ── 고기압의 서쪽 끝 (동서 단면, 태풍 북쪽 8°) ──
    base = len(lats)
    ridge_west = None
    for k, lo in enumerate(lons):
        gh, _, _, _ = at(base + k)
        if gh is not None and gh >= RIDGE_GPM and ridge_west is None:
            ridge_west = lo           # 서쪽부터 훑어 처음 넘긴 경도
    # ── 지향류 = 고리 평균 (중심 제외) ──
    # ⚠️ 방위는 벡터로 더해야 한다. 각도를 산술평균하면 350°와 10°의 평균이 180°가 된다.
    r0 = len(lats) + len(lons)
    layers = []
    # 깊은 층 평균의 고정 비율. 이것은 태풍 이동속도 공식이 아니라 서로 다른 고도의
    # 환경류를 한 벡터로 요약하는 공개 가능한 합성값이다. 실제 경로 결합에서는 낮은
    # 보조 가중치만 주고 기관·앙상블보다 앞세우지 않는다.
    layer_weights = {500: 0.5, 700: 0.3, 850: 0.2}
    deep_ux = deep_uy = deep_weight = 0.0
    for level, layer_weight in layer_weights.items():
        ux = uy = 0.0
        nring = 0
        valid_at = None
        for k in range(len(ring)):
            _, ws, wd, at_time = at(r0 + k, level)
            if ws is None or wd is None:
                continue
            # 기상 관례: wd 는 **불어오는 쪽**. 이동 방향은 그 반대다.
            th = math.radians(wd)
            ux += -ws * math.sin(th)
            uy += -ws * math.cos(th)
            nring += 1
            valid_at = at_time
        if not nring:
            continue
        ux /= nring; uy /= nring
        speed = math.hypot(ux, uy)
        direction = (math.degrees(math.atan2(ux, uy)) + 360) % 360
        layers.append({"hPa": level, "towardDeg": round(direction),
                       "speedMs": round(speed, 1), "ringN": nring,
                       "validUtc": valid_at.strftime("%Y-%m-%dT%H:%M:00Z") if valid_at else None})
        deep_ux += ux * layer_weight; deep_uy += uy * layer_weight
        deep_weight += layer_weight
    if deep_weight:
        deep_ux /= deep_weight; deep_uy /= deep_weight
    steer_spd = math.hypot(deep_ux, deep_uy) if deep_weight else None
    steer_dir = ((math.degrees(math.atan2(deep_ux, deep_uy)) + 360) % 360
                 if deep_weight else None)
    gh0, _, _, _ = at(len(pts) - 1)
    # ── 북쪽 편서풍대 확인 ──
    wl = None
    for k, la in enumerate(lats):
        if abs((la - lat) - WESTERLY_LOOK_DEG) < 3:
            _, ws, wd, _ = at(k)
            if wd is not None:
                wl = {"lat": round(la, 1), "dir": round(wd), "speed": round(ws, 1)}
    heights = [at(k)[0] for k in range(len(pts))]
    heights = [h for h in heights if h is not None]
    if not heights:
        return None

    return {
        "ridgeGpm": RIDGE_GPM,
        # ⚠️ null 이면 "고기압이 없다"가 아니라 **우리가 본 범위 안에 없다**는 뜻이다.
        #    화면이 그렇게 말하도록 sampled 를 같이 보낸다.
        "ridgeNorthLat": round(ridge_north, 1) if ridge_north is not None else None,
        "ridgeWestLon": round(ridge_west, 1) if ridge_west is not None else None,
        "maxGpm": round(max(heights)),
        "hereGpm": round(gh0) if gh0 is not None else None,
        # ⚠️ steerDir 은 **가는 쪽**이다 (바람의 '불어오는 쪽' 관례와 반대).
        #    화면에서 헷갈리지 않게 이름과 함께 적는다.
        "steerDir": round(steer_dir) if steer_dir is not None else None,
        "steerSpeed": round(steer_spd, 1) if steer_spd is not None else None,
        "steerIsToward": True,
        "steerRingDeg": STEER_RING_DEG,
        "steerRingN": min((x["ringN"] for x in layers), default=0),
        "layers": layers,
        "northWind": wl,
        "sampled": {"latFrom": round(min(lats), 1), "latTo": round(max(lats), 1),
                    "lonFrom": round(min(lons), 1), "lonTo": round(max(lons), 1)},
        "source": "Open-Meteo (GFS·ECMWF) 500·700·850hPa",
        "note": {
            "ko": "500·700·850hPa 환경류를 함께 재고, 500hPa 지위고도 "
                  f"{RIDGE_GPM}m 선이 북태평양 고기압의 가장자리로 널리 쓰이며, "
                  "태풍은 그 가장자리를 따라 움직입니다.",
            "en": "Environmental flow is sampled at 500, 700 and 850 hPa. The 500 hPa "
                  f"{RIDGE_GPM} m contour is the usual edge of the subtropical high; "
                  "storms travel along it.",
        },
    }


def _why(cur_doy, cur_wind):
    """판정 기준을 그대로 실어 보낸다 — 화면에 공개하기 위함."""
    return {
        "method": "Delle Monache et al. (2013) 유사도 · EPANALOG 계절/평행이동",
        "seasonWindowDays": SEASON_WINDOW_DAYS,
        "windowPts": WINDOW_PTS, "stepH": STEP_H,
        "topN": TOP_N, "lookAheadH": LOOK_AHEAD_H,
        "weights": {"pos": W_POS, "shape": W_SHAPE, "wind": W_WIND},
        "curDoy": cur_doy, "curWind": cur_wind,
    }


def recurve_stats(sample):
    """유사 사례들이 **어느 위도에서 북동으로 꺾였나**.

    ⚠️ 전향(recurvature)은 태풍이 고기압 서쪽 끝을 지나 편서풍대에 들어갈 때
       일어난다. 그 위도를 우리가 정하지 않고 **과거 사례에서 센다.**

    ⚠️ 표본이 적으면 퍼센트를 만들지 않는다 (MIN_SAMPLE_FOR_PCT).
    """
    lats, turned = [], 0
    for h in sample:
        path = h.get("path") or []
        if len(path) < 4:
            continue
        # 경로를 따라가며 진행 방향이 북동(0~90°)으로 바뀌는 첫 지점
        prev = None
        for i in range(1, len(path)):
            lon0, lat0 = path[i - 1][0], path[i - 1][1]
            lon1, lat1 = path[i][0], path[i][1]
            b = bearing(lat0, lon0, lat1, lon1)
            ne = 10 <= b <= 90
            if ne and prev is False:
                lats.append(round(lat1, 1))
                turned += 1
                break
            prev = ne
    n = len(sample)
    if not n:
        return None
    med = None
    if lats:
        v = sorted(lats)
        med = v[len(v) // 2]
    return {
        "n": n, "turned": turned,
        # ⚠️ 표본이 적으면 퍼센트를 쓰지 않는다 — 3건 중 2건을 67%로 적으면 거짓이다
        "pct": round(turned * 100 / n) if n >= MIN_SAMPLE_FOR_PCT else None,
        "medianLat": med,
        "note": {
            "ko": "유사 사례가 이후 72시간 안에 **북동으로 방향을 바꾼** 건수입니다. "
                  "예보가 아니라 과거를 센 것입니다.",
            "en": "How many analogues turned northeast within the next 72 h — "
                  "a count of the past, not a forecast.",
        },
    }


# ══════════════════════════════════════════════════════════════════
#  EARTHUS 종합 진로 참고선
# ══════════════════════════════════════════════════════════════════
# ⚠️ 이 선은 독립 수치예보가 아니다. 공식기관·ECMWF가 이미 계산한 미래 좌표를
# 현재 위치에 맞춰 시간 정렬하고, 최근 이동과 다층 환경류를 단기 보조항으로 더한
# "자료 종합 참고선"이다. 지상관측·ASCAT·수온은 미래 좌표를 임의 계수로 밀지 않고
# 입력의 신선도와 공개 신뢰등급을 제한한다. 검증 전 계수로 예보를 지어내지 않는다.
GUIDANCE_MAX_H = 48
GUIDANCE_STEP_H = 6


def _median(values):
    ordered = sorted(values)
    if not ordered:
        return None
    mid = len(ordered) // 2
    return ordered[mid] if len(ordered) % 2 else (ordered[mid - 1] + ordered[mid]) / 2


def _normalise_steps(raw_steps, cur_lat, cur_lon):
    """자료마다 다른 기준시각을 현재 위치와 가장 가까운 점으로 맞춘다.

    ECMWF의 h는 모델 실행시각 기준이고 기관 h는 발표의 현재점 기준이라 그대로
    섞으면 6~12시간이 어긋난다. 가장 가까운 계산점을 h=0으로 옮기고 좌표도 현재
    관측점에 평행이동한다. 원 자료의 진행 모양은 바꾸지 않는다.
    """
    pts = []
    for step in raw_steps or []:
        try:
            pts.append({"h": float(step.get("h") or 0),
                        "lat": float(step["lat"]), "lon": float(step["lon"])})
        except (TypeError, ValueError, KeyError):
            continue
    if not pts:
        return []
    anchor = min(pts, key=lambda p: dist_km(cur_lat, cur_lon, p["lat"], p["lon"]))
    out = [{"h": round(p["h"] - anchor["h"], 3),
            "lat": p["lat"] + cur_lat - anchor["lat"],
            "lon": p["lon"] + cur_lon - anchor["lon"]}
           for p in pts if p["h"] >= anchor["h"]]
    out.sort(key=lambda p: p["h"])
    return out


def _point_at(steps, lead_h):
    if not steps or lead_h < steps[0]["h"] or lead_h > steps[-1]["h"]:
        return None
    for point in steps:
        if abs(point["h"] - lead_h) < 1e-6:
            return (point["lat"], point["lon"])
    for a, b in zip(steps, steps[1:]):
        if a["h"] <= lead_h <= b["h"] and b["h"] > a["h"]:
            ratio = (lead_h - a["h"]) / (b["h"] - a["h"])
            return (a["lat"] + (b["lat"] - a["lat"]) * ratio,
                    a["lon"] + (b["lon"] - a["lon"]) * ratio)
    return None


def _matched_official(official_doc, storm_name):
    key = _storm_key(storm_name)
    for item in official_doc.get("storms") or []:
        if _storm_key(item.get("name") or item.get("key")) == key:
            return item.get("agencies") or []
    return []


def _matched_ecmwf(ecmwf_doc, storm_name):
    key = _storm_key(storm_name)
    return next((x for x in ecmwf_doc.get("storms") or []
                 if _storm_key(x.get("name")) == key), None)


def _current_wind_ms(official_doc, storm_name):
    vals = []
    for agency in _matched_official(official_doc, storm_name):
        steps = agency.get("steps") or []
        if steps and steps[0].get("windMs") is not None:
            try:
                vals.append(float(steps[0]["windMs"]))
            except (TypeError, ValueError):
                pass
    return _median(vals)


def _evidence_gate(surface):
    rows = {x.get("id"): x for x in (surface or {}).get("bySource") or []}
    satellite_n = int((rows.get("ascat") or {}).get("freshN") or 0)
    surface_n = sum(int(x.get("freshN") or 0) for key, x in rows.items() if key != "ascat")
    sst_n = sum(int(x.get("sstN") or 0) for x in rows.values())
    return {"surfaceFreshN": surface_n, "satelliteWindFreshN": satellite_n,
            "seaSurfaceTemperatureN": sst_n,
            "surfacePass": surface_n >= 3,
            "satellitePass": satellite_n >= 20,
            # 수온은 진로보다 세기 유지 근거다. 없다고 진로선을 없애지는 않되 낮은
            # 신뢰 근거로 명시한다.
            "seaSurfacePass": sst_n >= 1}


def build_guidance(storm, analysis, official_doc, ecmwf_doc):
    track = storm.get("track") or []
    if len(track) < 2:
        return None
    cur_lon, cur_lat = float(track[-1][0]), float(track[-1][1])
    components = []

    for agency in _matched_official(official_doc, storm.get("name")):
        steps = _normalise_steps(agency.get("steps"), cur_lat, cur_lon)
        if len(steps) >= 2:
            components.append({"id": str(agency.get("agency") or "OFFICIAL"),
                               "kind": "official", "family": str(agency.get("agency") or "OFFICIAL"),
                               "weight": 1.5, "steps": steps,
                               "issued": agency.get("issue")})

    model = _matched_ecmwf(ecmwf_doc, storm.get("name"))
    if model:
        steps = _normalise_steps(model.get("steps"), cur_lat, cur_lon)
        if len(steps) >= 2:
            components.append({"id": "ECMWF_HRES", "kind": "model", "family": "ECMWF",
                               "weight": 1.25,
                               "steps": steps, "issued": ecmwf_doc.get("generated")})
        members = []
        for member in (model.get("ensemble") or {}).get("members") or []:
            normal = _normalise_steps(member.get("steps"), cur_lat, cur_lon)
            if len(normal) >= 2:
                members.append(normal)
        if members:
            ens_steps = []
            for lead in range(0, GUIDANCE_MAX_H + 1, GUIDANCE_STEP_H):
                pts = [_point_at(x, lead) for x in members]
                pts = [x for x in pts if x]
                if len(pts) < 5:
                    continue
                lat = _median([x[0] for x in pts]); lon = _median([x[1] for x in pts])
                ens_steps.append({"h": lead, "lat": lat, "lon": lon, "n": len(pts)})
            if len(ens_steps) >= 2:
                components.append({"id": "ECMWF_ENS_MEDIAN", "kind": "ensemble",
                                   "family": "ECMWF", "weight": 2.0, "steps": ens_steps,
                                   "issued": ecmwf_doc.get("generated")})

    # 최근 6시간 이동은 +18시간까지만 보조한다. 계속 직선 외삽하지 않고 12시간
    # 시정수로 이동량을 포화시켜 장기 폭주를 막는다.
    current = resample_current(track, storm.get("from"), storm.get("to"), n=2, step_h=6)
    if current:
        latest, previous = current[0], current[1]
        dx, dy = km_xy(previous[0], previous[1], latest[0], latest[1])
        motion_steps = []
        denom = 1 - math.exp(-6 / 12)
        for lead in range(0, 19, GUIDANCE_STEP_H):
            factor = (1 - math.exp(-lead / 12)) / denom if lead else 0
            motion_steps.append({"h": lead,
                                 "lat": cur_lat + dy * factor / 110.57,
                                 "lon": cur_lon + dx * factor / (111.32 * math.cos(math.radians(cur_lat)))})
        components.append({"id": "RECENT_MOTION_6H", "kind": "motion",
                           "family": "OBSERVED_MOTION", "weight": 0.8, "steps": motion_steps})

    steering_info = analysis.get("steering") or {}
    if steering_info.get("steerDir") is not None and steering_info.get("steerSpeed") is not None:
        direction = math.radians(float(steering_info["steerDir"]))
        speed = min(15.0, float(steering_info["steerSpeed"]))
        steer_steps = []
        for lead in range(0, 25, GUIDANCE_STEP_H):
            # 환경류 전속도를 태풍 속도로 간주하지 않는다. 6시간 시정수로 완화하고
            # 결합 가중치도 낮게 둔다.
            km = speed * 3.6 * lead * (0.65 + 0.35 * math.exp(-lead / 12))
            dx, dy = km * math.sin(direction), km * math.cos(direction)
            steer_steps.append({"h": lead, "lat": cur_lat + dy / 110.57,
                                "lon": cur_lon + dx / (111.32 * math.cos(math.radians(cur_lat)))})
        components.append({"id": "DEEP_LAYER_STEERING", "kind": "steering",
                           "family": "ENVIRONMENTAL_FLOW", "weight": 0.35, "steps": steer_steps})

    analog_steps = (analysis.get("estimate") or {}).get("steps") or []
    if analog_steps:
        usable = [x for x in analog_steps if int(x.get("medianSpreadKm") or 0) <= 600]
        if len(usable) >= 2:
            components.append({"id": "IBTRACS_ANALOG", "kind": "analogue",
                               "family": "IBTRACS", "weight": 0.15, "steps": usable})

    evidence = _evidence_gate(analysis.get("surfaceEvidence"))
    output = []
    for lead in range(0, GUIDANCE_MAX_H + 1, GUIDANCE_STEP_H):
        points = []
        for comp in components:
            point = _point_at(comp["steps"], lead)
            if point:
                points.append((comp, point))
        core = [(c, p) for c, p in points if c["kind"] in ("official", "model", "ensemble")]
        families = {c["family"] for c, _ in core}
        if lead > 0 and len(families) < 2:
            break
        if not points:
            continue
        total = sum(c["weight"] for c, _ in points)
        lat = sum(p[0] * c["weight"] for c, p in points) / total
        lon = sum(p[1] * c["weight"] for c, p in points) / total
        spreads = [dist_km(lat, lon, p[0], p[1]) for _, p in core]
        spread = _median(spreads) or 0
        if lead > 0 and spread > 500:
            break
        ens = next((c for c, _ in core if c["kind"] == "ensemble"), None)
        ens_point = next((x for x in (ens or {}).get("steps", []) if x.get("h") == lead), None)
        grade = ("high" if len(core) >= 3 and (ens_point or {}).get("n", 0) >= 10
                 and spread <= 180 and evidence["surfacePass"] and evidence["satellitePass"]
                 and evidence["seaSurfacePass"]
                 else "medium" if len(core) >= 2 and spread <= 350 else "low")
        output.append({"h": lead, "lat": round(lat, 2), "lon": round(lon, 2),
                       "coreN": len(core), "inputN": len(points),
                       "sourceFamilyN": len(families),
                       "ensembleN": (ens_point or {}).get("n", 0),
                       "spreadKm": round(spread), "confidence": grade})

    if len(output) < 2:
        return None
    return {
        "schema": 2, "kind": "multi-source guidance", "notOfficial": True,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "steps": output, "evidence": evidence,
        "components": [{"id": x["id"], "kind": x["kind"], "family": x["family"], "weight": x["weight"],
                        "issued": x.get("issued"), "horizonH": round(x["steps"][-1]["h"])}
                       for x in components],
        "steeringLayers": steering_info.get("layers") or [],
        "method": {
            "ko": "KMA·JMA·ECMWF HRES·ENS를 시간 정렬해 중심 골격을 만들고, 최근 6시간 이동과 최신 500·700·850hPa 환경류를 단기 보조항으로 결합했습니다. IBTrACS 유사사례는 낮은 가중치만 사용했습니다. 지상·부이·ASCAT·수온은 좌표를 밀지 않고 신뢰등급과 공개 범위를 제한합니다.",
            "en": "Time-aligned KMA, JMA, ECMWF HRES and ENS guidance, with recent motion and current 500/700/850 hPa environmental flow as short-range terms. Analogues have low weight; observations gate confidence rather than displacing the track.",
        },
    }


def _safe_s3(key, default):
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())
    except Exception:  # noqa: BLE001 - 첫 실행·상류 결측은 명시적 기본값으로 남긴다
        return default


def _storm_key(name):
    key = str(name or "").upper().strip()
    head, sep, tail = key.rpartition("-")
    return head if sep and tail.isdigit() else key


def _forecast_groups(storm, rec, official_doc, ecmwf_doc, issued):
    """그 시각 사용자가 본 미래 좌표를 회차 원문으로 보존한다."""
    key = _storm_key(storm.get("name"))
    groups = []
    guidance = rec.get("guidance") or {}
    if guidance.get("steps"):
        groups.append({"agency": "EARTHUS_MULTI_SOURCE", "issued": issued,
                       "steps": guidance["steps"], "notOfficial": True})
    for item in official_doc.get("storms") or []:
        if _storm_key(item.get("name") or item.get("key")) != key:
            continue
        for agency in item.get("agencies") or []:
            groups.append({"agency": agency.get("agency"),
                           "issued": agency.get("issue") or official_doc.get("generated") or issued,
                           "steps": agency.get("steps") or [], "notOfficial": False})
    for item in ecmwf_doc.get("storms") or []:
        if _storm_key(item.get("name")) == key:
            groups.append({"agency": "ECMWF", "issued": ecmwf_doc.get("generated") or issued,
                           "steps": item.get("steps") or [], "notOfficial": True})
    return groups


def _ibtracs_time(value):
    """IBTrACS 점 시각('YYYY-MM-DD HH')을 완전한 ISO-8601 UTC 로 편다.

    ⚠️⚠️ **iso_time() 을 그대로 쓰면 안 된다.** 그쪽 계약은 "시간대가 없으면 None"이고
       (CWA 지역시각을 UTC로 추측하지 않으려는 것 — iso_time 주석 참고), 그 규칙이
       UTC 가 정의인 IBTrACS 시각까지 같이 버린다.
       실제로 그래서 **종료 보고서 22건의 오차표가 전부 비어 있었다**(2026-09-02 발견).
       _score 가 best track 시각을 하나도 못 읽어 nearby 가 항상 빈 배열이었다.

    ⚠️ 여기서만 UTC 로 단정하는 근거 두 가지 — 추측이 아니다:
       ① IBTrACS ISO_TIME 은 정의상 UTC 다.
       ② parse_ibtracs 가 00/06/12/18 정시만 통과시킨다(위 필터). 분·초가 없다.
    ⚠️ 저장 형식(pts[3] = iso[:13])은 바꾸지 않는다. 파일 크기 때문에 자른 것이고,
       doy() 는 앞 10자만 쓰므로 그대로 둬도 된다. 시각이 필요한 이 지점에서만 편다.
    """
    text = str(value or "").strip()
    if len(text) < 13:
        return None
    date, _, hour = text[:13].partition(" ")
    if len(date) != 10 or len(hour) != 2 or not hour.isdigit():
        return None
    return f"{date}T{hour}:00:00Z"


def _final_track(history, name, year):
    key = _storm_key(name)
    candidates = [x for x in history.get("storms", [])
                  if int(x.get("season") or 0) == year and _storm_key(x.get("name")) == key]
    if not candidates:
        return None
    pts = candidates[0].get("pts") or []
    out = []
    for p in pts:
        if len(p) < 4:
            continue
        at = _ibtracs_time(p[3])
        if not at:
            continue
        out.append({"lat": p[0], "lon": p[1], "windKt": p[2], "at": at})
    return out


def _score(groups, actual):
    """발표 당시 +시간 좌표를 최종 best track의 가장 가까운 6시간 점과 대조한다."""
    if not actual:
        return []
    actual_times = [(iso_time(x["at"]), x) for x in actual]
    out = []
    for group in groups:
        issued = iso_time(group.get("issued"))
        if not issued:
            continue
        rows = []
        for step in group.get("steps") or []:
            try:
                h = int(step.get("h") or 0)
                lat, lon = float(step["lat"]), float(step["lon"])
            except (TypeError, ValueError, KeyError):
                continue
            if h <= 0:
                continue
            target = issued + timedelta(hours=h)
            nearby = [(abs((at - target).total_seconds()), point)
                      for at, point in actual_times if at]
            if not nearby:
                continue
            gap, point = min(nearby, key=lambda x: x[0])
            if gap > 4 * 3600:
                continue
            rows.append({"h": h, "errorKm": round(dist_km(lat, lon, point["lat"], point["lon"])),
                         "verifiedAt": point["at"]})
        if rows:
            out.append({"agency": group.get("agency"), "n": len(rows),
                        "meanErrorKm": round(sum(x["errorKm"] for x in rows) / len(rows)),
                        "byLead": rows})
    return out


def update_lifecycle(now, tracks, analyses, history):
    """탐지부터 종료 보고서까지 이어지는 상태와 당시 계산 회차를 보존한다."""
    state = _safe_s3(SESSION_KEY, {"schema": 1, "sessions": []})
    sessions = {str(x.get("id")): x for x in state.get("sessions", []) if x.get("id")}
    by_analysis = {str(x.get("id")): x for x in analyses}
    official = _safe_s3(OFFICIAL_KEY, {})
    ecmwf = _safe_s3(ECMWF_KEY, {})
    stamp = now.strftime("%Y-%m-%dT%H:%M:00Z")

    for storm in tracks.get("storms") or []:
        sid = str(storm.get("id"))
        rec = by_analysis.get(sid)
        session = sessions.get(sid) or {
            "id": sid, "name": storm.get("name"), "detectedAt": stamp,
            "status": "DETECTED", "snapshots": [], "events": [{"status": "DETECTED", "at": stamp}],
        }
        session["name"] = storm.get("name") or session.get("name")
        session["lastSeen"] = storm.get("lastSeen") or session.get("lastSeen")
        session["actualTrack"] = storm.get("track") or session.get("actualTrack") or []
        wanted = "ACTIVE" if storm.get("live") else "VERIFYING"
        if session.get("status") in ("DETECTED", "ACTIVE") and session.get("status") != wanted:
            session["status"] = wanted
            session["events"].append({"status": wanted, "at": stamp})
        elif session.get("status") == "DETECTED" and wanted == "ACTIVE":
            session["status"] = "ACTIVE"
            session["events"].append({"status": "ACTIVE", "at": stamp})

        if storm.get("live") and rec:
            last = (session.get("snapshots") or [{}])[-1].get("issuedAt")
            if not last or last[:13] != stamp[:13]:
                session.setdefault("snapshots", []).append({
                    "issuedAt": stamp, "algorithmVersion": 2,
                    "forecasts": _forecast_groups(storm, rec, official, ecmwf, stamp),
                    "surfaceEvidence": rec.get("surfaceEvidence"),
                    "steering": rec.get("steering"), "matches": rec.get("matches"),
                })
                session["snapshots"] = session["snapshots"][-240:]
        if not storm.get("live"):
            session.setdefault("endedAt", storm.get("lastSeen") or stamp)
            ended = iso_time(session.get("endedAt"))
            if ended and now - ended >= timedelta(hours=72) and session["status"] == "VERIFYING":
                session["status"] = "PRELIMINARY_REPORT"
                session["events"].append({"status": "PRELIMINARY_REPORT", "at": stamp})

        year = (iso_time(session.get("detectedAt")) or now).year
        final = _final_track(history, session.get("name"), year)
        newly_final = bool(final) and session.get("status") in ("VERIFYING", "PRELIMINARY_REPORT")
        # ⚠️⚠️ 이미 FINAL 인데 오차표가 비어 있으면 **다시 채점한다.**
        #    2026-09-02 이전 회차는 best track 시각을 못 읽어(iso_time 계약, _ibtracs_time 주석 참고)
        #    운영 중이던 보고서 22건이 전부 scores=[] 로 굳어 있었다.
        #    이 경로가 없으면 파싱을 고쳐도 **과거 보고서는 영원히 빈 채로 남는다** —
        #    위 분기는 VERIFYING/PRELIMINARY 에서만 채점하기 때문이다.
        #    ⚠️ 눈이 없어 정말로 채점할 수 없는 세션은 매 회차 다시 계산한다.
        #       메모리 안 계산뿐이라 비용이 없고, 없는 점수를 지어내는 것보다 낫다.
        rescore = (bool(final) and session.get("status") == "FINAL_REPORT"
                   and not session.get("scores"))
        if newly_final or rescore:
            if newly_final:
                session["status"] = "FINAL_REPORT"
                session["events"].append({"status": "FINAL_REPORT", "at": stamp})
            session["finalTrack"] = final
            groups = [g for snap in session.get("snapshots", []) for g in snap.get("forecasts", [])]
            session["scores"] = _score(groups, final)
        sessions[sid] = session

    kept = sorted(sessions.values(), key=lambda x: x.get("detectedAt", ""), reverse=True)[:100]
    private = {"schema": 1, "generated": stamp, "sessions": kept}
    s3.put_object(Bucket=BUCKET, Key=SESSION_KEY,
                  Body=json.dumps(private, ensure_ascii=False, separators=(",", ":")).encode(),
                  ContentType="application/json", CacheControl="private, no-store")
    reports = [{"id": x["id"], "name": x.get("name"), "status": x.get("status"),
                "detectedAt": x.get("detectedAt"), "lastSeen": x.get("lastSeen"),
                "endedAt": x.get("endedAt"), "snapshotCount": len(x.get("snapshots", [])),
                "scores": x.get("scores", []),
                "note": "FINAL_REPORT만 IBTrACS best track으로 검증됨. PRELIMINARY_REPORT는 잠정 상태."}
               for x in kept]
    put(REPORT_KEY, {"generated": stamp, "count": len(reports), "reports": reports}, 1800)
    return {"sessions": len(kept), "active": sum(x.get("status") == "ACTIVE" for x in kept)}


def handler(event, context):
    history, rebuilt = load_history()

    try:
        cur = json.loads(s3.get_object(Bucket=BUCKET, Key=SRC_TRACKS)["Body"].read())
    except Exception as e:                                   # noqa: BLE001
        return {"ok": False, "reason": f"tracks: {e!r}"[:120]}

    # 관측·기관·모델 목록은 태풍마다 다시 읽지 않는다. 같은 실행 시각의 원문을 쓴다.
    observations = load_observations()
    official = _safe_s3(OFFICIAL_KEY, {})
    ecmwf = _safe_s3(ECMWF_KEY, {})
    now = datetime.now(timezone.utc)
    out = []
    for st in (cur.get("storms") or []):
        # GDACS 경로에는 강도가 빠질 수 있다. 같은 태풍의 최신 기관 현재값 중앙값으로
        # 채우되 출처 없는 추정값은 만들지 않는다.
        if st.get("wind") is None and st.get("severity") is None:
            current_wind = _current_wind_ms(official, st.get("name"))
            if current_wind is not None:
                st = {**st, "wind": round(current_wind * 1.94384, 1),
                      "windSource": "KMA·JMA current wind median"}
        a = analyse(st, history)
        if a is None:
            continue
        rec = {"id": st.get("id"), "name": st.get("name"), **a}

        # ── 지향류 — 왜 이 방향인가 ──────────────────────────────
        # ⚠️ 살아 있는 태풍만 잰다. 이미 목록에서 빠진 폭풍의 '지금 기압장'은
        #    설명이 아니라 혼란이다.
        tr = st.get("track") or []
        if st.get("live") and tr:
            rec["surfaceEvidence"] = observation_evidence(tr[-1][1], tr[-1][0], observations, now)
            sv = steering(tr[-1][1], tr[-1][0])
            if sv:
                rec["steering"] = sv

        # 모든 입력이 준비된 뒤에만 선을 만든다. 관측은 신뢰 게이트이고, 좌표 골격은
        # 기관·ECMWF가 담당한다. 둘 이상의 미래 자료군이 없으면 guidance=None이다.
        rec["guidance"] = build_guidance(st, rec, official, ecmwf) if st.get("live") else None

        # ── 유사 사례가 어디서 꺾였나 ────────────────────────────
        # ⚠️ "편서풍대에서 북동으로 꺾인다"는 교과서 설명이다. 우리는 그걸
        #    **세어서** 말한다 — 유사 사례 중 몇 건이 실제로 그랬는지.
        rec["recurve"] = recurve_stats(a.get("sample") or [])
        out.append(rec)

    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "IBTrACS v04r01 (NOAA NCEI) · 현재 경로는 GDACS",
        "license": "IBTrACS: 미국 정부 저작물(퍼블릭 도메인)",
        "note": {
            "ko": "지금 태풍과 **위치·진행방향·강도가 비슷했던 과거 시점**을 찾아, "
                  "그 태풍들이 그 뒤 72시간에 어디로 갔는지 센 것입니다. "
                  "⚠️ 예보가 아닙니다 — 과거에 이랬다는 기록이며, 실제 진로는 "
                  "기상청·JMA 공식 예보를 따르세요. "
                  f"판정 방식: 같은 계절(±{SEASON_WINDOW_DAYS}일) 안에서, 최근 "
                  f"{(WINDOW_PTS-1)*STEP_H}시간 경로의 위치·움직임·강도를 각 항목의 "
                  f"표준편차로 나눠 더한 거리로 재고 가까운 순 {TOP_N}개를 씁니다 "
                  f"(Delle Monache et al. 2013 방식).",
            "en": "Past storms that were at a similar position, heading and intensity, "
                  "and where they went over the next 72 hours. Not a forecast.",
        },
        "minSampleForPct": MIN_SAMPLE_FOR_PCT,
        "historyStorms": history["count"],
        "historyFrom": history["seasonFrom"],
        "count": len(out),
        "storms": out,
    }
    kb = put(DST_ANALOG, doc, 1800) / 1024
    lifecycle = update_lifecycle(now, cur, out, history)
    print(f"[analog] 과거 {history['count']}개 · 현재 {len(out)}개 "
          f"· 이력재구축 {rebuilt} · {kb:.0f}KB")
    return {"ok": True, "history": history["count"], "storms": len(out),
            "rebuilt": rebuilt, "lifecycle": lifecycle}
