#!/usr/bin/env python3
"""N1 수집기 관제와 marine-ea timeout 회귀검사."""

import importlib.util
import io
import json
import os
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("CACHE_BUCKET", "test-bucket")
os.environ.setdefault("CACHE_REGION", "us-east-2")


class FakeS3:
    def __init__(self):
        self.objects = {}
        self.modified = {}

    def put_object(self, Bucket, Key, Body, **kwargs):  # noqa: N803
        raw = Body if isinstance(Body, bytes) else Body.encode("utf-8")
        self.objects[Key] = raw
        self.modified[Key] = datetime.now(timezone.utc)
        return {"ETag": "fixture"}

    def get_object(self, Bucket, Key):  # noqa: N803
        return {"Body": io.BytesIO(self.objects[Key])}

    def head_object(self, Bucket, Key):  # noqa: N803
        if Key not in self.objects:
            raise KeyError(Key)
        return {"LastModified": self.modified[Key]}


def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def decode(store, key):
    return json.loads(store.objects[key])


class Context:
    def __init__(self, remaining):
        self.remaining = remaining

    def get_remaining_time_in_millis(self):
        return self.remaining


def marine_deadline_and_success():
    module = load("earthus_n1_marine", "aws/marine-ea/handler.py")
    module.dst = FakeS3()
    module.grid_points = lambda: ([37.0], [126.0, 126.5])
    module.oisst_anomaly_ea = lambda now: (_ for _ in ()).throw(RuntimeError("fixture unavailable"))

    result = module.handler({}, Context(80_000))
    status = decode(module.dst, module.STATUS_DST)
    assert result["status"] == "FAILED"
    assert status["state"] == "FAILED" and status["outputWritten"] is False
    assert status["lastAttemptAt"] and status["lastSuccessAt"] is None
    assert status["quota"] == "UNKNOWN" and status["estimatedCost"] == "UNKNOWN"
    assert "ocean/marine-ea.json" not in module.dst.objects

    module.fetch_batch = lambda pts: [
        {"current": {"wave_height": 1.2, "sea_surface_temperature": 24.1}},
        {"current": {"wave_height": 0.8, "sea_surface_temperature": 23.7}},
    ]
    module.time.sleep = lambda seconds: None
    result = module.handler({}, Context(600_000))
    status = decode(module.dst, module.STATUS_DST)
    assert result["ok"] is True and status["state"] == "SUCCEEDED"
    assert status["lastSuccessAt"] and status["sampleCount"] == 2
    assert status["missing"] == 0 and status["lastGood"] == "ocean/marine-ea.json"
    assert decode(module.dst, "ocean/marine-ea.json")["sea"] == 2


def health_common_states():
    module = load("earthus_n1_health", "aws/health/handler.py")
    expected = {
        ("ok", None): "HEALTHY",
        ("late", None): "AGING",
        ("dead", None): "STALE",
        ("missing", None): "UNKNOWN",
        ("ok", "FAILED"): "FAILED",
        ("ok", "PARTIAL"): "PARTIAL",
        ("dead", "PARTIAL_NO_COVERAGE"): "PARTIAL",
        ("ok", "POLICY_BLOCKED"): "POLICY_BLOCKED",
    }
    for (legacy, state), want in expected.items():
        status = {"state": state} if state else None
        assert module.operational_state(legacy, status) == want

    item = module.add_observability({
        "key": "fixture.json", "legacyState": "late", "ageMin": 12,
        "generated": "2026-08-14T00:00Z", "written": "2026-08-14T00:01Z",
    }, {
        "lastAttemptAt": "2026-08-14T00:01:00Z", "lastSuccessAt": "2026-08-14T00:00:00Z",
        "sampleCount": 3, "missing": 1, "rejected": 2, "latencyMs": 450,
        "quota": "UNKNOWN", "estimatedCost": "UNKNOWN",
    })
    for field in (
        "lastAttemptAt", "lastSuccessAt", "sourceObservedAt", "age", "count", "missing",
        "rejected", "httpStatus", "latency", "lastGood", "quota", "estimatedCost", "revision",
    ):
        assert field in item, field
    assert item["operationalState"] == "AGING" and item["count"] == 3

    stale_output = module.add_observability({
        "key": "stale.json", "legacyState": "dead", "ageMin": 240,
        "generated": "2026-08-13T20:00Z", "written": "2026-08-13T20:01Z",
    })
    assert stale_output["operationalState"] == "STALE"
    assert stale_output["lastSuccessAt"] == "2026-08-13T20:00Z"
    assert stale_output["lastGood"] == "stale.json"

    failed_heartbeat = module.add_observability({
        "key": "failed.json", "legacyState": "late", "ageMin": 1,
        "generated": "2026-08-14T00:02Z", "written": "2026-08-14T00:02Z",
    }, {"state": "FAILED", "lastAttemptAt": "2026-08-14T00:02:00Z", "lastSuccessAt": None})
    assert failed_heartbeat["operationalState"] == "FAILED"
    assert failed_heartbeat["lastSuccessAt"] is None, "failed attempts are not successful observations"

    module.s3 = FakeS3()
    module.s3.objects["wind/fixture.json"] = json.dumps({
        "schemaVersion": "earthus.fixture.v1", "generated": "2026-08-14T00:00:00Z",
        "observedUtc": "202608131800", "stationCount": 19, "levelCount": 3234,
        "missing": {"wind": 2}, "rejected": 0, "stations": [{"count": 9999}],
    }).encode()
    metadata = module.output_metadata_of("wind/fixture.json")
    assert metadata["sampleCount"] == 19, "top-level station count must win over nested counts"
    assert metadata["sourceObservedAt"] == "2026-08-13T18:00:00Z"
    assert metadata["rejected"] == 0
    assert metadata["revision"] == "earthus.fixture.v1"


def tourism_heartbeat_is_visible_in_aggregate_health():
    module = load("earthus_tourism_health", "aws/health/handler.py")
    key = "app/tourism/health.json"
    module.WATCH = [{"key": key, "everyMin": 5, "graceMin": 20,
                     "ko": "서울 관광 인구 흐름 수집 실행", "collectorStatus": True}]
    module.EXPECTED = []
    module.s3 = FakeS3()
    module.s3.objects[key] = json.dumps({
        "schemaVersion": "earthus.tourism-health.v1", "generatedAt": "2026-08-20T09:00:00Z",
        "state": "SUCCEEDED", "lastAttemptAt": "2026-08-20T09:00:00Z",
        "lastSuccessAt": "2026-08-20T09:00:00Z", "sourceObservedAt": "2026-08-20T08:55:00Z",
        "outputWritten": True, "sampleCount": 1, "missing": 120, "failureCount": 0,
        "quota": "UNKNOWN", "estimatedCost": "UNKNOWN", "revision": "tourism-flow-collector.v1",
    }).encode("utf-8")
    module.s3.modified[key] = datetime.now(timezone.utc)

    module.handler()
    doc = decode(module.s3, module.DST)
    item = next(item for item in doc["items"] if item["key"] == key)
    assert item["state"] == "ok" and item["operationalState"] == "HEALTHY"
    assert item["collectorState"] == "SUCCEEDED" and item["count"] == 1
    assert item["missing"] == 120 and item["lastSuccessAt"] == "2026-08-20T09:00:00Z"
    assert item["sourceObservedAt"] == "2026-08-20T08:55:00Z"


if __name__ == "__main__":
    marine_deadline_and_success()
    health_common_states()
    tourism_heartbeat_is_visible_in_aggregate_health()
    print("N1 collector health tests: 39 passed")
