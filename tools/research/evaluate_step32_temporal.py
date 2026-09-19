"""STEP 32 Phase B — B4/B7 temporal forcing evaluation (descriptive). Per drifter of the eight new-holdout windows: M3 (haversine
R = 6371008.8 m) at exact UTC t0+24/48/72 h for A = HYCOM_NATIVE_3H and B = HYCOM_DAILY against the STEP 15 observations (exact
drifter_id + exact timestamp; no interpolation), delta = E_HYCOM_DAILY - E_HYCOM_NATIVE_3H (km), tie 1e-6 km; M1 endpoint 72 h (both),
M2 path length (both), M4 A-B trajectory separation at 24/48/72 h, M5 observed 72 h displacement. Strata: overall (new holdout) and per
window (clusters); no independence assumption. Label per the locked STEP 30A-form rule registered in the STEP 32 matrix (overall 72 h
median sign + 2/3 consistency of non-tied pairs): NATIVE_3H_DESCRIPTIVELY_FAVORED / DAILY_DESCRIPTIVELY_FAVORED /
NO_CLEAR_TEMPORAL_DIFFERENCE. No operational winner, no outlier handling, no exclusion. Deterministic; `--out DIR` for an independent run."""
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
MATRIX, RUNS = D / "step32-temporal-experiment-matrix.json", D / "step32-temporal-run-manifest.json"
OBS_DIR = ROOT / "data/research/step15/noaa-gdp-hourly-qc"
OUT = {"table": "step32-temporal-paired-table.csv", "evaluation": "step32-temporal-evaluation.json", "summary": "step32-temporal-summary.json"}
RADIUS_M = 6371008.8; NA = "NOT_AVAILABLE"; H = (24, 48, 72); TOL = 1e-6
COLS = ["drifter_id", "unit", "role"] + [f"{k}_{h}h" for h in H for k in ("error_A_3H", "error_B_DAILY", "delta", "sep_B_A")] + ["endpoint_A_72h", "endpoint_B_72h", "path_A", "path_B", "observed_72h"]
LABELS = {"A": "NATIVE_3H_DESCRIPTIVELY_FAVORED", "B": "DAILY_DESCRIPTIVELY_FAVORED", "C": "NO_CLEAR_TEMPORAL_DIFFERENCE"}


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


def stats(values):
    v = sorted(x for x in values if x is not None and x != NA)
    if not v:
        return {"n": 0, "median": None, "mean": None, "min": None, "max": None}
    mid = len(v) // 2
    return {"n": len(v), "median": round(v[mid] if len(v) % 2 else (v[mid - 1] + v[mid]) / 2, 3), "mean": round(sum(v) / len(v), 3), "min": round(v[0], 3), "max": round(v[-1], 3)}


def wlt(deltas):
    d = [x for x in deltas if x != NA]
    return {"wins_daily": sum(1 for x in d if x < -TOL), "losses_daily": sum(1 for x in d if x > TOL), "ties": sum(1 for x in d if abs(x) <= TOL), "winMeaning": "HYCOM_DAILY lower error than HYCOM_NATIVE_3H"}


def sign_test(w, l):
    n = w + l
    if n < 10:
        return {"n": n, "reported": False, "reason": "n < 10"}
    k = min(w, l); return {"n": n, "k": k, "p_nominal": round(min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n), 6), "reported": True, "role": "descriptive context only; drifters within a window are clustered"}


def label(b):
    med, w, l = b["delta"]["median"], b["wins_daily"], b["losses_daily"]
    if med is None or w + l == 0:
        return LABELS["C"]
    if med > TOL and l / (w + l) >= 2 / 3:
        return LABELS["A"]
    if med < -TOL and w / (w + l) >= 2 / 3:
        return LABELS["B"]
    return LABELS["C"]


def positions(path):
    out = {}
    with open(path, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            if row["valid"] == "true":
                out.setdefault(row["drifter_id"], {})[row["timestamp"]] = (float(row["lon"]), float(row["lat"]))
    return out


def block(rows):
    out = {"n_drifters": len(rows), "windows": sorted({r["unit"] for r in rows})}
    for h in H:
        paired = [r for r in rows if r[f"delta_{h}h"] != NA]; dl = [r[f"delta_{h}h"] for r in rows]
        b = {"n": len(paired), "notAvailable": len(rows) - len(paired), "error_A_3H": stats([r[f"error_A_3H_{h}h"] for r in paired]), "error_B_DAILY": stats([r[f"error_B_DAILY_{h}h"] for r in paired]), "delta": stats(dl)}
        b.update(wlt(dl)); b["signTest"] = sign_test(b["wins_daily"], b["losses_daily"]); b["M4_separation_B_A"] = stats([r[f"sep_B_A_{h}h"] for r in rows]); out[f"{h}h"] = b
    out["M1_endpoint72h"] = {"A_3H": stats([r["endpoint_A_72h"] for r in rows]), "B_DAILY": stats([r["endpoint_B_72h"] for r in rows])}
    out["M2_totalPath"] = {"A_3H": stats([r["path_A"] for r in rows]), "B_DAILY": stats([r["path_B"] for r in rows])}
    out["M4_separation72h"] = out["72h"]["M4_separation_B_A"]; out["M5_observed72h"] = stats([r["observed_72h"] for r in rows])
    return out


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else D
    out.mkdir(parents=True, exist_ok=True)
    M = load(MATRIX); R = load(RUNS)
    if R["experimentMatrixSha256"] != sha(MATRIX) or R["status"] != "STEP32_RUNS_PASS" or R["conditions"] != ["A", "B"]:
        print(json.dumps({"status": "EVALUATION_BLOCKED", "reason": R.get("status")})); return 2
    model = {}; inputs = []
    for r in R["runs"]:
        actual = sha(ROOT / r["trajectoriesFile"]); inputs.append({"runId": r["runId"], "window": r["windowId"], "condition": r["condition"], "file": r["trajectoriesFile"], "expected": r["trajectoriesSha256"], "actual": actual, "verified": actual == r["trajectoriesSha256"]})
        for did, pts in positions(ROOT / r["trajectoriesFile"]).items():
            model.setdefault((r["windowId"], did), {})[r["condition"]] = pts
    if not all(x["verified"] for x in inputs) or len(inputs) != 16:
        print(json.dumps({"status": "EVALUATION_BLOCKED_INPUT_INTEGRITY"})); return 2
    rows = []; obs_files = {}
    for w in M["windows"]:
        wid = w["windowId"]; t0 = datetime.strptime(w["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc); t1 = t0 + timedelta(hours=72)
        tsd = {h: (t0 + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ") for h in H}; obs = {}
        for path in sorted(OBS_DIR.glob(f"{w['region']}-{w['t0'][:4]}-q*.csv")):
            obs_files[str(path.relative_to(ROOT)).replace("\\", "/")] = sha(path)
            with open(path, encoding="utf-8", newline="") as fh:
                reader = csv.reader(fh); next(reader); next(reader)
                for r in reader:
                    if r[0] in w["drifterIds"]:
                        t = datetime.strptime(r[1], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                        if t0 <= t <= t1:
                            obs.setdefault(r[0], {})[r[1]] = (float(r[3]), float(r[2]))
        release = {d["drifterId"]: (d["lon"], d["lat"]) for d in w["releasePositions"]}
        for did in sorted(w["drifterIds"]):
            mm = model.get((wid, did), {}); o = obs.get(did, {}); rec = {"drifter_id": did, "unit": wid, "role": "NEW_HOLDOUT"}
            for h in H:
                pa, pb, ob = mm.get("A", {}).get(tsd[h]), mm.get("B", {}).get(tsd[h]), o.get(tsd[h])
                rec[f"error_A_3H_{h}h"] = hav(*pa, *ob) if pa and ob else NA; rec[f"error_B_DAILY_{h}h"] = hav(*pb, *ob) if pb and ob else NA
                rec[f"delta_{h}h"] = rec[f"error_B_DAILY_{h}h"] - rec[f"error_A_3H_{h}h"] if NA not in (rec[f"error_A_3H_{h}h"], rec[f"error_B_DAILY_{h}h"]) else NA
                rec[f"sep_B_A_{h}h"] = hav(*pa, *pb) if pa and pb else NA
            for c, tag in (("A", "A"), ("B", "B")):
                pts = mm.get(c, {}); order = sorted(pts)
                rec[f"endpoint_{tag}_72h"] = hav(*release[did], *pts[tsd[72]]) if tsd[72] in pts else NA
                rec[f"path_{tag}"] = sum(hav(*pts[a], *pts[b]) for a, b in zip(order, order[1:])) if len(order) > 1 else NA
            rec["observed_72h"] = hav(*release[did], *o[tsd[72]]) if tsd[72] in o and w["t0"] in o else NA
            rows.append(rec)
    rows.sort(key=lambda r: (r["unit"], r["drifter_id"]))
    buf = io.StringIO(newline=""); wr = csv.writer(buf, lineterminator="\n"); wr.writerow(COLS)
    for rec in rows:
        wr.writerow([rec["drifter_id"], rec["unit"], rec["role"]] + [r3(rec[c]) for c in COLS[3:]])
    (out / OUT["table"]).write_text(buf.getvalue(), encoding="utf-8")
    overall = block(rows); per_window = {w["windowId"]: block([r for r in rows if r["unit"] == w["windowId"]]) for w in M["windows"]}
    lab = label(overall["72h"]); window_labels = {k: label(v["72h"]) for k, v in per_window.items()}
    ov = overall["72h"]
    summary = {"ruleId": M["ruleId"], "phase": "B4/B7", "status": "STEP32_TEMPORAL_EVALUATED", "comparison": "B HYCOM_DAILY vs A HYCOM_NATIVE_3H (same source, grid, depth 15.000 m, wind, alpha 0.002, releases, mechanics; only ocean temporal representation differs)", "deltaDefinition": "error_HYCOM_DAILY - error_HYCOM_NATIVE_3H (km); negative = daily lower error", "alpha": 0.002, "depthMeters": 15.0, "stokes": "NONE",
               "windows": [w["windowId"] for w in M["windows"]], "n_drifters": len(rows), "tieToleranceKm": TOL, "overall": overall, "perWindow": per_window, "descriptiveLabel": {"overall72h": lab, "perWindow72h": window_labels, "rule": M["temporalTest"]["metrics"]["descriptiveLabelRule"]},
               "primary72h": {"n": ov["n"], "notAvailable": ov["notAvailable"], "A_3H_median": ov["error_A_3H"]["median"], "B_DAILY_median": ov["error_B_DAILY"]["median"], "delta_median": ov["delta"]["median"], "delta_mean": ov["delta"]["mean"], "wins_daily": ov["wins_daily"], "losses_daily": ov["losses_daily"], "ties": ov["ties"]},
               "clustering": "Drifters sharing a window, forcing period and release time are clustered; they are not independent samples. Per-window structure is reported; pooled counts are descriptive only.", "outlierPolicyApplied": {"removed": 0, "trimmed": 0, "winsorized": 0, "weighted": 0, "deleted": 0, "postHocExclusions": 0},
               "operationalWinner": False, "baselineModified": False, "candidateModified": False, "parameterSelection": "NONE", "interpretation": "DESCRIPTIVE ONLY",
               "statements": ["The temporal test compares two representations of the same HYCOM source; it declares no operational winner and changes neither the frozen baseline nor the candidate.", f"Overall 72 h: A median {ov['error_A_3H']['median']} km, B median {ov['error_B_DAILY']['median']} km, paired median delta {ov['delta']['median']} km, W/L/T (daily lower) {ov['wins_daily']}/{ov['losses_daily']}/{ov['ties']}, label {lab}.", "Drifters within one window are clustered and are not treated as independent samples; no statistical significance, generalization or causal claim is made."]}
    (out / OUT["summary"]).write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    evaluation = {"schemaVersion": "1.0", "ruleId": M["ruleId"], "phase": "B4/B7", "status": "EVALUATION_COMPLETE", "experimentMatrixSha256": sha(MATRIX), "runManifestSha256": sha(RUNS), "observationFiles": obs_files, "inputTrajectories": inputs, "pairing": "exact drifter_id and exact UTC timestamp; both conditions and the observation valid", "perDrifter": [{k: (v if k in ("drifter_id", "unit", "role") else r3(v)) for k, v in r.items()} for r in rows], "summary": summary, "tableSha256": sha(out / OUT["table"]), "summarySha256": sha(out / OUT["summary"])}
    (out / OUT["evaluation"]).write_text(json.dumps(evaluation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "STEP32_TEMPORAL_EVALUATED", "label": lab, "primary72h": summary["primary72h"]}, ensure_ascii=False)); return 0


if __name__ == "__main__":
    raise SystemExit(main())
