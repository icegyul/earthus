"""STEP 47 - execute the LOCKED STEP 46 validation-extension cohort rule over the complete non-primary domain KE + BM + AG.
Authorised inputs and nothing else (guarded open): the STEP 46 protocol, the STEP 45C block manifest, the STEP 45B amendment, the STEP 44
protocol, the frozen STEP 35 eligibility / phase-A protocol, cohort-step16.json, the frozen STEP 15 raw NOAA GDP hourly QC CSVs of regions
KE, BM and AG only, and the Natural Earth coastline. Every record SHA, the observation aggregate SHA (176 files) and the coastline SHA are
verified BEFORE any observation byte is read; on mismatch nothing is read.
The per-region eligible window counts are independently recomputed from the frozen eligibility file and compared with the STEP 46 audit
expectation (KE 26, BM 3, AG 0); a discrepancy stops the derivation. Per-window drifter identities come from the identical frozen STEP 16
function (select_step16_cohort.evaluate, E1-E5 + A1-A3 verbatim) and every evaluated window's recomputed eligible count is asserted against
the frozen audit count. Accumulation is the unchanged STEP 46 rule: one chronological sequence over the domain ordered by (start, region)
with alphabetical region tie-break, same-region selected starts >= 72 h apart, 88 excluded IDs, a window enters only if it contributes >= 1
new eligible ID, first prefix with >= 6 windows AND >= 20 unique drifters, MAX_WINDOWS = 12. No region quota, balancing or discarding.
GS observation content is never read. No velocity, forcing, trajectory, model, performance or bootstrap file is opened or produced.
Writes step47-validation-extension-cohort-manifest.json (`--out DIR` for the independent replay)."""
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
P46, M45C, AM45B, P44 = D / "step46-validation-extension-preregistration-protocol.json", D / "step45c-validation-cohort-manifest.json", D / "step45b-validation-protocol-amendment.json", D / "step44-validation-preregistration-protocol.json"
P35, ELIG35, COHORT = D / "step35-phase-a-protocol.json", D / "step35-window-eligibility.json", D / "cohort-step16.json"
SHAS = {"step46": ("c824b053fdeea20336f1396dc503232492ab77e1f9d5f032586b23c47d66862d", P46),
        "step45c": ("65a9fc5a5efe40f266c94e0db9d93c969f702fde897a9030e1b01fbf264c4856", M45C),
        "step45b": ("88398dc62fb6a18e1fe5d2d8d83feff17a77f2aa4c9d0c9136008c47d38a2e4b", AM45B),
        "step44": ("6a2e2f04f7948e4ff3ac5dec065fc93a6072ce112bb2e072ce77c2606056de9f", P44),
        "step35Eligibility": ("d01d06a3430def6ea77a814bb4379a9b45ca058713fa0901c9c30b035fbb635b", ELIG35)}
OBS_SHA = "22c0ecffc926d04f02ff2ed57be1bd2cc76c1c9048ac2d77a30a63c3bb2c0841"
COAST_SHA = "6f75ae0e0de157b14946e2255eb1f5486d9a13819032e26d4610852d296788f6"
REGIONS = ["AG", "BM", "KE"]          # alphabetical: the frozen (start, region) tie-break order
EXPECTED_COUNTS = {"KE": 26, "BM": 3, "AG": 0}
FIELDS = ["ID", "time", "latitude", "longitude", "gap", "drogue_lost_date", "typebuoy"]
FORBIDDEN = ("hycom", "glorys", "stokes", "aviso", "ww3", "era5", "ncep", "wind", "result", "run-primary", "replay", "evidence", "verdict", "trajector", "paired", "evaluation", "summary", "bootstrap", "step18", "step19", "step20", "step21", "step22", "step23", "step24", "step25", "step26", "step27", "step28", "step29", "step30", "step31", "step32", "step33", "step37", "step38", "step39", "step40", "step41", "step42", "step43", "forcing", "water_u", "water_v", "error", "performance")
access = {"forbiddenInputAccess": 0, "opened": 0, "observationFilesRead": 0, "regionsRead": set()}
ALLOWED = [str(p) for p in (P46, M45C, AM45B, P44, P35, ELIG35, COHORT, s16.RAW, s16.COAST)]


def guarded_open(file, *args, **kwargs):
    name = str(file); lower = name.replace("\\", "/").lower()
    inside_raw = lower.startswith(str(s16.RAW).replace("\\", "/").lower())
    allowed = any(name.startswith(p) for p in ALLOWED)
    if (any(tok in lower for tok in FORBIDDEN) and not inside_raw and not allowed) or not allowed:
        access["forbiddenInputAccess"] += 1
        raise SystemExit(f"FORBIDDEN INPUT ACCESS: {name}")
    if inside_raw:
        base = Path(name).name
        region = base.split("-")[0]
        if region not in REGIONS:
            access["forbiddenInputAccess"] += 1
            raise SystemExit(f"FORBIDDEN REGION OBSERVATION ACCESS: {base}")
        access["regionsRead"].add(region); access["observationFilesRead"] += 1
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
    # ---------- integrity gate (before any observation byte) ----------
    for label, (expected, path) in SHAS.items():
        if s16.sha(path) != expected:
            raise SystemExit(f"VALIDATION_EXTENSION_COHORT_PROVENANCE_BLOCKED: {label}")
    if s16.sha(s16.COAST) != COAST_SHA:
        raise SystemExit("VALIDATION_EXTENSION_COHORT_PROVENANCE_BLOCKED: coastline")
    raw_files = sorted(s16.RAW.glob("*-*-q*.csv"))
    entries = [{"filename": f.name, "sha256": s16.sha(f), "bytes": f.stat().st_size} for f in raw_files]
    obs_sha = hashlib.sha256(canonical(entries)).hexdigest()
    if obs_sha != OBS_SHA:
        raise SystemExit(f"VALIDATION_EXTENSION_COHORT_PROVENANCE_BLOCKED: observation aggregate {obs_sha}")
    p46 = json.loads(P46.read_text(encoding="utf-8")); am = json.loads(AM45B.read_text(encoding="utf-8"))
    if sorted(p46["6_extensionDomain"]["candidateRegionSet"]) != sorted(REGIONS) or am["allowedFields"]["fields"] != FIELDS:
        raise SystemExit("VALIDATION_EXTENSION_COHORT_PROVENANCE_BLOCKED: domain or field scope mismatch")
    TR = p46["10_temporalRule"]; t0_p, t1_p = TR["t0_extension"], TR["t1_extension"]
    G = p46["9_sampleSizeGate"]; min_w, min_d, max_w = G["minimumWindows"], G["minimumUniqueDrifters"], G["maximumWindows"]
    X = p46["5_independentDataRequirement"]["exclusionIdentity"]
    excluded = list(X["excludedDrifterIds"])
    if hashlib.sha256("\n".join(sorted(excluded)).encode()).hexdigest() != X["sha256OfSortedIdList"] or len(excluded) != 88:
        raise SystemExit("VALIDATION_EXTENSION_COHORT_PROVENANCE_BLOCKED: exclusion list identity")
    excluded_set = set(excluded)
    # ---------- candidate windows from frozen metadata; counts independently recomputed ----------
    elig = json.loads(ELIG35.read_text(encoding="utf-8")); cohort = json.loads(COHORT.read_text(encoding="utf-8"))
    counts = {r: sum(1 for w in elig["windows"] if w["region"] == r and w["windowEligible"] and t0_p <= w["start"] <= t1_p) for r in REGIONS}
    if counts != EXPECTED_COUNTS:
        raise SystemExit(f"STOP: recomputed per-region counts {counts} differ from the STEP 46 audit expectation {EXPECTED_COUNTS}")
    candidates = sorted([w for w in elig["windows"] if w["region"] in REGIONS and w["windowEligible"] and t0_p <= w["start"] <= t1_p], key=lambda r: (r["start"], r["region"]))
    # ---------- authorised observation read: only regions that actually have candidate windows ----------
    coast = s16.Coast(s16.COAST)
    needed = sorted({w["region"] for w in candidates})
    tracks, region_files, conflicts = {}, {}, {}
    for r in needed:
        tracks[r], files_r, conflicts[r] = s16.load_region(r)
        region_files[r] = sorted(f.name for f in files_r)
    caches = {r: {} for r in needed}
    selected, ids, log, last_start = [], [], [], {}
    prefix_reached = None
    for w in candidates:
        r = w["region"]; t0 = ts(w["start"])
        if r in last_start and (t0 - last_start[r]) < timedelta(hours=72):
            log.append({"start": w["start"], "region": r, "status": "SKIPPED_OVERLAP", "auditEligibleCount": w["auditEligibleCount"]}); continue
        eligible, _ = s16.evaluate(cohort["regionResults"][r]["box"], tracks[r], int(t0.timestamp()), coast, caches[r])
        if len(eligible) != w["auditEligibleCount"]:
            raise SystemExit(f"STOP: eligibility recomputation differs from the frozen audit at {r} {w['start']}: {len(eligible)} vs {w['auditEligibleCount']}")
        eids = sorted(e["drifterId"] for e in eligible)
        new_ids = sorted(i for i in eids if i not in excluded_set and i not in ids)
        dup_excluded = sorted(i for i in eids if i in excluded_set)
        dup_acc = sorted(i for i in eids if i in ids)
        if not new_ids:
            log.append({"start": w["start"], "region": r, "status": "NO_NEW_IDS", "auditEligibleCount": w["auditEligibleCount"], "eligibleDrifterIds": eids, "excludedDuplicates": dup_excluded, "accumulatedDuplicates": dup_acc}); continue
        ids.extend(new_ids); last_start[r] = t0
        selected.append({"chronologicalRank": len(selected) + 1, "windowId": f"{r}-X{len(selected) + 1}", "region": r, "date": w["date"], "start": w["start"], "end": w["end"],
                         "eligibleCount": len(eligible), "eligibleDrifterIds": eids, "newUniqueDrifterIds": new_ids, "newUniqueCount": len(new_ids),
                         "excludedDuplicateIds": dup_excluded, "accumulatedDuplicateIds": dup_acc, "cumulativeUniqueDrifters": len(ids),
                         "requiredUtcDays": w["requiredUtcDays"], "requiredFrameCount": 8 * len(w["requiredUtcDays"]), "step35WindowEligible": True, "inheritedEligibilityTests": w["tests"],
                         "sourceObservationReference": {"region": r, "datasetSha256": obs_sha, "regionFiles": len(region_files[r])}})
        log.append({"start": w["start"], "region": r, "status": "SELECTED", "auditEligibleCount": w["auditEligibleCount"], "new": len(new_ids), "cumulative": len(ids)})
        if prefix_reached is None and len(selected) >= min_w and len(ids) >= min_d:
            prefix_reached = len(selected); break
        if len(selected) >= max_w:
            break
    primary_ids = p46["1_frozenPrimaryResult"] and json.loads(P44.read_text(encoding="utf-8"))["1_primaryExperimentFrozen"]["primaryDrifterIds"]
    primary_starts = {x["start"] for x in json.loads(P44.read_text(encoding="utf-8"))["1_primaryExperimentFrozen"]["primaryWindows"]}
    independence = {"overlapWithPrimaryDrifterIds": sorted(set(ids) & set(primary_ids)), "overlapWithExcludedIds": sorted(set(ids) & excluded_set),
                    "overlapWithPrimaryWindowStarts": sorted({w["start"] for w in selected} & primary_starts), "allStartsAtOrAfterT0": all(w["start"] >= t0_p for w in selected),
                    "gsObservationContentRead": False, "regionsRead": sorted(access["regionsRead"])}
    invalid = bool(independence["overlapWithPrimaryDrifterIds"] or independence["overlapWithExcludedIds"] or independence["overlapWithPrimaryWindowStarts"] or not independence["allStartsAtOrAfterT0"])
    gate_ok = prefix_reached is not None
    status = "VALIDATION_EXTENSION_COHORT_INVALID" if invalid else ("VALIDATION_EXTENSION_COHORT_LOCKED" if gate_ok else "VALIDATION_EXTENSION_COHORT_BLOCKED")
    core = {"domain": sorted(REGIONS), "period": [t0_p, t1_p], "selected": [{k: w[k] for k in ("windowId", "region", "start", "end", "eligibleDrifterIds", "newUniqueDrifterIds")} for w in selected], "drifterIds": sorted(ids), "prefix": prefix_reached}
    manifest = {"schemaVersion": "1.0", "ruleId": "validation-extension-preregistration-step46", "step": 47, "status": status,
                "classification": "VALIDATION_EXTENSION_COHORT_DERIVATION",
                "authorization": {"step46ProtocolSha256": s16.sha(P46), "step46ProtocolIdentityHash": p46["protocolIdentityHash"], "step45cManifestSha256": s16.sha(M45C), "step45bAmendmentSha256": s16.sha(AM45B), "step44ProtocolSha256": s16.sha(P44), "step35EligibilitySha256": s16.sha(ELIG35), "cohortStep16Sha256": s16.sha(COHORT)},
                "source": {"path": "data/research/step15/noaa-gdp-hourly-qc/", "observationAggregateSha256": obs_sha, "filesInAggregate": len(raw_files), "coastlineSha256": s16.sha(s16.COAST), "coastlineUsed": True,
                           "regionFilesRead": region_files, "regionsRead": sorted(access["regionsRead"]), "duplicateConflictDrifters": conflicts},
                "authorizedFields": FIELDS,
                "temporalScope": {"t0": t0_p, "t1": t1_p, "perWindow": "[start, start + 72 h]", "extraIntervalRead": am["temporalScope"]["marginJustification"],
                                  "regionFileScopeNote": "for each region that has candidate windows the frozen STEP 16 loader reads that region's complete quarterly CSV set, because the duplicate-conflict exclusion is a frozen per-drifter eligibility component determined over the region's full file set exactly as STEP 15/16/35/36/45C did; regions without candidate windows are not read at all",
                                  "temporallyIndependentOfOriginalValidation": False,
                                  "temporalDisclosure": "the extension period coincides with the original STEP 44 validation coverage; the extension is geographically independent of the STEP 36 primary cohort, not temporally independent of the original validation design"},
                "geographicDomain": {"regions": sorted(REGIONS), "allMandatory": True, "excludedRegions": ["GS (primary experiment region)"], "boxes": {r: cohort["regionResults"][r]["box"] for r in REGIONS},
                                     "ranking": False, "subsetting": False, "quotas": False, "balancing": False, "regionDiscardedForSmallContribution": False},
                "regionCounts": {"recomputed": counts, "step46AuditExpectation": EXPECTED_COUNTS, "match": counts == EXPECTED_COUNTS},
                "candidateWindows": [{"region": w["region"], "start": w["start"], "end": w["end"], "date": w["date"], "auditEligibleCount": w["auditEligibleCount"], "windowEligible": True} for w in candidates],
                "candidateWindowCount": len(candidates), "accumulationLog": log, "selectedWindows": selected,
                "cohort": {"windows": len(selected), "windowIds": [w["windowId"] for w in selected], "uniqueDrifters": len(ids), "drifterIds": sorted(ids), "firstPrefixWindowCount": prefix_reached,
                           "isCohort": gate_ok, "label": "VALIDATION EXTENSION COHORT" if gate_ok else "INTERMEDIATE DERIVATION RESULT ONLY - not a cohort"},
                "gate": {"minimumWindows": min_w, "minimumUniqueDrifters": min_d, "maximumWindows": max_w, "satisfied": gate_ok, "validWindowGateEvaluatedHere": False,
                         "validWindowGateNote": "the >= 4 valid-window QC gate is not evaluated in STEP 47 because no trajectory execution occurs here"},
                "exclusionIdentity": {"excludedDrifterIdCount": len(excluded), "sha256OfSortedIdList": X["sha256OfSortedIdList"], "priorWindowStartsByRegion": X["priorWindowStartsByRegion"]},
                "independence": independence,
                "derivationHash": hashlib.sha256(canonical(core)).hexdigest(),
                "sourceAccessAudit": {"observationFilesRead": access["observationFilesRead"], "forbiddenInputAccess": access["forbiddenInputAccess"], "totalOpens": access["opened"],
                                      "observationRecordsRead": int(sum(len(tr["t"]) for reg in tracks.values() for tr in reg.values())),
                                      "driftersLoaded": {r: len(tracks[r]) for r in tracks}},
                "validationPerformanceAccessed": False,
                "noExperiment": {"modelRun": 0, "trajectoryComputed": False, "forcingDownloaded": False, "velocityRead": False, "bootstrapRun": 0, "performanceInspected": False, "endpointCalculated": False, "sourceCompared": False, "parameterTuned": False, "manualSelection": False},
                "createdAtUTC": datetime.now(timezone.utc).strftime(FMT), "automaticCommit": False}
    (out_dir / "step47-validation-extension-cohort-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": status, "domain": sorted(REGIONS), "counts": counts, "candidates": len(candidates),
                      "selected": [(w["windowId"], w["region"], w["date"], w["eligibleCount"], w["newUniqueCount"], w["cumulativeUniqueDrifters"]) for w in selected],
                      "uniqueDrifters": len(ids), "gateSatisfied": gate_ok, "derivationHash": manifest["derivationHash"],
                      "observationFilesRead": access["observationFilesRead"], "regionsRead": sorted(access["regionsRead"]), "forbiddenInputAccess": access["forbiddenInputAccess"]}, ensure_ascii=False))
    return 0 if status == "VALIDATION_EXTENSION_COHORT_LOCKED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
