from __future__ import annotations
from datetime import datetime, timezone
from enum import StrEnum
from hashlib import sha256
from typing import Any, Literal
from uuid import UUID, uuid4
from pydantic import BaseModel, ConfigDict, Field, field_validator

class EvidenceClass(StrEnum):
    OBSERVED='OBSERVED'; OFFICIAL='OFFICIAL'; DERIVED='DERIVED'; MODEL_SIGNAL='MODEL_SIGNAL'; AI_SIGNAL='AI_SIGNAL'; SIMULATION_ONLY='SIMULATION_ONLY'; COUNTERFACTUAL='COUNTERFACTUAL'; ATTRIBUTION_RESULT='ATTRIBUTION_RESULT'
class SourceGrade(StrEnum):
    OPERATIONAL='OPERATIONAL'; OFFICIAL_PUBLIC='OFFICIAL_PUBLIC'; VALIDATION_FIXTURE='VALIDATION_FIXTURE'; PUBLIC_SCREENING='PUBLIC_SCREENING'; RESEARCH='RESEARCH'; USER_OBSERVATION='USER_OBSERVATION'; UNKNOWN='UNKNOWN'
class ValidationState(StrEnum):
    UNVALIDATED='UNVALIDATED'; SCREENING_ONLY='SCREENING_ONLY'; VALIDATION_PENDING='VALIDATION_PENDING'; VALIDATED_PIPELINE='VALIDATED_PIPELINE'; RESEARCH_ONLY='RESEARCH_ONLY'; INSUFFICIENT_DATA='INSUFFICIENT_DATA'
class EventStatus(StrEnum):
    OPEN='OPEN'; WATCH='WATCH'; ACTIVE='ACTIVE'; RESOLVED='RESOLVED'; CLOSED='CLOSED'
class ConfidenceGrade(StrEnum):
    VERY_LOW='VERY_LOW'; LOW='LOW'; MEDIUM='MEDIUM'; HIGH='HIGH'; VERY_HIGH='VERY_HIGH'; NOT_ASSESSED='NOT_ASSESSED'

class StrictModel(BaseModel):
    model_config=ConfigDict(extra='forbid')

class EvidenceRecord(StrictModel):
    id: UUID = Field(default_factory=uuid4)
    evidence_class: EvidenceClass
    source_id: str
    source_record_id: str|None=None
    observed_at: datetime
    received_at: datetime
    checksum_sha256: str
    source_grade: SourceGrade
    quality: float|None=Field(default=None,ge=0,le=1)
    coordinate_frame: str|None=None
    license_policy: str|None=None
    access_policy: str|None=None
    metadata: dict[str,Any]=Field(default_factory=dict)
    @field_validator('observed_at','received_at')
    @classmethod
    def aware(cls,v:datetime)->datetime:
        if v.tzinfo is None: raise ValueError('naive datetime forbidden')
        return v.astimezone(timezone.utc)
    @field_validator('checksum_sha256')
    @classmethod
    def sha(cls,v:str)->str:
        if len(v)!=64 or any(c not in '0123456789abcdefABCDEF' for c in v): raise ValueError('sha256 hex required')
        return v.lower()

class SignalRecord(StrictModel):
    id: UUID=Field(default_factory=uuid4)
    signal_type: str
    evidence_class: EvidenceClass
    producer_module_id: str
    observed_at: datetime
    object_ids: list[str]=Field(default_factory=list)
    mission_id: str|None=None
    event_hint: str|None=None
    metric_type: str|None=None
    value: float|str|bool|None=None
    units: str|None=None
    significance: float|None=Field(default=None,ge=0,le=1)
    evidence_ids: list[UUID]=Field(default_factory=list)
    payload: dict[str,Any]=Field(default_factory=dict)
    @field_validator('observed_at')
    @classmethod
    def aware(cls,v:datetime)->datetime:
        if v.tzinfo is None: raise ValueError('naive datetime forbidden')
        return v.astimezone(timezone.utc)

class IntelligenceEvent(StrictModel):
    id: UUID=Field(default_factory=uuid4)
    event_type: str
    canonical_key: str
    status: EventStatus=EventStatus.OPEN
    object_ids: list[str]=Field(default_factory=list)
    mission_id: str|None=None
    first_seen_at: datetime
    updated_at: datetime
    current_revision_id: UUID|None=None
    validation_state: ValidationState=ValidationState.UNVALIDATED
    tags: list[str]=Field(default_factory=list)

class EventRevision(StrictModel):
    id: UUID=Field(default_factory=uuid4)
    event_id: UUID
    revision_no: int=Field(ge=1)
    created_at: datetime
    cause_signal_ids: list[UUID]=Field(default_factory=list)
    evidence_ids: list[UUID]=Field(default_factory=list)
    delta: dict[str,Any]=Field(default_factory=dict)
    snapshot_hash: str
    reason_codes: list[str]=Field(default_factory=list)

class ConfidenceFactor(StrictModel):
    name: str; value: float=Field(ge=0,le=1); weight: float=Field(ge=0); reason: str
class ConfidenceAssessment(StrictModel):
    id: UUID=Field(default_factory=uuid4)
    target_type: Literal['SIGNAL','EVENT','REVISION','SCENARIO','ATTRIBUTION']
    target_id: str
    score: float|None=Field(default=None,ge=0,le=1)
    grade: ConfidenceGrade
    factors: list[ConfidenceFactor]=Field(default_factory=list)
    computed_at: datetime
    policy_version: str='0.1'
    limitations: list[str]=Field(default_factory=list)

class UncertaintyAssessment(StrictModel):
    id: UUID=Field(default_factory=uuid4)
    target_type: Literal['SIGNAL','EVENT','REVISION','SCENARIO','ATTRIBUTION']
    target_id: str
    representation: Literal['NONE','INTERVAL','COVARIANCE','DISTRIBUTION','PERCENTILES','QUALITATIVE','UNAVAILABLE']
    lower: float|None=None; upper: float|None=None; units: str|None=None
    payload: dict[str,Any]=Field(default_factory=dict)
    computed_at: datetime
    policy_version: str='0.1'
    limitations: list[str]=Field(default_factory=list)

class IntelligencePacket(StrictModel):
    packet_id: UUID=Field(default_factory=uuid4)
    generated_at: datetime
    event: IntelligenceEvent
    revision: EventRevision
    what_happened: list[str]
    what_changed: list[str]
    why_it_matters: list[str]
    evidence: list[EvidenceRecord]
    confidence: ConfidenceAssessment
    uncertainty: UncertaintyAssessment
    scenario_results: list[dict[str,Any]]=Field(default_factory=list)
    decision_comparisons: list[dict[str,Any]]=Field(default_factory=list)
    known_limitations: list[str]=Field(default_factory=list)
    allowed_claims: list[str]=Field(default_factory=list)
    prohibited_claims: list[str]=Field(default_factory=list)

def canonical_hash(payload: Any)->str:
    import json
    return sha256(json.dumps(payload, sort_keys=True, separators=(',',':'), default=str).encode()).hexdigest()
