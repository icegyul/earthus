"""lab-events 의 계산 부분만 고정한다 — 네트워크·S3 없이.

여진 기대수(Reasenberg-Jones), 오로라 경계·G 등급, 재진입 잔여수명, 채점 함수.
값을 지어내지 않는다는 규율: 채점할 쌍이 없으면 None, 기대수는 규모가 클수록 커야 한다.
"""

import importlib.util
import os
import pathlib
import sys
import types
import unittest

if "boto3" not in sys.modules:
    boto3 = types.ModuleType("boto3")
    boto3.client = lambda *args, **kwargs: object()
    sys.modules["boto3"] = boto3
os.environ.setdefault("CACHE_BUCKET", "test-bucket")

HANDLER = pathlib.Path(__file__).parent.parent / "handler.py"
SPEC = importlib.util.spec_from_file_location("lab_events", HANDLER)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class EngineTest(unittest.TestCase):
    def test_rj_expected_grows_with_magnitude_and_decays_with_time(self):
        early = M.rj_expected(6.8, 4, 0.01, 7)
        later = M.rj_expected(6.8, 4, 30, 37)
        small = M.rj_expected(5.5, 4, 0.01, 7)
        self.assertGreater(early, later)
        self.assertGreater(early, small)
        self.assertGreater(early, 1)       # M6.8 첫 주에 M4+ 여진이 한 번도 없다고 보지 않는다

    def test_g_scale_and_aurora_boundary(self):
        self.assertEqual(M.g_scale(4.67), "—")
        self.assertEqual(M.g_scale(5), "G1")
        self.assertEqual(M.g_scale(7), "G3")
        self.assertEqual(M.g_scale(9), "G5")
        self.assertLess(M.aurora_lat(9), M.aurora_lat(5))   # 폭풍이 세질수록 경계가 남쪽으로

    def test_lifetime_from_perigee_is_monotonic(self):
        self.assertEqual(M.lifetime_days(140, 300), 1)
        self.assertLess(M.lifetime_days(180, 400), M.lifetime_days(220, 400))
        self.assertIsNone(M.lifetime_days(None, 400))
        self.assertIsNone(M.lifetime_days(400, 500))       # 표 밖은 추정하지 않는다

    def test_score_rows_needs_pairs(self):
        self.assertIsNone(M.score_rows([{"forecast": 3, "actual": None}]))
        self.assertEqual(M.score_rows([{"forecast": 3, "actual": 5}, {"forecast": 2, "actual": 2}]), {"n": 2, "meanAbsError": 1.0})

    def test_kma_style_helpers(self):
        self.assertEqual(M.dir_ko(0), "북")
        self.assertEqual(M.dir_ko(135), "남동")
        self.assertAlmostEqual(M.dist_km(0, 0, 0, 1), 111.2, delta=0.3)

    def test_parse_time_accepts_swpc_and_kma_forms(self):
        self.assertEqual(M.parse_time("2026-09-05T03:00:00").isoformat(), "2026-09-05T03:00:00+00:00")
        self.assertEqual(M.parse_time("202609050000").hour, 0)
        self.assertEqual(M.parse_time(1788600000000).year, 2026)   # 2026-09-05 ms 에포크


if __name__ == "__main__":
    unittest.main()
