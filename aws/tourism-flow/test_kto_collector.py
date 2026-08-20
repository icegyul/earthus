import importlib.util
import json
import sys
import unittest
from pathlib import Path


class FakeS3:
    def __init__(self):
        self.puts = []
        self.objects = {}

    def put_object(self, **kwargs):
        self.puts.append(kwargs)
        self.objects[kwargs["Key"]] = kwargs["Body"]

    def get_object(self, Bucket, Key):  # noqa: N803
        if Key not in self.objects:
            raise KeyError(Key)
        value = self.objects[Key]

        class Body:
            def read(self):
                return value

        return {"Body": Body()}


def load_collector(testcase):
    folder = Path(__file__).parent
    path = folder / "kto_collector.py"
    sys.path.insert(0, str(folder))
    try:
        spec = importlib.util.spec_from_file_location("kto_collector_test", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    except FileNotFoundError as error:
        testcase.fail(f"KTO collector is missing: {error}")
    finally:
        sys.path.remove(str(folder))


class KtoCollectorWriteOrderTest(unittest.TestCase):
    def test_raw_evidence_is_written_before_the_normalized_public_snapshot(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()
        envelope = {
            "resultCode": "00",
            "resultMsg": "NORMAL_SERVICE",
            "pageNo": 1,
            "numOfRows": 100,
            "totalCount": 1,
            "items": [{
                "areaCd": "51", "areaNm": "강원특별자치도",
                "signguCd": "51130", "signguNm": "원주시",
                "tAtsNm": "간현관광지", "baseYmd": "20260821", "cnctrRate": "82.4",
            }],
        }

        result = collector.sync_operation(
            "concentration",
            "tatsCnctrRatedList",
            {"areaCd": "51", "signguCd": "51130"},
            fetched_at="2026-08-20T12:00:00Z",
            s3_client=fake_s3,
            bucket="fixture-bucket",
            call=lambda service, operation, params: envelope,
        )

        self.assertTrue(result["ok"])
        self.assertGreaterEqual(len(fake_s3.puts), 2)
        raw_put, public_put = fake_s3.puts[:2]
        self.assertTrue(raw_put["Key"].startswith("archive/tourism/kto/raw/concentration/tatsCnctrRatedList/"))
        self.assertEqual(raw_put["CacheControl"], "private, no-store")
        self.assertEqual(raw_put["ServerSideEncryption"], "AES256")
        self.assertEqual(public_put["Key"], "app/tourism/kto/concentration/tatsCnctrRatedList.json")
        raw = json.loads(raw_put["Body"])
        public = json.loads(public_put["Body"])
        self.assertEqual(raw["items"], envelope["items"])
        self.assertRegex(raw["rawHash"], r"^[0-9a-f]{64}$")
        self.assertEqual(public["semanticType"], "RELATIVE_CONCENTRATION_FORECAST")
        self.assertNotIn("serviceKey", json.dumps(raw, ensure_ascii=False))

    def test_sync_event_routes_only_an_explicit_service_operation_and_params(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()
        calls = []

        def call(service, operation, params):
            calls.append((service, operation, dict(params)))
            return {
                "resultCode": "00", "resultMsg": "NORMAL_SERVICE",
                "pageNo": 1, "numOfRows": 100, "totalCount": 0, "items": [],
            }

        try:
            result = collector.handle_event(
                {
                    "task": "KTO_SYNC",
                    "service": "concentration",
                    "operation": "tatsCnctrRatedList",
                    "params": {"areaCd": "51", "signguCd": "51130"},
                },
                s3_client=fake_s3,
                bucket="fixture-bucket",
                fetched_at="2026-08-20T12:00:00Z",
                call=call,
            )
        except AttributeError as error:
            self.fail(f"KTO event router is missing: {error}")

        self.assertTrue(result["ok"])
        self.assertEqual(calls, [(
            "concentration",
            "tatsCnctrRatedList",
            {"areaCd": "51", "signguCd": "51130"},
        )])

    def test_public_summary_merges_operations_without_losing_prior_service_state(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()

        collector.sync_operation(
            "concentration", "tatsCnctrRatedList", {"areaCd": "51", "signguCd": "51130"},
            fetched_at="2026-08-20T12:00:00Z", s3_client=fake_s3, bucket="fixture-bucket",
            call=lambda *_: {"resultCode": "00", "items": [{
                "tAtsNm": "간현관광지", "baseYmd": "20260821", "cnctrRate": "82.4",
            }]},
        )
        collector.sync_operation(
            "visitors", "locgoRegnVisitrDDList", {"startYmd": "20260818", "endYmd": "20260818"},
            fetched_at="2026-08-20T12:05:00Z", s3_client=fake_s3, bucket="fixture-bucket",
            call=lambda *_: {"resultCode": "00", "items": []},
        )

        summary = json.loads(fake_s3.objects["app/tourism/kto/summary.json"])
        self.assertEqual(summary["schemaVersion"], "earthus.kto-summary.v1")
        self.assertEqual(summary["provider"], "KTO")
        self.assertEqual(summary["generatedAt"], "2026-08-20T12:05:00Z")
        self.assertEqual(
            summary["services"]["concentration"]["operations"]["tatsCnctrRatedList"]["state"],
            "AVAILABLE",
        )
        self.assertEqual(
            summary["services"]["visitors"]["operations"]["locgoRegnVisitrDDList"]["state"],
            "UNAVAILABLE",
        )
        self.assertEqual(
            summary["services"]["concentration"]["operations"]["tatsCnctrRatedList"]["path"],
            "/tourism/kto/concentration/tatsCnctrRatedList.json",
        )
        self.assertNotIn("items", json.dumps(summary, ensure_ascii=False))

    def test_failed_provider_call_writes_secret_free_health_without_fake_success(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()
        secret = "fixture-secret-must-never-leak"

        with self.assertRaises(RuntimeError):
            collector.handle_event(
                {
                    "task": "KTO_SYNC",
                    "service": "concentration",
                    "operation": "tatsCnctrRatedList",
                    "params": {"areaCd": "51", "signguCd": "51130"},
                },
                s3_client=fake_s3,
                bucket="fixture-bucket",
                fetched_at="2026-08-20T12:00:00Z",
                call=lambda *_: (_ for _ in ()).throw(RuntimeError(f"failed URL/{secret}")),
                environ={"DATA_GO_KR_SERVICE_KEY": secret},
            )

        health = json.loads(fake_s3.objects["app/tourism/kto/health.json"])
        operation = health["services"]["concentration"]["operations"]["tatsCnctrRatedList"]
        self.assertEqual(operation["state"], "FAILED")
        self.assertEqual(operation["lastAttemptAt"], "2026-08-20T12:00:00Z")
        self.assertIsNone(operation["lastSuccessAt"])
        self.assertTrue(health["keyConfigured"])
        self.assertNotIn(secret, json.dumps(health, ensure_ascii=False))

    def test_incompatible_schema_is_archived_first_then_blocked_from_public_output(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()

        with self.assertRaisesRegex(RuntimeError, "KTO_SCHEMA_DRIFT"):
            collector.handle_event(
                {
                    "task": "KTO_SYNC",
                    "service": "concentration",
                    "operation": "tatsCnctrRatedList",
                    "params": {"areaCd": "51", "signguCd": "51130"},
                },
                s3_client=fake_s3,
                bucket="fixture-bucket",
                fetched_at="2026-08-20T12:00:00Z",
                call=lambda *_: {"resultCode": "00", "items": [{"unknownV2Field": "value"}]},
            )

        keys = [entry["Key"] for entry in fake_s3.puts]
        self.assertTrue(keys[0].startswith(
            "archive/tourism/kto/raw/concentration/tatsCnctrRatedList/"
        ))
        self.assertNotIn("app/tourism/kto/concentration/tatsCnctrRatedList.json", keys)
        health = json.loads(fake_s3.objects["app/tourism/kto/health.json"])
        operation = health["services"]["concentration"]["operations"]["tatsCnctrRatedList"]
        self.assertEqual(operation["state"], "SCHEMA_DRIFT")
        self.assertIsNone(operation["lastSuccessAt"])

    def test_daily_visitor_job_refreshes_both_levels_for_the_latest_seven_complete_days(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()
        calls = []

        def call(service, operation, params):
            calls.append((service, operation, dict(params)))
            return {"resultCode": "00", "items": []}

        result = collector.handle_event(
            {"task": "KTO_VISITORS_DAILY", "asOf": "2026-08-20T03:00:00Z"},
            s3_client=fake_s3,
            bucket="fixture-bucket",
            fetched_at="2026-08-20T03:00:00Z",
            call=call,
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["jobs"], 2)
        self.assertEqual([operation for _, operation, _ in calls], [
            "metcoRegnVisitrDDList", "locgoRegnVisitrDDList",
        ])
        self.assertTrue(all(params == {
            "startYmd": "20260813", "endYmd": "20260819",
        } for _, _, params in calls))


if __name__ == "__main__":
    unittest.main()
