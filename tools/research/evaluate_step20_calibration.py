"""STEP 20 Phase B-1: calibration evaluation and alpha selection under the LOCKED STEP 20 rule (§6–§7, §10–§12).
Reads only the calibration trajectory CSVs (SHA-verified against docs/research/step20-calibration-manifest.json), the STEP 15
observations and the STEP 16 cohort. Never opens holdout data. Selection uses ONLY the 72h → 48h → 24h M3 median hierarchy
→ smaller alpha (tie 1e-6 km). Mean/M1/M2/M4/M5 are descriptive. `--out DIR` for the reproducibility re-run."""
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
PREREG = ROOT / "docs/research/step20-preregistration.json"
PROTO = ROOT / "docs/research/step20-generalization-protocol.md"
RULE_FILE = ROOT / "docs/research/step20-selection-rule-sha256.txt"
CAL_MANIFEST = ROOT / "docs/research/step20-calibration-manifest.json"
LOCKED = {PROTO: "65b004589570e7e409201e82c9388b17ec53002c4b31282112056d005baabb00", PREREG: "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4",
          RULE_FILE: "5d980be74fbeb752160143c2e44ecb6611f01f21e94ea528908fc5867d9b46d7", ROOT / "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
RADIUS_M = 6371008.8
NA = "NOT_AVAILABLE"
HOLDOUT_TOKENS = ("KE-H", "holdout")


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


def median_full(v):
    v = sorted(v); mid = len(v) // 2
    return (v[mid] if len(v) % 2 else (v[mid - 1] + v[mid]) / 2) if v else None


def stats(values):
    v = sorted(x for x in values if x is not None and x != NA)
    if not v:
        return {"n": 0, "median": None, "mean": None, "min": None, "max": None}
    return {"n": len(v), "median": round(median_full(v), 3), "mean": round(sum(v) / len(v), 3), "min": round(v[0], 3), "max": round(v[-1], 3)}


def r3(x):
    return NA if x == NA else round(x, 3)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else ROOT / "docs/research"
    out.mkdir(parents=True, exist_ok=True)
    for path, expected in LOCKED.items():
        if sha(path) != expected:
            print(json.dumps({"status": "CALIBRATION_BLOCKED_IMMUTABILITY", "file": str(path.relative_to(ROOT))})); return 2
    p = load(PREREG); cm = load(CAL_MANIFEST)
    alphas = [float(a) for a in p["alphaCandidates"]]; alpha_text = cm["alphaText"]; horizons = p["primaryMetric"]["horizonsHours"]; tol = p["alphaSelectionRule"]["tieToleranceKm"]
    if cm["status"] != "CALIBRATION_RUNS_PASS":
        print(json.dumps({"status": "CALIBRATION_BLOCKED", "reason": cm["status"]})); return 1
    # input integrity
    input_shas = []
    for run in cm["runs"]:
        if any(tok in run["windowId"] for tok in HOLDOUT_TOKENS):
            raise SystemExit("HOLDOUT FIREWALL")
        actual = sha(ROOT / run["trajectoriesFile"]); input_shas.append({"file": run["trajectoriesFile"], "expected": run["trajectoriesSha256"], "actual": actual, "verified": actual == run["trajectoriesSha256"]})
    if not all(x["verified"] for x in input_shas):
        print(json.dumps({"status": "CALIBRATION_BLOCKED_RESULT_INTEGRITY"})); return 1
    cohort = load(ROOT / "docs/research/cohort-step16.json")
    units = {u["windowId"]: u for u in p["calibration"]["runUnits"]}
    model = {}  # (unit, drifter, alpha) -> {ts: (lon, lat)}
    for run in cm["runs"]:
        with open(ROOT / run["trajectoriesFile"], encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                if row["valid"] == "true":
                    model.setdefault((run["windowId"], row["drifter_id"], float(run["alpha"])), {})[row["timestamp"]] = (float(row["lon"]), float(row["lat"]))
    rows = []
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
            o = obs.get(did, {}); rec = {"drifter_id": did, "unit": wid, "region": unit["region"]}
            rec["observed_72h"] = haversine_km(*release[did], *o[ts[72]]) if ts[72] in o and unit["t0"] in o else NA
            base = model.get((wid, did, 0.0), {})
            for a in alphas:
                pts = model.get((wid, did, a), {}); order = sorted(pts); at = alpha_text[str(a) if str(a) in alpha_text else str(int(a)) if a == 0 else str(a)]
                for h in horizons:
                    pos = pts.get(ts[h]); ob = o.get(ts[h]); rec[f"error_{h}h_alpha{at}"] = haversine_km(*pos, *ob) if pos and ob else NA
                rec[f"endpoint_72h_alpha{at}"] = haversine_km(*release[did], *pts[ts[72]]) if ts[72] in pts else NA
                rec[f"path_alpha{at}"] = sum(haversine_km(*pts[x], *pts[y]) for x, y in zip(order, order[1:])) if len(order) > 1 else NA
                rec[f"sep72h_alpha{at}"] = (haversine_km(*pts[ts[72]], *base[ts[72]]) if ts[72] in pts and ts[72] in base else NA) if a != 0.0 else NA
            rows.append(rec)
    rows.sort(key=lambda r: r["drifter_id"])
    atext = {a: alpha_text[str(int(a))] if a == 0 else alpha_text[str(a)] for a in alphas}
    # selection set: valid (non-NA) 72 h error for ALL alphas (implies observation at t0+72h and valid model at t0+72h)
    sel = [r for r in rows if all(r[f"error_72h_alpha{atext[a]}"] != NA for a in alphas)]
    excluded = [{"drifter_id": r["drifter_id"], "unit": r["unit"], "missing": [f"alpha{atext[a]}" for a in alphas if r[f"error_72h_alpha{atext[a]}"] == NA]} for r in rows if r not in sel]
    # candidate summaries (descriptive + ranking keys)
    def block(items):
        res = {}
        for a in alphas:
            at = atext[a]; b = {"alpha": a, "alphaText": at}
            for h in horizons:
                b[f"M3_{h}h"] = stats([r[f"error_{h}h_alpha{at}"] for r in items])
            b["M1_endpoint72h"] = stats([r[f"endpoint_72h_alpha{at}"] for r in items]); b["M2_totalPath"] = stats([r[f"path_alpha{at}"] for r in items])
            b["M4_separation72h_vs_alpha0"] = "NOT_APPLICABLE" if a == 0.0 else stats([r[f"sep72h_alpha{at}"] for r in items])
            res[at] = b
        res["M5_observed72h"] = stats([r["observed_72h"] for r in items]); res["n"] = len(items)
        return res
    overall = block(rows); selection_block = block(sel)
    per_region = {reg: block([r for r in rows if r["region"] == reg]) for reg in ("KE", "AG")}
    per_unit = {wid: block([r for r in rows if r["unit"] == wid]) for wid in units}
    # ranking on the selection set with FULL precision medians
    keys = {}
    for a in alphas:
        at = atext[a]; keys[a] = tuple(median_full([r[f"error_{h}h_alpha{at}"] for r in sel]) for h in (72, 48, 24))
    ranked = sorted(alphas, key=lambda a: a)  # start from smaller alpha order so that ties resolve to smaller alpha
    def better(a, b):
        """True if a ranks strictly better than b under the hierarchy; None if tied at every level."""
        for level in range(3):
            d = keys[a][level] - keys[b][level]
            if abs(d) > tol:
                return d < 0
        return None
    best = ranked[0]; hierarchy_trace = []
    for a in ranked[1:]:
        res = better(a, best)
        hierarchy_trace.append({"challenger": a, "incumbent": best, "challengerBetter": res, "resolvedBy": next((["72h", "48h", "24h"][lvl] for lvl in range(3) if abs(keys[a][lvl] - keys[best][lvl]) > tol), "smaller alpha")})
        if res is True:
            best = a
    order = sorted(alphas, key=lambda a: (keys[a][0], keys[a][1], keys[a][2], a))
    reason_level = None
    for lvl, name in enumerate(["72h", "48h", "24h"]):
        others = [a for a in alphas if a != best]
        if all(keys[best][lvl] < keys[a][lvl] - tol for a in others):
            reason_level = name; break
    reason = f"lowest {reason_level} M3 median on the selection set (n={len(sel)})" if reason_level else "tied through 72h/48h/24h medians with at least one other candidate; smaller alpha chosen"
    ranking = [{"rank": i + 1, "alpha": a, "alphaText": atext[a], "M3_median_72h": round(keys[a][0], 6), "M3_median_48h": round(keys[a][1], 6), "M3_median_24h": round(keys[a][2], 6)} for i, a in enumerate(order)]
    # table
    cols = ["drifter_id", "unit", "region"] + [f"error_{h}h_alpha{atext[a]}" for h in horizons for a in alphas] + [f"endpoint_72h_alpha{atext[a]}" for a in alphas] + [f"path_alpha{atext[a]}" for a in alphas] + [f"sep72h_alpha{atext[a]}" for a in alphas if a != 0.0] + ["observed_72h", "in_selection_set"]
    buf = io.StringIO(newline=""); w = csv.writer(buf, lineterminator="\n"); w.writerow(cols)
    for r in rows:
        w.writerow([r["drifter_id"], r["unit"], r["region"]] + [r3(r[c]) for c in cols[3:-1]] + ["true" if r in sel else "false"])
    table_bytes = buf.getvalue().encode("utf-8"); (out / "step20-calibration-table.csv").write_bytes(table_bytes)
    n_flags = {k: v["n"] for k, v in {**{f"unit:{w}": per_unit[w] for w in units}, **{f"region:{r}": per_region[r] for r in per_region}}.items()}
    summary = {"ruleId": p["ruleId"], "phase": "B-1 CALIBRATION", "alphaCandidates": alphas, "horizons": horizons, "tieToleranceKm": tol, "drifters": len(rows), "selectionSetN": len(sel), "excludedFromSelection": excluded,
               "overall": overall, "selectionSet": selection_block, "perRegion": per_region, "perUnit": per_unit, "smallN": {k: v for k, v in n_flags.items() if v < 5},
               "ranking": ranking, "selectedAlpha": best, "selectedAlphaText": atext[best], "selectionReason": reason, "hierarchyTrace": hierarchy_trace,
               "selectionInputsUsed": ["72h M3 median", "48h M3 median", "24h M3 median", "smaller alpha"], "notUsedForSelection": ["mean", "max", "M1", "M2", "M4", "M5", "sign test", "holdout"],
               "independenceNote": p["inferencePolicy"]["acknowledged"], "acceptanceThresholds": "NONE", "interpretation": "NONE", "holdoutAccess": 0}
    (out / "step20-calibration-summary.json").write_bytes((json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    evaluation = {"schemaVersion": "1.0", "ruleId": p["ruleId"], "phase": "B-1 CALIBRATION", "status": "CALIBRATION_COMPLETE", "lockCommit": "155995dd",
                  "protocolSha256": sha(PROTO), "preregistrationSha256": sha(PREREG), "selectionRuleSha256": sha(RULE_FILE), "calibrationManifestSha256": sha(CAL_MANIFEST),
                  "cohortSha256": LOCKED[ROOT / "docs/research/cohort-step16.json"], "observationSha256": p["immutabilityCheck"]["observationSha256"], "inputFileShas": input_shas,
                  "perDrifter": [{k: (v if k in ("drifter_id", "unit", "region") else r3(v)) for k, v in r.items()} | {"in_selection_set": r in sel} for r in rows],
                  "summary": summary, "tableSha256": hashlib.sha256(table_bytes).hexdigest(), "summarySha256": sha(out / "step20-calibration-summary.json"),
                  "tool": {"file": "tools/research/evaluate_step20_calibration.py", "sha256": sha(__file__)}, "gitHead": subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip(),
                  "createdAtUTC": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "deterministic": True, "randomSeed": None, "holdoutAccess": 0, "forcingDownloads": 0, "holdoutEvaluation": 0, "interpretation": "NONE"}
    (out / "step20-calibration-evaluation.json").write_bytes((json.dumps(evaluation, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    # selected-alpha artifact (content hash excludes createdAtUTC and its own sha field)
    artifact = {"schemaVersion": "1.0", "ruleId": p["ruleId"], "step20LockCommit": "155995dd", "status": "ALPHA_SELECTED", "selectedAlpha": best, "selectedAlphaText": atext[best],
                "meaning": "calibration-selected alpha under the locked STEP 20 selection rule; NOT a validated or general-purpose parameter",
                "selectionHierarchy": ["72h M3 median", "48h M3 median", "24h M3 median", "smaller alpha"], "tieToleranceKm": tol, "selectionSetN": len(sel), "excludedFromSelection": excluded,
                "candidateResults": ranking, "selectionReason": reason,
                "calibrationInputHashes": {"calibrationManifestSha256": sha(CAL_MANIFEST), "trajectoryFiles": [{"file": x["file"], "sha256": x["expected"]} for x in input_shas],
                                           "cohortSha256": LOCKED[ROOT / "docs/research/cohort-step16.json"], "observationSha256": p["immutabilityCheck"]["observationSha256"],
                                           "protocolSha256": sha(PROTO), "preregistrationSha256": sha(PREREG), "selectionRuleSha256": sha(RULE_FILE)},
                "evaluationTableSha256": hashlib.sha256(table_bytes).hexdigest(), "holdoutUsed": False, "holdoutAccess": 0, "frozen": True}
    artifact["contentSha256"] = hashlib.sha256(canonical(artifact)).hexdigest()
    artifact["createdAtUTC"] = evaluation["createdAtUTC"]
    (out / "step20-selected-alpha.json").write_bytes((json.dumps(artifact, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({"status": "CALIBRATION_COMPLETE", "selectedAlpha": best, "reason": reason, "selectionSetN": len(sel), "tableSha256": evaluation["tableSha256"], "summarySha256": evaluation["summarySha256"], "artifactContentSha256": artifact["contentSha256"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
