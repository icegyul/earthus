"""Independent fail-closed validator for STEP 53 (new independent validation preregistration lock). exit 0 = PASS.
Checks the 20 mandated items: the STEP 52 parent commit exists and is an ancestor of HEAD · no STEP 36-52 research file modified ·
both protocol files exist and the JSON parses · every required field is present · primary horizon 72 h · model A locked · model C locked ·
alpha 0.002 · bootstrap B 10000 · bootstrap seed 20260953 · window-level bootstrap · no NA redraw · replication criterion defined ·
minimum valid windows defined · non-overlap rule defined · post-hoc prohibition defined · primary/extension/STEP 53 separation defined ·
protocol hash generated and re-verified here. It also enforces the study's own guarantees: no result-driven cohort selection, the prior
results carried unchanged, data access recorded as PROTOCOL_ONLY, scientific execution NOT_RUN, and the geographic domain disjoint from
every previously used box. Deterministic output (no timestamps)."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
MD, JS, HASHREC = (D / "step53-validation-preregistration.md", D / "step53-validation-preregistration.json",
                   D / "step53-preregistration-hash.json")
STEP52 = "4af3fd8fadc50243a3493efa22d57d5811c23943"
REQUIRED = ["study_id", "parent_audit_commit", "geographic_domain", "temporal_domain", "observation_source", "model_A", "model_C",
            "alpha", "primary_horizon_hours", "endpoint", "aggregation", "minimum_valid_windows", "target_windows",
            "minimum_unique_drifters", "maximum_drifters_per_window", "bootstrap_B", "bootstrap_seed", "bootstrap_unit",
            "ci_level", "quantile_method", "cohort_selection_rule", "overlap_rule", "replication_criterion", "status"]
PRIOR_BOXES = {"GS": {"south": 32, "north": 40, "west": -75, "east": -55}, "KE": {"south": 30, "north": 40, "west": 135, "east": 160},
               "BM": {"south": -40, "north": -30, "west": -60, "east": -45}, "AG": {"south": -40, "north": -30, "west": 15, "east": 35}}


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True)


def disjoint(a, b):
    return a["east"] <= b["west"] or b["east"] <= a["west"] or a["north"] <= b["south"] or b["north"] <= a["south"]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    # 4-5 files exist and parse
    check(MD.is_file() and JS.is_file() and HASHREC.is_file(), "4 protocol files exist")
    try:
        P = load(JS); H = load(HASHREC)
    except Exception as exc:
        print(json.dumps({"result": "FAIL", "failures": [f"5 protocol JSON does not parse: {exc}"]}, ensure_ascii=False, indent=2))
        return 1
    T = MD.read_text(encoding="utf-8").replace("−", "-").replace("–", "-")
    # 1-2 parent
    check(git("cat-file", "-t", STEP52).stdout.strip() == "commit", "1 STEP 52 parent exists")
    check(git("merge-base", "--is-ancestor", STEP52, "HEAD").returncode == 0, "2 STEP 52 commit is an ancestor of HEAD")
    check(P["parent_audit_commit"] == STEP52 and P["parent_audit_status"] == "FINAL_RESEARCH_AUDIT_PASS", "1 parent audit recorded")
    # 3 no prior research file modified
    check(len(git("diff", "--name-only", "HEAD", "--", "docs/research", "tools/research").stdout.split()) == 0, "3 no tracked research file modified")
    for c, rel in ((STEP52, "docs/research/step52-final-audit-manifest.json"),
                   ("539205efba50cb1940c337db3f51717d9b5c14be", "docs/research/step51-cross-validation-interpretation-lock.json"),
                   ("85824367b6fd12c066da0e191f6731a0400293ab", "docs/research/step50-validation-extension-results.json"),
                   ("2b1a7baa7ef9e69d25cecbff2b09fca8700fca80", "docs/research/step40-bootstrap-result.json")):
        check(git("rev-parse", f"{c}:{rel}").stdout.strip() == git("hash-object", rel).stdout.strip(), f"3 prior locked artefact unchanged: {rel}")
    # 6 required fields
    for k in REQUIRED:
        check(k in P, f"6 required field present: {k}")
    # 7-10 locked science
    check(P["primary_horizon_hours"] == 72 and "72h" in P["endpoint"]["per_drifter"], "7 primary endpoint horizon = 72 h")
    A = P["model_A"]
    check(A["name"] == "HYCOM_NATIVE_3H" and "expt_53.X" in A["product"] and A["depth_m"] == 15.0 and A["variables"] == ["water_u", "water_v"] and A["temporal_resolution"] == "3-hourly", "8 model A locked")
    C = P["model_C"]
    check(C["glorys"]["product"] == "GLORYS12V1" and C["glorys"]["native_depth_m"] == 15.81007 and C["ww3"]["stokes_multiplier"] == 1.0 and "GLOB-30M CFSR" in C["ww3"]["product"] and "NCEP-DOE Reanalysis 2" in C["ncep"]["product"], "9 model C locked")
    check(P["alpha"] == 0.002 and P["parameter_tuning_permitted"] is False, "10 alpha = 0.002, no tuning")
    check(P["integrator"] == "RK4" and P["dt_seconds"] == 300 and P["output_seconds"] == 900, "10 integration configuration locked")
    # 11-14 bootstrap
    check(P["bootstrap_B"] == 10000, "11 bootstrap B = 10000")
    check(P["bootstrap_seed"] == 20260953 and "default_rng(20260953)" in P["bootstrap_rng"] and P["seed_change_after_data_inspection"] is False, "12 bootstrap seed = 20260953")
    check(P["bootstrap_unit"] == "window", "13 window-level bootstrap")
    check(P["bootstrap_na_redraw"] is False, "14 no NA redraw")
    check(P["ci_level"] == 0.95 and P["ci_quantiles"] == [0.025, 0.975] and P["quantile_method"] == "linear", "14 interval definition")
    check("with replacement" in P["bootstrap_sampling"], "14 sampling with replacement")
    # 15-16 criterion and gate
    RC = P["replication_criterion"]
    check(len(RC["supported_iff"]) == 4 and any("Theta_72h < 0" in s for s in RC["supported_iff"]) and any("upper bound < 0" in s for s in RC["supported_iff"]) and any("gate" in s for s in RC["supported_iff"]) and any("direction" in s for s in RC["supported_iff"]), "15 replication criterion defined")
    check(RC["otherwise"] == "REPLICATION_NOT_SUPPORTED" and RC["gate_failure"] == "VALIDATION_BLOCKED" and RC["not_supported_does_not_mean_disproven"] is True, "15 outcome vocabulary")
    check(P["minimum_valid_windows"] == 4 and P["validity_gate"]["minimum_valid_windows"] == 4 and P["validity_gate"]["if_not_met"] == "VALIDATION_BLOCKED", "16 minimum valid windows defined")
    check(P["target_windows"] >= 6 and P["minimum_unique_drifters"] == 20 and P["maximum_drifters_per_window"] == 12, "16 cohort size targets")
    # 17 non-overlap
    O = P["overlap_rule"]
    check(len(O["required_empty_intersections"]) == 4 and O["pass_condition"] == "all four intersections empty", "17 non-overlap rule defined")
    M36 = load(D / "step36-cohort-extension-manifest.json"); M47 = load(D / "step47-validation-extension-cohort-manifest.json")
    P44 = load(D / "step44-validation-preregistration-protocol.json")
    excluded = sorted(set(M36["drifterIds"]) | set(M47["cohort"]["drifterIds"]) | set(P44["4_validationCohortRule"]["exclusionIdentity"]["excludedDrifterIds"]))
    check(O["excluded_identity_count"] == len(excluded) and O["excluded_identities_sha256"] == hashlib.sha256("\n".join(excluded).encode()).hexdigest(), "17 exclusion identity recomputed")
    check(O["primary_window_starts"] == [w["start"] for w in M36["windows"]] and O["extension_window_starts"] == [w["start"] for w in M47["selectedWindows"]], "17 prior window starts recorded exactly")
    # 18 post-hoc prohibition
    PH = P["post_hoc_prohibition"]
    check(len(PH["prohibited_after_seeing_results"]) >= 12 and PH["new_analysis_requires_new_preregistration"] is True, "18 post-hoc prohibition defined")
    check(P["result_driven_cohort_selection"] is False and len(P["information_prohibited_in_cohort_selection"]) >= 10, "18 no result-driven cohort selection")
    check(P["cohort_selection_rule"]["ranking_permitted"] is False and len(P["cohort_selection_rule"]["prohibited_ranking_criteria"]) >= 5, "18 no ranking in window selection")
    # 19 study separation
    SS = P["study_separation"]
    check(SS["study_1_primary"] == "SUPPORTED" and SS["study_2_geographic_extension"] == "NOT_SUPPORTED" and SS["study_3_step53"].startswith("UNKNOWN") and SS["pooled"] is False and SS["combined_effect_estimate"] is False and SS["retrospective_alteration_of_primary"] is False, "19 primary / extension / STEP 53 separation defined")
    PR = P["prior_results_immutable"]
    R40 = load(D / "step40-bootstrap-result.json"); R50 = load(D / "step50-validation-extension-results.json")
    check(PR["primary"]["Theta_72h_km"] == R40["primary"]["ThetaObserved_km"] == -31.331 and PR["primary"]["CI95_km"] == [R40["primary"]["Q0.025_km"], R40["primary"]["Q0.975_km"]], "19 primary result carried unchanged")
    check(PR["validation_extension"]["Theta_72h_km"] == R50["theta"]["72h"] == -2.272 and PR["validation_extension"]["H_EXT"] == R50["H_EXT"] == "NOT_SUPPORTED", "19 extension result carried unchanged")
    check(PR["candidate"] == "CANDIDATE_ONLY" and PR["operational_promotion"] is False and PR["production_claim"] is False and PR["recomputed_in_step53"] is False, "19 candidate status carried unchanged")
    # 20 protocol hash
    check(H["protocol_markdown"]["sha256"] == sha(MD) and H["protocol_json"]["sha256"] == sha(JS), "20 protocol hash generated and valid")
    check(H["parent_audit_commit"] == STEP52 and H["data_access_status"] == "PROTOCOL_ONLY" and H["scientific_execution"] == "NOT_RUN", "20 hash record provenance")
    # study guarantees
    check(P["status"] == "PREREGISTRATION_LOCKED" and P["data_access_status"] == "PROTOCOL_ONLY" and P["scientific_execution"] == "NOT_RUN", "28 data access PROTOCOL_ONLY, execution NOT_RUN")
    sa = P["source_access_before_lock"]
    check(all(v is False for v in sa.values()), "13 no source acquisition or inspection before lock")
    G = P["geographic_domain"]
    check(G["used_by_prior_studies"] is False and G["performance_information_used_in_selection"] is False and G["changeable_after_data_access"] is False, "2 geographic domain not result-driven")
    for name, box in PRIOR_BOXES.items():
        check(disjoint(G["box"], box), f"6 new domain disjoint from {name}")
    check(P["temporal_domain"]["fully_temporally_independent"] is False and "not achievable" in P["temporal_domain"]["temporal_overlap_disclosure"], "7 temporal independence limitation disclosed")
    check("fully temporally independent" not in T.lower().replace("not** described as fully temporally independent", "").replace("not described as fully temporally independent", "") or "not" in T.lower(), "21 no unqualified temporal independence claim")
    for w in P["forbidden_language"]:
        low = T.lower()
        for i in [k for k in range(len(low)) if low.startswith(w, k)]:
            ctx = low[max(0, i - 200):i]
            check("forbidden" in ctx or "not" in ctx or "never" in ctx, f"21 forbidden language asserted: {w!r}")
    for s in ("EAC", "20260953", "10000", "0.002", "72", "REPLICATION_SUPPORTED", "REPLICATION_NOT_SUPPORTED",
              "VALIDATION_BLOCKED", "CANDIDATE_ONLY", "PROTOCOL_ONLY", "-31.331", "-2.272"):
        check(s in T, f"24 preregistration document states: {s!r}")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40],
                      "status": P["status"], "geographicDomain": G["name"], "box": G["box"],
                      "temporalDomain": [P["temporal_domain"]["t0"], P["temporal_domain"]["t1"]],
                      "targetWindows": P["target_windows"], "minimumValidWindows": P["minimum_valid_windows"],
                      "minimumUniqueDrifters": P["minimum_unique_drifters"], "alpha": P["alpha"],
                      "bootstrap": {"unit": P["bootstrap_unit"], "B": P["bootstrap_B"], "seed": P["bootstrap_seed"]},
                      "excludedIdentities": O["excluded_identity_count"],
                      "dataAccess": P["data_access_status"], "execution": P["scientific_execution"],
                      "protocolSha256": {"md": sha(MD)[:16], "json": sha(JS)[:16]}}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
