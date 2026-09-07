"""STEP 39 — deterministic evaluation on the frozen STEP 36 cohort (no bootstrap; STEP 37 fields 8/9/10/27 nested hierarchy).
Per drifter i (LEVEL 2, nested in window w = LEVEL 1): E_X,i(h) = haversine(model position at exactly t0+h, observed position at exactly
t0+h), R = 6371008.8 m, km, for X in A (HYCOM_NATIVE_3H), B (HYCOM_DAILY), C (GLORYS + Stokes candidate), h in 24/48/72 h; exact
drifter_id + exact UTC timestamp pairing; NOT_AVAILABLE never imputed. Primary: delta_i = E_C,i(72h) - E_A,i(72h); Delta_w = median over
valid pairs in w; Theta = median over windows with >= 1 valid pair (equal window weighting; windows without a valid pair recorded
NOT_AVAILABLE). Same nested rule for the secondary temporal comparator delta_B,i(h) = E_B,i(h) - E_A,i(h) and for 24/48 h. Pooled
drifter-level medians, W/L/T, the locked STEP 30A label (pooled pairs) and the STEP 32 temporal label, window-level consistency counts and
M1/M2/M4/M5 are reported as secondary/descriptive. Trajectory evaluation points are never treated as independent observations.
Writes step39-paired-table.csv, step39-evaluation.json, step39-summary.json (`--out DIR` for the independent re-run)."""
import csv
import hashlib
import io
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
COHORT, RUNS_T, RUNS_C, RULE30 = D / "step36-cohort-extension-manifest.json", D / "step39-temporal-run-manifest.json", D / "step39-candidate-run-manifest.json", D / "step30a-rule.json"
OBS_DIR = ROOT / "data/research/step15/noaa-gdp-hourly-qc"
OUT = {"table": "step39-paired-table.csv", "evaluation": "step39-evaluation.json", "summary": "step39-summary.json"}
RADIUS_M = 6371008.8; NA = "NOT_AVAILABLE"; H = (24, 48, 72); TOL = 1e-6
COLS = ["drifter_id", "window", "rank"] + [f"{k}_{h}h" for h in H for k in ("error_A", "error_B", "error_C", "delta_CA", "delta_BA", "sep_CA", "sep_BA")] + ["endpoint_A_72h", "endpoint_B_72h", "endpoint_C_72h", "path_A", "path_B", "path_C", "observed_72h"]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def hav(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * RADIUS_M * math.asin(math.sqrt(a)) / 1000


def r3(x):
    return NA if x == NA else round(x, 3)


def median(v):
    v = sorted(x for x in v if x != NA and x is not None)
    if not v:
        return None
    m = len(v) // 2
    return v[m] if len(v) % 2 else (v[m - 1] + v[m]) / 2


def stats(values):
    v = sorted(x for x in values if x is not None and x != NA)
    if not v:
        return {"n": 0, "median": None, "mean": None, "min": None, "max": None}
    return {"n": len(v), "median": round(median(v), 3), "mean": round(sum(v) / len(v), 3), "min": round(v[0], 3), "max": round(v[-1], 3)}


def wlt(deltas, neg_label, pos_label):
    d = [x for x in deltas if x != NA]
    return {neg_label: sum(1 for x in d if x < -TOL), pos_label: sum(1 for x in d if x > TOL), "ties": sum(1 for x in d if abs(x) <= TOL), "n": len(d)}


def nested(rows, key, h, windows):
    """Delta_w per window and Theta across windows with >= 1 valid pair (equal weighting)."""
    per = {}
    for w in windows:
        vals = [r[f"{key}_{h}h"] for r in rows if r["window"] == w and r[f"{key}_{h}h"] != NA]
        per[w] = {"n_valid": len(vals), "Delta_w": round(median(vals), 6) if vals else NA}
    avail = [p["Delta_w"] for p in per.values() if p["Delta_w"] != NA]
    theta = round(median(avail), 6) if avail else NA
    return {"perWindow": per, "windowsWithValidPair": len(avail), "windowsNotAvailable": [w for w, p in per.items() if p["Delta_w"] == NA], "Theta": theta, "windowConsistency": {"negative": sum(1 for x in avail if x < -TOL), "positive": sum(1 for x in avail if x > TOL), "tied": sum(1 for x in avail if abs(x) <= TOL)}, "formula": f"Theta = median_w[ median_i( {key.replace('delta_', 'E_').replace('CA', 'C - E_A').replace('BA', 'B - E_A')} ({h}h) ) ]"}


def positions(path):
    out = {}
    with open(path, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            if row["valid"] == "true":
                out.setdefault(row["drifter_id"], {})[row["timestamp"]] = (float(row["lon"]), float(row["lat"]))
    return out


def label30(deltas):
    med = median(deltas); w = sum(1 for x in deltas if x != NA and x < -TOL); l = sum(1 for x in deltas if x != NA and x > TOL)
    if med is None or w + l == 0:
        return "NO_CLEAR_DESCRIPTIVE_DIFFERENCE"
    if med < -TOL and w / (w + l) >= 2 / 3:
        return "CANDIDATE_DESCRIPTIVELY_FAVORED"
    if med > TOL and l / (w + l) >= 2 / 3:
        return "HYCOM_DESCRIPTIVELY_FAVORED"
    return "NO_CLEAR_DESCRIPTIVE_DIFFERENCE"


def label_t(deltas):
    med = median(deltas); w = sum(1 for x in deltas if x != NA and x < -TOL); l = sum(1 for x in deltas if x != NA and x > TOL)
    if med is None or w + l == 0:
        return "NO_CLEAR_TEMPORAL_DIFFERENCE"
    if med > TOL and l / (w + l) >= 2 / 3:
        return "NATIVE_3H_DESCRIPTIVELY_FAVORED"
    if med < -TOL and w / (w + l) >= 2 / 3:
        return "DAILY_DESCRIPTIVELY_FAVORED"
    return "NO_CLEAR_TEMPORAL_DIFFERENCE"


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else D
    out.mkdir(parents=True, exist_ok=True)
    M = load(COHORT); RT = load(RUNS_T); RC = load(RUNS_C)
    if RT["cohortManifestSha256"] != sha(COHORT) or RC["cohortManifestSha256"] != sha(COHORT) or RT["status"] != "STEP32_RUNS_PASS" or RC["status"] != "STEP32_RUNS_PASS" or RT["conditions"] != ["A", "B"] or RC["conditions"] != ["C"]:
        print(json.dumps({"status": "EVALUATION_BLOCKED", "reason": [RT.get("status"), RC.get("status")]})); return 2
    model = {}; inputs = []; blocked = []
    for r in RT["runs"] + RC["runs"]:
        if r.get("status") != "COMPLETED":
            blocked.append({"runId": r["runId"], "window": r["windowId"], "condition": r["condition"], "status": r.get("status"), "error": r.get("error")}); continue
        actual = sha(ROOT / r["trajectoriesFile"]); inputs.append({"runId": r["runId"], "window": r["windowId"], "condition": r["condition"], "file": r["trajectoriesFile"], "expected": r["trajectoriesSha256"], "actual": actual, "verified": actual == r["trajectoriesSha256"]})
        for did, pts in positions(ROOT / r["trajectoriesFile"]).items():
            model.setdefault((r["windowId"], did), {})[r["condition"]] = pts
    if not all(x["verified"] for x in inputs):
        print(json.dumps({"status": "EVALUATION_BLOCKED_INPUT_INTEGRITY"})); return 2
    windows = [w["windowId"] for w in M["windows"]]; rows = []; obs_files = {}
    for w in M["windows"]:
        wid = w["windowId"]; t0 = datetime.strptime(w["start"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc); t1 = t0 + timedelta(hours=72)
        tsd = {h: (t0 + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ") for h in H}; obs = {}
        for path in sorted(OBS_DIR.glob(f"{w['region']}-{w['start'][:4]}-q*.csv")):
            obs_files[str(path.relative_to(ROOT)).replace("\\", "/")] = sha(path)
            with open(path, encoding="utf-8", newline="") as fh:
                reader = csv.reader(fh); next(reader); next(reader)
                for r in reader:
                    if r[0] in w["drifterIds"]:
                        t = datetime.strptime(r[1], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                        if t0 <= t <= t1:
                            obs.setdefault(r[0], {})[r[1]] = (float(r[3]), float(r[2]))
        release = {d["drifterId"]: (d["startLon"], d["startLat"]) for d in w["drifters"]}
        for did in sorted(w["drifterIds"]):
            mm = model.get((wid, did), {}); o = obs.get(did, {}); rec = {"drifter_id": did, "window": wid, "rank": w["chronologicalRank"]}
            for h in H:
                pa, pb, pc, ob = mm.get("A", {}).get(tsd[h]), mm.get("B", {}).get(tsd[h]), mm.get("C", {}).get(tsd[h]), o.get(tsd[h])
                rec[f"error_A_{h}h"] = hav(*pa, *ob) if pa and ob else NA; rec[f"error_B_{h}h"] = hav(*pb, *ob) if pb and ob else NA; rec[f"error_C_{h}h"] = hav(*pc, *ob) if pc and ob else NA
                rec[f"delta_CA_{h}h"] = rec[f"error_C_{h}h"] - rec[f"error_A_{h}h"] if NA not in (rec[f"error_C_{h}h"], rec[f"error_A_{h}h"]) else NA
                rec[f"delta_BA_{h}h"] = rec[f"error_B_{h}h"] - rec[f"error_A_{h}h"] if NA not in (rec[f"error_B_{h}h"], rec[f"error_A_{h}h"]) else NA
                rec[f"sep_CA_{h}h"] = hav(*pc, *pa) if pc and pa else NA; rec[f"sep_BA_{h}h"] = hav(*pb, *pa) if pb and pa else NA
            for c in ("A", "B", "C"):
                pts = mm.get(c, {}); order = sorted(pts)
                rec[f"endpoint_{c}_72h"] = hav(*release[did], *pts[tsd[72]]) if tsd[72] in pts else NA
                rec[f"path_{c}"] = sum(hav(*pts[a], *pts[b]) for a, b in zip(order, order[1:])) if len(order) > 1 else NA
            rec["observed_72h"] = hav(*release[did], *o[tsd[72]]) if tsd[72] in o and w["start"] in o else NA
            rows.append(rec)
    rows.sort(key=lambda r: (r["rank"], r["drifter_id"]))
    buf = io.StringIO(newline=""); wr = csv.writer(buf, lineterminator="\n"); wr.writerow(COLS)
    for rec in rows:
        wr.writerow([rec["drifter_id"], rec["window"], rec["rank"]] + [r3(rec[c]) for c in COLS[3:]])
    (out / OUT["table"]).write_text(buf.getvalue(), encoding="utf-8")
    primary = nested(rows, "delta_CA", 72, windows)
    secondary = {f"delta_CA_{h}h": nested(rows, "delta_CA", h, windows) for h in (24, 48)} | {f"delta_BA_{h}h": nested(rows, "delta_BA", h, windows) for h in H}
    pooled = {}
    for key, neg, pos in (("delta_CA", "wins_candidate", "losses_candidate"), ("delta_BA", "wins_daily", "losses_daily")):
        for h in H:
            dl = [r[f"{key}_{h}h"] for r in rows]; pooled[f"{key}_{h}h"] = {"pooledMedian": stats(dl), **wlt(dl, neg, pos), "notAvailable": sum(1 for x in dl if x == NA)}
    availability = {f"{c}_{h}h": sum(1 for r in rows if r[f"error_{c}_{h}h"] != NA) for c in ("A", "B", "C") for h in H}
    availability.update({f"pair_CA_{h}h": sum(1 for r in rows if r[f"delta_CA_{h}h"] != NA) for h in H}); availability.update({f"pair_BA_{h}h": sum(1 for r in rows if r[f"delta_BA_{h}h"] != NA) for h in H})
    label_primary = label30([r["delta_CA_72h"] for r in rows]); label_temporal = label_t([r["delta_BA_72h"] for r in rows])
    metrics = {c: {"M1_endpoint72h": stats([r[f"endpoint_{c}_72h"] for r in rows]), "M2_totalPath": stats([r[f"path_{c}"] for r in rows]), "M3_72h": stats([r[f"error_{c}_72h"] for r in rows])} for c in ("A", "B", "C")}
    metrics["M4_separation72h"] = {"C_vs_A": stats([r["sep_CA_72h"] for r in rows]), "B_vs_A": stats([r["sep_BA_72h"] for r in rows])}; metrics["M5_observed72h"] = stats([r["observed_72h"] for r in rows])
    summary = {"ruleId": "experiment-preregistration-step37", "step": 39, "status": "STEP39_EVALUATED_DETERMINISTIC", "n_windows": len(windows), "n_drifters": len(rows), "hierarchy": "LEVEL 1 window (9) > LEVEL 2 drifter pair (20) > LEVEL 3 trajectory points (never independent)",
               "primary": {"endpoint": "Theta = median_w[ median_i( E_C,i(72h) - E_A,i(72h) ) ], km, equal window weighting", "Theta_km": primary["Theta"], "windowsWithValidPair": primary["windowsWithValidPair"], "windowsNotAvailable": primary["windowsNotAvailable"], "Delta_w": primary["perWindow"], "windowConsistency": primary["windowConsistency"], "pooledSecondary": pooled["delta_CA_72h"], "descriptiveLabel_step30aRule_pooledPairs": label_primary, "bootstrapInterval": "NOT RUN IN STEP 39 (deferred to the preregistered uncertainty step)", "successCriterionEvaluated": False, "successCriterion": "label CANDIDATE_DESCRIPTIVELY_FAVORED AND window-level 95 % interval of Theta < 0 (interval pending)"},
               "secondary": {"nested": secondary, "pooled": pooled, "temporalLabel72h_step32Rule_pooledPairs": label_temporal}, "availability": availability, "blockedRuns": blocked, "metrics": metrics,
               "noImputation": True, "noSubstitution": True, "parameterSelection": "NONE", "modelSelection": "NONE", "candidateStatus": "CANDIDATE_ONLY", "baselineStatus": "FROZEN_REFERENCE_BASELINE", "interpretation": "DESCRIPTIVE / DETERMINISTIC ONLY; no inference until the preregistered bootstrap"}
    (out / OUT["summary"]).write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    evaluation = {"schemaVersion": "1.0", "ruleId": summary["ruleId"], "step": 39, "status": "EVALUATION_COMPLETE", "cohortManifestSha256": sha(COHORT), "temporalRunManifestSha256": sha(RUNS_T), "candidateRunManifestSha256": sha(RUNS_C), "rule30aSha256": sha(RULE30), "observationFiles": obs_files, "inputTrajectories": inputs, "pairing": "exact drifter_id and exact UTC timestamp; candidate, baseline and observation valid; NA never imputed",
                  "perDrifter": [{k: (v if k in ("drifter_id", "window", "rank") else r3(v)) for k, v in r.items()} for r in rows], "primaryDeltas72h": [{"window": r["window"], "drifter_id": r["drifter_id"], "delta_i": r3(r["delta_CA_72h"])} for r in rows], "summary": summary, "tableSha256": sha(out / OUT["table"]), "summarySha256": sha(out / OUT["summary"])}
    (out / OUT["evaluation"]).write_text(json.dumps(evaluation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": summary["status"], "Theta_km": primary["Theta"], "Delta_w": {w: p["Delta_w"] for w, p in primary["perWindow"].items()}, "availability": availability, "labelPooled": label_primary, "temporalLabel": label_temporal}, ensure_ascii=False)); return 0


if __name__ == "__main__":
    raise SystemExit(main())
