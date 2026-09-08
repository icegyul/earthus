# -*- coding: utf-8 -*-
"""INTEGRATION-3 §15 — 거버넌스 E2E.

한 개의 리포트(TEST-REPORT-001)를 만들어 **끝까지 걸어 본다**:

    DRAFT → READY_FOR_REVIEW → (사람 승인) → PUBLISHING → PUBLISHED → 되읽기

그리고 **길을 벗어나려는 시도**가 전부 막히는지 본다. 통과 경로 하나만 있는 시험은
문이 열려 있는지 잠겨 있는지 말해 주지 않는다.

⚠️ §14 를 지킨다: 화면 문구를 못박지 않는다. 상태·코드·연결만 본다.
"""
import json
import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.dirname(HERE)
AWS = os.path.dirname(ENGINE)
REPO = os.path.dirname(AWS)
sys.path.insert(0, ENGINE)
sys.path.insert(0, os.path.join(AWS, "_shared"))

import capture as cap                    # noqa: E402
import governance as gov                 # noqa: E402
import publication_privacy as priv       # noqa: E402
import publisher as pub                  # noqa: E402
import social_publish as sp              # noqa: E402

NOW = "2026-09-08T09:00:00Z"
HUMAN = dict(approved_by="dalur", approved_at=NOW, approval_method="UI_CLICK")


def visual_asset(asset_id="vis:TEST-REPORT-001:earth", **over):
    """실제 캡처 산출물과 **같은 모양**의 자산.

    ⚠️ 항목 이름을 지어내지 않는다 — tools/earthus_capture.mjs 가 쓰는 그대로다.
    """
    a = {
        "assetId": asset_id,
        "verified": True,
        "verifyConditions": {k: True for k in cap.VERIFY_CONDITIONS},
        "fileHash": "sha256:" + "b" * 64,
        "readBack": {"bytes": 51200, "decoded": {"ok": True, "w": 1280, "h": 720},
                     "hashMatches": True},
        "pixelCheck": {"mean": 22.1, "stdev": 38.9, "minStdev": 6, "passed": True},
        "sourceRoute": "http://localhost:8788/v2-three/index.html#v=1&live=sstfield",
        "layerState": {"requested": ["ocean/sstfield"],
                       "requestedLive": ["sstfield"], "observed": ["sstfield"]},
        "factRefs": ["fact:2026-08:sst:global"],
    }
    a.update(over)
    return a


def make_report(**over):
    """TEST-REPORT-001 — 이 시험이 끝까지 끌고 갈 리포트."""
    r = {
        "reportId": "TEST-REPORT-001",
        "schemaVersion": "earthus.report-engine.v1",
        "type": "RETROSPECTIVE_MONTHLY",
        "period": "2026-08",
        "version": 1,
        "lifecycle": "VALIDATING",
        "generatedAt": NOW,
        "dataSnapshotId": "snapshot:2026-08:test",
        "algorithmVersion": "test-1",
        "title": {"ko": "2026년 8월 지구", "en": "Earth in August 2026"},
        "facts": [{"factId": "fact:2026-08:sst:global", "value": 20.98,
                   "unit": "degC", "sourceRefs": ["ocean/series/sst-daily.json"]}],
        "stories": [{"storyId": "story:1", "phenomenonIds": ["ocean.sst"],
                     "factRefs": ["fact:2026-08:sst:global"]}],
        "visualManifest": cap.manifest([visual_asset()], report_id="TEST-REPORT-001",
                                       generated_at=NOW),
    }
    r.update(over)
    return r


def make_content(**over):
    c = {
        "contentId": "CNT-TEST-000001",
        "schemaVersion": "earthus.distribution-content.v1",
        "status": "REVIEW",
        "type": "MONTHLY_EARTH",
        "reportIds": ["TEST-REPORT-001"],
        "storyIds": ["story:1"],
        "phenomenonIds": ["ocean.sst"],
        "datasetRefs": ["ocean/series/sst-daily.json"],
        "claims": [{"text": "2026년 8월 전지구 해수면온도"}],
        "dataSnapshotId": "snapshot:2026-08:test",
        "numericPool": [20.98],
        "visualAssetIds": ["vis:TEST-REPORT-001:earth"],
        "platformVersions": {"x": {"text": "hi", "idempotencyKey": "k1"}},
        "eligibility": "ELIGIBLE",
    }
    c.update(over)
    return c


class _Adapter(object):
    """플랫폼 대역. 되읽기까지 정상으로 답한다 — 막히는 이유가 게이트뿐이게."""
    credentials_present = True
    name = "fake"

    def __init__(self):
        self._post = "p1"

    def publish(self, payload, confirmed=False, actor=None, at=None):
        return {"ok": True, "postId": self._post, "url": "https://x.test/%s" % self._post,
                "status": "PUBLISHED", "idempotencyKey": payload.get("idempotencyKey"),
                "publishedAt": at}

    def get_status(self, publication):
        return {"postId": publication.get("postId"), "state": "PUBLISHED",
                "url": publication.get("url")}


# ── 정상 경로 ────────────────────────────────────────────────────────────────
class HappyPath(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.root, True)

    def test_리포트가_사람_승인을_거쳐_발행되고_되읽힌다(self):
        r = make_report(lifecycle="PUBLISHED")          # 기계 검증까지 통과한 상태
        self.assertEqual(pub.approval_state(r), "READY_FOR_REVIEW")

        approved = pub.approve(r, approved_by="dalur", approved_at=NOW,
                               approval_method="CLI_CONFIRM")
        self.assertEqual(pub.approval_state(approved), "APPROVED")

        out = pub.publish_pipeline(approved, pub.LocalPublishAdapter(self.root))
        self.assertTrue(out["ok"], out)
        self.assertTrue(out["published"])
        self.assertTrue(out["verify"]["ok"])            # 되읽어 해시가 맞았다
        self.assertFalse(out["approvalBypassed"])
        # 발행본이 실제로 그 자리에 있다
        self.assertTrue(os.path.exists(os.path.join(self.root, out["key"])))

    def test_콘텐츠가_사람_승인을_거쳐_발행되고_되읽힌다(self):
        c = make_content()
        ready = sp.readiness(c, visual_assets=[visual_asset()])
        self.assertEqual(ready["state"], "PAYLOAD_READY", ready["problems"])

        approved = sp.approve(c, **HUMAN)
        out = sp.publish_platform(approved, "x", _Adapter(), at=NOW,
                                  visual_assets=[visual_asset()], confirmed=True)
        self.assertEqual(out["state"], "PUBLISHED", out.get("reason"))
        self.assertTrue(out["readBack"]["verified"])
        self.assertEqual(out["approval"]["approvedBy"], "dalur")

    def test_승인_기록이_네_항목을_전부_남긴다(self):
        a = pub.approve(make_report(), approved_by="dalur", approved_at=NOW,
                        approval_method="UI_CLICK")[gov.APPROVAL_FIELD]
        self.assertEqual(a["approvedBy"], "dalur")
        self.assertEqual(a["approvedAt"], NOW)
        self.assertEqual(a["approvalMethod"], "UI_CLICK")
        self.assertEqual(len(a["approvalRevision"]), 64)


# ── 부정 경로 — 여기가 본론이다 ──────────────────────────────────────────────
class NegativeCases(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.root, True)

    # 1
    def test_1_시스템_계정은_승인할_수_없다(self):
        for who in ("system", "earthus-report-bot", "lambda", "ci-runner",
                    "svc.publisher", "automation", None, ""):
            with self.assertRaises(gov.GovernanceError, msg="%r 가 통과했다" % who):
                pub.approve(make_report(), approved_by=who, approved_at=NOW,
                            approval_method="UI_CLICK")

    # 2
    def test_2_승인_없이는_발행되지_않는다(self):
        out = pub.publish_pipeline(make_report(lifecycle="PUBLISHED"),
                                   pub.LocalPublishAdapter(self.root))
        self.assertFalse(out["ok"])
        self.assertEqual(out["reason"], "NOT_APPROVED")
        self.assertEqual(out["approvalState"], "READY_FOR_REVIEW")
        self.assertFalse(out["published"])
        self.assertFalse(os.listdir(self.root))         # 아무것도 안 썼다

    # 3
    def test_3_상태만_승인이면_발행되지_않는다(self):
        """자동 상태 전이가 승인 자리를 채우는 것을 막는다."""
        c = make_content(status="APPROVED")             # 사람 기록 없이 상태만
        self.assertEqual(sp.approval_state(c), "STATUS_ONLY")
        out = sp.publish_platform(c, "x", _Adapter(), at=NOW,
                                  visual_assets=[visual_asset()], confirmed=True)
        self.assertEqual(out["state"], "STATUS_ONLY")
        self.assertIsNone(out["publishedAt"])

    # 4
    def test_4_승인_뒤_내용이_바뀌면_승인이_깨진다(self):
        approved = pub.approve(make_report(lifecycle="PUBLISHED"), approved_by="dalur",
                               approved_at=NOW, approval_method="UI_CLICK")
        tampered = dict(approved)
        tampered["facts"] = [dict(approved["facts"][0], value=99.9)]
        self.assertEqual(pub.approval_state(tampered), "APPROVAL_INVALID")
        out = pub.publish_pipeline(tampered, pub.LocalPublishAdapter(self.root))
        self.assertFalse(out["ok"])
        self.assertFalse(out["published"])

    # 5
    def test_5_금지된_전이는_전부_막힌다(self):
        forbidden = (("DRAFT", "PUBLISHED"), ("DRAFT", "APPROVED"),
                     ("READY_FOR_REVIEW", "PUBLISHED"), ("APPROVED", "PUBLISHED"),
                     ("PUBLISHED", "PUBLISHED"), ("PUBLISHED", "DRAFT"),
                     ("ARCHIVED", "PUBLISHED"))
        for a, b in forbidden:
            r = gov.can_transition(a, b)
            self.assertFalse(r["allowed"], "%s -> %s" % (a, b))
            self.assertEqual(r["code"], "FORBIDDEN_TRANSITION")

    # 6
    def test_6_확인_안된_시각자산은_공개로_못_나간다(self):
        broken = visual_asset(readBack={"bytes": 1, "hashMatches": False,
                                        "decoded": {"ok": False}})
        chk = gov.visual_asset_check(broken)
        self.assertFalse(chk["ok"])
        self.assertEqual(chk["code"], "PUBLIC_CONTENT_INVALID")

        r = make_report(lifecycle="PUBLISHED")
        r["visualManifest"] = cap.manifest([broken], report_id=r["reportId"],
                                           generated_at=NOW)
        approved = pub.approve(r, approved_by="dalur", approved_at=NOW,
                               approval_method="UI_CLICK")
        out = pub.publish_pipeline(approved, pub.LocalPublishAdapter(self.root))
        self.assertFalse(out["ok"])
        self.assertEqual(out["reason"], "PUBLIC_CONTENT_INVALID")
        self.assertFalse(os.listdir(self.root))

    # 7
    def test_7_발행본은_덮어쓰이지_않는다(self):
        approved = pub.approve(make_report(lifecycle="PUBLISHED"), approved_by="dalur",
                               approved_at=NOW, approval_method="UI_CLICK")
        ad = pub.LocalPublishAdapter(self.root)
        first = pub.publish_pipeline(approved, ad)
        self.assertTrue(first["published"])

        # 같은 판을 다시 올리려 하면 보존된다 — 내용이 바뀌어도 덮이지 않는다
        changed = dict(approved)
        changed["title"] = {"ko": "몰래 바꾼 제목", "en": "tampered"}
        changed = pub.approve(changed, approved_by="dalur", approved_at=NOW,
                              approval_method="UI_CLICK")
        second = pub.publish_pipeline(changed, ad)
        self.assertTrue(second.get("alreadyPreserved"))
        self.assertFalse(second["published"])
        with open(os.path.join(self.root, first["key"]), encoding="utf-8") as fh:
            on_disk = json.load(fh)
        self.assertEqual(on_disk["title"], approved["title"])   # 처음 것 그대로

    # 8
    def test_8_자격증명이_없으면_발행됐다고_하지_않는다(self):
        approved = pub.approve(make_report(lifecycle="PUBLISHED"), approved_by="dalur",
                               approved_at=NOW, approval_method="UI_CLICK")
        out = pub.publish_pipeline(approved, pub.S3PublishAdapter(bucket=None))
        self.assertFalse(out["ok"])
        self.assertEqual(out["reason"], pub.BLOCKED_NO_CREDENTIALS)
        self.assertFalse(out["published"])
        # 막힌 것을 '발행'으로 세지 않는다
        self.assertNotEqual(out.get("stage"), "PUBLISHED")

    # 9
    def test_9_승인_전_산출물은_공개_키에_못_쓴다(self):
        for st in ("DRAFT", "FACT_CHECK", "REVIEW", "REJECTED"):
            w = priv.check_public_write("events/x.json", make_content(status=st))
            self.assertFalse(w["allowed"], "%s 가 공개 경로에 허용된다" % st)
        w = priv.check_public_write("events/x.json",
                                    sp.approve(make_content(), **HUMAN))
        self.assertTrue(w["allowed"])


# ── 상태 기계 전체 ───────────────────────────────────────────────────────────
class StateMachine(unittest.TestCase):
    def test_모든_상태쌍이_판정된다(self):
        n = 0
        for a in gov.PUBLISH_STATES:
            for b in gov.PUBLISH_STATES:
                r = gov.can_transition(a, b)
                self.assertIn("allowed", r)
                if not r["allowed"]:
                    self.assertTrue(r["reason"])
                n += 1
        self.assertEqual(n, len(gov.PUBLISH_STATES) ** 2)

    def test_모르는_상태는_통과시키지_않는다(self):
        self.assertFalse(gov.can_transition("MADE_UP", "PUBLISHED")["allowed"])
        self.assertFalse(gov.can_transition("DRAFT", "MADE_UP")["allowed"])
        self.assertEqual(gov.can_transition("MADE_UP", "PUBLISHED")["code"],
                         "UNKNOWN_STATE")

    def test_끝_상태에서는_아무_데도_못_간다(self):
        self.assertEqual(gov.ALLOWED_TRANSITIONS["ARCHIVED"], ())


if __name__ == "__main__":
    unittest.main()
