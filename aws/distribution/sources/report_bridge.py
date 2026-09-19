# -*- coding: utf-8 -*-
"""리포트 → SNS 콘텐츠 후보 — 지시서 §63 · §64 · §129.

리포트가 SNS 의 원천이 된다. 반대는 아니다.
같은 사건이 리포트 절과 SNS 게시물 양쪽에 나와도 **현상은 하나다** — 복제하지 않는다.

여기서 새 숫자를 만들지 않는다. 리포트가 이미 검증을 통과한 팩트만 옮긴다.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(_HERE)), "_shared"))

import content_contract as cc      # noqa: E402
import eligibility as el           # noqa: E402

# 리포트 종류 → 콘텐츠 유형. 전망은 SNS 콘텐츠로 내보내지 않는다 —
# 우리가 생산하는 장기 예보 산출물이 없어서 지금은 빈 리포트이기 때문이다.
REPORT_CONTENT_TYPE = {
    "RETROSPECTIVE_MONTHLY": "MONTHLY_EARTH",
    "RETROSPECTIVE_QUARTERLY": "QUARTERLY_EARTH",
    "RETROSPECTIVE_ANNUAL": "ANNUAL_EARTH",
}


def candidate(report, *, top_n=4, lang="ko", report_link=None):
    """리포트 하나에서 콘텐츠 후보를 만든다.

    빈 리포트(§119 DATA_NOT_AVAILABLE)는 **후보를 만들지 않는다.**
    "이번 달은 자료가 없습니다"를 SNS 에 올리는 것은 콘텐츠가 아니다.
    """
    ctype = REPORT_CONTENT_TYPE.get(report.get("type"))
    if not ctype:
        return None
    facts = list(report.get("facts") or [])
    if not facts:
        return None

    refs = []
    for f in facts:
        for r in f.get("evidenceRefs") or []:
            if r not in refs:
                refs.append(r)
    if not refs:
        return None

    period = report.get("period") or {}
    label = _period_label(period)

    claims = [cc.make_claim(
        text=f"{label} 기간의 EARTHUS 리포트가 {len(facts)}개 팩트로 발행됐다.",
        claim_type="OBSERVED", source_refs=refs, evidence_refs=refs, lang=lang)]

    # 상위 팩트만 옮긴다. 전부 넣으면 캡션이 아니라 표가 된다.
    for f in facts[:top_n]:
        claims.append(cc.make_claim(
            text=f"{f.get('metric')}: {f.get('value')}{f.get('unit') or ''}"
                 + (f" (표본 {f['sampleCount']})" if f.get("sampleCount") else ""),
            claim_type="ANALYZED", source_refs=f.get("evidenceRefs") or refs,
            evidence_refs=f.get("evidenceRefs") or refs,
            fact_id=f.get("factId"), lang=lang))

    return {
        "sourceKind": "report",
        "reportKind": report.get("type"),
        "eventId": None,
        "reportId": report.get("reportId"),
        "phenomenonId": (report.get("phenomenonIds") or [None])[0],
        "phenomenonIds": list(report.get("phenomenonIds") or []),
        "contentType": ctype,
        "title": f"EARTHUS {_type_ko(report.get('type'))} · {label}",
        "headline": None,
        "summary": None,
        "status": "FINAL_REPORT",
        "eventTime": None,
        "observationPeriod": {"from": period.get("from"), "to": period.get("to")},
        "geometry": {"type": "global"},
        "location": None,
        "facts": facts,
        "claims": claims,
        "signals": {
            "magnitude": el.UNKNOWN, "anomaly": el.UNKNOWN,
            "extent": 1.0,                      # 지구 전체를 다룬다
            "duration": 1.0, "novelty": 0.5,
            "public_relevance": 0.6,
            "data_completeness": el.completeness(len(facts), max(len(facts), 1)),
        },
        "truthType": "EARTHUS_ANALYSIS",
        "sourceCount": len(refs),
        "sampleCount": sum(f.get("sampleCount") or 0 for f in facts) or None,
        "datasetRefs": refs,
        "verified": report.get("lifecycle") == "PUBLISHED",
        "dataSnapshotId": report.get("dataSnapshotId"),
        "link": report_link,
        "raw": None,
    }


def _period_label(period):
    a = (period or {}).get("from") or ""
    b = (period or {}).get("to") or ""
    if len(a) >= 7 and a[:7] == b[:7]:
        return a[:7]
    if len(a) >= 4 and a[:4] == b[:4]:
        return a[:4]
    return f"{a[:10]}~{b[:10]}"


def _type_ko(rtype):
    return {"RETROSPECTIVE_MONTHLY": "월간 지구 리포트",
            "RETROSPECTIVE_QUARTERLY": "분기 지구 리포트",
            "RETROSPECTIVE_ANNUAL": "연간 지구 리포트"}.get(rtype, "리포트")
