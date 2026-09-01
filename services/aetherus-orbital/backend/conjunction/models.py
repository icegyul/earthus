"""Typed values exchanged across the conjunction-assessment boundary."""

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

COARSE_MODEL_ID = "aetherus-ca-screening"
COARSE_MODEL_VERSION = "p4-conservative-v1"
PC_MODEL_ID = "foster-1992-pc"
PC_MODEL_VERSION = "p4-encounter-plane-v2"
PC_METHOD = "FOSTER-1992"

METRIC_TYPES = ("PC", "MAX_PC", "MISS_DISTANCE")
SNAPSHOT_VALIDATION_STATE = "PUBLIC_SCREENING"


@dataclass(frozen=True)
class ScreeningConfig:
    """Versioned, hashable coarse-screening configuration.

    Every threshold is explicit configuration; nothing is tuned silently.
    """

    window_hours: float = 24.0
    coarse_step_seconds: int = 30
    screening_threshold_m: float = 25_000.0
    shell_margin_km: float = 50.0
    safety_factor: float = 2.0
    max_objects: int = 2000
    hbr_m: float = 5.0
    refine_step_seconds: int = 5

    def to_payload(self) -> dict[str, Any]:
        return {
            "window_hours": self.window_hours,
            "coarse_step_seconds": self.coarse_step_seconds,
            "screening_threshold_m": self.screening_threshold_m,
            "shell_margin_km": self.shell_margin_km,
            "safety_factor": self.safety_factor,
            "max_objects": self.max_objects,
            "hbr_m": self.hbr_m,
            "refine_step_seconds": self.refine_step_seconds,
        }


def build_config_hash(config: ScreeningConfig) -> str:
    """Hash the full deterministic screening configuration identity."""
    serialized = json.dumps(
        {
            **config.to_payload(),
            "model_id": COARSE_MODEL_ID,
            "model_version": COARSE_MODEL_VERSION,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class LoadedScreenableSolution:
    """One stored P1/P2 solution plus the provenance needed for CA provenance."""

    object_id: str
    catalog_id: str
    elements: Any  # backend.orbit.models.MeanElements; kept loose to avoid a cycle
    orbit_solution_id: str
    source_id: str | None
    content_sha256: str | None
    retrieved_at: datetime | None
    quality_grade: str | None


@dataclass(frozen=True)
class CandidatePair:
    """A pair that survived conservative coarse screening."""

    index_a: int
    index_b: int
    min_aligned_distance_m: float
    sample_count_used: int


@dataclass(frozen=True)
class TcaResult:
    """Refined TCA output; boundary flags mark window-edge minima."""

    tca_utc: datetime
    miss_distance_m: float
    relative_velocity_mps: tuple[float, float, float]
    relative_speed_mps: float
    boundary_flag: bool
    refined_brackets: int


@dataclass(frozen=True)
class ConjunctionMetricChannels:
    """Metric channels are separate by contract (DATA_CONTRACTS.md).

    ``pc`` stays ``None`` unless a valid covariance was actually processed;
    ``pc_status``/``pc_unavailable_reason`` carry the explicit state instead.
    """

    miss_distance_m: float
    relative_speed_mps: float
    pc: float | None
    pc_method: str | None
    pc_status: str
    pc_unavailable_reason: str | None
    covariance_status: str
    dilution_state: str | None
    max_pc: float | None = None
    max_pc_method: str | None = None


@dataclass(frozen=True)
class ScreeningProvenance:
    """Per-snapshot provenance preserved with every stored conjunction result."""

    screening_run_id: str
    source_ids: list[str]
    source_snapshot_at: datetime | None
    secondary_source_snapshot_at: datetime | None
    retrieved_at: datetime | None
    input_artifact_hashes: list[str]
    model_id: str
    model_version: str
    config_hash: str
    input_hash: str
    source_age_seconds_max: float | None
    validation_dataset_id: str | None
    validation_dataset_version: str | None

    def to_payload(self) -> dict[str, Any]:
        return {
            "screening_run_id": self.screening_run_id,
            "source_ids": list(self.source_ids),
            "source_snapshot_at": self.source_snapshot_at.isoformat()
            if self.source_snapshot_at is not None
            else None,
            "secondary_source_snapshot_at": self.secondary_source_snapshot_at.isoformat()
            if self.secondary_source_snapshot_at is not None
            else None,
            "retrieved_at": self.retrieved_at.isoformat()
            if self.retrieved_at is not None
            else None,
            "input_artifact_hashes": list(self.input_artifact_hashes),
            "model_id": self.model_id,
            "model_version": self.model_version,
            "config_hash": self.config_hash,
            "input_hash": self.input_hash,
            "source_age_s_max": self.source_age_seconds_max,
            "validation_dataset_id": self.validation_dataset_id,
            "validation_dataset_version": self.validation_dataset_version,
        }


@dataclass(frozen=True)
class PcOutcome:
    """Result of the covariance-gated collision-probability plugin."""

    pc: float | None
    method: str | None
    status: str
    unavailable_reason: str | None
    covariance_status: str
    dilution_state: str | None
    checks: dict[str, Any] = field(default_factory=dict)
