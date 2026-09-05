import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from research_runtime.datasets import digest
from research_runtime.validation import compare, main, _persistent_position


SOURCE = b"explicit synthetic analytic observation test fixture\n"


def fixture():
    samples = [
        {"timeUTC": "2015-01-01T00:00:00Z", "lon": 0.0, "lat": 0.0, "status": "ACTIVE"},
        {"timeUTC": "2015-01-02T00:00:00Z", "lon": 0.5, "lat": 0.0, "status": "COMPLETED"},
    ]
    trajectories = [{"particleId": 0, "samples": samples}]
    result = {"qualityStatus": "COMPLETE", "trajectories": trajectories,
              "provenance": {"resultArraySha256": digest(trajectories), "surfaceDepthMeters": 15,
                             "evidenceKind": "SYNTHETIC_TEST", "datasetSha256": "a" * 64}}
    observations = [{"particleId": 0, "trackId": "synthetic-0", "qualityControl": "PASSED", "drogueStatus": "ATTACHED",
                     "depthMeters": 15, "independenceStatus": "INDEPENDENT", "independenceEvidence": "Constructed analytic test only",
                     "samples": [{**point, "uMps": 0.643496, "vMps": 0.0} for point in samples]}]
    manifest = {"datasetId": "analytic-test", "version": "1", "sourceURI": "urn:earthus:synthetic-test",
                "provider": "EARTHUS numerical tests", "citation": "Synthetic fixture; no field validation", "license": "test fixture",
                "sourceFile": "source.txt", "sourceSha256": hashlib.sha256(SOURCE).hexdigest(),
                "qualityControl": "SYNTHETIC_TEST", "qualityControlURI": "urn:earthus:analytic-definition",
                "evidenceKind": "SYNTHETIC_TEST", "hashScope": "canonical-observation-tracks-json", "sha256": digest(observations)}
    return result, {"manifest": manifest, "tracks": observations}


def rehash(observations):
    observations["manifest"]["sha256"] = digest(observations["tracks"])


class ObservationValidationTests(unittest.TestCase):
    def test_analytic_baselines_do_not_claim_real_validation(self):
        result, obs = fixture()
        report = compare(result, obs, SOURCE, horizons=(86400,))
        self.assertEqual(report["status"], "NUMERICAL_TEST_ONLY")
        self.assertFalse(report["observationValidationPassed"])
        self.assertEqual(report["summary"][0]["sampleCount"], 1)
        row = report["comparisons"][0]
        self.assertEqual(row["separationMeters"], 0)
        self.assertAlmostEqual(row["stationarySeparationMeters"], 55597.5401, places=2)
        self.assertLess(row["initialVelocitySeparationMeters"], 1)

    def test_drogue_loss_depth_and_independence_exclude(self):
        result, obs = fixture()
        obs["tracks"][0].update(drogueStatus="LOST", depthMeters=0, independenceStatus="UNKNOWN")
        rehash(obs)
        report = compare(result, obs, SOURCE)
        self.assertEqual(report["status"], "NOT_VALIDATED")
        self.assertEqual(report["eligibleTracks"], 0)
        self.assertEqual(set(report["exclusionReasonCounts"]), {"DROGUE_LOST", "DEPTH_MISMATCH", "INDEPENDENCE_NOT_ESTABLISHED"})
        self.assertIsNone(report["summary"][0]["meanSeparationMeters"])

    def test_missing_metadata_fails_closed(self):
        result, obs = fixture()
        del obs["tracks"][0]["drogueStatus"]
        del result["provenance"]["surfaceDepthMeters"]
        rehash(obs)
        report = compare(result, obs, SOURCE)
        self.assertIn("DROGUE_UNKNOWN", report["exclusionReasonCounts"])
        self.assertIn("DEPTH_UNKNOWN", report["exclusionReasonCounts"])

    def test_exact_time_no_nearest_match(self):
        result, obs = fixture()
        obs["tracks"][0]["samples"][1]["timeUTC"] = "2015-01-02T00:00:01Z"
        rehash(obs)
        report = compare(result, obs, SOURCE, horizons=(86400,))
        self.assertEqual(report["status"], "NOT_VALIDATED")
        self.assertEqual(report["unavailableHorizons"][0]["reason"], "NO_EXACT_OBSERVATION_TIME_MATCH")

    def test_hashes_are_checked(self):
        result, obs = fixture()
        with self.assertRaisesRegex(ValueError, "source SHA-256"):
            compare(result, obs, SOURCE + b"tampered")
        obs["tracks"][0]["samples"][1]["lon"] = 2.0
        with self.assertRaisesRegex(ValueError, "tracks SHA-256"):
            compare(result, obs, SOURCE)
        result, obs = fixture()
        result["trajectories"][0]["samples"][1]["lon"] = 2.0
        with self.assertRaisesRegex(ValueError, "result array SHA-256"):
            compare(result, obs, SOURCE)

    def test_duplicates_and_time_order_rejected(self):
        result, obs = fixture()
        obs["tracks"].append(copy.deepcopy(obs["tracks"][0]))
        rehash(obs)
        with self.assertRaisesRegex(ValueError, "duplicate observation"):
            compare(result, obs, SOURCE)
        result, obs = fixture()
        obs["tracks"][0]["samples"].reverse()
        rehash(obs)
        with self.assertRaisesRegex(ValueError, "strictly increasing"):
            compare(result, obs, SOURCE)

    def test_dateline_persistence(self):
        lon, lat = _persistent_position(179.9, 0, 1, 0, 86400)
        self.assertTrue(-180 < lon < -179)
        self.assertAlmostEqual(lat, 0)

    def test_loss_during_window_and_bad_start(self):
        result, obs = fixture()
        obs["tracks"][0]["drogueLostAtUTC"] = "2015-01-01T12:00:00Z"
        rehash(obs)
        self.assertEqual(compare(result, obs, SOURCE)["excludedTracks"][0]["reasons"], ["DROGUE_LOSS_DURING_WINDOW"])
        result, obs = fixture()
        obs["tracks"][0]["samples"][0]["lon"] = 0.1
        rehash(obs)
        self.assertEqual(compare(result, obs, SOURCE)["excludedTracks"][0]["reasons"], ["START_POSITION_MISMATCH_OVER_1M"])

    def test_cli_source_package_and_no_overwrite(self):
        result, obs = fixture()
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            (base / "source.txt").write_bytes(SOURCE)
            (base / "result.json").write_text(json.dumps(result))
            (base / "observations.json").write_text(json.dumps(obs))
            args = ["--result", str(base / "result.json"), "--observations", str(base / "observations.json"), "--output", str(base / "report.json")]
            self.assertEqual(main(args), 0)
            with self.assertRaises(FileExistsError):
                main(args)
            obs["manifest"]["sourceFile"] = "../outside.txt"
            (base / "observations.json").write_text(json.dumps(obs))
            with self.assertRaisesRegex(ValueError, "relative file"):
                main(args)


if __name__ == "__main__":
    unittest.main()
