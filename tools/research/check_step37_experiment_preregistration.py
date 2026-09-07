"""Independent validator for STEP 37 (experiment preregistration design; design only). exit 0 = PASS. Verifies: 1 STEP 36 lock commit
identity (043a09b8 = HEAD or ancestor; parent 3ebabfe3) · 2 STEP 36 cohort identity (manifest SHA, derivation hash, status) · 3 nine windows
· 4 twenty unique drifters · 5 first eight windows reproduce STEP 35 · 6 no cohort modification (protocol windows / IDs / order = manifest;
STEP 35/36 files at recorded SHAs) · 7-10 no experiment / velocity / forcing / trajectory access (no data/research/step37; no step37
run/trajectory/evaluation outputs; protocol inputs are metadata only; flags) · 11-13 no model execution, parameter tuning or
performance-based selection (flags; STEP 32 outputs unchanged) · 14 all 45 design fields present and non-empty · 15 primary endpoint
defined (definition, unit, aggregation, valid-sample rule, missing values, comparison, success criterion) · 16 uncertainty method
concrete (bootstrap with B and seed) · 17 statistical unit defined · 18 leakage prevention · 19-21 model / parameter / forcing selection
rules with performance-based selection = false · 22 amendment procedure · 23 provenance requirements · 24 status / report / protocol
consistency · 25 deterministic output. Also: STEP 16-31 locks and runtime unchanged; overclaim-language scan."""
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

PROTO, STATUS, REPORT = D / "step37-experiment-preregistration-protocol.json", D / "step37-experiment-preregistration-status.json", D / "step37-experiment-preregistration-report.md"
LANG = re.compile(r"\bproven\b|\bproves?\b|\boptimal\b|\bbest model\b|\bsuperior\b|production[- ]ready|\bwinner\b|ground truth", re.I)
STRIP = ("expected winner", "Expected winner", "no expected winner", "NONE DECLARED (no expected winner)")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def nonempty(v):
    return v not in (None, "", [], {}) and (not isinstance(v, (list, dict)) or len(v) > 0)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    P, ST = load(PROTO), load(STATUS); rep = REPORT.read_text(encoding="utf-8"); d = P["design"]
    for short in pa.COMMITS + ("ee64354d", "043a09b8"):
        check(git("cat-file", "-t", short).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", short, "HEAD").returncode == 0, f"1 ancestry: {short}")
    check(git("rev-parse", "043a09b8").stdout.strip() == P["ancestry"]["step36LockCommit"] == ST["step36LockCommit"] and git("rev-parse", "043a09b8~1").stdout.strip() == P["ancestry"]["step36Parent"] and git("show", "--format=%s", "-s", "043a09b8").stdout.strip() == "STEP 36: lock cohort extension at 9 windows / 20 drifters", "1 STEP 36 lock commit identity")
    q = load(D / "step32-preregistration.json")
    for rel, expected in pa.LOCK.items():
        exp = expected or q["sourceBinding"].get(rel); check(exp is not None and sha(ROOT / rel) == exp, f"immutability: {rel}")
    for rel, expected in P["ancestry"]["frozenInputs"].items():
        check(sha(ROOT / rel) == expected, f"6 frozen input unchanged: {rel}")
    for name in ("__init__.py", "datasets.py", "models.py", "models_v2.py", "wind.py", "cli.py", "cli_v2.py", "registry.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"runtime unchanged: {name}")
    M36 = load(D / "step36-cohort-extension-manifest.json"); S36 = load(D / "step36-cohort-extension-status.json"); C35 = load(D / "step35-cohort-manifest.json")
    check(P["cohort"]["sha256"] == sha(D / "step36-cohort-extension-manifest.json") == ST["cohortManifestSha256"] and subprocess.run(["git", "show", "043a09b8:docs/research/step36-cohort-extension-manifest.json"], cwd=ROOT, capture_output=True).stdout.replace(b"\r\n", b"\n") == (D / "step36-cohort-extension-manifest.json").read_bytes().replace(b"\r\n", b"\n") and git("rev-parse", "043a09b8:docs/research/step36-cohort-extension-manifest.json").stdout.strip() == git("hash-object", "docs/research/step36-cohort-extension-manifest.json").stdout.strip() and P["cohort"]["derivationHash"] == M36["derivationHash"] == ST["cohortDerivationHash"] and P["cohort"]["derivationHash"].startswith("46892c37") and S36["status"] == "COHORT_EXTENSION_LOCKED" == P["cohort"]["status"], "2 STEP 36 cohort identity (manifest SHA = committed blob; derivation hash; status)")
    ids = [i for w in M36["windows"] for i in w["drifterIds"]]
    check(len(M36["windows"]) == 9 == P["cohort"]["selectedWindows"] == len(P["cohort"]["windows"]) == ST["selectedWindows"], "3 nine windows")
    check(len(ids) == 20 == len(set(ids)) == P["cohort"]["uniqueDrifters"] == ST["uniqueDrifters"] and P["cohort"]["drifterIds"] == ids, "4 twenty unique drifters")
    check([(w["region"], w["start"], w["drifterIds"]) for w in M36["windows"][:8]] == [(w["region"], w["start"], w["drifterIds"]) for w in C35["windows"]] and P["cohort"]["firstEightIdenticalToStep35"] is True, "5 first eight windows reproduce STEP 35")
    check(all(pw["windowId"] == mw["windowId"] and pw["t0"] == mw["start"] and pw["end"] == mw["end"] and pw["drifterIds"] == mw["drifterIds"] and pw["oceanBox"] == mw["oceanBox"] and pw["chronologicalRank"] == mw["chronologicalRank"] == i + 1 for i, (pw, mw) in enumerate(zip(P["cohort"]["windows"], M36["windows"]))) and P["cohort"]["maxWindows"] == 12 and P["cohort"]["immutable"] is True and P["cohort"]["consumedAsIs"] is True, "6 no cohort modification (protocol = manifest, order, boxes, MAX_WINDOWS 12)")
    check(not (ROOT / "data/research/step37").exists() and not any(D.glob("step37-*run*")) and not any(D.glob("step37-*trajector*")) and not any(D.glob("step37-*evaluation*")) and not any(D.glob("step37-*forcing*")) and P["experimentDataAccessed"] is False and all(v is False for v in P["noExperimentInStep37"].values()) and all(not re.search(r"trajector|paired-table|-evaluation|run-manifest|forcing-acquisition|\.nc\b", x) for x in P["inputsRead"]) and P["forbiddenInputAccess"] == 0 == ST["forbiddenInputAccess"], "7-13 no experiment / velocity / forcing / trajectory / model / tuning / performance access")
    for name in ("step32-temporal-run-manifest.json", "step32-candidate-run-manifest.json"):
        for r in load(D / name)["runs"]:
            if r.get("status") == "COMPLETED":
                check(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"], f"10 STEP 32 trajectory unchanged: {r['runId']}")
    keys = sorted(d, key=lambda k: int(k.split("_")[0])); check([int(k.split("_")[0]) for k in keys] == list(range(1, 46)) and all(nonempty(d[k]) for k in keys), "14 all 45 design fields present and non-empty")
    pe = d["8_primaryEndpoint"]; check(all(nonempty(pe.get(k)) for k in ("name", "definition", "unit", "aggregation", "validSampleRule", "missingValues", "comparison", "successCriterion")) and pe["unit"] == "km" and "6371008.8" in pe["definition"] and ("72 h" in pe["definition"] or "72h" in pe["definition"]) and pe["cannotBeReplaced"] is True and ST["primaryEndpoint"] == pe["name"], "15 primary endpoint fully defined")
    u = d["28_uncertaintyEstimation"]; check("bootstrap" in u["method"] and "10000" in u["procedure"] and "seed" in u["procedure"] and "window" in u["method"] and nonempty(d["29_confidenceIntervals"]) and ST["uncertaintyMethod"] == u["method"], "16 uncertainty method concrete (cluster bootstrap, B, seed)")
    su = P["statisticalUnit"]; check(su["cluster"].startswith("window") and "drifter" in su["pairedUnit"] and nonempty(su["justification"]) and "window" in d["27_statisticalTestPlan"]["inferenceUnit"], "17 statistical unit defined and justified")
    lk = P["leakage"]; check(lk["noTuningOnCohort"] is True and "STEP 20" in lk["inheritedExclusions"] and "STEP 32" in lk["inheritedExclusions"] and "never merged" in lk["step32Cohort"] and "68 prior IDs" in P["cohort"]["exclusionInherited"], "18 leakage prevention defined")
    check("NONE" in d["13_modelSelectionRule"] and "no model is chosen" in d["13_modelSelectionRule"] and P["noExperimentInStep37"]["modelSelected"] is False, "19 model-selection rule defined (no performance-based selection)")
    check("fixed before execution" in d["14_parameterSelectionRule"] and "0.002" in d["14_parameterSelectionRule"] and "no parameter is tuned" in d["14_parameterSelectionRule"], "20 parameter-selection rule defined")
    fr = d["15_forcingSelectionRule"]; check(fr["performanceBasedSelection"] is False and len(fr["forcings"]) == 4 and all(nonempty(f.get("product")) and nonempty(f.get("endpoint")) for f in fr["forcings"]) and "WINDOW_BLOCKED" in fr["fallback"] and "no alternative product" in fr["fallback"], "21 forcing-selection rule with identity, resolution, version, fallback")
    check(all(k in d["45_amendmentProcedure"] for k in ("reason", "affected fields", "old value", "new value", "timestamp", "commit SHA", "experiment data")) and nonempty(d["44_protocolChangeCriteria"]), "22 amendment procedure defined")
    pr = d["36_provenanceRequirements"]; check(len(pr) >= 10 and any("cohort identity" in x for x in pr) and any("acquisition timestamp" in x for x in pr) and any("code commit" in x for x in pr) and any("seed" in x for x in pr) and any("model identity" in x for x in pr), "23 provenance requirements defined")
    check(ST["protocolSha256"] == sha(PROTO) and ST["validator"]["sha256"] == sha(__file__) and ST["status"] == P["status"] == "PREREGISTRATION_DESIGN_COMPLETE" and ST["designFields"] == 45 and all(ST[k] is False for k in ("experimentDataAccessed", "scientificExperimentExecuted", "modelSelected", "parameterSelected", "forcingSelected", "automaticCommit")) and "STATUS = PREREGISTRATION_DESIGN_COMPLETE" in rep and sha(PROTO)[:12] in rep and all(w["windowId"] in rep for w in M36["windows"]) and "Model selected: NO" in rep, "24 status / report / protocol consistency")
    # ---- statistical hierarchy clarification (protocol v1.1) ----
    pe = d["8_primaryEndpoint"]; Hh = pe.get("hierarchy", {}); bs = d["28_uncertaintyEstimation"].get("bootstrap", {}); sens = d["28_uncertaintyEstimation"].get("sensitivity", {}); su = P["statisticalUnit"]
    check(all(k in Hh for k in ("level1", "level2", "level3")) and Hh["level1"].startswith("window") and "drifter pair" in Hh["level2"] and "trajectory evaluation points" in Hh["level3"] and su["hierarchy"] == Hh and d["27_statisticalTestPlan"]["hierarchy"] == Hh, "H1 nested statistical hierarchy exists (window > drifter pair > trajectory points)")
    check("NEVER treated as independent" in Hh["independenceRule"] and "never independent" in su["evaluationPoints"] and bs.get("trajectoryPointsResampled") is False, "H2 trajectory points are not primary independent units")
    check(Hh["formula"] == "Theta = median_{w in W*} [ median_{i in V_w} ( E_C,i(72h) - E_A,i(72h) ) ]" and ("equal window weighting" in Hh["weighting"] or "equal-window weighting" in Hh["weighting"]) and Hh["formula"] in pe["definition"] and pe["name"].endswith("Theta") and ST["primaryAggregationFormula"] == Hh["formula"], "H3 exact primary aggregation formula exists (nested median, equal window weighting)")
    check(bs.get("method", "").startswith("window-level") and len(bs.get("procedure", [])) == 4 and "recompute the complete primary statistic" in bs["procedure"][2], "H4 window-level bootstrap explicitly defined")
    check("exactly 9 windows" in bs["procedure"][0] and "with replacement" in bs["procedure"][0] and ST["bootstrap"]["resampledUnit"].startswith("window (exactly 9"), "H5 exactly 9 windows resampled with replacement")
    check("keep every valid drifter-pair delta belonging to each sampled window" in bs["procedure"][1] and bs.get("drifterPairsResampledForPrimary") is False, "H6 drifter pairs remain nested within sampled windows")
    check(bs.get("B") == 10000 and ST["bootstrap"]["B"] == 10000, "H7 B = 10000")
    check(bs.get("seed") == 20260907 and "default_rng(20260907)" in bs["procedure"][0] and ST["bootstrap"]["seed"] == 20260907, "H8 seed = 20260907")
    check("[Q_0.025, Q_0.975]" in bs.get("interval", "") and "percentile" in bs["interval"] and bs["interval"] in d["29_confidenceIntervals"], "H9 percentile interval definition exists")
    check("9 windows" in bs.get("smallClusterLimitation", "") and "NOT to be interpreted as establishing asymptotic normality" in bs["smallClusterLimitation"] and "success criterion is not changed" in bs["smallClusterLimitation"] and bs["smallClusterLimitation"] in d["29_confidenceIntervals"], "H10 small-cluster limitation exists")
    check(sens.get("role") == "SECONDARY / SENSITIVITY ONLY" and "never replace" in sens.get("label", "") and any("SECONDARY / SENSITIVITY ONLY" in x for x in d["33_sensitivityAnalysis"]), "H11 drifter-level bootstrap is secondary / sensitivity only")
    check(pe["successCriterion"].startswith("H1 supported only if the descriptive label is CANDIDATE_DESCRIPTIVELY_FAVORED AND the window-level bootstrap 95 % percentile interval of Theta is entirely < 0 km") and ST["successCriterionUnchanged"] is True and "no inconsistency was found" in pe["mathematicalConsistencyCheck"], "H12 primary success criterion unchanged (label AND 95 % interval < 0)")
    check(P.get("version") == "1.1" and ST.get("protocolVersion") == "1.1" and P["amendmentHistory"][0]["type"].startswith("PRE-LOCK CLARIFICATION") and P["amendmentHistory"][0]["experimentDataAccessed"] is False and ST["preLockClarification"]["previousProtocolSha256"] == P["amendmentHistory"][0]["oldValue"]["protocolSha256"] and "Statistical hierarchy, primary aggregation and bootstrap" in rep and Hh["formula"] in rep, "H13-16 pre-lock clarification auditable; report carries the hierarchy; no data accessed")
    txt = json.dumps({k: v for k, v in P.items() if k != "ancestry"}, ensure_ascii=False) + rep
    for s in STRIP:
        txt = txt.replace(s, "")
    hits = [m.group(0) for m in LANG.finditer(txt)]; check(not hits, f"overclaim language ({hits[:6]})")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "status": ST["status"], "step36LockCommit": ST["step36LockCommit"][:8], "cohort": {"windows": 9, "drifters": 20, "manifestSha256": ST["cohortManifestSha256"][:12]}, "forbiddenInputAccess": ST["forbiddenInputAccess"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
