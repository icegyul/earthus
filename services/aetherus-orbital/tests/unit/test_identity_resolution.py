"""Pure decision tests for conservative canonical identity resolution."""

from dataclasses import replace
from datetime import UTC, datetime

import pytest

from backend.domain.object_identity import ObjectIdentityResolver
from backend.ingestion.models import CanonicalObject, IdentityResolution, ParsedOmmRecord


def _record(catalog_id: str, name: str | None, cospar_id: str | None) -> ParsedOmmRecord:
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


class IdentityRepositoryFake:
    def __init__(self, objects: list[CanonicalObject]) -> None:
        self.objects = objects
        self.aliases: list[tuple[str, str, str, str | None]] = []
        self.conflicts: list[tuple[str, str]] = []

    async def find_by_catalog(self, catalog_id: str) -> CanonicalObject | None:
        return next((item for item in self.objects if item.catalog_id == catalog_id), None)

    async def find_by_cospar(self, cospar_id: str | None) -> CanonicalObject | None:
        return next((item for item in self.objects if item.cospar_id == cospar_id), None)

    async def create_or_match_without_name_overwrite(
        self, source_id: str, raw_artifact_id: str, record: ParsedOmmRecord, existing: CanonicalObject | None
    ) -> IdentityResolution:
        del raw_artifact_id
        if existing is None:
            existing = CanonicalObject(
                id="new-object",
                catalog_id=record.catalog_id,
                cospar_id=record.international_designator,
                canonical_name=record.object_name,
                object_type=record.object_type,
            )
            self.objects.append(existing)
            status = "CREATED"
        else:
            status = "MATCHED"
        await self.upsert_alias(existing.id, source_id, record.catalog_id, record.object_name)
        return IdentityResolution(status=status, object_id=existing.id)

    async def upsert_alias(
        self, object_id: str, source_id: str, source_key: str, source_name: str | None
    ) -> None:
        self.aliases.append((object_id, source_id, source_key, source_name))

    async def create_identity_conflict(
        self,
        existing: CanonicalObject,
        incoming_source_id: str,
        incoming_record: ParsedOmmRecord,
        raw_artifact_id: str,
        conflict_type: str,
    ) -> IdentityResolution:
        del existing, incoming_source_id, incoming_record, raw_artifact_id
        self.conflicts.append(("conflict-1", conflict_type))
        return IdentityResolution(status="IDENTITY_CONFLICT", conflict_id="conflict-1")


@pytest.mark.asyncio
async def test_same_catalog_new_name_is_an_alias_not_a_canonical_overwrite() -> None:
    canonical = CanonicalObject(
        id="object-1",
        catalog_id="100100",
        cospar_id="2024-001A",
        canonical_name="ORIGINAL NAME",
        object_type="PAYLOAD",
    )
    repository = IdentityRepositoryFake([canonical])
    resolver = ObjectIdentityResolver(repository)

    resolution = await resolver.resolve(
        raw_artifact_id="raw-1",
        source_id="spacetrack_gp",
        record=_record("100100", "NEW NAME", "2024-001A"),
    )

    assert resolution.status == "MATCHED"
    assert canonical.canonical_name == "ORIGINAL NAME"
    assert repository.aliases == [("object-1", "spacetrack_gp", "100100", "NEW NAME")]


@pytest.mark.asyncio
async def test_same_cospar_different_catalog_creates_conflict_without_merge() -> None:
    repository = IdentityRepositoryFake(
        [
            CanonicalObject(
                id="object-1",
                catalog_id="100100",
                cospar_id="2024-001A",
                canonical_name="ORIGINAL NAME",
                object_type="PAYLOAD",
            )
        ]
    )
    resolver = ObjectIdentityResolver(repository)

    resolution = await resolver.resolve(
        raw_artifact_id="raw-1",
        source_id="spacetrack_gp",
        record=_record("100101", "CONFLICTING NAME", "2024-001A"),
    )

    assert resolution.status == "IDENTITY_CONFLICT"
    assert resolution.object_id is None
    assert repository.conflicts == [("conflict-1", "COSPAR_REUSED_DIFFERENT_CATALOG")]
    assert len(repository.objects) == 1


@pytest.mark.asyncio
async def test_same_catalog_different_cospar_creates_conflict_without_alias_update() -> None:
    repository = IdentityRepositoryFake(
        [
            CanonicalObject(
                id="object-1",
                catalog_id="100100",
                cospar_id="2024-001A",
                canonical_name="ORIGINAL NAME",
                object_type="PAYLOAD",
            )
        ]
    )
    resolver = ObjectIdentityResolver(repository)

    resolution = await resolver.resolve(
        raw_artifact_id="raw-1",
        source_id="spacetrack_gp",
        record=_record("100100", "CONFLICTING NAME", "2024-999A"),
    )

    assert resolution.status == "IDENTITY_CONFLICT"
    assert repository.aliases == []
    assert repository.conflicts == [("conflict-1", "CATALOG_CONFLICTING_COSPAR")]


@pytest.mark.asyncio
async def test_missing_catalog_is_unknown_and_never_creates_a_canonical_object() -> None:
    repository = IdentityRepositoryFake([])
    resolver = ObjectIdentityResolver(repository)

    resolution = await resolver.resolve(
        raw_artifact_id="raw-1",
        source_id="celestrak_gp",
        record=replace(_record("100100", "NAME", None), catalog_id=""),
    )

    assert resolution.status == "UNKNOWN_OBJECT"
    assert repository.objects == []
