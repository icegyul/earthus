import importlib.util
import pathlib
import sys
import types
import unittest
from datetime import datetime, timezone


class _FakeS3:
    pass


if "boto3" not in sys.modules:
    boto3 = types.ModuleType("boto3")
    boto3.client = lambda *args, **kwargs: _FakeS3()
    sys.modules["boto3"] = boto3

HANDLER = pathlib.Path(__file__).parent.parent / "handler.py"
SPEC = importlib.util.spec_from_file_location("atmos_transport", HANDLER)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class EngineTest(unittest.TestCase):
    def test_wind_from_west_moves_east(self):
        self.assertEqual(MODULE.toward_from_wind(270), 90)
        lat, lon = MODULE.destination(35, 130, 90, 100)
        self.assertAlmostEqual(lat, 34.995, places=2)
        self.assertGreater(lon, 131)

    def test_stale_fire_input_stops_calculation(self):
        doc = {"generated": "2026-08-10T00:00:00Z", "items": []}
        with self.assertRaisesRegex(RuntimeError, "stale"):
            MODULE.select_sources(doc, datetime(2026, 8, 11, tzinfo=timezone.utc))

    def test_heat_cluster_is_not_renamed_wildfire(self):
        doc = {"generated": "2026-08-11T00:00:00Z", "items": [{
            "fid": "F1", "lat": 35, "lon": 130, "frp": 500,
            "seenCount": 2, "highConf": 1, "count": 3,
        }]}
        sources, _ = MODULE.select_sources(doc, datetime(2026, 8, 11, 1, tzinfo=timezone.utc))
        self.assertTrue(sources[0]["notConfirmedWildfire"])


if __name__ == "__main__":
    unittest.main()
