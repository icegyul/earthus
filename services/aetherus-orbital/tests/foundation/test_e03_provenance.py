from datetime import datetime, timezone
from aetherus_domain import DataSourcePolicy, EvidenceClass, SignalRecord, SourceGrade
from aetherus_foundation import EvidenceProvenanceEngine, SourceIngestionEngine
from aetherus_intelligence.signal_gate import SignalPromotionGate
from aetherus_intelligence.orchestrator import IntelligenceOrchestrator

def test_e03_t01_missing_source_rejects_intelligence_promotion(repo):
    from uuid import uuid4
    s=SignalRecord(signal_type='X',evidence_class=EvidenceClass.DERIVED,producer_module_id='E21',observed_at=datetime(2026,8,30,tzinfo=timezone.utc),object_ids=['A'],event_hint='CONJUNCTION_EVENT',significance=.9,evidence_ids=[uuid4()],payload={})
    assert IntelligenceOrchestrator(store=repo).ingest_signal(s) is None

def test_e03_t02_hash_chain_reproducibility(repo, source, tmp_path):
    t=datetime(2026,8,30,tzinfo=timezone.utc); ing=SourceIngestionEngine(repo,tmp_path/'raw'); p=EvidenceProvenanceEngine(repo)
    art,_=ing.ingest_bytes(source,b'official bytes',retrieved_at=t,observed_at=t)
    b1=p.evidence_from_raw(art,source,evidence_class=EvidenceClass.OFFICIAL,source_record_id='R1')
    b2=p.evidence_from_raw(art,source,evidence_class=EvidenceClass.OFFICIAL,source_record_id='R1')
    assert b1.provenance_hash==b2.provenance_hash

def test_e03_t03_source_grade_separation(repo, tmp_path):
    t=datetime(2026,8,30,tzinfo=timezone.utc); ing=SourceIngestionEngine(repo,tmp_path/'raw'); p=EvidenceProvenanceEngine(repo)
    official=DataSourcePolicy(id='O',name='O',source_grade=SourceGrade.OFFICIAL_PUBLIC)
    research=DataSourcePolicy(id='R',name='R',source_grade=SourceGrade.RESEARCH)
    ao,_=ing.ingest_bytes(official,b'o',retrieved_at=t); ar,_=ing.ingest_bytes(research,b'r',retrieved_at=t)
    eo=p.evidence_from_raw(ao,official,evidence_class=EvidenceClass.OFFICIAL).evidence
    er=p.evidence_from_raw(ar,research,evidence_class=EvidenceClass.DERIVED).evidence
    assert eo.source_grade==SourceGrade.OFFICIAL_PUBLIC and er.source_grade==SourceGrade.RESEARCH

def test_e03_t04_license_policy_propagation(repo, source, tmp_path):
    t=datetime(2026,8,30,tzinfo=timezone.utc); art,_=SourceIngestionEngine(repo,tmp_path/'raw').ingest_bytes(source,b'o',retrieved_at=t)
    e=EvidenceProvenanceEngine(repo).evidence_from_raw(art,source,evidence_class=EvidenceClass.OFFICIAL).evidence
    assert e.license_policy==source.license_policy and e.access_policy==source.access_policy
