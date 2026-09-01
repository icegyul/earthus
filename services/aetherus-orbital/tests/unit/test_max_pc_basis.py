"""MAX_PC provenance: a value we did not compute must never be reported as computed.

The PC channel carries a stored ``pc_status`` and the payload passes it through.
MAX_PC had no status column, so the payload inferred one from the value merely
being non-null. That inference is a provenance forgery waiting for its first
input: the moment an externally published screening metric (CelesTrak SOCRATES
MAX_PROB, a vendor feed, a customer upload) lands in the column, every API client
is told Aetherus computed it.

These tests fix the contract before any such value exists. They must fail against
the pre-016 code — that failure is the proof the guardrail is real.
"""

from __future__ import annotations

import pytest

from backend.conjunction.service import _event_payload

# Any basis the column accepts. COMPUTED_INTERNAL is the only one that may
# surface as COMPUTED, because it is the only one we actually derived.
BASIS_COMPUTED_INTERNAL = "COMPUTED_INTERNAL"
BASIS_OBSERVED_EXTERNAL = "OBSERVED_EXTERNAL"
BASIS_ASSUMED_FAMILY = "ASSUMED_FAMILY"


def _row(**overrides: object) -> dict[str, object]:
    """A conjunction_snapshot row as the payload builder receives it."""
    row: dict[str, object] = {
        "event_id": "11111111-1111-1111-1111-111111111111",
        "source_event_id": "SCREEN-1",
        "tca": "2026-09-02T00:00:00+00:00",
        "first_seen_at": None,
        "last_seen_at": None,
        "event_status": "OPEN",
        "primary_object_id": "aaaaaaaa-0000-0000-0000-000000000001",
        "primary_catalog_id": "300001",
        "primary_name": "CORPUS-A",
        "secondary_object_id": "aaaaaaaa-0000-0000-0000-000000000002",
        "secondary_catalog_id": "300002",
        "secondary_name": "CORPUS-B",
        "snapshot_id": "22222222-2222-2222-2222-222222222222",
        "snapshot_at": None,
        "miss_distance_m": 1200.0,
        "relative_speed_mps": 14100.0,
        "pc": None,
        "pc_method": None,
        "pc_status": "NOT_COMPUTED",
        "pc_unavailable_reason": "COVARIANCE_MISSING_PUBLIC_GP",
        "max_pc": None,
        "max_pc_method": None,
        "max_pc_basis": None,
        "max_pc_status": None,
        "max_pc_source_id": None,
        "max_pc_content_sha256": None,
        "covariance_status": "INSUFFICIENT_DATA",
        "dilution_state": None,
        "tca_boundary_flag": False,
        "source_grade": "PUBLIC_GP",
        "validation_state": "PUBLIC_SCREENING",
        "model_version": "coarse-v1",
        "input_hash": "0" * 64,
        "provenance_json": {},
    }
    row.update(overrides)
    return row


class TestExternalMaxPcIsNeverReportedAsComputed:
    def test_external_value_does_not_claim_we_computed_it(self):
        """An ingested third-party screening metric must not surface as COMPUTED."""
        payload = _event_payload(
            _row(
                max_pc=3.4e-5,
                max_pc_method="SOCRATES_MAX_PROB",
                max_pc_basis=BASIS_OBSERVED_EXTERNAL,
                max_pc_status="OBSERVED",
            )
        )
        channel = payload["latest_snapshot"]["metrics"]["MAX_PC"]
        assert channel["value"] == 3.4e-5
        assert channel["status"] != "COMPUTED", (
            "a value sourced from a third party was reported as computed by us"
        )
        assert channel["basis"] == BASIS_OBSERVED_EXTERNAL

    def test_assumed_family_bound_does_not_claim_to_be_computed(self):
        """A bound derived from a declared uncertainty family is not a computation."""
        payload = _event_payload(
            _row(
                max_pc=1.1e-4,
                max_pc_method="DECLARED_UNCERTAINTY_FAMILY_V1",
                max_pc_basis=BASIS_ASSUMED_FAMILY,
                max_pc_status="ASSUMED",
            )
        )
        channel = payload["latest_snapshot"]["metrics"]["MAX_PC"]
        assert channel["status"] != "COMPUTED"
        assert channel["basis"] == BASIS_ASSUMED_FAMILY

    def test_internally_computed_value_still_reports_computed(self):
        """The honest path must keep working: our own computation says COMPUTED."""
        payload = _event_payload(
            _row(
                max_pc=7.2e-6,
                max_pc_method="ALFANO_MAX_PROB",
                max_pc_basis=BASIS_COMPUTED_INTERNAL,
                max_pc_status="COMPUTED",
            )
        )
        channel = payload["latest_snapshot"]["metrics"]["MAX_PC"]
        assert channel["status"] == "COMPUTED"
        assert channel["basis"] == BASIS_COMPUTED_INTERNAL

    def test_absent_value_is_not_computed(self):
        payload = _event_payload(_row())
        channel = payload["latest_snapshot"]["metrics"]["MAX_PC"]
        assert channel["value"] is None
        assert channel["status"] == "NOT_COMPUTED"

    def test_status_is_never_inferred_from_the_value_alone(self):
        """A value with no recorded basis must not be dressed as a computation.

        This is the exact defect: status was derived from ``max_pc is not None``.
        A row carrying a value but no basis is a data fault, and the payload must
        say so rather than guess in the flattering direction.
        """
        payload = _event_payload(_row(max_pc=9.9e-5, max_pc_basis=None, max_pc_status=None))
        channel = payload["latest_snapshot"]["metrics"]["MAX_PC"]
        assert channel["status"] != "COMPUTED", (
            "status was inferred from the value being non-null"
        )
        assert channel["status"] == "BASIS_UNRECORDED"


class TestMaxPcChannelKeepsProvenance:
    @pytest.mark.parametrize(
        "basis,status",
        [
            (BASIS_OBSERVED_EXTERNAL, "OBSERVED"),
            (BASIS_ASSUMED_FAMILY, "ASSUMED"),
            (BASIS_COMPUTED_INTERNAL, "COMPUTED"),
        ],
    )
    def test_every_populated_channel_exposes_its_basis(self, basis: str, status: str):
        payload = _event_payload(
            _row(max_pc=1e-5, max_pc_method="m", max_pc_basis=basis, max_pc_status=status)
        )
        assert payload["latest_snapshot"]["metrics"]["MAX_PC"]["basis"] == basis

    def test_externally_observed_value_surfaces_its_source(self):
        """An external number is only defensible with its origin attached."""
        payload = _event_payload(
            _row(
                max_pc=3.4e-5,
                max_pc_method="SOCRATES_MAX_PROB",
                max_pc_basis=BASIS_OBSERVED_EXTERNAL,
                max_pc_status="OBSERVED",
                max_pc_source_id="CELESTRAK_SOCRATES",
                max_pc_content_sha256="a" * 64,
            )
        )
        channel = payload["latest_snapshot"]["metrics"]["MAX_PC"]
        assert channel["source_id"] == "CELESTRAK_SOCRATES"
        assert channel["content_sha256"] == "a" * 64
