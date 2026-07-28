"""영국 Met Office DataHub — Site Specific (Global Spot) 지점예보

왜 이걸 받는가
  gts-global 이 이미 영국 WMO 지점의 **관측**을 가져온다 (03xxx 대역).
  이쪽이 주는 건 **예보**다 — 48시간 시간별. 겹치지 않고 채워 넣는 값이다.
  한국(kma-mountain) 말고는 예보가 있는 나라가 아직 없다.

⚠️ 호출 예산이 하루 360회다 (무료 Site-Specific Global Spot, 00 UTC 리셋).
   그래서 지점 수와 주기를 곱해서 예산 안에 넣어야 한다.
     36지점 × 3시간마다(하루 8회) = 288회/일  (예산의 80%)
   남는 72회는 재시도·수동 테스트용 여유다. **지점을 늘리려면 주기를 늘려라.**
   출처: https://datahub.metoffice.gov.uk/pricing/site-specific

⚠️ **약관 확인이 아직 안 끝났다.** 2026-07-28 기준:
     · 필수 문구는 확인됨 — "Powered by Met Office data" (FAQ 명시)
     · 재배포 허용 문구도 FAQ 에 있음 — "download, use, copy, publish,
       distribute, transmit, adapt and exploit ... for use in your application"
     · 그런데 그 문구가 **유료 상품 설명 옆**에 있어서 무료 플랜에도 그대로
       적용되는지 단정할 수 없다. 원문 T&C PDF 는 현재 404 다.
   → 오픈 전에 반드시 확인할 것. licensing@metoffice.gov.uk
   → 확인 전까지 **프런트엔드에 노출하지 않는다** (수집만 한다).
   호주 BoM 을 안 쓰기로 한 것과 같은 이유다. 모르면 안 쓴다.

⚠️ significantWeatherCode 표는 **DataPoint 시절 공개문서 기준**이고
   DataHub 공식 문서로 대조하지 못했다. 그래서 표에 **없는 코드가 오면
   라벨을 지어내지 않고 비워 둔 뒤 로그에 남긴다.** 조용히 틀리는 것보다 낫다.

입력
  METOFFICE_KEY   환경변수. ⚠️ 코드·저장소·대화 어디에도 넣지 말 것.

출력
  s3://<CACHE_BUCKET>/events/uk-forecast.json
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KEY = os.environ.get("METOFFICE_KEY", "").strip()

BASE = "https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/hourly"
DST = "events/uk-forecast.json"

WORKERS = 6         # ⚠️ 올리지 말 것. 남의 서버다.
TIMEOUT = 20
HOURS_KEPT = 25     # 지금부터 24시간 + 현재시각 1개
CALL_CAP = 40       # 한 회차 호출 상한 — 예산 사고 방지용 하드스톱

# ── 지점 ────────────────────────────────────────────────────
# 36개. 잉글랜드 20 · 스코틀랜드 10 · 웨일스 4 · 북아일랜드 2.
# ⚠️ 늘리면 하루 호출이 곧바로 늘어난다 (지점수 × 8).
#
# 'summit': True 인 두 곳은 산 정상이다.
#   ⚠️ 처음엔 "10km 격자라 정상을 해상 못 한다"고 적어 뒀는데 **틀렸다.**
#      실측 2026-07-28: 벤네비스 모델고도 1344m / 실제 1345m (오차 1m),
#      스노든 1040m / 1085m, 격자거리 68~226m.
#      Site Specific 은 격자 원값이 아니라 **지점으로 후처리된 값**이다.
#      물리 교차검증도 통과 — 벤네비스 vs 포트윌리엄(12km) 기온감률 6.0°C/km
#      (표준 환경감률 6.5 · 습윤단열 5.0 사이).
#   그래도 flag 는 남긴다 — 화면에서 "정상"이라고 알려주는 게 정보다.
SITES = [
    # 잉글랜드
    ("London",            "런던",         51.5074,  -0.1278, "England"),
    ("Birmingham",        "버밍엄",       52.4862,  -1.8904, "England"),
    ("Manchester",        "맨체스터",     53.4808,  -2.2426, "England"),
    ("Liverpool",         "리버풀",       53.4084,  -2.9916, "England"),
    ("Leeds",             "리즈",         53.8008,  -1.5491, "England"),
    ("Sheffield",         "셰필드",       53.3811,  -1.4701, "England"),
    ("Bristol",           "브리스톨",     51.4545,  -2.5879, "England"),
    ("Newcastle",         "뉴캐슬",       54.9783,  -1.6178, "England"),
    ("Nottingham",        "노팅엄",       52.9548,  -1.1581, "England"),
    ("Southampton",       "사우샘프턴",   50.9097,  -1.4044, "England"),
    ("Norwich",           "노리치",       52.6309,   1.2974, "England"),
    ("Plymouth",          "플리머스",     50.3755,  -4.1427, "England"),
    ("Brighton",          "브라이턴",     50.8225,  -0.1372, "England"),
    ("Oxford",            "옥스퍼드",     51.7520,  -1.2577, "England"),
    ("Cambridge",         "케임브리지",   52.2053,   0.1218, "England"),
    ("York",              "요크",         53.9600,  -1.0873, "England"),
    ("Carlisle",          "칼라일",       54.8925,  -2.9329, "England"),
    ("Penzance",          "펜잰스",       50.1186,  -5.5370, "England"),
    ("Dover",             "도버",         51.1279,   1.3134, "England"),
    ("Blackpool",         "블랙풀",       53.8175,  -3.0357, "England"),
    # 스코틀랜드
    ("Edinburgh",         "에든버러",     55.9533,  -3.1883, "Scotland"),
    ("Glasgow",           "글래스고",     55.8642,  -4.2518, "Scotland"),
    ("Aberdeen",          "애버딘",       57.1497,  -2.0943, "Scotland"),
    ("Inverness",         "인버네스",     57.4778,  -4.2247, "Scotland"),
    ("Dundee",            "던디",         56.4620,  -2.9707, "Scotland"),
    ("Fort William",      "포트윌리엄",   56.8198,  -5.1052, "Scotland"),
    ("Stornoway",         "스토너웨이",   58.2090,  -6.3890, "Scotland"),
    ("Lerwick",           "러윅",         60.1547,  -1.1494, "Scotland"),
    ("Kirkwall",          "커크월",       58.9809,  -2.9605, "Scotland"),
    ("Ben Nevis",         "벤네비스",     56.7969,  -5.0036, "Scotland"),
    # 웨일스
    ("Cardiff",           "카디프",       51.4816,  -3.1791, "Wales"),
    ("Swansea",           "스완지",       51.6214,  -3.9436, "Wales"),
    ("Aberystwyth",       "애버리스트위스", 52.4140, -4.0810, "Wales"),
    ("Yr Wyddfa",         "스노든",       53.0685,  -4.0764, "Wales"),
    # 북아일랜드
    # ⚠️ Derry/Londonderry 는 두 이름이 다 쓰인다. 한쪽만 쓰면 정치적 함의가
    #    생기므로 병기한다 (BBC 북아일랜드 관행).
    ("Belfast",             "벨파스트",   54.5973,  -5.9301, "Northern Ireland"),
    ("Derry/Londonderry",   "데리",       54.9966,  -7.3086, "Northern Ireland"),
]
SUMMITS = {"Ben Nevis", "Yr Wyddfa"}

# ⚠️ 출처: DataPoint 시절 공개 문서. DataHub 공식 문서로 대조하지 못했다.
#    표에 없는 코드가 오면 라벨을 비우고 unknown_codes 에 담아 로그로 남긴다.
WX = {
    0: ("맑음(밤)", "☾"),        1: ("맑음", "☀"),
    2: ("구름조금(밤)", "☁"),    3: ("구름조금", "⛅"),
    5: ("연무", "☁"),            6: ("안개", "🌫"),
    7: ("흐림", "☁"),            8: ("매우 흐림", "☁"),
    9: ("약한 소나기(밤)", "🌦"), 10: ("약한 소나기", "🌦"),
    11: ("이슬비", "🌧"),         12: ("약한 비", "🌧"),
    13: ("강한 소나기(밤)", "🌧"), 14: ("강한 소나기", "🌧"),
    15: ("강한 비", "🌧"),        16: ("진눈깨비 소나기(밤)", "🌨"),
    17: ("진눈깨비 소나기", "🌨"), 18: ("진눈깨비", "🌨"),
    19: ("우박 소나기(밤)", "🌨"), 20: ("우박 소나기", "🌨"),
    21: ("우박", "🌨"),           22: ("약한 눈 소나기(밤)", "🌨"),
    23: ("약한 눈 소나기", "🌨"),  24: ("약한 눈", "❄"),
    25: ("강한 눈 소나기(밤)", "🌨"), 26: ("강한 눈 소나기", "🌨"),
    27: ("강한 눈", "❄"),         28: ("뇌우(밤)", "⛈"),
    29: ("뇌우", "⛈"),            30: ("천둥", "⛈"),
}

# 시간별 항목에서 우리가 쓰는 것만 고른다. 없으면 None 으로 둔다 — 지어내지 않는다.
FIELDS = [
    ("screenTemperature",        "ta"),
    ("feelsLikeTemperature",     "feels"),
    ("windSpeed10m",             "ws"),
    ("windDirectionFrom10m",     "wd"),
    ("windGustSpeed10m",         "gust"),
    ("screenRelativeHumidity",   "hm"),
    ("mslp",                     "pa"),
    ("visibility",               "vis"),
    ("uvIndex",                  "uv"),
    ("probOfPrecipitation",      "pop"),
    ("precipitationRate",        "rnRate"),
    ("totalPrecipAmount",        "rn"),
    ("screenDewPointTemperature", "td"),
]

_unknown_codes = set()


def fetch(site):
    """지점 하나. 실패하면 None 을 돌려주고 회차 전체를 죽이지 않는다."""
    en, ko, lat, lon, region = site
    qs = urllib.parse.urlencode({
        "latitude": f"{lat}",
        "longitude": f"{lon}",
        "excludeParameterMetadata": "true",
        "includeLocationName": "true",
    })
    req = urllib.request.Request(
        f"{BASE}?{qs}",
        headers={"apikey": KEY, "accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            doc = json.loads(r.read())
    except urllib.error.HTTPError as e:
        # 429 = 예산 초과. 이건 조용히 넘기면 안 된다.
        body = ""
        try:
            body = e.read()[:200].decode("utf-8", "replace")
        except Exception:
            pass
        print(f"✗ {en}: HTTP {e.code} {body}")
        return None
    except Exception as e:
        print(f"✗ {en}: {type(e).__name__} {e}")
        return None

    feats = doc.get("features") or []
    if not feats:
        print(f"✗ {en}: features 비어 있음")
        return None
    props = feats[0].get("properties") or {}
    series = props.get("timeSeries") or []
    if not series:
        print(f"✗ {en}: timeSeries 비어 있음")
        return None

    coords = (feats[0].get("geometry") or {}).get("coordinates") or []
    alt = coords[2] if len(coords) > 2 else None

    hours = []
    for row in series[:HOURS_KEPT]:
        h = {"t": row.get("time")}
        for src, dst in FIELDS:
            v = row.get(src)
            h[dst] = v if isinstance(v, (int, float)) else None
        code = row.get("significantWeatherCode")
        h["wxCode"] = code
        if isinstance(code, int) and code in WX:
            h["wx"], h["icon"] = WX[code]
        else:
            h["wx"], h["icon"] = None, None
            if code is not None:
                _unknown_codes.add(code)
        hours.append(h)

    now = hours[0] if hours else {}
    rec = {
        "id": en.lower().replace(" ", "-").replace("/", "-"),
        "name": en,
        "nameKo": ko,
        "region": region,
        "lat": lat,
        "lon": lon,
        "alt": alt,
        # 요청 좌표와 모델 격자점 사이 거리(m). 크면 그만큼 대표성이 떨어진다.
        "gridDist": props.get("requestPointDistance"),
        "modelRun": props.get("modelRunDate"),
        "now": {k: now.get(k) for k in ("ta", "feels", "ws", "wd", "wx", "icon", "pop")},
        "hours": hours,
    }
    if en in SUMMITS:
        rec["summit"] = True
    return rec


def handler(event=None, context=None):
    if not KEY:
        raise RuntimeError(
            "METOFFICE_KEY 환경변수가 비어 있다. "
            "Lambda 콘솔 → 구성 → 환경 변수 에서 넣을 것 (코드에 넣지 말 것)."
        )

    sites = SITES[:CALL_CAP]
    if len(SITES) > CALL_CAP:
        print(f"⚠️ 지점 {len(SITES)}개 중 {CALL_CAP}개만 호출 (CALL_CAP)")

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        out = [r for r in ex.map(fetch, sites) if r]

    # 조용한 실패를 막는 가드. 절반도 못 받았으면 예전 파일을 덮지 않는다.
    if len(out) < len(sites) // 2:
        raise RuntimeError(
            f"지점이 너무 적다 ({len(out)}/{len(sites)}) — "
            f"키·예산(360콜/일)·엔드포인트를 의심할 것. 기존 파일은 그대로 둔다."
        )

    if _unknown_codes:
        print(f"⚠️ 표에 없는 significantWeatherCode: {sorted(_unknown_codes)} — 라벨 비움")

    payload = {
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "Met Office DataHub — Site Specific (Global Spot)",
        # ⚠️ 필수 문구다. 화면에서 빼지 말 것.
        "_lic": "Powered by Met Office data",
        "_licNote": "무료 플랜 재배포 약관 확인 전 — 프런트엔드 노출 보류",
        "callsThisRun": len(sites),
        "budgetPerDay": 360,
        "requested": len(sites),
        "received": len(out),
        "unknownWxCodes": sorted(_unknown_codes),
        "sites": out,
    }

    boto3.client("s3", region_name=REGION).put_object(
        Bucket=BUCKET, Key=DST,
        Body=json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode(),
        ContentType="application/json; charset=utf-8",
        CacheControl="public, max-age=900",
    )
    print(f"✅ {len(out)}/{len(sites)} 지점 → s3://{BUCKET}/{DST}")
    return {"ok": True, "received": len(out), "requested": len(sites)}
