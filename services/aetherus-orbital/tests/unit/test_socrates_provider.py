"""SOCRATES ingestion: attribute the number, never adopt it.

No network access. Every case runs against fixed bytes so the suite states what
the parser does, not what CelesTrak happened to publish today.

The properties under test are the ones that make ingesting someone else's
screening metric defensible rather than dishonest:

* the value lands in MAX_PC and never touches the PC channel;
* it is marked OBSERVED_EXTERNAL, which the payload layer refuses to call
  COMPUTED (see tests/unit/test_max_pc_basis.py);
* unparsable rows are counted rather than silently dropped;
* six-digit catalogue numbers survive, because CelesTrak exhausted five-digit
  numbers at 69999 and the feed already carries wider identifiers;
* a non-200 stops the client instead of retrying, because CelesTrak's usage
  policy requires that and answers repeated violations with an IP ban.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime

import pytest

from backend.ingestion.errors import InsufficientDataError
from backend.providers_live import RawResponse
from backend.providers_live.socrates import (
    METRIC_BASIS_OBSERVED_EXTERNAL,
    METRIC_METHOD,
    SOURCE_ID,
    SocratesUsagePolicyError,
    fetch_socrates,
    parse_socrates_csv,
)

_HEADER = (
    "NORAD_CAT_ID_1,OBJECT_NAME_1,DSE_1,NORAD_CAT_ID_2,OBJECT_NAME_2,DSE_2,"
    "TCA,TCA_RANGE,TCA_RELATIVE_SPEED,MAX_PROB,DILUTION"
)

# Six-digit identifiers are real: CelesTrak's live feed already carries 62902,
# 67689 and 69673, so a five-digit assumption would corrupt current data.
_ROWS = [
    "25544,ISS (ZARYA),0.12,62902,STARLINK-31234,0.31,"
    "2026-09-02 04:15:33,0.715,14.762,1.42E-05,1.203",
    "69673,COSMOS 2251 DEB,1.02,67689,FENGYUN 1C DEB,0.88,"
    "2026-09-02 09:41:07,1.204,11.330,3.10E-07,2.551",
]


def _raw(body: str, source_uri: str = "https://celestrak.org/SOCRATES/sort-minRange.csv"):
    content = body.encode("utf-8")
    return RawResponse(
        content=content,
        source_id=SOURCE_ID,
        source_uri=source_uri,
        retrieved_at=datetime(2026, 9, 2, 4, 2, 53, tzinfo=UTC),
        raw_sha256=hashlib.sha256(content).hexdigest(),
        media_type="text/csv",
        http_status=200,
    )


def _csv(*rows: str) -> str:
    return "\n".join((_HEADER, *rows)) + "\n"


class TestParsing:
    def test_rows_parse_with_their_published_values(self):
        result = parse_socrates_csv(_raw(_csv(*_ROWS)))
        assert len(result.conjunctions) == 2
        first = result.conjunctions[0]
        assert first.primary_catalog_id == "25544"
        assert first.max_probability == pytest.approx(1.42e-05)
        assert first.tca_range_km == pytest.approx(0.715)
        assert result.status == "AVAILABLE"

    def test_six_digit_catalogue_numbers_survive_intact(self):
        result = parse_socrates_csv(_raw(_csv(*_ROWS)))
        ids = {c.primary_catalog_id for c in result.conjunctions} | {
            c.secondary_catalog_id for c in result.conjunctions
        }
        assert {"62902", "69673", "67689"} <= ids, (
            "a five-digit assumption would have corrupted these identifiers"
        )

    def test_unparsable_rows_are_counted_not_dropped(self):
        broken = "25544,ISS,0.1,30000,DEB,0.2,2026-09-02 04:15:33,notanumber,14.0,1e-5,1.0"
        result = parse_socrates_csv(_raw(_csv(_ROWS[0], broken)))
        assert len(result.conjunctions) == 1
        assert len(result.skipped_rows) == 1, (
            "a feed that starts failing to parse must show a changed skip count, "
            "not merely a shorter result"
        )
        assert result.skipped_rows[0]["row"] == 3

    def test_a_changed_feed_format_is_refused_loudly(self):
        with pytest.raises(InsufficientDataError) as caught:
            parse_socrates_csv(_raw("SOME_OTHER,HEADER\n1,2\n"))
        assert "missing_columns" in caught.value.details

    def test_empty_feed_is_insufficient_data_not_an_empty_success(self):
        result = parse_socrates_csv(_raw(_csv()))
        assert result.conjunctions == ()
        assert result.status == "INSUFFICIENT_DATA"


class TestChannelDiscipline:
    def test_value_populates_max_pc_and_never_pc(self):
        result = parse_socrates_csv(_raw(_csv(*_ROWS)))
        payload = result.conjunctions[0].to_metric_payload(artifact_id="art-1")
        assert payload["max_pc"] == pytest.approx(1.42e-05)
        assert payload["max_pc_method"] == METRIC_METHOD
        for forbidden in ("pc", "pc_method", "pc_status"):
            assert forbidden not in payload, (
                f"a screening bound leaked into the {forbidden} channel"
            )

    def test_value_is_marked_observed_not_computed(self):
        result = parse_socrates_csv(_raw(_csv(*_ROWS)))
        payload = result.conjunctions[0].to_metric_payload(artifact_id="art-1")
        assert payload["max_pc_basis"] == METRIC_BASIS_OBSERVED_EXTERNAL
        assert payload["max_pc_status"] != "COMPUTED"

    def test_external_value_carries_its_artifact(self):
        """The DB constraint requires it; the payload must actually supply it."""
        result = parse_socrates_csv(_raw(_csv(*_ROWS)))
        payload = result.conjunctions[0].to_metric_payload(artifact_id="art-1")
        assert payload["max_pc_artifact_id"] == "art-1"

    def test_result_records_the_assumptions_behind_the_number(self):
        result = parse_socrates_csv(_raw(_csv(*_ROWS)))
        summary = result.to_dict()
        assert summary["metric_channel"] == "MAX_PC"
        assert "not an operational collision probability" in summary["assumptions"]
        assert summary["raw_sha256"] == result.raw_sha256
        assert summary["source_uri"].startswith("https://celestrak.org/SOCRATES/")


class TestUsagePolicy:
    async def test_a_retrying_client_is_refused_before_any_request(self):
        """Retrying a non-200 is what gets the source address firewalled."""

        class _NeverCalled:
            max_retries = 2

            async def fetch_raw(self, *args, **kwargs):  # pragma: no cover
                raise AssertionError("a request was made despite a retrying client")

        with pytest.raises(SocratesUsagePolicyError) as caught:
            await fetch_socrates(_NeverCalled())
        assert caught.value.details["configured_max_retries"] == 2
