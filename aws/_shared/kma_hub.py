"""KMA API 허브 공통 호출 회계 (PHASE 1 안정화, 2026-09-05)

왜 있나
  키 하나를 15개 Lambda 가 나눠 쓰는데 호출 수를 아무도 세지 않았다. 2026-09-05 19:32 KST 에
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
KST = timezone(timedelta(hours=9))

# ── 하루 예산 (2026-09-07 추가, 2026-09-08 정정) ───────────────
# 용량은 **KST 자정**에 풀린다 — 09-05·09-06 이틀 모두 차단 구간이 정확히 자정에 끝났다
# (낙뢰 5분·레이더 5분·AWS 10분 수집기의 403 개수 ÷ 시간당 실행수 = 같은 시각).
#
# 한도는 **약 4,200 으로 재구성됐다**(2026-09-08). 공표값이 아니라 우리 장부에서 되짚은 값이다.
#    창을 KST 로 바로잡고 09-05·09-06·09-07 장부를 이어 붙이면 09-06 은 4,107, 09-07 은 4,136
#    (+장부 밖이던 gk2a-clouds 약 114)으로 두 날이 0.7% 안에서 일치한다. 창의 정당성은
#    5분 수집기의 403 개수가 정확히 5.0시간 차단을 가리키는 것으로 검증했다.
#    고치기 전 사용량 4,535 는 이 한도보다 335 많았다 — 매일 저녁 마른 게 우연이 아니었다.
#    자세한 건 aws/KMA-HUB-BUDGET.md.
#
# ⚠️ 그러므로 이 값은 한도의 추정이 아니라 **우리가 정한 상한**이다.
#    2026-09-08 기준 예상 사용량은 하루 약 2,664회(gk2a-clouds 144 포함,
#    kma-mountain 4회로 감축 반영)로, 상한 2,800 과 재구성 한도 4,200 둘 다 아래다.
DAILY_BUDGET = int(os.environ.get("KMA_DAILY_BUDGET", "2800") or 2800)
# 자정 직후에도 한 회차는 돌 수 있어야 한다. 가장 비싼 회차(kma-mountain ≈125)보다 넉넉히.
BUDGET_GRACE = int(os.environ.get("KMA_BUDGET_GRACE", "200") or 200)
# ⚠️ 늦으면 사람이 위험해지는 자료는 배분에서 빼지 않는다. 예산이 말라도 이건 계속 부른다.
ALWAYS_ON = {"kma-warn", "quake-asia", "kma-lightning", "typhoon-official", "kma-aws-min"}
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
    # ⚠️ 하루의 기준은 KST 다. 허브 용량이 KST 자정에 풀리기 때문에, UTC 로 세면
    #    "오늘 얼마나 남았나"를 영영 알 수 없다(9시간이 어긋난다).
    day = kst_day(now)
    yday = (now.astimezone(KST) - timedelta(days=1)).strftime("%Y-%m-%d")
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


def kst_day(now=None):
    """하루의 경계는 KST 자정이다 — 허브 용량이 그때 풀린다."""
    return (now or datetime.now(timezone.utc)).astimezone(KST).strftime("%Y-%m-%d")


def spent_today(s3, bucket, now=None):
    """오늘(KST) 지금까지 허브를 몇 번 불렀나. 회계 파일이 없으면 None(모름)."""
    doc, _ = _load(s3, bucket, f"{PREFIX}/{kst_day(now)}.json")
    if not doc:
        return None
    try:
        return int((doc.get("total") or {}).get("calls", 0))
    except Exception:  # noqa: BLE001
        return None


def pace(s3, bucket, name, cost=1, now=None):
    """이번 회차를 돌려도 되나 — (ok, 이유) 를 돌려준다.

    왜 있나
      하루 예산에 시각 개념이 없으면 이른 시간 수집기가 다 써버리고 저녁 수집기가 굶는다.
      실제로 2026-09-06·09-07 이틀 다 19시쯤 용량이 말라 특보·AWS·낙뢰가 자정까지 5시간 묵었다.

    어떻게
      자정부터 지금까지 흐른 **시간 비율만큼만** 쓴다. 12시면 하루 예산의 절반까지다.
      ALWAYS_ON(특보·지진·낙뢰·태풍·AWS 실측)은 이 제한을 받지 않는다.

    ⚠️ 실패하면 통과시킨다. 회계를 못 읽었다고 수집을 멈추면 안 된다(회계는 보조 장치다).
    """
    if name in ALWAYS_ON:
        return True, "safety"
    try:
        used = spent_today(s3, bucket, now)
        if used is None:
            return True, "no-ledger"
        t = (now or datetime.now(timezone.utc)).astimezone(KST)
        elapsed = (t.hour * 3600 + t.minute * 60 + t.second) / 86400.0
        allowed = DAILY_BUDGET * elapsed + BUDGET_GRACE
        if used + cost > allowed:
            return False, f"paced: {used}+{cost} > {allowed:.0f} (예산 {DAILY_BUDGET}, {t:%H:%M} KST)"
        return True, f"ok: {used}/{allowed:.0f}"
    except Exception as e:  # noqa: BLE001
        return True, f"pace-check-failed: {e}"


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
