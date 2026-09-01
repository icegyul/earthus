"""Explicit benefit-domain error states; failed runs never yield values."""

from backend.ingestion.errors import IngestionError


class BaselineMissingError(IngestionError):
    """No usable baseline risk graph exists for the requested scenario."""

    def __init__(self, message: str, details: dict | None = None) -> None:
        super().__init__(message=message, status="BASELINE_MISSING", details=details or {})


class ScenarioInvalidError(IngestionError):
    """The scenario request violates the published P5 contract (422)."""

    def __init__(self, message: str, details: dict | None = None) -> None:
        super().__init__(message=message, status="SCENARIO_INVALID", details=details or {})


class ScenarioNotFoundError(IngestionError):
    """The requested scenario identifier does not exist (404)."""

    def __init__(self, message: str = "Scenario is unavailable") -> None:
        super().__init__(message=message, status="SCENARIO_NOT_FOUND")


class BenefitsNotReadyError(IngestionError):
    """No SUCCEEDED run exists yet for the benefits query (409)."""

    def __init__(self, message: str = "Scenario has not completed a benefit run") -> None:
        super().__init__(message=message, status="BENEFITS_NOT_READY")
