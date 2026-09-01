"""Opt-in proof that P1 received and persisted live provider responses.

The test is skipped by default.  Setting P1_RUN_LIVE_PROVIDER_TESTS=1 is a
deliberate operator action: it permits exactly one fresh request per provider
for the supplied catalog ID. If a parser correction follows a failed parse, the
test reprocesses that exact durable snapshot instead of making another request.
Credentials stay in ignored local environment variables and are never asserted,
printed, or serialized.
"""

from __future__ import annotations

import os

import pytest

from backend.ingestion.errors import IngestionError, ProviderUnavailableError
from backend.ingestion.providers.base import ObjectSelector
from backend.ingestion.repository import SqlIngestionRepository
from backend.main import get_ingestion_service
from backend.tools.generate_evidence import check_p1_live_provider

_LIVE_SOURCE_URI_PREFIXES = {
    "celestrak_gp": "https://celestrak.org/NORAD/elements/gp.php",
    "spacetrack_gp": "https://www.space-track.org/basicspacedata/query",
}


def _live_catalog_id() -> str:
    """Require an explicit legal catalog ID instead of selecting one in test code."""
    if os.getenv("P1_RUN_LIVE_PROVIDER_TESTS") != "1":
        pytest.skip("live provider evidence is opt-in; P1_RUN_LIVE_PROVIDER_TESTS is not 1")
    supplied = os.getenv("P1_LIVE_CATALOG_ID", "")
    if not supplied:
        pytest.fail("P1_LIVE_CATALOG_ID is required when live provider evidence is enabled")
    return ObjectSelector(supplied).catalog_id


async def _provider_is_already_proven(source_id: str) -> bool:
    """Avoid a duplicate network request when durable live evidence already exists."""
    evidence = await check_p1_live_provider(source_id, _LIVE_SOURCE_URI_PREFIXES[source_id])
    return evidence.get("passed") is True


async def _ingest_and_mark_live_proof(source_id: str) -> None:
    """Use a fresh provider response once, or replay its existing immutable snapshot."""
    catalog_id = _live_catalog_id()
    service = get_ingestion_service()
    result = await service.reprocess_latest_unparsed_raw(source_id, catalog_id)
    if result is None:
        result = await service.ingest(source_id, catalog_id)
        assert result.cache_status == "MISS", (
            "A live provider proof must not be satisfied by a cache or stale reuse"
        )
    else:
        assert result.cache_status == "REPROCESSED"
    assert result.source_id == source_id
    assert result.raw_artifact.content_sha256
    assert result.record.covariance is None
    await SqlIngestionRepository().mark_live_provider_proof(result.ingestion_run_id)


@pytest.mark.integration
@pytest.mark.live_provider
async def test_spacetrack_live_response_has_durable_p1_evidence() -> None:
    """Require local credentials before the one permitted Space-Track proof request."""
    if await _provider_is_already_proven("spacetrack_gp"):
        pytest.skip("a durable Space-Track live proof already exists; no second request is allowed")
    try:
        await _ingest_and_mark_live_proof("spacetrack_gp")
    except ProviderUnavailableError as error:
        if os.getenv("P1_EXPECT_SPACETRACK_UNAVAILABLE") == "1":
            assert error.details == {"reason": "AUTH_REQUIRED_NOT_CONFIGURED"}
            return
        pytest.fail(f"spacetrack_gp live provider proof did not complete: {error.status}")
    except IngestionError as error:
        pytest.fail(f"spacetrack_gp live provider proof did not complete: {error.status}")


@pytest.mark.integration
@pytest.mark.live_provider
async def test_celestrak_live_response_has_durable_p1_evidence() -> None:
    """Store one real CelesTrak response only after credential-negative proof is complete."""
    if await _provider_is_already_proven("celestrak_gp"):
        pytest.skip("a durable CelesTrak live proof already exists; no second request is allowed")
    if os.getenv("P1_EXPECT_SPACETRACK_UNAVAILABLE") == "1":
        pytest.skip("credential-negative proof deliberately makes no CelesTrak request")
    try:
        await _ingest_and_mark_live_proof("celestrak_gp")
    except IngestionError as error:
        pytest.fail(f"celestrak_gp live provider proof did not complete: {error.status}")
