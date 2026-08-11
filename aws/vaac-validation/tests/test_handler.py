import importlib.util
import pathlib
import unittest
from datetime import datetime, timezone


PATH = pathlib.Path(__file__).parents[1] / "handler.py"
SPEC = importlib.util.spec_from_file_location("vaac_validation_handler", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def advisory(identifier, issued, observed, polygon, forecasts=None, closed=False):
    return {
        "id": identifier,
        "issuedAt": issued,
        "observedAt": observed,
        "volcano": "TEST",
        "volcanoNumber": "123456",
        "closedByIssuer": closed,
        "observation": {"polygon": polygon},
        "forecasts": forecasts or [],
    }


TRIANGLE = [
    {"lat": 10.0, "lon": 179.5},
    {"lat": 11.0, "lon": -179.5},
    {"lat": 9.5, "lon": -179.0},
]


class ValidationTest(unittest.TestCase):
    def test_dateline_polygon_has_small_self_error(self):
        error = MODULE.polygon_error(TRIANGLE, TRIANGLE)
        self.assertEqual(error["centroidErrorKm"], 0.0)
        self.assertEqual(error["symmetricHausdorffKm"], 0.0)

    def test_forecast_pairs_by_valid_time_not_issue_time(self):
        forecast = advisory(
            "f1", "2026-08-01T00:00:00Z", "2026-08-01T00:00:00Z", TRIANGLE,
            forecasts=[{
                "leadHours": 6,
                "validAt": "2026-08-01T06:00:00Z",
                "available": True,
                "polygon": TRIANGLE,
            }],
        )
        observed = advisory(
            "o1", "2026-08-01T06:20:00Z", "2026-08-01T05:50:00Z", TRIANGLE,
        )
        pairs, unmatched = MODULE.pair_forecasts([forecast, observed])
        self.assertEqual(len(pairs), 1)
        self.assertEqual(pairs[0]["timeGapMinutes"], 10)
        self.assertEqual(unmatched, [])

    def test_no_future_observation_stays_unmatched(self):
        forecast = advisory(
            "f1", "2026-08-01T00:00:00Z", "2026-08-01T00:00:00Z", TRIANGLE,
            forecasts=[{
                "leadHours": 12,
                "validAt": "2026-08-01T12:00:00Z",
                "available": True,
                "polygon": TRIANGLE,
            }],
        )
        pairs, unmatched = MODULE.pair_forecasts([forecast])
        self.assertEqual(pairs, [])
        self.assertEqual(len(unmatched), 1)

    def test_observation_after_issuer_close_is_not_same_event(self):
        forecast = advisory(
            "f1", "2026-08-01T00:00:00Z", "2026-08-01T00:00:00Z", TRIANGLE,
            forecasts=[{
                "leadHours": 6,
                "validAt": "2026-08-01T06:00:00Z",
                "available": True,
                "polygon": TRIANGLE,
            }],
            closed=True,
        )
        new_eruption = advisory(
            "o2", "2026-08-01T06:10:00Z", "2026-08-01T06:00:00Z", TRIANGLE,
        )
        pairs, unmatched = MODULE.pair_forecasts([forecast, new_eruption])
        self.assertEqual(pairs, [])
        self.assertEqual(len(unmatched), 1)

    def test_gate_counts_sessions_not_forecast_rows(self):
        forecast = advisory(
            "f1", "2026-08-01T00:00:00Z", "2026-08-01T00:00:00Z", TRIANGLE,
            forecasts=[{
                "leadHours": 6,
                "validAt": "2026-08-01T06:00:00Z",
                "available": True,
                "polygon": TRIANGLE,
            }],
        )
        observed = advisory(
            "o1", "2026-08-01T06:10:00Z", "2026-08-01T06:00:00Z", TRIANGLE,
            closed=True,
        )
        result = MODULE.build(
            {"generatedAt": "2026-08-01T07:00:00Z", "source": {}, "advisories": [forecast, observed]},
            now=datetime(2026, 8, 1, 7, tzinfo=timezone.utc),
        )
        self.assertEqual(result["pairN"], 1)
        self.assertEqual(result["eventSessionWithPairN"], 1)
        self.assertFalse(result["gate"]["passed"])
        self.assertFalse(result["gate"]["labReportAllowed"])

        later = MODULE.build(
            {"generatedAt": "2026-08-01T08:00:00Z", "source": {}, "advisories": [forecast, observed]},
            now=datetime(2026, 8, 1, 8, tzinfo=timezone.utc),
        )
        self.assertEqual(result["contentHash"], later["contentHash"])


if __name__ == "__main__":
    unittest.main()
