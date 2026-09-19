# -*- coding: utf-8 -*-
"""CAP 1.2 정규화 필드 시험 (지시서 v1.1 §4.4 · 착수 지시 P0).

지키는 것
  · NWS 는 원본이 CAP 이라 한 글자도 바꾸지 않고 옮긴다
  · 기상청·JMA 는 원본이 말한 것만 옮기고, 말하지 않은 긴급도·확실도는 Unknown 이다(추측 금지)
  · 시험·연습·초안·시스템 메시지는 화면·푸시에 나가지 않는다
  · 세 수집기가 실제로 cap 을 단다(배선이 끊기지 않는다)
"""
import pathlib
import sys
import unittest

SHARED = pathlib.Path(__file__).parent.parent
AWS = SHARED.parent
sys.path.insert(0, str(SHARED))
import cap_map  # noqa: E402

# api.weather.gov /alerts/active 의 properties 모양 (필드 이름은 NWS 가 준 그대로)
NWS_PROPS = {
    "status": "Actual", "messageType": "Alert", "urgency": "Immediate", "severity": "Extreme",
    "certainty": "Observed", "response": "Shelter", "senderName": "NWS Norman OK",
    "headline": "Tornado Warning issued September 19 at 9:12PM CDT by NWS Norman OK",
    "instruction": "TAKE COVER NOW!", "onset": "2026-09-19T21:12:00-05:00",
    "effective": "2026-09-19T21:12:00-05:00", "expires": "2026-09-19T21:45:00-05:00",
    "event": "Tornado Warning",
}


class NwsTests(unittest.TestCase):
    def test_copied_verbatim(self):
        cap = cap_map.from_nws(NWS_PROPS)
        self.assertEqual("source", cap["mappedBy"])
        self.assertEqual("Immediate", cap["urgency"])
        self.assertEqual("Extreme", cap["severity"])
        self.assertEqual("Shelter", cap["responseType"])
        self.assertEqual(NWS_PROPS["instruction"], cap["instruction"])
        self.assertEqual([], cap_map.validate(cap))
        self.assertTrue(cap_map.displayable(cap))

    def test_test_and_exercise_messages_are_not_shown(self):
        for status in ("Test", "Exercise", "Draft", "System"):
            self.assertFalse(cap_map.displayable(cap_map.from_nws(dict(NWS_PROPS, status=status))), status)

    def test_missing_status_is_not_shown(self):
        p = dict(NWS_PROPS)
        del p["status"]
        self.assertFalse(cap_map.displayable(cap_map.from_nws(p)))


class KmaTests(unittest.TestCase):
    REC = {"region": "서울", "kind": "호우", "level": "경보", "commandState": "PUBLISHED",
           "effectiveKst": "202609200100", "issuedKst": "202609200040"}

    def test_only_what_the_source_says(self):
        cap = cap_map.from_kma(self.REC)
        self.assertEqual("Severe", cap["severity"])
        self.assertEqual("Alert", cap["msgType"])
        self.assertEqual("2026-09-20T01:00:00+09:00", cap["onset"])
        self.assertEqual("Unknown", cap["urgency"], "긴급도를 지어내지 않는다")
        self.assertEqual("Unknown", cap["certainty"])
        self.assertIsNone(cap["headline"], "문장을 짓지 않는다 — 원문이 없다")
        self.assertIsNone(cap["expires"])
        self.assertEqual("earthus-map", cap["mappedBy"])
        self.assertTrue(cap_map.displayable(cap))

    def test_levels_keep_their_order(self):
        sev = [cap_map.from_kma(dict(self.REC, level=l))["severity"] for l in ("주의보", "경보", "중대경보")]
        self.assertEqual(["Moderate", "Severe", "Extreme"], sev)

    def test_pre_warning_is_future_without_severity(self):
        cap = cap_map.from_kma(dict(self.REC, level="예비특보"), upcoming=True)
        self.assertEqual("Future", cap["urgency"])
        self.assertEqual("Unknown", cap["severity"])

    def test_replaced_and_extended_are_updates(self):
        for st in ("REPLACED", "RELEASE_FORECAST_EXTENDED"):
            self.assertEqual("Update", cap_map.from_kma(dict(self.REC, commandState=st))["msgType"])
        self.assertIsNone(cap_map.from_kma(dict(self.REC, commandState="UNKNOWN"))["msgType"])


class JmaTests(unittest.TestCase):
    def test_original_headline_untranslated_and_unknown_severity(self):
        cap = cap_map.from_jma(statuses=["発表", "継続"], office="稚内地方気象台",
                               headline="宗谷地方では、濃霧による視程障害に注意してください。",
                               report_datetime="2026-09-19T15:09:00+09:00")
        self.assertEqual("Alert", cap["msgType"])
        self.assertEqual("Unknown", cap["severity"], "코드에 경보/주의보 이름을 붙이지 않는다")
        self.assertIn("濃霧", cap["headline"])
        self.assertEqual([], cap_map.validate(cap))

    def test_continuing_only_is_update(self):
        cap = cap_map.from_jma(statuses=["継続"], office="x", headline=None, report_datetime=None)
        self.assertEqual("Update", cap["msgType"])


class VocabularyTests(unittest.TestCase):
    def test_out_of_vocabulary_is_rejected(self):
        cap = cap_map.from_nws(dict(NWS_PROPS, severity="Very Bad"))
        self.assertTrue(cap_map.validate(cap))
        self.assertFalse(cap_map.displayable(cap))

    def test_mapping_tables_stay_inside_cap_vocabulary(self):
        for v in cap_map.KMA_LEVEL_SEVERITY.values():
            self.assertIn(v, cap_map.SEVERITY)
        for v in list(cap_map.KMA_COMMAND_MSGTYPE.values()) + list(cap_map.JMA_STATUS_MSGTYPE.values()):
            self.assertIn(v, cap_map.MSG_TYPE)


class WiringTests(unittest.TestCase):
    """세 수집기가 실제로 cap 을 단다 — 모듈만 있고 배선이 없으면 운영에 안 나간다."""

    def test_collectors_attach_cap(self):
        for fn, needle in (("kma-warn", 'rec["cap"] = cap_map.from_kma('),
                           ("world-alerts", '"cap": cap,'),
                           ("jma-warn", 'e["cap"] = cap_map.from_jma(')):
            src = (AWS / fn / "handler.py").read_text(encoding="utf-8")
            self.assertIn("import cap_map", src, fn)
            self.assertIn(needle, src, fn)

    def test_world_alerts_filters_non_actual(self):
        src = (AWS / "world-alerts" / "handler.py").read_text(encoding="utf-8")
        self.assertIn("if not cap_map.displayable(cap):", src)


if __name__ == "__main__":
    unittest.main()
