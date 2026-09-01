"""Deterministic cache and provider-cooldown behavior."""

from datetime import UTC, datetime

import pytest

from backend.ingestion.providers.base import SourcePolicy
from backend.ingestion.ratelimit import RateLimitCoordinator


class FakeRedis:
    """Small Redis boundary fake: coordinator behavior remains real and deterministic."""

    def __init__(self, *, available: bool = True) -> None:
        self.available = available
        self.values: dict[str, str] = {}

    async def get(self, name: str) -> str | None:
        self._require_available()
        return self.values.get(name)

    async def set(
        self,
        name: str,
        value: str,
        ex: int | None = None,
        nx: bool = False,
    ) -> bool:
        self._require_available()
        if nx and name in self.values:
            return False
        self.values[name] = value
        return True

    def _require_available(self) -> None:
        if not self.available:
            raise ConnectionError("redis is unavailable")


CELESTRAK_POLICY = SourcePolicy(
    source_id="celestrak_gp",
    minimum_interval_seconds=7200,
    cache_ttl_seconds=7200,
    requires_authentication=False,
)
SPACETRACK_POLICY = SourcePolicy(
    source_id="spacetrack_gp",
    minimum_interval_seconds=3600,
    cache_ttl_seconds=0,
    requires_authentication=True,
)
NOW = datetime(2026, 8, 24, 12, 0, tzinfo=UTC)


@pytest.mark.asyncio
async def test_celestrak_cache_hit_makes_zero_provider_calls() -> None:
    coordinator = RateLimitCoordinator(FakeRedis())

    await coordinator.record_success(
        CELESTRAK_POLICY,
        request_fingerprint="celestrak:25544",
        raw_artifact_id="raw-celestrak-1",
        now=NOW,
    )

    decision = await coordinator.acquire(
        CELESTRAK_POLICY, request_fingerprint="celestrak:25544", now=NOW
    )

    assert decision.kind == "CACHE_HIT"
    assert decision.raw_artifact_id == "raw-celestrak-1"


@pytest.mark.asyncio
async def test_spacetrack_floor_blocks_before_network_call() -> None:
    coordinator = RateLimitCoordinator(FakeRedis())

    await coordinator.record_success(
        SPACETRACK_POLICY,
        request_fingerprint="spacetrack:25544",
        raw_artifact_id="raw-spacetrack-1",
        now=NOW,
    )

    decision = await coordinator.acquire(
        SPACETRACK_POLICY, request_fingerprint="spacetrack:25544", now=NOW
    )

    assert decision.kind == "STALE"
    assert decision.raw_artifact_id == "raw-spacetrack-1"
    assert decision.retry_after_seconds == 3600


@pytest.mark.asyncio
async def test_rate_limited_without_reusable_snapshot_is_not_a_live_fetch() -> None:
    coordinator = RateLimitCoordinator(FakeRedis())
    await coordinator.record_rate_limited(
        CELESTRAK_POLICY,
        request_fingerprint="celestrak:99999",
        retry_after_seconds=120,
        now=NOW,
    )

    decision = await coordinator.acquire(
        CELESTRAK_POLICY, request_fingerprint="celestrak:99999", now=NOW
    )

    assert decision.kind == "RATE_LIMITED"
    assert decision.raw_artifact_id is None
    assert decision.retry_after_seconds == 7200


@pytest.mark.asyncio
async def test_redis_failure_never_permits_live_fetch() -> None:
    coordinator = RateLimitCoordinator(FakeRedis(available=False))

    decision = await coordinator.acquire(
        CELESTRAK_POLICY, request_fingerprint="celestrak:25544", now=NOW
    )

    assert decision.kind == "UNAVAILABLE"
    assert decision.raw_artifact_id is None


@pytest.mark.asyncio
async def test_concurrent_request_lock_returns_rate_limited_without_provider_call() -> None:
    coordinator = RateLimitCoordinator(FakeRedis())

    first = await coordinator.acquire(
        CELESTRAK_POLICY, request_fingerprint="celestrak:25544", now=NOW
    )
    second = await coordinator.acquire(
        CELESTRAK_POLICY, request_fingerprint="celestrak:25544", now=NOW
    )

    assert first.kind == "FETCH"
    assert second.kind == "RATE_LIMITED"
    assert second.retry_after_seconds == 30
