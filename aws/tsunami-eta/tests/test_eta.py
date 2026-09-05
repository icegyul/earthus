"""지시서 N-1 — 도달시간 물리·등시선·게시문 대조·사건 선별을 고정한다."""
import importlib.util, math, os, pathlib, sys, types, unittest
from datetime import datetime, timezone
import numpy as np
os.environ.setdefault("CACHE_BUCKET", "test-bucket")
SPEC = importlib.util.spec_from_file_location("tsueta", pathlib.Path(__file__).parent.parent / "handler.py")
M = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)

class TravelTest(unittest.TestCase):
    def test_flat_ocean_matches_sqrt_gh_along_axis(self):
        depth = np.full((101, 101), 4000.0)             # 4 km 균일 바다, 0.2° 판, 남쪽 -10°, 서쪽 100°
        T, src = M.travel_time(depth, -10.0, 100.0, 0.0, 110.0)
        c = math.sqrt(9.81 * 4000)                       # ≈198 m/s
        r, cc = src[:2]
        north_10cells = T[r + 10, cc]                    # 10셀 = 2.0° = 222.39 km
        expect = 111_195 * 2.0 / c / 60
        self.assertAlmostEqual(north_10cells, expect, delta=expect * 0.01)
        diag = T[r + 10, cc + 10]                        # 대각선은 직선과 같아야 한다(8방향 대각 이동 허용)
        expect_d = math.hypot(111_195 * 2.0, 111_195 * 2.0 * math.cos(math.radians(1.0))) / c / 60
        self.assertAlmostEqual(diag, expect_d, delta=expect_d * 0.03)
    def test_land_blocks_and_source_snaps_to_sea(self):
        depth = np.full((41, 41), 2000.0); depth[:, 20] = np.nan   # 남북으로 육지 띠
        T, src = M.travel_time(depth, 0.0, 0.0, 4.0, 2.0)
        self.assertTrue(np.isinf(T[20, 30]))             # 띠 건너편은 못 간다
        T2, src2 = M.travel_time(depth, 0.0, 0.0, 4.0, 4.0)   # 진원이 육지(열 20) → 이웃 바다 셀에서 시작
        self.assertIsNotNone(src2); self.assertNotEqual(src2[1], 20)
    def test_shallow_is_slower(self):
        deep = np.full((31, 31), 5000.0); shallow = np.full((31, 31), 50.0)
        Td, s = M.travel_time(deep, 0, 0, 3, 3); Ts, _ = M.travel_time(shallow, 0, 0, 3, 3)
        self.assertGreater(Ts[s[0] + 5, s[1]], Td[s[0] + 5, s[1]] * 5)
    def test_station_eta_null_when_unreached(self):
        depth = np.full((21, 21), 3000.0); depth[10:, :] = np.nan
        T, _ = M.travel_time(depth, 0, 0, 0.5, 1.0)
        st = M.station_etas(T, 0, 0, stations=[("X", "바다", 0.6, 1.4), ("X", "육지깊숙", 3.5, 1.0), ("X", "창밖", 50, 50)])
        self.assertIsNotNone(st[0]["etaMin"]); self.assertIsNone(st[1]["etaMin"]); self.assertEqual(st[2]["note"], "계산 창 밖")

class ContourTest(unittest.TestCase):
    def test_isochrone_ring_radius(self):
        depth = np.full((101, 101), 4000.0)
        T, src = M.travel_time(depth, -10.0, 100.0, 0.0, 110.0)
        iso = M.contours(T, -10.0, 100.0, 0.2, [60], coarse=0.2)
        segs = iso["60"]; self.assertGreater(len(segs), 20)
        c = math.sqrt(9.81 * 4000); rk = c * 3600 / 1000    # 60분 반경 km
        for p, q in segs[:50]:
            d = M.dist_km(0.0, 110.0, p[0], p[1])
            self.assertLess(abs(d - rk) / rk, 0.12)

class BulletinTest(unittest.TestCase):
    def test_parse_rows_and_compare(self):
        text = """... ESTIMATED INITIAL TSUNAMI WAVE ARRIVAL TIMES ...
  LOCATION           REGION       COORDINATES      ARRIVAL TIME
  BUSAN              SOUTH KOREA   35.1N 129.0E     0630Z 05 SEP
  HILO               HAWAII        19.7N 155.1W     1200Z 05 SEP
"""
        origin = datetime(2026, 9, 5, 5, 0, tzinfo=timezone.utc)
        rows = M.parse_bulletin_eta(text, origin)
        self.assertEqual([r["etaMin"] for r in rows], [90, 420])
        ours = [{"name": "부산", "lat": 35.10, "lon": 129.04, "etaMin": 100}, {"name": "힐로", "lat": 19.73, "lon": -155.06, "etaMin": None}]
        cmp = M.compare_official(ours, rows)
        self.assertEqual(len(cmp), 1); self.assertEqual(cmp[0]["diffMin"], 10)
    def test_information_statement_has_no_table(self):
        self.assertEqual(M.parse_bulletin_eta("TSUNAMI INFORMATION STATEMENT ... NO THREAT", datetime(2026, 9, 5, tzinfo=timezone.utc)), [])

class PickTest(unittest.TestCase):
    def test_filters_land_small_deep(self):
        grid = np.full((1800, 3600), 100, dtype=np.int16); grid[:, :1800] = -3000   # 서반구는 바다
        f = lambda lon, mag, depth: {"id": f"e{lon}{mag}{depth}", "properties": {"mag": mag, "place": "p", "time": 1}, "geometry": {"coordinates": [lon, 0, depth]}}
        picked = M.pick_events([f(-100, 7.0, 10), f(100, 7.0, 10), f(-100, 6.0, 10), f(-100, 7.0, 300)], grid)
        self.assertEqual([p["id"] for p in picked], ["e-1007.010"])

if __name__ == "__main__": unittest.main()
