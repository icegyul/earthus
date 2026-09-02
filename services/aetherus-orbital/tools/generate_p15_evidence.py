"""V2-P15 (Hardening / Staging / Production) 증거 생성기.

지시서의 P15 hard gate는 "staging evidence then production decision"이다. 순서가
관문의 내용이다 — 스테이징 증거가 **먼저** 있고, 운영 결정은 **그 다음**이다.

그래서 이 단계에서 PASS 를 목표로 삼으면 안 된다. 운영 자격증명과 라이브 공급자
검증이 없는 상태에서 `staging_ready=True` 가 나오면 그건 준비된 것이 아니라 검사가
고장 난 것이다. 이 생성기는 두 가지를 함께 요구한다.

* 로컬 제품이 닫혀 있다 (`local_product_complete`)
* 스테이징은 **아직 아니다**, 그리고 **왜 아닌지 이름이 붙어 있다**

`staging_ready=False` 는 실패 항목이 아니라 이 단계의 정확한 현재 상태다. 실패
항목으로 셋는 것은 남이 줘야 하는 것을 우리가 안 만든 것처럼 보고하는 일이다.

실행: services/aetherus-orbital에서 .venv/Scripts/python tools/generate_p15_evidence.py
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blocker_class import BUILDABLE_NOW, DECISION_PENDING, EXTERNAL_DATA_GATED  # noqa: E402
from phase_evidence import (  # noqa: E402
    EVIDENCE_DIR, attempt, on_path, probe, pytest_summary, server_state, write_evidence,
)

TESTS = ["tests/integration/test_p12_hardening.py", "tests/acceptance/test_master_acceptance.py"]

#: Phases whose evidence file must exist before a production decision is even
#: discussable. A phase with no scorecard has nothing to decide on.
REQUIRED_PHASE_EVIDENCE = [
    "p0", "p1", "p2", "p3", "p4", "p5-mission", "p6", "p7", "p8", "p9",
    "p10", "p11", "p12", "p13", "p14",
]

#: Secrets a production deployment needs. Presence is read from the environment;
#: their values are never read, logged or written to the evidence file.
PRODUCTION_SECRETS = ["AETHERUS_DB_URL", "AETHERUS_API_KEY", "AETHERUS_LLM_API_KEY"]


def backup_integrity() -> dict:
    """A backup restores, and a tampered backup is refused."""
    on_path()
    from aetherus_platform import DeploymentBackupDRService

    service = DeploymentBackupDRService()
    state = {"universe": "snapshot", "objects": [1, 2, 3]}
    backup = service.backup(state)
    restored = service.restore(backup)

    tampered = {**backup, "payload": {**state, "objects": [1, 2, 4]}}
    try:
        service.restore(tampered)
        refuses_tampering = False
    except ValueError:
        refuses_tampering = True

    return {
        "round_trip_matches": restored == state,
        "checksum_recorded": bool(backup.get("sha256")),
        # Without this the round trip proves only that a dict survives a copy.
        "refuses_a_tampered_backup": refuses_tampering,
    }


def phase_evidence_present() -> dict:
    """Which phases have a scorecard, and what each one's gate currently says."""
    found, missing, gates = {}, [], {}
    for phase in REQUIRED_PHASE_EVIDENCE:
        path = EVIDENCE_DIR / f"{phase}.json"
        if not path.is_file():
            missing.append(phase)
            continue
        try:
            body = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            found[phase] = f"UNREADABLE: {exc}"
            continue
        found[phase] = str(path.relative_to(EVIDENCE_DIR.parents[1]))
        gates[phase] = body.get("gate")
    return {
        "present": found,
        "missing": missing,
        "gates": gates,
        "all_present": not missing,
        "all_pass": bool(gates) and all(value == "PASS" for value in gates.values()),
    }


def secrets_configured() -> dict:
    """Whether production secrets are present. Values are never read."""
    present = {name: bool(os.environ.get(name)) for name in PRODUCTION_SECRETS}
    return {"expected": PRODUCTION_SECRETS, "present": present, "all_present": all(present.values())}


def readiness(*, tests_pass: bool, backup_verified: bool, secrets: bool, live_provider: bool) -> dict:
    on_path()
    from aetherus_platform import DeploymentBackupDRService

    return DeploymentBackupDRService().readiness(
        tests_pass=tests_pass, backup_verified=backup_verified,
        secrets_configured=secrets, live_provider_verified=live_provider,
    )


def main() -> None:
    tests = pytest_summary(TESTS)
    backup = attempt(backup_integrity)
    phases = attempt(phase_evidence_present)
    secrets = attempt(secrets_configured)
    build = server_state(["/health"])

    b = backup.get("value") or {}
    p = phases.get("value") or {}
    s = secrets.get("value") or {}

    tests_pass = tests.get("exit_code") == 0
    backup_verified = bool(b.get("round_trip_matches")) and bool(b.get("refuses_a_tampered_backup"))
    secrets_present = bool(s.get("all_present"))
    live_provider_verified = False  # no external provider is callable from here

    state = readiness(
        tests_pass=tests_pass, backup_verified=backup_verified,
        secrets=secrets_present, live_provider=live_provider_verified,
    )

    checks = {
        "tests_pass": tests_pass,
        "backup_restores_and_refuses_tampering": backup_verified,
        "every_prior_phase_has_a_scorecard": bool(p.get("all_present")),
        "local_product_complete": bool(state.get("local_product_complete")),
        # The point of the gate: staging is not claimed, and the reason is named.
        "staging_not_claimed_without_evidence": state.get("staging_ready") is False
        and bool(state.get("blockers")),
        "production_secrets_configured": secrets_present,
        "live_provider_verified": live_provider_verified,
        "production_decision_taken": False,
    }
    blockers = {
        "tests_pass": (BUILDABLE_NOW, "하드닝 테스트 미통과 — 내부 작업"),
        "backup_restores_and_refuses_tampering": (
            BUILDABLE_NOW,
            "백업이 복원되지 않거나 변조된 백업을 받아들인다 — 내부 작업",
        ),
        "every_prior_phase_has_a_scorecard": (
            BUILDABLE_NOW,
            f"증거 파일이 없는 단계: {p.get('missing')}. 점수표가 없는 단계는 운영 결정의 대상이 될 수 없다 — 내부 작업",
        ),
        "local_product_complete": (BUILDABLE_NOW, "로컬 제품이 닫히지 않음 — 내부 작업"),
        "staging_not_claimed_without_evidence": (
            BUILDABLE_NOW,
            "스테이징 준비 완료가 근거 없이 주장되고 있다. 이 검사가 거짓이면 준비된 것이 아니라 검사가 고장 난 것이다 — 내부 작업",
        ),
        "production_secrets_configured": (
            EXTERNAL_DATA_GATED,
            f"운영 비밀값({', '.join(PRODUCTION_SECRETS)})이 이 환경에 없다. 존재 여부만 읽고 값은 읽지 않는다.",
        ),
        "live_provider_verified": (
            EXTERNAL_DATA_GATED,
            "라이브 공급자(LLM·상용 데이터) 검증에 자격증명이 필요하다.",
        ),
        "production_decision_taken": (
            DECISION_PENDING,
            "운영 전환은 사람이 내리는 결정이다. 스테이징 증거가 갖춰진 뒤에 판단하며, "
            "이 생성기가 대신 내릴 수 있는 결정이 아니다.",
        ),
    }

    write_evidence(
        phase="p15",
        phase_name="Hardening / Staging / Production",
        hard_gate="staging evidence then production decision",
        checks=checks,
        blockers=blockers,
        tests_hardening=tests,
        backup_integrity=backup,
        phase_evidence=phases,
        secrets=secrets,
        readiness=state,
        live_build=build,
        limitations=[
            "이 단계의 PARTIAL 은 결함이 아니라 순서다. 지시서가 스테이징 증거를 먼저 요구하고 "
            "운영 결정을 그 다음에 두었으므로, 자격증명 없이 PASS 가 나오면 검사가 고장 난 것이다.",
            "비밀값은 존재 여부만 확인한다. 값은 읽지 않고 증거 파일에도 남기지 않는다.",
            "백업 검증은 프로세스 내 직렬화 왕복이다. 실제 저장소·복구 절차의 검증은 별도다.",
        ],
        next_allowed="운영 비밀값과 라이브 공급자 자격증명 확보 → 스테이징 증거 수집 → 사람의 운영 전환 결정",
    )


if __name__ == "__main__":
    main()
