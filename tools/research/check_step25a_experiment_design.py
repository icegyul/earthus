"""Independent validator for STEP 25A (forcing sensitivity experiment preregistration). exit 0 = PASS, exit 1 = FAIL.
Checks: ancestry (STEP 17–24b incl. the preserved premature commit c34c6d97), immutability of STEP 17–24b locked files and runtime,
alpha frozen 0.002 / comparison 0, no parameter search flags, no model artifacts, no unexpected data artifacts (no GLORYS files, no
data/research/step25*), TEST-06 conditional/blocked, AVISO reference-only, calibration/holdout separation, depth rule, metric
definitions, comparison rule, common-window rule incl. KE-H2, STEP 20 records unchanged, rule-file cross references (incl. own SHA).
Output deterministic (no timestamps) so two runs compare byte-for-byte."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "docs/research/step25a-forcing-experiment-protocol.json"
PREREG = ROOT / "docs/research/step25a-forcing-experiment-preregistration.json"
MATRIX = ROOT / "docs/research/step25a-experiment-matrix.json"
MATRIX_CSV = ROOT / "docs/research/step25a-experiment-matrix.csv"
SUMMARY = ROOT / "docs/research/step25a-summary.json"
RULE = ROOT / "docs/research/step25a-rule-sha256.txt"
LOCK = {"docs/research/step17-forcing-protocol.md": "db73ef67d1a191d67b29d488805a3c9998a65bf70b80dffe15b40ed8eb041792", "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86",
        "docs/research/step18-model-manifest.json": "02c859f9a079eb68826852589d4c6d313171bcad9b544406212abfe3651a61cb", "docs/research/step18b-model-manifest.json": "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe",
        "docs/research/step19-evaluation.json": "9baa0c6ae4fd38fbd0ea72e479736d0eb8f43f49aac6cebc8dcfa0051490b5f4", "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4",
        "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd", "docs/research/step20-calibration-manifest.json": "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498",
        "docs/research/step20-b6-holdout-manifest.json": "968da55a4553c00f373d6a0f26bc2b1c9e3f3af421d37db7a1e58e99a5727653", "docs/research/step20-b6-holdout-summary.json": "fe2043b30aaba17d34e3d9a780379de9612541b75caa4ed487a10931a784d93b",
        "docs/research/step20-b6-holdout-table.csv": "d21d029bba4e09a15ef19a393f0d8389df0e5750cb1459ed0b1e92372aeea681", "docs/research/step21-diagnostic-summary.json": "d310eaadf64324286de80e485e9944998665d14d2599ca80133cf3d25b406fbd",
        "docs/research/step22-summary.json": "0093d1c0ab8c73195c76b11da1ddf0609555f5ff49c2698069e31b0a76f4e5bd", "docs/research/step23-data-quality-gates.json": "5121ddee252a03ac276c5094bb373b6948ef317de7bb956add064b7caf99f39b",
        "docs/research/step23-data-requirement-status.json": "24825f53a615bfecde79972f7a4b8ad53079b71defeb5d66e7d7700f83e01873", "docs/research/step24-data-access-status.json": "74ea277901b95880b5f03e3133ff4b5696381cdbb69a27ccbd6703fdd8db6bf7",
        "docs/research/step24-license-status.json": "2fed50d520b63fb3303926c78ec4668926db9cfb41f025df7d59a6cfed07a3e2", "docs/research/step24-summary.json": "4b29c5d2be8f9e5b4dac3d105cb8bdd80f75e7cc8b4611047b1cb7f2413ff390",
        "docs/research/step24b-license-status.json": "7f9a8b9983dd3849e852d31514b6b512ed12195457930c70a104f24dcf8807ef", "docs/research/step24b-summary.json": "162f266b78bde91c37c69c110154eb5182602c64e98d1e353b57f19ff7148925",
        "docs/research/step24b-r2-preregistration.json": "55ffa70f6654563244589f81a7ac9a0c8063b1243a4af3aa5ca78b6c171c7d40", "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "322f0e57", "4bb4342b", "275d06e6", "e0e7cfd2", "15a81d25", "c34c6d97", "db6cea2f")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"immutability: {rel}")
    for short in COMMITS:
        check(subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() == "commit", f"ancestry: {short}")
    for name in ("netcdf_reader.py", "datasets.py", "models.py", "models_v2.py", "wind.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"runtime unchanged: {name}")
    cal = json.loads((ROOT / "docs/research/step20-calibration-manifest.json").read_text(encoding="utf-8")); hold = json.loads((ROOT / "docs/research/step20-b6-holdout-manifest.json").read_text(encoding="utf-8"))
    check(all(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"] for r in cal["runs"]) and all(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"] for r in hold["runs"] if r.get("modeled")), "STEP 20 trajectories untouched (no retrospective modification)")
    art = json.loads((ROOT / "docs/research/step20-selected-alpha.json").read_text(encoding="utf-8")); check(float(art["selectedAlpha"]) == 0.002, "alpha artifact 0.002")
    # no model / data artifacts
    check(set(x.name for x in (ROOT / "data/research/step20/holdout").iterdir()) <= {"forcing", "trajectories", "gate", "gate-b6"} and not any((ROOT / "data/research").glob("step25*")) and not any((ROOT / "data/research").glob("**/*glorys*")) and not any((ROOT / "data/research").glob("**/*GLORYS*")), "no model artifacts / no GLORYS or step25 data")
    check(not any((ROOT / "docs/research").glob("step25a-*manifest*")) and not any((ROOT / "docs/research").glob("step25a-*evaluation*")), "no step25a run/evaluation artifacts")
    p = json.loads(PROTO.read_text(encoding="utf-8")); q = json.loads(PREREG.read_text(encoding="utf-8")); M = json.loads(MATRIX.read_text(encoding="utf-8")); S = json.loads(SUMMARY.read_text(encoding="utf-8"))
    rule = {l.split()[1]: l.split()[0] for l in RULE.read_text(encoding="utf-8").splitlines() if len(l.split()) == 2}
    check(rule.get("docs/research/step25a-forcing-experiment-protocol.json") == sha(PROTO) == q["protocolSha256"] and rule.get("docs/research/step25a-forcing-experiment-preregistration.json") == sha(PREREG) and rule.get("docs/research/step25a-experiment-matrix.json") == sha(MATRIX) == q["experimentMatrixSha256"]
          and rule.get("docs/research/step25a-experiment-matrix.csv") == sha(MATRIX_CSV) == q["experimentMatrixCsvSha256"] and rule.get("docs/research/step25a-summary.json") == sha(SUMMARY) == q["summarySha256"] and rule.get("tools/research/check_step25a_experiment_design.py") == sha(__file__) == q["validator"]["sha256"], "rule-file cross references (protocol, preregistration, matrix, summary, validator)")
    check(p["status"] == "PREREGISTRATION LOCKED" == q["status"] and p["ruleId"] == q["ruleId"] == M["ruleId"] == S["ruleId"] == "forcing-sensitivity-experiment-design-step25a" and q["gitCommitAtDesign"] == "db6cea2f", "LOCK / rule id / base commit")
    check("c34c6d97" in json.dumps(q["immutabilityCheck"]["ancestryCommits"]) and "PROCESS VIOLATION" in json.dumps(q["immutabilityCheck"]["ancestryCommits"]), "premature commit c34c6d97 preserved in ancestry record")
    fb = p["frozenBaseline"]
    check(fb["alpha"] == 0.002 and fb["comparisonAlpha"] == 0.0 and fb["integrationStepSeconds"] == 300 and fb["outputStepSeconds"] == 900 and "HYCOM GOFS 3.1 GLBv0.08 expt_53.X" in fb["ocean"] and "NCEP-DOE R2" in fb["wind"] and fb["modifiable"] is False and set(fb["forbidden"]) >= {"extrapolation", "smoothing", "zero-fill", "land substitution", "duplicate frames", "source-gap interpolation", "post-hoc forcing repair"}, "frozen baseline")
    t2 = p["test02"]
    check(t2["modelA"]["alpha"] == 0.002 and t2["modelB"]["alpha"] == 0.002 and t2["secondaryPair"]["alpha"] == 0.0 and t2["secondaryPair"]["alphaOptimization"] is False and t2["modelB"]["wind"].startswith("NCEP-DOE R2") and "GLORYS12V1" in t2["modelB"]["ocean"] and t2["runtimeChange"] is False, "TEST-02 A/B definition, identical wind, alpha frozen")
    d = t2["depthRule"]; check(d["primary"].startswith("15 m nearest available native GLORYS level") and "15.81" in d["primary"] and d["verticalInterpolation"] is False and d["depthSearch"] is False and d["bestDepthSelection"] is False and d["recordedFromFile"] is True, "depth rule")
    i = t2["interpolation"]; check(i["spatial"].startswith("native") and "bilinear" in i["spatial"] and i["temporal"] == "linear" and all(i[k] is False for k in ("extrapolation", "smoothing", "gapFilling", "landSubstitution", "frameDuplication")) and i["missingSourceFrame"] == "MODEL BLOCKED", "interpolation rules")
    ns = p["noParameterSearch"]; check(all(ns[k] is False for k in ("alphaGridSearch", "depthGridSearch", "stokesCoefficientSearch", "windageOptimization", "forcingWeightOptimization", "blendingOptimization")), "no parameter search")
    wids = [w["windowId"] for w in p["windows"]]
    check(wids == ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H2", "KE-H3"] and [w["windowId"] for w in p["windows"] if w["pairedComparisonEligible"]] == ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H3"] and next(w for w in p["windows"] if w["windowId"] == "KE-H2")["hycomBaseline"].startswith("UNAVAILABLE") and p["agHoldout"] == "HOLDOUT_UNAVAILABLE", "common windows; KE-H2 not paired; AG unavailable")
    runs = {(r["windowId"], float(r["alpha"])): r["resultArraySha256"] for r in cal["runs"] + [h for h in hold["runs"] if h.get("modeled")]}
    check(all(w["hycomBaselineRuns"][str(a)]["resultArraySha256"] == runs[(w["windowId"], a)] for w in p["windows"] if w["pairedComparisonEligible"] for a in (0.002, 0.0)), "HYCOM baseline run references match STEP 20 manifests")
    cs = p["calibrationHoldoutSeparation"]; check(cs["calibration"] == ["KE-1", "KE-2", "AG-1", "AG-2"] and cs["holdout"] == ["KE-H1", "KE-H2", "KE-H3"] and set(cs["calibrationMustNotChange"]) == {"alpha", "depth", "dataset", "interpolation", "model equation"} and "exactly once" in cs["holdoutEvaluation"], "calibration/holdout separation")
    pm = p["primaryMetric"]; check(pm["horizonsHours"] == [24, 48, 72] and "6371008.8" in pm["distance"] and pm["primarySummary"] == "median error" and pm["secondarySummary"] == "mean error" and pm["medianReplacedByMean"] is False and pm["outlierTrimming"] is False and pm["timestampMatching"] == "exact UTC", "primary metric")
    sm = p["secondaryMetrics"]; check(all(k in sm for k in ("M1", "M2", "M4", "M5")) and set(sm["diagnostics"]) >= {"bearing difference", "east/west signed offset", "north/south signed offset", "temporal error growth", "regional stratification", "unit-level stratification"}, "secondary metrics")
    cr = p["comparisonRule"]; check(cr["delta"].startswith("E_new_forcing - E_HYCOM") and cr["primaryComparison"] == "median paired delta" and "not permitted" in cr["superiorityClaim"], "comparison rule")
    check(p["test06"]["status"] == "BLOCKED" and p["test06"]["stokesCoefficient"] == 1.0 and p["test06"]["coefficientSearch"] is False and p["test06"]["run"] is False and p["test06"]["alpha"] == 0.002, "TEST-06 conditional / blocked")
    check("not observed drifter velocity" in p["test03"]["data"] and "not added to HYCOM automatically" in p["test03"]["data"] and p["test03"]["run"] is False and "frozen before execution" in p["test03"]["formulation"], "AVISO reference-only")
    check(p["MODEL_RUN"] == "FORBIDDEN" and p["modelRunGate"]["trajectoryCount"] == 0 and S["MODEL_RUN"] == "FORBIDDEN" and S["trajectoryCount"] == 0 and all(v is False for v in S["metricsComputed"].values()) and S["dataDownloads"] == 0 and q["phaseA"]["glorysDownloaded"] is False, "model-run / data gates")
    tests = {t["id"]: t for t in M["tests"]}
    check(list(tests) == ["TEST-02", "TEST-06", "TEST-03", "TEST-04"] and tests["TEST-02"]["status"] == "BLOCKED_CREDENTIALS_REQUIRED" and tests["TEST-06"]["status"] == "BLOCKED_LICENSE_UNKNOWN" and tests["TEST-03"]["status"] == "DESIGN_PENDING_FORMULATION" and M["executed"] == 0 and S["tests"] == {t: tests[t]["status"] for t in tests}, "experiment matrix statuses")
    check(len(MATRIX_CSV.read_text(encoding="utf-8").splitlines()) == 5, "matrix CSV 4 rows")
    for st in ("STEP25A establishes experimental design only.", "No new forcing performance result is generated.", "STEP20 alpha=0.002 remains calibration-selected but not established as superior on holdout.", "STEP17 GLORYS BLOCKED/PENDING remains historically immutable.", "DATA-06 remains unavailable for model use while license status is UNKNOWN.", "AVISO remains a partial reference dataset.", "No model run is performed."):
        check(st in p["requiredStatements"] and st in S["statements"], f"statement: {st[:30]}")
    txt = PROTO.read_text(encoding="utf-8") + MATRIX.read_text(encoding="utf-8") + SUMMARY.read_text(encoding="utf-8")
    for pat in (r"password\s*[:=]\s*\S{4,}", r"api[_-]?key\s*[:=]\s*\S{8,}", r"token\s*[:=]\s*[A-Za-z0-9_\-\.]{16,}"):
        check(not re.search(pat, txt, re.I), f"no credential-shaped value: {pat}")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "protocolSha256": sha(PROTO), "preregistrationSha256": sha(PREREG), "matrixSha256": sha(MATRIX), "summarySha256": sha(SUMMARY), "validatorSha256": sha(__file__)}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
