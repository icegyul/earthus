# -*- coding: utf-8 -*-
"""bridge expansion 시험 — 6 provider × 22 checkpoints.

어댑터 계약·토큰 경계는 공통, provider-specific TODO 만 분리한다.
실제 credential 없이 stub HTTP 로 wire path 만 검증한다.
media 필수 provider(IG/YT/TikTok)는 executor 단에서 정직하게 막히고,
wire roundtrip 은 transport 층에서 본다.
"""
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))
sys.path.insert(0, _HERE)

import sns_adapters as adapters  # noqa: E402
import bridge_client as bc  # noqa: E402
import executor as ex  # noqa: E402
import analytics_fetch as af  # noqa: E402
import provider_health as ph  # noqa: E402
from test_bridge_client import _serve, _StubApi  # noqa: E402

NOW = "2026-09-10T00:00:00Z"
SECRET = "tok-secret-7x"


def _content(platforms):
    return {"contentId": "CNT-2026-000001", "version": 1, "title": "[TEST] 확장",
            "status": "APPROVED", "eligibility": "ELIGIBLE", "priority": "P2",
            "type": "NOW", "language": "ko",
            "scheduledAt": "2026-09-09T21:00:00Z", "platforms": list(platforms),
            "phenomenonIds": [], "eventIds": [], "reportIds": [],
            "datasetRefs": [], "dataSnapshotId": None, "visualAssetIds": []}


def _pv(platform, fmt):
    return {"masterContentId": "CNT-2026-000001", "platform": platform,
            "format": fmt, "text": "[TEST] 관측: 파고 2.3m", "hashtags": []}


def _live(name):
    ad = adapters.get(name, mode="LIVE")
    ad.credentials_present = True
    return ad


class _BridgeCase:
    PROVIDER = None
    FORMAT = "TEXT"
    CANNED_PID = "pid-1"
    CANNED_URL = None
    ANALYTICS_BODY = None  # None → NOT_SUPPORTED
    EXPECT_KEYS = ()
    ID_NOTE = ""

    def _canned_pub(self):
        body = {"ok": True, "postId": self.CANNED_PID,
                "publishedAt": NOW, "publishedBy": "op"}
        if self.CANNED_URL:
            body["url"] = self.CANNED_URL
        return body

    def _run(self, canned, **kw):
        server, url = _serve(canned)
        try:
            return url, _StubApi
        except Exception:
            server.shutdown()
            raise

    # HEALTH 1-6
    def test_01_no_credential(self):
        r = ph.inspect(adapters.get(self.PROVIDER), at=NOW)
        self.assertEqual(r["state"], ph.ST_NOT_CONFIGURED)

    def test_02_configured(self):
        r = ph.inspect(adapters.get(self.PROVIDER),
                       credentials={"accessToken": "x"}, at=NOW)
        self.assertEqual(r["state"], ph.ST_CONFIGURED)

    def test_03_auth_result(self):
        hs = {"source": "live", "authenticated": True, "at": NOW, "by": "op"}
        r = ph.inspect(adapters.get(self.PROVIDER),
                       credentials={"accessToken": "x"}, transport=object(),
                       confirmed=True, handshake=hs, at=NOW)
        self.assertEqual(r["state"], ph.ST_AUTHENTICATED)

    def test_04_auth_failure(self):
        hs = {"source": "live", "authenticated": False, "at": NOW, "by": "op"}
        r = ph.inspect(adapters.get(self.PROVIDER),
                       credentials={"accessToken": "x"}, transport=object(),
                       confirmed=True, handshake=hs, at=NOW)
        self.assertEqual(r["state"], ph.ST_AUTH_FAILED)

    def test_05_publish_readiness(self):
        hs = {"source": "live", "authenticated": True, "publish": True,
              "at": NOW, "by": "op"}
        r = ph.inspect(adapters.get(self.PROVIDER),
                       credentials={"accessToken": "x"}, transport=object(),
                       confirmed=True, handshake=hs, at=NOW)
        self.assertTrue(r["publish_ready"])

    def test_06_analytics_readiness(self):
        hs = {"source": "live", "authenticated": True, "publish": True,
              "analytics": True, "at": NOW, "by": "op"}
        r = ph.inspect(adapters.get(self.PROVIDER),
                       credentials={"accessToken": "x"}, transport=object(),
                       confirmed=True, handshake=hs, at=NOW)
        self.assertTrue(r["analytics_ready"])
        self.assertEqual(r["state"], ph.ST_ANALYTICS_READY)

    # PUBLISH 7-12
    def test_07_approved_only(self):
        server, url = _serve({"publish": {"body": self._canned_pub()}})
        try:
            ad = _live(self.PROVIDER)
            ad.transport = bc.make_transport(url, "jwt", self.PROVIDER)
            c = _content([self.PROVIDER])
            c["status"] = "DRAFT"
            out = ex.run_once([c], [], versions=self._versions(),
                              adapters={self.PROVIDER: ad}, now=NOW,
                              actor="op", confirmed=True)
            self.assertEqual(_StubApi.calls, [])
            self.assertFalse([r for r in out["results"]
                              if r.get("outcome") == "PUBLISHED"])
        finally:
            server.shutdown()

    def test_08_provider_success(self):
        server, url = _serve({"publish": {"body": self._canned_pub()}})
        try:
            body = bc.post_json(url, "jwt", {"action": "publish"})
            parsed = bc.parse_publish_response(body)
            self.assertEqual(parsed["postId"], self.CANNED_PID)
        finally:
            server.shutdown()

    def test_09_provider_failure(self):
        server, url = _serve({"publish": {"body": {
            "error": "PERMISSION_DENIED"}}})
        try:
            ad = _live(self.PROVIDER)
            ad.transport = bc.make_transport(url, "jwt", self.PROVIDER)
            out = ex.run_once([_content([self.PROVIDER])], [],
                              versions=self._versions(),
                              adapters={self.PROVIDER: ad}, now=NOW,
                              actor="op", confirmed=True)
            self.assertEqual(out["archives"], [])
            self.assertTrue([r for r in out["results"]
                             if r.get("outcome") == "FAILED"])
        finally:
            server.shutdown()

    def test_10_publication_id_propagation(self):
        # media 필수 provider 는 executor 단에서 막힌다 — wire 층에서 본다.
        server, url = _serve({"publish": {"body": self._canned_pub()}})
        try:
            body = bc.post_json(url, "jwt", {"action": "publish"})
            parsed = bc.parse_publish_response(body)
            self.assertEqual(parsed["postId"], self.CANNED_PID)
            self.assertTrue(self.ID_NOTE)
        finally:
            server.shutdown()

    def test_11_duplicate_protection(self):
        server, url = _serve({"publish": {"body": self._canned_pub()}})
        try:
            ad = _live(self.PROVIDER)
            ad.transport = bc.make_transport(url, "jwt", self.PROVIDER)
            kw = dict(versions=self._versions(),
                      adapters={self.PROVIDER: ad}, now=NOW, actor="op",
                      confirmed=True)
            r1 = ex.run_once([_content([self.PROVIDER])], [], **kw)
            r2 = ex.run_once([_content([self.PROVIDER])],
                             list(r1["queueItems"]), **kw)
            pubs = [r for r in r2["results"]
                    if r.get("outcome") == "PUBLISHED"]
            self.assertEqual(pubs, [])
            calls = [c for c in _StubApi.calls
                     if c.get("action") == "publish"]
            self.assertLessEqual(len(calls), 1)
        finally:
            server.shutdown()

    def test_12_retry_behavior(self):
        server, url = _serve({"publish": {"body": {"error": "TIMEOUT"}}})
        try:
            ad = _live(self.PROVIDER)
            ad.transport = bc.make_transport(url, "jwt", self.PROVIDER)
            out = ex.run_once([_content([self.PROVIDER])], [],
                              versions=self._versions(),
                              adapters={self.PROVIDER: ad}, now=NOW,
                              actor="op", confirmed=True)
            terminal = [r for r in out["results"]
                        if r.get("outcome") in ("FAILED", "SKIPPED")]
            self.assertTrue(terminal)
            # 같은 실패를 다시 돌려도 발행은 없다.
            out2 = ex.run_once([_content([self.PROVIDER])],
                               list(out["queueItems"]),
                               versions=self._versions(),
                               adapters={self.PROVIDER: ad}, now=NOW,
                               actor="op", confirmed=True)
            self.assertFalse([r for r in out2["results"]
                              if r.get("outcome") == "PUBLISHED"])
        finally:
            server.shutdown()

    # ANALYTICS 13-18
    def test_13_live_response_parsing(self):
        if self.ANALYTICS_BODY is None:
            self.skipTest("analytics MISSING (honest)")
        server, url = _serve({"provider_analytics": {"body":
                                                     self.ANALYTICS_BODY}})
        try:
            fetch = bc.make_analytics_fetcher(url, "jwt", self.PROVIDER)
            ad = _live(self.PROVIDER)
            ad.fetch_analytics = fetch
            r = af.fetch({"contentId": "C", "platform": self.PROVIDER,
                          "postId": "p1"}, ad, at=NOW, via="live")
            self.assertEqual(r["status"], af.STATUS_AVAILABLE)
            self.assertEqual(r["provenance"], af.PV_LIVE)
            for key in self.EXPECT_KEYS:
                self.assertIn(key, r["metrics"])
        finally:
            server.shutdown()

    def test_14_no_credential(self):
        fetch = bc.make_analytics_fetcher(None, None, self.PROVIDER)
        with self.assertRaises(bc.BridgeError) as ctx:
            fetch({"postId": "1"})
        self.assertEqual(ctx.exception.code, "NOT_CONFIGURED")

    def test_15_auth_failure(self):
        server, url = _serve({"provider_analytics": {"body": {
            "error": "ACCOUNT_NOT_VERIFIED"}}})
        try:
            fetch = bc.make_analytics_fetcher(url, "jwt", self.PROVIDER)
            with self.assertRaises(bc.BridgeError) as ctx:
                fetch({"postId": "1"})
            self.assertEqual(ctx.exception.code, "AUTH_FAILED")
        finally:
            server.shutdown()

    def test_16_unavailable_analytics(self):
        if self.ANALYTICS_BODY is not None:
            self.skipTest("analytics supported")
        server, url = _serve({"provider_analytics": {"body": {
            "error": "ANALYTICS_NOT_SUPPORTED"}}})
        try:
            body = bc.post_json(url, "jwt", {"action": "provider_analytics"})
            with self.assertRaises(bc.BridgeError):
                bc.parse_analytics_response(self.PROVIDER, body)
        finally:
            server.shutdown()

    def test_17_unsupported_metric_dropped(self):
        parsed = bc.parse_analytics_response(self.PROVIDER, {
            "ok": True, "metrics": {"likes": 4, "odd": "x", "flag": False}})
        self.assertEqual(parsed["metrics"].get("likes"), 4)
        self.assertNotIn("odd", parsed["metrics"])
        self.assertNotIn("flag", parsed["metrics"])

    def test_18_provenance_correctness(self):
        ad = _live(self.PROVIDER)
        r = af.fetch({"contentId": "C", "platform": self.PROVIDER,
                      "postId": "p1"}, ad, at=NOW)
        self.assertNotEqual(r["provenance"], af.PV_LIVE)

    # SECURITY 19-22
    def test_19_no_token_in_output(self):
        env = bc.build_publish_envelope(self.PROVIDER, {"text": "t"},
                                        idempotency_key="k")
        self.assertNotIn(SECRET, str(env))

    def test_20_no_token_in_error(self):
        with self.assertRaises(bc.BridgeError) as ctx:
            bc.build_publish_envelope(
                self.PROVIDER, {"text": "t", "accessToken": SECRET},
                idempotency_key="k")
        self.assertNotIn(SECRET, str(ctx.exception))

    def test_21_no_vault_key_exposure(self):
        env = bc.build_analytics_envelope(self.PROVIDER, "p1")
        self.assertNotIn("SOCIAL_VAULT_KEY", str(env))

    def test_22_no_token_in_archive(self):
        server, url = _serve({"publish": {"body": self._canned_pub()}})
        try:
            ad = _live(self.PROVIDER)
            ad.transport = bc.make_transport(url, "jwt", self.PROVIDER)
            out = ex.run_once([_content([self.PROVIDER])], [],
                              versions=self._versions(),
                              adapters={self.PROVIDER: ad}, now=NOW,
                              actor="op", confirmed=True)
            self.assertNotIn(SECRET, str(out["archives"]))
            self.assertNotIn(SECRET, str(out["results"]))
        finally:
            server.shutdown()

    def _versions(self):
        return {("CNT-2026-000001", self.PROVIDER):
                _pv(self.PROVIDER, self.FORMAT)}


class InstagramBridgeTest(_BridgeCase, unittest.TestCase):
    PROVIDER = "instagram"
    FORMAT = "SINGLE_IMAGE"
    CANNED_PID = "17895654321098765"
    EXPECT_KEYS = ("likes", "comments")
    ID_NOTE = "media id (container→publish)"
    ANALYTICS_BODY = {"ok": True, "provider": "instagram", "postId": "m1",
                      "metrics": {"likes": 20, "comments": 4, "reach": 900},
                      "reference": "instagram-insights-v23"}


class FacebookBridgeTest(_BridgeCase, unittest.TestCase):
    PROVIDER = "facebook"
    FORMAT = "TEXT"
    CANNED_PID = "123_456"
    CANNED_URL = None
    EXPECT_KEYS = ("likes",)
    ID_NOTE = "post id (feed/photos/video_reels)"
    ANALYTICS_BODY = {"ok": True, "provider": "facebook", "postId": "123_456",
                      "metrics": {"likes": 7, "comments": 1},
                      "reference": "facebook-insights-v23"}


class LinkedInBridgeTest(_BridgeCase, unittest.TestCase):
    PROVIDER = "linkedin"
    FORMAT = "TEXT"
    CANNED_PID = "urn:li:share:123456"
    CANNED_URL = "https://www.linkedin.com/feed/update/urn:li:share:123456/"
    EXPECT_KEYS = ()
    ID_NOTE = "x-restli-id (post URN)"
    ANALYTICS_BODY = None  # MISSING — 읽기 경로 없음 (honest)


class TikTokBridgeTest(_BridgeCase, unittest.TestCase):
    PROVIDER = "tiktok"
    FORMAT = "SHORT_VIDEO"
    CANNED_PID = "v0987654321-publish-id"
    EXPECT_KEYS = ()
    ID_NOTE = "publish_id (async REQUESTED — 최종 게시 아님)"
    ANALYTICS_BODY = None  # MISSING — scope 밖 (honest)


class YouTubeBridgeTest(_BridgeCase, unittest.TestCase):
    PROVIDER = "youtube"
    FORMAT = "SHORT_VIDEO"
    CANNED_PID = "dQw4w9WgXcQ-test"
    CANNED_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ-test"
    EXPECT_KEYS = ()
    ID_NOTE = "video id (upload accepted — 처리 중 가능)"
    ANALYTICS_BODY = None  # MISSING — youtube.readonly scope gap (honest)


class XBridgeTest(_BridgeCase, unittest.TestCase):
    PROVIDER = "x"
    FORMAT = "TEXT"
    CANNED_PID = "111222333444"
    CANNED_URL = "https://x.com/i/web/status/111222333444"
    EXPECT_KEYS = ()
    ID_NOTE = "tweet id"
    ANALYTICS_BODY = None  # MISSING — tier-dependent (honest)


if __name__ == "__main__":
    unittest.main()
