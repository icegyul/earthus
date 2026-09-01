"""Provider-neutral ingestion contracts and concrete adapter selection."""

from typing import TYPE_CHECKING

import httpx

from backend.ingestion.errors import ProviderUnavailableError
from backend.ingestion.providers.base import (
    FetchedOmmDocument,
    ObjectSelector,
    OrbitProvider,
    SourcePolicy,
    validate_catalog_id,
)

if TYPE_CHECKING:
    from backend.config import Settings


def provider_for(
    source_id: str,
    settings: "Settings",
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> OrbitProvider:
    """Select an explicit supported source; unknown sources never fall back."""
    from backend.ingestion.providers.celestrak import CELESTRAK_POLICY, CelesTrakProvider
    from backend.ingestion.providers.spacetrack import (
        SPACETRACK_POLICY,
        SpaceTrackCredentials,
        SpaceTrackProvider,
    )

    if source_id == CELESTRAK_POLICY.source_id:
        return CelesTrakProvider(transport=transport)
    if source_id == SPACETRACK_POLICY.source_id:
        return SpaceTrackProvider(
            credentials=SpaceTrackCredentials(
                identity=settings.spacetrack_identity,
                password=settings.spacetrack_password,
            ),
            transport=transport,
        )
    raise ProviderUnavailableError(
        "Requested provider is not configured", {"source_id": source_id}
    )

__all__ = [
    "FetchedOmmDocument",
    "ObjectSelector",
    "OrbitProvider",
    "SourcePolicy",
    "provider_for",
    "validate_catalog_id",
]
