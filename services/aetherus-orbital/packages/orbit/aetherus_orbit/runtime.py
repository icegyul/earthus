from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from math import atan2, cos, pi, radians, sin, sqrt, exp
from random import Random
from statistics import mean
from typing import Any, Iterable
from uuid import UUID, uuid4

from aetherus_domain import (
    AttributionResult,
    DecisionComparison,
    EvidenceClass,
    Scenario,
    SourceGrade,
    ValidationState,
    canonical_hash,
    StateVector,
)
from aetherus_foundation import CoordinateReferenceFrameEngine

MU_EARTH = 398600.4418  # km^3/s^2
R_EARTH = 6378.137


def _aware(v: datetime) -> datetime:
    if v.tzinfo is None:
        raise ValueError("naive datetime forbidden")
    return v.astimezone(timezone.utc)


def _solve_kepler(m: float, e: float) -> float:
    ea=m
    for _ in range(15):
        ea -= (ea-e*sin(ea)-m)/(1-e*cos(ea))
    return ea


def _rot3(x: float, y: float, inc: float, raan: float, argp: float) -> tuple[float,float,float]:
    i,o,w=map(radians,(inc,raan,argp)); ci,si,co,so,cw,sw=cos(i),sin(i),cos(o),sin(o),cos(w),sin(w)
    return (
        (co*cw-so*sw*ci)*x + (-co*sw-so*cw*ci)*y,
        (so*cw+co*sw*ci)*x + (-so*sw+co*cw*ci)*y,
        sw*si*x + cw*si*y,
    )


@dataclass(frozen=True)
class OrbitalElements:
    epoch_utc: datetime
    semi_major_axis_km: float
    eccentricity: float
    inclination_deg: float
    raan_deg: float
    arg_perigee_deg: float
    mean_anomaly_deg: float
    frame: str = "TEME_APPROX"
    source_age_seconds: float = 0.0

    def __post_init__(self):
        _aware(self.epoch_utc)
        if self.semi_major_axis_km <= R_EARTH or not (0 <= self.eccentricity < 1):
            raise ValueError("invalid orbital elements")


@dataclass(frozen=True)
class OrbitState:
    object_id: str
    epoch_utc: datetime
    position_km: tuple[float,float,float]
    velocity_km_s: tuple[float,float,float]
    frame: str
    data_status: str
    validation_state: ValidationState
    state_hash: str


class OrbitPropagationFramesEngine:
    id="E20"; version="two-body-kepler-v1"
    def propagate(self, object_id: str, elements: OrbitalElements, at_utc: datetime, *, stale_after_s: float = 86400.0) -> OrbitState:
        at=_aware(at_utc); dt=(at-_aware(elements.epoch_utc)).total_seconds()
        a,e=elements.semi_major_axis_km,elements.eccentricity
        n=sqrt(MU_EARTH/a**3)
        m=(radians(elements.mean_anomaly_deg)+n*dt)%(2*pi)
        E=_solve_kepler(m,e)
        x=a*(cos(E)-e); y=a*sqrt(1-e*e)*sin(E)
        # Perifocal velocity.
        r=a*(1-e*cos(E)); fac=sqrt(MU_EARTH*a)/r
        vx=-fac*sin(E); vy=fac*sqrt(1-e*e)*cos(E)
        p=_rot3(x,y,elements.inclination_deg,elements.raan_deg,elements.arg_perigee_deg)
        # Rotate velocity with same orthogonal transformation.
        v=_rot3(vx,vy,elements.inclination_deg,elements.raan_deg,elements.arg_perigee_deg)
        age=max(0.0,elements.source_age_seconds+dt)
        status="STALE" if age>stale_after_s else "OK"
        payload={"object_id":object_id,"epoch":at.isoformat(),"position":[round(q,9) for q in p],"velocity":[round(q,12) for q in v],"frame":elements.frame,"model":self.version}
        return OrbitState(object_id,at,p,v,elements.frame,status,ValidationState.SCREENING_ONLY,canonical_hash(payload))

    def convert_frame(self, state: OrbitState, to_frame: str) -> OrbitState:
        """Convert Earth-centered orbital states through E05 rather than relabelling vectors.

        The ``*_APPROX`` labels are retained as compatibility aliases for the v0.2
        acceptance contract, but the vector is actually rotated by the Foundation E05
        screening transform.  Without authoritative EOP the E05 result remains
        RESEARCH_ONLY; this method never upgrades it.
        """
        aliases={"TEME_APPROX":"TEME","GCRF_APPROX":"GCRF","ITRF_APPROX":"ITRF",
                 "TEME":"TEME","GCRF":"GCRF","ITRF":"ITRF"}
        source_label=state.frame.upper(); target_label=to_frame.upper()
        if source_label not in aliases or target_label not in aliases:
            raise ValueError("unsupported frame")
        if target_label==source_label:
            return state
        source=aliases[source_label]; target=aliases[target_label]
        vector=StateVector(
            position_km=state.position_km, velocity_km_s=state.velocity_km_s,
            frame=source, epoch_utc=state.epoch_utc,
        )
        transformed=CoordinateReferenceFrameEngine().transform(vector,target)
        validation=transformed.provenance.validation_state
        if validation==ValidationState.VALIDATED_PIPELINE:
            validation=ValidationState.VALIDATION_PENDING
        payload={
            "input_hash":state.state_hash, "from_frame":source_label, "to_frame":target_label,
            "e05_method":transformed.provenance.method,
            "e05_validation_state":validation.value,
            "e05_limitations":transformed.provenance.limitations,
            "position_km":[round(x,9) for x in transformed.state.position_km],
            "velocity_km_s":[round(x,12) for x in transformed.state.velocity_km_s],
        }
        return OrbitState(
            state.object_id,state.epoch_utc,transformed.state.position_km,transformed.state.velocity_km_s,
            target_label,state.data_status,validation,canonical_hash(payload),
        )


@dataclass(frozen=True)
class PrecisionPropagationResult:
    state: OrbitState | None
    data_status: str
    method: str
    dependency_version: str | None
    error_code: str | None = None
    limitations: tuple[str,...] = ()


class SGP4OMMPropagator:
    """Optional operational-form propagation adapter for CelesTrak/CCSDS OMM.

    It never falls back to the two-body engine while claiming SGP4. If the optional
    `sgp4` dependency is absent or propagation returns a non-zero error code, the
    scientific result is UNAVAILABLE rather than fabricated.
    """
    id="E20-SGP4"
    def available(self)->bool:
        try:
            import sgp4  # noqa:F401
            return True
        except Exception:
            return False

    def propagate_omm(self, object_id:str, omm_record:dict[str,Any], at_utc:datetime)->PrecisionPropagationResult:
        at=_aware(at_utc)
        try:
            from sgp4.api import Satrec, jday
            from sgp4 import omm
            from importlib.metadata import version
        except Exception:
            return PrecisionPropagationResult(None,"UNAVAILABLE","SGP4_OMM",None,"SGP4_DEPENDENCY_MISSING",("Install Aetherus precision extra; no two-body result is relabelled as SGP4.",))
        try:
            sat=Satrec(); omm.initialize(sat,omm_record)
            second=at.second+at.microsecond/1_000_000.0
            jd,fr=jday(at.year,at.month,at.day,at.hour,at.minute,second)
            error,r,v=sat.sgp4(jd,fr)
            dep=version("sgp4")
            if error!=0:
                return PrecisionPropagationResult(None,"UNAVAILABLE","SGP4_OMM",dep,f"SGP4_ERROR_{error}",(f"SGP4 returned error code {error}.",))
            payload={"object_id":object_id,"epoch":at.isoformat(),"position":r,"velocity":v,"frame":"TEME","method":"SGP4_OMM","sgp4_version":dep,"source_epoch":omm_record.get("EPOCH")}
            state=OrbitState(object_id,at,tuple(float(x) for x in r),tuple(float(x) for x in v),"TEME","OK",ValidationState.VALIDATION_PENDING,canonical_hash(payload))
            return PrecisionPropagationResult(state,"OK","SGP4_OMM",dep,None,("Pipeline validation against authoritative reference vectors remains required before operational risk use.",))
        except Exception as exc:
            dep=None
            try: dep=version("sgp4")
            except Exception: pass
            return PrecisionPropagationResult(None,"UNAVAILABLE","SGP4_OMM",dep,"OMM_OR_PROPAGATION_ERROR",(f"{type(exc).__name__}: {exc}",))


@dataclass(frozen=True)
class ConjunctionCandidate:
    primary_id: str
    secondary_id: str
    tca_utc: datetime
    miss_distance_km: float
    relative_speed_km_s: float
    validation_state: ValidationState
    method: str


class ConjunctionScreeningPreciseTCAEngine:
    id="E21"
    def linear_tca(self, a: OrbitState, b: OrbitState, *, window_s: float=3600.0) -> ConjunctionCandidate:
        if a.epoch_utc!=b.epoch_utc:
            raise ValueError("common epoch required")
        r=tuple(b.position_km[i]-a.position_km[i] for i in range(3)); v=tuple(b.velocity_km_s[i]-a.velocity_km_s[i] for i in range(3))
        vv=sum(q*q for q in v); rv=sum(r[i]*v[i] for i in range(3))
        t=0.0 if vv==0 else -rv/vv
        t=max(-window_s,min(window_s,t))
        dr=tuple(r[i]+v[i]*t for i in range(3)); miss=sqrt(sum(q*q for q in dr)); speed=sqrt(vv)
        return ConjunctionCandidate(a.object_id,b.object_id,a.epoch_utc+timedelta(seconds=t),miss,speed,ValidationState.SCREENING_ONLY,"LINEAR_RELATIVE_MOTION")

    def screen(self, states: list[OrbitState], threshold_km: float) -> list[ConjunctionCandidate]:
        out=[]
        for i in range(len(states)):
            for j in range(i+1,len(states)):
                c=self.linear_tca(states[i],states[j])
                if c.miss_distance_km<=threshold_km: out.append(c)
        return sorted(out,key=lambda c:c.miss_distance_km)

    def local_minima(self, distances: list[tuple[datetime,float]]) -> list[tuple[datetime,float]]:
        if len(distances)<3: return sorted(distances,key=lambda x:x[1])[:1]
        return [distances[i] for i in range(1,len(distances)-1) if distances[i][1]<=distances[i-1][1] and distances[i][1]<=distances[i+1][1]]


@dataclass(frozen=True)
class CollisionRisk:
    pc: float | None
    method: str
    covariance_valid: bool
    validation_state: ValidationState
    warnings: tuple[str,...]
    provenance: dict[str,Any]


class CollisionProbabilityRiskProvenanceEngine:
    id="E22"
    def assess(self, conjunction: ConjunctionCandidate, *, covariance_sigma_km: float | None, hard_body_radius_km: float=0.01, method: str="ISOTROPIC_2D_APPROX", expected_method: str | None=None) -> CollisionRisk:
        warnings=[]
        if covariance_sigma_km is None or covariance_sigma_km<=0:
            return CollisionRisk(None,method,False,ValidationState.INSUFFICIENT_DATA,("MISSING_OR_INVALID_COVARIANCE",),{"tca":conjunction.tca_utc.isoformat(),"miss_distance_km":conjunction.miss_distance_km})
        sigma=float(covariance_sigma_km); r=conjunction.miss_distance_km
        area=pi*hard_body_radius_km**2
        density=exp(-(r*r)/(2*sigma*sigma))/(2*pi*sigma*sigma)
        pc=max(0.0,min(1.0,area*density))
        if expected_method and method!=expected_method: warnings.append("METHOD_MISMATCH")
        if sigma>100: warnings.append("COVARIANCE_DILUTION_RISK")
        return CollisionRisk(pc,method,True,ValidationState.SCREENING_ONLY,tuple(warnings),{"sigma_km":sigma,"hard_body_radius_km":hard_body_radius_km,"tca":conjunction.tca_utc.isoformat()})


@dataclass(frozen=True)
class RiskEdge:
    a: str; b: str; metrics: dict[str,float|None]; evidence_ids: tuple[str,...]; config_version: str
    @property
    def edge_hash(self)->str:
        return canonical_hash({"a":min(self.a,self.b),"b":max(self.a,self.b),"metrics":self.metrics,"evidence_ids":sorted(self.evidence_ids),"config_version":self.config_version})


class RiskGraphEngine:
    id="E23"
    def build_edge(self,a:str,b:str,*,metrics:dict[str,float|None],evidence_ids:list[str],config_version:str)->RiskEdge:
        if not config_version: raise ValueError("aggregate config version required")
        return RiskEdge(a,b,dict(metrics),tuple(evidence_ids),config_version)
    def snapshot_hash(self,edges:list[RiskEdge])->str:
        return canonical_hash(sorted(e.edge_hash for e in edges))
    def aggregate(self,edges:list[RiskEdge],object_id:str,metric:str)->float:
        return sum(float(e.metrics.get(metric) or 0) for e in edges if object_id in {e.a,e.b})


@dataclass(frozen=True)
class OrbitalShellState:
    name:str; min_alt_km:float; max_alt_km:float; object_count:int; coverage_ratio:float; data_status:str; threshold_version:str

class OrbitalEnvironmentCongestionEngine:
    id="E24"
    shells={"LEO":(0.0,2000.0),"MEO":(2000.0,35786.0),"GEO":(35786.0-500,35786.0+500)}
    def classify(self,altitude_km:float)->str:
        for name,(lo,hi) in self.shells.items():
            if lo<=altitude_km<hi or (name=="GEO" and lo<=altitude_km<=hi): return name
        return "OTHER"
    def state(self,name:str,altitudes_km:list[float],*,expected_sources:int,available_sources:int,threshold_version:str)->OrbitalShellState:
        if name not in self.shells: raise KeyError(name)
        if not threshold_version: raise ValueError("threshold version required")
        count=sum(1 for a in altitudes_km if self.classify(a)==name)
        coverage=0.0 if expected_sources<=0 else max(0,min(1,available_sources/expected_sources))
        return OrbitalShellState(name,*self.shells[name],count,coverage,"OK" if coverage>=1 else "PARTIAL",threshold_version)


@dataclass(frozen=True)
class GenealogyLink:
    child_id:str; parent_id:str|None; origin:str|None; event_time_utc:datetime; evidence_id:str; uncertainty_reason:str|None=None

class DebrisGenealogyOriginEngine:
    id="E25"
    def __init__(self): self.links:list[GenealogyLink]=[]
    def add(self,*,child_id:str,parent_id:str|None,origin:str|None,event_time_utc:datetime,evidence_id:str,known:bool=True)->GenealogyLink:
        if not evidence_id: raise ValueError("evidence required")
        if not known: parent_id=None; origin=None
        link=GenealogyLink(child_id,parent_id,origin,_aware(event_time_utc),evidence_id,None if known else "UNKNOWN_ORIGIN")
        self.links.append(link); self.links.sort(key=lambda x:x.event_time_utc); return link
    def timeline(self,child_id:str)->tuple[GenealogyLink,...]: return tuple(x for x in self.links if x.child_id==child_id)


@dataclass(frozen=True)
class Fragment:
    fragment_id:str; delta_v_m_s:tuple[float,float,float]; area_to_mass:float

@dataclass(frozen=True)
class FragmentationResult:
    fragments:tuple[Fragment,...]; seed:int; assumptions:tuple[str,...]; model_version:str; validation_state:ValidationState; result_hash:str

class FragmentationScenarioEngine:
    id="E26"
    def run(self,scenario:Scenario,*,fragment_count:int=20)->FragmentationResult:
        if scenario.seed is None: raise ValueError("fixed seed required for reproducibility")
        rng=Random(scenario.seed); frags=[]
        scale=float(scenario.parameters.get("delta_v_scale_m_s",10.0))
        for i in range(fragment_count):
            frags.append(Fragment(f"F{i+1:04d}",tuple(rng.gauss(0,scale) for _ in range(3)),max(1e-5,rng.lognormvariate(-3,0.7))))
        h=canonical_hash({"seed":scenario.seed,"model":scenario.model_version,"assumptions":scenario.assumptions,"fragments":[f.__dict__ for f in frags]})
        return FragmentationResult(tuple(frags),scenario.seed,tuple(scenario.assumptions),scenario.model_version,ValidationState.RESEARCH_ONLY,h)


@dataclass(frozen=True)
class ReentryEstimate:
    object_id:str; nominal_utc:datetime|None; window_start_utc:datetime|None; window_end_utc:datetime|None; source_id:str|None; grade:SourceGrade; validation_state:ValidationState; version:int

class ReentryIntelligenceEngine:
    id="E27"
    def __init__(self): self._history:dict[str,list[ReentryEstimate]]={}
    def ingest_tip(self,object_id:str,tip:dict[str,Any]|None,*,source_id:str|None=None,grade:SourceGrade=SourceGrade.OFFICIAL_PUBLIC)->ReentryEstimate:
        seq=self._history.setdefault(object_id,[])
        if not tip:
            e=ReentryEstimate(object_id,None,None,None,source_id,grade,ValidationState.INSUFFICIENT_DATA,len(seq)+1)
        else:
            def parse(x):
                if x is None:return None
                if isinstance(x,datetime):return _aware(x)
                return _aware(datetime.fromisoformat(str(x).replace('Z','+00:00')))
            e=ReentryEstimate(object_id,parse(tip.get('nominal_utc')),parse(tip.get('window_start_utc')),parse(tip.get('window_end_utc')),source_id,grade,ValidationState.VALIDATED_PIPELINE,len(seq)+1)
        seq.append(e); return e
    def history(self,object_id:str)->tuple[ReentryEstimate,...]: return tuple(self._history.get(object_id,()))


@dataclass(frozen=True)
class RotationEstimate:
    period_s:float|None; uncertainty_s:float|None; aliases:tuple[float,...]; validation_state:ValidationState; reason:str

class PhotometryRotationIntelligenceEngine:
    id="E28"
    def estimate(self,times_s:list[float],magnitudes:list[float],*,min_period_s:float=1,max_period_s:float=100,steps:int=300)->RotationEstimate:
        if len(times_s)!=len(magnitudes) or len(times_s)<6:
            return RotationEstimate(None,None,(),ValidationState.INSUFFICIENT_DATA,"TOO_FEW_POINTS")
        ymean=mean(magnitudes); total=sum((y-ymean)**2 for y in magnitudes) or 1e-12
        scores=[]
        for j in range(steps):
            p=min_period_s+(max_period_s-min_period_s)*j/(steps-1)
            # Two-harmonic sinusoidal projection score.
            cs=sum((magnitudes[i]-ymean)*cos(2*pi*times_s[i]/p) for i in range(len(times_s)))
            sn=sum((magnitudes[i]-ymean)*sin(2*pi*times_s[i]/p) for i in range(len(times_s)))
            power=(cs*cs+sn*sn)/(len(times_s)*total)
            scores.append((power,p))
        scores.sort(reverse=True)
        best=scores[0]
        aliases=tuple(round(p,6) for s,p in scores[1:6] if s>=best[0]*0.9)
        step=(max_period_s-min_period_s)/(steps-1)
        state=ValidationState.VALIDATION_PENDING if aliases else ValidationState.RESEARCH_ONLY
        return RotationEstimate(best[1],step,aliases,state,"AMBIGUOUS_ALIASES" if aliases else "PERIODIC_SIGNAL")


@dataclass(frozen=True)
class ObservationRequest:
    object_id:str; start_utc:datetime; end_utc:datetime; max_elevation_deg:float; sunlit:bool; eclipsed:bool; mount_rate_deg_s:float; information_gain:float

class ObservationPlanningEngine:
    id="E29"
    def plan(self,candidates:list[dict[str,Any]],*,mount_rate_limit_deg_s:float)->list[ObservationRequest]:
        out=[]
        for c in candidates:
            if not c.get('visible',False): continue
            rate=float(c.get('mount_rate_deg_s',0))
            if rate>mount_rate_limit_deg_s: continue
            start,end=_aware(c['start_utc']),_aware(c['end_utc'])
            out.append(ObservationRequest(str(c['object_id']),start,end,float(c.get('max_elevation_deg',0)),bool(c.get('sunlit')),bool(c.get('eclipsed')),rate,float(c.get('information_gain',0))))
        return sorted(out,key=lambda x:(-x.information_gain,x.start_utc))


@dataclass(frozen=True)
class CitizenObservation:
    observation_id:str; object_id:str; observed_at:datetime; value:float; license_policy:str; status:str; reason:str|None; evidence_class:EvidenceClass=EvidenceClass.OBSERVED

class CitizenObservationQAContributionEngine:
    id="E30"
    def __init__(self): self._by_hash:dict[str,CitizenObservation]={}
    def submit(self,*,object_id:str,observed_at:datetime,value:float,license_policy:str|None,expected_range:tuple[float,float]|None=None,now:datetime|None=None)->CitizenObservation:
        now=_aware(now or datetime.now(timezone.utc))
        try: ts=_aware(observed_at)
        except ValueError:
            raise
        if not license_policy: status,reason="QUARANTINED","LICENSE_MISSING"
        elif abs((now-ts).total_seconds())>365*86400: status,reason="QUARANTINED","BAD_TIMESTAMP"
        elif expected_range and not(expected_range[0]<=value<=expected_range[1]): status,reason="REJECTED","OUTLIER"
        else: status,reason="ACCEPTED",None
        h=canonical_hash({"object_id":object_id,"observed_at":ts.isoformat(),"value":value,"license":license_policy})
        if h in self._by_hash: return self._by_hash[h]
        obs=CitizenObservation(h[:24],object_id,ts,float(value),license_policy or "",status,reason)
        self._by_hash[h]=obs; return obs
    def accepted(self)->tuple[CitizenObservation,...]: return tuple(o for o in self._by_hash.values() if o.status=="ACCEPTED")
    def intelligence_hook(self, observation: CitizenObservation) -> dict[str, Any] | None:
        """Only accepted observations may enter bounded re-evaluation. This is not Event creation."""
        if observation.status != "ACCEPTED":
            return None
        return {"action":"BOUNDED_REEVALUATION","object_id":observation.object_id,"observation_id":observation.observation_id,"may_create_event_directly":False}
    def evidence_payload(self, observation: CitizenObservation) -> dict[str, Any] | None:
        if observation.status != "ACCEPTED":
            return None
        return {"evidence_class":"OBSERVED","source_grade":"USER_OBSERVATION","object_id":observation.object_id,"observed_at":observation.observed_at.isoformat(),"value":observation.value,"license_policy":observation.license_policy}


@dataclass(frozen=True)
class CounterfactualResult:
    scenario_id:UUID; metric_type:str; baseline_edges:tuple[RiskEdge,...]; scenario_edges:tuple[RiskEdge,...]; attributions:tuple[dict[str,Any],...]; new_risks:tuple[dict[str,Any],...]; result_hash:str; validation_state:ValidationState

class InterventionBenefitCounterfactualEngine:
    id="E31"
    def run(self,scenario:Scenario,baseline_edges:list[RiskEdge],*,metric_type:str="pc")->CounterfactualResult:
        target=set(scenario.target_object_ids)
        kind=scenario.kind.upper()
        if kind=="DO_NOTHING": after=list(baseline_edges)
        elif kind=="REMOVE": after=[e for e in baseline_edges if not ({e.a,e.b}&target)]
        elif kind in {"NUDGE","LOWER","CANDIDATE_OCM"}:
            factor=float(scenario.parameters.get("risk_factor",0.5))
            after=[]
            for e in baseline_edges:
                m=dict(e.metrics)
                if {e.a,e.b}&target and m.get(metric_type) is not None: m[metric_type]=float(m[metric_type])*factor
                after.append(RiskEdge(e.a,e.b,m,e.evidence_ids,e.config_version))
            for nr in scenario.parameters.get("new_risks",[]):
                after.append(RiskEdge(str(nr['a']),str(nr['b']),{metric_type:float(nr['value'])},tuple(nr.get('evidence_ids',())),str(nr.get('config_version','scenario'))))
        else: raise ValueError("unsupported counterfactual kind")
        objects=sorted({x for e in baseline_edges+after for x in (e.a,e.b)})
        graph=RiskGraphEngine(); attrs=[]
        for obj in objects:
            if obj in target: continue
            b=graph.aggregate(baseline_edges,obj,metric_type); a=graph.aggregate(after,obj,metric_type)
            if b!=a: attrs.append({"subject_object_id":obj,"baseline_value":b,"scenario_value":a,"delta":a-b,"metric_type":metric_type})
        base_pairs={(min(e.a,e.b),max(e.a,e.b)) for e in baseline_edges}
        new=tuple({"a":e.a,"b":e.b,"value":e.metrics.get(metric_type)} for e in after if (min(e.a,e.b),max(e.a,e.b)) not in base_pairs)
        scientific={"scenario_kind":kind,"targets":sorted(target),"metric_type":metric_type,"baseline":[e.edge_hash for e in baseline_edges],"after":[e.edge_hash for e in after],"attrs":attrs,"new":new,"model":scenario.model_version,"config":scenario.config_version}
        return CounterfactualResult(scenario.id,metric_type,tuple(baseline_edges),tuple(after),tuple(attrs),new,canonical_hash(scientific),ValidationState.RESEARCH_ONLY)


class AffectedSubgraphEngine:
    id="E32"
    def affected(self,edges:list[RiskEdge],targets:set[str],*,depth:int=1)->set[str]:
        adj:dict[str,set[str]]={}
        for e in edges:
            adj.setdefault(e.a,set()).add(e.b); adj.setdefault(e.b,set()).add(e.a)
        seen=set(targets); frontier=set(targets)
        for _ in range(depth):
            nxt=set()
            for n in frontier: nxt|=adj.get(n,set())
            nxt-=seen; seen|=nxt; frontier=nxt
        return seen
    def validate_selective(self,full_result_hash:str,selective_result_hash:str)->bool:
        if full_result_hash!=selective_result_hash: return False
        return True
    def guarded_commit(self,full_result_hash:str,selective_result_hash:str)->dict[str,Any]:
        return {"committed":full_result_hash==selective_result_hash,"rolled_back":full_result_hash!=selective_result_hash}


@dataclass(frozen=True)
class OCMCandidate:
    candidate_id:str; protected_object_id:str; target_object_id:str; risk_reduction:float; new_risk_penalty:float; score:float; provenance:dict[str,Any]; evidence_class:EvidenceClass=EvidenceClass.COUNTERFACTUAL

class ProtectReverseQueryCandidateOCMComparisonEngine:
    id="E33"
    def rank(self,*,protected_object_id:str,candidates:list[dict[str,Any]],protected_active:bool=True)->list[OCMCandidate]:
        out=[]
        for c in candidates:
            if str(c['target_object_id'])==protected_object_id: continue
            reduction=float(c.get('risk_reduction',0)); penalty=float(c.get('new_risk_penalty',0)); score=reduction-penalty
            prov=dict(c.get('provenance') or {})
            if not prov: raise ValueError("candidate provenance required")
            if not protected_active: prov["mode"]="RESEARCH_ONLY"
            out.append(OCMCandidate(str(c.get('candidate_id') or canonical_hash(c)[:12]),protected_object_id,str(c['target_object_id']),reduction,penalty,score,prov))
        return sorted(out,key=lambda c:(-c.score,c.candidate_id))
