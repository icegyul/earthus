"""KMA 허브 호출 회계 (PHASE 1) — 지시서 §5 TEST 1~8."""
import importlib.util, io, json, os, pathlib, socket, sys, types, unittest, urllib.error
SHARED = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(SHARED))
import kma_hub  # noqa: E402

def http_error(code):
    return urllib.error.HTTPError("https://apihub.kma.go.kr/api/x.php", code, "x", {}, io.BytesIO(b""))

class FakeS3:
    def __init__(self): self.objs = {}; self.puts = []
    def get_object(self, Bucket, Key):
        if Key not in self.objs: raise KeyError(Key)
        return {"Body": io.BytesIO(self.objs[Key]), "ETag": f'"{len(self.objs[Key])}"'}
    def put_object(self, Bucket, Key, Body, **kw):
        self.objs[Key] = Body; self.puts.append(Key)

class LedgerTest(unittest.TestCase):
    def setUp(self): kma_hub.ledger.reset()
    def call(self, label, exc=None, url=None):
        with kma_hub.track(label, url):
            if exc: raise exc
    def test_1_ten_success(self):
        for _ in range(10): self.call("wrn_now_data.php")
        self.assertEqual(kma_hub.ledger.counts["calls"], 10); self.assertEqual(kma_hub.ledger.counts["success"], 10)
        self.assertFalse(kma_hub.stop())
    def test_2_403_sets_quota_and_stops(self):
        with self.assertRaises(urllib.error.HTTPError): self.call("a.php", http_error(403))
        self.assertEqual(kma_hub.ledger.counts["quota_exhausted"], 1); self.assertTrue(kma_hub.stop())
    def test_3_timeout_is_not_quota(self):
        with self.assertRaises(socket.timeout): self.call("a.php", socket.timeout("timed out"))
        with self.assertRaises(urllib.error.URLError): self.call("a.php", urllib.error.URLError("The read operation timed out"))
        c = kma_hub.ledger.counts; self.assertEqual(c["timeout"], 2); self.assertEqual(c["quota_exhausted"], 0); self.assertFalse(kma_hub.stop())
    def test_4_5xx_upstream(self):
        with self.assertRaises(urllib.error.HTTPError): self.call("a.php", http_error(502))
        self.assertEqual(kma_hub.ledger.counts["upstream_error"], 1)
    def test_5_empty(self):
        self.call("a.php"); kma_hub.note_empty("a.php")
        c = kma_hub.ledger.counts; self.assertEqual((c["success"], c["empty"], c["calls"]), (0, 1, 1))
    def test_6_malformed(self):
        with self.assertRaises(ValueError): self.call("a.php", json.JSONDecodeError("x", "", 0))
        self.assertEqual(kma_hub.ledger.counts["invalid_response"], 1)
        self.call("a.php"); kma_hub.note_invalid("a.php"); self.assertEqual(kma_hub.ledger.counts["invalid_response"], 2)
    def test_7_no_calls_after_quota(self):
        with self.assertRaises(urllib.error.HTTPError): self.call("a.php", http_error(403))
        with self.assertRaises(kma_hub.QuotaExhausted): self.call("b.php")      # 두 번째는 부르지도 않는다
        self.assertEqual(kma_hub.ledger.counts["calls"], 1)
    def test_non_hub_hosts_not_counted(self):
        self.call("jma", url="https://www.jma.go.jp/bosai/typhoon/data/x.json")
        self.assertEqual(kma_hub.ledger.counts["calls"], 0)
    def test_flush_merges_and_trend(self):
        s3 = FakeS3()
        from datetime import datetime, timezone
        now = datetime(2026, 9, 6, 1, 0, tzinfo=timezone.utc)
        s3.objs["wind/kma-calls/2026-09-05.json"] = json.dumps({"total": {"calls": 200}}).encode()
        for _ in range(3): self.call("a.php")
        kma_hub.flush(s3, "b", "kma-warn", now)
        kma_hub.ledger.reset(); self.call("a.php")
        with self.assertRaises(urllib.error.HTTPError): self.call("a.php", http_error(403))
        doc = kma_hub.flush(s3, "b", "kma-warn", now)
        svc = doc["services"]["kma-warn"]
        self.assertEqual((svc["calls"], svc["success"], svc["quota_exhausted"]), (5, 4, 1))
        self.assertEqual(doc["trend"]["yesterday_calls"], 200); self.assertEqual(doc["trend"]["today_calls"], 5)
        self.assertNotIn("quota_limit", json.dumps(doc)); self.assertTrue(doc["quotaHitToday"])
        own = json.loads(s3.objs["wind/kma-calls/2026-09-06/kma-warn.json"]); self.assertEqual(own["runs"], 2)

def load_handler(name):
    if "boto3" not in sys.modules:
        boto3 = types.ModuleType("boto3"); boto3.client = lambda *a, **k: object(); sys.modules["boto3"] = boto3
    os.environ.setdefault("CACHE_BUCKET", "test-bucket"); os.environ.setdefault("KMA_HUB_KEY", "k"); os.environ.setdefault("KMA_KEY", "k")
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), SHARED.parent / name / "handler.py")
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m

class FcstTest(unittest.TestCase):
    """TEST 7·8 — kma-fcst: 첫 403 뒤 회차·셀 호출 0, S3 미기록."""
    def setUp(self): kma_hub.ledger.reset(); self.M = load_handler("kma-fcst")
    def test_stops_after_first_403_and_does_not_write(self):
        M = self.M; calls = []
        def fake_get_json(url):
            calls.append(url)
            with kma_hub.track("getVilageFcst", "https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst?x"):
                raise http_error(403)
        M.get_json = fake_get_json
        puts = []
        M.s3 = types.SimpleNamespace(get_object=lambda **k: {"Body": io.BytesIO(json.dumps({"stations": [
            {"id": "1", "name": "a", "lat": 37.5, "lon": 127.0}, {"id": "2", "name": "b", "lat": 35.1, "lon": 129.0}, {"id": "3", "name": "c", "lat": 36.0, "lon": 128.0}]}).encode())},
            put_object=lambda **k: puts.append(k["Key"]))
        out = M.handler.__wrapped__({}, None)
        self.assertEqual(out.get("reason"), "quota_exhausted")
        self.assertEqual(len(calls), 1, f"403 뒤에도 호출했다: {len(calls)}")
        self.assertEqual(puts, [], "용량 초과인데 S3 를 덮어썼다")

class RadarTest(unittest.TestCase):
    def setUp(self): kma_hub.ledger.reset(); self.M = load_handler("kma-radar")
    def test_403_stops_candidates(self):
        M = self.M; calls = []
        def fake_fetch(tm):
            calls.append(tm)
            with kma_hub.track("rdr_cmp1_img", "https://apihub.kma.go.kr/api/typ03/cgi/rdr/nph-rdr_cmp1_img?x"):
                raise http_error(403)
        M.fetch_image = fake_fetch
        puts = []
        M.s3 = types.SimpleNamespace(put_object=lambda **k: puts.append(k["Key"]), get_object=lambda **k: (_ for _ in ()).throw(KeyError()))
        out = M.handler.__wrapped__({}, None)
        self.assertEqual(out.get("reason"), "quota_exhausted"); self.assertEqual(len(calls), 1); self.assertEqual(puts, [])
    def test_timeout_still_walks_candidates(self):
        M = self.M; calls = []
        def fake_fetch(tm):
            calls.append(tm)
            with kma_hub.track("rdr_cmp1_img", "https://apihub.kma.go.kr/x"):
                raise socket.timeout("timed out")
        M.fetch_image = fake_fetch
        M.s3 = types.SimpleNamespace(put_object=lambda **k: None, get_object=lambda **k: (_ for _ in ()).throw(KeyError()))
        with self.assertRaises(RuntimeError): M.handler.__wrapped__({}, None)
        self.assertGreater(len(calls), 1); self.assertEqual(kma_hub.ledger.counts["timeout"], len(calls))

if __name__ == "__main__": unittest.main()


class AllFailedNoOverwriteTest(unittest.TestCase):
    """PHASE 2 — 전 칸/전 지수 실패(timeout 등)여도 빈 문서로 이전 산출물을 덮지 않는다."""
    def test_fcst_timeout_everywhere_does_not_write(self):
        kma_hub.ledger.reset(); M = load_handler("kma-fcst")
        def fake_get_json(url):
            with kma_hub.track("getVilageFcst", "https://apihub.kma.go.kr/x"):
                raise socket.timeout("timed out")
        M.get_json = fake_get_json
        puts = []
        M.s3 = types.SimpleNamespace(get_object=lambda **k: {"Body": io.BytesIO(json.dumps({"stations": [{"id": "1", "name": "a", "lat": 37.5, "lon": 127.0}]}).encode())},
            put_object=lambda **k: puts.append(k["Key"]))
        out = M.handler.__wrapped__({}, None)
        self.assertEqual(out.get("reason"), "all-failed"); self.assertEqual(puts, [])
        self.assertGreater(kma_hub.ledger.counts["timeout"], 0); self.assertEqual(kma_hub.ledger.counts["quota_exhausted"], 0)
    def test_life_all_403_does_not_write(self):
        kma_hub.ledger.reset(); M = load_handler("kma-life")
        def fake_get(path, **p):
            with kma_hub.track(path, "https://apihub.kma.go.kr/x"):
                raise http_error(403)
        M.get = fake_get
        puts = []
        M.s3 = types.SimpleNamespace(put_object=lambda **k: puts.append(k["Key"]))
        out = M.handler.__wrapped__({}, None)
        self.assertEqual(out.get("reason"), "quota_exhausted"); self.assertEqual(puts, [])
        self.assertEqual(kma_hub.ledger.counts["calls"], 1)      # 지수 4 × 시도 17 = 68 이 아니라 1
