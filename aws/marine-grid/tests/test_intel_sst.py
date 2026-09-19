# -*- coding: utf-8 -*-
"""해수면 온도 → 인텔 패킷 v1 (P3) 시험 — 2026-09-20 earthus.net 공개 문서 두 개의 원값으로 돈다.

fixtures/
  sst-global-crop-korea-20260920.json    https://earthus.net/ocean/sst-global.json  (OISST 1°, 관측일 2026-09-17)
  sst-anom-ea-crop-korea-20260920.json   https://earthus.net/ocean/sst-anom-ea.json (marine-ea, 같은 관측일)
  둘 다 한국 주변 상자(30.125–41.125°N, 120.125–135.125°E)만 남겼다. 값은 원문 그대로다(_fixture 칸에 적었다).

지키는 것
  · 공개 문서 그대로 넣어 계약(intel_contract)을 통과한다
  · 값을 새로 계산하지 않는다 — 옮긴 값이 원본 격자칸과 같다
  · 평년 대비는 NOAA 가 발표한 평년(1991–2020)에서 온 것만, 같은 관측일일 때만 싣는다. 백분위·평균은 없다
  · 만들 재료가 없는 절(change·pattern·conditions·next …)은 이유와 함께 빠진다
  · 인과 어휘가 패킷 어디에도 없다
  · 연결(related)은 phenomenon-relations.js 연결표에 있는 것뿐이다
"""
import copy
import importlib.util
import json
import os
import pathlib
import re
import sys
import types
import unittest
from datetime import datetime, timezone

HERE = pathlib.Path(__file__).parent
FUNC = HERE.parent
AWS = FUNC.parent
REPO = AWS.parent
sys.path.insert(0, str(FUNC))
sys.path.insert(0, str(AWS / "_shared"))
import intel_sst  # noqa: E402
import intel_contract  # noqa: E402
import lambda_package  # noqa: E402
import phenomenon_registry  # noqa: E402

SST = json.loads((HERE / "fixtures" / "sst-global-crop-korea-20260920.json").read_text(encoding="utf-8"))
ANOM = json.loads((HERE / "fixtures" / "sst-anom-ea-crop-korea-20260920.json").read_text(encoding="utf-8"))
NOW = datetime(2026, 9, 20, 3, 0, tzinfo=timezone.utc)
KNOWN = set(phenomenon_registry.phenomenon_ids())


def relation_rows():
    """phenomenon-relations.js 의 (from, to, relation) — JS 를 베껴 적지 않고 읽는다."""
    src = (REPO / "prototype" / "v2-three" / "js" / "phenomenon-relations.js").read_text(encoding="utf-8")
    return set(re.findall(r"from:\s*'([^']+)',\s*to:\s*'([^']+)',\s*relation:\s*'([^']+)'", src))


class LivePacketTests(unittest.TestCase):
    def setUp(self):
        self.v1 = intel_sst.build(SST, NOW, ANOM)

    def test_passes_the_contract(self):
        self.assertEqual([], intel_contract.validate(self.v1, known_phenomena=KNOWN))
        self.assertEqual("ocean.sst", self.v1["phenomenonId"])
        self.assertIsNone(self.v1["eventId"])
        self.assertEqual("2026-09-17T00:00:00Z", self.v1["time"]["observedAt"])

    def test_current_values_are_the_grid_cells(self):
        cur = {v["key"]: v for v in self.v1["current"]["values"]}
        self.assertEqual({"sstEastSea", "sstYellowSea", "sstSouthSea"}, set(cur))
        # 2026-09-17 OISST 원값 (37.125N 130.125E · 36.125N 124.125E · 34.125N 128.125E)
        self.assertEqual(25.29, cur["sstEastSea"]["value"])
        self.assertEqual(25.36, cur["sstYellowSea"]["value"])
        self.assertEqual(26.4, cur["sstSouthSea"]["value"])
        for v in cur.values():
            self.assertEqual("OFFICIAL_OBSERVATION", v["kind"])
            self.assertEqual("°C", v["unit"])
            self.assertEqual(SST["observed"], v["at"])
            self.assertEqual(intel_sst.cell_value(SST, "sst", v["lat"], v["lon"]), v["value"])
            self.assertIn("평균이 아니다", v["noteKo"])

    def test_anomaly_is_noaa_normal_not_ours(self):
        ano = self.v1["anomaly"]
        self.assertEqual("1991-2020", ano["baseline"]["period"])
        self.assertIn("NOAA", ano["baseline"]["source"])
        items = {i["key"]: i for i in ano["items"]}
        # marine-ea 가 공개한 sstAnom 원값을 그대로 옮겼다
        self.assertEqual(2.04, items["sstEastSea"]["delta"])
        self.assertEqual(1.57, items["sstYellowSea"]["delta"])
        self.assertEqual(1.42, items["sstSouthSea"]["delta"])
        for i in items.values():
            self.assertAlmostEqual(i["value"] - i["delta"], i["baseline"], places=2)
            self.assertEqual(intel_sst.cell_value(ANOM, "sstAnom", i["lat"], i["lon"]), i["delta"])
            self.assertNotIn("percentile", i, "백분위는 EARTHUS 기준선 계산이다 — L-4 결정 전에는 싣지 않는다")
        self.assertIn("동아시아", ano["coverageKo"])

    def test_sections(self):
        st = {s: intel_contract.section_status(self.v1, s)["status"] for s in ("WHAT", "WHY", "NEXT", "IMPACT", "EVIDENCE")}
        self.assertEqual({"WHAT": "available", "WHY": "not_available", "NEXT": "not_available",
                          "IMPACT": "available", "EVIDENCE": "available"}, st)
        missing = {m["section"] for m in self.v1["coverage"]["missing"]}
        self.assertEqual({"change", "pattern", "conditions", "next", "importance", "confidence", "uncertainty"}, missing)
        self.assertIn("P2a", [m["reason"] for m in self.v1["coverage"]["missing"] if m["section"] == "change"][0])

    def test_related_only_from_the_relation_table(self):
        rows = relation_rows()
        for r in self.v1["related"]:
            pair = {(self.v1["phenomenonId"], r["phenomenonId"], r["relation"]),
                    (r["phenomenonId"], self.v1["phenomenonId"], r["relation"])}
            self.assertTrue(pair & rows, "연결표에 없는 연결: %r" % (r,))
        self.assertEqual("reference", self.v1["related"][0]["relation"])
        self.assertIn("Gray", self.v1["related"][0]["evidence"]["citation"])

    def test_no_causal_words_anywhere(self):
        hits = [(t, intel_contract.causal_hits(t)) for t in intel_contract._strings(self.v1) if intel_contract.causal_hits(t)]
        self.assertEqual([], hits)

    def test_sources_carry_sla(self):
        src = {s["id"]: s for s in self.v1["sources"]}
        self.assertEqual(1440, src["noaa-oisst-v2.1"]["slaMin"])
        self.assertEqual(2880, src["noaa-oisst-v2.1-ltm-1991-2020"]["slaMin"])
        # 관측일 2026-09-17 00Z → 2026-09-20 03Z 는 1440분을 넘었다 — 숨기지 않는다
        self.assertEqual("aging", src["noaa-oisst-v2.1"]["state"])

    def test_narrator_view_drops_missing_sections(self):
        view = intel_contract.narrator_view(self.v1)
        self.assertNotIn("change", view)
        self.assertIn("anomaly", view)
        self.assertIn("next", view["missingSections"])


class HonestyTests(unittest.TestCase):
    def test_other_day_anomaly_is_not_mixed_in(self):
        other = copy.deepcopy(ANOM)
        other["observed"] = "2026-09-18T00:00:00Z"
        v1 = intel_sst.build(SST, NOW, other)
        self.assertNotIn("anomaly", v1)
        reason = [m["reason"] for m in v1["coverage"]["missing"] if m["section"] == "anomaly"][0]
        self.assertIn("2026-09-18", reason)
        self.assertIn("2026-09-17", reason)
        self.assertEqual([], intel_contract.validate(v1))

    def test_no_anomaly_doc(self):
        v1 = intel_sst.build(SST, NOW, None)
        self.assertNotIn("anomaly", v1)
        self.assertEqual([], intel_contract.validate(v1))
        self.assertEqual(["noaa-oisst-v2.1"], [s["id"] for s in v1["sources"]])

    def test_normal_without_period_is_refused(self):
        bad = copy.deepcopy(ANOM)
        bad.pop("period")
        self.assertNotIn("anomaly", intel_sst.build(SST, NOW, bad))

    def test_disagreeing_cell_is_dropped(self):
        bad = copy.deepcopy(ANOM)
        iy = round((37.125 - bad["lat0"]) / bad["res"])
        ix = round((130.125 - bad["lon0"]) / bad["res"])
        bad["sst"][iy * bad["nx"] + ix] += 1.0
        keys = [i["key"] for i in intel_sst.build(SST, NOW, bad)["anomaly"]["items"]]
        self.assertNotIn("sstEastSea", keys)
        self.assertIn("sstYellowSea", keys)

    def test_cell_must_be_exact(self):
        self.assertIsNone(intel_sst.cell_value(SST, "sst", 37.0, 130.125), "칸 중심이 아니면 가까운 칸으로 바꿔 읽지 않는다")
        grid = {"res": 1.0, "lat0": 0.125, "lon0": 0.125, "nx": 2, "ny": 1, "sst": [None, 28.0]}
        self.assertIsNone(intel_sst.cell_value(grid, "sst", 0.125, 0.125), "육지 칸을 이웃으로 메우지 않는다")
        self.assertEqual(28.0, intel_sst.cell_value(grid, "sst", 0.125, 1.125))

    def test_no_observation_means_no_packet(self):
        with self.assertRaises(intel_contract.IntelContractError):
            intel_sst.build({**SST, "observed": None}, NOW, ANOM)
        with self.assertRaises(intel_contract.IntelContractError):
            intel_sst.build({**SST, "sst": [None] * len(SST["sst"])}, NOW, ANOM)


class WiringTests(unittest.TestCase):
    def _handler(self, get_object):
        client = types.SimpleNamespace(get_object=get_object, put_object=lambda **kw: None)
        fake = types.ModuleType("boto3")
        fake.client = lambda *a, **k: client
        saved = sys.modules.get("boto3")
        sys.modules["boto3"] = fake
        os.environ.setdefault("CACHE_BUCKET", "test-bucket")
        try:
            spec = importlib.util.spec_from_file_location("marine_grid_handler_under_test", FUNC / "handler.py")
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
        finally:
            if saved is not None:
                sys.modules["boto3"] = saved
            else:
                sys.modules.pop("boto3", None)
        return mod

    def test_attach_intel_reads_the_public_anomaly_doc(self):
        seen = []

        def get_object(Bucket, Key):
            seen.append(Key)
            return {"Body": types.SimpleNamespace(read=lambda: json.dumps(ANOM).encode())}
        mod = self._handler(get_object)
        doc = mod.attach_intel(copy.deepcopy(SST), NOW)
        self.assertEqual(["ocean/sst-anom-ea.json"], seen)
        self.assertEqual("ocean.sst", doc["intel"]["phenomenonId"])
        self.assertIn("anomaly", doc["intel"])
        self.assertEqual(SST["sst"], doc["sst"], "격자는 그대로 나간다")

    def test_unreadable_anomaly_doc_only_empties_that_section(self):
        def get_object(Bucket, Key):
            raise RuntimeError("AccessDenied")
        doc = self._handler(get_object).attach_intel(copy.deepcopy(SST), NOW)
        self.assertNotIn("anomaly", doc["intel"])
        self.assertIn("current", doc["intel"])

    def test_contract_failure_leaves_intel_null_and_grid_intact(self):
        def get_object(Bucket, Key):
            return {"Body": types.SimpleNamespace(read=lambda: json.dumps(ANOM).encode())}
        broken = copy.deepcopy(SST)
        broken["observed"] = None
        doc = self._handler(get_object).attach_intel(broken, NOW)
        self.assertIsNone(doc["intel"])
        self.assertEqual(SST["sst"], doc["sst"])

    def test_handler_attaches_before_writing(self):
        src = (FUNC / "handler.py").read_text(encoding="utf-8")
        attach = src.index("attach_intel(sst, datetime.now(timezone.utc))")
        write = src.index('Key="ocean/sst-global.json"')
        self.assertLess(attach, write, "패킷을 실은 뒤에 써야 한다")
        self.assertIn('sst["intel"] = None', src, "실패하면 intel 만 비우고 격자는 나가야 한다")

    def test_lambda_zip_carries_the_contract(self):
        plan = lambda_package.plan(str(FUNC), str(AWS / "_shared"))
        self.assertIn("intel_sst.py", plan["topLevelModules"])
        self.assertIn("intel_contract", plan["sharedModules"])
        self.assertIn("contracts/intel-vocab.json", plan["dataFiles"])


if __name__ == "__main__":
    unittest.main()
