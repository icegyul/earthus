# -*- coding: utf-8 -*-
"""성과 읽기 — SNS FACTORY 신규 모듈 (독립 구현).

읽기 전용이다
  이 파일은 발행 상태를 바꾸지 않는다. PUBLISHED 를 만들지도,
  FAILED 를 지우지도 않는다. analytics 실패는 publish 실패가 아니다.
  그래서 여기서 archive.record_metrics() 를 직접 부르지 않고,
  호출자가 amend() 로 적재할 결과만 만든다.

없는 지표는 만들지 않는다
  플랫폼이 주지 않는 지표는 NOT_AVAILABLE 이다(§33 · §120).
  0 으로 채우면 "성과가 없었다"로 읽힌다. 어댑터의 metrics 목록에
  없는 키가 raw 에 있어도 담지 않는다 — 모르는 숫자를 아카이브에
  넣지 않는다.

비밀을 다루지 않는다
  결과에 토큰·자격증명이 들어갈 자리가 없다. postId·지표값만 있다.
  실제 전송은 어댑터의 transport / social-admin 이 한다.
"""
from datetime import datetime, timezone

FETCH_SCHEMA = "earthus.analytics-fetch.v1"

STATUS_AVAILABLE = "AVAILABLE"
STATUS_NOT_AVAILABLE = "NOT_AVAILABLE"
STATUS_FETCH_FAILED = "FETCH_FAILED"
STATUS_AUTH_FAILED = "AUTH_FAILED"
STATUS_NOT_CONFIGURED = "NOT_CONFIGURED"

# 출처 어휘. live 는 실제 provider transport 에서 실제 응답을 받았을 때만
# 호출자가 증거(via="live")와 함께 달 수 있다. 증거 없는 live 는 없다.
PV_UNAVAILABLE = "unavailable"
PV_STUB = "stub"
PV_LIVE = "live"
PV_ERROR = "error"
PV_UNVERIFIED = "unverified"

# 어댑터 오류 → 읽기 상태. 인증 실패는 실패가 아니라 막힘이다.
_AUTH_CODES = ("INVALID_CREDENTIAL", "PERMISSION_DENIED", "NOT_CONFIGURED",
               "TOKEN_EXPIRED", "X_TOKEN_EXPIRED", "VAULT_NOT_CONFIGURED")
_TRANSIENT_CODES = ("TIMEOUT", "NETWORK_ERROR", "SERVER_ERROR", "TEMPORARY")


def _now_utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch(publication, adapter, *, at=None, via=None):
    """발행 한 건의 지표를 읽는다. adapter 는 sns_adapters 호환 객체다.

    publication: archive_publication() 모양 (postId · platform 필요)
    adapter: .platform · .metrics · .fetch_analytics(publication) 를 갖는다.
      fetch_analytics 가 없으면(구 어댑터) NOT_CONFIGURED 로 끝낸다.
    via: 전송 증거. "live" (실제 provider 응답) 또는 "stub" (시험 경로).
      없으면 지표가 있어도 provenance 는 "unverified" 다 —
      mock 을 live 로 승격하지 않는다.
    """
    now = at or _now_utc()
    platform = (publication or {}).get("platform") \
        or getattr(adapter, "platform", None)
    base = {
        "schemaVersion": FETCH_SCHEMA,
        "platform": platform,
        "contentId": (publication or {}).get("contentId"),
        "postId": (publication or {}).get("postId"),
        "fetchedAt": now,
        "metrics": {},
        "rawReference": None,
        "status": STATUS_NOT_AVAILABLE,
        "reason": None,
        "provenance": PV_UNAVAILABLE,
    }
    if not (publication or {}).get("postId"):
        base["reason"] = "MOCK 발행이라 주소·지표가 없다"
        return base
    fn = getattr(adapter, "fetch_analytics", None)
    if fn is None:
        base["status"] = STATUS_NOT_CONFIGURED
        base["reason"] = "이 어댑터에는 읽기 경로가 없다"
        return base
    try:
        raw = fn(publication) or {}
    except Exception as e:  # noqa: BLE001 — 읽기 실패는 결과로 남긴다
        code = getattr(e, "code", None) or type(e).__name__
        if code in _AUTH_CODES:
            base["status"] = STATUS_AUTH_FAILED
        else:
            base["status"] = STATUS_FETCH_FAILED
        base["reason"] = "%s: %s" % (code, e)
        base["provenance"] = PV_ERROR
        return base
    allowed = tuple(getattr(adapter, "metrics", None) or ())
    values = raw.get("metrics") if isinstance(raw, dict) else None
    if not isinstance(values, dict):
        values = {}
    metrics = {}
    for m in allowed:
        v = values.get(m)
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            # 참/거짓·문자는 지표가 아니다. 0/false 를 숫자로 세지 않는다.
            continue
        metrics[m] = v
    base["metrics"] = metrics
    base["rawReference"] = raw.get("reference")
    if metrics:
        base["status"] = STATUS_AVAILABLE
        if via == PV_LIVE:
            base["provenance"] = PV_LIVE
        elif via == PV_STUB:
            base["provenance"] = PV_STUB
        else:
            base["provenance"] = PV_UNVERIFIED
    else:
        base["reason"] = "플랫폼이 준 지표가 없다"
    return base


def to_record_patch(result):
    """archive.amend() 에 넘길 patch. metrics 계열만 담는다."""
    return {"metricsFetchedAt": result["fetchedAt"]}


def summarize(results):
    """관리 화면 한 줄용. 없는 것을 0개로 속이지 않고 상태별로 센다."""
    by_status = {}
    last = None
    for r in results or []:
        by_status[r.get("status")] = by_status.get(r.get("status"), 0) + 1
        if not last or (r.get("fetchedAt") or "") > last:
            last = r.get("fetchedAt")
    return {"total": len(results or []), "byStatus": by_status,
            "lastFetchedAt": last}
