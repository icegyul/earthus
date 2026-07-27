"""세계 지상관측 (GTS SYNOP) — 전 세계 관측소 실황

무엇인가
  세계기상통신망(GTS)으로 들어오는 전 세계 지상관측 전문(SYNOP)이다.
  기상청이 받은 것을 그대로 준다. **모델이 아니라 실측**이고, 수천 지점이다.

왜 큰가
  우리 전지구 자료는 지금까지 전부 모델 격자(Open-Meteo)거나
  공항 METAR(1,900여 곳)뿐이었다. 이건 그 몇 배다.
  관측망 밀도 지도와 국가별 기온 통계가 통째로 좋아진다.

⚠️ **좌표가 안 온다.** WMO 지점번호만 있다.
   NOAA ISD 지점표(공개)로 번호→위경도를 붙인다.
     USAF 6자리 = WMO 5자리 + '0'  (실측 확인: 471080 → 47108 SEOUL CITY)
   ⚠️ gts_syn 의 STN 은 **앞자리 0이 잘려서** 온다 ("4005" = WMO 04005).
      그냥 붙이면 아이슬란드 지점이 통째로 안 맞는다. 5자리로 채워야 한다.

⚠️ **결측값 규칙이 열마다 다르다.** 뭉뚱그리면 자료가 망가진다. 셋으로 나눠 읽는다.
     ① 정수 코드열 (운량·시정·일기)        : -9, -99, -999 가 결측  → inum
     ② 부호 있는 측정열 (기온·이슬점)      : -99, -999 만 결측      → fnum
     ③ 음수 불가 측정열 (풍속·습도·강수·기압) : 음수는 전부 결측      → pnum

   ⚠️ ②에서 **-9.0°C 는 멀쩡한 기온이다.** 여기에 -9 를 결측으로 걸면
      겨울 고위도 관측이 통째로 사라진다.
   ⚠️ 그렇다고 ③까지 ②처럼 읽으면 안 된다. 실측(2026-07-27)에서
      풍속 -9.0 이 177곳 왔다 — '-9 m/s 로 부는 바람'은 없다.
   ⚠️ 반대로 임계값(예: -50 이하는 결측)으로 뭉뚱그려도 안 된다.
      남극은 실제로 -80°C 가 나온다.

⚠️ 결측을 걸러도 **물리적으로 불가능한 값이 남는다.** sanity() 가 따로 본다.
   실측: 프랑스 07xxx 46곳이 ta≈-273°C(절대영도), 타지키스탄 내륙이 98 m/s.

출력
  wind/gts-global.json    전 세계 지상관측 실황
  wind/wmo-stations.json  WMO 번호 → 위경도 (한 달에 한 번 갱신)
"""

import csv
import io
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KEY = os.environ.get("KMA_HUB_KEY", "").strip()

OBS = "https://apihub.kma.go.kr/api/typ01/url/gts_syn.php"
ISD = "https://www.ncei.noaa.gov/pub/data/noaa/isd-history.csv"
UA = {"User-Agent": "earthus/0.1 (+globe app)"}
DST = "wind/gts-global.json"
STN = "wind/wmo-stations.json"

# 열 위치 — 주석의 자[尺] 줄에서 읽었다
I_TM, I_STN, I_CA, I_WD, I_WS = 0, 1, 7, 8, 9
I_TA, I_TD, I_HM, I_PA, I_PS = 10, 11, 12, 13, 14
I_RN, I_TMAX, I_TMIN = 17, 26, 27

FLOAT_MISS = {-99.0, -999.0, -9999.0}   # 실수 측정열
INT_MISS = {-9.0, -99.0, -999.0}        # 정수 코드열 (-9 도 결측)

s3 = boto3.client("s3", region_name=REGION)


def fnum(v):
    """**부호가 있을 수 있는** 측정값 (기온·이슬점).
    ⚠️ 여기서 -9 는 결측이 아니다 — -9.0°C 는 멀쩡한 기온이다."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f in FLOAT_MISS else f


def pnum(v):
    """**음수가 될 수 없는** 측정값 (풍속·습도·강수·기압).

    ⚠️ 이 열들에는 -9 가 결측 기호로 온다. 실측(2026-07-27): 57지점 표본 중 2곳이
       풍속 -9.0 이었고, 전체로는 177곳이었다.
       이걸 fnum 으로 읽으면 '-9 m/s 로 부는 바람'이 되고,
       나중에 물리검사에서 버려도 "이상값"으로 잘못 집계된다.
       **음수는 여기서 결측으로 처리한다.** 이상값 집계와 결측을 섞지 않는다.
    """
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if (f in FLOAT_MISS or f < 0) else f


def inum(v):
    """정수 코드값. 여기서는 -9 가 결측이다."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f in INT_MISS else int(f)


# 지구에서 실제로 관측된 극값. 기록은 -89.2°C(보스토크) ~ 56.7°C(데스밸리)다.
# 여유를 두되, **물리적으로 불가능한 값은 반드시 거른다.**
TA_MIN, TA_MAX = -95.0, 60.0

# 풍속 상한. ⚠️ SYNOP 은 풍속을 두 자리(00~99)로 싣고, 99 이상이면 별도 그룹에 담는다.
#   그래서 90대 값은 해독이 어긋난 경우가 많다.
#   실측(2026-07-27): 타지키스탄 내륙 Pyandj 가 98.0 m/s(353km/h), 기온 39.3°C 로 왔다.
#   태풍도 없는 내륙에서 나올 수 없는 값이다. 이런 게 하나 섞이면
#   "지금 지구에서 가장 바람이 센 곳"이 통째로 거짓이 된다.
#   지상 정규관측에서 신뢰할 만한 상한을 75m/s(270km/h)로 두고, 넘으면 버린다.
WS_MAX = 75.0


def sanity(rec):
    """물리적으로 말이 안 되는 값을 걷어낸다.

    ⚠️ 왜 필요한가 (실측): 프랑스 07xxx 블록 46곳이 ta≈-273.0(절대영도) 에
       hm=1.0 으로 왔다. 그런데 같은 줄의 이슬점은 12.7°C 였다 —
       **이슬점이 기온보다 높을 수는 없다.** 전문 해독이 깨진 것이다.
       결측 기호(-99 등)로는 안 걸리므로 물리 검사가 따로 필요하다.

    ⚠️ 기온이 깨졌으면 **습도도 같이 버린다.** 같은 해독에서 나온 값이라
       하나만 믿을 근거가 없다. 이슬점은 따로 판단한다.
    """
    dropped = []
    ta = rec.get("ta")
    if ta is not None and not (TA_MIN <= ta <= TA_MAX):
        rec.pop("ta", None)
        rec.pop("hm", None)
        dropped.append("ta")
        ta = None
    hm = rec.get("hm")
    if hm is not None and not (0 <= hm <= 100):
        rec.pop("hm", None)
        dropped.append("hm")
    td = rec.get("td")
    if td is not None:
        # 이슬점은 기온을 넘을 수 없다 (반올림 여유 0.5°C).
        if not (TA_MIN <= td <= TA_MAX) or (ta is not None and td > ta + 0.5):
            rec.pop("td", None)
            dropped.append("td")
    ws = rec.get("ws")
    if ws is not None and ws > WS_MAX:     # 음수는 이미 pnum 이 걸렀다
        rec.pop("ws", None)
        rec.pop("wd", None)          # 풍속 해독이 깨졌으면 풍향도 믿을 수 없다
        dropped.append("ws")
    return dropped


def load(key):
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())
    except Exception:                                    # noqa: BLE001
        return None


def put(key, doc, maxage):
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=key, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl=f"public, max-age={maxage}")
    return len(body)


def wmo_table(refresh=False):
    """WMO 번호 → 위경도·이름. NOAA ISD 지점표에서 만든다.
    ⚠️ 3MB 를 매번 받지 않는다. 한 달에 한 번이면 충분하다 (지점은 자주 안 바뀐다)."""
    if not refresh:
        c = load(STN)
        if c and c.get("stations"):
            try:
                age = (datetime.now(timezone.utc)
                       - datetime.strptime(c["generated"], "%Y-%m-%dT%H:%M:00Z")
                       .replace(tzinfo=timezone.utc)).days
                if age < 30:
                    return c["stations"]
            except Exception:                            # noqa: BLE001
                return c["stations"]

    with urllib.request.urlopen(urllib.request.Request(ISD, headers=UA), timeout=180) as r:
        txt = r.read().decode("utf-8", "replace")

    out = {}
    for row in csv.DictReader(io.StringIO(txt)):
        u = (row.get("USAF") or "").strip()
        # ⚠️ WMO 지점은 USAF 가 'WMO5자리 + 0' 이다. 그 외(999999, 항공전용)는 건너뛴다.
        if len(u) != 6 or not u.isdigit() or u == "999999" or not u.endswith("0"):
            continue
        try:
            lat, lon = float(row["LAT"]), float(row["LON"])
        except (KeyError, TypeError, ValueError):
            continue
        # ⚠️ 0,0 은 좌표가 아니라 '모름'이다 (기니만 한복판에 지점이 쌓인다).
        if lat == 0 and lon == 0:
            continue
        wmo, end = u[:5], (row.get("END") or "")
        prev = out.get(wmo)
        if prev is None or end > prev.get("end", ""):     # 같은 번호가 여러 줄이면 최신
            rec = {"name": (row.get("STATION NAME") or "").strip().title(),
                   "ctry": (row.get("CTRY") or "").strip(),
                   "lat": round(lat, 4), "lon": round(lon, 4), "end": end}
            try:
                rec["alt"] = round(float(row.get("ELEV(M)")), 1)
            except (TypeError, ValueError):
                pass
            out[wmo] = rec
    if len(out) < 5000:
        raise RuntimeError(f"WMO 지점표가 너무 작다 ({len(out)}) — 덮어쓰지 않는다")

    put(STN, {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "NOAA NCEI Integrated Surface Database station history",
        "license": "미국 정부 저작물 — 퍼블릭 도메인",
        "note": {
            "ko": "WMO 지점번호 → 위경도. USAF 6자리가 'WMO 5자리 + 0' 인 것만 골랐습니다.",
            "en": "WMO id → coordinates, taken from ISD rows whose 6-digit USAF is WMO id + '0'.",
        },
        "count": len(out), "stations": out,
    }, 86400)
    return out


def handler(event, context):
    if not KEY:
        return {"ok": False, "reason": "no-key"}
    # ⚠️ gts_syn 의 시각은 **UTC** 다. KST 로 물으면 9시간 미래를 요청하게 되어
    #    빈 응답이 온다 (실제로 그렇게 짰다가 0지점이 나왔다).
    now = datetime.now(timezone.utc)

    try:
        table = wmo_table(refresh=bool(event.get("refreshStations")))
    except Exception as e:                               # noqa: BLE001
        print("[gts] 지점표 실패 —", repr(e)[:100])
        table = load(STN) or {}
        table = table.get("stations", {}) if isinstance(table, dict) else {}
    if not table:
        raise RuntimeError("WMO 지점표가 없다 — 좌표를 못 붙인다")

    # 정시 자료. 조금 물러나 물어야 이미 들어온 것을 받는다.
    tm = (now - timedelta(hours=int(event.get("backHours") or 2))).strftime("%Y%m%d%H00")
    q = urllib.parse.urlencode({"tm": tm, "authKey": KEY})
    try:
        with urllib.request.urlopen(urllib.request.Request(f"{OBS}?{q}", headers=UA),
                                    timeout=120) as r:
            txt = r.read().decode("euc-kr", "replace")
    except urllib.error.HTTPError as e:
        if e.code == 403:
            return {"ok": False, "reason": "not-approved", "api": "gts_syn"}
        raise

    out, unmatched, seen, fixed = [], 0, set(), {}
    for line in txt.split("\n"):
        t = line.strip()
        if not t or t.startswith("#"):
            continue
        f = t.split()
        if len(f) < 15:
            continue
        # ⚠️ 앞자리 0이 잘려서 온다. 5자리로 채워야 아이슬란드(04xxx)가 맞는다.
        wmo = f[I_STN].zfill(5)
        if wmo in seen:
            continue
        m = table.get(wmo)
        if not m:
            unmatched += 1
            continue
        seen.add(wmo)
        rec = {"id": wmo, "name": m["name"], "ctry": m["ctry"],
               "lat": m["lat"], "lon": m["lon"], "tm": f[I_TM]}
        if m.get("alt") is not None:
            rec["alt"] = m["alt"]
        # 부호가 있을 수 있는 값 (영하가 정상이다)
        for key, i in (("ta", I_TA), ("td", I_TD),
                       ("tmax", I_TMAX), ("tmin", I_TMIN)):
            if i < len(f):
                v = fnum(f[i])
                if v is not None:
                    rec[key] = v
        # 음수가 될 수 없는 값 — 여기서는 -9 도 결측이다
        for key, i in (("hm", I_HM), ("ws", I_WS),
                       ("ps", I_PS), ("pa", I_PA), ("rn", I_RN)):
            if i < len(f):
                v = pnum(f[i])
                if v is not None:
                    rec[key] = v
        for key, i in (("wd", I_WD), ("cloud", I_CA)):
            if i < len(f):
                v = inum(f[i])
                if v is not None:
                    rec[key] = v
        bad = sanity(rec)
        for k in bad:
            fixed[k] = fixed.get(k, 0) + 1
        out.append(rec)

    if len(out) < 200:
        raise RuntimeError(f"지점이 너무 적다 ({len(out)}) — 덮어쓰지 않는다")

    temps = [r["ta"] for r in out if "ta" in r]
    countries = sorted({r["ctry"] for r in out if r["ctry"]})
    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "observedUtc": tm,
        "source": "세계기상통신망(GTS) 지상관측 — 기상청 API허브 · 좌표 NOAA ISD",
        "sourceEn": "GTS SYNOP surface observations via KMA API Hub; coordinates from NOAA ISD",
        "license": "관측 공공누리 제1유형 · 좌표 미국 정부 퍼블릭 도메인",
        "note": {
            "ko": "전 세계 지상관측소가 정시에 보낸 실측입니다 — 모델이 아닙니다. 시각은 UTC입니다. "
                  "좌표는 원자료에 없어서 NOAA 지점표로 붙였습니다. "
                  "⚠️ 지점표에 없는 번호는 지도에 못 올려 제외했습니다(아래 unmatched).",
            "en": "Hourly surface observations reported worldwide — measurements, not model output. "
                  "Times are UTC. Coordinates are joined from the NOAA ISD station table; ids "
                  "missing from that table are excluded (see unmatched).",
        },
        "count": len(out),
        # ⚠️ 못 붙인 수를 숨기지 않는다. 이게 늘면 지점표를 갱신해야 한다는 신호다.
        "unmatched": unmatched,
        # ⚠️ 물리 검사로 버린 값의 수. 숨기지 않는다 — 이게 늘면 상류가 이상하다는 신호다.
        "droppedImplausible": fixed,
        "countryCount": len(countries),
        "tempRange": ([round(min(temps), 1), round(max(temps), 1)] if temps else None),
        "stations": out,
    }
    kb = put(DST, doc, 1800)
    print(f"[gts] {len(out)}지점 · 미매칭 {unmatched} · {len(countries)}개국 · {kb/1024:.0f}KB")
    return {"ok": True, "stations": len(out), "unmatched": unmatched, "dropped": fixed,
            "countries": len(countries), "tempRange": doc["tempRange"],
            "kb": round(kb / 1024)}
