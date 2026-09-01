from __future__ import annotations
import json
from datetime import datetime,timezone
from pathlib import Path
from aetherus_foundation import LocalFoundationRepository, SourceIngestionEngine
from aetherus_providers import CelesTrakGPProvider, ProviderResponse, ProviderIngestionCoordinator


def test_provider_response_enters_e01_raw_before_normalized_candidates(tmp_path):
    repo=LocalFoundationRepository(tmp_path/'provider.sqlite')
    ingestion=SourceIngestionEngine(repo,tmp_path/'raw')
    coord=ProviderIngestionCoordinator(ingestion)
    provider=CelesTrakGPProvider()
    payload=[{"OBJECT_NAME":"ISS (ZARYA)","OBJECT_ID":"1998-067A","NORAD_CAT_ID":25544,"EPOCH":"2026-08-30T00:00:00.000000","MEAN_MOTION":15.5,"ECCENTRICITY":0.0005,"INCLINATION":51.64,"RA_OF_ASC_NODE":10.0,"ARG_OF_PERICENTER":20.0,"MEAN_ANOMALY":30.0}]
    raw=json.dumps(payload,separators=(',',':')).encode()
    response=ProviderResponse(provider.source_id,provider.build_url(catnr='25544',format='JSON'),datetime(2026,8,30,tzinfo=timezone.utc),'application/json',raw,payload,False)
    result=coord.ingest_response(provider,response,observed_at=datetime(2026,8,30,tzinfo=timezone.utc))
    assert repo.counts()['raw_artifact']==1
    assert result.normalized_records[0]['catalog_id']=='25544'
    assert result.normalized_records[0]['cospar_id']=='1998-067A'
    assert result.live is False
    # Reprocessing the exact provider bytes deduplicates the immutable raw artifact.
    again=coord.ingest_response(provider,response,observed_at=datetime(2026,8,30,tzinfo=timezone.utc))
    assert again.artifact_id==result.artifact_id
    assert repo.counts()['raw_artifact']==1
