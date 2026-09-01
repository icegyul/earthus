from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def issue_staging_token(
    *, secret: str, tenant_id: str, user_id: str, plan: str, ttl_seconds: int = 3600
) -> str:
    if len(secret) < 32:
        raise ValueError("staging auth secret must be at least 32 characters")
    if not tenant_id or not user_id or not plan:
        raise ValueError("tenant_id, user_id and plan are required")
    now = int(time.time())
    payload = {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "plan": plan,
        "iat": now,
        "exp": now + max(1, min(int(ttl_seconds), 86400)),
        "aud": "AETHERUS_STAGING",
    }
    body = _b64encode(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8"))
    signature = _b64encode(hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest())
    return f"{body}.{signature}"


def verify_staging_token(token: str, *, secret: str) -> dict[str, Any]:
    if len(secret) < 32:
        raise ValueError("staging auth secret must be at least 32 characters")
    try:
        body, signature = token.split(".", 1)
        expected = _b64encode(hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError("invalid token signature")
        payload = json.loads(_b64decode(body))
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError("invalid staging token") from exc
    if payload.get("aud") != "AETHERUS_STAGING" or int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("expired or invalid staging token")
    if not payload.get("tenant_id") or not payload.get("user_id") or not payload.get("plan"):
        raise ValueError("staging token claims are incomplete")
    return payload


class DeploymentAuthMiddleware(BaseHTTPMiddleware):
    sensitive_read_prefixes = (
        "/v1/my-aetherus",
        "/v1/control/workspace",
        "/v1/follows/",
        "/v1/operations/",
    )

    @classmethod
    def _protected(cls, method: str, path: str) -> bool:
        if not path.startswith("/v1/"):
            return False
        if method.upper() not in {"GET", "HEAD", "OPTIONS"}:
            return True
        return any(path.startswith(prefix) for prefix in cls.sensitive_read_prefixes)

    async def dispatch(self, request, call_next):
        environment = os.environ.get("AETHERUS_ENV", "local").lower()
        if environment in {"local", "test", "development"} or not self._protected(request.method, request.url.path):
            return await call_next(request)
        auth_mode = os.environ.get("AETHERUS_AUTH_MODE", "")
        if environment == "production":
            detail = "BLOCKED_PRODUCTION_IDP" if auth_mode == "hmac-staging" else "BLOCKED_AUTH_PROVIDER"
            return JSONResponse(status_code=503, content={"detail": detail})
        if environment != "staging" or auth_mode != "hmac-staging":
            return JSONResponse(status_code=503, content={"detail": "BLOCKED_AUTH_PROVIDER"})
        secret = os.environ.get("AETHERUS_AUTH_HMAC_SECRET", "")
        if len(secret) < 32:
            return JSONResponse(status_code=503, content={"detail": "BLOCKED_AUTH_PROVIDER"})
        authorization = request.headers.get("authorization", "")
        if not authorization.startswith("Bearer "):
            return JSONResponse(status_code=401, content={"detail": "AUTHENTICATION_REQUIRED"})
        try:
            claims = verify_staging_token(authorization[7:], secret=secret)
        except ValueError:
            return JSONResponse(status_code=401, content={"detail": "INVALID_AUTH_TOKEN"})
        replacement = {
            b"x-aetherus-tenant": str(claims["tenant_id"]).encode("utf-8"),
            b"x-aetherus-user": str(claims["user_id"]).encode("utf-8"),
            b"x-aetherus-plan": str(claims["plan"]).encode("utf-8"),
        }
        request.scope["headers"] = [
            (key, value) for key, value in request.scope["headers"] if key not in replacement
        ] + list(replacement.items())
        return await call_next(request)
