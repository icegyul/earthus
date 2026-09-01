"""CelesTrak GP/OMM-compatible JSON provider adapter."""

import asyncio
import re
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlencode

import httpx

from backend.ingestion.errors import (
    InsufficientDataError,
    ProviderUnavailableError,
    RateLimitedError,
)
from backend.ingestion.providers.base import FetchedOmmDocument, validate_catalog_id

CELESTRAK_GP_URL = "https://celestrak.org/NORAD/elements/gp.php"
CELESTRAK_SOURCE_ID = "celestrak_gp"


class CelesTrakClient:
    """Fetch one CelesTrak GP response with bounded retry behavior."""

    def __init__(
        self,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout_seconds: float = 20.0,
        max_retries: int = 2,
        sleep: Callable[[float], Awaitable[None] | None] = asyncio.sleep,
    ) -> None:
        self.transport = transport
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.sleep = sleep

    async def fetch_omm(self, catalog_id: str) -> FetchedOmmDocument:
        """Fetch a single catalog ID as JSON without applying TLE constraints."""
        normalized_id = _validate_catalog_id(catalog_id)
        source_uri = celestrak_omm_uri(normalized_id)
        request_error: Exception | None = None
        async with httpx.AsyncClient(
            transport=self.transport,
            timeout=self.timeout_seconds,
            follow_redirects=True,
        ) as client:
            for attempt in range(self.max_retries + 1):
                try:
                    response = await client.get(source_uri, headers={"Accept": "application/json"})
                except httpx.RequestError as error:
                    request_error = error
                    if attempt == self.max_retries:
                        break
                    await self._sleep(_retry_delay_seconds(attempt, None))
                    continue

                if response.status_code == 200:
                    if not response.content.strip():
                        raise InsufficientDataError(
                            "CelesTrak returned an empty OMM response",
                            {"catalog_id": normalized_id, "source_uri": source_uri},
                        )
                    content_type = response.headers.get("content-type", "application/octet-stream")
                    return FetchedOmmDocument(
                        source_id=CELESTRAK_SOURCE_ID,
                        source_uri=str(response.url),
                        retrieved_at=datetime.now(UTC),
                        content=response.content,
                        media_type=content_type.split(";", maxsplit=1)[0].lower(),
                    )

                if response.status_code in {400, 404}:
                    raise InsufficientDataError(
                        "CelesTrak has no OMM record for the requested catalog ID",
                        {"catalog_id": normalized_id, "http_status": response.status_code},
                    )
                if response.status_code == 429:
                    raise RateLimitedError(
                        "CelesTrak GP query is rate limited",
                        retry_after_seconds=_retry_after_seconds(
                            response.headers.get("retry-after")
                        ),
                    )
                if response.status_code not in {500, 502, 503, 504}:
                    raise ProviderUnavailableError(
                        "CelesTrak returned an unexpected provider response",
                        {"catalog_id": normalized_id, "http_status": response.status_code},
                    )
                request_error = ProviderUnavailableError(
                    "CelesTrak is temporarily unavailable",
                    {"catalog_id": normalized_id, "http_status": response.status_code},
                )
                if attempt == self.max_retries:
                    break
                await self._sleep(
                    _retry_delay_seconds(attempt, response.headers.get("retry-after"))
                )

        details: dict[str, Any] = {"catalog_id": normalized_id, "source_uri": source_uri}
        if request_error is not None:
            details["provider_error"] = str(request_error)
        raise ProviderUnavailableError("CelesTrak could not be reached after retrying", details)

    async def fetch_group(self, group: str) -> FetchedOmmDocument:
        """Fetch one CelesTrak GROUP query (many records, one immutable response).

        Debris clouds arrive through the documented GROUP endpoint so a whole
        fragmentation family costs exactly one provider request — per-object
        CATNR hammering for hundreds of fragments would violate CelesTrak's
        usage guidance.
        """
        normalized_group = _validate_group(group)
        source_uri = celestrak_group_uri(normalized_group)
        request_error: Exception | None = None
        async with httpx.AsyncClient(
            transport=self.transport,
            timeout=self.timeout_seconds,
            follow_redirects=True,
        ) as client:
            for attempt in range(self.max_retries + 1):
                try:
                    response = await client.get(source_uri, headers={"Accept": "application/json"})
                except httpx.RequestError as error:
                    request_error = error
                    if attempt == self.max_retries:
                        break
                    await self._sleep(_retry_delay_seconds(attempt, None))
                    continue

                if response.status_code == 200:
                    if not response.content.strip():
                        raise InsufficientDataError(
                            "CelesTrak returned an empty group response",
                            {"group": normalized_group, "source_uri": source_uri},
                        )
                    content_type = response.headers.get("content-type", "application/octet-stream")
                    return FetchedOmmDocument(
                        source_id=CELESTRAK_SOURCE_ID,
                        source_uri=str(response.url),
                        retrieved_at=datetime.now(UTC),
                        content=response.content,
                        media_type=content_type.split(";", maxsplit=1)[0].lower(),
                    )

                if response.status_code in {400, 404}:
                    raise InsufficientDataError(
                        "CelesTrak has no records for the requested group",
                        {"group": normalized_group, "http_status": response.status_code},
                    )
                if response.status_code == 429:
                    raise RateLimitedError(
                        "CelesTrak GP query is rate limited",
                        retry_after_seconds=_retry_after_seconds(
                            response.headers.get("retry-after")
                        ),
                    )
                if response.status_code not in {500, 502, 503, 504}:
                    raise ProviderUnavailableError(
                        "CelesTrak returned an unexpected provider response",
                        {"group": normalized_group, "http_status": response.status_code},
                    )
                request_error = ProviderUnavailableError(
                    "CelesTrak is temporarily unavailable",
                    {"group": normalized_group, "http_status": response.status_code},
                )
                if attempt == self.max_retries:
                    break
                await self._sleep(
                    _retry_delay_seconds(attempt, response.headers.get("retry-after"))
                )

        details: dict[str, Any] = {"group": normalized_group, "source_uri": source_uri}
        if request_error is not None:
            details["provider_error"] = str(request_error)
        raise ProviderUnavailableError("CelesTrak could not be reached after retrying", details)

    async def _sleep(self, seconds: float) -> None:
        """Await the injected sleeper, which permits deterministic retry tests."""
        result = self.sleep(seconds)
        if result is not None:
            await result


def _validate_catalog_id(catalog_id: str) -> str:
    """Validate an identifier without limiting it to legacy five-digit TLE width."""
    return validate_catalog_id(catalog_id)


def celestrak_omm_uri(catalog_id: str) -> str:
    """Build the documented GP JSON query without placing TLE width limits on IDs."""
    normalized_id = _validate_catalog_id(catalog_id)
    return f"{CELESTRAK_GP_URL}?{urlencode({'CATNR': normalized_id, 'FORMAT': 'JSON'})}"


_GROUP_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{1,63}$")


def _validate_group(group: str) -> str:
    """Accept documented CelesTrak group slugs only (e.g. cosmos-1408-debris)."""
    normalized = str(group or "").strip().lower()
    if not _GROUP_PATTERN.match(normalized):
        raise InsufficientDataError(
            "CelesTrak group slug is malformed",
            {"group": group},
        )
    return normalized


def celestrak_group_uri(group: str) -> str:
    """Build the documented GP GROUP JSON query (one request per family)."""
    normalized = _validate_group(group)
    return f"{CELESTRAK_GP_URL}?{urlencode({'GROUP': normalized, 'FORMAT': 'JSON'})}"


def _retry_delay_seconds(attempt: int, retry_after: str | None) -> float:
    """Honor a provider delay when available; otherwise use bounded exponential backoff."""
    if retry_after:
        try:
            return max(0.0, min(float(retry_after), 60.0))
        except ValueError:
            try:
                retry_at = parsedate_to_datetime(retry_after)
            except (TypeError, ValueError):
                retry_at = None
            if retry_at is not None:
                if retry_at.tzinfo is None:
                    retry_at = retry_at.replace(tzinfo=UTC)
                return max(0.0, min((retry_at - datetime.now(UTC)).total_seconds(), 60.0))
    return min(float(2**attempt), 10.0)


def _retry_after_seconds(retry_after: str | None) -> int:
    """Return a nonzero non-secret local cooldown for a terminal 429 response."""
    if retry_after:
        try:
            return max(1, int(float(retry_after)))
        except ValueError:
            try:
                retry_at = parsedate_to_datetime(retry_after)
            except (TypeError, ValueError):
                retry_at = None
            if retry_at is not None:
                if retry_at.tzinfo is None:
                    retry_at = retry_at.replace(tzinfo=UTC)
                return max(1, int((retry_at - datetime.now(UTC)).total_seconds()))
    return 1
