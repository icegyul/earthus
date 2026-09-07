"""Independent fail-closed validator for STEP 42 (final scientific results report / interpretation lock). exit 0 = PASS.
Verifies: required frozen commit ancestry (STEP 36 043a09b8, STEP 37 74d19f0a, STEP 38 23e78f86, STEP 40 2b1a7baa, STEP 41 9a322308,
runtime 155995dd) · identity (SHA-256) of every STEP 36 / 37 / 38 / 39 / 40 / 41 source record and of the STEP 41-locked STEP 39 files ·
the report states the exact primary Theta, Delta_w values, bootstrap interval, B / seed, H1 = SUPPORTED, CANDIDATE_ONLY, operational
promotion NO, the secondary and additional frozen values, the missingness table, the required limitations and the nine conclusion points ·
no new statistical calculation: every km value printed in the report is a frozen value (or a 1 / 3 / 4 / 6 dp rounding of one) read
from the frozen STEP 39 / STEP 40 records, and no p-value / test / new-interval wording is present · forbidden claim language absent ·
frozen records unmodified in the working tree relative to HEAD. Deterministic output (no timestamps)."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
REPORT = D / "step42-final-scientific-results-report.md"
NA = "NOT_AVAILABLE"
ANCESTORS = {"step36": "043a09b8539955868651a06e7c2c44e3c606803f", "step37": "74d19f0a9661a41d63a08c56bbd3f91e9d8b312d", "step38": "23e78f863fb092aa9e3c36e4d74d4afd4393e7f4", "step40": "2b1a7baa7ef9e69d25cecbff2b09fca8700fca80", "step41": "9a3223089099bcb09a2589cc8a4bda82fcb47ae5", "runtime": "155995dd"}
IDENTITY = {
    "docs/research/step36-cohort-extension-manifest.json": "bda31c3ca36a395acadc95c1cb18663964ee9a00e4a72a7c2504182f51df06ca",
    "docs/research/step37-experiment-preregistration-protocol.json": "eae40cde609155a32ccbe0c01a6090715e2324d72cc080e2e7043ecbd90f2d0d",
    "docs/research/step37-experiment-preregistration-status.json": "61de721a97b57b04692f7b357cb8ef3a62088ef3cecdfbf010af4c760434a767",
    "docs/research/step37-experiment-preregistration-report.md": "dfac0db50e37ba63b70cad12d820a4552601002c1b0edd30b0dd1544d726d204",
    "docs/research/step38-source-acquisition-protocol.json": "a4dfbcbea6562e02b032e0557397a61870e31b53e980931c396f44905b9b88cd",
    "docs/research/step38-source-acquisition-manifest.json": "c9d3109fbab2970b43b887cc7ba81d3aacbdd094375b091e8e185097a22dc2a0",
    "docs/research/step38-data-freeze-manifest.json": "5e979cff746a1ee72c877a8b1bdb8c1bc1e310605ab9fc7cc6337d9ea902da77",
    "docs/research/step38-source-acquisition-report.md": "b400e82533cfe33ef2e2df4453b3e77e6811bb10fb6ab6474ecb1d02ef56fcb8",
    "docs/research/step39-execution-protocol.json": "5bd1eb236d2d423f2af24440cceea798e150fd20ee2a4acb754b78522b6aba23",
    "docs/research/step39-daily-derivation-manifest.json": "76948fb690f53ac894ac980530e1f67b76ea4ac34104422b0d232a31f3dfbcf5",
    "docs/research/step39-candidate-forcing-manifest.json": "63129afa4712d18d04a8a9327d92c923881394684c29fc23569ddc75fdf4ecf2",
    "docs/research/step39-temporal-run-manifest.json": "b267f5869a0160227545b4a4f294de10bdcac1a7dd11841ac28813b73f779634",
    "docs/research/step39-candidate-run-manifest.json": "534cd7426f6f2af653303b9e4ae019d489d9e416524b54859ba7d227da86eba5",
    "docs/research/step39-paired-table.csv": "30fbc404142e9b20bb83879a67821614937a146810078088cb623bbb04623035",
    "docs/research/step39-evaluation.json": "5ed91fc3ed18184e222c180ef712fca12775563749a3b8b47cf698165aaf76ac",
    "docs/research/step39-summary.json": "7d90ba995733071f9536df598332bffdc2bd75d4206e7ef23a2c1f9bde67ea83",
    "docs/research/step40-bootstrap-protocol.json": "60dbf72cd91d91cc4cc2c72d96c4aec41ffd39ce8368db2d4081070f77786fb4",
    "docs/research/step40-bootstrap-result.json": "e7fe94c8f527846721f856418f1c4686a75132e21a72b122006d3d7bdbe6482f",
    "docs/research/step40-bootstrap-replicates.csv": "a2ca2a3266411da186f78140a41f1bee0bf831d4fbe99b5d4acb3849f4378572",
    "docs/research/step41-lock-record.json": "672b7def2f157fe976c98e5b501f5504f4cdba89707d6a95486c7e42ffd855df",
    "tools/research/check_step41_lock.py": "b46e02a1205ab97cc13e462ea31624b1482b46e93cbee714e4318e3300a9dc58",
}
FROZEN_DELTA = {"GS-Y1": -17.872, "GS-Y2": -5.615, "GS-Y3": -21.379, "GS-Y4": -41.283, "GS-Y5": NA, "GS-Y6": -65.774, "GS-Y7": NA, "GS-Y8": NA, "GS-Y9": -78.371}
REQUIRED_TEXT = [
    "FINAL SCIENTIFIC RESULTS REPORT", "STEP 36-41 PREREGISTERED OCEAN DRIFTER EXPERIMENT",
    "-31.331 km", "[-72.0725, -11.7435] km", "-11.7435 km", "CANDIDATE_DESCRIPTIVELY_FAVORED", "H1 = SUPPORTED",
    "CANDIDATE_ONLY", "FROZEN_REFERENCE_BASELINE", "| Operational promotion | NO |", "| Model selection | NONE |", "| Parameter tuning | NONE |",
    "No parameter tuning was performed", "9 (GS-Y1", "Unique drifters | 20", "18 / 20", "16 / 20", "6 / 9", "Gulf Stream",
    "alpha | 0.002", "Stokes coefficient | 1.0", "15.000 m", "15.810070 m", "RK4, time step 300 s", "900 s", "24 / 48 / 72 h",
    "delta_i = E_C,i(72 h) - E_A,i(72 h)", "R = 6 371 008.8 m", "Delta_w = median_i", "Theta   = median_w", "Equal window weighting", "NA values were not imputed",
    "6 valid windows, 6 negative, 0 positive, 0 tied",
    "| B (replicates) | 10 000 |", "| Seed | 20260907 |", "numpy.random.default_rng(20260907)", "| Sampling unit | window |", "all 9 registered windows",
    "no independent drifter resampling", "no\ntrajectory-point resampling", "no imputation", "never redrawn", "| Available replicates | 9 999 |", "| NOT_AVAILABLE replicates | 1 |",
    "| Quantile method | linear |", "| Q0.025 | -72.0725 km |", "| Q0.975 | -11.7435 km |",
    "| 24 h | -8.105 | 8 / 9 | -9.229 | 19 |", "| 48 h | -30.150 | 6 / 9 | -23.862 | 17 |", "| 72 h | -31.331 | 6 / 9 | -23.981 | 16 |",
    "| 24 h | +1.171 | 9 / 9 |", "| 48 h | +3.308 | 9 / 9 |", "| 72 h | +9.440 | 7 / 9 |", "NO_CLEAR_TEMPORAL_DIFFERENCE",
    "80.846 km (n = 18)", "74.971 km (n = 18)", "66.386 km (n = 16)", "125.6 km", "129.4 km", "93.1 km", "158.6 km", "157.9 km", "104.8 km", "49.8 km", "16.5 km", "109.4 km",
    "| n | 16 |", "| Pooled median observed | -23.981 km |", "| 95 % interval | [-36.316, -6.626] km |", "sensitivity analysis only", "ignores the clustering",
    "GS-Y7 / drifter 92869", "OUT_OF_DOMAIN", "GS-Y8 / drifter 88532", "FORCING_UNAVAILABLE", "GS-Y5 / drifter 98936", "GS-Y2 / drifter 92872",
    "not characterised as failures", "not characterised as successes",
    "Two candidate-only terminations", "cropped", "No substitution occurred", "No imputation occurred", "No post-hoc correction",
    "## 14. Limitations", "Small number of registered windows", "Candidate 72 h availability", "Small cluster count", "not evidence of asymptotic normality or nominal coverage",
    "Candidate-only forcing availability limitations occurred", "does not establish universal superiority", "does not establish operational superiority",
    "This supports H1 for the preregistered experiment, but the result should not be interpreted as", "universal or operational model superiority",
    "does not authorise deployment, replacement, or operational promotion",
    "1. The preregistered primary criterion was satisfied.", "2. H1 is SUPPORTED.", "3. The observed primary effect was -31.331 km.",
    "4. The 95 % window-bootstrap interval was [-72.0725, -11.7435] km.", "5. The interval remained entirely below zero.",
    "6. This result applies to the frozen experiment and cohort.", "7. Candidate C remains CANDIDATE_ONLY.", "8. No operational promotion was authorised.",
    "9. Further validation on independent data is required before any operational claim.",
    "155995dd", "306a597613f625e09d0788405b7b7e3b3a944627d4217b8da77e66a74859dee3", "BYTE_IDENTICAL = YES", "remain outside Git",
]
FORBIDDEN_TEXT = ["proven", "universally superior", "final operational model", "best possible model", "ground truth", "optimal", "winner", "validated model",
                  "p-value", "p value", "p =", "p<", "p <", "t-test", "wilcoxon", "mann-whitney", "significant", "significance", "causal effect", "caused by",
                  "generalises to all", "generalizes to all", "post-hoc confidence", "new confidence interval", "additional confidence interval"]
FORBIDDEN_RE = [re.compile(r"(?<![a-z])" + re.escape(s) + r"(?![a-z])") for s in FORBIDDEN_TEXT]   # whole-word / whole-phrase (e.g. 'proven' must not match 'provenance')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def numeric_leaves(obj, out):
    if isinstance(obj, bool):
        return
    if isinstance(obj, (int, float)):
        out.append(float(obj))
    elif isinstance(obj, dict):
        for v in obj.values():
            numeric_leaves(v, out)
    elif isinstance(obj, list):
        for v in obj:
            numeric_leaves(v, out)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    # ---- ancestry ----
    for name, c in ANCESTORS.items():
        check(git("cat-file", "-t", c).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", c, "HEAD").returncode == 0, f"ancestry: {name} {c}")
    # ---- identity of every source record + not modified relative to HEAD ----
    for rel, h in IDENTITY.items():
        check((ROOT / rel).is_file() and sha(ROOT / rel) == h, f"identity: {rel}")
        check(git("diff", "--quiet", "HEAD", "--", rel).returncode == 0, f"unmodified relative to HEAD: {rel}")
    L41 = load(D / "step41-lock-record.json")
    for f in L41["files"]:
        check(sha(ROOT / f["path"]) == f["sha256"], f"STEP 41-locked file identity: {f['path']}")
    # ---- frozen values from the records ----
    S = load(D / "step39-summary.json"); R = load(D / "step40-bootstrap-result.json"); pr = R["primary"]; sr = R["successRule"]; se = R["sensitivityOnly"]
    check(round(S["primary"]["Theta_km"], 3) == -31.331 == pr["ThetaObserved_km"], "frozen Theta")
    check(pr["Delta_w_km"] == FROZEN_DELTA, "frozen Delta_w")
    check(pr["Q0.025_km"] == -72.0725 and pr["Q0.975_km"] == -11.7435 and pr["B_requested"] == 10000 and pr["seed"] == 20260907 and pr["availableReplicates"] == 9999 and pr["notAvailableReplicates"] == 1, "frozen interval / B / seed / counts")
    check(sr["H1"] == "SUPPORTED" and sr["candidateStatus"] == "CANDIDATE_ONLY" and sr["operationalWinnerDeclared"] is False and sr["descriptiveLabel_step30aRule"] == "CANDIDATE_DESCRIPTIVELY_FAVORED", "frozen H1 / candidate status / no promotion")
    check(se["n"] == 16 and se["Q0.025_km"] == -36.316 and se["Q0.975_km"] == -6.626 and se["pooledMedianObserved_km"] == -23.981, "frozen sensitivity values")
    sec = S["secondary"]["nested"]; av = S["availability"]; m = S["metrics"]
    check(round(sec["delta_CA_24h"]["Theta"], 3) == -8.105 and round(sec["delta_CA_48h"]["Theta"], 3) == -30.150 and round(sec["delta_BA_24h"]["Theta"], 3) == 1.171 and round(sec["delta_BA_48h"]["Theta"], 3) == 3.308 and round(sec["delta_BA_72h"]["Theta"], 3) == 9.440, "frozen secondary Theta values")
    check(S["secondary"]["pooled"]["delta_CA_24h"]["pooledMedian"]["median"] == -9.229 and S["secondary"]["pooled"]["delta_CA_48h"]["pooledMedian"]["median"] == -23.862 and S["secondary"]["pooled"]["delta_CA_72h"]["pooledMedian"]["median"] == -23.981 and S["secondary"]["temporalLabel72h_step32Rule_pooledPairs"] == "NO_CLEAR_TEMPORAL_DIFFERENCE", "frozen pooled secondary values / temporal label")
    check(av["A_72h"] == 18 and av["C_72h"] == 16 and av["pair_CA_72h"] == 16 and S["primary"]["windowsWithValidPair"] == 6 and S["n_windows"] == 9 and S["n_drifters"] == 20, "frozen availability")
    check(m["A"]["M3_72h"]["median"] == 80.846 and m["B"]["M3_72h"]["median"] == 74.971 and m["C"]["M3_72h"]["median"] == 66.386 and round(m["A"]["M1_endpoint72h"]["median"], 1) == 125.6 and round(m["B"]["M1_endpoint72h"]["median"], 1) == 129.4 and round(m["C"]["M1_endpoint72h"]["median"], 1) == 93.1 and round(m["A"]["M2_totalPath"]["median"], 1) == 158.6 and round(m["B"]["M2_totalPath"]["median"], 1) == 157.9 and round(m["C"]["M2_totalPath"]["median"], 1) == 104.8 and round(m["M4_separation72h"]["C_vs_A"]["median"], 1) == 49.8 and round(m["M4_separation72h"]["B_vs_A"]["median"], 1) == 16.5 and round(m["M5_observed72h"]["median"], 1) == 109.4, "frozen additional metrics")
    # ---- report content ----
    raw = REPORT.read_text(encoding="utf-8")
    text = raw.replace("−", "-").replace("–", "-").replace("—", "-")
    for s in REQUIRED_TEXT:
        check(s in text, f"report text required: {s!r}")
    low = text.lower()
    for s, rx in zip(FORBIDDEN_TEXT, FORBIDDEN_RE):
        check(rx.search(low) is None, f"forbidden wording present: {s!r}")
    for w, v in FROZEN_DELTA.items():
        check((f"| {w} |" in text) and ((f"| {v:.3f} |" in text) if v != NA else (f"| {w} | 0 | NA |" in text)), f"Delta_w stated: {w}")
    # ---- no new statistical calculation: every km number in the report is a frozen value ----
    leaves = []
    numeric_leaves(S, leaves); numeric_leaves(R, leaves); numeric_leaves(load(D / "step39-evaluation.json")["perDrifter"], leaves)
    allowed = set()
    for x in leaves:
        for dp in (1, 3, 4, 6):
            allowed.add(round(x, dp))
    nums = re.findall(r"(?<![\w.])([+-]?\d+(?:\.\d+)?)(?=\s*km\b|,\s*[+-]?\d+(?:\.\d+)?\]\s*km)", text)
    bad = sorted({n for n in nums if float(n) not in allowed})
    check(not bad, f"km values not traceable to the frozen records (possible new calculation): {bad}")
    check(len(nums) >= 30, "report km values present (primary, interval, Delta_w, secondary, metrics, sensitivity)")
    check(text.count("STOP after") == 0 and "createdAt" not in text, "no execution metadata leaked")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "Theta_km": pr["ThetaObserved_km"], "CI95_km": [pr["Q0.025_km"], pr["Q0.975_km"]], "H1": sr["H1"], "candidate": sr["candidateStatus"], "operationalPromotion": False, "kmValuesChecked": len(nums)}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
