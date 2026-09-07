"""Independent validator for STEP 36 (cohort extension preregistration; no experiment). exit 0 = PASS. Checks: 1 ancestry · 2 frozen
inputs (STEP 32/33/34 via the STEP 35 protocol frozen list, all STEP 35 files and tools at their recorded SHA, STEP 16-31 locks, runtime;
STEP 35 status still PREREGISTRATION_BLOCKED / 8 windows / 18 drifters) · 3 protocol hash chain and tool lock · 4 STEP 35 eligibility input
identity (candidates = the 178 STEP 35 window-eligible rows in (start, region) order; no new eligibility, inventory, velocity) · 5 exclusion
identity (68 prior IDs = STEP 35 list; disjointness of selected IDs; starts not within 72 h of prior windows) · 6 chronological order and
same-region separation · 7 unique-drifter accumulation recomputed from the manifest; first eight windows identical to STEP 35 · 8 primary
prefix = first prefix with >= 6 windows AND >= 20 drifters; <= 12 windows; status rule · 9 no performance / trajectory / velocity /
forcing access (tool source scan; no data/research/step36; no step36 run outputs) · 10 STEP 35 files unmodified · 11 derivation re-run
byte-identical · 12 status file and report consistent. Deterministic output."""
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
sys.path.insert(0, str(ROOT / "tools/research"))
import check_step32_preregistration as pa  # noqa: E402

PROTO, STATUS, MAN, REPORT = D / "step36-cohort-extension-protocol.json", D / "step36-cohort-extension-status.json", D / "step36-cohort-extension-manifest.json", D / "step36-cohort-extension-report.md"
TOOL = ROOT / "tools/research/derive_step36_cohort_extension.py"
STEP35 = {"docs/research/step35-phase-a-protocol.json": "7c3cc487", "docs/research/step35-phase-a-protocol-status.json": "2bf4f006", "docs/research/step35-period-lock.json": "c2f6e862", "docs/research/step35-frame-inventory.json": "5bdb5c77", "docs/research/step35-window-eligibility.json": "d01d06a3", "docs/research/step35-cohort-manifest.json": "07ebc185", "docs/research/step35-preregistration-report.md": "b529b917", "tools/research/inventory_step35_frames.py": "360712db", "tools/research/derive_step35_cohort.py": "08347290", "tools/research/check_step35_phase_a.py": "8b342759"}
LEAK = re.compile(r"trajector|paired-table|-evaluation|run-manifest|water_u|water_v|models_v2|research_runtime|inventory|forcing", re.I)
FMT = "%Y-%m-%dT%H:%M:%SZ"; ts = lambda s: datetime.strptime(s, FMT).replace(tzinfo=timezone.utc)


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
    for short in pa.COMMITS + ("ee64354d",):
        check(git("cat-file", "-t", short).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", short, "HEAD").returncode == 0, f"1 ancestry: {short}")
    q = load(D / "step32-preregistration.json"); P35 = load(D / "step35-phase-a-protocol.json")
    for rel, expected in pa.LOCK.items():
        exp = expected or q["sourceBinding"].get(rel); check(exp is not None and sha(ROOT / rel) == exp, f"2 immutability: {rel}")
    for rel, expected in P35["frozenInputs"].items():
        check(sha(ROOT / rel) == expected, f"2 STEP 32/33/34 frozen input unchanged: {rel}")
    for rel, prefix in STEP35.items():
        check(sha(ROOT / rel).startswith(prefix), f"2/10 STEP 35 file unchanged: {rel}")
    for name in ("__init__.py", "datasets.py", "models.py", "models_v2.py", "wind.py", "cli.py", "cli_v2.py", "registry.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"2 runtime unchanged: {name}")
    S35 = load(D / "step35-phase-a-protocol-status.json"); C35 = load(D / "step35-cohort-manifest.json"); E35 = load(D / "step35-window-eligibility.json")
    check(S35["status"] == "PREREGISTRATION_BLOCKED" and C35["status"] == "COHORT_INSUFFICIENT" and C35["summary"]["selectedWindows"] == 8 and C35["summary"]["selectedDrifters"] == 18 and E35["windowEligibleTotal"] == 178, "2 STEP 35 result immutable (BLOCKED, 8 windows, 18 drifters, 178 eligible)")
    P, ST, M = load(PROTO), load(STATUS), load(MAN); rep = REPORT.read_text(encoding="utf-8")
    check(M["protocolSha256"] == sha(PROTO) == ST["protocolSha256"] and P["tools"]["tools/research/derive_step36_cohort_extension.py"] == sha(TOOL) and P["tools"]["tools/research/check_step36_cohort_extension.py"] == sha(__file__) and ST["manifestSha256"] == sha(MAN), "3 protocol hash chain and tool lock")
    check(P["inherited"]["step35ProtocolSha256"] == sha(D / "step35-phase-a-protocol.json") == M["inherited"]["step35ProtocolSha256"] and P["inherited"]["step35EligibilitySha256"] == sha(D / "step35-window-eligibility.json") and P["inherited"]["step35CohortManifestSha256"] == sha(D / "step35-cohort-manifest.json") and P["inherited"]["step35PeriodLockSha256"] == sha(D / "step35-period-lock.json") and P["inherited"]["step35FrameInventorySha256"] == sha(D / "step35-frame-inventory.json"), "4 STEP 35 eligibility / period / inventory input identity")
    rule = P["accumulationRule"]; check(rule == {"minimumWindows": 6, "minimumDrifters": 20, "maxWindows": 12, "stopAtTarget8": False, "primaryCohort": "first chronological prefix with selected_windows >= 6 AND unique_drifters >= 20", "insufficientIf": "not reached within 12 selected windows"} and M["accumulationRule"] == rule and P["maxWindowsChosenFromPerformance"] is False, "3 new rule locked as registered")
    cand = sorted([w for w in E35["windows"] if w["windowEligible"]], key=lambda r: (r["start"], r["region"])); check(M["candidatesInherited"] == len(cand) == 178 and M["newEligibilityComputed"] is False and M["newInventory"] is False, "4 candidates = STEP 35 eligible rows")
    prior = set(P35["exclusion"]["priorDrifterIds"]); starts = P35["exclusion"]["priorWindowStartsByRegion"]
    check(sorted(prior) == sorted(P["exclusion"]["priorDrifterIds"]) and len(prior) == 68 and starts == P["exclusion"]["priorWindowStartsByRegion"], "5 exclusion identity = STEP 35")
    sel = M["windows"]; ids = []; last = {}; cum_ok = True; prim = None
    for i, w in enumerate(sel):
        t0 = ts(w["start"]); rid = w["region"]
        check(w["chronologicalRank"] == i + 1 and (i == 0 or ts(sel[i - 1]["start"]) <= t0) and (rid not in last or (t0 - last[rid]).total_seconds() >= 72 * 3600) and all(abs((t0 - ts(p)).total_seconds()) >= 72 * 3600 for p in starts[rid]), f"6 order / separation: {w['windowId']}"); last[rid] = t0
        check(any(c["region"] == rid and c["start"] == w["start"] for c in cand) and not (set(w["drifterIds"]) & prior) and not (set(w["drifterIds"]) & set(ids)) and len(w["drifterIds"]) >= 1, f"5/7 eligible, disjoint, new IDs: {w['windowId']}")
        ids += w["drifterIds"]; cum_ok &= w["cumulativeUniqueDrifters"] == len(ids)
        if prim is None and i + 1 >= 6 and len(ids) >= 20:
            prim = i + 1
    check(cum_ok and M["summary"]["selectedDrifters"] == len(ids) == len(set(ids)) and M["drifterIds"] == ids, "7 unique-drifter accumulation recomputed")
    first8 = [(w["region"], w["start"], w["drifterIds"]) for w in sel[:8]]; check(first8 == [(w["region"], w["start"], w["drifterIds"]) for w in C35["windows"]][:len(first8)] and M["step35FirstEightReproduced"] is True, "7 first eight windows identical to STEP 35")
    found = prim is not None and prim <= 12
    check(len(sel) <= 12 and (len(sel) == prim if found else True) and M["primaryCohort"]["found"] == found and M["primaryCohort"]["windows"] == prim and M["summary"]["minimumMet"] == found and M["status"] == ("COHORT_LOCKED" if found else "COHORT_INSUFFICIENT") and ST["status"] == ("COHORT_EXTENSION_LOCKED" if found else "COHORT_EXTENSION_BLOCKED"), "8 primary prefix, 6/20 gate, 12-window maximum, status rule")
    check(M["velocityDownloaded"] is False and M["forcingDownloaded"] is False and M["trajectoryComputed"] is False and M["performanceDataRead"] is False and M["modelRun"] is False and M["forbiddenInputAccess"] == 0 and not (ROOT / "data/research/step36").exists() and not any(D.glob("step36-*run*")) and not any(D.glob("step36-*trajector*")) and not any(D.glob("step36-*evaluation*")), "9 no performance / trajectory / velocity / forcing access; no experiment")
    body = TOOL.read_text(encoding="utf-8"); body = body.split('"""', 2)[2] if body.startswith('"""') else body
    lits = [m for m in re.findall(r'"([^"\n]*)"', "\n".join(l for l in body.split("\n") if not l.strip().startswith("FORBIDDEN"))) if "/" in m or m.endswith((".json", ".csv"))]
    check(not any(LEAK.search(x) for x in lits) and "guarded_open" in body and P["noExperiment"] == {"trajectory": False, "velocityDownload": False, "forcingDownload": False, "candidateComparison": False, "calibration": False, "modelSelection": False, "parameterSelection": False, "forcingSelection": False}, "9 tool source scan; no-experiment flags")
    check(f"SELECTED_WINDOWS = {len(sel)}" in rep and f"SELECTED_DRIFTERS = {len(ids)}" in rep and f"COHORT_EXTENSION = {'LOCKED' if found else 'BLOCKED'}" in rep and "MAX_WINDOWS = 12" in rep and all(w["windowId"] in rep for w in sel), "12 report consistent")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(TOOL), "--out", tmp], cwd=ROOT, capture_output=True, text=True, env={**__import__('os').environ, "PYTHONIOENCODING": "utf-8"})
        check(proc.returncode in (0, 1) and sha(Path(tmp) / MAN.name) == sha(MAN), "11 derivation re-run byte-identical")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "status": ST["status"], "selectedWindows": len(sel), "selectedDrifters": len(ids), "primaryPrefix": prim, "forbiddenInputAccess": M["forbiddenInputAccess"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
