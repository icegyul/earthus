"""Record-level quarantine tests for provider documents with unusable entries."""

import hashlib
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import text

from backend.ingestion.models import FetchedOmmDocument
from backend.ingestion.repository import SqlIngestionRepository
from backend.ingestion.storage import RawArtifactStore

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_rejected_record_remains_traceable_to_its_raw_artifact_run_and_index(
    db_session, tmp_path
) -> None:
    """A parser rejection must retain a fragment hash without persisting the rejected content."""
    marker = uuid4().hex
    document = FetchedOmmDocument(
        source_id="celestrak_gp",
        source_uri=f"https://example.test/provider/{marker}",
        retrieved_at=datetime(2026, 8, 24, tzinfo=UTC),
        content=f'{{"document":"{marker}"}}'.encode(),
        media_type="application/json",
    )
    fragment = b'{"NORAD_CAT_ID":"not-a-decimal-id"}'
    repository = SqlIngestionRepository()
    stored = RawArtifactStore(tmp_path).preserve(
        document.source_id, document.retrieved_at, document.content, document.media_type
    )
    run_id = await repository.start_run(document.source_id, document.source_uri)
    raw_link = await repository.record_or_link_raw_artifact(run_id, document, stored)

    rejection_id = await repository.record_rejection(
        run_id=run_id,
        raw_artifact_id=raw_link.raw_artifact_id,
        record_index=3,
        fragment=fragment,
        reason="PARSE_REJECT",
        details={"field": "NORAD_CAT_ID"},
    )

    row = await db_session.execute(
        text(
            """
            SELECT
              id::text,
              ingestion_run_id::text,
              raw_artifact_id::text,
              source_record_index,
              record_fragment_sha256,
              reason_code
            FROM ingestion_record_rejection
            WHERE id = CAST(:rejection_id AS uuid)
            """
        ),
        {"rejection_id": rejection_id},
    )
    assert row.one() == (
        rejection_id,
        run_id,
        raw_link.raw_artifact_id,
        3,
        hashlib.sha256(fragment).hexdigest(),
        "PARSE_REJECT",
    )
