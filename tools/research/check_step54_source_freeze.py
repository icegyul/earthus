"""Independent fail-closed validator for STEP 54 (EAC validation source acquisition and data freeze). exit 0 = PASS.
Checks the 22 mandated items: STEP 53 ancestor exists · protocol markdown and JSON hashes match the lock · the EAC domain and the temporal
domain match the lock exactly · target windows 6 · minimum valid windows 4 · minimum unique drifters 20 · maximum drifters per window 12 ·
model A and model C identities and alpha 0.002 unchanged · no prior identity overlap and no prior window-start overlap · frozen source
identities preserved with no substitution · every acquired artefact carries a SHA-256, re-hashed here from disk · required source metadata
present with UNVERIFIED used rather than invented values · the coverage report internally consistent and covering every registered window ·
and that STEP 54 produced no trajectory, endpoint or bootstrap output and no scientific result of any kind. It also re-derives the
registered-window and unique-drifter counts from the cohort manifest and confirms the recorded status follows the locked gate.
Deterministic output (no timestamps)."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
OBS = ROOT / "data/research/step54/noaa-gdp-hourly-qc"
S54 = ROOT / "data/research/step54"
COHORT, SRC, COV, FREEZE, HI = (D / "step54-eac-cohort-manifest.json", D / "step54-source-manifest.json",
                                D / "step54-coverage-report.json", D / "step54-source-acquisition-freeze.json",
                                D / "step54-hash-inventory.json")
REP = D / "step54-source-acquisition-freeze.md"
STEP53 = "b5cfb97aed482a38e1b763c2cd15a0f105cee9e7"
STEP52 = "4af3fd8fadc50243a3493efa22d57d5811c23943"
MD_SHA = "a9b6457ddce51c5bf437f600a9124086b1390d8a5cf0567616e1af03efd1e39a"
JS_SHA = "79c601beffd8ee94b303f7ea3317d9416c13e200e09c8adcc1357110ba9e7d46"
BOX = {"south": -40.0, "north": -25.0, "west": 150.0, "east": 160.0}
T0, T1 = "2010-01-01T12:00:00Z", "2015-12-31T12:00:00Z"


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
    C, M, V, F = load(COHORT), load(SRC), load(COV), load(FREEZE)
    P = load(D / "step53-validation-preregistration.json")
    T = REP.read_text(encoding="utf-8").replace("−", "-").replace("–", "-")
    # 1 ancestry
    check(git("cat-file", "-t", STEP53).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", STEP53, "HEAD").returncode == 0, "1 STEP 53 ancestor exists")
    check(git("merge-base", "--is-ancestor", STEP52, "HEAD").returncode == 0, "1 STEP 52 ancestor")
    check(F["ancestry"]["step53"] == STEP53 and F["ancestry"]["step52"] == STEP52, "1 ancestry recorded")
    check(len(git("diff", "--name-only", "HEAD", "--", "docs/research", "tools/research").stdout.split()) == 0, "1 no tracked research file modified")
    # 2-3 protocol hashes
    check(sha(D / "step53-validation-preregistration.md") == MD_SHA == C["protocolSha256"]["markdown"] == F["protocolIntegrity"]["markdown"], "2 protocol markdown hash")
    check(sha(D / "step53-validation-preregistration.json") == JS_SHA == C["protocolSha256"]["json"] == F["protocolIntegrity"]["json"], "3 protocol JSON hash")
    # 4-5 domain and period
    check({"south": C["lat_min"], "north": C["lat_max"], "west": C["lon_min"], "east": C["lon_max"]} == BOX == P["geographic_domain"]["box"] and C["region"] == "EAC", "4 EAC domain exact")
    check(C["time_start"] == T0 == P["temporal_domain"]["t0"] and C["time_end"] == T1 == P["temporal_domain"]["t1"], "5 temporal domain exact")
    check(F["domain"]["modified"] is False and F["temporal"]["modified"] is False and F["temporal"]["fullyTemporallyIndependent"] is False, "4-5 domain and period unmodified")
    # 6-9 gate parameters
    G = C["gate"]
    check(G["targetWindows"] == 6 == P["target_windows"], "6 target windows = 6")
    check(G["minimumValidWindows"] == 4 == P["minimum_valid_windows"], "7 minimum valid windows = 4")
    check(G["minimumUniqueDrifters"] == 20 == P["minimum_unique_drifters"], "8 minimum unique drifters = 20")
    check(G["maxDriftersPerWindow"] == 12 == P["maximum_drifters_per_window"] and all(w["selectedCount"] <= 12 for w in C["windows"]), "9 maximum drifters per window = 12")
    # 10-12 model identities
    A, Cm = P["model_A"], P["model_C"]
    check(A["name"] == "HYCOM_NATIVE_3H" and "expt_53.X" in A["product"] and A["depth_m"] == 15.0 and A["temporal_resolution"] == "3-hourly", "10 model A exact")
    check(Cm["glorys"]["native_depth_m"] == 15.81007 and Cm["ww3"]["stokes_multiplier"] == 1.0 and "GLOB-30M CFSR" in Cm["ww3"]["product"] and "NCEP-DOE Reanalysis 2" in Cm["ncep"]["product"], "11 model C exact")
    check(P["alpha"] == 0.002 and P["parameter_tuning_permitted"] is False, "12 alpha = 0.002")
    fam = {f["source_family"]: f for f in M["frozenSourceIdentitiesNotAcquired"]}
    check(set(fam) == {"MODEL_A_OCEAN", "MODEL_C_OCEAN", "MODEL_C_STOKES", "MODEL_C_ATMOSPHERE"} and fam["MODEL_A_OCEAN"]["experiment"] == "expt_53.X" and fam["MODEL_C_OCEAN"]["product"] == "GLORYS12V1" and fam["MODEL_C_STOKES"]["product"] == "WW3 GLOB-30M CFSR uss", "15 frozen source identities preserved")
    check(M["substitutionPerformed"] is False and F["forcingAcquisition"]["substitution"] is False and F["forcingAcquisition"]["frozenIdentitiesPreserved"] is True, "15 no source substitution")
    # 13-14 overlap
    O = C["overlapCheck"]
    check(O["newVsPrimaryIds"] == [] and O["newVsExtensionIds"] == [], "13 no prior identity overlap")
    check(O["newVsPrimaryWindowStarts"] == [] and O["newVsExtensionWindowStarts"] == [] and O["pass"] is True, "14 no prior window-start overlap")
    M36 = load(D / "step36-cohort-extension-manifest.json"); M47 = load(D / "step47-validation-extension-cohort-manifest.json")
    ids = set(C["cohort"]["drifterIds"])
    check(not (ids & set(M36["drifterIds"])) and not (ids & set(M47["cohort"]["drifterIds"])), "13 overlap re-verified against the prior cohorts")
    check(C["exclusion"]["sha256"] == P["overlap_rule"]["excluded_identities_sha256"] and C["exclusion"]["identityCount"] == P["overlap_rule"]["excluded_identity_count"], "13 exclusion identity matches the lock")
    # 16-17 artefacts and metadata
    files = sorted(OBS.glob("EAC-*-q*.csv"))
    check(len(files) == M["artifactCount"] == len(M["artifacts"]) and files, "16 artefact count")
    for a in M["artifacts"]:
        p = OBS / a["file_name"]
        check(p.is_file() and sha(p) == a["sha256"] and p.stat().st_size == a["file_size_bytes"], f"16 artefact re-hashed: {a['file_name']}")
        for k in ("artifact_id", "source_family", "provider", "product", "version", "experiment", "variable", "depth",
                  "temporal_resolution", "spatial_bounds", "time_bounds", "file_name", "file_size_bytes", "sha256",
                  "acquisition_status", "coverage_status", "provenance", "original_or_derived"):
            check(k in a, f"17 required metadata field present: {k} ({a['file_name']})")
        check(a["sha256"] != "UNVERIFIED", f"16 SHA-256 never omitted: {a['file_name']}")
    agg = hashlib.sha256(canonical([{"filename": f.name, "sha256": sha(f), "bytes": f.stat().st_size} for f in files])).hexdigest()
    check(agg == M["observationAggregateSha256"] == C["observationSource"]["aggregateSha256"], "16/24 observation aggregate re-hashed")
    check(F["observationSource"]["originalsImmutable"] is True and F["observationSource"]["originalsRewritten"] is False, "15 originals immutable")
    # 18 coverage report
    wins = {w["windowId"] for w in C["windows"]}
    covered = {e["window_id"] for e in V["windows"]}
    check(covered == wins and V["registeredWindows"] == len(wins) == C["cohort"]["windows"], "18 coverage report covers every registered window")
    obs_rows = [e for e in V["windows"] if e["source"].startswith("OBSERVATION")]
    check(len(obs_rows) == len(wins) and all(e["coverage_pass"] is True for e in obs_rows), "18 observation coverage pass per window")
    for e in V["windows"]:
        for k in ("window_id", "source", "coverage_start", "coverage_end", "required_start", "required_end", "coverage_pass"):
            check(k in e, f"18 coverage field present: {k}")
    check(all(e["coverage_pass"] is None for e in V["windows"] if not e["source"].startswith("OBSERVATION")), "18 unacquired forcing recorded as not evaluated, never assumed")
    # gate outcome re-derived
    regs, uniq = len(C["windows"]), len(C["cohort"]["drifterIds"])
    check(regs == G["registeredWindows"] and uniq == G["uniqueDrifters"] and uniq == len({d for w in C["windows"] for d in w["selectedIds"]}), "18 cohort counts re-derived")
    expect = "COHORT_REGISTERED" if (regs >= 6 and uniq >= 20) else ("VALIDATION_BLOCKED" if (uniq < 20 or regs < 4) else "TARGET_NOT_REACHED")
    check(C["status"] == expect == F["status"] == M["status"] == V["status"], f"18 status follows the locked gate: {C['status']} vs {expect}")
    check(G["minimumUniqueDriftersMet"] == (uniq >= 20) and G["minimumWindowsMet"] == (regs >= 4), "18 gate flags")
    PC = F["protocolChanges"]
    check(all(v is False for v in PC.values()), "18 no protocol change to reach a status")
    # 19-22 no scientific execution
    N = F["noScientificComputation"]
    check(all((v == 0 if isinstance(v, int) else v is False) for v in N.values()), "19-22 no trajectory, endpoint, delta, theta, bootstrap or ranking")
    check(all(v == 0 for v in C["noScientificComputation"].values()) and C["rankingApplied"] is False and C["performanceInformationUsed"] is False, "19-22 cohort derivation used no performance information")
    check(V["trajectoryRun"] is False and V["endpointComputed"] is False, "20 coverage report records no execution")
    for pat in ("trajector", "result.json", "bootstrap", "evaluation", "paired-table", "endpoint"):
        hits = [p for p in S54.rglob("*") if p.is_file() and pat in p.name.lower()]
        check(not hits, f"19-21 no {pat} output created by STEP 54: {[p.name for p in hits][:3]}")
    check(F["priorResultsUnchanged"]["primary"] == "SUPPORTED" and F["priorResultsUnchanged"]["extension"] == "NOT_SUPPORTED" and F["priorResultsUnchanged"]["candidate"] == "CANDIDATE_ONLY" and F["priorResultsUnchanged"]["operationalPromotion"] is False, "22 prior results carried unchanged")
    # hash inventory + report consistency
    H = load(HI)
    check(H["observationAggregateSha256"] == agg and all(sha(D / k) == v for k, v in H["records"].items() if k != "step54-hash-inventory.json"), "24 hash inventory consistent")
    for s in ("VALIDATION_BLOCKED", "EAC", "12", "20", "5", "2191", "NOT_ATTEMPTED_COHORT_BLOCKED" if "NOT_ATTEMPTED_COHORT_BLOCKED" in T else "not attempted", "CANDIDATE_ONLY"):
        check(s in T, f"22 freeze record states: {s!r}")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "status": C["status"],
                      "registeredWindows": regs, "uniqueDrifters": uniq, "targetWindows": 6, "minimumUniqueDrifters": 20,
                      "overlapPass": O["pass"], "observationArtifacts": len(files), "observationBytes": M["totalBytes"],
                      "forcingAcquisitionAttempted": F["forcingAcquisition"]["attempted"],
                      "derivationHash": C["derivationHash"][:16]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
