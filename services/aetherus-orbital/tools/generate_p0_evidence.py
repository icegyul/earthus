"""ORB-P0 증거 생성기 — 지시서의 'Required proof' 항목을 실제로 실행한다.

수기 값 금지: 각 항목은 라이브 인프라를 상대로 실행하고 그 결과만 기록한다.
실패는 숨기지 않는다 — 항목이 실패하면 gate 는 BLOCKED 이고 이유가 남는다.

실행: services/aetherus-orbital 에서
  .venv/Scripts/python tools/generate_p0_evidence.py
"""

import asyncio
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parents[1]
EVIDENCE_PATH = REPO_ROOT / "artifacts" / "evidence" / "p0.json"

MINIO_ENDPOINT = os.environ.get("AETHERUS_S3_ENDPOINT", "http://127.0.0.1:9010")
MINIO_KEY = os.environ.get("AETHERUS_S3_ACCESS_KEY", "aetherus")
MINIO_SECRET = os.environ.get("AETHERUS_S3_SECRET_KEY", "aetherus_dev_password")
BUCKET = "aetherus-p0-roundtrip"


def run(cmd: list[str], **kw) -> str:
    return subprocess.run(cmd, capture_output=True, text=True, check=True, **kw).stdout.strip()


def docker_exe() -> str:
    return shutil.which("docker") or "C:/Program Files/Docker/Docker/resources/bin/docker.exe"


def check_containers() -> dict:
    docker = docker_exe()
    out = {}
    for name in ("aetherus-postgres", "aetherus-redis", "aetherus-minio"):
        try:
            out[name] = {
                "health": run([docker, "inspect", "--format", "{{.State.Health.Status}}", name]),
                "image": run([docker, "inspect", "--format", "{{.Config.Image}}", name]),
            }
        except subprocess.CalledProcessError as exc:
            out[name] = {"health": None, "error": exc.stderr.strip()[:200]}
    return out


def check_object_store() -> dict:
    """S3 호환 스토리지에 쓰고 다시 읽어 해시가 일치하는지 확인한다."""
    try:
        import boto3
        from botocore.client import Config
    except ImportError as exc:
        return {"status": "UNAVAILABLE", "reason": f"boto3 missing: {exc}"}
    payload = b'{"aetherus":"p0-object-store-roundtrip"}'
    digest = hashlib.sha256(payload).hexdigest()
    try:
        client = boto3.client(
            "s3",
            endpoint_url=MINIO_ENDPOINT,
            aws_access_key_id=MINIO_KEY,
            aws_secret_access_key=MINIO_SECRET,
            config=Config(signature_version="s3v4"),
            region_name="us-east-1",
        )
        buckets = {b["Name"] for b in client.list_buckets().get("Buckets", [])}
        if BUCKET not in buckets:
            client.create_bucket(Bucket=BUCKET)
        key = f"{digest}.json"
        client.put_object(Bucket=BUCKET, Key=key, Body=payload)
        fetched = client.get_object(Bucket=BUCKET, Key=key)["Body"].read()
    except Exception as exc:  # noqa: BLE001
        return {"status": "FAILED", "reason": str(exc)[:300], "endpoint": MINIO_ENDPOINT}
    return {
        "status": "PASS" if hashlib.sha256(fetched).hexdigest() == digest else "FAILED",
        "endpoint": MINIO_ENDPOINT,
        "bucket": BUCKET,
        "written_sha256": digest,
        "read_back_sha256": hashlib.sha256(fetched).hexdigest(),
        "adapter": "boto3 S3 v4 signature against MinIO",
    }


async def check_redis() -> dict:
    """쓰기·읽기·만료가 실제로 동작하는지 확인한다."""
    try:
        from backend.config import settings
        from redis.asyncio import Redis
    except ImportError as exc:
        return {"status": "UNAVAILABLE", "reason": str(exc)}
    client = Redis.from_url(settings.redis_url)
    key = "aetherus:p0:probe"
    try:
        await client.set(key, "1", ex=1)
        immediate = await client.get(key)
        ttl = await client.ttl(key)
        await asyncio.sleep(1.3)
        expired = await client.get(key)
        return {
            "status": "PASS" if immediate == b"1" and expired is None else "FAILED",
            "write_read": immediate == b"1",
            "ttl_seconds_observed": ttl,
            "expired_after_ttl": expired is None,
        }
    except Exception as exc:  # noqa: BLE001
        return {"status": "FAILED", "reason": str(exc)[:300]}
    finally:
        await client.aclose()


async def check_migrations() -> dict:
    """마이그레이션 재실행이 안전한지(멱등) 확인한다."""
    from sqlalchemy import text

    from backend.database import get_db_session

    proc = subprocess.run(
        [sys.executable, "-m", "backend.migrations.migrate"],
        capture_output=True,
        text=True,
        cwd=str(SERVICE_ROOT),
    )
    async with get_db_session() as session:
        rows = (
            await session.execute(
                text("SELECT migration_name FROM schema_migrations ORDER BY migration_name")
            )
        ).scalars().all()
        tables = (
            await session.execute(
                text(
                    "SELECT table_schema, count(*) FROM information_schema.tables"
                    " WHERE table_schema IN ('public','aetherus_product')"
                    " GROUP BY table_schema ORDER BY table_schema"
                )
            )
        ).all()
    return {
        "rerun_exit_code": proc.returncode,
        "rerun_is_safe": proc.returncode == 0,
        "applied": list(rows),
        "table_counts": {schema: count for schema, count in tables},
    }


def check_health_endpoint() -> dict:
    """헬스가 의존성을 실제로 반영하는지(항상 200 아님) 확인한다."""
    try:
        with urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=8) as r:
            body = json.loads(r.read().decode("utf-8"))
        return {
            "http_status": r.status,
            "status": body.get("status"),
            "services": body.get("services"),
            "reports_dependencies": bool(body.get("services")),
        }
    except Exception as exc:  # noqa: BLE001
        return {"http_status": None, "error": str(exc)[:200]}


def check_tests() -> dict:
    files = [
        "tests/test_health.py",
        "tests/test_database.py",
        "tests/test_migrations.py",
        "tests/integration/test_p1_migration_schema.py",
    ]
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", *files, "-q", "--no-header", "-p", "no:logging"],
        capture_output=True,
        text=True,
        cwd=str(SERVICE_ROOT),
    )
    return {
        "command": "pytest <P0 subset> -q",
        "exit_code": proc.returncode,
        "summary": proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else "",
    }


def check_bootstrap_assets() -> dict:
    """클린 클론에서 필요한 문서·설정이 실재하는지 확인한다."""
    required = {
        "docker-compose.yml": SERVICE_ROOT / "docker-compose.yml",
        "README.md": SERVICE_ROOT / "README.md",
        "Makefile": SERVICE_ROOT / "Makefile",
        ".env.example": SERVICE_ROOT / ".env.example",
        "ci_workflow": SERVICE_ROOT / ".github/workflows/ci.yml",
        "requirements.txt": SERVICE_ROOT / "requirements.txt",
    }
    present = {name: path.exists() for name, path in required.items()}
    env_example = required[".env.example"]
    secretless = True
    if env_example.exists():
        for line in env_example.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("#") or "=" not in line:
                continue
            if line.split("=", 1)[1].strip():
                secretless = False
    return {"files_present": present, "env_example_has_no_secrets": secretless}


def main() -> None:
    object_store = check_object_store()
    redis_probe = asyncio.run(check_redis())
    migrations = asyncio.run(check_migrations())
    containers = check_containers()
    health = check_health_endpoint()
    tests = check_tests()
    bootstrap = check_bootstrap_assets()

    checks = {
        "infrastructure_healthy": all(
            entry.get("health") == "healthy" for entry in containers.values()
        ),
        "object_store_roundtrip": object_store.get("status") == "PASS",
        "redis_write_read_expiry": redis_probe.get("status") == "PASS",
        "migration_rerun_safe": migrations.get("rerun_is_safe", False),
        "health_reports_dependencies": health.get("reports_dependencies", False),
        "tests_pass": tests.get("exit_code") == 0,
        "bootstrap_assets_present": all(bootstrap["files_present"].values()),
        "env_example_secretless": bootstrap["env_example_has_no_secrets"],
    }
    failed = [name for name, ok in checks.items() if not ok]
    gate = "PASS" if not failed else "BLOCKED"

    evidence = {
        "phase": "p0",
        "orbital_phase": "ORB-P0",
        "gate": gate,
        "failed_checks": failed,
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "repository": run(["git", "-C", str(REPO_ROOT), "remote", "get-url", "origin"]),
        "branch": run(["git", "-C", str(REPO_ROOT), "rev-parse", "--abbrev-ref", "HEAD"]),
        "commit": run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"]),
        "checks": checks,
        "containers": containers,
        "object_store": object_store,
        "redis": redis_probe,
        "migrations": migrations,
        "health_endpoint": health,
        "tests": tests,
        "bootstrap": bootstrap,
        "limitations": [
            "워커(Celery) 서비스는 compose에 미기동 — 비과학 잡 왕복 증명은 후속",
            "CI는 워크플로 파일로 존재하나 이 저장소의 원격에서 실행된 이력은 아직 없음",
            "클린 클론 부팅은 문서·자산 존재로 확인했을 뿐, 빈 머신에서의 재현은 별도 수행 필요",
        ],
    }
    EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_PATH.write_text(
        json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"evidence written: {EVIDENCE_PATH}  gate={gate}")
    if failed:
        print("failed checks:", ", ".join(failed))


if __name__ == "__main__":
    main()
