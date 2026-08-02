# -*- coding: utf-8 -*-
"""태풍 공식 예보 — 한국·일본·미국을 모아 **먼저 발표한 곳**을 알린다

받은 지시
  "소멸할 것으로 예상된다는 기상청이나 일본 자료 뭐 그런 공신력 있는 곳에서
   제시된 걸 쓰면 되지" → "미국 일본 한국 중에 먼저 발표된 걸로 말해주면 돼"

⚠️⚠️ 우리는 진로·강도·소멸을 **단정하지 않는다.** 그건 자체 예보이고 규율 위반이다.
   대신 **공식 기관이 낸 예보를 출처·발표시각과 함께 옮긴다.**
   값을 우리가 만드느냐 옮기느냐 — 그 차이가 전부다.

⚠️⚠️ **기관이 다르면 다르다고 그대로 말한다. 하나로 뭉개지 않는다.**
   (지진에서 JMA·USGS 를 다루는 방식과 같다 — jma.js 주석 참고)
   "먼저 발표한 곳"을 앞세우되 나머지도 지우지 않는다. 평균 내지 않는다.

세 기관의 실제 사정 (2026-08-02 실측)
  ┌ 기상청 KMA  API 허브 typ_data.php
  │   · 분석(FT=0) + 예보(FT=1) 12·24·36·48·72시간
  │   · **한국어 위치 설명**이 들어 있다 ("괌 동북동쪽 약 2270 km 부근 해상")
  │   ⚠️⚠️ 응답이 **EUC-KR** 이다. UTF-8 로 읽으면 통째로 깨져서 "자료 없음"으로
  │      보인다 — 실제로 그렇게 한 번 속았다.
  │   ⚠️ YY(연도)·typ(태풍번호)·seq(발표번호)로 조회한다. seq 는 계속 늘어나므로
  │      **최신을 찾아야** 한다. 0 이나 없는 번호를 넣으면 빈 응답이다.
  ├ 일본 JMA   bosai/typhoon
  │   · **120시간(5일)** — 셋 중 가장 멀리 본다
  │   · category(TY/TD) 와 intensity(非常に強い…) 로 **약화·소멸이 드러난다**
  └ 미국       NHC CurrentStorms.json
      ⚠️ NHC 는 **대서양·동태평양만** 담당한다. 서태평양 태풍은 없다.
      ⚠️ 서태평양 담당인 JTWC 는 403 으로 막혀 있다(봇 차단).
         → 서태평양에서 "미국 발표"는 **현재 받을 수 없다.** 없는 걸 있는 척하지 않는다.

출력  events/typhoon-official.json
"""

import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KMA_KEY = os.environ.get("KMA_KEY", "")
s3 = boto3.client("s3", region_name=REGION)

DST = "events/typhoon-official.json"
UA = {"User-Agent": "earthus.net (dalur@kakao.com)"}
T = 25

JMA_BASE = "https://www.jma.go.jp/bosai/typhoon/data"
KMA_URL = "https://apihub.kma.go.kr/api/typ01/url/typ_data.php"
NHC_URL = "https://www.nhc.noaa.gov/CurrentStorms.json"

INTENSITY_KO = {"猛烈な": "맹렬한", "非常に強い": "매우 강한", "強い": "강한", "-": None}
CATEGORY_KO = {"TY": "태풍", "STS": "매우 강한 열대폭풍", "TS": "열대폭풍",
               "TD": "열대저압부", "L": "저기압", "LOW": "저기압",
               "HU": "허리케인", "PTC": "잠재 열대저기압", "STD": "아열대저압부"}
COURSE_KO = {"北": "북", "北北東": "북북동", "北東": "북동", "東北東": "동북동",
             "東": "동", "東南東": "동남동", "南東": "남동", "南南東": "남남동",
             "南": "남", "南南西": "남남서", "南西": "남서", "西南西": "서남서",
             "西": "서", "西北西": "서북서", "北西": "북서", "北北西": "북북서",
             "ほとんど停滞": "거의 정체", "不明": "불명"}
DIR16_KO = {"N": "북", "NNE": "북북동", "NE": "북동", "ENE": "동북동",
            "E": "동", "ESE": "동남동", "SE": "남동", "SSE": "남남동",
            "S": "남", "SSW": "남남서", "SW": "남서", "WSW": "서남서",
            "W": "서", "WNW": "서북서", "NW": "북서", "NNW": "북북서"}


def get(url, raw=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=T) as r:
        b = r.read()
    return b if raw else json.loads(b)


def num(v):
    try:
        f = float(v)
        return None if f in (-999.0, -99.0) else f
    except (TypeError, ValueError):
        return None


AREA_DIR_KO = {"北": "북", "北東": "북동", "東": "동", "南東": "남동",
               "南": "남", "南西": "남서", "西": "서", "北西": "북서",
               "全域": None}
# 방위 → 각도(°). 비대칭 강풍역을 그리려면 어느 쪽인지 알아야 한다.
AREA_DIR_DEG = {"北": 0, "北東": 45, "東": 90, "南東": 135,
                "南": 180, "南西": 225, "西": 270, "北西": 315}


def _areas(p):
    """강풍역·폭풍역/폭풍경계역 반경.

    ⚠️⚠️ **실황과 예보는 뜻이 전혀 다르다. 같은 말로 부르면 안 된다.**
      · 실황(h=0)  暴風域 185km  = 지금 실제로 25m/s 이상이 부는 범위
      · 예보(h>0)  暴風警戒域    = 진로가 어긋날 가능성까지 더해 "폭풍이 닿을 수 있는" 범위
        실측(2026-08-02 돌핀): +12h 230km → +117h 440km 로 계속 커진다.
        ⚠️ 태풍이 커지는 게 아니라 **진로의 불확실성이 커지는 것**이다.
           이걸 "폭풍반경"이라고 적으면 "태풍이 2배로 자란다"는 거짓이 된다.

    ⚠️ 강풍역은 **방위별로 다르다** (실측: 북동 500km · 남서 390km).
       하나로 평균 내면 실제로 부는 쪽을 줄이고 안 부는 쪽을 늘리게 된다.
    """
    out = {}
    gale = p.get("galeWarning") or []
    storm = p.get("stormWarning") or []

    def one(lst):
        r = []
        for a in lst:
            area = a.get("area")
            jp = area if isinstance(area, str) else (area or {}).get("jp", "")
            km = num((a.get("range") or {}).get("km"))
            if km is None:
                continue
            r.append({"km": km, "dirJp": jp or None,
                      "dirKo": AREA_DIR_KO.get(jp), "deg": AREA_DIR_DEG.get(jp)})
        return r or None

    g, s = one(gale), one(storm)
    if g:
        out["galeArea"] = g           # 강풍역(15m/s 이상) — 실황에만 나온다
    if s:
        # 실황이면 실제 폭풍역, 예보면 폭풍경계역. 부르는 이름을 여기서 갈라 둔다.
        out["stormArea"] = s
        out["stormIsWatch"] = bool(p.get("advancedHours"))
    return out


# ── 일본 기상청 ────────────────────────────────────────────────────
def from_jma():
    out = []
    try:
        targets = get(f"{JMA_BASE}/targetTc.json")
    except Exception as e:                                   # noqa: BLE001
        print(f"[jma] 목록 실패 {e!r}")
        return out
    for t in targets:
        tc = t.get("tropicalCyclone")
        if not tc:
            continue
        try:
            spec = get(f"{JMA_BASE}/{tc}/specifications.json")
        except Exception as e:                               # noqa: BLE001
            print(f"[jma] {tc} 실패 {e!r}")
            continue
        try:
            fc = get(f"{JMA_BASE}/{tc}/forecast.json")
            times = {p.get("advancedHours"): (p.get("validtime") or {}).get("JST")
                     for p in fc if p.get("advancedHours") is not None}
        except Exception:                                    # noqa: BLE001
            times = {}

        name = number = None
        steps = []
        for p in spec:
            q = p.get("part")
            lab = q if isinstance(q, str) else (q or {}).get("en", "")
            if lab == "title" or (isinstance(q, str) and q == "title"):
                name = (p.get("name") or {}).get("en")
                number = p.get("typhoonNumber")
                continue
            pos = (p.get("position") or {}).get("deg") or [None, None]
            mw = (p.get("maximumWind") or {}).get("sustained") or {}
            cat = p.get("category") or {}
            steps.append({
                "h": p.get("advancedHours"),
                "validKst": times.get(p.get("advancedHours")),
                "lat": pos[0], "lon": pos[1],
                "windMs": num(mw.get("m/s")),
                "category": cat.get("en"), "categoryJp": cat.get("jp"),
                "categoryKo": CATEGORY_KO.get(cat.get("en") or ""),
                "intensityJp": p.get("intensity"),
                "intensityKo": INTENSITY_KO.get(p.get("intensity") or ""),
                "courseKo": COURSE_KO.get(p.get("course") or ""),
                "speedKmh": num((p.get("speed") or {}).get("km/h")),
                "place": p.get("location"),
                "circleKm": num((p.get("probabilityCircleRadius") or {}).get("km")),
                **_areas(p),
            })
        steps.sort(key=lambda x: (x["h"] is None, x["h"] or 0))
        if steps:
            out.append({"agency": "JMA", "agencyKo": "일본 기상청",
                        "name": name, "number": number, "tc": tc,
                        "issue": t.get("issue"), "steps": steps})
    return out


# ── 기상청 ─────────────────────────────────────────────────────────
def _loc(tokens):
    """LOC 만 남긴다 — 뒤에 붙은 ED25,ER25(예: 'SW,120,') 를 떼어낸다."""
    out = []
    for t in tokens:
        if re.match(r"^[A-Z-]+,-?\d+,?$", t) or t in ("-,-999,", "-,"):
            break
        out.append(t)
    txt = " ".join(out).strip(" ,-")
    return txt or None


def kma_rows(year, typ, seq):
    """⚠️ 응답이 EUC-KR 이다. UTF-8 로 읽으면 통째로 깨진다."""
    q = urllib.parse.urlencode({"YY": year, "typ": typ, "seq": seq,
                                "mode": 1, "disp": 0, "authKey": KMA_KEY})
    raw = get(f"{KMA_URL}?{q}", raw=True)
    txt = raw.decode("euc-kr", "replace")
    rows = []
    for line in txt.splitlines():
        if not line or line.startswith("#"):
            continue
        f = line.split()
        if len(f) < 14:
            continue
        try:
            rows.append({
                "ft": int(f[0]),          # 0=분석 1=예보
                "seq": int(f[3]), "h": int(f[4]),
                "atUtc": f[5], "validUtc": f[6],
                "lat": float(f[7]), "lon": float(f[8]),
                "dir": f[9], "dirKo": DIR16_KO.get(f[9], f[9]),
                "speedKmh": num(f[10]), "hpa": num(f[11]), "windMs": num(f[12]),
                # ⚠️ LOC(위치 설명)는 **18번째부터**이고 공백이 섞인 한 덩어리다
                #    ("괌 동북동쪽 약 2270 km 부근 해상"). 19 부터 자르면 도시명이 날아간다.
                #    그리고 뒤에 ED25,ER25 가 "SW,120," 꼴로 붙어 오므로 떼어낸다(실측).
                "place": _loc(f[18:]),
            })
        except (ValueError, IndexError):
            continue
    return rows


def latest_seq(year, typ, hi=60):
    """⚠️ 최신 발표번호를 찾아야 한다. seq 는 계속 늘어난다."""
    best = 0
    lo = 1
    while lo <= hi:                       # 이분 탐색 (호출 수를 줄인다)
        mid = (lo + hi) // 2
        try:
            r = kma_rows(year, typ, mid)
        except Exception:                                    # noqa: BLE001
            r = []
        if r:
            best = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def from_kma(year, numbers):
    """⚠️ numbers 는 {태풍번호: 이름} 이다. 기상청 API 는 **이름을 주지 않아서**
       JMA 가 준 이름을 붙여야 같은 태풍으로 묶인다.
       안 붙이면 'Dolphin(JMA)' 과 '2026-13(KMA)' 이 서로 다른 태풍으로 잡힌다(실측)."""
    out = []
    if not KMA_KEY:
        print("[kma] 키 없음 — 건너뜀")
        return out
    for typ, nm in sorted(numbers.items()):
        sq = latest_seq(year, typ)
        if not sq:
            continue
        try:
            rows = kma_rows(year, typ, sq)
        except Exception as e:                               # noqa: BLE001
            print(f"[kma] {typ}호 실패 {e!r}")
            continue
        if not rows:
            continue
        # ⚠️⚠️ mode=1 은 **누적 이력**을 준다 — seq=32 를 물으면 1~32 회차가 전부 온다.
        #    그대로 쓰면 발표 시각이 첫 회차(1주일 전)로 잡히고 "오래된 예보"가 된다(실측).
        #    → 가장 큰 seq 의 행만 남긴다. 그게 지금 유효한 발표다.
        top = max(r["seq"] for r in rows)
        rows = [r for r in rows if r["seq"] == top]
        steps = [{
            "h": r["h"], "validUtc": r["validUtc"],
            "lat": r["lat"], "lon": r["lon"],
            "windMs": r["windMs"], "hpa": r["hpa"],
            "courseKo": r["dirKo"], "speedKmh": r["speedKmh"],
            "place": r["place"],
            # ⚠️ 기상청은 등급 문자열을 이 API 로 주지 않는다. 없는 걸 만들지 않는다.
            "category": None, "categoryKo": None,
        } for r in sorted(rows, key=lambda x: (x["ft"], x["h"]))]
        # 분석(FT=0) 행의 시각이 그 회차의 발표 기준시각이다
        at = next((r["atUtc"] for r in rows if r["ft"] == 0), rows[0]["atUtc"])
        out.append({"agency": "KMA", "agencyKo": "한국 기상청",
                    "name": nm, "number": f"{year}-{typ}호",
                    "seq": top,
                    "issue": f"{at[:4]}-{at[4:6]}-{at[6:8]}T{at[8:10]}:{at[10:12]}:00Z",
                    "steps": steps})
    return out


# ── 미국 (NHC) ─────────────────────────────────────────────────────
def from_nhc():
    """⚠️ NHC 는 대서양·동태평양만 담당한다. 서태평양 태풍은 여기 없다."""
    out = []
    try:
        j = get(NHC_URL)
    except Exception as e:                                   # noqa: BLE001
        print(f"[nhc] 실패 {e!r}")
        return out
    for s in j.get("activeStorms", []):
        cat = s.get("classification")
        out.append({
            "agency": "NHC", "agencyKo": "미국 국립허리케인센터",
            "name": s.get("name"), "number": s.get("id"),
            "issue": s.get("lastUpdate"),
            "basinNote": {"ko": "대서양·동태평양 담당", "en": "Atlantic / E. Pacific only"},
            "steps": [{
                "h": 0, "validUtc": s.get("lastUpdate"),
                "lat": num(str(s.get("latitude", "")).rstrip("NS")),
                "lon": num(str(s.get("longitude", "")).rstrip("EW")),
                "windMs": round(num(s.get("intensity")) * 0.5144, 1)
                          if num(s.get("intensity")) else None,
                "hpa": num(s.get("pressure")),
                "category": cat, "categoryKo": CATEGORY_KO.get(cat or ""),
                "speedKmh": round(num(s.get("movementSpeed")) * 1.852, 1)
                            if num(s.get("movementSpeed")) else None,
                "place": None,
            }],
        })
    return out


def downgrade_of(rec):
    """등급이 바뀌는 첫 시점. ⚠️ 우리가 판단하지 않는다 — 기관이 낸 등급의 변화다."""
    steps = rec.get("steps") or []
    now = next((s for s in steps if s.get("h") == 0), None)
    if not now or not now.get("category"):
        return None
    for s in steps:
        if s.get("h") and s.get("category") and s["category"] != now["category"]:
            return {"h": s["h"], "from": now["category"], "to": s["category"],
                    "toKo": s.get("categoryKo"), "valid": s.get("validKst") or s.get("validUtc")}
    return None


def handler(event=None, context=None):
    now = datetime.now(timezone.utc)
    year = now.year

    jma = from_jma()
    # ⚠️ 기상청 태풍번호는 JMA 의 typhoonNumber 뒤 두 자리와 같다 (2613 → 13호).
    #    JMA 가 잡은 태풍만 기상청에 물어본다 — 없는 번호를 훑으면 호출만 낭비한다.
    nums = {}
    for r in jma:
        n = str(r.get("number") or "")
        if len(n) == 4 and n.isdigit():
            nums[int(n[2:])] = r.get("name")
    kma = from_kma(year, nums)
    nhc = from_nhc()

    recs = jma + kma + nhc
    for r in recs:
        r["downgrade"] = downgrade_of(r)
        st = r.get("steps") or []
        r["horizonH"] = max((s.get("h") or 0) for s in st) if st else None

    # ── 태풍별로 묶고, **먼저 발표한 곳**을 앞세운다 ──────────────
    # ⚠️ 평균 내거나 하나로 합치지 않는다. 기관이 다르면 다르다고 말한다.
    by_name = {}
    for r in recs:
        key = (r.get("name") or r.get("number") or r.get("tc") or "?").upper()
        by_name.setdefault(key, []).append(r)
    storms = []
    for key, group in by_name.items():
        group.sort(key=lambda x: x.get("issue") or "")
        first = group[0]
        # 약화·소멸을 **가장 먼저** 예보한 기관
        dg = [g for g in group if g.get("downgrade")]
        dg.sort(key=lambda g: g["downgrade"]["h"])
        storms.append({
            "key": key,
            "name": next((g.get("name") for g in group if g.get("name")), None),
            "firstIssuedBy": first["agency"], "firstIssuedAt": first.get("issue"),
            "earliestDowngrade": ({"agency": dg[0]["agency"], "agencyKo": dg[0]["agencyKo"],
                                   **dg[0]["downgrade"]} if dg else None),
            "agencies": group,
        })

    doc = {
        "generated": now.strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "기상청(KMA) · 일본 기상청(JMA) · 미국 NHC",
        "note": {
            "ko": "각국 기상기관이 발표한 **공식 예보**를 그대로 옮긴 것입니다. "
                  "저희가 만든 값이 없으며, 진로·강도·약화 전망은 모두 해당 기관의 것입니다. "
                  "⚠️ 기관마다 예보가 다를 수 있습니다 — 하나로 합치지 않고 그대로 나란히 둡니다.",
            "en": "Official forecasts from each agency, relayed verbatim and kept side by side. "
                  "Agencies may disagree; we do not merge them.",
        },
        "coverage": {
            "ko": "⚠️ 미국 NHC 는 대서양·동태평양만 담당해 서태평양 태풍은 나오지 않습니다. "
                  "서태평양 담당인 미 해군 JTWC 는 접근이 막혀 있어 받지 못합니다.",
            "en": "⚠️ NHC covers the Atlantic and E. Pacific only; JTWC (W. Pacific) blocks access.",
        },
        "count": len(storms),
        "storms": storms,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="no-cache")
    for s in storms:
        ags = ", ".join(f"{g['agency']}(~{g['horizonH']}h)" for g in s["agencies"])
        ed = s.get("earliestDowngrade")
        tail = f" · 약화 먼저: {ed['agency']} +{ed['h']}h→{ed['to']}" if ed else ""
        print(f"[typ] {s['name'] or s['key']} — {ags}{tail}")
    return {"storms": len(storms), "bytes": len(body)}
