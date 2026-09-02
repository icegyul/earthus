"""V2-P10 (Event / Revision / Confidence) 증거 생성기.

지시서의 P10 hard gate는 "WHAT CHANGED / HOW SURE E2E"다. 두 질문이고, 둘 다
E2E여야 한다 — 엔진 안에서만 참인 것은 이 관문을 통과하지 못한다.

* **무엇이 바뀌었나** — 이벤트에 개정(revision) 계보가 있고, 개정 사이의 차이가
  기록된다. 개정이 없는 이벤트는 "바뀐 것이 없다"가 아니라 "아직 바뀐 적 없다"이며
  둘은 다르다.
* **얼마나 확실한가** — 신뢰도와 불확실성이 함께 붙는다. **불확실성이 없다는 것을
  0으로 적지 않는다.** `representation` 이 NONE/UNAVAILABLE 인 것과 구간이 0인 것은
  전혀 다른 진술이다.

두 번째가 이 저장소가 반복해서 밟은 자리라 검사에 명시한다.

실행: services/aetherus-orbital에서 .venv/Scripts/python tools/generate_p10_evidence.py
(라이브 프로브는 선택. 앱이 127.0.0.1:8100 에 없으면 그 사실이 기록된다.)
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blocker_class import BUILDABLE_NOW  # noqa: E402
from phase_evidence import (  # noqa: E402
    attempt, digest, probe, pytest_summary, server_state, write_evidence,
)

TESTS = [
    "tests/unit/test_confidence_honesty.py",
    "tests/integration/test_foundation_intelligence_lineage.py",
    "tests/acceptance/test_master_acceptance.py",
]

PROBES = ["/v1/intelligence/events"]


def first_event_id() -> str | None:
    payload = probe("/v1/intelligence/events")
    rows = (payload.get("body") or {}).get("data") or []
    return str(rows[0]["id"]) if rows else None


def revision_lineage(event_id: str | None) -> dict:
    """WHAT CHANGED: an event carries revisions, and each says what it changed."""
    if event_id is None:
        return {"reason": "no stored intelligence event to inspect"}
    payload = probe(f"/v1/intelligence/events/{event_id}/revisions")
    rows = (payload.get("body") or {}).get("data") or []
    return {
        "http_status": payload.get("http_status"),
        "revision_count": len(rows),
        "revisions_are_ordered": [r.get("revision_number") for r in rows]
        == sorted(r.get("revision_number") for r in rows),
        "each_revision_states_a_change": all(
            r.get("change_summary") or r.get("changed_fields") or r.get("reason") for r in rows
        )
        if rows
        else False,
    }


def confidence_and_uncertainty(event_id: str | None) -> dict:
    """HOW SURE: a grade and an uncertainty representation, neither invented."""
    if event_id is None:
        return {"reason": "no stored intelligence event to inspect"}
    payload = probe(f"/v1/intelligence/events/{event_id}/confidence")
    data = (payload.get("body") or {}).get("data") or {}
    confidence = data.get("confidence") or {}
    uncertainty = data.get("uncertainty") or {}
    representation = uncertainty.get("representation")
    return {
        "http_status": payload.get("http_status"),
        "confidence_grade": confidence.get("grade"),
        "confidence_score": confidence.get("score"),
        "uncertainty_representation": representation,
        "both_present": bool(confidence) and bool(uncertainty),
        "grade_present": bool(confidence.get("grade")),
        # The distinction this repository has had to relearn: an absent
        # uncertainty is named absent, never written as a zero-width interval.
        "absence_is_named_not_zeroed": (
            representation in {"NONE", "UNAVAILABLE", "QUALITATIVE"}
            and uncertainty.get("lower") is None
            and uncertainty.get("upper") is None
        )
        or representation in {"INTERVAL", "COVARIANCE", "DISTRIBUTION", "PERCENTILES"},
        # A confidence score must never be produced without a grade to read it by.
        "no_score_without_a_grade": confidence.get("score") is None
        or bool(confidence.get("grade")),
    }


def main() -> None:
    tests = pytest_summary(TESTS)
    build = server_state(PROBES)
    event_id = first_event_id()
    revisions = attempt(lambda: revision_lineage(event_id))
    sureness = attempt(lambda: confidence_and_uncertainty(event_id))

    r = revisions.get("value") or {}
    s = sureness.get("value") or {}
    live = build["state"] == "CURRENT"

    checks = {
        "tests_pass": tests.get("exit_code") == 0,
        "an_event_exists_to_inspect": event_id is not None,
        "revision_lineage_served": live and r.get("http_status") == 200,
        "revisions_are_ordered": bool(r.get("revisions_are_ordered")),
        "confidence_and_uncertainty_served_together": live and bool(s.get("both_present")),
        "confidence_carries_a_grade": bool(s.get("grade_present")),
        "absent_uncertainty_is_named_not_zeroed": bool(s.get("absence_is_named_not_zeroed")),
        "no_confidence_score_without_a_grade": bool(s.get("no_score_without_a_grade")),
        "a_revision_has_actually_occurred": (r.get("revision_count") or 0) > 1,
    }
    blockers = {
        "tests_pass": (BUILDABLE_NOW, "이벤트/개정/신뢰도 테스트 미통과 — 내부 작업"),
        "an_event_exists_to_inspect": (
            BUILDABLE_NOW,
            "검사할 인텔리전스 이벤트가 저장돼 있지 않다 — 내부 작업",
        ),
        "revision_lineage_served": (
            BUILDABLE_NOW,
            f"개정 계보 미확인 (server state={build['state']}) — 내부 작업",
        ),
        "revisions_are_ordered": (BUILDABLE_NOW, "개정 번호가 순서를 이루지 않음 — 내부 작업"),
        "confidence_and_uncertainty_served_together": (
            BUILDABLE_NOW,
            "신뢰도와 불확실성이 함께 제공되지 않음 — 내부 작업",
        ),
        "confidence_carries_a_grade": (BUILDABLE_NOW, "신뢰도 등급 부재 — 내부 작업"),
        "absent_uncertainty_is_named_not_zeroed": (
            BUILDABLE_NOW,
            "불확실성 부재가 0 구간으로 적히고 있다. 없음과 0은 다른 진술이다 — 내부 작업",
        ),
        "no_confidence_score_without_a_grade": (
            BUILDABLE_NOW,
            "등급 없이 점수만 산출됨. 읽는 기준 없는 점수는 해석될 수 없다 — 내부 작업",
        ),
        "a_revision_has_actually_occurred": (
            BUILDABLE_NOW,
            "이벤트에 개정이 한 번도 일어나지 않았다. WHAT CHANGED 를 E2E 로 보이려면 "
            "실제 개정이 하나는 있어야 한다 — 내부 작업",
        ),
    }

    write_evidence(
        phase="p10",
        phase_name="Event / Revision / Confidence",
        hard_gate="WHAT CHANGED / HOW SURE E2E",
        checks=checks,
        blockers=blockers,
        tests_event_revision_confidence=tests,
        inspected_event_id=event_id,
        revision_lineage=revisions,
        confidence_and_uncertainty=sureness,
        live_build=build,
        live_api={"events": digest(probe("/v1/intelligence/events"))},
        limitations=[
            "개정 계보는 저장된 이벤트에 대해서만 관찰된다. 이벤트가 하나도 없으면 이 단계는 "
            "PASS 가 아니라 '검사할 대상이 없음'이며, 그렇게 기록된다.",
            "신뢰도 등급 정책과 가중치는 이 저장소의 구현이다. 외부 기관 기준과의 정합은 별도 문제다.",
        ],
        next_allowed="근접 신호의 이벤트 융합으로 실제 개정을 발생시키기, 또는 P11 귀속/결정",
    )


if __name__ == "__main__":
    main()
