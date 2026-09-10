# -*- coding: utf-8 -*-
"""rate_limit scoped config 시험 — SNS FACTORY."""
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import rate_limit as rl  # noqa: E402

NOW = "2026-09-10T00:00:00Z"


class ScopedConfigTest(unittest.TestCase):
    def test_no_config_not_enforced(self):
        d = rl.decide({}, "threads", now=NOW)
        self.assertEqual(d["decision"], rl.DECISION_OK)
        c = rl.empty_config()
        self.assertFalse(c["configured"])
        self.assertFalse(c["enforced"])

    def test_explicit_config_enforced(self):
        states = rl.load_config(
            {"threads:publish": {"limit": 1, "window_seconds": 3600}}, at=NOW)
        s = states["threads:publish"]
        self.assertEqual(s["remaining"], 1)
        s = rl.consume(s, at=NOW)
        states["threads:publish"] = s
        d = rl.decide(states, "threads", operation="publish",
                      now="2026-09-10T00:30:00Z")
        self.assertEqual(d["decision"], rl.RETRYABLE)

    def test_scoped_key_deterministic(self):
        self.assertEqual(rl.scoped_key("threads"), "threads")
        self.assertEqual(rl.scoped_key("threads", None, "publish"),
                         "threads:publish")
        self.assertEqual(rl.scoped_key("threads", "acc1", "publish"),
                         "threads:acc1:publish")
        self.assertEqual(rl.scoped_key("threads", "acc1", "publish"),
                         rl.scoped_key("threads", "acc1", "publish"))

    def test_provider_isolation(self):
        states = rl.load_config(
            {"threads:publish": {"limit": 1, "window_seconds": 3600}}, at=NOW)
        states["threads:publish"] = rl.consume(states["threads:publish"],
                                               at=NOW)
        d = rl.decide(states, "x", operation="publish",
                      now="2026-09-10T00:30:00Z")
        self.assertEqual(d["decision"], rl.DECISION_OK)

    def test_operation_isolation(self):
        states = rl.load_config(
            {"threads:publish": {"limit": 1, "window_seconds": 3600}}, at=NOW)
        states["threads:publish"] = rl.consume(states["threads:publish"],
                                               at=NOW)
        d = rl.decide(states, "threads", operation="analytics",
                      now="2026-09-10T00:30:00Z")
        self.assertEqual(d["decision"], rl.DECISION_OK)

    def test_over_limit_blocked(self):
        states = rl.load_config(
            {"threads": {"limit": 1, "window_seconds": 3600}}, at=NOW)
        states["threads"] = rl.consume(states["threads"], at=NOW)
        d = rl.decide(states, "threads", now="2026-09-10T00:30:00Z")
        self.assertEqual(d["decision"], rl.RETRYABLE)

    def test_under_limit_allowed(self):
        states = rl.load_config(
            {"threads": {"limit": 5, "window_seconds": 3600}}, at=NOW)
        states["threads"] = rl.consume(states["threads"], at=NOW)
        d = rl.decide(states, "threads", now="2026-09-10T00:30:00Z")
        self.assertEqual(d["decision"], rl.DECISION_OK)

    def test_retry_respects_rate_limit(self):
        states = rl.load_config(
            {"threads": {"limit": 5, "window_seconds": 3600}}, at=NOW)
        states["threads"] = rl.record_429(states["threads"],
                                          retry_after_seconds=600, at=NOW)
        d = rl.decide(states, "threads", now="2026-09-10T00:05:00Z")
        self.assertEqual(d["decision"], rl.RETRYABLE)
        d = rl.decide(states, "threads", now="2026-09-10T00:11:00Z")
        self.assertEqual(d["decision"], rl.DECISION_OK)

    def test_missing_does_not_invent(self):
        states = rl.load_config({"threads": {"limit": None,
                                              "window_seconds": 3600}}, at=NOW)
        self.assertEqual(states, {})
        with self.assertRaises(ValueError):
            rl.make_config(0, 60)
        with self.assertRaises(ValueError):
            rl.load_config({"threads": {"limit": -1, "window_seconds": 60}},
                           at=NOW)

    def test_secret_never_in_key(self):
        key = rl.scoped_key("threads", "acc1", "publish")
        self.assertEqual(key, "threads:acc1:publish")
        self.assertNotIn("token", key.lower())
        self.assertNotIn("secret", key.lower())


if __name__ == "__main__":
    unittest.main()
