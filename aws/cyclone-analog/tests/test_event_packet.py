"""공개 사건 패킷 v1(지시서 D-1) — 회차 변화·중요도 이유·신뢰도·상태 판정을 고정한다."""
import importlib.util, os, pathlib, sys, types, unittest
from datetime import datetime, timezone
if "boto3" not in sys.modules:
    boto3 = types.ModuleType("boto3"); boto3.client = lambda *a, **k: object(); sys.modules["boto3"] = boto3
os.environ.setdefault("CACHE_BUCKET", "test-bucket")
SPEC = importlib.util.spec_from_file_location("cyclone_packet", pathlib.Path(__file__).parent.parent / "handler.py")
M = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)

def kma(issue, lat, lon, wind, course):
    return {"agency": "KMA", "issued": issue, "steps": [
        {"h": 0, "validUtc": issue.replace("-", "").replace("T", "").replace(":", "")[:12], "lat": lat, "lon": lon, "windMs": wind, "hpa": 990, "courseKo": course},
        {"h": 24, "lat": lat + 1.5, "lon": lon + (1.8 if course == "북동" else 0), "windMs": wind + 1}]}
def jma(issue, lat, lon):
    return {"agency": "JMA", "issued": issue, "steps": [{"h": 0, "validKst": "2026-09-05T09:00:00+09:00", "lat": lat, "lon": lon, "windMs": 20, "categoryKo": "열대폭풍"},
                                                        {"h": 24, "lat": lat + 1.5, "lon": lon + 1.7, "windMs": 18}]}
NOW = datetime(2026, 9, 5, 3, tzinfo=timezone.utc)
def session():
    return {"id": "9", "name": "TESTY-26", "status": "ACTIVE", "alert": "Orange", "live": True, "detectedAt": "2026-09-04T00:00:00Z", "lastSeen": "2026-09-05T02:00:00Z",
            "snapshots": [{"issuedAt": "2026-09-04T12:00:00Z", "forecasts": [kma("2026-09-04T12:00:00Z", 30.0, 128.0, 21, "북"), jma("2026-09-04T12:00:00Z", 30.1, 128.1)]},
                          {"issuedAt": "2026-09-05T00:00:00Z", "forecasts": [kma("2026-09-05T00:00:00Z", 31.0, 128.2, 24, "북동"), jma("2026-09-05T00:00:00Z", 31.1, 128.3)]}]}
WARN = {"active": [{"regionId": "S1", "region": "남해동부", "kind": "풍랑", "level": "경보"}]}
REGIONS = {"regions": {"S1": {"name": "남해동부", "lat": 33.5, "lon": 128.5}}}

class PacketTest(unittest.TestCase):
    def setUp(self):
        s = session(); self.p = M.event_packet(s, NOW, M.public_detail(s, NOW), WARN, REGIONS)
    def test_changes_between_revisions(self):
        r = self.p["revisions"][-1]
        fields = {c["field"]: c for c in r["changes"]}
        self.assertEqual(fields["KMA.h0.windMs"]["delta"], 3)
        self.assertEqual(fields["KMA.heading24"]["to"], "북동")
        self.assertIn("실황 21→24 m/s 강화", r["changeSummaryKo"]); self.assertIn("24h 방향", r["changeSummaryKo"])
        self.assertEqual(self.p["revisions"][0]["changeSummaryKo"], "첫 회차")
    def test_importance_reasons_and_confidence(self):
        self.assertIn("공식 경보 Orange", self.p["importance"]["reasons"])
        self.assertTrue(any("특보구역" in r for r in self.p["importance"]["reasons"]))
        self.assertEqual(self.p["confidence"]["level"], "high")
        self.assertIsNone(self.p["uncertainty"]["ensembleSpreadKm"])
        self.assertGreater(self.p["uncertainty"]["agencySpreadKm"]["24"], 0)
    def test_status_watch_and_resolved(self):
        s = session(); s["lastSeen"] = "2026-09-02T00:00:00Z"; s["snapshots"][-1]["forecasts"] = []
        self.assertEqual(M.event_status(s, NOW)[0], "WATCH")
        s["live"] = False
        self.assertEqual(M.event_status(s, NOW)[0], "RESOLVED")
        self.assertEqual(M.event_status(session(), NOW)[0], "ACTIVE")
    def test_no_values_invented(self):
        s = session(); s["snapshots"][-1]["forecasts"][0]["steps"][0]["windMs"] = None
        p = M.event_packet(s, NOW, M.public_detail(s, NOW))
        self.assertFalse(any(c["field"].endswith("windMs") for c in p["revisions"][-1]["changes"]))
        self.assertIsNone(p["importance"]["inputs"]["nearestWarnRegionKm"])
if __name__ == "__main__": unittest.main()
