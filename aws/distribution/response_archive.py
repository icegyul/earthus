# -*- coding: utf-8 -*-
"""응답 보관 — SNS FACTORY 신규 모듈 (독립 구현).

무엇을 남기나
  live 검증 때 provider 가 돌려준 응답의 "모양"만 남긴다.
  목적은 나중에 "그때 뭐가 왔나"를 대조하는 것이다.

무엇을 버리나
  access/refresh token, Authorization 헤더, 쿠키,
  비밀 쿼리 파라미터, vault key. 이름만 봐도 버린다.
  값 검사가 아니라 키 검사다 — 값에 토큰이 섞여 있어도
  키가 비밀이면 통째로 버린다.

남는 것
  provider · endpoint class · status code · object id ·
  response schema(키 목록) · sanitized response ·
  timestamp · latency · request fingerprint.
"""
from datetime import datetime, timezone
import hashlib

ARCHIVE_SCHEMA = "earthus.response-archive.v1"

# 키에 이 말이 들어가면 값째 버린다. 소문자로 비교한다.
_DROP_SUBSTRINGS = (
    "accesstoken", "refreshtoken", "authorization", "cookie", "set-cookie",
    "vault", "secret", "password", "clientsecret", "appsecret", "apikey",
    "api_key", "bearer",
)


def _drop_key(key):
    low = str(key or "").lower().replace("-", "").replace("_", "")
    return any(part in low for part in _DROP_SUBSTRINGS)


def sanitize(obj):
    """비밀 키를 버린 사본. 중첩을 따라간다."""
    if isinstance(obj, dict):
        return {k: ("<redacted>" if _drop_key(k) else sanitize(v))
                for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize(v) for v in obj]
    return obj


def _schema_of(obj, depth=0):
    """모양만. 값은 안 담는다. 3단계까지 본다."""
    if isinstance(obj, dict):
        if depth >= 3:
            return "{...}"
        return {k: _schema_of(v, depth + 1) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return ["[%d]" % len(obj)]
    return type(obj).__name__


def fingerprint(provider, endpoint_class, object_id, at):
    """요청 지문. 비밀·본문 없이 같은 요청을 가리킨다."""
    raw = "|".join([str(provider), str(endpoint_class), str(object_id or ""),
                    str(at)])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def store(*, provider, endpoint_class, status_code, object_id, response,
          latency_ms=None, at=None):
    """소독해서 보관한다. 원본 토큰은 어떤 경로로도 안 남는다."""
    now = at
    if now is None:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    clean = sanitize(response if isinstance(response, dict) else {})
    return {
        "schemaVersion": ARCHIVE_SCHEMA,
        "provider": provider,
        "endpointClass": endpoint_class,
        "statusCode": status_code,
        "objectId": object_id,
        "schema": _schema_of(clean),
        "sanitized": clean,
        "timestamp": now,
        "latencyMs": latency_ms,
        "fingerprint": fingerprint(provider, endpoint_class, object_id, now),
    }
