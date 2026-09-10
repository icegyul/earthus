# -*- coding: utf-8 -*-
"""executor.py 시험 — SNS FACTORY. 한 번만 유효하게 나가는지 본다."""
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import sns_adapters as adapters  # noqa: E402
from sns_adapters.base import AdapterError  # noqa: E402
import executor as ex  # noqa: E402

NOW = "2026-09-10T00:00:00Z"
PAST = "2026-09-09T21:00:00Z"
FUTURE = "2026-09-11T00:00:00Z"


def _content(cid="CNT-2026-000001", status="APPROVED", scheduled_at=PAST,
             platforms=("threads",)):
    return {"contentId": cid, "version": 1, "status": status,
            "eligibility": "ELIGIBLE", "priority": "P2",
            "type": "NOW", "language": "ko",
            "scheduledAt": scheduled_at, "platforms": list(platforms),
            "phenomenonIds": [], "eventIds": [], "reportIds": [],
            "datasetRefs": [], "dataSnapshotId": None, "visualAssetIds": []}


def _pv(cid="CNT-2026-000001", platform="threads"):
    return {"masterContentId": cid, "platform": platform, "format": "TEXT",
            "text": "관측: 파고 2.3m", "hashtags": []}


def _versions(content, platforms=None):
    return {(content["contentId"], p): _pv(content["contentId"], p)
            for p in (platforms or content["platforms"])}


class _Flaky:
    """TEMPORARY 로 n 번 실패했다가 되는 어댑터."""
    platform = "threads"
    mode = "MOCK"
    metrics = ("likes",)

    def __init__(self, fails=1):
        self.left = fails
        self.calls = 0

    def generate_payload(self, pv, **kw):
        return {"provider": "threads", "text": pv["text"],
                "idempotencyKey": "k%d" % self.calls}

    def publish(self, payload, **kw):
        self.calls += 1
        if self.left > 0:
            self.left -= 1
            raise AdapterError("시간초과", kind="TEMPORARY", code="TIMEOUT")
        return {"status": "PUBLISHED", "mock": True, "platform": "threads",
                "postId": "mock-%d" % self.calls, "url": None,
                "publishedAt": NOW, "idempotencyKey": payload["idempotencyKey"]}

    def fetch_analytics(self, publication):
        return {"metrics": {}}


class _Dead:
    platform = "threads"
    mode = "MOCK"
    metrics = ("likes",)

    def generate_payload(self, pv, **kw):
        return {"provider": "threads", "text": "t", "idempotencyKey": "k"}

    def publish(self, payload, **kw):
        raise AdapterError("권한 없음", kind="PERMANENT",
                           code="PERMISSION_DENIED")

    def fetch_analytics(self, publication):
        return {"metrics": {}}


class ExecutorTest(unittest.TestCase):
    def _adapters(self):
        return {"threads": adapters.get("threads"),
                "x": adapters.get("x")}

    def test_approved_due_publishes(self):
        c = _content()
        out = ex.run_once([c], [], versions=_versions(c),
                          adapters=self._adapters(), now=NOW)
        pubs = [r for r in out["results"] if r.get("outcome") == "PUBLISHED"]
        self.assertEqual(len(pubs), 1)
        self.assertEqual(len(out["archives"]), 1)
        self.assertEqual(len(out["audits"]), 1)
        self.assertTrue(pubs[0]["mock"])

    def test_approved_future_skips(self):
        c = _content(scheduled_at=FUTURE)
        out = ex.run_once([c], [], versions=_versions(c),
                          adapters=self._adapters(), now=NOW)
        self.assertFalse([r for r in out["results"]
                          if r.get("outcome") == "PUBLISHED"])
        self.assertEqual(out["queueItems"], [])

    def test_pending_skips(self):
        c = _content(status="REVIEW")
        out = ex.run_once([c], [], versions=_versions(c),
                          adapters=self._adapters(), now=NOW)
        self.assertFalse([r for r in out["results"]
                          if r.get("outcome") == "PUBLISHED"])
        self.assertTrue([r for r in out["results"]
                         if r.get("outcome") == "SKIPPED"])

    def test_draft_never_admitted(self):
        c = _content(status="DRAFT")
        claimed = set()
        added, res, _, _ = ex.execute_item(
            {"releaseKey": "REL:x", "contentId": c["contentId"],
             "platform": "threads", "scheduledAt": PAST},
            c, _pv(), self._adapters()["threads"], [],
            now=NOW, actor="t", source="scheduler", claimed=claimed)
        self.assertEqual(res["outcome"], ex.OUT_NOT_APPROVED)
        self.assertEqual(added, [])

    def test_rejected_skips(self):
        c = _content(status="REJECTED")
        out = ex.run_once([c], [], versions=_versions(c),
                          adapters=self._adapters(), now=NOW)
        self.assertFalse([r for r in out["results"]
                          if r.get("outcome") == "PUBLISHED"])

    def test_duplicate_claim_one_publish(self):
        c = _content()
        shared = set()
        kw = dict(versions=_versions(c), adapters=self._adapters(), now=NOW,
                  claimed=shared)
        r1 = ex.run_once([c], [], **kw)
        r2 = ex.run_once([c], [], **kw)
        pubs = [r for r in r1["results"] + r2["results"]
                if r.get("outcome") == "PUBLISHED"]
        self.assertEqual(len(pubs), 1)
        self.assertTrue([r for r in r2["results"]
                         if r.get("outcome") == "ALREADY_PROCESSED"])

    def test_duplicate_scheduler_run_one_publish(self):
        c = _content()
        kw = dict(versions=_versions(c), adapters=self._adapters(), now=NOW)
        r1 = ex.run_once([c], [], **kw)
        queue = list(r1["queueItems"])
        r2 = ex.run_once([c], queue, **kw)
        pubs = [r for r in r2["results"] if r.get("outcome") == "PUBLISHED"]
        self.assertEqual(pubs, [])

    def test_already_published_no_republish(self):
        c = _content()
        kw = dict(versions=_versions(c), adapters=self._adapters(), now=NOW)
        r1 = ex.run_once([c], [], **kw)
        self.assertEqual(len(r1["archives"]), 1)
        r2 = ex.run_once([c], list(r1["queueItems"]), **kw)
        self.assertEqual([r for r in r2["results"]
                          if r.get("outcome") == "PUBLISHED"], [])
        self.assertEqual(len(r2["archives"]), 0)

    def test_failure_marks_failed(self):
        c = _content()
        out = ex.run_once([c], [], versions=_versions(c),
                          adapters={"threads": _Dead()}, now=NOW)
        fails = [r for r in out["results"] if r.get("outcome") == "FAILED"]
        self.assertEqual(len(fails), 1)
        self.assertEqual(out["archives"], [])
        item = out["queueItems"][0]
        self.assertEqual(item["status"], "FAILED")

    def test_retry_uses_backoff(self):
        c = _content()
        out = ex.run_once([c], [], versions=_versions(c),
                          adapters={"threads": _Flaky(fails=99)}, now=NOW)
        item = out["queueItems"][0]
        self.assertEqual(item["status"], "QUEUED")
        # 첫 시도 뒤 1분(BACKOFF 표 첫 칸) 쉰다.
        self.assertEqual(item["nextAttemptAt"], "2026-09-10T00:01:00Z")

    def test_retry_then_one_success(self):
        c = _content()
        flaky = _Flaky(fails=1)
        kw = dict(versions=_versions(c), adapters={"threads": flaky})
        r1 = ex.run_once([c], [], now=NOW, **kw)
        self.assertEqual(r1["queueItems"][0]["status"], "QUEUED")
        later = r1["queueItems"][0]["nextAttemptAt"]
        r2 = ex.run_once([c], list(r1["queueItems"]), now=later, **kw)
        pubs = [r for r in r2["results"] if r.get("outcome") == "PUBLISHED"]
        self.assertEqual(len(pubs), 1)
        # 실패 1 + 재시도 1 = 2호출, 유효 발행은 1건이다.
        self.assertEqual(flaky.calls, 2)

    def test_manual_scheduler_race(self):
        c = _content()
        shared = set()
        kw = dict(versions=_versions(c), adapters=self._adapters(), now=NOW,
                  claimed=shared)
        m = ex.run_once([c], [], source="manual", actor="human-1", **kw)
        s = ex.run_once([c], [], source="scheduler", **kw)
        pubs = [r for r in m["results"] + s["results"]
                if r.get("outcome") == "PUBLISHED"]
        self.assertEqual(len(pubs), 1)

    def test_processing_blocks_second(self):
        c = _content()
        proc = {"status": "PROCESSING", "contentId": c["contentId"],
                "platform": "threads", "scheduledAt": PAST}
        out = ex.run_once([c], [proc], versions=_versions(c),
                          adapters=self._adapters(), now=NOW)
        self.assertFalse([r for r in out["results"]
                          if r.get("outcome") == "PUBLISHED"])

    def test_batch_survives_adapter_failure(self):
        c1 = _content(cid="CNT-2026-000001", platforms=("threads",))
        c2 = _content(cid="CNT-2026-000002", platforms=("x",))
        ads = {"threads": _Dead(), "x": adapters.get("x")}
        out = ex.run_once([c1, c2], [],
                          versions={**_versions(c1), **_versions(c2)},
                          adapters=ads, now=NOW)
        by = {r["contentId"]: r["outcome"] for r in out["results"]
              if r.get("contentId")}
        self.assertEqual(by["CNT-2026-000001"], "FAILED")
        self.assertEqual(by["CNT-2026-000002"], "PUBLISHED")

    def test_provider_failure_isolated(self):
        c = _content(platforms=("threads", "x"))
        ads = {"threads": _Dead(), "x": adapters.get("x")}
        out = ex.run_once([c], [], versions=_versions(c),
                          adapters=ads, now=NOW)
        outs = sorted(r["outcome"] for r in out["results"]
                      if r.get("platform") == "threads"
                      or r.get("contentId"))
        self.assertIn("FAILED", outs)
        self.assertIn("PUBLISHED", outs)


if __name__ == "__main__":
    unittest.main()
