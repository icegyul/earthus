from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Iterable
from uuid import UUID

from aetherus_domain import (
    ArchiveIndex,
    CanonicalObject,
    DataSourcePolicy,
    DigitalState,
    EvidenceRecord,
    IdentityConflict,
    IngestionRun,
    IntelligenceEvent,
    EventRevision,
    SignalRecord,
    ProvenanceBundle,
    QuarantinedRecord,
    RawArtifact,
    SnapshotManifest,
    TypedRelation,
)


def _dump(model) -> str:
    return json.dumps(model.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))


def _load(model_type, value: str):
    return model_type.model_validate(json.loads(value))


class LocalFoundationRepository:
    """Runnable local persistence for Foundation acceptance/evidence.

    PostgreSQL/PostGIS remains the production contract. This SQLite store exists to make
    the Foundation path executable in a credential-free local package without pretending
    to be the production database.
    """

    def __init__(self, path: str | Path = ":memory:"):
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._migrate()

    def close(self):
        self.conn.close()

    def _migrate(self):
        self.conn.executescript(
            """
            PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS data_source(
              id TEXT PRIMARY KEY, model_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ingestion_run(
              id TEXT PRIMARY KEY, source_id TEXT NOT NULL, status TEXT NOT NULL,
              started_at TEXT NOT NULL, model_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS raw_artifact(
              id TEXT PRIMARY KEY, source_id TEXT NOT NULL, content_sha256 TEXT NOT NULL,
              retrieved_at TEXT NOT NULL, model_json TEXT NOT NULL,
              UNIQUE(source_id, content_sha256)
            );
            CREATE TABLE IF NOT EXISTS quarantine_record(
              id TEXT PRIMARY KEY, source_id TEXT NOT NULL, raw_artifact_id TEXT NOT NULL,
              model_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS canonical_entity(
              id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, catalog_id TEXT,
              cospar_id TEXT, model_json TEXT NOT NULL,
              UNIQUE(entity_type, catalog_id)
            );
            CREATE TABLE IF NOT EXISTS entity_alias(
              entity_id TEXT NOT NULL, source_id TEXT NOT NULL, source_key TEXT NOT NULL,
              source_name TEXT, PRIMARY KEY(source_id, source_key)
            );
            CREATE TABLE IF NOT EXISTS identity_conflict(
              id TEXT PRIMARY KEY, source_id TEXT NOT NULL, source_key TEXT NOT NULL,
              model_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS evidence(
              id TEXT PRIMARY KEY, source_id TEXT NOT NULL, checksum_sha256 TEXT NOT NULL,
              observed_at TEXT NOT NULL, model_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS provenance_bundle(
              id TEXT PRIMARY KEY, provenance_hash TEXT NOT NULL UNIQUE, model_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS digital_state(
              id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, state_hash TEXT NOT NULL,
              state_time TEXT NOT NULL, state_kind TEXT NOT NULL, model_json TEXT NOT NULL,
              UNIQUE(entity_id, state_hash)
            );
            CREATE TABLE IF NOT EXISTS snapshot_manifest(
              id TEXT PRIMARY KEY, snapshot_hash TEXT NOT NULL UNIQUE, baseline INTEGER NOT NULL,
              model_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS object_relation(
              id TEXT PRIMARY KEY, relation_key TEXT NOT NULL UNIQUE, subject_id TEXT NOT NULL, relation_type TEXT NOT NULL,
              object_id TEXT NOT NULL, valid_from TEXT, valid_to TEXT, model_json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS object_relation_subject_idx
              ON object_relation(subject_id, relation_type);
            CREATE TABLE IF NOT EXISTS archive_index(
              object_id TEXT PRIMARY KEY, model_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS signal(
              id TEXT PRIMARY KEY, producer_module_id TEXT NOT NULL, observed_at TEXT NOT NULL, model_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS intelligence_event(
              id TEXT PRIMARY KEY, canonical_key TEXT NOT NULL UNIQUE, model_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS event_revision(
              id TEXT PRIMARY KEY, event_id TEXT NOT NULL, revision_no INTEGER NOT NULL,
              model_json TEXT NOT NULL, UNIQUE(event_id, revision_no)
            );
            CREATE TABLE IF NOT EXISTS intelligence_packet(
              packet_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, revision_id TEXT NOT NULL,
              model_json TEXT NOT NULL
            );
            """
        )
        self.conn.commit()

    def save_data_source(self, source: DataSourcePolicy):
        self.conn.execute(
            "INSERT INTO data_source(id,model_json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET model_json=excluded.model_json",
            (source.id, _dump(source)),
        )
        self.conn.commit()

    def list_data_sources(self) -> list[DataSourcePolicy]:
        return [_load(DataSourcePolicy, r[0]) for r in self.conn.execute("SELECT model_json FROM data_source ORDER BY id").fetchall()]

    def get_data_source(self, source_id: str) -> DataSourcePolicy | None:
        row = self.conn.execute("SELECT model_json FROM data_source WHERE id=?", (source_id,)).fetchone()
        return _load(DataSourcePolicy, row[0]) if row else None

    def list_ingestion_runs(self, limit: int = 50) -> list[IngestionRun]:
        rows = self.conn.execute("SELECT model_json FROM ingestion_run ORDER BY started_at DESC LIMIT ?", (limit,)).fetchall()
        return [_load(IngestionRun, r[0]) for r in rows]

    def save_ingestion_run(self, run: IngestionRun):
        self.conn.execute(
            "INSERT INTO ingestion_run(id,source_id,status,started_at,model_json) VALUES(?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET status=excluded.status, model_json=excluded.model_json",
            (str(run.id), run.source_id, run.status.value, run.started_at.isoformat(), _dump(run)),
        )
        self.conn.commit()

    def save_raw_artifact(self, artifact: RawArtifact) -> RawArtifact:
        existing = self.find_raw_by_hash(artifact.source_id, artifact.content_sha256)
        if existing:
            return existing
        self.conn.execute(
            "INSERT INTO raw_artifact(id,source_id,content_sha256,retrieved_at,model_json) VALUES(?,?,?,?,?)",
            (str(artifact.id), artifact.source_id, artifact.content_sha256, artifact.retrieved_at.isoformat(), _dump(artifact)),
        )
        self.conn.commit()
        return artifact

    def find_raw_by_hash(self, source_id: str, digest: str) -> RawArtifact | None:
        row = self.conn.execute(
            "SELECT model_json FROM raw_artifact WHERE source_id=? AND content_sha256=?", (source_id, digest)
        ).fetchone()
        return _load(RawArtifact, row[0]) if row else None

    def latest_raw(self, source_id: str) -> RawArtifact | None:
        row = self.conn.execute(
            "SELECT model_json FROM raw_artifact WHERE source_id=? ORDER BY retrieved_at DESC LIMIT 1", (source_id,)
        ).fetchone()
        return _load(RawArtifact, row[0]) if row else None

    def save_quarantine(self, record: QuarantinedRecord):
        self.conn.execute(
            "INSERT INTO quarantine_record(id,source_id,raw_artifact_id,model_json) VALUES(?,?,?,?)",
            (str(record.id), record.source_id, str(record.raw_artifact_id), _dump(record)),
        )
        self.conn.commit()

    def quarantine_count(self, raw_artifact_id: UUID | None = None) -> int:
        if raw_artifact_id:
            return int(self.conn.execute("SELECT COUNT(*) FROM quarantine_record WHERE raw_artifact_id=?", (str(raw_artifact_id),)).fetchone()[0])
        return int(self.conn.execute("SELECT COUNT(*) FROM quarantine_record").fetchone()[0])

    def get_canonical(self, object_id: UUID | str) -> CanonicalObject | None:
        row = self.conn.execute("SELECT model_json FROM canonical_entity WHERE id=?", (str(object_id),)).fetchone()
        return _load(CanonicalObject, row[0]) if row else None

    def list_canonicals(self, limit: int = 200) -> list[CanonicalObject]:
        rows = self.conn.execute(
            "SELECT model_json FROM canonical_entity ORDER BY entity_type,catalog_id,id LIMIT ?",
            (max(1, min(int(limit), 2000)),),
        ).fetchall()
        return [_load(CanonicalObject, r[0]) for r in rows]

    def get_canonical_by_catalog(self, entity_type: str, catalog_id: str) -> CanonicalObject | None:
        row = self.conn.execute(
            "SELECT model_json FROM canonical_entity WHERE entity_type=? AND catalog_id=?", (entity_type, str(catalog_id))
        ).fetchone()
        return _load(CanonicalObject, row[0]) if row else None

    def get_canonical_by_alias(self, source_id: str, source_key: str) -> CanonicalObject | None:
        row = self.conn.execute(
            "SELECT e.model_json FROM entity_alias a JOIN canonical_entity e ON e.id=a.entity_id "
            "WHERE a.source_id=? AND a.source_key=?", (source_id, source_key)
        ).fetchone()
        return _load(CanonicalObject, row[0]) if row else None

    def save_canonical_object(self, obj: CanonicalObject):
        self.conn.execute(
            "INSERT INTO canonical_entity(id,entity_type,catalog_id,cospar_id,model_json) VALUES(?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET cospar_id=excluded.cospar_id, model_json=excluded.model_json",
            (str(obj.id), obj.entity_type, obj.catalog_id, obj.cospar_id, _dump(obj)),
        )
        for alias in obj.aliases:
            self.conn.execute(
                "INSERT INTO entity_alias(entity_id,source_id,source_key,source_name) VALUES(?,?,?,?) "
                "ON CONFLICT(source_id,source_key) DO UPDATE SET entity_id=excluded.entity_id, source_name=excluded.source_name",
                (str(obj.id), alias.source_id, alias.source_key, alias.source_name),
            )
        self.conn.commit()

    def save_identity_conflict(self, conflict: IdentityConflict):
        self.conn.execute(
            "INSERT INTO identity_conflict(id,source_id,source_key,model_json) VALUES(?,?,?,?)",
            (str(conflict.id), conflict.source_id, conflict.source_key, _dump(conflict)),
        )
        self.conn.commit()

    def identity_conflict_count(self) -> int:
        return int(self.conn.execute("SELECT COUNT(*) FROM identity_conflict").fetchone()[0])

    def save_evidence(self, evidence: EvidenceRecord):
        self.conn.execute(
            "INSERT OR IGNORE INTO evidence(id,source_id,checksum_sha256,observed_at,model_json) VALUES(?,?,?,?,?)",
            (str(evidence.id), evidence.source_id, evidence.checksum_sha256, evidence.observed_at.isoformat(), _dump(evidence)),
        )
        self.conn.commit()

    def get_evidence(self, evidence_id: UUID | str) -> EvidenceRecord | None:
        row = self.conn.execute("SELECT model_json FROM evidence WHERE id=?", (str(evidence_id),)).fetchone()
        return _load(EvidenceRecord, row[0]) if row else None

    def save_provenance(self, bundle: ProvenanceBundle) -> ProvenanceBundle:
        row = self.conn.execute("SELECT model_json FROM provenance_bundle WHERE provenance_hash=?", (bundle.provenance_hash,)).fetchone()
        if row:
            return _load(ProvenanceBundle, row[0])
        self.conn.execute(
            "INSERT INTO provenance_bundle(id,provenance_hash,model_json) VALUES(?,?,?)",
            (str(bundle.id), bundle.provenance_hash, _dump(bundle)),
        )
        self.conn.commit()
        return bundle

    def get_provenance(self, bundle_id: UUID | str) -> ProvenanceBundle | None:
        row = self.conn.execute("SELECT model_json FROM provenance_bundle WHERE id=?", (str(bundle_id),)).fetchone()
        return _load(ProvenanceBundle, row[0]) if row else None

    def provenance_for_evidence(self, evidence_id: UUID | str) -> list[ProvenanceBundle]:
        out: list[ProvenanceBundle] = []
        for row in self.conn.execute("SELECT model_json FROM provenance_bundle ORDER BY id").fetchall():
            bundle = _load(ProvenanceBundle, row[0])
            if str(bundle.evidence.id) == str(evidence_id):
                out.append(bundle)
        return out

    def save_digital_state(self, state: DigitalState) -> DigitalState:
        row = self.conn.execute(
            "SELECT model_json FROM digital_state WHERE entity_id=? AND state_hash=?", (str(state.entity_id), state.state_hash)
        ).fetchone()
        if row:
            return _load(DigitalState, row[0])
        self.conn.execute(
            "INSERT INTO digital_state(id,entity_id,state_hash,state_time,state_kind,model_json) VALUES(?,?,?,?,?,?)",
            (str(state.id), str(state.entity_id), state.state_hash, state.state_time.isoformat(), state.state_kind.value, _dump(state)),
        )
        self.conn.commit()
        return state

    def get_digital_state(self, state_id: UUID | str) -> DigitalState | None:
        row = self.conn.execute("SELECT model_json FROM digital_state WHERE id=?", (str(state_id),)).fetchone()
        return _load(DigitalState, row[0]) if row else None

    def save_snapshot(self, snapshot: SnapshotManifest) -> SnapshotManifest:
        existing = self.conn.execute("SELECT model_json FROM snapshot_manifest WHERE snapshot_hash=?", (snapshot.snapshot_hash,)).fetchone()
        if existing:
            return _load(SnapshotManifest, existing[0])
        self.conn.execute(
            "INSERT INTO snapshot_manifest(id,snapshot_hash,baseline,model_json) VALUES(?,?,?,?)",
            (str(snapshot.id), snapshot.snapshot_hash, 1 if snapshot.baseline else 0, _dump(snapshot)),
        )
        self.conn.commit()
        return snapshot

    def get_snapshot(self, snapshot_id: UUID | str) -> SnapshotManifest | None:
        row = self.conn.execute("SELECT model_json FROM snapshot_manifest WHERE id=?", (str(snapshot_id),)).fetchone()
        return _load(SnapshotManifest, row[0]) if row else None

    def save_relation(self, relation: TypedRelation) -> TypedRelation:
        import hashlib
        key_payload = {
            "subject_id": relation.subject_id,
            "relation_type": relation.relation_type,
            "object_id": relation.object_id,
            "provenance_evidence_id": str(relation.provenance_evidence_id),
            "valid_from": relation.valid_from.isoformat() if relation.valid_from else None,
            "valid_to": relation.valid_to.isoformat() if relation.valid_to else None,
            "uncertainty_reason": relation.uncertainty_reason,
            "metadata": relation.metadata,
        }
        relation_key = hashlib.sha256(json.dumps(key_payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        existing = self.conn.execute("SELECT model_json FROM object_relation WHERE relation_key=?", (relation_key,)).fetchone()
        if existing:
            return _load(TypedRelation, existing[0])
        self.conn.execute(
            "INSERT INTO object_relation(id,relation_key,subject_id,relation_type,object_id,valid_from,valid_to,model_json) VALUES(?,?,?,?,?,?,?,?)",
            (str(relation.id), relation_key, relation.subject_id, relation.relation_type, relation.object_id,
             relation.valid_from.isoformat() if relation.valid_from else None,
             relation.valid_to.isoformat() if relation.valid_to else None, _dump(relation)),
        )
        self.conn.commit()
        return relation

    def relations_from(self, subject_id: str) -> list[TypedRelation]:
        rows = self.conn.execute("SELECT model_json FROM object_relation WHERE subject_id=?", (subject_id,)).fetchall()
        return [_load(TypedRelation, r[0]) for r in rows]

    def all_relations(self) -> list[TypedRelation]:
        return [_load(TypedRelation, r[0]) for r in self.conn.execute("SELECT model_json FROM object_relation").fetchall()]

    def save_archive_index(self, index: ArchiveIndex):
        self.conn.execute(
            "INSERT INTO archive_index(object_id,model_json) VALUES(?,?) ON CONFLICT(object_id) DO UPDATE SET model_json=excluded.model_json",
            (index.object_id, _dump(index)),
        )
        self.conn.commit()

    def save_signal(self, signal: SignalRecord):
        self.conn.execute(
            "INSERT OR REPLACE INTO signal(id,producer_module_id,observed_at,model_json) VALUES(?,?,?,?)",
            (str(signal.id), signal.producer_module_id, signal.observed_at.isoformat(), _dump(signal)),
        )
        self.conn.commit()

    def list_signals(self, limit: int = 200) -> list[SignalRecord]:
        rows = self.conn.execute(
            "SELECT model_json FROM signal ORDER BY observed_at DESC LIMIT ?",
            (max(1, min(int(limit), 2000)),),
        ).fetchall()
        return [_load(SignalRecord, r[0]) for r in rows]

    def get_event(self, event_id: UUID | str) -> IntelligenceEvent | None:
        row = self.conn.execute("SELECT model_json FROM intelligence_event WHERE id=?", (str(event_id),)).fetchone()
        return _load(IntelligenceEvent, row[0]) if row else None

    def list_events(self, limit: int = 200) -> list[IntelligenceEvent]:
        rows = self.conn.execute(
            "SELECT model_json FROM intelligence_event ORDER BY id LIMIT ?",
            (max(1, min(int(limit), 2000)),),
        ).fetchall()
        return [_load(IntelligenceEvent, r[0]) for r in rows]

    def get_packet_for_event(self, event_id: UUID | str):
        from aetherus_domain import IntelligencePacket
        row = self.conn.execute("SELECT model_json FROM intelligence_packet WHERE event_id=? ORDER BY rowid DESC LIMIT 1", (str(event_id),)).fetchone()
        return _load(IntelligencePacket, row[0]) if row else None

    # Interface-compatible methods for IntelligenceOrchestrator.
    def get_event_by_key(self, key: str):
        row = self.conn.execute("SELECT model_json FROM intelligence_event WHERE canonical_key=?", (key,)).fetchone()
        return _load(IntelligenceEvent, row[0]) if row else None

    def save_event(self, event: IntelligenceEvent):
        self.conn.execute(
            "INSERT INTO intelligence_event(id,canonical_key,model_json) VALUES(?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET canonical_key=excluded.canonical_key, model_json=excluded.model_json",
            (str(event.id), event.canonical_key, _dump(event)),
        )
        self.conn.commit()

    def append_revision(self, revision: EventRevision):
        self.conn.execute(
            "INSERT INTO event_revision(id,event_id,revision_no,model_json) VALUES(?,?,?,?)",
            (str(revision.id), str(revision.event_id), revision.revision_no, _dump(revision)),
        )
        self.conn.commit()

    def revisions_for(self, event_id) -> list[EventRevision]:
        rows = self.conn.execute(
            "SELECT model_json FROM event_revision WHERE event_id=? ORDER BY revision_no", (str(event_id),)
        ).fetchall()
        return [_load(EventRevision, r[0]) for r in rows]

    def save_packet(self, packet):
        self.conn.execute(
            "INSERT OR REPLACE INTO intelligence_packet(packet_id,event_id,revision_id,model_json) VALUES(?,?,?,?)",
            (str(packet.packet_id), str(packet.event.id), str(packet.revision.id), _dump(packet)),
        )
        self.conn.commit()

    def counts(self) -> dict[str, int]:
        tables = [
            "data_source", "ingestion_run", "raw_artifact", "canonical_entity", "evidence",
            "digital_state", "snapshot_manifest", "object_relation", "signal", "intelligence_event", "event_revision", "intelligence_packet"
        ]
        return {t: int(self.conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]) for t in tables}
