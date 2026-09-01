"""V2-P8 (Counterfactual Patent Core — ORB-P4 구간) 증거 생성기.

P4 테스트·10k 스크리닝 코퍼스를 실제 실행해 artifacts/evidence/p8.json을 만든다.
실행: services/aetherus-orbital에서 .venv/Scripts/python tools/generate_p8_evidence.py
"""

import datetime
import json
import subprocess
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parents[1]
EVIDENCE_PATH = REPO_ROOT / "artifacts" / "evidence" / "p8.json"

P4_TESTS = [
    "tests/unit/test_ca_screen.py",
    "tests/unit/test_ca_tca_solver.py",
    "tests/unit/test_ca_pc.py",
    "tests/integration/test_p4_migration_schema.py",
    "tests/integration/test_ca_service_persistence.py",
    "tests/integration/test_conjunctions_api.py",
]
CORPUS_TEST = "tests/integration/test_ca_10k_corpus.py"


def run(cmd: list[str]) -> str:
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()


def pytest_summary(files: list[str]) -> dict:
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", *files, "-q", "--no-header"],
        capture_output=True,
        text=True,
        cwd=str(SERVICE_ROOT),
    )
    return {
        "files": files,
        "exit_code": proc.returncode,
        "summary": proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else "",
    }


def main() -> None:
    evidence = {
        "phase": "p8",
        "orbital_phase": "ORB-P4",
        "gate": "PARTIAL",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "repository": run(["git", "-C", str(REPO_ROOT), "remote", "get-url", "origin"]),
        "branch": run(["git", "-C", str(REPO_ROOT), "rev-parse", "--abbrev-ref", "HEAD"]),
        "commit": run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"]),
        "tests_p4_core": pytest_summary(P4_TESTS),
        "tests_10k_corpus": pytest_summary([CORPUS_TEST]),
        "scientific_rules_verified": [
            "공분산 결측/무효 → Pc 미계산(PC_UNAVAILABLE), 0 반환 금지 (test_ca_pc: TraCSS CDM invalid/missing covariance 픽스처)",
            "주입 근접쌍 false-negative=0 (10k 코퍼스)",
            "MaxProbability와 CDM Pc 분리 유지",
        ],
        "limitations": [
            "ORB-P5 Benefit 미착수 — 구 구현의 엣지삭제형 여부 적대 감사가 선행 조건 (v1.2.1 SIMULATION_ONLY 판정 위험)",
            "라이브 카탈로그 소수 객체 — 실 스크리닝 런은 카탈로그 확장 후",
            "Space-Track CDM 라이브 미검증 (자격증명 부재 — 픽스처 경로만)",
        ],
        "next_allowed": "ORB-P5 구 Benefit 코드 적대 감사 → 판정에 따라 재작성 또는 재현",
    }
    EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_PATH.write_text(
        json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"evidence written: {EVIDENCE_PATH}")


if __name__ == "__main__":
    main()
