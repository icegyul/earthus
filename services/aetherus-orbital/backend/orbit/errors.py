"""Explicit orbit-domain error states; no failed computation ever yields a value."""

from dataclasses import dataclass
from typing import Any

from backend.ingestion.errors import IngestionError


@dataclass
class PropagationError(IngestionError):
    """SGP4 could not produce a finite state for the requested sample time."""

    def __init__(
        self,
        message: str,
        details: dict[str, Any] | None = None,
        status: str = "QUARANTINE",
    ) -> None:
        super().__init__(message=message, status=status, details=details or {})


@dataclass
class EphemerisValidationError(IngestionError):
    """The requested ephemeris window violates the published API contract."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message=message, status="INVALID_WINDOW", details=details or {})
