# -*- coding: utf-8 -*-
"""날짜·깃발 입력 — 조용히 받아 주지 않는다.

제품 규칙 자체는 그대로다: `handler.py` 의 `if d.day <= 3` 은 "지난달 성적표는 달이
바뀐 직후에만 만든다"는 규칙이고 바꾸지 않았다. 고친 것은 그 규칙의 **입력**이다.

실측한 결함 (2026-09-13):
  · `datetime.strptime("2026-10-1", "%Y-%m-%d")` 는 **통과한다** → day=1 → 게이트가 열린다.
    그런데 신선도 비교는 문자열이라 `"2026-09-13" >= "2026-10-1"` 은 False 다.
    0 하나를 빼먹으면 게이트는 열리는데 후보는 사라진다. 둘 다 조용하다.
  · `dryRun` 은 대소문자를 가렸다 → `{"dryrun": True}` 는 가드를 지나쳐
    **실제 S3 쓰기**로 갔다.

⚠️ 네트워크와 S3 를 쓰지 않는다. `_get` 은 픽스처로, `_s3` 는 부르면 터지는 것으로 바꾼다.
"""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
FN = os.path.dirname(HERE)
AWS = os.path.dirname(FN)
sys.path.insert(0, FN)
sys.path.insert(0, os.path.join(AWS, "_shared"))

import handler                                  # noqa: E402

# 2026-09 을 채점한 자료. 성적표는 이 기간에 대해 만들어진다.
VERIFY_DOC = {
    "collectingSince": "2026-09-01",
    "leadsHours": [24, 48],
    "days": {
        "2026-09-02": {
            "gfs_seamless|temperature_2m|24h": {"me": 0.41, "mae": 1.22, "rmse": 1.71, "n": 1940},
        },
        "2026-09-03": {
            "gfs_seamless|temperature_2m|24h": {"me": 0.37, "mae": 1.31, "rmse": 1.83, "n": 1955},
        },
    },
}
LAB_DOC = {"generatedAt": "2026-09-13T00:00:00Z", "reports": []}   # 오늘 갱신된 사건 없음


class _Stub:
    """`_get` 은 픽스처를, `_s3` 는 호출 즉시 실패를 돌려준다."""

    def __enter__(self):
        self._get, self._s3 = handler._get, handler._s3

        def fake_get(url):
            return VERIFY_DOC if url == handler.VERIFY_DAILY else LAB_DOC

        def no_s3():
            raise AssertionError("이 시험은 S3 를 건드리지 않아야 한다")

        handler._get, handler._s3 = fake_get, no_s3
        return self

    def __exit__(self, *exc):
        handler._get, handler._s3 = self._get, self._s3
        return False


class CanonicalDateTests(unittest.TestCase):
    """요구 1·2 — 정규 형식만 받는다."""

    def test_a_canonical_date_passes_through_unchanged(self):
        self.assertEqual("2026-10-01", handler.canonical_date("2026-10-01"))
        self.assertEqual("2026-10-01", handler.canonical_date("  2026-10-01  "))

    def test_a_non_padded_date_is_rejected(self):
        """strptime 은 이것을 통과시킨다 — 그래서 모양을 따로 본다."""
        from datetime import datetime
        self.assertEqual(1, datetime.strptime("2026-10-1", "%Y-%m-%d").day)   # 전제 고정
        with self.assertRaises(ValueError) as caught:
            handler.canonical_date("2026-10-1")
        self.assertIn("YYYY-MM-DD", str(caught.exception))

    def test_the_two_readings_really_disagree(self):
        """왜 거부해야 하는지 — 게이트와 신선도 비교가 서로 다르게 읽는다."""
        self.assertTrue("2026-09-13" >= "2026-09-13")
        self.assertFalse("2026-09-13" >= "2026-10-1")     # 문자열 비교는 이렇게 읽는다

    def test_other_malformed_dates_are_rejected(self):
        for bad in ("2026-1-01", "26-10-01", "2026/10/01", "20261001", "",
                    "오늘", "2026-10-01T00:00:00Z", 20261001, None, 0, []):
            with self.assertRaises(ValueError):
                handler.canonical_date(bad)

    def test_an_impossible_calendar_date_is_rejected(self):
        for bad in ("2026-02-30", "2026-13-01", "2026-00-10"):
            with self.assertRaises(ValueError):
                handler.canonical_date(bad)


class EventDateTests(unittest.TestCase):
    """요구 4·5·6 — 핸들러 입구에서 강제된다."""

    def test_october_first_yields_one_scorecard(self):
        with _Stub():
            r = handler.handler({"date": "2026-10-01", "dryRun": True})
        titles = [i.get("title") for i in r["index"]["items"]]
        self.assertEqual(1, r["count"], titles)
        self.assertIn("2026-09", titles[0])

    def test_september_thirteenth_yields_none(self):
        with _Stub():
            r = handler.handler({"date": "2026-09-13", "dryRun": True})
        self.assertEqual(0, r["count"])

    def test_the_gate_boundary_is_unchanged(self):
        """1~3 일은 만들고 4 일부터는 안 만든다 — 제품 규칙 그대로다."""
        with _Stub():
            for day, expect in (("01", 1), ("02", 1), ("03", 1), ("04", 0), ("30", 0)):
                r = handler.handler({"date": "2026-10-%s" % day, "dryRun": True})
                self.assertEqual(expect, r["count"], day)

    def test_a_malformed_event_date_is_rejected_before_any_work(self):
        with _Stub():
            with self.assertRaises(ValueError):
                handler.handler({"date": "2026-10-1", "dryRun": True})

    def test_an_explicit_null_date_is_rejected_not_silently_today(self):
        """키가 있는데 값이 없는 것을 오늘로 바꿔 주지 않는다."""
        with _Stub():
            with self.assertRaises(ValueError):
                handler.handler({"date": None, "dryRun": True})

    def test_no_date_key_means_today(self):
        with _Stub():
            r = handler.handler({"dryRun": True})
        self.assertTrue(r["ok"])


class FlagNormalisationTests(unittest.TestCase):
    """요구 3 — 깃발 키의 대소문자를 가리지 않는다."""

    def test_dry_run_is_recognised_in_any_case(self):
        with _Stub():
            for key in ("dryRun", "dryrun", "DRYRUN", "DryRun", "dRyRuN"):
                r = handler.handler({"date": "2026-09-13", key: True})
                self.assertTrue(r.get("dryRun"), key)

    def test_a_falsy_flag_is_not_a_dry_run(self):
        """거짓 깃발은 dryRun 이 아니다 — 그때 S3 를 건드리려 하면 시험이 터진다."""
        with _Stub():
            with self.assertRaises(AssertionError):
                handler.handler({"date": "2026-09-13", "dryRun": False})

    def test_event_flag_reads_nothing_from_an_empty_event(self):
        self.assertFalse(handler.event_flag(None, "dryRun"))
        self.assertFalse(handler.event_flag({}, "dryRun"))
        self.assertFalse(handler.event_flag({"other": True}, "dryRun"))


if __name__ == "__main__":
    unittest.main()
