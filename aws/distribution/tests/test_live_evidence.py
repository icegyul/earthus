# -*- coding: utf-8 -*-
"""LIVE EVIDENCE 시험 — credential 없어도 검증 구조는 돈다. (12 tests)

규칙: 실제 provider response 0건이므로 LIVE 판정은 없다.
여기서 보는 것은 "증거가 왔을 때" 경로가 정확한가뿐이다.
"""
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
SECRET = "tok-evidence-5k"


def _content():
    return {"contentId": "CNT-2026-000001", "version": 1, "title": "[TEST] 증거",
            "status": "APPROVED", "eligibility": "ELIGIBLE", "priority": "P2",
            "type": "NOW", "language": "ko",
            "scheduledAt": "2026-09-09T21:00:00Z", "platforms": ["threads"],
            "phenomenonIds": [], "eventIds": [], "reportIds": [],
            "datasetRefs": [], "dataSnapshotId": None, "visualAssetIds": []}


def _versions():
    return {("CNT-2026-000001", "threads"):
            {"masterContentId": "CNT-2026-000001", "platform": "threads",
             "format": "TEXT", "text": "[TEST] 관측", "hashtags": []}}


class LiveEvidenceTest(unittest.TestCase):
    def test_01_no_credential_not_configured(self):
        r = ph.inspect(adapters.get("threads"), at=NOW)
        self.assertEqual(r["state"], ph.ST_NOT_CONFIGURED)
        self.assertFalse(r["publish_ready"])

    def test_02_credential_ready(self):
        hs = {"source": "live", "authenticated": True, "publish": True,
              "at": NOW, "by": "op"}
        r = ph.inspect(adapters.get("threads"),
                       credentials={"accessToken": "x"}, transport=object(),
                       confirmed=True, handshake=hs, at=NOW)
        self.assertEqual(r["state"], ph.ST_PUBLISH_READY)
        self.assertTrue(r["publish_ready"])

    def test_03_real_publish_requested(self):
        # 접수 응답 모양이면 REQUESTED(pending)다. 확정 아니다.
        parsed = bc.parse_publish_response(
            {"ok": True, "postId": "17801", "pending": True})
        self.assertTrue(parsed["pending"])
        self.assertEqual(parsed["postId"], "17801")

    def test_04_final_confirmation_published(self):
        # bridge 경로 확정 (MOCK 계약 — LIVE 아님).
        out = ex.run_once([_content()], [], versions=_versions(),
                          adapters={"threads": adapters.get("threads")},
                          now=NOW, actor="op")
        pubs = [r for r in out["results"] if r.get("outcome") == "PUBLISHED"]
        self.assertEqual(len(pubs), 1)
        self.assertFalse(pubs[0]["pending"])
        self.assertEqual(len(out["archives"]), 1)

    def test_05_publish_failure_failed(self):
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
            self.assertEqual(out["archives"], [])
        finally:
            server.shutdown()

    def test_06_duplicate_blocked(self):
        kw = dict(versions=_versions(),
                  adapters={"threads": adapters.get("threads")}, now=NOW,
                  actor="op")
        r1 = ex.run_once([_content()], [], **kw)
        r2 = ex.run_once([_content()], list(r1["queueItems"]), **kw)
        self.assertEqual([r for r in r2["results"]
                          if r.get("outcome") == "PUBLISHED"], [])

    def test_07_real_response_secret_scrub(self):
        stored = ra.store(
            provider="threads", endpoint_class="threads_publish",
            status_code=200, object_id="17801",
            response={"id": "17801", "accessToken": SECRET,
                      "headers": {"Authorization": "Bearer " + SECRET}},
            latency_ms=412, at=NOW)
        self.assertNotIn(SECRET, str(stored))
        self.assertEqual(stored["statusCode"], 200)
        self.assertEqual(stored["latencyMs"], 412)

    def test_08_archive_sanitized(self):
        stored = ra.store(
            provider="threads", endpoint_class="insights", status_code=200,
            object_id="17801",
            response={"data": [{"name": "likes", "values": [{"value": 3}]}]},
            at=NOW)
        self.assertIn("fingerprint", stored)
        self.assertIn("schema", stored)
        self.assertIn("timestamp", stored)
        self.assertEqual(stored["objectId"], "17801")

    def test_09_analytics_real_mapping(self):
        ad = adapters.get("threads")
        raw = {"metrics": {"likes": 11, "comments": 2, "shares": 1,
                           "views": 500},
               "reference": "threads-insights-v1.0"}
        ad.fetch_analytics = lambda pub: raw
        r = af.fetch({"contentId": "C", "platform": "threads",
                      "postId": "17801"}, ad, at=NOW, via="live")
        self.assertEqual(r["status"], af.STATUS_AVAILABLE)
        self.assertEqual(r["provenance"], af.PV_LIVE)
        self.assertEqual(r["metrics"]["likes"], 11)
        self.assertEqual(r["metrics"]["comments"], 2)

    def test_10_missing_stays_missing(self):
        # linkedin 읽기는 없다 — FETCH_FAILED 로 끝나고 MISSING 문서 매핑.
        with self.assertRaises(bc.BridgeError) as ctx:
            bc.parse_analytics_response(
                "linkedin", {"error": "ANALYTICS_NOT_SUPPORTED"})
        self.assertEqual(ctx.exception.code, "FETCH_FAILED")

    def test_11_mock_cannot_become_live(self):
        import verify_live as vl  # noqa: E402
        r = vl.verify("threads", context={"confirmed": True},
                      content=_content(), versions=_versions(),
                      adapters={"threads": adapters.get("threads")}, now=NOW,
                      confirm_live=True)
        self.assertNotEqual(r["verdict"], vl.VERDICT_LIVE)
        self.assertEqual(r["verdict"], vl.VERDICT_BLOCKED)

    def test_12_shape_mismatch_not_silent(self):
        # parse 는 숫자를 보관하고, fetch 가 어댑터 어휘로 여과한다.
        # 모르는 키가 아카이브까지 가는 일은 없다. ID 없으면 예외다.
        parsed = bc.parse_analytics_response("threads", {
            "ok": True, "metrics": {"likes": 3, "madeUp": 99}})
        self.assertEqual(parsed["metrics"]["likes"], 3)
        ad = adapters.get("threads")
        ad.fetch_analytics = lambda pub: {"metrics": parsed["metrics"]}
        r = af.fetch({"contentId": "C", "platform": "threads",
                      "postId": "p"}, ad, at=NOW, via="live")
        self.assertNotIn("madeUp", r["metrics"])
        with self.assertRaises(bc.BridgeError) as ctx:
            bc.parse_publish_response({"ok": True})
        self.assertEqual(ctx.exception.code, "NO_PUBLICATION_ID")


if __name__ == "__main__":
    unittest.main()
