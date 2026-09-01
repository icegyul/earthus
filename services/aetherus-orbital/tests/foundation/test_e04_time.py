from datetime import datetime, timezone
import pytest
from aetherus_domain import CanonicalTimeContext, StateKind
from aetherus_foundation import UniversalSpaceTimeEngine

def test_e04_t01_naive_datetime_rejection():
    with pytest.raises(ValueError): UniversalSpaceTimeEngine().now_context(datetime(2026,8,30,0,0))

def test_e04_t02_utc_local_roundtrip():
    e=UniversalSpaceTimeEngine(); local=datetime(2026,8,30,13,41)
    c=e.resolve_local(local,'Asia/Seoul'); back=e.to_local(c,'Asia/Seoul')
    assert back.replace(tzinfo=None)==local and c.cursor_utc.hour==4

def test_e04_t03_replay_deterministic_cursor():
    e=UniversalSpaceTimeEngine(); c=CanonicalTimeContext(mode=StateKind.ARCHIVED_STATE,cursor_utc=datetime(1969,7,16,13,32,tzinfo=timezone.utc),archived_snapshot_id='apollo11')
    assert e.replay_cursor(c).cursor_id==e.replay_cursor(c).cursor_id

def test_e04_t04_future_model_vs_archived_state_separation():
    archived=CanonicalTimeContext(mode=StateKind.ARCHIVED_STATE,cursor_utc=datetime(1969,7,16,13,32,tzinfo=timezone.utc),archived_snapshot_id='s1')
    predicted=CanonicalTimeContext(mode=StateKind.PREDICTED_MODEL,cursor_utc=datetime(2027,1,1,tzinfo=timezone.utc),model_id='model-v1')
    assert archived.mode!=predicted.mode and archived.archived_snapshot_id and predicted.model_id
