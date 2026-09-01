"""Provider-neutral boundaries for immutable GP/OMM retrieval."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol

from backend.ingestion.errors import InsufficientDataError


def validate_catalog_id(value: object) -> str:
    """Keep a catalog identifier as its supplied one-to-nine digit decimal string."""
    if not isinstance(value, str) or not value.isdecimal() or not 1 <= len(value) <= 9:
        raise InsufficientDataError("catalog_id must be a 1-9 digit decimal string")
    return value


@dataclass(frozen=True)
class ObjectSelector:
    """One public GP/OMM selection without integer coercion or TLE-width assumptions."""

    catalog_id: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "catalog_id", validate_catalog_id(self.catalog_id))


@dataclass(frozen=True)
class SourcePolicy:
    """Provider-owned cache and request-floor settings."""

    source_id: str
    minimum_interval_seconds: int
    cache_ttl_seconds: int
    requires_authentication: bool


@dataclass(frozen=True)
class FetchedOmmDocument:
    """Exact provider bytes plus sanitized retrieval metadata before parsing."""

    source_id: str
    source_uri: str
    retrieved_at: datetime
    content: bytes
    media_type: str
    http_status: int = 200
    request_metadata: dict[str, Any] = field(default_factory=dict)


class OrbitProvider(Protocol):
    """One source adapter that returns bytes unchanged for a selected catalog ID."""

    policy: SourcePolicy

    def request_uri(self, selector: ObjectSelector) -> str:
        """Return the secret-free GP request URI used for run provenance."""

    async def fetch_current(self, selector: ObjectSelector) -> FetchedOmmDocument:
        """Retrieve the provider's current GP/OMM document without normalization."""
