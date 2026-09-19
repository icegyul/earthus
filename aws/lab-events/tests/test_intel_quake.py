# -*- coding: utf-8 -*-
"""지진 세션 → 인텔 패킷 v1 (P3) 시험 — 2026-09-20 earthus.net 공개 보고서 원값으로 돈다.

fixtures/
  lab-events-earthquake-20260920.json  https://earthus.net/ocean/lab-reports.json 의 지진 보고서 4건(publicReports)과,
                                       그 detail 에서 거꾸로 적어 낸 lab-events 세션(sessions). 세션 원본(archive/)은
                                       비공개(403)라 받을 수 없다 — FixtureFidelityTests 가 진짜 eq_detail 에 다시 넣어
                                       공개 detail 과 한 글자도 다르지 않음을 확인한다. 회차는 마지막 하나뿐이다.
  tsunami-eta-index-20260920.json      https://earthus.net/ocean/tsunami-eta.json (원문 그대로)

  us7000ti1p  M6.5 알류산 — ACTIVE · NTWC 게시문 1건 · 쓰나미 도달시간 계산 대상
  us7000thv6  M5.0 이바라키 — ACTIVE · JMA 발표 6건 중 같은 사건은 하나(진도 3), 나머지는 다른 작은 지진
  us6000tkt2  M7.8 인도네시아 — FINAL · 세 구간 모두 채점 · 본진 30일 경과(추정 종료)
  us6000tm81  M6.7 페루 — 채점 행에 날짜 창이 겹쳐 반복되는 운영 모양 그대로

⚠️ ChangeTests 의 이전 회차는 **지어낸 것**이다(공개 자료에 회차 이력이 없다). 변화 계산 규칙만 본다.

지키는 것
  · 공개 자료에서 온 세션으로 계약(intel_contract)을 통과한다 — 값을 새로 계산하지 않는다
  · RJ 기대수는 EARTHUS_FORECAST 로만 표시하고, 검증 기준 전에는 NEXT 에 싣지 않는다(이유에 이 사건의 채점 수치)
  · 기관 진도는 발생 시각이 같은 발표만 — 120 km·3일 안의 다른 지진을 섞지 않는다
  · 쓰나미 연결은 도달시간 계산이 실제로 있을 때만(연결표의 computed 한 줄)
  · 인과 어휘가 패킷 어디에도 없다 · 본진 30일 안 사건만 문서에 싣는다 · 패킷이 실패해도 보고서는 나간다
"""
import copy
import importlib.util
import inspect
import json
import os
import pathlib
import re
import sys
import types
import unittest
from datetime import datetime, timedelta, timezone

if "boto3" not in sys.modules:
    _boto3 = types.ModuleType("boto3")
    _boto3.client = lambda *args, **kwargs: object()
    sys.modules["boto3"] = _boto3
os.environ.setdefault("CACHE_BUCKET", "test-bucket")

HERE = pathlib.Path(__file__).parent
FUNC = HERE.parent
AWS = FUNC.parent
REPO = AWS.parent
sys.path.insert(0, str(FUNC))
sys.path.insert(0, str(AWS / "_shared"))
import intel_quake  # noqa: E402
import intel_contract  # noqa: E402
import lambda_package  # noqa: E402
import phenomenon_registry  # noqa: E402

SPEC = importlib.util.spec_from_file_location("lab_events_for_intel", FUNC / "handler.py")
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)

FIX = json.loads((HERE / "fixtures" / "lab-events-earthquake-20260920.json").read_text(encoding="utf-8"))
ETA = json.loads((HERE / "fixtures" / "tsunami-eta-index-20260920.json").read_text(encoding="utf-8"))
SESS = {s["facts"]["id"]: s for s in FIX["sessions"]}
PUBLIC = {r["id"].split(":", 1)[1]: r for r in FIX["publicReports"]}
NOW = datetime(2026, 9, 19, 16, 0, tzinfo=timezone.utc)      # 공개 색인 generatedAt 15:50Z 직후
KNOWN = set(phenomenon_registry.phenomenon_ids())


def build(uid, eta=ETA, now=NOW):
    return intel_quake.build(copy.deepcopy(SESS[uid]), now, eta)


def missing_reason(packet, section):
    return [m["reason"] for m in packet["coverage"]["missing"] if m["section"] == section][0]


def relation_rows():
    src = (REPO / "prototype" / "v2-three" / "js" / "phenomenon-relations.js").read_text(encoding="utf-8")
    return set(re.findall(r"from:\s*'([^']+)',\s*to:\s*'([^']+)',\s*relation:\s*'([^']+)'", src))


class FixtureFidelityTests(unittest.TestCase):
    def test_reconstructed_sessions_reproduce_the_public_detail(self):
        """적어 낸 세션을 lab-events 의 진짜 eq_detail 에 넣으면 공개 detail 이 그대로 나온다."""
        for uid, session in SESS.items():
            with self.subTest(uid=uid):
                self.assertEqual(PUBLIC[uid]["detail"], M.eq_detail(copy.deepcopy(session)))
                self.assertEqual(PUBLIC[uid]["scores"], session["scores"])

    def test_builder_constants_match_the_handler(self):
        self.assertEqual(M.ASIA_BOX, intel_quake.ASIA_BOX)
        defaults = {k: v.default for k, v in inspect.signature(M.rj_expected).parameters.items()
                    if v.default is not inspect.Parameter.empty}
        self.assertEqual(defaults, intel_quake.RJ_PARAMS)


class LivePacketTests(unittest.TestCase):
    def test_all_fixture_sessions_pass_the_contract(self):
        for uid in SESS:
            with self.subTest(uid=uid):
                v1 = build(uid)
                self.assertEqual([], intel_contract.validate(v1, known_phenomena=KNOWN))
                self.assertEqual("hazards.earthquake", v1["phenomenonId"])
                self.assertEqual("earthquake:%s" % uid, v1["eventId"])

    def test_current_values_are_copied(self):
        v1 = build("us7000ti1p")
        cur = {v["key"]: v for v in v1["current"]["values"]}
        s = SESS["us7000ti1p"]
        last = s["snapshots"][-1]
        self.assertEqual(6.5, cur["magnitude"]["value"])
        self.assertEqual("USGS ComCat", cur["magnitude"]["source"])
        self.assertEqual(s["facts"]["time"], cur["magnitude"]["at"])
        self.assertEqual(98, cur["depthKm"]["value"])
        self.assertEqual(s["facts"]["lat"], cur["epicenterLat"]["value"])
        self.assertEqual(4, cur["aftershocksM3"]["value"])
        self.assertEqual(1, cur["aftershocksM4"]["value"])
        self.assertEqual(last["at"], cur["aftershocksM4"]["at"])
        self.assertEqual(4.1, cur["largestAftershock"]["value"])
        self.assertEqual(1, cur["tsunamiBulletins"]["value"])
        self.assertEqual("OFFICIAL_WARNING", cur["tsunamiBulletins"]["kind"])
        self.assertEqual("NTWC", cur["tsunamiBulletins"]["bulletins"][0]["center"])
        for v in cur.values():
            self.assertTrue(v["kind"].startswith("OFFICIAL_"), v)
            self.assertTrue(v["labelKo"] and v["labelEn"])

    def test_agency_intensity_is_the_same_event_only(self):
        """미쓰카이도 M5.0(15:07Z) 옆의 JMA 발표 6건 중 발생 시각이 같은 것은 M4.8·진도 3 하나다."""
        v1 = build("us7000thv6")
        jma = [v for v in v1["current"]["values"] if v["key"] == "maxIntensityJMA"]
        self.assertEqual(1, len(jma))
        self.assertEqual("3", jma[0]["value"])
        self.assertEqual("2026-09-17T00:07:00+09:00", jma[0]["at"])
        self.assertIn("일본 기상청 최대 진도 3", v1["importance"]["reasons"])
        self.assertIn("jma-quake-report", [s["id"] for s in v1["sources"]])

    def test_pattern_is_the_scored_rj_windows(self):
        v1 = build("us6000tkt2")
        seq = v1["pattern"]["sequence"]
        got = [(w["t1Days"], w["t2Days"], w["observedM4"], w["rjExpectedM4"]) for w in seq["windows"]]
        self.assertEqual([(0, 1, 70, 196.6), (1, 7, 109, 108.0), (7, 30, 39, 71.9)], got)
        for w in seq["windows"]:
            self.assertEqual("EARTHUS_FORECAST", w["rjKind"], "RJ 기대수는 우리 계산이다 — 기관 값처럼 달지 않는다")
            self.assertEqual("OFFICIAL_OBSERVATION", w["observedKind"])
        self.assertEqual(intel_quake.RJ_PARAMS, seq["model"]["params"])
        self.assertIn("지역 보정 없음", seq["model"]["noteKo"])
        self.assertEqual({"n": 67, "meanAbsError": 12.99}, {k: seq["scored"][k] for k in ("n", "meanAbsError")})

    def test_pattern_ignores_repeated_dated_score_rows(self):
        """페루 보고서의 채점 행에는 같은 날짜 창이 여섯 번 나온다 — 패턴은 본진 뒤 경과 구간만 쓴다."""
        v1 = build("us6000tm81")
        self.assertEqual(["본진 뒤 0~1일", "본진 뒤 1~7일"], [w["window"] for w in v1["pattern"]["sequence"]["windows"]])

    def test_next_is_withheld_with_this_events_own_numbers(self):
        v1 = build("us7000ti1p")
        self.assertNotIn("next", v1)
        reason = missing_reason(v1, "next")
        self.assertIn("유형 B", reason)
        self.assertIn("기대 12.9회·실제 1회", reason)
        self.assertIn("채점 1구간 평균 오차 11.9회", reason)
        self.assertEqual("not_available", intel_contract.section_status(v1, "NEXT")["status"])

    def test_next_after_30_days_says_the_estimate_ended(self):
        self.assertIn("30일", missing_reason(build("us6000tkt2"), "next"))

    def test_next_switch_puts_a_type_b_item_only_when_accepted(self):
        saved = intel_quake.RJ_NEXT_ACCEPTED
        intel_quake.RJ_NEXT_ACCEPTED = True
        try:
            v1 = build("us7000ti1p")
            self.assertEqual([], intel_contract.validate(v1))
            item = v1["next"]["items"][0]
            self.assertEqual(("B", "EARTHUS_FORECAST"), (item["type"], item["kind"]))
            self.assertEqual(5.2, item["expected"])
            self.assertEqual({"n": 1, "meanAbsError": 11.9}, item["scored"])
            self.assertNotIn("next", build("us6000tkt2"), "추정이 끝난 사건에는 스위치를 켜도 싣지 않는다")
        finally:
            intel_quake.RJ_NEXT_ACCEPTED = saved

    def test_tsunami_link_only_when_arrival_times_were_computed(self):
        v1 = build("us7000ti1p")
        rel = v1["related"][0]
        self.assertEqual(("hazards.tsunami", "computed"), (rel["phenomenonId"], rel["relation"]))
        self.assertEqual("ocean/tsunami-eta/us7000ti1p.json", rel["evidence"]["output"])
        self.assertEqual("aws/tsunami-eta/handler.py", rel["evidence"]["ref"])
        self.assertTrue((REPO / rel["evidence"]["ref"]).exists())
        other = build("us7000thv6")
        self.assertNotIn("related", other)
        self.assertEqual("not_available", intel_contract.section_status(other, "IMPACT")["status"])
        self.assertNotIn("related", build("us7000ti1p", eta={}), "색인을 못 읽으면 연결을 만들지 않는다")

    def test_related_only_from_the_relation_table(self):
        rows = relation_rows()
        for r in build("us7000ti1p")["related"]:
            self.assertIn(("hazards.earthquake", r["phenomenonId"], r["relation"]), rows)

    def test_sections(self):
        st = {s: intel_contract.section_status(build("us7000ti1p"), s)["status"]
              for s in ("WHAT", "WHY", "NEXT", "IMPACT", "EVIDENCE")}
        self.assertEqual({"WHAT": "available", "WHY": "not_available", "NEXT": "not_available",
                          "IMPACT": "available", "EVIDENCE": "available"}, st)
        v1 = build("us7000ti1p")
        self.assertIn("L-4", missing_reason(v1, "anomaly"))
        self.assertIn("조건", missing_reason(v1, "conditions"))
        self.assertNotIn("confidence", v1)

    def test_no_causal_words_anywhere(self):
        for uid in SESS:
            v1 = build(uid)
            hits = [t for t in intel_contract._strings(v1) if intel_contract.causal_hits(t)]
            self.assertEqual([], hits, uid)

    def test_sources_state(self):
        src = {s["id"]: s for s in build("us7000ti1p")["sources"]}
        self.assertEqual("fresh", src["usgs-comcat"]["state"])            # 15:40 회차 → 16:00
        self.assertEqual("issued", src["ntwc-bulletin"]["state"])         # 게시문은 늙지 않는다
        self.assertEqual("SIMULATION", src["earthus-tsunami-eta"]["kind"])
        self.assertEqual("EARTHUS_FORECAST", src["earthus-rj-generic"]["kind"])
        late = {s["id"]: s for s in build("us7000ti1p", now=NOW + timedelta(hours=6))["sources"]}
        self.assertEqual("aging", late["usgs-comcat"]["state"])

    def test_missing_mainshock_facts_raise(self):
        s = copy.deepcopy(SESS["us7000ti1p"])
        s["facts"]["mag"] = None
        with self.assertRaises(intel_contract.IntelContractError):
            intel_quake.build(s, NOW, ETA)


class ChangeTests(unittest.TestCase):
    """⚠️ 이전 회차는 지어낸 것이다 — 공개 자료에 회차 이력이 없다. 기준 회차를 고르는 규칙만 본다."""

    def graft(self, *earlier):
        s = copy.deepcopy(SESS["us7000ti1p"])
        last = s["snapshots"][-1]
        s["snapshots"] = [{**last, **e} for e in earlier] + [last]
        return s

    def test_uses_the_latest_snapshot_at_least_24h_older(self):
        s = self.graft({"at": "2026-09-17T15:40:00Z", "aftershockN": 3, "aftershockM4": 1},
                       {"at": "2026-09-18T15:40:00Z", "aftershockN": 4, "aftershockM4": 1},
                       {"at": "2026-09-19T12:40:00Z", "aftershockN": 4, "aftershockM4": 1})
        v1 = intel_quake.build(s, NOW, ETA)
        self.assertEqual([], intel_contract.validate(v1))
        ch = v1["change"]
        self.assertEqual("2026-09-18T15:40:00Z", ch["windows"]["since"])
        self.assertEqual(24.0, ch["windows"]["hours"])
        m3 = [i for i in ch["items"] if i["key"] == "aftershocksM3"][0]
        self.assertEqual((0, 4, 4), (m3["delta"], m3["from"], m3["to"]), "변화 0 도 정보다 — 지우지 않는다")

    def test_young_session_compares_with_the_first_snapshot(self):
        s = self.graft({"at": "2026-09-19T09:40:00Z", "aftershockN": 2, "aftershockM4": 0})
        ch = intel_quake.build(s, NOW, ETA)["change"]
        m4 = [i for i in ch["items"] if i["key"] == "aftershocksM4"][0]
        self.assertEqual((1, 0, 1), (m4["delta"], m4["from"], m4["to"]))

    def test_magnitude_revision(self):
        s = self.graft({"at": "2026-09-17T15:40:00Z", "mag": 6.6})
        s["facts"]["mag"] = 6.6
        v1 = intel_quake.build(s, NOW, ETA)
        mag = [i for i in v1["change"]["items"] if i["key"] == "magnitude"][0]
        self.assertEqual((-0.1, 6.6, 6.5), (mag["delta"], mag["from"], mag["to"]))
        self.assertEqual({"from": 6.6, "to": 6.5}, v1["uncertainty"]["magnitudeRevision"])

    def test_single_snapshot_has_no_change(self):
        self.assertIn("회차가 하나뿐", missing_reason(build("us7000ti1p"), "change"))


class DocTests(unittest.TestCase):
    def test_doc_is_keyed_by_usgs_id_and_keeps_30_days(self):
        doc = intel_quake.build_doc([copy.deepcopy(s) for s in FIX["sessions"]], NOW, ETA, log=lambda *_: None)
        self.assertEqual({"us7000ti1p", "us7000thv6", "us6000tm81"}, set(doc["packets"]))   # M7.8 은 본진 36일
        self.assertEqual(3, doc["count"])
        self.assertEqual([], doc["failed"])
        self.assertEqual("hazards.earthquake", doc["phenomenonId"])

    def test_one_broken_session_does_not_sink_the_rest(self):
        sessions = [copy.deepcopy(s) for s in FIX["sessions"]]
        sessions[0]["facts"]["lat"] = None
        doc = intel_quake.build_doc(sessions, NOW, ETA, log=lambda *_: None)
        self.assertEqual(["us7000ti1p"], doc["failed"])
        self.assertIn("us7000thv6", doc["packets"])


class WiringTests(unittest.TestCase):
    def run_quake_kind(self, build_doc=None):
        puts = []
        saved = (M.put_json, M.s3_json, M.MODULES["earthquake"], intel_quake.build_doc)
        M.put_json = lambda key, doc, cache="public, max-age=900": puts.append((key, doc)) or 0
        M.s3_json = lambda key, default=None: copy.deepcopy(ETA) if key == "ocean/tsunami-eta.json" else default
        # 네트워크 없이 — 탐지 없음·새 회차 없음, 나머지(수명·채점·본문)는 진짜 함수
        M.MODULES["earthquake"] = (lambda now, ctx: {}, lambda *a: None, M.eq_lifecycle, M.eq_scores, M.eq_detail)
        if build_doc:
            intel_quake.build_doc = build_doc
        try:
            state = {"sessions": [copy.deepcopy(s) for s in FIX["sessions"]]}
            kept = M.run_kind("earthquake", state, NOW, M.Ctx())
        finally:
            M.put_json, M.s3_json, M.MODULES["earthquake"], intel_quake.build_doc = saved
        return kept, puts

    def test_reports_first_then_intel_doc(self):
        kept, puts = self.run_quake_kind()
        self.assertEqual(4, len(kept))
        self.assertEqual(["analysis/earthquake-reports.json", "ocean/earthquake-intel.json"], [k for k, _ in puts])
        doc = puts[1][1]
        self.assertIn("us7000ti1p", doc["packets"])
        self.assertEqual("computed", doc["packets"]["us7000ti1p"]["related"][0]["relation"])

    def test_intel_failure_does_not_block_reports(self):
        def boom(*a, **k):
            raise RuntimeError("테스트 실패")
        kept, puts = self.run_quake_kind(build_doc=boom)
        self.assertEqual(["analysis/earthquake-reports.json"], [k for k, _ in puts])
        self.assertEqual(4, len(kept))

    def test_intel_key_is_public_and_not_intel_prefix(self):
        import publication_privacy
        self.assertEqual("PUBLIC", publication_privacy.prefix_visibility(M.EQ_INTEL_KEY))
        self.assertTrue(M.EQ_INTEL_KEY.startswith(publication_privacy.BUCKET_PUBLIC_PREFIXES))

    def test_lambda_zip_carries_the_contract(self):
        plan = lambda_package.plan(str(FUNC), str(AWS / "_shared"))
        self.assertIn("intel_quake.py", plan["topLevelModules"])
        self.assertIn("intel_contract", plan["sharedModules"])
        self.assertIn("contracts/intel-vocab.json", plan["dataFiles"])

    def test_deploy_script_packages_with_lambda_package(self):
        src = (AWS / "deploy-lab-events.sh").read_text(encoding="utf-8")
        self.assertNotIn("z.write(os.path.join(src, 'handler.py')", src, "handler.py 한 장만 싸면 콜드 스타트에서 죽는다")
        self.assertIn("lambda_package.py", src)
        for step in (" stage ", " zip ", " verify "):
            self.assertIn(step, src)


if __name__ == "__main__":
    unittest.main()
