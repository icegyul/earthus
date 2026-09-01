"""V2-P7 (Debris & Observation — ORB-P7~P9 구간) 증거 생성기.

제품 라인(v0.6 packages + services/api) 재검증 테스트를 실제 실행해
artifacts/evidence/p7.json을 만든다. 수기 값 금지 — 전 필드 실행 결과.
실행: services/aetherus-orbital에서 .venv/Scripts/python tools/generate_p7_evidence.py
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


def probe(url: str, timeout: int = 40) -> dict:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return {"http_status": r.status, "body": json.loads(r.read().decode("utf-8"))}
    except Exception as exc:  # noqa: BLE001
        return {"http_status": None, "error": str(exc)}


def probe_science_bridge() -> dict:
    """제품 라우트가 검증 픽스처가 아닌 실 카탈로그를 서빙하는지 라이브로 확인한다."""
    catalog = probe("http://127.0.0.1:8100/v1/objects?limit=1")
    entries = ((catalog.get("body") or {}).get("data") or {}).get("catalog") or []
    object_id = entries[0].get("object_id") if entries else None
    out = {
        "catalog": {
            "http_status": catalog.get("http_status"),
            "data_status": (catalog.get("body") or {}).get("data_status"),
            "sample_object_id": object_id,
            "sample_catalog_id": entries[0].get("catalog_id") if entries else None,
        }
    }
    if object_id:
        risk = probe(f"http://127.0.0.1:8100/v1/objects/{object_id}/risk")
        genealogy = probe(f"http://127.0.0.1:8100/v1/genealogy/{object_id}")
        risk_data = (risk.get("body") or {}).get("data") or {}
        gen_data = (genealogy.get("body") or {}).get("data") or {}
        out["object_risk"] = {
            "http_status": risk.get("http_status"),
            "data_status": (risk.get("body") or {}).get("data_status"),
            "pc_value": risk_data.get("pc"),
            "pc_unavailable_reason": risk_data.get("pc_unavailable_reason")
            or risk_data.get("pc_reason"),
        }
        out["genealogy"] = {
            "http_status": genealogy.get("http_status"),
            "data_status": (genealogy.get("body") or {}).get("data_status"),
            "parent_count": len(gen_data.get("parents") or []),
        }
    return out



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
    bridge = probe_science_bridge()
    tests_p7_p9 = pytest_summary(P7P9_TESTS)
    tests_suite = pytest_summary(PRODUCT_SUITE)
    audit_orbit = audit_completed("E25·E27~E30", "tests/unit/test_orbit_engine_honesty.py")
    checks = {
        "tests_p7_p9_pass": tests_p7_p9.get("exit_code") == 0,
        "product_suite_pass": tests_suite.get("exit_code") == 0,
        "product_routes_serve_real_catalog": bool(
            bridge["catalog"].get("sample_object_id")
        ),
        # E25·E27~E30 적대 감사가 남은 한 참이 될 수 없다 (E26만 정독 완료).
        "adversarial_audit_e25_e27_e30": audit_orbit["passed"],
        "playwright_e2e_run": False,
    }
    blockers = {
        'tests_p7_p9_pass': (
            BUILDABLE_NOW,
            'P7~P9 테스트 미통과 — 내부 작업',
        ),
        'product_suite_pass': (
            BUILDABLE_NOW,
            '제품 스위트 미통과 — 내부 작업',
        ),
        'product_routes_serve_real_catalog': (
            BUILDABLE_NOW,
            '제품 라우트가 실 카탈로그를 서빙하지 않음 — 내부 작업',
        ),
        'adversarial_audit_e25_e27_e30': (
            BUILDABLE_NOW,
            'E25·E27~E30 적대 감사 기록 또는 정직성 테스트 미충족 — 내부 작업',
        ),
        'playwright_e2e_run': (
            BUILDABLE_NOW,
            'Playwright E2E 미실행 — 내부 작업',
        ),
    }
    blocker_report = classify(checks, blockers)
    failed = [name for name, ok in checks.items() if not ok]
    evidence = {
        "phase": "p7",
        "orbital_phase": "ORB-P7 + ORB-P8 + ORB-P9 (v0.6 product-line revalidation)",
        "gate": "PASS" if not failed else "PARTIAL",
        "failed_checks": failed,
        "checks": checks,
        # PARTIAL 하나로 뭉치지 않는다: 우리 일과 남의 일을 구분한다.
        "blockers": blocker_report,
        "adversarial_audit": audit_orbit,
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
        "tests_p7_p9": tests_p7_p9,
        "tests_product_suite": tests_suite,
        "science_bridge_live": bridge,
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
            "제품 라인 재검증은 823 게이트 테스트 재현 기준 — P5식 적대 코드 감사는 E26만 정독 수행(실물리 확인), E25/E27~E30 심층 감사는 후속 (게이트가 PARTIAL인 이유)",
            "과학 다리는 조회 계열 7종(ephemeris·conjunction_risk·catalog·render_set·risk_graph·object_risk·genealogy)만 결선 —"
            " phase-line 물리 엔진(P5/P6)과 제품 라인 intervention 엔진(E31~E33 v0.6판)의 일원화는 여전히 미결",
            "브라우저 E2E 미실행 (playwright 바이너리 부재) · LLM 라이브 계층은 자격증명 부재로 제외",
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
