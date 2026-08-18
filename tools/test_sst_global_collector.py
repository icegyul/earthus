#!/usr/bin/env python3
"""NOAA OISST 전지구판의 좌표 회전과 마지막 정상판 보존 회귀검사."""

import importlib.util
import io
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import sys
import types


ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("CACHE_BUCKET", "test-bucket")
os.environ.setdefault("CACHE_REGION", "us-east-2")


class FakeS3:
    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, **kwargs):  # noqa: N803
        raw = Body if isinstance(Body, bytes) else Body.encode("utf-8")
        self.objects[Key] = {"body": raw, "kwargs": kwargs}
        return {"ETag": "fixture"}

    def get_object(self, Bucket, Key):  # noqa: N803
        return {"Body": io.BytesIO(self.objects[Key]["body"])}


fake_s3 = FakeS3()
sys.modules["boto3"] = types.SimpleNamespace(client=lambda *args, **kwargs: fake_s3)

spec = importlib.util.spec_from_file_location(
    "earthus_sst_global", ROOT / "aws/marine-grid/handler.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def ascii_grid():
    lines = []
    for row in range(module.SST_NY):
        values = [f"{column / 10:.1f}" for column in range(module.SST_NX)]
        lines.append(f"[0][{row}], " + ", ".join(values))
    return "\n".join(lines)


def rotation_and_provenance():
    fixture = ascii_grid()
    module._oisst_time_len = lambda year: 3
    module._oisst_text = lambda url: fixture
    doc = module.oisst_sst_global(datetime(2026, 1, 5, tzinfo=timezone.utc))

    assert doc["observed"] == "2026-01-03T00:00:00Z"
    assert doc["source"] == "NOAA OISST v2.1 daily observation"
    assert doc["dataType"] == "observation" and doc["res"] == 1.0
    assert doc["lon0"] == -179.875 and doc["lat0"] == -79.875
    assert doc["sst"][0] == 18.0, "180.125E must become the first -179.875 column"
    assert doc["sst"][module.SST_NX // 2] == 0.0, "0.125E must move to the middle"
    assert doc["sea"] == module.SST_NX * module.SST_NY


def last_good_is_preserved():
    store = FakeS3()
    module.dst = store
    module.grid_points = lambda: ([0.0], [0.0])
    module.fetch_batch = lambda points: [{"current": {"sea_surface_temperature": 20.0}}]
    module.time.sleep = lambda seconds: None
    module.oisst_sst_global = lambda now: (_ for _ in ()).throw(RuntimeError("fixture failure"))

    result = module.handler({}, None)
    assert result["ok"] is True and result["sstGlobal"]["ok"] is False
    assert "ocean/marine.json" in store.objects
    assert "ocean/sst-global.json" not in store.objects
    marine = json.loads(store.objects["ocean/marine.json"]["body"])
    assert marine["sst"] == [20.0]


if __name__ == "__main__":
    rotation_and_provenance()
    last_good_is_preserved()
    print("SST global collector tests: 14 passed")
