from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from aetherus_domain import CanonicalObject, IdentityConflict, ObjectAlias
from .storage import LocalFoundationRepository


class CanonicalObjectIdentityEngine:
    id = "E02"
    version = "0.2.0"

    def __init__(self, repository: LocalFoundationRepository):
        self.repository = repository

    def register_provider_record(
        self,
        *,
        source_id: str,
        source_key: str,
        entity_type: str,
        canonical_name: str | None,
        catalog_id: str | int | None = None,
        cospar_id: str | None = None,
        origin: str | None = None,
        metadata: dict | None = None,
        now: datetime,
    ) -> tuple[CanonicalObject, IdentityConflict | None]:
        if now.tzinfo is None:
            raise ValueError("naive datetime forbidden")
        now = now.astimezone(timezone.utc)
        catalog = str(catalog_id).strip() if catalog_id is not None else None
        if catalog == "":
            catalog = None
        incoming_cospar = cospar_id.strip() if cospar_id else None

        by_alias = self.repository.get_canonical_by_alias(source_id, source_key)
        by_catalog = self.repository.get_canonical_by_catalog(entity_type, catalog) if catalog else None
        obj = by_alias or by_catalog

        if obj and incoming_cospar and obj.cospar_id and incoming_cospar != obj.cospar_id:
            conflict = IdentityConflict(
                source_id=source_id,
                source_key=source_key,
                conflict_type="COSPAR_CONFLICT",
                existing_object_id=obj.id,
                existing_value=obj.cospar_id,
                incoming_value=incoming_cospar,
                created_at=now,
            )
            self.repository.save_identity_conflict(conflict)
            return obj, conflict

        alias = ObjectAlias(source_id=source_id, source_key=source_key, source_name=canonical_name)
        if obj is None:
            obj = CanonicalObject(
                entity_type=entity_type,
                canonical_name=canonical_name,
                catalog_id=catalog,
                cospar_id=incoming_cospar,
                origin=origin,  # Unknown stays unknown; never inferred from owner/source/name.
                aliases=[alias],
                metadata=metadata or {},
                created_at=now,
                updated_at=now,
            )
        else:
            aliases = {(a.source_id, a.source_key): a for a in obj.aliases}
            aliases[(source_id, source_key)] = alias
            obj.aliases = list(aliases.values())
            if canonical_name and canonical_name != obj.canonical_name:
                historical = list(obj.metadata.get("historical_names", []))
                if obj.canonical_name and obj.canonical_name not in historical:
                    historical.append(obj.canonical_name)
                obj.metadata = {**obj.metadata, **(metadata or {}), "historical_names": historical}
                obj.canonical_name = canonical_name
            elif metadata:
                obj.metadata = {**obj.metadata, **metadata}
            if obj.catalog_id is None and catalog is not None:
                obj.catalog_id = catalog
            if obj.cospar_id is None and incoming_cospar is not None:
                obj.cospar_id = incoming_cospar
            if obj.origin is None and origin is not None:
                # Only explicit provider value may fill origin; never infer it.
                obj.origin = origin
            obj.updated_at = now

        self.repository.save_canonical_object(obj)
        return obj, None

    def create_mission_object(
        self,
        *,
        mission_id: str,
        mission_object_key: str,
        entity_type: str,
        name: str,
        now: datetime,
        metadata: dict | None = None,
    ) -> CanonicalObject:
        obj, conflict = self.register_provider_record(
            source_id="MISSION_REGISTRY",
            source_key=f"{mission_id}:{mission_object_key}",
            entity_type=entity_type,
            canonical_name=name,
            catalog_id=None,
            cospar_id=None,
            origin=None,
            metadata={"mission_id": mission_id, "mission_object_key": mission_object_key, **(metadata or {})},
            now=now,
        )
        if conflict:
            raise RuntimeError("unexpected conflict creating mission object")
        return obj

    def handover_mission_object(
        self,
        object_id: UUID | str,
        *,
        catalog_source_id: str,
        catalog_source_key: str,
        catalog_id: str | int,
        cospar_id: str | None,
        canonical_name: str | None,
        now: datetime,
    ) -> CanonicalObject:
        obj = self.repository.get_canonical(object_id)
        if obj is None:
            raise KeyError(f"unknown object {object_id}")
        existing = self.repository.get_canonical_by_catalog(obj.entity_type, str(catalog_id))
        if existing is not None and existing.id != obj.id:
            raise ValueError("catalog id already belongs to another canonical object; explicit merge required")
        if obj.cospar_id and cospar_id and obj.cospar_id != cospar_id:
            raise ValueError("COSPAR conflict during mission handover")
        obj.catalog_id = str(catalog_id)
        if cospar_id:
            obj.cospar_id = cospar_id
        if canonical_name:
            obj.canonical_name = canonical_name
        obj.aliases.append(ObjectAlias(source_id=catalog_source_id, source_key=catalog_source_key, source_name=canonical_name))
        obj.updated_at = now.astimezone(timezone.utc)
        self.repository.save_canonical_object(obj)
        return obj
