# -*- coding: utf-8 -*-
"""EARTHUS 리포트 엔진 (PHASE 6).

§25 의 인터페이스를 구현한다. 계산은 어댑터가 하고, 여기서는 조립·검증·발행만 한다.

지키는 것
  · 팩트가 산문보다 먼저다. 이 파일은 문장을 만들지 않는다.
  · 자료가 없으면 점수를 만들지 않는다(§17). NOT_VERIFIABLE 사유를 그대로 실어 보낸다.
  · 얼린 예보는 고치지 않는다(§14). 검증은 언제나 prediction_id 에서 출발한다(§15).
  · 무엇을 생성해도 되는지는 docs/earthus-v2/data-availability-matrix.md 가 정한다.

새 계보를 만들지 않는다 — 봉투·상태·지표 묶음은 전부 aws/_shared/report_contract.py 것이다.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_shared"))
import report_contract as rc      # noqa: E402
import report_period as rp        # noqa: E402

GENERATOR_VERSION = "earthus.report-generator/0.1.0"

# §28 자료 가용성 표에서 온 능력 계약. 표에 없는 현상은 정기 리포트를 만들지 않는다.
# 여기 값을 늘릴 때는 반드시 그 문서를 함께 고치고 근거 file:line 을 적는다.
VERIFIABLE_DOMAINS = {
    # 현상 → (지표 묶음, 실측 출처)
    "weather.temperature": ("continuous", "기상청 ASOS"),
    "weather.wind": ("continuous", "기상청 ASOS"),
}
# 왜 못 하는지까지 적어 둔다 — 화면이 이 사유를 그대로 보여 준다.
UNVERIFIABLE_DOMAINS = {
    "weather.precipitation": "NO_OBSERVATION_ARCHIVE",
    "ocean.wave": "FORECAST_NOT_OURS",
}


class ReportError(RuntimeError):
    pass


def _period_bounds(period):
    kind, start, end = rp.parse(period)
    return kind, {"from": start.isoformat(), "to": end.isoformat()}


def _report_id(kind_prefix, period):
    return f"{kind_prefix}:{rp.label(period)}"


# ── §25 회고 ─────────────────────────────────────────────────────────────────
def generate_retrospective(period, *, snapshot, facts, evaluations=None,
                           generated_at, algorithm_version, status="DRAFT"):
    """월간·분기·연간을 한 함수로 낸다 — 기간 종류만 다르고 조립 규칙은 같다.

    facts 는 어댑터가 만든 ReportFact 목록이다. 여기서 값을 계산하지 않는다.
    """
    kind, bounds = _period_bounds(period)
    rtype = rp.REPORT_TYPE_FOR[kind]
    phen = sorted({f.get("phenomenonId") for f in facts if f.get("phenomenonId")})
    report = rc.make_report(
        report_id=_report_id("report", period),
        report_type=rtype,
        period=bounds,
        generated_at=generated_at,
        algorithm_version=algorithm_version,
        data_snapshot_id=snapshot["snapshotId"],
        status="PENDING",
        facts=list(facts),
        evaluations=list(evaluations or []),
        phenomenon_ids=phen,
        provenance=[{"generator": GENERATOR_VERSION, "snapshot": snapshot["snapshotId"]}],
    )
    report["lifecycle"] = status
    report["sections"] = _retrospective_sections(kind, facts, evaluations or [])
    return report


def _retrospective_sections(kind, facts, evaluations):
    """§7·§8·§9 의 절 구성. 내용이 없는 절은 '없음'을 명시하고 비워 둔다 — 지어내지 않는다."""
    secs = [
        {"id": "overview", "titleKo": "이번 기간의 지구", "factRefs": [f["factId"] for f in facts[:6]]},
        {"id": "changes", "titleKo": "주요 변화", "factRefs": [f["factId"] for f in facts]},
    ]
    if evaluations:
        secs.append({"id": "forecast_review", "titleKo": "지난 기간 전망은 얼마나 맞았나",
                     "evaluationRefs": [e.get("predictionId") for e in evaluations]})
    else:
        # §7 — 없으면 점수를 만들지 않고 없다고 적는다.
        secs.append({"id": "forecast_review", "titleKo": "지난 기간 전망은 얼마나 맞았나",
                     "empty": True,
                     "reasonKo": "평가 데이터가 아직 축적되지 않았습니다.",
                     "reasonEn": "Verification data has not accumulated yet."})
    if kind in (rp.QUARTER, rp.YEAR):
        secs.append({"id": "bias", "titleKo": "반복된 예측 편향",
                     "empty": not evaluations,
                     "reasonKo": None if evaluations else "표본이 쌓이기 전에는 편향을 말하지 않습니다."})
    return secs


# ── §25 전망 ─────────────────────────────────────────────────────────────────
def generate_outlook(target_period, *, snapshot, facts, generated_at, algorithm_version,
                     status="DRAFT"):
    """다음달·다음분기·다음연간. 대상 기간은 rp.next_period 로만 만든다(§32).

    §11~13 — 분기·연간은 일별 확정 예보처럼 쓰지 않는다. 그것은 어댑터가 만드는
    fact 의 metric 이 결정한다(확률·경향·범위). 여기서 문장을 만들지 않는다.
    """
    kind, bounds = _period_bounds(target_period)
    otype = rp.OUTLOOK_TYPE_FOR[kind]
    report = rc.make_report(
        report_id=_report_id("outlook", target_period),
        report_type=otype,
        period=bounds,
        generated_at=generated_at,
        algorithm_version=algorithm_version,
        data_snapshot_id=snapshot["snapshotId"],
        status="PENDING",
        facts=list(facts),
        phenomenon_ids=sorted({f.get("phenomenonId") for f in facts if f.get("phenomenonId")}),
        provenance=[{"generator": GENERATOR_VERSION, "snapshot": snapshot["snapshotId"]}],
    )
    report["lifecycle"] = status
    report["horizonClass"] = {rp.MONTH: "SHORT", rp.QUARTER: "SEASONAL", rp.YEAR: "LONG_RANGE"}[kind]
    return report


# ── §15 검증 ─────────────────────────────────────────────────────────────────
def verify_forecast(prediction, observation, *, evaluator):
    """예보 스냅샷과 실측을 짝지어 채점한다.

    prediction 없이 검증을 만들지 않는다(§15). 사후에 예보를 새로 만들어
    과거를 평가하는 것도 금지다 — 그래서 prediction 을 인자로만 받는다.
    """
    if not prediction or prediction.get("recordType") != "PREDICTION":
        raise ReportError("예보 스냅샷 없이 검증을 만들 수 없다")
    pid = prediction.get("predictionId")
    phen = prediction.get("phenomenonId")
    if phen in UNVERIFIABLE_DOMAINS:
        return rc.make_verification(prediction_id=pid, phenomenon_id=phen, metric_set=None,
                                    not_verifiable=UNVERIFIABLE_DOMAINS[phen])
    if not observation or observation.get("value") is None:
        # §17 — 자료가 없으면 점수가 없다.
        return rc.make_verification(prediction_id=pid, phenomenon_id=phen, metric_set=None,
                                    not_verifiable="NO_OBSERVATION_ARCHIVE")
    metric_set, truth = VERIFIABLE_DOMAINS.get(phen, (None, None))
    if not metric_set:
        return rc.make_verification(prediction_id=pid, phenomenon_id=phen, metric_set=None,
                                    not_verifiable="NO_MATCHING_TARGET")
    scores = evaluator(prediction, observation)
    return rc.make_verification(
        prediction_id=pid, phenomenon_id=phen, metric_set=metric_set,
        observation_period=observation.get("period"),
        observation_value=observation.get("value"),
        observation_source=observation.get("source") or truth,
        lead_hours=prediction.get("leadHours"),
        scores=scores,
    )


# ── §18 스코어카드 ───────────────────────────────────────────────────────────
def build_forecast_scorecard(period, verifications):
    """분야별 행. 점수에는 언제나 표본 수와 채점 방법을 같이 적는다.

    검증 불가 항목을 빼고 평균 내지 않는다 — 그러면 못 한 것이 잘한 것처럼 사라진다.
    """
    rows = []
    for v in verifications:
        if v.get("status") == rc.NOT_VERIFIABLE:
            rows.append({
                "phenomenonId": v.get("phenomenonId"),
                "evaluated": False,
                "reason": v.get("reason"),
                "reasonText": v.get("reasonText"),
            })
            continue
        rows.append({
            "phenomenonId": v.get("phenomenonId"),
            "evaluated": True,
            "metricSet": v.get("metricSet"),
            "leadHours": v.get("leadHours"),
            "scores": v.get("scores"),
            "sampleCount": (v.get("scores") or {}).get("n") or v.get("sampleCount"),
            "observationSource": v.get("observationSource"),
        })
    return {
        "schemaVersion": rc.VERIFICATION_SCHEMA,
        "period": rp.label(period),
        "rows": rows,
        "evaluatedCount": sum(1 for r in rows if r["evaluated"]),
        "notEvaluatedCount": sum(1 for r in rows if not r["evaluated"]),
        # §17 — 하나의 정확도 %를 만들지 않는다. 그런 필드를 아예 두지 않는다.
    }


# ── §27 아카이브 ─────────────────────────────────────────────────────────────
def build_report_archive_index(reports):
    """연도 → 종류별 목록. 발행된 것만 immutable 참조를 갖는다."""
    years = {}
    for r in reports:
        label = (r.get("period") or {}).get("from", "")[:4] or "unknown"
        years.setdefault(label, []).append({
            "reportId": r.get("reportId"),
            "type": r.get("type"),
            "period": r.get("period"),
            "status": r.get("status"),
            "lifecycle": r.get("lifecycle"),
            "publishedAt": r.get("publishedAt"),
            "version": r.get("version"),
            "immutableRef": r.get("reportId") if r.get("lifecycle") == "PUBLISHED" else None,
        })
    for v in years.values():
        v.sort(key=lambda x: (x["period"] or {}).get("from", ""))
    return {"schemaVersion": rc.REPORT_SCHEMA, "years": dict(sorted(years.items()))}


# ── §33 발행 안전 ────────────────────────────────────────────────────────────
def validate_report(report):
    """VALIDATING 단계. 실패하면 PUBLISHED 로 못 간다.

    돌려주는 것은 (ok, problems) 다. 문제를 조용히 삼키지 않는다.
    """
    problems = []
    if report.get("type") not in rc.REPORT_TYPES:
        problems.append("알 수 없는 리포트 종류")
    if not report.get("dataSnapshotId"):
        problems.append("자료 스냅샷이 없다 — 재현할 수 없다")
    if not report.get("algorithmVersion"):
        problems.append("알고리즘 버전이 없다")
    per = report.get("period") or {}
    if not per.get("from") or not per.get("to") or per["from"] > per["to"]:
        problems.append("기간이 올바르지 않다")
    for f in report.get("facts", []):
        if not f.get("phenomenonId"):
            problems.append(f"팩트 {f.get('factId')} 에 현상이 없다 — 보고서에서 현상으로 갈 수 없다")
        if f.get("value") is None:
            problems.append(f"팩트 {f.get('factId')} 에 값이 없다")
    for e in report.get("evaluations", []):
        if not e.get("predictionId"):
            problems.append("예보 스냅샷 없이 만들어진 검증이 있다")
        if e.get("status") != rc.NOT_VERIFIABLE and not (e.get("scores") or {}):
            problems.append("검증됐다면서 점수가 없다")
    return (not problems), problems


def publish(report, *, published_at):
    """검증을 통과한 것만 발행한다. 통과 못 하면 FAILED 로 남기고 올리지 않는다."""
    ok, problems = validate_report(report)
    out = dict(report)
    if not ok:
        out["lifecycle"] = "FAILED"
        out["validationProblems"] = problems
        return out
    out["lifecycle"] = "PUBLISHED"
    out["status"] = "PUBLISHED"
    out["publishedAt"] = published_at
    return out
