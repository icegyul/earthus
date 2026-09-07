"""Independent fail-closed validator for STEP 51 (cross-validation interpretation lock). exit 0 = PASS.
Checks the 25 mandated items: ancestry of every locked step and the runtime · STEP 42 primary-report identity · STEP 47 cohort hash ·
STEP 48 freeze reference · STEP 49 execution reference · STEP 50 result reference · H1 = SUPPORTED and H_EXT = NOT_SUPPORTED, each read
back from its own frozen record · exact primary Theta and interval · exact extension Theta and interval · valid window counts on both
sides · bootstrap seed and B · primary/extension separation with no pooling, combined cohort, combined bootstrap, meta-analysis or global
claim · no new analysis of any kind in STEP 51 · no operational promotion · candidate remains CANDIDATE_ONLY · independence wording
correctness (the permitted phrase present, every forbidden phrase absent from both reports) · the original validation attempt preserved as
BLOCKED and never conflated with NOT_SUPPORTED · no modification of any prior locked artefact · deterministic report content ·
interpretation safety (no overstatement of failure or of success). Deterministic output (no timestamps)."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
LOCK, SUMM = D / "step51-cross-validation-interpretation-lock.json", D / "step51-independent-validation-final-summary.json"
REP1, REP2 = D / "step51-independent-validation-final-report.md", D / "step51-cross-validation-interpretation-report.md"
COMMITS = {"step36": "043a09b8539955868651a06e7c2c44e3c606803f", "step37": "74d19f0a9661a41d63a08c56bbd3f91e9d8b312d",
           "step38": "23e78f863fb092aa9e3c36e4d74d4afd4393e7f4", "step40": "2b1a7baa7ef9e69d25cecbff2b09fca8700fca80",
           "step41": "9a3223089099bcb09a2589cc8a4bda82fcb47ae5", "step42": "bae85245e827f53ee9782201c442ea7849c04e82",
           "step43": "15970d9735330fb937e86af449c1deef6763b5d1", "step44": "5f8d5c38bfc9cc6a168707ae0b1b643c99ad46f9",
           "step45c": "fa9c0590d634a6d6f30cc8a6cd2797c94e0ae7dd", "step46": "f7be980e3aa1e71c4cc96b7aca699e1d4b1faec7",
           "step48": "00516cd1562d50b9380f4eef4ad66611822ae99c", "step49": "fbb080af5723c32488ddf976d64f067ba12a4555",
           "step50": "85824367b6fd12c066da0e191f6731a0400293ab"}
STEP42_REPORT_SHA = "c490669413a83bee73a2a33733432073f3e898ee52ce47722b4b365a5da5f1f0"
M47_SHA = "32d3085010185d8c1a5734ef53be227252220b74a2526dbadf5c72de5eee2cca"
F48_SHA = "8d50c2aebf32cae57e8b82e318eded07e29b5546dd29a58ea8c8b33a17da8719"
PRIMARY_THETA, PRIMARY_CI = -31.331, [-72.0725, -11.7435]
EXT_THETA, EXT_CI = -2.272, [-9.597, 10.246]
FAIL_OVERSTATEMENT = ["is disproven", "c is false", "never works", "scientifically invalid", "universally ineffective", "primary result was wrong"]
SUCCESS_OVERSTATEMENT = ["independently validated", "generally superior", "globally superior", "production-ready", "operationally proven", "robust across regions", "universally better"]
FORBIDDEN_INDEPENDENCE = ["fully independent in every dimension", "temporally independent from the original validation attempt"]


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
    L, S = load(LOCK), load(SUMM)
    T1 = REP1.read_text(encoding="utf-8").replace("−", "-").replace("–", "-")
    T2 = REP2.read_text(encoding="utf-8").replace("−", "-").replace("–", "-")
    both = (T1 + "\n" + T2).replace("**", "").replace("*", "")   # markdown emphasis removed so wording-context checks see the plain sentence
    R40 = load(D / "step40-bootstrap-result.json"); R50 = load(D / "step50-validation-extension-results.json")
    M45C = load(D / "step45c-validation-cohort-manifest.json"); EM49 = load(D / "step49-validation-extension-execution-manifest.json")
    # 1 ancestry
    for k, c in {**COMMITS, "runtime": "155995dd"}.items():
        check(git("cat-file", "-t", c).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", c, "HEAD").returncode == 0, f"1 ancestry {k}")
        check(L["ancestry"][k].startswith(c), f"1 ancestry field {k}")
    # 2-6 frozen references
    check(sha(D / "step42-final-scientific-results-report.md") == STEP42_REPORT_SHA == L["frozenInputs"]["docs/research/step42-final-scientific-results-report.md"], "2 STEP 42 primary report identity")
    check(sha(D / "step47-validation-extension-cohort-manifest.json") == M47_SHA == L["frozenInputs"]["docs/research/step47-validation-extension-cohort-manifest.json"], "3 STEP 47 cohort hash")
    check(sha(D / "step48-validation-data-freeze-manifest.json") == F48_SHA == L["frozenInputs"]["docs/research/step48-validation-data-freeze-manifest.json"], "4 STEP 48 freeze reference")
    check(sha(D / "step49-validation-extension-execution-manifest.json") == L["frozenInputs"]["docs/research/step49-validation-extension-execution-manifest.json"], "5 STEP 49 execution reference")
    check(sha(D / "step50-validation-extension-results.json") == L["frozenInputs"]["docs/research/step50-validation-extension-results.json"], "6 STEP 50 result reference")
    check(git("diff", "--quiet", "HEAD", "--", "docs/research", "tools/research").returncode == 0, "23 no tracked research file modified")
    for c, rel in ((COMMITS["step50"], "docs/research/step50-validation-extension-results.json"), (COMMITS["step49"], "docs/research/step49-validation-extension-execution-manifest.json"),
                   (COMMITS["step42"], "docs/research/step42-final-scientific-results-report.md"), (COMMITS["step40"], "docs/research/step40-bootstrap-result.json"),
                   (COMMITS["step45c"], "docs/research/step45c-validation-cohort-manifest.json")):
        check(git("rev-parse", f"{c}:{rel}").stdout.strip() == git("hash-object", rel).stdout.strip(), f"23 prior locked artefact unchanged: {rel}")
    # 7-12 the two results, read back from their own records
    P, E = L["primary"], L["validationExtension"]
    check(P["status"] == R40["successRule"]["H1"] == "SUPPORTED" and S["evidenceTable"]["primary"]["status"] == "SUPPORTED", "7 H1 = SUPPORTED")
    check(E["status"] == R50["H_EXT"] == "NOT_SUPPORTED" and S["evidenceTable"]["validationExtension"]["status"] == "NOT_SUPPORTED", "8 H_EXT = NOT_SUPPORTED")
    check(P["Theta_km"] == R40["primary"]["ThetaObserved_km"] == PRIMARY_THETA, "9 primary Theta exact")
    check(P["CI95_km"] == [R40["primary"]["Q0.025_km"], R40["primary"]["Q0.975_km"]] == PRIMARY_CI, "10 primary CI exact")
    check(E["Theta_km"] == R50["theta"]["72h"] == EXT_THETA, "11 extension Theta exact")
    check(E["CI95_km"] == [R50["bootstrap"]["72h"]["Q0.025_km_rounded6"], R50["bootstrap"]["72h"]["Q0.975_km_rounded6"]] == EXT_CI, "12 extension CI exact")
    check(E["upperBound_km"] == EXT_CI[1] and E["upperBoundBelowZero"] is False, "12 upper bound recorded and not below zero")
    # 13 valid window counts
    check(P["cohortWindows"] == 9 and P["validWindows"] == 6 and E["cohortWindows"] == 6 and E["validWindows"] == 5 and E["notAvailableWindows"] == 1 and E["registeredDrifters"] == 25, "13 valid window counts")
    check(E["validWindows"] == R50["validWindows"]["72h"] and E["gate"] == "PASS", "13 extension valid windows match the STEP 50 record")
    check(E["runUnits"] == {"planned": 18, "completed": 18, "replayMatched": 18} and EM49["runUnits"]["completed"] == 18, "13 execution completeness carried forward")
    # 14-15 bootstrap identity
    check(E["seed"] == 20260946 == R50["bootstrap"]["72h"]["seed"] and P["seed"] == R40["primary"]["seed"] == 20260907, "14 bootstrap seeds")
    check(E["B"] == 10000 == R50["bootstrap"]["72h"]["B_requested"] and P["B"] == R40["primary"]["B_requested"] == 10000, "15 bootstrap B")
    check(E["availableReplicates"] == R50["bootstrap"]["72h"]["availableReplicates"] and E["notAvailableReplicates"] == R50["bootstrap"]["72h"]["notAvailableReplicates"], "15 replicate counts carried forward")
    for h in ("24h", "48h", "72h"):
        check(E["byHorizon"][h]["Theta_km"] == R50["theta"][h] and E["byHorizon"][h]["CI95_km"] == [R50["bootstrap"][h]["Q0.025_km_rounded6"], R50["bootstrap"][h]["Q0.975_km_rounded6"]], f"15 horizon carried forward: {h}")
    check(E["decisionHorizon"] == "72h" and E["secondaryHorizonsUsedForDecision"] is False, "15 decision used the 72 h criterion only")
    # 16-17 separation, no pooling
    sep = L["separation"]
    check(all(sep[k] is False for k in ("primaryRecomputed", "extensionRecomputed", "pooled", "combinedCohort", "combinedBootstrap", "metaAnalysis", "overallGlobalClaim", "blockedAndNotSupportedConflated")), "16-17 separation and no pooling")
    check(P["recomputedInStep51"] is False and E["recomputedInStep51"] is False and S["pooling"] is False and S["metaAnalysis"] is False, "17 neither result recomputed; no pooling")
    # 18 no new analysis
    N = L["newAnalysisPerformed"]
    check(all(v == 0 for v in N.values()) and S["newExperimentInStep51"] is False, "18 no new analysis of any kind")
    # 19-20 status
    C = L["candidateStatus"]
    check(C["final"] == "CANDIDATE_ONLY" == S["candidateStatus"] and C["operationalPromotion"] is False and C["productionClaim"] is False and S["operationalPromotion"] is False and S["productionClaim"] is False, "19-20 candidate remains CANDIDATE_ONLY; no promotion")
    for w in ("PROMOTED", "PRODUCTION", "OPERATIONAL", "DEPLOYED"):
        check(w in C["forbiddenStatuses"], f"20 forbidden status listed: {w}")
    for w in ("promoted", "deployed", "production-ready", "operational model"):
        for m in re.finditer(re.escape(w), both.lower()):
            ctx = both.lower()[max(0, m.start() - 220):m.start()]
            check(any(t_ in ctx for t_ in ("forbidden", "not ", "never", "none of the following", "may be written", "is not")), f"20 promotion wording asserted: {w!r}")
    check("operational promotion no" in both.lower() and "candidate_only" in both.lower(), "20 reports state CANDIDATE_ONLY and no operational promotion")
    # 21 independence wording
    IL = L["independenceLanguage"]
    check(IL["permitted"] == "geographically independent validation extension" and IL["permitted"] in T1.lower() and IL["permitted"] in T2.lower(), "21 permitted independence phrase present in both reports")
    for f in FORBIDDEN_INDEPENDENCE:
        check(f in IL["forbidden"], f"21 forbidden phrase declared: {f!r}")
        for m in re.finditer(re.escape(f), both.lower()):
            ctx = both.lower()[max(0, m.start() - 220):m.start()]
            check(any(t_ in ctx for t_ in ("forbidden", "not described as", "no temporal independence", "is claimed", "never")), f"21 forbidden independence phrase asserted: {f!r}")
    check(len(IL["basis"]) >= 6 and "share the same validation period" in IL["reason"], "21 independence basis and reason recorded")
    # 22 original validation preserved
    O = L["originalValidationAttempt"]
    check(O["status"] == M45C["status"] == "VALIDATION_COHORT_BLOCKED" and O["gate"] == "FAILED" and O["uniqueDrifters"] == 14 and O["performanceExecuted"] is False and O["bootstrap"] is False and O["pooledWithExtension"] is False, "22 original validation preserved as BLOCKED")
    check(S["originalValidation"] == "BLOCKED / PRESERVED" and "never reported as NOT_SUPPORTED" in O["label"], "22 BLOCKED never conflated with NOT_SUPPORTED")
    # 24-25 report content and interpretation safety
    I = L["interpretation"]
    norm = lambda s: re.sub(r"\s+", " ", s.replace("**", "")).strip()
    n1 = norm(T1)
    check(norm(I["coreStatement_en"]) in n1 and norm(I["coreStatement_ko"]) in n1, "24 core statement present in the final report")
    for s in ("-31.331", "[-72.0725, -11.7435]", "-2.272", "[-9.597, +10.246]", "CANDIDATE_ONLY", "NOT_SUPPORTED", "SUPPORTED", "BLOCKED", "5 / 6", "6 / 9"):
        check(s in T1, f"24 final report states: {s!r}")
    check(I["whyExtensionDidNotMeetCriterion"]["postHocCauseAttribution"] is False and len(I["whyExtensionDidNotMeetCriterion"]["causesNotClaimed"]) >= 8, "25 no post-hoc cause attribution")
    low = both.lower()
    for w in FAIL_OVERSTATEMENT:
        idx = [m.start() for m in re.finditer(re.escape(w), low)]
        for i in idx:                       # allowed only inside an explicit prohibition list
            ctx = low[max(0, i - 200):i]
            check("forbidden" in ctx or "may be written" in ctx or "do not" in ctx or "does not support" in ctx, f"25 failure overstatement asserted: {w!r}")
    for w in SUCCESS_OVERSTATEMENT:
        idx = [m.start() for m in re.finditer(re.escape(w), low)]
        for i in idx:
            ctx = low[max(0, i - 200):i]
            check("forbidden" in ctx or "may be written" in ctx or "none of the following" in ctx, f"25 success overstatement asserted: {w!r}")
    check(L["status"] == "INTERPRETATION_LOCKED" and L["scope"].startswith("interpretation only") and S["status"] == "PASS", "24 lock status")
    check(S["interpretationLockSha256"] == sha(LOCK) and S["replication"] == "NOT SUPPORTED" and S["primaryResult"] == "UNCHANGED", "24 summary consistency")
    check(len(L["limitations"]) >= 9, "25 limitations recorded")
    check(L["nextResearchStatus"]["startedInStep51"] is False and L["nextResearchStatus"]["furtherWorkRequiresNewPreregistration"] is True and L["nextResearchStatus"]["priorResultsModified"] is False, "25 next research status")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40],
                      "H1": P["status"], "H_EXT": E["status"],
                      "primary": {"Theta_km": P["Theta_km"], "CI95_km": P["CI95_km"], "validWindows": f"{P['validWindows']} / {P['cohortWindows']}"},
                      "extension": {"Theta_km": E["Theta_km"], "CI95_km": E["CI95_km"], "validWindows": f"{E['validWindows']} / {E['cohortWindows']}", "gate": E["gate"]},
                      "candidateStatus": C["final"], "operationalPromotion": False,
                      "originalValidation": O["status"], "newAnalysis": sum(N.values())}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
