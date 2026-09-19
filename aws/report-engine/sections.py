# -*- coding: utf-8 -*-
"""리포트 절 구성 — 지시서 §39 · §54 · §57 · §67 · §99 · §100 · §119 · §121 · §122.

절 목록은 **고정**이다. 자료가 없다고 절을 지우지 않는다 —
지우면 독자는 그런 주제가 아예 없다고 읽는다. 대신 `NOT_AVAILABLE` 과 사유를 적는다(§119).

절 id 는 안정적이다(§100). 목차와 앵커가 그 id 를 쓴다. 이름을 바꾸면 옛 링크가 끊긴다.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "_shared"))
import report_period as rp        # noqa: E402

# ── §39 월간 16절 ────────────────────────────────────────────────────────────
MONTHLY = (
    ("executive_summary", "요약", "Executive summary"),
    ("earth_in_numbers", "숫자로 본 지구", "Earth in numbers"),
    ("global_overview", "전지구 개관", "Global overview"),
    ("major_phenomena", "주요 현상", "Major phenomena"),
    ("regional", "지역 분석", "Regional analysis"),
    ("atmosphere", "대기", "Atmosphere"),
    ("ocean", "해양", "Ocean"),
    ("land", "육상", "Land"),
    ("cryosphere", "빙권", "Cryosphere"),
    ("hazards", "자연재해", "Natural hazards"),
    ("space", "우주", "Space"),
    ("anomalies", "이상", "Anomalies"),
    ("trends", "경향", "Trends"),
    ("forecast_review", "지난 전망은 얼마나 맞았나", "How the last outlook scored"),
    ("data_quality", "자료 품질", "Data quality"),
    ("methodology", "방법", "Methodology"),
    ("sources", "출처", "Sources"),
)

# ── §54 분기 18절 — 월간 셋을 이어 붙인 것이 아니다. 경향이 주인공이다 ──────
QUARTERLY = (
    ("executive_summary", "요약", "Executive summary"),
    ("quarter_in_numbers", "숫자로 본 분기", "Quarter in numbers"),
    ("global_state", "전지구 상태", "Global Earth state"),
    ("major_events", "주요 사건", "Major events"),
    ("three_month_trends", "3개월 경향", "Three-month trends"),
    ("regional_trends", "지역별 경향", "Regional trends"),
    ("atmosphere", "대기", "Atmosphere"),
    ("ocean", "해양", "Ocean"),
    ("land", "육상", "Land"),
    ("cryosphere", "빙권", "Cryosphere"),
    ("hazards", "자연재해", "Natural hazards"),
    ("space", "우주", "Space"),
    ("anomalies", "이상", "Anomalies"),
    ("persistent", "지속 현상", "Persistent phenomena"),
    ("emerging", "새로 나타난 양상", "Emerging patterns"),
    ("forecast_review", "지난 전망은 얼마나 맞았나", "How the last outlook scored"),
    ("data_quality", "자료 품질", "Data quality"),
    ("methodology", "방법", "Methodology"),
    ("sources", "출처", "Sources"),
)

# ── §57 연간 24절 ────────────────────────────────────────────────────────────
ANNUAL = (
    ("cover", "표지", "Cover"),
    ("year_in_review", "한 해 돌아보기", "Year in review"),
    ("state_of_earth", "지구의 상태", "State of Earth"),
    ("year_in_numbers", "숫자로 본 한 해", "Year in numbers"),
    ("global_changes", "전지구 변화", "Global changes"),
    ("major_events", "주요 사건", "Major events"),
    ("timeline", "연간 연표", "Annual timeline"),
    ("atmosphere", "기후·대기", "Climate / atmosphere"),
    ("ocean", "해양", "Ocean"),
    ("land", "육상", "Land"),
    ("cryosphere", "빙권", "Cryosphere"),
    ("hazards", "자연재해", "Natural hazards"),
    ("human_signals", "사람·도시 신호", "Human / urban signals"),
    ("space", "우주", "Space"),
    ("anomalies", "전지구 이상", "Global anomalies"),
    ("regional", "지역 분석", "Regional analysis"),
    ("long_term_trends", "장기 경향", "Long-term trends"),
    ("most_significant", "가장 중요한 현상", "Most significant phenomena"),
    ("persistent", "지속 현상", "Persistent phenomena"),
    ("emerging", "새로 나타난 양상", "Emerging patterns"),
    ("forecast_review", "지난 전망은 얼마나 맞았나", "How the last outlook scored"),
    ("data_quality", "자료 품질", "Data quality"),
    ("methodology", "방법", "Methodology"),
    ("limitations", "한계", "Limitations"),
    ("sources", "출처", "Sources"),
)

SPEC = {"RETROSPECTIVE_MONTHLY": MONTHLY,
        "RETROSPECTIVE_QUARTERLY": QUARTERLY,
        "RETROSPECTIVE_ANNUAL": ANNUAL}

# 절 ↔ 영역. 영역 팩트를 어느 절에 넣을지.
SECTION_DOMAIN = {"atmosphere": "ATMOSPHERE", "ocean": "OCEAN", "land": "LAND",
                  "cryosphere": "CRYOSPHERE", "hazards": "HAZARDS", "space": "SPACE"}

# §119 — 자료가 없는 절의 사유. **사유 없는 빈 절을 만들지 않는다**(§99 가 그걸 막는다).
NOT_AVAILABLE_REASONS = {
    "CRYOSPHERE": ("빙권 사건 계산기가 없습니다. 해빙·적설·빙하를 기간 단위로 집계할 자료가 아직 없습니다.",
                   "No cryosphere event engine exists yet."),
    "HUMAN": ("사람·도시 신호를 기간 단위로 낼 수 있는 신뢰할 만한 자료가 없습니다.",
              "No reliable human/urban signal dataset for this period."),
    "ANOMALY": ("평년 기준선이 없습니다. 사건 이력의 기후값을 만들지 않은 채 '평년 대비'를 말하지 않습니다.",
                "No climatological baseline exists; we do not state anomalies without one."),
    "TREND": ("경향을 말하려면 같은 방법으로 모은 여러 기간이 필요합니다. 아직 그만큼 쌓이지 않았습니다.",
              "A trend needs several comparable periods; not enough have accumulated."),
    "NO_EVENTS": ("이 기간에 해당하는 사건이 없습니다.", "No events fall in this period."),
    "NO_VERIFICATION": ("평가 데이터가 아직 축적되지 않았습니다.",
                        "Verification data has not accumulated yet."),
    "NO_FORECAST_PRODUCT": ("우리가 생산·보관하는 장기 예보 산출물이 없어 지난 전망을 만들지 않았습니다.",
                            "No in-house long-range forecast product existed to score."),
}


def _sec(sid, ko, en, **kw):
    out = {"id": sid, "titleKo": ko, "titleEn": en}
    out.update(kw)
    return out


def _not_available(sid, ko, en, reason_key):
    r = NOT_AVAILABLE_REASONS[reason_key]
    return _sec(sid, ko, en, notAvailable=True, empty=True,
                reasonKey=reason_key, reasonKo=r[0], reasonEn=r[1])


def build(report_type, *, period, facts, events=None, evaluations=None,
          coverage=None, baseline=None, trends=None, persistent=None,
          emerging=None, methodology=None, sources=None, limitations=None):
    """절 목록을 만든다. 각 절은 채워지거나, 사유와 함께 비어 있다.

    facts 는 `factId` 로 참조한다. 절 안에 값을 복사하지 않는다 —
    복사하면 팩트를 고쳤을 때 절이 옛 값을 말한다.
    """
    spec = SPEC.get(report_type)
    if not spec:
        raise ValueError(f"절 구성이 없는 리포트 종류: {report_type}")
    label = rp.label(period)
    by_id = {f["factId"]: f for f in facts or []}
    events = list(events or [])
    evaluations = list(evaluations or [])

    def facts_matching(token):
        return [fid for fid in by_id if token in fid]

    out = []
    for sid, ko, en in spec:
        # ── 자료가 원리적으로 없는 절 (§119)
        if sid == "cryosphere":
            out.append(_not_available(sid, ko, en, "CRYOSPHERE"))
            continue
        if sid == "human_signals":
            out.append(_not_available(sid, ko, en, "HUMAN"))
            continue
        if sid == "anomalies":
            if baseline:
                out.append(_sec(sid, ko, en, rows=baseline))
            else:
                out.append(_not_available(sid, ko, en, "ANOMALY"))
            continue
        if sid in ("trends", "three_month_trends", "long_term_trends", "regional_trends"):
            if trends:
                out.append(_sec(sid, ko, en, rows=trends))
            else:
                out.append(_not_available(sid, ko, en, "TREND"))
            continue
        if sid == "persistent":
            out.append(_sec(sid, ko, en, rows=persistent) if persistent
                       else _not_available(sid, ko, en, "TREND"))
            continue
        if sid == "emerging":
            out.append(_sec(sid, ko, en, rows=emerging) if emerging
                       else _not_available(sid, ko, en, "TREND"))
            continue
        if sid == "forecast_review":
            if evaluations:
                out.append(_sec(sid, ko, en,
                                evaluationRefs=[e.get("predictionId") for e in evaluations]))
            else:
                out.append(_not_available(sid, ko, en, "NO_VERIFICATION"))
            continue

        # ── 사건 기반 절
        if sid in ("major_phenomena", "major_events", "most_significant"):
            if events:
                out.append(_sec(sid, ko, en, cards=events,
                                rankingNote="순위 근거를 항목마다 importanceReason 으로 남긴다"))
            else:
                out.append(_not_available(sid, ko, en, "NO_EVENTS"))
            continue
        if sid == "timeline":
            rows = _timeline(events, period)
            out.append(_sec(sid, ko, en, months=rows) if rows
                       else _not_available(sid, ko, en, "NO_EVENTS"))
            continue
        if sid == "regional":
            refs = facts_matching(":region:")
            out.append(_sec(sid, ko, en, factRefs=sorted(refs)) if refs
                       else _not_available(sid, ko, en, "NO_EVENTS"))
            continue

        # ── 영역 절
        dom = SECTION_DOMAIN.get(sid)
        if dom:
            refs = [fid for fid in by_id if fid.endswith(f":domain:{dom}")]
            kinds = [fid for fid in by_id
                     if ":events:" in fid and _kind_domain(fid) == dom]
            allrefs = sorted(set(refs) | set(kinds))
            out.append(_sec(sid, ko, en, factRefs=allrefs) if allrefs
                       else _not_available(sid, ko, en, "NO_EVENTS"))
            continue

        # ── 숫자 절
        if sid in ("earth_in_numbers", "quarter_in_numbers", "year_in_numbers"):
            refs = sorted(fid for fid in by_id
                          if ":events:" in fid or ":domain:" in fid or "max-magnitude" in fid)
            out.append(_sec(sid, ko, en, factRefs=refs) if refs
                       else _not_available(sid, ko, en, "NO_EVENTS"))
            continue

        if sid in ("global_overview", "global_state", "global_changes", "state_of_earth",
                   "year_in_review"):
            total = [fid for fid in by_id if fid.endswith(":events:total")]
            out.append(_sec(sid, ko, en, factRefs=total,
                            comparisonNote=("이전 기간·평년 비교는 기준선이 생긴 뒤에 넣는다. "
                                            "방향만 보고 원인을 말하지 않는다."))
                       if total else _not_available(sid, ko, en, "NO_EVENTS"))
            continue

        if sid == "executive_summary":
            out.append(_sec(sid, ko, en,
                            factRefs=[fid for fid in by_id if fid.endswith(":events:total")],
                            cards=events[:3],
                            note=f"{label} 기간, 사건 시각이 확인된 분석 보고서만 셈"))
            continue

        if sid == "data_quality":
            out.append(_sec(sid, ko, en, coverage=coverage or {},
                            state=_quality_state(coverage)))
            continue
        if sid == "methodology":
            out.append(_sec(sid, ko, en, body=methodology))
            continue
        if sid == "limitations":
            out.append(_sec(sid, ko, en, rows=limitations or []))
            continue
        if sid == "sources":
            out.append(_sec(sid, ko, en, rows=sources or []))
            continue
        if sid == "cover":
            out.append(_sec(sid, ko, en, period=label))
            continue

        # 여기 오면 명세에 있는데 채우는 규칙이 없다는 뜻이다. 조용히 비우지 않는다.
        out.append(_sec(sid, ko, en, empty=True,
                        reasonKo="이 절을 채우는 규칙이 아직 없습니다.",
                        reasonEn="No rule fills this section yet."))
    return out


def _kind_domain(fact_id):
    from adapters.lab_report_adapter import KIND_DOMAIN
    kind = fact_id.rsplit(":events:", 1)[-1]
    return KIND_DOMAIN.get(kind)


def _timeline(events, period):
    """§59 — 월별 연표. 사건이 있는 달만 채우고, 없는 달은 빈 채로 남긴다."""
    kind, start, end = rp.parse(period)
    if kind != rp.YEAR:
        return None
    months = {f"{start.year}-{m:02d}": [] for m in range(1, 13)}
    for e in events or []:
        at = (e.get("occurredAt") or "")[:7]
        if at in months:
            months[at].append({"eventId": e.get("eventId"), "title": e.get("title"),
                               "kind": e.get("kind"), "rank": e.get("rank")})
    return [{"month": m, "events": months[m]} for m in sorted(months)]


def _quality_state(coverage):
    """§67 — GOOD · MIXED · LIMITED · INSUFFICIENT. 없는 것을 숨기지 않는다."""
    if not coverage:
        return "INSUFFICIENT"
    if not coverage.get("ok"):
        return "INSUFFICIENT"
    degraded = coverage.get("degradedSources") or []
    undated = coverage.get("undated") or 0
    inside = coverage.get("inPeriod") or 0
    if degraded:
        return "LIMITED"
    if undated > inside:
        return "MIXED"
    return "GOOD"


def table_of_contents(sections):
    """§100 — 목차를 자동으로 만든다. 절 id 가 앵커다."""
    return [{"id": s["id"], "titleKo": s.get("titleKo"), "titleEn": s.get("titleEn"),
             "notAvailable": bool(s.get("notAvailable")),
             "empty": bool(s.get("empty"))} for s in sections]


def methodology_text(period, *, adapters_used, ranking, baseline_note):
    """§121 — 방법 절. 무엇을 어떻게 셌는지 사람 말로 적는다."""
    return {
        "observationPeriod": rp.label(period),
        "timezone": "UTC — 기간 경계는 UTC 자정이다. 전지구 자료의 기간을 지역 시각으로 바꾸지 않는다.",
        "adapters": list(adapters_used),
        "aggregation": ("사건 시각이 확인된 보고서만 기간에 넣는다. 시각을 모르는 것은 "
                        "어느 기간에도 넣지 않고 자료 품질 절에 개수로 남긴다."),
        "ranking": ranking,
        "baseline": baseline_note,
        "confidence": ("점수에는 언제나 표본 수를 함께 적는다. 리드타임과 모델을 합치지 않는다. "
                       "하나의 정확도 %를 만들지 않는다."),
        "knownLimitations": [
            "사건 개수는 '우리가 분석 보고서를 만든 사건'의 수다. 지구에서 일어난 사건의 수가 아니다.",
            "종류를 가로지르는 심각도 척도가 없어 개수와 규모를 따로 낸다.",
            "지역 경계는 대략적인 경위도 상자다. 정밀 통계용이 아니다.",
        ],
    }
