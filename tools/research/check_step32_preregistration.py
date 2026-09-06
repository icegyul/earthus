"""Independent validator for STEP 32 Phase A (expanded independent holdout + temporal forcing test; preregistration only). exit 0 = PASS.
Checks: 1 ancestry (28 commits incl. 671a91cf) · 2 immutability (STEP 16-31 locks, runtime byte-identical to 155995dd) · 3 no model runs ·
4 no new data · 5 temporal test definition (A HYCOM_NATIVE_3H vs B HYCOM_DAILY, everything else identical) · 6 8-frame daily derivation
(00..21Z, label 00:00Z, unweighted mean, no smoothing / reconstruction) · 7 new holdout >= 20 drifters · 8 >= 6 windows · 9 cohort
disjointness (IDs and window starts re-derived from cohort-step16 + step20-holdout-derivation) · 10 no performance leakage (derivation tool
source scan, guard, forbiddenInputAccess 0, matrix windows = derivation windows) · 11 AG handling (no AG candidate after cutoff, recomputed
from the STEP 16 audit) · 12 future candidate frozen · 13 alpha frozen · 14 depth frozen · 15 metric definitions · 16 no post-hoc
replacement · 17 no parameter search · 18 independence / clustering wording · 19 source binding · 20 reproducibility (derivation re-run
byte-identical). Plus required-frame recomputation, ocean-box recomputation and overclaim-language scan. Deterministic output."""
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
PROTO, PREREG, RULE, MATRIX, SUMMARY, DERIV = D / "step32-temporal-holdout-protocol.md", D / "step32-preregistration.json", D / "step32-holdout-rule.json", D / "step32-temporal-experiment-matrix.json", D / "step32-summary.json", D / "step32-holdout-derivation.json"
DERIVE_TOOL = ROOT / "tools/research/derive_step32_holdout.py"
LOCK = {"docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474", "docs/research/step16-selection-audit.json": None, "docs/research/step20-holdout-derivation.json": None,
        "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4", "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd",
        "docs/research/step20-b6-holdout-summary.json": "fe2043b30aaba17d34e3d9a780379de9612541b75caa4ed487a10931a784d93b", "docs/research/step25c-summary.json": "42965f31980b47ca9f5dedecc9976a969a6e00d22e9bf227464fbbeea460e78d",
        "docs/research/step26-phase-b-summary.json": "bc242bb58cf98630c529e6c5f8dfaf1e05bce5b218ced248ced29aab22a3fce6", "docs/research/step27-depth-execution-summary.json": "d9c54f1df827af17b25c388b71f3b57357fc80d8db713f713572cf578322ae03",
        "docs/research/step28-field-summary.json": "a81350b33403e1da48384a2217e156ed9bbdaa3e1da685c17bbe08df5aab4175", "docs/research/step29-stokes-summary.json": "921783b2db14cb069f4578cb4a7aff29edf0672866c61eb495b7883a20a61e1f",
        "docs/research/step30a-rule.json": "9251be51fc3fc8cc3a3b9570a0b3902c01e653754389da55852bdd4e83ab803d", "docs/research/step30a-final-candidate-summary.json": "faaf891fa7c5308db70f97add419d370efa7346ee560c30e307ac33d0a01c504",
        "docs/research/step31-preregistration.json": "6fd9b46fc8998705d101330585c1b9d08ab1396d5de0f3fcd1df7613e6aaaafd", "docs/research/step31-decision-gate.json": "5407445ff04a8c4f6e90f5ba0534ae17163d0609693e8578edd422ba957650fe",
        "docs/research/step31-evidence-matrix.json": "c6e2cd627e0be05bf14d9f94ea01127674583b4b3f67d83cc0fd933a75b8c963", "docs/research/step31-summary.json": "35df4cd984b2a6406ecdb23be468c57036f04ce1fb0350416e92447beace1337",
        "docs/research/step31-model-evidence-synthesis-protocol.md": "bdfe479218dbbaeb7b513651626ba9e11ec5a2f062d110e0cabe092f2dd823ed", "tools/research/check_step31_synthesis.py": "a1f625b2a5f0361d6856615ec24b60668c2cb59829ad6b7368c299fff653c91b",
        "tools/research/select_step16_cohort.py": None, "tools/research/derive_step20_holdout.py": None}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "4bb4342b", "e0e7cfd2", "db6cea2f", "2841f511", "929d3468", "c974ce42", "86266b3a", "a4474eb8", "3338c7e4", "79a0d69d", "4942421a", "289815d6", "f0149153", "94d414b6", "813e1954", "671a91cf")
LEAK = re.compile(r"trajector|error_|paired|evaluation|-summary|step2[1-9]|step3[01]|glorys|stokes|aviso|ww3|models_v2|research_runtime|run_experiment|M3|haversine", re.I)
LANG = re.compile(r"\bproven\b|\bproves?\b|\bcauses?\b|\btruth\b|\boptimal\b|\bbest\b|\bsuperior\b|\bvalidated\b|production[- ]ready|statistically significant|\bselected as final\b|\bwinner\b", re.I)
STRIP = ("NOT_OPERATIONALLY_VALIDATED", "no operational winner", "No operational winner", "NOT_ESTABLISHED_AS_SUPERIOR", "established as superior", "no winner", "not a winner")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


ts = lambda s: datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
fmt = lambda t: t.strftime("%Y-%m-%dT%H:%M:%SZ")


def scan(text):
    for s in STRIP:
        text = text.replace(s, "")
    return [m.group(0) for m in LANG.finditer(text)]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for short in COMMITS:
        check(git("cat-file", "-t", short).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", short, "HEAD").returncode == 0, f"1 ancestry: {short}")
    q, R, M, S, V = load(PREREG), load(RULE), load(MATRIX), load(SUMMARY), load(DERIV)
    for rel, expected in LOCK.items():
        exp = expected or q["sourceBinding"].get(rel)
        check(exp is not None and sha(ROOT / rel) == exp, f"2 immutability: {rel}")
    for name in ("__init__.py", "datasets.py", "models.py", "models_v2.py", "wind.py", "cli.py", "cli_v2.py", "registry.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"2 runtime unchanged: {name}")
    check(q["status"] == "PREREGISTRATION LOCKED" and q["gitCommitAtDesign"] == "671a91cf" and q["protocolSha256"] == sha(PROTO) and q["holdoutRuleSha256"] == sha(RULE) and q["experimentMatrixSha256"] == sha(MATRIX) and q["summarySha256"] == sha(SUMMARY) and q["holdoutDerivationSha256"] == sha(DERIV) and q["tools"]["tools/research/derive_step32_holdout.py"] == sha(DERIVE_TOOL) and q["tools"]["tools/research/check_step32_preregistration.py"] == sha(__file__) and q["ruleId"] == R["ruleId"] == M["ruleId"] == S["ruleId"] == V["ruleId"] == "expanded-holdout-and-temporal-forcing-step32", "19 preregistration binds protocol / rule / matrix / summary / derivation / tools")
    check(V["ruleSha256"] == sha(RULE) and V["inputs"]["auditSha256"] == sha(D / "step16-selection-audit.json") == R["inputs"]["auditSha256"] and V["inputs"]["cohortSha256"] == sha(D / "cohort-step16.json") == R["inputs"]["cohortSha256"] and V["inputs"]["step20HoldoutDerivationSha256"] == sha(D / "step20-holdout-derivation.json") == R["inputs"]["step20HoldoutDerivationSha256"] and V["inputs"]["observationSha256"] == R["inputs"]["observationSha256"] == "22c0ecffc926d04f02ff2ed57be1bd2cc76c1c9048ac2d77a30a63c3bb2c0841" and M["derivationHash"] == V["derivationHash"] and M["holdoutDerivationSha256"] == sha(DERIV), "19 derivation bound to rule, audit, cohort, STEP 20 derivation, observations; matrix bound to derivation")
    c = S["counters"]
    check(c["MODEL_RUN_COUNT"] == 0 and c["NEW_DATA"] == 0 and c["NEW_TRAJECTORIES"] == 0 and c["ALPHA_CHANGE"] == "NO" and c["DEPTH_CHANGE"] == "NO" and c["FORCING_SELECTION"] == "NO" and c["MODEL_SELECTION"] == "NO" and V["modelRun"] is False and V["forcingAccessed"] is False and V["trajectoryComputed"] is False and V["performanceDataRead"] is False and not (ROOT / "data/research/step32").exists() and not any(D.glob("step32-*manifest*")) and not any(D.glob("step32-*trajector*")) and not any(D.glob("step32-*evaluation*")), "3/4 no model runs, no new data, no execution outputs")
    A, B = M["conditions"]["A"], M["conditions"]["B"]
    check(A["name"] == "HYCOM_NATIVE_3H" and B["name"] == "HYCOM_DAILY" and A["product"] == B["product"] and "expt_53.X" in A["product"] and A["depthMeters"] == 15.0 == B["depthMeters"] and A["gridDegrees"] == 0.08 == B["gridDegrees"] and A["cadence"] == "3-hourly instantaneous" and B["cadence"] == "daily mean" and M["onlyDifference"] == "ocean temporal representation" and set(M["identicalBetweenConditions"]) >= {"wind", "alpha", "depth", "spatial grid", "release positions", "release times", "drifter IDs", "computation area", "observation handling", "RK4", "integration timestep", "output timestep", "interpolation rules"} and M["stokes"] == "NONE", "5 temporal test definition")
    dd = B["dailyDerivation"]
    check(dd["framesPerUtcDay"] == 8 and dd["frameHoursUTC"] == [0, 3, 6, 9, 12, 15, 18, 21] and dd["labelTimeUTC"] == "00:00Z" and dd["method"] == "unweighted arithmetic mean of the eight frames (u and v separately)" and dd["weighting"] is False and dd["temporalSmoothing"] is False and dd["missingFrameReconstruction"] is False and dd["missingFramePolicy"] == "WINDOW_BLOCKED" and set(dd["stored"]) >= {"source file SHA", "source frame timestamps", "source u/v SHA", "daily derived SHA", "derivation script SHA"}, "6 8-frame daily derivation")
    check(V["status"] == "HOLDOUT_MET" and V["totalUniqueDrifters"] >= R["minimumDrifters"] == 20 and S["newHoldout"]["drifters"] == V["totalUniqueDrifters"] and len(V["expandedHoldoutDrifterIds"]) == V["totalUniqueDrifters"] == len(set(V["expandedHoldoutDrifterIds"])), "7 new holdout minimum 20 drifters")
    check(V["totalWindows"] >= R["minimumWindows"] == 6 and R["targetWindows"] == 8 and S["newHoldout"]["windows"] == V["totalWindows"], "8 minimum 6 windows")
    cohort, s20, audit = load(D / "cohort-step16.json"), load(D / "step20-holdout-derivation.json"), load(D / "step16-selection-audit.json")
    for rid in ("KE", "AG"):
        cal, hold = cohort["selectedWindowDetails"][rid], s20["regions"][rid]["selected"]
        prior_ids = {d for w in cal for d in w["newDrifterIds"]} | {d for w in hold for d in w["newDrifterIds"]}; prior_starts = {w["start"] for w in cal} | {w["start"] for w in hold}
        reg = V["regions"][rid]; new_ids = set(reg["expandedHoldoutDrifterIds"])
        check(sorted(prior_ids) == sorted(R["exclusion"][rid]["priorDrifterIds"]) == reg["priorDrifterIds"] and sorted(prior_starts) == sorted(R["exclusion"][rid]["priorWindowStarts"]) == reg["priorWindowStarts"], f"9 exclusion lists re-derived: {rid}")
        check(not (new_ids & prior_ids) and all(w["start"] not in prior_starts and all(abs((ts(w["start"]) - ts(p)).total_seconds()) >= 72 * 3600 for p in prior_starts) for w in reg["selected"]), f"9 cohort disjointness (IDs and window starts): {rid}")
        last_end = max(ts(w["end"]) for w in cal); cutoff = last_end + timedelta(days=R["separationDays"])
        check(reg["cutoff"] == fmt(cutoff) and all(ts(w["start"]) >= cutoff for w in reg["selected"]), f"9 cutoff = last calibration end + {R['separationDays']} d: {rid}")
        starts = [ts(w["start"]) for w in reg["selected"]]
        check(all((b - a).total_seconds() >= 72 * 3600 for a, b in zip(starts, starts[1:])) and starts == sorted(starts), f"9 selected windows chronological, >= 72 h apart: {rid}")
        seen = set()
        for w in reg["selected"]:
            row = [r for r in audit["rows"] if r["region"] == rid and r["start"] == w["start"]]
            check(len(row) == 1 and row[0]["eligibleWindow"] is True and row[0]["eligibleCount"] == w["eligibleCount"] and row[0]["end"] == w["end"], f"eligibility from STEP 16 audit: {w['windowId']}")
            check(not (set(w["newDrifterIds"]) & seen) and len(w["newDrifterIds"]) >= 1, f"new IDs unique across windows: {w['windowId']}"); seen |= set(w["newDrifterIds"])
            la = [d["startLat"] for d in w["drifters"]]; lo = [d["startLon"] for d in w["drifters"]]
            check(w["oceanBox"] == {"south": max(-40.0, min(la) - 2.0), "north": min(40.0, max(la) + 2.0), "west": min(lo) - 2.0, "east": max(lo) + 2.0}, f"ocean box = t0 bbox +- 2 deg clipped: {w['windowId']}")
            t0 = ts(w["start"]); d0 = (t0 - timedelta(days=1)).replace(hour=0); days = []
            while d0 <= t0 + timedelta(hours=72) + timedelta(days=1):
                days.append(d0); d0 += timedelta(days=1)
            frames = [fmt(d + timedelta(hours=3 * k)) for d in days for k in range(8)]
            check(w["requiredFrames"] == frames and w["requiredFrameCount"] == len(frames) == 8 * len(days) and w["requiredUtcDays"] == [d.strftime("%Y-%m-%d") for d in days] and not (set(frames) & set(R["coverage"]["knownMissingFrames"])) and ts(frames[-1]) <= ts(R["coverage"]["coverageEnd"]), f"7 required frames = 8 x every UTC day in [t0-1d, t0+72h+1d]: {w['windowId']}")
    ag_cal = cohort["selectedWindowDetails"]["AG"]; ag_cut = max(ts(w["end"]) for w in ag_cal) + timedelta(days=R["separationDays"])
    ag_cand = [r for r in audit["rows"] if r["region"] == "AG" and r["eligibleWindow"] and ts(r["start"]) >= ag_cut and ts(r["end"]) + timedelta(days=1) <= ts(R["coverage"]["coverageEnd"])]
    check(len(ag_cand) == 0 and V["regions"]["AG"]["status"] == "AG_EXPANDED_HOLDOUT_UNAVAILABLE" and V["regions"]["AG"]["candidateEligibleWindows"] == 0 and S["newHoldout"]["AG"] == "AG_EXPANDED_HOLDOUT_UNAVAILABLE" and M["AG"] == "AG_EXPANDED_HOLDOUT_UNAVAILABLE", "11 AG handling: no candidate after cutoff within coverage; no replacement")
    src = DERIVE_TOOL.read_text(encoding="utf-8")
    body = src.split('"""', 2)[2] if src.startswith('"""') else src
    lines = [l for l in body.split("\n") if not l.strip().startswith("FORBIDDEN")]
    literals = [m for m in re.findall(r'"([^"\n]*)"', "\n".join(lines)) if "/" in m or m.endswith((".json", ".csv", ".nc"))]
    imports = [l for l in lines if l.strip().startswith(("import ", "from "))]
    check("guarded_open" in body and "FORBIDDEN" in body and "forbiddenInputAccess" in body and not any(LEAK.search(x) for x in literals) and not any(re.search(r"research_runtime|models_v2|netCDF4|numpy", l) for l in imports) and V["forbiddenInputAccess"] == 0, f"10 no performance leakage: guarded derivation tool, no performance file access in source ({[x for x in literals if LEAK.search(x)][:5]})")
    mw = {w["windowId"]: w for w in M["windows"]}
    check(list(mw) == [w["windowId"] for r in ("KE", "AG") for w in V["regions"][r]["selected"]] and all(mw[w["windowId"]]["t0"] == w["start"] and mw[w["windowId"]]["end"] == w["end"] and mw[w["windowId"]]["drifterIds"] == w["newDrifterIds"] and mw[w["windowId"]]["oceanBox"] == w["oceanBox"] and mw[w["windowId"]]["requiredFrames"] == w["requiredFrames"] and mw[w["windowId"]]["windBox"] == {"south": max(-90.0, w["oceanBox"]["south"] - 3.0), "north": min(90.0, w["oceanBox"]["north"] + 3.0), "west": w["oceanBox"]["west"] - 3.0, "east": w["oceanBox"]["east"] + 3.0} for r in ("KE", "AG") for w in V["regions"][r]["selected"]), "10/19 matrix windows = derivation windows (t0, end, IDs, boxes, frames)")
    for w in M["windows"]:
        acq = w["acquisition"]
        check(acq["timeStart"] == w["requiredFrames"][0] and acq["timeEnd"] == w["requiredFrames"][-1] and acq["vertCoord"] == 15 and acq["variables"] == ["water_u", "water_v"] and acq["dataset"] == "GLBv0.08/expt_53.X" and acq["year"] == w["t0"][:4] and acq["phaseAExecuted"] is False, f"17/18 acquisition requirement registered, not executed: {w['windowId']}")
    fc = M["futureValidation"]["candidate"]; fb = M["futureValidation"]["baseline"]
    check(fc["ocean"].startswith("GLORYS12V1") and fc["depthMeters"] == 15.81007 and fc["stokesCoefficient"] == 1.0 and fc["alpha"] == 0.002 and fc["status"] == "CANDIDATE_ONLY" and fb["ocean"].startswith("HYCOM GOFS 3.1") and fb["depthMeters"] == 15.0 and fb["alpha"] == 0.002 and fb["status"] == "FROZEN_REFERENCE_BASELINE" and M["futureValidation"]["parameterSelectionFromNewHoldout"] is False and M["futureValidation"]["modelSelectionInStep32"] is False and S["candidate"]["status"] == "CANDIDATE_ONLY" and S["baseline"]["status"] == "FROZEN_REFERENCE_BASELINE", "12 future candidate and baseline frozen; no selection in STEP 32")
    check(M["temporalTest"]["alpha"] == 0.002 == A["alpha"] == B["alpha"] == S["alpha"] == q["alpha"] and M["temporalTest"]["alphaSearch"] is False, "13 alpha frozen 0.002")
    check(M["temporalTest"]["depthMeters"] == 15.0 == S["depthMetersTemporal"] and M["futureValidation"]["candidate"]["depthMeters"] == 15.81007 == S["depthMetersCandidate"] and M["temporalTest"]["depthSearch"] is False, "14 depth frozen (15.0 temporal / 15.81007 candidate)")
    mt = M["temporalTest"]["metrics"]; mv = M["futureValidation"]["metrics"]
    check(mt["primary"] == "M3" and mt["horizonsHours"] == [24, 48, 72] == mv["horizonsHours"] and mt["haversineRadiusMeters"] == 6371008.8 == mv["haversineRadiusMeters"] and mt["delta"] == "E_HYCOM_DAILY - E_HYCOM_NATIVE_3H (km)" and mv["delta"] == "E_candidate - E_HYCOM (km)" and mt["secondary"] == ["M1", "M2", "M4", "M5"] and mt["tieToleranceKm"] == 1e-6 == mv["tieToleranceKm"] and mt["pairing"] == "exact drifter_id and exact UTC timestamp" == mv["pairing"] and set(mv["report"]) >= {"median", "mean", "min", "max", "W/L/T", "n", "NA"} and mv["strata"] == ["CALIBRATION", "NEW_HOLDOUT"] and mv["oldHoldoutIncluded"] is False and mt["operationalWinner"] is False, "15 metric definitions")
    check(M["windowReplacement"]["performanceBased"] is False and M["windowReplacement"]["coverageFailureRule"] == "preregistered data-availability rule only (WINDOW_BLOCKED)" and M["outliers"] == {"removal": False, "trimming": False, "winsorization": False, "weighting": False, "postHocExclusion": False} and S["noPostHocReplacement"] is True, "16 no post-hoc replacement / no outlier handling")
    check(M["temporalTest"]["alphaSearch"] is False and M["temporalTest"]["depthSearch"] is False and M["temporalTest"]["coefficientSearch"] is False and M["futureValidation"]["parameterSelectionFromNewHoldout"] is False and c["ALPHA_CHANGE"] == "NO", "17 no parameter search")
    check("cluster" in M["independence"].lower() and "not" in M["independence"].lower() and "independent" in M["independence"].lower() and "cluster" in S["independence"].lower(), "18 independence / clustering wording")
    check(M["phaseBOrder"] == ["acquire HYCOM source forcing for the temporal-test windows", "quality-gate source forcing", "build HYCOM daily fields", "run HYCOM_NATIVE_3H vs HYCOM_DAILY", "independently verify replay", "execute candidate-vs-baseline validation on the new holdout only after the temporal-test source and the new holdout are frozen", "evaluate independently"] and M["phaseAExecuted"] == {"acquisition": False, "dailyForcing": False, "trajectories": False, "M3": False, "modelComparison": False, "candidateChoice": False, "performanceInspection": False}, "24/31 Phase B order registered; nothing executed in Phase A")
    check(S["currentHoldoutReused"] is False and not (set(V["expandedHoldoutDrifterIds"]) & {d for w in s20["regions"]["KE"]["selected"] for d in w["newDrifterIds"]}) and S["performanceLeakage"] is False and S["temporalTest"] == "HYCOM_NATIVE_3H vs HYCOM_DAILY" and S["dailyDerivation"] == "8 x 3 h frames per UTC day" and S["interpretation"] == "NONE", "16/summary consistency")
    hits = []
    for name, obj in (("rule", R), ("matrix", M), ("summary", S), ("preregistration", q)):
        hits += [f"{name}:{h}" for h in scan(json.dumps(obj, ensure_ascii=False))]
    hits += [f"protocol:{h}" for h in scan(PROTO.read_text(encoding="utf-8"))]
    check(not hits, f"no overclaim language ({hits[:8]})")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(DERIVE_TOOL), "--out", tmp], cwd=ROOT, capture_output=True, text=True, env={**__import__('os').environ, "PYTHONIOENCODING": "utf-8"})
        check(proc.returncode == 0 and sha(Path(tmp) / DERIV.name) == sha(DERIV), "20 reproducibility: derivation re-run byte-identical")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "phase": "A", "holdout": {"status": V["status"], "drifters": V["totalUniqueDrifters"], "windows": V["totalWindows"], "AG": V["regions"]["AG"]["status"]}, "modelRunCount": c["MODEL_RUN_COUNT"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
