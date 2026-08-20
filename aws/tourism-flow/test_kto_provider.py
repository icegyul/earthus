import importlib.util
import io
import json
import unittest
import urllib.error
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


def load_kto_provider(testcase):
    path = Path(__file__).with_name("kto_provider.py")
    try:
        spec = importlib.util.spec_from_file_location("kto_provider_test", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    except FileNotFoundError as error:
        testcase.fail(f"KTO provider module is missing: {error}")


class KtoProviderRegistryTest(unittest.TestCase):
    def test_all_nine_approved_services_use_the_contract_base_urls_and_operations(self):
        module = load_kto_provider(self)

        expected = {
            "related": (
                "https://apis.data.go.kr/B551011/TarRlteTarService1",
                ("areaBasedList1", "searchKeyword1"),
            ),
            "localHub": (
                "https://apis.data.go.kr/B551011/LocgoHubTarService1",
                ("areaBasedList1",),
            ),
            "concentration": (
                "https://apis.data.go.kr/B551011/TatsCnctrRateService",
                ("tatsCnctrRatedList",),
            ),
            "visitors": (
                "https://apis.data.go.kr/B551011/DataLabService",
                ("metcoRegnVisitrDDList", "locgoRegnVisitrDDList"),
            ),
            "barrierFree": (
                "https://apis.data.go.kr/B551011/KorWithService2",
                (
                    "areaBasedList2", "locationBasedList2", "searchKeyword2",
                    "areaBasedSyncList2", "detailCommon2", "detailIntro2",
                    "detailInfo2", "detailImage2", "detailWithTour2",
                    "ldongCode2", "lclsSystmCode2",
                ),
            ),
            "wellness": (
                "https://apis.data.go.kr/B551011/WellnessTursmService",
                (
                    "ldongCode", "areaBasedList", "locationBasedList",
                    "searchKeyword", "wellnessTursmSyncList", "detailCommon",
                    "detailIntro", "detailInfo", "detailImage",
                ),
            ),
            "english": (
                "https://apis.data.go.kr/B551011/EngService2",
                (
                    "areaBasedList2", "locationBasedList2", "searchKeyword2",
                    "searchFestival2", "searchStay2", "areaBasedSyncList2",
                    "detailCommon2", "detailIntro2", "detailInfo2",
                    "detailImage2", "ldongCode2", "lclsSystmCode2",
                ),
            ),
            "diversity": (
                "https://apis.data.go.kr/B551011/AreaTarDivService",
                ("areaTouDivList", "areaExpDivList", "areaIntlDivList"),
            ),
            "demandStrength": (
                "https://apis.data.go.kr/B551011/AreaTarDemDsService",
                ("areaTarSjrnDsList", "areaTarExpDsList"),
            ),
        }

        actual = {
            name: (config["base_url"], tuple(config["operations"]))
            for name, config in module.KTO_SERVICES.items()
        }
        self.assertEqual(actual, expected)


class KtoProviderRequestTest(unittest.TestCase):
    def test_request_uses_server_secret_defaults_and_redacts_it_from_diagnostics(self):
        module = load_kto_provider(self)
        try:
            build_url = module.build_kto_url
            safe_url = module.safe_request_url
        except AttributeError as error:
            self.fail(f"KTO request contract is missing: {error}")

        secret = "fixture decoded/key+value="
        url = build_url(
            "related",
            "areaBasedList1",
            {"baseYm": "202608", "areaCd": "1", "signguCd": "11110"},
            environ={"DATA_GO_KR_SERVICE_KEY": secret},
        )
        query = parse_qs(urlsplit(url).query)

        self.assertEqual(query["serviceKey"], [secret])
        self.assertEqual(query["MobileOS"], ["ETC"])
        self.assertEqual(query["MobileApp"], ["EARTHUS"])
        self.assertEqual(query["_type"], ["json"])
        self.assertEqual(query["pageNo"], ["1"])
        self.assertEqual(query["numOfRows"], ["100"])
        self.assertEqual(query["baseYm"], ["202608"])
        self.assertNotIn(secret, safe_url(url))
        self.assertNotIn("serviceKey=", safe_url(url))

    def test_already_encoded_portal_key_is_not_double_encoded(self):
        module = load_kto_provider(self)
        encoded_key = "fixture%2Bkey%2Fvalue%3D"

        url = module.build_kto_url(
            "localHub",
            "areaBasedList1",
            {"baseYm": "202504", "areaCd": "1", "signguCd": "11110"},
            environ={"DATA_GO_KR_SERVICE_KEY": encoded_key},
        )
        query = parse_qs(urlsplit(url).query)

        self.assertEqual(query["serviceKey"], ["fixture+key/value="])
        self.assertNotIn("%252B", url)

    def test_existing_earthus_portal_key_alias_keeps_the_provider_enabled(self):
        module = load_kto_provider(self)

        try:
            url = module.build_kto_url(
                "visitors",
                "metcoRegnVisitrDDList",
                {"startYmd": "20260801", "endYmd": "20260807"},
                environ={"DATA_GO_KR_KEY": "fixture-existing-earthus-key"},
            )
        except module.KtoProviderDisabled as error:
            self.fail(f"existing Earthus key alias was ignored: {error}")
        query = parse_qs(urlsplit(url).query)

        self.assertEqual(query["serviceKey"], ["fixture-existing-earthus-key"])

    def test_official_required_parameters_are_blocked_before_an_external_call(self):
        module = load_kto_provider(self)

        with self.assertRaises(module.KtoContractError) as caught:
            module.build_kto_url(
                "concentration",
                "tatsCnctrRatedList",
                {"signguCd": "51130"},
                environ={"DATA_GO_KR_SERVICE_KEY": "fixture-key"},
            )

        self.assertIn("areaCd", str(caught.exception))


class KtoProviderParserTest(unittest.TestCase):
    def test_single_item_envelope_is_normalized_to_an_items_list(self):
        module = load_kto_provider(self)
        try:
            normalize = module.normalize_tour_api_envelope
        except AttributeError as error:
            self.fail(f"KTO response parser is missing: {error}")

        normalized = normalize({
            "response": {
                "header": {"resultCode": "00", "resultMsg": "NORMAL_SERVICE"},
                "body": {
                    "pageNo": "2",
                    "numOfRows": "100",
                    "totalCount": "101",
                    "items": {"item": {"contentid": "123", "title": "테스트 관광지"}},
                },
            },
        })

        self.assertEqual(normalized["resultCode"], "00")
        self.assertEqual(normalized["pageNo"], 2)
        self.assertEqual(normalized["numOfRows"], 100)
        self.assertEqual(normalized["totalCount"], 101)
        self.assertEqual(normalized["items"], [{"contentid": "123", "title": "테스트 관광지"}])

    def test_unregistered_key_is_an_auth_error_and_is_never_retried(self):
        module = load_kto_provider(self)
        try:
            provider_error = module.KtoProviderError
        except AttributeError as error:
            self.fail(f"KTO typed error contract is missing: {error}")

        with self.assertRaises(provider_error) as caught:
            module.normalize_tour_api_envelope({
                "response": {
                    "header": {"resultCode": "30", "resultMsg": "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"},
                    "body": {},
                },
            })

        self.assertEqual(caught.exception.code, "30")
        self.assertEqual(caught.exception.health_state, "AUTH_ERROR")
        self.assertFalse(caught.exception.retryable)

    def test_contract_capture_hashes_field_names_without_secret_or_business_values(self):
        module = load_kto_provider(self)
        try:
            capture = module.capture_contract
        except AttributeError as error:
            self.fail(f"KTO contract capture is missing: {error}")
        secret = "fixture-secret-must-not-be-captured"
        normalized = {
            "resultCode": "00",
            "resultMsg": "NORMAL_SERVICE",
            "pageNo": 1,
            "numOfRows": 100,
            "totalCount": 1,
            "items": [{"contentid": "123", "title": "테스트", "baseYm": "202504"}],
        }

        contract = capture(
            "related",
            "areaBasedList1",
            normalized,
            request_params={
                "serviceKey": secret,
                "baseYm": "202504",
                "areaCd": "1",
                "signguCd": "1",
            },
            captured_at="2026-08-20T12:00:00Z",
        )
        serialized = json.dumps(contract, ensure_ascii=False, sort_keys=True)

        self.assertEqual(contract["provider"], "KTO")
        self.assertEqual(contract["service"], "related")
        self.assertEqual(contract["operation"], "areaBasedList1")
        self.assertEqual(contract["requestParameterNames"], ["areaCd", "baseYm", "signguCd"])
        self.assertEqual(contract["responseItemFields"], ["baseYm", "contentid", "title"])
        self.assertRegex(contract["schemaHash"], r"^[0-9a-f]{64}$")
        self.assertNotIn(secret, serialized)
        self.assertNotIn("202504", serialized)


class FakeHttpResponse:
    def __init__(self, payload, status=200):
        self.payload = json.dumps(payload).encode("utf-8")
        self.status = status

    def read(self):
        return self.payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False


class KtoProviderHttpTest(unittest.TestCase):
    def test_server_error_retries_then_returns_the_real_normalized_response(self):
        module = load_kto_provider(self)
        try:
            call_kto = module.call_kto
        except AttributeError as error:
            self.fail(f"KTO HTTP client is missing: {error}")
        calls = []

        def open_url(request, timeout):
            calls.append((request.full_url, timeout))
            if len(calls) == 1:
                raise urllib.error.HTTPError(
                    request.full_url,
                    503,
                    "temporary",
                    {},
                    io.BytesIO(b""),
                )
            return FakeHttpResponse({
                "response": {
                    "header": {"resultCode": "00", "resultMsg": "NORMAL_SERVICE"},
                    "body": {
                        "pageNo": 1,
                        "numOfRows": 100,
                        "totalCount": 1,
                        "items": {"item": [{"contentid": "123"}]},
                    },
                },
            })

        result = call_kto(
            "related",
            "areaBasedList1",
            {"baseYm": "202608", "areaCd": "1", "signguCd": "11110"},
            environ={
                "DATA_GO_KR_SERVICE_KEY": "fixture-secret",
                "KTO_HTTP_TIMEOUT_MS": "2500",
                "KTO_MAX_RETRIES": "3",
            },
            open_url=open_url,
            sleep=lambda seconds: None,
        )

        self.assertEqual(len(calls), 2)
        self.assertEqual([timeout for _, timeout in calls], [2.5, 2.5])
        self.assertEqual(result["items"], [{"contentid": "123"}])

    def test_network_error_is_retried_and_wrapped_without_leaking_the_key(self):
        module = load_kto_provider(self)
        secret = "fixture-network-secret"
        calls = []

        def open_url(request, timeout):
            calls.append(request.full_url)
            raise urllib.error.URLError(f"network failed for {request.full_url}")

        with self.assertRaises(module.KtoTransportError) as caught:
            module.call_kto(
                "related",
                "areaBasedList1",
                {"baseYm": "202608", "areaCd": "1", "signguCd": "11110"},
                environ={
                    "DATA_GO_KR_SERVICE_KEY": secret,
                    "KTO_MAX_RETRIES": "1",
                },
                open_url=open_url,
                sleep=lambda seconds: None,
            )

        self.assertEqual(len(calls), 2)
        self.assertTrue(caught.exception.retryable)
        self.assertNotIn(secret, str(caught.exception))

    def test_pagination_collects_every_item_without_mutating_business_parameters(self):
        module = load_kto_provider(self)
        try:
            fetch_all_pages = module.fetch_all_pages
        except AttributeError as error:
            self.fail(f"KTO pagination contract is missing: {error}")
        calls = []
        business_params = {"baseYm": "202608", "areaCd": "1"}

        def call(service, operation, params):
            calls.append((service, operation, dict(params)))
            page = params["pageNo"]
            return {
                "resultCode": "00",
                "resultMsg": "NORMAL_SERVICE",
                "pageNo": page,
                "numOfRows": 2,
                "totalCount": 3,
                "items": ([{"id": "A"}, {"id": "B"}] if page == 1 else [{"id": "C"}]),
            }

        items = fetch_all_pages(
            "related",
            "areaBasedList1",
            business_params,
            page_size=2,
            call=call,
        )

        self.assertEqual(items, [{"id": "A"}, {"id": "B"}, {"id": "C"}])
        self.assertEqual([entry[2]["pageNo"] for entry in calls], [1, 2])
        self.assertTrue(all(entry[2]["numOfRows"] == 2 for entry in calls))
        self.assertEqual(business_params, {"baseYm": "202608", "areaCd": "1"})


if __name__ == "__main__":
    unittest.main()
