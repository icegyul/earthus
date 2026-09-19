"""REVISION r2 (uncommitted; r1 kept unchanged; docs/research/step33-validator-r2-record.json): r1 hard-coded 7 window-frame pairs; the blocked windows share timestamps, so 8 pairs over 5 distinct timestamps are investigated. Validator-side only.
Independent validator for STEP 33 (source availability recovery; no scientific run). exit 0 = PASS. Checks: 1 ancestry (Phase A lock
ee64354d and the STEP 17-31 chain) · 2 immutability (STEP 32 Phase A files, STEP 32 Phase B preregistration d7434d28 and every STEP 32
Phase B output at the SHA snapshot recorded in the STEP 33 protocol, STEP 16-31 locks, STEP 18b preregistration, STEP 29 license status,
STEP 30A summary, holdout derivation, runtime 155995dd) · 3 window / drifter identity unchanged (matrix = derivation) · 4 source binding
(every query: expt_53.X/data/2011, water_u+water_v, vertCoord 15, horizStride 1, timeStride 1, the window's registered ocean bbox, exact
timestamp) · 5 classification re-derived from the recorded evidence (AVAILABLE / SOURCE_ABSENT / ACQUISITION_ERROR; ACQUISITION_ERROR never
mapped to SOURCE_ABSENT) · 6 window status rule (WINDOW_RECOVERABLE only if every missing frame AVAILABLE and MATCH) · 7 recovered files
SHA on disk = manifest · 8 STEP 32 quality report untouched (no promotion) · 9 no scientific rerun (STEP 32 run manifests and trajectory
files unchanged; no trajectory under data/research/step33) · 10 forbiddenInputAccess 0 and recovery-tool source scan · 11 summary and
report consistent with the manifest · 12 final status rule. Deterministic output."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
sys.path.insert(0, str(ROOT / "tools/research"))
import check_step32_preregistration as pa  # noqa: E402  (locked: LOCK dict and COMMITS reused)

PROTO, MANIFEST, SUMMARY, REPORT = D / "step33-source-recovery-protocol.json", D / "step33-source-recovery-manifest.json", D / "step33-source-availability-summary.json", D / "step33-source-recovery-report.md"
TOOL = ROOT / "tools/research/recover_step33_source.py"
LEAK = re.compile(r"trajector(y|ies)\.csv|paired-table|-evaluation\.json|-summary\.json|result\.json|run-manifest|step30a-final|step29-stokes|step25c-|candidate", re.I)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def classify(f):
    ex, br, t = f["exactQuery"], f["bracketQuery"], f["timestamp"]; ext, brt = f["returnedTimeAxis"]["exact"], f["returnedTimeAxis"]["bracket"]
    if ex["bodyKind"] == "netcdf" and t in ext and f.get("metadata", {}).get("variables") and all(v in f["metadata"]["variables"] for v in ("water_u", "water_v")):
        return "AVAILABLE"
    if ex["bodyKind"] == "network-error" or (ex["bodyKind"] == "http-error" and ex["httpStatus"] and ex["httpStatus"] >= 500) or br["bodyKind"] == "network-error":
        return "ACQUISITION_ERROR"
    if (ex["bodyKind"] == "netcdf" and t not in ext) or (ex["bodyKind"] in ("http-error", "non-netcdf") and br["bodyKind"] == "netcdf"):
        return "SOURCE_ABSENT"
    return "ACQUISITION_ERROR"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for short in pa.COMMITS + ("ee64354d",):
        check(git("cat-file", "-t", short).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", short, "HEAD").returncode == 0, f"1 ancestry: {short}")
    P = load(PROTO); q = load(D / "step32-preregistration.json")
    for rel, expected in pa.LOCK.items():
        exp = expected or q["sourceBinding"].get(rel); check(exp is not None and sha(ROOT / rel) == exp, f"2 immutability: {rel}")
    for rel, expected in P["frozen"]["phaseAFiles"].items():
        check(sha(ROOT / rel) == expected, f"2 STEP 32 Phase A file unchanged: {rel}")
    for rel, expected in P["frozen"]["step32Outputs"].items():
        check(sha(ROOT / rel) == expected, f"2 STEP 32 output unchanged: {rel}")
    check(P["frozen"]["step32PhaseBPreregistrationSha256"] == "d7434d28d63e7a1e991fd512a2768fe2b1ee53b60ccffec271e668658d991701" == sha(D / "step32-phase-b-preregistration.json") and P["frozen"]["step32PreregistrationSha256"] == "732ca966b6227fb5447b99bb2a06f59a38fdc7f2d1ffd9a5d4a5097bc175c971" == sha(D / "step32-preregistration.json"), "2 STEP 32 preregistrations unchanged")
    check(sha(D / "step18b-preregistration.json") == "02935e81e9c93690078ff96231c74ad51c86dfaffa89bfa17a2e2ba082306316" and sha(D / "step29-stokes-license-status.json") == "8a8640ac534c1fb9b8551a4a1e777f8a96d6f6c271d896246ed13b8cf93cb24b" and sha(D / "step30a-final-candidate-summary.json") == "faaf891fa7c5308db70f97add419d370efa7346ee560c30e307ac33d0a01c504" and sha(D / "step32-holdout-derivation.json") == q["holdoutDerivationSha256"], "2 STEP 18b / STEP 29 license / STEP 30A summary / holdout derivation unchanged")
    for name in ("__init__.py", "datasets.py", "models.py", "models_v2.py", "wind.py", "cli.py", "cli_v2.py", "registry.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"2 runtime unchanged: {name}")
    M = load(D / "step32-temporal-experiment-matrix.json"); V = load(D / "step32-holdout-derivation.json"); mw = {w["windowId"]: w for w in M["windows"]}
    dw = {w["windowId"]: w for r in ("KE", "AG") for w in V["regions"][r]["selected"]}
    check(list(mw) == list(dw) and all(mw[k]["drifterIds"] == dw[k]["newDrifterIds"] for k in mw), "3 window and drifter IDs unchanged")
    REC = load(D / "step33-validator-r2-record.json")
    check(P["tool"]["sha256"] == sha(TOOL) and P["validator"]["sha256"] == sha(ROOT / "tools/research/check_step33_source_recovery.py") == REC["r1"]["sha256"] and REC["r2"]["sha256"] == sha(__file__) and REC["protocolSha256"] == sha(PROTO), "2 tools equal protocol lock; r1 validator unchanged; r2 bound to its record")
    R = load(MANIFEST); S = load(SUMMARY); rep = REPORT.read_text(encoding="utf-8")
    check(R["protocolSha256"] == sha(PROTO) and R["tool"]["sha256"] == sha(TOOL) and S["manifestSha256"] == sha(MANIFEST) and R["scientificRun"] is False and R["modelRunCount"] == 0 and R["performanceDataRead"] is False, "provenance chain: manifest -> protocol / tool; summary -> manifest")
    Q = load(D / "step32-forcing-quality.json"); qb = {w["windowId"]: w["missingRegisteredFrames"] for w in Q["windows"] if w["status"] == "WINDOW_BLOCKED"}
    check([w["windowId"] for w in R["windows"]] == list(qb) and all(w["missingRegisteredFrames"] == qb[w["windowId"]] for w in R["windows"]) and len(R["windows"]) == 5 and len(R["frames"]) == sum(len(v) for v in qb.values()) == 8 and len({f["timestamp"] for f in R["frames"]}) == 5, "5 blocked windows / 8 window-frame pairs (5 distinct timestamps) investigated exactly as recorded in STEP 32")
    for f in R["frames"]:
        box = mw[f["windowId"]]["oceanBox"]; t = f["timestamp"]; s = t[:13].replace("T", "T")
        for key, rng in (("exactQuery", (t, t)),):
            u = f[key]["url"]
            check("GLBv0.08/expt_53.X/data/2011?" in u and "var=water_u&var=water_v" in u and "vertCoord=15" in u and "horizStride=1" in u and "timeStride=1" in u and f"north={box['north']:.3f}" in u and f"south={box['south']:.3f}" in u and f"west={box['west']:.3f}" in u and f"east={box['east']:.3f}" in u and f"time_start={t[:13]}%3A00%3A00Z" in u and f"time_end={t[:13]}%3A00%3A00Z" in u, f"4 source binding exact query: {f['windowId']} {t}")
        check("GLBv0.08/expt_53.X/data/2011?" in f["bracketQuery"]["url"] and "vertCoord=15" in f["bracketQuery"]["url"], f"4 source binding bracket query: {f['windowId']} {t}")
        check(f["classification"] == classify(f) and f["classification"] in ("AVAILABLE", "SOURCE_ABSENT", "ACQUISITION_ERROR"), f"5 classification re-derived: {f['windowId']} {t} ({f['classification']})")
        for key in ("exactQuery", "bracketQuery"):
            r = f[key]
            if r.get("file"):
                check((ROOT / r["file"]).exists() and sha(ROOT / r["file"]) == r["sha256"] and (ROOT / r["file"]).stat().st_size == r["bytes"], f"7 recovered file SHA/bytes: {r['file']}")
            check(r.get("requestedAtUTC") and r.get("retrievedAtUTC"), f"timestamps recorded: {key} {f['windowId']} {t}")
        if f["classification"] == "AVAILABLE":
            check(f.get("comparisonResult") in ("MATCH", "MISMATCH") and "readerValidation" in f, f"Phase C validation recorded: {f['windowId']} {t}")
    for w in R["windows"]:
        exp = "WINDOW_RECOVERABLE" if all(x["classification"] == "AVAILABLE" and x.get("comparisonResult") == "MATCH" for x in w["frames"]) else "WINDOW_BLOCKED"
        check(w["windowStatus"] == exp and w["windowStatus"] != "PASS", f"6 window status rule: {w['windowId']}")
    counts = {c: sum(1 for f in R["frames"] if f["classification"] == c) for c in ("AVAILABLE", "SOURCE_ABSENT", "ACQUISITION_ERROR")}
    rec_n = sum(1 for w in R["windows"] if w["windowStatus"] == "WINDOW_RECOVERABLE")
    exp_status = "ACQUISITION_ERROR" if counts["ACQUISITION_ERROR"] else ("RECOVERY_COMPLETE" if rec_n == 5 else ("PARTIAL_RECOVERY" if rec_n else "SOURCE_ABSENT"))
    check(R["frameClassificationCounts"] == counts and R["recoveredWindows"] == rec_n and R["remainingBlockedWindows"] == 5 - rec_n and R["status"] == exp_status and S["status"] == exp_status, "12 counts and final status rule")
    check(S["blockedWindowsInvestigated"] == 5 and S["recovered"] == rec_n and S["remainingBlocked"] == 5 - rec_n and S["availableFrames"] == counts["AVAILABLE"] and S["sourceAbsentFrames"] == counts["SOURCE_ABSENT"] and S["acquisitionErrorFrames"] == counts["ACQUISITION_ERROR"] and S["step32Unchanged"] is True and S["phaseAUnchanged"] is True and S["forbiddenInputAccess"] == 0 == R["forbiddenInputAccess"] and S["scientificRerun"] is False and S["parameterModelForcingSelected"] is False and S["automaticCommit"] is False, "11 summary consistent with manifest")
    check(f"STEP 33 STATUS:\n{exp_status}" in rep and f"Recovered:\n{rec_n} / 5" in rep and f"Source-absent frames:\n{counts['SOURCE_ABSENT']}" in rep and f"Acquisition-error frames:\n{counts['ACQUISITION_ERROR']}" in rep and all(w["windowId"] in rep for w in R["windows"]) and all(f["timestamp"] in rep for f in R["frames"]), "11 report consistent with manifest")
    body = TOOL.read_text(encoding="utf-8"); body = body.split('"""', 2)[2] if body.startswith('"""') else body
    lits = [m for m in re.findall(r'"([^"\n]*)"', "\n".join(l for l in body.split("\n") if not l.strip().startswith("FORBIDDEN"))) if "/" in m or m.endswith((".json", ".csv"))]
    check(not any(LEAK.search(x) for x in lits) and "guarded_open" in body, f"10 recovery tool opens no performance / trajectory file ({[x for x in lits if LEAK.search(x)][:3]})")
    for name in ("step32-temporal-run-manifest.json", "step32-candidate-run-manifest.json"):
        for r in load(D / name)["runs"]:
            if r.get("status") == "COMPLETED":
                check(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"], f"9 STEP 32 trajectory unchanged: {r['runId']}")
    check(not any(p.name.endswith("trajectories.csv") or p.name == "result.json" for p in (ROOT / "data/research/step33").rglob("*")) and not any(D.glob("step33-*run*")) and not any(D.glob("step33-*evaluation*")), "9 no scientific rerun outputs")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "status": R["status"], "counts": counts, "recoveredWindows": rec_n, "windowStatus": {w["windowId"]: w["windowStatus"] for w in R["windows"]}, "forbiddenInputAccess": R["forbiddenInputAccess"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
