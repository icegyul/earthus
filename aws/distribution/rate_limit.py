# -*- coding: utf-8 -*-
"""플랫폼 속도 제한 — SNS FACTORY 신규 모듈 (독립 구현).

왜 새 파일인가
  지금까지 상한을 두는 곳이 없었다. 429 를 맞고 나서야 쉬는 구조였다.
  영구 실패를 재시도하면 한도만 쓰므로(§29 · §113 · §114),
  보내기 전에 각 플랫폼의 남은 자리를 여기서 먼저 본다.

무엇을 하지 않나
  · 플랫폼별 한도 숫자를 여기서 지어내지 않는다. 실제 API 계약이나
    운영에서 실측한 값만 `configure()` 로 넣는다. 모르는 플랫폼은
    UNKNOWN 으로 두고 강제하지 않는다 — 없는 상한을 만드는 것이
    보내야 할 것을 막는 일보다 낫지 않다.
  · 토큰·비밀을 다루지 않는다. 이 파일이 만지는 것은 숫자뿐이다.

어휘 (§16 · §28 · §114)
  · OK            지금 보내도 된다
  · RETRYABLE     지금은 안 된다. 나중에 다시 (rate limit · 일시 실패)
  · NON_RETRYABLE 다시 보내도 안 된다 (인증 · 권한 · 형식 오류)
"""
from datetime import datetime, timedelta, timezone

STATE_SCHEMA = "earthus.rate-limit-state.v1"

DECISION_OK = "OK"
RETRYABLE = "RETRYABLE"
NON_RETRYABLE = "NON_RETRYABLE"

# 마지막 수단 대기(분). 플랫폼이 retry-after 를 주지 않았을 때만 쓴다.
# publish_queue.BACKOFF_MINUTES 와 같은 값이다 — 두 곳에 다른 backoff 가
# 있으면 같은 실패가 큐와 여기서 다르게 쉰다.
FALLBACK_BACKOFF_MINUTES = (1, 5, 20, 60)

# 다시 보내도 안 되는 오류. 여기서 만나면 즉시 FAILED 다.
# publish_queue.mark_failed(kind=PERMANENT) 와 같은 방향이다.
NON_RETRYABLE_CODES = (
    "INVALID_CREDENTIAL",
    "PERMISSION_DENIED",
    "PLATFORM_INVALID",
    "PUBLISH_CONFIRMATION_REQUIRED",
    "NOT_CONFIGURED",
    "TRANSPORT_NOT_CONFIGURED",
)

# 다시 보내 볼 만한 오류.
RETRYABLE_CODES = (
    "RATE_LIMITED",
    "TEMPORARY",
    "TIMEOUT",
    "NETWORK_ERROR",
    "SERVER_ERROR",
)


def _now_utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse(iso):
    try:
        t = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return t


def _plus_minutes(iso, minutes):
    t = _parse(iso)
    if t is None:
        return iso
    return (t + timedelta(minutes=minutes)).astimezone(timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ")


def new_state(provider, *, limit=None, window_seconds=None, remaining=None,
              reset_at=None, at=None):
    """상한 상태 하나. limit 을 모르면 None 으로 둔다 — 0 으로 두지 않는다.

    0 으로 두면 "자리가 없다"로 읽혀 아무것도 안 나간다.
    모르는 것과 없는 것은 다르다(eligibility.py 의 UNKNOWN 과 같은 규칙).
    """
    return {
        "schemaVersion": STATE_SCHEMA,
        "provider": provider,
        "limit": limit,
        "windowSeconds": window_seconds,
        "remaining": remaining if remaining is not None else limit,
        "resetAt": reset_at,
        "retryAfter": None,
        "retryAfterAt": None,
        "updatedAt": at or _now_utc(),
    }


def configure(state, *, limit, window_seconds, at=None):
    """실제 계약·실측값으로 상한을 넣는다. 호출자가 출처를 안다는 전제다."""
    if not isinstance(limit, int) or limit <= 0:
        raise ValueError("limit 은 1 이상의 정수여야 한다")
    if not isinstance(window_seconds, int) or window_seconds <= 0:
        raise ValueError("window_seconds 는 1 이상의 정수여야 한다")
    out = dict(state)
    out["limit"] = limit
    out["windowSeconds"] = window_seconds
    if out.get("remaining") is None:
        out["remaining"] = limit
    out["updatedAt"] = at or _now_utc()
    return out


def check(state, *, now=None):
    """지금 보내도 되는가. {decision, reason, waitMinutes}."""
    now = now or _now_utc()
    if state.get("retryAfterAt") and state["retryAfterAt"] > now:
        return {"decision": RETRYABLE, "reason": "retry-after 대기 중",
                "waitMinutes": None, "retryAfterAt": state["retryAfterAt"]}
    reset_at = state.get("resetAt")
    if state.get("limit") is None:
        return {"decision": DECISION_OK, "reason": "상한 미설정 — 강제하지 않음",
                "waitMinutes": 0}
    if reset_at and reset_at <= now:
        # 창이 지났다. 자리는 다 찼다고 본다 — 쓴 기록이 없으므로.
        return {"decision": DECISION_OK, "reason": "창 경과 — 자리 회복",
                "waitMinutes": 0}
    remaining = state.get("remaining")
    if remaining is not None and remaining <= 0:
        return {"decision": RETRYABLE, "reason": "자리 소진 — reset 대기",
                "waitMinutes": None, "resetAt": reset_at}
    return {"decision": DECISION_OK, "reason": "자리 있음", "waitMinutes": 0}


def consume(state, *, at=None):
    """하나 보냈다고 기록한다. 상한 미설정이면 세지 않는다."""
    out = dict(state)
    if out.get("limit") is None or out.get("remaining") is None:
        out["updatedAt"] = at or _now_utc()
        return out
    out["remaining"] = max(0, out["remaining"] - 1)
    out["updatedAt"] = at or _now_utc()
    return out


def record_429(state, *, retry_after_seconds=None, attempt=1, at=None):
    """429 를 맞았다. 언제 다시 볼지를 적는다. 자리 숫자는 건드리지 않는다."""
    now = at or _now_utc()
    if retry_after_seconds is not None:
        try:
            wait = max(0, int(retry_after_seconds))
        except (TypeError, ValueError):
            wait = None
    else:
        wait = None
    if wait is None:
        wait = FALLBACK_BACKOFF_MINUTES[
            min(max(attempt - 1, 0), len(FALLBACK_BACKOFF_MINUTES) - 1)] * 60
    t = _parse(now)
    retry_after_at = (t + timedelta(seconds=wait)).astimezone(timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ") if t is not None else now
    out = dict(state)
    out["retryAfter"] = wait
    out["retryAfterAt"] = retry_after_at
    out["updatedAt"] = now
    return out


def record_reset(state, *, reset_at=None, at=None):
    """창이 새로 열렸다. 자리는 다 찼다고 본다."""
    out = dict(state)
    now = at or _now_utc()
    if reset_at is not None:
        out["resetAt"] = reset_at
    if out.get("limit") is not None:
        out["remaining"] = out["limit"]
    out["retryAfter"] = None
    out["retryAfterAt"] = None
    out["updatedAt"] = now
    return out


def classify_error(code):
    """오류 코드를 재시도 판단으로 옮긴다. 모르는 코드는 재시도하지 않는다."""
    if code in NON_RETRYABLE_CODES:
        return NON_RETRYABLE
    if code in RETRYABLE_CODES:
        return RETRYABLE
    return NON_RETRYABLE


def backoff_minutes(attempt):
    """몇 번째 시도에 몇 분 쉬는가. publish_queue 와 같은 표다."""
    return FALLBACK_BACKOFF_MINUTES[
        min(max(attempt - 1, 0), len(FALLBACK_BACKOFF_MINUTES) - 1)]


def next_attempt_at(now, wait_minutes):
    return _plus_minutes(now, wait_minutes)


# ── SNS FACTORY: 범위별 설정 (추가만. 미설정=미강제 유지) ─────────────────
def scoped_key(provider, account=None, operation=None):
    """결정적 범위 키. 비밀을 넣지 않는다 — 호출자가 넣은 것만 들어간다.

    계층: provider → provider:operation → provider:account:operation.
    account 는 식별자(ID)만 쓴다. 토큰·비밀을 키로 쓰지 않는다.
    """
    parts = [str(provider)]
    if account is not None:
        parts.append(str(account))
    if operation is not None:
        parts.append(str(operation))
    return ":".join(parts)


def empty_config():
    """값 없음. 강제하지 않는다."""
    return {"limit": None, "windowSeconds": None, "configured": False,
            "enforced": False}


def make_config(limit, window_seconds):
    """명시값만 받는다. 0·음수·문자는 거부한다 — 지어내지 않는다."""
    if not isinstance(limit, int) or limit <= 0:
        raise ValueError("limit 은 1 이상의 정수여야 한다")
    if not isinstance(window_seconds, int) or window_seconds <= 0:
        raise ValueError("window_seconds 는 1 이상의 정수여야 한다")
    return {"limit": limit, "windowSeconds": window_seconds,
            "configured": True, "enforced": True}


def load_config(mapping, *, at=None):
    """{scope_key: {limit, window_seconds}} → {scope_key: state}.

    없는 범위는 만들지 않는다. 잘못된 값은 예외다 — 조용히 기본값을
    넣지 않는다.
    """
    states = {}
    for key, cfg in (mapping or {}).items():
        cfg = cfg or {}
        if cfg.get("limit") is None:
            continue
        window = cfg.get("window_seconds", cfg.get("windowSeconds"))
        state = new_state(key.split(":")[0], at=at)
        states[key] = configure(state, limit=cfg["limit"],
                                window_seconds=window, at=at)
    return states


def decide(states, provider, *, account=None, operation=None, now=None):
    """가장 구체적인 설정부터 본다. 없으면 막지 않는다."""
    now = now or _now_utc()
    candidates = []
    if account is not None and operation is not None:
        candidates.append(scoped_key(provider, account, operation))
    if operation is not None:
        candidates.append(scoped_key(provider, None, operation))
    candidates.append(scoped_key(provider))
    for key in candidates:
        if key in (states or {}):
            return check(states[key], now=now)
    return {"decision": DECISION_OK, "reason": "상한 미설정 — 강제하지 않음",
            "waitMinutes": 0}
