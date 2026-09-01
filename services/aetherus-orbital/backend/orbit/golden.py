"""Golden fixture build/load/compare logic shared by the generator and the tests."""

import hashlib
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from backend.ingestion.omm import parse_omm_document
from backend.orbit.frames import FrameAssumptions
from backend.orbit.models import MeanElements
from backend.orbit.propagator import Sgp4Propagator, samples_output_hash

GOLDEN_OFFSET_SECONDS = (-3600, -1800, -600, 0, 600, 1800, 3600)
GOLDEN_TOLERANCE = {
    "position_km": 1e-6,
    "velocity_km_s": 1e-9,
    "lat_deg": 1e-8,
    "lon_deg": 1e-8,
    "alt_km": 1e-6,
}


def fixture_id_for(raw_content: bytes) -> str:
    """Derive the stable fixture identifier from the raw snapshot content hash."""
    content_sha256 = hashlib.sha256(raw_content).hexdigest()
    record = parse_omm_document(raw_content)[0]
    epoch_stamp = record.epoch.strftime("%Y%m%dT%H%M%S")
    return f"p2_golden_{record.catalog_id}_{epoch_stamp}_{content_sha256[:12]}"


def build_fixture(raw_content: bytes, source_uri: str, source_id: str) -> dict[str, Any]:
    """Build one golden fixture document from real P1 raw snapshot bytes."""
    from backend.orbit.propagator import installed_sgp4_version

    content_sha256 = hashlib.sha256(raw_content).hexdigest()
    record = parse_omm_document(raw_content)[0]
    elements = MeanElements(
        catalog_id=record.catalog_id,
        epoch=record.epoch,
        frame=record.frame,
        time_system=record.time_system,
        theory=record.theory,
        mean_elements=record.mean_elements,
    )
    assumptions = FrameAssumptions(ut1_utc_offset_seconds=0.0)
    propagator = Sgp4Propagator(elements, assumptions)

    samples = []
    for offset in GOLDEN_OFFSET_SECONDS:
        sample_time = record.epoch + timedelta(seconds=offset)
        sample = propagator.propagate(sample_time.astimezone(UTC))
        payload = sample.to_payload()
        payload["offset_s"] = offset
        samples.append(payload)

    return {
        "fixture_id": fixture_id_for(raw_content),
        "generated_from": {
            "source_id": source_id,
            "source_uri": source_uri,
            "raw_artifact_sha256": content_sha256,
        },
        "input": {
            "catalog_id": record.catalog_id,
            "epoch": record.epoch.isoformat(),
            "frame": record.frame,
            "time_system": record.time_system,
            "theory": record.theory,
            "mean_elements": record.mean_elements,
        },
        "model": {
            "model_id": "sgp4-vallado",
            "model_version": installed_sgp4_version(),
            "gravity_model": "WGS72",
            "operation_mode": "i",
            "gmst_model": "IAU-1982",
            "ut1_utc_offset_seconds_assumed": 0.0,
            "polar_motion_applied": False,
        },
        "tolerance": GOLDEN_TOLERANCE,
        "output_sha256": samples_output_hash(propagator_output_samples(samples)),
        "samples": samples,
    }


def propagator_output_samples(samples: list[dict[str, Any]]):
    """Rebuild hashable OrbitSample values from serialized fixture rows."""
    from backend.orbit.models import OrbitSample

    rebuilt = []
    for row in samples:
        state = row["state"]
        geodetic = row["geodetic"]
        rebuilt.append(
            OrbitSample(
                sample_time=datetime.fromisoformat(row["sample_time"]),
                frame=state["frame"],
                r_teme_km=tuple(state["r_km"]),
                v_teme_km_s=tuple(state["v_km_s"]),
                lat_deg=geodetic["lat_deg"],
                lon_deg=geodetic["lon_deg"],
                alt_km=geodetic["alt_km"],
            )
        )
    return rebuilt


def load_fixture(path: Path) -> dict[str, Any]:
    """Load one committed golden fixture document."""
    parsed = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError(f"Golden fixture {path} must contain a JSON object")
    return parsed


def compare_within_tolerance(
    fixture: dict[str, Any], recomputed_samples: list[dict[str, Any]]
) -> dict[str, float]:
    """Return the maximum observed error between fixture and fresh propagation."""
    tolerance = fixture["tolerance"]
    maxima = {key: 0.0 for key in tolerance}
    expected_by_offset = {row["offset_s"]: row for row in fixture["samples"]}
    for row in recomputed_samples:
        expected = expected_by_offset[row["offset_s"]]
        maxima["position_km"] = max(
            maxima["position_km"],
            max(
                abs(a - e)
                for a, e in zip(row["state"]["r_km"], expected["state"]["r_km"], strict=False)
            ),
        )
        maxima["velocity_km_s"] = max(
            maxima["velocity_km_s"],
            max(
                abs(a - e)
                for a, e in zip(row["state"]["v_km_s"], expected["state"]["v_km_s"], strict=False)
            ),
        )
        maxima["lat_deg"] = max(
            maxima["lat_deg"], abs(row["geodetic"]["lat_deg"] - expected["geodetic"]["lat_deg"])
        )
        maxima["lon_deg"] = max(
            maxima["lon_deg"], abs(row["geodetic"]["lon_deg"] - expected["geodetic"]["lon_deg"])
        )
        maxima["alt_km"] = max(
            maxima["alt_km"], abs(row["geodetic"]["alt_km"] - expected["geodetic"]["alt_km"])
        )
    return maxima


def recompute_fixture_samples(fixture: dict[str, Any]) -> list[dict[str, Any]]:
    """Re-run production propagation from the fixture's stored OMM input only."""
    elements = MeanElements(
        catalog_id=fixture["input"]["catalog_id"],
        epoch=datetime.fromisoformat(fixture["input"]["epoch"]),
        frame=fixture["input"]["frame"],
        time_system=fixture["input"]["time_system"],
        theory=fixture["input"]["theory"],
        mean_elements=fixture["input"]["mean_elements"],
    )
    assumptions = FrameAssumptions(
        ut1_utc_offset_seconds=fixture["model"]["ut1_utc_offset_seconds_assumed"]
    )
    propagator = Sgp4Propagator(elements, assumptions)
    rows = []
    for row in fixture["samples"]:
        sample_time = datetime.fromisoformat(row["sample_time"])
        payload = propagator.propagate(sample_time).to_payload()
        payload["offset_s"] = row["offset_s"]
        rows.append(payload)
    return rows


def propagator_output_hash(recomputed_rows: list[dict[str, Any]]) -> str:
    """Hash freshly recomputed rows exactly like the fixture output hash."""
    return samples_output_hash(propagator_output_samples(recomputed_rows))
