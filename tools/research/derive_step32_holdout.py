"""STEP 32 Phase A — deterministic EXPANDED INDEPENDENT HOLDOUT derivation from OBSERVATIONS AND CALENDAR ONLY.

Inputs (and nothing else): docs/research/step32-holdout-rule.json (locked parameters + prior-cohort exclusion lists + HYCOM coverage
metadata), docs/research/step16-selection-audit.json, docs/research/cohort-step16.json, docs/research/step20-holdout-derivation.json
(prior cohort IDs / windows, re-verified against the rule), the STEP 15 raw NOAA GDP hourly QC CSVs and the coastline used by STEP 15/16.
open() is guarded exactly as in STEP 16/20: any other path (forcing, trajectories, results, evaluations, tables, summaries) aborts.
No model, no forcing, no trajectory, no metric is read or computed. Eligibility = STEP 15/16 E1-E5 + A1-A3 verbatim via
select_step16_cohort.evaluate; audit eligibleCount re-verified for every evaluated window.
Rule: regions KE, AG; cutoff_r = end of the last STEP 20 calibration window in region r + separationDays; candidate = audit rows with
eligibleWindow, start >= cutoff_r, start - coverageMarginDays >= coverageStart, end + coverageMarginDays <= coverageEnd; a window whose
start date is a previously used window (STEP 20 calibration / holdout) or lies within minimumStartSeparationHours of one is skipped;
a window whose required HYCOM 3-hourly frame list intersects the registered known-missing-frame list is WINDOW_BLOCKED; chronological
accumulation (>= minimumStartSeparationHours between selected starts); new IDs exclude every prior cohort ID (STEP 20 calibration +
STEP 20 holdout incl. KE-H2) and already accumulated IDs; stop at targetWindows selected or candidates exhausted; status HOLDOUT_MET only
if unique drifters >= minimumDrifters and windows >= minimumWindows. Writes docs/research/step32-holdout-derivation.json (or --out DIR)."""
import builtins
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/research"))
import select_step16_cohort as s16  # noqa: E402  (patches builtins.open with the STEP 16 guard on import)

builtins.open = s16._open
D = ROOT / "docs/research"
RULE, AUDIT, COHORT, S20 = D / "step32-holdout-rule.json", D / "step16-selection-audit.json", D / "cohort-step16.json", D / "step20-holdout-derivation.json"
OUT_NAME = "step32-holdout-derivation.json"
FORBIDDEN = ("hycom", "glorys", "stokes", "aviso", "ww3", "era5", "ncep", "wind", "result", "run-primary", "replay", "evidence", "verdict", "trajector", "paired", "evaluation", "summary", "matrix", "manifest", "step18", "step19", "step21", "step22", "step23", "step24", "step25", "step26", "step27", "step28", "step29", "step30", "step31", "calibration-", "b6-holdout")
access = {"forbiddenInputAccess": 0, "opened": 0}
ALLOWED = [str(p) for p in (RULE, AUDIT, COHORT, S20, s16.RAW, s16.COAST)]


def guarded_open(file, *args, **kwargs):
    name = str(file); lower = name.replace("\\", "/").lower()
    inside_raw = lower.startswith(str(s16.RAW).replace("\\", "/").lower())
    if (any(tok in lower for tok in FORBIDDEN) and not inside_raw) or not any(name.startswith(p) for p in ALLOWED):
        access["forbiddenInputAccess"] += 1
        raise SystemExit(f"FORBIDDEN INPUT ACCESS: {name}")
    access["opened"] += 1
    return s16._open(file, *args, **kwargs)


builtins.open = guarded_open
ts = lambda s: datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
fmt = lambda t: t.strftime("%Y-%m-%dT%H:%M:%SZ")


def required_frames(t0, rule):
    """All 3-hourly frames of every UTC day intersecting [t0 - margin, t0 + 72 h + margin] (8 frames per day)."""
    m = timedelta(days=rule["coverageMarginDays"]); lo = (t0 - m).replace(hour=0, minute=0, second=0); hi = (t0 + timedelta(hours=72) + m)
    days = []; d = lo
    while d <= hi:
        days.append(d); d += timedelta(days=1)
    return [fmt(d + timedelta(hours=3 * k)) for d in days for k in range(8)], [d.strftime("%Y-%m-%d") for d in days]


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out_dir = Path(argv[argv.index("--out") + 1]) if "--out" in argv else D
    ALLOWED.append(str(out_dir))
    rule = json.loads(RULE.read_text(encoding="utf-8"))
    if s16.sha(COHORT) != rule["inputs"]["cohortSha256"] or s16.sha(s16.COAST) != s16.COAST_SHA_EXPECTED or s16.sha(AUDIT) != rule["inputs"]["auditSha256"] or s16.sha(S20) != rule["inputs"]["step20HoldoutDerivationSha256"]:
        raise SystemExit("IMMUTABILITY MISMATCH — STOP")
    cohort = json.loads(COHORT.read_text(encoding="utf-8")); audit = json.loads(AUDIT.read_text(encoding="utf-8")); s20 = json.loads(S20.read_text(encoding="utf-8"))
    if audit["observationSha256"] != s16.OBS_SHA_EXPECTED or rule["inputs"]["observationSha256"] != s16.OBS_SHA_EXPECTED:
        raise SystemExit("OBSERVATION SHA MISMATCH — STOP")
    # prior cohorts re-derived from the locked sources and compared with the rule's exclusion lists
    prior_ids = {}; prior_windows = {}
    for rid in ("KE", "AG"):
        cal = cohort["selectedWindowDetails"][rid]; hold = s20["regions"][rid]["selected"]
        prior_ids[rid] = sorted({d for w in cal for d in w["newDrifterIds"]} | {d for w in hold for d in w["newDrifterIds"]})
        prior_windows[rid] = sorted({w["start"] for w in cal} | {w["start"] for w in hold})
        if prior_ids[rid] != sorted(rule["exclusion"][rid]["priorDrifterIds"]) or prior_windows[rid] != sorted(rule["exclusion"][rid]["priorWindowStarts"]):
            raise SystemExit(f"EXCLUSION LIST MISMATCH — STOP ({rid})")
    coast = s16.Coast(s16.COAST); known_missing = set(rule["coverage"]["knownMissingFrames"])
    cov_start, cov_end = ts(rule["coverage"]["coverageStart"]), ts(rule["coverage"]["coverageEnd"]); margin = timedelta(days=rule["coverageMarginDays"])
    sep = timedelta(hours=rule["minimumStartSeparationHours"]); regions = {}
    for rid in ("KE", "AG"):
        box = cohort["regionResults"][rid]["box"]
        cal = cohort["selectedWindowDetails"][rid]
        last_end = max(ts(w["end"]) for w in cal); cutoff = last_end + timedelta(days=rule["separationDays"])
        used_starts = [ts(s) for s in prior_windows[rid]]
        candidates = [r for r in audit["rows"] if r["region"] == rid and r["eligibleWindow"] and ts(r["start"]) >= cutoff and ts(r["start"]) - margin >= cov_start and ts(r["end"]) + margin <= cov_end]
        tracks, files, conflicts = s16.load_region(rid) if candidates else ({}, [], 0)
        cache, ids, selected, last_start, log = {}, [], [], None, []
        for r in candidates:
            t0 = ts(r["start"])
            if any(abs((t0 - u).total_seconds()) < sep.total_seconds() for u in used_starts):
                log.append({"date": r["date"], "status": "SKIPPED_PRIOR_WINDOW"}); continue
            if last_start is not None and (t0 - last_start) < sep:
                log.append({"date": r["date"], "status": "SKIPPED_OVERLAP"}); continue
            frames, days = required_frames(t0, rule)
            missing = sorted(set(frames) & known_missing)
            if missing:
                log.append({"date": r["date"], "status": "WINDOW_BLOCKED_KNOWN_MISSING_FRAME", "frames": missing}); continue
            eligible, counts = s16.evaluate(box, tracks, int(t0.timestamp()), coast, cache)
            if len(eligible) != r["eligibleCount"]:
                raise SystemExit(f"eligibility recomputation differs from audit at {rid} {r['date']}: {len(eligible)} vs {r['eligibleCount']}")
            new = [e for e in eligible if e["drifterId"] not in prior_ids[rid] and e["drifterId"] not in ids]
            dup_prior = [e["drifterId"] for e in eligible if e["drifterId"] in prior_ids[rid]]; dup_new = [e["drifterId"] for e in eligible if e["drifterId"] in ids]
            if not new:
                log.append({"date": r["date"], "status": "NO_NEW_IDS", "priorCohortDuplicates": dup_prior, "expandedHoldoutDuplicates": dup_new}); continue
            ids.extend(e["drifterId"] for e in new); last_start = t0
            la = [e["startLat"] for e in new]; lo = [e["startLon"] for e in new]
            obox = {"south": max(-40.0, min(la) - 2.0), "north": min(40.0, max(la) + 2.0), "west": min(lo) - 2.0, "east": max(lo) + 2.0}
            selected.append({"order": len(selected) + 1, "windowId": f"{rid}-X{len(selected) + 1}", "date": r["date"], "start": r["start"], "end": r["end"], "eligibleCount": len(eligible),
                             "A1_median": r["A1_median"], "A2_median": r["A2_median"], "A3_median": r["A3_median"], "newDrifterIds": [e["drifterId"] for e in new], "priorCohortDuplicateIds": dup_prior,
                             "expandedHoldoutDuplicateIds": dup_new, "cumulativeUniqueDrifters": len(ids), "oceanBox": obox, "requiredUtcDays": days, "requiredFrameCount": len(frames), "requiredFrames": frames,
                             "drifters": [{k: e[k] for k in ("drifterId", "typebuoy", "startLon", "startLat", "coastKm", "speedMps", "displacement72hKm", "turnDeg", "drogueLostDate")} for e in new]})
            log.append({"date": r["date"], "status": "SELECTED", "new": len(new)})
            if len(selected) >= rule["targetWindows"]:
                break
        if not candidates:
            status = f"{rid}_EXPANDED_HOLDOUT_UNAVAILABLE"
        else:
            status = "HOLDOUT_MET" if len(ids) >= rule["minimumDrifters"] and len(selected) >= rule["minimumWindows"] else "HOLDOUT_UNMET"
        regions[rid] = {"box": box, "priorWindowStarts": prior_windows[rid], "priorDrifterIds": prior_ids[rid], "lastCalibrationEnd": fmt(last_end), "cutoff": fmt(cutoff),
                        "candidateEligibleWindows": len(candidates), "candidateDates": [r["date"] for r in candidates], "selected": selected, "expandedHoldoutDrifterIds": ids,
                        "expandedHoldoutUniqueDrifters": len(ids), "windows": len(selected), "status": status, "log": log, "rawFiles": [f.name for f in files], "duplicateConflicts": conflicts}
    core = {rid: {"selected": [{k: w[k] for k in ("windowId", "start", "end", "newDrifterIds")} for w in v["selected"]], "status": v["status"]} for rid, v in regions.items()}
    total_ids = sorted(set(i for v in regions.values() for i in v["expandedHoldoutDrifterIds"])); total_windows = sum(v["windows"] for v in regions.values())
    overall = "HOLDOUT_MET" if len(total_ids) >= rule["minimumDrifters"] and total_windows >= rule["minimumWindows"] else "STEP32_HOLDOUT_INSUFFICIENT"
    out = {"schemaVersion": "1.0", "ruleId": rule["ruleId"], "purpose": "expanded independent holdout derivation (observations and calendar only)", "ruleSha256": s16.sha(RULE),
           "rule": {k: rule[k] for k in ("separationDays", "minimumStartSeparationHours", "coverageMarginDays", "minimumDrifters", "minimumWindows", "targetWindows")} | {"coverage": rule["coverage"], "eligibility": "STEP 15/16 E1-E5 + A1-A3 verbatim (select_step16_cohort.evaluate); audit eligibleCount re-verified"},
           "inputs": {"audit": "docs/research/step16-selection-audit.json", "auditSha256": s16.sha(AUDIT), "cohort": "docs/research/cohort-step16.json", "cohortSha256": s16.sha(COHORT), "step20HoldoutDerivation": "docs/research/step20-holdout-derivation.json", "step20HoldoutDerivationSha256": s16.sha(S20),
                      "observationSha256": s16.OBS_SHA_EXPECTED, "coastlineSha256": s16.COAST_SHA_EXPECTED},
           "regions": regions, "totalUniqueDrifters": len(total_ids), "totalWindows": total_windows, "expandedHoldoutDrifterIds": total_ids, "status": overall,
           "derivationHash": hashlib.sha256(s16.canonical(core)).hexdigest(), "forbiddenInputAccess": access["forbiddenInputAccess"], "modelRun": False, "forcingAccessed": False, "trajectoryComputed": False, "performanceDataRead": False}
    (out_dir / OUT_NAME).write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": overall, "drifters": len(total_ids), "windows": total_windows, "regions": {rid: {"status": v["status"], "candidates": v["candidateEligibleWindows"], "windows": [(w["windowId"], w["date"], len(w["newDrifterIds"])) for w in v["selected"]], "unique": v["expandedHoldoutUniqueDrifters"]} for rid, v in regions.items()}, "derivationHash": out["derivationHash"], "forbiddenInputAccess": access["forbiddenInputAccess"]}))
    return 0 if overall == "HOLDOUT_MET" else 1


if __name__ == "__main__":
    raise SystemExit(main())
