# -*- coding: utf-8 -*-
"""태풍 사건 패킷 → 인텔 패킷 v1 (P1) 시험 — 2026-09-20 운영 패킷(DUJUAN-26)과 OISST 원값으로 돈다.

지키는 것
  · 운영 패킷 그대로 넣어 계약(intel_contract)을 통과한다
  · 값을 새로 계산하지 않는다 — 옮긴 값이 원본과 같다
  · 5절 중 WHAT·WHY·NEXT·IMPACT·EVIDENCE 가 재료를 갖는다(없는 절은 이유와 함께 빠진다)
  · 평년 대비는 PD 결정(계약 §I L-4) 전이라 만들지 않는다
  · 특보구역 350 km 밖이면 특보 연결을 억지로 만들지 않는다
  · 해수온이 없는 자리(육지·자료 없음)면 WHY 를 비우고 이유를 적는다
"""
import copy
import json
import os
import pathlib
import sys
import unittest
from datetime import datetime, timezone

HERE = pathlib.Path(__file__).parent
FUNC = HERE.parent
sys.path.insert(0, str(FUNC))
sys.path.insert(0, str(FUNC.parent / "_shared"))
import intel_v1  # noqa: E402
import intel_contract  # noqa: E402

PACKET = json.loads((HERE / "fixtures" / "cyclone-event-1001322-20260920.json").read_text(encoding="utf-8"))
SST = json.loads((HERE / "fixtures" / "sst-global-crop-20260920.json").read_text(encoding="utf-8"))
NOW = datetime(2026, 9, 19, 16, 0, tzinfo=timezone.utc)


class LivePacketTests(unittest.TestCase):
    def test_passes_the_contract(self):
        v1 = intel_v1.build(PACKET, NOW, SST)
        self.assertEqual([], intel_contract.validate(v1))
        self.assertEqual("hazards.typhoon", v1["phenomenonId"])
        self.assertEqual("cyclone:1001322", v1["eventId"])

    def test_values_are_copied_not_computed(self):
        v1 = intel_v1.build(PACKET, NOW, SST)
        cur = {v["key"]: v for v in v1["current"]["values"]}
        lo = PACKET["detail"]["latestObserved"]
        self.assertEqual(lo["windMs"], cur["maxWind"]["value"])
        self.assertEqual("m/s", cur["maxWind"]["unit"])
        self.assertEqual("JMA 실황", cur["maxWind"]["source"])
        self.assertEqual(lo["at"], cur["maxWind"]["at"])
        ch = v1["change"]["items"][0]
        self.assertEqual(PACKET["detail"]["intensity"]["trend"]["deltaMs"], ch["delta"])
        self.assertEqual(lo["windMs"], ch["to"])

    def test_four_intel_sections_have_material(self):
        v1 = intel_v1.build(PACKET, NOW, SST)
        st = {s: intel_contract.section_status(v1, s)["status"] for s in ("WHAT", "WHY", "NEXT", "IMPACT", "EVIDENCE")}
        self.assertEqual({"WHAT": "available", "WHY": "available", "NEXT": "available",
                          "IMPACT": "available", "EVIDENCE": "available"}, st)

    def test_condition_is_the_grid_value_under_the_centre(self):
        v1 = intel_v1.build(PACKET, NOW, SST)
        cond = v1["conditions"][0]
        self.assertEqual("sstAtCenter", cond["key"])
        self.assertEqual(29.29, cond["value"], "2026-09-17 OISST 27.9N 138.4E 칸 원값")
        self.assertEqual("OFFICIAL_OBSERVATION", cond["kind"])

    def test_next_is_agency_quotes_only(self):
        v1 = intel_v1.build(PACKET, NOW, SST)
        kinds = {(i["type"], i["kind"]) for i in v1["next"]["items"]}
        self.assertTrue(kinds <= {("A", "OFFICIAL_FORECAST"), ("A", "PROVIDER_FORECAST")}, kinds)
        self.assertIn(("A", "OFFICIAL_FORECAST"), kinds)
        # 우리 다중소스 계산은 기관 인용이 아니다 — 제공자 예보(A)로 둔갑하면 안 된다
        self.assertFalse([i for i in v1["next"]["items"] if "EARTHUS" in str(i.get("source"))],
                         "EARTHUS 자체 계산이 유형 A 로 실렸다")

    def test_anomaly_waits_for_pd_decision(self):
        v1 = intel_v1.build(PACKET, NOW, SST)
        self.assertNotIn("anomaly", v1)
        reason = [m["reason"] for m in v1["coverage"]["missing"] if m["section"] == "anomaly"][0]
        self.assertIn("L-4", reason)

    def test_confidence_names_its_rule(self):
        v1 = intel_v1.build(PACKET, NOW, SST)
        self.assertEqual("HIGH", v1["confidence"]["grade"])
        self.assertEqual(intel_v1.CONFIDENCE_FORMULA, v1["confidence"]["inputs"]["formula_id"])
        self.assertEqual({"grade": "HIGH"}, intel_contract.narrator_view(v1)["confidence"])


class HonestyTests(unittest.TestCase):
    def test_no_warning_link_outside_350km(self):
        v1 = intel_v1.build(PACKET, NOW, SST)       # DUJUAN: nearestWarnRegionKm = null
        self.assertNotIn("weather.warning", [r["phenomenonId"] for r in v1["related"]])

    def test_warning_link_inside_350km(self):
        p = copy.deepcopy(PACKET)
        p["importance"]["inputs"]["nearestWarnRegionKm"] = 210
        v1 = intel_v1.build(p, NOW, SST)
        rel = [r for r in v1["related"] if r["phenomenonId"] == "weather.warning"][0]
        self.assertEqual("co_located", rel["relation"])
        self.assertEqual(210, rel["evidence"]["distanceKm"])

    def test_no_sst_means_no_why(self):
        v1 = intel_v1.build(PACKET, NOW, {})
        self.assertNotIn("conditions", v1)
        self.assertEqual("not_available", intel_contract.section_status(v1, "WHY")["status"])
        self.assertEqual([], intel_contract.validate(v1))

    def test_land_cell_is_not_filled_from_neighbours(self):
        grid ={"res": 1.0, "lat0": 0.0, "lon0": 0.0, "nx": 2, "ny": 1, "sst": [None, 28.0]}
        self.assertIsNone(intel_v1.sst_at(grid, 0.0, 0.0))
        self.assertEqual(28.0, intel_v1.sst_at(grid, 0.0, 1.0))

    def test_broken_packet_raises_instead_of_half_writing(self):
        p = copy.deepcopy(PACKET)
        p["detail"] = {}
        p["confidence"] = {}
        p["uncertainty"] = None
        p["importance"] = None
        with self.assertRaises(intel_contract.IntelContractError):
            intel_v1.build(p, NOW, {})


class WiringTests(unittest.TestCase):
    def test_handler_attaches_intel_beside_the_legacy_packet(self):
        src = (FUNC / "handler.py").read_text(encoding="utf-8")
        self.assertIn('packet["intel"] = intel_v1.build(packet, now, sst_doc)', src)
        self.assertIn('packet["intel"] = None', src, "실패하면 intel 만 비우고 옛 패킷은 나가야 한다")


if __name__ == "__main__":
    unittest.main()
