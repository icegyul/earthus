"""예보 검증 — 모델 예측 vs 기상청 실측

왜 이게 우리 보고서의 핵심인가
  우리는 드물게 **둘 다** 가진 위치에 있다.
    · 모델 예보 : Open-Meteo (GFS · ECMWF)
    · 지상 실측 : 기상청 ASOS 97지점
  이 둘을 매일 짝지어 오차를 기록하면, 1년 뒤 이렇게 말할 수 있다.
    "2026년 한국에서 GFS와 ECMWF 의 기온 예보 오차는 평균 몇 도였고,
     예보 선행시간·계절·지형(해안/내륙/산지)에 따라 어떻게 달랐나"
  공개된 답이 거의 없는 질문이고, 검증은 원래 이렇게 하는 수밖에 없다 —
  **오늘 예보를 저장해 두었다가 내일 실측과 맞춰보는 것.**
  그래서 오늘 시작하지 않으면 1년 뒤에도 못 만든다.

⚠️ 선행시간(lead time)을 반드시 같이 저장해야 한다.
   "3시간 뒤 예보"와 "48시간 뒤 예보"의 오차는 전혀 다르다.
   이걸 안 나누고 평균 내면 아무 의미 없는 숫자가 된다.

⚠️ 모델을 섞지 않는다. best_match 하나만 받으면 "무엇이 틀렸는지" 말할 수 없다.
   GFS 와 ECMWF 를 따로 받아 따로 채점한다.

⚠️ 관측이 결측인 지점은 채점에서 **빼야** 한다. 0 으로 두면 오차가 통째로 거짓이 된다.

동작
  매시간:
    A. 지금 시각의 예보(+1~+51h)를 받아 archive 에 저장 (선행시간별로 나중에 꺼내 쓴다)
    B. 24h·48h 전에 저장해 둔 예보에서 '지금'에 해당하는 값을 꺼내 실측과 비교
    C. 하루 단위로 모아 wind/series/verify-daily.json 에 적재

출력
  archive/verify/fc/<YYYYMMDDHH>.json   (비공개 — 원본 예보 보관)
  wind/series/verify-daily.json         (공개 — 일별 채점 결과)
"""

import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")

UA = {"User-Agent": "earthus/0.1 (+globe app)"}
OM = "https://api.open-meteo.com/v1/forecast"
OBS_KEY = "wind/kma-aws.json"                 # ASOS 97지점 (정시 관측)
FC_PREFIX = "archive/verify/fc/"
SER = "wind/series/verify-daily.json"
KST = timezone(timedelta(hours=9))

# 채점할 모델. ⚠️ 이름을 바꾸면 과거 기록과 이어지지 않는다.
MODELS = ["gfs_seamless", "ecmwf_ifs025"]
VARS = ["temperature_2m", "wind_speed_10m"]
LEADS = [24, 48]                              # 시간. 하나만 두면 비교가 안 된다.
KEEP_DAYS = 760

s3 = boto3.client("s3", region_name=REGION)


def load(key, default=None):
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())
    except Exception:                                    # noqa: BLE001
        return default


def put(key, doc, maxage=None, public=True):
    kw = {}
    if maxage is not None:
        kw["CacheControl"] = f"public, max-age={maxage}"
    s3.put_object(Bucket=BUCKET, Key=key,
                  Body=json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode(),
                  ContentType="application/json; charset=utf-8", **kw)


def stations():
    """실측 파일에서 좌표가 있는 지점만. 순서를 고정해 예보와 짝짓는다."""
    obs = load(OBS_KEY) or {}
    st = [s for s in obs.get("stations", []) if s.get("lat") is not None]
    st.sort(key=lambda s: s["id"])            # ⚠️ 순서 고정. 예보 응답이 이 순서로 온다
    return obs, st


def fetch_forecast(st):
    """한 번의 요청으로 모든 지점·모델의 예보를 받는다.
    ⚠️ Open-Meteo 는 요청 '횟수'로 제한한다. 지점을 쉼표로 묶으면 1회다."""
    q = {
        "latitude": ",".join(f"{s['lat']:.4f}" for s in st),
        "longitude": ",".join(f"{s['lon']:.4f}" for s in st),
        "hourly": ",".join(VARS),
        "models": ",".join(MODELS),
        "timezone": "Asia/Seoul",             # 실측이 KST 라 맞춘다
        # ⚠️ Open-Meteo 풍속 기본 단위는 **km/h** 다. 기상청 관측은 m/s 다.
        #    이걸 빼먹으면 풍속 오차가 ME=+7.06, MAE=7.06 으로 나온다 —
        #    둘이 똑같다는 건 "전부 같은 방향으로 크게 틀렸다"는 뜻이고,
        #    그건 모델이 틀린 게 아니라 우리가 단위를 안 맞춘 것이다.
        "wind_speed_unit": "ms",
        "forecast_days": 3,
        "past_days": 0,
    }
    url = f"{OM}?{urllib.parse.urlencode(q)}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
        j = json.loads(r.read().decode())
    return j if isinstance(j, list) else [j]  # 지점이 1곳이면 dict 로 온다


def hourly_key(model, var):
    """모델을 여러 개 요청하면 키에 모델명이 붙는다 (temperature_2m_gfs_seamless).
    ⚠️ 모델 하나만 요청하면 접미사가 안 붙는다 — 둘 다 대비한다."""
    return f"{var}_{model}", var


def slim(fcs, st, issued):
    """보관용으로 줄인다. 원본을 그대로 두면 한 번에 수 MB 다."""
    out = {"issuedKst": issued, "models": MODELS, "vars": VARS,
           "stations": [s["id"] for s in st], "series": []}
    for i, f in enumerate(fcs):
        h = f.get("hourly") or {}
        rec = {"time": h.get("time", [])}
        for m in MODELS:
            for v in VARS:
                k1, k2 = hourly_key(m, v)
                vals = h.get(k1) if k1 in h else (h.get(k2) if len(MODELS) == 1 else None)
                if vals is not None:
                    rec[f"{m}|{v}"] = vals
        out["series"].append(rec)
    return out


def score(now, obs, st):
    """24h·48h 전 예보를 꺼내 지금 실측과 비교한다."""
    # ⚠️ 실측 시각을 기준으로 맞춘다. '지금'이 아니라 '관측된 시각'이다.
    # ⚠️ observedKst 는 "20260727 16:00" 처럼 **공백과 콜론이 섞여** 온다.
    #    자리수로 잘라 쓰면 "2026-07-27T 1:00" 이 나와 예보 시각과 영원히 안 맞는다.
    #    (실제로 그렇게 짰다가 채점이 0 으로 나왔다.) 숫자만 남겨서 쓴다.
    tm = "".join(c for c in str(obs.get("observedKst") or "") if c.isdigit())
    if len(tm) < 10:
        print("[verify] 관측 시각을 못 읽었다:", obs.get("observedKst"))
        return {}
    want = f"{tm[:4]}-{tm[4:6]}-{tm[6:8]}T{tm[8:10]}:00"
    obs_by_id = {s["id"]: s for s in st}

    out = {}
    for lead in LEADS:
        issued = (now - timedelta(hours=lead)).strftime("%Y%m%d%H")
        fc = load(f"{FC_PREFIX}{issued}.json")
        if not fc:
            continue                                     # 아직 그만큼 안 쌓였다
        ids = fc.get("stations") or []
        # ⚠️ 파일은 있는데 시각이 안 맞는 경우가 가장 위험하다 — 조용히 0점이 된다.
        #    한 번은 관측시각 파싱이 틀려서 그렇게 됐다. 반드시 소리를 낸다.
        t0 = (fc.get("series") or [{}])[0].get("time") or []
        if want not in t0:
            print(f"[verify] ⚠️ {issued} 예보에 {want} 없음 "
                  f"(범위 {t0[0] if t0 else '?'}~{t0[-1] if t0 else '?'})")
            continue
        for m in MODELS:
            for v, obs_field in (("temperature_2m", "temp_c"), ("wind_speed_10m", "wind_ms")):
                errs = []
                for i, sid in enumerate(ids):
                    if i >= len(fc["series"]):
                        break
                    rec = fc["series"][i]
                    times = rec.get("time") or []
                    vals = rec.get(f"{m}|{v}")
                    if not vals or want not in times:
                        continue
                    p = vals[times.index(want)]
                    o = (obs_by_id.get(sid) or {}).get(obs_field)
                    # ⚠️ 결측은 건너뛴다. 0 으로 채우면 오차가 통째로 거짓이 된다.
                    if p is None or o is None:
                        continue
                    errs.append(p - o)
                if len(errs) >= 20:                      # 표본이 너무 적으면 채점하지 않는다
                    n = len(errs)
                    out[f"{m}|{v}|{lead}h"] = {
                        "n": n,
                        "me": round(sum(errs) / n, 3),              # 계통오차(치우침)
                        "mae": round(sum(abs(e) for e in errs) / n, 3),
                        "rmse": round((sum(e * e for e in errs) / n) ** 0.5, 3),
                    }
    return out


def handler(event, context):
    now = datetime.now(KST)
    obs, st = stations()
    if len(st) < 20:
        raise RuntimeError(f"좌표 있는 관측지점이 너무 적다 ({len(st)})")

    # ── A. 지금 예보를 받아 보관 ─────────────────────────────
    issued = now.strftime("%Y%m%d%H")
    saved = False
    try:
        fcs = fetch_forecast(st)
        put(f"{FC_PREFIX}{issued}.json", slim(fcs, st, issued))   # 비공개
        saved = True
    except Exception as e:                               # noqa: BLE001
        # ⚠️ 예보 저장이 실패해도 채점은 계속한다. 어제 예보는 이미 있다.
        print("[verify] 예보 저장 실패 —", repr(e)[:120])

    # ── B. 과거 예보 채점 ────────────────────────────────────
    sc = score(now, obs, st)

    # ── C. 일별 적재 ─────────────────────────────────────────
    doc = load(SER) or {}
    days = doc.get("days", {})
    day = now.strftime("%Y-%m-%d")
    d = days.setdefault(day, {})
    for k, v in sc.items():
        # 같은 날 여러 시각을 표본 수로 가중해 합친다.
        # ⚠️ 단순 평균을 내면 표본이 적은 시각이 과대평가된다.
        cur = d.get(k)
        if cur is None:
            d[k] = dict(v)
        else:
            n = cur["n"] + v["n"]
            for f in ("me", "mae"):
                cur[f] = round((cur[f] * cur["n"] + v[f] * v["n"]) / n, 3)
            cur["rmse"] = round(((cur["rmse"] ** 2 * cur["n"] + v["rmse"] ** 2 * v["n"]) / n) ** 0.5, 3)
            cur["n"] = n

    cut = (now - timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%d")
    days = {k: v for k, v in days.items() if k >= cut}

    put(SER, {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "Open-Meteo (GFS · ECMWF) 예보 vs 기상청 ASOS 실측 — earthus 자체 검증",
        "sourceEn": "Open-Meteo (GFS · ECMWF) forecasts verified against KMA ASOS observations",
        "license": "예보 Open-Meteo (CC BY 4.0) · 관측 기상청 공공누리 제1유형 · 검증 earthus",
        "models": MODELS, "vars": VARS, "leadsHours": LEADS,
        "metrics": {
            "me": "평균오차 — 양수면 모델이 실측보다 높게 본다 (치우침)",
            "mae": "평균절대오차 — 방향 무시하고 얼마나 빗나갔나",
            "rmse": "제곱평균오차 — 큰 오차에 더 민감하다",
            "n": "채점에 쓴 (지점 × 시각) 수",
        },
        "note": {
            "ko": "매시간 예보를 저장해 두었다가 24·48시간 뒤 실측과 맞춰 채점합니다. "
                  "⚠️ 선행시간별로 따로 봐야 합니다 — 24시간 예보와 48시간 예보의 오차는 다릅니다. "
                  "⚠️ 관측 결측 지점은 채점에서 제외합니다. "
                  "표본이 20 미만인 조합은 기록하지 않습니다.",
            "en": "Forecasts are archived hourly and scored against observations 24 and 48 h later. "
                  "⚠️ Lead times must be read separately. Missing observations are excluded; "
                  "combinations with fewer than 20 samples are not recorded.",
        },
        "collectingSince": doc.get("collectingSince") or day,
        "stationCount": len(st),
        "count": len(days),
        "days": dict(sorted(days.items())),
    }, 3600)

    print(f"[verify] 예보저장 {saved} · 채점 {len(sc)}조합 · 누적 {len(days)}일")
    return {"ok": True, "saved": saved, "scored": len(sc), "days": len(days),
            "stations": len(st), "sample": dict(list(sc.items())[:3])}
