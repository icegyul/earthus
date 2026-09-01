from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from aetherus_domain import (
    DataSourcePolicy,
    DataStatus,
    IngestionRun,
    IngestionStatus,
    QuarantinedRecord,
    RawArtifact,
    canonical_hash,
)
from .storage import LocalFoundationRepository

_SECRET_KEYS = {
    "authorization", "proxy-authorization", "x-api-key", "api_key", "apikey", "token",
    "access_token", "refresh_token", "secret", "client_secret", "password", "key",
}
_BEARER_RE = re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+\-/=]+")


def retry_delay_seconds(attempt: int, retry_after_seconds: float | None = None, *, base: float = 1.0, cap: float = 60.0) -> float:
    """Deterministic HTTP 429 backoff policy. Network clients may add jitter outside this pure function."""
    if attempt < 0:
        raise ValueError("attempt must be >= 0")
    if retry_after_seconds is not None:
        if retry_after_seconds < 0:
            raise ValueError("Retry-After cannot be negative")
        return min(float(retry_after_seconds), cap)
    return min(base * (2 ** attempt), cap)


def redact_secret(value: Any) -> Any:
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            if str(key).lower() in _SECRET_KEYS:
                out[key] = "[REDACTED]"
            else:
                out[key] = redact_secret(item)
        return out
    if isinstance(value, list):
        return [redact_secret(v) for v in value]
    if isinstance(value, tuple):
        return tuple(redact_secret(v) for v in value)
    if isinstance(value, str):
        return _BEARER_RE.sub(lambda m: f"{m.group(1)} [REDACTED]", value)
    return value


def redact_url(url: str | None) -> str | None:
    if not url:
        return url
    parts = urlsplit(url)
    query = []
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        query.append((key, "[REDACTED]" if key.lower() in _SECRET_KEYS else value))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


class SourceIngestionEngine:
    id = "E01"
    version = "0.2.0"

    def __init__(self, repository: LocalFoundationRepository, raw_root: str | Path):
        self.repository = repository
        self.raw_root = Path(raw_root)
        self.raw_root.mkdir(parents=True, exist_ok=True)

    def ingest_bytes(
        self,
        source: DataSourcePolicy,
        content: bytes,
        *,
        retrieved_at: datetime,
        observed_at: datetime | None = None,
        source_uri: str | None = None,
        media_type: str = "application/octet-stream",
        metadata: dict[str, Any] | None = None,
        request_metadata: dict[str, Any] | None = None,
    ) -> tuple[RawArtifact, IngestionRun]:
        if retrieved_at.tzinfo is None or (observed_at is not None and observed_at.tzinfo is None):
            raise ValueError("naive datetime forbidden")
        self.repository.save_data_source(source)
        now = retrieved_at.astimezone(timezone.utc)
        request_metadata = redact_secret(request_metadata or {})
        request_fingerprint = canonical_hash(request_metadata) if request_metadata else None
        run = IngestionRun(source_id=source.id, started_at=now, request_fingerprint=request_fingerprint)
        self.repository.save_ingestion_run(run)

        digest = sha256(content).hexdigest()
        existing = self.repository.find_raw_by_hash(source.id, digest)
        if existing is not None:
            run.status = IngestionStatus.SUCCEEDED
            run.finished_at = now
            run.record_count = 0
            self.repository.save_ingestion_run(run)
            return existing, run

        source_dir = self.raw_root / source.id
        source_dir.mkdir(parents=True, exist_ok=True)
        raw_path = source_dir / digest
        if not raw_path.exists():
            raw_path.write_bytes(content)
        artifact = RawArtifact(
            source_id=source.id,
            ingestion_run_id=run.id,
            retrieved_at=now,
            observed_at=observed_at.astimezone(timezone.utc) if observed_at else None,
            source_uri=redact_url(source_uri),
            media_type=media_type,
            content_sha256=digest,
            object_uri=str(raw_path),
            metadata=redact_secret(metadata or {}),
        )
        artifact = self.repository.save_raw_artifact(artifact)
        run.status = IngestionStatus.SUCCEEDED
        run.finished_at = now
        run.record_count = 1
        self.repository.save_ingestion_run(run)
        return artifact, run

    def ingest_json_records(
        self,
        source: DataSourcePolicy,
        content: bytes,
        *,
        retrieved_at: datetime,
        required_fields: set[str],
        records_key: str = "records",
        observed_at: datetime | None = None,
        source_uri: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[RawArtifact, IngestionRun, list[dict[str, Any]]]:
        artifact, run = self.ingest_bytes(
            source,
            content,
            retrieved_at=retrieved_at,
            observed_at=observed_at,
            source_uri=source_uri,
            media_type="application/json",
            metadata=metadata,
        )
        try:
            payload = json.loads(content)
        except json.JSONDecodeError as exc:
            q = QuarantinedRecord(
                source_id=source.id,
                raw_artifact_id=artifact.id,
                record_index=0,
                reason=f"JSON_DECODE_ERROR:{exc.msg}",
                payload_hash=sha256(content).hexdigest(),
                created_at=retrieved_at.astimezone(timezone.utc),
            )
            self.repository.save_quarantine(q)
            run.status = IngestionStatus.FAILED
            run.record_count = 0
            run.error = {"code": "JSON_DECODE_ERROR", "message": exc.msg}
            self.repository.save_ingestion_run(run)
            return artifact, run, []

        records = payload.get(records_key) if isinstance(payload, dict) else payload
        if not isinstance(records, list):
            records = [records]
        valid: list[dict[str, Any]] = []
        for idx, record in enumerate(records):
            if not isinstance(record, dict) or any(field not in record or record[field] in (None, "") for field in required_fields):
                q = QuarantinedRecord(
                    source_id=source.id,
                    raw_artifact_id=artifact.id,
                    record_index=idx,
                    reason="MISSING_REQUIRED_FIELDS",
                    payload_hash=canonical_hash(record),
                    created_at=retrieved_at.astimezone(timezone.utc),
                )
                self.repository.save_quarantine(q)
                continue
            valid.append(record)

        quarantined = self.repository.quarantine_count(artifact.id)
        run.record_count = len(valid)
        if quarantined and valid:
            run.status = IngestionStatus.PARTIAL
        elif quarantined and not valid:
            run.status = IngestionStatus.FAILED
        else:
            run.status = IngestionStatus.SUCCEEDED
        self.repository.save_ingestion_run(run)
        return artifact, run, valid

    def source_status(self, source: DataSourcePolicy, *, now: datetime, current_request_ok: bool) -> DataStatus:
        if now.tzinfo is None:
            raise ValueError("naive datetime forbidden")
        latest = self.repository.latest_raw(source.id)
        if current_request_ok:
            if latest is None:
                return DataStatus.UNAVAILABLE
            age = (now.astimezone(timezone.utc) - latest.retrieved_at).total_seconds()
            return DataStatus.OK if age <= source.stale_after_seconds else DataStatus.STALE
        if latest is None:
            return DataStatus.UNAVAILABLE
        return DataStatus.STALE
