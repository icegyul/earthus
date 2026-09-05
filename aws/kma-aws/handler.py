"""기상청 지상 관측 — API허브 경로

왜 필요한가 (받은 요청)
  "기상청_지상(방재, AWS)기상관측자료 조회서비스 이거 오픈되어 있데
   어떻게 서비스 되게 할지 고민해서 서비스 가능하게 해줘"

  지금 한국 관측소는 **8곳**뿐이다 (공항 METAR). 기상청 지상관측망은 훨씬 촘촘하다.

⚠️ 창구가 둘이다 — 허브를 쓴다 (실측으로 골랐다)
     포털 data.go.kr        서비스마다 신청·키 별도, 2년 만료.
                            키가 틀리면 HTTP 500 "Unexpected errors" 만 준다 — 뭐가 문제인지 모른다.
     허브 apihub.kma.go.kr  기상청 직접 운영. **키 하나로 여러 자료**.
                            키가 틀리면 401 + "유효한 인증키가 아닙니다" — 분명하다.
   엔드포인트 9개가 전부 살아 있는 것을 확인했다.

⚠️ 응답이 **JSON 이 아니라 고정폭 텍스트**다.
   맨 앞에 #으로 시작하는 주석 줄로 열 이름이 오고, 그 아래 공백 구분 자료가 온다.
   포털처럼 response.body.items 를 찾으면 안 된다.

⚠️ 관측값에는 **지점번호만** 있고 위경도가 없다.
   stn_inf.php 로 지점표를 따로 받아 붙여야 지도에 올릴 수 있다.
   지점표는 자주 안 바뀌므로 하루 한 번만 받는다.

⚠️ 키를 어디에 두나
   ① 앱(브라우저) 코드에 절대 넣지 않는다. 누구나 읽어 남의 할당량을 쓴다.
   ② 이 Lambda 의 환경변수 **KMA_HUB_KEY** 에 넣는다.
   ③ 대화나 문서에 붙여넣지 않는다. 남는 순간 유출이다.

⚠️ 키가 없으면 아무것도 덮어쓰지 않는다.
   빈 파일을 올리면 앱에서 "관측소 0곳"이 되어 고장으로 보인다.

출력
  s3://<CACHE_BUCKET>/wind/kma-aws.json
  s3://<CACHE_BUCKET>/wind/series/stations.json
  s3://<CACHE_BUCKET>/wind/series/stations/<날짜>.json
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

import kma_hub   # KMA 허브 호출 회계(PHASE 1) — aws/_shared/kma_hub.py, 배포 스크립트가 같이 담는다

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KEY = os.environ.get("KMA_HUB_KEY", os.environ.get("KMA_KEY", "")).strip()

UA = {"User-Agent": "earthus/0.1 (+globe app)"}
DST = "wind/kma-aws.json"
HISTORY_INDEX = "wind/series/stations.json"
HISTORY_PREFIX = "wind/series/stations/"
HISTORY_KEEP_DAYS = 760

# 공공데이터포털 — 방재기상관측(AWS) 초단기실황
HUB = "https://apihub.kma.go.kr/api/typ01/url"
OBS = f"{HUB}/kma_sfctm3.php"     # 지상 매시 관측 (종관·방재 통합)
STN = f"{HUB}/stn_inf.php"        # 지점 정보 (위경도)
STN_KEY = "wind/kma-stations.json"

KST = timezone(timedelta(hours=9))

s3 = boto3.client("s3", region_name=REGION)

# 관측 항목 — API허브 kma_sfctm3 의 열 이름 → 우리 필드.
# ⚠️ 기상청 열 이름을 그대로 남긴다(raw). 우리가 해석을 틀려도 원본에서 다시 읽을 수 있어야 한다.
# ⚠️ 결측은 -9, -99, -999 로 온다. 그대로 쓰면 기온 -99°C 가 된다.
FIELDS = {
    "TA":  ("temp_c",    "기온(°C)"),
    "HM":  ("humid_pct", "습도(%)"),
    "WS":  ("wind_ms",   "풍속(m/s)"),
    "WD":  ("wind_dir",  "풍향(deg)"),
    "RN":  ("rain_mm",   "강수량(mm)"),
    "PA":  ("pres_hpa",  "현지기압(hPa)"),
    "PS":  ("pres_sea",  "해면기압(hPa)"),
    "TD":  ("dewp_c",    "이슬점(°C)"),
    "SI":  ("solar",     "일사(MJ/m²)"),
    "CA":  ("cloud",     "전운량(1/10)"),
    "SD":  ("snow_cm",   "적설(cm)"),
    "WW":  ("weather",   "현재일기"),
}
MISSING = {-9.0, -99.0, -999.0, -9999.0, -50.0}


def load_json(key, default=None):
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())
    except Exception:                                        # noqa: BLE001
        return default


def put_json(key, doc, maxage=600):
    s3.put_object(Bucket=BUCKET, Key=key,
                  Body=json.dumps(doc, ensure_ascii=False,
                                  separators=(",", ":")).encode(),
                  ContentType="application/json; charset=utf-8",
                  CacheControl=f"public, max-age={maxage}")


def get(url, **params):
    """허브 호출. ⚠️ authKey 는 URL 파라미터다. 로그에 찍히지 않게 조심한다."""
    q = urllib.parse.urlencode({**params, "authKey": KEY})
    req = urllib.request.Request(f"{url}?{q}", headers=UA)
    with kma_hub.track(url, url), urllib.request.urlopen(req, timeout=90) as r:
        txt = r.read().decode("euc-kr", "replace")
    # ⚠️ 키가 틀리면 HTTP 200 에 JSON 오류가 오기도 한다. 본문을 봐야 안다.
    if txt.lstrip().startswith("{") and "인증" in txt:
        raise RuntimeError("인증키가 유효하지 않습니다 (허브 응답)")
    return txt


def rows_of(txt):
    """고정폭 텍스트 → 열 이름 목록 + 값 행들.

    ⚠️ 실제 형식 (실측):
        #START7777
        #234567890123...          ← 자리수 눈금
        # YYMMDDHHMI STN  WD  WS ... TA  TD  HM ...   ← **열 이름**
        #        KST  ID  16 m/s ...  C   C   % ...   ← 단위
        202607271300  90  14 2.8 ... 27.1 24.5 86.0
        #7777END

    ⚠️ 주석 줄이 여러 개다. "마지막 주석 줄"을 열 이름으로 쓰면 **단위 줄**을 집는다 —
       실제로 그렇게 해서 STN 대신 ['KST','ID','16','m/s'…] 를 열 이름으로 읽었다.
       열 이름 줄은 STN 같은 **아는 이름이 들어 있는 줄**로 고른다.
    """
    KNOWN = {"STN", "TM", "YYMMDDHHMI"}
    header, out = None, []
    for line in txt.split("\n"):
        t = line.rstrip()
        if not t:
            continue
        if t.startswith("#"):
            if header is not None:
                continue                      # 이미 찾았으면 뒤 주석은 단위 줄이다
            cols = t.lstrip("#").split()
            if len(cols) > 3 and KNOWN & set(cols):
                header = cols
            continue
        out.append(t.split())
    return header, out


def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f in MISSING else f


def store_history(doc):
    """현재 ASOS를 날짜별 공개 관측 이력에 누적한다.

    ⚠️ 예보 검증 사례와 분리한다. 예보 보관 파일이 빠졌다고 실제 관측까지
       사라지면 30일 관측소 상품의 기간이 조용히 구멍 난다.
    ⚠️ 같은 관측 시각을 다시 실행하면 append하지 않고 해당 시각을 교체한다.
    """
    digits = "".join(c for c in str(doc.get("observedKst") or "") if c.isdigit())
    if len(digits) < 10:
        print("[kma-aws] 관측 이력 시각을 못 읽었다:", doc.get("observedKst"))
        return None
    day = f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"
    observed = f"{day}T{digits[8:10]}:00"
    key = f"{HISTORY_PREFIX}{day}.json"
    old = load_json(key, {}) or {}
    hours = old.get("hours") or {}
    rows = []
    meta = old.get("stationMeta") or {}
    value_fields = [field for field, _ in FIELDS.values()]
    for station in doc.get("stations") or []:
        sid = station.get("id")
        if not sid:
            continue
        values = {field: station.get(field) for field in value_fields
                  if station.get(field) is not None}
        if not values:
            continue
        rows.append({"stationId": sid, "values": values})
        if station.get("lat") is not None and station.get("lon") is not None:
            meta[sid] = {
                "name": station.get("name") or sid,
                "lat": station.get("lat"), "lon": station.get("lon"),
                "alt": station.get("alt"),
            }
    hours[observed] = {"n": len(rows), "stations": sorted(rows, key=lambda row: row["stationId"])}
    hours = dict(sorted(hours.items()))
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z")
    put_json(key, {
        "generated": generated,
        "date": day,
        "source": doc.get("source") or "기상청 지상관측 (API허브)",
        "sourceEn": doc.get("sourceEn") or "KMA surface observations (API Hub)",
        "license": "기상청 공공누리 제1유형 · 정규화 earthus",
        "fields": {name: label for _, (name, label) in FIELDS.items()},
        "stationMeta": meta,
        "hourCount": len(hours),
        "rowCount": sum(len(hour.get("stations") or []) for hour in hours.values()),
        "hours": hours,
    })

    index = load_json(HISTORY_INDEX, {}) or {}
    dates = index.get("dates") or {}
    dates[day] = {"path": f"/{key}", "generated": generated,
                  "hours": len(hours),
                  "rows": sum(len(hour.get("stations") or []) for hour in hours.values())}
    cut = (datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=KST)
           - timedelta(days=HISTORY_KEEP_DAYS)).strftime("%Y-%m-%d")
    dates = {date: value for date, value in dates.items() if date >= cut}
    put_json(HISTORY_INDEX, {
        "generated": generated,
        "collectingSince": index.get("collectingSince") or day,
        "source": "기상청 ASOS 지점별 시간 관측 — earthus 공개 이력 목록",
        "count": len(dates), "dates": dict(sorted(dates.items())),
    })
    return {"date": day, "hours": len(hours), "rows": len(rows)}


def stations(refresh=False):
    """지점 번호 → 위경도·이름. 하루 한 번만 받아 S3 에 두고 재사용한다.

    ⚠️ 관측값에는 지점번호만 있다. 이 표가 없으면 지도에 못 올린다.

    refresh=True 면 캐시를 무시하고 새로 받는다.
    ⚠️ 파싱을 고쳤을 때 이게 없으면 **잘못 만든 표를 최대 24시간 그대로 쓴다**.
       실제로 STN 열 중복 버그 때문에 좌표가 29/97 만 붙은 적이 있다.
    """
    try:
        if refresh:
            raise KeyError("refresh")
        cached = json.loads(s3.get_object(Bucket=BUCKET, Key=STN_KEY)["Body"].read())
        age = (datetime.now(timezone.utc)
               - datetime.strptime(cached["generated"], "%Y-%m-%dT%H:%M:00Z")
               .replace(tzinfo=timezone.utc)).total_seconds()
        if age < 86400 and cached.get("stations"):
            return cached["stations"]
    except Exception:                                        # noqa: BLE001
        pass                                                 # 없거나 낡았으면 새로 받는다

    # ⚠️ 지점정보는 **따로 활용신청**이 필요하다 (실측: 403 "활용신청이 필요한 API 입니다").
    #    막혀 있어도 관측값 수집은 멈추지 않는다 — 좌표는 나중에 붙일 수 있지만
    #    오늘 안 받은 관측값은 영영 없다.
    try:
        txt = get(STN, inf="SFC", stn="")
    except urllib.error.HTTPError as e:
        if e.code == 403:
            print("[kma-aws] 지점정보 미신청(403) — 좌표 없이 수집한다")
            return {}
        raise
    header, rows = rows_of(txt)
    out = {}
    if header:
        # ⚠️ 헤더에 **STN 이 두 번** 나온다.
        #      0번 = 지점번호,  9번 = 지점주소코드(STN AD)
        #    dict 컴프리헨션으로 만들면 뒤엣것이 이겨서 주소코드를 지점번호로 읽는다.
        #    속초는 둘 다 90 이라 안 걸리지만, 북춘천은 93/101 로 달라서
        #    다른 지점의 좌표가 붙는다. **먼저 나온 것을 남긴다.**
        idx = {}
        for i, c in enumerate(header):
            idx.setdefault(c, i)
        for r in rows:
            try:
                sid = r[idx.get("STN", 0)]
                lat = float(r[idx["LAT"]]); lon = float(r[idx["LON"]])
            except (KeyError, IndexError, ValueError):
                continue
            nm = None
            for k in ("STN_KO", "STN_SP", "STN_EN"):
                if k in idx and idx[k] < len(r):
                    nm = r[idx[k]]
                    break
            rec = {"lat": round(lat, 4), "lon": round(lon, 4), "name": nm}
            # 해발고도. 산 위 관측소(대관령 772m)와 해안 관측소를 같은 기온으로
            # 비교하면 안 되므로, 화면에서 구분할 수 있게 같이 담는다.
            try:
                rec["alt"] = round(float(r[idx["HT"]]), 1)
            except (KeyError, IndexError, ValueError):
                pass
            out[sid] = rec
    if out:
        s3.put_object(Bucket=BUCKET, Key=STN_KEY,
                      Body=json.dumps({"generated": datetime.now(timezone.utc)
                                       .strftime("%Y-%m-%dT%H:%M:00Z"),
                                       "count": len(out), "stations": out},
                                      ensure_ascii=False, separators=(",", ":")).encode(),
                      ContentType="application/json; charset=utf-8")
    return out


@kma_hub.accounted("kma-aws")
def handler(event, context):
    if not KEY:
        # ⚠️ 옛 파일을 덮어쓰지 않는다. 없는 것과 비어 있는 것은 다르다.
        msg = ("KMA_HUB_KEY 환경변수가 없습니다. 기상청 API허브(apihub.kma.go.kr)에서 "
               "발급받은 인증키를 이 Lambda 의 환경변수에 넣으세요. "
               "⚠️ 앱 코드나 대화에 넣지 마세요.")
        print("[kma-aws] 대기:", msg)
        return {"ok": False, "reason": "no-key", "message": msg}

    now = datetime.now(KST)
    # ⚠️ 정시 자료는 10~20분 뒤에 올라온다. 지금 시각으로 물으면 빈 응답이 온다.
    base = now - timedelta(hours=1)
    tm = base.strftime("%Y%m%d%H00")

    txt = get(OBS, tm1=tm, tm2=tm, stn="0")
    header, rows = rows_of(txt)
    if not header:
        raise RuntimeError("열 이름 줄을 못 찾았다 — 응답 형식이 바뀌었을 수 있다")
    idx = {c: i for i, c in enumerate(header)}
    if "STN" not in idx:
        raise RuntimeError(f"STN 열이 없다. 받은 열: {header[:12]}")

    stn = stations(refresh=bool(event.get("refreshStations")))
    out = []
    for r in rows:
        if len(r) < len(header) // 2:
            continue
        sid = r[idx["STN"]]
        rec = {"id": sid, "raw": {}}
        got = False
        for col, (name, _) in FIELDS.items():
            if col not in idx or idx[col] >= len(r):
                continue
            raw = r[idx[col]]
            rec["raw"][col] = raw
            v = num(raw)
            rec[name] = v
            if v is not None:
                got = True
        if not got:
            continue
        meta = stn.get(sid)
        if meta:
            rec["lat"], rec["lon"], rec["name"] = meta["lat"], meta["lon"], meta.get("name")
            # 해발고도. ⚠️ 없는 지점이 있으므로 있을 때만 넣는다.
            #    산 위(대관령 772m)와 해안을 같은 기온으로 비교하면 안 된다 —
            #    실측: 같은 시각에 대관령 23.8°C, 속초 29.6°C. 6도 차이는 고도 탓이다.
            if meta.get("alt") is not None:
                rec["alt"] = meta["alt"]
        out.append(rec)

    withpos = sum(1 for r in out if r.get("lat") is not None)
    # ⚠️ 좌표가 하나도 없으면 지도에 못 올린다. 그 사실을 파일에 적어 앱이 알게 한다.
    needs_stn = withpos == 0
    if len(out) < 50:
        # 평소 수백 곳이다. 확 줄면 상류가 이상한 것이므로 덮어쓰지 않는다.
        raise RuntimeError(f"관측소가 너무 적다 ({len(out)}) — 덮어쓰지 않는다")

    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "observedKst": f"{tm[:8]} {tm[8:10]}:00",
        "source": "기상청 지상관측 (API허브)",
        "sourceEn": "Korea Meteorological Administration surface observations (API Hub)",
        "license": "공공누리 제1유형 (출처표시)",
        "note": {
            "ko": "기상청 지상관측망의 정시 실황입니다. 예보가 아닙니다. "
                  "⚠️ 결측(-9·-99·-999)은 값을 넣지 않고 비워 두었습니다 — 0 으로 채우면 "
                  "기온 0°C, 무풍처럼 읽힙니다.",
            "en": "Hourly readings from the KMA surface network — not a forecast. "
                  "⚠️ Missing values (-9/-99/-999) are left empty rather than zero-filled, which "
                  "would read as 0°C or calm.",
        },
        "fields": {k: v[1] for k, v in FIELDS.items()},
        "count": len(out),
        "withPosition": withpos,
        "needsStationApi": needs_stn,
        "hint": ("지점정보(stn_inf) 활용신청이 필요합니다 — 좌표가 없어 지도에 표시할 수 없습니다."
                 if needs_stn else None),
        "stations": out,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=600")
    history = store_history(doc)
    print(f"[kma-aws] {len(out)}곳 (좌표 {withpos}) · {tm} · {len(body)/1024:.0f}KB")
    return {"ok": True, "stations": len(out), "withPosition": withpos,
            "observed": tm, "history": history}
