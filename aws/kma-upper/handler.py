"""한국 고층관측 — 대기 안정도·가강수량

무엇인가
  하루 두 번 풍선(레윈존데)을 띄워 상공을 실측한 뒤 계산한 지수들이다.
  CAPE·K지수·상승지수는 "오늘 소나기·뇌우가 얼마나 터질 분위기냐"를,
  총가강수량(TPW)은 "지금 우리 머리 위 공기 기둥에 물이 몇 mm 들어 있냐"를 말한다.

왜 우리한테 의미가 있나
  1. 모델이 아니라 **실측**이다. 우리 다른 대기 자료는 전부 모델 격자다.
  2. 2010년까지 소급된다 — 16년이면 추세를 말할 수 있는 길이다.
  3. TPW 추세는 기후 신호다. 공기가 따뜻해지면 수증기를 더 머금는다(클라우지우스–클라페롱).
     "한국 상공 수증기가 늘고 있는가"를 남의 논문이 아니라 우리 자료로 답할 수 있다.

⚠️ 지점 좌표가 없다. stn_inf(지점정보)가 아직 미승인이라
   지도에 찍지 못하고 **전국 집계**로만 쓴다. 승인되면 지점별로 펼치면 된다.
   ⚠️ 좌표를 추측해서 넣지 않았다. 고층관측소는 열 곳뿐이라 한 곳만 틀려도
      "어디 상공이 불안정한가"가 통째로 거짓이 된다.

⚠️ 결측이 -999 / -99 다. 자유대류고도(LFC) 같은 항목은 **정상적으로도 자주 결측**이다
   (대기가 안정하면 자유대류고도 자체가 존재하지 않는다). 결측을 0으로 세면 안 된다.

출력
  wind/kma-upper.json         최근 실황 (지점별 원값)
  wind/series/upper-daily.json 2010~ 전국 일별 집계
"""

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

BASE = "https://apihub.kma.go.kr/api/typ01/url/"
UA = {"User-Agent": "earthus/0.1 (+globe app)"}
NOW_DST = "wind/kma-upper.json"
SER_DST = "wind/series/upper-daily.json"
# 일부 개인정보 보호 확장/브라우저가 URL의 "profiler"를 추적 도구로 오인해 차단한다.
# 관측 종류는 문서 안 kind/source에 보존하고 공개 경로는 중립 이름을 쓴다.
WPF_DST = "wind/kma-upper-wind.json"
FIRST_YEAR = 2010                  # 실측: 2000년은 0줄, 2010년부터 나온다

# 열 위치 — 주석의 자[尺] 줄에서 읽었다 (총 37칸).
# ⚠️ 위쪽 설명 목록의 나열 순서를 믿지 말 것. 지상 평년값에서 이미 한 번 틀렸다.
I = {"tm": 0, "stn": 1, "ta": 2, "hm": 3, "ki": 17, "cape": 23, "cin": 24,
     "tpw": 25, "tt": 26, "li": 27, "sreh": 22, "lcl": 9}

s3 = boto3.client("s3", region_name=REGION)


def get(ep, **p):
    q = urllib.parse.urlencode({**p, "authKey": KEY})
    with urllib.request.urlopen(urllib.request.Request(BASE + ep + "?" + q, headers=UA),
                                timeout=120) as r:
        return r.read().decode("euc-kr", "replace")


def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f <= -98 else f


def fetch(tm1, tm2):
    """[tm1, tm2] 구간의 전 지점 자료를 (시각, 지점, 값들) 로 돌려준다."""
    out = []
    for line in get("upp_idx.php", tm1=tm1, tm2=tm2, stn="0").split("\n"):
        t = line.strip().rstrip("=").rstrip(",").strip()
        if not t or t.startswith("#"):
            continue
        f = [x.strip() for x in t.split(",")]
        if len(f) < 30:
            continue
        out.append({"tm": f[I["tm"]], "stn": f[I["stn"]],
                    **{k: num(f[i]) for k, i in I.items() if k not in ("tm", "stn")}})
    return out


def parse_wind_profiler(raw, mode):
    """WindProfiler text rows: TM STN HT WD WS U V W QC. 원 QC는 해석하지 않고 보존한다."""
    out = []
    for line in raw.split("\n"):
        text = line.strip().rstrip("=").rstrip(",").strip()
        if not text or text.startswith("#"):
            continue
        fields = [field.strip().strip(",") for field in text.replace(",", " ").split()]
        if len(fields) < 9 or not fields[0].isdigit() or not fields[1].isdigit():
            continue
        height = num(fields[2])
        if height is None or height < 0:
            continue
        out.append({
            "tm": fields[0], "stn": fields[1], "mode": mode, "heightM": height,
            "windDirectionDeg": num(fields[3]), "windSpeedMs": num(fields[4]),
            "uMs": num(fields[5]), "vMs": num(fields[6]), "verticalMs": num(fields[7]),
            "qcRaw": fields[8],
        })
    return out


def fetch_wind_profiler(now):
    """최근 생산시각을 10분씩 뒤로 찾는다. L/H는 서로 독립 실패를 허용한다."""
    base = (now - timedelta(minutes=10)).replace(second=0, microsecond=0)
    base = base.replace(minute=(base.minute // 10) * 10)
    failures = []
    for offset in range(0, 70, 10):
        tm = (base - timedelta(minutes=offset)).strftime("%Y%m%d%H%M")
        records = []
        for mode in ("L", "H"):
            try:
                records.extend(parse_wind_profiler(get("kma_wpf.php", tm=tm, stn="0", mode=mode,
                                                       help="0"), mode))
            except urllib.error.HTTPError as error:
                if error.code == 403:
                    raise
                failures.append(f"{tm}:{mode}:HTTP{error.code}")
            except Exception as error:  # noqa: BLE001 — 반대 모드와 이전 시각을 계속 확인
                failures.append(f"{tm}:{mode}:{type(error).__name__}")
        if records:
            # 같은 지점·고도는 H/L이 겹칠 수 있다. 더 높은 mode를 정본이라 추측하지 않고
            # 두 mode를 key에 포함해 모두 보존한다.
            records.sort(key=lambda row: (row["stn"], row["heightM"], row["mode"]))
            return tm, records, failures
    return None, [], failures


def wind_profile_doc(tm, records, failures):
    stations = {}
    for row in records:
        stations.setdefault(row["stn"], []).append(row)
    return {
        "schemaVersion": "earthus.kma-wind-profiler.v1",
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "observedUtc": tm,
        "source": "기상청 연직바람관측 WindProfiler (API허브 kma_wpf)",
        "sourceEn": "KMA Wind Profiler observations (API Hub kma_wpf)",
        "sourceUrl": "https://apihub.kma.go.kr/apiList.do?apiMov=WindProfiler&seqApi=4&seqApiSub=255",
        "license": "공공누리 제1유형 (출처표시)",
        "kind": "VERTICAL_WIND_OBSERVATION",
        "forecast": False,
        "tz": "UTC",
        "modes": {"L": "저층 모드 약 5km", "H": "고층 모드 약 12km"},
        "fields": {
            "heightM": "관측 고도 m", "windDirectionDeg": "풍향 degree",
            "windSpeedMs": "풍속 m/s", "uMs": "동서바람 m/s", "vMs": "남북바람 m/s",
            "verticalMs": "연직바람 m/s", "qcRaw": "기상청 원 품질검사 코드 (임의 등급화하지 않음)",
        },
        "stationCount": len(stations),
        "levelCount": len(records),
        "missing": {
            key: sum(row[key] is None for row in records)
            for key in ("windDirectionDeg", "windSpeedMs", "uMs", "vMs", "verticalMs")
        },
        "requestFailures": failures[-20:],
        "note": {
            "ko": "10분 주기 연직바람관측 실측입니다. 기온·이슬점 프로파일이 아니므로 Skew-T로 표시하지 않습니다. "
                  "지점 좌표 승인 전에는 지도 위치를 추측하지 않습니다.",
            "en": "Ten-minute vertical wind observations. This is not a temperature/dew-point profile, "
                  "so it is not rendered as a Skew-T. Station coordinates are not guessed.",
        },
        "stations": [{"stn": station, "levels": levels} for station, levels in sorted(stations.items())],
    }


def mean(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs) / len(xs), 2) if xs else None


def daily(recs):
    """UTC 날짜별 전국 집계.
    가강수량·K지수는 **평균**(대기 상태의 전반적 습윤도),
    CAPE 는 **최댓값**(한 곳만 터져도 그날은 불안정한 날이다)."""
    by = {}
    for r in recs:
        d = r["tm"][:8]
        by.setdefault(d, []).append(r)
    out = {}
    for d, rs in sorted(by.items()):
        capes = [r["cape"] for r in rs if r["cape"] is not None]
        out[d] = {
            "n": len(rs),
            "tpw": mean([r["tpw"] for r in rs]),
            "ki": mean([r["ki"] for r in rs]),
            "li": mean([r["li"] for r in rs]),
            "capeMax": round(max(capes), 1) if capes else None,
        }
    return out


def load(key, default):
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())
    except Exception:                                     # noqa: BLE001
        return default


def put(key, doc, maxage):
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=key, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl=f"public, max-age={maxage}")
    return len(body)


def handler(event, context):
    if not KEY:
        return {"ok": False, "reason": "no-key"}
    now = datetime.now(timezone.utc)
    profiler_state = "UNKNOWN"
    profiler_levels = 0

    # ── 과거 소급 ────────────────────────────────────────────
    # 1년씩 끊어 받는다. 한 해가 실패해도 그 해만 비고 나머지는 남는다.
    # ⚠️ 실패한 해 때문에 전체를 버리면, 한 번 삐끗할 때마다 16년을 다시 받게 된다.
    if event.get("backfill"):
        prev = load(SER_DST, {}).get("days", {})
        days, bad = dict(prev), []
        y0 = int(event.get("from") or FIRST_YEAR)
        for y in range(y0, now.year + 1):
            try:
                days.update(daily(fetch(f"{y}01010000", f"{y}12312359")))
                print(f"[upper] {y} 누적 {len(days)}일")
            except Exception as e:                        # noqa: BLE001
                bad.append(y)
                print(f"[upper] {y} 실패 —", repr(e)[:80])
        if len(days) < 1000:
            raise RuntimeError(f"소급 결과가 너무 짧다 ({len(days)}일) — 덮어쓰지 않는다")
        kb = put(SER_DST, series_doc(days, bad), 86400)
        return {"ok": True, "mode": "backfill", "days": len(days),
                "failedYears": bad, "kb": round(kb / 1024)}

    # ── 평상시: 최근 3일치만 받아 이어 붙인다 ────────────────
    try:
        profiler_tm, profiler_records, profiler_failures = fetch_wind_profiler(now)
        if profiler_records:
            put(WPF_DST, wind_profile_doc(profiler_tm, profiler_records, profiler_failures), 600)
            profiler_state, profiler_levels = "SUCCEEDED", len(profiler_records)
        else:
            profiler_state = "EMPTY_LAST_GOOD_PRESERVED"
    except urllib.error.HTTPError as error:
        profiler_state = "POLICY_BLOCKED" if error.code == 403 else f"HTTP_{error.code}"
    except Exception as error:  # noqa: BLE001 — 안정도 지수 정본까지 같이 실패시키지 않는다
        profiler_state = f"FAILED_{type(error).__name__}"
    t0 = (now - timedelta(days=3)).strftime("%Y%m%d0000")
    try:
        recs = fetch(t0, now.strftime("%Y%m%d%H%M"))
    except urllib.error.HTTPError as e:
        if e.code == 403:
            return {"ok": False, "reason": "not-approved", "api": "upp_idx"}
        raise
    if not recs:
        return {"ok": False, "reason": "empty"}

    # 실황: 지점마다 가장 최근 관측
    latest = {}
    for r in recs:
        if r["stn"] not in latest or latest[r["stn"]]["tm"] < r["tm"]:
            latest[r["stn"]] = r
    put(NOW_DST, {
        "generated": now.strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "기상청 고층관측 안정도지수 (API허브 upp_idx)",
        "sourceEn": "KMA upper-air stability indices (API Hub)",
        "license": "공공누리 제1유형 (출처표시)",
        "tz": "UTC",
        "note": {
            "ko": "레윈존데(관측 풍선) 실측에서 계산한 값입니다 — 모델 예측이 아닙니다. "
                  "시각은 UTC이며 보통 00·12시 두 번입니다. "
                  "지점 좌표는 지점정보(stn_inf) 승인 전이라 아직 없습니다.",
            "en": "Computed from actual radiosonde ascents — not model output. Times are UTC, "
                  "typically twice daily. Station coordinates pending stn_inf approval.",
        },
        "fields": {
            "cape": "CAPE — 대류가용잠재에너지 (J/kg). 클수록 상승기류가 강해질 여지가 크다",
            "ki": "K지수 — 클수록 뇌우 가능성이 높다 (30 이상이면 주의)",
            "li": "상승지수 — 음수일수록 불안정하다",
            "tpw": "총가강수량 (mm) — 머리 위 공기 기둥의 수증기를 다 짜냈을 때의 물 높이",
            "cin": "대류억제도 (J/kg) — 클수록 뚜껑이 단단해 잘 안 터진다",
            "sreh": "폭풍지수 — 회전하는 상승기류가 생길 여지",
        },
        "count": len(latest),
        "stations": sorted(latest.values(), key=lambda x: x["stn"]),
    }, 3600)

    # 시계열: 최근 3일치를 덮어 갱신 (당일 자료는 뒤늦게 채워지기도 한다)
    doc = load(SER_DST, {})
    days = doc.get("days", {})
    days.update(daily(recs))
    put(SER_DST, series_doc(days, doc.get("failedYears", [])), 86400)
    return {"ok": True, "stations": len(latest), "days": len(days),
            "windProfiler": profiler_state, "windProfilerLevels": profiler_levels}


def series_doc(days, bad):
    return {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "기상청 고층관측 안정도지수 (API허브 upp_idx)",
        "sourceEn": "KMA upper-air stability indices (API Hub)",
        "license": "공공누리 제1유형 (출처표시)",
        "from": FIRST_YEAR,
        "note": {
            "ko": "전국 고층관측소의 일별 집계입니다. 가강수량·K지수·상승지수는 전 지점 평균, "
                  "CAPE는 전 지점 최댓값입니다(한 곳만 터져도 불안정한 날로 봅니다). "
                  "관측소가 열 곳뿐이라 '전국'은 어디까지나 그 열 곳의 평균입니다.",
            "en": "Daily aggregates over Korea's upper-air stations. TPW/K-index/LI are network "
                  "means; CAPE is the network maximum. Only ~10 stations exist, so 'national' "
                  "means the average of those ten.",
        },
        "failedYears": bad,
        "count": len(days),
        "days": dict(sorted(days.items())),
    }
