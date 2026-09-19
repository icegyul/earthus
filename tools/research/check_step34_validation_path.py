"""Independent validator for STEP 34 (validation path decision / extension preregistration design; no experiment). exit 0 = PASS.
Checks: 1 ancestry (Phase A lock ee64354d and the STEP 17-31 chain) · 2 immutability (STEP 32 Phase A files, STEP 32 Phase B
preregistration and outputs at the STEP 33 snapshot, STEP 32 trajectories, STEP 33 protocol / manifest / summary / report / record and tools
at the STEP 34 snapshot, STEP 16-31 locks, runtime) · 3 STEP 33 classification unchanged (8 SOURCE_ABSENT pairs, 5 distinct timestamps,
0 AVAILABLE, 0 ACQUISITION_ERROR) and reproduced verbatim in the source-absence record incl. the nearest-preceding-frame rule · 4 window /
drifter IDs unchanged · 5 STEP 34 documents bound by SHA to the protocol · 6 options A-D each scored on exactly the five registered
criteria; no performance value referenced; no option chosen on performance · 7 primary rules encoded (no modification/removal of STEP 32/33
data, no discard of the 3 evaluable windows, no replacement of the 5 blocked windows, no drifter added to the existing holdout, no 6/8
substitution, no reporting of the 3-window result as meeting the minimum) · 8 no experiment executed (flags; no step34 run/trajectory/
evaluation outputs; no data/research/step34) · 9 candidate CANDIDATE_ONLY / baseline FROZEN_REFERENCE_BASELINE unchanged · 10 forbidden
input access 0 (no performance file read by the STEP 34 builder inputs) · 11 overclaim language scan. Deterministic output."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
sys.path.insert(0, str(ROOT / "tools/research"))
import check_step32_preregistration as pa  # noqa: E402

PROTO, ABSENCE, OPTIONS, DRAFT = D / "step34-validation-path-protocol.json", D / "step34-source-absence-record.json", D / "step34-validation-options.json", D / "step34-preregistration-draft.md"
CRITERIA = ["scientificObjective", "sourceCompleteness", "temporalCoverage", "independence", "preregistrationFeasibility"]
LANG = re.compile(r"\bproven\b|\bproves?\b|\bcauses?\b|\btruth\b|\boptimal\b|\bbest\b|\bsuperior\b|\bvalidated\b|production[- ]ready|statistically significant|\bwinner\b|favou?red|lower error|outperform", re.I)
STRIP = ("NOT_OPERATIONALLY_VALIDATED", "no winner", "winner selection", "winnerSelection")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def scan(text):
    for s in STRIP:
        text = text.replace(s, "")
    return [m.group(0) for m in LANG.finditer(text)]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for short in pa.COMMITS + ("ee64354d",):
        check(git("cat-file", "-t", short).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", short, "HEAD").returncode == 0, f"1 ancestry: {short}")
    P = load(PROTO); q = load(D / "step32-preregistration.json"); P33 = load(D / "step33-source-recovery-protocol.json")
    for rel, expected in pa.LOCK.items():
        exp = expected or q["sourceBinding"].get(rel); check(exp is not None and sha(ROOT / rel) == exp, f"2 immutability: {rel}")
    for rel, expected in (P33["frozen"]["phaseAFiles"] | P33["frozen"]["step32Outputs"]).items():
        check(sha(ROOT / rel) == expected, f"2 STEP 32 file unchanged (STEP 33 snapshot): {rel}")
    check(sha(D / "step32-phase-b-preregistration.json") == P33["frozen"]["step32PhaseBPreregistrationSha256"] == "d7434d28d63e7a1e991fd512a2768fe2b1ee53b60ccffec271e668658d991701" and sha(D / "step32-preregistration.json") == "732ca966b6227fb5447b99bb2a06f59a38fdc7f2d1ffd9a5d4a5097bc175c971", "2 STEP 32 preregistrations unchanged")
    for rel, expected in P["frozen"]["step33Files"].items():
        check(sha(ROOT / rel) == expected, f"2 STEP 33 file unchanged: {rel}")
    for name in ("step32-temporal-run-manifest.json", "step32-candidate-run-manifest.json"):
        for r in load(D / name)["runs"]:
            if r.get("status") == "COMPLETED":
                check(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"], f"2 STEP 32 trajectory unchanged: {r['runId']}")
    for name in ("__init__.py", "datasets.py", "models.py", "models_v2.py", "wind.py", "cli.py", "cli_v2.py", "registry.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"2 runtime unchanged: {name}")
    R33 = load(D / "step33-source-recovery-manifest.json"); AB = load(ABSENCE); OP = load(OPTIONS); draft = DRAFT.read_text(encoding="utf-8")
    check(R33["status"] == "SOURCE_ABSENT" and R33["frameClassificationCounts"] == {"AVAILABLE": 0, "SOURCE_ABSENT": 8, "ACQUISITION_ERROR": 0} and R33["recoveredWindows"] == 0, "3 STEP 33 classification unchanged")
    pairs33 = [(f["windowId"], f["timestamp"], f["classification"], f["returnedTimeAxis"]["exact"], f["evidence"]["bracketNeighbours"]) for f in R33["frames"]]
    pairs34 = [(f["windowId"], f["timestamp"], f["classification"], f["exactQueryReturnedAxis"], f["bracketNeighbours"]) for f in AB["pairs"]]
    check(pairs33 == pairs34 and AB["distinctMissingTimestamps"] == sorted({f["timestamp"] for f in R33["frames"]}) and len(AB["distinctMissingTimestamps"]) == 5 and AB["status"] == "SOURCE_ABSENT" and AB["step33ManifestSha256"] == sha(D / "step33-source-recovery-manifest.json") and AB["nearestPrecedingFrameRule"]["returnedFrameCountsAsRequested"] is False and "2011-06-09T09:00:00Z" in json.dumps(AB["nearestPrecedingFrameRule"]) and {w["windowId"]: w["missingRegisteredFrames"] for w in AB["windows"]} == {w["windowId"]: w["missingRegisteredFrames"] for w in R33["windows"]}, "3 source-absence record = STEP 33 manifest verbatim; nearest-preceding rule recorded")
    M = load(D / "step32-temporal-experiment-matrix.json"); V = load(D / "step32-holdout-derivation.json"); mw = {w["windowId"]: w for w in M["windows"]}; dw = {w["windowId"]: w for r in ("KE", "AG") for w in V["regions"][r]["selected"]}
    check(list(mw) == list(dw) and all(mw[k]["drifterIds"] == dw[k]["newDrifterIds"] for k in mw) and P["frozen"]["step32"]["registeredWindows"] == 8 and P["frozen"]["step32"]["evaluableWindows"] == 3 and P["frozen"]["step32"]["registeredDrifters"] == 32 and P["frozen"]["step32"]["evaluableDrifters"] == 10 and P["frozen"]["step32"]["blockedWindows"] == ["KE-X4", "KE-X5", "KE-X6", "KE-X7", "KE-X8"] and P["frozen"]["step32"]["evaluableWindowIds"] == ["KE-X1", "KE-X2", "KE-X3"], "4 window / drifter IDs unchanged; frozen counts")
    check(P["outputs"]["docs/research/step34-source-absence-record.json"] == sha(ABSENCE) and P["outputs"]["docs/research/step34-validation-options.json"] == sha(OPTIONS) and P["outputs"]["docs/research/step34-preregistration-draft.md"] == sha(DRAFT) and P["validator"]["sha256"] == sha(__file__) and AB["protocolRuleId"] == OP["ruleId"] == P["ruleId"] == "validation-path-decision-step34", "5 documents bound to the protocol")
    check(list(OP["options"]) == ["A", "B", "C", "D"] and all(set(o["criteria"]) == set(CRITERIA) and all(isinstance(o["criteria"][c], dict) and "assessment" in o["criteria"][c] and o["criteria"][c]["basis"] == "design/data-availability only; no performance value" for c in CRITERIA) for o in OP["options"].values()) and OP["selectionRule"]["performanceBased"] is False and OP["selectionRule"]["criteria"] == CRITERIA and not re.search(r"-?\d+\.\d{3} km|W/L|wins|losses|median delta", json.dumps(OP, ensure_ascii=False)), "6 options A-D scored on the five criteria only; no performance value")
    pr = P["primaryRules"]
    check(pr["modifyOrRemoveStep32Step33Data"] is False and pr["discardEvaluableWindows"] is False and pr["replaceBlockedWindowsWithOtherSource"] is False and pr["addDriftersToExistingHoldout"] is False and pr["artificial6of8Substitution"] is False and pr["reportThreeWindowResultAsMeetingMinimum"] is False and P["frozen"]["step32"]["phaseAMinimumMet"] is False, "7 primary rules encoded")
    ne = P["noExperiment"]
    check(all(ne[k] is False for k in ("trajectorySimulation", "candidateComparison", "temporalComparison", "parameterSweep", "calibration", "modelSelection", "forcingSelection", "scoreOptimization")) and not (ROOT / "data/research/step34").exists() and not any(D.glob("step34-*run*")) and not any(D.glob("step34-*trajector*")) and not any(D.glob("step34-*evaluation*")) and P["modelRunCount"] == 0 and P["newData"] == 0, "8 no experiment executed")
    check(P["frozen"]["candidate"]["status"] == "CANDIDATE_ONLY" and P["frozen"]["baseline"]["status"] == "FROZEN_REFERENCE_BASELINE" and P["frozen"]["step32"]["temporalLabel"] == "NO_CLEAR_TEMPORAL_DIFFERENCE" and P["frozen"]["step32"]["validationLabel"] == "NO_CLEAR_DESCRIPTIVE_DIFFERENCE" and P["frozen"]["step33"]["status"] == "SOURCE_ABSENT", "9 candidate / baseline / labels frozen as recorded")
    check(P["forbiddenInputAccess"] == 0 and all(not re.search(r"trajector|paired-table|-evaluation|run-manifest", x) for x in P["inputsRead"]), "10 forbidden input access 0; inputs are metadata / manifests only")
    hits = [f"{n}:{h}" for n, t in (("protocol", json.dumps(P, ensure_ascii=False)), ("options", json.dumps(OP, ensure_ascii=False)), ("absence", json.dumps(AB, ensure_ascii=False)), ("draft", draft)) for h in scan(t)]
    check(not hits, f"11 no overclaim language ({hits[:6]})")
    check("STEP 34 STATUS" not in draft and "OPTION A" in draft and "OPTION B" in draft and "OPTION C" in draft and "OPTION D" in draft and "2011-06-09T12" in draft and "SOURCE_ABSENT" in draft and "CANDIDATE_ONLY" in draft, "draft contains the four options, the absence record and the frozen statuses")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "status": P["status"], "recommendedPath": OP["selectionRule"].get("criteriaBasedRecommendation"), "forbiddenInputAccess": P["forbiddenInputAccess"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
