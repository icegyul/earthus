"""KTO 수집 결과를 원문 근거와 공개 정규화 산출물로 분리 저장한다."""

from __future__ import annotations

import hashlib
import json
import re
import time
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
# 지역 파라미터가 필수인 서비스의 스윕 범위. 코드는 하드코딩하지 않고
# 공식 방문자수 스냅샷(regionCode)에서만 가져온다.
REGION_SWEEP_SCOPE = {
    "related": "SIGUNGU",
    "localHub": "SIGUNGU",
    "concentration": "SIGUNGU",
    "diversity": "SIDO",
    "demandStrength": "SIDO",
}
REGION_SWEEP_NEEDS_BASE_YM = frozenset({"related", "localHub", "diversity", "demandStrength"})
KTO_PROVIDER_LEASE_KEY = "archive/tourism/kto/locks/provider.json"
KTO_PROVIDER_LEASE_SECONDS = 900


class KtoSyncBusy(RuntimeError):
    """같은 공공데이터포털 키를 쓰는 KTO 수집이 이미 진행 중이다."""

    health_state = "DEGRADED"

    def __init__(self):
        super().__init__("KTO_SYNC_BUSY")


def _canonical_bytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _safe_params(params):
    return {
        str(name): value
        for name, value in (params or {}).items()
        if not any(marker in str(name).lower() for marker in ("key", "secret", "token", "password"))
    }


def _put_json(
    s3_client,
    bucket,
    key,
    document,
    cache_control,
    private=False,
    if_none_match=False,
    if_match=None,
):
    args = {
        "Bucket": bucket,
        "Key": key,
        "Body": _canonical_bytes(document),
        "ContentType": "application/json; charset=utf-8",
        "CacheControl": cache_control,
    }
    if private:
        args["ServerSideEncryption"] = "AES256"
    if if_none_match:
        args["IfNoneMatch"] = "*"
    if if_match:
        args["IfMatch"] = if_match
    s3_client.put_object(**args)


def _read_json_with_etag(s3_client, bucket, key):
    try:
        response = s3_client.get_object(Bucket=bucket, Key=key)
        raw = response["Body"].read()
        return json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw), response.get("ETag")
    except Exception:
        return None, None


def _read_json(s3_client, bucket, key):
    document, _ = _read_json_with_etag(s3_client, bucket, key)
    return document


def _parse_utc(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def _lease_error_code(error):
    response = getattr(error, "response", None)
    code = response.get("Error", {}).get("Code") if isinstance(response, dict) else None
    return str(code or "")


def _lease_is_live(document, at):
    expires_at = _parse_utc((document or {}).get("expiresAt"))
    return expires_at is not None and expires_at > at


def _acquire_provider_lease(s3_client, bucket, fetched_at):
    """S3 조건부 쓰기로 공용 KTO 인증키의 동시 수집을 하나로 제한한다.

    ⚠️ 이 Lambda 역할에는 DeleteObject가 없다. 만료된 lease는 ETag가 같은 경우에만
    PutObject로 교체해, 권한을 넓히지 않고도 원자적인 단일 수집을 유지한다.
    """
    now = _parse_utc(fetched_at) or datetime.now(timezone.utc)
    current, current_etag = _read_json_with_etag(s3_client, bucket, KTO_PROVIDER_LEASE_KEY)
    # 잠금 문서가 훼손됐을 때 이를 "만료"로 간주하면 공용 키 호출이 겹칠 수 있다.
    if current is not None and not isinstance(current, dict):
        raise KtoSyncBusy()
    if _lease_is_live(current, now):
        raise KtoSyncBusy()

    document = {
        "schemaVersion": "earthus.kto-provider-lease.v1",
        "provider": "KTO",
        "leaseScope": "KTO_SHARED_PROVIDER_KEY",
        "acquiredAt": now.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "expiresAt": (now + timedelta(seconds=KTO_PROVIDER_LEASE_SECONDS)).isoformat(
            timespec="seconds"
        ).replace("+00:00", "Z"),
    }
    try:
        _put_json(
            s3_client, bucket, KTO_PROVIDER_LEASE_KEY, document,
            "private, no-store", private=True,
            if_none_match=current is None,
            if_match=current_etag if current is not None else None,
        )
    except Exception as error:
        if _lease_error_code(error) in ("412", "PreconditionFailed", "ConditionalRequestConflict"):
            raise KtoSyncBusy() from None
        raise
    return document


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
    page_size=None,
):
    """한 Operation을 호출해 원문을 먼저 쓰고 정규화 결과를 공개한다."""
    if call is None:
        env = environ or {}
        page_size = int(page_size or env.get("KTO_DEFAULT_PAGE_SIZE") or 100)
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


def _default_base_ym(value):
    """집계 지연을 감안해 기준 시점보다 두 달 전을 기본 조회 월로 쓴다."""
    now = _parse_utc(value) or datetime.now(timezone.utc)
    year, month = now.year, now.month - 2
    if month < 1:
        month += 12
        year -= 1
    return f"{year:04d}{month:02d}"


def _published_item_count(s3_client, bucket, service, operation):
    document = _read_json(s3_client, bucket, f"app/tourism/kto/{service}/{operation}.json")
    items = (document or {}).get("items")
    return len(items) if isinstance(items, list) else 0


def _run_visitor_window(
    operation, start_date, end_date, s3_client, bucket, fetched_at, call, environ, _lease, sleep,
):
    """지역별 방문자수는 조회 범위를 줘도 시작일 하루만 응답한다.

    하루씩 나눠 호출한 뒤 한 스냅샷으로 합친다. 합계가 비었는데 이미 공개된
    스냅샷에 값이 있으면 덮어쓰지 않는다. 빈 응답으로 실데이터를 지우면
    화면에서 근거가 사라지고, 사라진 이유도 남지 않는다.
    """
    env = environ or {}
    # 결과를 한 스냅샷으로 합치므로 페이지를 잘게 나눌 이유가 없다.
    # 페이지 간 대기(KTO_PAGE_INTERVAL_MS, 기본 1초)가 지역/날짜 수만큼
    # 곱해지면 Lambda 실행 한도를 넘긴다.
    page_size = int(env.get("KTO_AGGREGATE_PAGE_SIZE") or 1000)
    pacing = max(0.0, min(10.0, float(env.get("KTO_SWEEP_PACING_SECONDS") or 0.2)))
    pause = time.sleep if sleep is None else sleep
    items = []
    failed_days = []
    day = start_date
    index = 0
    while day <= end_date:
        stamp = day.strftime("%Y%m%d")
        day_params = {"startYmd": stamp, "endYmd": stamp}
        if index and pacing:
            pause(pacing)
        try:
            if call is None:
                day_items = fetch_all_pages(
                    "visitors", operation, day_params, page_size=page_size, environ=environ,
                )
            else:
                envelope = call("visitors", operation, dict(day_params))
                day_items = envelope.get("items") if isinstance(envelope, dict) else []
                day_items = day_items if isinstance(day_items, list) else []
            items.extend(day_items)
        except Exception:
            failed_days.append(stamp)
        day += timedelta(days=1)
        index += 1

    day_count = index
    if failed_days and len(failed_days) == day_count:
        _update_health(
            s3_client, bucket, "visitors", operation, fetched_at,
            "FAILED", environ=environ, reason_code="KTO_VISITOR_WINDOW_ALL_DAYS_FAILED",
        )
        raise RuntimeError(f"KTO visitor window failed for all {day_count} days")
    if not items and _published_item_count(s3_client, bucket, "visitors", operation):
        _update_health(
            s3_client, bucket, "visitors", operation, fetched_at,
            "DEGRADED", environ=environ, reason_code="KTO_VISITOR_WINDOW_EMPTY_KEPT_PRIOR",
        )
        return {
            "ok": True, "provider": "KTO", "service": "visitors", "operation": operation,
            "published": False, "reasonCode": "EMPTY_RESPONSE_KEPT_PRIOR_SNAPSHOT",
            "dayCount": day_count, "failedDayCount": len(failed_days),
        }

    aggregated = {
        "resultCode": "00",
        "resultMsg": "NORMAL_SERVICE",
        "pageNo": 1,
        "numOfRows": page_size,
        "totalCount": len(items),
        "items": items,
    }
    result = handle_event(
        {
            "task": "KTO_SYNC", "service": "visitors", "operation": operation,
            "params": {
                "startYmd": start_date.strftime("%Y%m%d"),
                "endYmd": end_date.strftime("%Y%m%d"),
                "dayCount": day_count,
                "failedDayCount": len(failed_days),
            },
        },
        s3_client=s3_client, bucket=bucket, fetched_at=fetched_at,
        call=lambda *_: aggregated, environ=environ, _lease=_lease, sleep=sleep,
    )
    result.update({"published": True, "dayCount": day_count, "failedDayCount": len(failed_days)})
    return result


def _visitor_region_codes(s3_client, bucket, operation, pattern):
    document = _read_json(s3_client, bucket, f"app/tourism/kto/visitors/{operation}.json")
    items = (document or {}).get("items")
    codes = {
        str(item.get("regionCode") or "")
        for item in (items if isinstance(items, list) else [])
        if isinstance(item, dict)
    }
    return sorted(code for code in codes if re.fullmatch(pattern, code))


def _run_region_sweep(payload, s3_client, bucket, fetched_at, call, environ, _lease, sleep):
    """지역 코드가 필수인 서비스 하나를 전 지역에 걸쳐 수집해 스냅샷 하나로 발행한다.

    지역 코드는 하드코딩하지 않는다. 공식 방문자수 정규화 스냅샷의 regionCode
    (locgo=시군구 5자리, metco=시도 2자리)를 유일한 근거로 쓰므로,
    방문자수 수집(KTO_VISITORS_DAILY)이 먼저 성공해 있어야 한다.
    """
    service = payload.get("service")
    operation = payload.get("operation")
    scope = REGION_SWEEP_SCOPE.get(service)
    if scope is None:
        raise ValueError(f"KTO_REGION_SWEEP does not cover service: {service}")
    if operation not in KTO_SERVICES[service]["operations"]:
        raise ValueError(f"Unknown KTO operation: {service}/{operation}")

    if scope == "SIGUNGU":
        codes = _visitor_region_codes(s3_client, bucket, "locgoRegnVisitrDDList", r"\d{5}")
    else:
        codes = _visitor_region_codes(s3_client, bucket, "metcoRegnVisitrDDList", r"\d{2}")
    if not codes:
        raise ValueError(
            "KTO_REGION_SWEEP has no region codes: run KTO_VISITORS_DAILY first "
            "so the visitors snapshot provides official regionCode values"
        )
    offset = int(payload.get("regionOffset") or 0)
    max_regions = payload.get("maxRegions")
    selected = codes[offset:offset + int(max_regions)] if max_regions else codes[offset:]
    if not selected:
        raise ValueError("KTO_REGION_SWEEP regionOffset/maxRegions selects no regions")

    # baseYm을 받지 않는 서비스(concentration)에 배치 공통값이 새어 들어가면
    # 계약에 없는 파라미터를 공급자에게 보내게 된다.
    if service in REGION_SWEEP_NEEDS_BASE_YM:
        base_ym = str(payload.get("baseYm") or "") or _default_base_ym(fetched_at)
        if not re.fullmatch(r"\d{6}", base_ym):
            raise ValueError("KTO_REGION_SWEEP baseYm must be YYYYMM")
    else:
        base_ym = None

    env = environ or {}
    # 결과를 한 스냅샷으로 합치므로 페이지를 잘게 나눌 이유가 없다.
    # 페이지 간 대기(KTO_PAGE_INTERVAL_MS, 기본 1초)가 지역/날짜 수만큼
    # 곱해지면 Lambda 실행 한도를 넘긴다.
    page_size = int(payload.get("pageSize") or env.get("KTO_AGGREGATE_PAGE_SIZE") or 1000)
    # 연관 관광지는 시군구 한 곳이 1,500행을 넘긴다. 270곳을 그대로 합치면
    # 스냅샷이 수십만 행이 되어 브라우저에 내보낼 수 없다. 지역당 페이지 상한을
    # 두고, 잘린 지역 수를 원문 증거에 남겨 커버리지를 속이지 않는다.
    page_limit = payload.get("pageLimit")
    page_limit = int(page_limit) if page_limit else None
    pacing = max(0.0, min(10.0, float(env.get("KTO_SWEEP_PACING_SECONDS") or 0.2)))
    pause = time.sleep if sleep is None else sleep
    items = []
    failed_regions = []
    truncated_regions = []
    for index, code in enumerate(selected):
        region_params = {"areaCd": code[:2], "signguCd": code} if scope == "SIGUNGU" else {"areaCd": code}
        if base_ym:
            region_params["baseYm"] = base_ym
        if index and pacing:
            pause(pacing)
        try:
            if call is None:
                if page_limit:
                    region_items, region_truncated = fetch_all_pages(
                        service, operation, region_params,
                        page_size=page_size, environ=environ, max_pages=page_limit,
                    )
                    if region_truncated:
                        truncated_regions.append(code)
                else:
                    region_items = fetch_all_pages(
                        service, operation, region_params,
                        page_size=page_size, environ=environ,
                    )
            else:
                envelope = call(service, operation, dict(region_params))
                region_items = envelope.get("items") if isinstance(envelope, dict) else []
                region_items = region_items if isinstance(region_items, list) else []
                if page_limit and len(region_items) >= page_size:
                    truncated_regions.append(code)
        except Exception:
            failed_regions.append(code)
            continue
        items.extend(region_items)
    if failed_regions and len(failed_regions) == len(selected):
        _update_health(
            s3_client, bucket, service, operation, fetched_at,
            "FAILED", environ=environ, reason_code="KTO_REGION_SWEEP_ALL_REGIONS_FAILED",
        )
        raise RuntimeError(f"KTO_REGION_SWEEP failed for all {len(selected)} regions")

    aggregated = {
        "resultCode": "00",
        "resultMsg": "NORMAL_SERVICE",
        "pageNo": 1,
        "numOfRows": page_size,
        "totalCount": len(items),
        "items": items,
    }
    sweep_params = {
        "regionScope": scope,
        "regionCount": len(selected),
        "failedRegionCount": len(failed_regions),
        "truncatedRegionCount": len(truncated_regions),
        "pageLimitPerRegion": page_limit,
    }
    if base_ym:
        sweep_params["baseYm"] = base_ym
    result = handle_event(
        {"task": "KTO_SYNC", "service": service, "operation": operation, "params": sweep_params},
        s3_client=s3_client, bucket=bucket, fetched_at=fetched_at,
        call=lambda *_: aggregated, environ=environ, _lease=_lease, sleep=sleep,
    )
    result.update({
        "task": "KTO_REGION_SWEEP",
        "regionCount": len(selected),
        "failedRegionCount": len(failed_regions),
        "truncatedRegionCount": len(truncated_regions),
    })
    return result


def handle_event(
    event, s3_client, bucket, fetched_at=None, call=None, environ=None,
    _lease=None, sleep=None, monotonic=None,
):
    """명시된 KTO Operation 하나만 실행한다."""
    payload = event if isinstance(event, dict) else {}
    if _lease is None:
        acquired_at = fetched_at or _utc_now()
        lease = _acquire_provider_lease(s3_client, bucket, acquired_at)
        return handle_event(
            payload, s3_client=s3_client, bucket=bucket, fetched_at=acquired_at,
            call=call, environ=environ, _lease=lease, sleep=sleep, monotonic=monotonic,
        )
    if payload.get("task") == "KTO_VISITORS_DAILY":
        raw_as_of = payload.get("asOf") or fetched_at or _utc_now()
        try:
            as_of = datetime.fromisoformat(str(raw_as_of).replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("KTO visitors asOf must be an ISO-8601 timestamp") from error
        if as_of.tzinfo is None:
            as_of = as_of.replace(tzinfo=timezone.utc)
        # 기본은 어제까지 7일. 공급자 집계 지연으로 최근 창이 비면
        # lagDays/windowDays로 과거 구간을 명시 재수집한다(최대 90일).
        lag_days = int(payload.get("lagDays") or 1)
        window_days = int(payload.get("windowDays") or 7)
        if not (1 <= lag_days <= 60 and 1 <= window_days <= 90):
            raise ValueError("KTO visitors lagDays must be 1-60 and windowDays 1-90")
        end_date = as_of.astimezone(timezone.utc).date() - timedelta(days=lag_days)
        start_date = end_date - timedelta(days=window_days - 1)
        results = []
        for operation in ("metcoRegnVisitrDDList", "locgoRegnVisitrDDList"):
            results.append(_run_visitor_window(
                operation,
                start_date,
                end_date,
                s3_client=s3_client,
                bucket=bucket,
                fetched_at=fetched_at or _utc_now(),
                call=call,
                environ=environ,
                _lease=_lease,
                sleep=sleep,
            ))
        return {
            "ok": True, "provider": "KTO", "task": "KTO_VISITORS_DAILY",
            "jobs": len(results), "results": results,
        }
    if payload.get("task") == "KTO_REGION_SWEEP":
        return _run_region_sweep(
            payload, s3_client=s3_client, bucket=bucket,
            fetched_at=fetched_at or _utc_now(), call=call, environ=environ,
            _lease=_lease, sleep=sleep,
        )
    if payload.get("task") == "KTO_SWEEP_BATCH":
        # 공용 키 lease가 15분 단위라 Operation마다 호출하면 하루가 걸린다.
        # 이미 획득한 lease 하나 안에서 여러 스윕을 순서대로 끝낸다.
        jobs = payload.get("jobs")
        if not isinstance(jobs, list) or not jobs or len(jobs) > 12:
            raise ValueError("KTO_SWEEP_BATCH requires a jobs list of 1-12 entries")
        budget = float(payload.get("budgetSeconds") or 240)
        if not 30 <= budget <= 280:
            raise ValueError("KTO_SWEEP_BATCH budgetSeconds must be 30-280")
        clock = time.monotonic if monotonic is None else monotonic
        started = clock()
        completed, failed, skipped = [], [], []
        for job in jobs:
            if not isinstance(job, dict):
                raise ValueError("KTO_SWEEP_BATCH jobs must be objects")
            label = f"{job.get('service')}/{job.get('operation')}"
            if clock() - started >= budget:
                skipped.append(label)
                continue
            try:
                if REGION_SWEEP_SCOPE.get(job.get("service")):
                    completed.append(_run_region_sweep(
                        {**payload, **job, "task": "KTO_REGION_SWEEP"},
                        s3_client=s3_client, bucket=bucket,
                        fetched_at=fetched_at or _utc_now(), call=call, environ=environ,
                        _lease=_lease, sleep=sleep,
                    ))
                else:
                    # 지역 파라미터가 없는 전체 동기화(무장애·웰니스·영문)도
                    # 같은 lease 안에서 갱신한다. 페이지 크기를 키우지 않으면
                    # 25,000건짜리 영문 콘텐츠가 페이지 대기만으로 한도를 넘긴다.
                    env = environ or {}
                    completed.append(handle_event(
                        {
                            "task": "KTO_SYNC",
                            "service": job.get("service"),
                            "operation": job.get("operation"),
                            "params": job.get("params") or {},
                            "pageSize": int(env.get("KTO_AGGREGATE_PAGE_SIZE") or 1000),
                        },
                        s3_client=s3_client, bucket=bucket,
                        fetched_at=fetched_at or _utc_now(), call=call, environ=environ,
                        _lease=_lease, sleep=sleep,
                    ))
            except Exception as error:
                failed.append({"job": label, "reasonCode": type(error).__name__.upper()})
        return {
            "ok": not failed and not skipped,
            "provider": "KTO",
            "task": "KTO_SWEEP_BATCH",
            "completed": completed,
            "failed": failed,
            "skippedForBudget": skipped,
        }
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
            page_size=payload.get("pageSize"),
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
