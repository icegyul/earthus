# -*- coding: utf-8 -*-
"""earthus-llm 핸들러 시험 — 패킷 동봉(§C-1)·P4 게이트·서술 후처리 적용(§C-2).

모델은 부르지 않는다. call_gemini 를 가짜로 바꿔 스냅샷을 받아 적고, 정해 둔 답을 돌려준다.
"""
import copy
import importlib.util
import json
import os
import pathlib
import sys
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
FUNCTION = HERE.parent
AWS = FUNCTION.parent
REPO = AWS.parent
sys.path.insert(0, str(AWS / "_shared"))
import intel_contract  # noqa: E402

FIXTURE = json.loads((REPO / "tools" / "earthus-v53" / "fixtures" / "intel-v1-typhoon-1001322.json")
                     .read_text(encoding="utf-8"))
LAYERS = [{"id": "sst", "label": "해수면 온도", "badge": "OBSERVED", "value": "29.3°C", "ageMin": 30, "slaMin": 60}]


def load_handler():
    """다른 함수의 handler 와 이름이 겹치지 않게 경로로 불러온다."""
    spec = importlib.util.spec_from_file_location("earthus_llm_handler_under_test", FUNCTION / "handler.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def gemini_raw(answer, used=("sst",), actions=None, insufficient=False):
    text = json.dumps({"answer": answer, "insufficient": insufficient, "used": list(used),
                       "actions": actions if actions is not None else [{"tool": "showLayer", "id": "sst"}]},
                      ensure_ascii=False)
    return {"candidates": [{"content": {"parts": [{"text": text}]}, "finishReason": "STOP"}],
            "usageMetadata": {"totalTokenCount": 42}}


def without(packet, section, reason="시험용 — 재료 없음"):
    out = copy.deepcopy(packet)
    out.pop(section)
    out.setdefault("coverage", {}).setdefault("missing", []).append({"section": section, "reason": reason})
    return out


class HandlerTests(unittest.TestCase):

    def setUp(self):
        self.h = load_handler()
        self.h._BUCKET.clear()
        patcher = mock.patch.dict(os.environ, {"GEMINI_API_KEY": "not-a-real-key"})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.calls = []
        self.answer = "최대풍속은 35 m/s입니다."

        def fake_call(key, snapshot, question, lang="ko"):
            self.calls.append({"snapshot": copy.deepcopy(snapshot), "question": question, "lang": lang})
            return gemini_raw(self.answer), "fake-model"

        self.h.call_gemini = fake_call

    def ask(self, **payload):
        payload.setdefault("q", "지금 어떤가요?")
        payload.setdefault("lang", "ko")
        payload.setdefault("layers", LAYERS)
        event = {"requestContext": {"http": {"method": "POST", "sourceIp": "203.0.113.7"}},
                 "body": json.dumps(payload, ensure_ascii=False)}
        res = self.h.handler(event, None)
        return res["statusCode"], json.loads(res["body"])

    # ── 지시문 ────────────────────────────────────────────────────────────
    def test_rules_7_and_8_are_in_the_prompt_for_both_languages(self):
        for lang in ("ko", "en"):
            with self.subTest(lang=lang):
                prompt = self.h.system_prompt(lang)
                self.assertIn("\n7. ", prompt)
                self.assertIn("\n8. ", prompt)
                self.assertIn(intel_contract.FIXED_TEXT["sectionMissing"][lang], prompt)
                self.assertIn("/".join(intel_contract.CONFIDENCE_GRADE), prompt)
                self.assertIn("OFFICIAL_FORECAST", prompt)
                for placeholder in ("{SECTION_MISSING}", "{GRADES}", "{FORECAST_KINDS}",
                                    "{LANG_LINE}", "{NO_DATA}", "{CORR}"):
                    self.assertNotIn(placeholder, prompt)

    def test_rules_1_to_6_are_unchanged(self):
        prompt = self.h.system_prompt("ko")
        for n in range(1, 7):
            self.assertIn("\n%d. " % n, prompt)
        self.assertLess(prompt.index("\n6. "), prompt.index("\n7. "))

    # ── 패킷 동봉 (§C-1) ───────────────────────────────────────────────────
    def test_packet_reaches_the_model_only_as_the_narrator_view(self):
        code, body = self.ask(intelPacket=FIXTURE)
        self.assertEqual(200, code)
        sent = self.calls[0]["snapshot"]["인텔패킷"]
        self.assertEqual(intel_contract.narrator_view(FIXTURE), sent)
        self.assertEqual({"grade": "HIGH"}, sent["confidence"])
        self.assertEqual(["anomaly"], sent["missingSections"])
        dumped = json.dumps(self.calls[0]["snapshot"], ensure_ascii=False)
        for secret in ("formula_id", "agencyAgreement24hKm", "coverage"):
            self.assertNotIn(secret, dumped, "원본 패킷의 %s 가 모델에게 갔다" % secret)

    def test_warning_source_carries_meta_only(self):
        packet = copy.deepcopy(FIXTURE)
        packet["sources"].append({"id": "w1", "kind": "OFFICIAL_WARNING", "status": "Alert",
                                  "issuedAt": "2026-09-19T15:00:00+09:00", "officialUrl": "https://example.invalid/w1",
                                  "headline": "본문", "instruction": "본문"})
        self.ask(intelPacket=packet)
        warning = [s for s in self.calls[0]["snapshot"]["인텔패킷"]["sources"] if s["id"] == "w1"][0]
        self.assertEqual({"id", "kind", "status", "issuedAt", "officialUrl"}, set(warning))

    def test_invalid_packet_never_reaches_the_model(self):
        bad = copy.deepcopy(FIXTURE)
        bad["conditions"][0]["noteKo"] = "해수온이 강화를 초래했다"          # J-3 위반
        for packet in (bad, "문자열", [1, 2], {"schema": 1}):
            with self.subTest(packet=str(packet)[:20]):
                self.calls.clear()
                code, body = self.ask(intelPacket=packet)
                self.assertEqual(200, code)
                self.assertEqual([], self.calls, "계약 위반 패킷으로 모델을 불렀다")
                self.assertTrue(body["insufficient"])
                self.assertEqual({"passed": False, "reasons": ["PACKET_INVALID"]}, body["guard"])
                self.assertEqual(intel_contract.FIXED_TEXT["insufficient"]["ko"], body["answer"])

    def test_oversized_packet_is_refused(self):
        with mock.patch.object(self.h, "MAX_PACKET", 100):
            code, body = self.ask(intelPacket=FIXTURE)
        self.assertEqual(["PACKET_INVALID"], body["guard"]["reasons"])
        self.assertEqual([], self.calls)

    def test_a_packet_is_grounding_even_with_no_layers_on(self):
        code, body = self.ask(intelPacket=FIXTURE, layers=[])
        self.assertEqual(1, len(self.calls))
        self.assertTrue(body["guard"]["passed"])

    def test_no_layers_and_no_packet_keeps_the_old_answer(self):
        code, body = self.ask(layers=[])
        self.assertEqual([], self.calls)
        self.assertTrue(body["insufficient"])
        self.assertIn("켜진 레이어가 없어서", body["answer"])

    # ── P4 게이트: 재료 없는 WHY → insufficient ───────────────────────────
    def test_why_without_conditions_is_insufficient_without_a_model_call(self):
        code, body = self.ask(intelPacket=without(FIXTURE, "conditions"), intelSection="WHY", q="왜 강해졌나요?")
        self.assertEqual(200, code)
        self.assertEqual([], self.calls)
        self.assertTrue(body["insufficient"])
        self.assertEqual({"passed": False, "reasons": ["SECTION_NOT_AVAILABLE"]}, body["guard"])
        self.assertEqual(intel_contract.FIXED_TEXT["insufficient"]["ko"], body["answer"])

    def test_why_with_conditions_calls_the_model(self):
        self.answer = "태풍 중심 격자칸의 해수면 온도는 29.3°C입니다. 함께 나타난 조건입니다."
        code, body = self.ask(intelPacket=FIXTURE, intelSection="WHY", q="왜 강해졌나요?")
        self.assertEqual(1, len(self.calls))
        self.assertTrue(body["guard"]["passed"], body)
        self.assertEqual(self.answer, body["answer"])

    def test_next_without_forecasts_is_insufficient(self):
        code, body = self.ask(intelPacket=without(FIXTURE, "next"), intelSection="NEXT", lang="en")
        self.assertEqual([], self.calls)
        self.assertEqual(intel_contract.FIXED_TEXT["insufficient"]["en"], body["answer"])

    def test_a_section_question_without_a_packet_is_not_evaluable(self):
        code, body = self.ask(intelSection="WHY")
        self.assertEqual([], self.calls)
        self.assertEqual(["SECTION_NOT_AVAILABLE"], body["guard"]["reasons"])

    def test_unknown_section_is_a_bad_request(self):
        for section in ("REPORT", ["WHY"], {"WHY": 1}):
            with self.subTest(section=section):
                code, body = self.ask(intelPacket=FIXTURE, intelSection=section)
                self.assertEqual(400, code)
        self.assertEqual([], self.calls)

    # ── 서술 후처리 적용 (§C-2) ────────────────────────────────────────────
    def test_clean_answer_passes_through_with_a_guard_field(self):
        code, body = self.ask(intelPacket=FIXTURE)
        self.assertEqual(200, code)
        self.assertEqual("최대풍속은 35 m/s입니다.", body["answer"])
        self.assertFalse(body["insufficient"])
        self.assertEqual(["sst"], body["used"])
        self.assertEqual([{"tool": "showLayer", "id": "sst"}], body["actions"])
        self.assertEqual({"passed": True, "reasons": []}, body["guard"])
        self.assertEqual({"answer", "insufficient", "used", "actions", "model", "tokens", "guard"}, set(body))

    def test_violating_answer_is_replaced_whole_with_reasons(self):
        self.answer = "최대풍속은 35 m/s입니다. 따뜻한 바다 때문에 강해졌습니다."
        code, body = self.ask(intelPacket=FIXTURE)
        self.assertEqual(200, code)
        self.assertEqual(intel_contract.FIXED_TEXT["insufficient"]["ko"], body["answer"])
        self.assertTrue(body["insufficient"])
        self.assertEqual([], body["used"], "바뀐 답에 모델이 고른 근거를 붙이지 않는다")
        self.assertEqual([], body["actions"], "바뀐 답에 모델이 고른 3D 조작을 붙이지 않는다")
        self.assertEqual({"passed": False, "reasons": ["CAUSAL"]}, body["guard"])

    def test_number_outside_the_packet_is_replaced(self):
        self.answer = "최대풍속은 35 m/s, 약 126 km/h 입니다."
        code, body = self.ask(intelPacket=FIXTURE)
        self.assertEqual(["NUMBER"], body["guard"]["reasons"])

    def test_english_replacement_is_english(self):
        self.answer = "Residents should evacuate."
        code, body = self.ask(intelPacket=FIXTURE, lang="en", q="What now?")
        self.assertEqual(intel_contract.FIXED_TEXT["insufficient"]["en"], body["answer"])
        self.assertEqual(["EVACUATION"], body["guard"]["reasons"])

    def test_answers_without_a_packet_are_guarded_too(self):
        """지구와 대화(패킷 없음)도 같은 대조를 거친다 — 숫자 원본은 스냅샷이다."""
        self.answer = "해수면 온도 레이어는 29.3°C 입니다."
        code, body = self.ask()
        self.assertTrue(body["guard"]["passed"], body)
        self.answer = "It is warm because the sea caused by the sun."
        code, body = self.ask(lang="en")
        self.assertEqual(["CAUSAL"], body["guard"]["reasons"])


if __name__ == "__main__":
    unittest.main()
