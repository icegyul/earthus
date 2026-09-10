# -*- coding: utf-8 -*-
"""제공자 상태 — SNS FACTORY 신규 모듈 (독립 구현).

실제로 확인한 것만 말한다
  Python 실행 맥락에는 SOCIAL_VAULT 토큰이 없다(의도 — 자격증명은
  social-admin Edge Function 에만 있다). 그래서 이 파일은 네트워크로
  "로그인 확인"을 하지 않는다. 확인할 수 있는 것만 본다:

  A. credential/configuration 이 지금 맥락에 실제로 주어졌는가
  B. transport 가 실제 provider transport 인가, stub 인가
  C. confirmed=true 인가
  D. 검증된 handshake 결과가 전달되었는가

  그 외에는 NOT_CONFIGURED 계열이다. env 존재만으로 AUTHENTICATED,
  adapter 존재만으로 LIVE, mock 성공만으로 authenticated 는 없다.

STUB 식별
  stub transport 로 돌린 결과는 mode=STUB, provenance=stub 으로 남긴다.
  시험 성공을 실제 연결로 승격하는 길을 코드로 막는다.
"""
from datetime import datetime, timezone

HEALTH_SCHEMA = "earthus.provider-health.v1"

# 상태 어휘. publish_queue·governance 의 APPROVED/PUBLISHED 와는 다른 층이다 —
# 여기는 "연결 상태"만 말하고 발행 판정을 하지 않는다.
ST_NOT_CONFIGURED = "NOT_CONFIGURED"
ST_CONFIGURED = "CONFIGURED"
ST_AUTHENTICATED = "AUTHENTICATED"
ST_PUBLISH_READY = "PUBLISH_READY"
ST_ANALYTICS_READY = "ANALYTICS_READY"
ST_AUTH_FAILED = "AUTH_FAILED"
ST_PUBLISH_NOT_AVAILABLE = "PUBLISH_NOT_AVAILABLE"
ST_ANALYTICS_NOT_AVAILABLE = "ANALYTICS_NOT_AVAILABLE"
ST_STUB = "STUB"

MODE_MOCK = "MOCK"
MODE_PREVIEW = "PREVIEW"
MODE_LIVE = "LIVE"
MODE_STUB = "STUB"
MODE_UNKNOWN = "UNKNOWN"

# 결과·예외에서 지우는 비밀 키. idempotencyKey 는 지우지 않는다 —
# 그것은 비밀이 아니라 중복 방지용 공개 값이다.
_SECRET_KEYS = (
    "accessToken", "refreshToken", "clientSecret", "client_secret",
    "appSecret", "appsecret", "pageAccessToken", "vaultKey",
    "SOCIAL_VAULT_KEY", "authorization", "Authorization", "password",
)


def _now_utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def scrub(obj):
    """비밀 키를 값째 지운다. 중첩 dict/list 를 따라간다."""
    if isinstance(obj, dict):
        return {k: ("<redacted>" if k in _SECRET_KEYS else scrub(v))
                for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [scrub(v) for v in obj]
    return obj


def safe_error(error):
    """예외를 로그·응답에 안전한 문자열로. 토큰 값을 흘리지 않는다."""
    code = getattr(error, "code", None) or type(error).__name__
    text = str(error)
    for key in _SECRET_KEYS:
        # key=값 · key: 값 형태를 지운다.
        import re
        text = re.sub(r"(%s)\s*[:=]\s*\S+" % re.escape(key), r"\1=<redacted>",
                      text)
    return "%s: %s" % (code, text)


def _is_stub(transport, adapter):
    if getattr(transport, "stub", False) is True:
        return True
    if isinstance(transport, dict) and transport.get("stub") is True:
        return True
    if getattr(adapter, "mode", None) == MODE_STUB:
        return True
    return False


def inspect(adapter, *, credentials=None, transport=None, confirmed=False,
            handshake=None, at=None):
    """어댑터 하나의 지금 상태를 본다. 네트워크를 쓰지 않는다.

    credentials  지금 맥락에 실제로 주어진 자격증명 dict (없으면 None)
    transport    주입된 전송 경로 (없으면 None, stub 가능)
    confirmed    사람이 확인했는가
    handshake    검증된 확인 결과 dict:
                   {"source": "live", "authenticated": bool,
                    "publish": bool, "analytics": bool, "at": iso, "by": actor}
                 source 가 "live" 가 아니면 live 상태로 올리지 않는다.
    """
    now = at or _now_utc()
    provider = getattr(adapter, "platform", None) or "unknown"
    out = {
        "schemaVersion": HEALTH_SCHEMA,
        "provider": provider,
        "mode": getattr(adapter, "mode", None) or MODE_UNKNOWN,
        "configured": False,
        "authenticated": False,
        "publish_ready": False,
        "analytics_ready": False,
        "confirmed": bool(confirmed),
        "provenance": "unavailable",
        "state": ST_NOT_CONFIGURED,
        "reason": "자격증명이 이 맥락에 없다",
        "checkedAt": now,
    }
    if not isinstance(credentials, dict) or not credentials:
        if credentials is not None:
            out["reason"] = "자격증명 모양이 아니다 — dict 가 아니다"
        return out
    out["configured"] = True
    out["state"] = ST_CONFIGURED
    out["reason"] = "자격증명이 주어졌다 — 확인은 아직이다"
    if _is_stub(transport, adapter):
        out["mode"] = MODE_STUB
        out["provenance"] = "stub"
        out["state"] = ST_STUB
        out["reason"] = "stub transport — 실제 연결이 아니다"
        return out
    if not isinstance(handshake, dict) or handshake.get("source") != "live":
        return out
    if handshake.get("authenticated") is True:
        out["authenticated"] = True
        out["provenance"] = "live"
        out["state"] = ST_AUTHENTICATED
        out["reason"] = "live handshake 확인"
    elif handshake.get("authenticated") is False:
        out["state"] = ST_AUTH_FAILED
        out["reason"] = "live handshake 실패"
        return out
    else:
        return out
    # publish/analytics 는 인증 위에서만, 그리고 confirmed 위에서만 선다.
    if handshake.get("publish") is True and confirmed:
        out["publish_ready"] = True
        out["state"] = ST_PUBLISH_READY
    elif handshake.get("publish") is False:
        out["state"] = ST_PUBLISH_NOT_AVAILABLE
        out["reason"] = "live handshake: 발행 불가"
        return out
    if handshake.get("analytics") is True:
        out["analytics_ready"] = True
        if out["publish_ready"]:
            out["state"] = ST_ANALYTICS_READY
    elif handshake.get("analytics") is False:
        if out["state"] == ST_ANALYTICS_READY:
            pass
        elif out["publish_ready"]:
            pass
        else:
            out["state"] = ST_ANALYTICS_NOT_AVAILABLE
            out["reason"] = "live handshake: 읽기 불가"
    if out["publish_ready"] and not out["analytics_ready"] \
            and handshake.get("analytics") is None:
        out["state"] = ST_PUBLISH_READY
    return out


def check_all(adapters, *, context=None, at=None):
    """여러 provider 를 따로따로 본다. 하나가 깨져도 나머지는 본다."""
    context = context or {}
    out = {}
    for name, adapter in (adapters or {}).items():
        try:
            ctx = context.get(name) or {}
            out[name] = inspect(
                adapter,
                credentials=ctx.get("credentials"),
                transport=ctx.get("transport"),
                confirmed=ctx.get("confirmed", False),
                handshake=ctx.get("handshake"),
                at=at,
            )
        except Exception as e:  # noqa: BLE001 — 한 provider 실패가 전체를 막지 않는다
            out[name] = {
                "schemaVersion": HEALTH_SCHEMA,
                "provider": name,
                "mode": MODE_UNKNOWN,
                "configured": False,
                "authenticated": False,
                "publish_ready": False,
                "analytics_ready": False,
                "confirmed": False,
                "provenance": "error",
                "state": ST_NOT_CONFIGURED,
                "reason": safe_error(e),
                "checkedAt": at or _now_utc(),
            }
    return scrub(out)
