# -*- coding: utf-8 -*-
"""전망 엔진 (PHASE 8 §9).

PHASE 7 은 전망 여섯 종을 통째로 NO_OUTLOOK_SOURCE 로 비웠다. 맞는 결론이었지만
**왜** 비었는지가 한 줄뿐이었다. 여기서는 가진 예보를 하나씩 대 보고,
각각 왜 이 기간을 못 덮는지를 숫자로 남긴다.

⚠️⚠️ 예보(FORECAST)와 전망(OUTLOOK)과 시나리오(SCENARIO)를 섞지 않는다.
   FORECAST  특정 시각의 값을 맞히려는 것. 우리 것은 최대 5일이다.
   OUTLOOK   기간 평균의 경향·확률. 계절 예측 산출물이 있어야 한다.
   SCENARIO  "이렇게 되면 이렇게 된다". 예측이 아니다. 예측처럼 보이게 두지 않는다.

⚠️ 5일짜리 예보로 '다음 달 전망'을 쓰지 않는다.
   한 달의 6분의 1을 덮는 자료로 나머지 6분의 5를 말하면 그건 예측이 아니라 창작이다.
   그래서 기간을 절반도 못 덮는 자료는 **자동으로 뺀다** — 사람 판단에 맡기지 않는다.

2026-09-08 실측
   wind/ecmwf-fcst.json  steps [24,48,72,96,120] → 최대 5일
   wind/kma-fcst.json    동네예보 약 5일
   계절·월간 예측 산출물: 없음
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_shared"))
import report_period as rp        # noqa: E402

# §9 — 산출물 종류. 이름이 곧 약속이다.
PRODUCT_KINDS = ("FORECAST", "OUTLOOK", "SCENARIO")

# 대상 기간을 이 비율만큼도 못 덮으면 전망 재료로 쓰지 않는다.
MIN_HORIZON_COVERAGE = 0.5

# 우리가 실제로 보관하는 예측 산출물. 없는 것을 적지 않는다.
OUTLOOK_SOURCES = (
    {
        "id": "ecmwf-open-data",
        "ref": "wind/ecmwf-fcst.json",
        "kind": "FORECAST",
        "label": "ECMWF Open Data (IFS · AIFS)",
        "maxLeadDays": 5,          # steps [24,48,72,96,120] — 실측
        "variables": ["2t"],
        "note": "지점별 2m 기온. 선행시간별로 나눠 보관한다.",
    },
    {
        "id": "kma-village",
        "ref": "wind/kma-fcst.json",
        "kind": "FORECAST",
        "label": "기상청 동네예보",
        "maxLeadDays": 5,
        "variables": ["기온", "강수", "하늘상태"],
        "note": "5km 격자·1시간 간격 약 5일치.",
    },
)

# 왜 못 쓰는가. 화면이 이 사유를 그대로 보여 준다.
EXCLUSION_REASONS = {
    "HORIZON_TOO_SHORT": "예보 기간이 대상 기간을 충분히 덮지 못한다",
    "WRONG_PRODUCT_KIND": "특정 시각 예보다 — 기간 평균의 경향이 아니다",
    "NOT_PRESERVED": "발표본을 보관하지 않아 되돌릴 수 없다",
}
NO_SOURCE = "NO_OUTLOOK_SOURCE"

HORIZON_CLASS = {rp.MONTH: "SHORT", rp.QUARTER: "SEASONAL", rp.YEAR: "LONG_RANGE"}
# 각 지평이 요구하는 산출물 종류. 여기 맞지 않으면 재료로 쓰지 않는다.
HORIZON_NEEDS = {"SHORT": ("FORECAST", "OUTLOOK"), "SEASONAL": ("OUTLOOK",),
                 "LONG_RANGE": ("OUTLOOK", "SCENARIO")}


def assess(period, sources=OUTLOOK_SOURCES):
    """대상 기간을 각 산출물이 얼마나 덮는가. 쓸 수 있는 것과 못 쓰는 것을 나눈다."""
    kind, _, _ = rp.parse(period)
    horizon = HORIZON_CLASS[kind]
    need = HORIZON_NEEDS[horizon]
    total = len(rp.days(period))
    usable, excluded = [], []
    for s in sources:
        lead = s.get("maxLeadDays") or 0
        cov = min(lead, total) / total if total else 0.0
        row = dict(s)
        row["periodDays"] = total
        row["coveredDays"] = min(lead, total)
        row["coverage"] = round(cov, 3)
        if s["kind"] not in need:
            row["excludedFor"] = "WRONG_PRODUCT_KIND"
        elif cov < MIN_HORIZON_COVERAGE:
            row["excludedFor"] = "HORIZON_TOO_SHORT"
        else:
            usable.append(row)
            continue
        row["excludedReason"] = EXCLUSION_REASONS[row["excludedFor"]]
        excluded.append(row)
    return {"period": rp.label(period), "horizonClass": horizon,
            "requiredKinds": list(need), "usable": usable, "excluded": excluded,
            "periodDays": total}


def build_content(period, sources=OUTLOOK_SOURCES, facts=None):
    """§9 전망 본문. 쓸 자료가 없으면 **왜 없는지**를 본문으로 삼는다.

    돌려주는 것
      {status, horizonClass, items, sources, excluded, reasonKo, reasonEn, dataLabel}
    """
    a = assess(period, sources)
    facts = list(facts or [])
    if not a["usable"]:
        detail = "; ".join(
            "%s: %s(%d일 중 %d일)" % (s["label"], s["excludedReason"],
                                      s["periodDays"], s["coveredDays"])
            for s in a["excluded"]) or "대 볼 산출물이 하나도 없습니다"
        return {
            "status": NO_SOURCE,
            "horizonClass": a["horizonClass"],
            "items": [],
            "facts": [],
            "sources": [],
            "excluded": a["excluded"],
            "dataLabel": "NOT_EVALUABLE",
            "reasonKo": "이 기간을 덮는 예측 산출물이 없습니다 — %s." % detail,
            "reasonEn": "No prediction product covers this period.",
            # 여기서 '아마 더울 것' 같은 문장을 만들지 않는다. 그건 예측이 아니라 추측이다.
        }
    return {
        "status": "OK",
        "horizonClass": a["horizonClass"],
        "items": facts,
        "facts": facts,
        "sources": [{"id": s["id"], "label": s["label"], "kind": s["kind"],
                     "ref": s["ref"], "coverage": s["coverage"]} for s in a["usable"]],
        "excluded": a["excluded"],
        "dataLabel": "DATA_COMPLETE" if facts else "INSUFFICIENT_DATA",
        "reasonKo": None,
        "reasonEn": None,
    }


def label_for(product_kind, horizon_class):
    """화면에 뭐라고 쓸 것인가. 장기 전망을 단기 예보처럼 부르지 않는다."""
    if product_kind not in PRODUCT_KINDS:
        raise ValueError("알 수 없는 산출물 종류: %s" % product_kind)
    if horizon_class == "SHORT" and product_kind == "FORECAST":
        return {"ko": "예보", "en": "Forecast"}
    if product_kind == "SCENARIO":
        return {"ko": "시나리오", "en": "Scenario"}
    return {"ko": "전망", "en": "Outlook"}
