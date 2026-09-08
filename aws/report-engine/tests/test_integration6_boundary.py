# -*- coding: utf-8 -*-
"""INTEGRATION-6 — 마지막 남은 교차리드 순위·null 강제·모르는 접두사를 못박는다.

§6   모르는 접두사에는 쓰지 않는다 (예전엔 UNKNOWN 이 곧 허가였다)
§15  공개 화면이 리드를 합친 숫자로 **순위를 매기지 않는다**
§16  값이 없는 것을 0 으로 바꾸지 않는다

⚠️ 네트워크·자격증명을 쓰지 않는다. 운영 실사는 aws/live-audit.py 가 따로 한다.
"""
import io
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


def _text(p):
    with io.open(p, encoding="utf-8", errors="replace") as fh:
        return fh.read()


_JS_BLOCK = re.compile(r"/\*.*?\*/", re.S)
_JS_LINE = re.compile(r"(?m)^\s*//.*$")
_HASH_LINE = re.compile(r"(?m)^\s*#.*$")


def _code(path, text=None):
    """주석을 떼고 코드만 돌려준다.

    ⚠️ 주석까지 잡으면 "예전에 이러지 않았다"는 **설명**이 위반으로 잡힌다.
       그런 검사기는 설명을 지우게 만든다 — 기록이 사라지는 쪽이 더 나쁘다.
       (INTEGRATION-4 에서 같은 실수를 한 번 했다)
    """
    t = _text(path) if text is None else text
    if path.endswith((".js", ".mjs")):
        return _JS_LINE.sub("", _JS_BLOCK.sub("", t))
    if path.endswith(".py"):
        return _HASH_LINE.sub("", t)
    return t


# ── §6 접두사 ────────────────────────────────────────────────────────────────
class PrefixSemantics(unittest.TestCase):
    def test_모르는_접두사에는_쓰지_않는다(self):
        """예전에는 UNKNOWN 이면 그냥 통과였다 — 표에 없는 자리가 곧 허가였다."""
        art = {"contentId": "C1", "status": "PUBLISHED"}
        out = priv.check_public_write("made-up-prefix/x.json", art)
        self.assertFalse(out["allowed"], "모르는 접두사에 쓰기가 허용된다")
        self.assertEqual(out["keyVisibility"], "UNKNOWN")
        self.assertIn("접두사가 표에 없다", out["reason"])

    def test_실측으로_채운_접두사(self):
        """2026-09-08 익명 실측 결과를 표가 그대로 담고 있어야 한다."""
        for k in ("solar/meta.json", "celestrak/catalog.json.gz"):
            self.assertEqual(priv.prefix_visibility(k), "PUBLIC", k)
        for k in ("analysis/aurora-reports.json", "archive/x.json"):
            self.assertEqual(priv.prefix_visibility(k), "PRIVATE", k)

    def test_공개_접두사에는_발행본만(self):
        pub = {"reportId": "R1", "lifecycle": "PUBLISHED"}
        self.assertTrue(priv.check_public_write("reports/R1/v1.json", pub,
                                                kind="report")["allowed"])
        for life in ("DRAFT", "GENERATING", "VALIDATING", "FAILED"):
            out = priv.check_public_write("reports/R1/v1.json",
                                          {"reportId": "R1", "lifecycle": life},
                                          kind="report")
            self.assertFalse(out["allowed"], "%s 가 공개로 허용된다" % life)


# ── §15 교차리드 순위 ────────────────────────────────────────────────────────
# 공개 화면에서 "여러 예보시간을 합친 숫자"로 기관 순위를 만들면 안 된다.
# 실제로 두 화면이 있었고, INTEGRATION-2 는 그중 하나만 고쳤다.
SCREENS = (
    "prototype/v2-three/js/intel-feed.js",
    "prototype/v2-deploy/js/intel-feed.js",
    "prototype/js/lab-report-detail.js",
)


class CrossLeadRanking(unittest.TestCase):
    def test_합산_오차로_정렬하지_않는다(self):
        bad = []
        for rel in SCREENS:
            p = os.path.join(REPO, rel.replace("/", os.sep))
            if not os.path.exists(p):
                continue
            s = _code(p)
            # headErr / meanErrDeg / meanErrorKm 를 비교 함수 안에서 빼는 정렬
            for m in re.finditer(r"\.sort\(\s*\(([^)]*)\)\s*=>([^;]{0,200})", s):
                body = m.group(2)
                if re.search(r"(headErr|meanErrDeg|meanErrorKm|meanKm)\s*\??\?*[^)]*\)?\s*-", body):
                    bad.append("%s: %s" % (rel, body.strip()[:80]))
        self.assertFalse(bad, "리드를 합친 오차로 정렬한다(§15): %s" % bad)

    def test_이름순_정렬을_쓴다(self):
        for rel in SCREENS:
            p = os.path.join(REPO, rel.replace("/", os.sep))
            if not os.path.exists(p):
                continue
            s = _text(p)
            self.assertIn("localeCompare", s,
                          "%s 가 이름순 정렬을 쓰지 않는다" % rel)

    def test_설명이_사실과_맞는다(self):
        """'같은 리드타임에서만 비교'라고 적어 두고 합산값으로 줄을 세우면 안 된다."""
        for rel in ("prototype/v2-three/js/intel-feed.js",
                    "prototype/v2-deploy/js/intel-feed.js"):
            p = os.path.join(REPO, rel.replace("/", os.sep))
            if not os.path.exists(p):
                continue
            s = _text(p)
            self.assertNotIn("같은 리드타임·같은 표본에서만 비교", s,
                             "%s 의 설명이 표가 하는 일과 다르다" % rel)
            self.assertIn("리드 합산", s, "%s 가 합산이라는 사실을 적지 않는다" % rel)


# ── §16 값이 없는 것을 0 으로 만들지 않는다 ──────────────────────────────────
class NoDataNotZero(unittest.TestCase):
    def test_화면이_null_오차를_0km_로_넣지_않는다(self):
        bad = []
        for rel in SCREENS:
            p = os.path.join(REPO, rel.replace("/", os.sep))
            if not os.path.exists(p):
                continue
            s = _code(p)
            if re.search(r"\(\s*s\.meanErrorKm\s*\|\|\s*0\s*\)", s):
                bad.append(rel)
        self.assertFalse(bad, "값 없는 오차를 0 km 로 가중한다(§16): %s" % bad)

    def test_어댑터가_null_지표를_0으로_가중하지_않는다(self):
        p = os.path.join(ENGINE, "adapters", "kma_verify_adapter.py")
        if not os.path.exists(p):
            self.skipTest("어댑터가 없다")
        s = _code(p)
        for pat in (r'\(v\.get\("me"\)\s*or\s*0\.0\)',
                    r'\(v\.get\("mae"\)\s*or\s*0\.0\)',
                    r'\(v\.get\("rmse"\)\s*or\s*0\.0\)'):
            self.assertIsNone(re.search(pat, s),
                              "null 지표를 0.0 으로 가중한다(§16): %s" % pat)

    def test_어댑터가_지표별_표본을_따로_센다(self):
        import kma_verify_adapter as kv
        rows = {
            "2026-08-01": {"GFS|t2m|24": {"me": 1.0, "mae": 2.0, "rmse": 3.0, "n": 10}},
            "2026-08-02": {"GFS|t2m|24": {"me": None, "mae": None, "rmse": None, "n": 10}},
        }
        agg = kv.aggregate(rows, "2026-08") if hasattr(kv, "aggregate") else None
        if agg is None:
            self.skipTest("aggregate 를 찾지 못했다")
        for k, v in agg.items():
            # 하루는 값이 있고 하루는 없다 — 평균은 1.0 이어야 한다(0.5 가 아니라)
            self.assertAlmostEqual(v["me"], 1.0, places=3,
                                   msg="값 없는 날이 평균을 끌어내렸다: %r" % v)
            self.assertEqual(v["nByMetric"]["me"], 10,
                             "지표별 표본을 따로 세지 않는다: %r" % v)

    def test_지표가_하나도_없으면_None_이지_0_이_아니다(self):
        import kma_verify_adapter as kv
        if not hasattr(kv, "aggregate"):
            self.skipTest("aggregate 를 찾지 못했다")
        rows = {"2026-08-01": {"GFS|t2m|24": {"me": 1.0, "mae": None,
                                              "rmse": None, "n": 5}}}
        agg = kv.aggregate(rows, "2026-08")
        for k, v in agg.items():
            self.assertIsNone(v["mae"], "값이 없는데 mae 가 숫자다: %r" % v)
            self.assertIsNone(v["rmse"], "값이 없는데 rmse 가 숫자다: %r" % v)
            self.assertEqual(v["nByMetric"]["mae"], 0)


if __name__ == "__main__":
    unittest.main()
