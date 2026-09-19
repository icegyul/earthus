# -*- coding: utf-8 -*-
"""평년 대비 기온 인텔 패킷(P2b) — 2026-09-20 운영 공개 자료를 7지점으로 자른 픽스처로 돈다."""
import copy
import json
import os
import pathlib
import sys
import unittest
from datetime import date, datetime, timezone

HERE = pathlib.Path(__file__).resolve().parent
FN = HERE.parent
sys.path.insert(0, str(FN))
sys.path.insert(0, str(FN.parent / "_shared"))
import intel_temp  # noqa: E402
import intel_contract  # noqa: E402

FIX = HERE / "fixtures"
AWS = json.loads((FIX / "kma-aws-crop-7stations.json").read_text(encoding="utf-8"))          # 2026-09-20 01:00 KST
HIST = json.loads((FIX / "history-2026-09-19-crop-7stations.json").read_text(encoding="utf-8"))  # 21/24시간(20·21·22시 없음)
NORM = json.loads((FIX / "kma-normal-crop-7stations.json").read_text(encoding="utf-8"))
NOW = datetime(2026, 9, 19, 18, 30, tzinfo=timezone.utc)


def full_day(hist, fill=None):
    """빠진 시각을 채운 하루 — 24회 평균 경로 시험용. fill: {지점: 기온} (없으면 앞 시각 값)."""
    h = copy.deepcopy(hist)
    hours = h["hours"]
    for hh in range(24):
        stamp = "%sT%02d:00" % (h["date"], hh)
        if stamp not in hours:
            prev = hours[sorted(hours)[0]]
            rows = [{"stationId": r["stationId"], "values": {"temp_c": (fill or {}).get(r["stationId"], r["values"].get("temp_c"))}}
                    for r in prev["stations"]]
            hours[stamp] = {"n": len(rows), "stations": rows}
    h["hours"] = dict(sorted(hours.items()))
    return h


class TempIntel(unittest.TestCase):
    def test_운영_자료_어제가_모자라면_평년차를_비우고_이유를_적는다(self):
        p = intel_temp.build(AWS, NOW, HIST, NORM)
        self.assertEqual(p["phenomenonId"], "weather.temperature_anomaly")
        self.assertEqual(p["current"]["values"][0]["labelKo"], "서울 기온(지금)")
        self.assertNotIn("anomaly", p)
        reason = next(m["reason"] for m in p["coverage"]["missing"] if m["section"] == "anomaly")
        self.assertIn("21/24", reason, "몇 시간이 모였는지 말한다")
        intel_contract.require_valid(p)

    def test_24시간이_다_있으면_24회_평균에서_그날_평년을_뺀다(self):
        p = intel_temp.build(AWS, NOW, full_day(HIST), NORM)
        seoul = next(i for i in p["anomaly"]["items"] if i["stationId"] == "108")
        self.assertEqual(seoul["samples"], 24)
        self.assertEqual(seoul["kind"], "EARTHUS_ANALYSIS", "하루 평균과 뺄셈은 우리 계산이다 — 관측이라 적지 않는다")
        # 평년은 9월 19일 칸(2000년 달력 262번째 칸) — 연중 일자−1(261)이면 9월 18일 값이 된다
        self.assertEqual(seoul["baseline"], NORM["normals"]["108"][262][0])
        self.assertAlmostEqual(seoul["delta"], round(seoul["value"] - seoul["baseline"], 1), places=1)
        self.assertEqual(p["anomaly"]["baseline"]["period"], "1991-2020")
        self.assertIn("sfc_norm1", p["anomaly"]["baseline"]["source"])

    def test_지금_기온이_아니라_어제_하루_평균을_쓴다(self):
        """오후 기온에서 하루 평균 평년을 빼면 매일 오후가 '평년보다 덥다'가 된다."""
        hot_now = copy.deepcopy(AWS)
        for s in hot_now["stations"]:
            s["temp_c"] = 40.0
        a = intel_temp.build(AWS, NOW, full_day(HIST), NORM)["anomaly"]["items"]
        b = intel_temp.build(hot_now, NOW, full_day(HIST), NORM)["anomaly"]["items"]
        self.assertEqual([i["delta"] for i in a], [i["delta"] for i in b], "지금 기온은 평년차에 들어가지 않는다")

    def test_8회_관측만_있으면_8회_평균으로_하고_그렇게_적는다(self):
        h = copy.deepcopy(HIST)
        h["hours"] = {t: r for t, r in h["hours"].items() if t[11:13] in intel_temp.SYNOPTIC_HOURS}
        h["hours"]["2026-09-19T21:00"] = copy.deepcopy(h["hours"]["2026-09-19T18:00"])
        p = intel_temp.build(AWS, NOW, h, NORM)
        self.assertTrue(all(i["samples"] == 8 for i in p["anomaly"]["items"]))
        self.assertIn("8회", p["anomaly"]["items"][0]["method"])

    def test_윤년_칸_찾기(self):
        self.assertEqual(intel_temp.normal_index(date(2026, 3, 1)), 60, "평년 아닌 해의 3월 1일도 3월 1일 칸")
        self.assertEqual(intel_temp.normal_index(date(2024, 2, 29)), 59)
        self.assertEqual(intel_temp.normal_index(date(2026, 12, 31)), 365)

    def test_평년_문서가_없거나_기간이_없으면_평년차를_만들지_않는다(self):
        for norm in (None, {**NORM, "period": None}):
            p = intel_temp.build(AWS, NOW, full_day(HIST), norm)
            self.assertNotIn("anomaly", p)

    def test_날짜가_다른_이력은_쓰지_않는다(self):
        h = full_day(HIST)
        h["date"] = "2026-09-18"
        self.assertNotIn("anomaly", intel_temp.build(AWS, NOW, h, NORM))

    def test_어제_이력_키는_한국_날짜(self):
        self.assertEqual(intel_temp.history_key(AWS, "wind/series/stations/"), "wind/series/stations/2026-09-19.json")

    def test_지금_기온이_하나도_없으면_패킷을_만들지_않는다(self):
        empty = {**AWS, "stations": []}
        with self.assertRaises(intel_contract.IntelContractError):
            intel_temp.build(empty, NOW, HIST, NORM)

    def test_수집기는_패킷이_실패해도_실황_문서를_쓴다(self):
        src = (FN / "handler.py").read_text(encoding="utf-8")
        block = src[src.index("기온 레이어가 이 문서를 이미 받으므로"):src.index("body = json.dumps(doc")]
        self.assertIn("except Exception", block)
        self.assertIn("intel_temp = None", src, "모듈을 못 불러와도 수집기는 돈다")
        self.assertNotIn("get(", block.replace("load_json(", ""), "허브를 더 부르지 않는다")


if __name__ == "__main__":
    unittest.main()
