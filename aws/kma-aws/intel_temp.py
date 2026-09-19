# -*- coding: utf-8 -*-
"""평년 대비 기온(weather.temperature_anomaly) → 인텔 패킷 v1 (INTELLIGENCE-LAYER-PLAN P2b · 계약 §C).

평년은 **기상청이 발표한 1991–2020 평년값**(wind/kma-normal.json — aws/kma-normal 이 API허브 sfc_norm1 에서
그대로 받아 둔 것)을 인용한다. EARTHUS 가 평년을 새로 만들지 않는다(계약 §I L-4 는 건드리지 않는다).
우리가 하는 계산은 산술 둘뿐이다 — 어제 하루 정시 관측의 평균, 그리고 (그 평균 − 그날 평년 평균기온).

⚠️ 왜 '지금 기온 − 평년 평균기온'을 싣지 않나
   평년 평균기온은 **하루 평균**이다. 오후 3시 기온에서 하루 평균을 빼면 매일 오후는 '평년보다 덥고'
   새벽은 '평년보다 춥다'. 하루의 온도 변화가 평년 차로 둔갑한다. 그래서 같은 것끼리 뺀다:
   **어제(한국 날짜) 하루 평균 − 어제 날짜의 평년 평균기온.**
⚠️ 하루 평균을 만드는 규칙 — 모자란 날을 평균 내면 빠진 시각 쪽으로 치우친다.
     24시간 전부 있으면 24회 평균, 없으면 3시간 간격 8회(00·03·…·21시)가 전부 있을 때 8회 평균,
     그것도 안 되면 그 지점은 싣지 않는다(이유를 missing 에 남긴다).
⚠️ 평년 배열은 366칸(2월 29일 포함, 월·일 순)이다. '연중 몇째 날 − 1' 로 찾으면 평년이 아닌 해의
   3월 1일부터 하루씩 밀린다(9월 중순이면 0.4 °C 차). 월·일로 2000년(윤년) 달력의 칸을 찾는다.

절별 출처
  current   기준 지점의 지금 기온(기상청 ASOS 정시 실황)                         OFFICIAL_OBSERVATION
  anomaly   어제 하루 평균 − 기상청 1991–2020 평년 평균기온(같은 지점)            EARTHUS_ANALYSIS
            평년 자체는 기상청 발표값 — baseline.source 에 적는다
비워 둔 절(coverage.missing 에 이유) — change·pattern·conditions·next·related·importance·confidence·uncertainty

⚠️ 파일 이름을 intel_v1.py 로 두지 않았다 — 다른 함수의 빌더와 이름이 같으면 pytest 한 실행에서 섞인다.
"""
import os
import sys
from datetime import date, datetime, timedelta, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "_shared"))
import intel_contract  # noqa: E402

PHENOMENON_ID = "weather.temperature_anomaly"
KST = timezone(timedelta(hours=9))
SOURCE_OBS = "기상청 ASOS 정시 관측 (API허브 kma_sfctm3)"
SOURCE_ANOM = "기상청 ASOS 정시 관측의 하루 평균 − 기상청 1991–2020 평년 평균기온 (같은 지점)"
SLA_OBS_MIN = 120          # 매시 수집 — 두 시간이 지나면 늙었다
SLA_NORMAL_MIN = 60 * 24 * 400   # 평년값은 해마다 바뀌지 않는다 — 한 해 넘게 안 받으면 그때 본다
SYNOPTIC_HOURS = ("00", "03", "06", "09", "12", "15", "18", "21")

# (지점 id, 이름 ko, 이름 en) — 한국 먼저(시장 우선순위). 광역시·도청 소재지의 ASOS 지점이다.
# 5° 격자가 아니라 지점 실측이다(격자 vs 실측 규칙). 산 위 지점은 넣지 않았다(고도 차가 평년 차처럼 읽힌다).
# ⚠️ 대구(143)는 빠졌다 — wind/kma-normal.json(83곳)에 1991–2020 평년이 없다(2026-09-20 확인). 울산(152)을 넣었다.
REF_STATIONS = (
    ("108", "서울", "Seoul"),
    ("159", "부산", "Busan"),
    ("152", "울산", "Ulsan"),
    ("156", "광주", "Gwangju"),
    ("133", "대전", "Daejeon"),
    ("105", "강릉", "Gangneung"),
    ("184", "제주", "Jeju"),
)


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _age_min(iso, now):
    try:
        t = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return round((now - t).total_seconds() / 60)
    except (TypeError, ValueError):
        return None


def observed_at(doc):
    """kma-aws 문서의 observedKst('YYYYMMDD HH:00') → ISO(+09:00). 못 읽으면 None."""
    digits = "".join(c for c in str((doc or {}).get("observedKst") or "") if c.isdigit())
    if len(digits) < 10:
        return None
    try:
        t = datetime.strptime(digits[:10], "%Y%m%d%H").replace(tzinfo=KST)
    except ValueError:
        return None
    return t.isoformat()


def normal_index(day):
    """366칸 평년 배열에서 이 날짜(월·일)의 칸. 2000년은 윤년이라 2월 29일 칸이 있다."""
    return (date(2000, day.month, day.day) - date(2000, 1, 1)).days


def daily_mean(history, station_id):
    """하루 이력 문서(wind/series/stations/<날짜>.json)에서 한 지점의 하루 평균 기온.

    돌려주는 것: (평균, 방법, 쓴 관측 수) 또는 (None, 이유, 0).
    """
    hours = (history or {}).get("hours") or {}
    by_hour = {}
    for stamp, rec in hours.items():
        hh = str(stamp)[11:13]
        for row in (rec or {}).get("stations") or []:
            if str(row.get("stationId")) == station_id:
                v = (row.get("values") or {}).get("temp_c")
                if _num(v):
                    by_hour[hh] = v
    if len(by_hour) >= 24 and all("%02d" % h in by_hour for h in range(24)):
        vals = [by_hour["%02d" % h] for h in range(24)]
        return round(sum(vals) / 24, 2), "24회 정시 관측 평균", 24
    if all(h in by_hour for h in SYNOPTIC_HOURS):
        vals = [by_hour[h] for h in SYNOPTIC_HOURS]
        return round(sum(vals) / 8, 2), "3시간 간격 8회 관측 평균(24회가 다 없어서)", 8
    return None, "관측 %d/24시간 — 24회도, 3시간 간격 8회도 다 모이지 않았다" % len(by_hour), 0


def build(doc, now, history=None, normals_doc=None):
    """kma-aws 문서(dict) + 어제 이력 + 평년 문서 → v1 인텔 패킷(dict). 계약 위반이면 IntelContractError.

    history 는 **어제(한국 날짜)** 의 wind/series/stations/<YYYY-MM-DD>.json, normals_doc 은 wind/kma-normal.json.
    """
    at = observed_at(doc)
    if not at:
        raise intel_contract.IntelContractError("관측 시각(observedKst)을 읽지 못했다")
    stations = {str(s.get("id")): s for s in (doc or {}).get("stations") or [] if s.get("id") is not None}
    missing = []
    out = {
        "schema": 1,
        "phenomenonId": PHENOMENON_ID,
        "eventId": None,
        "time": {"observedAt": at, "retrievedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ")},
    }

    # ── current — 기준 지점의 지금 기온 ──────────────────────────────────────
    vals = []
    for sid, ko, en in REF_STATIONS:
        t = (stations.get(sid) or {}).get("temp_c")
        if not _num(t):
            continue
        vals.append({"key": "temp_%s" % sid, "value": t, "unit": "°C", "kind": "OFFICIAL_OBSERVATION",
                     "source": SOURCE_OBS, "at": at, "stationId": sid,
                     "labelKo": "%s 기온(지금)" % ko, "labelEn": "%s temperature (now)" % en})
    if not vals:
        raise intel_contract.IntelContractError("기준 지점의 지금 기온이 하나도 없다")
    out["current"] = {"values": vals}

    # ── anomaly — 어제 하루 평균 − 기상청 평년 (같은 지점·같은 날짜) ───────────────────
    yday = (datetime.fromisoformat(at).astimezone(KST) - timedelta(days=1)).date()
    anom_items, reasons = [], []
    norms = (normals_doc or {}).get("normals") if isinstance(normals_doc, dict) else None
    period = (normals_doc or {}).get("period") if isinstance(normals_doc, dict) else None
    if not isinstance(norms, dict) or not norms:
        reasons.append("기상청 평년값(wind/kma-normal.json)을 읽지 못했다")
    elif not period:
        reasons.append("평년값 문서에 기준 기간이 적혀 있지 않다 — 기간 없는 평년은 쓰지 않는다")
    elif not isinstance(history, dict) or history.get("date") != yday.isoformat():
        reasons.append("어제(%s) 관측 이력을 읽지 못했다" % yday.isoformat())
    else:
        idx = normal_index(yday)
        for sid, ko, en in REF_STATIONS:
            arr = norms.get(sid)
            rec = arr[idx] if isinstance(arr, list) and len(arr) == 366 else None
            n_mean = rec[0] if isinstance(rec, list) and rec and _num(rec[0]) else None
            if n_mean is None:
                reasons.append("%s: 평년값 없음" % ko)
                continue
            mean, how, n = daily_mean(history, sid)
            if mean is None:
                reasons.append("%s: %s" % (ko, how))
                continue
            anom_items.append({
                "key": "dailyMean_%s" % sid, "value": round(mean, 1), "baseline": n_mean,
                "delta": round(mean - n_mean, 1), "unit": "°C", "kind": "EARTHUS_ANALYSIS",
                "source": SOURCE_ANOM, "at": yday.isoformat(), "stationId": sid, "method": how, "samples": n,
                "labelKo": "%s 어제 하루 평균" % ko, "labelEn": "%s yesterday's daily mean" % en,
            })
    if anom_items:
        out["anomaly"] = {
            "baseline": {"name": "기상청 평년값 — 일평균기온 (%s)" % yday.strftime("%m월 %d일"),
                         "source": "기상청 API허브 sfc_norm1 (tmst=2021)", "period": str(period)},
            "items": anom_items,
            "noteKo": "어제 하루 평균과 그날의 평년 평균을 뺐다 — 지금 기온과 하루 평균을 빼지 않는다(하루 온도 변화가 평년 차로 보인다)",
            "noteEn": "Yesterday's daily mean minus that date's normal — the current reading is not compared with a daily mean",
        }
        if reasons:
            out["anomaly"]["partialKo"] = " · ".join(reasons)
    else:
        missing.append({"section": "anomaly", "reason": " · ".join(reasons) or "평년 대비를 낼 지점이 없다"})

    missing.append({"section": "change", "reason": "이 문서는 한 시각의 실황만 담는다 — 시각 사이 변화는 변화 롤업(P2a) 배포 뒤에 채운다"})
    missing.append({"section": "pattern", "reason": "평년보다 더운 날이 며칠째 이어지는지 셀 이력 연결이 아직 없다"})
    missing.append({"section": "conditions", "reason": "같은 때·같은 자리의 조건(구름·바람·일사)을 이 패킷에 묶는 규칙이 아직 없다"})
    missing.append({"section": "related", "reason": "기온과 이어진 현상을 계산한 연결이 없다 — 교과서 관계도 아직 등재하지 않았다"})
    missing.append({"section": "next", "reason": "기상청 단기예보(kma-fcst)의 최고·최저 기온을 이 패킷에 옮기는 연결은 다음 단계다 — 우리 예보는 만들지 않는다"})
    missing.append({"section": "importance", "reason": "평년 차의 중요도 규칙이 정의되지 않았다 — 점수를 만들지 않는다"})
    missing.append({"section": "confidence", "reason": "정의된 산식(formula_id)이 없다 — 등급을 찍지 않는다"})
    missing.append({"section": "uncertainty", "reason": "관측 오차·평년 표준편차를 받지 않는다"})

    srcs = [{"id": "kma-asos-hourly", "kind": "OFFICIAL_OBSERVATION",
             "ageMin": _age_min(at, now), "slaMin": SLA_OBS_MIN, "state": None}]
    if "anomaly" in out:
        srcs.append({"id": "kma-normal-1991-2020", "kind": "OFFICIAL_OBSERVATION",
                     "ageMin": _age_min((normals_doc or {}).get("generated"), now), "slaMin": SLA_NORMAL_MIN, "state": None})
    for s in srcs:
        s["state"] = "fresh" if s["ageMin"] is not None and s["ageMin"] <= s["slaMin"] else "aging"
    out["sources"] = srcs
    out["coverage"] = {"missing": missing}
    return intel_contract.require_valid(out, known_phenomena=None)


def history_key(doc, prefix):
    """어제(한국 날짜) 이력 파일 키. 관측 시각을 못 읽으면 None."""
    at = observed_at(doc)
    if not at:
        return None
    yday = (datetime.fromisoformat(at).astimezone(KST) - timedelta(days=1)).date()
    return "%s%s.json" % (prefix, yday.isoformat())
