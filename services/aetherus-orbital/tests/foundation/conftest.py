from datetime import datetime, timezone
import pytest
from aetherus_domain import DataSourcePolicy, EvidenceClass, SourceGrade
from aetherus_foundation import LocalFoundationRepository, SourceIngestionEngine, EvidenceProvenanceEngine

@pytest.fixture
def repo(tmp_path):
    r=LocalFoundationRepository(tmp_path/'foundation.sqlite')
    yield r
    r.close()

@pytest.fixture
def source():
    return DataSourcePolicy(id='NASA_TEST',name='NASA fixed official fixture',source_grade=SourceGrade.OFFICIAL_PUBLIC,license_policy='PUBLIC_OFFICIAL_FIXTURE',access_policy='PUBLIC',stale_after_seconds=3600)

@pytest.fixture
def evidence(repo, source, tmp_path):
    t=datetime(2026,8,30,0,0,tzinfo=timezone.utc)
    art,_=SourceIngestionEngine(repo,tmp_path/'raw').ingest_bytes(source,b'{"official":true}',retrieved_at=t,observed_at=t,source_uri='https://www.nasa.gov/')
    return EvidenceProvenanceEngine(repo).evidence_from_raw(art,source,evidence_class=EvidenceClass.OFFICIAL).evidence
