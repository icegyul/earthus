"""Redis-backed provider cache and cooldown coordination.

PostgreSQL remains durable truth.  This module only decides whether a provider
request may begin; a caller must verify any returned raw-artifact pointer
against PostgreSQL before serving a stale result.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Awaitable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal, Protocol

from backend.ingestion.providers.base import SourcePolicy

DecisionKind = Literal["FETCH", "CACHE_HIT", "STALE", "RATE_LIMITED", "UNAVAILABLE"]


class AsyncRedis(Protocol):
    """The small async Redis surface used by policy coordination."""

    def get(self, name: str) -> Awaitable[Any] | Any:
        """Read one coordination value."""

    def set(
        self,
        name: str,
        value: str,
        ex: int | None = None,
        nx: bool = False,
    ) -> Awaitable[Any] | Any:
        """Write one coordination value, optionally only when absent."""


@dataclass(frozen=True)
class PolicyDecision:
    """A secret-free policy outcome before provider interaction."""

    kind: DecisionKind
    raw_artifact_id: str | None = None
    retry_after_seconds: int | None = None


@dataclass(frozen=True)
class _CachedArtifact:
    """Redis pointer metadata, not an authoritative raw-artifact record."""

    raw_artifact_id: str
    expires_at: datetime


class RateLimitCoordinator:
    """Fail closed when Redis cannot establish cache or cooldown policy."""

    def __init__(self, redis: AsyncRedis, *, lock_ttl_seconds: int = 30) -> None:
        if lock_ttl_seconds < 1:
            raise ValueError("lock_ttl_seconds must be positive")
        self._redis = redis
        self._lock_ttl_seconds = lock_ttl_seconds

    async def acquire(
        self,
        policy: SourcePolicy,
        request_fingerprint: str,
        now: datetime,
    ) -> PolicyDecision:
        """Return a no-network decision or acquire a short fetch lock.

        A cache entry is a candidate only; it becomes a result after the
        ingestion service confirms the raw artifact is still present in
        PostgreSQL.  Redis failure is never interpreted as permission to fetch.
        """
        current_time = _utc(now)
        try:
            cached = await self._read_latest(policy, request_fingerprint)
            if cached is not None and cached.expires_at > current_time:
                return PolicyDecision("CACHE_HIT", raw_artifact_id=cached.raw_artifact_id)

            cooldown = await self._read_cooldown(policy, request_fingerprint)
            if cooldown is not None and cooldown > current_time:
                retry_after_seconds = _ceil_seconds(cooldown - current_time)
                if cached is not None:
                    return PolicyDecision(
                        "STALE",
                        raw_artifact_id=cached.raw_artifact_id,
                        retry_after_seconds=retry_after_seconds,
                    )
                return PolicyDecision("RATE_LIMITED", retry_after_seconds=retry_after_seconds)

            lock_acquired = await self._redis.set(
                self._lock_key(policy, request_fingerprint),
                "1",
                ex=self._lock_ttl_seconds,
                nx=True,
            )
        except Exception:
            return PolicyDecision("UNAVAILABLE")

        if lock_acquired:
            return PolicyDecision("FETCH")
        return PolicyDecision("RATE_LIMITED", retry_after_seconds=self._lock_ttl_seconds)

    async def record_success(
        self,
        policy: SourcePolicy,
        request_fingerprint: str,
        raw_artifact_id: str,
        now: datetime,
    ) -> None:
        """Publish a raw-artifact pointer and enforce the provider request floor."""
        if not raw_artifact_id:
            raise ValueError("raw_artifact_id is required")
        current_time = _utc(now)
        expires_at = current_time + timedelta(seconds=policy.cache_ttl_seconds)
        await self._write_latest(policy, request_fingerprint, raw_artifact_id, expires_at)
        await self._write_cooldown(
            policy,
            request_fingerprint,
            current_time + timedelta(seconds=policy.minimum_interval_seconds),
        )

    async def record_rate_limited(
        self,
        policy: SourcePolicy,
        request_fingerprint: str,
        retry_after_seconds: int,
        now: datetime,
    ) -> None:
        """Preserve any existing raw pointer and extend the next permitted time."""
        if retry_after_seconds < 1:
            raise ValueError("retry_after_seconds must be positive")
        seconds = max(retry_after_seconds, policy.minimum_interval_seconds)
        await self._write_cooldown(
            policy,
            request_fingerprint,
            _utc(now) + timedelta(seconds=seconds),
        )

    async def record_unavailable(
        self,
        policy: SourcePolicy,
        request_fingerprint: str,
        now: datetime,
    ) -> None:
        """Avoid a tight loop after an attempted provider request is unavailable."""
        await self._write_cooldown(
            policy,
            request_fingerprint,
            _utc(now) + timedelta(seconds=policy.minimum_interval_seconds),
        )

    async def _read_latest(
        self, policy: SourcePolicy, request_fingerprint: str
    ) -> _CachedArtifact | None:
        value = await self._redis.get(self._latest_key(policy, request_fingerprint))
        if value is None:
            return None
        decoded = _decode_json(value)
        raw_artifact_id = decoded.get("raw_artifact_id")
        expires_at = _parse_timestamp(decoded.get("expires_at"))
        if not isinstance(raw_artifact_id, str) or not raw_artifact_id:
            raise ValueError("cached raw artifact pointer is invalid")
        return _CachedArtifact(raw_artifact_id=raw_artifact_id, expires_at=expires_at)

    async def _read_cooldown(
        self, policy: SourcePolicy, request_fingerprint: str
    ) -> datetime | None:
        value = await self._redis.get(self._cooldown_key(policy, request_fingerprint))
        if value is None:
            return None
        return _parse_timestamp(_decode_json(value).get("next_permitted_at"))

    async def _write_latest(
        self,
        policy: SourcePolicy,
        request_fingerprint: str,
        raw_artifact_id: str,
        expires_at: datetime,
    ) -> None:
        retention_seconds = max(
            1,
            policy.minimum_interval_seconds,
            policy.cache_ttl_seconds,
            self._lock_ttl_seconds,
        ) * 2
        value = json.dumps(
            {
                "raw_artifact_id": raw_artifact_id,
                "expires_at": _utc(expires_at).isoformat(),
            },
            separators=(",", ":"),
            sort_keys=True,
        )
        written = await self._redis.set(
            self._latest_key(policy, request_fingerprint),
            value,
            ex=retention_seconds,
        )
        if written is False:
            raise RuntimeError("redis declined cached artifact pointer")

    async def _write_cooldown(
        self,
        policy: SourcePolicy,
        request_fingerprint: str,
        next_permitted_at: datetime,
    ) -> None:
        retention_seconds = max(
            1,
            policy.minimum_interval_seconds,
            self._lock_ttl_seconds,
        ) * 2
        value = json.dumps(
            {"next_permitted_at": _utc(next_permitted_at).isoformat()},
            separators=(",", ":"),
            sort_keys=True,
        )
        written = await self._redis.set(
            self._cooldown_key(policy, request_fingerprint),
            value,
            ex=retention_seconds,
        )
        if written is False:
            raise RuntimeError("redis declined provider cooldown")

    @staticmethod
    def _prefix(policy: SourcePolicy, request_fingerprint: str) -> str:
        if not request_fingerprint:
            raise ValueError("request_fingerprint is required")
        digest = hashlib.sha256(request_fingerprint.encode("utf-8")).hexdigest()
        return f"aetherus:p1:ingestion:{policy.source_id}:{digest}"

    def _latest_key(self, policy: SourcePolicy, request_fingerprint: str) -> str:
        return f"{self._prefix(policy, request_fingerprint)}:latest"

    def _cooldown_key(self, policy: SourcePolicy, request_fingerprint: str) -> str:
        return f"{self._prefix(policy, request_fingerprint)}:next-permitted-at"

    def _lock_key(self, policy: SourcePolicy, request_fingerprint: str) -> str:
        return f"{self._prefix(policy, request_fingerprint)}:lock"


def _decode_json(value: str | bytes) -> dict[str, object]:
    """Reject corrupt Redis state instead of treating it as an allowed fetch."""
    decoded = value.decode("utf-8") if isinstance(value, bytes) else value
    parsed = json.loads(decoded)
    if not isinstance(parsed, dict):
        raise ValueError("coordination value is not an object")
    return parsed


def _parse_timestamp(value: object) -> datetime:
    if not isinstance(value, str):
        raise ValueError("coordination timestamp is missing")
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise ValueError("coordination timestamp must include an offset")
    return parsed.astimezone(UTC)


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise ValueError("policy time must include an offset")
    return value.astimezone(UTC)


def _ceil_seconds(value: timedelta) -> int:
    return max(1, int(value.total_seconds() + 0.999999))
