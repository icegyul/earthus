from __future__ import annotations

from datetime import datetime
from functools import wraps
from threading import RLock
from typing import Any
from uuid import uuid4

import psycopg2
from psycopg2.extras import Json, RealDictCursor

from .storage import _jsonable, _sha


def _psycopg_url(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


def _serialized(method):
    """Serialize access to the repository's single psycopg2 connection."""

    @wraps(method)
    def call(self, *args, **kwargs):
        with self._connection_lock:
            return method(self, *args, **kwargs)

    return call


class PostgresProductRepository:
    """Durable v0.6 product persistence in the namespaced PostgreSQL schema."""

    def __init__(self, database_url: str):
        if not database_url:
            raise ValueError("database_url is required")
        self.database_url = _psycopg_url(database_url)
        self._connection_lock = RLock()
        self.conn = psycopg2.connect(self.database_url)

    @_serialized
    def close(self) -> None:
        self.conn.close()

    @_serialized
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
        with self.conn:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT id::text,version,payload_hash FROM aetherus_product.product_record "
                    "WHERE domain=%s AND record_type=%s AND entity_key=%s AND payload_hash=%s",
                    (domain, record_type, entity_key, digest),
                )
                existing = cursor.fetchone()
                if existing:
                    return {**dict(existing), "deduplicated": True}
                cursor.execute(
                    "SELECT COALESCE(MAX(version),0)+1 AS version FROM aetherus_product.product_record "
                    "WHERE domain=%s AND record_type=%s AND entity_key=%s",
                    (domain, record_type, entity_key),
                )
                version = int(cursor.fetchone()["version"])
                record_id = str(uuid4())
                cursor.execute(
                    """
                    INSERT INTO aetherus_product.product_record(
                      id,domain,record_type,entity_key,version,observed_at,
                      evidence_class,validation_state,payload_hash,payload_json
                    ) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (record_id, domain, record_type, entity_key, version, observed_at,
                     evidence_class, validation_state, digest, Json(body)),
                )
        return {"id": record_id, "version": version, "payload_hash": digest, "deduplicated": False}

    @_serialized
    def latest_record(self, domain: str, record_type: str, entity_key: str) -> dict[str, Any] | None:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT id::text,version,observed_at,evidence_class,validation_state,payload_hash,payload_json
                FROM aetherus_product.product_record
                WHERE domain=%s AND record_type=%s AND entity_key=%s
                ORDER BY version DESC LIMIT 1
                """,
                (domain, record_type, entity_key),
            )
            row = cursor.fetchone()
        if not row:
            return None
        result = dict(row)
        result["observed_at"] = result["observed_at"].isoformat()
        result["payload"] = result.pop("payload_json")
        return result

    @_serialized
    def list_records(self, *, domain: str | None = None, record_type: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        if domain is not None:
            clauses.append("domain=%s")
            params.append(domain)
        if record_type is not None:
            clauses.append("record_type=%s")
            params.append(record_type)
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        params.append(max(1, min(int(limit), 2000)))
        with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT id::text,domain,record_type,entity_key,version,observed_at,evidence_class,"
                "validation_state,payload_hash,payload_json FROM aetherus_product.product_record"
                + where + " ORDER BY observed_at DESC,version DESC LIMIT %s",
                params,
            )
            rows = cursor.fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["observed_at"] = item["observed_at"].isoformat()
            item["payload"] = item.pop("payload_json")
            result.append(item)
        return result

    @_serialized
    def append_universe(self, session_id: str, state: Any, created_at: datetime) -> dict[str, Any]:
        body = _jsonable(state)
        digest = _sha(body)
        with self.conn:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT id::text,revision_no,state_hash FROM aetherus_product.universe_revision "
                    "WHERE session_id=%s AND state_hash=%s", (session_id, digest),
                )
                existing = cursor.fetchone()
                if existing:
                    return {**dict(existing), "deduplicated": True}
                cursor.execute(
                    "SELECT COALESCE(MAX(revision_no),0)+1 AS revision_no "
                    "FROM aetherus_product.universe_revision WHERE session_id=%s", (session_id,),
                )
                revision_no = int(cursor.fetchone()["revision_no"])
                revision_id = str(uuid4())
                cursor.execute(
                    "INSERT INTO aetherus_product.universe_revision(id,session_id,revision_no,state_hash,state_json,created_at) "
                    "VALUES(%s,%s,%s,%s,%s,%s)",
                    (revision_id, session_id, revision_no, digest, Json(body), created_at),
                )
        return {"id": revision_id, "revision_no": revision_no, "state_hash": digest, "deduplicated": False}

    @_serialized
    def latest_universe(self, session_id: str) -> dict[str, Any] | None:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT revision_no,state_hash,state_json,created_at FROM aetherus_product.universe_revision "
                "WHERE session_id=%s ORDER BY revision_no DESC LIMIT 1", (session_id,),
            )
            row = cursor.fetchone()
        if not row:
            return None
        return {"revision_no": row["revision_no"], "state_hash": row["state_hash"],
                "state": row["state_json"], "created_at": row["created_at"].isoformat()}

    @_serialized
    def counts(self) -> dict[str, int]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
              SELECT (SELECT COUNT(*) FROM aetherus_product.product_record) AS product_record,
                     (SELECT COUNT(*) FROM aetherus_product.universe_revision) AS universe_revision
            """)
            row = cursor.fetchone()
        return {"product_record": int(row["product_record"]), "universe_revision": int(row["universe_revision"])}

    @_serialized
    def _insert_once(self, *, insert_sql: str, params: tuple[Any, ...], conflict_lookup_sql: str | None = None, conflict_lookup_params: tuple[Any, ...] = ()) -> dict[str, Any]:
        with self.conn:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(insert_sql, params)
                row = cursor.fetchone()
                if row:
                    return {"id": str(row["id"]), "deduplicated": False}
                if conflict_lookup_sql is None:
                    raise RuntimeError("phase artifact insert returned no identity")
                cursor.execute(conflict_lookup_sql, conflict_lookup_params)
                existing = cursor.fetchone()
                if not existing:
                    raise RuntimeError("phase artifact conflict row is missing")
                return {"id": str(existing["id"]), "deduplicated": True}

    def append_genealogy_link(self, *, child_key: str, parent_key: str | None, origin_status: str, provenance: dict[str, Any]) -> dict[str, Any]:
        return self._insert_once(
            insert_sql="INSERT INTO aetherus_product.genealogy_link(child_key,parent_key,origin_status,provenance) VALUES(%s,%s,%s,%s) RETURNING id",
            params=(child_key, parent_key, origin_status, Json(_jsonable(provenance))),
        )

    def append_fragmentation_run(self, *, parent_key: str, seed: int, model_version: str, validation_state: str, output_hash: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._insert_once(
            insert_sql="""INSERT INTO aetherus_product.fragmentation_run(parent_key,seed,model_version,validation_state,output_hash,payload)
              VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT(output_hash) DO NOTHING RETURNING id""",
            params=(parent_key, seed, model_version, validation_state, output_hash, Json(_jsonable(payload))),
            conflict_lookup_sql="SELECT id FROM aetherus_product.fragmentation_run WHERE output_hash=%s",
            conflict_lookup_params=(output_hash,),
        )

    def append_observation_record(self, *, object_key: str | None, observed_at: datetime, observer_class: str, qa_state: str, evidence_class: str, license_policy: str | None, payload_hash: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._insert_once(
            insert_sql="""INSERT INTO aetherus_product.observation_record(object_key,observed_at,observer_class,qa_state,evidence_class,license_policy,payload_hash,payload)
              VALUES(%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(payload_hash) DO NOTHING RETURNING id""",
            params=(object_key, observed_at, observer_class, qa_state, evidence_class, license_policy, payload_hash, Json(_jsonable(payload))),
            conflict_lookup_sql="SELECT id FROM aetherus_product.observation_record WHERE payload_hash=%s",
            conflict_lookup_params=(payload_hash,),
        )

    def append_reentry_revision(self, *, object_key: str, revision_no: int, estimate_time: datetime | None, window: dict[str, Any], evidence_class: str, validation_state: str, provenance: dict[str, Any]) -> dict[str, Any]:
        return self._insert_once(
            insert_sql="""INSERT INTO aetherus_product.reentry_revision(object_key,revision_no,estimate_time,window_json,evidence_class,validation_state,provenance)
              VALUES(%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(object_key,revision_no) DO NOTHING RETURNING id""",
            params=(object_key, revision_no, estimate_time, Json(_jsonable(window)), evidence_class, validation_state, Json(_jsonable(provenance))),
            conflict_lookup_sql="SELECT id FROM aetherus_product.reentry_revision WHERE object_key=%s AND revision_no=%s",
            conflict_lookup_params=(object_key, revision_no),
        )

    def append_scenario_validation_run(self, *, scenario_id: str | None, validation_kind: str, result_state: str, result_hash: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._insert_once(
            insert_sql="""INSERT INTO aetherus_product.scenario_validation_run(scenario_id,validation_kind,result_state,result_hash,payload)
              VALUES(%s,%s,%s,%s,%s) ON CONFLICT(result_hash) DO NOTHING RETURNING id""",
            params=(scenario_id, validation_kind, result_state, result_hash, Json(_jsonable(payload))),
            conflict_lookup_sql="SELECT id FROM aetherus_product.scenario_validation_run WHERE result_hash=%s",
            conflict_lookup_params=(result_hash,),
        )

    def append_protect_ranking(self, *, protected_entity_key: str, generated_at: datetime, model_version: str, ranking_hash: str, ranked_candidates: list[dict[str, Any]], provenance: dict[str, Any]) -> dict[str, Any]:
        return self._insert_once(
            insert_sql="""INSERT INTO aetherus_product.protect_ranking(protected_entity_key,generated_at,model_version,ranking_hash,ranked_candidates,provenance)
              VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT(ranking_hash) DO NOTHING RETURNING id""",
            params=(protected_entity_key, generated_at, model_version, ranking_hash, Json(_jsonable(ranked_candidates)), Json(_jsonable(provenance))),
            conflict_lookup_sql="SELECT id FROM aetherus_product.protect_ranking WHERE ranking_hash=%s",
            conflict_lookup_params=(ranking_hash,),
        )

    def append_dataset_manifest(self, *, dataset_key: str, version: str, content_hash: str, license_policy: str, provenance: dict[str, Any]) -> dict[str, Any]:
        return self._insert_once(
            insert_sql="""INSERT INTO aetherus_product.dataset_manifest(dataset_key,version,content_hash,license_policy,provenance)
              VALUES(%s,%s,%s,%s,%s) ON CONFLICT(dataset_key,version,content_hash) DO NOTHING RETURNING id""",
            params=(dataset_key, version, content_hash, license_policy, Json(_jsonable(provenance))),
            conflict_lookup_sql="SELECT id FROM aetherus_product.dataset_manifest WHERE dataset_key=%s AND version=%s AND content_hash=%s",
            conflict_lookup_params=(dataset_key, version, content_hash),
        )

    @_serialized
    def upsert_job_run(self, *, job_key: str, idempotency_key: str, status: str, attempts: int, payload: dict[str, Any]) -> dict[str, Any]:
        with self.conn:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""INSERT INTO aetherus_product.job_run(job_key,idempotency_key,status,attempts,payload)
                  VALUES(%s,%s,%s,%s,%s) ON CONFLICT(idempotency_key) DO UPDATE SET
                  status=EXCLUDED.status,attempts=EXCLUDED.attempts,payload=EXCLUDED.payload,updated_at=now() RETURNING id""",
                  (job_key, idempotency_key, status, attempts, Json(_jsonable(payload))))
                row = cursor.fetchone()
        return {"id": str(row["id"]), "deduplicated": False}

    def append_audit_event(self, *, tenant_id: str | None, actor_id: str | None, action: str, target_type: str | None, target_id: str | None, trace_id: str | None, payload: dict[str, Any]) -> dict[str, Any]:
        return self._insert_once(
            insert_sql="""INSERT INTO aetherus_product.audit_event(tenant_id,actor_id,action,target_type,target_id,trace_id,payload)
              VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
            params=(tenant_id, actor_id, action, target_type, target_id, trace_id, Json(_jsonable(payload))),
        )
