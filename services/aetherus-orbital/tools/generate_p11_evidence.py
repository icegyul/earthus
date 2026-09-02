"""V2-P11 (Why / Attribution / Decision) 증거 생성기.

지시서의 P11 hard gate는 "SPACE NOW + Scenario decision packet"이다. 두 산출물이고,
둘 다 자기가 무엇이 아닌지를 말할 수 있어야 한다.

* **SPACE NOW** — 지금 중요한 것. 중요도는 이유가 추적 가능해야 하며, 요인별 기여가
  드러나지 않는 순위는 순위가 아니라 선언이다.
* **Decision packet** — 선택지 비교. 지시서 절대 원칙 8번이 여기에 걸린다.
  **운영 command 기능 금지.** 결정 패킷은 자문이며, 우주선 명령을 만들지 않는다.
  그리고 이득만 보이고 새 위험을 감추면 비교가 아니다.

이 생성기가 특히 요구하는 것 둘:

1. 결정 패킷의 각 선택지가 **new_risk 와 가정(assumptions)** 을 싣는다.
2. 실행되지 않은 시나리오는 비교 대상이 될 수 없고, 그 경우 INSUFFICIENT_DATA 로
   거절된다. 없는 실행을 0으로 채워 비교하는 것이 이 단계의 실패 방식이다.

실행: services/aetherus-orbital에서 .venv/Scripts/python tools/generate_p11_evidence.py
"""

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blocker_class import BUILDABLE_NOW  # noqa: E402
from phase_evidence import (  # noqa: E402
    BASE, attempt, digest, on_path, probe, pytest_summary, server_state, write_evidence,
)

TESTS = [
    "tests/unit/test_intelligence_orchestrator.py",
    "tests/integration/test_engine_connections.py",
    "tests/acceptance/test_master_acceptance.py",
]

PROBES = ["/v1/intelligence/important-now", "/v1/intelligence/decision"]


def post(path: str, payload: dict, timeout: int = 30) -> dict:
    request = urllib.request.Request(
        BASE + path, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
            return {"path": path, "http_status": response.status,
                    "data_status": body.get("data_status"), "body": body}
    except urllib.error.HTTPError as exc:
        return {"path": path, "http_status": exc.code, "error": exc.reason}
    except Exception as exc:  # noqa: BLE001
        return {"path": path, "http_status": None, "error": str(exc)}


def space_now() -> dict:
    payload = probe("/v1/intelligence/important-now")
    rows = (payload.get("body") or {}).get("data") or []
    return {
        "http_status": payload.get("http_status"),
        "data_status": payload.get("data_status"),
        "event_count": len(rows),
        # An empty SPACE NOW is a legitimate answer; it is not the same as an
        # unavailable one, and the envelope has to say which.
        "empty_is_labelled": bool(rows) or payload.get("data_status") in
        {"OK", "UNAVAILABLE", "INSUFFICIENT_DATA"},
    }


def importance_is_traceable() -> dict:
    """A ranking that cannot show its factors is a declaration, not a ranking."""
    on_path()
    from aetherus_intelligence import ImportanceAttributionDecisionIntelligence

    engine = ImportanceAttributionDecisionIntelligence()
    result = engine.importance(magnitude=0.2, change_rate=0.9, affected_objects=10, confidence=0.8)
    reasons = list(result.reasons)
    return {
        "factor_count": len(reasons),
        "every_reason_has_a_contribution": all("contribution" in r for r in reasons),
        "every_reason_names_its_weight": all("weight" in r for r in reasons),
        "policy_version": getattr(result, "policy_version", None),
        # The weighting must be able to let a fast-changing small event outrank a
        # large static one, otherwise "change rate" is in the formula for show.
        "change_rate_can_outrank_magnitude": next(
            r["contribution"] for r in reasons if r["factor"] == "change_rate"
        ) > next(r["contribution"] for r in reasons if r["factor"] == "magnitude"),
    }


def decision_packet_is_advisory() -> dict:
    """The decision packet compares, shows new risk, and emits no command."""
    on_path()
    from uuid import uuid4

    from aetherus_intelligence import ImportanceAttributionDecisionIntelligence

    engine = ImportanceAttributionDecisionIntelligence()
    options = [
        {"scenario_id": uuid4(), "criteria": {"benefit": 0.8}, "new_risk": 0.1,
         "assumptions": ["IDEALIZED_REMOVAL"], "provenance": {"evidence": "E1"}},
        {"scenario_id": uuid4(), "criteria": {"benefit": 0.7}, "new_risk": 0.0,
         "assumptions": ["SCREENING_RECOMPUTE_V1"], "provenance": {"evidence": "E2"}},
    ]
    comparison = engine.decision(baseline_scenario_id=uuid4(), options=options, criteria=["benefit"])
    ranked = list(comparison.ranked_options)

    single_option_refused = False
    try:
        engine.decision(baseline_scenario_id=uuid4(), options=options[:1], criteria=["benefit"])
    except ValueError:
        single_option_refused = True

    return {
        "option_count": len(ranked),
        "advisory_only": bool(getattr(comparison, "advisory_only", False)),
        "every_option_shows_new_risk": all("new_risk" in option for option in ranked),
        "every_option_surfaces_assumptions": all(
            option.get("assumptions") for option in ranked
        ),
        "no_command_field_anywhere": all(
            "command" not in key and "spacecraft" not in key
            for option in ranked for key in option
        ),
        # A single option cannot be "the best" without a stated policy saying so.
        "single_option_refused_without_policy": single_option_refused,
    }


def unrun_scenarios_are_refused() -> dict:
    """A scenario with no stored execution cannot enter a comparison."""
    response = post("/v1/intelligence/decision", {
        "option_scenario_ids": ["00000000-0000-0000-0000-000000000000"],
        "criteria": ["benefit"],
    })
    body = response.get("body") or {}
    return {
        "http_status": response.get("http_status"),
        "data_status": body.get("data_status"),
        "refused_as_insufficient": body.get("data_status") == "INSUFFICIENT_DATA"
        or response.get("http_status") in {404, 422},
        "warnings": body.get("warnings"),
    }


def main() -> None:
    tests = pytest_summary(TESTS)
    build = server_state(["/v1/intelligence/important-now"])
    now = attempt(space_now)
    importance = attempt(importance_is_traceable)
    decision = attempt(decision_packet_is_advisory)
    refusal = attempt(unrun_scenarios_are_refused)

    n = now.get("value") or {}
    i = importance.get("value") or {}
    d = decision.get("value") or {}
    x = refusal.get("value") or {}
    live = build["state"] == "CURRENT"

    checks = {
        "tests_pass": tests.get("exit_code") == 0,
        "space_now_served": live and n.get("http_status") == 200,
        "space_now_states_its_data_status": bool(n.get("empty_is_labelled")),
        "importance_reasons_are_traceable": bool(i.get("every_reason_has_a_contribution"))
        and bool(i.get("every_reason_names_its_weight")),
        "change_rate_can_outrank_magnitude": bool(i.get("change_rate_can_outrank_magnitude")),
        "decision_packet_is_advisory_only": bool(d.get("advisory_only"))
        and bool(d.get("no_command_field_anywhere")),
        "decision_shows_new_risk_and_assumptions": bool(d.get("every_option_shows_new_risk"))
        and bool(d.get("every_option_surfaces_assumptions")),
        "single_option_refused_without_policy": bool(d.get("single_option_refused_without_policy")),
        "unrun_scenarios_cannot_be_compared": bool(x.get("refused_as_insufficient")),
    }
    blockers = {
        "tests_pass": (BUILDABLE_NOW, "귀속/결정 테스트 미통과 — 내부 작업"),
        "space_now_served": (
            BUILDABLE_NOW, f"SPACE NOW 미확인 (server state={build['state']}) — 내부 작업",
        ),
        "space_now_states_its_data_status": (
            BUILDABLE_NOW,
            "비어 있음과 사용 불가를 구분하지 않는다. 봉투가 어느 쪽인지 말해야 한다 — 내부 작업",
        ),
        "importance_reasons_are_traceable": (
            BUILDABLE_NOW,
            "중요도 순위가 요인별 기여를 보이지 않는다. 이유 없는 순위는 선언이다 — 내부 작업",
        ),
        "change_rate_can_outrank_magnitude": (
            BUILDABLE_NOW,
            "변화율이 정적 규모를 앞설 수 없다면 공식 안의 변화율은 장식이다 — 내부 작업",
        ),
        "decision_packet_is_advisory_only": (
            BUILDABLE_NOW,
            "결정 패킷이 자문 표기를 잃었거나 명령 형태 필드를 담고 있다. 지시서 절대 원칙 8 위반 — 내부 작업",
        ),
        "decision_shows_new_risk_and_assumptions": (
            BUILDABLE_NOW,
            "새 위험 또는 가정이 선택지에 없다. 이득만 보이는 비교는 비교가 아니다 — 내부 작업",
        ),
        "single_option_refused_without_policy": (
            BUILDABLE_NOW,
            "선택지 하나로 최선을 주장한다. 명시 정책 없이는 거절해야 한다 — 내부 작업",
        ),
        "unrun_scenarios_cannot_be_compared": (
            BUILDABLE_NOW,
            "실행되지 않은 시나리오가 비교에 들어간다. 없는 실행을 0으로 채우는 것이 이 단계의 실패 방식이다 — 내부 작업",
        ),
    }

    write_evidence(
        phase="p11",
        phase_name="Why / Attribution / Decision",
        hard_gate="SPACE NOW + Scenario decision packet",
        checks=checks,
        blockers=blockers,
        tests_attribution_decision=tests,
        space_now=now,
        importance=importance,
        decision_packet=decision,
        unrun_scenario_refusal=refusal,
        live_build=build,
        live_api={"important_now": digest(probe("/v1/intelligence/important-now"))},
        limitations=[
            "결정 비교는 자문이며 우주선 명령을 만들지 않는다. 이것은 성능 한계가 아니라 "
            "지시서가 정한 제품 경계다.",
            "중요도 가중치는 정책 버전이 붙은 이 저장소의 기본값이다. 운영 기관의 우선순위 정책과 "
            "일치한다고 주장하지 않는다.",
            "귀속(attribution) 결과는 반사실 시뮬레이션에서 나오며 관측된 결과가 아니다.",
        ],
        next_allowed="P12 구독/개인화, 또는 P15 하드닝",
    )


if __name__ == "__main__":
    main()
