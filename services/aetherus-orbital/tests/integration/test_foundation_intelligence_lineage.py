from datetime import datetime, timezone
from pathlib import Path
from aetherus_foundation import FoundationE2EPipeline, LocalFoundationRepository

ROOT=Path(__file__).resolve().parents[2]
FIXTURE=ROOT/'fixtures/official/NASA_APOLLO11_MISSION_OVERVIEW_FIXED_OFFICIAL_FIXTURE.json'

def test_foundation_state_graph_event_share_same_evidence_lineage(tmp_path):
    repo=LocalFoundationRepository(tmp_path/'integration.sqlite')
    result=FoundationE2EPipeline(repo,tmp_path/'raw').run_fixed_official_apollo11_fixture(
        FIXTURE,retrieved_at=datetime(2026,8,30,4,50,tzinfo=timezone.utc)
    )
    evidence_id=result['evidence'].id
    stored_state=repo.get_digital_state(result['state'].id)
    assert stored_state is not None and evidence_id in stored_state.source_evidence_ids
    assert result['relation'].provenance_evidence_id==evidence_id
    assert result['revision'].evidence_ids==[evidence_id]
    assert [e.id for e in result['packet'].evidence]==[evidence_id]
    assert repo.get_evidence(evidence_id).checksum_sha256==result['artifact'].content_sha256
    repo.close()
