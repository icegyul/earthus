# -*- coding: utf-8 -*-
"""bridge_client.py 시험 — 토큰 경계 + 실응답 계약. (22 tests)"""
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import sns_adapters as adapters  # noqa: E402
import bridge_client as bc  # noqa: E402
import executor as ex  # noqa: E402
import analytics_fetch as af  # noqa: E402

NOW = "2026-09-10T00:00:00Z"
SECRET = "tok-secret-9z"


class _StubApi(BaseHTTPRequestHandler):
    canned = {}
    calls = []

    def log_message(self, *a):
        pass

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length).decode("utf-8"))
        type(self).calls.append(body)
        action = body.get("action")
        canned = type(self).canned.get(action, {})
        data = json.dumps(canned.get("body", {})).encode("utf-8")
        self.send_response(canned.get("status", 200))
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def _serve(canned):
    _StubApi.canned = canned
    _StubApi.calls = []
    server = HTTPServer(("127.0.0.1", 0), _StubApi)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, "http://127.0.0.1:%d/fn" % server.server_address[1]


def _content():
    return {"contentId": "CNT-2026-000001", "version": 1, "title": "[TEST] 다리",
            "status": "APPROVED", "eligibility": "ELIGIBLE", "priority": "P2",
            "type": "NOW", "language": "ko",
            "scheduledAt": "2026-09-09T21:00:00Z", "platforms": ["threads"],
            "phenomenonIds": [], "eventIds": [], "reportIds": [],
            "datasetRefs": [], "dataSnapshotId": None, "visualAssetIds": []}


def _versions():
    return {("CNT-2026-000001", "threads"):
            {"masterContentId": "CNT-2026-000001", "platform": "threads",
             "format": "TEXT", "text": "[TEST] 관측: 파고 2.3m", "hashtags": []}}


def _live_threads():
    ad = adapters.get("threads", mode="LIVE")
    # verifiedAt 이후 상태 모사: 토큰은 서버 vault 에 있고,
    # 여기서는 "확인됐다"는 표시만 든다. 값은 없다.
    ad.credentials_present = True
    return ad


class BridgeHealthTest(unittest.TestCase):
    def test_no_credential_no_call(self):
        with self.assertRaises(bc.BridgeError) as ctx:
            bc.post_json(None, None, {})
        self.assertEqual(ctx.exception.code, "NOT_CONFIGURED")

    def test_envelope_shape_no_secrets(self):
        env = bc.build_publish_envelope(
            "threads", {"text": "t", "mediaId": None, "options": {}},
            idempotency_key="k1")
        self.assertEqual(env["action"], "publish")
        self.assertTrue(env["confirmed"])
        self.assertNotIn("accessToken", str(env))

    def test_auth_failure_mapping(self):
        with self.assertRaises(bc.BridgeError) as ctx:
            bc.parse_analytics_response(
                "threads", {"error": "ACCOUNT_NOT_VERIFIED"})
        self.assertEqual(ctx.exception.code, "AUTH_FAILED")

    def test_confirmed_required(self):
        with self.assertRaises(bc.BridgeError):
            bc.build_publish_envelope("threads", {"text": "t"},
                                      idempotency_key="k", confirmed=False)

    def test_publish_permission_denied(self):
        with self.assertRaises(bc.BridgeError) as ctx:
            bc.parse_publish_response({"error": "PERMISSION_DENIED"})
        self.assertEqual(ctx.exception.code, "PERMISSION_DENIED")

    def test_analytics_needs_post(self):
        with self.assertRaises(bc.BridgeError):
            bc.build_analytics_envelope("threads", None)


class BridgePublishTest(unittest.TestCase):
    def test_approved_publish_roundtrip(self):
        server, url = _serve({"publish": {"body": {
            "ok": True, "postId": "17899", "url": "https://t/1",
            "publishedAt": NOW, "publishedBy": "op"}}})
        try:
            ad = _live_threads()
            ad.transport = bc.make_transport(url, "jwt", "threads")
            out = ex.run_once([_content()], [], versions=_versions(),
                              adapters={"threads": ad}, now=NOW,
                              actor="op", confirmed=True,
                              health_map={"threads": {"provenance": "live",
                                                      "publish_ready": True,
                                                      "analytics_ready": False}})
            pubs = [r for r in out["results"]
                    if r.get("outcome") == "PUBLISHED"]
            self.assertEqual(len(pubs), 1)
            self.assertFalse(pubs[0]["mock"])
            self.assertEqual(len(_StubApi.calls), 1)
        finally:
            server.shutdown()

    def test_non_approved_blocked_no_call(self):
        server, url = _serve({"publish": {"body": {"ok": True,
                                                   "postId": "1"}}})
        try:
            ad = _live_threads()
            ad.transport = bc.make_transport(url, "jwt", "threads")
            c = _content()
            c["status"] = "DRAFT"
            out = ex.run_once([c], [], versions=_versions(),
                              adapters={"threads": ad}, now=NOW,
                              actor="op", confirmed=True)
            self.assertEqual(_StubApi.calls, [])
            self.assertFalse([r for r in out["results"]
                              if r.get("outcome") == "PUBLISHED"])
        finally:
            server.shutdown()

    def test_provider_api_success(self):
        server, url = _serve({"publish": {"body": {"ok": True,
                                                   "postId": "17899"}}})
        try:
            body = bc.post_json(url, "jwt", {"action": "publish"})
            parsed = bc.parse_publish_response(body)
            self.assertEqual(parsed["postId"], "17899")
        finally:
            server.shutdown()

    def test_provider_api_failure_no_archive(self):
        server, url = _serve({"publish": {"body": {
            "error": "PERMISSION_DENIED"}}})
        try:
            ad = _live_threads()
            ad.transport = bc.make_transport(url, "jwt", "threads")
            out = ex.run_once([_content()], [], versions=_versions(),
                              adapters={"threads": ad}, now=NOW,
                              actor="op", confirmed=True)
            self.assertEqual(out["archives"], [])
            self.assertTrue([r for r in out["results"]
                             if r.get("outcome") == "FAILED"])
        finally:
            server.shutdown()

    def test_publication_id_propagates(self):
        server, url = _serve({"publish": {"body": {"ok": True,
                                                   "postId": "17899"}}})
        try:
            ad = _live_threads()
            ad.transport = bc.make_transport(url, "jwt", "threads")
            out = ex.run_once([_content()], [], versions=_versions(),
                              adapters={"threads": ad}, now=NOW,
                              actor="op", confirmed=True)
            self.assertEqual(out["archives"][0]["postId"], "17899")
        finally:
            server.shutdown()

    def test_duplicate_publish_blocked(self):
        server, url = _serve({"publish": {"body": {"ok": True,
                                                   "postId": "17899"}}})
        try:
            ad = _live_threads()
            ad.transport = bc.make_transport(url, "jwt", "threads")
            kw = dict(versions=_versions(), adapters={"threads": ad}, now=NOW,
                      actor="op", confirmed=True)
            r1 = ex.run_once([_content()], [], **kw)
            r2 = ex.run_once([_content()], list(r1["queueItems"]), **kw)
            self.assertEqual(len(_StubApi.calls), 1)
            self.assertEqual([r for r in r2["results"]
                              if r.get("outcome") == "PUBLISHED"], [])
        finally:
            server.shutdown()


class BridgeAnalyticsTest(unittest.TestCase):
    def test_real_response_mapped(self):
        server, url = _serve({"provider_analytics": {"body": {
            "ok": True, "provider": "threads", "postId": "17899",
            "metrics": {"likes": 12, "comments": 3, "shares": 1, "views": 400},
            "reference": "threads-insights-v1.0"}}})
        try:
            fetch = bc.make_analytics_fetcher(url, "jwt", "threads")
            ad = _live_threads()
            ad.fetch_analytics = fetch
            r = af.fetch({"contentId": "C", "platform": "threads",
                          "postId": "17899"}, ad, at=NOW, via="live")
            self.assertEqual(r["status"], af.STATUS_AVAILABLE)
            self.assertEqual(r["provenance"], af.PV_LIVE)
            self.assertEqual(r["metrics"]["likes"], 12)
            self.assertEqual(r["metrics"]["comments"], 3)
        finally:
            server.shutdown()

    def test_no_credential(self):
        fetch = bc.make_analytics_fetcher(None, None, "threads")
        with self.assertRaises(bc.BridgeError) as ctx:
            fetch({"postId": "1"})
        self.assertEqual(ctx.exception.code, "NOT_CONFIGURED")

    def test_auth_failure(self):
        server, url = _serve({"provider_analytics": {"body": {
            "error": "ACCOUNT_NOT_VERIFIED"}}})
        try:
            fetch = bc.make_analytics_fetcher(url, "jwt", "threads")
            with self.assertRaises(bc.BridgeError) as ctx:
                fetch({"postId": "1"})
            self.assertEqual(ctx.exception.code, "AUTH_FAILED")
        finally:
            server.shutdown()

    def test_unsupported_provider(self):
        server, url = _serve({"provider_analytics": {"body": {
            "error": "ANALYTICS_NOT_SUPPORTED"}}})
        try:
            body = bc.post_json(url, "jwt", {"action": "provider_analytics"})
            with self.assertRaises(bc.BridgeError):
                bc.parse_analytics_response("x", body)
        finally:
            server.shutdown()

    def test_unsupported_metric_dropped(self):
        parsed = bc.parse_analytics_response("threads", {
            "ok": True, "metrics": {"likes": 5, "weird": "x", "flag": True}})
        self.assertEqual(parsed["metrics"], {"likes": 5})

    def test_fixture_is_not_live(self):
        ad = _live_threads()
        r = af.fetch({"contentId": "C", "platform": "threads",
                      "postId": "17899"}, ad, at=NOW)
        self.assertNotEqual(r["provenance"], af.PV_LIVE)


class BridgeSecurityTest(unittest.TestCase):
    def test_token_not_returned(self):
        env = bc.build_publish_envelope("threads", {"text": "t"},
                                        idempotency_key="k")
        self.assertNotIn(SECRET, str(env))
        parsed = bc.parse_publish_response({"ok": True, "postId": "1"})
        self.assertNotIn(SECRET, str(parsed))

    def test_token_rejected_before_io(self):
        with self.assertRaises(bc.BridgeError) as ctx:
            bc.build_publish_envelope(
                "threads", {"text": "t", "accessToken": SECRET},
                idempotency_key="k")
        self.assertEqual(ctx.exception.code, "SECRET_IN_ENVELOPE")

    def test_vault_key_never_returned(self):
        for fn in (lambda: bc.build_analytics_envelope("threads", "1"),
                   lambda: bc.parse_analytics_response(
                       "threads", {"ok": True, "metrics": {}})):
            self.assertNotIn("SOCIAL_VAULT_KEY", str(fn()))

    def test_token_not_in_exception(self):
        try:
            bc.build_publish_envelope(
                "threads", {"text": "t", "refreshToken": SECRET},
                idempotency_key="k")
            self.fail("must raise")
        except bc.BridgeError as e:
            self.assertNotIn(SECRET, str(e))


if __name__ == "__main__":
    unittest.main()
