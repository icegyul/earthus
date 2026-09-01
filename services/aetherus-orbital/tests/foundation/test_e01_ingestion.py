from datetime import datetime, timedelta, timezone
import json
from aetherus_domain import DataStatus, IngestionStatus
from aetherus_foundation import SourceIngestionEngine, retry_delay_seconds, redact_secret, redact_url

def test_e01_t01_duplicate_raw_hash_dedupe(repo, source, tmp_path):
    e=SourceIngestionEngine(repo,tmp_path/'raw'); t=datetime(2026,8,30,tzinfo=timezone.utc)
    a1,_=e.ingest_bytes(source,b'same',retrieved_at=t)
    a2,_=e.ingest_bytes(source,b'same',retrieved_at=t+timedelta(seconds=1))
    assert a1.id==a2.id and repo.counts()['raw_artifact']==1

def test_e01_t02_429_backoff_policy():
    assert [retry_delay_seconds(i) for i in range(4)]==[1,2,4,8]
    assert retry_delay_seconds(7)==60
    assert retry_delay_seconds(2,retry_after_seconds=17)==17

def test_e01_t03_partial_parse_quarantine(repo, source, tmp_path):
    e=SourceIngestionEngine(repo,tmp_path/'raw'); t=datetime(2026,8,30,tzinfo=timezone.utc)
    body=json.dumps({'records':[{'id':'A','name':'ok'},{'id':'B'}]}).encode()
    art,run,records=e.ingest_json_records(source,body,retrieved_at=t,required_fields={'id','name'})
    assert records==[{'id':'A','name':'ok'}]
    assert run.status==IngestionStatus.PARTIAL and repo.quarantine_count(art.id)==1

def test_e01_t04_secret_redaction(repo, source, tmp_path):
    e=SourceIngestionEngine(repo,tmp_path/'raw'); t=datetime(2026,8,30,tzinfo=timezone.utc)
    art,_=e.ingest_bytes(source,b'x',retrieved_at=t,source_uri='https://example.test/data?api_key=secret&x=1',metadata={'authorization':'Bearer abc123','nested':{'token':'xyz'}},request_metadata={'x-api-key':'qwerty'})
    assert 'secret' not in (art.source_uri or '')
    assert art.metadata['authorization']=='[REDACTED]'
    assert art.metadata['nested']['token']=='[REDACTED]'
    assert redact_secret('Bearer abc123')=='Bearer [REDACTED]'

def test_e01_t05_source_outage_stale_behavior(repo, source, tmp_path):
    e=SourceIngestionEngine(repo,tmp_path/'raw'); t=datetime(2026,8,30,tzinfo=timezone.utc)
    assert e.source_status(source,now=t,current_request_ok=False)==DataStatus.UNAVAILABLE
    e.ingest_bytes(source,b'x',retrieved_at=t)
    assert e.source_status(source,now=t+timedelta(seconds=30),current_request_ok=False)==DataStatus.STALE
