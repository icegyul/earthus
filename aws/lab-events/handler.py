# -*- coding: utf-8 -*-
"""LAB 분석 보고서 — 태풍 밖의 현상 8종을 실제 자료로 탐지·추적·검증한다.

받은 지적(2026-09-05)
  "해파리 전조, 오로라 관측 등 보고서 메뉴 모두 보고서가 안 나오고 추적도 안 되고 있어.
   지진 보고서도 없어 — 최소한 구마모토 지진은 나와야지."
  lab-report-index 는 analysis/<현상>-reports.json 을 합칠 뿐, 그 파일을 **만드는 계산기가 없었다.**
  태풍(cyclone-analog)만 세션·보고서를 냈다.

원칙 (cyclone-analog 와 같다)
  · 예보를 만들지 않는다. 기관 발표·관측을 옮기고, 우리 계산은 '추정'이라 부르며 반드시 검증 수치와 같이 낸다.
  · 자료가 없는 현상을 예시로 채우지 않는다. 0건이면 0건이고, 자료원이 없으면 그렇게 적는다.
  · 세션(회차 원문)은 비공개 archive/ 에, 공개 목록에는 요약(detail)만 싣는다.

현상별 자료원 · 우리 계산 · 검증
  earthquake   USGS FDSN(M6+ 전지구, M5+ 한·일·대만) + JMA/KMA(quake-asia) + PTWC(tsunami-intl)
               계산: Reasenberg-Jones 일반형 여진 기대수(M4+, 7일) → 실제 USGS 여진 수와 대조
  aurora       NOAA SWPC Kp 관측·예보 · 계산: 지속성 추정 → 관측 Kp 로 SWPC 예보와 함께 채점
  smoke-ash    VAAC 도쿄 화산재 권고(events/volcanic-ash-vaac) + FIRMS 대형 산불 군집(events/wildfire)
               계산: 산불 화점 수 지속성 추정(24h) → 실제 화점 수와 대조
  air-pollution 에어코리아 시도 평균(wind/korea-air-obs) + 기상청 특보 · 계산: CAMS(Open-Meteo) 24h 예보 → 다음날 실측 대조
  ocean-drift  Argo 플로트 부상 위치(ocean/argo-floats) · 계산: 직전 10일 변위 지속성 → 다음 부상 위치와 대조
  bird-migration 국립생물자원관 위치추적(events/migbird) 과거 이력 — 올해 실시간 자료원 없음(그렇게 적는다)
  marine-bloom OBIS 해파리(Scyphozoa) 출현 기록 + Open-Meteo 해수온 — 전조 지표 집계, 검증 없음(그렇게 적는다)
  space-reentry CelesTrak SATCAT 붕괴일·근지점 · 계산: 근지점 기반 잔여수명 추정 → 실제 붕괴일과 대조
"""
import csv
import io
import json
import math
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ.get("CACHE_BUCKET", "earthus-cache-kr")
REGION = os.environ.get("CACHE_REGION", "us-east-2")
UA = {"User-Agent": "earthus-lab-events/0.1 (+https://earthus.net)"}
STATE_KEY = "archive/lab-events-sessions.json"
s3 = boto3.client("s3", region_name=REGION)

KINDS = ("earthquake", "aurora", "smoke-ash", "air-pollution", "ocean-drift", "bird-migration", "marine-bloom", "space-reentry")
MAX_SESSIONS = 60


# ── 공통 ──────────────────────────────────────────────
def now_utc():
    return datetime.now(timezone.utc)


def stamp(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:00Z") if dt else None


def parse_time(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000 if value > 1e11 else value, tz=timezone.utc)
    text = str(value).strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        pass
    for form in ("%Y%m%d%H%M", "%Y-%m-%d", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(text, form).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return None


def dist_km(a_lat, a_lon, b_lat, b_lon):
    r = math.pi / 180
    d_lat, d_lon = (b_lat - a_lat) * r, (b_lon - a_lon) * r
    h = math.sin(d_lat / 2) ** 2 + math.cos(a_lat * r) * math.cos(b_lat * r) * math.sin(d_lon / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def bearing(a_lat, a_lon, b_lat, b_lon):
    r = math.pi / 180
    y = math.sin((b_lon - a_lon) * r) * math.cos(b_lat * r)
    x = math.cos(a_lat * r) * math.sin(b_lat * r) - math.sin(a_lat * r) * math.cos(b_lat * r) * math.cos((b_lon - a_lon) * r)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


DIRS_KO = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"]


def dir_ko(deg):
    return DIRS_KO[int((deg + 22.5) % 360 // 45)] if deg is not None else None


def fetch_text(url, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def fetch_json(url, timeout=60):
    return json.loads(fetch_text(url, timeout))


def s3_json(key, default=None):
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())
    except Exception:  # noqa: BLE001 - 없거나 못 읽으면 명시적 기본값
        return default


def put_json(key, doc, cache="public, max-age=900"):
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=key, Body=body, ContentType="application/json; charset=utf-8", CacheControl=cache)
    return len(body)


def _num(value):
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def fact(label, value):
    return {"label": label, "value": value}


class Ctx:
    """한 실행 안에서 원자료를 한 번만 받는다."""

    def __init__(self):
        self.cache = {}

    def get(self, name, loader):
        if name not in self.cache:
            try:
                self.cache[name] = loader()
            except Exception as error:  # noqa: BLE001 - 원자료 하나가 죽어도 다른 현상은 돈다
                print(f"  원자료 실패 {name}: {error!r}"[:160])
                self.cache[name] = None
        return self.cache[name]


def new_session(kind, sid, title, now, facts=None, status="DETECTED"):
    return {"id": f"{kind}:{sid}", "kind": kind, "title": title, "status": status, "detectedAt": stamp(now),
            "lastSeen": stamp(now), "endedAt": None, "snapshots": [], "events": [{"status": status, "at": stamp(now)}],
            "facts": facts or {}, "scores": []}


def set_status(session, status, now):
    if session["status"] != status:
        session["status"] = status
        session["events"].append({"status": status, "at": stamp(now)})


def add_snapshot(session, snap, now, keep=120):
    snap["at"] = stamp(now)
    session.setdefault("snapshots", []).append(snap)
    session["snapshots"] = session["snapshots"][-keep:]
    session["lastSeen"] = stamp(now)


def score_rows(rows):
    """예측-실제 쌍의 평균 절대 오차. rows: [{forecast, actual}]"""
    pairs = [(r["forecast"], r["actual"]) for r in rows if r.get("forecast") is not None and r.get("actual") is not None]
    if not pairs:
        return None
    return {"n": len(pairs), "meanAbsError": round(sum(abs(f - a) for f, a in pairs) / len(pairs), 2)}


# ══════════════════════════════════════════════════════════════
# 1. 지진
# ══════════════════════════════════════════════════════════════
USGS = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&"
ASIA_BOX = (20.0, 50.0, 118.0, 150.0)   # 한국·일본·대만 — M5+ 도 추적


def _usgs(params):
    return fetch_json(USGS + urllib.parse.urlencode(params), 90).get("features") or []


def eq_discover(now, ctx):
    since = (now - timedelta(days=45)).strftime("%Y-%m-%d")
    feats = ctx.get("usgs_global", lambda: _usgs({"minmagnitude": 6, "starttime": since, "orderby": "time"})) or []
    feats += ctx.get("usgs_asia", lambda: _usgs({"minmagnitude": 5, "starttime": since, "orderby": "time",
                                                  "minlatitude": ASIA_BOX[0], "maxlatitude": ASIA_BOX[1],
                                                  "minlongitude": ASIA_BOX[2], "maxlongitude": ASIA_BOX[3]})) or []
    out = {}
    for f in feats:
        p, g = f.get("properties") or {}, (f.get("geometry") or {}).get("coordinates") or [None, None, None]
        if not f.get("id") or p.get("mag") is None:
            continue
        out[f["id"]] = {"id": f["id"], "mag": p["mag"], "place": p.get("place"), "time": stamp(parse_time(p.get("time"))),
                        "lat": g[1], "lon": g[0], "depthKm": g[2], "tsunami": bool(p.get("tsunami")),
                        "usgsStatus": p.get("status"), "url": p.get("url"), "title": f"M{p['mag']:.1f} {p.get('place') or ''}".strip()}
    return out


def rj_expected(mag, m_min, t1_days, t2_days, a=-1.67, b=0.91, p=1.08, c=0.05):
    """Reasenberg & Jones (1989) 일반형: t1~t2 일 사이 M≥m_min 여진 기대수. 캘리포니아 일반 매개변수 —
    지역 보정 없는 **거친 추정**이며 화면에 그렇게 적는다."""
    rate = 10 ** (a + b * (mag - m_min))
    integral = ((t2_days + c) ** (1 - p) - (t1_days + c) ** (1 - p)) / (1 - p)
    return round(rate * integral, 1)


def eq_snapshot(session, now, ctx, current):
    f = session["facts"]
    main_t = parse_time(f["time"])
    days = (now - main_t).total_seconds() / 86400 if main_t else 0
    after = []
    try:
        after = _usgs({"starttime": (main_t + timedelta(seconds=1)).strftime("%Y-%m-%dT%H:%M:%S"), "latitude": f["lat"],
                       "longitude": f["lon"], "maxradiuskm": 100, "minmagnitude": 3, "orderby": "magnitude", "limit": 400})
    except Exception as error:  # noqa: BLE001
        print(f"  여진 조회 실패 {session['id']}: {error!r}"[:120])
    a_rows = []
    for a in after:
        p = a.get("properties") or {}
        t = parse_time(p.get("time"))
        # 본진 자신과 그 직후 60초 안의 중복 해는 여진이 아니다 (USGS 응답이 본진을 포함한다 — 실측)
        if p.get("mag") is None or not t or a.get("id") == f["id"] or (main_t and (t - main_t).total_seconds() < 60):
            continue
        a_rows.append({"mag": p["mag"], "time": stamp(t), "place": p.get("place")})
    m4 = [a for a in a_rows if a["mag"] >= 4]
    # 본진 뒤 경과 구간별 M4+ 여진 수 — 지난 사건도 기대수와 바로 대조하려고 회차마다 센다
    windows = []
    for t1, t2 in ((0, 1), (1, 7), (7, 30)):
        if days >= t2:
            n = sum(1 for a in m4 if main_t and t1 <= (parse_time(a["time"]) - main_t).total_seconds() / 86400 < t2)
            windows.append({"t1": t1, "t2": t2, "actual": n, "expected": rj_expected(f["mag"], 4, t1 if t1 > 0 else 0.01, t2)})
    # 우리 계산: 지금부터 7일 동안 M4+ 여진 기대수 — 다음 회차들이 실제 수로 채점한다
    forecast = {"from": stamp(now), "to": stamp(now + timedelta(days=7)), "mMin": 4,
                "expected": rj_expected(f["mag"], 4, max(days, 0.01), max(days, 0.01) + 7)} if days < 30 else None
    tsu = [al for al in ((ctx.get("tsunami", lambda: s3_json("events/tsunami-intl.json", {})) or {}).get("alerts") or [])
           if _num(al.get("lat")) is not None and dist_km(f["lat"], f["lon"], al["lat"], al["lon"]) < 400
           and parse_time(al.get("updated")) and abs((parse_time(al["updated"]) - main_t).total_seconds()) < 2 * 86400]
    asia = [q for q in ((ctx.get("quake_asia", lambda: s3_json("events/quake-asia.json", {})) or {}).get("quakes") or [])
            if _num(q.get("lat")) is not None and dist_km(f["lat"], f["lon"], q["lat"], q["lon"]) < 120
            and parse_time(q.get("at")) and abs((parse_time(q["at"]) - main_t).total_seconds()) < 3 * 86400]
    return {"mag": current.get("mag", f["mag"]), "depthKm": current.get("depthKm", f.get("depthKm")), "usgsStatus": current.get("usgsStatus"),
            "aftershockN": len(a_rows), "aftershockM4": len(m4), "largest": a_rows[0] if a_rows else None,
            "recent": sorted(a_rows, key=lambda x: x["time"] or "", reverse=True)[:8], "forecast": forecast, "windows": windows,
            "tsunami": [{"center": t.get("center"), "category": t.get("category"), "updated": t.get("updated"), "url": t.get("bulletin")} for t in tsu[:4]],
            "agencies": [{"src": q.get("src"), "srcKo": q.get("srcKo"), "kind": q.get("kind"), "at": q.get("at"), "mag": q.get("mag"),
                          "intensity": q.get("intensity"), "place": q.get("place"), "placeEn": q.get("placeEn")} for q in asia[:6]],
            "daysSince": round(days, 2)}


def eq_lifecycle(session, now):
    main_t = parse_time(session["facts"]["time"])
    days = (now - main_t).total_seconds() / 86400 if main_t else 0
    last = (session.get("snapshots") or [{}])[-1]
    if days < 7:
        set_status(session, "ACTIVE", now)
    elif days < 14:
        set_status(session, "VERIFYING", now)
        session["endedAt"] = session.get("endedAt") or stamp(main_t + timedelta(days=7))
    elif days < 30 or last.get("usgsStatus") != "reviewed":
        set_status(session, "PRELIMINARY_REPORT", now)
    else:
        set_status(session, "FINAL_REPORT", now)


def eq_scores(session):
    """회차마다 낸 7일 M4+ 기대수를, 그 창이 지난 뒤의 실제 여진 목록으로 채점한다."""
    snaps = session.get("snapshots") or []
    if not snaps:
        return []
    latest = snaps[-1]
    actual_m4 = [parse_time(a["time"]) for a in latest.get("recent", [])]  # 최근 8건뿐 — 전체 수는 aftershockM4
    rows = []
    for s in snaps:
        fc = s.get("forecast")
        if not fc or not parse_time(fc["to"]) or parse_time(fc["to"]) > parse_time(latest["at"]):
            continue
        # 창 안의 실제 M4+ 수 = 창 끝 시점 회차의 누적 M4 − 창 시작 회차의 누적 M4
        end_snap = next((x for x in snaps if parse_time(x["at"]) >= parse_time(fc["to"])), None)
        if not end_snap:
            continue
        actual = max(0, end_snap.get("aftershockM4", 0) - s.get("aftershockM4", 0))
        rows.append({"label": f"{fc['from'][:10]}~{fc['to'][:10]}", "forecast": fc["expected"], "actual": actual})
    # 지난 구간(본진 뒤 0~1일·1~7일·7~30일)은 최신 회차의 여진 목록으로 바로 채점한다
    for w in latest.get("windows") or []:
        rows.append({"label": f"본진 뒤 {w['t1']}~{w['t2']}일", "forecast": w["expected"], "actual": w["actual"]})
    stats = score_rows(rows)
    return [{"agency": "EARTHUS_RJ", "n": stats["n"], "meanAbsError": stats["meanAbsError"], "rows": rows[-8:]}] if stats else []


def eq_detail(session):
    f, snaps = session["facts"], session.get("snapshots") or []
    last = snaps[-1] if snaps else {}
    first_mag, last_mag = f["mag"], last.get("mag", f["mag"])
    timeline = [{"at": f["time"], "text": f"본진 M{first_mag:.1f} · 깊이 {f.get('depthKm') if f.get('depthKm') is not None else '—'} km · {f.get('place') or ''}", "agency": "USGS"}]
    for t in last.get("tsunami") or []:
        timeline.append({"at": t.get("updated"), "text": f"쓰나미 {t.get('category') or ''} 발표 ({t.get('center')})", "agency": t.get("center")})
    for a in (last.get("recent") or [])[:5]:
        timeline.append({"at": a["time"], "text": f"여진 M{a['mag']:.1f} · {a.get('place') or ''}", "agency": "USGS"})
    if last_mag != first_mag:
        timeline.append({"at": last.get("at"), "text": f"USGS 규모 수정 M{first_mag:.1f} → M{last_mag:.1f}", "agency": "USGS"})
    timeline.sort(key=lambda x: x.get("at") or "")
    agencies = [{"agency": q.get("src"), "agencyKo": q.get("srcKo"), "summary": f"{q.get('kind') or ''} · M{q.get('mag')} · 진도 {q.get('intensity') or '—'} · {q.get('place') or ''} ({q.get('at')})"}
                for q in last.get("agencies") or []]
    fc = last.get("forecast")
    scores = session.get("scores") or []
    engine = {"name": "여진 기대수 (Reasenberg-Jones 일반형)",
              "method": "본진 규모와 경과일로 앞으로 7일 M4+ 여진 기대수를 셉니다. 캘리포니아 일반 매개변수라 지역 보정이 없는 거친 추정이며, 회차마다 실제 USGS 여진 수로 채점합니다.",
              "current": f"앞으로 7일 M4+ 여진 기대 {fc['expected']}회" if fc else "본진 30일 경과 — 추정 종료",
              "rows": (scores[0]["rows"] if scores else []), "unit": "회",
              "verdict": f"채점 {scores[0]['n']}구간 · 평균 오차 {scores[0]['meanAbsError']}회" if scores else "본진 뒤 하루가 지나면 첫 구간을 채점합니다."}
    return {"headline": f"M{last_mag:.1f} · 깊이 {last.get('depthKm') if last.get('depthKm') is not None else '—'} km · {f.get('place') or ''}",
            "position": {"lat": f["lat"], "lon": f["lon"]},
            "facts": [fact("발생(UTC)", f["time"]), fact("규모", f"M{last_mag:.1f}" + (f" (처음 M{first_mag:.1f})" if last_mag != first_mag else "")),
                      fact("여진 M3+ / M4+", f"{last.get('aftershockN', 0)} / {last.get('aftershockM4', 0)}건 (100 km 안)"),
                      fact("최대 여진", f"M{last['largest']['mag']:.1f} · {last['largest']['time']}" if last.get("largest") else "없음"),
                      fact("USGS 검토", "검토 완료" if last.get("usgsStatus") == "reviewed" else "자동 산출(미검토)"),
                      fact("쓰나미 발표", f"{len(last.get('tsunami') or [])}건" if last.get("tsunami") else ("USGS 쓰나미 플래그" if f.get("tsunami") else "없음"))],
            "timeline": timeline, "agencies": agencies, "engine": engine,
            "verification": {"rows": [{"source": "EARTHUS 여진 기대수", "n": s["n"], "score": s["meanAbsError"], "unit": "회 평균오차"} for s in scores],
                             "note": "채점 기준은 USGS 여진 목록(100 km, M4+)입니다. 규모·깊이는 USGS 최신값이며 기관마다 다를 수 있습니다."},
            "notes": ["JMA·기상청 발표는 quake-asia 수집분 중 120 km·3일 안의 것만 붙입니다.", "본진 30일 뒤 USGS 검토가 끝나면 최종 보고서가 됩니다."],
            "sourceLinks": [{"label": "USGS 사건 페이지", "url": f.get("url")}] + [{"label": f"PTWC 게시문 {i + 1}", "url": t["url"]} for i, t in enumerate(last.get("tsunami") or []) if t.get("url")]}


# ══════════════════════════════════════════════════════════════
# 2. 오로라 (지자기 폭풍)
# ══════════════════════════════════════════════════════════════
SWPC_FC = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json"
SWPC_OBS = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"


def _swpc(ctx):
    fc = ctx.get("swpc_fc", lambda: fetch_json(SWPC_FC, 30)) or []
    obs = ctx.get("swpc_obs", lambda: fetch_json(SWPC_OBS, 30)) or []
    slots = {}
    # SWPC 는 두 형식을 쓴다 — 헤더 행이 있는 배열의 배열(옛 products) 과 dict 목록(현재). 둘 다 읽는다.
    if fc and isinstance(fc[0], list) and fc[0] and fc[0][0] == "time_tag":
        fc = fc[1:]
    for row in fc:
        if isinstance(row, dict):
            slots[row["time_tag"]] = {"kp": _num(row.get("kp")), "state": row.get("observed"), "scale": row.get("noaa_scale")}
        elif isinstance(row, list) and len(row) >= 3:
            slots[row[0]] = {"kp": _num(row[1]), "state": row[2], "scale": row[3] if len(row) > 3 else None}
    observed = {}
    if obs and isinstance(obs[0], list) and obs[0] and obs[0][0] == "time_tag":
        obs = obs[1:]
    for row in obs:
        if isinstance(row, dict):
            observed[row["time_tag"]] = _num(row.get("Kp") or row.get("kp"))
        elif isinstance(row, list) and len(row) >= 2:
            observed[row[0]] = _num(row[1])
    return slots, observed


def g_scale(kp):
    return "G5" if kp >= 9 else "G4" if kp >= 8 else "G3" if kp >= 7 else "G2" if kp >= 6 else "G1" if kp >= 5 else "—"


def aurora_lat(kp):
    """오로라 남쪽 경계의 대략적 지자기 위도. Kp5≈56°, Kp7≈50°, Kp9≈45° (NOAA 일반 안내). 거친 값."""
    return round(66 - 2.3 * kp, 0)


def aurora_discover(now, ctx):
    """Kp≥5 슬롯이 있는 날은 폭풍 세션, 그 밖에는 주간 감시 세션 하나 — 조용한 주에도 SWPC 예보를
    관측으로 계속 채점해야 '조용할 때 맞는지'도 남는다. 빈 목록은 추적을 안 하는 것과 구별이 안 됐다."""
    slots, observed = _swpc(ctx)
    week = now.strftime("%G-W%V")
    out = {week: {"id": week, "maxKp": max([s["kp"] for s in slots.values() if s["kp"] is not None] + [0]),
                  "title": f"지자기 활동 주간 감시 · {week}", "firstSlot": None, "weekly": True}}
    for tag, s in slots.items():
        if s["kp"] is None or s["kp"] < 5:
            continue
        day = tag[:10]
        cur = out.setdefault(day, {"id": day, "maxKp": 0, "title": None, "firstSlot": tag})
        cur["maxKp"] = max(cur["maxKp"], s["kp"])
        cur["title"] = f"지자기 폭풍 {g_scale(cur['maxKp'])} · {day} (최대 Kp {cur['maxKp']})"
    for tag, kp in observed.items():
        if kp is not None and kp >= 5:
            day = tag[:10]
            cur = out.setdefault(day, {"id": day, "maxKp": 0, "title": None, "firstSlot": tag})
            cur["maxKp"] = max(cur["maxKp"], kp)
            cur["title"] = f"지자기 폭풍 {g_scale(cur['maxKp'])} · {day} (최대 Kp {cur['maxKp']})"
    return out


def aurora_snapshot(session, now, ctx, current):
    slots, observed = _swpc(ctx)
    day = session["facts"]["id"]
    rows = []
    if session["facts"].get("weekly"):
        start = datetime.strptime(day + "-1", "%G-W%V-%u").replace(tzinfo=timezone.utc)
        lo, hi = start.strftime("%Y-%m-%d"), (start + timedelta(days=7)).strftime("%Y-%m-%d")
    else:
        lo, hi = day, (parse_time(day) + timedelta(days=1)).strftime("%Y-%m-%d")
    for tag in sorted(set(list(slots) + list(observed))):
        if not (lo <= tag[:10] <= hi):
            continue
        rows.append({"slot": tag, "swpc": (slots.get(tag) or {}).get("kp"), "state": (slots.get(tag) or {}).get("state"),
                     "observed": observed.get(tag) if tag in observed else ((slots.get(tag) or {}).get("kp") if (slots.get(tag) or {}).get("state") == "observed" else None)})
    recent = [kp for tag, kp in sorted(observed.items())[-8:] if kp is not None]
    persistence = round(max(recent), 2) if recent else None   # 우리 계산: 최근 24시간 최대 Kp 가 이어진다는 지속성 추정
    return {"rows": rows, "persistence": persistence, "maxForecast": max((r["swpc"] for r in rows if r["swpc"] is not None), default=None),
            "maxObserved": max((r["observed"] for r in rows if r["observed"] is not None), default=None)}


def aurora_lifecycle(session, now):
    if session["facts"].get("weekly"):
        start = datetime.strptime(session["facts"]["id"] + "-1", "%G-W%V-%u").replace(tzinfo=timezone.utc)
        if now < start + timedelta(days=7):
            set_status(session, "ACTIVE", now)
        else:
            session["endedAt"] = session.get("endedAt") or stamp(start + timedelta(days=7))
            set_status(session, "FINAL_REPORT" if now > start + timedelta(days=9) else "VERIFYING", now)
        return
    day = parse_time(session["facts"]["id"])
    last = (session.get("snapshots") or [{}])[-1]
    rows = last.get("rows") or []
    all_observed = rows and all(r.get("observed") is not None for r in rows)
    if now < day + timedelta(days=2):
        set_status(session, "ACTIVE", now)
    elif all_observed or now > day + timedelta(days=4):
        session["endedAt"] = session.get("endedAt") or stamp(day + timedelta(days=2))
        set_status(session, "FINAL_REPORT", now)
    else:
        set_status(session, "VERIFYING", now)


def aurora_scores(session):
    snaps = session.get("snapshots") or []
    if not snaps:
        return []
    latest = snaps[-1]
    obs = {r["slot"]: r["observed"] for r in latest.get("rows") or [] if r.get("observed") is not None}
    swpc_rows, ours_rows, seen = [], [], set()
    for s in snaps:
        for r in s.get("rows") or []:
            slot = r["slot"]
            if slot not in obs or r.get("state") == "observed" or parse_time(slot) <= parse_time(s["at"]):
                continue
            key = (slot, s["at"][:13])
            if key in seen:
                continue
            seen.add(key)
            if r.get("swpc") is not None:
                swpc_rows.append({"label": slot, "forecast": r["swpc"], "actual": obs[slot]})
            if s.get("persistence") is not None:
                ours_rows.append({"label": slot, "forecast": s["persistence"], "actual": obs[slot]})
    out = []
    for agency, rows in (("SWPC", swpc_rows), ("EARTHUS_PERSISTENCE", ours_rows)):
        st = score_rows(rows)
        if st:
            hit = sum((r["forecast"] >= 5) == (r["actual"] >= 5) for r in rows)
            out.append({"agency": agency, "n": st["n"], "meanAbsError": st["meanAbsError"], "g1Hit": hit, "rows": rows[-8:]})
    return out


def aurora_detail(session):
    last = (session.get("snapshots") or [{}])[-1]
    max_fc, max_obs = last.get("maxForecast"), last.get("maxObserved")
    peak = max_obs if max_obs is not None else max_fc
    scores = {s["agency"]: s for s in session.get("scores") or []}
    lat = aurora_lat(peak) if peak else None
    kr = "한국(지자기 위도 약 30°)에서는 Kp 9 급에서만 북쪽 지평선 붉은 빛 가능성 — 이번 수준으로는 보이지 않습니다." if (peak or 0) < 8.5 else "Kp 9 급 — 강원·경기 북부 북쪽 하늘에서 붉은 오로라 보고 가능성이 있습니다(관측 조건 별도)."
    timeline = [{"at": r["slot"], "text": f"SWPC 예보 Kp {r['swpc']}" + (f" → 관측 {r['observed']}" if r.get("observed") is not None else ""), "agency": "SWPC"}
                for r in (last.get("rows") or []) if r.get("swpc") is not None or r.get("observed") is not None]
    ours = scores.get("EARTHUS_PERSISTENCE")
    return {"headline": f"{g_scale(peak or 0)} · 최대 Kp {peak if peak is not None else '—'}" + (" (관측)" if max_obs is not None else " (예보)"),
            "facts": [fact("NOAA 규모", g_scale(peak or 0)), fact("최대 예보 Kp", max_fc if max_fc is not None else "—"), fact("최대 관측 Kp", max_obs if max_obs is not None else "아직 없음"),
                      fact("오로라 남쪽 경계(대략)", f"지자기 위도 {lat:.0f}°" if lat else "—"), fact("한국 가시성", kr)],
            "timeline": timeline, "agencies": [{"agency": "SWPC", "agencyKo": "NOAA 우주기상예보센터", "summary": "3시간 Kp 예보·관측 (products/noaa-planetary-k-index-forecast)"}],
            "engine": {"name": "지속성 추정 (최근 24시간 최대 Kp 유지)", "method": "회차마다 최근 24시간 관측 최대 Kp 가 다음 3시간 슬롯에도 이어진다고 두고, 관측이 들어오면 SWPC 예보와 같은 슬롯으로 채점합니다. 태양풍 입력이 없는 기준선입니다.",
                       "current": f"현재 지속성 추정 Kp {last.get('persistence')}" if last.get("persistence") is not None else "관측 없음",
                       "rows": ours["rows"] if ours else [], "unit": "Kp",
                       "verdict": (f"EARTHUS 평균오차 {ours['meanAbsError']} · SWPC {scores['SWPC']['meanAbsError']} (n={ours['n']})" if ours and scores.get("SWPC") else "관측 슬롯이 들어오면 채점합니다.")},
            "verification": {"rows": [{"source": "SWPC 예보" if a == "SWPC" else "EARTHUS 지속성", "n": s["n"], "score": s["meanAbsError"], "unit": f"Kp 평균오차 · G1 적중 {s['g1Hit']}/{s['n']}"} for a, s in scores.items()],
                             "note": "기준은 SWPC 관측 Kp 입니다. 예보 슬롯은 발표 시각 이후의 것만 셉니다."},
            "notes": ["오로라 가시 경계는 Kp 로 본 대략값이며 구름·달·광공해는 별도입니다."],
            "sourceLinks": [{"label": "SWPC 3일 예보", "url": "https://www.swpc.noaa.gov/products/3-day-forecast"}]}


# ══════════════════════════════════════════════════════════════
# 3. 산불 연기·화산재
# ══════════════════════════════════════════════════════════════
def smoke_discover(now, ctx):
    out = {}
    vaac = ctx.get("vaac", lambda: s3_json("events/volcanic-ash-vaac.json", {})) or {}
    by_volcano = {}
    for adv in vaac.get("advisories") or []:
        t = parse_time(adv.get("issuedAt"))
        if not t or now - t > timedelta(days=10):
            continue
        by_volcano.setdefault(adv.get("volcanoNumber") or adv.get("volcano"), []).append(adv)
    for vn, advs in by_volcano.items():
        advs.sort(key=lambda a: a.get("issuedAt") or "")
        first = advs[0]
        sid = f"vaac-{vn}-{(first.get('issuedAt') or '')[:10]}"
        out[sid] = {"id": sid, "type": "vaac", "volcano": first.get("volcano"), "volcanoNumber": vn, "lat": (first.get("position") or {}).get("lat"),
                    "lon": (first.get("position") or {}).get("lon"), "area": first.get("area"), "firstIssuedAt": first.get("issuedAt"),
                    "title": f"화산재 권고 · {first.get('volcano')} ({len(advs)}건)"}
    fires = ctx.get("wildfire", lambda: s3_json("events/wildfire.json", {})) or {}
    # 대형 산불은 FRP 상위 20건만 — 60건이 다 산불이면 화산재 권고가 목록에서 밀려난다 (첫 실행에서 실측)
    big = sorted([x for x in fires.get("items") or [] if (x.get("frp") or 0) >= 4000 or (x.get("count") or 0) >= 120],
                 key=lambda x: -(x.get("frp") or 0))[:20]
    for item in big:
        sid = f"fire-{item.get('fid')}"
        out[sid] = {"id": sid, "type": "fire", "fid": item.get("fid"), "lat": item.get("lat"), "lon": item.get("lon"), "firstSeen": item.get("firstSeen"),
                    "title": f"대형 산불 {item.get('fid')} · {abs(item['lat']):.1f}°{'N' if item['lat'] >= 0 else 'S'} {abs(item['lon']):.1f}°{'E' if item['lon'] >= 0 else 'W'}"}
    return out


def smoke_snapshot(session, now, ctx, current):
    f = session["facts"]
    if f["type"] == "vaac":
        vaac = ctx.get("vaac", lambda: s3_json("events/volcanic-ash-vaac.json", {})) or {}
        advs = sorted([a for a in vaac.get("advisories") or [] if (a.get("volcanoNumber") or a.get("volcano")) == f["volcanoNumber"]],
                      key=lambda a: a.get("issuedAt") or "")
        latest = advs[-1] if advs else {}
        obs = latest.get("observation") or {}
        return {"advisoryN": len(advs), "latestIssuedAt": latest.get("issuedAt"), "observedAt": latest.get("observedAt"), "eruption": latest.get("eruptionDetails"),
                "state": obs.get("state"), "flightLevels": obs.get("flightLevels"), "movement": obs.get("movement"), "description": (obs.get("description") or "")[:200],
                "forecasts": [{"leadHours": x.get("leadHours"), "validAt": x.get("validAt"), "description": (x.get("description") or "")[:160]} for x in latest.get("forecasts") or []][:3],
                "history": [{"issuedAt": a.get("issuedAt"), "state": (a.get("observation") or {}).get("state"), "eruption": (a.get("eruptionDetails") or "")[:80]} for a in advs[-10:]]}
    fires = ctx.get("wildfire", lambda: s3_json("events/wildfire.json", {})) or {}
    item = next((x for x in fires.get("items") or [] if x.get("fid") == f["fid"]), None)
    prev = (session.get("snapshots") or [{}])[-1]
    count = (item or {}).get("count")
    growth = None
    if item and prev.get("count") and prev.get("at"):
        hours = (now - parse_time(prev["at"])).total_seconds() / 3600
        if hours >= 1:
            growth = (count - prev["count"]) / hours
    # 우리 계산: 지금 화점 수와 최근 증가율로 24시간 뒤 화점 수를 추정 — 다음날 실제 화점 수로 채점
    forecast = {"to": stamp(now + timedelta(hours=24)), "count": max(0, round(count + (growth or 0) * 24))} if count is not None else None
    return {"present": item is not None, "count": count, "frp": (item or {}).get("frp"), "peakFrp": (item or {}).get("peakFrp"), "spanKm": (item or {}).get("spanKm"),
            "movedKm": (item or {}).get("movedKm"), "lastSeen": (item or {}).get("lastSeen"), "growthPerHour": round(growth, 2) if growth is not None else None,
            "forecast": forecast, "lat": (item or {}).get("lat"), "lon": (item or {}).get("lon")}


def smoke_lifecycle(session, now):
    last = (session.get("snapshots") or [{}])[-1]
    seen = parse_time(last.get("latestIssuedAt") or last.get("lastSeen"))
    if session["facts"]["type"] == "fire" and not last.get("present"):
        seen = parse_time(session.get("lastSeen"))
    gap = (now - seen) if seen else timedelta(days=99)
    if gap < timedelta(hours=36) and (session["facts"]["type"] == "vaac" or last.get("present")):
        set_status(session, "ACTIVE", now)
    elif gap < timedelta(days=3):
        session["endedAt"] = session.get("endedAt") or stamp(seen)
        set_status(session, "VERIFYING", now)
    else:
        session["endedAt"] = session.get("endedAt") or stamp(seen)
        set_status(session, "FINAL_REPORT", now)


def smoke_scores(session):
    if session["facts"]["type"] != "fire":
        return []
    snaps = session.get("snapshots") or []
    rows = []
    for s in snaps:
        fc = s.get("forecast")
        if not fc:
            continue
        target = parse_time(fc["to"])
        end = next((x for x in snaps if parse_time(x["at"]) >= target), None)
        if end and end.get("count") is not None:
            rows.append({"label": fc["to"][:13], "forecast": fc["count"], "actual": end["count"]})
    st = score_rows(rows)
    return [{"agency": "EARTHUS_GROWTH", "n": st["n"], "meanAbsError": st["meanAbsError"], "rows": rows[-6:]}] if st else []


def smoke_detail(session):
    f, snaps = session["facts"], session.get("snapshots") or []
    last = snaps[-1] if snaps else {}
    if f["type"] == "vaac":
        timeline = [{"at": h["issuedAt"], "text": f"권고 · 관측 {h.get('state') or '—'} · {h.get('eruption') or ''}", "agency": "VAAC TOKYO"} for h in last.get("history") or []]
        return {"headline": f"{f['volcano']} · 최신 관측 {last.get('state') or '—'} · 권고 {last.get('advisoryN', 0)}건", "position": {"lat": f["lat"], "lon": f["lon"]},
                "facts": [fact("화산", f"{f['volcano']} ({f.get('area')})"), fact("최신 권고", last.get("latestIssuedAt") or "—"), fact("분화 정보", last.get("eruption") or "—"),
                          fact("재구름 관측", f"{last.get('state') or '—'} · {last.get('flightLevels') or ''} · {last.get('movement') or ''}"),
                          fact("VAAC 전망", " / ".join(f"+{x['leadHours']}h {x['description']}" for x in last.get("forecasts") or []) or "—")],
                "timeline": timeline, "agencies": [{"agency": "VAAC", "agencyKo": "도쿄 항공화산재정보센터(JMA)", "summary": last.get("description") or ""}],
                "engine": None, "verification": {"rows": [], "note": "화산재는 VAAC 권고를 옮길 뿐 우리 추정을 내지 않습니다."},
                "notes": ["권고문의 재구름 위치·전망은 항공용이며 지상 강회 예보가 아닙니다."], "sourceLinks": [{"label": "VAAC Tokyo", "url": "https://ds.data.jma.go.jp/svd/vaac/data/"}]}
    scores = session.get("scores") or []
    fc = last.get("forecast")
    timeline = [{"at": s["at"], "text": f"화점 {s.get('count')}개 · FRP {s.get('frp')} MW · 이동 {s.get('movedKm')} km", "agency": "FIRMS"} for s in snaps[-8:]]
    return {"headline": f"화점 {last.get('count') if last.get('present') else 0}개 · FRP {last.get('frp') or 0} MW · 범위 {last.get('spanKm') or 0} km", "position": {"lat": f["lat"], "lon": f["lon"]},
            "facts": [fact("최초 탐지", f.get("firstSeen") or "—"), fact("최대 FRP", f"{last.get('peakFrp') or '—'} MW"), fact("최근 증가율", f"{last.get('growthPerHour')} 화점/시간" if last.get("growthPerHour") is not None else "—"),
                      fact("마지막 관측", last.get("lastSeen") or "—")],
            "timeline": timeline, "agencies": [{"agency": "FIRMS", "agencyKo": "NASA FIRMS (VIIRS 375m)", "summary": "위성 열점 군집 — 연기 확산은 별도 자료가 없습니다."}],
            "engine": {"name": "화점 수 지속성 추정(24시간)", "method": "현재 화점 수와 최근 증가율을 24시간 연장합니다. 바람·연료 입력이 없는 기준선이며 다음날 실제 화점 수로 채점합니다.",
                       "current": f"24시간 뒤 화점 {fc['count']}개 추정" if fc else "—", "rows": scores[0]["rows"] if scores else [], "unit": "개",
                       "verdict": f"채점 {scores[0]['n']}회 · 평균 오차 {scores[0]['meanAbsError']}개" if scores else "24시간이 지나면 채점합니다."},
            "verification": {"rows": [{"source": "EARTHUS 화점 추정", "n": s["n"], "score": s["meanAbsError"], "unit": "개 평균오차"} for s in scores], "note": "기준은 FIRMS 다음 회차 화점 수입니다."},
            "notes": ["연기 이동 방향은 아직 계산하지 않습니다(바람장 연결 필요)."], "sourceLinks": [{"label": "NASA FIRMS", "url": "https://firms.modaps.eosdis.nasa.gov/map/"}]}


# ══════════════════════════════════════════════════════════════
# 4. 황사·미세먼지
# ══════════════════════════════════════════════════════════════
CITIES = {"서울": (37.57, 126.98), "부산": (35.18, 129.08), "대구": (35.87, 128.60), "인천": (37.46, 126.71), "광주": (35.16, 126.85), "대전": (36.35, 127.38)}
BAD_PM10, BAD_PM25 = 81, 36   # 에어코리아 '나쁨' 하한


def air_discover(now, ctx):
    obs = ctx.get("air", lambda: s3_json("wind/korea-air-obs.json", {})) or {}
    sido = obs.get("sido") or []
    bad = [s for s in sido if (s.get("pm10") or 0) >= BAD_PM10 or (s.get("pm25") or 0) >= BAD_PM25]
    warn = ctx.get("kmawarn", lambda: s3_json("events/kma-warn.json", {})) or {}
    dust_warn = [w for w in warn.get("active") or [] if "황사" in str(w.get("kind"))]
    day = (parse_time(obs.get("generated")) or now).strftime("%Y-%m-%d")
    kind = "황사" if dust_warn else "미세먼지" if len(bad) >= 3 else "대기질"
    # 나쁨이 없어도 하루 한 세션 — CAMS 24시간 예보를 매일 실측으로 채점해야 '맑은 날도 맞는지'가 남는다
    title = f"{kind} 사례 · {day} (나쁨 시도 {len(bad)}곳)" if kind != "대기질" else f"대기질 일일 감시 · {day} (나쁨 시도 {len(bad)}곳)"
    return {day: {"id": day, "kindKo": kind, "title": title, "badSido": [s["sido"] for s in bad]}}


def air_snapshot(session, now, ctx, current):
    obs = ctx.get("air", lambda: s3_json("wind/korea-air-obs.json", {})) or {}
    warn = ctx.get("kmawarn", lambda: s3_json("events/kma-warn.json", {})) or {}
    sido = [{"sido": s.get("sido"), "pm10": s.get("pm10"), "pm25": s.get("pm25"), "pm10Max": s.get("pm10Max"), "worst": s.get("worstStation")} for s in obs.get("sido") or []]
    forecasts = {}
    for city, (lat, lon) in CITIES.items():
        try:
            j = fetch_json(f"https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lon}&hourly=pm10,pm2_5,dust&forecast_days=2&timezone=UTC", 30)
            h = j.get("hourly") or {}
            target = stamp(now + timedelta(hours=24))[:13]
            idx = next((i for i, t in enumerate(h.get("time") or []) if t[:13] == target), None)
            if idx is not None:
                forecasts[city] = {"pm10": h["pm10"][idx], "pm25": h["pm2_5"][idx], "dust": h["dust"][idx], "validAt": h["time"][idx] + ":00Z"}
        except Exception as error:  # noqa: BLE001
            print(f"  Open-Meteo 대기질 실패 {city}: {error!r}"[:100])
    return {"observedKst": obs.get("observedKst"), "sido": sido, "badN": sum(1 for s in sido if (s.get("pm10") or 0) >= BAD_PM10 or (s.get("pm25") or 0) >= BAD_PM25),
            "dustWarn": [{"region": w.get("region"), "level": w.get("level"), "issuedKst": w.get("issuedKst")} for w in warn.get("active") or [] if "황사" in str(w.get("kind"))][:8],
            "forecast": forecasts}


def air_lifecycle(session, now):
    snaps = session.get("snapshots") or []
    last = snaps[-1] if snaps else {}
    day = parse_time(session["facts"]["id"])
    episode = last.get("badN", 0) >= 3 or last.get("dustWarn")
    if now < day + timedelta(days=1) or episode:
        set_status(session, "ACTIVE", now)
        session["endedAt"] = None
        return
    cleared = next((s["at"] for s in reversed(snaps) if s.get("badN", 0) >= 3 or s.get("dustWarn")), stamp(day + timedelta(days=1)))
    session["endedAt"] = session.get("endedAt") or cleared
    set_status(session, "FINAL_REPORT" if now - parse_time(cleared) > timedelta(hours=48) else "VERIFYING", now)


def air_scores(session):
    snaps = session.get("snapshots") or []
    rows = []
    for s in snaps:
        for city, fc in (s.get("forecast") or {}).items():
            target = parse_time(fc.get("validAt"))
            end = next((x for x in snaps if target and parse_time(x["at"]) >= target), None)
            if not end:
                continue
            sido_name = {"서울": "서울", "부산": "부산", "대구": "대구", "인천": "인천", "광주": "광주", "대전": "대전"}[city]
            actual = next((x.get("pm10") for x in end.get("sido") or [] if x.get("sido") == sido_name), None)
            if actual is not None and fc.get("pm10") is not None:
                rows.append({"label": f"{city} {fc['validAt'][:13]}", "forecast": round(fc["pm10"]), "actual": round(actual)})
    st = score_rows(rows)
    return [{"agency": "CAMS_OPENMETEO", "n": st["n"], "meanAbsError": st["meanAbsError"], "rows": rows[-8:]}] if st else []


def air_detail(session):
    f, snaps = session["facts"], session.get("snapshots") or []
    last = snaps[-1] if snaps else {}
    worst = sorted([s for s in last.get("sido") or [] if s.get("pm10") is not None], key=lambda s: -(s["pm10"] or 0))[:6]
    scores = session.get("scores") or []
    timeline = [{"at": s["at"], "text": f"나쁨 시도 {s.get('badN', 0)}곳 · 황사특보 {len(s.get('dustWarn') or [])}건 (관측 {s.get('observedKst')})", "agency": "에어코리아·기상청"} for s in snaps[-10:]]
    fc = last.get("forecast") or {}
    return {"headline": f"{f['kindKo']} · 나쁨 시도 {last.get('badN', 0)}곳" + (f" · 황사특보 {len(last.get('dustWarn'))}건" if last.get("dustWarn") else ""),
            "facts": [fact("시도별 PM10 상위", " · ".join(f"{s['sido']} {round(s['pm10'])}" for s in worst) or "—"), fact("최악 측정소", ", ".join(f"{s['sido']} {s['worst']}({s['pm10Max']})" for s in worst[:3]) or "—"),
                      fact("황사 특보", ", ".join(f"{w['region']} {w['level']}" for w in last.get("dustWarn") or []) or "없음"), fact("관측 시각(KST)", last.get("observedKst") or "—"),
                      fact("CAMS 24h 뒤 PM10 추정", " · ".join(f"{c} {round(v['pm10'])}" for c, v in fc.items()) or "—")],
            "timeline": timeline, "agencies": [{"agency": "AIRKOREA", "agencyKo": "한국환경공단 에어코리아", "summary": "시도 평균·최악 측정소"}, {"agency": "KMA", "agencyKo": "기상청", "summary": "황사 특보"}],
            "engine": {"name": "CAMS 대기질 24시간 (Open-Meteo 경유)", "method": "회차마다 6개 도시의 24시간 뒤 PM10 모델값을 기록하고, 다음날 에어코리아 시도 평균으로 채점합니다.", "current": " · ".join(f"{c} {round(v['pm10'])}" for c, v in fc.items()) or "—",
                       "rows": scores[0]["rows"] if scores else [], "unit": "μg/m³", "verdict": f"채점 {scores[0]['n']}건 · 평균 오차 {scores[0]['meanAbsError']} μg/m³" if scores else "24시간이 지나면 채점합니다."},
            "verification": {"rows": [{"source": "CAMS(Open-Meteo)", "n": s["n"], "score": s["meanAbsError"], "unit": "μg/m³ 평균오차"} for s in scores], "note": "기준은 에어코리아 시도 평균 PM10 입니다."},
            "notes": ["'나쁨'은 PM10 81 / PM2.5 36 μg/m³ 이상(에어코리아 기준)입니다."], "sourceLinks": [{"label": "에어코리아", "url": "https://www.airkorea.or.kr/"}]}


# ══════════════════════════════════════════════════════════════
# 5. 해류 표류 (Argo)
# ══════════════════════════════════════════════════════════════
def drift_discover(now, ctx):
    doc = ctx.get("argo", lambda: s3_json("ocean/argo-floats.json", {})) or {}
    out = {}
    for fl in doc.get("floats") or []:
        last = fl.get("last") or {}
        if last.get("lat") is None or not (0 <= last["lat"] <= 50 and 105 <= last["lon"] <= 165):
            continue
        sid = str(fl.get("id"))
        out[sid] = {"id": sid, "title": f"Argo {sid} 표류 · {abs(last['lat']):.1f}°N {last['lon']:.1f}°E", "lat": last["lat"], "lon": last["lon"]}
    return dict(sorted(out.items())[:15])


def drift_snapshot(session, now, ctx, current):
    doc = ctx.get("argo", lambda: s3_json("ocean/argo-floats.json", {})) or {}
    fl = next((x for x in doc.get("floats") or [] if str(x.get("id")) == session["facts"]["id"]), None)
    fixes = (fl or {}).get("fixes") or []
    if fl and fl.get("last") and (not fixes or fixes[-1].get("t") != fl["last"].get("t")):
        fixes = fixes + [fl["last"]]
    fixes = fixes[-6:]
    forecast = None
    if len(fixes) >= 2:
        a, b = fixes[-2], fixes[-1]
        dt = (parse_time(b["t"]) - parse_time(a["t"])).total_seconds() / 86400 or 10
        # 우리 계산: 직전 변위 벡터를 다음 부상 주기(같은 일수)만큼 연장
        forecast = {"fromCycle": b.get("c"), "at": stamp(parse_time(b["t"]) + timedelta(days=dt)), "lat": round(b["lat"] + (b["lat"] - a["lat"]), 3),
                    "lon": round(b["lon"] + (b["lon"] - a["lon"]), 3), "speedKmDay": round(dist_km(a["lat"], a["lon"], b["lat"], b["lon"]) / dt, 1),
                    "dirKo": dir_ko(bearing(a["lat"], a["lon"], b["lat"], b["lon"]))}
    return {"present": fl is not None, "fixes": fixes, "last": (fl or {}).get("last"), "forecast": forecast}


def drift_lifecycle(session, now):
    last = (session.get("snapshots") or [{}])[-1]
    seen = parse_time(((last.get("last") or {}).get("t")))
    if last.get("present") and seen and now - seen < timedelta(days=25):
        set_status(session, "ACTIVE", now)
    elif seen and now - seen < timedelta(days=60):
        session["endedAt"] = session.get("endedAt") or stamp(seen)
        set_status(session, "VERIFYING", now)
    else:
        session["endedAt"] = session.get("endedAt") or stamp(seen or now)
        set_status(session, "FINAL_REPORT", now)


def drift_scores(session):
    snaps = session.get("snapshots") or []
    rows, seen = [], set()
    for s in snaps:
        fc = s.get("forecast")
        if not fc or fc.get("fromCycle") in seen:
            continue
        # 그 예측 뒤에 실제로 나타난 다음 부상 위치
        for later in snaps:
            nxt = next((x for x in later.get("fixes") or [] if (x.get("c") or 0) == (fc["fromCycle"] or 0) + 1), None)
            if nxt:
                seen.add(fc["fromCycle"])
                rows.append({"label": f"주기 {nxt.get('c')} · {nxt['t'][:10]}", "forecast": 0, "actual": round(dist_km(fc["lat"], fc["lon"], nxt["lat"], nxt["lon"]), 1)})
                break
    if not rows:
        return []
    return [{"agency": "EARTHUS_PERSISTENCE", "n": len(rows), "meanAbsError": round(sum(r["actual"] for r in rows) / len(rows), 1), "rows": rows[-6:]}]


def drift_detail(session):
    last = (session.get("snapshots") or [{}])[-1]
    fixes, fc = last.get("fixes") or [], last.get("forecast")
    scores = session.get("scores") or []
    timeline = [{"at": x.get("t"), "text": f"부상 주기 {x.get('c')} · {x['lat']:.2f}°, {x['lon']:.2f}°", "agency": "Argo"} for x in fixes]
    return {"headline": (f"최근 이동 {fc['dirKo']} {fc['speedKmDay']} km/일 · 다음 부상 추정 {fc['lat']}°, {fc['lon']}° ({fc['at'][:10]})" if fc else "부상 기록 1개 — 방향 미산출"),
            "position": {"lat": (last.get("last") or {}).get("lat"), "lon": (last.get("last") or {}).get("lon")},
            "facts": [fact("마지막 부상", (last.get("last") or {}).get("t") or "—"), fact("기록 주기 수", len(fixes)), fact("표류 속도", f"{fc['speedKmDay']} km/일 ({fc['dirKo']})" if fc else "—")],
            "timeline": timeline, "agencies": [{"agency": "ARGO", "agencyKo": "Argo GDAC (Ifremer)", "summary": "플로트 부상 위치 — 약 10일 주기, 1000 m 정지수심 표류"}],
            "engine": {"name": "표류 지속성 추정(직전 변위 연장)", "method": "직전 두 부상 위치의 변위를 다음 주기에 그대로 더합니다. 표층 해류가 아니라 정지수심(약 1000 m) 흐름의 지속성이며, 다음 부상 위치와의 거리로 채점합니다.",
                       "current": f"{fc['lat']}°, {fc['lon']}° ({fc['at'][:10]})" if fc else "—", "rows": scores[0]["rows"] if scores else [], "unit": "km 오차",
                       "verdict": f"채점 {scores[0]['n']}주기 · 평균 {scores[0]['meanAbsError']} km" if scores else "다음 부상이 기록되면 채점합니다."},
            "verification": {"rows": [{"source": "EARTHUS 표류 추정", "n": s["n"], "score": s["meanAbsError"], "unit": "km 평균오차"} for s in scores], "note": "기준은 Argo 다음 부상 위치입니다."},
            "notes": ["Argo 는 대부분 1000 m 에서 표류하므로 표층 해류 예보와 다릅니다."], "sourceLinks": [{"label": "Argo 플로트", "url": f"https://fleetmonitoring.euro-argo.eu/float/{session['facts']['id']}"}]}


# ══════════════════════════════════════════════════════════════
# 6. 철새 이동 — 과거 위치추적 이력 요약 (올해 실시간 자료원 없음)
# ══════════════════════════════════════════════════════════════
def _mig_date(text):
    m = re.search(r"(\d{2})\.(\d{1,2})\.(\d{1,2})", str(text or ""))
    return (int("20" + m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


def bird_discover(now, ctx):
    doc = ctx.get("migbird", lambda: s3_json("events/migbird.json", {})) or {}
    by = {}
    for t in doc.get("trips") or []:
        by.setdefault(t.get("spc"), []).append(t)
    out = {}
    for spc, trips in by.items():
        if not spc or len(trips) < 3:
            continue
        sid = re.sub(r"\s+", "-", spc)
        out[sid] = {"id": sid, "species": spc, "title": f"{spc} 이동 이력 ({len(trips)}회 추적)"}
    return dict(sorted(out.items(), key=lambda kv: -len(by[kv[1]["species"]]))[:12])


def bird_snapshot(session, now, ctx, current):
    doc = ctx.get("migbird", lambda: s3_json("events/migbird.json", {})) or {}
    trips = [t for t in doc.get("trips") or [] if t.get("spc") == session["facts"]["species"]]
    months, routes, years = {}, {}, set()
    for t in trips:
        d = _mig_date(t.get("on"))
        if d:
            months[d[1]] = months.get(d[1], 0) + 1
            years.add(d[0])
        routes[f"{t.get('from')} → {t.get('to')}"] = routes.get(f"{t.get('from')} → {t.get('to')}", 0) + 1
    this_year = [t for t in trips if (_mig_date(t.get("on")) or (0,))[0] == now.year]
    return {"tripN": len(trips), "years": sorted(years), "months": months, "routes": sorted(routes.items(), key=lambda kv: -kv[1])[:5],
            "thisYearN": len(this_year), "updated": doc.get("updated")}


def bird_lifecycle(session, now):
    set_status(session, "PRELIMINARY_REPORT", now)


def bird_scores(session):
    return []


def bird_detail(session):
    last = (session.get("snapshots") or [{}])[-1]
    months = last.get("months") or {}
    peak = max(months.items(), key=lambda kv: kv[1])[0] if months else None
    return {"headline": f"추적 {last.get('tripN', 0)}회 · {', '.join(str(y) for y in last.get('years') or [])}년 · 출발 최다 {peak}월" if peak else "이동 기록 요약",
            "facts": [fact("추적 횟수", last.get("tripN", 0)), fact("출발 월 분포", " · ".join(f"{m}월 {n}" for m, n in sorted(months.items())) or "—"),
                      fact("주요 경로", " / ".join(f"{r} ({n})" for r, n in last.get("routes") or []) or "—"), fact(f"{datetime.now().year}년 추적", f"{last.get('thisYearN', 0)}건"),
                      fact("자료 갱신", last.get("updated") or "—")],
            "timeline": [], "agencies": [{"agency": "NIBR", "agencyKo": "국립생물자원관 철새 위치추적", "summary": "GPS 발신기 이동 경로 공개 자료"}],
            "engine": None,
            "verification": {"rows": [], "note": "올해 실시간 위치 자료가 없어 예측·검증을 하지 않습니다. 과거 출발 월 분포가 곧 '언제쯤 움직이나'의 근거입니다."},
            "notes": ["실시간 이동 추적을 붙이려면 eBird 관측 API 또는 국립생물자원관 실시간 발신 자료가 필요합니다 — 미연결."],
            "sourceLinks": [{"label": "국립생물자원관", "url": "https://species.nibr.go.kr/"}]}


# ══════════════════════════════════════════════════════════════
# 7. 해파리·적조 — OBIS 출현 + 해수온 전조
# ══════════════════════════════════════════════════════════════
OBIS = "https://api.obis.org/v3/occurrence?scientificname=Scyphozoa&size=500&geometry=POLYGON((124%2032,132%2032,132%2039,124%2039,124%2032))&startdate="
SEA_POINTS = {"서해(인천)": (37.3, 126.2), "남해(여수)": (34.5, 127.7), "동해(강릉)": (37.8, 129.2), "제주": (33.3, 126.5)}


def bloom_discover(now, ctx):
    start = (now - timedelta(days=90)).strftime("%Y-%m-%d")
    doc = ctx.get("obis", lambda: fetch_json(OBIS + start, 60)) or {}
    by_month = {}
    for r in doc.get("results") or []:
        d = str(r.get("eventDate") or "")[:7]
        if len(d) == 7:
            by_month.setdefault(d, []).append(r)
    out = {}
    cur = now.strftime("%Y-%m")
    for month in sorted(set(list(by_month) + [cur])):
        if month < start[:7]:
            continue
        out[month] = {"id": month, "title": f"해파리 출현 집계 · {month} ({len(by_month.get(month, []))}건)"}
    return out


def bloom_snapshot(session, now, ctx, current):
    start = (now - timedelta(days=90)).strftime("%Y-%m-%d")
    doc = ctx.get("obis", lambda: fetch_json(OBIS + start, 60)) or {}
    month = session["facts"]["id"]
    recs = [r for r in doc.get("results") or [] if str(r.get("eventDate") or "")[:7] == month]
    species = {}
    for r in recs:
        species[r.get("scientificName") or "미상"] = species.get(r.get("scientificName") or "미상", 0) + 1
    sst = {}
    if month == now.strftime("%Y-%m"):
        for name, (lat, lon) in SEA_POINTS.items():
            try:
                j = fetch_json(f"https://marine-api.open-meteo.com/v1/marine?latitude={lat}&longitude={lon}&current=sea_surface_temperature&timezone=UTC", 30)
                sst[name] = (j.get("current") or {}).get("sea_surface_temperature")
            except Exception as error:  # noqa: BLE001
                print(f"  해수온 실패 {name}: {error!r}"[:100])
    return {"n": len(recs), "species": sorted(species.items(), key=lambda kv: -kv[1])[:6],
            "places": [{"lat": r.get("decimalLatitude"), "lon": r.get("decimalLongitude"), "date": str(r.get("eventDate") or "")[:10], "name": r.get("scientificName")} for r in recs[-8:]],
            "sst": sst}


def bloom_lifecycle(session, now):
    month = session["facts"]["id"]
    if month == now.strftime("%Y-%m"):
        set_status(session, "ACTIVE", now)
    else:
        session["endedAt"] = session.get("endedAt") or f"{month}-01T00:00:00Z"
        set_status(session, "PRELIMINARY_REPORT", now)


def bloom_scores(session):
    return []


def bloom_detail(session):
    last = (session.get("snapshots") or [{}])[-1]
    return {"headline": f"출현 기록 {last.get('n', 0)}건 · " + (", ".join(f"{s} {n}" for s, n in last.get("species") or []) or "종 정보 없음"),
            "facts": [fact("종별", " · ".join(f"{s} {n}건" for s, n in last.get("species") or []) or "—"),
                      fact("해수온(모델 현재)", " · ".join(f"{k} {v}°C" for k, v in (last.get("sst") or {}).items()) or "이번 달 아님"),
                      fact("최근 위치", " / ".join(f"{p['date']} {p['lat']:.1f},{p['lon']:.1f}" for p in last.get("places") or [] if p.get("lat") is not None) or "—")],
            "timeline": [{"at": p["date"], "text": f"{p.get('name') or '해파리'} 관찰 · {p['lat']:.2f}°, {p['lon']:.2f}°", "agency": "OBIS"} for p in last.get("places") or [] if p.get("lat") is not None],
            "agencies": [{"agency": "OBIS", "agencyKo": "해양생물다양성정보(OBIS) · iNaturalist 연구등급 포함", "summary": "한반도 주변 해역 Scyphozoa 출현 기록"}],
            "engine": None,
            "verification": {"rows": [], "note": "출현 기록은 관찰자 편향이 큽니다. 국립수산과학원 해파리·적조 속보는 API 가 없어 미연결이며, 이 집계는 '전조 지표'일 뿐 발생 예보가 아닙니다."},
            "notes": ["해수온은 Open-Meteo 해양 모델 현재값이며 관측이 아닙니다."], "sourceLinks": [{"label": "NIFS 해파리 속보", "url": "https://www.nifs.go.kr/"}]}


# ══════════════════════════════════════════════════════════════
# 8. 위성·우주잔해 재진입 — CelesTrak SATCAT
# ══════════════════════════════════════════════════════════════
SATCAT = "https://celestrak.org/pub/satcat.csv"


def _satcat(ctx):
    def load():
        text = fetch_text(SATCAT, 120)
        return list(csv.DictReader(io.StringIO(text)))
    return ctx.get("satcat", load) or []


def lifetime_days(perigee_km, apogee_km):
    """근지점으로 본 잔여 수명 — 탄도계수를 모르는 **거친** 추정(전형적 물체 기준).
    150 km≈1일, 180≈5일, 200≈15일, 220≈35일, 250≈90일. 그 사이는 지수 보간."""
    if perigee_km is None:
        return None
    table = [(150, 1), (180, 5), (200, 15), (220, 35), (250, 90), (300, 300)]
    if perigee_km <= table[0][0]:
        return table[0][1]
    for (p0, d0), (p1, d1) in zip(table, table[1:]):
        if perigee_km <= p1:
            f = (perigee_km - p0) / (p1 - p0)
            return round(d0 * (d1 / d0) ** f, 1)
    return None


def reentry_discover(now, ctx):
    rows = _satcat(ctx)
    out = {}
    cutoff = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    for r in rows:
        if r.get("ORBIT_CENTER") != "EA":
            continue
        norad = r.get("NORAD_CAT_ID")
        decay = r.get("DECAY_DATE") or ""
        per, apo = _num(r.get("PERIGEE")), _num(r.get("APOGEE"))
        if decay >= cutoff and decay:
            out[norad] = {"id": norad, "name": r.get("OBJECT_NAME"), "type": r.get("OBJECT_TYPE"), "owner": r.get("OWNER"), "launch": r.get("LAUNCH_DATE"),
                          "decay": decay, "perigee": per, "apogee": apo, "rcs": _num(r.get("RCS")), "title": f"재진입 완료 · {r.get('OBJECT_NAME')} ({decay})"}
        elif not decay and per is not None and per <= 230 and r.get("OPS_STATUS_CODE") != "D" and (apo or 0) < 2000:
            out[norad] = {"id": norad, "name": r.get("OBJECT_NAME"), "type": r.get("OBJECT_TYPE"), "owner": r.get("OWNER"), "launch": r.get("LAUNCH_DATE"),
                          "decay": None, "perigee": per, "apogee": apo, "rcs": _num(r.get("RCS")), "title": f"재진입 임박 · {r.get('OBJECT_NAME')} (근지점 {per:.0f} km)"}
    active = sorted([v for v in out.values() if not v["decay"]], key=lambda v: v["perigee"])[:20]
    decayed = sorted([v for v in out.values() if v["decay"]], key=lambda v: v["decay"], reverse=True)[:25]
    return {v["id"]: v for v in active + decayed}


def reentry_snapshot(session, now, ctx, current):
    rows = _satcat(ctx)
    r = next((x for x in rows if x.get("NORAD_CAT_ID") == session["facts"]["id"]), None)
    per, apo = (_num(r.get("PERIGEE")), _num(r.get("APOGEE"))) if r else (None, None)
    decay = (r or {}).get("DECAY_DATE") or None
    life = lifetime_days(per, apo) if not decay else None
    forecast = {"decayBy": (now + timedelta(days=life)).strftime("%Y-%m-%d"), "lifeDays": life, "perigee": per} if life else None
    return {"perigee": per, "apogee": apo, "decay": decay, "forecast": forecast, "opsStatus": (r or {}).get("OPS_STATUS_CODE")}


def reentry_lifecycle(session, now):
    last = (session.get("snapshots") or [{}])[-1]
    if last.get("decay"):
        session["endedAt"] = session.get("endedAt") or f"{last['decay']}T00:00:00Z"
        set_status(session, "FINAL_REPORT", now)
    else:
        set_status(session, "ACTIVE", now)


def reentry_scores(session):
    snaps = session.get("snapshots") or []
    last = snaps[-1] if snaps else {}
    if not last.get("decay"):
        return []
    actual = parse_time(last["decay"])
    rows = []
    for s in snaps:
        fc = s.get("forecast")
        if fc and actual:
            rows.append({"label": f"{s['at'][:10]} 추정 {fc['decayBy']}", "forecast": 0, "actual": round((parse_time(fc["decayBy"]) - actual).total_seconds() / 86400, 1)})
    if not rows:
        return []
    return [{"agency": "EARTHUS_PERIGEE", "n": len(rows), "meanAbsError": round(sum(abs(r["actual"]) for r in rows) / len(rows), 1), "rows": rows[-6:]}]


def reentry_detail(session):
    f, snaps = session["facts"], session.get("snapshots") or []
    last = snaps[-1] if snaps else {}
    fc, scores = last.get("forecast"), session.get("scores") or []
    timeline = [{"at": f.get("launch"), "text": f"발사 · {f.get('owner')}", "agency": "SATCAT"}]
    if last.get("decay"):
        timeline.append({"at": last["decay"], "text": "재진입(붕괴) 기록", "agency": "SATCAT"})
    return {"headline": (f"재진입 {last['decay']} · {f.get('name')}" if last.get("decay") else f"근지점 {last.get('perigee') or '—'} km · 잔여 약 {fc['lifeDays']}일 (≈{fc['decayBy']})" if fc else f"{f.get('name')}"),
            "facts": [fact("물체", f"{f.get('name')} · {f.get('type')} · NORAD {f.get('id')}"), fact("소유", f.get("owner") or "—"), fact("발사", f.get("launch") or "—"),
                      fact("궤도", f"근지점 {last.get('perigee') or '—'} / 원지점 {last.get('apogee') or '—'} km"), fact("레이더 단면", f"{f.get('rcs')} m²" if f.get("rcs") else "—"),
                      fact("재진입", last.get("decay") or "아직 궤도상")],
            "timeline": [t for t in timeline if t["at"]], "agencies": [{"agency": "CELESTRAK", "agencyKo": "CelesTrak SATCAT (18 SDS 기반)", "summary": "붕괴일·근지점·원지점"}],
            "engine": {"name": "근지점 기반 잔여수명 추정", "method": "근지점 고도와 전형적 탄도계수로 남은 수명을 봅니다. 물체 질량·단면적·태양활동을 모르는 거친 추정이며, 실제 붕괴일이 기록되면 날짜 차이로 채점합니다.",
                       "current": f"≈{fc['decayBy']} (남은 {fc['lifeDays']}일)" if fc else "붕괴 기록됨" if last.get("decay") else "—", "rows": scores[0]["rows"] if scores else [], "unit": "일 차이",
                       "verdict": f"채점 {scores[0]['n']}회 · 평균 {scores[0]['meanAbsError']}일 차이" if scores else "붕괴일이 기록되면 채점합니다."},
            "verification": {"rows": [{"source": "EARTHUS 잔여수명", "n": s["n"], "score": s["meanAbsError"], "unit": "일 평균오차"} for s in scores], "note": "기준은 SATCAT 붕괴일입니다. 낙하 지점은 계산하지 않습니다."},
            "notes": ["낙하 위치·시각의 공식 예측은 Space-Track TIP 메시지가 담당하며 여기서는 옮기지 않습니다(접근 권한 없음)."],
            "sourceLinks": [{"label": "CelesTrak SATCAT", "url": f"https://celestrak.org/satcat/table-satcat.php?CATNR={f.get('id')}"}]}


# ══════════════════════════════════════════════════════════════
# 실행
# ══════════════════════════════════════════════════════════════
MODULES = {
    "earthquake": (eq_discover, eq_snapshot, eq_lifecycle, eq_scores, eq_detail),
    "aurora": (aurora_discover, aurora_snapshot, aurora_lifecycle, aurora_scores, aurora_detail),
    "smoke-ash": (smoke_discover, smoke_snapshot, smoke_lifecycle, smoke_scores, smoke_detail),
    "air-pollution": (air_discover, air_snapshot, air_lifecycle, air_scores, air_detail),
    "ocean-drift": (drift_discover, drift_snapshot, drift_lifecycle, drift_scores, drift_detail),
    "bird-migration": (bird_discover, bird_snapshot, bird_lifecycle, bird_scores, bird_detail),
    "marine-bloom": (bloom_discover, bloom_snapshot, bloom_lifecycle, bloom_scores, bloom_detail),
    "space-reentry": (reentry_discover, reentry_snapshot, reentry_lifecycle, reentry_scores, reentry_detail),
}
SUMMARY = {
    "earthquake": "본진·여진·기관 발표·쓰나미 게시문을 보존하고, 여진 기대수를 실제 여진으로 채점합니다.",
    "aurora": "SWPC Kp 예보를 관측 Kp 로 채점하고 한국 가시성을 함께 적습니다.",
    "smoke-ash": "VAAC 화산재 권고와 대형 산불 군집을 추적합니다.",
    "air-pollution": "시도별 미세먼지·황사 특보를 보존하고 CAMS 24시간 예보를 실측으로 채점합니다.",
    "ocean-drift": "Argo 플로트 부상 위치로 표류 추정을 채점합니다.",
    "bird-migration": "과거 위치추적 이력의 출발 시기·경로 요약입니다. 올해 실시간 자료는 없습니다.",
    "marine-bloom": "해파리 출현 기록과 해수온을 전조 지표로 집계합니다. 발생 예보가 아닙니다.",
    "space-reentry": "근지점 기반 잔여수명 추정을 실제 붕괴일로 채점합니다.",
}


def run_kind(kind, state, now, ctx):
    discover, snapshot, lifecycle, scores, detail = MODULES[kind]
    sessions = {s["id"]: s for s in state.get("sessions", []) if s.get("kind") == kind}
    try:
        found = discover(now, ctx) or {}
    except Exception as error:  # noqa: BLE001 - 탐지 실패는 기존 세션을 지우지 않는다
        print(f"  탐지 실패 {kind}: {error!r}"[:160])
        found = {}
    for sid, facts in found.items():
        key = f"{kind}:{sid}"
        if key not in sessions:
            sessions[key] = new_session(kind, sid, facts.get("title") or sid, now, facts)
            print(f"  + {key} {facts.get('title')}")
        else:
            sessions[key]["facts"] = {**sessions[key]["facts"], **facts}
            sessions[key]["title"] = facts.get("title") or sessions[key]["title"]
    for key, session in sessions.items():
        if session.get("status") == "FINAL_REPORT" and (session.get("snapshots") or []) and kind not in ("earthquake",):
            continue   # 끝난 보고서는 다시 받지 않는다 (지진은 USGS 검토 상태를 계속 본다)
        try:
            snap = snapshot(session, now, ctx, found.get(key.split(":", 1)[1], {}))
            if snap is not None:
                add_snapshot(session, snap, now)
            lifecycle(session, now)
            session["scores"] = scores(session)
        except Exception as error:  # noqa: BLE001
            print(f"  회차 실패 {key}: {error!r}"[:160])
    kept = sorted(sessions.values(), key=lambda s: s.get("lastSeen") or "", reverse=True)[:MAX_SESSIONS]
    reports = []
    for s in kept:
        try:
            d = detail(s)
        except Exception as error:  # noqa: BLE001
            d = None
            print(f"  본문 실패 {s['id']}: {error!r}"[:160])
        reports.append({"id": s["id"], "kind": kind, "title": s["title"], "status": s["status"], "access": "pro", "detectedAt": s["detectedAt"],
                        "lastSeen": s.get("lastSeen"), "endedAt": s.get("endedAt"), "snapshotCount": len(s.get("snapshots") or []),
                        "sourceCount": len(s.get("scores") or []) or None, "summary": SUMMARY[kind], "scores": s.get("scores") or [], "detail": d,
                        "sourcePath": f"analysis/{kind}-reports.json"})
    put_json(f"analysis/{kind}-reports.json", {"schemaVersion": 1, "generated": stamp(now), "kind": kind, "count": len(reports), "reports": reports})
    return kept


def handler(event, _context=None):
    now = now_utc()
    kinds = [k for k in ((event or {}).get("kinds") or KINDS) if k in MODULES]
    state = s3_json(STATE_KEY, {"schema": 1, "sessions": []})
    ctx = Ctx()
    others = [s for s in state.get("sessions", []) if s.get("kind") not in kinds]
    kept = []
    summary = {}
    for kind in kinds:
        print(f"▸ {kind}")
        sessions = run_kind(kind, state, now, ctx)
        kept.extend(sessions)
        summary[kind] = {"sessions": len(sessions), "active": sum(s["status"] == "ACTIVE" for s in sessions)}
    state = {"schema": 1, "generated": stamp(now), "sessions": others + kept}
    s3.put_object(Bucket=BUCKET, Key=STATE_KEY, Body=json.dumps(state, ensure_ascii=False, separators=(",", ":")).encode(),
                  ContentType="application/json", CacheControl="private, no-store")
    return {"ok": True, "generated": stamp(now), "summary": summary}


if __name__ == "__main__":
    import sys
    print(json.dumps(handler({"kinds": sys.argv[1:] or None}), ensure_ascii=False))
