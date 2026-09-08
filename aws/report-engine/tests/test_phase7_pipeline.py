# -*- coding: utf-8 -*-
"""PHASE 7 — QC · 서술검증 · 발행 파이프라인 · 중복 · 시험/운영 분리 (§26).

§30 의 규칙을 지킨다: 개수·순서·객체 전체 모양을 못박지 않고 불변식만 본다.
"""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.dirname(HERE)
sys.path.insert(0, ENGINE)
sys.path.insert(0, os.path.join(os.path.dirname(ENGINE), "_shared"))

import generator as gen                          # noqa: E402
import quality as qc                             # noqa: E402
import narrative as nr                           # noqa: E402
import report_contract as rc                     # noqa: E402
from adapters import kma_verify_adapter as kma   # noqa: E402

NOW = "2026-09-08T00:00:00Z"


def good_daily(days=10):
    return {
        "generated": NOW, "leadBasis": "observation-time", "source": "test",
        "collectingSince": "2026-08-01",
        "days": {f"2026-08-{d:02d}": {
            "gfs_seamless|temperature_2m|24h": {"me": -0.2, "mae": 1.2, "rmse": 1.6, "n": 900},
            "ecmwf_ifs025|temperature_2m|24h": {"me": -0.1, "mae": 1.1, "rmse": 1.5, "n": 900},
        } for d in range(1, days + 1)},
    }


def snap(sid="snapshot:2026-08:verify"):
    return rc.make_data_snapshot(snapshot_id=sid, created_at=NOW,
                                 datasets=[{"ref": kma.SOURCE_REF, "state": "AVAILABLE"}])


def report_with_facts(period="2026-08", daily=None):
    daily = daily or good_daily()
    facts = kma.build_facts(daily, period)
    return gen.generate_retrospective(period, snapshot=snap(), facts=facts,
                                      generated_at=NOW, algorithm_version="test/1")


# ── §4 QC ────────────────────────────────────────────────────────────────────
class QualityControl(unittest.TestCase):
    def test_정상_자료는_통과한다(self):
        from datetime import datetime, timezone
        now = datetime(2026, 9, 8, tzinfo=timezone.utc)
        q = qc.check_verify_daily(good_daily(), period="2026-08", now=now)
        self.assertEqual(q["status"], qc.PASS, q["failures"] + q["warnings"])

    def test_불가능한_값을_잡는다(self):
        d = good_daily()
        d["days"]["2026-08-01"]["gfs_seamless|temperature_2m|24h"]["mae"] = -5.0  # 음수 절대오차
        q = qc.check_verify_daily(d, period="2026-08")
        self.assertEqual(q["status"], qc.FAIL)
        self.assertTrue(any(c["check"] == "range" for c in q["failures"]))

    def test_리드_기준이_틀리면_막는다(self):
        d = good_daily()
        d["leadBasis"] = "lambda-time"      # 2026-08 사고의 원인이던 기준
        q = qc.check_verify_daily(d, period="2026-08")
        self.assertEqual(q["status"], qc.FAIL)

    def test_결측은_경고이지_실패가_아니다(self):
        d = good_daily()
        del d["days"]["2026-08-01"]["gfs_seamless|temperature_2m|24h"]["rmse"]
        q = qc.check_verify_daily(d, period="2026-08")
        self.assertNotEqual(q["status"], qc.FAIL)
        self.assertTrue(any(c["check"] == "missing" for c in q["warnings"]))

    def test_기간에_자료가_없으면_막는다(self):
        q = qc.check_verify_daily(good_daily(), period="2026-01")
        self.assertEqual(q["status"], qc.FAIL)

    def test_FAIL_은_발행을_막는다(self):
        self.assertTrue(qc.blocks_publication({"status": qc.FAIL}))
        self.assertFalse(qc.blocks_publication({"status": qc.WARN}))


# ── §9 서술 검증 ─────────────────────────────────────────────────────────────
class NarrativeValidation(unittest.TestCase):
    def setUp(self):
        self.facts = kma.build_facts(good_daily(), "2026-08")

    def test_팩트에_없는_숫자를_잡는다(self):
        ok, probs = nr.validate_narrative("오차는 9.87℃ 였습니다.", self.facts)
        self.assertFalse(ok)
        self.assertTrue(any("9.87" in p for p in probs))

    def test_근거_없는_인과를_잡는다(self):
        ok, probs = nr.validate_narrative("해수온 때문에 오차가 커졌습니다.", self.facts)
        self.assertFalse(ok)
        self.assertTrue(any("인과" in p for p in probs))

    def test_값의_정체를_잘못_주장하면_잡는다(self):
        ok, probs = nr.validate_narrative("관측값은 1.2℃ 였습니다.", self.facts,
                                          truth_types={"EARTHUS_ANALYSIS"})
        self.assertFalse(ok)

    def test_기간과_리드_표기는_숫자로_세지_않는다(self):
        # '2026-08' 과 '24시간' 은 값이 아니라 이름·조건이다.
        ok, _ = nr.validate_narrative("2026-08 기간 24시간 예보", self.facts)
        self.assertTrue(ok)

    def test_생성한_서술은_스스로_검증을_통과한다(self):
        card = gen.build_forecast_scorecard("2026-08", kma.build_verifications(good_daily(), "2026-08"))
        narr = nr.build_scorecard_narrative(card)
        ok, probs = nr.validate_report_narrative({"facts": self.facts, "narrative": narr})
        self.assertTrue(ok, probs)

    def test_모델_비교는_같은_리드끼리만_한다(self):
        card = gen.build_forecast_scorecard("2026-08", kma.build_verifications(good_daily(), "2026-08"))
        narr = nr.build_scorecard_narrative(card)
        for ln in narr["lines"]:
            self.assertIsNotNone(ln["leadHours"], "리드 없는 비교 문장이 있다")


# ── §21 발행 파이프라인 ──────────────────────────────────────────────────────
class Pipeline(unittest.TestCase):
    def test_정상이면_발행되고_불변참조를_갖는다(self):
        out = gen.run_publication_pipeline(report_with_facts(), quality={"status": qc.PASS},
                                           published_at=NOW)
        self.assertEqual(out["lifecycle"], "PUBLISHED")
        self.assertEqual(out["immutableRef"], out["reportId"])

    def test_QC_실패는_발행을_막는다(self):
        out = gen.run_publication_pipeline(
            report_with_facts(),
            quality={"status": qc.FAIL, "failures": [{"check": "range"}]},
            published_at=NOW)
        self.assertEqual(out["lifecycle"], "FAILED")
        self.assertNotIn("publishedAt", out)

    def test_QC_경고는_막지_않되_한계를_남긴다(self):
        out = gen.run_publication_pipeline(
            report_with_facts(),
            quality={"status": qc.WARN, "warnings": [{"check": "freshness", "detail": "5일 지났다"}]},
            published_at=NOW)
        self.assertEqual(out["lifecycle"], "PUBLISHED")
        self.assertTrue(out["limitations"])

    def test_서술이_팩트와_어긋나면_발행을_막는다(self):
        rep = report_with_facts()
        rep["narrative"] = {"summary": "오차는 42.7℃ 였습니다.", "lines": []}
        out = gen.run_publication_pipeline(rep, quality={"status": qc.PASS}, published_at=NOW)
        self.assertEqual(out["lifecycle"], "FAILED")
        self.assertTrue(any("서술" in p for p in out["validationProblems"]))


# ── §22 중복 · §23 시험/운영 분리 ────────────────────────────────────────────
class DuplicateAndIsolation(unittest.TestCase):
    def test_같은_종류_기간_판이_이미_발행됐으면_다시_만들지_않는다(self):
        first = gen.run_publication_pipeline(report_with_facts(), quality={"status": qc.PASS},
                                             published_at=NOW)
        second = gen.run_publication_pipeline(report_with_facts(), quality={"status": qc.PASS},
                                              published_at=NOW, published_index=[first])
        self.assertEqual(second["lifecycle"], "FAILED")
        self.assertTrue(any("이미 발행" in p for p in second["validationProblems"]))

    def test_판을_올리면_새로_만들_수_있다(self):
        first = gen.run_publication_pipeline(report_with_facts(), quality={"status": qc.PASS},
                                             published_at=NOW)
        rep2 = report_with_facts()
        rep2["version"] = 2
        out = gen.run_publication_pipeline(rep2, quality={"status": qc.PASS},
                                           published_at=NOW, published_index=[first])
        self.assertEqual(out["lifecycle"], "PUBLISHED")

    def test_시험_자료가_운영_리포트로_새면_막는다(self):
        rep = report_with_facts()
        rep["dataSnapshotId"] = "snapshot:fixture:2026-08"
        out = gen.run_publication_pipeline(rep, quality={"status": qc.PASS},
                                           published_at=NOW, mode="PRODUCTION")
        self.assertEqual(out["lifecycle"], "FAILED")
        self.assertTrue(any("시험 자료" in p for p in out["validationProblems"]))

    def test_시험_모드에서는_시험_자료가_허용된다(self):
        rep = report_with_facts()
        rep["dataSnapshotId"] = "snapshot:fixture:2026-08"
        out = gen.run_publication_pipeline(rep, quality={"status": qc.PASS},
                                           published_at=NOW, mode="TEST")
        self.assertEqual(out["lifecycle"], "PUBLISHED")
        self.assertEqual(out["mode"], "TEST")


# ── §25 실제 예보 검토 ───────────────────────────────────────────────────────
class ForecastReview(unittest.TestCase):
    def test_이전_기간_자료가_없으면_점수를_만들지_않는다(self):
        d = good_daily()          # 2026-08 만 있다
        self.assertEqual(kma.build_verifications(d, "2026-07"), [])
        self.assertFalse(kma.coverage(d, "2026-07")["ok"])

    def test_스코어카드_행에는_모델과_표본이_함께_있다(self):
        card = gen.build_forecast_scorecard("2026-08", kma.build_verifications(good_daily(), "2026-08"))
        for r in card["rows"]:
            if not r["evaluated"]:
                continue
            self.assertIsNotNone(r["modelId"], "모델을 알 수 없는 점수 행이 있다 — 두 모델이 섞인다")
            self.assertIsNotNone(r["sampleCount"], "표본 없는 점수 행이 있다")


if __name__ == "__main__":
    unittest.main()
