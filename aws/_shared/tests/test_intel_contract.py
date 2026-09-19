# -*- coding: utf-8 -*-
"""인텔 패킷 v1 계약 시험 (계약 §C · §J-1~3).

지키는 것
  · 어휘는 한 파일(contracts/intel-vocab.json)이고, 기존 사본(report_contract)과 같다
  · J-1 단위·종류·출처·시각 없는 값 거부 / J-2 산식 없는 confidence 는 절째 빼고 missing 에
    / J-3 조건·연결·NEXT 에 인과 어휘 거부
  · 절은 '있다' 와 'missing 에 이유' 중 정확히 하나
  · 서술자에게는 confidence 등급만 넘어간다 (§C-1)
  · 내보낸 JSON Schema 가 코드와 어긋나지 않는다
  · 패키저가 어휘 파일을 zip 에 같이 넣는다 (넣지 않으면 콜드 스타트에서 죽는다)
"""
import copy
import json
import pathlib
import sys
import unittest

SHARED = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(SHARED))
import intel_contract as ic  # noqa: E402
import report_contract  # noqa: E402
import lambda_package as lp  # noqa: E402

AT = "2026-09-20T00:00:00Z"
SRC = "KMA 태풍 정보"


def packet(**over):
    """태풍 패킷 표본 — 모든 절이 '있다' 또는 'missing 에 이유' 중 하나."""
    p = {
        "schema": 1, "phenomenonId": "hazards.typhoon", "eventId": "cyclone:2026-14",
        "time": {"observedAt": AT, "issuedAt": AT, "retrievedAt": AT},
        "current": {"values": [
            {"key": "centralPressure", "value": 965, "unit": "hPa", "kind": "OFFICIAL_OBSERVATION", "source": SRC, "at": AT},
            {"key": "maxWind", "value": 35, "unit": "m/s", "kind": "OFFICIAL_OBSERVATION", "source": SRC, "at": AT},
        ]},
        "change": {"windows": {"6h": True}, "items": [
            {"key": "centralPressure", "delta": -10, "from": 975, "to": 965, "unit": "hPa",
             "kind": "OFFICIAL_OBSERVATION", "source": SRC, "at": AT},
        ]},
        "conditions": [
            {"key": "sstUnderTrack", "value": 28.4, "unit": "°C", "kind": "OFFICIAL_OBSERVATION", "source": "NOAA OISST"},
        ],
        "related": [
            {"phenomenonId": "weather.warnings", "relation": "co_located",
             "evidence": {"rule": "특보구역 ≤350 km", "distanceKm": 120}},
        ],
        "next": {"items": [
            {"type": "A", "kind": "OFFICIAL_FORECAST", "source": "KMA 예보", "issuedAt": AT, "text": "+24h 예보 위치"},
        ]},
        "importance": {"reasons": ["한국 특보구역 350 km 이내"], "inputs": {}, "note": "점수 아님"},
        "confidence": {"grade": "MEDIUM", "inputs": {"formula_id": "agency-agreement.v1", "agencies": 3}},
        "sources": [{"id": "kma-typhoon", "kind": "OFFICIAL_OBSERVATION", "ageMin": 40, "slaMin": 180, "state": "fresh"}],
        "coverage": {"missing": [
            {"section": "anomaly", "reason": "IBTrACS 백분위는 P1 에서 계산한다"},
            {"section": "pattern", "reason": "회차가 2개 미만"},
            {"section": "uncertainty", "reason": "기관 예보원 편차 자료 없음"},
        ]},
    }
    p.update(over)
    return p


class VocabularyTests(unittest.TestCase):
    def test_one_file_both_languages_read(self):
        self.assertEqual(10, len(ic.EVIDENCE_KIND))
        self.assertEqual(9, len(ic.FORBIDDEN_CAUSAL))
        self.assertEqual(("HIGH", "MEDIUM", "LOW", "UNKNOWN"), ic.CONFIDENCE_GRADE)
        self.assertEqual(("computed", "co_located", "reference"), ic.RELATION)

    def test_existing_python_copy_matches(self):
        """report_contract 의 사본이 정본과 다르면 두 개의 진실이다."""
        self.assertEqual(tuple(report_contract.FORBIDDEN_CAUSAL), ic.FORBIDDEN_CAUSAL)

    def test_next_types_only_allow_their_kinds(self):
        self.assertEqual({"A", "B", "C", "D"}, set(ic.NEXT_TYPE))
        self.assertEqual(["SIMULATION"], ic.NEXT_TYPE["C"]["kinds"])
        for t in ic.NEXT_TYPE.values():
            for k in t["kinds"]:
                self.assertIn(k, ic.EVIDENCE_KIND)

    def test_intel_five_sections_cover_packet(self):
        self.assertEqual(["WHY", "WHAT", "NEXT", "IMPACT", "EVIDENCE"], list(ic.INTEL_SECTIONS))
        self.assertNotIn("REPORT", ic.INTEL_SECTIONS, "REPORT 는 EXPLORER 발행물이지 5절이 아니다")


class ValidPacketTests(unittest.TestCase):
    def test_sample_passes(self):
        fixed, errors = ic.check(packet(), known_phenomena={"hazards.typhoon", "weather.warnings"})
        self.assertEqual([], errors)
        self.assertEqual(fixed, packet(), "통과한 패킷은 수리되지 않는다")

    def test_require_valid_returns_the_packet(self):
        self.assertEqual("hazards.typhoon", ic.require_valid(packet())["phenomenonId"])


class RejectTests(unittest.TestCase):
    def assertRejected(self, p, fragment):
        errors = ic.validate(ic.normalize(p))
        self.assertTrue(any(fragment in e for e in errors), "%r 를 기대했다: %s" % (fragment, errors))
        with self.assertRaises(ic.IntelContractError):
            ic.require_valid(p)

    def test_j1_value_without_unit(self):
        p = packet()
        del p["current"]["values"][0]["unit"]
        self.assertRejected(p, "unit")

    def test_j1_value_without_time(self):
        p = packet()
        p["current"]["values"][0]["at"] = "어제"
        self.assertRejected(p, ".at")

    def test_j1_kind_outside_vocabulary(self):
        p = packet()
        p["current"]["values"][0]["kind"] = "MODEL"
        self.assertRejected(p, "EVIDENCE_KIND")

    def test_j3_causal_word_in_conditions(self):
        p = packet()
        p["conditions"][0]["note"] = "높은 수온 때문에 강해졌다"
        self.assertRejected(p, "J-3")

    def test_j3_causal_word_in_related_english(self):
        p = packet()
        p["related"][0]["evidence"]["text"] = "warm water Causes intensification"
        self.assertRejected(p, "J-3")

    def test_null_section_is_not_allowed(self):
        self.assertRejected(packet(anomaly=None), "null")

    def test_absent_section_needs_a_reason(self):
        p = packet()
        p["coverage"]["missing"] = [m for m in p["coverage"]["missing"] if m["section"] != "pattern"]
        self.assertRejected(p, "pattern 가 없는데")

    def test_section_cannot_be_both_present_and_missing(self):
        p = packet()
        p["coverage"]["missing"].append({"section": "current", "reason": "x"})
        self.assertRejected(p, "missing 에도")

    def test_empty_next_card_is_forbidden(self):
        p = packet()
        p["next"] = {"items": []}
        self.assertRejected(p, "빈 NEXT")

    def test_next_simulation_needs_run_ref(self):
        p = packet()
        p["next"]["items"] = [{"type": "C", "kind": "SIMULATION", "source": "tsunami-eta", "issuedAt": AT}]
        self.assertRejected(p, "runRef")

    def test_next_type_a_cannot_carry_simulation(self):
        p = packet()
        p["next"]["items"][0]["kind"] = "SIMULATION"
        self.assertRejected(p, "허용하지 않는다")

    def test_importance_is_not_a_score(self):
        p = packet()
        p["importance"]["score"] = 0.8
        self.assertRejected(p, "점수")

    def test_unknown_top_level_field(self):
        self.assertRejected(packet(riskScore=3), "계약에 없는 칸")

    def test_sources_are_required(self):
        self.assertRejected(packet(sources=[]), "sources")

    def test_retrieved_at_is_required(self):
        self.assertRejected(packet(time={"observedAt": AT}), "retrievedAt")

    def test_unknown_phenomenon_when_registry_given(self):
        errors = ic.validate(packet(phenomenonId="hazards.meteor"), known_phenomena={"hazards.typhoon"})
        self.assertTrue(any("정본 레지스트리" in e for e in errors))


class RepairTests(unittest.TestCase):
    def test_j2_confidence_without_formula_moves_to_missing(self):
        p = packet()
        p["confidence"] = {"grade": "HIGH", "inputs": {"agencies": 3}}
        fixed, errors = ic.check(p)
        self.assertEqual([], errors)
        self.assertNotIn("confidence", fixed)
        self.assertIn("confidence", {m["section"] for m in fixed["coverage"]["missing"]})
        self.assertIn("confidence", p, "원본은 고치지 않는다")

    def test_repair_is_idempotent(self):
        p = packet()
        p["confidence"] = {"grade": "HIGH", "inputs": {}}
        once = ic.normalize(p)
        self.assertEqual(once, ic.normalize(once))


class SectionStatusTests(unittest.TestCase):
    def test_no_packet_is_not_evaluable(self):
        self.assertEqual("not_evaluable", ic.section_status(None, "WHY")["status"])

    def test_present_section_is_available(self):
        for s in ("WHY", "WHAT", "NEXT", "IMPACT", "EVIDENCE"):
            self.assertEqual("available", ic.section_status(packet(), s)["status"], s)

    def test_missing_section_carries_the_reason(self):
        p = packet()
        del p["next"]
        p["coverage"]["missing"].append({"section": "next", "reason": "공식 예보 없음"})
        st = ic.section_status(p, "NEXT")
        self.assertEqual("not_available", st["status"])
        self.assertEqual("공식 예보 없음", st["reason"])


class NarratorViewTests(unittest.TestCase):
    def test_only_grade_reaches_the_narrator(self):
        view = ic.narrator_view(packet())
        self.assertEqual({"grade": "MEDIUM"}, view["confidence"])
        self.assertNotIn("coverage", view)
        self.assertEqual(["anomaly", "pattern", "uncertainty"], view["missingSections"])

    def test_invalid_packet_never_reaches_the_narrator(self):
        with self.assertRaises(ic.IntelContractError):
            ic.narrator_view(packet(conditions=[{"key": "x", "value": 1, "kind": "HISTORY",
                                                 "source": "s", "note": "초래"}]))


class SchemaExportTests(unittest.TestCase):
    def test_exported_schema_matches_code(self):
        on_disk = json.loads(pathlib.Path(ic.SCHEMA_PATH).read_text(encoding="utf-8"))
        self.assertEqual(ic.json_schema(), on_disk,
                         "contracts/intel-packet-v1.schema.json 이 낡았다 — "
                         "python aws/_shared/intel_contract.py --export-schema")


class PackagingTests(unittest.TestCase):
    def test_packager_ships_the_vocabulary_file(self):
        """넣지 않으면 import 시점에 IntelContractError 로 콜드 스타트가 죽는다."""
        found = lp.module_data_files([str(SHARED / "intel_contract.py")])
        self.assertIn("contracts/intel-vocab.json", {k.replace("\\", "/") for k in found})


if __name__ == "__main__":
    unittest.main()
