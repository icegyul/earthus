# -*- coding: utf-8 -*-
"""발행 큐 — 지시서 §28 · §29 · §79 · §113 · §114 · §132.

큐는 **승인된 것만** 받는다. DRAFT 를 큐에 넣을 수 없다 —
그러면 리뷰가 장식이 되고, 실수로 미검증 콘텐츠가 나간다.

재시도 규칙(§29 · §113)
  · 영구 실패는 재시도하지 않는다. 토큰 만료를 100번 시도해도 만료다.
  · 일시 실패만 지수 백오프로 다시 한다. 상한이 있고, 넘으면 FAILED 로 남긴다.
  · 플랫폼이 이미 발행을 확인했으면 절대 다시 보내지 않는다 — 멱등키가 그걸 막는다.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_shared"))
import content_contract as cc                      # noqa: E402
from sns_adapters.base import TEMPORARY, PERMANENT     # noqa: E402

QUEUE_SCHEMA = "earthus.publish-queue.v1"

# §28 상태
QUEUE_STATUS = ("QUEUED", "PROCESSING", "PUBLISHED", "FAILED", "CANCELLED")

# §29 재시도 — 분 단위. 다섯 번째에 포기한다.
BACKOFF_MINUTES = (1, 5, 20, 60)
MAX_ATTEMPTS = len(BACKOFF_MINUTES) + 1

# §79 스케줄 — 페이지 로직에 박아 넣지 않는다. 설정층이 여기다.
SCHEDULES = {
    "EARTH_TODAY":     {"cadence": "DAILY",     "cron": "0 21 * * *",   "tz": "UTC", "note": "KST 06:00"},
    "EARTH_WEEKLY":    {"cadence": "WEEKLY",    "cron": "0 21 * * SUN", "tz": "UTC", "note": "KST 월 06:00"},
    "MONTHLY_EARTH":   {"cadence": "MONTHLY",   "cron": "0 1 3 * *",    "tz": "UTC", "note": "다음달 3일 — 전월 자료가 굳은 뒤"},
    "QUARTERLY_EARTH": {"cadence": "QUARTERLY", "cron": "0 1 5 1,4,7,10 *", "tz": "UTC"},
    "ANNUAL_EARTH":    {"cadence": "ANNUAL",    "cron": "0 1 10 1 *",   "tz": "UTC"},
}
# ⚠️ 이 표는 **언제 만들지**를 정한다. **언제 올릴지**가 아니다.
#    올리는 것은 사람이 승인한 뒤에만 일어난다(§80).


class QueueError(RuntimeError):
    pass


def enqueue(content, platform_version, *, scheduled_at, priority=None, queue_id=None):
    """§28 — 승인된 콘텐츠만 큐에 들어간다."""
    if content.get("status") not in ("APPROVED", "SCHEDULED"):
        raise QueueError(f"승인되지 않은 콘텐츠는 큐에 넣을 수 없다 (지금 {content.get('status')})")
    if content.get("eligibility") == "BLOCKED":
        raise QueueError(f"차단된 콘텐츠다: {content.get('blockReasons')}")
    if platform_version.get("masterContentId") != content.get("contentId"):
        raise QueueError("다른 콘텐츠의 플랫폼 판이다")
    platform = platform_version.get("platform")
    if platform not in cc.PLATFORMS:
        raise QueueError(f"알 수 없는 플랫폼: {platform}")
    return {
        "schemaVersion": QUEUE_SCHEMA,
        "queueId": queue_id or f"Q:{content['contentId']}:{platform}",
        "contentId": content["contentId"],
        "contentVersion": content.get("version", 1),
        "platform": platform,
        "format": platform_version.get("format"),
        "idempotencyKey": None,        # 어댑터가 payload 를 만들 때 채운다
        "scheduledAt": scheduled_at,
        "priority": priority or content.get("priority") or "P3",
        "status": "QUEUED",
        "attemptCount": 0,
        "lastError": None,
        "lastErrorKind": None,
        "nextAttemptAt": scheduled_at,
        "publishedAt": None,
        "publishResult": None,
        "history": [],
    }


def _log(item, event, at, detail=None):
    item["history"] = list(item.get("history") or []) + [
        {"event": event, "at": at, "detail": detail}]


def mark_processing(item, *, at):
    if item["status"] not in ("QUEUED",):
        raise QueueError(f"{item['status']} 상태는 처리 시작할 수 없다")
    out = dict(item)
    out["status"] = "PROCESSING"
    out["attemptCount"] = item.get("attemptCount", 0) + 1
    _log(out, "PROCESSING", at, {"attempt": out["attemptCount"]})
    return out


def mark_published(item, result, *, at):
    """§29 — 플랫폼이 확인한 발행. 이 뒤로는 절대 다시 보내지 않는다."""
    out = dict(item)
    out["status"] = "PUBLISHED"
    out["publishedAt"] = at
    out["publishResult"] = result
    out["idempotencyKey"] = result.get("idempotencyKey") or item.get("idempotencyKey")
    out["nextAttemptAt"] = None
    _log(out, "PUBLISHED", at, {"postId": result.get("postId"), "mock": result.get("mock", False)})
    return out


def mark_failed(item, *, at, message, kind=PERMANENT, code=None, retry_after_minutes=None):
    """§114 — 실패를 남긴다. 영구/일시를 구분하고, 다음 시도 시각을 계산한다."""
    out = dict(item)
    out["lastError"] = message
    out["lastErrorKind"] = kind
    out["lastErrorCode"] = code
    attempts = out.get("attemptCount", 0)
    if kind == TEMPORARY and attempts < MAX_ATTEMPTS:
        wait = retry_after_minutes if retry_after_minutes is not None \
            else BACKOFF_MINUTES[min(attempts - 1, len(BACKOFF_MINUTES) - 1)]
        out["status"] = "QUEUED"
        out["nextAttemptAt"] = _plus_minutes(at, wait)
        _log(out, "RETRY_SCHEDULED", at, {"waitMinutes": wait, "error": code or message})
    else:
        out["status"] = "FAILED"
        out["nextAttemptAt"] = None
        _log(out, "FAILED", at, {"kind": kind, "error": code or message})
    return out


def cancel(item, *, at, actor, reason):
    if item["status"] == "PUBLISHED":
        raise QueueError("이미 발행된 것은 취소할 수 없다 — 아카이브에서만 다룬다")
    out = dict(item)
    out["status"] = "CANCELLED"
    out["nextAttemptAt"] = None
    _log(out, "CANCELLED", at, {"actor": actor, "reason": reason})
    return out


def retry_now(item, *, at, actor):
    """§114 — 사람이 손으로 다시 시도한다. 영구 실패도 사람은 다시 시킬 수 있다
    (토큰을 새로 넣었을 수 있으므로). 다만 시도 횟수는 이어서 센다."""
    if item["status"] not in ("FAILED",):
        raise QueueError(f"{item['status']} 상태는 수동 재시도 대상이 아니다")
    out = dict(item)
    out["status"] = "QUEUED"
    out["nextAttemptAt"] = at
    _log(out, "MANUAL_RETRY", at, {"actor": actor})
    return out


def due(items, *, now):
    """지금 처리해야 할 것. 우선순위 → 예정 시각 순."""
    ready = [i for i in items
             if i.get("status") == "QUEUED" and (i.get("nextAttemptAt") or "") <= now]
    order = {p: n for n, p in enumerate(cc.PRIORITIES)}
    ready.sort(key=lambda i: (order.get(i.get("priority"), 9), i.get("nextAttemptAt") or ""))
    return ready


def summary(items):
    """§30 — 관리 화면 첫 줄. 없는 상태를 0으로 만들지 않고 전부 센다."""
    counts = {s: 0 for s in QUEUE_STATUS}
    for i in items:
        counts[i.get("status", "QUEUED")] = counts.get(i.get("status", "QUEUED"), 0) + 1
    return {"schemaVersion": QUEUE_SCHEMA, "total": len(items), "byStatus": counts}


def _plus_minutes(iso, minutes):
    from datetime import datetime, timedelta, timezone
    try:
        t = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return iso
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return (t + timedelta(minutes=minutes)).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ── SNS FACTORY: 방출-큐 연결 (추가만. enqueue 계약을 바꾸지 않는다) ───
def queue_key(content_id, platform, scheduled_at):
    """scheduled_release.release_key 와 같은 키. 큐에 이미 있는지 볼 때 쓴다."""
    return "REL:%s:%s:%s" % (content_id, platform, scheduled_at)


def is_queued(items, *, content_id, platform, scheduled_at):
    """같은 방출이 큐에 이미 있는가. 상태가 QUEUED·PROCESSING 이면 있다."""
    key = queue_key(content_id, platform, scheduled_at)
    for i in items or []:
        if i.get("status") not in ("QUEUED", "PROCESSING"):
            continue
        if i.get("releaseKey") == key:
            return True
        if (i.get("contentId") == content_id
                and i.get("platform") == platform
                and i.get("scheduledAt") == scheduled_at):
            return True
    return False


# ── §132 일괄 작업 ───────────────────────────────────────────────────────────
def bulk_guard(items, action):
    """위험한 일괄 작업에 문턱을 둔다.

    "전부 발행"을 한 번에 못 하게 한다 — 실수 한 번이 전부 나간다.
    """
    if action == "publish":
        raise QueueError("일괄 발행은 제공하지 않는다 — 발행은 항목마다 사람이 확인한다")
    if action not in ("approve", "schedule", "archive", "cancel"):
        raise QueueError(f"알 수 없는 일괄 작업: {action}")
    if len(items) > 50:
        raise QueueError(f"한 번에 50건까지다 (요청 {len(items)}건)")
    return True
