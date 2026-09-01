from datetime import datetime, timedelta, timezone
import pytest
from aetherus_domain import CanonicalTimeContext, StateKind, DigitalStateKind
from aetherus_foundation import CanonicalObjectIdentityEngine, DigitalStateSnapshotEngine

def _obj(repo,t): return CanonicalObjectIdentityEngine(repo).register_provider_record(source_id='S',source_key='1',entity_type='SPACE_OBJECT',canonical_name='X',catalog_id='100001',now=t)[0]

def test_e06_t01_append_only_state(repo, evidence):
    t=datetime(2026,8,30,tzinfo=timezone.utc); obj=_obj(repo,t); e=DigitalStateSnapshotEngine(repo); c=CanonicalTimeContext(mode=StateKind.NOW,cursor_utc=t)
    a=e.create_state(entity_id=obj.id,time_context=c,representation='TEST',payload={'x':1},evidence_ids=[evidence.id],created_at=t)
    b=e.create_state(entity_id=obj.id,time_context=c,representation='TEST',payload={'x':2},evidence_ids=[evidence.id],created_at=t+timedelta(seconds=1))
    assert a.id!=b.id and repo.counts()['digital_state']==2

def test_e06_t02_same_input_deterministic_hash(repo, evidence):
    t=datetime(2026,8,30,tzinfo=timezone.utc); obj=_obj(repo,t); e=DigitalStateSnapshotEngine(repo); c=CanonicalTimeContext(mode=StateKind.NOW,cursor_utc=t)
    a=e.create_state(entity_id=obj.id,time_context=c,representation='TEST',payload={'x':1},evidence_ids=[evidence.id],created_at=t)
    b=e.create_state(entity_id=obj.id,time_context=c,representation='TEST',payload={'x':1},evidence_ids=[evidence.id],created_at=t+timedelta(seconds=1))
    assert a.state_hash==b.state_hash and a.id==b.id

def test_e06_t03_archived_vs_reconstructed_label(repo, evidence):
    t=datetime(2026,8,30,tzinfo=timezone.utc); obj=_obj(repo,t); e=DigitalStateSnapshotEngine(repo)
    ca=CanonicalTimeContext(mode=StateKind.ARCHIVED_STATE,cursor_utc=t,archived_snapshot_id='s0')
    cr=CanonicalTimeContext(mode=StateKind.RECONSTRUCTED_STATE,cursor_utc=t,reconstructed_from_snapshot_ids=['s0'])
    a=e.create_state(entity_id=obj.id,time_context=ca,representation='TEST',payload={'x':1},evidence_ids=[evidence.id],created_at=t)
    r=e.create_state(entity_id=obj.id,time_context=cr,representation='TEST',payload={'x':1},evidence_ids=[evidence.id],created_at=t)
    assert a.state_kind==DigitalStateKind.ARCHIVED and r.state_kind==DigitalStateKind.RECONSTRUCTED and a.state_hash!=r.state_hash

def test_e06_t04_baseline_snapshot_immutability(repo, evidence):
    t=datetime(2026,8,30,tzinfo=timezone.utc); obj=_obj(repo,t); e=DigitalStateSnapshotEngine(repo); c=CanonicalTimeContext(mode=StateKind.NOW,cursor_utc=t)
    state=e.create_state(entity_id=obj.id,time_context=c,representation='TEST',payload={'x':1},evidence_ids=[evidence.id],created_at=t)
    snap,_=e.create_snapshot(states=[state],time_context=c,evidence_ids=[evidence.id],created_at=t,baseline=True)
    with pytest.raises(PermissionError): e.assert_immutable(snap.id,[])
