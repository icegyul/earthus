"""STEP 10 pipeline modules: paired classification, mechanical verdict, evidence manifest, plan parsing."""
import json
from pathlib import Path
import tempfile
import unittest

from research_runtime import comparison_v2, evidence_v2, validation_v2

ROOT = Path(__file__).resolve().parents[3]
PLAN = ROOT / "docs/research/fixtures/gdp-hycom-cohort-201501/validation-plan-v2.json"


def report(errors, obs_sha="o" * 64, model_sha="m" * 64):
    rows, tracks = [], []
    for pid, (v, s, p) in enumerate(errors):
        tracks.append({"particleId": pid, "trackId": f"GDP-{pid}"})
        for horizon in (86400, 172800, 259200):
            rows.append({"particleId": pid, "horizonSeconds": horizon, "separationMeters": v, "stationarySeparationMeters": s, "initialVelocitySeparationMeters": p})
    return {"comparisons": rows, "trackEligibility": tracks, "observationTracksSha256": obs_sha, "modelResultArraySha256": model_sha,
            "totalTracks": len(errors), "eligibleTracks": len(errors), "excludedTracks": []}


class PairedComparisonTests(unittest.TestCase):
    def test_strict_classification_and_no_tie_improvement(self):
        v1 = report([(1000, 900, 1100), (1000, 900, 1100), (1000, 900, 1100)])
        v2 = report([(900, 900, 1100), (1000, 900, 1100), (1100, 900, 1100)])
        rows = comparison_v2.paired_v1_v2(v1, v2, "a")
        r72 = {r["particleId"]: r["classification"] for r in rows if r["horizonHours"] == 72}
        self.assertEqual(r72, {0: "IMPROVED", 1: "UNCHANGED", 2: "WORSE"})
        summary = comparison_v2.paired_summary(rows)["72"]
        self.assertEqual((summary["improved"], summary["worse"], summary["unchanged"]), (1, 1, 1))
        self.assertEqual(len([r for r in rows if r["horizonHours"] == 24]), 3)

    def test_different_observations_rejected(self):
        with self.assertRaises(ValueError):
            comparison_v2.paired_v1_v2(report([(1, 1, 1)], obs_sha="a" * 64), report([(1, 1, 1)], obs_sha="b" * 64), "a")

    def test_baseline_summary_and_bootstrap_seeded(self):
        rows = comparison_v2.paired_v1_v2(report([(1000, 900, 1100)] * 5), report([(800, 900, 1100)] * 5), "a")
        base = comparison_v2.baseline_summary(rows)["72"]
        self.assertEqual(base["modelVs_stationary"]["improved"], 5)
        self.assertEqual(base["model"]["medianKm"], 0.8)
        a, b = comparison_v2.bootstrap(rows, 7, iterations=50), comparison_v2.bootstrap(rows, 7, iterations=50)
        self.assertEqual(a["intervals"], b["intervals"])
        self.assertEqual(a["seed"], 7)
        self.assertIn("SUPPLEMENTARY", a["role"])


class VerdictTests(unittest.TestCase):
    def setUp(self):
        self.plan = json.loads(PLAN.read_text(encoding="utf-8"))
        self.evidence = set(validation_v2.REQUIRED_EVIDENCE) | {"verdict.json"}

    def rows(self, v2, v1=24000, stationary=19000, persistence=32000, n=21):
        return comparison_v2.paired_v1_v2(report([(v1, stationary, persistence)] * n), report([(v2, stationary, persistence)] * n), "a")

    def test_plan_threshold_is_parsed_not_hardcoded(self):
        self.assertEqual(validation_v2.c5_threshold(self.plan), (14, 21))
        self.assertEqual(validation_v2.c3_thresholds(self.plan), (20, 2))

    def test_pass_only_when_all_five_hold(self):
        good = validation_v2.verdict(self.plan, self.rows(v2=18000), 0.0007, 2, self.evidence, {"matched": True}, True)
        self.assertEqual(good["verdict"], "PASS")
        self.assertEqual(good["failedCriteria"], [])

    def test_c1_fail_gives_not_accepted_even_if_v2_improves_v1(self):
        out = validation_v2.verdict(self.plan, self.rows(v2=20000), 0.0007, 2, self.evidence, {"matched": True}, True)
        self.assertEqual(out["verdict"], "NOT_ACCEPTED")
        self.assertEqual(out["failedCriteria"], ["C1_beatsStationary"])
        self.assertEqual(out["v2ImprovesV1"], "V2_IMPROVES_V1")
        self.assertEqual(out["v2Accepted"], "V2_NOT_ACCEPTED")

    def test_replay_mismatch_or_missing_evidence_blocks_pass(self):
        out = validation_v2.verdict(self.plan, self.rows(v2=18000), 0.0007, 2, self.evidence, {"matched": False}, True)
        self.assertIn("C4_reporting", out["failedCriteria"])
        out = validation_v2.verdict(self.plan, self.rows(v2=18000), 0.0007, 2, self.evidence - {"replay.json"}, {"matched": True}, True)
        self.assertIn("C4_reporting", out["failedCriteria"])

    def test_sensitivity_alpha_cannot_produce_a_verdict(self):
        with self.assertRaises(ValueError):
            validation_v2.verdict(self.plan, self.rows(v2=18000), 0.03, 2, self.evidence, {"matched": True}, True)

    def test_c5_needs_fourteen_strict_improvements(self):
        rows = comparison_v2.paired_v1_v2(report([(24000, 19000, 32000)] * 21), report([(18000, 19000, 32000)] * 13 + [(24000, 19000, 32000)] * 8), "a")
        out = validation_v2.verdict(self.plan, rows, 0.0007, 2, self.evidence, {"matched": True}, True)
        self.assertFalse(out["criteria"]["C5_improvesOnV1"]["pass"])
        self.assertEqual(out["criteria"]["C5_improvesOnV1"]["improved"], 13)


class EvidenceTests(unittest.TestCase):
    def test_manifest_hashes_every_file(self):
        with tempfile.TemporaryDirectory() as folder:
            package = evidence_v2.EvidencePackage(Path(folder) / "pkg")
            package.put("a.json", {"x": 1})
            package.put("b.json", {"y": [1, 2]})
            manifest = package.manifest(["a.json", "b.json"], {"ext": "f" * 64})
            for name, expected in manifest["files"].items():
                self.assertEqual(evidence_v2.sha256_file(Path(folder) / "pkg" / name), expected)
            self.assertEqual(set(manifest["files"]), {"a.json", "b.json"})
            self.assertTrue((Path(folder) / "pkg/manifest.json").exists())


if __name__ == "__main__":
    unittest.main()
