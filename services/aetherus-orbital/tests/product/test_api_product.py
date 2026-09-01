from __future__ import annotations

from pathlib import Path
from fastapi.testclient import TestClient

from aetherus_product import AetherusProductRuntime
from services.api.main import create_app

ROOT=Path(__file__).resolve().parents[2]


def client(tmp_path):
    runtime=AetherusProductRuntime(
        db_path=str(tmp_path/'api.sqlite'),
        raw_root=tmp_path/'raw',
        fixture_root=ROOT/'fixtures'/'official',
    )
    return TestClient(create_app(product=runtime)), runtime


def test_web_shell_and_major_product_routes(tmp_path):
    c,_=client(tmp_path)
    assert c.get('/app/').status_code==200
    assert 'AETHERUS' in c.get('/app/').text
    for path in [
        '/v1/product/summary','/v1/universe','/v1/space/state','/v1/control','/v1/orbit',
        '/v1/intelligence/important-now','/v1/archive/search','/v1/scene/SPACE','/v1/providers/registry',
    ]:
        res=c.get(path)
        assert res.status_code==200, (path,res.text)
        body=res.json()
        assert 'data_status' in body
        assert 'data' in body


def test_universe_patch_persists_across_modes(tmp_path):
    c,r=client(tmp_path)
    res=c.patch('/v1/universe',json={'selected_object':'MARS','camera_focus':'MARS','space_scale':'OBJECT_VIEW'})
    assert res.status_code==200
    assert res.json()['data']['selected_object']=='MARS'
    assert c.get('/v1/universe').json()['data']['camera_focus']=='MARS'
    assert c.get('/v1/scene/SPACE').json()['data']['camera_focus']=='MARS'
    assert r.product_store.latest_universe('LOCAL-UNIVERSE')['state']['selected_object']=='MARS'


def test_orbit_api_never_fabricates_pc_without_covariance(tmp_path):
    c,_=client(tmp_path)
    body=c.get('/v1/orbit').json()
    assert body['data_status']=='SCREENING_ONLY'
    assert body['data']['risk']['pc'] is None
    assert 'covariance' in body['warnings'][0].lower()


def test_provider_registry_uses_current_provider_contract_shapes_and_marks_unverified(tmp_path):
    c,_=client(tmp_path)
    body=c.get('/v1/providers/registry').json()
    rows={x['source_id']:x for x in body['data']}
    assert 'FORMAT=JSON' in rows['CELESTRAK_GP']['sample_url']
    assert '/api/horizons.api?' in rows['NASA_JPL_HORIZONS']['sample_url']
    assert rows['NOAA_SWPC']['sample_url'].endswith('.json')
    assert '/2.3.0/launches/upcoming/' in rows['LAUNCH_LIBRARY_2']['sample_url']
    assert all(x['live_verified'] is False for x in rows.values())


def test_root_redirects_to_product_shell(tmp_path):
    c,_=client(tmp_path)
    r=c.get('/',follow_redirects=False)
    assert r.status_code in (302,307)
    assert r.headers['location']=='/app/'

def test_llm_archive_handover_and_counterfactual_api_boundaries(tmp_path):
    c,_=client(tmp_path)
    handover=c.get('/v1/missions/APOLLO11/handover').json()
    assert handover['data']["handovers"][0]['evidence_ids']
    llm=c.get('/v1/llm/explain').json()
    assert llm['data']['source']=='INTELLIGENCE_PACKET_ONLY'
    assert llm['data']['scientific_calculation_performed'] is False
    tm=c.get('/v1/archive/time-machine?mode=RECONSTRUCTED_STATE').json()
    assert tm['data']['state_class']=='RECONSTRUCTED_STATE'
    assert tm['data']['archived'] is False
    scenario=c.post('/v1/scenarios/run',json={'kind':'REMOVE','target_object_ids':['VAL-A']}).json()
    assert scenario['data_status']=='RESEARCH_ONLY'
    assert scenario['data']['result']['metric_type']=='screening_score'
    rejected=c.post('/v1/scenarios/run',json={'kind':'REMOVE','target_object_ids':['ISS']})
    assert rejected.status_code==422

def test_bilingual_explanation_and_briefing_api(tmp_path):
    c,_=client(tmp_path)
    ko=c.get('/v1/llm/explain?locale=ko').json()['data']
    en=c.get('/v1/llm/explain?locale=en').json()['data']
    briefing=c.get('/v1/briefings/current?locale=ko').json()['data']
    assert ko['locale']=='ko' and en['locale']=='en'
    assert '무슨 일이 있었나:' in ko['text']
    assert ko['citations']==en['citations']
    assert briefing['locale']=='ko'

def test_mobile_pwa_shell_assets_are_served(tmp_path):
    c,_=client(tmp_path)
    manifest=c.get('/app/manifest.webmanifest')
    sw=c.get('/app/sw.js')
    icon=c.get('/app/assets/aetherus-icon.svg')
    assert manifest.status_code==200 and 'standalone' in manifest.text
    assert sw.status_code==200 and "/v1/" in sw.text
    assert "aetherus-shell-v0.6-visual-recovery-20260831" in sw.text
    assert icon.status_code==200 and '<svg' in icon.text
