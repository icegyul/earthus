from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

PHASE_NAMES = {
    "P6": "PROTECT / OCM",
    "P7": "Genealogy / Visual",
    "P8": "Fragmentation",
    "P9": "Observation Intelligence",
    "P10": "Research Datasets",
    "P11": "Operations",
    "P12": "Production Hardening",
}


def _canonical(payload: Any) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def build_phase_manifest(*, phases: dict[str, dict[str, Any]], source_commit: str) -> dict[str, Any]:
    if set(phases) != set(PHASE_NAMES):
        raise ValueError("phase manifest must contain P6-P12 exactly")
    for phase, item in phases.items():
        if item.get("status") != "PASSED" or not item.get("tests") or not item.get("runtime_evidence") or not item.get("gates"):
            raise ValueError(f"{phase} executable evidence is incomplete")
    payload = {
        "schema": "aetherus.phase-evidence.v1",
        "source_commit": source_commit,
        "phases": phases,
    }
    return {**payload, "manifest_hash": hashlib.sha256(_canonical(payload)).hexdigest()}


def load_phase_manifest(path: str | Path | None = None) -> dict[str, Any] | None:
    raw_path: str | Path = path if path is not None else os.environ.get("AETHERUS_PHASE_EVIDENCE_PATH", "")
    if not raw_path:
        return None
    candidate = Path(raw_path)
    if not candidate.is_file():
        return None
    try:
        manifest: dict[str, Any] = json.loads(candidate.read_text(encoding="utf-8"))
        payload = {key: value for key, value in manifest.items() if key != "manifest_hash"}
        expected = hashlib.sha256(_canonical(payload)).hexdigest()
        if not hmac_compare(str(manifest.get("manifest_hash") or ""), expected):
            return None
        if manifest.get("schema") != "aetherus.phase-evidence.v1" or set(manifest.get("phases", {})) != set(PHASE_NAMES):
            return None
        for item in manifest["phases"].values():
            if item.get("status") != "PASSED" or not item.get("tests") or not item.get("runtime_evidence") or not item.get("gates"):
                return None
        return dict(manifest)
    except (OSError, ValueError, json.JSONDecodeError):
        return None


def hmac_compare(left: str, right: str) -> bool:
    import hmac

    return hmac.compare_digest(left, right)
