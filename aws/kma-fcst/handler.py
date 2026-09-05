"""기상청 동네예보 — 한국 지점 예보를 공식 자료로

왜 만들었나
  지금까지 지점 예보는 Open-Meteo(전지구 수치예보)에서 받았다. 두 가지 문제가 있다.
    ① **비용** — 무료 API 는 비상업 전용이다(2026-08-02 약관 확인).
       우리는 상업 서비스라 그대로 쓰면 약관 위반이다.
    ② **품질** — 한국 안에서는 기상청 동네예보가 더 낫다. 5km 격자에
       예보관이 손을 댄 **공식 예보**다. 전지구 모델을 그대로 뽑은 값이 아니다.

  기상청 동네예보는 공공누리라 무료이고, 우리가 이미 쓰는 API 허브 키로 그대로 된다.
  즉 이 수집기는 **돈을 아끼면서 품질도 올린다.** 흔치 않은 경우다.

무엇을 받나 (실측 2026-08-02)
  단기예보(getVilageFcst): 발표시각 기준 **81시간(약 5일)**, 1시간 간격
    TMP 기온 · TMN/TMX 일최저·최고 · REH 습도 · WSD 풍속 · VEC 풍향
    POP 강수확률 · PCP 1시간강수량 · SNO 신적설 · WAV 파고
    **SKY 하늘상태 · PTY 강수형태** ← 이 둘이 곧 '날씨 상태'다.
    ⚠️ Open-Meteo 를 대체할 때 제일 걱정한 게 weather_code 였는데,
       기상청은 그걸 직접 준다. 우리가 지어낼 필요가 없다.

⚠️ 왜 지점을 미리 정해 두나
   동네예보는 **격자 한 칸씩** 조회하는 API 다. 사용자가 있는 자리를 그때그때
   물어보려면 온디맨드 호출이 필요한데, Lambda Function URL 이 계정 차원에서
   403 이라 쓸 수 없다(build-order #8 참고). 그래서 ASOS 97지점을 미리 받아 두고
   앱이 **가장 가까운 지점**을 쓴다.
   ⚠️ 근사다. 화면에 "가장 가까운 관측지점 기준"이라고 반드시 적는다.
      (warn.js 가 특보구역을 정할 때 쓰는 것과 같은 방식·같은 한계다)

⚠️ 발표 시각을 지어내지 않는다
   동네예보는 02·05·08·11·14·17·20·23시에 발표되고 그 10분 뒤부터 받을 수 있다.
   아직 안 나온 회차를 부르면 빈 응답이 온다 — 그래서 **가장 최근에 나온 회차**를
   계산해서 부르고, 실패하면 한 회차씩 뒤로 물러난다.

출력
  s3://<CACHE_BUCKET>/wind/kma-fcst.json   (wind/ 은 공개 프리픽스)
"""

import concurrent.futures as cf
import json
import math
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

import kma_hub   # KMA 허브 호출 회계(PHASE 1) — aws/_shared/kma_hub.py, 배포 스크립트가 같이 담는다

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KEY = os.environ.get("KMA_HUB_KEY", "").strip()

HOST = "https://apihub.kma.go.kr/api/typ02/openApi"
VILAGE = f"{HOST}/VilageFcstInfoService_2.0/getVilageFcst"
SRC_STATIONS = "wind/kma-aws.json"          # 우리가 이미 만들어 두는 ASOS 97지점
DST = "wind/kma-fcst.json"
KST = timezone(timedelta(hours=9))
UA = {"User-Agent": "earthus/0.1 (+earthus.net)"}

# 동시 조회 수. ⚠️ 너무 올리면 API 허브가 막을 수 있다. 97지점이면 8이면 충분히 빠르다.
WORKERS = 8
TIMEOUT = 20

s3 = boto3.client("s3", region_name=REGION)


# ── 위경도 → 동네예보 격자 ────────────────────────────────────────
# 기상청이 공개한 Lambert Conformal Conic 변환(dfs_xy_conv)을 그대로 옮긴 것.
# ⚠️ 상수를 바꾸지 말 것. 검증: 서울(60,127)·부산(98,76)·인천(55,124)·
#    광주(58,74)·제주(53,38) 가 공식 표와 일치한다.
_RE, _GRID = 6371.00877, 5.0
_SLAT1, _SLAT2, _OLON, _OLAT, _XO, _YO = 30.0, 60.0, 126.0, 38.0, 43, 136
_D = math.pi / 180.0


def to_grid(lat, lon):
    re = _RE / _GRID
    slat1, slat2 = _SLAT1 * _D, _SLAT2 * _D
    olon, olat = _OLON * _D, _OLAT * _D
    sn = math.tan(math.pi * 0.25 + slat2 * 0.5) / math.tan(math.pi * 0.25 + slat1 * 0.5)
    sn = math.log(math.cos(slat1) / math.cos(slat2)) / math.log(sn)
    sf = math.tan(math.pi * 0.25 + slat1 * 0.5)
    sf = (sf ** sn) * math.cos(slat1) / sn
    ro = math.tan(math.pi * 0.25 + olat * 0.5)
    ro = re * sf / (ro ** sn)
    ra = math.tan(math.pi * 0.25 + lat * _D * 0.5)
    ra = re * sf / (ra ** sn)
    theta = lon * _D - olon
    if theta > math.pi:
        theta -= 2.0 * math.pi
    if theta < -math.pi:
        theta += 2.0 * math.pi
    theta *= sn
    return int(ra * math.sin(theta) + _XO + 0.5), int(ro - ra * math.cos(theta) + _YO + 0.5)


# ── 발표 회차 ─────────────────────────────────────────────────────
BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23]
READY_MIN = 12          # 발표 후 이만큼 지나야 안전하게 받힌다 (공식 안내는 10분)


def base_runs(now_kst, back=3):
    """지금 시각 기준으로 **최근 회차부터** 뒤로 몇 개를 돌려준다.
    ⚠️ 첫 회차가 아직 안 올라왔을 수 있으므로 폴백이 필요하다."""
    out = []
    t = now_kst - timedelta(minutes=READY_MIN)
    for _ in range(back):
        h = max([b for b in BASE_HOURS if b <= t.hour], default=None)
        if h is None:                       # 자정~02시 → 전날 23시 회차
            t = t.replace(hour=23, minute=0) - timedelta(days=1)
            h = 23
        out.append((t.strftime("%Y%m%d"), f"{h:02d}00"))
        t = t.replace(hour=h, minute=0) - timedelta(minutes=1)
    return out


def get_json(url):
    req = urllib.request.Request(url, headers=UA)
    with kma_hub.track(url, url), urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_cell(nx, ny, runs):
    """격자 한 칸의 예보. 최근 회차부터 시도하고 비면 이전 회차로 물러난다."""
    for base_date, base_time in runs:
        if kma_hub.stop():                          # 이 실행에서 이미 403 — 다음 회차·다음 셀 모두 금지
            return None, None, []
        q = urllib.parse.urlencode({
            "pageNo": 1, "numOfRows": 1000, "dataType": "JSON",
            "base_date": base_date, "base_time": base_time,
            "nx": nx, "ny": ny, "authKey": KEY,
        })
        try:
            j = get_json(f"{VILAGE}?{q}")
        except (kma_hub.QuotaExhausted, urllib.error.HTTPError) as e:
            # 403 = 일일 용량 초과. 예전엔 일반 예외로 삼켜 회차 3개 × 셀 90 을 헛돌았다(2026-09-05 실측).
            if isinstance(e, kma_hub.QuotaExhausted) or getattr(e, "code", None) == 403:
                return None, None, []
            continue
        except Exception:                                    # noqa: BLE001 — timeout·연결은 회계에 분류돼 있다
            continue
        head = (j.get("response") or {}).get("header") or {}
        if head.get("resultCode") == "03":                  # NO_DATA — 그 회차가 아직 없다
            kma_hub.note_empty("getVilageFcst")
            continue
        if head.get("resultCode") != "00":
            kma_hub.note_invalid("getVilageFcst")
            continue
        items = (((j.get("response") or {}).get("body") or {})
                 .get("items") or {}).get("item") or []
        if items:
            return base_date, base_time, items
        kma_hub.note_empty("getVilageFcst")
    return None, None, []


# 우리가 쓸 항목만 남긴다. ⚠️ 여기 없는 category 는 버린다 —
# 다 실으면 97지점 × 81시간 × 12항목이라 파일이 쓸데없이 커진다.
HOURLY = {"TMP": "t", "REH": "rh", "WSD": "ws", "VEC": "wd",
          "POP": "pop", "PTY": "pty", "SKY": "sky", "PCP": "pcp"}
DAILY = {"TMN": "tmin", "TMX": "tmax"}


def num(v):
    """'강수없음'·'1mm 미만' 같은 문자열이 섞여 온다. 숫자만 숫자로."""
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def shape(items):
    """API 응답(항목별 한 줄)을 시각별로 접는다."""
    hours, days = {}, {}
    for it in items:
        cat, val = it.get("category"), it.get("fcstValue")
        d, tm = it.get("fcstDate"), it.get("fcstTime")
        if cat in DAILY:
            days.setdefault(d, {})[DAILY[cat]] = num(val)
            continue
        k = HOURLY.get(cat)
        if not k or not d or not tm:
            continue
        slot = hours.setdefault(f"{d}{tm}", {})
        if k in ("pty", "sky"):
            slot[k] = int(num(val) or 0)
        elif k == "pcp":
            # ⚠️ '강수없음' 은 0 이지만 '1mm 미만' 은 0 이 아니다. 문자열을 살려 둔다.
            n = num(val)
            slot[k] = n if n is not None else (0.0 if val == "강수없음" else val)
        else:
            slot[k] = num(val)
    # ⚠️ 시각 키는 't' 가 아니라 'tm' 이다. 'TMP'(기온)가 't' 로 들어오므로
    #    시각을 't' 로 쓰면 **기온이 시각을 덮어써서 시각이 통째로 사라진다.**
    #    (로컬 시험에서 "첫 시각 27.0" 이 찍혀서 잡았다 — 27.0 은 기온이었다)
    ordered = [{"tm": k, **v} for k, v in sorted(hours.items())]
    return ordered, {k: v for k, v in sorted(days.items())}


@kma_hub.accounted("kma-fcst")
def handler(event, context):
    if not KEY:
        return {"ok": False, "reason": "no-key"}

    # 지점 목록은 우리가 이미 만들어 둔 파일에서 가져온다 (중복 관리하지 않는다)
    try:
        src = json.loads(s3.get_object(Bucket=BUCKET, Key=SRC_STATIONS)["Body"].read())
        stations = [s for s in (src.get("stations") or [])
                    if s.get("lat") is not None and s.get("lon") is not None]
    except Exception as e:                                   # noqa: BLE001
        return {"ok": False, "reason": f"stations: {e!r}"[:120]}
    if not stations:
        return {"ok": False, "reason": "no-stations"}

    # 여러 지점이 같은 5km 칸에 들어간다 — 칸 단위로 한 번만 부른다
    cells = {}
    for s in stations:
        nx, ny = to_grid(s["lat"], s["lon"])
        cells.setdefault((nx, ny), []).append(s)

    now = datetime.now(KST)
    runs = base_runs(now)

    results = {}
    with cf.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(fetch_cell, nx, ny, runs): (nx, ny) for (nx, ny) in cells}
        for f in cf.as_completed(futs):
            results[futs[f]] = f.result()

    if kma_hub.stop():
        # 용량 초과 — 새 문서를 만들지 않는다. 이전 산출물이 남아 화면은 STALE 로 보인다(EMPTY 아님).
        print(f"[kma-fcst] QUOTA_EXHAUSTED — 이 실행 호출 {kma_hub.ledger.counts['calls']}회에서 중단, S3 미기록")
        return {"ok": False, "reason": "quota_exhausted", "api": "getVilageFcst", "calls": kma_hub.ledger.counts["calls"]}

    points, failed = [], 0
    for (nx, ny), members in cells.items():
        base_date, base_time, items = results.get((nx, ny), (None, None, []))
        if not items:
            failed += 1
            continue
        hourly, daily = shape(items)
        rep = members[0]
        points.append({
            "id": rep.get("id"), "name": rep.get("name"),
            "lat": rep.get("lat"), "lon": rep.get("lon"),
            "nx": nx, "ny": ny,
            # 한 칸에 여러 지점이 들어간 경우 나머지 이름도 남긴다 (앱이 매칭에 쓴다)
            "also": [m.get("name") for m in members[1:]] or None,
            "baseKst": f"{base_date}{base_time}",
            "hourly": hourly, "daily": daily,
        })

    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "observedKst": now.strftime("%Y%m%d%H%M"),
        "source": "기상청 동네예보 (API허브 getVilageFcst)",
        "sourceEn": "KMA Village Forecast (API Hub)",
        "license": "공공누리 제1유형 (출처표시)",
        "note": {
            "ko": "기상청이 발표한 동네예보입니다. 5km 격자·1시간 간격으로 약 5일치입니다. "
                  "지점은 ASOS 관측지점 자리이며, 앱은 사용자와 가장 가까운 지점을 씁니다 — "
                  "내가 선 자리의 격자와 다를 수 있습니다. "
                  "⚠️ 실제 대응은 기상청 공식 발표를 따르세요.",
            "en": "Official KMA village forecast: 5 km grid, hourly, about five days ahead. "
                  "Points sit at ASOS station locations and the app uses the nearest one, "
                  "which may differ from the exact grid cell you stand in.",
        },
        "fields": {
            "tm": "예보시각 KST YYYYMMDDHHMM", "t": "기온 °C", "rh": "습도 %", "ws": "풍속 m/s", "wd": "풍향 deg",
            "pop": "강수확률 %", "pcp": "1시간 강수량 mm (문자열이면 원문 그대로)",
            "sky": "하늘상태 1맑음 3구름많음 4흐림",
            "pty": "강수형태 0없음 1비 2비/눈 3눈 4소나기",
            "tmin": "일최저 °C", "tmax": "일최고 °C",
        },
        "count": len(points),
        "cells": len(cells),
        # ⚠️ 못 받은 칸 수를 숨기지 않는다. 조용히 빠지면 "그 지역은 예보가 없나 보다"가 된다.
        "failedCells": failed,
        "points": points,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=900")
    print(f"[kma-fcst] 칸 {len(cells)} · 성공 {len(points)} · 실패 {failed} "
          f"· {len(body)/1024:.0f}KB")
    return {"ok": True, "cells": len(cells), "points": len(points), "failed": failed}
