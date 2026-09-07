"""STEP 50 - preregistered window-level percentile bootstrap for the independent validation extension (STEP 46 field 15).
Input: the STEP 50 aggregation of the FROZEN STEP 49 execution only; no trajectory, forcing or observation is read or re-run.
Primary, per horizon h in 24/48/72 h: sampling unit = WINDOW; sampling frame = ALL 6 REGISTERED extension windows, NOT_AVAILABLE windows
included; B = 10000; one generator numpy.random.default_rng(20260946) used sequentially per horizon (a fresh stream per horizon so the
result never depends on the order in which horizons are computed; the 72 h primary therefore matches the preregistered single-generator
specification exactly); per replicate idx = rng.integers(0, 6, size=6), windows drawn WITH REPLACEMENT, a window drawn k times contributes
k times, every valid drifter delta of a drawn window retained and Delta_w recomputed (asserted equal to the frozen aggregation value);
Theta_b = median over the drawn windows that have >= 1 valid pair; a replicate with no available window is NOT_AVAILABLE, counted, and
NEVER redrawn. Interval = numpy.quantile(available Theta_b, [0.025, 0.975], method='linear'), full precision preserved.
Sensitivity only (STEP 46, never replaces the primary and never used for H_EXT): drifter-level bootstrap of the pooled median with a
separate numpy.random.default_rng(20260946), B = 10000.
H_EXT is evaluated here for the first time, strictly by the STEP 46 preregistered rule; the alternative descriptive-favour criterion stated
in the STEP 50 directive is also evaluated and reported side by side, never merged.
Writes data/research/step50/step50-bootstrap-replicates-{h}.csv and step50-bootstrap.json (`--out DIR` for the independent replay)."""
import csv
import hashlib
import io
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
OUT = ROOT / "data/research/step50"
AGG = OUT / "step50-aggregation.json"
NA = "NOT_AVAILABLE"
H = (24, 48, 72)
B = 10000
SEED = 20260946
WINDOWS = ["KE-X1", "KE-X2", "KE-X3", "KE-X4", "BM-X5", "BM-X6"]
GATE_MIN_VALID_WINDOWS = 4


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def canonical(v):
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def median(v):
    v = sorted(v)
    m = len(v) // 2
    return v[m] if len(v) % 2 else (v[m - 1] + v[m]) / 2


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else OUT
    out.mkdir(parents=True, exist_ok=True)
    agg_path = (Path(argv[argv.index("--agg") + 1]) if "--agg" in argv else AGG)
    A = load(agg_path)
    if A["registeredWindows"] != WINDOWS or A["status"] != "AGGREGATION_COMPLETE":
        raise SystemExit("STEP50_BLOCKED_IMMUTABILITY: aggregation identity")
    results = {}
    for h in H:
        pw = A["perWindow"][f"{h}h"]
        per = {w: list(pw[w]["deltas_km"]) for w in WINDOWS}                     # valid drifter deltas per window
        frozen = {w: pw[w]["Delta_w_km"] for w in WINDOWS}
        for w in WINDOWS:                                                        # Delta_w recomputation must reproduce the frozen value
            rec = round(median(per[w]), 6) if per[w] else NA
            if rec != frozen[w]:
                raise SystemExit(f"STEP50_BLOCKED: Delta_w recomputed differs from the aggregation at {w} {h}h: {rec} vs {frozen[w]}")
        rng = np.random.default_rng(SEED)                                        # fresh stream per horizon
        stats, na_count, rows = [], 0, []
        for b in range(B):
            idx = rng.integers(0, len(WINDOWS), size=len(WINDOWS))
            vals = [median(per[WINDOWS[int(i)]]) for i in idx if per[WINDOWS[int(i)]]]
            if vals:
                tb = median(vals); stats.append(tb)
                rows.append([str(b + 1), " ".join(str(int(i)) for i in idx), str(len(vals)), f"{tb:.6f}"])
            else:
                na_count += 1
                rows.append([str(b + 1), " ".join(str(int(i)) for i in idx), "0", NA])
        arr = np.array(stats, dtype=float)
        q = np.quantile(arr, [0.025, 0.975], method="linear")
        buf = io.StringIO(newline=""); wcsv = csv.writer(buf, lineterminator="\n")
        wcsv.writerow(["replicate", "window_indices", "available_windows", "Theta_b_km"]); wcsv.writerows(rows)
        rep = out / f"step50-bootstrap-replicates-{h}h.csv"; rep.write_text(buf.getvalue(), encoding="utf-8")
        results[f"{h}h"] = {"samplingUnit": "window", "samplingFrame": WINDOWS, "samplingFrameSize": len(WINDOWS),
                            "naWindowsIncludedInFrame": [w for w in WINDOWS if frozen[w] == NA],
                            "Delta_w_km": frozen, "ThetaObserved_km": A["theta"][f"{h}h"]["Theta_extension_km"],
                            "B_requested": B, "seed": SEED, "rng": f"numpy.random.default_rng({SEED}); rng.integers(0, 6, size=6) per replicate, sequential; fresh stream per horizon",
                            "withReplacement": True, "availableReplicates": int(len(stats)), "notAvailableReplicates": int(na_count),
                            "redrawn": 0, "driftersResampledIndependently": False, "trajectoryPointsResampled": False,
                            "windowWeighting": "equal (a window drawn k times contributes k times)", "imputation": 0,
                            "quantileMethod": "linear", "quantiles": [0.025, 0.975],
                            "Q0.025_km": float(q[0]), "Q0.975_km": float(q[1]),
                            "Q0.025_km_rounded6": round(float(q[0]), 6), "Q0.975_km_rounded6": round(float(q[1]), 6),
                            "bootstrapMedian_km": float(np.median(arr)), "bootstrapMean_km": float(arr.mean()),
                            "replicatesFile": str(rep.relative_to(ROOT)).replace("\\", "/") if rep.is_relative_to(ROOT) else rep.name,
                            "replicatesSha256": sha(rep), "statisticSha256": hashlib.sha256(np.round(arr, 9).tobytes()).hexdigest()}
    # ---- sensitivity only (never replaces the primary, never used for H_EXT) ----
    sens = {}
    for h in H:
        pooled = sorted(x for w in WINDOWS for x in A["perWindow"][f"{h}h"][w]["deltas_km"])
        rng2 = np.random.default_rng(SEED); n = len(pooled); vals = []
        for _ in range(B):
            vals.append(median([pooled[int(i)] for i in rng2.integers(0, n, size=n)]))
        sq = np.quantile(np.array(vals), [0.025, 0.975], method="linear")
        sens[f"{h}h"] = {"role": "SECONDARY / SENSITIVITY ONLY (ignores window clustering; never replaces the primary interval; never used for H_EXT)",
                         "unit": "drifter pair", "n": n, "B": B, "seed": SEED, "generator": f"separate numpy.random.default_rng({SEED})",
                         "pooledMedianObserved_km": round(median(pooled), 6), "Q0.025_km": float(sq[0]), "Q0.975_km": float(sq[1])}
    # ---- H_EXT, first evaluation, strictly by the STEP 46 preregistered rule ----
    dfv = A["descriptiveFavour"]
    valid_windows_72 = A["theta"]["72h"]["windowsWithValidPair"]
    gate = valid_windows_72 >= GATE_MIN_VALID_WINDOWS
    upper72 = results["72h"]["Q0.975_km"]
    prereg_fav = dfv["preregisteredCriterion_step46"]["candidateFavored"]
    directive_fav = dfv["directiveCriterion_step50"]["candidateFavored"]
    def decide(fav):
        if not gate:
            return "BLOCKED"
        return "SUPPORTED" if (fav and upper72 < 0) else "NOT_SUPPORTED"
    h_prereg, h_directive = decide(prereg_fav), decide(directive_fav)
    doc = {"schemaVersion": "1.0", "ruleId": "validation-extension-preregistration-step46", "step": 50,
           "classification": "VALIDATION_EXTENSION_PRIMARY_BOOTSTRAP", "status": "BOOTSTRAP_COMPLETE",
           "aggregationSha256": sha(agg_path), "step49EndpointRawSha256": A["inputs"]["step49EndpointRawSha256"],
           "primary": results, "sensitivityOnly": sens,
           "gate": {"validWindows72h": valid_windows_72, "required": GATE_MIN_VALID_WINDOWS, "satisfied": gate,
                    "cohortGateWindows": 6, "cohortGateDrifters": 25},
           "decision": {"rule": "STEP 46: H_EXT SUPPORTED iff descriptive label == CANDIDATE_EXTENSION_DESCRIPTIVELY_FAVORED AND window-level Q0.975 < 0 km AND the gate is satisfied; BLOCKED if the gate fails",
                        "horizonUsed": "72h", "ThetaObserved_72h_km": results["72h"]["ThetaObserved_km"],
                        "Q0.975_72h_km": upper72, "upper95BelowZero": bool(upper72 < 0), "gateSatisfied": gate,
                        "preregisteredCriterion": {"source": "STEP 46 field 16 (frozen STEP 30A rule on pooled 72 h pairs)",
                                                   "label": dfv["preregisteredCriterion_step46"]["label"], "candidateFavored": prereg_fav, "H_EXT": h_prereg},
                        "directiveCriterion": {"source": "STEP 50 directive section 9 (Theta_extension(72h) < 0)",
                                               "candidateFavored": directive_fav, "H_EXT": h_directive},
                        "criteriaAgreeOnFavour": prereg_fav == directive_fav,
                        "criteriaAgreeOnDecision": h_prereg == h_directive,
                        "H_EXT": h_prereg,
                        "H_EXT_basis": "the STEP 46 preregistered criterion governs; the directive criterion is recorded beside it and is not merged",
                        "operationalPromotion": False, "productionClaim": False, "candidateStatus": "CANDIDATE_ONLY"},
           "primaryExperimentUntouched": {"Theta_km": -31.331, "CI95_km": [-72.0725, -11.7435], "H1": "SUPPORTED",
                                          "recomputed": False, "pooledWithExtension": False, "metaAnalysis": False},
           "noTrajectoryReRun": True, "noSourceModification": True, "noParameterTuning": True, "noCohortChange": True,
           "resultDrivenRerun": False}
    p = out / "step50-bootstrap.json"; p.write_bytes(canonical(doc) + b"\n")
    print(json.dumps({"status": doc["status"],
                      "theta": {k: results[k]["ThetaObserved_km"] for k in results},
                      "CI": {k: [results[k]["Q0.025_km_rounded6"], results[k]["Q0.975_km_rounded6"]] for k in results},
                      "available": {k: results[k]["availableReplicates"] for k in results},
                      "NA": {k: results[k]["notAvailableReplicates"] for k in results},
                      "H_EXT": doc["decision"]["H_EXT"], "prereg": h_prereg, "directive": h_directive,
                      "criteriaAgreeOnDecision": doc["decision"]["criteriaAgreeOnDecision"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
