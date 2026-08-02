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
    return {
        "matches": n,
        "bins": [{"dir": DIRS[k], "dirEn": DIRS_EN[k], "n": bins[k]} for k in order if bins[k]],
        "topDir": DIRS[top], "topDirEn": DIRS_EN[top], "topN": bins[top],
        # ⚠️ 표본이 적으면 퍼센트를 만들지 않는다. null 이면 화면도 안 쓴다.
        "topPct": round(bins[top] * 100 / n) if n >= MIN_SAMPLE_FOR_PCT else None,
        "sample": sorted(hits, key=lambda x: -x["season"])[:12],
        "candidates": len(cand),
        "why": _why(cur_doy, cur_wind),
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


def handler(event, context):
    history, rebuilt = load_history()

    try:
        cur = json.loads(s3.get_object(Bucket=BUCKET, Key=SRC_TRACKS)["Body"].read())
    except Exception as e:                                   # noqa: BLE001
        return {"ok": False, "reason": f"tracks: {e!r}"[:120]}

    out = []
    for st in (cur.get("storms") or []):
        a = analyse(st, history)
        if a is None:
            continue
        out.append({"id": st.get("id"), "name": st.get("name"), **a})

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
    print(f"[analog] 과거 {history['count']}개 · 현재 {len(out)}개 "
          f"· 이력재구축 {rebuilt} · {kb:.0f}KB")
    return {"ok": True, "history": history["count"], "storms": len(out),
            "rebuilt": rebuilt}
