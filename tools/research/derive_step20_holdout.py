"""STEP 20 Phase A — deterministic holdout-window derivation from OBSERVATIONS ONLY (no model, no forcing, no trajectory).

Rule (fixed before running; copied into docs/research/step20-generalization-protocol.md §5):
  regions KE, AG (STEP 16 boxes); calibration = STEP 18b run units (STEP 16 cohort, 23 drifters);
  cutoff_r = end of the last calibration window in region r + SEPARATION_DAYS;
  candidate days = STEP 16 audit rows with eligibleWindow == true, start >= cutoff_r, window end <= COVERAGE_END (HYCOM expt_53.X);
  chronological accumulation exactly as STEP 16 (>= 72 h between selected starts; new IDs exclude calibration IDs and already
  accumulated IDs; stop at >= 10 unique holdout drifters or 6 windows). Eligibility is re-evaluated with the STEP 15/16 code verbatim
  and must agree with the audit's eligibleCount. Writes docs/research/step20-holdout-derivation.json.
"""
import builtins
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/research"))
import select_step16_cohort as s16  # noqa: E402  (patches builtins.open with the STEP 16 guard on import)

builtins.open = s16._open  # replace with the STEP 20 guard below
AUDIT = ROOT / "docs/research/step16-selection-audit.json"
COHORT = ROOT / "docs/research/cohort-step16.json"
OUT = ROOT / "docs/research/step20-holdout-derivation.json"
COHORT_SHA = "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"
SEPARATION_DAYS = 30
COVERAGE_END = "2015-12-31T23:59:59Z"  # HYCOM GOFS 3.1 expt_53.X reanalysis (STEP 17 forcing protocol §1: 1994–2015)
STOP_AT, MAX_WINDOWS, SEP_H = 10, 6, 72
FORBIDDEN = ("hycom", "glorys", "era5", "ncep", "wind", "result", "run-primary", "replay", "evidence", "verdict", "trajector", "step18", "step19", "manifest")
ALLOWED = tuple(str(p) for p in (AUDIT, COHORT, s16.RAW, s16.COAST, OUT))
access = {"forbiddenInputAccess": 0, "opened": 0}


def guarded_open(file, *args, **kwargs):
    name = str(file); lower = name.replace("\\", "/").lower()
    inside_raw = lower.startswith(str(s16.RAW).replace("\\", "/").lower())
    if (any(tok in lower for tok in FORBIDDEN) and not inside_raw) or not any(name.startswith(p) for p in ALLOWED):
        access["forbiddenInputAccess"] += 1
        raise SystemExit(f"FORBIDDEN INPUT ACCESS: {name}")
    access["opened"] += 1
    return s16._open(file, *args, **kwargs)


builtins.open = guarded_open


def main():
    if s16.sha(COHORT) != COHORT_SHA or s16.sha(s16.COAST) != s16.COAST_SHA_EXPECTED:
        raise SystemExit("IMMUTABILITY MISMATCH — STOP")
    cohort = json.loads(COHORT.read_text(encoding="utf-8"))
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    if audit["observationSha256"] != s16.OBS_SHA_EXPECTED:
        raise SystemExit("AUDIT OBSERVATION SHA MISMATCH — STOP")
    coast = s16.Coast(s16.COAST)
    regions = {}
    for rid in ("KE", "AG"):
        box = cohort["regionResults"][rid]["box"]
        calib_windows = cohort["selectedWindowDetails"][rid]
        calib_ids = sorted({d for w in calib_windows for d in w["newDrifterIds"]})
        last_end = max(datetime.strptime(w["end"], "%Y-%m-%dT%H:%M:%SZ") for w in calib_windows).replace(tzinfo=timezone.utc)
        cutoff = last_end + timedelta(days=SEPARATION_DAYS)
        cov_end = datetime.strptime(COVERAGE_END, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        candidates = [r for r in audit["rows"] if r["region"] == rid and r["eligibleWindow"] and datetime.strptime(r["start"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) >= cutoff
                      and datetime.strptime(r["end"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) <= cov_end]
        tracks, files, conflicts = s16.load_region(rid) if candidates else ({}, [], 0)
        cache, holdout_ids, selected, last_start, log = {}, [], [], None, []
        for r in candidates:
            t0 = int(datetime.strptime(r["start"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp())
            if last_start is not None and t0 - last_start < SEP_H * 3600:
                log.append({"date": r["date"], "status": "SKIPPED_OVERLAP"}); continue
            eligible, counts = s16.evaluate(box, tracks, t0, coast, cache)
            if len(eligible) != r["eligibleCount"]:
                raise SystemExit(f"eligibility recomputation differs from audit at {rid} {r['date']}: {len(eligible)} vs {r['eligibleCount']}")
            new = [e for e in eligible if e["drifterId"] not in calib_ids and e["drifterId"] not in holdout_ids]
            dup_cal = [e["drifterId"] for e in eligible if e["drifterId"] in calib_ids]
            dup_hold = [e["drifterId"] for e in eligible if e["drifterId"] in holdout_ids]
            if not new:
                log.append({"date": r["date"], "status": "NO_NEW_IDS", "calibrationDuplicates": dup_cal, "holdoutDuplicates": dup_hold}); continue
            holdout_ids.extend(e["drifterId"] for e in new); last_start = t0
            selected.append({"order": len(selected) + 1, "windowId": f"{rid}-H{len(selected) + 1}", "date": r["date"], "start": r["start"], "end": r["end"], "eligibleCount": len(eligible),
                             "A1_median": r["A1_median"], "A2_median": r["A2_median"], "A3_median": r["A3_median"], "newDrifterIds": [e["drifterId"] for e in new],
                             "calibrationDuplicateIds": dup_cal, "holdoutDuplicateIds": dup_hold, "cumulativeUniqueDrifters": len(holdout_ids),
                             "drifters": [{k: e[k] for k in ("drifterId", "typebuoy", "startLon", "startLat", "coastKm", "speedMps", "displacement72hKm", "turnDeg", "drogueLostDate")} for e in new]})
            log.append({"date": r["date"], "status": "SELECTED", "new": len(new)})
            if len(holdout_ids) >= STOP_AT or len(selected) >= MAX_WINDOWS:
                break
        status = "HOLDOUT_UNAVAILABLE" if not candidates else ("HOLDOUT_MET" if len(holdout_ids) >= STOP_AT else "HOLDOUT_UNMET")
        regions[rid] = {"box": box, "calibrationWindows": [{"windowId": f"{rid}-{w['order']}", "start": w["start"], "end": w["end"], "drifters": len(w["newDrifterIds"])} for w in calib_windows],
                        "calibrationDrifterIds": calib_ids, "lastCalibrationEnd": last_end.strftime("%Y-%m-%dT%H:%M:%SZ"), "cutoff": cutoff.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "candidateEligibleWindows": len(candidates), "candidateDates": [r["date"] for r in candidates], "selected": selected, "holdoutDrifterIds": holdout_ids,
                        "holdoutUniqueDrifters": len(holdout_ids), "status": status, "log": log, "rawFiles": [f.name for f in files]}
    core = {rid: {"selected": [{k: w[k] for k in ("windowId", "start", "end", "newDrifterIds")} for w in v["selected"]], "status": v["status"]} for rid, v in regions.items()}
    out = {"schemaVersion": "1.0", "ruleId": "model-protocol-step20-generalization-parameter-validation", "purpose": "holdout window derivation (observations only)",
           "rule": {"separationDays": SEPARATION_DAYS, "coverageEnd": COVERAGE_END, "stopWhenUniqueDrifters": STOP_AT, "maximumWindows": MAX_WINDOWS, "minimumStartSeparationHours": SEP_H,
                    "eligibility": "STEP 15/16 E1–E5 + A1–A3 verbatim (select_step16_cohort.evaluate); audit eligibleCount re-verified", "excludes": "calibration (STEP 16 cohort) drifter IDs"},
           "inputs": {"audit": "docs/research/step16-selection-audit.json", "auditSha256": s16.sha(AUDIT), "cohort": "docs/research/cohort-step16.json", "cohortSha256": COHORT_SHA,
                      "observationSha256": s16.OBS_SHA_EXPECTED, "coastlineSha256": s16.COAST_SHA_EXPECTED},
           "regions": regions, "derivationHash": hashlib.sha256(s16.canonical(core)).hexdigest(), "forbiddenInputAccess": access["forbiddenInputAccess"],
           "modelRun": False, "forcingAccessed": False, "trajectoryComputed": False, "createdAtUTC": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({rid: {"status": v["status"], "candidates": v["candidateEligibleWindows"], "cutoff": v["cutoff"], "windows": [(w["windowId"], w["date"], len(w["newDrifterIds"])) for w in v["selected"]], "unique": v["holdoutUniqueDrifters"]} for rid, v in regions.items()}))
    print("derivationHash", out["derivationHash"], "forbiddenInputAccess", access["forbiddenInputAccess"])


if __name__ == "__main__":
    main()
