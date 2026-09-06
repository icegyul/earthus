"""STEP 16 Phase B — chronological-accumulation cohort selection under the LOCKED STEP 16 rule.

Inputs allowed (and nothing else): the LOCKED rule document + preregistration JSON, the STEP 15 raw
NOAA GDP hourly QC CSVs (same bytes; aggregate SHA re-verified), the Natural Earth 1:10m coastline.
The window evaluation (E1–E5, A1–A3) is the STEP 15 logic verbatim; only the selection stage differs.
open() is guarded: any other path → forbiddenInputAccess += 1 and immediate failure.
"""
import builtins
import csv
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
RULE_MD = ROOT / "docs/research/step16-cohort-selection-rule.md"
PREREG = ROOT / "docs/research/step16-preregistration.json"
RULE_SHA_EXPECTED = "e9e2c1ca2e2148ff763becebf8a56119a3551c965efe32df7ea49fdb84ea0948"
PREREG_SHA_EXPECTED = "5bae117d42742c23e9c13817c60341ea153c641505d595f95873634b559d33b3"
RAW = ROOT / "data/research/step15/noaa-gdp-hourly-qc"
OBS_SHA_EXPECTED = "22c0ecffc926d04f02ff2ed57be1bd2cc76c1c9048ac2d77a30a63c3bb2c0841"
COAST = ROOT / "docs/research/fixtures/gdp-cohort-step12/ne_10m_coastline.geojson"
COAST_SHA_EXPECTED = "6f75ae0e0de157b14946e2255eb1f5486d9a13819032e26d4610852d296788f6"
OUT = ROOT / "docs/research/cohort-step16.json"
AUDIT = ROOT / "docs/research/step16-selection-audit.json"
MANIFEST = ROOT / "docs/research/step16-observation-manifest.json"
RADIUS_M = 6371008.8
FORBIDDEN = ("hycom", "glorys", "era5", "ncep", "wind", "result", "run-primary", "replay", "evidence", "verdict", "bootstrap", "sensitivity",
             "trajector", "baseline", "examples", "cohort-step15", "step15-selection-audit", "cohort-step12", "cohort-selection-step15")
ALLOWED = tuple(str(p) for p in (RULE_MD, PREREG, RAW, COAST, OUT, AUDIT, MANIFEST))
access = {"forbiddenInputAccess": 0, "opened": 0}
_open = builtins.open


def guarded_open(file, *args, **kwargs):
    name = str(file)
    lower = name.replace("\\", "/").lower()
    inside_raw = lower.startswith(str(RAW).replace("\\", "/").lower())
    if (any(tok in lower for tok in FORBIDDEN) and not inside_raw) or not any(name.startswith(p) for p in ALLOWED):
        access["forbiddenInputAccess"] += 1
        raise SystemExit(f"FORBIDDEN INPUT ACCESS: {name}")
    access["opened"] += 1
    return _open(file, *args, **kwargs)


builtins.open = guarded_open


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def haversine_km(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return RADIUS_M / 1000 * 2 * math.asin(math.sqrt(min(1.0, a)))


def bearing_deg(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlam = math.radians(lon2 - lon1)
    x = math.sin(dlam) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dlam)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def epoch(text):
    return int(datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp())


class Coast:
    def __init__(self, path):
        geo = json.loads(Path(path).read_text(encoding="utf-8"))
        pts = []
        for feature in geo["features"]:
            geometry = feature["geometry"]
            lines = geometry["coordinates"] if geometry["type"] == "MultiLineString" else [geometry["coordinates"]]
            for line in lines:
                pts.extend(line)
        arr = np.array(pts, dtype=float)
        self.lon, self.lat = np.radians(arr[:, 0]), np.radians(arr[:, 1])

    def distance_km(self, lon, lat):
        p1, l1 = math.radians(lat), math.radians(lon)
        a = np.sin((self.lat - p1) / 2) ** 2 + math.cos(p1) * np.cos(self.lat) * np.sin((self.lon - l1) / 2) ** 2
        return float(RADIUS_M / 1000 * 2 * np.arcsin(np.sqrt(np.minimum(1, a))).min())


def load_region(region_id):
    """STEP 15 loader verbatim: identical duplicate rows collapse; conflicting duplicates exclude the drifter."""
    files = sorted(RAW.glob(f"{region_id}-*-q*.csv"))
    if not files:
        raise SystemExit(f"no raw observations for {region_id}")
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
        per.setdefault(drifter, []).append((epoch(time), float(lat), float(lon), float(gap) if gap not in ("", "NaN") else float("nan"), lost.strip(), kind))
    tracks = {}
    for drifter, samples in per.items():
        samples.sort()
        tracks[drifter] = {"t": np.array([s[0] for s in samples], dtype=np.int64), "lat": np.array([s[1] for s in samples]), "lon": np.array([s[2] for s in samples]),
                           "gap": np.array([s[3] for s in samples]), "lost": samples[0][4], "kind": samples[0][5], "conflict": drifter in conflicts}
    return tracks, files, len(conflicts)


def evaluate(box, tracks, t0, coast, cache):
    """STEP 15 window evaluation verbatim (E1–E5, per-drifter A1–A3 quantities)."""
    hours = t0 + 3600 * np.arange(73)
    end = int(hours[-1])
    counts = {"E1_drogue": 0, "E2_type": 0, "E3_samples": 0, "E3_gap": 0, "E4_coast": 0, "E5_box": 0, "duplicateConflict": 0, "notPresentAtStart": 0}
    eligible = []
    for drifter, tr in tracks.items():
        i0 = int(np.searchsorted(tr["t"], t0))
        if i0 >= len(tr["t"]) or tr["t"][i0] != t0:
            counts["notPresentAtStart"] += 1
            continue
        if tr["conflict"]:
            counts["duplicateConflict"] += 1
            continue
        lat0, lon0 = float(tr["lat"][i0]), float(tr["lon"][i0])
        if not (box["west"] <= lon0 <= box["east"] and box["south"] <= lat0 <= box["north"]):
            counts["E5_box"] += 1
            continue
        lost = tr["lost"]
        if lost and epoch(lost) <= end:
            counts["E1_drogue"] += 1
            continue
        if tr["kind"] not in ("SVP", "SVPB"):
            counts["E2_type"] += 1
            continue
        idx = np.searchsorted(tr["t"], hours)
        present = (idx < len(tr["t"])) & (tr["t"][np.minimum(idx, len(tr["t"]) - 1)] == hours)
        if not present.all():
            counts["E3_samples"] += 1
            continue
        seg = tr["t"][idx]
        max_gap_h = float(np.diff(seg).max() / 3600)
        provider_gap = np.nanmax(tr["gap"][idx]) if np.isfinite(tr["gap"][idx]).any() else 0.0
        if max_gap_h > 1.0 or provider_gap > 3600:
            counts["E3_gap"] += 1
            continue
        key = (drifter, int(t0))
        if key not in cache:
            cache[key] = coast.distance_km(lon0, lat0)
        if not cache[key] > 100:
            counts["E4_coast"] += 1
            continue
        la, lo = tr["lat"][idx], tr["lon"][idx]
        elapsed = float(seg[1] - seg[0])
        speed = haversine_km(lo[0], la[0], lo[1], la[1]) * 1000 / elapsed
        disp = haversine_km(lo[0], la[0], lo[72], la[72])
        d1, d2 = haversine_km(lo[0], la[0], lo[24], la[24]), haversine_km(lo[24], la[24], lo[72], la[72])
        turn = 180.0 if d1 < 1 or d2 < 1 else abs((bearing_deg(lo[0], la[0], lo[24], la[24]) - bearing_deg(lo[24], la[24], lo[72], la[72]) + 180) % 360 - 180)
        eligible.append({"drifterId": drifter, "typebuoy": tr["kind"], "startLon": lon0, "startLat": lat0, "coastKm": round(cache[key], 1), "sampleCount": 73,
                         "maxGapHours": max_gap_h, "startTimestamp": datetime.fromtimestamp(int(seg[0]), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                         "endTimestamp": datetime.fromtimestamp(int(seg[-1]), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                         "speedMps": speed, "displacement72hKm": disp, "turnDeg": turn, "drogueLostDate": lost or None})
    return eligible, counts


def main():
    if sha(RULE_MD) != RULE_SHA_EXPECTED:
        raise SystemExit("RULE SHA MISMATCH — STOP")
    if sha(PREREG) != PREREG_SHA_EXPECTED:
        raise SystemExit("PREREGISTRATION SHA MISMATCH — STOP")
    if sha(COAST) != COAST_SHA_EXPECTED:
        raise SystemExit("COASTLINE MISMATCH — STOP")
    rule = json.loads(PREREG.read_text(encoding="utf-8"))
    if rule["status"] != "PREREGISTRATION LOCKED":
        raise SystemExit("PREREGISTRATION NOT LOCKED — STOP")
    thr = {k: rule["advectionCriteria"][k]["threshold"] for k in ("A1", "A2", "A3")}
    min_elig, stop_at, max_windows, sep_h = rule["regionWindowMinimumEligible"], rule["accumulation"]["stopWhenRegionUniqueDrifters"], rule["accumulation"]["maximumWindowsPerRegion"], rule["accumulation"]["minimumStartSeparationHours"]
    # observation integrity — same aggregate as STEP 15 (sorted paths; filename/sha256/bytes)
    raw_files = sorted(RAW.glob("*-*-q*.csv"))
    file_entries = [{"filename": f.name, "sha256": sha(f), "bytes": f.stat().st_size} for f in raw_files]
    observation_sha = hashlib.sha256(canonical(file_entries)).hexdigest()
    if observation_sha != OBS_SHA_EXPECTED:
        raise SystemExit(f"OBSERVATION SHA MISMATCH {observation_sha} — STOP")
    log_path = RAW / "acquisition-log.jsonl"
    log = {e["file"]: e for e in (json.loads(l) for l in log_path.read_text(encoding="utf-8").splitlines() if l.strip())} if log_path.exists() else {}
    period_start = datetime.strptime(rule["observationPeriod"]["startDate"], "%Y-%m-%d").replace(hour=12, tzinfo=timezone.utc)
    period_end = datetime.strptime(rule["observationPeriod"]["endDate"], "%Y-%m-%d").replace(hour=12, tzinfo=timezone.utc)
    days = []
    day = period_start
    while day <= period_end:
        days.append(day)
        day += timedelta(days=1)
    coast = Coast(COAST)
    audit_rows, region_audit, region_cohorts = [], {}, {}
    for region in rule["regions"]:
        rid = region["id"]
        box = {k: region[k] for k in ("south", "north", "west", "east")}
        tracks, files, conflicts = load_region(rid)
        cache = {}
        cohort_ids, selected, last_start, done, order = [], [], None, False, 0
        for day in days:
            t0 = int(day.timestamp())
            eligible, counts = evaluate(box, tracks, t0, coast, cache)
            n = len(eligible)
            row = {"region": rid, "date": day.strftime("%Y-%m-%d"), "start": day.strftime("%Y-%m-%dT%H:%M:%SZ"), "end": (day + timedelta(hours=72)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                   "eligibleCount": n, "exclusions": counts, "A1_median": None, "A1_pass": None, "A2_median": None, "A2_pass": None, "A3_median": None, "A3_pass": None, "eligibleWindow": False,
                   "selectionStatus": None, "skipReason": None, "selected": False}
            if n >= min_elig:
                a1, a2, a3 = (float(np.median([e[k] for e in eligible])) for k in ("speedMps", "displacement72hKm", "turnDeg"))
                row.update({"A1_median": round(a1, 4), "A1_pass": a1 >= thr["A1"], "A2_median": round(a2, 2), "A2_pass": a2 >= thr["A2"], "A3_median": round(a3, 1), "A3_pass": a3 <= thr["A3"]})
                row["eligibleWindow"] = bool(row["A1_pass"] and row["A2_pass"] and row["A3_pass"])
            if done:
                row["selectionStatus"] = "AFTER_REGION_STOP"
            elif not row["eligibleWindow"]:
                row["selectionStatus"] = "NON_ELIGIBLE"
                row["skipReason"] = "eligible<8" if n < min_elig else "A-criteria fail: " + ",".join(k for k in ("A1", "A2", "A3") if not row[f"{k}_pass"])
            elif last_start is not None and (t0 - last_start) < sep_h * 3600:
                row["selectionStatus"] = "SKIPPED_OVERLAP"
                row["skipReason"] = f"start within {sep_h} h of previously selected window {datetime.fromtimestamp(last_start, timezone.utc).strftime('%Y-%m-%d')}"
            else:
                order += 1
                new_ids = [e["drifterId"] for e in eligible if e["drifterId"] not in cohort_ids]
                dup_ids = [e["drifterId"] for e in eligible if e["drifterId"] in cohort_ids]
                cohort_ids.extend(new_ids)
                last_start = t0
                row.update({"selectionStatus": "SELECTED", "selected": True, "selectedOrder": order, "newDrifterIds": new_ids, "duplicateDrifterIds": dup_ids,
                            "newDrifterCount": len(new_ids), "duplicateDrifterCount": len(dup_ids), "cumulativeUniqueDrifters": len(cohort_ids)})
                selected.append({"order": order, "date": row["date"], "start": row["start"], "end": row["end"], "eligibleCount": n, "A1_median": row["A1_median"], "A2_median": row["A2_median"], "A3_median": row["A3_median"],
                                 "newDrifterIds": new_ids, "duplicateDrifterIds": dup_ids, "cumulativeUniqueDrifters": len(cohort_ids), "drifters": eligible})
                if len(cohort_ids) >= stop_at or order >= max_windows:
                    done = True
            audit_rows.append(row)
        status = "REGION_MET" if len(cohort_ids) >= stop_at else "REGION_UNMET"
        region_audit[rid] = {"box": box, "loadedDrifterCount": len(tracks), "duplicateConflictDrifters": conflicts, "evaluatedWindows": len(days),
                             "eligibleWindows": sum(1 for r in audit_rows if r["region"] == rid and r["eligibleWindow"]), "selectedWindows": len(selected),
                             "skippedOverlap": sum(1 for r in audit_rows if r["region"] == rid and r["selectionStatus"] == "SKIPPED_OVERLAP"),
                             "finalUniqueDrifterCount": len(cohort_ids), "regionStatus": status, "rawFiles": [f.name for f in files]}
        region_cohorts[rid] = {"ids": cohort_ids, "selected": selected, "status": status}
    met = [(rid, c) for rid, c in region_cohorts.items() if c["status"] == "REGION_MET"]
    ranked = sorted(met, key=lambda item: (-len(item[1]["ids"]), item[0]))
    chosen = ranked[:rule["requiredRegions"]]
    union = []
    for rid, c in chosen:
        for i in c["ids"]:
            if i not in union:
                union.append(i)
    passed = len(chosen) == rule["requiredRegions"] and len(union) >= rule["totalMinimumEligible"]
    status = "COHORT_SELECTION_PASS" if passed else "COHORT_SELECTION_BLOCKED"
    selected_windows = {rid: [{k: w[k] for k in ("order", "date", "start", "end", "eligibleCount", "newDrifterIds", "duplicateDrifterIds", "cumulativeUniqueDrifters")} for w in c["selected"]] for rid, c in chosen}
    core = {"ruleSha256": RULE_SHA_EXPECTED, "preregistrationSha256": PREREG_SHA_EXPECTED, "observationSha256": observation_sha, "coastlineSha256": COAST_SHA_EXPECTED, "status": status,
            "selectedRegions": [rid for rid, _ in chosen], "selectedWindows": selected_windows, "selectedDrifterIds": {rid: c["ids"] for rid, c in chosen},
            "audit": [{k: r[k] for k in ("region", "date", "eligibleCount", "A1_median", "A2_median", "A3_median", "eligibleWindow", "selectionStatus")} for r in audit_rows]}
    selection_hash = hashlib.sha256(canonical(core)).hexdigest()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    cohort = {"schemaVersion": "1.0", "cohortId": "gdp-cohort-step16-2010-2020-chronological", "status": status, "ruleId": rule["ruleId"], "ruleSha256": RULE_SHA_EXPECTED,
              "preregistrationSha256": PREREG_SHA_EXPECTED, "lockCommit": "6c73cafe", "observationPeriod": rule["observationPeriod"], "observation": "NOAA GDP hourly QC (ERDDAP drifter_hourly_qc, CC BY 4.0) — STEP 15 raw files reused",
              "candidateRegions": [r["id"] for r in rule["regions"]], "totalWindows": len(days) * len(rule["regions"]), "daysEnumerated": len(days),
              "eligibleWindowsTotal": sum(1 for r in audit_rows if r["eligibleWindow"]),
              "regionResults": {rid: {**{k: v for k, v in region_audit[rid].items() if k != "rawFiles"}, "selectedWindowDates": [w["date"] for w in region_cohorts[rid]["selected"]], "uniqueDrifterIds": region_cohorts[rid]["ids"]} for rid in region_audit},
              "regionsRanked": [{"regionId": rid, "uniqueDrifters": len(c["ids"])} for rid, c in ranked],
              "selectedRegions": [rid for rid, _ in chosen], "selectedWindows": selected_windows, "selectedDrifters": {rid: c["ids"] for rid, c in chosen},
              "selectedWindowDetails": {rid: c["selected"] for rid, c in chosen},
              "regionCount": len(chosen), "totalUniqueDrifters": len(union), "requiredRegions": rule["requiredRegions"], "totalMinimumEligible": rule["totalMinimumEligible"],
              "thresholds": {**thr, "regionWindowMinimumEligible": min_elig, "stopWhenRegionUniqueDrifters": stop_at, "maximumWindowsPerRegion": max_windows, "minimumStartSeparationHours": sep_h},
              "observationSha256": observation_sha, "coastlineSha256": COAST_SHA_EXPECTED, "selectionHash": selection_hash, "createdAtUTC": now, "gitCommit": "6c73cafe",
              "modelBlind": True, "forcingBlind": True, "forbiddenInputAccess": access["forbiddenInputAccess"], "previousStepStatus": "STEP 15 COHORT_SELECTION_BLOCKED (7091c5cb), preserved and not used"}
    OUT.write_text(json.dumps(cohort, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    AUDIT.write_text(json.dumps({"schemaVersion": "1.0", "ruleSha256": RULE_SHA_EXPECTED, "observationSha256": observation_sha, "coastlineSha256": COAST_SHA_EXPECTED, "selectionHash": selection_hash,
                                 "totalWindows": len(days) * len(rule["regions"]), "forbiddenInputAccess": access["forbiddenInputAccess"], "regions": region_audit, "rows": audit_rows},
                                ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    MANIFEST.write_text(json.dumps({"schemaVersion": "1.0", "createdAtUTC": now, "reusedFrom": "STEP 15 acquisition (tools/research/acquire_step15_observations.sh); no new download",
                                    "observationSha256": observation_sha, "files": [{**e, "query": log.get(e["filename"], {}).get("query"), "retrievedAtUTC": log.get(e["filename"], {}).get("retrievedAtUTC"), "httpStatus": log.get(e["filename"], {}).get("httpStatus")} for e in file_entries],
                                    "rawLocation": "data/research/step15/noaa-gdp-hourly-qc/ (not committed)", "coastline": {"file": COAST.name, "sha256": COAST_SHA_EXPECTED}}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": status, "selectionHash": selection_hash, "regions": {rid: (region_cohorts[rid]["status"], len(region_cohorts[rid]["ids"]), [w["date"] for w in region_cohorts[rid]["selected"]]) for rid in region_cohorts},
                      "selected": [rid for rid, _ in chosen], "totalUnique": len(union), "forbiddenInputAccess": access["forbiddenInputAccess"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
