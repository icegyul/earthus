"""STEP 30A Phase B evaluation — final candidate (STEP 29 GLORYS + Stokes, alpha 0.002) vs frozen HYCOM baseline (STEP 25C / STEP 20,
alpha 0.002). Evaluation only: reads the twelve SHA-locked trajectory files and the STEP 15 observations; no model run, no forcing, no
data acquisition. Per drifter: M3 (haversine R = 6371008.8 m) at exact UTC t0+24/48/72 h for candidate and HYCOM, delta = E_candidate -
E_HYCOM (km, tie 1e-6 km); M1 endpoint 72 h (both); M2 path length (both); M4 candidate-HYCOM separation at 24/48/72 h; M5 observed
72 h displacement. Three-way context (A HYCOM = STEP 25C error_H002, B GLORYS = STEP 25C error_G002, C GLORYS + Stokes = STEP 29
error_T002) is copied from the frozen tables, never recomputed. Label per the locked STEP 30A rule (overall 72 h paired median delta
sign + 2/3 consistency of non-tied pairs). No outlier handling, no exclusion, no weighting. Deterministic outputs (`--out DIR` for an
independent second run); the only timestamp lives in the manifest (createdAtUTC)."""
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
RULE, PA, PB = D / "step30a-rule.json", D / "step30a-preregistration.json", D / "step30a-phase-b-preregistration.json"
T25, T29, E29, M29 = D / "step25c-paired-table.csv", D / "step29-stokes-paired-table.csv", D / "step29-stokes-evaluation.json", D / "step29-stokes-manifest.json"
OBS_DIR = ROOT / "data/research/step15/noaa-gdp-hourly-qc"
OUT = {"table": "step30a-final-candidate-table.csv", "window": "step30a-final-candidate-window-summary.csv", "summary": "step30a-final-candidate-summary.json", "evaluation": "step30a-final-candidate-evaluation.json", "manifest": "step30a-final-candidate-manifest.json"}
RADIUS_M = 6371008.8
NA = "NOT_AVAILABLE"
H = (24, 48, 72)
LABELS = {"A": "CANDIDATE_DESCRIPTIVELY_FAVORED", "B": "HYCOM_DESCRIPTIVELY_FAVORED", "C": "NO_CLEAR_DESCRIPTIVE_DIFFERENCE"}
COLS = ["drifter_id", "unit", "role"] + [f"{k}_{h}h" for h in H for k in ("error_CAND", "error_HYCOM", "delta", "sep_CAND_HYCOM")] + ["endpoint_CAND_72h", "endpoint_HYCOM_72h", "path_CAND", "path_HYCOM", "observed_72h"] + [f"{k}_{h}h" for h in H for k in ("threeway_A_HYCOM", "threeway_B_GLORYS", "threeway_C_STOKES")]
WCOLS = ["stratum", "role", "horizon_h", "n_drifters", "n_paired", "not_available", "cand_median", "cand_mean", "cand_min", "cand_max", "hycom_median", "hycom_mean", "hycom_min", "hycom_max", "delta_median", "delta_mean", "delta_min", "delta_max", "wins_candidate", "losses_candidate", "ties", "sep_median"]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def haversine_km(lon1, lat1, lon2, lat2):
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


def wlt(deltas, tol):
    d = [x for x in deltas if x != NA]
    return {"wins_candidate": sum(1 for x in d if x < -tol), "losses_candidate": sum(1 for x in d if x > tol), "ties": sum(1 for x in d if abs(x) <= tol), "winMeaning": "candidate (GLORYS + Stokes) lower error than HYCOM"}


def sign_test(w, l, min_n):
    n = w + l
    if n < min_n:
        return {"n": n, "reported": False, "reason": f"n < {min_n}"}
    k = min(w, l)
    return {"n": n, "k": k, "p_nominal": round(min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n), 6), "reported": True, "role": "descriptive context only; not the decision rule"}


def label(block, tol, frac):
    med, w, l = block["delta"]["median"], block["wins_candidate"], block["losses_candidate"]
    if med is None or w + l == 0:
        return LABELS["C"]
    if med < -tol and w / (w + l) >= frac:
        return LABELS["A"]
    if med > tol and l / (w + l) >= frac:
        return LABELS["B"]
    return LABELS["C"]


def positions(path):
    out, alphas, run_ids = {}, set(), set()
    with open(path, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            alphas.add(row["alpha"]); run_ids.add(row["run_id"])
            if row["valid"] == "true":
                out.setdefault(row["drifter_id"], {})[row["timestamp"]] = (float(row["lon"]), float(row["lat"]))
    return out, sorted(alphas), sorted(run_ids)


def frozen_table(path):
    with open(path, encoding="utf-8", newline="") as fh:
        return {(r["unit"], r["drifter_id"]): r for r in csv.DictReader(fh)}


def block(rows, tol, min_n):
    out = {"n_drifters": len(rows)}
    for h in H:
        ec = [r[f"error_CAND_{h}h"] for r in rows]; eh = [r[f"error_HYCOM_{h}h"] for r in rows]; dl = [r[f"delta_{h}h"] for r in rows]
        paired = [r for r in rows if r[f"delta_{h}h"] != NA]
        b = {"n": len(paired), "notAvailable": len(rows) - len(paired), "error_candidate": stats([r[f"error_CAND_{h}h"] for r in paired]), "error_HYCOM": stats([r[f"error_HYCOM_{h}h"] for r in paired]), "delta": stats(dl)}
        b.update(wlt(dl, tol)); b["signTest"] = sign_test(b["wins_candidate"], b["losses_candidate"], min_n)
        b["M4_separation_candidate_HYCOM"] = stats([r[f"sep_CAND_HYCOM_{h}h"] for r in rows])
        b["unpairedAvailability"] = {"candidate": sum(1 for x in ec if x != NA), "HYCOM": sum(1 for x in eh if x != NA)}
        b["threeWayFrozen"] = three_way(rows, h, tol)
        out[f"{h}h"] = b
    out["M1_endpoint72h"] = {"candidate": stats([r["endpoint_CAND_72h"] for r in rows]), "HYCOM": stats([r["endpoint_HYCOM_72h"] for r in rows])}
    out["M2_totalPath"] = {"candidate": stats([r["path_CAND"] for r in rows]), "HYCOM": stats([r["path_HYCOM"] for r in rows])}
    out["M4_separation72h"] = out["72h"]["M4_separation_candidate_HYCOM"]
    out["M5_observed72h"] = stats([r["observed_72h"] for r in rows])
    return out


def three_way(rows, h, tol):
    a, b, c = f"threeway_A_HYCOM_{h}h", f"threeway_B_GLORYS_{h}h", f"threeway_C_STOKES_{h}h"
    full = [r for r in rows if NA not in (r[a], r[b], r[c])]
    med = lambda xs: stats(xs)["median"]
    ca, ba, cb = med([r[c] - r[a] for r in full]), med([r[b] - r[a] for r in full]), med([r[c] - r[b] for r in full])
    move = NA
    if full:
        da, db = abs(ca), abs(ba)
        move = "NEITHER" if abs(da - db) <= tol else ("TOWARD_HYCOM_ERROR_LEVEL" if da < db else "AWAY_FROM_HYCOM_ERROR_LEVEL")
    return {"n_allThree": len(full), "A_HYCOM_step25c_error_H002": stats([r[a] for r in full]), "B_GLORYS_step25c_error_G002": stats([r[b] for r in full]), "C_STOKES_step29_error_T002": stats([r[c] for r in full]),
            "median_C_minus_A_step30a": ca, "median_B_minus_A_step25c": ba, "median_C_minus_B_step29": cb, "stokesMovedGlorysRelativeToHycomErrorMedian": move, "note": "frozen values copied from the STEP 25C / STEP 29 tables; C-B (STEP 29) and C-A (STEP 30A) are different comparisons"}


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else D
    out.mkdir(parents=True, exist_ok=True)
    rule, pa, pb = load(RULE), load(PA), load(PB)
    if pb["ruleSha256"] != sha(RULE) or pb["phaseAPreregistrationSha256"] != sha(PA) or pa["ruleSha256"] != sha(RULE):
        print(json.dumps({"status": "EVALUATION_BLOCKED_IMMUTABILITY"})); return 2
    frozen = pb["frozenInputs"]
    if any(sha(ROOT / rel) != expected for rel, expected in frozen.items()):
        print(json.dumps({"status": "EVALUATION_BLOCKED_FROZEN_INPUT_MISMATCH"})); return 2
    tol, frac, min_n = rule["metrics"]["tieToleranceKm"], rule["interpretationRule"]["consistencyFraction"], 10
    inputs = []; model = {}; alpha_seen = {}
    for w in rule["windows"]:
        for side in ("candidate", "baseline"):
            rel = w[side]["file"]; actual = sha(ROOT / rel)
            pts, alphas, run_ids = positions(ROOT / rel)
            inputs.append({"window": w["windowId"], "side": side, "file": rel, "expected": w[side]["sha256"], "actual": actual, "verified": actual == w[side]["sha256"], "alphaValues": alphas, "runIds": run_ids, "drifters": len(pts)})
            alpha_seen.setdefault(side, set()).update(alphas)
            for did, p in pts.items():
                model.setdefault((w["windowId"], did), {})[side] = p
    if not all(x["verified"] for x in inputs) or len(inputs) != 12:
        print(json.dumps({"status": "EVALUATION_BLOCKED_INPUT_INTEGRITY"})); return 2
    if alpha_seen != {"candidate": {"0.002"}, "baseline": {"0.002"}}:
        print(json.dumps({"status": "EVALUATION_BLOCKED_ALPHA_MISMATCH", "alpha": {k: sorted(v) for k, v in alpha_seen.items()}})); return 2
    t25, t29 = frozen_table(T25), frozen_table(T29)
    obs_files = {}; rows = []; xcheck = []
    for w in rule["windows"]:
        wid = w["windowId"]; t0 = datetime.strptime(w["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc); t1 = t0 + timedelta(hours=72)
        ts = {h: (t0 + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ") for h in H}
        obs = {}
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
            mm = model.get((wid, did), {}); o = obs.get(did, {}); rec = {"drifter_id": did, "unit": wid, "role": w["role"]}
            f25, f29 = t25.get((wid, did), {}), t29.get((wid, did), {})
            for h in H:
                pc, ph, ob = mm.get("candidate", {}).get(ts[h]), mm.get("baseline", {}).get(ts[h]), o.get(ts[h])
                rec[f"error_CAND_{h}h"] = haversine_km(*pc, *ob) if pc and ob else NA
                rec[f"error_HYCOM_{h}h"] = haversine_km(*ph, *ob) if ph and ob else NA
                rec[f"delta_{h}h"] = rec[f"error_CAND_{h}h"] - rec[f"error_HYCOM_{h}h"] if NA not in (rec[f"error_CAND_{h}h"], rec[f"error_HYCOM_{h}h"]) else NA
                rec[f"sep_CAND_HYCOM_{h}h"] = haversine_km(*pc, *ph) if pc and ph else NA
                fa, fb, fc = f25.get(f"error_H002_{h}h", NA), f25.get(f"error_G002_{h}h", NA), f29.get(f"error_T002_{h}h", NA)
                rec[f"threeway_A_HYCOM_{h}h"] = float(fa) if fa != NA else NA
                rec[f"threeway_B_GLORYS_{h}h"] = float(fb) if fb != NA else NA
                rec[f"threeway_C_STOKES_{h}h"] = float(fc) if fc != NA else NA
                for mine, pub, name in ((rec[f"error_HYCOM_{h}h"], fa, "HYCOM_vs_step25c_error_H002"), (rec[f"error_CAND_{h}h"], fc, "candidate_vs_step29_error_T002")):
                    xcheck.append({"unit": wid, "drifter_id": did, "horizon": h, "comparison": name, "recomputed": r3(mine), "frozen": pub, "absDiffKm": r3(abs(mine - float(pub))) if mine != NA and pub != NA else NA, "agree": (mine == NA and pub == NA) or (mine != NA and pub != NA and abs(round(mine, 3) - float(pub)) <= 0.001)})
            for side, tag in (("candidate", "CAND"), ("baseline", "HYCOM")):
                pts = mm.get(side, {}); order = sorted(pts)
                rec[f"endpoint_{tag}_72h"] = haversine_km(*release[did], *pts[ts[72]]) if ts[72] in pts else NA
                rec[f"path_{tag}"] = sum(haversine_km(*pts[a], *pts[b]) for a, b in zip(order, order[1:])) if len(order) > 1 else NA
            rec["observed_72h"] = haversine_km(*release[did], *o[ts[72]]) if ts[72] in o and w["t0"] in o else NA
            rows.append(rec)
    rows.sort(key=lambda r: (r["unit"], r["drifter_id"]))
    buf = io.StringIO(newline=""); wr = csv.writer(buf, lineterminator="\n"); wr.writerow(COLS)
    for rec in rows:
        wr.writerow([rec["drifter_id"], rec["unit"], rec["role"]] + [r3(rec[c]) for c in COLS[3:]])
    (out / OUT["table"]).write_text(buf.getvalue(), encoding="utf-8")
    cal, hold = rule["strata"]["calibration"], rule["strata"]["holdout"]
    strata = {"overall": block(rows, tol, min_n), "calibration": block([r for r in rows if r["unit"] in cal], tol, min_n), "holdout": block([r for r in rows if r["unit"] in hold], tol, min_n)}
    per_window = {w["windowId"]: block([r for r in rows if r["unit"] == w["windowId"]], tol, min_n) for w in rule["windows"]}
    top = {f"{h}h": [{"unit": r["unit"], "drifter_id": r["drifter_id"], "error_candidate": r3(r[f"error_CAND_{h}h"]), "error_HYCOM": r3(r[f"error_HYCOM_{h}h"]), "delta": r3(r[f"delta_{h}h"])} for r in sorted((r for r in rows if r[f"error_CAND_{h}h"] != NA), key=lambda r: -r[f"error_CAND_{h}h"])[:3]] for h in H}
    labels = {name: label(b["72h"], tol, frac) for name, b in strata.items()}
    e29 = load(E29)["summary"]; s29 = {k: e29["strata"][k]["72h"]["primary_alpha0.002"] for k in ("overall", "calibration", "holdout")}
    step29_context = {"comparison": "STEP 29 = C (GLORYS + Stokes) vs B (GLORYS), alpha 0.002; frozen", "72h": {k: {"median_delta": v["delta"]["median_delta"], "wins_stokes": v["wins_stokes"], "losses_stokes": v["losses_stokes"], "ties": v["ties"]} for k, v in s29.items()}, "descriptiveLabel": e29["descriptiveLabel"], "source": "docs/research/step29-stokes-evaluation.json", "sha256": frozen["docs/research/step29-stokes-evaluation.json"]}
    ov = strata["overall"]["72h"]
    summary = {"ruleId": rule["ruleId"], "phase": "B", "status": "STEP30A_COMPLETE", "comparison": "STEP 30A = C (GLORYS + Stokes, STEP 29 treatment alpha 0.002) vs A (HYCOM, STEP 25C / STEP 20 alpha 0.002)", "baseline": "HYCOM STEP25C", "candidate": "GLORYS + Stokes STEP29",
               "alpha": 0.002, "stokesCoefficient": 1.0, "candidateDepthMeters": rule["candidate"]["depthMeters"], "baselineDepthMeters": rule["baseline"]["depthMeters"], "modelRunCount": 0, "newData": 0, "horizons": list(H), "tieToleranceKm": tol,
               "deltaDefinition": "error_candidate - error_HYCOM (km); negative = candidate lower error", "windows": [w["windowId"] for w in rule["windows"]], "excluded": rule["excluded"], "strata": strata, "perWindow": per_window, "topCandidateErrors": top,
               "primary72h": {"n": ov["n"], "candidate_median": ov["error_candidate"]["median"], "HYCOM_median": ov["error_HYCOM"]["median"], "delta_median": ov["delta"]["median"], "delta_mean": ov["delta"]["mean"], "wins_candidate": ov["wins_candidate"], "losses_candidate": ov["losses_candidate"], "ties": ov["ties"], "consistency_candidate": round(ov["wins_candidate"] / (ov["wins_candidate"] + ov["losses_candidate"]), 4) if ov["wins_candidate"] + ov["losses_candidate"] else None},
               "labelRules": rule["interpretationRule"], "descriptiveLabel": {"primary": labels["overall"], "byStratum": labels}, "step29Context": step29_context, "outlierPolicyApplied": {"removed": 0, "trimmed": 0, "winsorized": 0, "weighted": 0, "deleted": 0, "postHocExclusions": 0},
               "alphaSelection": "NONE", "coefficientSelection": "NONE", "depthSelection": "NONE", "forcingSelection": "NONE", "holdoutUsedForSelection": False, "reranking": False, "physicalExplanationClaimed": False, "statisticalSignificanceClaimed": False, "interpretation": "DESCRIPTIVE ONLY",
               "question": rule["question"], "answer72h": f"Under the preregistered 72 h paired M3 rule the overall label is {labels['overall']} (median delta {ov['delta']['median']} km, wins/losses/ties {ov['wins_candidate']}/{ov['losses_candidate']}/{ov['ties']}).",
               "statements": pb["requiredStatements"] + [f"STEP 30A overall 72 h: candidate median {ov['error_candidate']['median']} km, HYCOM median {ov['error_HYCOM']['median']} km, paired median delta {ov['delta']['median']} km, W/L/T {ov['wins_candidate']}/{ov['losses_candidate']}/{ov['ties']}, label {labels['overall']}.",
                                                           f"Holdout (KE-H1, KE-H3) 72 h: median delta {strata['holdout']['72h']['delta']['median']} km, W/L/T {strata['holdout']['72h']['wins_candidate']}/{strata['holdout']['72h']['losses_candidate']}/{strata['holdout']['72h']['ties']}, descriptive label {labels['holdout']}; not used for any selection.",
                                                           f"STEP 29 context (C vs B, frozen): 72 h median delta {s29['overall']['delta']['median_delta']} km, W/L {s29['overall']['wins_stokes']}/{s29['overall']['losses_stokes']}; holdout {s29['holdout']['delta']['median_delta']} km, W/L {s29['holdout']['wins_stokes']}/{s29['holdout']['losses_stokes']}. This is a different comparison from STEP 30A (C vs A)."]}
    (out / OUT["summary"]).write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    evaluation = {"schemaVersion": "1.0", "ruleId": rule["ruleId"], "phase": "B", "status": "EVALUATION_COMPLETE", "ruleSha256": sha(RULE), "phaseAPreregistrationSha256": sha(PA), "phaseBPreregistrationSha256": sha(PB), "observationSha256": rule["observationSha256"], "observationFiles": obs_files, "frozenInputs": frozen,
                  "inputTrajectories": inputs, "modelRunCount": 0, "newData": 0, "pairingRule": rule["metrics"]["pairing"], "perDrifter": [{k: (v if k in ("drifter_id", "unit", "role") else r3(v)) for k, v in r.items()} for r in rows],
                  "crossCheck": {"items": xcheck, "compared": len(xcheck), "disagreements": sum(1 for x in xcheck if not x["agree"]), "allAgree": all(x["agree"] for x in xcheck)}, "summary": summary, "tableSha256": sha(out / OUT["table"]), "summarySha256": sha(out / OUT["summary"])}
    (out / OUT["evaluation"]).write_text(json.dumps(evaluation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    wbuf = io.StringIO(newline=""); ww = csv.writer(wbuf, lineterminator="\n"); ww.writerow(WCOLS)
    role = {w["windowId"]: w["role"] for w in rule["windows"]}
    for name, b in list(strata.items()) + list(per_window.items()):
        for h in H:
            o = b[f"{h}h"]; fmt = lambda v: NA if v is None else v
            ww.writerow([name, role.get(name, name.upper()), h, b["n_drifters"], o["n"], o["notAvailable"], fmt(o["error_candidate"]["median"]), fmt(o["error_candidate"]["mean"]), fmt(o["error_candidate"]["min"]), fmt(o["error_candidate"]["max"]), fmt(o["error_HYCOM"]["median"]), fmt(o["error_HYCOM"]["mean"]), fmt(o["error_HYCOM"]["min"]), fmt(o["error_HYCOM"]["max"]), fmt(o["delta"]["median"]), fmt(o["delta"]["mean"]), fmt(o["delta"]["min"]), fmt(o["delta"]["max"]), o["wins_candidate"], o["losses_candidate"], o["ties"], fmt(o["M4_separation_candidate_HYCOM"]["median"])])
    (out / OUT["window"]).write_text(wbuf.getvalue(), encoding="utf-8")
    manifest = {"schemaVersion": "1.0", "ruleId": rule["ruleId"], "phase": "B", "status": "STEP30A_COMPLETE", "createdAtUTC": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "evaluationOnly": True, "modelRunCount": 0, "newData": 0, "trajectoriesGenerated": 0, "forcingBuilt": 0,
                "evaluator": {"path": "tools/research/evaluate_step30a_final_candidate.py", "sha256": sha(Path(__file__))}, "ruleSha256": sha(RULE), "phaseAPreregistrationSha256": sha(PA), "phaseBPreregistrationSha256": sha(PB), "frozenInputs": frozen, "inputTrajectories": [{k: x[k] for k in ("window", "side", "file", "expected", "actual", "verified")} for x in inputs],
                "observationFiles": obs_files, "outputs": {k: {"file": f"docs/research/{v}", "sha256": sha(out / v)} for k, v in OUT.items() if k != "manifest"}, "descriptiveLabel": labels["overall"]}
    (out / OUT["manifest"]).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "STEP30A_EVALUATION_COMPLETE", "label": labels["overall"], "primary72h": summary["primary72h"], "crossCheckAllAgree": evaluation["crossCheck"]["allAgree"], "modelRunCount": 0}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
