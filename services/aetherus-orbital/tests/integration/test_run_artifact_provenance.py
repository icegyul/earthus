"""Durable provenance tests for raw-artifact reuse across ingestion runs."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import text

from backend.ingestion.models import FetchedOmmDocument
from backend.ingestion.repository import SqlIngestionRepository
from backend.ingestion.storage import RawArtifactStore

pytestmark = pytest.mark.integration


def _document(marker: str) -> FetchedOmmDocument:
    return FetchedOmmDocument(
        source_id="celestrak_gp",
        source_uri=f"https://example.test/provider/{marker}",
        retrieved_at=datetime(2026, 8, 24, tzinfo=UTC),
        content=f'{{"provenance_test":"{marker}"}}'.encode(),
        media_type="application/json",
        http_status=200,
        request_metadata={"request_fingerprint": f"sha256:{marker}"},
    )


@pytest.mark.asyncio
async def test_identical_raw_bytes_create_one_artifact_and_two_explicit_run_links(db_session, tmp_path) -> None:
    """A replayed snapshot must link both runs instead of overwriting raw provenance."""
    repository = SqlIngestionRepository()
    marker = uuid4().hex
    document = _document(marker)
    store = RawArtifactStore(tmp_path)
    first_stored = store.preserve(
        document.source_id, document.retrieved_at, document.content, document.media_type
    )
    second_stored = store.preserve(
        document.source_id, document.retrieved_at, document.content, document.media_type
    )
    first_run = await repository.start_run(document.source_id, document.source_uri)
    second_run = await repository.start_run(document.source_id, document.source_uri)

    first = await repository.record_or_link_raw_artifact(first_run, document, first_stored)
    second = await repository.record_or_link_raw_artifact(second_run, document, second_stored)

    assert first.raw_artifact_id == second.raw_artifact_id
    assert first.relation == "CREATED"
    assert second.relation == "REUSED"
    links = await db_session.execute(
        text(
            """
            SELECT relation
            FROM ingestion_run_artifact
            WHERE raw_artifact_id = CAST(:raw_artifact_id AS uuid)
            ORDER BY relation
            """
        ),
        {"raw_artifact_id": first.raw_artifact_id},
    )
    assert [row[0] for row in links] == ["CREATED", "REUSED"]
