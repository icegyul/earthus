"""PostgreSQL persistence for raw snapshots and canonical OMM records."""

import hashlib
import json
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from sqlalchemy import text
from sqlalchemy.engine import RowMapping
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db_session
from backend.ingestion.errors import IngestionError
from backend.ingestion.models import (
    CanonicalObject,
    FetchedOmmDocument,
    IdentityResolution,
    ParsedOmmRecord,
    PersistedIngestion,
    RawArtifactLink,
    ReprocessableRawArtifact,
    StoredRawArtifact,
)


class SqlIngestionRepository:
    """Persist immutable provider artifacts and versioned OMM orbit solutions."""

    async def start_run(self, source_id: str, source_uri: str) -> str:
        """Create a RUNNING ingestion record after ensuring the provider is registered."""
        request_fingerprint = hashlib.sha256(source_uri.encode("utf-8")).hexdigest()
        async with get_db_session() as session:
            await session.execute(
                text(
                    """
                    INSERT INTO data_source (id, name, auth_type, enabled)
                    VALUES (:id, :name, 'none', true)
                    ON CONFLICT (id) DO NOTHING
                    """
                ),
                {
                    "id": source_id,
                    "name": source_id,
                },
            )
            result = await session.execute(
                text(
                    """
                    INSERT INTO ingestion_run (source_id, started_at, status, request_fingerprint)
                    VALUES (:source_id, :started_at, 'RUNNING', :request_fingerprint)
                    RETURNING id
                    """
                ),
                {
                    "source_id": source_id,
                    "started_at": datetime.now(UTC),
                    "request_fingerprint": request_fingerprint,
                },
            )
            return str(result.scalar_one())

    async def record_raw_artifact(
        self,
        run_id: str,
        document: FetchedOmmDocument,
        object_uri: str,
        content_sha256: str,
    ) -> str:
        """Preserve the P0 repository contract while recording a P1 run/artifact link."""
        raw_artifact_id, _ = await self._record_or_link_raw_artifact(
            run_id=run_id,
            document=document,
            object_uri=object_uri,
            content_sha256=content_sha256,
        )
        return raw_artifact_id

    async def record_or_link_raw_artifact(
        self,
        run_id: str,
        document: FetchedOmmDocument,
        stored: StoredRawArtifact,
    ) -> RawArtifactLink:
        """Create one artifact once and link every fresh or reused run explicitly."""
        raw_artifact_id, relation = await self._record_or_link_raw_artifact(
            run_id=run_id,
            document=document,
            object_uri=stored.object_uri,
            content_sha256=stored.content_sha256,
        )
        return RawArtifactLink(raw_artifact_id=raw_artifact_id, relation=relation)

    async def find_latest_unparsed_raw_artifact(
        self, source_id: str, source_uri: str
    ) -> ReprocessableRawArtifact | None:
        """Find one exact-provider snapshot that has no derived orbit solution yet."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        ra.id::text AS id,
                        ra.source_id,
                        ra.source_uri,
                        ra.retrieved_at,
                        ra.media_type,
                        ra.content_sha256,
                        COALESCE((ra.provenance_json ->> 'http_status')::integer, 200)
                            AS http_status
                    FROM raw_artifact AS ra
                    WHERE ra.source_id = :source_id
                      AND ra.source_uri = :source_uri
                      AND NOT EXISTS (
                          SELECT 1
                          FROM orbit_solution AS solution
                          WHERE solution.source_artifact_id = ra.id
                      )
                    ORDER BY ra.retrieved_at DESC, ra.id DESC
                    LIMIT 1
                    """
                ),
                {"source_id": source_id, "source_uri": source_uri},
            )
            row = result.mappings().one_or_none()
        if row is None:
            return None
        return ReprocessableRawArtifact(
            id=str(row["id"]),
            source_id=str(row["source_id"]),
            source_uri=str(row["source_uri"]),
            retrieved_at=row["retrieved_at"],
            media_type=str(row["media_type"]),
            content_sha256=str(row["content_sha256"]),
            http_status=int(row["http_status"]),
        )

    async def _record_or_link_raw_artifact(
        self,
        run_id: str,
        document: FetchedOmmDocument,
        object_uri: str,
        content_sha256: str,
    ) -> tuple[str, str]:
        """Insert-or-select immutable metadata, then persist the run relationship."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    INSERT INTO raw_artifact (
                        source_id, ingestion_run_id, retrieved_at, source_uri,
                        content_sha256, media_type, object_uri, provenance_json
                    )
                    VALUES (
                        :source_id, :run_id, :retrieved_at, :source_uri,
                        :content_sha256, :media_type, :object_uri, CAST(:provenance_json AS jsonb)
                    )
                    ON CONFLICT (source_id, content_sha256) DO NOTHING
                    RETURNING id
                    """
                ),
                {
                    "source_id": document.source_id,
                    "run_id": run_id,
                    "retrieved_at": document.retrieved_at,
                    "source_uri": document.source_uri,
                    "content_sha256": content_sha256,
                    "media_type": document.media_type,
                    "object_uri": object_uri,
                    "provenance_json": json.dumps(
                        {
                            "http_status": document.http_status,
                            "media_type": document.media_type,
                            "request_metadata": document.request_metadata,
                        },
                        sort_keys=True,
                    ),
                },
            )
            raw_artifact_id = result.scalar_one_or_none()
            created = raw_artifact_id is not None
            if raw_artifact_id is not None:
                raw_artifact_id = str(raw_artifact_id)
            else:
                existing = await session.execute(
                    text(
                        """
                        SELECT id FROM raw_artifact
                        WHERE source_id = :source_id AND content_sha256 = :content_sha256
                        """
                    ),
                    {"source_id": document.source_id, "content_sha256": content_sha256},
                )
                raw_artifact_id = str(existing.scalar_one())
            proposed_relation = "CREATED" if created else "REUSED"
            link = await session.execute(
                text(
                    """
                    INSERT INTO ingestion_run_artifact (ingestion_run_id, raw_artifact_id, relation)
                    VALUES (CAST(:run_id AS uuid), CAST(:raw_artifact_id AS uuid), :relation)
                    ON CONFLICT (ingestion_run_id, raw_artifact_id) DO UPDATE
                    SET relation = ingestion_run_artifact.relation
                    RETURNING relation
                    """
                ),
                {
                    "run_id": run_id,
                    "raw_artifact_id": raw_artifact_id,
                    "relation": proposed_relation,
                },
            )
            return raw_artifact_id, str(link.scalar_one())

    async def record_rejection(
        self,
        run_id: str,
        raw_artifact_id: str,
        record_index: int,
        fragment: bytes,
        reason: str,
        details: dict[str, Any],
    ) -> str:
        """Quarantine one rejected provider record with a traceable fragment hash only."""
        fragment_sha256 = hashlib.sha256(fragment).hexdigest()
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    INSERT INTO ingestion_record_rejection (
                        ingestion_run_id, raw_artifact_id, source_record_index,
                        record_fragment_sha256, reason_code, details_json
                    )
                    VALUES (
                        CAST(:run_id AS uuid), CAST(:raw_artifact_id AS uuid), :record_index,
                        :fragment_sha256, :reason, CAST(:details_json AS jsonb)
                    )
                    RETURNING id
                    """
                ),
                {
                    "run_id": run_id,
                    "raw_artifact_id": raw_artifact_id,
                    "record_index": record_index,
                    "fragment_sha256": fragment_sha256,
                    "reason": reason,
                    "details_json": json.dumps(details, sort_keys=True),
                },
            )
            return str(result.scalar_one())

    async def find_by_catalog(self, catalog_id: str) -> CanonicalObject | None:
        """Find an exact catalog match without widening or coercing its identifier."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT id::text, catalog_id, cospar_id, canonical_name, object_type
                    FROM space_object WHERE catalog_id = :catalog_id LIMIT 1
                    """
                ),
                {"catalog_id": catalog_id},
            )
            row = result.mappings().one_or_none()
        return _canonical_object(row) if row is not None else None

    async def find_by_cospar(self, cospar_id: str | None) -> CanonicalObject | None:
        """Find a COSPAR match without inferring identity when no COSPAR is supplied."""
        if not cospar_id:
            return None
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT id::text, catalog_id, cospar_id, canonical_name, object_type
                    FROM space_object
                    WHERE cospar_id = :cospar_id
                    ORDER BY created_at, id
                    LIMIT 1
                    """
                ),
                {"cospar_id": cospar_id},
            )
            row = result.mappings().one_or_none()
        return _canonical_object(row) if row is not None else None

    async def upsert_alias(
        self,
        object_id: str,
        source_id: str,
        source_key: str,
        source_name: str | None,
    ) -> None:
        """Attach a source-specific name without changing canonical naming."""
        async with get_db_session() as session:
            await _upsert_alias(session, object_id, source_id, source_key, source_name)

    async def create_identity_conflict(
        self,
        existing: CanonicalObject,
        incoming_source_id: str,
        incoming_record: ParsedOmmRecord,
        raw_artifact_id: str,
        conflict_type: str,
    ) -> IdentityResolution:
        """Quarantine an identity conflict; no canonical object is created or merged."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    INSERT INTO identity_conflict (
                        existing_object_id, incoming_source_id, incoming_catalog_id,
                        incoming_cospar_id, raw_artifact_id, conflict_type
                    )
                    VALUES (
                        CAST(:existing_object_id AS uuid), :incoming_source_id, :incoming_catalog_id,
                        :incoming_cospar_id, CAST(:raw_artifact_id AS uuid), :conflict_type
                    )
                    RETURNING id
                    """
                ),
                {
                    "existing_object_id": existing.id,
                    "incoming_source_id": incoming_source_id,
                    "incoming_catalog_id": incoming_record.catalog_id,
                    "incoming_cospar_id": incoming_record.international_designator,
                    "raw_artifact_id": raw_artifact_id,
                    "conflict_type": conflict_type,
                },
            )
            conflict_id = str(result.scalar_one())
        return IdentityResolution(status="IDENTITY_CONFLICT", conflict_id=conflict_id)

    async def create_or_match_without_name_overwrite(
        self,
        source_id: str,
        raw_artifact_id: str,
        record: ParsedOmmRecord,
        existing: CanonicalObject | None,
    ) -> IdentityResolution:
        """Create a new object once or add an alias to an exact catalog match only.

        The canonical row itself is still never renamed by a later source; what
        this path adds is a durable record of what each source declared about
        the object's metadata, so a missing classification can be filled from a
        source that actually states it and a disagreement is preserved as a
        conflict instead of a silent overwrite.
        """
        raw_artifact_id_for_metadata = raw_artifact_id
        async with get_db_session() as session:
            matched = existing
            status: Literal["CREATED", "MATCHED"] = "MATCHED"
            if matched is None:
                created = await session.execute(
                    text(
                        """
                        INSERT INTO space_object (
                            catalog_id, cospar_id, canonical_name, object_type, updated_at
                        ) VALUES (
                            :catalog_id, :cospar_id, :canonical_name, :object_type, now()
                        )
                        ON CONFLICT (catalog_id) DO NOTHING
                        RETURNING id::text, catalog_id, cospar_id, canonical_name, object_type
                        """
                    ),
                    {
                        "catalog_id": record.catalog_id,
                        "cospar_id": record.international_designator,
                        "canonical_name": record.object_name,
                        "object_type": record.object_type,
                    },
                )
                row = created.mappings().one_or_none()
                if row is not None:
                    matched = _canonical_object(row)
                    status = "CREATED"
                else:
                    raced = await session.execute(
                        text(
                            """
                            SELECT id::text, catalog_id, cospar_id, canonical_name, object_type
                            FROM space_object WHERE catalog_id = :catalog_id LIMIT 1
                            """
                        ),
                        {"catalog_id": record.catalog_id},
                    )
                    row = raced.mappings().one_or_none()
                    if row is None:
                        raise RuntimeError("canonical object disappeared during identity creation")
                    matched = _canonical_object(row)
            await _upsert_alias(
                session, matched.id, source_id, record.catalog_id, record.object_name
            )
            matched = await _record_metadata_provenance(
                session,
                matched,
                record=record,
                source_id=source_id,
                raw_artifact_id=raw_artifact_id_for_metadata,
                created=status == "CREATED",
            )
        return IdentityResolution(status=status, object_id=matched.id)

    async def persist_orbit_solution(
        self,
        object_id: str,
        raw_artifact_id: str,
        source_id: str,
        record: ParsedOmmRecord,
    ) -> str:
        """Persist one source-neutral OMM solution after conservative identity resolution."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    INSERT INTO orbit_solution (
                        object_id, source_id, source_artifact_id, epoch, format, frame,
                        time_system, theory, mean_elements_json, covariance_json,
                        quality_json, model_version
                    )
                    VALUES (
                        CAST(:object_id AS uuid), :source_id, CAST(:raw_artifact_id AS uuid),
                        :epoch, 'OMM', :frame, :time_system, :theory,
                        CAST(:mean_elements AS jsonb), NULL, CAST(:quality_json AS jsonb),
                        :model_version
                    )
                    ON CONFLICT (object_id, source_id, source_artifact_id, epoch, format) DO NOTHING
                    RETURNING id
                    """
                ),
                {
                    "object_id": object_id,
                    "source_id": source_id,
                    "raw_artifact_id": raw_artifact_id,
                    "epoch": record.epoch,
                    "frame": record.frame,
                    "time_system": record.time_system,
                    "theory": record.theory,
                    "mean_elements": json.dumps(record.mean_elements, sort_keys=True),
                    "quality_json": json.dumps(
                        {
                            "source_grade": record.quality_grade,
                            "validation_state": "UNVALIDATED",
                            "limitations": list(record.limitations),
                            "covariance_status": "INSUFFICIENT_DATA",
                            "pc_status": "NOT_COMPUTED",
                        },
                        sort_keys=True,
                    ),
                    "model_version": f"{source_id}-omm-json-v1",
                },
            )
            orbit_solution_id = result.scalar_one_or_none()
            if orbit_solution_id is None:
                existing = await session.execute(
                    text(
                        """
                        SELECT id FROM orbit_solution
                        WHERE object_id = CAST(:object_id AS uuid)
                          AND source_id = :source_id
                          AND source_artifact_id = CAST(:raw_artifact_id AS uuid)
                          AND epoch = :epoch AND format = 'OMM'
                        """
                    ),
                    {
                        "object_id": object_id,
                        "source_id": source_id,
                        "raw_artifact_id": raw_artifact_id,
                        "epoch": record.epoch,
                    },
                )
                orbit_solution_id = existing.scalar_one()
            return str(orbit_solution_id)

    async def load_cached_ingestion(
        self,
        run_id: str,
        raw_artifact_id: str,
        catalog_id: str,
        cache_status: Literal["HIT", "STALE"],
    ) -> PersistedIngestion | None:
        """Link a confirmed existing raw snapshot to a new no-network ingestion run."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        ra.id::text AS raw_artifact_id,
                        ra.source_id,
                        ra.source_uri,
                        ra.retrieved_at,
                        ra.content_sha256,
                        ra.media_type,
                        ra.object_uri,
                        so.id::text AS object_id,
                        so.catalog_id,
                        so.cospar_id,
                        so.canonical_name,
                        so.object_type,
                        os.id::text AS orbit_solution_id,
                        os.epoch,
                        os.frame,
                        os.time_system,
                        os.theory,
                        os.mean_elements_json,
                        os.quality_json
                    FROM raw_artifact AS ra
                    JOIN orbit_solution AS os ON os.source_artifact_id = ra.id
                    JOIN space_object AS so ON so.id = os.object_id
                    WHERE ra.id = CAST(:raw_artifact_id AS uuid)
                      AND so.catalog_id = :catalog_id
                    ORDER BY os.created_at DESC
                    LIMIT 1
                    """
                ),
                {"raw_artifact_id": raw_artifact_id, "catalog_id": catalog_id},
            )
            row = result.mappings().one_or_none()
            if row is None:
                return None
            await session.execute(
                text(
                    """
                    INSERT INTO ingestion_run_artifact (ingestion_run_id, raw_artifact_id, relation)
                    VALUES (CAST(:run_id AS uuid), CAST(:raw_artifact_id AS uuid), 'REUSED')
                    ON CONFLICT (ingestion_run_id, raw_artifact_id) DO UPDATE
                    SET relation = ingestion_run_artifact.relation
                    """
                ),
                {"run_id": run_id, "raw_artifact_id": raw_artifact_id},
            )
            await session.execute(
                text(
                    """
                    UPDATE ingestion_run
                    SET status = 'SUCCEEDED', finished_at = :finished_at, record_count = 1,
                        metadata_json = CAST(:metadata_json AS jsonb)
                    WHERE id = CAST(:run_id AS uuid)
                    """
                ),
                {
                    "run_id": run_id,
                    "finished_at": datetime.now(UTC),
                    "metadata_json": json.dumps(
                        {
                            "cache_hit": cache_status == "HIT",
                            "cache_status": cache_status,
                            "reused_raw_artifact_id": raw_artifact_id,
                        },
                        sort_keys=True,
                    ),
                },
            )

        quality = _json_value(row["quality_json"])
        limitations_value = quality.get("limitations", [])
        limitations = (
            tuple(item for item in limitations_value if isinstance(item, str))
            if isinstance(limitations_value, list)
            else ()
        )
        raw_artifact = StoredRawArtifact(
            content_sha256=str(row["content_sha256"]),
            path=Path(str(row["object_uri"]).removeprefix("file://")),
            object_uri=str(row["object_uri"]),
            created=False,
        )
        return PersistedIngestion(
            ingestion_run_id=run_id,
            raw_artifact_id=str(row["raw_artifact_id"]),
            object_id=str(row["object_id"]),
            orbit_solution_id=str(row["orbit_solution_id"]),
            record_count=1,
            source_uri=str(row["source_uri"]),
            retrieved_at=row["retrieved_at"],
            raw_artifact=raw_artifact,
            record=ParsedOmmRecord(
                catalog_id=str(row["catalog_id"]),
                object_name=row["canonical_name"],
                international_designator=row["cospar_id"],
                object_type=str(row["object_type"]),
                epoch=row["epoch"],
                frame=str(row["frame"]),
                time_system=str(row["time_system"]),
                theory=str(row["theory"]),
                mean_elements=_json_value(row["mean_elements_json"]),
                covariance=None,
                quality_grade=str(quality.get("source_grade", "PUBLIC_GP")),
                limitations=limitations,
            ),
            source_id=str(row["source_id"]),
            cache_status=cache_status,
            identity_status="MATCHED",
        )

    async def persist_record(
        self, raw_artifact_id: str, record: ParsedOmmRecord
    ) -> tuple[str, str]:
        """Persist canonical identity, source alias, and an idempotent OMM orbit solution."""
        async with get_db_session() as session:
            object_result = await session.execute(
                text(
                    """
                    INSERT INTO space_object (
                        catalog_id, cospar_id, canonical_name, object_type, updated_at
                    )
                    VALUES (
                        :catalog_id, :cospar_id, :canonical_name, :object_type, now()
                    )
                    ON CONFLICT (catalog_id) DO UPDATE SET
                        cospar_id = COALESCE(EXCLUDED.cospar_id, space_object.cospar_id),
                        canonical_name = COALESCE(EXCLUDED.canonical_name, space_object.canonical_name),
                        object_type = CASE
                            WHEN space_object.object_type = 'UNKNOWN'
                            THEN EXCLUDED.object_type
                            ELSE space_object.object_type
                        END,
                        updated_at = now()
                    RETURNING id
                    """
                ),
                {
                    "catalog_id": record.catalog_id,
                    "cospar_id": record.international_designator,
                    "canonical_name": record.object_name,
                    "object_type": record.object_type,
                },
            )
            object_id = str(object_result.scalar_one())
            await session.execute(
                text(
                    """
                    INSERT INTO space_object_alias (object_id, source_id, source_key, source_name)
                    VALUES (CAST(:object_id AS uuid), 'celestrak_gp', :source_key, :source_name)
                    ON CONFLICT (object_id, source_id, source_key) DO UPDATE SET
                        source_name = EXCLUDED.source_name
                    """
                ),
                {
                    "object_id": object_id,
                    "source_key": record.catalog_id,
                    "source_name": record.object_name,
                },
            )
            orbit_result = await session.execute(
                text(
                    """
                    INSERT INTO orbit_solution (
                        object_id, source_id, source_artifact_id, epoch, format, frame,
                        time_system, theory, mean_elements_json, covariance_json,
                        quality_json, model_version
                    )
                    VALUES (
                        CAST(:object_id AS uuid), 'celestrak_gp', CAST(:raw_artifact_id AS uuid),
                        :epoch, 'OMM', :frame, :time_system, :theory,
                        CAST(:mean_elements AS jsonb), NULL, CAST(:quality_json AS jsonb),
                        'celestrak-omm-json-v1'
                    )
                    ON CONFLICT (object_id, source_id, source_artifact_id, epoch, format) DO NOTHING
                    RETURNING id
                    """
                ),
                {
                    "object_id": object_id,
                    "raw_artifact_id": raw_artifact_id,
                    "epoch": record.epoch,
                    "frame": record.frame,
                    "time_system": record.time_system,
                    "theory": record.theory,
                    "mean_elements": json.dumps(record.mean_elements, sort_keys=True),
                    "quality_json": json.dumps(
                        {
                            "source_grade": record.quality_grade,
                            "validation_state": "UNVALIDATED",
                            "limitations": list(record.limitations),
                            "covariance_status": "INSUFFICIENT_DATA",
                        },
                        sort_keys=True,
                    ),
                },
            )
            orbit_solution_id = orbit_result.scalar_one_or_none()
            if orbit_solution_id is None:
                existing_orbit = await session.execute(
                    text(
                        """
                        SELECT id FROM orbit_solution
                        WHERE object_id = CAST(:object_id AS uuid)
                          AND source_id = 'celestrak_gp'
                          AND source_artifact_id = CAST(:raw_artifact_id AS uuid)
                          AND epoch = :epoch
                          AND format = 'OMM'
                        """
                    ),
                    {
                        "object_id": object_id,
                        "raw_artifact_id": raw_artifact_id,
                        "epoch": record.epoch,
                    },
                )
                orbit_solution_id = existing_orbit.scalar_one()
            return object_id, str(orbit_solution_id)

    async def complete_run(
        self, run_id: str, record_count: int, metadata: dict[str, Any] | None = None
    ) -> None:
        """Mark a fully persisted provider response as successful."""
        async with get_db_session() as session:
            await session.execute(
                text(
                    """
                    UPDATE ingestion_run
                    SET status = 'SUCCEEDED', finished_at = :finished_at, record_count = :record_count,
                        metadata_json = CAST(:metadata_json AS jsonb)
                    WHERE id = CAST(:run_id AS uuid)
                    """
                ),
                {
                    "run_id": run_id,
                    "finished_at": datetime.now(UTC),
                    "record_count": record_count,
                    "metadata_json": json.dumps(metadata or {}, sort_keys=True),
                },
            )

    async def complete_partial_run(
        self, run_id: str, record_count: int, metadata: dict[str, Any] | None = None
    ) -> None:
        """Mark a run partial after accepted and quarantined records are both retained."""
        async with get_db_session() as session:
            await session.execute(
                text(
                    """
                    UPDATE ingestion_run
                    SET status = 'PARTIAL', finished_at = :finished_at, record_count = :record_count,
                        metadata_json = CAST(:metadata_json AS jsonb)
                    WHERE id = CAST(:run_id AS uuid)
                    """
                ),
                {
                    "run_id": run_id,
                    "finished_at": datetime.now(UTC),
                    "record_count": record_count,
                    "metadata_json": json.dumps(metadata or {}, sort_keys=True),
                },
            )

    async def mark_live_provider_proof(self, run_id: str) -> None:
        """Mark a run only after the opt-in live integration test received its provider response."""
        async with get_db_session() as session:
            await session.execute(
                text(
                    """
                    UPDATE ingestion_run
                    SET metadata_json = COALESCE(metadata_json, '{}'::jsonb)
                        || jsonb_build_object('live_provider_proof', 'true')
                    WHERE id = CAST(:run_id AS uuid)
                      AND status IN ('SUCCEEDED', 'PARTIAL')
                    """
                ),
                {"run_id": run_id},
            )

    async def fail_run(self, run_id: str, error: Exception) -> None:
        """Persist a structured failed state after a provider, parser, or storage error."""
        if isinstance(error, IngestionError):
            error_json: dict[str, Any] = error.to_payload()
        else:
            error_json = {"status": "UNAVAILABLE", "message": str(error)}
        async with get_db_session() as session:
            await session.execute(
                text(
                    """
                    UPDATE ingestion_run
                    SET status = 'FAILED', finished_at = :finished_at,
                        error_json = CAST(:error_json AS jsonb)
                    WHERE id = CAST(:run_id AS uuid)
                    """
                ),
                {
                    "run_id": run_id,
                    "finished_at": datetime.now(UTC),
                    "error_json": json.dumps(error_json, sort_keys=True),
                },
            )

    async def provider_health(self) -> list[dict[str, Any]]:
        """Return bounded provider activity metadata without credentials or raw bodies."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        ds.id AS source_id,
                        ds.enabled,
                        ds.max_poll_seconds,
                        (
                            SELECT max(ir.finished_at)
                            FROM ingestion_run AS ir
                            WHERE ir.source_id = ds.id
                              AND ir.status IN ('SUCCEEDED', 'PARTIAL')
                        ) AS last_success_at,
                        (
                            SELECT count(*)
                            FROM ingestion_record_rejection AS rejection
                            JOIN ingestion_run AS run ON run.id = rejection.ingestion_run_id
                            WHERE run.source_id = ds.id
                        ) AS parse_rejection_count
                    FROM data_source AS ds
                    WHERE ds.id IN ('celestrak_gp', 'spacetrack_gp')
                    ORDER BY ds.id
                    """
                )
            )
            rows = result.mappings().all()
        return [
            {
                "source_id": str(row["source_id"]),
                "enabled": bool(row["enabled"]),
                "minimum_interval_seconds": row["max_poll_seconds"],
                "last_success_at": row["last_success_at"].isoformat()
                if row["last_success_at"] is not None
                else None,
                "parse_rejection_count": int(row["parse_rejection_count"]),
            }
            for row in rows
        ]

    async def list_ingestion_runs(self, limit: int) -> list[dict[str, Any]]:
        """Return bounded, redacted run provenance for the protected operational route."""
        if not 1 <= limit <= 100:
            raise ValueError("limit must be between 1 and 100")
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        ir.id::text AS id,
                        ir.source_id,
                        ir.started_at,
                        ir.finished_at,
                        ir.status,
                        ir.record_count,
                        COALESCE(ir.metadata_json ->> 'cache_status', 'UNKNOWN') AS cache_status,
                        COALESCE(
                            (ir.metadata_json ->> 'live_provider_proof') = 'true', false
                        ) AS live_provider_proof,
                        ir.error_json ->> 'status' AS error_status,
                        COALESCE(
                            (
                                SELECT count(*)
                                FROM ingestion_record_rejection AS rejection
                                WHERE rejection.ingestion_run_id = ir.id
                            ),
                            0
                        ) AS rejected_record_count,
                        COALESCE(
                            (
                                SELECT array_agg(
                                    'sha256:' || artifact.content_sha256
                                    ORDER BY artifact.retrieved_at, artifact.id
                                )
                                FROM ingestion_run_artifact AS link
                                JOIN raw_artifact AS artifact ON artifact.id = link.raw_artifact_id
                                WHERE link.ingestion_run_id = ir.id
                            ),
                            ARRAY[]::text[]
                        ) AS raw_artifact_hashes
                    FROM ingestion_run AS ir
                    ORDER BY ir.started_at DESC, ir.id DESC
                    LIMIT :limit
                    """
                ),
                {"limit": limit},
            )
            rows = result.mappings().all()
        return [
            {
                "id": str(row["id"]),
                "source_id": str(row["source_id"]),
                "started_at": row["started_at"].isoformat(),
                "finished_at": row["finished_at"].isoformat()
                if row["finished_at"] is not None
                else None,
                "status": str(row["status"]),
                "record_count": int(row["record_count"] or 0),
                "rejected_record_count": int(row["rejected_record_count"]),
                "raw_artifact_hashes": [str(value) for value in row["raw_artifact_hashes"]],
                "cache_status": str(row["cache_status"]),
                "live_provider_proof": bool(row["live_provider_proof"]),
                "error_status": row["error_status"],
            }
            for row in rows
        ]

    async def list_identity_conflicts(self) -> list[dict[str, Any]]:
        """List unresolved conflict metadata only; P1 offers no resolution mutation."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        ic.id::text AS id,
                        ic.existing_object_id::text AS existing_object_id,
                        ic.incoming_source_id,
                        ic.incoming_catalog_id,
                        ic.incoming_cospar_id,
                        ic.raw_artifact_id::text AS raw_artifact_id,
                        ic.conflict_type,
                        ic.resolution_state,
                        ic.created_at
                    FROM identity_conflict AS ic
                    WHERE ic.resolution_state = 'OPEN'
                    ORDER BY ic.created_at DESC, ic.id
                    """
                )
            )
            rows = result.mappings().all()
        return [
            {
                "id": str(row["id"]),
                "existing_object_id": str(row["existing_object_id"]),
                "incoming_source_id": str(row["incoming_source_id"]),
                "incoming_catalog_id": row["incoming_catalog_id"],
                "incoming_cospar_id": row["incoming_cospar_id"],
                "raw_artifact_id": str(row["raw_artifact_id"]),
                "conflict_type": str(row["conflict_type"]),
                "resolution_state": str(row["resolution_state"]),
                "created_at": row["created_at"].isoformat(),
            }
            for row in rows
        ]

    async def resolve_alias(self, source_id: str, source_key: str) -> dict[str, Any] | None:
        """Resolve an exact source alias only; never infer a close or partial match."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT so.id::text AS object_id, so.catalog_id, so.cospar_id,
                           so.canonical_name, so.object_type
                    FROM space_object_alias AS alias
                    JOIN space_object AS so ON so.id = alias.object_id
                    WHERE alias.source_id = :source_id AND alias.source_key = :source_key
                    LIMIT 1
                    """
                ),
                {"source_id": source_id, "source_key": source_key},
            )
            row = result.mappings().one_or_none()
            if row is None:
                return None
            conflicts = await session.scalar(
                text(
                    """
                    SELECT count(*) FROM identity_conflict
                    WHERE existing_object_id = CAST(:object_id AS uuid)
                      AND resolution_state = 'OPEN'
                    """
                ),
                {"object_id": row["object_id"]},
            )
        return {
            "id": str(row["object_id"]),
            "catalog_id": row["catalog_id"],
            "cospar_id": row["cospar_id"],
            "canonical_name": row["canonical_name"],
            "object_type": row["object_type"],
            "identity_status": "CONFLICTED" if conflicts else "CANONICAL",
        }

    async def get_object(self, lookup: str) -> dict[str, Any] | None:
        """Return a canonical object with its latest source-derived OMM provenance."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        so.id::text AS object_id,
                        so.catalog_id,
                        so.cospar_id,
                        so.canonical_name,
                        so.object_type,
                        os.id::text AS orbit_solution_id,
                        os.epoch,
                        os.format,
                        os.frame,
                        os.time_system,
                        os.theory,
                        os.mean_elements_json,
                        os.quality_json,
                        os.source_id AS orbit_source_id,
                        ra.content_sha256,
                        ra.retrieved_at,
                        ra.source_uri
                    FROM space_object AS so
                    LEFT JOIN LATERAL (
                        SELECT * FROM orbit_solution
                        WHERE object_id = so.id
                        ORDER BY epoch DESC, created_at DESC
                        LIMIT 1
                    ) AS os ON true
                    LEFT JOIN raw_artifact AS ra ON ra.id = os.source_artifact_id
                    WHERE so.catalog_id = :lookup OR so.id::text = :lookup
                    LIMIT 1
                    """
                ),
                {"lookup": lookup},
            )
            row = result.mappings().one_or_none()
        if row is None:
            return None
        async with get_db_session() as session:
            aliases_result = await session.execute(
                text(
                    """
                    SELECT source_id, source_key, source_name
                    FROM space_object_alias
                    WHERE object_id = CAST(:object_id AS uuid)
                    ORDER BY source_id, source_key
                    """
                ),
                {"object_id": row["object_id"]},
            )
            aliases = [
                {
                    "source_id": alias["source_id"],
                    "source_key": alias["source_key"],
                    "source_name": alias["source_name"],
                }
                for alias in aliases_result.mappings().all()
            ]
            open_conflict_count = await session.scalar(
                text(
                    """
                    SELECT count(*) FROM identity_conflict
                    WHERE existing_object_id = CAST(:object_id AS uuid)
                      AND resolution_state = 'OPEN'
                    """
                ),
                {"object_id": row["object_id"]},
            )
        quality = _json_value(row["quality_json"])
        return {
            "id": row["object_id"],
            "catalog_id": row["catalog_id"],
            "cospar_id": row["cospar_id"],
            "canonical_name": row["canonical_name"],
            "object_type": row["object_type"],
            "aliases": aliases,
            "identity_status": "CONFLICTED" if open_conflict_count else "CANONICAL",
            "latest_orbit_solution": {
                "id": row["orbit_solution_id"],
                "epoch": row["epoch"].isoformat() if row["epoch"] is not None else None,
                "format": row["format"],
                "frame": row["frame"],
                "time_system": row["time_system"],
                "theory": row["theory"],
                "mean_elements": _json_value(row["mean_elements_json"]),
                "covariance_status": quality.get("covariance_status", "INSUFFICIENT_DATA"),
                "pc_status": quality.get("pc_status", "NOT_COMPUTED"),
            },
            "provenance": {
                "source_ids": [row["orbit_source_id"]] if row["content_sha256"] else [],
                "source_snapshot_at": row["epoch"].isoformat()
                if row["epoch"] is not None
                else None,
                "retrieved_at": row["retrieved_at"].isoformat()
                if row["retrieved_at"] is not None
                else None,
                "input_artifact_hashes": [f"sha256:{row['content_sha256']}"]
                if row["content_sha256"]
                else [],
                "quality_grade": quality.get("source_grade"),
                "source_uri": row["source_uri"],
                "limitations": quality.get("limitations", []),
            },
        }


#: Metadata a provider may legitimately state about an object. ``catalog_id`` is
#: deliberately absent: it is the identity key, not metadata, and is only ever
#: settled by the identity resolver.
_METADATA_FIELDS = ("object_type", "cospar_id", "canonical_name")

#: Values that mean "this source did not actually state anything".
_METADATA_ABSENT = {None, "", "UNKNOWN", "TBA"}


def _is_absent(value: Any) -> bool:
    return value is None or str(value).strip().upper() in {"", "UNKNOWN", "TBA"}


async def _record_metadata_provenance(
    session: Any,
    matched: CanonicalObject,
    *,
    record: ParsedOmmRecord,
    source_id: str,
    raw_artifact_id: str,
    created: bool,
) -> CanonicalObject:
    """Record what this source declared, filling only genuine gaps.

    Three outcomes, all durable:
      * ADOPTED   — the stored field was absent and this source states it, so the
                    canonical row is completed and the source is recorded.
      * CONFLICT  — both sides state a value and they differ. The stored value is
                    left untouched; disagreement is evidence, not a reason to
                    overwrite (same stance as ``identity_conflict``).
      * CONFIRMED — both sides agree; recorded so corroboration is visible.

    Grades cannot arbitrate here: CelesTrak GP and Space-Track GP are both
    PUBLIC_GP, so precedence would be an invention. Gap-filling plus preserved
    disagreement is defensible without ranking one provider over the other.
    """
    incoming = {
        "object_type": record.object_type,
        "cospar_id": record.international_designator,
        "canonical_name": record.object_name,
    }
    stored = {
        "object_type": matched.object_type,
        "cospar_id": matched.cospar_id,
        "canonical_name": matched.canonical_name,
    }

    adopted: dict[str, str] = {}
    rows: list[dict[str, Any]] = []
    for field in _METADATA_FIELDS:
        incoming_value = incoming.get(field)
        stored_value = stored.get(field)
        if _is_absent(incoming_value):
            continue  # the source said nothing; there is nothing to record
        if created:
            # The insert already carried this source's values, so nothing is
            # adopted; recording it as CONFIRMED would falsely imply a second
            # source agreed, so first authorship is named for what it is.
            outcome = "ESTABLISHED"
            reason = f"{source_id} established {field} when the object was created"
        elif _is_absent(stored_value):
            adopted[field] = str(incoming_value)
            outcome = "ADOPTED"
            reason = f"stored {field} was absent; {source_id} declared it"
        elif str(stored_value) == str(incoming_value):
            outcome = "CONFIRMED"
            reason = f"{source_id} corroborated the stored {field}"
        else:
            outcome = "CONFLICT"
            reason = (
                f"{source_id} declared a different {field}; the stored value is "
                "kept and the disagreement is preserved for review"
            )
        rows.append(
            {
                "object_id": matched.id,
                "field_name": field,
                "previous_value": None if stored_value is None else str(stored_value),
                "incoming_value": str(incoming_value),
                "outcome": outcome,
                "reason": reason,
                "source_id": source_id,
                "raw_artifact_id": raw_artifact_id,
                "observed_at": record.epoch,
            }
        )

    if not rows:
        return matched

    await session.execute(
        text(
            """
            INSERT INTO object_metadata_revision (
                object_id, field_name, previous_value, incoming_value,
                outcome, reason, source_id, raw_artifact_id, observed_at
            ) VALUES (
                CAST(:object_id AS uuid), :field_name, :previous_value, :incoming_value,
                :outcome, :reason, :source_id, CAST(:raw_artifact_id AS uuid), :observed_at
            )
            """
        ),
        rows,
    )

    if not adopted:
        return matched

    assignments = ", ".join(f"{field} = :{field}" for field in adopted)
    updated = await session.execute(
        text(
            f"""
            UPDATE space_object SET {assignments}, updated_at = now()
            WHERE id = CAST(:object_id AS uuid)
            RETURNING id::text, catalog_id, cospar_id, canonical_name, object_type
            """
        ),
        {**adopted, "object_id": matched.id},
    )
    row = updated.mappings().one_or_none()
    return _canonical_object(row) if row is not None else matched


async def _upsert_alias(
    session: AsyncSession,
    object_id: str,
    source_id: str,
    source_key: str,
    source_name: str | None,
) -> None:
    """Update a source name only when its exact source key has the same object."""
    result = await session.execute(
        text(
            """
            INSERT INTO space_object_alias (object_id, source_id, source_key, source_name)
            VALUES (CAST(:object_id AS uuid), :source_id, :source_key, :source_name)
            ON CONFLICT (source_id, source_key) DO UPDATE
            SET source_name = EXCLUDED.source_name
            WHERE space_object_alias.object_id = EXCLUDED.object_id
            RETURNING object_id::text
            """
        ),
        {
            "object_id": object_id,
            "source_id": source_id,
            "source_key": source_key,
            "source_name": source_name,
        },
    )
    linked_object_id = result.scalar_one_or_none()
    if linked_object_id is not None:
        return
    existing = await session.execute(
        text(
            """
            SELECT object_id::text FROM space_object_alias
            WHERE source_id = :source_id AND source_key = :source_key
            """
        ),
        {"source_id": source_id, "source_key": source_key},
    )
    existing_object_id = existing.scalar_one_or_none()
    if existing_object_id is None:
        raise RuntimeError("source alias was not persisted")
    if str(existing_object_id) != object_id:
        raise RuntimeError("source alias is already bound to another canonical object")


def _canonical_object(row: Mapping[str, Any] | RowMapping) -> CanonicalObject:
    """Map an exact database identity row without deriving any missing field."""
    return CanonicalObject(
        id=str(row["id"]),
        catalog_id=row["catalog_id"],
        cospar_id=row["cospar_id"],
        canonical_name=row["canonical_name"],
        object_type=str(row["object_type"]),
    )


def _json_value(value: Any) -> dict[str, Any]:
    """Normalize JSONB driver return types without manufacturing missing values."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        parsed = json.loads(value)
        if isinstance(parsed, dict):
            return parsed
    return {}
