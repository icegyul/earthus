# -*- coding: utf-8 -*-
"""analytics_fetch.py 시험 — SNS FACTORY 신규 모듈."""
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import analytics_fetch as af  # noqa: E402


class _Adapter:
    platform = "threads"
    metrics = ("likes", "comments", "shares")

    def __init__(self, raw=None, error=None):
        self._raw = raw
        self._error = error

    def fetch_analytics(self, publication):
        if self._error:
            raise self._error
        return self._raw


class _AuthError(RuntimeError):
    code = "INVALID_CREDENTIAL"


class _TimeoutError(RuntimeError):
    code = "TIMEOUT"


class AnalyticsFetchTest(unittest.TestCase):
    def _pub(self):
        return {"contentId": "CNT-2026-000001", "platform": "threads",
                "postId": "p123"}

    def test_provider_available(self):
        r = af.fetch(self._pub(),
                     _Adapter({"metrics": {"likes": 10, "comments": 2}}),
                     at="2026-09-10T00:00:00Z")
        self.assertEqual(r["status"], af.STATUS_AVAILABLE)
        self.assertEqual(r["metrics"], {"likes": 10, "comments": 2})
        self.assertEqual(r["fetchedAt"], "2026-09-10T00:00:00Z")

    def test_provider_unavailable(self):
        # 발행 자체가 MOCK 이면 읽을 것이 없다 — 실패가 아니다.
        r = af.fetch({"contentId": "CNT-1", "platform": "threads",
                      "postId": None}, _Adapter({}),
                     at="2026-09-10T00:00:00Z")
        self.assertEqual(r["status"], af.STATUS_NOT_AVAILABLE)

    def test_metric_mapping(self):
        # 어댑터 목록에 없는 키는 담지 않는다. bool 도 숫자가 아니다.
        r = af.fetch(self._pub(), _Adapter(
            {"metrics": {"likes": 5, "views": 99, "saves": True}}),
            at="2026-09-10T00:00:00Z")
        self.assertEqual(r["metrics"], {"likes": 5})
        self.assertNotIn("views", r["metrics"])

    def test_unknown_metric(self):
        r = af.fetch(self._pub(), _Adapter({"metrics": {}}),
                     at="2026-09-10T00:00:00Z")
        self.assertEqual(r["status"], af.STATUS_NOT_AVAILABLE)
        self.assertEqual(r["metrics"], {})

    def test_auth_failure(self):
        r = af.fetch(self._pub(), _Adapter(error=_AuthError("만료")),
                     at="2026-09-10T00:00:00Z")
        self.assertEqual(r["status"], af.STATUS_AUTH_FAILED)

    def test_timeout(self):
        r = af.fetch(self._pub(), _Adapter(error=_TimeoutError("시간초과")),
                     at="2026-09-10T00:00:00Z")
        self.assertEqual(r["status"], af.STATUS_FETCH_FAILED)

    def test_publish_state_untouched(self):
        pub = dict(self._pub())
        af.fetch(pub, _Adapter({"metrics": {"likes": 1}}),
                 at="2026-09-10T00:00:00Z")
        self.assertNotIn("status", pub)
        # 결과에도 발행 상태 전이를 시키는 키가 없다.
        r = af.fetch(self._pub(), _Adapter({"metrics": {"likes": 1}}),
                     at="2026-09-10T00:00:00Z")
        self.assertNotIn("publishResult", r)
        # 비밀 자리가 없다.
        self.assertNotIn("token", str(r).lower())

    def test_summarize(self):
        rs = [
            af.fetch(self._pub(), _Adapter({"metrics": {"likes": 1}}),
                     at="2026-09-10T00:00:00Z"),
            af.fetch(self._pub(), _Adapter({"metrics": {}}),
                     at="2026-09-10T01:00:00Z"),
        ]
        s = af.summarize(rs)
        self.assertEqual(s["total"], 2)
        self.assertEqual(s["byStatus"][af.STATUS_AVAILABLE], 1)
        self.assertEqual(s["lastFetchedAt"], "2026-09-10T01:00:00Z")


if __name__ == "__main__":
    unittest.main()
