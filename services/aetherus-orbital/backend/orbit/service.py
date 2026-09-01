"""Ephemeris orchestration: stored solution in, provenance-first ephemeris out."""

import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any

from backend.config import settings
from backend.orbit.errors import EphemerisValidationError
from backend.orbit.frames import FrameAssumptions
from backend.orbit.models import PropagationProvenance
from backend.orbit.propagator import Sgp4Propagator, build_config_hash, samples_output_hash
from backend.orbit.repository import OrbitRepository
from backend.orbit.time_scale import require_utc_datetime


class EphemerisService:
    """Serve API-derived propagated states with explicit data-age and error states."""

    def __init__(self, repository: OrbitRepository | None = None) -> None:
        self.repository = repository or OrbitRepository()

    async def ephemeris(
        self,
        object_lookup: str,
        start_raw: str,
        stop_raw: str,
        step_seconds_raw: int | None,
    ) -> dict[str, Any]:
        """Propagate the latest stored solution over one validated UTC window."""
        start = require_utc_datetime(start_raw, "start")
        stop = require_utc_datetime(stop_raw, "stop")
        if stop <= start:
            raise EphemerisValidationError(
                "Ephemeris stop must be later than start",
                {"start": start.isoformat(), "stop": stop.isoformat()},
            )
        step_seconds = (
            step_seconds_raw
            if step_seconds_raw is not None
            else settings.ephemeris_default_step_seconds
        )
        if isinstance(step_seconds, bool) or not isinstance(step_seconds, int):
            raise EphemerisValidationError("step_s must be an integer number of seconds")
        duration_seconds = (stop - start).total_seconds()
        sample_count = int(duration_seconds // step_seconds) + 1
        maximum_samples = settings.ephemeris_max_samples
        if sample_count > maximum_samples:
            raise EphemerisValidationError(
                "Requested ephemeris exceeds the configured sample cap",
                {"samples": sample_count, "maximum_samples": maximum_samples},
            )

        loaded = await self.repository.latest_solution(object_lookup)
        if loaded is None:
            from backend.ingestion.errors import UnknownObjectError

            raise UnknownObjectError(
                "No canonical object with a stored orbit solution matches the identifier"
            )
        if loaded.elements.time_system.upper() != "UTC":
            raise EphemerisValidationError(
                "Only UTC-time-system OMM solutions are supported for GP propagation",
                {"time_system": loaded.elements.time_system},
            )

        assumptions = FrameAssumptions(
            ut1_utc_offset_seconds=settings.ut1_utc_offset_seconds
        )
        propagator = Sgp4Propagator(loaded.elements, assumptions)

        generated_at = datetime.now(UTC)
        samples = propagator.propagate_grid(start, stop, step_seconds, maximum_samples)
        output_hash = samples_output_hash(samples)

        limitations = list(loaded.limitations)
        if loaded.elements.bstar_is_absent():
            limitations.append("OMM omitted BSTAR; SGP4 drag term initialized to 0.0.")
        limitations.append(
            "UT1-UTC approximated as 0.0 s and polar motion neglected; "
            "TEME->ITRF uses IAU-1982 GMST only."
        )
        limitations.append("PUBLIC_GP mean elements are not an operational ephemeris.")

        now = datetime.now(UTC)
        data_age_seconds = max((now - loaded.elements.epoch).total_seconds(), 0.0)
        stale = (
            data_age_seconds > settings.default_data_age_warning_hours * 3600.0
        )
        provenance = PropagationProvenance(
            object_id=loaded.object_id,
            catalog_id=loaded.elements.catalog_id,
            orbit_solution_id=loaded.orbit_solution_id,
            source_ids=[loaded.source_id] if loaded.source_id else [],
            source_snapshot_at=loaded.elements.epoch,
            retrieved_at=loaded.retrieved_at,
            input_artifact_hashes=[f"sha256:{loaded.content_sha256}"]
            if loaded.content_sha256
            else [],
            model_version=propagator.model_version,
            config_hash=build_config_hash(assumptions),
            quality_grade=loaded.quality_grade,
            data_age_seconds=data_age_seconds,
            stale=stale,
            limitations=limitations,
        )

        input_hash = _request_input_hash(
            loaded.orbit_solution_id,
            start,
            stop,
            step_seconds,
            propagator.model_version,
            provenance.config_hash,
        )
        persisted_count = await self.repository.persist_propagation_samples(
            loaded.object_id,
            loaded.orbit_solution_id,
            [
                {
                    "sample_time": sample.sample_time,
                    "x_km": sample.r_teme_km[0],
                    "y_km": sample.r_teme_km[1],
                    "z_km": sample.r_teme_km[2],
                    "vx_kms": sample.v_teme_km_s[0],
                    "vy_kms": sample.v_teme_km_s[1],
                    "vz_kms": sample.v_teme_km_s[2],
                    "lat_deg": sample.lat_deg,
                    "lon_deg": sample.lon_deg,
                    "alt_km": sample.alt_km,
                }
                for sample in samples
            ],
            propagator.model_version,
            input_hash,
            start,
            stop,
        )

        warnings: list[str] = []
        if stale:
            warnings.append(
                "Stored GP elements exceed the configured data-age threshold; "
                "positions reflect the epoch-aware propagation of old elements."
            )
        for limitation in limitations:
            warnings.append(limitation)

        return {
            "request_id": str(uuid.uuid4()),
            "generated_at": generated_at.isoformat(),
            "data_status": "STALE" if stale else "OK",
            "data": {
                "object_id": loaded.object_id,
                "catalog_id": loaded.elements.catalog_id,
                "sample_count": len(samples),
                "window": {
                    "start": start.isoformat(),
                    "stop": stop.isoformat(),
                    "step_s": step_seconds,
                },
                "output_sha256": output_hash,
                "samples": [sample.to_payload() for sample in samples],
            },
            "provenance": provenance.to_payload(),
            "warnings": warnings,
            "persistence": {
                "propagation_snapshot_rows_stored": persisted_count,
                "input_hash": input_hash,
            },
        }


def _request_input_hash(
    orbit_solution_id: str,
    start: datetime,
    stop: datetime,
    step_seconds: int,
    model_version: str,
    config_hash: str,
) -> str:
    """Hash the full deterministic propagation request identity."""
    payload = {
        "config_hash": config_hash,
        "model_version": model_version,
        "orbit_solution_id": orbit_solution_id,
        "start": start.isoformat(),
        "step_s": step_seconds,
        "stop": stop.isoformat(),
    }
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()
