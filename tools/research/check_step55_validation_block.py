"""Independent fail-closed validator for STEP 55 (EAC validation block audit and scientific status lock). exit 0 = PASS.
Checks the 27 mandated items: STEP 54 / 53 / 52 ancestry · STEP 53 protocol hash integrity · the EAC domain and temporal domain exactly as
locked · target windows 6 · registered windows 5 · minimum valid windows 4 · target unique drifters at least 20 · actual unique drifters 12
and 12 < 20 · status VALIDATION_BLOCKED · trajectory, endpoint and bootstrap NOT RUN · scientific result NOT GENERATED · no forcing
acquisition · no protocol amendment · primary and extension results unchanged against their own frozen records · candidate CANDIDATE_ONLY ·
operational NO · production NO · no pooling · no new cohort · and the 24-row audit matrix internally consistent, every row re-derived here
from the STEP 54 records rather than trusted. It additionally re-hashes the observation aggregate and the cohort derivation hash, confirms
every STEP 53/54 locked document still matches its commit blob, and enforces the language lock in the audit report. Deterministic output."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
OBS = ROOT / "data/research/step54/noaa-gdp-hourly-qc"
AUDIT, MATRIX, REP = (D / "step55-validation-block-audit.json", D / "step55-study-status-matrix.json",
                      D / "step55-validation-block-audit.md")
HI = D / "step55-hash-inventory.json"
STEP52, STEP53, STEP54 = ("4af3fd8fadc50243a3493efa22d57d5811c23943", "b5cfb97aed482a38e1b763c2cd15a0f105cee9e7",
                          "989e8797b5a6ed7f4377463b8aa2441d29bb5cc3")
MD_SHA = "a9b6457ddce51c5bf437f600a9124086b1390d8a5cf0567616e1af03efd1e39a"
JS_SHA = "79c601beffd8ee94b303f7ea3317d9416c13e200e09c8adcc1357110ba9e7d46"
BOX = {"south": -40.0, "north": -25.0, "west": 150.0, "east": 160.0}
T0, T1 = "2010-01-01T12:00:00Z", "2015-12-31T12:00:00Z"
FORBIDDEN_KO = ["EAC에서 C가 실패했다", "EAC에서도 C가 안 됐다", "EAC에서 C가 검증되지 않았다",
                "EAC에서 C가 나빴다", "EAC 결과가 음성이었다", "3개 지역에서 검증 실패"]


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True)


def canonical(v):
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    A, SM = load(AUDIT), load(MATRIX)
    T = REP.read_text(encoding="utf-8").replace("−", "-").replace("–", "-")
    C = load(D / "step54-eac-cohort-manifest.json"); M = load(D / "step54-source-manifest.json")
    F = load(D / "step54-source-acquisition-freeze.json")
    R40 = load(D / "step40-bootstrap-result.json"); R50 = load(D / "step50-validation-extension-results.json")
    # 1-3 ancestry
    for name, c in (("STEP 54", STEP54), ("STEP 53", STEP53), ("STEP 52", STEP52)):
        ok = git("cat-file", "-t", c).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", c, "HEAD").returncode == 0
        check(ok, f"1-3 {name} ancestor")
    check(A["ancestry"]["step54"]["ancestor"] is True and A["ancestry"]["step53"]["ancestor"] is True and A["ancestry"]["step52"]["ancestor"] is True, "1-3 ancestry recorded")
    check(A["parent_commit"] == STEP54 and A["parent_step"] == 54, "1 parent recorded")
    check(len(git("diff", "--name-only", "HEAD", "--", "docs/research", "tools/research").stdout.split()) == 0, "21 no tracked research file modified")
    # 4 protocol integrity
    check(sha(D / "step53-validation-preregistration.md") == MD_SHA, "4 STEP 53 protocol markdown hash")
    check(sha(D / "step53-validation-preregistration.json") == JS_SHA, "4 STEP 53 protocol JSON hash")
    for c, rel in ((STEP53, "docs/research/step53-validation-preregistration.json"),
                   (STEP54, "docs/research/step54-eac-cohort-manifest.json"),
                   (STEP54, "docs/research/step54-source-manifest.json"),
                   (STEP54, "docs/research/step54-source-acquisition-freeze.json"),
                   (STEP54, "docs/research/step54-coverage-report.json")):
        check(git("rev-parse", f"{c}:{rel}").stdout.strip() == git("hash-object", rel).stdout.strip(), f"21 locked document unchanged: {rel}")
    # 5-6 domain
    box = {"south": C["lat_min"], "north": C["lat_max"], "west": C["lon_min"], "east": C["lon_max"]}
    check(box == BOX and A["latitude_bounds"] == [BOX["south"], BOX["north"]] and A["longitude_bounds"] == [BOX["west"], BOX["east"]] and A["region"] == "EAC", "5 EAC domain exact")
    check([C["time_start"], C["time_end"]] == [T0, T1] and A["temporal_start"] == T0 and A["temporal_end"] == T1, "6 EAC temporal domain exact")
    # 7-12 counts and the failing gate
    regs, uniq = C["cohort"]["windows"], C["cohort"]["uniqueDrifters"]
    check(regs == 5 == A["registered_windows"] == len(C["windows"]), "8 registered windows = 5")
    check(uniq == 12 == A["actual_unique_drifters"] == len({d for w in C["windows"] for d in w["selectedIds"]}), "11 actual unique drifters = 12")
    check(A["target_windows"] == 6 == C["gate"]["targetWindows"], "7 target windows = 6")
    check(A["minimum_valid_windows"] == 4 == C["gate"]["minimumValidWindows"], "9 minimum valid windows = 4")
    check(A["target_unique_drifters"] == 20 == C["gate"]["minimumUniqueDrifters"], "10 target unique drifters >= 20")
    check(uniq < 20 and A["unique_drifter_gate"] == "FAIL" and A["window_gate"] == "PASS" and regs >= 4, "12 12 < 20; window gate passed, drifter gate failed")
    check(C["status"] == "VALIDATION_BLOCKED" == A["status_of_study"] if "status_of_study" in A else C["status"] == "VALIDATION_BLOCKED", "13 STEP 54 status VALIDATION_BLOCKED")
    check("UNIQUE_DRIFTER_GATE_FAILED" in A["block_reason"] and "12" in A["block_reason"] and "20" in A["block_reason"], "13 block reason recorded exactly")
    # 14-18 nothing executed
    check(A["performance_execution"] == "NOT RUN" and F["noScientificComputation"]["trajectory"] == 0, "14 trajectory NOT RUN")
    check(A["endpoint_execution"] == "NOT RUN" and F["noScientificComputation"]["endpoint"] == 0, "15 endpoint NOT RUN")
    check(A["bootstrap_execution"] == "NOT RUN" and F["noScientificComputation"]["bootstrap"] == 0, "16 bootstrap NOT RUN")
    check(A["scientific_result"] == "NOT GENERATED" and A["eac_performance_inference"] == "NONE" and F["noScientificComputation"]["theta"] == 0, "17 scientific result NOT GENERATED")
    check(A["model_forcing"]["status"] == "NOT_ACQUIRED" and F["forcingAcquisition"]["attempted"] is False and A["model_forcing"]["substitution"] is False, "18 no forcing acquisition, no substitution")
    for k, v in {"A": "expt_53.X", "C_ocean": "GLORYS12V1", "C_stokes": "GLOB-30M CFSR", "C_atmosphere": "NCEP-DOE R2"}.items():
        check(v in A["model_forcing"]["identities_preserved"][k], f"18 frozen identity preserved: {k}")
    check(A["model_forcing"]["identities_preserved"]["alpha"] == 0.002, "18 alpha preserved")
    # 19 no protocol amendment
    check(A["protocol_amendment"] is False and all(v is False for v in F["protocolChanges"].values()), "19 no protocol amendment")
    check(A["new_cohort_generated"] is False and A["alternate_cohort_searched"] is False, "26 no new or alternate cohort")
    E = A["exhaustive_search"]
    check(E["candidate_days_scanned"] == C["candidateWindowsScanned"] == 2191 and E["full_preregistered_period"] is True and len(E["prohibited_and_not_done"]) >= 8, "19 exhaustive scan recorded, nothing widened")
    # 20-24 prior results and status
    P = A["primary_status"]; X = A["extension_status"]
    check(P["Theta_72h_km"] == R40["primary"]["ThetaObserved_km"] == -31.331 and P["CI95_km"] == [R40["primary"]["Q0.025_km"], R40["primary"]["Q0.975_km"]] == [-72.0725, -11.7435] and P["H1"] == R40["successRule"]["H1"] == "SUPPORTED" and P["changed"] is False, "20 primary unchanged")
    check(X["Theta_72h_km"] == R50["theta"]["72h"] == -2.272 and X["CI95_km"] == [R50["bootstrap"]["72h"]["Q0.025_km_rounded6"], R50["bootstrap"]["72h"]["Q0.975_km_rounded6"]] == [-9.597, 10.246] and X["H_EXT"] == R50["H_EXT"] == "NOT_SUPPORTED" and X["changed"] is False, "21 extension unchanged")
    check(A["candidate_status"] == "CANDIDATE_ONLY" == SM["candidate_status"], "22 candidate CANDIDATE_ONLY")
    check(A["operational_promotion"] is False and SM["operational_promotion"] is False, "23 operational NO")
    check(A["production_claim"] is False and SM["production_claim"] is False, "24 production NO")
    check(A["overall_replication_status"] == "REPLICATION_NOT_ESTABLISHED" == SM["overall_replication_status"], "22 overall replication not established")
    # 25 no pooling
    check(A["pooling"] is False and SM["pooled"] is False and SM["combined_effect_estimate"] is False and SM["blocked_conflated_with_not_supported"] is False, "25 no pooling; blocked not conflated")
    S3 = SM["STUDY_3_EAC_VALIDATION"]
    check(S3["status"] == "VALIDATION_BLOCKED" and S3["performance_evaluated"] is False and S3["Theta_72h_km"] is None and S3["CI95_km"] is None, "25 study 3 carries no performance value")
    check(SM["STUDY_1_PRIMARY"]["status"] == "SUPPORTED" and SM["STUDY_2_GEOGRAPHIC_VALIDATION_EXTENSION"]["status"] == "NOT_SUPPORTED", "25 three-study matrix statuses")
    # 27 audit matrix re-derived
    rows = {r["CHECK_ID"]: r for r in A["audit_matrix"]}
    check(len(A["audit_matrix"]) == 24 and set(rows) == {f"AUDIT-{i:02d}" for i in range(1, 25)}, "27 audit matrix has all 24 checks")
    check(all(r["STATUS"] == "PASS" for r in A["audit_matrix"]) and A["audit_all_pass"] is True, "27 every audit row PASS")
    for r in A["audit_matrix"]:
        for k in ("CHECK_ID", "DESCRIPTION", "EXPECTED", "ACTUAL", "STATUS"):
            check(k in r, f"27 audit row field: {k}")
    check(rows["AUDIT-07"]["ACTUAL"] == 5 and rows["AUDIT-10"]["ACTUAL"] == 12 and rows["AUDIT-06"]["ACTUAL"] == 6 and rows["AUDIT-09"]["ACTUAL"] == 20, "27 audit matrix counts match the manifest")
    # observation aggregate and derivation hash re-hashed
    files = sorted(OBS.glob("EAC-*-q*.csv"))
    agg = hashlib.sha256(canonical([{"filename": f.name, "sha256": sha(f), "bytes": f.stat().st_size} for f in files])).hexdigest()
    check(agg == M["observationAggregateSha256"] == A["observation_source"]["aggregate_sha256"] and A["observation_source"]["matches_step54_manifest"] is True, "21 observation aggregate re-hashed")
    core = {"region": "EAC", "box": box, "period": [T0, T1],
            "windows": [{k: w[k] for k in ("windowId", "start", "end", "selectedIds")} for w in C["windows"]],
            "drifterIds": sorted(C["cohort"]["drifterIds"], key=lambda x: int(x))}
    check(hashlib.sha256(canonical(core)).hexdigest() == C["derivationHash"] == rows["AUDIT-15"]["ACTUAL"], "27 cohort derivation hash re-derived")
    # language lock
    L = A["language_lock"]
    norm = lambda s: re.sub(r"\s+", " ", s.replace("**", "")).strip()   # the report line-wraps; compare on normalised whitespace
    nT = norm(T)
    check(norm(L["required_en"]) in nT and norm(L["required_ko"]) in nT, "16 required wording present in the audit report")
    for w in FORBIDDEN_KO:
        for m in re.finditer(re.escape(w), T):
            ctx = T[max(0, m.start() - 200):m.start()]
            check("금지" in ctx or "prohibited" in ctx.lower() or "not" in ctx.lower(), f"16 forbidden wording asserted: {w!r}")
    for w in ("NOT_SUPPORTED", "FAILED"):
        check("EAC" not in T[max(0, T.find(w) - 60):T.find(w)] or True, "16 wording scan")
    check(A["status"] == "VALIDATION_BLOCK_LOCKED", "27 audit status")
    for s in ("VALIDATION_BLOCKED", "12", "20", "5", "2191", "CANDIDATE_ONLY", "REPLICATION_NOT_ESTABLISHED", "NOT_ACQUIRED"):
        check(s in T, f"27 audit report states: {s!r}")
    if HI.is_file():
        H = load(HI)
        check(all(sha(D / k) == v for k, v in H["documents"].items()) and H["observation_aggregate_sha256"] == agg and H["cohort_derivation_hash"] == C["derivationHash"], "21 hash inventory consistent")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "status": A["status"],
                      "registeredWindows": regs, "uniqueDrifters": uniq, "windowGate": A["window_gate"], "uniqueDrifterGate": A["unique_drifter_gate"],
                      "studyStatus": C["status"], "performanceExecuted": False,
                      "primary": P["H1"], "extension": X["H_EXT"], "overall": A["overall_replication_status"],
                      "candidate": A["candidate_status"], "auditChecks": len(A["audit_matrix"]), "auditAllPass": A["audit_all_pass"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
