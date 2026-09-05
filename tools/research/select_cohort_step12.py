"""STEP 13 — observation-only cohort selection under cohort-selection-rule-v2.json.

Inputs (and nothing else): the rule file, raw GDP hourly CSVs saved under
docs/research/fixtures/gdp-cohort-step12/raw/, and the Natural Earth 1:10m coastline.
No model output, forcing dataset, V1/V2 evidence or verdict is opened — asserted at start.

Outputs: docs/research/cohort-step12.json and docs/research/cohort-step12-selection-audit.json.
Deterministic: same inputs → same selection hash.
"""
import csv
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
RULE = ROOT / "docs/research/cohort-selection-rule-v2.json"
RAW = ROOT / "docs/research/fixtures/gdp-cohort-step12/raw"
COAST = ROOT / "docs/research/fixtures/gdp-cohort-step12/ne_10m_coastline.geojson"
OUT = ROOT / "docs/research/cohort-step12.json"
AUDIT = ROOT / "docs/research/cohort-step12-selection-audit.json"
RADIUS_M = 6371008.8
FORBIDDEN = ("evidence", "hycom", "glorys", "wind", "result", "verdict", "examples")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def haversine_km(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dlam = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlam / 2) ** 2
    return RADIUS_M / 1000 * 2 * math.asin(math.sqrt(min(1, a)))


def bearing_deg(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlam = math.radians(lon2 - lon1)
    x = math.sin(dlam) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dlam)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def utc(text):
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def load_region_rows(region_id):
    rows = {}
    files = sorted(RAW.glob(f"{region_id}-q*.csv"))
    if not files:
        raise SystemExit(f"no raw observations for {region_id}")
    for path in files:
        with path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                if row["time"] == "UTC":
                    continue
                key = (row["ID"], row["time"])
                rows[key] = row  # quarterly downloads overlap by a few days; identical rows collapse
    by_id = {}
    for (drifter, time), row in rows.items():
        by_id.setdefault(drifter, {})[time] = row
    return by_id, files


class Coast:
    def __init__(self, path):
        geo = json.loads(path.read_text(encoding="utf-8"))
        pts = []
        for feature in geo["features"]:
            geometry = feature["geometry"]
            lines = geometry["coordinates"] if geometry["type"] == "MultiLineString" else [geometry["coordinates"]]
            for line in lines:
                pts.extend(line)
        arr = np.array(pts, dtype=float)
        self.lon, self.lat = np.radians(arr[:, 0]), np.radians(arr[:, 1])
        self.count = len(arr)

    def distance_km(self, lon, lat):
        """Nearest coastline VERTEX (1:10m vertex spacing ≈ 1-2 km; a slight overestimate of the true line distance)."""
        p1, l1 = math.radians(lat), math.radians(lon)
        a = np.sin((self.lat - p1) / 2) ** 2 + math.cos(p1) * np.cos(self.lat) * np.sin((self.lon - l1) / 2) ** 2
        return float(RADIUS_M / 1000 * 2 * np.arcsin(np.sqrt(np.minimum(1, a))).min())


def evaluate_window(region, box, by_id, start, coast, coast_cache):
    end = start + timedelta(hours=72)
    hours = [(start + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ") for h in range(73)]
    end_text = end.strftime("%Y-%m-%dT%H:%M:%SZ")
    eligible, counts = [], {"E1_drogue": 0, "E2_type": 0, "E3_samples": 0, "E4_coast": 0, "E5_box": 0, "notPresentAtStart": 0}
    for drifter, samples in by_id.items():
        first = samples.get(hours[0])
        if first is None:
            counts["notPresentAtStart"] += 1
            continue
        lon0, lat0 = float(first["longitude"]), float(first["latitude"])
        if not (box["west"] <= lon0 <= box["east"] and box["south"] <= lat0 <= box["north"]):
            counts["E5_box"] += 1
            continue
        lost = first["drogue_lost_date"].strip()
        if lost and lost <= end_text:
            counts["E1_drogue"] += 1
            continue
        if first["typebuoy"] not in ("SVP", "SVPB"):
            counts["E2_type"] += 1
            continue
        window = [samples.get(h) for h in hours]
        if any(s is None for s in window) or any(float(s["gap"]) > 3600 for s in window if s["gap"] not in ("", "NaN")):
            counts["E3_samples"] += 1
            continue
        key = (drifter, hours[0])
        if key not in coast_cache:
            coast_cache[key] = coast.distance_km(lon0, lat0)
        if coast_cache[key] < 100:
            counts["E4_coast"] += 1
            continue
        s0, s24, s72 = window[0], window[24], window[72]
        speed = math.hypot(float(s0["ve"]), float(s0["vn"]))
        disp = haversine_km(lon0, lat0, float(s72["longitude"]), float(s72["latitude"]))
        d1 = haversine_km(lon0, lat0, float(s24["longitude"]), float(s24["latitude"]))
        d2 = haversine_km(float(s24["longitude"]), float(s24["latitude"]), float(s72["longitude"]), float(s72["latitude"]))
        if d1 < 1 or d2 < 1:
            turn = 180.0  # undefined bearing on a <1 km leg: treated as maximal change (conservative for A3)
        else:
            b1 = bearing_deg(lon0, lat0, float(s24["longitude"]), float(s24["latitude"]))
            b2 = bearing_deg(float(s24["longitude"]), float(s24["latitude"]), float(s72["longitude"]), float(s72["latitude"]))
            turn = abs((b1 - b2 + 180) % 360 - 180)
        eligible.append({"drifterId": drifter, "typebuoy": first["typebuoy"], "startLon": lon0, "startLat": lat0, "coastKm": round(coast_cache[key], 1),
                         "speedMps": speed, "displacement72hKm": disp, "turnDeg": turn, "drogueLostDate": lost or None})
    return eligible, counts


def main(argv=None):
    for name in sys.argv[1:]:
        if any(f in name.lower() for f in FORBIDDEN):
            raise SystemExit("forbidden input path")
    rule = json.loads(RULE.read_text(encoding="utf-8"))
    rule_sha = sha(RULE)
    adv = rule["advectionDominantDefinition"]
    thr = {"A1": float(adv["A1_observedSpeedAtStart"]["threshold"].split()[-1]), "A2": float(adv["A2_observed72hDisplacement"]["threshold"].split()[-1]),
           "A3": float(adv["A3_persistenceOfDirection"]["threshold"].split()[-1])}
    coast = Coast(COAST)
    audit, per_region, raw_files = [], {}, []
    for region in rule["candidateRegions"]["regions"]:
        rid = region["id"]
        box = {k: region[k] for k in ("south", "north", "west", "east")}
        by_id, files = load_region_rows(rid)
        raw_files.extend(files)
        cache = {}
        qualifying = []
        day = datetime(2015, 1, 1, 12, tzinfo=timezone.utc)
        while day.year == 2015:
            eligible, counts = evaluate_window(rid, box, by_id, day, coast, cache)
            n = len(eligible)
            row = {"region": rid, "date": day.strftime("%Y-%m-%d"), "eligibleCount": n, "exclusionSummary": counts,
                   "A1_value": None, "A1_pass": None, "A2_value": None, "A2_pass": None, "A3_value": None, "A3_pass": None, "qualifies": False}
            if n >= 8:
                a1 = float(np.median([e["speedMps"] for e in eligible])); a2 = float(np.median([e["displacement72hKm"] for e in eligible])); a3 = float(np.median([e["turnDeg"] for e in eligible]))
                row.update({"A1_value": round(a1, 4), "A1_pass": a1 >= thr["A1"], "A2_value": round(a2, 2), "A2_pass": a2 >= thr["A2"], "A3_value": round(a3, 1), "A3_pass": a3 <= thr["A3"]})
                row["qualifies"] = row["A1_pass"] and row["A2_pass"] and row["A3_pass"]
                if row["qualifies"]:
                    qualifying.append((day, eligible, row))
            audit.append(row)
            day += timedelta(days=1)
        per_region[rid] = {"box": box, "drifterTracksLoaded": len(by_id), "qualifyingWindows": len(qualifying), "earliest": qualifying[0] if qualifying else None, "rawFiles": [f.name for f in files]}
    # earliest qualifying window per region; rank by eligible count desc, alphabetical tie-break
    ranked = sorted([(rid, info) for rid, info in per_region.items() if info["earliest"]], key=lambda item: (-len(item[1]["earliest"][1]), item[0]))
    chosen = ranked[:2]
    total = sum(len(info["earliest"][1]) for _, info in chosen)
    status = "LOCKED" if len(chosen) == 2 and total >= 20 else "BLOCKED"
    observation_manifest = [{"file": f.name, "sha256": sha(f), "bytes": f.stat().st_size} for f in sorted(raw_files)]
    regions_out = []
    for rid, info in chosen:
        day, eligible, row = info["earliest"]
        regions_out.append({"regionId": rid, "box": info["box"], "selectedDate": row["date"], "windowStart": day.strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "windowEnd": (day + timedelta(hours=72)).strftime("%Y-%m-%dT%H:%M:%SZ"), "eligibleCount": len(eligible),
                            "A1": {"threshold": thr["A1"], "unit": "m/s", "measuredValue": row["A1_value"], "pass": row["A1_pass"]},
                            "A2": {"threshold": thr["A2"], "unit": "km", "measuredValue": row["A2_value"], "pass": row["A2_pass"]},
                            "A3": {"threshold": thr["A3"], "unit": "deg", "measuredValue": row["A3_value"], "pass": row["A3_pass"]},
                            "drifterIds": [e["drifterId"] for e in eligible], "drifters": eligible, "exclusionCounts": row["exclusionSummary"],
                            "qualifyingWindowsInRegion": info["qualifyingWindows"]})
    selection_core = {"rule": rule_sha, "observations": observation_manifest, "regions": [{k: r[k] for k in ("regionId", "selectedDate", "drifterIds")} for r in regions_out], "status": status}
    selection_hash = hashlib.sha256(canonical(selection_core)).hexdigest()
    cohort = {"schemaVersion": "1.0", "cohortId": "gdp-cohort-step12-2015", "createdAtUTC": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
              "status": "COHORT SELECTION " + status, "selectionRuleId": rule["ruleId"], "selectionRuleSha256": rule_sha,
              "observationDatasetId": "noaa-gdp-hourly-qc-2015-regions-GS-KE-AG-BM", "observationSha256": hashlib.sha256(canonical(observation_manifest)).hexdigest(),
              "observationFiles": observation_manifest, "coastline": {"file": COAST.name, "sha256": sha(COAST), "source": "Natural Earth 1:10m coastline (public domain)", "method": "nearest vertex haversine; ≥100 km"},
              "thresholds": thr, "regionsRanked": [{"regionId": rid, "eligibleAtEarliest": len(info["earliest"][1]), "earliestDate": info["earliest"][2]["date"]} for rid, info in ranked],
              "regionsNotQualifying": [rid for rid, info in per_region.items() if not info["earliest"]],
              "regions": regions_out, "totalDrifters": total, "minimumTotal": 20,
              "selectionProcedure": rule["selectionProcedure"], "tieBreakRule": "eligible count descending, then alphabetical regionId; within a region the earliest calendar window",
              "modelBlind": True, "forcingBlind": True, "inputsOpened": ["cohort-selection-rule-v2.json", "fixtures/gdp-cohort-step12/raw/*.csv", "ne_10m_coastline.geojson"],
              "selectionHash": selection_hash}
    OUT.write_text(json.dumps(cohort, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    AUDIT.write_text(json.dumps({"schemaVersion": "1.0", "selectionRuleSha256": rule_sha, "observationSha256": cohort["observationSha256"], "selectionHash": selection_hash,
                                 "perRegion": {rid: {k: v for k, v in info.items() if k != "earliest"} for rid, info in per_region.items()}, "rows": audit},
                                ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": cohort["status"], "selectionHash": selection_hash, "regions": [(r["regionId"], r["selectedDate"], r["eligibleCount"]) for r in regions_out],
                      "total": total, "qualifyingWindows": {rid: info["qualifyingWindows"] for rid, info in per_region.items()}}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
