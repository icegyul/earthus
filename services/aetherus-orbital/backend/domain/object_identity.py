"""Conservative canonical identity resolution with conflict quarantine."""

from __future__ import annotations

from typing import Protocol

from backend.ingestion.errors import InsufficientDataError
from backend.ingestion.models import CanonicalObject, IdentityResolution, ParsedOmmRecord
from backend.ingestion.providers.base import validate_catalog_id


class IdentityRepository(Protocol):
    """Persistence operations required to resolve one source record safely."""

    async def find_by_catalog(self, catalog_id: str) -> CanonicalObject | None:
        """Find a canonical object by exact catalog identifier."""

    async def find_by_cospar(self, cospar_id: str | None) -> CanonicalObject | None:
        """Find an existing canonical object by a nonempty COSPAR identifier."""

    async def create_or_match_without_name_overwrite(
        self,
        source_id: str,
        raw_artifact_id: str,
        record: ParsedOmmRecord,
        existing: CanonicalObject | None,
    ) -> IdentityResolution:
        """Create or match a canonical object while retaining source names as aliases."""

    async def create_identity_conflict(
        self,
        existing: CanonicalObject,
        incoming_source_id: str,
        incoming_record: ParsedOmmRecord,
        raw_artifact_id: str,
        conflict_type: str,
    ) -> IdentityResolution:
        """Persist a conflict instead of merging identities."""


class ObjectIdentityResolver:
    """Resolve only exact safe matches; every disagreement remains quarantined."""

    def __init__(self, repository: IdentityRepository) -> None:
        self._repository = repository

    async def resolve(
        self,
        raw_artifact_id: str,
        source_id: str,
        record: ParsedOmmRecord,
    ) -> IdentityResolution:
        """Resolve one parsed record without changing established canonical names."""
        try:
            validate_catalog_id(record.catalog_id)
        except InsufficientDataError:
            return IdentityResolution(status="UNKNOWN_OBJECT")

        existing = await self._repository.find_by_catalog(record.catalog_id)
        cospar_match = await self._repository.find_by_cospar(record.international_designator)

        if existing is not None and _conflicting_cospar(
            existing.cospar_id, record.international_designator
        ):
            return await self._repository.create_identity_conflict(
                existing=existing,
                incoming_source_id=source_id,
                incoming_record=record,
                raw_artifact_id=raw_artifact_id,
                conflict_type="CATALOG_CONFLICTING_COSPAR",
            )
        if existing is None and cospar_match is not None:
            return await self._repository.create_identity_conflict(
                existing=cospar_match,
                incoming_source_id=source_id,
                incoming_record=record,
                raw_artifact_id=raw_artifact_id,
                conflict_type="COSPAR_REUSED_DIFFERENT_CATALOG",
            )
        return await self._repository.create_or_match_without_name_overwrite(
            source_id=source_id,
            raw_artifact_id=raw_artifact_id,
            record=record,
            existing=existing,
        )


def _conflicting_cospar(existing_cospar_id: str | None, incoming_cospar_id: str | None) -> bool:
    """Only two supplied, unequal COSPAR values constitute a P1 conflict."""
    return (
        existing_cospar_id is not None
        and incoming_cospar_id is not None
        and existing_cospar_id != incoming_cospar_id
    )
