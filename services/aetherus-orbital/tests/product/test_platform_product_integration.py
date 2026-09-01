from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from aetherus_product import AetherusProductRuntime
from services.api.main import create_app


def client(tmp_path: Path):
    p=AetherusProductRuntime(db_path=str(tmp_path/'p.sqlite'),raw_root=tmp_path/'raw',fixture_root=Path(__file__).resolve().parents[2]/'fixtures'/'official')
    return TestClient(create_app(product=p)),p


def test_my_aetherus_context_and_workspace_persist_restart(tmp_path):
    c,p=client(tmp_path)
    h={'X-Aetherus-Tenant':'T1','X-Aetherus-User':'U1','X-Aetherus-Plan':'CONTROL / INSTITUTION'}
    assert c.put('/v1/my-aetherus/context',headers=h,json={'context':{'focus':'MARS'}}).status_code==200
    assert c.put('/v1/control/workspace',headers=h,json={'workspace':{'pinned':['TARGET_ORBIT']}}).status_code==200
    p.repo.close()
    p2=AetherusProductRuntime(db_path=str(tmp_path/'p.sqlite'),raw_root=tmp_path/'raw2',fixture_root=Path(__file__).resolve().parents[2]/'fixtures'/'official')
    c2=TestClient(create_app(product=p2))
    me=c2.get('/v1/my-aetherus',headers=h).json()['data']
    assert me['personal_context']=={'focus':'MARS'}
    assert me['workspace']['workspace']=={'pinned':['TARGET_ORBIT']}


def test_follow_alert_is_capability_gated_and_deduplicates_revision(tmp_path):
    c,_=client(tmp_path)
    plus={'X-Aetherus-Tenant':'T','X-Aetherus-User':'U','X-Aetherus-Plan':'AETHERUS+'}
    free={'X-Aetherus-Tenant':'T','X-Aetherus-User':'F','X-Aetherus-Plan':'FREE'}
    assert c.post('/v1/follows/EVENT-1',headers=free).status_code==403
    assert c.post('/v1/follows/EVENT-1',headers=plus).status_code==200
    a=c.get('/v1/follows/EVENT-1/alerts',headers=plus,params={'revision_no':2}).json()['data']
    b=c.get('/v1/follows/EVENT-1/alerts',headers=plus,params={'revision_no':2}).json()['data']
    assert len(a)==1 and b==[]


def test_assistant_tool_is_safe_and_scientific_tool_requires_plan_and_explicit_approval(tmp_path):
    c,_=client(tmp_path)
    local={'X-Aetherus-Tenant':'T','X-Aetherus-User':'U','X-Aetherus-Plan':'FREE'}
    r=c.post('/v1/assistant/tool',headers=local,json={'tool_name':'search','args':{'query':'Mars'}})
    assert r.status_code==200 and r.json()['data'][0]['id']=='MARS'
    denied=c.post('/v1/assistant/tool',headers=local,json={'tool_name':'run_validation_scenario','args':{'kind':'REMOVE','target_object_ids':['VAL-A']},'allow_scientific_tool':True})
    assert denied.status_code==403
    pro={'X-Aetherus-Tenant':'T','X-Aetherus-User':'U','X-Aetherus-Plan':'PRO / RESEARCH'}
    ok=c.post('/v1/assistant/tool',headers=pro,json={'tool_name':'run_validation_scenario','args':{'kind':'REMOVE','target_object_ids':['VAL-A']},'allow_scientific_tool':True})
    assert ok.status_code==200 and ok.json()['data_status']=='RESEARCH_ONLY'
    cmd=c.post('/v1/assistant/tool',headers=pro,json={'tool_name':'run_validation_scenario','args':{'kind':'REMOVE','target_object_ids':['VAL-A'],'spacecraft_command':'BURN'},'allow_scientific_tool':True})
    assert cmd.status_code==422


def test_nonlocal_auth_fails_closed_without_trusted_adapter(tmp_path, monkeypatch):
    c,_=client(tmp_path)
    monkeypatch.setenv('AETHERUS_ENV','production')
    monkeypatch.delenv('AETHERUS_TRUSTED_AUTH_ADAPTER',raising=False)
    blocked=c.get('/v1/my-aetherus')
    assert blocked.status_code==503
    assert 'BLOCKED_AUTH_PROVIDER' in blocked.json()['detail']
    monkeypatch.setenv('AETHERUS_TRUSTED_AUTH_ADAPTER','1')
    still_blocked=c.get('/v1/my-aetherus')
    assert still_blocked.status_code==503
    assert still_blocked.json()['detail']=='BLOCKED_AUTH_PROVIDER'
    headers={'X-Aetherus-Tenant':'T','X-Aetherus-User':'U','X-Aetherus-Plan':'FREE'}
    spoofed=c.get('/v1/my-aetherus',headers=headers)
    assert spoofed.status_code==503
    assert spoofed.json()['detail']=='BLOCKED_AUTH_PROVIDER'
