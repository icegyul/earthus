"""Real SGP4 propagation driven directly by OMM mean elements, never TLE strings."""

import hashlib
import json
import math
from collections.abc import Iterable
from datetime import datetime, timedelta
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as package_version

from sgp4.api import WGS72, Satrec

from backend.orbit.errors import PropagationError
from backend.orbit.frames import FrameAssumptions, itrf_to_geodetic, teme_to_itrf
from backend.orbit.models import MeanElements, OrbitSample
from backend.orbit.time_scale import days_since_sgp4_epoch

_OMM_TO_RADIANS = math.pi / 180.0
_NDOT_UNITS = 1036800.0 / math.pi
_NDDOT_UNITS = 2985984000.0 / 2.0 / math.pi


def installed_sgp4_version() -> str:
    """Return the exact trusted-library version recorded with every result."""
    try:
        return package_version("sgp4")
    except PackageNotFoundError as error:
        raise RuntimeError("The sgp4 package is not installed") from error


def build_config_hash(assumptions: FrameAssumptions) -> str:
    """Hash the reproducible scientific configuration of this propagation stack."""
    config = {
        "gravity_model": "WGS72",
        "model_id": "sgp4-vallado",
        "model_version": installed_sgp4_version(),
        "operation_mode": "i",
        "output_frame": "TEME",
        **assumptions.config(),
    }
    serialized = json.dumps(config, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def build_satrec_from_mean_elements(elements: MeanElements) -> Satrec:
    """Initialize SGP4 from canonical OMM fields with documented unit conversions.

    Conversions mirror the reference ``sgp4.omm`` adapter so any decimal catalog
    ID stays an integer identity and no five-character TLE field is ever formed.
    """
    raw = elements.mean_elements
    mean_motion_rev_per_day = _require_number(raw, "mean_motion_rev_per_day")
    eccentricity = _require_number(raw, "eccentricity")
    inclination_deg = _require_number(raw, "inclination_deg")
    ra_of_asc_node_deg = _require_number(raw, "ra_of_asc_node_deg")
    arg_of_pericenter_deg = _require_number(raw, "arg_of_pericenter_deg")
    mean_anomaly_deg = _require_number(raw, "mean_anomaly_deg")

    bstar = elements.bstar()
    ndot = float(raw.get("mean_motion_dot") or 0.0) / _NDOT_UNITS
    nddot = float(raw.get("mean_motion_ddot") or 0.0) / _NDDOT_UNITS

    if not elements.catalog_id.isdecimal():
        raise PropagationError(
            "Catalog identifier must be numeric", {"catalog_id": elements.catalog_id}
        )

    satrec = Satrec()
    try:
        satrec.sgp4init(
            WGS72,
            "i",
            int(elements.catalog_id),
            days_since_sgp4_epoch(elements.epoch),
            bstar,
            ndot,
            nddot,
            eccentricity,
            arg_of_pericenter_deg * _OMM_TO_RADIANS,
            inclination_deg * _OMM_TO_RADIANS,
            mean_anomaly_deg * _OMM_TO_RADIANS,
            mean_motion_rev_per_day / 720.0 * math.pi,
            ra_of_asc_node_deg * _OMM_TO_RADIANS,
        )
    except ValueError as error:
        raise PropagationError(
            "SGP4 rejected the supplied element set",
            {"catalog_id": elements.catalog_id, "reason": str(error)},
        ) from error
    return satrec


class Sgp4Propagator:
    """Deterministic epoch-aware SGP4 wrapper that never returns non-finite states."""

    def __init__(
        self,
        elements: MeanElements,
        assumptions: FrameAssumptions,
        model_version: str | None = None,
    ) -> None:
        if elements.theory.upper() != "SGP4":
            raise PropagationError(
                "Only SGP4 mean-element theory is supported for GP propagation",
                {"theory": elements.theory},
            )
        if elements.frame.upper() != "TEME":
            raise PropagationError(
                "GP mean elements must be declared in TEME for SGP4 propagation",
                {"frame": elements.frame},
            )
        self.elements = elements
        self.assumptions = assumptions
        self.model_version = model_version or installed_sgp4_version()
        self._satrec = build_satrec_from_mean_elements(elements)

    def propagate(self, sample_time_utc: datetime) -> OrbitSample:
        """Propagate one aware UTC instant to a finite TEME state and geodetic fix."""
        tsince_minutes = (sample_time_utc - self.elements.epoch).total_seconds() / 60.0
        return self.propagate_minutes(tsince_minutes, sample_time_utc)

    def propagate_minutes(
        self, minutes_from_epoch: float, sample_time_utc: datetime | None = None
    ) -> OrbitSample:
        """Propagate one signed minute offset from the stored solution epoch."""
        resolved_time = sample_time_utc or self.elements.epoch + timedelta(
            minutes=minutes_from_epoch
        )
        error_code, r_teme, v_teme = self._satrec.sgp4_tsince(float(minutes_from_epoch))
        if error_code != 0:
            raise PropagationError(
                "SGP4 could not produce a state for the requested sample time",
                {
                    "sgp4_error_code": error_code,
                    "sgp4_error": str(self._satrec.error),
                    "sample_time": resolved_time.isoformat(),
                    "minutes_from_epoch": float(minutes_from_epoch),
                },
            )
        r_km = [float(component) for component in r_teme]
        v_km_s = [float(component) for component in v_teme]
        if not all(math.isfinite(value) for value in [*r_km, *v_km_s]):
            raise PropagationError(
                "SGP4 produced a non-finite state; nothing is returned rather than NaN",
                {"sample_time": resolved_time.isoformat()},
            )
        r_itrf, _v_itrf = teme_to_itrf(r_km, v_km_s, resolved_time, self.assumptions)
        geodetic = itrf_to_geodetic(r_itrf)
        return OrbitSample(
            sample_time=resolved_time,
            frame="TEME",
            r_teme_km=(r_km[0], r_km[1], r_km[2]),
            v_teme_km_s=(v_km_s[0], v_km_s[1], v_km_s[2]),
            lat_deg=geodetic["lat_deg"],
            lon_deg=geodetic["lon_deg"],
            alt_km=geodetic["alt_km"],
        )

    def propagate_grid(
        self, start_utc: datetime, stop_utc: datetime, step_seconds: int, maximum_samples: int
    ) -> list[OrbitSample]:
        """Propagate an inclusive UTC grid after enforcing the published size cap."""
        duration_seconds = (stop_utc - start_utc).total_seconds()
        if duration_seconds < 0:
            raise PropagationError(
                "Ephemeris stop precedes start", {}, status="INVALID_WINDOW"
            )
        if step_seconds <= 0:
            raise PropagationError(
                "Step must be positive", {"step_s": step_seconds}, status="INVALID_WINDOW"
            )
        sample_count = int(duration_seconds // step_seconds) + 1
        if sample_count > maximum_samples:
            raise PropagationError(
                "Requested ephemeris exceeds the configured sample cap",
                {"samples": sample_count, "maximum_samples": maximum_samples},
                status="INVALID_WINDOW",
            )
        return [
            self.propagate(start_utc + timedelta(seconds=offset * step_seconds))
            for offset in range(sample_count)
        ]


def samples_output_hash(samples: Iterable[OrbitSample]) -> str:
    """Hash propagated samples so identical inputs and versions stay byte-identical."""
    payload = [
        {
            "sample_time": sample.sample_time.isoformat(),
            "frame": sample.frame,
            "r_km": list(sample.r_teme_km),
            "v_km_s": list(sample.v_teme_km_s),
            "lat_deg": sample.lat_deg,
            "lon_deg": sample.lon_deg,
            "alt_km": sample.alt_km,
        }
        for sample in samples
    ]
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _require_number(raw: dict[str, float | int | None], key: str) -> float:
    value = raw.get(key)
    if value is None or isinstance(value, bool):
        raise PropagationError(f"Required OMM element {key} is missing", {key: None})
    numeric = float(value)
    if not math.isfinite(numeric):
        raise PropagationError(f"Required OMM element {key} is not finite", {key: None})
    return numeric
