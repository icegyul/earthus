# -*- coding: utf-8 -*-
"""3G 공용 부품 — 진실 어휘 · 사건 결합 · 주장 게이트 · 사건 id.

이 넷은 PHASE 3G 를 위해 새로 만든 파일이고, 전부 **기존 규칙의 이식**이다.
그래서 이 테스트가 지키는 것은 "값을 우리가 바꾸지 않았다"와 "어휘를 새로 만들지 않았다"다.
자격증명이 필요 없다.
"""
import pathlib
import sys
import unittest

SHARED = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SHARED))
import claim_gate                                        # noqa: E402
import earth_event_id as eid                             # noqa: E402
import event_fusion as fusion                            # noqa: E402
import provenance                                        # noqa: E402
import truth_vocabulary as truth                         # noqa: E402


class VocabularyComesFromSql(unittest.TestCase):
    def test_four_domains_are_read_from_the_sql_file(self):
        """어휘를 코드에 베껴 쓰지 않는다 — SQL domain 정의를 읽는다."""
        self.assertTrue(truth.SQL_PATH.endswith("20260913_earth_event_core.sql"))
        self.assertEqual(len(truth.TRUTH_STATUS), 8)
        self.assertEqual(len(truth.SOURCE_KIND), 6)
        self.assertEqual(len(truth.DATA_STATE), 4)
        self.assertEqual(len(truth.RELEASE_STATE), 3)
        self.assertIn("CORROBORATED", truth.TRUTH_STATUS)
        self.assertIn("SHADOW", truth.RELEASE_STATE)

    def test_unknown_value_is_refused(self):
        """어휘 밖의 값을 조용히 통과시키지 않는다."""
        with self.assertRaises(truth.VocabularyError):
            truth.require("VERIFIED", truth.TRUTH_STATUS, "TRUTH_STATUS")
        with self.assertRaises(truth.VocabularyError):
            truth.truth_status(source_kind="BLOG")


class TruthPromotionRules(unittest.TestCase):
    def test_default_is_unknown(self):
        """근거가 없으면 UNKNOWN 이다 (정본 §2.1 규칙 1)."""
        status, _ = truth.truth_status(source_kind=None)
        self.assertEqual(status, "UNKNOWN")

    def test_news_alone_is_reported(self):
        self.assertEqual(truth.truth_status(source_kind="NEWS")[0], "REPORTED")

    def test_official_needs_sla_to_become_fact(self):
        """SLA 를 모르면 FACT 로 올리지 않는다 — 모르는 것을 승격 근거로 쓰지 않는다."""
        self.assertEqual(truth.truth_status(source_kind="OFFICIAL",
                                            observation_within_sla=True)[0], "FACT")
        self.assertEqual(truth.truth_status(source_kind="OFFICIAL")[0], "UNKNOWN")
        self.assertEqual(truth.truth_status(source_kind="OFFICIAL",
                                            observation_within_sla=False)[0], "UNKNOWN")

    def test_official_but_unavailable_is_not_fact(self):
        self.assertNotEqual(truth.truth_status(source_kind="OFFICIAL",
                                               data_state="UNAVAILABLE",
                                               observation_within_sla=True)[0], "FACT")

    def test_forecast_and_simulation_are_one_way(self):
        """미래·가정은 FACT 로 올라가지 않는다 (규칙 2)."""
        self.assertEqual(truth.truth_status(source_kind="OFFICIAL", time_mode="FORECAST",
                                            observation_within_sla=True)[0], "FORECAST")
        self.assertEqual(truth.truth_status(source_kind="OFFICIAL", time_mode="SCENARIO",
                                            observation_within_sla=True)[0], "SIMULATION")
        self.assertEqual(truth.truth_status(source_kind="OBSERVATION",
                                            is_simulation_output=True,
                                            observation_within_sla=True)[0], "SIMULATION")

    def test_earthus_model_output_is_inferred(self):
        self.assertEqual(truth.truth_status(source_kind="MODEL",
                                            produced_by="EARTHUS")[0], "INFERRED")

    def test_corroboration_is_a_separate_axis(self):
        """교차검증은 등급이 아니다 — 둘을 하나로 눌러 담지 않는다 (규칙 3)."""
        verdict = truth.judge(source_kind="NEWS", independence_count=2)
        self.assertEqual(verdict["truthStatus"], "REPORTED")
        self.assertTrue(verdict["corroborated"])
        self.assertEqual(verdict["independenceCount"], 2)
        weak = truth.judge(source_kind="NEWS", independence_count=1)
        self.assertFalse(weak["corroborated"])
        self.assertEqual(truth.CORROBORATION_MIN, 2)

    def test_one_way_axes_get_no_corroboration(self):
        """미래·가정에는 '여럿이 봤다'가 성립하지 않는다."""
        verdict = truth.judge(source_kind="OFFICIAL", time_mode="FORECAST",
                              independence_count=5, observation_within_sla=True)
        self.assertEqual(verdict["truthStatus"], "FORECAST")
        self.assertFalse(verdict["corroborated"])

    def test_no_percentage_is_produced(self):
        """퍼센트를 만들지 않는다 (규칙 4)."""
        verdict = truth.judge(source_kind="NEWS", independence_count=3)
        self.assertNotIn("confidence", verdict)
        self.assertNotIn("score", verdict)
        self.assertNotIn("probability", verdict)


class FusionPortIsFaithful(unittest.TestCase):
    def test_constants_match_v11(self):
        """v11 event-fusion 의 문턱을 바꾸지 않았다."""
        self.assertEqual(fusion.DEFAULT_MAX_HOURS, 72.0)
        self.assertEqual(fusion.DEFAULT_MAX_METERS, 250000.0)
        self.assertEqual(fusion.DEFAULT_MERGE_SCORE, 0.62)

    def test_type_mismatch_never_merges(self):
        """유형이 다르면 점수를 계산하지 않는다 — 지진과 시위를 합치지 않는다."""
        verdict = fusion.event_similarity({"eventType": "EQ"}, {"eventType": "PROTEST"})
        self.assertEqual(verdict["score"], 0.0)
        self.assertFalse(verdict["merge"])
        self.assertIn("TYPE_MISMATCH", verdict["reasons"])

    def test_official_id_match_is_decisive(self):
        left = {"eventType": "EQ", "officialEventId": "usgs:us7000abcd"}
        right = {"eventType": "EQ", "officialEventId": "usgs:us7000abcd"}
        verdict = fusion.event_similarity(left, right)
        self.assertEqual(verdict["score"], 1.0)
        self.assertTrue(verdict["merge"])
        self.assertIn("OFFICIAL_ID_MATCH", verdict["reasons"])

    def test_unknown_time_or_place_is_not_treated_as_far(self):
        """모른다는 것이 '멀다'는 뜻은 아니다 — v11 과 같은 약한 기본값을 쓴다."""
        verdict = fusion.event_similarity({"eventType": "EQ"}, {"eventType": "EQ"})
        self.assertIn("TIME_UNKNOWN", verdict["reasons"])
        self.assertIn("GEO_UNKNOWN", verdict["reasons"])
        self.assertGreater(verdict["score"], 0.0)

    def test_group_makes_no_id_and_keeps_input_order(self):
        """묶기만 한다 — 대표 선정·id 생성을 하지 않는다(결정 ②③④가 따로 정했다)."""
        records = [
            {"eventType": "EQ", "lat": 35.0, "lon": 139.0, "timeBucketEpoch": 0},
            {"eventType": "EQ", "lat": 35.01, "lon": 139.01, "timeBucketEpoch": 0},
            {"eventType": "FLOOD", "lat": -6.2, "lon": 106.8, "timeBucketEpoch": 0},
        ]
        groups = fusion.group(records)
        self.assertEqual([len(g) for g in groups], [2, 1])
        for group in groups:
            for member in group:
                self.assertNotIn("eventId", member)
                self.assertNotIn("stableId", member)

    def test_haversine_returns_none_for_missing_coordinates(self):
        self.assertIsNone(fusion.haversine_meters(None, 1.0, 2.0, 3.0))
        self.assertIsNone(fusion.haversine_meters(True, 1.0, 2.0, 3.0))


class ClaimGatePortIsFaithful(unittest.TestCase):
    def test_rules_match_v11(self):
        self.assertEqual(set(claim_gate.RULES), {
            "SOURCE_ATTRIBUTION", "TRANSPORT", "DISCOVERY_RECOMMENDATION",
            "FORECAST", "SAFETY_ACTION"})
        self.assertEqual(claim_gate.RULES["SAFETY_ACTION"], ("officialWarning",))

    def test_no_evidence_means_no_label(self):
        """증거가 없으면 이름을 주지 않는다."""
        self.assertIsNone(claim_gate.claim_label("SAFETY_ACTION", {}))
        gate = claim_gate.evaluate_claim("SAFETY_ACTION", {})
        self.assertFalse(gate["allowed"])
        self.assertEqual(gate["missing"], ["officialWarning"])

    def test_evidence_earns_the_label(self):
        self.assertEqual(claim_gate.claim_label("SAFETY_ACTION",
                                                {"officialWarning": True}),
                         "OFFICIAL_SAFETY")
        self.assertEqual(claim_gate.claim_label("TRANSPORT",
                                                {"vectorProof": True,
                                                 "transportEvidenceKind": "OBSERVED"}),
                         "OBSERVED_MOTION")
        self.assertEqual(claim_gate.claim_label("TRANSPORT",
                                                {"vectorProof": True,
                                                 "transportEvidenceKind": "MODELLED"}),
                         "MODELLED_TRANSPORT")

    def test_truthy_is_not_true(self):
        """v11 과 같이 **정확히 True** 만 증거로 인정한다 — 1·"yes" 는 증거가 아니다."""
        for value in (1, "yes", [1], {"a": 1}):
            self.assertFalse(claim_gate.evaluate_claim(
                "SAFETY_ACTION", {"officialWarning": value})["allowed"])

    def test_unknown_claim_type_is_refused_by_gate_all(self):
        """v11 `evaluateClaim` 은 모르는 종류를 통과시킨다 — `gate_all` 이 그 문을 막는다."""
        self.assertTrue(claim_gate.evaluate_claim("아무거나", {})["allowed"])
        result = claim_gate.gate_all(["아무거나"], {})
        self.assertEqual(result["allowed"], [])
        self.assertEqual(len(result["refused"]), 1)


class EventIdRules(unittest.TestCase):
    def test_shape_and_width(self):
        """결정 ②③ — sha256 앞 20 hex (80비트). v11 FNV-1a 32비트를 쓰지 않는다."""
        self.assertEqual(eid.ID_HEX, 20)
        self.assertEqual(eid.ID_PREFIX, "evt_")
        self.assertEqual(eid.EVENT_KEY_VERSION, 1)
        value = eid.event_id(event_type="gdelt:DIS", place_key="gdelt:feature:F1",
                             time_bucket_iso="2026-09-13T09:00:00Z")
        self.assertTrue(eid.is_event_id(value))
        self.assertEqual(len(value), 24)

    def test_version_changes_the_id(self):
        """결정 ④ — 규칙 판이 다르면 서명이 다르다. 기존 id 를 소급 변경하지 않는다."""
        common = {"event_type": "gdelt:DIS", "place_key": "p",
                  "time_bucket_iso": "2026-09-13T09:00:00Z"}
        self.assertNotEqual(eid.event_id(**common),
                            eid.event_id(event_key_version=2, **common))
        self.assertTrue(eid.signature(**common).startswith("v1\x1f"))

    def test_absent_input_has_one_fixed_representation(self):
        """없음의 표현이 회차마다 같아야 한다 — 아니면 같은 사건이 갈라진다."""
        a = eid.event_id(event_type="gdelt:DIS", place_key=None,
                         time_bucket_iso="2026-09-13T09:00:00Z")
        b = eid.event_id(event_type="gdelt:DIS", place_key="",
                         time_bucket_iso="2026-09-13T09:00:00Z")
        c = eid.event_id(event_type="gdelt:dis ", place_key="   ",
                         time_bucket_iso="2026-09-13T09:00:00Z")
        self.assertEqual(a, b)
        self.assertEqual(b, c)                     # NFKC·공백·소문자 정규화

    def test_all_inputs_absent_is_refused(self):
        """식별할 수 없으면 id 를 지어 주지 않는다 — 임의 id 는 다음 실행이 덮어쓴다."""
        with self.assertRaises(eid.EventIdError):
            eid.event_id(event_type=None, place_key=None, time_bucket_iso=None)

    def test_time_bucket_is_three_hours_utc(self):
        """결정 ⑤ — GDELT WINDOW_HOURS = 3 을 기준으로 3시간 UTC 버킷."""
        self.assertEqual(eid.TIME_BUCKET_HOURS, 3)
        epoch = eid.bucket_epoch("2026-09-13T09:00:00Z")
        self.assertEqual(eid.time_bucket(epoch), "2026-09-13T09:00:00Z")
        self.assertEqual(eid.time_bucket(epoch + 3599), "2026-09-13T09:00:00Z")
        self.assertEqual(eid.time_bucket(epoch + 3 * 3600), "2026-09-13T12:00:00Z")
        self.assertEqual(eid.time_bucket(epoch - 1), "2026-09-13T06:00:00Z")

    def test_bucket_is_not_an_event_time(self):
        """버킷은 사건 시각이 아니다 — 정시로 끝나는 표시가 그것을 드러낸다."""
        self.assertTrue(eid.time_bucket(0).endswith(":00:00Z"))
        self.assertIsNone(eid.time_bucket(None))

    def test_primary_entities_are_not_in_v1(self):
        """결정 ⑦ — v1 신원에 엔티티가 들어가지 않는다."""
        described = eid.describe(event_type="gdelt:DIS", place_key="p",
                                 time_bucket_iso="2026-09-13T09:00:00Z")
        self.assertIsNone(described["inputs"]["primaryEntities"])
        self.assertEqual(sorted(described["inputs"]),
                         ["canonicalPlace", "eventType", "primaryEntities", "timeBucket"])

    def test_source_event_id_keeps_the_upstream_identifier(self):
        """결정 ③ — 원본 id 를 버리지 않는다. `{system}:{identifier}` 규약을 쓴다."""
        self.assertEqual(eid.source_event_id("GDELT", "1234567890"), "gdelt:1234567890")
        with self.assertRaises(eid.EventIdError):
            eid.source_event_id("gdelt", "")


class ProvenanceEntry(unittest.TestCase):
    def test_global_json_resolves(self):
        """결정 ⑫ — 출처가 표에 있고, truthType 은 UNKNOWN 이다."""
        entry = provenance.resolve_dataset("events/global.json")
        self.assertTrue(entry["resolved"])
        self.assertEqual(entry["truthType"], "UNKNOWN")
        self.assertEqual(entry["provider"], "GDELT 2.0 Events")
        self.assertEqual(entry["collector"], "aws/gdelt-events/handler.py")
        self.assertIn("cron(5,35", entry["cadence"])

    def test_no_invented_truth_type(self):
        """임의의 truthType 을 만들지 않는다 — 표의 값은 정본 어휘 안에 있어야 한다."""
        entry = provenance.resolve_dataset("events/global.json")
        self.assertIn(entry["truthType"], truth.TRUTH_STATUS)


if __name__ == "__main__":
    unittest.main(verbosity=2)
