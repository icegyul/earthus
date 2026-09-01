"""GROUP ingestion — one immutable response, many canonical debris records.

A fragmentation family is hundreds of objects that arrive in a single provider
response. These tests pin the rules that keep such a cohort honest: one raw
artifact backs every member, malformed rows are quarantined with their reason
instead of being dropped silently, and a response with nothing usable refuses
to invent a record.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from backend.ingestion.errors import InsufficientDataError
from backend.ingestion.models import FetchedOmmDocument
from backend.ingestion.repository import SqlIngestionRepository
from backend.ingestion.service import IngestionService
from backend.ingestion.storage import RawArtifactStore
from backend.database import get_db_session
from backend.domain.object_identity import ObjectIdentityResolver

GROUP = "test-debris-cohort"


def _fragment(catalog_id: str, name: str, anomaly: float) -> dict:
    return {
        "OBJECT_NAME": name,
        "OBJECT_ID": f"1999-025{catalog_id[-3:]}",
        "EPOCH": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f"),
        "MEAN_MOTION": 14.72,
        "ECCENTRICITY": 0.0032,
        "INCLINATION": 98.7,
        "RA_OF_ASC_NODE": 210.4,
        "ARG_OF_PERICENTER": 122.0,
        "MEAN_ANOMALY": anomaly,
        "EPHEMERIS_TYPE": 0,
        "CLASSIFICATION_TYPE": "U",
        "NORAD_CAT_ID": int(catalog_id),
        "ELEMENT_SET_NO": 999,
        "REV_AT_EPOCH": 22000,
        "BSTAR": 0.00031,
        "MEAN_MOTION_DOT": 0.000012,
        "MEAN_MOTION_DDOT": 0,
    }


class RecordedGroupProvider:
    """Serve a recorded group payload without touching the network."""

    def __init__(self, payload: list) -> None:
        self.payload = payload
        self.calls = 0

    async def fetch_group(self, group: str) -> FetchedOmmDocument:
        self.calls += 1
        return FetchedOmmDocument(
            source_id="celestrak_gp",
            source_uri=f"recorded://group/{group}",
            retrieved_at=datetime.now(UTC),
            content=json.dumps(self.payload).encode("utf-8"),
            media_type="application/json",
        )


def _service(provider: RecordedGroupProvider, tmp_path) -> IngestionService:
    repository = SqlIngestionRepository()
    return IngestionService(
        provider=None,
        repository=repository,
        artifact_store=RawArtifactStore(tmp_path / "raw"),
        identity_resolver=ObjectIdentityResolver(repository),
        group_provider=provider,
    )


@pytest.mark.integration
async def test_group_cohort_shares_one_immutable_artifact(tmp_path):
    payload = [
        _fragment("310001", "TEST DEB A", 10.0),
        _fragment("310002", "TEST DEB B", 40.0),
        _fragment("310003", "TEST DEB C", 70.0),
    ]
    provider = RecordedGroupProvider(payload)
    result = await _service(provider, tmp_path).ingest_group(GROUP)

    assert provider.calls == 1, "a family must cost exactly one provider request"
    assert result.status == "SUCCEEDED"
    assert len(result.members) == 3
    assert result.rejected_record_count == 0

    # Every member traces to the same raw artifact -> one SHA-256 provenance root.
    # Scoped to the solutions this run produced; earlier runs of the same fixture
    # legitimately carry their own artifacts.
    async with get_db_session() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT DISTINCT source_artifact_id::text AS artifact"
                    " FROM orbit_solution WHERE id::text = ANY(:ids)"
                ),
                {"ids": [m.orbit_solution_id for m in result.members]},
            )
        ).scalars().all()
    assert rows == [result.raw_artifact_id]

    payload_api = result.to_api_payload()
    assert payload_api["record_count"] == 3
    assert payload_api["provenance"]["input_artifact_hashes"] == [
        f"sha256:{result.raw_artifact.content_sha256}"
    ]
    assert any("NOT_COMPUTED" in line for line in payload_api["provenance"]["limitations"])


@pytest.mark.integration
async def test_group_quarantines_bad_rows_and_counts_them_openly(tmp_path):
    payload = [
        _fragment("310011", "TEST DEB D", 15.0),
        {"OBJECT_NAME": "MALFORMED", "NORAD_CAT_ID": 310012},  # no elements
        _fragment("310013", "TEST DEB E", 55.0),
    ]
    result = await _service(RecordedGroupProvider(payload), tmp_path).ingest_group(GROUP)

    assert result.status == "PARTIAL"
    assert len(result.members) == 2
    assert result.rejected_record_count == 1
    assert sum(result.rejection_reasons.values()) == 1

    async with get_db_session() as session:
        stored = (
            await session.execute(
                text(
                    "SELECT count(*) FROM ingestion_record_rejection"
                    " WHERE ingestion_run_id = CAST(:run AS uuid)"
                ),
                {"run": result.ingestion_run_id},
            )
        ).scalar_one()
    assert stored == 1, "a dropped row must leave a durable quarantine record"


@pytest.mark.integration
async def test_group_with_no_usable_record_refuses_to_invent_one(tmp_path):
    payload = [{"OBJECT_NAME": "ONLY MALFORMED"}]
    with pytest.raises(InsufficientDataError):
        await _service(RecordedGroupProvider(payload), tmp_path).ingest_group(GROUP)
