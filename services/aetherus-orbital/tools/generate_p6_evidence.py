"""V2-P6 (Orbital Core — ORB-P2 구간) 증거 생성기.

골든 재계산·P2 테스트·라이브 에페메리스 API를 실제 실행해 artifacts/evidence/p6.json을 만든다.
실행: services/aetherus-orbital에서 .venv/Scripts/python tools/generate_p6_evidence.py
"""

import datetime
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.orbit.golden import (  # noqa: E402
    compare_within_tolerance,
    load_fixture,
    recompute_fixture_samples,
)

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parents[1]
EVIDENCE_PATH = REPO_ROOT / "artifacts" / "evidence" / "p6.json"

P2_TESTS = [
    "tests/unit/test_frames.py",
    "tests/unit/test_time_scale.py",
    "tests/unit/test_ephemeris_api.py",
    "tests/integration/test_p2_migration_schema.py",
    "tests/integration/test_p2_golden_cross_validation.py",
]


def run(cmd: list[str]) -> str:
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()


def golden_report() -> list[dict]:
    reports = []
    for path in sorted((SERVICE_ROOT / "tests/fixtures/golden").glob("p2_golden_*.json")):
        fixture = load_fixture(path)
        maxima = compare_within_tolerance(fixture, recompute_fixture_samples(fixture))
        reports.append(
            {
                "fixture": path.name,
                "raw_artifact_sha256": fixture["generated_from"]["raw_artifact_sha256"],
                "max_deltas": {k: float(f"{v:.6e}") for k, v in maxima.items()},
                "tolerance": fixture["tolerance"],
                "within_tolerance": all(
                    v < fixture["tolerance"][k] for k, v in maxima.items()
                ),
            }
        )
    return reports


def probe_ephemeris() -> dict:
    url = (
        "http://127.0.0.1:8000/api/v1/objects/1bfd8ce0-d0a0-4bd0-b8cf-ece6567f459a/"
        "ephemeris?start=2026-09-01T03:00:00Z&stop=2026-09-01T03:10:00Z&step_seconds=300"
    )
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            body = json.loads(r.read().decode("utf-8"))
            samples = body.get("samples") or body.get("data", {}).get("samples") or []
            first = samples[0] if samples else None
            return {
                "http_status": r.status,
                "sample_count": len(samples),
                "first_sample_frame": (first or {}).get("state", {}).get("frame"),
            }
    except Exception as exc:  # noqa: BLE001
        return {"http_status": None, "error": str(exc)}


def probe_ui() -> dict:
    """/ui/ 정적 서빙과 카탈로그 API를 조회한다 (ORB-P3 표면)."""
    out: dict = {}
    for key, url in {
        "ui_index": "http://127.0.0.1:8000/ui/",
        "catalog_snapshot": "http://127.0.0.1:8000/api/v1/catalog/snapshot",
    }.items():
        try:
            with urllib.request.urlopen(url, timeout=10) as r:
                out[key] = {"http_status": r.status, "bytes": len(r.read())}
        except Exception as exc:  # noqa: BLE001
            out[key] = {"http_status": None, "error": str(exc)}
    return out


def main() -> None:
    pytest_proc = subprocess.run(
        [sys.executable, "-m", "pytest", *P2_TESTS, "-q", "--no-header"],
        capture_output=True,
        text=True,
        cwd=str(SERVICE_ROOT),
    )
    evidence = {
        "phase": "p6",
        "orbital_phase": "ORB-P2 + ORB-P3(partial)",
        "gate": "PARTIAL",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "repository": run(["git", "-C", str(REPO_ROOT), "remote", "get-url", "origin"]),
        "branch": run(["git", "-C", str(REPO_ROOT), "rev-parse", "--abbrev-ref", "HEAD"]),
        "commit": run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"]),
        "tests": {
            "command": f"pytest <P2 subset {len(P2_TESTS)} files> -q",
            "exit_code": pytest_proc.returncode,
            "summary": pytest_proc.stdout.strip().splitlines()[-1]
            if pytest_proc.stdout.strip()
            else "",
        },
        "golden_cross_validation": golden_report(),
        "platform_migration_note": (
            "macOS 기록 골든 대비 Windows 재계산 최대 델타: position 1.819e-12 km,"
            " velocity 8.882e-16 km/s, alt 2.728e-12 km, lat/lon 0.0 — 전 항목 허용오차"
            " 통과 확인 후, 커밋된 생성기(backend.tools.generate_golden_fixtures)로 동일"
            " raw 아티팩트(e746e2d5…)에서 본 플랫폼 골든을 재생성했다. 바이트 해시 차이는"
            " 플랫폼 부동소수점 최하위 비트 서식 차이였다."
        ),
        "live_api": probe_ephemeris(),
        "explore_ui": probe_ui(),
        "explore_network_inspection": (
            "인앱 브라우저 네트워크 검사(2026-09-01): /ui/ 로드 시 좌표 소스 요청은"
            " /api/v1/catalog/status·/api/v1/catalog/snapshot 200 두 건뿐, 콘솔 에러 0."
            " ISS 25544는 API 유래 SGP4 마커+데이터 나이 표기, 격리 객체 2건은 위치 없이"
            " UNAVAILABLE 상태 렌더, GLOBAL VIEW: INSUFFICIENT_DATA 배지 표시 확인."
        ),
        "limitations": [
            "playwright e2e(tests/e2e/test_p3_explore_ui.py) 미실행 — 브라우저 바이너리 미설치, 후속",
            "테스트 TZ 버그 1건 수정(naive OMM EPOCH를 UTC로 해석) — 소스 823 대비 변경",
            "카탈로그가 소수 객체(수집 1건+테스트 데이터) — 대규모 LOD 검증은 카탈로그 확장 후",
        ],
        "next_allowed": "ORB-P4 근접분석 재현 (스크리닝·TCA·공분산 게이트 Pc·CDM)",
    }
    EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_PATH.write_text(
        json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"evidence written: {EVIDENCE_PATH}")


if __name__ == "__main__":
    main()
