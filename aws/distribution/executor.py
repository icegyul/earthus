# -*- coding: utf-8 -*-
"""방출 실행기 — SNS FACTORY 신규 모듈 (독립 구현).

이어주는 일만 한다
  scheduled_release(대상 발견) → publish_queue(줄 세우기) →
  adapter.publish(보내기) → archive(얼리기). 각 단계는 기존 모듈이 한다.
  여기서 새로 만드는 것은 순서와 중복 방지뿐이다. 새 DB·새 상태기계 없다.

하나만 유효하게 나간다
  같은 release 는 어떤 경로(manual/scheduler, worker A/B)로 와도
  한 번만 실효 발행된다. `claimed` 집합 + publish_queue.is_queued() +
  어댑터 멱등키가 세 겹으로 막는다.

사람 확인을 우회하지 않는다
  LIVE 어댑터는 confirmed 증거 없이는 보내지 않고 SKIPPED 로 둔다.
  시도 횟수도 태우지 않는다 — 확인 없는 실패를 FAILED 로 쌓지 않는다.

provider 는 따로따로 죽는다
  한 intent 가 깨져도 배치는 계속 간다. 결과 장부에만 남긴다.
"""
import sys
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "_shared"))

import scheduled_release as rel  # noqa: E402
import publish_queue as pq  # noqa: E402
import archive as arch  # noqa: E402
import analytics_fetch as af  # noqa: E402
import rate_limit as rl  # noqa: E402

EXECUTOR_SCHEMA = "earthus.executor-run.v1"

# 실행 결과. 앞의 네 개는 publish_queue 어휘, 뒤의 세 개는 실행기 어휘다.
OUT_QUEUED = "QUEUED"
OUT_PROCESSING = "PROCESSING"
OUT_PUBLISHED = "PUBLISHED"
OUT_FAILED = "FAILED"
OUT_SKIPPED = "SKIPPED"
OUT_ALREADY_PROCESSED = "ALREADY_PROCESSED"
OUT_NOT_APPROVED = "NOT_APPROVED"

_APPROVED_STATES = ("APPROVED", "SCHEDULED")


def _now_utc():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _via_for(adapter, health):
    """analytics 증거. live handshake 가 확인된 때만 live 다."""
    if (health or {}).get("provenance") == "live" \
            and (health or {}).get("analytics_ready"):
        return af.PV_LIVE
    if getattr(adapter, "mode", None) in ("MOCK", "STUB"):
        return af.PV_STUB
    return None


def _rate_blocked(platform, rate_states, now):
    """상한 대기에 걸렸는가. (걸림, 정보). 모르면 막지 않는다."""
    scope = "%s:publish" % platform
    state = (rate_states or {}).get(platform) or (rate_states or {}).get(scope)
    if state is None:
        return False, None
    decision = rl.check(state, now=now)
    if decision["decision"] == rl.RETRYABLE:
        return True, decision
    return False, None


def _publish_queued(item, content, pv, adapter, *, now, actor, source,
                    health=None, confirmed=False, release_key=None):
    """큐 항목 하나를 발행 단계까지. (항목, 결과, 아카이브, 감사)."""
    platform = (item or {}).get("platform") or getattr(adapter, "platform", None)
    base = {"releaseKey": release_key, "contentId": (content or {}).get("contentId"),
            "platform": platform, "source": source}
    if getattr(adapter, "mode", None) == "LIVE" and not confirmed:
        # 확인 없이 LIVE 로 가지 않는다. 손도 대지 않는다.
        base.update({"outcome": OUT_SKIPPED,
                     "reason": "사람 확인 없음 — LIVE 로 보내지 않았다"})
        return item, base, None, None
    try:
        item = pq.mark_processing(item, at=now)
    except Exception as e:  # noqa: BLE001 — QUEUED 가 아니면 못 돈다
        import provider_health as phealth  # noqa: E402
        base.update({"outcome": OUT_SKIPPED,
                     "reason": phealth.safe_error(e)})
        return None, base, None, None
    try:
        payload = adapter.generate_payload(pv)
    except Exception as e:  # noqa: BLE001
        import provider_health as phealth  # noqa: E402
        failed = pq.mark_failed(item, at=now,
                                message=phealth.safe_error(e)[:300],
                                kind="PERMANENT", code="PAYLOAD_FAILED")
        base.update({"outcome": OUT_FAILED, "reason": "payload 실패"})
        return failed, base, None, None
    try:
        result = adapter.publish(payload, confirmed=confirmed, actor=actor,
                                 at=now)
    except Exception as e:  # noqa: BLE001 — provider 는 따로따로 죽는다
        import provider_health as phealth  # noqa: E402
        kind = getattr(e, "kind", None)
        if kind not in ("TEMPORARY", "PERMANENT"):
            kind = "PERMANENT"
        failed = pq.mark_failed(item, at=now,
                                message=phealth.safe_error(e)[:300],
                                kind=kind, code=getattr(e, "code", None))
        base.update({"outcome": OUT_FAILED,
                     "reason": phealth.safe_error(e)[:200]})
        return failed, base, None, None
    done = pq.mark_published(item, result, at=now)
    record = arch.archive_publication(content, pv, done, at=now)
    audit = arch.audit_row(action="content_published", actor=actor,
                           object_kind="content",
                           object_id=content.get("contentId"),
                           detail={"platform": platform,
                                   "releaseKey": release_key,
                                   "source": source,
                                   "mock": bool(result.get("mock"))},
                           at=now)
    # 성과 읽기는 발행과 별개다. 실패해도 발행은 성공으로 남는다.
    fetched = af.fetch(record, adapter, at=now,
                       via=_via_for(adapter, health))
    record = arch.note_analytics_fetch(
        record, at=now, platform=platform, status=fetched["status"],
        reason=fetched.get("reason"))
    base.update({"outcome": OUT_PUBLISHED, "postId": result.get("postId"),
                 "mock": bool(result.get("mock")),
                 # 비동기 접수(REQUESTED)는 True. 확정(PUBLISHED)과 다르다.
                 "pending": bool(result.get("pending")),
                 "analytics": fetched["status"],
                 "analyticsProvenance": fetched["provenance"]})
    return done, base, record, audit


def _existing_states(queue_items, content_id, platform, scheduled_at):
    """같은 방출의 큐 상태들. 종결(PUBLISHED·FAILED·CANCELLED)도 본다."""
    states = set()
    for i in queue_items or []:
        if i.get("contentId") == content_id \
                and i.get("platform") == platform \
                and i.get("scheduledAt") == scheduled_at:
            states.add(i.get("status"))
    return states


def execute_item(intent, content, platform_version, adapter, queue_items, *,
                 now, actor, source, claimed, rate_states=None, health=None,
                 confirmed=False):
    """intent 하나를 끝까지. (queue_items 추가분, 결과, 아카이브, 감사)."""
    key = intent["releaseKey"]
    platform = intent["platform"]
    base = {"releaseKey": key, "contentId": intent["contentId"],
            "platform": platform, "source": source}
    if key in claimed:
        base.update({"outcome": OUT_ALREADY_PROCESSED,
                     "reason": "이미 손댄 방출이다"})
        return [], base, None, None
    claimed.add(key)
    if (content or {}).get("status") not in _APPROVED_STATES:
        base.update({"outcome": OUT_NOT_APPROVED,
                     "reason": "승인된 상태가 아니다"})
        return [], base, None, None
    seen = _existing_states(queue_items, intent["contentId"], platform,
                            intent["scheduledAt"])
    if "PUBLISHED" in seen:
        base.update({"outcome": OUT_ALREADY_PROCESSED,
                     "reason": "이미 발행됐다 — 다시 올리지 않는다"})
        return [], base, None, None
    if "FAILED" in seen:
        base.update({"outcome": OUT_SKIPPED,
                     "reason": "실패 종결 — 수동 재시도로만 다시 돈다"})
        return [], base, None, None
    if "CANCELLED" in seen:
        base.update({"outcome": OUT_SKIPPED,
                     "reason": "취소된 건은 실행하지 않는다"})
        return [], base, None, None
    if pq.is_queued(queue_items, content_id=intent["contentId"],
                    platform=platform, scheduled_at=intent["scheduledAt"]):
        base.update({"outcome": OUT_ALREADY_PROCESSED,
                     "reason": "큐에 이미 있다"})
        return [], base, None, None
    if platform_version is None:
        base.update({"outcome": OUT_SKIPPED,
                     "reason": "플랫폼 판이 없다 — 만들지 않는다"})
        return [], base, None, None
    # 속도. 모르면(미설정) 막지 않는다.
    blocked, decision = _rate_blocked(platform, rate_states, now)
    if blocked:
        base.update({"outcome": OUT_SKIPPED,
                     "reason": (decision or {}).get("reason") or "상한 대기",
                     "retryAfterAt": (decision or {}).get("retryAfterAt"),
                     "resetAt": (decision or {}).get("resetAt")})
        claimed.discard(key)
        return [], base, None, None
    try:
        item = pq.enqueue(content, platform_version,
                          scheduled_at=intent["scheduledAt"],
                          priority=intent.get("priority"))
    except Exception as e:  # noqa: BLE001 — enqueue 거부는 SKIPPED 다
        import provider_health as phealth  # noqa: E402
        base.update({"outcome": OUT_SKIPPED,
                     "reason": phealth.safe_error(e)})
        claimed.discard(key)
        return [], base, None, None
    item = dict(item)
    item["releaseKey"] = key
    done, res, record, audit = _publish_queued(
        item, content, platform_version, adapter, now=now, actor=actor,
        source=source, health=health, confirmed=confirmed, release_key=key)
    base.update({k: v for k, v in res.items() if k != "releaseKey"})
    if done is None:
        return [], base, None, None
    return [done], base, record, audit


def run_once(contents, queue_items, *, versions, adapters, now=None,
             actor="scheduler", source="scheduler", claimed=None,
             rate_states=None, health_map=None, confirmed=False):
    """기한 지난 승인본을 모아 한 번 실행한다. 저장소는 호출자 몫이다."""
    now = now or _now_utc()
    claimed = claimed if claimed is not None else set()
    by_id = {(c or {}).get("contentId"): c for c in contents or []}
    queued_keys = [pq.queue_key(i.get("contentId"), i.get("platform"),
                                i.get("scheduledAt"))
                   for i in queue_items or []
                   if i.get("status") in ("QUEUED", "PROCESSING", "PUBLISHED")]
    found = rel.release_due(contents, now=now, seen_keys=set(),
                            queued_keys=queued_keys)
    new_items, results, archives, audits = [], [], [], []
    # 이번 run 에서 손댄 방출. 스킵된 intent 는 넣지 않는다 —
    # 그래야 QUEUED 재시도가 due 단계에서 돈다.
    handled = set()
    for intent in found["intents"]:
        content = by_id.get(intent["contentId"])
        pv = (versions or {}).get((intent["contentId"], intent["platform"]))
        adapter = (adapters or {}).get(intent["platform"])
        if adapter is None:
            results.append({"releaseKey": intent["releaseKey"],
                            "contentId": intent["contentId"],
                            "platform": intent["platform"], "source": source,
                            "outcome": OUT_SKIPPED,
                            "reason": "어댑터가 없다"})
            continue
        try:
            handled.add((intent["contentId"], intent["platform"],
                         intent["scheduledAt"]))
            added, res, record, audit = execute_item(
                intent, content, pv, adapter, list(queue_items) + new_items,
                now=now, actor=actor, source=source, claimed=claimed,
                rate_states=rate_states,
                health=(health_map or {}).get(intent["platform"]),
                confirmed=confirmed)
        except Exception as e:  # noqa: BLE001 — 배치는 멈추지 않는다
            import provider_health as phealth  # noqa: E402
            res = {"releaseKey": intent["releaseKey"],
                   "contentId": intent["contentId"],
                   "platform": intent["platform"], "source": source,
                   "outcome": OUT_FAILED,
                   "reason": phealth.safe_error(e)[:200]}
            added, record, audit = [], None, None
        new_items.extend(added)
        results.append(res)
        if record is not None:
            archives.append(record)
        if audit is not None:
            audits.append(audit)
    for skip in found["skipped"]:
        results.append({"releaseKey": skip.get("key"), "source": source,
                        "outcome": OUT_SKIPPED, "reason": skip.get("reason")})
    # 재시도 — 기한이 된 QUEUED 항목을 마저 돈다. 이번 run 에서 손댄 것은 뺀다.
    # claimed 는 admission 전용이라 여기서 보지 않는다. 큐 상태가 대신 막는다.
    for item in pq.due(list(queue_items) + new_items, now=now):
        triple = (item.get("contentId"), item.get("platform"),
                  item.get("scheduledAt"))
        if triple in handled:
            continue
        handled.add(triple)
        content = by_id.get(item.get("contentId"))
        pv = (versions or {}).get((item.get("contentId"),
                                   item.get("platform")))
        adapter = (adapters or {}).get(item.get("platform"))
        if content is None or pv is None or adapter is None:
            results.append({"contentId": item.get("contentId"),
                            "platform": item.get("platform"), "source": source,
                            "outcome": OUT_SKIPPED,
                            "reason": "재시도 자료가 없다 — 만들지 않는다"})
            continue
        blocked, decision = _rate_blocked(item.get("platform"), rate_states,
                                          now)
        if blocked:
            results.append({"contentId": item.get("contentId"),
                            "platform": item.get("platform"), "source": source,
                            "outcome": OUT_SKIPPED,
                            "reason": (decision or {}).get("reason")})
            continue
        try:
            done, res, record, audit = _publish_queued(
                item, content, pv, adapter, now=now, actor=actor,
                source=source,
                health=(health_map or {}).get(item.get("platform")),
                confirmed=confirmed,
                release_key=item.get("releaseKey"))
        except Exception as e:  # noqa: BLE001 — 배치는 멈추지 않는다
            import provider_health as phealth  # noqa: E402
            res = {"contentId": item.get("contentId"),
                   "platform": item.get("platform"), "source": source,
                   "outcome": OUT_FAILED,
                   "reason": phealth.safe_error(e)[:200]}
            done, record, audit = None, None, None
        if done is not None:
            new_items.append(done)
        results.append(res)
        if record is not None:
            archives.append(record)
        if audit is not None:
            audits.append(audit)
    return {"schemaVersion": EXECUTOR_SCHEMA, "runAt": now, "source": source,
            "actor": actor, "results": results, "queueItems": new_items,
            "archives": archives, "audits": audits}
