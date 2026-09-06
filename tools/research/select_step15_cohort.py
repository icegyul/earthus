"""STEP 15 — observation-only cohort selection under cohort-selection-rule-step14-multi-year.

Opens exactly three kinds of input: the STEP 14 rule JSON, the raw NOAA GDP hourly QC CSVs under
data/research/step15/noaa-gdp-hourly-qc/, and the Natural Earth 1:10m coastline used in STEP 13.
Any attempt to open a path containing a forbidden token exits 1 (forbiddenInputAccess counter).

Outputs: docs/research/cohort-step15.json, docs/research/cohort-selection-step15-audit.json,
docs/research/step15-observation-manifest.json. Deterministic: selectionHash excludes timestamps.
"""
import builtins
import csv
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
RULE = ROOT / "docs/research/cohort-selection-rule-step14.json"
RULE_SHA_EXPECTED = "ae9c214a337f2a351de73ed98e12395136d10013cea60b986644948b3db8c0c5"
RAW = ROOT / "data/research/step15/noaa-gdp-hourly-qc"
COAST = ROOT / "docs/research/fixtures/gdp-cohort-step12/ne_10m_coastline.geojson"
COAST_SHA_EXPECTED = "6f75ae0e0de157b14946e2255eb1f5486d9a13819032e26d4610852d296788f6"
OUT = ROOT / "docs/research/cohort-step15.json"
AUDIT = ROOT / "docs/research/cohort-selection-step15-audit.json"
MANIFEST = ROOT / "docs/research/step15-observation-manifest.json"
RADIUS_M = 6371008.8
FORBIDDEN = ("hycom", "glorys", "era5", "ncep", "wind", "result", "run-primary", "replay", "evidence", "verdict", "bootstrap", "sensitivity", "trajector", "baseline", "examples")
ALLOWED_PREFIXES = (str(RULE), str(RAW), str(COAST), str(OUT), str(AUDIT), str(MANIFEST))
access = {"forbiddenInputAccess": 0, "opened": 0}
_open = builtins.open


def guarded_open(file, *args, **kwargs):
    name = str(file)
    lower = name.replace("\\", "/").lower()
    if any(tok in lower for tok in FORBIDDEN) and not lower.startswith(str(RAW).replace("\\", "/").lower()):
        access["forbiddenInputAccess"] += 1
        raise SystemExit(f"FORBIDDEN INPUT ACCESS: {name}")
    if not any(name.startswith(p) for p in ALLOWED_PREFIXES):
        access["forbiddenInputAccess"] += 1
        raise SystemExit(f"INPUT OUTSIDE ALLOWED SET: {name}")
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
    """Compact per-drifter arrays. Duplicate (ID,time) rows: identical → collapsed; conflicting → drifter flagged and excluded."""
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
        t = np.array([s[0] for s in samples], dtype=np.int64)
        tracks[drifter] = {"t": t, "lat": np.array([s[1] for s in samples]), "lon": np.array([s[2] for s in samples]), "gap": np.array([s[3] for s in samples]),
                           "lost": samples[0][4], "kind": samples[0][5], "conflict": drifter in conflicts}
    return tracks, files, len(conflicts)


def evaluate(region, box, tracks, t0, coast, cache):
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
        # A1: first valid observation after t0 (the +1 h sample under E3) over actual elapsed seconds
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
    if sha(RULE) != RULE_SHA_EXPECTED:
        raise SystemExit("RULE SHA MISMATCH — STOP")
    if sha(COAST) != COAST_SHA_EXPECTED:
        raise SystemExit("COASTLINE MISMATCH — BLOCKED / INPUT MISMATCH")
    rule = json.loads(RULE.read_text(encoding="utf-8"))
    thr = {k: rule["advectionCriteria"][k]["threshold"] for k in ("A1", "A2", "A3")}
    period_start = datetime.strptime(rule["observationPeriod"]["startDate"], "%Y-%m-%d").replace(hour=12, tzinfo=timezone.utc)
    period_end = datetime.strptime(rule["observationPeriod"]["endDate"], "%Y-%m-%d").replace(hour=12, tzinfo=timezone.utc)
    days = []
    day = period_start
    while day <= period_end:
        days.append(day)
        day += timedelta(days=1)
    coast = Coast(COAST)
    audit_rows, per_region, manifest_files = [], {}, []
    log_path = RAW / "acquisition-log.jsonl"
    log = [json.loads(line) for line in log_path.read_text(encoding="utf-8").splitlines() if line.strip()] if log_path.exists() else []
    for region in rule["regions"]:
        rid = region["id"]
        box = {k: region[k] for k in ("south", "north", "west", "east")}
        tracks, files, conflicts = load_region(rid)
        manifest_files.extend(files)
        cache, qualifying = {}, []
        for day in days:
            t0 = int(day.timestamp())
            eligible, counts = evaluate(rid, box, tracks, t0, coast, cache)
            n = len(eligible)
            row = {"date": day.strftime("%Y-%m-%d"), "region": rid, "windowStartUTC": day.strftime("%Y-%m-%dT%H:%M:%SZ"),
                   "windowEndUTC": (day + timedelta(hours=72)).strftime("%Y-%m-%dT%H:%M:%SZ"), "loadedDrifterCount": len(tracks), "eligibleCount": n,
                   "exclusions": counts, "A1_median": None, "A1_verdict": None, "A2_median": None, "A2_verdict": None, "A3_median": None, "A3_verdict": None, "qualifying": False}
            if n >= rule["regionMinimumEligible"]:
                a1, a2, a3 = (float(np.median([e[k] for e in eligible])) for k in ("speedMps", "displacement72hKm", "turnDeg"))
                row.update({"A1_median": round(a1, 4), "A1_verdict": a1 >= thr["A1"], "A2_median": round(a2, 2), "A2_verdict": a2 >= thr["A2"], "A3_median": round(a3, 1), "A3_verdict": a3 <= thr["A3"]})
                row["qualifying"] = bool(row["A1_verdict"] and row["A2_verdict"] and row["A3_verdict"])
                if row["qualifying"]:
                    qualifying.append((day, eligible, row))
            row["exclusionSummary"] = "eligible<8" if n < rule["regionMinimumEligible"] else ("QUALIFYING" if row["qualifying"] else "A-criteria fail: " + ",".join(k for k in ("A1", "A2", "A3") if not row[f"{k}_verdict"]))
            audit_rows.append(row)
        per_region[rid] = {"box": box, "loadedDrifterCount": len(tracks), "duplicateConflictDrifters": conflicts, "qualifyingWindows": len(qualifying),
                           "earliest": qualifying[0] if qualifying else None, "rawFiles": [f.name for f in files]}
    ranked = sorted([(rid, info) for rid, info in per_region.items() if info["earliest"]], key=lambda item: (-len(item[1]["earliest"][1]), item[0]))
    chosen = ranked[:rule["requiredRegions"]]
    total = sum(len(info["earliest"][1]) for _, info in chosen)
    passed = len(chosen) >= rule["requiredRegions"] and total >= rule["totalMinimumEligible"]
    status = "COHORT SELECTION PASS" if passed else "COHORT_SELECTION_BLOCKED"
    by_name = {entry["file"]: entry for entry in log}
    manifest = [{"source": "NOAA AOML GDP hourly QC (ERDDAP drifter_hourly_qc), CC BY 4.0", "filename": f.name, "query": by_name.get(f.name, {}).get("query"),
                 "retrievedAtUTC": by_name.get(f.name, {}).get("retrievedAtUTC"), "httpStatus": by_name.get(f.name, {}).get("httpStatus"), "bytes": f.stat().st_size, "sha256": sha(f)}
                for f in sorted(manifest_files)]
    observation_sha = hashlib.sha256(canonical([{k: m[k] for k in ("filename", "sha256", "bytes")} for m in manifest])).hexdigest()
    regions_out = []
    for rid, info in chosen:
        day, eligible, row = info["earliest"]
        regions_out.append({"regionId": rid, "box": info["box"], "selectedDate": row["date"], "windowStartUTC": row["windowStartUTC"], "windowEndUTC": row["windowEndUTC"],
                            "eligibleCount": len(eligible), "A1": {"threshold": thr["A1"], "unit": "m/s", "median": row["A1_median"], "pass": row["A1_verdict"]},
                            "A2": {"threshold": thr["A2"], "unit": "km", "median": row["A2_median"], "pass": row["A2_verdict"]},
                            "A3": {"threshold": thr["A3"], "unit": "deg", "median": row["A3_median"], "pass": row["A3_verdict"]},
                            "drifterIds": [e["drifterId"] for e in eligible], "drifters": eligible, "exclusions": row["exclusions"], "qualifyingWindowsInRegion": info["qualifyingWindows"]})
    core = {"rule": RULE_SHA_EXPECTED, "observationSha256": observation_sha, "coastlineSha256": COAST_SHA_EXPECTED, "status": status,
            "regions": [{k: r[k] for k in ("regionId", "selectedDate", "drifterIds")} for r in regions_out],
            "audit": [{k: r[k] for k in ("date", "region", "eligibleCount", "A1_median", "A2_median", "A3_median", "qualifying")} for r in audit_rows]}
    selection_hash = hashlib.sha256(canonical(core)).hexdigest()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    cohort = {"schemaVersion": "1.0", "cohortId": "gdp-cohort-step15-2010-2020", "status": status, "ruleId": rule["ruleId"], "ruleSha256": RULE_SHA_EXPECTED,
              "observationPeriod": rule["observationPeriod"], "observation": "NOAA GDP hourly QC (ERDDAP drifter_hourly_qc, CC BY 4.0)",
              "candidateRegions": [r["id"] for r in rule["regions"]], "totalWindows": len(days) * len(rule["regions"]), "daysEnumerated": len(days),
              "perRegion": {rid: {"loadedDrifterCount": info["loadedDrifterCount"], "duplicateConflictDrifters": info["duplicateConflictDrifters"], "qualifyingWindows": info["qualifyingWindows"],
                                  "earliestQualifyingDate": info["earliest"][2]["date"] if info["earliest"] else None, "eligibleAtEarliest": len(info["earliest"][1]) if info["earliest"] else None} for rid, info in per_region.items()},
              "regionsRanked": [{"regionId": rid, "eligibleAtEarliest": len(info["earliest"][1]), "earliestDate": info["earliest"][2]["date"]} for rid, info in ranked],
              "selectedRegions": [r["regionId"] for r in regions_out], "selectedDates": {r["regionId"]: r["selectedDate"] for r in regions_out},
              "selectedDrifters": {r["regionId"]: r["drifterIds"] for r in regions_out}, "regions": regions_out,
              "regionCount": len(chosen), "totalEligible": total, "requiredRegions": rule["requiredRegions"], "totalMinimumEligible": rule["totalMinimumEligible"],
              "observationSha256": observation_sha, "coastlineSha256": COAST_SHA_EXPECTED, "coastlineMethod": "nearest coastline vertex haversine > 100 km (STEP 13 method)",
              "duplicatePolicy": "identical duplicate (ID,time) rows collapsed; conflicting duplicates exclude the drifter (counted as duplicateConflict)",
              "selectionHash": selection_hash, "createdAtUTC": now, "gitCommit": "35a2b27b", "modelBlind": True, "forcingBlind": True,
              "forbiddenInputAccess": access["forbiddenInputAccess"], "previousStepStatus": "STEP 13 COHORT SELECTION BLOCKED (6d95b604), preserved",
              "tieBreak": "eligible count at earliest qualifying window descending, then alphabetical regionId"}
    OUT.write_text(json.dumps(cohort, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    AUDIT.write_text(json.dumps({"schemaVersion": "1.0", "ruleSha256": RULE_SHA_EXPECTED, "observationSha256": observation_sha, "selectionHash": selection_hash,
                                 "totalWindows": len(days) * len(rule["regions"]), "rows": audit_rows}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    MANIFEST.write_text(json.dumps({"schemaVersion": "1.0", "createdAtUTC": now, "observationSha256": observation_sha, "files": manifest,
                                    "acquisitionScript": "tools/research/acquire_step15_observations.sh", "rawLocation": "data/research/step15/noaa-gdp-hourly-qc/ (not committed; SHAs here)",
                                    "coastline": {"file": COAST.name, "sha256": COAST_SHA_EXPECTED}}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": status, "selectionHash": selection_hash, "totalWindows": cohort["totalWindows"], "regions": [(r["regionId"], r["selectedDate"], r["eligibleCount"]) for r in regions_out],
                      "total": total, "qualifyingWindows": {rid: info["qualifyingWindows"] for rid, info in per_region.items()}, "forbiddenInputAccess": access["forbiddenInputAccess"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
