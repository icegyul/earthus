"""지시서 D-4 — 발표 원문 보존: 키 규칙, 불변(중복 안 씀), sourceRef 기록."""
import importlib.util, os, pathlib, sys, types, unittest
if "boto3" not in sys.modules:
    boto3 = types.ModuleType("boto3"); boto3.client = lambda *a, **k: object(); sys.modules["boto3"] = boto3
os.environ.setdefault("CACHE_BUCKET", "test-bucket")
SPEC = importlib.util.spec_from_file_location("tyoff", pathlib.Path(__file__).parent.parent / "handler.py")
M = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)

class Precondition(Exception):
    response = {"Error": {"Code": "PreconditionFailed"}}

class FakeS3:
    def __init__(self): self.objs = {}; self.puts = 0
    def put_object(self, Bucket, Key, Body, **kw):
        self.puts += 1
        if kw.get("IfNoneMatch") == "*" and Key in self.objs: raise Precondition()
        self.objs[Key] = Body

class ArchiveTest(unittest.TestCase):
    def test_key_rule(self):
        self.assertEqual(M.archive_key("KROVANH", "KMA", "2026-09-05T06:00:00Z"), "events/typhoon-official/archive/KROVANH/KMA-202609050600.json")
        self.assertIsNone(M.archive_key("KROVANH", "KMA", None))
        self.assertEqual(M.archive_key("bang lang", "JMA", "2026-09-05T15:45:00Z").split("/")[3], "BANG_LANG")
    def test_immutable_and_sourceref(self):
        s3 = FakeS3()
        storms = [{"key": "KROVANH", "name": "Krovanh", "agencies": [
            {"agency": "KMA", "issue": "2026-09-05T06:00:00Z", "steps": [{"h": 0, "lat": 26.3, "lon": 127.4}]},
            {"agency": "JMA", "issue": "2026-09-05T15:45:00Z", "steps": []},
            {"agency": "NHC", "issue": None, "steps": []}]}]
        w, k = M.archive_records(s3, storms, "2026-09-05T09:00:00Z")
        self.assertEqual((w, k), (2, 0))
        self.assertEqual(storms[0]["agencies"][0]["sourceRef"], "events/typhoon-official/archive/KROVANH/KMA-202609050600.json")
        self.assertNotIn("sourceRef", storms[0]["agencies"][2])
        import json
        saved = json.loads(s3.objs[storms[0]["agencies"][0]["sourceRef"]])
        self.assertEqual(saved["record"]["steps"][0]["lat"], 26.3); self.assertNotIn("sourceRef", saved["record"])
        # 같은 발표를 다시 만나면 쓰지 않는다 — 원문은 불변
        storms[0]["agencies"][0]["steps"][0]["lat"] = 99
        w2, k2 = M.archive_records(s3, storms, "2026-09-05T12:00:00Z")
        self.assertEqual((w2, k2), (0, 2))
        self.assertEqual(json.loads(s3.objs[storms[0]["agencies"][0]["sourceRef"]])["record"]["steps"][0]["lat"], 26.3)

if __name__ == "__main__": unittest.main()
