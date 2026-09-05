"""Independent numerical, invalid-forcing, cancellation and reproducibility checks."""
import copy
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from research_runtime.cli import export_bundle, read_bundle, replay_bundle
from research_runtime.datasets import digest, validate_dataset
from research_runtime.models import METERS_PER_DEGREE, _parcels, _reference_step, distance_m, preflight, run_experiment

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"


def fixture(duration=86400, step=300):
    dataset = json.loads((EXAMPLES / "constant-eastward.dataset.json").read_text())
    spec = json.loads((EXAMPLES / "constant-eastward.experiment.json").read_text())
    spec.update(durationSeconds=duration, integrationStepSeconds=step, outputStepSeconds=min(duration, 3600), backend="analytic-reference")
    return spec, dataset


def seal(dataset):
    dataset["manifest"]["sha256"] = digest(dataset["grid"])
    return dataset


class ComputeTests(unittest.TestCase):
    def test_stationary_24h(self):
        spec, dataset = fixture()
        dataset["grid"]["u"] = [[[0.0]*3 for _ in range(3)] for _ in range(3)]
        result = run_experiment(spec, seal(dataset))
        self.assertEqual(result["qualityStatus"], "COMPLETE")
        self.assertLessEqual(result["summary"]["maxDisplacementMeters"], 1)

    def test_constant_24h_analytic_and_native(self):
        spec, dataset = fixture()
        backends = ["analytic-reference"] + (["oceanparcels"] if _parcels()[0] else [])
        for backend in backends:
            spec["backend"] = backend
            result = run_experiment(spec, dataset)
            end = result["trajectories"][0]["samples"][-1]
            exact_lon = math.degrees(86400/6371008.8)
            self.assertLess(distance_m((end["lon"], end["lat"]), (exact_lon, 0)), 100)
            self.assertEqual(end["timeUTC"], "2025-01-02T00:00:00Z")

    def test_linear_time_forcing(self):
        spec, dataset = fixture(duration=7200, step=300)
        for t, velocity in enumerate([0, 1.5, 3]):
            dataset["grid"]["u"][t] = [[velocity]*3 for _ in range(3)]
        result = run_experiment(spec, seal(dataset))
        expected = 0.5 * (1.5 / 129600) * 7200**2 / METERS_PER_DEGREE
        self.assertAlmostEqual(result["trajectories"][0]["samples"][-1]["lon"], expected, places=10)

    def test_rotation_period_and_rk4_convergence(self):
        class Rotation:
            dx = dy = 10
            def velocity(self, time, lon, lat):
                omega = 2*math.pi/3600
                return -omega*lat*METERS_PER_DEGREE*math.cos(math.radians(lat)), omega*lon*METERS_PER_DEGREE
        grid = Rotation()
        area = {"west": -5, "east": 5, "south": -5, "north": 5}
        errors = []
        for step in (300, 150, 75):
            lon, lat = 0.001, 0
            for t in range(0, 3600, step):
                lon, lat = _reference_step(grid, area, t, lon, lat, step)
            errors.append(math.hypot(lon-0.001, lat))
        self.assertLess(errors[0]/0.001, 0.01)
        self.assertGreater(errors[0]/errors[1], 14)
        self.assertGreater(errors[1]/errors[2], 14)

    def test_dateline_crossing_and_distance(self):
        spec, dataset = fixture()
        dataset["grid"]["lon"] = [178., 181., 184.]
        spec["area"].update(west=178, east=-176)
        spec["releaseDefinition"]["points"][0]["lon"] = 179.9
        result = run_experiment(spec, seal(dataset))
        self.assertLess(result["trajectories"][0]["samples"][-1]["lon"], -179)
        self.assertLess(result["summary"]["maxDisplacementMeters"], 87000)

    def test_thin_island_stops_and_particle_ledger(self):
        spec, dataset = fixture(duration=3600, step=30)
        grid = dataset["grid"]
        grid["lon"] = [-0.02, -0.01, 0., 0.01, 0.02]
        grid["u"] = [[[1.0]*5 for _ in range(3)] for _ in range(3)]
        grid["v"] = [[[0.0]*5 for _ in range(3)] for _ in range(3)]
        grid["landMask"] = [[False, False, True, False, False] for _ in range(3)]
        spec["releaseDefinition"]["points"] = [{"lon": -0.015, "lat": 0, "count": 2}]
        spec["particleCount"] = 2
        result = run_experiment(spec, seal(dataset))
        self.assertEqual(result["qualityStatus"], "PARTIAL")
        self.assertEqual(result["summary"]["statusCounts"]["STRANDED"], 2)
        self.assertEqual(sum(result["summary"]["statusCounts"].values()), 2)
        self.assertLess(result["trajectories"][0]["samples"][-1]["lon"], -0.00999)

    def test_missing_forcing_is_not_zero_velocity(self):
        spec, dataset = fixture(duration=259200)
        dataset["grid"]["u"][2][1][1] = None
        result = run_experiment(spec, seal(dataset))
        self.assertEqual(result["qualityStatus"], "PARTIAL")
        self.assertEqual(result["trajectories"][0]["finalStatus"], "MISSING_FORCING")

    def test_domain_exit_is_partial(self):
        spec, dataset = fixture()
        spec["area"]["east"] = 0.1
        result = run_experiment(spec, dataset)
        self.assertEqual(result["qualityStatus"], "PARTIAL")
        self.assertEqual(result["trajectories"][0]["finalStatus"], "OUT_OF_DOMAIN")

    def test_snapshot_units_hash_calendar_and_period_rejected(self):
        spec, dataset = fixture()
        mutations = [lambda d: d["grid"].update(timeUTC=[d["grid"]["timeUTC"][0]]),
                     lambda d: d["manifest"].update(velocityUnits="knots"),
                     lambda d: d["manifest"].update(calendar="360_day"),
                     lambda d: d["manifest"].update(timeStepSeconds=10800),
                     lambda d: d["grid"].update(timeUTC=[d["grid"]["timeUTC"][0],d["grid"]["timeUTC"][-1]]),
                     lambda d: d["manifest"].update(sha256="0"*64),
                     lambda d: d["grid"]["u"][0][0].append(1)]
        for mutation in mutations:
            altered = copy.deepcopy(dataset)
            mutation(altered)
            with self.assertRaises(ValueError):
                validate_dataset(altered)
        spec["startTimeUTC"] = "2025-01-04T00:00:00Z"
        self.assertFalse(preflight(spec, dataset)["ok"])

    def test_strict_release_step_resource_and_backend_guards(self):
        spec, dataset = fixture()
        for key, value in [("particleCount", True), ("integrationStepSeconds", 0), ("modelId", "arbitrary-code"), ("durationSeconds", 300000)]:
            altered = copy.deepcopy(spec)
            altered[key] = value
            self.assertFalse(preflight(altered, dataset)["ok"])
        dataset["manifest"].update(evidenceKind="ANALYSIS", sourceSha256="0"*64)
        with patch("research_runtime.models._parcels", return_value=(None, None, "install pinned OceanParcels")):
            self.assertFalse(preflight(spec, dataset)["ok"])

    def test_cancel_before_start_and_during_run(self):
        spec, dataset = fixture()
        with self.assertRaises(InterruptedError):
            run_experiment(spec, dataset, cancelled=lambda: True)
        state = {"stop": False}
        with self.assertRaises(InterruptedError):
            run_experiment(spec, dataset, progress=lambda p: state.update(stop=True), cancelled=lambda: state["stop"])

    def test_cancel_before_final_publication(self):
        spec, dataset = fixture(duration=60, step=60)
        state = {"stop": False}
        with self.assertRaises(InterruptedError):
            run_experiment(spec, dataset, progress=lambda p: state.update(stop=p["fraction"] == 1), cancelled=lambda: state["stop"])

    @unittest.skipUnless(_parcels()[0] is not None, "pinned OceanParcels is not installed")
    def test_native_time_dateline_missing_and_coast(self):
        spec, dataset = fixture(duration=7200, step=60)
        spec["backend"] = "oceanparcels"
        for t, velocity in enumerate([0, 1.5, 3]):
            dataset["grid"]["u"][t] = [[velocity]*3 for _ in range(3)]
        result = run_experiment(spec, seal(dataset))
        expected = 0.5 * (1.5/129600) * 7200**2 / METERS_PER_DEGREE
        self.assertAlmostEqual(result["trajectories"][0]["samples"][-1]["lon"], expected, places=8)
        spec, dataset = fixture(duration=7200, step=60)
        spec["backend"] = "oceanparcels"
        dataset["grid"]["lon"] = [178., 181., 184.]
        spec["area"].update(west=178, east=-176)
        spec["releaseDefinition"]["points"][0]["lon"] = 179.99
        result = run_experiment(spec, seal(dataset))
        self.assertLess(result["trajectories"][0]["samples"][-1]["lon"], -179)
        spec, dataset = fixture(duration=3600, step=30)
        spec["backend"] = "oceanparcels"
        grid = dataset["grid"]
        grid["lon"] = [-0.02, -0.01, 0., 0.01, 0.02]
        grid["u"] = [[[1.0]*5 for _ in range(3)] for _ in range(3)]
        grid["v"] = [[[0.0]*5 for _ in range(3)] for _ in range(3)]
        grid["landMask"] = [[False, False, True, False, False] for _ in range(3)]
        spec["releaseDefinition"]["points"] = [{"lon": -0.015, "lat": 0}]
        result = run_experiment(spec, seal(dataset))
        self.assertEqual(result["trajectories"][0]["finalStatus"], "STRANDED")

    def test_export_replay_same_arrays_and_tampering(self):
        spec, dataset = fixture(duration=600, step=60)
        result = run_experiment(spec, dataset)
        with tempfile.TemporaryDirectory() as directory:
            bundle = Path(directory)/"experiment.zip"
            export_bundle(spec, dataset, result, bundle)
            self.assertTrue(replay_bundle(bundle)["matched"])
            files = read_bundle(bundle)
            files["experiment.json"] = b"{}"
            bad = Path(directory)/"tampered.zip"
            with zipfile.ZipFile(bad, "w") as archive:
                for name, data in files.items():
                    archive.writestr(name, data)
            with self.assertRaises(ValueError):
                read_bundle(bad)

    def test_archive_traversal_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle = Path(directory)/"bad.zip"
            with zipfile.ZipFile(bundle, "w") as archive:
                archive.writestr("../outside.txt", "bad")
            with self.assertRaises(ValueError):
                read_bundle(bundle)

    def test_running_worker_rejects_source_changes(self):
        spec, dataset = fixture(duration=60, step=60)
        with patch("research_runtime.models._disk_source_snapshot", return_value={"models.py": "changed"}):
            with self.assertRaisesRegex(ValueError, "restart the worker"):
                run_experiment(spec, dataset)

    def test_replay_rejects_source_provenance_even_with_valid_zip_hashes(self):
        spec, dataset = fixture(duration=60, step=60)
        result = run_experiment(spec, dataset)
        with tempfile.TemporaryDirectory() as directory:
            bundle = Path(directory)/"experiment.zip"
            export_bundle(spec, dataset, result, bundle)
            files = read_bundle(bundle)
            result["provenance"]["modelSourceSha256"] = "0"*64
            files["results/result.json"] = json.dumps(result).encode()
            files["checksums.sha256"] = "".join(f"{hashlib.sha256(data).hexdigest()}  {name}\n" for name, data in sorted(files.items()) if name != "checksums.sha256").encode()
            with zipfile.ZipFile(bundle, "w") as archive:
                for name, data in files.items():
                    archive.writestr(name, data)
            with self.assertRaisesRegex(ValueError, "source differs"):
                replay_bundle(bundle)


if __name__ == "__main__":
    unittest.main()
