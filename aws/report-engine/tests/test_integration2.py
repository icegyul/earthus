# -*- coding: utf-8 -*-
"""INTEGRATION-2 — 운영 안전 고정 (§1 · §3 · §4 · §5 · §6 · §7 · §8 · §10 · §13).

§14 를 지킨다: 문구 전문을 못박지 않는다. 상태·조건·숫자·연결만 본다.
문구를 보는 곳은 하나뿐이며 그건 사실 여부(리드 분리)라서 정확히 확인한다.
"""
import importlib.util
import json
import os
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.dirname(HERE)
AWS = os.path.dirname(ENGINE)
REPO = os.path.dirname(AWS)
sys.path.insert(0, ENGINE)
sys.path.insert(0, os.path.join(ENGINE, "adapters"))
sys.path.insert(0, os.path.join(AWS, "_shared"))

import capture as cap                    # noqa: E402
import governance as gov                 # noqa: E402
import governance as gov                 # noqa: E402
import public_build as pubbuild           # noqa: E402
import publication_privacy as priv       # noqa: E402
import social_publish as sp              # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


# ── §1 시각자산 불변성 ───────────────────────────────────────────────────────
class VisualAssetImmutability(unittest.TestCase):
    def _req(self):
        return cap.request_for_fact({
            "factId": "fact:2026-08:sst", "phenomenonId": "ocean.sst", "period": "2026-08",
            "layerRefs": ["ocean/sstfield"], "evidenceRefs": ["ocean/series/sst-daily.json"]})

    def _doc(self, **over):
        base = {
            "observed": {"ready": True, "activeIds": ["sstfield"], "lat": 20.0, "lon": 130.0,
                         "dist": cap.dist_for_height_km(24000), "heading": 0, "pitch": -90,
                         "roll": None, "tilt": 0},
            "pixelCheck": {"stdev": 40.5, "minStdev": 6, "passed": True},
            "readBack": {"bytes": 1000, "hashMatches": True, "decoded": {"ok": True, "w": 1280, "h": 720}},
            "fileHash": "sha256:abc", "sourceRoute": "http://x/#v=1", "capturedAt": "2026-09-08T00:00:00Z",
            "viewport": {"w": 1280, "h": 720}, "canvas": {"w": 1280, "h": 720},
            "fileRef": "build/capture/x.jpg",
        }
        base.update(over)
        return base

    def test_여섯_조건이_전부_참일_때만_확인된다(self):
        req = self._req()
        doc = self._doc()
        doc["link"] = req["link"]
        v = cap.verify_capture(req, doc["observed"], capture_doc=doc)
        self.assertTrue(v["verified"], v["problems"])
        self.assertEqual(set(v["conditions"]), set(cap.VERIFY_CONDITIONS))
        self.assertTrue(all(v["conditions"].values()))

    def test_픽셀검사가_없으면_확인되지_않는다(self):
        """빈 프레임인지 모르는 채로 통과시키지 않는다."""
        req = self._req()
        doc = self._doc(); doc.pop("pixelCheck"); doc["link"] = req["link"]
        v = cap.verify_capture(req, doc["observed"], capture_doc=doc)
        self.assertFalse(v["verified"])
        self.assertFalse(v["conditions"]["pixel_variance"])

    def test_파일_되읽기가_어긋나면_확인되지_않는다(self):
        req = self._req()
        doc = self._doc(readBack={"hashMatches": False, "decoded": {"ok": True}})
        doc["link"] = req["link"]
        v = cap.verify_capture(req, doc["observed"], capture_doc=doc)
        self.assertFalse(v["verified"])
        self.assertFalse(v["conditions"]["file_read_back"])

    def test_해시가_없으면_재현할_수_없으므로_확인되지_않는다(self):
        req = self._req()
        doc = self._doc(); doc.pop("fileHash"); doc["link"] = req["link"]
        v = cap.verify_capture(req, doc["observed"], capture_doc=doc)
        self.assertFalse(v["conditions"]["metadata_match"])

    def test_다른_링크로_찍었으면_확인되지_않는다(self):
        req = self._req()
        doc = self._doc(link="#v=1&at=0,0,2,0")
        v = cap.verify_capture(req, doc["observed"], capture_doc=doc)
        self.assertFalse(v["verified"])

    def test_자산_기록이_필수_항목을_전부_갖는다(self):
        req = self._req(); doc = self._doc(); doc["link"] = req["link"]
        v = cap.verify_capture(req, doc["observed"], capture_doc=doc)
        meta = cap.asset_metadata(req, asset_id="vis:1", captured_at=doc["capturedAt"],
                                  dataset_snapshot="snap:1", verification=v,
                                  canvas=doc["canvas"], file_ref=doc["fileRef"],
                                  capture_doc=doc, story_id="story:1")
        for field in ("assetId", "sourceRoute", "cameraState", "layerState", "capturedAt",
                      "viewport", "pixelCheck", "verified", "fileHash"):
            self.assertIn(field, meta, "§1 필수 항목이 빠졌다: %s" % field)
        self.assertIsNotNone(meta["fileHash"])

    def test_카메라_상태에_방향축이_들어_있다(self):
        """§11 — lat/lon/height 만으로는 어디를 보고 있었는지 알 수 없다."""
        req = self._req(); doc = self._doc(); doc["link"] = req["link"]
        v = cap.verify_capture(req, doc["observed"], capture_doc=doc)
        meta = cap.asset_metadata(req, asset_id="v", captured_at="t", dataset_snapshot="s",
                                  verification=v, capture_doc=doc)
        for axis in ("lat", "lon", "heightKm", "heading", "pitch", "roll"):
            self.assertIn(axis, meta["cameraState"])


# ── §2 연결 사슬 ─────────────────────────────────────────────────────────────
class LinkChain(unittest.TestCase):
    def test_자산이_팩트와_스토리를_가리킨다(self):
        req = cap.request_for_fact({"factId": "f1", "phenomenonId": "ocean.sst",
                                    "period": "2026-08", "layerRefs": ["ocean/sstfield"],
                                    "evidenceRefs": ["ocean/series/sst-daily.json"]})
        meta = cap.asset_metadata(req, asset_id="v1", captured_at="t", dataset_snapshot="s",
                                  verification={"verified": True, "conditions": {}, "problems": []},
                                  story_id="story:2026-08:sst.global")
        self.assertIn("f1", meta["factRefs"])
        self.assertEqual(meta["storyId"], "story:2026-08:sst.global")
        self.assertEqual(meta["phenomenonId"], "ocean.sst")
        self.assertTrue(meta["sourceRefs"])


# ── §3 리드 분리 ─────────────────────────────────────────────────────────────
class LeadSeparatedRanking(unittest.TestCase):
    def setUp(self):
        if "boto3" not in sys.modules:
            b = types.ModuleType("boto3"); b.client = lambda *a, **k: object()
            sys.modules["boto3"] = b
        os.environ.setdefault("CACHE_BUCKET", "test-bucket")
        self.M = _load("cyclone_int2", os.path.join(AWS, "cyclone-analog", "handler.py"))

    def _agg(self):
        return self.M._aggregate_scores([
            {"agency": "JMA", "n": 2, "meanErrorKm": 100,
             "byLead": [{"h": 24, "errorKm": 40}, {"h": 120, "errorKm": 400}]},
            {"agency": "KMA", "n": 2, "meanErrorKm": 90,
             "byLead": [{"h": 24, "errorKm": 60}, {"h": 120, "errorKm": 300}]}])

    def test_교차리드_숫자로_순위를_매기지_않는다(self):
        """예전에는 meanErrorKm 오름차순이었다 — 6시간과 120시간을 섞은 순위였다."""
        agg = self._agg()
        self.assertEqual([a["agency"] for a in agg], ["JMA", "KMA"],
                         "이름순이 아니다 — 오차로 정렬하면 그것이 순위다")
        # 오차가 작은 쪽(KMA 90)이 앞에 오면 그건 순위다
        self.assertNotEqual(agg[0]["agency"], "KMA")

    def test_교차리드_평균에_표식이_붙는다(self):
        for a in self._agg():
            self.assertTrue(a["crossLead"])
            self.assertFalse(a["rankingBasis"])

    def test_같은_리드끼리만_비교한다(self):
        agg = self._agg()
        r24 = self.M.lead_separated_ranking(agg, 24)
        r120 = self.M.lead_separated_ranking(agg, 120)
        self.assertEqual([r["agency"] for r in r24], ["JMA", "KMA"])
        self.assertEqual([r["agency"] for r in r120], ["KMA", "JMA"])
        # 두 리드의 승자가 다르다 — 섞으면 안 되는 이유가 이것이다
        self.assertNotEqual(r24[0]["agency"], r120[0]["agency"])

    def test_그_리드에_표본이_없으면_행을_만들지_않는다(self):
        agg = self._agg()
        self.assertEqual(self.M.lead_separated_ranking(agg, 72), [])


# ── §4 자료 없음 보존 ────────────────────────────────────────────────────────
class NoDataPreserved(unittest.TestCase):
    def test_참값을_숫자로_바꾸지_않는다(self):
        val = _load("earthus_val_i2", os.path.join(AWS, "distribution", "validation.py"))
        pool = val.numeric_pool([{"metric": "mean", "value": 1.5, "sampleCount": 3,
                                  "comparison": {"flag": False, "other": True, "anomaly": 0.7}}])
        self.assertNotIn(0.0, pool)
        self.assertNotIn(1.0, pool)
        self.assertIn(1.5, pool)

    def test_성적표가_평가불가_행을_남긴다(self):
        # ⚠️ `import generator` 를 쓰면 안 된다. 이 저장소에는 generator.py 가 둘이고,
        #    바로 위 시험이 distribution/validation.py 를 올리면서 aws/distribution 을
        #    sys.path 맨 앞에 넣는다 — 그러면 배포 쪽 generator 가 잡힌다.
        #    실제로 이 시험이 그렇게 깨졌다. 경로로 명시해서 부른다.
        gen = _load("earthus_report_generator_i2",
                    os.path.join(ENGINE, "generator.py"))
        import report_contract as rc
        evals = [rc.make_verification(prediction_id="p1", phenomenon_id="weather.precipitation",
                                      metric_set=None, not_verifiable="NO_OBSERVATION_ARCHIVE")]
        card = gen.build_forecast_scorecard("2026-08", evals)
        self.assertEqual(card["notEvaluatedCount"], 1)
        row = card["rows"][0]
        self.assertFalse(row["evaluated"])
        self.assertTrue(row["reason"])
        # 0 으로 캐스팅되지 않았다
        self.assertNotIn("scores", row)

    def test_화면이_숫자_아닌_값을_숫자로_그리지_않는다(self):
        """report-center.js 의 num()/isMissing() 가 있어야 false 가 0 으로 안 보인다."""
        with open(os.path.join(REPO, "prototype", "v2-three", "js", "report-center.js"),
                  encoding="utf-8") as fh:
            src = fh.read()
        self.assertIn("Number.isFinite", src)
        self.assertIn("typeof v === 'boolean'", src)


# ── §5 초안 비공개 ───────────────────────────────────────────────────────────
class DraftPrivacy(unittest.TestCase):
    def _content(self, status, **over):
        base = {"contentId": "CNT-1", "status": status, "eligibility": "REVIEW_REQUIRED"}
        base.update(over)
        return base

    def test_초안은_공개가_아니다(self):
        for st in ("DRAFT", "FACT_CHECK", "REVIEW", "REJECTED", "REVISION_REQUIRED"):
            vis, why = priv.content_visibility(self._content(st))
            self.assertEqual(vis, "PRIVATE", "%s 가 공개로 판정됐다" % st)
            self.assertTrue(why)

    def test_승인과_발행만_공개다(self):
        self.assertEqual(priv.content_visibility(self._content("PUBLISHED"))[0], "PUBLIC")
        self.assertEqual(priv.content_visibility(self._content("APPROVED"))[0], "PUBLIC_PREVIEW")

    def test_차단된_것은_상태와_무관하게_비공개다(self):
        c = self._content("PUBLISHED", eligibility="BLOCKED")
        self.assertEqual(priv.content_visibility(c)[0], "PRIVATE")
        c2 = self._content("APPROVED", blockReasons=["SENSITIVE_EVENT"])
        self.assertEqual(priv.content_visibility(c2)[0], "PRIVATE")

    def test_공개_경로에_초안을_쓰면_막는다(self):
        out = priv.check_public_write("events/distribution-content/CNT-1.json",
                                      self._content("DRAFT"))
        self.assertFalse(out["allowed"])
        self.assertEqual(out["keyVisibility"], "PUBLIC")

    def test_비공개_경로에는_초안을_써도_된다(self):
        out = priv.check_public_write("archive/distribution/CNT-1.json", self._content("DRAFT"))
        self.assertTrue(out["allowed"])

    def test_알려진_구멍을_허용으로_바꾸지_않는다(self):
        """알려진 것은 '아직 못 고친 것'이지 '괜찮은 것'이 아니다."""
        out = priv.check_public_write("events/social-drafts.json", self._content("DRAFT"))
        self.assertFalse(out["allowed"])
        self.assertTrue(out["knownLeak"])

    def test_공개_목록에서_비공개를_걸러낸다(self):
        keep, dropped = priv.filter_for_public(
            [self._content("PUBLISHED"), self._content("DRAFT"), self._content("APPROVED")])
        self.assertEqual(len(keep), 2)
        self.assertEqual(len(dropped), 1)
        self.assertTrue(dropped[0]["reason"])

    def test_공개_문서_안에_숨은_초안을_찾아낸다(self):
        doc = {"years": {"2026": [{"reportId": "report:2026-08", "lifecycle": "PUBLISHED"},
                                  {"reportId": "report:2026-09", "lifecycle": "GENERATING"}]}}
        problems = priv.scan_public_payload(doc)
        self.assertTrue(problems)
        self.assertIn("report:2026-09", problems[0])

    def test_배포_소스의_초안이_공개_빌드에서_빠진다(self):
        """§5 → INTEGRATION-3 §0/§1 — 공개 빌드가 비공개 산출물을 걸러 내는가.

        ⚠️ 실제로 있었던 일: distribution 의 write_local() 이 개발용으로
           prototype/events/distribution-content/ 에 후보를 썼고, 그 안에
           status=DRAFT · eligibility=BLOCKED 인 것이 있었다. 람다는 그걸 공개에
           올리기를 거부하는데, 배포 sync 는 그 거부를 우회했다.

        INTEGRATION-2 는 `deploy-app.sh` 에 `--exclude` 를 붙여 막았고,
        이 시험도 그 문자열을 찾고 있었다. **문자열을 찾는 시험은 약하다** —
        규칙이 스크립트에 있으면 스크립트를 안 거치는 경로에서 그대로 샌다.
        이제 거름망(aws/_shared/public_build.py)에 직접 묻는다.
        """
        proto = os.path.join(REPO, "prototype")
        if not os.path.isdir(proto):
            self.skipTest("배포 소스가 없다")

        offenders = []
        for root, dirs, files in os.walk(proto):
            dirs[:] = [d for d in dirs if d not in ("__pycache__", "node_modules")]
            for fn in files:
                if not fn.endswith(".json"):
                    continue
                p = os.path.join(root, fn)
                if os.path.getsize(p) > 2_000_000:
                    continue
                try:
                    with open(p, encoding="utf-8") as fh:
                        doc = json.load(fh)
                except Exception:                        # noqa: BLE001
                    continue
                if not priv.scan_public_payload(doc):
                    continue
                rel = os.path.relpath(p, proto).replace(os.sep, "/")
                if not pubbuild.denial_for(rel):
                    offenders.append(rel)
        self.assertFalse(
            offenders,
            "배포 소스에 비공개 상태 파일이 있는데 공개 빌드가 걸러 내지 않는다: %s" % offenders[:5])

    def test_공개_빌드_누출_시험(self):
        """§1 PUBLIC_BUILD_LEAK_TEST — 거름망을 빠져나간 비공개가 없어야 한다.

        거름망(DENY_RULES)과 **독립적으로** 판정한다. 규칙을 빠뜨렸는데도
        시험이 통과하면 그 시험은 규칙표를 베낀 것뿐이다.
        """
        proto = os.path.join(REPO, "prototype")
        if not os.path.isdir(proto):
            self.skipTest("배포 소스가 없다")
        plan = pubbuild.plan(proto)
        residual = pubbuild.residual_private(proto, plan["keep"])
        self.assertFalse(residual,
                         "공개 빌드에 비공개가 남았다: %s"
                         % [(r["path"], r["kind"]) for r in residual[:5]])
        self.assertGreater(len(plan["keep"]), 100, "거름망이 전부를 막아 버렸다")
        self.assertGreater(len(plan["denied"]), 0, "아무것도 안 걸렀다 — 거름망이 죽어 있다")

    def test_거름망이_실제로_아는_비공개를_잡는다(self):
        """규칙표가 살아 있는지 확인한다. 하나라도 통과하면 FAIL."""
        must_deny = (
            "supabase/schema.sql",
            "v2-deploy/engine-v11/postgres/20260826_v11_advanced_intelligence.sql",
            "README.md",
            "legal/README.md",
            "devserver.py",
            ".devcert.pem",
            ".devkey.pem",
            "events/social-drafts.json",
            "events/distribution-content.json",
            "events/distribution-content/CNT-2026-000001.json",
            "v2-three/_verify/probe.json",
        )
        for rel in must_deny:
            self.assertIsNotNone(pubbuild.denial_for(rel), "거름망이 %s 를 통과시킨다" % rel)
        # 반대로 앱 자체는 막지 않는다
        for rel in ("index.html", "js/main.js", "v2-three/index.html",
                    "css/app.css", "data/water.json"):
            self.assertIsNone(pubbuild.denial_for(rel), "거름망이 앱 파일 %s 를 막는다" % rel)

    def test_배포가_걸러진_트리만_올린다(self):
        """§0 — 배포 스크립트가 작업 트리를 직접 올리면 FAIL."""
        deploy_sh = os.path.join(AWS, "deploy-app.sh")
        if not os.path.exists(deploy_sh):
            self.skipTest("배포 스크립트가 없다")
        with open(deploy_sh, encoding="utf-8") as fh:
            script = fh.read()
        self.assertIn(pubbuild.PUBLIC_BUILD_DIR.split("/")[-1], script,
                      "배포가 공개 빌드 디렉터리를 쓰지 않는다")
        self.assertNotIn('/../prototype" && pwd', script,
                         "배포가 아직 작업 트리(prototype/)를 직접 원본으로 쓴다")
        self.assertIn("build-public.py", script, "배포가 공개 빌드를 만들지 않는다")

    def test_배포_번들에_초안이_실리지_않았다(self):
        """§5 — 공개 번들을 실제로 훑는다. 초안이 있으면 FAIL."""
        deploy = os.path.join(REPO, "prototype", "v2-deploy")
        if not os.path.isdir(deploy):
            self.skipTest("배포 번들이 없다")
        problems = []
        for root, _dirs, files in os.walk(deploy):
            for fn in files:
                if not fn.endswith(".json"):
                    continue
                p = os.path.join(root, fn)
                if os.path.getsize(p) > 4_000_000:
                    continue
                try:
                    with open(p, encoding="utf-8") as fh:
                        doc = json.load(fh)
                except Exception:                        # noqa: BLE001
                    continue
                for msg in priv.scan_public_payload(doc):
                    problems.append("%s: %s" % (fn, msg))
        self.assertFalse(problems, "공개 번들에 비공개 상태가 있다: %s" % problems[:5])


# ── §6 · §7 · §8 승인과 발행 ─────────────────────────────────────────────────
class _FakeAdapter:
    platform = "x"
    media_required = False

    def __init__(self, *, credentials_present=True, mock=False, status_state="PUBLISHED",
                 post_id="p1", raise_code=None):
        self.credentials_present = credentials_present
        self._mock = mock
        self._state = status_state
        self._post = post_id
        self._raise = raise_code

    def publish(self, payload, *, confirmed=False, actor=None, at=None):
        if self._raise:
            err = RuntimeError("nope")
            err.code = self._raise
            raise err
        if self._mock:
            return {"status": "PUBLISHED", "mock": True, "postId": "mock-1", "url": None,
                    "idempotencyKey": "k1"}
        return {"status": "PUBLISHED", "postId": self._post, "url": "https://x.test/p1",
                "publishedAt": at, "idempotencyKey": "k1"}

    def get_status(self, publication):
        return {"platform": self.platform, "postId": self._post,
                "url": "https://x.test/p1", "state": self._state}


HUMAN = dict(approved_by="dalur", approved_at="2026-09-08T00:00:00Z",
             approval_method="UI_CLICK")


class ApprovalAndPublish(unittest.TestCase):
    def _content(self, status="APPROVED", approved=True, **over):
        base = {
            "contentId": "CNT-1", "status": status,
            "reportIds": ["report:2026-08"], "phenomenonIds": ["ocean.sst"],
            "datasetRefs": ["ocean/series/sst-daily.json"], "claims": [{"text": "x"}],
            "dataSnapshotId": "snap:1", "numericPool": [1.5],
            "platformVersions": {"x": {"text": "hi", "idempotencyKey": "k1"}},
            "visualAssetIds": [],
        }
        base.update(over)
        # INTEGRATION-3 §2 — status 문자열만으로는 더 이상 승인이 아니다.
        # 사람이 승인한 콘텐츠를 만들려면 실제 승인 기록을 찍어야 한다.
        if approved and status == "APPROVED":
            base = sp.approve(base, **HUMAN)
        return base

    def _asset(self, verified=True, **over):
        """§8 여덟 조건을 전부 통과하는 시각자산.

        예전 픽스처는 {assetId, verified} 뿐이었다 — 그래서 '확인됐다'는 표식
        하나만 세우면 공개 콘텐츠에 들어갔다. 되읽기·픽셀검사·레이어 일치가
        빠져도 통과하는 픽스처는 게이트를 시험하지 않는다.
        """
        # ⚠️⚠️ 항목 이름을 지어내지 않는다. tools/earthus_capture.mjs 가 실제로 쓰는
        #    모양 그대로다(fileHash 는 'sha256:' 접두사, readBack 은 hashMatches/decoded).
        #    처음에 이걸 지어냈다가 게이트가 **진짜 자산을 전부 막는데도**
        #    시험은 다 통과했다. 아래 test_진짜_캡처_산출물도_문을_통과한다 가
        #    디스크의 산출물을 직접 본다 — 모양이 갈라지면 거기서 잡힌다.
        a = {
            "assetId": "v1",
            "verified": verified,
            "verifyConditions": {k: True for k in cap.VERIFY_CONDITIONS},
            "fileHash": "sha256:" + "a" * 64,
            "readBack": {"bytes": 62770, "decoded": {"ok": True, "w": 1280, "h": 720},
                         "hashMatches": True},
            "pixelCheck": {"mean": 20.2, "stdev": 40.4, "minStdev": 6, "passed": True},
            "sourceRoute": "http://localhost:8788/v2-three/index.html#v=1&live=sstfield",
            "layerState": {"requested": ["ocean/sstfield"],
                           "requestedLive": ["sstfield"], "observed": ["sstfield"]},
        }
        a.update(over)
        return a

    def test_페이로드_준비는_승인이_아니다(self):
        c = self._content(status="DRAFT")
        out = sp.publish_platform(c, "x", _FakeAdapter(), at="t", confirmed=True)
        self.assertEqual(out["state"], "PAYLOAD_READY")
        self.assertIsNone(out["publishedAt"])

    def test_승인되면_발행하고_되읽어_확인한다(self):
        out = sp.publish_platform(self._content(), "x", _FakeAdapter(), at="t", confirmed=True)
        self.assertEqual(out["state"], "PUBLISHED")
        self.assertTrue(out["readBack"]["verified"])
        for f in ("platform", "contentId", "publishedAt", "remoteUrl", "remoteStatus", "requestId"):
            self.assertIn(f, out)

    def test_자격증명이_없으면_막힌다(self):
        out = sp.publish_platform(self._content(), "x",
                                  _FakeAdapter(credentials_present=False), at="t", confirmed=True)
        self.assertEqual(out["reason"], sp.BLOCKED_NO_CREDENTIALS)
        self.assertNotEqual(out["state"], "PUBLISHED")

    def test_모의_발행을_발행이라고_하지_않는다(self):
        out = sp.publish_platform(self._content(), "x", _FakeAdapter(mock=True),
                                  at="t", confirmed=True)
        self.assertNotEqual(out["state"], "PUBLISHED")
        self.assertTrue(out["readBack"]["mock"])

    def test_되읽은_상태가_발행이_아니면_발행이_아니다(self):
        out = sp.publish_platform(self._content(), "x", _FakeAdapter(status_state="PENDING"),
                                  at="t", confirmed=True)
        self.assertEqual(out["state"], "FAILED")
        self.assertFalse(out["readBack"]["verified"])

    def test_되읽은_글_id_가_다르면_발행이_아니다(self):
        ad = _FakeAdapter(post_id="p1")
        pub = ad.publish({}, confirmed=True, at="t")
        ad._post = "p2"          # 플랫폼이 다른 글을 돌려준다
        v = sp.verify_published(pub, ad)
        self.assertFalse(v["verified"])

    # §10 · §13
    def test_확인되지_않은_시각자산이_붙으면_준비되지_않은_것이다(self):
        c = self._content(visualAssetIds=["v1"])
        r = sp.readiness(c, visual_assets=[self._asset(verified=False)])
        self.assertEqual(r["state"], "NOT_READY")
        self.assertFalse(r["checks"]["visual_verified"])

    def test_확인된_시각자산이면_준비된다(self):
        c = self._content(visualAssetIds=["v1"])
        r = sp.readiness(c, visual_assets=[self._asset(verified=True)])
        self.assertEqual(r["state"], "PAYLOAD_READY", r["problems"])

    def test_리포트를_안_가리키면_준비되지_않는다(self):
        r = sp.readiness(self._content(reportIds=[]))
        self.assertEqual(r["state"], "NOT_READY")

    # ── INTEGRATION-3 §2 사람 승인 ──────────────────────────
    def test_상태만_승인이면_승인이_아니다(self):
        """가장 중요한 하나. distribution/cli.py 가 자동으로 걸어 주는 상태다."""
        c = self._content(status="APPROVED", approved=False)
        self.assertEqual(sp.approval_state(c), "STATUS_ONLY")
        out = sp.publish_platform(c, "x", _FakeAdapter(), at="t", confirmed=True)
        self.assertNotEqual(out["state"], "PUBLISHED")
        self.assertEqual(out["state"], "STATUS_ONLY")

    def test_시스템_계정은_승인할_수_없다(self):
        for who in ("system", "github-actions-bot", "lambda-report-publisher",
                    "svc-earthus", "cron", "anonymous", "", None):
            with self.assertRaises(gov.GovernanceError, msg="%r 가 승인됐다" % who):
                sp.approve(self._content(approved=False), approved_by=who,
                           approved_at="t", approval_method="UI_CLICK")

    def test_승인_방법이_사람의_방법이_아니면_막힌다(self):
        for m in ("AUTO", "PIPELINE", "", None, "auto_approve"):
            with self.assertRaises(gov.GovernanceError):
                sp.approve(self._content(approved=False), approved_by="dalur",
                           approved_at="t", approval_method=m)

    def test_승인은_네_항목을_전부_기록한다(self):
        c = self._content()
        a = c[gov.APPROVAL_FIELD]
        for f in ("approvedBy", "approvedAt", "approvalMethod", "approvalRevision"):
            self.assertTrue(a.get(f), "%s 가 비어 있다" % f)

    # ── §3 승인 판본 잠금 ───────────────────────────────
    def test_승인_뒤_내용이_바뀌면_승인이_깨진다(self):
        c = self._content()
        self.assertEqual(sp.approval_state(c), "APPROVED")
        c2 = dict(c)
        c2["platformVersions"] = {"x": {"text": "몰래 바꾸었다", "idempotencyKey": "k1"}}
        self.assertEqual(sp.approval_state(c2), "APPROVAL_INVALID")
        out = sp.publish_platform(c2, "x", _FakeAdapter(), at="t", confirmed=True)
        self.assertNotEqual(out["state"], "PUBLISHED")

    def test_상태_변경만으로는_승인이_깨지지_않는다(self):
        c = self._content()
        c2 = dict(c, status="SCHEDULED", updatedAt="2026-09-09T00:00:00Z")
        self.assertEqual(sp.approval_state(c2), "APPROVED")

    # ── §5 발행 상태 기계 ─────────────────────────────
    def test_초안에서_발행으로_건너뛸_수_없다(self):
        for a, b in (("DRAFT", "PUBLISHED"), ("DRAFT", "APPROVED"),
                     ("DRAFT", "PUBLISHING"), ("READY_FOR_REVIEW", "PUBLISHED"),
                     ("READY_FOR_REVIEW", "PUBLISHING"), ("PUBLISHED", "PUBLISHED"),
                     ("PUBLISHED", "DRAFT"), ("ARCHIVED", "PUBLISHED")):
            r = gov.can_transition(a, b)
            self.assertFalse(r["allowed"], "%s -> %s 가 허용된다" % (a, b))
            self.assertEqual(r["code"], "FORBIDDEN_TRANSITION")
            self.assertTrue(r["reason"], "%s -> %s 를 막는 이유가 없다" % (a, b))

    def test_허용된_길은_열려_있다(self):
        for a, b in (("DRAFT", "READY_FOR_REVIEW"), ("READY_FOR_REVIEW", "APPROVED"),
                     ("APPROVED", "PUBLISHING"), ("PUBLISHING", "PUBLISHED"),
                     ("PUBLISHED", "ARCHIVED"), ("REJECTED", "DRAFT")):
            self.assertTrue(gov.can_transition(a, b)["allowed"],
                            "%s -> %s 가 막횜다" % (a, b))

    def test_막힌_전이에는_전부_판정이_있다(self):
        for a, b in gov.forbidden_transitions():
            self.assertFalse(gov.can_transition(a, b)["allowed"])

    # ── §8 시각자산 보안 ────────────────────────────
    def test_시각자산_여덟_조건(self):
        good = self._asset()
        self.assertTrue(gov.visual_asset_check(good)["ok"],
                        gov.visual_asset_check(good)["problems"])
        broken = {
            "asset_identified":  dict(assetId=None),
            "verified_flag":     dict(verified=False),
            "verify_conditions": dict(verifyConditions={"runtime_capture": False}),
            "file_hash":         dict(fileHash="nope"),
            "file_read_back":    dict(readBack={"bytes": 1, "hashMatches": False,
                                                "decoded": {"ok": True}}),
            "pixel_check":       dict(pixelCheck={"stdev": 0.2, "minStdev": 6,
                                                  "passed": False}),
            "source_route":      dict(sourceRoute="https://example.com/x?ref=earthus"),
            "layer_state":       dict(layerState={"requestedLive": ["sstfield"],
                                                  "observed": []}),
        }
        self.assertEqual(sorted(broken), sorted(gov.VISUAL_CHECKS),
                         "여덟 조건 중 시험하지 않는 것이 있다")
        for name, over in broken.items():
            out = gov.visual_asset_check(self._asset(**over))
            self.assertFalse(out["ok"], "%s 가 깨졌는데 통과한다" % name)
            self.assertEqual(out["code"], "PUBLIC_CONTENT_INVALID")
            self.assertFalse(out["checks"][name], "%s 조건이 참으로 남아 있다" % name)

    def test_확인_안된_그림은_공개_콘텐츠에_못_들어간다(self):
        c = self._content(visualAssetIds=["v1"], approved=False)
        c = sp.approve(c, **HUMAN)
        broken = self._asset(readBack={"bytes": 1, "hashMatches": False,
                                       "decoded": {"ok": False}})
        r = sp.readiness(c, visual_assets=[broken])
        self.assertEqual(r["state"], "NOT_READY")
        self.assertFalse(r["checks"]["visual_verified"])

    def test_진짜_캡처_산출물도_문을_통과한다(self):
        """픽스처가 아니라 디스크의 진짜 산출물로 게이트를 시험한다.

        ⚠️ 게이트를 처음 썼을 때 항목 이름을 지어냈고(fileHash 를 맨헥스로,
           readBack.ok 로), 그러자 **실제로 확인된 유일한 자산이 막혔다.**
           픽스처만 보는 시험은 그 사실을 잡지 못한다.
        """
        path = os.path.join(REPO, "build", "e2e", "e2e-2026-08.json")
        if not os.path.exists(path):
            self.skipTest("진짜 캡처 산출물이 없다 (integration_e2e.py 를 먼저 돌린다)")
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
        assets = [a for a in (doc.get("visualAssets") or []) if a.get("verified")]
        if not assets:
            self.skipTest("확인된 자산이 없다")
        for a in assets:
            out = gov.visual_asset_check(a)
            self.assertTrue(out["ok"],
                            "진짜로 확인된 자산을 게이트가 막는다: %s" % out["problems"])

    def test_요약이_막힌_것을_숨기지_않는다(self):
        res = [{"platform": "x", "state": "PUBLISHED"},
               {"platform": "instagram", "state": "FAILED",
                "reason": sp.BLOCKED_NO_CREDENTIALS}]
        s = sp.publication_summary(res)
        self.assertIn("instagram", s["blocked"])
        self.assertIn("x", s["published"])


if __name__ == "__main__":
    unittest.main()
