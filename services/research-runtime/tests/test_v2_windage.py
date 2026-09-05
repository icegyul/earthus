"""surface-passive-advection.v2.windage — identity, alpha=0 regression, windage physics,
missing≠zero, provenance, replay, registry separation and V1 immutability (TEST 1-14)."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from research_runtime import models as v1
from research_runtime import models_v2 as v2
from research_runtime import registry
from research_runtime.cli_v2 import export_bundle, replay_bundle
from research_runtime.datasets import ForcingBoundary, digest
from research_runtime.models import distance_m
from research_runtime.wind import WIND_READER_VERSION, WindField, validate_wind_dataset

HERE = Path(__file__).resolve().parents[1]
EXAMPLES = HERE / "examples"
ROOT = HERE.parents[1]
IMMUTABLE_V1 = ROOT / "docs/research/evidence/gdp-hycom-cohort-201501/IMMUTABLE-V1.json"
# V1 source snapshot captured at STEP 8 start (before any V2 file existed). Any change = IMPLEMENTATION STOP.
V1_FILE_SHA256 = {
    "models.py": "b772b874b40b4026b51a0ec41ab23ee5cb082dd1d11ac797fe1e1f572c3fe04a",
    "datasets.py": "def5e6f7f6535f25cc300ef3b887f945549d85b0b06059515254f8a24f8523bb",
    "cli.py": "3a7a80d051e28c9668c6c033828469afd6c277b13cd520b809753c26af9e8f14",
    "__init__.py": "366fd795bc0b0bd78a37eb18016a1d93e250c3937a8e4e62ff142b03d56c3f24",
}
V1_MODEL_SOURCE_SHA256 = "42e5886b640b616256dafc036bd4bbceff8a17affab1330947f0a9cb8612e444"
T0, T1, T2 = "2025-01-01T00:00:00Z", "2025-01-01T06:00:00Z", "2025-01-01T12:00:00Z"


def current(u=0.0, v=0.0):
    lon, lat = [-5.0, 0.0, 5.0], [-5.0, 0.0, 5.0]
    plane = lambda value: [[value for _ in lon] for _ in lat]
    grid = {"lon": lon, "lat": lat, "timeUTC": [T0, T2], "u": [plane(u), plane(u)], "v": [plane(v), plane(v)], "landMask": plane(False)}
    manifest = {"datasetId": "syn-current", "version": "1", "evidenceKind": "SYNTHETIC_TEST", "sourceURI": "test", "provider": "test", "citation": "test",
                "license": "test", "issuedAtUTC": T0, "collectedAtUTC": T0, "validTimeStartUTC": T0, "validTimeEndUTC": T2, "sha256": digest(grid),
                "hashScope": "canonical-grid-json", "gridType": "regular-latlon-a-grid", "crs": "EPSG:4326", "calendar": "gregorian", "velocityUnits": "m/s",
                "uDirection": "eastward", "vDirection": "northward", "landMaskVersion": "test", "readerVersion": "earthus-json-grid/1",
                "surfaceDepthMeters": 15, "redistributionAllowed": True, "processingHistory": [], "timeStepSeconds": 43200}
    return {"manifest": manifest, "grid": grid}


def wind(u=10.0, v=0.0, lon=(-6.0, -1.9, 2.1, 6.0), lat=(-6.0, -1.9047, 2.0953, 6.0), times=(T0, T1, T2), holes=()):
    """Deliberately non-uniform Gaussian-like latitudes; `holes` = (t, y, x) nodes set to None."""
    lon, lat = list(lon), list(lat)
    def plane(value):
        return [[value for _ in lon] for _ in lat]
    grid = {"lon": lon, "lat": lat, "timeUTC": list(times), "u": [plane(u) for _ in times], "v": [plane(v) for _ in times]}
    for t, y, x in holes:
        grid["u"][t][y][x] = None
    from research_runtime.datasets import utc_seconds as _s
    cadence = _s(times[1]) - _s(times[0])
    manifest = {"datasetId": "syn-wind", "version": "1", "evidenceKind": "SYNTHETIC_TEST", "variableKind": "wind10m", "heightMeters": 10,
                "sourceURI": "test", "provider": "test", "citation": "test", "license": "test", "issuedAtUTC": T0, "collectedAtUTC": T0,
                "validTimeStartUTC": times[0], "validTimeEndUTC": times[-1], "sha256": digest(grid), "hashScope": "canonical-grid-json",
                "gridType": "gaussian-latlon-a-grid", "crs": "EPSG:4326", "calendar": "standard", "velocityUnits": "m/s", "uDirection": "eastward",
                "vDirection": "northward", "timeStepSeconds": cadence, "timeMeaning": "test", "readerVersion": WIND_READER_VERSION, "redistributionAllowed": True}
    return {"manifest": manifest, "grid": grid}


def spec(alpha=0.0007, duration=3600, step=300, points=((0.0, 0.0),), wind_manifest=None, **extra):
    wind_manifest = wind_manifest or {"datasetId": "syn-wind", "version": "1"}
    base = {"schemaVersion": "1.0", "projectId": "p", "question": "q", "questionId": "Q-test", "validationPlanId": "plan-test",
            "modelId": v2.MODEL_ID, "modelVersion": v2.MODEL_VERSION, "datasetVersions": [{"datasetId": "syn-current", "version": "1"}],
            "windDataset": {"datasetId": wind_manifest["datasetId"], "version": wind_manifest["version"]}, "windage": {"alpha": alpha},
            "area": {"west": -5, "east": 5, "south": -5, "north": 5}, "startTimeUTC": T0, "durationSeconds": duration,
            "releaseDefinition": {"type": "points", "points": [{"lon": lo, "lat": la} for lo, la in points]}, "particleCount": len(points),
            "integrationMethod": "RK4", "integrationStepSeconds": step, "outputStepSeconds": min(3600, duration),
            "boundaryPolicy": "STOP_AT_FIRST_CROSSING", "metrics": ["statusCounts"], "backend": "oceanparcels"}
    base.update(extra)
    return base


def final(result, pid=0):
    sample = result["trajectories"][pid]["samples"][-1]
    return sample["lon"], sample["lat"]


class WindageModelTests(unittest.TestCase):
    def test_01_identity(self):
        self.assertEqual(v2.MODEL_ID, "surface-passive-advection.v2.windage")
        self.assertEqual(v2.MODEL_VERSION, "0.1.0")
        self.assertEqual(v1.MODEL_ID, "surface-passive-advection.v1")
        described = v2.describe()
        self.assertEqual(described["modelId"], v2.MODEL_ID)
        self.assertIn("windage: alpha * U10 at every RK4 stage", described["includedPhysics"])
        self.assertNotIn("windage", described["excludedPhysics"])

    def test_02_alpha_zero_reproduces_v1_hash_on_real_hycom(self):
        dataset = json.loads((EXAMPLES / "hycom-2015-atlantic.dataset.json").read_text(encoding="utf-8"))
        wnd = json.loads((EXAMPLES / "ncep-doe-r2-10m-wind-natl-20150105.wind.json").read_text(encoding="utf-8"))
        expected = json.loads((EXAMPLES / "hycom-2015-atlantic.result.json").read_text(encoding="utf-8"))
        s = json.loads((EXAMPLES / "hycom-2015-atlantic.experiment.json").read_text(encoding="utf-8"))
        s.update({"modelId": v2.MODEL_ID, "modelVersion": v2.MODEL_VERSION, "questionId": "Q-reg", "validationPlanId": "reg",
                  "windDataset": {"datasetId": wnd["manifest"]["datasetId"], "version": wnd["manifest"]["version"]}, "windage": {"alpha": 0.0}})
        result = v2.run_experiment(s, dataset, wnd, run_id="reg")
        self.assertEqual(result["provenance"]["resultArraySha256"], expected["provenance"]["resultArraySha256"])
        worst = max(distance_m(final(result, i), final(expected, i)) for i in range(len(expected["trajectories"])))
        self.assertLessEqual(worst, 1.0)

    def test_03_alpha_applies_windage_at_all_stages(self):
        # zero current, uniform 10 m/s eastward wind: drift = alpha * U10 * t
        result = v2.run_experiment(spec(alpha=0.0007), current(), wind(), run_id="t3")
        moved = distance_m((0.0, 0.0), final(result))
        self.assertAlmostEqual(moved, 0.0007 * 10 * 3600, delta=0.0007 * 10 * 3600 * 0.01)
        # a time-varying wind must be sampled at the RK4 mid-stages, not only at the step start:
        ramp = wind(); ramp["grid"]["u"] = [[[0.0] * 4 for _ in range(4)], [[10.0] * 4 for _ in range(4)], [[20.0] * 4 for _ in range(4)]]
        ramp["manifest"]["sha256"] = digest(ramp["grid"])
        result = v2.run_experiment(spec(alpha=0.01, duration=21600, step=21600, points=((0.0, 0.0),)), current(), ramp, run_id="t3b")
        # exact integral of linear ramp 0→10 m/s over 6 h = 5 m/s mean; a start-only sample would give 0.
        self.assertAlmostEqual(distance_m((0.0, 0.0), final(result)), 0.01 * 5.0 * 21600, delta=0.01 * 5.0 * 21600 * 0.02)

    def test_04_missing_wind_is_never_zero(self):
        # last frame (T2) missing around the origin: the stencil becomes invalid once t passes T1 (strict, zero-weight edges included)
        holed = wind(holes=[(2, 1, 1), (2, 1, 2), (2, 2, 1), (2, 2, 2)])
        result = v2.run_experiment(spec(alpha=0.0007, duration=43200, step=3600), current(), holed, run_id="t4")
        self.assertEqual(result["trajectories"][0]["finalStatus"], "MISSING_FORCING")
        self.assertEqual(result["qualityStatus"], "PARTIAL")
        # a zero-filled implementation would have completed and moved ~0.0007*10*21600 m
        self.assertLess(distance_m((0.0, 0.0), final(result)), 0.0007 * 10 * 43200)

    def test_05_wind_dataset_hash_recorded_and_tamper_rejected(self):
        w = wind()
        result = v2.run_experiment(spec(), current(), w, run_id="t5")
        self.assertEqual(result["provenance"]["windDatasetSha256"], w["manifest"]["sha256"])
        self.assertEqual(result["provenance"]["windReaderVersion"], WIND_READER_VERSION)
        for key in ("questionId", "validationPlanId", "modelCommit", "windDatasetId", "windDatasetVersion", "windSourceSha256",
                    "windTimeInterpolation", "windSpaceInterpolation", "integrationMethod", "runId", "resultArraySha256", "environment"):
            self.assertIn(key, result["provenance"])
        for key in ("alpha", "unit", "source", "sourceReference", "selectionBasis"):
            self.assertIn(key, result["provenance"]["windage"])
        tampered = copy.deepcopy(w)
        tampered["grid"]["u"][0][0][0] = 11.0
        with self.assertRaises(ValueError):
            validate_wind_dataset(tampered)

    def test_06_invalid_alpha_rejected(self):
        for alpha in (-0.1, 0.051, float("nan"), "0.0007", True, None):
            with self.assertRaises(ValueError, msg=str(alpha)):
                v2._spec_values(spec(alpha=alpha), current(), wind())
        missing = spec(); del missing["windage"]
        with self.assertRaises(ValueError):
            v2._spec_values(missing, current(), wind())
        no_alpha = spec(); no_alpha["windage"] = {}
        with self.assertRaises(ValueError):
            v2._spec_values(no_alpha, current(), wind())

    def test_07_replay_deterministic(self):
        s, c, w = spec(), current(), wind()
        result = v2.run_experiment(s, c, w, run_id="t7")
        with tempfile.TemporaryDirectory() as folder:
            bundle = export_bundle(s, c, w, result, Path(folder) / "v2.zip")
            outcome = replay_bundle(bundle)
        self.assertTrue(outcome["matched"])
        self.assertEqual(outcome["resultArraySha256"], result["provenance"]["resultArraySha256"])
        self.assertEqual(outcome["windageAlpha"], 0.0007)

    def test_08_v1_immutable(self):
        for name, expected in V1_FILE_SHA256.items():
            self.assertEqual(hashlib.sha256((HERE / "research_runtime" / name).read_bytes()).hexdigest(), expected, name)
        self.assertEqual(v1.model_source_sha256(), V1_MODEL_SOURCE_SHA256)
        record = json.loads(IMMUTABLE_V1.read_text(encoding="utf-8"))
        self.assertEqual(record["verdict"], "FAIL")
        base = IMMUTABLE_V1.parent
        fixtures = ROOT / "docs/research/fixtures/gdp-hycom-cohort-201501"
        for name, expected in record["sha256"].items():
            path = base / name if (base / name).exists() else fixtures / name
            self.assertTrue(path.exists(), name)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), expected, name)

    def test_09_wind_spatial_boundary(self):
        from research_runtime.datasets import utc_seconds
        field = WindField(wind())
        with self.assertRaises(ForcingBoundary) as caught:
            field.velocity(utc_seconds(T0), 7.0, 0.0)
        self.assertEqual(caught.exception.status, "MISSING_FORCING")
        self.assertEqual(caught.exception.reason, "WIND_OUT_OF_DOMAIN")
        # a run whose wind box is smaller than the experiment area is blocked before any computation
        narrow = wind(lon=(-2.0, -0.5, 0.5, 2.0))
        check = v2.preflight(spec(wind_manifest=narrow["manifest"]), current(), narrow)
        self.assertFalse(check["ok"])
        self.assertTrue(any("WIND_COVERAGE" in e for e in check["errors"]))
        self.assertFalse(check["windCoverage"]["experimentAreaInsideWindBox"])

    def test_10_wind_temporal_boundary(self):
        field = WindField(wind())
        from research_runtime.datasets import utc_seconds
        with self.assertRaises(ForcingBoundary) as caught:
            field.velocity(utc_seconds(T2) + 1, 0.0, 0.0)
        self.assertEqual(caught.exception.reason, "WIND_TIME_OUTSIDE")
        short = wind(times=(T0, T1))
        check = v2.preflight(spec(duration=43200, wind_manifest=short["manifest"]), current(), short)
        self.assertFalse(check["ok"])
        self.assertTrue(any(p["kind"] == "WIND_TIME_OUTSIDE" for p in check["windCoverage"]["problems"]))

    def test_11_registry_separation(self):
        self.assertIs(registry.resolve({"modelId": v1.MODEL_ID, "modelVersion": v1.MODEL_VERSION})["module"], v1)
        self.assertIs(registry.resolve({"modelId": v2.MODEL_ID, "modelVersion": v2.MODEL_VERSION})["module"], v2)
        self.assertNotEqual(v1.model_source_sha256(), v2.model_source_sha256())
        self.assertEqual(set(v1.model_source_snapshot()), {"__init__.py", "datasets.py", "models.py", "cli.py"})
        self.assertTrue({"wind.py", "models_v2.py", "registry.py"} <= set(v2.model_source_snapshot()))

    def test_12_model_mismatch_rejected(self):
        with self.assertRaises(ValueError):
            registry.resolve({"modelId": "surface-passive-advection.v3", "modelVersion": "0.1.0"})
        with self.assertRaises(ValueError):
            registry.resolve({"modelId": v2.MODEL_ID, "modelVersion": "0.2.0"})
        with self.assertRaises(ValueError):
            v2._spec_values(spec(modelId=v1.MODEL_ID), current(), wind())
        with self.assertRaises(ValueError):
            v2._spec_values(spec(windDataset={"datasetId": "other", "version": "1"}), current(), wind())

    def test_13_validation_plan_id_required(self):
        s = spec(); del s["validationPlanId"]
        with self.assertRaises(ValueError):
            v2._spec_values(s, current(), wind())
        with self.assertRaises(ValueError):
            v2._spec_values(spec(validationPlanId=" "), current(), wind())

    def test_14_question_id_required(self):
        s = spec(); del s["questionId"]
        with self.assertRaises(ValueError):
            v2._spec_values(s, current(), wind())
        schema = json.loads((HERE / "contracts/experiment-v2.schema.json").read_text(encoding="utf-8"))
        for key in ("questionId", "validationPlanId", "windDataset", "windage", "modelId", "modelVersion"):
            self.assertIn(key, schema["required"])
        self.assertNotIn("default", schema["properties"]["windage"]["properties"]["alpha"])


if __name__ == "__main__":
    unittest.main()
