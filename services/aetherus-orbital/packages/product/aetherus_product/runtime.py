from __future__ import annotations

import os
from math import sqrt

from dataclasses import dataclass, asdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID

from .storage import LocalProductRepository
from .postgres_storage import PostgresProductRepository
from .datasets import ResearchDatasetBuilder
from .operations import DurableJobService, DurableOperationsService

from aetherus_foundation import FoundationE2EPipeline, LocalFoundationRepository
from aetherus_space import SolarSystemEphemerisEngine, CelestialEventEngine, SpaceWeatherContextEngine, SmallBodyTrackingEngine, DeepSpaceMissionTrackingEngine
from aetherus_control import (MissionState, MissionRegistryEngine, LaunchScheduleWindowEngine, LaunchStateMachineCountdownEngine, TelemetryFusionEngine, LaunchTrajectoryFlightDynamicsAdapterEngine, MissionTimelineRecorderEngine, MissionReplayOrbitHandoverEngine)
from aetherus_orbit import (
    OrbitalElements, OrbitPropagationFramesEngine, ConjunctionScreeningPreciseTCAEngine,
    CollisionProbabilityRiskProvenanceEngine, RiskGraphEngine, OrbitalEnvironmentCongestionEngine,
    InterventionBenefitCounterfactualEngine, AffectedSubgraphEngine, DebrisGenealogyOriginEngine, FragmentationScenarioEngine,
    ReentryIntelligenceEngine, PhotometryRotationIntelligenceEngine, ObservationPlanningEngine, CitizenObservationQAContributionEngine,
    CandidateOCMEvaluationEngine,
    FragmentCloudPropagationEngine,
    GroundStationVisibilityEngine,
)
from aetherus_visual import MultiScaleSpaceSceneEngine, SemanticScale, VisualSemanticsEngine, SceneLayer, OrbitalShellLODEngine, SemanticZoomCameraFocusEngine
from aetherus_platform import (
    APIGatewayAuthRequestEnvelopeService, SubscriptionCapabilityService, WorkspaceWidgetControlRoomService,
    FollowAlertService, SearchDiscoveryService, MediaLiveStreamResolver, ResearchDatasetBenchmarkService,
    OperationsTenantAuditService, JobQueueScheduler, ObservabilityEvidenceManifestService,
    SecurityLicenseDataGovernanceService, DeploymentBackupDRService,
)
from aetherus_domain import EvidenceClass, Scenario, canonical_hash
from aetherus_llm import (
    LLMGateway, ModelRouter, ToolOrchestrator, ContextComposer, ExplanationAgent,
    ClaimCitationValidator, PersonalWorkspaceContext, BriefingReportGenerator,
)
from aetherus_intelligence import (IntelligenceTaskOrchestrator, ImportanceAttributionDecisionIntelligence)


@dataclass
class PersistentUniverseState:
    current_time_utc: datetime
    selected_object: str | None = None
    selected_event: str | None = None
    camera_focus: str | None = "EARTH"
    space_scale: str = SemanticScale.EARTH_VIEW.value
    active_mission: str | None = None
    active_orbital_shell: str | None = None
    scenario_state: dict[str, Any] | None = None
    time_mode: str = "NOW"

    def as_json(self) -> dict[str, Any]:
        d=asdict(self); d['current_time_utc']=self.current_time_utc.isoformat(); return d


class AetherusProductRuntime:
    """Integrated LOCAL product runtime.

    It deliberately separates:
      * fixed official historical evidence (Apollo 11 fixture),
      * offline research calculations (planet/orbit examples), and
      * live providers (adapters exist, live network verification is a deployment gate).
    """
    version="0.6.0"
    def __init__(self, *, db_path:str=":memory:", raw_root:str|Path="/tmp/aetherus-raw", fixture_root:str|Path|None=None):
        self.repo=LocalFoundationRepository(db_path)
        self.raw_root=Path(raw_root)
        if os.environ.get("AETHERUS_PRODUCT_POSTGRES", "0") == "1":
            database_url = os.environ.get("DATABASE_URL", "")
            if not database_url:
                raise RuntimeError("AETHERUS_PRODUCT_POSTGRES=1 requires DATABASE_URL")
            self.product_store=PostgresProductRepository(database_url)
        else:
            self.product_store=LocalProductRepository(self.repo.conn)
        self.universe_session_id="LOCAL-UNIVERSE"
        self.fixture_root=Path(fixture_root or Path(__file__).resolve().parents[3]/"fixtures"/"official")
        self.foundation=FoundationE2EPipeline(self.repo,self.raw_root)
        self.space=SolarSystemEphemerisEngine()
        self.celestial_events=CelestialEventEngine()
        self.space_weather=SpaceWeatherContextEngine()
        self.small_bodies=SmallBodyTrackingEngine()
        self.deep_space=DeepSpaceMissionTrackingEngine()
        self.missions=MissionRegistryEngine()
        self.launch_schedule=LaunchScheduleWindowEngine()
        self.launch_states:dict[str,LaunchStateMachineCountdownEngine]={}
        self._zoom_engines:dict[str,SemanticZoomCameraFocusEngine]={}
        self.telemetry_by_mission:dict[str,TelemetryFusionEngine]={}
        self.trajectory=LaunchTrajectoryFlightDynamicsAdapterEngine()
        self.timeline=MissionTimelineRecorderEngine()
        self.handover=MissionReplayOrbitHandoverEngine()
        self.orbit=OrbitPropagationFramesEngine()
        self.conjunction=ConjunctionScreeningPreciseTCAEngine()
        self.collision=CollisionProbabilityRiskProvenanceEngine()
        self.risk_graph=RiskGraphEngine()
        self.environment=OrbitalEnvironmentCongestionEngine()
        self.counterfactual=InterventionBenefitCounterfactualEngine()
        self.affected_subgraph=AffectedSubgraphEngine()
        self.genealogy=DebrisGenealogyOriginEngine()
        self.fragmentation=FragmentationScenarioEngine()
        self.fragment_cloud=FragmentCloudPropagationEngine()
        self.reentry=ReentryIntelligenceEngine()
        self.photometry=PhotometryRotationIntelligenceEngine()
        self.observation_planning=ObservationPlanningEngine()
        self.visibility=GroundStationVisibilityEngine()
        self.citizen_observations=CitizenObservationQAContributionEngine()
        self.ocm_evaluation=CandidateOCMEvaluationEngine()
        self.visual=MultiScaleSpaceSceneEngine()
        self.orbital_lod=OrbitalShellLODEngine()
        self.visual_semantics=VisualSemanticsEngine()
        self.api_gateway=APIGatewayAuthRequestEnvelopeService()
        self.subscription=SubscriptionCapabilityService()
        self.workspace=WorkspaceWidgetControlRoomService()
        self.follows=FollowAlertService()
        self.search=SearchDiscoveryService()
        self.media=MediaLiveStreamResolver()
        self.datasets=ResearchDatasetBenchmarkService()
        self.dataset_builder=ResearchDatasetBuilder()
        self.operations=OperationsTenantAuditService()
        self.jobs=JobQueueScheduler()
        self.durable_operations=DurableOperationsService(self.product_store)
        self.durable_jobs=DurableJobService(self.product_store)
        self.durable_jobs.register("ECHO", lambda payload: payload)
        self.observability=ObservabilityEvidenceManifestService()
        self.security=SecurityLicenseDataGovernanceService()
        self.deployment=DeploymentBackupDRService()
        self.llm_gateway=LLMGateway()
        self.model_router=ModelRouter()
        self.tool_orchestrator=ToolOrchestrator()
        self.context_composer=ContextComposer()
        self.claim_validator=ClaimCitationValidator()
        self.personal_context=PersonalWorkspaceContext()
        self.explainer=ExplanationAgent(self.claim_validator)
        self.briefings=BriefingReportGenerator()
        self.intelligence_tasks=IntelligenceTaskOrchestrator()
        # E39-E43 are not constructed here. The live path builds its own
        # (signal_gate, correlation, revision, confidence, packet) and now
        # carries the engine ids; a second instance here was used by nobody
        # and could only drift from the one that runs.
        self.importance_decision=ImportanceAttributionDecisionIntelligence()
        self.tool_orchestrator.register("search", self.search.search, scientific=False)
        self.tool_orchestrator.register("scene", self.scene_snapshot, scientific=False)
        self.tool_orchestrator.register("set_universe", self.set_universe, scientific=False)
        self.tool_orchestrator.register("briefing", self.current_briefing, scientific=False)
        self.tool_orchestrator.register("run_validation_scenario", self.run_validation_scenario, scientific=True)
        latest_universe=self.product_store.latest_universe(self.universe_session_id)
        if latest_universe:
            state=latest_universe["state"]
            state["current_time_utc"]=datetime.fromisoformat(str(state["current_time_utc"]).replace("Z","+00:00")).astimezone(timezone.utc)
            self.universe=PersistentUniverseState(**state)
        else:
            self.universe=PersistentUniverseState(datetime.now(timezone.utc))
        self._apollo:dict[str,Any]|None=None
        self._seed_local()
        self.product_store.append_universe(self.universe_session_id,self.universe.as_json(),datetime.now(timezone.utc))

    def _seed_local(self)->None:
        fixture=self.fixture_root/"NASA_APOLLO11_MISSION_OVERVIEW_FIXED_OFFICIAL_FIXTURE.json"
        if fixture.exists():
            self._apollo=self.foundation.run_fixed_official_apollo11_fixture(fixture,retrieved_at=datetime(2026,8,30,tzinfo=timezone.utc))
            self.missions.upsert({"mission_id":"APOLLO11","name":"Apollo 11","vehicle":"Saturn-V AS-506","launch_site":{"lat":28.6084,"lon":-80.6043},"payloads":[{"name":"Columbia","provisional":False},{"name":"Eagle","provisional":False}],"status":"COMPLETE"},source_id="NASA_APOLLO11_MISSION_OVERVIEW",source_class="OFFICIAL")
            evidence_id=str(self._apollo["evidence"].id)
            launch_at=self._apollo["state"].state_time
            self.timeline.append(event_id="APOLLO11:LAUNCH",event_type="LAUNCH",timestamp_utc=launch_at,evidence_ids=[evidence_id],payload={"mission_id":"APOLLO11","fixture_class":"FIXED_OFFICIAL_FIXTURE"})
            self.handover.handover(mission_id="APOLLO11",payload_id="Columbia",object_id=str(self._apollo["vehicle"].id),object_type="SPACECRAFT",evidence_ids=[evidence_id],confirmed=True)
            self.search.add({"id":"MISSION:APOLLO11","name":"Apollo 11","aliases":["AS-506","Saturn V"],"kind":"MISSION"})
        # Research/validation objects are explicitly named as fixtures, never exposed as live catalog truth.
        for oid,name in [("VAL-A","Validation LEO Object A"),("VAL-B","Validation LEO Object B")]:
            self.search.add({"id":oid,"name":name,"aliases":[],"kind":"VALIDATION_FIXTURE"})
        self.search.add({"id":"EARTH","name":"Earth","aliases":["Terra"],"kind":"CELESTIAL"})
        self.search.add({"id":"MARS","name":"Mars","aliases":[],"kind":"CELESTIAL"})

    def set_universe(self, **changes:Any)->dict[str,Any]:
        allowed=set(self.universe.__dataclass_fields__)
        for k,v in changes.items():
            if k not in allowed: raise KeyError(k)
            if k=='current_time_utc':
                if isinstance(v,str):v=datetime.fromisoformat(v.replace('Z','+00:00'))
                if v.tzinfo is None:raise ValueError("naive datetime forbidden")
                v=v.astimezone(timezone.utc)
            setattr(self.universe,k,v)
        state=self.universe.as_json()
        self.product_store.append_universe(self.universe_session_id,state,datetime.now(timezone.utc))
        return state

    def space_snapshot(self, at:datetime|None=None)->dict[str,Any]:
        at=at or self.universe.current_time_utc
        objects=[]
        for target in ("MERCURY","VENUS","EARTH","MARS","JUPITER","SATURN","URANUS","NEPTUNE"):
            st=self.space.state(target,at)
            objects.append({"id":target,"position_km":st.position_km,"frame":st.frame,"validation_state":st.validation_state.value,"evidence_class":st.evidence_class.value,"provider":st.provider,"kernel_version":st.kernel_version})
        result={"time_utc":at.isoformat(),"objects":objects,"data_status":"RESEARCH_ONLY","warning":"Offline mean-element ephemeris for local visualization; use JPL Horizons/kernel provider for validated ephemerides."}
        self.product_store.append_record(domain="SPACE",record_type="SPACE_SNAPSHOT",entity_key="SOLAR_SYSTEM",payload=result,observed_at=at,evidence_class="DERIVED",validation_state="RESEARCH_ONLY")
        return result

    def orbit_snapshot(self, at:datetime|None=None)->dict[str,Any]:
        at=at or self.universe.current_time_utc
        epoch=datetime(2026,8,30,tzinfo=timezone.utc)
        ea=OrbitalElements(epoch,6778.0,0.001,51.6,20.0,10.0,0.0,source_age_seconds=0)
        eb=OrbitalElements(epoch,6778.2,0.001,51.62,20.02,10.0,0.15,source_age_seconds=0)
        a=self.orbit.propagate("VAL-A",ea,at);b=self.orbit.propagate("VAL-B",eb,at)
        conj=self.conjunction.linear_tca(a,b,window_s=5400)
        risk=self.collision.assess(conj,covariance_sigma_km=None)
        alts=[sqrt(sum(v*v for v in s.position_km))-6378.137 for s in (a,b)]
        shell=self.environment.state("LEO",alts,expected_sources=1,available_sources=1,threshold_version="shell-v1")
        result={"time_utc":at.isoformat(),"objects":[asdict(a),asdict(b)],"conjunction":asdict(conj),"risk":{"pc":risk.pc,"validation_state":risk.validation_state.value,"warnings":risk.warnings},"shell":asdict(shell),"data_status":"SCREENING_ONLY","fixture_class":"VALIDATION_FIXTURE","warning":"No covariance is attached; Pc is intentionally null."}
        self.product_store.append_record(domain="ORBIT",record_type="ORBIT_SNAPSHOT",entity_key="VALIDATION_PAIR",payload=result,observed_at=at,evidence_class="MODEL_SIGNAL",validation_state="SCREENING_ONLY")
        return result

    def control_snapshot(self)->dict[str,Any]:
        missions=[asdict(m) for m in self.missions.list()]
        selected=next((m for m in missions if m.get("mission_id")==self.universe.active_mission),missions[0] if missions else None)
        status=str((selected or {}).get("status") or "").upper().replace("_","-")
        if status in {"COMPLETE","COMPLETED","SUCCESS","FAILED","ABORTED"}:
            workspace_phase="POST-MISSION"
        elif self.universe.active_mission and self.telemetry_by_mission.get(self.universe.active_mission):
            workspace_phase="ASCENT"
        else:
            workspace_phase="PRE-LAUNCH"
        result={"missions":missions,"active_mission":self.universe.active_mission,"workspace_phase":workspace_phase,"workspace":self.workspace.layout_for(workspace_phase),"data_status":"OK"}
        self.product_store.append_record(domain="CONTROL",record_type="CONTROL_SNAPSHOT",entity_key="MISSION_CONTROL",payload=result,observed_at=self.universe.current_time_utc,evidence_class="OFFICIAL",validation_state="VALIDATED")
        return result

    def intelligence_snapshot(self)->dict[str,Any]:
        if not self._apollo:return {"events":[],"data_status":"UNAVAILABLE"}
        packet=self._apollo['packet']
        result={"events":[packet.model_dump(mode="json")],"data_status":packet.event.validation_state.value,"fixture_class":"FIXED_OFFICIAL_FIXTURE"}
        self.product_store.append_record(domain="INTELLIGENCE",record_type="INTELLIGENCE_SNAPSHOT",entity_key=str(packet.event.id),payload=result,observed_at=self.universe.current_time_utc,evidence_class="DERIVED",validation_state=packet.event.validation_state.value)
        return result

    def archive_snapshot(self)->dict[str,Any]:
        if not self._apollo:return {"items":[],"data_status":"UNAVAILABLE"}
        p=self._apollo
        result={"items":[{"mission_id":"APOLLO11","event_id":str(p['event'].id),"snapshot_id":str(p['snapshot'].id),"object_id":str(p['vehicle'].id),"time_utc":p['state'].state_time.isoformat(),"state_kind":p['state'].state_kind.value,"fixture_class":"FIXED_OFFICIAL_FIXTURE"}],"data_status":"OK"}
        self.product_store.append_record(domain="ARCHIVE",record_type="ARCHIVE_SNAPSHOT",entity_key="APOLLO11",payload=result,observed_at=self.universe.current_time_utc,evidence_class="OFFICIAL",validation_state="VALIDATED")
        return result

    def mission_handover_snapshot(self, mission_id:str)->dict[str,Any]:
        handovers=[asdict(h) for h in self.handover.list_handovers(mission_id)]
        return {"mission_id":mission_id,"handovers":handovers,"data_status":"OK" if handovers else "UNAVAILABLE"}

    def time_machine_snapshot(self, *, at:datetime|None=None, mode:str="ARCHIVED_STATE")->dict[str,Any]:
        at=at or self.universe.current_time_utc
        if at.tzinfo is None: raise ValueError("naive datetime forbidden")
        at=at.astimezone(timezone.utc)
        mode=mode.upper()
        if mode=="ARCHIVED_STATE":
            return {"cursor_utc":at.isoformat(),"state_class":"ARCHIVED_STATE","archive":self.archive_snapshot(),"may_create_current_event":False,"data_status":"OK"}
        if mode in {"RECONSTRUCTED_STATE","MODELLED_FUTURE","SIMULATION"}:
            return {"cursor_utc":at.isoformat(),"state_class":mode,"space":self.space_snapshot(at),"orbit":self.orbit_snapshot(at),"archived":False,"may_create_current_event":False,"data_status":"RESEARCH_ONLY"}
        if mode=="NOW":
            return {"cursor_utc":at.isoformat(),"state_class":"NOW","space":self.space_snapshot(at),"orbit":self.orbit_snapshot(at),"archived":False,"data_status":"PARTIAL"}
        raise ValueError("unsupported time-machine mode")

    def create_validation_scenario(self, *, kind:str, target_object_ids:list[str], protected_object_ids:list[str]|None=None, parameters:dict[str,Any]|None=None, assumptions:list[str]|None=None, seed:int|None=None, evidence_class:EvidenceClass=EvidenceClass.COUNTERFACTUAL)->Scenario:
        allowed={"VAL-A","VAL-B","VAL-C"}
        if not target_object_ids or not set(target_object_ids)<=allowed:
            raise ValueError("local scenario only accepts explicit VAL-* validation fixtures")
        self.orbit_snapshot(self.universe.current_time_utc)
        baseline_record=self.product_store.latest_record("ORBIT","ORBIT_SNAPSHOT","VALIDATION_PAIR")
        if baseline_record is None: raise RuntimeError("orbit baseline was not persisted")
        scenario=Scenario(
            kind=kind,baseline_snapshot_id=UUID(baseline_record["id"]),target_object_ids=target_object_ids,
            protected_object_ids=protected_object_ids or [],effective_time=self.universe.current_time_utc,
            parameters=parameters or {},assumptions=(assumptions or [])+["LOCAL VALIDATION FIXTURE; never observed reality."],
            model_version="AETHERUS-local-scenario-v0.3",config_version="validation-v1",seed=seed,evidence_class=evidence_class,
        )
        self.product_store.append_record(domain="ORBIT",record_type="SCENARIO_SPEC",entity_key=str(scenario.id),payload=scenario.model_dump(mode="json"),observed_at=self.universe.current_time_utc,evidence_class=evidence_class.value,validation_state="RESEARCH_ONLY")
        return scenario

    def get_scenario(self, scenario_id:str)->Scenario|None:
        record=self.product_store.latest_record("ORBIT","SCENARIO_SPEC",str(scenario_id))
        return Scenario.model_validate(record["payload"]) if record else None

    def run_scenario_id(self, scenario_id:str)->dict[str,Any]:
        scenario=self.get_scenario(scenario_id)
        if scenario is None: raise KeyError(scenario_id)
        result=self.run_validation_scenario(kind=scenario.kind,target_object_ids=scenario.target_object_ids,protected_object_ids=scenario.protected_object_ids,parameters=scenario.parameters,assumptions=scenario.assumptions,seed=scenario.seed)
        result["requested_scenario_id"]=str(scenario.id)
        self.product_store.append_record(domain="ORBIT",record_type="SCENARIO_EXECUTION",entity_key=str(scenario.id),payload=result,observed_at=self.universe.current_time_utc,evidence_class="COUNTERFACTUAL",validation_state="RESEARCH_ONLY")
        return result

    def scenario_execution(self,scenario_id:str)->dict[str,Any]|None:
        record=self.product_store.latest_record("ORBIT","SCENARIO_EXECUTION",str(scenario_id))
        return record["payload"] if record else None

    def run_validation_scenario(self, *, kind:str, target_object_ids:list[str], protected_object_ids:list[str]|None=None, parameters:dict[str,Any]|None=None, assumptions:list[str]|None=None, seed:int|None=None)->dict[str,Any]:
        allowed={"VAL-A","VAL-B","VAL-C"}
        if not target_object_ids or not set(target_object_ids)<=allowed:
            raise ValueError("local scenario only accepts explicit VAL-* validation fixtures")
        orbit=self.orbit_snapshot(self.universe.current_time_utc)
        baseline_record=self.product_store.latest_record("ORBIT","ORBIT_SNAPSHOT","VALIDATION_PAIR")
        if baseline_record is None: raise RuntimeError("orbit baseline was not persisted")
        baseline_id=UUID(baseline_record["id"])
        scenario=Scenario(kind=kind,baseline_snapshot_id=baseline_id,target_object_ids=target_object_ids,protected_object_ids=protected_object_ids or [],effective_time=self.universe.current_time_utc,parameters=parameters or {},assumptions=(assumptions or [])+["LOCAL VALIDATION FIXTURE: screening_score is not Pc."],model_version="E31-local-v0.3",config_version="validation-screening-score-v1",seed=seed,evidence_class=EvidenceClass.COUNTERFACTUAL)
        edges=[
            self.risk_graph.build_edge("VAL-A","VAL-B",metrics={"screening_score":0.20},evidence_ids=["VALIDATION_FIXTURE"],config_version="validation-v1"),
            self.risk_graph.build_edge("VAL-B","VAL-C",metrics={"screening_score":0.10},evidence_ids=["VALIDATION_FIXTURE"],config_version="validation-v1"),
        ]
        result=self.counterfactual.run(scenario,edges,metric_type="screening_score")
        payload={"scenario":scenario.model_dump(mode="json"),"result":asdict(result),"fixture_class":"VALIDATION_FIXTURE","data_status":"RESEARCH_ONLY","warning":"Counterfactual screening_score is simulation-only and is not collision probability (Pc)."}
        self.product_store.append_record(domain="ORBIT",record_type="COUNTERFACTUAL_SCENARIO",entity_key=str(scenario.id),payload=payload,observed_at=self.universe.current_time_utc,evidence_class="COUNTERFACTUAL",validation_state="RESEARCH_ONLY")
        return payload

    def add_genealogy_link(self, *, child_id:str, parent_id:str|None, origin:str|None, event_time_utc:datetime, evidence_id:str, known:bool=True):
        link=self.genealogy.add(
            child_id=child_id,parent_id=parent_id,origin=origin,
            event_time_utc=event_time_utc,evidence_id=evidence_id,known=known,
        )
        payload=asdict(link)
        self.product_store.append_record(
            domain="ORBIT",record_type="GENEALOGY_LINK",entity_key=child_id,
            payload=payload,observed_at=link.event_time_utc,evidence_class="DERIVED",
            validation_state="VALIDATED_PIPELINE" if known else "INSUFFICIENT_DATA",
        )
        if hasattr(self.product_store,"append_genealogy_link"):
            self.product_store.append_genealogy_link(
                child_key=child_id,parent_key=link.parent_id,
                origin_status="KNOWN" if known else "UNKNOWN",
                provenance={"evidence_id":evidence_id,"origin":link.origin,"event_time_utc":link.event_time_utc.isoformat()},
            )
        return link

    def genealogy_timeline(self, child_id:str)->list[dict[str,Any]]:
        rows=self.product_store.list_records(domain="ORBIT",record_type="GENEALOGY_LINK",limit=2000)
        return sorted(
            [row["payload"] for row in rows if row["entity_key"]==child_id],
            key=lambda item:str(item.get("event_time_utc") or ""),
        )

    def run_fragmentation_scenario(
        self, *, target_object_ids:list[str], protected_object_ids:list[str]|None,
        parameters:dict[str,Any], assumptions:list[str], seed:int,
        fragment_count:int, parent_state:dict[str,Any], encounter_states:list[dict[str,Any]],
        horizon_s:float, step_s:float, affected_distance_km:float,
    ):
        scenario=self.create_validation_scenario(
            kind="FRAGMENTATION",target_object_ids=target_object_ids,
            protected_object_ids=protected_object_ids,parameters=parameters,
            assumptions=assumptions,seed=seed,evidence_class=EvidenceClass.SIMULATION_ONLY,
        )
        result=self.fragment_cloud.run(
            scenario=scenario,parent_state=parent_state,encounter_states=encounter_states,
            fragment_count=fragment_count,horizon_s=horizon_s,step_s=step_s,
            affected_distance_km=affected_distance_km,
        )
        payload=asdict(result)
        self.product_store.append_record(
            domain="ORBIT",record_type="FRAGMENTATION_RUN",entity_key=result.parent_object_id,
            payload=payload,observed_at=datetime.now(timezone.utc),
            evidence_class="SIMULATION_ONLY",validation_state=result.validation_state,
        )
        if hasattr(self.product_store,"append_fragmentation_run"):
            self.product_store.append_fragmentation_run(
                parent_key=result.parent_object_id,seed=result.seed,
                model_version=result.model_version,validation_state=result.validation_state,
                output_hash=result.result_hash,payload=payload,
            )
        return result

    def compute_visibility(
        self, *, object_state:dict[str,Any], station:dict[str,Any], start_utc:datetime,
        end_utc:datetime, step_s:float, minimum_elevation_deg:float,
        mount_rate_limit_deg_s:float,
    ):
        result=self.visibility.compute(
            object_state=object_state,station=station,start_utc=start_utc,end_utc=end_utc,
            step_s=step_s,minimum_elevation_deg=minimum_elevation_deg,
            mount_rate_limit_deg_s=mount_rate_limit_deg_s,
        )
        payload=asdict(result)
        self.product_store.append_record(
            domain="ORBIT",record_type="OBSERVATION_PLAN",
            entity_key=f"{result.object_id}:{result.station_id}",payload=payload,
            observed_at=start_utc,evidence_class="DERIVED",validation_state=result.validation_state,
        )
        if hasattr(self.product_store,"append_observation_record"):
            self.product_store.append_observation_record(
                object_key=result.object_id,observed_at=start_utc,observer_class="OBSERVATION_PLAN",
                qa_state=result.validation_state,evidence_class="DERIVED",license_policy=None,
                payload_hash=result.result_hash,payload=payload,
            )
        return result

    def observation_requests(self)->list[dict[str,Any]]:
        return [row["payload"] for row in self.product_store.list_records(domain="ORBIT",record_type="OBSERVATION_PLAN",limit=2000)]

    def submit_citizen_observation(self, *, object_id:str, observed_at:datetime, value:float, license_policy:str|None, expected_range:tuple[float,float]|None=None):
        observation=self.citizen_observations.submit(
            object_id=object_id,observed_at=observed_at,value=value,
            license_policy=license_policy,expected_range=expected_range,
        )
        payload=asdict(observation)
        digest=canonical_hash(payload)
        self.product_store.append_record(
            domain="ORBIT",record_type="CITIZEN_OBSERVATION",entity_key=observation.observation_id,
            payload=payload,observed_at=observation.observed_at,
            evidence_class=observation.evidence_class.value,validation_state=observation.status,
        )
        if hasattr(self.product_store,"append_observation_record"):
            self.product_store.append_observation_record(
                object_key=object_id,observed_at=observation.observed_at,
                observer_class="CITIZEN",qa_state=observation.status,
                evidence_class=observation.evidence_class.value,license_policy=observation.license_policy,
                payload_hash=digest,payload=payload,
            )
        return observation

    def ingest_reentry_tip(self, *, object_id:str, tip:dict[str,Any]|None, source_id:str|None):
        estimate=self.reentry.ingest_tip(object_id,tip,source_id=source_id)
        payload=asdict(estimate)
        self.product_store.append_record(
            domain="ORBIT",record_type="REENTRY_REVISION",entity_key=object_id,
            payload=payload,observed_at=datetime.now(timezone.utc),
            evidence_class=estimate.grade.value,validation_state=estimate.validation_state.value,
        )
        if hasattr(self.product_store,"append_reentry_revision"):
            self.product_store.append_reentry_revision(
                object_key=object_id,revision_no=estimate.version,
                estimate_time=estimate.nominal_utc,
                window={"start":estimate.window_start_utc,"end":estimate.window_end_utc},
                evidence_class=estimate.grade.value,validation_state=estimate.validation_state.value,
                provenance={"source_id":source_id},
            )
        return estimate

    def reentry_history(self, object_id:str)->list[dict[str,Any]]:
        rows=self.product_store.list_records(domain="ORBIT",record_type="REENTRY_REVISION",limit=2000)
        return sorted([row["payload"] for row in rows if row["entity_key"]==object_id],key=lambda x:int(x["version"]))

    def estimate_rotation(self, *, object_id:str, times_s:list[float], magnitudes:list[float], min_period_s:float, max_period_s:float):
        estimate=self.photometry.estimate(times_s,magnitudes,min_period_s=min_period_s,max_period_s=max_period_s)
        payload={"object_id":object_id,"estimate":asdict(estimate),"sample_count":len(times_s)}
        digest=canonical_hash(payload)
        self.product_store.append_record(
            domain="ORBIT",record_type="ROTATION_ESTIMATE",entity_key=object_id,
            payload=payload,observed_at=datetime.now(timezone.utc),
            evidence_class="DERIVED",validation_state=estimate.validation_state.value,
        )
        if hasattr(self.product_store,"append_observation_record"):
            self.product_store.append_observation_record(
                object_key=object_id,observed_at=datetime.now(timezone.utc),
                observer_class="PHOTOMETRY_DERIVED",qa_state=estimate.validation_state.value,
                evidence_class="DERIVED",license_policy=None,payload_hash=digest,payload=payload,
            )
        return estimate

    def create_research_dataset(self, *, dataset_key:str, version:str, domain:str, record_type:str, license_policy:str)->dict[str,Any]:
        source_records=self.product_store.list_records(domain=domain,record_type=record_type,limit=2000)
        artifact=self.dataset_builder.build(
            dataset_key=dataset_key,version=version,records=source_records,license_policy=license_policy,
        )
        stored_payload={
            "manifest":artifact.manifest,
            "json_text":artifact.json_bytes.decode("utf-8"),
            "csv_text":artifact.csv_bytes.decode("utf-8"),
        }
        self.product_store.append_record(
            domain="PLATFORM",record_type="DATASET_ARTIFACT",entity_key=dataset_key,
            payload=stored_payload,observed_at=datetime.now(timezone.utc),
            evidence_class="DERIVED",validation_state="VALIDATED_PIPELINE",
        )
        if hasattr(self.product_store,"append_dataset_manifest"):
            self.product_store.append_dataset_manifest(
                dataset_key=dataset_key,version=version,
                content_hash=artifact.manifest["dataset_hash"],license_policy=license_policy,
                provenance={
                    "source_record_hashes":artifact.manifest["source_record_hashes"],
                    "record_count":artifact.manifest["record_count"],
                    "files":artifact.manifest["files"],
                },
            )
        return stored_payload

    def get_research_dataset(self, dataset_key:str)->dict[str,Any]|None:
        record=self.product_store.latest_record("PLATFORM","DATASET_ARTIFACT",dataset_key)
        return record["payload"] if record else None

    def list_research_datasets(self)->list[dict[str,Any]]:
        return [
            row["payload"]["manifest"]
            for row in self.product_store.list_records(domain="PLATFORM",record_type="DATASET_ARTIFACT",limit=2000)
        ]

    def evaluate_ocm_candidates(
        self,
        *,
        protected_object_id:str,
        primary_state:dict[str,Any],
        encounter_states:list[dict[str,Any]],
        candidates:list[dict[str,Any]],
        horizon_s:float,
        step_s:float,
        risk_threshold_km:float,
    ):
        result=self.ocm_evaluation.evaluate(
            protected_object_id=protected_object_id,
            primary_state=primary_state,
            encounter_states=encounter_states,
            candidates=candidates,
            horizon_s=horizon_s,
            step_s=step_s,
            risk_threshold_km=risk_threshold_km,
        )
        payload=asdict(result)
        self.product_store.append_record(
            domain="ORBIT",record_type="PROTECT_RANKING",entity_key=protected_object_id,
            payload=payload,observed_at=datetime.now(timezone.utc),
            evidence_class="COUNTERFACTUAL",validation_state="RESEARCH_ONLY",
        )
        if hasattr(self.product_store,"append_protect_ranking"):
            self.product_store.append_protect_ranking(
                protected_entity_key=protected_object_id,
                generated_at=datetime.now(timezone.utc),
                model_version=result.provenance["model_version"],
                ranking_hash=result.result_hash,
                ranked_candidates=[asdict(item) for item in result.candidates],
                provenance=result.provenance,
            )
            self.product_store.append_scenario_validation_run(
                scenario_id=None,validation_kind="P6_OCM_COMPARISON",
                result_state=result.validation_state,result_hash=result.result_hash,payload=payload,
            )
        return result

    def llm_explanation(self,locale:str="en")->dict[str,Any]:
        locale="ko" if str(locale).lower().startswith("ko") else "en"
        if not self._apollo: return {"text":"설명을 사용할 수 없습니다." if locale=="ko" else "Explanation unavailable.","data_status":"UNAVAILABLE","locale":locale}
        packet=self._apollo["packet"]
        prompt=self.explainer.explain(packet,locale=locale)
        provider,model=self.model_router.route("EXPLANATION")
        response=self.llm_gateway.generate(provider=provider,prompt=prompt,model=model,packet=packet,authorized=True)
        return {**asdict(response),"data_status":response.validation_state,"source":"INTELLIGENCE_PACKET_ONLY","scientific_calculation_performed":False,"locale":locale}

    def current_briefing(self,locale:str="en")->dict[str,Any]:
        locale="ko" if str(locale).lower().startswith("ko") else "en"
        if not self._apollo:return {"data_status":"UNAVAILABLE","sections":[],"locale":locale}
        title="Aetherus 로컬 근거 브리핑" if locale=="ko" else "Aetherus Local Evidence Briefing"
        briefing=self.briefings.generate([self._apollo["packet"]],title=title,locale=locale)
        return {**asdict(briefing),"data_status":"VALIDATION_PENDING","source":"INTELLIGENCE_PACKET_ONLY","locale":locale}

    # ---- E15/E16: give the per-mission engines a way to come into existence.
    def ensure_launch_state(self, mission_id:str):
        """Create the mission's state machine on first use.

        Previously ``launch_states`` was initialised empty and never written to,
        so /v1/missions/{id}/state could only ever fall through to the registry
        record. The machine starts at PLANNED — the registry's own starting
        state — and its countdown is anchored to the real launch-window revision
        when one exists. It invents no transitions.
        """
        machine=self.launch_states.get(mission_id)
        if machine is None:
            machine=LaunchStateMachineCountdownEngine()
            self.launch_states[mission_id]=machine
        history=self.launch_schedule.history(mission_id)
        if history:
            latest=history[-1]
            if latest.state=="CONFIRMED" and latest.start_utc is not None:
                machine.start_countdown(latest.start_utc)
        return machine

    def transition_launch_state(self, mission_id:str, to_state:str, *, at_utc:datetime, evidence_id:str|None=None, official:bool=False, reason:str|None=None):
        """Record one state transition. Official transitions require evidence."""
        machine=self.ensure_launch_state(mission_id)
        transition=machine.transition(MissionState(to_state), at_utc, evidence_id=evidence_id, official=official, reason=reason)
        self.product_store.append_record(
            domain="CONTROL",record_type="LAUNCH_STATE_TRANSITION",entity_key=mission_id,
            payload={"from":transition.from_state.value,"to":transition.to_state.value,
                     "at_utc":transition.at_utc.isoformat(),"evidence_id":transition.evidence_id,
                     "reason":transition.reason,"official":official},
            observed_at=transition.at_utc,
            evidence_class="OFFICIAL" if official else "MODEL_SIGNAL",
            validation_state="VALIDATION_PENDING" if official else "RESEARCH_ONLY",
        )
        return transition

    def ingest_telemetry(self, mission_id:str, *, timestamp_utc:datetime, metrics:dict[str,float], units:dict[str,str], source_id:str, live:bool, sequence:int|None=None):
        """Accept one telemetry sample for a mission.

        ``telemetry_by_mission`` had no writer, so the fusion engine could never
        hold anything. This is the writer. It does not manufacture samples: with
        no operator or official feed connected the store stays empty and the read
        route keeps saying so.
        """
        fusion=self.telemetry_by_mission.get(mission_id)
        if fusion is None:
            fusion=TelemetryFusionEngine()
            self.telemetry_by_mission[mission_id]=fusion
        sample=fusion.ingest(timestamp_utc=timestamp_utc,metrics=metrics,units=units,source_id=source_id,live=live,sequence=sequence)
        self.product_store.append_record(
            domain="CONTROL",record_type="TELEMETRY_SAMPLE",entity_key=mission_id,
            payload={"timestamp_utc":sample.timestamp_utc.isoformat(),"metrics":sample.metrics,
                     "units":sample.units,"source_id":sample.source_id,
                     "evidence_class":sample.evidence_class.value,"sequence":sample.sequence},
            observed_at=sample.timestamp_utc,evidence_class=sample.evidence_class.value,
            validation_state="VALIDATION_PENDING" if live else "RESEARCH_ONLY",
        )
        return sample

    # ---- E12: normalise stored deep-space state instead of returning a literal.
    def deep_space_states(self)->list[dict[str,Any]]:
        """Every stored deep-space mission state, normalised by E12.

        The route used to return a hardcoded empty list, so the engine was
        unreachable and the emptiness was a property of the code. Now the engine
        runs over whatever the store holds; an empty store is an empty result for
        the honest reason.
        """
        records=self.product_store.list_records(domain="SPACE",record_type="DEEP_SPACE_STATE",limit=500)
        states=[]
        for record in records:
            payload=record["payload"]
            state=self.deep_space.normalize(
                mission_id=payload["mission_id"],status=payload["status"],
                epoch_utc=datetime.fromisoformat(payload["epoch_utc"]),source_id=payload["source_id"],
                position_km=tuple(payload["position_km"]) if payload.get("position_km") else None,
                live_telemetry=bool(payload.get("live_telemetry",False)),
                model_version=payload.get("model_version"),
                telemetry_evidence_id=payload.get("telemetry_evidence_id"),
            )
            states.append({
                "mission_id":state.mission_id,"status":state.status,
                "epoch_utc":state.epoch_utc.isoformat(),
                "position_km":list(state.position_km) if state.position_km else None,
                "source_label":getattr(state,"source_label",None),
                "validation_state":getattr(getattr(state,"validation_state",None),"value",None),
                "model_version":getattr(state,"model_version",None),
                "limitations":list(getattr(state,"limitations",()) or ()),
            })
        return states

    # ---- E35: semantic zoom over the current scene.
    def semantic_zoom(self, mode:str, *, action:str, object_id:str|None=None, event_id:str|None=None, scale:str|None=None)->dict[str,Any]:
        """Drive E35 against the scene for one mode.

        E35 was not imported anywhere; the visual layer had no focus/back path at
        all. The scientific object set is untouched by every action here — zoom is
        a camera concern, and the response repeats the scientific hash so a caller
        can verify that.
        """
        base=self.scene_snapshot(mode)
        engine=self._zoom_engines.get(mode.upper())
        if engine is None:
            scene=self.visual.build(
                scale=SemanticScale(base["scale"]),scientific_object_ids=list(base["scientific_object_ids"]),
                render_object_ids=list(base["render_object_ids"]),
                layers=[SceneLayer(**layer) for layer in base["layers"]],camera_focus=base["camera_focus"],
            )
            engine=SemanticZoomCameraFocusEngine(scene)
            self._zoom_engines[mode.upper()]=engine
        if action=="focus_object":
            if not object_id: raise ValueError("focus_object requires object_id")
            state=engine.focus_object(object_id)
        elif action=="focus_event":
            if not event_id: raise ValueError("focus_event requires event_id")
            state=engine.focus_event(event_id,object_id=object_id)
        elif action=="switch_mode":
            if not scale: raise ValueError("switch_mode requires scale")
            state=engine.switch_mode(SemanticScale(scale))
        elif action=="back":
            state=engine.back()
        else:
            raise ValueError(f"unknown zoom action: {action}")
        return {
            "action":action,"scale":state.scale.value,"camera_focus":state.camera_focus,
            "selected_object":state.selected_object,"selected_event":state.selected_event,
            "scientific_object_ids":list(state.scientific_object_ids),
            "scientific_hash":state.scientific_hash,
            "scientific_hash_unchanged":state.scientific_hash==base["scientific_hash"],
        }

    # ---- E37: attach evidence tokens to what the scene draws.
    def scene_semantics(self, mode:str)->dict[str,Any]:
        """Visual tokens and badges for one scene, refusing evidence promotion.

        E37 was constructed and never called, so nothing in the product surface
        carried its tokens. Each layer is tokenised from its own evidence class
        and checked against the promotion guard, so a MODEL layer can never be
        drawn as OBSERVED.
        """
        scene=self.scene_snapshot(mode)
        layers=[]
        for layer in scene["layers"]:
            evidence=EvidenceClass(layer["evidence_class"]) if not isinstance(layer["evidence_class"],EvidenceClass) else layer["evidence_class"]
            token=self.visual_semantics.token(evidence)
            self.visual_semantics.assert_no_promotion(evidence,evidence)
            layers.append({
                "layer_id":layer["layer_id"],"evidence_class":evidence.value,
                "token":{"pattern":token.pattern,"stroke":token.stroke,"opacity":token.opacity,
                          "badge":token.badge,"uncertainty_style":token.uncertainty_style},
                "accessible":self.visual_semantics.accessibility_check(token),
            })
        return {"mode":mode.upper(),"scale":scene["scale"],"layers":layers,
                "scientific_hash":scene["scientific_hash"]}

    def scene_snapshot(self,mode:str)->dict[str,Any]:
        mode=mode.upper()
        scale={"SPACE":SemanticScale.SOLAR_SYSTEM_VIEW,"CONTROL":SemanticScale.EARTH_VIEW,"ORBIT":SemanticScale.ORBITAL_VIEW}.get(mode,SemanticScale.EARTH_VIEW)
        classes=[EvidenceClass.DERIVED] if mode=="SPACE" else ([EvidenceClass.OFFICIAL] if mode=="CONTROL" else [EvidenceClass.MODEL_SIGNAL])
        layers=[SceneLayer(f"{mode.lower()}-primary",c,"AETHERUS_LOCAL",True) for c in classes]
        scientific=["EARTH"] if mode=="CONTROL" else (["VAL-A","VAL-B"] if mode=="ORBIT" else ["SUN","EARTH","MARS"])
        scene=self.visual.build(scale=scale,scientific_object_ids=scientific,render_object_ids=scientific,layers=layers,camera_focus=self.universe.camera_focus)
        return {"scale":scene.scale.value,"camera_focus":scene.camera_focus,"render_object_ids":scene.render_object_ids,"scientific_object_ids":scene.scientific_object_ids,"scientific_hash":scene.scientific_hash,"layers":[asdict(l) for l in scene.layers],"device_profile":scene.device_profile}

    def orbit_render_set(self, *, view:str="GLOBAL", viewport_query:list[str]|None=None, important_ids:list[str]|None=None)->dict[str,Any]:
        """Return a visual-only render subset without changing the scientific object set.

        E36 is a semantic LOD consumer. It may reduce what the browser draws but it must
        never reduce the objects used by scientific calculations.
        """
        scene=self.scene_snapshot("ORBIT")
        scientific=list(scene["scientific_object_ids"])
        render_ids=self.orbital_lod.render_set(
            scientific,
            view=view.upper(),
            viewport_query=viewport_query or [],
            important_ids=important_ids or [],
        )
        return {
            "view":view.upper(),
            "render_object_ids":render_ids,
            "scientific_object_ids":scientific,
            "scientific_hash":scene["scientific_hash"],
            "render_count":len(render_ids),
            "scientific_count":len(scientific),
            "semantic_lod_only":True,
            "data_status":"SCREENING_ONLY",
        }

    def save_personal_context(self, tenant_id:str, user_id:str, context:dict[str,Any])->dict[str,Any]:
        self.personal_context.put(tenant_id,user_id,context)
        self.product_store.append_record(domain="PLATFORM",record_type="PERSONAL_CONTEXT",entity_key=f"{tenant_id}:{user_id}",payload=context,observed_at=datetime.now(timezone.utc),evidence_class="DERIVED",validation_state="LOCAL_ONLY")
        return dict(context)

    def load_personal_context(self, tenant_id:str, user_id:str)->dict[str,Any]:
        record=self.product_store.latest_record("PLATFORM","PERSONAL_CONTEXT",f"{tenant_id}:{user_id}")
        if record:
            self.personal_context.put(tenant_id,user_id,record["payload"])
            return dict(record["payload"])
        return {}

    def save_workspace(self, tenant_id:str, user_id:str, workspace:dict[str,Any])->dict[str,Any]:
        payload={"tenant_id":tenant_id,"user_id":user_id,"workspace":workspace}
        self.product_store.append_record(domain="PLATFORM",record_type="WORKSPACE",entity_key=f"{tenant_id}:{user_id}",payload=payload,observed_at=datetime.now(timezone.utc),evidence_class="DERIVED",validation_state="LOCAL_ONLY")
        return payload

    def load_workspace(self, tenant_id:str, user_id:str)->dict[str,Any]|None:
        record=self.product_store.latest_record("PLATFORM","WORKSPACE",f"{tenant_id}:{user_id}")
        return record["payload"] if record else None

    def follow_target(self, tenant_id:str, user_id:str, target_id:str)->dict[str,Any]:
        ctx=self.api_gateway.context(tenant_id=tenant_id,user_id=user_id)
        self.follows.follow(ctx,target_id)
        payload={"tenant_id":tenant_id,"user_id":user_id,"target_id":target_id,"following":True}
        self.product_store.append_record(domain="PLATFORM",record_type="FOLLOW",entity_key=f"{tenant_id}:{user_id}:{target_id}",payload=payload,observed_at=datetime.now(timezone.utc),evidence_class="DERIVED",validation_state="LOCAL_ONLY")
        return payload

    def restore_follow(self, tenant_id:str, user_id:str, target_id:str)->bool:
        record=self.product_store.latest_record("PLATFORM","FOLLOW",f"{tenant_id}:{user_id}:{target_id}")
        if record and record["payload"].get("following"):
            ctx=self.api_gateway.context(tenant_id=tenant_id,user_id=user_id)
            self.follows.follow(ctx,target_id)
            return True
        return False

    def audit_action(self, tenant_id:str, user_id:str, action:str, resource_id:str, before:Any, after:Any)->str:
        item=self.durable_operations.audit(
            tenant_id=tenant_id,actor_id=user_id,action=action,
            target_type="RESOURCE",target_id=resource_id,
            payload={"before_hash":canonical_hash(before),"after_hash":canonical_hash(after)},
        )
        return item["audit_id"]

    def put_private_state(self, *, tenant_id:str, user_id:str, key:str, value:Any)->dict[str,Any]:
        return self.durable_operations.put_private(tenant_id=tenant_id,user_id=user_id,key=key,value=value)

    def get_private_state(self, *, tenant_id:str, key:str)->Any|None:
        return self.durable_operations.get_private(tenant_id=tenant_id,key=key)

    def operations_audit(self, *, tenant_id:str)->list[dict[str,Any]]:
        return self.durable_operations.audit_for(tenant_id=tenant_id)

    def submit_operation_job(self, *, operation:str, payload:dict[str,Any], idempotency_key:str, run_now:bool=True, max_attempts:int=3)->dict[str,Any]:
        job=self.durable_jobs.submit(operation=operation,payload=payload,idempotency_key=idempotency_key)
        return self.durable_jobs.run(job["job_id"],max_attempts=max_attempts) if run_now else job

    def get_operation_job(self, job_id:str)->dict[str,Any]|None:
        return self.durable_jobs.get(job_id)

    def product_summary(self)->dict[str,Any]:
        modes={"SPACE":self.space_snapshot(),"CONTROL":self.control_snapshot(),"ORBIT":self.orbit_snapshot(),"INTELLIGENCE":self.intelligence_snapshot(),"ARCHIVE":self.archive_snapshot()}
        return {"version":self.version,"universe":self.universe.as_json(),"foundation_counts":self.repo.counts(),"product_counts":self.product_store.counts(),"modes":modes,"scientific_boundaries":{"live_provider_verified":False,"production_db_verified":False,"offline_space_ephemeris":"RESEARCH_ONLY","validation_orbit":"SCREENING_ONLY","collision_probability_without_covariance":None}}
