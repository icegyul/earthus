"""Truthful live-provider probe helpers shared by scripts and tests."""

from __future__ import annotations

import socket
import ssl
from urllib.error import HTTPError, URLError

import certifi


def trusted_ssl_context() -> ssl.SSLContext:
    """Use the packaged Mozilla CA bundle without disabling TLS verification."""
    return ssl.create_default_context(cafile=certifi.where())


def classify_probe_exception(exc: BaseException) -> tuple[str, str]:
    """Return an evidence status and a stable reason without faking availability."""
    if isinstance(exc, HTTPError):
        if exc.code == 404:
            return "UNAVAILABLE", "ENDPOINT_NOT_FOUND"
        if exc.code == 429:
            return "STALE", "RATE_LIMITED"
        return "UNAVAILABLE", f"HTTP_{exc.code}"

    reason = exc.reason if isinstance(exc, URLError) else exc
    if isinstance(reason, ssl.SSLCertVerificationError):
        return "UNAVAILABLE", "TLS_CERTIFICATE_VERIFICATION_FAILED"
    if isinstance(reason, (socket.timeout, TimeoutError)):
        return "UNAVAILABLE", "NETWORK_TIMEOUT"
    if isinstance(reason, socket.gaierror):
        return "UNAVAILABLE", "DNS_UNAVAILABLE"
    if isinstance(reason, OSError):
        return "UNAVAILABLE", "NETWORK_UNAVAILABLE"
    return "UNAVAILABLE", "PROVIDER_RESPONSE_INVALID"
