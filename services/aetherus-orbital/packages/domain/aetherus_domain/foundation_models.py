from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .models import EvidenceClass, EvidenceRecord, SourceGrade, ValidationState, canonical_hash


class StrictFoundationModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DataStatus(StrEnum):
    OK = "OK"
    STALE = "STALE"
    PARTIAL = "PARTIAL"
    UNAVAILABLE = "UNAVAILABLE"


class IngestionStatus(StrEnum):
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    PARTIAL = "PARTIAL"


class StateKind(StrEnum):
    ARCHIVED_STATE = "ARCHIVED_STATE"
    RECONSTRUCTED_STATE = "RECONSTRUCTED_STATE"
    NOW = "NOW"
    PREDICTED_MODEL = "PREDICTED_MODEL"
    SIMULATION = "SIMULATION"
    COUNTERFACTUAL = "COUNTERFACTUAL"


class DigitalStateKind(StrEnum):
    REALITY = "REALITY"
    ARCHIVED = "ARCHIVED"
    RECONSTRUCTED = "RECONSTRUCTED"
    MODELLED = "MODELLED"
    SIMULATION = "SIMULATION"
    COUNTERFACTUAL = "COUNTERFACTUAL"


class DataSourcePolicy(StrictFoundationModel):
    id: str
    name: str
    source_grade: SourceGrade
    license_policy: str | None = None
    access_policy: str | None = None
    stale_after_seconds: int = Field(default=3600, ge=1)
    enabled: bool = True


class IngestionRun(StrictFoundationModel):
    id: UUID = Field(default_factory=uuid4)
    source_id: str
    started_at: datetime
    finished_at: datetime | None = None
    status: IngestionStatus = IngestionStatus.RUNNING
    request_fingerprint: str | None = None
    record_count: int = Field(default=0, ge=0)
    error: dict[str, Any] | None = None

    @field_validator("started_at", "finished_at")
    @classmethod
    def aware(cls, v: datetime | None) -> datetime | None:
        if v is None:
            return None
        if v.tzinfo is None:
            raise ValueError("naive datetime forbidden")
        return v.astimezone(timezone.utc)


class RawArtifact(StrictFoundationModel):
    id: UUID = Field(default_factory=uuid4)
    source_id: str
    ingestion_run_id: UUID | None = None
    retrieved_at: datetime
    observed_at: datetime | None = None
    source_uri: str | None = None
    media_type: str = "application/octet-stream"
    content_sha256: str
    object_uri: str
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("retrieved_at", "observed_at")
    @classmethod
    def aware(cls, v: datetime | None) -> datetime | None:
        if v is None:
            return None
        if v.tzinfo is None:
            raise ValueError("naive datetime forbidden")
        return v.astimezone(timezone.utc)

    @field_validator("content_sha256")
    @classmethod
    def sha(cls, v: str) -> str:
        value = v.lower()
        if len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
            raise ValueError("sha256 hex required")
        return value


class QuarantinedRecord(StrictFoundationModel):
    id: UUID = Field(default_factory=uuid4)
    source_id: str
    raw_artifact_id: UUID
    record_index: int = Field(ge=0)
    reason: str
    payload_hash: str
    created_at: datetime


class ObjectAlias(StrictFoundationModel):
    source_id: str
    source_key: str
    source_name: str | None = None


class CanonicalObject(StrictFoundationModel):
    id: UUID = Field(default_factory=uuid4)
    entity_type: str
    canonical_name: str | None = None
    catalog_id: str | None = None
    cospar_id: str | None = None
    origin: str | None = None
    aliases: list[ObjectAlias] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime

    @field_validator("created_at", "updated_at")
    @classmethod
    def aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("naive datetime forbidden")
        return v.astimezone(timezone.utc)

    @field_validator("catalog_id")
    @classmethod
    def catalog_is_string(cls, v: str | None) -> str | None:
        if v is None:
            return None
        value = str(v).strip()
        if not value:
            raise ValueError("empty catalog_id forbidden")
        return value


class IdentityConflict(StrictFoundationModel):
    id: UUID = Field(default_factory=uuid4)
    source_id: str
    source_key: str
    conflict_type: str
    existing_object_id: UUID | None = None
    existing_value: str | None = None
    incoming_value: str | None = None
    quarantined: bool = True
    created_at: datetime


class ProvenanceLink(StrictFoundationModel):
    parent_type: str
    parent_id: str
    relation: str
    parent_hash: str | None = None


class ProvenanceBundle(StrictFoundationModel):
    id: UUID = Field(default_factory=uuid4)
    evidence: EvidenceRecord
    links: list[ProvenanceLink] = Field(default_factory=list)
    engine_id: str | None = None
    engine_version: str | None = None
    model_version: str | None = None
    config_version: str | None = None
    provenance_hash: str
    created_at: datetime


class CanonicalTimeContext(StrictFoundationModel):
    mode: StateKind
    cursor_utc: datetime
    resolved_from_timezone: str | None = None
    source_time_scale: str = "UTC"
    archived_snapshot_id: str | None = None
    reconstructed_from_snapshot_ids: list[str] = Field(default_factory=list)
    model_id: str | None = None

    @field_validator("cursor_utc")
    @classmethod
    def aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("naive datetime forbidden")
        return v.astimezone(timezone.utc)

    @model_validator(mode="after")
    def separation_rules(self):
        if self.mode == StateKind.ARCHIVED_STATE and not self.archived_snapshot_id:
            raise ValueError("archived state requires archived_snapshot_id")
        if self.mode == StateKind.RECONSTRUCTED_STATE and not self.reconstructed_from_snapshot_ids:
            raise ValueError("reconstructed state requires source snapshot ids")
        if self.mode == StateKind.PREDICTED_MODEL and not self.model_id:
            raise ValueError("predicted model requires model_id")
        return self


class TimelineCursor(StrictFoundationModel):
    cursor_id: str
    context: CanonicalTimeContext


class TimeWindow(StrictFoundationModel):
    start_utc: datetime
    end_utc: datetime

    @field_validator("start_utc", "end_utc")
    @classmethod
    def aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("naive datetime forbidden")
        return v.astimezone(timezone.utc)

    @model_validator(mode="after")
    def order(self):
        if self.end_utc < self.start_utc:
            raise ValueError("end before start")
        return self


class StateVector(StrictFoundationModel):
    position_km: tuple[float, float, float]
    velocity_km_s: tuple[float, float, float] = (0.0, 0.0, 0.0)
    frame: str
    epoch_utc: datetime

    @field_validator("epoch_utc")
    @classmethod
    def aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("naive datetime forbidden")
        return v.astimezone(timezone.utc)


class FrameProvenance(StrictFoundationModel):
    from_frame: str
    to_frame: str
    method: str
    validation_state: ValidationState
    eop_age_seconds: float | None = None
    limitations: list[str] = Field(default_factory=list)


class TransformedState(StrictFoundationModel):
    state: StateVector
    provenance: FrameProvenance


class DigitalState(StrictFoundationModel):
    id: UUID = Field(default_factory=uuid4)
    entity_id: str
    state_time: datetime
    state_kind: DigitalStateKind
    representation: str
    frame: str | None = None
    time_system: str = "UTC"
    source_evidence_ids: list[UUID] = Field(default_factory=list)
    state_hash: str
    payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("state_time")
    @classmethod
    def aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("naive datetime forbidden")
        return v.astimezone(timezone.utc)


class SnapshotManifest(StrictFoundationModel):
    id: UUID = Field(default_factory=uuid4)
    snapshot_hash: str
    state_ids: list[UUID]
    time_context: CanonicalTimeContext
    evidence_ids: list[UUID] = Field(default_factory=list)
    created_at: datetime
    baseline: bool = False


class VersionLineage(StrictFoundationModel):
    snapshot_id: UUID
    parent_snapshot_id: UUID | None = None
    revision_reason: str | None = None


class TypedRelation(StrictFoundationModel):
    id: UUID = Field(default_factory=uuid4)
    subject_id: str
    relation_type: str
    object_id: str
    provenance_evidence_id: UUID
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    uncertainty_reason: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("valid_from", "valid_to")
    @classmethod
    def aware(cls, v: datetime | None) -> datetime | None:
        if v is None:
            return None
        if v.tzinfo is None:
            raise ValueError("naive datetime forbidden")
        return v.astimezone(timezone.utc)

    @model_validator(mode="after")
    def valid_range(self):
        if self.valid_from and self.valid_to and self.valid_to < self.valid_from:
            raise ValueError("invalid relation time range")
        if self.relation_type == "UNKNOWN" and not self.uncertainty_reason:
            raise ValueError("UNKNOWN relation requires uncertainty_reason")
        return self


class ArchiveIndex(StrictFoundationModel):
    object_id: str
    relation_ids: list[UUID] = Field(default_factory=list)
    snapshot_ids: list[UUID] = Field(default_factory=list)
    indexed_at: datetime


def digital_state_hash(*, entity_id: str, state_time: datetime, state_kind: DigitalStateKind, representation: str, frame: str | None, payload: dict[str, Any], source_evidence_ids: list[UUID]) -> str:
    return canonical_hash({
        "entity_id": str(entity_id),
        "state_time": state_time.astimezone(timezone.utc).isoformat(),
        "state_kind": state_kind.value,
        "representation": representation,
        "frame": frame,
        "payload": payload,
        "source_evidence_ids": sorted(str(v) for v in source_evidence_ids),
    })
