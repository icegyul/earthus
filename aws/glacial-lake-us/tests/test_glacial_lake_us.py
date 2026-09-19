# -*- coding: utf-8 -*-
"""알래스카 주노 GLOF 기관 인용 수집기 시험 — 2026-09-20 실제 응답(줄인 사본)으로 돈다.

지키는 것
  · 기관 값을 그대로 옮긴다(단위·홍수 단계 문턱·예보)
  · 늙은 관측을 '지금'으로 내보내지 않는다
  · 원본 하나가 죽어도 나머지는 싣고, 죽은 것은 errors 에 적는다
  · 계산하지 않는다 — 물길·도달 시각·침수 범위 칸이 없다
  · 공개 접두사(events/)에 쓴다 — hazards/ 는 공개가 아니다
"""
import json
import os
import pathlib
import sys
import unittest
from datetime import datetime, timezone

HERE = pathlib.Path(__file__).parent
FUNC = HERE.parent
sys.path.insert(0, str(FUNC))
sys.path.insert(0, str(FUNC.parent / "_shared"))
os.environ.setdefault("CACHE_BUCKET", "test-bucket")
import handler  # noqa: E402
import publication_privacy  # noqa: E402

FIX = HERE / "fixtures"
USGS = json.loads((FIX / "usgs-iv-15052500-20260920.json").read_text(encoding="utf-8"))
GAUGE = json.loads((FIX / "nwps-gauge-MNDA2-20260920.json").read_text(encoding="utf-8"))
SF = json.loads((FIX / "nwps-stageflow-MNDA2-20260920.json").read_text(encoding="utf-8"))
NOW = datetime(2026, 9, 19, 17, 0, tzinfo=timezone.utc)   # 마지막 USGS 관측 16:15Z 의 45분 뒤


class RealResponseTests(unittest.TestCase):
    def test_observed_values_pass_through(self):
        doc = handler.build(USGS, GAUGE, SF, NOW)
        self.assertTrue(doc["live"])
        ob = doc["observed"]
        self.assertEqual(4.40, ob["stageFt"])
        self.assertEqual(3210.0, ob["flowCfs"])
        self.assertTrue(ob["provisional"], "USGS 'P'(잠정) 표시를 잃지 않는다")
        self.assertEqual("OFFICIAL_OBSERVATION", ob["kind"])
        self.assertEqual("2026-09-19T16:15:00Z", ob["at"])

    def test_nws_thresholds_and_forecast_are_quoted(self):
        doc = handler.build(USGS, GAUGE, SF, NOW)
        cats = doc["nws"]["floodCategories"]
        self.assertEqual({"stageFt": 14, "flowCfs": 22100}, cats["major"])
        self.assertEqual({"stageFt": 8, "flowCfs": 7860}, cats["action"])
        self.assertEqual("no_flooding", doc["nws"]["observedCategory"])
        fc = doc["nws"]["forecast"]
        self.assertEqual("OFFICIAL_FORECAST", fc["kind"])
        self.assertEqual(5.71, fc["peakStageFt"])
        self.assertEqual("2026-09-18T22:01:00Z", fc["issuedAt"])

    def test_no_computed_fields(self):
        doc = handler.build(USGS, GAUGE, SF, NOW)
        text = json.dumps(doc, ensure_ascii=False).lower()
        for word in ("arrival", "inundation", "reach", "eta", "도달", "침수범위"):
            self.assertNotIn('"%s' % word, text, "계산한 칸이 생겼다: %s" % word)
        self.assertIn("계산하지 않습니다", doc["note"]["ko"])

    def test_the_site_is_the_river_not_the_lake(self):
        doc = handler.build(USGS, GAUGE, SF, NOW)
        self.assertIn("호수 자체가 아니라", doc["site"]["noteKo"])


class HonestyTests(unittest.TestCase):
    def test_stale_observation_is_not_now(self):
        late = datetime(2026, 9, 20, 6, 0, tzinfo=timezone.utc)
        doc = handler.build(USGS, GAUGE, SF, late)
        self.assertFalse(doc["live"])
        self.assertIsNone(doc["observed"])
        self.assertEqual("2026-09-19T16:15:00Z", doc["lastObservedAt"])

    def test_one_source_down_keeps_the_other(self):
        doc = handler.build(None, GAUGE, SF, NOW)
        self.assertEqual({"usgs": "받지 못함"}, doc["errors"])
        self.assertIsNone(doc["observed"])
        self.assertIsNotNone(doc["nws"]["forecast"])
        doc2 = handler.build(USGS, None, None, NOW)
        self.assertIn("nwps", doc2["errors"])
        self.assertIsNotNone(doc2["observed"])
        self.assertIsNone(doc2["nws"]["floodCategories"])

    def test_missing_sentinel_is_dropped(self):
        bad = json.loads(json.dumps(USGS))
        bad["value"]["timeSeries"][0]["values"][0]["value"].append(
            {"value": "-999999", "qualifiers": ["P"], "dateTime": "2026-09-19T08:30:00.000-08:00"})
        parsed = handler.parse_usgs(bad)
        self.assertTrue(all(v > -999990 for series in parsed.values() for _t, v, _p in series))


class DestinationTests(unittest.TestCase):
    def test_writes_to_a_public_prefix(self):
        self.assertTrue(any(handler.DST.startswith(p) for p in publication_privacy.BUCKET_PUBLIC_PREFIXES),
                        "%s 는 앱이 읽을 수 없는 자리다" % handler.DST)


if __name__ == "__main__":
    unittest.main()
