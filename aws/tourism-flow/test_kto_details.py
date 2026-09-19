import json
import unittest
from datetime import datetime, timedelta, timezone

from kto_details import collect_details, KtoDetailError, DETAIL_OPERATIONS
from test_kto_collector import FakeS3, load_collector


AT = "2026-09-05T00:00:00Z"


def add_time(value, seconds):
    return (datetime.fromisoformat(value.replace("Z", "+00:00")) + timedelta(seconds=seconds)).isoformat().replace("+00:00", "Z")


def catalog_row(content_id, flag="1", service="barrierFree"):
    return {"externalContentId": content_id, "externalProvider": "KTO", "externalService": service,
            "title": f"실제 목록 {content_id}", "showFlag": flag, "contentTypeId": "12",
            "officialLanguageCode": "KOR", "modifiedAtRaw": "20260904090000",
            "officialFields": {"showflag": flag, "contenttypeid": "12", "langDivCd": "KOR"}}


def put_catalog(s3, rows, service="barrierFree", at=AT):
    operation = "wellnessTursmSyncList" if service == "wellness" else "areaBasedSyncList2"
    key = f"app/tourism/kto/{service}/{operation}.json"
    s3.objects[key] = json.dumps({"schemaVersion": "earthus.kto-normalized.v1", "provider": "KTO",
                               "service": service, "state": "AVAILABLE", "fetchedAt": at, "items": rows}).encode()
    return key


class Clock:
    def __init__(self):
        self.value, self.waits = 0, []

    def now(self):
        return self.value

    def sleep(self, delay):
        self.waits.append(delay)
        self.value += delay


def response(service, operation, params):
    cid = params["contentId"]
    id_key = "contentId" if service == "wellness" else "contentid"
    row = {id_key: cid}
    if operation.startswith("detailCommon"):
        row.update({"title": f"관광지 {cid}", "overview": f"{cid}의 공식 소개", "homepage": "https://example.org/"})
    elif operation.startswith("detailIntro"):
        row.update({"usetime": "09:00~17:00", "restdate": "월요일"})
    else:
        row["restroom"] = f"{cid} 공식 화장실 안내"
    return {"resultCode": "00", "items": [row], "totalCount": 1}


def run(s3, ids, service="barrierFree", at=AT, call=response, operations=None, clock=None, env=None, **payload):
    clk = clock or Clock()
    task = {"task": "KTO_DETAILS", "service": service, "contentIds": ids, **payload}
    if operations is not None:
        task["operations"] = operations
    return collect_details(task, s3_client=s3, bucket="test", fetched_at=at,
                           lease={"expiresAt": add_time(at, 900)}, call=call,
                           environ=env, sleep=clk.sleep, monotonic=clk.now)


def doc(s3, content_id, tail="summary", service="barrierFree"):
    return json.loads(s3.objects[f"app/tourism/kto/details/{service}/{content_id}/{tail}.json"])


class KtoDetailTests(unittest.TestCase):
    def test_two_ids_keep_separate_operations_and_merge_without_overwriting_list_or_legacy_latest(self):
        s3 = FakeS3()
        list_key = put_catalog(s3, [catalog_row("123"), catalog_row("456")])
        original_list = s3.objects[list_key]
        old_key = "app/tourism/kto/barrierFree/detailWithTour2.json"
        s3.objects[old_key] = b'{"old":"untouched"}'
        result = run(s3, ["123", "456"])
        self.assertTrue(result["ok"])
        self.assertEqual(doc(s3, "123")["sections"]["accessibility"]["fields"]["restroom"], "123 공식 화장실 안내")
        self.assertEqual(doc(s3, "456")["sections"]["common"]["fields"]["title"], "관광지 456")
        self.assertEqual(s3.objects[list_key], original_list)
        self.assertEqual(s3.objects[old_key], b'{"old":"untouched"}')
        self.assertNotIn("app/tourism/kto/summary.json", s3.objects)
        for cid in ("123", "456"):
            for operation in DETAIL_OPERATIONS["barrierFree"]:
                item = doc(s3, cid, operation)
                self.assertEqual(item["contentId"], cid)
                self.assertEqual(item["catalogFetchedAt"], AT)
                self.assertIn("sourceUrl", item["provenance"])
                self.assertEqual(item["showFlag"], "1")

    def test_event_uses_existing_shared_provider_lease_and_legacy_sync_rejects_details(self):
        collector = load_collector(self)
        s3 = FakeS3()
        put_catalog(s3, [catalog_row("123")])
        result = collector.handle_event({"task": "KTO_DETAILS", "service": "barrierFree", "contentIds": ["123"]},
                                        s3_client=s3, bucket="test", fetched_at=AT, call=response, sleep=lambda _: None)
        self.assertTrue(result["ok"])
        with self.assertRaisesRegex(RuntimeError, "KTO_SYNC_BUSY"):
            collector.handle_event({"task": "KTO_DETAILS", "service": "barrierFree", "contentIds": ["123"]},
                                   s3_client=s3, bucket="test", fetched_at=AT, call=response)
        with self.assertRaisesRegex(ValueError, "KTO_DETAIL_REQUIRES_CONTENT_ID_CACHE_TASK"):
            collector.sync_operation("barrierFree", "detailCommon2", {"contentId": "123"}, AT, s3, "test", call=response)

    def test_cache_hit_uses_no_provider_requests_and_deduplicates_requested_ids(self):
        s3 = FakeS3()
        put_catalog(s3, [catalog_row("123")])
        calls = []
        def call(*args):
            calls.append(args)
            return response(*args)
        run(s3, ["123", "123"], call=call)
        self.assertEqual(len(calls), 3)
        run(s3, ["123"], at=add_time(AT, 3600), call=call)
        self.assertEqual(len(calls), 3)

    def test_source_modified_time_invalidates_cache_and_failure_keeps_old_fact_time(self):
        s3 = FakeS3()
        put_catalog(s3, [catalog_row("123")])
        run(s3, ["123"])
        old = doc(s3, "123", "detailWithTour2")
        row = catalog_row("123")
        row["modifiedAtRaw"] = "20260905010000"
        put_catalog(s3, [row], at=add_time(AT, 7200))
        def fail(*_):
            raise RuntimeError("https://provider?serviceKey=never-print")
        run(s3, ["123"], at=add_time(AT, 7200), call=fail)
        new = doc(s3, "123", "detailWithTour2")
        self.assertEqual(new["state"], "STALE")
        self.assertEqual(new["items"], old["items"])
        self.assertEqual(new["fetchedAt"], old["fetchedAt"])
        self.assertEqual(doc(s3, "123")["state"], "PARTIAL")
        self.assertNotIn("never-print", b"".join(s3.objects.values()).decode())
        self.assertEqual(new["reasonCode"], "DETAIL_PROVIDER_UNAVAILABLE")
        self.assertTrue(new["retryAfter"])

    def test_wrong_response_id_is_rejected_and_backoff_prevents_retry_storm(self):
        s3 = FakeS3()
        put_catalog(s3, [catalog_row("123")])
        calls = []
        def wrong(*_):
            calls.append(1)
            return {"items": [{"contentid": "456", "restroom": "다른 곳"}]}
        run(s3, ["123"], operations=["detailWithTour2"], call=wrong)
        item = doc(s3, "123", "detailWithTour2")
        self.assertEqual(item["state"], "UNAVAILABLE")
        self.assertEqual(item["items"], [])
        self.assertEqual(item["reasonCode"], "DETAIL_RESPONSE_ID_MISMATCH")
        run(s3, ["123"], at=add_time(AT, 60), operations=["detailWithTour2"], call=wrong)
        self.assertEqual(len(calls), 1)

    def test_partial_failure_preserves_good_sections_and_does_not_become_complete(self):
        s3 = FakeS3()
        put_catalog(s3, [catalog_row("123")])
        def partial(service, operation, params):
            if operation == "detailIntro2":
                return {"items": []}
            return response(service, operation, params)
        run(s3, ["123"], call=partial)
        item = doc(s3, "123")
        self.assertEqual(item["state"], "PARTIAL")
        self.assertEqual(item["sections"]["intro"]["state"], "UNAVAILABLE")
        self.assertEqual(item["sections"]["common"]["state"], "AVAILABLE")
        self.assertEqual(item["sections"]["accessibility"]["fields"]["restroom"], "123 공식 화장실 안내")

    def test_hidden_or_removed_content_revokes_all_public_detail_sections_without_provider_calls(self):
        s3 = FakeS3()
        put_catalog(s3, [catalog_row("123"), catalog_row("456")])
        run(s3, ["123", "456"])
        put_catalog(s3, [catalog_row("123", "0")])
        def forbidden(*_):
            self.fail("hidden or removed content must not call provider")
        run(s3, ["123", "456"], call=forbidden)
        self.assertEqual(doc(s3, "123")["state"], "HIDDEN")
        self.assertEqual(doc(s3, "456")["state"], "NOT_IN_CATALOG")
        self.assertEqual(doc(s3, "123")["sections"], {})
        for operation in DETAIL_OPERATIONS["barrierFree"]:
            self.assertEqual(doc(s3, "123", operation)["items"], [])
        self.assertEqual(s3.delete_calls, [])

    def test_strict_event_validation_blocks_paths_arbitrary_params_and_unbounded_jobs(self):
        s3 = FakeS3()
        put_catalog(s3, [catalog_row("123")])
        for value in ("../123", "1/2", "a", "", "1" * 21):
            with self.assertRaisesRegex(KtoDetailError, "DETAIL_CONTENT_ID_INVALID"):
                run(s3, [value])
        with self.assertRaisesRegex(KtoDetailError, "DETAIL_CONTENT_IDS_LIMIT"):
            run(s3, [str(i) for i in range(21)])
        with self.assertRaisesRegex(KtoDetailError, "DETAIL_EVENT_PARAMETER_INVALID"):
            run(s3, ["123"], params={"serviceKey": "never"})
        with self.assertRaisesRegex(KtoDetailError, "DETAIL_OPERATION_INVALID"):
            run(s3, ["123"], operations=["detailImage2"])

    def test_stale_or_unknown_visibility_catalog_does_not_fetch_new_details(self):
        s3 = FakeS3()
        put_catalog(s3, [catalog_row("123")])
        with self.assertRaisesRegex(KtoDetailError, "DETAIL_CATALOG_STALE"):
            run(s3, ["123"], at=add_time(AT, 49 * 3600))
        row = catalog_row("123")
        row["showFlag"] = None
        row["officialFields"].pop("showflag")
        put_catalog(s3, [row])
        result = run(s3, ["123"], call=lambda *_: self.fail("visibility unknown"))
        self.assertEqual(result["skipped"][0]["reasonCode"], "DETAIL_VISIBILITY_UNKNOWN")

    def test_only_contract_fields_are_archived_and_media_secrets_urls_are_excluded(self):
        s3 = FakeS3()
        put_catalog(s3, [catalog_row("123")])
        def fields(*_):
            return {"items": [{"contentid": "123", "title": "실제 제목", "overview": "공식 소개",
                               "homepage": "https://example.org/?token=secret-value", "firstimage": "image-never-store"}]}
        run(s3, ["123"], operations=["detailCommon2"], call=fields)
        combined = b"".join(s3.objects.values()).decode()
        self.assertNotIn("secret-value", combined)
        self.assertNotIn("image-never-store", combined)
        self.assertEqual(doc(s3, "123")["sections"]["common"]["fields"]["overview"], "공식 소개")
        raw = next(value for value in s3.puts if value["Key"].startswith("archive/tourism/kto/details/"))
        self.assertEqual(raw["CacheControl"], "private, no-store")
        self.assertEqual(raw["ServerSideEncryption"], "AES256")

    def test_schema_drift_preserves_evidence_allowlist_without_publishing_unknown_fields(self):
        s3 = FakeS3()
        put_catalog(s3, [catalog_row("123")])
        run(s3, ["123"], operations=["detailCommon2"], call=lambda *_: {"items": [{"contentid": "123", "title": "제목", "apiKey": "never-store"}]})
        self.assertEqual(doc(s3, "123", "detailCommon2")["reasonCode"], "DETAIL_SCHEMA_DRIFT")
        self.assertNotIn("never-store", b"".join(s3.objects.values()).decode())

    def test_provider_requests_are_paced_and_budget_limits_remaining_work(self):
        s3 = FakeS3()
        put_catalog(s3, [catalog_row("123"), catalog_row("456")])
        clock = Clock()
        calls = []
        def timed(*args):
            calls.append(clock.now())
            clock.value += 5
            return response(*args)
        result = run(s3, ["123", "456"], call=timed, clock=clock, budgetSeconds=30, env={"KTO_DETAIL_INTERVAL_SECONDS": "7"})
        self.assertTrue(result["skipped"])
        self.assertTrue(all(b - a >= 7 for a, b in zip(calls, calls[1:])))
        self.assertLess(clock.now(), 30)

    def test_wellness_and_english_use_their_own_content_types_language_and_contracts(self):
        for service in ("wellness", "english"):
            s3 = FakeS3()
            put_catalog(s3, [catalog_row("123", service=service)], service)
            calls = []
            def traced(*args):
                calls.append(args)
                return response(*args)
            result = run(s3, ["123"], service, call=traced)
            self.assertTrue(result["ok"])
            intro = next(params for _, op, params in calls if op.startswith("detailIntro"))
            self.assertEqual(intro["contentTypeId"], "12")
            if service == "wellness":
                self.assertEqual(intro["langDivCd"], "KOR")
            self.assertNotIn("accessibility", doc(s3, "123", service=service)["sections"])


if __name__ == "__main__":
    unittest.main()
