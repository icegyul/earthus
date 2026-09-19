# -*- coding: utf-8 -*-
"""INTELLIGENCE-LAYER-PLAN P5 — 현상 보고서(`phenomenon-intel`, PHENOMENON_INTEL).

패킷 → QC → 팩트 → 절 구성 → 서술 → 검증 → 발행 사슬(사람 승인 문) 을 **실제 패킷 하나**로 끝까지 본다.
입력: tools/earthus-v53/fixtures/intel-v1-typhoon-1001322.json (2026-09-19 운영 패킷, cyclone:1001322).

이 시험은 네트워크도 자격증명도 쓰지 않는다. S3 는 가짜 클라이언트를 S3PublishAdapter 에 꽂아
**운영과 같은 코드 경로**(check_public_write → 조건부 쓰기 → 익명 되받기 → 색인 읽어 더하기)를 지난다.
⚠️ 시험 안의 승인(approve by dalur · CLI_CONFIRM)은 사람 승인을 **흉내 낸 것**이다. 운영에서
   승인은 사람이 따로 한다 — cli.py intel 에는 승인 인자가 없다(아래 시험이 그것도 본다).
"""
import copy
import io
import json
import os
import sys
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.dirname(HERE)
AWS = os.path.dirname(ENGINE)
REPO = os.path.dirname(AWS)
sys.path.insert(0, ENGINE)
sys.path.insert(0, os.path.join(ENGINE, "adapters"))
sys.path.insert(0, os.path.join(AWS, "_shared"))

import pipeline as pl                     # noqa: E402
import generator as gen                   # noqa: E402
import narrative as nr                    # noqa: E402
import publisher as pub                   # noqa: E402
import sections as sx                     # noqa: E402
import export as ex                       # noqa: E402
import governance as gov                  # noqa: E402
import intel_contract as ic               # noqa: E402
import publication_privacy as priv        # noqa: E402
import report_contract as rc              # noqa: E402
import phenomenon_intel_adapter as pia    # noqa: E402

FIXTURE = os.path.join(REPO, "tools", "earthus-v53", "fixtures", "intel-v1-typhoon-1001322.json")
NOW = "2026-09-20T00:00:00Z"
LATER = "2026-09-20T01:00:00Z"
RID = "phenomenon-intel:hazards.typhoon.cyclone-1001322.20260919T1525Z"
KEY = "reports/published/phenomenon-intel/hazards.typhoon.cyclone-1001322.20260919T1525Z/v1.json"
REF = "ocean/cyclone-events/1001322.json#intel"


def packet():
    with open(FIXTURE, encoding="utf-8") as fh:
        return json.load(fh)


def build(p=None, **kw):
    return pl.build_intel(p if p is not None else packet(), generated_at=NOW, **kw)


def validated(p=None, mode="TEST"):
    rep, quality = build(p)
    return gen.run_publication_pipeline(rep, quality=quality, published_at=NOW, mode=mode)


def numbers_in(node, out=None):
    out = set() if out is None else out
    if isinstance(node, bool):
        return out
    if isinstance(node, (int, float)):
        out.add(round(float(node), 6))
    elif isinstance(node, dict):
        for v in node.values():
            numbers_in(v, out)
    elif isinstance(node, (list, tuple)):
        for v in node:
            numbers_in(v, out)
    return out


def section(rep, sid):
    return next(s for s in rep["sections"] if s["id"] == sid)


# ────────────────────────────────────────────────────────────────────────────
class 종류_등록(unittest.TestCase):
    def test_보고서_종류에_있다(self):
        self.assertIn("PHENOMENON_INTEL", rc.REPORT_TYPES)
        self.assertEqual(sx.INTEL_REPORT_TYPE, "PHENOMENON_INTEL")
        self.assertEqual(pia.REPORT_TYPE, "PHENOMENON_INTEL")

    def test_reportId_는_콜론이_하나다(self):
        """파이썬은 콜론 전부를, 앱(report-center.js reportKey)은 첫 콜론만 '/' 로 바꾼다."""
        rid = pia.report_id(pia.load(packet()))
        self.assertEqual(rid, RID)
        self.assertEqual(rid.count(":"), 1)
        rep, _ = build()
        py_key = pub.report_key(rep)
        js_key = "reports/published/%s/v1.json" % rid.replace(":", "/", 1)
        self.assertEqual(py_key, KEY)
        self.assertEqual(py_key, js_key)

    def test_모든_패킷_절에_자리가_있다(self):
        """INTEL 5절 어디에도 없는 패킷 절이 있으면 보고서가 그것을 조용히 버린다."""
        placed = [p for _, sec, _, _ in sx.INTEL_LAYOUT for p in sx.intel_parts(sec)]
        for part in ic.PACKET_SECTIONS:
            self.assertEqual(placed.count(part), 1, part)


class 보고서_생성(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.p = packet()
        cls.rep, cls.quality = build(cls.p)

    def test_검증을_통과한다(self):
        ok, probs = gen.validate_report(self.rep)
        self.assertTrue(ok, probs)
        ok, probs = nr.validate_report_narrative(self.rep)
        self.assertTrue(ok, probs)
        self.assertEqual(self.rep["type"], "PHENOMENON_INTEL")
        self.assertEqual(self.rep["lifecycle"], "DRAFT")
        self.assertEqual(self.rep["phenomenonIds"], ["hazards.typhoon"])
        self.assertEqual(self.rep["period"], {"from": "2026-09-19T12:00:00Z",
                                              "to": "2026-09-19T15:25:00Z"})

    def test_절은_INTELLIGENCE_5절이다(self):
        self.assertEqual([s["id"] for s in self.rep["sections"]],
                         ["what", "why", "next", "impact", "evidence"])
        self.assertEqual([s["intelSection"] for s in self.rep["sections"]],
                         ["WHAT", "WHY", "NEXT", "IMPACT", "EVIDENCE"])
        # DUJUAN 패킷: 5절 모두 재료가 있다
        for s in self.rep["sections"]:
            self.assertEqual(s["status"], "available", s["id"])
            self.assertFalse(s["notAvailable"], s["id"])

    def test_빠진_anomaly_는_이유와_함께_비워_둔다(self):
        reason = self.p["coverage"]["missing"][0]["reason"]
        what = section(self.rep, "what")
        self.assertEqual(what["dataLabel"], "DATA_PARTIAL")
        self.assertEqual([m["part"] for m in what["missingParts"]], ["anomaly"])
        self.assertEqual(what["missingParts"][0]["reasonKo"], reason)
        part = next(p for p in what["parts"] if p["part"] == "anomaly")
        self.assertFalse(part["present"])
        self.assertNotIn("factRefs", part)
        self.assertFalse([f for f in self.rep["facts"] if ":anomaly:" in f["factId"]])
        # EVIDENCE 도 빠진 절을 적는다(띠의 EVIDENCE 와 같다)
        cov = [r for r in section(self.rep, "evidence")["rows"] if r["part"] == "coverage"]
        self.assertEqual(cov, [{"part": "coverage", "title": "anomaly", "reasonKo": reason}])
        self.assertEqual(self.rep["dataLabel"], "DATA_PARTIAL")

    def test_숫자는_패킷에서만_온다(self):
        pool = numbers_in(self.p)
        for f in self.rep["facts"]:
            v = f["value"]
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                self.assertIn(round(float(v), 6), pool, f["factId"])
            for n in numbers_in(f.get("comparison")):
                self.assertIn(n, pool, f["factId"])
        for ln in self.rep["narrative"]["lines"]:
            for text in (ln["text"], ln["textEn"]):
                for n in nr._nums(text):
                    self.assertTrue(n in pool or (float(n).is_integer() and abs(n) < 10),
                                    "%s: %s" % (n, text))

    def test_팩트는_패킷의_종류와_출처를_그대로_든다(self):
        by = {f["factId"].split(":", 2)[2]: f for f in self.rep["facts"]}
        wind = by["current:maxWind"]
        self.assertEqual((wind["value"], wind["unit"], wind["truthType"], wind["source"]),
                         (35.0, "m/s", "OFFICIAL_OBSERVATION", "JMA 실황"))
        self.assertEqual(wind["evidenceRefs"], [REF])
        self.assertEqual(wind["eventId"], "cyclone:1001322")
        chg = by["change:maxWind.delta"]
        self.assertEqual((chg["value"], chg["comparison"]["from"], chg["comparison"]["to"]),
                         (3.0, 32.0, 35.0))
        # pattern 은 계약이 속 모양을 정하지 않았다 — 단위·종류를 짐작해 붙이지 않는다
        spd = by["pattern:motion.speedKmh"]
        self.assertIsNone(spd["unit"])
        self.assertIsNone(spd["truthType"])

    def test_WHY_는_함께_나타난_조건이다(self):
        why = section(self.rep, "why")
        self.assertEqual(why["noteKo"], ic.FIXED_TEXT["conditionsNotCause"]["ko"])
        sst = [f for f in self.rep["facts"] if f["factId"] in why["factRefs"]]
        self.assertEqual([(f["metric"], f["value"]) for f in sst], [("sstAtCenter", 29.29)])

    def test_NEXT_는_기관_인용이라고_말한다(self):
        nxt = section(self.rep, "next")
        self.assertEqual(nxt["noteKo"], sx.INTEL_NEXT_A_NOTE[0])
        heads = [r for r in nxt["rows"] if r["part"] == "next"]
        self.assertEqual([r["title"] for r in heads], ["한국 기상청", "일본 기상청", "ECMWF 모델"])
        self.assertEqual({r["type"] for r in heads}, {"A"})
        self.assertEqual({r["typeKo"] for r in heads}, {ic.NEXT_TYPE["A"]["ko"]})
        allowed = set(ic.NEXT_TYPE["A"]["kinds"])
        for fid in nxt["factRefs"]:
            f = next(x for x in self.rep["facts"] if x["factId"] == fid)
            self.assertIn(f["truthType"], allowed, fid)

    def test_IMPACT_의_교과서_관계는_계산한_연결이라_하지_않는다(self):
        rel = [r for r in section(self.rep, "impact")["rows"] if r["part"] == "related"]
        self.assertEqual(len(rel), 1)
        self.assertEqual(rel[0]["relation"], "reference")
        self.assertEqual(rel[0]["relationKo"], ic.FIXED_TEXT["referenceRelation"]["ko"])

    def test_금지어가_어디에도_없다(self):
        blob = json.dumps(self.rep, ensure_ascii=False).lower()
        for w in rc.FORBIDDEN_CAUSAL:
            self.assertNotIn(w.lower(), blob, w)

    def test_패킷에_없는_이름을_지어_넣지_않는다(self):
        # 태풍 이름은 패킷에 없다. 제목·절 어디에도 없어야 한다.
        blob = json.dumps(self.rep, ensure_ascii=False) + ex.to_html(self.rep) + ex.to_markdown(self.rep)
        self.assertNotIn("DUJUAN", blob.upper())

    def test_잠금_화면은_목록을_먼저_보여준다(self):
        acc = self.rep["access"]
        self.assertEqual(acc["requiredTier"], "explorer")
        self.assertEqual([c["id"] for c in acc["contents"]],
                         ["what", "why", "next", "impact", "evidence"])
        for c in acc["contents"]:
            # 값은 없다 — 이름 · 상태 · 개수 · 빠진 부분만
            self.assertEqual(set(c), {"id", "titleKo", "titleEn", "notAvailable", "empty",
                                      "status", "items", "missingParts", "reasonKo"})
        self.assertEqual(acc["contents"][0]["missingParts"], ["anomaly"])

    def test_QC_는_늙은_출처를_한계로_싣고_막지_않는다(self):
        self.assertEqual(self.quality["status"], "WARN")
        self.assertEqual(self.quality["datasetId"], REF)
        self.assertEqual([c["check"] for c in self.quality["warnings"]], ["freshness"])
        self.assertIn("noaa-oisst-v2.1", self.quality["warnings"][0]["detail"])
        out = gen.run_publication_pipeline(copy.deepcopy(self.rep), quality=self.quality,
                                           published_at=NOW, mode="TEST")
        self.assertEqual(out["lifecycle"], "PUBLISHED", out.get("validationProblems"))
        self.assertIn("noaa-oisst-v2.1", " ".join(out["limitations"]))
        self.assertIsNone(out.get("publishedAt"))      # 검증은 발행이 아니다

    def test_스냅샷이_패킷_지문을_든다(self):
        snap = self.rep["dataSnapshot"]
        self.assertEqual(self.rep["dataSnapshotId"], snap["snapshotId"])
        head = snap["datasets"][0]
        self.assertEqual(head["ref"], REF)
        self.assertEqual(head["checksum"], pia.checksum(pia.load(self.p)))
        states = {d["ref"]: d["state"] for d in snap["datasets"][1:]}
        self.assertEqual(states["noaa-oisst-v2.1"], "STALE")
        self.assertEqual(states["jma-observed"], "AVAILABLE")

    def test_내보내기(self):
        html = ex.to_html(self.rep)
        self.assertIn("빠진 부분 anomaly", html)
        self.assertIn("EXPLORER", html)
        self.assertEqual(ex.filename(self.rep, "html"),
                         "EARTHUS_INTEL_hazards_typhoon_cyclone-1001322_20260919T1525Z.html")
        md = ex.to_markdown(self.rep)
        self.assertIn("# EARTHUS 현상 보고서 · hazards.typhoon · cyclone:1001322", md)


class 빠진_절은_채우지_않는다(unittest.TestCase):
    def _without(self, part, reason):
        p = packet()
        p.pop(part)
        p["coverage"]["missing"].append({"section": part, "reason": reason})
        return p

    def test_WHY_재료가_없으면_이유만_남는다(self):
        reason = "중심 격자칸이 육지라 해수면 온도가 없다"
        rep, _ = build(self._without("conditions", reason))
        why = section(rep, "why")
        self.assertTrue(why["notAvailable"])
        self.assertEqual(why["status"], "not_available")
        self.assertEqual(why["reasonKo"], reason)
        self.assertEqual((why["factRefs"], why["rows"]), ([], []))
        self.assertNotIn("noteKo", why)
        self.assertFalse([f for f in rep["facts"] if ":conditions:" in f["factId"]])
        lines = [ln for ln in rep["narrative"]["lines"] if ln["sectionId"] == "why"]
        self.assertEqual(len(lines), 1)
        self.assertIn(ic.FIXED_TEXT["sectionMissing"]["ko"], lines[0]["text"])
        self.assertEqual(lines[0]["factIds"], [])
        ok, probs = gen.validate_report(rep)
        self.assertTrue(ok, probs)
        self.assertIn("자료 없음", ex.to_html(rep))

    def test_NEXT_재료가_없으면_빈_NEXT_카드가_없다(self):
        rep, _ = build(self._without("next", "기관 예보가 아직 없다"))
        nxt = section(rep, "next")
        self.assertTrue(nxt["notAvailable"])
        self.assertEqual(nxt["reasonKo"], "기관 예보가 아직 없다")
        self.assertFalse([f for f in rep["facts"] if ":next:" in f["factId"]])
        self.assertTrue(gen.validate_report(rep)[0])

    def test_산식_없는_신뢰등급은_빼고_이유를_적는다(self):
        p = packet()
        p["confidence"]["inputs"].pop("formula_id")
        rep, _ = build(p)
        ev = section(rep, "evidence")
        self.assertEqual([m["part"] for m in ev["missingParts"]], ["confidence"])
        self.assertFalse([r for r in ev["rows"] if r["part"] == "confidence"])
        self.assertTrue(gen.validate_report(rep)[0])

    def test_빈_절을_채우면_검증이_막는다(self):
        rep, _ = build(self._without("conditions", "없다"))
        section(rep, "why")["factRefs"] = [rep["facts"][0]["factId"]]
        ok, probs = gen.validate_report(rep)
        self.assertFalse(ok)
        self.assertTrue(any("빈 절 why 에 값이 들어 있다" in x for x in probs), probs)

    def test_빠졌다는_절에서_팩트가_나오면_막는다(self):
        rep, _ = build()
        rep["facts"].append(rc.make_fact(
            fact_id="fact:%s:anomaly:sst" % RID.split(":")[1], phenomenon_id="hazards.typhoon",
            metric="sst", value=1.2))
        ok, probs = gen.validate_report(rep)
        self.assertFalse(ok)
        self.assertTrue(any("빠졌다고 적힌 절(anomaly)" in x for x in probs), probs)

    def test_절을_지우면_막는다(self):
        rep, _ = build()
        rep["sections"] = [s for s in rep["sections"] if s["id"] != "impact"]
        self.assertFalse(gen.validate_report(rep)[0])


class 계약과_금지어(unittest.TestCase):
    def test_계약을_어긴_패킷으로는_만들지_않는다(self):
        p = packet()
        p["current"]["values"][0].pop("unit")
        with self.assertRaises(ic.IntelContractError):
            build(p)

    def test_계약이_안_보는_곳의_인과_어휘도_QC_가_막는다(self):
        """계약(J-3)은 conditions·related·next 만 본다. importance 이유 문장은 QC 가 본다."""
        p = packet()
        p["importance"]["reasons"].append("해수온 때문에 강화")
        rep, quality = build(p)
        self.assertEqual(quality["status"], "FAIL")
        self.assertIn("causal", [c["check"] for c in quality["failures"]])
        out = gen.run_publication_pipeline(rep, quality=quality, published_at=NOW, mode="TEST")
        self.assertEqual(out["lifecycle"], "FAILED")
        # 검증기도 따로 잡는다 — QC 를 빼먹어도 새지 않게
        ok, probs = gen.validate_report(rep)
        self.assertFalse(ok)
        self.assertTrue(any("인과 어휘" in x for x in probs), probs)

    def test_출처를_모르는_현상은_보고서를_만들지_않는다(self):
        p = packet()
        p["eventId"] = None
        with self.assertRaises(pia.IntelReportError):
            build(p)
        rep, _ = build(p, packet_ref="intel/hazards.typhoon.json")
        self.assertEqual(rep["reportId"], "phenomenon-intel:hazards.typhoon.20260919T1525Z")


class 서술_검증(unittest.TestCase):
    def setUp(self):
        self.rep, _ = build()

    def _line(self, sid):
        return next(ln for ln in self.rep["narrative"]["lines"]
                    if ln["sectionId"] == sid and ln["factIds"])

    def test_팩트에_없는_숫자는_막는다(self):
        ln = self._line("what")
        ln["text"] = ln["text"].replace("35", "36", 1)
        ok, probs = nr.validate_report_narrative(self.rep)
        self.assertFalse(ok)
        self.assertTrue(any("36" in p for p in probs), probs)

    def test_다른_절의_팩트_숫자를_빌려_쓰지_못한다(self):
        """35 는 보고서 어딘가의 팩트지만 WHY 줄이 가리키는 팩트(해수온)가 아니다."""
        ln = self._line("why")
        ln["text"] = ln["text"] + " · 최대풍속 35"
        ok, probs = nr.validate_report_narrative(self.rep)
        self.assertFalse(ok)
        self.assertTrue(any("35" in p for p in probs), probs)

    def test_영어_줄의_인과도_막는다(self):
        ln = self._line("why")
        ln["textEn"] = "Warm water caused by the season"
        ok, probs = nr.validate_report_narrative(self.rep)
        self.assertFalse(ok)
        self.assertTrue(any("caused by" in p for p in probs), probs)

    def test_기존_보고서_서술_검사는_그대로다(self):
        """factIds 없는 줄(채점 문장)은 예전 규칙 그대로 본다."""
        from test_phase7_pipeline import report_with_facts
        r = report_with_facts()
        self.assertTrue(nr.validate_report_narrative(r)[0])


class 중복_판정(unittest.TestCase):
    def test_같은_관측시각의_다른_사건은_중복이_아니다(self):
        rep = validated()
        other = dict(rep, reportId="phenomenon-intel:hazards.typhoon.cyclone-1001323.20260919T1525Z")
        self.assertIsNone(gen._find_duplicate(rep, [other]))
        self.assertEqual(gen._find_duplicate(rep, [dict(rep)]), RID)


# ── 발행 사슬 — 가짜 S3 를 운영 어댑터에 꽂는다 ────────────────────────────────
class 가짜S3:
    """boto3 S3 클라이언트 흉내. 조건부 쓰기(IfNoneMatch='*')를 운영처럼 지킨다."""

    def __init__(self, objects=None):
        self.objects = dict(objects or {})
        self.calls = []

    def head_bucket(self, Bucket):
        return {}

    def put_object(self, Bucket, Key, Body, IfNoneMatch=None, **kw):
        self.calls.append(dict(kw, Bucket=Bucket, Key=Key, IfNoneMatch=IfNoneMatch))
        if IfNoneMatch == "*" and Key in self.objects:
            raise Exception("An error occurred (PreconditionFailed): 412")
        self.objects[Key] = Body
        return {}

    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise Exception("An error occurred (NoSuchKey)")
        return {"Body": io.BytesIO(self.objects[Key])}


class _응답:
    def __init__(self, body):
        self.status = 200
        self._body = body

    def read(self):
        return self._body

    def getcode(self):
        return self.status

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class 발행_사슬(unittest.TestCase):
    BASE = "https://fake.invalid"

    def setUp(self):
        old = {"schemaVersion": rc.REPORT_SCHEMA,
               "years": {"2026": [{"reportId": "report:2026-08", "type": "RETROSPECTIVE_MONTHLY",
                                   "version": 1, "lifecycle": "PUBLISHED", "status": "PUBLISHED",
                                   "period": {"from": "2026-08-01", "to": "2026-08-31"},
                                   "immutableRef": "report:2026-08"}]}}
        self.s3 = 가짜S3({pub.INDEX_KEY: json.dumps(old).encode("utf-8")})
        self.ad = pub.S3PublishAdapter(bucket="fake-bucket", region="us-east-2", public_base=self.BASE)
        self.ad._s3 = self.s3
        self.report = validated()

    def _익명_받기(self, url, timeout=None):
        key = url[len(self.BASE) + 1:]
        if key not in self.s3.objects:
            raise Exception("HTTP Error 403: Forbidden")
        return _응답(self.s3.objects[key])

    def _publish(self, report):
        with mock.patch("urllib.request.urlopen", self._익명_받기):
            return pub.publish_pipeline(report, self.ad, published_at=LATER)

    def test_검증만_통과한_보고서는_승인_문에서_멈춘다(self):
        self.assertEqual(self.report["lifecycle"], "PUBLISHED")          # = 기계 검증 통과
        self.assertEqual(pub.approval_state(self.report), "READY_FOR_REVIEW")
        out = self._publish(self.report)
        self.assertFalse(out["ok"])
        self.assertEqual(out["stage"], "APPROVE")
        self.assertEqual(out["reason"], "NOT_APPROVED")
        self.assertEqual(out["approvalState"], "READY_FOR_REVIEW")
        self.assertEqual(self.s3.calls, [], "승인 전에 무언가 올라갔다")

    def test_사람이_승인하면_정해진_키와_색인에_간다(self):
        approved = pub.approve(self.report, approved_by="dalur", approved_at=NOW,
                               approval_method="CLI_CONFIRM")
        out = self._publish(approved)
        self.assertTrue(out["ok"], out)
        self.assertTrue(out["published"])
        self.assertEqual(out["key"], KEY)
        self.assertEqual(out["url"], "%s/%s" % (self.BASE, KEY))
        self.assertTrue(out["verify"]["ok"], out["verify"])

        put = next(c for c in self.s3.calls if c["Key"] == KEY)
        self.assertEqual(put["IfNoneMatch"], "*")                         # 덮어쓰기 경로 없음
        self.assertEqual(put["CacheControl"], pub.IMMUTABLE_CACHE)
        doc = json.loads(self.s3.objects[KEY].decode("utf-8"))
        self.assertEqual(doc["reportId"], RID)
        self.assertEqual(doc["type"], "PHENOMENON_INTEL")
        self.assertEqual(doc["lifecycle"], "PUBLISHED")
        self.assertEqual(doc["publishedAt"], LATER)                        # 올리는 쪽만 찍는다
        self.assertEqual(doc["immutableRef"], RID)
        self.assertEqual(doc["approval"]["approvedBy"], "dalur")
        self.assertEqual(priv.scan_public_payload(doc), [])
        self.assertTrue(priv.check_public_write(KEY, doc, kind="report")["allowed"])

        idx = json.loads(self.s3.objects[pub.INDEX_KEY].decode("utf-8"))
        rows = idx["years"]["2026"]
        self.assertEqual(sorted(r["reportId"] for r in rows), sorted(["report:2026-08", RID]))
        row = next(r for r in rows if r["reportId"] == RID)
        self.assertEqual(row, {"reportId": RID, "type": "PHENOMENON_INTEL",
                               "period": {"from": "2026-09-19T12:00:00Z",
                                          "to": "2026-09-19T15:25:00Z"},
                               "status": "PUBLISHED", "lifecycle": "PUBLISHED",
                               "publishedAt": LATER, "version": 1, "immutableRef": RID})
        self.assertEqual(pub.index_leaks(idx), [])

    def test_같은_판을_다시_올려도_덮어쓰지_않는다(self):
        approved = pub.approve(self.report, approved_by="dalur", approved_at=NOW,
                               approval_method="CLI_CONFIRM")
        first = self._publish(approved)
        body = self.s3.objects[KEY]
        again = self._publish(approved)
        self.assertTrue(first["published"])
        self.assertFalse(again["published"])
        self.assertTrue(again["alreadyPreserved"])
        self.assertEqual(self.s3.objects[KEY], body)

    def test_승인_뒤_내용이_바뀌면_올라가지_않는다(self):
        approved = pub.approve(self.report, approved_by="dalur", approved_at=NOW,
                               approval_method="CLI_CONFIRM")
        approved["facts"][0] = dict(approved["facts"][0], value=99.0)
        out = self._publish(approved)
        self.assertFalse(out["ok"])
        self.assertEqual(out["reason"], "APPROVAL_INVALID")
        self.assertNotIn(KEY, self.s3.objects)

    def test_자동화는_승인할_수_없다(self):
        with self.assertRaises(gov.GovernanceError):
            pub.approve(self.report, approved_by="report-pipeline", approved_at=NOW,
                        approval_method="CLI_CONFIRM")


class 명령줄(unittest.TestCase):
    def test_시험_자료로_운영을_돌리면_막힌다(self):
        """cli.py intel 은 입력 경로를 provenance 에 남긴다. fixtures/… 로 PRODUCTION 이면 FAILED."""
        rep, quality = build(provenance_extra={"input": FIXTURE})
        out = gen.run_publication_pipeline(rep, quality=quality, published_at=NOW, mode="PRODUCTION")
        self.assertEqual(out["lifecycle"], "FAILED")
        self.assertTrue(any("시험 자료" in p for p in out["validationProblems"]))

    def test_명령줄_발행은_승인_문_앞에서_멈춘다(self):
        """--publish 를 줘도 사람 승인이 없으면 한 글자도 안 올라간다."""
        import contextlib
        import shutil
        import tempfile
        import cli
        root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rep = cli.main(["intel", "--packet", FIXTURE, "--mode", "TEST", "--publish",
                            "--publish-target", "local", "--publish-root", root])
        said = buf.getvalue()
        self.assertIn("stage=APPROVE", said)
        self.assertIn("approvalState=READY_FOR_REVIEW", said)
        self.assertIn(KEY, said)
        self.assertEqual(rep["reportId"], RID)
        self.assertEqual([f for _, _, fs in os.walk(root) for f in fs], [])

    def test_명령줄에는_승인하는_호출이_없다(self):
        import ast
        import cli
        with open(cli.__file__, encoding="utf-8") as fh:
            tree = ast.parse(fh.read())
        fn = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == "cmd_intel")
        calls = {getattr(c.func, "attr", getattr(c.func, "id", None))
                 for c in ast.walk(fn) if isinstance(c, ast.Call)}
        self.assertNotIn("approve", calls)
        kws = {k.arg for c in ast.walk(fn) if isinstance(c, ast.Call) for k in c.keywords}
        self.assertNotIn("require_approval", kws)


if __name__ == "__main__":
    unittest.main()
