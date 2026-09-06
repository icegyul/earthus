"""Independent validator for STEP 25C / TEST-02 — r2 (revision of check_step25c_test02.py locked at aee3943c: the r1 check compared
the stored float32 depth level 15.810070037841797 to the literal 15.81007 with ==, producing a false FAIL on every window; r2 uses a
1e-4 m tolerance. All other checks identical.) `--phase A` (lock: design only, no outputs) or `--phase B` (full). exit 0 = PASS.
Verifies: ancestry; frozen configuration (STEP 17-25B locked SHAs, runtime files identical to 155995dd blobs, model source SHA);
exact six paired windows (KE-H2 absent); GLORYS forcing identity (product/dataset id, 15.81007 m, 86400 s, source SHA = STEP 25B file
SHA, k/12 grid); HYCOM forcing identity (STEP 20 trajectory SHAs, run configuration); alpha values 0.002/0; duration 259200 s,
step 300 s, output 900 s; drifter IDs = STEP 20 units; observation timestamps exact (t0+24/48/72 h); trajectory completeness;
trajectory hashes; replay hashes; independent M3 recomputation; pairing (n + notAvailable = drifters, no exclusion); no outlier
removal / post-hoc exclusion; label consistent with the preregistered rule; reproducibility (evaluation re-run byte-identical);
no credential-shaped values. Deterministic output."""
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
PROTO, PREREG, RULE = D / "step25c-test02-protocol.json", D / "step25c-preregistration.json", D / "step25c-rule-sha256.txt"
FORCING, RUNS, EVAL, TABLE, SUMMARY = D / "step25c-glorys-forcing-manifest.json", D / "step25c-run-manifest.json", D / "step25c-evaluation.json", D / "step25c-paired-table.csv", D / "step25c-summary.json"
LOCK = {"docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86", "docs/research/step18b-preregistration.json": "02935e81e9c93690078ff96231c74ad51c86dfaffa89bfa17a2e2ba082306316",
        "docs/research/step18b-model-manifest.json": "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe", "docs/research/step19-evaluation.json": "9baa0c6ae4fd38fbd0ea72e479736d0eb8f43f49aac6cebc8dcfa0051490b5f4",
        "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4", "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd",
        "docs/research/step20-calibration-manifest.json": "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498", "docs/research/step20-calibration-table.csv": "a15df2a059ba11e5e3900f10b29ad3cfed1dca610c8ad421898374cd31a8425f",
        "docs/research/step20-b6-holdout-manifest.json": "968da55a4553c00f373d6a0f26bc2b1c9e3f3af421d37db7a1e58e99a5727653", "docs/research/step20-b6-holdout-table.csv": "d21d029bba4e09a15ef19a393f0d8389df0e5750cb1459ed0b1e92372aeea681",
        "docs/research/step20-b6-holdout-summary.json": "fe2043b30aaba17d34e3d9a780379de9612541b75caa4ed487a10931a784d93b", "docs/research/step21-diagnostic-summary.json": "d310eaadf64324286de80e485e9944998665d14d2599ca80133cf3d25b406fbd",
        "docs/research/step22-summary.json": "0093d1c0ab8c73195c76b11da1ddf0609555f5ff49c2698069e31b0a76f4e5bd", "docs/research/step23-data-quality-gates.json": "5121ddee252a03ac276c5094bb373b6948ef317de7bb956add064b7caf99f39b",
        "docs/research/step24-data-access-status.json": "74ea277901b95880b5f03e3133ff4b5696381cdbb69a27ccbd6703fdd8db6bf7", "docs/research/step24b-license-status.json": "7f9a8b9983dd3849e852d31514b6b512ed12195457930c70a104f24dcf8807ef",
        "docs/research/step25a-forcing-experiment-protocol.json": "792ea745f11dc0e468daae97e053e8c374e9d5bc3c7483c6247f3302b93f07f1", "docs/research/step25a-summary.json": "96c84a369c5111480d47eea491c7a8dc370acb5dd543e22897ee2a6d77c16576",
        "docs/research/step25b-glorys-acquisition-protocol.json": "0a542a94ee0c04a54ac7bd543c7f89eb0462e0a19e89668c969935178dc76eb9", "docs/research/step25b-glorys-acquisition-manifest.json": "8dfd07815328074fefa029a41e911130984386d50d3ca86cd8c123e1f0d8b734",
        "docs/research/step25b-glorys-quality-gates.json": "56dcc6182d14346d6345de82bf16ad5b438f9ce739ba45a15d8807fd1b5cfb12", "docs/research/step25b-summary.json": "818842755c876e2f0bcdb38ad4b7056e6048b8da7718952cb4b5772b951902a5",
        "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "322f0e57", "4bb4342b", "275d06e6", "e0e7cfd2", "15a81d25", "c34c6d97", "db6cea2f", "2841f511", "1a6a3173", "c6179242", "c17bd469", "929d3468")
WINDOWS = ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H3"]
SECRET_VALUE = (r"password\s*[:=]\s*\S{4,}", r"api[_-]?key\s*[:=]\s*\S{8,}", r"token\s*[:=]\s*[A-Za-z0-9_\-\.]{16,}", r"Basic [A-Za-z0-9+/=]{12,}")
RADIUS_M = 6371008.8
NA = "NOT_AVAILABLE"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def hav(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * RADIUS_M * math.asin(math.sqrt(a)) / 1000


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    phase = sys.argv[sys.argv.index("--phase") + 1] if "--phase" in sys.argv else "B"
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"frozen configuration: {rel}")
    for short in COMMITS:
        check(subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() == "commit", f"ancestry: {short}")
    for name in ("__init__.py", "datasets.py", "models.py", "models_v2.py", "wind.py", "cli.py", "cli_v2.py", "registry.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"frozen runtime unchanged: {name}")
    p = load(PROTO); q = load(PREREG); p20 = load(D / "step20-preregistration.json"); cal20 = load(D / "step20-calibration-manifest.json"); hold20 = load(D / "step20-b6-holdout-manifest.json"); a25 = load(D / "step25a-forcing-experiment-protocol.json"); b25 = load(D / "step25b-glorys-acquisition-manifest.json")
    rule = {l.split()[1]: l.split()[0] for l in RULE.read_text(encoding="utf-8").splitlines() if len(l.split()) == 2}
    check(rule.get("docs/research/step25c-test02-protocol.json") == sha(PROTO) == q["protocolSha256"] and rule.get("docs/research/step25c-preregistration.json") == sha(PREREG), "protocol/preregistration cross reference")
    for t in ("tools/research/glorys_reader_step25c.py", "tools/research/build_step25c_forcing.py", "tools/research/run_step25c_test02.py", "tools/research/evaluate_step25c_test02.py", "tools/research/check_step25c_test02.py"):
        check(rule.get(t) == sha(ROOT / t) == q["tools"][t], f"tool locked before execution: {t}")
    q2 = load(D / "step25c-r2-preregistration.json"); q3 = load(D / "step25c-validator-r2-preregistration.json")
    for t in ("tools/research/run_step25c_test02_r2.py", "tools/research/replay_step25c_run.py"):
        check(q2["tools"][t] == sha(ROOT / t), f"r2 tool locked before execution: {t}")
    check(q3["validatorR2Sha256"] == sha(__file__) and q3["baseLock"] == "4953719d", "validator r2 self-lock")
    check(p["ruleId"] == q["ruleId"] == "forcing-sensitivity-test02-step25c" and q["status"] == "PREREGISTRATION LOCKED" and p["status"] == "PREREGISTRATION LOCKED" and q["gitCommitAtDesign"] == "929d3468", "LOCK / rule id / base commit")
    check([w["windowId"] for w in p["windows"]] == WINDOWS and "KE-H2" not in json.dumps([w["windowId"] for w in p["windows"]]) and p["excluded"]["KE-H2"]["paired"] is False, "exact six paired windows; KE-H2 excluded")
    units = {u["windowId"]: u for u in p20["calibration"]["runUnits"] + p20["holdout"]["runUnits"]}; a25w = {w["windowId"]: w for w in a25["windows"]}
    for w in p["windows"]:
        u = units[w["windowId"]]; check(sorted(w["drifterIds"]) == sorted(u["drifterIds"]) and w["drifterCount"] == u["drifterCount"] and w["t0"] == u["t0"] and w["end"] == u["end"], f"drifter IDs / times = STEP 20: {w['windowId']}")
        check(w["oceanBox"] == a25w[w["windowId"]]["oceanBox"] and w["role"] == a25w[w["windowId"]]["role"], f"box/role = STEP 25A: {w['windowId']}")
        check(sorted(d["drifterId"] for d in w["releasePositions"]) == sorted(u["drifterIds"]), f"release positions cover drifter IDs: {w['windowId']}")
        for a, key in (("0.002", "0.002"), ("0", "0")):
            ref = w["hycomBaseline"][key]; src = [r for r in cal20["runs"] + hold20["runs"] if r.get("windowId") == w["windowId"] and r.get("modeled", True) and r["status"] == "COMPLETED" and r["alphaText"] == a]
            check(len(src) == 1 and src[0]["trajectoriesFile"] == ref["file"] and src[0]["trajectoriesSha256"] == ref["sha256"] == sha(ROOT / ref["file"]) and src[0]["integrationStepSeconds"] == 300 and src[0]["outputStepSeconds"] == 900 and src[0]["durationSeconds"] == 259200 and float(src[0]["alpha"]) == float(a), f"HYCOM forcing identity / configuration: {w['windowId']} alpha {a}")
        check(sha(ROOT / w["wind"]["file"]) == w["wind"]["sha256"] and w["wind"]["gridSha256"] == (next(r for r in cal20["runs"] + hold20["runs"] if r.get("windowId") == w["windowId"] and r.get("modeled", True) and r["status"] == "COMPLETED"))["windGridSha256"], f"identical wind: {w['windowId']}")
    check(p["modelA"]["alpha"] == 0.002 and p["modelB"]["alpha"] == 0.002 and p["structuralPair"]["alpha"] == 0.0 and p["alphaPolicy"]["search"] is False and p["modelB"]["depthMeters"] == 15.81007 and p["modelB"]["cadenceSeconds"] == 86400, "alpha values / depth / cadence")
    check(p["modelMechanics"]["integrationStepSeconds"] == 300 and p["modelMechanics"]["outputStepSeconds"] == 900 and p["modelMechanics"]["durationSeconds"] == 259200 and p["modelMechanics"]["integrator"] == "RK4", "mechanics 300/900/259200 RK4")
    check(p["comparison"]["horizonsHours"] == [24, 48, 72] and p["comparison"]["tieToleranceKm"] == 1e-6 and p["comparison"]["primaryStatistic"] == "paired median delta" and p["interpretationRule"]["primaryHorizonHours"] == 72, "comparison rules")
    check(p["inputs"]["step25bManifestSha256"] == LOCK["docs/research/step25b-glorys-acquisition-manifest.json"] and p["inputs"]["observationSha256"] == p20["immutabilityCheck"]["observationSha256"], "inputs bound to STEP 25B manifest / observations")
    check(all(p["forbidden"].get(k) is False for k in ("extrapolation", "smoothing", "zeroFill", "landSubstitution", "frameDuplication", "gapInterpolation", "forcingBlending", "biasCorrection", "nudging", "assimilation", "outlierRemoval", "postHocExclusion", "alphaSearch")), "forbidden list")
    if phase == "A":
        check(not any(x.exists() for x in (FORCING, RUNS, EVAL, TABLE, SUMMARY)) and not (ROOT / "data/research/step25c").exists(), "Phase A: no execution outputs")
        print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "phase": "A", "protocolSha256": sha(PROTO)}, ensure_ascii=False, indent=2)); return 0 if not failures else 1
    fm = load(FORCING); runs = load(RUNS); ev = load(EVAL); S = load(SUMMARY)
    sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
    from research_runtime.datasets import validate_dataset, digest  # noqa: E402
    from research_runtime import models_v2  # noqa: E402
    check(fm["protocolSha256"] == sha(PROTO) == runs["protocolSha256"] == ev["protocolSha256"] and runs["forcingManifestSha256"] == sha(FORCING) and ev["runManifestSha256"] == sha(RUNS), "output chain cross references")
    check(fm["reader"]["sha256"] == sha(ROOT / "tools/research/glorys_reader_step25c.py") == rule.get("tools/research/glorys_reader_step25c.py") and fm["reader"]["isolatedFromRuntime"] is True, "reader SHA recorded and locked")
    b25w = {w["windowId"]: w for w in b25["windows"]}
    for w in fm["windows"]:
        n = w["normalized"]; path = ROOT / n["file"]
        check(path.exists() and sha(path) == n["fileSha256"], f"GLORYS normalized file hash: {w['windowId']}")
        ds = validate_dataset(load(path)); m = ds["manifest"]; g = ds["grid"]
        check(m["sha256"] == n["gridSha256"] == digest(g) and m["surfaceDepthMeters"] == 15.81007 and m["timeStepSeconds"] == 86400 and m["productId"] == "GLOBAL_MULTIYEAR_PHY_001_030" and m["cmemsDatasetId"] == "cmems_mod_glo_phy_my_0.083deg_P1D-m" and m["sourceSha256"] == b25w[w["windowId"]]["sha256"] == w["rawSha256"] and m["netcdfReaderVersion"] == "earthus-glorys-netcdf/1", f"GLORYS forcing identity: {w['windowId']}")
        check(all(abs(x * 12 - round(x * 12)) < 1e-9 for x in g["lon"] + g["lat"]) and len(g["timeUTC"]) == 6 and g["timeUTC"][0] <= w["t0"] and w["end"] <= g["timeUTC"][-1], f"GLORYS grid k/12 and bracketing daily frames: {w['windowId']}")
        check(w["coverage"]["gapInterpolated"] is False and w["coverage"]["substitution"] is False and abs(n["depthLevelMeters"] - 15.81007) < 1e-4, f"no gap interpolation / substitution / stored depth level: {w['windowId']}")
    check(runs.get("revision", "").startswith("r2") and runs["identicalToAttempt1"] is True and all(r["attempt1"]["identicalToAttempt1"] for r in runs["runs"]) and all(r["replay"]["replayToolSha256"] == q2["tools"]["tools/research/replay_step25c_run.py"] for r in runs["runs"]), "r2 runs identical to attempt 1; replay tool SHA bound")
    check(runs["status"] == "TEST02_RUNS_PASS" and runs["modelRunCount"] == 12 and len(runs["runs"]) == 12 and runs["hycomRerun"] is False and runs["modelSourceSha256"] == models_v2.model_source_sha256() == p["modelMechanics"]["modelSourceSha256"], "run manifest: 12 runs, HYCOM not re-run, model source")
    expected = [(w, a) for w in WINDOWS for a in (0.002, 0.0)]
    check([(r["windowId"], r["alpha"]) for r in runs["runs"]] == expected, "run matrix order 6 windows x (0.002, 0)")
    pw = {w["windowId"]: w for w in p["windows"]}; fw = {w["windowId"]: w for w in fm["windows"]}
    for r in runs["runs"]:
        w = pw[r["windowId"]]
        check(r["status"] == "COMPLETED" and r["replayMatched"] is True and r["replay"]["replayResultSha256"] == r["resultArraySha256"] and r["qualityStatus"] in ("COMPLETE", "PARTIAL"), f"trajectory completeness / replay hash: {r['runId']}")
        check(r["integrationStepSeconds"] == 300 and r["outputStepSeconds"] == 900 and r["durationSeconds"] == 259200 and r["modelId"] == "surface-passive-advection.v2.windage" and r["modelVersion"] == "0.1.0", f"run configuration: {r['runId']}")
        check(r["drifterIds"] == sorted(w["drifterIds"]) and r["released"] == w["drifterCount"] and r["area"] == w["computationArea"], f"drifter IDs / area: {r['runId']}")
        check(r["gridSha256"] == fw[r["windowId"]]["normalized"]["gridSha256"] and r["forcingFileSha256"] == fw[r["windowId"]]["normalized"]["fileSha256"] and r["windGridSha256"] == w["wind"]["gridSha256"], f"forcing binding: {r['runId']}")
        res_path = ROOT / r["resultFile"]; csv_path = ROOT / r["trajectoriesFile"]
        check(res_path.exists() and sha(res_path) == r["resultSha256"] and csv_path.exists() and sha(csv_path) == r["trajectoriesSha256"], f"trajectory hashes: {r['runId']}")
        res = load(res_path); prov = res["provenance"]
        check(digest(res["trajectories"]) == r["resultArraySha256"] and prov["windage"]["alpha"] == r["alpha"] and prov["integrationStepSeconds"] == 300 and prov["outputStepSeconds"] == 900 and prov["datasetSha256"] == r["gridSha256"] and prov["windDatasetSha256"] == r["windGridSha256"] and prov["surfaceDepthMeters"] == 15.81007 and prov["timeStepSeconds"] == 86400, f"result provenance: {r['runId']}")
        check(all(tr["samples"][0]["timeUTC"] == w["t0"] for tr in res["trajectories"]) and len(res["trajectories"]) == w["drifterCount"], f"release time / particle count: {r['runId']}")
    # independent M3 recomputation + pairing
    def positions(path):
        out = {}
        with open(path, encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                if row["valid"] == "true":
                    out.setdefault(row["drifter_id"], {})[row["timestamp"]] = (float(row["lon"]), float(row["lat"]))
        return out
    table = {}
    with open(TABLE, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            table[(row["unit"], row["drifter_id"])] = row
    n_total = 0; recomputed_mismatch = 0; compared = 0
    for w in p["windows"]:
        t0 = datetime.strptime(w["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc); t1 = t0 + timedelta(hours=72)
        obs = {}
        for path in sorted((ROOT / "data/research/step15/noaa-gdp-hourly-qc").glob(f"{w['region']}-{w['t0'][:4]}-q*.csv")):
            with open(path, encoding="utf-8", newline="") as fh:
                rd = csv.reader(fh); next(rd); next(rd)
                for r in rd:
                    if r[0] in w["drifterIds"]:
                        t = datetime.strptime(r[1], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                        if t0 <= t <= t1:
                            obs.setdefault(r[0], {})[r[1]] = (float(r[3]), float(r[2]))
        gl = {a: positions(ROOT / next(r for r in runs["runs"] if r["windowId"] == w["windowId"] and r["alpha"] == a)["trajectoriesFile"]) for a in (0.002, 0.0)}
        hy = {a: positions(ROOT / w["hycomBaseline"][a]["file"]) for a in ("0.002", "0")}
        for did in w["drifterIds"]:
            n_total += 1; row = table.get((w["windowId"], did)); check(row is not None and row["role"] == w["role"], f"pairing: table row {w['windowId']}/{did}")
            if not row:
                continue
            for h in (24, 48, 72):
                ts = (t0 + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ")
                for lab, pts in (("G002", gl[0.002]), ("G0", gl[0.0]), ("H002", hy["0.002"]), ("H0", hy["0"])):
                    pos = pts.get(did, {}).get(ts); ob = obs.get(did, {}).get(ts); mine = hav(*pos, *ob) if pos and ob else NA; pub = row[f"error_{lab}_{h}h"]; compared += 1
                    if not ((mine == NA and pub == NA) or (mine != NA and pub != NA and abs(round(mine, 3) - float(pub)) <= 0.001)):
                        recomputed_mismatch += 1
                eg, eh = row[f"error_G002_{h}h"], row[f"error_H002_{h}h"]; d = row[f"delta_{h}h"]
                check((eg == NA or eh == NA) == (d == NA) and (d == NA or abs(float(eg) - float(eh) - float(d)) <= 0.0015), f"delta = G - H: {w['windowId']}/{did}/{h}h")
    check(recomputed_mismatch == 0 and compared == n_total * 12, f"independent M3 recomputation ({recomputed_mismatch} mismatches of {compared})")
    check(len(table) == n_total == 35 and S["strata"]["overall"]["n_drifters"] == 35 and S["strata"]["calibration"]["n_drifters"] == 23 and S["strata"]["holdout"]["n_drifters"] == 12, "pairing counts 35 = 23 + 12")
    for name, b in S["strata"].items():
        for h in (24, 48, 72):
            o = b[f"{h}h"]; check(o["n"] + o["notAvailable"] == b["n_drifters"] and o["wins_GLORYS"] + o["losses_GLORYS"] + o["ties"] == o["n"], f"no exclusion: {name} {h}h")
    check(S["outlierPolicyApplied"] == {"removed": 0, "winsorized": 0, "trimmed": 0, "weighted": 0, "postHocExclusions": 0} and S["alphaReselection"] is False and S["hycomRerun"] is False and S["acceptanceThresholds"] == "NONE", "no outlier removal / post-hoc exclusion / alpha reselection")
    check(S["hycomCrossCheck"]["allAgree"] is True and ev["observationSha256"] == p20["immutabilityCheck"]["observationSha256"], "HYCOM errors agree with STEP 20 tables; observation SHA bound")
    # label rule
    rl = p["interpretationRule"]; b72 = S["strata"]["overall"][f"{rl['primaryHorizonHours']}h"]; med, wn, ls = b72["delta"]["median_delta"], b72["wins_GLORYS"], b72["losses_GLORYS"]
    exp = "NO CLEAR DESCRIPTIVE DIFFERENCE"
    if med is not None and wn + ls > 0:
        if med < -1e-6 and wn / (wn + ls) >= rl["consistencyFraction"]:
            exp = "GLORYS DESCRIPTIVELY FAVORED"
        elif med > 1e-6 and ls / (wn + ls) >= rl["consistencyFraction"]:
            exp = "HYCOM DESCRIPTIVELY FAVORED"
    check(S["descriptiveLabel"]["primary"] == exp, f"descriptive label per preregistered rule (expected {exp})")
    for st in p["requiredStatements"]:
        check(st in S["statements"], f"statement: {st[:40]}")
    check(ev["tableSha256"] == sha(TABLE) and ev["summarySha256"] == sha(SUMMARY), "evaluation hashes")
    for rel in [str(x.relative_to(ROOT)) for x in D.glob("step25c-*") if x.is_file()]:
        txt = (ROOT / rel).read_text(encoding="utf-8", errors="replace"); scan = chr(10).join(l for l in txt.splitlines() if 'r"' not in l and "r'" not in l)
        for pat in SECRET_VALUE:
            check(not re.search(pat, scan, re.I), f"credential-shaped value in {rel}")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/evaluate_step25c_test02.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        check(proc.returncode == 0 and all(sha(Path(tmp) / n) == sha(D / n) for n in ("step25c-paired-table.csv", "step25c-summary.json", "step25c-evaluation.json")), "reproducibility: evaluation re-run byte-identical")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "phase": "B", "label": S["descriptiveLabel"]["primary"], "modelRunCount": runs["modelRunCount"], "drifters": n_total, "m3Compared": compared}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
