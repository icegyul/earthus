"""V2-P14 (Research / Operations) 증거 생성기.

지시서의 P14 hard gate는 "tenant isolation + reproducibility"다. 두 주장은 서로
독립이고, 하나가 참이면서 다른 하나가 거짓인 상태가 이 단계의 전형적인 실패다.

* **격리** — 한 테넌트의 비공개 컨텍스트가 다른 테넌트의 요청으로 새지 않는다.
* **재현** — 연구 데이터셋 매니페스트가 같은 레코드로는 재현되고, **다른 레코드로는
  재현되지 않는다.**

두 번째 절반이 중요하다. 항상 참을 돌려주는 재현 검사는 재현을 증명하지 않는다.
그래서 여기서는 양성만이 아니라 음성도 함께 요구한다.

실행: services/aetherus-orbital에서 .venv/Scripts/python tools/generate_p14_evidence.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blocker_class import BUILDABLE_NOW, EXTERNAL_PARTNER_GATED  # noqa: E402
from phase_evidence import (  # noqa: E402
    attempt, digest, on_path, probe, pytest_summary, server_state, write_evidence,
)

TESTS = [
    "tests/acceptance/test_master_acceptance.py",
    "tests/integration/test_p12_hardening.py",
]

PROBES = ["/v1/subscription/capabilities"]


def tenant_isolation() -> dict:
    """A tenant's private context must be invisible to another tenant."""
    on_path()
    from aetherus_platform import APIGatewayAuthRequestEnvelopeService, OperationsTenantAuditService

    gateway = APIGatewayAuthRequestEnvelopeService()
    owner = gateway.context(tenant_id="TENANT_A", user_id="U1")
    stranger = gateway.context(tenant_id="TENANT_B", user_id="U2")
    service = OperationsTenantAuditService()
    service.put_private(owner, "fleet", {"designation": "PRIVATE-1"})

    audit_id = service.write(owner, "P14_EVIDENCE", "R", {}, {})
    owner_audit = service.audit_for(owner)
    stranger_audit = service.audit_for(stranger)
    return {
        "owner_reads_own": service.get_private(owner, "fleet") is not None,
        "stranger_reads_nothing": service.get_private(stranger, "fleet") is None,
        "audit_is_per_tenant": bool(owner_audit) and not stranger_audit,
        "audit_carries_request_id": bool(owner_audit)
        and owner_audit[0].get("request_id") == owner.request_id,
        "audit_id_returned": bool(audit_id),
    }


def dataset_reproducibility() -> dict:
    """A manifest reproduces from the same records and refuses different ones."""
    on_path()
    from aetherus_platform import ResearchDatasetBenchmarkService

    service = ResearchDatasetBenchmarkService()
    records = [{"object": "A", "miss_distance_km": 12.5}, {"object": "B", "miss_distance_km": 3.25}]
    manifest = service.manifest(
        "P14_EVIDENCE", records, license_policy="CC-BY", source_ids=["CELESTRAK"], version="v1"
    )
    altered = [dict(records[0]), {**records[1], "miss_distance_km": 3.26}]
    return {
        "manifest_records_license": manifest.get("license_policy") == "CC-BY",
        "manifest_records_sources": manifest.get("source_ids") == ["CELESTRAK"],
        "same_records_reproduce": service.reproduce(manifest, records) is True,
        # Without this the positive result proves nothing.
        "changed_records_do_not_reproduce": service.reproduce(manifest, altered) is False,
    }


def evidence_manifest_gate() -> dict:
    """S10 refuses to call a phase done while a required test is unaccounted for."""
    on_path()
    from aetherus_platform import ObservabilityEvidenceManifestService

    service = ObservabilityEvidenceManifestService()
    manifest = service.manifest(
        phase="P14", tests={"tenant_isolation": "PASS"},
        files=[{"sha256": "0" * 64}], limitations=[],
        scientific_validation_state="VALIDATION_PENDING",
    )
    return {
        "done_when_required_tests_named": service.done_gate(manifest, required_tests=["tenant_isolation"])["done"],
        "not_done_when_a_required_test_is_missing": not service.done_gate(
            manifest, required_tests=["tenant_isolation", "reproducibility"]
        )["done"],
    }


def main() -> None:
    tests = pytest_summary(TESTS)
    isolation = attempt(tenant_isolation)
    reproducibility = attempt(dataset_reproducibility)
    manifest_gate = attempt(evidence_manifest_gate)
    build = server_state(PROBES)

    i = isolation.get("value") or {}
    r = reproducibility.get("value") or {}
    m = manifest_gate.get("value") or {}

    checks = {
        "tests_pass": tests.get("exit_code") == 0,
        "private_context_is_tenant_isolated": bool(i.get("owner_reads_own"))
        and bool(i.get("stranger_reads_nothing")),
        "audit_trail_is_tenant_scoped": bool(i.get("audit_is_per_tenant")),
        "audit_carries_request_id": bool(i.get("audit_carries_request_id")),
        "dataset_reproduces_from_the_same_records": bool(r.get("same_records_reproduce")),
        "reproduction_check_can_fail": bool(r.get("changed_records_do_not_reproduce")),
        "dataset_manifest_records_license_and_sources": bool(r.get("manifest_records_license"))
        and bool(r.get("manifest_records_sources")),
        "done_gate_refuses_an_unaccounted_test": bool(m.get("not_done_when_a_required_test_is_missing")),
        "multi_tenant_deployment_verified": False,
    }
    blockers = {
        "tests_pass": (BUILDABLE_NOW, "연구/운영 테스트 미통과 — 내부 작업"),
        "private_context_is_tenant_isolated": (
            BUILDABLE_NOW, "테넌트 비공개 컨텍스트가 격리되지 않음 — 내부 작업",
        ),
        "audit_trail_is_tenant_scoped": (BUILDABLE_NOW, "감사 기록이 테넌트별로 분리되지 않음 — 내부 작업"),
        "audit_carries_request_id": (BUILDABLE_NOW, "감사 기록에 request_id 없음 — 내부 작업"),
        "dataset_reproduces_from_the_same_records": (
            BUILDABLE_NOW, "데이터셋 매니페스트가 재현되지 않음 — 내부 작업",
        ),
        "reproduction_check_can_fail": (
            BUILDABLE_NOW,
            "재현 검사가 다른 레코드에도 참을 돌려준다. 통과해도 재현을 증명하지 않는다 — 내부 작업",
        ),
        "dataset_manifest_records_license_and_sources": (
            BUILDABLE_NOW, "매니페스트가 라이선스·출처를 담지 않음 — 내부 작업",
        ),
        "done_gate_refuses_an_unaccounted_test": (
            BUILDABLE_NOW, "DONE 게이트가 누락된 필수 테스트를 통과시킴 — 내부 작업",
        ),
        "multi_tenant_deployment_verified": (
            EXTERNAL_PARTNER_GATED,
            "실제 다중 테넌트 배포에서의 격리는 기관 테넌트와의 계약·환경이 있어야 검증된다. "
            "자격증명만의 문제가 아니라 상대가 있어야 하는 일이다.",
        ),
    }

    write_evidence(
        phase="p14",
        phase_name="Research / Operations",
        hard_gate="tenant isolation + reproducibility",
        checks=checks,
        blockers=blockers,
        tests_research_operations=tests,
        tenant_isolation=isolation,
        dataset_reproducibility=reproducibility,
        evidence_manifest_gate=manifest_gate,
        live_build=build,
        live_api={"capabilities": digest(probe("/v1/subscription/capabilities"))},
        limitations=[
            "격리는 프로세스 내 저장소 구현에 대해 검증된다. 공유 데이터베이스·캐시·객체 저장소를 낀 "
            "실제 배포의 격리는 별도 검증이 필요하다.",
            "재현은 레코드 집합의 해시 동일성이다. 같은 입력에서 같은 과학 결과가 나오는지는 "
            "각 엔진의 결정성 테스트가 따로 담당한다.",
        ],
        next_allowed="기관 테넌트 환경 확보 후 배포 격리 검증, 또는 P15 하드닝",
    )


if __name__ == "__main__":
    main()
