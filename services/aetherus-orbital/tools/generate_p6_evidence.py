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


def main() -> None:
    pytest_proc = subprocess.run(
        [sys.executable, "-m", "pytest", *P2_TESTS, "-q", "--no-header"],
        capture_output=True,
        text=True,
        cwd=str(SERVICE_ROOT),
    )
    evidence = {
        "phase": "p6",
        "orbital_phase": "ORB-P2",
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
        "limitations": [
            "ORB-P3 Explore 3D 미착수 — V2-P6 게이트의 나머지 절반",
            "테스트 TZ 버그 1건 수정(naive OMM EPOCH를 UTC로 해석) — 소스 823 대비 변경",
        ],
        "next_allowed": "ORB-P3 Explore UI를 수락된 P1/P2 API에 연결 (하드코딩 위치 금지 증명 포함)",
    }
    EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_PATH.write_text(
        json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"evidence written: {EVIDENCE_PATH}")


if __name__ == "__main__":
    main()
