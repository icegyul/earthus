# -*- coding: utf-8 -*-
"""INTEGRATION-1 — 정본 하나 규칙 · 캡처 · 단일 팩트 (§2 · §8 · §16 · §29 · §31).

§29 의 규칙을 지킨다: 개수·객체 전체 모양·UI 문구 전문을 못박지 않는다.
불변식만 본다 — "정본이 하나인가", "레이어 키가 진짜인가", "숫자가 두 번 계산되지 않는가".
"""
import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.dirname(HERE)
AWS = os.path.dirname(ENGINE)
sys.path.insert(0, ENGINE)
sys.path.insert(0, os.path.join(ENGINE, "adapters"))
sys.path.insert(0, os.path.join(AWS, "_shared"))

import phenomenon_registry as reg    # noqa: E402
import capture as cap                # noqa: E402
import climate_series_adapter as cs  # noqa: E402
import typhoon_adapter as ty         # noqa: E402
import compose as cp                 # noqa: E402


# ── §2 정본은 하나 ───────────────────────────────────────────────────────────
class SingleSourceOfTruth(unittest.TestCase):
    def test_파이썬이_읽은_레지스트리가_정본과_같은_수다(self):
        """JS 레지스트리가 정본이다. 파이썬은 **읽을** 뿐 베끼지 않는다.

        수가 어긋나면 파서가 조용히 일부를 놓친 것이다 — 그러면 '레이어를 못 찾았다'가
        '그런 레이어는 없다'로 둔갑한다.
        """
        c = reg.counts()
        self.assertEqual(c["layers"], 109)
        self.assertEqual(c["phenomena"], 66)
        self.assertEqual(c["layers"], c["withPhenomenon"] + c["entrypoints"])

    def test_어댑터가_레이어_키를_손으로_적지_않는다(self):
        """PHASE 8 이 'ocean/sst' 라고 적어 뒀는데 진짜는 'ocean/sstfield' 였다."""
        for ds in cs.DATASETS:
            for key in cs.layer_refs_for(ds):
                self.assertTrue(reg.is_known_layer(key),
                                "%s 가 레지스트리에 없는 레이어를 가리킨다: %s" % (ds, key))

    def test_태풍_어댑터도_레지스트리를_따른다(self):
        key = reg.representative_layer_for(ty.PHENOMENON)
        self.assertTrue(reg.is_known_layer(key))

    def test_기간_계산은_한_곳에서만_한다(self):
        """report_period 가 정본이다. 다른 모듈이 달력 산술을 다시 만들면 안 된다."""
        import report_period as rp
        self.assertEqual(rp.next_period("2026-12"), "2027-01")
        self.assertEqual(rp.previous_period("2026-Q1"), "2025-Q4")


# ── §8 · §31 지구 캡처 ───────────────────────────────────────────────────────
class EarthCapture(unittest.TestCase):
    def _fact(self, phen="ocean.sst"):
        return {"factId": "fact:2026-08:x", "phenomenonId": phen, "period": "2026-08",
                "layerRefs": cs.layer_refs_for("sst"), "evidenceRefs": ["ocean/series/sst-daily.json"]}

    def test_높이와_거리가_서로의_역함수다(self):
        """main.js 는 altKm = (dist-1)*6371 로 쓴다. 어긋나면 카메라가 엉뚱한 데 선다."""
        for km in (400, 1200, 8000, 24000):
            self.assertAlmostEqual(cap.height_km_for_dist(cap.dist_for_height_km(km)), km, delta=1.0)

    def test_링크가_v2_문법을_따른다(self):
        req = cap.request_for_fact(self._fact())
        self.assertTrue(req["link"].startswith("#v=1&at="))
        self.assertIn("live=", req["link"])

    def test_복합키를_맨_id_로_바꿔_링크에_넣는다(self):
        """링크의 live= 는 맨 id 를 받는다(live-layers.activeIds)."""
        self.assertEqual(cap.layer_ids_for(["ocean/sstfield", "weather/tempgrid"]),
                         ["sstfield", "tempgrid"])

    def test_레이어가_안_켜졌으면_확인_실패다(self):
        req = cap.request_for_fact(self._fact())
        v = cap.verify_capture(req, {"ready": True, "activeIds": [], "lat": 20, "lon": 130,
                                     "dist": cap.dist_for_height_km(24000)})
        self.assertFalse(v["verified"])

    def test_카메라가_다르면_확인_실패다(self):
        req = cap.request_for_fact(self._fact())
        v = cap.verify_capture(req, {"ready": True, "activeIds": ["sstfield", "sstanom"],
                                     "lat": -40, "lon": 130,
                                     "dist": cap.dist_for_height_km(24000)})
        self.assertFalse(v["verified"])
        self.assertTrue(any("위도" in p for p in v["problems"]))

    def test_경도는_180도에서_감기는_것을_오차로_세지_않는다(self):
        req = cap.request_for_fact(self._fact(), geometry={"type": "point", "lat": 0, "lon": 179.9})
        obs = {"ready": True, "activeIds": req["liveIds"],
               "lat": req["camera"]["lat"], "lon": -179.9,
               "dist": cap.dist_for_height_km(req["camera"]["heightKm"])}
        # INTEGRATION-2 — 확인은 이제 여섯 조건이다. 카메라 축만 보려면 나머지를 채워 준다.
        doc = {"observed": obs, "link": req["link"], "fileHash": "sha256:x",
               "sourceRoute": "http://x", "capturedAt": "t",
               "pixelCheck": {"passed": True, "stdev": 40},
               "readBack": {"hashMatches": True, "decoded": {"ok": True}}}
        v = cap.verify_capture(req, obs, capture_doc=doc)
        self.assertTrue(v["verified"], v["problems"])

    def test_확인_실패한_캡처도_버리지_않고_남긴다(self):
        req = cap.request_for_fact(self._fact())
        v = {"verified": False, "problems": ["레이어가 안 켜졌다"], "observed": {}}
        meta = cap.asset_metadata(req, asset_id="a1", captured_at="2026-09-08T00:00:00Z",
                                  dataset_snapshot="snap:1", verification=v)
        self.assertFalse(meta["verified"])
        self.assertTrue(meta["verificationProblems"])

    def test_캡처가_어느_팩트의_것인지_되짚을_수_있다(self):
        req = cap.request_for_fact(self._fact())
        meta = cap.asset_metadata(req, asset_id="a1", captured_at="2026-09-08T00:00:00Z",
                                  dataset_snapshot="snap:1",
                                  verification={"verified": True, "problems": [], "observed": {}})
        self.assertIn("fact:2026-08:x", meta["factRefs"])
        self.assertEqual(meta["phenomenonId"], "ocean.sst")
        self.assertTrue(meta["sourceRefs"])

    def test_링크에_시각이_없다는_사실을_숨기지_않는다(self):
        hint = cap.period_time_hint("2026-08")
        self.assertFalse(hint["timeInLink"])
        self.assertTrue(hint["note"])


# ── §16 단일 팩트 규칙 ───────────────────────────────────────────────────────
class SingleFactRule(unittest.TestCase):
    def setUp(self):
        sys.path.insert(0, ENGINE)
        import integration_e2e as e2e
        self.e2e = e2e

    def _report(self):
        return {
            "reportId": "report:2026-08",
            "period": {"from": "2026-08-01", "to": "2026-08-31"},
            "phenomenonIds": ["ocean.sst"],
            "facts": [{"factId": "f1", "phenomenonId": "ocean.sst", "value": 1.5,
                       "sampleCount": 31, "evidenceRefs": ["ocean/series/sst-daily.json"],
                       "comparison": {"anomaly": 0.737}}],
        }

    def _content(self, **over):
        base = {
            "reportIds": ["report:2026-08"],
            "phenomenonIds": ["ocean.sst"],
            "observationPeriod": {"from": "2026-08-01", "to": "2026-08-31"},
            "datasetRefs": ["ocean/series/sst-daily.json"],
            "numericPool": [1.5, 31, 0.737],
        }
        base.update(over)
        return base

    def test_같은_숫자만_쓰면_통과한다(self):
        out = self.e2e.compare_report_and_content(self._report(), self._content())
        self.assertTrue(out["ok"], out["problems"])

    def test_리포트에_없는_숫자를_쓰면_막는다(self):
        out = self.e2e.compare_report_and_content(
            self._report(), self._content(numericPool=[1.5, 31, 99.9]))
        self.assertFalse(out["ok"])

    def test_기간이_다르면_막는다(self):
        out = self.e2e.compare_report_and_content(
            self._report(), self._content(observationPeriod={"from": "2026-07-01", "to": "2026-07-31"}))
        self.assertFalse(out["ok"])

    def test_리포트에_없는_현상을_가리키면_막는다(self):
        out = self.e2e.compare_report_and_content(
            self._report(), self._content(phenomenonIds=["ocean.sst", "hazards.typhoon"]))
        self.assertFalse(out["ok"])

    def test_원본_리포트를_안_가리키면_막는다(self):
        out = self.e2e.compare_report_and_content(self._report(), self._content(reportIds=[]))
        self.assertFalse(out["ok"])

    def test_리포트_근거에_없는_출처를_쓰면_막는다(self):
        out = self.e2e.compare_report_and_content(
            self._report(), self._content(datasetRefs=["wind/made-up.json"]))
        self.assertFalse(out["ok"])


# ── §29 배포 검증기의 참값 구멍 ──────────────────────────────────────────────
class DistributionValidator(unittest.TestCase):
    def setUp(self):
        import importlib.util
        p = os.path.join(AWS, "distribution", "validation.py")
        sys.path.append(os.path.join(AWS, "distribution"))
        spec = importlib.util.spec_from_file_location("earthus_validation_t", p)
        self.val = importlib.util.module_from_spec(spec)
        sys.modules["earthus_validation_t"] = self.val
        spec.loader.exec_module(self.val)

    def test_참값은_숫자_풀에_들어가지_않는다(self):
        """bool 은 int 의 하위형이다. True/False 가 1.0/0.0 으로 새면
        캡션이 근거 없이 '0'·'1' 을 말해도 통과한다."""
        facts = [{"metric": "mean", "value": 1.5, "sampleCount": 31,
                  "comparison": {"higherIsWarmer": False, "provisional": True, "anomaly": 0.7}}]
        pool = self.val.numeric_pool(facts)
        self.assertIn(1.5, pool)
        self.assertIn(0.7, pool)
        self.assertNotIn(0.0, pool)
        self.assertNotIn(1.0, pool)


# ── §5 절 구성 ───────────────────────────────────────────────────────────────
class SectionHydration(unittest.TestCase):
    def test_스토리를_붙여도_원본은_하나다(self):
        rep = {"stories": [{"storyId": "s1", "title": "t", "summary": "u", "factIds": ["f"]}],
               "sections": [{"id": "top_stories", "storyRefs": ["s1"]},
                            {"id": "ocean", "storyRefs": []}]}
        out = cp.hydrate_sections(rep)
        self.assertEqual(len(out["sections"][0]["_stories"]), 1)
        self.assertNotIn("_stories", out["sections"][1])
        # 원본 리포트의 절은 건드리지 않는다
        self.assertNotIn("_stories", rep["sections"][0])


if __name__ == "__main__":
    unittest.main()
