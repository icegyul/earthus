"""Reading a CCSDS 508.0-B-1 CDM in the encoding it is actually published in.

These tests exercise the KVN path against tests/fixtures/cdm/ccsds_508_kvn_shaped.txt,
a document built to the standard's structure rather than to our engine's
preferences. The point is a narrow, checkable claim: we can now READ a real CDM.

Being able to read it is not the same as being able to compute Pc from it, and
this file is careful to keep the two apart. The frame gate is still shut — a CDM
covariance is RTN, rotating it into TEME needs the object state vector, and a
wrong rotation produces plausible Pc values instead of visible failures. So the
parser reports RTN honestly and ``covariance_summary`` names it as the remaining
blocker rather than papering over it.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.conjunction.cdm import CdmParseError
from backend.conjunction.cdm_kvn import (
    COVARIANCE_KEYS,
    covariance_summary,
    lower_triangle_to_matrix,
    looks_like_kvn,
    parse_any_cdm,
    parse_cdm_kvn,
    parse_kvn_sections,
)

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "cdm"
SPEC_SHAPED = FIXTURES / "ccsds_508_kvn_shaped.txt"
ENGINE_SHAPED = FIXTURES / "tracss_spec_example_cdm_valid.json"

GRADE = "SPEC_SHAPE_FIXTURE"


@pytest.fixture(scope="module")
def parsed():
    return parse_cdm_kvn(SPEC_SHAPED.read_bytes(), source_grade=GRADE)


class TestKvnEncodingIsNowReadable:
    def test_the_document_that_used_to_die_at_json_loads_now_parses(self, parsed):
        assert parsed.tca == "2026-09-02T04:15:33.120"
        assert parsed.miss_distance_m == pytest.approx(715.0)
        assert parsed.relative_speed_mps == pytest.approx(14762.0)

    def test_both_objects_are_recovered_separately(self, parsed):
        assert parsed.primary.catalog_id == "30001"
        assert parsed.secondary.catalog_id == "30002"
        assert parsed.primary.name == "SPEC SHAPE PRIMARY"
        assert parsed.secondary.name == "SPEC SHAPE SECONDARY"

    def test_repeated_keys_do_not_let_the_second_object_overwrite_the_first(self):
        """OBJECT_DESIGNATOR appears twice; flattening would lose the primary."""
        _, objects = parse_kvn_sections(SPEC_SHAPED.read_text(encoding="utf-8"))
        assert len(objects) == 2
        assert objects[0]["OBJECT_DESIGNATOR"].value != objects[1]["OBJECT_DESIGNATOR"].value

    def test_comments_are_ignored_not_parsed_as_fields(self):
        header, _ = parse_kvn_sections(SPEC_SHAPED.read_text(encoding="utf-8"))
        assert "COMMENT" not in header

    def test_a_json_cdm_still_routes_to_the_json_parser(self):
        parsed = parse_any_cdm(ENGINE_SHAPED.read_bytes(), source_grade=GRADE)
        assert parsed.primary.covariance_reference_frame == "TEME"

    def test_detection_is_by_content_not_by_extension(self):
        assert looks_like_kvn(SPEC_SHAPED.read_bytes()) is True
        assert looks_like_kvn(ENGINE_SHAPED.read_bytes()) is False

    def test_a_document_without_the_version_key_is_refused(self):
        with pytest.raises(CdmParseError, match="CCSDS_CDM_VERS"):
            parse_cdm_kvn(b"TCA = 2026-09-02T00:00:00\n", source_grade=GRADE)

    def test_a_document_with_one_object_is_refused(self):
        text = SPEC_SHAPED.read_text(encoding="utf-8")
        truncated = text[: text.index("OBJECT = OBJECT2")]
        with pytest.raises(CdmParseError, match="exactly two objects"):
            parse_cdm_kvn(truncated.encode("utf-8"), source_grade=GRADE)


class TestLowerTriangleExpansion:
    def test_twenty_one_elements_become_a_symmetric_six_by_six(self):
        matrix = lower_triangle_to_matrix([float(n) for n in range(1, 22)])
        assert len(matrix) == 6 and all(len(row) == 6 for row in matrix)
        for row in range(6):
            for col in range(6):
                assert matrix[row][col] == matrix[col][row], "matrix must be symmetric"

    def test_elements_land_in_the_order_the_standard_lists_them(self):
        matrix = lower_triangle_to_matrix([float(n) for n in range(1, 22)])
        # (0,0), then (1,0), (1,1), then (2,0), (2,1), (2,2), ...
        assert matrix[0][0] == 1.0
        assert matrix[1][0] == 2.0 and matrix[1][1] == 3.0
        assert matrix[2][0] == 4.0 and matrix[2][2] == 6.0

    def test_symmetry_is_exact_not_approximate(self):
        """Both halves come from one published number, so no rounding can differ."""
        matrix = lower_triangle_to_matrix([0.1 + n / 3.0 for n in range(21)])
        for row in range(6):
            for col in range(6):
                assert matrix[row][col] is matrix[col][row] or (
                    matrix[row][col] == matrix[col][row]
                )

    @pytest.mark.parametrize("count", [0, 20, 22, 36])
    def test_a_wrong_element_count_is_refused_not_padded(self, count: int):
        with pytest.raises(CdmParseError, match="21 lower-triangle"):
            lower_triangle_to_matrix([1.0] * count)

    def test_the_standard_key_order_has_twenty_one_entries(self):
        assert len(COVARIANCE_KEYS) == 21
        assert COVARIANCE_KEYS[0] == "CR_R"
        assert COVARIANCE_KEYS[-1] == "CNDOT_NDOT"


class TestUnitsAreConvertedExactlyAndOnlyWhereValid:
    def test_position_block_is_converted_from_metres_squared(self, parsed):
        # CR_R = 4.142E+01 m**2 -> 4.142e-05 km2
        assert parsed.primary.covariance_km2[0][0] == pytest.approx(4.142e-05)
        assert parsed.primary.covariance_unit == "KM2"

    def test_the_conversion_is_reported_not_silent(self, parsed):
        assert any("m**2 to km2" in w for w in parsed.warnings)

    def test_velocity_blocks_are_not_scaled_by_the_position_factor(self, parsed):
        """CRDOT_RDOT is m**2/s**2; applying 1e-6 to it would be wrong."""
        assert parsed.primary.covariance_km2[3][3] == pytest.approx(5.457e-06)

    def test_an_incomplete_triangle_is_treated_as_absent_rather_than_padded(self):
        text = SPEC_SHAPED.read_text(encoding="utf-8")
        without_one = "\n".join(
            line for line in text.splitlines() if not line.startswith("CN_T =")
        )
        parsed = parse_cdm_kvn(without_one.encode("utf-8"), source_grade=GRADE)
        assert parsed.primary.covariance_km2 is None
        assert any("incomplete" in w for w in parsed.warnings)


class TestFrameGateStaysShut:
    def test_the_frame_is_reported_as_published_not_as_wanted(self, parsed):
        assert parsed.primary.covariance_reference_frame == "RTN"
        assert parsed.secondary.covariance_reference_frame == "RTN"

    def test_the_remaining_blocker_is_named(self, parsed):
        summary = covariance_summary(parsed)
        assert summary["pc_reachable"] is False
        assert "primary_frame_RTN" in summary["blockers"]
        assert "hbr_semantics_absent" in summary["blockers"]

    def test_the_unit_blocker_is_gone(self, parsed):
        """Units were a real gate and are now handled; the frame is what is left."""
        summary = covariance_summary(parsed)
        assert not [b for b in summary["blockers"] if b.startswith("primary_unit")]

    def test_a_warning_tells_the_reader_why_pc_will_still_fail(self, parsed):
        assert any("requires TEME" in w for w in parsed.warnings)

    def test_no_combined_hbr_is_invented_from_object_dimensions(self, parsed):
        assert parsed.combined_hbr_m is None
        assert parsed.hbr_semantics is None
