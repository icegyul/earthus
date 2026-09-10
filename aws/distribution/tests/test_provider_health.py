# -*- coding: utf-8 -*-
"""provider_health.py 시험 — SNS FACTORY."""
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import sns_adapters as adapters  # noqa: E402
import provider_health as ph  # noqa: E402

NOW = "2026-09-10T00:00:00Z"


class _StubTransport:
    stub = True

    def __call__(self, req):
        return {"status": "PUBLISHED", "mock": True}


class ProviderHealthTest(unittest.TestCase):
    def test_no_credentials(self):
        for name in adapters.ADAPTERS:
            ad = adapters.get(name)
            with self.subTest(platform=name):
                r = ph.inspect(ad, at=NOW)
                self.assertEqual(r["state"], ph.ST_NOT_CONFIGURED)
                self.assertFalse(r["configured"])
                self.assertFalse(r["authenticated"])
                self.assertFalse(r["publish_ready"])
                self.assertFalse(r["analytics_ready"])

    def test_malformed_credentials(self):
        ad = adapters.get("threads")
        for bad in ("token-string", [], 123):
            r = ph.inspect(ad, credentials=bad, at=NOW)
            self.assertEqual(r["state"], ph.ST_NOT_CONFIGURED)
            self.assertFalse(r["configured"])

    def test_stub_transport_marked(self):
        ad = adapters.get("threads")
        r = ph.inspect(ad, credentials={"accessToken": "x"},
                       transport=_StubTransport(), confirmed=True, at=NOW)
        self.assertEqual(r["state"], ph.ST_STUB)
        self.assertEqual(r["mode"], ph.MODE_STUB)
        self.assertEqual(r["provenance"], "stub")
        self.assertFalse(r["authenticated"])
        self.assertFalse(r["publish_ready"])

    def test_unconfirmed_never_live(self):
        ad = adapters.get("threads")
        hs = {"source": "live", "authenticated": True, "publish": True,
              "analytics": True, "at": NOW, "by": "human"}
        r = ph.inspect(ad, credentials={"accessToken": "x"},
                       transport=object(), confirmed=False, handshake=hs,
                       at=NOW)
        self.assertTrue(r["authenticated"])
        self.assertFalse(r["publish_ready"])

    def test_confirmed_handshake_reflected(self):
        ad = adapters.get("threads")
        hs = {"source": "live", "authenticated": True, "publish": True,
              "analytics": True, "at": NOW, "by": "human"}
        r = ph.inspect(ad, credentials={"accessToken": "x"},
                       transport=object(), confirmed=True, handshake=hs,
                       at=NOW)
        self.assertEqual(r["state"], ph.ST_ANALYTICS_READY)
        self.assertTrue(r["publish_ready"])
        self.assertTrue(r["analytics_ready"])
        self.assertEqual(r["provenance"], "live")

    def test_non_live_handshake_not_promoted(self):
        ad = adapters.get("threads")
        hs = {"source": "stub", "authenticated": True, "publish": True,
              "at": NOW, "by": "test"}
        r = ph.inspect(ad, credentials={"accessToken": "x"},
                       transport=object(), confirmed=True, handshake=hs,
                       at=NOW)
        self.assertEqual(r["state"], ph.ST_CONFIGURED)
        self.assertFalse(r["authenticated"])

    def test_provider_isolation(self):
        ads = {n: adapters.get(n) for n in adapters.ADAPTERS}
        ctx = {"threads": {"credentials": {"accessToken": "x"}},
               "instagram": {"credentials": "broken"}}
        out = ph.check_all(ads, context=ctx, at=NOW)
        self.assertEqual(out["threads"]["state"], ph.ST_CONFIGURED)
        self.assertEqual(out["instagram"]["state"], ph.ST_NOT_CONFIGURED)
        # 컨텍스트 없는 나머지는 NOT_CONFIGURED 다.
        self.assertEqual(out["x"]["state"], ph.ST_NOT_CONFIGURED)

    def test_secrets_not_in_result(self):
        ads = {"threads": adapters.get("threads")}
        ctx = {"threads": {"credentials": {"accessToken": "SECRET-1",
                                           "refreshToken": "SECRET-2"}}}
        out = ph.check_all(ads, context=ctx, at=NOW)
        self.assertNotIn("SECRET-1", str(out))
        self.assertNotIn("SECRET-2", str(out))

    def test_secrets_not_in_errors(self):
        msg = ph.safe_error(RuntimeError("accessToken=SECRET-9 날아감"))
        self.assertNotIn("SECRET-9", msg)
        self.assertIn("accessToken=<redacted>", msg)

    def test_all_seven_same_contract(self):
        ads = {n: adapters.get(n) for n in adapters.ADAPTERS}
        out = ph.check_all(ads, at=NOW)
        self.assertEqual(set(out), set(adapters.ADAPTERS))
        for r in out.values():
            for k in ("configured", "authenticated", "publish_ready",
                      "analytics_ready", "mode", "state", "reason",
                      "provenance"):
                self.assertIn(k, r)


if __name__ == "__main__":
    unittest.main()
