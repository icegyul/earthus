# -*- coding: utf-8 -*-
"""rate_limit.py 시험 — SNS FACTORY 신규 모듈."""
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import rate_limit as rl  # noqa: E402


class RateLimitTest(unittest.TestCase):
    def test_limit_remaining_reset(self):
        s = rl.new_state("threads", at="2026-09-10T00:00:00Z")
        self.assertIsNone(s["limit"])
        s = rl.configure(s, limit=25, window_seconds=86400,
                         at="2026-09-10T00:00:00Z")
        self.assertEqual(s["limit"], 25)
        self.assertEqual(s["remaining"], 25)
        s = rl.consume(s, at="2026-09-10T01:00:00Z")
        self.assertEqual(s["remaining"], 24)

    def test_retry_after_blocks_then_releases(self):
        s = rl.new_state("threads", at="2026-09-10T00:00:00Z")
        s = rl.configure(s, limit=25, window_seconds=86400,
                         at="2026-09-10T00:00:00Z")
        s = rl.record_429(s, retry_after_seconds=120,
                          at="2026-09-10T00:00:00Z")
        self.assertEqual(s["retryAfter"], 120)
        d = rl.check(s, now="2026-09-10T00:01:00Z")
        self.assertEqual(d["decision"], rl.RETRYABLE)
        d = rl.check(s, now="2026-09-10T00:03:00Z")
        self.assertEqual(d["decision"], rl.DECISION_OK)

    def test_retry_after_without_header_uses_backoff(self):
        s = rl.new_state("x", at="2026-09-10T00:00:00Z")
        s = rl.configure(s, limit=10, window_seconds=3600,
                         at="2026-09-10T00:00:00Z")
        s = rl.record_429(s, attempt=2, at="2026-09-10T00:00:00Z")
        self.assertEqual(s["retryAfter"], 5 * 60)
        self.assertEqual(rl.backoff_minutes(1), 1)
        self.assertEqual(rl.backoff_minutes(4), 60)
        self.assertEqual(rl.backoff_minutes(99), 60)

    def test_retryable_decision(self):
        self.assertEqual(rl.classify_error("RATE_LIMITED"), rl.RETRYABLE)
        self.assertEqual(rl.classify_error("TIMEOUT"), rl.RETRYABLE)
        self.assertEqual(rl.classify_error("INVALID_CREDENTIAL"),
                         rl.NON_RETRYABLE)
        self.assertEqual(rl.classify_error("PERMISSION_DENIED"),
                         rl.NON_RETRYABLE)
        # 모르는 코드는 재시도하지 않는다 — 한도를 태우지 않는다.
        self.assertEqual(rl.classify_error("SOMETHING_NEW"), rl.NON_RETRYABLE)

    def test_unknown_provider_is_not_forced(self):
        s = rl.new_state("threads", at="2026-09-10T00:00:00Z")
        d = rl.check(s, now="2026-09-10T01:00:00Z")
        self.assertEqual(d["decision"], rl.DECISION_OK)
        s = rl.consume(s, at="2026-09-10T01:00:00Z")
        self.assertIsNone(s["remaining"])

    def test_exhausted_and_reset(self):
        s = rl.new_state("threads", at="2026-09-10T00:00:00Z")
        s = rl.configure(s, limit=1, window_seconds=3600,
                         at="2026-09-10T00:00:00Z")
        s = rl.consume(s, at="2026-09-10T00:00:00Z")
        d = rl.check(s, now="2026-09-10T00:30:00Z")
        self.assertEqual(d["decision"], rl.RETRYABLE)
        s = rl.record_reset(s, at="2026-09-10T01:00:01Z")
        self.assertEqual(s["remaining"], 1)
        d = rl.check(s, now="2026-09-10T01:00:01Z")
        self.assertEqual(d["decision"], rl.DECISION_OK)

    def test_bad_configure_rejected(self):
        s = rl.new_state("threads", at="2026-09-10T00:00:00Z")
        with self.assertRaises(ValueError):
            rl.configure(s, limit=0, window_seconds=60)
        with self.assertRaises(ValueError):
            rl.configure(s, limit=10, window_seconds=0)


if __name__ == "__main__":
    unittest.main()
