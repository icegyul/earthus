"""Independent fail-closed validator for STEP 44 (independent out-of-sample validation preregistration; design only). exit 0 = PASS.
Checks the 31 mandated items: STEP 43 ancestry (and STEP 36-42, runtime) · STEP 42 / STEP 40 / STEP 37 / primary-cohort identities ·
existence and exact content of the validation cohort rule, temporal and geographic independence rules, drifter non-overlap (88 excluded IDs
= 20 primary + 68 prior, recomputed from the frozen records), minimum sample-size rule, deterministic tie-breaking, chronological first-prefix
rule · frozen model configurations and parameters (identical to the STEP 39 execution record) · forcing-selection rule and source-substitution
prohibition · primary endpoint, statistical unit, validation bootstrap (B 10000, separate fixed seed 20260944, default_rng, linear
0.025/0.975), success criterion, failure/blocking states, missingness rules, no-pooled-rescue rule, operational-promotion separation,
amendment procedure · no validation data access / execution / post-hoc selection · protocol / status / report consistency (hashes, seed,
period, region rule, primary result unchanged). Deterministic output (no timestamps)."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
PROTO, STAT, REP = D / "step44-validation-preregistration-protocol.json", D / "step44-validation-preregistration-status.json", D / "step44-validation-preregistration-report.md"
ANC = {"step36": "043a09b8539955868651a06e7c2c44e3c606803f", "step37": "74d19f0a9661a41d63a08c56bbd3f91e9d8b312d", "step38": "23e78f863fb092aa9e3c36e4d74d4afd4393e7f4", "step40": "2b1a7baa7ef9e69d25cecbff2b09fca8700fca80",
       "step41": "9a3223089099bcb09a2589cc8a4bda82fcb47ae5", "step42": "bae85245e827f53ee9782201c442ea7849c04e82", "step43": "15970d9735330fb937e86af449c1deef6763b5d1"}
IDENT = {"docs/research/step42-final-scientific-results-report.md": "c490669413a83bee73a2a33733432073f3e898ee52ce47722b4b365a5da5f1f0", "docs/research/step40-bootstrap-result.json": "e7fe94c8f527846721f856418f1c4686a75132e21a72b122006d3d7bdbe6482f",
         "docs/research/step40-bootstrap-protocol.json": "60dbf72cd91d91cc4cc2c72d96c4aec41ffd39ce8368db2d4081070f77786fb4", "docs/research/step37-experiment-preregistration-protocol.json": "eae40cde609155a32ccbe0c01a6090715e2324d72cc080e2e7043ecbd90f2d0d",
         "docs/research/step36-cohort-extension-manifest.json": "bda31c3ca36a395acadc95c1cb18663964ee9a00e4a72a7c2504182f51df06ca", "docs/research/step43-reproducibility-verification.json": "d1ce6d7d5d0550e5b93d3ad5cd1fa2e67fb0f4ced0d87b0e2b9a44ad18b0b632"}
STEP35 = {"docs/research/step35-phase-a-protocol.json": "7c3cc487568c1a063790e17fdae11ffe712047d78ea4761719bf6df7e7142f2f", "docs/research/step35-window-eligibility.json": "d01d06a3430def6ea77a814bb4379a9b45ca058713fa0901c9c30b035fbb635b"}
GS_BOX = {"south": 32, "north": 40, "west": -75, "east": -55}


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    P, S = load(PROTO), load(STAT); T = REP.read_text(encoding="utf-8").replace("−", "-").replace("–", "-")
    # 1 ancestry
    for k, c in {**ANC, "runtime": "155995dd"}.items():
        check(git("cat-file", "-t", c).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", c, "HEAD").returncode == 0, f"1 ancestry {k}")
        check(P["ancestry"][k].startswith(c), f"1 ancestry field {k}")
    # 2-5 identities
    for f, h in IDENT.items():
        check(sha(ROOT / f) == h and P["frozenInputs"].get(f, h) == h, f"2-5 identity {f}")
    for f, h in STEP35.items():
        check(sha(ROOT / f) == h and P["frozenInputsByHashUncommitted"][f] == h, f"5 STEP 35 inventory by hash {f}")
    M36 = load(D / "step36-cohort-extension-manifest.json"); P35 = load(D / "step35-phase-a-protocol.json"); X39 = load(D / "step39-execution-record.json")
    prim = sorted(M36["drifterIds"]); prior = sorted(P35["exclusion"]["priorDrifterIds"]); excl = sorted(set(prim) | set(prior))
    p1 = P["1_primaryExperimentFrozen"]
    check(p1["primaryDrifterIds"] == prim and len(prim) == 20 and [w["windowId"] for w in p1["primaryWindows"]] == [w["windowId"] for w in M36["windows"]] and max(w["end"] for w in p1["primaryWindows"]) == "2010-10-19T12:00:00Z", "5 primary cohort identity (20 IDs, 9 windows, last end 2010-10-19T12Z)")
    check(p1["primaryResult"] == {"Theta_km": -31.331, "CI95_km": [-72.0725, -11.7435], "H1": "SUPPORTED", "candidate": "CANDIDATE_ONLY", "operationalPromotion": False} and "must not be used" in p1["rule"], "1 primary result frozen and declared non-input")
    # 6-12 cohort rule
    R = P["4_validationCohortRule"]
    check(R["ruleId"] == "validation-cohort-rule-step44" and R["calendarPeriod"]["t0"] == "2010-11-18T12:00:00Z" and R["calendarPeriod"]["t1"] == "2015-12-31T21:00:00Z", "6 validation cohort rule exists with period")
    check(P["5_temporalIndependence"]["rule"].startswith("t0 = 2010-10-19T12:00:00Z + 30 d = 2010-11-18T12:00:00Z") and P["5_temporalIndependence"]["yearSelectedForExpectedPerformance"] is False and "later calendar period" in P["5_temporalIndependence"]["design"], "7 temporal independence rule")
    G = P["6_geographicIndependence"]; RR = R["regionRule"]
    check(G["designType"].startswith("C: different-region / later-time") and G["performanceBasedRegionSelection"] is False and RR["candidates"] == ["KE", "BM", "AG"] and "GS" not in RR["candidates"] and RR["boxes"]["GS"] == GS_BOX and "descending" in RR["selection"] and "alphabetical" in RR["selection"] and "rank 1 only" in RR["selection"] and "VALIDATION_BLOCKED" in RR["noFallback"], "8 geographic independence rule (design C, objective count rule, no fallback)")
    E = R["exclusionIdentity"]
    check(E["excludedDrifterIds"] == excl and E["excludedDrifterIdCount"] == 88 == len(excl) and E["sha256OfSortedIdList"] == hashlib.sha256("\n".join(excl).encode()).hexdigest() and E["priorWindowStartsByRegion"] == P35["exclusion"]["priorWindowStartsByRegion"] and P["3_independence"]["primaryStep36ExclusionsRespected"] is True, "9 drifter non-overlap: 88 excluded IDs = 20 primary + 68 prior")
    check(all(k in P["3_independence"]["requirements"] for k in ("A_noDrifterIdOverlap", "B_noWindowOverlap", "C_noObservationOverlap", "D_noTuning", "E_noForcingSelection", "F_noModelSelection", "G_noCohortModification")) and len(P["3_independence"]["leakageInventory"]) >= 7, "9 independence requirements A-G and leakage inventory")
    check(R["minimumWindows"] == 6 and R["minimumUniqueDrifters"] == 20 and R["maximumWindows"] == 12 and P["7_sampleSizeGate"]["minimumPrimaryValidWindowsAfterQC"] == 4 and P["7_sampleSizeGate"]["criterionChangeForSmallSample"] == "forbidden" and "VALIDATION_BLOCKED" in R["ifMinimumNotFormed"] and "no period extension" in R["ifMinimumNotFormed"], "10 minimum sample-size rule and blocked behaviour")
    check("alphabetical" in R["tieBreaking"] and "none needed for windows" in R["tieBreaking"], "11 deterministic tie-breaking")
    check(R["firstPrefixRule"].startswith("the validation cohort is the shortest chronological prefix") and "ascending" in R["chronologicalOrdering"] and "STEP 16 E1-E5" in R["eligibility"] and "frameCoverageComplete" in R["eligibility"] and "forbidden" in R["manualChoice"], "12 chronological first-prefix rule, eligibility, no manual choice")
    # 13-16 configuration and sources
    Mc = P["8_modelConfiguration"]; Ec = X39["E_modelConfiguration"]; pp = Mc["parameters"]
    check(pp["alpha"] == Ec["alpha"] == 0.002 and pp["stokesMultiplier"] == Ec["stokesCoefficient"] == 1.0 and pp["depthA_B_m"] == Ec["depthA_B_m"] == 15.0 and pp["depthC_m"] == Ec["depthC_m"] == 15.81007 and pp["dtSeconds"] == Ec["integrationStepSeconds"] == 300 and pp["outputSeconds"] == Ec["outputStepSeconds"] == 900 and pp["horizonsHours"] == Ec["horizonsHours"] == [24, 48, 72] and pp["integrator"] == "RK4" and pp["boundaryPolicy"] == Ec["boundaryPolicy"] and pp["runtimeCommit"] == "155995dd" and pp["modelSourceSha256"] == X39["D_runtimeSha"]["modelSourceSha256"], "13-14 model configuration and parameters frozen = STEP 39 execution record")
    check(all(k in Mc["conditions"] for k in "ABC") and "GLORYS12V1" in Mc["conditions"]["C"] and "15.810070" in Mc["conditions"]["C"] and "Stokes drift x 1.0" in Mc["conditions"]["C"] and "HYCOM_NATIVE_3H" in Mc["conditions"]["A"] and "HYCOM_DAILY" in Mc["conditions"]["B"] and set(Mc["prohibited"]) >= {"tuning", "calibration", "optimisation", "parameter search", "alternate forcing source", "alternate depth", "alternate Stokes multiplier", "alternate temporal representation"}, "13 conditions A/B/C frozen and prohibitions")
    Sr = P["9_sourceRule"]
    check(all(k in Sr["sources"] for k in ("HYCOM", "GLORYS", "WW3", "NCEP", "observations")) and Sr["identityFrozenBeforeAcquisition"] is True and Sr["performanceBasedSourceChoice"] is False and "no substitute" in Sr["ifUnavailable"] and "BLOCKED" in Sr["ifUnavailable"], "15-16 forcing-selection rule frozen; source substitution prohibited")
    # 17-18 endpoint / unit
    Ep = P["10_primaryValidationEndpoint"]
    check(Ep["perDrifter"].startswith("delta_i = E_C,i(72 h) - E_A,i(72 h)") and "6371008.8" in Ep["perDrifter"] and Ep["window"].startswith("Delta_w = median_i") and Ep["primaryStatistic"].startswith("Theta_validation = median_w") and Ep["windowWeighting"] == "equal" and Ep["identicalToPrimary"] is True and "never imputed" in Ep["naHandling"], "17 primary endpoint frozen")
    check(Ep["hierarchy"].startswith("window > drifter pair > trajectory points") and P["12_validationUncertainty"]["samplingUnit"] == "validation window", "18 statistical unit frozen (window)")
    # 19-21 bootstrap
    Bt = P["12_validationUncertainty"]
    check(Bt["B"] == 10000 and Bt["seed"] == 20260944 and Bt["seed"] != 20260907 and "default_rng(20260944)" in Bt["generator"] and "NOT_AVAILABLE" in Bt["replicate"] and "never redrawn" in Bt["replicate"] and Bt["noTrajectoryPointResampling"] is True and Bt["noIndependentDrifterResamplingForPrimary"] is True, "19-20 validation bootstrap definition with separate fixed seed")
    check("[0.025, 0.975]" in Bt["interval"] and "method='linear'" in Bt["interval"], "21 CI definition")
    # 22-27 criterion, states, missingness, pooling, promotion, amendment
    Sc = P["13_successCriterion"]
    check(Sc["descriptiveLabel"]["name"] == "CANDIDATE_VALIDATION_DESCRIPTIVELY_FAVORED" and "2/3" in Sc["descriptiveLabel"]["rule"] and "1e-6" in Sc["descriptiveLabel"]["rule"] and len(Sc["VALIDATION_SUPPORTED_iff"]) == 3 and "Q0.975 < 0 km" in Sc["VALIDATION_SUPPORTED_iff"][1] and ">= 4" in Sc["VALIDATION_SUPPORTED_iff"][2] and Sc["secondaryMetricsMayReplacePrimary"] is False and Sc["changeAfterObservation"] == "forbidden" and P["11_primaryValidationHypothesis"]["id"] == "H_V" and P["11_primaryValidationHypothesis"]["singleConfirmatory"] is True, "22 validation success criterion and single hypothesis H_V")
    Fs = P["14_failureStates"]
    check(all(k in Fs for k in ("VALIDATION_SUPPORTED", "VALIDATION_NOT_SUPPORTED", "VALIDATION_BLOCKED", "VALIDATION_INVALID")) and any("INSUFFICIENT_INDEPENDENT_COHORT" in x for x in Fs["VALIDATION_BLOCKED"]) and any("SOURCE_UNAVAILABLE" in x for x in Fs["VALIDATION_BLOCKED"]) and any("COORDINATE_MISMATCH" in x for x in Fs["VALIDATION_INVALID"]) and any("IMMUTABILITY" in x for x in Fs["VALIDATION_INVALID"]) and any("REPLAY" in x for x in Fs["VALIDATION_INVALID"]) and any("PROVENANCE" in x for x in Fs["VALIDATION_BLOCKED"]) and "BLOCKED is never reported as NOT_SUPPORTED" in Fs["rules"], "23 failure / blocking states")
    Mi = P["17_availabilityMissingness"]
    check(set(Mi["prohibited"]) >= {"imputation", "substitution", "silent removal", "conversion of NA to zero"} and any("candidate-only" in x for x in Mi["mustReport"]) and any("OUT_OF_DOMAIN" in x for x in Mi["mustReport"]) and any("FORCING_UNAVAILABLE" in x for x in Mi["mustReport"]), "24 missingness rules")
    check("never pooled" in P["15_noPooledRescue"]["rule"] and "cannot replace" in P["15_noPooledRescue"]["rule"] and P["18_primaryValidationComparison"]["combinedConfirmatoryStatistic"].startswith("forbidden"), "25 no pooled-rescue rule")
    Tr = P["19_transportabilityInterpretation"]
    check(all(k in Tr["levels"] for k in ("A_replicationOfDirection", "B_replicationOfStatisticalSupport", "C_transportability", "D_operationalSuperiority")) and Tr["automaticOperationalPromotion"] is False and "remains CANDIDATE_ONLY" in Tr["candidateStatusAfterValidation"], "26 operational-promotion separation")
    Am = P["20_amendmentProcedure"]
    check(all(s in Am["rule"] for s in ("old value", "new value", "reason", "UTC timestamp", "commit SHA", "validation data were accessed", "validation results were accessed")) and Am["amendmentHistory"] == [], "27 amendment procedure")
    # 28-30 no access / execution / post-hoc
    Nd = P["noValidationDataAccess"]
    check(Nd["validationForcingDownloaded"] is False and Nd["validationObservationsInspected"] is False and Nd["validationSourceFilesInspected"] is False and Nd["trajectoriesRun"] == 0 and Nd["bootstrapRun"] == 0 and Nd["performanceEvaluated"] is False and P["designOnly"] is True, "28-29 no validation data access / no execution")
    check(P["noPostHocSelection"] is True and any("result-dependent selection" in x["form"] for x in P["3_independence"]["leakageInventory"]) and "expectedRegionUnderRule" in RR and RR["expectedRegionUnderRule"] == "KE", "30 no post-hoc selection; region prediction recorded for STEP 45 check")
    # forbidden subjective wording
    low = json.dumps(P).lower()
    for w in ("most representative", "best-looking", "favourable period", "favorable period", "expected to favor", "expected to favour"):
        check(w not in low, f"30 subjective selection wording absent: {w!r}")
    # 31 consistency protocol / status / report
    check(S["protocolSha256"] == sha(PROTO) and S["step"] == 44 and S["status"] == "VALIDATION_PREREGISTRATION_DESIGN_COMPLETE" and S["bootstrap"]["seed"] == 20260944 and S["bootstrap"]["B"] == 10000 and S["validationPeriod"] == [R["calendarPeriod"]["t0"], R["calendarPeriod"]["t1"]] and S["cohortMinimum"] == {"windows": 6, "drifters": 20, "maxWindows": 12, "validWindowsAfterQC": 4} and S["excludedDrifterIds"] == 88 and S["validationDataAccessed"] is False and S["validationExperimentExecuted"] is False and S["modelRunCount"] == 0 and S["bootstrapRunCount"] == 0 and S["primaryResultUnchanged"] == p1["primaryResult"] and S["automaticCommit"] is False and S["push"] is False and S["ancestry"] == P["ancestry"], "31 status consistent with protocol")
    for s in (sha(PROTO)[:16], "2010-11-18T12:00:00Z", "20260944", "CANDIDATE_VALIDATION_DESCRIPTIVELY_FAVORED", "VALIDATION_SUPPORTED", "VALIDATION_NOT_SUPPORTED", "VALIDATION_BLOCKED", "VALIDATION_INVALID", "different-region / later-time", "88", "H_V", "Theta_validation", "-31.331 km", "[-72.0725, -11.7435] km", "CANDIDATE_ONLY", "No validation data were accessed", "No validation experiment was executed", "numpy.random.default_rng(20260944)", "method=\"linear\"" if "method=\"linear\"" in T else "method='linear'", "Q0.975 < 0 km"):
        check(s in T, f"31 report states: {s!r}")
    check(re.search(r"(?<![a-z])(most representative|best-looking|proven|winner|optimal)(?![a-z])", T.lower()) is None, "31 report wording")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "designType": G["designType"], "period": [R["calendarPeriod"]["t0"], R["calendarPeriod"]["t1"]], "expectedRegion": RR["expectedRegionUnderRule"], "excludedIds": len(excl), "seed": Bt["seed"], "B": Bt["B"], "modelRuns": Nd["trajectoriesRun"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
