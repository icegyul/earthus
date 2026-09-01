from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import asdict, is_dataclass
from datetime import date, datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4


def _jsonable(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return _jsonable(value.model_dump(mode="json"))
    if is_dataclass(value):
        return _jsonable(asdict(value))
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(v) for v in value]
    return value


def _canonical_json(payload: Any) -> str:
    return json.dumps(_jsonable(payload), sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha(payload: Any) -> str:
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


class LocalProductRepository:
    """Append-only local persistence for the integrated product runtime.

    The production contract remains PostgreSQL/PostGIS.  This repository intentionally
    shares the Foundation SQLite connection so a credential-free local run can prove
    that SPACE/CONTROL/ORBIT/INTELLIGENCE/ARCHIVE outputs and Universe revisions are
    persisted rather than living only in process memory.
    """

    def __init__(self, connection: sqlite3.Connection):
        self.conn = connection
        self._migrate()

    def _migrate(self) -> None:
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS product_record(
              id TEXT PRIMARY KEY,
              domain TEXT NOT NULL,
              record_type TEXT NOT NULL,
              entity_key TEXT NOT NULL,
              version INTEGER NOT NULL,
              observed_at TEXT NOT NULL,
              evidence_class TEXT,
              validation_state TEXT,
              payload_hash TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              UNIQUE(domain, record_type, entity_key, payload_hash),
              UNIQUE(domain, record_type, entity_key, version)
            );
            CREATE INDEX IF NOT EXISTS product_record_lookup_idx
              ON product_record(domain, record_type, entity_key, version DESC);

            CREATE TABLE IF NOT EXISTS universe_revision(
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              revision_no INTEGER NOT NULL,
              state_hash TEXT NOT NULL,
              state_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              UNIQUE(session_id, revision_no),
              UNIQUE(session_id, state_hash)
            );
            CREATE INDEX IF NOT EXISTS universe_revision_latest_idx
              ON universe_revision(session_id, revision_no DESC);
            """
        )
        self.conn.commit()

    def append_record(
        self,
        *,
        domain: str,
        record_type: str,
        entity_key: str,
        payload: Any,
        observed_at: datetime,
        evidence_class: str | None = None,
        validation_state: str | None = None,
    ) -> dict[str, Any]:
        body = _jsonable(payload)
        digest = _sha(body)
        existing = self.conn.execute(
            "SELECT id,version,payload_hash FROM product_record "
            "WHERE domain=? AND record_type=? AND entity_key=? AND payload_hash=?",
            (domain, record_type, entity_key, digest),
        ).fetchone()
        if existing:
            return {"id": existing[0], "version": existing[1], "payload_hash": existing[2], "deduplicated": True}
        row = self.conn.execute(
            "SELECT COALESCE(MAX(version),0)+1 FROM product_record WHERE domain=? AND record_type=? AND entity_key=?",
            (domain, record_type, entity_key),
        ).fetchone()
        version = int(row[0])
        record_id = str(uuid4())
        self.conn.execute(
            "INSERT INTO product_record(id,domain,record_type,entity_key,version,observed_at,evidence_class,validation_state,payload_hash,payload_json) "
            "VALUES(?,?,?,?,?,?,?,?,?,?)",
            (
                record_id,
                domain,
                record_type,
                entity_key,
                version,
                observed_at.isoformat(),
                evidence_class,
                validation_state,
                digest,
                _canonical_json(body),
            ),
        )
        self.conn.commit()
        return {"id": record_id, "version": version, "payload_hash": digest, "deduplicated": False}

    def latest_record(self, domain: str, record_type: str, entity_key: str) -> dict[str, Any] | None:
        row = self.conn.execute(
            "SELECT id,version,observed_at,evidence_class,validation_state,payload_hash,payload_json "
            "FROM product_record WHERE domain=? AND record_type=? AND entity_key=? ORDER BY version DESC LIMIT 1",
            (domain, record_type, entity_key),
        ).fetchone()
        if not row:
            return None
        return {
            "id": row[0], "version": row[1], "observed_at": row[2], "evidence_class": row[3],
            "validation_state": row[4], "payload_hash": row[5], "payload": json.loads(row[6]),
        }

    def list_records(self, *, domain: str | None = None, record_type: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
        clauses=[]; params:list[Any]=[]
        if domain is not None: clauses.append("domain=?"); params.append(domain)
        if record_type is not None: clauses.append("record_type=?"); params.append(record_type)
        where=(" WHERE "+" AND ".join(clauses)) if clauses else ""
        params.append(max(1,min(int(limit),2000)))
        rows=self.conn.execute(
            "SELECT id,domain,record_type,entity_key,version,observed_at,evidence_class,validation_state,payload_hash,payload_json "
            f"FROM product_record{where} ORDER BY observed_at DESC,version DESC LIMIT ?", params
        ).fetchall()
        return [{"id":r[0],"domain":r[1],"record_type":r[2],"entity_key":r[3],"version":r[4],"observed_at":r[5],
                 "evidence_class":r[6],"validation_state":r[7],"payload_hash":r[8],"payload":json.loads(r[9])} for r in rows]

    def append_universe(self, session_id: str, state: Any, created_at: datetime) -> dict[str, Any]:
        body = _jsonable(state)
        digest = _sha(body)
        existing = self.conn.execute(
            "SELECT id,revision_no,state_hash FROM universe_revision WHERE session_id=? AND state_hash=?",
            (session_id, digest),
        ).fetchone()
        if existing:
            return {"id": existing[0], "revision_no": existing[1], "state_hash": existing[2], "deduplicated": True}
        revision_no = int(self.conn.execute(
            "SELECT COALESCE(MAX(revision_no),0)+1 FROM universe_revision WHERE session_id=?", (session_id,)
        ).fetchone()[0])
        rid = str(uuid4())
        self.conn.execute(
            "INSERT INTO universe_revision(id,session_id,revision_no,state_hash,state_json,created_at) VALUES(?,?,?,?,?,?)",
            (rid, session_id, revision_no, digest, _canonical_json(body), created_at.isoformat()),
        )
        self.conn.commit()
        return {"id": rid, "revision_no": revision_no, "state_hash": digest, "deduplicated": False}

    def latest_universe(self, session_id: str) -> dict[str, Any] | None:
        row = self.conn.execute(
            "SELECT revision_no,state_hash,state_json,created_at FROM universe_revision WHERE session_id=? ORDER BY revision_no DESC LIMIT 1",
            (session_id,),
        ).fetchone()
        if not row:
            return None
        return {"revision_no": row[0], "state_hash": row[1], "state": json.loads(row[2]), "created_at": row[3]}

    def counts(self) -> dict[str, int]:
        records = int(self.conn.execute("SELECT COUNT(*) FROM product_record").fetchone()[0])
        universe = int(self.conn.execute("SELECT COUNT(*) FROM universe_revision").fetchone()[0])
        return {"product_record": records, "universe_revision": universe}
