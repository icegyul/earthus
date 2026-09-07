"""STEP 50 - endpoint aggregation for the independent validation extension, from the FROZEN STEP 49 execution only.
Consumes docs/research/step49-validation-extension-execution-manifest.json and data/research/step49/step49-endpoint-raw.json; reads no
observation, forcing or trajectory source and re-runs nothing. Per horizon h in 24/48/72 h and per registered window w:
Delta_w(h) = median over the window's VALID C-A paired drifter deltas delta_i(h) = E_C,i(h) - E_A,i(h) (haversine, R = 6371008.8 m, km);
a window with no valid pair at h is NOT_AVAILABLE and is excluded from Theta at that horizon but stays in the bootstrap sampling frame.
Theta_extension(h) = median over the windows with >= 1 valid pair, EQUAL WINDOW WEIGHTING (a window with more drifters is not weighted more;
the pooled drifter median is descriptive only and is never the primary endpoint).
Also records, descriptively: pooled drifter medians, win/loss/tie counts, the frozen STEP 30A label on the pooled 72 h pairs (the STEP 46
preregistered descriptive-favour criterion) and, separately, the sign of Theta_extension(72h) (the criterion stated in the STEP 50
directive), so any divergence between the two is visible rather than silently resolved. No imputation, no substitution, no exclusion.
Writes data/research/step50/step50-aggregation.json (`--out DIR` for the independent replay)."""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
S49 = ROOT / "data/research/step49"
OUT = ROOT / "data/research/step50"
EXEC_MAN = D / "step49-validation-extension-execution-manifest.json"
RAW = S49 / "step49-endpoint-raw.json"
RULE30 = D / "step30a-rule.json"
NA = "NOT_AVAILABLE"
H = (24, 48, 72)
TIE = 1e-6
WINDOWS = ["KE-X1", "KE-X2", "KE-X3", "KE-X4", "BM-X5", "BM-X6"]


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def canonical(v):
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def median(vals):
    v = sorted(vals)
    if not v:
        return None
    m = len(v) // 2
    return v[m] if len(v) % 2 else (v[m - 1] + v[m]) / 2


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else OUT
    out.mkdir(parents=True, exist_ok=True)
    EM, R = load(EXEC_MAN), load(RAW)
    if EM["endpointRawMaterial"]["sha256"] != sha(RAW):
        raise SystemExit("STEP50_BLOCKED_IMMUTABILITY: STEP 49 endpoint raw material")
    if EM["gate"]["executionGate"]["result"] != "PASS":
        raise SystemExit("STEP50_BLOCKED: STEP 49 execution gate did not pass")
    rows = R["rows"]
    registered = sorted({r["window"] for r in rows})
    if registered != sorted(WINDOWS) or len(rows) != 25:
        raise SystemExit(f"STEP50_BLOCKED_IMMUTABILITY: cohort differs ({registered}, {len(rows)} rows)")
    per_window, theta, pooled = {}, {}, {}
    for h in H:
        key = f"delta_CA_{h}h"
        pw = {}
        for w in WINDOWS:
            vals = [r[key] for r in rows if r["window"] == w and r[key] != NA]
            pw[w] = {"validPairs": len(vals), "registeredDrifters": sum(1 for r in rows if r["window"] == w),
                     "Delta_w_km": round(median(vals), 6) if vals else NA,
                     "deltas_km": sorted(vals), "status": "VALID" if vals else NA}
        avail = [pw[w]["Delta_w_km"] for w in WINDOWS if pw[w]["Delta_w_km"] != NA]
        per_window[f"{h}h"] = pw
        theta[f"{h}h"] = {"Theta_extension_km": round(median(avail), 6) if avail else NA,
                          "windowsWithValidPair": len(avail), "windowsNotAvailable": [w for w in WINDOWS if pw[w]["Delta_w_km"] == NA],
                          "weighting": "equal window weighting", "registeredWindows": len(WINDOWS)}
        allv = sorted(r[key] for r in rows if r[key] != NA)
        wins = sum(1 for x in allv if x < -TIE); losses = sum(1 for x in allv if x > TIE); ties = len(allv) - wins - losses
        pooled[f"{h}h"] = {"role": "DESCRIPTIVE ONLY - not the primary endpoint", "n": len(allv),
                           "pooledMedian_km": round(median(allv), 6) if allv else NA,
                           "wins_candidate": wins, "losses_candidate": losses, "ties": ties,
                           "notAvailable": sum(1 for r in rows if r[key] == NA)}
    # frozen STEP 30A descriptive label on the pooled 72 h pairs (the STEP 46 preregistered criterion)
    p72 = pooled["72h"]; nontied = p72["wins_candidate"] + p72["losses_candidate"]
    favored = p72["pooledMedian_km"] != NA and p72["pooledMedian_km"] < 0 and nontied > 0 and p72["wins_candidate"] / nontied >= 2 / 3
    hycom_fav = p72["pooledMedian_km"] != NA and p72["pooledMedian_km"] > 0 and nontied > 0 and p72["losses_candidate"] / nontied >= 2 / 3
    label = "CANDIDATE_EXTENSION_DESCRIPTIVELY_FAVORED" if favored else ("HYCOM_EXTENSION_DESCRIPTIVELY_FAVORED" if hycom_fav else "NO_CLEAR_EXTENSION_DIFFERENCE")
    theta72 = theta["72h"]["Theta_extension_km"]
    doc = {"schemaVersion": "1.0", "ruleId": "validation-extension-preregistration-step46", "step": 50,
           "classification": "VALIDATION_EXTENSION_ENDPOINT_AGGREGATION", "status": "AGGREGATION_COMPLETE",
           "inputs": {"step49ExecutionManifestSha256": sha(EXEC_MAN), "step49EndpointRawSha256": sha(RAW),
                      "step49EndpointTableSha256": R["tableSha256"], "step30aRuleSha256": sha(RULE30),
                      "trajectoriesReRun": 0, "observationsRead": 0, "forcingRead": 0},
           "endpointDefinition": {"perDrifter": "delta_i(h) = E_C,i(h) - E_A,i(h); E = haversine(model, observed) at exactly t0+h, R = 6371008.8 m, km",
                                  "window": "Delta_w(h) = median over the window's VALID C-A paired drifter deltas",
                                  "primary": "Theta_extension(h) = median over windows with >= 1 valid pair",
                                  "weighting": "equal window weighting; drifter-count never weights a window",
                                  "pooledDrifterMedian": "DESCRIPTIVE ONLY, never the primary endpoint",
                                  "naHandling": "a window without a valid pair is NOT_AVAILABLE, excluded from Theta at that horizon, and RETAINED in the bootstrap sampling frame; never imputed"},
           "registeredWindows": WINDOWS, "registeredDrifters": len(rows),
           "perWindow": per_window, "theta": theta, "pooledDescriptive": pooled,
           "validWindowCount72h": theta["72h"]["windowsWithValidPair"],
           "windowStatus72h": {w: per_window["72h"][w]["status"] for w in WINDOWS},
           "descriptiveFavour": {
               "preregisteredCriterion_step46": {"source": "STEP 46 field 16 successCriterion.descriptiveLabel (frozen STEP 30A rule on pooled 72 h pairs)",
                                                 "pooledMedian_km": p72["pooledMedian_km"], "wins": p72["wins_candidate"], "losses": p72["losses_candidate"],
                                                 "ties": p72["ties"], "nonTied": nontied, "winShare": round(p72["wins_candidate"] / nontied, 6) if nontied else None,
                                                 "label": label, "candidateFavored": label == "CANDIDATE_EXTENSION_DESCRIPTIVELY_FAVORED"},
               "directiveCriterion_step50": {"source": "STEP 50 directive section 9 (Theta_extension(72h) < 0)",
                                             "Theta_extension_72h_km": theta72, "candidateFavored": theta72 != NA and theta72 < 0},
               "criteriaAgree": (label == "CANDIDATE_EXTENSION_DESCRIPTIVELY_FAVORED") == (theta72 != NA and theta72 < 0),
               "note": "both are recorded; the STEP 46 preregistered criterion governs. A divergence is reported, never silently resolved."},
           "missingness": {"rows": [{"window": r["window"], "drifterId": r["drifter_id"], "missingSide72h": r["missingSide_CA_72h"],
                                     "reason72h": r["invalidReason_CA_72h"], "finalStatusA": r["finalStatus_A"], "finalStatusB": r["finalStatus_B"], "finalStatusC": r["finalStatus_C"]}
                                    for r in rows if r["invalidReason_CA_72h"]],
                           "imputation": 0, "substitution": 0, "manualExclusion": 0, "windowsAddedOrRemoved": 0},
           "cohortModified": False, "sourceModified": False, "parametersTuned": False, "trajectoriesReExecuted": False}
    p = out / "step50-aggregation.json"; p.write_bytes(canonical(doc) + b"\n")
    print(json.dumps({"status": doc["status"], "theta": {k: v["Theta_extension_km"] for k, v in theta.items()},
                      "validWindows": {k: v["windowsWithValidPair"] for k, v in theta.items()},
                      "label72h": label, "thetaNegative72h": theta72 != NA and theta72 < 0, "criteriaAgree": doc["descriptiveFavour"]["criteriaAgree"],
                      "aggregationSha256": sha(p)[:16]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
