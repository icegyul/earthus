# -*- coding: utf-8 -*-
"""기사 중복 제거와 계보 (PHASE 3H) — 지시서 STEP 2 의 테스트 10종 + 회계·계보.

자격증명이 필요 없다. 전부 순수 함수이고 픽스처만 쓴다.
"""
import pathlib
import sys
import unittest

SHARED = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(SHARED))
import article_dedup as dd  # noqa: E402

KATHMANDU = (27.70, 85.32)
TOKYO = (35.68, 139.77)
LIMA = (-12.05, -77.04)
JAKARTA = (-6.21, 106.85)


def article(article_id, title, publisher, url, at, language="en", point=(None, None)):
    return {"article_id": article_id, "title": title, "publisher": publisher,
            "canonical_url": url, "published_at": at, "language": language,
            "lat": point[0], "lon": point[1]}


def group_of(result, article_id):
    return result["articles"][article_id]["dedupGroupId"]


def relation_of(result, article_id):
    return result["articles"][article_id]["relation"]


class NormalizeTests(unittest.TestCase):
    def test_url_normalization_absorbs_variants(self):
        same = [
            "https://www.example.com/news/flood?utm_source=x&utm_medium=y",
            "https://example.com/news/flood/",
            "HTTPS://Example.COM/news/flood",
            "https://example.com/news/flood/amp",
            "https://example.com/news/flood?fbclid=abc",
            "https://example.com/news/flood?outputType=amp",
        ]
        normalized = {dd.normalize_url(u) for u in same}
        self.assertEqual(1, len(normalized), normalized)
        # 의미가 있는 질의는 남긴다 — 다른 문서일 수 있다
        self.assertNotEqual(dd.normalize_url("https://example.com/a?id=1"),
                            dd.normalize_url("https://example.com/a?id=2"))
        self.assertEqual("", dd.normalize_url(None))

    def test_title_normalization_strips_editorial_affixes(self):
        self.assertEqual(dd.normalize_title("[속보] 네팔 지진"), dd.normalize_title("네팔 지진"))
        self.assertEqual(dd.normalize_title("(LEAD) Nepal quake"), dd.normalize_title("Nepal quake"))
        self.assertEqual(dd.normalize_title("[단독][종합] 네팔 지진"), dd.normalize_title("네팔 지진"))
        self.assertEqual(dd.normalize_title("Nepal quake | Reuters"), dd.normalize_title("Nepal quake"))

    def test_numbers_survive_formatting_and_translation(self):
        self.assertEqual(frozenset({6.2, 12}), dd.numbers("M6.2 earthquake strikes Nepal, 12 dead"))
        self.assertEqual(frozenset({6.2, 12}), dd.numbers("네팔 규모 6.2 지진, 12명 사망"))
        self.assertEqual(frozenset({2000}), dd.numbers("Flooding displaces 2,000 in Jakarta"))
        self.assertEqual(frozenset(), dd.numbers("Rescuers reach remote villages"))


class DedupTests(unittest.TestCase):
    # ── 1. 동일 URL ────────────────────────────────────────────────────────────
    def test_1_same_url(self):
        rows = [article("a1", "Jakarta flood displaces 2,000", "reuters",
                        "https://reuters.com/w/jakarta-flood", "2026-09-10T09:00:00Z", point=JAKARTA),
                article("a2", "Jakarta flood displaces 2,000 residents", "reuters",
                        "https://www.reuters.com/w/jakarta-flood?utm_source=rss", "2026-09-10T09:05:00Z",
                        point=JAKARTA)]
        result = dd.deduplicate(rows)
        self.assertEqual(1, result["counts"]["groups"])
        self.assertEqual(group_of(result, "a1"), group_of(result, "a2"))
        self.assertEqual("a1", result["articles"]["a2"]["rootArticleId"])
        self.assertIn("url-identity", result["groups"][0]["members"][1]["basis"])

    # ── 2. 같은 내용 · 다른 URL ────────────────────────────────────────────────
    def test_2_same_content_different_url(self):
        rows = [article("b1", "Flooding displaces 2,000 in Jakarta", "reuters",
                        "https://reuters.com/world/jakarta", "2026-09-10T09:00:00Z", point=JAKARTA),
                article("b2", "Flooding displaces 2,000 in Jakarta", "reuters",
                        "https://reuters.com/m/world/jakarta-flood-2", "2026-09-10T09:40:00Z", point=JAKARTA)]
        result = dd.deduplicate(rows)
        self.assertEqual(1, result["counts"]["groups"])
        self.assertEqual(dd.REWRITE_OF, relation_of(result, "b2"))
        self.assertEqual(dd.HIGH, result["articles"]["b2"]["dedupConfidence"])
        self.assertIn("content-identity", result["groups"][0]["members"][1]["basis"])

    # ── 3·4. 영어 원문 + 한국어 번역본 ─────────────────────────────────────────
    def test_3_korean_translation_of_english_article(self):
        rows = [article("c-en", "M6.2 earthquake strikes Nepal, 12 dead", "reuters",
                        "https://reuters.com/w/nepal-quake", "2026-09-10T10:00:00Z",
                        language="en", point=KATHMANDU),
                article("c-ko", "네팔 규모 6.2 지진, 12명 사망", "yonhap",
                        "https://yna.co.kr/view/nepal", "2026-09-10T11:00:00Z",
                        language="ko", point=KATHMANDU)]
        result = dd.deduplicate(rows)
        self.assertEqual(1, result["counts"]["groups"])
        self.assertEqual(dd.TRANSLATION_OF, relation_of(result, "c-ko"))
        # 본문 없이 판정하므로 번역은 언제나 LOW 다
        self.assertEqual(dd.LOW, result["articles"]["c-ko"]["dedupConfidence"])
        self.assertEqual(dd.LOW, result["groups"][0]["confidence"])

    def test_4_root_is_the_earliest_not_the_english_one(self):
        """뿌리는 발행이 이른 쪽이다. 영어가 항상 원본이라고 가정하지 않는다."""
        english_first = dd.deduplicate([
            article("d-en", "M6.2 earthquake strikes Nepal, 12 dead", "reuters",
                    "https://reuters.com/w/n", "2026-09-10T10:00:00Z", language="en", point=KATHMANDU),
            article("d-ko", "네팔 규모 6.2 지진, 12명 사망", "yonhap",
                    "https://yna.co.kr/v/n", "2026-09-10T11:00:00Z", language="ko", point=KATHMANDU)])
        self.assertEqual("d-en", english_first["groups"][0]["rootArticleId"])
        self.assertEqual(dd.ORIGINAL, relation_of(english_first, "d-en"))

        korean_first = dd.deduplicate([
            article("e-en", "M6.2 earthquake strikes Nepal, 12 dead", "reuters",
                    "https://reuters.com/w/n", "2026-09-10T11:00:00Z", language="en", point=KATHMANDU),
            article("e-ko", "네팔 규모 6.2 지진, 12명 사망", "yonhap",
                    "https://yna.co.kr/v/n", "2026-09-10T10:00:00Z", language="ko", point=KATHMANDU)])
        self.assertEqual("e-ko", korean_first["groups"][0]["rootArticleId"])
        self.assertEqual(dd.TRANSLATION_OF, relation_of(korean_first, "e-en"))

    # ── 5. 다른 매체가 전재 ────────────────────────────────────────────────────
    def test_5_syndicated_by_another_publisher(self):
        rows = [article("f1", "Flooding displaces 2,000 in Jakarta", "reuters",
                        "https://reuters.com/w/jak", "2026-09-10T09:00:00Z", point=JAKARTA),
                article("f2", "Flooding displaces 2,000 in Jakarta", "straitstimes",
                        "https://straitstimes.com/asia/jak", "2026-09-10T10:30:00Z", point=JAKARTA)]
        result = dd.deduplicate(rows)
        self.assertEqual(1, result["counts"]["groups"])
        self.assertEqual(dd.SYNDICATION_OF, relation_of(result, "f2"))
        self.assertEqual(["reuters", "straitstimes"], result["groups"][0]["publishers"])
        # 전재본이 발견됐다고 그 매체를 지우지 않는다
        self.assertIn("f2", result["articles"])

    # ── 6. 제목만 손본 것 ──────────────────────────────────────────────────────
    def test_6_headline_only_rewrite(self):
        rows = [article("g1", "Flooding displaces 2,000 in Jakarta", "reuters",
                        "https://reuters.com/w/g1", "2026-09-10T09:00:00Z", point=JAKARTA),
                article("g2", "Jakarta flooding displaces 2,000 residents", "reuters",
                        "https://reuters.com/w/g2", "2026-09-10T09:30:00Z", point=JAKARTA)]
        result = dd.deduplicate(rows)
        self.assertEqual(1, result["counts"]["groups"])
        self.assertEqual(dd.REWRITE_OF, relation_of(result, "g2"))

    # ── 7. 시각만 갱신된 기사 ──────────────────────────────────────────────────
    def test_7_updated_article_with_new_timestamp(self):
        rows = [article("h1", "Typhoon nears Okinawa", "jiji",
                        "https://jiji.com/n/h?v=1", "2026-09-10T06:00:00Z", point=TOKYO),
                article("h2", "Typhoon nears Okinawa", "jiji",
                        "https://jiji.com/n/h?v=2", "2026-09-10T12:00:00Z", point=TOKYO)]
        result = dd.deduplicate(rows)
        self.assertEqual(1, result["counts"]["groups"])
        self.assertEqual("h1", result["groups"][0]["rootArticleId"])
        self.assertEqual(dd.REWRITE_OF, relation_of(result, "h2"))

    def test_7b_update_outside_the_window_stays_separate(self):
        rows = [article("i1", "Typhoon nears Okinawa", "jiji",
                        "https://jiji.com/n/i1", "2026-09-01T06:00:00Z", point=TOKYO),
                article("i2", "Typhoon nears Okinawa", "jiji",
                        "https://jiji.com/n/i2", "2026-09-10T06:00:00Z", point=TOKYO)]
        self.assertEqual(2, dd.deduplicate(rows)["counts"]["groups"])

    # ── 8. 제목은 비슷하나 다른 사건 ───────────────────────────────────────────
    def test_8_similar_headline_but_different_event(self):
        rows = [article("j1", "M5.1 earthquake strikes Tokyo", "nhk",
                        "https://nhk.or.jp/n/j1", "2026-09-10T01:00:00Z", point=TOKYO),
                article("j2", "M6.8 earthquake strikes Tokyo", "nhk",
                        "https://nhk.or.jp/n/j2", "2026-09-10T02:00:00Z", point=TOKYO)]
        result = dd.deduplicate(rows)
        self.assertEqual(2, result["counts"]["groups"], "규모가 다르면 다른 사건이다")
        self.assertNotEqual(group_of(result, "j1"), group_of(result, "j2"))

    # ── 9. 좌표 충돌 ───────────────────────────────────────────────────────────
    def test_9_conflicting_locations_are_recorded_not_merged(self):
        rows = [article("k1", "Rescue teams deploy after quake", "reuters",
                        "https://reuters.com/w/k1", "2026-09-10T01:00:00Z", point=TOKYO),
                article("k2", "Rescue teams deploy after quake", "apnews",
                        "https://apnews.com/w/k2", "2026-09-10T02:00:00Z", point=LIMA)]
        result = dd.deduplicate(rows)
        self.assertEqual(2, result["counts"]["groups"])
        self.assertEqual(1, result["counts"]["conflicts"])
        conflict = result["conflicts"][0]
        self.assertEqual("LOCATION", conflict["kind"])
        self.assertEqual(["k1", "k2"], conflict["articleIds"])
        self.assertFalse(conflict["resolved"])
        self.assertGreater(conflict["km"], dd.LOCATION_CONFLICT_KM)

    # ── 10. 같은 사건이지만 다른 기사 ──────────────────────────────────────────
    def test_10_same_event_different_articles_stay_separate(self):
        """이것을 묶는 것은 EVENT FUSION 의 일이다. ARTICLE DEDUP 은 손대지 않는다."""
        rows = [article("l1", "Nepal quake rescuers reach remote villages", "reuters",
                        "https://reuters.com/w/l1", "2026-09-10T09:00:00Z", point=KATHMANDU),
                article("l2", "Aid flights land in Kathmandu after tremor", "apnews",
                        "https://apnews.com/w/l2", "2026-09-10T10:00:00Z", point=KATHMANDU)]
        result = dd.deduplicate(rows)
        self.assertEqual(2, result["counts"]["groups"])
        self.assertEqual(2, len(dd.roots(result)))


class LineageAndAccountingTests(unittest.TestCase):
    def rows(self):
        return [
            article("m-en", "M6.2 earthquake strikes Nepal, 12 dead", "reuters",
                    "https://reuters.com/w/m", "2026-09-10T10:00:00Z", language="en", point=KATHMANDU),
            article("m-ko", "네팔 규모 6.2 지진, 12명 사망", "yonhap",
                    "https://yna.co.kr/v/m", "2026-09-10T11:00:00Z", language="ko", point=KATHMANDU),
            article("m-syn", "M6.2 earthquake strikes Nepal, 12 dead", "straitstimes",
                    "https://straitstimes.com/w/m", "2026-09-10T10:30:00Z", language="en", point=KATHMANDU),
            article("n-other", "Aid flights land in Kathmandu after tremor", "apnews",
                    "https://apnews.com/w/n", "2026-09-10T12:00:00Z", language="en", point=KATHMANDU),
        ]

    def test_nothing_is_deleted(self):
        result = dd.deduplicate(self.rows())
        self.assertEqual(4, result["counts"]["articles"])
        self.assertEqual(4, len(result["articles"]), "모든 기사가 색인에 남아야 한다")
        for identifier in ("m-en", "m-ko", "m-syn", "n-other"):
            self.assertIn(identifier, result["articles"])

    def test_lineage_reaches_the_root(self):
        result = dd.deduplicate(self.rows())
        self.assertEqual([{"articleId": "m-ko", "relation": dd.TRANSLATION_OF},
                          {"articleId": "m-en", "relation": dd.ORIGINAL}],
                         dd.lineage(result, "m-ko"))
        self.assertEqual([{"articleId": "m-en", "relation": dd.ORIGINAL}], dd.lineage(result, "m-en"))
        self.assertEqual([], dd.lineage(result, "does-not-exist"))

    def test_a_group_counts_as_one_independent_source(self):
        """전재·번역이 교차검증 점수를 부풀리지 못한다 (gdelt-events 결함 ①)."""
        result = dd.deduplicate(self.rows())
        self.assertEqual(2, result["counts"]["groups"])
        self.assertEqual(2, dd.independence_units(result))
        wire = next(g for g in result["groups"] if g["rootArticleId"] == "m-en")
        self.assertEqual(3, wire["memberCount"])
        self.assertEqual(3, len(wire["publishers"]), "매체는 3곳이지만")
        self.assertEqual(2, dd.independence_units(result), "독립 출처는 2다")

    def test_output_carries_no_event_identity(self):
        """ARTICLE DEDUP != EVENT FUSION — 산출물에 사건 id 가 없어야 한다."""
        result = dd.deduplicate(self.rows())
        flattened = repr(result).lower()
        for forbidden in ("eventid", "event_id", "earthevt", "dedup_event"):
            self.assertNotIn(forbidden, flattened)

    def test_relations_are_the_four_declared_ones(self):
        result = dd.deduplicate(self.rows())
        used = {member["relation"] for group in result["groups"] for member in group["members"]}
        self.assertTrue(used <= set(dd.RELATIONS), used)

    def test_empty_and_degenerate_input(self):
        for rows in ([], None):
            result = dd.deduplicate(rows)
            self.assertEqual(0, result["counts"]["groups"])
            self.assertEqual([], dd.roots(result))
            self.assertEqual(0, dd.independence_units(result))
        # 시각을 모르는 기사는 뒤로 가되 사라지지 않는다
        result = dd.deduplicate([article("p1", "Untimed report", "x", "https://x.test/1", None),
                                 article("p2", "Dated report", "x", "https://x.test/2", "2026-09-10T00:00:00Z")])
        self.assertEqual(2, len(result["articles"]))
        self.assertEqual("p2", result["groups"][0]["rootArticleId"])

    def test_missing_timestamp_never_merges_on_time(self):
        """시각이 없으면 시간 조건을 통과시키지 않는다 (모르는 것을 0 으로 두지 않는다)."""
        rows = [article("q1", "Flooding displaces 2,000 in Jakarta", "reuters",
                        "https://reuters.com/w/q1", None, point=JAKARTA),
                article("q2", "Flooding displaces 2,000 in Jakarta", "straitstimes",
                        "https://straitstimes.com/w/q2", None, point=JAKARTA)]
        self.assertEqual(2, dd.deduplicate(rows)["counts"]["groups"])


if __name__ == "__main__":
    unittest.main()
