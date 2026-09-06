"""STEP 26 Phase B evaluation — Comparison 2 (C GLORYS_NATIVE_DAILY vs D GLORYS_COARSE_DAILY, delta_spatial = E_C - E_D) and
Comparison 4 (A HYCOM_NATIVE_3H immutable STEP 20 alpha 0.002 vs C, delta_product = E_C - E_A), exactly per the locked STEP 26 rule
file and Phase B preregistration (label rules). M3 at 24/48/72 h exact UTC (haversine R = 6371008.8 m), tie 1e-6 km; M1/M2/M4/M5
secondary; strata overall / calibration / holdout / per window; descriptive sign test n >= 10. Comparison 4 deltas are cross-checked
against the STEP 25C paired table (must agree within 0.001 km rounding). Comparisons 1 and 3 recorded BLOCKED. No outlier handling,
no exclusion. Deterministic; `--out DIR` for the independent re-run."""
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
RULE, PBLOCK, RUNS, DERIVED = D / "step26-forcing-decomposition-rule.json", D / "step26-phase-b-preregistration.json", D / "step26-forcing-decomposition-manifest.json", D / "step26-derived-forcing-manifest.json"
TABLE25C = D / "step25c-paired-table.csv"
RADIUS_M = 6371008.8
NA = "NOT_AVAILABLE"
LABELS = ("A", "C", "D")
COLS = ["drifter_id", "unit", "role"] + [f"{k}_{h}h" for h in (24, 48, 72) for k in ("error_A", "error_C", "error_D", "delta_spatial", "delta_product")] + \
       ["endpoint_A_72h", "endpoint_C_72h", "endpoint_D_72h", "path_A", "path_C", "path_D", "M4_C_D_sep72h", "M4_C_A_sep72h", "observed_72h"]


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


def wins(deltas, tol, x, y):
    d = [v for v in deltas if v != NA]
    return {f"wins_{x}": sum(1 for v in d if v < -tol), f"losses_{x}": sum(1 for v in d if v > tol), "ties": sum(1 for v in d if abs(v) <= tol), "winMeaning": f"{x} lower error than {y}"}


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


def label2(b72, tol, frac):
    med, w, l = b72["delta"]["median_delta"], b72["wins_C"], b72["losses_C"]
    if med is None or w + l == 0 or abs(med) <= tol:
        return "NO_CLEAR_SPATIAL_REPRESENTATION_DIFFERENCE", "none"
    direction = "native lower error" if med < 0 else "coarse lower error"
    if (w if med < 0 else l) / (w + l) >= frac:
        return "SPATIAL_REPRESENTATION_DIFFERENCE_OBSERVED", direction
    return "NO_CLEAR_SPATIAL_REPRESENTATION_DIFFERENCE", direction


def label4(b72, tol, frac):
    med, w, l = b72["delta"]["median_delta"], b72["wins_C"], b72["losses_C"]
    if med is None or w + l == 0:
        return "NO_CLEAR_DESCRIPTIVE_DIFFERENCE"
    if med < -tol and w / (w + l) >= frac:
        return "GLORYS_DESCRIPTIVELY_FAVORED"
    if med > tol and l / (w + l) >= frac:
        return "HYCOM_DESCRIPTIVELY_FAVORED"
    return "NO_CLEAR_DESCRIPTIVE_DIFFERENCE"


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else D
    out.mkdir(parents=True, exist_ok=True)
    R = load(RULE); pb = load(PBLOCK); runs = load(RUNS); dm = load(DERIVED)
    if runs["ruleSha256"] != sha(RULE) or pb["ruleSha256"] != sha(RULE) or runs["phaseBPreregistrationSha256"] != sha(PBLOCK):
        print(json.dumps({"status": "EVALUATION_BLOCKED_IMMUTABILITY"})); return 2
    if runs["status"] != "STEP26_RUNS_PASS" or not runs["conditionCReproduction"]["pass"]:
        print(json.dumps({"status": "EVALUATION_BLOCKED", "reason": runs["status"]})); return 1
    tol = R["metrics"]["tieToleranceKm"]; horizons = R["metrics"]["M3"]["horizonsHours"]; lr = pb["labelRules"]
    files = {}
    for r in runs["runs"]:
        files[(r["windowId"], r["condition"])] = (r["trajectoriesFile"], r["trajectoriesSha256"])
    for w in R["windows"]:
        files[(w["windowId"], "A")] = (w["hycomReference"]["file"], w["hycomReference"]["sha256"])
    model = {}; input_shas = []
    for (wid, lab), (rel, expected) in sorted(files.items()):
        actual = sha(ROOT / rel); input_shas.append({"window": wid, "condition": lab, "file": rel, "expected": expected, "actual": actual, "verified": actual == expected})
        for did, pts in positions(ROOT / rel).items():
            model.setdefault((wid, did), {})[lab] = pts
    if not all(x["verified"] for x in input_shas) or len(input_shas) != 18:
        print(json.dumps({"status": "EVALUATION_BLOCKED_RESULT_INTEGRITY"})); return 1
    ref25c = {}
    with open(TABLE25C, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            ref25c[(row["unit"], row["drifter_id"])] = row
    rows = []; xcheck = []
    for w in R["windows"]:
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
                for lab in LABELS:
                    pos = mm.get(lab, {}).get(ts[h]); ob = o.get(ts[h]); rec[f"error_{lab}_{h}h"] = haversine_km(*pos, *ob) if pos and ob else NA
                ec, ed, ea = rec[f"error_C_{h}h"], rec[f"error_D_{h}h"], rec[f"error_A_{h}h"]
                rec[f"delta_spatial_{h}h"] = ec - ed if NA not in (ec, ed) else NA
                rec[f"delta_product_{h}h"] = ec - ea if NA not in (ec, ea) else NA
                pub = ref25c.get((wid, did), {}).get(f"delta_{h}h"); mine = rec[f"delta_product_{h}h"]
                xcheck.append({"unit": wid, "drifter_id": did, "horizon": h, "step26": r3(mine), "step25c": pub, "agree": (pub == NA and mine == NA) or (pub not in (None, NA) and mine != NA and abs(round(mine, 3) - float(pub)) <= 0.001)})
            for lab in LABELS:
                pts = mm.get(lab, {}); order = sorted(pts)
                rec[f"endpoint_{lab}_72h"] = haversine_km(*release[did], *pts[ts[72]]) if ts[72] in pts else NA
                rec[f"path_{lab}"] = sum(haversine_km(*pts[a], *pts[b]) for a, b in zip(order, order[1:])) if len(order) > 1 else NA
            for key, a, b in (("M4_C_D_sep72h", "C", "D"), ("M4_C_A_sep72h", "C", "A")):
                pa, pbb = mm.get(a, {}).get(ts[72]), mm.get(b, {}).get(ts[72]); rec[key] = haversine_km(*pa, *pbb) if pa and pbb else NA
            rec["observed_72h"] = haversine_km(*release[did], *o[ts[72]]) if ts[72] in o and w["t0"] in o else NA
            rows.append(rec)
    rows.sort(key=lambda r: (r["unit"], r["drifter_id"]))
    buf = io.StringIO(newline=""); wr = csv.writer(buf, lineterminator="\n"); wr.writerow(COLS)
    for rec in rows:
        wr.writerow([rec["drifter_id"], rec["unit"], rec["role"]] + [r3(rec[c]) for c in COLS[3:]])
    table = buf.getvalue().encode("utf-8"); (out / "step26-paired-table.csv").write_bytes(table)

    def block(items):
        res = {"n_drifters": len(items)}
        for h in horizons:
            ds, dp = [r[f"delta_spatial_{h}h"] for r in items], [r[f"delta_product_{h}h"] for r in items]; ss, sp = stats(ds), stats(dp)
            res[f"{h}h"] = {"error_A_HYCOM_NATIVE_3H": stats([r[f"error_A_{h}h"] for r in items]), "error_C_GLORYS_NATIVE_DAILY": stats([r[f"error_C_{h}h"] for r in items]), "error_D_GLORYS_COARSE_DAILY": stats([r[f"error_D_{h}h"] for r in items]),
                            "NOT_AVAILABLE": {lab: sum(1 for r in items if r[f"error_{lab}_{h}h"] == NA) for lab in LABELS},
                            "comparison2_C_vs_D": {"n": sum(1 for v in ds if v != NA), "notAvailable": sum(1 for v in ds if v == NA), "delta": {"median_delta": ss["median"], "mean_delta": ss["mean"], "min_delta": ss["min"], "max_delta": ss["max"]}, **wins(ds, tol, "C", "D")},
                            "comparison4_C_vs_A": {"n": sum(1 for v in dp if v != NA), "notAvailable": sum(1 for v in dp if v == NA), "delta": {"median_delta": sp["median"], "mean_delta": sp["mean"], "min_delta": sp["min"], "max_delta": sp["max"]}, **wins(dp, tol, "C", "A")}}
        res["M1_endpoint72h"] = {lab: stats([r[f"endpoint_{lab}_72h"] for r in items]) for lab in LABELS}
        res["M2_totalPath"] = {lab: stats([r[f"path_{lab}"] for r in items]) for lab in LABELS}
        res["M4_separation72h"] = {"C_vs_D": stats([r["M4_C_D_sep72h"] for r in items]), "C_vs_A": stats([r["M4_C_A_sep72h"] for r in items])}
        res["M5_observed72h"] = stats([r["observed_72h"] for r in items])
        return res
    strata = {"overall": block(rows), "calibration": block([r for r in rows if r["role"] == "CALIBRATION"]), "holdout": block([r for r in rows if r["role"] == "HOLDOUT"])}
    per_window = {w["windowId"]: {**block([r for r in rows if r["unit"] == w["windowId"]]), "role": w["role"], "smallN": True, "label": "SMALL-N / DESCRIPTIVE ONLY"} for w in R["windows"]}
    sign = {}
    for name, b in strata.items():
        for h in horizons:
            for comp in ("comparison2_C_vs_D", "comparison4_C_vs_A"):
                o = b[f"{h}h"][comp]
                if o["n"] >= lr["signTestMinimumN"]:
                    sign[f"{name}_{h}h_{comp}"] = {"label": "EXPLORATORY / NOMINAL / DESCRIPTIVE ONLY", **sign_test(o["wins_C"], o["losses_C"]), "ties_excluded": o["ties"], "caveat": "pairs share window forcing/time; not independent; not an acceptance criterion"}
    H = f"{lr['primaryHorizonHours']}h"
    lab2 = {name: label2(b[H]["comparison2_C_vs_D"], tol, lr["consistencyFraction"]) for name, b in strata.items()}
    lab4 = {name: label4(b[H]["comparison4_C_vs_A"], tol, lr["consistencyFraction"]) for name, b in strata.items()}
    top = {f"{h}h": [{"drifter_id": r["drifter_id"], "unit": r["unit"], "error_A": r3(r[f"error_A_{h}h"]), "error_C": r3(r[f"error_C_{h}h"]), "error_D": r3(r[f"error_D_{h}h"])} for r in sorted([r for r in rows if r[f"error_C_{h}h"] != NA], key=lambda r: (-r[f"error_C_{h}h"], r["drifter_id"]))[:3]] for h in horizons}
    summary = {"ruleId": R["ruleId"], "phase": "B", "status": "STEP26_COMPLETE", "alpha": 0.002, "horizons": horizons, "tieToleranceKm": tol,
               "conditions": {"A": {"name": "HYCOM_NATIVE_3H", "role": "REFERENCE ONLY (immutable STEP 20 alpha 0.002)", "newRuns": 0, "depthMeters": 15.0}, "B": {"name": "HYCOM_DAILY", "status": "BLOCKED", "reason": "HYCOM daily forcing cannot be derived: the native 3-hour source frames are incomplete for the complete registered windows (two complete UTC days per window; five required); no re-acquisition in Phase B"},
                              "C": {"name": "GLORYS_NATIVE_DAILY", "runs": runs["conditionRuns"]["C"], "depthMeters": 15.81007, "reproductionAgainstStep25C": runs["conditionCReproduction"]["pass"]}, "D": {"name": "GLORYS_COARSE_DAILY", "runs": runs["conditionRuns"]["D"], "depthMeters": 15.81007, "derivation": "bilinear onto the immutable HYCOM grid (glorys-to-hycom-grid-bilinear/1)"}},
               "depthAudit": {"hycomDepthMeters": "15.000 m", "glorysDepthMeters": "15.810070 m", "depthDifferenceMeters": "0.810070 m", "identicalDepthForcing": False, "attributedInStep26": False, "note": "confound remains in Comparison 4; Comparison 2 is depth-matched (both GLORYS 15.810070 m)"},
               "comparisons": {"1": {"name": "HYCOM_NATIVE_3H vs HYCOM_DAILY", "status": "BLOCKED", "reason": "HYCOM daily forcing cannot be derived because the required native 3-hour source frames are incomplete for the complete registered windows"}, "2": {"name": "GLORYS_NATIVE_DAILY vs GLORYS_COARSE_DAILY", "status": "EVALUATED", "delta": "E_C - E_D (km); negative = native lower error", "onlyIntentionalDifference": "native 1/12 degree GLORYS grid vs bilinear HYCOM-grid (0.08 degree) representation of the same GLORYS fields; wind, alpha, depth, cadence, labels, mechanics identical"},
                               "3": {"name": "HYCOM_DAILY vs GLORYS_COARSE_DAILY", "status": "BLOCKED", "reason": "depends on HYCOM_DAILY"}, "4": {"name": "HYCOM_NATIVE_3H vs GLORYS_NATIVE_DAILY", "status": "EVALUATED", "delta": "E_C - E_A (km); negative = GLORYS lower error", "differences": "ocean forcing product, cadence (3 h vs daily mean) and native depth (15.000 vs 15.810070 m) identity as defined in STEP 26; not a pure spatial or temporal test", "reproducesStep25C": all(x["agree"] for x in xcheck)}},
               "strata": strata, "perWindow": per_window, "topErrors_C": top, "exploratorySignTest": sign, "step25cCrossCheck": {"pairsCompared": len(xcheck), "agreeWithinRounding": sum(1 for x in xcheck if x["agree"]), "allAgree": all(x["agree"] for x in xcheck)},
               "labelRules": lr, "descriptiveLabel": {"comparison2": {"primary": lab2["overall"][0], "direction": lab2["overall"][1], "byStratum": {k: {"label": v[0], "direction": v[1]} for k, v in lab2.items()}}, "comparison4": {"primary": lab4["overall"], "byStratum": lab4}},
               "KE-H2": "EXCLUDED (immutable STEP 20 HYCOM baseline unavailable); GLORYS coverage recorded in STEP 25B only; no paired result", "AG_holdout": "UNAVAILABLE",
               "outlierPolicyApplied": {"removed": 0, "trimmed": 0, "winsorized": 0, "weighted": 0, "deleted": 0, "manualExclusions": 0}, "acceptanceThresholds": "NONE", "parameterSelection": "NONE", "modelSelection": "NONE", "hycomRerun": False, "conditionBExecuted": False,
               "interpretation": "DESCRIPTIVE ONLY", "statements": pb["requiredStatements"]}
    (out / "step26-phase-b-summary.json").write_bytes((json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    evaluation = {"schemaVersion": "1.0", "ruleId": R["ruleId"], "phase": "B", "status": "EVALUATION_COMPLETE", "ruleSha256": sha(RULE), "phaseBPreregistrationSha256": sha(PBLOCK), "runManifestSha256": sha(RUNS), "derivedForcingManifestSha256": sha(DERIVED), "observationSha256": pb["observationSha256"],
                  "inputFileShas": input_shas, "perDrifter": [{k: (v if k in ("drifter_id", "unit", "role") else r3(v)) for k, v in r.items()} for r in rows], "step25cCrossCheck": xcheck, "summary": summary,
                  "tableSha256": hashlib.sha256(table).hexdigest(), "summarySha256": sha(out / "step26-phase-b-summary.json"), "tool": {"file": "tools/research/evaluate_step26_phase_b.py", "sha256": sha(__file__)}, "deterministic": True, "randomSeed": None, "positionalToleranceInM3": None}
    (out / "step26-evaluation.json").write_bytes((json.dumps(evaluation, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({"status": "EVALUATION_COMPLETE", "drifters": len(rows), "comparison2": lab2["overall"], "comparison4": lab4["overall"], "step25cAgree": all(x["agree"] for x in xcheck)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
