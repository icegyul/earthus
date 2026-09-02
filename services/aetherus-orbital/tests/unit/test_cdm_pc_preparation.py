"""The last two CDM gates — frame and HBR — opened with checkable transforms.

Nothing here is validated against an external Pc; the repository has no golden
document for that yet (TraCSS CC0 dataset, pending). What CAN be established
without one, and is:

* the RTN basis is orthonormal, and rotating a covariance with it preserves
  trace and eigenvalues (a rotation cannot invent or destroy uncertainty);
* the identity geometry (r along x, v along y) leaves a covariance unchanged,
  and a 90°-rotated geometry moves the radial variance onto the y axis exactly;
* ITRF→TEME is the exact inverse of the service's own TEME→ITRF (round trip);
* degenerate geometry is refused by name, never patched;
* the spec-shaped fixture now reaches ``compute_pc`` and comes back COMPUTED
  with a finite Pc in [0, 1], and its provenance says VALIDATION_PENDING.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pytest

from backend.conjunction.cdm_kvn import parse_cdm_kvn
from backend.conjunction.cdm_pc import (
    HBR_METHOD,
    ROTATION_METHOD,
    VALIDATION_STATE,
    compute_cdm_pc,
    itrf_to_teme,
    prepare_cdm_for_pc,
    rotate_rtn_covariance_to_inertial,
    rtn_basis,
)
from backend.orbit.frames import FrameAssumptions, teme_to_itrf

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "cdm"
SPEC_SHAPED = FIXTURES / "ccsds_508_kvn_shaped.txt"


def _leo_state() -> tuple[np.ndarray, np.ndarray]:
    r = np.array([6878.137, 0.0, 0.0])
    v = np.array([0.0, 7.6127, 0.0])
    return r, v


class TestRtnBasis:
    def test_basis_is_orthonormal(self):
        r = np.array([4000.0, 3000.0, 2500.0])
        v = np.array([-3.0, 5.0, 4.0])
        m = rtn_basis(r, v)
        assert np.allclose(m.T @ m, np.eye(3), atol=1e-12)
        assert np.isclose(np.linalg.det(m), 1.0, atol=1e-12), "must be a proper rotation"

    def test_identity_geometry_gives_identity_basis(self):
        r, v = _leo_state()
        assert np.allclose(rtn_basis(r, v), np.eye(3), atol=1e-12)

    @pytest.mark.parametrize(
        "r,v",
        [
            (np.zeros(3), np.array([0.0, 7.6, 0.0])),
            (np.array([7000.0, 0.0, 0.0]), np.zeros(3)),
            (np.array([7000.0, 0.0, 0.0]), np.array([7.6, 0.0, 0.0])),  # r ∥ v
        ],
    )
    def test_degenerate_geometry_is_refused(self, r, v):
        with pytest.raises(ValueError, match="degenerate"):
            rtn_basis(r, v)


class TestCovarianceRotation:
    def test_rotation_preserves_trace_and_eigenvalues(self):
        cov = np.array([[4.0, 0.5, 0.1], [0.5, 25.0, 0.2], [0.1, 0.2, 1.0]])
        r = np.array([4000.0, 3000.0, 2500.0])
        v = np.array([-3.0, 5.0, 4.0])
        rotated = rotate_rtn_covariance_to_inertial(cov, r, v)
        assert np.isclose(np.trace(rotated), np.trace(cov))
        assert np.allclose(np.sort(np.linalg.eigvalsh(rotated)), np.sort(np.linalg.eigvalsh(cov)))
        assert np.allclose(rotated, rotated.T)

    def test_identity_geometry_leaves_covariance_unchanged(self):
        cov = np.diag([4.0, 25.0, 1.0])
        r, v = _leo_state()
        assert np.allclose(rotate_rtn_covariance_to_inertial(cov, r, v), cov)

    def test_quarter_turn_moves_radial_variance_onto_y(self):
        """r along y, v along -x: R̂ = ŷ, so radial variance lands on the y axis."""
        cov = np.diag([4.0, 25.0, 1.0])  # radial 4, in-track 25, normal 1
        r = np.array([0.0, 6878.137, 0.0])
        v = np.array([-7.6127, 0.0, 0.0])
        rotated = rotate_rtn_covariance_to_inertial(cov, r, v)
        assert np.isclose(rotated[1, 1], 4.0)   # radial → y
        assert np.isclose(rotated[0, 0], 25.0)  # in-track → x
        assert np.isclose(rotated[2, 2], 1.0)   # normal → z


class TestItrfToTeme:
    def test_is_the_exact_inverse_of_the_service_rotation(self):
        assumptions = FrameAssumptions(ut1_utc_offset_seconds=0.0)
        moment = datetime(2026, 9, 2, 4, 15, 33, tzinfo=UTC)
        r_teme = np.array([2570.097, 2244.655, 6281.498])
        v_teme = np.array([4.41877, 4.83355, -3.52677])
        r_itrf, v_itrf = teme_to_itrf(list(r_teme), list(v_teme), moment, assumptions)
        r_back, v_back = itrf_to_teme(np.array(r_itrf), np.array(v_itrf), moment, assumptions)
        assert np.allclose(r_back, r_teme, atol=1e-9)
        assert np.allclose(v_back, v_teme, atol=1e-9)

    def test_velocity_gains_earth_rotation_term(self):
        """An object at rest in ITRF moves at ω×r in TEME."""
        assumptions = FrameAssumptions(ut1_utc_offset_seconds=0.0)
        moment = datetime(2026, 9, 2, tzinfo=UTC)
        r_itrf = np.array([7000.0, 0.0, 0.0])
        _, v_teme = itrf_to_teme(r_itrf, np.zeros(3), moment, assumptions)
        assert np.isclose(np.linalg.norm(v_teme), 7000.0 * 7.2921159e-5, rtol=1e-6)


class TestSpecShapedDocumentReachesPc:
    @pytest.fixture(scope="class")
    def parsed(self):
        return parse_cdm_kvn(SPEC_SHAPED.read_bytes(), source_grade="SPEC_SHAPE_FIXTURE")

    def test_parser_now_captures_state_and_area(self, parsed):
        assert parsed.primary.state_frame == "ITRF"
        assert parsed.primary.state_position_km is not None
        assert parsed.primary.area_pc_m2 == pytest.approx(12.566)
        assert parsed.secondary.area_pc_m2 == pytest.approx(0.7854)

    def test_preparation_has_no_blockers(self, parsed):
        prep = prepare_cdm_for_pc(parsed)
        assert prep.blockers == (), prep.blockers
        assert prep.provenance["primary_covariance_rotation"] == ROTATION_METHOD
        assert "ITRF->TEME" in prep.provenance["primary_state_frame_path"]
        assert prep.provenance["hbr_method"] == HBR_METHOD
        # √(12.566/π) + √(0.7854/π) = 2.0 + 0.5
        assert prep.hbr_m == pytest.approx(2.5, abs=1e-3)

    def test_pc_is_computed_and_marked_validation_pending(self, parsed):
        outcome, prep = compute_cdm_pc(parsed)
        assert outcome is not None, prep.blockers
        assert outcome.status == "COMPUTED", outcome
        assert outcome.pc is not None and math.isfinite(outcome.pc)
        assert 0.0 <= outcome.pc <= 1.0
        assert prep.provenance["validation_state"] == VALIDATION_STATE

    def test_missing_area_pc_keeps_the_hbr_gate_shut(self, parsed):
        text = SPEC_SHAPED.read_text(encoding="utf-8")
        without = "\n".join(line for line in text.splitlines() if not line.startswith("AREA_PC"))
        stripped = parse_cdm_kvn(without.encode("utf-8"), source_grade="SPEC_SHAPE_FIXTURE")
        outcome, prep = compute_cdm_pc(stripped)
        assert outcome is None
        assert any(b.startswith("hbr_inputs_missing") for b in prep.blockers)
        # ...unless the caller states the combined radius explicitly.
        outcome, _ = compute_cdm_pc(stripped, combined_hbr_m=2.5)
        assert outcome is not None and outcome.status == "COMPUTED"

    def test_unsupported_state_frame_is_refused_by_name(self, parsed):
        text = SPEC_SHAPED.read_text(encoding="utf-8").replace("REF_FRAME = ITRF", "REF_FRAME = EME2000")
        eme = parse_cdm_kvn(text.encode("utf-8"), source_grade="SPEC_SHAPE_FIXTURE")
        outcome, prep = compute_cdm_pc(eme)
        assert outcome is None
        assert "primary_state_frame_EME2000_unsupported" in prep.blockers, (
            "a frame we cannot rotate must be refused, not approximated"
        )
