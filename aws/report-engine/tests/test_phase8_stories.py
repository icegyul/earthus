# -*- coding: utf-8 -*-
"""PHASE 8 — 스토리 · 중요도 · 교차도메인 · 놀란 점 · 전망 · 발행 (§17).

§17 의 규칙을 지킨다.
  · 문구 전문을 하드코딩하지 않는다. 렌더러가 자라면 깨지는 시험은 시험이 아니다.
  · 대신 **불변식**을 본다 — 순위와 표현이 맞는가, 근거 없는 숫자가 없는가,
    자료가 없을 때 점수를 만들지 않는가.
  · 문구를 보는 곳이 딱 하나 있다: '3위인데 가장이라고 쓰지 않는다'.
    이건 렌더링이 아니라 **사실 여부**라서 정확히 확인해야 한다.
"""
import os
import sys
import unittest
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.dirname(HERE)
sys.path.insert(0, ENGINE)
sys.path.insert(0, os.path.join(ENGINE, "adapters"))
sys.path.insert(0, os.path.join(os.path.dirname(ENGINE), "_shared"))

import report_contract as rc            # noqa: E402
import significance as sig              # noqa: E402
import stories as stmod                 # noqa: E402
import crossdomain as xd                # noqa: E402
import surprise as sp                   # noqa: E402
import outlook as ol                    # noqa: E402
import compose as cp                    # noqa: E402
import publisher as pub                 # noqa: E402
import narrative as nr                  # noqa: E402
import climate_series_adapter as cs     # noqa: E402
import typhoon_adapter as ty            # noqa: E402
import air_quality_adapter as aq        # noqa: E402

NOW = "2026-09-08T00:00:00Z"


# ── 합성 자료 ────────────────────────────────────────────────────────────────
def series_doc(*, regions, years, august_value, trend=0.0, region_key="regions"):
    """연도 → 일별 값. 윤년은 366개로 만들어 달력 정렬을 실제로 시험한다."""
    out = {}
    for r in regions:
        per_year = {}
        for y in years:
            n = 366 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 365
            base = august_value.get((r, y))
            vals = []
            for i in range(n):
                d = date.fromordinal(date(y, 1, 1).toordinal() + i)
                v = (base if base is not None else 10.0 + trend * (y - min(years)))
                # 8월만 신호를 주고 나머지 달은 다른 값 — 기간을 제대로 자르는지 본다
                vals.append(v if d.month == 8 else v - 5.0)
            per_year[str(y)] = vals
        out[r] = per_year
    return {"generated": NOW, "series": out,
            region_key: {r: r.upper() for r in regions}}


def warm_doc(dataset="land_temp"):
    """1979~2026, 2026년 8월만 확실히 높은 자료."""
    years = list(range(1979, 2027))
    av = {("land", y): 20.0 + (0.2 if y % 3 == 0 else 0.0) for y in years}
    av[("land", 2026)] = 24.0                     # 확실한 1위
    av2 = {("mid", y): 15.0 + (0.1 if y % 2 else 0.0) for y in years}
    av2[("mid", 2026)] = 15.4                     # 눈에 띄지 않는 값
    av.update(av2)
    return series_doc(regions=["land", "mid"], years=years, august_value=av)


def make_facts(doc, dataset="land_temp", period="2026-08"):
    return cs.build_facts(doc, dataset, period)


# ── §2 중요도 ────────────────────────────────────────────────────────────────
class Significance(unittest.TestCase):
    def test_없는_요소를_0으로_채우지_않는다(self):
        """인구 노출 자료가 없다고 점수가 깎이면, 자료 없는 지역이 덜 중요해진다."""
        full = sig.score("hazards.earthquake",
                         {"magnitude": 0.8, "population_exposure": 0.8, "confidence": 0.8})
        partial = sig.score("hazards.earthquake", {"magnitude": 0.8, "confidence": 0.8})
        self.assertAlmostEqual(full["score"], partial["score"], places=6)
        self.assertIn("population_exposure", partial["missingFactors"])

    def test_요소가_하나도_없으면_점수를_만들지_않는다(self):
        out = sig.score("weather.temperature", {})
        self.assertIsNone(out["score"])
        self.assertEqual(out["reason"], "INSUFFICIENT_DATA")

    def test_가중치는_도메인마다_다르다(self):
        self.assertNotEqual(sig.WEIGHTS["hazards.earthquake"], sig.WEIGHTS["ocean.sea_ice"])

    def test_기록이_짧으면_희소성을_말하지_않는다(self):
        self.assertIsNone(sig.rarity_from_rank(1, 3, 3))
        self.assertIsNotNone(sig.rarity_from_rank(1, 40, 40))

    def test_중요도는_위험도가_아니라고_봉투가_말한다(self):
        st = rc.make_story(story_id="s", report_id="r", title="t", summary="s",
                           importance_score=0.9, confidence=1.0, story_type="EXTREME",
                           fact_ids=["f1"])
        self.assertTrue(st["importanceIsNotRisk"])


# ── §1 스토리 ────────────────────────────────────────────────────────────────
class Stories(unittest.TestCase):
    def setUp(self):
        self.doc = warm_doc()
        self.facts = stmod.quality_filter(make_facts(self.doc))
        self.an = {}
        for r in cs.regions_of(self.doc, "land_temp"):
            a = cs.analyze(self.doc, "land_temp", r, "2026-08")
            if a and a.get("mean") is not None:
                self.an[("land_temp", r)] = a
        self.stories = stmod.climate_stories(self.an, self.facts, "2026-08", "report:2026-08")

    def test_스토리는_반드시_팩트를_가리킨다(self):
        self.assertTrue(self.stories)
        ids = {f["factId"] for f in self.facts}
        for s in self.stories:
            self.assertTrue(s["factIds"])
            self.assertTrue(set(s["factIds"]) <= ids)

    def test_스토리는_값을_담지_않는다(self):
        """스토리 봉투에 value 필드가 생기면 팩트와 따로 노는 숫자가 태어난다."""
        for s in self.stories:
            self.assertNotIn("value", s)

    def test_문장의_숫자는_전부_팩트에서_나온다(self):
        ok, probs = nr.validate_stories(self.stories, self.facts)
        self.assertTrue(ok, probs)

    def test_순위가_1위가_아니면_가장이라고_쓰지_않는다(self):
        """3위를 '가장'이라고 쓴 적이 있다. 사실 여부라서 문구를 정확히 본다."""
        for s in self.stories:
            comp = s.get("comparison") or {}
            ranks = [x for x in (comp.get("rankHigh"), comp.get("rankLow")) if x]
            if ranks and min(ranks) > 1:
                self.assertNotIn("가장", s["title"],
                                 "%s: 순위 %s 인데 제목에 '가장'이 있다" % (s["storyId"], ranks))

    def test_종류가_안_붙으면_스토리로_만들지_않는다(self):
        types = {s["storyType"] for s in self.stories}
        self.assertTrue(types <= set(rc.STORY_TYPES))

    def test_품질_거르기가_자료부족을_뺀다(self):
        bad = dict(self.facts[0])
        bad["comparison"] = dict(bad.get("comparison") or {}, dataLabel="INSUFFICIENT_DATA")
        bad["factId"] = "fact:bad"
        self.assertNotIn(bad, stmod.quality_filter(self.facts + [bad]))

    def test_상위_목록이_한_자료로_도배되지_않는다(self):
        picked = stmod.top_stories(self.stories, 5)
        scopes = [(s.get("spatialExtent") or {}).get("scope") for s in picked]
        for sc in set(scopes):
            self.assertLessEqual(scopes.count(sc), 3)


# ── §4 교차도메인 ────────────────────────────────────────────────────────────
class CrossDomain(unittest.TestCase):
    def test_인과_표현은_링크_생성_자체가_막힌다(self):
        with self.assertRaises(ValueError):
            rc.make_cross_domain_link(
                link_id="l", source_phenomenon="ocean.sst", target_phenomenon="ocean.sea_ice",
                relation_type="TEMPORAL_ASSOCIATION", evidence_level="ASSOCIATED",
                fact_refs=["f1"], confidence=1.0,
                explanation_ko="해수온이 높아서 얼음이 녹았기 때문이다")

    def test_팩트_없는_관계를_만들_수_없다(self):
        with self.assertRaises(ValueError):
            rc.make_cross_domain_link(
                link_id="l", source_phenomenon="a.b", target_phenomenon="c.d",
                relation_type="TEMPORAL_ASSOCIATION", evidence_level="COINCIDING",
                fact_refs=[], confidence=1.0, explanation_ko="둘이 같이 나타났습니다")

    def test_추세를_뺀_상관으로_판정한다(self):
        """둘 다 우상향이면 원자료 상관은 1 에 가깝다. 그걸 근거라고 부르면 안 된다."""
        years = list(range(1980, 2027))
        xs = [float(i) for i in range(len(years))]
        ys = [float(i) for i in range(len(years))]
        self.assertAlmostEqual(xd.pearson(xs, ys), 1.0, places=6)
        dx, dy = xd._detrend(years, xs), xd._detrend(years, ys)
        self.assertLess(abs(xd.pearson(dx, dy) or 0), 1.0 + 1e-9)
        self.assertLess(max(abs(v) for v in dx), 1e-6)   # 추세가 전부였다

    def test_기대와_부호가_다르면_알려진_관계를_인용하지_않는다(self):
        lvl = xd._evidence_level(rd=+0.5, n=40, both_extreme=False,
                                 physical=True, expected_sign=-1, same_warm_dir=True)
        self.assertIsNone(lvl)

    def test_표본이_적으면_상관을_쓰지_않는다(self):
        lvl = xd._evidence_level(rd=0.95, n=8, both_extreme=False,
                                 physical=False, expected_sign=None, same_warm_dir=True)
        self.assertIsNone(lvl)

    def test_근거_수준은_정해진_목록_안에_있다(self):
        for lv in rc.EVIDENCE_LEVELS:
            self.assertIn(lv, rc.EVIDENCE_PHRASE)


# ── §3 예상과 달랐던 것 ──────────────────────────────────────────────────────
class Surprise(unittest.TestCase):
    def _verif(self, mae, bias, n=5000):
        return rc.make_verification(
            prediction_id="pred:x", phenomenon_id="weather.temperature",
            metric_set="continuous", observation_value={"sampleCount": n},
            observation_source="ASOS", lead_hours=24, model_id="GFS",
            scores={"mae": mae, "bias": bias})

    def test_치우친_오차만_잡는다(self):
        many = sp.from_verifications([self._verif(1.5, -1.2), self._verif(1.5, 0.05)], "2026-08")
        self.assertEqual(len(many), 1)
        self.assertEqual(many[0]["type"], "MAGNITUDE_OFF")

    def test_표본이_적으면_치우침을_말하지_않는다(self):
        self.assertEqual(sp.from_verifications([self._verif(1.5, -1.2, n=10)], "2026-08"), [])

    def test_예보가_없던_현상은_빗나갔다고_하지_않는다(self):
        gaps = sp.coverage_gaps(["ocean.sst", "weather.temperature"], ["weather.temperature"],
                                extremes=["ocean.sst"])
        self.assertEqual([g["phenomenonId"] for g in gaps], ["ocean.sst"])
        self.assertEqual(gaps[0]["type"], "INSUFFICIENT_FORECAST_COVERAGE")
        self.assertTrue(gaps[0]["wasExtreme"])

    def test_못_내는_판정을_없는_셈_치지_않는다(self):
        sec = sp.build_section([], "2026-08")
        kinds = {x["type"] for x in sec["notComputable"]}
        self.assertIn("DIRECTION_WRONG", kinds)
        self.assertIn("TIMING_OFF", kinds)


# ── §9 전망 ──────────────────────────────────────────────────────────────────
class Outlook(unittest.TestCase):
    def test_짧은_예보로_한_달_전망을_쓰지_않는다(self):
        out = ol.build_content("2026-10")
        self.assertEqual(out["status"], ol.NO_SOURCE)
        self.assertTrue(out["excluded"])
        self.assertTrue(all(s["excludedFor"] in ol.EXCLUSION_REASONS for s in out["excluded"]))

    def test_왜_못_쓰는지_숫자로_남긴다(self):
        a = ol.assess("2026-10")
        for s in a["excluded"]:
            self.assertIn("coveredDays", s)
            self.assertIn("periodDays", s)

    def test_지평이_길수록_요구하는_산출물이_다르다(self):
        self.assertNotEqual(ol.HORIZON_NEEDS["SHORT"], ol.HORIZON_NEEDS["SEASONAL"])

    def test_장기_전망을_예보라고_부르지_않는다(self):
        self.assertEqual(ol.label_for("OUTLOOK", "LONG_RANGE")["ko"], "전망")
        self.assertEqual(ol.label_for("SCENARIO", "LONG_RANGE")["ko"], "시나리오")

    def test_충분히_덮으면_쓸_수_있다고_한다(self):
        src = [{"id": "x", "ref": "r", "kind": "FORECAST", "label": "테스트",
                "maxLeadDays": 40}]
        self.assertEqual(ol.build_content("2026-10", src)["status"], "OK")


# ── §5·§11 절 구성 ───────────────────────────────────────────────────────────
class Compose(unittest.TestCase):
    def _fact(self, phen, period, fid):
        return rc.make_fact(fact_id=fid, phenomenon_id=phen, metric="mean", value=1.0,
                            period=period, source="s", evidence_refs=["ref"])

    def test_자료가_없어도_절을_지우지_않는다(self):
        secs = cp.build_sections("RETROSPECTIVE_MONTHLY", "2026-09", facts=[], stories=[])
        ids = [s["id"] for s in secs]
        self.assertEqual(ids, [x[0] for x in cp.MONTHLY_LAYOUT])

    def test_빈_절은_왜_비었는지_말한다(self):
        secs = cp.build_sections("RETROSPECTIVE_MONTHLY", "2026-09", facts=[], stories=[])
        empty = [s for s in secs if s.get("empty")]
        self.assertTrue(empty)
        for s in empty:
            self.assertIn(s.get("dataLabel"), rc.DATA_LABELS)

    def test_다른_기간_팩트가_이번_달_절에_섞이지_않는다(self):
        """9월 보고서의 '날씨' 절에 8월 채점 팩트가 들어간 적이 있다."""
        facts = [self._fact("weather.temperature", "2026-08", "fact:aug"),
                 self._fact("ocean.sst", "2026-09", "fact:sep")]
        secs = {s["id"]: s for s in cp.build_sections(
            "RETROSPECTIVE_MONTHLY", "2026-09", facts=facts, stories=[])}
        self.assertNotIn("fact:aug", secs["weather"].get("factRefs") or [])
        self.assertIn("fact:sep", secs["ocean"].get("factRefs") or [])

    def test_분기와_연간은_절_구성이_다르다(self):
        q = [s[0] for s in cp.QUARTERLY_LAYOUT]
        a = [s[0] for s in cp.ANNUAL_LAYOUT]
        self.assertIn("persistent_changes", q)
        self.assertIn("what_we_could_not_know", a)
        self.assertNotEqual(q, a)

    def test_보고서_라벨은_본문_절에서_나온다(self):
        secs = [{"id": "cover", "dataLabel": "DATA_COMPLETE"},
                {"id": "weather", "dataLabel": "INSUFFICIENT_DATA"}]
        self.assertEqual(cp.report_data_label(secs), "INSUFFICIENT_DATA")


# ── §13 정본 주소 ────────────────────────────────────────────────────────────
# ── §12 서술 검증기 자체의 구멍 ──────────────────────────────────────────────
class NarrativeMasking(unittest.TestCase):
    """기간 표기를 가리는 규칙이 **진짜 숫자까지** 가리면 검증기가 조용히 헐거워진다."""

    def test_평년_표기는_숫자로_세지_않는다(self):
        self.assertEqual(nr._nums("평년(1991-2020)보다 +0.553"), [0.553])
        self.assertEqual(nr._nums("평년(1991~2020)보다 +0.553"), [0.553])

    def test_다섯자리_표본수를_기간으로_착각하지_않는다(self):
        """뒤 네 자리를 기간으로 지우면 '5' 만 남아 한 자리 규칙으로 통과해 버린다."""
        self.assertIn(59697.0, nr._nums("표본 59697"))

    def test_기간과_리드는_여전히_걸러진다(self):
        self.assertEqual(nr._nums("2026-08 기간 24시간"), [])
        self.assertEqual(nr._nums("2026-Q3 분기"), [])

    def test_영어_문장도_같은_잣대로_본다(self):
        facts = kma_like_facts()
        st = [{"storyId": "s", "factIds": ["f1"], "title": "ok", "summary": "ok",
               "titleEn": "wrong number 99.99", "summaryEn": "ok"}]
        ok, probs = nr.validate_stories(st, facts)
        self.assertFalse(ok)
        self.assertTrue(any("99.99" in p for p in probs))


def kma_like_facts():
    return [rc.make_fact(fact_id="f1", phenomenon_id="weather.temperature", metric="mae",
                         value=1.236, period="2026-08", source="s", sample_count=59697,
                         evidence_refs=["ref"])]


class CanonicalUrl(unittest.TestCase):
    def test_주소와_id_가_서로를_되돌린다(self):
        for rid in ("report:2026-09", "report:2026-Q3", "report:2026", "outlook:2026-10"):
            url = rc.report_url(rid)
            self.assertTrue(url and url.startswith("/reports/"))
            self.assertEqual(rc.report_id_from_url(url), rid)

    def test_모르는_모양이면_주소를_만들지_않는다(self):
        self.assertIsNone(rc.report_url("weird"))
        self.assertIsNone(rc.report_id_from_url("/nope/2026-09"))


# ── §15·§16 발행 ─────────────────────────────────────────────────────────────
class Publish(unittest.TestCase):
    def _report(self, version=1):
        return {"reportId": "report:2026-08", "version": version, "lifecycle": "PUBLISHED",
                "type": "RETROSPECTIVE_MONTHLY"}

    def test_자격증명이_없으면_가짜_성공을_돌려주지_않는다(self):
        # INTEGRATION-2 §6 — 이제 승인 게이트가 앞에 있다. 승인을 통과시킨 뒤
        # **자격증명 단계에서** 막히는지 본다. 불변식은 그대로다: 가짜 성공 없음.
        a = pub.S3PublishAdapter(bucket=None)
        approved = pub.approve(self._report(), approved_by="dalur", approved_at=NOW,
                               approval_method="CLI_CONFIRM")
        out = pub.publish_pipeline(approved, a)
        self.assertFalse(out["ok"])
        self.assertEqual(out["reason"], pub.BLOCKED_NO_CREDENTIALS)
        self.assertFalse(out["published"])

    def test_승인_없이는_올리지_않는다(self):
        """검증 통과(lifecycle=PUBLISHED)는 기계 판정이지 사람 승인이 아니다."""
        import tempfile
        a = pub.LocalPublishAdapter(tempfile.mkdtemp())
        out = pub.publish_pipeline(self._report(), a)
        self.assertFalse(out["ok"])
        self.assertEqual(out["reason"], "NOT_APPROVED")
        self.assertEqual(out["approvalState"], "READY_FOR_REVIEW")

    def test_검증을_통과하지_않은_리포트는_올리지_않는다(self):
        import tempfile
        a = pub.LocalPublishAdapter(tempfile.mkdtemp())
        r = self._report()
        r["lifecycle"] = "DRAFT"
        self.assertFalse(a.publish(r)["ok"])

    def test_같은_판을_두_번_쓰지_않는다(self):
        import tempfile
        a = pub.LocalPublishAdapter(tempfile.mkdtemp())
        first = a.publish(self._report())
        second = a.publish(self._report())
        self.assertTrue(first["published"])
        self.assertFalse(second["published"])
        self.assertTrue(second["alreadyPreserved"])

    def test_판을_올리면_키가_달라진다(self):
        self.assertNotEqual(pub.report_key(self._report(1)), pub.report_key(self._report(2)))

    def test_새_판은_이전_판을_가리킨다(self):
        nxt = pub.next_version(self._report(1))
        self.assertEqual(nxt["version"], 2)
        self.assertIn("#v1", nxt["supersedes"])
        self.assertNotIn("publishedAt", nxt)

    def test_시험_발행은_운영이_아니라고_표시한다(self):
        import tempfile
        a = pub.LocalPublishAdapter(tempfile.mkdtemp())
        self.assertFalse(a.publish(self._report())["production"])

    def test_올린_뒤_다시_받아_대조한다(self):
        import tempfile
        a = pub.LocalPublishAdapter(tempfile.mkdtemp())
        r = self._report()
        a.publish(r)
        self.assertTrue(a.verify(r)["ok"])
        r2 = dict(r, extra="바뀐 내용")
        self.assertFalse(a.verify(r2)["ok"])

    def test_되돌리기는_색인에서만_내린다(self):
        import tempfile
        a = pub.LocalPublishAdapter(tempfile.mkdtemp())
        idx = {"years": {"2026": [{"reportId": "report:2026-08"}, {"reportId": "report:2026-07"}]}}
        out = a.rollback(self._report(), idx)
        ids = [r["reportId"] for r in out["years"]["2026"]]
        self.assertNotIn("report:2026-08", ids)
        self.assertIn("report:2026-07", ids)
        self.assertIn("report:2026-08", out["withdrawn"])


# ── §8 어댑터 ────────────────────────────────────────────────────────────────
class Adapters(unittest.TestCase):
    def test_없는_예보에_점수를_만들지_않는다(self):
        for a in (ty.TyphoonAdapter(), aq.AirQualityAdapter(),
                  cs.ClimateSeriesAdapter("land_temp")):
            out = a.evaluate({}, "2026-08")
            self.assertFalse(out["available"])
            self.assertTrue(out["reason"])
            self.assertTrue(out["detail"])

    def test_대기질은_아무_팩트도_만들지_않는다(self):
        self.assertEqual(aq.AirQualityAdapter().normalize({}, "2026-08"), [])

    def test_확인한_근거를_들고_다닌다(self):
        p = aq.AirQualityAdapter().provenance()
        self.assertTrue(p["probed"])
        self.assertTrue(all("http" in row for row in p["probed"]))

    def test_기간이_안_끝났으면_순위를_내지_않는다(self):
        doc = {"storms": [{"sid": "a", "season": 2026, "pts": [
            [10.0, 130.0, 40, "2026-08-05 00", "TS"]]}]}
        f = ty.build_facts(doc, "2026")[0]
        self.assertEqual(f["comparison"].get("comparisonWithheld"), "PERIOD_NOT_CLOSED")
        self.assertIsNone(f["comparison"].get("rankHigh"))

    def test_윤년을_하루_밀지_않는다(self):
        """8월 1일은 평년 213번째, 윤년 214번째다. 색인으로 자르면 여기서 틀린다."""
        doc = warm_doc()
        years = doc["series"]["land"]
        got = cs._collect(years, "2000-08")     # 윤년
        self.assertEqual(len(got), 31)
        self.assertTrue(all(d.month == 8 for d, _ in got))


class ContractShapes(unittest.TestCase):
    def test_모르는_스토리_종류를_거부한다(self):
        with self.assertRaises(ValueError):
            rc.make_story(story_id="s", report_id="r", title="t", summary="s",
                          importance_score=0.5, confidence=1.0, story_type="NOPE",
                          fact_ids=["f"])

    def test_팩트를_안_가리키는_스토리를_거부한다(self):
        with self.assertRaises(ValueError):
            rc.make_story(story_id="s", report_id="r", title="t", summary="s",
                          importance_score=0.5, confidence=1.0, story_type="EXTREME",
                          fact_ids=[])

    def test_자료_라벨에_사람이_읽을_말이_붙어_있다(self):
        for lab in rc.DATA_LABELS:
            self.assertIn("ko", rc.DATA_LABEL_TEXT[lab])


if __name__ == "__main__":
    unittest.main()
