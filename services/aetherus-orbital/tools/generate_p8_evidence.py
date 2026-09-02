"""V2-P8 (Counterfactual Patent Core — ORB-P4 구간) 증거 생성기.

P4 테스트·10k 스크리닝 코퍼스를 실제 실행해 artifacts/evidence/p8.json을 만든다.
실행: services/aetherus-orbital에서 .venv/Scripts/python tools/generate_p8_evidence.py
"""

import asyncio
import datetime
import json
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blocker_class import BUILDABLE_NOW, EXTERNAL_DATA_GATED, classify  # noqa: E402

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parents[1]
EVIDENCE_PATH = REPO_ROOT / "artifacts" / "evidence" / "p8.json"

# An evidence generator must terminate: a suite that outruns this budget is recorded
# as TIMED_OUT rather than left to hang, so the gate never waits on an unbounded run.
SUITE_TIMEOUT_SECONDS = float(os.environ.get("AETHERUS_EVIDENCE_TEST_TIMEOUT", "900"))

P4_TESTS = [
    "tests/unit/test_ca_screen.py",
    "tests/unit/test_ca_tca_solver.py",
    "tests/unit/test_ca_pc.py",
    "tests/integration/test_p4_migration_schema.py",
    "tests/integration/test_ca_service_persistence.py",
    "tests/integration/test_conjunctions_api.py",
]
CORPUS_TEST = "tests/integration/test_ca_10k_corpus.py"
P6_TESTS = ["tests/integration/test_p6_protect_ocm.py"]
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
    started = time.monotonic()
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "pytest", *files, "-q", "--no-header"],
            capture_output=True,
            text=True,
            cwd=str(SERVICE_ROOT),
            timeout=SUITE_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return {
            "files": files,
            "status": "TIMED_OUT",
            "exit_code": None,
            "timeout_seconds": SUITE_TIMEOUT_SECONDS,
            "elapsed_seconds": round(time.monotonic() - started, 1),
            "summary": "",
        }
    return {
        "files": files,
        "status": "COMPLETED",
        "exit_code": proc.returncode,
        "elapsed_seconds": round(time.monotonic() - started, 1),
        "summary": proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else "",
    }


async def _latest_screening_cost() -> dict:
    """실 카탈로그 규모의 스크리닝 비용은 추정하지 않고 저장된 런에서 읽는다."""
    from sqlalchemy import text

    from backend.database import get_db_session

    async with get_db_session() as session:
        row = (
            await session.execute(
                text(
                    "SELECT started_at, finished_at, objects_considered, objects_propagated,"
                    " pairs_before_screening, pairs_after_coarse, events_found, status,"
                    " EXTRACT(EPOCH FROM (finished_at - started_at)) AS elapsed_seconds"
                    " FROM screening_run WHERE finished_at IS NOT NULL"
                    " ORDER BY objects_considered DESC, finished_at DESC LIMIT 1"
                )
            )
        ).mappings().first()
    if row is None:
        return {"status": "NO_COMPLETED_SCREENING_RUN"}
    return {
        "status": row["status"],
        "started_at": str(row["started_at"]),
        "objects_considered": row["objects_considered"],
        "objects_propagated": row["objects_propagated"],
        "pairs_before_screening": row["pairs_before_screening"],
        "pairs_after_coarse": row["pairs_after_coarse"],
        "events_found": row["events_found"],
        "elapsed_seconds": float(row["elapsed_seconds"]),
    }


def largest_screening_run() -> dict:
    try:
        return asyncio.run(_latest_screening_cost())
    except Exception as exc:  # noqa: BLE001
        return {"status": "QUERY_FAILED", "reason": str(exc)[:300]}


def spec_shaped_cdm_reaches_pc() -> bool:
    """Run the preparation layer on the spec-shaped fixture; report the fact."""
    proc = subprocess.run(
        [
            sys.executable, "-m", "pytest",
            "tests/unit/test_cdm_pc_preparation.py::TestSpecShapedDocumentReachesPc::test_pc_is_computed_and_marked_validation_pending",
            "-q", "--no-header", "-p", "no:logging",
        ],
        capture_output=True, text=True, cwd=str(SERVICE_ROOT),
    )
    return proc.returncode == 0


def main() -> None:
    tests_p4 = pytest_summary(P4_TESTS)
    tests_corpus = pytest_summary([CORPUS_TEST])
    tests_p5 = pytest_summary(P5_TESTS)
    tests_p6 = pytest_summary(P6_TESTS)
    screening_cost = largest_screening_run()
    checks = {
        "tests_p4_core_pass": tests_p4.get("exit_code") == 0,
        "tests_10k_corpus_pass": tests_corpus.get("exit_code") == 0,
        "tests_p5_pass": tests_p5.get("exit_code") == 0,
        "tests_p6_pass": tests_p6.get("exit_code") == 0,
        # Every internal gate is open: a CCSDS-shaped document (KVN, RTN lower
        # triangle, m**2, ITRF state, AREA_PC) now reaches compute_pc as
        # COMPUTED. Measured by running it, never asserted.
        "spec_shaped_cdm_reaches_pc": spec_shaped_cdm_reaches_pc(),
        # Still unmet, but for a different reason than before: the pipeline is
        # not the blocker any more, the absence of an externally sourced CDM
        # with a published Pc to compare against is.
        "operational_pc_from_cdm_covariance": False,
        "large_scale_benchmark_run": False,
    }

    # 미충족 사유를 원인별로 분류한다. 이전 주석은 운영 Pc 를 "TraCSS/Space-Track
    # 없이는 불가"로 적어 파트너 차단처럼 보이게 했는데, 2026-09-02 규격 형태 CDM
    # 실측이 그것을 반증했다 — 파트너 데이터가 도착하기 전에 우리 쪽 관문 5개가
    # 먼저 거부한다. 우리 일을 남의 일로 적어두면 로드맵이 잘못된 문을 가리킨다.
    blockers = {
        "spec_shaped_cdm_reaches_pc": (
            BUILDABLE_NOW,
            "규격 형태 CDM 이 compute_pc 에 도달하지 못함 — 내부 작업",
        ),
        "operational_pc_from_cdm_covariance": (
            EXTERNAL_DATA_GATED,
            "내부 관문 5개는 모두 열렸다(KVN 파서·21원소 하삼각·m**2 변환·RTN->TEME "
            "회전·AREA_PC 기반 HBR; tests/unit/test_cdm_pc_preparation.py 가 규격 형태 "
            "문서로 COMPUTED 도달을 실행 검증). 남은 것은 우리가 만들지 않은 CDM 과 "
            "그에 대해 공표된 Pc 로 회전·HBR 규약을 대조하는 일이며, 그 골든 케이스는 "
            "TraCSS CC0 검증 데이터셋(Google 계정 필요, 20.7GB)에서만 얻을 수 있다. "
            "그 전까지 계산된 Pc 는 VALIDATION_PENDING 이며 운영 등급이 아니다."
        ),
        "large_scale_benchmark_run": (
            BUILDABLE_NOW,
            # 이전 문구는 2,000객체 실행을 '전 카탈로그'라 부르고 객체 수도 기록과
            # 맞지 않았다(2,851 vs screening_run 의 2,000 고려·1,998 전파). 그래서
            # 남은 일을 실제보다 두 자릿수 작게 보이게 했다. 아래는 screening_run
            # 과 pg_total_relation_size 실측이다.
            "미실행. screening_run 최대 규모는 1,998객체·1,995,003쌍이고 동일 입력에서 "
            "429~2,844초로 6.6배 흔들린다(events_found 1,769~4,009). 스크리닝 가능 "
            "객체는 19,660개이므로 전 카탈로그는 193,247,970쌍 — 측정된 규모의 97배다. "
            "쌍 수에 선형이라 가정하면 11.5~76.5시간이고, 스냅샷·이벤트 저장은 한 번에 "
            "0.38~0.86 GB 증가한다(현재 snapshot 403 MB/243,137행, event 70 MB/116,607행). "
            "외부 의존은 없으나 실행 규모는 PD 결정 사항이다."
        ),
        "tests_p4_core_pass": (BUILDABLE_NOW, "P4 코어 테스트 미통과 — 내부 작업"),
        "tests_10k_corpus_pass": (BUILDABLE_NOW, "10k 코퍼스 테스트 미통과 — 내부 작업"),
        "tests_p5_pass": (BUILDABLE_NOW, "P5 테스트 미통과 — 내부 작업"),
        "tests_p6_pass": (BUILDABLE_NOW, "P6 테스트 미통과 — 내부 작업"),
    }
    blocker_report = classify(checks, blockers)
    failed = [name for name, ok in checks.items() if not ok]
    evidence = {
        "phase": "p8",
        "orbital_phase": "ORB-P4 + ORB-P5(physical engine) + ORB-P6(PROTECT/OCM)",
        "gate": "PASS" if not failed else "PARTIAL",
        "failed_checks": failed,
        "checks": checks,
        # PARTIAL 하나로 뭉치지 않는다: 남은 것이 우리 일인지 남의 일인지 구분한다.
        "blockers": blocker_report,
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "repository": run(["git", "-C", str(REPO_ROOT), "remote", "get-url", "origin"]),
        "branch": run(["git", "-C", str(REPO_ROOT), "rev-parse", "--abbrev-ref", "HEAD"]),
        "commit": run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"]),
        "tests_p4_core": tests_p4,
        "tests_10k_corpus": tests_corpus,
        "tests_p5": tests_p5,
        "tests_p6": tests_p6,
        "screening_performance": {
            "record": "docs/audit/DEBRIS_INGESTION_NOTE.md",
            "largest_completed_screening_run": screening_cost,
            "measured": (
                "실 파편 규모(1,998 객체·6시간 창·30초 그리드)에서 레벨1 표본거리 스캔이 병목."
                " ThreadPoolExecutor 청크 병렬화로 99.2s→35.9s(2.8배), 후보 48,678건 완전 동일."
                " 필터 체인(false-negative=0 보장)과 후보 순서·해시는 불변."
            ),
            "worker_env": "AETHERUS_SCREENING_WORKERS (기본 CPU-1, 최대 8, 청크 4개 미만이면 순차)",
        },
        "p6_protect_ocm": {
            "protect": (
                "PROTECT Y 역질의: G0' 이웃을 후보로 물리 REMOVE counterfactual을"
                " 후보별 파생(G0' 1회 공유), Benefit(k→Y) 랭킹을 결정론적으로 산출."
                " kind=PROTECT 시나리오·PUBLIC_SCREENING benefit 행 영속."
            ),
            "candidate_ocm": (
                "후보 기동 = 평균요소 치환(SUBSTITUTE) 후 공통 외부 집합 대상 재실행."
                " 해소/변경/신규 엣지와 악화 객체를 보고 — 합성 corpus에서 무모한"
                " 후보가 E/F 셸 진입 시 신규 근접 엣지가 물리로 검출됨을 검증."
            ),
            "advisory_boundary": "모든 응답에 ADVISORY_ONLY — 지휘·송신 경로 부존재",
            "schema": "migrations 010(kind 확장)·011(benefit_result candidate_ref)",
        },
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
            "OCM 후보는 평균요소 치환 근사 — CCSDS OCM 문서 파싱·기동 델타V 모델은 후속",
            "물리 엔진 대규모(10k) full-vs-selective 성능 벤치마크는 후속"
            " (FULL↔AFFECTED_SUBGRAPH 기능 동등성은 카탈로그 확대 이전 실행에서 확인된 사실이며,"
            " 이번 실행의 P5 스위트 결과는 아래 tests_p5 상태가 말하는 그대로다 — 재확인은 런타임 문제 해결 후)",
            "BEN-001/BEN-003 정량 검증 corpus의 물리 엔진 재생성은 후속 (823 산출물은 HISTORICAL 보존)",
            "Space-Track 자격증명은 구성·GP 라이브 수신까지 검증됐으나(p1.json live_providers),"
            " CDM 클래스(TraCSS 공분산)는 미수신 — 운영 Pc는 여전히 산출 불가이고 Pc는 NOT_COMPUTED 유지 (게이트가 PARTIAL인 이유)",
            "실 카탈로그 규모(2,000객체 예산·약 200만 쌍)에서 P4/P5/P6 스위트가 시간 예산 내 미완 —"
            " 전체 재스크리닝을 함수 스코프 픽스처로 반복 호출하는 구조(tests/integration/test_conjunctions_api.py의 _screened_once)와"
            " 라이브 카탈로그를 그대로 소비하는 benefit/counterfactual 경로 때문에 위 largest_completed_screening_run 1회 비용이 테스트마다 재발생한다."
            " 병렬화가 다룬 구간은 레벨1까지이고 TCA 정밀화·이벤트 영속화 구간의 비용은 아직 측정·개선 대상이다"
            " (증거 생성기는 예산 초과 시 값을 지어내지 않고 TIMED_OUT을 기록하고 종료한다)",
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
