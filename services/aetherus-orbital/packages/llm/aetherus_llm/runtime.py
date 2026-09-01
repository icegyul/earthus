from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import re
from typing import Any, Callable

from aetherus_domain import EvidenceClass, IntelligencePacket, canonical_hash

_KO_CLAIMS={
    "Apollo 11 launch is recorded by the fixed NASA official fixture.":"Apollo 11 발사가 NASA 공식 고정 자료에 기록되어 있습니다.",
    "The historical launch fact entered the executable Aetherus Foundation state and event lineage.":"과거 발사 사실이 실행 가능한 Aetherus Foundation 상태와 이벤트 계보에 반영되었습니다.",
    "This proves the first evidence-backed Mission-to-Intelligence integration path without inventing telemetry or risk metrics.":"텔레메트리나 위험 수치를 만들어내지 않고, 근거 기반 Mission-to-Intelligence 통합 경로를 검증합니다.",
    "The source is a fixed official regression fixture, not a live NASA provider fetch.":"이 출처는 공식 고정 회귀검증 자료이며, 실시간 NASA 공급자 조회 결과가 아닙니다.",
    "E13 production Mission/Launch engine is not implemented by this adapter.":"이 어댑터가 E13 운영 Mission/Launch 엔진 전체를 구현한 것은 아닙니다.",
    "No telemetry, trajectory, orbit insertion, or risk calculation is inferred from the fixture.":"이 자료에서 텔레메트리·궤적·궤도 투입·위험 계산을 추론하지 않습니다.",
    "Independent second-source cross-validation is not connected in this Foundation slice.":"이 Foundation 단계에는 독립적인 두 번째 출처의 교차검증이 아직 연결되지 않았습니다.",
}
def _localized_claim(text:str,locale:str)->str:
    return _KO_CLAIMS.get(text,text) if locale.lower().startswith("ko") else text


@dataclass(frozen=True)
class LLMResponse:
    text: str
    provider: str
    model: str
    validation_state: str
    evidence_classes: tuple[str, ...]
    citations: tuple[str, ...]
    warnings: tuple[str, ...] = ()


class DeterministicLocalProvider:
    """Offline fallback/exerciser. It does not invent scientific values; callers supply validated context."""
    name="LOCAL_DETERMINISTIC"
    def generate(self,prompt:str,*,model:str="aetherus-safe-local",timeout_s:float=5.0)->str:
        if timeout_s<=0: raise TimeoutError("provider timeout")
        return prompt


class LLMGateway:
    id="L01"
    def __init__(self,providers:dict[str,Any]|None=None): self.providers=providers or {"local":DeterministicLocalProvider()}
    def generate(self,*,provider:str,prompt:str,model:str,packet:IntelligencePacket|None,authorized:bool=True,private_context:dict[str,Any]|None=None,timeout_s:float=5.0)->LLMResponse:
        if not authorized: raise PermissionError("LLM context access denied")
        p=self.providers.get(provider)
        if p is None: raise KeyError("unknown provider")
        try: text=p.generate(prompt,model=model,timeout_s=timeout_s)
        except TimeoutError:
            # Explanation layer fails softly and never mutates Intelligence.
            return LLMResponse("Explanation temporarily unavailable.",provider,model,"UNAVAILABLE",(),(),("PROVIDER_TIMEOUT",))
        classes=tuple(sorted({e.evidence_class.value for e in packet.evidence})) if packet else ()
        citations=tuple(str(e.id) for e in packet.evidence) if packet else ()
        return LLMResponse(text,getattr(p,'name',provider),model,packet.event.validation_state.value if packet else "UNAVAILABLE",classes,citations)


class ModelRouter:
    id="L02"
    def __init__(self,routes:dict[str,tuple[str,str]]|None=None):
        self.routes=routes or {"EXPLANATION":("local","aetherus-safe-local"),"BRIEFING":("local","aetherus-safe-local"),"TOOL":("local","aetherus-safe-local")}
    def route(self,task_type:str,*,contains_private_context:bool=False,allowed_providers:set[str]|None=None)->tuple[str,str]:
        provider,model=self.routes.get(task_type,self.routes["EXPLANATION"])
        if allowed_providers is not None and provider not in allowed_providers: raise PermissionError("provider not allowed for workspace")
        if contains_private_context and provider!="local": raise PermissionError("private context cannot leave approved provider boundary")
        return provider,model


class ToolOrchestrator:
    id="L03"
    def __init__(self): self.tools:dict[str,tuple[Callable[...,Any],bool]]={}
    def register(self,name:str,fn:Callable[...,Any],*,scientific:bool=False)->None: self.tools[name]=(fn,scientific)
    def call(self,name:str,args:dict[str,Any],*,authorized:bool,allow_scientific_tool:bool=False)->Any:
        if not authorized: raise PermissionError("tool access denied")
        if name not in self.tools: raise KeyError("tool not registered")
        fn,scientific=self.tools[name]
        if scientific and not allow_scientific_tool: raise PermissionError("scientific tool requires explicit approved contract")
        if any(k.lower() in {"spacecraft_command","execute_maneuver","collision_avoidance_command"} for k in args): raise PermissionError("automatic command path prohibited")
        return fn(**args)


class ContextComposer:
    id="L04"
    def compose(self,packet:IntelligencePacket,*,workspace_context:dict[str,Any]|None=None,authorized_private_keys:set[str]|None=None)->dict[str,Any]:
        workspace_context=workspace_context or {}; authorized_private_keys=authorized_private_keys or set()
        safe_private={k:v for k,v in workspace_context.items() if k in authorized_private_keys}
        return {
            "event":packet.event.model_dump(mode="json"),
            "revision":packet.revision.model_dump(mode="json"),
            "evidence":[e.model_dump(mode="json") for e in packet.evidence],
            "confidence":packet.confidence.model_dump(mode="json"),
            "uncertainty":packet.uncertainty.model_dump(mode="json"),
            "allowed_claims":packet.allowed_claims,
            "prohibited_claims":packet.prohibited_claims,
            "known_limitations":packet.known_limitations,
            "workspace_private":safe_private,
        }


class ClaimCitationValidator:
    id="L06"
    _number=re.compile(r"(?<![A-Za-z0-9_])[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?",re.I)
    def _packet_numbers(self,packet:IntelligencePacket)->set[str]:
        import json
        raw=json.dumps(packet.model_dump(mode="json"),sort_keys=True,default=str)
        return set(self._number.findall(raw))
    def validate(self,text:str,packet:IntelligencePacket)->dict[str,Any]:
        claims=self._number.findall(text); allowed=self._packet_numbers(packet); unsupported=[n for n in claims if n not in allowed]
        prohibited_hits=[p for p in packet.prohibited_claims if p and p.lower() in text.lower()]
        return {"valid":not unsupported and not prohibited_hits,"unsupported_numeric_claims":unsupported,"prohibited_claim_hits":prohibited_hits,"evidence_ids":[str(e.id) for e in packet.evidence]}
    def qualify(self,text:str,packet:IntelligencePacket)->str:
        result=self.validate(text,packet)
        if result['valid']: return text
        return "Claim withheld: the requested numeric/scientific statement is not supported by the current Intelligence Packet."


class ExplanationAgent:
    id="L05"
    def __init__(self,validator:ClaimCitationValidator|None=None): self.validator=validator or ClaimCitationValidator()
    def explain(self,packet:IntelligencePacket,*,locale:str="en")->str:
        ko=locale.lower().startswith("ko");parts=[]
        if packet.what_happened: parts.append(("무슨 일이 있었나: " if ko else "What happened: ")+" ".join(_localized_claim(x,locale) for x in packet.what_happened))
        if packet.what_changed: parts.append(("무엇이 바뀌었나: " if ko else "What changed: ")+" ".join(_localized_claim(x,locale) for x in packet.what_changed))
        if packet.why_it_matters: parts.append(("왜 중요한가: " if ko else "Why it matters: ")+" ".join(_localized_claim(x,locale) for x in packet.why_it_matters))
        parts.append(("검증 상태: " if ko else "Validation: ")+f"{packet.event.validation_state.value}.")
        if packet.known_limitations: parts.append(("제한사항: " if ko else "Limitations: ")+"; ".join(_localized_claim(x,locale) for x in packet.known_limitations))
        text=" ".join(parts)
        return self.validator.qualify(text,packet)


class PersonalWorkspaceContext:
    id="L07"
    def __init__(self): self._store:dict[tuple[str,str],dict[str,Any]]={}
    def put(self,tenant_id:str,user_id:str,context:dict[str,Any])->None: self._store[(tenant_id,user_id)]=dict(context)
    def get(self,tenant_id:str,user_id:str,*,request_tenant_id:str,authorized:bool)->dict[str,Any]:
        if not authorized or tenant_id!=request_tenant_id: raise PermissionError("private context isolation")
        return dict(self._store.get((tenant_id,user_id),{}))


@dataclass(frozen=True)
class Briefing:
    generated_at:datetime
    title:str
    sections:tuple[dict[str,Any],...]
    evidence_ids:tuple[str,...]
    report_hash:str

class BriefingReportGenerator:
    id="L08"
    def generate(self,packets:list[IntelligencePacket],*,title:str="Aetherus Briefing",locale:str="en")->Briefing:
        sections=[]; evidence=[]
        for p in packets:
            sections.append({"event_id":str(p.event.id),"what_happened":[_localized_claim(x,locale) for x in p.what_happened],"what_changed":[_localized_claim(x,locale) for x in p.what_changed],"why_it_matters":[_localized_claim(x,locale) for x in p.why_it_matters],"validation_state":p.event.validation_state.value,"limitations":[_localized_claim(x,locale) for x in p.known_limitations]})
            evidence.extend(str(e.id) for e in p.evidence)
        payload={"title":title,"sections":sections,"evidence_ids":sorted(set(evidence)),"locale":locale}
        return Briefing(datetime.now(timezone.utc),title,tuple(sections),tuple(sorted(set(evidence))),canonical_hash(payload))
