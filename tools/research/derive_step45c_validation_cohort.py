"""STEP 45C - execute the LOCKED STEP 44 validation cohort rule under the STEP 45B input-scope amendment.
Authorised inputs and nothing else (guarded open): the STEP 44 protocol, the STEP 45A block record, the STEP 45B amendment, the frozen
STEP 35 window eligibility / phase-A protocol, cohort-step16.json, the frozen STEP 15 raw NOAA GDP hourly QC CSVs of region KE only, and
the Natural Earth coastline. The observation aggregate SHA (176 files), the coastline SHA and every referenced record SHA are verified
BEFORE any observation byte is read; on mismatch nothing is read and the status is VALIDATION_COHORT_PROVENANCE_BLOCKED.
Per-window drifter identities come from the identical frozen STEP 16 function (select_step16_cohort.evaluate, E1-E5 + A1-A3 verbatim) and
every window's recomputed eligible count is asserted against the frozen audit count. Accumulation is the unchanged STEP 44 rule: region KE
(rank 1 from frozen metadata, never re-ranked here), chronological order, >= 72 h start separation, 88 excluded IDs, a window enters only if
it contributes >= 1 new eligible ID, first prefix with >= 6 windows AND >= 20 unique drifters, MAX_WINDOWS = 12.
No velocity, forcing, trajectory, model, performance or bootstrap file is opened or produced. Writes step45c-validation-cohort-manifest.json
(`--out DIR` for the independent replay). No STEP 15/35/36/44/45A/45B file is ever written."""
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
P44, R45A, AM45B = D / "step44-validation-preregistration-protocol.json", D / "step45a-validation-input-recovery.json", D / "step45b-validation-protocol-amendment.json"
P35, ELIG35, COHORT = D / "step35-phase-a-protocol.json", D / "step35-window-eligibility.json", D / "cohort-step16.json"
P44_SHA = "6a2e2f04f7948e4ff3ac5dec065fc93a6072ce112bb2e072ce77c2606056de9f"
R45A_SHA = "d186cf424eb691d2e7b0d0f12ae2967c027c3e75d07956a5197a840cc3fc781f"
AM45B_SHA = "88398dc62fb6a18e1fe5d2d8d83feff17a77f2aa4c9d0c9136008c47d38a2e4b"
ELIG35_SHA = "d01d06a3430def6ea77a814bb4379a9b45ca058713fa0901c9c30b035fbb635b"
OBS_SHA = "22c0ecffc926d04f02ff2ed57be1bd2cc76c1c9048ac2d77a30a63c3bb2c0841"
COAST_SHA = "6f75ae0e0de157b14946e2255eb1f5486d9a13819032e26d4610852d296788f6"
REGION = "KE"
FIELDS = ["ID", "time", "latitude", "longitude", "gap", "drogue_lost_date", "typebuoy"]
FORBIDDEN = ("hycom", "glorys", "stokes", "aviso", "ww3", "era5", "ncep", "wind", "result", "run-primary", "replay", "evidence", "verdict", "trajector", "paired", "evaluation", "summary", "bootstrap", "step18", "step19", "step20", "step21", "step22", "step23", "step24", "step25", "step26", "step27", "step28", "step29", "step30", "step31", "step32", "step33", "step37", "step38", "step39", "step40", "step41", "step42", "step43", "forcing", "water_u", "water_v", "error", "performance")
access = {"forbiddenInputAccess": 0, "opened": 0, "observationFilesRead": 0}
ALLOWED = [str(p) for p in (P44, R45A, AM45B, P35, ELIG35, COHORT, s16.RAW, s16.COAST)]


def guarded_open(file, *args, **kwargs):
    name = str(file); lower = name.replace("\\", "/").lower()
    inside_raw = lower.startswith(str(s16.RAW).replace("\\", "/").lower())
    allowed = any(name.startswith(p) for p in ALLOWED)
    if (any(tok in lower for tok in FORBIDDEN) and not inside_raw and not allowed) or not allowed:
        access["forbiddenInputAccess"] += 1
        raise SystemExit(f"FORBIDDEN INPUT ACCESS: {name}")
    if inside_raw:
        access["observationFilesRead"] += 1
    access["opened"] += 1
    return s16._open(file, *args, **kwargs)


builtins.open = guarded_open
FMT = "%Y-%m-%dT%H:%M:%SZ"
ts = lambda s: datetime.strptime(s, FMT).replace(tzinfo=timezone.utc)


def canonical(v):
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out_dir = Path(argv[argv.index("--out") + 1]) if "--out" in argv else D
    out_dir.mkdir(parents=True, exist_ok=True)
    ALLOWED.append(str(out_dir))
    # ---------- source integrity gate (before any observation byte) ----------
    for path, expected, label in ((P44, P44_SHA, "STEP 44 protocol"), (R45A, R45A_SHA, "STEP 45A record"), (AM45B, AM45B_SHA, "STEP 45B amendment"), (ELIG35, ELIG35_SHA, "STEP 35 eligibility")):
        if s16.sha(path) != expected:
            raise SystemExit(f"VALIDATION_COHORT_PROVENANCE_BLOCKED: {label}")
    if s16.sha(s16.COAST) != COAST_SHA:
        raise SystemExit("VALIDATION_COHORT_PROVENANCE_BLOCKED: coastline")
    raw_files = sorted(s16.RAW.glob("*-*-q*.csv"))
    entries = [{"filename": f.name, "sha256": s16.sha(f), "bytes": f.stat().st_size} for f in raw_files]
    obs_sha = hashlib.sha256(canonical(entries)).hexdigest()
    if obs_sha != OBS_SHA:
        raise SystemExit(f"VALIDATION_COHORT_PROVENANCE_BLOCKED: observation aggregate {obs_sha}")
    am = json.loads(AM45B.read_text(encoding="utf-8"))
    if am["authorizedSource"]["frozenSourceIdentity"] != obs_sha or am["allowedFields"]["fields"] != FIELDS or am["geographicScope"]["region"] != REGION:
        raise SystemExit("VALIDATION_COHORT_PROVENANCE_BLOCKED: amendment scope mismatch")
    # ---------- frozen rule parameters (never recomputed here) ----------
    p44 = json.loads(P44.read_text(encoding="utf-8")); R = p44["4_validationCohortRule"]
    t0_period, t1_period = R["calendarPeriod"]["t0"], R["calendarPeriod"]["t1"]
    excluded = list(R["exclusionIdentity"]["excludedDrifterIds"])
    if hashlib.sha256("\n".join(sorted(excluded)).encode()).hexdigest() != R["exclusionIdentity"]["sha256OfSortedIdList"] or len(excluded) != 88:
        raise SystemExit("VALIDATION_COHORT_PROVENANCE_BLOCKED: exclusion list identity")
    excluded_set = set(excluded)
    min_w, min_d, max_w = R["minimumWindows"], R["minimumUniqueDrifters"], R["maximumWindows"]
    sep = timedelta(hours=72)
    elig = json.loads(ELIG35.read_text(encoding="utf-8")); cohort = json.loads(COHORT.read_text(encoding="utf-8"))
    # region ranking is inherited from STEP 44 metadata, recomputed from the same frozen file, never from observations
    counts = {r: sum(1 for w in elig["windows"] if w["region"] == r and w["windowEligible"] and t0_period <= w["start"] <= t1_period) for r in R["regionRule"]["candidates"]}
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    if ranked[0][0] != REGION:
        raise SystemExit(f"VALIDATION_COHORT_BLOCKED: region rank 1 is {ranked[0][0]}, not {REGION}")
    candidates = sorted([w for w in elig["windows"] if w["region"] == REGION and w["windowEligible"] and t0_period <= w["start"] <= t1_period], key=lambda r: (r["start"], r["region"]))
    # ---------- authorised observation read: region KE only ----------
    coast = s16.Coast(s16.COAST)
    tracks, ke_files, conflicts = s16.load_region(REGION)
    cache = {}
    selected, ids, log, last_start = [], [], [], None
    prefix_reached = None
    for r in candidates:
        t0 = ts(r["start"])
        if last_start is not None and (t0 - last_start) < sep:
            log.append({"start": r["start"], "status": "SKIPPED_OVERLAP", "auditEligibleCount": r["auditEligibleCount"]}); continue
        eligible, ecounts = s16.evaluate(cohort["regionResults"][REGION]["box"], tracks, int(t0.timestamp()), coast, cache)
        if len(eligible) != r["auditEligibleCount"]:
            raise SystemExit(f"VALIDATION_COHORT_BLOCKED: eligibility recomputation differs from the frozen audit at {r['start']}: {len(eligible)} vs {r['auditEligibleCount']}")
        elig_ids = sorted(e["drifterId"] for e in eligible)
        new_ids = sorted(i for i in elig_ids if i not in excluded_set and i not in ids)
        dup_excluded = sorted(i for i in elig_ids if i in excluded_set)
        dup_acc = sorted(i for i in elig_ids if i in ids)
        if not new_ids:
            log.append({"start": r["start"], "status": "NO_NEW_IDS", "auditEligibleCount": r["auditEligibleCount"], "eligibleDrifterIds": elig_ids, "excludedDuplicates": dup_excluded, "accumulatedDuplicates": dup_acc}); continue
        ids.extend(new_ids); last_start = t0
        selected.append({"chronologicalRank": len(selected) + 1, "windowId": f"{REGION}-V{len(selected) + 1}", "region": REGION, "date": r["date"], "start": r["start"], "end": r["end"],
                         "eligibleCount": len(eligible), "eligibleDrifterIds": elig_ids, "newUniqueDrifterIds": new_ids, "newUniqueCount": len(new_ids),
                         "excludedDuplicateIds": dup_excluded, "accumulatedDuplicateIds": dup_acc, "cumulativeUniqueDrifters": len(ids),
                         "requiredUtcDays": r["requiredUtcDays"], "requiredFrameCount": 8 * len(r["requiredUtcDays"]), "step35WindowEligible": True, "inheritedEligibilityTests": r["tests"],
                         "sourceObservationReference": {"region": REGION, "datasetSha256": obs_sha, "files": len(ke_files)}})
        log.append({"start": r["start"], "status": "SELECTED", "auditEligibleCount": r["auditEligibleCount"], "new": len(new_ids), "cumulative": len(ids)})
        if prefix_reached is None and len(selected) >= min_w and len(ids) >= min_d:
            prefix_reached = len(selected); break
        if len(selected) >= max_w:
            break
    status = "VALIDATION_COHORT_LOCKED" if prefix_reached else "VALIDATION_COHORT_BLOCKED"
    core = {"region": REGION, "period": [t0_period, t1_period], "selected": [{k: w[k] for k in ("windowId", "start", "end", "eligibleDrifterIds", "newUniqueDrifterIds")} for w in selected], "drifterIds": sorted(ids), "prefix": prefix_reached}
    manifest = {"schemaVersion": "1.0", "ruleId": "validation-preregistration-step44", "step": "45C", "status": status,
                "authorization": {"step45bAmendmentSha256": s16.sha(AM45B), "amendmentId": am["amendmentId"], "amendmentIdentityHash": am["amendmentIdentityHash"], "step44ProtocolSha256": s16.sha(P44), "step45aRecordSha256": s16.sha(R45A), "step35EligibilitySha256": s16.sha(ELIG35), "cohortStep16Sha256": s16.sha(COHORT)},
                "source": {"path": "data/research/step15/noaa-gdp-hourly-qc/", "observationAggregateSha256": obs_sha, "filesInAggregate": len(raw_files), "coastlineSha256": s16.sha(s16.COAST), "coastlineUsed": True,
                           "regionFilesRead": sorted(f.name for f in ke_files), "regionFileCount": len(ke_files), "duplicateConflictDrifters": conflicts},
                "authorizedFields": FIELDS, "temporalScope": {"t0": t0_period, "t1": t1_period, "perWindow": "[start, start + 72 h]", "extraIntervalRead": am["temporalScope"]["marginJustification"],
                    "regionFileScopeNote": "the frozen STEP 16 loader reads region KE's complete quarterly CSV set because the duplicate-conflict exclusion (a frozen per-drifter eligibility component) is determined over the region's full file set exactly as STEP 15/16/35/36 did; no other region is read"},
                "geographicScope": {"region": REGION, "box": cohort["regionResults"][REGION]["box"], "otherRegionsRead": []},
                "regionRanking": {"counts": counts, "ranked": [list(x) for x in ranked], "selectedRegion": REGION, "source": "frozen STEP 35 eligibility metadata (not observations)"},
                "candidateWindowsExamined": len(candidates), "accumulationLog": log, "selectedWindows": selected,
                "cohort": {"windows": len(selected), "windowIds": [w["windowId"] for w in selected], "uniqueDrifters": len(ids), "drifterIds": sorted(ids), "firstPrefixWindowCount": prefix_reached},
                "gate": {"minimumWindows": min_w, "minimumUniqueDrifters": min_d, "maximumWindows": max_w, "satisfied": bool(prefix_reached)},
                "exclusionIdentity": {"excludedDrifterIdCount": len(excluded), "sha256OfSortedIdList": R["exclusionIdentity"]["sha256OfSortedIdList"], "priorWindowStartsByRegion": R["exclusionIdentity"]["priorWindowStartsByRegion"]},
                "independence": {"overlapWithPrimaryDrifterIds": sorted(set(ids) & set(p44["1_primaryExperimentFrozen"]["primaryDrifterIds"])), "overlapWithExcludedIds": sorted(set(ids) & excluded_set),
                                 "allStartsAfterT0": all(w["start"] >= t0_period for w in selected), "overlapWithPrimaryWindowStarts": sorted({w["start"] for w in selected} & {x["start"] for x in p44["1_primaryExperimentFrozen"]["primaryWindows"]})},
                "derivationHash": hashlib.sha256(canonical(core)).hexdigest(),
                "sourceAccessAudit": {"observationFilesRead": access["observationFilesRead"], "forbiddenInputAccess": access["forbiddenInputAccess"], "totalOpens": access["opened"], "observationRecordsRead": int(sum(len(tr["t"]) for tr in tracks.values())), "driftersLoaded": len(tracks)},
                "noExperiment": {"modelRun": 0, "trajectoryComputed": False, "forcingDownloaded": False, "velocityRead": False, "bootstrapRun": 0, "performanceInspected": False, "errorCalculated": False, "sourceSelected": False, "parameterTuned": False, "manualSelection": False},
                "createdAtUTC": datetime.now(timezone.utc).strftime(FMT), "automaticCommit": False}
    (out_dir / "step45c-validation-cohort-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": status, "region": REGION, "candidates": len(candidates), "selected": [(w["windowId"], w["date"], w["eligibleCount"], w["newUniqueCount"], w["cumulativeUniqueDrifters"]) for w in selected],
                      "uniqueDrifters": len(ids), "derivationHash": manifest["derivationHash"], "observationFilesRead": access["observationFilesRead"], "forbiddenInputAccess": access["forbiddenInputAccess"]}, ensure_ascii=False))
    return 0 if status == "VALIDATION_COHORT_LOCKED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
