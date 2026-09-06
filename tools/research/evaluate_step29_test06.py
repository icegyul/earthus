"""STEP 29 Phase B evaluation — TEST-06 paired analysis. Per drifter: M3 at 24/48/72 h (haversine R = 6371008.8 m, exact UTC) for control
and treatment at alpha 0.002 (primary) and alpha 0 (structural); delta_Stokes = E_treatment - E_control (negative = Stokes treatment lower
error), tie 1e-6 km; M1 endpoint 72 h, M2 path length, M4 72 h control-treatment separation, M5 observed 72 h; Stokes contribution =
treatment-control trajectory separation at 24/48/72 h (paired trajectories). Strata overall / calibration / holdout / per window (small-n
descriptive). Descriptive sign test (n >= 10). Labels per the locked Phase B rule (overall 72 h, primary alpha 0.002). Control errors are
cross-checked descriptively against the STEP 25C GLORYS table (not a gate). No outlier handling. Deterministic; `--out DIR` for the re-run."""
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
PBLOCK, RUNS, P25C, TABLE25C = D / "step29-phase-b-preregistration.json", D / "step29-stokes-manifest.json", D / "step25c-test02-protocol.json", D / "step25c-paired-table.csv"
RADIUS_M = 6371008.8
NA = "NOT_AVAILABLE"
CONDS = ("C002", "T002", "C0", "T0")
COLS = ["drifter_id", "unit", "role"] + [f"error_{c}_{h}h" for h in (24, 48, 72) for c in CONDS] + [f"delta_{h}h" for h in (24, 48, 72)] + [f"deltaS_{h}h" for h in (24, 48, 72)] + [f"endpoint_{c}_72h" for c in CONDS] + [f"path_{c}" for c in CONDS] + [f"sep_T002_C002_{h}h" for h in (24, 48, 72)] + [f"sep_T0_C0_{h}h" for h in (24, 48, 72)] + ["observed_72h"]


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
    return {"wins_stokes": sum(1 for x in d if x < -tol), "losses_stokes": sum(1 for x in d if x > tol), "ties": sum(1 for x in d if abs(x) <= tol), "winMeaning": "Stokes treatment lower error than control"}


def sign_test(a, b):
    n = a + b
    if n == 0:
        return {"n": 0, "p": None}
    k = min(a, b)
    return {"n": n, "k": k, "p": round(min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n), 6)}


def r3(x):
    return NA if x == NA else round(x, 3)


def positions(path):
    out = {}
    with open(path, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            if row["valid"] == "true":
                out.setdefault(row["drifter_id"], {})[row["timestamp"]] = (float(row["lon"]), float(row["lat"]))
    return out


def label(b, tol, frac):
    med, w, l = b["delta"]["median_delta"], b["wins_stokes"], b["losses_stokes"]
    if med is None or w + l == 0:
        return "NO_CLEAR_STOKES_DIFFERENCE"
    if med < -tol and w / (w + l) >= frac:
        return "STOKES_DESCRIPTIVELY_FAVORED"
    if med > tol and l / (w + l) >= frac:
        return "STOKES_DESCRIPTIVELY_DISFAVORED"
    return "NO_CLEAR_STOKES_DIFFERENCE"


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else D
    out.mkdir(parents=True, exist_ok=True)
    pb = load(PBLOCK); runs = load(RUNS); p25 = load(P25C)
    if runs["phaseBPreregistrationSha256"] != sha(PBLOCK):
        print(json.dumps({"status": "EVALUATION_BLOCKED_IMMUTABILITY"})); return 2
    if runs["status"] != "STEP29_RUNS_PASS":
        print(json.dumps({"status": "EVALUATION_BLOCKED", "reason": runs["status"]})); return 1
    tol = pb["labelRules"]["tieToleranceKm"]; horizons = [24, 48, 72]; lr = pb["labelRules"]
    key = {("control", 0.002): "C002", ("treatment", 0.002): "T002", ("control", 0.0): "C0", ("treatment", 0.0): "T0"}
    model = {}; input_shas = []
    for r in sorted(runs["runs"], key=lambda r: (r["windowId"], r["condition"], r["alpha"])):
        actual = sha(ROOT / r["trajectoriesFile"]); input_shas.append({"window": r["windowId"], "run": key[(r["condition"], r["alpha"])], "file": r["trajectoriesFile"], "expected": r["trajectoriesSha256"], "actual": actual, "verified": actual == r["trajectoriesSha256"]})
        for did, pts in positions(ROOT / r["trajectoriesFile"]).items():
            model.setdefault((r["windowId"], did), {})[key[(r["condition"], r["alpha"])]] = pts
    if not all(x["verified"] for x in input_shas) or len(input_shas) != 24:
        print(json.dumps({"status": "EVALUATION_BLOCKED_RESULT_INTEGRITY"})); return 1
    ref = {}
    with open(TABLE25C, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            ref[(row["unit"], row["drifter_id"])] = row
    rows = []; xcheck = []
    for w in p25["windows"]:
        wid = w["windowId"]; t0 = datetime.strptime(w["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc); t1 = t0 + timedelta(hours=72)
        ts = {h: (t0 + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ") for h in horizons}
        obs = {}
        for path in sorted((ROOT / "data/research/step15/noaa-gdp-hourly-qc").glob(f"{w['region']}-{w['t0'][:4]}-q*.csv")):
            with open(path, encoding="utf-8", newline="") as fh:
                reader = csv.reader(fh); next(reader); next(reader)
                for r in reader:
                    if r[0] in w["drifterIds"]:
                        t = datetime.strptime(r[1], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                        if t0 <= t <= t1:
                            obs.setdefault(r[0], {})[r[1]] = (float(r[3]), float(r[2]))
        release = {d["drifterId"]: (d["lon"], d["lat"]) for d in w["releasePositions"]}
        for did in sorted(w["drifterIds"]):
            mm = model.get((wid, did), {}); o = obs.get(did, {}); rec = {"drifter_id": did, "unit": wid, "role": w["role"]}
            for h in horizons:
                for c in CONDS:
                    pos = mm.get(c, {}).get(ts[h]); ob = o.get(ts[h]); rec[f"error_{c}_{h}h"] = haversine_km(*pos, *ob) if pos and ob else NA
                et, ec = rec[f"error_T002_{h}h"], rec[f"error_C002_{h}h"]; rec[f"delta_{h}h"] = et - ec if NA not in (et, ec) else NA
                et0, ec0 = rec[f"error_T0_{h}h"], rec[f"error_C0_{h}h"]; rec[f"deltaS_{h}h"] = et0 - ec0 if NA not in (et0, ec0) else NA
                for a, b, name in (("T002", "C002", "sep_T002_C002"), ("T0", "C0", "sep_T0_C0")):
                    pa, pbb = mm.get(a, {}).get(ts[h]), mm.get(b, {}).get(ts[h]); rec[f"{name}_{h}h"] = haversine_km(*pa, *pbb) if pa and pbb else NA
                pub = ref.get((wid, did), {}).get(f"error_G002_{h}h"); mine = rec[f"error_C002_{h}h"]
                xcheck.append({"unit": wid, "drifter_id": did, "horizon": h, "control_C002": r3(mine), "step25c_G002": pub, "absDiffKm": r3(abs(mine - float(pub))) if mine != NA and pub not in (None, NA) else NA})
            for c in CONDS:
                pts = mm.get(c, {}); order = sorted(pts)
                rec[f"endpoint_{c}_72h"] = haversine_km(*release[did], *pts[ts[72]]) if ts[72] in pts else NA
                rec[f"path_{c}"] = sum(haversine_km(*pts[a], *pts[b]) for a, b in zip(order, order[1:])) if len(order) > 1 else NA
            rec["observed_72h"] = haversine_km(*release[did], *o[ts[72]]) if ts[72] in o and w["t0"] in o else NA
            rows.append(rec)
    rows.sort(key=lambda r: (r["unit"], r["drifter_id"]))
    buf = io.StringIO(newline=""); wr = csv.writer(buf, lineterminator="\n"); wr.writerow(COLS)
    for rec in rows:
        wr.writerow([rec["drifter_id"], rec["unit"], rec["role"]] + [r3(rec[c]) for c in COLS[3:]])
    table = buf.getvalue().encode("utf-8"); (out / "step29-stokes-paired-table.csv").write_bytes(table)

    def block(items):
        res = {"n_drifters": len(items)}
        for h in horizons:
            d = [r[f"delta_{h}h"] for r in items]; ds = [r[f"deltaS_{h}h"] for r in items]; st, sts = stats(d), stats(ds)
            res[f"{h}h"] = {"primary_alpha0.002": {"n": sum(1 for x in d if x != NA), "notAvailable": sum(1 for x in d if x == NA), "error_control": stats([r[f"error_C002_{h}h"] for r in items]), "error_treatment": stats([r[f"error_T002_{h}h"] for r in items]), "delta": {"median_delta": st["median"], "mean_delta": st["mean"], "min_delta": st["min"], "max_delta": st["max"]}, **wins(d, tol)},
                            "structural_alpha0": {"n": sum(1 for x in ds if x != NA), "notAvailable": sum(1 for x in ds if x == NA), "error_control": stats([r[f"error_C0_{h}h"] for r in items]), "error_treatment": stats([r[f"error_T0_{h}h"] for r in items]), "delta": {"median_delta": sts["median"], "mean_delta": sts["mean"], "min_delta": sts["min"], "max_delta": sts["max"]}, **wins(ds, tol)},
                            "stokesContribution_separationKm": {"alpha0.002": stats([r[f"sep_T002_C002_{h}h"] for r in items]), "alpha0": stats([r[f"sep_T0_C0_{h}h"] for r in items])}}
        res["M1_endpoint72h"] = {c: stats([r[f"endpoint_{c}_72h"] for r in items]) for c in CONDS}
        res["M2_totalPath"] = {c: stats([r[f"path_{c}"] for r in items]) for c in CONDS}
        res["M4_separation72h"] = {"treatment_vs_control_alpha0.002": stats([r["sep_T002_C002_72h"] for r in items]), "treatment_vs_control_alpha0": stats([r["sep_T0_C0_72h"] for r in items])}
        res["M5_observed72h"] = stats([r["observed_72h"] for r in items])
        return res
    strata = {"overall": block(rows), "calibration": block([r for r in rows if r["role"] == "CALIBRATION"]), "holdout": block([r for r in rows if r["role"] == "HOLDOUT"])}
    per_window = {w["windowId"]: {**block([r for r in rows if r["unit"] == w["windowId"]]), "role": w["role"], "smallN": True, "label": "SMALL-N / DESCRIPTIVE ONLY" + (" (n=1: values only)" if w["drifterCount"] == 1 else "")} for w in p25["windows"]}
    sign = {}
    for name, b in strata.items():
        for h in horizons:
            for k in ("primary_alpha0.002", "structural_alpha0"):
                o = b[f"{h}h"][k]
                if o["n"] >= lr["signTestMinimumN"]:
                    sign[f"{name}_{h}h_{k}"] = {"label": "EXPLORATORY / NOMINAL / DESCRIPTIVE ONLY", **sign_test(o["wins_stokes"], o["losses_stokes"]), "ties_excluded": o["ties"], "caveat": "pairs share window forcing/time; not independent; not a selection criterion"}
    H = f"{lr['primaryHorizonHours']}h"
    labels = {name: label(b[H]["primary_alpha0.002"], tol, lr["consistencyFraction"]) for name, b in strata.items()}
    labels_struct = {name: label(b[H]["structural_alpha0"], tol, lr["consistencyFraction"]) for name, b in strata.items()}
    top = {f"{h}h": [{"drifter_id": r["drifter_id"], "unit": r["unit"], "error_control": r3(r[f"error_C002_{h}h"]), "error_treatment": r3(r[f"error_T002_{h}h"]), "delta": r3(r[f"delta_{h}h"])} for r in sorted([r for r in rows if r[f"error_T002_{h}h"] != NA], key=lambda r: (-r[f"error_T002_{h}h"], r["drifter_id"]))[:3]] for h in horizons}
    xdiff = [x["absDiffKm"] for x in xcheck if x["absDiffKm"] != NA]
    summary = {"ruleId": runs["ruleId"], "test": "TEST-06", "phase": "B", "status": "STEP29_COMPLETE", "control": runs["equationControl"], "treatment": runs["equationTreatment"], "stokesCoefficient": 1.0, "alphaPrimary": 0.002, "alphaStructural": 0.0, "horizons": horizons, "tieToleranceKm": tol, "deltaDefinition": "error_treatment - error_control (km); negative = Stokes treatment lower error",
               "windows": [w["windowId"] for w in p25["windows"]], "KE-H2": "coverage fact only; not paired (frozen STEP 20 pairing)", "AG_holdout": "UNAVAILABLE", "strata": strata, "perWindow": per_window, "topErrors": top, "exploratorySignTest": sign,
               "step25cControlCrossCheck": {"pairsCompared": len(xdiff), "maxAbsDiffKm": r3(max(xdiff)) if xdiff else NA, "medianAbsDiffKm": stats(xdiff)["median"] if xdiff else NA, "note": "control uses the composite 3-hourly time axis and composite mask; differences vs the STEP 25C GLORYS run are recorded descriptively, not gated"},
               "labelRules": lr, "descriptiveLabel": {"primary": labels["overall"], "byStratum": labels, "structural_alpha0": labels_struct}, "outlierPolicyApplied": {"removed": 0, "trimmed": 0, "winsorized": 0, "weighted": 0, "deleted": 0, "postHocExclusions": 0}, "acceptanceThresholds": "NONE", "coefficientSelection": "NONE", "alphaSelection": "NONE", "forcingSelection": "NONE", "holdoutUsedForSelection": False,
               "interpretation": "DESCRIPTIVE ONLY", "physicalExplanationClaimed": False, "statements": pb["requiredStatements"]}
    (out / "step29-stokes-summary.json").write_bytes((json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    evaluation = {"schemaVersion": "1.0", "ruleId": runs["ruleId"], "phase": "B", "status": "EVALUATION_COMPLETE", "phaseBPreregistrationSha256": sha(PBLOCK), "runManifestSha256": sha(RUNS), "observationSha256": pb["observationSha256"], "inputFileShas": input_shas, "perDrifter": [{k: (v if k in ("drifter_id", "unit", "role") else r3(v)) for k, v in r.items()} for r in rows], "step25cControlCrossCheck": xcheck, "summary": summary,
                  "tableSha256": hashlib.sha256(table).hexdigest(), "summarySha256": sha(out / "step29-stokes-summary.json"), "tool": {"file": "tools/research/evaluate_step29_test06.py", "sha256": sha(__file__)}, "deterministic": True, "randomSeed": None, "positionalToleranceInM3": None}
    (out / "step29-stokes-evaluation.json").write_bytes((json.dumps(evaluation, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({"status": "EVALUATION_COMPLETE", "drifters": len(rows), "label": labels["overall"], "structural": labels_struct["overall"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
