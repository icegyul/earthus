"""Typed catalog read models; every rendered value originates from stored solutions."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

CATALOG_DATA_STATUSES = {"OK", "STALE", "PARTIAL", "UNAVAILABLE", "INSUFFICIENT_DATA"}
OBJECT_POSITION_STATUSES = {
    "OK",
    "STALE",
    "QUARANTINE",
    "PROPAGATION_UNAVAILABLE",
    "NO_SOLUTION",
}
GLOBAL_DENSITY_AVAILABLE = "AVAILABLE"
GLOBAL_DENSITY_INSUFFICIENT = "INSUFFICIENT_DATA"


@dataclass(frozen=True)
class CatalogSolutionRef:
    """Provenance for the latest stored orbit solution behind one catalog entry."""

    orbit_solution_id: str
    source_ids: list[str]
    source_snapshot_at: datetime | None
    retrieved_at: datetime | None
    input_artifact_hashes: list[str]
    quality_grade: str | None
    model_version: str
    config_hash: str
    data_age_seconds: float
    stale: bool
    limitations: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class CatalogEntry:
    """One canonical object exactly as stored, plus its API-derived position."""

    object_id: str
    catalog_id: str
    canonical_name: str | None
    cospar_id: str | None
    object_type: str | None
    origin_code: str | None
    status: str
    position_status: str
    sample_time: str | None
    state: dict[str, Any] | None
    geodetic: dict[str, float] | None
    provenance: CatalogSolutionRef | None
    warnings: list[str] = field(default_factory=list)

    def to_payload(self) -> dict[str, Any]:
        """Render one catalog row; absent positions stay explicitly absent."""
        return {
            "object_id": self.object_id,
            "catalog_id": self.catalog_id,
            "canonical_name": self.canonical_name,
            "cospar_id": self.cospar_id,
            "object_type": self.object_type,
            "origin_code": self.origin_code,
            "status": self.status,
            "position_status": self.position_status,
            "sample_time": self.sample_time,
            "state": self.state,
            "geodetic": self.geodetic,
            "provenance": _ref_payload(self.provenance),
            "warnings": list(self.warnings),
        }


@dataclass(frozen=True)
class CatalogCoverage:
    """Honest catalog coverage; positioned markers count only real geodetic fixes."""

    objects_total: int
    objects_with_solution: int
    catalog_entries: int
    positioned_markers: int
    positioned_ok: int
    positioned_stale: int
    unavailable_entries: int
    unavailable_by_status: dict[str, int]
    global_density: str
    global_density_reason: str
    sources: list[dict[str, Any]]

    def to_payload(self) -> dict[str, Any]:
        """Render coverage metadata for the UI coverage banner."""
        return {
            "objects_total": self.objects_total,
            "objects_with_solution": self.objects_with_solution,
            "catalog_entries": self.catalog_entries,
            "positioned_markers": self.positioned_markers,
            "positioned_ok": self.positioned_ok,
            "positioned_stale": self.positioned_stale,
            "unavailable_entries": self.unavailable_entries,
            "unavailable_by_status": dict(self.unavailable_by_status),
            "global_density": self.global_density,
            "global_density_reason": self.global_density_reason,
            "sources": list(self.sources),
        }


def _ref_payload(reference: CatalogSolutionRef | None) -> dict[str, Any] | None:
    if reference is None:
        return None
    return {
        "orbit_solution_id": reference.orbit_solution_id,
        "source_ids": list(reference.source_ids),
        "source_snapshot_at": reference.source_snapshot_at.isoformat()
        if reference.source_snapshot_at is not None
        else None,
        "retrieved_at": reference.retrieved_at.isoformat()
        if reference.retrieved_at is not None
        else None,
        "input_artifact_hashes": list(reference.input_artifact_hashes),
        "quality_grade": reference.quality_grade,
        "model_id": "sgp4-vallado",
        "model_version": reference.model_version,
        "config_hash": reference.config_hash,
        "frame": "TEME",
        "time_system": "UTC",
        "data_age_s": reference.data_age_seconds,
        "stale": reference.stale,
        "limitations": list(reference.limitations),
    }
