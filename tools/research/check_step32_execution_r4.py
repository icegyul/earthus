"""REVISION r4 (uncommitted; r3 kept unchanged): manifests may be bound to any recorded Phase B preregistration version (revision history); drifter-ID comparison as sets (runs release in sorted-ID order, the matrix lists derivation order).
REVISION r3 (uncommitted; r2 kept unchanged; see docs/research/step32-phase-b-revisions.json): r3 tool names; r2 superseded tools verified unchanged.
REVISION r2 (uncommitted file-level revision; r1 kept unchanged; see docs/research/step32-phase-b-revisions.json): blocked windows (registered WINDOW_BLOCKED rule) are verified as blocked at every stage; counts use the evaluable set; r2 tool names.
Independent validator for STEP 32 Phase B execution. exit 0 = PASS. Groups: 1 ancestry (incl. ee64354d) · 2 immutability (Phase A files,
STEP 16-31 locks, STEP 18b preregistration, STEP 29 license status, runtime byte-identical to 155995dd; every Phase B tool equals the
Phase B preregistration SHA) · 3 source / provenance chain (acquisition -> quality -> daily -> runs -> evaluations bound by SHA; every raw,
normalized, trajectory and result file on disk equals its recorded SHA; queries expt_53.X 2011, vertCoord 15; 48 registered frames;
daily derivation 8 frames/day, unweighted, mask identical to A) · 4 anti-leakage (Phase A derivation unchanged, forbiddenInputAccess 0;
acquisition/build tools contain no performance-file path; matrix windows = derivation windows) · 5 replay (every run replayMatched;
independent re-execution directory `--replay-dir` byte-identical trajectories / result arrays / daily datasets) · 6 metrics recomputed
(M3, delta, W/L/T, labels under the locked rules for the temporal test and the validation; calibration stratum = frozen STEP 30A) ·
7 frozen parameters (alpha 0.002 in every trajectory row; depths 15.0 / 15.81007; no selection flags) · 8 evaluators re-run byte-identical ·
9 overclaim-language scan. Deterministic output."""
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
sys.path.insert(0, str(ROOT / "tools/research"))
import check_step32_preregistration as pa  # noqa: E402  (locked Phase A validator: LOCK dict and COMMITS reused)

PB = D / "step32-phase-b-preregistration.json"
FILES = {"matrix": D / "step32-temporal-experiment-matrix.json", "prereg": D / "step32-preregistration.json", "deriv": D / "step32-holdout-derivation.json", "acq": D / "step32-forcing-acquisition-manifest.json", "qc": D / "step32-forcing-quality.json", "daily": D / "step32-daily-derivation-manifest.json",
         "runsT": D / "step32-temporal-run-manifest.json", "replT": D / "step32-temporal-replay-manifest.json", "evalT": D / "step32-temporal-evaluation.json", "sumT": D / "step32-temporal-summary.json", "tabT": D / "step32-temporal-paired-table.csv",
         "cacq": D / "step32-candidate-acquisition-manifest.json", "cfor": D / "step32-candidate-forcing-manifest.json", "runsC": D / "step32-candidate-run-manifest.json", "replC": D / "step32-candidate-replay-manifest.json", "evalV": D / "step32-validation-evaluation.json", "sumV": D / "step32-validation-summary.json", "tabV": D / "step32-validation-paired-table.csv"}
TOOLS = ["acquire_step32_forcing_r2.py", "check_step32_forcing.py", "build_step32_daily.py", "step32_runs_r3.py", "run_step32_temporal_r3.py", "replay_step32_run_r3.py", "evaluate_step32_temporal_r2.py", "acquire_step32_candidate_forcing_r2.py", "build_step32_candidate_forcing.py", "evaluate_step32_validation_r2.py", "check_step32_execution_r4.py"]
R1 = ["acquire_step32_forcing.py", "step32_runs.py", "run_step32_temporal.py", "replay_step32_run.py", "evaluate_step32_temporal.py", "acquire_step32_candidate_forcing.py", "evaluate_step32_validation.py", "check_step32_execution.py", "step32_runs_r2.py", "run_step32_temporal_r2.py", "replay_step32_run_r2.py", "check_step32_execution_r2.py", "check_step32_execution_r3.py"]
LEAK = re.compile(r"trajector(y|ies)\.csv|paired-table|-evaluation\.json|-summary\.json|result\.json|step30a-final|step29-stokes-(paired|evaluation|summary)|step25c-(paired|evaluation|summary)", re.I)
LANG = re.compile(r"\bproven\b|\bproves?\b|\bcauses?\b|\btruth\b|\boptimal\b|\bbest\b|\bsuperior\b|\bvalidated\b|production[- ]ready|statistically significant|\bselected as final\b|\bwinner\b", re.I)
STRIP = ("no operational winner", "No operational winner", "declares no operational winner", "operationalWinner", "NOT_OPERATIONALLY_VALIDATED")
RADIUS_M = 6371008.8; NA = "NOT_AVAILABLE"; H = (24, 48, 72); TOL = 1e-6; FMT = "%Y-%m-%dT%H:%M:%SZ"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def hav(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * RADIUS_M * math.asin(math.sqrt(a)) / 1000


def positions(path):
    out, alphas = {}, set()
    with open(path, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            alphas.add(row["alpha"])
            if row["valid"] == "true":
                out.setdefault(row["drifter_id"], {})[row["timestamp"]] = (float(row["lon"]), float(row["lat"]))
    return out, alphas


def median(v):
    v = sorted(v)
    if not v:
        return None
    m = len(v) // 2; return round(v[m] if len(v) % 2 else (v[m - 1] + v[m]) / 2, 3)


def close(a, b, eps=0.0015):
    if a in (NA, None) or b in (NA, None):
        return a in (NA, None) and b in (NA, None)
    return abs(float(a) - float(b)) <= eps


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def scan(text):
    for s in STRIP:
        text = text.replace(s, "")
    return [m.group(0) for m in LANG.finditer(text)]


def observations(w):
    t0 = datetime.strptime(w["t0"], FMT).replace(tzinfo=timezone.utc); t1 = t0 + timedelta(hours=72); obs = {}
    for path in sorted((ROOT / "data/research/step15/noaa-gdp-hourly-qc").glob(f"{w['region']}-{w['t0'][:4]}-q*.csv")):
        with open(path, encoding="utf-8", newline="") as fh:
            reader = csv.reader(fh); next(reader); next(reader)
            for r in reader:
                if r[0] in w["drifterIds"]:
                    t = datetime.strptime(r[1], FMT).replace(tzinfo=timezone.utc)
                    if t0 <= t <= t1:
                        obs.setdefault(r[0], {})[r[1]] = (float(r[3]), float(r[2]))
    return obs, {h: (t0 + timedelta(hours=h)).strftime(FMT) for h in H}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    argv = sys.argv[1:]; replay_dir = Path(argv[argv.index("--replay-dir") + 1]) if "--replay-dir" in argv else None
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for short in pa.COMMITS + ("ee64354d",):
        check(git("cat-file", "-t", short).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", short, "HEAD").returncode == 0, f"1 ancestry: {short}")
    q = load(FILES["prereg"]); pb = load(PB); REV = load(D / "step32-phase-b-revisions.json"); pb_ok = {sha(PB)} | set(REV.get("phaseBPreregistrationHistory", {}).values())
    for rel, expected in pa.LOCK.items():
        exp = expected or q["sourceBinding"].get(rel); check(exp is not None and sha(ROOT / rel) == exp, f"2 immutability: {rel}")
    for rel, expected in {"docs/research/step32-temporal-holdout-protocol.md": q["protocolSha256"], "docs/research/step32-holdout-rule.json": q["holdoutRuleSha256"], "docs/research/step32-holdout-derivation.json": q["holdoutDerivationSha256"], "docs/research/step32-temporal-experiment-matrix.json": q["experimentMatrixSha256"], "docs/research/step32-summary.json": q["summarySha256"], **q["tools"]}.items():
        check(sha(ROOT / rel) == expected, f"2 Phase A locked file unchanged: {rel}")
    check(sha(FILES["prereg"]) == pb["phaseAPreregistrationSha256"] == "732ca966b6227fb5447b99bb2a06f59a38fdc7f2d1ffd9a5d4a5097bc175c971", "2 Phase A preregistration unchanged")
    for name in ("__init__.py", "datasets.py", "models.py", "models_v2.py", "wind.py", "cli.py", "cli_v2.py", "registry.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"2 runtime unchanged: {name}")
    check(sha(D / "step18b-preregistration.json") == "02935e81e9c93690078ff96231c74ad51c86dfaffa89bfa17a2e2ba082306316" and sha(D / "step29-stokes-license-status.json") == "8a8640ac534c1fb9b8551a4a1e777f8a96d6f6c271d896246ed13b8cf93cb24b", "2 STEP 18b preregistration / STEP 29 license status unchanged")
    for t in TOOLS:
        check(pb["tools"].get(f"tools/research/{t}") == sha(ROOT / "tools/research" / t), f"2 Phase B tool equals preregistration: {t}")
    for t in R1:
        check(pb["supersededTools"].get(f"tools/research/{t}") == sha(ROOT / "tools/research" / t), f"2 superseded r1 tool unchanged on disk: {t}")
    for rel, expected in pb["reusedTools"].items():
        check(sha(ROOT / rel) == expected, f"2 reused tool unchanged: {rel}")
    for k, p in FILES.items():
        check(p.exists(), f"3 output present: {p.name}")
    if failures:
        print(json.dumps({"result": "FAIL", "failures": failures[:40]}, ensure_ascii=False, indent=2)); return 1
    M, V, A, Q, DL, RT, RPT, ET, ST, CA, CF, RC, RPC, EV, SV = (load(FILES[k]) for k in ("matrix", "deriv", "acq", "qc", "daily", "runsT", "replT", "evalT", "sumT", "cacq", "cfor", "runsC", "replC", "evalV", "sumV"))
    ms = sha(FILES["matrix"])
    check(A["experimentMatrixSha256"] == ms and A["phaseBPreregistrationSha256"] in pb_ok and Q["acquisitionManifestSha256"] == sha(FILES["acq"]) and DL["acquisitionManifestSha256"] == sha(FILES["acq"]) and DL["qualityReportSha256"] == sha(FILES["qc"]) and RT["experimentMatrixSha256"] == ms and RT["acquisitionManifestSha256"] == sha(FILES["acq"]) and RT["dailyManifestSha256"] == sha(FILES["daily"]) and RPT["runManifestSha256"] == sha(FILES["runsT"]) and ET["runManifestSha256"] == sha(FILES["runsT"]) and ET["tableSha256"] == sha(FILES["tabT"]) and ET["summarySha256"] == sha(FILES["sumT"]), "3 temporal chain bound by SHA")
    check(CA["experimentMatrixSha256"] == ms and CA["phaseBPreregistrationSha256"] in pb_ok and CF["candidateAcquisitionManifestSha256"] == sha(FILES["cacq"]) and RC["experimentMatrixSha256"] == ms and RC["candidateManifestSha256"] == sha(FILES["cfor"]) and RPC["runManifestSha256"] == sha(FILES["runsC"]) and EV["temporalRunManifestSha256"] == sha(FILES["runsT"]) and EV["candidateRunManifestSha256"] == sha(FILES["runsC"]) and EV["tableSha256"] == sha(FILES["tabV"]) and EV["summarySha256"] == sha(FILES["sumV"]), "3 candidate chain bound by SHA")
    check(A["tool"]["sha256"] == pb["tools"]["tools/research/acquire_step32_forcing_r2.py"] and DL["derivationScript"]["sha256"] == pb["tools"]["tools/research/build_step32_daily.py"] and RT["runnerSha256"] == pb["tools"]["tools/research/run_step32_temporal_r3.py"] == RC["runnerSha256"] and RT["sharedModuleSha256"] == pb["tools"]["tools/research/step32_runs_r3.py"] and RT["replayToolSha256"] == pb["tools"]["tools/research/replay_step32_run_r3.py"] and CF["builder"]["sha256"] == pb["tools"]["tools/research/build_step32_candidate_forcing.py"] and CA["tool"]["sha256"] == pb["tools"]["tools/research/acquire_step32_candidate_forcing_r2.py"], "3 manifests record the preregistered tool SHAs")
    check(CA["credentialsInManifest"] is False and CA["glorys"]["authentication"]["contentsRead"] is False and "password" not in json.dumps(CA).lower().replace("password [redacted]", "").replace("\"password\" not in", ""), "credential rule: nothing recorded")
    mw = {w["windowId"]: w for w in M["windows"]}; dw = {w["windowId"]: w for r in ("KE", "AG") for w in V["regions"][r]["selected"]}
    check(list(mw) == list(dw) and all(mw[k]["drifterIds"] == dw[k]["newDrifterIds"] and mw[k]["t0"] == dw[k]["start"] for k in mw) and V["forbiddenInputAccess"] == 0 and V["performanceDataRead"] is False, "4 windows and drifters = locked derivation; forbiddenInputAccess 0")
    for t in ("acquire_step32_forcing_r2.py", "build_step32_daily.py", "acquire_step32_candidate_forcing_r2.py", "build_step32_candidate_forcing.py", "step32_runs_r3.py", "derive_step32_holdout.py"):
        body = (ROOT / "tools/research" / t).read_text(encoding="utf-8"); body = body.split('"""', 2)[2] if body.startswith('"""') else body
        lits = [m for m in re.findall(r'"([^"\n]*)"', body) if "/" in m or m.endswith((".json", ".csv"))]
        check(not any(LEAK.search(x) for x in lits), f"4 no performance-file path in {t} ({[x for x in lits if LEAK.search(x)][:3]})")
    check(not (ROOT / "data/research/step32/forcing").exists() or not any(p.name.endswith("trajectories.csv") for p in (ROOT / "data/research/step32/forcing").rglob("*")), "4 no trajectory file inside the forcing tree")
    # ---- B1/B2/B3 provenance ----
    qc = {w["windowId"]: w for w in Q["windows"]}; dl = {w["windowId"]: w for w in DL["windows"]}
    blocked = set(RT.get("blockedWindows", [])); E = [wid for wid in mw if wid not in blocked]; nE = sum(len(mw[w]["drifterIds"]) for w in E)
    check(blocked == {wid for wid in mw if qc[wid]["status"] == "WINDOW_BLOCKED"} and all(qc[wid]["missingRegisteredFrames"] for wid in blocked) and all(qc[wid]["status"] == "PASS" for wid in E) and blocked == set(RC.get("blockedWindows", [])), "3 blocked windows identical across gate, temporal runs and candidate runs; every blocked window has a missing registered frame")
    for wid in blocked:
        check(dl[wid].get("derived") is False and all(r["status"].startswith("WINDOW_BLOCKED") for r in RT["runs"] if r["windowId"] == wid) and all(r["status"].startswith("WINDOW_BLOCKED") for r in RC["runs"] if r["windowId"] == wid) and next(x for x in CA["windows"] if x["windowId"] == wid)["status"] == "WINDOW_BLOCKED" and next(x for x in CF["windows"] if x["windowId"] == wid)["status"] == "WINDOW_BLOCKED", f"3 blocked window carried as WINDOW_BLOCKED through every stage: {wid}")
    for rec in A["windows"]:
        wid = rec["windowId"]; w = mw[wid]
        for e, sub in [(e, "hycom") for e in rec["hycomWindowParts"]] + [(e, "hycom-days") for e in rec["hycomDayParts"]] + [(e, "ncep") for e in rec["ncep"]]:
            p = ROOT / "data/research/step32/forcing" / wid / sub / e["filename"]; check(p.exists() and sha(p) == e["sha256"] and p.stat().st_size == e["bytes"] and e.get("retrievedAtUTC") is not None, f"3 raw file SHA/bytes/timestamp: {wid}/{e['filename']}")
            if sub != "ncep":
                check("expt_53.X/data/2011?" in e["query"] and "vertCoord=15" in e["query"] and e["metadata"]["depthMeters"] == [15.0] and e["metadata"]["units"] == {"water_u": "m/s", "water_v": "m/s"}, f"3 source identity: {wid}/{e['filename']}")
        got = sorted(t for e in rec["hycomDayParts"] for t in e["metadata"]["timeUTC"]); check((got == w["requiredFrames"] and rec["missingRegisteredFrames"] == [] and len(got) == 48) if wid in E else (rec["missingRegisteredFrames"] != [] and set(rec["missingRegisteredFrames"]) == set(w["requiredFrames"]) - set(got)), f"3 registered frames: all 48 acquired (evaluable) / missing recorded (blocked): {wid}")
        if wid not in E:
            continue
        nat = rec["hycomNative3h"]; check(nat["frames"] == 25 and nat["timeStart"] == w["t0"] and nat["timeEnd"] == w["end"] and (nat["chunked"] == (nat["valuesCount"] > 2_000_000)), f"3 condition A 25 frames; chunked iff > MAX_VALUES: {wid}")
        for f in ([nat["file"]] if not nat["chunked"] else [c["file"] for c in nat["chunks"].values()]) + [rec["wind"]["file"]]:
            check((ROOT / f).exists(), f"3 normalized file present: {f}")
        check(qc[wid]["status"] == "PASS" and all(qc[wid]["checks"].values()) and qc[wid]["reproducibility"]["overlapEqual"] == 25, f"3 quality gate PASS with 25/25 overlap frames equal: {wid}")
        d = dl[wid]; check(d["status"] == "DERIVED" and len(d["days"]) == 6 and all(x["frameCount"] == 8 and x["frameTimestamps"] == [f"{x['utcDay']}T{h:02d}:00:00Z" for h in range(0, 24, 3)] and x["sourceFileSha256"] == next(e["sha256"] for e in rec["hycomDayParts"] if e["utcDay"] == x["utcDay"]) for x in d["days"]) and d["landMask"]["identicalToNative3h"] is True and d["derivationScriptSha256"] == pb["tools"]["tools/research/build_step32_daily.py"] and sha(ROOT / d["derived"]["file"]) == d["derived"]["fileSha256"] and d["dailyFrames"] == 6, f"3 daily derivation 6 x 8 frames, mask identical, provenance: {wid}")
        ds = load(ROOT / d["derived"]["file"]); check(ds["manifest"]["timeStepSeconds"] == 86400 and ds["grid"]["timeUTC"] == [f"{x['utcDay']}T00:00:00Z" for x in d["days"]] and ds["manifest"]["surfaceDepthMeters"] == 15.0 and any(h.get("operation") == "hycom-3h-to-utc-daily-mean/1" and h.get("weighting") is False and h.get("temporalSmoothing") is False and h.get("gapFilling") is False for h in ds["manifest"]["processingHistory"]), f"3 daily dataset labels 00Z, 86400 s, 15.0 m, unweighted: {wid}")
    check(DL["configuration"] == M["conditions"]["B"]["dailyDerivation"], "3 daily configuration = locked matrix")
    # ---- runs / replay ----
    runsT = {(r["windowId"], r["condition"]): r for r in RT["runs"] if r["windowId"] in E}; runsC = {r["windowId"]: r for r in RC["runs"] if r["windowId"] in E}
    check(RT["status"] == "STEP32_RUNS_PASS" and RT["conditions"] == ["A", "B"] and len(RT["runs"]) == 16 and len(runsT) == 2 * len(E) and all(r["status"] == "COMPLETED" and r["replayMatched"] and r["alpha"] == 0.002 and r["depthMeters"] == 15.0 for r in runsT.values()) and RPT["allMatched"] and RT["modelRunCount"] == 2 * len(E), f"5 temporal runs {2 * len(E)}/{2 * len(E)} (evaluable windows) completed and replay-matched; blocked recorded")
    check(RC["status"] == "STEP32_RUNS_PASS" and RC["conditions"] == ["C"] and len(RC["runs"]) == 8 and len(runsC) == len(E) and all(r["status"] == "COMPLETED" and r["replayMatched"] and r["alpha"] == 0.002 and r["depthMeters"] == 15.81007 for r in runsC.values()) and RPC["allMatched"], f"5 candidate runs {len(E)}/{len(E)} completed and replay-matched")
    check(all(r["modelSourceSha256"] == "306a597613f625e09d0788405b7b7e3b3a944627d4217b8da77e66a74859dee3" for r in list(runsT.values()) + list(runsC.values())), "2 frozen model source SHA on every run")
    pts = {}; alphas = set()
    for r in list(runsT.values()) + list(runsC.values()):
        p = ROOT / r["trajectoriesFile"]; check(sha(p) == r["trajectoriesSha256"] and sha(ROOT / r["resultFile"]) == r["resultSha256"], f"3 trajectory/result SHA: {r['runId']}")
        pts[(r["windowId"], r["condition"])], a_ = positions(p); alphas |= a_
        check(sorted(r["drifterIds"]) == sorted(mw[r["windowId"]]["drifterIds"]) and r["area"] == {"west": mw[r["windowId"]]["oceanBox"]["west"], "east": mw[r["windowId"]]["oceanBox"]["east"], "south": max(mw[r["windowId"]]["oceanBox"]["south"], -40.0), "north": min(mw[r["windowId"]]["oceanBox"]["north"], 40.0)} and r["integrationStepSeconds"] == 300 and r["outputStepSeconds"] == 900 and r["durationSeconds"] == 259200, f"7 run configuration frozen: {r['runId']}")
        check(r["wind"]["fileSha256"] == next(x for x in A["windows"] if x["windowId"] == r["windowId"])["wind"]["fileSha256"], f"5 identical wind file across conditions: {r['runId']}")
    check(alphas == {"0.002"}, "7 alpha 0.002 in every trajectory row")
    for wid in E:
        a, b = runsT[(wid, "A")], runsT[(wid, "B")]; nat = next(x for x in A["windows"] if x["windowId"] == wid)["hycomNative3h"]
        check((a["forcing"].get("gridSha256") == nat.get("gridSha256")) if not nat["chunked"] else (a["forcing"]["gridSha256"] == {n: c["gridSha256"] for n, c in nat["chunks"].items()}), f"3 condition A forcing = acquisition manifest: {wid}")
        check(b["forcing"]["gridSha256"] == dl[wid]["derived"]["gridSha256"] and b["forcing"]["file"] == dl[wid]["derived"]["file"], f"3 condition B forcing = daily manifest: {wid}")
        cf = next(x for x in CF["windows"] if x["windowId"] == wid); t = cf["treatment"]
        check(cf["status"] == "BUILT" and cf["ww3Gate"]["status"] == "PASS" and cf["stokesCoefficient"] == 1.0 and (runsC[wid]["forcing"].get("gridSha256") == t.get("gridSha256") if not t["chunked"] else runsC[wid]["forcing"]["gridSha256"] == {n: c["gridSha256"] for n, c in t["chunks"].items()}), f"3 candidate forcing built, gate PASS, coefficient 1.0, run bound: {wid}")
    if replay_dir is not None:
        RR = load(replay_dir / "step32-temporal-run-manifest.json"); rr = {(r["windowId"], r["condition"]): r for r in RR["runs"]}
        for k, r in runsT.items():
            o = rr.get(k); check(o is not None and o["resultArraySha256"] == r["resultArraySha256"] and o["trajectoriesSha256"] == r["trajectoriesSha256"] and sha(replay_dir / k[0] / f"{k[1]}-alpha0.002" / "trajectories.csv") == r["trajectoriesSha256"], f"5 independent re-execution byte-identical: {r['runId']}")
        RD = load(replay_dir / "daily" / "step32-daily-derivation-manifest.json"); rd = {w["windowId"]: w for w in RD["windows"]}
        for wid in E:
            check(rd[wid]["derived"]["gridSha256"] == dl[wid]["derived"]["gridSha256"] and rd[wid]["days"] == dl[wid]["days"] and rd[wid]["landMask"]["sha256"] == dl[wid]["landMask"]["sha256"], f"5 independent daily re-derivation identical: {wid}")
        RCF = load(replay_dir / "candidate" / "step32-candidate-forcing-manifest.json"); rcf = {w["windowId"]: w for w in RCF["windows"]}
        for wid in E:
            t, u = next(x for x in CF["windows"] if x["windowId"] == wid)["treatment"], rcf[wid]["treatment"]
            check((t.get("gridSha256") == u.get("gridSha256")) if not t["chunked"] else all(t["chunks"][n]["gridSha256"] == u["chunks"][n]["gridSha256"] for n in t["chunks"]), f"5 independent candidate forcing re-build identical: {wid}")
    else:
        failures.append("5 --replay-dir not supplied: independent re-execution not verified")
    # ---- metrics recomputed ----
    with open(FILES["tabT"], encoding="utf-8", newline="") as fh:
        tabT = {(r["unit"], r["drifter_id"]): r for r in csv.DictReader(fh)}
    with open(FILES["tabV"], encoding="utf-8", newline="") as fh:
        tabV = {(r["unit"], r["drifter_id"]): r for r in csv.DictReader(fh)}
    check(len(tabT) == nE == len(tabV) and set(u for u, _ in tabT) == set(E) and ST["blockedWindows"] == sorted(blocked) == SV["blockedWindows"] and ST["belowPreregisteredMinimum"]["drifters"] == (nE < 20) and ST["belowPreregisteredMinimum"]["windows"] == (len(E) < 6) and all(r["role"] == "NEW_HOLDOUT" for r in tabT.values()) and not any(u.startswith("KE-H") for u, _ in tabV), "6 tables 32 new-holdout drifters; historical holdout excluded")
    dT = {h: [] for h in H}; dV = {h: [] for h in H}; mism = 0; compared = 0
    for wid in E:
        w = mw[wid]; obs, tsd = observations(w)
        for did in w["drifterIds"]:
            rt, rv = tabT[(wid, did)], tabV[(wid, did)]
            for h in H:
                ob = obs.get(did, {}).get(tsd[h]); pa_, pb_, pc_ = pts[(wid, "A")].get(did, {}).get(tsd[h]), pts[(wid, "B")].get(did, {}).get(tsd[h]), pts[(wid, "C")].get(did, {}).get(tsd[h])
                ea = hav(*pa_, *ob) if pa_ and ob else NA; eb = hav(*pb_, *ob) if pb_ and ob else NA; ec = hav(*pc_, *ob) if pc_ and ob else NA
                for mine, val in ((ea, rt[f"error_A_3H_{h}h"]), (eb, rt[f"error_B_DAILY_{h}h"]), (ea, rv[f"error_HYCOM_{h}h"]), (ec, rv[f"error_CAND_{h}h"])):
                    compared += 1; mism += 0 if close(mine, val, 0.001) else 1
                dt, dv = rt[f"delta_{h}h"], rv[f"delta_{h}h"]
                check((NA in (ea, eb)) == (dt == NA) and (dt == NA or abs(float(eb) - float(ea) - float(dt)) <= 0.0015), f"6 temporal delta = E_B - E_A: {wid}/{did}/{h}h")
                check((NA in (ec, ea)) == (dv == NA) and (dv == NA or abs(float(ec) - float(ea) - float(dv)) <= 0.0015), f"6 validation delta = E_cand - E_HYCOM: {wid}/{did}/{h}h")
                if dt != NA:
                    dT[h].append(float(dt))
                if dv != NA:
                    dV[h].append(float(dv))
    check(mism == 0 and compared == nE * 3 * 4, f"6 M3 recomputed ({mism} mismatches of {compared})")
    def lab_t(ds):
        med = median(ds); w_ = sum(1 for x in ds if x < -TOL); l_ = sum(1 for x in ds if x > TOL)
        if med is None or w_ + l_ == 0:
            return "NO_CLEAR_TEMPORAL_DIFFERENCE"
        if med > TOL and l_ / (w_ + l_) >= 2 / 3:
            return "NATIVE_3H_DESCRIPTIVELY_FAVORED"
        if med < -TOL and w_ / (w_ + l_) >= 2 / 3:
            return "DAILY_DESCRIPTIVELY_FAVORED"
        return "NO_CLEAR_TEMPORAL_DIFFERENCE"
    def lab_v(ds):
        med = median(ds); w_ = sum(1 for x in ds if x < -TOL); l_ = sum(1 for x in ds if x > TOL)
        if med is None or w_ + l_ == 0:
            return "NO_CLEAR_DESCRIPTIVE_DIFFERENCE"
        if med < -TOL and w_ / (w_ + l_) >= 2 / 3:
            return "CANDIDATE_DESCRIPTIVELY_FAVORED"
        if med > TOL and l_ / (w_ + l_) >= 2 / 3:
            return "HYCOM_DESCRIPTIVELY_FAVORED"
        return "NO_CLEAR_DESCRIPTIVE_DIFFERENCE"
    for h in H:
        o = ST["overall"][f"{h}h"]; check(o["n"] == len(dT[h]) and o["n"] + o["notAvailable"] == nE and (o["wins_daily"], o["losses_daily"], o["ties"]) == (sum(1 for x in dT[h] if x < -TOL), sum(1 for x in dT[h] if x > TOL), sum(1 for x in dT[h] if abs(x) <= TOL)) and close(o["delta"]["median"], median(dT[h]), 0.0015), f"6 temporal W/L/T and median recomputed: {h}h")
        v = SV["strata"]["NEW_HOLDOUT"][f"{h}h"]; check(v["n"] == len(dV[h]) and v["n"] + v["notAvailable"] == nE and (v["wins_candidate"], v["losses_candidate"], v["ties"]) == (sum(1 for x in dV[h] if x < -TOL), sum(1 for x in dV[h] if x > TOL), sum(1 for x in dV[h] if abs(x) <= TOL)) and close(v["delta"]["median"], median(dV[h]), 0.0015), f"6 validation W/L/T and median recomputed: {h}h")
        check(sum(ST["perWindow"][w][f"{h}h"]["n"] for w in E) == ST["overall"][f"{h}h"]["n"] and sum(SV["perWindow"][w][f"{h}h"]["n"] for w in E) == v["n"], f"6 per-window n sums to overall (clusters reported): {h}h")
    check(ST["descriptiveLabel"]["overall72h"] == lab_t(dT[72]) and ST["descriptiveLabel"]["rule"] == M["temporalTest"]["metrics"]["descriptiveLabelRule"] and ST["operationalWinner"] is False and ST["baselineModified"] is False and ST["candidateModified"] is False, "6 temporal label per locked rule; no operational winner")
    check(SV["descriptiveLabel"]["NEW_HOLDOUT_72h"] == lab_v(dV[72]) and SV["labelRule"] == load(D / "step30a-rule.json")["interpretationRule"] and SV["modelSelection"] == "NONE" and SV["parameterSelection"] == "NONE" and SV["candidateStatus"] == "CANDIDATE_ONLY" and SV["baselineStatus"] == "FROZEN_REFERENCE_BASELINE" and SV["oldHoldoutIncluded"] is False, "6 validation label per locked STEP 30A rule; no selection")
    s30 = load(D / "step30a-final-candidate-summary.json"); cal = SV["strata"]["CALIBRATION"]
    check(cal["sha256"] == "faaf891fa7c5308db70f97add419d370efa7346ee560c30e307ac33d0a01c504" == sha(D / "step30a-final-candidate-summary.json") and all(cal[f"{h}h"]["delta"] == s30["strata"]["calibration"][f"{h}h"]["delta"] and cal[f"{h}h"]["wins_candidate"] == s30["strata"]["calibration"][f"{h}h"]["wins_candidate"] for h in H) and cal["n_drifters"] == 23 and cal["label72h"] == s30["descriptiveLabel"]["byStratum"]["calibration"], "6 calibration stratum = frozen STEP 30A")
    check("cluster" in ST["clustering"] and "not independent" in ST["clustering"] and "cluster" in SV["clustering"] and "never merged" in SV["clustering"], "6 clustering wording")
    check(ST["outlierPolicyApplied"] == {"removed": 0, "trimmed": 0, "winsorized": 0, "weighted": 0, "deleted": 0, "postHocExclusions": 0} == SV["outlierPolicyApplied"], "7 no outlier handling")
    hits = [f"{n}:{h}" for n, obj in (("temporal", ST), ("validation", SV)) for h in scan(json.dumps({k: v for k, v in obj.items() if k not in ("overall", "perWindow", "strata", "labelRule", "descriptiveLabel")}, ensure_ascii=False) + " ".join(obj["statements"]))]
    check(not hits, f"9 no overclaim language ({hits[:6]})")
    with tempfile.TemporaryDirectory() as tmp:
        p1 = subprocess.run([sys.executable, str(ROOT / "tools/research/evaluate_step32_temporal_r2.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True); p2 = subprocess.run([sys.executable, str(ROOT / "tools/research/evaluate_step32_validation_r2.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        check(p1.returncode == 0 and p2.returncode == 0 and all(sha(Path(tmp) / n) == sha(D / n) for n in ("step32-temporal-paired-table.csv", "step32-temporal-summary.json", "step32-temporal-evaluation.json", "step32-validation-paired-table.csv", "step32-validation-summary.json", "step32-validation-evaluation.json")), "8 evaluators re-run byte-identical")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "temporalLabel72h": ST["descriptiveLabel"]["overall72h"], "temporalPrimary72h": ST["primary72h"], "newHoldoutLabel72h": SV["descriptiveLabel"]["NEW_HOLDOUT_72h"], "newHoldoutPrimary72h": SV["primaryNewHoldout72h"], "modelRunCount": RT["modelRunCount"] + RC["modelRunCount"], "blockedWindows": sorted(blocked), "evaluableWindows": E, "evaluableDrifters": nE, "m3Compared": compared}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
