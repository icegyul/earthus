from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from aetherus_product import AetherusProductRuntime


ROOT=Path(__file__).resolve().parents[2]


def runtime(tmp_path):
    return AetherusProductRuntime(
        db_path=str(tmp_path/'product.sqlite'),
        raw_root=tmp_path/'raw',
        fixture_root=ROOT/'fixtures'/'official',
    )


def test_integrated_modes_are_available_and_scientific_boundaries_explicit(tmp_path):
    r=runtime(tmp_path)
    summary=r.product_summary()
    assert set(summary['modes']) == {'SPACE','CONTROL','ORBIT','INTELLIGENCE','ARCHIVE'}
    assert summary['modes']['SPACE']['data_status']=='RESEARCH_ONLY'
    assert summary['modes']['ORBIT']['data_status']=='SCREENING_ONLY'
    assert summary['modes']['ORBIT']['risk']['pc'] is None
    assert summary['scientific_boundaries']['live_provider_verified'] is False
    assert summary['scientific_boundaries']['production_db_verified'] is False
    assert summary['product_counts']['product_record'] >= 5


def test_universe_state_is_append_only_persistent_and_deduplicated(tmp_path):
    r=runtime(tmp_path)
    assert r.product_store.counts()['universe_revision']==1
    r.set_universe(selected_object='MARS',camera_focus='MARS')
    assert r.product_store.counts()['universe_revision']==2
    r.set_universe(selected_object='MARS',camera_focus='MARS')
    assert r.product_store.counts()['universe_revision']==2
    latest=r.product_store.latest_universe('LOCAL-UNIVERSE')
    assert latest['state']['selected_object']=='MARS'
    assert latest['revision_no']==2


def test_product_snapshots_persist_and_same_scientific_state_deduplicates(tmp_path):
    r=runtime(tmp_path)
    at=datetime(2026,8,30,tzinfo=timezone.utc)
    first=r.orbit_snapshot(at)
    first_count=r.product_store.counts()['product_record']
    second=r.orbit_snapshot(at)
    assert second['risk']['pc'] is None
    assert first['conjunction']==second['conjunction']
    assert r.product_store.counts()['product_record']==first_count
    row=r.product_store.latest_record('ORBIT','ORBIT_SNAPSHOT','VALIDATION_PAIR')
    assert row is not None
    assert row['validation_state']=='SCREENING_ONLY'
    assert row['payload']['risk']['pc'] is None


def test_official_fixture_retains_provenance_and_archive_linkage(tmp_path):
    r=runtime(tmp_path)
    intel=r.intelligence_snapshot()
    archive=r.archive_snapshot()
    assert intel['fixture_class']=='FIXED_OFFICIAL_FIXTURE'
    assert intel['events'][0]['evidence']
    assert archive['items'][0]['mission_id']=='APOLLO11'
    assert archive['items'][0]['event_id']==intel['events'][0]['event']['id']


def test_subscription_plan_does_not_change_scientific_orbit_output(tmp_path):
    r=runtime(tmp_path)
    at=datetime(2026,8,30,tzinfo=timezone.utc)
    scientific_before=r.orbit_snapshot(at)
    free=r.subscription.capabilities('FREE')
    pro=r.subscription.capabilities('PRO / RESEARCH')
    scientific_after=r.orbit_snapshot(at)
    assert free != pro
    assert scientific_before['conjunction']==scientific_after['conjunction']
    assert scientific_before['risk']==scientific_after['risk']

def test_mission_to_orbit_handover_is_evidence_backed_and_bidirectional(tmp_path):
    r=runtime(tmp_path)
    result=r.mission_handover_snapshot('APOLLO11')
    assert result['data_status']=='OK'
    handover=result['handovers'][0]
    assert handover['status']=='CONFIRMED'
    assert handover['origin_relation']['GO_TO_LAUNCH']=='APOLLO11'
    assert handover['origin_relation']['WHERE_IS_IT_NOW']==handover['object_id']
    assert handover['evidence_ids']


def test_time_machine_distinguishes_archived_from_reconstructed(tmp_path):
    r=runtime(tmp_path)
    archived=r.time_machine_snapshot(mode='ARCHIVED_STATE')
    reconstructed=r.time_machine_snapshot(at=datetime(2026,8,29,tzinfo=timezone.utc),mode='RECONSTRUCTED_STATE')
    assert archived['state_class']=='ARCHIVED_STATE'
    assert reconstructed['state_class']=='RECONSTRUCTED_STATE'
    assert reconstructed['archived'] is False
    assert reconstructed['may_create_current_event'] is False
    assert reconstructed['data_status']=='RESEARCH_ONLY'


def test_llm_uses_intelligence_packet_and_performs_no_scientific_calculation(tmp_path):
    r=runtime(tmp_path)
    explanation=r.llm_explanation()
    briefing=r.current_briefing()
    assert explanation['source']=='INTELLIGENCE_PACKET_ONLY'
    assert explanation['scientific_calculation_performed'] is False
    assert explanation['citations']
    assert briefing['source']=='INTELLIGENCE_PACKET_ONLY'
    assert briefing['evidence_ids']


def test_counterfactual_local_scenario_is_explicit_validation_fixture(tmp_path):
    r=runtime(tmp_path)
    result=r.run_validation_scenario(kind='REMOVE',target_object_ids=['VAL-A'])
    assert result['data_status']=='RESEARCH_ONLY'
    assert result['fixture_class']=='VALIDATION_FIXTURE'
    assert result['scenario']['evidence_class']=='COUNTERFACTUAL'
    assert result['result']['metric_type']=='screening_score'
    assert result['result']['validation_state']=='RESEARCH_ONLY'
    try:
        r.run_validation_scenario(kind='REMOVE',target_object_ids=['ISS'])
    except ValueError:
        pass
    else:
        raise AssertionError('non-validation object must not enter the local synthetic counterfactual path')

def test_universe_state_restores_after_runtime_restart(tmp_path):
    db=tmp_path/'restart.sqlite'
    raw=tmp_path/'raw-restart'
    first=AetherusProductRuntime(db_path=str(db),raw_root=raw,fixture_root=ROOT/'fixtures'/'official')
    first.set_universe(selected_object='MARS',camera_focus='MARS',space_scale='OBJECT_VIEW')
    expected=first.universe.as_json()
    first.repo.close()
    second=AetherusProductRuntime(db_path=str(db),raw_root=raw,fixture_root=ROOT/'fixtures'/'official')
    assert second.universe.selected_object=='MARS'
    assert second.universe.camera_focus=='MARS'
    assert second.universe.space_scale=='OBJECT_VIEW'
    assert second.universe.current_time_utc.isoformat()==expected['current_time_utc']

def test_bilingual_llm_and_briefing_are_presentation_only(tmp_path):
    r=runtime(tmp_path)
    en=r.llm_explanation(locale='en')
    ko=r.llm_explanation(locale='ko')
    ben=r.current_briefing(locale='en')
    bko=r.current_briefing(locale='ko')
    assert en['locale']=='en' and ko['locale']=='ko'
    assert 'What happened:' in en['text']
    assert '무슨 일이 있었나:' in ko['text']
    assert en['citations']==ko['citations']
    assert en['data_status']==ko['data_status']
    assert ben['evidence_ids']==bko['evidence_ids']
    assert ben['title']!=bko['title']
