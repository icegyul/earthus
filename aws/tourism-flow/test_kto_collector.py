import importlib.util
import json
import sys
import unittest
from pathlib import Path


class ConditionalPutFailed(RuntimeError):
    response = {"Error": {"Code": "PreconditionFailed"}}


class FakeS3:
    def __init__(self):
        self.puts = []
        self.objects = {}
        self.delete_calls = []

    def put_object(self, **kwargs):
        if kwargs.get("IfNoneMatch") == "*" and kwargs["Key"] in self.objects:
            raise ConditionalPutFailed(kwargs["Key"])
        if kwargs.get("IfMatch") and kwargs.get("IfMatch") != self._etag(kwargs["Key"]):
            raise ConditionalPutFailed(kwargs["Key"])
        self.puts.append(kwargs)
        self.objects[kwargs["Key"]] = kwargs["Body"]

    @staticmethod
    def _etag(key):
        return f'"fixture-{key}"'

    def get_object(self, Bucket, Key):  # noqa: N803
        if Key not in self.objects:
            raise KeyError(Key)
        value = self.objects[Key]

        class Body:
            def read(self):
                return value

        return {"Body": Body(), "ETag": self._etag(Key)}

    def delete_object(self, Bucket, Key):  # noqa: N803
        self.delete_calls.append({"Bucket": Bucket, "Key": Key})
        self.objects.pop(Key, None)


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
        raw_keys = [key for key in keys if key.startswith("archive/tourism/kto/raw/")]
        self.assertTrue(raw_keys[0].startswith(
            "archive/tourism/kto/raw/concentration/tatsCnctrRatedList/"
        ))
        self.assertNotIn("app/tourism/kto/concentration/tatsCnctrRatedList.json", keys)
        health = json.loads(fake_s3.objects["app/tourism/kto/health.json"])
        operation = health["services"]["concentration"]["operations"]["tatsCnctrRatedList"]
        self.assertEqual(operation["state"], "SCHEMA_DRIFT")
        self.assertIsNone(operation["lastSuccessAt"])

    def test_daily_visitor_job_asks_each_of_the_seven_complete_days_one_at_a_time(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()
        calls = []

        def call(service, operation, params):
            calls.append((service, operation, dict(params)))
            return {"resultCode": "00", "items": [{
                "areaCode": "11", "baseYmd": params["startYmd"], "touNum": "1",
            }]}

        result = collector.handle_event(
            {"task": "KTO_VISITORS_DAILY", "asOf": "2026-08-20T03:00:00Z"},
            s3_client=fake_s3,
            bucket="fixture-bucket",
            fetched_at="2026-08-20T03:00:00Z",
            call=call,
            sleep=lambda seconds: None,
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["jobs"], 2)
        # 조회 범위를 그대로 보내면 공급자가 시작일 하루만 돌려준다.
        metco = [params for _, operation, params in calls if operation == "metcoRegnVisitrDDList"]
        self.assertEqual(len(metco), 7)
        self.assertEqual(metco[0], {"startYmd": "20260813", "endYmd": "20260813"})
        self.assertEqual(metco[-1], {"startYmd": "20260819", "endYmd": "20260819"})
        published = json.loads(
            fake_s3.objects["app/tourism/kto/visitors/metcoRegnVisitrDDList.json"]
        )
        self.assertEqual(len(published["items"]), 7)
        self.assertEqual(
            sorted({item["metricDate"] for item in published["items"]})[0], "2026-08-13",
        )

    def test_empty_visitor_window_keeps_the_published_snapshot_instead_of_erasing_it(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()
        public_key = "app/tourism/kto/visitors/metcoRegnVisitrDDList.json"
        fake_s3.objects[public_key] = json.dumps({
            "items": [{"regionCode": "11", "visitorMetric": 1234.0}],
            "fetchedAt": "2026-08-24T19:37:00Z",
        }).encode("utf-8")

        result = collector.handle_event(
            {
                "task": "KTO_VISITORS_DAILY", "asOf": "2026-09-02T03:00:00Z",
                "windowDays": 2,
            },
            s3_client=fake_s3,
            bucket="fixture-bucket",
            fetched_at="2026-09-02T03:00:00Z",
            call=lambda *_: {"resultCode": "00", "items": []},
            sleep=lambda seconds: None,
        )

        self.assertTrue(result["ok"])
        metco = next(r for r in result["results"] if r["operation"] == "metcoRegnVisitrDDList")
        self.assertFalse(metco["published"])
        self.assertEqual(metco["reasonCode"], "EMPTY_RESPONSE_KEPT_PRIOR_SNAPSHOT")
        kept = json.loads(fake_s3.objects[public_key])
        self.assertEqual(kept["items"][0]["visitorMetric"], 1234.0)
        self.assertEqual(kept["fetchedAt"], "2026-08-24T19:37:00Z")
        health = json.loads(fake_s3.objects["app/tourism/kto/health.json"])
        self.assertEqual(
            health["services"]["visitors"]["operations"]["metcoRegnVisitrDDList"]["reasonCode"],
            "KTO_VISITOR_WINDOW_EMPTY_KEPT_PRIOR",
        )

    def test_daily_visitor_job_accepts_an_explicit_recovery_window_for_provider_lag(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()
        calls = []

        def call(service, operation, params):
            calls.append((service, operation, dict(params)))
            return {"resultCode": "00", "items": []}

        result = collector.handle_event(
            {
                "task": "KTO_VISITORS_DAILY",
                "asOf": "2026-09-02T03:00:00Z",
                "lagDays": 3,
                "windowDays": 28,
            },
            s3_client=fake_s3,
            bucket="fixture-bucket",
            fetched_at="2026-09-02T03:00:00Z",
            call=call,
            sleep=lambda seconds: None,
        )

        self.assertEqual(result["jobs"], 2)
        metco = [params for _, operation, params in calls if operation == "metcoRegnVisitrDDList"]
        self.assertEqual(len(metco), 28)
        self.assertEqual(metco[0], {"startYmd": "20260803", "endYmd": "20260803"})
        self.assertEqual(metco[-1], {"startYmd": "20260830", "endYmd": "20260830"})

    @staticmethod
    def seed_visitor_snapshot(fake_s3, operation, codes):
        fake_s3.objects[f"app/tourism/kto/visitors/{operation}.json"] = json.dumps({
            "items": [{"regionCode": code} for code in codes],
        }).encode("utf-8")

    def test_region_sweep_publishes_one_snapshot_from_official_sigungu_codes(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()
        self.seed_visitor_snapshot(fake_s3, "locgoRegnVisitrDDList", ["51130", "11110", "51150"])
        calls = []

        def call(service, operation, params):
            calls.append((service, operation, dict(params)))
            return {"resultCode": "00", "items": [{
                "areaCd": params["areaCd"], "signguCd": params["signguCd"],
                "baseYm": params["baseYm"], "tAtsNm": "관광지",
            }]}

        result = collector.handle_event(
            {
                "task": "KTO_REGION_SWEEP",
                "service": "related",
                "operation": "areaBasedList1",
                "baseYm": "202607",
            },
            s3_client=fake_s3,
            bucket="fixture-bucket",
            fetched_at="2026-09-02T03:00:00Z",
            call=call,
            sleep=lambda seconds: None,
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["task"], "KTO_REGION_SWEEP")
        self.assertEqual(result["regionCount"], 3)
        self.assertEqual(result["failedRegionCount"], 0)
        self.assertEqual(result["items"], 3)
        self.assertEqual([params for _, _, params in calls], [
            {"areaCd": "11", "signguCd": "11110", "baseYm": "202607"},
            {"areaCd": "51", "signguCd": "51130", "baseYm": "202607"},
            {"areaCd": "51", "signguCd": "51150", "baseYm": "202607"},
        ])
        public = json.loads(fake_s3.objects["app/tourism/kto/related/areaBasedList1.json"])
        self.assertEqual(len(public["items"]), 3)
        summary = json.loads(fake_s3.objects["app/tourism/kto/summary.json"])
        self.assertEqual(
            summary["services"]["related"]["operations"]["areaBasedList1"]["itemCount"], 3,
        )

    def test_region_sweep_uses_official_sido_codes_and_a_lagged_default_base_month(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()
        self.seed_visitor_snapshot(fake_s3, "metcoRegnVisitrDDList", ["11", "51"])
        calls = []

        def call(service, operation, params):
            calls.append((service, operation, dict(params)))
            return {"resultCode": "00", "items": [{
                "areaCd": params["areaCd"], "baseYm": params["baseYm"],
                "touDivIxCd": "1", "touDivIxVal": "0.5",
            }]}

        result = collector.handle_event(
            {"task": "KTO_REGION_SWEEP", "service": "diversity", "operation": "areaTouDivList"},
            s3_client=fake_s3,
            bucket="fixture-bucket",
            fetched_at="2026-09-02T03:00:00Z",
            call=call,
            sleep=lambda seconds: None,
        )

        self.assertTrue(result["ok"])
        self.assertEqual([params for _, _, params in calls], [
            {"areaCd": "11", "baseYm": "202607"},
            {"areaCd": "51", "baseYm": "202607"},
        ])

    def test_region_sweep_without_a_visitors_snapshot_fails_before_any_external_call(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()
        calls = []

        with self.assertRaisesRegex(ValueError, "KTO_VISITORS_DAILY first"):
            collector.handle_event(
                {"task": "KTO_REGION_SWEEP", "service": "localHub", "operation": "areaBasedList1"},
                s3_client=fake_s3,
                bucket="fixture-bucket",
                fetched_at="2026-09-02T03:00:00Z",
                call=lambda *args: calls.append(args),
                sleep=lambda seconds: None,
            )

        self.assertEqual(calls, [])

    def test_region_sweep_keeps_successful_regions_and_records_failures_in_raw_evidence(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()
        self.seed_visitor_snapshot(fake_s3, "locgoRegnVisitrDDList", ["11110", "51130"])

        def call(service, operation, params):
            if params["signguCd"] == "51130":
                raise RuntimeError("KTO_PROVIDER_TIMEOUT")
            return {"resultCode": "00", "items": [{
                "areaCd": params["areaCd"], "signguCd": params["signguCd"], "tAtsNm": "관광지",
            }]}

        result = collector.handle_event(
            {"task": "KTO_REGION_SWEEP", "service": "concentration", "operation": "tatsCnctrRatedList"},
            s3_client=fake_s3,
            bucket="fixture-bucket",
            fetched_at="2026-09-02T03:00:00Z",
            call=call,
            sleep=lambda seconds: None,
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["failedRegionCount"], 1)
        self.assertEqual(result["items"], 1)
        raw_key = next(
            key for key in fake_s3.objects
            if key.startswith("archive/tourism/kto/raw/concentration/")
        )
        raw = json.loads(fake_s3.objects[raw_key])
        self.assertEqual(raw["request"]["failedRegionCount"], 1)
        self.assertEqual(raw["request"]["regionCount"], 2)

    def test_region_sweep_never_sends_base_month_to_a_service_whose_contract_omits_it(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()
        self.seed_visitor_snapshot(fake_s3, "locgoRegnVisitrDDList", ["11110"])
        calls = []

        def call(service, operation, params):
            calls.append(dict(params))
            return {"resultCode": "00", "items": []}

        collector.handle_event(
            {
                "task": "KTO_REGION_SWEEP",
                "service": "concentration",
                "operation": "tatsCnctrRatedList",
                "baseYm": "202607",
            },
            s3_client=fake_s3,
            bucket="fixture-bucket",
            fetched_at="2026-09-02T14:40:00Z",
            call=call,
            sleep=lambda seconds: None,
        )

        self.assertEqual(calls, [{"areaCd": "11", "signguCd": "11110"}])

    def test_sweep_batch_runs_every_job_under_the_single_lease_it_already_holds(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()
        self.seed_visitor_snapshot(fake_s3, "metcoRegnVisitrDDList", ["11", "51"])
        lock_key = "archive/tourism/kto/locks/provider.json"

        def call(service, operation, params):
            return {"resultCode": "00", "items": [{
                "areaCd": params["areaCd"], "baseYm": params["baseYm"],
                "touDivIxCd": "1", "touDivIxVal": "0.5",
            }]}

        result = collector.handle_event(
            {
                "task": "KTO_SWEEP_BATCH",
                "baseYm": "202607",
                "jobs": [
                    {"service": "diversity", "operation": "areaTouDivList"},
                    {"service": "diversity", "operation": "areaExpDivList"},
                    {"service": "demandStrength", "operation": "areaTarSjrnDsList"},
                ],
            },
            s3_client=fake_s3,
            bucket="fixture-bucket",
            fetched_at="2026-09-02T14:40:00Z",
            call=call,
            sleep=lambda seconds: None,
        )

        self.assertTrue(result["ok"])
        self.assertEqual(len(result["completed"]), 3)
        self.assertEqual(result["failed"], [])
        self.assertEqual(result["skippedForBudget"], [])
        lock_puts = [entry for entry in fake_s3.puts if entry["Key"] == lock_key]
        self.assertEqual(len(lock_puts), 1)
        summary = json.loads(fake_s3.objects["app/tourism/kto/summary.json"])
        self.assertEqual(
            sorted(summary["services"]["diversity"]["operations"]),
            ["areaExpDivList", "areaTouDivList"],
        )

    def test_sweep_batch_records_a_failed_job_without_abandoning_the_rest(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()
        self.seed_visitor_snapshot(fake_s3, "metcoRegnVisitrDDList", ["11"])

        def call(service, operation, params):
            if operation == "areaExpDivList":
                raise RuntimeError("KTO_PROVIDER_TIMEOUT")
            return {"resultCode": "00", "items": [{
                "areaCd": params["areaCd"], "baseYm": params["baseYm"],
            }]}

        result = collector.handle_event(
            {
                "task": "KTO_SWEEP_BATCH",
                "jobs": [
                    {"service": "diversity", "operation": "areaExpDivList"},
                    {"service": "diversity", "operation": "areaTouDivList"},
                ],
            },
            s3_client=fake_s3,
            bucket="fixture-bucket",
            fetched_at="2026-09-02T14:40:00Z",
            call=call,
            sleep=lambda seconds: None,
        )

        self.assertFalse(result["ok"])
        self.assertEqual(len(result["completed"]), 1)
        self.assertEqual(result["failed"][0]["job"], "diversity/areaExpDivList")
        self.assertIn(
            "areaTouDivList",
            json.loads(fake_s3.objects["app/tourism/kto/summary.json"])
            ["services"]["diversity"]["operations"],
        )

    def test_sweep_batch_skips_remaining_jobs_once_the_time_budget_is_spent(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()
        self.seed_visitor_snapshot(fake_s3, "metcoRegnVisitrDDList", ["11"])
        ticks = iter([0.0, 0.0, 300.0, 300.0])

        result = collector.handle_event(
            {
                "task": "KTO_SWEEP_BATCH",
                "budgetSeconds": 240,
                "jobs": [
                    {"service": "diversity", "operation": "areaTouDivList"},
                    {"service": "diversity", "operation": "areaExpDivList"},
                ],
            },
            s3_client=fake_s3,
            bucket="fixture-bucket",
            fetched_at="2026-09-02T14:40:00Z",
            call=lambda *_: {"resultCode": "00", "items": []},
            sleep=lambda seconds: None,
            monotonic=lambda: next(ticks),
        )

        self.assertFalse(result["ok"])
        self.assertEqual(len(result["completed"]), 1)
        self.assertEqual(result["skippedForBudget"], ["diversity/areaExpDivList"])

    def test_active_provider_lease_deduplicates_a_second_kto_sync_before_any_external_call(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()
        fake_s3.objects["archive/tourism/kto/locks/provider.json"] = json.dumps({
            "provider": "KTO",
            "expiresAt": "2026-08-20T12:15:00Z",
        }).encode("utf-8")
        calls = []

        def call(*args):
            calls.append(args)
            return {"resultCode": "00", "items": []}

        with self.assertRaisesRegex(RuntimeError, "KTO_SYNC_BUSY"):
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
                call=call,
            )

        self.assertEqual(calls, [])

    def test_provider_lease_never_deletes_the_current_conditional_lock(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()

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
            call=lambda *_: {"resultCode": "00", "items": []},
        )

        self.assertTrue(result["ok"])
        self.assertIn(
            "archive/tourism/kto/locks/provider.json",
            fake_s3.objects,
        )
        self.assertEqual(fake_s3.delete_calls, [])

    def test_expired_provider_lease_is_replaced_by_etag_without_delete_permission(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()
        lock_key = "archive/tourism/kto/locks/provider.json"
        fake_s3.objects[lock_key] = json.dumps({
            "provider": "KTO",
            "expiresAt": "2026-08-20T11:59:00Z",
        }).encode("utf-8")

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
            call=lambda *_: {"resultCode": "00", "items": []},
        )

        self.assertTrue(result["ok"])
        lock_put = [entry for entry in fake_s3.puts if entry["Key"] == lock_key][-1]
        self.assertEqual(lock_put["IfMatch"], FakeS3._etag(lock_key))
        self.assertEqual(fake_s3.delete_calls, [])

    def test_malformed_provider_lease_fails_closed_without_an_external_call(self):
        collector = load_collector(self)
        fake_s3 = FakeS3()
        fake_s3.objects["archive/tourism/kto/locks/provider.json"] = b"[]"
        calls = []

        with self.assertRaisesRegex(RuntimeError, "KTO_SYNC_BUSY"):
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
                call=lambda *args: calls.append(args),
            )

        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
