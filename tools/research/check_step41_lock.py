"""Independent fail-closed validator for STEP 41 (lock of the STEP 39 research records / tools). exit 0 = PASS.
Verifies: exact STEP 39 file set (20 files, no more, no fewer; every docs/research/step39-* and tools/research/*step39* file on disk
is in the set) · SHA-256 and size of every file against docs/research/step41-lock-record.json · no data directory, .gitignore or
STEP 32-35 path in the lock · ancestry (155995dd runtime, 043a09b8 STEP 36, 74d19f0a STEP 37, 23e78f86 STEP 38, 2b1a7baa STEP 40; STEP 40
parent = STEP 38) · STEP 40 immutability (the five committed files byte-identical to commit 2b1a7baa) · chain STEP 36 -> 37 -> 38 -> 39 -> 40
(STEP 39 protocol lock-commit fields and frozen SHAs; STEP 39 protocol tool SHAs; validator r2 record; STEP 40 protocol frozen STEP 39 SHAs)
· STEP 40 result quantities unchanged (Theta, interval, counts, seed, Delta_w, H1, candidate status) · frozen STEP 35-and-earlier inputs
(STEP 37 protocol frozenInputs) unchanged · validator self-identity. Deterministic output (no timestamps, no staged-file listing)."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
LOCK = D / "step41-lock-record.json"
NA = "NOT_AVAILABLE"
EXPECTED = sorted([
    "docs/research/step39-execution-protocol.json", "docs/research/step39-daily-derivation-manifest.json",
    "docs/research/step39-candidate-forcing-manifest.json", "docs/research/step39-temporal-run-manifest.json",
    "docs/research/step39-temporal-replay-manifest.json", "docs/research/step39-candidate-run-manifest.json",
    "docs/research/step39-candidate-replay-manifest.json", "docs/research/step39-paired-table.csv", "docs/research/step39-evaluation.json",
    "docs/research/step39-summary.json", "docs/research/step39-execution-record.json", "docs/research/step39-validator-r2-record.json",
    "tools/research/build_step39_daily.py", "tools/research/build_step39_candidate_forcing.py", "tools/research/step39_runs.py",
    "tools/research/run_step39_trajectories.py", "tools/research/replay_step39_run.py", "tools/research/evaluate_step39.py",
    "tools/research/check_step39_execution.py", "tools/research/check_step39_execution_r2.py"])
STEP40_FILES = ["docs/research/step40-bootstrap-protocol.json", "docs/research/step40-bootstrap-result.json", "docs/research/step40-bootstrap-replicates.csv", "tools/research/bootstrap_step40.py", "tools/research/check_step40_bootstrap.py"]
ANCESTORS = {"runtime": "155995dd", "step36": "043a09b8", "step37": "74d19f0a", "step38": "23e78f86", "step40": "2b1a7baa"}
FROZEN_DELTA = {"GS-Y1": -17.872, "GS-Y2": -5.615, "GS-Y3": -21.379, "GS-Y4": -41.283, "GS-Y5": NA, "GS-Y6": -65.774, "GS-Y7": NA, "GS-Y8": NA, "GS-Y9": -78.371}
FORBIDDEN = ("data/", ".gitignore", "step32", "step33", "step34", "step35", "__pycache__", ".pyc")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    L = load(LOCK)
    check(L.get("step") == 41 and L.get("ruleId") == "experiment-preregistration-step37", "lock record identity")
    check(L["tools"]["tools/research/check_step41_lock.py"] == sha(__file__), "validator self-identity")
    # ---- ancestry ----
    for name, short in ANCESTORS.items():
        check(git("cat-file", "-t", short).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", short, "HEAD").returncode == 0, f"ancestry: {name} {short}")
        check(L["ancestry"][name].startswith(short), f"lock record ancestry field: {name}")
    parents = git("show", "-s", "--format=%P", ANCESTORS["step40"]).stdout.split()
    check(len(parents) == 1 and parents[0].startswith(ANCESTORS["step38"]), "STEP 40 commit parent is STEP 38 commit")
    # ---- STEP 40 immutability ----
    for rel in STEP40_FILES:
        blob = git("rev-parse", f"{ANCESTORS['step40']}:{rel}").stdout.strip(); wc = git("hash-object", rel).stdout.strip()
        check(blob and blob == wc, f"STEP 40 file byte-identical to commit 2b1a7baa: {rel}")
        check(L["step40Immutability"]["files"][rel] == sha(ROOT / rel), f"STEP 40 file SHA in lock record: {rel}")
    # ---- exact STEP 39 file set ----
    locked = sorted(f["path"] for f in L["files"])
    check(locked == EXPECTED and len(locked) == 20 == L["fileCount"], "exact STEP 39 file set (20)")
    on_disk = sorted(str(p.relative_to(ROOT)).replace("\\", "/") for pat, base in (("step39-*", D), ("*step39*", ROOT / "tools/research")) for p in base.glob(pat) if p.is_file())
    check(on_disk == EXPECTED, f"no unexpected step39 file on disk: {sorted(set(on_disk) ^ set(EXPECTED))}")
    check(not any(any(tok in f for tok in FORBIDDEN) for f in locked), "no data directory, .gitignore, cache or STEP 32-35 path in the lock")
    for f in L["files"]:
        p = ROOT / f["path"]
        check(p.is_file() and sha(p) == f["sha256"] and p.stat().st_size == f["size"], f"SHA-256 / size: {f['path']}")
        check(f["role"] in ("protocol", "manifest", "output", "record", "tool", "validator"), f"role stated: {f['path']}")
    # ---- chain STEP 36 -> 37 -> 38 -> 39 -> 40 ----
    P39 = load(D / "step39-execution-protocol.json"); P40 = load(D / "step40-bootstrap-protocol.json"); P37 = load(D / "step37-experiment-preregistration-protocol.json")
    check(P39["step36LockCommit"].startswith(ANCESTORS["step36"]) and P39["step37LockCommit"].startswith(ANCESTORS["step37"]) and P39["step38LockCommit"].startswith(ANCESTORS["step38"]) and P39["runtimeCommit"].startswith(ANCESTORS["runtime"]), "STEP 39 protocol lock-commit fields")
    for rel, h in P39["frozen"].items():
        check(sha(ROOT / rel) == h, f"STEP 39 protocol frozen input unchanged: {rel}")
    for rel, h in P39["tools"].items():
        check(sha(ROOT / rel) == h, f"STEP 39 protocol tool SHA: {rel}")
    R2 = load(D / "step39-validator-r2-record.json")
    check(R2["protocolSha256"] == sha(D / "step39-execution-protocol.json") and R2["r1"]["sha256"] == sha(ROOT / R2["r1"]["path"]) and R2["r2"]["sha256"] == sha(ROOT / R2["r2"]["path"]), "STEP 39 validator r2 record identity")
    for rel, h in P40["frozen"].items():
        check(sha(ROOT / rel) == h, f"STEP 40 protocol frozen record unchanged: {rel}")
    check(all(sha(ROOT / f) == h for f, h in P37["ancestry"]["frozenInputs"].items()), "STEP 35-and-earlier frozen inputs (STEP 37 protocol) unchanged")
    check(L["chain"] == ["043a09b8", "74d19f0a", "23e78f86", "STEP39(uncommitted->locked by STEP 41)", "2b1a7baa"], "chain stated in lock record")
    # ---- STEP 40 quantities ----
    R = load(D / "step40-bootstrap-result.json"); pr = R["primary"]; sr = R["successRule"]; X = L["step40CrossCheck"]
    check(pr["ThetaObserved_km"] == -31.331 == X["ThetaObserved_km"] and pr["Q0.025_km"] == -72.0725 == X["Q0.025_km"] and pr["Q0.975_km"] == -11.7435 == X["Q0.975_km"], "STEP 40 Theta / 95 % interval")
    check(pr["availableReplicates"] == 9999 == X["availableReplicates"] and pr["notAvailableReplicates"] == 1 == X["notAvailableReplicates"] and pr["B_requested"] == 10000 == X["B"] and pr["seed"] == 20260907 == X["seed"], "STEP 40 counts / B / seed")
    check(pr["Delta_w_km"] == FROZEN_DELTA == X["Delta_w_km"], "STEP 40 Delta_w values")
    check(sr["H1"] == "SUPPORTED" == X["H1"] and sr["candidateStatus"] == "CANDIDATE_ONLY" == X["candidateStatus"] and sr["operationalWinnerDeclared"] is False and X["operationalPromotion"] is False, "STEP 40 H1 / candidate status / no operational promotion")
    check(L["scientificValuesChanged"] is False and L["step40Modified"] is False and L["automaticCommit"] is False and L["push"] is False, "lock record declarations")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "filesLocked": len(locked), "Theta": pr["ThetaObserved_km"], "CI95": [pr["Q0.025_km"], pr["Q0.975_km"]], "H1": sr["H1"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
