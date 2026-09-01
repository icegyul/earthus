"""Self-contained recorded-source seeds for PostgreSQL integration tests."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from backend.ingestion.models import FetchedOmmDocument
from backend.ingestion.repository import SqlIngestionRepository
from backend.ingestion.service import IngestionService
from backend.ingestion.storage import RawArtifactStore


class RecordedSnapshotProvider:
    def __init__(self, path: Path, retrieved_at: datetime) -> None:
        self.path = path
        self.retrieved_at = retrieved_at

    async def fetch_omm(self, catalog_id: str) -> FetchedOmmDocument:
        if catalog_id != "25544":
            raise ValueError("recorded P5 seed supports ISS 25544 only")
        return FetchedOmmDocument(
            source_id="celestrak_gp",
            source_uri="https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=JSON",
            retrieved_at=self.retrieved_at,
            content=self.path.read_bytes(),
            media_type="application/json",
        )


async def ingest_recorded_snapshot(path: Path, raw_root: Path) -> None:
    service = IngestionService(
        RecordedSnapshotProvider(path, datetime(2026, 8, 23, tzinfo=UTC)),
        SqlIngestionRepository(),
        RawArtifactStore(raw_root),
    )
    await service.ingest_catalog_id("25544")


async def ensure_iss_object(raw_root: Path) -> None:
    await ingest_recorded_snapshot(
        Path("tests/fixtures/celestrak/iss-25544-2026-08-23.json"), raw_root
    )
