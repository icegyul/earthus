from datetime import datetime, timezone, timedelta
from uuid import uuid4
from aetherus_domain.models import SignalRecord, EvidenceClass
from aetherus_intelligence.orchestrator import IntelligenceOrchestrator

def sig(significance=.9,payload=None,event_hint='CONJUNCTION_EVENT'):
    return SignalRecord(signal_type='TCA_CHANGE',evidence_class=EvidenceClass.DERIVED,producer_module_id='E21',observed_at=datetime.now(timezone.utc),object_ids=['B','A'],event_hint=event_hint,significance=significance,evidence_ids=[uuid4()],payload=payload or {'miss_distance_m':1200})

def test_low_significance_without_hint_not_promoted():
    o=IntelligenceOrchestrator(); s=sig(.1,event_hint=None); assert o.ingest_signal(s) is None

def test_event_created_then_revised_append_only():
    o=IntelligenceOrchestrator(); e1,r1=o.ingest_signal(sig(payload={'miss_distance_m':1200,'correlation_bucket':'case-1'})); e2,r2=o.ingest_signal(sig(payload={'miss_distance_m':900,'correlation_bucket':'case-1'}))
    assert e1.id==e2.id; assert r1.revision_no==1 and r2.revision_no==2; assert r2.delta['miss_distance_m']['before']==1200; assert r2.delta['miss_distance_m']['after']==900; assert e2.validation_state.value=='SCREENING_ONLY'

def test_counterfactual_not_promoted_to_observed_event():
    o=IntelligenceOrchestrator(); s=SignalRecord(signal_type='BENEFIT',evidence_class=EvidenceClass.COUNTERFACTUAL,producer_module_id='E31',observed_at=datetime.now(timezone.utc),object_ids=['A','B'],event_hint='CONJUNCTION_EVENT',significance=1.0,evidence_ids=[],payload={})
    assert o.ingest_signal(s) is None


def test_identical_signal_is_idempotent_no_new_revision():
    o=IntelligenceOrchestrator()
    s=sig(payload={'miss_distance_m':1200,'correlation_bucket':'case-idem'})
    e1,r1=o.ingest_signal(s)
    # New signal identity but identical factual payload/evidence should not create a scientific revision.
    s2=s.model_copy(update={'id':uuid4()})
    e2,r2=o.ingest_signal(s2)
    assert e1.id==e2.id and r1.id==r2.id and len(o.store.revisions_for(e1.id))==1
