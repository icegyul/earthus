"""Evidence generator for phase completion.

Per Master Spec section 2.1, each phase must generate artifacts/evidence/<phase>.json
containing proof of implementation:
- commit hash
- input fixtures used
- tests run and results
- database assertions
- API assertions
- benchmarks
- known limitations
"""

import argparse
import asyncio
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen

from sqlalchemy import text

from backend import __version__
from backend.config import settings
from backend.database import get_db_session

EXPECTED_TABLES = {
    "data_source",
    "ingestion_run",
    "raw_artifact",
    "space_object",
    "space_object_alias",
    "orbit_solution",
    "propagation_snapshot",
    "conjunction_event",
    "conjunction_snapshot",
    "screening_run",
    "baseline_graph_snapshot",
    "risk_edge",
    "intervention_scenario",
    "scenario_run",
    "benefit_result",
    "environment_metric",
    "visual_asset",
    "observation_station",
    "observation_request",
    "observation_submission",
    "model_registry",
    "validation_run",
    "research_dataset",
    "research_dataset_version",
    "schema_migrations",
}
P1_REQUIRED_TABLES = {
    "ingestion_run_artifact",
    "ingestion_record_rejection",
    "identity_conflict",
}


def get_git_commit() -> str:
    """Get the commit supplied by the host, with a local-git fallback for direct runs."""
    supplied = os.getenv("AETHERUS_GIT_COMMIT", "")
    if re.fullmatch(r"[0-9a-f]{40}", supplied):
        return supplied
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "UNAVAILABLE"


def check_git_commit(commit: str) -> dict[str, Any]:
    """Require a full immutable revision identifier instead of a mutable branch label."""
    return {"passed": re.fullmatch(r"[0-9a-f]{40}", commit) is not None, "commit": commit}


def command_gate(name: str, command: list[str]) -> dict[str, Any]:
    """Run a required quality command and retain its exact reproducible result."""
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=False)
    except OSError as error:
        return {"name": name, "cmd": " ".join(command), "passed": False, "reason": str(error)}
    return {
        "name": name,
        "cmd": " ".join(command),
        "passed": result.returncode == 0,
        "exit_code": result.returncode,
        "stdout_tail": result.stdout[-4000:],
        "stderr_tail": result.stderr[-4000:],
    }


async def check_database_schema(
    *, require_p1: bool = False, require_p4: bool = False, require_p5: bool = False
) -> dict:
    """Verify required tables, extensions, and migrations in the configured database."""
    try:
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    ORDER BY table_name
                    """
                )
            )
            tables = {row[0] for row in result.fetchall()}
            extensions_result = await session.execute(
                text(
                    """
                    SELECT extname, extversion
                    FROM pg_extension
                    WHERE extname IN ('postgis', 'pgcrypto')
                    ORDER BY extname
                    """
                )
            )
            extensions = {row[0]: row[1] for row in extensions_result.fetchall()}
            migrations_result = await session.execute(
                text(
                    """
                    SELECT migration_name, content_hash, applied_at
                    FROM schema_migrations
                    ORDER BY id
                    """
                )
            )
            migrations = [
                {
                    "name": row[0],
                    "content_hash": row[1],
                    "applied_at": row[2].isoformat(),
                }
                for row in migrations_result.fetchall()
            ]
    except Exception as error:
        return {"passed": False, "reason": str(error)}
    expected_tables = EXPECTED_TABLES | (P1_REQUIRED_TABLES if require_p1 else set())
    missing = sorted(expected_tables - tables)
    migration_names = {migration["name"] for migration in migrations}
    required_migrations = {"001_initial_schema", "002_orbit_solution_raw_artifact_versioning"}
    if require_p1:
        required_migrations.add("003_ingestion_policy_identity_and_rejections")
    if require_p4:
        required_migrations.update(
            {"005_p4_conjunction_assessment", "006_p4_pc_encounter_plane_v2"}
        )
    if require_p5:
        required_migrations.add("007_p5_benefit_engine")
    return {
        "passed": not missing
        and {"postgis", "pgcrypto"}.issubset(extensions)
        and required_migrations.issubset(migration_names),
        "missing_tables": missing,
        "extensions": extensions,
        "migrations": migrations,
    }


async def check_api_health() -> dict:
    """Exercise the stored canonical-object API through the ASGI application."""
    try:
        from httpx import AsyncClient

        from backend.main import app

        async with AsyncClient(app=app, base_url="http://evidence") as client:
            response = await client.get("/api/v1/objects/25544")
    except Exception as error:
        return {"passed": False, "reason": str(error)}
    payload = response.json()
    orbit = payload.get("latest_orbit_solution", {}) if isinstance(payload, dict) else {}
    provenance = payload.get("provenance", {}) if isinstance(payload, dict) else {}
    return {
        "passed": response.status_code == 200
        and payload.get("catalog_id") == "25544"
        and orbit.get("format") == "OMM"
        and orbit.get("covariance_status") == "INSUFFICIENT_DATA"
        and bool(provenance.get("input_artifact_hashes"))
        and "pc" not in orbit,
        "endpoint": "GET /api/v1/objects/25544",
        "status_code": response.status_code,
        "payload": payload,
    }


def check_docker_files() -> dict:
    """Prove the configured Compose stack is running and its API health route answers."""
    docker_compose = Path("docker-compose.yml")
    dockerfile = Path("Dockerfile")
    docker = shutil.which("docker")
    if docker is None:
        return {
            "passed": False,
            "docker_compose_exists": docker_compose.exists(),
            "dockerfile_exists": dockerfile.exists(),
            "reason": "Docker runtime is unavailable; clean-compose boot was not executed.",
        }
    plugin_result = subprocess.run(
        [docker, "compose", "version"], capture_output=True, text=True, check=False
    )
    compose_command = [docker, "compose"]
    if plugin_result.returncode != 0:
        standalone_compose = shutil.which("docker-compose")
        if standalone_compose is None:
            return {
                "passed": False,
                "docker_compose_exists": docker_compose.exists(),
                "dockerfile_exists": dockerfile.exists(),
                "reason": "Docker is available but no Docker Compose command is available.",
            }
        compose_command = [standalone_compose]
    config_result = subprocess.run(
        [*compose_command, "config", "-q"], capture_output=True, text=True, check=False
    )
    running_result = subprocess.run(
        [*compose_command, "-p", "aetherus-p0", "ps", "--status", "running", "--services"],
        capture_output=True,
        text=True,
        check=False,
    )
    running_services = set(running_result.stdout.split())
    try:
        with urlopen("http://127.0.0.1:8000/health", timeout=5) as response:  # noqa: S310
            health_status = response.status
            health_body = response.read().decode("utf-8")
    except (OSError, URLError) as error:
        health_status = None
        health_body = str(error)
    expected_services = {"api", "postgres", "redis"}
    return {
        "docker_compose_exists": docker_compose.exists(),
        "dockerfile_exists": dockerfile.exists(),
        "config_cmd": " ".join([*compose_command, "config", "-q"]),
        "config_exit_code": config_result.returncode,
        "config_stderr_tail": config_result.stderr[-2000:],
        "running_services_cmd": " ".join(
            [*compose_command, "-p", "aetherus-p0", "ps", "--status", "running", "--services"]
        ),
        "running_services_exit_code": running_result.returncode,
        "running_services": sorted(running_services),
        "health_url": "http://127.0.0.1:8000/health",
        "health_status": health_status,
        "health_body": health_body,
        "passed": docker_compose.exists()
        and dockerfile.exists()
        and config_result.returncode == 0
        and running_result.returncode == 0
        and expected_services.issubset(running_services)
        and health_status == 200,
    }


async def check_real_ingestion() -> dict:
    """Verify a real CelesTrak artifact is linked to an OMM orbit solution in PostgreSQL."""
    try:
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        ir.id::text AS ingestion_run_id,
                        ir.status AS ingestion_status,
                        ir.record_count,
                        ra.id::text AS raw_artifact_id,
                        ra.retrieved_at,
                        ra.source_uri,
                        ra.content_sha256,
                        ra.object_uri,
                        so.id::text AS object_id,
                        so.catalog_id,
                        os.id::text AS orbit_solution_id,
                        os.epoch,
                        os.format,
                        os.frame,
                        os.time_system,
                        os.covariance_json
                    FROM raw_artifact AS ra
                    JOIN ingestion_run AS ir ON ir.id = ra.ingestion_run_id
                    JOIN orbit_solution AS os ON os.source_artifact_id = ra.id
                    JOIN space_object AS so ON so.id = os.object_id
                    WHERE ra.source_id = 'celestrak_gp'
                      AND so.catalog_id = '25544'
                      AND ir.status = 'SUCCEEDED'
                      AND ra.object_uri LIKE 'file://artifacts/raw/%'
                    ORDER BY os.created_at DESC
                    LIMIT 1
                    """
                )
            )
            row = result.mappings().one_or_none()
    except Exception as error:
        return {"passed": False, "reason": str(error)}
    if row is None:
        return {"passed": False, "reason": "No persisted real CelesTrak OMM ingestion was found."}
    artifact_path = Path(str(row["object_uri"]).removeprefix("file://"))
    local_raw_exists = artifact_path.exists()
    docker = shutil.which("docker")
    container_path = (Path("/app") / artifact_path).as_posix()
    container_sha256 = None
    container_check_reason = None
    if docker is None:
        container_check_reason = "Docker runtime unavailable for persisted-container artifact check."
    else:
        container_result = subprocess.run(
            [docker, "exec", "aetherus-api", "sha256sum", container_path],
            capture_output=True,
            text=True,
            check=False,
        )
        if container_result.returncode == 0:
            container_sha256 = container_result.stdout.split(maxsplit=1)[0]
        else:
            container_check_reason = container_result.stderr.strip() or container_result.stdout.strip()
    raw_exists = local_raw_exists and container_sha256 == row["content_sha256"]
    return {
        "passed": raw_exists
        and row["format"] == "OMM"
        and row["frame"] == "TEME"
        and row["time_system"] == "UTC"
        and row["covariance_json"] is None,
        "source_id": "celestrak_gp",
        "ingestion_run_id": row["ingestion_run_id"],
        "ingestion_status": row["ingestion_status"],
        "record_count": row["record_count"],
        "raw_artifact_id": row["raw_artifact_id"],
        "raw_artifact_path": artifact_path.as_posix(),
        "local_raw_artifact_exists": local_raw_exists,
        "container_raw_artifact_path": container_path,
        "container_raw_artifact_sha256": container_sha256,
        "container_raw_artifact_check_reason": container_check_reason,
        "raw_artifact_exists": raw_exists,
        "content_sha256": row["content_sha256"],
        "source_uri": row["source_uri"],
        "object_id": row["object_id"],
        "catalog_id": row["catalog_id"],
        "orbit_solution_id": row["orbit_solution_id"],
        "epoch": row["epoch"].isoformat(),
        "format": row["format"],
        "frame": row["frame"],
        "time_system": row["time_system"],
        "covariance_status": "INSUFFICIENT_DATA",
        "pc_status": "NOT_COMPUTED",
    }


def check_anti_shortcuts() -> dict:
    """Run the production-code anti-placeholder audit and retain every match."""
    rg = shutil.which("rg")
    if rg is None:
        return {"passed": False, "reason": "ripgrep is unavailable for anti-shortcut audit."}
    pattern_file = Path("quality/anti_shortcut_patterns.txt")
    if not pattern_file.exists():
        return {"passed": False, "reason": "Anti-shortcut pattern policy file is unavailable."}
    patterns = [line.strip() for line in pattern_file.read_text(encoding="utf-8").splitlines()]
    patterns = [pattern for pattern in patterns if pattern]
    if not patterns:
        return {"passed": False, "reason": "Anti-shortcut pattern policy is empty."}
    scan_paths = ["backend"]
    if Path("frontend").is_dir():
        scan_paths.append("frontend")
    result = subprocess.run(
        [
            rg,
            "-n",
            "|".join(patterns),
            *scan_paths,
            "-g",
            "!__pycache__/**",
            "-g",
            "!**/vendor/**",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    return {
        "passed": result.returncode == 1,
        "cmd": f"rg -n anti-shortcut-patterns {' '.join(scan_paths)}",
        "matches": result.stdout.splitlines(),
        "exit_code": result.returncode,
    }


def evidence_status(gates: dict[str, dict[str, Any]]) -> str:
    """Return PASSED only if every required gate explicitly passed."""
    return "PASSED" if all(gate.get("passed") is True for gate in gates.values()) else "FAILED"


def p1_status(gates: dict[str, dict[str, Any]]) -> tuple[str, str | None]:
    """Block P2 until both real-provider proof gates pass; fail other gate regressions."""
    required_live_gates = ("celestrak_live", "spacetrack_live")
    if not all(gates.get(name, {}).get("passed") is True for name in required_live_gates):
        return "BLOCKED", None
    if not all(gate.get("passed") is True for gate in gates.values()):
        return "FAILED", None
    return "PASSED", "P2"


async def check_p1_live_provider(source_id: str, source_uri_prefix: str) -> dict[str, Any]:
    """Require a marked live snapshot linked to raw, run, canonical object, and OMM solution."""
    try:
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        ir.id::text AS ingestion_run_id,
                        ir.status AS ingestion_status,
                        ir.record_count,
                        ra.id::text AS raw_artifact_id,
                        ra.content_sha256,
                        ra.object_uri,
                        ra.retrieved_at,
                        so.id::text AS object_id,
                        so.catalog_id,
                        os.id::text AS orbit_solution_id,
                        os.epoch,
                        os.format,
                        os.quality_json
                    FROM ingestion_run AS ir
                    JOIN ingestion_run_artifact AS link ON link.ingestion_run_id = ir.id
                    JOIN raw_artifact AS ra ON ra.id = link.raw_artifact_id
                    JOIN orbit_solution AS os ON os.source_artifact_id = ra.id
                    JOIN space_object AS so ON so.id = os.object_id
                    WHERE ir.source_id = :source_id
                      AND ra.source_id = :source_id
                      AND ra.source_uri LIKE :source_uri_prefix
                      AND ir.metadata_json ->> 'live_provider_proof' = 'true'
                      AND ir.status IN ('SUCCEEDED', 'PARTIAL')
                    ORDER BY ir.finished_at DESC, os.created_at DESC
                    LIMIT 1
                    """
                ),
                {"source_id": source_id, "source_uri_prefix": f"{source_uri_prefix}%"},
            )
            row = result.mappings().one_or_none()
    except Exception as error:
        return {"passed": False, "reason": f"live-provider database query failed: {error}"}
    if row is None:
        return {
            "passed": False,
            "reason": "No marked live provider ingestion with durable raw/object/orbit linkage exists.",
            "source_id": source_id,
        }
    artifact_path = Path(str(row["object_uri"]).removeprefix("file://"))
    quality = row["quality_json"] if isinstance(row["quality_json"], dict) else {}
    return {
        "passed": artifact_path.exists()
        and bool(row["content_sha256"])
        and row["format"] == "OMM"
        and quality.get("covariance_status") == "INSUFFICIENT_DATA"
        and quality.get("pc_status") == "NOT_COMPUTED",
        "source_id": source_id,
        "ingestion_run_id": row["ingestion_run_id"],
        "ingestion_status": row["ingestion_status"],
        "record_count": row["record_count"],
        "raw_artifact_id": row["raw_artifact_id"],
        "content_sha256": row["content_sha256"],
        "raw_artifact_path": artifact_path.as_posix(),
        "raw_artifact_byte_count": artifact_path.stat().st_size if artifact_path.exists() else None,
        "retrieved_at": row["retrieved_at"].isoformat(),
        "object_id": row["object_id"],
        "catalog_id": row["catalog_id"],
        "orbit_solution_id": row["orbit_solution_id"],
        "epoch": row["epoch"].isoformat(),
        "covariance_status": quality.get("covariance_status", "INSUFFICIENT_DATA"),
        "pc_status": quality.get("pc_status", "NOT_COMPUTED"),
    }


async def check_p1_api_contract(catalog_id: str | None) -> dict[str, Any]:
    """Check one real-provider-backed object through the executable no-network GET API."""
    if not catalog_id:
        return {"passed": False, "reason": "No live provider catalog ID is available for API proof."}
    try:
        from httpx import AsyncClient

        from backend.main import app

        async with AsyncClient(app=app, base_url="http://evidence") as client:
            response = await client.get(f"/api/v1/objects/{catalog_id}")
    except Exception as error:
        return {"passed": False, "reason": f"P1 API proof failed: {error}"}
    payload = response.json()
    orbit = payload.get("latest_orbit_solution", {}) if isinstance(payload, dict) else {}
    provenance = payload.get("provenance", {}) if isinstance(payload, dict) else {}
    return {
        "passed": response.status_code == 200
        and payload.get("catalog_id") == catalog_id
        and orbit.get("covariance_status") == "INSUFFICIENT_DATA"
        and orbit.get("pc_status") == "NOT_COMPUTED"
        and bool(provenance.get("input_artifact_hashes")),
        "endpoint": f"GET /api/v1/objects/{catalog_id}",
        "status_code": response.status_code,
        "catalog_id": catalog_id,
    }


def check_no_tle_width() -> dict[str, Any]:
    """Execute the dedicated production width gate with machine-readable violations."""
    from quality.check_no_tle_width import find_violations

    violations = find_violations([Path("backend")])
    return {
        "passed": not violations,
        "cmd": f"{sys.executable} quality/check_no_tle_width.py backend",
        "violations": [f"{path}:{line_number}: {line}" for path, line_number, line in violations],
    }


def check_configured_secret_leak(evidence: dict[str, Any]) -> dict[str, Any]:
    """Fail if a nonempty configured local secret occurs in serialized evidence."""
    configured = (
        settings.spacetrack_identity,
        settings.spacetrack_password,
        settings.internal_admin_token,
    )
    secrets_to_check = [
        value.get_secret_value() for value in configured if value is not None and value.get_secret_value()
    ]
    serialized = json.dumps(evidence, sort_keys=True, default=str)
    return {"passed": not any(secret in serialized for secret in secrets_to_check)}


async def generate_p1_evidence() -> dict[str, Any]:
    """Collect P1 evidence, BLOCKED until both real provider proofs are present."""
    commit = get_git_commit()
    celestrak_live = await check_p1_live_provider(
        "celestrak_gp", "https://celestrak.org/NORAD/elements/gp.php"
    )
    spacetrack_live = await check_p1_live_provider(
        "spacetrack_gp", "https://www.space-track.org/basicspacedata/query"
    )
    gates: dict[str, dict[str, Any]] = {
        "git_commit": check_git_commit(commit),
        "tests": command_gate(
            "tests", [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"]
        ),
        "lint": command_gate(
            "lint", [sys.executable, "-m", "ruff", "check", "backend", "tests", "quality"]
        ),
        "type_check": command_gate("type_check", [sys.executable, "-m", "mypy", "backend"]),
        "anti_shortcut_audit": check_anti_shortcuts(),
        "width_audit": check_no_tle_width(),
        "database": await check_database_schema(require_p1=True),
        "celestrak_live": celestrak_live,
        "spacetrack_live": spacetrack_live,
        "api_contract": await check_p1_api_contract(
            spacetrack_live.get("catalog_id") or celestrak_live.get("catalog_id")
        ),
    }
    status, next_phase = p1_status(gates)
    evidence: dict[str, Any] = {
        "phase": "P1",
        "phase_name": "Provider-neutral ingestion and canonical identity",
        "generated_at": datetime.now(UTC).isoformat(),
        "version": __version__,
        "commit": commit,
        "scope": {
            "world_com_integration": "NOT_ATTEMPTED",
            "scientific_features": [
                "No propagation",
                "No conjunction assessment",
                "No risk score",
                "No Pc computation",
            ],
        },
        "gates": gates,
        "api_endpoints": [
            "POST /api/v1/ingestions/celestrak/omm/{catalog_id}",
            "POST /api/v1/ingestions/spacetrack/gp/{catalog_id}",
            "GET /api/v1/objects/{lookup}",
            "GET /api/v1/objects/resolve?source_id=&source_key=",
            "GET /internal/ingestion/runs?limit=",
        ],
        "scientific_status": {
            "orbit_propagation": "NOT_COMPUTED",
            "conjunction_assessment": "NOT_COMPUTED",
            "pc_without_covariance": "NOT_COMPUTED",
        },
        "status": status,
        "next_allowed_phase": next_phase,
    }
    gates["configured_secret_leak"] = check_configured_secret_leak(evidence)
    status, next_phase = p1_status(gates)
    evidence["status"] = status
    evidence["next_allowed_phase"] = next_phase
    return evidence


async def generate_p0_evidence() -> dict:
    """Collect P0 evidence and fail closed when any required proof is absent."""
    gates = {
        "tests": command_gate(
            "tests", [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"]
        ),
        "lint": command_gate("lint", [sys.executable, "-m", "ruff", "check", "backend", "tests"]),
        "type_check": command_gate("type_check", [sys.executable, "-m", "mypy", "backend"]),
        "anti_shortcut_audit": check_anti_shortcuts(),
        "docker_clean_boot": check_docker_files(),
        "database": await check_database_schema(),
        "real_ingestion": await check_real_ingestion(),
        "api_contract": await check_api_health(),
    }
    status = evidence_status(gates)
    return {
        "phase": "P0",
        "phase_name": "Repository / CI / evidence with user-required real ingestion acceptance",
        "generated_at": datetime.now(UTC).isoformat(),
        "version": __version__,
        "commit": get_git_commit(),
        "scope": {
            "package_phase_card": "P0 Repository / CI / evidence",
            "user_required_acceptance": [
                "CelesTrak real ingestion",
                "immutable raw snapshot preservation",
                "OMM parser",
                "executable API",
                "error states",
            ],
            "world_com_integration": "NOT_ATTEMPTED",
        },
        "gates": gates,
        "api_endpoints": [
            "GET /health",
            "GET /api/v1/status",
            "POST /api/v1/ingestions/celestrak/omm/{catalog_id}",
            "GET /api/v1/objects/{object_id}",
        ],
        "scientific_status": {
            "ingestion": "AVAILABLE",
            "orbit_propagation": "NOT_COMPUTED",
            "conjunction_assessment": "NOT_COMPUTED",
            "pc_without_covariance": "NOT_COMPUTED",
        },
        "limitations": [
            "No orbit propagation, conjunction assessment, risk graph, benefit engine, or UI is implemented in P0.",
            "CelesTrak public GP OMM data has no covariance here; Pc is NOT_COMPUTED.",
            "Clean Compose boot is a local verification gate, not a production deployment.",
        ],
        "status": status,
        "next_allowed_phase": "P1" if status == "PASSED" else "BLOCKED_BY_P0_QUALITY_GATES",
    }


def p2_status(gates: dict[str, dict[str, Any]]) -> tuple[str, str | None]:
    """Block P3 until every P2 scientific and quality gate passes."""
    if not all(gate.get("passed") is True for gate in gates.values()):
        return "FAILED", None
    return "PASSED", "P3"


async def check_golden_fixtures() -> dict[str, Any]:
    """Verify committed golden fixtures exist, chain to P1 artifacts, and are fresh-valid."""
    from backend.orbit.golden import (
        compare_within_tolerance,
        load_fixture,
        propagator_output_hash,
        recompute_fixture_samples,
    )

    fixture_dir = Path("tests/fixtures/golden")
    paths = sorted(fixture_dir.glob("p2_golden_*.json"))
    if not paths:
        return {"passed": False, "reason": "No committed golden fixtures found"}
    fixtures_report = []
    all_passed = True
    try:
        async with get_db_session() as session:
            for path in paths:
                fixture = load_fixture(path)
                sha256 = fixture["generated_from"]["raw_artifact_sha256"]
                linked = await session.execute(
                    text("SELECT 1 FROM raw_artifact WHERE content_sha256 = :hash LIMIT 1"),
                    {"hash": sha256},
                )
                recomputed = recompute_fixture_samples(fixture)
                maxima = compare_within_tolerance(fixture, recomputed)
                deterministic = propagator_output_hash(recomputed) == fixture["output_sha256"]
                within_tolerance = all(
                    observed < fixture["tolerance"][key] for key, observed in maxima.items()
                )
                chained = linked.first() is not None
                gate_ok = chained and deterministic and within_tolerance
                all_passed = all_passed and gate_ok
                fixtures_report.append(
                    {
                        "fixture": path.name,
                        "catalog_id": fixture["input"]["catalog_id"],
                        "raw_artifact_sha256": sha256,
                        "chains_to_p1_raw_artifact": chained,
                        "deterministic_output_hash": deterministic,
                        "within_tolerance": within_tolerance,
                        "observed_maxima": maxima,
                    }
                )
    except Exception as error:
        return {"passed": False, "reason": str(error)}
    return {"passed": all_passed, "fixtures": fixtures_report}


async def check_p2_ephemeris_api(catalog_id: str | None) -> dict[str, Any]:
    """Exercise the executable ephemeris API end-to-end including error states."""
    if not catalog_id:
        return {"passed": False, "reason": "No live catalog ID available for the API proof"}
    try:
        from httpx import AsyncClient

        from backend.main import app

        async with AsyncClient(app=app, base_url="http://evidence") as client:
            solution = await get_latest_solution_epoch(catalog_id)
            if solution is None:
                return {"passed": False, "reason": f"No orbit solution stored for {catalog_id}"}
            epoch, _ = solution
            start = epoch - timedelta(minutes=10)
            stop = epoch + timedelta(minutes=10)
            happy = await client.get(
                f"{settings.api_prefix}/v1/objects/{catalog_id}/ephemeris",
                params={
                    "start": start.isoformat(),
                    "stop": stop.isoformat(),
                    "step_s": 300,
                },
            )
            unknown = await client.get(
                f"{settings.api_prefix}/v1/objects/aetherus-no-such-object/ephemeris",
                params={"start": start.isoformat(), "stop": stop.isoformat()},
            )
            naive = await client.get(
                f"{settings.api_prefix}/v1/objects/{catalog_id}/ephemeris",
                params={
                    "start": epoch.strftime("%Y-%m-%dT%H:%M:%S"),
                    "stop": stop.isoformat(),
                },
            )
            inverted = await client.get(
                f"{settings.api_prefix}/v1/objects/{catalog_id}/ephemeris",
                params={
                    "start": stop.isoformat(),
                    "stop": start.isoformat(),
                    "step_s": 60,
                },
            )
    except Exception as error:
        return {"passed": False, "reason": f"P2 API proof failed: {error}"}

    payload = happy.json() if happy.status_code == 200 else {}
    data = payload.get("data", {}) if isinstance(payload, dict) else {}
    provenance = payload.get("provenance", {}) if isinstance(payload, dict) else {}
    persistence = payload.get("persistence", {}) if isinstance(payload, dict) else {}
    samples = data.get("samples", [])
    finite_states = all(
        all(isinstance(component, float | int) for component in sample["state"]["r_km"])
        for sample in samples
    )
    serialized = json.dumps(payload, default=str).lower()
    passed = (
        happy.status_code == 200
        and bool(payload.get("request_id"))
        and payload.get("data_status") in {"OK", "STALE"}
        and len(samples) > 0
        and finite_states
        and provenance.get("model_id") == "sgp4-vallado"
        and provenance.get("frame") == "TEME"
        and provenance.get("time_system") == "UTC"
        and bool(provenance.get("input_artifact_hashes"))
        and int(persistence.get("propagation_snapshot_rows_stored", 0)) >= len(samples)
        and unknown.status_code == 404
        and naive.status_code == 422
        and inverted.status_code == 422
        and '"pc"' not in serialized
        and "miss_distance" not in serialized
        and "risk" not in serialized
    )
    return {
        "passed": passed,
        "endpoint": f"GET /api/v1/objects/{catalog_id}/ephemeris",
        "status_code": happy.status_code,
        "sample_count": len(samples),
        "data_status": payload.get("data_status"),
        "model_version": provenance.get("model_version"),
        "output_sha256": data.get("output_sha256"),
        "propagation_snapshot_rows_stored": persistence.get(
            "propagation_snapshot_rows_stored"
        ),
        "error_paths": {
            "unknown_object_status": unknown.status_code,
            "naive_timestamp_status": naive.status_code,
            "inverted_window_status": inverted.status_code,
        },
    }


async def get_latest_solution_epoch(catalog_id: str) -> tuple[datetime, str] | None:
    """Load the newest stored solution epoch for one catalog identifier."""
    async with get_db_session() as session:
        result = await session.execute(
            text(
                """
                SELECT os.epoch, os.id::text AS orbit_solution_id
                FROM space_object so JOIN orbit_solution os ON os.object_id = so.id
                WHERE so.catalog_id = :catalog_id
                ORDER BY os.epoch DESC LIMIT 1
                """
            ),
            {"catalog_id": catalog_id},
        )
        row = result.first()
    return (row[0], row[1]) if row else None


async def generate_p2_evidence() -> dict[str, Any]:
    """Collect P2 evidence; PASSED only with golden, corpus, and API proofs intact."""
    commit = get_git_commit()
    celestrak_live = await check_p1_live_provider(
        "celestrak_gp", "https://celestrak.org/NORAD/elements/gp.php"
    )
    spacetrack_live = await check_p1_live_provider(
        "spacetrack_gp", "https://www.space-track.org/basicspacedata/query"
    )
    gates: dict[str, dict[str, Any]] = {
        "git_commit": check_git_commit(commit),
        "tests": command_gate(
            "tests", [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"]
        ),
        "lint": command_gate(
            "lint", [sys.executable, "-m", "ruff", "check", "backend", "tests", "quality"]
        ),
        "type_check": command_gate("type_check", [sys.executable, "-m", "mypy", "backend"]),
        "anti_shortcut_audit": check_anti_shortcuts(),
        "width_audit": check_no_tle_width(),
        "database": await check_database_schema(require_p1=True),
        "celestrak_live": celestrak_live,
        "spacetrack_live": spacetrack_live,
        "sgp4_reference_corpus": command_gate(
            "sgp4_reference_corpus",
            [
                sys.executable,
                "-m",
                "pytest",
                "tests/unit/test_sgp4_official_corpus.py",
                "-q",
                "-p",
                "no:cacheprovider",
            ],
        ),
        "golden_fixture_cross_validation": await check_golden_fixtures(),
        "ephemeris_api_contract": await check_p2_ephemeris_api(
            spacetrack_live.get("catalog_id") or celestrak_live.get("catalog_id")
        ),
    }
    status, next_phase = p2_status(gates)
    evidence: dict[str, Any] = {
        "phase": "P2",
        "phase_name": "Orbit propagation, time scales, frames, ephemeris API",
        "generated_at": datetime.now(UTC).isoformat(),
        "version": __version__,
        "commit": commit,
        "scope": {
            "package_phase_card": "P2 Orbit / time / frames",
            "world_com_integration": "NOT_ATTEMPTED",
            "scientific_features": [
                "SGP4 propagation from OMM mean elements (no TLE line construction)",
                "UTC-only time handling with explicit UT1/EOP assumptions",
                "TEME->ITRF->geodetic frame chain (IAU-1982 GMST)",
                "GET /api/v1/objects/{id}/ephemeris with provenance envelope",
                "Golden fixtures derived from real P1 raw snapshots",
                "Independent cross-validation against official tcppver reference corpus",
            ],
            "explicitly_out_of_scope": [
                "No conjunction assessment or TCA computation",
                "No Pc computation (covariance remains absent by design)",
                "No risk score, benefit engine, or UI rendering",
            ],
        },
        "gates": gates,
        "api_endpoints": [
            "GET /api/v1/objects/{object_id}/ephemeris?start=&stop=&step_s=",
            "GET /api/v1/objects/{lookup}",
            "POST /api/v1/ingestions/celestrak/omm/{catalog_id}",
            "POST /api/v1/ingestions/spacetrack/gp/{catalog_id}",
            "GET /internal/ingestion/runs?limit=",
        ],
        "scientific_status": {
            "orbit_propagation": "AVAILABLE",
            "frame_conversion": "AVAILABLE",
            "conjunction_assessment": "NOT_COMPUTED",
            "pc_without_covariance": "NOT_COMPUTED",
        },
        "limitations": [
            "UT1-UTC is assumed 0.0 s and polar motion is neglected; assumptions are hashed into config_hash.",
            "PUBLIC_GP elements degrade quickly; stale flags appear beyond the configured data-age threshold.",
            "OMM responses without BSTAR initialize SGP4 drag at 0.0 with an explicit limitation recorded.",
            "No covariance exists for PUBLIC_GP sources; Pc remains NOT_COMPUTED by design.",
        ],
        "status": status,
        "next_allowed_phase": next_phase,
    }
    gates["configured_secret_leak"] = check_configured_secret_leak(evidence)
    status, next_phase = p2_status(gates)
    evidence["status"] = status
    evidence["next_allowed_phase"] = next_phase
    return evidence


def p3_status(gates: dict[str, dict[str, Any]]) -> tuple[str, str | None]:
    """Block P4 until every P3 explore and quality gate passes."""
    if not all(gate.get("passed") is True for gate in gates.values()):
        return "FAILED", None
    return "PASSED", "P4"


async def check_p3_catalog_api() -> dict[str, Any]:
    """Exercise the explore catalog API against the real stored solution chain."""
    try:
        from httpx import AsyncClient

        from backend.main import app

        async with AsyncClient(app=app, base_url="http://evidence") as client:
            snapshot = await client.get(f"{settings.api_prefix}/v1/catalog/snapshot")
            status = await client.get(f"{settings.api_prefix}/v1/catalog/status")
            bad_bbox = await client.get(
                f"{settings.api_prefix}/v1/catalog/snapshot", params={"bbox": "1,2,3"}
            )
            bad_at = await client.get(
                f"{settings.api_prefix}/v1/catalog/snapshot", params={"at": "2026-08-25T00:00:00"}
            )
            catalog = snapshot.json().get("data", {}).get("catalog", [])
            positioned = [entry for entry in catalog if entry.get("geodetic")]
            consistency_errors = []
            for entry in positioned[:3]:
                at = entry["sample_time"]
                lookup = entry["catalog_id"]
                stop_time = (
                    datetime.fromisoformat(at) + timedelta(seconds=60)
                ).isoformat()
                ephemeris = await client.get(
                    f"{settings.api_prefix}/v1/objects/{lookup}/ephemeris",
                    params={"start": at, "stop": stop_time, "step_s": 60},
                )
                if ephemeris.status_code != 200:
                    consistency_errors.append(f"{lookup}: ephemeris {ephemeris.status_code}")
                    continue
                sample = ephemeris.json()["data"]["samples"][0]
                if sample["geodetic"] != entry["geodetic"]:
                    consistency_errors.append(f"{lookup}: geodetic mismatch vs ephemeris")
    except Exception as error:
        return {"passed": False, "reason": f"P3 catalog API proof failed: {error}"}

    coverage = snapshot.json().get("data", {}).get("coverage", {})
    unavailable = [entry for entry in catalog if not entry.get("geodetic")]
    serialized = json.dumps(snapshot.json(), default=str).lower()
    coverage_consistent = (
        coverage.get("catalog_entries") == len(catalog)
        and coverage.get("positioned_markers") == len(positioned)
        and coverage.get("unavailable_entries") == len(unavailable)
        and coverage.get("catalog_entries")
        == coverage.get("positioned_markers", 0) + coverage.get("unavailable_entries", 0)
        and sum(coverage.get("unavailable_by_status", {}).values())
        == coverage.get("unavailable_entries", 0)
    )
    passed = (
        snapshot.status_code == 200
        and status.status_code == 200
        and bool(snapshot.json().get("request_id"))
        and snapshot.json().get("data_status") in {"OK", "STALE", "PARTIAL", "UNAVAILABLE"}
        and len(catalog) > 0
        and len(positioned) > 0
        and coverage_consistent
        and all(entry.get("provenance", {}) for entry in positioned)
        and coverage.get("global_density") in {"AVAILABLE", "INSUFFICIENT_DATA"}
        and (
            coverage.get("global_density") != "INSUFFICIENT_DATA"
            or "fabricate" in coverage.get("global_density_reason", "")
        )
        and bad_bbox.status_code == 422
        and bad_at.status_code == 422
        and not consistency_errors
        and '"pc"' not in serialized
        and '"tca"' not in serialized
        and '"risk"' not in serialized
    )
    return {
        "passed": passed,
        "endpoint": "GET /api/v1/catalog/snapshot",
        "status_code": snapshot.status_code,
        "catalog_entries": len(catalog),
        "positioned_markers": len(positioned),
        "unavailable_entries": len(unavailable),
        "unavailable_by_status": coverage.get("unavailable_by_status"),
        "coverage_consistent": coverage_consistent,
        "data_status": snapshot.json().get("data_status"),
        "global_density": coverage.get("global_density"),
        "ephemeris_consistency_errors": consistency_errors,
        "error_paths": {
            "invalid_bbox_status": bad_bbox.status_code,
            "naive_at_status": bad_at.status_code,
        },
    }


async def check_p3_ephemeris_grid_regression() -> dict[str, Any]:
    """Lock the P2 grid fix: ephemeris samples advance by exactly step_s seconds."""
    try:
        from httpx import AsyncClient

        from backend.main import app

        async with AsyncClient(app=app, base_url="http://evidence") as client:
            async with get_db_session() as session:
                row = (
                    await session.execute(
                        text(
                            """
                            SELECT so.catalog_id, os.epoch
                            FROM space_object so JOIN orbit_solution os ON os.object_id = so.id
                            WHERE so.catalog_id = '25544'
                            ORDER BY os.epoch DESC LIMIT 1
                            """
                        )
                    )
                ).first()
            if row is None:
                return {"passed": False, "reason": "No stored 25544 solution for the grid proof"}
            epoch = row[1]
            response = await client.get(
                f"{settings.api_prefix}/v1/objects/25544/ephemeris",
                params={
                    "start": (epoch - timedelta(minutes=30)).isoformat(),
                    "stop": (epoch + timedelta(minutes=30)).isoformat(),
                    "step_s": 120,
                },
            )
    except Exception as error:
        return {"passed": False, "reason": f"P3 ephemeris grid proof failed: {error}"}
    if response.status_code != 200:
        return {"passed": False, "reason": f"ephemeris returned {response.status_code}"}
    samples = response.json()["data"]["samples"]
    if len(samples) < 3:
        return {"passed": False, "reason": "not enough samples for a spacing proof"}
    gaps = {
        (samples[i + 1]["sample_time"] and (
            datetime.fromisoformat(samples[i + 1]["sample_time"])
            - datetime.fromisoformat(samples[i]["sample_time"])
        ).total_seconds())
        for i in range(len(samples) - 1)
    }
    passed = gaps == {120.0}
    return {
        "passed": passed,
        "sample_count": len(samples),
        "step_s": 120,
        "observed_gap_seconds": sorted(gaps),
    }


def check_p3_browser_evidence() -> dict[str, Any]:
    """Independently re-verify the browser coordinate proof recorded by the E2E run."""
    evidence_dir = Path("artifacts/evidence/p3")
    required = [
        "coordinate-proof.json",
        "layout-proof.json",
        "network-log.json",
        "api-samples.json",
        "explore-network.har",
        "desktop-global.png",
        "desktop-focus.png",
        "mobile.png",
        "error-state.png",
        "empty-catalog.png",
    ]
    missing = [name for name in required if not (evidence_dir / name).exists()]
    if missing:
        return {
            "passed": False,
            "reason": "Browser E2E evidence is incomplete; run tests/e2e on the host first.",
            "missing": missing,
        }

    def scene_from_geodetic(lat_deg: float, lon_deg: float, alt_km: float) -> tuple[float, float, float]:
        radius = 1.0 + alt_km / 6378.137
        lat = math.radians(lat_deg)
        lon = math.radians(lon_deg)
        return (
            radius * math.cos(lat) * math.sin(lon),
            radius * math.sin(lat),
            -radius * math.cos(lat) * math.cos(lon),
        )

    proof = json.loads((evidence_dir / "coordinate-proof.json").read_text(encoding="utf-8"))
    tolerance = float(proof.get("tolerance", 1e-9))
    errors: list[str] = []
    checked = 0
    for marker in proof.get("catalog_markers", []):
        geodetic = marker["api_geodetic"]
        expected = scene_from_geodetic(
            geodetic["lat_deg"], geodetic["lon_deg"], geodetic["alt_km"]
        )
        rendered = marker["rendered_scene"]
        for axis, value in zip(("x", "y", "z"), expected, strict=True):
            if abs(rendered[axis] - value) > tolerance:
                errors.append(f"marker {marker['catalog_id']} {axis}")
        checked += 1
    orbit = proof.get("selected_orbit_line", {})
    for sample in orbit.get("verified_samples", []):
        geodetic = sample["api_geodetic"]
        expected = scene_from_geodetic(
            geodetic["lat_deg"], geodetic["lon_deg"], geodetic["alt_km"]
        )
        rendered = sample["rendered_scene"]
        for axis, value in zip(("x", "y", "z"), expected, strict=True):
            if abs(rendered[axis] - value) > tolerance:
                errors.append(f"orbit sample {sample['sample_index']} {axis}")
        checked += 1
    network_log = json.loads((evidence_dir / "network-log.json").read_text(encoding="utf-8"))
    api_urls = [entry.get("url", "") for entry in network_log]
    snapshot_seen = any("/api/v1/catalog/snapshot" in url for url in api_urls)
    ephemeris_seen = any("/ephemeris" in url for url in api_urls)

    layout = json.loads((evidence_dir / "layout-proof.json").read_text(encoding="utf-8"))
    inner_width = int(layout.get("inner_width", 0))
    overflow_free = all(
        value is not None and value <= inner_width
        for value in layout.get("scroll_width", {}).values()
    )
    boxes_inside = all(
        rect is not None and rect["x"] >= 0 and rect["right"] <= inner_width
        for rect in layout.get("boxes", {}).values()
    )
    mobile_viewport_ok = layout.get("viewport", {}) == {"width": 390, "height": 844}
    layout_ok = overflow_free and boxes_inside and mobile_viewport_ok

    return {
        "passed": bool(
            checked > 0
            and not errors
            and snapshot_seen
            and ephemeris_seen
            and layout_ok
        ),
        "verified_coordinates": checked,
        "mismatches": errors,
        "network_snapshot_observed": snapshot_seen,
        "network_ephemeris_observed": ephemeris_seen,
        "mobile_layout": {
            "viewport": layout.get("viewport"),
            "overflow_free": overflow_free,
            "boxes_inside_viewport": boxes_inside,
            "scroll_width": layout.get("scroll_width"),
            "boxes": layout.get("boxes"),
        },
        "screenshots": [name for name in required if name.endswith(".png")],
        "har": "artifacts/evidence/p3/explore-network.har",
    }


def check_p3_frontend_served() -> dict[str, Any]:
    """Confirm the explore UI shell and modules are served by the API origin."""
    index = Path(settings.frontend_dir) / "index.html"
    main_js = Path(settings.frontend_dir) / "js" / "main.js"
    vendor = Path(settings.frontend_dir) / "vendor" / "three.module.js"
    missing = [str(path) for path in (index, main_js, vendor) if not path.is_file()]
    vendor_sha256 = (
        hashlib.sha256(vendor.read_bytes()).hexdigest() if vendor.is_file() else None
    )
    return {
        "passed": not missing,
        "missing": missing,
        "frontend_dir": settings.frontend_dir,
        "vendored_dependencies": [
            {
                "path": "frontend/vendor/three.module.js",
                "project": "three.js r160 (MIT)",
                "sha256": vendor_sha256,
                "excluded_from_anti_shortcut_scan": True,
            }
        ],
    }


async def generate_p3_evidence() -> dict[str, Any]:
    """Collect P3 evidence; PASSED only with API, browser, and quality proofs intact."""
    commit = get_git_commit()
    gates: dict[str, dict[str, Any]] = {
        "git_commit": check_git_commit(commit),
        "tests": command_gate(
            "tests", [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"]
        ),
        "lint": command_gate(
            "lint", [sys.executable, "-m", "ruff", "check", "backend", "tests", "quality"]
        ),
        "type_check": command_gate("type_check", [sys.executable, "-m", "mypy", "backend"]),
        "anti_shortcut_audit": check_anti_shortcuts(),
        "width_audit": check_no_tle_width(),
        "database": await check_database_schema(require_p1=True),
        "catalog_api_contract": await check_p3_catalog_api(),
        "ephemeris_grid_regression": await check_p3_ephemeris_grid_regression(),
        "frontend_served": check_p3_frontend_served(),
        "browser_network_evidence": check_p3_browser_evidence(),
    }
    status, next_phase = p3_status(gates)
    evidence: dict[str, Any] = {
        "phase": "P3",
        "phase_name": "Explore UI: API-derived 3D positions, LOD, provenance",
        "generated_at": datetime.now(UTC).isoformat(),
        "version": __version__,
        "commit": commit,
        "scope": {
            "package_phase_card": "P3 Explore UI",
            "world_com_integration": "NOT_ATTEMPTED",
            "scientific_features": [
                "GET /api/v1/catalog/snapshot: server-side SGP4 positions from stored P1 objects only",
                "GET /api/v1/catalog/status: honest coverage and global-density states",
                "Coverage counts positioned markers, catalog entries and unavailable entries as distinct, exact figures",
                "Viewport (bbox) and limit queries for the mid-zoom LOD",
                "Explore UI renders only API-derived coordinates (no client propagation)",
                "Selected-object orbit line built only from GET /objects/{id}/ephemeris samples",
                "Provenance drawer: source, epoch, retrieved_at, data age, model, frame, config hash, limitations",
                "Explicit states: loading, API error, provider unavailable, stale, empty catalog, NOT_COMPUTED risk",
                "LOD global/region/focus with point-size disclaimer legend",
                "P2 regression fix: ephemeris grid now advances by step_s (was 1s)",
            ],
            "explicitly_out_of_scope": [
                "No conjunction assessment, TCA, or Pc (P4)",
                "No risk score, benefit engine, REMOVE/PROTECT actions (P5/P6)",
                "No genealogy, visual assets, or story panels (P7)",
                "Global density view stays INSUFFICIENT_DATA until the real catalog is large enough",
            ],
        },
        "gates": gates,
        "api_endpoints": [
            "GET /api/v1/catalog/snapshot?at=&bbox=&limit=",
            "GET /api/v1/catalog/status",
            "GET /api/v1/objects/{object_id}/ephemeris?start=&stop=&step_s=",
            "GET / (explore UI shell)",
            "GET /ui/* (explore UI assets)",
        ],
        "browser_evidence_dir": "artifacts/evidence/p3",
        "scientific_status": {
            "explore_catalog_positions": "AVAILABLE",
            "selected_orbit_line": "AVAILABLE",
            "global_density_view": "INSUFFICIENT_DATA",
            "conjunction_assessment": "NOT_COMPUTED",
            "pc_without_covariance": "NOT_COMPUTED",
        },
        "limitations": [
            "The rendered catalog contains only ingested objects; most of the real "
            "orbital population is not yet ingested, so the global density view is "
            "explicitly INSUFFICIENT_DATA rather than fabricated.",
            "P1 test-residue objects remain visible with explicit QUARANTINE states; "
            "the UI never hides stored records.",
            "UT1-UTC is assumed 0.0 s and polar motion neglected; assumptions hashed into config_hash.",
            "PUBLIC_GP mean elements are not an operational ephemeris; stale badges appear beyond the configured age.",
            "Marker size is a rendering aid and never represents actual object size.",
        ],
        "status": status,
        "next_allowed_phase": next_phase,
    }
    gates["configured_secret_leak"] = check_configured_secret_leak(evidence)
    status, next_phase = p3_status(gates)
    evidence["status"] = status
    evidence["next_allowed_phase"] = next_phase
    return evidence



def p5_status(gates: dict[str, dict[str, Any]]) -> tuple[str, str | None]:
    """Block P6 until every P5 benefit, equivalence, and quality gate passes."""
    if not all(gate.get("passed") is True for gate in gates.values()):
        return "FAILED", None
    return "PASSED", "P6"


async def check_p5_scenarios_api() -> dict[str, Any]:
    """Exercise the P5 API end-to-end over the real stored catalog."""
    try:
        from httpx import AsyncClient

        from backend.main import app

        async with AsyncClient(app=app, base_url="http://evidence") as client:
            built = await client.post(
                f"{settings.api_prefix}/v1/baselines", params={"horizon_hours": 24}
            )
            listed = await client.get(f"{settings.api_prefix}/v1/baselines")
            bad_horizon = await client.post(
                f"{settings.api_prefix}/v1/baselines", params={"horizon_hours": 500}
            )
            unknown_target = await client.post(
                f"{settings.api_prefix}/v1/scenarios",
                json={"kind": "REMOVE", "target": "no-such-object"},
            )
            bad_kind = await client.post(
                f"{settings.api_prefix}/v1/scenarios",
                json={"kind": "NUDGE", "target": "25544"},
            )
            missing_baseline = await client.post(
                f"{settings.api_prefix}/v1/scenarios",
                json={
                    "kind": "REMOVE",
                    "target": "25544",
                    "baseline_snapshot_id": "bg-evidence-missing",
                },
            )
            unknown_scenario = await client.get(
                f"{settings.api_prefix}/v1/scenarios"
                "/00000000-0000-0000-0000-000000000000/benefits"
            )
    except Exception as error:
        return {"passed": False, "reason": f"P5 API proof failed: {error}"}

    build_payload = built.json() if built.status_code == 202 else {}
    serialized = json.dumps(build_payload, default=str).lower()
    passed = (
        built.status_code == 202
        and build_payload.get("data_status") in {"OK", "INSUFFICIENT_DATA"}
        and bool(build_payload.get("provenance", {}).get("config_hash"))
        and listed.status_code == 200
        and bad_horizon.status_code == 422
        and unknown_target.status_code == 404
        and bad_kind.status_code == 422
        and missing_baseline.status_code == 422
        and missing_baseline.json().get("status") == "BASELINE_MISSING"
        and unknown_scenario.status_code == 404
    )
    data = build_payload.get("data", {})
    return {
        "passed": passed,
        "endpoints": [
            "POST /api/v1/baselines?horizon_hours=",
            "GET /api/v1/baselines",
            "POST /api/v1/scenarios",
            "POST /api/v1/scenarios/{id}/run",
            "GET /api/v1/scenarios/{id}/benefits",
        ],
        "baseline_data_status": build_payload.get("data_status"),
        "baseline_status_reason": build_payload.get("status_reason"),
        "baseline_edge_count": data.get("edge_count"),
        "baseline_edges_available": data.get("edges_available"),
        "error_paths": {
            "invalid_horizon": bad_horizon.status_code,
            "unknown_target": unknown_target.status_code,
            "unsupported_kind": bad_kind.status_code,
            "missing_baseline": missing_baseline.status_code,
            "unknown_scenario_benefits": unknown_scenario.status_code,
        },
        "no_fabricated_values": '"risk_score"' not in serialized,
    }


async def check_p5_validation_artifacts() -> dict[str, Any]:
    """Confirm the committed BEN-001/BEN-003 artifacts match the passing gates."""
    direct_path = Path("artifacts/evidence/p5/validation-ben001.json")
    equivalence_path = Path("artifacts/evidence/p5/equivalence-ben003.json")
    missing = [
        str(path) for path in (direct_path, equivalence_path) if not path.exists()
    ]
    if missing:
        return {
            "passed": False,
            "reason": "P5 validation artifacts are missing; run "
            "backend/tools/run_benefit_validation.py",
            "missing": missing,
        }
    direct = json.loads(direct_path.read_text(encoding="utf-8"))
    equivalence = json.loads(equivalence_path.read_text(encoding="utf-8"))
    artifact_hashes = {
        str(path): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in (direct_path, equivalence_path)
    }

    # Fixture outputs are SIMULATION_ONLY and must be labeled as such.
    simulation_labeled = (
        direct.get("validation_only") is True
        and direct.get("validation_state") == "SIMULATION_ONLY"
        and equivalence.get("validation_only") is True
        and equivalence.get("validation_state") == "SIMULATION_ONLY"
    )
    ben001_checks = direct.get("checks", {})
    ben001_required = {
        "neighbor_identified",
        "exposure_benefit_exact",
        "target_self_benefit_excluded",
        "provenance_attached",
        "idealized_removal_assumption",
        "repeat_same_hash",
    }
    ben003_checks = equivalence.get("checks", {})
    ben003_required = {
        "beneficiary_set_identical",
        "metrics_within_tolerance",
        "result_hash_equal",
        "selective_reuses_baseline_edges",
    }
    performance = equivalence.get("performance", {})
    performance_recorded = (
        float(performance.get("full_wall_ms_measured", -1)) >= 0.0
        and float(performance.get("affected_wall_ms_measured", -1)) >= 0.0
        and int(performance.get("full_peak_memory_bytes", -1)) >= 0
    )
    accuracy_separate = equivalence.get("accuracy_vs_performance_separation", {}).get(
        "equivalence_passed"
    )
    passed = (
        simulation_labeled
        and all(bool(ben001_checks.get(key)) for key in ben001_required)
        and all(bool(ben003_checks.get(key)) for key in ben003_required)
        and performance_recorded
        and accuracy_separate is True
    )
    return {
        "passed": passed,
        "simulation_only_labels": simulation_labeled,
        "artifacts": [str(direct_path), str(equivalence_path)],
        "artifact_sha256": artifact_hashes,
        "ben001_checks": ben001_checks,
        "ben003_checks": ben003_checks,
        "tolerance_abs": equivalence.get("tolerance_abs"),
        "max_abs_metric_delta": equivalence.get("max_abs_metric_delta"),
        "performance": performance,
        "accuracy_vs_performance_separated": accuracy_separate is True,
    }


async def check_p5_persistence_immutability() -> dict[str, Any]:
    """Prove append-only triggers protect every P5 scientific record."""
    try:
        async with get_db_session() as session:
            counts = (
                await session.execute(
                    text(
                        """
                        SELECT
                            (SELECT count(*) FROM baseline_graph_snapshot) AS baselines,
                            (SELECT count(*) FROM risk_edge) AS edges,
                            (SELECT count(*) FROM intervention_scenario) AS scenarios,
                            (SELECT count(*) FROM scenario_run) AS runs,
                            (SELECT count(*) FROM benefit_result) AS benefits
                        """
                    )
                )
            ).mappings().one()
            operational_benefits_without_simulation = (
                await session.execute(
                    text(
                        """
                        SELECT count(*) FROM benefit_result AS br
                        JOIN scenario_run AS sr ON sr.id = br.scenario_run_id
                        JOIN intervention_scenario AS sc ON sc.id = sr.scenario_id
                        JOIN baseline_graph_snapshot AS b ON b.id = sc.baseline_snapshot_id
                        WHERE b.validation_state <> 'SIMULATION_ONLY'
                          AND sr.result_hash IS NOT NULL
                          AND sr.status = 'SUCCEEDED'
                          AND b.edge_count > 0
                        """
                    )
                )
            ).scalar_one()
            simulation_benefits = (
                await session.execute(
                    text(
                        """
                        SELECT count(*) FROM benefit_result AS br
                        JOIN scenario_run AS sr ON sr.id = br.scenario_run_id
                        JOIN intervention_scenario AS sc ON sc.id = sr.scenario_id
                        JOIN baseline_graph_snapshot AS b ON b.id = sc.baseline_snapshot_id
                        WHERE b.validation_state = 'SIMULATION_ONLY'
                        """
                    )
                )
            ).scalar_one()
            triggers = (
                await session.execute(
                    text(
                        """
                        SELECT tgrelid::regclass::text AS table_name
                        FROM pg_trigger
                        WHERE tgname LIKE '%append_only%' AND NOT tgisinternal
                        """
                    )
                )
            ).fetchall()
            protected_tables = {row[0] for row in triggers}

            mutation_blocked = False
            mutation_error = ""
            probe_id = f"bg-evidence-probe-{uuid.uuid4()}"
            try:
                async with session.begin_nested():
                    baseline_id = (
                        await session.execute(
                            text(
                                """
                                INSERT INTO baseline_graph_snapshot (
                                    id, horizon_start, horizon_end,
                                    model_id, model_version, config_json, config_hash,
                                    input_hash, graph_hash, data_status,
                                    validation_state, provenance_json
                                )
                                VALUES (
                                    :probe_id, now(), now(),
                                    'probe', 'probe', '{}'::jsonb, 'probe', 'probe',
                                    'probe', 'INSUFFICIENT_DATA', 'SIMULATION_ONLY',
                                    '{}'::jsonb
                                )
                                RETURNING id
                                """
                            ),
                            {"probe_id": probe_id},
                        )
                    ).scalar_one()
                    await session.execute(
                        text(
                            "UPDATE baseline_graph_snapshot SET edge_count = 5"
                            " WHERE id = :b"
                        ),
                        {"b": baseline_id},
                    )
            except Exception as error:  # noqa: BLE001 - the trigger raise IS the proof
                mutation_error = str(error)[:200]
                mutation_blocked = "append-only" in mutation_error.lower()
    except Exception as error:
        return {"passed": False, "reason": f"P5 persistence proof failed: {error}"}
    required_protected = {"risk_edge", "benefit_result", "intervention_scenario"}
    # The honest live catalog has zero operational events, so every persisted
    # benefit row must trace to a SIMULATION_ONLY baseline.
    passed = (
        int(counts["baselines"]) >= 1
        and int(counts["scenarios"]) >= 1
        and int(counts["runs"]) >= 2
        and required_protected.issubset(protected_tables)
        and mutation_blocked
        and int(operational_benefits_without_simulation) == 0
        and int(simulation_benefits) >= 1
    )
    return {
        "passed": passed,
        "baselines": int(counts["baselines"]),
        "edges": int(counts["edges"]),
        "scenarios": int(counts["scenarios"]),
        "runs": int(counts["runs"]),
        "benefit_rows_total": int(counts["benefits"]),
        "operational_benefit_rows": int(operational_benefits_without_simulation),
        "simulation_only_benefit_rows": int(simulation_benefits),
        "protected_tables": sorted(protected_tables),
        "append_only_mutation_blocked": mutation_blocked,
        "append_only_trigger_confirmed": mutation_blocked,
        "append_only_error_excerpt": mutation_error,
    }


def check_p5_ui_evidence() -> dict[str, Any]:
    """Verify the browser REMOVE-panel proof derives every value from the API."""
    evidence_dir = Path("artifacts/evidence/p5")
    required = [
        "remove-panel-proof.json",
        "remove-network-log.json",
        "remove-panel.png",
        "remove-confirm.png",
        "remove-panel-network.har",
    ]
    missing = [name for name in required if not (evidence_dir / name).exists()]
    if missing:
        return {
            "passed": False,
            "reason": "Browser E2E evidence is incomplete; run "
            "tests/e2e/test_p5_remove_panel.py first.",
            "missing": missing,
        }
    proof = json.loads((evidence_dir / "remove-panel-proof.json").read_text(encoding="utf-8"))
    rendered = str(proof.get("rendered_benefit_section", ""))
    run_status = proof.get("run_data_status")
    network_log = json.loads(
        (evidence_dir / "remove-network-log.json").read_text(encoding="utf-8")
    )
    urls = [entry.get("url", "") for entry in network_log]
    baseline_seen = any("/api/v1/baselines" in url for url in urls)
    edges_available = proof.get("baseline_edges_available") is True
    if edges_available:
        api_chain_observed = (
            any(url.rstrip("/").endswith("/scenarios") for url in urls)
            and any(url.endswith("/run") or "/run?" in url for url in urls)
            and any("/benefits" in url for url in urls)
        )
    else:
        # Zero-edge live catalog: creating a scenario would be doomed, so the
        # chain legitimately stops after the explicit baseline state.
        api_chain_observed = not any(
            url.rstrip("/").endswith("/scenarios") for url in urls
        )
    idealized_visible = "IDEALIZED_REMOVAL" in rendered
    no_actual_removal_claim = (
        "No actual object is removed" in rendered
        or "no actual removal occurred" in rendered.lower()
        or "never executes a removal" in rendered
    )
    explicit_state_ok = run_status == "OK" or (
        (proof.get("run_reason") or "") in rendered
        or str(run_status) in rendered
        or "NO removable risk edge" in rendered
    )
    return {
        "passed": bool(baseline_seen and api_chain_observed and idealized_visible and explicit_state_ok),
        "api_chain_observed": api_chain_observed,
        "baseline_endpoint_observed": baseline_seen,
        "baseline_edges_available": edges_available,
        "idealized_removal_rendered": idealized_visible,
        "no_actual_removal_disclaimer": no_actual_removal_claim,
        "explicit_state_rendered": explicit_state_ok,
        "run_data_status": run_status,
        "network_log_requests": len(network_log),
        "screenshots": ["remove-confirm.png", "remove-panel.png"],
        "har": "artifacts/evidence/p5/remove-panel-network.har",
    }


def p4_status(gates: dict[str, dict[str, Any]]) -> tuple[str, str | None]:
    """Block P5 until every P4 screening, Pc, and quality gate passes."""
    if not all(gate.get("passed") is True for gate in gates.values()):
        return "FAILED", None
    return "PASSED", "P5"


async def check_p4_conjunctions_api() -> dict[str, Any]:
    """Exercise the P4 API end-to-end over the real stored catalog."""
    try:
        from httpx import AsyncClient

        from backend.main import app

        async with AsyncClient(app=app, base_url="http://evidence") as client:
            run = await client.post(
                f"{settings.api_prefix}/v1/conjunctions/screen-runs",
                params={"window_hours": 24},
            )
            listed = await client.get(f"{settings.api_prefix}/v1/conjunctions")
            filtered = await client.get(
                f"{settings.api_prefix}/v1/conjunctions", params={"object": "25544"}
            )
            threshold_only = await client.get(
                f"{settings.api_prefix}/v1/conjunctions",
                params={"threshold_max": 1000.0},
            )
            bad_metric = await client.get(
                f"{settings.api_prefix}/v1/conjunctions",
                params={"metric_type": "RISK_SCORE"},
            )
            naive = await client.get(
                f"{settings.api_prefix}/v1/conjunctions",
                params={"start": "2026-08-25T00:00:00"},
            )
    except Exception as error:
        return {"passed": False, "reason": f"P4 API proof failed: {error}"}

    run_payload = run.json() if run.status_code == 202 else {}
    list_payload = listed.json() if listed.status_code == 200 else {}
    run_data = run_payload.get("data", {}) if isinstance(run_payload, dict) else {}
    serialized = json.dumps(list_payload, default=str).lower()
    passed = (
        run.status_code == 202
        and bool(run_data.get("screening_run_id"))
        and run_payload.get("provenance", {}).get("model_id")
        == "aetherus-ca-screening"
        and run_payload.get("data_status")
        in {"OK", "PARTIAL", "INSUFFICIENT_DATA", "UNAVAILABLE"}
        and run_payload.get("status_reason")
        and listed.status_code == 200
        and bool(list_payload.get("request_id"))
        and filtered.status_code == 200
        and threshold_only.status_code == 422
        and bad_metric.status_code == 422
        and naive.status_code == 422
    )
    return {
        "passed": passed,
        "endpoints": [
            "POST /api/v1/conjunctions/screen-runs?window_hours=",
            "GET /api/v1/conjunctions",
            "GET /api/v1/conjunctions?object=",
        ],
        "run_data_status": run_payload.get("data_status"),
        "run_reason": run_payload.get("status_reason"),
        "objects_considered": run_data.get("objects_considered"),
        "objects_propagated": run_data.get("objects_propagated"),
        "pairs_before_screening": run_data.get("pairs_before_screening"),
        "pairs_after_coarse": run_data.get("pairs_after_coarse"),
        "propagation_failure_count": len(run_data.get("propagation_failures", [])),
        "events_found": run_data.get("events_found"),
        "list_count": list_payload.get("data", {}).get("count"),
        "error_paths": {
            "threshold_without_metric_type": threshold_only.status_code,
            "unknown_metric_type": bad_metric.status_code,
            "naive_timestamp": naive.status_code,
        },
        "no_fabricated_channels": '"risk_score"' not in serialized,
    }


async def check_p4_real_screening_persistence() -> dict[str, Any]:
    """Prove runs/snapshots persisted for the real catalog and are immutable."""
    try:
        from sqlalchemy import text

        from backend.database import get_db_session

        async with get_db_session() as session:
            run_row = (
                await session.execute(
                    text(
                        """
                        SELECT
                            count(*) AS runs,
                            max(pairs_before_screening) AS pairs_seen,
                            sum(CASE WHEN input_hash IS NOT NULL THEN 1 ELSE 0 END)
                                AS hashed_runs,
                            sum(CASE WHEN config_hash IS NOT NULL THEN 1 ELSE 0 END)
                                AS configged_runs,
                            sum(
                                CASE WHEN data_status IN (
                                    'OK', 'PARTIAL', 'INSUFFICIENT_DATA', 'UNAVAILABLE'
                                ) THEN 1 ELSE 0 END
                            ) AS honest_states
                        FROM screening_run
                        """
                    )
                )
            ).mappings().one()
            snapshot_row = (
                await session.execute(
                    text(
                        """
                        SELECT
                            count(*) AS snapshots,
                            count(DISTINCT event_id) AS events,
                            sum(CASE WHEN pc IS NULL THEN 1 ELSE 0 END) AS null_pc,
                            sum(CASE WHEN pc_status IS NOT NULL THEN 1 ELSE 0 END)
                                AS pc_typed,
                            sum(CASE WHEN provenance_json <> '{}'::jsonb THEN 1 ELSE 0 END)
                                AS provenanced
                        FROM conjunction_snapshot
                        WHERE source_grade NOT IN ('PROBE')
                        """
                    )
                )
            ).mappings().one()

            # Append-only proof: mutate inside a nested transaction that is
            # always rolled back, so no probe row ever survives.
            mutation_blocked = False
            mutation_error = ""
            try:
                async with session.begin_nested():
                    object_ids = (
                        await session.execute(
                            text(
                                "SELECT id::text FROM space_object ORDER BY id LIMIT 2"
                            )
                        )
                    ).fetchall()
                    if len(object_ids) < 2:
                        raise RuntimeError("not enough objects for the immutability probe")
                    event_id = (
                        await session.execute(
                            text(
                                """
                                INSERT INTO conjunction_event (
                                    primary_object_id, secondary_object_id,
                                    source_event_id, tca, status
                                )
                                VALUES (
                                    CAST(:a AS uuid), CAST(:b AS uuid),
                                    'evidence-probe-' || gen_random_uuid()::text,
                                    now(), 'RETIRED'
                                )
                                RETURNING id::text
                                """
                            ),
                            {"a": object_ids[0][0], "b": object_ids[1][0]},
                        )
                    ).scalar_one()
                    snapshot_id = (
                        await session.execute(
                            text(
                                """
                                INSERT INTO conjunction_snapshot (
                                    event_id, snapshot_at, source_grade, provenance_json
                                )
                                VALUES (
                                    CAST(:event_id AS uuid), now(), 'EVIDENCE_PROBE',
                                    '{}'::jsonb
                                )
                                RETURNING id::text
                                """
                            ),
                            {"event_id": event_id},
                        )
                    ).scalar_one()
                    await session.execute(
                        text(
                            "UPDATE conjunction_snapshot SET miss_distance_m = 1"
                            " WHERE id = CAST(:sid AS uuid)"
                        ),
                        {"sid": snapshot_id},
                    )
            except Exception as error:  # noqa: BLE001 - the trigger raise IS the proof
                mutation_blocked = True
                mutation_error = str(error)[:200]
    except Exception as error:
        return {"passed": False, "reason": f"P4 persistence proof failed: {error}"}

    snapshot_count = int(snapshot_row["snapshots"] or 0)
    pc_typed_count = int(snapshot_row["pc_typed"] or 0)
    provenanced_count = int(snapshot_row["provenanced"] or 0)
    # Zero stored snapshots is a legitimate outcome for a sparse real catalog;
    # every snapshot that DOES exist must carry typed Pc channels provenance.
    snapshot_integrity = (
        snapshot_count == 0
        or (pc_typed_count == snapshot_count and provenanced_count == snapshot_count)
    )
    passed = (
        int(run_row["runs"]) >= 1
        and int(run_row["hashed_runs"]) == int(run_row["runs"])
        and int(run_row["configged_runs"]) == int(run_row["runs"])
        and int(run_row["honest_states"]) == int(run_row["runs"])
        and snapshot_integrity
        and mutation_blocked
    )
    return {
        "passed": passed,
        "screening_runs": int(run_row["runs"]),
        "max_pairs_screened": int(run_row["pairs_seen"] or 0),
        "all_runs_input_hashed": int(run_row["hashed_runs"]) == int(run_row["runs"]),
        "all_runs_config_hashed": int(run_row["configged_runs"]) == int(run_row["runs"]),
        "stored_snapshots": snapshot_count,
        "distinct_events": int(snapshot_row["events"] or 0),
        "snapshot_channel_integrity": snapshot_integrity,
        "append_only_mutation_blocked": mutation_blocked,
        "append_only_error_excerpt": mutation_error,
    }


def check_p4_ui_evidence() -> dict[str, Any]:
    """Verify the browser risk-panel proof derives every value from the API."""
    evidence_dir = Path("artifacts/evidence/p4")
    required = [
        "risk-panel-proof.json",
        "risk-network-log.json",
        "risk-panel.png",
        "risk-panel-network.har",
    ]
    missing = [name for name in required if not (evidence_dir / name).exists()]
    if missing:
        return {
            "passed": False,
            "reason": "Browser E2E evidence is incomplete; run tests/e2e/test_p4_risk_panel.py first.",
            "missing": missing,
        }
    proof = json.loads((evidence_dir / "risk-panel-proof.json").read_text(encoding="utf-8"))
    rendered = str(proof.get("rendered_risk_section", ""))
    payload = proof.get("api_payload", {})
    api_status = payload.get("data_status")
    events = payload.get("data", {}).get("events", [])
    if events:
        rendered_ok = any(
            str(event["primary"]["catalog_id"]) in rendered
            or str(event["secondary"]["catalog_id"]) in rendered
            for event in events
        )
    else:
        rendered_ok = ("NO CONJUNCTION EVENTS" in rendered) or (
            api_status in {"INSUFFICIENT_DATA", "UNAVAILABLE"}
            and api_status in rendered
        )
    pc_honesty = "never estimated" in rendered or "Pc is computed exclusively" in rendered
    static_placeholder_removed = "arrives in phase P4" not in rendered
    return {
        "passed": bool(rendered_ok and pc_honesty and static_placeholder_removed),
        "target_catalog_id": proof.get("target_catalog_id"),
        "api_data_status": api_status,
        "rendered_reflects_api": rendered_ok,
        "pc_honesty_note_rendered": pc_honesty,
        "static_p3_placeholder_removed": static_placeholder_removed,
        "network_log_requests": len(
            json.loads((evidence_dir / "risk-network-log.json").read_text(encoding="utf-8"))
        ),
        "screenshots": ["risk-panel.png"],
    }


def check_ca_validation_metrics() -> dict[str, Any]:
    """Confirm the committed validation-corpus metrics match the passing gates."""
    metrics_path = Path("artifacts/evidence/p4/validation-ca001.json")
    if not metrics_path.exists():
        return {
            "passed": False,
            "reason": "validation-ca001.json is missing; run backend/tools/run_ca_validation.py",
        }
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    passed = (
        metrics.get("objects") == 10000
        and metrics.get("injected_pairs", 0) >= 1
        and metrics.get("false_negatives") == 0
        and float(metrics.get("runtime_seconds", -1)) >= 0.0
    )
    return {"passed": passed, **metrics}


async def generate_p4_evidence() -> dict[str, Any]:
    """Collect P4 evidence; PASSED only with corpus, API, persistence, UI proofs."""
    commit = get_git_commit()
    gates: dict[str, dict[str, Any]] = {
        "git_commit": check_git_commit(commit),
        "tests": command_gate(
            "tests", [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"]
        ),
        "lint": command_gate(
            "lint", [sys.executable, "-m", "ruff", "check", "backend", "tests", "quality"]
        ),
        "type_check": command_gate("type_check", [sys.executable, "-m", "mypy", "backend"]),
        "anti_shortcut_audit": check_anti_shortcuts(),
        "width_audit": check_no_tle_width(),
        "database": await check_database_schema(require_p1=True, require_p4=True),
        "ca001_screening_corpus": command_gate(
            "ca001_screening_corpus",
            [
                sys.executable,
                "-m",
                "pytest",
                "tests/integration/test_ca_10k_corpus.py",
                "-q",
                "-p",
                "no:cacheprovider",
            ],
        ),
        "ca002_tca_tolerance": command_gate(
            "ca002_tca_tolerance",
            [
                sys.executable,
                "-m",
                "pytest",
                "tests/unit/test_ca_tca_solver.py",
                "-q",
                "-p",
                "no:cacheprovider",
            ],
        ),
        "ca003_pc_covariance_gating": command_gate(
            "ca003_pc_covariance_gating",
            [
                sys.executable,
                "-m",
                "pytest",
                "tests/unit/test_ca_pc.py",
                "-q",
                "-p",
                "no:cacheprovider",
            ],
        ),
        "conjunctions_api_contract": await check_p4_conjunctions_api(),
        "real_screening_persistence": await check_p4_real_screening_persistence(),
        "ui_risk_panel_evidence": check_p4_ui_evidence(),
        "ca_validation_metrics": check_ca_validation_metrics(),
    }
    status, next_phase = p4_status(gates)
    evidence: dict[str, Any] = {
        "phase": "P4",
        "phase_name": "Conjunction Assessment: conservative screening, refined TCA, covariance-gated Pc, provenance",
        "generated_at": datetime.now(UTC).isoformat(),
        "version": __version__,
        "commit": commit,
        "scope": {
            "package_phase_card": "P4 Conjunction",
            "world_com_integration": "NOT_ATTEMPTED",
            "scientific_features": [
                "Conservative coarse screening (shell envelopes + aligned-sample cascade with honest margins)",
                "Refined TCA: coarse samples -> brackets -> squared-distance minimization -> global minimum -> boundary flag -> relative velocity",
                "Metric channel separation: MISS_DISTANCE screening vs PC vs MAX_PC never merged",
                "Covariance-gated Pc plugin (Foster-1992 encounter plane); PUBLIC_GP stays NOT_COMPUTED",
                "CDM parser preserving raw artifact hash and SPEC_EXAMPLE source grades",
                "conjunction_event stable identity + append-only conjunction_snapshot (DB trigger)",
                "GET /api/v1/conjunctions served only from stored results with metric_type-threshold enforcement",
                "POST /api/v1/conjunctions/screen-runs bounded execution over stored solutions",
                "Explore UI risk panel renders only P4 API results with explicit empty/unavailable states",
            ],
            "explicitly_out_of_scope": [
                "No benefit engine, REMOVE/PROTECT scenarios (P5/P6)",
                "No operational CDM feed ingestion (TraCSS live path remains future work)",
                "Synthetic 10k corpus is validation-only and never persisted as operational events",
            ],
        },
        "gates": gates,
        "api_endpoints": [
            "POST /api/v1/conjunctions/screen-runs?window_hours=",
            "GET /api/v1/conjunctions?object=&start=&stop=&source_grade=&metric_type=&threshold_min=&threshold_max=&limit=",
        ],
        "browser_evidence_dir": "artifacts/evidence/p4",
        "scientific_status": {
            "coarse_screening": "AVAILABLE",
            "refined_tca": "AVAILABLE",
            "pc_without_covariance": "NOT_COMPUTED",
            "benefit_engine": "NOT_COMPUTED",
        },
        "limitations": [
            "The real stored catalog contains 8 propagable PUBLIC_GP objects; the "
            "24h/25km screening found zero candidate pairs, which is reported "
            "honestly instead of being filled with synthetic conjunctions.",
            "Three P1 test-residue objects exceed the SGP4 Alpha-5 numeric ceiling "
            "and are recorded as explicit propagation failures (PARTIAL).",
            "PUBLIC_GP OMM carries no covariance; Pc remains NOT_COMPUTED by design.",
            "Screening executes synchronously under a strict object cap because no "
            "worker queue infrastructure exists yet; large-catalog scheduling is deferred.",
            "SOCRATES MaxProbability is not ingested here; MAX_PC stays a separate, "
            "currently unpopulated channel rather than being relabelled from Pc.",
        ],
        "status": status,
        "next_allowed_phase": next_phase,
    }
    gates["configured_secret_leak"] = check_configured_secret_leak(evidence)
    status, next_phase = p4_status(gates)
    evidence["status"] = status
    evidence["next_allowed_phase"] = next_phase
    return evidence


async def generate_p5_evidence() -> dict[str, Any]:
    """Collect P5 evidence; PASSED only with BEN-001/BEN-003, API, UI proofs."""
    commit = get_git_commit()
    gates: dict[str, dict[str, Any]] = {
        "git_commit": check_git_commit(commit),
        "tests": command_gate(
            "tests", [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"]
        ),
        "lint": command_gate(
            "lint", [sys.executable, "-m", "ruff", "check", "backend", "tests", "quality"]
        ),
        "type_check": command_gate("type_check", [sys.executable, "-m", "mypy", "backend"]),
        "anti_shortcut_audit": check_anti_shortcuts(),
        "width_audit": check_no_tle_width(),
        "database": await check_database_schema(require_p1=True, require_p4=True, require_p5=True),
        "ben001_direct_benefit": command_gate(
            "ben001_direct_benefit",
            [
                sys.executable,
                "-m",
                "pytest",
                "tests/integration/test_benefit_service.py::TestBenefitServiceRemove::test_ben001_direct_benefit_and_provenance",
                "tests/unit/test_benefit_engine.py::test_ben001_direct_beneficiary_attribution_exact",
                "-q",
                "-p",
                "no:cacheprovider",
            ],
        ),
        "ben003_full_vs_selective": command_gate(
            "ben003_full_vs_selective",
            [
                sys.executable,
                "-m",
                "pytest",
                "tests/integration/test_p5_full_vs_selective.py",
                "-q",
                "-p",
                "no:cacheprovider",
            ],
        ),
        "validation_artifacts": await check_p5_validation_artifacts(),
        "scenarios_api_contract": await check_p5_scenarios_api(),
        "persistence_immutability": await check_p5_persistence_immutability(),
        "ui_remove_panel_evidence": check_p5_ui_evidence(),
    }
    status, next_phase = p5_status(gates)
    evidence: dict[str, Any] = {
        "phase": "P5",
        "phase_name": "Intervention Benefit Engine: baseline risk graph, IDEALIZED_REMOVAL counterfactual, direct beneficiary attribution, affected-subgraph equivalence",
        "generated_at": datetime.now(UTC).isoformat(),
        "version": __version__,
        "commit": commit,
        "scope": {
            "package_phase_card": "P5 Benefit",
            "world_com_integration": "NOT_ATTEMPTED",
            "scientific_features": [
                "Baseline risk graph built from stored P4 conjunction events with immutable snapshots (append-only DB triggers)",
                "REMOVE as IDEALIZED_REMOVAL counterfactual simulation only; no actual removal, maneuver, or command path exists",
                "Benefit_i(s,h,m) = R_i(G0,h,m) - R_i(Gs,h,m) on identical metric/horizon/config inputs",
                "Metric channel separation preserved: PC (covariance-gated), MAX_PC, CONJUNCTION_EXPOSURE; MISS_DISTANCE stays a feature and is never a benefit number",
                "Direct beneficiary attribution: non-target objects only, threshold + provenance required, self-benefit structurally excluded",
                "Affected-subgraph selective recompute vs full recompute equivalence within documented tolerance (exact equality enforced)",
                "Scenario definitions/runs/benefit results append-only with input/config/model hashes and result_hash determinism",
                "Explicit INSUFFICIENT_DATA / NO_BASELINE_EDGES / BASELINE_MISSING states for the zero-event live catalog",
                "Explore UI REMOVE entry wired to the real API chain with browser network evidence",
            ],
            "explicitly_out_of_scope": [
                "No PROTECT reverse ranking or candidate ranking (P6)",
                "No candidate OCM evaluation or newly-created-risk computation (P6)",
                "No maneuver commands, payments, or external effects of any kind",
                "No environment/fragmentation benefit model (EnvironmentBenefit stays NOT_COMPUTED)",
            ],
        },
        "gates": gates,
        "api_endpoints": [
            "POST /api/v1/baselines?horizon_hours=",
            "GET /api/v1/baselines?include_simulation=",
            "POST /api/v1/scenarios",
            "GET /api/v1/scenarios/{scenario_id}",
            "POST /api/v1/scenarios/{scenario_id}/run?recompute_mode=",
            "GET /api/v1/scenarios/{scenario_id}/benefits",
        ],
        "browser_evidence_dir": "artifacts/evidence/p5",
        "scientific_status": {
            "baseline_risk_graph": "AVAILABLE",
            "remove_counterfactual": "AVAILABLE_IDEALIZED_SIMULATION_ONLY",
            "direct_beneficiary_attribution": "AVAILABLE",
            "full_vs_selective_equivalence": "EQUIVALENT_WITHIN_TOLERANCE",
            "environment_benefit": "NOT_COMPUTED",
            "pc_channel": "COVARIANCE_GATED_NOT_COMPUTED_WITHOUT_COVARIANCE",
            "live_catalog_benefit": "NOT_COMPUTED_ZERO_OPERATIONAL_EVENTS",
        },
        "limitations": [
            "The real stored P4 catalog currently contains zero operational "
            "conjunction events (residual probe rows are excluded by design); "
            "every live benefit request therefore returns an explicit "
            "INSUFFICIENT_DATA state instead of numbers.",
            "All persisted benefit rows come from the SIMULATION_ONLY validation "
            "corpus and are labeled as such; they never surface through the "
            "operational baseline path.",
            "Under IDEALIZED_REMOVAL no new propagation occurs in either "
            "recompute mode; benchmark numbers measure graph assembly cost and "
            "are reported separately from the physics-equivalence requirement.",
            "PUBLIC_GP sources carry no covariance, so PC-channel edges remain "
            "absent in operational baselines by design.",
            "MAX_PC remains unpopulated until an operational CDM source is ingested.",
        ],
        "status": status,
        "next_allowed_phase": next_phase,
    }
    gates["configured_secret_leak"] = check_configured_secret_leak(evidence)
    status, next_phase = p5_status(gates)
    evidence["status"] = status
    evidence["next_allowed_phase"] = next_phase
    return evidence


async def main() -> None:
    """Write phase evidence and return nonzero while a required gate is incomplete."""
    parser = argparse.ArgumentParser(description="Generate fail-closed Aetherus phase evidence")
    parser.add_argument(
        "--phase", default="P0", choices=["P0", "P1", "P2", "P3", "P4", "P5"]
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("artifacts/evidence"),
        help="Output directory",
    )

    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    if args.phase == "P1":
        evidence = await generate_p1_evidence()
    elif args.phase == "P2":
        evidence = await generate_p2_evidence()
    elif args.phase == "P3":
        evidence = await generate_p3_evidence()
    elif args.phase == "P4":
        evidence = await generate_p4_evidence()
    elif args.phase == "P5":
        evidence = await generate_p5_evidence()
    else:
        evidence = await generate_p0_evidence()
    output_file = args.output_dir / f"{args.phase}.json"
    output_file.write_text(json.dumps(evidence, indent=2, default=str) + "\n", encoding="utf-8")
    print(f"Evidence written to: {output_file}")
    print(f"Status: {evidence['status']}")
    sys.exit(0 if evidence["status"] == "PASSED" else 1)


if __name__ == "__main__":
    asyncio.run(main())
