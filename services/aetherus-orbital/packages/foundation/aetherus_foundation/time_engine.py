from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from aetherus_domain import CanonicalTimeContext, StateKind, TimelineCursor, canonical_hash


class UniversalSpaceTimeEngine:
    id = "E04"
    version = "0.2.0"

    @staticmethod
    def require_aware(value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("naive datetime forbidden")
        return value.astimezone(timezone.utc)

    def now_context(self, now: datetime) -> CanonicalTimeContext:
        return CanonicalTimeContext(mode=StateKind.NOW, cursor_utc=self.require_aware(now))

    def resolve_local(self, local_time: datetime, timezone_name: str, *, mode: StateKind = StateKind.NOW, **kwargs) -> CanonicalTimeContext:
        if local_time.tzinfo is None:
            local_time = local_time.replace(tzinfo=ZoneInfo(timezone_name))
        elif str(local_time.tzinfo) != timezone_name:
            local_time = local_time.astimezone(ZoneInfo(timezone_name))
        return CanonicalTimeContext(
            mode=mode,
            cursor_utc=local_time.astimezone(timezone.utc),
            resolved_from_timezone=timezone_name,
            **kwargs,
        )

    def to_local(self, context: CanonicalTimeContext, timezone_name: str) -> datetime:
        return context.cursor_utc.astimezone(ZoneInfo(timezone_name))

    def replay_cursor(self, context: CanonicalTimeContext) -> TimelineCursor:
        # Deterministic ID makes replay/bookmark behavior reproducible across processes.
        cursor_id = canonical_hash(context.model_dump(mode="json"))[:32]
        return TimelineCursor(cursor_id=cursor_id, context=context)
