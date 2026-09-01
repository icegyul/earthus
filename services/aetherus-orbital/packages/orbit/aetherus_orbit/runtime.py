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
    # The engine publishes its own label so no caller has to derive one from ``known``.
    validation_state:ValidationState=ValidationState.UNVALIDATED
    evidence_status:str="EVIDENCE_NOT_VERIFIED"


class DebrisGenealogyOriginEngine:
    """Records parent/origin claims and labels each by whether its evidence resolves.

    ``known`` is a caller CLAIM about the parentage, not a verification result, so it
    can never by itself produce a validated label.  Configure ``evidence_lookup`` to
    resolve evidence ids; with no resolver every link stays UNVALIDATED.
    VALIDATED_PIPELINE is never emitted: resolving an evidence id proves the record
    exists, not that the genealogy pipeline was validated.
    """

    id="E25"

    def __init__(self,*,evidence_lookup:Any=None):
        self.links:list[GenealogyLink]=[]
        self._lookup=evidence_lookup

    def _evidence_status(self,evidence_id:str)->str:
        if self._lookup is None: return "EVIDENCE_RESOLVER_NOT_CONFIGURED"
        try:
            record=self._lookup(evidence_id)
        except Exception as exc:  # a failed lookup is not a pass
            return f"EVIDENCE_LOOKUP_FAILED:{type(exc).__name__}"
        return "EVIDENCE_RESOLVED" if record else "EVIDENCE_NOT_FOUND"

    def add(self,*,child_id:str,parent_id:str|None,origin:str|None,event_time_utc:datetime,evidence_id:str,known:bool=True)->GenealogyLink:
        if not evidence_id: raise ValueError("evidence required")
        if not known: parent_id=None; origin=None
        status=self._evidence_status(evidence_id)
        if not known:
            state=ValidationState.INSUFFICIENT_DATA
        elif status=="EVIDENCE_RESOLVED":
            state=ValidationState.VALIDATION_PENDING
        else:
            state=ValidationState.UNVALIDATED
        link=GenealogyLink(
            child_id,parent_id,origin,_aware(event_time_utc),evidence_id,
            None if known else "UNKNOWN_ORIGIN",state,status,
        )
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
    # Lineage: without these four fields an estimate cannot be traced back to anything.
    source_uri:str|None=None
    retrieved_at_utc:datetime|None=None
    payload_sha256:str|None=None
    provenance_status:str="PROVENANCE_MISSING"
    model_version:str="E27-TIP-INGEST-v2"


_REENTRY_PROVENANCE_FIELDS = ("source_uri","retrieved_at_utc","payload_sha256")


class ReentryIntelligenceEngine:
    """Ingests re-entry TIP records and labels them by what was actually verified.

    Two things this engine deliberately does NOT do:
    * It never returns VALIDATED_PIPELINE.  Nothing here compares the estimate against
      authoritative reference re-entry events, so that label would be unearned.
    * It never accepts a source grade from the caller.  Trust is configured once via
      ``source_registry``; an un-registered source is UNKNOWN, which is the honest value.
    """

    id="E27"
    model_version="E27-TIP-INGEST-v2"

    def __init__(self,*,source_registry:dict[str,SourceGrade]|None=None):
        self._history:dict[str,list[ReentryEstimate]]={}
        self._registry:dict[str,SourceGrade]=dict(source_registry or {})

    @staticmethod
    def _parse(value:Any)->datetime|None:
        if value is None: return None
        if isinstance(value,datetime): return _aware(value)
        return _aware(datetime.fromisoformat(str(value).replace('Z','+00:00')))

    def _verify(self,tip:dict[str,Any],provenance:dict[str,Any]|None)->tuple[str,datetime|None,str|None,str|None]:
        """Returns (status, retrieved_at, source_uri, payload_sha256).

        The only thing verifiable here is record integrity: the checksum the fetcher
        recorded must match the record we were handed.  Publisher authenticity is not
        checked, so a verified record still only reaches VALIDATION_PENDING.
        """
        if not provenance:
            return "PROVENANCE_MISSING",None,None,None
        missing=[f for f in _REENTRY_PROVENANCE_FIELDS if not provenance.get(f)]
        if missing:
            return f"PROVENANCE_INCOMPLETE:{','.join(missing)}",None,provenance.get("source_uri"),provenance.get("payload_sha256")
        retrieved=self._parse(provenance["retrieved_at_utc"])
        uri=str(provenance["source_uri"]); declared=str(provenance["payload_sha256"])
        if canonical_hash(tip)!=declared:
            return "CHECKSUM_MISMATCH",retrieved,uri,declared
        return "INTEGRITY_VERIFIED",retrieved,uri,declared

    def ingest_tip(
        self,object_id:str,tip:dict[str,Any]|None,*,
        source_id:str|None=None,provenance:dict[str,Any]|None=None,
    )->ReentryEstimate:
        seq=self._history.setdefault(object_id,[])
        version=len(seq)+1
        if not tip:
            e=ReentryEstimate(
                object_id,None,None,None,source_id,SourceGrade.UNKNOWN,
                ValidationState.INSUFFICIENT_DATA,version,None,None,None,"NO_TIP",self.model_version,
            )
            seq.append(e); return e

        status,retrieved,uri,digest=self._verify(tip,provenance)
        nominal=self._parse(tip.get('nominal_utc'))
        start=self._parse(tip.get('window_start_utc'))
        end=self._parse(tip.get('window_end_utc'))
        if start is not None and end is not None and end<start:
            status="INCONSISTENT_WINDOW"
        if status=="INTEGRITY_VERIFIED":
            # A grade only exists for a source that trust was configured for beforehand.
            grade=self._registry.get(str(source_id),SourceGrade.UNKNOWN)
            state=ValidationState.VALIDATION_PENDING
        else:
            grade=SourceGrade.UNKNOWN
            state=ValidationState.UNVALIDATED
        e=ReentryEstimate(
            object_id,nominal,start,end,source_id,grade,state,version,
            uri,retrieved,digest,status,self.model_version,
        )
        seq.append(e); return e

    def history(self,object_id:str)->tuple[ReentryEstimate,...]: return tuple(self._history.get(object_id,()))


@dataclass(frozen=True)
class RotationEstimate:
    period_s:float|None; uncertainty_s:float|None; aliases:tuple[float,...]; validation_state:ValidationState; reason:str
    # ``uncertainty_s`` is a 1-sigma noise-limited period uncertainty, NOT the search
    # grid spacing.  The grid spacing is reported separately as ``grid_step_s`` so the
    # two quantities can never be read as the same thing again.
    grid_step_s:float|None=None
    peak_power:float|None=None
    false_alarm_probability:float|None=None
    amplitude_mag:float|None=None
    residual_rms_mag:float|None=None
    independent_frequencies:int|None=None
    limitations:tuple[str,...]=()
    model_version:str="E28-LOMB-SCARGLE-v2"


# A single-harmonic model cannot distinguish a double-peaked (two maxima per rotation)
# lightcurve from a single-peaked one, so the detected photometric period may be half
# of the true rotation period. This is stated, not silently absorbed into the number.
_E28_HARMONIC_LIMITATION = (
    "SINGLE_HARMONIC_MODEL: one sinusoidal harmonic is fitted; a double-peaked lightcurve "
    "makes the true rotation period twice the reported photometric period."
)
_E28_UNCERTAINTY_LIMITATION = (
    "UNCERTAINTY_IS_NOISE_LIMITED: sigma follows from residual photometric scatter, sample "
    "count and time span only; aliasing and model mis-specification are not included."
)


class PhotometryRotationIntelligenceEngine:
    """Lomb-Scargle period search with an explicit false-alarm gate.

    Why a significance gate: the argmax of a periodogram always exists, even for pure
    noise or a perfectly flat lightcurve.  Reporting that argmax as a rotation period
    is fabrication.  A period is returned only when the peak survives a false-alarm
    test against the white-noise null hypothesis.
    """

    id="E28"
    model_version="E28-LOMB-SCARGLE-v2"

    def _periodogram(self,times_s:list[float],magnitudes:list[float],periods:list[float],ymean:float,variance:float)->list[float]:
        n=len(times_s); powers=[]
        for p in periods:
            w=2*pi/p
            # Scargle's time offset tau makes the projection invariant to the time origin.
            s2=sum(sin(2*w*t) for t in times_s); c2=sum(cos(2*w*t) for t in times_s)
            tau=atan2(s2,c2)/(2*w)
            cc=0.0; ss=0.0; yc=0.0; ys=0.0
            for i in range(n):
                ct=cos(w*(times_s[i]-tau)); st=sin(w*(times_s[i]-tau)); dy=magnitudes[i]-ymean
                cc+=ct*ct; ss+=st*st; yc+=dy*ct; ys+=dy*st
            term_c=(yc*yc/cc) if cc>1e-12 else 0.0
            term_s=(ys*ys/ss) if ss>1e-12 else 0.0
            powers.append((term_c+term_s)/(2.0*variance))
        return powers

    @staticmethod
    def _false_alarm_probability(power:float,independent_frequencies:int)->float:
        # Standard Scargle result: P(z>z0) = exp(-z0) per independent frequency.
        try:
            single=exp(-power)
        except OverflowError:  # pragma: no cover - exp of a large negative never overflows
            single=0.0
        return max(0.0,min(1.0,1.0-(1.0-single)**independent_frequencies))

    def estimate(
        self,times_s:list[float],magnitudes:list[float],*,
        min_period_s:float=1,max_period_s:float=100,steps:int=300,
        max_false_alarm_probability:float=0.01,
    )->RotationEstimate:
        if steps<8: raise ValueError("period grid needs at least 8 steps")
        if not (0<min_period_s<max_period_s): raise ValueError("invalid period search range")
        if not (0<max_false_alarm_probability<1): raise ValueError("invalid false alarm threshold")
        grid_step=(max_period_s-min_period_s)/(steps-1)
        if len(times_s)!=len(magnitudes) or len(times_s)<6:
            return RotationEstimate(None,None,(),ValidationState.INSUFFICIENT_DATA,"TOO_FEW_POINTS",grid_step)

        n=len(times_s); span=max(times_s)-min(times_s)
        if span<=0:
            return RotationEstimate(None,None,(),ValidationState.INSUFFICIENT_DATA,"ZERO_TIME_SPAN",grid_step)
        ymean=mean(magnitudes)
        variance=sum((y-ymean)**2 for y in magnitudes)/(n-1)
        if variance<=0.0:
            # A lightcurve with no brightness variation carries no rotation signal at all.
            # The previous implementation replaced this zero with 1e-12 and returned a period.
            return RotationEstimate(None,None,(),ValidationState.INSUFFICIENT_DATA,"NO_PHOTOMETRIC_VARIANCE",grid_step)

        periods=[min_period_s+grid_step*j for j in range(steps)]
        powers=self._periodogram(times_s,magnitudes,periods,ymean,variance)
        peak_index=max(range(steps),key=lambda j:powers[j])
        peak_power=powers[peak_index]

        # Independent trials over the searched frequency band, limited by the 1/span
        # natural frequency resolution.  This is what turns a peak height into a p-value.
        frequency_resolution=1.0/span
        band=(1.0/min_period_s)-(1.0/max_period_s)
        independent=max(1,int(band/frequency_resolution)+1)
        fap=self._false_alarm_probability(peak_power,independent)

        limitations=[_E28_HARMONIC_LIMITATION,_E28_UNCERTAINTY_LIMITATION]
        if min_period_s<2.0*(span/(n-1)):
            limitations.append("BELOW_AVERAGE_NYQUIST: the shortest searched period is under twice the mean sampling interval.")

        if fap>max_false_alarm_probability:
            return RotationEstimate(
                None,None,(),ValidationState.INSUFFICIENT_DATA,"NO_SIGNIFICANT_PERIODICITY",
                grid_step,peak_power,fap,None,None,independent,tuple(limitations),self.model_version,
            )

        edge=peak_index in (0,steps-1)
        period=periods[peak_index] if edge else self._refine(periods,powers,peak_index)
        if edge:
            limitations.append("PEAK_AT_GRID_EDGE: the true peak may lie outside the searched period range.")

        amplitude,residual_rms=self._sinusoid_fit(times_s,magnitudes,period)
        uncertainty=self._period_uncertainty(period,amplitude,residual_rms,n,span)
        if uncertainty is None:
            limitations.append("UNCERTAINTY_UNAVAILABLE: the fitted amplitude is not positive, so no noise-limited sigma exists.")

        aliases=self._competing_periods(
            periods,powers,period,frequency_resolution,independent,max_false_alarm_probability,
        )
        if aliases or edge:
            state=ValidationState.RESEARCH_ONLY
            reason="AMBIGUOUS_ALIASES" if aliases else "PEAK_AT_GRID_EDGE"
        else:
            # A single significant peak is still only pending: the pipeline itself has not
            # been validated against reference lightcurves.
            state=ValidationState.VALIDATION_PENDING
            reason="SIGNIFICANT_SINGLE_PEAK"
        return RotationEstimate(
            period,uncertainty,aliases,state,reason,grid_step,peak_power,fap,
            amplitude,residual_rms,independent,tuple(limitations),self.model_version,
        )

    @staticmethod
    def _refine(periods:list[float],powers:list[float],index:int)->float:
        """Sub-grid peak location by parabolic interpolation of the three highest cells."""
        y0,y1,y2=powers[index-1],powers[index],powers[index+1]
        denom=y0-2.0*y1+y2
        if denom==0.0: return periods[index]
        offset=0.5*(y0-y2)/denom
        offset=max(-0.5,min(0.5,offset))
        return periods[index]+offset*(periods[index+1]-periods[index])

    @staticmethod
    def _sinusoid_fit(times_s:list[float],magnitudes:list[float],period:float)->tuple[float,float]:
        """Least-squares y = a*cos(wt) + b*sin(wt) + c; returns (amplitude, residual RMS)."""
        n=len(times_s); w=2*pi/period
        cs=[cos(w*t) for t in times_s]; sn=[sin(w*t) for t in times_s]
        # Normal equations for the 3-parameter design matrix.
        scc=sum(c*c for c in cs); sss=sum(s*s for s in sn); scs=sum(cs[i]*sn[i] for i in range(n))
        sc=sum(cs); ss=sum(sn)
        syc=sum(magnitudes[i]*cs[i] for i in range(n)); sys_=sum(magnitudes[i]*sn[i] for i in range(n))
        sy=sum(magnitudes)
        m=[[scc,scs,sc],[scs,sss,ss],[sc,ss,float(n)]]
        rhs=[syc,sys_,sy]
        solution=_solve3(m,rhs)
        if solution is None: return 0.0,0.0
        a,b,c=solution
        residuals=[magnitudes[i]-(a*cs[i]+b*sn[i]+c) for i in range(n)]
        dof=max(1,n-3)
        return sqrt(a*a+b*b),sqrt(sum(r*r for r in residuals)/dof)

    @staticmethod
    def _period_uncertainty(period:float,amplitude:float,residual_rms:float,n:int,span:float)->float|None:
        """1-sigma period uncertainty from the frequency error of a fitted sinusoid.

        sigma_f = sqrt(6/N) * sigma_noise / (pi * T * A)   (Montgomery & O'Donoghue 1999)
        sigma_P = P^2 * sigma_f
        """
        if amplitude<=0.0 or span<=0.0: return None
        sigma_f=sqrt(6.0/n)*residual_rms/(pi*span*amplitude)
        return period*period*sigma_f

    def _competing_periods(
        self,periods:list[float],powers:list[float],best_period:float,
        frequency_resolution:float,independent:int,max_fap:float,
    )->tuple[float,...]:
        """Genuinely distinct significant peaks, not neighbouring cells of the same peak.

        A candidate must be a local maximum and be separated from the accepted period by
        more than the 1/span frequency resolution, otherwise it is the same peak.
        """
        best_frequency=1.0/best_period
        out=[]
        for j in range(1,len(periods)-1):
            if not (powers[j]>=powers[j-1] and powers[j]>=powers[j+1]): continue
            if abs(1.0/periods[j]-best_frequency)<=frequency_resolution: continue
            if self._false_alarm_probability(powers[j],independent)>max_fap: continue
            out.append((powers[j],periods[j]))
        out.sort(reverse=True)
        return tuple(round(p,6) for _,p in out[:5])


def _solve3(matrix:list[list[float]],rhs:list[float])->tuple[float,float,float]|None:
    """Gaussian elimination with partial pivoting for the 3x3 normal equations."""
    m=[row[:]+[rhs[i]] for i,row in enumerate(matrix)]
    for col in range(3):
        pivot=max(range(col,3),key=lambda r:abs(m[r][col]))
        if abs(m[pivot][col])<1e-12: return None
        m[col],m[pivot]=m[pivot],m[col]
        for r in range(3):
            if r==col: continue
            factor=m[r][col]/m[col][col]
            for c in range(col,4): m[r][c]-=factor*m[col][c]
    return m[0][3]/m[0][0],m[1][3]/m[1][1],m[2][3]/m[2][2]


@dataclass(frozen=True)
class ObservationRequest:
    object_id:str; start_utc:datetime; end_utc:datetime
    # Absent inputs stay absent.  A missing elevation or illumination flag used to be
    # written out as 0 / False, which reads as a measured value.
    max_elevation_deg:float|None; sunlit:bool|None; eclipsed:bool|None; mount_rate_deg_s:float
    # Renamed from ``information_gain``: this value is copied from the candidate dict.
    # No information-theoretic quantity is computed anywhere in this engine.
    caller_priority:float|None
    information_gain_status:str="NOT_COMPUTED"
    illumination_status:str="CALLER_SUPPLIED"


@dataclass(frozen=True)
class ObservationPlanResult:
    requests:tuple[ObservationRequest,...]
    rejected:tuple[dict[str,Any],...]
    ordering_basis:str
    information_gain_status:str


class ObservationPlanningEngine:
    """Filters candidate passes against a mount-rate limit and orders them.

    The ordering is by a caller-supplied priority, not by computed information gain:
    an actual expected-information-gain calculation needs a state covariance and the
    measurement partials, and neither is available at this interface.  The status field
    says NOT_COMPUTED so no consumer can mistake the ordering for one.
    """

    id="E29"
    model_version="E29-CANDIDATE-SCREENING-v2"

    def screen(self,candidates:list[dict[str,Any]],*,mount_rate_limit_deg_s:float)->ObservationPlanResult:
        if mount_rate_limit_deg_s<=0: raise ValueError("mount rate limit must be positive")
        accepted:list[ObservationRequest]=[]; rejected:list[dict[str,Any]]=[]
        for c in candidates:
            object_id=str(c.get('object_id') or "").strip()
            if not object_id: raise ValueError("object_id is required for every candidate")
            if 'visible' not in c:
                rejected.append({"object_id":object_id,"reason":"VISIBILITY_NOT_SUPPLIED"}); continue
            if not c['visible']:
                rejected.append({"object_id":object_id,"reason":"NOT_VISIBLE"}); continue
            if c.get('mount_rate_deg_s') is None:
                # An unknown slew rate cannot be screened against the limit; treating it
                # as 0 would let an unscreenable pass through as if the mount were still.
                rejected.append({"object_id":object_id,"reason":"MOUNT_RATE_NOT_SUPPLIED"}); continue
            rate=float(c['mount_rate_deg_s'])
            if rate>mount_rate_limit_deg_s:
                rejected.append({"object_id":object_id,"reason":"MOUNT_RATE_EXCEEDS_LIMIT"}); continue
            start,end=_aware(c['start_utc']),_aware(c['end_utc'])
            if end<=start: raise ValueError("candidate end_utc must follow start_utc")
            elevation=c.get('max_elevation_deg')
            priority=c.get('information_gain',c.get('caller_priority'))
            sunlit=c.get('sunlit'); eclipsed=c.get('eclipsed')
            accepted.append(ObservationRequest(
                object_id,start,end,
                None if elevation is None else float(elevation),
                None if sunlit is None else bool(sunlit),
                None if eclipsed is None else bool(eclipsed),
                rate,
                None if priority is None else float(priority),
                "NOT_COMPUTED",
                "NOT_SUPPLIED" if sunlit is None and eclipsed is None else "CALLER_SUPPLIED",
            ))
        # Candidates without a priority are not ranked as "worst"; they sort after the
        # ranked ones by start time, and their absence stays visible as None.
        ordered=sorted(
            accepted,
            key=lambda x:(x.caller_priority is None,-(x.caller_priority or 0.0),x.start_utc),
        )
        return ObservationPlanResult(tuple(ordered),tuple(rejected),"CALLER_SUPPLIED_PRIORITY","NOT_COMPUTED")

    def plan(self,candidates:list[dict[str,Any]],*,mount_rate_limit_deg_s:float)->list[ObservationRequest]:
        return list(self.screen(candidates,mount_rate_limit_deg_s=mount_rate_limit_deg_s).requests)


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
