# -*- coding: utf-8 -*-
"""승인본 예약 방출 — SNS FACTORY 신규 모듈 (독립 구현).

하는 일 하나
  APPROVED 이고 예약 시각이 지난 콘텐츠를 큐행( QUEUED ) 의도로 넘긴다.
  그 이상은 안 한다. 발행도, 승인도 여기서 하지 않는다.

지키는 순서
  DRAFT → HUMAN APPROVAL → APPROVED → SCHEDULED → QUEUED →
  PUBLISHING → PUBLISHED. 이 파일은 APPROVED→SCHEDULED→QUEUED
  구간만 다룬다. DRAFT 가 들어오면 BLOCKED 로 돌려보낸다.

안전장치
  · APPROVED 만 받는다. 나머지는 이유와 함께 거부한다.
  · 예약 시각이 안 지난 것은 건드리지 않는다(미래 예약).
  · 같은 (콘텐츠·플랫폼·예약시각)은 한 번만 내보낸다 — seen_keys 로 막는다.
    publish_queue.is_queued() 와 같이 쓰면 큐에 이미 있어도 막힌다.
  · 이미 PUBLISHED 인 것은 다시 만들지 않는다.
  · 실패를 PUBLISHED 로 바꾸는 경로는 없다 — 이 파일에 그런 함수가 없다.

시각
  내부는 UTC ISO 로 저장·비교한다(기존 큐와 같은 규칙).
  표시는 Asia/Seoul 이 기본이다. to_kst() 는 표시용이다.
"""
from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

RELEASE_SCHEMA = "earthus.scheduled-release.v1"

DISPLAY_TZ = "Asia/Seoul"

# 방출을 거부하는 상태와 그 이유. 승인 없음이 전부다.
REJECT_REASONS = {
    "DRAFT": "승인되지 않았다",
    "FACT_CHECK": "검증 중이다 — 승인이 아니다",
    "REVIEW": "검토 중이다 — 승인이 아니다",
    "REJECTED": "사람이 아니라고 했다",
    "REVISION_REQUIRED": "고쳐서 다시 내야 한다",
    "PUBLISHED": "이미 발행됐다 — 판을 올려야 한다",
    "ARCHIVED": "물러난 판이다 — 새 판을 올려야 한다",
}


def _now_utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse(iso):
    try:
        t = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except (ValueError, TypeError, AttributeError):
        return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return t


def to_kst(iso):
    """표시용. 저장은 UTC 그대로 둔다."""
    t = _parse(iso)
    if t is None or ZoneInfo is None:
        return iso
    try:
        return t.astimezone(ZoneInfo(DISPLAY_TZ)).strftime("%Y-%m-%d %H:%M KST")
    except Exception:
        return iso


def release_key(content_id, platform, scheduled_at):
    """멱등키. 어댑터 멱등키와는 다른 층이다 — 여기는 방출 중복 방지용이다."""
    return "REL:%s:%s:%s" % (content_id, platform, scheduled_at)


def releasable(content, *, now=None):
    """이 콘텐츠가 지금 방출 대상인가. (가능, 사유)."""
    now = now or _now_utc()
    status = content.get("status")
    if status == "SCHEDULED":
        pass
    elif status == "APPROVED":
        pass
    else:
        return (False, REJECT_REASONS.get(status, "승인된 상태가 아니다"))
    scheduled_at = content.get("scheduledAt")
    if not scheduled_at:
        return (False, "예약 시각이 없다 — 승인만 된 것은 방출하지 않는다")
    if _parse(scheduled_at) is None:
        return (False, "예약 시각을 읽을 수 없다")
    if scheduled_at > now:
        return (False, "예약 시각이 아직 안 됐다")
    return (True, None)


def release_due(contents, *, now=None, seen_keys=(), queued_keys=()):
    """방출 의도 목록을 만든다. 같은 키는 한 번만.

    seen_keys   이번 실행에서 이미 낸 키 (호출자가 들고 있는 집합)
    queued_keys 큐에 이미 있는 키 (publish_queue.queue_key 로 만든 것)
    """
    now = now or _now_utc()
    seen = set(seen_keys) | set(queued_keys)
    intents = []
    skipped = []
    for c in contents or []:
        for platform in c.get("platforms") or []:
            key = release_key(c.get("contentId"), platform,
                              c.get("scheduledAt"))
            if key in seen:
                skipped.append({"key": key, "reason": "이미 방출됐다"})
                continue
            ok, reason = releasable(c, now=now)
            if not ok:
                skipped.append({"key": key, "reason": reason})
                continue
            seen.add(key)
            intents.append({
                "schemaVersion": RELEASE_SCHEMA,
                "releaseKey": key,
                "contentId": c.get("contentId"),
                "platform": platform,
                "scheduledAt": c.get("scheduledAt"),
                "scheduledAtKst": to_kst(c.get("scheduledAt")),
                "priority": c.get("priority"),
                "releasedAt": now,
            })
    return {"releasedAt": now, "intents": intents, "skipped": skipped}


def intent_to_enqueue(intent):
    """publish_queue.enqueue() 에 넘길 최소 모양. 상태 전이는 큐가 한다."""
    return {
        "contentId": intent["contentId"],
        "platform": intent["platform"],
        "scheduledAt": intent["scheduledAt"],
        "releaseKey": intent["releaseKey"],
    }
