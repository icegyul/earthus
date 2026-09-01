"""Space-Track GP adapter behavior at the HTTP and secret boundaries."""

from pathlib import Path

import httpx
import pytest
from pydantic import SecretStr

from backend.ingestion.errors import (
    AuthenticationFailedError,
    ProviderUnavailableError,
    RateLimitedError,
)
from backend.ingestion.providers.base import ObjectSelector
from backend.ingestion.providers.spacetrack import SpaceTrackCredentials, SpaceTrackProvider

RAW_FIXTURE = Path(__file__).parents[1] / "fixtures" / "celestrak" / "iss-25544-2026-08-23.json"


@pytest.mark.asyncio
async def test_spacetrack_without_credentials_makes_no_network_request() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(500, request=request)

    provider = SpaceTrackProvider(
        credentials=SpaceTrackCredentials(identity=None, password=None),
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(ProviderUnavailableError, match="AUTH_REQUIRED_NOT_CONFIGURED"):
        await provider.fetch_current(ObjectSelector("25544"))

    assert requests == []


@pytest.mark.asyncio
async def test_spacetrack_preserves_exact_query_bytes_after_login() -> None:
    raw = RAW_FIXTURE.read_bytes()
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/ajaxauth/login":
            return httpx.Response(200, request=request)
        return httpx.Response(
            200,
            content=raw,
            headers={"content-type": "application/json; charset=utf-8"},
            request=request,
        )

    provider = SpaceTrackProvider(
        credentials=SpaceTrackCredentials(
            identity=SecretStr("operator@example.test"),
            password=SecretStr("p1-test-secret"),
        ),
        transport=httpx.MockTransport(handler),
    )

    document = await provider.fetch_current(ObjectSelector("25544"))

    assert len(requests) == 2
    assert requests[0].url.path == "/ajaxauth/login"
    assert "password" not in document.source_uri.lower()
    assert "/class/gp/" in requests[1].url.path
    assert document.content == raw
    assert document.media_type == "application/json"
    assert document.source_id == "spacetrack_gp"


@pytest.mark.asyncio
async def test_spacetrack_429_stops_after_one_gp_query() -> None:
    query_calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal query_calls
        if request.url.path == "/ajaxauth/login":
            return httpx.Response(200, request=request)
        query_calls += 1
        return httpx.Response(429, headers={"retry-after": "3600"}, request=request)

    provider = SpaceTrackProvider(
        credentials=SpaceTrackCredentials(
            identity=SecretStr("operator@example.test"),
            password=SecretStr("p1-test-secret"),
        ),
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(RateLimitedError) as error:
        await provider.fetch_current(ObjectSelector("25544"))

    assert query_calls == 1
    assert error.value.details["retry_after_seconds"] == 3600


@pytest.mark.asyncio
async def test_spacetrack_auth_failure_is_secret_free() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, request=request)

    provider = SpaceTrackProvider(
        credentials=SpaceTrackCredentials(
            identity=SecretStr("operator@example.test"),
            password=SecretStr("p1-test-secret"),
        ),
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(AuthenticationFailedError) as error:
        await provider.fetch_current(ObjectSelector("25544"))

    assert "p1-test-secret" not in str(error.value.to_payload())
