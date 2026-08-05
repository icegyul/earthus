"""데이터 축적 파이프라인 (§0 장기비전 / §10 "지금 당장 해야 할 일")

왜 지금 만드는가
  이건 나중에 소급이 안 된다. 오늘 안 쌓으면 오늘의 지구는 영원히 없다.
  모델 학습은 유저 수만 명 이후지만, **데이터는 1일차부터** 쌓여야 한다.

무엇을 쌓는가 — 두 종류를 구분해서 쌓는다. 섞으면 나중에 못 쓴다.
  event(사건)      한 번 일어나면 변하지 않는다. id 로 중복을 제거한다.
                   지진 · 쓰나미 경보 · 뉴스이벤트 · 화산 분화
  observation(관측) 같은 대상의 값이 시간에 따라 변한다. 매 시각을 다 남긴다.
                   부이 · 태풍 위치 · 태양활동 · 바람격자
  forecast(예보)    아직 오지 않은 시각에 대한 값. **관측과 절대 섞지 않는다.**
                   섞이면 예측값을 관측값으로 착각해 학습하게 된다 — 되돌릴 수 없는 오염이다.
                   그리고 이건 소급이 불가능한 유일한 종류다: 관측은 기관이 영구
                   보존하지만, 지나간 예보를 돌려주는 API 는 없다.

⚠️ 설계에서 지킨 것
  1) 원자료를 그대로 남긴다. 우리가 만든 라벨(신뢰도 점수 등)은 별도 필드로 붙이되
     원본 값을 덮어쓰지 않는다. 나중에 판정 기준이 바뀌면 원본에서 다시 계산해야 한다.
  2) 스키마 버전을 박아둔다. 필드가 바뀌어도 옛 데이터를 읽을 수 있어야 한다.
  3) Hive 스타일 파티션(dt=YYYY-MM-DD/hh=HH)으로 저장한다.
     나중에 Athena/Glue 가 코드 수정 없이 그대로 읽는다.
  4) JSONL + gzip. Parquet 이 분석엔 낫지만 pyarrow 를 패키징해야 하고,
     지금 규모(하루 수십 MB)에서는 이득보다 복잡도가 크다. 나중에 변환하면 된다.

⚠️ 개인정보
  이 Lambda 는 **공개 데이터만** 다룬다. 사용자 상호작용 로그는 여기 넣지 않는다.
  저장 위치도 archive/ 로, 버킷 정책의 공개 접두사(app·celestrak·clouds·wind·events·
  ocean·solar)에 **들어있지 않다** → 기본 비공개다. 이 접두사를 절대 공개로 열지 말 것.
  사용자 데이터는 Supabase(RLS 적용)에 두고, 학습에 쓸 때 익명화 후 별도 경로로 옮긴다.

출력
  s3://<CACHE_BUCKET>/archive/<dataset>/dt=YYYY-MM-DD/hh=HH/part.jsonl.gz
  s3://<CACHE_BUCKET>/archive/_manifest/dt=YYYY-MM-DD.json   그날 쌓인 것 요약
"""

import gzip
import io
import json
import os
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

SCHEMA_VERSION = 1

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
s3 = boto3.client("s3", region_name=REGION)

UA = {"User-Agent": "earthus-archiver/0.1 (+globe app)"}
BASE = f"https://{BUCKET}.s3.{os.environ.get('CACHE_REGION', 'us-east-2')}.amazonaws.com"

USGS = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
GDACS = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP"
NWS = "https://api.weather.gov/alerts/active?event=Tsunami%20Warning,Tsunami%20Advisory,Tsunami%20Watch"
KP = "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json"


def get_json(url, timeout=45):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def s3_json(key):
    """우리가 이미 만들어 둔 산출물을 읽는다.

    ⚠️ 상류 API 를 다시 부르지 않는다. 이미 Lambda 들이 받아서 정규화해 둔 것을 쓴다.
       그래야 rate limit 을 두 배로 먹지 않고, 앱이 본 값과 쌓이는 값이 같아진다.
    """
    obj = s3.get_object(Bucket=BUCKET, Key=key)
    return json.loads(obj["Body"].read().decode("utf-8", "replace"))


def put_jsonl(dataset, rows, now):
    """파티션 경로에 JSONL.gz 로 쓴다. 행이 없으면 파일을 만들지 않는다."""
    if not rows:
        return 0
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0) as gz:
        for r in rows:
            gz.write((json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n").encode())
    body = buf.getvalue()
    key = (f"archive/{dataset}/dt={now:%Y-%m-%d}/hh={now:%H}/part.jsonl.gz")
    s3.put_object(Bucket=BUCKET, Key=key, Body=body,
                  ContentType="application/x-ndjson", ContentEncoding="gzip")
    print(f"[{dataset}] {len(rows)}행 {len(body)/1024:.0f}KB → {key}")
    return len(rows)


# 데이터셋 → (카탈로그 id, 라이선스 id)
#
# ⚠️ 왜 레코드마다 출처를 박는가
#    합쳐 놓고 나중에 분리하는 건 사실상 불가능하다. 1년 뒤 "이 학습셋을 공개해도 되나",
#    "이 숫자를 논문에 실어도 되나"에 답하려면 행마다 출처가 붙어 있어야 한다.
#    지금 두 필드를 더하는 건 거의 공짜지만, 나중에 붙이는 건 못 한다.
#
# ⚠️ ODbL 자료(adsb.lol)는 여기 없다. 파생 DB 공개 시 동일조건 의무가 전체에 걸리므로
#    같은 아카이브에 섞지 않는다. 넣게 되면 반드시 별도 접두사로 분리할 것.
#
# 자세한 조건·인용문은 prototype/data/catalog.json 에 있다 (이 표와 id 가 맞물린다).
SOURCES = {
    "quake":    ("usgs-quakes",  "US-Gov-Public-Domain"),
    "tsunami":  ("nws-tsunami",  "US-Gov-Public-Domain"),
    "news":     ("gdelt",        "UNVERIFIED"),
    "buoy":     ("ndbc-osmc",    "US-Gov-Public-Domain"),
    "cyclone":  ("gdacs",        "CC-BY-4.0"),
    "solar":    ("noaa-swpc",    "US-Gov-Public-Domain"),
    "wind":     ("open-meteo",   "UNVERIFIED"),
    "forecast": ("open-meteo",   "UNVERIFIED"),
    "wildfire": ("nasa-firms",   "US-Gov-Public-Domain"),
}


def stamp(rec, dataset, kind, now, obs_time=None):
    """모든 행에 공통으로 붙는 것.

    obs_time  자료가 말하는 관측 시각 (없으면 수집 시각)
    fetched   우리가 받은 시각. 둘을 나눠야 지연을 나중에 계산할 수 있다.
    _src      카탈로그의 자료 id — 출처를 되짚는 열쇠
    _lic      라이선스 id — 공개 가능 여부를 행 단위로 판단할 수 있게
    """
    src, lic = SOURCES.get(dataset, (dataset, "UNVERIFIED"))
    return {
        "_v": SCHEMA_VERSION,
        "_ds": dataset,
        "_kind": kind,              # 'event' | 'observation' | 'forecast'
        "_src": src,
        "_lic": lic,
        "_obs": obs_time or now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "_fetched": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        **rec,
    }


# ── 사건(event) ────────────────────────────────────────────────

def collect_quakes(now):
    j = get_json(USGS)
    out = []
    for f in j.get("features", []):
        p = f.get("properties") or {}
        g = (f.get("geometry") or {}).get("coordinates") or [None, None, None]
        if p.get("mag") is None:
            continue
        out.append(stamp({
            "id": f.get("id"),
            "mag": p.get("mag"), "magType": p.get("magType"),
            "lon": g[0], "lat": g[1], "depth_km": g[2],
            "place": p.get("place"),
            "time_ms": p.get("time"), "updated_ms": p.get("updated"),
            "tsunami_flag": p.get("tsunami"),
            "sig": p.get("sig"), "felt": p.get("felt"), "cdi": p.get("cdi"),
            "mmi": p.get("mmi"), "alert": p.get("alert"),
            "net": p.get("net"), "nst": p.get("nst"),
            "gap": p.get("gap"), "rms": p.get("rms"),
            "source": "USGS",
        }, "quake", "event", now,
            obs_time=datetime.fromtimestamp(p["time"] / 1000, timezone.utc)
            .strftime("%Y-%m-%dT%H:%M:%SZ") if p.get("time") else None))
    return out


def collect_tsunami(now):
    j = get_json(NWS)
    out = []
    for f in j.get("features", []):
        p = f.get("properties") or {}
        out.append(stamp({
            "id": p.get("id"), "event": p.get("event"),
            "area": p.get("areaDesc"), "severity": p.get("severity"),
            "urgency": p.get("urgency"), "certainty": p.get("certainty"),
            "sent": p.get("sent"), "expires": p.get("expires"),
            "headline": p.get("headline"),
            "source": "NWS",
        }, "tsunami", "event", now, obs_time=p.get("sent")))
    return out


def collect_news(now):
    """GDELT 신뢰도 채점 결과.

    ⚠️ 우리가 매긴 점수(score/status)는 남기되, 원본 근거(sources/mentions/root)도
       같이 남긴다. 나중에 채점 기준을 바꿔도 원본에서 다시 계산할 수 있어야 한다.
    """
    j = s3_json("events/global.json")
    out = []
    for e in j.get("events", []):
        out.append(stamp({
            "id": e.get("id"), "root": e.get("root"),
            "kind_en": e.get("kindEn"),
            "lat": e.get("lat"), "lon": e.get("lon"), "place": e.get("place"),
            "sources": e.get("sources"), "mentions": e.get("mentions"),
            "merged": e.get("merged"), "age_min": e.get("ageMin"),
            "our_score": e.get("score"), "our_status": e.get("status"),
            "source": "GDELT",
        }, "news", "event", now, obs_time=j.get("generated")))
    return out


# ── 관측(observation) ──────────────────────────────────────────

def collect_buoys(now):
    j = s3_json("ocean/buoys.json")
    out = []
    for b in j.get("buoys", []):
        out.append(stamp({
            "station": b.get("id"), "lat": b.get("lat"), "lon": b.get("lon"),
            "wave_height_m": b.get("wvht"), "wave_period_s": b.get("dpd"),
            "water_temp_c": b.get("wtmp"), "air_temp_c": b.get("atmp"),
            "pressure_hpa": b.get("pres"),
            "wind_speed_ms": b.get("wspd"), "wind_dir_deg": b.get("wdir"),
            "source": "NDBC",
        }, "buoy", "observation", now, obs_time=j.get("generated")))
    return out


def collect_cyclones(now):
    j = get_json(GDACS)
    out = []
    for f in (j.get("features") or []):
        p = f.get("properties") or {}
        g = (f.get("geometry") or {}).get("coordinates") or [None, None]
        if p.get("eventtype") != "TC":
            continue
        out.append(stamp({
            "id": str(p.get("eventid")), "name": p.get("eventname") or p.get("name"),
            "lon": g[0], "lat": g[1],
            "alert": p.get("alertlevel"), "episode": p.get("episodeid"),
            "from_date": p.get("fromdate"), "to_date": p.get("todate"),
            "severity": (p.get("severitydata") or {}).get("severity"),
            "severity_unit": (p.get("severitydata") or {}).get("severityunit"),
            "source": "GDACS",
        }, "cyclone", "observation", now))
    return out


def collect_solar(now):
    meta = s3_json("solar/meta.json")
    rows = [stamp({
        "flare_class": meta.get("flareClass"),
        "xray_flux_wm2": meta.get("xrayFlux"),
        "source": "NOAA SWPC / NASA SDO",
    }, "solar", "observation", now, obs_time=meta.get("generated"))]
    try:
        kp = get_json(KP, timeout=30)
        last = [r for r in kp if r.get("kp_index") is not None][-1]
        rows.append(stamp({
            "kp_index": float(last["kp_index"]),
            "source": "NOAA SWPC",
        }, "solar", "observation", now, obs_time=last.get("time_tag")))
    except Exception as e:                                   # noqa: BLE001
        print("[solar] kp 실패", e)
    return rows


def collect_wind(now):
    """전지구 바람 격자 — 2,376점.

    ⚠️ 격자를 점 2,376행으로 펼치면 시간당 2,376행이 쌓인다. 하루 57,000행.
       이상탐지에는 격자 전체의 시간변화가 중요하므로 그대로 쌓되,
       한 행에 한 격자점을 담아 나중에 어떤 방식으로든 집계할 수 있게 둔다.
    """
    j = s3_json("wind/global.json")
    nx, ny = j.get("nx"), j.get("ny")
    res, lat0, lon0 = j.get("res"), j.get("lat0"), j.get("lon0")
    u, v, t, rh = j.get("u") or [], j.get("v") or [], j.get("t") or [], j.get("rh") or []
    out = []
    for iy in range(ny or 0):
        for ix in range(nx or 0):
            k = iy * nx + ix
            if k >= len(u) or u[k] is None:
                continue
            out.append(stamp({
                "lat": lat0 + iy * res, "lon": lon0 + ix * res,
                "u_ms": u[k], "v_ms": v[k],
                "temp_c": t[k] if k < len(t) else None,
                "rh_pct": rh[k] if k < len(rh) else None,
                "source": "Open-Meteo",
            }, "wind", "observation", now, obs_time=j.get("time")))
    return out


# 예보 스냅샷을 남기는 시각(UTC). 모델이 6시간마다 갱신되므로 4회면 매 갱신을 잡는다.
# ⚠️ 매시간 쌓으면 같은 예보를 24번 복사하게 된다. 갱신 주기에 맞춘다.
FORECAST_HOURS = (0, 6, 12, 18)

# 명시적으로 요청된 데이터셋 — 시각 게이트를 건너뛴다.
# ⚠️ 왜 필요한가: 게이트가 있으면 배포 직후 확인을 6시간 기다려야 한다.
#    "datasets=['forecast']" 로 부르는 건 사람이 일부러 시킨 것이므로 그대로 따른다.
FORCED = set()


def collect_forecast(now):
    """내일 예보 스냅샷 — **지금 버리고 있던 자료**.

    왜 필요한가
      과거 관측은 기관들이 영구 보존한다. 3년 뒤에 받아도 그대로 있다.
      그런데 **"그때 뭐라고 예보했었나"는 어디에도 안 남는다.** 예보는 갱신되면
      덮어써지고, 지나간 예보를 돌려주는 API 는 없다.
      → 예보가 맞았는지 따질 수 있는 자료는 그 시점에 우리가 붙잡은 것뿐이다.
        이건 남들이 나중에 따라 만들 수 없는 자료다.

    검증은 우리 안에서 닫힌다
      관측 쪽은 이미 archive/wind 에 시간당으로 쌓고 있다(격자점별 temp_c).
      한 지점의 하루치 24개를 모으면 실제 최고·최저가 나온다.
      즉 예보(여기)와 관측(archive/wind)이 둘 다 우리 것이라 외부 자료 없이 맞춰볼 수 있다.

    ⚠️ 지점별 시간대(tzo)를 반드시 같이 남긴다.
       "그 지역의 내일"은 지점마다 다른 날짜다. 오프셋이 없으면 어느 24시간을
       비교해야 하는지 알 수 없고, 나중에 복구할 방법도 없다.

    ⚠️ _kind 는 'forecast' 다. observation 과 절대 섞지 말 것 —
       섞이면 "예측값을 관측값으로 착각해 학습"하는 최악의 오염이 된다.
    """
    if now.hour not in FORECAST_HOURS and "forecast" not in FORCED:
        print(f"[forecast] {now.hour}시 — 스냅샷 시각 아님, 건너뜀")
        return []
    j = s3_json("wind/global.json")
    nx, ny = j.get("nx"), j.get("ny")
    res, lat0, lon0 = j.get("res"), j.get("lat0"), j.get("lon0")
    tmax, tmin = j.get("tmax") or [], j.get("tmin") or []
    fu, fv = j.get("fu") or [], j.get("fv") or []
    tzo = j.get("tzo") or []
    fc_date = j.get("fcDate")
    # 리드타임 예보는 별도 파일이다 (global.json 을 키우지 않으려고 나눠 뒀다).
    # ⚠️ 없어도 D+1 은 쌓아야 한다. 없다고 전체를 건너뛰면 안 된다.
    lead_tmax, lead_tmin = [], []
    try:
        lj = s3_json("wind/forecast-leads.json")
        lead_tmax = lj.get("tmax") or []
        lead_tmin = lj.get("tmin") or []
    except Exception as e:                                   # noqa: BLE001
        print("[forecast] 리드타임 파일 없음 —", repr(e)[:80])
    out = []
    for iy in range(ny or 0):
        for ix in range(nx or 0):
            k = iy * nx + ix
            tx = tmax[k] if k < len(tmax) else None
            tn = tmin[k] if k < len(tmin) else None
            fuk = fu[k] if k < len(fu) else None
            if tx is None and tn is None and fuk is None:
                continue                      # 예보가 없는 지점은 만들지 않는다
            leads = {}
            for L in range(len(lead_tmax)):
                a = lead_tmax[L][k] if k < len(lead_tmax[L]) else None
                b = lead_tmin[L][k] if k < len(lead_tmin[L]) else None
                if a is not None or b is not None:
                    leads[f"d{L+1}"] = [a, b]
            out.append(stamp({
                "lat": lat0 + iy * res, "lon": lon0 + ix * res,
                "tz_off_h": tzo[k] if k < len(tzo) else None,
                # ⚠️ 리드타임별 예보 — "3일 전 예보가 얼마나 맞았나"를 물으려면 필요하다.
                #    [최고, 최저] 순서. 없으면 넣지 않는다.
                "leads": leads or None,
                # ⚠️ fc_date 는 전지구 대표값이다. 지점별 정확한 날짜는
                #    tz_off_h 와 _fetched 로 계산한다 (대표값을 지점값이라 부르지 않는다).
                "fc_date_ref": fc_date,
                "tmax_c": tx, "tmin_c": tn,
                "fu_ms": fuk,
                "fv_ms": fv[k] if k < len(fv) else None,
                "source": "Open-Meteo (GFS/ECMWF)",
            }, "forecast", "forecast", now, obs_time=j.get("time")))
    return out


COLLECTORS = {
    "quake": collect_quakes,
    "tsunami": collect_tsunami,
    "news": collect_news,
    "buoy": collect_buoys,
    "cyclone": collect_cyclones,
    "solar": collect_solar,
    "wind": collect_wind,
    "forecast": collect_forecast,
}


# ══════════════════════════════════════════════════════════════
#  공개용 이력 집계 (되감기 기능의 자료)
# ══════════════════════════════════════════════════════════════

HISTORY_DAYS = 7
HISTORY_KEY = "events/history.json"


def roll_history(now, snaps):
    """지난 HISTORY_DAYS 일치 이력을 하나의 공개 파일로 굴린다.

    왜 archive/ 를 직접 안 읽히나
      archive/ 는 비공개 접두사다 (버킷 정책에 없다). 원자료에는 우리가 앞으로
      사용자 상호작용까지 넣을 계획이라, 공개로 열어서는 안 된다.
      → 되감기에 필요한 만큼만 **집계**해서 공개 경로에 따로 쓴다.

    왜 매번 전체를 다시 읽지 않나
      기존 파일을 읽어 이번 시각만 덧붙이고 오래된 것을 떨어낸다.
      매 시각 7일치 원자료를 다시 훑으면 갈수록 느려지고 비용도 늘어난다.

    ⚠️ 집계는 "줄이는" 것이지 "바꾸는" 것이 아니다.
       규모·좌표·시각은 원값을 그대로 옮긴다. 평균을 내거나 반올림하지 않는다.
       (원자료가 필요하면 archive/ 에 그대로 남아 있다)
    """
    try:
        cur = s3_json(HISTORY_KEY)
    except Exception:
        cur = {"schema": SCHEMA_VERSION, "days": HISTORY_DAYS, "series": {}}

    ser = cur.setdefault("series", {})
    stamp = now.strftime("%Y-%m-%dT%H:%M:00Z")

    # ── 태풍: 시각별 위치. 되감으면 경로가 그려진다 ──
    tc = ser.setdefault("cyclone", [])
    for r in snaps.get("cyclone", []):
        tc.append({"t": stamp, "id": r["id"], "name": r["name"],
                   "lat": r["lat"], "lon": r["lon"],
                   "alert": r["alert"], "sev": r.get("severity")})

    # ── 지진: 사건이므로 시각이 자기 안에 있다. id 로 중복을 막는다 ──
    qk = ser.setdefault("quake", [])
    seen_q = {x["id"] for x in qk}
    for r in snaps.get("quake", []):
        if r["id"] in seen_q or (r.get("mag") or 0) < 4.0:
            continue
        qk.append({"t": r["_obs"], "id": r["id"], "mag": r["mag"],
                   "lat": r["lat"], "lon": r["lon"],
                   "depth": r.get("depth_km"), "place": r.get("place")})
        seen_q.add(r["id"])

    # ── 태양: Kp 와 플레어 등급의 시계열 ──
    so = ser.setdefault("solar", [])
    kp = next((r.get("kp_index") for r in snaps.get("solar", []) if r.get("kp_index") is not None), None)
    fl = next((r.get("flare_class") for r in snaps.get("solar", []) if r.get("flare_class")), None)
    if kp is not None or fl:
        so.append({"t": stamp, "kp": kp, "flare": fl})

    # ── 산불: 지역별 총 화재복사강도. 개별 3,900건은 너무 무겁다 ──
    wf = ser.setdefault("wildfire", [])
    tot = snaps.get("wildfire_frp")
    if tot is not None:
        wf.append({"t": stamp, "frp": tot["frp"], "fires": tot["fires"]})

    # ── 이벤트 채점 결과: 깔때기가 시간에 따라 어떻게 변하나 ──
    ev = ser.setdefault("news", [])
    nc = snaps.get("news_counts")
    if nc:
        ev.append({"t": stamp, **nc})

    # 오래된 것 떨어내기
    cutoff = (now - timedelta(days=HISTORY_DAYS)).strftime("%Y-%m-%dT%H:%M:00Z")
    for k in list(ser):
        ser[k] = [x for x in ser[k] if (x.get("t") or "") >= cutoff]

    cur["generated"] = stamp
    cur["from"] = min((x["t"] for v in ser.values() for x in v), default=stamp)
    cur["counts"] = {k: len(v) for k, v in ser.items()}
    cur["note"] = ("Aggregated for replay. Raw observations are retained privately; "
                   "values here are copied unchanged, not averaged.")

    body = json.dumps(cur, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=HISTORY_KEY, Body=body,
                  ContentType="application/json", CacheControl="public, max-age=600")
    print(f"[history] {cur['counts']} {len(body)/1024:.0f}KB")
    return cur["counts"]


# ══════════════════════════════════════════════════════════════
#  태풍 경로 보관 (공개)
# ══════════════════════════════════════════════════════════════

TRACK_KEY = "events/cyclone-tracks.json"
TRACK_RETAIN_DAYS = 7


def chain_track(g):
    """GDACS 경로 구간들을 **연결 순서**로 잇는다.

    ⚠️ Class 의 번호(Line_Line_N)는 시간 순서가 아니다. 한 번 그렇게 믿고 정렬했다가
       경로가 태평양을 가로질러 튀었다 (실측: FAUSTO-26 이 -143° 에서 -109° 로 점프).
       각 구간은 2점 쌍이고 한 구간의 끝점이 다음 구간의 시작점과 정확히 같다.
       그래서 번호를 무시하고 끝점-시작점으로 잇는다.
    """
    segs = []
    for gf in g.get("features", []):
        cls = str((gf.get("properties") or {}).get("Class", ""))
        if not cls.startswith("Line_Line_"):
            continue
        cs = (gf.get("geometry") or {}).get("coordinates") or []
        if len(cs) >= 2:
            segs.append((tuple(cs[0]), tuple(cs[-1])))
    if not segs:
        return []
    nxt = {a: b for a, b in segs}
    ends = {b for _, b in segs}
    # 머리 = 어떤 구간의 끝점도 아닌 시작점
    heads = [a for a, _ in segs if a not in ends]
    start = heads[0] if heads else segs[0][0]
    chain, seen = [start], {start}
    cur = start
    while cur in nxt:
        cur = nxt[cur]
        if cur in seen:          # 고리가 생기면 멈춘다 (자료가 이상한 경우)
            break
        chain.append(cur)
        seen.add(cur)
    return [[round(x, 2), round(y, 2)] for x, y in chain]


def split_at_now(chain, lon, lat):
    """지나온 경로와 예보 경로를 현재 위치에서 자른다.

    ⚠️ GDACS 경로선에는 **앞으로 갈 구간이 함께 들어 있다.**
       (실측: FAUSTO-26 현재 위치는 -139.8,19.7 인데 선은 -165,25.4 까지 이어진다.)
       그대로 "지나온 경로"라고 그리면 아직 가지 않은 자리를 지나갔다고 말하게 된다.
    """
    if not chain or lon is None or lat is None:
        return chain, []
    best, bi = None, 0
    for i, (x, y) in enumerate(chain):
        d = (x - lon) ** 2 + (y - lat) ** 2
        if best is None or d < best:
            best, bi = d, i
    return chain[:bi + 1], chain[bi:]


def roll_cyclone_tracks(now, feats):
    """살아있는 태풍의 **공식 경로**를 받아 두고, 목록에서 빠진 뒤에도 유지한다.

    왜 필요한가 (받은 지적)
      "태풍 노을은 열대성 저압부로 바뀌어서 이제 안 나오는 걸까?
       그래도 2~3일은 구름이 지나가는 거라 계속 위치 추적 라인이 보여줬으면 해"
      GDACS 는 열대저기압 지위를 잃으면 목록에서 통째로 뺀다. 그 순간 앱에서도
      사라진다 — 그런데 그 구름과 비는 며칠 더 실제로 지나간다.

    왜 앱이 직접 안 받나
      경로(geometry)는 폭풍이 살아있을 때만 받을 수 있다. 빠진 뒤에 받으려 하면
      이미 없다. 그러니 **살아있는 동안** 우리가 붙잡아 둬야 한다.
      기기마다 따로 저장하면 사람마다 다른 걸 보게 되므로 서버에 둔다.

    ⚠️ 우리가 만든 경로가 아니다. GDACS 가 준 것을 그대로 옮긴다.
    ⚠️ 빠진 이유(약화·상륙·온대저기압화)는 GDACS 가 알려주지 않는다.
       그래서 live=false 만 기록하고 이유는 적지 않는다. 지어내지 않는다.
    """
    try:
        cur = s3_json(TRACK_KEY)
    except Exception:
        # ⚠️ S3 는 없는 객체에 403 을 준다(404 아님). 첫 실행으로 본다.
        cur = {"storms": []}
    kept = {str(x["id"]): x for x in cur.get("storms", []) if x.get("id") is not None}

    live_ids = set()
    for f in feats:
        p = f.get("properties") or {}
        if p.get("eventtype") != "TC":
            continue
        eid = str(p.get("eventid"))
        live_ids.add(eid)
        geo_url = (p.get("url") or {}).get("geometry")
        c = (f.get("geometry") or {}).get("coordinates") or [None, None]
        track, fcast = [], []
        if geo_url:
            try:
                chain = chain_track(get_json(geo_url))
                track, fcast = split_at_now(chain, c[0], c[1])
            except Exception as e:                           # noqa: BLE001
                print(f"[track] {eid} 경로 실패 {e!r}")

        prev = kept.get(eid) or {}
        # 경로를 못 받았으면 예전 것을 지우지 않는다 — 있는 자료를 잃는 게 더 나쁘다
        if not track:
            track = prev.get("track") or []
            fcast = prev.get("forecast") or []
        kept[eid] = {
            "id": eid,
            "name": p.get("eventname") or p.get("name"),
            "alert": p.get("alertlevel"),
            "live": True,
            "lastSeen": now.strftime("%Y-%m-%dT%H:%M:00Z"),
            "from": p.get("fromdate"), "to": p.get("todate"),
            "track": track,
            # ⚠️ 예보 구간을 지나온 경로와 절대 합치지 않는다. 합치면 아직 가지 않은
            #    자리를 "지나갔다"고 말하는 것이 된다.
            "forecast": fcast,
        }

    # 목록에서 빠진 것 — 경로는 그대로 두고 live 만 내린다
    cutoff = now - timedelta(days=TRACK_RETAIN_DAYS)
    out = []
    for eid, rec in kept.items():
        if eid not in live_ids:
            rec["live"] = False
            try:
                seen = datetime.strptime(rec.get("lastSeen", ""), "%Y-%m-%dT%H:%M:00Z")
                seen = seen.replace(tzinfo=timezone.utc)
            except Exception:                                # noqa: BLE001
                seen = now
            if seen < cutoff:
                continue                                     # 보관 기간이 지났다
        out.append(rec)

    body = json.dumps({
        "generated": now.strftime("%Y-%m-%dT%H:%M:00Z"),
        "retainDays": TRACK_RETAIN_DAYS,
        "source": "GDACS",
        "sourceFull": "Global Disaster Awareness and Coordination System, GDACS",
        "license": "CC BY 4.0",
        "termsUrl": "https://www.gdacs.org/Documents/2025/GDACS_Terms_of_use_Oct_25.pdf",
        "note": {
            "ko": "경로는 GDACS 가 제공한 값입니다. 실시간 목록에서 빠진 폭풍(live=false)도 "
                  "보관 기간 동안 남겨 둡니다. 빠진 이유는 자료에 없어 표시하지 않습니다.",
            "en": "Tracks come from GDACS. Storms that have dropped out of the live list "
                  "(live=false) are retained for the retention window. The reason a storm "
                  "leaves the list is not in the data, so we do not state one.",
        },
        "storms": out,
    }, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=TRACK_KEY, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=600")
    live_n = sum(1 for r in out if r["live"])
    print(f"[track] 총 {len(out)}개 (실시간 {live_n}, 보관 {len(out)-live_n}) {len(body)/1024:.0f}KB")
    return {"total": len(out), "live": live_n}


# ══════════════════════════════════════════════════════════════
#  결측 원장 — "그때 뭘 못 받았나"
# ══════════════════════════════════════════════════════════════

GAP_KEY = "archive/_gaps/dt={dt}.json"

# 매 실행마다 있어야 정상인 산출물. 없으면 그 사실을 기록한다.
EXPECTED = [
    ("wind/global.json", "기상 격자"),
    ("wind/air.json", "대기질 격자"),
    ("wind/stations.json", "지상 관측소"),
    ("ocean/marine.json", "해양 격자"),
    ("ocean/buoys.json", "해양 부이"),
    ("events/wildfire.json", "산불"),
    ("events/global.json", "뉴스 이벤트"),
    ("events/cyclone-tracks.json", "태풍 경로"),
]

# 이 시간을 넘으면 "낡음"으로 본다 (시간)
STALE_H = 6


def roll_gaps(now, errors):
    """무엇을 못 받았는지 남긴다.

    왜 필요한가
      "산불 3,412건" 옆에 "관측 공백 5.0%"가 없으면 심사에서 걸린다.
      그리고 학습 때도 결측을 모르면 0 과 구분하지 못한다.
      ⚠️ 결측은 나중에 복원할 수 없다. 그때 없었다는 사실 자체가 자료다.

    ⚠️ "없음"과 "0"을 구분한다. 산불 0건과 산불 자료 없음은 완전히 다른 말이다.
    """
    rows = []
    for key, name in EXPECTED:
        rec = {"key": key, "name": name}
        try:
            h = s3.head_object(Bucket=BUCKET, Key=key)
            age = (now - h["LastModified"]).total_seconds() / 3600.0
            rec["ok"] = age <= STALE_H
            rec["ageHours"] = round(age, 2)
            rec["bytes"] = h["ContentLength"]
            if not rec["ok"]:
                rec["why"] = f"{age:.1f}시간 전 파일 — {STALE_H}시간 넘게 갱신 안 됨"
        except Exception as e:                               # noqa: BLE001
            # ⚠️ S3 는 없는 객체에 403 을 준다(404 아님). 둘 다 "없음"으로 본다.
            rec["ok"] = False
            rec["why"] = f"없음/접근불가 ({type(e).__name__})"
        rows.append(rec)

    doc = {
        "at": now.strftime("%Y-%m-%dT%H:%M:00Z"),
        "staleHours": STALE_H,
        "expected": len(rows),
        "missing": sum(1 for r in rows if not r["ok"]),
        "items": rows,
        "collectorErrors": errors,
    }

    # 하루치를 한 파일에 이어 붙인다 (시간별 파일 24개보다 다루기 쉽다)
    key = GAP_KEY.format(dt=now.strftime("%Y-%m-%d"))
    try:
        prev = s3_json(key)
        runs = prev.get("runs", [])
    except Exception:                                        # noqa: BLE001
        runs = []
    runs.append(doc)
    body = json.dumps({"dt": now.strftime("%Y-%m-%d"),
                       "note": "그 시각에 무엇이 없었는지 기록. 결측은 소급 복원이 불가능하다.",
                       "runs": runs}, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=key, Body=body,
                  ContentType="application/json; charset=utf-8")
    print(f"[gaps] 기대 {doc['expected']} 중 결측 {doc['missing']}")
    return {"expected": doc["expected"], "missing": doc["missing"]}


def handler(event, context):
    now = datetime.now(timezone.utc)
    only = (event or {}).get("datasets")
    global FORCED
    FORCED = set(only or [])
    summary, errors = {}, {}

    snaps = {}
    for name, fn in COLLECTORS.items():
        if only and name not in only:
            continue
        try:
            rows = fn(now)
            snaps[name] = rows
            summary[name] = put_jsonl(name, rows, now)
        except Exception as e:                               # noqa: BLE001
            # 한 소스가 죽어도 나머지는 쌓여야 한다. 빠진 것은 기록에 남긴다.
            print(f"[{name}] 실패", repr(e))
            errors[name] = str(e)[:200]
            summary[name] = 0

    # 산불 — 합계와 **개별 화재**를 모두 남긴다.
    # ⚠️ 예전에는 합계(총 FRP·건수)만 저장했다. 그러면 "이 불이 어디서 어디로
    #    갔나"를 물을 수 없다 — 1년치를 쌓아도 추적에 못 쓰는 자료가 된다.
    #    wildfire Lambda 가 지속 ID(fid)를 붙이므로, 그 id 로 시간축을 이을 수 있다.
    try:
        wf = s3_json("events/wildfire.json")
        items = wf.get("items", [])
        snaps["wildfire_frp"] = {
            "frp": round(sum(f["frp"] for f in items), 1),
            "fires": wf.get("fires", 0),
            "new": wf.get("newFires"),
            "tracked": wf.get("tracked"),
        }
        # 개별 화재 시계열 — 화재당 한 줄
        rows = []
        for f in items:
            if not f.get("fid"):
                continue          # ID 가 없으면 이을 수 없다 — 저장해도 쓸 수 없다
            rows.append({
                "t": now.strftime("%Y-%m-%dT%H:%M:00Z"),
                "fid": f["fid"],
                "lat": f["lat"], "lon": f["lon"],
                "frp": f["frp"], "peak": f.get("peak"),
                "count": f.get("count"), "spanKm": f.get("spanKm"),
                "firstSeen": f.get("firstSeen"),
                "firstLat": f.get("firstLat"), "firstLon": f.get("firstLon"),
                "movedKm": f.get("movedKm"),
                "peakFrp": f.get("peakFrp"), "peakAt": f.get("peakAt"),
                "seenCount": f.get("seenCount"),
                "sats": f.get("sats"),
                "highConf": f.get("highConf"),
            })
        if rows:
            n = put_jsonl("wildfire", rows, now)
            summary["wildfire"] = n
            print(f"[wildfire] 개별 화재 {n}건 저장")
    except Exception as e:                                   # noqa: BLE001
        print("[wildfire]", repr(e))
        errors["wildfire"] = str(e)[:200]
    # 태풍 경로 보관 — 살아있을 때 붙잡아 둬야 빠진 뒤에도 그릴 수 있다
    try:
        summary["_tracks"] = roll_cyclone_tracks(now, (get_json(GDACS) or {}).get("features") or [])
    except Exception as e:                                   # noqa: BLE001
        print("[track] 실패", repr(e))
        errors["tracks"] = str(e)[:200]

    try:
        snaps["news_counts"] = s3_json("events/global.json").get("counts")
    except Exception as e:                                   # noqa: BLE001
        print("[news counts]", e)

    # 결측 원장 — 무엇이 없었는지 그때 기록해야 한다
    try:
        summary["_gaps"] = roll_gaps(now, errors)
    except Exception as e:                                   # noqa: BLE001
        print("[gaps] 실패", repr(e))

    try:
        summary["_history"] = roll_history(now, snaps)
    except Exception as e:                                   # noqa: BLE001
        print("[history] 실패", repr(e))
        errors["history"] = str(e)[:200]

    # 매니페스트 — 그날 무엇이 얼마나 쌓였는지.
    # ⚠️ 나중에 "이 날은 왜 데이터가 적지?"를 답할 수 있어야 한다.
    #    실패도 같이 적는다. 조용히 빠진 구멍이 제일 위험하다.
    man_key = f"archive/_manifest/dt={now:%Y-%m-%d}.json"
    try:
        man = s3_json(man_key)
    except Exception:
        man = {"date": now.strftime("%Y-%m-%d"), "schema": SCHEMA_VERSION, "hours": {}}
    man["hours"][now.strftime("%H")] = {"rows": summary, "errors": errors,
                                        "at": now.strftime("%Y-%m-%dT%H:%M:%SZ")}
    # ⚠️ COLLECTORS 만 세면 산불이 빠진다 (산불은 집계본에서 따로 가져온다).
    #    실제로 기록된 키 전부를 대상으로 합산한다.
    keys = set(COLLECTORS) | {k for h in man["hours"].values()
                              for k, v in h.get("rows", {}).items() if isinstance(v, int)}
    man["total"] = {k: sum(h["rows"].get(k, 0) for h in man["hours"].values()
                           if isinstance(h["rows"].get(k), int))
                    for k in sorted(keys)}
    s3.put_object(Bucket=BUCKET, Key=man_key,
                  Body=json.dumps(man, ensure_ascii=False).encode(),
                  ContentType="application/json")

    # ⚠️ summary 에 _history(dict) 가 섞여 있다. 숫자만 더한다.
    total = sum(v for v in summary.values() if isinstance(v, int))
    print(f"[archive] {total}행 / 실패 {list(errors)}")
    return {"ok": True, "rows": summary, "errors": errors}
