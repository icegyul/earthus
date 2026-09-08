# -*- coding: utf-8 -*-
"""INTEGRATION-9 §1 · §2 · §3 — 발행본만 읽히고, 올린 뒤에만 발행이라 부른다.

⚠️⚠️ 이 파일이 있는 이유 — 두 가지가 동시에 잘못돼 있었다.

  하나. **발행해도 아무도 못 읽었다.**
        publisher 는 `reports/…` 에 올리고 앱은 그 자리에서 받는데, 버킷 정책에
        `reports/*` 가 없었다. 익명 GET 이 403 이고, 앱은 그것을
        "아직 발행된 보고서가 없습니다" 로 표시했다 — 못 읽는 것과 없는 것을
        구분하지 못했다.

  둘. **올린 적 없는 보고서가 "발행됨" 도장을 달고 있었다.**
        generator.run_publication_pipeline 이 업로드 **전에** publishedAt·
        immutableRef 를 찍었다. governance 는 그 도장을 보고 상태를 PUBLISHED 로
        읽고, PUBLISHED→PUBLISHING 은 금지 전이다. 그래서 운영 입구로는
        `adapter.publish()` 에 **도달조차 못 했다.** 검사기가 아니라 발행 자체가
        죽어 있었고, 그 사실이 문서에는 "발행됨"으로 적혀 있었다.

  고침은 둘 다 한 가지 원칙이다: **자리와 시점을 사실에 맞춘다.**

        reports/published/…   ← 버킷 정책이 여는 유일한 reports 자리
        reports/…  그 밖      ← 부여 없음. 표에도 없어 쓰기 자체가 거부된다
        발행 도장             ← put_object 직전에, 승인 문을 지난 뒤에만

이 시험은 네트워크도 자격증명도 쓰지 않는다.
운영 실측은 `python3 aws/verify-public-access.py` 와 §2 의 익명 두드리기가 한다.
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
sys.path.insert(0, ENGINE)
sys.path.insert(0, os.path.join(AWS, "_shared"))

import generator as gen                # noqa: E402
import governance as gov               # noqa: E402
import publication_privacy as priv     # noqa: E402
import publisher as pub                # noqa: E402
from test_phase7_pipeline import report_with_facts   # noqa: E402

NOW = "2026-09-08T00:00:00Z"
LATER = "2026-09-08T01:00:00Z"


def a_report(**over):
    r = {
        "schemaVersion": "earthus.report-engine.v1",
        "reportId": "report:2026-08",
        "type": "MONTHLY",
        "version": 1,
        "period": {"from": "2026-08-01", "to": "2026-08-31"},
        "dataSnapshotId": "snap:2026-08",
        "algorithmVersion": "1.0.0",
        "facts": [], "stories": [],
        "lifecycle": "PUBLISHED", "status": "PUBLISHED",
        "validatedAt": NOW,
    }
    r.update(over)
    return r


def approved(report, by="dalur", method="CLI_CONFIRM"):
    return gov.approve(dict(report), approved_by=by, approved_at=NOW,
                       approval_method=method)


# ────────────────────────────────────────────────────────────────────────────
class 발행본_자리(unittest.TestCase):
    """§1 — 공개되는 reports 자리는 하나뿐이다."""

    def test_발행_키가_published_아래다(self):
        self.assertEqual(pub.report_key(a_report()),
                         "reports/published/report/2026-08/v1.json")
        self.assertEqual(pub.INDEX_KEY, "reports/published/index.json")

    def test_버전이_키에_들어가_덮어쓸_수_없다(self):
        k1 = pub.report_key(a_report(version=1))
        k2 = pub.report_key(a_report(version=2))
        self.assertNotEqual(k1, k2)

    def test_표와_버킷_정책이_어긋나지_않는다(self):
        """의도(PUBLIC_PREFIXES)와 현실(BUCKET_PUBLIC_PREFIXES)의 차이가 0이어야 한다."""
        self.assertEqual(priv.PUBLIC_PREFIX_GAP, ())
        self.assertIn("reports/published/", priv.PUBLIC_PREFIXES)
        self.assertIn("reports/published/", priv.BUCKET_PUBLIC_PREFIXES)

    def test_published_밖의_reports_는_쓰기_자체가_거부된다(self):
        """정책이 안 여는 것과 **쓰지 못하는 것**은 다르다. 둘 다 막는다.

        접두사를 가른 진짜 이유가 여기 있다: 쓰는 쪽 검사가 깨져도
        초안이 공개 자리로 **갈 수 없다.**
        """
        ok_report = a_report()
        for key in ("reports/report/2026-08/v1.json",   # 옛 자리
                    "reports/index.json",               # 옛 색인
                    "reports/draft/x.json",
                    "reports/review/x.json",
                    "reports/published-ish/x.json"):    # 접두사 흉내
            out = priv.check_public_write(key, ok_report, kind="report")
            self.assertFalse(out["allowed"], "%s 가 허용된다" % key)
            self.assertEqual(out["keyVisibility"], "UNKNOWN", key)

    def test_발행본_자리에는_발행본만(self):
        key = pub.report_key(a_report())
        self.assertTrue(priv.check_public_write(key, a_report(),
                                                kind="report")["allowed"])
        for life in ("DRAFT", "GENERATING", "VALIDATING", "FAILED", "REVIEW",
                     "FACT_CHECK", "BLOCKED", None):
            out = priv.check_public_write(key, a_report(lifecycle=life, status=life),
                                          kind="report")
            self.assertFalse(out["allowed"], "%s 가 공개 자리에 허용된다" % life)


class 검증은_발행이_아니다(unittest.TestCase):
    """§3 — 도장을 올리기 전에 찍으면 두 가지가 동시에 깨진다."""

    def test_검증_파이프라인은_발행_도장을_찍지_않는다(self):
        out = gen.run_publication_pipeline(report_with_facts(), quality=None,
                                           published_at=NOW, mode="TEST")
        self.assertEqual(out["lifecycle"], "PUBLISHED")     # = 기계 검증 통과
        self.assertEqual(out["validatedAt"], NOW)
        self.assertIsNone(out.get("publishedAt"),
                          "올린 적 없는 문서에 발행 시각이 찍혀 있다")
        self.assertIsNone(out.get("immutableRef"))

    def test_도장이_있으면_올리기_단계로_갈_수_없다(self):
        """이것이 예전에 운영 발행을 통째로 막던 자리다. 회귀하면 여기서 잡힌다."""
        stamped = approved(a_report(publishedAt=NOW, immutableRef="report:2026-08"))
        g = gov.gate(stamped, want="PUBLISHING")
        self.assertFalse(g["ok"])
        self.assertEqual(g["from"], "PUBLISHED")
        self.assertEqual(g["code"], "FORBIDDEN_TRANSITION")

    def test_승인하면_올리기_단계가_실제로_열린다(self):
        out = gen.run_publication_pipeline(report_with_facts(), quality=None,
                                           published_at=NOW, mode="TEST")
        self.assertEqual(gov.gate(out, want="PUBLISHING")["code"], "NOT_APPROVED")
        g = gov.gate(approved(out), want="PUBLISHING")
        self.assertTrue(g["ok"], g["reason"])
        self.assertEqual((g["from"], g["to"]), ("APPROVED", "PUBLISHING"))


class 발행_사슬(unittest.TestCase):
    """§3 — BUILD → VALIDATE → 사람 승인 → PUBLISH → 되받기 → PUBLISHED."""

    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        self.ad = pub.LocalPublishAdapter(self.root)

    def test_승인_없이는_한_글자도_안_올라간다(self):
        out = pub.publish_pipeline(a_report(), self.ad, published_at=LATER)
        self.assertFalse(out["ok"])
        self.assertEqual(out["stage"], "APPROVE")
        self.assertFalse(os.path.exists(
            os.path.join(self.root, pub.report_key(a_report()))))

    def test_올린_뒤에야_발행_도장이_찍힌다(self):
        out = pub.publish_pipeline(approved(a_report()), self.ad, published_at=LATER)
        self.assertTrue(out["ok"], out.get("reason"))
        self.assertTrue(out["published"])
        self.assertEqual(out["report"]["publishedAt"], LATER)
        self.assertEqual(out["report"]["immutableRef"], "report:2026-08")

    def test_올라간_파일에도_도장이_있다(self):
        """도장을 메모리에만 찍고 파일에는 안 찍으면, 받은 사람은 모른다."""
        out = pub.publish_pipeline(approved(a_report()), self.ad, published_at=LATER)
        with open(os.path.join(self.root, out["key"]), encoding="utf-8") as fh:
            got = json.load(fh)
        self.assertEqual(got["publishedAt"], LATER)
        self.assertEqual(got["immutableRef"], "report:2026-08")
        self.assertEqual(got["lifecycle"], "PUBLISHED")

    def test_되받기가_항목별로_확인한다(self):
        out = pub.publish_pipeline(approved(a_report()), self.ad, published_at=LATER)
        v = self.ad.verify(out["report"])
        self.assertTrue(v["ok"])
        self.assertEqual(v["expectedHash"], v["actualHash"])

    def test_되받기가_틀리면_발행이라고_하지_않는다(self):
        """올린 것과 받은 것이 다르면 ok=False. 200 만 보고 넘어가지 않는다."""
        out = pub.publish_pipeline(approved(a_report()), self.ad, published_at=LATER)
        path = os.path.join(self.root, out["key"])
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
        doc["facts"] = [{"tampered": True}]
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(doc, fh)
        self.assertFalse(self.ad.verify(out["report"])["ok"])

    def test_발행본은_덮어쓰이지_않는다(self):
        first = pub.publish_pipeline(approved(a_report()), self.ad, published_at=LATER)
        again = self.ad.publish(a_report(), published_at="2026-09-09T00:00:00Z")
        self.assertTrue(first["published"])
        self.assertFalse(again["published"])
        self.assertTrue(again["alreadyPreserved"])


class 색인(unittest.TestCase):
    """§2 — 색인은 발행본만 가리키고, 있는 것을 지우지 않는다."""

    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        self.ad = pub.LocalPublishAdapter(self.root)

    def test_초안이_섞인_색인은_올리지_않는다(self):
        bad = {"schemaVersion": "earthus.report-engine.v1",
               "years": {"2026": [{"reportId": "report:2026-08", "lifecycle": "DRAFT"}]}}
        out = self.ad.publish_index(bad)
        # 로컬 어댑터는 누출 검사를 하지 않는다 — 검사는 함수에 있다.
        self.assertTrue(pub.index_leaks(bad))
        self.assertIn("report:2026-08(DRAFT)", pub.index_leaks(bad))
        self.assertTrue(out["ok"])          # 로컬은 그대로 쓴다(운영이 아니다)

    def test_발행본만_있는_색인은_통과한다(self):
        good = {"years": {"2026": [{"reportId": "r1", "lifecycle": "PUBLISHED"},
                                   {"reportId": "r0", "lifecycle": "ARCHIVED"}]}}
        self.assertEqual(pub.index_leaks(good), [])

    def test_색인을_새로_만들지_않고_더한다(self):
        """한 건만 들고 새로 만들면 먼저 발행된 것이 조용히 사라진다."""
        old = {"schemaVersion": "earthus.report-engine.v1",
               "years": {"2025": [{"reportId": "report:2025-12", "version": 1,
                                   "lifecycle": "PUBLISHED",
                                   "period": {"from": "2025-12-01"}}]}}
        merged = pub.merge_index(old, pub.stamp_published(a_report(), LATER))
        self.assertIn("2025", merged["years"])
        self.assertIn("2026", merged["years"])
        self.assertEqual(len(merged["years"]["2025"]), 1)

    def test_기간이_문자열이어도_연도를_읽는다(self):
        """`period` 는 dict 와 str 두 모양으로 쓰인다. 한쪽만 가정하면 발행이 죽는다."""
        self.assertEqual(pub.report_year({"period": {"from": "2026-08-01"}}), "2026")
        self.assertEqual(pub.report_year({"period": "2026-08"}), "2026")
        self.assertEqual(pub.report_year({}), "unknown")

    def test_발행하면_색인에_그_한_건이_생긴다(self):
        out = pub.publish_pipeline(approved(a_report()), self.ad, published_at=LATER)
        self.assertTrue(out["ok"])
        with open(os.path.join(self.root, pub.INDEX_KEY), encoding="utf-8") as fh:
            idx = json.load(fh)
        rows = idx["years"]["2026"]
        self.assertEqual([r["reportId"] for r in rows], ["report:2026-08"])
        self.assertEqual(rows[0]["immutableRef"], "report:2026-08")
        self.assertEqual(pub.index_leaks(idx), [])

    def test_되받기가_실패하면_색인을_건드리지_않는다(self):
        """못 읽는 것을 목록에 올리지 않는다."""
        class 되받기실패(pub.LocalPublishAdapter):
            def verify(self, report):
                return {"ok": False, "reason": "FETCH_FAILED"}

        ad = 되받기실패(self.root)
        out = pub.publish_pipeline(approved(a_report()), ad, published_at=LATER)
        self.assertFalse(out["ok"])
        self.assertNotIn("index", out)
        self.assertFalse(os.path.exists(os.path.join(self.root, pub.INDEX_KEY)))


class 승인_문의_구멍(unittest.TestCase):
    """§8 — 실측으로 재현한 우회 둘. 회귀하면 여기서 잡힌다."""

    def test_모르는_상태는_승인해도_APPROVED_가_아니다(self):
        """거부 목록으로 걸러서, 아는 이름이 아닌 상태가 전부 통과했다.

        `if life in ("DRAFT","GENERATING"): return "DRAFT"` 다음이 곧바로
        `return "APPROVED"` 였다. BLOCKED 도, 빈 값도, 오타도 승인만 있으면
        발행 단계로 갔다 — 바로 그 줄 위에 정반대가 적혀 있었는데도.
        """
        for life in ("BLOCKED", "PENDING", "RUNNING", "banana", "",
                     "GENERATING", "DRAFT", "REJECTED", "FAILED"):
            a = gov.approve({"reportId": "R1", "title": "t", "lifecycle": life},
                            approved_by="dalur", approved_at=NOW,
                            approval_method="UI_CLICK")
            g = gov.gate(a, want="PUBLISHING")
            self.assertFalse(g["ok"], "lifecycle=%r 이 승인만으로 발행된다" % life)

    def test_lifecycle_이_아예_없어도_막힌다(self):
        a = gov.approve({"reportId": "R1", "title": "t"},
                        approved_by="dalur", approved_at=NOW,
                        approval_method="UI_CLICK")
        self.assertFalse(gov.gate(a, want="PUBLISHING")["ok"])

    def test_검증을_지난_상태는_승인하면_열린다(self):
        """막기만 하는 문은 문이 아니다. 정상 경로가 열리는지도 본다."""
        for life in ("PUBLISHED", "VALIDATING", "REVIEW", "FACT_CHECK", "SCHEDULED"):
            a = gov.approve({"reportId": "R1", "title": "t", "lifecycle": life},
                            approved_by="dalur", approved_at=NOW,
                            approval_method="UI_CLICK")
            g = gov.gate(a, want="PUBLISHING")
            self.assertTrue(g["ok"], "%s 가 승인 뒤에도 막힌다: %s" % (life, g["reason"]))

    def test_승인_뒤_status_바꿔치기가_막힌다(self):
        """상태를 정하는 칸이 서명 밖이었다.

        `life = doc.get("lifecycle") or doc.get("status")` 인데 status 는
        UNSIGNED_FIELDS 다. lifecycle 없는 문서는 상태 결정 칸이 서명되지 않아
        승인 뒤에 바꿔쳐도 승인이 그대로 유효했다.
        """
        doc = {"contentId": "C1", "title": "t", "body": "b", "status": "DRAFT"}
        a = gov.approve(dict(doc), approved_by="dalur", approved_at=NOW,
                        approval_method="UI_CLICK")
        self.assertEqual(gov.gate(a, want="PUBLISHING")["code"], "FORBIDDEN_TRANSITION")
        moved = dict(a)
        moved["status"] = "REVIEW"
        g = gov.gate(moved, want="PUBLISHING")
        self.assertFalse(g["ok"])
        self.assertEqual(g["code"], "APPROVAL_STATE_MOVED")

    def test_승인_기록에_바탕_상태가_남는다(self):
        a = gov.approve({"reportId": "R1", "title": "t", "lifecycle": "PUBLISHED"},
                        approved_by="dalur", approved_at=NOW,
                        approval_method="UI_CLICK")
        self.assertEqual(a["approval"]["approvedFrom"], "READY_FOR_REVIEW")

    def test_바탕_상태_기록이_없으면_통과시키지_않는다(self):
        """없는 것을 괜찮다고 읽으면 그 자체가 우회로가 된다."""
        a = gov.approve({"reportId": "R1", "title": "t", "lifecycle": "PUBLISHED"},
                        approved_by="dalur", approved_at=NOW,
                        approval_method="UI_CLICK")
        old = dict(a)
        old["approval"] = {k: v for k, v in a["approval"].items() if k != "approvedFrom"}
        g = gov.gate(old, want="PUBLISHING")
        self.assertFalse(g["ok"])
        self.assertEqual(g["code"], "APPROVAL_STATE_MOVED")


class 승인자_한국어(unittest.TestCase):
    """§8 — 시스템 계정 목록이 **영문 전용**이라 한글로 우회됐다.

    `_tokens` 가 한글을 구분자로 지워 버려서 `스크립트` 로 승인하면 낱말이 하나도
    안 남고 사람으로 통과했다. 한국어를 쓰는 저장소에서 이건 이론이 아니다.
    """

    def test_한국어_시스템_계정이_막힌다(self):
        for actor in ("스크립트", "자동화", "자동배포", "봇", "로봇", "시스템1",
                      "크론잡", "람다", "에이전트", "파이프라인", "익명", "무명"):
            bad, why = gov.is_system_actor(actor)
            self.assertTrue(bad, "%s 가 사람으로 통과한다" % actor)
            self.assertIn("시스템 계정", why)

    def test_사람_이름은_통과한다(self):
        """잘못 잡는 검사기는 곧 무시당한다. 오탐도 같이 본다."""
        for actor in ("dalur", "김철수", "이영희", "박지훈", "정민수",
                      "Dalur Kim", "hong.gildong"):
            bad, why = gov.is_system_actor(actor)
            self.assertFalse(bad, "%s 를 시스템으로 잘못 잡는다: %s" % (actor, why))

    def test_한국어_계정으로는_승인할_수_없다(self):
        with self.assertRaises(gov.GovernanceError):
            gov.approve(a_report(), approved_by="스크립트",
                        approved_at=NOW, approval_method="CLI_CONFIRM")


if __name__ == "__main__":                              # pragma: no cover
    unittest.main(verbosity=2)
