# -*- coding: utf-8 -*-
"""PHASE 2 STEP 2.9 · 2.10 계약 시험.

이 시험이 지키는 것은 하나다: **없는 것을 있다고 말하지 못하게 한다.**
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import report_contract as rc  # noqa: E402


class ReportEnvelope(unittest.TestCase):
    def test_스냅샷_없는_리포트는_만들_수_없다(self):
        # 지침서 §22 — 발행본은 가변 실시간 자료에만 기대면 안 된다.
        with self.assertRaises(ValueError):
            rc.make_report(report_id="r1", report_type="RETROSPECTIVE_MONTHLY",
                           period={"from": "2026-08-01", "to": "2026-08-31"},
                           generated_at="2026-09-01T00:00:00Z",
                           algorithm_version="1.0.0", data_snapshot_id=None)

    def test_알_수_없는_종류와_상태를_거부한다(self):
        base = dict(report_id="r1", period={"from": "2026-08-01", "to": "2026-08-31"},
                    generated_at="2026-09-01T00:00:00Z", algorithm_version="1.0.0",
                    data_snapshot_id="snap:2026-08")
        with self.assertRaises(ValueError):
            rc.make_report(report_type="WEEKLY", **base)
        with self.assertRaises(ValueError):
            rc.make_report(report_type="RETROSPECTIVE_MONTHLY", status="LIVE", **base)

    def test_리포트_id_와_신호_id_를_같은_필드에_담지_않는다(self):
        r = rc.make_report(report_id="cyclone:1001318", report_type="RETROSPECTIVE_MONTHLY",
                           period={"from": "2026-08-01", "to": "2026-08-31"},
                           generated_at="2026-09-01T00:00:00Z", algorithm_version="1.0.0",
                           data_snapshot_id="snap:2026-08",
                           phenomenon_ids=["hazards.typhoon"],
                           facts=[{"signalId": "kma:asos:abc:def"}])
        self.assertEqual(r["reportId"], "cyclone:1001318")
        self.assertEqual(r["facts"][0]["signalId"], "kma:asos:abc:def")
        self.assertNotIn("signalId", r)          # 봉투 최상위에 신호 id 를 두지 않는다
        self.assertEqual(r["phenomenonIds"], ["hazards.typhoon"])

    def test_여섯_발행물과_검증_리포트를_모두_담는다(self):
        self.assertEqual(len(rc.REPORT_TYPES), 7)
        for t in ("RETROSPECTIVE_MONTHLY", "OUTLOOK_NEXT_YEAR", "FORECAST_VERIFICATION"):
            self.assertIn(t, rc.REPORT_TYPES)


class PredictionSnapshot(unittest.TestCase):
    def test_값도_분포도_없으면_거부한다(self):
        with self.assertRaises(ValueError):
            rc.make_prediction_snapshot(prediction_id="p1", phenomenon_id="weather.temperature",
                                        forecast_origin_time="2026-09-01T00:00:00Z",
                                        target_period={"from": "2026-09-02", "to": "2026-09-02"})

    def test_발행시각과_유효기간을_함께_얼린다(self):
        p = rc.make_prediction_snapshot(
            prediction_id="p1", phenomenon_id="weather.temperature",
            forecast_origin_time="2026-09-01T00:00:00Z",
            target_period={"from": "2026-09-02T00:00:00Z", "to": "2026-09-02T23:59:59Z"},
            forecast_value=27.4, unit="degC", model_id="gfs", model_version="16")
        self.assertEqual(p["recordType"], "PREDICTION")
        self.assertEqual(p["forecastOriginTime"], "2026-09-01T00:00:00Z")
        self.assertEqual(p["targetPeriod"]["from"], "2026-09-02T00:00:00Z")


class Verification(unittest.TestCase):
    def test_지표는_예보_종류를_따른다(self):
        # 태풍 트랙 지표를 기온에 쓰면 거부한다.
        with self.assertRaises(ValueError):
            rc.make_verification(prediction_id="p1", phenomenon_id="weather.temperature",
                                 metric_set="continuous", observation_value=26.9,
                                 scores={"track_error_km": 40})

    def test_실측이_없으면_검증이_아니다(self):
        with self.assertRaises(ValueError):
            rc.make_verification(prediction_id="p1", phenomenon_id="weather.temperature",
                                 metric_set="continuous", observation_value=None)

    def test_검증불가는_점수가_아니라_사유다(self):
        # PHASE 0 실측: 강수는 관측 이력이 없어 원리적으로 검증할 수 없다.
        v = rc.make_verification(prediction_id="p9", phenomenon_id="weather.precipitation",
                                 metric_set=None, not_verifiable="NO_OBSERVATION_ARCHIVE")
        self.assertEqual(v["status"], rc.NOT_VERIFIABLE)
        self.assertNotIn("scores", v)            # 숫자를 지어내지 않는다
        self.assertIn("수집기", v["reasonText"])

    def test_모르는_검증불가_사유는_거부한다(self):
        with self.assertRaises(ValueError):
            rc.make_verification(prediction_id="p9", phenomenon_id="x",
                                 metric_set=None, not_verifiable="그냥")

    def test_리드타임은_평균내지_않고_행으로_남긴다(self):
        rows = [rc.make_verification(prediction_id="p1", phenomenon_id="weather.temperature",
                                     metric_set="continuous", observation_value=26.9,
                                     lead_hours=h, scores={"mae": 0.5 + h / 100})
                for h in (24, 48)]
        self.assertEqual([r["leadHours"] for r in rows], [24, 48])
        self.assertNotEqual(rows[0]["scores"]["mae"], rows[1]["scores"]["mae"])

    def test_진실값_출처를_적는다(self):
        v = rc.make_verification(prediction_id="p1", phenomenon_id="hazards.typhoon",
                                 metric_set="track", observation_value={"lat": 30, "lon": 130},
                                 observation_source="IBTrACS best track",
                                 scores={"track_error_km": 42.0})
        self.assertEqual(v["observationSource"], "IBTrACS best track")


class PublishGates(unittest.TestCase):
    def test_게이트가_하나라도_열리지_않으면_발행하지_않는다(self):
        ok, blocked = rc.can_publish({}, {g: True for g in rc.PUBLISH_GATES})
        self.assertTrue(ok)
        self.assertEqual(blocked, [])
        partial = {g: True for g in rc.PUBLISH_GATES}
        partial["every_claim_maps_to_fact"] = False
        ok, blocked = rc.can_publish({}, partial)
        self.assertFalse(ok)
        self.assertEqual(blocked, ["every_claim_maps_to_fact"])

    def test_오늘_막혀_있는_게이트를_숨기지_않는다(self):
        # PHASE 0: snapshotId·팩트세트가 없어 이 둘은 현재 통과 불가다.
        ok, blocked = rc.can_publish({}, {})
        self.assertFalse(ok)
        self.assertIn("data_snapshot_exists", blocked)
        self.assertIn("fact_schema_valid", blocked)


if __name__ == "__main__":
    unittest.main()
