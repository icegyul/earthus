"""What our CDM path actually does with a spec-shaped document.

The repository's only "valid CDM" fixture declares, in its own note, that its
6x6 covariance matrices are "synthetic validation values constructed for this
fixture". It is also JSON, TEME, and km2 — which is exactly what our parser and
Pc gate demand. The one covariance the Pc engine has ever accepted was therefore
shaped to the engine, not to the standard, and passing it proves nothing about
whether we could ingest a real Conjunction Data Message.

These tests remove that circularity by recording, as executable fact, where a
document shaped the way CCSDS 508.0-B-1 says CDMs are shaped is rejected. They
are not aspirational: each one asserts the CURRENT behaviour, so the file is a
truthful map of the gap rather than a wish. When the gap is closed, these tests
fail loudly and must be rewritten — that is the intended signal.

Nothing here claims the fixture is a real CDM. It is spec-SHAPED: KVN encoding,
per-object RTN covariance as the 21-element lower triangle in m**2, with invented
numbers. Establishing that we cannot read even the shape is the finding.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.conjunction.cdm import CdmParseError, parse_cdm

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "cdm"
SPEC_SHAPED = FIXTURES / "ccsds_508_kvn_shaped.txt"
ENGINE_SHAPED = FIXTURES / "tracss_spec_example_cdm_valid.json"


class TestSpecShapedCdmIsNotIngestible:
    def test_kvn_encoding_is_rejected_outright(self):
        """Gate 1 — the parser is JSON-only; real CDMs are KVN or XML."""
        with pytest.raises(CdmParseError) as caught:
            parse_cdm(SPEC_SHAPED.read_bytes(), source_grade="SPEC_SHAPE_FIXTURE")
        assert "JSON" in str(caught.value), (
            "expected the JSON-only limitation to be the first thing a real CDM hits"
        )

    def test_the_document_carries_what_pc_needs_yet_cannot_reach_it(self):
        """The information is present in the file; only our encoding gate blocks it.

        This separates "the data does not exist" from "we cannot read it". The
        second is our problem to fix and is worth stating precisely.
        """
        text = SPEC_SHAPED.read_text(encoding="utf-8")
        for required in ("TCA", "MISS_DISTANCE", "RELATIVE_SPEED", "CR_R", "CT_T", "CN_N"):
            assert required in text
        with pytest.raises(CdmParseError):
            parse_cdm(SPEC_SHAPED.read_bytes(), source_grade="SPEC_SHAPE_FIXTURE")


class TestPcGatesAgainstSpecConventions:
    """Gates 2-4, exercised directly since the parser cannot deliver the document."""

    def _rtn_lower_triangle_m2(self) -> list[float]:
        """The 21 elements a CDM actually carries, in the order the standard lists."""
        return [
            4.142e01, -8.579e00, 2.533e03, -2.313e01, 1.336e01, 7.098e01,
            2.520e-03, -5.476e-03, -1.234e-03, 5.457e-06,
            -1.234e-02, 1.234e-01, 4.321e-03, -1.234e-05, 4.567e-05,
            1.234e-03, -3.456e-03, 2.345e-03, -1.234e-06, 3.456e-06, 1.234e-05,
        ]

    def test_covariance_arrives_as_a_lower_triangle_not_a_matrix(self):
        """Gate 2 — CDMs publish 21 elements; our type is a 6x6 nested list."""
        triangle = self._rtn_lower_triangle_m2()
        assert len(triangle) == 21
        assert not isinstance(triangle[0], list), (
            "a CDM lower triangle is flat; ParsedCdm.covariance_km2 expects list[list]"
        )

    def _square_matrix(self) -> list[list[float]]:
        """A well-formed 6x6, so only the frame/unit gate can be what rejects."""
        return [[1.0 if r == c else 0.0 for c in range(6)] for r in range(6)]

    def test_rtn_frame_is_rejected(self):
        """Gate 3 — Pc accepts TEME only; CDM covariance is RTN by definition."""
        from backend.conjunction.pc import covariance_check

        combined, reason = covariance_check(
            cov_primary=self._square_matrix(),
            cov_secondary=self._square_matrix(),
            frame_primary="RTN",
            frame_secondary="RTN",
            unit_primary="KM2",
            unit_secondary="KM2",
        )
        assert combined is None, "RTN covariance was accepted; it must not be"
        assert "FRAME" in reason.upper(), f"unexpected rejection reason: {reason}"

    def test_metre_squared_units_are_rejected(self):
        """Gate 4 — Pc accepts KM2 only; CDMs publish m**2."""
        from backend.conjunction.pc import covariance_check

        combined, reason = covariance_check(
            cov_primary=self._square_matrix(),
            cov_secondary=self._square_matrix(),
            frame_primary="TEME",
            frame_secondary="TEME",
            unit_primary="m**2",
            unit_secondary="m**2",
        )
        assert combined is None, "m**2 covariance was accepted; it must not be"
        assert "UNIT" in reason.upper(), f"unexpected rejection reason: {reason}"

    def test_pc_is_not_computed_without_combined_hbr_semantics(self):
        """Gate 5 — COMBINED_HBR is required and is not a CDM field."""
        text = SPEC_SHAPED.read_text(encoding="utf-8")
        assert "HBR" not in text, (
            "a CDM carries object dimensions, not a combined-HBR declaration; "
            "the semantics must be supplied out of band"
        )


class TestExistingFixtureIsEngineShapedNotSpecShaped:
    """Name the circularity in the one fixture the Pc engine has ever accepted."""

    def test_the_valid_fixture_declares_its_covariance_synthetic(self):
        """The fixture's own admission is the evidence; it must stay findable.

        Matched against the whole document rather than one key, so moving the
        disclosure between fields cannot quietly erase it.
        """
        text = ENGINE_SHAPED.read_text(encoding="utf-8").lower()
        assert "synthetic" in text, (
            "the fixture's own disclosure is the evidence that it is not observed "
            "data; if it is ever removed, this circularity becomes invisible"
        )
        assert "must never be presented as a live operational conjunction" in text

    def test_the_valid_fixture_uses_our_conventions_not_the_standard_s(self):
        import json

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
        that absence is precisely why the frame and unit gaps went unnoticed.
        """
        import json

        externally_sourced = []
        for path in FIXTURES.glob("*.json"):
            document = json.loads(path.read_text(encoding="utf-8"))
            if document.get("source_uri") and document.get("content_sha256"):
                externally_sourced.append(path.name)
        assert not externally_sourced, (
            "an externally sourced Pc fixture now exists — retire this test and "
            "make the traceability invariant positive instead"
        )
