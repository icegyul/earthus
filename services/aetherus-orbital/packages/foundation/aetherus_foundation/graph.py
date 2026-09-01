from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from uuid import UUID

from aetherus_domain import ArchiveIndex, TypedRelation
from .storage import LocalFoundationRepository


class SpaceKnowledgeGraphArchiveEngine:
    id = "E07"
    version = "0.2.0"

    def __init__(self, repository: LocalFoundationRepository):
        self.repository = repository

    def add_relation(
        self,
        *,
        subject_id: str,
        relation_type: str,
        object_id: str,
        provenance_evidence_id: UUID | None,
        valid_from: datetime | None = None,
        valid_to: datetime | None = None,
        uncertainty_reason: str | None = None,
        metadata: dict | None = None,
    ) -> TypedRelation:
        if provenance_evidence_id is None:
            raise ValueError("typed relation requires provenance evidence")
        if self.repository.get_evidence(provenance_evidence_id) is None:
            raise ValueError("relation evidence must exist")
        rel = TypedRelation(
            subject_id=subject_id,
            relation_type=relation_type,
            object_id=object_id,
            provenance_evidence_id=provenance_evidence_id,
            valid_from=valid_from,
            valid_to=valid_to,
            uncertainty_reason=uncertainty_reason,
            metadata=metadata or {},
        )
        return self.repository.save_relation(rel)

    @staticmethod
    def _active(rel: TypedRelation, at: datetime | None) -> bool:
        if at is None:
            return True
        if at.tzinfo is None:
            raise ValueError("naive traversal time forbidden")
        at = at.astimezone(timezone.utc)
        if rel.valid_from and at < rel.valid_from:
            return False
        if rel.valid_to and at > rel.valid_to:
            return False
        return True

    def traverse(self, start_id: str, *, at: datetime | None = None, max_depth: int = 8) -> list[TypedRelation]:
        result: list[TypedRelation] = []
        queue = deque([(start_id, 0)])
        visited_nodes = {start_id}
        all_relations = self.repository.all_relations()
        while queue:
            node, depth = queue.popleft()
            if depth >= max_depth:
                continue
            for rel in all_relations:
                if rel.subject_id != node or not self._active(rel, at):
                    continue
                result.append(rel)
                if rel.object_id not in visited_nodes:
                    visited_nodes.add(rel.object_id)
                    queue.append((rel.object_id, depth + 1))
        return result

    def lineage(self, mission_id: str, object_id: str, *, at: datetime | None = None) -> list[TypedRelation]:
        path_relations = self.traverse(mission_id, at=at)
        # Return the smallest prefix that reaches object_id.
        parents: dict[str, TypedRelation] = {}
        for rel in path_relations:
            parents.setdefault(rel.object_id, rel)
        if object_id not in parents:
            return []
        chain: list[TypedRelation] = []
        current = object_id
        while current != mission_id:
            rel = parents.get(current)
            if rel is None:
                return []
            chain.append(rel)
            current = rel.subject_id
        chain.reverse()
        return chain

    def archive(self, object_id: str, *, snapshot_ids: list[UUID], indexed_at: datetime) -> ArchiveIndex:
        if indexed_at.tzinfo is None:
            raise ValueError("naive datetime forbidden")
        rels = [r for r in self.repository.all_relations() if r.subject_id == object_id or r.object_id == object_id]
        index = ArchiveIndex(
            object_id=object_id,
            relation_ids=[r.id for r in rels],
            snapshot_ids=snapshot_ids,
            indexed_at=indexed_at.astimezone(timezone.utc),
        )
        self.repository.save_archive_index(index)
        return index
