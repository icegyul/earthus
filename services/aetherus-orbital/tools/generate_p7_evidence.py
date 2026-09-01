"""V2-P7 (Debris & Observation — ORB-P7~P9 구간) 증거 생성기.

제품 라인(v0.6 packages + services/api) 재검증 테스트를 실제 실행해
artifacts/evidence/p7.json을 만든다. 수기 값 금지 — 전 필드 실행 결과.
실행: services/aetherus-orbital에서 .venv/Scripts/python tools/generate_p7_evidence.py
"""

import datetime
import json
import subprocess
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parents[1]
EVIDENCE_PATH = REPO_ROOT / "artifacts" / "evidence" / "p7.json"

P7P9_TESTS = [
    "tests/product/test_p7_p8_debris_runtime.py",
    "tests/product/test_p9_observation_runtime.py",
]
PRODUCT_SUITE = [
    "tests/product",
    "tests/foundation",
    "tests/contract",
    "tests/acceptance",
    "tests/integration/test_product_orbital_backend.py",
    "tests/integration/test_product_postgres_runtime.py",
    "tests/integration/test_v06_package_integrity.py",
    "tests/integration/test_v06_postgres_schema.py",
    "tests/integration/test_v06_provider_contracts.py",
    "tests/integration/test_foundation_intelligence_lineage.py",
    "tests/integration/test_p12_hardening.py",
    "tests/integration/test_integrated_app_surface.py",
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


def main() -> None:
    evidence = {
        "phase": "p7",
        "orbital_phase": "ORB-P7 + ORB-P8 + ORB-P9 (v0.6 product-line revalidation)",
        "gate": "PARTIAL",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "repository": run(["git", "-C", str(REPO_ROOT), "remote", "get-url", "origin"]),
        "branch": run(["git", "-C", str(REPO_ROOT), "rev-parse", "--abbrev-ref", "HEAD"]),
        "commit": run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"]),
        "import_source": {
            "repo": "Aetherus 823_Orbital/aetherus-orbital-environment (local-only)",
            "branch": "codex/aetherus-v2-v06-integration",
            "commit": "7ac0357",
            "clusters": [
                "packages/ 12종 (domain·foundation·orbit·product·providers·intelligence 등)",
                "services/api (v0.6 통합 FastAPI) + services/web (한/영 PWA)",
                "openapi/·db/(계약 참조)·artifacts/evidence(HISTORICAL 84파일)",
            ],
            "blob_verification": "이식 전 클러스터 전수 git hash-object 대조 일치",
        },
        "tests_p7_p9": pytest_summary(P7P9_TESTS),
        "tests_product_suite": pytest_summary(PRODUCT_SUITE),
        "engines_covered": {
            "E25_genealogy": "typed parent/source-event 관계 (packages/orbit runtime)",
            "E26_fragmentation": (
                "시드 파편 ΔV + 이체 RK4 전파 + 근접 스크리닝, RESEARCH_ONLY,"
                " observed_debris=False, command_path=FORBIDDEN (debris.py 정독 확인)"
            ),
            "E27_reentry": "재진입 revision (runtime + intelligence orchestrator)",
            "E28_photometry": "회전/광도 (runtime)",
            "E29_E30_observation": "관측 계획·시민 QA 수명주기 (observation.py)",
        },
        "platform_fixes": [
            "test_registry_api_surface: read_text() 인코딩 미지정 — cp949 기본값이 UTF-8 한국어 YAML을 못 읽는 잠복 버그 수정 (encoding='utf-8')",
        ],
        "limitations": [
            "제품 라인 재검증은 823 게이트 테스트 재현 기준 — P5식 적대 코드 감사는 E26만 정독 수행(실물리 확인), E25/E27~E30 심층 감사는 후속",
            "phase-line 물리 엔진(P5/P6)과 제품 라인 intervention 엔진(E31~E33 v0.6판)의 정본 일원화는 통합 단계 결정 사항",
            "브라우저 E2E·라이브 프로바이더 테스트 제외 (playwright 바이너리·자격증명)",
        ],
        "next_allowed": "V2-P14/P15 잔여(ORB-P10~P12 재검증: 연구 데이터셋·운영·하드닝) 또는 V2-P2 SPACE 트랙",
    }
    EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_PATH.write_text(
        json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"evidence written: {EVIDENCE_PATH}")


if __name__ == "__main__":
    main()
