from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4


class DurableOperationsService:
    def __init__(self, product_store):
        self.store = product_store

    def put_private(self, *, tenant_id: str, user_id: str, key: str, value: Any) -> dict[str, Any]:
        if not tenant_id or not user_id or not key:
            raise ValueError("tenant_id, user_id and key are required")
        before = self.get_private(tenant_id=tenant_id, key=key)
        payload = {"tenant_id": tenant_id, "user_id": user_id, "key": key, "value": value}
        self.store.append_record(
            domain="PLATFORM", record_type="PRIVATE_STATE", entity_key=f"{tenant_id}:{key}",
            payload=payload, observed_at=datetime.now(UTC),
            evidence_class="DERIVED", validation_state="PRIVATE",
        )
        self.audit(
            tenant_id=tenant_id, actor_id=user_id, action="PRIVATE_STATE_WRITE",
            target_type="PRIVATE_STATE", target_id=key,
            payload={"before_present": before is not None, "after_present": True},
        )
        return payload

    def get_private(self, *, tenant_id: str, key: str) -> Any | None:
        record = self.store.latest_record("PLATFORM", "PRIVATE_STATE", f"{tenant_id}:{key}")
        return record["payload"]["value"] if record else None

    def audit(self, *, tenant_id: str, actor_id: str, action: str, target_type: str, target_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        audit_id = str(uuid4())
        item = {
            "audit_id": audit_id,
            "tenant_id": tenant_id,
            "actor_id": actor_id,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "trace_id": audit_id,
            "payload": payload,
            "created_at": datetime.now(UTC).isoformat(),
        }
        self.store.append_record(
            domain="PLATFORM", record_type="AUDIT_EVENT", entity_key=audit_id,
            payload=item, observed_at=datetime.now(UTC),
            evidence_class="DERIVED", validation_state="APPEND_ONLY",
        )
        if hasattr(self.store, "append_audit_event"):
            self.store.append_audit_event(
                tenant_id=tenant_id, actor_id=actor_id, action=action,
                target_type=target_type, target_id=target_id, trace_id=audit_id, payload=payload,
            )
        return item

    def audit_for(self, *, tenant_id: str) -> list[dict[str, Any]]:
        rows = self.store.list_records(domain="PLATFORM", record_type="AUDIT_EVENT", limit=2000)
        return [row["payload"] for row in rows if row["payload"].get("tenant_id") == tenant_id]


class DurableJobService:
    def __init__(self, product_store):
        self.store = product_store
        self.handlers: dict[str, Callable[[dict[str, Any]], Any]] = {}

    def register(self, operation: str, handler: Callable[[dict[str, Any]], Any]) -> None:
        if not operation or operation in self.handlers:
            raise ValueError("operation must be unique")
        self.handlers[operation] = handler

    def submit(self, *, operation: str, payload: dict[str, Any], idempotency_key: str) -> dict[str, Any]:
        if operation not in self.handlers:
            raise KeyError(operation)
        if not idempotency_key:
            raise ValueError("idempotency_key is required")
        for row in self.store.list_records(domain="PLATFORM", record_type="JOB_RUN", limit=2000):
            item = row["payload"]
            if item.get("idempotency_key") == idempotency_key:
                return item
        item = {
            "job_id": str(uuid4()),
            "operation": operation,
            "payload": payload,
            "idempotency_key": idempotency_key,
            "status": "QUEUED",
            "attempts": 0,
            "result": None,
            "error": None,
        }
        self._persist(item)
        return item

    def run(self, job_id: str, *, max_attempts: int = 3) -> dict[str, Any]:
        item = self.get(job_id)
        if item is None:
            raise KeyError(job_id)
        if item["status"] == "SUCCEEDED":
            return item
        handler = self.handlers.get(item["operation"])
        if handler is None:
            raise KeyError(item["operation"])
        while item["attempts"] < max_attempts and item["status"] != "SUCCEEDED":
            item = dict(item)
            item["attempts"] += 1
            try:
                item["result"] = handler(dict(item["payload"]))
                item["status"] = "SUCCEEDED"
                item["error"] = None
            except Exception as exc:
                item["status"] = "FAILED"
                item["error"] = f"{type(exc).__name__}: {exc}"
            self._persist(item)
        return item

    def get(self, job_id: str) -> dict[str, Any] | None:
        record = self.store.latest_record("PLATFORM", "JOB_RUN", job_id)
        return record["payload"] if record else None

    def _persist(self, item: dict[str, Any]) -> None:
        self.store.append_record(
            domain="PLATFORM", record_type="JOB_RUN", entity_key=item["job_id"],
            payload=item, observed_at=datetime.now(UTC),
            evidence_class="DERIVED", validation_state=item["status"],
        )
        if hasattr(self.store, "upsert_job_run"):
            self.store.upsert_job_run(
                job_key=item["operation"], idempotency_key=item["idempotency_key"],
                status=item["status"], attempts=item["attempts"], payload=item,
            )
