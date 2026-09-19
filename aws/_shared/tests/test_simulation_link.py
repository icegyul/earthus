# -*- coding: utf-8 -*-
"""SimulationRunRecord 검증기 시험 (계약 §E · §J-5 · §J-6).

표본은 지어내지 않는다 — research-runtime 은 저장소의 실제 실행 결과
(services/research-runtime/examples/hycom-2015-atlantic.*)를, tsunami-eta 는 handler.py 가 만드는
산출물 모양(earthus.tsunami-eta.v1, handler.py 340~352행)을 그대로 쓴다.
"""
import json
import pathlib
import re
import sys
import unittest

SHARED = pathlib.Path(__file__).parent.parent
REPO = SHARED.parent.parent
sys.path.insert(0, str(SHARED))
import simulation_link as sl  # noqa: E402

EXAMPLES = REPO / "services" / "research-runtime" / "examples"
PER_RUN = {"by": "dalur", "at": "2026-09-20T01:00:00Z", "method": "PER_RUN"}
STANDING = {"by": "dalur", "at": "2026-08-10T00:00:00Z", "method": "STANDING_SCHEDULE",
            "ref": "aws/configure-tsunami-eta-schedule.sh"}
USER = {"scope": "USER_REQUEST", "at": "2026-09-20T00:59:00Z", "revocable": True}
BATCH = {"scope": "OPERATOR_BATCH", "at": "2026-08-10T00:00:00Z", "revocable": True}

TSUNAMI_DOC = {
    "schema": "earthus.tsunami-eta.v1", "badge": "SIMULATION_ONLY", "modelVersion": "eta-v1",
    "event": {"usgsId": "us7000abcd", "mag": 7.1, "place": "off the coast of Honshu",
              "originUtc": "2026-09-19T03:10:00Z", "lat": 38.2, "lon": 142.9, "depthKm": 25.0},
    "time": {"occurredAt": "2026-09-19T03:10:00Z", "computedAt": "2026-09-19T03:25:00Z", "retrievedAt": None},
    "method": {"ko": "장파 근사 c=√(g·h) · GEBCO 0.2° 판 위 8방향 Dijkstra · 진원은 점 · 등시선은 0.5° 판",
               "limits": ["파고·침수·피해가 아니다 — 첫 파가 닿을 수 있는 시각의 물리 근사",
                          "0.2° 격자라 해협·내만은 어긋날 수 있다",
                          "진원을 점으로 본다 — M8+ 단층 길이를 무시해 가까운 연안은 실제보다 늦게 나온다",
                          "8방향 경로는 직선보다 최대 약 8% 길다",
                          "공식 경보·행동 지시는 PTWC/JMA/기상청 원문만 따른다"],
               "gridSha256": "c" * 64},
    "stations": [{"name": "Busan", "lat": 35.1, "lon": 129.0, "iso": "KOR", "etaMin": 290},
                 {"name": "Sokcho", "lat": 38.2, "lon": 128.6, "iso": "KOR", "etaMin": 210}],
    "reachedCount": 2, "isochronesMin": [],
    "official": {"matched": False, "etaRows": [], "compare": [], "note": "대응하는 PTWC 발표를 찾지 못함 — 대조 불가"},
}


def tsunami_record(**over):
    rec = sl.from_tsunami_eta(TSUNAMI_DOC, event_id="evt_0123456789abcdef",
                              output_ref="ocean/tsunami-eta/us7000abcd.json", approval=STANDING, consent=BATCH)
    rec.update(over)
    return rec


def research_record(**over):
    exp = json.loads((EXAMPLES / "hycom-2015-atlantic.experiment.json").read_text(encoding="utf-8"))
    res = json.loads((EXAMPLES / "hycom-2015-atlantic.result.json").read_text(encoding="utf-8"))
    rec = sl.from_research_runtime(exp, res, run_id="run-hycom-2015-atlantic", event_id="evt_fedcba9876543210",
                                   output_ref="services/research-runtime/examples/hycom-2015-atlantic.result.json",
                                   approval=PER_RUN, consent=USER, computed_at="2026-09-10T08:00:00Z")
    rec.update(over)
    return rec


class RegistryMatchesSourcesTests(unittest.TestCase):
    """등재표가 원본 모델 상수와 어긋나면 '없는 모델'을 받아들이게 된다."""

    def _const(self, path, name):
        m = re.search(r'^%s\s*=\s*"([^"]+)"' % name, path.read_text(encoding="utf-8"), re.M)
        self.assertIsNotNone(m, "%s 에 %s 가 없다" % (path, name))
        return m.group(1)

    def test_research_runtime_models(self):
        rr = REPO / "services" / "research-runtime" / "research_runtime"
        want = {self._const(rr / f, "MODEL_ID"): self._const(rr / f, "MODEL_VERSION")
                for f in ("models.py", "models_v2.py")}
        self.assertEqual(want, sl.RUNTIMES["research-runtime"])

    def test_tsunami_eta_version(self):
        self.assertEqual(self._const(REPO / "aws" / "tsunami-eta" / "handler.py", "MODEL_VERSION"),
                         sl.RUNTIMES["tsunami-eta"]["tsunami-eta"])


class RealRecordsPassTests(unittest.TestCase):
    def test_research_runtime_example(self):
        rec = research_record()
        self.assertEqual([], sl.validate(rec))
        self.assertEqual([-60, 28, -58, 30], rec["spatialExtent"]["bbox"])
        self.assertEqual("2015-01-08T12:00:00Z", rec["temporalRange"]["end"], "72시간 실험")
        self.assertFalse(rec["validation"]["performed"])
        self.assertIsNone(rec["validation"]["result"])

    def test_tsunami_eta_output(self):
        rec = tsunami_record()
        self.assertEqual([], sl.validate(rec))
        self.assertEqual("tsunami-eta:us7000abcd", rec["runRef"])
        self.assertEqual(5, len(rec["limits"]))
        self.assertEqual([128.6, 35.1, 142.9, 38.2], rec["spatialExtent"]["bbox"])
        self.assertFalse(rec["validation"]["performed"], "PTWC 대조가 없으면 검증 안 함 — 0 으로 채우지 않는다")


class RejectTests(unittest.TestCase):
    def assertRejected(self, rec, fragment):
        errors = sl.validate(rec)
        self.assertTrue(any(fragment in e for e in errors), "%r 를 기대했다: %s" % (fragment, errors))
        with self.assertRaises(sl.SimulationLinkError):
            sl.require_valid(rec)

    def test_unregistered_runtime(self):
        self.assertRejected(tsunami_record(runtime="user-ai", runRef="user-ai:1"), "등재표에 없는 runtime")

    def test_unregistered_model(self):
        self.assertRejected(research_record(modelId="shallow-water-2d.v1"), "등재되지 않은 modelId")

    def test_version_mismatch(self):
        self.assertRejected(tsunami_record(modelVersion="eta-v2"), "등재본")

    def test_runtimes_without_model_ids_cannot_register(self):
        self.assertRejected(tsunami_record(runtime="lab-events", runRef="lab-events:x", modelId=None),
                            "모델 식별자가 없어")

    def test_truth_status_is_constant(self):
        self.assertRejected(tsunami_record(truthStatus="OFFICIAL_FORECAST"), "J-6")

    def test_empty_assumptions(self):
        self.assertRejected(tsunami_record(assumptions=[]), "assumptions")

    def test_empty_limits(self):
        self.assertRejected(research_record(limits=[]), "limits")

    def test_unperformed_validation_with_result(self):
        rec = tsunami_record()
        rec["validation"] = {"planId": None, "performed": False, "method": None, "result": 0, "resultRef": None}
        self.assertRejected(rec, "performed=false")

    def test_each_new_field_is_required(self):
        for f in sl.NEW_FIELDS:
            rec = tsunami_record()
            del rec[f]
            self.assertRejected(rec, "J-5")

    def test_system_account_cannot_approve(self):
        for who in ("system", "lambda:tsunami-eta", "scheduler", "EARTHUS"):
            self.assertRejected(tsunami_record(approval=dict(STANDING, by=who)), "사람")

    def test_standing_schedule_needs_its_approval_ref(self):
        ap = dict(STANDING)
        del ap["ref"]
        self.assertRejected(tsunami_record(approval=ap), "ref")

    def test_consent_must_be_revocable(self):
        self.assertRejected(research_record(consent=dict(USER, revocable=False)), "철회")

    def test_bbox_shape(self):
        self.assertRejected(tsunami_record(spatialExtent={"bbox": [0, 0, 1], "crs": "EPSG:4326"}), "bbox")
        self.assertRejected(tsunami_record(spatialExtent={"bbox": [0, 95, 1, 96], "crs": "EPSG:4326"}), "범위")

    def test_time_range_order(self):
        self.assertRejected(research_record(temporalRange={"start": "2015-01-08T12:00:00Z",
                                                           "end": "2015-01-05T12:00:00Z"}), "늦다")

    def test_run_ref_must_match_runtime(self):
        self.assertRejected(tsunami_record(runRef="research-runtime:us7000abcd"), "머리")

    def test_event_is_required(self):
        self.assertRejected(tsunami_record(eventId=""), "eventId")

    def test_succeeded_needs_computed_at(self):
        self.assertRejected(research_record(computedAt=None), "computedAt")


if __name__ == "__main__":
    unittest.main()
