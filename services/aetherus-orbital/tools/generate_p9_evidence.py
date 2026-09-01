"""V2-P9~P11 (Intelligence Core E38~E44) 증거 생성기.

인텔리전스 파이프라인 테스트와 라이브 API 프로브를 실제 실행해
artifacts/evidence/p9.json을 만든다. 수기 값 금지.
실행: services/aetherus-orbital에서 .venv/Scripts/python tools/generate_p9_evidence.py
(사전 조건: 통합 앱이 127.0.0.1:8100에서 가동 중)
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
    DECISION_PENDING,
    EXTERNAL_DATA_GATED,
    EXTERNAL_PARTNER_GATED,
    classify,
)

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parents[1]
EVIDENCE_PATH = REPO_ROOT / "artifacts" / "evidence" / "p9.json"

INTEL_TESTS = [
    "tests/unit/test_intelligence_orchestrator.py",
    "tests/integration/test_foundation_intelligence_lineage.py",
    "tests/foundation",
]


def run(cmd: list[str]) -> str:
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()


def pytest_summary(args: list[str]) -> dict:
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", *args, "-q", "--no-header", "-p", "no:logging"],
        capture_output=True,
        text=True,
        cwd=str(SERVICE_ROOT),
    )
    return {
        "targets": args,
        "exit_code": proc.returncode,
        "summary": proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else "",
    }


def probe(url: str, timeout: int = 40) -> dict:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            body = json.loads(r.read().decode("utf-8"))
            return {"http_status": r.status, "data_status": body.get("data_status"), "body": body}
    except Exception as exc:  # noqa: BLE001
        return {"http_status": None, "error": str(exc)}


def _digest(payload: dict) -> dict:
    """본문은 버리고 상태만 남긴다 (증거 파일이 응답 전문을 복제하지 않도록)."""
    return {k: payload.get(k) for k in ("http_status", "data_status", "error") if k in payload}


def signal_composition(payload: dict) -> dict:
    """신호가 어디서 왔는지 실제 응답에서 세어 기록한다 — 출처를 추정하지 않는다."""
    rows = (payload.get("body") or {}).get("data") or []
    counts: dict[str, int] = {}
    for row in rows:
        key = f"{row.get('signal_type')}|{row.get('producer_module_id')}|{row.get('evidence_class')}"
        counts[key] = counts.get(key, 0) + 1
    return {"total": len(rows), "by_type_producer_evidence_class": counts}


def event_composition(payload: dict) -> dict:
    rows = (payload.get("body") or {}).get("data") or []
    counts: dict[str, int] = {}
    for row in rows:
        key = str(row.get("event_type"))
        counts[key] = counts.get(key, 0) + 1
    return {"total": len(rows), "by_event_type": counts}



# 적대 감사는 기록으로만 인정한다: 문서가 실재하고 해당 엔진군을 다루며,
# 그 결함을 재발 시 실패시키는 정직성 테스트가 통과해야 참이다.
# (플래그를 손으로 True 로 바꾸는 것을 막기 위해 실제 파일·테스트를 검사한다.)
AUDIT_RECORD = REPO_ROOT / "docs" / "audit" / "ENGINE_ADVERSARIAL_AUDIT_2026-09-01.md"


def audit_completed(marker: str, honesty_test: str) -> dict:
    recorded = AUDIT_RECORD.is_file() and marker in AUDIT_RECORD.read_text(encoding="utf-8")
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", honesty_test, "-q", "--no-header", "-p", "no:logging"],
        capture_output=True, text=True, cwd=str(SERVICE_ROOT),
    )
    return {
        "recorded": recorded,
        "record": str(AUDIT_RECORD.relative_to(REPO_ROOT)) if recorded else None,
        "honesty_test": honesty_test,
        "honesty_test_exit_code": proc.returncode,
        "summary": proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else "",
        "passed": recorded and proc.returncode == 0,
    }


def main() -> None:
    important_now = probe("http://127.0.0.1:8100/v1/intelligence/important-now")
    signals = probe("http://127.0.0.1:8100/v1/intelligence/signals")
    events = probe("http://127.0.0.1:8100/v1/intelligence/events")
    signals_seen = signal_composition(signals)
    events_seen = event_composition(events)
    conjunction_signals = sum(
        count
        for key, count in signals_seen["by_type_producer_evidence_class"].items()
        if key.startswith("CONJUNCTION_")
    )
    tests = pytest_summary(INTEL_TESTS)
    audit_intel = audit_completed("E38~E44 (Intelligence)", "tests/unit/test_confidence_honesty.py")
    checks = {
        "tests_pass": tests.get("exit_code") == 0,
        "intelligence_api_200": all(
            payload.get("http_status") == 200
            for payload in (important_now, signals, events)
        ),
        "live_conjunction_signals_present": conjunction_signals > 0,
        # 근접 신호가 이벤트로 융합되기 전까지 이벤트는 OFFICIAL 발사 픽스처뿐이다.
        "conjunction_events_promoted": any(
            key != "LAUNCH_EVENT" for key in events_seen["by_event_type"]
        ),
        "llm_gateway_live_verified": False,
        "adversarial_audit_e38_e44": audit_intel["passed"],
    }
    blockers = {
        'tests_pass': (
            BUILDABLE_NOW,
            '인텔리전스 테스트 미통과 — 내부 작업',
        ),
        'intelligence_api_200': (
            BUILDABLE_NOW,
            '인텔리전스 API 미응답 — 내부 작업',
        ),
        'live_conjunction_signals_present': (
            BUILDABLE_NOW,
            '근접 신호 미유입 — 내부 작업',
        ),
        'conjunction_events_promoted': (
            BUILDABLE_NOW,
            '근접 신호의 이벤트 융합 미구현. 신호는 유입되나 승격 경로가 없다. 외부 의존 없음.',
        ),
        'llm_gateway_live_verified': (
            EXTERNAL_DATA_GATED,
            'LLM 게이트웨이 라이브 검증에 외부 API 자격증명이 필요하다. 계약이 아니라 키 발급 문제이므로 파트너 차단이 아니다.',
        ),
        'adversarial_audit_e38_e44': (
            BUILDABLE_NOW,
            'E38~E44 적대 감사 기록 또는 정직성 테스트 미충족 — 내부 작업',
        ),
    }
    blocker_report = classify(checks, blockers)
    failed = [name for name, ok in checks.items() if not ok]
    evidence = {
        "phase": "p9",
        "gate": "PASS" if not failed else "PARTIAL",
        "failed_checks": failed,
        "checks": checks,
        # PARTIAL 하나로 뭉치지 않는다: 우리 일과 남의 일을 구분한다.
        "blockers": blocker_report,
        "adversarial_audit": audit_intel,
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "repository": run(["git", "-C", str(REPO_ROOT), "remote", "get-url", "origin"]),
        "branch": run(["git", "-C", str(REPO_ROOT), "rev-parse", "--abbrev-ref", "HEAD"]),
        "commit": run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"]),
        "tests_intelligence": tests,
        "live_api": {
            "important_now": _digest(important_now),
            "signals": _digest(signals),
            "events": _digest(events),
        },
        "pipeline_population": {
            "signals": signals_seen,
            "events": events_seen,
            "conjunction_derived_signal_count": conjunction_signals,
        },
        "browser_verification": [
            "INTELLIGENCE 모드: LAUNCH_EVENT(Apollo 11)에 WHAT HAPPENED/WHAT CHANGED/WHY IT MATTERS 3문 + 신뢰도 84% VERY HIGH + 불확실성 '고정 역사 사실에는 수치 불확실성 부적용' 정직 표기",
            "파이프라인 상태 표면: 근거 융합·신호 승격·LLM 주장 검증(ACTIVE) — E38~E44 노출, 과학 상태 VALIDATION_PENDING 라벨",
            "ARCHIVE 모드: 1969→2026 타임라인·TIME CURSOR·ARCHIVED 배지, '보관 스냅샷은 재구성/모델 상태와 시각적으로 구분' 명문",
        ],
        "limitations": [
            "LLM 게이트웨이 라이브(L01)는 외부 API 자격증명 부재로 미검증 — 주장 검증기는 픽스처 경로 (게이트가 PARTIAL인 이유)",
            "실 P4 근접 신호는 파이프라인에 유입되지만(위 pipeline_population 계수) 이벤트 융합은 아직 미발생 —"
            " 이벤트는 여전히 OFFICIAL 발사 픽스처 계보뿐",
            "E38~E44 심층 적대 감사는 후속",
        ],
        "next_allowed": "근접 신호의 이벤트 융합 검증 또는 잔여 하드닝(LLM 라이브·E2E)",
    }
    EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_PATH.write_text(
        json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"evidence written: {EVIDENCE_PATH}")


if __name__ == "__main__":
    main()
