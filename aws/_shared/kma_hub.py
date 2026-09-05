"""KMA API 허브 공통 호출 회계 (PHASE 1 안정화, 2026-09-05)

왜 있나
  키 하나를 14개 Lambda 가 나눠 쓰는데 호출 수를 아무도 세지 않았다. 2026-09-05 19:32 KST 에
  "일일 최대 호출 용량 제한" 403 이 나서 특보·AWS·부이·레이더가 한꺼번에 묵었고, kma-fcst 는 403 을
  일반 예외로 삼켜 셀 ≈90 × 회차 3 = 270번을 헛돌았다.

무엇을 하나
  · track(label, url): 기존 urlopen 을 감싸 결과를 분류한다 — success / quota_exhausted(403) /
    timeout / upstream_error(5xx·기타 HTTP·연결) / empty / invalid_response(호출자가 표시)
  · 403 은 QUOTA 플래그를 켠다. 호출자는 stop() 이 True 면 더 부르지 않는다.
  · accounted(name): handler 를 감싸 실행이 끝나면(성공·예외 모두) 회계를 S3 에 남긴다.
    wind/kma-calls/{날짜}/{lambda}.json  — Lambda 자기 파일(단일 기록자, 합산)
    wind/kma-calls/{날짜}.json           — 서비스별 합계(IfMatch 로 동시 쓰기 보호)

무엇을 안 하나
  · 허브의 일일 용량값은 모른다 → 적지 않는다. 전일 대비 증감(%)만 계산한다.
  · 기존 Lambda 의 산출물 계약(키·필드)은 건드리지 않는다. 403 이면 그쪽 코드가 하던 대로
    "not-approved" 로 끝나고 S3 를 덮어쓰지 않는다 — 이 모듈은 세기만 한다.
"""
import json
import os
import socket
import threading
import urllib.error
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

KMA_HOST = "apihub.kma.go.kr"
FIELDS = ("calls", "success", "quota_exhausted", "timeout", "upstream_error", "empty", "invalid_response")
PREFIX = "wind/kma-calls"


class QuotaExhausted(Exception):
    """허브가 일일 용량 초과(403)를 냈다. 이 실행에서는 더 부르지 않는다."""


class Ledger:
    def __init__(self):
        self.lock = threading.Lock()
        self.reset()

    def reset(self):
        self.counts = {f: 0 for f in FIELDS}
        self.endpoints = {}
        self.quota_hit = False
        self.last_error = None

    def _bump(self, endpoint, field):
        with self.lock:
            self.counts["calls"] += 1 if field == "calls" else 0
            self.counts[field] += 1 if field != "calls" else 0
            ep = self.endpoints.setdefault(endpoint, {f: 0 for f in FIELDS})
            ep["calls"] += 1 if field == "calls" else 0
            ep[field] += 1 if field != "calls" else 0

    def record(self, endpoint, field, error=None):
        self._bump(endpoint, "calls")
        self._bump(endpoint, field)
        if field == "quota_exhausted":
            self.quota_hit = True
        if error:
            self.last_error = f"{endpoint}: {error}"[:200]

    def reclassify(self, endpoint, field):
        """success 로 셌는데 본문이 비었거나 깨졌을 때 — 호출자가 부른다."""
        with self.lock:
            if self.counts["success"] > 0:
                self.counts["success"] -= 1
                self.counts[field] += 1
                ep = self.endpoints.setdefault(endpoint, {f: 0 for f in FIELDS})
                if ep["success"] > 0:
                    ep["success"] -= 1
                ep[field] += 1


ledger = Ledger()


def stop():
    """이 실행에서 허브를 더 불러도 되나? — 403 을 한 번이라도 봤으면 False 다."""
    return ledger.quota_hit


def endpoint_label(label, url=None):
    src = url or label or "?"
    if not isinstance(src, str):
        return str(label or "?")
    path = src.split("?", 1)[0]
    if "/" in path:
        path = path.rstrip("/").rsplit("/", 1)[-1]
    return path or str(label or "?")


def classify(exc):
    """예외 → 회계 필드. 원인을 뭉개지 않는다(지시서 §5)."""
    if isinstance(exc, QuotaExhausted):
        return "quota_exhausted"
    if isinstance(exc, urllib.error.HTTPError):
        if exc.code == 403:
            return "quota_exhausted"
        return "upstream_error"
    if isinstance(exc, (socket.timeout, TimeoutError)):
        return "timeout"
    if isinstance(exc, urllib.error.URLError):
        reason = str(getattr(exc, "reason", exc)).lower()
        return "timeout" if "timed out" in reason or "timeout" in reason else "upstream_error"
    if isinstance(exc, (ValueError, json.JSONDecodeError, UnicodeDecodeError)):
        return "invalid_response"
    return "upstream_error"


@contextmanager
def track(label, url=None):
    """with kma_hub.track("wrn_now_data", url), urllib.request.urlopen(...) as r: — 이렇게 감싼다.
    허브가 아닌 호스트(JMA·NHC 등)는 세지 않는다. 예외는 분류만 하고 그대로 다시 던진다."""
    is_hub = url is None or (isinstance(url, str) and KMA_HOST in url)
    ep = endpoint_label(label, url)
    if is_hub and ledger.quota_hit:
        # 이미 용량 초과를 봤다 — 부르지 않고 끝낸다. 호출자는 stop() 으로 먼저 걸러야 하지만 이중 안전장치.
        raise QuotaExhausted(f"{ep}: 이 실행에서 이미 403 을 받았다")
    try:
        yield
    except Exception as exc:
        if is_hub:
            ledger.record(ep, classify(exc), error=f"{type(exc).__name__}: {str(exc)[:80]}")
        raise
    else:
        if is_hub:
            ledger.record(ep, "success")


def note_empty(label, url=None):
    ledger.reclassify(endpoint_label(label, url), "empty")


def note_invalid(label, url=None):
    ledger.reclassify(endpoint_label(label, url), "invalid_response")


# ── 저장 ─────────────────────────────────────────────────────
def _merge(dst, src):
    for f in FIELDS:
        dst[f] = int(dst.get(f, 0)) + int(src.get(f, 0))
    return dst


def _load(s3, bucket, key):
    try:
        o = s3.get_object(Bucket=bucket, Key=key)
        return json.loads(o["Body"].read().decode("utf-8")), o.get("ETag")
    except Exception:
        return None, None


def _put(s3, bucket, key, doc, if_match=None):
    kw = {"Bucket": bucket, "Key": key, "Body": json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode(),
          "ContentType": "application/json; charset=utf-8", "CacheControl": "no-cache"}
    if if_match:
        kw["IfMatch"] = if_match
    s3.put_object(**kw)


def flush(s3, bucket, name, now=None):
    """이 실행의 회계를 S3 에 더한다. 실패해도 handler 결과를 바꾸지 않는다(회계 때문에 수집이 죽으면 안 된다)."""
    if not bucket or not ledger.counts["calls"] and not ledger.quota_hit:
        return None
    now = now or datetime.now(timezone.utc)
    day = now.strftime("%Y-%m-%d")
    yday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    delta = dict(ledger.counts)
    endpoints = {k: dict(v) for k, v in ledger.endpoints.items()}
    stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        own_key = f"{PREFIX}/{day}/{name}.json"
        own, _ = _load(s3, bucket, own_key)
        own = own or {"date": day, "lambda": name, "runs": 0, "endpoints": {}, **{f: 0 for f in FIELDS}}
        _merge(own, delta)
        own["runs"] = int(own.get("runs", 0)) + 1
        for ep, c in endpoints.items():
            own["endpoints"][ep] = _merge(own["endpoints"].get(ep, {}), c)
        own["lastRunAt"] = stamp
        own["lastError"] = ledger.last_error
        own["quotaHitToday"] = bool(own.get("quotaHitToday")) or ledger.quota_hit
        _put(s3, bucket, own_key, own)
    except Exception as e:  # noqa: BLE001
        print(f"[kma-hub] own ledger write failed: {e}")
    for attempt in range(4):
        try:
            key = f"{PREFIX}/{day}.json"
            doc, etag = _load(s3, bucket, key)
            if not doc:
                doc = {"schema": "earthus.kma-calls.v1", "date": day, "services": {}, "note": {
                    "ko": "KMA API 허브 호출 회계. 허브의 일일 용량값은 확인되지 않아 적지 않는다 — 우리 쪽 사용량 추세만 기록한다.",
                    "fields": "calls=시도, success, quota_exhausted(403), timeout, upstream_error(5xx·연결), empty, invalid_response"}}
            svc = doc["services"].setdefault(name, {f: 0 for f in FIELDS})
            _merge(svc, delta)
            svc["lastRunAt"] = stamp
            svc["quotaHitToday"] = bool(svc.get("quotaHitToday")) or ledger.quota_hit
            total = {f: sum(int(s.get(f, 0)) for s in doc["services"].values()) for f in FIELDS}
            doc["total"] = total
            ydoc, _ = _load(s3, bucket, f"{PREFIX}/{yday}.json")
            y_calls = int(((ydoc or {}).get("total") or {}).get("calls", 0)) if ydoc else None
            doc["trend"] = {"yesterday_calls": y_calls, "today_calls": total["calls"],
                            "delta_percent": (round((total["calls"] - y_calls) / y_calls * 100, 1) if y_calls else None),
                            "note": "전일 총합 대비. 용량 한도가 아니라 우리 사용량의 추세다."}
            doc["generated"] = stamp
            doc["quotaHitToday"] = any(bool(s.get("quotaHitToday")) for s in doc["services"].values())
            _put(s3, bucket, key, doc, if_match=etag)
            return doc
        except Exception as e:  # noqa: BLE001 — 412(동시 쓰기)면 다시 읽어 합친다
            code = getattr(getattr(e, "response", None), "get", lambda *_: {})("Error", {}).get("Code", "") if hasattr(e, "response") else ""
            if code not in ("PreconditionFailed", "412") and attempt >= 1:
                print(f"[kma-hub] summary write failed: {e}")
                return None
    return None


def accounted(name):
    """@kma_hub.accounted("kma-warn") — handler 가 어떻게 끝나든 회계를 남긴다."""
    def deco(fn):
        def wrapped(event=None, context=None):
            ledger.reset()
            try:
                return fn(event, context)
            finally:
                try:
                    import boto3
                    bucket = os.environ.get("CACHE_BUCKET", "")
                    region = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
                    if bucket:
                        flush(boto3.client("s3", region_name=region), bucket, name)
                except Exception as e:  # noqa: BLE001
                    print(f"[kma-hub] flush skipped: {e}")
        wrapped.__name__ = getattr(fn, "__name__", "handler")
        wrapped.__wrapped__ = fn
        return wrapped
    return deco
