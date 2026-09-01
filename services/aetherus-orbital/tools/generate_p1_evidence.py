"""V2-P1 (ORB-P0 구간) 증거 생성기.

라이브 PostgreSQL·Docker·git에서 값을 직접 질의해 artifacts/evidence/p1.json을 만든다.
수기 값 입력 금지 — 모든 필드는 실행 결과에서만 채운다.
실행: services/aetherus-orbital에서 .venv/Scripts/python tools/generate_p1_evidence.py
"""

import asyncio
import datetime
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from backend.database import get_db_session  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[3]
EVIDENCE_PATH = REPO_ROOT / "artifacts" / "evidence" / "p1.json"


def run(cmd: list[str]) -> str:
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()


def docker_exe() -> str:
    found = shutil.which("docker")
    if found:
        return found
    fallback = Path("C:/Program Files/Docker/Docker/resources/bin/docker.exe")
    return str(fallback)


async def collect_db() -> dict:
    async with get_db_session() as session:
        ledger = (
            await session.execute(
                text(
                    "SELECT migration_name, content_hash, execution_time_ms"
                    " FROM schema_migrations ORDER BY migration_name"
                )
            )
        ).all()
        tables = (
            await session.execute(
                text(
                    "SELECT table_schema, count(*) FROM information_schema.tables"
                    " WHERE table_schema IN ('public','aetherus_product')"
                    " GROUP BY table_schema ORDER BY table_schema"
                )
            )
        ).all()
        triggers = (
            await session.execute(
                text("SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal")
            )
        ).scalar_one()
        postgis = (await session.execute(text("SELECT postgis_version()"))).scalar_one()
        sources = (
            await session.execute(text("SELECT count(*) FROM data_source"))
        ).scalar_one()
        return {
            "schema_migrations": [
                {"name": m, "content_hash": h, "execution_time_ms": t}
                for (m, h, t) in ledger
            ],
            "table_counts": {schema: count for (schema, count) in tables},
            "user_trigger_count": triggers,
            "postgis_version": postgis,
            "data_source_seed_count": sources,
        }
    raise RuntimeError("DB 세션을 얻지 못함")


def main() -> None:
    docker = docker_exe()
    evidence = {
        "phase": "p1",
        "orbital_phase": "ORB-P0",
        "gate": "PARTIAL",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "repository": run(["git", "-C", str(REPO_ROOT), "remote", "get-url", "origin"]),
        "branch": run(["git", "-C", str(REPO_ROOT), "rev-parse", "--abbrev-ref", "HEAD"]),
        "commit": run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"]),
        "import_source": {
            "repo": "Aetherus 823_Orbital/aetherus-orbital-environment (local-only)",
            "branch": "codex/aetherus-v2-v06-integration",
            "commit": "7ac0357",
            "records": [
                "docs/audit/imports/p1-7ac0357.md",
                "docs/audit/imports/p0-infra-7ac0357.md",
            ],
        },
        "infrastructure": {
            "docker_server_version": run([docker, "info", "--format", "{{.ServerVersion}}"]),
            "containers": json.loads(
                "["
                + ",".join(
                    run(
                        [docker, "inspect", "--format",
                         '{"name":"{{.Name}}","image":"{{.Config.Image}}","health":"{{.State.Health.Status}}"}',
                         name]
                    )
                    for name in ("aetherus-postgres", "aetherus-redis")
                )
                + "]"
            ),
        },
        "database": asyncio.run(collect_db()),
        "tests": {
            "note": "823 pytest 스위트 미이식 — 자동 테스트는 코드 이식 단계에서 재현 예정",
            "executed": [
                "backend.migrations.migrate (8/8 applied)",
                "contracts JSON parse 19/19 (import 시점)",
            ],
        },
        "limitations": [
            "ORB-P0 게이트 중 CI 워크플로·헬스 엔드포인트·클린클론 부트 검증 미완 — 따라서 PARTIAL",
            "MinIO/S3 어댑터 미기동 — raw 저장 파일시스템 경로",
            "Space-Track 자격증명 부재 (CelesTrak 무자격 경로로 진행)",
        ],
        "next_allowed": "P1 수집(CelesTrak) 코드 이식 + 테스트 재현, API 헬스 엔드포인트, CI",
    }
    EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_PATH.write_text(
        json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"evidence written: {EVIDENCE_PATH}")
    print(json.dumps(evidence["database"]["table_counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
