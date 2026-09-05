"""GDACS 축약본 — ingestTC 필드 계약 유지, Point 만, 원본 값 그대로."""
import importlib.util, os, pathlib, sys, types, unittest
if "boto3" not in sys.modules:
    boto3 = types.ModuleType("boto3"); boto3.client = lambda *a, **k: object(); sys.modules["boto3"] = boto3
os.environ.setdefault("CACHE_BUCKET", "b")
SPEC = importlib.util.spec_from_file_location("gdacs_tc", pathlib.Path(__file__).parent.parent / "handler.py")
M = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)

def feat(eid, ep, gtype="Point", **props):
    p = {"eventtype": "TC", "eventid": eid, "episodeid": ep, "eventname": f"N{eid}-26", "name": f"N{eid}-26", "alertlevel": "Green", "country": "Japan",
         "fromdate": "2026-09-01T00:00:00", "todate": "2026-09-05T00:00:00", "url": {"geometry": "x" * 300}, "htmldescription": "<b>" * 100,
         "severitydata": {"severity": 20.5, "severityunit": "m/s", "severitytext": "Tropical storm", "extra": "y" * 200}, **props}
    g = {"type": gtype, "coordinates": [126.7, 27.7] if gtype == "Point" else [[[0, 0], [1, 1]]]}
    return {"type": "Feature", "id": f"{eid}-{ep}", "geometry": g, "properties": p}

class CompactTest(unittest.TestCase):
    def test_point_only_and_fields(self):
        out = M.compact({"features": [feat(1, 3), feat(1, 3, "Polygon"), feat(1, 3, "LineString"), feat(2, 1)]})
        self.assertEqual(len(out), 2)
        f = next(x for x in out if x["properties"]["eventid"] == 1)
        for k in ("eventid", "episodeid", "eventname", "name", "alertlevel", "country", "fromdate", "todate"):
            self.assertEqual(f["properties"][k], feat(1, 3)["properties"][k])   # 값 그대로
        self.assertEqual(f["geometry"], {"type": "Point", "coordinates": [126.7, 27.7]})
        self.assertNotIn("url", f["properties"]); self.assertNotIn("htmldescription", f["properties"])
        self.assertEqual(f["properties"]["severitydata"], {"severity": 20.5, "severityunit": "m/s", "severitytext": "Tropical storm"})
    def test_latest_episode_wins(self):
        out = M.compact({"features": [feat(7, 2), feat(7, 5), feat(7, 3)]})
        self.assertEqual(len(out), 1); self.assertEqual(out[0]["properties"]["episodeid"], 5)
    def test_size_reduction(self):
        import json
        doc = {"features": [feat(i, 1) for i in range(20)] + [feat(i, 1, "Polygon") for i in range(20)]}
        self.assertLess(len(json.dumps(M.compact(doc))), len(json.dumps(doc)) * 0.3)

if __name__ == "__main__": unittest.main()
