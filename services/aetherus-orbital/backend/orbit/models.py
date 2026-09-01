"""Typed values exchanged across the orbit propagation boundary."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

MODEL_ID = "sgp4-vallado"
STATE_FRAME = "TEME"
OUTPUT_TIME_SYSTEM = "UTC"


@dataclass(frozen=True)
class MeanElements:
    """Canonical OMM mean elements exactly as normalized by P1 ingestion."""

    catalog_id: str
    epoch: datetime
    frame: str
    time_system: str
    theory: str
    mean_elements: dict[str, float | int | None]

    def bstar(self) -> float:
        """Return the drag term, or 0.0 with an explicit limitation recorded elsewhere."""
        value = self.mean_elements.get("bstar")
        return float(value) if value is not None else 0.0

    def bstar_is_absent(self) -> bool:
        """Report whether the source omitted BSTAR so limitations stay truthful."""
        return self.mean_elements.get("bstar") is None


@dataclass(frozen=True)
class LoadedOrbitSolution:
    """One stored GP solution joined with the provenance needed for propagation."""

    elements: MeanElements
    object_id: str
    orbit_solution_id: str
    source_id: str | None
    content_sha256: str | None
    retrieved_at: datetime | None
    quality_grade: str | None
    limitations: tuple[str, ...]


@dataclass(frozen=True)
class OrbitSample:
    """One finite propagated state in TEME plus its geodetic projection."""

    sample_time: datetime
    frame: str
    r_teme_km: tuple[float, float, float]
    v_teme_km_s: tuple[float, float, float]
    lat_deg: float
    lon_deg: float
    alt_km: float

    def to_payload(self) -> dict[str, Any]:
        """Render one sample per the Master Spec ephemeris output shape."""
        return {
            "sample_time": self.sample_time.isoformat(),
            "state": {
                "frame": self.frame,
                "r_km": list(self.r_teme_km),
                "v_km_s": list(self.v_teme_km_s),
            },
            "geodetic": {
                "lat_deg": self.lat_deg,
                "lon_deg": self.lon_deg,
                "alt_km": self.alt_km,
            },
        }


@dataclass(frozen=True)
class PropagationProvenance:
    """The provenance envelope required on every derived scientific result."""

    object_id: str
    catalog_id: str | None
    orbit_solution_id: str
    source_ids: list[str]
    source_snapshot_at: datetime | None
    retrieved_at: datetime | None
    input_artifact_hashes: list[str]
    model_version: str
    config_hash: str
    quality_grade: str | None
    data_age_seconds: float
    stale: bool
    limitations: list[str]

    def to_payload(self) -> dict[str, Any]:
        """Render the DATA_CONTRACTS provenance envelope plus P2 specifics."""
        return {
            "object_id": self.object_id,
            "catalog_id": self.catalog_id,
            "orbit_solution_id": self.orbit_solution_id,
            "source_ids": self.source_ids,
            "source_snapshot_at": self.source_snapshot_at.isoformat()
            if self.source_snapshot_at is not None
            else None,
            "retrieved_at": self.retrieved_at.isoformat()
            if self.retrieved_at is not None
            else None,
            "input_artifact_hashes": self.input_artifact_hashes,
            "model_id": MODEL_ID,
            "model_version": self.model_version,
            "config_hash": self.config_hash,
            "quality_grade": self.quality_grade,
            "frame": STATE_FRAME,
            "time_system": OUTPUT_TIME_SYSTEM,
            "orbit_solution_epoch": self.source_snapshot_at.isoformat()
            if self.source_snapshot_at is not None
            else None,
            "data_age_s": self.data_age_seconds,
            "stale": self.stale,
            "limitations": self.limitations,
        }
