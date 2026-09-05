"""EARTHUS 쓰나미 도달시간 추정 — 지시서 N-1 (SIMULATION_ONLY)

무엇을 하나
  M6.5 이상 얕은(≤100 km) 바다 지진이 나면, GEBCO 0.1° 최심 격자를 0.2° 로 줄인 판 위에서
  장파 속도 c = √(g·h) 로 파면이 퍼지는 시간을 Dijkstra(8방향)로 구한다.
  결과: 연안 지점(한국 10곳 + 주변국·태평양 연안) 도달시간(분), 30·60분 등시선, PTWC 게시문 ETA 와의 차이.

무엇이 아닌가
  · 파고·침수·피해가 아니다. "언제 첫 파가 닿을 수 있나"의 물리 근사일 뿐이다.
  · 공식 경보가 아니다. 경보·행동 지시는 PTWC/JMA/기상청 원문만 따른다. 배지는 SIMULATION_ONLY 로 고정한다.
  · 값을 만들지 않는다: 격자에서 닿지 않는 지점은 null, 게시문에 ETA 표가 없으면 대조는 null 이다.

근사의 한계(파일에도 그대로 적는다)
  · 0.2° 격자(적도 약 22 km)라 해협·만 안쪽은 늦거나 빠르게 나올 수 있다.
  · 진원을 점으로 본다. 실제 단층 길이(M8+ 는 수백 km)를 무시하므로 가까운 연안은 실제보다 늦게 나올 수 있다.
  · 8방향 격자 경로는 직선보다 최대 약 8% 길다(대각선 오차). 원 격자의 최심값을 평균했으므로 얕은 대륙붕은 빠르게 나올 수 있다.

출력
  ocean/tsunami-eta/{usgsId}.json   사건별(불변에 가깝게 — 같은 사건은 다시 계산하지 않는다)
  ocean/tsunami-eta.json            색인(최근 30일)
"""
import heapq
import json
import math
import os
import re
import urllib.request
from datetime import datetime, timedelta, timezone

import numpy as np

BUCKET = os.environ.get("CACHE_BUCKET", "")
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
GRID_KEY = "ocean/depth-grid.bin"
MANIFEST_KEY = "ocean/depth-grid.manifest.json"
TSUNAMI_KEY = "events/tsunami-intl.json"
INDEX_KEY = "ocean/tsunami-eta.json"
EVENT_KEY = "ocean/tsunami-eta/{id}.json"
USGS = ("https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=6.5"
        "&orderby=time&limit=40&starttime={start}")
UA = {"User-Agent": "earthus.net (dalur@kakao.com)"}
MODEL_VERSION = "eta-v1"
G = 9.81
MIN_DEPTH_M = 5.0
STEP_DEG = 0.2          # 계산 격자
WIN_LAT, WIN_LON = 25.0, 45.0   # 진원 주변 창(도)
MAX_MIN = 24 * 60
LEVELS_MIN = [30, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480, 600, 720]
MIN_MAG, MAX_DEPTH_KM = 6.5, 100.0
CONTOUR_STEP_DEG = 0.5  # 등시선은 0.5° 로 줄인 판에서 — 파일 크기 때문(0.2° 면 사건당 1 MB)

# 연안 지점 — 값은 그 지점에서 가장 가까운 바다 셀의 도달시간이다. 순서는 한국 먼저(PD 규칙).
STATIONS = [
    ("KOR", "부산", 35.10, 129.04), ("KOR", "울산", 35.50, 129.39), ("KOR", "포항", 36.03, 129.38), ("KOR", "강릉", 37.77, 128.95),
    ("KOR", "속초", 38.21, 128.60), ("KOR", "제주", 33.52, 126.53), ("KOR", "서귀포", 33.24, 126.56), ("KOR", "여수", 34.74, 127.75),
    ("KOR", "목포", 34.78, 126.38), ("KOR", "인천", 37.45, 126.60),
    ("JPN", "나하", 26.21, 127.68), ("JPN", "가고시마", 31.58, 130.56), ("JPN", "고치", 33.50, 133.57), ("JPN", "지바(도쿄만)", 35.13, 140.08),
    ("JPN", "센다이", 38.26, 141.02), ("JPN", "하코다테", 41.77, 140.73), ("JPN", "니가타", 37.93, 139.05),
    ("TWN", "화롄", 23.98, 121.62), ("TWN", "가오슝", 22.61, 120.27), ("PHL", "마닐라", 14.58, 120.93), ("PHL", "다바오", 7.07, 125.63),
    ("RUS", "페트로파블롭스크", 52.98, 158.65), ("USA", "힐로", 19.73, -155.06), ("USA", "호놀룰루", 21.31, -157.87),
    ("USA", "로스앤젤레스", 33.72, -118.27), ("USA", "샌프란시스코", 37.79, -122.48), ("USA", "시애틀", 47.60, -122.34), ("USA", "앵커리지", 61.22, -149.89),
    ("MEX", "아카풀코", 16.85, -99.90), ("PER", "카야오", -12.05, -77.15), ("CHL", "발파라이소", -33.03, -71.63),
    ("NZL", "웰링턴", -41.29, 174.78), ("AUS", "시드니", -33.86, 151.21), ("IDN", "파당", -0.95, 100.35), ("IND", "첸나이", 13.08, 80.29),
    ("PNG", "포트모르즈비", -9.47, 147.15), ("FJI", "수바", -18.14, 178.44), ("ECU", "과야킬", -2.20, -79.90),
]

_s3 = None
_grid = None
_manifest = None


def s3():
    global _s3
    if _s3 is None:
        import boto3
        _s3 = boto3.client("s3", region_name=REGION)
    return _s3


def load_grid():
    """0.1° int16(1800×3600, 남→북, 서→동). 육지 양수, 바다 음수."""
    global _grid, _manifest
    if _grid is None:
        raw = s3().get_object(Bucket=BUCKET, Key=GRID_KEY)["Body"].read()
        _manifest = json.loads(s3().get_object(Bucket=BUCKET, Key=MANIFEST_KEY)["Body"].read().decode("utf-8"))
        rows, cols = _manifest["output"]["shape"]
        _grid = np.frombuffer(raw, dtype="<i2").reshape(rows, cols)
    return _grid, _manifest


# ── 격자 → 계산판 ─────────────────────────────────────────────
def coarsen(grid01, factor=2):
    """0.1° → 0.2°: 2×2 블록의 바다 셀 평균 수심(m, 양수). 바다 셀이 없으면 NaN(육지)."""
    rows, cols = grid01.shape
    g = grid01[: rows - rows % factor, : cols - cols % factor].astype(np.float32)
    g = g.reshape(rows // factor, factor, cols // factor, factor)
    sea = np.where(g < 0, -g, np.nan)
    with np.errstate(all="ignore"):
        depth = np.nanmean(sea, axis=(1, 3))
    return depth  # NaN = 육지


def window(depth, lat0, lon0, step=STEP_DEG, win_lat=WIN_LAT, win_lon=WIN_LON):
    """진원 주변 창을 잘라낸다. 경도는 날짜변경선을 넘어 감는다. 반환: (판, 남쪽 위도, 서쪽 경도, 행 인덱스 배열, 열 인덱스 배열)"""
    rows, cols = depth.shape
    r0 = int(math.floor((lat0 - win_lat + 90) / step)); r1 = int(math.ceil((lat0 + win_lat + 90) / step))
    r0, r1 = max(0, r0), min(rows, r1)
    c0 = int(math.floor((lon0 - win_lon + 180) / step)); c1 = int(math.ceil((lon0 + win_lon + 180) / step))
    cidx = np.arange(c0, c1) % cols
    sub = depth[r0:r1][:, cidx]
    return sub, -90 + r0 * step, -180 + c0 * step


def travel_time(depth_win, south, west, lat0, lon0, step=STEP_DEG, max_min=MAX_MIN):
    """Dijkstra 8방향. 반환: 분 단위 float 배열(닿지 않으면 inf). 진원이 육지면 반경 3셀 안 가장 가까운 바다 셀에서 시작."""
    H, W = depth_win.shape
    speed = np.sqrt(G * np.maximum(np.nan_to_num(depth_win, nan=0.0), 0.0))       # m/s, 육지 0
    sea = np.isfinite(depth_win) & (depth_win > 0)
    speed = np.where(sea, np.maximum(speed, math.sqrt(G * MIN_DEPTH_M)), 0.0)
    r_src = int(round((lat0 - south) / step)); c_src = int(round((lon0 - west) / step))
    r_src, c_src = min(max(r_src, 0), H - 1), min(max(c_src, 0), W - 1)
    snapped = False
    if not sea[r_src, c_src]:
        snapped = True
        best = None
        for dr in range(-3, 4):
            for dc in range(-3, 4):
                r, c = r_src + dr, c_src + dc
                if 0 <= r < H and 0 <= c < W and sea[r, c]:
                    d = dr * dr + dc * dc
                    if best is None or d < best[0]:
                        best = (d, r, c)
        if best is None:
            return None, None
        r_src, c_src = best[1], best[2]
    lat_rows = south + np.arange(H) * step
    dy = 111_195.0 * step                      # m
    dx_row = 111_195.0 * step * np.cos(np.radians(lat_rows))
    T = np.full((H, W), np.inf, dtype=np.float64)
    T[r_src, c_src] = 0.0
    heap = [(0.0, r_src, c_src)]
    limit = max_min * 60.0
    nbrs = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]
    while heap:
        t, r, c = heapq.heappop(heap)
        if t > T[r, c] or t > limit:
            continue
        v0 = speed[r, c]
        for dr, dc in nbrs:
            nr, nc = r + dr, c + dc
            if nr < 0 or nr >= H or nc < 0 or nc >= W:
                continue
            v1 = speed[nr, nc]
            if v1 <= 0:
                continue
            dxm = 0.5 * (dx_row[r] + dx_row[nr])
            dist = math.hypot(dr * dy, dc * dxm)
            v = 2.0 * v0 * v1 / (v0 + v1) if v0 > 0 else v1     # 두 셀 속도의 조화평균
            nt = t + dist / v
            if nt < T[nr, nc]:
                T[nr, nc] = nt
                heapq.heappush(heap, (nt, nr, nc))
    return T / 60.0, (r_src, c_src, snapped)


def station_etas(T, south, west, step=STEP_DEG, stations=STATIONS, radius=2):
    """지점마다 반경 radius 셀 안에서 가장 빠른 바다 셀의 도달시간. 닿지 않으면 null."""
    H, W = T.shape
    out = []
    for iso, name, lat, lon in stations:
        r = int(round((lat - south) / step)); c = int(round(((lon - west) % 360) / step))
        best = None
        if 0 <= r < H and 0 <= c < W:
            for dr in range(-radius, radius + 1):
                for dc in range(-radius, radius + 1):
                    rr, cc = r + dr, c + dc
                    if 0 <= rr < H and 0 <= cc < W and np.isfinite(T[rr, cc]):
                        if best is None or T[rr, cc] < best:
                            best = float(T[rr, cc])
        out.append({"iso": iso, "name": name, "lat": lat, "lon": lon, "etaMin": round(best) if best is not None else None,
                    "note": None if best is not None else ("계산 창 밖" if not (0 <= r < H and 0 <= c < W) else "격자에서 닿지 않음(내만·해협 해상도 한계)")})
    return out


def contours(T, south, west, step, levels, coarse=CONTOUR_STEP_DEG):
    """마칭 스퀘어 — 등시선 선분 [[lat,lon],[lat,lon]]. 파일 크기 때문에 coarse 해상도로 줄인 판에서 뽑는다."""
    f = max(1, int(round(coarse / step)))
    R = T[::f, ::f]
    H, W = R.shape
    st = step * f
    out = {}
    for L in levels:
        segs = []
        for i in range(H - 1):
            for j in range(W - 1):
                a, b, c, d = R[i, j], R[i, j + 1], R[i + 1, j + 1], R[i + 1, j]   # 좌하, 우하, 우상, 좌상
                if not (np.isfinite(a) and np.isfinite(b) and np.isfinite(c) and np.isfinite(d)):
                    continue
                idx = (a >= L) | ((b >= L) << 1) | ((c >= L) << 2) | ((d >= L) << 3)
                if idx in (0, 15):
                    continue
                lat_i, lon_j = south + i * st, west + j * st
                def P(v0, v1, p0, p1):
                    t = 0.5 if v1 == v0 else (L - v0) / (v1 - v0)
                    return [round(p0[0] + (p1[0] - p0[0]) * t, 2), round(p0[1] + (p1[1] - p0[1]) * t, 2)]
                pa, pb, pc, pd = (lat_i, lon_j), (lat_i, lon_j + st), (lat_i + st, lon_j + st), (lat_i + st, lon_j)
                e_bottom = lambda: P(a, b, pa, pb); e_right = lambda: P(b, c, pb, pc); e_top = lambda: P(d, c, pd, pc); e_left = lambda: P(a, d, pa, pd)
                table = {1: (e_left, e_bottom), 2: (e_bottom, e_right), 3: (e_left, e_right), 4: (e_right, e_top), 5: (e_left, e_top, e_bottom, e_right),
                         6: (e_bottom, e_top), 7: (e_left, e_top), 8: (e_top, e_left), 9: (e_bottom, e_top), 10: (e_bottom, e_left, e_top, e_right),
                         11: (e_right, e_top), 12: (e_right, e_left), 13: (e_bottom, e_right), 14: (e_left, e_bottom)}
                es = table[int(idx)]
                for k in range(0, len(es), 2):
                    p, q = es[k](), es[k + 1]()
                    p[1] = ((p[1] + 180) % 360) - 180; q[1] = ((q[1] + 180) % 360) - 180
                    segs.append([p, q])
        if segs:
            out[str(L)] = segs
    return out


# ── PTWC 게시문 ETA 대조 ─────────────────────────────────────────
ETA_ROW = re.compile(r"^\s*([A-Z][A-Z .'()/-]{2,40}?)\s{2,}(?:([\d.]+)([NS])\s+([\d.]+)([EW])\s+)?(\d{4})Z?\s+(\d{1,2})\s+([A-Z]{3})", re.M)
MONTHS = {m: i for i, m in enumerate(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], 1)}


def parse_bulletin_eta(text, origin):
    """'ESTIMATED ... ARRIVAL' 표에서 지점·시각을 읽어 진원 시각 기준 분으로 바꾼다. 표가 없으면 []."""
    if not text or "ARRIVAL" not in text.upper():
        return []
    sect = text[text.upper().index("ARRIVAL"):]
    out = []
    for m in ETA_ROW.finditer(sect[:20000]):
        place, la, ns, lo, ew, hhmm, dd, mon = m.groups()
        if mon not in MONTHS:
            continue
        try:
            at = datetime(origin.year, MONTHS[mon], int(dd), int(hhmm[:2]), int(hhmm[2:]), tzinfo=timezone.utc)
        except ValueError:
            continue
        if at < origin - timedelta(days=2):
            at = at.replace(year=origin.year + 1)
        rec = {"place": place.strip(), "etaUtc": at.strftime("%Y-%m-%dT%H:%MZ"), "etaMin": round((at - origin).total_seconds() / 60)}
        if la and lo:
            rec["lat"] = float(la) * (1 if ns == "N" else -1); rec["lon"] = float(lo) * (1 if ew == "E" else -1)
        out.append(rec)
    return out


def dist_km(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(x))


def compare_official(ours, official):
    """게시문 지점 좌표에서 150 km 안 우리 지점과 짝지어 차이(분). 좌표 없는 행은 대조하지 않는다."""
    rows = []
    for o in official:
        if "lat" not in o:
            continue
        near = [(dist_km(o["lat"], o["lon"], s["lat"], s["lon"]), s) for s in ours if s["etaMin"] is not None]
        near = [x for x in near if x[0] <= 150]
        if not near:
            continue
        d, s = min(near, key=lambda x: x[0])
        rows.append({"official": o["place"], "ours": s["name"], "km": round(d), "officialMin": o["etaMin"], "oursMin": s["etaMin"], "diffMin": s["etaMin"] - o["etaMin"]})
    return rows


# ── 사건 고르기 ───────────────────────────────────────────────
def fetch_json(url, timeout=25):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_text(url, timeout=25):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def is_sea(grid01, lat, lon, radius=1):
    rows, cols = grid01.shape
    r = int((lat + 90) / 0.1); c = int(((lon + 180) % 360) / 0.1)
    for dr in range(-radius, radius + 1):
        for dc in range(-radius, radius + 1):
            rr, cc = r + dr, (c + dc) % cols
            if 0 <= rr < rows and grid01[rr, cc] < 0:
                return True
    return False


def pick_events(features, grid01, min_mag=MIN_MAG, max_depth=MAX_DEPTH_KM):
    out = []
    for f in features or []:
        p, g = f.get("properties") or {}, (f.get("geometry") or {}).get("coordinates") or []
        if len(g) < 3 or p.get("mag") is None or p["mag"] < min_mag or (g[2] or 0) > max_depth:
            continue
        if not is_sea(grid01, g[1], g[0]):
            continue
        out.append({"id": f.get("id"), "mag": p["mag"], "place": p.get("place"), "timeMs": p.get("time"), "lat": g[1], "lon": g[0], "depthKm": g[2],
                    "usgsTsunamiFlag": bool(p.get("tsunami")), "url": p.get("url")})
    return out


def match_alert(ev, tsunami_doc):
    best = None
    for a in (tsunami_doc or {}).get("alerts") or []:
        if a.get("lat") is None or a.get("updated") is None:
            continue
        dt = abs(datetime.fromisoformat(a["updated"].replace("Z", "+00:00")).timestamp() * 1000 - ev["timeMs"])
        d = dist_km(ev["lat"], ev["lon"], a["lat"], a["lon"])
        if d < 500 and dt < 3 * 86400000 and (best is None or d < best[0]):
            best = (d, a)
    return best[1] if best else None


def compute(ev, depth02, tsunami_doc=None, now=None, fetch=fetch_text):
    now = now or datetime.now(timezone.utc)
    origin = datetime.fromtimestamp(ev["timeMs"] / 1000, tz=timezone.utc)
    sub, south, west = window(depth02, ev["lat"], ev["lon"])
    T, src = travel_time(sub, south, west, ev["lat"], ev["lon"])
    if T is None:
        return None
    stations = station_etas(T, south, west)
    iso = contours(T, south, west, STEP_DEG, LEVELS_MIN)
    alert = match_alert(ev, tsunami_doc)
    official = {"matched": False, "etaRows": [], "compare": [], "note": "대응하는 PTWC 발표를 찾지 못함 — 대조 불가"}
    if alert:
        official = {"matched": True, "center": alert.get("center"), "category": alert.get("category"), "bulletin": alert.get("bulletin"), "updated": alert.get("updated"),
                    "etaRows": [], "compare": [], "note": None}
        try:
            rows = parse_bulletin_eta(fetch(alert["bulletin"]), origin) if alert.get("bulletin") else []
            official["etaRows"] = rows[:60]
            official["compare"] = compare_official(stations, rows)
            official["note"] = None if rows else "게시문에 도달시각 표가 없음(정보문) — 대조 불가"
        except Exception as e:  # 원문을 못 받으면 대조하지 않는다
            official["note"] = f"게시문 조회 실패 — 대조 불가 ({str(e)[:80]})"
    reach = [s for s in stations if s["etaMin"] is not None]
    snapped = bool(src[2]) if src and len(src) > 2 else False
    return {
        "schema": "earthus.tsunami-eta.v1", "badge": "SIMULATION_ONLY", "modelVersion": MODEL_VERSION,
        "event": {"usgsId": ev["id"], "mag": ev["mag"], "place": ev["place"], "originUtc": origin.strftime("%Y-%m-%dT%H:%M:%SZ"),
                  "lat": ev["lat"], "lon": ev["lon"], "depthKm": ev["depthKm"], "usgsTsunamiFlag": ev.get("usgsTsunamiFlag"), "url": ev.get("url"),
                  "sourceOnLand": snapped, "sourceNote": "진원이 육지 셀 — 가장 가까운 바다 셀에서 시작한 가정(쓰나미 발생 여부를 뜻하지 않음)" if snapped else None},
        "time": {"occurredAt": origin.strftime("%Y-%m-%dT%H:%M:%SZ"), "computedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "retrievedAt": None},
        "method": {"ko": "장파 근사 c=√(g·h) · GEBCO 0.2° 판 위 8방향 Dijkstra · 진원은 점 · 등시선은 0.5° 판",
                   "limits": ["파고·침수·피해가 아니다 — 첫 파가 닿을 수 있는 시각의 물리 근사", "0.2° 격자라 해협·내만은 어긋날 수 있다",
                              "진원을 점으로 본다 — M8+ 단층 길이를 무시해 가까운 연안은 실제보다 늦게 나온다", "8방향 경로는 직선보다 최대 약 8% 길다",
                              "공식 경보·행동 지시는 PTWC/JMA/기상청 원문만 따른다"],
                   "gridSha256": (_manifest or {}).get("output", {}).get("sha256") if _manifest else None},
        "stations": stations, "reachedCount": len(reach), "nearestKorea": min((s for s in reach if s["iso"] == "KOR"), key=lambda s: s["etaMin"], default=None),
        "isochronesMin": iso, "official": official,
    }


def index_entry(doc):
    e = doc["event"]
    nk = doc.get("nearestKorea")
    return {"usgsId": e["usgsId"], "mag": e["mag"], "place": e["place"], "originUtc": e["originUtc"], "lat": e["lat"], "lon": e["lon"],
            "key": EVENT_KEY.format(id=e["usgsId"]), "nearestKorea": nk, "officialMatched": doc["official"]["matched"],
            "compareN": len(doc["official"]["compare"]), "computedAt": doc["time"]["computedAt"]}


def put_json(key, obj, cache="no-cache", gz=False):
    """gz=True 면 Content-Encoding: gzip 으로 올린다 — 등시선 때문에 사건 파일이 85~150 KB 인데 gzip 이면 17~21 KB.
    브라우저 fetch 는 알아서 푼다. 색인은 작으니 그대로."""
    body = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode()
    kw = {"Bucket": BUCKET, "Key": key, "ContentType": "application/json; charset=utf-8", "CacheControl": cache}
    if gz:
        import gzip
        body = gzip.compress(body, compresslevel=6)
        kw["ContentEncoding"] = "gzip"
    s3().put_object(Body=body, **kw)


def exists(key):
    try:
        s3().head_object(Bucket=BUCKET, Key=key)
        return True
    except Exception:
        return False


def handler(event=None, context=None):
    event = event or {}
    now = datetime.now(timezone.utc)
    grid01, _ = load_grid()
    start = (now - timedelta(days=int(event.get("days", 10)))).strftime("%Y-%m-%dT%H:%M:%S")
    feats = fetch_json(USGS.format(start=start)).get("features") or []
    events = pick_events(feats, grid01)
    if event.get("usgsId"):
        events = [e for e in events if e["id"] == event["usgsId"]]
    try:
        tsunami = json.loads(s3().get_object(Bucket=BUCKET, Key=TSUNAMI_KEY)["Body"].read().decode("utf-8"))
    except Exception:
        tsunami = None
    depth02 = coarsen(grid01)
    try:
        index = json.loads(s3().get_object(Bucket=BUCKET, Key=INDEX_KEY)["Body"].read().decode("utf-8"))
    except Exception:
        index = {"events": []}
    by_id = {e["usgsId"]: e for e in index.get("events") or []}
    done, skipped = [], []
    for ev in events:
        key = EVENT_KEY.format(id=ev["id"])
        if not event.get("force") and ev["id"] in by_id and exists(key):
            skipped.append(ev["id"])
            continue
        doc = compute(ev, depth02, tsunami, now)
        if not doc:
            continue
        put_json(key, doc, cache="public, max-age=3600", gz=True)
        by_id[ev["id"]] = index_entry(doc)
        done.append(ev["id"])
        print(f"eta {ev['id']} M{ev['mag']} {ev['place']} reached={doc['reachedCount']} korea={doc['nearestKorea']}")
    cutoff = (now - timedelta(days=30)).strftime("%Y-%m-%dT")
    entries = sorted([e for e in by_id.values() if e["originUtc"] >= cutoff], key=lambda e: e["originUtc"], reverse=True)
    put_json(INDEX_KEY, {"schema": "earthus.tsunami-eta-index.v1", "generated": now.strftime("%Y-%m-%dT%H:%M:00Z"), "badge": "SIMULATION_ONLY",
                         "rule": "USGS M6.5+ · 진원 깊이 100 km 이하 · 바다(0.1° 격자 기준) · 최근 10일 · 사건당 한 번 계산",
                         "count": len(entries), "events": entries})
    return {"ok": True, "candidates": len(events), "computed": done, "skipped": len(skipped)}
