# -*- coding: utf-8 -*-
"""중요도 계산 (PHASE 8 §2).

"가장 큰 사건"을 손으로 고르지 않는다. 무엇을 보고 골랐는지 숫자로 남긴다.

⚠️⚠️ importance_score 는 **위험도가 아니다.**
   중요도는 "이번 기간에 이야기할 값어치"이고, 위험은 "사람이 다칠 가능성"이다.
   노출 인구·피해 자료가 없는 상태에서 이 점수를 위험도로 보여 주면 그건 거짓말이다.
   그래서 봉투에 importanceIsNotRisk 를 박고, 화면 문구에서도 '위험'을 쓰지 않는다.

⚠️ 없는 요소를 0 으로 채우지 않는다.
   인구 노출 자료가 없다고 중요도를 깎으면, 자료가 없는 지역이 조용히 덜 중요해진다.
   대신 **있는 요소끼리만** 가중치를 다시 정규화하고, 무엇이 빠졌는지 함께 돌려준다.

⚠️ 도메인마다 무엇이 중요한지가 다르다. 기온은 편차와 지속이, 지진은 규모와 근접이 중요하다.
   그래서 가중치를 도메인별로 둔다 — 하나의 만능 공식을 쓰지 않는다.
"""

# 요소 이름 — 계산에 쓰는 정규화된 0~1 값
FACTORS = (
    "magnitude",            # 절대 크기 (지진 규모, 태풍 강도 …)
    "anomaly_magnitude",    # 평년 대비 편차의 크기 (표준편차 배수)
    "duration",             # 기간 중 이어진 비율
    "spatial_extent",       # 같은 방향으로 움직인 지역 비율
    "population_exposure",  # 노출 인구 — 자료가 있을 때만
    "rarity",               # 기록 안에서의 희소성 (순위)
    "confidence",           # 자료의 신뢰
    "forecast_surprise",    # 예보와 얼마나 달랐나 — 예보가 있을 때만
    "cross_domain",         # 다른 분야와 이어졌나
)

# 도메인별 가중치. 여기 없는 도메인은 DEFAULT 를 쓴다.
# 합이 1 일 필요는 없다 — 있는 요소끼리 다시 정규화한다.
WEIGHTS = {
    "weather.temperature":          {"anomaly_magnitude": 0.35, "duration": 0.25,
                                     "spatial_extent": 0.20, "rarity": 0.15, "confidence": 0.05},
    "weather.temperature_anomaly":  {"anomaly_magnitude": 0.35, "duration": 0.25,
                                     "spatial_extent": 0.20, "rarity": 0.15, "confidence": 0.05},
    "ocean.sst":                    {"anomaly_magnitude": 0.35, "rarity": 0.25,
                                     "duration": 0.20, "spatial_extent": 0.15, "confidence": 0.05},
    "ocean.sst_anomaly":            {"anomaly_magnitude": 0.35, "rarity": 0.25,
                                     "duration": 0.20, "spatial_extent": 0.15, "confidence": 0.05},
    "ocean.sea_ice":                {"anomaly_magnitude": 0.30, "rarity": 0.30,
                                     "duration": 0.25, "confidence": 0.15},
    # 태풍: 강도 · 지속 · 육지 영향 · 예보 의외성 (§2 예시)
    "hazards.typhoon":              {"magnitude": 0.35, "duration": 0.20,
                                     "population_exposure": 0.25, "forecast_surprise": 0.20},
    # 지진: 규모 · 깊이 · 인구 근접 · 신뢰 (§2 예시)
    "hazards.earthquake":           {"magnitude": 0.45, "population_exposure": 0.30,
                                     "confidence": 0.25},
    "hazards.wildfire":             {"magnitude": 0.35, "duration": 0.25,
                                     "population_exposure": 0.25, "confidence": 0.15},
    "weather.precipitation":        {"anomaly_magnitude": 0.35, "duration": 0.25,
                                     "spatial_extent": 0.25, "confidence": 0.15},
}
DEFAULT_WEIGHTS = {"anomaly_magnitude": 0.30, "rarity": 0.25, "duration": 0.20,
                   "spatial_extent": 0.15, "confidence": 0.10}

# 교차도메인·예보 스토리는 현상 하나에 매이지 않는다. 전용 가중치를 둔다.
CROSS_DOMAIN_KEY = "__cross_domain__"
FORECAST_KEY = "__forecast__"
WEIGHTS[CROSS_DOMAIN_KEY] = {"cross_domain": 0.50, "rarity": 0.30, "confidence": 0.20}
WEIGHTS[FORECAST_KEY] = {"forecast_surprise": 0.45, "magnitude": 0.30, "confidence": 0.25}

# 정규화 기준. 이 값을 넘으면 1.0 으로 본다.
SIGMA_FULL = 4.0        # 평년 표준편차의 4배면 충분히 큰 편차로 본다
MIN_YEARS_FOR_RARITY = 10   # 기록이 이보다 짧으면 '희소하다'고 말하지 않는다


def _clip(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def rarity_from_rank(rank_high, rank_low, of_years):
    """순위 → 희소성. 양 끝이 희소하다 — 가장 높은 해도, 가장 낮은 해도.

    기록이 짧으면(10년 미만) 희소성을 말하지 않는다. 3년 중 1등은 1등이 아니다.
    """
    if not of_years or of_years < MIN_YEARS_FOR_RARITY:
        return None
    if rank_high is None and rank_low is None:
        return None
    r = min(x for x in (rank_high, rank_low) if x is not None)
    # 1위면 1.0, 한가운데면 0.0
    half = (of_years + 1) / 2.0
    return _clip(1.0 - (r - 1) / max(half - 1, 1))


def confidence_from(data_label, coverage=None, baseline_years=None, sample_count=None):
    """자료가 얼마나 든든한가. 라벨이 먼저고, 나머지가 조금씩 깎는다."""
    base = {"DATA_COMPLETE": 1.0, "DATA_PARTIAL": 0.7,
            "INSUFFICIENT_DATA": 0.2, "NOT_EVALUABLE": 0.0}.get(data_label, 0.5)
    if coverage is not None:
        base = min(base, _clip(float(coverage)))
    if baseline_years is not None and baseline_years < 30:
        base *= _clip(baseline_years / 30.0, 0.5, 1.0)
    if sample_count is not None and sample_count <= 0:
        return 0.0
    return round(_clip(base), 4)


def score(phenomenon_id, factors):
    """있는 요소끼리만 가중 평균한다. 없는 요소는 0 이 아니라 '없음'이다.

    돌려주는 것
      {score, weightsUsed, factorsUsed, missingFactors, domainWeights}
    """
    weights = WEIGHTS.get(phenomenon_id) or DEFAULT_WEIGHTS
    used, missing = {}, []
    for name, w in weights.items():
        v = factors.get(name)
        if v is None:
            missing.append(name)
            continue
        used[name] = (w, _clip(float(v)))
    # 요소를 하나도 못 구했으면 점수를 만들지 않는다.
    if not used:
        return {"score": None, "weightsUsed": {}, "factorsUsed": {},
                "missingFactors": sorted(weights), "domainWeights": dict(weights),
                "reason": "INSUFFICIENT_DATA"}
    total_w = sum(w for w, _ in used.values())
    s = sum(w * v for w, v in used.values()) / total_w
    return {
        "score": round(_clip(s), 4),
        "weightsUsed": {k: round(w / total_w, 4) for k, (w, _) in used.items()},
        "factorsUsed": {k: round(v, 4) for k, (_, v) in used.items()},
        "missingFactors": sorted(missing),
        "domainWeights": dict(weights),
    }


def factors_from_climate(analysis, *, spatial_extent=None, forecast_surprise=None,
                         cross_domain=None):
    """기후 시계열 요약 → 정규화 요소. 없는 것은 넣지 않는다(None 도 넣지 않는다)."""
    out = {}
    sig = analysis.get("anomalySigma")
    if sig is not None:
        out["anomaly_magnitude"] = _clip(abs(sig) / SIGMA_FULL)
    exp = analysis.get("expectedDays") or 0
    if exp and analysis.get("longestRun") is not None:
        out["duration"] = _clip(analysis["longestRun"] / exp)
    r = rarity_from_rank(analysis.get("rankHigh"), analysis.get("rankLow"),
                         analysis.get("ofYears"))
    if r is not None:
        out["rarity"] = r
    out["confidence"] = confidence_from(analysis.get("dataLabel"),
                                        coverage=analysis.get("coverage"),
                                        baseline_years=analysis.get("baselineYears"),
                                        sample_count=analysis.get("days"))
    if spatial_extent is not None:
        out["spatial_extent"] = _clip(spatial_extent)
    if forecast_surprise is not None:
        out["forecast_surprise"] = _clip(forecast_surprise)
    if cross_domain is not None:
        out["cross_domain"] = _clip(cross_domain)
    # population_exposure 는 넣지 않는다 — 이 자료에는 노출 인구가 없다.
    return out


def rank_stories(scored, limit=None):
    """중요도 내림차순. 같은 점수면 순위(희소성)가 높은 쪽을 앞에 둔다."""
    def key(x):
        return (-(x.get("importanceScore") or 0),
                -(x.get("factors", {}).get("rarity") or 0),
                str(x.get("storyId")))
    out = sorted(scored, key=key)
    return out[:limit] if limit else out
