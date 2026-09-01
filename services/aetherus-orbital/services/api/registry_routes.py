from __future__ import annotations

from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from typing import Any, Callable
from uuid import UUID

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from aetherus_domain import CanonicalTimeContext, EvidenceClass, Scenario, StateKind, StateVector, ValidationState
from aetherus_foundation import CoordinateReferenceFrameEngine, UniversalSpaceTimeEngine


class FrameTransformRequest(BaseModel):
    position_km: tuple[float, float, float]
    velocity_km_s: tuple[float, float, float] = (0.0, 0.0, 0.0)
    frame: str
    epoch_utc: datetime
    to_frame: str


class TrajectoryRequest(BaseModel):
    points: list[dict[str, Any]]
    source_label: str
    live: bool = False
    model_version: str | None = None
    assumptions: list[str] = Field(default_factory=list)
    target_orbit: dict[str, Any] | None = None
    stage_separations: list[dict[str, Any]] = Field(default_factory=list)


class PhotometryRequest(BaseModel):
    times_s: list[float]
    magnitudes: list[float]
    min_period_s: float = 1.0
    max_period_s: float = 100.0


class ObservationPlanRequest(BaseModel):
    candidates: list[dict[str, Any]] = Field(default_factory=list)
    mount_rate_limit_deg_s: float = 5.0
    object_state: dict[str, Any] | None = None
    station: dict[str, Any] | None = None
    start_utc: datetime | None = None
    end_utc: datetime | None = None
    step_s: float = Field(default=30.0, gt=0, le=300)
    minimum_elevation_deg: float = Field(default=10.0, ge=-5, lt=90)


class CitizenObservationRequest(BaseModel):
    object_id: str
    observed_at: datetime
    value: float
    license_policy: str | None = None
    expected_min: float | None = None
    expected_max: float | None = None


class ReentryTipRequest(BaseModel):
    tip: dict[str, Any] | None = None
    source_id: str | None = None


class GenealogyWriteRequest(BaseModel):
    parent_id: str | None = None
    origin: str | None = None
    event_time_utc: datetime
    evidence_id: str
    known: bool = True


class ScenarioSpecRequest(BaseModel):
    kind: str
    target_object_ids: list[str]
    protected_object_ids: list[str] = Field(default_factory=list)
    parameters: dict[str, Any] = Field(default_factory=dict)
    assumptions: list[str] = Field(default_factory=list)
    seed: int | None = None


class FragmentationRequest(ScenarioSpecRequest):
    fragment_count: int = Field(default=20, ge=1, le=10000)
    parent_state: dict[str, Any]
    encounter_states: list[dict[str, Any]] = Field(default_factory=list)
    horizon_s: float = Field(default=3600.0, gt=0, le=604800)
    step_s: float = Field(default=30.0, gt=0, le=3600)
    affected_distance_km: float = Field(default=5.0, gt=0, le=1000)


class CandidateRankingRequest(BaseModel):
    protected_active: bool = True
    candidates: list[dict[str, Any]]
    primary_state: dict[str, Any] | None = None
    encounter_states: list[dict[str, Any]] = Field(default_factory=list)
    horizon_s: float = Field(default=3600.0, gt=0, le=604800)
    step_s: float = Field(default=30.0, gt=0, le=3600)
    risk_threshold_km: float = Field(default=5.0, gt=0, le=1000)


def register_registry_routes(
    app: FastAPI,
    *,
    repo,
    require_product: Callable[[], Any],
    envelope: Callable[..., dict[str, Any]],
    jsonable: Callable[[Any], Any],
    orbital_backend=None,
) -> None:
    """Expose the Engine Registry API surface without inventing scientific truth.

    Read endpoints return UNAVAILABLE/INSUFFICIENT_DATA when a live/official source is
    absent. Mutating scientific inputs are intentionally limited to explicit local
    validation/simulation paths in this continuation.
    """

    # E02 — canonical identity
    @app.get("/v1/objects")
    def objects_list(limit: int = 200):
        return envelope([o.model_dump(mode="json") for o in repo.list_canonicals(limit=limit)])

    # E03 — provenance
    @app.get("/v1/provenance/{provenance_id}")
    def provenance_detail(provenance_id: UUID):
        bundle = repo.get_provenance(provenance_id)
        if bundle is not None:
            return envelope(bundle.model_dump(mode="json"), provenance={"input_hash": bundle.provenance_hash})
        bundles = repo.provenance_for_evidence(provenance_id)
        if bundles:
            return envelope([b.model_dump(mode="json") for b in bundles], provenance={"evidence_id": str(provenance_id)})
        raise HTTPException(404, "provenance/evidence not found")

    # E04 — universal time
    @app.get("/v1/time/resolve")
    def time_resolve(
        at: datetime,
        mode: StateKind = StateKind.NOW,
        timezone_name: str | None = None,
        archived_snapshot_id: str | None = None,
        reconstructed_from_snapshot_ids: list[str] = Query(default=[]),
        model_id: str | None = None,
    ):
        try:
            if timezone_name:
                ctx = UniversalSpaceTimeEngine().resolve_local(
                    at, timezone_name, mode=mode, archived_snapshot_id=archived_snapshot_id,
                    reconstructed_from_snapshot_ids=reconstructed_from_snapshot_ids, model_id=model_id,
                )
            else:
                ctx = CanonicalTimeContext(
                    mode=mode, cursor_utc=at, archived_snapshot_id=archived_snapshot_id,
                    reconstructed_from_snapshot_ids=reconstructed_from_snapshot_ids, model_id=model_id,
                )
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return envelope(ctx.model_dump(mode="json"))

    # E05 — coordinate/reference frames
    @app.post("/internal/frames/transform")
    def frame_transform(req: FrameTransformRequest):
        try:
            result = CoordinateReferenceFrameEngine().transform(
                StateVector(position_km=req.position_km, velocity_km_s=req.velocity_km_s, frame=req.frame, epoch_utc=req.epoch_utc),
                req.to_frame,
            )
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return envelope(
            result.model_dump(mode="json"), data_status=result.provenance.validation_state.value,
            provenance={"method": result.provenance.method}, warnings=result.provenance.limitations,
        )

    # E08/E09 — local research ephemeris and derived celestial geometry
    @app.get("/v1/space/objects/{object_id}")
    def space_object(object_id: str, at: datetime | None = None, observer: str = "SUN"):
        p = require_product()
        try:
            state = p.space.state(object_id, at or p.universe.current_time_utc, observer=observer)
        except (KeyError, ValueError) as exc:
            raise HTTPException(404, str(exc)) from exc
        return envelope(state, data_status=state.validation_state.value, provenance={"provider": state.provider, "kernel_version": state.kernel_version})

    @app.get("/v1/space/events")
    def space_events(a: str = "EARTH", b: str = "MARS", at: datetime | None = None, threshold_deg: float = 5.0):
        p = require_product(); when = at or p.universe.current_time_utc
        try:
            sa, sb = p.space.state(a, when), p.space.state(b, when)
            event = p.celestial_events.close_approach(sa, sb, threshold_deg=threshold_deg)
        except (KeyError, ValueError) as exc:
            raise HTTPException(422, str(exc)) from exc
        return envelope([] if event is None else [jsonable(event)], data_status="RESEARCH_ONLY", warnings=["Derived local geometry; not labelled OFFICIAL."])

    # E10 — no current live SWPC source is fabricated in the offline runtime.
    @app.get("/v1/space-weather/current")
    def space_weather_current():
        return envelope(None, data_status="UNAVAILABLE", warnings=["Live NOAA SWPC provider has not been network-verified in this environment."])

    @app.get("/v1/space-weather/history")
    def space_weather_history():
        return envelope([], data_status="UNAVAILABLE", warnings=["No historical SWPC archive was ingested into the local evidence store."])

    # E11/E12 — provider adapters exist, but local catalog truth is intentionally empty.
    @app.get("/v1/space/neo")
    def neo_list():
        return envelope([], data_status="UNAVAILABLE", warnings=["No official/live NEO dataset is ingested in this local package."])

    @app.get("/v1/space/neo/{object_id}")
    def neo_detail(object_id: str):
        return envelope({"object_id": object_id, "state": None}, data_status="UNAVAILABLE", warnings=["No source-backed NEO state available."])

    @app.get("/v1/space/missions")
    def deep_space_missions():
        return envelope([], data_status="UNAVAILABLE", warnings=["No source-backed deep-space mission state has been ingested."])

    # E14-E19 — Control read surface. No telemetry/model values are invented.
    @app.get("/v1/launches/upcoming")
    def upcoming_launches():
        p = require_product(); now = p.universe.current_time_utc; out=[]
        for mission in p.missions.list():
            hist=p.launch_schedule.history(mission.mission_id)
            if hist and hist[-1].start_utc and hist[-1].start_utc >= now:
                out.append({"mission":jsonable(mission),"window":jsonable(hist[-1])})
        return envelope(out, data_status="OK" if out else "UNAVAILABLE", warnings=[] if out else ["No source-backed future launch window has been loaded."])

    @app.get("/v1/missions/{mission_id}/window")
    def mission_window(mission_id: str):
        p=require_product();
        if p.missions.get(mission_id) is None: raise HTTPException(404,"mission not found")
        hist=[jsonable(x) for x in p.launch_schedule.history(mission_id)]
        return envelope(hist, data_status="OK" if hist else "UNAVAILABLE", warnings=[] if hist else ["Mission exists, but no launch-window feed is loaded."])

    @app.get("/v1/missions/{mission_id}/state")
    def mission_state(mission_id: str):
        p=require_product(); m=p.missions.get(mission_id)
        if m is None: raise HTTPException(404,"mission not found")
        machine=p.launch_states.get(mission_id)
        if machine:
            return envelope({"mission_id":mission_id,"state":machine.state.value,"transitions":[jsonable(x) for x in machine.history]})
        return envelope({"mission_id":mission_id,"state":m.status,"source":"MISSION_REGISTRY_RECORD"}, data_status="OK")

    @app.get("/v1/missions/{mission_id}/telemetry")
    def mission_telemetry(mission_id: str):
        p=require_product();
        if p.missions.get(mission_id) is None: raise HTTPException(404,"mission not found")
        fusion=p.telemetry_by_mission.get(mission_id); rows=[jsonable(x) for x in fusion.samples()] if fusion else []
        return envelope(rows, data_status="OK" if rows else "UNAVAILABLE", warnings=[] if rows else ["No live/official telemetry has been ingested; modelled telemetry is not fabricated."])

    @app.get("/v1/missions/{mission_id}/trajectory")
    def mission_trajectory(mission_id: str):
        p=require_product();
        if p.missions.get(mission_id) is None: raise HTTPException(404,"mission not found")
        record=p.product_store.latest_record("CONTROL","TRAJECTORY",mission_id)
        return envelope(record["payload"] if record else None, data_status="OK" if record else "UNAVAILABLE", warnings=[] if record else ["No source-backed or explicitly modelled trajectory is stored."])

    @app.post("/v1/missions/{mission_id}/trajectory")
    def mission_trajectory_model(mission_id: str, req: TrajectoryRequest):
        p=require_product();
        if p.missions.get(mission_id) is None: raise HTTPException(404,"mission not found")
        if req.live:
            raise HTTPException(403,"Public API cannot self-declare telemetry/trajectory as live observed data; ingest through a verified provider/evidence path.")
        try:
            traj=p.trajectory.build(req.points,source_label=req.source_label,live=False,model_version=req.model_version,assumptions=req.assumptions,target_orbit=req.target_orbit,stage_separations=req.stage_separations)
        except ValueError as exc: raise HTTPException(422,str(exc)) from exc
        payload=jsonable(traj); p.product_store.append_record(domain="CONTROL",record_type="TRAJECTORY",entity_key=mission_id,payload=payload,observed_at=p.universe.current_time_utc,evidence_class="MODEL_SIGNAL",validation_state="RESEARCH_ONLY")
        return envelope(payload,data_status="RESEARCH_ONLY",warnings=["Explicitly modelled trajectory; never promoted to live telemetry."])

    @app.get("/v1/missions/{mission_id}/timeline")
    def mission_timeline(mission_id: str):
        p=require_product();
        if p.missions.get(mission_id) is None: raise HTTPException(404,"mission not found")
        rows=[jsonable(x) for x in p.timeline.ordered() if x.payload.get("mission_id")==mission_id]
        return envelope(rows, data_status="OK" if rows else "UNAVAILABLE")

    @app.get("/v1/missions/{mission_id}/objects")
    def mission_objects(mission_id: str):
        p=require_product();
        if p.missions.get(mission_id) is None: raise HTTPException(404,"mission not found")
        rows=[jsonable(x) for x in p.handover.list_handovers(mission_id)]
        return envelope(rows, data_status="OK" if rows else "UNAVAILABLE")

    # E20-E25 — local validation orbit paths remain SCREENING_ONLY.
    def _validation_orbit_object(object_id: str, at: datetime | None = None):
        p=require_product(); snap=p.orbit_snapshot(at)
        for obj in snap["objects"]:
            if obj["object_id"]==object_id: return obj, snap
        raise HTTPException(404,"only explicit VAL-* validation objects have local orbit states")

    @app.get("/v1/objects/{object_id}/ephemeris")
    async def object_ephemeris(object_id: str, at: datetime | None = None):
        if orbital_backend is not None:
            return await orbital_backend.ephemeris(object_id, at)
        obj,_=_validation_orbit_object(object_id,at)
        return envelope(obj,data_status="SCREENING_ONLY",warnings=["Local validation fixture; not operational catalog ephemeris."])

    @app.get("/v1/conjunctions/{conjunction_id}/risk")
    async def conjunction_risk(conjunction_id: str, at: datetime | None = None):
        if orbital_backend is not None:
            return await orbital_backend.conjunction_risk(conjunction_id, at)
        p=require_product(); snap=p.orbit_snapshot(at)
        valid={"VAL-A:VAL-B","VAL-B:VAL-A","VALIDATION_PAIR"}
        if conjunction_id not in valid: raise HTTPException(404,"conjunction not found")
        return envelope(snap["risk"],data_status=snap["risk"]["validation_state"],warnings=["Pc remains null because covariance is unavailable."])

    @app.get("/v1/risk-graph")
    def risk_graph():
        p=require_product(); edges=[
            p.risk_graph.build_edge("VAL-A","VAL-B",metrics={"screening_score":0.20,"pc":None},evidence_ids=["VALIDATION_FIXTURE"],config_version="validation-v1"),
            p.risk_graph.build_edge("VAL-B","VAL-C",metrics={"screening_score":0.10,"pc":None},evidence_ids=["VALIDATION_FIXTURE"],config_version="validation-v1"),
        ]
        return envelope({"edges":[jsonable(x) for x in edges],"snapshot_hash":p.risk_graph.snapshot_hash(edges),"fixture_class":"VALIDATION_FIXTURE"},data_status="RESEARCH_ONLY",warnings=["screening_score is not collision probability (Pc)."])

    @app.get("/v1/objects/{object_id}/risk")
    def object_risk(object_id: str):
        p=require_product();
        if object_id not in {"VAL-A","VAL-B","VAL-C"}: raise HTTPException(404,"local risk is only available for VAL-* fixtures")
        graph=risk_graph()["data"]; score=sum(float(e["metrics"].get("screening_score") or 0) for e in graph["edges"] if object_id in {e["a"],e["b"]})
        return envelope({"object_id":object_id,"screening_score":score,"pc":None,"fixture_class":"VALIDATION_FIXTURE"},data_status="RESEARCH_ONLY")

    @app.get("/v1/orbit/render-set")
    def orbit_render_set(
        view: str = Query(default="GLOBAL", pattern="^(GLOBAL|LEO|MEO|GEO)$"),
        viewport_query: list[str] = Query(default=[]),
        important_ids: list[str] = Query(default=[]),
    ):
        result=require_product().orbit_render_set(view=view,viewport_query=viewport_query,important_ids=important_ids)
        return envelope(
            result,
            data_status=result["data_status"],
            warnings=["Semantic LOD affects rendering only; scientific object selection and risk calculations are unchanged."],
        )

    @app.get("/v1/genealogy/{object_id}")
    def genealogy(object_id: str):
        rows=require_product().genealogy_timeline(object_id)
        return envelope(rows,data_status="OK" if rows else "UNAVAILABLE",warnings=[] if rows else ["No evidence-backed debris genealogy is stored for this object."])

    @app.post("/v1/genealogy/{object_id}")
    def genealogy_write(object_id: str, req: GenealogyWriteRequest):
        try:
            link=require_product().add_genealogy_link(
                child_id=object_id,parent_id=req.parent_id,origin=req.origin,
                event_time_utc=req.event_time_utc,evidence_id=req.evidence_id,known=req.known,
            )
        except ValueError as exc:
            raise HTTPException(422,str(exc)) from exc
        return envelope(
            jsonable(link),data_status="OK" if req.known else "INSUFFICIENT_DATA",
            provenance={"evidence_id":req.evidence_id},
        )

    # E26-E33 — simulation/research-only product tools.
    @app.post("/v1/scenarios/fragmentation")
    def fragmentation(req: FragmentationRequest):
        p=require_product()
        if req.seed is None: raise HTTPException(422,"fixed seed required")
        try:
            result=p.run_fragmentation_scenario(
                target_object_ids=req.target_object_ids,protected_object_ids=req.protected_object_ids,
                parameters=req.parameters,assumptions=req.assumptions,seed=req.seed,
                fragment_count=req.fragment_count,parent_state=req.parent_state,
                encounter_states=req.encounter_states,horizon_s=req.horizon_s,
                step_s=req.step_s,affected_distance_km=req.affected_distance_km,
            )
        except ValueError as exc: raise HTTPException(422,str(exc)) from exc
        return envelope(jsonable(result),data_status="RESEARCH_ONLY",warnings=["SIMULATION_ONLY; fragment cloud is not observed debris."])

    @app.get("/v1/reentry")
    def reentry_list():
        p=require_product(); rows=[]
        for oid, seq in p.reentry._history.items(): rows.extend(jsonable(x) for x in seq)
        return envelope(rows,data_status="OK" if rows else "UNAVAILABLE",warnings=[] if rows else ["No source-backed TIP/re-entry estimate has been ingested."])

    @app.get("/v1/reentry/{object_id}")
    def reentry_detail(object_id: str):
        rows=require_product().reentry_history(object_id)
        return envelope(rows,data_status="OK" if rows else "INSUFFICIENT_DATA")

    @app.post("/v1/reentry/{object_id}")
    def reentry_ingest(object_id: str, req: ReentryTipRequest):
        try:
            result=require_product().ingest_reentry_tip(object_id=object_id,tip=req.tip,source_id=req.source_id)
        except ValueError as exc:
            raise HTTPException(422,str(exc)) from exc
        return envelope(jsonable(result),data_status=result.validation_state.value,provenance={"source_id":req.source_id})

    @app.get("/v1/objects/{object_id}/rotation")
    def rotation_detail(object_id: str):
        return envelope({"object_id":object_id,"estimate":None},data_status="INSUFFICIENT_DATA",warnings=["Photometry samples are required; a period is not guessed."])

    @app.post("/v1/objects/{object_id}/rotation")
    def rotation_estimate(object_id: str, req: PhotometryRequest):
        result=require_product().estimate_rotation(
            object_id=object_id,times_s=req.times_s,magnitudes=req.magnitudes,
            min_period_s=req.min_period_s,max_period_s=req.max_period_s,
        )
        return envelope({"object_id":object_id,"estimate":jsonable(result)},data_status=result.validation_state.value)

    @app.get("/v1/observations/requests")
    def observation_requests():
        rows=require_product().observation_requests()
        return envelope(rows,data_status="SCREENING_ONLY" if rows else "INSUFFICIENT_DATA",warnings=[] if rows else ["No computed visibility windows are stored."])

    @app.post("/v1/observations/requests")
    def observation_plan(req: ObservationPlanRequest):
        if req.object_state is not None or req.station is not None:
            if req.object_state is None or req.station is None or req.start_utc is None or req.end_utc is None:
                raise HTTPException(422,"object_state, station, start_utc and end_utc are required together")
            try:
                result=require_product().compute_visibility(
                    object_state=req.object_state,station=req.station,start_utc=req.start_utc,
                    end_utc=req.end_utc,step_s=req.step_s,
                    minimum_elevation_deg=req.minimum_elevation_deg,
                    mount_rate_limit_deg_s=req.mount_rate_limit_deg_s,
                )
            except ValueError as exc:
                raise HTTPException(422,str(exc)) from exc
            return envelope(
                jsonable(result),data_status=result.validation_state,provenance=result.provenance,
                warnings=["Screening visibility only; illumination is NOT_COMPUTED without an authoritative Sun vector."],
            )
        try: rows=require_product().observation_planning.plan(req.candidates,mount_rate_limit_deg_s=req.mount_rate_limit_deg_s)
        except ValueError as exc: raise HTTPException(422,str(exc)) from exc
        return envelope([jsonable(x) for x in rows],data_status="RESEARCH_ONLY")

    @app.post("/v1/observations/submissions")
    def observation_submit(req: CitizenObservationRequest):
        expected=None if req.expected_min is None or req.expected_max is None else (req.expected_min,req.expected_max)
        obs=require_product().submit_citizen_observation(object_id=req.object_id,observed_at=req.observed_at,value=req.value,license_policy=req.license_policy,expected_range=expected)
        hook=require_product().citizen_observations.intelligence_hook(obs)
        return envelope({"observation":jsonable(obs),"intelligence_hook":hook},data_status="OK" if obs.status=="ACCEPTED" else obs.status,warnings=[] if obs.status=="ACCEPTED" else [obs.reason or "observation not accepted"])

    @app.get("/v1/scenarios")
    def scenarios_list():
        return envelope(require_product().product_store.list_records(domain="ORBIT",record_type="SCENARIO_SPEC"))

    @app.post("/v1/scenarios")
    def scenario_create(req: ScenarioSpecRequest):
        try: s=require_product().create_validation_scenario(kind=req.kind,target_object_ids=req.target_object_ids,protected_object_ids=req.protected_object_ids,parameters=req.parameters,assumptions=req.assumptions,seed=req.seed)
        except ValueError as exc: raise HTTPException(422,str(exc)) from exc
        return envelope(s.model_dump(mode="json"),data_status="RESEARCH_ONLY")

    @app.post("/v1/scenarios/{scenario_id}/run")
    def scenario_run_by_id(scenario_id: str):
        try: result=require_product().run_scenario_id(scenario_id)
        except KeyError as exc: raise HTTPException(404,"scenario not found") from exc
        return envelope(result,data_status="RESEARCH_ONLY")

    @app.get("/v1/scenarios/{scenario_id}/benefits")
    def scenario_benefits(scenario_id: str):
        result=require_product().scenario_execution(scenario_id)
        if result is None: return envelope(None,data_status="UNAVAILABLE",warnings=["Scenario has not been run."])
        attrs=result.get("result",{}).get("attributions",[])
        return envelope(attrs,data_status="RESEARCH_ONLY",warnings=["ATTRIBUTION_RESULT / COUNTERFACTUAL only; not observed benefit."])

    @app.get("/internal/scenarios/{scenario_id}/affected")
    def scenario_affected(scenario_id: str):
        p=require_product(); scenario=p.get_scenario(scenario_id)
        if scenario is None: raise HTTPException(404,"scenario not found")
        edges=[p.risk_graph.build_edge("VAL-A","VAL-B",metrics={"screening_score":0.2},evidence_ids=["VALIDATION_FIXTURE"],config_version="validation-v1"),p.risk_graph.build_edge("VAL-B","VAL-C",metrics={"screening_score":0.1},evidence_ids=["VALIDATION_FIXTURE"],config_version="validation-v1")]
        affected=p.affected_subgraph.affected(edges,scenario.target_object_ids) if hasattr(p,"affected_subgraph") else [e for e in edges if set(scenario.target_object_ids)&{e.a,e.b}]
        return envelope([jsonable(x) for x in affected],data_status="RESEARCH_ONLY")

    @app.post("/v1/protect/{protected_object_id}/candidates")
    def protect_candidates(protected_object_id: str, req: CandidateRankingRequest):
        if req.primary_state is not None:
            try:
                result=require_product().evaluate_ocm_candidates(
                    protected_object_id=protected_object_id,
                    primary_state=req.primary_state,
                    encounter_states=req.encounter_states,
                    candidates=req.candidates,
                    horizon_s=req.horizon_s,
                    step_s=req.step_s,
                    risk_threshold_km=req.risk_threshold_km,
                )
            except ValueError as exc:
                raise HTTPException(422,str(exc)) from exc
            return envelope(
                jsonable(result),data_status=result.validation_state,
                provenance=result.provenance,
                warnings=["Advisory two-body counterfactual only; no spacecraft command or Pc is generated."],
            )
        from aetherus_orbit import ProtectReverseQueryCandidateOCMComparisonEngine
        rows=ProtectReverseQueryCandidateOCMComparisonEngine().rank(protected_object_id=protected_object_id,candidates=req.candidates,protected_active=req.protected_active)
        return envelope([jsonable(x) for x in rows],data_status="RESEARCH_ONLY",warnings=["Advisory only; no spacecraft command generated."])

    @app.post("/v1/operations/fleets/{fleet_id}/maneuver-candidates")
    def fleet_maneuver_candidates(fleet_id: str, req: CandidateRankingRequest):
        from aetherus_orbit import ProtectReverseQueryCandidateOCMComparisonEngine
        rows=ProtectReverseQueryCandidateOCMComparisonEngine().rank(protected_object_id=fleet_id,candidates=req.candidates,protected_active=req.protected_active)
        return envelope({"fleet_id":fleet_id,"candidates":[jsonable(x) for x in rows],"advisory_only":True},data_status="RESEARCH_ONLY",warnings=["Candidate comparison only; automatic collision-avoidance commands are forbidden."])

    # E38-E44 — expose current intelligence ledger/packet without LLM invention.
    @app.get("/internal/intelligence/runs")
    def intelligence_runs():
        rows=list(require_product().intelligence_tasks.event_log)
        return envelope(rows,data_status="OK" if rows else "UNAVAILABLE")

    @app.get("/v1/intelligence/events/{event_id}/evidence")
    def intelligence_event_evidence(event_id: UUID):
        packet=repo.get_packet_for_event(event_id)
        if packet is None: raise HTTPException(404,"event packet not found")
        return envelope([e.model_dump(mode="json") for e in packet.evidence],provenance={"event_id":str(event_id)})

    @app.get("/v1/intelligence/signals")
    def intelligence_signals(limit:int=200):
        return envelope([x.model_dump(mode="json") for x in repo.list_signals(limit)])

    @app.get("/v1/intelligence/events")
    def intelligence_events(limit:int=200):
        return envelope([x.model_dump(mode="json") for x in repo.list_events(limit)])

    @app.get("/v1/intelligence/events/{event_id}/revisions")
    def intelligence_revisions(event_id:UUID):
        if repo.get_event(event_id) is None: raise HTTPException(404,"event not found")
        return envelope([r.model_dump(mode="json") for r in repo.revisions_for(event_id)])

    @app.get("/v1/intelligence/events/{event_id}/confidence")
    def intelligence_confidence(event_id:UUID):
        packet=repo.get_packet_for_event(event_id)
        if packet is None: raise HTTPException(404,"event packet not found")
        return envelope({"confidence":packet.confidence.model_dump(mode="json"),"uncertainty":packet.uncertainty.model_dump(mode="json")},data_status=packet.event.validation_state.value)

    @app.get("/v1/intelligence/events/{event_id}/why")
    def intelligence_why(event_id:UUID):
        packet=repo.get_packet_for_event(event_id)
        if packet is None: raise HTTPException(404,"event packet not found")
        return envelope({"why_it_matters":packet.why_it_matters,"known_limitations":packet.known_limitations,"allowed_claims":packet.allowed_claims,"prohibited_claims":packet.prohibited_claims},data_status=packet.event.validation_state.value)

    @app.get("/v1/intelligence/scenarios/{scenario_id}/attribution")
    def intelligence_attribution(scenario_id:str):
        result=require_product().scenario_execution(scenario_id)
        if result is None:return envelope(None,data_status="UNAVAILABLE",warnings=["Scenario execution/attribution not available."])
        return envelope(result.get("result",{}).get("attributions",[]),data_status="RESEARCH_ONLY",warnings=["COUNTERFACTUAL attribution, never observed fact."])
