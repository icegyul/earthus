from __future__ import annotations

import csv
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]


def test_v06_canonical_registry_and_acceptance_are_imported() -> None:
    registry_path = ROOT / "config" / "AETHERUS_V2_ENGINE_REGISTRY.yaml"
    acceptance_path = ROOT / "config" / "AETHERUS_V2_ACCEPTANCE_MATRIX.csv"

    registry = yaml.safe_load(registry_path.read_text(encoding="utf-8"))
    engine_ids = [engine["id"] for engine in registry["engines"]]
    assert engine_ids == [f"E{number:02d}" for number in range(1, 45)]

    with acceptance_path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    required = [row for row in rows if row["gate"] == "REQUIRED"]
    assert len(required) == 307
    assert all(row["status"] == "PASS" for row in required)


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
