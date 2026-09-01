"""CA-003: covariance-gated Pc bounds, method recording, and unavailable paths."""

import json
import math
from pathlib import Path

import numpy as np
import pytest

from backend.conjunction.cdm import CdmParseError, parse_cdm
from backend.conjunction.models import PC_METHOD
from backend.conjunction.pc import compute_pc, covariance_check

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "cdm"

# Relative geometry consistent with the fixture's miss distance and speed.
MISS_M = 4899.0
SPEED_KM_S = 13.169


def _relative_state():
    # At TCA the relative miss vector is perpendicular to relative velocity.
    r_rel = (0.0, MISS_M / 1000.0, 0.0)
    v_rel = (SPEED_KM_S, 0.0, 0.0)
    return r_rel, v_rel


def _fixture_bytes(name: str) -> bytes:
    return (FIXTURE_DIR / name).read_bytes()


class TestValidCovariancePc:
    def test_pc_finite_bounded_and_method_recorded(self):
        parsed = parse_cdm(
            _fixture_bytes("tracss_spec_example_cdm_valid.json"),
            source_grade="TRACSS_SPEC_EXAMPLE_NOT_OPERATIONAL",
        )
        r_rel, v_rel = _relative_state()

        outcome = compute_pc(
            r_rel_km=r_rel,
            v_rel_km_s=v_rel,
            cov_primary_km2=parsed.primary.covariance_km2,
            cov_secondary_km2=parsed.secondary.covariance_km2,
            hbr_m=parsed.combined_hbr_m,
            frame_primary=parsed.primary.covariance_reference_frame,
            frame_secondary=parsed.secondary.covariance_reference_frame,
            covariance_unit_primary=parsed.primary.covariance_unit,
            covariance_unit_secondary=parsed.secondary.covariance_unit,
            hbr_semantics=parsed.hbr_semantics,
        )

        assert outcome.status == "COMPUTED"
        assert outcome.pc is not None
        assert 0.0 <= outcome.pc <= 1.0
        assert outcome.method == PC_METHOD == "FOSTER-1992"
        assert outcome.covariance_status == "PRESENT_VALID"
        assert outcome.unavailable_reason is None

    def test_zero_miss_gives_upper_bound_one(self):
        combined = np.eye(3) * 1e-6
        outcome = compute_pc(
            r_rel_km=(0.0, 0.0, 0.0),
            v_rel_km_s=(0.0, 10.0, 0.0),
            cov_primary_km2=combined.tolist(),
            cov_secondary_km2=np.zeros((3, 3)).tolist(),
            hbr_m=5.0,
            frame_primary="TEME",
            frame_secondary="TEME",
            covariance_unit_primary="km2",
            covariance_unit_secondary="km2",
            hbr_semantics="COMBINED_HBR",
        )
        assert outcome.status == "COMPUTED"
        assert outcome.pc == pytest.approx(1.0, abs=1e-4)

    def test_far_miss_near_zero_but_never_exactly_fabricated(self):
        combined = (np.eye(3) * 0.25).tolist()
        outcome = compute_pc(
            r_rel_km=(500.0, 0.0, 0.0),
            v_rel_km_s=(0.0, 10.0, 0.0),
            cov_primary_km2=combined,
            cov_secondary_km2=combined,
            hbr_m=0.005,
            frame_primary="TEME",
            frame_secondary="TEME",
            covariance_unit_primary="km2",
            covariance_unit_secondary="km2",
            hbr_semantics="COMBINED_HBR",
        )
        assert outcome.status == "COMPUTED"
        assert outcome.pc is not None
        assert 0.0 <= outcome.pc < 1e-12


class TestInvalidOrMissingCovariance:
    def test_missing_covariance_is_unavailable_not_zero(self):
        r_rel, v_rel = _relative_state()
        outcome = compute_pc(
            r_rel_km=r_rel,
            v_rel_km_s=v_rel,
            cov_primary_km2=None,
            cov_secondary_km2=None,
            hbr_m=5.0,
        )
        assert outcome.pc is None
        assert outcome.method is None
        assert outcome.status == "PC_UNAVAILABLE"
        assert outcome.unavailable_reason == "COVARIANCE_MISSING"
        assert outcome.covariance_status == "INSUFFICIENT_DATA"

    def test_fixture_without_covariance_stays_unavailable(self):
        document = json.loads(_fixture_bytes("tracss_cdm_missing_covariance.json"))
        assert document["obj1"].get("covariance_km2") is None
        r_rel, v_rel = _relative_state()
        outcome = compute_pc(
            r_rel_km=r_rel,
            v_rel_km_s=v_rel,
            cov_primary_km2=document["obj1"].get("covariance_km2"),
            cov_secondary_km2=document["obj2"].get("covariance_km2"),
            hbr_m=5.0,
        )
        assert outcome.pc is None
        assert outcome.status == "PC_UNAVAILABLE"

    def test_non_psd_fixture_rejected_with_explicit_reason(self):
        document = json.loads(_fixture_bytes("tracss_cdm_invalid_covariance.json"))
        cov1 = document["obj1"]["covariance_km2"]
        cov2 = document["obj2"]["covariance_km2"]
        combined, reason = covariance_check(cov1, cov2, "TEME", "TEME")
        assert combined is None
        assert reason == "COVARIANCE_NOT_POSITIVE_DEFINITE"

        r_rel, v_rel = _relative_state()
        outcome = compute_pc(
            r_rel_km=r_rel,
            v_rel_km_s=v_rel,
            cov_primary_km2=cov1,
            cov_secondary_km2=cov2,
            hbr_m=5.0,
        )
        assert outcome.pc is None
        assert outcome.status == "PC_UNAVAILABLE"
        assert outcome.unavailable_reason == "COVARIANCE_NOT_POSITIVE_DEFINITE"
        assert outcome.covariance_status == "INVALID"

    def test_unsupported_frame_rejected(self):
        valid = json.loads(_fixture_bytes("tracss_spec_example_cdm_valid.json"))
        cov1 = valid["obj1"]["covariance_km2"]
        cov2 = valid["obj2"]["covariance_km2"]
        combined, reason = covariance_check(cov1, cov2, "TEME", "ECEF")
        assert combined is None
        assert reason == "FRAME_UNSUPPORTED_secondary"


class TestCdmParserProvenance:
    def test_valid_fixture_parses_with_grade_preserved(self):
        raw = _fixture_bytes("tracss_spec_example_cdm_valid.json")
        parsed = parse_cdm(raw, source_grade="TRACSS_SPEC_EXAMPLE_NOT_OPERATIONAL")

        assert len(parsed.content_sha256) == 64
        assert parsed.source_grade == "TRACSS_SPEC_EXAMPLE_NOT_OPERATIONAL"
        assert parsed.is_validation_fixture is True
        assert parsed.tca == "2025-05-16T11:08:55.944Z"
        assert parsed.miss_distance_m == pytest.approx(4899.0)
        assert parsed.relative_speed_mps == pytest.approx(13169.0)
        assert parsed.primary.catalog_id == "43013"
        assert parsed.secondary.catalog_id == "147"
        assert parsed.primary.hbr_m == pytest.approx(5.0)
        assert hasattr(parsed.primary, "covariance_unit")
        assert hasattr(parsed, "combined_hbr_m")
        assert parsed.primary.covariance_unit == "km2"
        assert parsed.secondary.covariance_unit == "km2"
        assert parsed.combined_hbr_m == pytest.approx(5.5)
        assert parsed.hbr_semantics == "COMBINED_HBR"

    def test_raw_hash_is_immutable_identity(self):
        raw = _fixture_bytes("tracss_spec_example_cdm_valid.json")
        first = parse_cdm(raw, source_grade="SPEC_EXAMPLE").content_sha256
        second = parse_cdm(raw, source_grade="SPEC_EXAMPLE").content_sha256
        assert first == second

    def test_structurally_broken_cdm_raises_without_invention(self):
        with pytest.raises(CdmParseError):
            parse_cdm(b"{ not json ", source_grade="SPEC_EXAMPLE")
        empty_object = b'{"conjunction_id": "x"}'
        with pytest.raises(CdmParseError):
            parse_cdm(empty_object, source_grade="SPEC_EXAMPLE")


class TestMetricChannelSeparation:
    def test_screening_metric_is_never_relabelled_as_pc(self):
        """MaxProbability-style values must never flow through the Pc channel."""
        document = json.loads(_fixture_bytes("tracss_spec_example_cdm_valid.json"))
        # The fixture carries no max_pc field at all: screening metrics and Pc
        # live in separate channels by contract.
        assert "max_pc" not in document
        r_rel, v_rel = _relative_state()
        missing = compute_pc(
            r_rel_km=r_rel,
            v_rel_km_s=v_rel,
            cov_primary_km2=None,
            cov_secondary_km2=None,
            hbr_m=5.0,
        )
        assert missing.pc is None
        assert missing.status == "PC_UNAVAILABLE"


class TestPcScientificPrerequisites:
    def test_missing_covariance_unit_is_unavailable(self):
        """Pc cannot infer that an unlabelled covariance is expressed in km²."""
        covariance = (np.eye(3) * 0.04).tolist()

        combined, reason = covariance_check(covariance, covariance, "TEME", "TEME")

        assert combined is None
        assert reason == "COVARIANCE_UNIT_MISSING"

    def test_missing_covariance_frame_is_unavailable(self):
        """A covariance without an explicit common frame cannot produce Pc."""
        covariance = (np.eye(3) * 0.04).tolist()

        outcome = compute_pc(
            r_rel_km=(0.2, -0.15, 0.0),
            v_rel_km_s=(4.0, 3.0, 1.0),
            cov_primary_km2=covariance,
            cov_secondary_km2=covariance,
            hbr_m=5.0,
        )

        assert outcome.pc is None
        assert outcome.status == "PC_UNAVAILABLE"
        assert outcome.unavailable_reason == "COVARIANCE_FRAME_MISSING"

    def test_unsupported_covariance_unit_is_unavailable(self):
        """A covariance expressed without a supported km² declaration is rejected."""
        covariance = (np.eye(3) * 0.04).tolist()

        outcome = compute_pc(
            r_rel_km=(0.2, -0.15, 0.0),
            v_rel_km_s=(4.0, 3.0, 1.0),
            cov_primary_km2=covariance,
            cov_secondary_km2=covariance,
            hbr_m=5.0,
            frame_primary="TEME",
            frame_secondary="TEME",
            covariance_unit_primary="m2",
            covariance_unit_secondary="m2",
            hbr_semantics="COMBINED_HBR",
        )

        assert outcome.pc is None
        assert outcome.status == "PC_UNAVAILABLE"
        assert outcome.unavailable_reason == "COVARIANCE_UNIT_UNSUPPORTED_primary"

    def test_equivalent_km_squared_spellings_are_compatible(self):
        """Equivalent explicit km² spellings normalize to one physical unit."""
        covariance = (np.eye(3) * 0.04).tolist()

        outcome = compute_pc(
            r_rel_km=(0.2, -0.15, 0.0),
            v_rel_km_s=(4.0, 3.0, 1.0),
            cov_primary_km2=covariance,
            cov_secondary_km2=covariance,
            hbr_m=5.0,
            frame_primary="TEME",
            frame_secondary="TEME",
            covariance_unit_primary="km2",
            covariance_unit_secondary="km^2",
            hbr_semantics="COMBINED_HBR",
        )

        assert outcome.status == "COMPUTED"
        assert outcome.pc is not None

    def test_missing_combined_hbr_semantics_is_unavailable(self):
        """A numeric HBR is not enough unless its combined-radius meaning is explicit."""
        covariance = (np.eye(3) * 0.04).tolist()

        outcome = compute_pc(
            r_rel_km=(0.2, -0.15, 0.0),
            v_rel_km_s=(4.0, 3.0, 1.0),
            cov_primary_km2=covariance,
            cov_secondary_km2=covariance,
            hbr_m=5.0,
            frame_primary="TEME",
            frame_secondary="TEME",
            covariance_unit_primary="km2",
            covariance_unit_secondary="km2",
        )

        assert outcome.pc is None
        assert outcome.status == "PC_UNAVAILABLE"
        assert outcome.unavailable_reason == "HBR_SEMANTICS_MISSING"

    def test_isotropic_zero_miss_matches_closed_form_gaussian_disk_probability(self):
        """Independent analytic reference: P = 1 - exp(-R² / (2σ²))."""
        variance_km2 = 0.04
        combined = np.eye(3) * variance_km2
        hbr_m = 100.0

        outcome = compute_pc(
            r_rel_km=(0.0, 0.0, 0.0),
            v_rel_km_s=(3.0, 4.0, 2.0),
            cov_primary_km2=(combined / 2.0).tolist(),
            cov_secondary_km2=(combined / 2.0).tolist(),
            hbr_m=hbr_m,
            frame_primary="TEME",
            frame_secondary="TEME",
            covariance_unit_primary="km2",
            covariance_unit_secondary="km2",
            hbr_semantics="COMBINED_HBR",
        )
        expected = 1.0 - math.exp(-((hbr_m / 1000.0) ** 2) / (2.0 * variance_km2))

        assert outcome.status == "COMPUTED"
        assert outcome.pc == pytest.approx(expected, rel=1e-8, abs=1e-12)

    @pytest.mark.parametrize("hbr_m", [0.0, -1.0])
    def test_non_positive_hbr_is_unavailable(self, hbr_m):
        """The hard-body radius must be a finite positive physical input."""
        covariance = (np.eye(3) * 0.04).tolist()

        outcome = compute_pc(
            r_rel_km=(0.2, -0.15, 0.0),
            v_rel_km_s=(4.0, 3.0, 1.0),
            cov_primary_km2=covariance,
            cov_secondary_km2=covariance,
            hbr_m=hbr_m,
            frame_primary="TEME",
            frame_secondary="TEME",
            covariance_unit_primary="km2",
            covariance_unit_secondary="km2",
            hbr_semantics="COMBINED_HBR",
        )

        assert outcome.pc is None
        assert outcome.status == "PC_UNAVAILABLE"
        assert outcome.unavailable_reason == "HBR_INVALID"

    def test_pc_is_invariant_under_common_frame_rotation(self):
        """Rotating state and covariance together must not change encounter-plane Pc."""
        rotation = np.array(
            [
                [0.0, -1.0, 0.0],
                [1.0, 0.0, 0.0],
                [0.0, 0.0, 1.0],
            ]
        )
        relative_position = np.array([0.4, -0.3, 0.0])
        relative_velocity = np.array([3.0, 4.0, 2.0])
        covariance_primary = np.array(
            [
                [0.36, 0.12, -0.04],
                [0.12, 0.81, 0.18],
                [-0.04, 0.18, 0.49],
            ]
        )
        covariance_secondary = np.array(
            [
                [0.16, -0.03, 0.02],
                [-0.03, 0.25, 0.04],
                [0.02, 0.04, 0.36],
            ]
        )

        baseline = compute_pc(
            r_rel_km=tuple(relative_position),
            v_rel_km_s=tuple(relative_velocity),
            cov_primary_km2=covariance_primary.tolist(),
            cov_secondary_km2=covariance_secondary.tolist(),
            hbr_m=100.0,
            frame_primary="TEME",
            frame_secondary="TEME",
            covariance_unit_primary="km2",
            covariance_unit_secondary="km2",
            hbr_semantics="COMBINED_HBR",
        )
        rotated = compute_pc(
            r_rel_km=tuple(rotation @ relative_position),
            v_rel_km_s=tuple(rotation @ relative_velocity),
            cov_primary_km2=(rotation @ covariance_primary @ rotation.T).tolist(),
            cov_secondary_km2=(rotation @ covariance_secondary @ rotation.T).tolist(),
            hbr_m=100.0,
            frame_primary="TEME",
            frame_secondary="TEME",
            covariance_unit_primary="km2",
            covariance_unit_secondary="km2",
            hbr_semantics="COMBINED_HBR",
        )

        assert baseline.status == rotated.status == "COMPUTED"
        assert baseline.pc == pytest.approx(rotated.pc, rel=1e-12, abs=1e-15)
