"""Independent validator for STEP 35 Phase A (preregistration lock of the next expanded validation; no experiment). exit 0 = PASS.
Groups: 1 ancestry · 2 frozen inputs (STEP 32 Phase A files, Phase B preregistration d7434d28 and 17 outputs at the STEP 33 snapshot,
STEP 32 preregistration 732ca966, 9 completed trajectories, holdout derivation ab3d06de, STEP 33 files, STEP 34 files, STEP 16-31 locks,
runtime 155995dd) · 3 order (period lock timestamp < inventory start < derivation; period lock bound to the protocol; inventory bound to
the period lock; cohort bound to both) · 4 inventory metadata-only (no velocity variable in any request URL; response files SHA;
cross-check identical; days recomputed from the recorded axes; known gaps confirmed) · 5 eligibility re-derived from the STEP 16 audit,
period, cutoff, prior windows and the inventory for every audit row · 6 exclusion lists re-derived (STEP 20 calibration + holdout, all 32
STEP 32 IDs and 8 starts) and disjointness of the selected IDs / starts · 7 accumulation order, region separation, primary prefix, minimum
6 windows / 20 drifters gate · 8 cohort manifest fields (window_id, region, drifter_id, start/end, source, experiment, frame inventory,
eligibility, exclusion, rank) and summary · 9 no velocity / forcing / trajectory downloaded or computed (data/research/step35 holds only
metadata responses) · 10 forbidden input access 0 and tool source scan · 11 reproducibility (derivation re-run byte-identical) · 12
report consistency. Deterministic output."""
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
sys.path.insert(0, str(ROOT / "tools/research"))
import check_step32_preregistration as pa  # noqa: E402

PROTO, LOCK, INV, ELIG, COH, REPORT = D / "step35-phase-a-protocol.json", D / "step35-period-lock.json", D / "step35-frame-inventory.json", D / "step35-window-eligibility.json", D / "step35-cohort-manifest.json", D / "step35-preregistration-report.md"
TOOLS = ("tools/research/inventory_step35_frames.py", "tools/research/derive_step35_cohort.py", "tools/research/check_step35_phase_a.py")
FMT = "%Y-%m-%dT%H:%M:%SZ"; EPOCH = datetime(2000, 1, 1, tzinfo=timezone.utc)
LEAK = re.compile(r"trajector|paired-table|-evaluation|run-manifest|water_u|water_v|models_v2|research_runtime", re.I)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


ts = lambda s: datetime.strptime(s, FMT).replace(tzinfo=timezone.utc)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for short in pa.COMMITS + ("ee64354d",):
        check(git("cat-file", "-t", short).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", short, "HEAD").returncode == 0, f"1 ancestry: {short}")
    P = load(PROTO); q = load(D / "step32-preregistration.json")
    for rel, expected in pa.LOCK.items():
        exp = expected or q["sourceBinding"].get(rel); check(exp is not None and sha(ROOT / rel) == exp, f"2 immutability: {rel}")
    for rel, expected in P["frozenInputs"].items():
        check(sha(ROOT / rel) == expected, f"2 frozen input unchanged: {rel}")
    for name in ("step32-temporal-run-manifest.json", "step32-candidate-run-manifest.json"):
        for r in load(D / name)["runs"]:
            if r.get("status") == "COMPLETED":
                check(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"], f"2 STEP 32 trajectory unchanged: {r['runId']}")
    for name in ("__init__.py", "datasets.py", "models.py", "models_v2.py", "wind.py", "cli.py", "cli_v2.py", "registry.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"2 runtime unchanged: {name}")
    for t in TOOLS:
        check(P["tools"].get(t) == sha(ROOT / t), f"2 tool equals protocol lock: {t}")
    L, I, E, C = load(LOCK), load(INV), load(ELIG), load(COH); rep = REPORT.read_text(encoding="utf-8")
    check(L["protocolSha256"] == sha(PROTO) and I["protocolSha256"] == sha(PROTO) and I["periodLockSha256"] == sha(LOCK) and E["protocolSha256"] == sha(PROTO) and E["periodLockSha256"] == sha(LOCK) and E["inventorySha256"] == sha(INV) and C["protocolSha256"] == sha(PROTO) and C["periodLockSha256"] == sha(LOCK) and C["inventorySha256"] == sha(INV), "3 chain bound: protocol -> period lock -> inventory -> eligibility / cohort")
    check(L["lockedAtUTC"] <= I["inventoryStartedAtUTC"] <= I["completedAtUTC"] and L["timezone"] == "UTC" and L["t0"] < L["t1"] and all(k in L for k in ("selectionRationale", "source", "protocolSha256")) and L["source"]["experiment"] == "expt_53.X" and L["chosenBeforeAvailabilityCheck"] is True and L["chosenFromPerformance"] is False, "3 period locked before the inventory; lock record complete")
    reqs = I["requests"]
    check(reqs and all("water_u" not in r["url"] and "water_v" not in r["url"] and "var=" not in r["url"] and r.get("httpStatus") == 200 and (ROOT / r["file"]).exists() and sha(ROOT / r["file"]) == r["sha256"] for r in reqs) and I["velocityDownloaded"] is False and I["forcingDownloaded"] is False, "4 inventory requests are time-axis metadata only; response files SHA-verified")
    present = set()
    for r in reqs:
        if r["file"].endswith(".time.ascii"):
            txt = (ROOT / r["file"]).read_text(encoding="utf-8", errors="replace"); body = txt.split("time[", 2)[-1].split("]", 1)[1]
            present |= {(EPOCH + timedelta(hours=float(x))).strftime(FMT) for x in re.findall(r"-?\d+(?:\.\d+)?", body.split("\n", 2)[1] if "\n" in body else body)}
    years = I["years"]; check(all(v["status"] == "OK" and v["crossCheckIdentical"] for v in years.values()) and I["status"] == "COMPLETE", "4 inventory complete for every year, NCSS and OPeNDAP axes identical")
    d = ts(L["t0"]).replace(hour=0); recomputed = {}
    while d <= ts(L["t1"]):
        frames = [(d + timedelta(hours=3 * k)).strftime(FMT) for k in range(8)]; recomputed[d.strftime("%Y-%m-%d")] = [f for f in frames if f not in present]; d += timedelta(days=1)
    check(all(I["days"][k]["missing"] == v and I["days"][k]["complete"] == (not v) for k, v in recomputed.items()) and set(I["days"]) == set(recomputed) and I["daysComplete"] == sum(1 for v in recomputed.values() if not v), "4 per-day completeness recomputed from the recorded OPeNDAP axes")
    check(all(I["knownGapsConfirmed"].get(t) is True for t in ("2010-08-18T12:00:00Z", "2011-06-09T12:00:00Z", "2011-06-15T00:00:00Z", "2011-06-20T12:00:00Z", "2011-06-22T12:00:00Z", "2011-06-26T18:00:00Z")), "4 known STEP 20 / STEP 33 gaps confirmed absent in the inventory")
    rule = P["cohortRule"]; audit = load(D / "step16-selection-audit.json"); cohort = load(D / "cohort-step16.json"); s20 = load(D / "step20-holdout-derivation.json"); s32 = load(D / "step32-holdout-derivation.json")
    prior_ids = set(); prior_starts = {r: [] for r in rule["regions"]}; cutoff = {}
    for rid in ("KE", "AG"):
        cal = cohort["selectedWindowDetails"][rid]; hold = s20["regions"][rid]["selected"]; x32 = s32["regions"][rid]["selected"]
        prior_ids |= {d for w in cal + hold + x32 for d in w["newDrifterIds"]}; prior_starts[rid] += [w["start"] for w in cal + hold + x32]; cutoff[rid] = max(ts(w["end"]) for w in cal) + timedelta(days=rule["separationDaysAfterCalibration"])
    check(sorted(prior_ids) == sorted(P["exclusion"]["priorDrifterIds"]) and len(prior_ids) == 23 + 13 + 32 and {r: sorted(v) for r, v in prior_starts.items()} == P["exclusion"]["priorWindowStartsByRegion"] and set(s32["expandedHoldoutDrifterIds"]) <= prior_ids, "6 exclusion lists re-derived: 68 prior IDs (23 calibration + 13 STEP 20 holdout + 32 STEP 32), prior starts")
    sep = rule["minimumStartSeparationHours"] * 3600; rows = {(r["region"], r["start"]): r for r in E["windows"]}; n_cand = 0
    for r in audit["rows"]:
        if r["region"] not in rule["regions"] or not r["eligibleWindow"]:
            continue
        e = rows.get((r["region"], r["start"])); check(e is not None, f"5 audit row evaluated: {r['region']} {r['start']}")
        if e is None:
            continue
        t0 = ts(r["start"]); lo = (t0 - timedelta(days=rule["coverageMarginDays"])).replace(hour=0); hi = t0 + timedelta(hours=72) + timedelta(days=rule["coverageMarginDays"]); dd = []; x = lo
        while x <= hi:
            dd.append(x.strftime("%Y-%m-%d")); x += timedelta(days=1)
        exp = {"insidePeriod": ts(L["t0"]) <= t0 and ts(r["end"]) <= ts(L["t1"]), "afterCalibrationCutoff": r["region"] not in cutoff or t0 >= cutoff[r["region"]], "notNearPriorWindow": all(abs((t0 - ts(p)).total_seconds()) >= sep for p in prior_starts[r["region"]]), "frameCoverageComplete": not any(recomputed.get(k, ["?"]) for k in dd)}
        check(e["tests"] == exp and e["windowEligible"] == all(exp.values()) and e["requiredUtcDays"] == dd, f"5 eligibility re-derived: {r['region']} {r['start']}"); n_cand += all(exp.values())
    check(E["windowEligibleTotal"] == n_cand == C["summary"]["eligibleWindowsTotal"], "5 eligible window total")
    sel = C["windows"]; starts = [ts(w["start"]) for w in sel]; last = {}
    check(starts == sorted(starts) and all(w["chronologicalRank"] == i + 1 for i, w in enumerate(sel)) and len(sel) <= rule["targetWindows"], "7 chronological order and rank")
    for w in sel:
        rid = w["region"]; t0 = ts(w["start"])
        check(rid not in last or (t0 - last[rid]).total_seconds() >= sep, f"7 same-region separation: {w['windowId']}"); last[rid] = t0
        check(rows[(rid, w["start"])]["windowEligible"] and not (set(w["drifterIds"]) & prior_ids) and all(w["requiredFrameInventory"].values()) and w["sourceExperiment"] == "expt_53.X" and all(k in w for k in ("windowId", "region", "drifterIds", "start", "end", "source", "requiredFrameInventory", "eligibilityResult", "exclusionResult", "chronologicalRank")), f"6/8 selected window eligible, disjoint, complete, fields present: {w['windowId']}")
    ids = [d for w in sel for d in w["drifterIds"]]; check(len(ids) == len(set(ids)) == C["summary"]["selectedDrifters"] and C["drifterIds"] == ids and C["summary"]["selectedWindows"] == len(sel), "6 selected IDs unique; counts")
    cum = 0; prim = None
    for i, w in enumerate(sel):
        cum += len(w["drifterIds"])
        if prim is None and i + 1 >= rule["minimumWindows"] and cum >= rule["minimumDrifters"]:
            prim = i + 1
    check(C["primaryCohort"]["windows"] == prim and C["summary"]["minimumMet"] == (prim is not None) and C["status"] == ("COHORT_LOCKED" if prim else "COHORT_INSUFFICIENT") and rule["minimumWindows"] == 6 and rule["minimumDrifters"] == 20 and rule["targetWindows"] == 8, "7 primary prefix and minimum 6 / 20 gate")
    check(C["velocityDownloaded"] is False and C["trajectoryComputed"] is False and C["performanceDataRead"] is False and C["modelRun"] is False and C["forbiddenInputAccess"] == 0 == E["forbiddenInputAccess"] == I["forbiddenInputAccess"] and not any(p.suffix == ".nc" or p.name.endswith("trajectories.csv") for p in (ROOT / "data/research/step35").rglob("*")) and not any(D.glob("step35-*run*")) and not any(D.glob("step35-*trajector*")), "9/10 no velocity / forcing / trajectory; forbidden input access 0")
    for t in ("tools/research/inventory_step35_frames.py", "tools/research/derive_step35_cohort.py"):
        body = (ROOT / t).read_text(encoding="utf-8"); body = body.split('"""', 2)[2] if body.startswith('"""') else body
        lits = [m for m in re.findall(r'"([^"\n]*)"', "\n".join(l for l in body.split("\n") if not l.strip().startswith(("FORBIDDEN", "for v in")))) if "/" in m or m.endswith((".json", ".csv"))]
        check(not any(LEAK.search(x) for x in lits) and "guarded_open" in body, f"10 tool opens no performance / velocity file: {t}")
    ST = load(D / "step35-phase-a-protocol-status.json"); check(ST["protocolSha256"] == sha(PROTO) and P["status"] == "PENDING" and ST["status"] == ("PREREGISTRATION_LOCKED" if prim else "PREREGISTRATION_BLOCKED") and all(sha(ROOT / f) == h for f, h in ST["outputs"].items() if not f.endswith("report.md")) and P["noExperiment"] == {"velocityDownload": False, "trajectory": False, "forcingDownload": False, "candidateComparison": False, "calibration": False, "parameterSelection": False, "modelSelection": False, "forcingSelection": False} and P["modelRunCount"] == 0, "protocol status and no-experiment flags")
    check(f"COHORT_LOCK = {'PASS' if prim else 'FAIL'}" in rep and f"SELECTED_WINDOWS = {len(sel)}" in rep and f"SELECTED_DRIFTERS = {len(ids)}" in rep and f"ELIGIBLE_WINDOWS = {n_cand}" in rep and all(w["windowId"] in rep for w in sel), "12 report consistent")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/derive_step35_cohort.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True, env={**__import__('os').environ, "PYTHONIOENCODING": "utf-8"})
        check(proc.returncode in (0, 1) and sha(Path(tmp) / COH.name) == sha(COH) and sha(Path(tmp) / ELIG.name) == sha(ELIG), "11 derivation re-run byte-identical")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "status": ST["status"], "eligibleWindows": n_cand, "selectedWindows": len(sel), "selectedDrifters": len(ids), "primaryPrefix": prim, "forbiddenInputAccess": C["forbiddenInputAccess"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
