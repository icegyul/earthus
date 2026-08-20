import importlib.util
import json
import unittest
from pathlib import Path


def load_builder(testcase):
    path = Path(__file__).with_name("capture_kto_contracts.py")
    try:
        spec = importlib.util.spec_from_file_location("capture_kto_contracts_test", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    except FileNotFoundError as error:
        testcase.fail(f"KTO contract capture tool is missing: {error}")


class KtoOfficialSwaggerContractTest(unittest.TestCase):
    def test_route_level_required_parameters_and_item_schema_are_preserved(self):
        builder = load_builder(self)
        spec = {
            "swagger": "2.0",
            "info": {"title": "공식 테스트", "version": "1.0.0"},
            "host": "apis.data.go.kr/B551011/TestService",
            "paths": {
                "/list": {
                    "parameters": [
                        {"name": "serviceKey", "required": True, "type": "string"},
                        {"name": "areaCd", "required": True, "type": "string"},
                        {"name": "keyword", "required": False, "type": "string"},
                    ],
                    "get": {
                        "parameters": [{"name": "pageNo", "required": True, "type": "number"}],
                        "responses": {
                            "200": {
                                "schema": {
                                    "properties": {
                                        "body": {
                                            "properties": {
                                                "items": {
                                                    "properties": {
                                                        "item": {
                                                            "properties": {
                                                                "contentid": {"type": "string"},
                                                                "title": {"type": "string"},
                                                            },
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }

        contracts = builder.contracts_from_swagger(
            "testService",
            "https://www.data.go.kr/data/1/openapi.do",
            spec,
            approved_operations=("list",),
            captured_at="2026-08-20T00:00:00Z",
        )
        contract = contracts["list"]["contract"]
        schema = contracts["list"]["schema"]
        serialized = json.dumps(contracts, ensure_ascii=False, sort_keys=True)

        self.assertEqual(contract["baseUrl"], "https://apis.data.go.kr/B551011/TestService")
        self.assertEqual(contract["requiredParameters"], ["areaCd", "pageNo", "serviceKey"])
        self.assertEqual(contract["optionalParameters"], ["keyword"])
        self.assertEqual(contract["secretAlias"], "DATA_GO_KR_SERVICE_KEY")
        self.assertEqual(schema["itemFields"], {"contentid": "string", "title": "string"})
        self.assertRegex(contract["schemaHash"], r"^[0-9a-f]{64}$")
        self.assertNotIn("fixture-secret", serialized)


if __name__ == "__main__":
    unittest.main()
