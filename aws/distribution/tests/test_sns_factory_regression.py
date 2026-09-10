# -*- coding: utf-8 -*-
"""SNS FACTORY 기존 계약 regression — 7 adapter + queue/archive 확장.

새 훅이 기존 동작을 바꾸지 않았는지 확인한다.
어댑터마다 최소: 상한 미설정(None) · 읽기 무네트워크 · 능력 일치 ·
매체검증이 media_required 와 같은 말하기.
"""
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import sns_adapters as adapters  # noqa: E402
import publish_queue as pq  # noqa: E402
import archive as arch  # noqa: E402
import analytics_fetch as af  # noqa: E402


def _pv(platform, fmt="TEXT"):
    return {"masterContentId": "CNT-2026-000001", "platform": platform,
            "format": fmt, "text": "관측: 파고 2.3m",
            "hashtags": [], "limit": 500, "textLength": 12}


class AdapterRegressionTest(unittest.TestCase):
    def test_all_seven_present(self):
        self.assertEqual(set(adapters.ADAPTERS),
                         {"instagram", "x", "facebook", "linkedin",
                          "youtube", "threads", "tiktok"})

    def test_new_hooks_do_not_break_contract(self):
        for name in adapters.ADAPTERS:
            ad = adapters.get(name)
            with self.subTest(platform=name):
                # 상한: 모르면 None. 강제하지 않는다.
                self.assertIsNone(ad.get_rate_limit())
                # 읽기: 네트워크 없이 빈 그릇.
                got = ad.fetch_analytics({"postId": "p1"})
                self.assertEqual(got["metrics"], {})
                # 능력: 클래스 값과 같은 말.
                caps = ad.provider_capabilities()
                self.assertEqual(caps["platform"], name)
                self.assertEqual(caps["mediaRequired"], ad.media_required)
                self.assertEqual(caps["metrics"], list(ad.metrics))
                # 기존 미리보기는 그대로 돈다.
                pv = _pv(name, ad.formats[0] if ad.formats else "TEXT")
                payload = ad.generate_payload(pv)
                prev = ad.preview(payload)
                self.assertIn("valid", prev)

    def test_validate_media_matches_media_required(self):
        for name in adapters.ADAPTERS:
            ad = adapters.get(name)
            with self.subTest(platform=name):
                ok, _ = ad.validate_media(None)
                self.assertEqual(ok, not ad.media_required)
                ok, _ = ad.validate_media({"assetId": "a1"})
                self.assertTrue(ok)

    def test_fetch_flows_into_not_available(self):
        ad = adapters.get("threads")
        pub = {"contentId": "CNT-1", "platform": "threads", "postId": "p1"}
        r = af.fetch(pub, ad, at="2026-09-10T00:00:00Z")
        self.assertEqual(r["status"], af.STATUS_NOT_AVAILABLE)

    def test_queue_key_roundtrip(self):
        key = pq.queue_key("CNT-1", "threads", "2026-09-10T00:00:00Z")
        self.assertTrue(key.startswith("REL:"))
        import scheduled_release as sr  # noqa: E402
        self.assertEqual(
            key, sr.release_key("CNT-1", "threads", "2026-09-10T00:00:00Z"))
        items = [{"status": "QUEUED", "contentId": "CNT-1",
                  "platform": "threads",
                  "scheduledAt": "2026-09-10T00:00:00Z"}]
        self.assertTrue(pq.is_queued(
            items, content_id="CNT-1", platform="threads",
            scheduled_at="2026-09-10T00:00:00Z"))
        self.assertFalse(pq.is_queued(
            items, content_id="CNT-2", platform="threads",
            scheduled_at="2026-09-10T00:00:00Z"))
        done = [{"status": "PUBLISHED", "contentId": "CNT-1",
                 "platform": "threads",
                 "scheduledAt": "2026-09-10T00:00:00Z"}]
        self.assertFalse(pq.is_queued(
            done, content_id="CNT-1", platform="threads",
            scheduled_at="2026-09-10T00:00:00Z"))

    def test_archive_fetch_note_keeps_immutable(self):
        rec = {"contentId": "PUB:CNT-1:threads", "text": "관측: 파고 2.3m"}
        out = arch.note_analytics_fetch(
            rec, at="2026-09-10T00:00:00Z", platform="threads",
            status="AVAILABLE")
        self.assertEqual(out["text"], "관측: 파고 2.3m")
        self.assertEqual(len(out["analyticsFetches"]), 1)
        self.assertNotIn("analyticsFetches", rec)


if __name__ == "__main__":
    unittest.main()
