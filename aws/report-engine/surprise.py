# -*- coding: utf-8 -*-
"""What surprised us — 예보와 실제가 어긋난 곳 (PHASE 8 §3).

월간 보고서의 고정 절이다. 우리가 틀린 것을 숨기지 않기 위해 만든다.

⚠️⚠️ **예측이 없던 현상은 "예측에서 벗어났다"고 말하지 않는다**(§3).
   8월 해수면온도가 45년 만에 가장 높았다는 것은 놀라운 일이지만,
   우리에게 그걸 맞히려던 예보가 없었으므로 '빗나갔다'가 아니다.
   그건 INSUFFICIENT_FORECAST_COVERAGE — 애초에 볼 수 있는 눈이 없었다는 뜻이다.
   이 둘을 섞으면 "우리 예보가 틀렸다"와 "우리에겐 예보가 없다"가 같은 말이 된다.

⚠️ 우리가 낼 수 있는 판정과 못 내는 판정을 분명히 나눈다.
   낼 수 있는 것   MAGNITUDE_OFF (오차가 한쪽으로 치우쳤나)
                   INSUFFICIENT_FORECAST_COVERAGE
   못 내는 것      DIRECTION_WRONG  — 편차 방향 적중(anomaly_direction_hit)을 kma-verify 가
                                      만들지 않는다. 없는 지표로 판정하지 않는다.
                   TIMING_OFF       — 사건 시각 예보/실황 짝이 없다
                   SPATIAL_MISS     — 지점별 채점을 기간 집계로만 갖고 있다
   못 내는 것은 '없음'이 아니라 **'아직 못 본다'**로 남긴다.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_shared"))
import report_contract as rc      # noqa: E402
import report_period as rp        # noqa: E402

# 오차 중 한쪽 방향이 차지하는 비율이 이보다 크면 '치우쳤다'고 본다.
# |평균오차| / 평균절대오차 — 1 에 가까울수록 오차가 통째로 한 방향이다.
SYSTEMATIC_RATIO = 0.4
MIN_SAMPLE = 100        # 이보다 적은 표본으로는 치우침을 말하지 않는다

# 지금 구조로는 낼 수 없는 판정과 그 이유. 보고서가 이걸 그대로 보여 준다.
NOT_COMPUTABLE = {
    "DIRECTION_WRONG": "편차 방향 적중 지표를 채점 자료가 만들지 않는다",
    "TIMING_OFF": "사건 시각을 예보와 짝지은 기록이 없다",
    "SPATIAL_MISS": "지점별 채점을 기간 집계로만 보관한다",
}


def from_verifications(verifications, period):
    """채점 결과 → 놀란 지점. 예보가 있는 곳에서만 만든다."""
    out = []
    for v in verifications or []:
        if v.get("status") == rc.NOT_VERIFIABLE:
            continue
        scores = v.get("scores") or {}
        mae, bias = scores.get("mae"), scores.get("bias")
        n = (v.get("observationValue") or {}).get("sampleCount") if isinstance(
            v.get("observationValue"), dict) else None
        if mae is None or bias is None or not mae:
            continue
        if n is not None and n < MIN_SAMPLE:
            continue
        ratio = abs(bias) / mae
        if ratio < SYSTEMATIC_RATIO:
            continue
        high = bias > 0
        out.append({
            "type": "MAGNITUDE_OFF",
            "phenomenonId": v.get("phenomenonId"),
            "modelId": v.get("modelId"),
            "leadHours": v.get("leadHours"),
            "period": rp.label(period),
            "predictionId": v.get("predictionId"),
            "bias": bias,
            "mae": mae,
            "systematicRatio": round(ratio, 3),
            "sampleCount": n,
            "directionKo": "높게" if high else "낮게",
            # 문장은 stories 가 만든다. 여기서는 판정과 숫자만 낸다.
        })
    return sorted(out, key=lambda x: -x["systematicRatio"])


def coverage_gaps(observed_phenomena, forecast_phenomena, *, extremes=None):
    """예보가 아예 없던 현상. '틀렸다'가 아니라 '볼 수 없었다'로 남긴다.

    extremes 에 이번 기간 기록급이던 현상을 주면, 그 사실을 함께 적는다 —
    '기록이 깨졌는데 우리에겐 그걸 맞히려던 예보가 없었다'가 이 절의 핵심이다.
    """
    extremes = set(extremes or [])
    gaps = []
    for phen in sorted(set(observed_phenomena) - set(forecast_phenomena)):
        gaps.append({
            "type": "INSUFFICIENT_FORECAST_COVERAGE",
            "phenomenonId": phen,
            "wasExtreme": phen in extremes,
            "reason": "NO_FORECAST_SNAPSHOT",
        })
    return gaps


def build_section(verifications, period, *, observed_phenomena=None,
                  forecast_phenomena=None, extremes=None):
    """§3 절 전체. 낼 수 있는 판정, 못 내는 판정, 예보 공백을 한 번에 돌려준다."""
    items = from_verifications(verifications, period)
    gaps = coverage_gaps(observed_phenomena or [], forecast_phenomena or [], extremes=extremes)
    label = "DATA_COMPLETE" if items else ("DATA_PARTIAL" if gaps else "INSUFFICIENT_DATA")
    return {
        "id": "what_surprised_us",
        "titleKo": "예상과 달랐던 것",
        "titleEn": "What surprised us",
        "period": rp.label(period),
        "items": items,
        "coverageGaps": gaps,
        "notComputable": [{"type": k, "reasonKo": v} for k, v in sorted(NOT_COMPUTABLE.items())],
        "dataLabel": label,
        "empty": not items and not gaps,
    }
