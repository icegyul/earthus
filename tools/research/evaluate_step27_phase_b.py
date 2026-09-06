"""STEP 27 Phase B evaluation — depth sensitivity. Per drifter: M3 at 24/48/72 h (haversine R = 6371008.8 m, exact UTC) for D05, D10,
D15, D20; delta_depth = E_depth - E_D15 (negative = alternative depth lower error) for D05/D10/D20 vs D15, tie 1e-6 km; M1 endpoint 72 h,
M2 path length, M4 separation vs D15 at 24/48/72 h, M5 observed 72 h. Strata: overall / calibration / holdout / per window (small-n
descriptive). Sign test descriptive only (n >= 10). Labels per the locked Phase B rule (descriptive; no selection). D15 errors are
cross-checked against the STEP 25C paired table (error_G002). Deterministic; `--out DIR` for the independent re-run."""
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
RULE, PBLOCK, RUNS = D / "step27-depth-rule.json", D / "step27-phase-b-preregistration.json", D / "step27-depth-manifest.json"
TABLE25C = D / "step25c-paired-table.csv"
RADIUS_M = 6371008.8
NA = "NOT_AVAILABLE"
DEPTHS = ("D05", "D10", "D15", "D20")
ALT = ("D05", "D10", "D20")
COLS = ["drifter_id", "unit", "role"] + [f"error_{d}_{h}h" for h in (24, 48, 72) for d in DEPTHS] + [f"delta_{d}_{h}h" for h in (24, 48, 72) for d in ALT] + [f"endpoint_{d}_72h" for d in DEPTHS] + [f"path_{d}" for d in DEPTHS] + [f"sep_{d}_D15_{h}h" for d in ALT for h in (24, 48, 72)] + ["observed_72h"]


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
    dd = [v for v in deltas if v != NA]
    return {"wins_alt": sum(1 for v in dd if v < -tol), "losses_alt": sum(1 for v in dd if v > tol), "ties": sum(1 for v in dd if abs(v) <= tol), "winMeaning": "alternative depth lower error than D15"}


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


def pair_label(b, tol, frac):
    med, w, l = b["delta"]["median_delta"], b["wins_alt"], b["losses_alt"]
    if med is None or w + l == 0 or abs(med) <= tol:
        return "NO_CLEAR_DEPTH-SPECIFIC_DIFFERENCE", "none"
    direction = "alternative depth lower error" if med < 0 else "D15 lower error"
    return ("DEPTH-SPECIFIC_DIFFERENCE_OBSERVED" if (w if med < 0 else l) / (w + l) >= frac else "NO_CLEAR_DEPTH-SPECIFIC_DIFFERENCE"), direction


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else D
    out.mkdir(parents=True, exist_ok=True)
    R = load(RULE); pb = load(PBLOCK); runs = load(RUNS)
    if runs["ruleSha256"] != sha(RULE) or pb["ruleSha256"] != sha(RULE) or runs["phaseBPreregistrationSha256"] != sha(PBLOCK):
        print(json.dumps({"status": "EVALUATION_BLOCKED_IMMUTABILITY"})); return 2
    if runs["status"] != "STEP27_RUNS_PASS" or not runs["d15Reproduction"]["pass"]:
        print(json.dumps({"status": "EVALUATION_BLOCKED", "reason": runs["status"]})); return 1
    tol = R["metrics"]["tieToleranceKm"]; horizons = R["metrics"]["M3"]["horizonsHours"]; lr = pb["labelRules"]
    model = {}; input_shas = []
    for r in sorted(runs["runs"], key=lambda r: (r["windowId"], r["depth"])):
        actual = sha(ROOT / r["trajectoriesFile"]); input_shas.append({"window": r["windowId"], "depth": r["depth"], "file": r["trajectoriesFile"], "expected": r["trajectoriesSha256"], "actual": actual, "verified": actual == r["trajectoriesSha256"]})
        for did, pts in positions(ROOT / r["trajectoriesFile"]).items():
            model.setdefault((r["windowId"], did), {})[r["depth"]] = pts
    if not all(x["verified"] for x in input_shas) or len(input_shas) != 24:
        print(json.dumps({"status": "EVALUATION_BLOCKED_RESULT_INTEGRITY"})); return 1
    ref25c = {}
    with open(TABLE25C, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            ref25c[(row["unit"], row["drifter_id"])] = row
    rows = []; xcheck = []
    for w in pb["windows"]:
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
                for dep in DEPTHS:
                    pos = mm.get(dep, {}).get(ts[h]); ob = o.get(ts[h]); rec[f"error_{dep}_{h}h"] = haversine_km(*pos, *ob) if pos and ob else NA
                for dep in ALT:
                    e, e15 = rec[f"error_{dep}_{h}h"], rec[f"error_D15_{h}h"]; rec[f"delta_{dep}_{h}h"] = e - e15 if NA not in (e, e15) else NA
                    pa, pb_ = mm.get(dep, {}).get(ts[h]), mm.get("D15", {}).get(ts[h]); rec[f"sep_{dep}_D15_{h}h"] = haversine_km(*pa, *pb_) if pa and pb_ else NA
                pub = ref25c.get((wid, did), {}).get(f"error_G002_{h}h"); mine = rec[f"error_D15_{h}h"]
                xcheck.append({"unit": wid, "drifter_id": did, "horizon": h, "step27_D15": r3(mine), "step25c_G002": pub, "agree": (pub == NA and mine == NA) or (pub not in (None, NA) and mine != NA and abs(round(mine, 3) - float(pub)) <= 0.001)})
            for dep in DEPTHS:
                pts = mm.get(dep, {}); order = sorted(pts)
                rec[f"endpoint_{dep}_72h"] = haversine_km(*release[did], *pts[ts[72]]) if ts[72] in pts else NA
                rec[f"path_{dep}"] = sum(haversine_km(*pts[a], *pts[b]) for a, b in zip(order, order[1:])) if len(order) > 1 else NA
            rec["observed_72h"] = haversine_km(*release[did], *o[ts[72]]) if ts[72] in o and w["t0"] in o else NA
            rows.append(rec)
    rows.sort(key=lambda r: (r["unit"], r["drifter_id"]))
    buf = io.StringIO(newline=""); wr = csv.writer(buf, lineterminator="\n"); wr.writerow(COLS)
    for rec in rows:
        wr.writerow([rec["drifter_id"], rec["unit"], rec["role"]] + [r3(rec[c]) for c in COLS[3:]])
    table = buf.getvalue().encode("utf-8"); (out / "step27-depth-paired-table.csv").write_bytes(table)

    def block(items):
        res = {"n_drifters": len(items)}
        for h in horizons:
            res[f"{h}h"] = {"error": {dep: stats([r[f"error_{dep}_{h}h"] for r in items]) for dep in DEPTHS}, "NOT_AVAILABLE": {dep: sum(1 for r in items if r[f"error_{dep}_{h}h"] == NA) for dep in DEPTHS}}
            for dep in ALT:
                dd = [r[f"delta_{dep}_{h}h"] for r in items]; st = stats(dd)
                res[f"{h}h"][f"{dep}_vs_D15"] = {"n": sum(1 for v in dd if v != NA), "notAvailable": sum(1 for v in dd if v == NA), "delta": {"median_delta": st["median"], "mean_delta": st["mean"], "min_delta": st["min"], "max_delta": st["max"]}, **wins(dd, tol), "separation_km": stats([r[f"sep_{dep}_D15_{h}h"] for r in items])}
        res["M1_endpoint72h"] = {dep: stats([r[f"endpoint_{dep}_72h"] for r in items]) for dep in DEPTHS}
        res["M2_totalPath"] = {dep: stats([r[f"path_{dep}"] for r in items]) for dep in DEPTHS}
        res["M4_separation72h_vs_D15"] = {dep: stats([r[f"sep_{dep}_D15_72h"] for r in items]) for dep in ALT}
        res["M5_observed72h"] = stats([r["observed_72h"] for r in items])
        return res
    strata = {"overall": block(rows), "calibration": block([r for r in rows if r["role"] == "CALIBRATION"]), "holdout": block([r for r in rows if r["role"] == "HOLDOUT"])}
    per_window = {w["windowId"]: {**block([r for r in rows if r["unit"] == w["windowId"]]), "role": w["role"], "smallN": True, "label": "SMALL-N / DESCRIPTIVE ONLY" + (" (n=1: values only)" if w["drifterCount"] == 1 else "")} for w in pb["windows"]}
    sign = {}
    for name, b in strata.items():
        for h in horizons:
            for dep in ALT:
                o = b[f"{h}h"][f"{dep}_vs_D15"]
                if o["n"] >= lr["signTestMinimumN"]:
                    sign[f"{name}_{h}h_{dep}_vs_D15"] = {"label": "EXPLORATORY / NOMINAL / DESCRIPTIVE ONLY", **sign_test(o["wins_alt"], o["losses_alt"]), "ties_excluded": o["ties"], "caveat": "pairs share window forcing/time; not independent; not a selection criterion"}
    H = f"{lr['primaryHorizonHours']}h"
    pair_labels = {name: {dep: dict(zip(("label", "direction"), pair_label(b[H][f"{dep}_vs_D15"], tol, lr["consistencyFraction"]))) for dep in ALT} for name, b in strata.items()}
    overall_label = {name: ("DEPTH_SENSITIVITY_OBSERVED" if any(v["label"] == "DEPTH-SPECIFIC_DIFFERENCE_OBSERVED" for v in pl.values()) else "NO_CLEAR_DEPTH_SENSITIVITY") for name, pl in pair_labels.items()}
    top = {f"{h}h": [{"drifter_id": r["drifter_id"], "unit": r["unit"], **{f"error_{dep}": r3(r[f"error_{dep}_{h}h"]) for dep in DEPTHS}} for r in sorted([r for r in rows if r[f"error_D15_{h}h"] != NA], key=lambda r: (-r[f"error_D15_{h}h"], r["drifter_id"]))[:3]] for h in horizons}
    summary = {"ruleId": R["ruleId"], "phase": "B", "status": "STEP27_COMPLETE", "alpha": 0.002, "horizons": horizons, "tieToleranceKm": tol, "control": "D15",
               "depths": {dep: {"targetLabelMeters": pb["depths"][dep]["targetMeters"], "nativeDepthMeters": pb["depths"][dep]["nativeLevelMeters"], "runs": runs["depthRuns"][dep], "labelNote": "target label only; the model used the exact native level"} for dep in DEPTHS},
               "d15Reproduction": runs["d15Reproduction"], "windows": [w["windowId"] for w in pb["windows"]], "KE-H2": "EXCLUDED (immutable STEP 20 HYCOM baseline unavailable); no paired result", "AG_holdout": "UNAVAILABLE",
               "strata": strata, "perWindow": per_window, "topErrors_D15": top, "exploratorySignTest": sign, "step25cCrossCheck": {"pairsCompared": len(xcheck), "agreeWithinRounding": sum(1 for x in xcheck if x["agree"]), "allAgree": all(x["agree"] for x in xcheck)},
               "labelRules": lr, "descriptiveLabel": {"primary": overall_label["overall"], "byStratum": overall_label, "pairs": pair_labels},
               "fairness": {"onlyIntentionalDifference": "native ocean velocity depth", "identical": ["GLORYS product", "spatial grid", "daily frames and labels", "NCEP-R2 wind", "alpha 0.002", "release positions/times", "drifter IDs", "computation areas", "RK4 300 s", "output 900 s", "interpolation", "observations", "metrics"]},
               "outlierPolicyApplied": {"removed": 0, "trimmed": 0, "winsorized": 0, "weighted": 0, "deleted": 0, "postHocExclusions": 0}, "acceptanceThresholds": "NONE", "depthSelection": "NONE", "preferredOperationalDepth": "NONE", "holdoutUsedForSelection": False, "reranking": False,
               "interpretation": "DESCRIPTIVE ONLY", "statements": pb["requiredStatements"]}
    (out / "step27-depth-execution-summary.json").write_bytes((json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    evaluation = {"schemaVersion": "1.0", "ruleId": R["ruleId"], "phase": "B", "status": "EVALUATION_COMPLETE", "ruleSha256": sha(RULE), "phaseBPreregistrationSha256": sha(PBLOCK), "runManifestSha256": sha(RUNS), "observationSha256": pb["observationSha256"],
                  "inputFileShas": input_shas, "perDrifter": [{k: (v if k in ("drifter_id", "unit", "role") else r3(v)) for k, v in r.items()} for r in rows], "step25cCrossCheck": xcheck, "summary": summary,
                  "tableSha256": hashlib.sha256(table).hexdigest(), "summarySha256": sha(out / "step27-depth-execution-summary.json"), "tool": {"file": "tools/research/evaluate_step27_phase_b.py", "sha256": sha(__file__)}, "deterministic": True, "randomSeed": None, "positionalToleranceInM3": None}
    (out / "step27-depth-evaluation.json").write_bytes((json.dumps(evaluation, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({"status": "EVALUATION_COMPLETE", "drifters": len(rows), "label": overall_label["overall"], "pairs": {k: v["label"] for k, v in pair_labels["overall"].items()}, "step25cAgree": all(x["agree"] for x in xcheck)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
