"""Independent fail-closed validator for STEP 52 (final research audit package). exit 0 = PASS.
Checks the 25 mandated items: current HEAD · ancestry of STEP 51 / 50 / 49 / 48 and of every other locked step and the runtime ·
STEP 47 cohort hash · STEP 46 protocol identity · the STEP 44/45 original-validation distinction (BLOCKED, never NOT_SUPPORTED, never
pooled) · primary result and interval exact against the STEP 40 record · extension result and interval exact against the STEP 50 record ·
H1 = SUPPORTED · H_EXT = NOT_SUPPORTED · original validation = BLOCKED · candidate = CANDIDATE_ONLY · operational promotion = NO · no
production claim · no pooling · independence wording (the permitted phrase present, the forbidden phrase never asserted) · no locked
artefact modified (every tracked artefact still matches its lock-commit blob and the working tree has no tracked research change) · no
unauthorized analysis recorded in STEP 52 · evidence-matrix consistency · hash-inventory consistency (every recorded SHA re-hashed here) ·
final-conclusion consistency across the manifest, summary, evidence matrix and both documents. Deterministic output (no timestamps)."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
MAN, SUMM, EV, HASHINV = (D / "step52-final-audit-manifest.json", D / "step52-final-scientific-summary.json",
                          D / "step52-final-evidence-matrix.json", D / "step52-hash-inventory.json")
PKG, TL = D / "step52-final-research-package.md", D / "step52-final-research-timeline.md"
COMMITS = {"STEP 36": "043a09b8539955868651a06e7c2c44e3c606803f", "STEP 37": "74d19f0a9661a41d63a08c56bbd3f91e9d8b312d",
           "STEP 38": "23e78f863fb092aa9e3c36e4d74d4afd4393e7f4", "STEP 40": "2b1a7baa7ef9e69d25cecbff2b09fca8700fca80",
           "STEP 41": "9a3223089099bcb09a2589cc8a4bda82fcb47ae5", "STEP 42": "bae85245e827f53ee9782201c442ea7849c04e82",
           "STEP 43": "15970d9735330fb937e86af449c1deef6763b5d1", "STEP 44": "5f8d5c38bfc9cc6a168707ae0b1b643c99ad46f9",
           "STEP 45A": "b0f0274f14ae491e34f0bcb85874056d92260f46", "STEP 45B": "7249c38d355f97c4f264d2f4d7611ce5013bd8d7",
           "STEP 45C": "fa9c0590d634a6d6f30cc8a6cd2797c94e0ae7dd", "STEP 46": "f7be980e3aa1e71c4cc96b7aca699e1d4b1faec7",
           "STEP 48": "00516cd1562d50b9380f4eef4ad66611822ae99c", "STEP 49": "fbb080af5723c32488ddf976d64f067ba12a4555",
           "STEP 50": "85824367b6fd12c066da0e191f6731a0400293ab", "STEP 51": "539205efba50cb1940c337db3f51717d9b5c14be"}
M47_SHA = "32d3085010185d8c1a5734ef53be227252220b74a2526dbadf5c72de5eee2cca"
P46_SHA = "c824b053fdeea20336f1396dc503232492ab77e1f9d5f032586b23c47d66862d"
PRIMARY_THETA, PRIMARY_CI = -31.331, [-72.0725, -11.7435]
EXT_THETA, EXT_CI = -2.272, [-9.597, 10.246]
FORBIDDEN = ["universally superior", "globally superior", "validated model", "production ready", "operationally proven",
             "causally proven", "c is false", "c is disproven", "primary result was wrong"]
FORBIDDEN_INDEPENDENCE = "fully independent in every dimension"


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
    M, S, E, HI = load(MAN), load(SUMM), load(EV), load(HASHINV)
    T = (PKG.read_text(encoding="utf-8") + "\n" + TL.read_text(encoding="utf-8")).replace("−", "-").replace("–", "-").replace("**", "").replace("*", "")
    R40 = load(D / "step40-bootstrap-result.json"); R50 = load(D / "step50-validation-extension-results.json")
    M45C = load(D / "step45c-validation-cohort-manifest.json"); L51 = load(D / "step51-cross-validation-interpretation-lock.json")
    S39 = load(D / "step39-summary.json"); EM49 = load(D / "step49-validation-extension-execution-manifest.json")
    # 1 current HEAD
    head = git("rev-parse", "HEAD").stdout.strip()
    check(M["headAtAudit"] == head, "1 current HEAD recorded")
    # 2-5 ancestry
    for name, c in COMMITS.items():
        ok = git("cat-file", "-t", c).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", c, "HEAD").returncode == 0
        check(ok, f"2-5 ancestry {name}")
        e = next((x for x in M["chain"] if x["step"] == name), None)
        check(e is not None and e["commit"] == c and e["commitAncestryVerified"] is True, f"2-5 chain entry {name}")
    check(git("merge-base", "--is-ancestor", "155995dd", "HEAD").returncode == 0 and M["runtimeAncestry"] is True, "2-5 runtime ancestry")
    for name in ("STEP 39", "STEP 47"):
        e = next((x for x in M["chain"] if x["step"] == name), None)
        check(e is not None and e["commit"] == "UNVERIFIED" and e["commitAncestryVerified"] == "UNVERIFIED" and e["note"], f"19 unverified commit honestly recorded: {name}")
    # 6-7 cohort and protocol identity
    check(sha(D / "step47-validation-extension-cohort-manifest.json") == M47_SHA, "6 STEP 47 cohort hash")
    check(M["validationExtension"]["derivationHash"] == load(D / "step47-validation-extension-cohort-manifest.json")["derivationHash"], "6 STEP 47 derivation hash carried")
    check(sha(D / "step46-validation-extension-preregistration-protocol.json") == P46_SHA, "7 STEP 46 protocol identity")
    # 8 original validation distinction
    O = M["originalValidationAttempt"]
    check(O["status"] == M45C["status"] == "VALIDATION_COHORT_BLOCKED" and O["uniqueDrifters"] == 14 and O["requiredDrifters"] == 20 and O["selectedWindows"] == 4 and O["requiredWindows"] == 6, "8 original validation figures")
    check(O["performanceExecuted"] is False and O["endpoint"] is False and O["bootstrap"] is False and O["hypothesisResult"] is False and O["reinterpretedAsNotSupported"] is False and O["pooledWithExtension"] is False, "8/15 original validation distinction preserved")
    # 9-14 results
    P, X = M["primary"], M["validationExtension"]
    check(P["Theta_72h_km"] == R40["primary"]["ThetaObserved_km"] == PRIMARY_THETA, "9 primary result exact")
    check(P["CI95_km"] == [R40["primary"]["Q0.025_km"], R40["primary"]["Q0.975_km"]] == PRIMARY_CI, "10 primary CI exact")
    check(X["Theta_72h_km"] == R50["theta"]["72h"] == EXT_THETA, "11 extension result exact")
    check(X["CI95_km"] == [R50["bootstrap"]["72h"]["Q0.025_km_rounded6"], R50["bootstrap"]["72h"]["Q0.975_km_rounded6"]] == EXT_CI, "12 extension CI exact")
    check(P["status"] == R40["successRule"]["H1"] == "SUPPORTED" and S["primary"]["H1"] == "SUPPORTED", "13 H1 = SUPPORTED")
    check(X["status"] == R50["H_EXT"] == "NOT_SUPPORTED" and S["validationExtension"]["H_EXT"] == "NOT_SUPPORTED", "14 H_EXT = NOT_SUPPORTED")
    check(X["upperBound_km"] == EXT_CI[1] and X["upperBoundBelowZero"] is False, "14 extension upper bound at or above zero")
    check(P["validWindows"] == "6 / 9" and X["execution"]["validWindows"] == "5 / 6" and X["execution"]["gate"] == "PASS", "9-14 valid window counts")
    check(X["execution"]["completed"] == EM49["runUnits"]["completed"] == 18 and X["execution"]["replayMatched"] == 18, "14 execution completeness")
    check("20260907" in P["bootstrap"]["rng"] and R40["primary"]["seed"] == 20260907 and X["bootstrap"]["seed"] == 20260946 == R50["bootstrap"]["72h"]["seed"] and P["bootstrap"]["B"] == X["bootstrap"]["B"] == 10000, "14 bootstrap configuration")
    check(P["bootstrap"]["available"] == R40["primary"]["availableReplicates"] == 9999 and P["bootstrap"]["notAvailable"] == R40["primary"]["notAvailableReplicates"] == 1, "14 primary replicate counts")
    check(X["bootstrap"]["available"] == R50["bootstrap"]["72h"]["availableReplicates"] and X["bootstrap"]["notAvailable"] == R50["bootstrap"]["72h"]["notAvailableReplicates"], "14 extension replicate counts")
    tp = M["temporalRepresentation"]
    check(tp["Theta_km"] == round(S39["secondary"]["nested"]["delta_BA_72h"]["Theta"], 3) and tp["classification"] == S39["secondary"]["temporalLabel72h_step32Rule_pooledPairs"] == "NO_CLEAR_TEMPORAL_DIFFERENCE", "9 temporal representation preserved as descriptive")
    # 15-18 status
    check(S["candidateStatus"] == "CANDIDATE_ONLY" and P["candidateStatus"] == "CANDIDATE_ONLY", "16 candidate = CANDIDATE_ONLY")
    check(S["operationalPromotion"] is False and P["operationalPromotion"] is False and M["auditIntegrity"]["L_noOperationalPromotion"] is True, "17 operational promotion = NO")
    check(S["productionClaim"] is False and P["productionClaim"] is False, "18 no production claim")
    check(S["pooling"] is False and M["auditIntegrity"]["M_noPooling"] is True and E["pooled"] is False and E["combinedStatistic"] is False, "19 no pooling")
    check(P["recomputedInStep52"] is False and X["recomputedInStep52"] is False and all(v == 0 for v in M["newAnalysisPerformed"].values()), "22 no unauthorized analysis")
    # 20 independence wording
    IS = M["independenceStatement"]
    check("geographically independent validation extension" in IS["permitted"] and FORBIDDEN_INDEPENDENCE in IS["forbidden"] and "temporal" in IS["temporalCaveat"], "20 independence statement recorded")
    check("geographically independent validation extension" in T.lower(), "20 permitted independence phrase used")
    for m in re.finditer(re.escape(FORBIDDEN_INDEPENDENCE), T.lower()):
        ctx = T.lower()[max(0, m.start() - 220):m.start()]
        check(any(t_ in ctx for t_ in ("forbidden", "not claimed", "is not claimed", "never")), "20 forbidden independence phrase asserted")
    for w in FORBIDDEN:
        for m in re.finditer(re.escape(w), T.lower()):
            ctx = T.lower()[max(0, m.start() - 220):m.start()]
            check(any(t_ in ctx for t_ in ("forbidden", "not ", "never", "none of")), f"20 forbidden language asserted: {w!r}")
    # 21 no locked artefact modified
    check(len(git("diff", "--name-only", "HEAD", "--", "docs/research", "tools/research").stdout.split()) == 0 and M["auditIntegrity"]["A_noLockedResearchFileChanged"] is True, "21 no tracked research file modified")
    for step, files in HI["inventory"].items():
        for f in files:
            if not f.get("present"):
                continue
            p = ROOT / f["path"]
            check(p.is_file() and sha(p) == f["sha256"], f"24 hash inventory entry re-hashed: {f['path']}")
            if f.get("matchesLockCommitBlob") is not None:
                check(f["matchesLockCommitBlob"] is True, f"21 artefact matches its lock-commit blob: {f['path']}")
    for c, rel in ((COMMITS["STEP 40"], "docs/research/step40-bootstrap-result.json"), (COMMITS["STEP 42"], "docs/research/step42-final-scientific-results-report.md"),
                   (COMMITS["STEP 50"], "docs/research/step50-validation-extension-results.json"), (COMMITS["STEP 51"], "docs/research/step51-cross-validation-interpretation-lock.json"),
                   (COMMITS["STEP 45C"], "docs/research/step45c-validation-cohort-manifest.json")):
        check(git("rev-parse", f"{c}:{rel}").stdout.strip() == git("hash-object", rel).stdout.strip(), f"21 locked artefact unchanged: {rel}")
    # 23 evidence matrix consistency
    check(E["PRIMARY"]["Theta_km"] == PRIMARY_THETA and E["PRIMARY"]["CI95_km"] == PRIMARY_CI and E["PRIMARY"]["result"] == "SUPPORTED" and E["PRIMARY"]["validWindows"] == "6/9", "23 evidence matrix primary")
    check(E["VALIDATION_EXTENSION"]["Theta_km"] == EXT_THETA and E["VALIDATION_EXTENSION"]["CI95_km"] == EXT_CI and E["VALIDATION_EXTENSION"]["result"] == "NOT_SUPPORTED" and E["VALIDATION_EXTENSION"]["validWindows"] == "5/6" and E["VALIDATION_EXTENSION"]["gate"] == "PASS", "23 evidence matrix extension")
    check(E["ORIGINAL_VALIDATION"] == {"status": "BLOCKED", "uniqueDrifters": 14, "requiredDrifters": 20, "selectedWindows": 4, "requiredWindows": 6, "performance": "NOT RUN"}, "23 evidence matrix original validation")
    # 24 hash inventory consistency
    check(S["auditManifestSha256"] == sha(MAN) and S["evidenceMatrixSha256"] == sha(EV) and S["hashInventorySha256"] == sha(HASHINV), "24 summary hashes")
    check(HI["headAtInventory"] == M["headAtAudit"] and set(HI["inventory"]) == {e["step"] for e in M["chain"]}, "24 inventory covers every chain step")
    # 25 final conclusion consistency
    concl = S["finalInterpretation"]
    check("Primary H1 was supported" in concl and "did not satisfy" in concl and "CANDIDATE_ONLY" in concl and "additional independent validation" in concl, "25 final interpretation wording")
    check(M["status"] == S["status"] and all(M["auditIntegrity"].values()) and M["status"] == "FINAL_RESEARCH_AUDIT_PASS", "25 audit status consistent")
    for s in ("-31.331", "[-72.0725, -11.7435]", "-2.272", "[-9.597, +10.246]", "6 / 9", "5 / 6", "CANDIDATE_ONLY", "SUPPORTED", "NOT_SUPPORTED", "BLOCKED", "NO_CLEAR_TEMPORAL_DIFFERENCE"):
        check(s in T, f"25 package states: {s!r}")
    check(len(M["openItems"]) == 2 and all(o["actionTakenInStep52"].startswith("recorded only") for o in M["openItems"]), "25 open items recorded, not acted on")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "status": M["status"],
                      "head": head, "ancestryVerifiedSteps": sum(1 for e in M["chain"] if e["commitAncestryVerified"] is True),
                      "unverifiedSteps": [e["step"] for e in M["chain"] if e["commitAncestryVerified"] == "UNVERIFIED"],
                      "primary": {"H1": P["status"], "Theta_km": P["Theta_72h_km"], "CI95_km": P["CI95_km"]},
                      "extension": {"H_EXT": X["status"], "Theta_km": X["Theta_72h_km"], "CI95_km": X["CI95_km"]},
                      "originalValidation": O["status"], "candidateStatus": S["candidateStatus"],
                      "auditChecks": len(M["auditIntegrity"]), "auditAllPass": all(M["auditIntegrity"].values())}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
