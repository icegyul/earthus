"""STEP 54 - derive the EAC validation cohort under the LOCKED STEP 53 preregistration.
Inputs: the STEP 53 protocol (SHA-verified), the newly acquired STEP 54 EAC observations, the Natural Earth coastline, and the
prior-cohort identity/window records used only for the frozen exclusion and non-overlap rules. The STEP 16 evaluation (E1-E5, A1-A3) is
imported unchanged from select_step16_cohort and applied verbatim to the EAC box; only the region box, the period and the drifter cap come
from STEP 53. Windows are scanned in strict chronological order and REGISTERED when they are eligible, are at least 72 h after the previous
registered start, and contribute at least one identity outside the 113-identity exclusion set; drifters are ordered by numeric identifier
ascending and capped at 12 per window. No ranking of any kind is applied.
This tool computes NO trajectory, endpoint, delta, Theta, bootstrap or performance quantity of any kind.
Writes docs/research/step54-eac-cohort-manifest.json (`--out DIR` for the independent replay)."""
import builtins
import csv
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/research"))
import select_step16_cohort as s16  # noqa: E402

builtins.open = s16._open
D = ROOT / "docs/research"
OBS = ROOT / "data/research/step54/noaa-gdp-hourly-qc"
PROTO_MD, PROTO_JS = D / "step53-validation-preregistration.md", D / "step53-validation-preregistration.json"
PROTO_MD_SHA = "a9b6457ddce51c5bf437f600a9124086b1390d8a5cf0567616e1af03efd1e39a"
PROTO_JS_SHA = "79c601beffd8ee94b303f7ea3317d9416c13e200e09c8adcc1357110ba9e7d46"
COAST_SHA = "6f75ae0e0de157b14946e2255eb1f5486d9a13819032e26d4610852d296788f6"
FMT = "%Y-%m-%dT%H:%M:%SZ"
MIN_ELIGIBLE = 8


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def canonical(v):
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def ts(s):
    return datetime.strptime(s, FMT).replace(tzinfo=timezone.utc)


def load_eac():
    """STEP 15/16 loader semantics verbatim, applied to the STEP 54 EAC quarterly files."""
    files = sorted(OBS.glob("EAC-*-q*.csv"))
    if not files:
        raise SystemExit("STEP54_BLOCKED: no EAC observation files")
    rows, conflicts = {}, set()
    for path in files:
        with open(path, encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                if row["time"] == "UTC" or not row["ID"]:
                    continue
                key = (row["ID"], row["time"])
                value = (row["latitude"], row["longitude"], row["gap"], row["drogue_lost_date"], row["typebuoy"])
                if key in rows and rows[key] != value:
                    conflicts.add(row["ID"])
                rows[key] = value
    per = {}
    for (drifter, time), (lat, lon, gap, lost, kind) in rows.items():
        per.setdefault(drifter, []).append((s16.epoch(time), float(lat), float(lon),
                                            float(gap) if gap not in ("", "NaN") else float("nan"), lost.strip(), kind))
    tracks = {}
    for drifter, samples in per.items():
        samples.sort()
        tracks[drifter] = {"t": np.array([s[0] for s in samples], dtype=np.int64), "lat": np.array([s[1] for s in samples]),
                           "lon": np.array([s[2] for s in samples]), "gap": np.array([s[3] for s in samples]),
                           "lost": samples[0][4], "kind": samples[0][5], "conflict": drifter in conflicts}
    return tracks, files, len(conflicts)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else D
    out.mkdir(parents=True, exist_ok=True)
    if sha(PROTO_MD) != PROTO_MD_SHA or sha(PROTO_JS) != PROTO_JS_SHA:
        raise SystemExit("PROTOCOL_INTEGRITY_FAILURE")
    if sha(s16.COAST) != COAST_SHA:
        raise SystemExit("STEP54_BLOCKED: coastline identity")
    P = load(PROTO_JS)
    box = P["geographic_domain"]["box"]
    t0_p, t1_p = ts(P["temporal_domain"]["t0"]), ts(P["temporal_domain"]["t1"])
    cap = P["maximum_drifters_per_window"]
    target, min_valid, min_ids = P["target_windows"], P["minimum_valid_windows"], P["minimum_unique_drifters"]
    M36 = load(D / "step36-cohort-extension-manifest.json"); M47 = load(D / "step47-validation-extension-cohort-manifest.json")
    P44 = load(D / "step44-validation-preregistration-protocol.json")
    primary_ids = set(M36["drifterIds"]); extension_ids = set(M47["cohort"]["drifterIds"])
    prior88 = set(P44["4_validationCohortRule"]["exclusionIdentity"]["excludedDrifterIds"])
    excluded = primary_ids | extension_ids | prior88
    if hashlib.sha256("\n".join(sorted(excluded)).encode()).hexdigest() != P["overlap_rule"]["excluded_identities_sha256"]:
        raise SystemExit("STEP54_BLOCKED: exclusion identity differs from the STEP 53 lock")
    primary_starts = set(P["overlap_rule"]["primary_window_starts"]); extension_starts = set(P["overlap_rule"]["extension_window_starts"])
    tracks, files, conflicts = load_eac()
    coast = s16.Coast(s16.COAST); cache = {}
    day = t0_p; registered, log, ids, last_start = [], [], [], None
    scanned = 0
    while day <= t1_p:
        scanned += 1
        eligible, counts = s16.evaluate(box, tracks, int(day.timestamp()), coast, cache)
        rec = {"start": day.strftime(FMT), "eligibleCount": len(eligible)}
        if len(eligible) < MIN_ELIGIBLE:
            rec["status"] = "SKIP_ELIGIBLE_LT_8"; log.append(rec); day += timedelta(days=1); continue
        la = [e["speedMps"] for e in eligible]; disp = [e["displacement72hKm"] for e in eligible]; turn = [e["turnDeg"] for e in eligible]
        med = lambda v: sorted(v)[len(v) // 2] if len(v) % 2 else (sorted(v)[len(v) // 2 - 1] + sorted(v)[len(v) // 2]) / 2
        a1, a2, a3 = med(la), med(disp), med(turn)
        rec.update({"A1_median": round(a1, 4), "A2_median": round(a2, 2), "A3_median": round(a3, 1)})
        if not (a1 >= 0.30 and a2 >= 40.0 and a3 <= 90.0):
            rec["status"] = "SKIP_ADVECTION"; log.append(rec); day += timedelta(days=1); continue
        if last_start is not None and (day - last_start) < timedelta(hours=72):
            rec["status"] = "SKIP_SEPARATION"; log.append(rec); day += timedelta(days=1); continue
        elig_ids = sorted(e["drifterId"] for e in eligible)
        new_ids = [i for i in sorted(elig_ids, key=lambda x: (len(x), x)) if i not in excluded and i not in ids]
        if not new_ids:
            rec["status"] = "SKIP_NO_NEW_IDS"; rec["eligibleDrifterIds"] = elig_ids; log.append(rec); day += timedelta(days=1); continue
        selected = sorted(new_ids, key=lambda x: int(x))[:cap]
        ids.extend(selected); last_start = day
        wid = f"EAC-V{len(registered) + 1}"
        chosen = [e for e in eligible if e["drifterId"] in set(selected)]
        registered.append({"windowId": wid, "region": "EAC", "start": day.strftime(FMT), "end": (day + timedelta(hours=72)).strftime(FMT),
                           "date": day.strftime("%Y-%m-%d"), "eligibleCount": len(eligible), "eligibleDrifterIds": elig_ids,
                           "selectedCount": len(selected), "selectedIds": sorted(selected, key=lambda x: int(x)),
                           "newIds": sorted(selected, key=lambda x: int(x)),
                           "overlapWithPrimary": sorted(set(selected) & primary_ids), "overlapWithExtension": sorted(set(selected) & extension_ids),
                           "cumulativeUniqueDrifters": len(ids), "A1_median": rec["A1_median"], "A2_median": rec["A2_median"], "A3_median": rec["A3_median"],
                           "requiredUtcDays": [(day - timedelta(days=1) + timedelta(days=k)).strftime("%Y-%m-%d") for k in range(6)],
                           "requiredFrameCount": 48, "eligibilityStatus": "REGISTERED",
                           "drifters": [{"drifterId": e["drifterId"], "startLon": e["startLon"], "startLat": e["startLat"]} for e in sorted(chosen, key=lambda e: int(e["drifterId"]))]})
        rec.update({"status": "REGISTERED", "windowId": wid, "selected": len(selected), "cumulative": len(ids)})
        log.append(rec)
        print(json.dumps({"window": wid, "start": rec["start"], "eligible": len(eligible), "selected": len(selected), "cumulative": len(ids)}), flush=True)
        if len(registered) >= target and len(ids) >= min_ids:
            break
        day += timedelta(days=1)
    starts = {w["start"] for w in registered}
    overlap = {"newVsPrimaryIds": sorted(set(ids) & primary_ids), "newVsExtensionIds": sorted(set(ids) & extension_ids),
               "newVsPrimaryWindowStarts": sorted(starts & primary_starts), "newVsExtensionWindowStarts": sorted(starts & extension_starts)}
    overlap["pass"] = all(not v for k, v in overlap.items() if k != "pass")
    gate = {"targetWindows": target, "registeredWindows": len(registered), "minimumValidWindows": min_valid,
            "minimumUniqueDrifters": min_ids, "uniqueDrifters": len(ids), "maxDriftersPerWindow": cap,
            "targetReached": len(registered) >= target and len(ids) >= min_ids}
    # STEP 53 fixes 20 unique drifters as a MINIMUM and 6 windows as the target; a cohort below either minimum is blocked,
    # exactly as the earlier validation line treated 14 < 20. Nothing is relaxed to reach a status.
    if gate["targetReached"]:
        status = "COHORT_REGISTERED"
    elif len(ids) < min_ids or len(registered) < min_valid:
        status = "VALIDATION_BLOCKED"
    else:
        status = "TARGET_NOT_REACHED"
    gate["minimumUniqueDriftersMet"] = len(ids) >= min_ids
    gate["minimumWindowsMet"] = len(registered) >= min_valid
    gate["blockReason"] = None if status == "COHORT_REGISTERED" else (
        f"unique drifters {len(ids)} < preregistered minimum {min_ids}" if len(ids) < min_ids else
        (f"registered windows {len(registered)} < minimum {min_valid}" if len(registered) < min_valid else
         f"registered windows {len(registered)} < target {target}"))
    core = {"region": "EAC", "box": box, "period": [P["temporal_domain"]["t0"], P["temporal_domain"]["t1"]],
            "windows": [{k: w[k] for k in ("windowId", "start", "end", "selectedIds")} for w in registered], "drifterIds": sorted(ids, key=lambda x: int(x))}
    man = {"schemaVersion": "1.0", "study_id": P["study_id"], "step": 54, "status": status,
           "selection_rule_version": "step53-preregistration-locked",
           "protocolSha256": {"markdown": sha(PROTO_MD), "json": sha(PROTO_JS)},
           "region": "EAC", "lat_min": box["south"], "lat_max": box["north"], "lon_min": box["west"], "lon_max": box["east"],
           "time_start": P["temporal_domain"]["t0"], "time_end": P["temporal_domain"]["t1"],
           "observationSource": {"files": [f.name for f in files], "fileCount": len(files),
                                 "aggregateSha256": hashlib.sha256(canonical([{"filename": f.name, "sha256": sha(f), "bytes": f.stat().st_size} for f in files])).hexdigest(),
                                 "duplicateConflictDrifters": conflicts, "driftersLoaded": len(tracks)},
           "coastlineSha256": sha(s16.COAST),
           "eligibilityRule": "frozen STEP 16 E1-E5 + A1-A3 applied verbatim (select_step16_cohort.evaluate); minimum eligible count 8",
           "driftersOrdering": "numeric drifter identifier ascending", "maxDriftersPerWindow": cap,
           "exclusion": {"identityCount": len(excluded), "sha256": P["overlap_rule"]["excluded_identities_sha256"],
                         "primary": len(primary_ids), "extension": len(extension_ids), "prior": len(prior88)},
           "candidateWindowsScanned": scanned, "accumulationLog": log,
           "windows": registered, "cohort": {"windows": len(registered), "windowIds": [w["windowId"] for w in registered],
                                             "uniqueDrifters": len(ids), "drifterIds": sorted(ids, key=lambda x: int(x))},
           "gate": gate, "overlapCheck": overlap,
           "derivationHash": hashlib.sha256(canonical(core)).hexdigest(),
           "rankingApplied": False, "performanceInformationUsed": False,
           "noScientificComputation": {"trajectory": 0, "endpoint": 0, "delta": 0, "theta": 0, "bootstrap": 0, "modelRun": 0},
           "createdAtUTC": datetime.now(timezone.utc).strftime(FMT)}
    p = out / "step54-eac-cohort-manifest.json"; p.write_bytes(canonical(man) + b"\n")
    print(json.dumps({"status": status, "scanned": scanned, "registered": len(registered), "uniqueDrifters": len(ids),
                      "overlapPass": overlap["pass"], "derivationHash": man["derivationHash"][:16]}, ensure_ascii=False))
    return 0 if status == "COHORT_REGISTERED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
