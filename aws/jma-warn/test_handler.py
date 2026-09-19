# -*- coding: utf-8 -*-
"""jma-warn — r8 경로·스키마 시험 (오프라인, 2026-09-20 실측 모양을 줄여 만든 표본).

지키는 것
  ① 새 경로(r8)를 읽는다 — 옛 경로는 2026-05-28 에 멈췄다
  ② 같은 구역의 여러 전문 종류(VPWW55·61…)를 한 구역으로 합친다
  ③ 해제·'없음'은 빼고, 같은 (구역, 코드) 가 두 번 오면 늦은 발표를 믿는다
  ④ 시각은 살아 있는데 구조를 못 알아보면 '0건'이 아니라 live=false(schema_changed)
"""
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

os.environ.setdefault("CACHE_BUCKET", "test-bucket")
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-northeast-2")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import handler  # noqa: E402

JST = timezone(timedelta(hours=9))


def _row(office, dtc, at, items):
    return {"reportDatetime": at, "publishingOffice": office, "dataTypeCode": dtc,
            "infoType": "発表", "headlineText": "",
            "warning": {"class10Items": [{"areaCode": a, "kinds": [{"code": c, "status": s}
                                                                   for c, s in kinds]}
                                         for a, kinds in items]}}


class R8Tests(unittest.TestCase):
    def run_with(self, rows, now):
        put = []
        with mock.patch.object(handler, "get", return_value=rows) as g, \
             mock.patch.object(handler, "areas", return_value={"011000": {"ja": "宗谷", "en": "Soya"}}), \
             mock.patch.object(handler, "_put", side_effect=put.append), \
             mock.patch.object(handler, "datetime") as dt:
            dt.now.return_value = now
            dt.strptime = datetime.strptime
            dt.fromisoformat = datetime.fromisoformat
            handler.handler({})
        return g, put[-1]

    def test_reads_r8_and_merges_data_types(self):
        now = datetime(2026, 9, 20, 1, 0, tzinfo=JST)
        rows = [
            _row("稚内地方気象台", "VPWW55", "2026-09-14T15:06:00+09:00", [("011000", [("10", "解除")])]),
            _row("稚内地方気象台", "VPWW61", "2026-09-19T15:09:00+09:00", [("011000", [("20", "発表")])]),
            _row("稚内地方気象台", "VPWW58", "2026-09-20T00:11:00+09:00", [("011000", [("15", "継続")]),
                                                                            ("012020", [(None, "発表警報・注意報はなし")])]),
        ]
        g, doc = self.run_with(rows, now)
        self.assertEqual(handler.WARN_MAP, g.call_args[0][0])
        self.assertIn("/warning/data/r8/", handler.WARN_MAP)
        self.assertTrue(doc["live"])
        self.assertEqual(1, doc["count"])
        it = doc["items"][0]
        self.assertEqual("011000", it["area"])
        self.assertEqual(["15", "20"], it["codes"], "해제된 10 은 빠지고 두 전문의 코드가 합쳐진다")
        self.assertEqual("2026-09-20T00:11:00+09:00", it["at"])
        self.assertEqual(1, doc["officeCount"])

    def test_later_report_wins_for_same_area_and_code(self):
        now = datetime(2026, 9, 20, 1, 0, tzinfo=JST)
        rows = [
            _row("A", "VPWW61", "2026-09-19T10:00:00+09:00", [("011000", [("20", "発表")])]),
            _row("A", "VPWW61x", "2026-09-19T20:00:00+09:00", [("011000", [("20", "解除")])]),
        ]
        _, doc = self.run_with(rows, now)
        self.assertTrue(doc["live"])
        self.assertEqual(0, doc["count"], "늦게 온 해제가 이긴다")

    def test_unknown_schema_is_not_zero_warnings(self):
        now = datetime(2026, 9, 20, 1, 0, tzinfo=JST)
        rows = [{"reportDatetime": "2026-09-20T00:11:00+09:00", "areaTypes": []}]
        _, doc = self.run_with(rows, now)
        self.assertFalse(doc["live"])
        self.assertEqual("schema_changed", doc["reason"])
        self.assertNotIn("items", doc, "멈춘·못 읽는 자료는 목록을 아예 담지 않는다")

    def test_stale_feed_is_not_live(self):
        now = datetime(2026, 9, 20, 1, 0, tzinfo=JST)
        rows = [_row("A", "VPWW55", "2026-05-28T11:31:00+09:00", [("011000", [("10", "発表")])])]
        _, doc = self.run_with(rows, now)
        self.assertFalse(doc["live"])
        self.assertEqual("source_stale", doc["reason"])
        self.assertNotIn("items", doc)


if __name__ == "__main__":
    unittest.main()
