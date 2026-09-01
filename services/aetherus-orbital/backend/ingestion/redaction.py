"""Secret and session-material removal before persistence or exposure."""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from typing import Any

from pydantic import SecretStr

_SENSITIVE_KEYS = frozenset(
    {
        "authorization",
        "cookie",
        "set-cookie",
        "password",
        "identity",
        "proxy-authorization",
        "x-api-key",
    }
)
_COOKIE_ASSIGNMENT = re.compile(r"(?i)(?:set-cookie|cookie|session)\s*=\s*[^\s;,]+")


class Redactor:
    """Recursively remove configured secret values and session-cookie material."""

    def __init__(self, secrets: Iterable[str]) -> None:
        self._secrets = tuple(sorted({value for value in secrets if value}, key=len, reverse=True))

    @classmethod
    def from_secret_values(cls, values: Iterable[SecretStr | str | None]) -> Redactor:
        """Build a redactor without retaining absent or empty configured secrets."""
        normalized: list[str] = []
        for value in values:
            if isinstance(value, SecretStr):
                secret = value.get_secret_value()
            elif isinstance(value, str):
                secret = value
            else:
                continue
            if secret:
                normalized.append(secret)
        return cls(normalized)

    def redact_mapping(self, value: Mapping[str, Any]) -> dict[str, Any]:
        """Return a safe copy suitable for errors, metadata, logs, and evidence."""
        return self._redact_mapping(value)

    def _redact_mapping(self, value: Mapping[str, Any]) -> dict[str, Any]:
        safe: dict[str, Any] = {}
        for key, nested in value.items():
            if key.lower() in _SENSITIVE_KEYS:
                continue
            safe[key] = self._redact_value(nested)
        return safe

    def _redact_value(self, value: Any) -> Any:
        if isinstance(value, Mapping):
            return self._redact_mapping(value)
        if isinstance(value, list):
            return [self._redact_value(item) for item in value]
        if isinstance(value, tuple):
            return tuple(self._redact_value(item) for item in value)
        if isinstance(value, str):
            return self._redact_text(value)
        return value

    def _redact_text(self, value: str) -> str:
        redacted = _COOKIE_ASSIGNMENT.sub("[REDACTED]", value)
        for secret in self._secrets:
            redacted = redacted.replace(secret, "[REDACTED]")
        return redacted
