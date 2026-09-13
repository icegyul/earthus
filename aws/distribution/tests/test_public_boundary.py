# -*- coding: utf-8 -*-
"""공개 경계 — 승인 전 후보가 익명으로 읽히지 않는지 본다.

왜 이 시험이 있는가 (2026-09-13 실측):
  · `events/` 접두사는 익명 200 이고 `archive/` 는 403 이다.
  · 이 엔진의 산출물은 전부 `status=DRAFT` 이며 publication_privacy 의 계약은
    DRAFT 를 "사람 승인 전 = 비공개"로 규정한다.
  · 그런데 보류 기준이 차단 목록 하나(`("BLOCKED",)`)뿐이라 **9/13 후보 8건 중 7건**이
    익명 공개 대상이었다. `REVIEW_REQUIRED`(사람 검토 필요)도 그중에 있었다.

⚠️ 네트워크를 쓰지 않는다. 살아 있는 주소 확인은 `python aws/verify-public-access.py` 가 한다.
"""
import importlib.util
import io
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
FN = os.path.dirname(HERE)
AWS = os.path.dirname(FN)
sys.path.insert(0, FN)
sys.path.insert(0, os.path.join(AWS, "_shared"))

import handler                                  # noqa: E402
import public_build as pb                       # noqa: E402
import publication_privacy as priv              # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules.setdefault(name, mod)
    spec.loader.exec_module(mod)
    return mod


VPA = _load("earthus_verify_public_access", os.path.join(AWS, "verify-public-access.py"))


def content(**over):
    """판정에 쓰이는 필드만 가진 최소 콘텐츠."""
    base = {"contentId": "CNT-2026-000001", "title": "시험", "status": "DRAFT",
            "eligibility": "ELIGIBLE", "safetyLevel": "LEVEL_1_AUTO", "blockReasons": []}
    base.update(over)
    return base


class PublicEligibilityTests(unittest.TestCase):
    """허용 목록이지 차단 목록이 아니다 — 요구 2·3·4."""

    def test_review_required_is_not_public(self):
        ok, why = handler.public_eligibility(content(eligibility="REVIEW_REQUIRED"))
        self.assertFalse(ok)
        self.assertIn("REVIEW_REQUIRED", why)

    def test_blocked_is_not_public(self):
        ok, why = handler.public_eligibility(content(eligibility="BLOCKED"))
        self.assertFalse(ok)
        self.assertIn("BLOCKED", why)

    def test_missing_or_unknown_eligibility_is_not_public(self):
        """자격 정보가 없거나 판정 불가능하면 막는다 — 모르는 것을 통과시키지 않는다."""
        for over in ({"eligibility": None}, {"eligibility": ""}, {"eligibility": "정체불명"}):
            ok, why = handler.public_eligibility(content(**over))
            self.assertFalse(ok, over)
            self.assertIsNotNone(why, over)
        bare = {"contentId": "CNT-X", "status": "PUBLISHED"}      # eligibility 키가 아예 없다
        self.assertFalse(handler.public_eligibility(bare)[0])
        self.assertEqual((False, "콘텐츠가 아니다"), handler.public_eligibility(None))

    def test_draft_is_not_public_even_when_eligible(self):
        """자격이 ELIGIBLE 이어도 DRAFT 는 사람 승인 전이다 — 계약이 그렇게 정한다."""
        ok, why = handler.public_eligibility(content())
        self.assertFalse(ok)
        self.assertIn("DRAFT", why)

    def test_a_properly_published_item_is_public(self):
        """정상 PUBLIC. 이 시험이 없으면 위 네 개는 '무조건 False' 로도 통과한다."""
        ok, why = handler.public_eligibility(content(status="PUBLISHED"))
        self.assertTrue(ok, why)
        self.assertIsNone(why)

    def test_human_only_and_block_reasons_are_not_public(self):
        self.assertFalse(handler.public_eligibility(
            content(status="PUBLISHED", safetyLevel="LEVEL_3_HUMAN_ONLY"))[0])
        self.assertFalse(handler.public_eligibility(
            content(status="PUBLISHED", blockReasons=["출처 불명"]))[0])


class IndexPublicItemsTests(unittest.TestCase):
    """색인의 publicItems 에는 통과한 것만 들어간다 — 요구 5."""

    def test_only_eligible_items_are_listed_as_public(self):
        contents = [content(contentId="CNT-1"),                               # DRAFT
                    content(contentId="CNT-2", eligibility="REVIEW_REQUIRED"),
                    content(contentId="CNT-3", eligibility="BLOCKED"),
                    content(contentId="CNT-4", status="PUBLISHED")]            # 유일한 통과
        idx = handler.build_index(contents, at="2026-09-13T00:00:00Z")
        self.assertEqual(["CNT-4"], idx["publicItems"])
        by_id = {i["contentId"]: i for i in idx["items"]}
        self.assertTrue(by_id["CNT-4"]["publicEligible"])
        for cid in ("CNT-1", "CNT-2", "CNT-3"):
            self.assertFalse(by_id[cid]["publicEligible"], cid)
            self.assertIsNotNone(by_id[cid]["publicWithheldReason"], cid)

    def test_todays_real_shape_yields_no_public_items(self):
        """지금 이 엔진이 만드는 모양(전부 DRAFT)에서는 공개 목록이 비어야 한다."""
        idx = handler.build_index([content(contentId="CNT-%d" % i) for i in range(1, 9)],
                                  at="2026-09-13T00:00:00Z")
        self.assertEqual([], idx["publicItems"])


class WriteBoundaryTests(unittest.TestCase):
    """쓰는 자리 자체가 비공개여야 한다."""

    def test_operational_keys_are_on_a_private_prefix(self):
        self.assertTrue(handler.INDEX_KEY.startswith("archive/"), handler.INDEX_KEY)
        self.assertTrue(handler.BODY_PREFIX.startswith("archive/"), handler.BODY_PREFIX)
        self.assertEqual("PRIVATE", priv.prefix_visibility(handler.INDEX_KEY))
        self.assertEqual("PRIVATE", priv.prefix_visibility(handler.BODY_PREFIX + "x.json"))

    def test_local_preview_keeps_the_already_denied_path(self):
        """로컬 미리보기를 archive/ 로 옮기면 public_build 가 막지 못해 공개 app/ 으로 실린다."""
        self.assertTrue(handler.LOCAL_INDEX_KEY.startswith("events/"))
        self.assertIsNotNone(pb.denial_for(handler.LOCAL_INDEX_KEY))
        self.assertIsNotNone(pb.denial_for(handler.LOCAL_BODY_PREFIX + "CNT-1.json"))
        self.assertIsNone(pb.denial_for("archive/distribution-content.json"),
                          "이것이 None 이라는 사실이 로컬 경로를 옮기지 못하는 이유다")

    def test_writing_a_draft_to_a_public_key_raises(self):
        with self.assertRaises(RuntimeError) as caught:
            handler._assert_write_allowed("events/distribution-content/CNT-1.json", content())
        self.assertIn("공개 경계 위반", str(caught.exception))

    def test_writing_to_the_private_key_is_allowed(self):
        v = handler._assert_write_allowed(handler.BODY_PREFIX + "CNT-1.json", content())
        self.assertTrue(v["allowed"])


class ProbeVerdictTests(unittest.TestCase):
    """부재를 통과로 세지 않는다 — 요구 1·6."""

    def setUp(self):
        real = VPA._status
        self.addCleanup(lambda: setattr(VPA, "_status", real))

    def _probe(self, code, want):
        VPA._status = lambda url, method="GET", data=None: (code, None)
        return VPA.read_probe("archive/distribution-content.json", want, "시험")

    def test_absent_does_not_prove_a_denied_row(self):
        r = self._probe(404, "DENIED")
        self.assertEqual("ABSENT", r["state"])
        self.assertFalse(r["ok"], "검증 대상이 없는 것은 증거가 아니다")

    def test_denied_row_passes_only_on_403(self):
        self.assertTrue(self._probe(403, "DENIED")["ok"])
        self.assertFalse(self._probe(200, "DENIED")["ok"])
        self.assertFalse(self._probe(None, "DENIED")["ok"])

    def test_absent_still_passes_a_cleanup_row(self):
        """CLOSED 는 '없는 것이 목표'인 잔존물 줄이다 — 그 뜻은 바꾸지 않는다."""
        self.assertTrue(self._probe(404, "CLOSED")["ok"])

    def test_open_fails_both_words(self):
        for want in ("CLOSED", "DENIED"):
            self.assertFalse(self._probe(200, want)["ok"], want)

    def test_probe_records_what_it_actually_proves(self):
        self.assertIn("객체 존재 여부는", self._probe(403, "DENIED")["proves"])

    def test_the_lambda_output_keys_are_probed_as_denied(self):
        """람다가 쓰는 두 키는 부재로 통과할 수 없어야 한다."""
        wants = {k: w for k, w, _ in VPA.READ_PROBES}
        self.assertEqual("DENIED", wants.get("archive/distribution-content.json"))
        self.assertEqual("DENIED",
                         wants.get("archive/distribution-content/CNT-2026-000001.json"))
        self.assertNotIn("DENIED", VPA.ABSENT_PASSES)

    def test_the_old_public_keys_are_still_watched(self):
        """옛 공개 자리에 객체가 생기면 잡아야 한다."""
        wants = {k: w for k, w, _ in VPA.READ_PROBES}
        self.assertEqual("CLOSED", wants.get("events/distribution-content.json"))
        self.assertEqual("CLOSED", wants.get("events/distribution-content/CNT-2026-000001.json"))


class ExitWiringTests(unittest.TestCase):
    """화면에 !! 가 찍히는데 exit 0 이 나가는 일이 없어야 한다."""

    def test_every_failing_row_reaches_the_exit_code(self):
        src = io.open(os.path.join(AWS, "verify-public-access.py"), encoding="utf-8").read()
        self.assertIn('failed = [r for r in rows if not r["ok"]]', src)
        self.assertIn("return 0 if not failed else 1", src)
        self.assertNotIn("return 0 if not (unknown or opened or closed_but_needed) else 1", src)


if __name__ == "__main__":
    unittest.main()
