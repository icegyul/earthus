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
P5_TESTS = [
    "tests/integration/test_p5_physical_counterfactual.py",
    "tests/unit/test_benefit_engine.py",
    "tests/integration/test_p5_baseline_build.py",
    "tests/integration/test_p5_full_vs_selective.py",
    "tests/integration/test_p5_immutability.py",
    "tests/integration/test_benefit_service.py",
    "tests/integration/test_benefit_api.py",
]


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
        "orbital_phase": "ORB-P4 + ORB-P5(physical engine)",
        "gate": "PARTIAL",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "repository": run(["git", "-C", str(REPO_ROOT), "remote", "get-url", "origin"]),
        "branch": run(["git", "-C", str(REPO_ROOT), "rev-parse", "--abbrev-ref", "HEAD"]),
        "commit": run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"]),
        "tests_p4_core": pytest_summary(P4_TESTS),
        "tests_10k_corpus": pytest_summary([CORPUS_TEST]),
        "tests_p5": pytest_summary(P5_TESTS),
        "p5_physical_engine": {
            "method": "SCREENING_RECOMPUTE_V1 (backend/benefit/physical.py)",
            "mechanism": (
                "G0'와 Gs를 모두 P4 파이프라인(SGP4→coarse→TCA) 실재실행으로 도출."
                " FULL=전체 재스크리닝, AFFECTED_SUBGRAPH=영향 접촉 쌍만 TCA 재정밀화"
                " + 비접촉 엣지 재사용 — 두 독립 경로의 result_hash 수치 동등성을"
                " 합성 궤도 6객체 실파이프라인 corpus로 검증. 신규 엣지 검출 내장."
            ),
            "validation_state": "물리 경로 산출물은 PUBLIC_SCREENING, 레거시 엣지삭제형은 명시 옵트인 + SIMULATION_ONLY",
            "bugs_found_by_corpus": [
                "P4 conjunction/service.py: prepare_catalog 탈락 객체 존재 시 zip 위치 매핑이 후속 쌍 전부를 엉뚱한 궤도요소에 연결 (identity 매핑으로 수정)",
                "benefit/repository.py load_operational_event_rows: snapshot_id 미SELECT (실 이벤트 최초 통과 시 KeyError)",
            ],
        },
        "scientific_rules_verified": [
            "공분산 결측/무효 → Pc 미계산(PC_UNAVAILABLE), 0 반환 금지 (test_ca_pc: TraCSS CDM invalid/missing covariance 픽스처)",
            "주입 근접쌍 false-negative=0 (10k 코퍼스)",
            "MaxProbability와 CDM Pc 분리 유지",
        ],
        "p5_audit": {
            "verdict": "EDGE_DELETION_SIMULATION_ONLY",
            "date": "2026-09-01",
            "record": "docs/audit/P5_BENEFIT_AUDIT_VERDICT.md",
            "method": "독립 감사 2명(회의적/데이터흐름) + 교차검증자, 전 주장 file:line 재확인",
            "immediate_actions": [
                "recomputed_edge_count → affected_incident_edge_count 개명 + docstring SIMULATION_ONLY 명시",
                "migration 009: scenario_run·benefit_result validation_state DEFAULT 'SIMULATION_ONLY'",
            ],
        },
        "limitations": [
            "ORB-P6 PROTECT/OCM 미착수 — V2-P8의 나머지 구간이므로 gate PARTIAL 유지",
            "물리 엔진 대규모(10k) full-vs-selective 성능 벤치마크는 후속 (기능 동등성은 검증 완료)",
            "BEN-001/BEN-003 정량 검증 corpus의 물리 엔진 재생성은 후속 (823 산출물은 HISTORICAL 보존)",
            "Space-Track CDM 라이브 미검증 (자격증명 부재 — 픽스처 경로만)",
        ],
        "next_allowed": "ORB-P6 PROTECT 역질의·후보 OCM (물리 엔진의 신규 엣지 검출이 OCM 요건을 선반영)",
    }
    EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_PATH.write_text(
        json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"evidence written: {EVIDENCE_PATH}")


if __name__ == "__main__":
    main()
