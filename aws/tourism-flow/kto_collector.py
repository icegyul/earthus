"""KTO 수집 결과를 원문 근거와 공개 정규화 산출물로 분리 저장한다."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timedelta, timezone

from kto_pipeline import normalize_kto_snapshot
from kto_provider import (
    KTO_SERVICES,
    KtoSchemaDriftError,
    check_response_contract,
    fetch_all_pages,
)


PUBLIC_TTL_SECONDS = {
    "concentration": 21600,
    "related": 86400,
    "localHub": 86400,
    "visitors": 86400,
    "barrierFree": 86400,
    "wellness": 604800,
    "english": 86400,
    "diversity": 604800,
    "demandStrength": 604800,
}
SUMMARY_KEY = "app/tourism/kto/summary.json"
HEALTH_KEY = "app/tourism/kto/health.json"


def _canonical_bytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _safe_params(params):
    return {
        str(name): value
        for name, value in (params or {}).items()
        if not any(marker in str(name).lower() for marker in ("key", "secret", "token", "password"))
    }


def _put_json(s3_client, bucket, key, document, cache_control, private=False):
    args = {
        "Bucket": bucket,
        "Key": key,
        "Body": _canonical_bytes(document),
        "ContentType": "application/json; charset=utf-8",
        "CacheControl": cache_control,
    }
    if private:
        args["ServerSideEncryption"] = "AES256"
    s3_client.put_object(**args)


def _read_json(s3_client, bucket, key):
    try:
        raw = s3_client.get_object(Bucket=bucket, Key=key)["Body"].read()
        return json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
    except Exception:
        return None


def _summary_state(services):
    states = [
        operation.get("state")
        for service in services.values()
        for operation in (service.get("operations") or {}).values()
    ]
    if not states or all(state == "UNAVAILABLE" for state in states):
        return "UNAVAILABLE"
    if all(state == "AVAILABLE" for state in states):
        return "AVAILABLE"
    if "AVAILABLE" in states:
        return "PARTIAL"
    return "DEGRADED"


def _update_summary(s3_client, bucket, service, operation, public_key, snapshot, fetched_at):
    previous = _read_json(s3_client, bucket, SUMMARY_KEY)
    services = previous.get("services", {}) if isinstance(previous, dict) else {}
    services = dict(services) if isinstance(services, dict) else {}
    service_status = dict(services.get(service) or {})
    operations = dict(service_status.get("operations") or {})
    operations[operation] = {
        "state": snapshot.get("state", "UNAVAILABLE"),
        "semanticType": snapshot.get("semanticType"),
        "sourceType": snapshot.get("sourceType"),
        "updatedAt": fetched_at,
        "itemCount": len(snapshot.get("items") or []),
        "path": "/" + public_key.removeprefix("app/"),
    }
    service_status.update({
        "sourceName": (snapshot.get("provenance") or {}).get("sourceName"),
        "sourceUrl": (snapshot.get("provenance") or {}).get("sourceUrl"),
        "updatedAt": fetched_at,
        "operations": operations,
    })
    services[service] = service_status
    document = {
        "schemaVersion": "earthus.kto-summary.v1",
        "provider": "KTO",
        "generatedAt": fetched_at,
        "state": _summary_state(services),
        "services": services,
    }
    _put_json(s3_client, bucket, SUMMARY_KEY, document, "public, max-age=300")


def _health_state(services):
    states = [
        operation.get("state")
        for service in services.values()
        for operation in (service.get("operations") or {}).values()
    ]
    if states and all(state == "SUCCEEDED" for state in states):
        return "SUCCEEDED"
    if "SUCCEEDED" in states:
        return "PARTIAL"
    return states[-1] if states else "UNAVAILABLE"


def _update_health(
    s3_client,
    bucket,
    service,
    operation,
    attempted_at,
    state,
    environ=None,
    reason_code=None,
):
    previous = _read_json(s3_client, bucket, HEALTH_KEY)
    services = previous.get("services", {}) if isinstance(previous, dict) else {}
    services = dict(services) if isinstance(services, dict) else {}
    service_status = dict(services.get(service) or {})
    operations = dict(service_status.get("operations") or {})
    prior_operation = dict(operations.get(operation) or {})
    operations[operation] = {
        "state": state,
        "reasonCode": reason_code,
        "lastAttemptAt": attempted_at,
        "lastSuccessAt": attempted_at if state == "SUCCEEDED" else prior_operation.get("lastSuccessAt"),
    }
    service_status.update({"state": state, "updatedAt": attempted_at, "operations": operations})
    services[service] = service_status
    env = environ or {}
    configured_alias = next((
        name for name in ("DATA_GO_KR_SERVICE_KEY", "DATA_GO_KR_KEY")
        if str(env.get(name) or "").strip()
    ), None)
    document = {
        "schemaVersion": "earthus.kto-health.v1",
        "provider": "KTO",
        "generatedAt": attempted_at,
        "state": _health_state(services),
        "keyConfigured": configured_alias is not None,
        "configuredAlias": configured_alias,
        "services": services,
    }
    _put_json(s3_client, bucket, HEALTH_KEY, document, "no-cache")


def sync_operation(
    service,
    operation,
    params,
    fetched_at,
    s3_client,
    bucket,
    call=None,
    environ=None,
):
    """한 Operation을 호출해 원문을 먼저 쓰고 정규화 결과를 공개한다."""
    if call is None:
        env = environ or {}
        page_size = int(env.get("KTO_DEFAULT_PAGE_SIZE") or 100)
        paged_items = fetch_all_pages(
            service,
            operation,
            dict(params or {}),
            page_size=page_size,
            environ=environ,
        )
        envelope = {
            "resultCode": "00",
            "resultMsg": "NORMAL_SERVICE",
            "pageNo": 1,
            "numOfRows": page_size,
            "totalCount": len(paged_items),
            "items": paged_items,
        }
    else:
        envelope = call(service, operation, dict(params or {}))
    items = envelope.get("items") if isinstance(envelope, dict) else []
    items = items if isinstance(items, list) else []
    contract_check = check_response_contract(service, operation, items)
    raw_hash = hashlib.sha256(_canonical_bytes(items)).hexdigest()
    raw_document = {
        "schemaVersion": "earthus.kto-raw.v1",
        "provider": "KTO",
        "service": service,
        "operation": operation,
        "fetchedAt": fetched_at,
        "request": _safe_params(params),
        "resultCode": envelope.get("resultCode"),
        "totalCount": envelope.get("totalCount"),
        "rawHash": raw_hash,
        "contract": contract_check,
        "items": items,
    }
    stamp = re.sub(r"[^0-9TZ]", "", str(fetched_at)) or "UNKNOWN"
    raw_key = f"archive/tourism/kto/raw/{service}/{operation}/{stamp}-{raw_hash[:16]}.json"
    _put_json(s3_client, bucket, raw_key, raw_document, "private, no-store", private=True)
    if contract_check["state"] == "SCHEMA_DRIFT":
        raise KtoSchemaDriftError(service, operation)

    normalized = normalize_kto_snapshot(service, operation, envelope, fetched_at)
    normalized["contract"] = contract_check
    if contract_check["state"] == "ADDITIVE_DRIFT":
        normalized["state"] = "DEGRADED"
        normalized["reasonCodes"] = ["ADDITIVE_SCHEMA_DRIFT"]
    public_key = f"app/tourism/kto/{service}/{operation}.json"
    ttl = PUBLIC_TTL_SECONDS.get(service, 86400)
    _put_json(s3_client, bucket, public_key, normalized, f"public, max-age={ttl}")
    _update_summary(s3_client, bucket, service, operation, public_key, normalized, fetched_at)
    return {
        "ok": True,
        "provider": "KTO",
        "service": service,
        "operation": operation,
        "items": len(normalized["items"]),
        "rawKey": raw_key,
        "publicKey": public_key,
        "semanticType": normalized["semanticType"],
    }


def _utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def handle_event(event, s3_client, bucket, fetched_at=None, call=None, environ=None):
    """명시된 KTO Operation 하나만 실행한다."""
    payload = event if isinstance(event, dict) else {}
    if payload.get("task") == "KTO_VISITORS_DAILY":
        raw_as_of = payload.get("asOf") or fetched_at or _utc_now()
        try:
            as_of = datetime.fromisoformat(str(raw_as_of).replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("KTO visitors asOf must be an ISO-8601 timestamp") from error
        if as_of.tzinfo is None:
            as_of = as_of.replace(tzinfo=timezone.utc)
        end_date = as_of.astimezone(timezone.utc).date() - timedelta(days=1)
        start_date = end_date - timedelta(days=6)
        params = {
            "startYmd": start_date.strftime("%Y%m%d"),
            "endYmd": end_date.strftime("%Y%m%d"),
        }
        results = []
        for operation in ("metcoRegnVisitrDDList", "locgoRegnVisitrDDList"):
            results.append(handle_event(
                {
                    "task": "KTO_SYNC",
                    "service": "visitors",
                    "operation": operation,
                    "params": params,
                },
                s3_client=s3_client,
                bucket=bucket,
                fetched_at=fetched_at or _utc_now(),
                call=call,
                environ=environ,
            ))
        return {"ok": True, "provider": "KTO", "task": "KTO_VISITORS_DAILY", "jobs": len(results)}
    if payload.get("task") != "KTO_SYNC":
        raise ValueError("KTO collector accepts only task=KTO_SYNC")

    service = payload.get("service")
    operation = payload.get("operation")
    params = payload.get("params", {})
    if service not in KTO_SERVICES:
        raise ValueError(f"Unknown KTO service: {service}")
    if operation not in KTO_SERVICES[service]["operations"]:
        raise ValueError(f"Unknown KTO operation: {service}/{operation}")
    if not isinstance(params, dict):
        raise ValueError("KTO params must be an object")

    attempted_at = fetched_at or _utc_now()
    try:
        result = sync_operation(
            service,
            operation,
            params,
            fetched_at=attempted_at,
            s3_client=s3_client,
            bucket=bucket,
            call=call,
            environ=environ,
        )
    except Exception as error:
        health_state = str(getattr(error, "health_state", "FAILED") or "FAILED")
        provider_code = getattr(error, "code", None)
        reason_code = f"KTO_PROVIDER_{provider_code}" if provider_code else type(error).__name__.upper()
        _update_health(
            s3_client, bucket, service, operation, attempted_at,
            health_state, environ=environ, reason_code=reason_code,
        )
        raise
    _update_health(
        s3_client, bucket, service, operation, attempted_at,
        "SUCCEEDED", environ=environ,
    )
    return result
