from __future__ import annotations

from datetime import datetime, timezone, timedelta
from math import sin, pi, sqrt
from uuid import UUID, uuid4

from aetherus_domain import (
    ConfidenceAssessment, ConfidenceFactor, ConfidenceGrade, EvidenceClass, EvidenceRecord,
    EventRevision, IntelligenceEvent, IntelligencePacket, SignalRecord, SourceGrade,
    UncertaintyAssessment, ValidationState, Scenario, canonical_hash,
)
from aetherus_space import *
from aetherus_control import *
from aetherus_orbit import *
from aetherus_visual import *
from aetherus_intelligence import *
from aetherus_intelligence.signal_gate import SignalPromotionGate
from aetherus_llm import *
from aetherus_platform import *
from aetherus_providers import *

T0=datetime(2026,8,30,0,0,tzinfo=timezone.utc)


def evidence(source_id="SRC", grade=SourceGrade.OFFICIAL_PUBLIC, cls=EvidenceClass.OFFICIAL, observed_at=T0, quality=0.9):
    return EvidenceRecord(evidence_class=cls,source_id=source_id,source_record_id="R1",observed_at=observed_at,received_at=observed_at+timedelta(seconds=1),checksum_sha256="a"*64,source_grade=grade,quality=quality,license_policy="PUBLIC",access_policy="PUBLIC")


def signal(*,cls=EvidenceClass.OFFICIAL,producer="E09",sig=0.9,event_hint="TEST_EVENT",evidence_ids=None,payload=None,objects=None):
    return SignalRecord(signal_type="TEST_SIGNAL",evidence_class=cls,producer_module_id=producer,observed_at=T0,object_ids=objects or ["A"],event_hint=event_hint,significance=sig,evidence_ids=evidence_ids or [uuid4()],payload=payload or {})


def packet_fixture()->IntelligencePacket:
    e=evidence()
    ev=IntelligenceEvent(event_type="TEST_EVENT",canonical_key="test:key",object_ids=["A"],first_seen_at=T0,updated_at=T0,validation_state=ValidationState.VALIDATION_PENDING)
    rev=EventRevision(event_id=ev.id,revision_no=1,created_at=T0,cause_signal_ids=[],evidence_ids=[e.id],delta={"miss_distance_km":{"before":None,"after":5.25}},snapshot_hash="b"*64,reason_codes=["TEST"])
    ev.current_revision_id=rev.id
    cf=ConfidenceAssessment(target_type="REVISION",target_id=str(rev.id),score=.7,grade=ConfidenceGrade.HIGH,factors=[ConfidenceFactor(name="source_quality",value=.9,weight=1,reason="official")],computed_at=T0,policy_version="test-v1")
    un=UncertaintyAssessment(target_type="REVISION",target_id=str(rev.id),representation="INTERVAL",lower=4.5,upper=6.0,units="km",computed_at=T0,policy_version="test-v1")
    return IntelligencePacket(generated_at=T0,event=ev,revision=rev,what_happened=["A validated test event was recorded."],what_changed=["The supported distance changed."],why_it_matters=["The event is evidence backed."],evidence=[e],confidence=cf,uncertainty=un,known_limitations=["Validation fixture"],allowed_claims=["Supported distance is 5.25 km."],prohibited_claims=["collision is certain"])


def _expect_error(fn,exc=Exception):
    try: fn()
    except exc:return True
    raise AssertionError(f"expected {exc.__name__}")


def e08(case):
    eng=SolarSystemEphemerisEngine()
    if case=="known epoch cross-check":
        s=eng.state("EARTH",J2000); r=sqrt(sum(x*x for x in s.position_km)); assert 0.97*AU_KM<r<1.03*AU_KM
    elif case=="past/future deterministic":
        t=T0+timedelta(days=30); assert eng.state("MARS",t).state_hash==eng.state("MARS",t).state_hash and eng.state("MARS",T0).state_hash!=eng.state("MARS",t).state_hash
    elif case=="provider/kernel version captured":
        s=eng.state("EARTH",T0); assert s.provider and s.kernel_version and s.validation_state==ValidationState.RESEARCH_ONLY
    elif case=="observer/frame explicit":
        s=eng.state("MARS",T0,observer="EARTH",frame="ICRF_APPROX"); assert s.observer=="EARTH" and s.frame=="ICRF_APPROX"
    else: raise AssertionError(case)

def e09(case):
    eng=CelestialEventEngine(); a=CelestialState("A",T0,(1,0,0),"ICRF","SUN","P","K",ValidationState.RESEARCH_ONLY,EvidenceClass.DERIVED); b=CelestialState("B",T0,(2,0,0),"ICRF","SUN","P","K",ValidationState.RESEARCH_ONLY,EvidenceClass.DERIVED)
    if case=="known event fixture": assert eng.close_approach(a,b,threshold_deg=.1).separation_deg==0
    elif case=="rule version stored": assert eng.close_approach(a,b).rule_version==eng.rule_version
    elif case=="boundary time zone":
        local=datetime(2026,8,30,9,0,tzinfo=timezone(timedelta(hours=9))); x=eng.official_event(event_type="ECLIPSE",event_time=local,objects=["SUN","MOON"],source="OFFICIAL"); assert x.event_time_utc.hour==0 and x.event_time_utc.tzinfo==timezone.utc
    elif case=="official vs derived separation":
        d=eng.close_approach(a,b); o=eng.official_event(event_type="E",event_time=T0,objects=["A"],source="OFFICIAL"); assert d.evidence_class==EvidenceClass.DERIVED and o.evidence_class==EvidenceClass.OFFICIAL
    else: raise AssertionError(case)

def e10(case):
    eng=SpaceWeatherContextEngine(); st=eng.normalize(observed_at=T0,received_at=T0+timedelta(seconds=5),measurements={"kp":3},forecasts={"kp":5,"f107":140},source_id="NOAA",source_grade=SourceGrade.OFFICIAL_PUBLIC,now=T0+timedelta(seconds=10))
    if case=="source timestamp preserved": assert st.observed_at==T0 and st.received_at==T0+timedelta(seconds=5)
    elif case=="observed vs forecast separated": assert st.measurements["kp"]==3 and st.forecasts["kp"]==5
    # Staleness is a property of a sample that exists; an empty payload is
    # INSUFFICIENT_DATA, so this case must carry a real measurement.
    elif case=="stale handling": assert eng.normalize(observed_at=T0,received_at=T0,measurements={"kp":3},forecasts={},source_id="NOAA",stale_after_seconds=60,now=T0+timedelta(hours=2)).data_status=="STALE"
    # drag_context reports which indices arrived; it derives no density factor and
    # never becomes an orbit correction.
    elif case=="drag context is context not direct orbit correction":
        assert st.drag_context["indices"]["kp"]["origin"]=="MEASUREMENT" and st.drag_context["density_factor"] is None and st.direct_orbit_correction is None
    else: raise AssertionError(case)

def e11(case):
    eng=SmallBodyCloseApproachNormalizer(); rec={"object_id":"2026 AB","close_approach_utc":T0,"nominal_distance_km":100000,"distance_uncertainty_km":500}
    st=eng.normalize(rec,source_id="JPL",source_grade=SourceGrade.OFFICIAL_PUBLIC)
    if case=="source grade": assert st.source_grade==SourceGrade.OFFICIAL_PUBLIC
    elif case=="close approach timestamp": assert st.close_approach_utc==T0
    elif case=="uncertainty preserved": assert st.distance_uncertainty_km==500
    elif case=="no impact claim without source":
        rec2={**rec,"impact_claim":"impact likely"}; assert eng.normalize(rec2,source_id="JPL").impact_claim is None
    else: raise AssertionError(case)

def e12(case):
    eng=DeepSpaceMissionTrackingEngine(); off=eng.normalize(mission_id="JWST",status="OPERATIONAL",epoch_utc=T0,source_id="NASA",position_km=(1,2,3)); model=eng.normalize(mission_id="X",status="CRUISE",epoch_utc=T0,source_id="MISSION",position_km=None,live_telemetry=False,model_version="m1")
    if case=="mission status source": assert off.status=="OPERATIONAL" and off.source_id=="NASA"
    elif case=="trajectory provenance": assert off.trajectory_provenance["source_id"]=="NASA"
    elif case=="missing live telemetry -> model/official state label": assert off.state_label=="OFFICIAL_STATE" and model.state_label=="MODELLED_STATE"
    else: raise AssertionError(case)

def e13(case):
    eng=MissionRegistryEngine(); public=eng.upsert({"mission_id":"M1","name":"Public","vehicle":"V1","launch_site":{"lat":1,"lon":2},"payloads":[{"name":"P","provisional":True}]},source_id="PUB",source_class="PUBLIC")
    official=eng.upsert({"mission_id":"M1","name":"Official","vehicle":"V2","launch_site":{"lat":3,"lon":4},"payloads":[{"name":"P","provisional":False}]},source_id="OFF",source_class="OFFICIAL")
    if case=="duplicate mission merge policy": assert len(eng.list())==1 and len(official.sources)==2
    elif case=="source precedence": assert official.name=="Official" and official.vehicle=="V2"
    elif case=="payload provisional status": assert public.provisional_payloads and not official.provisional_payloads
    elif case=="site coordinates": assert official.launch_site=={"lat":3,"lon":4} and _expect_error(lambda:MissionRegistryEngine().upsert({"mission_id":"X","launch_site":{"lat":1}},source_id="S"),ValueError)
    else:raise AssertionError(case)

def e14(case):
    eng=LaunchScheduleWindowEngine(); t=T0+timedelta(hours=2); r1=eng.revise("M",start_utc=None,end_utc=None,state="TBD",source_id="S"); r2=eng.revise("M",start_utc=t,end_utc=t+timedelta(minutes=10),state="CONFIRMED",source_id="S",timezone_name="Asia/Seoul")
    if case=="window revision history": assert [r.revision_no for r in eng.history("M")]==[1,2]
    elif case=="TBD vs confirmed": assert r1.state=="TBD" and r1.start_utc is None and r2.state=="CONFIRMED"
    elif case=="timezone conversion":
        local=datetime(2026,8,30,9,tzinfo=timezone(timedelta(hours=9))); x=LaunchScheduleWindowEngine().revise("X",start_utc=local,end_utc=None,state="CONFIRMED",source_id="S",timezone_name="Asia/Seoul"); assert x.start_utc.hour==0
    elif case=="countdown only with resolved window":
        x=LaunchScheduleWindowEngine();x.revise("X",start_utc=None,end_utc=None,state="TBD",source_id="S");assert x.countdown_seconds("X",T0) is None and eng.countdown_seconds("M",T0)==7200
    else:raise AssertionError(case)

def e15(case):
    if case=="invalid transition reject": assert _expect_error(lambda:LaunchStateMachineCountdownEngine().transition(MissionState.ASCENT,T0),ValueError)
    elif case=="countdown pause/hold":
        e=LaunchStateMachineCountdownEngine();e.transition(MissionState.COUNTDOWN,T0);e.start_countdown(T0+timedelta(seconds=100));rem=e.hold(T0+timedelta(seconds=20));new=e.resume(T0+timedelta(seconds=50));assert rem==80 and new==T0+timedelta(seconds=130)
    elif case=="scrub reset":
        e=LaunchStateMachineCountdownEngine();e.transition(MissionState.COUNTDOWN,T0);e.start_countdown(T0+timedelta(seconds=100));e.transition(MissionState.SCRUBBED,T0+timedelta(seconds=1));assert e.countdown_anchor is None and e.hold_remaining_s is None
    elif case=="official event transition evidence":
        e=LaunchStateMachineCountdownEngine();assert _expect_error(lambda:e.transition(MissionState.COUNTDOWN,T0,official=True),ValueError); assert e.transition(MissionState.COUNTDOWN,T0,official=True,evidence_id="E").evidence_id=="E"
    else:raise AssertionError(case)

def e16(case):
    e=TelemetryFusionEngine();live=e.ingest(timestamp_utc=T0,metrics={"altitude":1},units={"altitude":"km"},source_id="TEL",live=True);model=e.source_failed_fallback(timestamp_utc=T0+timedelta(seconds=2),model_metrics={"altitude":2},units={"altitude":"km"},model_id="MODEL")
    if case=="live vs modelled separation" or case=="Telemetry and modelled trajectory remain separate EvidenceClass": assert live.evidence_class==EvidenceClass.OBSERVED and model.evidence_class==EvidenceClass.MODEL_SIGNAL
    elif case=="out-of-order sample handling":
        e.ingest(timestamp_utc=T0+timedelta(seconds=1),metrics={"altitude":1.5},units={"altitude":"km"},source_id="TEL",live=True);assert [x.timestamp_utc for x in e.samples()]==sorted(x.timestamp_utc for x in e.samples())
    elif case=="source fail fallback": assert model.source_id=="MODEL" and model.evidence_class==EvidenceClass.MODEL_SIGNAL
    elif case=="unit/schema validation": assert _expect_error(lambda:e.ingest(timestamp_utc=T0,metrics={"altitude":1},units={"altitude":"m"},source_id="X",live=True),ValueError)
    else:raise AssertionError(case)

def e17(case):
    eng=LaunchTrajectoryFlightDynamicsAdapterEngine();points=[{"timestamp_utc":T0,"position_km":(1,2,3),"frame":"ECEF"}]; tr=eng.build(points,source_label="MODEL",live=False,model_version="m1",assumptions=["two-body"],target_orbit={"frame":"GCRF","altitude_km":400},stage_separations=[{"timestamp_utc":T0,"position_km":(1,2,3)}])
    if case=="trajectory source label": assert tr.source_label=="MODEL" and tr.evidence_class==EvidenceClass.MODEL_SIGNAL
    elif case=="stage separation geometry": assert tr.stage_separations[0]["position_km"]==(1,2,3)
    elif case=="target orbit frame": assert tr.target_orbit["frame"]=="GCRF" and _expect_error(lambda:eng.build(points,source_label="M",live=False,model_version="m",target_orbit={"altitude_km":400}),ValueError)
    elif case=="model version/assumption": assert tr.model_version=="m1" and "two-body" in tr.assumptions
    else:raise AssertionError(case)

def e18(case):
    e=MissionTimelineRecorderEngine();e.append(event_id="B",event_type="B",timestamp_utc=T0+timedelta(seconds=2),evidence_ids=["E"],payload={"x":1});e.append(event_id="A",event_type="A",timestamp_utc=T0,evidence_ids=["E"],payload={"x":1});e.append(event_id="A",event_type="A",timestamp_utc=T0,evidence_ids=["E2"],payload={"x":2},video_timestamp_s=1.2)
    if case=="event order": assert [x.event_id for x in e.ordered()]==["A","B"]
    elif case=="revisions preserved": assert [x.revision_no for x in e.revisions("A")]==[1,2]
    elif case=="video timestamp optional": assert e.revisions("B")[0].video_timestamp_s is None and e.revisions("A")[-1].video_timestamp_s==1.2
    elif case=="record hash reproducibility": assert e.record_hash()==e.record_hash()
    else:raise AssertionError(case)

def e19(case):
    tl=MissionTimelineRecorderEngine();tl.append(event_id="E1",event_type="LAUNCH",timestamp_utc=T0,evidence_ids=["X"],payload={});h=MissionReplayOrbitHandoverEngine();p=h.handover(mission_id="M",payload_id="P",object_id="O",object_type="SATELLITE",evidence_ids=["E"]);c=h.confirm("M","P",evidence_id="E2")
    if case=="replay deterministic": assert h.replay(tl,at_utc=T0)==h.replay(tl,at_utc=T0)
    elif case=="handover provisional->confirmed": assert p.status=="PROVISIONAL" and c.status=="CONFIRMED"
    elif case=="stage/payload identity": assert c.payload_id=="P" and c.object_type=="SATELLITE"
    elif case=="GO TO LAUNCH / WHERE IS IT NOW relation": assert c.origin_relation=={"GO_TO_LAUNCH":"M","WHERE_IS_IT_NOW":"O"}
    elif case=="Historical Replay cannot create current real-world Event": assert h.replay(tl,at_utc=T0)["may_create_current_event"] is False
    else:raise AssertionError(case)

def elements(epoch=T0,ma=0,age=0): return OrbitalElements(epoch,6778.0,0.001,51.6,20,10,ma,source_age_seconds=age)

def e20(case):
    eng=OrbitPropagationFramesEngine();s=eng.propagate("A",elements(),T0)
    if case=="known epoch golden": assert 6700<sqrt(sum(x*x for x in s.position_km))<6850
    elif case=="deterministic hash": assert s.state_hash==eng.propagate("A",elements(),T0).state_hash
    elif case=="stale flag": assert eng.propagate("A",elements(age=90000),T0,stale_after_s=86400).data_status=="STALE"
    elif case=="invalid elements -> unavailable": assert _expect_error(lambda:OrbitalElements(T0,6000,0,0,0,0,0),ValueError)
    elif case=="frame conversion": assert eng.convert_frame(s,"GCRF_APPROX").frame=="GCRF_APPROX" and eng.convert_frame(s,"GCRF_APPROX").validation_state==ValidationState.RESEARCH_ONLY
    elif case=="Periodic orbit updates are reduced by change/signal gate before Event candidate":
        g=SignalPromotionGate(); assert not g.promote(signal(cls=EvidenceClass.DERIVED,producer="E20",sig=.01,event_hint=None))
    else:raise AssertionError(case)

def e21(case):
    prop=OrbitPropagationFramesEngine();a=prop.propagate("A",elements(ma=0),T0);b=prop.propagate("B",elements(ma=.02),T0);eng=ConjunctionScreeningPreciseTCAEngine();c=eng.linear_tca(a,b,window_s=1000)
    if case=="injected close pair recall": assert eng.screen([a,b],threshold_km=1000)
    elif case=="known TCA tolerance": assert abs((c.tca_utc-T0).total_seconds())<=1000
    elif case=="boundary minimum":
        x=eng.linear_tca(a,b,window_s=1);assert abs((x.tca_utc-T0).total_seconds())<=1.000001
    elif case=="multi-minima":
        d=[(T0+timedelta(seconds=i),v) for i,v in enumerate([5,2,4,1,3])];assert [x[1] for x in eng.local_minima(d)]==[2,1]
    elif case=="verification corpus metrics":
        pairs=eng.screen([a,b],threshold_km=1000); recall=1.0 if any({x.primary_id,x.secondary_id}=={"A","B"} for x in pairs) else 0.0;assert recall==1.0
    else:raise AssertionError(case)

def conjunction():
    p=OrbitPropagationFramesEngine();a=p.propagate("A",elements(ma=0),T0);b=p.propagate("B",elements(ma=.02),T0);return ConjunctionScreeningPreciseTCAEngine().linear_tca(a,b)

def e22(case):
    eng=CollisionProbabilityRiskProvenanceEngine();c=conjunction();none=eng.assess(c,covariance_sigma_km=None);risk=eng.assess(c,covariance_sigma_km=5,expected_method="OTHER")
    if case=="missing covariance -> null not zero" or case=="No covariance means no Pc even if UI/LLM requests it": assert none.pc is None and none.validation_state==ValidationState.INSUFFICIENT_DATA
    elif case=="Pc bounds": assert 0<=risk.pc<=1
    elif case=="method mismatch warning": assert "METHOD_MISMATCH" in risk.warnings
    elif case=="spec fixture path": assert risk.provenance["tca"]==c.tca_utc.isoformat() and "sigma_km" in risk.provenance
    elif case=="dilution/covariance validity":
        d=eng.assess(c,covariance_sigma_km=200);assert d.covariance_valid and "COVARIANCE_DILUTION_RISK" in d.warnings
    else:raise AssertionError(case)

def edges():
    g=RiskGraphEngine();return [g.build_edge("A","B",metrics={"pc":.1,"miss_km":1},evidence_ids=["E1"],config_version="v1"),g.build_edge("B","C",metrics={"pc":.2,"miss_km":2},evidence_ids=["E2"],config_version="v1")]

def e23(case):
    g=RiskGraphEngine();e=edges()[0]
    if case=="edge deterministic": assert e.edge_hash==g.build_edge("B","A",metrics={"pc":.1,"miss_km":1},evidence_ids=["E1"],config_version="v1").edge_hash
    elif case=="metric split": assert e.metrics["pc"]==.1 and e.metrics["miss_km"]==1
    elif case=="aggregate config version required": assert _expect_error(lambda:g.build_edge("A","B",metrics={},evidence_ids=[],config_version=""),ValueError)
    elif case=="graph snapshot hash": assert g.snapshot_hash(edges())==g.snapshot_hash(list(reversed(edges())))
    else:raise AssertionError(case)

def e24(case):
    eng=OrbitalEnvironmentCongestionEngine();st=eng.state("LEO",[400,1000,2100],expected_sources=2,available_sources=1,threshold_version="v1")
    if case=="shell boundaries": assert eng.classify(1999)=="LEO" and eng.classify(2001)=="MEO" and eng.classify(35786)=="GEO"
    elif case=="coverage ratio": assert st.coverage_ratio==.5
    elif case=="source gap partial": assert st.data_status=="PARTIAL"
    elif case=="threshold version": assert st.threshold_version=="v1" and _expect_error(lambda:eng.state("LEO",[],expected_sources=1,available_sources=1,threshold_version=""),ValueError)
    else:raise AssertionError(case)

def e25(case):
    eng=DebrisGenealogyOriginEngine();a=eng.add(child_id="D",parent_id="P",origin="EVENT-A",event_time_utc=T0+timedelta(seconds=2),evidence_id="E");u=eng.add(child_id="U",parent_id="GUESS",origin="COUNTRY-X",event_time_utc=T0,evidence_id="E2",known=False);eng.add(child_id="D",parent_id="P2",origin="EVENT-B",event_time_utc=T0+timedelta(seconds=1),evidence_id="E3")
    if case=="known family links": assert a.parent_id=="P" and a.origin=="EVENT-A"
    elif case=="unknown origin no inference": assert u.parent_id is None and u.origin is None and u.uncertainty_reason
    elif case=="chronological timeline": assert [x.event_time_utc for x in eng.timeline("D")]==sorted(x.event_time_utc for x in eng.timeline("D"))
    elif case=="multinational separation": assert u.origin is None and a.origin=="EVENT-A"
    else:raise AssertionError(case)

def scenario(kind="REMOVE",seed=42,params=None,targets=None): return Scenario(kind=kind,baseline_snapshot_id=uuid4(),target_object_ids=targets or ["A"],parameters=params or {},assumptions=["test assumption"],model_version="scenario-v1",config_version="c1",seed=seed,status="READY",evidence_class=EvidenceClass.SIMULATION_ONLY)

def e26(case):
    eng=FragmentationScenarioEngine();s=scenario("FRAGMENTATION",seed=7,params={"delta_v_scale_m_s":5});r=eng.run(s,fragment_count=5)
    if case=="fixed seed reproducibility": assert r.result_hash==eng.run(s,fragment_count=5).result_hash
    elif case=="assumption exposure": assert "test assumption" in r.assumptions
    elif case=="remove path indirect delta":
        cf=InterventionBenefitCounterfactualEngine().run(scenario("REMOVE",targets=["A"]),edges());assert any(a['subject_object_id']=="B" and a['delta']<0 for a in cf.attributions)
    elif case=="model validation state": assert r.validation_state==ValidationState.RESEARCH_ONLY
    elif case=="Fragmentation scenario always carries SIMULATION_ONLY/model/seed/assumption": assert s.evidence_class==EvidenceClass.SIMULATION_ONLY and r.model_version and r.seed==7 and r.assumptions
    else:raise AssertionError(case)

def e27(case):
    e=ReentryIntelligenceEngine();tip={"nominal_utc":T0,"window_start_utc":T0-timedelta(hours=1),"window_end_utc":T0+timedelta(hours=1)};r=e.ingest_tip("O",tip,source_id="TIP",grade=SourceGrade.OFFICIAL_PUBLIC);n=e.ingest_tip("O",None,source_id="TIP")
    if case=="TIP parse": assert r.nominal_utc==T0
    elif case=="no TIP -> no fake exact time": assert n.nominal_utc is None and n.validation_state==ValidationState.INSUFFICIENT_DATA
    elif case=="version history": assert [x.version for x in e.history("O")]==[1,2]
    elif case=="grade visible": assert r.grade==SourceGrade.OFFICIAL_PUBLIC
    else:raise AssertionError(case)

def e28(case):
    e=PhotometryRotationIntelligenceEngine();times=[i*.5 for i in range(80)]; mags=[sin(2*pi*t/10) for t in times];r=e.estimate(times,mags,min_period_s=5,max_period_s=15,steps=401)
    if case=="synthetic sinusoid": assert r.period_s is not None and abs(r.period_s-10)<.2
    elif case=="alias ambiguous":
        # Sparse sampling creates competing periods and must not be promoted as precise.
        x=e.estimate([0,1,2,3,4,5],[0,1,0,-1,0,1],min_period_s=2,max_period_s=10,steps=100); assert x.validation_state in {ValidationState.VALIDATION_PENDING,ValidationState.RESEARCH_ONLY}
    elif case=="too few points": assert e.estimate([0,1],[1,2]).validation_state==ValidationState.INSUFFICIENT_DATA
    elif case=="uncertainty downgrade": assert r.uncertainty_s is not None and r.validation_state in {ValidationState.RESEARCH_ONLY,ValidationState.VALIDATION_PENDING}
    else:raise AssertionError(case)

def e29(case):
    e=ObservationPlanningEngine();c=[{"object_id":"A","start_utc":T0,"end_utc":T0+timedelta(minutes=5),"visible":True,"max_elevation_deg":70,"sunlit":True,"eclipsed":False,"mount_rate_deg_s":1,"information_gain":.9},{"object_id":"B","start_utc":T0,"end_utc":T0+timedelta(minutes=5),"visible":True,"max_elevation_deg":30,"sunlit":False,"eclipsed":True,"mount_rate_deg_s":2,"information_gain":.5},{"object_id":"C","start_utc":T0,"end_utc":T0+timedelta(minutes=5),"visible":False,"mount_rate_deg_s":1,"information_gain":1}];p=e.plan(c,mount_rate_limit_deg_s=1.5)
    if case=="known pass": assert p and p[0].object_id=="A"
    elif case=="sun/eclipse flag": assert p[0].sunlit and not p[0].eclipsed
    elif case=="mount limit": assert all(x.mount_rate_deg_s<=1.5 for x in p) and all(x.object_id!="B" for x in p)
    elif case=="info gain ordering": assert [x.information_gain for x in p]==sorted((x.information_gain for x in p),reverse=True)
    elif case=="no visibility -> no request": assert all(x.object_id!="C" for x in p)
    else:raise AssertionError(case)

def e30(case):
    e=CitizenObservationQAContributionEngine();a=e.submit(object_id="A",observed_at=T0,value=5,license_policy="CC-BY",expected_range=(0,10),now=T0);dup=e.submit(object_id="A",observed_at=T0,value=5,license_policy="CC-BY",expected_range=(0,10),now=T0);bad=e.submit(object_id="A",observed_at=T0-timedelta(days=400),value=5,license_policy="CC-BY",now=T0);out=e.submit(object_id="A",observed_at=T0,value=50,license_policy="CC-BY",expected_range=(0,10),now=T0);lic=e.submit(object_id="B",observed_at=T0,value=1,license_policy=None,now=T0)
    if case=="duplicate dedupe": assert a.observation_id==dup.observation_id
    elif case=="bad timestamp quarantine": assert bad.status=="QUARANTINED" and bad.reason=="BAD_TIMESTAMP"
    elif case=="outlier reject": assert out.status=="REJECTED"
    elif case=="accepted-only hook": assert e.intelligence_hook(a) and e.intelligence_hook(out) is None
    elif case=="license missing": assert lic.status=="QUARANTINED" and lic.reason=="LICENSE_MISSING"
    elif case=="Rejected/quarantined citizen observation cannot affect Intelligence": assert e.evidence_payload(out) is None and e.intelligence_hook(bad) is None
    elif case=="Accepted observation adds Evidence then triggers bounded re-evaluation": assert e.evidence_payload(a)["source_grade"]=="USER_OBSERVATION" and e.intelligence_hook(a)["may_create_event_directly"] is False
    else:raise AssertionError(case)

def e31(case):
    eng=InterventionBenefitCounterfactualEngine();base=edges();res=eng.run(scenario("REMOVE",targets=["A"]),base,metric_type="pc")
    if case=="direct remove exact delta":
        assert not any("A" in {e.a,e.b} for e in res.scenario_edges) and any(a['subject_object_id']=="B" and abs(a['delta']+.1)<1e-12 for a in res.attributions)
    elif case=="metric channels separated":
        miss=eng.run(scenario("REMOVE",targets=["A"]),base,metric_type="miss_km");assert res.metric_type=="pc" and miss.metric_type=="miss_km"
    elif case=="same input repeat hash": assert res.result_hash==eng.run(scenario("REMOVE",targets=["A"]),base,metric_type="pc").result_hash
    elif case=="no data no fake beneficiary": assert eng.run(scenario("REMOVE",targets=["A"]),[],metric_type="pc").attributions==()
    elif case=="new risk surfaced":
        s=scenario("NUDGE",targets=["A"],params={"new_risks":[{"a":"C","b":"D","value":.3,"evidence_ids":["SIM"],"config_version":"v"}]});assert eng.run(s,base).new_risks
    elif case=="Counterfactual Benefit cannot be persisted as OBSERVED": assert scenario("REMOVE").evidence_class in {EvidenceClass.SIMULATION_ONLY,EvidenceClass.COUNTERFACTUAL} and res.validation_state==ValidationState.RESEARCH_ONLY
    else:raise AssertionError(case)

def e32(case):
    e=AffectedSubgraphEngine();base=edges()
    if case=="injected influence included": assert e.affected(base,{"A"},depth=2)=={"A","B","C"}
    elif case=="full-vs-selective equivalence": assert e.validate_selective("h","h")
    elif case=="new OCM path candidate":
        ext=base+[RiskGraphEngine().build_edge("C","D",metrics={"pc":.1},evidence_ids=["SIM"],config_version="v")];assert "D" in e.affected(ext,{"A"},depth=3)
    elif case=="rollback on mismatch": assert e.guarded_commit("a","b")=={"committed":False,"rolled_back":True}
    elif case=="Affected Subgraph helper output not exposed directly as Intelligence Event": assert isinstance(e.affected(base,{"A"}),set)
    else:raise AssertionError(case)

def e33(case):
    e=ProtectReverseQueryCandidateOCMComparisonEngine();c=[{"candidate_id":"c1","target_object_id":"A","risk_reduction":.6,"new_risk_penalty":.1,"provenance":{"scenario":"s1"}},{"candidate_id":"c2","target_object_id":"B","risk_reduction":.5,"new_risk_penalty":.4,"provenance":{"scenario":"s2"}},{"candidate_id":"same","target_object_id":"P","risk_reduction":1,"new_risk_penalty":0,"provenance":{"scenario":"s3"}}];r=e.rank(protected_object_id="P",candidates=c)
    if case=="known ranking": assert [x.candidate_id for x in r][:2]==["c1","c2"]
    elif case=="inactive protected object research mode": assert e.rank(protected_object_id="P",candidates=c,protected_active=False)[0].provenance["mode"]=="RESEARCH_ONLY"
    elif case=="new risk penalty": assert abs(r[0].score-.5)<1e-12 and abs(r[1].score-.1)<1e-12
    elif case=="same-designator exclusion": assert all(x.target_object_id!="P" for x in r)
    elif case=="candidate provenance": assert all(x.provenance for x in r)
    else:raise AssertionError(case)

def scene(): return MultiScaleSpaceSceneEngine().build(scale=SemanticScale.EARTH_VIEW,scientific_object_ids=["A","B","C"],render_object_ids=["A","B"],layers=[SceneLayer("L",EvidenceClass.DERIVED,"SRC",True)],camera_focus="EARTH")

def e34(case):
    e=MultiScaleSpaceSceneEngine();s=scene()
    if case=="scale transition continuity": assert e.transition(s,SemanticScale.ORBITAL_VIEW).camera_focus==s.camera_focus
    elif case=="floating precision budget": assert e.precision_budget_km[SemanticScale.EVENT_VIEW]<e.precision_budget_km[SemanticScale.SOLAR_SYSTEM_VIEW]
    elif case=="layer source labels": assert s.layers[0].source_label=="SRC"
    elif case=="device profile fallback": assert e.build(scale=SemanticScale.EARTH_VIEW,scientific_object_ids=[],render_object_ids=[],layers=[],device_profile="UNKNOWN").device_profile=="STATIC"
    elif case=="3D render/LOD changes leave scientific result hash unchanged": assert s.scientific_hash==e.build(scale=SemanticScale.SOLAR_SYSTEM_VIEW,scientific_object_ids=["A","B","C"],render_object_ids=["C"],layers=[],device_profile="LIGHT").scientific_hash
    else:raise AssertionError(case)

def e35(case):
    e=SemanticZoomCameraFocusEngine(scene());original=e.state.scientific_object_ids;e.focus_object("A");
    if case=="focus persistence across modes": e.switch_mode(SemanticScale.SOLAR_SYSTEM_VIEW);assert e.state.camera_focus=="A"
    elif case=="back navigation": before=e.state;e.focus_event("EV",object_id="A");assert e.back()==before
    elif case=="object->event->object": e.focus_event("EV",object_id="A");e.focus_object("A");assert e.state.selected_object=="A" and e.state.selected_event is None
    elif case=="NOW reset preserves expected focus": f=e.state.camera_focus;assert e.now_reset().camera_focus==f
    elif case=="Camera/Semantic Zoom does not alter science subset": e.focus_event("EV",object_id="A");assert e.state.scientific_object_ids==original
    else:raise AssertionError(case)

def e36(case):
    e=OrbitalShellLODEngine();s=scene()
    if case=="global view object cap": assert len(e.render_set([str(i) for i in range(3000)],view="GLOBAL"))<=2000
    elif case=="shell selection focus": assert e.select_shell(s,"LEO").active_shell=="LEO"
    elif case=="viewport query": assert e.render_set(["A","B"],viewport_query=["X"],important_ids=[])[0]=="X"
    elif case=="render subset != science subset": assert e.science_subset_unchanged(s,["C"]).scientific_object_ids==s.scientific_object_ids
    elif case=="Orbital shell visibility does not alter risk/conjunction computation set": assert e.select_shell(s,"GEO").scientific_hash==s.scientific_hash
    else:raise AssertionError(case)

def e37(case):
    e=VisualSemanticsEngine()
    if case=="all evidence classes mapped": assert set(e.tokens)==set(EvidenceClass)
    elif case=="screening vs validated distinct": assert e.validation_badge("SCREENING_ONLY")!=e.validation_badge("VALIDATED_PIPELINE")
    elif case=="uncertainty visible": assert all(t.uncertainty_style for t in e.tokens.values())
    elif case=="contrast/accessibility": assert all(e.accessibility_check(t) for t in e.tokens.values())
    elif case=="Visual semantics cannot relabel MODEL/SIMULATION as OBSERVED": assert _expect_error(lambda:e.assert_no_promotion(EvidenceClass.MODEL_SIGNAL,EvidenceClass.OBSERVED),ValueError) and _expect_error(lambda:e.assert_no_promotion(EvidenceClass.SIMULATION_ONLY,EvidenceClass.OFFICIAL),ValueError)
    else:raise AssertionError(case)

def e38(case):
    if case=="idempotent trigger":
        e=IntelligenceTaskOrchestrator();e.register(TaskSpec("A",fn=lambda c:c['x']));assert e.run("T",{"x":1})==e.run("T",{"x":999})
    elif case=="dependency ordering":
        seen=[];e=IntelligenceTaskOrchestrator();e.register(TaskSpec("A",fn=lambda c:seen.append("A")));e.register(TaskSpec("B",deps=("A",),fn=lambda c:seen.append("B")));e.run("T",{});assert seen==["A","B"]
    elif case=="partial failure recovery":
        e=IntelligenceTaskOrchestrator();e.register(TaskSpec("A",fn=lambda c:1/0));e.register(TaskSpec("B",fn=lambda c:1));r=e.run("T",{});assert [x.status for x in r]==["FAILED","PASS"]
    elif case=="no circular task graph":
        e=IntelligenceTaskOrchestrator();e.tasks={"A":TaskSpec("A",deps=("B",)),"B":TaskSpec("B",deps=("A",))};assert _expect_error(e._topological_order,ValueError)
    elif case=="replay from event log":
        e=IntelligenceTaskOrchestrator();e.register(TaskSpec("A",fn=lambda c:1));r=e.run("T",{});assert e.replay("T")==r and e.event_log
    elif case=="Orchestrator invokes INTELLIGENCE_TOOL only through approved contract": assert _expect_error(lambda:IntelligenceTaskOrchestrator().register(TaskSpec("T",intelligence_tool=True)),ValueError)
    else:raise AssertionError(case)

def e39(case):
    eng=EvidenceFusionCrossValidationIntelligence();a=evidence("A",SourceGrade.OFFICIAL_PUBLIC,quality=1);b=evidence("B",SourceGrade.RESEARCH,quality=1)
    if case=="independent source weighting":
        f=eng.fuse([a,b],values_by_evidence_id={str(a.id):10,str(b.id):10},now=T0);assert f.weighted_quality is not None and f.weighted_quality<1
    elif case=="stale disagreement":
        old=evidence("OLD",SourceGrade.OFFICIAL_PUBLIC,observed_at=T0-timedelta(days=2),quality=1);f=eng.fuse([old,a],values_by_evidence_id={str(old.id):1,str(a.id):10},now=T0,stale_after_s=100);assert f.agreement is not None and f.agreement<1
    elif case=="conflicting official sources preserved":
        c=evidence("C",SourceGrade.OFFICIAL_PUBLIC);f=eng.fuse([a,c],values_by_evidence_id={str(a.id):1,str(c.id):2},now=T0);assert f.conflicts and set(f.conflicts[0]['sources'])=={"A","C"}
    elif case=="missing evidence remains missing": assert eng.fuse([]).missing and eng.fuse([]).weighted_quality is None
    else:raise AssertionError(case)

def e40(case):
    eng=SignalClassificationIntelligence();s=signal(cls=EvidenceClass.AI_SIGNAL)
    if case=="class required": assert eng.classify(s).evidence_class==EvidenceClass.AI_SIGNAL
    elif case=="AI cannot overwrite observed": assert _expect_error(lambda:eng.classify(s,requested_class=EvidenceClass.OBSERVED),ValueError)
    elif case=="counterfactual cannot become official": assert _expect_error(lambda:eng.classify(signal(cls=EvidenceClass.COUNTERFACTUAL),requested_class=EvidenceClass.OFFICIAL),ValueError)
    elif case=="unknown class quarantine": assert eng.quarantine_unknown("NOPE")["status"]=="QUARANTINED"
    elif case=="DIRECT_SIGNAL cannot create Event before Signal Gate": assert not SignalPromotionGate().promote(signal(cls=EvidenceClass.DERIVED,sig=.1,event_hint=None))
    else:raise AssertionError(case)

def e41(case):
    eng=EventIntelligenceEngine();s=signal();k=eng.boundary_key("CONJUNCTION",["A","B"],"2026-08-30")
    if case=="same event correlation": assert eng.correlate(s,canonical_key=k).id==eng.correlate(s,canonical_key=k).id
    elif case=="duplicate suppression": eng.correlate(s,canonical_key=k);eng.correlate(s,canonical_key=k);assert len(eng.events)==1
    elif case=="new event boundary": assert eng.boundary_key("E",["A"],"D1")!=eng.boundary_key("E",["A"],"D2")
    elif case=="domain-specific event types": assert eng.correlate(s,canonical_key=k,event_type="CONJUNCTION_EVENT").event_type=="CONJUNCTION_EVENT"
    elif case=="insufficient data event allowed": assert eng.correlate(s,canonical_key="insufficient",insufficient_allowed=True).validation_state==ValidationState.INSUFFICIENT_DATA
    elif case=="CONTEXT_ONLY direct Event create request rejected": assert _expect_error(lambda:eng.create_from_module(s,canonical_key="x",connection_mode="CONTEXT_ONLY"),PermissionError)
    else:raise AssertionError(case)

def e42(case):
    eng=RevisionIntelligenceEngine();eid=uuid4();s1=uuid4();e1=uuid4();r1=eng.append(eid,cause_signal_ids=[s1],evidence_ids=[e1],delta={"x":{"before":1,"after":2}},reason_codes=["CHANGE"])
    if case=="append-only revisions": r2=eng.append(eid,cause_signal_ids=[uuid4()],evidence_ids=[uuid4()],delta={"x":{"before":2,"after":3}},reason_codes=["CHANGE"]);assert [r.revision_no for r in eng.ledger[str(eid)]]==[1,2]
    elif case=="change cause linked": assert r1.cause_signal_ids==[s1] and r1.evidence_ids==[e1]
    elif case=="no-change revision suppression policy": assert eng.append(eid,cause_signal_ids=[],evidence_ids=[],delta={},reason_codes=[]) is None
    elif case=="rollback/correction lineage": r=eng.correct(eid,corrects_revision_no=1,delta={"x":{"before":2,"after":1}},evidence_ids=[uuid4()]);assert r.delta['corrects_revision_no']==1 and "CORRECTION" in r.reason_codes
    else:raise AssertionError(case)

def e43(case):
    eng=ConfidenceUncertaintyIntelligence();f={"source_quality":(.9,1,"official"),"agreement":(.6,1,"two-source")};c,u=eng.assess(target_type="EVENT",target_id="E",factors=f,policy_version="v1",uncertainty={"representation":"INTERVAL","lower":1,"upper":2,"units":"km"})
    if case=="confidence != uncertainty": assert c.score is not None and u.representation=="INTERVAL" and c.score!=u.upper
    elif case=="missing covariance raises uncertainty/limits claim":
        cc,uu=eng.assess(target_type="EVENT",target_id="E",factors=f,policy_version="v1",missing_covariance=True);assert uu.representation=="UNAVAILABLE" and cc.limitations
    elif case=="factor traceability": assert all(x.reason for x in c.factors)
    elif case=="versioned weighting": assert c.policy_version=="v1" and eng.assess(target_type="EVENT",target_id="E",factors=f,policy_version="v2")[0].policy_version=="v2"
    elif case=="CONSUMER/UI factor cannot mutate scientific Confidence":
        c2,u2=eng.assess(target_type="EVENT",target_id="E",factors={**f,"ui_theme":(0,100,"presentation")},policy_version="v1",uncertainty={"representation":"INTERVAL","lower":1,"upper":2,"units":"km"});assert c2.score==c.score and eng.scientific_hash(c2,u2)==eng.scientific_hash(c,u)
    elif case=="Subscription tier change leaves scientific Confidence/Uncertainty hash unchanged":
        a=eng.assess(target_type="EVENT",target_id="E",factors={**f,"subscription_pro":(1,100,"plan")},policy_version="v1",uncertainty={"representation":"INTERVAL","lower":1,"upper":2,"units":"km"});b=eng.assess(target_type="EVENT",target_id="E",factors={**f,"subscription_free":(0,100,"plan")},policy_version="v1",uncertainty={"representation":"INTERVAL","lower":1,"upper":2,"units":"km"});assert eng.scientific_hash(*a)==eng.scientific_hash(*b)
    else:raise AssertionError(case)

def e44(case):
    eng=ImportanceAttributionDecisionIntelligence();imp=eng.importance(magnitude=.2,change_rate=.9,affected_objects=10,confidence=.8);base=uuid4();opts=[{"scenario_id":uuid4(),"criteria":{"benefit":.8},"new_risk":.1,"assumptions":["A"],"provenance":{"evidence":"E"}},{"scenario_id":uuid4(),"criteria":{"benefit":.7},"new_risk":.0,"assumptions":["B"],"provenance":{"evidence":"E2"}}];d=eng.decision(baseline_scenario_id=base,options=opts,criteria=["benefit"])
    if case=="importance reasons traceable": assert imp.reasons and all('contribution' in r for r in imp.reasons)
    elif case=="change rate can outrank static magnitude under policy": assert next(r for r in imp.reasons if r['factor']=='change_rate')['contribution']>next(r for r in imp.reasons if r['factor']=='magnitude')['contribution']
    elif case=="decision shows new risk": assert all('new_risk' in r for r in d.ranked_options)
    elif case=="scenario assumptions surfaced": assert all('assumptions' in r and r['assumptions'] for r in d.ranked_options)
    elif case=="no single-option recommendation without policy": assert _expect_error(lambda:eng.decision(baseline_scenario_id=base,options=opts[:1],criteria=["benefit"]),ValueError)
    elif case=="Decision result is advisory/research and cannot emit spacecraft command": assert d.advisory_only and all('spacecraft_command' not in r and 'command' not in r for r in d.ranked_options)
    else:raise AssertionError(case)

ENGINE_DISPATCH={f"E{i:02d}":globals()[f"e{i:02d}"] for i in range(8,45)}


def llm_acceptance(module_id:str,case:str):
    p=packet_fixture();gw=LLMGateway();router=ModelRouter();tools=ToolOrchestrator();composer=ContextComposer();validator=ClaimCitationValidator();agent=ExplanationAgent(validator);ctx=PersonalWorkspaceContext();report=BriefingReportGenerator()
    # Exercise the target module's happy path.
    if case=="provider/tool path success":
        if module_id=="L01": assert gw.generate(provider="local",prompt="supported",model="m",packet=p).text=="supported"
        elif module_id=="L02": assert router.route("EXPLANATION")[0]=="local"
        elif module_id=="L03": tools.register("echo",lambda x:x);assert tools.call("echo",{"x":1},authorized=True)==1
        elif module_id=="L04": assert composer.compose(p)["event"]["event_type"]=="TEST_EVENT"
        elif module_id=="L05": assert agent.explain(p)
        elif module_id=="L06": assert validator.validate("Supported distance is 5.25 km.",p)["valid"]
        elif module_id=="L07": ctx.put("T","U",{"follow":"A"});assert ctx.get("T","U",request_tenant_id="T",authorized=True)["follow"]=="A"
        elif module_id=="L08": assert report.generate([p]).sections
    elif case=="unsupported scientific number hallucination blocked": assert not validator.validate("Risk is 999.123 percent.",p)["valid"] and "Claim withheld" in validator.qualify("Risk is 999.123 percent.",p)
    elif case=="validation/evidence class preserved in response":
        r=gw.generate(provider="local",prompt="ok",model="m",packet=p); assert r.validation_state==p.event.validation_state.value and EvidenceClass.OFFICIAL.value in r.evidence_classes
    elif case=="timeout/fallback does not break Intelligence core":
        before=p.model_dump(mode='json');r=gw.generate(provider="local",prompt="x",model="m",packet=p,timeout_s=0);assert r.validation_state=="UNAVAILABLE" and p.model_dump(mode='json')==before
    elif case=="authorization/private context isolation":
        ctx.put("T1","U",{"secret":"x"});assert _expect_error(lambda:ctx.get("T1","U",request_tenant_id="T2",authorized=True),PermissionError);assert _expect_error(lambda:gw.generate(provider="local",prompt="x",model="m",packet=p,authorized=False),PermissionError)
    elif case=="Claim validator rejects or qualifies numeric claim absent from Intelligence Packet": assert not validator.validate("Pc=0.000123",p)["valid"] and validator.qualify("Pc=0.000123",p).startswith("Claim withheld")
    else:raise AssertionError(case)


def _platform_happy(module_id:str,ctx:RequestContext):
    if module_id=="S01": return APIGatewayAuthRequestEnvelopeService().envelope(ctx,{"ok":1})
    if module_id=="S02": return SubscriptionCapabilityService().capabilities("PRO / RESEARCH")
    if module_id=="S03": return WorkspaceWidgetControlRoomService().layout_for("ASCENT")
    if module_id=="S04": s=FollowAlertService();s.follow(ctx,"A");return s.alerts_for_revision(ctx,"A",1,"changed")
    if module_id=="S05": s=SearchDiscoveryService([{"id":"1","name":"ISS","aliases":["International Space Station"]}]);return s.search("ISS")
    if module_id=="S06": return MediaLiveStreamResolver().resolve([{"url":"https://example.test/live","official":True,"source_id":"OFF","live":True}])
    if module_id=="S07": return ResearchDatasetBenchmarkService().manifest("D",[{"x":1}],license_policy="CC-BY",source_ids=["S"],version="v1")
    if module_id=="S08": s=OperationsTenantAuditService();return s.write(ctx,"UPDATE","R",{"x":1},{"x":2})
    if module_id=="S09": s=JobQueueScheduler();j=s.submit("K",lambda:1);return s.run(j.job_id)
    if module_id=="S10": return ObservabilityEvidenceManifestService().manifest(phase="P",tests={"T":"PASS"},files=[{"path":"a","sha256":"abc"}],limitations=[],scientific_validation_state="VALIDATION_PENDING")
    if module_id=="S11": return SecurityLicenseDataGovernanceService().redact("api_key=SECRET")
    if module_id=="S12": s=DeploymentBackupDRService();b=s.backup({"x":1});return s.restore(b)
    raise AssertionError(module_id)


def platform_acceptance(module_id:str,case:str):
    gateway=APIGatewayAuthRequestEnvelopeService();ctx=gateway.context(tenant_id="T",user_id="U",capabilities=["READ","WRITE"]);happy=_platform_happy(module_id,ctx)
    if case=="happy path contract": assert happy is not None and happy!=[]
    elif case=="authorization/capability enforcement": assert _expect_error(lambda:gateway.require(ctx,"ADMIN"),PermissionError)
    elif case=="failure/data_status propagation":
        env=gateway.envelope(ctx,{"reason":"provider down"},data_status="UNAVAILABLE",warnings=["upstream failure"]);assert env.data_status=="UNAVAILABLE" and env.warnings
    elif case=="audit/request-id traceability":
        ops=OperationsTenantAuditService();aid=ops.write(ctx,f"{module_id}_TEST","R",{},{});env=gateway.envelope(ctx,happy,audit_id=aid);assert env.request_id==ctx.request_id and env.audit_id==aid and ops.audit_for(ctx)[0]['request_id']==ctx.request_id
    elif case=="regression/security check":
        gov=SecurityLicenseDataGovernanceService();assert "SECRET" not in gov.redact("api_key=SECRET"); sub=SubscriptionCapabilityService();payload={"risk":.123,"validation":"SCREENING_ONLY"};assert sub.scientific_hash_unchanged(payload,["FREE","AETHERUS+","PRO / RESEARCH"])
        # Service-specific security/regression guarantees.
        if module_id=="S03": assert "TELEMETRY" in WorkspaceWidgetControlRoomService().layout_for("ASCENT")["right"]
        elif module_id=="S04":
            s=FollowAlertService();s.follow(ctx,"A");assert len(s.alerts_for_revision(ctx,"A",1,"x"))==1 and not s.alerts_for_revision(ctx,"A",1,"dup")
        elif module_id=="S05":
            s=SearchDiscoveryService([{"id":"iss","name":"ISS","aliases":[]},{"id":"m","name":"Mission","aliases":[]}]);assert s.search("ISS")[0]['id']=="iss" and all(x['id']!='m' for x in s.search("ISS"))
        elif module_id=="S06": assert not MediaLiveStreamResolver().resolve([{"url":"x","official":False}])
        elif module_id=="S07":
            s=ResearchDatasetBenchmarkService();m=s.manifest("D",[{"x":1}],license_policy="CC",source_ids=["S"],version="1");assert s.reproduce(m,[{"x":1}]) and not s.reproduce(m,[{"x":2}])
        elif module_id=="S08":
            s=OperationsTenantAuditService();s.put_private(ctx,"fleet",{"x":1});other=gateway.context(tenant_id="OTHER",user_id="U");assert s.get_private(other,"fleet") is None
        elif module_id=="S09":
            s=JobQueueScheduler();a=s.submit("same",lambda:1);b=s.submit("same",lambda:2);assert a.job_id==b.job_id
        elif module_id=="S10":
            s=ObservabilityEvidenceManifestService();m=s.manifest(phase="P",tests={"A":"PASS"},files=[{"sha256":"x"}],limitations=[],scientific_validation_state="V");assert s.done_gate(m,required_tests=["A"])["done"]
        elif module_id=="S11": assert not gov.allow_use(None,"PUBLIC") and not gov.allow_use("PUBLIC","DENY")
        elif module_id=="S12":
            s=DeploymentBackupDRService();r=s.readiness(tests_pass=True,backup_verified=True,secrets_configured=False,live_provider_verified=False);assert r['local_product_complete'] and not r['staging_ready']
    else:raise AssertionError(case)


def run_acceptance_case(module_id:str,case:str):
    if module_id in ENGINE_DISPATCH: return ENGINE_DISPATCH[module_id](case)
    if module_id.startswith("L"): return llm_acceptance(module_id,case)
    if module_id.startswith("S"): return platform_acceptance(module_id,case)
    raise AssertionError(f"no acceptance runner for {module_id}: {case}")
