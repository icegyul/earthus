"""CelesTrak GP adapter behind the provider-neutral P1 contract."""

import httpx

from backend.ingestion.celestrak import CelesTrakClient, celestrak_omm_uri
from backend.ingestion.providers.base import FetchedOmmDocument, ObjectSelector, SourcePolicy

CELESTRAK_POLICY = SourcePolicy(
    source_id="celestrak_gp",
    minimum_interval_seconds=7200,
    cache_ttl_seconds=7200,
    requires_authentication=False,
)


class CelesTrakProvider:
    """Expose the P0 raw CelesTrak client through the source-neutral interface."""

    policy = CELESTRAK_POLICY

    def __init__(
        self,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout_seconds: float = 20.0,
        max_retries: int = 2,
    ) -> None:
        self._client = CelesTrakClient(
            transport=transport,
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
        )

    @staticmethod
    def request_uri(selector: ObjectSelector) -> str:
        """Provide the public CelesTrak request URI before network interaction."""
        return celestrak_omm_uri(selector.catalog_id)

    async def fetch_current(self, selector: ObjectSelector) -> FetchedOmmDocument:
        """Fetch exact CelesTrak provider bytes for the validated selector."""
        return await self._client.fetch_omm(selector.catalog_id)
