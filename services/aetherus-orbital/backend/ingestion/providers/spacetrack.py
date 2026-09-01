"""Redacted authenticated Space-Track GP provider adapter."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from urllib.parse import quote

import httpx
from pydantic import SecretStr

from backend.ingestion.errors import (
    AuthenticationFailedError,
    InsufficientDataError,
    ProviderUnavailableError,
    RateLimitedError,
)
from backend.ingestion.providers.base import FetchedOmmDocument, ObjectSelector, SourcePolicy

SPACETRACK_LOGIN_URL = "https://www.space-track.org/ajaxauth/login"
SPACETRACK_QUERY_ROOT = "https://www.space-track.org/basicspacedata/query"
SPACETRACK_POLICY = SourcePolicy(
    source_id="spacetrack_gp",
    minimum_interval_seconds=3600,
    cache_ttl_seconds=3600,
    requires_authentication=True,
)


@dataclass(frozen=True)
class SpaceTrackCredentials:
    """Locally configured credentials, kept out of provider results and errors."""

    identity: SecretStr | None
    password: SecretStr | None

    def require(self) -> tuple[str, str]:
        """Return only configured nonempty credentials, otherwise make no request."""
        identity = self.identity.get_secret_value() if self.identity is not None else ""
        password = self.password.get_secret_value() if self.password is not None else ""
        if not identity or not password:
            raise ProviderUnavailableError(
                "AUTH_REQUIRED_NOT_CONFIGURED",
                {"reason": "AUTH_REQUIRED_NOT_CONFIGURED"},
            )
        return identity, password


class SpaceTrackProvider:
    """Fetch one latest GP JSON document through a short-lived authenticated session."""

    policy = SPACETRACK_POLICY

    def __init__(
        self,
        *,
        credentials: SpaceTrackCredentials,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout_seconds: float = 20.0,
    ) -> None:
        self._credentials = credentials
        self._transport = transport
        self._timeout_seconds = timeout_seconds

    @staticmethod
    def request_uri(selector: ObjectSelector) -> str:
        """Provide a credential-free Space-Track GP query URI for run provenance."""
        return spacetrack_gp_uri(selector.catalog_id)

    async def fetch_current(self, selector: ObjectSelector) -> FetchedOmmDocument:
        """Log in, query one GP record, and retain only exact response bytes."""
        identity, password = self._credentials.require()
        query_uri = spacetrack_gp_uri(selector.catalog_id)
        async with httpx.AsyncClient(
            transport=self._transport,
            timeout=self._timeout_seconds,
            follow_redirects=True,
        ) as client:
            try:
                login = await client.post(
                    SPACETRACK_LOGIN_URL,
                    data={"identity": identity, "password": password},
                )
                self._raise_for_login_failure(login)
                response = await client.get(query_uri, headers={"Accept": "application/json"})
            except httpx.RequestError as error:
                raise ProviderUnavailableError(
                    "Space-Track could not be reached", {"provider": "spacetrack_gp"}
                ) from error

        return self._document_or_raise(response, selector)

    @staticmethod
    def _raise_for_login_failure(response: httpx.Response) -> None:
        if response.status_code in {401, 403}:
            raise AuthenticationFailedError("Space-Track authentication failed")
        if response.status_code == 429:
            raise RateLimitedError(
                "Space-Track login is rate limited",
                retry_after_seconds=_retry_after_seconds(response.headers.get("retry-after")),
            )
        if response.is_error:
            raise ProviderUnavailableError(
                "Space-Track login is unavailable",
                {"http_status": response.status_code},
            )

    @staticmethod
    def _document_or_raise(response: httpx.Response, selector: ObjectSelector) -> FetchedOmmDocument:
        if response.status_code == 200:
            if not response.content.strip():
                raise InsufficientDataError(
                    "Space-Track returned an empty GP response",
                    {"catalog_id": selector.catalog_id, "source_id": "spacetrack_gp"},
                )
            content_type = response.headers.get("content-type", "application/octet-stream")
            return FetchedOmmDocument(
                source_id="spacetrack_gp",
                source_uri=str(response.url),
                retrieved_at=datetime.now(UTC),
                content=response.content,
                media_type=content_type.split(";", maxsplit=1)[0].lower(),
                http_status=response.status_code,
                request_metadata={"format": "json"},
            )
        if response.status_code in {400, 404}:
            raise InsufficientDataError(
                "Space-Track has no GP record for the requested catalog ID",
                {"catalog_id": selector.catalog_id, "http_status": response.status_code},
            )
        if response.status_code in {401, 403}:
            raise AuthenticationFailedError("Space-Track authentication failed")
        if response.status_code == 429:
            raise RateLimitedError(
                "Space-Track GP query is rate limited",
                retry_after_seconds=_retry_after_seconds(response.headers.get("retry-after")),
            )
        raise ProviderUnavailableError(
            "Space-Track returned an unexpected provider response",
            {"http_status": response.status_code},
        )


def spacetrack_gp_uri(catalog_id: str) -> str:
    """Build one latest GP JSON query without any legacy TLE-width assumption."""
    safe_catalog_id = quote(ObjectSelector(catalog_id).catalog_id, safe="")
    return (
        f"{SPACETRACK_QUERY_ROOT}/class/gp/NORAD_CAT_ID/{safe_catalog_id}"
        "/orderby/EPOCH%20desc/limit/1/format/json"
    )


def _retry_after_seconds(retry_after: str | None) -> int:
    """Return a positive policy cooldown without retaining response bodies."""
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
    return SPACETRACK_POLICY.minimum_interval_seconds
