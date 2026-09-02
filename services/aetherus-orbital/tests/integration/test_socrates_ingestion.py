"""The SOCRATES chain end-to-end: bytes → artifact → event → snapshot → API shape.

This is the first path that carries an externally computed metric into the
store, so the test walks the whole chain rather than the parser alone: the CSV
bytes become a content-addressed artifact linked to an ingestion run, MAX_PC and
the geometry land with ``OBSERVED_EXTERNAL`` bases, and the read path reports
both as OBSERVED — never as COMPUTED.

Hygiene rules, each learned the hard way in this repository:

* **Rows are marked EVIDENCE_PROBE, never PUBLIC_SOCRATES.** The snapshot table
  is append-only, so whatever a test writes is permanent. A synthetic row
  wearing the live grade would be indistinguishable from observed data — the
  pollution documented as defect 5 in the 2026-09-02 audit.
* **The artifact is not attributed to CelesTrak.** Its bytes are synthetic; the
  provenance says so, and its URI uses the ``recorded://`` scheme.
* **Real objects are read from the DB, not assumed.** The test resolves two
  catalogue ids that actually exist and skips honestly when the catalogue is
  empty.
* **Probe rows never surface in a default read.** The API's default listing
  excludes simulation grades, so these permanent rows cannot pollute the
  product view; the test asks for its grade explicitly.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from backend.conjunction.repository import ConjunctionRepository
from backend.conjunction.service import _event_payload
from backend.database import get_db_session
from backend.ingestion.socrates_service import (
    _canonical_pair,
    _source_event_id,
    _tca_utc,
    persist_socrates_result,
)
from backend.ingestion.storage import RawArtifactStore
from backend.providers_live import RawResponse
from backend.providers_live.socrates import SOURCE_ID, parse_socrates_csv

pytestmark = pytest.mark.integration

#: Simulation grade recognised by is_simulation_source_grade, so these permanent
#: append-only rows can never be mistaken for the live feed.
TEST_GRADE = "EVIDENCE_PROBE"
TEST_ATTRIBUTION = "EVIDENCE_PROBE: synthetic bytes written by the test suite; not CelesTrak data"
TEST_URI = "recorded://evidence-probe/socrates/sort-minRange.csv"

_HEADER = (
    "NORAD_CAT_ID_1,OBJECT_NAME_1,DSE_1,NORAD_CAT_ID_2,OBJECT_NAME_2,DSE_2,"
    "TCA,TCA_RANGE,TCA_RELATIVE_SPEED,MAX_PROB,DILUTION"
)


async def _two_real_catalog_ids() -> tuple[str, str]:
    repository = ConjunctionRepository()
    rows = await repository.load_screenable_solutions(2)
    if len(rows) < 2:
        pytest.skip("the stored catalogue holds fewer than two screenable objects")
    return str(rows[0]["catalog_id"]), str(rows[1]["catalog_id"])


def _feed(rows: list[str], retrieved_at: datetime):
    body = "\n".join([_HEADER, *rows]) + "\n"
    content = body.encode("utf-8")
    return parse_socrates_csv(
        RawResponse(
            content=content,
            source_id=SOURCE_ID,
            source_uri=TEST_URI,
            retrieved_at=retrieved_at,
            raw_sha256=hashlib.sha256(content).hexdigest(),
            media_type="text/csv",
            http_status=200,
        )
    )


async def _persist(result, store):
    return await persist_socrates_result(
        result,
        store=store,
        source_grade=TEST_GRADE,
        artifact_attribution=TEST_ATTRIBUTION,
    )


async def _rows_for(object_ref: str, since: datetime, grade: str | None):
    rows, _ = await ConjunctionRepository().list_conjunctions(
        object_ref=object_ref,
        start=since,
        stop=None,
        source_grade=grade,
        metric_type=None,
        threshold_min=None,
        threshold_max=None,
        limit=500,
    )
    return rows


class TestTcaHandling:
    def test_naive_tca_is_utc_not_local(self):
        """The nine-hour OMM epoch bug must not be repeatable here."""
        tca = _tca_utc("2026-09-02 04:15:33.130")
        assert tca.tzinfo is UTC
        assert tca.hour == 4, "a naive SOCRATES TCA was reinterpreted in local time"

    def test_identity_truncates_to_the_minute(self):
        a = _tca_utc("2026-09-02 04:15:33.130")
        b = _tca_utc("2026-09-02 04:15:59.999")
        c = _tca_utc("2026-09-02 04:16:00.000")
        assert _source_event_id(a) == _source_event_id(b)
        assert _source_event_id(a) != _source_event_id(c)

    def test_pair_order_is_by_object_identity_not_feed_column(self):
        assert _canonical_pair("b", "a") == ("a", "b")
        assert _canonical_pair("a", "b") == ("a", "b")


class TestPersistedChain:
    async def test_values_survive_to_the_api_shape_as_observed(self, tmp_path):
        primary_id, secondary_id = await _two_real_catalog_ids()
        retrieved_at = datetime.now(UTC)
        tca = (retrieved_at + timedelta(hours=6)).replace(microsecond=0)
        stamp = tca.strftime("%Y-%m-%d %H:%M:%S")
        result = _feed(
            [
                f"{primary_id},PRIMARY,0.5,{secondary_id},SECONDARY,0.7,{stamp},0.715,14.762,1.42E-05,1.203",
                # A pair entirely outside the catalogue: counted, never written.
                f"999990,GHOST-A,0.1,999991,GHOST-B,0.2,{stamp},1.0,10.0,1.0E-06,2.0",
            ],
            retrieved_at,
        )

        outcome = await _persist(result, RawArtifactStore(tmp_path / "raw"))

        assert outcome.conjunction_rows == 2
        assert outcome.snapshots_written == 1
        assert outcome.events_written == 1
        assert outcome.snapshots_skipped_duplicate == 0
        assert outcome.rows_outside_catalog == 1

        # The artifact and the run are real rows, linked, and honestly attributed.
        async with get_db_session() as session:
            artifact = (
                await session.execute(
                    text(
                        "SELECT source_id, content_sha256, ingestion_run_id::text AS run_id,"
                        " provenance_json->>'attribution' AS attribution"
                        " FROM raw_artifact WHERE id = CAST(:id AS uuid)"
                    ),
                    {"id": outcome.artifact_id},
                )
            ).mappings().one()
            run = (
                await session.execute(
                    text(
                        "SELECT status, record_count FROM ingestion_run"
                        " WHERE id = CAST(:id AS uuid)"
                    ),
                    {"id": outcome.ingestion_run_id},
                )
            ).mappings().one()
        assert artifact["source_id"] == SOURCE_ID
        assert artifact["content_sha256"] == outcome.raw_sha256
        assert artifact["run_id"] == outcome.ingestion_run_id
        assert "CelesTrak" not in (artifact["attribution"] or "") or "not CelesTrak" in artifact["attribution"]
        assert run["status"] == "SUCCEEDED"
        assert run["record_count"] == 1

        # Read path: every external value surfaces as OBSERVED with its origin.
        rows = await _rows_for(primary_id, retrieved_at, TEST_GRADE)
        ours = [row for row in rows if str(row.get("input_hash")) == outcome.raw_sha256]
        assert ours, "the ingested snapshot did not come back from the read path"
        metrics = _event_payload(ours[0])["latest_snapshot"]["metrics"]

        max_pc = metrics["MAX_PC"]
        assert max_pc["value"] == pytest.approx(1.42e-05)
        assert max_pc["status"] == "OBSERVED" and max_pc["status"] != "COMPUTED"
        assert max_pc["basis"] == "OBSERVED_EXTERNAL"
        assert max_pc["source_id"] == SOURCE_ID
        assert max_pc["content_sha256"] == outcome.raw_sha256

        miss = metrics["MISS_DISTANCE"]
        assert miss["value"] == pytest.approx(715.0)
        assert miss["status"] == "OBSERVED", (
            "CelesTrak's TCA_RANGE was served as our computation"
        )
        assert miss["basis"] == "OBSERVED_EXTERNAL"

        pc = metrics["PC"]
        assert pc["value"] is None
        assert pc["status"] == "NOT_COMPUTED"
        assert pc["unavailable_reason"] == "EXTERNAL_SCREENING_PROVIDES_NO_PC"

    async def test_probe_rows_are_absent_from_the_default_listing(self, tmp_path):
        primary_id, secondary_id = await _two_real_catalog_ids()
        retrieved_at = datetime.now(UTC)
        tca = (retrieved_at + timedelta(hours=8)).replace(microsecond=0)
        stamp = tca.strftime("%Y-%m-%d %H:%M:%S")
        result = _feed(
            [f"{primary_id},P,0.5,{secondary_id},S,0.7,{stamp},0.5,12.0,2.0E-06,1.0"],
            retrieved_at,
        )
        outcome = await _persist(result, RawArtifactStore(tmp_path / "raw"))

        default_rows = await _rows_for(primary_id, retrieved_at, None)
        assert not [r for r in default_rows if str(r.get("input_hash")) == outcome.raw_sha256], (
            "a permanent EVIDENCE_PROBE row surfaced in a default read"
        )
        explicit_rows = await _rows_for(primary_id, retrieved_at, TEST_GRADE)
        assert [r for r in explicit_rows if str(r.get("input_hash")) == outcome.raw_sha256]

    async def test_reingesting_identical_bytes_writes_nothing_new(self, tmp_path):
        primary_id, secondary_id = await _two_real_catalog_ids()
        retrieved_at = datetime.now(UTC)
        tca = (retrieved_at + timedelta(hours=7)).replace(microsecond=0)
        stamp = tca.strftime("%Y-%m-%d %H:%M:%S")
        result = _feed(
            [f"{primary_id},P,0.5,{secondary_id},S,0.7,{stamp},0.9,12.0,3.10E-07,1.5"],
            retrieved_at,
        )
        store = RawArtifactStore(tmp_path / "raw")

        first = await _persist(result, store)
        second = await _persist(result, store)

        assert first.artifact_id == second.artifact_id
        assert first.artifact_created is True and second.artifact_created is False
        assert first.snapshots_written == 1
        assert second.snapshots_written == 0
        assert second.snapshots_skipped_duplicate == 1
        assert second.event_ids == first.event_ids
        assert any("already ingested" in w for w in second.warnings)

    async def test_reversed_feed_order_lands_on_the_same_event(self, tmp_path):
        primary_id, secondary_id = await _two_real_catalog_ids()
        retrieved_at = datetime.now(UTC)
        tca = (retrieved_at + timedelta(hours=9)).replace(microsecond=0)
        stamp = tca.strftime("%Y-%m-%d %H:%M:%S")
        store = RawArtifactStore(tmp_path / "raw")

        forward = await _persist(
            _feed([f"{primary_id},P,0.5,{secondary_id},S,0.7,{stamp},0.9,12.0,3.10E-07,1.5"], retrieved_at),
            store,
        )
        reversed_ = await _persist(
            _feed([f"{secondary_id},S,0.7,{primary_id},P,0.5,{stamp},0.9,12.0,3.10E-07,1.5"], retrieved_at),
            store,
        )
        assert forward.event_ids == reversed_.event_ids, (
            "the same physical conjunction became two events because the feed "
            "printed the pair in the other order"
        )
