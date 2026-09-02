from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
import re
import time
from typing import Any, Callable

from aetherus_domain import EvidenceClass, IntelligencePacket, canonical_hash


class ModelTier(str, Enum):
    """L02 routes. TEMPLATE is not a degraded model, it is no model at all.

    A TEMPLATE answer is composed deterministically from the Intelligence Packet.
    It is always available regardless of plan or provider health, which is what
    keeps the directive's rule that public-safety information is never behind a
    paywall: the tier ceiling changes how an answer is written, never whether the
    packet's safety content can be read.
    """

    TEMPLATE = "TEMPLATE"
    FAST = "FAST"
    STANDARD = "STANDARD"
    REASONING = "REASONING"


_TIER_ORDER = (ModelTier.TEMPLATE, ModelTier.FAST, ModelTier.STANDARD, ModelTier.REASONING)


class AudienceLevel(str, Enum):
    """L05 levels, in the order the directive names them."""

    GENERAL = "GENERAL"
    ENTHUSIAST = "ENTHUSIAST"
    RESEARCHER = "RESEARCHER"
    OPERATOR = "OPERATOR"


class ReportType(str, Enum):
    """L08 report types, as named in the directive."""

    DAILY_SPACE_BRIEF = "DAILY_SPACE_BRIEF"
    MISSION_BRIEF = "MISSION_BRIEF"
    EVENT_REPORT = "EVENT_REPORT"
    RESEARCH_SCENARIO_REPORT = "RESEARCH_SCENARIO_REPORT"


@dataclass(frozen=True)
class AuditContext:
    """Who asked, on whose behalf, under which capability.

    The directive requires this on every tool and provider call. It carries no
    secret material: private context is referenced by key name, never by value,
    so a stored trace cannot leak a tenant's data.
    """

    request_id: str
    feature: str
    user_id: str | None = None
    workspace_id: str | None = None
    tenant_id: str | None = None
    capability: str | None = None

    def redacted(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class UsageRecord:
    """Cost/latency/token metric per provider, model and feature.

    Latency is measured here, so it is ours to report. Token counts belong to the
    provider: when it reports none, the count is ``None`` and the status says the
    provider did not report it. Zero would be a measurement, and no measurement
    was taken. Cost needs a price table; without one it is UNAVAILABLE with the
    reason, not 0.0.
    """

    provider: str
    model: str
    feature: str
    latency_ms: float
    latency_basis: str = "COMPUTED_INTERNAL"
    tokens_in: int | None = None
    tokens_out: int | None = None
    tokens_status: str = "NOT_REPORTED_BY_PROVIDER"
    cost_usd: float | None = None
    cost_status: str = "UNAVAILABLE"
    cost_reason: str = "no price table is configured for this provider/model"
    outcome: str = "OK"


@dataclass(frozen=True)
class RoutingDecision:
    """What was asked for, what will actually run, and why they differ."""

    task_type: str
    requested_tier: str
    served_tier: str
    provider: str
    model: str
    downgraded: bool
    reason: str | None = None


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
    #: Which route actually ran and what it cost. A response that cannot say
    #: which tier produced it cannot be audited against the tier requested.
    usage: "UsageRecord | None" = None
    routing: "RoutingDecision | None" = None


class DeterministicLocalProvider:
    """Offline fallback/exerciser. It does not invent scientific values; callers supply validated context."""
    name="LOCAL_DETERMINISTIC"
    def generate(self,prompt:str,*,model:str="aetherus-safe-local",timeout_s:float=5.0)->str:
        if timeout_s<=0: raise TimeoutError("provider timeout")
        return prompt


class CircuitBreaker:
    """Keeps a provider fault inside the explanation layer.

    The directive requires that an LLM failure never stops the Engine or
    Intelligence pipeline. A breaker that has tripped answers immediately with
    the soft-fail response instead of spending each caller's timeout again.
    """

    def __init__(self,failure_threshold:int=3,cooldown_s:float=30.0):
        self.failure_threshold=failure_threshold; self.cooldown_s=cooldown_s
        self._failures:dict[str,int]={}; self._opened_at:dict[str,float]={}
    def state(self,key:str)->str:
        opened=self._opened_at.get(key)
        if opened is None: return "CLOSED"
        if time.monotonic()-opened>=self.cooldown_s:
            self._opened_at.pop(key,None); self._failures[key]=0
            return "HALF_OPEN"
        return "OPEN"
    def record_success(self,key:str)->None: self._failures[key]=0; self._opened_at.pop(key,None)
    def record_failure(self,key:str)->None:
        self._failures[key]=self._failures.get(key,0)+1
        if self._failures[key]>=self.failure_threshold: self._opened_at[key]=time.monotonic()


class LLMGateway:
    """L01 - provider-neutral entry point with audit, usage and a breaker.

    Three of the directive's common requirements are met here and none of them
    may be met by inventing a number. Latency is measured by this method, so it
    is reported as COMPUTED_INTERNAL. Token counts come from the provider; the
    deterministic local provider reports none, and the record says so rather than
    writing 0. Cost needs a price table that no deployment has configured yet, so
    it stays UNAVAILABLE with its reason attached.
    """

    id="L01"
    def __init__(self,providers:dict[str,Any]|None=None,breaker:CircuitBreaker|None=None):
        self.providers=providers or {"local":DeterministicLocalProvider()}
        self.breaker=breaker or CircuitBreaker()
        #: Append-only trace of provider calls. Prompts are recorded by hash, so a
        #: stored trace cannot leak private workspace content.
        self.usage:list[UsageRecord]=[]
        self.trace:list[dict[str,Any]]=[]

    def _record(self,audit:AuditContext|None,record:UsageRecord,*,prompt:str,decision:RoutingDecision|None)->None:
        self.usage.append(record)
        self.trace.append({
            "audit":audit.redacted() if audit else None,
            "prompt_sha256":canonical_hash(prompt),
            "routing":asdict(decision) if decision else None,
            "usage":asdict(record),
        })

    def generate(self,*,provider:str,prompt:str,model:str,packet:IntelligencePacket|None,authorized:bool=True,private_context:dict[str,Any]|None=None,timeout_s:float=5.0,audit:AuditContext|None=None,decision:RoutingDecision|None=None)->LLMResponse:
        if not authorized: raise PermissionError("LLM context access denied")
        p=self.providers.get(provider)
        if p is None: raise KeyError("unknown provider")
        feature=audit.feature if audit else "UNSPECIFIED"
        key=f"{provider}:{model}"

        if self.breaker.state(key)=="OPEN":
            record=UsageRecord(provider,model,feature,latency_ms=0.0,outcome="CIRCUIT_OPEN")
            self._record(audit,record,prompt=prompt,decision=decision)
            return LLMResponse("Explanation temporarily unavailable.",provider,model,"UNAVAILABLE",(),(),("PROVIDER_CIRCUIT_OPEN",),usage=record,routing=decision)

        started=time.perf_counter()
        try: text=p.generate(prompt,model=model,timeout_s=timeout_s)
        except TimeoutError:
            # Explanation layer fails softly and never mutates Intelligence.
            self.breaker.record_failure(key)
            record=UsageRecord(provider,model,feature,latency_ms=(time.perf_counter()-started)*1000.0,outcome="PROVIDER_TIMEOUT")
            self._record(audit,record,prompt=prompt,decision=decision)
            return LLMResponse("Explanation temporarily unavailable.",provider,model,"UNAVAILABLE",(),(),("PROVIDER_TIMEOUT",),usage=record,routing=decision)
        self.breaker.record_success(key)
        reported=getattr(p,"last_usage",None) or {}
        record=UsageRecord(
            provider,model,feature,
            latency_ms=(time.perf_counter()-started)*1000.0,
            tokens_in=reported.get("tokens_in"),
            tokens_out=reported.get("tokens_out"),
            tokens_status="REPORTED_BY_PROVIDER" if reported.get("tokens_in") is not None else "NOT_REPORTED_BY_PROVIDER",
        )
        self._record(audit,record,prompt=prompt,decision=decision)
        classes=tuple(sorted({e.evidence_class.value for e in packet.evidence})) if packet else ()
        citations=tuple(str(e.id) for e in packet.evidence) if packet else ()
        return LLMResponse(text,getattr(p,'name',provider),model,packet.event.validation_state.value if packet else "UNAVAILABLE",classes,citations,usage=record,routing=decision)


class ModelRouter:
    """L02 - pick a route by task, difficulty, cost/latency budget and plan.

    Previously this mapped task type to a provider and stopped there, so the
    subscription tier and the question's difficulty had no effect and a caller
    could not learn which route actually ran.

    The rule that matters here: ``served_tier`` is what will execute. When the
    requested tier is unreachable - no provider is registered for it, or the
    plan's ceiling is lower - the decision is downgraded and carries the reason.
    Reporting the requested tier as if it had run is the same defect as reporting
    a metric someone else computed as our own.
    """

    id="L02"

    #: Plan names are the ones the platform's subscription table actually uses.
    #: The ceiling governs how an answer is composed, never what it may contain:
    #: TEMPLATE is always reachable, so packet content - including public-safety
    #: content - is never withheld by plan.
    PLAN_TIER_CEILING = {
        "FREE": ModelTier.FAST,
        "AETHERUS+": ModelTier.STANDARD,
        "PRO / RESEARCH": ModelTier.REASONING,
        "CONTROL / INSTITUTION": ModelTier.REASONING,
        "OPERATIONS": ModelTier.REASONING,
        "REMOVAL INTELLIGENCE": ModelTier.REASONING,
    }

    #: The tier a task type asks for before any budget or plan is applied.
    TASK_TIER = {
        "EXPLANATION": ModelTier.FAST,
        "BRIEFING": ModelTier.STANDARD,
        "TOOL": ModelTier.FAST,
        "SCENARIO_NARRATIVE": ModelTier.REASONING,
    }

    def __init__(self,routes:dict[str,tuple[str,str]]|None=None,tier_routes:dict[ModelTier,tuple[str,str]]|None=None):
        self.routes=routes or {"EXPLANATION":("local","aetherus-safe-local"),"BRIEFING":("local","aetherus-safe-local"),"TOOL":("local","aetherus-safe-local")}
        # Only the deterministic local route is registered by default. Real FAST/
        # STANDARD/REASONING providers need credentials, so registering them here
        # would put a route in the table that cannot run.
        self.tier_routes=dict(tier_routes or {ModelTier.TEMPLATE:("local","aetherus-safe-local")})

    def route(self,task_type:str,*,contains_private_context:bool=False,allowed_providers:set[str]|None=None)->tuple[str,str]:
        """Back-compatible provider/model pair. See :meth:`decide` for the reason."""
        decision=self.decide(task_type,contains_private_context=contains_private_context,allowed_providers=allowed_providers)
        return decision.provider,decision.model

    def decide(
        self,
        task_type:str,
        *,
        plan:str|None=None,
        difficulty:str|None=None,
        latency_budget_ms:float|None=None,
        contains_private_context:bool=False,
        allowed_providers:set[str]|None=None,
    )->RoutingDecision:
        requested=self.TASK_TIER.get(task_type,ModelTier.FAST)
        if difficulty=="HIGH": requested=ModelTier.REASONING
        elif difficulty=="LOW": requested=ModelTier.FAST
        reasons:list[str]=[]
        served=requested

        if latency_budget_ms is not None and latency_budget_ms<1500 and served!=ModelTier.TEMPLATE:
            served=ModelTier.TEMPLATE
            reasons.append(f"latency budget {latency_budget_ms} ms admits only a deterministic template route")

        if plan is not None:
            ceiling=self.PLAN_TIER_CEILING.get(plan,self.PLAN_TIER_CEILING["FREE"])
            if _TIER_ORDER.index(served)>_TIER_ORDER.index(ceiling):
                reasons.append(f"plan {plan!r} admits at most {ceiling.value}")
                served=ceiling

        while served not in self.tier_routes and served!=ModelTier.TEMPLATE:
            reasons.append(f"no provider is registered for {served.value}")
            served=_TIER_ORDER[_TIER_ORDER.index(served)-1]
        if served not in self.tier_routes:
            raise KeyError("no provider is registered for any tier, not even TEMPLATE")

        provider,model=self.tier_routes[served]
        if allowed_providers is not None and provider not in allowed_providers: raise PermissionError("provider not allowed for workspace")
        if contains_private_context and provider!="local": raise PermissionError("private context cannot leave approved provider boundary")
        return RoutingDecision(
            task_type=task_type,
            requested_tier=requested.value,
            served_tier=served.value,
            provider=provider,
            model=model,
            downgraded=served!=requested,
            reason="; ".join(reasons) or None,
        )


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
    """L04 - assemble the minimum context, and say what was left out.

    The directive asks for "only the Event/Revision/Evidence the question needs".
    This used to return every section of the packet, which is the maximum, not
    the minimum.

    A reduced context has to be labelled reduced. Otherwise the consumer - a
    model, or a person reading a trace - cannot tell a section that was omitted
    to save room from a section the Intelligence layer had nothing to put in.
    Those are different facts and they must not look alike, so
    :meth:`compose_minimal` returns ``included_sections`` and
    ``omitted_sections`` alongside the content.
    """

    id="L04"

    #: Every section this composer can emit, in packet order.
    SECTIONS = (
        "event","revision","evidence","confidence","uncertainty",
        "what_happened","what_changed","why_it_matters",
        "allowed_claims","prohibited_claims","known_limitations",
        "scenario_results","decision_comparisons",
    )

    #: What a question of each intent actually needs. The claim guardrails
    #: (allowed/prohibited/limitations) are in every profile: dropping them to
    #: save context is how an unsupported claim gets through.
    INTENT_PROFILES = {
        "WHAT_HAPPENED": ("event","what_happened","allowed_claims","prohibited_claims","known_limitations"),
        "WHAT_CHANGED": ("event","revision","what_changed","allowed_claims","prohibited_claims","known_limitations"),
        "WHY_IT_MATTERS": ("event","why_it_matters","confidence","allowed_claims","prohibited_claims","known_limitations"),
        "EVIDENCE": ("event","evidence","confidence","uncertainty","allowed_claims","prohibited_claims","known_limitations"),
        "SCENARIO": ("event","scenario_results","decision_comparisons","allowed_claims","prohibited_claims","known_limitations"),
    }

    def _section(self,packet:IntelligencePacket,name:str)->Any:
        if name=="event": return packet.event.model_dump(mode="json")
        if name=="revision": return packet.revision.model_dump(mode="json")
        if name=="evidence": return [e.model_dump(mode="json") for e in packet.evidence]
        if name=="confidence": return packet.confidence.model_dump(mode="json")
        if name=="uncertainty": return packet.uncertainty.model_dump(mode="json")
        return getattr(packet,name)

    def compose_minimal(
        self,
        packet:IntelligencePacket,
        *,
        intent:str|None=None,
        sections:tuple[str,...]|None=None,
        workspace_context:dict[str,Any]|None=None,
        authorized_private_keys:set[str]|None=None,
    )->dict[str,Any]:
        """Compose only what the intent needs, and record what that left out."""
        if sections is None:
            sections=self.INTENT_PROFILES.get(str(intent).upper(),self.SECTIONS) if intent else self.SECTIONS
        unknown=[name for name in sections if name not in self.SECTIONS]
        if unknown: raise KeyError(f"unknown context section(s): {sorted(unknown)}")
        workspace_context=workspace_context or {}; authorized_private_keys=authorized_private_keys or set()
        safe_private={k:v for k,v in workspace_context.items() if k in authorized_private_keys}
        content={name:self._section(packet,name) for name in sections}
        omitted=tuple(name for name in self.SECTIONS if name not in sections)
        return {
            **content,
            "workspace_private":safe_private,
            "context_scope":{
                "intent":intent,
                "included_sections":tuple(sections),
                "omitted_sections":omitted,
                # Said plainly so a consumer never reads absence as emptiness.
                "note":"Omitted sections were not sent to keep the context minimal. Their absence here is not evidence that the packet lacks them.",
            },
        }

    def compose(self,packet:IntelligencePacket,*,workspace_context:dict[str,Any]|None=None,authorized_private_keys:set[str]|None=None)->dict[str,Any]:
        """Full context. :meth:`compose_minimal` is the directive's L04 purpose."""
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


_LABELS = {
    "what_happened":("What happened: ","무슨 일이 있었나: "),
    "what_changed":("What changed: ","무엇이 바뀌었나: "),
    "why_it_matters":("Why it matters: ","왜 중요한가: "),
    "validation":("Validation: ","검증 상태: "),
    "limitations":("Limitations: ","제한사항: "),
    "confidence":("Confidence grade: ","신뢰 등급: "),
    "uncertainty":("Uncertainty representation: ","불확실성 표현: "),
    "evidence":("Evidence: ","근거: "),
    "not_to_conclude":(
        "This packet declares conclusions that must not be drawn; they are listed in prohibited_claims.",
        "이 패킷은 단정해서는 안 되는 결론을 선언하고 있으며, 목록은 prohibited_claims에 있습니다.",
    ),
}


class ExplanationAgent:
    """L05 - one packet, four audience levels.

    The directive names general, enthusiast, researcher and operator. A level
    selects which of the packet's own statements are shown; it never rewrites a
    claim into a simpler one, because a simplified restatement of a scientific
    claim is a new claim that nothing supports.

    Two things appear at every level and are never dropped for brevity: the
    validation state, and the packet's limitations. A shorter answer that omits
    "this is screening grade" is not shorter, it is wrong.
    """

    id="L05"

    #: Which sections each level shows, beyond the validation state and
    #: limitations that all levels carry.
    LEVEL_SECTIONS = {
        AudienceLevel.GENERAL: ("what_happened",),
        AudienceLevel.ENTHUSIAST: ("what_happened","what_changed","why_it_matters"),
        AudienceLevel.RESEARCHER: ("what_happened","what_changed","why_it_matters","confidence","uncertainty","evidence"),
        AudienceLevel.OPERATOR: ("what_happened","what_changed","why_it_matters","confidence","uncertainty","evidence","not_to_conclude"),
    }

    def __init__(self,validator:ClaimCitationValidator|None=None): self.validator=validator or ClaimCitationValidator()

    def _label(self,key:str,ko:bool)->str:
        en,kr=_LABELS[key]; return kr if ko else en

    def explain(self,packet:IntelligencePacket,*,locale:str="en",audience:AudienceLevel|str=AudienceLevel.ENTHUSIAST)->str:
        level=AudienceLevel(audience) if not isinstance(audience,AudienceLevel) else audience
        ko=locale.lower().startswith("ko"); sections=self.LEVEL_SECTIONS[level]; parts=[]

        if "what_happened" in sections and packet.what_happened:
            parts.append(self._label("what_happened",ko)+" ".join(_localized_claim(x,locale) for x in packet.what_happened))
        if "what_changed" in sections and packet.what_changed:
            parts.append(self._label("what_changed",ko)+" ".join(_localized_claim(x,locale) for x in packet.what_changed))
        if "why_it_matters" in sections and packet.why_it_matters:
            parts.append(self._label("why_it_matters",ko)+" ".join(_localized_claim(x,locale) for x in packet.why_it_matters))

        # Never abbreviated away: a reader at any level must know what grade of
        # statement this is.
        parts.append(self._label("validation",ko)+f"{packet.event.validation_state.value}.")

        if "confidence" in sections:
            # The grade, not the score. A score rendered as text is a number the
            # reader will quote, and its formatting must not drift from the
            # packet's own value; the grade carries the same meaning safely.
            parts.append(self._label("confidence",ko)+f"{packet.confidence.grade.value}.")
        if "uncertainty" in sections:
            parts.append(self._label("uncertainty",ko)+f"{packet.uncertainty.representation}.")
        if "evidence" in sections and packet.evidence:
            parts.append(self._label("evidence",ko)+", ".join(str(e.id) for e in packet.evidence)+".")
        if "not_to_conclude" in sections and packet.prohibited_claims:
            # The pointer, never the sentence. Quoting a prohibited claim into
            # prose puts the forbidden statement one copy-paste away from being
            # read as ours, and L06 correctly withholds any text containing one.
            # The claims themselves are returned as a list by :meth:`compose`.
            parts.append(self._label("not_to_conclude",ko))

        if packet.known_limitations:
            parts.append(self._label("limitations",ko)+"; ".join(_localized_claim(x,locale) for x in packet.known_limitations))

        return self.validator.qualify(" ".join(parts),packet)

    def compose(self,packet:IntelligencePacket,*,locale:str="en",audience:AudienceLevel|str=AudienceLevel.ENTHUSIAST)->dict[str,Any]:
        """The explanation plus the structured guardrails for that level.

        An operator needs to see the boundary, and the boundary cannot go in the
        prose. It travels as data instead: a list of claims that must not be
        drawn, which no text extractor can mistake for an assertion.
        """
        level=AudienceLevel(audience) if not isinstance(audience,AudienceLevel) else audience
        text=self.explain(packet,locale=locale,audience=level)
        guardrails:dict[str,Any]={}
        if "not_to_conclude" in self.LEVEL_SECTIONS[level]:
            guardrails={
                "prohibited_claims":list(packet.prohibited_claims),
                "allowed_claims":list(packet.allowed_claims),
            }
        return {"text":text,"audience":level.value,"locale":locale,"guardrails":guardrails}


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
    report_type:str=ReportType.DAILY_SPACE_BRIEF.value
    data_status:str="OK"
    status_reason:str|None=None
    warnings:tuple[str,...]=()

class BriefingReportGenerator:
    """L08 - the four report types the directive names.

    Daily Space Brief, Mission Brief, Event Report and Research/Scenario Report
    differ in what they select from each packet, not in what they are willing to
    assert. Every type carries the validation state and the limitations.

    A Research/Scenario Report over packets that hold no scenario results is
    returned as INSUFFICIENT_DATA rather than as an empty report. An empty
    report reads as "the scenarios found nothing"; the truth is that no scenario
    was run.
    """

    id="L08"

    def _section(self,p:IntelligencePacket,report_type:ReportType,locale:str)->dict[str,Any]:
        base={
            "event_id":str(p.event.id),
            "validation_state":p.event.validation_state.value,
            "limitations":[_localized_claim(x,locale) for x in p.known_limitations],
        }
        if report_type is ReportType.DAILY_SPACE_BRIEF:
            return {**base,"what_happened":[_localized_claim(x,locale) for x in p.what_happened]}
        if report_type is ReportType.MISSION_BRIEF:
            return {**base,
                "what_happened":[_localized_claim(x,locale) for x in p.what_happened],
                "what_changed":[_localized_claim(x,locale) for x in p.what_changed]}
        if report_type is ReportType.EVENT_REPORT:
            return {**base,
                "what_happened":[_localized_claim(x,locale) for x in p.what_happened],
                "what_changed":[_localized_claim(x,locale) for x in p.what_changed],
                "why_it_matters":[_localized_claim(x,locale) for x in p.why_it_matters],
                "revision":p.revision.model_dump(mode="json"),
                "confidence_grade":p.confidence.grade.value,
                "uncertainty_representation":p.uncertainty.representation,
                "evidence_ids":[str(e.id) for e in p.evidence],
                "prohibited_claims":[_localized_claim(x,locale) for x in p.prohibited_claims]}
        return {**base,
            "why_it_matters":[_localized_claim(x,locale) for x in p.why_it_matters],
            "scenario_results":p.scenario_results,
            "decision_comparisons":p.decision_comparisons,
            "evidence_ids":[str(e.id) for e in p.evidence]}

    def generate(self,packets:list[IntelligencePacket],*,title:str="Aetherus Briefing",locale:str="en",report_type:ReportType|str=ReportType.DAILY_SPACE_BRIEF)->Briefing:
        rtype=ReportType(report_type) if not isinstance(report_type,ReportType) else report_type
        sections=[self._section(p,rtype,locale) for p in packets]
        evidence=[str(e.id) for p in packets for e in p.evidence]
        warnings:list[str]=[]
        status="OK"; reason=None

        if not packets:
            status="INSUFFICIENT_DATA"; reason="no Intelligence Packet was supplied for this report"
        elif rtype is ReportType.RESEARCH_SCENARIO_REPORT:
            warnings.append("Scenario output is simulated, never an observed outcome, and is not promotable to fact.")
            if not any(p.scenario_results or p.decision_comparisons for p in packets):
                status="INSUFFICIENT_DATA"
                reason="no scenario result or decision comparison is present in the supplied packets; an empty scenario report would read as a scenario that found nothing"

        payload={"title":title,"report_type":rtype.value,"sections":sections,"evidence_ids":sorted(set(evidence)),"locale":locale}
        return Briefing(
            datetime.now(timezone.utc),title,tuple(sections),tuple(sorted(set(evidence))),
            canonical_hash(payload),
            report_type=rtype.value,data_status=status,status_reason=reason,warnings=tuple(warnings),
        )
