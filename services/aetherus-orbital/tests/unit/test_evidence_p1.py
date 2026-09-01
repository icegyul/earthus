"""P1 evidence status must remain fail-closed without both live providers."""

from backend.tools.generate_evidence import p1_status


def test_p1_evidence_blocks_without_real_spacetrack_gate() -> None:
    status, next_phase = p1_status(
        {
            "celestrak_live": {"passed": True},
            "spacetrack_live": {"passed": False},
            "tests": {"passed": True},
        }
    )

    assert status == "BLOCKED"
    assert next_phase is None


def test_p1_evidence_fails_when_live_proofs_exist_but_a_quality_gate_fails() -> None:
    status, next_phase = p1_status(
        {
            "celestrak_live": {"passed": True},
            "spacetrack_live": {"passed": True},
            "width_audit": {"passed": False},
        }
    )

    assert status == "FAILED"
    assert next_phase is None


def test_p1_evidence_unlocks_p2_only_when_every_gate_passes() -> None:
    status, next_phase = p1_status(
        {
            "celestrak_live": {"passed": True},
            "spacetrack_live": {"passed": True},
            "width_audit": {"passed": True},
        }
    )

    assert status == "PASSED"
    assert next_phase == "P2"
