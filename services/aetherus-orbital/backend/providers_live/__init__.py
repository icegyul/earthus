"""Credential-free live provider adapters (E10 space weather, E11 NEO, E14 launches).

This package module holds only the shared retrieval core. Submodules import from
here, so nothing is imported eagerly at package init time -- a lazy ``__getattr__``
re-exports the three clients without creating an import cycle.

Every adapter returns the provider's exact bytes alongside the parsed payload so a
caller can prove where a number came from. Nothing here derives, smooths, or
substitutes a value: when a payload cannot support a record the adapter raises an
explicit InsufficientDataError instead of emitting a zero.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
from collections import Counter
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

from backend.ingestion.errors import (
    InsufficientDataError,
    ProviderUnavailableError,
    RateLimitedError,
)

__all__ = [
    "AU_TO_KM",
    "LiveProviderClient",
    "NeoCloseApproachClient",
    "RawResponse",
    "SkippedRow",
    "SpaceWeatherClient",
    "UpcomingLaunchClient",
    "parse_utc_timestamp",
    "skip_summary",
]

# IAU 2012 Resolution B2 defines the astronomical unit as an exact number of metres,
# so the au->km conversion is a definition rather than a measured approximation.
AU_TO_KM = 149_597_870.700

_RETRYABLE_STATUS = frozenset({500, 502, 503, 504})
_NO_RECORD_STATUS = frozenset({400, 404})

# TheSpaceDevs reports its throttle window in the response body rather than a header,
# so a body-side cooldown is worth reading before falling back to a guess.
_BODY_COOLDOWN_PATTERN = re.compile(r"in\s+(\d+(?:\.\d+)?)\s+second", re.IGNORECASE)


@dataclass(frozen=True)
class RawResponse:
    """Exact provider bytes plus the provenance needed to re-verify them later."""

    source_id: str
    source_uri: str
    retrieved_at: datetime
    content: bytes
    raw_sha256: str
    media_type: str
    http_status: int
    from_cache: bool = False

    def provenance(self) -> dict[str, Any]:
        """Return the serializable lineage block attached to every parsed result."""
        return {
            "source_id": self.source_id,
            "source_uri": self.source_uri,
            "retrieved_at": _isoformat(self.retrieved_at),
            "raw_sha256": self.raw_sha256,
            "media_type": self.media_type,
            "http_status": self.http_status,
            "content_bytes": len(self.content),
            "from_cache": self.from_cache,
        }


@dataclass(frozen=True)
class SkippedRow:
    """One rejected input row, kept so a caller can audit what was not parsed."""

    index: int
    reason: str
    detail: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Return the serializable rejection record."""
        return {"index": self.index, "reason": self.reason, "detail": self.detail}


@dataclass
class _CacheEntry:
    """A stored response body and the moment it was retrieved."""

    response: RawResponse
    stored_at: datetime


class LiveProviderClient:
    """Shared bounded-retry HTTP core for the credential-free public providers.

    Retry policy mirrors backend.ingestion.celestrak.CelesTrakClient so operators
    only have to learn one failure vocabulary: 429 hands the cooldown to shared
    policy without a local retry, 5xx retries a bounded number of times and then
    surfaces UNAVAILABLE, and a well-formed "no records" answer is INSUFFICIENT_DATA
    rather than an empty success.
    """

    def __init__(
        self,
        *,
        source_id: str = "live_provider",
        transport: httpx.AsyncBaseTransport | None = None,
        timeout_seconds: float = 15.0,
        max_retries: int = 1,
        cache_ttl_seconds: float = 0.0,
        sleep: Callable[[float], Awaitable[None] | None] = asyncio.sleep,
        user_agent: str = "aetherus-orbital/live-provider (advisory-only)",
    ) -> None:
        self.source_id = source_id
        self.transport = transport
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.cache_ttl_seconds = cache_ttl_seconds
        self.sleep = sleep
        self.user_agent = user_agent
        self._cache: dict[str, _CacheEntry] = {}

    async def fetch_raw(self, source_uri: str, *, source_id: str | None = None) -> RawResponse:
        """Retrieve one URI and return its unmodified bytes with retrieval metadata."""
        resolved_source_id = source_id or self.source_id
        cached = self._cached(source_uri)
        if cached is not None:
            return cached

        request_error: Exception | None = None
        headers = {"Accept": "application/json", "User-Agent": self.user_agent}
        async with httpx.AsyncClient(
            transport=self.transport,
            timeout=self.timeout_seconds,
            follow_redirects=True,
        ) as client:
            for attempt in range(self.max_retries + 1):
                try:
                    response = await client.get(source_uri, headers=headers)
                except httpx.RequestError as error:
                    request_error = error
                    if attempt == self.max_retries:
                        break
                    await self._sleep(_retry_delay_seconds(attempt, None))
                    continue

                if response.status_code == 200:
                    return self._store(_to_raw_response(response, resolved_source_id, source_uri))

                if response.status_code in _NO_RECORD_STATUS:
                    raise InsufficientDataError(
                        "Provider reports no record for the requested query",
                        {
                            "source_id": resolved_source_id,
                            "source_uri": source_uri,
                            "http_status": response.status_code,
                        },
                    )
                if response.status_code == 429:
                    raise RateLimitedError(
                        f"{resolved_source_id} is rate limited",
                        retry_after_seconds=_rate_limit_cooldown_seconds(response),
                    )
                if response.status_code not in _RETRYABLE_STATUS:
                    raise ProviderUnavailableError(
                        "Provider returned an unexpected response",
                        {
                            "source_id": resolved_source_id,
                            "source_uri": source_uri,
                            "http_status": response.status_code,
                        },
                    )
                request_error = ProviderUnavailableError(
                    "Provider is temporarily unavailable",
                    {"source_id": resolved_source_id, "http_status": response.status_code},
                )
                if attempt == self.max_retries:
                    break
                await self._sleep(
                    _retry_delay_seconds(attempt, response.headers.get("retry-after"))
                )

        details: dict[str, Any] = {"source_id": resolved_source_id, "source_uri": source_uri}
        if request_error is not None:
            details["provider_error"] = str(request_error)
        raise ProviderUnavailableError("Provider could not be reached after retrying", details)

    def clear_cache(self) -> None:
        """Drop every cached body so a caller can force a fresh retrieval."""
        self._cache.clear()

    def _cached(self, source_uri: str) -> RawResponse | None:
        """Return a still-fresh cached body, preserving its original retrieval time."""
        if self.cache_ttl_seconds <= 0:
            return None
        entry = self._cache.get(source_uri)
        if entry is None:
            return None
        age_seconds = (datetime.now(UTC) - entry.stored_at).total_seconds()
        if age_seconds >= self.cache_ttl_seconds:
            del self._cache[source_uri]
            return None
        stored = entry.response
        # Provenance keeps the ORIGINAL retrieved_at: a cached read is not a new observation.
        return RawResponse(
            source_id=stored.source_id,
            source_uri=stored.source_uri,
            retrieved_at=stored.retrieved_at,
            content=stored.content,
            raw_sha256=stored.raw_sha256,
            media_type=stored.media_type,
            http_status=stored.http_status,
            from_cache=True,
        )

    def _store(self, response: RawResponse) -> RawResponse:
        """Record a successful body when this provider asks for conservative reuse."""
        if self.cache_ttl_seconds > 0:
            self._cache[response.source_uri] = _CacheEntry(
                response=response, stored_at=datetime.now(UTC)
            )
        return response

    async def _sleep(self, seconds: float) -> None:
        """Await the injected sleeper, which permits deterministic retry tests."""
        result = self.sleep(seconds)
        if result is not None:
            await result


def _to_raw_response(response: httpx.Response, source_id: str, source_uri: str) -> RawResponse:
    """Wrap a 200 response, rejecting an empty body instead of returning nothing."""
    content = response.content
    if not content.strip():
        raise InsufficientDataError(
            "Provider returned an empty response body",
            {"source_id": source_id, "source_uri": source_uri, "http_status": 200},
        )
    media_type = response.headers.get("content-type", "application/octet-stream")
    return RawResponse(
        source_id=source_id,
        source_uri=str(response.url),
        retrieved_at=datetime.now(UTC),
        content=content,
        raw_sha256=hashlib.sha256(content).hexdigest(),
        media_type=media_type.split(";", maxsplit=1)[0].strip().lower(),
        http_status=response.status_code,
    )


def parse_json_document(raw: RawResponse, *, expected: type) -> Any:
    """Decode a JSON body, treating a malformed or mistyped document as insufficient."""
    try:
        document = json.loads(raw.content)
    except (ValueError, UnicodeDecodeError) as error:
        raise InsufficientDataError(
            "Provider response is not decodable JSON",
            {**raw.provenance(), "decode_error": str(error)},
        ) from error
    if not isinstance(document, expected):
        raise InsufficientDataError(
            "Provider response has an unexpected top-level JSON type",
            {**raw.provenance(), "json_type": type(document).__name__},
        )
    return document


def parse_utc_timestamp(value: object) -> datetime | None:
    """Parse an ISO-8601 timestamp, treating an offset-free value as UTC.

    SWPC and LL2 both publish UTC; SWPC omits the offset entirely, so a naive
    string is stamped UTC rather than silently reinterpreted as local time.
    """
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def coerce_float(value: object) -> float | None:
    """Return a finite float, or None when the provider supplied a non-number."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int | float):
        number = float(value)
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            number = float(text)
        except ValueError:
            return None
    else:
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def coerce_int(value: object) -> int | None:
    """Return an int, or None when the provider supplied a non-integer."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    number = coerce_float(value)
    if number is None or number != int(number):
        return None
    return int(number)


def coerce_text(value: object) -> str | None:
    """Return a non-empty stripped string, or None."""
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text or None


def skip_summary(skipped: list[SkippedRow]) -> dict[str, int]:
    """Aggregate rejection reasons so nothing is dropped without an accounting."""
    return dict(Counter(row.reason for row in skipped))


def result_status(parsed_count: int, skipped_count: int) -> str:
    """Report PARTIAL whenever rows were rejected, so a caller never assumes completeness."""
    return "PARTIAL" if skipped_count else "OK"


def _isoformat(moment: datetime) -> str:
    """Render a UTC instant in the contract's Zulu form."""
    return moment.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _rate_limit_cooldown_seconds(response: httpx.Response) -> int:
    """Prefer the provider's own cooldown over a locally invented one."""
    header = _retry_after_seconds(response.headers.get("retry-after"))
    if header is not None:
        return header
    try:
        body = response.text
    except (UnicodeDecodeError, httpx.ResponseNotRead):
        return 1
    match = _BODY_COOLDOWN_PATTERN.search(body)
    if match:
        return max(1, int(float(match.group(1))))
    return 1


def _retry_after_seconds(retry_after: str | None) -> int | None:
    """Read a Retry-After header in either delta-seconds or HTTP-date form."""
    if not retry_after:
        return None
    try:
        return max(1, int(float(retry_after)))
    except ValueError:
        pass
    try:
        retry_at = parsedate_to_datetime(retry_after)
    except (TypeError, ValueError):
        return None
    if retry_at is None:
        return None
    if retry_at.tzinfo is None:
        retry_at = retry_at.replace(tzinfo=UTC)
    return max(1, int((retry_at - datetime.now(UTC)).total_seconds()))


def _retry_delay_seconds(attempt: int, retry_after: str | None) -> float:
    """Honor a provider delay when available; otherwise use bounded exponential backoff."""
    header = _retry_after_seconds(retry_after)
    if header is not None:
        return float(min(header, 60))
    return min(float(2**attempt), 10.0)


_LAZY_EXPORTS = {
    "NeoCloseApproachClient": "backend.providers_live.neo",
    "SpaceWeatherClient": "backend.providers_live.space_weather",
    "UpcomingLaunchClient": "backend.providers_live.launches",
}


def __getattr__(name: str) -> Any:
    """Expose the three clients from the package root without an import cycle."""
    module_path = _LAZY_EXPORTS.get(name)
    if module_path is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    import importlib

    return getattr(importlib.import_module(module_path), name)
