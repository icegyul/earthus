"""Provider-boundary contracts that later adapters must share."""

from datetime import UTC, datetime

from backend.ingestion.errors import RateLimitedError
from backend.ingestion.providers.base import FetchedOmmDocument, SourcePolicy


def test_rate_limited_error_exposes_only_a_retry_interval() -> None:
    """A local/provider throttle must return a stable non-secret public error shape."""
    payload = RateLimitedError("limited", retry_after_seconds=3600).to_payload()

    assert payload == {
        "status": "RATE_LIMITED",
        "message": "limited",
        "details": {"retry_after_seconds": 3600},
    }


def test_fetched_document_retains_exact_provider_bytes_and_sanitized_request_metadata() -> None:
    """Persistence must receive provider bytes unchanged plus safe, non-credential provenance."""
    retrieved_at = datetime(2026, 8, 24, tzinfo=UTC)
    document = FetchedOmmDocument(
        source_id="celestrak_gp",
        source_uri="https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=JSON",
        retrieved_at=retrieved_at,
        content=b'[{"NORAD_CAT_ID":"25544"}]',
        media_type="application/json",
        http_status=200,
        request_metadata={"request_fingerprint": "sha256:test"},
    )

    assert document.content == b'[{"NORAD_CAT_ID":"25544"}]'
    assert document.request_metadata == {"request_fingerprint": "sha256:test"}
    assert document.retrieved_at is retrieved_at


def test_source_policy_keeps_provider_specific_cache_and_floor_rules() -> None:
    """A provider cannot silently share another provider's cache or request interval."""
    policy = SourcePolicy(
        source_id="spacetrack_gp",
        minimum_interval_seconds=3600,
        cache_ttl_seconds=3600,
        requires_authentication=True,
    )

    assert policy.source_id == "spacetrack_gp"
    assert policy.minimum_interval_seconds == 3600
    assert policy.cache_ttl_seconds == 3600
    assert policy.requires_authentication is True
