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

class BudgetTest(unittest.TestCase):
    """하루 경계는 KST · 시간당 배분 (2026-09-07 추가).

    왜 이 테스트가 필요한가: 허브 용량은 KST 자정에 풀린다(09-05·09-06 차단 구간으로 확인).
    UTC 로 세면 9시간이 어긋나 '오늘 얼마나 남았나'를 계산할 수 없다.
    """
    def setUp(self): kma_hub.ledger.reset()

    def test_day_key_is_kst_not_utc(self):
        from datetime import datetime, timezone
        # 2026-09-06 16:00Z = 2026-09-07 01:00 KST → 회계는 09-07 로 가야 한다
        now = datetime(2026, 9, 6, 16, 0, tzinfo=timezone.utc)
        self.assertEqual(kma_hub.kst_day(now), "2026-09-07")
        s3 = FakeS3()
        with kma_hub.track("a.php"): pass
        kma_hub.flush(s3, "b", "kma-warn", now)
        self.assertIn("wind/kma-calls/2026-09-07.json", s3.objs)
        self.assertIn("wind/kma-calls/2026-09-07/kma-warn.json", s3.objs)

    def _ledger(self, s3, day, calls):
        s3.objs[f"wind/kma-calls/{day}.json"] = json.dumps({"total": {"calls": calls}}).encode()

    def test_safety_feeds_never_paced(self):
        from datetime import datetime, timezone
        s3 = FakeS3(); self._ledger(s3, "2026-09-07", 99999)
        now = datetime(2026, 9, 6, 21, 0, tzinfo=timezone.utc)      # 09-07 06:00 KST
        for name in ("kma-warn", "quake-asia", "kma-lightning", "typhoon-official", "kma-aws-min"):
            ok, why = kma_hub.pace(s3, "b", name, 1, now)
            self.assertTrue(ok, f"{name} 은 배분에서 빼면 안 된다 ({why})")

    def test_early_hour_overspend_is_blocked(self):
        from datetime import datetime, timezone
        s3 = FakeS3(); self._ledger(s3, "2026-09-07", 1000)
        now = datetime(2026, 9, 6, 21, 0, tzinfo=timezone.utc)      # 06:00 KST = 하루의 25%
        self.assertLess(kma_hub.DAILY_BUDGET * 0.25 + kma_hub.BUDGET_GRACE, 1000, "이 테스트의 전제")
        ok, why = kma_hub.pace(s3, "b", "kma-fcst", 80, now)        # 허용 = 예산*0.25 + 유예
        self.assertFalse(ok, why)

    def test_late_hour_same_spend_passes(self):
        from datetime import datetime, timezone
        s3 = FakeS3(); self._ledger(s3, "2026-09-07", 1000)
        now = datetime(2026, 9, 7, 9, 0, tzinfo=timezone.utc)       # 18:00 KST = 하루의 75%
        ok, why = kma_hub.pace(s3, "b", "kma-fcst", 80, now)        # 허용 = 예산*0.75 + 유예
        self.assertTrue(ok, why)

    def test_missing_ledger_does_not_block(self):
        from datetime import datetime, timezone
        # 회계를 못 읽었다고 수집을 멈추면 안 된다 — 회계는 보조 장치다
        ok, why = kma_hub.pace(FakeS3(), "b", "kma-fcst", 80,
                               datetime(2026, 9, 6, 21, 0, tzinfo=timezone.utc))
        self.assertTrue(ok, why)

    def test_grace_lets_first_run_through_at_midnight(self):
        from datetime import datetime, timezone
        s3 = FakeS3(); self._ledger(s3, "2026-09-07", 0)
        now = datetime(2026, 9, 6, 15, 1, tzinfo=timezone.utc)      # 00:01 KST
        ok, why = kma_hub.pace(s3, "b", "kma-mountain", 125, now)   # 가장 비싼 회차
        self.assertTrue(ok, why)


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

    def _s3(self, M, stored):
        """SRC_STATIONS 는 지점표, DST 는 이미 올려둔 예보를 돌려주는 가짜 S3."""
        puts = []
        stations = {"stations": [{"id": "1", "name": "a", "lat": 37.5, "lon": 127.0},
                                 {"id": "2", "name": "b", "lat": 35.1, "lon": 129.0}]}
        def get_object(**k):
            body = stored if k["Key"] == M.DST else stations
            if body is None:
                raise KeyError(k["Key"])
            return {"Body": io.BytesIO(json.dumps(body).encode())}
        return types.SimpleNamespace(get_object=get_object,
                                     put_object=lambda **k: puts.append(k["Key"])), puts

    def _want(self, M):
        from datetime import datetime
        d, t = M.base_runs(datetime.now(M.KST))[0]
        return f"{d}{t}"

    def test_skips_when_latest_base_already_stored(self):
        """같은 회차를 다시 받지 않는다 — 허브 호출 0 (2026-09-07).

        왜: 동네예보는 하루 8회 발표인데 스케줄이 매시라 24회 중 16회가 같은 값을 다시 받았다.
        2026-09-06 실측으로 이 Lambda 혼자 1,883회 — 허브 하루 사용량의 43%였다.
        """
        M = self.M; calls = []
        M.get_json = lambda url: calls.append(url)
        want = self._want(M)
        M.s3, puts = self._s3(M, {"points": [{"baseKst": want}, {"baseKst": want}], "failedCells": 0})
        out = M.handler.__wrapped__({}, None)
        self.assertEqual(out.get("skipped"), "same-base", out)
        self.assertEqual(calls, [], "이미 받아 둔 회차인데 허브를 불렀다")
        self.assertEqual(puts, [], "받은 게 없는데 S3 를 덮어썼다")

    def test_does_not_skip_when_a_cell_failed_last_time(self):
        """실패한 칸이 남아 있으면 다음 시간에 다시 받는다 — 매시 실행을 남겨 둔 이유다."""
        M = self.M; calls = []
        def fake_get_json(url):
            calls.append(url)
            raise urllib.error.URLError("boom")
        M.get_json = fake_get_json
        want = self._want(M)
        M.s3, _ = self._s3(M, {"points": [{"baseKst": want}], "failedCells": 3})
        M.handler.__wrapped__({}, None)
        self.assertTrue(calls, "실패 칸이 있는데 건너뛰었다")

    def test_does_not_skip_when_base_is_old(self):
        """발표 회차가 바뀌었으면 당연히 다시 받는다."""
        M = self.M; calls = []
        def fake_get_json(url):
            calls.append(url)
            raise urllib.error.URLError("boom")
        M.get_json = fake_get_json
        M.s3, _ = self._s3(M, {"points": [{"baseKst": "202001010200"}], "failedCells": 0})
        M.handler.__wrapped__({}, None)
        self.assertTrue(calls, "낡은 회차인데 건너뛰었다")

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
