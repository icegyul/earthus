from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable
from uuid import UUID, uuid4

from aetherus_domain import (
    ConfidenceAssessment,
    ConfidenceFactor,
    ConfidenceGrade,
    DecisionComparison,
    EvidenceClass,
    EvidenceRecord,
    EventRevision,
    IntelligenceEvent,
    SignalRecord,
    SourceGrade,
    UncertaintyAssessment,
    ValidationState,
    canonical_hash,
)


def _now(): return datetime.now(timezone.utc)


@dataclass(frozen=True)
class TaskSpec:
    task_id: str
    deps: tuple[str, ...] = ()
    fn: Callable[[dict[str, Any]], Any] | None = None
    intelligence_tool: bool = False
    approved_contract: str | None = None

@dataclass(frozen=True)
class TaskResult:
    task_id: str
    status: str
    result: Any = None
    error: str | None = None


class IntelligenceTaskOrchestrator:
    """E38 execution graph. Scientific computation remains inside registered domain engines/tools."""
    id="E38"
    def __init__(self):
        self.tasks: dict[str, TaskSpec] = {}
        self.event_log: list[dict[str, Any]] = []
        self._idempotent: dict[str, list[TaskResult]] = {}

    def register(self, spec: TaskSpec) -> None:
        if spec.intelligence_tool and not spec.approved_contract:
            raise ValueError("INTELLIGENCE_TOOL requires approved contract")
        self.tasks[spec.task_id] = spec
        self._topological_order()  # fail fast on cycles/missing deps

    def _topological_order(self) -> list[str]:
        indeg={k:0 for k in self.tasks}; adj=defaultdict(list)
        for k,s in self.tasks.items():
            for d in s.deps:
                if d not in self.tasks: raise ValueError(f"missing dependency {d}")
                indeg[k]+=1; adj[d].append(k)
        q=deque(sorted(k for k,v in indeg.items() if v==0)); out=[]
        while q:
            n=q.popleft(); out.append(n)
            for m in sorted(adj[n]):
                indeg[m]-=1
                if indeg[m]==0:q.append(m)
        if len(out)!=len(self.tasks): raise ValueError("circular task graph")
        return out

    def run(self, trigger_id: str, context: dict[str, Any], *, continue_on_error: bool=True) -> list[TaskResult]:
        if trigger_id in self._idempotent: return self._idempotent[trigger_id]
        results=[]; status={}
        for task_id in self._topological_order():
            spec=self.tasks[task_id]
            if any(status.get(d)!="PASS" for d in spec.deps):
                r=TaskResult(task_id,"SKIPPED_DEPENDENCY")
            else:
                try: r=TaskResult(task_id,"PASS",spec.fn(context) if spec.fn else None)
                except Exception as exc:
                    r=TaskResult(task_id,"FAILED",error=f"{type(exc).__name__}: {exc}")
                    if not continue_on_error:
                        results.append(r); break
            results.append(r); status[task_id]=r.status
        self._idempotent[trigger_id]=results
        self.event_log.append({"trigger_id":trigger_id,"context_hash":canonical_hash(context),"results":[r.__dict__ for r in results]})
        return results

    def replay(self, trigger_id: str) -> list[TaskResult] | None:
        return self._idempotent.get(trigger_id)


@dataclass(frozen=True)
class FusedEvidence:
    records: tuple[EvidenceRecord, ...]
    weighted_quality: float | None
    agreement: float | None
    conflicts: tuple[dict[str, Any], ...]
    missing: bool


class EvidenceFusionCrossValidationIntelligence:
    id="E39"
    weights={SourceGrade.OPERATIONAL:1.0,SourceGrade.OFFICIAL_PUBLIC:0.9,SourceGrade.VALIDATION_FIXTURE:0.7,SourceGrade.PUBLIC_SCREENING:0.6,SourceGrade.RESEARCH:0.5,SourceGrade.USER_OBSERVATION:0.3,SourceGrade.UNKNOWN:0.1}
    def fuse(self, records:list[EvidenceRecord], *, values_by_evidence_id:dict[str,float]|None=None, now:datetime|None=None, stale_after_s:float=86400)->FusedEvidence:
        if not records:return FusedEvidence((),None,None,(),True)
        now=now or _now(); values_by_evidence_id=values_by_evidence_id or {}
        weighted=[]
        for r in records:
            freshness=0.5 if (now-r.observed_at).total_seconds()>stale_after_s else 1.0
            q=(r.quality if r.quality is not None else 0.5)*self.weights.get(r.source_grade,0.1)*freshness
            weighted.append(q)
        vals=[(str(r.id),values_by_evidence_id.get(str(r.id))) for r in records if str(r.id) in values_by_evidence_id]
        conflicts=[]
        if len(vals)>=2:
            numeric=[v for _,v in vals if v is not None]
            span=max(numeric)-min(numeric) if numeric else 0
            scale=max(abs(mean) for mean in numeric) if numeric else 1
            agreement=max(0.0,1.0-span/(scale+1e-12))
            # Preserve official conflicts; never silently choose one.
            official=[(r,values_by_evidence_id.get(str(r.id))) for r in records if r.source_grade in {SourceGrade.OPERATIONAL,SourceGrade.OFFICIAL_PUBLIC} and str(r.id) in values_by_evidence_id]
            if len({v for _,v in official})>1:
                conflicts.append({"type":"OFFICIAL_SOURCE_CONFLICT","sources":[r.source_id for r,_ in official],"values":[v for _,v in official]})
        else: agreement=None
        return FusedEvidence(tuple(records),sum(weighted)/len(weighted),agreement,tuple(conflicts),False)


class SignalClassificationIntelligence:
    id="E40"
    allowed=set(EvidenceClass)
    def classify(self, signal:SignalRecord, *, requested_class:EvidenceClass|None=None)->SignalRecord:
        cls=requested_class or signal.evidence_class
        if cls not in self.allowed: raise ValueError("unknown evidence class")
        protected={EvidenceClass.OBSERVED,EvidenceClass.OFFICIAL}
        if signal.evidence_class in {EvidenceClass.AI_SIGNAL,EvidenceClass.MODEL_SIGNAL,EvidenceClass.SIMULATION_ONLY,EvidenceClass.COUNTERFACTUAL} and cls in protected:
            raise ValueError("signal class promotion forbidden")
        data=signal.model_dump(); data['evidence_class']=cls
        return SignalRecord(**data)
    def quarantine_unknown(self, class_name:str)->dict[str,str]:
        try: EvidenceClass(class_name)
        except ValueError:return {"status":"QUARANTINED","reason":"UNKNOWN_EVIDENCE_CLASS"}
        return {"status":"OK","reason":"KNOWN"}


class EventIntelligenceEngine:
    id="E41"
    def __init__(self): self.events:dict[str,IntelligenceEvent]={}
    def correlate(self, signal:SignalRecord, *, canonical_key:str, event_type:str|None=None, insufficient_allowed:bool=False)->IntelligenceEvent:
        now=_now()
        if canonical_key in self.events:
            e=self.events[canonical_key]; e.updated_at=now; return e
        validation=ValidationState.INSUFFICIENT_DATA if insufficient_allowed else ValidationState.UNVALIDATED
        e=IntelligenceEvent(event_type=event_type or signal.event_hint or signal.signal_type,canonical_key=canonical_key,object_ids=sorted(set(signal.object_ids)),mission_id=signal.mission_id,first_seen_at=now,updated_at=now,validation_state=validation)
        self.events[canonical_key]=e; return e
    def boundary_key(self,event_type:str,objects:list[str],bucket:str)->str:
        return f"{event_type}:{canonical_hash({'objects':sorted(objects),'bucket':bucket})[:24]}"
    def create_from_module(self, signal: SignalRecord, *, canonical_key: str, connection_mode: str) -> IntelligenceEvent:
        if connection_mode not in {"DIRECT_SIGNAL", "INTELLIGENCE_CORE"}:
            raise PermissionError(f"{connection_mode} may not directly create Event")
        return self.correlate(signal, canonical_key=canonical_key)


class RevisionIntelligenceEngine:
    id="E42"
    def __init__(self): self.ledger:dict[str,list[EventRevision]]=defaultdict(list)
    def append(self,event_id:UUID,*,cause_signal_ids:list[UUID],evidence_ids:list[UUID],delta:dict[str,Any],reason_codes:list[str],suppress_no_change:bool=True)->EventRevision|None:
        seq=self.ledger[str(event_id)]
        if suppress_no_change and not delta and seq:return None
        snap=canonical_hash({"event_id":str(event_id),"revision_no":len(seq)+1,"delta":delta,"evidence_ids":sorted(map(str,evidence_ids)),"reason_codes":reason_codes})
        r=EventRevision(event_id=event_id,revision_no=len(seq)+1,created_at=_now(),cause_signal_ids=cause_signal_ids,evidence_ids=evidence_ids,delta=delta,snapshot_hash=snap,reason_codes=reason_codes)
        seq.append(r); return r
    def correct(self,event_id:UUID,*,corrects_revision_no:int,delta:dict[str,Any],evidence_ids:list[UUID])->EventRevision:
        return self.append(event_id,cause_signal_ids=[],evidence_ids=evidence_ids,delta={**delta,"corrects_revision_no":corrects_revision_no},reason_codes=["CORRECTION"],suppress_no_change=False)


class ConfidenceUncertaintyIntelligence:
    id="E43"
    def assess(self,*,target_type:str,target_id:str,factors:dict[str,tuple[float,float,str]],policy_version:str,uncertainty:dict[str,Any]|None=None,missing_covariance:bool=False)->tuple[ConfidenceAssessment,UncertaintyAssessment]:
        items=[]; num=den=0.0
        for name,(value,weight,reason) in factors.items():
            # UI/subscription/consumer state is presentation context, never a scientific confidence factor.
            lowered=name.lower()
            if lowered.startswith(("ui_","subscription_","consumer_","plan_")):
                continue
            v=max(0,min(1,float(value))); w=max(0,float(weight)); num+=v*w; den+=w; items.append(ConfidenceFactor(name=name,value=v,weight=w,reason=reason))
        score=num/den if den else None
        if score is None: grade=ConfidenceGrade.NOT_ASSESSED
        elif score<.2:grade=ConfidenceGrade.VERY_LOW
        elif score<.4:grade=ConfidenceGrade.LOW
        elif score<.6:grade=ConfidenceGrade.MEDIUM
        elif score<.8:grade=ConfidenceGrade.HIGH
        else:grade=ConfidenceGrade.VERY_HIGH
        conf=ConfidenceAssessment(target_type=target_type,target_id=target_id,score=score,grade=grade,factors=items,computed_at=_now(),policy_version=policy_version,limitations=["MISSING_COVARIANCE_LIMITS_COLLISION_CLAIMS"] if missing_covariance else [])
        if missing_covariance:
            unc=UncertaintyAssessment(target_type=target_type,target_id=target_id,representation="UNAVAILABLE",computed_at=_now(),policy_version=policy_version,limitations=["covariance unavailable"])
        elif uncertainty:
            rep=uncertainty.get('representation','QUALITATIVE')
            unc=UncertaintyAssessment(target_type=target_type,target_id=target_id,representation=rep,lower=uncertainty.get('lower'),upper=uncertainty.get('upper'),units=uncertainty.get('units'),payload=uncertainty.get('payload',{}),computed_at=_now(),policy_version=policy_version,limitations=uncertainty.get('limitations',[]))
        else:
            unc=UncertaintyAssessment(target_type=target_type,target_id=target_id,representation="NONE",computed_at=_now(),policy_version=policy_version)
        return conf,unc
    def scientific_hash(self, confidence: ConfidenceAssessment, uncertainty: UncertaintyAssessment) -> str:
        return canonical_hash({
            "target_type": confidence.target_type,
            "target_id": confidence.target_id,
            "score": confidence.score,
            "grade": confidence.grade.value,
            "factors": [{"name":f.name,"value":f.value,"weight":f.weight,"reason":f.reason} for f in confidence.factors],
            "confidence_policy_version": confidence.policy_version,
            "confidence_limitations": confidence.limitations,
            "uncertainty_representation": uncertainty.representation,
            "lower": uncertainty.lower,
            "upper": uncertainty.upper,
            "units": uncertainty.units,
            "payload": uncertainty.payload,
            "uncertainty_policy_version": uncertainty.policy_version,
            "uncertainty_limitations": uncertainty.limitations,
        })


@dataclass(frozen=True)
class ImportanceResult:
    score:float
    reasons:tuple[dict[str,Any],...]
    policy_version:str


class ImportanceAttributionDecisionIntelligence:
    id="E44"
    def importance(self,*,magnitude:float,change_rate:float,affected_objects:int,confidence:float,policy_version:str="importance-v1",weights:dict[str,float]|None=None)->ImportanceResult:
        w=weights or {"magnitude":0.25,"change_rate":0.40,"affected_objects":0.20,"confidence":0.15}
        normalized={"magnitude":max(0,min(1,magnitude)),"change_rate":max(0,min(1,change_rate)),"affected_objects":max(0,min(1,affected_objects/100)),"confidence":max(0,min(1,confidence))}
        score=sum(normalized[k]*w.get(k,0) for k in normalized)
        reasons=tuple({"factor":k,"value":normalized[k],"weight":w.get(k,0),"contribution":normalized[k]*w.get(k,0)} for k in normalized)
        return ImportanceResult(score,reasons,policy_version)

    def decision(self,*,baseline_scenario_id:UUID,options:list[dict[str,Any]],criteria:list[str],policy:dict[str,float]|None=None)->DecisionComparison:
        if len(options)<2 and not policy:
            raise ValueError("single-option recommendation requires explicit policy")
        policy=policy or {c:1.0 for c in criteria}
        ranked=[]
        for o in options:
            values=o.get('criteria',{}); score=sum(float(values.get(c,0))*float(policy.get(c,0)) for c in criteria)
            # New-risk is always surfaced and penalized rather than hidden.
            new_risk=float(o.get('new_risk',0)); score-=new_risk*float(policy.get('new_risk_penalty',1.0))
            ranked.append({"scenario_id":str(o['scenario_id']),"score":score,"new_risk":new_risk,"assumptions":list(o.get('assumptions',[])),"provenance":dict(o.get('provenance',{}))})
        ranked.sort(key=lambda x:-x['score'])
        # Strip command-like fields; this layer never produces spacecraft commands.
        for r in ranked:
            for forbidden in ('command','execute','spacecraft_command','maneuver_command'): r.pop(forbidden,None)
        return DecisionComparison(baseline_scenario_id=baseline_scenario_id,option_scenario_ids=[UUID(str(o['scenario_id'])) for o in options],criteria=criteria,ranked_options=ranked,generated_at=_now(),advisory_only=True,limitations=["ADVISORY_ONLY","NO_AUTOMATIC_SPACECRAFT_COMMAND"])
