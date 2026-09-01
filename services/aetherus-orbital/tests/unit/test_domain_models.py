from datetime import datetime, timezone
from hashlib import sha256
from aetherus_domain.models import EvidenceRecord, EvidenceClass, SourceGrade
import pytest

def test_evidence_requires_aware_time_and_hash():
    e=EvidenceRecord(evidence_class=EvidenceClass.OBSERVED,source_id='x',observed_at=datetime.now(timezone.utc),received_at=datetime.now(timezone.utc),checksum_sha256=sha256(b'x').hexdigest(),source_grade=SourceGrade.OFFICIAL_PUBLIC)
    assert e.source_id=='x'
    with pytest.raises(Exception):
        EvidenceRecord(evidence_class=EvidenceClass.OBSERVED,source_id='x',observed_at=datetime.now(),received_at=datetime.now(timezone.utc),checksum_sha256=sha256(b'x').hexdigest(),source_grade=SourceGrade.OFFICIAL_PUBLIC)
