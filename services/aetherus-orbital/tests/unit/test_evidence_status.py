"""Evidence status must fail closed when any required gate is not proven."""

from backend.tools.generate_evidence import evidence_status


def test_evidence_status_requires_every_required_gate_to_pass() -> None:
    """A skipped, unavailable, or false result may never become a passed phase evidence file."""
    assert evidence_status({"tests": {"passed": True}, "database": {"passed": True}}) == "PASSED"
    assert evidence_status({"tests": {"passed": True}, "database": {"passed": None}}) == "FAILED"
    assert evidence_status({"tests": {"passed": True}, "database": {"passed": False}}) == "FAILED"
