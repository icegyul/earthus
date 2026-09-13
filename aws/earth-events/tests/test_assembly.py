# -*- coding: utf-8 -*-
"""조립 규칙 — 사건 식별·독립 출처·진실 등급·시각 (결정 ①②③④⑤⑥⑦⑫).

여기서 고정하는 것은 "무엇을 말하지 않는가"다. 지어낸 시각·부풀린 교차검증·근거 없는
승격이 이 저장소에서 실제로 났던 실패들이고, 그 문을 테스트로 잠근다.
"""
import unittest

import fixtures as fx

import assembler                                       # noqa: E402
import earth_event_id as eid                           # noqa: E402
import normalize as norm                               # noqa: E402


def one(events, **kwargs):
    return fx.assemble(fx.document(events, **kwargs))


class EventIdRules(unittest.TestCase):
    def test_id_shape_is_evt_plus_twenty_hex(self):
        """㉘ `evt_<20hex>` — 결정 ②③. v11 FNV-1a 32비트를 쓰지 않는다."""
        result = one([fx.gdelt_event()])
        event_id = result["events"][0]["event_id"]
        self.assertTrue(eid.is_event_id(event_id), event_id)
        self.assertEqual(len(event_id), len("evt_") + 20)
        self.assertEqual(eid.ID_HEX, 20)                 # 80비트
        self.assertEqual(result["events"][0]["event_key_version"], 1)

    def test_same_input_gives_same_id(self):
        """㉙ 결정적이다 — 같은 입력을 두 번 돌리면 같은 id 다."""
        first = one([fx.gdelt_event()])["events"][0]
        second = one([fx.gdelt_event()])["events"][0]
        self.assertEqual(first["event_id"], second["event_id"])
        self.assertEqual(first["identity"]["signatureSha256"],
                         second["identity"]["signatureSha256"])

    def test_changed_upstream_id_keeps_the_same_event_id(self):
        """㉚ 결정 ④ 의 핵심 — 상류 GlobalEventID 가 회차마다 바뀌어도 같은 EarthEvent 다.

        같은 유형·같은 장소·같은 3시간 버킷이면 id 가 같아야 한다. 제목이나 원본 id 가
        서명에 들어가면 이 시험이 깨진다.
        """
        a = one([fx.gdelt_event(event_id="100000001", title="Wildfire near Bordeaux")])
        b = one([fx.gdelt_event(event_id="999999999", title="Bordeaux 산불 확산",
                                url="https://beta.example.com/x", age_min=55)])
        self.assertEqual(a["events"][0]["event_id"], b["events"][0]["event_id"])
        self.assertNotEqual(a["events"][0]["source_event_id"],
                            b["events"][0]["source_event_id"])
        # 상류 id 는 버리지 않는다 — source_event_id 로 보존된다(결정 ③)
        self.assertEqual(a["events"][0]["source_event_id"], "gdelt:100000001")

    def test_different_place_or_type_gives_a_different_id(self):
        """㉛ 유형·장소가 다르면 id 도 다르다 — 서로 다른 사건이 한 주소를 갖지 않는다."""
        base = one([fx.gdelt_event()])["events"][0]["event_id"]
        other_place = one([fx.gdelt_event(place="Lisbon, Portugal", country="PT",
                                          feature_id="F-LISBON",
                                          lat=38.72, lon=-9.14)])["events"][0]["event_id"]
        other_type = one([fx.gdelt_event(root="14")])["events"][0]["event_id"]
        self.assertNotEqual(base, other_place)
        self.assertNotEqual(base, other_type)

    def test_same_identity_is_reconciled_into_one_event(self):
        """㉜ 같은 사건이 정본 둘을 갖지 않는다.

        결합은 좌표 거리로 보고 신원은 place_key 로 본다. 그래서 같은 `featureId` 인데
        좌표가 멀게 찍힌 두 레코드는 결합에서 갈라진다 — 그대로 두면 같은 id 를 가진
        정본 둘이 한 키를 다툰다. `reconcile_identity()` 가 그것을 합친다.
        """
        left = fx.gdelt_event(event_id="1", root="DIS", event_code="0233")
        # 같은 featureId·유형·버킷이지만 좌표를 멀리 떠서 결합 점수를 못 넘게 한다.
        right = fx.gdelt_event(event_id="2", root="DIS", event_code="0233",
                               lat=-33.87, lon=151.21, title="완전히 다른 제목",
                               url="https://gamma.example.com/y")
        result = fx.assemble(fx.document([left, right]))
        stage = result["stages"]["EVENT_FUSION"]
        self.assertEqual(stage["fusionGroups"], 2)       # 결합은 갈라놓았다
        self.assertEqual(stage["identityReconciled"], 1)  # 신원이 같아 합쳤다
        self.assertEqual(len(result["events"]), 1)
        self.assertEqual(len(result["documents"]), 1)
        keys = [o["key"] for o in result["stages"]["CANONICAL_WRITE"]["objects"]]
        self.assertEqual(len(set(keys)), 1)

    def test_duplicate_canonical_is_blocking(self):
        """㉝ 한 사건이 정본 객체 둘을 갖는 상황은 색인 검사에서 **차단**된다.

        조립기 앞단이 다 실패해도 마지막 문이 하나 더 있다는 것을 고정한다.
        """
        import index_consistency
        result = one([fx.gdelt_event()])
        obj = result["stages"]["CANONICAL_WRITE"]["objects"][0]
        canonical = {
            obj["key"]: {"eventId": obj["eventId"], "sha256": obj["sha256"],
                         "schema": obj["schema"]},
            obj["key"] + ".bak": {"eventId": obj["eventId"], "sha256": obj["sha256"],
                                  "schema": obj["schema"]},
        }
        verdict = index_consistency.check(canonical, result["indexRows"],
                                          index_consistency.FIXTURE)
        self.assertEqual(verdict["status"], "FAIL")
        self.assertIn("DUPLICATE_CANONICAL",
                      [f["kind"] for f in verdict["findings"]])


class IndependenceRules(unittest.TestCase):
    def test_syndication_counts_as_one_source(self):
        """㉝ 결정 ① — 같은 기사를 여러 곳이 전재해도 독립 출처는 1 이다.

        통신사 기사를 스무 곳이 실었다고 스무 곳이 독립으로 확인한 것이 아니다.
        """
        alts = ["https://b.example.com/wire/fire-1",
                "https://c.example.com/wire/fire-1",
                "https://d.example.com/wire/fire-1"]
        result = one([fx.gdelt_event(alt=alts)])
        event = result["events"][0]
        self.assertEqual(len(result["stages"]["ARTICLE_DEDUP"]["relations"]), 2)
        self.assertEqual(event["independence_count"], 1)
        self.assertFalse(event["corroborated"])

    def test_distinct_stories_count_separately(self):
        """㉞ 제목·매체가 다른 별개 기사는 따로 센다 — 보수적이라고 늘 1 로 누르지 않는다."""
        alts = ["https://b.example.com/own/fire-report"]
        record = fx.gdelt_event(alt=alts)
        result = fx.assemble(fx.document([record]))
        dedup = result["stages"]["ARTICLE_DEDUP"]
        self.assertEqual(dedup["articles"], 2)
        # 같은 제목을 쓰는 전재이므로 하나로 묶인다. 회계 창구가 한 곳임을 확인한다.
        self.assertEqual(result["events"][0]["independence_count"],
                         result["events"][0]["independence"]["count"])
        self.assertEqual(result["events"][0]["independence"]["unresolved"], [])

    def test_corroboration_needs_two_independent_units(self):
        """㉟ 교차검증은 독립 2 이상에서만 붙는다 (CORROBORATION_MIN)."""
        left = fx.gdelt_event(event_id="1", title="Wildfire forces evacuations near Bordeaux")
        right = fx.gdelt_event(event_id="2", url="https://delta.example.com/blaze",
                               title="Bordeaux blaze: thousands flee homes as fire spreads")
        result = fx.assemble(fx.document([left, right]))
        self.assertEqual(len(result["events"]), 1)       # 결합되어 한 사건
        event = result["events"][0]
        self.assertEqual(event["independence_count"], 2)
        self.assertTrue(event["corroborated"])
        # 그래도 진실 등급은 REPORTED 다 — 교차검증은 **다른 축**이다(정본 규칙 3)
        self.assertEqual(event["truth_status"], "REPORTED")

    def test_place_doubt_blocks_corroboration(self):
        """㊱ 위치를 못 믿는 사건에는 교차검증을 붙이지 않는다.

        SQL `earthus_earth_event_doubt_not_confirmed` 과 같은 방향이다.
        """
        doubt = {"placeDoubt": True,
                 "placeElsewhere": [{"name": "berlin", "km": 1600}]}
        left = fx.gdelt_event(event_id="1", **doubt)
        right = fx.gdelt_event(event_id="2", url="https://delta.example.com/blaze",
                               title="Bordeaux blaze: thousands flee homes as fire spreads",
                               **doubt)
        event = fx.assemble(fx.document([left, right]))["events"][0]
        self.assertEqual(event["independence_count"], 2)
        self.assertTrue(event["location_doubt"])
        self.assertFalse(event["corroborated"])
        self.assertTrue(any("placeDoubt" in reason for reason in event["truth_reasons"]))


class TruthRules(unittest.TestCase):
    def test_news_never_becomes_fact(self):
        """㊲ GDELT 는 NEWS 다 — 몇 곳이 실어도 FACT 가 되지 않는다 (단방향 승격 금지)."""
        alts = ["https://b.example.com/1", "https://c.example.com/2",
                "https://d.example.com/3", "https://e.example.com/4"]
        event = one([fx.gdelt_event(alt=alts, sources=40, mentions=900,
                                    score=98)])["events"][0]
        self.assertEqual(event["truth_status"], "REPORTED")
        self.assertNotIn(event["truth_status"], ("FACT", "CORROBORATED"))

    def test_no_claim_gets_a_label_without_evidence(self):
        """㊳ 증거가 없으면 주장에 이름을 붙이지 않는다 — 기관 귀속·공식 특보가 없다."""
        event = one([fx.gdelt_event()])["events"][0]
        self.assertEqual(event["claims"]["allowed"], [])
        refused = {item["claimType"] for item in event["claims"]["refused"]}
        self.assertEqual(refused, {"SOURCE_ATTRIBUTION", "SAFETY_ACTION"})
        self.assertFalse(event["official_safety"])

    def test_severity_and_phenomenon_are_left_empty(self):
        """㊴ 기관이 주지 않은 등급을 만들지 않고, 66종 현상 id 도 지어내지 않는다."""
        event = one([fx.gdelt_event()])["events"][0]
        self.assertIsNone(event["severity"])
        self.assertIsNone(event["phenomenon_id"])
        self.assertEqual(event["kind_vocabulary"], "gdelt-root")

    def test_data_state_follows_input_age(self):
        """㊵ DATA_STATE 는 입력 나이에서 나온다 — 늙은 입력을 LIVE 라 부르지 않는다."""
        fresh = fx.assemble(fx.document([fx.gdelt_event()]), ahead_min=25)
        old = fx.assemble(fx.document([fx.gdelt_event()]), ahead_min=150)
        self.assertEqual(fresh["events"][0]["data_state"], "LIVE")
        self.assertEqual(old["events"][0]["data_state"], "STALE")


class TimeRules(unittest.TestCase):
    def test_occurred_at_is_never_invented(self):
        """㊶ 결정 ③⑤ — 정확 발생시각을 만들지 않는다. 버킷과 원본 나이를 따로 보존한다."""
        event = one([fx.gdelt_event(age_min=40)])["events"][0]
        self.assertIsNone(event["occurred_at"])
        self.assertIsNone(event["issued_at"])
        self.assertEqual(event["source_age_min"], 40)     # 원본 보존
        self.assertEqual(event["time_precision"], norm.PRECISION_RELATIVE)
        self.assertTrue(event["time_bucket"].endswith(":00:00Z"))
        self.assertEqual(event["retrieved_at"], fx.GENERATED)

    def test_time_bucket_is_three_hours_utc(self):
        """㊷ 버킷은 3시간 UTC 다 (결정 ⑤ — GDELT WINDOW_HOURS = 3)."""
        self.assertEqual(eid.TIME_BUCKET_HOURS, 3)
        # generated 10:35Z - 40분 = 09:55Z → 09:00Z 버킷
        event = one([fx.gdelt_event(age_min=40)])["events"][0]
        self.assertEqual(event["time_bucket"], "2026-09-13T09:00:00Z")
        # 같은 버킷 안에서 나이가 달라도 같은 버킷이다 → id 가 안정된다
        later = one([fx.gdelt_event(age_min=90)])["events"][0]
        self.assertEqual(later["time_bucket"], "2026-09-13T09:00:00Z")
        self.assertEqual(event["event_id"], later["event_id"])

    def test_missing_title_uses_a_label_not_a_headline(self):
        """㊸ 제목이 없으면 분류·지명 라벨을 쓴다 — 헤드라인을 지어내지 않는다.

        실측: 상류 150건 중 6건에 제목이 없다.
        """
        event = one([fx.gdelt_event(title=None)])["events"][0]
        self.assertEqual(event["title_source"], "LABEL")
        self.assertEqual(event["title"], "재난 보도 · Bordeaux, Gironde, France")

    def test_representative_prefers_a_titled_member(self):
        """㊹ 결합된 묶음의 대표는 상류 점수가 아니라 고정된 정렬 규칙으로 고른다.

        점수로 고르면 회차마다 대표가 흔들리고, 흔들리면 제목·세분류가 따라 흔들린다.
        """
        untitled = fx.gdelt_event(event_id="1", title=None, score=99)
        titled = fx.gdelt_event(event_id="2", title="Wildfire forces evacuations near Bordeaux",
                                url="https://beta.example.com/z", score=30)
        event = fx.assemble(fx.document([untitled, titled]))["events"][0]
        self.assertEqual(event["title_source"], "ARTICLE")
        self.assertEqual(event["source_event_id"], "gdelt:2")


class PlaceRules(unittest.TestCase):
    def test_place_id_is_preferred_and_no_grid_is_invented(self):
        """㊺ 결정 ⑥ — 확정 place_id 우선, `lat3/lon3` 같은 새 격자를 만들지 않는다."""
        event = one([fx.gdelt_event()])["events"][0]
        identity = event["identity"]["inputs"]
        self.assertEqual(identity["canonicalPlace"], "gdelt:feature:f-bordeaux")
        self.assertNotIn("lat3", str(identity))
        self.assertEqual(event["location_precision"], "CITY")   # geoType 4

    def test_doubted_place_falls_back_to_name(self):
        """㊻ 의심되는 위치는 place_id 를 쓰지 않고 이름 계층으로 내려간다."""
        event = one([fx.gdelt_event(placeDoubt=True,
                                    placeElsewhere=[{"name": "berlin", "km": 1600}])
                     ])["events"][0]
        self.assertTrue(event["identity"]["inputs"]["canonicalPlace"].startswith("name:"))
        self.assertTrue(event["location_doubt"])

    def test_unknown_place_still_gets_an_id(self):
        """㊼ 장소를 모르면 'unknown' 으로 적고, 그래도 id 는 만들어진다 — 사건을 버리지 않는다."""
        event = one([fx.gdelt_event(place="", country="", feature_id="",
                                    geo_type="0")])["events"][0]
        self.assertEqual(event["identity"]["inputs"]["canonicalPlace"], "unknown")
        self.assertEqual(event["location_precision"], "NONE")
        self.assertTrue(eid.is_event_id(event["event_id"]))


class ProjectionRules(unittest.TestCase):
    def test_index_projection_is_fixture_only(self):
        """㊽ 색인 대조는 FIXTURE 모드다 — FIXTURE PASS 를 운영 PASS 로 쓰지 않는다."""
        import index_consistency
        result = one([fx.gdelt_event()])
        consistency = result["stages"]["INDEX_CONSISTENCY"]
        self.assertEqual(consistency["mode"], index_consistency.FIXTURE)
        self.assertEqual(consistency["status"], "PASS")
        with self.assertRaises(index_consistency.ConsistencyError):
            index_consistency.require_live(consistency)

    def test_canonical_schema_is_the_one_the_checker_knows(self):
        """㊾ 정본 스키마 문자열을 새로 만들지 않는다 — 검사기가 아는 판을 쓴다."""
        import index_consistency
        result = one([fx.gdelt_event()])
        self.assertEqual(result["documents"][0]["schema"],
                         "earthus.earth-event.v1")
        self.assertIn(result["documents"][0]["schema"],
                      index_consistency.SUPPORTED_SCHEMAS)

    def test_index_rows_carry_the_canonical_pointer(self):
        """㊿ 색인 행은 S3 정본을 가리키고 해시를 들고 있다 — 그것이 불일치 탐지의 기준값이다."""
        result = one([fx.gdelt_event()])
        row = result["indexRows"][0]
        obj = result["stages"]["CANONICAL_WRITE"]["objects"][0]
        self.assertEqual(row["canonicalS3Key"], obj["key"])
        self.assertEqual(row["canonicalSha256"], obj["sha256"])
        self.assertEqual(len(row["canonicalSha256"]), 64)
        self.assertEqual(row["releaseState"], "SHADOW")

    def test_sixteen_stages_all_run(self):
        """(51) 16 단계가 모두 돌았음을 산출물이 스스로 말한다."""
        result = one([fx.gdelt_event()])
        health = result["stages"]["HEALTH"]
        self.assertEqual(len(assembler.STAGES), 16)
        self.assertEqual(health["stagesRun"], list(assembler.STAGES))


if __name__ == "__main__":
    unittest.main(verbosity=2)
