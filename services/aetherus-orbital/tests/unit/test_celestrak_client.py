"""Provider retry and outage behavior tests."""

from pathlib import Path

import httpx
import pytest

from backend.ingestion.celestrak import CelesTrakClient
from backend.ingestion.errors import ProviderUnavailableError, RateLimitedError

RAW_FIXTURE = Path(__file__).parents[1] / "fixtures" / "celestrak" / "iss-25544-2026-08-23.json"


@pytest.mark.asyncio
async def test_retries_a_transient_provider_failure_then_returns_raw_document() -> None:
    """A retry must preserve the final raw bytes instead of synthesizing a response."""
    calls = 0
    raw = RAW_FIXTURE.read_bytes()

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(503, request=request)
        return httpx.Response(
            200,
            content=raw,
            headers={"content-type": "application/json"},
            request=request,
        )

    client = CelesTrakClient(
        transport=httpx.MockTransport(handler),
        max_retries=1,
        sleep=lambda _: None,
    )

    document = await client.fetch_omm("25544")

    assert calls == 2
    assert document.content == raw
    assert document.source_uri.endswith("CATNR=25544&FORMAT=JSON")
    assert document.media_type == "application/json"


@pytest.mark.asyncio
async def test_provider_outage_returns_an_explicit_unavailable_state() -> None:
    """Provider outages must never turn into a zero-value or synthetic orbital result."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, request=request)

    client = CelesTrakClient(
        transport=httpx.MockTransport(handler),
        max_retries=1,
        sleep=lambda _: None,
    )

    with pytest.raises(ProviderUnavailableError) as error:
        await client.fetch_omm("25544")

    assert error.value.status == "UNAVAILABLE"


@pytest.mark.asyncio
async def test_429_is_not_retried_inside_the_same_request() -> None:
    """A 429 must hand the cooldown to shared policy instead of retrying locally."""
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(429, headers={"retry-after": "120"}, request=request)

    client = CelesTrakClient(
        transport=httpx.MockTransport(handler),
        max_retries=2,
        sleep=lambda _: None,
    )

    with pytest.raises(RateLimitedError) as error:
        await client.fetch_omm("25544")

    assert calls == 1
    assert error.value.details["retry_after_seconds"] == 120
