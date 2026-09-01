from __future__ import annotations

import os
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from aetherus_domain import Scenario
from aetherus_foundation import LocalFoundationRepository, SpaceKnowledgeGraphArchiveEngine, UniversalSpaceTimeEngine
from aetherus_product import AetherusProductRuntime
from aetherus_providers import CelesTrakGPProvider, JPLHorizonsProvider, NOAASWPCProvider, LaunchLibraryProvider
from aetherus_orbit import RiskEdge, ProtectReverseQueryCandidateOCMComparisonEngine
from services.api.security import DeploymentAuthMiddleware


def _jsonable(value):
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if is_dataclass(value):
        out=asdict(value)
        def conv(v):
            if isinstance(v,datetime):return v.isoformat()
            if isinstance(v,UUID):return str(v)
            if hasattr(v,'value'):return v.value
            if isinstance(v,dict):return {k:conv(x) for k,x in v.items()}
            if isinstance(v,(list,tuple)):return [conv(x) for x in v]
            return v
        return conv(out)
    return value


def envelope(data, *, data_status="OK", provenance=None, warnings=None, request_id=None):
    return {
        "request_id": request_id or str(uuid4()),
        "generated_at": datetime.now(timezone.utc),
        "data_status": data_status,
        "data": _jsonable(data),
        "provenance": provenance or {},
        "warnings": warnings or [],
    }


class UniversePatch(BaseModel):
    current_time_utc: datetime | None = None
    selected_object: str | None = None
    selected_event: str | None = None
    camera_focus: str | None = None
    space_scale: str | None = None
    active_mission: str | None = None
    active_orbital_shell: str | None = None
    scenario_state: dict | None = None
    time_mode: str | None = None


class ScenarioRequest(BaseModel):
    kind: str
    target_object_ids: list[str]
    protected_object_ids: list[str] = Field(default_factory=list)
    parameters: dict = Field(default_factory=dict)
    assumptions: list[str] = Field(default_factory=list)
    seed: int | None = None


class ProtectRequest(BaseModel):
    protected_object_id: str
    protected_active: bool = True
    candidates: list[dict]


def create_app(
    repository: LocalFoundationRepository | None = None,
    product: AetherusProductRuntime | None = None,
    orbital_backend=None,
) -> FastAPI:
    # Preserve the Foundation-test injection seam. Product runtime owns its own repo when not supplied.
    repo = repository or (product.repo if product else LocalFoundationRepository(os.environ.get("AETHERUS_LOCAL_DB", ":memory:")))
    prod = product
    if prod is None and repository is None:
        root=Path(__file__).resolve().parents[2]
        prod=AetherusProductRuntime(
            db_path=os.environ.get("AETHERUS_PRODUCT_DB", ":memory:"),
            raw_root=os.environ.get("AETHERUS_RAW_ROOT", "/tmp/aetherus-v2/raw"),
            fixture_root=root/"fixtures"/"official",
        )
        repo=prod.repo

    app = FastAPI(
        title="Aetherus V2 API",
        version="0.5.0",
        description="SPACE + CONTROL + ORBIT + INTELLIGENCE local product runtime. Scientific validation states are explicit.",
    )
    app.add_middleware(DeploymentAuthMiddleware)
    app.state.foundation_repository = repo
    app.state.product = prod

    @app.get("/v1/time/now")
    def time_now():
        ctx = UniversalSpaceTimeEngine().now_context(datetime.now(timezone.utc))
        return envelope(ctx.model_dump(mode="json"))

    @app.get("/v1/health")
    def health():
        return {"status": "ok", "version": "0.5.0", "foundation_db": repo.counts(), "product_runtime": prod is not None}

    @app.get("/internal/providers/health")
    def provider_health():
        rows = [{"source_id": s.id, "name": s.name, "enabled": s.enabled, "source_grade": s.source_grade.value} for s in repo.list_data_sources()]
        if prod is not None:
            rows += [
                {"source_id":"CELESTRAK_GP","status":"ADAPTER_READY_LIVE_UNVERIFIED"},
                {"source_id":"NASA_JPL_HORIZONS","status":"ADAPTER_READY_LIVE_UNVERIFIED"},
                {"source_id":"NOAA_SWPC","status":"ADAPTER_READY_LIVE_UNVERIFIED"},
                {"source_id":"LAUNCH_LIBRARY_2","status":"ADAPTER_READY_LIVE_UNVERIFIED"},
            ]
        return envelope(rows, data_status="PARTIAL" if prod is not None else "OK", warnings=["Live network verification is a deployment gate."] if prod is not None else [])

    @app.get("/internal/ingestion/runs")
    def ingestion_runs(limit: int = 50):
        return envelope([r.model_dump(mode="json") for r in repo.list_ingestion_runs(limit=max(1, min(limit, 200)))])

    @app.get("/v1/objects/{object_id}")
    def object_detail(object_id: UUID):
        obj = repo.get_canonical(object_id)
        if obj is None: raise HTTPException(404, "object not found")
        return envelope(obj.model_dump(mode="json"))

    @app.get("/v1/evidence/{evidence_id}")
    def evidence_detail(evidence_id: UUID):
        evidence = repo.get_evidence(evidence_id)
        if evidence is None: raise HTTPException(404, "evidence not found")
        return envelope(evidence.model_dump(mode="json"), provenance={"source_ids": [evidence.source_id], "input_hash": evidence.checksum_sha256})

    @app.get("/v1/states/{state_id}")
    def state_detail(state_id: UUID):
        state = repo.get_digital_state(state_id)
        if state is None: raise HTTPException(404, "state not found")
        return envelope(state.model_dump(mode="json"), provenance={"source_ids": [], "input_hash": state.state_hash})

    @app.get("/v1/snapshots/{snapshot_id}")
    def snapshot_detail(snapshot_id: UUID):
        snapshot = repo.get_snapshot(snapshot_id)
        if snapshot is None: raise HTTPException(404, "snapshot not found")
        return envelope(snapshot.model_dump(mode="json"), provenance={"input_hash": snapshot.snapshot_hash})

    @app.get("/v1/graph/{node_id}")
    def graph_detail(node_id: str):
        relations = SpaceKnowledgeGraphArchiveEngine(repo).traverse(node_id)
        return envelope([r.model_dump(mode="json") for r in relations])

    @app.get("/v1/intelligence/events/{event_id}")
    def intelligence_event(event_id: UUID):
        packet = repo.get_packet_for_event(event_id)
        if packet is None:
            event = repo.get_event(event_id)
            if event is None: raise HTTPException(404, "event not found")
            return envelope(event.model_dump(mode="json"), data_status=event.validation_state.value)
        return envelope(packet.model_dump(mode="json"), data_status=packet.event.validation_state.value, provenance={"source_ids": sorted({e.source_id for e in packet.evidence}), "input_hash": packet.revision.snapshot_hash}, warnings=packet.known_limitations)

    # ---- Integrated local product surface ----
    def require_product() -> AetherusProductRuntime:
        if prod is None: raise HTTPException(503,"product runtime not mounted on injected Foundation-only app")
        return prod

    @app.get("/v1/product/summary")
    def product_summary(): return envelope(require_product().product_summary(), data_status="PARTIAL", warnings=["Local runtime complete path uses fixed official/research fixtures where live providers are not verified."])

    @app.get("/v1/universe")
    def universe_get(): return envelope(require_product().universe.as_json())

    @app.patch("/v1/universe")
    def universe_patch(patch:UniversePatch):
        changes={k:v for k,v in patch.model_dump().items() if v is not None}
        return envelope(require_product().set_universe(**changes))

    @app.get("/v1/space/state")
    def space_state(at:datetime|None=None): return envelope(require_product().space_snapshot(at), data_status="RESEARCH_ONLY")

    @app.get("/v1/space/ephemeris")
    def ephemeris(target:str="EARTH", at:datetime|None=None, observer:str="SUN"):
        p=require_product(); st=p.space.state(target,at or p.universe.current_time_utc,observer=observer)
        return envelope(st, data_status=st.validation_state.value, provenance={"provider":st.provider,"kernel_version":st.kernel_version}, warnings=["Offline mean-element research ephemeris; not precision JPL kernel output."])

    @app.get("/v1/control")
    def control_state(): return envelope(require_product().control_snapshot())

    @app.get("/v1/missions")
    def missions(): return envelope([_jsonable(m) for m in require_product().missions.list()])

    @app.get("/v1/missions/{mission_id}")
    def mission_detail(mission_id:str):
        m=require_product().missions.get(mission_id)
        if m is None:raise HTTPException(404,"mission not found")
        return envelope(m)

    @app.get("/v1/missions/{mission_id}/replay")
    def mission_replay(mission_id:str, at:datetime|None=None):
        if require_product().missions.get(mission_id) is None:raise HTTPException(404,"mission not found")
        return envelope(require_product().handover.replay(require_product().timeline,at_utc=at or require_product().universe.current_time_utc))

    @app.get("/v1/missions/{mission_id}/handover")
    def mission_handover(mission_id:str):
        if require_product().missions.get(mission_id) is None:raise HTTPException(404,"mission not found")
        result=require_product().mission_handover_snapshot(mission_id)
        return envelope(result,data_status=result["data_status"])

    @app.get("/v1/orbit")
    def orbit_state(at:datetime|None=None): return envelope(require_product().orbit_snapshot(at), data_status="SCREENING_ONLY", warnings=["Validation fixture objects. Pc is null without covariance."])

    @app.get("/v1/conjunctions")
    def conjunctions(at:datetime|None=None):
        snap=require_product().orbit_snapshot(at); return envelope([snap['conjunction']],data_status="SCREENING_ONLY")

    @app.get("/v1/orbit/shells")
    def orbit_shells(): return envelope([require_product().orbit_snapshot()['shell']],data_status="SCREENING_ONLY")

    @app.get("/v1/orbital-weather/current")
    def orbital_weather():
        snap=require_product().orbit_snapshot(); return envelope({"LEO":snap['shell'],"conjunction_watch":[snap['conjunction']]},data_status="SCREENING_ONLY")

    @app.get("/v1/intelligence/important-now")
    def important_now():
        snap=require_product().intelligence_snapshot(); return envelope(snap['events'],data_status=snap['data_status'])

    @app.get("/v1/archive/search")
    def archive_search(q:str|None=None):
        data=require_product().archive_snapshot()['items']
        if q:data=[x for x in data if q.lower() in str(x).lower()]
        return envelope(data)

    @app.get("/v1/archive/time-machine")
    def archive_time_machine(at:datetime|None=None, mode:str="ARCHIVED_STATE"):
        try: result=require_product().time_machine_snapshot(at=at,mode=mode)
        except ValueError as exc: raise HTTPException(422,str(exc)) from exc
        return envelope(result,data_status=result["data_status"],warnings=["ARCHIVED_STATE and RECONSTRUCTED_STATE are intentionally distinct."])

    @app.post("/v1/scenarios/run")
    def scenario_run(req:ScenarioRequest):
        try:
            result=require_product().run_validation_scenario(kind=req.kind,target_object_ids=req.target_object_ids,protected_object_ids=req.protected_object_ids,parameters=req.parameters,assumptions=req.assumptions,seed=req.seed)
        except ValueError as exc: raise HTTPException(422,str(exc)) from exc
        return envelope(result,data_status="RESEARCH_ONLY",warnings=["Simulation/counterfactual output only. screening_score is not Pc and cannot be promoted to observed fact."])

    @app.get("/v1/llm/explain")
    def llm_explain(locale:str="en"):
        result=require_product().llm_explanation(locale=locale)
        return envelope(result,data_status=result["data_status"],provenance={"context_source":"INTELLIGENCE_PACKET_ONLY"},warnings=["Local deterministic LLM fallback; no scientific calculation is delegated to the LLM layer."])

    @app.get("/v1/briefings/current")
    def briefing_current(locale:str="en"):
        result=require_product().current_briefing(locale=locale)
        return envelope(result,data_status=result["data_status"],provenance={"context_source":"INTELLIGENCE_PACKET_ONLY"})

    @app.get("/v1/search")
    def search(q:str=Query(min_length=1)): return envelope(require_product().search.search(q))

    @app.get("/v1/scene/{mode}")
    def scene(mode:str): return envelope(require_product().scene_snapshot(mode))

    @app.get("/v1/subscription/capabilities")
    def capabilities(plan:str="FREE"): return envelope(sorted(require_product().subscription.capabilities(plan)))

    @app.post("/v1/protect/candidates")
    def protect(req:ProtectRequest):
        ranked=ProtectReverseQueryCandidateOCMComparisonEngine().rank(protected_object_id=req.protected_object_id,candidates=req.candidates,protected_active=req.protected_active)
        return envelope([_jsonable(x) for x in ranked],data_status="RESEARCH_ONLY",warnings=["Advisory counterfactual candidates only; no spacecraft command is generated."])

    @app.get("/v1/providers/registry")
    def providers_registry():
        providers=[
            {"source_id":"CELESTRAK_GP","sample_url":CelesTrakGPProvider().build_url(catnr="25544",format="JSON"),"live_verified":False},
            {"source_id":"NASA_JPL_HORIZONS","sample_url":JPLHorizonsProvider().build_vectors_url(command="499",start_time="2026-08-30",stop_time="2026-08-31"),"live_verified":False},
            {"source_id":"NOAA_SWPC","sample_url":NOAASWPCProvider().product_url("planetary_k"),"live_verified":False},
            {"source_id":"LAUNCH_LIBRARY_2","sample_url":LaunchLibraryProvider().upcoming_url(limit=5),"live_verified":False},
        ]
        return envelope(providers,data_status="VALIDATION_PENDING")

    from services.api.registry_routes import register_registry_routes
    register_registry_routes(
        app,
        repo=repo,
        require_product=require_product,
        envelope=envelope,
        jsonable=_jsonable,
        orbital_backend=orbital_backend,
    )
    from services.api.platform_routes import register_platform_routes
    register_platform_routes(app, require_product=require_product, envelope=envelope, jsonable=_jsonable)

    web_dir = Path(__file__).resolve().parents[1] / "web"
    if web_dir.exists():
        app.mount("/app", StaticFiles(directory=str(web_dir), html=True), name="app")
        @app.get("/", include_in_schema=False)
        def root_redirect():
            return RedirectResponse("/app/")

    return app


app = create_app()
