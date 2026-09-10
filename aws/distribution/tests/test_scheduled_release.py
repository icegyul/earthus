# -*- coding: utf-8 -*-
"""scheduled_release.py 시험 — SNS FACTORY 신규 모듈."""
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import scheduled_release as sr  # noqa: E402

NOW = "2026-09-10T00:00:00Z"


def _content(status="APPROVED", scheduled_at="2026-09-09T21:00:00Z"):
    return {"contentId": "CNT-2026-000001", "status": status,
            "scheduledAt": scheduled_at, "platforms": ["threads"],
            "priority": "P2"}


class ScheduledReleaseTest(unittest.TestCase):
    def test_approved_accepted(self):
        out = sr.release_due([_content()], now=NOW)
        self.assertEqual(len(out["intents"]), 1)
        self.assertEqual(out["intents"][0]["platform"], "threads")
        self.assertEqual(out["skipped"], [])
        # 표시는 KST 다. 저장은 UTC 그대로다.
        self.assertIn("KST", out["intents"][0]["scheduledAtKst"])
        self.assertTrue(out["intents"][0]["scheduledAt"].endswith("Z"))

    def test_draft_rejected(self):
        for st in ("DRAFT", "FACT_CHECK", "REVIEW", "REJECTED",
                   "REVISION_REQUIRED"):
            out = sr.release_due([_content(status=st)], now=NOW)
            self.assertEqual(out["intents"], [], st)
            self.assertEqual(len(out["skipped"]), 1, st)

    def test_duplicate_schedule(self):
        c = _content()
        first = sr.release_due([c], now=NOW)
        keys = [i["releaseKey"] for i in first["intents"]]
        second = sr.release_due([c], now=NOW, seen_keys=keys)
        self.assertEqual(second["intents"], [])
        self.assertEqual(second["skipped"][0]["reason"], "이미 방출됐다")
        # 큐에 이미 있어도 막힌다.
        third = sr.release_due([c], now=NOW, queued_keys=keys)
        self.assertEqual(third["intents"], [])

    def test_already_published_rejected(self):
        out = sr.release_due([_content(status="PUBLISHED")], now=NOW)
        self.assertEqual(out["intents"], [])
        self.assertIn("이미 발행", out["skipped"][0]["reason"])

    def test_timezone(self):
        # KST 09-10 09:00 = UTC 09-10 00:00. 같은 순간을 UTC 로 적는다.
        self.assertEqual(sr.to_kst("2026-09-10T00:00:00Z"),
                         "2026-09-10 09:00 KST")
        # KST 자정 전(UTC 전날)은 전날로 보인다.
        self.assertEqual(sr.to_kst("2026-09-09T14:59:00Z"),
                         "2026-09-09 23:59 KST")

    def test_past_and_future_schedule(self):
        past = sr.release_due([_content(scheduled_at="2026-09-09T00:00:00Z")],
                              now=NOW)
        self.assertEqual(len(past["intents"]), 1)
        future = sr.release_due(
            [_content(scheduled_at="2026-09-11T00:00:00Z")], now=NOW)
        self.assertEqual(future["intents"], [])
        self.assertIn("아직 안 됐다", future["skipped"][0]["reason"])

    def test_no_publish_path(self):
        # 이 모듈에 발행을 만드는 함수가 없다.
        for name in dir(sr):
            self.assertNotIn("publish", name.lower())

    def test_intent_shape(self):
        out = sr.release_due([_content()], now=NOW)
        q = sr.intent_to_enqueue(out["intents"][0])
        self.assertEqual(q["contentId"], "CNT-2026-000001")
        self.assertEqual(q["platform"], "threads")
        self.assertIn("releaseKey", q)


if __name__ == "__main__":
    unittest.main()
