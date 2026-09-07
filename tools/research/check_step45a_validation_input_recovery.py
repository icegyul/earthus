"""Independent fail-closed validator for STEP 45A (validation cohort input recovery; metadata/provenance only). exit 0 = PASS.
Re-derives, from the frozen records themselves, the classification recorded in docs/research/step45a-validation-input-recovery.json:
STEP 44 / 43 / 42 / 41 / 36 ancestry and runtime · STEP 35 eligibility SHA-256 exactly as recorded in the STEP 36 manifest, untracked and
unmodified · every candidate source is a STEP 35/36 artefact or an artefact referenced by the STEP 35 protocol inputs, present at its exact
SHA · which sources carry per-window drifter identities and for which windows (recomputed) · that no identity-carrying window is a KE window
at or after the validation t0, hence no usable source · that the STEP 35 eligibility file is count-only and is rejected as an accumulation
input · multi-source classification (STEP 36 is the deterministic extension of STEP 35; not conflicting) · no scientific / validation data
access, no model or trajectory execution, no performance calculation, no cohort derivation (no STEP 45 cohort manifest exists) ·
record / report consistency. Deterministic output (no timestamps)."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
REC, REP = D / "step45a-validation-input-recovery.json", D / "step45a-validation-input-recovery-report.md"
T0 = "2010-11-18T12:00:00Z"
ANC = {"step36": "043a09b8539955868651a06e7c2c44e3c606803f", "step41": "9a3223089099bcb09a2589cc8a4bda82fcb47ae5", "step42": "bae85245e827f53ee9782201c442ea7849c04e82",
       "step43": "15970d9735330fb937e86af449c1deef6763b5d1", "step44": "5f8d5c38bfc9cc6a168707ae0b1b643c99ad46f9"}
ELIG = "docs/research/step35-window-eligibility.json"
FORBIDDEN_DIR_TOKENS = ("data/research", "trajector", "forcing", "velocity", "noaa-gdp", "observations")


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True)


def identity_windows(J):
    """Windows in a record that carry a list of drifter identities, with their start instants."""
    wins = []
    if isinstance(J.get("windows"), list):
        wins += [w for w in J["windows"] if isinstance(w, dict)]
    if isinstance(J.get("regions"), dict):
        for blk in J["regions"].values():
            if isinstance(blk, dict) and isinstance(blk.get("selected"), list):
                wins += [w for w in blk["selected"] if isinstance(w, dict)]
    if isinstance(J.get("rows"), list):
        wins += [r for r in J["rows"] if isinstance(r, dict)]
    out = []
    for w in wins:
        fields = [k for k in w if isinstance(w.get(k), list) and k in ("drifterIds", "newDrifterIds", "eligibleDrifterIds") and w[k]]
        if fields:
            out.append((str(w.get("start") or (str(w.get("date", "")) + "T12:00:00Z")), w.get("region"), fields))
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    R = load(REC); T = REP.read_text(encoding="utf-8")
    # 1-2 ancestry
    for k, c in {**ANC, "runtime": "155995dd"}.items():
        check(git("cat-file", "-t", c).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", c, "HEAD").returncode == 0, f"1-2 ancestry {k}")
        check(R["ancestry"][k].startswith(c), f"1-2 ancestry field {k}")
    check(R["step44ProtocolSha256"] == sha(D / "step44-validation-preregistration-protocol.json") == "6a2e2f04f7948e4ff3ac5dec065fc93a6072ce112bb2e072ce77c2606056de9f", "1 STEP 44 protocol identity")
    # 3 STEP 35 eligibility SHA, from the STEP 36 manifest, untracked and unmodified
    exp = load(D / "step36-cohort-extension-manifest.json")["inherited"]["step35EligibilitySha256"]
    e = R["step35EligibilitySha256"]
    check(sha(ROOT / ELIG) == exp == e["expected"] == e["computed"] and e["match"] is True, "3 STEP 35 eligibility SHA matches the STEP 36 manifest")
    check(git("ls-files", ELIG).stdout.strip() == "" and e["tracked"] is False, "3 STEP 35 eligibility remains untracked (not staged, not committed)")
    check(git("diff", "--quiet", "HEAD", "--", "docs/research", "tools/research").returncode == 0, "3 no tracked research file modified")
    # 4-8 no access / no execution / no derivation
    n = R["noScientificDataAccess"]
    check(all(n[k] == 0 for k in ("hycom", "glorys", "ww3", "ncep", "velocity", "forcing", "observations", "trajectories", "validationResults", "modelRun", "bootstrapRun")) and n["performanceCalculated"] is False and n["cohortDerived"] is False, "4-8 no scientific/validation data access, no execution, no performance, no derivation")
    ss = R["searchScope"]
    check(ss["scientificDataDirectoriesSearched"] == [] and ss["rawDataInspected"] == 0 and ss["observationFilesInspected"] == 0 and ss["directoriesSearched"] == ["docs/research"], "4-5 search scope restricted to research metadata")
    check(not (D.parent.parent / "docs/research/step45-validation-cohort-manifest.json").exists() and not list(D.glob("step45-validation-cohort*.json")), "8 no STEP 45 validation cohort manifest was created")
    # 9-10 candidate sources are STEP 35/36 or SHA-bound references, at exact SHA
    P35 = load(D / "step35-phase-a-protocol.json"); refs = set(P35["inputs"].values()) | set(load(D / "step36-cohort-extension-manifest.json")["inherited"].values())
    for s in R["candidateSources"]:
        rel = s["path"]
        check(rel.startswith("docs/research/"), f"9 candidate source is research metadata: {rel}")
        check(not any(t in rel.lower() for t in FORBIDDEN_DIR_TOKENS), f"9 candidate source is not scientific data: {rel}")
        check(("step35" in rel or "step36" in rel) or s["sha256"] in refs, f"9 source is STEP 35/36 or referenced by a frozen manifest: {rel}")
        check(s["present"] and sha(ROOT / rel) == s["sha256"], f"10 exact SHA: {rel}")
        check(s["expectedSha256"] is None or s["shaMatchesFrozenReference"] is True, f"10 SHA matches frozen reference: {rel}")
    # 11-12 per-window identity availability recomputed; count-only rejected
    for s in R["candidateSources"]:
        iw = identity_windows(load(ROOT / s["path"]))
        ke_after = [x for x in iw if x[1] == "KE" and x[0] >= T0]
        check(bool(iw) == bool(s["carriesPerWindowIdentities"]), f"11 identity-carrying classification: {s['path']}")
        check(len(ke_after) == s["keWindowsWithIdentitiesAtOrAfterT0"] == 0 and s["usable"] is False, f"11 no usable identities for candidate validation windows: {s['path']}")
        if not iw:
            check(s["reason"] == "AGGREGATE_COUNTS_ONLY_REJECTED", f"12 aggregate-count-only source rejected: {s['path']}")
    E = load(ROOT / ELIG)
    check(not any("drifter" in k.lower() for k in E["windows"][0]) and R["findings"]["step35EligibilityIsCountOnly"] is True and "auditEligibleCount" in R["findings"]["step35EligibilityFields"], "12 STEP 35 eligibility is count-only (no identities)")
    check(R["findings"]["authoritativePerWindowIdentitySourceForValidationWindows"] is False and R["status"] == "VALIDATION_COHORT_INPUT_MISSING", "12 status VALIDATION_COHORT_INPUT_MISSING")
    check(R["findings"]["candidateValidationWindows"]["identitiesAvailable"] == 0 and R["findings"]["candidateValidationWindows"]["overlapWithStep32SelectedWindows"] == [], "11 candidate validation windows carry no identities and are not STEP 32 selected windows")
    # 13-14 multi-source classification recomputed
    A = load(D / "step35-cohort-manifest.json")["windows"]; B = load(D / "step36-cohort-extension-manifest.json")["windows"]
    prefix = all(a["start"] == b["start"] and a["region"] == b["region"] and a["drifterIds"] == b["drifterIds"] for a, b in zip(A, B[: len(A)]))
    cls = R["multipleSourceClassification"]
    check(prefix and len(B) == len(A) + 1 and cls["classification"] == "B_COMPLEMENTARY_DETERMINISTIC" and cls["prefixIdentical"] is True, "13-14 sources complementary and deterministic, not conflicting")
    check(R["consequence"]["validationCohortDerivationRemainsBlocked"] is True and R["consequence"]["cohortFabricated"] is False and R["consequence"]["step44RuleRelaxed"] is False and R["consequence"]["countsConvertedToIdentities"] is False and R["consequence"]["manualCohortSelection"] is False and R["automaticCommit"] is False and R["push"] is False, "14 consequences recorded; no relaxation, fabrication or manual selection")
    check(R["inputAuthorizationOnly"] is False and "22c0ecff" in R["inputAuthorizationNote"] and "NOT accessed" in R["inputAuthorizationNote"], "14 authorisation-only case correctly excluded and the sole known identity source named")
    # 15 report consistency
    for s in ("VALIDATION_COHORT_INPUT_MISSING", "d01d06a3430def6ea77a814bb4379a9b45ca058713fa0901c9c30b035fbb635b", "count-only", "22c0ecff", "no cohort was fabricated",
              "docs/research/step35-cohort-manifest.json", "docs/research/step36-cohort-extension-manifest.json", "B_COMPLEMENTARY_DETERMINISTIC", "remains blocked"):
        check(s in T, f"15 report states: {s!r}")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "status": R["status"], "usableSources": sum(1 for s in R["candidateSources"] if s["usable"]),
                      "identityCarryingSources": len(R["findings"]["sourcesCarryingPerWindowIdentities"]), "sourcesProbed": len(R["candidateSources"]),
                      "classification": cls["classification"], "cohortDerived": R["noScientificDataAccess"]["cohortDerived"], "dataAccessCount": 0}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
