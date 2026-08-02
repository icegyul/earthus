# -*- coding: utf-8 -*-
"""오늘의 대기 상태를 판정해 **매일 남긴다** — 그래야 "달라졌다"를 말할 수 있다

받은 요청: 내 위치 날씨를 원고처럼.
  원고의 제목이 **"이중 열돔에서 벗어난 한반도"** 다 — 값이 아니라 **바뀜**이 기사다.

⚠️⚠️ **바뀜을 말하려면 어제를 알아야 한다.**
   화면에서 그때그때 계산하면 오늘 값밖에 없어서 "벗어났다"를 영영 못 쓴다.
   그래서 매일 판정을 S3 에 남긴다. 오늘이 첫날이고, 내일부터 비교가 시작된다.

⚠️⚠️ **하루 튐으로 "벗어났다"고 쓰지 않는다.**
   설계 문서(weather-narrative-design.md §3-④)의 규율이다 —
   상태가 바뀌고 **연속 2일** 유지돼야 발행한다.
   하루짜리 변덕을 사건으로 쓰면, 진짜 바뀐 날에 아무도 안 믿는다.

⚠️ 판정에 쓰는 임계는 **기상청 정의**뿐이다(열대야 25 · 초열대야 30 · 폭염 33/35).
   평년 대비는 우리가 적재한 30년 실측 분위수로 낸다 — 지어낸 기준이 없다.

⚠️ 지표가 결측이면 그 판정을 **빼고** 남긴다. 추정으로 메우지 않는다.

출력
  s3://<CACHE_BUCKET>/wind/air-state.json          오늘 판정 + 어제와의 차이
  s3://<CACHE_BUCKET>/archive/air-state/<날짜>.json 하루치 스냅샷 (근거 포함)
  ⚠️ 발행한 서술은 **그날 근거와 함께** 보관한다. 나중에 "왜 저렇게 썼나"를 되짚어야 한다.
"""

import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
s3 = boto3.client("s3", region_name=REGION)

DST = "wind/air-state.json"
ARCH = "archive/air-state"
KST = timezone(timedelta(hours=9))

# 한반도를 대표하는 세 점.
# ⚠️ 한 점으로 한반도를 말하지 않는다 — 수증기는 남쪽부터 들어와서
#    가운데만 보면 하루 늦게 알아챈다.
PTS = [("남", 34.8, 127.2), ("중", 36.5, 127.8), ("북", 37.9, 127.6)]

# ⚠️ 전부 기상청 정의다. 우리가 정한 값이 하나도 없다.
KMA = {"tropicalNight": 25.0, "superTropical": 30.0,
       "heatWatch": 33.0, "heatWarn": 35.0}

# 평년 대비 이 백분위를 넘으면 "많다/높다"로 본다.
# ⚠️ 10% 는 흔히 쓰는 구분이지만 **우리가 고른 값**이다 — 화면에 그렇게 밝힌다.
HI_PCT = 90
LO_PCT = 10


def get(url, timeout=40):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.load(r)


def load(key, dflt=None):
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())
    except Exception:                                        # noqa: BLE001
        return dflt


def put(key, doc, maxage=1800):
    s3.put_object(Bucket=BUCKET, Key=key,
                  Body=json.dumps(doc, ensure_ascii=False,
                                  separators=(",", ":")).encode(),
                  ContentType="application/json; charset=utf-8",
                  CacheControl=f"public, max-age={maxage}")


def now_air(lat, lon):
    q = urllib.parse.urlencode({
        "latitude": lat, "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,dew_point_2m,cape,"
                   "total_column_integrated_water_vapour,pressure_msl",
        "daily": "temperature_2m_max,temperature_2m_min",
        "timezone": "Asia/Seoul", "forecast_days": "2",
    })
    try:
        return get(f"https://api.open-meteo.com/v1/forecast?{q}")
    except Exception:                                        # noqa: BLE001
        return None


def pct_of(cuts, qs, v):
    """분위수 표에서 백분위. ⚠️ 끝을 넘으면 끝값으로만 말한다 —
       450개 표본으로 '상위 1%'를 말할 근거가 없다."""
    if v is None or not cuts:
        return None
    if v <= cuts[0]:
        return qs[0]
    if v >= cuts[-1]:
        return qs[-1]
    for i in range(1, len(cuts)):
        if v <= cuts[i]:
            f = (v - cuts[i - 1]) / ((cuts[i] - cuts[i - 1]) or 1)
            return round(qs[i - 1] + (qs[i] - qs[i - 1]) * f)
    return None


def judge(vals, norm):
    """오늘 상태 라벨. ⚠️ 못 내는 것은 넣지 않는다."""
    labels = []
    ev = {}

    tmin = vals.get("tminTonight")
    if tmin is not None:
        if tmin >= KMA["superTropical"]:
            labels.append("초열대야"); ev["초열대야"] = f"밤 최저 {tmin:.1f}°C ≥ 30"
        elif tmin >= KMA["tropicalNight"]:
            labels.append("열대야"); ev["열대야"] = f"밤 최저 {tmin:.1f}°C ≥ 25"

    tp = vals.get("pTmax")
    if tp is not None and tp >= HI_PCT:
        labels.append("고온"); ev["고온"] = f"낮 최고 평년 상위 {100 - tp}%"
    elif tp is not None and tp <= LO_PCT:
        labels.append("저온"); ev["저온"] = f"낮 최고 평년 하위 {tp}%"

    # ⚠️⚠️ 지표 습도와 가강수량은 **다른 것**이다. 오늘 실측이 그 예다 —
    #    지표 습도 82% 인데 가강수량은 하위 5%. 땅 근처만 눅눅하고 대기 기둥 전체
    #    수증기는 적다는 뜻이다(낮은 구름·안개). 원고의 "습도 폭탄"이 말하는 건 후자다.
    #    습도만 보고 "수증기가 많다"고 쓰면 틀린다.
    wp = vals.get("pTcwv")
    if wp is not None and wp >= HI_PCT:
        labels.append("다습"); ev["다습"] = f"가강수량 평년 상위 {100 - wp}%"
    elif wp is not None and wp <= LO_PCT:
        # ⚠️ 낮은 쪽도 정보다. "수증기가 적다"는 소나기가 커지기 어렵다는 뜻이다.
        labels.append("건조"); ev["건조"] = f"가강수량 평년 하위 {wp}%"

    cape = vals.get("cape")
    if cape is not None and cape >= 1000 and (vals.get("rh") or 0) >= 75:
        labels.append("불안정"); ev["불안정"] = f"CAPE {cape:.0f} J/kg · 습도 {vals['rh']:.0f}%"

    return labels, ev


def handler(event=None, context=None):
    today = datetime.now(KST).date()
    mmdd = f"{today.month:02d}{today.day:02d}"

    # 평년 분위수 — 우리가 만들어 올린 표(지점별)
    idx = load("app/data/doy/index.json", {"stations": []})
    # 가강수량 평년 — 원고의 "남쪽 수증기 대량 유입 / 물폭탄의 재료"
    # ⚠️ ERA5 1995~2025. 2026년은 재분석이 아직 안 나와 빠져 있다.
    tc = load("app/data/tcwv-normals.json", {}) or {}

    per = []
    for nm, la, lo in PTS:
        air = now_air(la, lo)
        if not air:
            continue
        c = air.get("current") or {}
        d = air.get("daily") or {}
        tmax = (d.get("temperature_2m_max") or [None])[0]
        tmins = d.get("temperature_2m_min") or []
        # ⚠️ '오늘 밤 최저'는 **내일 아침** 값이다. 오늘 값은 이미 지나간 새벽이다.
        tmin_t = tmins[1] if len(tmins) > 1 else (tmins[0] if tmins else None)

        # 가장 가까운 관측소의 평년 표
        best, bd = None, 1e9
        for st in idx.get("stations", []):
            dd = abs(st["la"] - la) + abs(st["lo"] - lo)
            if dd < bd:
                bd, best = dd, st
        doy = load(f"app/data/doy/{best['s']}.json") if best else None
        cell = (doy or {}).get("doy", {}).get(mmdd)
        qs = (doy or {}).get("qs")

        vals = {
            "t": c.get("temperature_2m"), "rh": c.get("relative_humidity_2m"),
            "cape": c.get("cape"),
            "tcwv": c.get("total_column_integrated_water_vapour"),
            "tmax": tmax, "tminTonight": tmin_t,
            "pTmax": pct_of(cell["tmax"]["q"], qs, tmax) if (cell and "tmax" in cell) else None,
            "pTmin": pct_of(cell["tmin"]["q"], qs, tmin_t) if (cell and "tmin" in cell) else None,
            "pTcwv": None,
            "station": best["n"] if best else None,
        }
        # 가강수량 평년 대비 — ⚠️ 지점이 남·중·북 셋뿐이라 이름으로 바로 찾는다
        tcell = ((tc.get("points") or {}).get(nm) or {}).get("doy", {}).get(mmdd)
        if tcell and vals.get("tcwv") is not None:
            vals["pTcwv"] = pct_of(tcell["q"], (tc["points"][nm]["qs"]), vals["tcwv"])
            vals["tcwvNormal"] = tcell["q"][3]      # 중앙값 — 화면에서 "평년 47" 로 쓴다

        labels, ev = judge(vals, cell)
        per.append({"pt": nm, "lat": la, "lon": lo,
                    "labels": labels, "evidence": ev, "vals": vals})

    if not per:
        return {"ok": False, "reason": "no-data"}

    # 한반도 라벨 — ⚠️ 세 점 중 **둘 이상**에서 나와야 "한반도가 그렇다"고 쓴다.
    #    한 점만 그러면 그 지역 얘기지 한반도 얘기가 아니다.
    cnt = {}
    for p in per:
        for l in p["labels"]:
            cnt[l] = cnt.get(l, 0) + 1
    national = sorted([l for l, n in cnt.items() if n >= 2])

    prev = load(DST, {}) or {}
    prev_nat = prev.get("national") or []
    prev_date = prev.get("date")
    # 어제 것이 아니면 비교하지 않는다 (며칠 건너뛰었을 수 있다)
    yday = (today - timedelta(days=1)).isoformat()
    comparable = prev_date == yday

    entered = [l for l in national if l not in prev_nat] if comparable else []
    left = [l for l in prev_nat if l not in national] if comparable else []

    # ⚠️⚠️ **연속 2일 규율.** 오늘 바뀌었다고 바로 "벗어났습니다"라고 쓰지 않는다.
    #    어제 판정과 다르고, 그 상태가 **하루 더** 유지돼야 발행한다.
    #    여기서는 후보만 남기고, 발행 여부는 pending 을 보고 정한다.
    pend = prev.get("pending") or {}
    publish = {"entered": [], "left": []}
    pending = {"entered": [], "left": []}
    for l in entered:
        (publish if l in (pend.get("entered") or []) else pending)["entered"].append(l)
    for l in left:
        (publish if l in (pend.get("left") or []) else pending)["left"].append(l)

    doc = {
        "date": today.isoformat(),
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "national": national,
        "entered": entered, "left": left,
            # 실제로 화면에 낼 것 — 이틀 확인된 것만
        "publish": publish, "pending": pending,
        "comparedWith": prev_date if comparable else None,
        "points": per,
        "rules": {
            "kma": KMA, "hiPct": HI_PCT, "loPct": LO_PCT,
            "ko": "열대야·초열대야·폭염 기준은 기상청 정의입니다. "
                  "평년 대비 상위/하위 10%는 저희가 고른 구분선이며, "
                  "1995~2026년 기상청 ASOS 실측 분포로 계산합니다. "
                  "⚠️ 한반도 라벨은 남·중·북 세 점 중 **둘 이상**에서 나와야 붙입니다.",
        },
        "note": {
            "ko": "⚠️ 이것은 예보가 아니라 **오늘 상태 판정**입니다. "
                  "상태가 바뀌어도 연속 2일 확인 전에는 '벗어났다'고 쓰지 않습니다.",
        },
    }
    put(DST, doc, 1800)
    put(f"{ARCH}/{today.isoformat()}.json", doc, 86400)
    print(f"[air-state] {today} 라벨 {national} · 진입 {entered} · 해제 {left} "
          f"· 발행 {publish} · 대기 {pending}")
    return {"ok": True, "date": today.isoformat(), "national": national,
            "entered": entered, "left": left,
            "publish": publish, "pending": pending}
