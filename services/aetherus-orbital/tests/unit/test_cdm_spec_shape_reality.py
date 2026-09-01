"""How far a spec-shaped CDM gets through our pipeline, stated as executable fact.

Background. The repository's only "valid CDM" fixture declares in its own note
that its 6x6 covariance matrices are synthetic values constructed for the fixture.
It is also JSON, TEME and km2 — exactly what our parser and Pc gate demanded. The
one covariance the Pc engine had ever accepted was therefore shaped to the engine,
not to the standard, and passing it proved nothing about ingesting a real
Conjunction Data Message.

The 2026-09-02 audit measured where a document shaped the way CCSDS 508.0-B-1 says
CDMs are shaped actually died. Five gates, in order: KVN encoding, the 21-element
lower triangle, the RTN frame, m**2 units, and COMBINED_HBR semantics.

Three of those are now open (backend/conjunction/cdm_kvn.py). This file asserts
CURRENT behaviour, not aspiration, so it stays a truthful map of the remaining
gap: when the frame gate is opened it will fail here and must be rewritten. That
failure is the intended signal, not a regression.

Nothing here claims the fixture is a real CDM. It is spec-SHAPED — KVN, RTN lower
triangle, m**2, invented numbers.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.conjunction.cdm import CdmParseError, parse_cdm
from backend.conjunction.cdm_kvn import covariance_summary, parse_any_cdm

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "cdm"
SPEC_SHAPED = FIXTURES / "ccsds_508_kvn_shaped.txt"
ENGINE_SHAPED = FIXTURES / "tracss_spec_example_cdm_valid.json"

GRADE = "SPEC_SHAPE_FIXTURE"


class TestGatesNowOpen:
    """Gates 1, 2 and 4 — the encoding, the triangle, the units."""

    def test_gate_1_kvn_is_read_by_the_dispatching_entry_point(self):
        parsed = parse_any_cdm(SPEC_SHAPED.read_bytes(), source_grade=GRADE)
        assert parsed.tca is not None
        assert parsed.primary.catalog_id == "30001"

    def test_the_json_only_parser_still_refuses_kvn(self):
        """parse_cdm is the JSON dialect and stays that way.

        Recorded so nobody mistakes the dispatcher for a widened JSON parser:
        callers must go through parse_any_cdm to get either dialect.
        """
        with pytest.raises(CdmParseError, match="JSON"):
            parse_cdm(SPEC_SHAPED.read_bytes(), source_grade=GRADE)

    def test_gate_2_the_lower_triangle_becomes_a_symmetric_matrix(self):
        parsed = parse_any_cdm(SPEC_SHAPED.read_bytes(), source_grade=GRADE)
        covariance = parsed.primary.covariance_km2
        assert covariance is not None and len(covariance) == 6
        for row in range(6):
            for col in range(6):
                assert covariance[row][col] == covariance[col][row]

    def test_gate_4_position_units_are_converted_exactly(self):
        parsed = parse_any_cdm(SPEC_SHAPED.read_bytes(), source_grade=GRADE)
        assert parsed.primary.covariance_unit == "KM2"
        assert parsed.primary.covariance_km2[0][0] == pytest.approx(4.142e-05)


class TestGatesStillShut:
    """Gates 3 and 5 — the frame rotation and the HBR convention."""

    def test_gate_3_rtn_covariance_is_not_rotated_into_teme(self):
        """Deliberate. A wrong rotation yields plausible Pc, not a visible failure.

        Rotating RTN to TEME needs the object state vector and correct axis
        conventions; an error there is silent and produces numbers that look
        usable. That is the failure mode this project keeps catching, so the
        frame is reported as published and the Pc gate keeps rejecting it.
        """
        parsed = parse_any_cdm(SPEC_SHAPED.read_bytes(), source_grade=GRADE)
        assert parsed.primary.covariance_reference_frame == "RTN"

        from backend.conjunction.pc import covariance_check

        combined, reason = covariance_check(
            cov_primary=parsed.primary.covariance_km2,
            cov_secondary=parsed.secondary.covariance_km2,
            frame_primary=parsed.primary.covariance_reference_frame,
            frame_secondary=parsed.secondary.covariance_reference_frame,
            unit_primary=parsed.primary.covariance_unit,
            unit_secondary=parsed.secondary.covariance_unit,
        )
        assert combined is None, "RTN covariance was accepted; it must not be"
        assert "FRAME" in reason.upper(), f"unexpected rejection reason: {reason}"

    def test_gate_5_no_combined_hbr_is_invented(self):
        """A CDM publishes object dimensions, never a combined hard-body radius."""
        parsed = parse_any_cdm(SPEC_SHAPED.read_bytes(), source_grade=GRADE)
        assert parsed.combined_hbr_m is None
        assert parsed.hbr_semantics is None
        assert "HBR" not in SPEC_SHAPED.read_text(encoding="utf-8")

    def test_the_remaining_blockers_are_enumerated_for_the_caller(self):
        parsed = parse_any_cdm(SPEC_SHAPED.read_bytes(), source_grade=GRADE)
        summary = covariance_summary(parsed)
        assert summary["pc_reachable"] is False
        assert set(summary["blockers"]) == {
            "primary_frame_RTN",
            "secondary_frame_RTN",
            "hbr_semantics_absent",
        }, (
            "the blocker set changed; if a gate opened, update this test and the "
            "audit record rather than loosening the assertion"
        )


class TestNoIngestionPathExists:
    def test_the_cdm_parsers_have_no_production_caller(self):
        """Reading a CDM and ingesting one are still separate claims.

        Neither parser is wired into any route, service or ingestion job, so the
        capability proved above is not yet reachable by the running system. This
        is recorded rather than implied: a reader who sees a working parser could
        reasonably assume the pipeline consumes CDMs, and it does not.
        """
        service_root = Path(__file__).resolve().parents[2]
        callers: list[str] = []
        for directory in ("backend", "packages", "services"):
            root = service_root / directory
            if not root.is_dir():
                continue
            for path in root.rglob("*.py"):
                if path.name in {"cdm.py", "cdm_kvn.py"}:
                    continue
                text = path.read_text(encoding="utf-8", errors="ignore")
                if "parse_cdm(" in text or "parse_any_cdm(" in text:
                    callers.append(str(path.relative_to(service_root)))

        assert not callers, (
            "a CDM parser now has a production caller — wire the covariance gate "
            f"into that path and retire this test: {sorted(callers)}"
        )


class TestExistingFixtureIsEngineShapedNotSpecShaped:
    """Name the circularity in the one fixture the Pc engine has ever accepted."""

    def test_the_valid_fixture_declares_its_covariance_synthetic(self):
        text = ENGINE_SHAPED.read_text(encoding="utf-8").lower()
        assert "synthetic" in text, (
            "the fixture's own disclosure is the evidence that it is not observed "
            "data; if it is ever removed, this circularity becomes invisible"
        )
        assert "must never be presented as a live operational conjunction" in text

    def test_the_valid_fixture_uses_our_conventions_not_the_standard_s(self):
        document = json.loads(ENGINE_SHAPED.read_text(encoding="utf-8"))
        assert document.get("ref_frame") == "TEME", (
            "fixture declares the frame our gate wants, not the RTN a CDM carries"
        )
        assert document.get("covariance_unit") == "km2", (
            "fixture declares the unit our gate wants, not the m**2 a CDM carries"
        )

    def test_no_pc_fixture_is_traceable_to_an_external_document(self):
        """The invariant that is missing, stated so its absence stops being silent.

        A Pc golden case should be reproducible from a document we did not write,
        recorded with its source URI and content hash. No such fixture exists, and
        that absence is why the frame and unit gaps went unnoticed.
        """
        externally_sourced = []
        for path in FIXTURES.glob("*.json"):
            document = json.loads(path.read_text(encoding="utf-8"))
            if document.get("source_uri") and document.get("content_sha256"):
                externally_sourced.append(path.name)
        assert not externally_sourced, (
            "an externally sourced Pc fixture now exists — retire this test and "
            "make the traceability invariant positive instead"
        )
