"""Aetherus Orbital Environment API."""

import logging
import secrets
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from redis.asyncio import Redis

from backend import __version__
from backend.benefit.errors import ScenarioInvalidError
from backend.benefit.service import BenefitService
from backend.config import settings
from backend.conjunction.repository import ConjunctionRepository
from backend.conjunction.service import ConjunctionService
from backend.database import check_db_health, close_db
from backend.domain.object_identity import ObjectIdentityResolver
from backend.explore.service import CatalogService
from backend.ingestion.errors import IngestionError, UnknownObjectError
from backend.ingestion.providers import provider_for
from backend.ingestion.ratelimit import AsyncRedis, RateLimitCoordinator
from backend.ingestion.redaction import Redactor
from backend.ingestion.repository import SqlIngestionRepository
from backend.ingestion.service import (
    IngestionService,
    ProviderRegistry,
    build_default_artifact_store,
)
from backend.orbit.repository import OrbitRepository
from backend.orbit.service import EphemerisService
from backend.phase_status import load_phase_manifest

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)
_redis_client: Redis | None = None


class ScenarioRequest(BaseModel):
    """REMOVE-scenario creation contract (P5 supports REMOVE only)."""

    kind: str = Field(description="Scenario kind; only REMOVE is implemented in P5")
    target: str = Field(description="Target catalog_id or canonical object UUID")
    baseline_snapshot_id: str | None = Field(
        default=None,
        description="Baseline graph to freeze; defaults to the latest operational baseline",
    )
    effective_time: str | None = Field(
        default=None,
        description="Offset-aware ISO-8601 UTC instant for the counterfactual",
    )
    metric_types: list[str] | None = Field(
        default=None,
        description="Subset of PC, MAX_PC, CONJUNCTION_EXPOSURE; defaults to all three",
    )
    recompute_mode: str | None = Field(
        default=None,
        description="FULL or AFFECTED_SUBGRAPH execution mode",
    )


def get_repository() -> SqlIngestionRepository:
    """Create a repository dependency so routes can be independently tested."""
    return SqlIngestionRepository()


def get_orbit_repository() -> OrbitRepository:
    """Create the P2 orbit persistence dependency."""
    return OrbitRepository()


def get_ephemeris_service() -> EphemerisService:
    """Construct the P2 propagation service against durable P1 solutions."""
    return EphemerisService(get_orbit_repository())


def get_catalog_service() -> CatalogService:
    """Construct the P3 explore catalog service over the same durable solutions."""
    return CatalogService()


def get_conjunction_repository() -> ConjunctionRepository:
    """Create the P4 conjunction persistence dependency."""
    return ConjunctionRepository()


def get_conjunction_service() -> ConjunctionService:
    """Construct the P4 assessment service over stored P1/P2 solutions."""
    return ConjunctionService(get_conjunction_repository())


def get_benefit_service() -> BenefitService:
    """Construct the P5 benefit engine over stored P4 conjunction results."""
    return BenefitService()


def get_redis_client() -> Redis:
    """Create one regenerable Redis coordination client for the P1 process."""
    global _redis_client
    if _redis_client is None:
        _redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


def get_ingestion_service() -> IngestionService:
    """Construct the P1 provider registry with real durable dependencies."""
    repository = get_repository()
    return IngestionService(
        provider=None,
        repository=repository,
        artifact_store=build_default_artifact_store(settings.raw_artifact_dir),
        registry=ProviderRegistry(
            {
                "celestrak_gp": provider_for("celestrak_gp", settings),
                "spacetrack_gp": provider_for("spacetrack_gp", settings),
            }
        ),
        coordinator=RateLimitCoordinator(
            cast(AsyncRedis, get_redis_client()),
            lock_ttl_seconds=settings.redis_lock_ttl_seconds,
        ),
        identity_resolver=ObjectIdentityResolver(repository),
        redactor=Redactor.from_secret_values(
            [
                settings.spacetrack_identity,
                settings.spacetrack_password,
                settings.internal_admin_token,
            ]
        ),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    logger.info("Starting Aetherus Orbital Environment API v%s", __version__)

    # Startup: Check database
    db_healthy = await check_db_health()
    if not db_healthy:
        logger.warning("Database health check failed - PostGIS may not be available")
    else:
        logger.info("Database health check passed")

    yield

    # Shutdown: Close connections
    logger.info("Shutting down...")
    if _redis_client is not None:
        await _redis_client.aclose()
    await close_db()
    logger.info("Shutdown complete")


app = FastAPI(
    title="Aetherus Orbital Environment API",
    version=__version__,
    description="Space object tracking, conjunction assessment, and intervention simulation",
    lifespan=lifespan,
    docs_url=f"{settings.api_prefix}/docs",
    redoc_url=f"{settings.api_prefix}/redoc",
    openapi_url=f"{settings.api_prefix}/openapi.json",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(IngestionError)
async def ingestion_error_handler(request: Request, error: IngestionError) -> JSONResponse:
    """Expose explicit data-availability states instead of synthetic scientific output."""
    del request
    status_code = {
        "UNAVAILABLE": 503,
        "AUTH_FAILED": 503,
        "RATE_LIMITED": 429,
        "INSUFFICIENT_DATA": 422,
        "UNKNOWN_OBJECT": 404,
        "IDENTITY_CONFLICT": 409,
        "QUARANTINE": 400,
        "INVALID_WINDOW": 422,
        "SCREEN_INVALID": 422,
        "INVALID_PARAMETER": 422,
        "BASELINE_MISSING": 422,
        "SCENARIO_INVALID": 422,
        "SCENARIO_NOT_FOUND": 404,
        "BENEFITS_NOT_READY": 409,
    }.get(error.status, 503)
    return JSONResponse(status_code=status_code, content=error.to_payload())


@app.get("/health")
async def health_check():
    """Health check endpoint.

    Returns system health status with database connectivity.
    No scientific data - infrastructure only.
    """
    db_healthy = await check_db_health()

    status = "healthy" if db_healthy else "degraded"

    return JSONResponse(
        status_code=200 if db_healthy else 503,
        content={
            "status": status,
            "version": __version__,
            "timestamp": datetime.now(UTC).isoformat(),
            "phase": "P5",
            "services": {
                "database": "healthy" if db_healthy else "unavailable",
                "api": "healthy",
            },
            "scientific_features": {
                "ingestion": "AVAILABLE" if db_healthy else "UNAVAILABLE",
                "orbit_propagation": "AVAILABLE" if db_healthy else "UNAVAILABLE",
                "explore_catalog": "AVAILABLE" if db_healthy else "UNAVAILABLE",
                "conjunction_assessment": "AVAILABLE" if db_healthy else "UNAVAILABLE",
                "pc_without_covariance": "NOT_COMPUTED",
                "benefit_engine": (
                    "AVAILABLE_IDEALIZED_SIMULATION" if db_healthy else "UNAVAILABLE"
                ),
            },
        },
    )


@app.get(f"{settings.api_prefix}/v1/status")
async def api_status():
    """API status endpoint.

    Returns phase implementation status per Master Spec.
    """
    payload: dict[str, Any] = {
        "api_version": "1.0.0",
        "backend_version": __version__,
        "phase": "P5",
        "timestamp": datetime.now(UTC).isoformat(),
        "implemented_phases": {
            "P0": {
                "name": "Repository / CI / Evidence",
                "status": "PASSED",
                "gates": [
                    "docker_compose",
                    "migrations",
                    "health_checks",
                    "evidence_generator",
                ],
            },
            "P1": {"name": "Ingestion", "status": "PASSED", "gates": ["live_provider_evidence"]},
            "P2": {
                "name": "Orbit / Time / Frames",
                "status": "PASSED",
                "gates": [
                    "sgp4_reference_corpus",
                    "golden_fixture_cross_validation",
                    "ephemeris_api_contract",
                    "deterministic_output_hash",
                ],
            },
            "P3": {
                "name": "Explore UI",
                "status": "PASSED",
                "gates": [
                    "api_derived_positions_only",
                    "lod_global_mid_focus",
                    "provenance_and_source_age",
                    "browser_network_inspection",
                ],
            },
            "P4": {
                "name": "Conjunction Assessment",
                "status": "PASSED",
                "gates": [
                    "conservative_coarse_screening_false_negative_zero",
                    "refined_tca_tolerance_and_boundary_flag",
                    "pc_covariance_gating_never_estimated",
                    "event_identity_snapshot_append_only",
                    "conjunctions_api_from_stored_results",
                    "risk_provenance_preserved",
                ],
            },
            "P5": {
                "name": "Benefit Engine",
                "status": "PASSED",
                "gates": [
                    "baseline_risk_graph_immutable_snapshots",
                    "idealized_removal_counterfactual_only",
                    "direct_beneficiary_attribution_with_threshold_provenance",
                    "metric_channel_separation_pc_maxpc_exposure",
                    "full_vs_selective_equivalence_within_tolerance",
                    "scenario_run_benefit_append_only",
                    "explicit_states_never_fabricated_values",
                ],
            },
            "P6": {"name": "PROTECT / OCM", "status": "NOT_STARTED"},
            "P7": {"name": "Genealogy / Visual", "status": "NOT_STARTED"},
            "P8": {"name": "Fragmentation", "status": "NOT_STARTED"},
            "P9": {"name": "Observation Intelligence", "status": "NOT_STARTED"},
            "P10": {"name": "Research Datasets", "status": "NOT_STARTED"},
            "P11": {"name": "Operations", "status": "NOT_STARTED"},
            "P12": {"name": "Production Hardening", "status": "NOT_STARTED"},
        },
    }
    phase_evidence = load_phase_manifest()
    if phase_evidence is not None:
        for phase, evidence in phase_evidence["phases"].items():
            payload["implemented_phases"][phase] = {
                "name": payload["implemented_phases"][phase]["name"],
                "status": evidence["status"],
                "gates": evidence["gates"],
                "tests": evidence["tests"],
                "runtime_evidence": evidence["runtime_evidence"],
            }
        payload["phase"] = "P12"
        payload["phase_evidence"] = {
            "source_commit": phase_evidence["source_commit"],
            "manifest_hash": phase_evidence["manifest_hash"],
        }
    return payload


@app.post(f"{settings.api_prefix}/v1/ingestions/celestrak/omm/{{catalog_id}}", status_code=201)
async def ingest_celestrak_omm(
    catalog_id: str,
    service: IngestionService = Depends(get_ingestion_service),
):
    """Fetch, preserve, parse, and persist one real CelesTrak OMM JSON response."""
    return render_ingestion_result(await service.ingest_catalog_id(catalog_id))


@app.post(f"{settings.api_prefix}/v1/ingestions/spacetrack/gp/{{catalog_id}}", status_code=201)
async def ingest_spacetrack_gp(
    catalog_id: str,
    service: IngestionService = Depends(get_ingestion_service),
):
    """Fetch one authenticated Space-Track GP record through the common P1 path."""
    return render_ingestion_result(await service.ingest("spacetrack_gp", catalog_id))


def render_ingestion_result(result: Any) -> JSONResponse | dict[str, Any]:
    """Use 200 only for verified cache/stale reuse; fresh/partial persistence is 201."""
    payload = result if isinstance(result, dict) else result.to_api_payload()
    cache_status = payload.get("cache_status", "MISS")
    if cache_status in {"HIT", "STALE"}:
        return JSONResponse(status_code=200, content=payload)
    return JSONResponse(status_code=201, content=payload)


@app.get(f"{settings.api_prefix}/v1/objects/resolve")
async def resolve_object_alias(
    source_id: str,
    source_key: str,
    repository: SqlIngestionRepository = Depends(get_repository),
):
    """Resolve only an exact provider alias and never guess an identity."""
    result = await repository.resolve_alias(source_id, source_key)
    if result is None:
        raise UnknownObjectError("No canonical object matches the supplied source alias")
    return result


@app.get(f"{settings.api_prefix}/v1/objects/{{object_id}}")
async def get_object(
    object_id: str,
    service: IngestionService = Depends(get_ingestion_service),
):
    """Return stored OMM provenance; it never calculates unavailable risk values."""
    result = await service.get_object(object_id)
    if result is None:
        raise UnknownObjectError("No canonical object is available for the requested identifier")
    return result


@app.get(f"{settings.api_prefix}/v1/objects/{{object_id}}/ephemeris")
async def get_object_ephemeris(
    object_id: str,
    start: str = Query(description="Inclusive window start as an offset-aware ISO-8601 UTC time"),
    stop: str = Query(description="Exclusive-or-equal window stop as an offset-aware ISO-8601 UTC time"),
    step_s: int | None = Query(default=None, ge=1, le=3600),
    service: EphemerisService = Depends(get_ephemeris_service),
):
    """Propagate the latest stored GP solution; positions are always API-derived."""
    return await service.ephemeris(object_id, start, stop, step_s)


@app.get(f"{settings.api_prefix}/v1/catalog/snapshot")
async def get_catalog_snapshot(
    at: str | None = Query(
        default=None,
        description="Optional offset-aware ISO-8601 UTC instant; defaults to now",
    ),
    bbox: str | None = Query(
        default=None,
        description="Optional viewport as min_lat,min_lon,max_lat,max_lon decimal degrees",
    ),
    limit: int | None = Query(default=None, ge=1, le=500),
    service: CatalogService = Depends(get_catalog_service),
):
    """Render positions only from stored P1 objects propagated by the P2 engine."""
    return await service.snapshot(at, bbox, limit)


@app.get(f"{settings.api_prefix}/v1/catalog/status")
async def get_catalog_status(
    service: CatalogService = Depends(get_catalog_service),
):
    """Report honest catalog coverage; global density states are never fabricated."""
    return await service.catalog_status()


@app.post(f"{settings.api_prefix}/v1/conjunctions/screen-runs", status_code=202)
async def run_conjunction_screening(
    window_hours: float | None = Query(
        default=None,
        ge=0.01,
        le=168.0,
        description="Screening window length in hours; defaults to configuration",
    ),
    service: ConjunctionService = Depends(get_conjunction_service),
):
    """Screen every stored P1/P2 orbit_solution and persist events/snapshots.

    The real stored catalog is bounded by configuration, so this executes
    synchronously; the 10k verification corpus never runs through this route.
    """
    return await service.run_screening(window_hours)


@app.get(f"{settings.api_prefix}/v1/conjunctions")
async def list_conjunctions(
    object: str | None = Query(
        default=None,
        alias="object",
        description="Filter by catalog_id or canonical object UUID",
    ),
    start: str | None = Query(
        default=None,
        description="Inclusive TCA lower bound as an offset-aware ISO-8601 UTC time",
    ),
    stop: str | None = Query(
        default=None,
        description="Inclusive TCA upper bound as an offset-aware ISO-8601 UTC time",
    ),
    source_grade: str | None = Query(
        default=None,
        description="Filter by latest-snapshot source grade (e.g. PUBLIC_GP)",
    ),
    metric_type: str | None = Query(
        default=None,
        description="One of PC, MAX_PC, MISS_DISTANCE; mandatory with a threshold",
    ),
    threshold_min: float | None = Query(default=None, description="Inclusive metric minimum"),
    threshold_max: float | None = Query(default=None, description="Inclusive metric maximum"),
    limit: int | None = Query(default=None, ge=1),
    service: ConjunctionService = Depends(get_conjunction_service),
):
    """Serve only persisted conjunction results with explicit empty states."""
    return await service.list_conjunctions(
        object_ref=object,
        start_raw=start,
        stop_raw=stop,
        source_grade=source_grade,
        metric_type=metric_type,
        threshold_min=threshold_min,
        threshold_max=threshold_max,
        limit_raw=limit,
    )


@app.post(f"{settings.api_prefix}/v1/baselines", status_code=202)
async def build_baselines(
    horizon_hours: float | None = Query(
        default=None,
        ge=0.01,
        le=168.0,
        description="Baseline risk-graph horizon in hours; defaults to configuration",
    ),
    service: BenefitService = Depends(get_benefit_service),
):
    """Build one immutable baseline risk graph from stored P4 conjunctions.

    With zero operational events the response carries an explicit
    INSUFFICIENT_DATA state; no edge, object, or benefit value is fabricated.
    """
    return await service.build_baseline(horizon_hours=horizon_hours)


@app.get(f"{settings.api_prefix}/v1/baselines")
async def list_baselines(
    include_simulation: bool = Query(
        default=False,
        description="Include SIMULATION_ONLY validation baselines",
    ),
    service: BenefitService = Depends(get_benefit_service),
):
    """List immutable baseline graph snapshots (append-only versioning)."""
    return await service.list_baselines(include_simulation=include_simulation)


@app.post(f"{settings.api_prefix}/v1/scenarios", status_code=202)
async def create_scenario(
    payload: ScenarioRequest,
    service: BenefitService = Depends(get_benefit_service),
):
    """Create an immutable REMOVE scenario bound to a baseline snapshot."""
    if payload.kind != "REMOVE":
        raise ScenarioInvalidError(
            "Only kind=REMOVE is implemented in P5; NUDGE/LOWER/CANDIDATE_OCM "
            "remain future phases",
            {"kind": payload.kind},
        )
    return await service.create_remove_scenario(
        target_ref=payload.target,
        baseline_snapshot_id=payload.baseline_snapshot_id,
        effective_time_raw=payload.effective_time,
        metric_types=payload.metric_types,
        recompute_mode=payload.recompute_mode or "FULL",
    )


@app.post(f"{settings.api_prefix}/v1/scenarios/{{scenario_id}}/run", status_code=202)
async def run_scenario(
    scenario_id: str,
    recompute_mode: str | None = Query(
        default=None,
        description="FULL or AFFECTED_SUBGRAPH; defaults to the scenario definition",
    ),
    service: BenefitService = Depends(get_benefit_service),
):
    """Execute the IDEALIZED_REMOVAL counterfactual and persist the run."""
    return await service.run_scenario(scenario_id, recompute_mode)


@app.get(f"{settings.api_prefix}/v1/scenarios/{{scenario_id}}/benefits")
async def get_scenario_benefits(
    scenario_id: str,
    service: BenefitService = Depends(get_benefit_service),
):
    """Serve persisted beneficiaries; 409 until a run has SUCCEEDED."""
    return await service.scenario_benefits(scenario_id)


@app.get(f"{settings.api_prefix}/v1/scenarios/{{scenario_id}}")
async def get_scenario(
    scenario_id: str,
    service: BenefitService = Depends(get_benefit_service),
):
    """Return the immutable scenario definition with assumptions."""
    return await service.get_scenario_payload(scenario_id)


async def require_internal_admin(request: Request) -> None:
    """Hide internal observability unless an exact configured local token is supplied."""
    configured = (
        settings.internal_admin_token.get_secret_value()
        if settings.internal_admin_token is not None
        else ""
    )
    supplied = request.headers.get("X-Internal-Admin-Token", "")
    if not configured or not secrets.compare_digest(supplied, configured):
        raise HTTPException(status_code=404, detail="Not Found")


@app.get("/internal/providers/health", dependencies=[Depends(require_internal_admin)])
async def internal_provider_health(
    repository: SqlIngestionRepository = Depends(get_repository),
):
    """Return provider activity and cache-coordination state without source response bodies."""
    cache_state = "NOT_INSPECTED"
    if _redis_client is not None:
        try:
            cache_state = "AVAILABLE" if await _redis_client.ping() else "UNAVAILABLE"
        except Exception:
            cache_state = "UNAVAILABLE"
    providers = await repository.provider_health()
    return {
        "providers": [{**provider, "cache_coordination": cache_state} for provider in providers]
    }


@app.get("/internal/identity-conflicts", dependencies=[Depends(require_internal_admin)])
async def internal_identity_conflicts(
    repository: SqlIngestionRepository = Depends(get_repository),
):
    """List conflict metadata for manual review; P1 deliberately supplies no merge action."""
    return {"conflicts": await repository.list_identity_conflicts()}


@app.get("/internal/ingestion/runs", dependencies=[Depends(require_internal_admin)])
async def internal_ingestion_runs(
    limit: int = Query(default=50, ge=1, le=100),
    repository: SqlIngestionRepository = Depends(get_repository),
):
    """Expose bounded run/error/hash metadata without raw bodies or credential material."""
    return {"runs": await repository.list_ingestion_runs(limit)}


@app.get("/")
async def root():
    """Serve the Aetherus explore UI shell; API routes keep precedence."""
    index_path = Path(settings.frontend_dir) / "index.html"
    if index_path.is_file():
        return FileResponse(index_path)
    return {
        "name": "Aetherus Orbital Environment",
        "version": __version__,
        "phase": "P5",
        "documentation": f"{settings.api_prefix}/docs",
    }


if Path(settings.frontend_dir).is_dir():
    app.mount(
        "/ui",
        StaticFiles(directory=settings.frontend_dir, html=True),
        name="explore-ui",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.environment == "development",
    )
