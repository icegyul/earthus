"""STEP 35 Phase A — deterministic cohort derivation from OBSERVATIONS, CALENDAR and the TIME-AXIS INVENTORY ONLY (no velocity, no
trajectory, no forcing, no performance file; guarded open as in STEP 16/20/32).
Order (locked in step35-phase-a-protocol.json): period lock -> frame inventory -> frame-coverage eligibility -> STEP 16 E1-E5 + A1-A3
verbatim (select_step16_cohort.evaluate; audit eligibleCount re-verified) -> exclusion -> chronological accumulation -> minimum check ->
cohort lock. Regions: the four STEP 16 boxes (KE, GS, BM, AG). Candidate = STEP 16 audit row with eligibleWindow == true whose start lies
in the locked period, at least separationDays after the last STEP 20 calibration window of its region (KE, AG), not within
minimumStartSeparationHours of any prior STEP 20 or STEP 32 window start, and whose every UTC day in [t0 - 1 d, t0 + 72 h + 1 d] is COMPLETE
(all eight frames) in the inventory. Accumulation: one chronological sequence over all regions; a window enters only if it contributes at
least one drifter ID absent from every prior cohort (STEP 20 calibration + holdout, all 32 STEP 32 IDs) and from the accumulated cohort;
selected starts in the same region >= minimumStartSeparationHours apart; stop at targetWindows or exhaustion. PRIMARY COHORT = the shortest
chronological prefix reaching >= minimumWindows and >= minimumDrifters; the full selection (up to targetWindows) is recorded in order. No
balancing, no performance input, no manual choice. Writes docs/research/step35-window-eligibility.json and step35-cohort-manifest.json
(`--out DIR` for the independent re-run)."""
import builtins
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/research"))
import select_step16_cohort as s16  # noqa: E402

builtins.open = s16._open
D = ROOT / "docs/research"
PROTO, LOCK, INV = D / "step35-phase-a-protocol.json", D / "step35-period-lock.json", D / "step35-frame-inventory.json"
AUDIT, COHORT, S20, S32 = D / "step16-selection-audit.json", D / "cohort-step16.json", D / "step20-holdout-derivation.json", D / "step32-holdout-derivation.json"
FORBIDDEN = ("hycom", "glorys", "stokes", "aviso", "ww3", "era5", "ncep", "wind", "result", "run-primary", "replay", "evidence", "verdict", "trajector", "paired", "evaluation", "summary", "matrix", "manifest", "step18", "step19", "step21", "step22", "step23", "step24", "step25", "step26", "step27", "step28", "step29", "step30", "step31", "step33", "step34", "calibration-", "b6-holdout", "forcing", "quality", "water_u", "water_v")
access = {"forbiddenInputAccess": 0, "opened": 0}
ALLOWED = [str(p) for p in (PROTO, LOCK, INV, AUDIT, COHORT, S20, S32, s16.RAW, s16.COAST)]


def guarded_open(file, *args, **kwargs):
    name = str(file); lower = name.replace("\\", "/").lower()
    inside_raw = lower.startswith(str(s16.RAW).replace("\\", "/").lower())
    if (any(tok in lower for tok in FORBIDDEN) and not inside_raw) or not any(name.startswith(p) for p in ALLOWED):
        access["forbiddenInputAccess"] += 1; raise SystemExit(f"FORBIDDEN INPUT ACCESS: {name}")
    access["opened"] += 1; return s16._open(file, *args, **kwargs)


builtins.open = guarded_open
FMT = "%Y-%m-%dT%H:%M:%SZ"
ts = lambda s: datetime.strptime(s, FMT).replace(tzinfo=timezone.utc)
fmt = lambda t: t.strftime(FMT)


def required_days(t0, margin_days):
    lo = (t0 - timedelta(days=margin_days)).replace(hour=0, minute=0, second=0); hi = t0 + timedelta(hours=72) + timedelta(days=margin_days); days = []; d = lo
    while d <= hi:
        days.append(d.strftime("%Y-%m-%d")); d += timedelta(days=1)
    return days


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out_dir = Path(argv[argv.index("--out") + 1]) if "--out" in argv else D
    ALLOWED.append(str(out_dir))
    proto = json.loads(PROTO.read_text(encoding="utf-8")); lock = json.loads(LOCK.read_text(encoding="utf-8")); inv = json.loads(INV.read_text(encoding="utf-8")); rule = proto["cohortRule"]
    if lock["protocolSha256"] != s16.sha(PROTO) or inv["protocolSha256"] != s16.sha(PROTO) or inv["periodLockSha256"] != s16.sha(LOCK) or proto["tools"]["tools/research/derive_step35_cohort.py"] != s16.sha(__file__):
        raise SystemExit("STEP35_BLOCKED_IMMUTABILITY: protocol / period lock / inventory / tool")
    if inv["status"] != "COMPLETE":
        raise SystemExit("STEP35_BLOCKED: frame inventory incomplete")
    for p, key in ((AUDIT, "auditSha256"), (COHORT, "cohortSha256"), (S20, "step20HoldoutDerivationSha256"), (S32, "step32HoldoutDerivationSha256")):
        if s16.sha(p) != proto["inputs"][key]:
            raise SystemExit(f"STEP35_BLOCKED_IMMUTABILITY: {p.name}")
    if s16.sha(s16.COAST) != s16.COAST_SHA_EXPECTED:
        raise SystemExit("STEP35_BLOCKED_IMMUTABILITY: coastline")
    cohort = json.loads(COHORT.read_text(encoding="utf-8")); audit = json.loads(AUDIT.read_text(encoding="utf-8")); s20 = json.loads(S20.read_text(encoding="utf-8")); s32 = json.loads(S32.read_text(encoding="utf-8"))
    if audit["observationSha256"] != s16.OBS_SHA_EXPECTED:
        raise SystemExit("OBSERVATION SHA MISMATCH")
    # ---- exclusion lists re-derived from the locked sources ----
    prior_ids = {r: set() for r in rule["regions"]}; prior_starts = {r: [] for r in rule["regions"]}; cutoff = {}
    for rid in ("KE", "AG"):
        cal = cohort["selectedWindowDetails"][rid]; hold = s20["regions"][rid]["selected"]
        prior_ids[rid] |= {d for w in cal for d in w["newDrifterIds"]} | {d for w in hold for d in w["newDrifterIds"]}
        prior_starts[rid] += [w["start"] for w in cal] + [w["start"] for w in hold]
        cutoff[rid] = max(ts(w["end"]) for w in cal) + timedelta(days=rule["separationDaysAfterCalibration"])
    for rid in ("KE", "AG"):
        for w in s32["regions"][rid]["selected"]:
            prior_ids[rid] |= set(w["newDrifterIds"]); prior_starts[rid].append(w["start"])
    all_prior_ids = set().union(*prior_ids.values())
    if sorted(all_prior_ids) != sorted(proto["exclusion"]["priorDrifterIds"]) or {r: sorted(v) for r, v in prior_starts.items()} != proto["exclusion"]["priorWindowStartsByRegion"]:
        raise SystemExit("EXCLUSION LIST MISMATCH — STOP")
    t0p, t1p = ts(lock["t0"]), ts(lock["t1"]); sep = timedelta(hours=rule["minimumStartSeparationHours"]); coast = s16.Coast(s16.COAST)
    days = inv["days"]; evaluated = []; candidates = []
    for r in audit["rows"]:
        if r["region"] not in rule["regions"] or not r["eligibleWindow"]:
            continue
        t0 = ts(r["start"]); rec = {"region": r["region"], "date": r["date"], "start": r["start"], "end": r["end"], "auditEligibleCount": r["eligibleCount"], "tests": {}}
        rec["tests"]["insidePeriod"] = t0p <= t0 and ts(r["end"]) <= t1p
        rec["tests"]["afterCalibrationCutoff"] = r["region"] not in cutoff or t0 >= cutoff[r["region"]]
        rec["tests"]["notNearPriorWindow"] = all(abs((t0 - ts(p)).total_seconds()) >= sep.total_seconds() for p in prior_starts[r["region"]])
        req = required_days(t0, rule["coverageMarginDays"]); missing = [f for dday in req for f in days.get(dday, {"missing": [f"{dday}T??"]})["missing"]]
        rec["requiredUtcDays"] = req; rec["missingFrames"] = missing; rec["tests"]["frameCoverageComplete"] = not missing
        rec["windowEligible"] = all(rec["tests"].values())
        evaluated.append(rec)
        if rec["windowEligible"]:
            candidates.append(rec)
    candidates.sort(key=lambda r: (r["start"], r["region"]))
    tracks = {}; caches = {}; selected = []; ids = []; last_start = {}; log = []; primary_idx = None
    for r in candidates:
        rid = r["region"]; t0 = ts(r["start"])
        if rid in last_start and (t0 - last_start[rid]) < sep:
            log.append({"start": r["start"], "region": rid, "status": "SKIPPED_OVERLAP"}); r["accumulation"] = "SKIPPED_OVERLAP"; continue
        if rid not in tracks:
            tracks[rid] = s16.load_region(rid); caches[rid] = {}
        box = cohort["regionResults"][rid]["box"]; eligible, counts = s16.evaluate(box, tracks[rid][0], int(t0.timestamp()), coast, caches[rid])
        if len(eligible) != r["auditEligibleCount"]:
            raise SystemExit(f"eligibility recomputation differs from audit at {rid} {r['date']}: {len(eligible)} vs {r['auditEligibleCount']}")
        new = [e for e in eligible if e["drifterId"] not in all_prior_ids and e["drifterId"] not in ids]
        dup_prior = [e["drifterId"] for e in eligible if e["drifterId"] in all_prior_ids]; dup_acc = [e["drifterId"] for e in eligible if e["drifterId"] in ids]
        if not new:
            log.append({"start": r["start"], "region": rid, "status": "NO_NEW_IDS", "priorCohortDuplicates": dup_prior, "accumulatedDuplicates": dup_acc}); r["accumulation"] = "NO_NEW_IDS"; continue
        ids.extend(e["drifterId"] for e in new); last_start[rid] = t0
        la = [e["startLat"] for e in new]; lo = [e["startLon"] for e in new]
        selected.append({"chronologicalRank": len(selected) + 1, "windowId": f"{rid}-Y{len(selected) + 1}", "region": rid, "date": r["date"], "start": r["start"], "end": r["end"], "source": lock["source"]["product"], "sourceExperiment": "expt_53.X", "eligibleCount": len(eligible), "A1_median": None, "A2_median": None, "A3_median": None,
                         "drifterIds": [e["drifterId"] for e in new], "priorCohortDuplicateIds": dup_prior, "accumulatedDuplicateIds": dup_acc, "cumulativeUniqueDrifters": len(ids), "oceanBox": {"south": max(-40.0, min(la) - 2.0), "north": min(40.0, max(la) + 2.0), "west": min(lo) - 2.0, "east": max(lo) + 2.0},
                         "requiredUtcDays": r["requiredUtcDays"], "requiredFrameInventory": {dday: days[dday]["complete"] for dday in r["requiredUtcDays"]}, "requiredFrameCount": 8 * len(r["requiredUtcDays"]), "eligibilityResult": {"step16_E1E5_A1A3": True, "frameCoverage": True, "insidePeriod": True, "afterCalibrationCutoff": True, "notNearPriorWindow": True}, "exclusionResult": {"priorIdsExcluded": len(dup_prior), "newIds": len(new)},
                         "drifters": [{k: e[k] for k in ("drifterId", "typebuoy", "startLon", "startLat", "coastKm", "speedMps", "displacement72hKm", "turnDeg", "drogueLostDate")} for e in new]})
        row = next(x for x in audit["rows"] if x["region"] == rid and x["start"] == r["start"]); selected[-1].update({"A1_median": row["A1_median"], "A2_median": row["A2_median"], "A3_median": row["A3_median"]})
        log.append({"start": r["start"], "region": rid, "status": "SELECTED", "new": len(new)}); r["accumulation"] = "SELECTED"
        if primary_idx is None and len(selected) >= rule["minimumWindows"] and len(ids) >= rule["minimumDrifters"]:
            primary_idx = len(selected)
        if len(selected) >= rule["targetWindows"]:
            break
    for r in candidates:
        r.setdefault("accumulation", "NOT_REACHED (after target)")
    minimum_met = primary_idx is not None
    core = {"selected": [{k: w[k] for k in ("windowId", "region", "start", "end", "drifterIds")} for w in selected], "primaryPrefix": primary_idx}
    elig_doc = {"schemaVersion": "1.0", "ruleId": proto["ruleId"], "protocolSha256": s16.sha(PROTO), "periodLockSha256": s16.sha(LOCK), "inventorySha256": s16.sha(INV), "rule": rule, "regions": rule["regions"], "auditEligibleRowsInRegions": len(evaluated), "windowEligibleTotal": len(candidates),
                "failureCounts": {k: sum(1 for e in evaluated if not e["tests"][k]) for k in ("insidePeriod", "afterCalibrationCutoff", "notNearPriorWindow", "frameCoverageComplete")}, "windows": evaluated, "accumulationLog": log, "forbiddenInputAccess": access["forbiddenInputAccess"]}
    (out_dir / "step35-window-eligibility.json").write_text(json.dumps(elig_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = {"schemaVersion": "1.0", "ruleId": proto["ruleId"], "status": "COHORT_LOCKED" if minimum_met else "COHORT_INSUFFICIENT", "protocolSha256": s16.sha(PROTO), "selectionRuleSha256": hashlib.sha256(s16.canonical(rule)).hexdigest(), "periodLock": {k: lock[k] for k in ("t0", "t1", "timezone", "lockedAtUTC", "selectionRationale")}, "periodLockSha256": s16.sha(LOCK), "inventorySha256": s16.sha(INV),
                "inputs": {"auditSha256": s16.sha(AUDIT), "cohortSha256": s16.sha(COHORT), "step20HoldoutDerivationSha256": s16.sha(S20), "step32HoldoutDerivationSha256": s16.sha(S32), "observationSha256": s16.OBS_SHA_EXPECTED, "coastlineSha256": s16.COAST_SHA_EXPECTED},
                "source": lock["source"], "windows": selected, "primaryCohort": {"windows": primary_idx, "windowIds": [w["windowId"] for w in selected[:primary_idx]] if primary_idx else [], "drifters": selected[primary_idx - 1]["cumulativeUniqueDrifters"] if primary_idx else len(ids), "rule": "shortest chronological prefix reaching >= 6 windows and >= 20 drifters"},
                "summary": {"eligibleWindowsTotal": len(candidates), "auditEligibleRowsInRegions": len(evaluated), "selectedWindows": len(selected), "selectedDrifters": len(ids), "selectedByRegion": {r: sum(1 for w in selected if w["region"] == r) for r in rule["regions"]}, "excludedWindows": len(evaluated) - len(candidates), "exclusionReasons": elig_doc["failureCounts"], "accumulationSkips": {s: sum(1 for l in log if l["status"] == s) for s in ("SKIPPED_OVERLAP", "NO_NEW_IDS")}, "sourceFrameCoverage": {"daysComplete": inv["daysComplete"], "daysIncomplete": inv["daysIncomplete"], "missingFrames": len(inv["missingFrames"])}, "minimumWindows": rule["minimumWindows"], "minimumDrifters": rule["minimumDrifters"], "minimumMet": minimum_met},
                "drifterIds": ids, "derivationHash": hashlib.sha256(s16.canonical(core)).hexdigest(), "forbiddenInputAccess": access["forbiddenInputAccess"], "velocityDownloaded": False, "trajectoryComputed": False, "performanceDataRead": False, "modelRun": False}
    (out_dir / "step35-cohort-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": manifest["status"], "eligible": len(candidates), "selected": [(w["windowId"], w["date"], len(w["drifterIds"])) for w in selected], "drifters": len(ids), "primaryPrefix": primary_idx, "failures": elig_doc["failureCounts"], "derivationHash": manifest["derivationHash"], "forbiddenInputAccess": access["forbiddenInputAccess"]}))
    return 0 if minimum_met else 1


if __name__ == "__main__":
    raise SystemExit(main())
