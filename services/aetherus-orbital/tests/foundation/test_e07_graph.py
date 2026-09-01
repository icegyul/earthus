from datetime import datetime, timedelta, timezone
import pytest
from aetherus_foundation import SpaceKnowledgeGraphArchiveEngine

def test_e07_t01_typed_relation_source_required(repo):
    with pytest.raises(ValueError): SpaceKnowledgeGraphArchiveEngine(repo).add_relation(subject_id='A',relation_type='PARENT_OF',object_id='B',provenance_evidence_id=None)

def test_e07_t02_mission_to_object_lineage(repo, evidence):
    e=SpaceKnowledgeGraphArchiveEngine(repo); t=datetime(1969,7,16,13,32,tzinfo=timezone.utc)
    e.add_relation(subject_id='MISSION:APOLLO11',relation_type='USES_VEHICLE',object_id='VEHICLE:SATURNV',provenance_evidence_id=evidence.id,valid_from=t)
    e.add_relation(subject_id='VEHICLE:SATURNV',relation_type='HAS_STAGE',object_id='OBJECT:SIVB',provenance_evidence_id=evidence.id,valid_from=t)
    path=e.lineage('MISSION:APOLLO11','OBJECT:SIVB',at=t+timedelta(hours=1))
    assert [r.relation_type for r in path]==['USES_VEHICLE','HAS_STAGE']

def test_e07_t03_time_consistent_traversal(repo, evidence):
    e=SpaceKnowledgeGraphArchiveEngine(repo); t=datetime(2026,8,30,tzinfo=timezone.utc)
    e.add_relation(subject_id='A',relation_type='RELATED_TO',object_id='B',provenance_evidence_id=evidence.id,valid_from=t,valid_to=t+timedelta(hours=1))
    assert len(e.traverse('A',at=t+timedelta(minutes=30)))==1
    assert len(e.traverse('A',at=t+timedelta(hours=2)))==0

def test_e07_t04_unknown_relation_uncertainty(repo, evidence):
    e=SpaceKnowledgeGraphArchiveEngine(repo)
    with pytest.raises(ValueError): e.add_relation(subject_id='A',relation_type='UNKNOWN',object_id='B',provenance_evidence_id=evidence.id)
    r=e.add_relation(subject_id='A',relation_type='UNKNOWN',object_id='B',provenance_evidence_id=evidence.id,uncertainty_reason='provider lineage unresolved')
    assert r.uncertainty_reason
