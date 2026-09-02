"""Real screening candidates become Intelligence Events, and only when they should.

The pieces of this path all existed and nothing called them. The adapter built
SignalRecords inside the read handler for ``/v1/intelligence/signals``, they were
merged into the response and thrown away, and the event store kept one fixture
launch. Two hundred live conjunction candidates reached nothing, so the P10 gate
"WHAT CHANGED / HOW SURE end to end" had no change to show.

These tests hold the promotion path and, more importantly, hold the two ways it
could lie: by creating history on a repeat run, and by dropping a refused signal
without saying so.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient

from aetherus_domain.models import (
    EvidenceClass,
    EvidenceRecord,
    SignalRecord,
    SourceGrade,
    ValidationState,
)
from aetherus_integration.conjunction_promotion import (
    REFUSED_BY_GATE,
    REFUSED_EVIDENCE_UNRESOLVABLE,
    promote_conjunction_signals,
)
from aetherus_intelligence.orchestrator import IntelligenceOrchestrator

pytestmark = pytest.mark.integration


@dataclass
class _Bundle:
    signals: list[SignalRecord]
    evidence: list[EvidenceRecord]
    data_status: str = "OK"
    status_reason: str | None = None
    warnings: list[str] = field(default_factory=list)
    skipped: list[dict[str, Any]] = field(default_factory=list)
    provenance: dict[str, Any] = field(default_factory=dict)
    request_id: str = "req-test"
    generated_at: str = "2026-09-03T00:00:00+00:00"


class _Repo:
    """The store surface the orchestrator and the promoter share."""

    def __init__(self):
        self.evidence: dict[UUID, EvidenceRecord] = {}
        self.signals: dict[UUID, SignalRecord] = {}
        self.events_by_key: dict[str, Any] = {}
        self.revisions: dict[str, list[Any]] = {}

    def save_evidence(self, record): self.evidence[record.id] = record
    def get_evidence(self, evidence_id):
        key = evidence_id if isinstance(evidence_id, UUID) else UUID(str(evidence_id))
        return self.evidence.get(key)
    def save_signal(self, signal): self.signals[signal.id] = signal
    def get_event_by_key(self, key): return self.events_by_key.get(key)
    def save_event(self, event): self.events_by_key[event.canonical_key] = event
    def append_revision(self, revision):
        self.revisions.setdefault(str(revision.event_id), []).append(revision)
    def revisions_for(self, event_id): return list(self.revisions.get(str(event_id), []))


def _evidence() -> EvidenceRecord:
    now = datetime.now(UTC)
    return EvidenceRecord(
        evidence_class=EvidenceClass.DERIVED,
        source_id="P4_SCREENING",
        source_grade=SourceGrade.OFFICIAL_PUBLIC,
        observed_at=now,
        received_at=now,
        checksum_sha256="0" * 64,
        metadata={"source_uri": "https://example.invalid/screening"},
    )


def _signal(evidence: EvidenceRecord, *, bucket: str, miss_distance: float) -> SignalRecord:
    return SignalRecord(
        signal_type="CONJUNCTION_SCREENING_CANDIDATE",
        evidence_class=EvidenceClass.DERIVED,
        producer_module_id="P4_CA_SCREENING_ADAPTER",
        observed_at=datetime.now(UTC),
        object_ids=["OBJ-A", "OBJ-B"],
        event_hint="CONJUNCTION_SCREENING_CANDIDATE",
        metric_type="MISS_DISTANCE",
        value=miss_distance,
        units="m",
        significance=None,
        evidence_ids=[evidence.id],
        payload={
            "correlation_bucket": bucket,
            "validation_state": "SCREENING_ONLY",
            "miss_distance_m": miss_distance,
            "pc_status": "NOT_COMPUTED",
        },
    )


async def _source(bundle: _Bundle):
    async def _call(*, limit: int = 200):
        return bundle

    return _call


class TestPromotionCreatesEventsFromRealSignals:
    async def test_a_screening_candidate_becomes_an_event(self):
        evidence = _evidence()
        bundle = _Bundle(signals=[_signal(evidence, bucket="P4-EVENT-1", miss_distance=4772.0)],
                         evidence=[evidence])
        repo = _Repo()
        outcome = await promote_conjunction_signals(
            signal_source=await _source(bundle), repository=repo,
            orchestrator=IntelligenceOrchestrator(store=repo),
        )
        assert outcome.created == 1
        assert outcome.revised == 0 and outcome.unchanged == 0
        assert len(repo.events_by_key) == 1

    async def test_the_event_keeps_the_screening_validation_state(self):
        """A screening candidate must not arrive as a validated conclusion."""
        evidence = _evidence()
        bundle = _Bundle(signals=[_signal(evidence, bucket="P4-EVENT-1", miss_distance=4772.0)],
                         evidence=[evidence])
        repo = _Repo()
        await promote_conjunction_signals(
            signal_source=await _source(bundle), repository=repo,
            orchestrator=IntelligenceOrchestrator(store=repo),
        )
        event = next(iter(repo.events_by_key.values()))
        assert event.validation_state == ValidationState.SCREENING_ONLY

    async def test_two_conjunctions_do_not_merge_into_one_event(self):
        """The correlation bucket is P4's event id, not the calendar day."""
        first, second = _evidence(), _evidence()
        bundle = _Bundle(
            signals=[
                _signal(first, bucket="P4-EVENT-1", miss_distance=4772.0),
                _signal(second, bucket="P4-EVENT-2", miss_distance=1200.0),
            ],
            evidence=[first, second],
        )
        repo = _Repo()
        outcome = await promote_conjunction_signals(
            signal_source=await _source(bundle), repository=repo,
            orchestrator=IntelligenceOrchestrator(store=repo),
        )
        assert outcome.created == 2
        assert len(repo.events_by_key) == 2


class TestARepeatRunDoesNotManufactureHistory:
    async def test_promoting_the_same_screening_twice_changes_nothing(self):
        """This is the check that makes a revision mean something."""
        evidence = _evidence()
        signal = _signal(evidence, bucket="P4-EVENT-1", miss_distance=4772.0)
        repo = _Repo()
        orchestrator = IntelligenceOrchestrator(store=repo)

        first = await promote_conjunction_signals(
            signal_source=await _source(_Bundle(signals=[signal], evidence=[evidence])),
            repository=repo, orchestrator=orchestrator,
        )
        second = await promote_conjunction_signals(
            signal_source=await _source(_Bundle(signals=[signal], evidence=[evidence])),
            repository=repo, orchestrator=orchestrator,
        )
        assert first.created == 1
        assert second.created == 0 and second.revised == 0
        assert second.unchanged == 1, "a repeat run must not count as progress"
        event = next(iter(repo.events_by_key.values()))
        assert len(repo.revisions_for(event.id)) == 1

    async def test_a_changed_screening_produces_a_revision(self):
        """WHAT CHANGED: the same conjunction, re-screened to a new distance."""
        evidence = _evidence()
        repo = _Repo()
        orchestrator = IntelligenceOrchestrator(store=repo)

        await promote_conjunction_signals(
            signal_source=await _source(_Bundle(
                signals=[_signal(evidence, bucket="P4-EVENT-1", miss_distance=4772.0)],
                evidence=[evidence])),
            repository=repo, orchestrator=orchestrator,
        )
        outcome = await promote_conjunction_signals(
            signal_source=await _source(_Bundle(
                signals=[_signal(evidence, bucket="P4-EVENT-1", miss_distance=3100.0)],
                evidence=[evidence])),
            repository=repo, orchestrator=orchestrator,
        )
        assert outcome.revised == 1 and outcome.created == 0
        event = next(iter(repo.events_by_key.values()))
        revisions = repo.revisions_for(event.id)
        assert len(revisions) == 2
        delta = revisions[-1].delta
        assert delta["miss_distance_m"]["before"] == 4772.0
        assert delta["miss_distance_m"]["after"] == 3100.0


class TestARevisionMeansTheScreeningMoved:
    """The stored history contains both real change and recomputation noise.

    One pair has four snapshots taken within nine seconds whose miss distances
    differ in the ninth decimal place; 2,468 other conjunctions moved by more
    than a metre, one of them by 23 km. Without a stated rule the two look alike
    in the event lineage.
    """

    async def _promote(self, repo, orchestrator, evidence, **payload):
        signal = _signal(evidence, bucket="P4-EVENT-1", miss_distance=payload.pop("miss_distance"))
        signal.payload.update(payload)
        return await promote_conjunction_signals(
            signal_source=await _source(_Bundle(signals=[signal], evidence=[evidence])),
            repository=repo, orchestrator=orchestrator,
        )

    async def test_recomputation_noise_is_not_a_change(self):
        evidence = _evidence()
        repo = _Repo()
        orchestrator = IntelligenceOrchestrator(store=repo)
        await self._promote(repo, orchestrator, evidence, miss_distance=2368.8409795537696)
        outcome = await self._promote(repo, orchestrator, evidence, miss_distance=2368.840979530972)
        assert outcome.revised == 0
        assert outcome.unchanged == 1, "a ninth-decimal difference was recorded as news"

    async def test_a_metre_of_movement_is_a_change(self):
        evidence = _evidence()
        repo = _Repo()
        orchestrator = IntelligenceOrchestrator(store=repo)
        await self._promote(repo, orchestrator, evidence, miss_distance=2368.0)
        outcome = await self._promote(repo, orchestrator, evidence, miss_distance=2369.5)
        assert outcome.revised == 1

    async def test_a_status_change_is_always_material(self):
        """A probability that became computable is the whole story, at any size."""
        evidence = _evidence()
        repo = _Repo()
        orchestrator = IntelligenceOrchestrator(store=repo)
        await self._promote(repo, orchestrator, evidence, miss_distance=2368.0, pc_status="NOT_COMPUTED")
        outcome = await self._promote(
            repo, orchestrator, evidence, miss_distance=2368.0000001, pc_status="COMPUTED"
        )
        assert outcome.revised == 1

    async def test_looking_again_is_not_a_change(self):
        """A new snapshot id proves we looked, not that anything moved."""
        evidence = _evidence()
        repo = _Repo()
        orchestrator = IntelligenceOrchestrator(store=repo)
        await self._promote(repo, orchestrator, evidence, miss_distance=2368.0, snapshot_id="snap-1")
        outcome = await self._promote(
            repo, orchestrator, evidence, miss_distance=2368.0, snapshot_id="snap-2"
        )
        assert outcome.unchanged == 1 and outcome.revised == 0

    async def test_a_new_screening_run_is_not_a_change(self):
        """The first version of this policy got exactly this wrong.

        It excluded a list of provenance keys and counted everything else, so
        ``config_hash``, ``input_hash`` and ``screening_run_id`` produced 870
        revisions that said only that the screener had run again. Change is now
        decided over the named assessment channels, so a field nobody declared
        an assessment cannot become a reason on its own.
        """
        evidence = _evidence()
        repo = _Repo()
        orchestrator = IntelligenceOrchestrator(store=repo)
        await self._promote(
            repo, orchestrator, evidence, miss_distance=2368.0,
            screening_run_id="run-1", config_hash="c1", input_hash="i1",
        )
        outcome = await self._promote(
            repo, orchestrator, evidence, miss_distance=2368.0,
            screening_run_id="run-2", config_hash="c2", input_hash="i2",
        )
        assert outcome.revised == 0
        assert outcome.unchanged == 1, "re-running the screener was recorded as news"

    async def test_an_undeclared_field_cannot_become_a_reason(self):
        evidence = _evidence()
        repo = _Repo()
        orchestrator = IntelligenceOrchestrator(store=repo)
        await self._promote(repo, orchestrator, evidence, miss_distance=2368.0, some_new_field="a")
        outcome = await self._promote(
            repo, orchestrator, evidence, miss_distance=2368.0, some_new_field="b"
        )
        assert outcome.unchanged == 1

    async def test_the_policy_that_decided_is_reported(self):
        evidence = _evidence()
        repo = _Repo()
        outcome = await self._promote(
            repo, IntelligenceOrchestrator(store=repo), evidence, miss_distance=2368.0
        )
        assert outcome.material_change_policy == "SCREENING_MATERIAL_CHANGE_V1"
        assert outcome.to_payload()["data"]["material_change_policy"]


class TestARefusedSignalIsCountedNotDropped:
    async def test_evidence_missing_from_the_store_is_named(self):
        evidence = _evidence()
        signal = _signal(evidence, bucket="P4-EVENT-1", miss_distance=4772.0)
        # The bundle offers the signal but not its evidence.
        bundle = _Bundle(signals=[signal], evidence=[])
        repo = _Repo()
        outcome = await promote_conjunction_signals(
            signal_source=await _source(bundle), repository=repo,
            orchestrator=IntelligenceOrchestrator(store=repo),
        )
        assert outcome.created == 0
        assert len(outcome.refused) == 1
        assert outcome.refused[0]["reason"] == REFUSED_EVIDENCE_UNRESOLVABLE

    async def test_a_signal_the_gate_declines_is_recorded_with_its_reason(self):
        """A simulated-evidence signal must never enter the event lineage."""
        evidence = _evidence()
        signal = _signal(evidence, bucket="P4-EVENT-1", miss_distance=4772.0)
        refused_signal = signal.model_copy(
            update={"id": uuid4(), "evidence_class": EvidenceClass.SIMULATION_ONLY}
        )
        bundle = _Bundle(signals=[refused_signal], evidence=[evidence])
        repo = _Repo()
        outcome = await promote_conjunction_signals(
            signal_source=await _source(bundle), repository=repo,
            orchestrator=IntelligenceOrchestrator(store=repo),
        )
        assert outcome.created == 0
        assert outcome.refused[0]["reason"] == REFUSED_BY_GATE
        assert repo.events_by_key == {}


class TestAnEmptyPopulationIsAnAnswerNotAnError:
    async def test_no_signals_keeps_the_adapters_own_reason(self):
        bundle = _Bundle(
            signals=[], evidence=[], data_status="INSUFFICIENT_DATA",
            status_reason="no stored screening snapshot in the requested window",
        )
        repo = _Repo()
        outcome = await promote_conjunction_signals(
            signal_source=await _source(bundle), repository=repo,
            orchestrator=IntelligenceOrchestrator(store=repo),
        )
        assert outcome.data_status == "INSUFFICIENT_DATA"
        assert "no stored screening snapshot" in outcome.status_reason
        assert outcome.created == 0 and repo.events_by_key == {}


class TestThePromotionRouteIsOnTheProductSurface:
    @pytest.fixture
    async def client(self):
        from services.api.integrated import app

        async with AsyncClient(app=app, base_url="http://test") as async_client:
            yield async_client

    async def test_promotion_is_a_post_not_a_get(self, client):
        """A read must not create events; the store would then depend on who looked."""
        assert (await client.get("/v1/intelligence/promote")).status_code in {404, 405}

    async def test_the_route_reports_what_it_did(self, client):
        response = await client.post("/v1/intelligence/promote", params={"limit": 5})
        assert response.status_code == 200, response.text
        body = response.json()
        if body["data"] is None:
            assert body["data_status"] == "UNAVAILABLE"
            return
        data = body["data"]
        for field_name in ("considered", "created", "revised", "unchanged", "refused"):
            assert field_name in data, f"the outcome hides {field_name}"

    async def test_a_second_call_creates_nothing_new(self, client):
        first = await client.post("/v1/intelligence/promote", params={"limit": 5})
        second = await client.post("/v1/intelligence/promote", params={"limit": 5})
        assert second.status_code == 200
        if (first.json()["data"] or {}).get("created"):
            assert second.json()["data"]["created"] == 0, (
                "promoting the same screening twice invented an event"
            )
