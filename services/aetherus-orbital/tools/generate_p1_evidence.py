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


def run_pytest_subset() -> dict:
    """P0·P1 테스트 서브셋을 실제 실행해 요약을 기록한다."""
    files = [
        "tests/test_health.py",
        "tests/test_database.py",
        "tests/test_migrations.py",
        "tests/unit/test_celestrak_client.py",
        "tests/unit/test_ingestion_service.py",
        "tests/unit/test_ingestion_api.py",
        "tests/unit/test_catalog_id_validation.py",
        "tests/unit/test_identity_resolution.py",
        "tests/integration/test_p1_migration_schema.py",
        "tests/integration/test_celestrak_ingestion.py",
        "tests/integration/test_ingestion_rejections.py",
        "tests/integration/test_partial_ingestion.py",
        "tests/integration/test_run_artifact_provenance.py",
        "tests/integration/test_identity_conflicts.py",
        "tests/integration/test_snapshot_versioning.py",
    ]
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", *files, "-q", "--no-header"],
        capture_output=True,
        text=True,
        cwd=str(Path(__file__).resolve().parents[1]),
    )
    summary = proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else ""
    return {
        "command": "pytest <P0/P1 subset 15 files> -q",
        "exit_code": proc.returncode,
        "summary": summary,
    }


def probe_health() -> dict:
    """실행 중인 API의 /health를 조회한다 (서버 미가동이면 명시 기록)."""
    import urllib.request

    try:
        with urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=5) as r:
            return {"endpoint": "/health", "http_status": r.status,
                    "body": json.loads(r.read().decode("utf-8"))}
    except Exception as exc:  # noqa: BLE001
        return {"endpoint": "/health", "http_status": None, "error": str(exc)}


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
        ingestion = (
            await session.execute(
                text(
                    "SELECT (SELECT count(*) FROM ingestion_run),"
                    " (SELECT count(*) FROM raw_artifact),"
                    " (SELECT count(*) FROM space_object),"
                    " (SELECT count(*) FROM orbit_solution)"
                )
            )
        ).one()
        iss = (
            await session.execute(
                text(
                    "SELECT so.catalog_id, so.canonical_name, os.epoch, os.format,"
                    " os.frame FROM space_object so"
                    " JOIN orbit_solution os ON os.object_id = so.id"
                    " WHERE so.catalog_id = '25544'"
                    " ORDER BY os.created_at DESC LIMIT 1"
                )
            )
        ).first()
        return {
            "ingestion_counts": {
                "ingestion_run": ingestion[0],
                "raw_artifact": ingestion[1],
                "space_object": ingestion[2],
                "orbit_solution": ingestion[3],
            },
            "live_ingest_sample": (
                {
                    "catalog_id": iss[0],
                    "canonical_name": iss[1],
                    "epoch": str(iss[2]),
                    "format": iss[3],
                    "frame": iss[4],
                }
                if iss
                else None
            ),
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
        "tests": run_pytest_subset(),
        "api": probe_health(),
        "limitations": [
            "ORB-P0 게이트 중 CI 워크플로·클린클론 부트 검증 미완 — 따라서 PARTIAL",
            "MinIO/S3 어댑터 미기동 — raw 저장 파일시스템 경로",
            "Space-Track 라이브 미검증 (자격증명 부재 — 어댑터 계약·테스트만 재현)",
            "packages/* 제품 라인 미이식 — 페이즈 라인(backend)만 재현",
        ],
        "next_allowed": "ORB-P2 궤도전파 골든 재현 (P1 관통 증명 완료 후)",
    }
    EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_PATH.write_text(
        json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"evidence written: {EVIDENCE_PATH}")
    print(json.dumps(evidence["database"]["table_counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
