"""Explicit explore-domain request errors surfaced through the API envelope."""

from backend.ingestion.errors import IngestionError


class CatalogViewportError(IngestionError):
    """A catalog snapshot query violates the published viewport contract."""

    def __init__(self, message: str) -> None:
        super().__init__(message=message, status="INVALID_WINDOW", details={})
