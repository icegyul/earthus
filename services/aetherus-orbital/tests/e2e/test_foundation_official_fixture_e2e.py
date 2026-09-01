from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient
from aetherus_foundation import FoundationE2EPipeline, LocalFoundationRepository
from services.api.main import create_app

ROOT=Path(__file__).resolve().parents[2]
FIXTURE=ROOT/'fixtures/official/NASA_APOLLO11_MISSION_OVERVIEW_FIXED_OFFICIAL_FIXTURE.json'


def test_official_fixture_raw_to_packet_to_api(tmp_path):
    repo=LocalFoundationRepository(tmp_path/'aetherus.sqlite')
    pipeline=FoundationE2EPipeline(repo,tmp_path/'raw')
    retrieved=datetime(2026,8,30,4,50,tzinfo=timezone.utc)

    first=pipeline.run_fixed_official_apollo11_fixture(FIXTURE,retrieved_at=retrieved)
    assert Path(first['artifact'].object_uri).read_bytes()==FIXTURE.read_bytes()
    assert first['vehicle'].canonical_name=='Saturn-V AS-506'
    assert first['evidence'].source_id=='NASA_APOLLO11_MISSION_OVERVIEW'
    assert first['time_context'].cursor_utc.isoformat().startswith('1969-07-16T13:32:00')
    assert first['state'].state_kind.value=='ARCHIVED'
    assert first['relation'].relation_type=='USES_VEHICLE'
    assert first['event'].event_type=='LAUNCH_EVENT'
    assert first['revision'].revision_no==1
    assert first['packet'].event.validation_state.value=='VALIDATION_PENDING'
    assert first['counts']['raw_artifact']==1
    assert first['counts']['intelligence_packet']==1

    # Same fixed official source is idempotent; raw/state/snapshot/revision/graph stay deduped.
    second=pipeline.run_fixed_official_apollo11_fixture(FIXTURE,retrieved_at=retrieved)
    assert second['event'].id==first['event'].id
    assert second['revision'].id==first['revision'].id and second['revision'].revision_no==1
    assert second['counts']['raw_artifact']==1
    assert second['counts']['canonical_entity']==1
    assert second['counts']['digital_state']==1
    assert second['counts']['snapshot_manifest']==1
    assert second['counts']['event_revision']==1
    assert second['counts']['object_relation']==1

    client=TestClient(create_app(repo))
    response=client.get(f"/v1/intelligence/events/{first['event'].id}")
    assert response.status_code==200
    body=response.json()
    assert body['data_status']=='VALIDATION_PENDING'
    assert body['data']['event']['event_type']=='LAUNCH_EVENT'
    assert 'NASA_APOLLO11_MISSION_OVERVIEW' in body['provenance']['source_ids']
    assert any('not a live NASA provider fetch' in x for x in body['warnings'])

    obj=client.get(f"/v1/objects/{first['vehicle'].id}")
    evidence=client.get(f"/v1/evidence/{first['evidence'].id}")
    state=client.get(f"/v1/states/{first['state'].id}")
    graph=client.get('/v1/graph/MISSION:APOLLO11')
    assert obj.status_code==evidence.status_code==state.status_code==graph.status_code==200
    assert graph.json()['data'][0]['relation_type']=='USES_VEHICLE'
    repo.close()
