"""Independent validator for STEP 22 (forcing / observation adequacy & requirement analysis). `--phase A` (preregistration only;
outputs absent) or `--phase B`. exit 0 = PASS, exit 1 = FAIL.
Checks: ancestry commits and locked SHAs (STEP 17–21), alpha artifact unchanged (0.002), STEP 20/21 outputs unchanged, runtime
unchanged, no new model run / data acquisition (no new trajectory dirs, no new raw forcing, counters zero), the eight limitation
categories with allowed evidence labels and priorities, physical-process inventory, DATA-01..08 register with allowed availability
labels, TEST-01..08 matrix with required fields, numbers copied from STEP 21 re-verified against the frozen summary, no causal
over-claim wording, gate answers present, output SHAs, reproducibility (independent re-run to a temp dir, byte-identical)."""
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "docs/research/step22-forcing-adequacy-protocol.json"
PREREG = ROOT / "docs/research/step22-forcing-adequacy-preregistration.json"
RULE = ROOT / "docs/research/step22-rule-sha256.txt"
OUTS = ["step22-limitation-assessment.json", "step22-data-requirement-register.json", "step22-future-test-matrix.json", "step22-summary.json", "step22-summary.csv"]
LOCK = {"docs/research/step17-forcing-protocol.md": "db73ef67d1a191d67b29d488805a3c9998a65bf70b80dffe15b40ed8eb041792", "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86",
        "docs/research/step18-model-manifest.json": "02c859f9a079eb68826852589d4c6d313171bcad9b544406212abfe3651a61cb", "docs/research/step18b-model-manifest.json": "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe",
        "docs/research/step19-evaluation.json": "9baa0c6ae4fd38fbd0ea72e479736d0eb8f43f49aac6cebc8dcfa0051490b5f4", "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4",
        "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd", "docs/research/step20-calibration-manifest.json": "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498",
        "docs/research/step20-b6-holdout-manifest.json": "968da55a4553c00f373d6a0f26bc2b1c9e3f3af421d37db7a1e58e99a5727653", "docs/research/step20-b6-holdout-summary.json": "fe2043b30aaba17d34e3d9a780379de9612541b75caa4ed487a10931a784d93b",
        "docs/research/step20-b6-holdout-table.csv": "d21d029bba4e09a15ef19a393f0d8389df0e5750cb1459ed0b1e92372aeea681", "docs/research/step20-b3-holdout-forcing-manifest.json": "10c4f7420d16757b7cd3f23805ce63dde1f58ea63591e8dc9411647d7bc27701",
        "docs/research/step21-model-adequacy-protocol.json": "92e97e5322bcf5a26ad59c2e953fe454340fdb681dfff2f915097a99f787f2e3", "docs/research/step21-model-adequacy-preregistration.json": "ef7d760be00cb3ee250478544fb73d99a9cab7f361cd40445991ca43f2630abd",
        "docs/research/step21-diagnostic-summary.json": "d310eaadf64324286de80e485e9944998665d14d2599ca80133cf3d25b406fbd", "docs/research/step21-diagnostic-table.csv": "e52dc35d6750cc7260e05341d48b7eaa886dfc389f1880547a39b184dbdbbe78",
        "docs/research/step21-diagnostic-run.json": "9f0e21e29ae8766ec078446579c3f2c9729c8c2cb7b79e3f066155a81b7743d5", "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "7b3d2a0e", "ed746129", "63c3e5dd", "7b0453b8")
LABELS = {"DIRECTLY_SUPPORTED", "SUPPORTED_INDICATION", "PLAUSIBLE_BUT_UNTESTED", "INSUFFICIENT_EVIDENCE"}
AVAIL = {"AVAILABLE", "PARTIAL", "UNAVAILABLE", "UNKNOWN"}
PRI = {"P0", "P1", "P2", "P3"}
FORBIDDEN = (r"\bproven cause\b", r"\bvalidated mechanism\b", r"\bconfirmed physical explanation\b", r"\bis the cause\b", r"\bcauses\b", r"\bcaused by\b", r"\bmodel is validated\b", r"\bmodel is accurate\b", r"\bwindage improves\b", r"\boptimal\b")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    phase = sys.argv[sys.argv.index("--phase") + 1] if "--phase" in sys.argv else "B"
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"1 locked file unchanged: {rel}")
    for short in COMMITS:
        check(subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() == "commit", f"1 commit {short}")
    for name in ("netcdf_reader.py", "datasets.py", "models.py", "models_v2.py", "wind.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"1 runtime unchanged: {name}")
    art = json.loads((ROOT / "docs/research/step20-selected-alpha.json").read_text(encoding="utf-8")); check(float(art["selectedAlpha"]) == 0.002, "1 alpha 0.002 unchanged")
    cal = json.loads((ROOT / "docs/research/step20-calibration-manifest.json").read_text(encoding="utf-8")); hold = json.loads((ROOT / "docs/research/step20-b6-holdout-manifest.json").read_text(encoding="utf-8"))
    check(all(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"] for r in cal["runs"]) and all(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"] for r in hold["runs"] if r.get("modeled")), "1 STEP 20 trajectories untouched")
    # no new model runs / data: only the known directories exist under data/research/step20/holdout and no step22 data dir
    known = {"forcing", "trajectories", "gate", "gate-b6"}
    check(set(p.name for p in (ROOT / "data/research/step20/holdout").iterdir()) <= known and not (ROOT / "data/research/step22").exists(), "1 no new model-run or data directories")
    fm = json.loads((ROOT / "docs/research/step20-holdout-forcing-manifest.json").read_text(encoding="utf-8"))
    check(all(sha(ROOT / "data/research/step20/holdout/forcing" / u["windowId"] / ("hycom" if f["product"].startswith("water") else "ncep") / f["filename"]) == f["sha256"] for u in fm["runUnits"] for f in u["hycom"]["files"] + u["ncep"]["files"]), "1 R1 raw forcing unchanged (no acquisition)")
    p = json.loads(PROTO.read_text(encoding="utf-8")); q = json.loads(PREREG.read_text(encoding="utf-8"))
    rule = {l.split()[1]: l.split()[0] for l in RULE.read_text(encoding="utf-8").splitlines() if len(l.split()) == 2}
    check(rule.get("docs/research/step22-forcing-adequacy-protocol.json") == sha(PROTO) == q["protocolSha256"] and rule.get("docs/research/step22-forcing-adequacy-preregistration.json") == sha(PREREG), "2 protocol/preregistration SHA cross-reference")
    check(rule.get("tools/research/check_step22_forcing_adequacy.py") == sha(__file__) and rule.get("tools/research/analyze_step22.py") == sha(ROOT / "tools/research/analyze_step22.py"), "2 validator / tool SHA recorded before execution")
    check(p["ruleId"] == q["ruleId"] == "forcing-adequacy-requirement-analysis-step22" and q["status"] == "PREREGISTRATION LOCKED" and p["descriptiveOnly"] is True and p["frozenBaseline"]["alpha"] == 0.002, "2 rule id / LOCK / baseline alpha")
    check([l["id"] for l in p["limitationCategories"]] == [f"L{i}" for i in range(1, 9)] and set(p["evidenceLabels"]) == LABELS and set(p["priorities"]) == PRI and set(p["availabilityLabels"]) == AVAIL, "2 L1–L8, labels, priorities, availability")
    check(p["prohibited"]["newAlphaSearch"] is False and p["prohibited"]["newTrajectoryRun"] is False and p["prohibited"]["externalDataAcquisition"] is False and p["prohibited"]["performanceImprovementClaim"] is False, "2 prohibitions")
    check([d["id"] for d in p["dataRegisterIds"]] == [f"DATA-0{i}" for i in range(1, 9)] and [t["id"] for t in p["testMatrixIds"]] == [f"TEST-0{i}" for i in range(1, 9)], "2 DATA-01..08 and TEST-01..08 preregistered")
    if phase == "A":
        check(not any((ROOT / "docs/research" / n).exists() for n in OUTS) and not (ROOT / "docs/research/step22-run.json").exists(), "3 Phase A: no outputs exist")
        print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "phase": "A", "protocolSha256": sha(PROTO), "preregistrationSha256": sha(PREREG), "validatorSha256": sha(__file__)}, ensure_ascii=False, indent=2)); return 0 if not failures else 1
    # Phase B
    A = json.loads((ROOT / "docs/research/step22-limitation-assessment.json").read_text(encoding="utf-8")); D = json.loads((ROOT / "docs/research/step22-data-requirement-register.json").read_text(encoding="utf-8"))
    T = json.loads((ROOT / "docs/research/step22-future-test-matrix.json").read_text(encoding="utf-8")); S = json.loads((ROOT / "docs/research/step22-summary.json").read_text(encoding="utf-8")); run = json.loads((ROOT / "docs/research/step22-run.json").read_text(encoding="utf-8"))
    s21 = json.loads((ROOT / "docs/research/step21-diagnostic-summary.json").read_text(encoding="utf-8")); C, Hd = s21["overall"]["CALIBRATION"], s21["overall"]["HOLDOUT"]
    check(run["status"] == "STEP22_REQUIREMENT_ANALYSIS_COMPLETE" and all(run["outputs"][n] == sha(ROOT / "docs/research" / n) for n in OUTS) and run["tool"]["sha256"] == sha(ROOT / "tools/research/analyze_step22.py") and run["modelRuns"] == 0 and run["dataDownloads"] == 0, "3 run record / output SHAs / counters")
    L = A["limitations"]
    check([l["id"] for l in L] == [f"L{i}" for i in range(1, 9)] and all(l["evidenceStrength"] in LABELS and l["priority"] in PRI and all(k in l for k in ("represents", "doesNotRepresent", "expectedSignature", "evidence", "reason", "additionalDataRequired", "priorityReason")) for l in L), "4 eight limitations with required fields and allowed labels")
    check(all(l["evidenceStrength"] != "DIRECTLY_SUPPORTED" for l in L), "4 no limitation claimed DIRECTLY_SUPPORTED (no direct test exists)")
    check(len(A["physicalProcessInventory"]) >= 8 and all(i["evidenceStrength"] in LABELS and i["testPriority"] in PRI for i in A["physicalProcessInventory"]) and any(i["term"] == "Stokes drift" and i["inModel"] is False for i in A["physicalProcessInventory"]), "4 process inventory")
    check(all(m["confidence"] in LABELS and m["candidateTest"].startswith("TEST-") and m["requiredData"] for m in A["errorSignatureRequirementMap"]) and len(A["errorSignatureRequirementMap"]) >= 4, "4 signature→requirement map")
    ev = A["frozenEvidence"]
    check(ev["A_temporalGrowth"]["calibration"]["E24_E48_E72_median_a002"] == [C["a002"]["E24"]["median"], C["a002"]["E48"]["median"], C["a002"]["E72"]["median"]] and ev["A_temporalGrowth"]["holdout"]["ratio72_24_median"] == Hd["a002"]["growth_ratio_72_24"]["median"], "5 STEP 21 numbers copied exactly (growth)")
    check(ev["F_windageOrthogonal"]["towardObservation72_median"] == {"calibration": C["windage_toward_obs_72h"]["median"], "holdout": Hd["windage_toward_obs_72h"]["median"]} and ev["C_directional"]["eastOffset72_median_a002"]["holdout"] == Hd["a002"]["east_offset_72h"]["median"], "5 STEP 21 numbers copied exactly (windage, direction)")
    check(ev["D_alphaEffect"]["step20HoldoutConclusion"] == s21["step20FrozenReference"] and A["step20ConclusionUnchanged"] is True and A["step21ConclusionUnchanged"] is True and A["alphaUnchanged"] == 0.002, "5 STEP 20/21 conclusions frozen")
    reg = D["register"]
    check([d["id"] for d in reg] == [f"DATA-0{i}" for i in range(1, 9)] and all(d["availability"] in AVAIL and d["priority"] in PRI and d["acquisitionNote"].startswith("not downloaded") or d["acquisitionNote"].endswith("not downloaded") for d in reg) and D["noAcquisitionPerformed"] is True, "6 data register DATA-01..08, labels, no acquisition")
    check(all(d["availability"] != "AVAILABLE" for d in reg), "6 no requirement claimed AVAILABLE in the repository (none is)")
    tests = T["tests"]
    check([t["id"] for t in tests] == [f"TEST-0{i}" for i in range(1, 9)] and all(all(k in t for k in ("hypothesis", "requiredData", "dependentVariable", "control", "risk")) for t in tests) and T["noTestExecuted"] is True, "7 test matrix TEST-01..08 with required fields, none executed")
    check(all(d in {r["id"] for r in reg} for t in tests for d in t["requiredData"]) and all(d in {r["id"] for r in reg} for l in A["physicalProcessInventory"] for d in l["requiredData"]), "7 test/inventory data references resolve to the register")
    g = S["modelDevelopmentGate"]
    check(all(k in g for k in ("Q1_continueParameterTuning", "Q2_newForcingOrDataRequired", "Q3_highestPriorityData", "Q4_mandatoryBaselineForNextIteration", "overall")) and "INSUFFICIENT EVIDENCE" in g["overall"], "8 development gate answered; insufficient-evidence statement present")
    check(S["interpretation"] == "DESCRIPTIVE / REQUIREMENT ANALYSIS ONLY" and S["modelValidationClaim"] is False and S["causalAttribution"] is False and S["alphaUnchanged"] == 0.002 and S["counters"] == {"modelRuns": 0, "dataDownloads": 0, "alphaCandidatesAdded": 0, "testsExecuted": 0}, "8 summary flags")
    text = " ".join((ROOT / "docs/research" / n).read_text(encoding="utf-8") for n in OUTS)
    for pat in FORBIDDEN:
        check(not re.search(pat, text, re.I), f"9 no causal / over-claim wording: {pat}")
    check(S["priorityCounts"] == {p_: sum(1 for l in L if l["priority"] == p_) for p_ in ("P0", "P1", "P2", "P3")} and S["evidenceCounts"] == {e: sum(1 for l in L if l["evidenceStrength"] == e) for e in LABELS}, "9 summary counts consistent")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/analyze_step22.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        check(proc.returncode == 0 and all(sha(Path(tmp) / n) == sha(ROOT / "docs/research" / n) for n in OUTS), "10 reproducibility: all five outputs byte-identical on independent re-run")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "phase": "B", "outputs": {n: sha(ROOT / "docs/research" / n) for n in OUTS}}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
