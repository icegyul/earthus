"""P4 conjunctions -> Intelligence Signal adapter, against the live PostGIS store.

No network: every case either reads persisted screening results or drives the pure
converter with an injected in-process service.
"""

from datetime import UTC, datetime, timedelta

import pytest

from aetherus_domain.models import EvidenceClass, SourceGrade, ValidationState
from aetherus_integration.conjunction_signals import (
    EVENT_HINT,
    METRIC_TYPE,
    PRODUCER_MODULE_ID,
    SIGNAL_TYPE,
    ConjunctionSignalBundle,
    build_conjunction_signals,
    signals_from_conjunction_payload,
)
from aetherus_intelligence.orchestrator import IntelligenceOrchestrator
from aetherus_intelligence.signal_gate import SignalPromotionGate
from backend.conjunction.service import ConjunctionService


class _StubConjunctionService:
    """In-process stand-in: records the call, replays a fixed envelope."""

    def __init__(self, payload):
        self.payload = payload
        self.calls: list[dict] = []

    async def list_conjunctions(self, **kwargs):
        self.calls.append(kwargs)
        return self.payload


def _empty_envelope(data_status: str, reason: str | None):
    return {
        "request_id": "req-empty",
        "generated_at": "2026-09-01T00:00:00+00:00",
        "data_status": data_status,
        "status_reason": reason,
        "data": {"count": 0, "events": []},
        "provenance": {"source_ids": [], "model_id": None, "model_version": None},
        "warnings": [],
    }


@pytest.fixture
async def live_bundle() -> ConjunctionSignalBundle:
    return await build_conjunction_signals(ConjunctionService(), limit=50)


class TestRealConjunctionsBecomeSignals:
    async def test_every_stored_conjunction_converts_with_full_lineage(self, live_bundle):
        if not live_bundle.signals:
            pytest.skip(
                "live store holds no convertible conjunction "
                f"(data_status={live_bundle.data_status}, reason={live_bundle.status_reason})"
            )

        assert live_bundle.data_status in {"OK", "PARTIAL"}
        assert len(live_bundle.evidence) == len(live_bundle.signals)

        for signal in live_bundle.signals:
            assert signal.signal_type == SIGNAL_TYPE
            assert signal.producer_module_id == PRODUCER_MODULE_ID
            assert signal.event_hint == EVENT_HINT
            assert signal.observed_at.tzinfo is not None
            assert len(signal.object_ids) == 2

            payload = signal.payload
            # Lineage the packet layer needs to re-derive or audit the result.
            assert payload["tca"] and datetime.fromisoformat(payload["tca"]).tzinfo
            assert payload["miss_distance_m"] is not None
            assert payload["primary_catalog_id"] and payload["secondary_catalog_id"]
            assert payload["primary_catalog_id"] != payload["secondary_catalog_id"]
            assert payload["model_version"]
            assert payload["input_hash"]
            assert payload["event_id"] and payload["snapshot_id"]
            assert payload["correlation_bucket"] == payload["event_id"]
            # The pipeline gets a ValidationState member, never P4's own literal.
            ValidationState(payload["validation_state"])

            # Evidence is DERIVED and provenance-complete.
            assert signal.evidence_ids
            record = live_bundle.evidence_lookup(signal.evidence_ids[0])
            assert record is not None
            assert record.evidence_class is EvidenceClass.DERIVED
            assert signal.evidence_class is EvidenceClass.DERIVED
            assert record.source_id
            assert record.metadata["source_uri"].startswith("aetherus://conjunction/event/")
            assert record.metadata["retrieved_at"]
            assert len(record.checksum_sha256) == 64

    async def test_signal_metric_is_miss_distance_not_a_risk_score(self, live_bundle):
        if not live_bundle.signals:
            pytest.skip("live store holds no convertible conjunction")
        for signal in live_bundle.signals:
            assert signal.metric_type == METRIC_TYPE
            assert signal.units == "m"
            assert signal.value == pytest.approx(signal.payload["miss_distance_m"])

    async def test_signals_pass_the_promotion_gate_and_correlate_one_to_one(
        self, live_bundle
    ):
        if not live_bundle.signals:
            pytest.skip("live store holds no convertible conjunction")

        gate = SignalPromotionGate()
        for signal in live_bundle.signals:
            assert gate.promote(signal, evidence_lookup=live_bundle.evidence_lookup)

        orchestrator = IntelligenceOrchestrator()
        keys = set()
        for signal in live_bundle.signals:
            result = orchestrator.ingest_signal(signal)
            assert result is not None, "a real screening candidate must reach the pipeline"
            event, _revision = result
            assert event.validation_state is ValidationState.SCREENING_ONLY
            keys.add(event.canonical_key)
        assert len(keys) == len({s.payload["event_id"] for s in live_bundle.signals})

    async def test_public_gp_grade_is_preserved_verbatim(self, live_bundle):
        if not live_bundle.signals:
            pytest.skip("live store holds no convertible conjunction")
        for signal, record in zip(live_bundle.signals, live_bundle.evidence, strict=True):
            raw = signal.payload["source_grade_raw"]
            assert raw, "upstream source_grade must never be dropped"
            assert record.metadata["source_grade_raw"] == raw
            if raw == "PUBLIC_GP":
                assert record.source_grade is SourceGrade.PUBLIC_SCREENING


class TestPcHonesty:
    async def test_uncomputed_pc_is_stated_with_its_reason(self, live_bundle):
        if not live_bundle.signals:
            pytest.skip("live store holds no convertible conjunction")

        saw_not_computed = False
        for signal in live_bundle.signals:
            pc = signal.payload["pc"]
            assert pc["status"] in {"COMPUTED", "NOT_COMPUTED", "PC_UNAVAILABLE", "UNAVAILABLE"}
            if pc["computed"]:
                assert pc["value"] is not None
                continue
            saw_not_computed = True
            # No value, an explicit reason, and the covariance story alongside it.
            assert pc["value"] is None
            assert pc["unavailable_reason"], "missing Pc must carry its reason"
            assert pc["covariance_status"]
            assert "probability" in pc["explanation"]
            # Miss distance must not have been laundered into the Pc slot.
            assert pc["value"] != signal.payload["miss_distance_m"]
            assert signal.payload["risk_ranking_basis"] == "MISS_DISTANCE_ONLY"
            # And no fabricated strength stands in for the missing Pc.
            assert signal.significance is None
            assert signal.payload["significance_status"] == "NOT_ASSESSED"
            assert signal.payload["significance_reason"]

        if not saw_not_computed:
            pytest.skip("live store currently holds only Pc-computed conjunctions")

    async def test_public_gp_records_the_covariance_missing_reason(self, live_bundle):
        if not live_bundle.signals:
            pytest.skip("live store holds no convertible conjunction")
        for signal in live_bundle.signals:
            if signal.payload["source_grade_raw"] != "PUBLIC_GP":
                continue
            pc = signal.payload["pc"]
            assert pc["status"] == "NOT_COMPUTED"
            assert pc["unavailable_reason"] == "COVARIANCE_MISSING_PUBLIC_GP"
            assert pc["covariance_status"] == "INSUFFICIENT_DATA"

    def test_absent_pc_channel_is_unavailable_not_not_computed(self):
        """A snapshot with no PC channel must not be reported as a decided state."""
        envelope = _empty_envelope("OK", None)
        envelope["data"] = {
            "count": 1,
            "events": [
                {
                    "event_id": "e-1",
                    "tca": "2026-09-01T08:00:00+00:00",
                    "source_event_id": "self-screen:1:2",
                    "event_status": "OPEN",
                    "first_seen_at": None,
                    "last_seen_at": None,
                    "primary": {"object_id": "o-1", "catalog_id": "1", "canonical_name": "A"},
                    "secondary": {"object_id": "o-2", "catalog_id": "2", "canonical_name": "B"},
                    "latest_snapshot": {
                        "snapshot_id": "s-1",
                        "snapshot_at": "2026-09-01T08:30:00+00:00",
                        "miss_distance_m": 1234.5,
                        "relative_speed_mps": 7000.0,
                        "metrics": {},
                        "covariance_status": None,
                        "dilution_state": None,
                        "tca_boundary_flag": False,
                        "source_grade": "PUBLIC_GP",
                        "validation_state": "PUBLIC_SCREENING",
                        "model_version": "p4-conservative-v1+sgp4",
                        "input_hash": "a" * 64,
                        "provenance": {},
                    },
                }
            ],
        }
        bundle = signals_from_conjunction_payload(envelope)
        pc = bundle.signals[0].payload["pc"]
        assert pc["status"] == "UNAVAILABLE"
        assert pc["unavailable_reason"] == "PC_METRIC_ABSENT_FROM_SNAPSHOT"
        assert pc["computed"] is False
        assert bundle.signals[0].significance is None


class TestNoConjunctionsNoSignals:
    async def test_live_impossible_window_yields_no_signal(self):
        """A far-future window matches nothing real; nothing may be invented."""
        far = datetime.now(UTC) + timedelta(days=3650)
        bundle = await build_conjunction_signals(
            ConjunctionService(),
            start=far.isoformat(),
            stop=(far + timedelta(hours=1)).isoformat(),
        )
        assert bundle.signals == []
        assert bundle.evidence == []
        assert bundle.status_reason, "an empty result must say why it is empty"
        assert any("fabricated" in w or "not fabricated" in w for w in bundle.warnings)

    @pytest.mark.parametrize(
        ("data_status", "reason"),
        [
            ("UNAVAILABLE", "NO_SCREENING_RUN_EXECUTED"),
            ("INSUFFICIENT_DATA", "NO_CANDIDATE_PAIRS_WITHIN_THRESHOLD"),
            ("OK", "NO_CONJUNCTION_EVENT_MATCHES_FILTERS"),
        ],
    )
    async def test_upstream_empty_status_is_echoed_not_masked(self, data_status, reason):
        stub = _StubConjunctionService(_empty_envelope(data_status, reason))
        bundle = await build_conjunction_signals(stub)
        assert bundle.signals == []
        assert bundle.data_status == data_status
        assert bundle.status_reason == reason
        assert bundle.to_payload()["data"]["count"] == 0
        # Pc thresholds are never pushed upstream: that would filter out every
        # PUBLIC_GP screening before it could be reported as NOT_COMPUTED.
        assert stub.calls[0]["metric_type"] is None
        assert stub.calls[0]["threshold_min"] is None

    async def test_orchestrator_creates_no_event_from_an_empty_bundle(self):
        stub = _StubConjunctionService(_empty_envelope("UNAVAILABLE", "NO_SCREENING_RUN_EXECUTED"))
        bundle = await build_conjunction_signals(stub)
        orchestrator = IntelligenceOrchestrator()
        for signal in bundle.signals:  # deliberately empty
            orchestrator.ingest_signal(signal)
        assert orchestrator.store.events_by_key == {}

    def test_event_missing_lineage_is_skipped_not_defaulted(self):
        envelope = _empty_envelope("OK", None)
        envelope["data"] = {
            "count": 1,
            "events": [
                {
                    "event_id": "e-broken",
                    "tca": None,
                    "primary": {"object_id": "o-1", "catalog_id": "1"},
                    "secondary": {"object_id": "o-2", "catalog_id": "2"},
                    "latest_snapshot": {"snapshot_id": "s-1", "snapshot_at": None},
                }
            ],
        }
        bundle = signals_from_conjunction_payload(envelope)
        assert bundle.signals == []
        assert bundle.skipped == [{"event_id": "e-broken", "reason": "TCA_MISSING_OR_NAIVE"}]
