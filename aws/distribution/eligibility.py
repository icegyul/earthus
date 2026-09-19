# -*- coding: utf-8 -*-
"""발행 자격과 우선순위 — 지시서 §9 · §10 · §11 · §27 · §124 · §125.

**현상이 있다고 자동으로 콘텐츠가 되지 않는다.** 이 파일이 그 문지기다.

산식을 문서 밖에 두지 않는다 — 아래 SIGNALS 가 그대로 산식이다.
자료가 없는 기준은 0점이 아니라 `UNKNOWN` 이고, 판정에서 **분모에서도 빠진다.**
(0점으로 두면 자료가 없는 것이 '나쁜 것'으로 계산돼 조용히 순위가 내려간다.)
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_shared"))
import content_contract as cc   # noqa: E402

ELIGIBILITY_VERSION = "earthus.eligibility/1.0.0"

UNKNOWN = "UNKNOWN"

# ── §10 자격 기준 ────────────────────────────────────────────────────────────
# (키, 사람이 읽는 이름, 가중치). 가중치 합은 1.0 이 아니어도 된다 —
# 알 수 없는 기준을 빼고 **남은 가중치로 정규화**하기 때문이다.
SIGNALS = (
    ("magnitude",       "규모",        0.25),   # 기관이 말하는 세기 (M, m/s, hPa …)
    ("anomaly",         "평년 대비",    0.15),   # 평년/기준선에서 얼마나 벗어났나
    ("extent",          "영향 범위",    0.15),   # 지리적 범위
    ("duration",        "지속",        0.10),   # 얼마나 오래 갔나
    ("novelty",         "새로움",      0.05),   # 처음 보는가 (반복이면 낮다)
    ("public_relevance","공적 관련성",  0.15),   # 사람이 사는 곳과 얼마나 가까운가
    ("data_completeness","자료 완결성", 0.15),   # 우리가 실제로 아는 정도
)
_W = {k: w for k, _, w in SIGNALS}

# ── §27 안전등급 판정 ────────────────────────────────────────────────────────
# 이 조건에 걸리면 **자동 생성 경로로는 발행되지 않는다.** 사람이 처음부터 만든다.
HUMAN_ONLY_MARKERS = (
    "fatal", "death", "casualt", "사망", "실종", "인명", "대피령", "evacuat",
)


def _norm(value, lo, hi):
    """값을 0~1 로 자른다. lo 이하 0, hi 이상 1. 값이 없으면 UNKNOWN."""
    if value is None:
        return UNKNOWN
    try:
        v = float(value)
    except (TypeError, ValueError):
        return UNKNOWN
    if hi <= lo:
        return UNKNOWN
    return max(0.0, min(1.0, (v - lo) / (hi - lo)))


def score(signals):
    """§10 — 알 수 있는 기준만 써서 0~1 점수를 낸다.

    돌려주는 것 (score, used, unknown). used 가 비면 score 는 None 이다 —
    0.0 이 아니다. 아무것도 모르는 것과 전부 0 인 것은 다르다.
    """
    used, unknown, total_w, acc = {}, [], 0.0, 0.0
    for key, _label, w in SIGNALS:
        v = signals.get(key, UNKNOWN)
        if v is UNKNOWN or v is None:
            unknown.append(key)
            continue
        used[key] = round(float(v), 3)
        acc += float(v) * w
        total_w += w
    if total_w <= 0:
        return None, used, unknown
    return round(acc / total_w, 4), used, unknown


def priority_for(s, *, breaking=False):
    """§9 — 점수를 P0~P4 로 바꾼다. 경계값을 문서 밖에 숨기지 않는다.

    breaking(기관 발표가 방금 바뀜)은 점수와 무관하게 한 단계 올린다 —
    '지금 막 바뀐 것'은 크기와 다른 축이기 때문이다.
    """
    if s is None:
        return "P4"
    base = "P0" if s >= 0.80 else "P1" if s >= 0.62 else "P2" if s >= 0.45 else "P3" if s >= 0.25 else "P4"
    if breaking:
        order = list(cc.PRIORITIES)
        i = order.index(base)
        return order[max(0, i - 1)]
    return base


def confidence_for(*, source_count=None, truth_type=None, temporal_consistent=None,
                   spatial_consistent=None, sample_count=None, feed_confidence=None):
    """§11 — 신뢰도에는 **언제나 이유가 붙는다.**

    피드가 이미 신뢰도를 말했으면 그것을 쓴다(새 척도를 만들지 않는다).
    없으면 아래 근거로 만든다.
    """
    reasons = []
    if feed_confidence:
        mapped = cc.FEED_CONFIDENCE_TO_CONTENT.get(str(feed_confidence).lower())
        if mapped:
            return mapped, [f"사건 피드가 신뢰도 {feed_confidence} 로 판정"]

    if truth_type in ("OFFICIAL_OBSERVATION", "OFFICIAL_WARNING"):
        reasons.append("공식 기관의 관측·경보")
    elif truth_type == "OFFICIAL_FORECAST":
        reasons.append("공식 기관의 예보")
    elif truth_type == "EARTHUS_ANALYSIS":
        reasons.append("EARTHUS 자체 계산 — 원자료는 공식이지만 해석은 우리 것")

    if source_count and source_count >= 2:
        reasons.append(f"독립 출처 {source_count}곳")
    if temporal_consistent:
        reasons.append("시간적으로 일관")
    if spatial_consistent:
        reasons.append("공간적으로 일관")
    if sample_count:
        reasons.append(f"표본 {sample_count}")

    if not reasons:
        return "UNKNOWN", ["신뢰도를 판단할 근거가 없다"]

    strong = truth_type in ("OFFICIAL_OBSERVATION", "OFFICIAL_WARNING")
    multi = bool(source_count and source_count >= 2)
    big = bool(sample_count and sample_count >= 100)
    if (strong and (multi or big)) or (multi and big):
        return "HIGH", reasons
    if strong or multi or big or truth_type == "OFFICIAL_FORECAST":
        return "MEDIUM", reasons
    return "LOW", reasons


def safety_level_for(*, content_type, priority, text_blob="", official=True, verified=True):
    """§27 — LEVEL_1 자동 · LEVEL_2 검토 · LEVEL_3 사람만.

    인명 피해가 섞이면 무조건 LEVEL_3 다. 우선순위가 낮아도 그렇다 —
    '작은 사고'라는 판단 자체를 자동으로 하지 않는다.
    """
    blob = (text_blob or "").lower()
    if any(m in blob for m in HUMAN_ONLY_MARKERS):
        return "LEVEL_3_HUMAN_ONLY", "인명 관련 표현이 있다"
    if not verified:
        return "LEVEL_3_HUMAN_ONLY", "기관이 확인하지 않은 사건이다"
    if not official:
        return "LEVEL_3_HUMAN_ONLY", "공식 출처가 아니다"
    if priority in ("P0", "P1"):
        return "LEVEL_2_REVIEW", "큰 사건은 사람이 한 번 본다"
    if content_type in ("BREAKING", "NOW"):
        return "LEVEL_2_REVIEW", "속보성 콘텐츠는 사람이 한 번 본다"
    if content_type in ("DATA_STORY", "EARTH_TODAY", "EARTH_WEEKLY",
                        "MONTHLY_EARTH", "QUARTERLY_EARTH", "ANNUAL_EARTH"):
        return "LEVEL_1_AUTO", "정기 자료 콘텐츠"
    return "LEVEL_2_REVIEW", "기본값은 검토다"


def decide(*, signals, confidence, safety_level, has_source, has_numbers_backed,
           data_complete=True, manual_block=False, sensitive=False):
    """§124 · §125 — 최종 자격 판정. 차단 사유를 **전부** 돌려준다.

    하나만 돌려주면 고치고 다시 걸리고를 반복한다. 한 번에 다 말한다.
    """
    s, used, unknown = score(signals)
    reasons = []
    if manual_block:
        reasons.append("MANUAL_BLOCK")
    if not has_source:
        reasons.append("NO_SOURCE")
    if not has_numbers_backed:
        reasons.append("VALIDATION_FAILED")
    if confidence == "LOW":
        reasons.append("LOW_CONFIDENCE")
    if sensitive:
        reasons.append("SENSITIVE_EVENT")
    if not data_complete:
        reasons.append("MISSING_DATA")

    if reasons:
        verdict = "BLOCKED"
    elif confidence == "UNKNOWN" or s is None:
        verdict = "INSUFFICIENT_DATA"
    elif safety_level == "LEVEL_1_AUTO":
        verdict = "ELIGIBLE"
    else:
        verdict = "REVIEW_REQUIRED"

    return {
        "eligibility": verdict,
        "blockReasons": reasons,
        "score": s,
        "signalsUsed": used,
        "signalsUnknown": unknown,
        "method": ELIGIBILITY_VERSION,
        # §126 — 왜 이 점수인지 사람 말로 남긴다. 순위표가 이걸 그대로 보여 준다.
        "reason": _explain(s, used, unknown),
    }


def _explain(s, used, unknown):
    if s is None:
        return "판단할 수 있는 기준이 하나도 없다"
    top = sorted(used.items(), key=lambda kv: -kv[1] * _W.get(kv[0], 0))[:3]
    names = {k: label for k, label, _ in SIGNALS}
    bits = [f"{names.get(k, k)} {v:.2f}" for k, v in top if v > 0]
    tail = f" · 알 수 없음 {len(unknown)}개" if unknown else ""
    return (" · ".join(bits) or "모든 기준이 0") + tail


# ── 현상별 정규화 도우미 ─────────────────────────────────────────────────────
# 규모를 0~1 로 바꾸는 기준은 현상마다 다르다. 한 자에 다 재면 지진 M5 와
# 태풍 30m/s 가 같은 값이 된다.

def magnitude_earthquake(m):
    """M4.5(피드 하한) ~ M8.0. USGS 피드가 M4.5 미만을 주지 않는다."""
    return _norm(m, 4.5, 8.0)


def magnitude_wind(ms):
    """열대저압부 하한 17 m/s ~ 매우 강함 54 m/s (기상청 등급 경계)."""
    return _norm(ms, 17.0, 54.0)


def extent_km(km):
    """영향 반경. 10km(국지) ~ 1000km(광역)."""
    return _norm(km, 10.0, 1000.0)


def duration_hours(h):
    """1시간 ~ 10일. 그 이상은 전부 1.0 이다."""
    return _norm(h, 1.0, 240.0)


def completeness(present, total):
    """자료 완결성 — 있어야 할 칸 중 실제로 찬 비율."""
    if not total:
        return UNKNOWN
    return _norm(present / float(total), 0.0, 1.0)
