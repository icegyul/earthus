# -*- coding: utf-8 -*-
"""콘텐츠 id 충돌 — 회차가 달라도 같은 키를 쓰지 않는다.

실측한 결함 (2026-09-13, 배포 artifact 안에서 dryRun):
    CNT-2026-000001   9/13 → "M6.8 The 2026 Kumamoto Region, Japan Earthquake"
    CNT-2026-000001   10/1 → "EARTHUS 예보 성적표 · 2026-09"
  두 실행이 **같은 S3 키**(BODY_PREFIX + contentId + ".json")에 서로 다른 사건을 썼다.
  원인은 `generate_all` 이 `seq_start` 를 넘기지 않아 순번이 매 실행 1 부터
  다시 시작한 것뿐이다. 핸들러는 기존 색인을 읽지 않으므로 이어 줄 곳도 없었다.

아래 픽스처는 그날 실제로 나온 후보의 **식별 필드만** 옮긴 것이다.
네트워크를 쓰지 않는다.
"""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
FN = os.path.dirname(HERE)
AWS = os.path.dirname(FN)
sys.path.insert(0, FN)
sys.path.insert(0, os.path.join(AWS, "_shared"))

import generator as gen                         # noqa: E402
import handler                                  # noqa: E402

# 2026-09-13 실측 후보 (lab-report · eventId 가 정체다)
QUAKE_KUMAMOTO = {
    "sourceKind": "lab-report", "reportKind": "earthquake",
    "eventId": "earthquake:us6000tgb9",
    "title": "M6.8 The 2026 Kumamoto Region, Japan Earthquake",
    # ⚠️ 이 창은 **날마다 움직인다** — 식별에 쓰면 같은 지진이 날마다 새 id 를 받는다
    "observationPeriod": {"from": "2026-09-05", "to": "2026-09-13"},
    "eventTime": "2026-07-28T07:27:00Z",
}
QUAKE_HONMACHI = dict(QUAKE_KUMAMOTO, eventId="earthquake:us6000tgbm",
                      title="M5.6 15 km SSW of Honmachi, Japan")

# 2026-10-01 실측 후보 (verify-scorecard · eventId 가 없다 → 기간이 정체다)
SCORECARD_2026_09 = {
    "sourceKind": "verify-scorecard", "reportKind": "forecast-verification",
    "eventId": None,
    "title": "EARTHUS 예보 성적표 · 2026-09",
    "observationPeriod": {"from": "2026-09-01", "to": "2026-09-30"},
    "eventTime": None,
}


class CollisionRegressionTests(unittest.TestCase):
    """실측한 그 두 건이 다시 같은 키를 쓰지 않는지 본다 — 요구 6."""

    def test_the_measured_collision_cannot_happen_again(self):
        quake = gen.content_id_for(QUAKE_KUMAMOTO)
        card = gen.content_id_for(SCORECARD_2026_09)
        self.assertNotEqual(quake, card)
        self.assertNotEqual(handler.BODY_PREFIX + quake + ".json",
                            handler.BODY_PREFIX + card + ".json")

    def test_the_old_counter_shape_is_gone_from_the_lambda_path(self):
        """`CNT-2026-000001` 모양이 다시 나오면 순번 회귀다."""
        import re
        for cand in (QUAKE_KUMAMOTO, QUAKE_HONMACHI, SCORECARD_2026_09):
            cid = gen.content_id_for(cand)
            self.assertIsNone(re.fullmatch(r"CNT-\d{4}-\d{6}", cid), cid)
            self.assertTrue(cid.startswith("CNT-"), cid)

    def test_two_events_on_one_day_do_not_collide(self):
        self.assertNotEqual(gen.content_id_for(QUAKE_KUMAMOTO),
                            gen.content_id_for(QUAKE_HONMACHI))


class IdempotencyTests(unittest.TestCase):
    """같은 입력이면 같은 id — 요구 2."""

    def test_same_candidate_gives_the_same_id_every_time(self):
        first = gen.content_id_for(QUAKE_KUMAMOTO)
        self.assertEqual(first, gen.content_id_for(dict(QUAKE_KUMAMOTO)))

    def test_a_moving_observation_window_does_not_change_the_id(self):
        """lab-report 의 창은 날마다 움직인다. 그것 때문에 id 가 바뀌면 중복이 쌓인다."""
        later = dict(QUAKE_KUMAMOTO,
                     observationPeriod={"from": "2026-09-06", "to": "2026-09-14"})
        self.assertEqual(gen.content_id_for(QUAKE_KUMAMOTO), gen.content_id_for(later))

    def test_the_same_scorecard_on_three_consecutive_days_is_one_id(self):
        """지난달 성적표는 1~3일에 세 번 만들어진다. 셋이 되면 안 된다."""
        ids = {gen.content_id_for(dict(SCORECARD_2026_09)) for _ in range(3)}
        self.assertEqual(1, len(ids))

    def test_a_different_period_is_a_different_scorecard(self):
        august = dict(SCORECARD_2026_09,
                      observationPeriod={"from": "2026-08-01", "to": "2026-08-31"},
                      title="EARTHUS 예보 성적표 · 2026-08")
        self.assertNotEqual(gen.content_id_for(SCORECARD_2026_09),
                            gen.content_id_for(august))


class IdentityTests(unittest.TestCase):
    """정체를 정할 수 없으면 id 를 지어 주지 않는다 — 요구 1·3."""

    def test_event_id_wins_over_everything_else(self):
        self.assertEqual("event=earthquake:us6000tgb9",
                         gen.candidate_identity(QUAKE_KUMAMOTO))

    def test_period_identifies_a_candidate_without_an_event(self):
        self.assertEqual("kind=verify-scorecard|period=2026-09-01..2026-09-30",
                         gen.candidate_identity(SCORECARD_2026_09))

    def test_an_unidentifiable_candidate_raises(self):
        for bad in ({}, {"title": "제목만 있다"}, {"sourceKind": "x"}, None):
            with self.assertRaises(gen.GeneratorError):
                gen.candidate_identity(bad)

    def test_generate_all_marks_an_unidentifiable_candidate_failed(self):
        """id 를 지어 주는 대신 실패로 남긴다 — 임의 id 는 다음 실행이 덮어쓴다."""
        out = handler.generate_all([{"title": "정체 불명"}], at="2026-09-13T00:00:00Z")
        self.assertEqual(1, len(out))
        self.assertTrue(out[0]["failed"])
        self.assertIsNone(out[0]["contentId"])
        self.assertIn("식별할 수 없다", out[0]["error"])

    def test_the_cli_counter_contract_is_untouched(self):
        """`cli.py --seq` 는 여전히 순번 모양을 쓴다 — 그 계약은 바꾸지 않았다."""
        self.assertEqual("CNT-2026-000123", gen.next_content_id(2026, 123))


class KeyShapeTests(unittest.TestCase):
    """관리 화면의 주소 계약이 깨지지 않아야 한다."""

    def test_ids_need_no_url_escaping(self):
        import re
        for cand in (QUAKE_KUMAMOTO, QUAKE_HONMACHI, SCORECARD_2026_09):
            self.assertRegex(gen.content_id_for(cand), r"^[A-Za-z0-9-]+$")


if __name__ == "__main__":
    unittest.main()
