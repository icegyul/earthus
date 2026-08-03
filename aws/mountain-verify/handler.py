# -*- coding: utf-8 -*-
"""산악예보 검증 — 정상 예보와 고지대 실측의 차이를 **매일 쌓는다**

왜 지금 시작하는가
  2026-08-02 한 시점을 재보니 기상청 산악예보가 고지대 실측보다
  **중앙 +1.4°C, 최대 +7.7°C 따뜻**했다 (docs/methodology-sources.md ⑥).
  그런데 그건 **여름 오후 한 번**이다. 그걸로 말할 수 있는 건
  "여름 오후에 +1.4도"까지다.

  진짜 알아야 하는 건 **겨울**이다. 여름의 +7도는 불쾌하지만
  겨울의 +7도는 저체온증이다 — 영하 2도로 알고 올라갔는데 영하 10도면.

  ⚠️⚠️ **오늘 시작하지 않으면 이번 겨울 답을 못 만든다.**
     8월에 못 받은 자료는 8월에만 받을 수 있었다. 알고리즘은 나중에 살 수 있지만
     시간은 못 산다. 그래서 화면에 아직 안 붙었어도 수집부터 켠다.

무엇을 하나
  매시간, 고지대 관측소를 가진 봉우리마다:
      예보 기온  −  (고지대 실측을 정상 고도로 감률 환산한 값)
  을 계산해 보관하고, 하루 단위로 모은다.

⚠️ 감률은 **5.5 °C/km** (ECMWF Forecast User Guide §9.2.1).
   흔히 쓰는 6.5 가 아니다 — 예보 검증(kma-verify)에서 쓰는 값과 같게 맞춘다.

⚠️ 환산 거리가 멀면 아예 기록하지 않는다. 600m 를 넘겨 끌면 감률 가정의
   오차가 값을 지배해서, 기록해도 나중에 쓸 수 없는 숫자가 된다.

출력
  archive/mtgap/<YYYYMMDDHH>.json        시간별 원본 (비공개)
  wind/series/mountain-gap-daily.json    일별 집계 (공개)
"""

import json
import math
import os
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
s3 = boto3.client("s3", region_name=REGION)

SRC_MT = "wind/kma-mountain.json"
SRC_AWS = "wind/kma-aws-min.json"
ARCHIVE = "archive/mtgap"
DAILY = "wind/series/mountain-gap-daily.json"

# ⚠️ mountain.js 와 **같은 값**이어야 한다. 다르면 화면과 기록이 어긋난다.
LAPSE_C_PER_KM = 5.5
LOCAL_KM = 8.0
LOCAL_FRAC = 0.55
EXTRAPOLATE_MAX_M = 600

KST = timezone(timedelta(hours=9))
RETAIN_DAYS = 400        # 일별 집계 보관 기간 — 한 해를 넘겨야 계절 비교가 된다


def dist_km(a_lat, a_lon, b_lat, b_lon):
    r = math.pi / 180
    d_lat, d_lon = (b_lat - a_lat) * r, (b_lon - a_lon) * r
    h = (math.sin(d_lat / 2) ** 2
         + math.cos(a_lat * r) * math.cos(b_lat * r) * math.sin(d_lon / 2) ** 2)
    return 2 * 6371 * math.asin(math.sqrt(h))


def num(v):
    try:
        f = float(v)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def get_json(key):
    return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())


def put_json(key, doc, cache="no-cache"):
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=key, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl=cache)
    return len(body)


def median(xs):
    if not xs:
        return None
    v = sorted(xs)
    n = len(v)
    return v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2


def pair_up(mt, aws):
    """봉우리마다 고지대 관측소를 붙여 차이를 낸다.
    ⚠️ mountain.js 의 build() 와 **같은 규칙**이다. 한쪽만 바꾸면 안 된다."""
    st = [s for s in aws.get("stations", [])
          if s.get("lat") is not None and s.get("lon") is not None
          and s.get("alt") is not None and s.get("ta") is not None]

    rows = []
    for p in mt.get("peaks", []):
        alt = num(p.get("alt"))
        tmp = num(p.get("TMP"))
        if alt is None or tmp is None:
            continue

        # 정상 고도에 **가장 가까운** 고지대 관측소 (가장 높은 것이 아니다)
        best = None
        for s in st:
            if s["alt"] < alt * LOCAL_FRAC:
                continue
            km = dist_km(p["lat"], p["lon"], s["lat"], s["lon"])
            if km > LOCAL_KM:
                continue
            gap_m = abs(alt - s["alt"])
            if best is None or gap_m < best[0]:
                best = (gap_m, km, s)
        if best is None:
            continue
        gap_m, km, s = best
        if gap_m > EXTRAPOLATE_MAX_M:
            continue                      # 너무 멀다 — 기록해도 못 쓴다

        est = s["ta"] - LAPSE_C_PER_KM * (alt - s["alt"]) / 1000.0
        rows.append({
            "peak": p["name"], "alt": round(alt),
            "fcst": round(tmp, 1),
            "st": s.get("name"), "stAlt": round(s["alt"]), "stTemp": round(s["ta"], 1),
            "upM": round(alt - s["alt"]), "km": round(km, 1),
            "est": round(est, 1),
            "gap": round(tmp - est, 1),          # 예보 − 실측환산
            # 계절·시간대를 나중에 갈라 보려면 이게 있어야 한다
            "wind": num(p.get("WSD")), "sky": num(p.get("SKY")),
        })
    return rows


def load_daily():
    try:
        return get_json(DAILY)
    except Exception:                                        # noqa: BLE001
        return {"days": {}}


def handler(event=None, context=None):
    now = datetime.now(timezone.utc)
    kst_now = now.astimezone(KST)

    mt = get_json(SRC_MT)
    aws = get_json(SRC_AWS)
    rows = pair_up(mt, aws)
    if not rows:
        print("[mtgap] 짝지을 봉우리가 없다 — 기록하지 않는다")
        return {"rows": 0}

    snap = {
        "generated": now.strftime("%Y-%m-%dT%H:%M:00Z"),
        "kst": kst_now.strftime("%Y-%m-%d %H:%M"),
        "fcstBase": f"{mt.get('baseDateKst','')} {mt.get('baseTimeKst','')}".strip(),
        "obsKst": aws.get("observedKst"),
        "lapse": LAPSE_C_PER_KM,
        "rule": {"localKm": LOCAL_KM, "localFrac": LOCAL_FRAC,
                 "extrapolateMaxM": EXTRAPOLATE_MAX_M},
        "n": len(rows),
        "rows": rows,
    }
    put_json(f"{ARCHIVE}/{now:%Y%m%d%H}.json", snap, "private, max-age=86400")

    # ── 일별 집계 ────────────────────────────────────────────────
    # ⚠️ KST 날짜로 묶는다. 등산은 한국 시간으로 하는 일이다.
    daily = load_daily()
    days = daily.get("days") or {}
    key = kst_now.strftime("%Y-%m-%d")
    d = days.get(key) or {"n": 0, "sum": 0.0, "gaps": [], "peaks": {}}
    # ⚠️⚠️ **하루에 한 번만 성공하고 그 뒤로는 계속 죽던 자리다.**
    #    아래에서 d.pop("gaps") 로 배열을 지워 저장했는데, 다음 시각에 그 dict 를
    #    그대로 다시 읽으니 "gaps" 키가 없어 KeyError 가 났다.
    #    ⚠️ 조용히 죽는 종류다 — 첫 회차가 성공하니 파일은 만들어져 있고,
    #       화면도 멀쩡해 보인다. 실측으로 **15시간** 동안 아무도 몰랐다.
    #    ⚠️ 그리고 이건 **되돌릴 수 없는 자료**다(health 가 critical 로 표시하는 이유).
    #       그 시각의 예보를 놓치면 검증 짝을 영영 만들 수 없다.
    d.setdefault("gaps", [])
    d.setdefault("peaks", {})

    for r in rows:
        d["n"] += 1
        d["sum"] += r["gap"]
        d["gaps"].append(r["gap"])
        pk = d["peaks"].setdefault(r["peak"], {"n": 0, "sum": 0.0,
                                               "min": r["gap"], "max": r["gap"],
                                               "alt": r["alt"]})
        pk["n"] += 1
        pk["sum"] += r["gap"]
        pk["min"] = min(pk["min"], r["gap"])
        pk["max"] = max(pk["max"], r["gap"])

    # ⚠️⚠️ 예전에는 여기서 gaps 를 버렸다. 파일 크기를 아끼려던 것인데 둘이 틀렸다.
    #    ① 다음 회차에 KeyError 로 **하루 종일 죽었다** (위 참고)
    #    ② 설령 안 죽었어도, 배열이 없으면 중앙값이 **그 시각 것만으로** 계산된다.
    #       그걸 "그날의 중앙값"이라고 부르면 거짓이 된다.
    #    → **오늘 것만 배열로 들고 있는다.** 산 84곳 × 24회 = 하루 2천 개 남짓,
    #      JSON 으로 20KB 정도다. 지난 날들은 아래에서 배열만 떼어 낸다.
    d["median"] = round(median(d["gaps"]), 2)
    d["mean"] = round(d["sum"] / d["n"], 2)
    d["min"] = round(min(d["gaps"]), 1)
    d["max"] = round(max(d["gaps"]), 1)
    for pk in d["peaks"].values():
        pk["mean"] = round(pk["sum"] / pk["n"], 2)
    days[key] = d

    # 오래된 날은 버린다
    cutoff = (kst_now - timedelta(days=RETAIN_DAYS)).strftime("%Y-%m-%d")
    days = {k: v for k, v in days.items() if k >= cutoff}
    # ⚠️ 지난 날의 배열만 떼어 낸다 — 요약값(중앙값·평균·최소·최대)은 이미 다 냈다.
    #    오늘 것은 남겨야 다음 회차가 이어서 계산한다.
    for k, v in days.items():
        if k != key:
            v.pop("gaps", None)

    out = {
        "generated": now.strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "기상청 산악예보 (getMountainWeather) vs 기상청 AWS 매분관측",
        "sourceEn": "KMA mountain forecast vs KMA AWS 1-minute observations",
        "license": "공공누리 제1유형 (출처표시)",
        "what": {
            "ko": "산 정상 **예보**와, 같은 산 고지대 관측소의 **실측**을 정상 고도로 "
                  f"환산({LAPSE_C_PER_KM}°C/km)한 값의 차이입니다. "
                  "양수면 예보가 더 따뜻하다는 뜻입니다.",
            "en": "Difference between the KMA summit **forecast** and a same-mountain "
                  f"high-altitude **observation** extrapolated to summit height "
                  f"({LAPSE_C_PER_KM}°C/km). Positive means the forecast runs warmer.",
        },
        "note": {
            "ko": "⚠️ 이 값 하나로 예보가 틀렸다고 말할 수 없습니다. 환산에는 감률 가정이 "
                  "들어가고, 관측소는 정상이 아니라 산 중턱에 있습니다. "
                  "다만 **차이가 계절에 따라 어떻게 달라지는지**는 이렇게 모아야만 알 수 있습니다.",
            "en": "⚠️ A single value does not prove the forecast wrong — the extrapolation "
                  "assumes a lapse rate and the station sits below the summit. "
                  "But how the gap varies by season can only be known by accumulating it.",
        },
        "lapse": LAPSE_C_PER_KM,
        "rule": snap["rule"],
        "dayCount": len(days),
        "days": days,
    }
    n = put_json(DAILY, out)
    print(f"[mtgap] {len(rows)}봉 · 중앙 {d['median']:+.2f}°C "
          f"(범위 {d['min']:+.1f}~{d['max']:+.1f}) · {len(days)}일치 {n//1024}KB")
    return {"rows": len(rows), "median": d["median"], "days": len(days)}
