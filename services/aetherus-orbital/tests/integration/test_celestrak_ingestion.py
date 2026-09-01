"""PostGIS persistence test using a recorded response captured from CelesTrak."""

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


class RecordedCelesTrakProvider:
    """Feeds the direct CelesTrak capture to a real database persistence path."""

    async def fetch_omm(self, catalog_id: str) -> FetchedOmmDocument:
        provenance = json.loads((FIXTURE_DIR / "iss-25544-2026-08-23.provenance.json").read_text())
        assert catalog_id == "25544"
        return FetchedOmmDocument(
            source_id=provenance["source_id"],
            source_uri=provenance["source_uri"],
            retrieved_at=datetime.fromisoformat(provenance["retrieved_at"]),
            content=(FIXTURE_DIR / "iss-25544-2026-08-23.json").read_bytes(),
            media_type=provenance["media_type"],
        )


@pytest.mark.asyncio
async def test_persists_real_source_snapshot_canonical_object_and_orbit_solution(
    db_session, tmp_path: Path
) -> None:
    """ING-001: raw snapshot, canonical identity, and OMM orbit solution share provenance."""
    service = IngestionService(
        RecordedCelesTrakProvider(), SqlIngestionRepository(), RawArtifactStore(tmp_path)
    )

    result = await service.ingest_catalog_id("25544")

    raw_row = await db_session.execute(
        text("SELECT content_sha256, source_uri FROM raw_artifact WHERE id = :id"),
        {"id": result.raw_artifact_id},
    )
    orbit_row = await db_session.execute(
        text(
            """
            SELECT object_id, source_artifact_id, epoch, format, frame, time_system
            FROM orbit_solution
            WHERE id = :id
            """
        ),
        {"id": result.orbit_solution_id},
    )

    raw = raw_row.one()
    assert raw.content_sha256 == result.raw_artifact.content_sha256
    assert raw.source_uri.endswith("CATNR=25544&FORMAT=JSON")
    orbit = orbit_row.one()
    assert str(orbit.object_id) == result.object_id
    assert str(orbit.source_artifact_id) == result.raw_artifact_id
    assert orbit.format == "OMM"
    assert orbit.frame == "TEME"
    assert orbit.time_system == "UTC"
