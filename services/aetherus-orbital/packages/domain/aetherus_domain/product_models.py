from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .models import EvidenceClass


class StrictProductModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Scenario(StrictProductModel):
    id: UUID = Field(default_factory=uuid4)
    kind: str
    baseline_snapshot_id: UUID
    target_object_ids: list[str]
    protected_object_ids: list[str] = Field(default_factory=list)
    effective_time: datetime | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)
    assumptions: list[str] = Field(default_factory=list)
    model_version: str
    config_version: str | None = None
    seed: int | None = None
    status: str = "PENDING"
    evidence_class: EvidenceClass = EvidenceClass.SIMULATION_ONLY

    @field_validator("effective_time")
    @classmethod
    def aware(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime forbidden")
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def simulation_only(self):
        if self.evidence_class not in {EvidenceClass.SIMULATION_ONLY, EvidenceClass.COUNTERFACTUAL}:
            raise ValueError("scenario must remain simulation/counterfactual evidence")
        return self


class AttributionResult(StrictProductModel):
    id: UUID = Field(default_factory=uuid4)
    scenario_id: UUID
    metric_type: str
    subject_object_id: str
    baseline_value: float
    scenario_value: float
    delta: float
    units: str | None = None
    confidence_assessment_id: UUID | None = None
    uncertainty_assessment_id: UUID | None = None
    provenance_evidence_ids: list[UUID]
    evidence_class: EvidenceClass = EvidenceClass.ATTRIBUTION_RESULT

    @model_validator(mode="after")
    def check_delta(self):
        expected = self.scenario_value - self.baseline_value
        if abs(expected - self.delta) > 1e-12:
            raise ValueError("delta must equal scenario_value - baseline_value")
        if not self.provenance_evidence_ids:
            raise ValueError("attribution requires provenance")
        if self.evidence_class != EvidenceClass.ATTRIBUTION_RESULT:
            raise ValueError("attribution evidence class is fixed")
        return self


class DecisionComparison(StrictProductModel):
    id: UUID = Field(default_factory=uuid4)
    baseline_scenario_id: UUID
    option_scenario_ids: list[UUID]
    criteria: list[str]
    ranked_options: list[dict[str, Any]] = Field(default_factory=list)
    generated_at: datetime
    advisory_only: bool = True
    limitations: list[str] = Field(default_factory=list)

    @field_validator("generated_at")
    @classmethod
    def aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("naive datetime forbidden")
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def enforce_advisory(self):
        if not self.advisory_only:
            raise ValueError("decision comparison must be advisory only")
        return self


class ApiEnvelope(StrictProductModel):
    request_id: str
    generated_at: datetime
    data_status: Literal["OK", "STALE", "PARTIAL", "UNAVAILABLE", "INSUFFICIENT_DATA", "SCREENING_ONLY", "VALIDATION_PENDING", "RESEARCH_ONLY"]
    data: Any
    provenance: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
