# -*- coding: utf-8 -*-
"""기온·바람 어댑터 — PHASE 6 §29 의 첫 end-to-end 영역.

왜 이 영역인가: 저장소에서 **예보 스냅샷 · 실측 · 채점이 셋 다 있는 유일한 곳**이다.
  aws/kma-verify 가 매시간 예보를 archive/verify/fc/<YYYYMMDDHH>.json 에 얼려 두고
  24·48시간 뒤 기상청 ASOS 실측과 맞춰 wind/series/verify-daily.json 에 쌓는다.

입력 모양 (kma-verify/handler.py 가 쓰는 그대로)
  days["YYYY-MM-DD"]["{model}|{var}|{lead}h"] = {me, mae, rmse, n}
  · me   평균오차(치우침) — 양수면 모델이 실측보다 높게 본다
  · mae  평균절대오차
  · rmse 제곱평균오차
  · n    채점에 쓴 (지점 × 시각) 수. 20 미만 조합은 애초에 기록되지 않는다

지키는 것
  · 리드타임을 절대 합치지 않는다. 24h 와 48h 는 다른 숫자다.
  · 모델을 섞지 않는다. GFS 와 ECMWF 를 따로 낸다.
  · 표본 수로 가중한다. 날짜별 단순 평균을 내면 표본이 적은 날이 과대평가된다.
  · 자료가 없는 기간에는 팩트를 만들지 않는다. 빈 목록을 돌려준다.
"""
import os
import sys

sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "_shared"))
import report_period as rp        # noqa: E402
import report_contract as rc      # noqa: E402

SOURCE_REF = "wind/series/verify-daily.json"

# kma-verify 의 변수명 → 우리 현상 id
VAR_PHENOMENON = {
    "temperature_2m": "weather.temperature",
    "wind_speed_10m": "weather.wind",
}
VAR_UNIT = {"temperature_2m": "degC", "wind_speed_10m": "m/s"}
MODEL_LABEL = {"gfs_seamless": "GFS", "ecmwf_ifs025": "ECMWF IFS"}


def _parse_key(key):
    """'gfs_seamless|temperature_2m|24h' → (model, var, lead)."""
    parts = key.split("|")
    if len(parts) != 3 or not parts[2].endswith("h"):
        return None
    try:
        lead = int(parts[2][:-1])
    except ValueError:
        return None
    return parts[0], parts[1], lead


def aggregate(daily_doc, period):
    """기간 안의 날짜만 골라 (모델, 변수, 리드)별로 표본 가중 합산한다.

    돌려주는 것: {(model, var, lead): {me, mae, rmse, n, days}}
    """
    days = (daily_doc or {}).get("days") or {}
    acc = {}
    for day, combos in days.items():
        if not rp.contains(period, day):
            continue
        for key, v in (combos or {}).items():
            parsed = _parse_key(key)
            if not parsed:
                continue
            n = v.get("n") or 0
            if n <= 0:
                continue
            cur = acc.setdefault(parsed, {"me": 0.0, "mae": 0.0, "sq": 0.0, "n": 0, "days": 0})
            # 표본 수로 가중한다. rmse 는 제곱을 가중해 합치고 마지막에 다시 제곱근을 낸다.
            cur["me"] += (v.get("me") or 0.0) * n
            cur["mae"] += (v.get("mae") or 0.0) * n
            cur["sq"] += ((v.get("rmse") or 0.0) ** 2) * n
            cur["n"] += n
            cur["days"] += 1
    out = {}
    for k, a in acc.items():
        n = a["n"]
        out[k] = {
            "me": round(a["me"] / n, 3),
            "mae": round(a["mae"] / n, 3),
            "rmse": round((a["sq"] / n) ** 0.5, 3),
            "n": n,
            "days": a["days"],
        }
    return out


def build_facts(daily_doc, period):
    """§5 ReportFact 목록. 값이 없으면 만들지 않는다."""
    agg = aggregate(daily_doc, period)
    facts = []
    for (model, var, lead), m in sorted(agg.items()):
        phen = VAR_PHENOMENON.get(var)
        if not phen:
            continue
        base = f"{rp.label(period)}:{model}:{var}:{lead}h"
        for metric in ("mae", "rmse", "me"):
            facts.append(rc.make_fact(
                fact_id=f"fact:{base}:{metric}",
                phenomenon_id=phen,
                metric=metric,
                value=m[metric],
                unit=VAR_UNIT.get(var),
                period=rp.label(period),
                source=f"{MODEL_LABEL.get(model, model)} 예보 vs 기상청 ASOS",
                truth_type="EARTHUS_ANALYSIS",   # 우리가 채점한 값이다. 관측도 예보도 아니다.
                sample_count=m["n"],
                evidence_refs=[SOURCE_REF],
            ))
    return facts


def build_verifications(daily_doc, period):
    """리드별 검증 레코드. 리드를 합치지 않으므로 레코드도 리드마다 하나다.

    자료가 없으면 빈 목록이다 — 0 점짜리 행을 만들지 않는다(§17).
    """
    agg = aggregate(daily_doc, period)
    rows = []
    for (model, var, lead), m in sorted(agg.items()):
        phen = VAR_PHENOMENON.get(var)
        if not phen:
            continue
        rows.append(rc.make_verification(
            prediction_id=f"pred:{rp.label(period)}:{model}:{var}:{lead}h",
            phenomenon_id=phen,
            metric_set="continuous",
            observation_period=rp.label(period),
            observation_value={"source": "KMA ASOS", "sampleCount": m["n"]},
            observation_source="기상청 ASOS 97지점",
            lead_hours=lead,
            model_id=MODEL_LABEL.get(model, model),
            scores={"mae": m["mae"], "rmse": m["rmse"], "bias": m["me"]},
            notes=f"{MODEL_LABEL.get(model, model)} · 표본 {m['n']} · {m['days']}일",
        ))
    return rows


def coverage(daily_doc, period):
    """이 기간을 평가할 수 있는가. collectingSince 이전은 평가하지 않는다(§28)."""
    doc = daily_doc or {}
    since = doc.get("collectingSince")
    _, start, end = rp.parse(period)
    if not doc.get("days"):
        return {"ok": False, "reason": "NO_OBSERVATION_ARCHIVE",
                "detail": "채점 자료가 아직 없다"}
    if since and since > end.isoformat():
        return {"ok": False, "reason": "NO_OBSERVATION_ARCHIVE",
                "detail": f"자료 수집 시작({since})보다 앞선 기간이다"}
    covered = [d for d in doc["days"] if rp.contains(period, d)]
    if not covered:
        return {"ok": False, "reason": "NO_OBSERVATION_ARCHIVE",
                "detail": "이 기간에 채점된 날이 없다"}
    return {"ok": True, "days": len(covered), "collectingSince": since}
