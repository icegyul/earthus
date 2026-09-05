"""보고서 카드가 열리면 답해야 할 것들이 실제로 채워지는지 지킨다.

받은 지적(2026-09-05): 카드를 눌러도 "계산 중"과 회차 수뿐, 태풍이 어디로 가는지·어느 기관이
맞았는지·언제 세지고 약해지는지·기상청이 어떻게 분류했는지가 없었다. 이 테스트는 세션 하나로
public_detail 이 그 네 가지를 내는지, 그리고 값을 지어내지 않는지(상륙 문구 없으면 None) 고정한다.
"""

import importlib.util
import os
import pathlib
import sys
import types
import unittest
from datetime import datetime, timezone


class _FakeS3:
    pass


if "boto3" not in sys.modules:
    boto3 = types.ModuleType("boto3")
    boto3.client = lambda *args, **kwargs: _FakeS3()
    sys.modules["boto3"] = boto3
os.environ.setdefault("CACHE_BUCKET", "test-bucket")

HANDLER = pathlib.Path(__file__).parent.parent / "handler.py"
SPEC = importlib.util.spec_from_file_location("cyclone_analog_detail", HANDLER)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def _kma(issue, lat, lon, wind, course, place=None):
    """기상청 발표 한 회차 — 0시간 실황 + 12·24시간 예보. 매 회차 북쪽으로 1도씩 간다."""
    return {"agency": "KMA", "issued": issue, "notOfficial": False, "steps": [
        {"h": 0, "validUtc": issue.replace("-", "").replace("T", "").replace(":", "")[:12], "lat": lat, "lon": lon,
         "windMs": wind, "hpa": 990, "courseKo": course, "speedKmh": 20, "place": place, "category": None, "categoryKo": None},
        {"h": 12, "lat": lat + 1.0, "lon": lon, "windMs": wind + 2, "hpa": 985, "courseKo": "북", "speedKmh": 20},
        {"h": 24, "lat": lat + 2.0, "lon": lon, "windMs": wind - 4, "hpa": 995, "courseKo": "북", "speedKmh": 18},
    ]}


def _ours(issue, lat, lon):
    """우리 계산 — 동쪽으로 틀린다. 방향 오차가 커야 한다."""
    return {"agency": "EARTHUS_MULTI_SOURCE", "issued": issue, "notOfficial": True, "steps": [
        {"h": 0, "lat": lat, "lon": lon}, {"h": 12, "lat": lat, "lon": lon + 1.0}, {"h": 24, "lat": lat, "lon": lon + 2.0}]}


def _session():
    snaps = []
    for i, hour in enumerate(("00", "12")):
        issue = f"2026-09-0{1 + i // 2}T{hour}:00:00Z"
        lat = 20.0 + i
        snaps.append({"issuedAt": issue, "forecasts": [_kma(issue, lat, 130.0, 24 + i * 4, "북"), _ours(issue, lat, 130.0)]})
    # 하루 뒤 실황: 예보대로 북쪽으로 2도 갔고, 최고 강도(32)를 지나 약해졌다
    snaps.append({"issuedAt": "2026-09-02T00:00:00Z", "forecasts": [_kma("2026-09-02T00:00:00Z", 22.0, 130.0, 32, "북"),
                                                                    _ours("2026-09-02T00:00:00Z", 22.0, 130.0)]})
    snaps.append({"issuedAt": "2026-09-02T12:00:00Z", "forecasts": [_kma("2026-09-02T12:00:00Z", 23.0, 130.0, 26, "북북동")]})
    return {"id": "1", "name": "TESTY-26", "status": "ACTIVE", "snapshots": snaps, "events": []}


class PublicDetailTest(unittest.TestCase):
    def setUp(self):
        self.detail = MODULE.public_detail(_session(), datetime(2026, 9, 2, 13, tzinfo=timezone.utc))

    def test_observed_positions_come_from_agency_analyses(self):
        obs = self.detail["observed"]
        self.assertEqual([p["lat"] for p in obs], [20.0, 21.0, 22.0, 23.0])
        self.assertTrue(all(p["agency"] == "KMA" for p in obs))
        self.assertEqual(self.detail["truthAgency"], "KMA")

    def test_grade_is_converted_from_wind_and_marked_as_such(self):
        """기상청이 강도를 안 적은 회차는 풍속 환산으로 채우되 categoryKo 는 비워 둔다."""
        latest = self.detail["latestObserved"]
        self.assertEqual(latest["gradeKo"], "중")          # 26 m/s → 중
        self.assertIsNone(latest["categoryKo"])
        self.assertEqual(MODULE.kma_grade(16.9), "열대저압부")
        self.assertEqual(MODULE.kma_grade(54), "초강력")

    def test_intensity_peak_and_trend(self):
        it = self.detail["intensity"]
        self.assertEqual(it["peakWindMs"], 32)
        self.assertEqual(it["peakAt"], "2026-09-02T00:00:00Z")
        self.assertEqual(it["trend"]["ko"], "약화")         # 24h 전 28 → 지금 26? 12h 전 32 → 26

    def test_official_outlook_direction_and_weakening(self):
        kma = next(o for o in self.detail["official"] if o["agency"] == "KMA")
        self.assertEqual(kma["headingKo"], "북")
        self.assertEqual(kma["headingToH"], 24)
        self.assertIsNotNone(kma["weakenAt"])              # 12h 최고 뒤 24h 에 4 m/s 약화
        self.assertIsNone(kma["landfall"])                 # 발표문에 상륙 문구가 없으면 판정하지 않는다
        self.assertIsNone(self.detail["landfall"])

    def test_landfall_only_from_agency_wording(self):
        session = _session()
        session["snapshots"][-1]["forecasts"][0]["steps"][2]["place"] = "제주 남쪽 해상 → 전남 해안 상륙"
        detail = MODULE.public_detail(session, datetime(2026, 9, 2, 13, tzinfo=timezone.utc))
        self.assertEqual(detail["landfall"]["agency"], "KMA")
        self.assertIn("상륙", detail["landfall"]["place"])

    def test_interim_scores_rank_agency_over_our_wrong_heading(self):
        """실황 기준 잠정 오차: 북으로 간 실제 vs 동으로 튼 우리 계산 — 우리가 더 틀려야 한다."""
        scores = {s["agency"]: s for s in self.detail["interimScores"]}
        self.assertIn("KMA", scores)
        self.assertIn("EARTHUS_MULTI_SOURCE", scores)
        self.assertLess(scores["KMA"]["meanErrorKm"], scores["EARTHUS_MULTI_SOURCE"]["meanErrorKm"])
        heading = {h["agency"]: h for h in self.detail["headingScores"]}
        self.assertLess(heading["KMA"]["meanErrDeg"], 20)
        self.assertGreater(heading["EARTHUS_MULTI_SOURCE"]["meanErrDeg"], 60)
        self.assertEqual(self.detail["headingScores"][0]["agency"], "KMA")   # 정렬: 방향을 맞춘 쪽이 먼저

    def test_no_official_analysis_means_no_interim_scores(self):
        session = {"id": "2", "name": "NONE-26", "status": "ACTIVE", "events": [],
                   "snapshots": [{"issuedAt": "2026-09-01T00:00:00Z", "forecasts": [_ours("2026-09-01T00:00:00Z", 10.0, 140.0)]}]}
        detail = MODULE.public_detail(session, datetime(2026, 9, 2, tzinfo=timezone.utc))
        self.assertIsNone(detail["truthAgency"])
        self.assertEqual(detail["interimScores"], [])
        self.assertIsNone(detail["intensity"])


if __name__ == "__main__":
    unittest.main()
