# -*- coding: utf-8 -*-
"""LIVE PHASE 01 시험 — 상태기계·소독·공통계약. (14 tests)"""
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import sns_adapters as adapters  # noqa: E402
import provider_health as ph  # noqa: E402
import bridge_client as bc  # noqa: E402
import executor as ex  # noqa: E402
import analytics_fetch as af  # noqa: E402
import response_archive as ra  # noqa: E402

NOW = "2026-09-10T00:00:00Z"
SECRET = "tok-live-3q"


def _content():
    return {"contentId": "CNT-2026-000001", "version": 1, "title": "[TEST] live",
            "status": "APPROVED", "eligibility": "ELIGIBLE", "priority": "P2",
            "type": "NOW", "language": "ko",
            "scheduledAt": "2026-09-09T21:00:00Z", "platforms": ["threads"],
            "phenomenonIds": [], "eventIds": [], "reportIds": [],
            "datasetRefs": [], "dataSnapshotId": None, "visualAssetIds": []}


def _versions():
    return {("CNT-2026-000001", "threads"):
            {"masterContentId": "CNT-2026-000001", "platform": "threads",
             "format": "TEXT", "text": "[TEST] 관측", "hashtags": []}}


class LivePhase01Test(unittest.TestCase):
    def test_01_no_credential_not_configured(self):
        r = ph.inspect(adapters.get("threads"), at=NOW)
        self.assertEqual(r["state"], ph.ST_NOT_CONFIGURED)

    def test_02_configured_ready(self):
        hs = {"source": "live", "authenticated": True, "publish": True,
              "at": NOW, "by": "op"}
        r = ph.inspect(adapters.get("threads"),
                       credentials={"accessToken": "x"}, transport=object(),
                       confirmed=True, handshake=hs, at=NOW)
        self.assertEqual(r["state"], ph.ST_PUBLISH_READY)

    def test_03_bridge_response_requested(self):
        parsed = bc.parse_publish_response(
            {"ok": True, "postId": "v123", "pending": True})
        self.assertEqual(parsed["postId"], "v123")
        self.assertTrue(parsed["pending"])

    def test_04_processing_response(self):
        import publish_queue as pq  # noqa: E402
        item = pq.enqueue(_content(), _versions()[("CNT-2026-000001",
                                                   "threads")],
                          scheduled_at="2026-09-09T21:00:00Z")
        item = pq.mark_processing(item, at=NOW)
        self.assertEqual(item["status"], "PROCESSING")
        self.assertEqual(item["attemptCount"], 1)

    def test_05_verified_result_published(self):
        out = ex.run_once([_content()], [], versions=_versions(),
                          adapters={"threads": adapters.get("threads")},
                          now=NOW, actor="op")
        pubs = [r for r in out["results"] if r.get("outcome") == "PUBLISHED"]
        self.assertEqual(len(pubs), 1)
        self.assertFalse(pubs[0]["pending"])

    def test_06_provider_failure_failed(self):
        from test_bridge_client import _serve  # noqa: E402
        server, url = _serve({"publish": {"body": {
            "error": "PERMISSION_DENIED"}}})
        try:
            ad = adapters.get("threads", mode="LIVE")
            ad.credentials_present = True
            ad.transport = bc.make_transport(url, "jwt", "threads")
            out = ex.run_once([_content()], [], versions=_versions(),
                              adapters={"threads": ad}, now=NOW, actor="op",
                              confirmed=True)
            self.assertTrue([r for r in out["results"]
                             if r.get("outcome") == "FAILED"])
        finally:
            server.shutdown()

    def test_07_duplicate_blocked(self):
        kw = dict(versions=_versions(),
                  adapters={"threads": adapters.get("threads")}, now=NOW,
                  actor="op")
        r1 = ex.run_once([_content()], [], **kw)
        r2 = ex.run_once([_content()], list(r1["queueItems"]), **kw)
        self.assertEqual([r for r in r2["results"]
                          if r.get("outcome") == "PUBLISHED"], [])

    def test_08_secret_scrub(self):
        stored = ra.store(provider="threads", endpoint_class="insights",
                          status_code=200, object_id="1",
                          response={"accessToken": SECRET, "likes": 5}, at=NOW)
        self.assertNotIn(SECRET, str(stored))
        self.assertEqual(stored["sanitized"]["likes"], 5)

    def test_09_analytics_missing(self):
        with self.assertRaises(bc.BridgeError) as ctx:
            bc.parse_analytics_response(
                "linkedin", {"error": "ANALYTICS_NOT_SUPPORTED"})
        self.assertEqual(ctx.exception.code, "FETCH_FAILED")

    def test_10_analytics_bridge(self):
        from test_bridge_client import _serve  # noqa: E402
        server, url = _serve({"provider_analytics": {"body": {
            "ok": True, "metrics": {"likes": 2}}}})
        try:
            fetch = bc.make_analytics_fetcher(url, "jwt", "threads")
            ad = adapters.get("threads")
            ad.fetch_analytics = fetch
            r = af.fetch({"contentId": "C", "platform": "threads",
                          "postId": "p"}, ad, at=NOW, via="stub")
            self.assertEqual(r["status"], af.STATUS_AVAILABLE)
            self.assertEqual(r["provenance"], af.PV_STUB)
        finally:
            server.shutdown()

    def test_11_real_response_verified(self):
        ad = adapters.get("threads")
        raw = {"metrics": {"likes": 9}, "reference": "threads-insights-v1.0"}
        ad.fetch_analytics = lambda pub: raw
        r = af.fetch({"contentId": "C", "platform": "threads", "postId": "p"},
                     ad, at=NOW, via="live")
        self.assertEqual(r["status"], af.STATUS_AVAILABLE)
        self.assertEqual(r["provenance"], af.PV_LIVE)
        r2 = af.fetch({"contentId": "C", "platform": "threads", "postId": "p"},
                      ad, at=NOW)
        self.assertNotEqual(r2["provenance"], af.PV_LIVE)

    def test_12_mock_cannot_produce_live(self):
        import verify_live as vl  # noqa: E402
        r = vl.verify("threads", context={"confirmed": True},
                      content=_content(), versions=_versions(),
                      adapters={"threads": adapters.get("threads")}, now=NOW,
                      confirm_live=True)
        self.assertNotEqual(r["verdict"], vl.VERDICT_LIVE)

    def test_13_sanitized_archive_no_secrets(self):
        stored = ra.store(
            provider="threads", endpoint_class="publish", status_code=200,
            object_id="9",
            response={"id": "9", "Authorization": "Bearer " + SECRET,
                      "data": {"refresh_token": SECRET}}, at=NOW)
        blob = str(stored)
        self.assertNotIn(SECRET, blob)
        self.assertIn("fingerprint", stored)
        self.assertIn("schema", stored)

    def test_14_common_ui_contract(self):
        # 공통 기반은 7종 동일. provider 고유값은 어댑터 안에 격리된다.
        base = {"provider", "text", "mediaId", "options", "idempotencyKey",
                "confirmed"}
        prev_keys = None
        caps_keys = None
        for name in adapters.ADAPTERS:
            ad = adapters.get(name)
            pv = {"masterContentId": "C", "platform": name,
                  "format": ad.formats[0] if ad.formats else "TEXT",
                  "text": "관측: 파고 2.3m", "hashtags": []}
            payload = ad.generate_payload(pv)
            self.assertTrue(base.issubset(payload),
                            "%s 공통 기반 누락" % name)
            prev = ad.preview(payload)
            caps = ad.provider_capabilities()
            if prev_keys is None:
                prev_keys, caps_keys = sorted(prev), sorted(caps)
            self.assertEqual(sorted(prev), prev_keys)
            self.assertEqual(sorted(caps), caps_keys)


if __name__ == "__main__":
    unittest.main()
