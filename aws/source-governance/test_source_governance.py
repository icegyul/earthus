# -*- coding: utf-8 -*-
import copy
import importlib.util
import json
import os
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from policy import evaluate_batch, registry_index, validate_registry  # noqa: E402


EVALUATED_AT = "2026-08-12T00:05:00Z"


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def registry():
    return load_json(ROOT / "registry.draft.json")


def expected():
    return load_json(ROOT / "fixtures" / "expected-decisions.json")


def approved(entry, *, due="2026-09-12T00:00:00Z"):
    item = copy.deepcopy(entry)
    item.update({
        "status": "APPROVED",
        "reviewDueAt": due,
        "effectiveAt": "2026-08-12T00:00:00Z",
        "approvedAt": "2026-08-11T23:50:00Z",
        "approval": {
            "actorId": "fixture-pd", "reason": "golden replay only",
            "approvedAt": "2026-08-11T23:50:00Z",
            "effectiveAt": "2026-08-12T00:00:00Z",
            "rollbackVersion": "fixture.previous",
            "evidenceRefs": ["fixture://rights-review"],
        },
        "owner": "fixture-pd",
    })
    return item


def allow_all(entry):
    item = copy.deepcopy(entry)
    item["rights"] = {operation: "ALLOW_WITH_ATTRIBUTION" for operation in item["rights"]}
    return item


def batch_for(entry, *, observed="2026-08-12T00:03:00Z", source_count=736,
              canonical_count=None, rejected=0, include_signal=True):
    canonical_count = source_count - rejected if canonical_count is None else canonical_count
    signal = {
        "schemaVersion": "earth.signal.v1",
        "signalId": "fixture:signal:1",
        "observedAt": observed,
        "issuedAt": observed,
        "validFrom": observed,
        "value": 20.0,
        "missingReason": None,
        "quality": {"status": "OK", "reasons": [], "n": 1},
        "source": {
            "sourceId": entry["sourceId"], "provider": entry["provider"],
            "dataset": entry["dataset"], "url": entry["sourceUrl"],
            "termsUrl": entry["termsUrl"],
            "licenseStatus": entry["expectedLicenseStatuses"][0],
            "attribution": entry["attribution"], "snapshotGeneratedAt": observed,
        },
    }
    return {
        "schemaVersion": "earth.signal.batch.v1",
        "signalSchemaVersion": "earth.signal.v1",
        "adapter": {"name": "fixture", "version": "1"},
        "processedAt": "2026-08-12T00:04:00Z",
        "input": {"bucket": "fixture", "key": "fixture.json", "sha256": "fixture",
                  "bytes": 1, "etag": None, "lastModified": observed},
        "source": signal["source"],
        "sourceRecordCount": source_count,
        "canonicalRecordCount": canonical_count,
        "rejectedCount": rejected,
        "rejectedByReason": {}, "rejected": [],
        "signals": [signal] if include_signal else [],
    }


def evaluate(entry, batch, *, at=EVALUATED_AT, revision="fixture.registry.1"):
    return evaluate_batch(batch, entry, evaluated_at=at,
                          registry_revision=revision, evaluator_version="fixture-evaluator")


def error_codes(result):
    return {item["code"] for item in result["errors"]}


class RegistryAndPolicyReplayTest(unittest.TestCase):
    def setUp(self):
        self.registry = registry()
        self.index = registry_index(self.registry, require_bundled_draft=True)
        self.entry = self.index["kma.aws-1min.temperature"]
        self.expected = expected()

    def test_gov_01_bundled_registry_is_draft_and_unique(self):
        self.assertEqual(validate_registry(self.registry, require_bundled_draft=True), [])
        self.assertEqual(len(self.index), 3)
        self.assertTrue(all(entry["status"] == "DRAFT" for entry in self.index.values()))
        self.assertTrue(all(entry["approval"] is None for entry in self.index.values()))

    def test_gov_02_approved_fresh_allows_display_with_attribution(self):
        entry = approved(self.entry)
        result = evaluate(entry, batch_for(entry))
        exp = self.expected["approvedFresh"]
        self.assertEqual(result["presentation"]["state"], exp["presentation"])
        self.assertEqual(result["freshness"]["status"], exp["freshness"])
        self.assertEqual(result["providerHealth"]["status"], exp["providerHealth"])
        self.assertEqual(result["operations"]["display"]["decision"], exp["display"])
        self.assertIn(exp["displayCondition"], result["operations"]["display"]["conditions"])
        self.assertTrue(result["presentation"]["dataVisible"])

    def test_gov_03_draft_blocks_all_new_use(self):
        result = evaluate(self.entry, batch_for(self.entry))
        exp = self.expected["draft"]
        self.assertEqual(result["presentation"]["state"], exp["presentation"])
        self.assertTrue(all(value["decision"] == "BLOCK"
                            for value in result["operations"].values()))
        self.assertIn(exp["error"], error_codes(result))

    def test_gov_04_blocked_policy_replay(self):
        entry = copy.deepcopy(self.entry)
        entry["status"] = "BLOCKED"
        result = evaluate(entry, batch_for(entry))
        exp = self.expected["blocked"]
        self.assertEqual(result["presentation"]["state"], exp["presentation"])
        self.assertEqual(result["operations"]["display"]["decision"], exp["display"])
        self.assertIn(exp["error"], error_codes(result))

    def test_gov_05_expired_policy_replay(self):
        entry = copy.deepcopy(self.entry)
        entry["status"] = "EXPIRED"
        result = evaluate(entry, batch_for(entry))
        exp = self.expected["expired"]
        self.assertEqual(result["presentation"]["state"], exp["presentation"])
        self.assertIn(exp["error"], error_codes(result))

    def test_gov_06_overdue_review_expires_approved_use(self):
        entry = approved(self.entry, due="2026-08-12T00:05:00Z")
        result = evaluate(entry, batch_for(entry))
        self.assertEqual(result["presentation"]["state"], "POLICY_BLOCKED")
        self.assertIn("SOURCE_REVIEW_DUE", error_codes(result))

    def test_gov_07_approved_requires_append_only_approval_evidence(self):
        entry = approved(self.entry)
        entry["approval"] = None
        self.assertTrue(any("approval evidence" in problem
                            for problem in validate_registry({**self.registry, "entries": [entry]})))
        result = evaluate(entry, batch_for(entry))
        self.assertIn("SOURCE_APPROVAL_MISSING", error_codes(result))

    def test_gov_08_stale_is_labelled_and_blocks_ai_not_history(self):
        entry = allow_all(approved(self.entry))
        source = batch_for(entry, observed="2026-08-11T23:50:00Z")
        result = evaluate(entry, source)
        exp = self.expected["stale"]
        self.assertEqual(result["presentation"]["state"], exp["presentation"])
        self.assertEqual(result["providerHealth"]["status"], "HEALTHY")
        self.assertEqual(result["operations"]["display"]["decision"], exp["display"])
        self.assertIn(exp["displayCondition"], result["operations"]["display"]["conditions"])
        self.assertEqual(result["operations"]["AI"]["decision"], exp["AI"])
        self.assertEqual(result["operations"]["history"]["decision"], "ALLOW")
        self.assertIn(exp["error"], error_codes(result))

    def test_gov_09_aging_is_not_called_fresh(self):
        entry = allow_all(approved(self.entry))
        source = batch_for(entry, observed="2026-08-11T23:59:00Z")
        result = evaluate(entry, source)
        self.assertEqual(result["freshness"]["status"], "AGING")
        self.assertEqual(result["presentation"]["state"], "AGING")
        self.assertIn("AGING_LABEL", result["operations"]["display"]["conditions"])

    def test_gov_10_missing_time_is_unknown_and_cache_only_quarantine(self):
        entry = allow_all(approved(self.entry))
        source = batch_for(entry, observed=None)
        source["input"]["lastModified"] = None
        source["signals"][0]["source"]["snapshotGeneratedAt"] = None
        result = evaluate(entry, source)
        self.assertEqual(result["freshness"]["status"], "UNKNOWN")
        self.assertEqual(result["providerHealth"]["status"], "HEALTHY")
        self.assertEqual(result["presentation"]["state"], "UNKNOWN")
        self.assertEqual(result["operations"]["display"]["decision"], "BLOCK")
        self.assertEqual(result["operations"]["cache"]["decision"], "ALLOW")
        self.assertIn("QUARANTINE_ONLY", result["operations"]["cache"]["conditions"])

    def test_gov_11_future_time_is_unknown_not_fresh(self):
        entry = allow_all(approved(self.entry))
        source = batch_for(entry, observed="2026-08-12T00:20:00Z")
        result = evaluate(entry, source)
        self.assertEqual(result["freshness"]["status"], "FUTURE")
        self.assertEqual(result["presentation"]["state"], "UNKNOWN")
        self.assertIn("SOURCE_TIME_IN_FUTURE", error_codes(result))

    def test_gov_12_runtime_license_drift_blocks_registry_use(self):
        entry = approved(self.entry)
        source = batch_for(entry)
        source["signals"][0]["source"]["licenseStatus"] = "UNKNOWN"
        result = evaluate(entry, source)
        self.assertEqual(result["presentation"]["state"], "POLICY_BLOCKED")
        self.assertIn("SOURCE_LICENSE_DRIFT", error_codes(result))

    def test_gov_13_too_few_records_is_provider_down(self):
        entry = allow_all(approved(self.entry))
        result = evaluate(entry, batch_for(entry, source_count=5))
        self.assertEqual(result["providerHealth"]["status"], "DOWN")
        self.assertEqual(result["presentation"]["state"], "UNKNOWN")
        self.assertIn("PROVIDER_TOO_FEW_RECORDS", error_codes(result))

    def test_gov_14_rejection_rate_is_degraded_but_not_hidden(self):
        entry = allow_all(approved(self.entry))
        result = evaluate(entry, batch_for(entry, source_count=736, rejected=10))
        self.assertEqual(result["providerHealth"]["status"], "DEGRADED")
        self.assertEqual(result["presentation"]["state"], "AGING")
        self.assertIn("PROVIDER_DEGRADED_LABEL",
                      result["operations"]["display"]["conditions"])
        self.assertIn("PROVIDER_REJECTION_RATE", error_codes(result))

    def test_gov_15_empty_warning_batch_can_be_healthy_but_not_safe(self):
        entry = allow_all(approved(self.index["kma.weather-warning.wrn-now-data"]))
        source = batch_for(entry, observed="2026-08-12T00:03:00Z",
                           source_count=0, canonical_count=0, include_signal=False)
        result = evaluate(entry, source)
        self.assertEqual(result["providerHealth"]["status"], "HEALTHY")
        self.assertEqual(result["presentation"]["state"], "READY")
        self.assertFalse(result["presentation"]["dataVisible"])
        self.assertEqual(result["presentation"]["safetyMeaning"], "NO_INFERENCE")

    def test_gov_16_evaluation_id_tracks_registry_revision(self):
        entry = approved(self.entry)
        source = batch_for(entry)
        first = evaluate(entry, source, revision="registry.1")
        same = evaluate(entry, source, revision="registry.1")
        revised = evaluate(entry, source, revision="registry.2")
        self.assertEqual(first["evaluationId"], same["evaluationId"])
        self.assertNotEqual(first["evaluationId"], revised["evaluationId"])

    def test_gov_17_full_tpw_batch_is_summarized_not_copied(self):
        entry = self.index["noaa.ncep.gfs.pwat-0p25-f000"]
        source = batch_for(entry, observed="2026-08-12T00:00:00Z", source_count=3276)
        template = source["signals"][0]
        source["signals"] = []
        for index in range(3276):
            signal = copy.deepcopy(template)
            signal["signalId"] = f"fixture:tpw:{index}"
            signal["value"] = float(index % 80)
            source["signals"].append(signal)
        result = evaluate(entry, source)
        encoded = json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.assertEqual(result["providerHealth"]["canonicalRecordCount"], 3276)
        self.assertEqual(result["providerHealth"]["status"], "HEALTHY")
        self.assertEqual(result["presentation"]["state"], "POLICY_BLOCKED")
        self.assertLess(len(encoded), 100_000)


class HandlerIsolationTest(unittest.TestCase):
    def _module_and_sources(self, missing=None):
        os.environ.setdefault("CACHE_BUCKET", "fixture")
        spec = importlib.util.spec_from_file_location("source_governance_handler", ROOT / "handler.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        entries = registry_index(registry(), require_bundled_draft=True)
        documents = {}
        for source_id, config in module.SOURCES.items():
            if source_id == missing:
                continue
            entry = entries[source_id]
            count = 3276 if source_id.startswith("noaa.") else (1 if "warning" in source_id else 736)
            documents[config["src"]] = batch_for(entry, source_count=count)

        class Body:
            def __init__(self, raw): self.raw = raw
            def read(self): return self.raw

        class FakeS3:
            def __init__(self): self.writes = []
            def get_object(self, Bucket, Key):
                if Key not in documents:
                    raise KeyError(Key)
                raw = json.dumps(documents[Key], ensure_ascii=False).encode("utf-8")
                return {"Body": Body(raw), "ETag": '"fixture"'}
            def put_object(self, **kwargs): self.writes.append(kwargs)

        fake = FakeS3()
        module.s3 = fake
        return module, fake

    def test_gov_18_handler_writes_only_private_draft_shadows(self):
        module, fake = self._module_and_sources()
        result = module.handler({"evaluatedAt": EVALUATED_AT})
        self.assertTrue(result["ok"])
        self.assertNotEqual(module.EVALUATOR_VERSION, "dev")
        self.assertEqual(len(fake.writes), 3)
        self.assertTrue(all(item["Key"].startswith("archive/governance/v1/")
                            for item in fake.writes))
        self.assertTrue(all(item["CacheControl"] == "private, no-store"
                            for item in fake.writes))
        for item in fake.writes:
            saved = json.loads(item["Body"])
            self.assertEqual(saved["policy"]["status"], "DRAFT")
            self.assertEqual(saved["presentation"]["state"], "POLICY_BLOCKED")

    def test_gov_19_handler_reports_partial_source_failure(self):
        missing = "noaa.ncep.gfs.pwat-0p25-f000"
        module, fake = self._module_and_sources(missing=missing)
        result = module.handler({"evaluatedAt": EVALUATED_AT})
        self.assertFalse(result["ok"])
        self.assertIn(missing, result["failures"])
        self.assertEqual(len(fake.writes), 2)

    def test_gov_20_registry_rejects_bad_time_and_threshold_contract(self):
        broken = registry()
        broken["status"] = "NOT_A_STATUS"
        broken["entries"][0]["reviewedAt"] = "2026-08-12T00:00:00"
        broken["entries"][0]["providerHealthPolicy"]["degradedRejectionRate"] = 0.5
        broken["entries"][0]["providerHealthPolicy"]["downRejectionRate"] = 0.1
        problems = validate_registry(broken)
        self.assertIn("registry status", problems)
        self.assertTrue(any("review window" in item for item in problems))
        self.assertTrue(any("providerHealthPolicy" in item for item in problems))


if __name__ == "__main__":
    unittest.main()
