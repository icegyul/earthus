"""Independent validator for STEP 29 Phase B (TEST-06 execution). `--phase A` (Phase B lock) or `--phase B` (full). exit 0 = PASS.
Checks: 1 ancestry (incl. 289815d6) · 2 immutability (STEP 17–29 locks, runtime, DATA-06 files) · 3 WW3 identity (attributes re-read) ·
4 license status LICENSE_CONFIRMED (locked STEP 29 file) · 5 WW3 file SHA · 6 KE-2 release stencil (recomputed on the WW3 nodes at t0 across
the June/July boundary) · 7 GLORYS identity (STEP 25C forcing SHAs; composite depth 15.81007 m) · 8 NCEP identity (wind file/grid SHAs =
STEP 25C) · 9 alpha values 0.002 / 0 · 10 Stokes coefficient 1.0 (treatment - control = sampled Stokes; recomputed on frame 0 of every
window) · 11 equations · 12 24 runs · 13 six windows · 14 control/treatment fairness (identical lon/lat/time/mask; only u,v differ) ·
15 trajectory completeness + replay · 16 M3 recomputed for every drifter x condition x horizon · 17 M1/M2/M4/M5 present · 18 pairing ·
19 holdout separation · 20 no outlier modification · 21 replay manifest 24/24 · 22 no alpha tuning · 23 no data substitution (only
registered sources); labels per rule; evaluator re-run byte-identical. Deterministic output."""
import csv
import hashlib
import json
import math
import re
import subprocess
import sys
import tempfile
from bisect import bisect_right
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
import netCDF4  # noqa: E402
import numpy as np  # noqa: E402

PBLOCK, FORCING, FAIR, RUNS, REPLAYM, EVAL, TABLE, SUMMARY = D / "step29-phase-b-preregistration.json", D / "step29-stokes-forcing-manifest.json", D / "step29-stokes-fairness-report.json", D / "step29-stokes-manifest.json", D / "step29-stokes-replay-manifest.json", D / "step29-stokes-evaluation.json", D / "step29-stokes-paired-table.csv", D / "step29-stokes-summary.json"
LOCK = {"docs/research/step29-stokes-license-protocol.md": "97787ac0908bc6f688b9d40763998a0e97ed4bc761496f6c6e952dc1a0ce4f70", "docs/research/step29-preregistration.json": "3a8be551f104cc49bf5602ecc26c180a9f022e9ed2340ba7d9843c69e066febf",
        "docs/research/step29-stokes-license-status.json": "8a8640ac534c1fb9b8551a4a1e777f8a96d6f6c271d896246ed13b8cf93cb24b", "docs/research/step29-stokes-experiment-design.json": "1fd0060865a65e6ec8e05d419e627d8a75943f222baf259d91a8300551887aae",
        "docs/research/step29-summary.json": "ef7fdfa382a678f6b59a6e0dc9a097514a932cf70fc7304eed360e0504f5ccb2", "tools/research/check_step29_stokes_license.py": "79edfec989d979298e12611135894f99bf01dd72ad76fc0c977b1cbd307e5834",
        "docs/research/step25c-test02-protocol.json": "7ff8468ea8399b8bf9d563980a184203b1b69c55a52cf7a493d1c140c97901ab", "docs/research/step25c-run-manifest.json": "75d6a52b212b40e9e331bd06f362e888e1592873e150f942f8b0320add307e2d",
        "docs/research/step25c-paired-table.csv": "3a5c6b1a339c050a053279514299004a7be5bd614cf6e542433953888c78e002", "docs/research/step25c-glorys-forcing-manifest.json": "9febefe0d4e4ecc24f98fee13c6aa5d788d4ee34b94fd97626e5305163f72e19",
        "docs/research/step23-data-acquisition-manifest.json": "2f47cba7e29edc06a1f71bb4e2ed9dc373910e81e1f454b80595e955fd149b9a", "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd",
        "docs/research/step28-field-summary.json": "a81350b33403e1da48384a2217e156ed9bbdaa3e1da685c17bbe08df5aab4175", "docs/research/step27-depth-execution-summary.json": "d9c54f1df827af17b25c388b71f3b57357fc80d8db713f713572cf578322ae03",
        "docs/research/step26-phase-b-summary.json": "bc242bb58cf98630c529e6c5f8dfaf1e05bce5b218ced248ced29aab22a3fce6", "tools/research/replay_step25c_run.py": "5dd8c14da33dcd75c50c8e52dc517456d46a1a2f4ad38b3918687d16b4a73ff5", "tools/research/glorys_reader_step25c.py": "11b7d987434a55a9e42a9776e851fad49b8ec65d2df0f23130c7a7e6234ab63e"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "4bb4342b", "e0e7cfd2", "db6cea2f", "2841f511", "929d3468", "c974ce42", "86266b3a", "a4474eb8", "3338c7e4", "79a0d69d", "4942421a", "289815d6")
WINDOWS = ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H3"]
ORDER = [("control", 0.002), ("treatment", 0.002), ("control", 0.0), ("treatment", 0.0)]
KEY = {("control", 0.002): "C002", ("treatment", 0.002): "T002", ("control", 0.0): "C0", ("treatment", 0.0): "T0"}
RADIUS_M = 6371008.8; NA = "NOT_AVAILABLE"
CAUSAL = re.compile(r"missing (physical )?mechanism|improves the model|\bcauses?\b|\bproves?\b|\boptimal\b|\bsuperior\b|Stokes drift (is|will) (the|going|improv)", re.I)


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


def bracket(axis, v):
    i = min(max(0, bisect_right(axis, v) - 1), len(axis) - 2); return i, (v - axis[i]) / (axis[i + 1] - axis[i])


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    phase = sys.argv[sys.argv.index("--phase") + 1] if "--phase" in sys.argv else "B"
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"2 immutability: {rel}")
    for short in COMMITS:
        check(subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() == "commit", f"1 ancestry: {short}")
    for name in ("__init__.py", "datasets.py", "models.py", "models_v2.py", "wind.py", "cli.py", "cli_v2.py", "registry.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"2 runtime unchanged: {name}")
    pb = load(PBLOCK); lic = load(D / "step29-stokes-license-status.json"); p25 = load(D / "step25c-test02-protocol.json"); f25 = {w["windowId"]: w for w in load(D / "step25c-glorys-forcing-manifest.json")["windows"]}; m23 = load(D / "step23-data-acquisition-manifest.json")
    check(pb["status"] == "PREREGISTRATION LOCKED" and pb["phaseALock"] == "289815d6" and pb["licenseStatusSha256"] == sha(D / "step29-stokes-license-status.json") and pb["experimentDesignSha256"] == sha(D / "step29-stokes-experiment-design.json"), "Phase B preregistration bound to Phase A")
    for t in ("tools/research/build_step29_forcing.py", "tools/research/run_step29_test06.py", "tools/research/evaluate_step29_test06.py", "tools/research/check_step29_stokes_execution.py", "tools/research/glorys_reader_step25c.py", "tools/research/replay_step25c_run.py"):
        check(pb["tools"].get(t) == sha(ROOT / t), f"tool locked before execution: {t}")
    check(lic["finalLicenseStatus"] == "LICENSE_CONFIRMED" and lic["modelUseAllowed"] is True, "4 license status LICENSE_CONFIRMED")
    lr = pb["labelRules"]; check(lr["primaryHorizonHours"] == 72 and lr["consistencyFraction"] == 2 / 3 and lr["tieToleranceKm"] == 1e-6 and lr["signTestMinimumN"] == 10 and set(lr["labels"]) == {"STOKES_DESCRIPTIVELY_FAVORED", "NO_CLEAR_STOKES_DIFFERENCE", "STOKES_DESCRIPTIVELY_DISFAVORED", "TEST_BLOCKED"}, "label rules preregistered")
    check(pb["runPlan"] == {"control-alpha0.002": 6, "treatment-alpha0.002": 6, "control-alpha0": 6, "treatment-alpha0": 6} and pb["stokesCoefficient"] == 1.0 and pb["alpha"] == {"primary": 0.002, "structural": 0.0, "search": False} and pb["compositeMethod"]["stokesMultipliedByAlpha"] is False, "9/10/22 plan, coefficient 1.0, alpha values fixed, no search")
    if phase == "A":
        check(not any(x.exists() for x in (FORCING, FAIR, RUNS, REPLAYM, EVAL, TABLE, SUMMARY)) and not (ROOT / "data/research/step29").exists(), "Phase B lock: no outputs")
        print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "phase": "A"}, ensure_ascii=False, indent=2)); return 0 if not failures else 1
    fm = load(FORCING); fr = load(FAIR); runs = load(RUNS); rp = load(REPLAYM); ev = load(EVAL); S = load(SUMMARY)
    from research_runtime.datasets import validate_dataset, digest  # noqa: E402
    from research_runtime import models_v2  # noqa: E402
    check(fm["phaseBPreregistrationSha256"] == sha(PBLOCK) == runs["phaseBPreregistrationSha256"] == ev["phaseBPreregistrationSha256"] and runs["forcingManifestSha256"] == sha(FORCING) and runs["fairnessReportSha256"] == sha(FAIR) and ev["runManifestSha256"] == sha(RUNS) and rp["runManifestSha256"] == sha(RUNS) and fm["builder"]["sha256"] == pb["tools"]["tools/research/build_step29_forcing.py"] and fm["licenseStatus"] == "LICENSE_CONFIRMED", "output chain cross references")
    ww3 = []
    def walk(o):
        if isinstance(o, dict):
            if "file" in o and "DATA-06" in str(o.get("file")) and "sha256" in o:
                ww3.append(o)
            for v in o.values():
                walk(v)
        if isinstance(o, list):
            for v in o:
                walk(v)
    walk(m23); ww3sha = {f["file"]: f["sha256"] for f in ww3}
    pw = {w["windowId"]: w for w in p25["windows"]}; fws = {w["windowId"]: w for w in fm["windows"]}
    check([w["windowId"] for w in fm["windows"]] == WINDOWS and all(w["status"] == "BUILT" and w["ww3Gate"]["status"] == "PASS" for w in fm["windows"]) and fr["allPass"] is True and len(fr["windows"]) == 6, "13/14 six windows built; WW3 gate PASS; fairness report allPass")
    for wid in WINDOWS:
        w = fws[wid]; p = pw[wid]; g = w["ww3Gate"]
        for f in g["files"]:
            check(f["file"] in ww3sha and ww3sha[f["file"]] == f["sha256"] == sha(ROOT / f["file"]) and f["shaVerified"] is True, f"5/23 WW3 file SHA = STEP 23 manifest (no substitution): {f['file'].split('/')[-1]}")
            with netCDF4.Dataset(ROOT / f["file"]) as ds:
                check("GLOBMULTI" in str(getattr(ds, "source", "")) and str(getattr(ds, "product_version", "")) == "1.0" and str(getattr(ds, "grid", "")) == "glob_30m" and str(getattr(ds, "distribution_statement", "")) == "No restrictions" and all(v in ds.variables for v in ("uuss", "vuss")) and all(str(ds[v].units).replace(" ", "") in ("m/s", "ms-1") for v in ("uuss", "vuss")), f"3 WW3 identity re-read: {f['file'].split('/')[-1]}")
        check(g["timeAxis"] is True and g["framesPresent"] == 25 and g["extent"] is True and g["license"] is True and g["releaseStencil"] is True and len(g["frames"]) == 25 and g["frames"][0] == p["t0"] and g["frames"][-1] == p["end"], f"7-window WW3 gate recorded: {wid}")
        # 6 KE-2 (and all) release stencil recomputed on WW3 nodes at t0
        t0 = p["t0"]; f0 = next(f for f in g["files"] if f["frameTimes"][0] <= t0 <= f["frameTimes"][1])
        with netCDF4.Dataset(ROOT / f0["file"]) as ds:
            tt = ds["time"]; times = [datetime(x.year, x.month, x.day, x.hour, x.minute, x.second, tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") for x in netCDF4.num2date(tt[:], tt.units)]; k = times.index(t0)
            m0 = np.isnan(np.ma.filled(ds["uuss"][k].astype(np.float64), np.nan)); wlon = [float(x) for x in ds["longitude"][:]]; wlat = [float(x) for x in ds["latitude"][:]]
        for d in p["releasePositions"]:
            ii, _ = bracket(wlon, d["lon"]); jj, _ = bracket(wlat, d["lat"]); okd = not (m0[jj, ii] or m0[jj, ii + 1] or m0[jj + 1, ii] or m0[jj + 1, ii + 1])
            check(okd and next(s for s in g["releaseStencilDetail"] if s["drifterId"] == d["drifterId"])["valid"] is True, f"6 release stencil at t0 on WW3 nodes: {wid}/{d['drifterId']}")
        # 7/8 GLORYS + NCEP identity
        check(w["glorysSource"]["file"] == f25[wid]["normalized"]["file"] and w["glorysSource"]["sha256"] == f25[wid]["normalized"]["fileSha256"] == sha(ROOT / f25[wid]["normalized"]["file"]) and w["wind"] == p["wind"] and sha(ROOT / w["wind"]["file"]) == w["wind"]["sha256"], f"7/8 GLORYS (STEP 25C) and NCEP identity: {wid}")
        C = validate_dataset(load(ROOT / w["control"]["file"])); T = validate_dataset(load(ROOT / w["treatment"]["file"]))
        check(sha(ROOT / w["control"]["file"]) == w["control"]["fileSha256"] and sha(ROOT / w["treatment"]["file"]) == w["treatment"]["fileSha256"] and C["manifest"]["sha256"] == w["control"]["gridSha256"] == digest(C["grid"]) and T["manifest"]["sha256"] == w["treatment"]["gridSha256"] == digest(T["grid"]), f"forcing file / grid SHAs: {wid}")
        cg, tg = C["grid"], T["grid"]
        check(cg["lon"] == tg["lon"] and cg["lat"] == tg["lat"] and cg["timeUTC"] == tg["timeUTC"] and cg["landMask"] == tg["landMask"] and C["manifest"]["surfaceDepthMeters"] == T["manifest"]["surfaceDepthMeters"] == 15.81007 and C["manifest"]["timeStepSeconds"] == T["manifest"]["timeStepSeconds"] == 10800 and len(cg["timeUTC"]) == 25 and cg["timeUTC"][0] == p["t0"] and cg["timeUTC"][-1] == p["end"], f"14 fairness: identical grid/time/mask/depth: {wid}")
        # 10 coefficient 1.0: treatment - control == WW3 Stokes bilinear at nodes (frame 0), recomputed
        with netCDF4.Dataset(ROOT / f0["file"]) as ds:
            su = np.ma.filled(ds["uuss"][k].astype(np.float64), np.nan); sv = np.ma.filled(ds["vuss"][k].astype(np.float64), np.nan)
        bad = 0; n = 0
        for j, y in enumerate(cg["lat"]):
            jj, fy = bracket(wlat, y)
            for i, x in enumerate(cg["lon"]):
                cu, tu = cg["u"][0][j][i], tg["u"][0][j][i]
                if cu is None or tu is None:
                    if (cu is None) != (tu is None):
                        bad += 1
                    continue
                ii, fx = bracket(wlon, x); a, b, c_, d_ = su[jj, ii], su[jj, ii + 1], su[jj + 1, ii], su[jj + 1, ii + 1]
                if any(np.isnan(v) for v in (a, b, c_, d_)):
                    bad += 1; continue
                st = (a * (1 - fx) + b * fx) * (1 - fy) + (c_ * (1 - fx) + d_ * fx) * fy; n += 1
                if abs((tu - cu) - st) > 1e-9:
                    bad += 1
        check(bad == 0 and n > 0, f"10/11 treatment - control = sampled WW3 Stokes x 1.0 at every valid node (frame 0): {wid} ({bad} mismatches of {n})")
        # GLORYS-only control values: control at t0 frame = linear-in-time GLORYS (spot check at 200 nodes)
        G = load(ROOT / w["glorysSource"]["file"])["grid"]; gt = [datetime.strptime(x, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp() for x in G["timeUTC"]]; ki, ft = bracket(gt, datetime.strptime(p["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp())
        gi = {x: i for i, x in enumerate(G["lon"])}; gj = {y: j for j, y in enumerate(G["lat"])}; mism = 0; cnt = 0
        for j, y in list(enumerate(cg["lat"]))[::7]:
            for i, x in list(enumerate(cg["lon"]))[::7]:
                cu = cg["u"][0][j][i]
                if cu is None:
                    continue
                a, b = G["u"][ki][gj[y]][gi[x]], G["u"][ki + 1][gj[y]][gi[x]]
                if a is None or b is None or abs(a * (1 - ft) + b * ft - cu) > 1e-9:
                    mism += 1
                cnt += 1
        check(mism == 0 and cnt > 0, f"7 control = GLORYS linear-in-time (spot check): {wid} ({mism}/{cnt})")
    # runs
    check(runs["status"] == "STEP29_RUNS_PASS" and runs["modelRunCount"] == 24 and runs["conditionRuns"] == {"control-alpha0.002": 6, "treatment-alpha0.002": 6, "control-alpha0": 6, "treatment-alpha0": 6} and runs["stokesCoefficient"] == 1.0 and runs["stokesMultipliedByAlpha"] is False and runs["alphaValues"] == [0.002, 0.0] and runs["modelSourceSha256"] == models_v2.model_source_sha256() == pb["modelSourceSha256"] and runs["runnerSha256"] == pb["tools"]["tools/research/run_step29_test06.py"], "12 24 runs; conditions; coefficient; alpha; model source; runner SHA")
    check([(r["windowId"], r["condition"], r["alpha"]) for r in runs["runs"]] == [(w, k, a) for w in WINDOWS for k, a in ORDER], "run order per preregistration")
    for r in runs["runs"]:
        w = fws[r["windowId"]]; p = pw[r["windowId"]]; kind = r["condition"]
        check(r["status"] == "COMPLETED" and r["replayMatched"] is True and r["replay"]["replayResultSha256"] == r["resultArraySha256"] and r["replay"]["replaySpecSha256"] == r["specSha256"], f"15/21 completed / replay: {r['runId']}")
        check(r["alpha"] in (0.002, 0.0) and r["integrationStepSeconds"] == 300 and r["outputStepSeconds"] == 900 and r["durationSeconds"] == 259200 and r["stokesCoefficient"] == (1.0 if kind == "treatment" else 0.0) and r["equation"] == ("dX/dt = U_GLORYS + U_Stokes + alpha * U_wind" if kind == "treatment" else "dX/dt = U_GLORYS + alpha * U_wind"), f"9/10/11 configuration: {r['runId']}")
        check(r["drifterIds"] == sorted(p["drifterIds"]) and r["released"] == p["drifterCount"] and r["area"] == p["computationArea"] and r["forcingFile"] == w[kind]["file"] and r["forcingFileSha256"] == w[kind]["fileSha256"] and r["gridSha256"] == w[kind]["gridSha256"] and r["windGridSha256"] == w["wind"]["gridSha256"] and r["windFileSha256"] == w["wind"]["sha256"] and r["glorysSourceSha256"] == w["glorysSource"]["sha256"] and r["ww3SourceSha256"] == [s["sha256"] for s in w["ww3Sources"]], f"drifters / area / forcing+wind binding: {r['runId']}")
        res = load(ROOT / r["resultFile"]); prov = res["provenance"]
        check(sha(ROOT / r["resultFile"]) == r["resultSha256"] and sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"] and digest(res["trajectories"]) == r["resultArraySha256"] and prov["windage"]["alpha"] == r["alpha"] and prov["datasetSha256"] == r["gridSha256"] and prov["windDatasetSha256"] == r["windGridSha256"] and len(res["trajectories"]) == p["drifterCount"] and all(tr["samples"][0]["timeUTC"] == p["t0"] for tr in res["trajectories"]), f"result hashes / provenance: {r['runId']}")
    check(rp["allMatched"] is True and rp["matchedCount"] == rp["total"] == 24, "21 replay manifest 24/24")
    # 16 independent M3 recomputation + 18 pairing
    table = {}
    with open(TABLE, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            table[(row["unit"], row["drifter_id"])] = row
    n_total = 0; mism = 0; compared = 0
    for wid in WINDOWS:
        p = pw[wid]; t0 = datetime.strptime(p["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc); t1 = t0 + timedelta(hours=72)
        obs = {}
        for path in sorted((ROOT / "data/research/step15/noaa-gdp-hourly-qc").glob(f"{p['region']}-{p['t0'][:4]}-q*.csv")):
            with open(path, encoding="utf-8", newline="") as fh:
                rd = csv.reader(fh); next(rd); next(rd)
                for r in rd:
                    if r[0] in p["drifterIds"]:
                        t = datetime.strptime(r[1], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                        if t0 <= t <= t1:
                            obs.setdefault(r[0], {})[r[1]] = (float(r[3]), float(r[2]))
        pts = {KEY[(k, a)]: positions(ROOT / next(r for r in runs["runs"] if r["windowId"] == wid and r["condition"] == k and r["alpha"] == a)["trajectoriesFile"]) for k, a in ORDER}
        for did in p["drifterIds"]:
            n_total += 1; row = table.get((wid, did)); check(row is not None and row["role"] == p["role"], f"18 pairing: {wid}/{did}")
            if not row:
                continue
            for h in (24, 48, 72):
                ts = (t0 + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ")
                for c in ("C002", "T002", "C0", "T0"):
                    pos = pts[c].get(did, {}).get(ts); ob = obs.get(did, {}).get(ts); mine = hav(*pos, *ob) if pos and ob else NA; pub = row[f"error_{c}_{h}h"]; compared += 1
                    if not ((mine == NA and pub == NA) or (mine != NA and pub != NA and abs(round(mine, 3) - float(pub)) <= 0.001)):
                        mism += 1
                for dcol, x, y in (("delta", "T002", "C002"), ("deltaS", "T0", "C0")):
                    ex, ey, dv = row[f"error_{x}_{h}h"], row[f"error_{y}_{h}h"], row[f"{dcol}_{h}h"]
                    check((ex == NA or ey == NA) == (dv == NA) and (dv == NA or abs(float(ex) - float(ey) - float(dv)) <= 0.0015), f"16 {dcol} = E_{x} - E_{y}: {wid}/{did}/{h}h")
    check(mism == 0 and compared == n_total * 12, f"16 independent M3 recomputation ({mism} mismatches of {compared})")
    check(n_total == 35 and len(table) == 35 and S["strata"]["overall"]["n_drifters"] == 35 and S["strata"]["calibration"]["n_drifters"] == 23 and S["strata"]["holdout"]["n_drifters"] == 12 and set(S["perWindow"]) == set(WINDOWS), "18/19 pairing counts 35 = 23 + 12; per-window; calibration/holdout separated")
    for name, b in S["strata"].items():
        for h in (24, 48, 72):
            for k in ("primary_alpha0.002", "structural_alpha0"):
                o = b[f"{h}h"][k]; check(o["n"] + o["notAvailable"] == b["n_drifters"] and o["wins_stokes"] + o["losses_stokes"] + o["ties"] == o["n"], f"20 no exclusion / W-L-T arithmetic: {name} {h}h {k}")
        check(all(kk in b for kk in ("M1_endpoint72h", "M2_totalPath", "M4_separation72h", "M5_observed72h")) and all("stokesContribution_separationKm" in b[f"{h}h"] for h in (24, 48, 72)), f"17 M1/M2/M4/M5 + Stokes contribution: {name}")
    check(S["outlierPolicyApplied"] == {"removed": 0, "trimmed": 0, "winsorized": 0, "weighted": 0, "deleted": 0, "postHocExclusions": 0} and S["coefficientSelection"] == "NONE" and S["alphaSelection"] == "NONE" and S["forcingSelection"] == "NONE" and S["holdoutUsedForSelection"] is False and S["physicalExplanationClaimed"] is False and S["stokesCoefficient"] == 1.0 and S["alphaPrimary"] == 0.002 and S["alphaStructural"] == 0.0, "20/22 no outlier modification / no selection / no tuning")
    tol = 1e-6
    def exp_label(b):
        med, w_, l_ = b["delta"]["median_delta"], b["wins_stokes"], b["losses_stokes"]
        if med is None or w_ + l_ == 0:
            return "NO_CLEAR_STOKES_DIFFERENCE"
        if med < -tol and w_ / (w_ + l_) >= 2 / 3:
            return "STOKES_DESCRIPTIVELY_FAVORED"
        if med > tol and l_ / (w_ + l_) >= 2 / 3:
            return "STOKES_DESCRIPTIVELY_DISFAVORED"
        return "NO_CLEAR_STOKES_DIFFERENCE"
    for name, b in S["strata"].items():
        check(S["descriptiveLabel"]["byStratum"][name] == exp_label(b["72h"]["primary_alpha0.002"]) and S["descriptiveLabel"]["structural_alpha0"][name] == exp_label(b["72h"]["structural_alpha0"]), f"label per preregistered rule: {name}")
    check(S["descriptiveLabel"]["primary"] == S["descriptiveLabel"]["byStratum"]["overall"], "primary label = overall")
    for st in pb["requiredStatements"]:
        check(st in S["statements"], f"statement: {st[:40]}")
    check(not CAUSAL.search(json.dumps({k: v for k, v in S.items() if k not in ("strata", "perWindow", "statements", "step25cControlCrossCheck")}, ensure_ascii=False)), "no causal / improvement / selection language")
    check(ev["tableSha256"] == sha(TABLE) and ev["summarySha256"] == sha(SUMMARY) and ev["observationSha256"] == pb["observationSha256"], "evaluation hashes / observation SHA")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/evaluate_step29_test06.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        check(proc.returncode == 0 and all(sha(Path(tmp) / n) == sha(D / n) for n in ("step29-stokes-paired-table.csv", "step29-stokes-summary.json", "step29-stokes-evaluation.json")), "reproducibility: evaluation re-run byte-identical")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "phase": "B", "label": S["descriptiveLabel"]["primary"], "structural": S["descriptiveLabel"]["structural_alpha0"]["overall"], "modelRunCount": runs["modelRunCount"], "drifters": n_total, "m3Compared": compared}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
