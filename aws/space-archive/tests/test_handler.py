"""space-archive 순수 함수 검증 — python -m pytest aws/space-archive/tests -q (boto3 없이도 돈다)."""
import importlib
import os
import sys
import types

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("CACHE_BUCKET", "test-bucket")
if "boto3" not in sys.modules:
    fake = types.ModuleType("boto3")
    fake.client = lambda *a, **k: None
    sys.modules["boto3"] = fake
    exc = types.ModuleType("botocore.exceptions")
    class ClientError(Exception):
        pass
    exc.ClientError = ClientError
    sys.modules["botocore"] = types.ModuleType("botocore")
    sys.modules["botocore.exceptions"] = exc
H = importlib.import_module("handler")


def test_orbit_row_iss_like():
    # ISS: 15.498 rev/day, e=0.00077, i=51.64 → 약 417/424 km, 92.9 분
    row = H.orbit_row(["2024-11-05T12:53:31", 15.49811183, 0.0007742, 51.6403])
    assert row[0] in range(405, 430) and row[1] in range(410, 440)
    assert row[2] == 516 and row[3] == 929


def test_orbit_row_rejects_bad():
    assert H.orbit_row(["x", 0, 0.1, 10]) is None
    assert H.orbit_row(["x", 15.0, 1.2, 10]) is None
    assert H.orbit_row([]) is None


def test_update_history_appends_and_trims():
    hist = None
    for d in range(1, 17):
        dt = f"2026-09-{d:02d}"
        objs = {"25544": [417, 424, 516, 929]}
        if d == 3:
            objs["99999"] = [500, 510, 980, 945]     # 하루만 보인 물체
        hist = H.update_history(hist, dt, objs)
    assert len(hist["days"]) == H.HISTORY_DAYS
    assert hist["days"][0] == "2026-09-03" and hist["days"][-1] == "2026-09-16"
    assert len(hist["objects"]["25544"]) == H.HISTORY_DAYS
    assert hist["objects"]["99999"][0] == [500, 510, 980, 945] and hist["objects"]["99999"][1] is None
    # 같은 날 다시 돌면 덮어쓴다(추가 안 됨)
    again = H.update_history(hist, "2026-09-16", {"25544": [416, 423, 516, 929]})
    assert len(again["days"]) == H.HISTORY_DAYS and again["objects"]["25544"][-1] == [416, 423, 516, 929]


def test_update_history_drops_all_null():
    hist = H.update_history(None, "2026-09-01", {"1": [1, 2, 3, 4]})
    for d in range(2, 17):
        hist = H.update_history(hist, f"2026-09-{d:02d}", {"2": [1, 1, 1, 1]})
    assert "1" not in hist["objects"] and "2" in hist["objects"]


def test_hour_snapshot_keeps_only_screen_fields_and_nulls_missing():
    from datetime import datetime, timezone
    now = datetime(2026, 9, 7, 3, 0, tzinfo=timezone.utc)
    launches = {"generated": "g", "live": [{"id": "a", "name": "F9", "net": "n", "image": "x", "status": "In Flight"}],
                "launches": [{"id": "b", "name": "S", "lat": 1, "lon": 2}]}
    conj = {"data": {"events": [{"primary": {"catalog_id": "1", "canonical_name": "A"}, "secondary": {"catalog_id": "2", "canonical_name": "B"},
                                 "tca": "t", "latest_snapshot": {"miss_distance_m": 18400, "metrics": {}}}]}}
    doc = H.hour_snapshot(now, launches, conj, {"generated_at": "p"}, "c")
    assert doc["launches"]["live"][0] == {"id": "a", "name": "F9", "net": "n", "status": "In Flight"}
    assert "image" not in doc["launches"]["live"][0]
    ev = doc["conjunctions"]["events"][0]
    assert ev["missM"] == 18400 and ev["pc"] == "NOT_COMPUTED" and doc["conjunctions"]["publishedAt"] == "p"
    empty = H.hour_snapshot(now, None, None, None, None)
    assert empty["launches"] is None and empty["conjunctions"] is None


def test_update_index_orders_and_caps():
    idx = None
    for d in range(1, 50):
        idx = H.update_index(idx, f"2026-07-{d:02d}" if d <= 31 else f"2026-08-{d-31:02d}", "03", d % 2 == 0)
    assert len(idx["days"]) == H.INDEX_DAYS
    idx = H.update_index(idx, "2026-08-17", "05", False)
    day = [d for d in idx["days"] if d["dt"] == "2026-08-17"][0]
    assert day["hours"] == ["03", "05"] and day["catalog"] is True
