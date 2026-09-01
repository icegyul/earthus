from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from aetherus_domain import (
    DataSourcePolicy,
    EvidenceClass,
    SignalRecord,
    SourceGrade,
    StateKind,
)
from aetherus_intelligence.orchestrator import IntelligenceOrchestrator
from aetherus_intelligence.packet import IntelligencePacketBuilder

from .graph import SpaceKnowledgeGraphArchiveEngine
from .identity import CanonicalObjectIdentityEngine
from .ingestion import SourceIngestionEngine
from .provenance import EvidenceProvenanceEngine
from .snapshots import DigitalStateSnapshotEngine
from .storage import LocalFoundationRepository
from .time_engine import UniversalSpaceTimeEngine


class FoundationE2EPipeline:
    """First integrated E01-E07 -> Intelligence -> API persistence path.

    The included Apollo 11 signal is a fixed-official-fixture adapter used only for
    integration evidence. It does NOT claim that production E13 launch ingestion is implemented.
    """

    version = "0.2.0"

    def __init__(self, repository: LocalFoundationRepository, raw_root: str | Path):
        self.repo = repository
        self.ingestion = SourceIngestionEngine(repository, raw_root)
        self.identity = CanonicalObjectIdentityEngine(repository)
        self.provenance = EvidenceProvenanceEngine(repository)
        self.time = UniversalSpaceTimeEngine()
        self.snapshots = DigitalStateSnapshotEngine(repository)
        self.graph = SpaceKnowledgeGraphArchiveEngine(repository)
        self.intelligence = IntelligenceOrchestrator(store=repository)
        self.packets = IntelligencePacketBuilder()

    def run_fixed_official_apollo11_fixture(self, fixture_path: str | Path, *, retrieved_at: datetime) -> dict[str, Any]:
        path = Path(fixture_path)
        raw = path.read_bytes()
        fixture = json.loads(raw)
        source_meta = fixture["source"]
        record = fixture["record"]
        source = DataSourcePolicy(
            id=source_meta["source_id"],
            name=source_meta["provider"] + " Apollo 11 Mission Overview",
            source_grade=SourceGrade(source_meta["source_grade"]),
            license_policy=source_meta["license_policy"],
            access_policy=source_meta["access_policy"],
            stale_after_seconds=365 * 86400,
        )
        launch_time = datetime.fromisoformat(record["launch_local"]).astimezone(timezone.utc)

        artifact, run = self.ingestion.ingest_bytes(
            source,
            raw,
            retrieved_at=retrieved_at,
            observed_at=launch_time,
            source_uri=source_meta["source_uri"],
            media_type="application/json",
            metadata={
                "fixture_class": fixture["fixture_class"],
                "fixture_id": fixture["fixture_id"],
                "capture_method": fixture["capture_method"],
            },
        )

        vehicle, conflict = self.identity.register_provider_record(
            source_id=source.id,
            source_key="APOLLO11:SATURNV:AS-506",
            entity_type="LAUNCH_VEHICLE",
            canonical_name=record["vehicle_name"],
            catalog_id="AS-506",
            cospar_id=None,
            origin=None,
            metadata={"mission_id": record["mission_id"]},
            now=retrieved_at,
        )
        if conflict:
            raise RuntimeError("official fixture identity conflict")

        bundle = self.provenance.evidence_from_raw(
            artifact,
            source,
            evidence_class=EvidenceClass.OFFICIAL,
            observed_at=launch_time,
            source_record_id=fixture["fixture_id"],
            quality=1.0,
            metadata={"mission_id": record["mission_id"], "fact_kind": "historical_launch_record"},
        )

        time_context = self.time.resolve_local(
            datetime.fromisoformat(record["launch_local"]),
            "America/New_York",
            mode=StateKind.ARCHIVED_STATE,
            archived_snapshot_id=fixture["fixture_id"],
        )
        state = self.snapshots.create_state(
            entity_id=vehicle.id,
            time_context=time_context,
            representation="OFFICIAL_HISTORICAL_LAUNCH_STATE",
            payload={
                "mission_id": record["mission_id"],
                "mission_name": record["mission_name"],
                "vehicle_name": record["vehicle_name"],
                "launch_site": record["launch_site"],
                "launch_time_utc": launch_time.isoformat(),
                "status": "LAUNCHED",
            },
            evidence_ids=[bundle.evidence.id],
            frame=None,
            created_at=retrieved_at,
        )
        snapshot, _ = self.snapshots.create_snapshot(
            states=[state],
            time_context=time_context,
            evidence_ids=[bundle.evidence.id],
            created_at=retrieved_at,
            baseline=True,
        )
        relation = self.graph.add_relation(
            subject_id=f"MISSION:{record['mission_id']}",
            relation_type="USES_VEHICLE",
            object_id=f"OBJECT:{vehicle.id}",
            provenance_evidence_id=bundle.evidence.id,
            valid_from=launch_time,
            metadata={"snapshot_id": str(snapshot.id)},
        )
        self.graph.archive(f"OBJECT:{vehicle.id}", snapshot_ids=[snapshot.id], indexed_at=retrieved_at)

        signal = SignalRecord(
            signal_type="OFFICIAL_LAUNCH_FACT",
            evidence_class=EvidenceClass.OFFICIAL,
            producer_module_id="E13_FIXED_OFFICIAL_FIXTURE_ADAPTER",
            observed_at=launch_time,
            object_ids=[str(vehicle.id)],
            mission_id=record["mission_id"],
            event_hint=record["event_type"],
            significance=1.0,
            evidence_ids=[bundle.evidence.id],
            payload={
                "mission_name": record["mission_name"],
                "vehicle_name": record["vehicle_name"],
                "launch_site": record["launch_site"],
                "launch_time_utc": launch_time.isoformat(),
                "validation_state": "VALIDATION_PENDING",
                "correlation_bucket": record["mission_id"],
                "fixture_only": True,
            },
        )
        self.repo.save_signal(signal)
        result = self.intelligence.ingest_signal(signal)
        if result is None:
            raise RuntimeError("official evidence-backed signal unexpectedly rejected")
        event, revision = result
        packet = self.packets.build(
            event=event,
            revision=revision,
            evidence=[bundle.evidence],
            what_happened=[f"{record['mission_name']} launch is recorded by the fixed NASA official fixture."],
            what_changed=["The historical launch fact entered the executable Aetherus Foundation state and event lineage."],
            why_it_matters=["This proves the first evidence-backed Mission-to-Intelligence integration path without inventing telemetry or risk metrics."],
            known_limitations=[
                "The source is a fixed official regression fixture, not a live NASA provider fetch.",
                "E13 production Mission/Launch engine is not implemented by this adapter.",
                "No telemetry, trajectory, orbit insertion, or risk calculation is inferred from the fixture.",
                "Independent second-source cross-validation is not connected in this Foundation slice.",
            ],
            allowed_claims=[
                "NASA's official Apollo 11 overview records the launch on July 16, 1969 at 9:32 a.m. EDT from Launch Pad 39A using Saturn-V AS-506.",
                "The Aetherus local Foundation pipeline preserved raw fixture bytes, provenance, immutable state, graph relation, event, revision, and packet in its local acceptance database.",
            ],
            prohibited_claims=[
                "This proves live NASA provider integration.",
                "This proves E13 production runtime completion.",
                "This fixture contains live telemetry or a modeled trajectory.",
            ],
        )
        self.repo.save_packet(packet)
        return {
            "source": source,
            "artifact": artifact,
            "ingestion_run": run,
            "vehicle": vehicle,
            "evidence": bundle.evidence,
            "provenance": bundle,
            "time_context": time_context,
            "state": state,
            "snapshot": snapshot,
            "relation": relation,
            "signal": signal,
            "event": event,
            "revision": revision,
            "packet": packet,
            "counts": self.repo.counts(),
        }
