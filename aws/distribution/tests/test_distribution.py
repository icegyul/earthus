# -*- coding: utf-8 -*-
"""배포 엔진 시험 — 지시서 §116 · §117 · §118.

§117 이 이 파일의 중심이다: **일부러 틀린 입력을 만들고, 시스템이 거부하는지 본다.**
통과하는 것만 시험하면 검증기가 있는지 없는지 알 수 없다.

객체 전체 모양을 못박지 않는다(기존 report-engine 시험의 §30 교훈).
'있어야 할 짝'과 '있으면 안 되는 것'만 확인한다.
"""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(HERE)
sys.path.insert(0, PKG)
sys.path.insert(0, os.path.join(os.path.dirname(PKG), "_shared"))

import content_contract as cc          # noqa: E402
import provenance as prov              # noqa: E402
import eligibility as el               # noqa: E402
import caption as cap                  # noqa: E402
import hashtags as tags                # noqa: E402
import visual as vis                   # noqa: E402
import validation as val               # noqa: E402
import publish_queue as pq             # noqa: E402
import archive as arch                 # noqa: E402
import generator as gen                # noqa: E402
import sns_adapters as adapters        # noqa: E402

NOW = "2026-09-08T00:00:00Z"
REF = "ocean/lab-reports.json"


def fact(fid="fact:t:1", value=6.3, metric="규모", phen="hazards.earthquake", **kw):
    import report_contract as rc
    return rc.make_fact(fact_id=fid, phenomenon_id=phen, metric=metric, value=value,
                        evidence_refs=[REF], sample_count=kw.pop("sample", 27), **kw)


def candidate(**over):
    facts = [fact(), fact("fact:t:2", 35, "깊이", unit="km")]
    base = {
        "contentType": "NOW",
        "eventId": "earthquake:test1",
        "phenomenonId": "hazards.earthquake",
        "title": "M6.3 시험 지진",
        "headline": None,
        "summary": None,
        "eventTime": "2026-09-03T11:17:00Z",
        "observationPeriod": {"from": "2026-09-03", "to": "2026-09-08"},
        "geometry": {"type": "point", "lat": 52.25, "lon": -169.4, "radiusKm": 200.0},
        "location": None,
        "facts": facts,
        "claims": [cc.make_claim(text="규모: 6.3", claim_type="OBSERVED",
                                 source_refs=[REF], fact_id="fact:t:1"),
                   cc.make_claim(text="깊이: 35 km", claim_type="OBSERVED",
                                 source_refs=[REF], fact_id="fact:t:2")],
        "signals": {"magnitude": 0.5, "duration": 0.4, "public_relevance": 0.3,
                    "data_completeness": 1.0, "anomaly": el.UNKNOWN,
                    "extent": el.UNKNOWN, "novelty": 0.6},
        "truthType": "OFFICIAL_OBSERVATION",
        "sourceCount": 2,
        "sampleCount": 27,
        "datasetRefs": [REF],
        "sourceTexts": ["M6.3 시험 지진"],
        "verified": True,
    }
    base.update(over)
    return base


def build(**over):
    return gen.generate(candidate(**over), content_id="CNT-2026-000001",
                        generated_at=NOW, snapshot_id="snapshot:test",
                        platforms=["x", "instagram"])


# ── §116 콘텐츠 객체 ─────────────────────────────────────────────────────────
class ContentObject(unittest.TestCase):
    def test_현상도_사건도_리포트도_없으면_고아다(self):
        with self.assertRaises(cc.ContentError):
            cc.make_content(content_id="c", content_type="NOW", generated_at=NOW,
                            generator_version="t", data_snapshot_id="s",
                            title="t", claims=[{"text": "x"}])

    def test_스냅샷_없이는_콘텐츠를_만들_수_없다(self):
        with self.assertRaises(cc.ContentError):
            cc.make_content(content_id="c", content_type="NOW", generated_at=NOW,
                            generator_version="t", data_snapshot_id=None,
                            title="t", claims=[{"text": "x"}], event_ids=["e"])

    def test_관측이라_적으려면_출처가_있어야_한다(self):
        with self.assertRaises(cc.ContentError):
            cc.make_claim(text="바다가 따뜻해졌다", claim_type="OBSERVED", source_refs=[])
        # 해석은 출처 없이도 만들 수 있다 — 해석이라고 적었기 때문이다.
        self.assertTrue(cc.make_claim(text="이례적이다", claim_type="INTERPRETED"))

    def test_문장마다_id_가_붙는다(self):
        c = build()
        ids = [x["claimId"] for x in c["claims"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(i and i.startswith("CNT-") for i in ids))


# ── §26 리뷰 워크플로 ────────────────────────────────────────────────────────
class Workflow(unittest.TestCase):
    def test_초안이_검토를_건너뛰고_발행될_수_없다(self):
        c = build()
        with self.assertRaises(cc.ContentError):
            cc.transition(c, "PUBLISHED", actor="a", at=NOW)

    def test_전이는_전부_기록된다(self):
        c = build()
        for s in ("FACT_CHECK", "REVIEW", "APPROVED"):
            c = cc.transition(c, s, actor="tester", at=NOW)
        self.assertEqual(len(c["audit"]), 3)
        self.assertEqual(c["status"], "APPROVED")
        self.assertTrue(c["approvedAt"])

    def test_LEVEL_3_은_사유_없이_발행되지_않는다(self):
        c = build()
        c["safetyLevel"] = "LEVEL_3_HUMAN_ONLY"
        for s in ("FACT_CHECK", "REVIEW", "APPROVED"):
            c = cc.transition(c, s, actor="a", at=NOW, note="ok")
        with self.assertRaises(cc.ContentError):
            cc.transition(c, "PUBLISHED", actor="a", at=NOW)
        self.assertTrue(cc.transition(c, "PUBLISHED", actor="a", at=NOW, note="사람이 확인"))


# ── §10 · §11 자격과 신뢰도 ──────────────────────────────────────────────────
class Eligibility(unittest.TestCase):
    def test_알_수_없는_기준은_0점이_아니라_분모에서_빠진다(self):
        a, used_a, unk_a = el.score({"magnitude": 1.0, "anomaly": el.UNKNOWN})
        b, _u, _k = el.score({"magnitude": 1.0})
        self.assertEqual(a, b, "UNKNOWN 이 0점처럼 점수를 끌어내렸다")
        self.assertIn("anomaly", unk_a)

    def test_아무것도_모르면_점수가_0_이_아니라_없음이다(self):
        s, used, unknown = el.score({k: el.UNKNOWN for k, _l, _w in el.SIGNALS})
        self.assertIsNone(s)
        self.assertEqual(used, {})

    def test_신뢰도에는_언제나_이유가_붙는다(self):
        for kw in ({"truth_type": "OFFICIAL_OBSERVATION", "source_count": 3},
                   {}, {"feed_confidence": "high"}):
            conf, reasons = el.confidence_for(**kw)
            self.assertIn(conf, cc.CONFIDENCE)
            self.assertTrue(reasons, f"{kw} 에 이유가 없다")

    def test_인명_표현이_있으면_사람만_만든다(self):
        lvl, why = el.safety_level_for(content_type="NOW", priority="P3",
                                       text_blob="사망자 3명이 확인됐다")
        self.assertEqual(lvl, "LEVEL_3_HUMAN_ONLY")
        self.assertTrue(why)

    def test_규모_척도는_현상마다_다르다(self):
        # 지진 M6 와 태풍 30m/s 가 같은 값이 되면 순위가 뒤섞인다.
        self.assertNotEqual(el.magnitude_earthquake(6.0), el.magnitude_wind(30.0))

    def test_차단_사유를_하나만_돌려주지_않는다(self):
        d = el.decide(signals={}, confidence="LOW", safety_level="LEVEL_2_REVIEW",
                      has_source=False, has_numbers_backed=False)
        self.assertEqual(d["eligibility"], "BLOCKED")
        self.assertGreaterEqual(len(d["blockReasons"]), 3)


# ── §22 · §23 캡션 ───────────────────────────────────────────────────────────
class Caption(unittest.TestCase):
    def test_신뢰도와_출처는_어느_플랫폼에서도_남는다(self):
        c = build()
        for p in ("x", "instagram"):
            text = cap.caption_for(c, platform=p, link="https://earthus.net")
            self.assertIn("신뢰도", text, f"{p} 에서 신뢰도가 잘렸다")
            self.assertIn("출처", text, f"{p} 에서 출처가 잘렸다")
            self.assertLessEqual(len(text), cc.PLATFORM_LIMITS[p])

    def test_자극적_표현은_조용히_지우지_않고_거부한다(self):
        c = build()
        c["title"] = "사상 최악의 지진"
        with self.assertRaises(cap.CaptionError):
            cap.caption_for(c, platform="x")

    def test_해석은_해석이라고_적고_나온다(self):
        c = build()
        c["claims"].append(cc.make_claim(text="이례적인 양상과 일치한다",
                                         claim_type="INTERPRETED", source_refs=[REF]))
        blocks = cap.build_blocks(c)
        self.assertIn("해석:", blocks.get("WHY", ""))

    def test_사건_시각과_추적_기간을_섞지_않는다(self):
        c = build()
        c["observationPeriodKind"] = "TRACKING"
        blocks = cap.build_blocks(c)
        self.assertIn("발생", blocks["WHEN"])
        self.assertIn("추적", blocks["WHEN"])


# ── §24 해시태그 ─────────────────────────────────────────────────────────────
class Hashtags(unittest.TestCase):
    def test_플랫폼마다_개수가_다르다(self):
        kw = dict(phenomenon_ids=["hazards.earthquake"], content_type="NOW")
        self.assertLessEqual(len(tags.build(platform="x", **kw)), tags.MAX_TAGS["x"])
        self.assertGreater(len(tags.build(platform="instagram", **kw)),
                           len(tags.build(platform="x", **kw)))

    def test_같은_입력은_같은_순서를_낸다(self):
        kw = dict(phenomenon_ids=["hazards.earthquake", "weather.wind"],
                  content_type="NOW", platform="instagram")
        self.assertEqual(tags.build(**kw), tags.build(**kw))

    def test_통제_목록_밖의_태그를_만들지_않는다(self):
        out = tags.build(phenomenon_ids=["hazards.typhoon"], content_type="NOW",
                         platform="instagram")
        known = set(tags.BASE)
        for v in list(tags.PHENOMENON_TAGS.values()) + list(tags.DOMAIN_TAGS.values()) \
                + list(tags.TYPE_TAGS.values()):
            known |= set(v)
        self.assertTrue(set(out) <= known, f"목록에 없는 태그: {set(out) - known}")


# ── §20 · §21 비주얼 ─────────────────────────────────────────────────────────
class Visual(unittest.TestCase):
    def test_기하에서_카메라를_자동으로_정한다(self):
        near = vis.camera_for({"type": "point", "lat": 37, "lon": 127, "radiusKm": 20})
        far = vis.camera_for({"type": "point", "lat": 37, "lon": 127, "radiusKm": 900})
        self.assertLess(near["heightKm"], far["heightKm"])

    def test_좌표가_없으면_지어내지_않고_전지구로_물러난다(self):
        cam = vis.camera_for({"type": "point", "lat": None, "lon": None})
        self.assertEqual(cam["framing"], "global")
        self.assertTrue(cam["reason"])

    def test_자산_메타데이터가_카메라와_스냅샷을_들고_있다(self):
        c = build()
        spec = vis.make_spec(c, platform="instagram", content_format="SINGLE_IMAGE")
        meta = vis.make_asset_metadata(asset_id="a1", content_id=c["contentId"], spec=spec,
                                       captured_at=NOW, dataset_snapshot="snapshot:test")
        self.assertEqual(meta["datasetSnapshot"], "snapshot:test")
        self.assertIsNotNone(meta["cameraPosition"]["lat"])
        self.assertTrue(meta["generatorVersion"])

    def test_글만_있는_형식에는_그림_사양이_없다(self):
        c = build()
        self.assertIsNone(vis.make_spec(c, platform="x", content_format="TEXT"))
        ok, problems = vis.validate_spec(None)
        self.assertTrue(ok)
        self.assertEqual(problems, [])


# ── §117 사실 시험 — 일부러 틀린 것을 넣는다 ─────────────────────────────────
class FactTests(unittest.TestCase):
    """여기가 §117 이다. 전부 **거부되어야** 통과다."""

    def _fails(self, c, code):
        r = val.validate_content(c, facts=c.get("sourceFacts"))
        codes = [p["code"] for p in r["problems"]]
        self.assertEqual(r["status"], "FAILED", f"{code} 를 통과시켰다")
        self.assertIn(code, codes, f"{code} 가 아니라 {codes} 로 걸렸다")

    def test_지어낸_숫자를_거부한다(self):
        c = build()
        c["claims"][0]["text"] = "규모: 9.9"        # 출처에 없는 값
        self._fails(c, "NUMBER_NOT_IN_SOURCE")

    def test_자릿수가_다르면_반올림으로_봐주지_않는다(self):
        c = build()
        c["claims"][0]["text"] = "규모: 63"          # 6.3 의 10배
        self._fails(c, "NUMBER_NOT_IN_SOURCE")

    def test_반올림은_날조가_아니다(self):
        c = build()
        c["claims"][0]["text"] = "규모: 6.3"
        r = val.validate_content(c, facts=c["sourceFacts"])
        self.assertEqual(r["status"], "PASSED")

    def test_지어낸_날짜를_거부한다(self):
        c = build()
        c["claims"][0]["text"] = "발생: 1999-01-01"
        self._fails(c, "DATE_NOT_IN_SOURCE")

    def test_출처_없는_관측_문장을_거부한다(self):
        c = build()
        c["claims"][0]["sourceRefs"] = []
        self._fails(c, "NO_SOURCE")

    def test_없는_팩트를_가리키면_거부한다(self):
        c = build()
        c["claims"][0]["factId"] = "fact:없는것"
        self._fails(c, "ORPHAN_REFERENCE")

    def test_이유_없는_신뢰도를_거부한다(self):
        c = build()
        c["confidenceReason"] = []
        self._fails(c, "CONFIDENCE_WITHOUT_REASON")

    def test_근거_없는_인과를_거부한다(self):
        c = build()
        c["claims"].append(cc.make_claim(text="지구온난화 때문에 일어났다",
                                         claim_type="ANALYZED", source_refs=[REF]))
        self._fails(c, "UNSUPPORTED_CAUSALITY")

    def test_근거_없는_예측을_거부한다(self):
        c = build()
        c["claims"].append(cc.make_claim(text="앞으로 더 커질 것이다",
                                         claim_type="ANALYZED", source_refs=[REF]))
        self._fails(c, "UNSUPPORTED_PREDICTION")

    def test_남은_자리표시자를_거부한다(self):
        c = build()
        c["summary"] = "TODO 여기에 요약"
        self._fails(c, "UNRESOLVED_PLACEHOLDER")

    def test_좌표가_틀리면_거부한다(self):
        c = build()
        c["geometry"] = {"type": "point", "lat": 999, "lon": 0}
        self._fails(c, "INVALID_LOCATION")

    def test_출처를_풀_수_없는_자료를_거부한다(self):
        c = build()
        c["datasetRefs"] = ["누가/만든지/모르는.json"]
        self._fails(c, "BROKEN_PROVENANCE")

    def test_제목에_지어낸_숫자를_넣어도_잡는다(self):
        # 제목이 검사에서 빠지면 제목에 아무 숫자나 넣을 수 있다.
        c = build()
        c["title"] = "M9.9 시험 지진"
        c["sourceTexts"] = []
        self._fails(c, "NUMBER_NOT_IN_SOURCE")

    def test_생성물로_숫자_풀을_만들지_않는다(self):
        # sourceTexts 는 '원문 그대로'만 담는다. 제목을 바꿔 놓고 그 제목을
        # 원문이라 우기면 통과해서는 안 된다 — 어댑터가 원문을 넣기 때문이다.
        c = build()
        c["title"] = "M9.9 시험 지진"
        r = val.validate_content(c, facts=c["sourceFacts"])
        self.assertEqual(r["status"], "FAILED",
                         "생성된 제목의 숫자가 스스로를 인가했다")

    def test_검증에_걸리면_자격이_BLOCKED_로_내려간다(self):
        c = build()
        c["claims"][0]["text"] = "규모: 9.9"
        out = gen.validate(c)
        self.assertEqual(out["eligibility"], "BLOCKED")
        self.assertIn("VALIDATION_FAILED", out["blockReasons"])


# ── §16 어댑터 ───────────────────────────────────────────────────────────────
class Adapters(unittest.TestCase):
    def _pv(self, platform="x"):
        return build()["platformVersions"][platform]

    def test_다섯_종이_전부_있다(self):
        for p in ("instagram", "x", "facebook", "linkedin", "youtube"):
            self.assertIn(p, adapters.ADAPTERS)
            self.assertTrue(adapters.get(p))

    def test_같은_콘텐츠는_같은_멱등키를_낸다(self):
        pv = self._pv()
        a = adapters.get("x").generate_payload(pv)
        b = adapters.get("x").generate_payload(pv)
        self.assertEqual(a["idempotencyKey"], b["idempotencyKey"])

    def test_본문이_바뀌면_멱등키도_바뀐다(self):
        pv = self._pv()
        a = adapters.get("x").generate_payload(pv)
        pv2 = dict(pv, text=pv["text"] + " ")
        b = adapters.get("x").generate_payload(pv2)
        self.assertNotEqual(a["idempotencyKey"], b["idempotencyKey"])

    def test_인스타는_사진_없이_거부한다(self):
        ad = adapters.get("instagram")
        payload = ad.generate_payload(self._pv("instagram"))
        ok, problems = ad.validate_payload(payload)
        self.assertFalse(ok)
        self.assertTrue(any("MEDIA" in p for p in problems))

    def test_유튜브는_제목과_공개범위를_요구한다(self):
        ad = adapters.get("youtube")
        payload = {"provider": "youtube", "text": "t", "mediaId": "m",
                   "idempotencyKey": "k", "title": "", "privacyStatus": None}
        ok, problems = ad.validate_payload(payload)
        self.assertFalse(ok)
        self.assertTrue(any("TITLE" in p for p in problems))
        self.assertTrue(any("PRIVACY" in p for p in problems))

    def test_MOCK_은_가짜_주소를_만들지_않는다(self):
        ad = adapters.get("x", adapters.MODE_MOCK)
        res = ad.publish(ad.generate_payload(self._pv()), at=NOW)
        self.assertEqual(res["status"], "PUBLISHED")
        self.assertTrue(res["mock"])
        self.assertIsNone(res["url"])

    def test_PREVIEW_는_전송하지_않는다(self):
        ad = adapters.get("x", adapters.MODE_PREVIEW)
        res = ad.publish(ad.generate_payload(self._pv()), at=NOW)
        self.assertEqual(res["status"], "PREVIEW_ONLY")

    def test_LIVE_는_조용히_아무것도_안_하지_않는다(self):
        ad = adapters.get("x", adapters.MODE_LIVE, credentials_present=False)
        with self.assertRaises(adapters.AdapterError) as ctx:
            ad.publish(ad.generate_payload(self._pv()), confirmed=True, at=NOW)
        self.assertEqual(ctx.exception.code, "NOT_CONFIGURED")

    def test_LIVE_는_사람_확인_없이_보내지_않는다(self):
        ad = adapters.get("x", adapters.MODE_LIVE, credentials_present=True)
        with self.assertRaises(adapters.AdapterError) as ctx:
            ad.publish(ad.generate_payload(self._pv()), confirmed=False, at=NOW)
        self.assertEqual(ctx.exception.code, "PUBLISH_CONFIRMATION_REQUIRED")

    def test_없는_지표를_있다고_하지_않는다(self):
        caps = adapters.capabilities()
        self.assertIn("saves", caps["instagram"]["metrics"])
        self.assertIn("saves", caps["x"]["unavailableMetrics"])


# ── §28 · §29 큐 ─────────────────────────────────────────────────────────────
class Queue(unittest.TestCase):
    def _approved(self):
        c = build()
        for s in ("FACT_CHECK", "REVIEW", "APPROVED"):
            c = cc.transition(c, s, actor="t", at=NOW)
        return c

    def test_승인되지_않은_콘텐츠는_큐에_못_들어간다(self):
        c = build()
        with self.assertRaises(pq.QueueError):
            pq.enqueue(c, c["platformVersions"]["x"], scheduled_at=NOW)

    def test_차단된_콘텐츠는_큐에_못_들어간다(self):
        c = self._approved()
        c["eligibility"] = "BLOCKED"
        c["blockReasons"] = ["LOW_CONFIDENCE"]
        with self.assertRaises(pq.QueueError):
            pq.enqueue(c, c["platformVersions"]["x"], scheduled_at=NOW)

    def test_영구_실패는_재시도하지_않는다(self):
        c = self._approved()
        item = pq.mark_processing(pq.enqueue(c, c["platformVersions"]["x"],
                                             scheduled_at=NOW), at=NOW)
        out = pq.mark_failed(item, at=NOW, message="토큰 만료",
                             kind=adapters.PERMANENT, code="X_TOKEN_EXPIRED")
        self.assertEqual(out["status"], "FAILED")
        self.assertIsNone(out["nextAttemptAt"])

    def test_일시_실패는_뒤로_미뤄_다시_한다(self):
        c = self._approved()
        item = pq.mark_processing(pq.enqueue(c, c["platformVersions"]["x"],
                                             scheduled_at=NOW), at=NOW)
        out = pq.mark_failed(item, at=NOW, message="rate limit",
                             kind=adapters.TEMPORARY, code="RATE_LIMIT")
        self.assertEqual(out["status"], "QUEUED")
        self.assertGreater(out["nextAttemptAt"], NOW)

    def test_시도를_무한히_하지_않는다(self):
        c = self._approved()
        item = pq.enqueue(c, c["platformVersions"]["x"], scheduled_at=NOW)
        for _ in range(pq.MAX_ATTEMPTS + 2):
            if item["status"] == "FAILED":
                break
            item = pq.mark_processing(item, at=NOW)
            item = pq.mark_failed(item, at=NOW, message="일시", kind=adapters.TEMPORARY)
        self.assertEqual(item["status"], "FAILED")
        self.assertLessEqual(item["attemptCount"], pq.MAX_ATTEMPTS)

    def test_발행된_것은_취소할_수_없다(self):
        c = self._approved()
        item = pq.mark_published(
            pq.mark_processing(pq.enqueue(c, c["platformVersions"]["x"], scheduled_at=NOW),
                               at=NOW),
            {"postId": "p1", "idempotencyKey": "k"}, at=NOW)
        with self.assertRaises(pq.QueueError):
            pq.cancel(item, at=NOW, actor="t", reason="실수")

    def test_일괄_발행은_제공하지_않는다(self):
        with self.assertRaises(pq.QueueError):
            pq.bulk_guard([1, 2], "publish")
        self.assertTrue(pq.bulk_guard([1, 2], "approve"))

    def test_우선순위가_높은_것이_먼저_나온다(self):
        items = [{"status": "QUEUED", "priority": "P3", "nextAttemptAt": NOW, "id": "a"},
                 {"status": "QUEUED", "priority": "P0", "nextAttemptAt": NOW, "id": "b"}]
        self.assertEqual(pq.due(items, now=NOW)[0]["id"], "b")


# ── §33 · §34 · §35 아카이브 ─────────────────────────────────────────────────
class Archive(unittest.TestCase):
    def _published(self):
        c = build()
        for s in ("FACT_CHECK", "REVIEW", "APPROVED"):
            c = cc.transition(c, s, actor="t", at=NOW)
        item = pq.mark_published(
            pq.mark_processing(pq.enqueue(c, c["platformVersions"]["x"], scheduled_at=NOW),
                               at=NOW),
            {"postId": "p1", "idempotencyKey": "k", "publishedAt": NOW, "mock": True}, at=NOW)
        return c, c["platformVersions"]["x"], item

    def test_발행_사실은_아카이브에서_고칠_수_없다(self):
        c, pv, item = self._published()
        rec = arch.archive_publication(c, pv, item, at=NOW)
        with self.assertRaises(arch.ArchiveError):
            arch.amend(rec, {"postId": "다른것"}, actor="t", at=NOW, reason="x")
        self.assertTrue(arch.amend(rec, {"notes": "오타 정정"}, actor="t", at=NOW, reason="x"))

    def test_플랫폼이_안_주는_지표를_0_으로_채우지_않는다(self):
        c, pv, item = self._published()
        rec = arch.archive_publication(c, pv, item, at=NOW)
        rec = arch.record_metrics(rec, {"likes": 10}, platform_metrics=("likes", "impressions"),
                                  at=NOW)
        self.assertEqual(rec["metrics"]["likes"]["value"], 10)
        self.assertEqual(rec["metrics"]["saves"]["state"], arch.NOT_AVAILABLE)
        self.assertNotIn("value", rec["metrics"]["saves"])
        self.assertEqual(rec["metrics"]["impressions"]["state"], arch.NOT_AVAILABLE)

    def test_지표가_없는_게시물을_0_으로_세지_않는다(self):
        c, pv, item = self._published()
        a = arch.archive_publication(c, pv, item, at=NOW)
        a = arch.record_metrics(a, {"likes": 100}, platform_metrics=("likes",), at=NOW)
        b = arch.archive_publication(c, pv, item, at=NOW)
        b["publicationId"] = "PUB:other"
        rows = arch.engagement_by_phenomenon([a, b])["rows"]
        row = [r for r in rows if r["phenomenonId"] == "hazards.earthquake"][0]
        self.assertEqual(row["publications"], 2)
        self.assertEqual(row["withMetrics"], 1)
        self.assertEqual(row["averages"]["likes"], 100)   # 50 이 아니다
        self.assertTrue(row["coverageNote"])

    def test_아카이브가_사건까지_되짚는다(self):
        c, pv, item = self._published()
        rec = arch.archive_publication(c, pv, item, at=NOW)
        self.assertIn("earthquake:test1", rec["eventIds"])
        self.assertIn("hazards.earthquake", rec["phenomenonIds"])
        self.assertEqual(rec["dataSnapshotId"], "snapshot:test")

    def test_자료가_바뀌면_노후로_표시한다(self):
        c = build()
        v = arch.detect_stale(c, current_snapshot_id="snapshot:new")
        self.assertTrue(v["stale"])
        self.assertEqual(v["recommendation"], "REGENERATION_RECOMMENDED")
        self.assertFalse(arch.detect_stale(c, current_snapshot_id="snapshot:test")["stale"])

    def test_다시_만들어도_이전_판이_남는다(self):
        c = build()
        v2 = arch.new_version(c, at=NOW, actor="t", reason="자료 갱신")
        self.assertEqual(v2["version"], 2)
        self.assertEqual(v2["status"], "DRAFT")
        self.assertEqual(len(v2["history"]), 1)
        self.assertEqual(v2["history"][0]["version"], 1)

    def test_감사_기록은_기존_테이블_모양이다(self):
        row = arch.audit_row(action="content_published", actor="u1",
                             object_kind="content", object_id="CNT-1", at=NOW)
        self.assertEqual(set(row), {"actor_id", "action", "object_kind", "object_id",
                                    "detail", "created_at"})
        with self.assertRaises(arch.ArchiveError):
            arch.audit_row(action="아무거나", actor="u", object_kind="c", object_id="1")


# ── §32 출처 ─────────────────────────────────────────────────────────────────
class Provenance(unittest.TestCase):
    def test_사슬이_끊기면_어디가_끊겼는지_말한다(self):
        c = build()
        c["datasetRefs"] = []
        chain = prov.resolve_content(c)
        self.assertFalse(chain["chainComplete"])
        self.assertTrue(chain["brokenLinks"])

    def test_모르는_출처를_지어내지_않는다(self):
        d = prov.resolve_dataset("모르는/파일.json")
        self.assertFalse(d["resolved"])
        self.assertIsNone(d["provider"])
        self.assertEqual(d["truthType"], "UNKNOWN")

    def test_출처_등기부는_같은_자료를_한_줄로_모은다(self):
        reg = prov.source_registry([build(), build()])
        self.assertEqual(reg["count"], 1)
        self.assertEqual(reg["sources"][0]["ref"], REF)


# ── §118 재현성 ──────────────────────────────────────────────────────────────
class Reproducibility(unittest.TestCase):
    def test_같은_입력은_같은_구조를_낸다(self):
        import json
        a = build()
        b = build()
        # 생성 시각은 인자로 고정했으므로 전부 같아야 한다.
        self.assertEqual(json.dumps(a, ensure_ascii=False, sort_keys=True),
                         json.dumps(b, ensure_ascii=False, sort_keys=True))

    def test_숫자_풀은_출처에서만_온다(self):
        c = build()
        pool = set(c["numericPool"])
        self.assertIn(6.3, pool)
        self.assertIn(35.0, pool)
        self.assertNotIn(9.9, pool)


# ── §143 죽은 버튼 없음 ──────────────────────────────────────────────────────
class NoDeadButtons(unittest.TestCase):
    def test_만들지_못한_플랫폼_판은_이유를_남긴다(self):
        c = build()
        # youtube 는 영상이 필수라 사양이 만들어져도 미디어 없이는 발행 못 한다.
        c2 = gen.with_platforms(c, ["youtube"])
        pv = c2["platformVersions"].get("youtube")
        problems = c2.get("platformProblems", {})
        self.assertTrue(pv or problems, "판도 없고 이유도 없다")
        if pv:
            ad = adapters.get("youtube")
            ok, why = ad.validate_payload(ad.generate_payload(pv))
            self.assertFalse(ok)
            self.assertTrue(why)

    def test_능력표가_없는_것을_없다고_말한다(self):
        caps = adapters.capabilities()
        for name, cap_ in caps.items():
            self.assertTrue(cap_["formats"], f"{name} 에 형식이 없다")
            self.assertEqual(set(cap_["metrics"]) & set(cap_["unavailableMetrics"]), set())


if __name__ == "__main__":
    unittest.main(verbosity=2)
