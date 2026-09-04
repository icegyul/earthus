"""P3 explore catalog service: API-derived positions only, honest coverage states."""

import uuid
from datetime import UTC, datetime
from typing import Any

from backend.config import settings
from backend.explore.errors import CatalogViewportError
from backend.explore.models import (
    GLOBAL_DENSITY_INSUFFICIENT,
    CatalogCoverage,
    CatalogEntry,
    CatalogSolutionRef,
)
from backend.explore.repository import ExploreRepository
from backend.orbit.errors import PropagationError
from backend.orbit.frames import FrameAssumptions
from backend.orbit.models import MeanElements
from backend.orbit.propagator import (
    Sgp4Propagator,
    build_config_hash,
    installed_sgp4_version,
)
from backend.orbit.repository import _json_dict, _numeric_elements
from backend.orbit.time_scale import require_utc_datetime


def parse_bbox(raw: str | None) -> tuple[float, float, float, float] | None:
    """Parse ``min_lat,min_lon,max_lat,max_lon`` degrees with antimeridian support."""
    if raw is None or not raw.strip():
        return None
    parts = [part.strip() for part in raw.split(",")]
    if len(parts) != 4:
        raise CatalogViewportError(
            "bbox must be min_lat,min_lon,max_lat,max_lon in decimal degrees"
        )
    try:
        min_lat, min_lon, max_lat, max_lon = (float(part) for part in parts)
    except ValueError as error:
        raise CatalogViewportError("bbox values must be numeric degrees") from error
    if not (-90.0 <= min_lat <= 90.0 and -90.0 <= max_lat <= 90.0):
        raise CatalogViewportError("bbox latitudes must lie within [-90, 90]")
    if not (-180.0 <= min_lon <= 180.0 and -180.0 <= max_lon <= 180.0):
        raise CatalogViewportError("bbox longitudes must lie within [-180, 180]")
    if min_lat > max_lat:
        raise CatalogViewportError("bbox min_lat must not exceed max_lat")
    return (min_lat, min_lon, max_lat, max_lon)


def _lon_in_bbox(lon_deg: float, bounds: tuple[float, float, float, float]) -> bool:
    _min_lat, min_lon, _max_lat, max_lon = bounds
    if min_lon <= max_lon:
        return min_lon <= lon_deg <= max_lon
    return lon_deg >= min_lon or lon_deg <= max_lon


def _utc_z(moment: datetime) -> str:
    """ISO-8601 in UTC with a trailing Z, the form OMM consumers actually parse."""
    return moment.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _omm_payload(
    elements: MeanElements, name: str | None, cospar_id: str | None
) -> dict[str, Any] | None:
    """Render stored mean elements back in OMM field names for client-side SGP4.

    Values are passed through unconverted: ingestion stored them exactly as the
    provider published them (rev/day, degrees, rev/day^n), and every SGP4
    implementation that accepts OMM expects those same units. Converting here
    would make the client disagree with the server for the same element set.
    """
    raw = elements.mean_elements
    required = (
        "mean_motion_rev_per_day",
        "eccentricity",
        "inclination_deg",
        "ra_of_asc_node_deg",
        "arg_of_pericenter_deg",
        "mean_anomaly_deg",
    )
    if any(raw.get(key) is None for key in required):
        return None  # never publish a half element set; the client would guess
    return {
        "OBJECT_NAME": name,
        "OBJECT_ID": cospar_id,
        "NORAD_CAT_ID": int(elements.catalog_id) if elements.catalog_id.isdecimal() else None,
        # ⚠️ "Z" for UTC, not "+00:00". Python's isoformat() emits the offset
        #    form, and satellite.js (the client SGP4 every Earth here uses) silently
        #    fails to parse it — jdsatepoch comes out null and every position is
        #    NaN with error code 0, so nothing looks broken until nothing draws.
        "EPOCH": _utc_z(elements.epoch),
        "MEAN_MOTION": raw["mean_motion_rev_per_day"],
        "ECCENTRICITY": raw["eccentricity"],
        "INCLINATION": raw["inclination_deg"],
        "RA_OF_ASC_NODE": raw["ra_of_asc_node_deg"],
        "ARG_OF_PERICENTER": raw["arg_of_pericenter_deg"],
        "MEAN_ANOMALY": raw["mean_anomaly_deg"],
        "EPHEMERIS_TYPE": 0,
        "CLASSIFICATION_TYPE": "U",
        "ELEMENT_SET_NO": raw.get("element_set_no"),
        "REV_AT_EPOCH": raw.get("rev_at_epoch"),
        "BSTAR": raw.get("bstar") or 0.0,
        "MEAN_MOTION_DOT": raw.get("mean_motion_dot") or 0.0,
        "MEAN_MOTION_DDOT": raw.get("mean_motion_ddot") or 0.0,
        "THEORY": elements.theory,
        "FRAME": elements.frame,
    }


class CatalogService:
    """Build explore snapshots from stored solutions through the real P2 propagator."""

    def __init__(self, repository: ExploreRepository | None = None) -> None:
        self.repository = repository or ExploreRepository()

    async def snapshot(
        self,
        at_raw: str | None,
        bbox_raw: str | None,
        limit_raw: int | None,
    ) -> dict[str, Any]:
        """Propagate one instant per stored solution and return explicit states."""
        at = (
            require_utc_datetime(at_raw, "at")
            if at_raw is not None
            else datetime.now(UTC)
        )
        bounds = parse_bbox(bbox_raw)
        maximum = settings.catalog_max_objects
        if limit_raw is None:
            limit = maximum
        elif isinstance(limit_raw, bool) or not 1 <= limit_raw <= maximum:
            raise CatalogViewportError(f"limit must be an integer between 1 and {maximum}")
        else:
            limit = limit_raw

        rows = await self.repository.catalog_rows(limit)
        entries = [self._entry_from_row(row, at) for row in rows]

        if bounds is not None:
            entries = [
                entry
                for entry in entries
                if entry.geodetic is not None
                and bounds[0] <= entry.geodetic["lat_deg"] <= bounds[2]
                and _lon_in_bbox(entry.geodetic["lon_deg"], bounds)
            ]

        coverage = await self._coverage(entries)
        data_status, warnings = self._aggregate_status(entries, coverage)

        return {
            "request_id": str(uuid.uuid4()),
            "generated_at": datetime.now(UTC).isoformat(),
            "data_status": data_status,
            "data": {
                "at": at.isoformat(),
                "catalog": [entry.to_payload() for entry in entries],
                "coverage": coverage.to_payload(),
            },
            "provenance": self._snapshot_provenance(),
            "warnings": warnings,
        }

    async def catalog_status(self) -> dict[str, Any]:
        """Report catalog coverage and source health without rendering positions."""
        objects_total = await self.repository.count_objects()
        with_solution = await self.repository.count_objects_with_solution()
        sources = await self.repository.source_health()
        density, reason = self._global_density_state(with_solution)
        coverage = CatalogCoverage(
            objects_total=objects_total,
            objects_with_solution=with_solution,
            catalog_entries=0,
            positioned_markers=0,
            positioned_ok=0,
            positioned_stale=0,
            unavailable_entries=0,
            unavailable_by_status={},
            global_density=density,
            global_density_reason=reason,
            sources=sources,
        )
        return {
            "request_id": str(uuid.uuid4()),
            "generated_at": datetime.now(UTC).isoformat(),
            "data_status": "OK" if with_solution > 0 else "UNAVAILABLE",
            "data": {"coverage": coverage.to_payload()},
            "provenance": self._snapshot_provenance(),
            "warnings": self._coverage_warnings(with_solution),
        }

    def _entry_from_row(self, row: dict[str, Any], at: datetime) -> CatalogEntry:
        """Convert one stored row into a catalog entry with an explicit position state."""
        quality = _json_dict(row["quality_json"])
        limitations = [item for item in quality.get("limitations", []) if isinstance(item, str)]
        epoch = row["epoch"]
        data_age_seconds = max((at - epoch).total_seconds(), 0.0)
        stale = data_age_seconds > settings.default_data_age_warning_hours * 3600.0
        assumptions = FrameAssumptions(ut1_utc_offset_seconds=settings.ut1_utc_offset_seconds)
        reference = CatalogSolutionRef(
            orbit_solution_id=str(row["orbit_solution_id"]),
            source_ids=[row["source_id"]] if row["source_id"] else [],
            source_snapshot_at=epoch,
            retrieved_at=row["retrieved_at"],
            input_artifact_hashes=[f"sha256:{row['content_sha256']}"]
            if row["content_sha256"]
            else [],
            quality_grade=quality.get("source_grade"),
            model_version=installed_sgp4_version(),
            config_hash=build_config_hash(assumptions),
            data_age_seconds=data_age_seconds,
            stale=stale,
            limitations=limitations,
        )
        warnings: list[str] = []
        if stale:
            warnings.append(
                "Stored GP elements exceed the configured data-age threshold; "
                "the rendered position propagates old mean elements."
            )
        warnings.extend(limitations)

        elements = MeanElements(
            catalog_id=str(row["catalog_id"]),
            epoch=epoch,
            frame=str(row["frame"]),
            time_system=str(row["time_system"]),
            theory=str(row["theory"]),
            mean_elements=_numeric_elements(_json_dict(row["mean_elements_json"])),
        )
        try:
            propagator = Sgp4Propagator(elements, assumptions)
            sample = propagator.propagate(at)
        except PropagationError as error:
            unavailable = error.status != "QUARANTINE"
            return CatalogEntry(
                object_id=str(row["object_id"]),
                catalog_id=str(row["catalog_id"]),
                canonical_name=row["canonical_name"],
                cospar_id=row["cospar_id"],
                object_type=row["object_type"],
                origin_code=row["origin_code"],
                status="UNAVAILABLE" if unavailable else "QUARANTINE",
                position_status=(
                    "PROPAGATION_UNAVAILABLE" if unavailable else "QUARANTINE"
                ),
                sample_time=None,
                state=None,
                geodetic=None,
                provenance=None,
                warnings=[error.message, *warnings],
            )

        return CatalogEntry(
            object_id=str(row["object_id"]),
            catalog_id=str(row["catalog_id"]),
            canonical_name=row["canonical_name"],
            cospar_id=row["cospar_id"],
            object_type=row["object_type"],
            origin_code=row["origin_code"],
            status="STALE" if stale else "OK",
            position_status="STALE" if stale else "OK",
            sample_time=sample.sample_time.isoformat(),
            state={
                "frame": sample.frame,
                "r_km": list(sample.r_teme_km),
                "v_km_s": list(sample.v_teme_km_s),
            },
            geodetic={
                "lat_deg": sample.lat_deg,
                "lon_deg": sample.lon_deg,
                "alt_km": sample.alt_km,
            },
            provenance=reference,
            elements=_omm_payload(elements, row["canonical_name"], row["cospar_id"]),
            warnings=warnings,
        )

    async def _coverage(self, entries: list[CatalogEntry]) -> CatalogCoverage:
        with_solution = await self.repository.count_objects_with_solution()
        sources = await self.repository.source_health()
        density, reason = self._global_density_state(with_solution)
        unavailable_by_status: dict[str, int] = {}
        for entry in entries:
            if entry.geodetic is None:
                unavailable_by_status[entry.position_status] = (
                    unavailable_by_status.get(entry.position_status, 0) + 1
                )
        positioned = [entry for entry in entries if entry.geodetic is not None]
        return CatalogCoverage(
            objects_total=await self.repository.count_objects(),
            objects_with_solution=with_solution,
            catalog_entries=len(entries),
            positioned_markers=len(positioned),
            positioned_ok=sum(1 for entry in positioned if entry.position_status == "OK"),
            positioned_stale=sum(1 for entry in positioned if entry.position_status == "STALE"),
            unavailable_entries=len(entries) - len(positioned),
            unavailable_by_status=unavailable_by_status,
            global_density=density,
            global_density_reason=reason,
            sources=sources,
        )

    def _global_density_state(self, with_solution: int) -> tuple[str, str]:
        threshold = settings.global_density_min_objects
        if with_solution >= threshold:
            return (
                "AVAILABLE",
                f"{with_solution} propagable objects meet the configured "
                f"global-density threshold of {threshold}.",
            )
        return (
            GLOBAL_DENSITY_INSUFFICIENT,
            f"Only {with_solution} objects with stored orbit solutions are ingested; "
            f"the configured global-density threshold is {threshold}. A global "
            "density view is not rendered because it would fabricate the "
            "orbital population.",
        )

    def _aggregate_status(
        self, entries: list[CatalogEntry], coverage: CatalogCoverage
    ) -> tuple[str, list[str]]:
        warnings = self._coverage_warnings(coverage.objects_with_solution)
        if not entries:
            return "UNAVAILABLE", [
                "No canonical objects with stored orbit solutions are available in "
                "the catalog; nothing is rendered.",
                *warnings,
            ]
        statuses = {entry.position_status for entry in entries}
        if statuses <= {"OK"}:
            return "OK", warnings
        if statuses <= {"STALE"}:
            return "STALE", [
                "Every rendered object propagates elements older than the configured "
                "data-age threshold.",
                *warnings,
            ]
        return "PARTIAL", [
            "Some catalog objects could not be rendered; per-object position_status "
            "carries the explicit reason.",
            *warnings,
        ]

    def _coverage_warnings(self, with_solution: int) -> list[str]:
        warnings: list[str] = []
        if with_solution == 0:
            warnings.append(
                "The catalog is empty; ingest at least one object through "
                "POST /api/v1/ingestions/celestrak/omm/{catalog_id} to render "
                "real positions."
            )
        return warnings

    def _snapshot_provenance(self) -> dict[str, Any]:
        assumptions = FrameAssumptions(ut1_utc_offset_seconds=settings.ut1_utc_offset_seconds)
        return {
            "model_id": "sgp4-vallado",
            "model_version": installed_sgp4_version(),
            "config_hash": build_config_hash(assumptions),
            "frame": "TEME",
            "time_system": "UTC",
            "position_origin": (
                "Server-side SGP4 propagation of stored OMM orbit solutions; "
                "the client never computes positions."
            ),
            "limitations": [
                "UT1-UTC approximated as 0.0 s and polar motion neglected; "
                "TEME->ITRF uses IAU-1982 GMST only.",
                "PUBLIC_GP mean elements are not an operational ephemeris.",
            ],
        }
