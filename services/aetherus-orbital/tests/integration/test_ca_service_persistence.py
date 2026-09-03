"""Conjunction assessment service persistence and state handling."""

import pytest
from sqlalchemy import text

from backend.conjunction.models import ScreeningConfig
from backend.conjunction.repository import ConjunctionRepository
from backend.conjunction.service import ConjunctionService


#: Bound the screening population for these persistence tests. Pair count is
#: quadratic, so the full ~2,851-object catalogue costs ~40 minutes per call and
#: this file makes six. A bounded slice of the REAL catalogue keeps every
#: assertion about persisted state honest while costing seconds (measured
#: 2026-09-02: 150 objects -> 10,878 pairs -> 12 events, 11.5s).
SCREENING_SCOPE_OBJECTS = 150


@pytest.fixture
async def repository():
    return ConjunctionRepository()


class TestRealCatalogScreening:
    async def test_screening_over_stored_solutions_persists_honest_states(
        self, repository
    ):
        service = ConjunctionService(repository)
        payload = await service.run_screening(window_hours=6.0, max_objects=SCREENING_SCOPE_OBJECTS)

        run_id = payload["data"]["screening_run_id"]
        assert run_id
        assert payload["data_status"] in {"OK", "PARTIAL", "INSUFFICIENT_DATA", "UNAVAILABLE"}
        if payload["data"]["objects_considered"] < 2:
            assert payload["data_status"] == "UNAVAILABLE"
            assert payload["status_reason"] in {
                "NO_PROPAGABLE_SOLUTIONS",
                "ONLY_ONE_PROPAGABLE_SOLUTION",
            }
            return
        assert payload["provenance"]["config_hash"]
        assert payload["provenance"]["input_hash"]

        # Every stored snapshot must carry the explicit Pc gating for PUBLIC_GP.
        from backend.database import get_db_session

        async with get_db_session() as session:
            rows = (
                await session.execute(
                    text(
                        """
                        SELECT pc, pc_status, pc_unavailable_reason, covariance_status,
                               miss_distance_m, source_grade, provenance_json
                        FROM conjunction_snapshot
                        WHERE screening_run_id = CAST(:run_id AS uuid)
                        """
                    ),
                    {"run_id": run_id},
                )
            ).mappings().all()
        for row in rows:
            assert row["pc_status"] in {"COMPUTED", "NOT_COMPUTED", "PC_UNAVAILABLE"}
            if row["source_grade"] == "PUBLIC_GP":
                assert row["pc"] is None
                assert row["pc_status"] == "NOT_COMPUTED"
                assert row["pc_unavailable_reason"] == "COVARIANCE_MISSING_PUBLIC_GP"

    async def test_second_run_appends_snapshot_not_new_event(self, repository):
        service = ConjunctionService(repository)
        first = await service.run_screening(window_hours=6.0, max_objects=SCREENING_SCOPE_OBJECTS)
        second = await service.run_screening(window_hours=6.0, max_objects=SCREENING_SCOPE_OBJECTS)
        if first["data"]["events_found"] == 0:
            # Nothing to version; the run itself still must exist twice.
            assert first["data"]["screening_run_id"] != second["data"]["screening_run_id"]
            return
        first_event = first["data"]["events"][0]
        matching_second = [
            event
            for event in second["data"]["events"]
            if event["primary_catalog_id"] == first_event["primary_catalog_id"]
            and event["secondary_catalog_id"] == first_event["secondary_catalog_id"]
        ]
        assert matching_second, "event identity must be stable across runs"
        assert matching_second[0]["event_id"] is not None

        # Versioning lives on the snapshot, not on a duplicated event - that part
        # is unchanged. What changed is that a second run only writes a snapshot
        # when the assessment actually moved: re-screening identical input used
        # to append a row per candidate, and five in six said nothing new.
        repeat = matching_second[0]
        if repeat["snapshot_written"]:
            assert repeat["snapshot_id"] != first_event["snapshot_id"], (
                "a written snapshot must be a new row"
            )
            assert repeat["changed_channels"], "a write must name what moved"
        else:
            assert repeat["snapshot_id"] == first_event["snapshot_id"], (
                "a reused assessment must point at the row that still describes it"
            )
            assert repeat["changed_channels"] == []

        coverage = second["data"]["coverage"]
        assert coverage["snapshots_written"] + coverage["snapshots_reused"] == len(
            second["data"]["events"]
        ), "every candidate is either written or reused; the accounting must close"
        assert coverage["snapshots_reused"] > 0, (
            "re-screening the same window rewrote every candidate; the "
            "material-change policy is not being applied"
        )

    async def test_pair_counts_recorded(self, repository):
        payload = await ConjunctionService(repository).run_screening(window_hours=4.0, max_objects=SCREENING_SCOPE_OBJECTS)
        data = payload["data"]
        n_objects = data["objects_propagated"]
        expected_pairs = n_objects * (n_objects - 1) // 2
        assert data["pairs_before_screening"] == max(expected_pairs, 0)


class TestExplicitStates:
    async def test_window_bounds_enforced(self, repository):
        service = ConjunctionService(repository)
        from backend.conjunction.errors import ScreeningInvalidError

        with pytest.raises(ScreeningInvalidError):
            await service.run_screening(window_hours=1000.0)

    async def test_insufficient_data_when_no_candidates(self, repository):
        """A tiny window over the real catalog legitimately finds nothing."""
        payload = await ConjunctionService(repository).run_screening(window_hours=0.05, max_objects=SCREENING_SCOPE_OBJECTS)
        if payload["data"]["events_found"] > 0:
            pytest.skip("real catalog produced an event inside the probe window")
        assert payload["data_status"] in {"INSUFFICIENT_DATA", "PARTIAL", "UNAVAILABLE"}
        assert payload["status_reason"]


def test_config_defaults_within_contract():
    config = ScreeningConfig()
    assert config.window_hours <= 168.0
    assert config.screening_threshold_m > 0
    assert config.safety_factor >= 1.0
