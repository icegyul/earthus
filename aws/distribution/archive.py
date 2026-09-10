# -*- coding: utf-8 -*-
"""아카이브와 성과 지표 — 지시서 §33 · §34 · §35 · §88 · §91 · §95 · §96.

세 가지를 한다.
  1. 발행된 것을 **불변으로** 보관한다(§35). 메타데이터 수정만 허용한다.
  2. 성과를 원래 사건까지 되짚는다(§34) — "어떤 지구 현상이 사람들의 관심을 끄는가".
  3. 자료가 바뀌면 파생 콘텐츠를 STALE 로 표시한다(§95 · §96).

지표를 0으로 채우지 않는다(§33 · §120)
  플랫폼이 안 주는 지표는 `NOT_AVAILABLE` 이다. 0 으로 두면 "성과가 없었다"로 읽힌다.
"""
import hashlib
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_shared"))
import content_contract as cc                 # noqa: E402
from sns_adapters.base import ALL_METRICS         # noqa: E402

ARCHIVE_SCHEMA = "earthus.distribution-archive.v1"

NOT_AVAILABLE = "NOT_AVAILABLE"
AVAILABLE = "AVAILABLE"

# §35 — 아카이브에서 고칠 수 있는 것. 그 밖의 필드는 얼린다.
MUTABLE_FIELDS = ("metrics", "metricsFetchedAt", "notes", "tagsCorrection", "takedown")


class ArchiveError(RuntimeError):
    pass


def archive_publication(content, platform_version, queue_item, *, at):
    """§35 — 발행 한 건을 얼린다. 되짚을 수 있는 모든 참조를 함께 담는다."""
    result = queue_item.get("publishResult") or {}
    if queue_item.get("status") != "PUBLISHED":
        raise ArchiveError("발행되지 않은 것을 아카이브할 수 없다")
    body = platform_version.get("text") or ""
    return {
        "schemaVersion": ARCHIVE_SCHEMA,
        "publicationId": f"PUB:{content['contentId']}:{platform_version['platform']}",
        # ── 되짚기 사슬 (§34)
        "contentId": content["contentId"],
        "contentVersion": content.get("version", 1),
        "contentType": content.get("type"),
        "phenomenonIds": list(content.get("phenomenonIds") or []),
        "eventIds": list(content.get("eventIds") or []),
        "reportIds": list(content.get("reportIds") or []),
        "datasetRefs": list(content.get("datasetRefs") or []),
        "dataSnapshotId": content.get("dataSnapshotId"),
        # ── 발행 사실
        "platform": platform_version["platform"],
        "format": platform_version.get("format"),
        "language": content.get("language"),
        "postId": result.get("postId"),
        "url": result.get("url"),
        "mock": bool(result.get("mock")),
        "publishedAt": result.get("publishedAt") or queue_item.get("publishedAt"),
        "publishedBy": result.get("publishedBy"),
        "idempotencyKey": result.get("idempotencyKey"),
        # 본문은 해시로도 남긴다 — 나중에 "그때 뭐라고 썼나"를 대조할 수 있게.
        "text": body,
        "textDigest": hashlib.sha256(body.encode("utf-8")).hexdigest(),
        "hashtags": list(platform_version.get("hashtags") or []),
        "visualAssetIds": list(content.get("visualAssetIds") or []),
        # ── 성과 (§33) — 처음에는 전부 미수집이다
        "metrics": {},
        "metricsFetchedAt": None,
        "archivedAt": at,
        "immutable": True,
        # ── 노후 (§95)
        "stale": False,
        "staleReason": None,
    }


def amend(record, patch, *, actor, at, reason):
    """§35 · §66 — 메타데이터만 고친다. 발행 사실은 못 고친다."""
    illegal = [k for k in patch if k not in MUTABLE_FIELDS]
    if illegal:
        raise ArchiveError(f"아카이브에서 고칠 수 없는 필드: {illegal}")
    out = dict(record)
    out.update(patch)
    out["amendments"] = list(record.get("amendments") or []) + [
        {"fields": sorted(patch), "actor": actor, "at": at, "reason": reason}]
    return out


def record_metrics(record, raw, *, platform_metrics, at):
    """§33 · §120 — 플랫폼이 주는 지표만 담는다. 나머지는 NOT_AVAILABLE 이다.

    raw 에 값이 없으면 0 이 아니라 NOT_AVAILABLE 이다.
    실제로 0 이었던 것과 안 준 것을 구분하지 못하면 성과 분석 전체가 거짓이 된다.
    """
    metrics = {}
    for m in ALL_METRICS:
        if m not in platform_metrics:
            metrics[m] = {"state": NOT_AVAILABLE,
                          "reason": "이 플랫폼이 제공하지 않는 지표"}
        elif m in (raw or {}) and raw[m] is not None:
            metrics[m] = {"state": AVAILABLE, "value": raw[m]}
        else:
            metrics[m] = {"state": NOT_AVAILABLE, "reason": "아직 수집되지 않음"}
    out = dict(record)
    out["metrics"] = metrics
    out["metricsFetchedAt"] = at
    return out


def engagement_by_phenomenon(records):
    """§34 — 어떤 현상이 관심을 끄는가.

    ⚠️ 지표가 없는 게시물을 0 으로 세지 않는다. 분모에서 뺀다.
       그러지 않으면 "지표를 아직 안 받아온 현상"이 "인기 없는 현상"이 된다.
    """
    rows = {}
    for r in records:
        for pid in r.get("phenomenonIds") or ["(현상 없음)"]:
            row = rows.setdefault(pid, {
                "phenomenonId": pid, "publications": 0, "withMetrics": 0,
                "platforms": set(), "contentTypes": set(),
                "sum": {}, "measured": {},
            })
            row["publications"] += 1
            row["platforms"].add(r.get("platform"))
            row["contentTypes"].add(r.get("contentType"))
            m = r.get("metrics") or {}
            counted = False
            for key, cell in m.items():
                if (cell or {}).get("state") != AVAILABLE:
                    continue
                v = cell.get("value")
                if not isinstance(v, (int, float)):
                    continue
                row["sum"][key] = row["sum"].get(key, 0) + v
                row["measured"][key] = row["measured"].get(key, 0) + 1
                counted = True
            if counted:
                row["withMetrics"] += 1
    out = []
    for pid in sorted(rows):
        r = rows[pid]
        avg = {k: round(r["sum"][k] / r["measured"][k], 2) for k in r["sum"]}
        out.append({
            "phenomenonId": pid,
            "publications": r["publications"],
            "withMetrics": r["withMetrics"],
            "platforms": sorted(x for x in r["platforms"] if x),
            "contentTypes": sorted(x for x in r["contentTypes"] if x),
            "totals": r["sum"],
            "averages": avg,
            "coverageNote": None if r["withMetrics"] == r["publications"]
                            else f"{r['publications'] - r['withMetrics']}건은 지표가 아직 없다",
        })
    return {"schemaVersion": ARCHIVE_SCHEMA, "rows": out}


def search(records, *, date_from=None, date_to=None, phenomenon=None, event=None,
           platform=None, content_type=None, status=None, language=None, text=None):
    """§35 · §86 · §87 — 아카이브 검색. 준 조건만 건다."""
    def ok(r):
        at = (r.get("publishedAt") or "")[:10]
        if date_from and at < date_from:
            return False
        if date_to and at > date_to:
            return False
        if phenomenon and phenomenon not in (r.get("phenomenonIds") or []):
            return False
        if event and event not in (r.get("eventIds") or []):
            return False
        if platform and r.get("platform") != platform:
            return False
        if content_type and r.get("contentType") != content_type:
            return False
        if language and r.get("language") != language:
            return False
        if status and (r.get("stale") and status != "STALE"):
            return False
        if text:
            hay = " ".join([str(r.get("text") or ""), str(r.get("contentId") or "")])
            if text.lower() not in hay.lower():
                return False
        return True
    hits = [r for r in records if ok(r)]
    hits.sort(key=lambda r: r.get("publishedAt") or "", reverse=True)
    return hits


# ── §95 · §96 노후 감지 ──────────────────────────────────────────────────────
def detect_stale(item, *, current_snapshot_id=None, revised_event_ids=(),
                 revised_phenomenon_ids=(), generator_version=None,
                 changed_dataset_refs=()):
    """자료가 바뀌었는데 콘텐츠가 옛 자료를 말하고 있는가.

    바뀐 것을 조용히 계속 보여 주지 않는다. 다시 만들라고 표시만 한다 —
    자동으로 고쳐 쓰면 이미 올라간 게시물과 아카이브가 어긋난다(§66).
    """
    reasons = []
    if current_snapshot_id and item.get("dataSnapshotId") \
            and item["dataSnapshotId"] != current_snapshot_id:
        reasons.append(f"자료 스냅샷이 바뀌었다: {item['dataSnapshotId']} → {current_snapshot_id}")
    for eid in item.get("eventIds") or []:
        if eid in revised_event_ids:
            reasons.append(f"사건이 개정됐다: {eid}")
    for pid in item.get("phenomenonIds") or []:
        if pid in revised_phenomenon_ids:
            reasons.append(f"현상이 개정됐다: {pid}")
    for ref in item.get("datasetRefs") or []:
        if ref in changed_dataset_refs:
            reasons.append(f"자료가 바뀌었다: {ref}")
    if generator_version and item.get("generatorVersion") \
            and item["generatorVersion"] != generator_version:
        reasons.append(f"생성기가 바뀌었다: {item['generatorVersion']} → {generator_version}")
    return {
        "stale": bool(reasons),
        "staleReason": reasons or None,
        "recommendation": "REGENERATION_RECOMMENDED" if reasons else None,
    }


def mark_stale(item, verdict):
    out = dict(item)
    out["stale"] = verdict["stale"]
    out["staleReason"] = verdict["staleReason"]
    return out


# ── §90 · §91 판 관리 ────────────────────────────────────────────────────────
def new_version(content, *, at, actor, reason):
    """§90 — 다시 만들되 이전 판을 지우지 않는다."""
    out = dict(content)
    out["version"] = content.get("version", 1) + 1
    out["status"] = "DRAFT"
    out["approvedAt"] = None
    out["scheduledAt"] = None
    out["publishedAt"] = None
    out["history"] = list(content.get("history") or []) + [{
        "version": content.get("version", 1),
        "status": content.get("status"),
        "title": content.get("title"),
        "generatedAt": content.get("generatedAt"),
        "supersededAt": at, "actor": actor, "reason": reason,
    }]
    return out


# ── §88 감사 기록 ────────────────────────────────────────────────────────────
# 새 테이블을 만들지 않는다 — Supabase `admin_audit_log` 가 이미 이 모양이다.
AUDIT_ACTIONS = (
    "content_generated", "content_edited", "content_approved", "content_rejected",
    "content_scheduled", "content_published", "content_archived", "content_regenerated",
    "report_generated", "report_revised", "report_published",
)


def audit_row(*, action, actor, object_kind, object_id, detail=None, at=None):
    """`admin_audit_log` 에 그대로 들어가는 모양. 새 계보를 만들지 않는다."""
    if action not in AUDIT_ACTIONS:
        raise ArchiveError(f"알 수 없는 감사 동작: {action}")
    return {"actor_id": actor, "action": action, "object_kind": object_kind,
            "object_id": object_id, "detail": detail or {}, "created_at": at}


# ── SNS FACTORY: 읽기 기록 (추가만. 불변 필드는 건드리지 않는다) ──────────
def note_analytics_fetch(record, *, at, platform, status, reason=None):
    """성과를 읽은 기록을 남긴다. metrics 값 자체는 amend() 로 적재한다.

    읽기 때문에 발행 사실이 바뀌지 않는다 — 이 함수가 만지는 것은
    `analyticsFetches` 목록뿐이다. 없으면 만든다.
    """
    out = dict(record)
    out["analyticsFetches"] = list(record.get("analyticsFetches") or []) + [
        {"platform": platform, "status": status, "reason": reason, "at": at}]
    return out
