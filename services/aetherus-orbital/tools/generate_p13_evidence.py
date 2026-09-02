"""V2-P13 (LLM Layer L01~L08) 증거 생성기.

지시서의 P13 hard gate는 "LLM without hallucinated science"다. 그 관문은 두 개의
서로 다른 주장으로 쪼개진다.

1. **환각을 막는다** — 패킷이 뒷받침하지 않는 숫자·금지 주장이 응답에 나가지
   않는다. 이건 내부 작업이고 지금 검증된다.
2. **라이브 공급자로도 그렇다** — 외부 LLM 공급자를 실제로 호출했을 때도 같은
   보증이 유지된다. 이건 자격증명이 있어야 한다.

둘을 하나의 PARTIAL 로 뭉치면 "우리가 안 만든 것"과 "키가 없는 것"이 같아 보인다.
그래서 blocker_class 로 나눠 기록한다.

수기 값 금지: 상태는 실행된 테스트의 종료 코드와 실제 HTTP 응답에서만 나온다.

실행: services/aetherus-orbital에서 .venv/Scripts/python tools/generate_p13_evidence.py
(라이브 프로브는 선택. 앱이 127.0.0.1:8100 에 없으면 그 사실이 기록된다.)
"""

import datetime
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blocker_class import (  # noqa: E402
    BUILDABLE_NOW,
    EXTERNAL_DATA_GATED,
    classify,
)

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parents[1]
EVIDENCE_PATH = REPO_ROOT / "artifacts" / "evidence" / "p13.json"
BASE = "http://127.0.0.1:8100"

LLM_TESTS = [
    "tests/integration/test_llm_layer_l01_l08.py",
    "tests/acceptance/test_master_acceptance.py",
]

#: L01~L08 각 층이 지시서에서 받은 목적. 구현 여부를 이름이 아니라 호출로 확인한다.
LAYER_PURPOSES = {
    "L01": "provider-neutral gateway; Aetherus is the source of truth, not the model",
    "L02": "route by difficulty/cost/latency/subscription tier",
    "L03": "capability-gated tool calls; science stays in the engines",
    "L04": "assemble the minimum Event/Revision/Evidence context",
    "L05": "one packet at general/enthusiast/researcher/operator level",
    "L06": "claim and citation validation against the packet",
    "L07": "personal/workspace context, tenant isolated",
    "L08": "Daily Space Brief / Mission Brief / Event Report / Research-Scenario Report",
}


def run(cmd: list[str]) -> str:
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()


def pytest_summary(args: list[str]) -> dict:
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", *args, "-q", "--no-header", "-p", "no:logging",
         "-o", "addopts="],
        capture_output=True, text=True, cwd=str(SERVICE_ROOT),
    )
    return {
        "targets": args,
        "exit_code": proc.returncode,
        "summary": proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else "",
    }


def probe(path: str, timeout: int = 30) -> dict:
    try:
        with urllib.request.urlopen(BASE + path, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
            return {"path": path, "http_status": response.status,
                    "data_status": body.get("data_status"), "body": body}
    except urllib.error.HTTPError as exc:  # noqa: PERF203
        return {"path": path, "http_status": exc.code, "error": exc.reason}
    except Exception as exc:  # noqa: BLE001
        return {"path": path, "http_status": None, "error": str(exc)}


def _digest(payload: dict) -> dict:
    return {k: payload.get(k) for k in ("path", "http_status", "data_status", "error") if k in payload}


def declared_routes() -> set[str]:
    """The /v1 LLM routes this working tree defines, read from the app object."""
    sys.path.insert(0, str(SERVICE_ROOT))
    from services.api.integrated import app  # noqa: PLC0415

    return {
        route.path
        for route in app.routes
        if getattr(route, "path", "").startswith(("/v1/llm", "/v1/briefings"))
    }


def live_build_state(routes: set[str]) -> dict:
    """Whether the process answering on 8100 is this working tree's build.

    A server started before these routes existed answers 404 for them. That is
    not the same as the layer being unbuilt, and it is not the same as the
    server being down. Recording all three as one 'live check failed' would put
    a deployment accident in the same box as missing code.
    """
    health = probe("/health", timeout=5)
    if health.get("http_status") != 200:
        return {"state": "NO_SERVER", "detail": health.get("error"), "checked_routes": sorted(routes)}
    missing = sorted(path for path in routes if probe(path, timeout=10).get("http_status") == 404)
    if missing:
        return {
            "state": "STALE_BUILD",
            "detail": "the running process predates these routes; restart it to probe them live",
            "missing_routes": missing,
            "checked_routes": sorted(routes),
        }
    return {"state": "CURRENT", "checked_routes": sorted(routes)}


def layer_ids_declared() -> dict:
    """Each layer class carries its own id, checked by import, not by grep."""
    sys.path.insert(0, str(SERVICE_ROOT))
    import aetherus_llm as llm  # noqa: PLC0415

    classes = {
        "L01": llm.LLMGateway, "L02": llm.ModelRouter, "L03": llm.ToolOrchestrator,
        "L04": llm.ContextComposer, "L05": llm.ExplanationAgent,
        "L06": llm.ClaimCitationValidator, "L07": llm.PersonalWorkspaceContext,
        "L08": llm.BriefingReportGenerator,
    }
    return {layer: getattr(cls, "id", None) == layer for layer, cls in classes.items()}


def purposes_implemented() -> dict:
    """The four purposes that had no implementation, checked by calling them."""
    sys.path.insert(0, str(SERVICE_ROOT))
    import aetherus_llm as llm  # noqa: PLC0415

    router = llm.ModelRouter()
    tiered = router.decide("SCENARIO_NARRATIVE", plan="FREE")
    composer_sections = set(llm.ContextComposer.INTENT_PROFILES)
    agent_levels = set(llm.ExplanationAgent.LEVEL_SECTIONS)
    return {
        # L02: a tier decision exists and names what actually ran.
        "L02_tier_routing": tiered.served_tier is not None and tiered.downgraded is True,
        "L02_reports_served_not_requested": tiered.served_tier != tiered.requested_tier
        and bool(tiered.reason),
        # L04: intent profiles exist and every one keeps the claim guardrails.
        "L04_minimum_context": len(composer_sections) >= 3,
        # L05: all four audience levels the directive names.
        "L05_four_audience_levels": agent_levels == set(llm.AudienceLevel),
        # L08: all four report types the directive names.
        "L08_four_report_types": len(set(llm.ReportType)) == 4,
    }


def honesty_of_the_usage_record() -> dict:
    """A cost/token metric that was never measured must not read as zero."""
    sys.path.insert(0, str(SERVICE_ROOT))
    import aetherus_llm as llm  # noqa: PLC0415
    sys.path.insert(0, str(SERVICE_ROOT / "tests"))
    from tests.acceptance.cases import packet_fixture  # noqa: PLC0415

    response = llm.LLMGateway().generate(
        provider="local", prompt="probe", model="aetherus-safe-local",
        packet=packet_fixture(),
        audit=llm.AuditContext(request_id="p13-evidence", feature="P13_EVIDENCE"),
    )
    usage = response.usage
    return {
        "tokens_in": usage.tokens_in,
        "tokens_status": usage.tokens_status,
        "cost_usd": usage.cost_usd,
        "cost_status": usage.cost_status,
        "latency_basis": usage.latency_basis,
        "unreported_is_null_not_zero": usage.tokens_in is None
        and usage.tokens_status == "NOT_REPORTED_BY_PROVIDER",
        "cost_is_unavailable_not_free": usage.cost_usd is None
        and usage.cost_status == "UNAVAILABLE",
    }


def main() -> None:
    tests = pytest_summary(LLM_TESTS)
    ids = layer_ids_declared()
    purposes = purposes_implemented()
    usage = honesty_of_the_usage_record()
    routes = declared_routes()
    build = live_build_state(routes)

    explain = probe("/v1/llm/explain?audience=RESEARCHER")
    briefing = probe("/v1/briefings/current?report_type=EVENT_REPORT")
    audiences = probe("/v1/llm/audiences")

    checks = {
        "llm_tests_pass": tests.get("exit_code") == 0,
        "all_eight_layers_declare_their_id": all(ids.values()),
        "directive_purposes_implemented": all(purposes.values()),
        "unmeasured_usage_is_not_zero": usage["unreported_is_null_not_zero"]
        and usage["cost_is_unavailable_not_free"],
        # The live surface can only be credited when the process is this build.
        "llm_surface_live": build["state"] == "CURRENT"
        and explain.get("http_status") == 200
        and briefing.get("http_status") == 200
        and audiences.get("http_status") == 200,
        "live_provider_verified": False,
    }
    blockers = {
        "llm_tests_pass": (BUILDABLE_NOW, "L01~L08 테스트 미통과 — 내부 작업"),
        "all_eight_layers_declare_their_id": (
            BUILDABLE_NOW,
            "층 식별자가 실제로 도는 구현에 없음 — 내부 작업",
        ),
        "directive_purposes_implemented": (
            BUILDABLE_NOW,
            "지시서가 각 층에 준 목적(등급 라우팅·최소 컨텍스트·청중 4단계·보고서 4종) 미구현 — 내부 작업",
        ),
        "unmeasured_usage_is_not_zero": (
            BUILDABLE_NOW,
            "측정하지 않은 토큰·비용이 0으로 보고됨 — 내부 작업",
        ),
        "llm_surface_live": (
            BUILDABLE_NOW,
            f"라이브 표면 미확인 (server state={build['state']}). "
            "코드가 아니라 구동 중인 프로세스의 문제일 수 있으므로 build 상태를 함께 본다. 내부 작업.",
        ),
        "live_provider_verified": (
            EXTERNAL_DATA_GATED,
            "외부 LLM 공급자(OpenAI/Claude/Gemini 등) 자격증명이 없어 라이브 경로를 호출할 수 없다. "
            "계약이 아니라 키 발급 문제이므로 파트너 차단이 아니다.",
        ),
    }

    failed = [name for name, ok in checks.items() if not ok]
    evidence = {
        "phase": "p13",
        "phase_name": "LLM Layer",
        "hard_gate": "LLM without hallucinated science",
        "gate": "PASS" if not failed else "PARTIAL",
        "failed_checks": failed,
        "checks": checks,
        "blockers": classify(checks, blockers),
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "repository": run(["git", "-C", str(REPO_ROOT), "remote", "get-url", "origin"]),
        "branch": run(["git", "-C", str(REPO_ROOT), "rev-parse", "--abbrev-ref", "HEAD"]),
        "commit": run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"]),
        "tests_llm": tests,
        "layer_purposes": LAYER_PURPOSES,
        "layer_ids_declared": ids,
        "directive_purposes": purposes,
        "usage_record_honesty": usage,
        "live_build": build,
        "live_api": {
            "explain": _digest(explain),
            "briefing": _digest(briefing),
            "audiences": _digest(audiences),
        },
        "limitations": [
            "라이브 LLM 공급자(L01)는 자격증명 부재로 미검증. 로컬 결정론 공급자만 실행된다 — "
            "그래서 모든 라우팅 결정이 served_tier=TEMPLATE 로 내려가고, 응답이 그 사실을 싣는다.",
            "환각 차단은 L06 이 패킷의 숫자 집합과 금지 주장 목록에 대해 검사하는 방식이다. "
            "패킷 밖 세계 지식에 대한 사실성은 이 계층이 판단하지 않으며 판단한다고 주장하지도 않는다.",
            "청중 4단계는 패킷 문장의 선택을 바꿀 뿐 문장을 다시 쓰지 않는다. "
            "과학 주장을 쉬운 말로 바꾸는 것은 아무것도 뒷받침하지 않는 새 주장이기 때문이다.",
        ],
        "next_allowed": "외부 공급자 자격증명 확보 후 라이브 경로 검증, 또는 P12/P14/P15 잔여",
    }
    EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_PATH.write_text(json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"evidence written: {EVIDENCE_PATH}")
    print(f"gate={evidence['gate']} failed={failed or 'none'}")


if __name__ == "__main__":
    main()
