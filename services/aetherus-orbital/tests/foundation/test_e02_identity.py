from datetime import datetime, timedelta, timezone
from aetherus_foundation import CanonicalObjectIdentityEngine

def test_e02_t01_six_plus_digit_catalog_id(repo):
    now=datetime(2026,8,30,tzinfo=timezone.utc); e=CanonicalObjectIdentityEngine(repo)
    obj,c=e.register_provider_record(source_id='CAT',source_key='x',entity_type='SPACE_OBJECT',canonical_name='X',catalog_id='1234567',now=now)
    assert c is None and obj.catalog_id=='1234567'

def test_e02_t02_same_catalog_renamed_alias(repo):
    now=datetime(2026,8,30,tzinfo=timezone.utc); e=CanonicalObjectIdentityEngine(repo)
    a,_=e.register_provider_record(source_id='CAT1',source_key='old',entity_type='SPACE_OBJECT',canonical_name='OLD',catalog_id='999999',now=now)
    b,_=e.register_provider_record(source_id='CAT2',source_key='new',entity_type='SPACE_OBJECT',canonical_name='NEW',catalog_id='999999',now=now+timedelta(seconds=1))
    assert a.id==b.id and b.canonical_name=='NEW' and 'OLD' in b.metadata['historical_names'] and len(b.aliases)==2

def test_e02_t03_cospar_conflict_quarantine(repo):
    now=datetime(2026,8,30,tzinfo=timezone.utc); e=CanonicalObjectIdentityEngine(repo)
    a,_=e.register_provider_record(source_id='CAT',source_key='a',entity_type='SPACE_OBJECT',canonical_name='A',catalog_id='100001',cospar_id='2020-001A',now=now)
    b,c=e.register_provider_record(source_id='CAT2',source_key='b',entity_type='SPACE_OBJECT',canonical_name='A2',catalog_id='100001',cospar_id='2020-999Z',now=now)
    assert a.id==b.id and c is not None and c.quarantined and repo.identity_conflict_count()==1

def test_e02_t04_unknown_origin_not_inferred(repo):
    now=datetime(2026,8,30,tzinfo=timezone.utc); e=CanonicalObjectIdentityEngine(repo)
    obj,_=e.register_provider_record(source_id='OWNER_NAMED_SOURCE',source_key='k',entity_type='SPACE_OBJECT',canonical_name='Owner-like name',catalog_id='100002',origin=None,now=now)
    assert obj.origin is None

def test_e02_t05_mission_created_object_handover(repo):
    now=datetime(2026,8,30,tzinfo=timezone.utc); e=CanonicalObjectIdentityEngine(repo)
    temp=e.create_mission_object(mission_id='APOLLO11',mission_object_key='SIVB',entity_type='ROCKET_BODY',name='S-IVB',now=now)
    final=e.handover_mission_object(temp.id,catalog_source_id='CAT',catalog_source_key='CAT-1969',catalog_id='987654',cospar_id='1969-059B',canonical_name='S-IVB AS-506',now=now+timedelta(hours=1))
    assert final.id==temp.id and final.catalog_id=='987654' and final.cospar_id=='1969-059B' and len(final.aliases)==2
