"""Typed values exchanged across the ingestion boundary."""

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from backend.ingestion.providers.base import FetchedOmmDocument

__all__ = [
    "FetchedOmmDocument",
    "CanonicalObject",
    "PersistedGroupIngestion",
    "PersistedGroupMember",
    "IdentityResolution",
    "OmmRecordCandidate",
    "ParsedOmmRecord",
    "PersistedIngestion",
    "RawArtifactLink",
    "ReprocessableRawArtifact",
    "StoredRawArtifact",
]


@dataclass(frozen=True)
class ParsedOmmRecord:
    """Canonical fields normalized from one OMM-compatible provider record."""

    catalog_id: str
    object_name: str | None
    international_designator: str | None
    object_type: str
    epoch: datetime
    frame: str
    time_system: str
    theory: str
    mean_elements: dict[str, float | int | None]
    covariance: None
    quality_grade: str
    limitations: tuple[str, ...]


@dataclass(frozen=True)
class CanonicalObject:
    """The limited identity fields P1 may match without inferring ownership."""

    id: str
    catalog_id: str | None
    cospar_id: str | None
    canonical_name: str | None
    object_type: str


@dataclass(frozen=True)
class IdentityResolution:
    """A conservative object decision with no automatic merge operation."""

    status: Literal["CREATED", "MATCHED", "IDENTITY_CONFLICT", "UNKNOWN_OBJECT"]
    object_id: str | None = None
    conflict_id: str | None = None


@dataclass(frozen=True)
class OmmRecordCandidate:
    """One source document row with either a parsed record or a rejection error."""

    index: int
    fragment: bytes
    record: ParsedOmmRecord | None
    error: Exception | None


@dataclass(frozen=True)
class StoredRawArtifact:
    """Location and content identity for one immutable raw snapshot."""

    content_sha256: str
    path: Path
    object_uri: str
    created: bool


@dataclass(frozen=True)
class RawArtifactLink:
    """One ingestion run's explicit relationship to an immutable raw artifact."""

    raw_artifact_id: str
    relation: str


@dataclass(frozen=True)
class ReprocessableRawArtifact:
    """Verified metadata needed to replay an unparsed immutable snapshot without fetching."""

    id: str
    source_id: str
    source_uri: str
    retrieved_at: datetime
    media_type: str
    content_sha256: str
    http_status: int


@dataclass(frozen=True)
class PersistedGroupMember:
    """One accepted record inside a group ingestion."""

    catalog_id: str
    object_id: str
    orbit_solution_id: str
    canonical_name: str | None
    identity_status: Literal["CREATED", "MATCHED"]


@dataclass(frozen=True)
class PersistedGroupIngestion:
    """One immutable GROUP snapshot expanded into many canonical records.

    A debris family is one provider response, so the whole cohort shares a
    single raw artifact (and therefore a single SHA-256 provenance root).
    """

    ingestion_run_id: str
    raw_artifact_id: str
    group: str
    source_uri: str
    retrieved_at: datetime
    raw_artifact: StoredRawArtifact
    members: tuple[PersistedGroupMember, ...]
    source_id: str = "celestrak_gp"
    status: Literal["SUCCEEDED", "PARTIAL"] = "SUCCEEDED"
    rejected_record_count: int = 0
    rejection_reasons: dict[str, int] = field(default_factory=dict)

    def to_api_payload(self) -> dict[str, Any]:
        """Render group provenance without inventing anything about rejected rows."""
        return {
            "status": self.status,
            "ingestion_run_id": self.ingestion_run_id,
            "group": self.group,
            "record_count": len(self.members),
            "rejected_record_count": self.rejected_record_count,
            "rejection_reasons": self.rejection_reasons,
            "created_object_count": sum(
                1 for member in self.members if member.identity_status == "CREATED"
            ),
            "objects": [
                {
                    "catalog_id": member.catalog_id,
                    "object_id": member.object_id,
                    "canonical_name": member.canonical_name,
                    "identity_status": member.identity_status,
                    "orbit_solution_id": member.orbit_solution_id,
                }
                for member in self.members
            ],
            "provenance": {
                "source_ids": [self.source_id],
                "source_uri": self.source_uri,
                "retrieved_at": self.retrieved_at.isoformat(),
                "input_artifact_hashes": [f"sha256:{self.raw_artifact.content_sha256}"],
                "source_artifact_uri": self.raw_artifact.object_uri,
                "quality_grade": "PUBLIC_GP",
                "limitations": [
                    "PUBLIC_GP source; these records are not an operational "
                    "conjunction assessment.",
                    "No covariance is supplied by GP/OMM, so Pc stays NOT_COMPUTED.",
                    "One immutable provider response backs every record in this group.",
                ],
            },
        }


@dataclass(frozen=True)
class PersistedIngestion:
    """Identifiers generated only after an ingestion transaction succeeds."""

    ingestion_run_id: str
    raw_artifact_id: str
    object_id: str
    orbit_solution_id: str
    record_count: int
    source_uri: str
    retrieved_at: datetime
    raw_artifact: StoredRawArtifact
    record: ParsedOmmRecord
    source_id: str = "celestrak_gp"
    status: Literal["SUCCEEDED", "PARTIAL"] = "SUCCEEDED"
    cache_status: Literal["MISS", "HIT", "STALE", "REPROCESSED"] = "MISS"
    identity_status: Literal["CREATED", "MATCHED"] = "MATCHED"
    rejected_record_count: int = 0

    def to_api_payload(self) -> dict[str, Any]:
        """Render a provenance-first ingestion response without scientific extrapolation."""
        return {
            "status": self.status,
            "ingestion_run_id": self.ingestion_run_id,
            "record_count": self.record_count,
            "rejected_record_count": self.rejected_record_count,
            "cache_status": self.cache_status,
            "identity_status": self.identity_status,
            "object": {
                "id": self.object_id,
                "catalog_id": self.record.catalog_id,
                "canonical_name": self.record.object_name,
                "object_type": self.record.object_type,
            },
            "orbit_solution": {
                "id": self.orbit_solution_id,
                "epoch": self.record.epoch.isoformat(),
                "format": "OMM",
                "frame": self.record.frame,
                "time_system": self.record.time_system,
                "theory": self.record.theory,
                "covariance_status": "INSUFFICIENT_DATA",
                "pc_status": "NOT_COMPUTED",
            },
            "provenance": {
                "source_ids": [self.source_id],
                "source_snapshot_at": self.record.epoch.isoformat(),
                "retrieved_at": self.retrieved_at.isoformat(),
                "input_artifact_hashes": [f"sha256:{self.raw_artifact.content_sha256}"],
                "quality_grade": self.record.quality_grade,
                "source_artifact_uri": self.raw_artifact.object_uri,
                "limitations": list(self.record.limitations),
            },
        }
