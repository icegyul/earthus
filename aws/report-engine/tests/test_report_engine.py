# -*- coding: utf-8 -*-
"""PHASE 6 리포트 엔진 시험 (§31).

§30 의 교훈을 따른다 — 개수·순서·객체 전체 모양을 못박지 않는다.
'있어야 할 짝'과 '있으면 안 되는 것'만 확인한다.
(PHASE 4·5 에서 CAP_TAB 모양을 통째로 고정한 단언이 능력이 늘자 깨졌다.)
"""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.dirname(HERE)
sys.path.insert(0, ENGINE)
sys.path.insert(0, os.path.join(os.path.dirname(ENGINE), "_shared"))

import generator as gen                          # noqa: E402
import report_period as rp                       # noqa: E402
import report_contract as rc                     # noqa: E402
from adapters import kma_verify_adapter as kma   # noqa: E402

NOW = "2026-10-01T00:00:00Z"


def daily(days):
    return {"generated": NOW, "leadBasis": "observation-time",
            "collectingSince": min(days) if days else None, "days": days}


def combo(mae=1.0, rmse=1.5, me=0.1, n=80):
    return {"me": me, "mae": mae, "rmse": rmse, "n": n}


def month_days(ym, count=28, **kw):
    return {f"{ym}-{d:02d}": {"gfs_seamless|temperature_2m|24h": combo(**kw),
                              "gfs_seamless|temperature_2m|48h": combo(mae=1.8, rmse=2.4, n=70)}
            for d in range(1, count + 1)}


def snap():
    return rc.make_data_snapshot(snapshot_id="snap:test", created_at=NOW,
                                 datasets=[{"ref": kma.SOURCE_REF, "state": "AVAILABLE"}])


# ── §32 기간 ─────────────────────────────────────────────────────────────────
class Period(unittest.TestCase):
    def test_월_분기_연_경계(self):
        self.assertEqual(rp.parse("2026-09")[1].isoformat(), "2026-09-01")
        self.assertEqual(rp.parse("2026-09")[2].isoformat(), "2026-09-30")
        self.assertEqual(rp.parse("2026-Q3")[1].isoformat(), "2026-07-01")
        self.assertEqual(rp.parse("2026-Q3")[2].isoformat(), "2026-09-30")
        self.assertEqual(rp.parse("2026")[2].isoformat(), "2026-12-31")
        self.assertEqual(rp.parse("2024-02")[2].isoformat(), "2024-02-29")  # 윤년

    def test_다음_이전_기간이_연말을_넘는다(self):
        self.assertEqual(rp.next_period("2026-12"), "2027-01")
        self.assertEqual(rp.previous_period("2026-01"), "2025-12")
        self.assertEqual(rp.next_period("2026-Q4"), "2027-Q1")
        self.assertEqual(rp.previous_period("2026-Q1"), "2025-Q4")
        self.assertEqual(rp.next_period("2026"), "2027")

    def test_형식이_아니면_조용히_오늘로_대체하지_않는다(self):
        for bad in ("2026-13", "2026-Q5", "26-09", "", None, "next month"):
            with self.assertRaises((rp.PeriodError, TypeError)):
                rp.parse(bad)


# ── §4 스냅샷 ────────────────────────────────────────────────────────────────
class Snapshot(unittest.TestCase):
    def test_자료가_없는_스냅샷은_만들_수_없다(self):
        with self.assertRaises(ValueError):
            rc.make_data_snapshot(snapshot_id="s", created_at=NOW, datasets=[])

    def test_관측시각과_받은시각을_따로_들고_있다(self):
        s = rc.make_data_snapshot(snapshot_id="s", created_at=NOW, datasets=[
            {"ref": "a", "observedAt": "2026-09-30T00:00:00Z", "retrievedAt": NOW}])
        d = s["datasets"][0]
        self.assertNotEqual(d["observedAt"], d["retrievedAt"])

    def test_스냅샷_없이는_리포트를_만들_수_없다(self):
        with self.assertRaises(ValueError):
            rc.make_report(report_id="r", report_type="RETROSPECTIVE_MONTHLY",
                           period={"from": "2026-09-01", "to": "2026-09-30"},
                           generated_at=NOW, algorithm_version="1", data_snapshot_id=None)


# ── §14 예보 스냅샷 불변 ─────────────────────────────────────────────────────
class ForecastSnapshot(unittest.TestCase):
    def _pred(self):
        return rc.make_prediction_snapshot(
            prediction_id="p1", phenomenon_id="weather.temperature",
            forecast_origin_time="2026-09-01T00:00:00Z",
            target_period={"from": "2026-09-02", "to": "2026-09-02"},
            forecast_value=27.0, unit="degC")

    def test_얼린_예보가_바뀌면_잡는다(self):
        locked = rc.lock_prediction(self._pred())
        self.assertEqual(locked["status"], "LOCKED")
        rc.assert_snapshot_unchanged(locked, dict(locked))
        tampered = dict(locked, forecastValue=26.0)   # 사후에 맞은 것처럼 고친 경우
        with self.assertRaises(ValueError):
            rc.assert_snapshot_unchanged(locked, tampered)

    def test_값도_분포도_없는_예보는_거부한다(self):
        with self.assertRaises(ValueError):
            rc.make_prediction_snapshot(prediction_id="p", phenomenon_id="x",
                                        forecast_origin_time=NOW,
                                        target_period={"from": "a", "to": "b"})


# ── §15·§17 검증과 무자료 ────────────────────────────────────────────────────
class Verification(unittest.TestCase):
    def test_예보_없이_검증을_만들지_않는다(self):
        with self.assertRaises(gen.ReportError):
            gen.verify_forecast(None, {"value": 1}, evaluator=lambda p, o: {})

    def test_실측이_없으면_점수가_아니라_사유다(self):
        pred = rc.make_prediction_snapshot(
            prediction_id="p1", phenomenon_id="weather.temperature",
            forecast_origin_time=NOW, target_period={"from": "a", "to": "b"},
            forecast_value=1.0)
        v = gen.verify_forecast(pred, None, evaluator=lambda p, o: {"mae": 0.0})
        self.assertEqual(v["status"], rc.NOT_VERIFIABLE)
        self.assertNotIn("scores", v)

    def test_원리적으로_검증_불가한_영역은_사유를_그대로_말한다(self):
        for phen, reason in gen.UNVERIFIABLE_DOMAINS.items():
            pred = rc.make_prediction_snapshot(
                prediction_id="p", phenomenon_id=phen, forecast_origin_time=NOW,
                target_period={"from": "a", "to": "b"}, forecast_value=1.0)
            v = gen.verify_forecast(pred, {"value": 1.0}, evaluator=lambda p, o: {"mae": 0})
            self.assertEqual(v["status"], rc.NOT_VERIFIABLE)
            self.assertEqual(v["reason"], reason)

    def test_스코어카드는_하나의_정확도_퍼센트를_만들지_않는다(self):
        card = gen.build_forecast_scorecard("2026-09", [])
        self.assertNotIn("accuracy", card)
        self.assertNotIn("score", card)
        for bad in ("overallScore", "accuracyPercent", "successRate"):
            self.assertNotIn(bad, card)

    def test_평가_불가_항목이_스코어카드에서_사라지지_않는다(self):
        evs = [rc.make_verification(prediction_id="p", phenomenon_id="weather.precipitation",
                                    metric_set=None, not_verifiable="NO_OBSERVATION_ARCHIVE")]
        card = gen.build_forecast_scorecard("2026-09", evs)
        self.assertEqual(card["notEvaluatedCount"], 1)
        self.assertFalse(card["rows"][0]["evaluated"])
        self.assertTrue(card["rows"][0]["reasonText"])


# ── §29 첫 end-to-end 영역 ───────────────────────────────────────────────────
class TemperatureAdapter(unittest.TestCase):
    def test_리드타임을_합치지_않는다(self):
        agg = kma.aggregate(daily(month_days("2026-09")), "2026-09")
        leads = {k[2] for k in agg}
        self.assertEqual(leads, {24, 48})
        a24 = agg[("gfs_seamless", "temperature_2m", 24)]
        a48 = agg[("gfs_seamless", "temperature_2m", 48)]
        self.assertNotEqual(a24["mae"], a48["mae"], "24h 와 48h 를 합쳐 버렸다")

    def test_표본_수로_가중한다(self):
        d = {"2026-09-01": {"gfs_seamless|temperature_2m|24h": combo(mae=1.0, n=90)},
             "2026-09-02": {"gfs_seamless|temperature_2m|24h": combo(mae=3.0, n=10)}}
        agg = kma.aggregate(daily(d), "2026-09")
        mae = agg[("gfs_seamless", "temperature_2m", 24)]["mae"]
        self.assertAlmostEqual(mae, (1.0 * 90 + 3.0 * 10) / 100, places=3)
        self.assertNotAlmostEqual(mae, 2.0, places=3)   # 단순 평균이면 2.0 이다

    def test_기간_밖의_날은_섞지_않는다(self):
        d = dict(month_days("2026-09", 5))
        d.update(month_days("2026-08", 5))
        agg = kma.aggregate(daily(d), "2026-09")
        self.assertEqual(agg[("gfs_seamless", "temperature_2m", 24)]["days"], 5)

    def test_자료가_없으면_팩트도_검증도_만들지_않는다(self):
        self.assertEqual(kma.build_facts(daily({}), "2026-09"), [])
        self.assertEqual(kma.build_verifications(daily({}), "2026-09"), [])
        cov = kma.coverage(daily({}), "2026-09")
        self.assertFalse(cov["ok"])
        self.assertEqual(cov["reason"], "NO_OBSERVATION_ARCHIVE")

    def test_수집_시작보다_앞선_기간은_평가하지_않는다(self):
        d = daily(month_days("2026-09"))
        d["collectingSince"] = "2026-09-01"
        self.assertFalse(kma.coverage(d, "2026-07")["ok"])

    def test_팩트는_현상과_표본수를_들고_있다(self):
        facts = kma.build_facts(daily(month_days("2026-09")), "2026-09")
        self.assertTrue(facts)
        for f in facts:
            self.assertTrue(f["phenomenonId"])          # §20 리포트 → 현상
            self.assertIsNotNone(f["sampleCount"])      # §18 점수에는 표본 수를 같이
            self.assertTrue(f["evidenceRefs"])          # 근거 없는 팩트를 만들지 않는다


# ── §7·§25 리포트 조립 ───────────────────────────────────────────────────────
class ReportAssembly(unittest.TestCase):
    def _report(self, period, evals=None):
        facts = kma.build_facts(daily(month_days(period[:7])), period) if len(period) == 7 else []
        return gen.generate_retrospective(period, snapshot=snap(), facts=facts,
                                          evaluations=evals or [], generated_at=NOW,
                                          algorithm_version="test/1")

    def test_기간_종류가_리포트_종류를_정한다(self):
        self.assertEqual(self._report("2026-09")["type"], "RETROSPECTIVE_MONTHLY")
        self.assertEqual(self._report("2026-Q3")["type"], "RETROSPECTIVE_QUARTERLY")
        self.assertEqual(self._report("2026")["type"], "RETROSPECTIVE_ANNUAL")

    def test_검증이_없으면_점수를_만들지_않고_없다고_적는다(self):
        rep = self._report("2026-09", evals=[])
        review = [s for s in rep["sections"] if s["id"] == "forecast_review"][0]
        self.assertTrue(review["empty"])
        self.assertIn("축적", review["reasonKo"])

    def test_전망은_지평_등급을_구분한다(self):
        for period, want in (("2026-10", "SHORT"), ("2026-Q4", "SEASONAL"), ("2027", "LONG_RANGE")):
            o = gen.generate_outlook(period, snapshot=snap(), facts=[], generated_at=NOW,
                                     algorithm_version="test/1")
            self.assertEqual(o["horizonClass"], want)
            self.assertIn(o["type"], rc.REPORT_TYPES)


# ── §33 발행 안전 ────────────────────────────────────────────────────────────
class Publication(unittest.TestCase):
    def _good(self):
        facts = kma.build_facts(daily(month_days("2026-09")), "2026-09")
        return gen.generate_retrospective("2026-09", snapshot=snap(), facts=facts,
                                          evaluations=[], generated_at=NOW,
                                          algorithm_version="test/1")

    def test_검증을_통과해야_발행된다(self):
        rep = gen.publish(self._good(), published_at=NOW)
        self.assertEqual(rep["lifecycle"], "PUBLISHED")
        self.assertTrue(rep["publishedAt"])

    def test_검증에_실패하면_발행되지_않는다(self):
        bad = self._good()
        bad["facts"] = [dict(bad["facts"][0], phenomenonId=None)]
        out = gen.publish(bad, published_at=NOW)
        self.assertEqual(out["lifecycle"], "FAILED")
        self.assertTrue(out["validationProblems"])
        self.assertNotEqual(out.get("status"), "PUBLISHED")

    def test_예보_스냅샷_없는_검증이_섞이면_발행을_막는다(self):
        rep = self._good()
        rep["evaluations"] = [{"phenomenonId": "weather.temperature", "scores": {"mae": 1}}]
        ok, problems = gen.validate_report(rep)
        self.assertFalse(ok)
        self.assertTrue(any("예보 스냅샷" in p for p in problems))


# ── §27 아카이브 ─────────────────────────────────────────────────────────────
class Archive(unittest.TestCase):
    def test_발행된_것만_불변_참조를_갖는다(self):
        facts = kma.build_facts(daily(month_days("2026-09")), "2026-09")
        draft = gen.generate_retrospective("2026-09", snapshot=snap(), facts=facts,
                                           generated_at=NOW, algorithm_version="t")
        pub = gen.publish(gen.generate_retrospective("2026-08", snapshot=snap(), facts=facts,
                                                     generated_at=NOW, algorithm_version="t"),
                          published_at=NOW)
        idx = gen.build_report_archive_index([draft, pub])
        rows = idx["years"]["2026"]
        by_id = {r["reportId"]: r for r in rows}
        self.assertIsNone(by_id["report:2026-09"]["immutableRef"])
        self.assertEqual(by_id["report:2026-08"]["immutableRef"], "report:2026-08")


if __name__ == "__main__":
    unittest.main()
