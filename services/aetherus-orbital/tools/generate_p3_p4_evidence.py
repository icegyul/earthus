"""V2-P3 (Multi-Scale Visual E34~E37) / V2-P4·P5 (CONTROL E13~E19) 증거 생성기.

관련 테스트와 라이브 API 프로브를 실제 실행해 artifacts/evidence/p3.json과
p4.json을 만든다. 수기 값 금지 — 전 필드 실행 결과 또는 기록된 관측.
실행: services/aetherus-orbital에서 .venv/Scripts/python tools/generate_p3_p4_evidence.py
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

VISUAL_TESTS = [
    "tests/product/test_registry_api_surface.py",
    "tests/product/test_product_runtime.py",
    "tests/acceptance",
]
CONTROL_TESTS = [
    "tests/product/test_platform_product_integration.py",
    "tests/product/test_api_product.py",
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


def probe(url: str, timeout: int = 10) -> dict:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return {"http_status": r.status, "body": json.loads(r.read().decode("utf-8"))}
    except Exception as exc:  # noqa: BLE001
        return {"http_status": None, "error": str(exc)}


def _common() -> dict:
    return {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "repository": run(["git", "-C", str(REPO_ROOT), "remote", "get-url", "origin"]),
        "branch": run(["git", "-C", str(REPO_ROOT), "rev-parse", "--abbrev-ref", "HEAD"]),
        "commit": run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"]),
    }


def build_p3() -> dict:
    scene_space = probe("http://127.0.0.1:8100/v1/scene/SPACE")
    scene_orbit = probe("http://127.0.0.1:8100/v1/scene/ORBIT")
    render_set = probe("http://127.0.0.1:8100/v1/orbit/render-set", timeout=40)
    # The real-Earth app consumes the science API through this layer; its presence is
    # a file fact, while the scene unification itself is still open.
    link_layer = REPO_ROOT / "prototype" / "v2-three" / "js" / "aetherus-link.js"

    def scene_digest(payload: dict) -> dict:
        data = (payload.get("body") or {}).get("data", {})
        return {
            "http_status": payload.get("http_status"),
            "scale": data.get("scale"),
            "render_object_ids": data.get("render_object_ids"),
            "scientific_object_ids": data.get("scientific_object_ids"),
            "scientific_hash": data.get("scientific_hash"),
            "layer_evidence_classes": [
                layer.get("evidence_class") for layer in data.get("layers", [])
            ],
        }

    render_data = (render_set.get("body") or {}).get("data") or {}
    tests = pytest_summary(VISUAL_TESTS)
    checks = {
        "tests_pass": tests.get("exit_code") == 0,
        "scene_api_200": scene_space.get("http_status") == 200
        and scene_orbit.get("http_status") == 200,
        "render_set_serves_real_catalog": len(render_data.get("render_object_ids") or []) > 100,
        "earth_link_layer_present": link_layer.is_file(),
        # 씬 일원화(v2-three ↔ v0.6 캔버스)와 playwright E2E가 남아 있는 한 참이 될 수 없다.
        "scene_unification_done": False,
        "playwright_e2e_run": False,
    }
    blockers = {
        "tests_pass": (BUILDABLE_NOW, "P3 시각 테스트 미통과 — 내부 작업"),
        "scene_api_200": (BUILDABLE_NOW, "SPACE/ORBIT 장면 API 미응답 — 내부 작업"),
        "render_set_serves_real_catalog": (
            BUILDABLE_NOW,
            "렌더 세트가 실 카탈로그 객체 100건에 못 미침 — 내부 작업",
        ),
        "earth_link_layer_present": (
            BUILDABLE_NOW,
            "지구 연결 레이어 파일 부재 — 내부 작업",
        ),
        "scene_unification_done": (
            DECISION_PENDING,
            "prototype/ 1.0 장면과 v2-three 장면 중 무엇을 정본으로 삼을지 PD 결정 "
            "대기. 능력 문제가 아니라 판단 대기이므로 공학 제약으로 적지 않는다.",
        ),
        "playwright_e2e_run": (
            BUILDABLE_NOW,
            "Playwright E2E 미실행. 러너 설치와 스크립트 작성만 남았고 외부 의존 없음.",
        ),
    }
    blocker_report = classify(checks, blockers)
    failed = [name for name, ok in checks.items() if not ok]
    return {
        "phase": "p3",
        "gate": "PASS" if not failed else "PARTIAL",
        "failed_checks": failed,
        "checks": checks,
        # PARTIAL 하나로 뭉치지 않는다: 우리 일과 남의 일을 구분한다.
        "blockers": blocker_report,
        **_common(),
        "tests_visual": tests,
        "scene_api": {
            "SPACE": scene_digest(scene_space),
            "ORBIT": scene_digest(scene_orbit),
            "render_set": {
                "http_status": render_set.get("http_status"),
                "view": render_data.get("view"),
                "lod_cap": render_data.get("lod_cap"),
                "render_object_count": len(render_data.get("render_object_ids") or []),
                "scientific_object_count": len(render_data.get("scientific_object_ids") or []),
                "scientific_hash": render_data.get("scientific_hash"),
            },
            "invariant": (
                "render_object_ids와 scientific_object_ids가 scientific_hash로 묶여"
                " 렌더 부분집합이 과학 부분집합을 몰래 대체할 수 없음 (절대 규칙 12)"
            ),
        },
        "earth_link_layer": {
            "path": "prototype/v2-three/js/aetherus-link.js",
            "present": link_layer.is_file(),
            "bytes": link_layer.stat().st_size if link_layer.is_file() else None,
            "role": (
                "v2-three 실지구가 과학 API(catalog/snapshot·conjunctions)를 직접 소비 —"
                " 위치는 서버 SGP4 스냅샷, 사이 구간은 LINEAR_ADVANCE로 화면에 명시"
            ),
        },
        "browser_verification": [
            "E34 씬: SPACE 태양계(8행성 궤도 타원)·ORBIT 지구+셸 씬 렌더 확인 (인앱 브라우저, 2026-09-01)",
            "E35 시맨틱 줌: SOLAR/EARTH/CISLUNAR 스케일 버튼 → EARTH_VIEW 상태 전환 확인",
            "E36 셸 LOD: ORBIT GLOBAL→LEO 전환 시 LEO 링+VAL-A 마커 표시, scientific set은 2로 불변('hash unchanged' 표시)",
            "E37 시각 문법: 객체 SCREENING_ONLY·TIME_APPROX 라벨, Pc '사용 불가 — 공분산 필요' 정직 표기가 UI에 노출",
        ],
        "limitations": [
            "v2-three 실지구는 AETHERUS LINK 레이어로 과학 API를 소비하지만, v0.6 캔버스 씬과의 렌더러 일원화('하나의 우주' 단일 씬)는 미완 — 두 표면이 각자 렌더한다",
            "/v1/scene/{mode}는 여전히 검증 픽스처 집합(SPACE: SUN/EARTH/MARS, ORBIT: VAL-A/VAL-B)을 서빙 — 실카탈로그는 /v1/orbit/render-set 경로에만 결선됨",
            "playwright 자동 E2E 미구성 — 브라우저 검증은 세션 수동 기록",
        ],
        "next_allowed": "v2-three ↔ AETHERUS 씬 일원화 설계 또는 V2-P6 이후 잔여",
    }


def build_p4() -> dict:
    state = probe("http://127.0.0.1:8100/v1/missions/APOLLO11/state")
    handover = probe("http://127.0.0.1:8100/v1/missions/APOLLO11/handover")
    trajectory = probe("http://127.0.0.1:8100/v1/missions/APOLLO11/trajectory")
    launches = probe("http://127.0.0.1:8100/v1/launches/upcoming", timeout=40)
    launch_data = (launches.get("body") or {}).get("data") or {}
    launch_provenance = launch_data.get("provenance") or {}
    tests = pytest_summary(CONTROL_TESTS)
    checks = {
        "tests_pass": tests.get("exit_code") == 0,
        "mission_api_200": all(
            payload.get("http_status") == 200 for payload in (state, handover, trajectory)
        ),
        "live_launch_schedule": (
            (launches.get("body") or {}).get("data_status") == "OK"
            and launch_provenance.get("http_status") == 200
            and bool(launch_provenance.get("raw_sha256"))
        ),
        # 라이브 텔레메트리 소스와 실미션 handover가 없는 한 참이 될 수 없다.
        "live_telemetry_provider": False,
    }
    blockers = {
        "tests_pass": (BUILDABLE_NOW, "P4 미션 테스트 미통과 — 내부 작업"),
        "mission_api_200": (BUILDABLE_NOW, "미션 API 미응답 — 내부 작업"),
        "live_launch_schedule": (
            EXTERNAL_DATA_GATED,
            "TheSpaceDevs LL2 공개 API. 자격증명은 불필요하나 네트워크 접근과 "
            "속도제한 준수가 필요하다. 계약이 아니라 접근 문제다.",
        ),
        "live_telemetry_provider": (
            EXTERNAL_PARTNER_GATED,
            "발사체 상승 단계의 엔진·연료·자세 텔레메트리는 발사 운영자만 보유한다. "
            "다만 이 판정은 기체 내부 상태에만 해당한다 — 궤적·비행 이벤트·투입 후 "
            "초기 궤도는 공개 소스로 지금 구축 가능하며, 하나의 체크로 묶어두면 "
            "구축 가능한 부분까지 파트너 대기로 오독된다.",
        ),
    }
    blocker_report = classify(checks, blockers)
    failed = [name for name, ok in checks.items() if not ok]
    return {
        "phase": "p4",
        "gate": "PASS" if not failed else "PARTIAL",
        "failed_checks": failed,
        "checks": checks,
        # PARTIAL 하나로 뭉치지 않는다: 우리 일과 남의 일을 구분한다.
        "blockers": blocker_report,
        **_common(),
        "tests_control": tests,
        "live_launch_schedule": {
            "http_status": launches.get("http_status"),
            "data_status": (launches.get("body") or {}).get("data_status"),
            "source_id": launch_provenance.get("source_id"),
            "source_uri": launch_provenance.get("source_uri"),
            "raw_sha256": launch_provenance.get("raw_sha256"),
            "upstream_http_status": launch_provenance.get("http_status"),
            "reported_total": launch_data.get("reported_total"),
            "launch_count": launch_data.get("launch_count"),
        },
        "mission_api": {
            "state": {
                "http_status": state.get("http_status"),
                "data_status": (state.get("body") or {}).get("data_status"),
            },
            "handover": {
                "http_status": handover.get("http_status"),
                "data_status": (handover.get("body") or {}).get("data_status"),
            },
            "trajectory": {
                "http_status": trajectory.get("http_status"),
                "data_status": (trajectory.get("body") or {}).get("data_status"),
                "warnings": (trajectory.get("body") or {}).get("warnings"),
            },
        },
        "browser_verification": [
            "CONTROL 모드: Apollo 11/Saturn-V AS-506 OFFICIAL 픽스처, 발사장 마커 28.61°N·80.60°W(케네디) 표시 확인",
            "정직 상태: '궤적 자료 없음 — No source-backed flight path or target orbit is stored' 및 '모델 텔레메트리는 날조되지 않는다' 문구가 UI에 노출",
            "MISSION RECORD/REPLAY/MISSION TO ORBIT HANDOVER 워크스페이스 표면 존재",
            "미션 API 5종(trajectory/handover/objects/window/state) 전부 200 (네트워크 검사)",
        ],
        "limitations": [
            "라이브 발사 '일정'만 연결됨(TheSpaceDevs LL2) — 실미션 텔레메트리 프로바이더는 여전히 부존재, CONTROL 미션 경로는 OFFICIAL 픽스처(Apollo 11)",
            "라이브 발사 일정은 아직 미션 레코드로 승격되지 않음 — /v1/missions는 픽스처 미션만 보유",
            "mission→orbit handover의 실카탈로그 연동은 라이브 미션 데이터 확보 후",
        ],
        "next_allowed": "라이브 발사 일정→미션 레코드 승격 또는 V2-P9+ 인텔리전스 표면 검증",
    }


def main() -> None:
    out_dir = REPO_ROOT / "artifacts" / "evidence"
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, payload in (("p3.json", build_p3()), ("p4.json", build_p4())):
        (out_dir / name).write_text(
            json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        print(f"evidence written: {out_dir / name}")


if __name__ == "__main__":
    main()
