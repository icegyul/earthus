"""Independent fail-closed validator for STEP 56 (final scientific status and research stop-point lock). exit 0 = PASS.
Checks: STEP 55 / 54 / 53 / 52 ancestry (and the whole STEP 36-51 chain) · the four required files exist and the JSON parses ·
every STEP 56 status value · the primary numeric values against the STEP 40 record · the extension numeric values against the STEP 50
record · the EAC gate values against the STEP 54 cohort manifest and the STEP 55 audit · overall replication NOT_ESTABLISHED ·
candidate CANDIDATE_ONLY · operational false · production false · research_stop_point true · the status matrix internally consistent with
the status record · the interpretation lock complete · no new analysis recorded · no raw research data referenced or embedded ·
and that no locked artefact of the earlier chain was modified. Deterministic output (no timestamps)."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
STATUS_MD = D / "step56-final-scientific-status.md"
STATUS_JS = D / "step56-final-scientific-status.json"
MATRIX = D / "step56-scientific-status-matrix.json"
SELF = ROOT / "tools/research/check_step56_final_scientific_status.py"
CHAIN = {"step36": "043a09b8539955868651a06e7c2c44e3c606803f", "step37": "74d19f0a9661a41d63a08c56bbd3f91e9d8b312d",
         "step38": "23e78f863fb092aa9e3c36e4d74d4afd4393e7f4", "step40": "2b1a7baa7ef9e69d25cecbff2b09fca8700fca80",
         "step41": "9a3223089099bcb09a2589cc8a4bda82fcb47ae5", "step42": "bae85245e827f53ee9782201c442ea7849c04e82",
         "step43": "15970d9735330fb937e86af449c1deef6763b5d1", "step44": "5f8d5c38bfc9cc6a168707ae0b1b643c99ad46f9",
         "step45a": "b0f0274f14ae491e34f0bcb85874056d92260f46", "step45b": "7249c38d355f97c4f264d2f4d7611ce5013bd8d7",
         "step45c": "fa9c0590d634a6d6f30cc8a6cd2797c94e0ae7dd", "step46": "f7be980e3aa1e71c4cc96b7aca699e1d4b1faec7",
         "step48": "00516cd1562d50b9380f4eef4ad66611822ae99c", "step49": "fbb080af5723c32488ddf976d64f067ba12a4555",
         "step50": "85824367b6fd12c066da0e191f6731a0400293ab", "step51": "539205efba50cb1940c337db3f51717d9b5c14be",
         "step52": "4af3fd8fadc50243a3493efa22d57d5811c23943", "step53": "b5cfb97aed482a38e1b763c2cd15a0f105cee9e7",
         "step54": "989e8797b5a6ed7f4377463b8aa2441d29bb5cc3", "step55": "ad99963b94e8de61307e5595051991c933a131c1"}
PRIMARY_THETA, PRIMARY_CI = -31.331, [-72.0725, -11.7435]
EXT_THETA, EXT_CI = -2.272, [-9.597, 10.246]


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
    # required files exist and parse
    for p in (STATUS_MD, STATUS_JS, MATRIX, SELF):
        check(p.is_file(), f"required file exists: {p.name}")
    try:
        S, MX = load(STATUS_JS), load(MATRIX)
    except Exception as exc:
        print(json.dumps({"result": "FAIL", "failures": [f"JSON parse: {exc}"]}, ensure_ascii=False, indent=2))
        return 1
    T = STATUS_MD.read_text(encoding="utf-8").replace("−", "-").replace("–", "-")
    R40 = load(D / "step40-bootstrap-result.json"); R50 = load(D / "step50-validation-extension-results.json")
    A55 = load(D / "step55-validation-block-audit.json"); C54 = load(D / "step54-eac-cohort-manifest.json")
    S39 = load(D / "step39-summary.json"); M45C = load(D / "step45c-validation-cohort-manifest.json")
    # ancestry
    for k, c in CHAIN.items():
        ok = git("cat-file", "-t", c).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", c, "HEAD").returncode == 0
        check(ok, f"ancestry {k}")
        check(S["ancestry"][k]["commit"] == c and S["ancestry"][k]["ancestor"] is True, f"ancestry recorded {k}")
    check(git("merge-base", "--is-ancestor", "155995dd", "HEAD").returncode == 0, "runtime ancestry")
    check(len(git("diff", "--name-only", "HEAD", "--", "docs/research", "tools/research").stdout.split()) == 0, "no tracked research file modified")
    for c, rel in ((CHAIN["step55"], "docs/research/step55-validation-block-audit.json"),
                   (CHAIN["step54"], "docs/research/step54-eac-cohort-manifest.json"),
                   (CHAIN["step50"], "docs/research/step50-validation-extension-results.json"),
                   (CHAIN["step40"], "docs/research/step40-bootstrap-result.json"),
                   (CHAIN["step42"], "docs/research/step42-final-scientific-results-report.md")):
        check(git("rev-parse", f"{c}:{rel}").stdout.strip() == git("hash-object", rel).stdout.strip(), f"locked artefact unchanged: {rel}")
    # STEP 56 status values
    check(S["step"] == 56 and S["status"] == "FINAL_SCIENTIFIC_STOP_POINT", "STEP 56 status value")
    # primary numeric values
    P = S["primary"]
    check(P["status"] == R40["successRule"]["H1"] == "SUPPORTED", "primary status SUPPORTED")
    check(P["theta_km"] == R40["primary"]["ThetaObserved_km"] == PRIMARY_THETA, "primary theta exact")
    check(P["ci95_km"] == [R40["primary"]["Q0.025_km"], R40["primary"]["Q0.975_km"]] == PRIMARY_CI, "primary CI exact")
    check(P["valid_windows"] == S39["primary"]["windowsWithValidPair"] == 6 and P["registered_windows"] == S39["n_windows"] == 9, "primary window counts")
    check(P["bootstrap"]["B"] == R40["primary"]["B_requested"] == 10000 and P["bootstrap"]["seed"] == R40["primary"]["seed"] == 20260907 and P["bootstrap"]["available"] == R40["primary"]["availableReplicates"] == 9999 and P["bootstrap"]["not_available"] == R40["primary"]["notAvailableReplicates"] == 1, "primary bootstrap record")
    check(P["recomputed_in_step56"] is False, "primary not recomputed")
    # extension numeric values
    E = S["geographic_extension"]
    check(E["status"] == R50["H_EXT"] == "NOT_SUPPORTED", "extension status NOT_SUPPORTED")
    check(E["theta_km"] == R50["theta"]["72h"] == EXT_THETA, "extension theta exact")
    check(E["ci95_km"] == [R50["bootstrap"]["72h"]["Q0.025_km_rounded6"], R50["bootstrap"]["72h"]["Q0.975_km_rounded6"]] == EXT_CI, "extension CI exact")
    check(E["valid_windows"] == R50["validWindows"]["72h"] == 5 and E["registered_windows"] == 6, "extension window counts")
    check(E["bootstrap"]["seed"] == 20260946 and E["bootstrap"]["B"] == 10000 and E["recomputed_in_step56"] is False, "extension bootstrap record")
    # EAC gate values
    X = S["eac"]
    check(X["status"] == C54["status"] == "VALIDATION_BLOCKED", "EAC status VALIDATION_BLOCKED")
    check(X["block_reason"] == "UNIQUE_DRIFTER_GATE_FAILED" and X["block_reason"] in A55["block_reason"], "EAC block reason")
    check(X["target_unique_drifters"] == 20 == C54["gate"]["minimumUniqueDrifters"] and X["actual_unique_drifters"] == 12 == C54["cohort"]["uniqueDrifters"], "EAC drifter counts")
    check(X["target_windows"] == 6 == C54["gate"]["targetWindows"] and X["registered_windows"] == 5 == C54["cohort"]["windows"] and X["minimum_valid_windows"] == 4, "EAC window counts")
    check(X["window_gate"] == "PASS" and X["unique_drifter_gate"] == "FAIL" and X["actual_unique_drifters"] < X["target_unique_drifters"], "EAC gate outcome")
    check(X["domain"]["latitude"] == [-40.0, -25.0] and X["domain"]["longitude"] == [150.0, 160.0], "EAC domain")
    check(X["temporal"] == ["2010-01-01T12:00:00Z", "2015-12-31T12:00:00Z"] and X["candidate_starts_scanned"] == C54["candidateWindowsScanned"] == 2191, "EAC temporal domain and scan")
    check(X["performance_executed"] is False and X["endpoint_executed"] is False and X["bootstrap_executed"] is False and X["scientific_result"] == "NOT GENERATED" and X["performance_inference"] == "NONE", "EAC produced no performance result")
    O = S["original_validation_attempt"]
    check(O["status"] == M45C["status"] == "VALIDATION_COHORT_BLOCKED" and O["unique_drifters"] == 14 and O["performance_executed"] is False, "original validation preserved as blocked")
    # overall and candidate
    # STEP 56 records the schema-mandated form "NOT_ESTABLISHED"; STEP 55 recorded the same state as
    # "REPLICATION_NOT_ESTABLISHED". Equivalence is checked, not literal string equality.
    check(S["overall_replication"] == "NOT_ESTABLISHED" and A55["overall_replication_status"] in ("NOT_ESTABLISHED", "REPLICATION_NOT_ESTABLISHED"), "overall replication NOT_ESTABLISHED (equivalent to the STEP 55 record)")
    check(S["candidate_c_status"] == "CANDIDATE_ONLY" == A55["candidate_status"], "candidate CANDIDATE_ONLY")
    check(S["operational_promotion"] is False, "operational promotion false")
    check(S["production"] is False, "production false")
    check(S["research_stop_point"] is True and S["stop_point"]["locked"] is True, "research_stop_point true")
    # interpretation lock and stop-point policy
    check(len(S["interpretation_lock"]) == 10, "interpretation lock has all ten points")
    SP = S["stop_point"]
    check(len(SP["not_added_after_step56"]) >= 8 and len(SP["future_validation_requires"]) == 5 and SP["existing_results_extended_or_modified"] is False, "stop-point policy recorded")
    PD = S["product_decision"]
    check(PD["candidate_c"] == "CANDIDATE_ONLY" and PD["auto_selected_as_production_source"] is False and "!=" in PD["principle"], "product decision lock")
    check(all(v == 0 for v in S["no_new_analysis"].values()), "no new analysis in STEP 56")
    # matrix consistency
    rows = {r["ITEM"]: r for r in MX["matrix"]}
    check(set(rows) == {"Primary", "Geographic Extension", "EAC", "Overall Replication", "Candidate C", "Operational", "Production"}, "matrix covers all seven items")
    check(rows["Primary"]["STATUS"] == "SUPPORTED" and rows["Primary"]["THETA_KM"] == PRIMARY_THETA and rows["Primary"]["CI95_KM"] == PRIMARY_CI and rows["Primary"]["PERFORMANCE_EVALUATED"] is True, "matrix primary consistent")
    check(rows["Geographic Extension"]["STATUS"] == "NOT_SUPPORTED" and rows["Geographic Extension"]["THETA_KM"] == EXT_THETA and rows["Geographic Extension"]["CI95_KM"] == EXT_CI, "matrix extension consistent")
    check(rows["EAC"]["STATUS"] == "VALIDATION_BLOCKED" and rows["EAC"]["THETA_KM"] is None and rows["EAC"]["CI95_KM"] is None and rows["EAC"]["PERFORMANCE_EVALUATED"] is False, "matrix EAC carries no performance value")
    check(rows["Overall Replication"]["STATUS"] == "NOT_ESTABLISHED" and rows["Candidate C"]["STATUS"] == "CANDIDATE_ONLY" and rows["Operational"]["STATUS"] == "NO" and rows["Production"]["STATUS"] == "NO", "matrix overall rows")
    check(MX["pooled"] is False and MX["combined_effect_estimate"] is False and MX["blocked_conflated_with_not_supported"] is False and MX["research_stop_point"] is True, "matrix separation flags")
    # no raw research data referenced or embedded
    blob = json.dumps(S) + json.dumps(MX)
    check("data/research/" not in blob, "no raw research data path embedded in the status records")
    check(not re.search(r"\.(nc|csv)\b", blob), "no raw data file referenced in the status records")
    # report content
    for s in ("FINAL_SCIENTIFIC_STOP_POINT", "-31.331", "[-72.0725, -11.7435]", "-2.272", "[-9.597, +10.246]",
              "VALIDATION_BLOCKED", "UNIQUE_DRIFTER_GATE_FAILED", "12", "20", "NOT_ESTABLISHED", "CANDIDATE_ONLY",
              "RESEARCH STOP-POINT = LOCKED", "6 / 9", "5 / 6", "2191"):
        check(s in T, f"status document states: {s!r}")
    for w in ("universally superior", "globally validated", "production ready", "operationally proven"):
        for m in re.finditer(re.escape(w), T.lower()):
            ctx = T.lower()[max(0, m.start() - 200):m.start()]
            check("not" in ctx or "never" in ctx, f"forbidden claim asserted: {w!r}")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40],
                      "status": S["status"],
                      "primary": {"status": P["status"], "theta_km": P["theta_km"], "ci95_km": P["ci95_km"], "valid_windows": f"{P['valid_windows']}/{P['registered_windows']}"},
                      "extension": {"status": E["status"], "theta_km": E["theta_km"], "ci95_km": E["ci95_km"], "valid_windows": f"{E['valid_windows']}/{E['registered_windows']}"},
                      "eac": {"status": X["status"], "reason": X["block_reason"], "unique_drifters": f"{X['actual_unique_drifters']}/{X['target_unique_drifters']}"},
                      "overall": S["overall_replication"], "candidate": S["candidate_c_status"],
                      "operational": S["operational_promotion"], "production": S["production"],
                      "research_stop_point": S["research_stop_point"], "ancestryChecked": len(CHAIN)}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
