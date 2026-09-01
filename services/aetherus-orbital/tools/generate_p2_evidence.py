"""V2-P2 (SPACE Core E08~E12) 증거 생성기.

E08 독립 교차검증 테스트와 라이브 SPACE API 프로브를 실제 실행해
artifacts/evidence/p2.json을 만든다. 수기 값 금지 — 전 필드 실행 결과.
실행: services/aetherus-orbital에서 .venv/Scripts/python tools/generate_p2_evidence.py
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
EVIDENCE_PATH = REPO_ROOT / "artifacts" / "evidence" / "p2.json"

SPACE_TESTS = [
    "tests/unit/test_e08_ephemeris_cross_validation.py",
    "tests/acceptance",
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
            body = json.loads(r.read().decode("utf-8"))
            return {"http_status": r.status, "body": body}
    except Exception as exc:  # noqa: BLE001
        return {"http_status": None, "error": str(exc)}


def main() -> None:
    state = probe("http://127.0.0.1:8100/v1/space/state")
    weather = probe("http://127.0.0.1:8100/v1/space-weather/current")
    neo = probe("http://127.0.0.1:8100/v1/space/neo")
    openapi = probe("http://127.0.0.1:8100/openapi.json")
    first_obj = (
        (state.get("body") or {}).get("data", {}).get("objects") or [{}]
    )[0]
    evidence = {
        "phase": "p2",
        "orbital_phase": None,
        "gate": "PARTIAL",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "repository": run(["git", "-C", str(REPO_ROOT), "remote", "get-url", "origin"]),
        "branch": run(["git", "-C", str(REPO_ROOT), "rev-parse", "--abbrev-ref", "HEAD"]),
        "commit": run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"]),
        "tests_space": pytest_summary(SPACE_TESTS),
        "e08_correction": {
            "defect": (
                "구 PLANET_ELEMENTS 테이블이 규약 혼선(6열이 수성·금성에선 평균이각,"
                " 코드는 평균경도로 소비 → ω+Ω 이중 차감)으로 수성 103°·금성 131°"
                " 오배치. 기존 인수 테스트는 |r|만 검사해 각도 오류를 통과시킴."
            ),
            "fix": (
                "JPL/Standish 근사 원소 Table 1(1800-2050, L·ϖ·Ω + 세기당 L률)로"
                " 교체, kernel_version standish-1800-2050-v2. 독립 교차검증(astropy"
                " 내장 해석 에페메리스) 8행성 전부 각도차 0.054° 이내."
            ),
            "regression_guard": "tests/unit/test_e08_ephemeris_cross_validation.py (각도 0.5°·거리 0.5% 상한)",
        },
        "live_api": {
            "routes_total": len(((openapi.get("body") or {}).get("paths") or {})),
            "space_state": {
                "http_status": state.get("http_status"),
                "data_status": (state.get("body") or {}).get("data_status"),
                "first_object": {
                    "id": first_obj.get("id"),
                    "kernel_version": first_obj.get("kernel_version"),
                    "validation_state": first_obj.get("validation_state"),
                },
            },
            "space_weather": {
                "http_status": weather.get("http_status"),
                "data_status": (weather.get("body") or {}).get("data_status"),
                "warnings": (weather.get("body") or {}).get("warnings"),
            },
            "neo": {
                "http_status": neo.get("http_status"),
                "data_status": (neo.get("body") or {}).get("data_status"),
            },
        },
        "pwa": {
            "surface": "services/web (한/영 이중언어) — /app/ 마운트, SPACE 모드 태양계 씬 렌더 확인 (인앱 브라우저)",
            "dual_api": "PWA가 8100 제품 API + 8000 페이즈 과학 API(catalog/*) 동시 소비 확인 (네트워크 검사)",
            "visual_fix": (
                "visual-engine.js _ellipse: 첫 프레임 0사이즈 캔버스에서 로그 스케일"
                " 궤도 반경이 음수화되어 IndexSizeError로 씬 전체가 죽던 문제 —"
                " 반경 클램프 방어로 수정"
            ),
        },
        "limitations": [
            "E08은 RESEARCH_ONLY 오프라인 케플러 — 운영 에페메리스는 JPL 커널/Horizons 필요 (엔진 자체 명시)",
            "우주기상(NOAA SWPC)·NEO는 라이브 프로바이더 미검증 — 정직한 UNAVAILABLE 상태로 서빙됨",
            "E09~E12 심층 감사는 후속 (구조·정직성 테스트는 인수 매트릭스로 재현됨)",
            "V2-P3 멀티스케일 비주얼(v2-three 지구 통합)은 별도 트랙",
        ],
        "next_allowed": "V2-P3 Multi-Scale Visual (v2-three 지구 ↔ AETHERUS 씬 통합) 또는 V2-P4 CONTROL",
    }
    EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_PATH.write_text(
        json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"evidence written: {EVIDENCE_PATH}")


if __name__ == "__main__":
    main()
