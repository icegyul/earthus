# -*- coding: utf-8 -*-
"""verify_live.py 시험 — 하네스는 실행하지 않는 것이 기본이다."""
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import sns_adapters as adapters  # noqa: E402
import verify_live as vl  # noqa: E402

NOW = "2026-09-10T00:00:00Z"


def _content(title="[TEST] 바다 확인"):
    return {"contentId": "CNT-2026-000001", "version": 1, "title": title,
            "status": "APPROVED", "eligibility": "ELIGIBLE", "priority": "P2",
            "type": "NOW", "language": "ko",
            "scheduledAt": "2026-09-09T21:00:00Z", "platforms": ["threads"],
            "phenomenonIds": [], "eventIds": [], "reportIds": [],
            "datasetRefs": [], "dataSnapshotId": None, "visualAssetIds": []}


def _versions():
    return {("CNT-2026-000001", "threads"):
            {"masterContentId": "CNT-2026-000001", "platform": "threads",
             "format": "TEXT", "text": "[TEST] 관측: 파고 2.3m", "hashtags": []}}


class VerifyLiveTest(unittest.TestCase):
    def _adapters(self):
        return {"threads": adapters.get("threads")}

    def test_blocked_without_credentials(self):
        r = vl.verify("threads", context={}, content=_content(),
                      versions=_versions(), adapters=self._adapters(), now=NOW)
        self.assertEqual(r["verdict"], vl.VERDICT_BLOCKED)
        self.assertEqual(r["phases"]["health"]["status"], "BLOCKED")
        for name in ("publication", "confirmation", "analytics", "archive",
                     "idempotency"):
            self.assertEqual(r["phases"][name]["status"], "NOT_EXECUTED")

    def test_mock_is_not_live(self):
        # MOCK 어댑터 + 확인 없음 → 실행하지 않는다. mock 성공도 없다.
        r = vl.verify("threads", context={"confirmed": True},
                      content=_content(), versions=_versions(),
                      adapters=self._adapters(), now=NOW, confirm_live=True)
        pubs = [p for p in (r["phases"]["publication"],)
                if p["status"] == "PASS"]
        self.assertEqual(pubs, [])
        self.assertNotEqual(r["verdict"], vl.VERDICT_LIVE)

    def test_non_test_content_refused(self):
        hs = {"source": "live", "authenticated": True, "publish": True,
              "analytics": True, "at": NOW, "by": "human"}
        ctx = {"credentials": {"accessToken": "x"}, "transport": object(),
               "confirmed": True, "handshake": hs}
        c = _content(title="운영 공지입니다")
        r = vl.verify("threads", context=ctx, content=c,
                      versions=_versions(), adapters=self._adapters(), now=NOW,
                      confirm_live=True)
        self.assertEqual(r["phases"]["publication"]["status"], "NOT_EXECUTED")
        self.assertNotEqual(r["verdict"], vl.VERDICT_LIVE)

    def test_multi_provider_rejected(self):
        with self.assertRaises(ValueError):
            vl.verify(["threads", "x"], context={}, now=NOW)

    def test_stub_handshake_not_promoted(self):
        hs = {"source": "stub", "authenticated": True, "publish": True,
              "at": NOW, "by": "test"}
        ctx = {"credentials": {"accessToken": "x"}, "transport": object(),
               "confirmed": True, "handshake": hs}
        r = vl.verify("threads", context=ctx, content=_content(),
                      versions=_versions(), adapters=self._adapters(), now=NOW,
                      confirm_live=True)
        self.assertNotEqual(r["verdict"], vl.VERDICT_LIVE)
        self.assertEqual(r["phases"]["auth"]["status"], "BLOCKED")

    def test_unconfirmed_never_publishes(self):
        hs = {"source": "live", "authenticated": True, "publish": True,
              "analytics": True, "at": NOW, "by": "human"}
        ctx = {"credentials": {"accessToken": "x"}, "transport": object(),
               "confirmed": False, "handshake": hs}
        r = vl.verify("threads", context=ctx, content=_content(),
                      versions=_versions(), adapters=self._adapters(), now=NOW,
                      confirm_live=True)
        self.assertEqual(r["phases"]["publication"]["status"], "NOT_EXECUTED")

    def test_missing_adapter_blocked(self):
        r = vl.verify("threads", context={}, now=NOW)
        for name in vl.PHASES:
            self.assertEqual(r["phases"][name]["status"], "BLOCKED")

    def test_no_secrets_in_report(self):
        ctx = {"credentials": {"accessToken": "SECRET-1"}}
        r = vl.verify("threads", context=ctx, content=_content(),
                      versions=_versions(), adapters=self._adapters(), now=NOW)
        self.assertNotIn("SECRET-1", str(r))

    def test_phases_shape(self):
        r = vl.verify("threads", context={}, now=NOW)
        self.assertEqual(tuple(r["phases"]), vl.PHASES)
        self.assertEqual(r["provider"], "threads")
        self.assertEqual(r["schemaVersion"], vl.HARNESS_SCHEMA)


if __name__ == "__main__":
    unittest.main()
