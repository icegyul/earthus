"""Redaction must remove local provider secrets and session material."""

import json

from pydantic import SecretStr

from backend.ingestion.redaction import Redactor


def test_redactor_removes_fake_secret_from_error_and_metadata() -> None:
    redactor = Redactor.from_secret_values(
        [SecretStr("p1-test-secret"), SecretStr("operator@example.test"), SecretStr("")]
    )
    payload = {
        "error": "login failed for operator@example.test with p1-test-secret",
        "request": {
            "Authorization": "Bearer p1-test-secret",
            "Cookie": "session=opaque-cookie",
            "nested": ["operator@example.test", {"password": "p1-test-secret"}],
        },
    }

    redacted = redactor.redact_mapping(payload)
    serialized = json.dumps(redacted, sort_keys=True)

    assert "p1-test-secret" not in serialized
    assert "operator@example.test" not in serialized
    assert "opaque-cookie" not in serialized
    assert "Authorization" not in redacted["request"]
    assert "Cookie" not in redacted["request"]
