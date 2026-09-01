"""E10 -- NOAA SWPC space weather adapter (planetary Kp index, GOES X-ray flares).

Kp is a quasi-logarithmic, dimensionless geomagnetic activity index on a 0-9 scale.
It is NOT a probability, NOT a collision metric, and NOT convertible into either.
This module therefore reports Kp as it is published and refuses to derive anything
from it; any risk framing is the responsibility of a downstream analyst, not of an
ingestion adapter.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

import httpx

from backend.ingestion.errors import InsufficientDataError
from backend.ingestion.providers.base import SourcePolicy
from backend.providers_live import (
    LiveProviderClient,
    RawResponse,
    SkippedRow,
    coerce_float,
    coerce_int,
    coerce_text,
    parse_json_document,
    parse_utc_timestamp,
    result_status,
    skip_summary,
)

KP_SOURCE_ID = "noaa_swpc_planetary_k_index_1m"
KP_SOURCE_URI = "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json"

XRAY_SOURCE_ID = "noaa_swpc_goes_primary_xray_flares_latest"
XRAY_SOURCE_URI = "https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json"

KP_POLICY = SourcePolicy(
    source_id=KP_SOURCE_ID,
    minimum_interval_seconds=60,
    cache_ttl_seconds=60,
    requires_authentication=False,
)
XRAY_POLICY = SourcePolicy(
    source_id=XRAY_SOURCE_ID,
    minimum_interval_seconds=60,
    cache_ttl_seconds=120,
    requires_authentication=False,
)

KP_UNIT = "kp_index_dimensionless_0_to_9"
XRAY_FLUX_UNIT = "watts_per_square_metre_0.1-0.8nm"

_KP_NOTE = (
    "Kp is a dimensionless geomagnetic activity index (0-9). "
    "It is not a probability and must not be converted into one."
)
_XRAY_NOTE = (
    "GOES X-ray flare classification is a flux magnitude band, not a hazard score."
)


@dataclass(frozen=True)
class KpSample:
    """One published planetary K index sample, preserved without derivation."""

    time_tag: datetime
    kp_index: int | None
    estimated_kp: float | None
    kp_label: str | None

    def to_dict(self) -> dict[str, Any]:
        """Return the serializable sample exactly as published."""
        return {
            "time_tag": _iso(self.time_tag),
            "kp_index": self.kp_index,
            "estimated_kp": self.estimated_kp,
            "kp_label": self.kp_label,
        }


@dataclass(frozen=True)
class XrayFlare:
    """One GOES X-ray flare record as published by SWPC."""

    satellite: int | None
    begin_time: datetime | None
    max_time: datetime | None
    end_time: datetime | None
    begin_class: str | None
    max_class: str | None
    current_class: str | None
    max_flux_watts_per_m2: float | None
    is_ongoing: bool

    def to_dict(self) -> dict[str, Any]:
        """Return the serializable flare record."""
        return {
            "satellite": self.satellite,
            "begin_time": _iso(self.begin_time),
            "max_time": _iso(self.max_time),
            "end_time": _iso(self.end_time),
            "begin_class": self.begin_class,
            "max_class": self.max_class,
            "current_class": self.current_class,
            "max_flux_watts_per_m2": self.max_flux_watts_per_m2,
            "flux_unit": XRAY_FLUX_UNIT,
            "is_ongoing": self.is_ongoing,
        }


@dataclass(frozen=True)
class KpIndexResult:
    """Parsed Kp samples bound to the exact bytes they were read from."""

    raw: RawResponse
    samples: tuple[KpSample, ...]
    skipped: tuple[SkippedRow, ...]
    total_rows: int

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
        return result_status(len(self.samples), len(self.skipped))

    @property
    def latest(self) -> KpSample | None:
        """Return the most recent sample by published time tag."""
        return max(self.samples, key=lambda sample: sample.time_tag, default=None)

    def to_dict(self) -> dict[str, Any]:
        """Return the route-ready payload."""
        latest = self.latest
        return {
            "status": self.status,
            "measure": "planetary_k_index",
            "unit": KP_UNIT,
            "cadence": "1_minute",
            "provenance": self.raw.provenance(),
            "total_rows": self.total_rows,
            "sample_count": len(self.samples),
            "latest": latest.to_dict() if latest is not None else None,
            "samples": [sample.to_dict() for sample in self.samples],
            "skipped_row_count": len(self.skipped),
            "skipped_reasons": skip_summary(list(self.skipped)),
            "skipped_rows": [row.to_dict() for row in self.skipped],
            "notes": [_KP_NOTE],
        }


@dataclass(frozen=True)
class XrayFlareResult:
    """Parsed GOES X-ray flare records bound to their source bytes."""

    raw: RawResponse
    flares: tuple[XrayFlare, ...]
    skipped: tuple[SkippedRow, ...]
    total_rows: int

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
        return result_status(len(self.flares), len(self.skipped))

    def to_dict(self) -> dict[str, Any]:
        """Return the route-ready payload."""
        return {
            "status": self.status,
            "measure": "goes_xray_flares_latest",
            "provenance": self.raw.provenance(),
            "total_rows": self.total_rows,
            "flare_count": len(self.flares),
            "flares": [flare.to_dict() for flare in self.flares],
            "skipped_row_count": len(self.skipped),
            "skipped_reasons": skip_summary(list(self.skipped)),
            "skipped_rows": [row.to_dict() for row in self.skipped],
            "notes": [_XRAY_NOTE],
        }


class SpaceWeatherClient(LiveProviderClient):
    """Read NOAA SWPC's credential-free JSON products without deriving new metrics."""

    def __init__(
        self,
        transport: httpx.AsyncBaseTransport | None = None,
        *,
        timeout_seconds: float = 15.0,
        max_retries: int = 1,
        cache_ttl_seconds: float = float(KP_POLICY.cache_ttl_seconds),
        **kwargs: Any,
    ) -> None:
        super().__init__(
            source_id=KP_SOURCE_ID,
            transport=transport,
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
            cache_ttl_seconds=cache_ttl_seconds,
            **kwargs,
        )

    async def fetch_planetary_k_index(self, *, max_samples: int | None = None) -> KpIndexResult:
        """Fetch the 1-minute planetary K index series as published.

        max_samples truncates client-side to the most recent N rows; the endpoint is
        a static file and accepts no query parameters, so truncation cannot be
        pushed upstream.
        """
        if max_samples is not None and max_samples < 1:
            raise InsufficientDataError(
                "max_samples must be a positive integer",
                {"max_samples": max_samples, "source_id": KP_SOURCE_ID},
            )
        raw = await self.fetch_raw(KP_SOURCE_URI, source_id=KP_SOURCE_ID)
        rows = parse_json_document(raw, expected=list)

        samples: list[KpSample] = []
        skipped: list[SkippedRow] = []
        for index, row in enumerate(rows):
            sample = _parse_kp_row(index, row, skipped)
            if sample is not None:
                samples.append(sample)

        if not samples:
            raise InsufficientDataError(
                "NOAA SWPC returned no usable planetary K index samples",
                {
                    **raw.provenance(),
                    "total_rows": len(rows),
                    "skipped_row_count": len(skipped),
                    "skipped_reasons": skip_summary(skipped),
                },
            )

        samples.sort(key=lambda sample: sample.time_tag)
        selected = samples[-max_samples:] if max_samples is not None else samples
        return KpIndexResult(
            raw=raw,
            samples=tuple(selected),
            skipped=tuple(skipped),
            total_rows=len(rows),
        )

    async def fetch_latest_xray_flares(self) -> XrayFlareResult:
        """Fetch the latest GOES primary X-ray flare records as published."""
        raw = await self.fetch_raw(XRAY_SOURCE_URI, source_id=XRAY_SOURCE_ID)
        rows = parse_json_document(raw, expected=list)

        flares: list[XrayFlare] = []
        skipped: list[SkippedRow] = []
        for index, row in enumerate(rows):
            flare = _parse_xray_row(index, row, skipped)
            if flare is not None:
                flares.append(flare)

        if not flares:
            raise InsufficientDataError(
                "NOAA SWPC returned no usable GOES X-ray flare records",
                {
                    **raw.provenance(),
                    "total_rows": len(rows),
                    "skipped_row_count": len(skipped),
                    "skipped_reasons": skip_summary(skipped),
                },
            )

        return XrayFlareResult(
            raw=raw,
            flares=tuple(flares),
            skipped=tuple(skipped),
            total_rows=len(rows),
        )


def _parse_kp_row(index: int, row: object, skipped: list[SkippedRow]) -> KpSample | None:
    """Accept a Kp row only when it carries a timestamp and at least one Kp value."""
    if not isinstance(row, dict):
        skipped.append(SkippedRow(index, "row_not_object", type(row).__name__))
        return None

    time_tag = parse_utc_timestamp(row.get("time_tag"))
    if time_tag is None:
        skipped.append(
            SkippedRow(index, "time_tag_missing_or_unparsable", _brief(row.get("time_tag")))
        )
        return None

    kp_index = coerce_int(row.get("kp_index"))
    estimated_kp = coerce_float(row.get("estimated_kp"))
    if kp_index is None and estimated_kp is None:
        # A timestamp with no Kp value is not a "Kp of 0" -- reject rather than invent.
        skipped.append(SkippedRow(index, "kp_value_missing", None))
        return None

    return KpSample(
        time_tag=time_tag,
        kp_index=kp_index,
        estimated_kp=estimated_kp,
        kp_label=coerce_text(row.get("kp")),
    )


def _parse_xray_row(index: int, row: object, skipped: list[SkippedRow]) -> XrayFlare | None:
    """Accept a flare row only when it carries a class and at least one timestamp."""
    if not isinstance(row, dict):
        skipped.append(SkippedRow(index, "row_not_object", type(row).__name__))
        return None

    max_class = coerce_text(row.get("max_class"))
    current_class = coerce_text(row.get("current_class"))
    if max_class is None and current_class is None:
        skipped.append(SkippedRow(index, "flare_class_missing", None))
        return None

    begin_time = parse_utc_timestamp(row.get("begin_time"))
    max_time = parse_utc_timestamp(row.get("max_time"))
    end_time = parse_utc_timestamp(row.get("end_time"))
    observed_at = parse_utc_timestamp(row.get("time_tag"))
    if begin_time is None and max_time is None and observed_at is None:
        skipped.append(SkippedRow(index, "no_parsable_timestamp", None))
        return None

    return XrayFlare(
        satellite=coerce_int(row.get("satellite")),
        begin_time=begin_time or observed_at,
        max_time=max_time,
        end_time=end_time,
        begin_class=coerce_text(row.get("begin_class")),
        max_class=max_class,
        current_class=current_class,
        max_flux_watts_per_m2=coerce_float(row.get("max_xrlong")),
        # SWPC leaves end_time null while a flare is still in progress.
        is_ongoing=end_time is None,
    )


def _iso(moment: datetime | None) -> str | None:
    """Render an optional UTC instant in the contract's Zulu form."""
    if moment is None:
        return None
    return moment.isoformat().replace("+00:00", "Z")


def _brief(value: object) -> str | None:
    """Return a short, non-secret excerpt of a rejected field for the audit trail."""
    if value is None:
        return None
    return str(value)[:64]
