from __future__ import annotations

import csv
import hashlib
import io
import json
from dataclasses import dataclass
from typing import Any


def _canonical_bytes(payload: Any) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


@dataclass(frozen=True)
class DatasetArtifact:
    manifest: dict[str, Any]
    json_bytes: bytes
    csv_bytes: bytes


class ResearchDatasetBuilder:
    id = "S07"

    csv_fields = (
        "id", "domain", "record_type", "entity_key", "version", "observed_at",
        "evidence_class", "validation_state", "payload_hash", "payload_json",
    )

    def build(
        self,
        *,
        dataset_key: str,
        version: str,
        records: list[dict[str, Any]],
        license_policy: str,
    ) -> DatasetArtifact:
        if not dataset_key.strip() or not version.strip():
            raise ValueError("dataset_key and version are required")
        if not license_policy.strip():
            raise ValueError("license_policy is required")
        if not records:
            raise ValueError("source dataset is empty")
        ordered = sorted(
            records,
            key=lambda item: (
                str(item.get("domain") or ""), str(item.get("record_type") or ""),
                str(item.get("entity_key") or ""), int(item.get("version") or 0),
            ),
        )
        json_payload = {"dataset_key": dataset_key, "version": version, "records": ordered}
        json_bytes = _canonical_bytes(json_payload)

        stream = io.StringIO(newline="")
        writer = csv.DictWriter(stream, fieldnames=self.csv_fields, lineterminator="\n")
        writer.writeheader()
        for record in ordered:
            writer.writerow(
                {
                    "id": record.get("id", ""),
                    "domain": record.get("domain", ""),
                    "record_type": record.get("record_type", ""),
                    "entity_key": record.get("entity_key", ""),
                    "version": record.get("version", ""),
                    "observed_at": record.get("observed_at", ""),
                    "evidence_class": record.get("evidence_class") or "",
                    "validation_state": record.get("validation_state") or "",
                    "payload_hash": record.get("payload_hash", ""),
                    "payload_json": json.dumps(record.get("payload"), sort_keys=True, separators=(",", ":"), ensure_ascii=False),
                }
            )
        csv_bytes = stream.getvalue().encode("utf-8")
        json_hash = hashlib.sha256(json_bytes).hexdigest()
        csv_hash = hashlib.sha256(csv_bytes).hexdigest()
        source_hashes = sorted(str(record.get("payload_hash") or "") for record in ordered)
        dataset_hash = hashlib.sha256(_canonical_bytes({"json": json_hash, "csv": csv_hash, "sources": source_hashes})).hexdigest()
        manifest = {
            "dataset_key": dataset_key,
            "version": version,
            "record_count": len(ordered),
            "dataset_hash": dataset_hash,
            "license_policy": license_policy,
            "source_record_hashes": source_hashes,
            "schema": {"csv_columns": list(self.csv_fields), "json": "aetherus.research-dataset.v1"},
            "files": {
                "json": {"bytes": len(json_bytes), "sha256": json_hash, "media_type": "application/json"},
                "csv": {"bytes": len(csv_bytes), "sha256": csv_hash, "media_type": "text/csv; charset=utf-8"},
            },
            "reproducibility": "SORTED_SOURCE_RECORDS_AND_CANONICAL_JSON",
        }
        return DatasetArtifact(manifest=manifest, json_bytes=json_bytes, csv_bytes=csv_bytes)

    def reproduce(self, artifact: DatasetArtifact) -> bool:
        return (
            hashlib.sha256(artifact.json_bytes).hexdigest() == artifact.manifest["files"]["json"]["sha256"]
            and hashlib.sha256(artifact.csv_bytes).hexdigest() == artifact.manifest["files"]["csv"]["sha256"]
        )
