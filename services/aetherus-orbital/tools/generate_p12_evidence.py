"""V2-P12 (Personalization & Subscription) 증거 생성기.

지시서의 P12 hard gate는 "Free/Plus/Pro behavior tests"다. 그런데 이 단계에는
지시서가 절대 원칙 11번으로 못 박은 제약이 붙어 있다 — **안전·공공정보를 결제벽으로
숨기지 않는다.** 그러므로 이 단계의 관문은 "플랜마다 다르게 동작한다"가 아니라
"플랜마다 다르게 동작하되, 과학값과 공공안전 정보는 같다"이다.

두 주장을 따로 검사한다. 하나가 참이고 다른 하나가 거짓인 상태가 정확히 이 단계가
실패하는 모습이기 때문이다.

실행: services/aetherus-orbital에서 .venv/Scripts/python tools/generate_p12_evidence.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blocker_class import BUILDABLE_NOW, EXTERNAL_DATA_GATED  # noqa: E402
from phase_evidence import (  # noqa: E402
    attempt, digest, on_path, probe, pytest_summary, server_state, write_evidence,
)

TESTS = [
    "tests/acceptance/test_master_acceptance.py",
    "tests/integration/test_llm_layer_l01_l08.py",
]

PROBES = ["/v1/subscription/capabilities", "/v1/llm/explain"]


def plan_behaviour() -> dict:
    """Free/Plus/Pro really differ, and only where they are allowed to."""
    on_path()
    from aetherus_platform import SubscriptionCapabilityService

    service = SubscriptionCapabilityService()
    plans = sorted(service.plans)
    caps = {plan: service.capabilities(plan) for plan in plans}
    return {
        "plans": plans,
        "capability_counts": {plan: len(values) for plan, values in caps.items()},
        # The tiers are not copies of each other.
        "tiers_differ": len({frozenset(values) for values in caps.values()}) > 1,
        # Free is a strict subset of a paid tier, not a different product.
        "free_is_a_subset_of_paid": caps["FREE"] < caps["PRO / RESEARCH"],
        # Public safety is authorised for every plan, including one that does
        # not list the capability at all.
        "public_safety_open_to_all": all(
            service.authorize(plan, "PUBLIC_SAFETY") for plan in [*plans, "NOT_A_PLAN"]
        ),
        # A capability nobody holds is refused everywhere, so the gate is real.
        "unknown_capability_refused": not any(
            service.authorize(plan, "NOT_A_CAPABILITY") for plan in plans
        ),
    }


def science_is_not_paywalled() -> dict:
    """The scientific payload is byte-identical across every plan.

    The check behind this used to hash one payload once per plan and compare the
    result with itself, which cannot fail. It now renders through the per-plan
    view, so a paywall that ever touches a scientific value shows up here.
    """
    on_path()
    from aetherus_platform import SubscriptionCapabilityService

    service = SubscriptionCapabilityService()
    payload = {"pc": None, "pc_status": "INSUFFICIENT_DATA", "miss_distance_km": 12.5}
    plans = sorted(service.plans)

    class Paywalled(SubscriptionCapabilityService):
        """Only to prove the check can fail; never used in the product."""

        def scientific_view(self, scientific_payload, plan):
            if plan == "FREE":
                return {**scientific_payload, "miss_distance_km": None}
            return scientific_payload

    return {
        "identical_across_plans": service.scientific_hash_unchanged(payload, plans),
        # The guard is only worth reporting if it can say no.
        "guard_detects_a_paywalled_value": not Paywalled().scientific_hash_unchanged(payload, plans),
        "plans_compared": plans,
    }


def explanation_tier_never_hides_content() -> dict:
    """A plan ceiling changes how an answer is composed, not what it may hold.

    L02 lowers the model tier for a cheaper plan. The deterministic TEMPLATE
    route has to stay reachable at every plan, because that route is the one
    that can always state what the Intelligence Packet holds.
    """
    on_path()
    import aetherus_llm as llm

    router = llm.ModelRouter()
    decisions = {
        plan: router.decide("EXPLANATION", plan=plan)
        for plan in llm.ModelRouter.PLAN_TIER_CEILING
    }
    return {
        "served_tier_by_plan": {plan: d.served_tier for plan, d in decisions.items()},
        "every_plan_reaches_a_route": all(d.provider for d in decisions.values()),
        "downgrades_state_their_reason": all(
            (not d.downgraded) or bool(d.reason) for d in decisions.values()
        ),
    }


def main() -> None:
    tests = pytest_summary(TESTS)
    behaviour = attempt(plan_behaviour)
    science = attempt(science_is_not_paywalled)
    tiers = attempt(explanation_tier_never_hides_content)
    build = server_state(PROBES)
    capabilities = probe("/v1/subscription/capabilities?plan=FREE")

    b = behaviour.get("value") or {}
    s = science.get("value") or {}
    t = tiers.get("value") or {}

    checks = {
        "tests_pass": tests.get("exit_code") == 0,
        "plans_actually_differ": bool(b.get("tiers_differ")) and bool(b.get("free_is_a_subset_of_paid")),
        "capability_gate_refuses_what_no_plan_holds": bool(b.get("unknown_capability_refused")),
        "public_safety_is_never_paywalled": bool(b.get("public_safety_open_to_all")),
        "scientific_values_identical_across_plans": bool(s.get("identical_across_plans")),
        "the_paywall_guard_can_fail": bool(s.get("guard_detects_a_paywalled_value")),
        "explanation_route_reachable_at_every_plan": bool(t.get("every_plan_reaches_a_route"))
        and bool(t.get("downgrades_state_their_reason")),
        "capabilities_surface_live": build["state"] == "CURRENT"
        and capabilities.get("http_status") == 200,
        "billing_provider_verified": False,
    }
    blockers = {
        "tests_pass": (BUILDABLE_NOW, "구독·개인화 테스트 미통과 — 내부 작업"),
        "plans_actually_differ": (BUILDABLE_NOW, "플랜 간 능력 차이가 없음 — 내부 작업"),
        "capability_gate_refuses_what_no_plan_holds": (
            BUILDABLE_NOW, "능력 게이트가 통과만 시킴 — 내부 작업",
        ),
        "public_safety_is_never_paywalled": (
            BUILDABLE_NOW,
            "공공안전 정보가 플랜에 따라 막힘. 지시서 절대 원칙 11 위반 — 내부 작업",
        ),
        "scientific_values_identical_across_plans": (
            BUILDABLE_NOW, "플랜에 따라 과학값이 달라짐 — 내부 작업",
        ),
        "the_paywall_guard_can_fail": (
            BUILDABLE_NOW,
            "결제벽 감시 검사가 거짓을 낼 수 없는 형태다. 통과해도 아무것도 뜻하지 않는다 — 내부 작업",
        ),
        "explanation_route_reachable_at_every_plan": (
            BUILDABLE_NOW, "특정 플랜에서 설명 경로가 도달 불가 — 내부 작업",
        ),
        "capabilities_surface_live": (
            BUILDABLE_NOW,
            "구독 능력 표면 미확인 — 코드가 아니라 구동 중인 프로세스 문제일 수 있으므로 live_build 를 함께 본다. 내부 작업.",
        ),
        "billing_provider_verified": (
            EXTERNAL_DATA_GATED,
            "결제 공급자(구독 청구·환불·세금) 연동은 상용 계정과 자격증명이 있어야 검증된다. "
            "계약 협상이 아니라 계정·키 문제이므로 파트너 차단이 아니다.",
        ),
    }

    write_evidence(
        phase="p12",
        phase_name="Personalization & Subscription",
        hard_gate="Free/Plus/Pro behavior tests",
        checks=checks,
        blockers=blockers,
        tests_subscription=tests,
        plan_behaviour=behaviour,
        science_parity=science,
        explanation_tiers=tiers,
        live_build=build,
        live_api={"capabilities": digest(capabilities)},
        limitations=[
            "결제 공급자 연동은 미검증. 이 단계가 증명하는 것은 능력 게이트와 과학값 동일성이지 "
            "청구 정확성이 아니다.",
            "플랜 이름과 능력 표는 이 저장소의 구현이며, 상용 가격 정책의 확정본이 아니다.",
            "LLM 등급 상한은 정책 기본값이다. 상한이 바뀌어도 TEMPLATE 경로가 항상 열려 있어야 한다는 "
            "제약만이 지시서에서 온 것이다.",
        ],
        next_allowed="결제 공급자 자격증명 확보 후 청구 경로 검증, 또는 P14 연구/운영",
    )


if __name__ == "__main__":
    main()
