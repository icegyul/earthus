"""Tests for immutable preservation of provider response bytes."""

import hashlib
import json
from datetime import datetime
from pathlib import Path

from backend.ingestion.storage import RawArtifactStore

FIXTURE_DIR = Path(__file__).parents[1] / "fixtures" / "celestrak"
RAW_FIXTURE = FIXTURE_DIR / "iss-25544-2026-08-23.json"
PROVENANCE_FIXTURE = FIXTURE_DIR / "iss-25544-2026-08-23.provenance.json"


def test_preserves_recorded_provider_bytes_by_content_hash(tmp_path: Path) -> None:
    """The stored artifact is byte-identical and addressed by its SHA-256 digest."""
    raw = RAW_FIXTURE.read_bytes()
    provenance = json.loads(PROVENANCE_FIXTURE.read_text())
    store = RawArtifactStore(tmp_path)

    artifact = store.preserve(
        source_id=provenance["source_id"],
        retrieved_at=datetime.fromisoformat(provenance["retrieved_at"]),
        content=raw,
        media_type=provenance["media_type"],
    )

    assert artifact.content_sha256 == hashlib.sha256(raw).hexdigest()
    assert artifact.content_sha256 == provenance["content_sha256"]
    assert artifact.path.read_bytes() == raw
    assert artifact.object_uri.endswith(f"/{artifact.content_sha256}.json")


def test_duplicate_snapshot_reuses_the_same_immutable_artifact(tmp_path: Path) -> None:
    """An unchanged source response must not be destructively overwritten."""
    raw = RAW_FIXTURE.read_bytes()
    store = RawArtifactStore(tmp_path)
    retrieved_at = datetime.fromisoformat("2026-08-24T12:40:40+00:00")

    first = store.preserve("celestrak_gp", retrieved_at, raw, "application/json")
    second = store.preserve("celestrak_gp", retrieved_at, raw, "application/json")

    assert first.path == second.path
    assert second.created is False
