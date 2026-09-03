"""Explicit conjunction-domain error states; failed assessments never yield values."""

from backend.ingestion.errors import IngestionError


class ScreeningInvalidError(IngestionError):
    """The requested screening window or configuration violates the contract."""

    def __init__(self, message: str, details: dict | None = None) -> None:
        super().__init__(message=message, status="SCREEN_INVALID", details=details or {})


class ScreeningBudgetExceeded(IngestionError):
    """The requested run is larger than this deployment will start.

    A caller who asks for too much has made a request error, not caused a server
    fault, and needs to be told what to reduce. Raising a bare ValueError here
    produced a 500 with no numbers in it, which tells the caller nothing.
    """

    def __init__(self, message: str, details: dict | None = None) -> None:
        super().__init__(
            message=message, status="SCREEN_BUDGET_EXCEEDED", details=details or {}
        )


class ConjunctionValidationError(IngestionError):
    """A conjunctions API query violated the published parameter contract."""

    def __init__(self, message: str, details: dict | None = None) -> None:
        super().__init__(message=message, status="INVALID_PARAMETER", details=details or {})
