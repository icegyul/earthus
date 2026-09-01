from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, NAMESPACE_URL, uuid5

from aetherus_domain import (
    DataSourcePolicy,
    EvidenceClass,
    EvidenceRecord,
    ProvenanceBundle,
    ProvenanceLink,
    RawArtifact,
    canonical_hash,
)
from .storage import LocalFoundationRepository


class EvidenceProvenanceEngine:
    id = "E03"
    version = "0.2.0"

    def __init__(self, repository: LocalFoundationRepository):
        self.repository = repository

    def evidence_from_raw(
        self,
        artifact: RawArtifact,
        source: DataSourcePolicy,
        *,
        evidence_class: EvidenceClass,
        observed_at: datetime | None = None,
        source_record_id: str | None = None,
        quality: float | None = None,
        coordinate_frame: str | None = None,
        metadata: dict | None = None,
    ) -> ProvenanceBundle:
        if not artifact.source_id or artifact.source_id != source.id:
            raise ValueError("artifact source must resolve to registered source")
        obs = observed_at or artifact.observed_at or artifact.retrieved_at
        if obs.tzinfo is None:
            raise ValueError("naive datetime forbidden")
        evidence = EvidenceRecord(
            evidence_class=evidence_class,
            source_id=source.id,
            source_record_id=source_record_id,
            observed_at=obs.astimezone(timezone.utc),
            received_at=artifact.retrieved_at,
            checksum_sha256=artifact.content_sha256,
            source_grade=source.source_grade,
            quality=quality,
            coordinate_frame=coordinate_frame,
            license_policy=source.license_policy,
            access_policy=source.access_policy,
            metadata={"raw_artifact_id": str(artifact.id), **(metadata or {})},
        )
        link = ProvenanceLink(
            parent_type="RAW_ARTIFACT",
            parent_id=str(artifact.id),
            relation="DERIVED_FROM",
            parent_hash=artifact.content_sha256,
        )
        digest = self._bundle_hash(evidence, [link], engine_id=self.id, engine_version=self.version)
        evidence.id = uuid5(NAMESPACE_URL, f"aetherus:evidence:{digest}")
        bundle = ProvenanceBundle(
            evidence=evidence,
            links=[link],
            engine_id=self.id,
            engine_version=self.version,
            provenance_hash=digest,
            created_at=artifact.retrieved_at,
        )
        self.repository.save_evidence(evidence)
        return self.repository.save_provenance(bundle)

    @staticmethod
    def _bundle_hash(evidence: EvidenceRecord, links: list[ProvenanceLink], *, engine_id: str | None, engine_version: str | None) -> str:
        # Exclude generated Evidence UUID: reproducibility must depend on factual lineage, not random identity.
        core = evidence.model_dump(mode="json", exclude={"id"})
        return canonical_hash({
            "evidence": core,
            "links": sorted((l.model_dump(mode="json") for l in links), key=lambda x: (x["parent_type"], x["parent_id"], x["relation"])),
            "engine_id": engine_id,
            "engine_version": engine_version,
        })
