"""Independent validator for STEP 39 (frozen-data deterministic trajectory / evaluation pipeline; no bootstrap). exit 0 = PASS.
Groups: 1 STEP 38 lock ancestry (23e78f86) · 2 STEP 37 lock identity (74d19f0a; STEP 37 files unchanged) · 3 STEP 36 cohort identity ·
4 runtime identity 155995dd (byte-identical; model source SHA 306a5976 on every run) · 5 exact source identities (every forcing file used
by a run is a frozen STEP 38 artefact by SHA; daily/composite derived from frozen originals) · 6 no new acquisition (data/research/step39 holds
only derived datasets and trajectories; no .nc) · 7 no substitution · 8-11 exact parameters (alpha 0.002, Stokes 1.0, depths 15.0 / 15.81007,
RK4 300 s, output 900 s, 72 h, horizons 24/48/72) · 12 exact A/B/C definitions (dataset identities, daily config = frozen STEP 32 matrix)
· 13 pairing identity (per drifter, same window / t0 / evaluation timestamps; exact-timestamp rule) · 14 no imputation (NA counts, nested
Theta recomputed from the table) · 15 no tuning · 16 no cohort modification · 17 no endpoint modification · 18 deterministic execution
metadata · 19 trajectory timestamp integrity (900 s samples from t0, exact horizons present or NA) · 20 output manifest integrity (SHA chain;
independent re-execution byte-identical when --replay-dir is given; evaluator re-run byte-identical). Deterministic output."""
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
sys.path.insert(0, str(ROOT / "tools/research"))
import check_step32_preregistration as pa  # noqa: E402

PROTO, REC, RT, RPT, RC, RPC, DL, CF, EV, SM, TAB = (D / n for n in ("step39-execution-protocol.json", "step39-execution-record.json", "step39-temporal-run-manifest.json", "step39-temporal-replay-manifest.json", "step39-candidate-run-manifest.json", "step39-candidate-replay-manifest.json", "step39-daily-derivation-manifest.json", "step39-candidate-forcing-manifest.json", "step39-evaluation.json", "step39-summary.json", "step39-paired-table.csv"))
TOOLS = ("build_step39_daily.py", "build_step39_candidate_forcing.py", "step39_runs.py", "run_step39_trajectories.py", "replay_step39_run.py", "evaluate_step39.py", "check_step39_execution.py")
RADIUS_M = 6371008.8; NA = "NOT_AVAILABLE"; H = (24, 48, 72); TOL = 1e-6; FMT = "%Y-%m-%dT%H:%M:%SZ"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def hav(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * RADIUS_M * math.asin(math.sqrt(a)) / 1000


def median(v):
    v = sorted(v)
    if not v:
        return None
    m = len(v) // 2; return v[m] if len(v) % 2 else (v[m - 1] + v[m]) / 2


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    argv = sys.argv[1:]; replay_dir = Path(argv[argv.index("--replay-dir") + 1]) if "--replay-dir" in argv else None
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for short in pa.COMMITS + ("ee64354d", "043a09b8", "74d19f0a", "23e78f86"):
        check(git("cat-file", "-t", short).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", short, "HEAD").returncode == 0, f"1 ancestry: {short}")
    P, R = load(PROTO), load(REC)
    check(git("rev-parse", "23e78f86").stdout.strip() == "23e78f863fb092aa9e3c36e4d74d4afd4393e7f4" == P["step38LockCommit"] and git("rev-parse", "74d19f0a").stdout.strip() == P["step37LockCommit"] and git("rev-parse", "043a09b8").stdout.strip() == P["step36LockCommit"], "1/2/3 lock commit identities")
    q = load(D / "step32-preregistration.json"); P37 = load(D / "step37-experiment-preregistration-protocol.json")
    for rel, expected in pa.LOCK.items():
        exp = expected or q["sourceBinding"].get(rel); check(exp is not None and sha(ROOT / rel) == exp, f"immutability: {rel}")
    for rel, expected in P37["ancestry"]["frozenInputs"].items():
        check(sha(ROOT / rel) == expected, f"frozen input unchanged: {rel}")
    for rel, expected in P["frozen"].items():
        check(sha(ROOT / rel) == expected, f"2/3 STEP 36/37/38 record unchanged: {rel}")
    for name in ("__init__.py", "datasets.py", "models.py", "models_v2.py", "wind.py", "cli.py", "cli_v2.py", "registry.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"4 runtime unchanged: {name}")
    for t in TOOLS:
        check(P["tools"].get(f"tools/research/{t}") == sha(ROOT / "tools/research" / t), f"tool equals protocol lock: {t}")
    for f in (RT, RPT, RC, RPC, DL, CF, EV, SM, TAB):
        check(f.exists(), f"20 output present: {f.name}")
    if failures:
        print(json.dumps({"result": "FAIL", "failures": failures[:40]}, ensure_ascii=False, indent=2)); return 1
    M36 = load(D / "step36-cohort-extension-manifest.json"); A38 = load(D / "step38-source-acquisition-manifest.json"); F38 = load(D / "step38-data-freeze-manifest.json"); frozen_sha = {a["sha256"] for a in F38["artefacts"]}
    rt, rpt, rc, rpc, dl, cf, ev, sm = (load(x) for x in (RT, RPT, RC, RPC, DL, CF, EV, SM)); mw = {w["windowId"]: w for w in M36["windows"]}; aw = {w["windowId"]: w for w in A38["windows"]}
    check(rt["cohortManifestSha256"] == sha(D / "step36-cohort-extension-manifest.json") == rc["cohortManifestSha256"] == ev["cohortManifestSha256"] and rt["acquisitionManifestSha256"] == sha(D / "step38-source-acquisition-manifest.json") == rc["acquisitionManifestSha256"] and rt["dailyManifestSha256"] == sha(DL) and rc["candidateManifestSha256"] == sha(CF) and rpt["runManifestSha256"] == sha(RT) and rpc["runManifestSha256"] == sha(RC) and ev["temporalRunManifestSha256"] == sha(RT) and ev["candidateRunManifestSha256"] == sha(RC) and ev["tableSha256"] == sha(TAB) and ev["summarySha256"] == sha(SM) and dl["acquisitionManifestSha256"] == sha(D / "step38-source-acquisition-manifest.json") and dl["qualityReportSha256"] == sha(D / "step38-data-freeze-manifest.json") and cf["acquisitionManifestSha256"] == sha(D / "step38-source-acquisition-manifest.json") and cf["cohortManifestSha256"] == sha(D / "step36-cohort-extension-manifest.json"), "20 SHA chain: cohort/acquisition -> daily/candidate -> runs -> replay -> evaluation")
    check(R["runManifests"]["temporal"] == sha(RT) and R["runManifests"]["candidate"] == sha(RC) and R["evaluationSha256"] == sha(EV) and R["summarySha256"] == sha(SM) and R["tableSha256"] == sha(TAB) and R["dailyManifestSha256"] == sha(DL) and R["candidateForcingManifestSha256"] == sha(CF), "20 execution record bound to outputs")
    check(dl["configurationSha256"] == hashlib.sha256(json.dumps(load(D / "step32-temporal-experiment-matrix.json")["conditions"]["B"]["dailyDerivation"], sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest() and dl["status"] == "DERIVED" and dl["derivedCount"] == 9, "12 daily configuration = frozen STEP 32 matrix; 9 daily fields")
    for w in dl["windows"]:
        check(w["landMask"]["identicalToNative3h"] is True and all(x["frameCount"] == 8 for x in w["days"]) and len(w["days"]) == 6 and all(x["sourceFileSha256"] in frozen_sha for x in w["days"]) and sha(ROOT / w["derived"]["file"]) == w["derived"]["fileSha256"], f"5/12 daily field from frozen originals, 6 x 8 frames, mask identical: {w['windowId']}")
    for w in cf["windows"]:
        check(w["status"] == "BUILT" and w["ww3Gate"]["status"] == "PASS" and w["stokesCoefficient"] == 1.0 and w["depthMeters"] == 15.81007 and w["glorysSource"]["sha256"] == aw[w["windowId"]]["glorys"]["normalized"]["fileSha256"] and all(s["sha256"] in frozen_sha for s in w["ww3Sources"]), f"5/7/12 candidate forcing from frozen GLORYS/WW3, coefficient 1.0, depth 15.81007: {w['windowId']}")
    runs = {(r["windowId"], r["condition"]): r for r in rt["runs"] + rc["runs"]}
    check(rt["status"] == "STEP32_RUNS_PASS" and rc["status"] == "STEP32_RUNS_PASS" and len(rt["runs"]) == 18 and len(rc["runs"]) == 9 and all(r["status"] == "COMPLETED" and r["replayMatched"] for r in runs.values()) and rpt["allMatched"] and rpc["allMatched"] and rt["modelRunCount"] + rc["modelRunCount"] == 27, "18/20 27 runs completed and replay-matched")
    pts = {}
    for (wid, cond), r in runs.items():
        w = mw[wid]; a = aw[wid]; check(r["alpha"] == 0.002 and r["integrationStepSeconds"] == 300 and r["outputStepSeconds"] == 900 and r["durationSeconds"] == 259200 and r["depthMeters"] == (15.81007 if cond == "C" else 15.0) and r["modelSourceSha256"] == "306a597613f625e09d0788405b7b7e3b3a944627d4217b8da77e66a74859dee3" and sorted(r["drifterIds"]) == sorted(w["drifterIds"]) and r["area"] == {"west": w["oceanBox"]["west"], "east": w["oceanBox"]["east"], "south": max(w["oceanBox"]["south"], -40.0), "north": min(w["oceanBox"]["north"], 40.0)} and r["wind"]["fileSha256"] == a["wind"]["fileSha256"] and r["equation"] == {"A": "dX/dt = U_HYCOM_3h + 0.002 * U_wind", "B": "dX/dt = U_HYCOM_daily + 0.002 * U_wind", "C": "dX/dt = U_GLORYS + U_Stokes + 0.002 * U_wind"}[cond], f"4/8-12/16 run configuration frozen: {r['runId']}")
        if cond == "A":
            check(r["forcing"]["fileSha256"] == a["hycomNative3h"]["fileSha256"] and a["hycomNative3h"]["fileSha256"] in {x["sha256"] for x in F38["artefacts"]}, f"5 condition A forcing = frozen STEP 38 derived dataset: {wid}")
        if cond == "B":
            check(r["forcing"]["file"] == next(x for x in dl["windows"] if x["windowId"] == wid)["derived"]["file"], f"5 condition B forcing = STEP 39 daily dataset: {wid}")
        if cond == "C":
            t = next(x for x in cf["windows"] if x["windowId"] == wid)["treatment"]; check(r["forcing"].get("fileSha256") == t.get("fileSha256") if not t["chunked"] else r["forcing"]["gridSha256"] == {n: c["gridSha256"] for n, c in t["chunks"].items()}, f"5 condition C forcing = STEP 39 candidate dataset: {wid}")
        p = ROOT / r["trajectoriesFile"]; check(sha(p) == r["trajectoriesSha256"], f"20 trajectory SHA: {r['runId']}")
        t0 = datetime.strptime(w["start"], FMT).replace(tzinfo=timezone.utc); out = {}; alphas = set(); tsok = True
        with open(p, encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                alphas.add(row["alpha"]); t = datetime.strptime(row["timestamp"], FMT).replace(tzinfo=timezone.utc); tsok &= (t - t0).total_seconds() % 900 == 0 and 0 <= (t - t0).total_seconds() <= 259200
                if row["valid"] == "true":
                    out.setdefault(row["drifter_id"], {})[row["timestamp"]] = (float(row["lon"]), float(row["lat"]))
        check(alphas == {"0.002"} and tsok, f"8/19 alpha 0.002 and 900 s timestamp integrity: {r['runId']}"); pts[(wid, cond)] = out
        if replay_dir is not None:
            rr = load(replay_dir / f"step39-{'candidate' if cond == 'C' else 'temporal'}-run-manifest.json"); o = next((x for x in rr["runs"] if x["windowId"] == wid and x["condition"] == cond), None)
            check(o is not None and o["resultArraySha256"] == r["resultArraySha256"] and o["trajectoriesSha256"] == r["trajectoriesSha256"] and sha(replay_dir / wid / f"{cond}-alpha0.002" / "trajectories.csv") == r["trajectoriesSha256"], f"18/20 independent re-execution byte-identical: {r['runId']}")
    check(not any(p.suffix == ".nc" for p in (ROOT / "data/research/step39").rglob("*")) and all(sha(a["file"]) == a["sha256"] for a in F38["artefacts"] if a["category"] == "A_ORIGINAL_SOURCE"), "6/7 no new acquisition; STEP 38 originals untouched")
    # ---- evaluation recomputed ----
    with open(TAB, encoding="utf-8", newline="") as fh:
        table = list(csv.DictReader(fh))
    check(len(table) == 20 and sorted(r["drifter_id"] for r in table) == sorted(M36["drifterIds"]) and {r["window"] for r in table} == set(mw), "13/16 table = 20 frozen drifters in 9 frozen windows")
    compared = mism = 0; deltas = {}
    for w in M36["windows"]:
        wid = w["windowId"]; t0 = datetime.strptime(w["start"], FMT).replace(tzinfo=timezone.utc); t1 = t0 + timedelta(hours=72); obs = {}
        for path in sorted((ROOT / "data/research/step15/noaa-gdp-hourly-qc").glob(f"{w['region']}-{w['start'][:4]}-q*.csv")):
            with open(path, encoding="utf-8", newline="") as fh:
                rd = csv.reader(fh); next(rd); next(rd)
                for r in rd:
                    if r[0] in w["drifterIds"]:
                        t = datetime.strptime(r[1], FMT).replace(tzinfo=timezone.utc)
                        if t0 <= t <= t1:
                            obs.setdefault(r[0], {})[r[1]] = (float(r[3]), float(r[2]))
        for did in w["drifterIds"]:
            row = next(x for x in table if x["window"] == wid and x["drifter_id"] == did)
            for h in H:
                ts_ = (t0 + timedelta(hours=h)).strftime(FMT); ob = obs.get(did, {}).get(ts_); e = {}
                for c in ("A", "B", "C"):
                    p = pts[(wid, c)].get(did, {}).get(ts_); e[c] = hav(*p, *ob) if p and ob else NA; compared += 1
                    mism += 0 if ((e[c] == NA and row[f"error_{c}_{h}h"] == NA) or (e[c] != NA and row[f"error_{c}_{h}h"] != NA and abs(e[c] - float(row[f"error_{c}_{h}h"])) <= 0.001)) else 1
                for key, x, y in (("delta_CA", "C", "A"), ("delta_BA", "B", "A")):
                    d = row[f"{key}_{h}h"]; check(((e[x] == NA or e[y] == NA) == (d == NA)) and (d == NA or abs(e[x] - e[y] - float(d)) <= 0.0015), f"13/14 exact pairing / no imputation: {wid}/{did}/{key}/{h}h")
                    if d != NA:
                        deltas.setdefault((key, h), {}).setdefault(wid, []).append(float(d))
    check(mism == 0 and compared == 20 * 3 * 3, f"13 M3 recomputed ({mism} mismatches of {compared})")
    def theta(key, h):
        per = {wid: (round(median(deltas.get((key, h), {}).get(wid, [])), 3) if deltas.get((key, h), {}).get(wid) else NA) for wid in mw}; av = [v for v in per.values() if v != NA]
        return per, (round(median(av), 3) if av else NA)
    per, th = theta("delta_CA", 72); pr = sm["primary"]
    check((pr["Theta_km"] == NA and th == NA) or abs(float(pr["Theta_km"]) - th) <= 0.0015, "14/17 primary Theta recomputed (nested median, equal window weighting)")
    check(all((pr["Delta_w"][w]["Delta_w"] == NA and per[w] == NA) or (pr["Delta_w"][w]["Delta_w"] != NA and per[w] != NA and abs(float(pr["Delta_w"][w]["Delta_w"]) - per[w]) <= 0.0015) for w in mw) and pr["windowsNotAvailable"] == [w for w in mw if per[w] == NA] and pr["windowsWithValidPair"] == sum(1 for w in mw if per[w] != NA), "14 window-level Delta_w recomputed; NA windows recorded, not dropped")
    for key, h in (("delta_CA", 24), ("delta_CA", 48), ("delta_BA", 24), ("delta_BA", 48), ("delta_BA", 72)):
        per_s, th_s = theta(key, h); s = sm["secondary"]["nested"][f"{key}_{h}h"]; check((s["Theta"] == NA and th_s == NA) or abs(float(s["Theta"]) - th_s) <= 0.0015, f"14 secondary nested Theta recomputed: {key} {h}h")
    check(pr["bootstrapInterval"].startswith("NOT RUN") and pr["successCriterionEvaluated"] is False and "Theta = median_w[ median_i( E_C,i(72h) - E_A,i(72h) ) ]" in pr["endpoint"] and sm["noImputation"] is True and sm["noSubstitution"] is True and sm["parameterSelection"] == "NONE" and sm["modelSelection"] == "NONE" and sm["candidateStatus"] == "CANDIDATE_ONLY", "15/17 endpoint unchanged; no bootstrap; no selection; no imputation flags")
    env = R["environment"]; check(all(k in env for k in ("python", "platform", "numpy", "netCDF4", "parcels", "dependencyLockSha256", "modelSourceSha256", "runtimeCommit")) and env["runtimeCommit"] == "155995dd" and R["randomSeedsUsed"] == "none (deterministic pipeline; no stochastic component)", "18 deterministic execution metadata")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/evaluate_step39.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        check(proc.returncode == 0 and all(sha(Path(tmp) / n) == sha(D / n) for n in ("step39-paired-table.csv", "step39-summary.json", "step39-evaluation.json")), "20 evaluator re-run byte-identical")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "Theta_km": pr["Theta_km"], "windowsWithValidPair": pr["windowsWithValidPair"], "runs": 27, "m3Compared": compared, "replayVerified": replay_dir is not None}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
