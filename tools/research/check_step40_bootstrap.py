"""Independent validator for STEP 40 (primary window-level bootstrap). exit 0 = PASS. Verifies: STEP 39 execution identity (evaluation,
summary, record, run manifests at the SHAs recorded in the STEP 40 protocol; STEP 39 trajectories unchanged) · STEP 37 preregistration
identity (74d19f0a files unchanged) and STEP 38 lock ancestry · 9-window sampling frame · B = 10000 · seed = 20260907 ·
numpy.random.default_rng · window-level resampling (replicate window indices re-drawn with the same generator and compared row by row) ·
no independent drifter resampling for the primary · no imputation (NA windows contribute nothing) · no redraw (NA replicates counted, kept)
· quantile method linear, q = 0.025 / 0.975 · observed Theta = -31.331 km · exact frozen Delta_w values · deterministic replay (the whole
bootstrap recomputed in-process from the frozen deltas; statistics, quantiles and replicate CSV byte-identical; tool re-run with --out
byte-identical) · success rule unchanged · no model / parameter / cohort change. Deterministic output."""
import csv
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
PROTO, RES, REP, EV, SM = D / "step40-bootstrap-protocol.json", D / "step40-bootstrap-result.json", D / "step40-bootstrap-replicates.csv", D / "step39-evaluation.json", D / "step39-summary.json"
NA = "NOT_AVAILABLE"
FROZEN_DELTA = {"GS-Y1": -17.872, "GS-Y2": -5.615, "GS-Y3": -21.379, "GS-Y4": -41.283, "GS-Y5": NA, "GS-Y6": -65.774, "GS-Y7": NA, "GS-Y8": NA, "GS-Y9": -78.371}
STEP37 = {"docs/research/step37-experiment-preregistration-protocol.json": "eae40cde", "docs/research/step37-experiment-preregistration-status.json": "61de721a", "tools/research/check_step37_experiment_preregistration.py": "679eec94"}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def median(v):
    v = sorted(v); m = len(v) // 2
    return v[m] if len(v) % 2 else (v[m - 1] + v[m]) / 2


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for short in ("155995dd", "ee64354d", "043a09b8", "74d19f0a", "23e78f86"):
        check(git("cat-file", "-t", short).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", short, "HEAD").returncode == 0, f"ancestry: {short}")
    P, R, ev, sm = load(PROTO), load(RES), load(EV), load(SM)
    for rel, expected in P["inputs"].items():
        if rel.endswith("Sha256"):
            continue
    for rel, expected in P["frozen"].items():
        check(sha(ROOT / rel) == expected, f"STEP 39 / 37 / 38 record unchanged: {rel}")
    check(all(sha(ROOT / f).startswith(h) for f, h in STEP37.items()), "STEP 37 preregistration identity unchanged")
    check(P["inputs"]["step39EvaluationSha256"] == sha(EV) == R["inputs"]["step39EvaluationSha256"] and P["inputs"]["step39SummarySha256"] == sha(SM) == R["inputs"]["step39SummarySha256"] and R["protocolSha256"] == sha(PROTO) and P["tools"]["tools/research/bootstrap_step40.py"] == sha(ROOT / "tools/research/bootstrap_step40.py") and P["tools"]["tools/research/check_step40_bootstrap.py"] == sha(__file__), "STEP 39 execution identity and tool lock")
    for name in ("step39-temporal-run-manifest.json", "step39-candidate-run-manifest.json"):
        for r in load(D / name)["runs"]:
            check(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"], f"STEP 39 trajectory unchanged: {r['runId']}")
    pr = R["primary"]; windows = pr["samplingFrame"]
    check(windows == list(sm["primary"]["Delta_w"].keys()) and len(windows) == 9 == pr["samplingFrameSize"] and pr["samplingUnit"] == "window", "9-window sampling frame")
    check(pr["B_requested"] == 10000 and pr["seed"] == 20260907 and "default_rng(20260907)" in pr["rng"] and "integers(0, 9, size=9)" in pr["rng"], "B = 10000, seed = 20260907, numpy default_rng")
    check(pr["Delta_w_km"] == FROZEN_DELTA and {w: (round(float(x["Delta_w"]), 3) if x["Delta_w"] != NA else NA) for w, x in sm["primary"]["Delta_w"].items()} == FROZEN_DELTA and pr["ThetaObserved_km"] == -31.331 == round(float(sm["primary"]["Theta_km"]), 3), "exact frozen Delta_w values and observed Theta = -31.331 km")
    check(pr["driftersResampledIndependently"] is False and pr["trajectoryPointsResampled"] is False and pr["imputation"] == 0 and pr["redrawn"] == 0 and pr["quantileMethod"] == "linear" and pr["quantiles"] == [0.025, 0.975] and pr["windowWeighting"].startswith("equal"), "window-level resampling flags; no drifter resampling; no imputation; no redraw; quantile linear 0.025/0.975")
    # ---- deterministic in-process replay ----
    per = {w: [] for w in windows}
    for d in ev["primaryDeltas72h"]:
        if d["delta_i"] != NA:
            per[d["window"]].append(float(d["delta_i"]))
    rng = np.random.default_rng(20260907); stats = []; na = 0; rows = []
    for b in range(10000):
        idx = rng.integers(0, 9, size=9); vals = [median(per[windows[int(i)]]) for i in idx if per[windows[int(i)]]]
        if vals:
            tb = median(vals); stats.append(tb); rows.append([str(b + 1), " ".join(str(int(i)) for i in idx), str(len(vals)), f"{tb:.6f}"])
        else:
            na += 1; rows.append([str(b + 1), " ".join(str(int(i)) for i in idx), "0", NA])
    arr = np.array(stats); q = np.quantile(arr, [0.025, 0.975], method="linear")
    with open(REP, encoding="utf-8", newline="") as fh:
        rd = csv.reader(fh); header = next(rd); rec_rows = [r for r in rd]
    check(header == ["replicate", "window_indices", "available_windows", "Theta_b_km"] and rec_rows == rows and len(rec_rows) == 10000 and pr["replicatesSha256"] == sha(REP), "deterministic replay: replicate window indices and statistics identical row by row (10000)")
    check(pr["availableReplicates"] == len(stats) and pr["notAvailableReplicates"] == na and len(stats) + na == 10000 and abs(pr["Q0.025_km"] - round(float(q[0]), 6)) < 1e-9 and abs(pr["Q0.975_km"] - round(float(q[1]), 6)) < 1e-9 and pr["statisticSha256"] == hashlib.sha256(np.round(arr, 9).tobytes()).hexdigest() and abs(pr["bootstrapMedian_km"] - round(float(np.median(arr)), 6)) < 1e-9, "quantiles, counts and statistic hash reproduced")
    sr = R["successRule"]; label = sm["primary"]["descriptiveLabel_step30aRule_pooledPairs"]
    check(sr["descriptiveLabel_step30aRule"] == label and sr["upper95BelowZero"] == (pr["Q0.975_km"] < 0) and sr["H1"] == ("SUPPORTED" if label == "CANDIDATE_DESCRIPTIVELY_FAVORED" and pr["Q0.975_km"] < 0 else "NOT_SUPPORTED") and sr["criterion"].startswith("label CANDIDATE_DESCRIPTIVELY_FAVORED AND window-level 95 % interval entirely < 0 km") and sr["operationalWinnerDeclared"] is False and sr["modelSelectionChanged"] is False and sr["candidateStatus"] == "CANDIDATE_ONLY", "primary success rule evaluated unchanged; no operational winner")
    se = R["sensitivityOnly"]; check(se["role"].startswith("SECONDARY / SENSITIVITY ONLY") and se["unit"] == "drifter pair" and se["B"] == 10000 and se["seed"] == 20260907, "sensitivity bootstrap labelled secondary only")
    check(pr["smallClusterLimitation"].startswith("9 registered windows") and "not to be interpreted as establishing asymptotic normality" in pr["smallClusterLimitation"], "small-cluster limitation stated")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/bootstrap_step40.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        a, b = load(Path(tmp) / "step40-bootstrap-result.json") if proc.returncode == 0 else {}, R
        check(proc.returncode == 0 and sha(Path(tmp) / "step40-bootstrap-replicates.csv") == sha(REP) and {k: v for k, v in a.items() if k != "createdAtUTC"} == {k: v for k, v in b.items() if k != "createdAtUTC"}, "tool re-run byte-identical (replicates CSV) and result identical except createdAtUTC")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "Theta": pr["ThetaObserved_km"], "CI95": [pr["Q0.025_km"], pr["Q0.975_km"]], "available": pr["availableReplicates"], "NA": pr["notAvailableReplicates"], "H1": sr["H1"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
