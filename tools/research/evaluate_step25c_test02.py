"""STEP 25C / TEST-02 paired evaluation — GLORYS12V1 (Model B) versus the frozen HYCOM baseline (Model A), exactly per the
LOCKED step25c-test02-protocol.json (STEP 19/20 metric definitions). Inputs: 12 GLORYS trajectory CSVs (SHA-verified against
step25c-run-manifest.json), the 12 STEP 20 HYCOM trajectory CSVs (SHA-verified against the STEP 20 manifests), STEP 15 observations.
M3 at 24/48/72 h exact UTC (haversine R = 6371008.8 m), delta = error_GLORYS - error_HYCOM at alpha 0.002 (primary) and alpha 0
(structural pair), tie 1e-6 km; M1/M2/M4/M5; strata overall / calibration / holdout / per window; descriptive sign test for n >= 10;
preregistered descriptive label only. No outlier handling, no exclusion, no threshold. Deterministic; `--out DIR` for the re-run."""
import csv
import hashlib
import io
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "docs/research/step25c-test02-protocol.json"
PREREG = ROOT / "docs/research/step25c-preregistration.json"
RUNS = ROOT / "docs/research/step25c-run-manifest.json"
CAL20 = ROOT / "docs/research/step20-calibration-manifest.json"
HOLD20 = ROOT / "docs/research/step20-b6-holdout-manifest.json"
TABLE_CAL20 = ROOT / "docs/research/step20-calibration-table.csv"
TABLE_HOLD20 = ROOT / "docs/research/step20-b6-holdout-table.csv"
RADIUS_M = 6371008.8
NA = "NOT_AVAILABLE"
LABELS = ("G002", "G0", "H002", "H0")
COLS = ["drifter_id", "unit", "role"] + [f"{k}_{h}h" for h in (24, 48, 72) for k in ("error_H002", "error_G002", "delta", "error_H0", "error_G0", "deltaS")] + \
       ["endpoint_G002_72h", "endpoint_G0_72h", "endpoint_H002_72h", "endpoint_H0_72h", "path_G002", "path_G0", "path_H002", "path_H0", "M4_G002_G0_sep72h", "M4_H002_H0_sep72h", "GH_sep72h_alpha0.002", "observed_72h"]


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
    return {"wins_GLORYS": sum(1 for x in d if x < -tol), "losses_GLORYS": sum(1 for x in d if x > tol), "ties": sum(1 for x in d if abs(x) <= tol)}


def sign_test(a, b):
    n = a + b
    if n == 0:
        return {"n": 0, "p": None}
    k = min(a, b)
    return {"n": n, "k": k, "p": round(min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n), 6)}


def r3(x):
    return NA if x == NA else round(x, 3)


def read_csv_positions(path):
    out = {}
    with open(path, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            if row["valid"] == "true":
                out.setdefault(row["drifter_id"], {})[row["timestamp"]] = (float(row["lon"]), float(row["lat"]))
    return out


def label(block72, tol, frac):
    med, w, l = block72["delta"]["median_delta"], block72["wins_GLORYS"], block72["losses_GLORYS"]
    if med is None or w + l == 0:
        return "NO CLEAR DESCRIPTIVE DIFFERENCE"
    if med < -tol and w / (w + l) >= frac:
        return "GLORYS DESCRIPTIVELY FAVORED"
    if med > tol and l / (w + l) >= frac:
        return "HYCOM DESCRIPTIVELY FAVORED"
    return "NO CLEAR DESCRIPTIVE DIFFERENCE"


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else ROOT / "docs/research"
    out.mkdir(parents=True, exist_ok=True)
    proto = load(PROTO); prereg = load(PREREG); runs = load(RUNS)
    if sha(PROTO) != prereg["protocolSha256"] or runs["protocolSha256"] != sha(PROTO):
        print(json.dumps({"status": "EVALUATION_BLOCKED_IMMUTABILITY"})); return 2
    if runs["status"] != "TEST02_RUNS_PASS":
        print(json.dumps({"status": "EVALUATION_BLOCKED", "reason": runs["status"]})); return 1
    tol = proto["comparison"]["tieToleranceKm"]; horizons = proto["comparison"]["horizonsHours"]; rule = proto["interpretationRule"]
    input_shas = []
    files = {}
    for r in runs["runs"]:
        lab = "G002" if float(r["alpha"]) == 0.002 else "G0"
        files[(r["windowId"], lab)] = (r["trajectoriesFile"], r["trajectoriesSha256"])
    for w in proto["windows"]:
        for a, lab in (("0.002", "H002"), ("0", "H0")):
            files[(w["windowId"], lab)] = (w["hycomBaseline"][a]["file"], w["hycomBaseline"][a]["sha256"])
    model = {}
    for (wid, lab), (rel, expected) in sorted(files.items()):
        actual = sha(ROOT / rel); input_shas.append({"window": wid, "model": lab, "file": rel, "expected": expected, "actual": actual, "verified": actual == expected})
        for did, pts in read_csv_positions(ROOT / rel).items():
            model.setdefault((wid, did), {})[lab] = pts
    if not all(x["verified"] for x in input_shas) or len(input_shas) != 24:
        print(json.dumps({"status": "EVALUATION_BLOCKED_RESULT_INTEGRITY"})); return 1
    # STEP 20 published tables (cross-check of the HYCOM baseline errors; never a source of values)
    ref = {}
    with open(TABLE_CAL20, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            ref[(row["unit"], row["drifter_id"])] = {f"H002_{h}": row[f"error_{h}h_alpha0.002"] for h in horizons} | {f"H0_{h}": row[f"error_{h}h_alpha0"] for h in horizons}
    with open(TABLE_HOLD20, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            ref[(row["unit"], row["drifter_id"])] = {f"H002_{h}": row[f"error_A_{h}h"] for h in horizons} | {f"H0_{h}": row[f"error_B_{h}h"] for h in horizons}
    rows = []; crosscheck = []
    for w in proto["windows"]:
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
                g, hy = rec[f"error_G002_{h}h"], rec[f"error_H002_{h}h"]; rec[f"delta_{h}h"] = g - hy if NA not in (g, hy) else NA
                g0, h0 = rec[f"error_G0_{h}h"], rec[f"error_H0_{h}h"]; rec[f"deltaS_{h}h"] = g0 - h0 if NA not in (g0, h0) else NA
                for lab in ("H002", "H0"):
                    mine, pub = rec[f"error_{lab}_{h}h"], ref.get((wid, did), {}).get(f"{lab}_{h}")
                    crosscheck.append({"unit": wid, "drifter_id": did, "model": lab, "horizon": h, "recomputed": r3(mine), "step20Table": pub, "agree": (pub == NA and mine == NA) or (pub not in (None, NA) and mine != NA and abs(round(mine, 3) - float(pub)) <= 0.001)})
            for lab in LABELS:
                pts = mm.get(lab, {}); order = sorted(pts)
                rec[f"endpoint_{lab}_72h"] = haversine_km(*release[did], *pts[ts[72]]) if ts[72] in pts else NA
                rec[f"path_{lab}"] = sum(haversine_km(*pts[a], *pts[b]) for a, b in zip(order, order[1:])) if len(order) > 1 else NA
            for key, a, b in (("M4_G002_G0_sep72h", "G002", "G0"), ("M4_H002_H0_sep72h", "H002", "H0"), ("GH_sep72h_alpha0.002", "G002", "H002")):
                pa, pb = mm.get(a, {}).get(ts[72]), mm.get(b, {}).get(ts[72]); rec[key] = haversine_km(*pa, *pb) if pa and pb else NA
            rec["observed_72h"] = haversine_km(*release[did], *o[ts[72]]) if ts[72] in o and w["t0"] in o else NA
            rows.append(rec)
    rows.sort(key=lambda r: (r["unit"], r["drifter_id"]))
    buf = io.StringIO(newline=""); wr = csv.writer(buf, lineterminator="\n"); wr.writerow(COLS)
    for rec in rows:
        wr.writerow([rec["drifter_id"], rec["unit"], rec["role"]] + [r3(rec[c]) for c in COLS[3:]])
    table = buf.getvalue().encode("utf-8"); (out / "step25c-paired-table.csv").write_bytes(table)

    def block(items):
        res = {"n_drifters": len(items)}
        for h in horizons:
            d = [r[f"delta_{h}h"] for r in items]; ds = [r[f"deltaS_{h}h"] for r in items]; st = stats(d); sts = stats(ds)
            res[f"{h}h"] = {"n": sum(1 for x in d if x != NA), "notAvailable": sum(1 for x in d if x == NA),
                            "error_GLORYS_alpha0.002": stats([r[f"error_G002_{h}h"] for r in items]), "error_HYCOM_alpha0.002": stats([r[f"error_H002_{h}h"] for r in items]),
                            "delta": {"median_delta": st["median"], "mean_delta": st["mean"], "min_delta": st["min"], "max_delta": st["max"]}, **wins(d, tol),
                            "structural_alpha0": {"n": sum(1 for x in ds if x != NA), "error_GLORYS_alpha0": stats([r[f"error_G0_{h}h"] for r in items]), "error_HYCOM_alpha0": stats([r[f"error_H0_{h}h"] for r in items]),
                                                  "delta": {"median_delta": sts["median"], "mean_delta": sts["mean"], "min_delta": sts["min"], "max_delta": sts["max"]}, **wins(ds, tol)}}
        res["M1_endpoint72h"] = {k: stats([r[f"endpoint_{k}_72h"] for r in items]) for k in LABELS}
        res["M2_totalPath"] = {k: stats([r[f"path_{k}"] for r in items]) for k in LABELS}
        res["M4_separation72h"] = {"GLORYS_alpha0.002_vs_alpha0": stats([r["M4_G002_G0_sep72h"] for r in items]), "HYCOM_alpha0.002_vs_alpha0": stats([r["M4_H002_H0_sep72h"] for r in items]), "GLORYS_vs_HYCOM_alpha0.002": stats([r["GH_sep72h_alpha0.002"] for r in items])}
        res["M5_observed72h"] = stats([r["observed_72h"] for r in items])
        return res
    strata = {"overall": block(rows), "calibration": block([r for r in rows if r["role"] == "CALIBRATION"]), "holdout": block([r for r in rows if r["role"] == "HOLDOUT"])}
    per_window = {w["windowId"]: {**block([r for r in rows if r["unit"] == w["windowId"]]), "role": w["role"], "smallN": True, "label": "SMALL-N / DESCRIPTIVE ONLY"} for w in proto["windows"]}
    sign = {}
    for name, b in strata.items():
        for h in horizons:
            o = b[f"{h}h"]
            if o["n"] >= rule["signTestMinimumN"]:
                sign[f"{name}_{h}h"] = {"label": "EXPLORATORY / NOMINAL / DESCRIPTIVE ONLY", **sign_test(o["wins_GLORYS"], o["losses_GLORYS"]), "ties_excluded": o["ties"], "caveat": "pairs share window forcing/time; not independent; not an acceptance criterion"}
    labels = {name: label(b[f"{rule['primaryHorizonHours']}h"], tol, rule["consistencyFraction"]) for name, b in strata.items()}
    top = {f"{h}h": [{"drifter_id": r["drifter_id"], "unit": r["unit"], "error_GLORYS": r3(r[f"error_G002_{h}h"]), "error_HYCOM": r3(r[f"error_H002_{h}h"]), "delta": r3(r[f"delta_{h}h"])}
                     for r in sorted([r for r in rows if r[f"error_G002_{h}h"] != NA], key=lambda r: (-r[f"error_G002_{h}h"], r["drifter_id"]))[:3]] for h in horizons}
    summary = {"ruleId": proto["ruleId"], "test": "TEST-02", "modelA": proto["modelA"]["name"], "modelB": proto["modelB"]["name"], "primaryAlpha": 0.002, "structuralAlpha": 0.0, "horizons": horizons, "tieToleranceKm": tol, "deltaDefinition": "error_GLORYS - error_HYCOM (km); negative = GLORYS lower error",
               "windows": [w["windowId"] for w in proto["windows"]], "KE-H2": "EXCLUDED (HYCOM FORCING_UNAVAILABLE in immutable STEP 20; GLORYS coverage fact only)", "AG_holdout": "UNAVAILABLE",
               "strata": strata, "perWindow": per_window, "topErrors": top, "exploratorySignTest": sign, "hycomCrossCheck": {"pairsCompared": len(crosscheck), "agreeWithinRounding": sum(1 for c in crosscheck if c["agree"]), "allAgree": all(c["agree"] for c in crosscheck)},
               "interpretationRule": rule, "descriptiveLabel": {"primary": labels["overall"], "byStratum": labels},
               "outlierPolicyApplied": {"removed": 0, "winsorized": 0, "trimmed": 0, "weighted": 0, "postHocExclusions": 0}, "acceptanceThresholds": "NONE", "alphaReselection": False, "hycomRerun": False,
               "statements": proto["requiredStatements"]}
    (out / "step25c-summary.json").write_bytes((json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    evaluation = {"schemaVersion": "1.0", "ruleId": proto["ruleId"], "status": "EVALUATION_COMPLETE", "protocolSha256": sha(PROTO), "runManifestSha256": sha(RUNS), "observationSha256": proto["inputs"]["observationSha256"],
                  "inputFileShas": input_shas, "perDrifter": [{k: (v if k in ("drifter_id", "unit", "role") else r3(v)) for k, v in r.items()} for r in rows], "hycomCrossCheck": crosscheck, "summary": summary,
                  "tableSha256": hashlib.sha256(table).hexdigest(), "summarySha256": sha(out / "step25c-summary.json"), "tool": {"file": "tools/research/evaluate_step25c_test02.py", "sha256": sha(__file__)},
                  "deterministic": True, "randomSeed": None, "positionalToleranceInM3": None}
    (out / "step25c-evaluation.json").write_bytes((json.dumps(evaluation, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({"status": "EVALUATION_COMPLETE", "drifters": len(rows), "label": labels["overall"], "tableSha256": evaluation["tableSha256"][:16]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
