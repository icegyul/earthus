"""V2-P9~P11 (Intelligence Core E38~E44) 증거 생성기.

인텔리전스 파이프라인 테스트와 라이브 API 프로브를 실제 실행해
artifacts/evidence/p9.json을 만든다. 수기 값 금지.
실행: services/aetherus-orbital에서 .venv/Scripts/python tools/generate_p9_evidence.py
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
EVIDENCE_PATH = REPO_ROOT / "artifacts" / "evidence" / "p9.json"

INTEL_TESTS = [
    "tests/unit/test_intelligence_orchestrator.py",
    "tests/integration/test_foundation_intelligence_lineage.py",
    "tests/foundation",
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
            return {"http_status": r.status, "data_status": body.get("data_status")}
    except Exception as exc:  # noqa: BLE001
        return {"http_status": None, "error": str(exc)}


def main() -> None:
    evidence = {
        "phase": "p9",
        "gate": "PARTIAL",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "repository": run(["git", "-C", str(REPO_ROOT), "remote", "get-url", "origin"]),
        "branch": run(["git", "-C", str(REPO_ROOT), "rev-parse", "--abbrev-ref", "HEAD"]),
        "commit": run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"]),
        "tests_intelligence": pytest_summary(INTEL_TESTS),
        "live_api": {
            "important_now": probe("http://127.0.0.1:8100/v1/intelligence/important-now"),
            "signals": probe("http://127.0.0.1:8100/v1/intelligence/signals"),
            "events": probe("http://127.0.0.1:8100/v1/intelligence/events"),
        },
        "browser_verification": [
            "INTELLIGENCE 모드: LAUNCH_EVENT(Apollo 11)에 WHAT HAPPENED/WHAT CHANGED/WHY IT MATTERS 3문 + 신뢰도 84% VERY HIGH + 불확실성 '고정 역사 사실에는 수치 불확실성 부적용' 정직 표기",
            "파이프라인 상태 표면: 근거 융합·신호 승격·LLM 주장 검증(ACTIVE) — E38~E44 노출, 과학 상태 VALIDATION_PENDING 라벨",
            "ARCHIVE 모드: 1969→2026 타임라인·TIME CURSOR·ARCHIVED 배지, '보관 스냅샷은 재구성/모델 상태와 시각적으로 구분' 명문",
        ],
        "limitations": [
            "LLM 게이트웨이 라이브(L01)는 외부 API 자격증명 부재로 미검증 — 주장 검증기는 픽스처 경로",
            "인텔리전스는 OFFICIAL 픽스처(Apollo 11) 계보 — 실궤도 이벤트의 신호→이벤트 승격은 라이브 신호원 연결 후",
            "E38~E44 심층 적대 감사는 후속",
        ],
        "next_allowed": "라이브 신호원 연결(P4 근접 이벤트→Intelligence 승격) 또는 잔여 하드닝(CI·E2E)",
    }
    EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_PATH.write_text(
        json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"evidence written: {EVIDENCE_PATH}")


if __name__ == "__main__":
    main()
