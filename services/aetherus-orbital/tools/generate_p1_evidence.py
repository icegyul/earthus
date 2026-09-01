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

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]
EVIDENCE_PATH = REPO_ROOT / "artifacts" / "evidence" / "p1.json"
P0_EVIDENCE_PATH = REPO_ROOT / "artifacts" / "evidence" / "p0.json"

# A live provider proof is only credible when the stored raw artifact carries the
# provider's own host in source_uri — a recorded:// fixture must never satisfy it.
LIVE_PROVIDER_URI_PREFIXES = {
    "celestrak_gp": "https://celestrak.org/NORAD/elements/gp.php",
    "spacetrack_gp": "https://www.space-track.org/basicspacedata/query",
}


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


async def collect_live_providers(session) -> dict:
    """각 프로바이더의 라이브 응답이 원본→객체→궤도해로 실제 연결돼 있는지 질의한다."""
    out: dict = {}
    for source_id, prefix in LIVE_PROVIDER_URI_PREFIXES.items():
        params = {"sid": source_id, "pfx": f"{prefix}%"}
        latest = (
            await session.execute(
                text(
                    "SELECT ra.source_uri, ra.content_sha256, ra.retrieved_at,"
                    " so.catalog_id, os.format"
                    " FROM raw_artifact ra"
                    " JOIN orbit_solution os ON os.source_artifact_id = ra.id"
                    " JOIN space_object so ON so.id = os.object_id"
                    " WHERE ra.source_id = :sid AND ra.source_uri LIKE :pfx"
                    " ORDER BY ra.retrieved_at DESC LIMIT 1"
                ),
                params,
            )
        ).mappings().first()
        artifact_count = (
            await session.execute(
                text(
                    "SELECT count(*) FROM raw_artifact"
                    " WHERE source_id = :sid AND source_uri LIKE :pfx"
                ),
                params,
            )
        ).scalar_one()
        marked = (
            await session.execute(
                text(
                    "SELECT count(*) FROM ingestion_run"
                    " WHERE source_id = :sid"
                    " AND metadata_json ->> 'live_provider_proof' = 'true'"
                ),
                {"sid": source_id},
            )
        ).scalar_one()
        out[source_id] = {
            "live_raw_artifact_count": artifact_count,
            "linked_to_object_and_orbit": latest is not None,
            "durable_proof_marked_runs": marked,
            "latest": (
                {
                    "source_uri": latest["source_uri"],
                    "content_sha256": latest["content_sha256"],
                    "retrieved_at": str(latest["retrieved_at"]),
                    "catalog_id": latest["catalog_id"],
                    "format": latest["format"],
                }
                if latest
                else None
            ),
        }
    return out


async def collect_debris_groups(session) -> list[dict]:
    """파편운 GROUP 수집이 한 요청=한 아티팩트=한 계보 뿌리로 남았는지 확인한다."""
    rows = (
        await session.execute(
            text(
                "SELECT ra.source_uri, ra.content_sha256, count(DISTINCT so.id) AS objects"
                " FROM raw_artifact ra"
                " JOIN orbit_solution os ON os.source_artifact_id = ra.id"
                " JOIN space_object so ON so.id = os.object_id"
                " WHERE ra.source_uri LIKE '%GROUP=%'"
                " GROUP BY ra.source_uri, ra.content_sha256"
                " ORDER BY objects DESC"
            )
        )
    ).mappings().all()
    return [
        {
            "source_uri": row["source_uri"],
            "raw_sha256": row["content_sha256"],
            "objects_from_this_artifact": row["objects"],
        }
        for row in rows
    ]


def read_p0_gate() -> dict:
    """ORB-P0 게이트는 p0 증거 파일의 실행 결과에서만 읽는다 (수기 값 금지)."""
    if not P0_EVIDENCE_PATH.exists():
        return {"gate": None, "reason": "artifacts/evidence/p0.json 미생성"}
    payload = json.loads(P0_EVIDENCE_PATH.read_text(encoding="utf-8"))
    return {
        "gate": payload.get("gate"),
        "failed_checks": payload.get("failed_checks"),
        "generated_at": payload.get("generated_at"),
    }


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
            "live_providers": await collect_live_providers(session),
            "debris_group_artifacts": await collect_debris_groups(session),
        }
    raise RuntimeError("DB 세션을 얻지 못함")


def main() -> None:
    docker = docker_exe()
    database = asyncio.run(collect_db())
    tests = run_pytest_subset()
    api = probe_health()
    p0_gate = read_p0_gate()
    live = database["live_providers"]
    checks = {
        "orb_p0_gate_pass": p0_gate.get("gate") == "PASS",
        "tests_pass": tests.get("exit_code") == 0,
        "health_endpoint_200": api.get("http_status") == 200,
        "schemas_applied": all(
            database["table_counts"].get(schema, 0) > 0
            for schema in ("public", "aetherus_product")
        ),
        "live_ingest_persisted": (
            database["ingestion_counts"]["space_object"] > 0
            and database["ingestion_counts"]["orbit_solution"] > 0
        ),
        "celestrak_live_linked": live["celestrak_gp"]["linked_to_object_and_orbit"],
        "spacetrack_live_linked": live["spacetrack_gp"]["linked_to_object_and_orbit"],
        "product_line_present": (SERVICE_ROOT / "packages").is_dir(),
    }
    failed = [name for name, ok in checks.items() if not ok]
    gate = "PASS" if not failed else "PARTIAL"

    evidence = {
        "phase": "p1",
        "orbital_phase": "ORB-P0",
        "gate": gate,
        "failed_checks": failed,
        "checks": checks,
        "orb_p0_gate": p0_gate,
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
        "database": database,
        "tests": tests,
        "api": api,
        "limitations": [
            "raw 원본의 정본 저장은 파일시스템 경로 유지 — MinIO/S3 왕복은 ORB-P0 증거(p0.json object_store)에서만 검증됨",
            "라이브 프로바이더 증명은 durable proof 마커(ingestion_run.metadata_json.live_provider_proof)가 아직 찍히지 않음"
            " — 본 증거는 실 응답 원본(provider 호스트 source_uri)이 객체·궤도해로 연결된 사실로만 판정한다",
            "워커(Celery) 잡 왕복 미증명 (ORB-P0 이월 한계, p0.json 참조)",
            "CI 워크플로는 파일로 존재하나 원격 실행 이력 없음 · 빈 머신 클린클론 부팅 재현은 별도 수행 필요 (ORB-P0 이월)",
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
