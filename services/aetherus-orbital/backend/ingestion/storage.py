"""Immutable local object storage for raw provider artifacts."""

import hashlib
from datetime import datetime
from pathlib import Path

from backend.ingestion.models import StoredRawArtifact

_MEDIA_EXTENSIONS = {
    "application/json": ".json",
    "application/xml": ".xml",
    "text/plain": ".txt",
}


class RawArtifactStore:
    """Content-address raw artifacts and never overwrite an existing snapshot."""

    def __init__(self, root: Path) -> None:
        self.root = root

    def preserve(
        self,
        source_id: str,
        retrieved_at: datetime,
        content: bytes,
        media_type: str,
    ) -> StoredRawArtifact:
        """Write source bytes once and return their stable content address."""
        del retrieved_at
        if not source_id or any(
            char not in "abcdefghijklmnopqrstuvwxyz0123456789_-" for char in source_id
        ):
            raise ValueError("source_id must be a stable lowercase storage key")
        content_sha256 = hashlib.sha256(content).hexdigest()
        extension = _MEDIA_EXTENSIONS.get(media_type.lower(), ".bin")
        path = self.root / source_id / f"{content_sha256}{extension}"
        path.parent.mkdir(parents=True, exist_ok=True)
        created = False
        try:
            with path.open("xb") as artifact:
                artifact.write(content)
            created = True
        except FileExistsError as error:
            existing_hash = hashlib.sha256(path.read_bytes()).hexdigest()
            if existing_hash != content_sha256:
                raise RuntimeError(
                    "Existing raw artifact does not match its content-addressed name"
                ) from error
        return StoredRawArtifact(
            content_sha256=content_sha256,
            path=path,
            object_uri=f"file://{path.as_posix()}",
            created=created,
        )

    def load_verified(
        self, source_id: str, content_sha256: str, media_type: str
    ) -> tuple[StoredRawArtifact, bytes]:
        """Read one content-addressed snapshot only after verifying its immutable hash."""
        if not source_id or any(
            char not in "abcdefghijklmnopqrstuvwxyz0123456789_-" for char in source_id
        ):
            raise ValueError("source_id must be a stable lowercase storage key")
        if len(content_sha256) != 64 or any(char not in "0123456789abcdef" for char in content_sha256):
            raise ValueError("content_sha256 must be a lowercase SHA-256 digest")
        extension = _MEDIA_EXTENSIONS.get(media_type.lower(), ".bin")
        path = self.root / source_id / f"{content_sha256}{extension}"
        try:
            content = path.read_bytes()
        except FileNotFoundError as error:
            raise FileNotFoundError("Immutable raw snapshot is unavailable in local storage") from error
        if hashlib.sha256(content).hexdigest() != content_sha256:
            raise RuntimeError("Immutable raw snapshot content does not match its SHA-256 address")
        return (
            StoredRawArtifact(
                content_sha256=content_sha256,
                path=path,
                object_uri=f"file://{path.as_posix()}",
                created=False,
            ),
            content,
        )
