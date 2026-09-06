"""STEP 19 Phase B: independent paired A/B evaluation of the STEP 18b trajectories, exactly as preregistered in
docs/research/step19-preregistration.json (LOCKED). Recomputes every metric from the trajectory CSVs and the STEP 15
observation files; never reads the STEP 18b manifest metric values except to report agreement. No RNG, no plots,
no thresholds, no interpretation. `--out DIR` writes to another directory (used for the reproducibility re-run)."""
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
PROTO = ROOT / "docs/research/step19-evaluation-protocol.md"
PREREG = ROOT / "docs/research/step19-preregistration.json"
RULE_FILE = ROOT / "docs/research/step19-evaluation-rule-sha256.txt"
LOCKED = {PROTO: "920475967d4dd1a0b10a9f96f10c83291f92df767e906c50b0973e82b9af52b3", PREREG: "02e73093bbcf44a89c26887d7cddcc243c01ae37c45b30f789ee04838bac14dd",
          RULE_FILE: "ce3d466bb4ba973a797ca6de5044491c90699f6c66ff6113ab7d44a4f561599d",
          ROOT / "docs/research/step18b-model-manifest.json": "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe",
          ROOT / "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
RADIUS_M = 6371008.8
NA = "NOT_AVAILABLE"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


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
    return {"A_wins": sum(1 for x in d if x < -tol), "B_wins": sum(1 for x in d if x > tol), "ties": sum(1 for x in d if abs(x) <= tol)}


def sign_test(a, b):
    n = a + b
    if n == 0:
        return {"n": 0, "p": None}
    k = min(a, b)
    p = min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n)
    return {"n": n, "k": k, "p": round(p, 6)}


def r3(x):
    return NA if x == NA else round(x, 3)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else ROOT / "docs/research"
    out.mkdir(parents=True, exist_ok=True)
    prereg = load(PREREG)
    for path, expected in LOCKED.items():
        if sha(path) != expected:
            print(json.dumps({"status": "EVALUATION_BLOCKED_IMMUTABILITY", "file": str(path.relative_to(ROOT))})); return 2
    manifest = load(ROOT / "docs/research/step18b-model-manifest.json")
    input_shas = []
    for run in prereg["inputs"]["trajectoryRuns"]:
        for key, fkey in (("trajectoriesSha256", "trajectoriesFile"), ("resultSha256", "resultFile")):
            actual = sha(ROOT / run[fkey]); input_shas.append({"file": run[fkey], "expected": run[key], "actual": actual, "verified": actual == run[key]})
    if not all(x["verified"] for x in input_shas):
        result = {"ruleId": prereg["ruleId"], "status": "EVALUATION_BLOCKED_RESULT_INTEGRITY", "inputFileShas": input_shas}
        (out / "step19-evaluation.json").write_bytes((json.dumps(result, ensure_ascii=False, indent=2) + "\n").encode("utf-8")); print(json.dumps({"status": result["status"]})); return 1
    cohort = load(ROOT / "docs/research/cohort-step16.json")
    horizons = prereg["design"]["horizonsHours"]; tol = prereg["primaryError"]["tieToleranceKm"]
    alpha_of = {"A": prereg["design"]["primaryComparison"]["A"]["alpha"], "B": prereg["design"]["primaryComparison"]["B"]["alpha"]}
    run_of = {"A": prereg["design"]["primaryComparison"]["A"]["runId"], "B": prereg["design"]["primaryComparison"]["B"]["runId"]}
    # model positions (valid rows only) per (unit, drifter, run)
    model = {}
    for run in prereg["inputs"]["trajectoryRuns"]:
        label = "A" if run["alpha"] == alpha_of["A"] else "B"
        with open(ROOT / run["trajectoriesFile"], encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                if row["valid"] == "true":
                    model.setdefault((run["windowId"], row["drifter_id"]), {}).setdefault(label, {})[row["timestamp"]] = (float(row["lon"]), float(row["lat"]))
    # observations
    units = {u["windowId"]: u for u in load(ROOT / "docs/research/step18b-preregistration.json")["runUnits"]}
    rows, per_drifter = [], []
    for wid, unit in units.items():
        t0 = datetime.strptime(unit["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc); t1 = t0 + timedelta(hours=72)
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
        window = next(w for w in cohort["selectedWindowDetails"][unit["region"]] if f"{unit['region']}-{w['order']}" == wid)
        release = {d["drifterId"]: (d["startLon"], d["startLat"]) for d in window["drifters"] if d["drifterId"] in unit["drifterIds"]}
        for did in sorted(unit["drifterIds"]):
            m = model.get((wid, did), {}); o = obs.get(did, {})
            rec = {"drifter_id": did, "unit": wid}
            for h in horizons:
                for lab in ("A", "B"):
                    pos = m.get(lab, {}).get(ts[h]); ob = o.get(ts[h])
                    rec[f"error_{lab}_{h}h"] = haversine_km(*pos, *ob) if pos and ob else NA
                ea, eb = rec[f"error_A_{h}h"], rec[f"error_B_{h}h"]
                rec[f"delta_{h}h"] = ea - eb if NA not in (ea, eb) else NA
            for lab in ("A", "B"):
                pts = m.get(lab, {}); order = sorted(pts)
                rec[f"endpoint_{lab}_72h"] = haversine_km(*release[did], *pts[ts[72]]) if ts[72] in pts else NA
                rec[f"path_{lab}"] = sum(haversine_km(*pts[a], *pts[b]) for a, b in zip(order, order[1:])) if len(order) > 1 else NA
            pa, pb = m.get("A", {}).get(ts[72]), m.get("B", {}).get(ts[72])
            rec["A_B_separation_72h"] = haversine_km(*pa, *pb) if pa and pb else NA
            rec["observed_72h"] = haversine_km(*release[did], *o[ts[72]]) if ts[72] in o and unit["t0"] in o else NA
            per_drifter.append(rec)
    per_drifter.sort(key=lambda r: r["drifter_id"])
    cols = prereg["pairedTable"]["columns"]
    buf = io.StringIO(newline=""); w = csv.writer(buf, lineterminator="\n"); w.writerow(cols)
    for rec in per_drifter:
        w.writerow([rec["drifter_id"], rec["unit"]] + [r3(rec[c]) for c in cols[2:]])
    table_bytes = buf.getvalue().encode("utf-8"); (out / "step19-paired-table.csv").write_bytes(table_bytes)

    def block(items):
        res = {}
        for h in horizons:
            deltas = [r[f"delta_{h}h"] for r in items]
            res[f"{h}h"] = {"n": sum(1 for d in deltas if d != NA), "notAvailable": sum(1 for d in deltas if d == NA),
                            "error_A": stats([r[f"error_A_{h}h"] for r in items]), "error_B": stats([r[f"error_B_{h}h"] for r in items]),
                            "delta": {k.replace("median", "median_delta").replace("mean", "mean_delta").replace("min", "min_delta").replace("max", "max_delta") if k != "n" else "n": v for k, v in stats(deltas).items()},
                            **wins(deltas, tol)}
        res["M1_endpoint72h"] = {"A": stats([r["endpoint_A_72h"] for r in items]), "B": stats([r["endpoint_B_72h"] for r in items])}
        res["M2_totalPath"] = {"A": stats([r["path_A"] for r in items]), "B": stats([r["path_B"] for r in items])}
        res["M4_separation72h"] = stats([r["A_B_separation_72h"] for r in items])
        res["M5_observed72h"] = stats([r["observed_72h"] for r in items])
        return res
    overall = block(per_drifter)
    per_unit = {}
    for wid in units:
        items = [r for r in per_drifter if r["unit"] == wid]; b = block(items)
        per_unit[wid] = {"n": len(items), **{f"{h}h": {"n": b[f"{h}h"]["n"], "median_A": b[f"{h}h"]["error_A"]["median"], "median_B": b[f"{h}h"]["error_B"]["median"], "median_delta": b[f"{h}h"]["delta"]["median_delta"],
                                                        "A_wins": b[f"{h}h"]["A_wins"], "B_wins": b[f"{h}h"]["B_wins"], "ties": b[f"{h}h"]["ties"]} for h in horizons},
                         "M1_endpoint72h": b["M1_endpoint72h"], "M2_totalPath": b["M2_totalPath"], "M4_separation72h": b["M4_separation72h"], "M5_observed72h": b["M5_observed72h"]}
    top = {f"{h}h": [{"drifter_id": r["drifter_id"], "unit": r["unit"], "error_A": r3(r[f"error_A_{h}h"]), "error_B": r3(r[f"error_B_{h}h"]), "delta": r3(r[f"delta_{h}h"])}
                     for r in sorted([r for r in per_drifter if r[f"error_A_{h}h"] != NA], key=lambda r: -r[f"error_A_{h}h"])[:prereg["outlierPolicy"]["influenceReport"]["topErrorsPerHorizon"]]] for h in horizons}
    loo = []
    for rec in per_drifter:
        rest = [r for r in per_drifter if r["drifter_id"] != rec["drifter_id"]]
        row = {"leftOut": rec["drifter_id"], "unit": rec["unit"]}
        for h in horizons:
            deltas = [r[f"delta_{h}h"] for r in rest]; row[f"{h}h"] = {"median_delta": stats(deltas)["median"], **wins(deltas, tol)}
        loo.append(row)
    sign = {f"{h}h": {"label": "EXPLORATORY", **sign_test(overall[f"{h}h"]["A_wins"], overall[f"{h}h"]["B_wins"]), "ties_excluded": overall[f"{h}h"]["ties"],
                      "caveat": prereg["inference"]["exploratory"]["caveat"], "threshold": None} for h in horizons}
    # consistency with STEP 18b manifest (report only)
    mt = {(d["windowId"], d["drifterId"]): d for d in manifest["metrics"]["perDrifter"]}; ctol = prereg["secondaryMetrics"]["manifestConsistencyToleranceKm"]; incons = []
    for rec in per_drifter:
        d = mt[(rec["unit"], rec["drifter_id"])]
        pairs = [("M1_A", rec["endpoint_A_72h"], d["runs"]["0.0007"]["M1_endpoint72hKm"]), ("M1_B", rec["endpoint_B_72h"], d["runs"]["0.0"]["M1_endpoint72hKm"]),
                 ("M2_A", rec["path_A"], d["runs"]["0.0007"]["M2_totalPathKm"]), ("M2_B", rec["path_B"], d["runs"]["0.0"]["M2_totalPathKm"]),
                 ("M4_72", rec["A_B_separation_72h"], d["M4_alphaEffect"]["separationKm"]["72"]), ("M5", rec["observed_72h"], d["M5_observed72hKm"])]
        pairs += [(f"M3_{lab}_{h}", rec[f"error_{lab}_{h}h"], d["runs"]["0.0007" if lab == "A" else "0.0"]["M3_positionErrorKm"][str(h)]) for h in horizons for lab in ("A", "B")]
        for name, mine, theirs in pairs:
            if mine == NA or theirs == NA or abs(mine - theirs) > ctol:
                incons.append({"drifter_id": rec["drifter_id"], "metric": name, "recomputed": r3(mine), "manifest": theirs})
    summary = {"ruleId": prereg["ruleId"], "pairCount": len(per_drifter), "independenceNote": prereg["design"]["independence"], "horizons": horizons, "tieToleranceKm": tol,
               "overall": overall, "perUnit": per_unit, "topErrors": top, "exploratorySignTest": sign, "manifestConsistency": {"toleranceKm": ctol, "checked": len(per_drifter) * 12, "inconsistent": incons},
               "acceptanceThresholds": "NONE", "interpretation": "NONE"}
    (out / "step19-summary.json").write_bytes((json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    evaluation = {"schemaVersion": "1.0", "ruleId": prereg["ruleId"], "status": "EVALUATION_COMPLETE", "protocolSha256": sha(PROTO), "preregistrationSha256": sha(PREREG), "evaluationRuleSha256": sha(RULE_FILE),
                  "step18bManifestSha256": LOCKED[ROOT / "docs/research/step18b-model-manifest.json"], "cohortSha256": LOCKED[ROOT / "docs/research/cohort-step16.json"],
                  "observationSha256": prereg["immutabilityCheck"]["observationSha256"], "inputFileShas": input_shas,
                  "comparison": {"A": {"runId": run_of["A"], "alpha": alpha_of["A"]}, "B": {"runId": run_of["B"], "alpha": alpha_of["B"]}}, "horizons": horizons,
                  "pairs": {"total": len(per_drifter), "notAvailable": {f"{h}h": overall[f"{h}h"]["notAvailable"] for h in horizons}},
                  "summary": {"overall": overall, "perUnit": per_unit}, "paired": per_drifter and [{k: r3(v) if k not in ("drifter_id", "unit") else v for k, v in r.items()} for r in per_drifter],
                  "topErrors": top, "leaveOneOut": loo, "manifestConsistency": summary["manifestConsistency"], "exploratorySignTest": sign,
                  "outlierPolicyApplied": {"removed": 0, "winsorized": 0, "trimmed": 0, "replaced": 0}, "interpretation": "NONE", "acceptanceThresholds": "NONE",
                  "tableSha256": hashlib.sha256(table_bytes).hexdigest(), "summarySha256": sha(out / "step19-summary.json"), "tool": {"file": "tools/research/evaluate_step19.py", "sha256": sha(__file__)},
                  "gitHead": subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip(),
                  "createdAtUTC": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "deterministic": True, "randomSeed": None}
    (out / "step19-evaluation.json").write_bytes((json.dumps(evaluation, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({"status": "EVALUATION_COMPLETE", "tableSha256": evaluation["tableSha256"], "summarySha256": evaluation["summarySha256"], "inconsistent": len(incons)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
