"""Confidence must be computed from evidence, or not shown at all.

These tests exist because the packet builder used to emit a fixed 0.84 / VERY_HIGH
under six literal factors labelled 'policy factor'. Every test below either proves
the number moves with the evidence (so it cannot be a constant) or proves that an
absent input produces no number instead of a low one.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from aetherus_domain import (
    ConfidenceGrade,
    EvidenceClass,
    EvidenceRecord,
    EventRevision,
    IntelligenceEvent,
    SourceGrade,
    ValidationState,
)
from aetherus_intelligence.advanced import ConfidenceUncertaintyIntelligence
from aetherus_intelligence.confidence import NOT_APPLIED_PREFIX, NOT_COMPUTABLE, ConfidenceEngine
from aetherus_intelligence.packet import IntelligencePacketBuilder

NOW = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)


def make_evidence(*, quality=1.0, grade=SourceGrade.OFFICIAL_PUBLIC, observed=NOW, received=NOW, source_id='SRC_A'):
    return EvidenceRecord(
        evidence_class=EvidenceClass.OFFICIAL,
        source_id=source_id,
        observed_at=observed,
        received_at=received,
        checksum_sha256='a' * 64,
        source_grade=grade,
        quality=quality,
    )


def make_event(state=ValidationState.VALIDATION_PENDING):
    return IntelligenceEvent(
        event_type='LAUNCH_EVENT',
        canonical_key='LAUNCH:TEST',
        first_seen_at=NOW,
        updated_at=NOW,
        validation_state=state,
    )


def make_revision(event, evidence_ids):
    return EventRevision(
        event_id=event.id,
        revision_no=1,
        created_at=NOW,
        evidence_ids=list(evidence_ids),
        delta={'status': 'LAUNCHED'},
        snapshot_hash='b' * 64,
    )


def build(evidence, *, event=None, cited=None, **kwargs):
    event = event or make_event()
    revision = make_revision(event, cited if cited is not None else [e.id for e in evidence])
    return IntelligencePacketBuilder().build(
        event=event,
        revision=revision,
        evidence=evidence,
        what_happened=['x'],
        what_changed=['y'],
        why_it_matters=['z'],
        now=NOW,
        **kwargs,
    )


def factor_names(packet):
    return {f.name for f in packet.confidence.factors}


def factor(packet, name):
    return next(f for f in packet.confidence.factors if f.name == name)


# --- the score is computed, not a constant -----------------------------------

def test_source_grade_changes_the_score():
    official = build([make_evidence(grade=SourceGrade.OFFICIAL_PUBLIC)])
    research = build([make_evidence(grade=SourceGrade.RESEARCH)])
    assert official.confidence.score is not None
    assert official.confidence.score > research.confidence.score


def test_declared_evidence_quality_changes_the_score():
    high = build([make_evidence(quality=1.0)])
    low = build([make_evidence(quality=0.2)])
    assert high.confidence.score > low.confidence.score


def test_missing_cited_evidence_lowers_completeness_and_the_score():
    present = make_evidence(source_id='SRC_A')
    missing_id = uuid4()
    full = build([present], cited=[present.id])
    partial = build([present], cited=[present.id, missing_id])
    assert factor(full, 'completeness').value == 1.0
    assert factor(partial, 'completeness').value == 0.5
    assert partial.confidence.score < full.confidence.score


def test_validation_state_changes_the_score():
    pending = build([make_evidence()], event=make_event(ValidationState.VALIDATION_PENDING))
    validated = build([make_evidence()], event=make_event(ValidationState.VALIDATED_PIPELINE))
    assert factor(pending, 'validation').value == 0.0
    assert factor(validated, 'validation').value == 1.0
    assert validated.confidence.score > pending.confidence.score


def test_retrieval_age_changes_the_score_when_a_staleness_policy_exists():
    fresh = build([make_evidence(received=NOW)], stale_after_seconds=86400)
    stale = build([make_evidence(received=NOW - timedelta(hours=20))], stale_after_seconds=86400)
    assert 'freshness' in factor_names(fresh)
    assert fresh.confidence.score > stale.confidence.score


def test_evidence_disagreement_lowers_the_score():
    a = make_evidence(source_id='SRC_A')
    b = make_evidence(source_id='SRC_B')
    agree = build([a, b], cross_validation_values={str(a.id): 10.0, str(b.id): 10.0})
    disagree = build([a, b], cross_validation_values={str(a.id): 10.0, str(b.id): 2.0})
    assert factor(agree, 'agreement').value == pytest.approx(1.0)
    assert factor(disagree, 'agreement').value < 1.0
    assert disagree.confidence.score < agree.confidence.score


def test_two_different_evidence_sets_do_not_produce_the_same_fixed_score():
    a = build([make_evidence(quality=1.0, grade=SourceGrade.OPERATIONAL)])
    b = build([make_evidence(quality=0.4, grade=SourceGrade.USER_OBSERVATION)])
    assert a.confidence.score != b.confidence.score
    # 0.84 was the hardcoded value; nothing here may reproduce it by construction.
    assert a.confidence.score != pytest.approx(0.84)


# --- no evidence means no confidence, not low confidence ----------------------

def test_no_derivable_factor_yields_no_score_and_not_assessed():
    event = make_event(ValidationState.INSUFFICIENT_DATA)
    packet = build([], event=event, cited=[])
    assert packet.confidence.score is None
    assert packet.confidence.grade is ConfidenceGrade.NOT_ASSESSED
    assert packet.confidence.factors == []
    assert NOT_COMPUTABLE in packet.confidence.limitations


def test_undeliverable_factors_are_reported_not_scored_zero():
    packet = build([make_evidence()])
    # No staleness policy and no cross-validation values were supplied.
    assert 'freshness' not in factor_names(packet)
    assert 'agreement' not in factor_names(packet)
    assert 'time_alignment' not in factor_names(packet)
    reported = ' '.join(packet.confidence.limitations)
    for name in ('freshness', 'agreement', 'time_alignment'):
        assert f'{NOT_APPLIED_PREFIX}:{name}' in reported


def test_missing_factor_is_removed_from_the_denominator():
    engine = ConfidenceEngine()
    only_one = engine.assess('REVISION', 'r1', {'source_quality': 1.0}, {'source_quality': 'derived in test'})
    # 1.0 alone must read as 1.0, not 0.25 (its weight share of the full policy).
    assert only_one.score == pytest.approx(1.0)
    assert only_one.grade is ConfidenceGrade.VERY_HIGH


def test_engine_reports_no_factor_it_did_not_score():
    engine = ConfidenceEngine()
    assessment = engine.assess('REVISION', 'r1', {'validation': 1.0}, {'validation': 'event state'})
    assert [f.name for f in assessment.factors] == ['validation']
    assert all(f.value != 0.0 or f.name == 'validation' for f in assessment.factors)


def test_no_factor_carries_a_generic_policy_filler_reason():
    packet = build([make_evidence()], stale_after_seconds=86400)
    assert packet.confidence.factors
    for f in packet.confidence.factors:
        assert f.reason.strip()
        assert f.reason.strip().lower() != 'policy factor'


def test_value_without_a_reason_is_rejected():
    engine = ConfidenceEngine()
    with pytest.raises(ValueError):
        engine.assess('REVISION', 'r1', {'source_quality': 0.9})
    with pytest.raises(ValueError):
        engine.assess('REVISION', 'r1', {'source_quality': 0.9}, {'source_quality': 'policy factor'})


def test_unweighted_factor_name_is_rejected():
    engine = ConfidenceEngine()
    with pytest.raises(ValueError):
        engine.assess('REVISION', 'r1', {'vibes': 1.0}, {'vibes': 'made up'})


# --- the real E43 implementation is the one that runs -------------------------

def test_production_path_uses_the_e43_confidence_engine():
    builder = IntelligencePacketBuilder()
    assert isinstance(builder.confidence.engine, ConfidenceUncertaintyIntelligence)


def test_confidence_limitations_reach_the_packet_warnings():
    packet = build([make_evidence()], known_limitations=['fixture only'])
    assert 'fixture only' in packet.known_limitations
    assert any(x.startswith(NOT_APPLIED_PREFIX) for x in packet.known_limitations)
