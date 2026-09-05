"""Evidence package writer: every file hashed into manifest.json with an unbroken lineage chain."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")
    path.write_bytes(data)
    return hashlib.sha256(data).hexdigest()


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class EvidencePackage:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.files = {}

    def put(self, name, value):
        self.files[name] = write_json(self.directory / name, value)
        return self.files[name]

    def copy(self, name, source):
        data = Path(source).read_bytes()
        (self.directory / name).write_bytes(data)
        self.files[name] = hashlib.sha256(data).hexdigest()
        return self.files[name]

    def manifest(self, lineage, external):
        """lineage: ordered question → plan → data → model → run → result → verdict; external: hashes of inputs outside the package."""
        manifest = {"schemaVersion": "1.0", "createdAtUTC": utc_now(), "package": self.directory.name,
                    "files": dict(sorted(self.files.items())), "externalInputs": external, "lineage": lineage,
                    "note": "Copy the whole directory; every claim in verdict.json resolves to a hashed file here or to an externalInputs hash."}
        write_json(self.directory / "manifest.json", manifest)
        return manifest
