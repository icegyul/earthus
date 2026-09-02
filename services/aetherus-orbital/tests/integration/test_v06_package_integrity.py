from __future__ import annotations

import csv
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]


#: Columns the directive owns. Status and evidence_path are not among them:
#: those are claims about a run, and a run is not part of a package's contract.
DIRECTIVE_COLUMNS = ("test_id", "module_id", "domain", "case", "automation", "gate")

CANONICAL_MATRIX = (
    ROOT.parents[1]
    / "docs/aetherus-v2-canonical/claude_handoff_v1.1/AETHERUS_V2_ACCEPTANCE_MATRIX.csv"
)


def _rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def test_v06_canonical_registry_and_acceptance_are_imported() -> None:
    registry_path = ROOT / "config" / "AETHERUS_V2_ENGINE_REGISTRY.yaml"
    acceptance_path = ROOT / "config" / "AETHERUS_V2_ACCEPTANCE_MATRIX.csv"

    registry = yaml.safe_load(registry_path.read_text(encoding="utf-8"))
    engine_ids = [engine["id"] for engine in registry["engines"]]
    assert engine_ids == [f"E{number:02d}" for number in range(1, 45)]

    required = [row for row in _rows(acceptance_path) if row["gate"] == "REQUIRED"]
    assert len(required) == 307


def test_the_two_matrix_copies_cannot_drift() -> None:
    """Two files carry this matrix and two different tools read them.

    The acceptance suite parametrises from the imported copy under config/; the
    evidence generator reads the canonical directive copy under docs/. If their
    case text ever diverged, a row could be mapped against one wording and
    verified against another, and nothing would say so.
    """
    imported = {row["test_id"]: row for row in _rows(ROOT / "config" / "AETHERUS_V2_ACCEPTANCE_MATRIX.csv")}
    canonical = {row["test_id"]: row for row in _rows(CANONICAL_MATRIX)}
    assert set(imported) == set(canonical)
    for test_id, canonical_row in canonical.items():
        for column in DIRECTIVE_COLUMNS:
            assert imported[test_id][column] == canonical_row[column], (
                f"{test_id}.{column} differs between the imported and canonical matrix"
            )


def test_the_imported_pass_column_is_not_this_repositorys_evidence() -> None:
    """The import declares PASS for all 307 rows and names evidence it did not bring.

    The two XML files it points at were never imported with it. A status column
    is a statement, not a run, so this repository's acceptance status is produced
    by tools/generate_acceptance_evidence.py from tests that actually executed.
    See config/ACCEPTANCE_MATRIX_PROVENANCE.md.

    This test does not demand the files stay missing. It demands that whenever a
    row claims PASS against a file this repository does not hold, the provenance
    note that explains the gap is present.
    """
    rows = _rows(ROOT / "config" / "AETHERUS_V2_ACCEPTANCE_MATRIX.csv")
    unbacked = {
        row["evidence_path"]
        for row in rows
        if row["status"] == "PASS"
        and row["evidence_path"]
        and not (ROOT / row["evidence_path"]).is_file()
    }
    if not unbacked:
        return
    note = ROOT / "config" / "ACCEPTANCE_MATRIX_PROVENANCE.md"
    assert note.is_file(), (
        f"{len(unbacked)} evidence path(s) claimed PASS are absent from this "
        "repository and nothing records why"
    )
    text = note.read_text(encoding="utf-8")
    for path in unbacked:
        assert path in text, f"{path} is claimed as evidence but the provenance note does not mention it"


def test_the_acceptance_driver_ignores_the_imported_status() -> None:
    """A green CSV must not be able to make the suite green."""
    source = (ROOT / "tests" / "acceptance" / "test_master_acceptance.py").read_text(encoding="utf-8")
    assert "status" not in source, (
        "the acceptance driver reads the imported status column; a file that "
        "declares PASS would then decide what runs"
    )


def test_v06_current_golden_evidence_is_imported() -> None:
    evidence = ROOT / "artifacts" / "evidence"
    assert (evidence / "AETHERUS_V2_v0.6_DESKTOP_MOBILE_BILINGUAL_GOLDEN.jpg").is_file()
    assert len(list((evidence / "desktop_v06").glob("desktop1440_*.png"))) == 10
    assert len(list((evidence / "mobile_v06").glob("mobile390_*.png"))) >= 10


def test_p5_science_tree_remains_present() -> None:
    required = [
        ROOT / "backend" / "orbit" / "propagator.py",
        ROOT / "backend" / "conjunction" / "pc.py",
        ROOT / "backend" / "benefit" / "service.py",
        ROOT / "migrations" / "007_p5_benefit_engine.sql",
    ]
    assert all(path.is_file() for path in required)
