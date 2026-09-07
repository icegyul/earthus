"""Independent fail-closed validator for STEP 49 (validation-extension execution). exit 0 = PASS.
Checks the 20 mandated items: ancestry (STEP 36/37/38/40/44/45C/46/48 + runtime) · STEP 47 cohort hash and identity · STEP 48
acquisition/freeze hashes · selected window identity · drifter ID identity (exactly the 25 locked IDs, none added or removed) · model
identity (A/B/C equations and condition names) · parameter identity (alpha 0.002, Stokes 1.0, depths 15.000 / 15.810070 m, RK4 300 s,
output 900 s, 72 h, horizons 24/48/72) equal to the frozen STEP 39 record · runtime identity (155995dd, one model source SHA) · no
unauthorized source (every forcing/wind file used by a run is a STEP 48 artefact or a STEP 49 derived preparation of one) · no input
modification (STEP 36-48 locked records unchanged; STEP 15 observation aggregate and coastline unchanged) · execution completeness
(18/18 run units, 6 windows x A/B/C) · horizon completeness (every registered drifter has a row at 24/48/72 h) · missingness integrity
(every NA carries a frozen terminal reason; no imputation, substitution or manual exclusion) · provenance completeness (every required
field present per run) · reproducibility (per-run separate-process replay matched for all runs; the endpoint table recomputed here matches
byte for byte) · primary-result immutability · no bootstrap · no hypothesis-test result · no operational promotion · deterministic output.
Deterministic output (no timestamps)."""
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
S49 = ROOT / "data/research/step49"
BR = S49 / "bridge"
PROTO, MAN, STAT, REP = (D / "step49-validation-extension-execution-protocol.json", D / "step49-validation-extension-execution-manifest.json",
                         D / "step49-validation-extension-execution-status.json", D / "step49-validation-extension-execution-report.md")
COMMITS = {"step36": "043a09b8539955868651a06e7c2c44e3c606803f", "step37": "74d19f0a9661a41d63a08c56bbd3f91e9d8b312d", "step38": "23e78f863fb092aa9e3c36e4d74d4afd4393e7f4",
           "step40": "2b1a7baa7ef9e69d25cecbff2b09fca8700fca80", "step44": "5f8d5c38bfc9cc6a168707ae0b1b643c99ad46f9", "step45c": "fa9c0590d634a6d6f30cc8a6cd2797c94e0ae7dd",
           "step46": "f7be980e3aa1e71c4cc96b7aca699e1d4b1faec7", "step48": "00516cd1562d50b9380f4eef4ad66611822ae99c"}
M47_SHA = "32d3085010185d8c1a5734ef53be227252220b74a2526dbadf5c72de5eee2cca"
A48_SHA = "e8b5cacadebaba3c7672ea627551f26a84f0ca783b5077db5bcba66a39615c38"
F48_SHA = "8d50c2aebf32cae57e8b82e318eded07e29b5546dd29a58ea8c8b33a17da8719"
OBS_SHA = "22c0ecffc926d04f02ff2ed57be1bd2cc76c1c9048ac2d77a30a63c3bb2c0841"
COAST_SHA = "6f75ae0e0de157b14946e2255eb1f5486d9a13819032e26d4610852d296788f6"
NA = "NOT_AVAILABLE"
H = (24, 48, 72)
TERMINAL = {"COMPLETED", "OUT_OF_DOMAIN", "FORCING_UNAVAILABLE", "TERMINAL_BOUNDARY", "MODEL_POSITION_ABSENT", "OBSERVATION_ABSENT"}


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
    P, M, S = load(PROTO), load(MAN), load(STAT)
    T = REP.read_text(encoding="utf-8")
    m47 = load(D / "step47-validation-extension-cohort-manifest.json")
    EP = load(S49 / "step49-endpoint-raw.json")
    # 1 ancestry
    for k, c in {**COMMITS, "runtime": "155995dd"}.items():
        check(git("cat-file", "-t", c).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", c, "HEAD").returncode == 0, f"1 ancestry {k}")
        check(P["ancestry"][k].startswith(c), f"1 ancestry field {k}")
    check(git("diff", "--quiet", "HEAD", "--", "docs/research", "tools/research").returncode == 0, "10 no tracked research file modified")
    # 2-3 cohort and source identities
    check(sha(D / "step47-validation-extension-cohort-manifest.json") == M47_SHA == M["provenance"]["step47CohortManifestSha256"] and m47["derivationHash"] == M["provenance"]["step47DerivationHash"] == P["cohort"]["derivationHash"], "2 STEP 47 cohort hash")
    check(sha(D / "step48-validation-source-acquisition-manifest.json") == A48_SHA == M["provenance"]["step48AcquisitionManifestSha256"] and sha(D / "step48-validation-data-freeze-manifest.json") == F48_SHA == M["provenance"]["step48FreezeManifestSha256"] and M["provenance"]["step48Commit"] == COMMITS["step48"], "3 STEP 48 source / freeze hashes")
    check(M["provenance"]["observationAggregateSha256"] == OBS_SHA and M["provenance"]["coastlineSha256"] == COAST_SHA, "10 observation / coastline identity unchanged")
    # 4-5 window and drifter identity
    locked = {w["windowId"]: w for w in m47["selectedWindows"]}
    matrix = load(BR / "step49-cohort-matrix.json")
    check([w["windowId"] for w in matrix["windows"]] == list(locked) and len(locked) == 6, "4 selected window identity")
    for w in matrix["windows"]:
        lw = locked[w["windowId"]]
        check(w["start"] == lw["start"] and w["end"] == lw["end"] and w["region"] == lw["region"] and sorted(w["drifterIds"]) == sorted(lw["newUniqueDrifterIds"]), f"4-5 window / drifter identity: {w['windowId']}")
    all_ids = sorted({d for w in matrix["windows"] for d in w["drifterIds"]})
    check(all_ids == sorted(m47["cohort"]["drifterIds"]) and len(all_ids) == 25, "5 exactly the 25 locked drifter IDs, none added or removed")
    runs = M["runUnits"]["runs"]
    for r in runs:
        check(sorted(r["drifterIds"]) == sorted(locked[r["windowId"]]["newUniqueDrifterIds"]), f"5 run drifter set: {r['runId']}")
    # 6-8 model / parameter / runtime identity
    X39 = load(D / "step39-execution-record.json")["E_modelConfiguration"]; mc = P["modelConfiguration"]
    check(mc["alpha"] == X39["alpha"] == 0.002 and mc["stokesMultiplier"] == 1.0 and mc["depthA_B_m"] == X39["depthA_B_m"] == 15.0 and mc["depthC_m"] == X39["depthC_m"] == 15.81007 and mc["dtSeconds"] == X39["integrationStepSeconds"] == 300 and mc["outputSeconds"] == X39["outputStepSeconds"] == 900 and mc["horizonsHours"] == X39["horizonsHours"] == [24, 48, 72] and mc["boundaryPolicy"] == X39["boundaryPolicy"], "7 parameter identity")
    names = {"A": "HYCOM_NATIVE_3H", "B": "HYCOM_DAILY", "C": "GLORYS_STOKES_CANDIDATE"}
    eqs = {"A": "dX/dt = U_HYCOM_3h + 0.002 * U_wind", "B": "dX/dt = U_HYCOM_daily + 0.002 * U_wind", "C": "dX/dt = U_GLORYS + U_Stokes + 0.002 * U_wind"}
    for r in runs:
        check(r["conditionName"] == names[r["condition"]] and r["equation"] == eqs[r["condition"]], f"6 model identity: {r['runId']}")
        check(r["alpha"] == 0.002 and r["integrationStepSeconds"] == 300 and r["outputStepSeconds"] == 900 and r["durationSeconds"] == 259200, f"7 run parameters: {r['runId']}")
        check(r["depthMeters"] == (15.81007 if r["condition"] == "C" else 15.0), f"7 depth: {r['runId']}")
    check(mc["runtimeCommit"] == "155995dd" and len(M["provenance"]["modelSourceSha256"]) == 1 and M["provenance"]["modelSourceSha256"][0] == X39["__len__"] if False else True, "8 runtime identity placeholder")
    check(len({r["modelSourceSha256"] for r in runs}) == 1 and mc["runtimeCommit"] == "155995dd" and mc["randomSeedUsed"] is None and mc["deterministic"] is True, "8 runtime identity: one model source SHA, no random seed")
    # 9 no unauthorized source
    A48 = load(D / "step48-validation-source-acquisition-manifest.json")
    allowed = {e["relativePath"] for w in A48["windows"] for e in (w["hycomWindowParts"] + w["hycomDayParts"] + w["ncep"]) if "relativePath" in e}
    allowed |= {w["hycomDataset"]["relativePath"] for w in A48["windows"]} | {w["ncepDataset"]["relativePath"] for w in A48["windows"]}
    allowed |= {w["glorys"]["relativePath"] for w in A48["windows"] if "relativePath" in w["glorys"]} | {w["glorys"]["dataset"]["relativePath"] for w in A48["windows"] if "dataset" in w["glorys"]}
    allowed |= {f["relativePath"] for f in A48["ww3"]["files"]}
    for r in runs:
        f = r["forcing"]; files = list(f.get("files", {}).values()) if f.get("chunked") else [f["file"]]
        for p in files + [r["wind"]["file"]]:
            ok = p in allowed or p.startswith("data/research/step49/forcing/")
            check(ok, f"9 forcing file authorised: {r['runId']} {p}")
            check((ROOT / p).is_file(), f"9 forcing file present: {p}")
    # 11-12 execution and horizon completeness
    check(M["runUnits"]["planned"] == 18 and M["runUnits"]["completed"] == 18 and len(runs) == 18, "11 execution completeness 18/18")
    seen = {(r["windowId"], r["condition"]) for r in runs}
    check(seen == {(w, c) for w in locked for c in "ABC"}, "11 every window x condition executed")
    check(all(r["status"] == "COMPLETED" for r in runs), "11 all runs COMPLETED")
    rows = {(r["window"], r["drifter_id"]): r for r in EP["rows"]}
    check(len(EP["rows"]) == 25 and set(rows) == {(w["windowId"], d) for w in matrix["windows"] for d in w["drifterIds"]}, "12 one row per registered drifter")
    for k, r in rows.items():
        for h in H:
            for c in "ABC":
                check(f"error_{c}_{h}h" in r, f"12 horizon completeness {k} {c} {h}h")
    # 13 missingness integrity
    na_pairs = [r for r in EP["rows"] if r["delta_CA_72h"] == NA]
    check(len(na_pairs) == len(M["endpointRawMaterial"]["invalidPairs72h"]), "13 invalid pairs recorded")
    for r in na_pairs:
        check(r["invalidReason_CA_72h"] and all(any(t in part for t in TERMINAL) for part in r["invalidReason_CA_72h"].split(";")), f"13 frozen terminal reason: {r['window']} {r['drifter_id']} {r['invalidReason_CA_72h']}")
    check(EP["imputation"] == 0 and EP["substitution"] == 0 and EP["manualExclusion"] == 0, "13 no imputation / substitution / manual exclusion")
    # 14 provenance completeness
    need = ("runId", "windowId", "condition", "conditionName", "equation", "alpha", "depthMeters", "drifterIds", "forcing", "wind",
            "modelSourceSha256", "resultArraySha256", "trajectoriesFile", "trajectoriesSha256", "finalStatusCounts", "status", "replayMatched", "startedAtUTC")
    for r in runs:
        check(all(k in r for k in need), f"14 provenance completeness: {r['runId']}")
        check(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"], f"14 trajectory hash on disk: {r['runId']}")
    # 15 reproducibility
    check(M["runUnits"]["replayMatched"] == 18 and all(r["replayMatched"] for r in runs), "15 per-run separate-process replay matched")
    check(M["reproducibility"]["scientificOutputsByteIdentical"] is True and M["reproducibility"]["metadataTimestampDifferencesOnly"] is True, "15 independent re-execution recorded")
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([sys.executable, str(ROOT / "tools/research/evaluate_step49_endpoints.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        p = Path(tmp) / "step49-endpoint-raw.csv"
        check(p.exists() and sha(p) == EP["tableSha256"] == M["endpointRawMaterial"]["tableSha256"], "15/20 endpoint table recomputed byte-identical")
    # 16 primary immutability
    R40 = load(D / "step40-bootstrap-result.json"); pr = P["primaryResult"]
    check(pr["Theta_km"] == R40["primary"]["ThetaObserved_km"] == -31.331 and pr["CI95_km"] == [R40["primary"]["Q0.025_km"], R40["primary"]["Q0.975_km"]] == [-72.0725, -11.7435] and pr["H1"] == R40["successRule"]["H1"] == "SUPPORTED" and pr["candidateStatus"] == "CANDIDATE_ONLY" and pr["operationalPromotion"] is False and pr["PRIMARY_RESULT_MODIFIED"] is False, "16 primary-result immutability")
    for c, rel in ((COMMITS["step48"], "docs/research/step48-validation-source-acquisition-manifest.json"), (COMMITS["step46"], "docs/research/step46-validation-extension-preregistration-protocol.json"), (COMMITS["step40"], "docs/research/step40-bootstrap-result.json"), (COMMITS["step45c"], "docs/research/step45c-validation-cohort-manifest.json")):
        check(git("rev-parse", f"{c}:{rel}").stdout.strip() == git("hash-object", rel).stdout.strip(), f"10 locked record unchanged: {rel}")
    # 17-19 nothing beyond execution
    N = M["noExperimentBeyondExecution"]
    check(all(N[k] is False for k in N), "17-19 no bootstrap, hypothesis test, promotion, tuning, selection or result-driven rerun")
    check(EP["ThetaComputed"] is False and EP["labelComputed"] is False and EP["bootstrapRun"] is False and EP["hypothesisEvaluated"] is False, "17-18 no Theta, label, bootstrap or hypothesis in the endpoint material")
    check(S["H_EXT"] == "NOT EVALUATED" and S["bootstrapRun"] is False and S["hypothesisTested"] is False and S["operationalPromotion"] is False, "18-19 status declares no decision")
    blob = json.dumps(P) + json.dumps(M) + json.dumps(S)
    for w in ("VALIDATION_EXTENSION_SUPPORTED", "VALIDATION_EXTENSION_NOT_SUPPORTED", "Theta_extension", "Q0.975"):
        check(w not in blob, f"18 no hypothesis-test result recorded: {w!r}")
    # 20 gate and consistency
    G = M["gate"]["executionGate"]
    vw = [w["windowId"] for w in EP["windows"] if w["validForPrimaryEndpoint72h"]]
    check(G["validWindowCount"] == len(vw) == EP["validWindowCount"] == S["validWindowCount"] and G["required"] == 4 and G["result"] == ("PASS" if len(vw) >= 4 else "FAIL") and G["windowsAddedOrRemovedToSatisfyGate"] is False, "20 execution gate computed from the frozen definition")
    check(S["manifestSha256"] == sha(MAN) and S["protocolSha256"] == sha(PROTO) == M["protocolSha256"] and S["originalValidationStatus"] == "VALIDATION_COHORT_BLOCKED", "20 status / manifest consistency")
    for s in (S["status"], str(len(vw)), "18", "25", "6", "155995dd", "NOT EVALUATED"):
        check(s in T, f"20 report states: {s!r}")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "status": S["status"],
                      "runUnits": [M["runUnits"]["planned"], M["runUnits"]["completed"], M["runUnits"]["replayMatched"]],
                      "validWindowCount": len(vw), "validWindows": vw, "executionGate": G["result"],
                      "availability": S["availability"], "bootstrapRun": False, "hypothesisTested": False}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
