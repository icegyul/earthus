"""STEP 40 — preregistered PRIMARY window-level percentile bootstrap (STEP 37 field 28, clarification v1.1) on the frozen STEP 39 evaluation.
Input: docs/research/step39-evaluation.json (primaryDeltas72h: delta_i = E_C,i(72h) - E_A,i(72h) per drifter, NOT_AVAILABLE kept) and
step39-summary.json (frozen Delta_w and Theta, SHA-verified). Sampling frame = all 9 registered windows. One generator
numpy.random.default_rng(20260907); per replicate b = 1..10000: idx = rng.integers(0, 9, size=9); for each sampled window keep all its valid
drifter deltas and recompute Delta_w = median(delta_i) (identical to the frozen value; asserted); statistic Theta_b = median over the sampled
windows that have >= 1 valid pair (a window drawn k times contributes k times; equal window weighting; drifters never resampled
independently; NA windows never imputed); a replicate with no available window is NOT_AVAILABLE and never redrawn. 95 % interval =
numpy.quantile(available, [0.025, 0.975], method='linear'). Success rule (frozen): label CANDIDATE_DESCRIPTIVELY_FAVORED AND upper_95 < 0.
Sensitivity only (separate generator, same seed): drifter-level bootstrap of the pooled median. Writes step40-bootstrap-result.json and
step40-bootstrap-replicates.csv (`--out DIR` for the independent re-run)."""
import csv
import hashlib
import io
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
PROTO, EV, SM = D / "step40-bootstrap-protocol.json", D / "step39-evaluation.json", D / "step39-summary.json"
NA = "NOT_AVAILABLE"; B = 10000; SEED = 20260907; TOL = 1e-6


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def median(v):
    v = sorted(v); m = len(v) // 2
    return v[m] if len(v) % 2 else (v[m - 1] + v[m]) / 2


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else D
    out.mkdir(parents=True, exist_ok=True)
    P = load(PROTO); ev = load(EV); sm = load(SM)
    if P["inputs"]["step39EvaluationSha256"] != sha(EV) or P["inputs"]["step39SummarySha256"] != sha(SM) or P["tools"]["tools/research/bootstrap_step40.py"] != sha(__file__):
        raise SystemExit("STEP40_BLOCKED_IMMUTABILITY")
    windows = list(sm["primary"]["Delta_w"].keys()); assert len(windows) == 9
    per = {w: [] for w in windows}
    for d in ev["primaryDeltas72h"]:
        if d["delta_i"] != NA:
            per[d["window"]].append(float(d["delta_i"]))
    delta_w = {w: (round(median(v), 3) if v else NA) for w, v in per.items()}
    frozen = {w: (round(float(x["Delta_w"]), 3) if x["Delta_w"] != NA else NA) for w, x in sm["primary"]["Delta_w"].items()}
    if delta_w != frozen:
        raise SystemExit(f"STEP40_BLOCKED: Delta_w recomputed from delta_i differs from the frozen STEP 39 values: {delta_w} vs {frozen}")
    avail_w = [w for w in windows if delta_w[w] != NA]; theta_obs = round(median([delta_w[w] for w in avail_w]), 3)
    if abs(theta_obs - round(float(sm["primary"]["Theta_km"]), 3)) > 1e-9:
        raise SystemExit("STEP40_BLOCKED: observed Theta differs from frozen STEP 39")
    rng = np.random.default_rng(SEED); stats = []; na_count = 0; rows = []
    for b in range(B):
        idx = rng.integers(0, 9, size=9); vals = []
        for i in idx:
            w = windows[int(i)]
            if per[w]:
                vals.append(median(per[w]))     # Delta_w recomputed from the window's valid drifter deltas (frozen rule)
        if vals:
            tb = median(vals); stats.append(tb); rows.append([b + 1, " ".join(str(int(i)) for i in idx), len(vals), f"{tb:.6f}"])
        else:
            na_count += 1; rows.append([b + 1, " ".join(str(int(i)) for i in idx), 0, NA])
    arr = np.array(stats, dtype=float); q = np.quantile(arr, [0.025, 0.975], method="linear")
    label = sm["primary"]["descriptiveLabel_step30aRule_pooledPairs"]; success = label == "CANDIDATE_DESCRIPTIVELY_FAVORED" and float(q[1]) < 0.0
    # ---- sensitivity only: drifter-level bootstrap of the pooled median ----
    pooled = [float(d["delta_i"]) for d in ev["primaryDeltas72h"] if d["delta_i"] != NA]; rng2 = np.random.default_rng(SEED); n = len(pooled); sens = []
    for b in range(B):
        sens.append(median([pooled[int(i)] for i in rng2.integers(0, n, size=n)]))
    sq = np.quantile(np.array(sens), [0.025, 0.975], method="linear")
    buf = io.StringIO(newline=""); wr = csv.writer(buf, lineterminator="\n"); wr.writerow(["replicate", "window_indices", "available_windows", "Theta_b_km"]); wr.writerows(rows)
    (out / "step40-bootstrap-replicates.csv").write_text(buf.getvalue(), encoding="utf-8")
    result = {"schemaVersion": "1.0", "ruleId": "experiment-preregistration-step37", "step": 40, "status": "PRIMARY_BOOTSTRAP_COMPLETE", "protocolSha256": sha(PROTO), "inputs": {"step39EvaluationSha256": sha(EV), "step39SummarySha256": sha(SM)},
              "primary": {"samplingUnit": "window", "samplingFrame": windows, "samplingFrameSize": 9, "windowsWithValidPair": avail_w, "windowsNotAvailable": [w for w in windows if delta_w[w] == NA], "Delta_w_km": delta_w, "validDriftersPerWindow": {w: len(v) for w, v in per.items()}, "ThetaObserved_km": theta_obs,
                          "B_requested": B, "seed": SEED, "rng": "numpy.random.default_rng(20260907); rng.integers(0, 9, size=9) per replicate, sequential", "availableReplicates": int(len(stats)), "notAvailableReplicates": int(na_count), "redrawn": 0, "driftersResampledIndependently": False, "trajectoryPointsResampled": False, "windowWeighting": "equal (a window drawn k times contributes k times)", "imputation": 0,
                          "quantileMethod": "linear", "quantiles": [0.025, 0.975], "Q0.025_km": round(float(q[0]), 6), "Q0.975_km": round(float(q[1]), 6), "bootstrapMedian_km": round(float(np.median(arr)), 6), "bootstrapMean_km": round(float(arr.mean()), 6), "replicatesSha256": sha(out / "step40-bootstrap-replicates.csv"), "statisticSha256": hashlib.sha256(np.round(arr, 9).tobytes()).hexdigest(),
                          "smallClusterLimitation": "9 registered windows, 6 with a valid pair: the interval is an uncertainty estimate under the preregistered window-level resampling scheme and is not to be interpreted as establishing asymptotic normality or nominal coverage"},
              "successRule": {"criterion": "label CANDIDATE_DESCRIPTIVELY_FAVORED AND window-level 95 % interval entirely < 0 km (upper_95 < 0)", "descriptiveLabel_step30aRule": label, "upper95BelowZero": bool(float(q[1]) < 0.0), "H1": "SUPPORTED" if success else "NOT_SUPPORTED", "operationalWinnerDeclared": False, "modelSelectionChanged": False, "candidateStatus": "CANDIDATE_ONLY", "baselineStatus": "FROZEN_REFERENCE_BASELINE"},
              "sensitivityOnly": {"role": "SECONDARY / SENSITIVITY ONLY (ignores clustering; never replaces the primary window-level interval)", "unit": "drifter pair", "n": n, "B": B, "seed": SEED, "generator": "separate numpy.random.default_rng(20260907)", "pooledMedianObserved_km": round(median(pooled), 3), "Q0.025_km": round(float(sq[0]), 6), "Q0.975_km": round(float(sq[1]), 6)},
              "environment": {"numpy": np.__version__, "python": sys.version.split()[0]}, "createdAtUTC": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "deterministic": True}
    (out / "step40-bootstrap-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": result["status"], "Theta": theta_obs, "CI95": [result["primary"]["Q0.025_km"], result["primary"]["Q0.975_km"]], "available": len(stats), "NA": na_count, "H1": result["successRule"]["H1"], "sensitivityCI": [result["sensitivityOnly"]["Q0.025_km"], result["sensitivityOnly"]["Q0.975_km"]]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
