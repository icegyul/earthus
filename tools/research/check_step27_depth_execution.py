"""Independent validator for STEP 27 Phase B (depth sensitivity execution). `--phase A` (Phase B lock) or `--phase B` (full). exit 0 = PASS.
Verifies: immutable ancestry (through 0c2b3cb7); STEP 17–27C locks + frozen runtime; Phase B preregistration binding (tools, label rules,
depths, plan); forcing: D05/D10/D20 normalized from the STEP 27B/27C files (raw SHA re-verified), D15 = STEP 25C forcing, depth identity
re-read from every normalized manifest (tolerance 0.01 m), same grid/frames across depths; 24 runs (6 per depth), COMPLETED, replay matched
(replay manifest consistent), forcing/config/runner/reader/result SHAs; D15 reference reproduction (result-array digest + CSV rows without
run_id recomputed); independent M3 recomputation for every drifter x depth x horizon; pairing (n + notAvailable = drifters); M1/M2/M4/M5
present; W/L/T arithmetic; no outlier removal; calibration/holdout separation; no depth selection (labels per rule; no selection language);
KE-H2 exclusion; evaluator re-run byte-identical. Deterministic output."""
import csv
import hashlib
import json
import math
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
RULE, PBLOCK = D / "step27-depth-rule.json", D / "step27-phase-b-preregistration.json"
FORCING, RUNS, REPLAYM, EVAL, TABLE, SUMMARY = D / "step27-depth-forcing-manifest.json", D / "step27-depth-manifest.json", D / "step27-depth-replay-manifest.json", D / "step27-depth-evaluation.json", D / "step27-depth-paired-table.csv", D / "step27-depth-execution-summary.json"
LOCK = {"docs/research/step27-depth-rule.json": "603435292009708e7516eb39b2ba8ff705b4331dbc93f4ab98c9e55b3b217ca4", "docs/research/step27-preregistration.json": "192824c2042e2c3fc6971c150048b9e5f509ea7f46244beef2e309f2a364dfa0",
        "docs/research/step27-depth-acquisition-manifest.json": "6cb007f956a225d91c0bcfdd616e3ef4ddc18cd32ef59e6ef092ce47589170bc", "docs/research/step27-depth-quality-gates.json": "77afc61c98648088463f013152fdc6f3f0df04f7bda15dc7cfd660f6a96336fd",
        "docs/research/step27b-r2-rule.json": "22fa3ad36e4e2870104a9e8862e0ab63f5c8f3742987a68c571d5a05eb0a98b0", "docs/research/step27c-d20-acquisition-manifest.json": "1ef57e6a5dd88f47ab8d61bca8466dbf081ccebeb325aaec4cad590036e42d49",
        "docs/research/step27c-d20-quality-gates.json": "467d2ce83764572038741b8dc879dcc75bebb72d1756b9d3a9c69a5efea879e5", "docs/research/step27c-d20-acquisition-protocol.json": "94b8203475f509fdd74a5f3f6b3afb84bbdcd825f7e5027bab220bd6030b7d80",
        "docs/research/step25c-test02-protocol.json": "7ff8468ea8399b8bf9d563980a184203b1b69c55a52cf7a493d1c140c97901ab", "docs/research/step25c-run-manifest.json": "75d6a52b212b40e9e331bd06f362e888e1592873e150f942f8b0320add307e2d",
        "docs/research/step25c-paired-table.csv": "3a5c6b1a339c050a053279514299004a7be5bd614cf6e542433953888c78e002", "docs/research/step25c-glorys-forcing-manifest.json": "9febefe0d4e4ecc24f98fee13c6aa5d788d4ee34b94fd97626e5305163f72e19",
        "docs/research/step25b-glorys-acquisition-manifest.json": "8dfd07815328074fefa029a41e911130984386d50d3ca86cd8c123e1f0d8b734", "docs/research/step26-phase-b-summary.json": "bc242bb58cf98630c529e6c5f8dfaf1e05bce5b218ced248ced29aab22a3fce6",
        "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd", "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4",
        "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474", "tools/research/glorys_reader_step25c.py": "11b7d987434a55a9e42a9776e851fad49b8ec65d2df0f23130c7a7e6234ab63e", "tools/research/replay_step25c_run.py": "5dd8c14da33dcd75c50c8e52dc517456d46a1a2f4ad38b3918687d16b4a73ff5"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "4bb4342b", "e0e7cfd2", "db6cea2f", "2841f511", "929d3468", "c974ce42", "86266b3a", "a4474eb8", "2a5c8f9a", "d5fb2a62", "d242165d", "b9078805", "adf5260f", "0c2b3cb7")
WINDOWS = ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H3"]
DEPTHS = ("D05", "D10", "D15", "D20"); ALT = ("D05", "D10", "D20")
LEVELS = {"D05": 5.078224, "D10": 9.572997, "D15": 15.81007, "D20": 18.49556}
RADIUS_M = 6371008.8
NA = "NOT_AVAILABLE"
SELECTION = re.compile(r"\b(optimal|superior|best operational depth|is correct|best depth|preferred depth is)\b", re.I)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def hav(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * RADIUS_M * math.asin(math.sqrt(a)) / 1000


def positions(path):
    out = {}
    with open(path, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            if row["valid"] == "true":
                out.setdefault(row["drifter_id"], {})[row["timestamp"]] = (float(row["lon"]), float(row["lat"]))
    return out


def csv_rows_without_run_id(path):
    with open(path, encoding="utf-8", newline="") as fh:
        return [r[1:] for r in csv.reader(fh)]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    phase = sys.argv[sys.argv.index("--phase") + 1] if "--phase" in sys.argv else "B"
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"locked artifact: {rel}")
    for short in COMMITS:
        check(subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() == "commit", f"ancestry: {short}")
    for name in ("__init__.py", "datasets.py", "models.py", "models_v2.py", "wind.py", "cli.py", "cli_v2.py", "registry.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"frozen runtime unchanged: {name}")
    R = load(RULE); pb = load(PBLOCK); p25c = load(D / "step25c-test02-protocol.json"); r25c = {r["windowId"]: r for r in load(D / "step25c-run-manifest.json")["runs"] if r["alpha"] == 0.002}
    check(pb["status"] == "PREREGISTRATION LOCKED" and pb["ruleSha256"] == sha(RULE) and pb["ruleId"] == R["ruleId"] == "depth-sensitivity-step27" and pb["baseCommit"] == "0c2b3cb7", "Phase B preregistration bound to the locked STEP 27 rule")
    for t in ("tools/research/build_step27_forcing.py", "tools/research/run_step27_phase_b.py", "tools/research/evaluate_step27_phase_b.py", "tools/research/check_step27_depth_execution.py", "tools/research/glorys_reader_step25c.py", "tools/research/replay_step25c_run.py"):
        check(pb["tools"].get(t) == sha(ROOT / t), f"tool locked before execution: {t}")
    check(all(abs(pb["depths"][d]["nativeLevelMeters"] - LEVELS[d]) < 1e-5 for d in DEPTHS) and [pb["depths"][d]["targetMeters"] for d in DEPTHS] == [5, 10, 15, 20] and pb["control"] == "D15" and pb["runPlan"] == {"D05": 6, "D10": 6, "D15": 6, "D20": 6} and pb["alpha"] == {"value": 0.002, "alpha0Runs": 0, "search": False} and pb["hycomRuns"] == 0, "depth set / control / plan / alpha")
    lr = pb["labelRules"]; check(lr["primaryHorizonHours"] == 72 and lr["consistencyFraction"] == 2 / 3 and lr["signTestMinimumN"] == 10 and set(lr["pairLabels"]) == {"DEPTH-SPECIFIC_DIFFERENCE_OBSERVED", "NO_CLEAR_DEPTH-SPECIFIC_DIFFERENCE"} and set(lr["overallLabels"]) == {"DEPTH_SENSITIVITY_OBSERVED", "NO_CLEAR_DEPTH_SENSITIVITY"} and lr["selection"] is False, "label rules preregistered")
    p25w = {w["windowId"]: w for w in p25c["windows"]}
    check([w["windowId"] for w in pb["windows"]] == WINDOWS and all(w["t0"] == p25w[w["windowId"]]["t0"] and w["drifterIds"] == p25w[w["windowId"]]["drifterIds"] and w["releasePositions"] == p25w[w["windowId"]]["releasePositions"] and w["computationArea"] == p25w[w["windowId"]]["computationArea"] and w["wind"] == p25w[w["windowId"]]["wind"] and w["role"] == p25w[w["windowId"]]["role"] for w in pb["windows"]), "six windows identical to STEP 25C; KE-H2 absent")
    if phase == "A":
        check(not any(x.exists() for x in (FORCING, RUNS, REPLAYM, EVAL, TABLE, SUMMARY)) and not (ROOT / "data/research/step27/forcing").exists() and not (ROOT / "data/research/step27/trajectories").exists(), "Phase B lock: no forcing/run/evaluation outputs")
        print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "phase": "A"}, ensure_ascii=False, indent=2)); return 0 if not failures else 1
    fm = load(FORCING); runs = load(RUNS); rp = load(REPLAYM); ev = load(EVAL); S = load(SUMMARY)
    sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
    from research_runtime.datasets import validate_dataset, digest  # noqa: E402
    from research_runtime import models_v2  # noqa: E402
    check(fm["ruleSha256"] == sha(RULE) == runs["ruleSha256"] == ev["ruleSha256"] and fm["phaseBPreregistrationSha256"] == sha(PBLOCK) == runs["phaseBPreregistrationSha256"] == ev["phaseBPreregistrationSha256"] and runs["forcingManifestSha256"] == sha(FORCING) and ev["runManifestSha256"] == sha(RUNS) and rp["runManifestSha256"] == sha(RUNS), "output chain cross references")
    check(fm["reader"]["sha256"] == pb["tools"]["tools/research/glorys_reader_step25c.py"] and fm["sameGridAndFramesAcrossDepths"] is True and len(fm["records"]) == 24, "forcing manifest: reader SHA, same grid/frames across depths, 24 records")
    m27b = load(D / "step27-depth-acquisition-manifest.json"); m27c = load(D / "step27c-d20-acquisition-manifest.json"); f25c = {w["windowId"]: w for w in load(D / "step25c-glorys-forcing-manifest.json")["windows"]}
    raw = {("D05", x["windowId"]): x for x in next(d for d in m27b["depths"] if d["id"] == "D05")["windows"]} | {("D10", x["windowId"]): x for x in next(d for d in m27b["depths"] if d["id"] == "D10")["windows"]} | {("D20", x["windowId"]): x for x in m27c["depths"][0]["windows"]}
    recs = {(r["depth"], r["windowId"]): r for r in fm["records"]}; grids = {}
    for (dep, wid), r in recs.items():
        path = ROOT / r["normalized"]["file"]; check(path.exists() and sha(path) == r["normalized"]["fileSha256"], f"forcing file hash: {dep}/{wid}")
        ds = validate_dataset(load(path)); m = ds["manifest"]; g = ds["grid"]; grids[(dep, wid)] = (g["lon"], g["lat"], g["timeUTC"])
        check(m["sha256"] == r["normalized"]["gridSha256"] == digest(g) and abs(m["surfaceDepthMeters"] - LEVELS[dep]) <= 0.01 and abs(r["nativeLevelMeters"] - LEVELS[dep]) <= 0.01 and m["timeStepSeconds"] == 86400 and m["productId"] == "GLOBAL_MULTIYEAR_PHY_001_030" and m["cmemsDatasetId"] == "cmems_mod_glo_phy_my_0.083deg_P1D-m", f"depth identity / product: {dep}/{wid} ({m['surfaceDepthMeters']})")
        if dep == "D15":
            check(r["normalized"]["file"] == f25c[wid]["normalized"]["file"] and r["normalized"]["fileSha256"] == f25c[wid]["normalized"]["fileSha256"], f"D15 = STEP 25C forcing: {wid}")
        else:
            rw = raw[(dep, wid)]; check(rw["status"] == "ok" and sha(ROOT / rw["file"]) == rw["sha256"] == r["rawSha256"] == m["sourceSha256"] and abs(rw["returnedDepthLevelsMeters"][0] - m["surfaceDepthMeters"]) < 1e-9, f"raw source SHA / native level: {dep}/{wid}")
    for wid in WINDOWS:
        check(all(grids[(dep, wid)] == grids[("D15", wid)] for dep in ALT), f"same grid and frames across depths: {wid}")
    check(runs["status"] == "STEP27_RUNS_PASS" and runs["modelRunCount"] == 24 and runs["depthRuns"] == {"D05": 6, "D10": 6, "D15": 6, "D20": 6} and runs["alpha"] == 0.002 and runs["alpha0Runs"] == 0 and runs["hycomRuns"] == 0 and runs["modelSourceSha256"] == models_v2.model_source_sha256() == pb["modelSourceSha256"] and runs["runnerSha256"] == pb["tools"]["tools/research/run_step27_phase_b.py"] and runs["replayToolSha256"] == pb["tools"]["tools/research/replay_step25c_run.py"] and runs["readerSha256"] == pb["tools"]["tools/research/glorys_reader_step25c.py"], "24 runs, 6 per depth, alpha 0.002 only, no HYCOM, SHAs bound")
    order = [(r["depth"], r["windowId"]) for r in runs["runs"]]
    check(order == [("D15", w) for w in WINDOWS] + [(d, w) for w in WINDOWS for d in ("D05", "D10", "D20")], "execution order: D15 gate phase, then per window D05/D10/D20")
    check(runs["d15Reproduction"]["pass"] is True and all(runs["d15Reproduction"]["windows"].get(w) is True for w in WINDOWS) and S["d15Reproduction"]["pass"] is True, "D15 reproduction gate recorded PASS")
    pw = {w["windowId"]: w for w in pb["windows"]}; rmap = {r["runId"]: r for r in rp["replays"]}
    for r in runs["runs"]:
        w = pw[r["windowId"]]; dep = r["depth"]; rec = recs[(dep, r["windowId"])]
        check(r["status"] == "COMPLETED" and r["replayMatched"] is True and r["replay"]["replayResultSha256"] == r["resultArraySha256"] and r["replay"]["replaySpecSha256"] == r["specSha256"] and rmap[r["runId"]]["matched"] is True and rmap[r["runId"]]["replayResultSha256"] == r["resultArraySha256"], f"completed / replay matched: {r['runId']}")
        check(r["alpha"] == 0.002 and r["integrationStepSeconds"] == 300 and r["outputStepSeconds"] == 900 and r["durationSeconds"] == 259200 and abs(r["nativeDepthMeters"] - LEVELS[dep]) <= 0.01 and r["depthTargetMeters"] == pb["depths"][dep]["targetMeters"], f"configuration / depth: {r['runId']}")
        check(r["drifterIds"] == sorted(w["drifterIds"]) and r["released"] == w["drifterCount"] and r["area"] == w["computationArea"] and r["windGridSha256"] == w["wind"]["gridSha256"] and r["forcingFile"] == rec["normalized"]["file"] and r["forcingFileSha256"] == rec["normalized"]["fileSha256"] == sha(ROOT / r["forcingFile"]) and r["gridSha256"] == rec["normalized"]["gridSha256"], f"drifters / area / wind / forcing binding: {r['runId']}")
        res_path = ROOT / r["resultFile"]; csv_path = ROOT / r["trajectoriesFile"]
        check(sha(res_path) == r["resultSha256"] and sha(csv_path) == r["trajectoriesSha256"], f"result / trajectory hashes: {r['runId']}")
        res = load(res_path); prov = res["provenance"]
        check(digest(res["trajectories"]) == r["resultArraySha256"] and prov["windage"]["alpha"] == 0.002 and prov["datasetSha256"] == r["gridSha256"] and prov["windDatasetSha256"] == r["windGridSha256"] and abs(prov["surfaceDepthMeters"] - LEVELS[dep]) <= 0.01 and prov["integrationStepSeconds"] == 300 and prov["outputStepSeconds"] == 900 and len(res["trajectories"]) == w["drifterCount"] and all(tr["samples"][0]["timeUTC"] == w["t0"] for tr in res["trajectories"]), f"result provenance / continuous single trajectory: {r['runId']}")
        if dep == "D15":
            ref = r25c[r["windowId"]]
            check(r["reproduction"]["pass"] is True and r["resultArraySha256"] == ref["resultArraySha256"] and csv_rows_without_run_id(csv_path) == csv_rows_without_run_id(ROOT / ref["trajectoriesFile"]) and sha(ROOT / ref["trajectoriesFile"]) == ref["trajectoriesSha256"], f"D15 == STEP 25C (result array + CSV rows without run_id): {r['windowId']}")
    check(rp["allMatched"] is True and rp["matchedCount"] == rp["total"] == 24, "replay manifest 24/24")
    # independent M3 recomputation + pairing
    table = {}
    with open(TABLE, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            table[(row["unit"], row["drifter_id"])] = row
    n_total = 0; mism = 0; compared = 0
    for wid in WINDOWS:
        w = pw[wid]; t0 = datetime.strptime(w["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc); t1 = t0 + timedelta(hours=72)
        obs = {}
        for path in sorted((ROOT / "data/research/step15/noaa-gdp-hourly-qc").glob(f"{w['region']}-{w['t0'][:4]}-q*.csv")):
            with open(path, encoding="utf-8", newline="") as fh:
                rd = csv.reader(fh); next(rd); next(rd)
                for r in rd:
                    if r[0] in w["drifterIds"]:
                        t = datetime.strptime(r[1], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                        if t0 <= t <= t1:
                            obs.setdefault(r[0], {})[r[1]] = (float(r[3]), float(r[2]))
        pts = {dep: positions(ROOT / next(r for r in runs["runs"] if r["windowId"] == wid and r["depth"] == dep)["trajectoriesFile"]) for dep in DEPTHS}
        for did in w["drifterIds"]:
            n_total += 1; row = table.get((wid, did)); check(row is not None and row["role"] == w["role"], f"pairing: table row {wid}/{did}")
            if not row:
                continue
            for h in (24, 48, 72):
                ts = (t0 + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ")
                for dep in DEPTHS:
                    pos = pts[dep].get(did, {}).get(ts); ob = obs.get(did, {}).get(ts); mine = hav(*pos, *ob) if pos and ob else NA; pub = row[f"error_{dep}_{h}h"]; compared += 1
                    if not ((mine == NA and pub == NA) or (mine != NA and pub != NA and abs(round(mine, 3) - float(pub)) <= 0.001)):
                        mism += 1
                for dep in ALT:
                    e, e15, dv = row[f"error_{dep}_{h}h"], row[f"error_D15_{h}h"], row[f"delta_{dep}_{h}h"]
                    check((e == NA or e15 == NA) == (dv == NA) and (dv == NA or abs(float(e) - float(e15) - float(dv)) <= 0.0015), f"delta = E_{dep} - E_D15: {wid}/{did}/{h}h")
    check(mism == 0 and compared == n_total * 12, f"independent M3 recomputation ({mism} mismatches of {compared})")
    check(n_total == 35 and len(table) == 35 and S["strata"]["overall"]["n_drifters"] == 35 and S["strata"]["calibration"]["n_drifters"] == 23 and S["strata"]["holdout"]["n_drifters"] == 12 and set(S["perWindow"]) == set(WINDOWS), "pairing counts 35 = 23 + 12; per-window reported")
    for name, b in S["strata"].items():
        for h in (24, 48, 72):
            for dep in ALT:
                o = b[f"{h}h"][f"{dep}_vs_D15"]; check(o["n"] + o["notAvailable"] == b["n_drifters"] and o["wins_alt"] + o["losses_alt"] + o["ties"] == o["n"], f"W/L/T arithmetic / no exclusion: {name} {h}h {dep}")
        check(all(k in b for k in ("M1_endpoint72h", "M2_totalPath", "M4_separation72h_vs_D15", "M5_observed72h")), f"M1/M2/M4/M5: {name}")
    check(S["outlierPolicyApplied"] == {"removed": 0, "trimmed": 0, "winsorized": 0, "weighted": 0, "deleted": 0, "postHocExclusions": 0} and S["depthSelection"] == "NONE" and S["preferredOperationalDepth"] == "NONE" and S["holdoutUsedForSelection"] is False and S["reranking"] is False and S["control"] == "D15" and S["KE-H2"].startswith("EXCLUDED"), "no outlier removal / no depth selection / KE-H2 excluded")
    check(all(abs(S["depths"][d]["nativeDepthMeters"] - LEVELS[d]) < 1e-5 and S["depths"][d]["runs"] == 6 for d in DEPTHS) and S["step25cCrossCheck"]["allAgree"] is True, "summary depths / D15 errors agree with STEP 25C")
    tol = 1e-6
    def exp_pair(b):
        med, w_, l_ = b["delta"]["median_delta"], b["wins_alt"], b["losses_alt"]
        if med is None or w_ + l_ == 0 or abs(med) <= tol:
            return "NO_CLEAR_DEPTH-SPECIFIC_DIFFERENCE"
        return "DEPTH-SPECIFIC_DIFFERENCE_OBSERVED" if (w_ if med < 0 else l_) / (w_ + l_) >= 2 / 3 else "NO_CLEAR_DEPTH-SPECIFIC_DIFFERENCE"
    for name, b in S["strata"].items():
        exp = {dep: exp_pair(b["72h"][f"{dep}_vs_D15"]) for dep in ALT}
        check({dep: S["descriptiveLabel"]["pairs"][name][dep]["label"] for dep in ALT} == exp and S["descriptiveLabel"]["byStratum"][name] == ("DEPTH_SENSITIVITY_OBSERVED" if any(v == "DEPTH-SPECIFIC_DIFFERENCE_OBSERVED" for v in exp.values()) else "NO_CLEAR_DEPTH_SENSITIVITY"), f"labels per preregistered rule: {name}")
    check(S["descriptiveLabel"]["primary"] == S["descriptiveLabel"]["byStratum"]["overall"], "primary label = overall")
    check(not SELECTION.search(json.dumps({k: v for k, v in S.items() if k not in ("strata", "perWindow")}, ensure_ascii=False)), "no depth-selection language")
    for st in pb["requiredStatements"]:
        check(st in S["statements"], f"statement: {st[:40]}")
    check(ev["tableSha256"] == sha(TABLE) and ev["summarySha256"] == sha(SUMMARY) and ev["observationSha256"] == pb["observationSha256"], "evaluation hashes / observation SHA")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/evaluate_step27_phase_b.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        check(proc.returncode == 0 and all(sha(Path(tmp) / n) == sha(D / n) for n in ("step27-depth-paired-table.csv", "step27-depth-execution-summary.json", "step27-depth-evaluation.json")), "reproducibility: evaluation re-run byte-identical")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "phase": "B", "label": S["descriptiveLabel"]["primary"], "pairs": {dep: S["descriptiveLabel"]["pairs"]["overall"][dep]["label"] for dep in ALT}, "modelRunCount": runs["modelRunCount"], "drifters": n_total, "m3Compared": compared}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
