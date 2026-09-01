"""Regression test for immutable raw-snapshot versioning at the same OMM epoch."""

import json
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy import text

from backend.ingestion.models import FetchedOmmDocument
from backend.ingestion.repository import SqlIngestionRepository
from backend.ingestion.service import IngestionService
from backend.ingestion.storage import RawArtifactStore

pytestmark = pytest.mark.integration

FIXTURE_DIR = Path(__file__).parents[1] / "fixtures" / "celestrak"


class VersionedRecordedProvider:
    """Provides two valid source snapshots with equal scientific epoch and different bytes."""

    def __init__(self, content: bytes) -> None:
        self.content = content

    async def fetch_omm(self, catalog_id: str) -> FetchedOmmDocument:
        provenance = json.loads((FIXTURE_DIR / "iss-25544-2026-08-23.provenance.json").read_text())
        return FetchedOmmDocument(
            source_id=provenance["source_id"],
            source_uri=provenance["source_uri"].replace("25544", catalog_id),
            retrieved_at=datetime.fromisoformat(provenance["retrieved_at"]),
            content=self.content,
            media_type=provenance["media_type"],
        )


def source_bytes_for_catalog_id(catalog_id: int, line_ending: bytes) -> bytes:
    """Derive a valid OMM JSON response from the recorded real source capture."""
    source = json.loads((FIXTURE_DIR / "iss-25544-2026-08-23.json").read_text())
    source[0]["NORAD_CAT_ID"] = catalog_id
    return json.dumps(source, separators=(",", ":")).encode() + line_ending


@pytest.mark.asyncio
async def test_same_epoch_different_raw_snapshots_create_versions_without_overwrite(
    db_session, tmp_path: Path
) -> None:
    """PROV-001: same epoch provenance remains append-only when source bytes differ."""
    catalog_id = "100000001"
    first = IngestionService(
        VersionedRecordedProvider(source_bytes_for_catalog_id(int(catalog_id), b"\n")),
        SqlIngestionRepository(),
        RawArtifactStore(tmp_path),
    )
    second = IngestionService(
        VersionedRecordedProvider(source_bytes_for_catalog_id(int(catalog_id), b"\r\n")),
        SqlIngestionRepository(),
        RawArtifactStore(tmp_path),
    )

    first_result = await first.ingest_catalog_id(catalog_id)
    second_result = await second.ingest_catalog_id(catalog_id)

    versions = await db_session.execute(
        text(
            """
            SELECT id, source_artifact_id
            FROM orbit_solution
            WHERE object_id = CAST(:object_id AS uuid)
            ORDER BY created_at, id
            """
        ),
        {"object_id": first_result.object_id},
    )
    rows = versions.fetchall()

    assert first_result.orbit_solution_id != second_result.orbit_solution_id
    assert len(rows) == 2
    assert {str(row.source_artifact_id) for row in rows} == {
        first_result.raw_artifact_id,
        second_result.raw_artifact_id,
    }
