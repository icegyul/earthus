# -*- coding: utf-8 -*-
"""서술 후처리 시험 — 계약 §J-4 "서술 응답에 §C-2 일곱 검사 위반 0건 (골든셋 50건 정적)".

네트워크·모델이 없다. 패킷 뷰는 실제 태풍 v1 픽스처(tools/earthus-v53/fixtures)에 골든셋 변형을
얹고 handler.enclose_packet() 을 거쳐 만든다 — 서버가 서술자에게 보내는 것과 같은 길이다.
"""
import copy
import importlib.util
import json
import pathlib
import sys
import unittest
from decimal import Decimal

HERE = pathlib.Path(__file__).resolve().parent
FUNCTION = HERE.parent
AWS = FUNCTION.parent
REPO = AWS.parent
sys.path.insert(0, str(AWS / "_shared"))
sys.path.insert(0, str(FUNCTION))
import intel_contract  # noqa: E402
import narration_guard as ng  # noqa: E402


def load_handler():
    """다른 함수의 handler 와 이름이 겹치지 않게 경로로 불러온다."""
    spec = importlib.util.spec_from_file_location("earthus_llm_handler", FUNCTION / "handler.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


HANDLER = load_handler()
GOLDEN = json.loads((HERE / "golden_narration.json").read_text(encoding="utf-8"))
FIXTURE = json.loads((REPO / GOLDEN["fixture"]).read_text(encoding="utf-8"))
LANGS = ("ko", "en")


def apply_patch(packet, patch):
    """골든셋 변형 — set(경로에 값) · append(목록 끝에) · drop_section(절을 빼고 missing 에 이유)."""
    out = copy.deepcopy(packet)
    for op in patch:
        kind = op["op"]
        if kind == "set":
            node = out
            for key in op["path"][:-1]:
                node = node[key]
            node[op["path"][-1]] = copy.deepcopy(op["value"])
        elif kind == "append":
            node = out
            for key in op["path"]:
                node = node[key]
            node.append(copy.deepcopy(op["value"]))
        elif kind == "drop_section":
            out.pop(op["section"])
            out.setdefault("coverage", {}).setdefault("missing", []).append(
                {"section": op["section"], "reason": op["reason"]})
        else:
            raise ValueError("모르는 변형: %r" % kind)
    return out


def view_for(variant):
    return HANDLER.enclose_packet(apply_patch(FIXTURE, GOLDEN["variants"][variant]["patch"]))


class GoldenSetTests(unittest.TestCase):
    """§J-4 — 골든셋 50건. 검사마다 위반·정상, 한국어·영어가 모두 있어야 한다."""

    def test_there_are_exactly_fifty_static_cases(self):
        ids = [case["id"] for case in GOLDEN["cases"]]
        self.assertEqual(50, len(ids))
        self.assertEqual(len(ids), len(set(ids)), "id 가 겹친다")

    def test_every_check_has_violating_and_clean_cases_in_both_languages(self):
        for code in ng.REASONS:
            for lang in LANGS:
                with self.subTest(check=code, lang=lang):
                    mine = [c for c in GOLDEN["cases"] if c["check"] == code and c["lang"] == lang]
                    self.assertTrue(any(not c["expect"]["passed"] and code in c["expect"]["reasons"]
                                        for c in mine), "위반 사례가 없다")
                    self.assertTrue(any(c["expect"]["passed"] for c in mine), "정상 사례가 없다")

    def test_every_variant_is_a_contract_valid_packet(self):
        """변형도 계약을 지나야 한다 — 서술자에게 갈 수 없는 패킷으로 시험하지 않는다."""
        for name, variant in GOLDEN["variants"].items():
            with self.subTest(variant=name):
                fixed, errors = intel_contract.check(apply_patch(FIXTURE, variant["patch"]))
                self.assertEqual([], errors)

    def test_base_view_is_the_real_narrator_view(self):
        view = view_for("base")
        self.assertEqual(intel_contract.narrator_view(FIXTURE), view)
        self.assertEqual(["anomaly"], view["missingSections"])
        self.assertEqual({"grade": "HIGH"}, view["confidence"], "confidence 내부 수치는 가지 않는다")
        self.assertNotIn("coverage", view)

    def test_golden_cases(self):
        views = {name: view_for(name) for name in GOLDEN["variants"]}
        for case in GOLDEN["cases"]:
            with self.subTest(case=case["id"]):
                verdict = ng.check(case["answer"], views[case["variant"]], lang=case["lang"])
                self.assertEqual(case["expect"]["reasons"], verdict["reasons"], verdict["details"])
                self.assertEqual(case["expect"]["passed"], verdict["passed"])
                if verdict["passed"]:
                    self.assertEqual(case["answer"], verdict["answer"], "통과한 답은 한 글자도 바꾸지 않는다")
                else:
                    self.assertEqual(ng.insufficient_text(case["lang"]), verdict["answer"],
                                     "걸린 답은 전체를 고정 문장으로 바꾼다")

    def test_warning_body_never_reaches_the_view(self):
        """§C-1 — 특보는 메타만. 골든셋 변형이 붙인 headline 이 뷰에 없어야 한다."""
        warning = [s for s in view_for("warning_active")["sources"] if s.get("kind") == "OFFICIAL_WARNING"]
        self.assertEqual(1, len(warning))
        self.assertNotIn("headline", warning[0])
        self.assertEqual("Alert", warning[0]["status"])


class GuardUnitTests(unittest.TestCase):

    def setUp(self):
        self.view = view_for("base")

    def test_causal_words_are_read_from_the_vocabulary_not_copied(self):
        """§C-3 — 9어휘는 intel-vocab.json 한 곳. 이 모듈 소스에 한 어휘도 적혀 있으면 안 된다."""
        source = (FUNCTION / "narration_guard.py").read_text(encoding="utf-8")
        self.assertEqual(9, len(intel_contract.FORBIDDEN_CAUSAL))
        for word in intel_contract.FORBIDDEN_CAUSAL:
            self.assertNotIn(word, source, "FORBIDDEN_CAUSAL 을 베껴 적었다: %s" % word)
        self.assertIn("intel_contract.causal_hits", source)

    def test_replacement_text_is_the_vocabulary_fixed_sentence(self):
        for lang in LANGS:
            self.assertEqual(intel_contract.FIXED_TEXT["insufficient"][lang], ng.insufficient_text(lang))
        self.assertEqual(intel_contract.FIXED_TEXT["insufficient"]["ko"], ng.insufficient_text("xx"))

    def test_fixed_sentences_pass_their_own_guard(self):
        """교체 문장이 다시 걸리면 교체가 멈추지 않는다. 규칙 7 의 고정 문장도 통과해야 한다."""
        for key in ("insufficient", "sectionMissing"):
            for lang in LANGS:
                with self.subTest(text=key, lang=lang):
                    verdict = ng.check(intel_contract.FIXED_TEXT[key][lang], self.view, lang=lang)
                    self.assertTrue(verdict["passed"], verdict["details"])

    def test_replacement_is_whole_never_partial(self):
        """§C-2 부분 삭제 금지 — 깨끗한 문장이 섞여 있어도 남기지 않는다."""
        clean = "최대풍속은 35 m/s입니다."
        verdict = ng.check(clean + " 따뜻한 바다 때문에 강해졌습니다.", self.view)
        self.assertFalse(verdict["passed"])
        self.assertEqual(ng.insufficient_text("ko"), verdict["answer"])
        self.assertNotIn("35", verdict["answer"])

    def test_every_hit_is_reported_in_contract_order(self):
        text = ("따뜻한 바다 때문에 확률이 높고, 신뢰도 0.9 이며 평년보다 강합니다. "
                "주민은 대피해야 하고 풍속은 126 km/h 입니다.")
        verdict = ng.check(text, self.view)
        self.assertEqual(["CAUSAL", "PERCENT", "CONFIDENCE_NUMBER", "MISSING_SECTION",
                          "EVACUATION", "NUMBER"], verdict["reasons"])

    def test_rounding_only(self):
        cases = [
            ("29.3", "29.29", True), ("29", "29.29", True), ("29.29", "29.29", True),
            ("29.2", "29.29", False), ("30", "29.29", False), ("293", "29.29", False),
            ("2.9", "29.29", False), ("35", "35.0", True), ("35.0", "35", True),
            ("35.04", "35.0", False), ("97", "96.6", True), ("96", "96.6", False),
            ("09", "9", True), ("1,001,322", "1001322", True),
            # 반올림 방식(올림·은행가)을 가리지 않는다
            ("29.2", "29.25", True), ("29.3", "29.25", True),
        ]
        for token, ref, expected in cases:
            with self.subTest(token=token, ref=ref):
                self.assertEqual(expected, ng.number_ok(token, {Decimal(ref)}))

    def test_corpus_reads_keys_timestamps_and_names(self):
        corpus = ng.number_corpus(self.view)
        for value in ("24", "48", "2026", "9", "19", "2.1", "29.29", "1968"):
            self.assertIn(Decimal(value), corpus)

    def test_decimal_points_do_not_end_sentences(self):
        self.assertEqual(2, len(ng._sentences("값은 29.3°C 입니다. 출처는 OISST v2.1 입니다")))

    def test_confidence_window_stays_inside_the_sentence(self):
        self.assertTrue(ng.check("신뢰 등급은 HIGH입니다. 35 m/s입니다.", self.view)["passed"])
        self.assertFalse(ng.check("신뢰 등급 HIGH, 35 m/s입니다.", self.view)["passed"])

    def test_numbers_from_the_snapshot_count(self):
        snapshot = {"레이어": [{"id": "rh", "이름": "상대습도", "값": "81"}]}
        self.assertTrue(ng.check("상대습도는 81입니다.", None, snapshot=snapshot)["passed"])
        self.assertEqual(["NUMBER"], ng.check("상대습도는 81입니다.", None)["reasons"],
                         "질문·상식의 숫자는 원본이 아니다 — 스냅샷에 있어야 한다")

    def test_without_a_packet_the_packet_checks_are_inert(self):
        """패킷 없는 답(지구와 대화)도 대조한다. 빠진 절·특보 검사는 뷰가 없으니 걸릴 것이 없다."""
        snapshot = {"레이어": [{"id": "sst", "이름": "해수면 온도", "값": "29.3°C"}]}
        self.assertTrue(ng.check("해수면 온도는 29.3°C 입니다. 특보는 해제되었습니다.", None,
                                 snapshot=snapshot)["passed"])
        self.assertEqual(["CAUSAL"], ng.check("바다가 따뜻해서 강해졌다 — caused by warm water.", None,
                                              snapshot=snapshot)["reasons"])

    def test_quoted_official_may_be_a_list(self):
        view = copy.deepcopy(self.view)
        view["next"]["items"][0]["quotedOfficial"] = ["확률 60%", "chance 60%"]
        self.assertTrue(ng.check("기관 문구: 확률 60%", view)["passed"])
        self.assertTrue(ng.check("agency text: chance 60%", view, lang="en")["passed"])
        self.assertFalse(ng.check("확률은 60% 입니다", view)["passed"])

    def test_section_names_cover_every_packet_section(self):
        self.assertEqual(set(intel_contract.PACKET_SECTIONS), set(ng.SECTION_NAMES))

    def test_terminated_statuses_come_from_cap_map(self):
        self.assertEqual(frozenset({"Cancel", "RELEASED", "解除"}), ng.TERMINATED_STATUS)

    def test_unknown_warning_status_counts_as_active(self):
        """모르는 status 는 유효로 본다 — 끝났는지 모르면 끝났다고 말하지 못하게 닫는다."""
        view = {"sources": [{"id": "w", "kind": "OFFICIAL_WARNING", "status": "Actual"}]}
        self.assertEqual(["w"], ng.active_warnings(view))
        self.assertEqual(["WARNING_LIFTED"], ng.check("특보가 해제됐습니다", view)["reasons"])
        for status in ("Cancel", "RELEASED", "解除", "해제", "lifted", ""):
            with self.subTest(status=status):
                gone = {"sources": [{"id": "w", "kind": "OFFICIAL_WARNING", "status": status}]}
                self.assertEqual([], ng.active_warnings(gone))

    def test_non_string_answer_is_empty(self):
        verdict = ng.check(None, self.view)
        self.assertTrue(verdict["passed"])
        self.assertEqual("", verdict["answer"])


if __name__ == "__main__":
    unittest.main()
