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


def probe(url: str) -> dict:
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
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

    return {
        "phase": "p3",
        "gate": "PARTIAL",
        **_common(),
        "tests_visual": pytest_summary(VISUAL_TESTS),
        "scene_api": {
            "SPACE": scene_digest(scene_space),
            "ORBIT": scene_digest(scene_orbit),
            "invariant": (
                "render_object_ids와 scientific_object_ids가 scientific_hash로 묶여"
                " 렌더 부분집합이 과학 부분집합을 몰래 대체할 수 없음 (절대 규칙 12)"
            ),
        },
        "browser_verification": [
            "E34 씬: SPACE 태양계(8행성 궤도 타원)·ORBIT 지구+셸 씬 렌더 확인 (인앱 브라우저, 2026-09-01)",
            "E35 시맨틱 줌: SOLAR/EARTH/CISLUNAR 스케일 버튼 → EARTH_VIEW 상태 전환 확인",
            "E36 셸 LOD: ORBIT GLOBAL→LEO 전환 시 LEO 링+VAL-A 마커 표시, scientific set은 2로 불변('hash unchanged' 표시)",
            "E37 시각 문법: 객체 SCREENING_ONLY·TIME_APPROX 라벨, Pc '사용 불가 — 공분산 필요' 정직 표기가 UI에 노출",
        ],
        "limitations": [
            "E34/E35의 v2-three 실지구(EARTHUS) 통합은 미착수 — 현 씬은 v0.6 캔버스 엔진, '하나의 우주' 통합은 아키텍처 결정 필요 (PD)",
            "playwright 자동 E2E 미구성 — 브라우저 검증은 세션 수동 기록",
        ],
        "next_allowed": "v2-three ↔ AETHERUS 씬 통합 설계 또는 V2-P6 이후 잔여",
    }


def build_p4() -> dict:
    state = probe("http://127.0.0.1:8100/v1/missions/APOLLO11/state")
    handover = probe("http://127.0.0.1:8100/v1/missions/APOLLO11/handover")
    trajectory = probe("http://127.0.0.1:8100/v1/missions/APOLLO11/trajectory")
    return {
        "phase": "p4",
        "gate": "PARTIAL",
        **_common(),
        "tests_control": pytest_summary(CONTROL_TESTS),
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
            "라이브 발사 일정/텔레메트리 프로바이더 미연결 — OFFICIAL 픽스처(Apollo 11) 경로만 재현",
            "mission→orbit handover의 실카탈로그 연동은 라이브 미션 데이터 확보 후",
        ],
        "next_allowed": "라이브 발사 프로바이더 계약 또는 V2-P9+ 인텔리전스 표면 검증",
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
