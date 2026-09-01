"""Credential-free live provider adapter tests (E10 SWPC, E11 JPL CAD, E14 LL2).

Every case injects a recorded-shape response through httpx.MockTransport, so the
suite never touches the network. Fixtures are inlined rather than stored as files
because each one is small and is only meaningful next to the assertion that reads it.
"""

import json
from datetime import UTC, datetime

import httpx
import pytest

from backend.ingestion.errors import (
    InsufficientDataError,
    ProviderUnavailableError,
    RateLimitedError,
)
from backend.providers_live import AU_TO_KM
from backend.providers_live.launches import (
    LAUNCH_SOURCE_ID,
    UpcomingLaunchClient,
)
from backend.providers_live.neo import NEO_SOURCE_ID, NeoCloseApproachClient
from backend.providers_live.space_weather import (
    KP_SOURCE_ID,
    XRAY_SOURCE_ID,
    SpaceWeatherClient,
)

# --- Recorded-shape fixtures -------------------------------------------------

KP_FIXTURE = [
    {"time_tag": "2026-08-30T12:00:00", "kp_index": 2, "estimated_kp": 1.667, "kp": "2M"},
    {"time_tag": "2026-08-30T12:01:00", "kp_index": 3, "estimated_kp": 2.667, "kp": "3M"},
    {"time_tag": "2026-08-30T12:02:00", "kp_index": 4, "estimated_kp": 3.667, "kp": "4M"},
]

KP_FIXTURE_WITH_BAD_ROWS = [
    {"time_tag": "2026-08-30T12:00:00", "kp_index": 2, "estimated_kp": 1.667, "kp": "2M"},
    {"time_tag": "not-a-timestamp", "kp_index": 5, "estimated_kp": 4.667, "kp": "5M"},
    {"time_tag": "2026-08-30T12:02:00", "kp_index": None, "estimated_kp": None, "kp": None},
    "unexpected-scalar-row",
    {"time_tag": "2026-08-30T12:03:00", "kp_index": 1, "estimated_kp": 0.667, "kp": "1M"},
]

XRAY_FIXTURE = [
    {
        "time_tag": "2026-08-30T16:51:00Z",
        "satellite": 16,
        "current_class": "X8.7",
        "begin_time": "2026-08-30T16:37:00Z",
        "begin_class": "M2.6",
        "max_time": "2026-08-30T16:51:00Z",
        "max_class": "X8.7",
        "max_xrlong": 0.000871,
        "end_time": None,
        "end_class": None,
    }
]

CAD_FIELDS = [
    "des",
    "orbit_id",
    "jd",
    "cd",
    "dist",
    "dist_min",
    "dist_max",
    "v_rel",
    "v_inf",
    "t_sigma_f",
    "h",
]

CAD_FIXTURE = {
    "signature": {"source": "NASA/JPL SBDB Close Approach Data API", "version": "1.5"},
    "count": "2",
    "fields": CAD_FIELDS,
    "data": [
        [
            "2026 QK",
            "3",
            "2461284.043",
            "2026-Sep-02 13:02",
            "0.0123456789",
            "0.0123400000",
            "0.0123500000",
            "8.1234567",
            "8.0987654",
            "00:03",
            "24.5",
        ],
        [
            "433 Eros",
            "659",
            "2461300.500",
            "2026-Sep-19 00:00",
            "0.0456789012",
            "0.0456700000",
            "0.0456800000",
            "5.4321000",
            "5.4000000",
            "< 00:01",
            "11.16",
        ],
    ],
}

CAD_FIXTURE_WITH_BAD_ROWS = {
    "signature": {"source": "NASA/JPL SBDB Close Approach Data API", "version": "1.5"},
    "count": "5",
    "fields": CAD_FIELDS,
    "data": [
        [
            "2026 QK",
            "3",
            "2461284.043",
            "2026-Sep-02 13:02",
            "0.0123456789",
            "0.0123400000",
            "0.0123500000",
            "8.1234567",
            "8.0987654",
            "00:03",
            "24.5",
        ],
        ["2026 SHORT", "1", "2461285.0"],
        [
            "",
            "3",
            "2461286.043",
            "2026-Sep-04 13:02",
            "0.02",
            "0.02",
            "0.02",
            "7.0",
            "7.0",
            "00:03",
            "22.0",
        ],
        [
            "2026 BADTIME",
            "3",
            "2461287.043",
            "September the second",
            "0.03",
            "0.03",
            "0.03",
            "6.0",
            "6.0",
            "00:03",
            "21.0",
        ],
        [
            "2026 BADDIST",
            "3",
            "2461288.043",
            "2026-Sep-06 13:02",
            "n/a",
            "0.04",
            "0.04",
            "5.0",
            "5.0",
            "00:03",
            "20.0",
        ],
    ],
}

CAD_EMPTY_FIXTURE = {
    "signature": {"source": "NASA/JPL SBDB Close Approach Data API", "version": "1.5"},
    "count": "0",
}


def _launch_row(launch_id: str, name: str, net: str) -> dict:
    """Build one LL2-shaped launch row for the fixtures below."""
    return {
        "id": launch_id,
        "name": name,
        "net": net,
        "window_start": net,
        "window_end": net,
        "status": {"id": 1, "name": "Go for Launch", "abbrev": "Go"},
        "launch_service_provider": {"id": 121, "name": "SpaceX", "type": "Commercial"},
        "rocket": {
            "configuration": {"id": 164, "name": "Falcon 9", "full_name": "Falcon 9 Block 5"}
        },
        "mission": {
            "id": 7,
            "name": "Starlink Group 1-1",
            "type": "Communications",
            "orbit": {"id": 8, "name": "Low Earth Orbit", "abbrev": "LEO"},
        },
        "pad": {
            "id": 80,
            "name": "Space Launch Complex 40",
            "latitude": "28.56194122",
            "longitude": "-80.57735736",
            "location": {"id": 12, "name": "Cape Canaveral, FL, USA", "country_code": "USA"},
        },
    }


LL2_FIXTURE = {
    "count": 742,
    "next": "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=2&offset=2",
    "previous": None,
    "results": [
        _launch_row("aaaa-1111", "Falcon 9 | Starlink Group 1-1", "2026-09-03T14:20:00Z"),
        _launch_row("bbbb-2222", "Falcon 9 | Starlink Group 1-2", "2026-09-02T09:05:00Z"),
    ],
}

LL2_FIXTURE_WITH_BAD_ROWS = {
    "count": 4,
    "next": None,
    "previous": None,
    "results": [
        _launch_row("aaaa-1111", "Falcon 9 | Starlink Group 1-1", "2026-09-03T14:20:00Z"),
        {**_launch_row("cccc-3333", "No NET", "2026-09-04T00:00:00Z"), "net": None},
        {**_launch_row("dddd-4444", "No name", "2026-09-05T00:00:00Z"), "name": "   "},
        "unexpected-scalar-row",
    ],
}

LL2_EMPTY_FIXTURE = {"count": 0, "next": None, "previous": None, "results": []}


# --- Helpers -----------------------------------------------------------------


def json_transport(payload: object, *, status_code: int = 200) -> httpx.MockTransport:
    """Serve one recorded JSON document for every request."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            status_code,
            content=json.dumps(payload).encode("utf-8"),
            headers={"content-type": "application/json"},
            request=request,
        )

    return httpx.MockTransport(handler)


def status_transport(status_code: int, headers: dict | None = None) -> httpx.MockTransport:
    """Serve one bare status code for every request."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, headers=headers or {}, request=request)

    return httpx.MockTransport(handler)


def no_sleep(_seconds: float) -> None:
    """Collapse retry backoff so the suite stays deterministic."""
    return None


# --- E10 NOAA SWPC space weather ---------------------------------------------


@pytest.mark.asyncio
async def test_kp_index_parses_published_samples_without_derivation() -> None:
    """Kp must be reported as the published index, never rescaled or converted."""
    client = SpaceWeatherClient(
        transport=json_transport(KP_FIXTURE), cache_ttl_seconds=0, sleep=no_sleep
    )

    result = await client.fetch_planetary_k_index()

    assert result.status == "OK"
    assert len(result.samples) == 3
    assert result.latest is not None
    assert result.latest.time_tag == datetime(2026, 8, 30, 12, 2, tzinfo=UTC)
    assert result.latest.kp_index == 4
    assert result.latest.estimated_kp == pytest.approx(3.667)

    payload = result.to_dict()
    assert payload["unit"] == "kp_index_dimensionless_0_to_9"
    assert payload["latest"]["kp_label"] == "4M"
    assert "not a probability" in payload["notes"][0]
    # No probability-like or risk-like key may appear on a Kp payload.
    assert not {"probability", "pc", "risk_score", "screening_score"} & set(payload)


@pytest.mark.asyncio
async def test_kp_index_preserves_raw_bytes_and_provenance() -> None:
    """Provenance must let a reader re-verify the exact bytes that were parsed."""
    raw_bytes = json.dumps(KP_FIXTURE).encode("utf-8")
    client = SpaceWeatherClient(
        transport=json_transport(KP_FIXTURE), cache_ttl_seconds=0, sleep=no_sleep
    )

    result = await client.fetch_planetary_k_index()

    assert result.raw.content == raw_bytes
    provenance = result.to_dict()["provenance"]
    assert provenance["source_id"] == KP_SOURCE_ID
    assert provenance["source_uri"].endswith("planetary_k_index_1m.json")
    assert provenance["raw_sha256"] == result.raw_sha256
    assert len(provenance["raw_sha256"]) == 64
    assert provenance["retrieved_at"].endswith("Z")
    assert provenance["content_bytes"] == len(raw_bytes)
    assert provenance["from_cache"] is False


@pytest.mark.asyncio
async def test_kp_index_skips_bad_rows_and_aggregates_the_reasons() -> None:
    """A malformed row is dropped with an accounted reason, never silently or as zero."""
    client = SpaceWeatherClient(
        transport=json_transport(KP_FIXTURE_WITH_BAD_ROWS),
        cache_ttl_seconds=0,
        sleep=no_sleep,
    )

    result = await client.fetch_planetary_k_index()
    payload = result.to_dict()

    assert result.status == "PARTIAL"
    assert payload["total_rows"] == 5
    assert payload["sample_count"] == 2
    assert payload["skipped_row_count"] == 3
    assert payload["skipped_reasons"] == {
        "time_tag_missing_or_unparsable": 1,
        "kp_value_missing": 1,
        "row_not_object": 1,
    }
    # The Kp-less row must not reappear as a zero-valued sample.
    assert all(sample["kp_index"] is not None for sample in payload["samples"])


@pytest.mark.asyncio
async def test_kp_index_max_samples_keeps_the_most_recent_rows() -> None:
    """Client-side truncation keeps the newest samples because the file has no query API."""
    client = SpaceWeatherClient(
        transport=json_transport(KP_FIXTURE), cache_ttl_seconds=0, sleep=no_sleep
    )

    result = await client.fetch_planetary_k_index(max_samples=1)

    assert [sample.kp_index for sample in result.samples] == [4]
    assert result.to_dict()["total_rows"] == 3


@pytest.mark.asyncio
async def test_kp_index_empty_array_is_an_explicit_insufficient_data_state() -> None:
    """An empty series must be INSUFFICIENT_DATA, not an OK result with no numbers."""
    client = SpaceWeatherClient(
        transport=json_transport([]), cache_ttl_seconds=0, sleep=no_sleep
    )

    with pytest.raises(InsufficientDataError) as error:
        await client.fetch_planetary_k_index()

    assert error.value.status == "INSUFFICIENT_DATA"
    assert error.value.details["total_rows"] == 0
    assert error.value.details["source_id"] == KP_SOURCE_ID
    assert len(error.value.details["raw_sha256"]) == 64


@pytest.mark.asyncio
async def test_kp_index_empty_body_is_an_explicit_insufficient_data_state() -> None:
    """A 200 with no bytes is a provider gap, not an empty measurement."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"", request=request)

    client = SpaceWeatherClient(
        transport=httpx.MockTransport(handler), cache_ttl_seconds=0, sleep=no_sleep
    )

    with pytest.raises(InsufficientDataError) as error:
        await client.fetch_planetary_k_index()

    assert error.value.status == "INSUFFICIENT_DATA"
    assert error.value.details["http_status"] == 200


@pytest.mark.asyncio
async def test_kp_index_rate_limit_returns_rate_limited_with_provider_cooldown() -> None:
    """A 429 hands the provider's own cooldown to shared policy without local retry."""
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(429, headers={"retry-after": "120"}, request=request)

    client = SpaceWeatherClient(
        transport=httpx.MockTransport(handler),
        cache_ttl_seconds=0,
        max_retries=2,
        sleep=no_sleep,
    )

    with pytest.raises(RateLimitedError) as error:
        await client.fetch_planetary_k_index()

    assert calls == 1
    assert error.value.status == "RATE_LIMITED"
    assert error.value.details["retry_after_seconds"] == 120


@pytest.mark.asyncio
async def test_space_weather_outage_returns_unavailable_after_bounded_retries() -> None:
    """A sustained 5xx surfaces UNAVAILABLE rather than a synthesized quiet-sun value."""
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(503, request=request)

    client = SpaceWeatherClient(
        transport=httpx.MockTransport(handler),
        cache_ttl_seconds=0,
        max_retries=1,
        sleep=no_sleep,
    )

    with pytest.raises(ProviderUnavailableError) as error:
        await client.fetch_planetary_k_index()

    assert calls == 2
    assert error.value.status == "UNAVAILABLE"


@pytest.mark.asyncio
async def test_space_weather_retries_a_transient_failure_then_keeps_raw_bytes() -> None:
    """A retried request must return the final provider bytes unmodified."""
    calls = 0
    raw_bytes = json.dumps(KP_FIXTURE).encode("utf-8")

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(502, request=request)
        return httpx.Response(
            200,
            content=raw_bytes,
            headers={"content-type": "application/json"},
            request=request,
        )

    client = SpaceWeatherClient(
        transport=httpx.MockTransport(handler),
        cache_ttl_seconds=0,
        max_retries=1,
        sleep=no_sleep,
    )

    result = await client.fetch_planetary_k_index()

    assert calls == 2
    assert result.raw.content == raw_bytes


@pytest.mark.asyncio
async def test_xray_flares_parse_class_and_flux_without_reclassification() -> None:
    """Flare class and flux are reported as published, with an explicit unit label."""
    client = SpaceWeatherClient(
        transport=json_transport(XRAY_FIXTURE), cache_ttl_seconds=0, sleep=no_sleep
    )

    result = await client.fetch_latest_xray_flares()
    payload = result.to_dict()

    assert payload["provenance"]["source_id"] == XRAY_SOURCE_ID
    assert payload["flare_count"] == 1
    flare = payload["flares"][0]
    assert flare["max_class"] == "X8.7"
    assert flare["max_flux_watts_per_m2"] == pytest.approx(0.000871)
    assert flare["flux_unit"] == "watts_per_square_metre_0.1-0.8nm"
    assert flare["end_time"] is None
    assert flare["is_ongoing"] is True


@pytest.mark.asyncio
async def test_xray_flares_skip_rows_without_a_class_and_aggregate() -> None:
    """A classless flare row is rejected with a counted reason."""
    payload = [
        {"time_tag": "2026-08-30T16:51:00Z", "satellite": 16, "max_class": None},
        XRAY_FIXTURE[0],
        42,
    ]
    client = SpaceWeatherClient(
        transport=json_transport(payload), cache_ttl_seconds=0, sleep=no_sleep
    )

    result = await client.fetch_latest_xray_flares()

    assert result.status == "PARTIAL"
    assert result.to_dict()["skipped_reasons"] == {
        "flare_class_missing": 1,
        "row_not_object": 1,
    }


# --- E11 NASA/JPL SBDB close approach ----------------------------------------


@pytest.mark.asyncio
async def test_close_approaches_parse_field_array_format_and_convert_units() -> None:
    """The fields/data array format is decoded and au is converted to km explicitly."""
    client = NeoCloseApproachClient(
        transport=json_transport(CAD_FIXTURE), cache_ttl_seconds=0, sleep=no_sleep
    )

    result = await client.fetch_close_approaches(dist_max_au=0.05, limit=10)
    payload = result.to_dict()

    assert payload["status"] == "OK"
    assert payload["reported_count"] == 2
    assert payload["approach_count"] == 2
    assert payload["provider_signature"]["version"] == "1.5"
    assert payload["units"]["au_to_km_factor"] == AU_TO_KM

    first = payload["approaches"][0]
    assert first["designation"] == "2026 QK"
    assert first["close_approach_utc"] == "2026-09-02T13:02:00Z"
    assert first["close_approach_raw"] == "2026-Sep-02 13:02"
    assert first["distance_au"] == pytest.approx(0.0123456789)
    assert first["distance_km"] == pytest.approx(0.0123456789 * AU_TO_KM)
    assert first["relative_velocity_km_s"] == pytest.approx(8.1234567)
    assert first["absolute_magnitude_h"] == pytest.approx(24.5)
    assert payload["closest"]["designation"] == "2026 QK"
    # A close-approach distance is geometry, never an impact probability.
    assert "impact_probability" not in first
    assert "not an impact probability" in payload["notes"][0]


@pytest.mark.asyncio
async def test_close_approaches_skip_bad_rows_and_aggregate_the_reasons() -> None:
    """Short, nameless, undated and non-numeric rows are each rejected and counted."""
    client = NeoCloseApproachClient(
        transport=json_transport(CAD_FIXTURE_WITH_BAD_ROWS),
        cache_ttl_seconds=0,
        sleep=no_sleep,
    )

    result = await client.fetch_close_approaches()
    payload = result.to_dict()

    assert payload["status"] == "PARTIAL"
    assert payload["total_rows"] == 5
    assert payload["approach_count"] == 1
    assert payload["skipped_reasons"] == {
        "row_shorter_than_field_header": 1,
        "designation_missing": 1,
        "close_approach_time_unparsable": 1,
        "distance_not_numeric": 1,
    }
    assert {row["index"] for row in payload["skipped_rows"]} == {1, 2, 3, 4}


@pytest.mark.asyncio
async def test_close_approaches_zero_count_response_is_insufficient_data() -> None:
    """A count-0 CAD answer omits fields/data and must not become an empty success."""
    client = NeoCloseApproachClient(
        transport=json_transport(CAD_EMPTY_FIXTURE), cache_ttl_seconds=0, sleep=no_sleep
    )

    with pytest.raises(InsufficientDataError) as error:
        await client.fetch_close_approaches()

    assert error.value.status == "INSUFFICIENT_DATA"
    assert error.value.details["reported_count"] == 0
    assert error.value.details["source_id"] == NEO_SOURCE_ID
    assert len(error.value.details["raw_sha256"]) == 64


@pytest.mark.asyncio
async def test_close_approaches_rate_limit_returns_rate_limited() -> None:
    """JPL throttling surfaces RATE_LIMITED with a nonzero cooldown."""
    client = NeoCloseApproachClient(
        transport=status_transport(429),
        cache_ttl_seconds=0,
        max_retries=2,
        sleep=no_sleep,
    )

    with pytest.raises(RateLimitedError) as error:
        await client.fetch_close_approaches()

    assert error.value.status == "RATE_LIMITED"
    assert error.value.details["retry_after_seconds"] >= 1


@pytest.mark.asyncio
async def test_close_approach_query_uri_carries_the_documented_parameters() -> None:
    """The recorded source URI must reproduce the exact query that was asked."""
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(
            200,
            content=json.dumps(CAD_FIXTURE).encode("utf-8"),
            headers={"content-type": "application/json"},
            request=request,
        )

    client = NeoCloseApproachClient(
        transport=httpx.MockTransport(handler), cache_ttl_seconds=0, sleep=no_sleep
    )

    result = await client.fetch_close_approaches(dist_max_au=0.05, limit=5, date_min="now")

    assert seen[0].startswith("https://ssd-api.jpl.nasa.gov/cad.api?")
    assert "dist-max=0.05" in seen[0]
    assert "date-min=now" in seen[0]
    assert "limit=5" in seen[0]
    assert result.query["limit"] == 5


@pytest.mark.asyncio
async def test_close_approach_rejects_an_out_of_range_limit_before_requesting() -> None:
    """An unserviceable query is refused locally instead of guessing a default."""
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, content=b"[]", request=request)

    client = NeoCloseApproachClient(
        transport=httpx.MockTransport(handler), cache_ttl_seconds=0, sleep=no_sleep
    )

    with pytest.raises(InsufficientDataError):
        await client.fetch_close_approaches(limit=0)

    assert calls == 0


# --- E14 TheSpaceDevs Launch Library 2 ---------------------------------------


@pytest.mark.asyncio
async def test_upcoming_launches_parse_and_sort_by_net() -> None:
    """Launches are normalized from nested LL2 objects and ordered by published NET."""
    client = UpcomingLaunchClient(
        transport=json_transport(LL2_FIXTURE), cache_ttl_seconds=0, sleep=no_sleep
    )

    result = await client.fetch_upcoming(limit=2)
    payload = result.to_dict()

    assert payload["status"] == "OK"
    assert payload["reported_total"] == 742
    assert payload["launch_count"] == 2
    assert payload["next_launch"]["launch_id"] == "bbbb-2222"
    assert [launch["net_utc"] for launch in payload["launches"]] == [
        "2026-09-02T09:05:00Z",
        "2026-09-03T14:20:00Z",
    ]

    first = payload["launches"][0]
    assert first["provider"]["name"] == "SpaceX"
    assert first["rocket"]["full_name"] == "Falcon 9 Block 5"
    assert first["mission"]["orbit"] == "Low Earth Orbit"
    assert first["pad"]["latitude_deg"] == pytest.approx(28.56194122)
    assert first["pad"]["country_code"] == "USA"
    assert payload["provenance"]["source_id"] == LAUNCH_SOURCE_ID


@pytest.mark.asyncio
async def test_upcoming_launches_skip_bad_rows_and_aggregate_the_reasons() -> None:
    """A launch without a NET or a name is rejected and counted, never defaulted."""
    client = UpcomingLaunchClient(
        transport=json_transport(LL2_FIXTURE_WITH_BAD_ROWS),
        cache_ttl_seconds=0,
        sleep=no_sleep,
    )

    result = await client.fetch_upcoming(limit=10)
    payload = result.to_dict()

    assert payload["status"] == "PARTIAL"
    assert payload["total_rows"] == 4
    assert payload["launch_count"] == 1
    assert payload["skipped_reasons"] == {
        "net_missing_or_unparsable": 1,
        "launch_name_missing": 1,
        "row_not_object": 1,
    }


@pytest.mark.asyncio
async def test_upcoming_launches_tolerate_null_mission_objects() -> None:
    """LL2 nulls whole sub-objects; that is absent detail, not a rejectable row."""
    row = _launch_row("eeee-5555", "Electron | Unknown Payload", "2026-09-10T00:00:00Z")
    row["mission"] = None
    client = UpcomingLaunchClient(
        transport=json_transport({"count": 1, "results": [row]}),
        cache_ttl_seconds=0,
        sleep=no_sleep,
    )

    result = await client.fetch_upcoming(limit=1)
    mission = result.to_dict()["launches"][0]["mission"]

    assert result.status == "OK"
    assert mission == {"name": None, "type": None, "orbit": None}


@pytest.mark.asyncio
async def test_upcoming_launches_empty_results_is_an_explicit_insufficient_data_state() -> None:
    """An empty schedule is reported as INSUFFICIENT_DATA, never as zero launches known."""
    client = UpcomingLaunchClient(
        transport=json_transport(LL2_EMPTY_FIXTURE), cache_ttl_seconds=0, sleep=no_sleep
    )

    with pytest.raises(InsufficientDataError) as error:
        await client.fetch_upcoming(limit=5)

    assert error.value.status == "INSUFFICIENT_DATA"
    assert error.value.details["total_rows"] == 0
    assert error.value.details["source_id"] == LAUNCH_SOURCE_ID


@pytest.mark.asyncio
async def test_upcoming_launches_rate_limit_reads_the_body_cooldown() -> None:
    """LL2 reports its throttle window in the body, so that cooldown must be honored."""
    body = json.dumps({"detail": "Request was throttled. Expected available in 3600 seconds."})

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            429,
            content=body.encode("utf-8"),
            headers={"content-type": "application/json"},
            request=request,
        )

    client = UpcomingLaunchClient(
        transport=httpx.MockTransport(handler),
        cache_ttl_seconds=0,
        max_retries=2,
        sleep=no_sleep,
    )

    with pytest.raises(RateLimitedError) as error:
        await client.fetch_upcoming(limit=5)

    assert error.value.status == "RATE_LIMITED"
    assert error.value.details["retry_after_seconds"] == 3600


@pytest.mark.asyncio
async def test_upcoming_launches_cache_avoids_a_second_provider_request() -> None:
    """The throttled LL2 tier is protected by reuse that keeps the original lineage."""
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            200,
            content=json.dumps(LL2_FIXTURE).encode("utf-8"),
            headers={"content-type": "application/json"},
            request=request,
        )

    client = UpcomingLaunchClient(
        transport=httpx.MockTransport(handler), cache_ttl_seconds=900, sleep=no_sleep
    )

    first = await client.fetch_upcoming(limit=2)
    second = await client.fetch_upcoming(limit=2)

    assert calls == 1
    assert second.raw.from_cache is True
    assert second.retrieved_at == first.retrieved_at
    assert second.raw_sha256 == first.raw_sha256
    assert second.to_dict()["provenance"]["from_cache"] is True


@pytest.mark.asyncio
async def test_upcoming_launches_reject_a_non_json_body() -> None:
    """An HTML error page is INSUFFICIENT_DATA with lineage, not a parsed schedule."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=b"<html>service temporarily unavailable</html>",
            headers={"content-type": "text/html"},
            request=request,
        )

    client = UpcomingLaunchClient(
        transport=httpx.MockTransport(handler), cache_ttl_seconds=0, sleep=no_sleep
    )

    with pytest.raises(InsufficientDataError) as error:
        await client.fetch_upcoming(limit=5)

    assert error.value.status == "INSUFFICIENT_DATA"
    assert error.value.details["media_type"] == "text/html"
