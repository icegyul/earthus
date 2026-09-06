"""STEP 20 Phase B-6.3 — paired holdout evaluation (alpha 0.002 vs 0) exactly per STEP 20 §8–§12 / STEP 19 definitions.
Inputs: the 4 holdout trajectory CSVs (SHA-verified against docs/research/step20-b6-holdout-manifest.json), STEP 15 observations,
STEP 20 preregistration holdout units. n = 12 evaluable (KE-H1 5 + KE-H3 7); KE-H2 listed as FORCING_UNAVAILABLE.
Metrics: M3 24/48/72 h exact UTC (haversine R = 6371008.8 m), delta = error_0.002 - error_0, tie 1e-6 km, wins/losses/ties;
M1/M2/M4/M5; per-unit strata (small-n flagged); top-3 errors; exploratory sign test on overall n=12 only. No thresholds, no
interpretation, no positional tolerance. `--out DIR` for the reproducibility re-run."""
import csv
import hashlib
import io
import json
import math
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREREG20 = ROOT / "docs/research/step20-preregistration.json"
MANIFEST = ROOT / "docs/research/step20-b6-holdout-manifest.json"
LOCKED = {PREREG20: "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4", ROOT / "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd",
          ROOT / "docs/research/step20-generalization-protocol.md": "65b004589570e7e409201e82c9388b17ec53002c4b31282112056d005baabb00"}
RADIUS_M = 6371008.8
NA = "NOT_AVAILABLE"
A_ALPHA, B_ALPHA = 0.002, 0.0
COLS = ["drifter_id", "unit", "error_A_24h", "error_B_24h", "delta_24h", "error_A_48h", "error_B_48h", "delta_48h", "error_A_72h", "error_B_72h", "delta_72h", "endpoint_A_72h", "endpoint_B_72h", "A_B_separation_72h", "path_A", "path_B", "observed_72h"]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def haversine_km(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * RADIUS_M * math.asin(math.sqrt(a)) / 1000


def stats(values):
    v = sorted(x for x in values if x is not None and x != NA)
    if not v:
        return {"n": 0, "median": None, "mean": None, "min": None, "max": None}
    mid = len(v) // 2
    return {"n": len(v), "median": round(v[mid] if len(v) % 2 else (v[mid - 1] + v[mid]) / 2, 3), "mean": round(sum(v) / len(v), 3), "min": round(v[0], 3), "max": round(v[-1], 3)}


def wins(deltas, tol):
    d = [x for x in deltas if x != NA]
    return {"wins_alpha0.002": sum(1 for x in d if x < -tol), "losses_alpha0.002": sum(1 for x in d if x > tol), "ties": sum(1 for x in d if abs(x) <= tol)}


def sign_test(a, b):
    n = a + b
    if n == 0:
        return {"n": 0, "p": None}
    k = min(a, b)
    return {"n": n, "k": k, "p": round(min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n), 6)}


def r3(x):
    return NA if x == NA else round(x, 3)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else ROOT / "docs/research"
    out.mkdir(parents=True, exist_ok=True)
    for path, expected in LOCKED.items():
        if sha(path) != expected:
            print(json.dumps({"status": "EVALUATION_BLOCKED_IMMUTABILITY"})); return 2
    p20 = load(PREREG20); m = load(MANIFEST)
    if m["status"] != "HOLDOUT_RUNS_PASS":
        print(json.dumps({"status": "EVALUATION_BLOCKED", "reason": m["status"]})); return 1
    tol = p20["holdoutComparison"]["tieToleranceKm"]; horizons = p20["holdoutComparison"]["horizonsHours"]
    modeled = [r for r in m["runs"] if r.get("modeled")]
    input_shas = []
    for r in modeled:
        actual = sha(ROOT / r["trajectoriesFile"]); input_shas.append({"file": r["trajectoriesFile"], "expected": r["trajectoriesSha256"], "actual": actual, "verified": actual == r["trajectoriesSha256"]})
    if not all(x["verified"] for x in input_shas):
        print(json.dumps({"status": "EVALUATION_BLOCKED_RESULT_INTEGRITY"})); return 1
    model = {}
    for r in modeled:
        lab = "A" if float(r["alpha"]) == A_ALPHA else "B"
        with open(ROOT / r["trajectoriesFile"], encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                if row["valid"] == "true":
                    model.setdefault((r["windowId"], row["drifter_id"]), {}).setdefault(lab, {})[row["timestamp"]] = (float(row["lon"]), float(row["lat"]))
    units = {u["windowId"]: u for u in p20["holdout"]["runUnits"]}
    modeled_units = sorted({r["windowId"] for r in modeled})
    rows = []
    for wid in modeled_units:
        unit = units[wid]; t0 = datetime.strptime(unit["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc); t1 = t0 + timedelta(hours=72)
        ts = {h: (t0 + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ") for h in horizons}
        obs = {}
        for path in sorted((ROOT / "data/research/step15/noaa-gdp-hourly-qc").glob(f"{unit['region']}-{unit['t0'][:4]}-q*.csv")):
            with open(path, encoding="utf-8", newline="") as fh:
                reader = csv.reader(fh); next(reader); next(reader)
                for r in reader:
                    if r[0] in unit["drifterIds"]:
                        t = datetime.strptime(r[1], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                        if t0 <= t <= t1:
                            obs.setdefault(r[0], {})[r[1]] = (float(r[3]), float(r[2]))
        release = {d["drifterId"]: (d["lon"], d["lat"]) for d in unit["releasePositions"]}
        for did in sorted(unit["drifterIds"]):
            mm = model.get((wid, did), {}); o = obs.get(did, {}); rec = {"drifter_id": did, "unit": wid}
            for h in horizons:
                for lab in ("A", "B"):
                    pos = mm.get(lab, {}).get(ts[h]); ob = o.get(ts[h]); rec[f"error_{lab}_{h}h"] = haversine_km(*pos, *ob) if pos and ob else NA
                ea, eb = rec[f"error_A_{h}h"], rec[f"error_B_{h}h"]; rec[f"delta_{h}h"] = ea - eb if NA not in (ea, eb) else NA
            for lab in ("A", "B"):
                pts = mm.get(lab, {}); order = sorted(pts)
                rec[f"endpoint_{lab}_72h"] = haversine_km(*release[did], *pts[ts[72]]) if ts[72] in pts else NA
                rec[f"path_{lab}"] = sum(haversine_km(*pts[a], *pts[b]) for a, b in zip(order, order[1:])) if len(order) > 1 else NA
            pa, pb = mm.get("A", {}).get(ts[72]), mm.get("B", {}).get(ts[72])
            rec["A_B_separation_72h"] = haversine_km(*pa, *pb) if pa and pb else NA
            rec["observed_72h"] = haversine_km(*release[did], *o[ts[72]]) if ts[72] in o and unit["t0"] in o else NA
            rows.append(rec)
    rows.sort(key=lambda r: r["drifter_id"])
    buf = io.StringIO(newline=""); w = csv.writer(buf, lineterminator="\n"); w.writerow(COLS)
    for rec in rows:
        w.writerow([rec["drifter_id"], rec["unit"]] + [r3(rec[c]) for c in COLS[2:]])
    table = buf.getvalue().encode("utf-8"); (out / "step20-b6-holdout-table.csv").write_bytes(table)

    def block(items):
        res = {}
        for h in horizons:
            deltas = [r[f"delta_{h}h"] for r in items]; st = stats(deltas)
            res[f"{h}h"] = {"n": sum(1 for d in deltas if d != NA), "notAvailable": sum(1 for d in deltas if d == NA), "error_alpha0.002": stats([r[f"error_A_{h}h"] for r in items]), "error_alpha0": stats([r[f"error_B_{h}h"] for r in items]),
                            "delta": {"median_delta": st["median"], "mean_delta": st["mean"], "min_delta": st["min"], "max_delta": st["max"]}, **wins(deltas, tol)}
        res["M1_endpoint72h"] = {"alpha0.002": stats([r["endpoint_A_72h"] for r in items]), "alpha0": stats([r["endpoint_B_72h"] for r in items])}
        res["M2_totalPath"] = {"alpha0.002": stats([r["path_A"] for r in items]), "alpha0": stats([r["path_B"] for r in items])}
        res["M4_separation72h"] = stats([r["A_B_separation_72h"] for r in items]); res["M5_observed72h"] = stats([r["observed_72h"] for r in items]); res["n"] = len(items)
        return res
    overall = block(rows)
    per_unit = {wid: {**block([r for r in rows if r["unit"] == wid]), "smallN": True, "label": "SMALL-N / DESCRIPTIVE ONLY"} for wid in modeled_units}
    top = {f"{h}h": [{"drifter_id": r["drifter_id"], "unit": r["unit"], "error_alpha0.002": r3(r[f"error_A_{h}h"]), "error_alpha0": r3(r[f"error_B_{h}h"]), "delta": r3(r[f"delta_{h}h"])}
                     for r in sorted([r for r in rows if r[f"error_A_{h}h"] != NA], key=lambda r: -r[f"error_A_{h}h"])[:3]] for h in horizons}
    sign = {}
    for h in horizons:
        o = overall[f"{h}h"]
        sign[f"{h}h"] = {"label": "EXPLORATORY / NOMINAL / DESCRIPTIVE ONLY", **sign_test(o["wins_alpha0.002"], o["losses_alpha0.002"]), "ties_excluded": o["ties"], "computedOn": "overall n=12 only (STEP 20 §11: n >= 10); units not tested",
                         "caveat": "pairs are not independent (shared window forcing/time; same region/year); nominal only; not an acceptance criterion"}
    summary = {"ruleId": p20["ruleId"], "phase": "B-6.3 HOLDOUT EVALUATION (revised KE holdout)", "comparison": {"selected": A_ALPHA, "baseline": B_ALPHA}, "horizons": horizons, "tieToleranceKm": tol,
               "holdout": {"preregistered": 13, "evaluable": 12, "unavailable": 1, "evaluated": len(rows), "KE-H2": {"status": "FORCING_UNAVAILABLE", "n": 1, "missingSourceFrame": "2010-08-18T12:00:00Z", "interpolation": False, "substitution": False, "modelRun": False}, "AG": "HOLDOUT_UNAVAILABLE"},
               "overall": overall, "perUnit": per_unit, "topErrors": top, "exploratorySignTest": sign, "independenceNote": p20["inferencePolicy"]["acknowledged"], "outlierPolicyApplied": {"removed": 0, "winsorized": 0, "trimmed": 0, "weighted": 0},
               "acceptanceThresholds": "NONE", "alphaReselection": False, "interpretation": "NONE"}
    (out / "step20-b6-holdout-summary.json").write_bytes((json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    evaluation = {"schemaVersion": "1.0", "ruleId": p20["ruleId"], "phase": "B-6.3", "status": "EVALUATION_COMPLETE", "lockCommit": "155995dd", "alphaLockCommit": "73fafffb", "b3Commit": "9113e8b5", "b5Commit": "c395a098",
                  "holdoutManifestSha256": sha(MANIFEST), "gateSha256": m["gateSha256"], "gateStatus": m["gateStatus"], "step20PreregistrationSha256": LOCKED[PREREG20], "selectedAlphaArtifactSha256": LOCKED[ROOT / "docs/research/step20-selected-alpha.json"],
                  "observationSha256": p20["immutabilityCheck"]["observationSha256"], "inputFileShas": input_shas, "perDrifter": [{k: (v if k in ("drifter_id", "unit") else r3(v)) for k, v in r.items()} for r in rows],
                  "summary": summary, "tableSha256": hashlib.sha256(table).hexdigest(), "summarySha256": sha(out / "step20-b6-holdout-summary.json"), "tool": {"file": "tools/research/evaluate_step20_b6_holdout.py", "sha256": sha(__file__)},
                  "gitHead": subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip(), "createdAtUTC": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                  "deterministic": True, "randomSeed": None, "positionalToleranceInM3": None, "interpretation": "NONE"}
    (out / "step20-b6-holdout-evaluation.json").write_bytes((json.dumps(evaluation, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({"status": "EVALUATION_COMPLETE", "evaluated": len(rows), "tableSha256": evaluation["tableSha256"], "summarySha256": evaluation["summarySha256"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
