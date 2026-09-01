"""Explicit conjunction-domain error states; failed assessments never yield values."""

from backend.ingestion.errors import IngestionError


class ScreeningInvalidError(IngestionError):
    """The requested screening window or configuration violates the contract."""

    def __init__(self, message: str, details: dict | None = None) -> None:
        super().__init__(message=message, status="SCREEN_INVALID", details=details or {})


class ConjunctionValidationError(IngestionError):
    """A conjunctions API query violated the published parameter contract."""

    def __init__(self, message: str, details: dict | None = None) -> None:
        super().__init__(message=message, status="INVALID_PARAMETER", details=details or {})
