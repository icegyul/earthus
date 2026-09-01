"""P5 evidence artifacts must be present in the source tree, not only a Docker volume."""

import json
from pathlib import Path

EVIDENCE_DIR = Path(__file__).parents[2] / "artifacts" / "evidence" / "p5"
VALIDATION_ARTIFACTS = (
    EVIDENCE_DIR / "validation-ben001.json",
    EVIDENCE_DIR / "equivalence-ben003.json",
)


def test_ben_validation_artifacts_exist_and_stay_simulation_only() -> None:
    """BEN-001/BEN-003 proof must be committed source evidence, never volume-only state."""
    missing = [path.name for path in VALIDATION_ARTIFACTS if not path.is_file()]
    assert not missing, f"missing P5 validation artifacts: {missing}"

    ben001 = json.loads(VALIDATION_ARTIFACTS[0].read_text(encoding="utf-8"))
    ben003 = json.loads(VALIDATION_ARTIFACTS[1].read_text(encoding="utf-8"))
    for artifact in (ben001, ben003):
        assert artifact["passed"] is True
        assert artifact["validation_only"] is True
        assert artifact["validation_state"] == "SIMULATION_ONLY"
