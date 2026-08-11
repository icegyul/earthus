import importlib.util
import pathlib
import unittest
from datetime import datetime, timezone


PATH = pathlib.Path(__file__).parents[1] / "handler.py"
SPEC = importlib.util.spec_from_file_location("air_evidence_handler", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def model(stamp="2026-08-11T05:00:00Z"):
    # 80E, 85E, 90E x 10N, 15N, 20N
    return {
        "time": stamp, "res": 5, "lat0": 10, "lon0": 80, "nx": 3, "ny": 3,
        "source": "CAMS test", "dust": list(range(9)), "pm10": list(range(10, 19)),
        "pm25": list(range(20, 29)), "aod": [0.1] * 9,
    }


def observations(stamp="2026-08-11T05:10:00Z"):
    return {
        "generated": stamp, "observedKst": "2026-08-11 14:00",
        "stations": [
            {"name": "A", "sido": "서울", "kind": "도시대기", "at": "2026-08-11 14:00",
             "lat": 37.5, "lon": 127.0, "pm10": 20, "pm25": 10},
            {"name": "B", "sido": "서울", "kind": "도시대기", "at": "2026-08-11 14:00",
             "pm10": None, "pm25": None},
        ],
    }


NOW = datetime(2026, 8, 11, 6, tzinfo=timezone.utc)


class AirEvidenceTest(unittest.TestCase):
    def test_extracts_only_bounded_cells_and_located_stations(self):
        result = MODULE.build(model(), observations(), now=NOW)
        self.assertEqual(result["input"]["model"]["cellN"], 4)
        self.assertEqual(result["input"]["observations"]["stationN"], 1)
        self.assertEqual(result["input"]["observations"]["missing"]["coordinates"], 1)
        self.assertEqual(result["status"], "READY_TO_ARCHIVE")

    def test_same_inputs_do_not_increment_snapshot(self):
        first = MODULE.build(model(), observations(), now=NOW)
        second = MODULE.build(model(), observations(), previous=first, now=NOW)
        self.assertTrue(first["changed"])
        self.assertFalse(second["changed"])
        self.assertEqual(second["snapshotCount"], 1)

    def test_six_distinct_fresh_snapshots_open_sequence_gate(self):
        previous = {"snapshotCount": 5, "contentHash": "different"}
        result = MODULE.build(model(), observations(), previous=previous, now=NOW)
        self.assertEqual(result["snapshotCount"], 6)
        self.assertTrue(result["gate"]["sequenceCalculationAllowed"])
        self.assertFalse(result["gate"]["labReportAllowed"])

    def test_stale_input_closes_gate(self):
        result = MODULE.build(model("2026-08-10T00:00:00Z"), observations(),
                              previous={"snapshotCount": 10, "contentHash": "different"}, now=NOW)
        self.assertEqual(result["status"], "INPUT_STALE")
        self.assertFalse(result["gate"]["sequenceCalculationAllowed"])


if __name__ == "__main__":
    unittest.main()
