"""Explicit ingestion error states exposed through the API."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class IngestionError(Exception):
    """Base error that never substitutes missing provider data with a value."""

    message: str
    status: str
    details: dict[str, Any] = field(default_factory=dict)

    def to_payload(self) -> dict[str, Any]:
        """Return the contract-safe error representation."""
        return {"status": self.status, "message": self.message, "details": self.details}


class ProviderUnavailableError(IngestionError):
    """The upstream provider could not supply an OMM response."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message=message, status="UNAVAILABLE", details=details or {})


class RateLimitedError(IngestionError):
    """A provider or local policy requires a later retry without exposing credentials."""

    def __init__(self, message: str, retry_after_seconds: int) -> None:
        super().__init__(
            message=message,
            status="RATE_LIMITED",
            details={"retry_after_seconds": retry_after_seconds},
        )


class AuthenticationFailedError(IngestionError):
    """Configured provider credentials were rejected without returning them to callers."""

    def __init__(self, message: str = "Provider authentication failed") -> None:
        super().__init__(message=message, status="AUTH_FAILED")


class IdentityConflictError(IngestionError):
    """Two provider identifiers disagree and require manual canonical resolution."""

    def __init__(self, conflict_id: str) -> None:
        super().__init__(
            message="Provider identity conflicts with an existing canonical object",
            status="IDENTITY_CONFLICT",
            details={"conflict_id": conflict_id},
        )


class UnknownObjectError(IngestionError):
    """A record cannot be associated with a canonical object safely."""

    def __init__(self, message: str = "Canonical object is unavailable") -> None:
        super().__init__(message=message, status="UNKNOWN_OBJECT")


class InsufficientDataError(IngestionError):
    """A response exists but cannot support the requested canonical record."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message=message, status="INSUFFICIENT_DATA", details=details or {})


class OmmParseError(InsufficientDataError):
    """An OMM-compatible payload is structurally insufficient for normalization."""
