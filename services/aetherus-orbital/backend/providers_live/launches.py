"""E14 -- TheSpaceDevs Launch Library 2 upcoming-launch adapter.

LL2's anonymous tier is aggressively throttled (a small number of requests per hour,
answered with 429 and a multi-hour cooldown), so this adapter defaults to a short
in-process cache, a single retry and a conservative timeout. A schedule is advisory
information: a NET time is a plan, not a commitment, and nothing here is a command
path or a launch authorization.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib.parse import urlencode

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

LAUNCH_SOURCE_ID = "thespacedevs_ll2_launch_upcoming"
LL2_UPCOMING_URL = "https://ll.thespacedevs.com/2.2.0/launch/upcoming/"

LAUNCH_POLICY = SourcePolicy(
    source_id=LAUNCH_SOURCE_ID,
    minimum_interval_seconds=900,
    cache_ttl_seconds=900,
    requires_authentication=False,
)

MAX_LIMIT = 100

_LAUNCH_NOTE = (
    "NET times are provider-published plans that move frequently; this feed is "
    "advisory scheduling context only."
)


@dataclass(frozen=True)
class UpcomingLaunch:
    """One LL2 upcoming-launch record, normalized without inventing absent fields."""

    launch_id: str
    name: str
    net_utc: datetime
    window_start_utc: datetime | None
    window_end_utc: datetime | None
    status_name: str | None
    status_abbrev: str | None
    provider_name: str | None
    provider_type: str | None
    rocket_configuration: str | None
    rocket_full_name: str | None
    mission_name: str | None
    mission_type: str | None
    mission_orbit: str | None
    pad_name: str | None
    pad_latitude_deg: float | None
    pad_longitude_deg: float | None
    pad_location_name: str | None
    pad_country_code: str | None

    def to_dict(self) -> dict[str, Any]:
        """Return the serializable launch record."""
        return {
            "launch_id": self.launch_id,
            "name": self.name,
            "net_utc": _iso(self.net_utc),
            "window_start_utc": _iso(self.window_start_utc),
            "window_end_utc": _iso(self.window_end_utc),
            "status": {"name": self.status_name, "abbrev": self.status_abbrev},
            "provider": {"name": self.provider_name, "type": self.provider_type},
            "rocket": {
                "configuration": self.rocket_configuration,
                "full_name": self.rocket_full_name,
            },
            "mission": {
                "name": self.mission_name,
                "type": self.mission_type,
                "orbit": self.mission_orbit,
            },
            "pad": {
                "name": self.pad_name,
                "latitude_deg": self.pad_latitude_deg,
                "longitude_deg": self.pad_longitude_deg,
                "location_name": self.pad_location_name,
                "country_code": self.pad_country_code,
            },
        }


@dataclass(frozen=True)
class UpcomingLaunchResult:
    """Parsed upcoming launches bound to the exact bytes they were read from."""

    raw: RawResponse
    launches: tuple[UpcomingLaunch, ...]
    skipped: tuple[SkippedRow, ...]
    total_rows: int
    reported_total: int | None
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
        return result_status(len(self.launches), len(self.skipped))

    @property
    def next_launch(self) -> UpcomingLaunch | None:
        """Return the earliest published NET in this response."""
        return min(self.launches, key=lambda launch: launch.net_utc, default=None)

    def to_dict(self) -> dict[str, Any]:
        """Return the route-ready payload."""
        upcoming = self.next_launch
        return {
            "status": self.status,
            "measure": "upcoming_launches",
            "provenance": self.raw.provenance(),
            "query": dict(self.query),
            "reported_total": self.reported_total,
            "total_rows": self.total_rows,
            "launch_count": len(self.launches),
            "next_launch": upcoming.to_dict() if upcoming is not None else None,
            "launches": [launch.to_dict() for launch in self.launches],
            "skipped_row_count": len(self.skipped),
            "skipped_reasons": skip_summary(list(self.skipped)),
            "skipped_rows": [row.to_dict() for row in self.skipped],
            "notes": [_LAUNCH_NOTE],
        }


class UpcomingLaunchClient(LiveProviderClient):
    """Read LL2's anonymous upcoming-launch feed under a conservative request budget."""

    def __init__(
        self,
        transport: httpx.AsyncBaseTransport | None = None,
        *,
        timeout_seconds: float = 15.0,
        max_retries: int = 1,
        cache_ttl_seconds: float = float(LAUNCH_POLICY.cache_ttl_seconds),
        **kwargs: Any,
    ) -> None:
        super().__init__(
            source_id=LAUNCH_SOURCE_ID,
            transport=transport,
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
            cache_ttl_seconds=cache_ttl_seconds,
            **kwargs,
        )

    async def fetch_upcoming(self, *, limit: int = 10) -> UpcomingLaunchResult:
        """Fetch the next `limit` scheduled launches ordered by NET."""
        if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= MAX_LIMIT:
            raise InsufficientDataError(
                f"limit must be an integer between 1 and {MAX_LIMIT}",
                {"limit": limit, "source_id": LAUNCH_SOURCE_ID},
            )
        query = {"limit": limit, "ordering": "net", "mode": "upcoming"}
        raw = await self.fetch_raw(build_upcoming_uri(limit), source_id=LAUNCH_SOURCE_ID)
        document = parse_json_document(raw, expected=dict)

        rows = document.get("results")
        if not isinstance(rows, list):
            raise InsufficientDataError(
                "LL2 response is missing a results array",
                {**raw.provenance(), "query": query},
            )

        launches: list[UpcomingLaunch] = []
        skipped: list[SkippedRow] = []
        for index, row in enumerate(rows):
            launch = _parse_launch_row(index, row, skipped)
            if launch is not None:
                launches.append(launch)

        if not launches:
            raise InsufficientDataError(
                "LL2 returned no usable upcoming launch records",
                {
                    **raw.provenance(),
                    "query": query,
                    "total_rows": len(rows),
                    "skipped_row_count": len(skipped),
                    "skipped_reasons": skip_summary(skipped),
                },
            )

        launches.sort(key=lambda launch: launch.net_utc)
        return UpcomingLaunchResult(
            raw=raw,
            launches=tuple(launches),
            skipped=tuple(skipped),
            total_rows=len(rows),
            reported_total=coerce_int(document.get("count")),
            query=query,
        )


def build_upcoming_uri(limit: int) -> str:
    """Build the documented LL2 upcoming query URI used for run provenance."""
    return f"{LL2_UPCOMING_URL}?{urlencode({'limit': limit, 'ordering': 'net'})}"


def _parse_launch_row(index: int, row: object, skipped: list[SkippedRow]) -> UpcomingLaunch | None:
    """Accept a launch row only when it has an identity, a name and a parseable NET."""
    if not isinstance(row, dict):
        skipped.append(SkippedRow(index, "row_not_object", type(row).__name__))
        return None

    launch_id = coerce_text(row.get("id"))
    if launch_id is None:
        skipped.append(SkippedRow(index, "launch_id_missing", None))
        return None

    name = coerce_text(row.get("name"))
    if name is None:
        skipped.append(SkippedRow(index, "launch_name_missing", launch_id))
        return None

    net_utc = parse_utc_timestamp(row.get("net"))
    if net_utc is None:
        # Without a NET there is no schedule to report; an absent time is not "now".
        skipped.append(SkippedRow(index, "net_missing_or_unparsable", launch_id))
        return None

    status = _mapping(row.get("status"))
    provider = _mapping(row.get("launch_service_provider"))
    rocket_configuration = _mapping(_mapping(row.get("rocket")).get("configuration"))
    mission = _mapping(row.get("mission"))
    pad = _mapping(row.get("pad"))
    pad_location = _mapping(pad.get("location"))

    return UpcomingLaunch(
        launch_id=launch_id,
        name=name,
        net_utc=net_utc,
        window_start_utc=parse_utc_timestamp(row.get("window_start")),
        window_end_utc=parse_utc_timestamp(row.get("window_end")),
        status_name=coerce_text(status.get("name")),
        status_abbrev=coerce_text(status.get("abbrev")),
        provider_name=coerce_text(provider.get("name")),
        provider_type=coerce_text(provider.get("type")),
        rocket_configuration=coerce_text(rocket_configuration.get("name")),
        rocket_full_name=coerce_text(rocket_configuration.get("full_name")),
        mission_name=coerce_text(mission.get("name")),
        mission_type=coerce_text(mission.get("type")),
        mission_orbit=coerce_text(_mapping(mission.get("orbit")).get("name")),
        pad_name=coerce_text(pad.get("name")),
        # LL2 2.2.0 serializes pad coordinates as strings; keep them numeric or absent.
        pad_latitude_deg=coerce_float(pad.get("latitude")),
        pad_longitude_deg=coerce_float(pad.get("longitude")),
        pad_location_name=coerce_text(pad_location.get("name")),
        pad_country_code=coerce_text(pad_location.get("country_code")),
    )


def _mapping(value: object) -> dict[str, Any]:
    """Return a dict for an optional nested object; LL2 nulls whole sub-objects."""
    return value if isinstance(value, dict) else {}


def _iso(moment: datetime | None) -> str | None:
    """Render an optional UTC instant in the contract's Zulu form."""
    if moment is None:
        return None
    return moment.isoformat().replace("+00:00", "Z")
