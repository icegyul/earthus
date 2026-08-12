#!/usr/bin/env python3
"""CWA/ASCAT last-good와 실행 heartbeat 분리 회귀검사."""

import importlib.util
import io
import json
import os
import sys
import types
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("CACHE_BUCKET", "test-bucket")
os.environ.setdefault("CACHE_REGION", "us-east-2")


class FakeS3:
    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, **kwargs):  # noqa: N803
        self.objects[Key] = json.loads(Body)
        return {"ETag": "test"}

    def get_object(self, Bucket, Key):  # noqa: N803
        return {"Body": io.BytesIO(json.dumps(self.objects[Key]).encode("utf-8"))}


class FakeSSM:
    def get_parameter(self, **kwargs):
        return {"Parameter": {"Value": "test-token"}}


def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def install_fake_pyhdf():
    package = types.ModuleType("pyhdf")
    sd = types.ModuleType("pyhdf.SD")
    sd.SD = object
    sd.SDC = types.SimpleNamespace(READ=1)
    package.SD = sd
    sys.modules["pyhdf"] = package
    sys.modules["pyhdf.SD"] = sd


def cwa_tests():
    module = load("earthus_cwa_heartbeat_test", "aws/cwa-observations/handler.py")
    module.s3 = FakeS3()
    module.ssm = FakeSSM()
    module.fetch = lambda dataset, token: {"records": {"Station": [{"id": dataset}]}}
    module.normalise = lambda row, kind: {
        "platform": kind, "sourceStationId": row["id"], "observed": "2026-08-12T00:00:00Z"
    }
    result = module.handler()
    status = module.s3.objects[module.STATUS_DST]
    assert result["ok"] is True and result["status"] == "SUCCEEDED"
    assert status["state"] == "SUCCEEDED" and status["outputWritten"] is True
    assert status["stationCount"] == 2 and status["failureCount"] == 0
    assert module.DST in module.s3.objects

    class BrokenSSM:
        def get_parameter(self, **kwargs):
            raise RuntimeError("secret value must not be exposed")

    module.s3 = FakeS3()
    module.ssm = BrokenSSM()
    result = module.handler()
    status = module.s3.objects[module.STATUS_DST]
    assert result["ok"] is False and status["state"] == "FAILED"
    assert "secret value" not in json.dumps(status)
    assert module.DST not in module.s3.objects


def ascat_tests():
    install_fake_pyhdf()
    module = load("earthus_ascat_heartbeat_test", "aws/ascat-observations/handler.py")

    module.s3 = FakeS3()
    module.active_centres = lambda: ([], "2026-08-12T00:00:00Z")
    result = module.handler()
    status = module.s3.objects[module.STATUS_DST]
    assert result["status"] == "IDLE_NO_LIVE_CYCLONES"
    assert status["state"] == "IDLE_NO_LIVE_CYCLONES" and status["outputWritten"] is False

    module.s3 = FakeS3()
    module.active_centres = lambda: ([{"id": "storm-1"}], "2026-08-12T00:00:00Z")
    module.latest_files = lambda now: [{"name": "one.hdf", "satellite": "Metop-C", "orbit": "ascending"}]
    module.file_cells = lambda info, centres: []
    result = module.handler()
    status = module.s3.objects[module.STATUS_DST]
    assert result["status"] == "NO_COVERAGE"
    assert status["state"] == "NO_COVERAGE" and status["cellCount"] == 0
    assert module.DST not in module.s3.objects

    module.s3 = FakeS3()
    module.latest_files = lambda now: [
        {"name": "empty.hdf", "satellite": "Metop-C", "orbit": "ascending"},
        {"name": "bad.hdf", "satellite": "Metop-B", "orbit": "descending"},
    ]

    def partial_no_coverage(info, centres):
        if info["name"] == "bad.hdf":
            raise ValueError("fixture failure")
        return []

    module.file_cells = partial_no_coverage
    result = module.handler()
    status = module.s3.objects[module.STATUS_DST]
    assert result["status"] == "PARTIAL_NO_COVERAGE"
    assert status["state"] == "PARTIAL_NO_COVERAGE" and status["failureCount"] == 1
    assert status["outputWritten"] is False and module.DST not in module.s3.objects

    module.s3 = FakeS3()
    module.latest_files = lambda now: [
        {"name": "good.hdf", "satellite": "Metop-C", "orbit": "ascending"},
        {"name": "bad.hdf", "satellite": "Metop-B", "orbit": "descending"},
    ]

    def partial_cells(info, centres):
        if info["name"] == "bad.hdf":
            raise ValueError("fixture failure")
        return [{
            "id": "ASCAT-0-0", "lat": 0, "lon": 0,
            "observed": "2026-08-12T00:00:00Z", "wind_ms": 1,
            "wind_dir": 2, "u_ms": 3, "v_ms": 4, "qualityRaw": 0,
            "satellite": "Metop-C", "orbit": "ascending", "storms": ["storm-1"],
        }]

    module.file_cells = partial_cells
    result = module.handler()
    status = module.s3.objects[module.STATUS_DST]
    assert result["status"] == "PARTIAL"
    assert status["state"] == "PARTIAL" and status["failureCount"] == 1
    assert status["outputWritten"] is True and module.DST in module.s3.objects


def health_tests():
    module = load("earthus_health_heartbeat_test", "aws/health/handler.py")
    assert module.collector_verdict("ok", None) == "dead"
    assert module.collector_verdict("ok", {"state": "FAILED"}) == "late"
    assert module.collector_verdict("ok", {"state": "PARTIAL"}) == "late"
    assert module.collector_verdict("ok", {"state": "PARTIAL_NO_COVERAGE"}) == "late"
    assert module.collector_verdict("ok", {"state": "NO_COVERAGE"}) == "ok"
    assert module.collector_verdict("ok", {"state": "IDLE_NO_LIVE_CYCLONES"}) == "ok"
    assert module.collector_verdict("dead", {"state": "SUCCEEDED"}) == "dead"

    module.s3 = FakeS3()
    module.s3.objects["status.json"] = {
        "state": "NO_COVERAGE", "reason": "no-cells", "cellCount": 0,
        "outputWritten": False, "failureCount": 0,
    }
    status = module.collector_status_of("status.json")
    assert status["state"] == "NO_COVERAGE" and status["cellCount"] == 0


if __name__ == "__main__":
    cwa_tests()
    ascat_tests()
    health_tests()
    print("collector heartbeat tests: 14 passed")
