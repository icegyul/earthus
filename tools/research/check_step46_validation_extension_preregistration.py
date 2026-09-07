"""Independent fail-closed validator for STEP 46 (validation-extension preregistration; design only). exit 0 = PASS.
Checks the 35 mandated items: STEP 45C / 45B / 45A / 44 identities and ancestry (plus STEP 36-43 and the runtime) · the original
validation remains BLOCKED and its 4-window / 14-drifter set is never called a cohort · primary result unchanged and not used to design the
extension · explicit VALIDATION_EXTENSION labelling and the six required statements · explicit, complete candidate region set recomputed
from the frozen framework (all non-primary registered regions; GS excluded) · deterministic region rule with no ranking, no subsetting and
no performance input; the per-region feasibility counts recomputed from the frozen STEP 35 eligibility file · temporal rule with derivations
and the overlap disclosure · independence rules and the 88-ID exclusion identity · frozen STEP 16 E1-E5 / A1-A3 logic and unchanged
accumulation, separation, first-prefix and max-window rules · the sample-size gate identical to the original and its disclosed structural
ceiling · model, parameter and forcing configuration equal to the frozen STEP 39 record · endpoint, statistical unit, window-level bootstrap
with a NEW seed distinct from 20260907 and 20260944 · success criterion and the four statuses · original-versus-extension separation and no
pooling · operational-promotion separation · amendment procedure · integrity check that this is not a rescue protocol · no extension data
accessed and no extension experiment executed · protocol / status / report consistency and the deterministic protocol identity hash.
Deterministic output (no timestamps)."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
PROTO, STAT, REP = D / "step46-validation-extension-preregistration-protocol.json", D / "step46-validation-extension-preregistration-status.json", D / "step46-validation-extension-preregistration-report.md"
COMMITS = {"step36": "043a09b8539955868651a06e7c2c44e3c606803f", "step37": "74d19f0a9661a41d63a08c56bbd3f91e9d8b312d", "step38": "23e78f863fb092aa9e3c36e4d74d4afd4393e7f4",
           "step40": "2b1a7baa7ef9e69d25cecbff2b09fca8700fca80", "step41": "9a3223089099bcb09a2589cc8a4bda82fcb47ae5", "step42": "bae85245e827f53ee9782201c442ea7849c04e82",
           "step43": "15970d9735330fb937e86af449c1deef6763b5d1", "step44": "5f8d5c38bfc9cc6a168707ae0b1b643c99ad46f9", "step45a": "b0f0274f14ae491e34f0bcb85874056d92260f46",
           "step45b": "7249c38d355f97c4f264d2f4d7611ce5013bd8d7", "step45c": "fa9c0590d634a6d6f30cc8a6cd2797c94e0ae7dd"}
T0, T1 = "2010-11-18T12:00:00Z", "2015-12-31T21:00:00Z"
REGIONS = ["KE", "BM", "AG"]
SEED = 20260946
FORBIDDEN_SEEDS = [20260907, 20260944]


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
    P, S = load(PROTO), load(STAT); T = REP.read_text(encoding="utf-8")
    # 1-4 ancestry and lock identities
    for k, c in {**COMMITS, "runtime": "155995dd"}.items():
        check(git("cat-file", "-t", c).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", c, "HEAD").returncode == 0, f"1-4 ancestry {k}")
        check(P["ancestry"][k].startswith(c), f"1-4 ancestry field {k}")
    for rel, h in P["frozenInputs"].items():
        check(sha(ROOT / rel) == h, f"2-4 frozen input unchanged: {rel}")
    check(git("diff", "--quiet", "HEAD", "--", "docs/research", "tools/research").returncode == 0, "1-4 no tracked research file modified")
    # 5 original validation still blocked, untouched
    M45C, S45C = load(D / "step45c-validation-cohort-manifest.json"), load(D / "step45c-validation-cohort-status.json")
    O = P["2_frozenOriginalValidation"]
    check(M45C["status"] == S45C["status"] == "VALIDATION_COHORT_BLOCKED" == O["originalValidationStatus"] and O["gateMet"] is False and O["originalCohortExists"] is False, "5 original validation remains BLOCKED")
    check(O["newIdWindows"] == M45C["cohort"]["windows"] == 4 and O["cumulativeUniqueDrifters"] == M45C["cohort"]["uniqueDrifters"] == 14 and O["minimumRequired"] == 20 and "INTERMEDIATE DERIVATION RESULT ONLY" in O["fourteenDrifterSetLabel"], "5 14-drifter set is never called a cohort")
    check(O["step44Altered"] is False and O["step45cReopened"] is False and git("rev-parse", f"{COMMITS['step44']}:docs/research/step44-validation-preregistration-protocol.json").stdout.strip() == git("hash-object", "docs/research/step44-validation-preregistration-protocol.json").stdout.strip(), "5 STEP 44 unaltered, STEP 45C not reopened")
    # 6 primary result unchanged and not used
    R40 = load(D / "step40-bootstrap-result.json"); PR = P["1_frozenPrimaryResult"]
    check(PR["Theta_km"] == R40["primary"]["ThetaObserved_km"] == -31.331 and PR["CI95_km"] == [R40["primary"]["Q0.025_km"], R40["primary"]["Q0.975_km"]] == [-72.0725, -11.7435] and PR["H1"] == R40["successRule"]["H1"] == "SUPPORTED" and PR["candidateStatus"] == "CANDIDATE_ONLY" and PR["operationalPromotion"] is False and PR["usedToDesignThisExtension"] is False, "6 primary result unchanged and not used to design the extension")
    # 7 labelling
    C4 = P["4_extensionClassification"]
    check(P["classification"] == "VALIDATION_EXTENSION_PRE_REGISTRATION" and C4["label"] == "VALIDATION_EXTENSION" and C4["notLabel"] == "original confirmatory validation" and len(C4["statements"]) == 6, "7 extension explicitly labelled with the six statements")
    # 8-10 region set and selection rule
    E = load(D / "step35-window-eligibility.json"); C16 = load(D / "cohort-step16.json")
    all_regions = sorted(C16["regionResults"].keys()); expect = sorted(r for r in all_regions if r != "GS")
    Dm = P["6_extensionDomain"]; RS = P["7_regionSelectionRule"]
    check(sorted(Dm["candidateRegionSet"]) == expect == sorted(REGIONS) and Dm["candidateRegionSetIsComplete"] is True and "GS" in Dm["excludedRegions"] and Dm["noUndefinedOtherRegions"] is True, "8 candidate region set explicit and complete (all non-primary registered regions)")
    feas = {r: sum(1 for w in E["windows"] if w["region"] == r and w["windowEligible"] and T0 <= w["start"] <= T1) for r in REGIONS}
    check({r: RS["feasibilityQuantities"][r]["eligibleWindows"] for r in REGIONS} == feas == {"KE": 26, "BM": 3, "AG": 0} == S["regionFeasibility"], "9 per-region feasibility counts recomputed from the frozen eligibility file")
    check(RS["rankingUsed"] is False and RS["subsetSelection"] is False and P["8_multiRegionDesign"]["allRegionsMandatory"] is True, "9 deterministic region rule: all regions mandatory, no ranking or subsetting")
    check(Dm["regionQualityUsed"] is False and Dm["expectedPerformanceUsed"] is False and "no Candidate C quantity" in Dm["basedOn"] and set(RS["prohibited"]) >= {"trajectory performance", "model error", "Candidate C inspection", "validation forcing inspection"}, "10 no performance-based region selection")
    MR = P["8_multiRegionDesign"]
    check(MR["multiRegion"] is True and "frozen STEP 35 / STEP 36 accumulation rule is itself multi-region" in MR["justification"] and "COMPLETE non-primary set" in MR["notARescueAnalysis"] and MR["weighting"].startswith("equal WINDOW weighting"), "10 multi-region justified as generalizability, not rescue")
    check(P35_ok(load(D / "step35-phase-a-protocol.json")), "10 frozen STEP 35 accumulation really is multi-region (quoted claim verified)")
    # 11 temporal rule
    TR = P["10_temporalRule"]
    check(TR["t0_extension"] == T0 and TR["t1_extension"] == T1 == S["temporalScope"][1] and S["temporalScope"][0] == T0 and TR["yearChosenForExpectedPerformance"] is False and TR["overlapWithOriginalValidationPeriod"] is True and "no non-overlapping later period exists" in TR["overlapDisclosure"] and "multiYearSelectionMechanism" in TR, "11 temporal rule fixed with derivations and overlap disclosure")
    # 12-14 independence and exclusions
    I = P["5_independentDataRequirement"]; R44 = load(D / "step44-validation-preregistration-protocol.json")["4_validationCohortRule"]
    check(I["noOverlapWithPrimary20"] and I["noOverlapWith88Excluded"] and I["noPrimaryObservationRecordReuse"] and I["periodLaterThanPrimaryCohort"] and I["noPrimaryWindowReuse"], "12-13 independence rules stated")
    X = I["exclusionIdentity"]
    check(X["excludedDrifterIdCount"] == 88 == R44["exclusionIdentity"]["excludedDrifterIdCount"] and X["sha256OfSortedIdList"] == R44["exclusionIdentity"]["sha256OfSortedIdList"] == hashlib.sha256("\n".join(sorted(X["excludedDrifterIds"])).encode()).hexdigest() and X["priorWindowStartsByRegion"] == R44["exclusionIdentity"]["priorWindowStartsByRegion"], "14 exclusion list identity unchanged (88 IDs)")
    # 15-18 accumulation and gate
    A = P["11_cohortAccumulation"]
    check("E1-E5 + A1-A3 applied verbatim" in A["eligibility"] and A["eligibilityRuleChanged"] is False and A["newQcRule"] is False and A["newSpatialFilter"] is False and A["newTemporalFilter"] is False, "15 frozen E1-E5 / A1-A3 logic unchanged")
    check(A["ordering"] == "(start, region) ascending" and A["separationRule"].startswith("same-region selected starts >= 72 h") and A["firstPrefixRule"].startswith("the extension cohort is the shortest chronological prefix") and A["manualAddOrRemove"] == "forbidden" and A["performanceBasedPruning"] == "forbidden" and A["easeOfSimulationSelection"] == "forbidden", "16 accumulation rule")
    G = P["9_sampleSizeGate"]
    check(G["minimumWindows"] == 6 and G["minimumUniqueDrifters"] == 20 and G["maximumWindows"] == 12 == A["maxWindowGate"] and G["minimumValidWindowsAfterQC"] == 4 and G["identicalToOriginalGate"] is True and G["relaxedRelativeToOriginal"] is False and G["relaxationAfterResult"] == "forbidden" and G["ifNotReached"] == "VALIDATION_EXTENSION_BLOCKED", "17-18 sample-size gate identical to the original; max 12")
    SC = G["disclosedStructuralCeiling"]
    check(SC["maximumSelectableWindows"] == 6 == S["structuralCeilingWindows"] and SC["gateMinimumWindows"] == 6 and SC["gateNotAdjustedToThisCeiling"] is True and "not known at preregistration time" in SC["consequence"].lower(), "17 structural ceiling disclosed and the gate not fitted to it")
    # 19-21 model / parameters / forcing
    X39 = load(D / "step39-execution-record.json")["E_modelConfiguration"]; MC = P["12_modelConfiguration"]; pp = MC["parameters"]
    check(pp["alpha"] == X39["alpha"] == 0.002 and pp["stokesMultiplier"] == X39["stokesCoefficient"] == 1.0 and pp["depthA_B_m"] == X39["depthA_B_m"] == 15.0 and pp["depthC_m"] == X39["depthC_m"] == 15.81007 and pp["dtSeconds"] == X39["integrationStepSeconds"] == 300 and pp["outputSeconds"] == X39["outputStepSeconds"] == 900 and pp["horizonsHours"] == X39["horizonsHours"] == [24, 48, 72] and pp["runtimeCommit"] == "155995dd", "19-20 model and parameter configuration frozen")
    check(all(k in MC["conditions"] for k in "ABC") and "GLORYS12V1" in MC["conditions"]["C"] and "Stokes x 1.0" in MC["conditions"]["C"] and MC["tuning"] == "forbidden" and MC["recalibration"] == "forbidden" and MC["optimisation"] == "forbidden" and MC["newModel"] is False, "19 conditions frozen, no tuning")
    check("exact frozen product identities only" in MC["forcingRule"] and "no substitute product" in MC["forcingRule"], "21 forcing rule frozen")
    # 22-25 endpoint / unit / bootstrap / seed
    EP = P["13_primaryExtensionEndpoint"]
    check(EP["perDrifter"].startswith("delta_i = E_C,i(72 h) - E_A,i(72 h)") and "6371008.8" in EP["perDrifter"] and EP["primaryStatistic"].startswith("Theta_extension = median_w") and EP["windowWeighting"] == "equal" and EP["identicalToPrimaryEndpoint"] is True and "never imputed" in EP["naHandling"], "22 endpoint frozen")
    check(EP["statisticalUnit"] == "window" and EP["hierarchy"].startswith("window > drifter pair"), "23 statistical unit")
    B = P["15_extensionUncertainty"]
    check(B["method"] == "window-level percentile bootstrap" and B["samplingUnit"] == "window" and B["B"] == 10000 and B["noIndependentDrifterResamplingForPrimary"] is True and B["noTrajectoryPointResampling"] is True and "[0.025, 0.975]" in B["interval"] and "method='linear'" in B["interval"], "24 bootstrap method")
    check(B["seed"] == SEED == S["bootstrap"]["seed"] and B["seed"] not in FORBIDDEN_SEEDS and B["seedsNotReused"] == FORBIDDEN_SEEDS and B["seedIsNew"] is True and f"default_rng({SEED})" in B["generator"], "25 NEW fixed seed distinct from 20260907 / 20260944")
    # 26-27 criterion and statuses
    CR = P["16_successCriterion"]
    check(CR["descriptiveLabel"]["name"] == "CANDIDATE_EXTENSION_DESCRIPTIVELY_FAVORED" and "2/3" in CR["descriptiveLabel"]["rule"] and len(CR["VALIDATION_EXTENSION_SUPPORTED_iff"]) == 3 and "Q0.975 < 0 km" in CR["VALIDATION_EXTENSION_SUPPORTED_iff"][1] and CR["statusRedefinitionAfterResults"] == "forbidden" and CR["secondaryMetricsMayReplacePrimary"] is False, "26 extension success criterion")
    check(all(k in CR for k in ("VALIDATION_EXTENSION_NOT_SUPPORTED", "VALIDATION_EXTENSION_BLOCKED", "VALIDATION_EXTENSION_INVALID")) and S["statuses"] == ["VALIDATION_EXTENSION_SUPPORTED", "VALIDATION_EXTENSION_NOT_SUPPORTED", "VALIDATION_EXTENSION_BLOCKED", "VALIDATION_EXTENSION_INVALID"], "27 failure states")
    H = P["14_primaryExtensionHypothesis"]
    check(H["id"] == "H_EXT" and H["statement"] == "Theta_extension < 0 km" and H["singleConfirmatory"] is True and H["isNotH1"] is True and H["mergedWithH1"] is False, "26 single extension hypothesis H_EXT, not merged with H1")
    # 28-29 separation and operational status
    OV = P["17_originalVersusExtension"]
    check(OV["ORIGINAL_VALIDATION"].startswith("BLOCKED") and OV["extensionPresentedAsOriginalValidation"] is False and OV["pooledWithOriginalBlockedAttempt"] is False and OV["combinedStatistic"].startswith("forbidden"), "28 original versus extension kept separate, no pooling")
    OS = P["18_operationalStatus"]
    check(OS["candidateStatusAfterExtension"].startswith("CANDIDATE_ONLY") and OS["operationalPromotion"] == "NO" and OS["extensionIsEvidenceAbout"] == "generalization only", "29 operational-promotion separation")
    # 30 amendment
    AM = P["20_amendmentProcedure"]
    check(all(s in AM["rule"] for s in ("old value", "new value", "reason", "UTC timestamp", "commit SHA", "extension data were accessed", "extension results were accessed")) and AM["amendmentHistory"] == [], "30 amendment procedure")
    # 31-32 no data / no execution
    N = P["noExtensionDataAccess"]
    check(N["extensionForcingDownloaded"] is False and N["extensionObservationsInspected"] is False and N["extensionSourceFilesInspected"] is False and N["trajectoriesRun"] == 0 and N["bootstrapRun"] == 0 and N["performanceEvaluated"] is False and N["cohortDerived"] is False and P["designOnly"] is True, "31-32 no extension data accessed, no experiment executed")
    LD = P["19_leakageDisclosure"]
    check(LD["designedAfterOriginalFeasibilityFailure"] is True and LD["primaryScientificResultIsAlreadyKnown"] is True and LD["primaryPerformanceUsedInExtensionCohortRules"] is False and LD["extensionPerformanceViewed"] is False and LD["extensionTrajectoryExecuted"] is False and LD["extensionForcingInspected"] is False and len(LD["knownAtDesignTime"]) >= 3 and len(LD["notKnownAtDesignTime"]) >= 3, "31 leakage disclosure complete")
    IC = P["21_integrityCheck"]
    check(IC["isRescueProtocol"] is False and IC["originalGateRemainsFailed"] is True and IC["extensionSeparatelyLabelled"] is True and IC["extensionCanModifyPrimaryResult"] is False and IC["extensionCanEraseOriginalLimitation"] is False and IC["domainJustifiedByExpectedFavorableResults"] is False and IC["designBlockedStatus"] == "NOT TRIGGERED", "22 integrity check: not a rescue protocol")
    # 33-34 consistency and identity hash
    core = {k: P[k] for k in ("classification", "5_independentDataRequirement", "6_extensionDomain", "7_regionSelectionRule", "8_multiRegionDesign", "9_sampleSizeGate", "10_temporalRule", "11_cohortAccumulation", "12_modelConfiguration", "13_primaryExtensionEndpoint", "14_primaryExtensionHypothesis", "15_extensionUncertainty", "16_successCriterion")}
    check(P["protocolIdentityHash"] == hashlib.sha256(json.dumps(core, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest() == S["protocolIdentityHash"], "34 deterministic protocol identity hash")
    check(S["protocolSha256"] == sha(PROTO) and S["status"] == "VALIDATION_EXTENSION_DESIGN_COMPLETE" and S["originalValidationRemainsBlocked"] is True and S["extensionDomain"] == P["6_extensionDomain"]["candidateRegionSet"] and S["gate"]["minimumWindows"] == 6 and S["extensionDataAccessed"] is False and S["extensionExperimentExecuted"] is False and S["cohortDerived"] is False and S["isRescueProtocol"] is False and S["designBlocked"] is False and S["primaryResultUnchanged"] == {"Theta_km": -31.331, "CI95_km": [-72.0725, -11.7435], "H1": "SUPPORTED", "candidateStatus": "CANDIDATE_ONLY", "operationalPromotion": False}, "33 status consistent with protocol")
    for s in ("VALIDATION_EXTENSION", "VALIDATION_COHORT_BLOCKED", "KE", "BM", "AG", T0, T1, "20260946", "H_EXT", "CANDIDATE_EXTENSION_DESCRIPTIVELY_FAVORED",
              "-31.331 km", "[-72.0725, -11.7435] km", "CANDIDATE_ONLY", "88", "6", "20", "12", "not a rescue", "No extension data were accessed"):
        check(s in T, f"33 report states: {s!r}")
    check(re.search(r"(?<![a-z])(rescue analysis is|proven|winner|optimal)(?![a-z])", T.lower()) is None, "33 report wording")
    check(P["automaticCommit"] is False and P["push"] is False, "33 no automatic commit / push")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "classification": P["classification"], "domain": P["6_extensionDomain"]["candidateRegionSet"],
                      "feasibility": feas, "structuralCeilingWindows": SC["maximumSelectableWindows"], "gate": [G["minimumWindows"], G["minimumUniqueDrifters"], G["maximumWindows"]],
                      "seed": B["seed"], "originalValidation": M45C["status"], "extensionDataAccessed": S["extensionDataAccessed"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


def P35_ok(p35):
    a = p35["cohortRule"]["accumulation"]
    return "one chronological sequence over all regions" in a and ">= 72 h apart" in a


if __name__ == "__main__":
    raise SystemExit(main())
