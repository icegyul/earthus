"""Independent fail-closed validator for STEP 43 (reproducibility verification of the locked STEP 36-42 result). exit 0 = PASS.
Independently (without reading the record's own reconstructed values first) re-derives from the frozen committed records:
ancestry of STEP 36 / 37 / 38 / 40 / 41 / 42 and runtime 155995dd, STEP 42 parent = 43dd07ff (descendant of STEP 41) · STEP 42 blobs and
working copies at the expected SHA-256, exactly two research files in the STEP 42 commit · every research file of the STEP 36 / 37 / 38 /
40 / 41 / 42 lock commits byte-identical to its commit · Delta_w (re-aggregated from step39-evaluation.json per-drifter deltas), valid
windows, Theta, replicate counts (re-counted from the stored replicate CSV), stored interval, seed, H1, candidate status, promotion ·
secondary / sensitivity values · missingness facts from the execution record · interpretation-safety wording of the STEP 42 report ·
then checks that docs/research/step43-reproducibility-verification.json records exactly these findings and finalStatus PASS.
No trajectory, bootstrap, acquisition or statistical test is performed. Deterministic output."""
import csv
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
REC = D / "step43-reproducibility-verification.json"
NA = "NOT_AVAILABLE"
C = {"step36": "043a09b8539955868651a06e7c2c44e3c606803f", "step37": "74d19f0a9661a41d63a08c56bbd3f91e9d8b312d", "step38": "23e78f863fb092aa9e3c36e4d74d4afd4393e7f4",
     "step40": "2b1a7baa7ef9e69d25cecbff2b09fca8700fca80", "step41": "9a3223089099bcb09a2589cc8a4bda82fcb47ae5", "step42": "bae85245e827f53ee9782201c442ea7849c04e82"}
UI = "43dd07ff6ed6ee53ec5e2d565e4cf499dae57b55"
S42 = {"docs/research/step42-final-scientific-results-report.md": "c490669413a83bee73a2a33733432073f3e898ee52ce47722b4b365a5da5f1f0", "tools/research/check_step42_final_report.py": "ba9f7fe334dc71b499152460f20d2292b6fd4fc194b3c7c56475d16de26a3111"}
EXP_DELTA = {"GS-Y1": -17.872, "GS-Y2": -5.615, "GS-Y3": -21.379, "GS-Y4": -41.283, "GS-Y5": NA, "GS-Y6": -65.774, "GS-Y7": NA, "GS-Y8": NA, "GS-Y9": -78.371}
EXP_CI = [-72.0725, -11.7435]
FORBIDDEN = ["operational superiority is established", "production ready", "production-ready", "universally superior", "globally superior", "proof that", "causal", "statistically proven", "proven", "operationally superior"]
NEGATED = ["does not establish operational superiority", "no causal attribution", "no causal claim", "not be interpreted as\nuniversal or operational model superiority", "does not establish universal superiority"]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def is_ancestor(a, b):
    return git("merge-base", "--is-ancestor", a, b).returncode == 0


def med(v):
    v = sorted(v); m = len(v) // 2
    return v[m] if len(v) % 2 else (v[m - 1] + v[m]) / 2


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    # 1 ancestry
    for k, c in {**C, "runtime": "155995dd"}.items():
        check(git("cat-file", "-t", c).stdout.strip() == "commit" and is_ancestor(c, "HEAD"), f"ancestry: {k}")
    check(git("show", "-s", "--format=%P", C["step42"]).stdout.split() == [UI], "STEP 42 parent is 43dd07ff")
    check(is_ancestor(C["step41"], UI) and git("show", "-s", "--format=%P", UI).stdout.split() == [C["step41"]], "43dd07ff is a descendant (direct child) of STEP 41")
    # 2 STEP 42 immutability
    files42 = git("show", "--format=", "--name-only", C["step42"]).stdout.split()
    check(sorted(files42) == sorted(S42), f"STEP 42 commit contains exactly the two research files: {files42}")
    for f, h in S42.items():
        blob = hashlib.sha256(subprocess.run(["git", "cat-file", "blob", f"{C['step42']}:{f}"], cwd=ROOT, capture_output=True).stdout).hexdigest()
        check(blob == h and sha(ROOT / f) == h, f"STEP 42 SHA-256 (blob and working copy): {f}")
    # 3 STEP 36-41 (+42) immutability
    modified = {}
    for k, c in C.items():
        fl = [f for f in git("show", "--format=", "--name-only", c).stdout.split() if f.startswith(("docs/research/", "tools/research/"))]
        modified[k] = [f for f in fl if git("rev-parse", f"{c}:{f}").stdout.strip() != git("hash-object", f).stdout.strip()]
        check(fl and not modified[k], f"locked research files byte-identical to commit: {k} {modified[k]}")
    # 4 reconstruct primary
    EV, SM, R = load(D / "step39-evaluation.json"), load(D / "step39-summary.json"), load(D / "step40-bootstrap-result.json"); pr, sr, se = R["primary"], R["successRule"], R["sensitivityOnly"]
    per = {f"GS-Y{i}": [] for i in range(1, 10)}
    for d in EV["primaryDeltas72h"]:
        if d["delta_i"] != NA:
            per[d["window"]].append(float(d["delta_i"]))
    dw = {w: (round(med(v), 3) if v else NA) for w, v in per.items()}; valid = [w for w in dw if dw[w] != NA]; theta = round(med([dw[w] for w in valid]), 3)
    check(dw == EXP_DELTA == pr["Delta_w_km"], "Delta_w re-aggregated == expected == STEP 40 record")
    check(len(valid) == 6 and theta == -31.331 == pr["ThetaObserved_km"] == round(SM["primary"]["Theta_km"], 3), "6 valid windows; Theta -31.331 km")
    with open(D / "step40-bootstrap-replicates.csv", encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    avail = sum(r["Theta_b_km"] != NA for r in rows); na = len(rows) - avail
    check(len(rows) == 10000 == pr["B_requested"] and pr["seed"] == 20260907 and avail == 9999 == pr["availableReplicates"] and na == 1 == pr["notAvailableReplicates"], "B 10000, seed 20260907, replicates 9999 / 1 (re-counted)")
    check([pr["Q0.025_km"], pr["Q0.975_km"]] == EXP_CI and sr["H1"] == "SUPPORTED" and sr["descriptiveLabel_step30aRule"] == "CANDIDATE_DESCRIPTIVELY_FAVORED" and sr["candidateStatus"] == "CANDIDATE_ONLY" and sr["operationalWinnerDeclared"] is False and sr["modelSelectionChanged"] is False, "stored interval, H1, candidate status, no promotion")
    # 5 secondary / sensitivity
    n, p = SM["secondary"]["nested"], SM["secondary"]["pooled"]
    check([round(n["delta_CA_24h"]["Theta"], 3), round(n["delta_CA_48h"]["Theta"], 3)] == [-8.105, -30.150] and [p[f"delta_CA_{h}"]["pooledMedian"]["median"] for h in ("24h", "48h", "72h")] == [-9.229, -23.862, -23.981], "secondary C-A values")
    check([round(n[f"delta_BA_{h}"]["Theta"], 3) for h in ("24h", "48h", "72h")] == [1.171, 3.308, 9.440] and SM["secondary"]["temporalLabel72h_step32Rule_pooledPairs"] == "NO_CLEAR_TEMPORAL_DIFFERENCE", "B-A values and temporal label")
    check(se["unit"] == "drifter pair" and se["n"] == 16 and se["pooledMedianObserved_km"] == -23.981 and [se["Q0.025_km"], se["Q0.975_km"]] == [-36.316, -6.626] and se["B"] == 10000, "sensitivity values")
    # 6 missingness
    X = load(D / "step39-execution-record.json"); G = X["G_invalidOrBlocked"]; K = {(d["window"], d["drifter_id"]): d["delta_i"] for d in X["K_primaryDeltas72h"]}; av = SM["availability"]
    st = lambda w, c: next((g["finalStatusCounts"] for g in G if g["window"] == w and g["condition"] == c), {})
    check(st("GS-Y7", "A") == st("GS-Y7", "B") == st("GS-Y7", "C") == {"OUT_OF_DOMAIN": 1} and K[("GS-Y7", "92869")] == NA, "GS-Y7 / 92869 OUT_OF_DOMAIN, 72 h NA")
    check(st("GS-Y8", "A") == st("GS-Y8", "B") == st("GS-Y8", "C") == {"FORCING_UNAVAILABLE": 1} and K[("GS-Y8", "88532")] == NA, "GS-Y8 / 88532 FORCING_UNAVAILABLE, 72 h NA")
    check(st("GS-Y5", "C") == {"FORCING_UNAVAILABLE": 1} and st("GS-Y5", "A") == {} and K[("GS-Y5", "98936")] == NA, "GS-Y5 / 98936 candidate-only FORCING_UNAVAILABLE")
    check(st("GS-Y2", "C").get("FORCING_UNAVAILABLE") == 1 and st("GS-Y2", "A") == {} and K[("GS-Y2", "92872")] == NA, "GS-Y2 / 92872 candidate-only FORCING_UNAVAILABLE")
    check(av["A_72h"] == 18 and av["C_72h"] == 16 and av["pair_CA_72h"] == 16, "availability 18/20, 16/20, pairs 16")
    # 7 interpretation safety
    T = (D / "step42-final-scientific-results-report.md").read_text(encoding="utf-8").replace("−", "-").replace("–", "-"); low = T.lower()
    for s in ["GS-Y7 / drifter 92869", "GS-Y8 / drifter 88532", "GS-Y5 / drifter 98936", "GS-Y2 / drifter 92872", "Two candidate-only terminations", "This reduced candidate availability", "18 / 20", "16 / 20", "H1 = SUPPORTED", "CANDIDATE_ONLY", "| Operational promotion | NO |", "Further validation on independent data is required before any operational claim", "-31.331 km", "[-72.0725, -11.7435] km"]:
        check(s in T, f"report retains: {s!r}")
    stripped = low
    for a in NEGATED:
        check(a.lower() in low, f"report retains negated claim: {a!r}"); stripped = stripped.replace(a.lower(), " ")
    for f in FORBIDDEN:
        check(re.search(r"(?<![a-z])" + re.escape(f) + r"(?![a-z])", stripped) is None, f"report must not claim: {f!r}")
    # 8 record consistency
    J = load(REC)
    check(J["step"] == 43 and J["finalStatus"] == "PASS" and J["automaticCommit"] is False and J["push"] is False and "reproducibility verification" in J["purpose"], "record identity / finalStatus PASS")
    check(J["inputCommits"] == {**C, "runtime": git("rev-parse", "155995dd").stdout.strip()} and J["expectedHead"] == C["step42"] and J["uiCommitBetweenStep41And42"] == UI, "record input commits")
    head = git("rev-parse", "HEAD").stdout.strip(); after = git("log", "--format=%H", f"{C['step42']}..HEAD").stdout.split()
    touched = sorted(f for c in after for f in git("show", "--format=", "--name-only", c).stdout.split() if f.startswith(("docs/research/", "tools/research/", "services/research-runtime/")))
    check(J["currentHead"] == head and J["headAdvancedByOtherSession"] == (head != C["step42"]) and [a["commit"] for a in J["headAfterStep42"]["commitsAfterStep42"]] == after, "record currentHead == HEAD and commits after STEP 42 listed")
    check(not touched and J["headAfterStep42"]["researchFilesTouchedAfterStep42"] == [], f"no research file touched by commits after STEP 42: {touched}")
    check(all(J["ancestry"].values()) and J["ancestryStatus"] == "PASS", "record ancestry PASS")
    check(J["step42Immutability"]["status"] == "PASS" and J["step42Immutability"]["expectedSha256"] == S42 == J["step42Immutability"]["workingCopySha256"] == J["step42Immutability"]["committedBlobSha256"], "record STEP 42 immutability")
    check(J["step36to41ImmutabilityStatus"] == "PASS" and {k: v["modified"] for k, v in J["step36to41Immutability"].items()} == modified, "record STEP 36-42 immutability matches independent check")
    rp, ep = J["reconstructedPrimary"], J["expectedPrimary"]
    check(rp["Delta_w_km"] == dw and rp["validWindows"] == 6 and rp["Theta_km"] == theta and rp["B"] == 10000 and rp["seed"] == 20260907 and rp["availableReplicates"] == avail and rp["notAvailableReplicates"] == na and rp["CI95_km"] == EXP_CI and rp["H1"] == "SUPPORTED" and rp["candidateStatus"] == "CANDIDATE_ONLY" and rp["operationalPromotion"] is False, "record reconstructed primary values")
    check(ep["Delta_w_km"] == EXP_DELTA and ep["Theta_km"] == -31.331 and ep["CI95_km"] == EXP_CI and J["exactMatch"] is True, "record expected primary values / exactMatch")
    check(J["secondaryConsistency"]["match"] is True and J["missingnessConsistency"]["match"] is True and J["interpretationSafety"]["status"] == "PASS", "record secondary / missingness / interpretation")
    check(all(v == 0 for v in J["noNewScience"].values()), "record: no new science")
    for f, h in J["inputShaIdentities"].items():
        check(sha(ROOT / f) == h, f"record input SHA identity: {f}")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "Theta_km": theta, "validWindows": len(valid), "CI95_km": EXP_CI, "replicates": [avail, na], "H1": sr["H1"], "candidate": sr["candidateStatus"], "operationalPromotion": False, "lockedFilesModified": sum(len(v) for v in modified.values())}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
