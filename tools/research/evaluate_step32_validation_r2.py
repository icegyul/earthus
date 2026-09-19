"""REVISION r2 (STEP 32 Phase B, uncommitted file-level revision; r1 kept unchanged on disk; see docs/research/step32-phase-b-revisions.json): windows blocked at the source gate are excluded by the registered rule and listed; counts reflect the evaluable set.
STEP 32 Phase B — B6/B7 expanded validation evaluation (descriptive). NEW_HOLDOUT stratum: per drifter of the eight locked windows,
M3 at exact UTC t0+24/48/72 h for CANDIDATE (C = GLORYS12V1 15.810070 m + WW3 Stokes x 1.0 + NCEP-R2, alpha 0.002; B6 runs) and
BASELINE (A = HYCOM_NATIVE_3H 15.000 m + NCEP-R2, alpha 0.002; the B4 condition-A runs, identical configuration to the frozen STEP 20/25C
baseline) against the STEP 15 observations; delta = E_candidate - E_HYCOM (km), tie 1e-6 km; M1/M2/M4/M5 secondary; label per the exact
locked STEP 30A rule (72 h median sign + 2/3 consistency). CALIBRATION stratum: copied verbatim from the frozen STEP 30A summary (23
drifters; SHA-locked), never recomputed. The historical holdout (KE-H1/H2/H3) is excluded. Per-window (cluster) structure reported; no
independence assumption; no outlier handling; no parameter or model selection. Deterministic; `--out DIR` for an independent run."""
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
MATRIX, RUNS_T, RUNS_C, S30, RULE30 = D / "step32-temporal-experiment-matrix.json", D / "step32-temporal-run-manifest.json", D / "step32-candidate-run-manifest.json", D / "step30a-final-candidate-summary.json", D / "step30a-rule.json"
S30_SHA, RULE30_SHA = "faaf891fa7c5308db70f97add419d370efa7346ee560c30e307ac33d0a01c504", "9251be51fc3fc8cc3a3b9570a0b3902c01e653754389da55852bdd4e83ab803d"
OBS_DIR = ROOT / "data/research/step15/noaa-gdp-hourly-qc"
OUT = {"table": "step32-validation-paired-table.csv", "evaluation": "step32-validation-evaluation.json", "summary": "step32-validation-summary.json"}
RADIUS_M = 6371008.8; NA = "NOT_AVAILABLE"; H = (24, 48, 72); TOL = 1e-6
COLS = ["drifter_id", "unit", "role"] + [f"{k}_{h}h" for h in H for k in ("error_CAND", "error_HYCOM", "delta", "sep_CAND_HYCOM")] + ["endpoint_CAND_72h", "endpoint_HYCOM_72h", "path_CAND", "path_HYCOM", "observed_72h"]
LABELS = {"A": "CANDIDATE_DESCRIPTIVELY_FAVORED", "B": "HYCOM_DESCRIPTIVELY_FAVORED", "C": "NO_CLEAR_DESCRIPTIVE_DIFFERENCE"}


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
    return {"wins_candidate": sum(1 for x in d if x < -TOL), "losses_candidate": sum(1 for x in d if x > TOL), "ties": sum(1 for x in d if abs(x) <= TOL), "winMeaning": "candidate (GLORYS + Stokes) lower error than HYCOM"}


def sign_test(w, l):
    n = w + l
    if n < 10:
        return {"n": n, "reported": False, "reason": "n < 10"}
    k = min(w, l); return {"n": n, "k": k, "p_nominal": round(min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n), 6), "reported": True, "role": "descriptive context only; drifters within a window are clustered; not the decision rule"}


def label(b):
    med, w, l = b["delta"]["median"], b["wins_candidate"], b["losses_candidate"]
    if med is None or w + l == 0:
        return LABELS["C"]
    if med < -TOL and w / (w + l) >= 2 / 3:
        return LABELS["A"]
    if med > TOL and l / (w + l) >= 2 / 3:
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
        b = {"n": len(paired), "notAvailable": len(rows) - len(paired), "error_candidate": stats([r[f"error_CAND_{h}h"] for r in paired]), "error_HYCOM": stats([r[f"error_HYCOM_{h}h"] for r in paired]), "delta": stats(dl)}
        b.update(wlt(dl)); b["signTest"] = sign_test(b["wins_candidate"], b["losses_candidate"]); b["M4_separation_candidate_HYCOM"] = stats([r[f"sep_CAND_HYCOM_{h}h"] for r in rows]); b["unpairedAvailability"] = {"candidate": sum(1 for r in rows if r[f"error_CAND_{h}h"] != NA), "HYCOM": sum(1 for r in rows if r[f"error_HYCOM_{h}h"] != NA)}; out[f"{h}h"] = b
    out["M1_endpoint72h"] = {"candidate": stats([r["endpoint_CAND_72h"] for r in rows]), "HYCOM": stats([r["endpoint_HYCOM_72h"] for r in rows])}
    out["M2_totalPath"] = {"candidate": stats([r["path_CAND"] for r in rows]), "HYCOM": stats([r["path_HYCOM"] for r in rows])}
    out["M4_separation72h"] = out["72h"]["M4_separation_candidate_HYCOM"]; out["M5_observed72h"] = stats([r["observed_72h"] for r in rows])
    return out


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else D
    out.mkdir(parents=True, exist_ok=True)
    M = load(MATRIX); RT = load(RUNS_T); RC = load(RUNS_C)
    if sha(S30) != S30_SHA or sha(RULE30) != RULE30_SHA:
        print(json.dumps({"status": "EVALUATION_BLOCKED_IMMUTABILITY: STEP 30A"})); return 2
    if RT["experimentMatrixSha256"] != sha(MATRIX) or RT["status"] != "STEP32_RUNS_PASS" or RC["experimentMatrixSha256"] != sha(MATRIX) or RC["conditions"] != ["C"]:
        print(json.dumps({"status": "EVALUATION_BLOCKED", "reason": [RT.get("status"), RC.get("status")]})); return 2
    model = {}; inputs = []; blocked = []; blocked_windows = set(RT.get("blockedWindows", [])) | set(RC.get("blockedWindows", []))
    for r in [x for x in RT["runs"] if x["condition"] == "A"] + RC["runs"]:
        if r.get("status") != "COMPLETED":
            blocked.append({"runId": r["runId"], "window": r["windowId"], "condition": r["condition"], "status": r.get("status"), "error": r.get("error")}); continue
        actual = sha(ROOT / r["trajectoriesFile"]); inputs.append({"runId": r["runId"], "window": r["windowId"], "condition": r["condition"], "file": r["trajectoriesFile"], "expected": r["trajectoriesSha256"], "actual": actual, "verified": actual == r["trajectoriesSha256"]})
        for did, pts in positions(ROOT / r["trajectoriesFile"]).items():
            model.setdefault((r["windowId"], did), {})[r["condition"]] = pts
    if not all(x["verified"] for x in inputs):
        print(json.dumps({"status": "EVALUATION_BLOCKED_INPUT_INTEGRITY"})); return 2
    evaluable = [w for w in M["windows"] if w["windowId"] not in blocked_windows]
    if not evaluable or len(inputs) != 2 * len(evaluable):
        print(json.dumps({"status": "EVALUATION_BLOCKED_NO_EVALUABLE_WINDOW", "blocked": sorted(blocked_windows)})); return 2
    rows = []; obs_files = {}
    for w in evaluable:
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
                pc, ph, ob = mm.get("C", {}).get(tsd[h]), mm.get("A", {}).get(tsd[h]), o.get(tsd[h])
                rec[f"error_CAND_{h}h"] = hav(*pc, *ob) if pc and ob else NA; rec[f"error_HYCOM_{h}h"] = hav(*ph, *ob) if ph and ob else NA
                rec[f"delta_{h}h"] = rec[f"error_CAND_{h}h"] - rec[f"error_HYCOM_{h}h"] if NA not in (rec[f"error_CAND_{h}h"], rec[f"error_HYCOM_{h}h"]) else NA
                rec[f"sep_CAND_HYCOM_{h}h"] = hav(*pc, *ph) if pc and ph else NA
            for c, tag in (("C", "CAND"), ("A", "HYCOM")):
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
    new = block(rows); per_window = {w["windowId"]: block([r for r in rows if r["unit"] == w["windowId"]]) for w in evaluable}
    s30 = load(S30); cal = s30["strata"]["calibration"]
    calibration = {"source": "docs/research/step30a-final-candidate-summary.json (frozen; copied, not recomputed)", "sha256": S30_SHA, "n_drifters": cal["n_drifters"], "windows": ["KE-1", "KE-2", "AG-1", "AG-2"], **{f"{h}h": {"n": cal[f"{h}h"]["n"], "notAvailable": cal[f"{h}h"]["notAvailable"], "error_candidate": cal[f"{h}h"]["error_candidate"], "error_HYCOM": cal[f"{h}h"]["error_HYCOM"], "delta": cal[f"{h}h"]["delta"], "wins_candidate": cal[f"{h}h"]["wins_candidate"], "losses_candidate": cal[f"{h}h"]["losses_candidate"], "ties": cal[f"{h}h"]["ties"]} for h in H}, "label72h": s30["descriptiveLabel"]["byStratum"]["calibration"]}
    lab_new = label(new["72h"]); window_labels = {k: label(v["72h"]) for k, v in per_window.items()}; nv = new["72h"]
    top = {f"{h}h": [{"unit": r["unit"], "drifter_id": r["drifter_id"], "error_candidate": r3(r[f"error_CAND_{h}h"]), "error_HYCOM": r3(r[f"error_HYCOM_{h}h"]), "delta": r3(r[f"delta_{h}h"])} for r in sorted((r for r in rows if r[f"error_CAND_{h}h"] != NA), key=lambda r: -r[f"error_CAND_{h}h"])[:3]] for h in H}
    summary = {"ruleId": M["ruleId"], "phase": "B6/B7", "status": "STEP32_VALIDATION_EVALUATED", "comparison": "CANDIDATE (GLORYS12V1 15.810070 m + WW3 Stokes x 1.0 + NCEP-R2, alpha 0.002) vs BASELINE (HYCOM GOFS 3.1 15.000 m 3-hourly + NCEP-R2, alpha 0.002) on the expanded independent holdout", "deltaDefinition": "error_candidate - error_HYCOM (km); negative = candidate lower error",
               "alpha": 0.002, "candidateDepthMeters": 15.81007, "baselineDepthMeters": 15.0, "stokesCoefficient": 1.0, "tieToleranceKm": TOL, "labelRule": load(RULE30)["interpretationRule"], "strata": {"CALIBRATION": calibration, "NEW_HOLDOUT": new}, "perWindow": per_window, "topCandidateErrors": top,
               "primaryNewHoldout72h": {"n": nv["n"], "notAvailable": nv["notAvailable"], "candidate_median": nv["error_candidate"]["median"], "HYCOM_median": nv["error_HYCOM"]["median"], "delta_median": nv["delta"]["median"], "delta_mean": nv["delta"]["mean"], "wins_candidate": nv["wins_candidate"], "losses_candidate": nv["losses_candidate"], "ties": nv["ties"], "consistency_candidate": round(nv["wins_candidate"] / (nv["wins_candidate"] + nv["losses_candidate"]), 4) if nv["wins_candidate"] + nv["losses_candidate"] else None},
               "descriptiveLabel": {"NEW_HOLDOUT_72h": lab_new, "CALIBRATION_72h_frozenStep30A": calibration["label72h"], "perWindow72h": window_labels}, "oldHoldoutIncluded": False, "excludedHistoricalHoldout": ["KE-H1", "KE-H2", "KE-H3"], "blockedRuns": blocked, "blockedWindows": sorted(blocked_windows), "evaluableWindows": [w["windowId"] for w in evaluable], "registeredWindows": [w["windowId"] for w in M["windows"]], "blockedReason": "registered data-availability rule: mandatory HYCOM 3-hourly source frame absent from expt_53.X (WINDOW_BLOCKED); no replacement", "belowPreregisteredMinimum": {"drifters": len(rows) < 20, "windows": len(evaluable) < 6, "minimum": "20 drifters / 6 windows (Phase A)"},
               "clustering": "Drifters sharing a window, forcing period and release time are clustered; they are not independent samples. Per-window structure is reported; pooled counts are descriptive only. Calibration and new holdout are reported separately and are never merged into one unqualified claim.",
               "outlierPolicyApplied": {"removed": 0, "trimmed": 0, "winsorized": 0, "weighted": 0, "deleted": 0, "postHocExclusions": 0}, "parameterSelection": "NONE", "modelSelection": "NONE", "candidateStatus": "CANDIDATE_ONLY", "baselineStatus": "FROZEN_REFERENCE_BASELINE", "interpretation": "DESCRIPTIVE ONLY",
               "statements": [f"{len(blocked_windows)} of {len(M['windows'])} registered windows are WINDOW_BLOCKED (missing HYCOM source frames); NEW_HOLDOUT evaluated on {len(evaluable)} windows / {len(rows)} drifters, below the Phase A minimum of 6 windows / 20 drifters; no window was replaced.", f"NEW_HOLDOUT 72 h: candidate median {nv['error_candidate']['median']} km, HYCOM median {nv['error_HYCOM']['median']} km, paired median delta {nv['delta']['median']} km, W/L/T {nv['wins_candidate']}/{nv['losses_candidate']}/{nv['ties']}, label {lab_new} under the locked STEP 30A rule.", f"CALIBRATION (frozen STEP 30A, 23 drifters) 72 h: median delta {cal['72h']['delta']['median']} km, W/L/T {cal['72h']['wins_candidate']}/{cal['72h']['losses_candidate']}/{cal['72h']['ties']}, label {calibration['label72h']}; not recomputed.", "STEP 32 selects no model; the candidate remains CANDIDATE_ONLY and HYCOM the FROZEN_REFERENCE_BASELINE regardless of this result.", "Drifters within one window are clustered; no statistical significance, generalization, operational or causal claim is made."]}
    (out / OUT["summary"]).write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    evaluation = {"schemaVersion": "1.0", "ruleId": M["ruleId"], "phase": "B6/B7", "status": "EVALUATION_COMPLETE", "experimentMatrixSha256": sha(MATRIX), "temporalRunManifestSha256": sha(RUNS_T), "candidateRunManifestSha256": sha(RUNS_C), "step30aSummarySha256": S30_SHA, "observationFiles": obs_files, "inputTrajectories": inputs, "blockedRuns": blocked, "pairing": "exact drifter_id and exact UTC timestamp; candidate, baseline and observation valid", "perDrifter": [{k: (v if k in ("drifter_id", "unit", "role") else r3(v)) for k, v in r.items()} for r in rows], "summary": summary, "tableSha256": sha(out / OUT["table"]), "summarySha256": sha(out / OUT["summary"])}
    (out / OUT["evaluation"]).write_text(json.dumps(evaluation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "STEP32_VALIDATION_EVALUATED", "newHoldoutLabel": lab_new, "primary": summary["primaryNewHoldout72h"], "blocked": len(blocked)}, ensure_ascii=False)); return 0


if __name__ == "__main__":
    raise SystemExit(main())
