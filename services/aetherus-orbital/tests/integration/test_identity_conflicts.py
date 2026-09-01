"""PostgreSQL proof that P1 identity conflicts never auto-merge objects."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import text

from backend.domain.object_identity import ObjectIdentityResolver
from backend.ingestion.models import FetchedOmmDocument, ParsedOmmRecord
from backend.ingestion.repository import SqlIngestionRepository
from backend.ingestion.storage import RawArtifactStore

pytestmark = pytest.mark.integration


def _record(catalog_id: str, name: str, cospar_id: str) -> ParsedOmmRecord:
    return ParsedOmmRecord(
        catalog_id=catalog_id,
        object_name=name,
        international_designator=cospar_id,
        object_type="PAYLOAD",
        epoch=datetime(2026, 8, 24, tzinfo=UTC),
        frame="TEME",
        time_system="UTC",
        theory="SGP4",
        mean_elements={},
        covariance=None,
        quality_grade="PUBLIC_GP",
        limitations=(),
    )


async def _raw_artifact_id(repository: SqlIngestionRepository, tmp_path, source_id: str) -> str:
    marker = uuid4().hex
    document = FetchedOmmDocument(
        source_id=source_id,
        source_uri=f"https://example.test/{source_id}/{marker}",
        retrieved_at=datetime(2026, 8, 24, tzinfo=UTC),
        content=f'{{"identity_test":"{marker}"}}'.encode(),
        media_type="application/json",
    )
    stored = RawArtifactStore(tmp_path).preserve(
        document.source_id, document.retrieved_at, document.content, document.media_type
    )
    run_id = await repository.start_run(document.source_id, document.source_uri)
    return (await repository.record_or_link_raw_artifact(run_id, document, stored)).raw_artifact_id


def _catalog_pair() -> tuple[str, str]:
    base = 200_000_000 + uuid4().int % 700_000_000
    return str(base), str(base + 1)


def _cospar_id() -> str:
    return f"P1-{uuid4().hex}"


@pytest.mark.asyncio
async def test_same_catalog_new_name_is_alias_not_canonical_overwrite(db_session, tmp_path) -> None:
    repository = SqlIngestionRepository()
    resolver = ObjectIdentityResolver(repository)
    catalog_id, _ = _catalog_pair()
    cospar_id = _cospar_id()
    raw_celestrak = await _raw_artifact_id(repository, tmp_path, "celestrak_gp")
    raw_spacetrack = await _raw_artifact_id(repository, tmp_path, "spacetrack_gp")

    created = await resolver.resolve(
        raw_celestrak, "celestrak_gp", _record(catalog_id, "ORIGINAL NAME", cospar_id)
    )
    resolution = await resolver.resolve(
        raw_spacetrack, "spacetrack_gp", _record(catalog_id, "NEW NAME", cospar_id)
    )

    canonical_name = await db_session.scalar(
        text("SELECT canonical_name FROM space_object WHERE id = CAST(:id AS uuid)"),
        {"id": created.object_id},
    )
    aliases = await db_session.execute(
        text(
            """
            SELECT source_id, source_name FROM space_object_alias
            WHERE object_id = CAST(:id AS uuid)
            ORDER BY source_id
            """
        ),
        {"id": created.object_id},
    )

    assert resolution.status == "MATCHED"
    assert canonical_name == "ORIGINAL NAME"
    assert aliases.fetchall() == [
        ("celestrak_gp", "ORIGINAL NAME"),
        ("spacetrack_gp", "NEW NAME"),
    ]


@pytest.mark.asyncio
async def test_same_cospar_different_catalog_creates_conflict_without_second_object(
    db_session, tmp_path
) -> None:
    repository = SqlIngestionRepository()
    resolver = ObjectIdentityResolver(repository)
    first_catalog, conflicting_catalog = _catalog_pair()
    cospar_id = _cospar_id()
    raw_first = await _raw_artifact_id(repository, tmp_path, "celestrak_gp")
    raw_conflict = await _raw_artifact_id(repository, tmp_path, "spacetrack_gp")

    await resolver.resolve(
        raw_first, "celestrak_gp", _record(first_catalog, "ORIGINAL NAME", cospar_id)
    )
    resolution = await resolver.resolve(
        raw_conflict,
        "spacetrack_gp",
        _record(conflicting_catalog, "CONFLICTING NAME", cospar_id),
    )

    object_count = await db_session.scalar(
        text(
            """
            SELECT count(*) FROM space_object
            WHERE catalog_id = :first_catalog OR catalog_id = :conflicting_catalog
            """
        ),
        {"first_catalog": first_catalog, "conflicting_catalog": conflicting_catalog},
    )
    conflict = await db_session.execute(
        text(
            """
            SELECT incoming_catalog_id, incoming_cospar_id, conflict_type, resolution_state
            FROM identity_conflict WHERE id = CAST(:id AS uuid)
            """
        ),
        {"id": resolution.conflict_id},
    )

    assert resolution.status == "IDENTITY_CONFLICT"
    assert conflict.one() == (
        conflicting_catalog,
        cospar_id,
        "COSPAR_REUSED_DIFFERENT_CATALOG",
        "OPEN",
    )
    assert object_count == 1


@pytest.mark.asyncio
async def test_same_catalog_different_cospar_creates_conflict_without_object_update(db_session, tmp_path) -> None:
    repository = SqlIngestionRepository()
    resolver = ObjectIdentityResolver(repository)
    catalog_id, _ = _catalog_pair()
    original_cospar_id = _cospar_id()
    conflicting_cospar_id = _cospar_id()
    raw_first = await _raw_artifact_id(repository, tmp_path, "celestrak_gp")
    raw_conflict = await _raw_artifact_id(repository, tmp_path, "spacetrack_gp")

    created = await resolver.resolve(
        raw_first,
        "celestrak_gp",
        _record(catalog_id, "ORIGINAL NAME", original_cospar_id),
    )
    resolution = await resolver.resolve(
        raw_conflict,
        "spacetrack_gp",
        _record(catalog_id, "CONFLICTING NAME", conflicting_cospar_id),
    )

    object_row = await db_session.execute(
        text("SELECT cospar_id, canonical_name FROM space_object WHERE id = CAST(:id AS uuid)"),
        {"id": created.object_id},
    )
    conflict_type = await db_session.scalar(
        text("SELECT conflict_type FROM identity_conflict WHERE id = CAST(:id AS uuid)"),
        {"id": resolution.conflict_id},
    )

    assert resolution.status == "IDENTITY_CONFLICT"
    assert object_row.one() == (original_cospar_id, "ORIGINAL NAME")
    assert conflict_type == "CATALOG_CONFLICTING_COSPAR"
