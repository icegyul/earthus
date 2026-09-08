# -*- coding: utf-8 -*-
"""INTEGRATION-7 §10 — 예보·무자료 규칙 여덟 가지를 **영구 회귀 시험**으로 고정한다.

    RULE A  6h/12h/24h/48h/72h/120h 교차리드 순위 금지
    RULE B  모델별 독립 비교 (모델 간 합산 금지)
    RULE C  변수별 독립 비교
    RULE D  표본 수 표시
    RULE E  값 없음 → None/null (0 금지)
    RULE F  bool → 숫자 변환 금지
    RULE G  NOT_EVALUABLE 행 삭제 금지
    RULE H  UNKNOWN → DENY

이 규칙들은 여러 단계에 걸쳐 하나씩 뚫렸다가 막혔다. 다시 뚫리지 않게 여기 모은다.
"""
import importlib.util
import io
import json
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.dirname(HERE)
AWS = os.path.dirname(ENGINE)
REPO = os.path.dirname(AWS)
sys.path.insert(0, ENGINE)
sys.path.insert(0, os.path.join(ENGINE, "adapters"))
sys.path.insert(0, os.path.join(AWS, "_shared"))

import publication_privacy as priv     # noqa: E402

LEADS = (6, 12, 24, 48, 72, 120)


def _text(p):
    with io.open(p, encoding="utf-8", errors="replace") as fh:
        return fh.read()


_JS_BLOCK = re.compile(r"/\*.*?\*/", re.S)
_JS_LINE = re.compile(r"(?m)^\s*//.*$")
_HASH_LINE = re.compile(r"(?m)^\s*#.*$")


def _code(path):
    t = _text(path)
    if path.endswith((".js", ".mjs")):
        return _JS_LINE.sub("", _JS_BLOCK.sub("", t))
    if path.endswith(".py"):
        return _HASH_LINE.sub("", t)
    return t


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


# 공개 화면 중 예보 검증 표를 그리는 것 전부.
PUBLIC_SCREENS = (
    "prototype/v2-three/js/intel-feed.js",
    "prototype/v2-deploy/js/intel-feed.js",
    "prototype/js/lab-report-detail.js",
    "prototype/v2-three/js/report-center.js",
    "prototype/v2-deploy/js/report-center.js",
)


class RuleA_NoCrossLeadRanking(unittest.TestCase):
    """리드를 합친 숫자로 기관 순위를 만들지 않는다."""

    def test_공개_화면이_합산_오차로_정렬하지_않는다(self):
        bad = []
        for rel in PUBLIC_SCREENS:
            p = os.path.join(REPO, rel.replace("/", os.sep))
            if not os.path.exists(p):
                continue
            s = _code(p)
            for m in re.finditer(r"\.sort\(\s*\(([^)]*)\)\s*=>([^;]{0,200})", s):
                body = m.group(2)
                if re.search(r"(headErr|meanErrDeg|meanErrorKm|meanKm)"
                             r"\s*\??\?*[^)]*\)?\s*-", body):
                    bad.append("%s: %s" % (rel, body.strip()[:70]))
        self.assertFalse(bad, "RULE A 위반 — 합산 오차로 순위를 매긴다: %s" % bad)

    def test_람다가_교차리드_값에_표식을_단다(self):
        """합산값을 내보낼 수는 있다. 다만 **순위 근거가 아니라고** 적어야 한다."""
        p = os.path.join(AWS, "cyclone-analog", "handler.py")
        if not os.path.exists(p):
            self.skipTest("cyclone-analog 이 없다")
        s = _text(p)
        self.assertIn('"crossLead": True', s)
        self.assertIn('"rankingBasis": False', s)

    def test_리드별_순위_함수가_있다(self):
        """같은 리드끼리의 비교는 남아 있어야 한다 — 비교 자체를 없애는 게 아니다."""
        p = os.path.join(AWS, "cyclone-analog", "handler.py")
        if not os.path.exists(p):
            self.skipTest("cyclone-analog 이 없다")
        s = _text(p)
        self.assertIn("def lead_separated_ranking(", s)
        self.assertIn("def heading_lead_ranking(", s)

    def test_여섯_리드가_어휘에_있다(self):
        p = os.path.join(AWS, "cyclone-analog", "handler.py")
        if not os.path.exists(p):
            self.skipTest("cyclone-analog 이 없다")
        s = _text(p)
        for lead in LEADS:
            self.assertRegex(s, r"\b%d\b" % lead,
                             "리드 %dh 가 어휘에 없다" % lead)


class RuleBC_ModelAndVariableIndependent(unittest.TestCase):
    """모델과 변수는 각각 독립으로 비교한다 — 합치지 않는다."""

    def _agg(self):
        p = os.path.join(ENGINE, "adapters", "kma_verify_adapter.py")
        if not os.path.exists(p):
            self.skipTest("검증 어댑터가 없다")
        return _load("kv_rule_bc", p)

    def test_모델이_다르면_따로_센다(self):
        kv = self._agg()
        rows = {"days": {"2026-08-01": {
            "GFS|t2m|24h": {"me": 1.0, "mae": 1.0, "rmse": 1.0, "n": 10},
            "ECMWF|t2m|24h": {"me": 5.0, "mae": 5.0, "rmse": 5.0, "n": 10},
        }}}
        agg = kv.aggregate(rows, "2026-08")
        self.assertEqual(len(agg), 2, "모델을 하나로 합쳤다: %r" % agg)
        vals = sorted(v["me"] for v in agg.values())
        self.assertEqual(vals, [1.0, 5.0], "모델 간 값이 섞였다: %r" % agg)

    def test_변수가_다르면_따로_센다(self):
        kv = self._agg()
        rows = {"days": {"2026-08-01": {
            "GFS|t2m|24h": {"me": 1.0, "mae": 1.0, "rmse": 1.0, "n": 10},
            "GFS|wind|24h": {"me": 9.0, "mae": 9.0, "rmse": 9.0, "n": 10},
        }}}
        agg = kv.aggregate(rows, "2026-08")
        self.assertEqual(len(agg), 2, "변수를 하나로 합쳤다: %r" % agg)

    def test_리드가_다르면_따로_센다(self):
        kv = self._agg()
        rows = {"days": {"2026-08-01": {
            "GFS|t2m|24h": {"me": 1.0, "mae": 1.0, "rmse": 1.0, "n": 10},
            "GFS|t2m|120h": {"me": 8.0, "mae": 8.0, "rmse": 8.0, "n": 10},
        }}}
        agg = kv.aggregate(rows, "2026-08")
        self.assertEqual(len(agg), 2, "리드를 하나로 합쳤다: %r" % agg)


class RuleD_SampleSize(unittest.TestCase):
    def test_집계에_표본_수가_들어간다(self):
        p = os.path.join(ENGINE, "adapters", "kma_verify_adapter.py")
        if not os.path.exists(p):
            self.skipTest("검증 어댑터가 없다")
        kv = _load("kv_rule_d", p)
        agg = kv.aggregate(
            {"days": {"2026-08-01": {"GFS|t2m|24h": {"me": 1.0, "mae": 1.0,
                                                     "rmse": 1.0, "n": 7}}}}, "2026-08")
        for v in agg.values():
            self.assertEqual(v["n"], 7)
            self.assertIn("nByMetric", v, "지표별 표본 수가 없다")


class RuleEF_NoDataNotZero(unittest.TestCase):
    def test_값이_없으면_None_이지_0_이_아니다(self):
        p = os.path.join(ENGINE, "adapters", "kma_verify_adapter.py")
        if not os.path.exists(p):
            self.skipTest("검증 어댑터가 없다")
        kv = _load("kv_rule_e", p)
        agg = kv.aggregate(
            {"days": {"2026-08-01": {"GFS|t2m|24h": {"me": 1.0, "mae": None,
                                                     "rmse": None, "n": 5}}}}, "2026-08")
        for v in agg.values():
            self.assertIsNone(v["mae"])
            self.assertIsNone(v["rmse"])
            self.assertNotEqual(v["mae"], 0)

    def test_화면이_null_을_0_으로_가중하지_않는다(self):
        bad = []
        for rel in PUBLIC_SCREENS:
            p = os.path.join(REPO, rel.replace("/", os.sep))
            if not os.path.exists(p):
                continue
            if re.search(r"\(\s*s\.meanErrorKm\s*\|\|\s*0\s*\)", _code(p)):
                bad.append(rel)
        self.assertFalse(bad, "RULE E 위반 — null 을 0 km 로 가중한다: %s" % bad)

    def test_bool_은_숫자가_아니다(self):
        """참/거짓이 숫자 풀에 들어가면 0·1 이 근거 숫자가 된다."""
        p = os.path.join(AWS, "distribution", "validation.py")
        if not os.path.exists(p):
            self.skipTest("검증기가 없다")
        v = _load("dist_validation_rule_f", p)
        fn = getattr(v, "_numeric", None)
        if fn is None:
            self.skipTest("_numeric 이 없다")
        # _numeric 은 값을 돌려주는 게 아니라 "숫자인가"를 판정한다.
        self.assertFalse(fn(True), "True 가 숫자로 통과한다")
        self.assertFalse(fn(False), "False 가 숫자로 통과한다")
        self.assertTrue(fn(1.5))
        self.assertTrue(fn(0), "0 은 숫자다 — 없는 값과 다르다")
        self.assertFalse(fn("x"))
        self.assertFalse(fn(None))

    def test_어댑터가_bool_지표를_받지_않는다(self):
        p = os.path.join(ENGINE, "adapters", "kma_verify_adapter.py")
        if not os.path.exists(p):
            self.skipTest("검증 어댑터가 없다")
        kv = _load("kv_rule_f", p)
        agg = kv.aggregate(
            {"days": {"2026-08-01": {"GFS|t2m|24h": {"me": True, "mae": 2.0,
                                                     "rmse": 2.0, "n": 5}}}}, "2026-08")
        for v in agg.values():
            self.assertIsNone(v["me"], "bool 이 숫자로 가중됐다: %r" % v)


class RuleG_NotEvaluableKept(unittest.TestCase):
    def test_평가불가_행을_지우지_않는다(self):
        """실제 산출물에서 확인한다 — 픽스처가 아니라."""
        p = os.path.join(REPO, "build", "e2e", "report-2026-08.json")
        if not os.path.exists(p):
            self.skipTest("리포트 산출물이 없다 (integration_e2e.py 를 먼저 돌린다)")
        rows = (json.load(io.open(p, encoding="utf-8"))
                .get("forecastScorecard") or {}).get("rows") or []
        ne = [r for r in rows if not r.get("evaluated")]
        self.assertTrue(ne, "평가 불가 행이 하나도 없다 — 지워진 것 아닌가")
        for r in ne:
            self.assertTrue(r.get("reason"), "평가 불가인데 사유가 없다: %r" % r)
            self.assertIsNone(r.get("value"), "평가 불가인데 값이 있다: %r" % r)

    def test_평가불가에_0_점을_주지_않는다(self):
        p = os.path.join(REPO, "build", "e2e", "report-2026-08.json")
        if not os.path.exists(p):
            self.skipTest("리포트 산출물이 없다")
        rows = (json.load(io.open(p, encoding="utf-8"))
                .get("forecastScorecard") or {}).get("rows") or []
        for r in rows:
            if not r.get("evaluated"):
                self.assertNotEqual(r.get("value"), 0, "평가 불가에 0 점: %r" % r)
                self.assertNotEqual(r.get("n"), 0, "평가 불가에 표본 0: %r" % r)


class RuleH_UnknownDenies(unittest.TestCase):
    def test_모르는_접두사에는_쓰지_않는다(self):
        out = priv.check_public_write("no-such-prefix/x.json",
                                      {"contentId": "C", "status": "PUBLISHED"})
        self.assertFalse(out["allowed"])
        self.assertEqual(out["keyVisibility"], "UNKNOWN")

    def test_모르는_상태는_비공개다(self):
        vis, why = priv.content_visibility({"contentId": "C", "status": "WHATEVER"})
        self.assertEqual(vis, "PRIVATE")
        vis, why = priv.report_visibility({"reportId": "R", "lifecycle": "WHATEVER"})
        self.assertEqual(vis, "PRIVATE")

    def test_콘텐츠가_아니면_비공개다(self):
        for junk in (None, [], "문자열", 42):
            vis, why = priv.content_visibility(junk)
            self.assertEqual(vis, "PRIVATE", "%r 이 공개로 판정된다" % (junk,))


if __name__ == "__main__":
    unittest.main()
