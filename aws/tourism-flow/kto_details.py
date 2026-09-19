"""KTO 콘텐츠 ID별 상세 캐시. 목록 latest 파일은 절대 덮어쓰지 않는다.

KTO_DETAILS는 인증된 Lambda 작업 경로에서만 실행한다. 공개 브라우저 요청을
수집 트리거로 받지 않으며, 상위 collector의 공용 provider lease 안에서만 호출한다.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from kto_pipeline import normalize_kto_snapshot
from kto_provider import call_kto, check_response_contract, load_operation_contract


DETAIL_OPERATIONS = {
    "barrierFree": ("detailCommon2", "detailIntro2", "detailWithTour2"),
    "wellness": ("detailCommon", "detailIntro"),
    "english": ("detailCommon2", "detailIntro2"),
}
LIST_OPERATIONS = {
    "barrierFree": "areaBasedSyncList2", "wellness": "wellnessTursmSyncList", "english": "areaBasedSyncList2",
}
MEDIA_FIELDS = {"orgImage", "thumbImage", "firstimage", "firstimage2", "originimgurl", "smallimageurl"}
SENSITIVE_MARKERS = re.compile(r"(?:servicekey|api[_-]?key|(?:access[_-]?)?token|password|secret)\s*[=:]|https?://[^/\s:]+:[^/\s@]+@", re.I)
PUBLIC_CACHE_CONTROL = "public, max-age=300, must-revalidate"
MAX_CONTENT_IDS = 20


class KtoDetailError(ValueError):
    """고정된 reason code만 밖으로 내보낸다. provider 예외의 URL·인증값은 버린다."""


def _time(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else None
    except (TypeError, ValueError):
        return None


def _stamp(value):
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _bytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _read(s3, bucket, key):
    try:
        raw = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
    except KeyError:
        return None  # unit fixture의 NoSuchKey
    except Exception as error:
        code = str(getattr(error, "response", {}).get("Error", {}).get("Code", ""))
        if code in ("NoSuchKey", "404", "NotFound"):
            return None
        raise KtoDetailError("DETAIL_CACHE_READ_FAILED") from None
    try:
        document = json.loads(raw)
    except (ValueError, TypeError, UnicodeError):
        raise KtoDetailError("DETAIL_CACHE_INVALID_JSON") from None
    if not isinstance(document, dict):
        raise KtoDetailError("DETAIL_CACHE_INVALID_JSON")
    return document


def _write(s3, bucket, key, document, private=False):
    args = {"Bucket": bucket, "Key": key, "Body": _bytes(document),
            "ContentType": "application/json; charset=utf-8",
            "CacheControl": "private, no-store" if private else PUBLIC_CACHE_CONTROL}
    if private:
        args["ServerSideEncryption"] = "AES256"
    s3.put_object(**args)


def _text(value):
    return str(value).strip() if isinstance(value, (str, int, float)) else ""


def _content_id(value):
    content_id = _text(value)
    if not re.fullmatch(r"[0-9]{1,20}", content_id):
        raise KtoDetailError("DETAIL_CONTENT_ID_INVALID")
    return content_id


def _safe_field(value):
    if not isinstance(value, (str, int, float)):
        return None
    text = str(value)
    if len(text) > 100000:
        raise KtoDetailError("DETAIL_FIELD_TOO_LARGE")
    return None if SENSITIVE_MARKERS.search(text) else value


def _sanitize_rows(service, operation, rows):
    schema = json.loads((Path(__file__).parent / "contracts" / "kto" / service / f"{operation}.schema.json").read_text(encoding="utf-8"))
    allowed = set(schema["itemFields"]) - MEDIA_FIELDS
    return [{key: safe for key, value in row.items() if key in allowed
             and (safe := _safe_field(value)) is not None} for row in rows]


def _row_id(row):
    return _text(row.get("externalContentId") or row.get("contentid") or row.get("contentId"))


def _flag(row):
    return _text(row.get("showFlag") if row.get("showFlag") is not None else (row.get("officialFields") or {}).get("showflag"))


def _modified(row):
    return _text(row.get("modifiedAtRaw") or (row.get("officialFields") or {}).get("modifiedtime")
                 or (row.get("officialFields") or {}).get("mdfcnDt"))


def _params(service, operation, content_id, row):
    fields = row.get("officialFields") or {}
    values = {"contentId": content_id,
              "contentTypeId": _text(row.get("contentTypeId") or fields.get("contenttypeid") or fields.get("contentTypeId")),
              "langDivCd": _text(row.get("officialLanguageCode") or fields.get("langDivCd"))}
    required = set(load_operation_contract(service, operation).get("requiredParameters", []))
    result = {key: value for key, value in values.items() if key in required}
    if any(not value for value in result.values()):
        raise KtoDetailError("DETAIL_CATALOG_PARAMETER_MISSING")
    return result


def _operation_key(service, content_id, operation):
    return f"app/tourism/kto/details/{service}/{content_id}/{operation}.json"


def _summary_key(service, content_id):
    return f"app/tourism/kto/details/{service}/{content_id}/summary.json"


def _validate_cached(document, service, content_id, operation):
    if document is None:
        return None
    if (document.get("schemaVersion") != "earthus.kto-detail.v1" or document.get("provider") != "KTO"
            or document.get("service") != service or document.get("operation") != operation
            or document.get("contentId") != content_id):
        raise KtoDetailError("DETAIL_CACHE_IDENTITY_MISMATCH")
    if any(_row_id(row) != content_id for row in document.get("items", [])):
        raise KtoDetailError("DETAIL_CACHE_ITEM_ID_MISMATCH")
    return document


def _fresh(document, row, now, ttl):
    if not document or document.get("state") in ("HIDDEN", "NOT_IN_CATALOG"):
        return False
    retry_after = _time(document.get("retryAfter"))
    if retry_after and retry_after > now:
        return True
    received = _time(document.get("fetchedAt"))
    return bool(document.get("state") == "AVAILABLE" and received and 0 <= (now - received).total_seconds() < ttl
                and document.get("catalogModifiedAtRaw") == _modified(row))


def _failure(previous, service, content_id, operation, reason, at, retry_seconds):
    usable = previous and previous.get("items") and previous.get("state") not in ("HIDDEN", "NOT_IN_CATALOG")
    result = dict(previous) if usable else {
        "schemaVersion": "earthus.kto-detail.v1", "provider": "KTO", "service": service,
        "contentId": content_id, "operation": operation, "items": [], "fetchedAt": None,
        "sourceType": "OFFICIAL_INFORMATION",
    }
    result.update({"state": "STALE" if usable else "UNAVAILABLE", "lastAttemptAt": _stamp(at),
                   "reasonCode": reason, "retryAfter": _stamp(at + timedelta(seconds=retry_seconds))})
    return result


def _tombstone(s3, bucket, service, content_id, state, at, catalog):
    for operation in DETAIL_OPERATIONS[service]:
        _write(s3, bucket, _operation_key(service, content_id, operation), {
            "schemaVersion": "earthus.kto-detail.v1", "provider": "KTO", "service": service,
            "contentId": content_id, "operation": operation, "state": state, "showFlag": "0" if state == "HIDDEN" else None,
            "items": [], "fetchedAt": None, "lastAttemptAt": _stamp(at), "catalogFetchedAt": catalog["fetchedAt"],
        })
    result = {"schemaVersion": "earthus.kto-place-detail.v1", "provider": "KTO", "service": service,
              "contentId": content_id, "state": state, "sections": {}, "catalogFetchedAt": catalog["fetchedAt"],
              "updatedAt": _stamp(at), "showFlag": "0" if state == "HIDDEN" else None}
    _write(s3, bucket, _summary_key(service, content_id), result)
    return result


def _merge(s3, bucket, service, content_id, row, catalog, at, ttl):
    sections = {}
    for operation in DETAIL_OPERATIONS[service]:
        document = _validate_cached(_read(s3, bucket, _operation_key(service, content_id, operation)), service, content_id, operation)
        section = "accessibility" if operation == "detailWithTour2" else "common" if operation.startswith("detailCommon") else "intro"
        if not document:
            sections[section] = {"state": "NOT_FETCHED", "operation": operation, "fields": {}, "fetchedAt": None}
            continue
        fields = {}
        for item in document.get("items", []):
            fields.update(item.get("officialFacts" if section == "accessibility" else "officialFields") or {})
        received = _time(document.get("fetchedAt"))
        stale = fields and (not received or not 0 <= (at - received).total_seconds() < ttl
                            or document.get("catalogModifiedAtRaw") != _modified(row))
        effective_state = "STALE" if stale else document["state"]
        sections[section] = {"state": effective_state, "operation": operation, "fields": fields,
                             "fetchedAt": document.get("fetchedAt"), "lastAttemptAt": document.get("lastAttemptAt"),
                             "retryAfter": document.get("retryAfter"), "reasonCode": document.get("reasonCode"),
                             "provenance": document.get("provenance"), "catalogModifiedAtRaw": document.get("catalogModifiedAtRaw")}
    states = [section["state"] for section in sections.values()]
    state = "AVAILABLE" if all(value == "AVAILABLE" for value in states) else (
        "PARTIAL" if any(section["fields"] for section in sections.values()) else "UNAVAILABLE")
    result = {"schemaVersion": "earthus.kto-place-detail.v1", "provider": "KTO", "service": service,
              "contentId": content_id, "state": state, "sourceType": "OFFICIAL_INFORMATION",
              "showFlag": _flag(row), "title": _text(row.get("title")), "catalogFetchedAt": catalog["fetchedAt"],
              "catalogModifiedAtRaw": _modified(row), "updatedAt": _stamp(at), "sections": sections}
    _write(s3, bucket, _summary_key(service, content_id), result)
    return result


def collect_details(payload, *, s3_client, bucket, fetched_at, lease, call=None, environ=None, sleep=None, monotonic=None):
    """명시된 1~20개 ID만 처리한다. 전체 카탈로그 자동 스윕은 여기서 하지 않는다."""
    service = payload.get("service")
    if service not in DETAIL_OPERATIONS:
        raise KtoDetailError("DETAIL_SERVICE_INVALID")
    ids = payload.get("contentIds")
    if not isinstance(ids, list) or not 1 <= len(ids) <= MAX_CONTENT_IDS:
        raise KtoDetailError("DETAIL_CONTENT_IDS_LIMIT")
    ids = list(dict.fromkeys(_content_id(value) for value in ids))
    operations = payload.get("operations", list(DETAIL_OPERATIONS[service]))
    if not isinstance(operations, list) or not operations or any(op not in DETAIL_OPERATIONS[service] for op in operations):
        raise KtoDetailError("DETAIL_OPERATION_INVALID")
    operations = list(dict.fromkeys(operations))
    # 파라미터는 최신 공개 목록에서만 만든다. event에 들어온 provider 파라미터·키를 전달하지 않는다.
    if set(payload) - {"task", "service", "contentIds", "operations", "budgetSeconds"}:
        raise KtoDetailError("DETAIL_EVENT_PARAMETER_INVALID")
    now = _time(fetched_at)
    expires = _time((lease or {}).get("expiresAt"))
    if not now or not expires or (expires - now).total_seconds() < 30:
        raise KtoDetailError("DETAIL_PROVIDER_LEASE_REQUIRED")
    budget = float(payload.get("budgetSeconds", 120))
    if not 10 <= budget <= 240:
        raise KtoDetailError("DETAIL_BUDGET_INVALID")
    budget = min(budget, (expires - now).total_seconds() - 15)
    env = dict(environ or {})
    pacing = max(1.0, min(10.0, float(env.get("KTO_DETAIL_INTERVAL_SECONDS") or 1)))
    ttl = max(3600, min(7 * 86400, int(env.get("KTO_DETAIL_TTL_SECONDS") or 86400)))
    retry_seconds = max(300, min(86400, int(env.get("KTO_DETAIL_RETRY_SECONDS") or 900)))
    source_ttl = 8 * 86400 if service == "wellness" else 48 * 3600
    catalog = _read(s3_client, bucket, f"app/tourism/kto/{service}/{LIST_OPERATIONS[service]}.json")
    if (not catalog or catalog.get("provider") != "KTO" or catalog.get("schemaVersion") != "earthus.kto-normalized.v1"
            or catalog.get("service") != service or catalog.get("state") not in ("AVAILABLE", "DEGRADED")
            or not isinstance(catalog.get("items"), list)):
        raise KtoDetailError("DETAIL_CATALOG_UNAVAILABLE")
    source_at = _time(catalog.get("fetchedAt"))
    if not source_at or not 0 <= (now - source_at).total_seconds() <= source_ttl:
        raise KtoDetailError("DETAIL_CATALOG_STALE")
    by_id = {}
    for row in catalog["items"]:
        key = _row_id(row)
        if key in by_id:
            # 같은 ID에 서로 다른 공개 상태가 있으면 추정하지 않는다.
            raise KtoDetailError("DETAIL_CATALOG_DUPLICATE_ID")
        by_id[key] = row
    pause = time.sleep if sleep is None else sleep
    clock = time.monotonic if monotonic is None else monotonic
    started, last_call = clock(), None
    # 상세 작업은 자체 backoff 캐시를 쓴다. provider 내부의 즉시 재시도가 간격/예산을 우회하지 않게 한다.
    provider_env = {**env, "KTO_MAX_RETRIES": "0", "KTO_HTTP_TIMEOUT_MS": "8000"}
    caller = call or (lambda svc, operation, params: call_kto(svc, operation, params, environ=provider_env))
    completed, skipped = [], []
    for content_id in ids:
        at = now + timedelta(seconds=max(0, clock() - started))
        row = by_id.get(content_id)
        if row is None or _flag(row) == "0":
            document = _tombstone(s3_client, bucket, service, content_id, "NOT_IN_CATALOG" if row is None else "HIDDEN", at, catalog)
            completed.append({"contentId": content_id, "state": document["state"], "publicKey": _summary_key(service, content_id)})
            continue
        if _flag(row) != "1":
            skipped.append({"contentId": content_id, "reasonCode": "DETAIL_VISIBILITY_UNKNOWN"})
            continue
        for operation in operations:
            previous = _validate_cached(_read(s3_client, bucket, _operation_key(service, content_id, operation)), service, content_id, operation)
            at = now + timedelta(seconds=max(0, clock() - started))
            if _fresh(previous, row, at, ttl):
                continue
            if clock() - started + 9 + pacing >= budget:
                skipped.append({"contentId": content_id, "operation": operation, "reasonCode": "DETAIL_BUDGET_EXHAUSTED"})
                continue
            try:
                params = _params(service, operation, content_id, row)
                if last_call is not None:
                    delay = max(0, pacing - (clock() - last_call))
                    if delay:
                        pause(delay)
                last_call = clock()
                envelope = caller(service, operation, params)
                at = now + timedelta(seconds=max(0, clock() - started))
                rows = envelope.get("items") if isinstance(envelope, dict) else None
                if not isinstance(rows, list) or not rows:
                    raise KtoDetailError("DETAIL_EMPTY_RESPONSE")
                if any(not isinstance(value, dict) or _row_id(value) != content_id for value in rows):
                    raise KtoDetailError("DETAIL_RESPONSE_ID_MISMATCH")
                if len(rows) != 1:
                    raise KtoDetailError("DETAIL_RESPONSE_MULTIPLE_RECORDS")
                contract = check_response_contract(service, operation, rows)
                safe_rows = _sanitize_rows(service, operation, rows)
                archive = {"schemaVersion": "earthus.kto-detail-evidence.v1", "provider": "KTO", "service": service,
                           "contentId": content_id, "operation": operation, "fetchedAt": _stamp(at), "items": safe_rows,
                           "rawHash": hashlib.sha256(_bytes(rows)).hexdigest(), "contractState": contract["state"],
                           "schemaHash": contract["schemaHash"], "excludedMedia": True}
                archive_key = f"archive/tourism/kto/details/{service}/{content_id}/{operation}/{_stamp(at).replace(':', '')}-{archive['rawHash'][:16]}.json"
                try:
                    _write(s3_client, bucket, archive_key, archive, private=True)
                except Exception:
                    raise KtoDetailError("DETAIL_EVIDENCE_WRITE_FAILED") from None
                if contract["state"] != "MATCH":
                    raise KtoDetailError("DETAIL_SCHEMA_DRIFT")
                normalized = normalize_kto_snapshot(service, operation, {"items": safe_rows}, _stamp(at))
                if normalized["state"] != "AVAILABLE":
                    raise KtoDetailError("DETAIL_FIELDS_INCOMPLETE")
                document = {**normalized, "schemaVersion": "earthus.kto-detail.v1", "contentId": content_id,
                            "catalogFetchedAt": catalog["fetchedAt"], "catalogModifiedAtRaw": _modified(row),
                            "showFlag": "1", "lastAttemptAt": _stamp(at), "reasonCode": None, "retryAfter": None}
            except Exception as error:
                reason = str(error) if isinstance(error, KtoDetailError) else "DETAIL_PROVIDER_UNAVAILABLE"
                document = _failure(previous, service, content_id, operation, reason, at, retry_seconds)
            _write(s3_client, bucket, _operation_key(service, content_id, operation), document)
        merged = _merge(s3_client, bucket, service, content_id, row, catalog, now + timedelta(seconds=max(0, clock() - started)), ttl)
        completed.append({"contentId": content_id, "state": merged["state"], "publicKey": _summary_key(service, content_id)})
    return {"ok": not skipped and all(row["state"] in ("AVAILABLE", "HIDDEN", "NOT_IN_CATALOG") for row in completed),
            "provider": "KTO", "task": "KTO_DETAILS", "service": service, "completed": completed, "skipped": skipped}
