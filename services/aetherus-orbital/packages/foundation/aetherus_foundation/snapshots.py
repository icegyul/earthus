from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from aetherus_domain import (
    CanonicalTimeContext,
    DigitalState,
    DigitalStateKind,
    SnapshotManifest,
    StateKind,
    VersionLineage,
    canonical_hash,
    digital_state_hash,
)
from .storage import LocalFoundationRepository


_STATE_KIND_MAP = {
    StateKind.NOW: DigitalStateKind.REALITY,
    StateKind.ARCHIVED_STATE: DigitalStateKind.ARCHIVED,
    StateKind.RECONSTRUCTED_STATE: DigitalStateKind.RECONSTRUCTED,
    StateKind.PREDICTED_MODEL: DigitalStateKind.MODELLED,
    StateKind.SIMULATION: DigitalStateKind.SIMULATION,
    StateKind.COUNTERFACTUAL: DigitalStateKind.COUNTERFACTUAL,
}


class DigitalStateSnapshotEngine:
    id = "E06"
    version = "0.2.0"

    def __init__(self, repository: LocalFoundationRepository):
        self.repository = repository

    def create_state(
        self,
        *,
        entity_id: UUID | str,
        time_context: CanonicalTimeContext,
        representation: str,
        payload: dict,
        evidence_ids: list[UUID],
        frame: str | None = None,
        created_at: datetime,
    ) -> DigitalState:
        if created_at.tzinfo is None:
            raise ValueError("naive datetime forbidden")
        state_kind = _STATE_KIND_MAP[time_context.mode]
        digest = digital_state_hash(
            entity_id=str(entity_id),
            state_time=time_context.cursor_utc,
            state_kind=state_kind,
            representation=representation,
            frame=frame,
            payload=payload,
            source_evidence_ids=evidence_ids,
        )
        state = DigitalState(
            entity_id=str(entity_id),
            state_time=time_context.cursor_utc,
            state_kind=state_kind,
            representation=representation,
            frame=frame,
            source_evidence_ids=evidence_ids,
            state_hash=digest,
            payload=payload,
        )
        return self.repository.save_digital_state(state)

    def create_snapshot(
        self,
        *,
        states: list[DigitalState],
        time_context: CanonicalTimeContext,
        evidence_ids: list[UUID],
        created_at: datetime,
        baseline: bool = False,
        parent_snapshot_id: UUID | None = None,
        revision_reason: str | None = None,
    ) -> tuple[SnapshotManifest, VersionLineage]:
        if not states:
            raise ValueError("snapshot requires at least one state")
        if created_at.tzinfo is None:
            raise ValueError("naive datetime forbidden")
        digest = canonical_hash({
            "state_hashes": sorted(s.state_hash for s in states),
            "time_context": time_context.model_dump(mode="json"),
            "evidence_ids": sorted(str(v) for v in evidence_ids),
            "baseline": baseline,
        })
        snap = SnapshotManifest(
            snapshot_hash=digest,
            state_ids=[s.id for s in states],
            time_context=time_context,
            evidence_ids=evidence_ids,
            created_at=created_at.astimezone(timezone.utc),
            baseline=baseline,
        )
        stored = self.repository.save_snapshot(snap)
        return stored, VersionLineage(snapshot_id=stored.id, parent_snapshot_id=parent_snapshot_id, revision_reason=revision_reason)

    def assert_immutable(self, snapshot_id: UUID, proposed_state_ids: list[UUID]) -> None:
        snap = self.repository.get_snapshot(snapshot_id)
        if snap is None:
            raise KeyError(snapshot_id)
        if snap.state_ids != proposed_state_ids:
            raise PermissionError("snapshot manifests are append-only and immutable")
