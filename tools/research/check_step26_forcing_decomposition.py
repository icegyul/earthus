"""Independent validator for STEP 26 Phase B. `--phase A` (Phase B lock: tools registered, no outputs) or `--phase B` (full). exit 0 = PASS.
Verifies: ancestry (incl. 86266b3a); locked STEP 26 Phase A artifacts + STEP 17-25C locks + frozen runtime; Condition C identity (STEP 25C
normalized GLORYS, 15.81007 m, 86400 s); Condition D derivation (algorithm, bilinear, stencil rule, target grid axes SHA recomputed, derived
grid/field SHAs recomputed from the derived files, independent re-derivation to a temp dir must reproduce every field SHA); 6 C runs + 6 D
runs, COMPLETED, replay matched; C == STEP 25C reproduction (result-array SHA + CSV rows without run_id, recomputed here); no HYCOM rerun;
no Condition B execution; alpha 0.002 only (no alpha 0 runs); exact depths; exact horizons; independent M3 recomputation for A/C/D;
M1/M2/M4/M5 present; pairing (n + notAvailable = drifters); KE-H2 exclusion; labels per preregistered rules; no outlier manipulation;
evaluator re-run byte-identical. Deterministic output."""
import csv
import hashlib
import json
import math
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
RULE, PREREG, PBLOCK = D / "step26-forcing-decomposition-rule.json", D / "step26-preregistration.json", D / "step26-phase-b-preregistration.json"
DERIVED, RUNS, EVAL, TABLE, SUMMARY = D / "step26-derived-forcing-manifest.json", D / "step26-forcing-decomposition-manifest.json", D / "step26-evaluation.json", D / "step26-paired-table.csv", D / "step26-phase-b-summary.json"
LOCK = {"docs/research/step26-forcing-decomposition-protocol.md": "3b597d6331330d64a45f758e324f6196912e735a8cb30c96f929ef3e43047f90", "docs/research/step26-forcing-decomposition-rule.json": "b0ee1dc154998b6d2d140581636a1d11412bd57bceafbf0c0a3980697b91787c",
        "docs/research/step26-preregistration.json": "de082a8ef0ef893c4e492160eef518af1ada8c6de8e83f440cc37fcde10814ce", "docs/research/step26-experiment-matrix.json": "9486d60eb9d7c139b47d513ce24c8c173e279c12f8783df88301dfafb6c307f0",
        "docs/research/step26-summary.json": "d908506d058180c12017cc887b597b007fefb9c5a794a10c4eaba8abf9d25b03", "tools/research/check_step26_preregistration.py": "4f88184455b978670913a68f91dffe52d52607ede6457740ed920d4687e23b7e",
        "docs/research/step25c-test02-protocol.json": "7ff8468ea8399b8bf9d563980a184203b1b69c55a52cf7a493d1c140c97901ab", "docs/research/step25c-run-manifest.json": "75d6a52b212b40e9e331bd06f362e888e1592873e150f942f8b0320add307e2d",
        "docs/research/step25c-paired-table.csv": "3a5c6b1a339c050a053279514299004a7be5bd614cf6e542433953888c78e002", "docs/research/step25c-summary.json": "42965f31980b47ca9f5dedecc9976a969a6e00d22e9bf227464fbbeea460e78d",
        "docs/research/step25c-glorys-forcing-manifest.json": "9febefe0d4e4ecc24f98fee13c6aa5d788d4ee34b94fd97626e5305163f72e19", "docs/research/step25b-glorys-acquisition-manifest.json": "8dfd07815328074fefa029a41e911130984386d50d3ca86cd8c123e1f0d8b734",
        "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4", "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd",
        "docs/research/step20-calibration-manifest.json": "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498", "docs/research/step20-b6-holdout-manifest.json": "968da55a4553c00f373d6a0f26bc2b1c9e3f3af421d37db7a1e58e99a5727653",
        "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86", "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474",
        "tools/research/replay_step25c_run.py": "5dd8c14da33dcd75c50c8e52dc517456d46a1a2f4ad38b3918687d16b4a73ff5", "tools/research/glorys_reader_step25c.py": "11b7d987434a55a9e42a9776e851fad49b8ec65d2df0f23130c7a7e6234ab63e"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "4bb4342b", "e0e7cfd2", "db6cea2f", "2841f511", "929d3468", "c974ce42", "86266b3a")
WINDOWS = ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H3"]
RADIUS_M = 6371008.8
NA = "NOT_AVAILABLE"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def axes_sha(grid):
    return hashlib.sha256(json.dumps({"lon": grid["lon"], "lat": grid["lat"]}, separators=(",", ":")).encode()).hexdigest()


def plane_sha(plane):
    return hashlib.sha256(json.dumps(plane, separators=(",", ":")).encode()).hexdigest()


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
    check(pb["status"] == "PREREGISTRATION LOCKED" and pb["ruleSha256"] == sha(RULE) and pb["phaseALock"] == "86266b3a" and pb["ruleId"] == R["ruleId"], "Phase B preregistration bound to the locked rule")
    for t in ("tools/research/derive_step26_coarse.py", "tools/research/run_step26_phase_b.py", "tools/research/evaluate_step26_phase_b.py", "tools/research/check_step26_forcing_decomposition.py", "tools/research/glorys_reader_step25c.py", "tools/research/replay_step25c_run.py"):
        check(pb["tools"].get(t) == sha(ROOT / t), f"tool locked before execution: {t}")
    check(pb["runPlan"] == {"A": 0, "B": 0, "C": 6, "D": 6} and pb["alpha"] == {"value": 0.002, "alpha0Runs": 0, "search": False} and pb["hycomRerun"] is False and pb["conditionBExecuted"] is False, "Phase B plan: 6 C + 6 D, alpha 0.002 only, no HYCOM rerun, no B")
    lr = pb["labelRules"]; check(lr["primaryHorizonHours"] == 72 and lr["consistencyFraction"] == 2 / 3 and lr["signTestMinimumN"] == 10 and set(lr["comparison2Labels"]) == {"SPATIAL_REPRESENTATION_DIFFERENCE_OBSERVED", "NO_CLEAR_SPATIAL_REPRESENTATION_DIFFERENCE"} and set(lr["comparison4Labels"]) == {"GLORYS_DESCRIPTIVELY_FAVORED", "HYCOM_DESCRIPTIVELY_FAVORED", "NO_CLEAR_DESCRIPTIVE_DIFFERENCE"}, "label rules preregistered")
    if phase == "A":
        check(not any(x.exists() for x in (DERIVED, RUNS, EVAL, TABLE, SUMMARY)) and not (ROOT / "data/research/step26").exists(), "Phase B lock: no derivation/run/evaluation outputs")
        print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "phase": "A"}, ensure_ascii=False, indent=2)); return 0 if not failures else 1
    dm = load(DERIVED); runs = load(RUNS); ev = load(EVAL); S = load(SUMMARY)
    sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
    from research_runtime.datasets import validate_dataset, digest  # noqa: E402
    from research_runtime import models_v2  # noqa: E402
    check(dm["ruleSha256"] == sha(RULE) and dm["algorithm"] == "glorys-to-hycom-grid-bilinear/1" and dm["derivationScript"]["sha256"] == pb["tools"]["tools/research/derive_step26_coarse.py"] and dm["windowCount"] == 6 and dm["modelRunCount"] == 0, "derived forcing manifest binding")
    check(runs["ruleSha256"] == sha(RULE) == ev["ruleSha256"] and runs["phaseBPreregistrationSha256"] == sha(PBLOCK) == ev["phaseBPreregistrationSha256"] and runs["derivedForcingManifestSha256"] == sha(DERIVED) == ev["derivedForcingManifestSha256"] and ev["runManifestSha256"] == sha(RUNS), "output chain cross references")
    check(runs["status"] == "STEP26_RUNS_PASS" and runs["modelRunCount"] == 12 and runs["conditionRuns"] == {"A": 0, "B": 0, "C": 6, "D": 6} and runs["hycomRerun"] is False and runs["conditionBExecuted"] is False and runs["alpha"] == 0.002 and runs["alpha0Runs"] == 0, "12 runs: 6 C + 6 D, no HYCOM rerun, no B, alpha 0.002 only")
    check(runs["modelSourceSha256"] == models_v2.model_source_sha256() == R["modelMechanics"]["modelSourceSha256"] and runs["runnerSha256"] == pb["tools"]["tools/research/run_step26_phase_b.py"] and runs["replayToolSha256"] == pb["tools"]["tools/research/replay_step25c_run.py"] and runs["readerSha256"] == pb["tools"]["tools/research/glorys_reader_step25c.py"] and runs["derivationScriptSha256"] == dm["derivationScript"]["sha256"], "runner / replay / reader / derivation / model source SHAs")
    rw = {w["windowId"]: w for w in R["windows"]}; dw = {w["windowId"]: w for w in dm["windows"]}
    check([w["windowId"] for w in dm["windows"]] == WINDOWS and [(r["condition"], r["windowId"]) for r in runs["runs"]] == [("C", w) for w in WINDOWS] + [("D", w) for w in WINDOWS], "exact six windows; run order C then D")
    for wid in WINDOWS:
        w = rw[wid]; d = dw[wid]
        # condition C identity
        cds = validate_dataset(load(ROOT / w["glorysNormalized"]["file"])); cm = cds["manifest"]
        check(sha(ROOT / w["glorysNormalized"]["file"]) == w["glorysNormalized"]["fileSha256"] and cm["sha256"] == w["glorysNormalized"]["gridSha256"] and cm["surfaceDepthMeters"] == 15.81007 and cm["timeStepSeconds"] == 86400 and cm["productId"] == "GLOBAL_MULTIYEAR_PHY_001_030" and cm["cmemsDatasetId"] == "cmems_mod_glo_phy_my_0.083deg_P1D-m" and cm["sourceSha256"] == w["glorysNormalized"]["rawSha256"], f"condition C identity: {wid}")
        # condition D derivation
        hy = load(ROOT / w["hycomGrid"]["file"])["grid"]; check(axes_sha(hy) == w["hycomGrid"]["axesSha256"] == d["targetGrid"]["axesSha256"] and sha(ROOT / w["hycomGrid"]["file"]) == w["hycomGrid"]["fileSha256"], f"target grid identity: {wid}")
        dds = validate_dataset(load(ROOT / d["derived"]["file"])); dg = dds["grid"]; dmn = dds["manifest"]
        check(sha(ROOT / d["derived"]["file"]) == d["derived"]["fileSha256"] and dmn["sha256"] == d["derived"]["gridSha256"] == digest(dg) and dg["lon"] == hy["lon"] and dg["lat"] == hy["lat"] and dg["timeUTC"] == cds["grid"]["timeUTC"] and dmn["surfaceDepthMeters"] == 15.81007 and dmn["timeStepSeconds"] == 86400 and dmn["sourceSha256"] == cm["sourceSha256"], f"derived forcing: grid = HYCOM axes, time = C, depth, source: {wid}")
        check(all(plane_sha(dg["u"][k]) == f["uSha256"] and plane_sha(dg["v"][k]) == f["vSha256"] and f["timeUTC"] == dg["timeUTC"][k] for k, f in enumerate(d["derived"]["fields"])) and len(d["derived"]["fields"]) == len(dg["timeUTC"]), f"derived field SHAs recomputed: {wid}")
        hist = dmn["processingHistory"][-1]; check(hist["operation"] == "glorys-to-hycom-grid-bilinear/1" and hist["interpolation"] == "bilinear" and all(hist[k] is False for k in ("smoothing", "extrapolation", "nearestNeighbourSubstitution", "zeroFill", "temporalTransformation", "verticalInterpolation")) and d["interpolation"] == "bilinear" and d["maskRule"] == R["conditions"][3]["spatial"]["stencilRule"], f"derivation rules recorded: {wid}")
        # spot check of the bilinear rule and the stencil mask at every node of the first frame (independent implementation)
        from bisect import bisect_right
        g = cds["grid"]; mismatch = 0; maskbad = 0
        for j, y in enumerate(hy["lat"]):
            yi = min(max(0, bisect_right(g["lat"], y) - 1), len(g["lat"]) - 2); fy = (y - g["lat"][yi]) / (g["lat"][yi + 1] - g["lat"][yi])
            for i, x in enumerate(hy["lon"]):
                xi = min(max(0, bisect_right(g["lon"], x) - 1), len(g["lon"]) - 2); fx = (x - g["lon"][xi]) / (g["lon"][xi + 1] - g["lon"][xi])
                wet = not (g["landMask"][yi][xi] or g["landMask"][yi][xi + 1] or g["landMask"][yi + 1][xi] or g["landMask"][yi + 1][xi + 1])
                if wet != (not dg["landMask"][j][i]) or (not wet and dg["u"][0][j][i] is not None):
                    maskbad += 1
                elif wet:
                    a, b, c, dd = g["u"][0][yi][xi], g["u"][0][yi][xi + 1], g["u"][0][yi + 1][xi], g["u"][0][yi + 1][xi + 1]
                    if abs((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + dd * fx) * fy - dg["u"][0][j][i]) > 1e-12:
                        mismatch += 1
        check(mismatch == 0 and maskbad == 0, f"independent bilinear/stencil recomputation (frame 0): {wid} ({mismatch} value, {maskbad} mask)")
    # runs
    for r in runs["runs"]:
        w = rw[r["windowId"]]
        check(r["status"] == "COMPLETED" and r["replayMatched"] is True and r["replay"]["replayResultSha256"] == r["resultArraySha256"] and r["alpha"] == 0.002 and r["integrationStepSeconds"] == 300 and r["outputStepSeconds"] == 900 and r["durationSeconds"] == 259200 and r["depthMeters"] == 15.81007, f"run completed / replay / configuration: {r['runId']}")
        check(r["drifterIds"] == sorted(w["drifterIds"]) and r["released"] == w["drifterCount"] and r["area"] == w["computationArea"] and r["windGridSha256"] == w["wind"]["gridSha256"], f"drifters / area / wind: {r['runId']}")
        expected_grid = w["glorysNormalized"]["gridSha256"] if r["condition"] == "C" else dw[r["windowId"]]["derived"]["gridSha256"]
        check(r["gridSha256"] == expected_grid and sha(ROOT / r["forcingFile"]) == r["forcingFileSha256"], f"forcing binding: {r['runId']}")
        res = load(ROOT / r["resultFile"]); prov = res["provenance"]
        check(sha(ROOT / r["resultFile"]) == r["resultSha256"] and sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"] and digest(res["trajectories"]) == r["resultArraySha256"] and prov["windage"]["alpha"] == 0.002 and prov["datasetSha256"] == r["gridSha256"] and prov["surfaceDepthMeters"] == 15.81007 and len(res["trajectories"]) == w["drifterCount"] and all(tr["samples"][0]["timeUTC"] == w["t0"] for tr in res["trajectories"]), f"result hashes / provenance: {r['runId']}")
        if r["condition"] == "C":
            ref = r25c[r["windowId"]]
            check(r["reproduction"]["pass"] is True and r["resultArraySha256"] == ref["resultArraySha256"] == r["reproduction"]["referenceResultArraySha256"] and csv_rows_without_run_id(ROOT / r["trajectoriesFile"]) == csv_rows_without_run_id(ROOT / ref["trajectoriesFile"]) and sha(ROOT / ref["trajectoriesFile"]) == ref["trajectoriesSha256"], f"C == STEP 25C reproduction (result array + CSV rows without run_id): {r['windowId']}")
    check(runs["conditionCReproduction"]["pass"] is True and S["conditions"]["C"]["reproductionAgainstStep25C"] is True, "C reproduction gate recorded PASS")
    # independent M3 recomputation + pairing
    table = {}
    with open(TABLE, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            table[(row["unit"], row["drifter_id"])] = row
    n_total = 0; mism = 0; compared = 0
    for wid in WINDOWS:
        w = rw[wid]; t0 = datetime.strptime(w["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc); t1 = t0 + timedelta(hours=72)
        obs = {}
        for path in sorted((ROOT / "data/research/step15/noaa-gdp-hourly-qc").glob(f"{w['region']}-{w['t0'][:4]}-q*.csv")):
            with open(path, encoding="utf-8", newline="") as fh:
                rd = csv.reader(fh); next(rd); next(rd)
                for r in rd:
                    if r[0] in w["drifterIds"]:
                        t = datetime.strptime(r[1], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                        if t0 <= t <= t1:
                            obs.setdefault(r[0], {})[r[1]] = (float(r[3]), float(r[2]))
        pts = {"A": positions(ROOT / w["hycomReference"]["file"]), "C": positions(ROOT / next(r for r in runs["runs"] if r["windowId"] == wid and r["condition"] == "C")["trajectoriesFile"]), "D": positions(ROOT / next(r for r in runs["runs"] if r["windowId"] == wid and r["condition"] == "D")["trajectoriesFile"])}
        for did in w["drifterIds"]:
            n_total += 1; row = table.get((wid, did)); check(row is not None and row["role"] == w["role"], f"pairing: table row {wid}/{did}")
            if not row:
                continue
            for h in (24, 48, 72):
                ts = (t0 + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ")
                for lab in ("A", "C", "D"):
                    pos = pts[lab].get(did, {}).get(ts); ob = obs.get(did, {}).get(ts); mine = hav(*pos, *ob) if pos and ob else NA; pub = row[f"error_{lab}_{h}h"]; compared += 1
                    if not ((mine == NA and pub == NA) or (mine != NA and pub != NA and abs(round(mine, 3) - float(pub)) <= 0.001)):
                        mism += 1
                for dcol, x, y in (("delta_spatial", "C", "D"), ("delta_product", "C", "A")):
                    ex, ey, dv = row[f"error_{x}_{h}h"], row[f"error_{y}_{h}h"], row[f"{dcol}_{h}h"]
                    check((ex == NA or ey == NA) == (dv == NA) and (dv == NA or abs(float(ex) - float(ey) - float(dv)) <= 0.0015), f"{dcol} = E_{x} - E_{y}: {wid}/{did}/{h}h")
    check(mism == 0 and compared == n_total * 9, f"independent M3 recomputation ({mism} mismatches of {compared})")
    check(n_total == 35 and len(table) == 35 and S["strata"]["overall"]["n_drifters"] == 35 and S["strata"]["calibration"]["n_drifters"] == 23 and S["strata"]["holdout"]["n_drifters"] == 12 and set(S["perWindow"]) == set(WINDOWS), "pairing counts 35 = 23 + 12; per-window reported")
    for name, b in S["strata"].items():
        for h in (24, 48, 72):
            for comp in ("comparison2_C_vs_D", "comparison4_C_vs_A"):
                o = b[f"{h}h"][comp]; check(o["n"] + o["notAvailable"] == b["n_drifters"] and o["wins_C"] + o["losses_C"] + o["ties"] == o["n"], f"no exclusion: {name} {h}h {comp}")
        check(all(k in b for k in ("M1_endpoint72h", "M2_totalPath", "M4_separation72h", "M5_observed72h")), f"M1/M2/M4/M5: {name}")
    check(S["horizons"] == [24, 48, 72] and S["tieToleranceKm"] == 1e-6 and S["outlierPolicyApplied"] == {"removed": 0, "trimmed": 0, "winsorized": 0, "weighted": 0, "deleted": 0, "manualExclusions": 0} and S["parameterSelection"] == "NONE" and S["modelSelection"] == "NONE" and S["hycomRerun"] is False and S["conditionBExecuted"] is False, "horizons / tie / no outlier manipulation / no selection")
    check(S["comparisons"]["1"]["status"] == "BLOCKED" and S["comparisons"]["3"]["status"] == "BLOCKED" and S["conditions"]["B"]["status"] == "BLOCKED" and S["KE-H2"].startswith("EXCLUDED") and "KE-H2" not in WINDOWS, "Comparisons 1/3 BLOCKED; KE-H2 excluded")
    check(S["depthAudit"]["hycomDepthMeters"] == "15.000 m" and S["depthAudit"]["glorysDepthMeters"] == "15.810070 m" and S["depthAudit"]["depthDifferenceMeters"] == "0.810070 m" and S["depthAudit"]["attributedInStep26"] is False, "depth audit explicit")
    check(S["step25cCrossCheck"]["allAgree"] is True and S["comparisons"]["4"]["reproducesStep25C"] is True, "Comparison 4 reproduces STEP 25C paired deltas")
    tol = 1e-6; b2 = S["strata"]["overall"]["72h"]["comparison2_C_vs_D"]; b4 = S["strata"]["overall"]["72h"]["comparison4_C_vs_A"]
    def exp2(b):
        med, w_, l_ = b["delta"]["median_delta"], b["wins_C"], b["losses_C"]
        if med is None or w_ + l_ == 0 or abs(med) <= tol:
            return "NO_CLEAR_SPATIAL_REPRESENTATION_DIFFERENCE"
        return "SPATIAL_REPRESENTATION_DIFFERENCE_OBSERVED" if (w_ if med < 0 else l_) / (w_ + l_) >= 2 / 3 else "NO_CLEAR_SPATIAL_REPRESENTATION_DIFFERENCE"
    def exp4(b):
        med, w_, l_ = b["delta"]["median_delta"], b["wins_C"], b["losses_C"]
        if med is None or w_ + l_ == 0:
            return "NO_CLEAR_DESCRIPTIVE_DIFFERENCE"
        if med < -tol and w_ / (w_ + l_) >= 2 / 3:
            return "GLORYS_DESCRIPTIVELY_FAVORED"
        if med > tol and l_ / (w_ + l_) >= 2 / 3:
            return "HYCOM_DESCRIPTIVELY_FAVORED"
        return "NO_CLEAR_DESCRIPTIVE_DIFFERENCE"
    check(S["descriptiveLabel"]["comparison2"]["primary"] == exp2(b2) and S["descriptiveLabel"]["comparison4"]["primary"] == exp4(b4), f"labels per preregistered rules (expected {exp2(b2)} / {exp4(b4)})")
    for st in pb["requiredStatements"]:
        check(st in S["statements"], f"statement: {st[:40]}")
    check(ev["tableSha256"] == sha(TABLE) and ev["summarySha256"] == sha(SUMMARY) and ev["observationSha256"] == pb["observationSha256"], "evaluation hashes / observation SHA")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/evaluate_step26_phase_b.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        check(proc.returncode == 0 and all(sha(Path(tmp) / n) == sha(D / n) for n in ("step26-paired-table.csv", "step26-phase-b-summary.json", "step26-evaluation.json")), "reproducibility: evaluation re-run byte-identical")
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/derive_step26_coarse.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        ok = proc.returncode == 0
        if ok:
            dm2 = load(Path(tmp) / "step26-derived-forcing-manifest.json")
            ok = all(a["derived"]["gridSha256"] == b["derived"]["gridSha256"] and [(f["uSha256"], f["vSha256"]) for f in a["derived"]["fields"]] == [(f["uSha256"], f["vSha256"]) for f in b["derived"]["fields"]] for a, b in zip(dm["windows"], dm2["windows"]))
        check(ok, "derivation reproducibility: independent re-derivation reproduces every derived grid/field SHA")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "phase": "B", "comparison2": S["descriptiveLabel"]["comparison2"]["primary"], "comparison4": S["descriptiveLabel"]["comparison4"]["primary"], "modelRunCount": runs["modelRunCount"], "drifters": n_total, "m3Compared": compared}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
