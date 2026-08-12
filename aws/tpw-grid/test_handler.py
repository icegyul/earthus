# -*- coding: utf-8 -*-
import importlib.util
import json
import os
import pathlib
import sys
import types
import unittest
from datetime import datetime, timezone


class FakeS3:
    def __init__(self):
        self.puts = []

    def put_object(self, **kwargs):
        self.puts.append(kwargs)


def load_handler():
    fake = FakeS3()
    sys.modules["boto3"] = types.SimpleNamespace(client=lambda *_args, **_kwargs: fake)
    os.environ.setdefault("CACHE_BUCKET", "fixture-bucket")
    os.environ.setdefault("CACHE_REGION", "ap-northeast-2")
    path = pathlib.Path(__file__).with_name("handler.py")
    spec = importlib.util.spec_from_file_location("tpw_handler", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.s3 = fake
    return module, fake


class TpwHandlerTest(unittest.TestCase):
    def test_candidate_runs_are_stable_six_hour_steps(self):
        module, _ = load_handler()
        now = datetime(2026, 8, 11, 16, 30, tzinfo=timezone.utc)
        runs = module.candidate_runs(now, count=3)
        self.assertEqual([r.isoformat() for r in runs], [
            "2026-08-11T12:00:00+00:00",
            "2026-08-11T06:00:00+00:00",
            "2026-08-11T00:00:00+00:00",
        ])
        self.assertIn("var_PWAT=on", module.filter_url(runs[0]))
        self.assertIn("toplat=55", module.filter_url(runs[0]))

    def test_handler_writes_model_analysis_contract(self):
        module, fake = load_handler()
        module.grid_points = lambda: ([20.0, 21.0], [90.0, 91.0])
        run = datetime(2026, 8, 11, 12, tzinfo=timezone.utc)
        module.fetch_latest_grib = lambda: (b"GRIB-fixture", run, "https://example/noaa")
        module.decode_grib = lambda _raw: (
            [10.0, 20.0, 30.0, 40.0],
            "2026-08-11T12:00:00Z",
            "2026-08-11T12:00:00Z",
            {"shortName": "pwat", "units": "kg m**-2", "nativePoints": 4},
        )

        result = module.handler()
        self.assertTrue(result["ok"])
        self.assertEqual(len(fake.puts), 1)
        saved = json.loads(fake.puts[0]["Body"])
        self.assertEqual(saved["schemaVersion"], "earthus.tpw-grid.v1")
        self.assertEqual(saved["dataKind"], "MODEL_ANALYSIS")
        self.assertIsNone(saved["observedAt"])
        self.assertEqual(saved["observedAtMissingReason"], "NOT_AN_OBSERVATION")
        self.assertEqual(saved["issuedAt"], "2026-08-11T12:00:00Z")
        self.assertEqual(saved["validAt"], "2026-08-11T12:00:00Z")
        self.assertEqual(saved["source"], "NOAA/NCEP GFS via NOMADS")
        self.assertEqual(saved["licenseStatus"], "APPROVED_FREE")
        self.assertIsNone(saved["commercialGate"])
        self.assertEqual(saved["unit"], "kg/m²")
        self.assertEqual(saved["displayUnit"], "mm")
        self.assertEqual(saved["tpw"], [10.0, 20.0, 30.0, 40.0])
        self.assertEqual(saved["n"], 4)
        self.assertEqual(saved["failed"], 0)


if __name__ == "__main__":
    unittest.main()
