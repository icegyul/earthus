import importlib.util
import json
import unittest
from pathlib import Path


def load_pipeline(testcase):
    path = Path(__file__).with_name("kto_pipeline.py")
    try:
        spec = importlib.util.spec_from_file_location("kto_pipeline_test", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    except FileNotFoundError as error:
        testcase.fail(f"KTO normalization pipeline is missing: {error}")


class KtoConcentrationNormalizerTest(unittest.TestCase):
    def test_relative_concentration_forecast_never_becomes_live_population(self):
        pipeline = load_pipeline(self)
        envelope = {
            "resultCode": "00",
            "resultMsg": "NORMAL_SERVICE",
            "pageNo": 1,
            "numOfRows": 100,
            "totalCount": 1,
            "items": [{
                "areaCd": "51",
                "areaNm": "강원특별자치도",
                "signguCd": "51130",
                "signguNm": "원주시",
                "tAtsNm": "간현관광지",
                "baseYmd": "20260821",
                "cnctrRate": "82.4",
            }],
        }

        snapshot = pipeline.normalize_kto_snapshot(
            "concentration",
            "tatsCnctrRatedList",
            envelope,
            fetched_at="2026-08-20T12:00:00Z",
        )
        item = snapshot["items"][0]

        self.assertEqual(snapshot["semanticType"], "RELATIVE_CONCENTRATION_FORECAST")
        self.assertEqual(snapshot["sourceType"], "PROVIDER_FORECAST")
        self.assertEqual(item["targetDate"], "2026-08-21")
        self.assertEqual(item["relativeConcentrationRate"], 82.4)
        self.assertFalse(item["isLive"])
        self.assertFalse(item["isPopulation"])
        self.assertNotIn("populationEstimate", item)
        self.assertNotIn("populationRange", item)
        self.assertNotIn("crowdIndex", item)

    def test_missing_rate_is_degraded_and_never_filled_with_zero(self):
        pipeline = load_pipeline(self)
        snapshot = pipeline.normalize_kto_snapshot(
            "concentration",
            "tatsCnctrRatedList",
            {"items": [{"tAtsNm": "간현관광지", "baseYmd": "20260821"}]},
            fetched_at="2026-08-20T12:00:00Z",
        )

        self.assertEqual(snapshot["state"], "DEGRADED")
        self.assertEqual(snapshot["items"][0]["dataState"], "DEGRADED")
        self.assertIsNone(snapshot["items"][0]["relativeConcentrationRate"])
        self.assertIn("MISSING_RELATIVE_CONCENTRATION_RATE", snapshot["items"][0]["reasonCodes"])


class KtoVisitorNormalizerTest(unittest.TestCase):
    def test_region_visitors_remain_historical_and_are_not_called_tourist_or_live_counts(self):
        pipeline = load_pipeline(self)
        try:
            snapshot = pipeline.normalize_kto_snapshot(
                "visitors",
                "locgoRegnVisitrDDList",
                {
                    "resultCode": "00",
                    "items": [{
                        "baseYmd": "20260818",
                        "signguCode": "11110",
                        "signguNm": "종로구",
                        "daywkDivCd": "2",
                        "daywkDivNm": "평일",
                        "touDivCd": "1",
                        "touDivNm": "현지인",
                        "touNum": "12345.6",
                    }],
                },
                fetched_at="2026-08-20T12:00:00Z",
            )
        except ValueError as error:
            self.fail(f"visitor normalizer is missing: {error}")
        item = snapshot["items"][0]

        self.assertEqual(snapshot["semanticType"], "HISTORICAL_REGION_VISITOR_METRIC")
        self.assertEqual(snapshot["sourceType"], "HISTORICAL_STATISTIC")
        self.assertEqual(item["aggregationLevel"], "LOCAL_GOVERNMENT")
        self.assertEqual(item["metricDate"], "2026-08-18")
        self.assertEqual(item["visitorMetric"], 12345.6)
        self.assertFalse(item["isLive"])
        self.assertFalse(item["isTouristCount"])
        self.assertFalse(item["canAggregateWithOtherLevels"])

    def test_missing_region_code_remains_null_instead_of_the_text_none(self):
        pipeline = load_pipeline(self)
        snapshot = pipeline.normalize_kto_snapshot(
            "visitors",
            "locgoRegnVisitrDDList",
            {"items": [{"baseYmd": "20260818", "touNum": "1"}]},
            fetched_at="2026-08-20T12:00:00Z",
        )

        self.assertIsNone(snapshot["items"][0]["regionCode"])
        self.assertEqual(snapshot["items"][0]["dataState"], "DEGRADED")


class KtoRelationNormalizerTest(unittest.TestCase):
    def test_related_rank_is_a_vehicle_connection_rank_not_popularity_or_people(self):
        pipeline = load_pipeline(self)
        try:
            snapshot = pipeline.normalize_kto_snapshot(
                "related",
                "areaBasedList1",
                {
                    "resultCode": "00",
                    "items": [{
                        "baseYm": "202504",
                        "areaCd": "1",
                        "signguCd": "11110",
                        "tAtsCd": "SRC-1",
                        "tAtsNm": "중심 관광지",
                        "rlteTatsCd": "DST-9",
                        "rlteTatsNm": "연관 관광지",
                        "rlteRank": "3",
                        "rlteCtgryLclsNm": "관광",
                        "rlteCtgryMclsNm": "문화",
                        "rlteCtgrySclsNm": "고궁",
                    }],
                },
                fetched_at="2026-08-20T12:00:00Z",
            )
        except ValueError as error:
            self.fail(f"related tourism normalizer is missing: {error}")
        item = snapshot["items"][0]

        self.assertEqual(snapshot["semanticType"], "RELATED_TOURISM_CONNECTION")
        self.assertEqual(item["sourceExternalId"], "SRC-1")
        self.assertEqual(item["targetExternalId"], "DST-9")
        self.assertEqual(item["relationRank"], 3)
        self.assertEqual(item["referenceMonth"], "2025-04")
        self.assertFalse(item["isPopularityRank"])
        self.assertFalse(item["isPeopleCount"])
        self.assertFalse(item["isLive"])


class KtoLocalHubNormalizerTest(unittest.TestCase):
    def test_local_hub_rank_remains_connectivity_not_population_or_popularity(self):
        pipeline = load_pipeline(self)
        try:
            snapshot = pipeline.normalize_kto_snapshot(
                "localHub",
                "areaBasedList1",
                {
                    "resultCode": "00",
                    "items": [{
                        "baseYm": "202504",
                        "areaCd": "1",
                        "areaNm": "서울특별시",
                        "signguCd": "11110",
                        "signguNm": "종로구",
                        "hubTatsCd": "HUB-1",
                        "hubTatsNm": "경복궁",
                        "hubRank": "2",
                        "hubCtgryLclsNm": "관광",
                        "hubCtgryMclsNm": "문화",
                        "mapX": "126.9769",
                        "mapY": "37.5796",
                    }],
                },
                fetched_at="2026-08-20T12:00:00Z",
            )
        except ValueError as error:
            self.fail(f"local hub normalizer is missing: {error}")
        item = snapshot["items"][0]

        self.assertEqual(snapshot["semanticType"], "TOURISM_CONNECTIVITY_HUB")
        self.assertEqual(item["externalId"], "HUB-1")
        self.assertEqual(item["connectivityRank"], 2)
        self.assertEqual(item["position"], {"lat": 37.5796, "lon": 126.9769})
        self.assertFalse(item["isPopulationRank"])
        self.assertFalse(item["isPopularityRank"])
        self.assertFalse(item["isLive"])


class KtoBarrierFreeNormalizerTest(unittest.TestCase):
    def test_official_accessibility_facts_are_preserved_without_an_accessible_verdict(self):
        pipeline = load_pipeline(self)
        try:
            snapshot = pipeline.normalize_kto_snapshot(
                "barrierFree",
                "detailWithTour2",
                {
                    "resultCode": "00",
                    "items": [{
                        "contentid": "123",
                        "wheelchair": "휠체어 대여 가능",
                        "parking": "장애인 전용 주차구역 있음",
                        "restroom": "",
                        "route": "주출입구 경사로",
                    }],
                },
                fetched_at="2026-08-20T12:00:00Z",
            )
        except ValueError as error:
            self.fail(f"barrier-free normalizer is missing: {error}")
        item = snapshot["items"][0]

        self.assertEqual(snapshot["semanticType"], "OFFICIAL_ACCESSIBILITY_FACTS")
        self.assertEqual(item["externalContentId"], "123")
        self.assertEqual(item["officialFacts"]["wheelchair"], "휠체어 대여 가능")
        self.assertEqual(item["officialFacts"]["route"], "주출입구 경사로")
        self.assertNotIn("restroom", item["officialFacts"])
        self.assertNotIn("isAccessible", item)
        self.assertNotIn("accessibilityDecision", item)

    def test_sync_list_keeps_kto_content_id_and_waits_for_official_accessibility_detail(self):
        pipeline = load_pipeline(self)
        try:
            snapshot = pipeline.normalize_kto_snapshot(
                "barrierFree",
                "areaBasedSyncList2",
                {
                    "resultCode": "00",
                    "items": [{
                        "contentid": "BF-100",
                        "contenttypeid": "12",
                        "title": "무장애 관광 콘텐츠",
                        "mapx": "126.98",
                        "mapy": "37.57",
                        "modifiedtime": "20260819120000",
                        "showflag": "1",
                    }],
                },
                fetched_at="2026-08-20T12:00:00Z",
            )
        except ValueError as error:
            self.fail(f"barrier-free sync normalizer is missing: {error}")
        item = snapshot["items"][0]

        self.assertEqual(snapshot["semanticType"], "OFFICIAL_BARRIER_FREE_TOURISM_CONTENT")
        self.assertEqual(item["externalContentId"], "BF-100")
        self.assertEqual(item["position"], {"lat": 37.57, "lon": 126.98})
        self.assertEqual(item["accessibilityDetailState"], "NOT_FETCHED")
        self.assertNotIn("officialFacts", item)


class KtoWellnessNormalizerTest(unittest.TestCase):
    def test_wellness_content_remains_official_content_without_an_invented_score(self):
        pipeline = load_pipeline(self)
        try:
            snapshot = pipeline.normalize_kto_snapshot(
                "wellness",
                "areaBasedList",
                {
                    "resultCode": "00",
                    "items": [{
                        "contentId": "W-10",
                        "contentTypeId": "12",
                        "title": "공식 웰니스 관광지",
                        "wellnessThemaCd": "01",
                        "langDivCd": "KOR",
                        "mapX": "127.1",
                        "mapY": "37.4",
                        "mdfcnDt": "20260819153000",
                    }],
                },
                fetched_at="2026-08-20T12:00:00Z",
            )
        except ValueError as error:
            self.fail(f"wellness normalizer is missing: {error}")
        item = snapshot["items"][0]

        self.assertEqual(snapshot["semanticType"], "OFFICIAL_WELLNESS_CONTENT")
        self.assertEqual(item["externalContentId"], "W-10")
        self.assertEqual(item["title"], "공식 웰니스 관광지")
        self.assertNotIn("wellnessScore", item)
        self.assertNotIn("recommendation", item)


class KtoEnglishNormalizerTest(unittest.TestCase):
    def test_english_content_is_labeled_as_official_provider_text_not_ai_translation(self):
        pipeline = load_pipeline(self)
        try:
            snapshot = pipeline.normalize_kto_snapshot(
                "english",
                "areaBasedList2",
                {
                    "resultCode": "00",
                    "items": [{
                        "contentid": "E-1",
                        "contenttypeid": "76",
                        "title": "Gyeongbokgung Palace",
                        "addr1": "Seoul",
                        "mapx": "126.977",
                        "mapy": "37.579",
                    }],
                },
                fetched_at="2026-08-20T12:00:00Z",
            )
        except ValueError as error:
            self.fail(f"English tourism normalizer is missing: {error}")
        item = snapshot["items"][0]

        self.assertEqual(snapshot["semanticType"], "OFFICIAL_ENGLISH_TOURISM_CONTENT")
        self.assertEqual(item["language"], "en")
        self.assertEqual(item["translationType"], "OFFICIAL_PROVIDER")
        self.assertEqual(item["title"], "Gyeongbokgung Palace")
        self.assertNotIn("aiTranslated", item)

    def test_detail_fields_are_preserved_only_when_the_official_contract_allows_them(self):
        pipeline = load_pipeline(self)
        snapshot = pipeline.normalize_kto_snapshot(
            "english",
            "detailCommon2",
            {"items": [{
                "contentid": "E-2",
                "title": "Official title",
                "overview": "Official overview",
                "homepage": "https://english.visitkorea.or.kr/",
                "serviceKey": "must-never-be-public",
                "inventedScore": 99,
            }]},
            fetched_at="2026-08-20T12:00:00Z",
        )
        fields = snapshot["items"][0]["officialFields"]

        self.assertEqual(fields["overview"], "Official overview")
        self.assertEqual(fields["homepage"], "https://english.visitkorea.or.kr/")
        self.assertNotIn("serviceKey", fields)
        self.assertNotIn("inventedScore", fields)


class KtoRegionalAnalyticsNormalizerTest(unittest.TestCase):
    def test_diversity_and_demand_indices_remain_period_based_analytics_not_live_advice(self):
        pipeline = load_pipeline(self)
        cases = (
            (
                "diversity", "areaTouDivList",
                {"touDivIxCd": "D1", "touDivIxNm": "관광객 다양성", "touDivIxVal": "71.2"},
                "REGIONAL_TOURISM_DIVERSITY_INDEX",
            ),
            (
                "demandStrength", "areaTarSjrnDsList",
                {"tarSjrnDsIxCd": "S1", "tarSjrnDsIxNm": "체류 강도", "tarSjrnDsIxVal": "63.8"},
                "REGIONAL_TOURISM_DEMAND_STRENGTH_INDEX",
            ),
        )
        for service, operation, metric_fields, semantic_type in cases:
            with self.subTest(service=service, operation=operation):
                try:
                    snapshot = pipeline.normalize_kto_snapshot(
                        service,
                        operation,
                        {
                            "resultCode": "00",
                            "items": [{
                                "baseYm": "202607",
                                "areaCd": "1",
                                "areaNm": "서울특별시",
                                "signguCd": "11110",
                                "signguNm": "종로구",
                                **metric_fields,
                            }],
                        },
                        fetched_at="2026-08-20T12:00:00Z",
                    )
                except ValueError as error:
                    self.fail(f"regional analytics normalizer is missing: {error}")
                item = snapshot["items"][0]
                self.assertEqual(snapshot["semanticType"], semantic_type)
                self.assertEqual(item["referenceMonth"], "2026-07")
                self.assertIsInstance(item["indexValue"], float)
                self.assertFalse(item["isLive"])
                self.assertFalse(item["isRecommendation"])


class KtoOperationCoverageTest(unittest.TestCase):
    def test_all_43_approved_operations_have_contract_schema_and_normalizer_routes(self):
        pipeline = load_pipeline(self)
        folder = Path(__file__).parent
        provider_path = folder / "kto_provider.py"
        spec = importlib.util.spec_from_file_location("kto_provider_inventory_test", provider_path)
        provider = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(provider)
        covered = []

        for service, config in provider.KTO_SERVICES.items():
            for operation in config["operations"]:
                with self.subTest(service=service, operation=operation):
                    contract_path = folder / "contracts" / "kto" / service / f"{operation}.contract.json"
                    schema_path = folder / "contracts" / "kto" / service / f"{operation}.schema.json"
                    contract = json.loads(contract_path.read_text(encoding="utf-8"))
                    schema = json.loads(schema_path.read_text(encoding="utf-8"))
                    self.assertEqual((contract["service"], contract["operation"]), (service, operation))
                    self.assertEqual((schema["service"], schema["operation"]), (service, operation))
                    snapshot = pipeline.normalize_kto_snapshot(
                        service, operation, {"resultCode": "00", "items": []},
                        fetched_at="2026-08-20T12:00:00Z",
                    )
                    self.assertEqual(snapshot["state"], "UNAVAILABLE")
                    covered.append((service, operation))

        self.assertEqual(len(covered), 43)


if __name__ == "__main__":
    unittest.main()
