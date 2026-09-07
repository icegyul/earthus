"""STEP 36 — cohort extension under the NEW preregistered accumulation rule (docs/research/step36-cohort-extension-protocol.json):
the STEP 35 target of 8 windows is no longer a stopping condition; the PRIMARY COHORT is the first chronological prefix with
selected_windows >= 6 AND unique_drifters >= 20; MAX_WINDOWS = 12 (COHORT_INSUFFICIENT if not reached within 12 selected windows).
Inherited verbatim from STEP 35 and never recomputed: period lock, frame inventory, window eligibility (step35-window-eligibility.json,
178 window-eligible rows), chronological order (start, region), same-region separation >= 72 h, exclusion lists (68 prior IDs; STEP 20
and STEP 32 window starts). Per-window drifter identities come from the identical STEP 16 function on the STEP 15 observations
(select_step16_cohort.evaluate; audit eligibleCount re-verified) - observation data only. The first eight selected windows must reproduce
the STEP 35 cohort exactly. No velocity, forcing, trajectory, performance or evaluation file is opened (guarded open). Writes
docs/research/step36-cohort-extension-manifest.json (`--out DIR` for the independent re-run). STEP 35 files are never written."""
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
PROTO, P35, ELIG35, COH35, COHORT = D / "step36-cohort-extension-protocol.json", D / "step35-phase-a-protocol.json", D / "step35-window-eligibility.json", D / "step35-cohort-manifest.json", D / "cohort-step16.json"
FORBIDDEN = ("hycom", "glorys", "stokes", "aviso", "ww3", "era5", "ncep", "wind", "result", "run-primary", "replay", "evidence", "verdict", "trajector", "paired", "evaluation", "summary", "matrix", "manifest", "step18", "step19", "step21", "step22", "step23", "step24", "step25", "step26", "step27", "step28", "step29", "step30", "step31", "step32", "step33", "step34", "calibration-", "b6-holdout", "forcing", "quality", "water_u", "water_v", "inventory", "period-lock", "distance", "error")
access = {"forbiddenInputAccess": 0, "opened": 0}
ALLOWED = [str(p) for p in (PROTO, P35, ELIG35, COH35, COHORT, s16.RAW, s16.COAST)]


def guarded_open(file, *args, **kwargs):
    name = str(file); lower = name.replace("\\", "/").lower()
    inside_raw = lower.startswith(str(s16.RAW).replace("\\", "/").lower())
    allowed = any(name.startswith(p) for p in ALLOWED)
    if (any(tok in lower for tok in FORBIDDEN) and not inside_raw and not allowed) or not allowed:
        access["forbiddenInputAccess"] += 1; raise SystemExit(f"FORBIDDEN INPUT ACCESS: {name}")
    access["opened"] += 1; return s16._open(file, *args, **kwargs)


builtins.open = guarded_open
FMT = "%Y-%m-%dT%H:%M:%SZ"
ts = lambda s: datetime.strptime(s, FMT).replace(tzinfo=timezone.utc)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out_dir = Path(argv[argv.index("--out") + 1]) if "--out" in argv else D
    ALLOWED.append(str(out_dir))
    proto = json.loads(PROTO.read_text(encoding="utf-8")); rule = proto["accumulationRule"]
    if proto["tools"]["tools/research/derive_step36_cohort_extension.py"] != s16.sha(__file__):
        raise SystemExit("STEP36_BLOCKED_IMMUTABILITY: tool")
    for p, key in ((P35, "step35ProtocolSha256"), (ELIG35, "step35EligibilitySha256"), (COH35, "step35CohortManifestSha256"), (COHORT, "cohortStep16Sha256")):
        if s16.sha(p) != proto["inherited"][key]:
            raise SystemExit(f"STEP36_BLOCKED_IMMUTABILITY: {p.name}")
    if s16.sha(s16.COAST) != s16.COAST_SHA_EXPECTED:
        raise SystemExit("STEP36_BLOCKED_IMMUTABILITY: coastline")
    p35 = json.loads(P35.read_text(encoding="utf-8")); elig = json.loads(ELIG35.read_text(encoding="utf-8")); c35 = json.loads(COH35.read_text(encoding="utf-8")); cohort = json.loads(COHORT.read_text(encoding="utf-8"))
    prior_ids = set(p35["exclusion"]["priorDrifterIds"]); r35 = p35["cohortRule"]
    if sorted(prior_ids) != sorted(proto["exclusion"]["priorDrifterIds"]) or p35["exclusion"]["priorWindowStartsByRegion"] != proto["exclusion"]["priorWindowStartsByRegion"]:
        raise SystemExit("EXCLUSION LIST MISMATCH — STOP")
    candidates = sorted([w for w in elig["windows"] if w["windowEligible"]], key=lambda r: (r["start"], r["region"]))
    if len(candidates) != elig["windowEligibleTotal"]:
        raise SystemExit("ELIGIBLE COUNT MISMATCH — STOP")
    sep = timedelta(hours=r35["minimumStartSeparationHours"]); coast = s16.Coast(s16.COAST)
    tracks = {}; caches = {}; selected = []; ids = []; last_start = {}; log = []; primary_idx = None; visited = 0
    for r in candidates:
        rid = r["region"]; t0 = ts(r["start"])
        if rid in last_start and (t0 - last_start[rid]) < sep:
            log.append({"start": r["start"], "region": rid, "status": "SKIPPED_OVERLAP"}); continue
        if rid not in tracks:
            tracks[rid] = s16.load_region(rid); caches[rid] = {}
        box = cohort["regionResults"][rid]["box"]; eligible, counts = s16.evaluate(box, tracks[rid][0], int(t0.timestamp()), coast, caches[rid])
        if len(eligible) != r["auditEligibleCount"]:
            raise SystemExit(f"eligibility recomputation differs from audit at {rid} {r['start']}: {len(eligible)} vs {r['auditEligibleCount']}")
        new = [e for e in eligible if e["drifterId"] not in prior_ids and e["drifterId"] not in ids]
        dup_prior = [e["drifterId"] for e in eligible if e["drifterId"] in prior_ids]; dup_acc = [e["drifterId"] for e in eligible if e["drifterId"] in ids]
        if not new:
            log.append({"start": r["start"], "region": rid, "status": "NO_NEW_IDS", "priorCohortDuplicates": dup_prior, "accumulatedDuplicates": dup_acc}); continue
        ids.extend(e["drifterId"] for e in new); last_start[rid] = t0; visited += 1
        la = [e["startLat"] for e in new]; lo = [e["startLon"] for e in new]
        selected.append({"chronologicalRank": len(selected) + 1, "windowId": f"{rid}-Y{len(selected) + 1}", "region": rid, "date": r["date"], "start": r["start"], "end": r["end"], "source": "HYCOM GOFS 3.1 GLBv0.08 expt_53.X reanalysis", "sourceExperiment": "expt_53.X", "eligibleCount": len(eligible), "A1_median": None, "A2_median": None, "A3_median": None,
                         "drifterIds": [e["drifterId"] for e in new], "priorCohortDuplicateIds": dup_prior, "accumulatedDuplicateIds": dup_acc, "cumulativeUniqueDrifters": len(ids), "oceanBox": {"south": max(-40.0, min(la) - 2.0), "north": min(40.0, max(la) + 2.0), "west": min(lo) - 2.0, "east": max(lo) + 2.0},
                         "requiredUtcDays": r["requiredUtcDays"], "requiredFrameCount": 8 * len(r["requiredUtcDays"]), "step35WindowEligible": True, "inheritedEligibilityTests": r["tests"], "exclusionResult": {"priorIdsExcluded": len(dup_prior), "newIds": len(new)},
                         "drifters": [{k: e[k] for k in ("drifterId", "typebuoy", "startLon", "startLat", "coastKm", "speedMps", "displacement72hKm", "turnDeg", "drogueLostDate")} for e in new]})
        log.append({"start": r["start"], "region": rid, "status": "SELECTED", "new": len(new)})
        if primary_idx is None and len(selected) >= rule["minimumWindows"] and len(ids) >= rule["minimumDrifters"]:
            primary_idx = len(selected); break
        if len(selected) >= rule["maxWindows"]:
            break
    # consistency with STEP 35: the first eight selected windows must be identical
    first8 = [(w["region"], w["start"], w["drifterIds"]) for w in selected[:8]]; s35 = [(w["region"], w["start"], w["drifterIds"]) for w in c35["windows"]]
    consistent = first8 == s35[:len(first8)]
    found = primary_idx is not None and primary_idx <= rule["maxWindows"]
    core = {"selected": [{k: w[k] for k in ("windowId", "region", "start", "end", "drifterIds")} for w in selected], "primaryPrefix": primary_idx}
    manifest = {"schemaVersion": "1.0", "ruleId": proto["ruleId"], "status": "COHORT_LOCKED" if found and consistent else "COHORT_INSUFFICIENT", "protocolSha256": s16.sha(PROTO), "accumulationRule": rule, "accumulationRuleSha256": hashlib.sha256(s16.canonical(rule)).hexdigest(), "inherited": proto["inherited"],
                "periodLock": c35["periodLock"], "chronologicalOrder": "identical to STEP 35: (start, region); same-region starts >= 72 h apart", "candidatesInherited": len(candidates), "windows": selected, "step35FirstEightReproduced": consistent, "primaryCohort": {"found": found, "windows": primary_idx, "windowIds": [w["windowId"] for w in selected[:primary_idx]] if found else [], "drifters": len(ids) if found else None, "rule": "first chronological prefix with >= 6 windows AND >= 20 unique drifters; <= 12 windows"},
                "summary": {"selectedWindows": len(selected), "selectedDrifters": len(ids), "selectedByRegion": {r: sum(1 for w in selected if w["region"] == r) for r in r35["regions"]}, "accumulationSkips": {s: sum(1 for l in log if l["status"] == s) for s in ("SKIPPED_OVERLAP", "NO_NEW_IDS")}, "minimumWindows": rule["minimumWindows"], "minimumDrifters": rule["minimumDrifters"], "maxWindows": rule["maxWindows"], "minimumMet": found},
                "accumulationLog": log, "drifterIds": ids, "derivationHash": hashlib.sha256(s16.canonical(core)).hexdigest(), "forbiddenInputAccess": access["forbiddenInputAccess"], "velocityDownloaded": False, "forcingDownloaded": False, "trajectoryComputed": False, "performanceDataRead": False, "modelRun": False, "newEligibilityComputed": False, "newInventory": False}
    (out_dir / "step36-cohort-extension-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": manifest["status"], "selected": [(w["windowId"], w["date"], len(w["drifterIds"]), w["cumulativeUniqueDrifters"]) for w in selected], "drifters": len(ids), "primaryPrefix": primary_idx, "step35FirstEightReproduced": consistent, "derivationHash": manifest["derivationHash"], "forbiddenInputAccess": access["forbiddenInputAccess"]}))
    return 0 if manifest["status"] == "COHORT_LOCKED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
