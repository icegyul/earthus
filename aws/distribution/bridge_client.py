# -*- coding: utf-8 -*-
"""서버 브릿지 호출 — SNS FACTORY 신규 모듈 (독립 구현).

경계
  provider 토큰은 social-admin Edge Function 안에서만 쓴다.
  이 파일이 만지는 것은 봉투(envelope)뿐이다:
    보내기  {action, provider, text, mediaId, options, idempotencyKey, confirmed}
    읽기    {action, provider, postId}
  봉투에 비밀 키가 들어오면 만들지 않고 예외다.

실행은 호출자 몫이다
  post_json() 은 urllib 표준lib로 POST 한다. 토큰을 인자로 받지 않는다.
  Edge Function 인증용 admin JWT 는 운영자가 호출 때 직접 넘긴다 —
  이 파일은 저장하지도 로그에 남기지도 않는다.
"""
import json
import os
import sys
from urllib.request import Request, urlopen

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

BRIDGE_SCHEMA = "earthus.bridge-client.v1"

ACTION_PUBLISH = "publish"
ACTION_ANALYTICS = "provider_analytics"

# 봉투에 있으면 안 되는 키. 하나라도 있으면 봉투를 만들지 않는다.
_FORBIDDEN_KEYS = (
    "accessToken", "refreshToken", "clientSecret", "client_secret",
    "appSecret", "pageAccessToken", "vaultKey", "SOCIAL_VAULT_KEY",
    "authorization", "password", "token",
)


class BridgeError(RuntimeError):
    def __init__(self, message, *, code=None):
        super().__init__(message)
        self.code = code or "BRIDGE_ERROR"


def _reject_secrets(mapping, where):
    for key in (mapping or {}):
        if key in _FORBIDDEN_KEYS:
            raise BridgeError(
                "봉투에 비밀 키가 있다: %s (%s)" % (key, where),
                code="SECRET_IN_ENVELOPE")


def _now_utc():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_publish_envelope(provider, payload, *, idempotency_key,
                           confirmed=True):
    """social-admin publish 액션 봉투. confirmed 없으면 만들지 않는다."""
    if confirmed is not True:
        raise BridgeError("사람 확인 없이 publish 봉투를 만들지 않는다",
                          code="PUBLISH_CONFIRMATION_REQUIRED")
    if not idempotency_key:
        raise BridgeError("멱등키 없이 publish 봉투를 만들지 않는다",
                          code="NO_IDEMPOTENCY_KEY")
    _reject_secrets(payload, "payload")
    return {
        "schemaVersion": BRIDGE_SCHEMA,
        "action": ACTION_PUBLISH,
        "provider": provider,
        "text": (payload or {}).get("text") or "",
        "mediaId": (payload or {}).get("mediaId"),
        "options": dict((payload or {}).get("options") or {}),
        "idempotencyKey": idempotency_key,
        "confirmed": True,
    }


def build_analytics_envelope(provider, post_id):
    """social-admin provider_analytics 액션 봉투."""
    if not post_id:
        raise BridgeError("postId 없이 analytics 봉투를 만들지 않는다",
                          code="NO_POST_ID")
    return {
        "schemaVersion": BRIDGE_SCHEMA,
        "action": ACTION_ANALYTICS,
        "provider": provider,
        "postId": post_id,
    }


def parse_publish_response(body):
    """실제 응답에서 publication identity 를 꺼낸다. 없으면 예외다."""
    body = body or {}
    if body.get("error"):
        raise BridgeError(str(body.get("error")), code=str(body.get("error")))
    if body.get("ok") is not True:
        raise BridgeError("publish 응답 확인 불가", code="NO_PUBLISH_RESPONSE")
    post_id = body.get("postId") or body.get("id")
    if not post_id:
        raise BridgeError("publication ID 없음", code="NO_PUBLICATION_ID")
    return {"postId": post_id, "url": body.get("url"),
            "publishedAt": body.get("publishedAt"),
            "publishedBy": body.get("publishedBy")}


def parse_analytics_response(provider, body):
    """실제 응답에서 정식 지표를 꺼낸다. 있는 것만 담는다."""
    body = body or {}
    if body.get("error"):
        code = str(body.get("error"))
        if code in ("NOT_CONFIGURED",):
            raise BridgeError(code, code="NOT_CONFIGURED")
        if code in ("ACCOUNT_NOT_VERIFIED", "AUTH_FAILED", "X_TOKEN_EXPIRED",
                    "INVALID_CREDENTIAL", "PERMISSION_DENIED"):
            raise BridgeError(code, code="AUTH_FAILED")
        raise BridgeError(code, code="FETCH_FAILED")
    if body.get("ok") is not True:
        raise BridgeError("analytics 응답 확인 불가", code="FETCH_FAILED")
    raw = body.get("metrics") or {}
    metrics = {}
    for key, value in raw.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        metrics[key] = value
    return {"metrics": metrics, "reference": body.get("reference"),
            "postId": body.get("postId"),
            "fetchedAt": body.get("fetchedAt") or _now_utc()}


def post_json(url, jwt, body, *, timeout=30):
    """Edge Function 에 POST 한다. body 를 로그에 남기지 않는다."""
    if not url or not jwt:
        raise BridgeError("endpoint·JWT 없이 호출하지 않는다",
                          code="NOT_CONFIGURED")
    data = json.dumps(body).encode("utf-8")
    req = Request(url, data=data,
                  headers={"Content-Type": "application/json",
                           "Authorization": "Bearer %s" % jwt},
                  method="POST")
    try:
        with urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except BridgeError:
        raise
    except Exception as e:  # noqa: BLE001 — 내용은 밖에 내지 않는다
        raise BridgeError("bridge 호출 실패: %s" % type(e).__name__,
                          code="BRIDGE_CALL_FAILED")


def make_transport(endpoint, jwt, provider):
    """어댑터 LIVE transport. 봉투만 보내고 토큰은 만지지 않는다."""
    def _transport(payload):
        envelope = build_publish_envelope(
            provider, payload,
            idempotency_key=payload.get("idempotencyKey"), confirmed=True)
        body = post_json(endpoint, jwt, envelope)
        parsed = parse_publish_response(body)
        return {"status": "PUBLISHED", "mock": False, "platform": provider,
                "postId": parsed["postId"], "url": parsed["url"],
                "publishedAt": parsed["publishedAt"],
                "publishedBy": parsed["publishedBy"],
                "idempotencyKey": payload.get("idempotencyKey")}
    _transport.bridge = True
    _transport.provider = provider
    return _transport


def make_analytics_fetcher(endpoint, jwt, provider):
    """어댑터 fetch_analytics 대체용. 실제 응답만 live 로 본다."""
    def _fetch(publication):
        envelope = build_analytics_envelope(
            provider, (publication or {}).get("postId"))
        body = post_json(endpoint, jwt, envelope)
        parsed = parse_analytics_response(provider, body)
        return {"metrics": parsed["metrics"],
                "reference": parsed["reference"]}
    _fetch.bridge = True
    _fetch.provider = provider
    return _fetch
