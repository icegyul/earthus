from __future__ import annotations

import socket
import ssl
from urllib.error import HTTPError

from aetherus_providers import LaunchLibraryProvider
from aetherus_providers.probe import classify_probe_exception, trusted_ssl_context


def test_launch_library_uses_supported_plural_upcoming_path() -> None:
    url = LaunchLibraryProvider().upcoming_url(limit=1)
    assert "/2.3.0/launches/upcoming/" in url
    assert "/launch/upcoming/" not in url


def test_probe_failures_are_cause_specific_and_truthful() -> None:
    unavailable, network_reason = classify_probe_exception(socket.timeout("timed out"))
    missing, missing_reason = classify_probe_exception(
        HTTPError("https://example.invalid", 404, "Not Found", {}, None)
    )
    tls, tls_reason = classify_probe_exception(
        ssl.SSLCertVerificationError(1, "certificate verify failed")
    )

    assert (unavailable, network_reason) == ("UNAVAILABLE", "NETWORK_TIMEOUT")
    assert (missing, missing_reason) == ("UNAVAILABLE", "ENDPOINT_NOT_FOUND")
    assert (tls, tls_reason) == ("UNAVAILABLE", "TLS_CERTIFICATE_VERIFICATION_FAILED")


def test_provider_http_uses_a_verified_ca_context() -> None:
    context = trusted_ssl_context()
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True
