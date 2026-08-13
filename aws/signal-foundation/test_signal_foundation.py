# -*- coding: utf-8 -*-
import copy
import importlib.util
import json
import os
import sys
import unittest
from pathlib import Path

from botocore.exceptions import ClientError


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from adapters import adapt_kma_aws_temperature, adapt_kma_warning, adapt_tpw_grid  # noqa: E402
from canonical import (epsg5186_to_wgs84, normalize_depth, parse_source_time,  # noqa: E402
                       split_dateline_line, validate_envelope)


def fixture(name):
    return json.loads((ROOT / "fixtures" / name).read_text(encoding="utf-8"))


class CanonicalGoldenTest(unittest.TestCase):
    def setUp(self):
        self.expected = fixture("expected-contract.json")
        self.processed = self.expected["processedAt"]
        self.version = self.expected["processorVersion"]
        self.meta = {"bucket": "fixture", "key": "fixture.json", "sha256": "fixture",
                     "bytes": 1, "etag": None, "lastModified": None}

    def test_can_01_kst_and_three_compatibility_adapters(self):
        warning = adapt_kma_warning(
            fixture("source-kma-warning.json"), input_meta=self.meta,
            processed_at=self.processed, version=self.version)
        aws = adapt_kma_aws_temperature(
            fixture("source-kma-aws-temperature.json"), input_meta=self.meta,
            processed_at=self.processed, version=self.version)
        tpw = adapt_tpw_grid(
            fixture("source-noaa-gfs-tpw.json"), input_meta=self.meta,
            processed_at=self.processed, version=self.version)

        e = self.expected["warning"]
        s = warning["signals"][0]
        self.assertEqual(warning["canonicalRecordCount"], e["count"])
        self.assertEqual(warning["source"]["sourceId"], "kma.weather-warning.wrn-now-data")
        self.assertEqual(s["signalType"], e["signalType"])
        self.assertEqual(s["issuedAt"], e["issuedAt"])
        self.assertEqual(s["validFrom"], e["validFrom"])
        self.assertEqual(s["timePrecision"]["issuedAt"], "MINUTE")
        self.assertEqual(s["value"], e["value"])
        self.assertEqual(s["sourceValue"], e["sourceValue"])
        self.assertEqual(s["source"]["sourceId"], "kma.weather-warning.wrn-now-data")
        self.assertEqual(s["missingReason"], e["missingReason"])
        self.assertEqual(s["geometry"], e["geometry"])
        self.assertEqual(s["region"]["sourceRegionCode"], e["sourceRegionCode"])
        self.assertEqual(s["quality"]["status"], e["qualityStatus"])

        e = self.expected["aws"]
        first, second = aws["signals"]
        self.assertEqual(aws["canonicalRecordCount"], e["count"])
        self.assertEqual(aws["source"]["sourceId"], "kma.aws-1min.temperature")
        self.assertEqual(first["signalType"], e["firstSignalType"])
        self.assertEqual(first["observedAt"], e["firstObservedAt"])
        self.assertEqual(first["timePrecision"]["observedAt"], "MINUTE")
        self.assertEqual(first["value"], e["firstValue"])
        self.assertEqual(first["unit"], e["firstUnit"])
        self.assertEqual(first["source"]["sourceId"], "kma.aws-1min.temperature")
        self.assertEqual(first["geometry"]["coordinates"], e["firstCoordinates"])
        self.assertEqual(first["vertical"], e["firstVertical"])
        self.assertEqual(second["value"], e["secondValue"])
        self.assertEqual(second["missingReason"], e["secondMissingReason"])
        self.assertEqual(second["quality"]["status"], e["secondQualityStatus"])

        e = self.expected["tpw"]
        first, second, _, last = tpw["signals"]
        self.assertEqual(tpw["canonicalRecordCount"], e["count"])
        self.assertEqual(tpw["source"]["sourceId"], "noaa.ncep.gfs.pwat-0p25-f000")
        self.assertEqual(first["signalType"], e["firstSignalType"])
        self.assertEqual(first["issuedAt"], e["firstIssuedAt"])
        self.assertEqual(first["validFrom"], e["firstValidFrom"])
        self.assertEqual(first["timePrecision"]["validFrom"], "HOUR")
        self.assertEqual(first["value"], e["firstValue"])
        self.assertEqual(first["unit"], e["firstUnit"])
        self.assertEqual(first["sourceValue"], e["firstSourceValue"])
        self.assertEqual(first["sourceUnit"], e["firstSourceUnit"])
        self.assertEqual(first["source"]["sourceId"], "noaa.ncep.gfs.pwat-0p25-f000")
        self.assertEqual(second["value"], e["secondValue"])
        self.assertEqual(second["missingReason"], e["secondMissingReason"])
        self.assertEqual(last["geometry"]["coordinates"], e["lastCoordinates"])
        for signal in warning["signals"] + aws["signals"] + tpw["signals"]:
            self.assertEqual(validate_envelope(signal), [])

    def test_can_02_dst_ambiguous_without_offset_is_unknown(self):
        value, reason = parse_source_time("2026-11-01T01:30:00", "America/New_York")
        self.assertIsNone(value)
        self.assertEqual(reason, "TIME_UNCERTAIN")

    def test_can_03_dateline_is_split(self):
        geometry = split_dateline_line([[179, 10], [-179, 12]])
        self.assertEqual(geometry["type"], "MultiLineString")
        self.assertEqual(geometry["coordinates"][0][-1][0], 180.0)
        self.assertEqual(geometry["coordinates"][1][0][0], -180.0)
        for part in geometry["coordinates"]:
            self.assertTrue(all(abs(b[0] - a[0]) <= 180 for a, b in zip(part, part[1:])))

    def test_can_04_epsg5186_known_baekdudaegan_point(self):
        # Existing Baekdudaegan evidence point (37.879 N, 128.514 E)
        # projected to EPSG:5186 with the same Snyder parameters as ecobird.
        geometry, transform = epsg5186_to_wgs84(333200.3952, 587650.2557)
        lon, lat = geometry["coordinates"]
        self.assertAlmostEqual(lat, 37.879, places=3)
        self.assertAlmostEqual(lon, 128.514, places=3)
        self.assertEqual(transform["sourceCrs"], "EPSG:5186")
        self.assertEqual(transform["targetCrs"], "EPSG:4326")

    def test_can_05_depth_positive_down(self):
        value, vertical = normalize_depth(-4300)
        self.assertEqual(value, 4300)
        self.assertEqual(vertical["reference"], "DEPTH_M_POSITIVE_DOWN")

    def test_can_06_missing_is_null_not_zero(self):
        batch = adapt_tpw_grid(
            fixture("source-noaa-gfs-tpw.json"), input_meta=self.meta,
            processed_at=self.processed, version=self.version)
        missing = batch["signals"][1]
        self.assertIsNone(missing["value"])
        self.assertEqual(missing["missingReason"], "NOT_REPORTED")

    def test_can_07_unmapped_warning_is_unknown(self):
        batch = adapt_kma_warning(
            fixture("source-kma-warning.json"), input_meta=self.meta,
            processed_at=self.processed, version=self.version)
        signal = batch["signals"][0]
        self.assertIsNone(signal["value"])
        self.assertEqual(signal["missingReason"], "REGION_UNMAPPED")
        self.assertEqual(signal["quality"]["status"], "UNKNOWN")
        self.assertEqual(signal["quality"]["warningKind"], "호우")
        self.assertEqual(signal["quality"]["warningLevel"], "경보")
        self.assertEqual(signal["region"]["sourceParentRegionCode"], "S0000000")
        self.assertEqual(signal["region"]["sourceParentRegionName"], "전국")

    def test_can_08_revision_supersedes_previous(self):
        source = fixture("source-kma-warning.json")
        old = adapt_kma_warning(source, input_meta=self.meta, processed_at=self.processed,
                                version=self.version)
        revised = copy.deepcopy(source)
        revised["active"][0]["issuedKst"] = "202608120930"
        revised["active"][0]["level"] = "중대경보"
        revised["active"][0]["levelRank"] = 3
        new = adapt_kma_warning(revised, input_meta=self.meta, processed_at=self.processed,
                                version=self.version, previous=old)
        self.assertNotEqual(new["signals"][0]["signalId"], old["signals"][0]["signalId"])
        self.assertEqual(new["signals"][0]["supersedes"], old["signals"][0]["signalId"])

    def test_full_tpw_grid_stays_within_shadow_object_budget(self):
        nx, ny = 91, 36
        source = fixture("source-noaa-gfs-tpw.json")
        source.update({
            "nx": nx, "ny": ny, "lat0": 20.0, "lon0": 90.0, "res": 1.0,
            "tpw": [round(5.5 + (index % 120) * 0.6, 1)
                    for index in range(nx * ny)],
        })
        batch = adapt_tpw_grid(source, input_meta=self.meta,
                               processed_at=self.processed, version=self.version)
        raw = json.dumps(batch, ensure_ascii=False, separators=(",", ":"),
                         allow_nan=False).encode("utf-8")
        self.assertEqual(batch["canonicalRecordCount"], 3_276)
        self.assertLess(len(raw), 6_000_000)


class HandlerIsolationTest(unittest.TestCase):
    def test_handler_keeps_originals_and_writes_private_shadow(self):
        os.environ.setdefault("CACHE_BUCKET", "fixture")
        path = ROOT / "handler.py"
        spec = importlib.util.spec_from_file_location("signal_handler", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        sources = {
            "events/kma-warn.json": fixture("source-kma-warning.json"),
            "wind/kma-aws-min.json": fixture("source-kma-aws-temperature.json"),
            "wind/tpw-ea.json": fixture("source-noaa-gfs-tpw.json"),
        }

        class Body:
            def __init__(self, raw): self.raw = raw
            def read(self): return self.raw

        class FakeS3:
            def __init__(self): self.writes = []
            def get_object(self, Bucket, Key):
                if Key not in sources:
                    raise ClientError(
                        {"Error": {"Code": "NoSuchKey", "Message": "fixture missing"}},
                        "GetObject")
                raw = json.dumps(sources[Key], ensure_ascii=False).encode("utf-8")
                return {"Body": Body(raw), "ETag": '"fixture"'}
            def put_object(self, **kwargs): self.writes.append(kwargs)

        fake = FakeS3()
        module.s3 = fake
        result = module.handler()
        self.assertTrue(result["ok"])
        self.assertNotEqual(module.PROCESSOR_VERSION, "dev")
        self.assertEqual(len(fake.writes), 3)
        self.assertTrue(all(w["Key"].startswith("archive/canonical/v1/") for w in fake.writes))
        self.assertTrue(all(w["CacheControl"] == "private, no-store" for w in fake.writes))
        self.assertFalse(any(w["Key"] in sources for w in fake.writes))

    def test_previous_shadow_does_not_hide_access_denied(self):
        os.environ.setdefault("CACHE_BUCKET", "fixture")
        path = ROOT / "handler.py"
        spec = importlib.util.spec_from_file_location("signal_handler_access", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        class DeniedS3:
            def get_object(self, **_kwargs):
                raise ClientError(
                    {"Error": {"Code": "AccessDenied", "Message": "fixture denied"}},
                    "GetObject")

        module.s3 = DeniedS3()
        with self.assertRaises(ClientError):
            module._previous("archive/canonical/v1/denied.json")

    def test_one_adapter_failure_keeps_other_shadows_and_reports_not_ok(self):
        os.environ.setdefault("CACHE_BUCKET", "fixture")
        path = ROOT / "handler.py"
        spec = importlib.util.spec_from_file_location("signal_handler_partial", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        sources = {
            "events/kma-warn.json": fixture("source-kma-warning.json"),
            "wind/kma-aws-min.json": fixture("source-kma-aws-temperature.json"),
            "wind/tpw-ea.json": {"nx": 2, "ny": 2, "tpw": [1.0]},
        }

        class Body:
            def __init__(self, raw): self.raw = raw
            def read(self): return self.raw

        class FakeS3:
            def __init__(self): self.writes = []
            def get_object(self, Bucket, Key):
                if Key not in sources:
                    raise ClientError(
                        {"Error": {"Code": "NoSuchKey", "Message": "fixture missing"}},
                        "GetObject")
                raw = json.dumps(sources[Key], ensure_ascii=False).encode("utf-8")
                return {"Body": Body(raw), "ETag": '"fixture"'}
            def put_object(self, **kwargs): self.writes.append(kwargs)

        fake = FakeS3()
        module.s3 = fake
        result = module.handler()
        self.assertFalse(result["ok"])
        self.assertEqual(set(result["results"]), {"kma-warning", "kma-aws-temperature"})
        self.assertIn("noaa-gfs-tpw", result["failures"])
        self.assertEqual(len(fake.writes), 2)


if __name__ == "__main__":
    unittest.main()
