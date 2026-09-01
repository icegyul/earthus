"""Contract tests for CelesTrak OMM-compatible JSON parsing."""

import json
from pathlib import Path

import pytest

from backend.ingestion.omm import OmmParseError, parse_omm_document

FIXTURE_DIR = Path(__file__).parents[1] / "fixtures" / "celestrak"
RAW_FIXTURE = FIXTURE_DIR / "iss-25544-2026-08-23.json"


def load_raw_document() -> tuple[bytes, dict[str, object]]:
    """Load the recorded CelesTrak response and its source metadata."""
    content = RAW_FIXTURE.read_bytes()
    return content, json.loads(content)[0]


def test_parses_recorded_celestrak_omm_json_without_inventing_values() -> None:
    """Every normalized field must originate in the captured provider response or its defaults."""
    content, raw = load_raw_document()

    records = parse_omm_document(content)

    assert len(records) == 1
    record = records[0]
    assert record.catalog_id == str(raw["NORAD_CAT_ID"])
    assert record.object_name == raw["OBJECT_NAME"]
    assert record.international_designator == raw["OBJECT_ID"]
    assert record.epoch.isoformat() == raw["EPOCH"] + "+00:00"
    assert record.mean_elements["mean_motion_rev_per_day"] == raw["MEAN_MOTION"]
    assert record.mean_elements["eccentricity"] == raw["ECCENTRICITY"]
    assert record.frame == "TEME"
    assert record.time_system == "UTC"
    assert record.theory == "SGP4"
    assert record.quality_grade == "PUBLIC_GP"
    assert record.covariance is None


def test_parser_accepts_numeric_omm_strings_from_spacetrack_without_changing_values() -> None:
    """Space-Track GP JSON encodes OMM numeric fields as strings."""
    _, fixture_raw = load_raw_document()
    raw = json.loads(json.dumps(fixture_raw))
    numeric_fields = (
        "MEAN_MOTION",
        "ECCENTRICITY",
        "INCLINATION",
        "RA_OF_ASC_NODE",
        "ARG_OF_PERICENTER",
        "MEAN_ANOMALY",
        "BSTAR",
        "MEAN_MOTION_DOT",
        "MEAN_MOTION_DDOT",
    )
    for field in numeric_fields:
        raw[field] = str(raw[field])
    raw["ELEMENT_SET_NO"] = "999"
    raw["REV_AT_EPOCH"] = "12345"

    record = parse_omm_document(json.dumps([raw]).encode())[0]

    assert record.mean_elements["mean_motion_rev_per_day"] == float(raw["MEAN_MOTION"])
    assert record.mean_elements["eccentricity"] == float(raw["ECCENTRICITY"])
    assert record.mean_elements["element_set_no"] == 999
    assert record.mean_elements["rev_at_epoch"] == 12345


def test_parser_rejects_missing_canonical_identifier() -> None:
    """An OMM record without a catalog identifier cannot become a canonical object."""
    _, raw = load_raw_document()
    raw.pop("NORAD_CAT_ID")

    with pytest.raises(OmmParseError, match="NORAD_CAT_ID"):
        parse_omm_document(json.dumps([raw]).encode())


def test_parser_preserves_more_than_five_catalog_digits() -> None:
    """The canonical ID remains an exact string even when TLE cannot represent it."""
    _, raw = load_raw_document()
    raw["NORAD_CAT_ID"] = 100000001

    record = parse_omm_document(json.dumps([raw]).encode())[0]

    assert record.catalog_id == "100000001"
    assert len(record.catalog_id) == 9


def test_parser_rejects_non_numeric_catalog_identifier() -> None:
    """Provider corruption is surfaced rather than normalized into a new identity."""
    _, raw = load_raw_document()
    raw["NORAD_CAT_ID"] = "ISS-25544"

    with pytest.raises(OmmParseError, match="numeric"):
        parse_omm_document(json.dumps([raw]).encode())
