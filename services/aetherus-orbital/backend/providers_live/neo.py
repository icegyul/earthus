"""E11 -- NASA/JPL SBDB Close Approach Data (CAD) adapter.

CAD answers "which small bodies pass within a distance of a body, and when". It is a
close-approach ephemeris product, not an impact-probability product: nothing here may
be read as a Pc, a risk score, or a screening verdict. Distances arrive in au and are
converted to km explicitly while the published au value is preserved alongside.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlencode

import httpx

from backend.ingestion.errors import InsufficientDataError
from backend.ingestion.providers.base import SourcePolicy
from backend.providers_live import (
    AU_TO_KM,
    LiveProviderClient,
    RawResponse,
    SkippedRow,
    coerce_float,
    coerce_int,
    coerce_text,
    parse_json_document,
    result_status,
    skip_summary,
)

NEO_SOURCE_ID = "nasa_jpl_sbdb_cad"
NEO_BASE_URL = "https://ssd-api.jpl.nasa.gov/cad.api"

NEO_POLICY = SourcePolicy(
    source_id=NEO_SOURCE_ID,
    minimum_interval_seconds=300,
    cache_ttl_seconds=3600,
    requires_authentication=False,
)

MAX_LIMIT = 1000
MAX_DIST_AU = 1.0

# CAD publishes close-approach times as UTC calendar strings with month abbreviations.
_CD_FORMATS = ("%Y-%b-%d %H:%M", "%Y-%b-%d %H:%M:%S", "%Y-%b-%d")
_DATE_PATTERN = re.compile(r"^(now|\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?)$")
_BODY_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9 _-]{0,31}$")

_NEO_NOTE = (
    "Close-approach geometry only. Distance and relative velocity are not an impact "
    "probability and are not a conjunction screening result."
)


@dataclass(frozen=True)
class CloseApproach:
    """One CAD row, with the published au distance kept beside its km conversion."""

    designation: str
    orbit_id: str | None
    close_approach_utc: datetime
    close_approach_raw: str
    distance_au: float
    distance_km: float
    distance_min_au: float | None
    distance_max_au: float | None
    relative_velocity_km_s: float | None
    v_infinity_km_s: float | None
    absolute_magnitude_h: float | None
    time_uncertainty: str | None

    def to_dict(self) -> dict[str, Any]:
        """Return the serializable close-approach record."""
        return {
            "designation": self.designation,
            "orbit_id": self.orbit_id,
            "close_approach_utc": self.close_approach_utc.isoformat().replace("+00:00", "Z"),
            "close_approach_raw": self.close_approach_raw,
            "distance_au": self.distance_au,
            "distance_km": self.distance_km,
            "distance_min_au": self.distance_min_au,
            "distance_max_au": self.distance_max_au,
            "relative_velocity_km_s": self.relative_velocity_km_s,
            "v_infinity_km_s": self.v_infinity_km_s,
            "absolute_magnitude_h": self.absolute_magnitude_h,
            "time_uncertainty": self.time_uncertainty,
        }


@dataclass(frozen=True)
class NeoCloseApproachResult:
    """Parsed CAD rows bound to the exact bytes and query they came from."""

    raw: RawResponse
    approaches: tuple[CloseApproach, ...]
    skipped: tuple[SkippedRow, ...]
    total_rows: int
    reported_count: int | None
    signature: dict[str, str | None]
    query: dict[str, Any]

    @property
    def source_uri(self) -> str:
        """Return the retrieval URI recorded for this payload."""
        return self.raw.source_uri

    @property
    def retrieved_at(self) -> datetime:
        """Return the instant the bytes were retrieved."""
        return self.raw.retrieved_at

    @property
    def raw_sha256(self) -> str:
        """Return the SHA-256 of the exact provider bytes."""
        return self.raw.raw_sha256

    @property
    def status(self) -> str:
        """Return OK, or PARTIAL when at least one published row was rejected."""
        return result_status(len(self.approaches), len(self.skipped))

    @property
    def closest(self) -> CloseApproach | None:
        """Return the smallest published nominal distance in this response."""
        return min(self.approaches, key=lambda row: row.distance_au, default=None)

    def to_dict(self) -> dict[str, Any]:
        """Return the route-ready payload."""
        closest = self.closest
        return {
            "status": self.status,
            "measure": "close_approach_data",
            "provenance": self.raw.provenance(),
            "provider_signature": self.signature,
            "query": dict(self.query),
            "units": {
                "distance": "au (published) and km (converted)",
                "au_to_km_factor": AU_TO_KM,
                "velocity": "km/s",
                "absolute_magnitude_h": "magnitude",
            },
            "reported_count": self.reported_count,
            "total_rows": self.total_rows,
            "approach_count": len(self.approaches),
            "closest": closest.to_dict() if closest is not None else None,
            "approaches": [row.to_dict() for row in self.approaches],
            "skipped_row_count": len(self.skipped),
            "skipped_reasons": skip_summary(list(self.skipped)),
            "skipped_rows": [row.to_dict() for row in self.skipped],
            "notes": [_NEO_NOTE],
        }


class NeoCloseApproachClient(LiveProviderClient):
    """Query the credential-free JPL SBDB close-approach API."""

    def __init__(
        self,
        transport: httpx.AsyncBaseTransport | None = None,
        *,
        timeout_seconds: float = 20.0,
        max_retries: int = 1,
        cache_ttl_seconds: float = float(NEO_POLICY.cache_ttl_seconds),
        **kwargs: Any,
    ) -> None:
        super().__init__(
            source_id=NEO_SOURCE_ID,
            transport=transport,
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
            cache_ttl_seconds=cache_ttl_seconds,
            **kwargs,
        )

    async def fetch_close_approaches(
        self,
        *,
        dist_max_au: float = 0.05,
        date_min: str = "now",
        date_max: str | None = None,
        limit: int = 50,
        body: str = "Earth",
    ) -> NeoCloseApproachResult:
        """Fetch close approaches within dist_max_au of the requested body."""
        query = _validated_query(
            dist_max_au=dist_max_au,
            date_min=date_min,
            date_max=date_max,
            limit=limit,
            body=body,
        )
        raw = await self.fetch_raw(build_cad_uri(query), source_id=NEO_SOURCE_ID)
        document = parse_json_document(raw, expected=dict)

        signature = _signature(document.get("signature"))
        reported_count = coerce_int(document.get("count"))
        fields = document.get("fields")
        rows = document.get("data")

        # A zero-result CAD query omits "fields"/"data" entirely; that is an explicit
        # "no records", never an empty success carrying implied zeros.
        if fields is None or rows is None:
            raise InsufficientDataError(
                "JPL CAD returned no close-approach records for this query",
                {
                    **raw.provenance(),
                    "query": query,
                    "reported_count": reported_count,
                    "provider_signature": signature,
                },
            )
        if not isinstance(fields, list) or not isinstance(rows, list):
            raise InsufficientDataError(
                "JPL CAD response has a malformed fields/data structure",
                {**raw.provenance(), "query": query},
            )

        index_by_field = {
            str(name): position for position, name in enumerate(fields) if isinstance(name, str)
        }
        for required in ("des", "cd", "dist"):
            if required not in index_by_field:
                raise InsufficientDataError(
                    "JPL CAD response is missing a required field column",
                    {**raw.provenance(), "query": query, "missing_field": required},
                )

        approaches: list[CloseApproach] = []
        skipped: list[SkippedRow] = []
        for index, row in enumerate(rows):
            approach = _parse_cad_row(index, row, index_by_field, skipped)
            if approach is not None:
                approaches.append(approach)

        if not approaches:
            raise InsufficientDataError(
                "JPL CAD returned no usable close-approach rows",
                {
                    **raw.provenance(),
                    "query": query,
                    "total_rows": len(rows),
                    "skipped_row_count": len(skipped),
                    "skipped_reasons": skip_summary(skipped),
                },
            )

        return NeoCloseApproachResult(
            raw=raw,
            approaches=tuple(approaches),
            skipped=tuple(skipped),
            total_rows=len(rows),
            reported_count=reported_count,
            signature=signature,
            query=query,
        )


def build_cad_uri(query: dict[str, Any]) -> str:
    """Build the documented CAD query URI used for run provenance."""
    params: list[tuple[str, str]] = [
        ("dist-max", _format_dist(query["dist_max_au"])),
        ("date-min", query["date_min"]),
        ("limit", str(query["limit"])),
        ("body", query["body"]),
    ]
    if query.get("date_max"):
        params.insert(2, ("date-max", query["date_max"]))
    return f"{NEO_BASE_URL}?{urlencode(params)}"


def _validated_query(
    *,
    dist_max_au: float,
    date_min: str,
    date_max: str | None,
    limit: int,
    body: str,
) -> dict[str, Any]:
    """Reject a query the API cannot serve rather than sending it and guessing."""
    distance = coerce_float(dist_max_au)
    if distance is None or not 0 < distance <= MAX_DIST_AU:
        raise InsufficientDataError(
            "dist_max_au must be a positive value no greater than 1 au",
            {"dist_max_au": dist_max_au, "source_id": NEO_SOURCE_ID},
        )
    if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= MAX_LIMIT:
        raise InsufficientDataError(
            f"limit must be an integer between 1 and {MAX_LIMIT}",
            {"limit": limit, "source_id": NEO_SOURCE_ID},
        )
    normalized_min = str(date_min or "").strip()
    if not _DATE_PATTERN.match(normalized_min):
        raise InsufficientDataError(
            "date_min must be 'now' or an ISO calendar date",
            {"date_min": date_min, "source_id": NEO_SOURCE_ID},
        )
    normalized_max: str | None = None
    if date_max is not None:
        normalized_max = str(date_max).strip()
        if not _DATE_PATTERN.match(normalized_max):
            raise InsufficientDataError(
                "date_max must be 'now' or an ISO calendar date",
                {"date_max": date_max, "source_id": NEO_SOURCE_ID},
            )
    normalized_body = str(body or "").strip()
    if not _BODY_PATTERN.match(normalized_body):
        raise InsufficientDataError(
            "body must be a documented CAD body name",
            {"body": body, "source_id": NEO_SOURCE_ID},
        )
    return {
        "dist_max_au": distance,
        "date_min": normalized_min,
        "date_max": normalized_max,
        "limit": limit,
        "body": normalized_body,
    }


def _parse_cad_row(
    index: int,
    row: object,
    index_by_field: dict[str, int],
    skipped: list[SkippedRow],
) -> CloseApproach | None:
    """Accept a CAD row only when designation, epoch and distance are all present."""
    if not isinstance(row, list):
        skipped.append(SkippedRow(index, "row_not_array", type(row).__name__))
        return None

    width_needed = max(index_by_field.values()) + 1
    if len(row) < width_needed:
        skipped.append(
            SkippedRow(index, "row_shorter_than_field_header", f"{len(row)}<{width_needed}")
        )
        return None

    def cell(name: str) -> object:
        position = index_by_field.get(name)
        return None if position is None else row[position]

    designation = coerce_text(cell("des"))
    if designation is None:
        skipped.append(SkippedRow(index, "designation_missing", None))
        return None

    close_approach_raw = coerce_text(cell("cd"))
    close_approach_utc = _parse_cd(close_approach_raw)
    if close_approach_utc is None:
        skipped.append(
            SkippedRow(index, "close_approach_time_unparsable", close_approach_raw)
        )
        return None

    distance_au = coerce_float(cell("dist"))
    if distance_au is None:
        skipped.append(SkippedRow(index, "distance_not_numeric", _brief(cell("dist"))))
        return None

    return CloseApproach(
        designation=designation,
        orbit_id=coerce_text(cell("orbit_id")),
        close_approach_utc=close_approach_utc,
        close_approach_raw=close_approach_raw or "",
        distance_au=distance_au,
        distance_km=distance_au * AU_TO_KM,
        distance_min_au=coerce_float(cell("dist_min")),
        distance_max_au=coerce_float(cell("dist_max")),
        relative_velocity_km_s=coerce_float(cell("v_rel")),
        v_infinity_km_s=coerce_float(cell("v_inf")),
        absolute_magnitude_h=coerce_float(cell("h")),
        time_uncertainty=coerce_text(cell("t_sigma_f")),
    )


def _parse_cd(value: str | None) -> datetime | None:
    """Parse a CAD calendar-date string, which the API publishes in UTC."""
    if not value:
        return None
    for pattern in _CD_FORMATS:
        try:
            return datetime.strptime(value, pattern).replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


def _signature(value: object) -> dict[str, str | None]:
    """Keep the API's self-identification so a stored result names its schema version."""
    if not isinstance(value, dict):
        return {"source": None, "version": None}
    return {
        "source": coerce_text(value.get("source")),
        "version": coerce_text(value.get("version")),
    }


def _format_dist(value: float) -> str:
    """Render the distance bound without scientific notation the API may reject."""
    return f"{value:.10f}".rstrip("0").rstrip(".") or "0"


def _brief(value: object) -> str | None:
    """Return a short, non-secret excerpt of a rejected field for the audit trail."""
    if value is None:
        return None
    return str(value)[:64]
