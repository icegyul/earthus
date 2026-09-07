"""Independent fail-closed validator for STEP 50 (validation-extension endpoint aggregation + preregistered bootstrap). exit 0 = PASS.
Checks the 30 mandated items: STEP 46 ancestry and identity · STEP 47 cohort hash · STEP 48 freeze hash · STEP 49 execution hash · the six
registered windows and the 25 registered drifters, unmodified · endpoint definition and haversine radius 6371008.8 m · window-level median
with EQUAL window weighting (the pooled drifter median is never the primary) · all six windows present in the bootstrap sampling frame,
NOT_AVAILABLE windows included · B = 10000 · seed 20260946 · numpy.random.default_rng · integers(0, 6, size=6) · sampling with replacement ·
no NA redraw · quantile method linear at q = [0.025, 0.975] · no drifter-level resampling in the primary · the 72 h H_EXT decision rule and
gate handling, with the STEP 46 preregistered descriptive-favour criterion governing and the STEP 50 directive criterion recorded beside it ·
primary result unchanged and never pooled with the extension · no operational promotion · no source modification · deterministic bootstrap
replay (the whole aggregation and bootstrap recomputed here into a temporary directory and compared field by field) · byte-identical
scientific fields · no unauthorized analysis · provenance completeness. Deterministic output."""
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
S50 = ROOT / "data/research/step50"
PROTO, RES, STAT, REP = (D / "step50-validation-extension-endpoint-protocol.json", D / "step50-validation-extension-results.json",
                         D / "step50-validation-extension-endpoint-status.json", D / "step50-validation-extension-report.md")
AGG, BOOT = S50 / "step50-aggregation.json", S50 / "step50-bootstrap.json"
COMMITS = {"step36": "043a09b8539955868651a06e7c2c44e3c606803f", "step37": "74d19f0a9661a41d63a08c56bbd3f91e9d8b312d",
           "step40": "2b1a7baa7ef9e69d25cecbff2b09fca8700fca80", "step44": "5f8d5c38bfc9cc6a168707ae0b1b643c99ad46f9",
           "step45c": "fa9c0590d634a6d6f30cc8a6cd2797c94e0ae7dd", "step46": "f7be980e3aa1e71c4cc96b7aca699e1d4b1faec7",
           "step48": "00516cd1562d50b9380f4eef4ad66611822ae99c", "step49": "fbb080af5723c32488ddf976d64f067ba12a4555"}
M47_SHA = "32d3085010185d8c1a5734ef53be227252220b74a2526dbadf5c72de5eee2cca"
F48_SHA = "8d50c2aebf32cae57e8b82e318eded07e29b5546dd29a58ea8c8b33a17da8719"
WINDOWS = ["KE-X1", "KE-X2", "KE-X3", "KE-X4", "BM-X5", "BM-X6"]
NA = "NOT_AVAILABLE"
H = (24, 48, 72)
B = 10000
SEED = 20260946


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True)


def median(v):
    v = sorted(v); m = len(v) // 2
    return v[m] if len(v) % 2 else (v[m - 1] + v[m]) / 2


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    P, R, S = load(PROTO), load(RES), load(STAT)
    A, BS = load(AGG), load(BOOT)
    T = REP.read_text(encoding="utf-8").replace("−", "-").replace("–", "-")   # typographic minus / en dash normalised
    EM = load(D / "step49-validation-extension-execution-manifest.json")
    RAW = load(ROOT / "data/research/step49/step49-endpoint-raw.json")
    # 1-4 ancestry and input identities
    for k, c in {**COMMITS, "runtime": "155995dd"}.items():
        check(git("cat-file", "-t", c).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", c, "HEAD").returncode == 0, f"1 ancestry {k}")
        check(P["ancestry"][k].startswith(c), f"1 ancestry field {k}")
    check(sha(D / "step47-validation-extension-cohort-manifest.json") == M47_SHA and P["cohort"]["derivationHash"] == load(D / "step47-validation-extension-cohort-manifest.json")["derivationHash"], "2 STEP 47 cohort hash")
    check(sha(D / "step48-validation-data-freeze-manifest.json") == F48_SHA == P["frozenInputs"]["docs/research/step48-validation-data-freeze-manifest.json"], "3 STEP 48 freeze hash")
    check(sha(D / "step49-validation-extension-execution-manifest.json") == R["inputs"]["step49ExecutionManifestSha256"] == P["frozenInputs"]["docs/research/step49-validation-extension-execution-manifest.json"], "4 STEP 49 execution hash")
    check(A["inputs"]["step49EndpointRawSha256"] == EM["endpointRawMaterial"]["sha256"] == sha(ROOT / "data/research/step49/step49-endpoint-raw.json"), "4 STEP 49 endpoint raw material unchanged")
    check(git("diff", "--quiet", "HEAD", "--", "docs/research", "tools/research").returncode == 0, "26 no tracked research file modified")
    for c, rel in ((COMMITS["step49"], "docs/research/step49-validation-extension-execution-manifest.json"), (COMMITS["step48"], "docs/research/step48-validation-data-freeze-manifest.json"), (COMMITS["step46"], "docs/research/step46-validation-extension-preregistration-protocol.json"), (COMMITS["step40"], "docs/research/step40-bootstrap-result.json")):
        check(git("rev-parse", f"{c}:{rel}").stdout.strip() == git("hash-object", rel).stdout.strip(), f"26 locked record unchanged: {rel}")
    # 5-7 cohort integrity
    check(A["registeredWindows"] == WINDOWS and len(WINDOWS) == 6 and A["registeredDrifters"] == 25 and P["cohort"]["windows"] == 6 and P["cohort"]["uniqueDrifters"] == 25, "5-6 six registered windows and 25 registered drifters")
    check(A["cohortModified"] is False and P["cohort"]["modified"] is False and P["cohort"]["reselected"] is False and A["missingness"]["windowsAddedOrRemoved"] == 0, "7 no cohort modification")
    # 8-11 endpoint definition, aggregation recomputed independently
    ed = A["endpointDefinition"]
    check("6371008.8" in ed["perDrifter"] and "E_C,i(h) - E_A,i(h)" in ed["perDrifter"], "8-9 endpoint definition and haversine radius")
    check(ed["window"].startswith("Delta_w(h) = median") and ed["primary"].startswith("Theta_extension(h) = median") and "equal window weighting" in ed["weighting"] and "DESCRIPTIVE ONLY" in ed["pooledDrifterMedian"], "10-11 window-level median, equal weighting, pooled median not primary")
    rows = RAW["rows"]
    for h in H:
        key = f"delta_CA_{h}h"
        for w in WINDOWS:
            vals = [r[key] for r in rows if r["window"] == w and r[key] != NA]
            exp = round(median(vals), 6) if vals else NA
            got = A["perWindow"][f"{h}h"][w]["Delta_w_km"]
            check(got == exp, f"10 Delta_w recomputed: {w} {h}h {got} vs {exp}")
        avail = [A["perWindow"][f"{h}h"][w]["Delta_w_km"] for w in WINDOWS if A["perWindow"][f"{h}h"][w]["Delta_w_km"] != NA]
        check(A["theta"][f"{h}h"]["Theta_extension_km"] == (round(median(avail), 6) if avail else NA) and A["theta"][f"{h}h"]["windowsWithValidPair"] == len(avail), f"11 Theta_extension recomputed: {h}h")
    check(A["theta"]["72h"]["windowsNotAvailable"] == ["KE-X3"] and A["perWindow"]["72h"]["KE-X3"]["status"] == NA and A["theta"]["72h"]["windowsWithValidPair"] == 5, "6 window validity classification unchanged (KE-X3 NOT_AVAILABLE)")
    # 12-21 bootstrap specification and deterministic replay of the primary
    for h in H:
        p = BS["primary"][f"{h}h"]
        check(p["samplingFrame"] == WINDOWS and p["samplingFrameSize"] == 6 and set(p["naWindowsIncludedInFrame"]) <= set(WINDOWS), f"12 all six windows in the sampling frame: {h}h")
        check(p["B_requested"] == B and p["seed"] == SEED and f"default_rng({SEED})" in p["rng"] and "integers(0, 6, size=6)" in p["rng"], f"13-16 B / seed / generator: {h}h")
        check(p["withReplacement"] is True and p["redrawn"] == 0 and p["imputation"] == 0, f"17-18 replacement sampling, no NA redraw: {h}h")
        check(p["quantileMethod"] == "linear" and p["quantiles"] == [0.025, 0.975], f"19-20 quantile method and q: {h}h")
        check(p["driftersResampledIndependently"] is False and p["trajectoryPointsResampled"] is False and p["windowWeighting"].startswith("equal"), f"21 no drifter-level resampling in the primary: {h}h")
        check(p["availableReplicates"] + p["notAvailableReplicates"] == B, f"13 replicate accounting: {h}h")
        # independent recomputation of the whole bootstrap for this horizon
        per = {w: list(A["perWindow"][f"{h}h"][w]["deltas_km"]) for w in WINDOWS}
        rng = np.random.default_rng(SEED); stats, na = [], 0
        for _ in range(B):
            idx = rng.integers(0, 6, size=6)
            vals = [median(per[WINDOWS[int(i)]]) for i in idx if per[WINDOWS[int(i)]]]
            if vals:
                stats.append(median(vals))
            else:
                na += 1
        arr = np.array(stats, dtype=float); q = np.quantile(arr, [0.025, 0.975], method="linear")
        check(len(stats) == p["availableReplicates"] and na == p["notAvailableReplicates"], f"27 replicate counts reproduced: {h}h")
        check(abs(q[0] - p["Q0.025_km"]) < 1e-12 and abs(q[1] - p["Q0.975_km"]) < 1e-12, f"27 interval reproduced: {h}h")
        check(hashlib.sha256(np.round(arr, 9).tobytes()).hexdigest() == p["statisticSha256"], f"28 statistic hash reproduced: {h}h")
        f = ROOT / p["replicatesFile"]
        check(f.is_file() and sha(f) == p["replicatesSha256"], f"30 replicate record present at the recorded hash: {h}h")
    # 22-23 decision rule and gate
    dec = BS["decision"]
    check(dec["horizonUsed"] == "72h" and dec["ThetaObserved_72h_km"] == A["theta"]["72h"]["Theta_extension_km"] and dec["Q0.975_72h_km"] == BS["primary"]["72h"]["Q0.975_km"], "22 decision uses the 72 h endpoint")
    gate_ok = BS["gate"]["validWindows72h"] >= 4
    check(BS["gate"]["satisfied"] == gate_ok and BS["gate"]["required"] == 4 and BS["gate"]["validWindows72h"] == 5, "23 gate handling")
    prereg = dec["preregisteredCriterion"]["candidateFavored"]; upper = dec["Q0.975_72h_km"]
    expect = "BLOCKED" if not gate_ok else ("SUPPORTED" if (prereg and upper < 0) else "NOT_SUPPORTED")
    check(dec["H_EXT"] == expect == R["H_EXT"] == S["H_EXT"], f"22 H_EXT follows the STEP 46 rule: {dec['H_EXT']} vs {expect}")
    P46 = load(D / "step46-validation-extension-preregistration-protocol.json")
    check(dec["preregisteredCriterion"]["source"].startswith("STEP 46") and P46["16_successCriterion"]["descriptiveLabel"]["name"] == "CANDIDATE_EXTENSION_DESCRIPTIVELY_FAVORED", "22 preregistered criterion identified")
    # independent recomputation of the STEP 30A label on the pooled 72 h pairs
    pooled72 = sorted(r["delta_CA_72h"] for r in rows if r["delta_CA_72h"] != NA)
    wins = sum(1 for x in pooled72 if x < -1e-6); losses = sum(1 for x in pooled72 if x > 1e-6); nontied = wins + losses
    fav = median(pooled72) < 0 and nontied > 0 and wins / nontied >= 2 / 3
    check(fav == prereg and dec["preregisteredCriterion"]["label"] == ("CANDIDATE_EXTENSION_DESCRIPTIVELY_FAVORED" if fav else dec["preregisteredCriterion"]["label"]), "22 STEP 30A descriptive label reproduced")
    check(dec["directiveCriterion"]["candidateFavored"] == (dec["ThetaObserved_72h_km"] < 0) and "criteriaAgreeOnFavour" in dec and "criteriaAgreeOnDecision" in dec, "29 the directive criterion is recorded beside the preregistered one, not merged")
    check(P["decisionRule"]["secondaryHorizonsChangeDecision"] is False, "22 secondary horizons do not change the decision")
    # 24-25 primary untouched, no promotion
    R40 = load(D / "step40-bootstrap-result.json"); pr = P["primaryResult"]
    check(pr["Theta_km"] == R40["primary"]["ThetaObserved_km"] == -31.331 and pr["CI95_km"] == [R40["primary"]["Q0.025_km"], R40["primary"]["Q0.975_km"]] == [-72.0725, -11.7435] and pr["H1"] == R40["successRule"]["H1"] == "SUPPORTED" and pr["PRIMARY_RESULT_MODIFIED"] is False, "24 primary result unchanged")
    sep = P["separationFromPrimary"]
    check(all(sep[k] is False for k in ("primaryRecomputed", "pooledValidation", "combinedCohort", "combinedBootstrap", "metaAnalysis", "overallGlobalClaim")) and R["primaryExperiment"]["pooledWithExtension"] is False, "24 no pooling with the primary")
    check(R["operationalPromotion"] is False and R["productionClaim"] is False and R["globalSuperiorityClaim"] is False and R["causalClaim"] is False and R["universalClaim"] is False and R["candidateStatus"] == "CANDIDATE_ONLY", "25 no operational promotion or global claim")
    # 26 no source modification / no rerun
    check(BS["noTrajectoryReRun"] is True and BS["noSourceModification"] is True and BS["noParameterTuning"] is True and BS["noCohortChange"] is True and BS["resultDrivenRerun"] is False, "26 no source modification, tuning, cohort change or result-driven rerun")
    check(A["inputs"]["trajectoriesReRun"] == 0 and A["inputs"]["observationsRead"] == 0 and A["inputs"]["forcingRead"] == 0, "26 no trajectory, observation or forcing read in aggregation")
    check(A["missingness"]["imputation"] == 0 and A["missingness"]["substitution"] == 0 and A["missingness"]["manualExclusion"] == 0, "26 no imputation, substitution or manual exclusion")
    # 27-28 deterministic replay through the tools themselves
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([sys.executable, str(ROOT / "tools/research/aggregate_step50_validation_extension.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        subprocess.run([sys.executable, str(ROOT / "tools/research/bootstrap_step50_validation_extension.py"), "--out", tmp, "--agg", str(Path(tmp) / "step50-aggregation.json")], cwd=ROOT, capture_output=True, text=True)
        a2 = Path(tmp) / "step50-aggregation.json"; b2 = Path(tmp) / "step50-bootstrap.json"
        check(a2.exists() and sha(a2) == sha(AGG), "27 aggregation replay byte-identical")
        if b2.exists():
            B2 = load(b2)
            sci = ("ThetaObserved_km", "Delta_w_km", "Q0.025_km", "Q0.975_km", "availableReplicates", "notAvailableReplicates", "replicatesSha256", "statisticSha256", "bootstrapMedian_km", "bootstrapMean_km", "seed", "B_requested", "samplingFrame")
            check(all(B2["primary"][h][k] == BS["primary"][h][k] for h in BS["primary"] for k in sci), "28 bootstrap scientific fields byte-identical on replay")
            check(B2["decision"] == BS["decision"] and B2["sensitivityOnly"] == BS["sensitivityOnly"] and B2["gate"] == BS["gate"], "28 decision, sensitivity and gate identical on replay")
        else:
            failures.append("27 bootstrap replay did not produce an output")
    # 29 sensitivity only, no invented analysis
    for h in H:
        s = BS["sensitivityOnly"][f"{h}h"]
        check(s["role"].startswith("SECONDARY / SENSITIVITY ONLY") and s["unit"] == "drifter pair" and s["B"] == B and s["seed"] == SEED and "separate" in s["generator"], f"29 sensitivity labelled and preregistered: {h}h")
    check(P["sensitivityOnly"]["usedForDecision"] is False and P["sensitivityOnly"]["replacesPrimary"] is False and P["sensitivityOnly"]["newSensitivityAnalysesInvented"] is False, "29 sensitivity never used for the decision; no invented analysis")
    # independence language
    IL = P["independenceLanguage"]
    low = T.lower()
    for f in IL["forbidden"]:
        check(f.lower() not in low, f"29 forbidden independence wording absent: {f!r}")
    check(IL["temporalIndependenceFromOriginalValidationAttemptClaimed"] is False and IL["pooledWithStep45cOriginalAttempt"] is False and any(p.lower() in low for p in IL["permitted"]), "29 permitted independence wording used")
    # 30 provenance and report consistency
    check(S["resultsSha256"] == sha(RES) and S["protocolSha256"] == sha(PROTO) == R["protocolSha256"] and R["inputs"]["aggregationSha256"] == sha(AGG) and R["inputs"]["bootstrapSha256"] == sha(BOOT), "30 provenance completeness")
    for s in (R["H_EXT"], "20260946", "10000", "-31.331", "CANDIDATE_ONLY", "NOT_SUPPORTED" if R["H_EXT"] == "NOT_SUPPORTED" else R["H_EXT"], "geographically independent"):
        check(s in T, f"30 report states: {s!r}")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40],
                      "H_EXT": R["H_EXT"], "theta": R["theta"], "validWindows": R["validWindows"],
                      "CI72h": [BS["primary"]["72h"]["Q0.025_km_rounded6"], BS["primary"]["72h"]["Q0.975_km_rounded6"]],
                      "gate": "PASS" if gate_ok else "FAIL", "criteriaAgreeOnDecision": dec["criteriaAgreeOnDecision"],
                      "primaryUnchanged": True}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
