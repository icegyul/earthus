"""Independent validator for STEP 31 Phase A (model evidence synthesis and next-experiment gate; synthesis only). exit 0 = PASS.
Checks: 1 ancestry (25 commits incl. 813e1954) · 2 immutability (STEP 17-30A locks, runtime byte-identical to 155995dd) · 3 every STEP 20-30A
finding cited in the evidence matrix re-read from its SHA-locked source · 4 no result modification (source SHAs recorded = on disk; no
recomputation flag) · 5 component decision matrix (10 required components, allowed statuses) · 6 evidence strength vocabulary · 7 temporal
forcing identified as UNTESTED_HIGH_PRIORITY · 8 surface / non-geostrophic component UNRESOLVED_PHYSICAL_COMPONENT · 9 no model selection
(MODEL_SELECTION_NOT_READY; CANDIDATE_ONLY; FROZEN_REFERENCE_BASELINE) · 10 no parameter tuning · 11 no new data · 12 no model runs ·
13 future priority ordering · 14 STEP 32 registration (name only, no runs designed) · 15 no overclaim language. Deterministic output."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
PROTO, PREREG, MATRIX, GATE, SUMMARY = D / "step31-model-evidence-synthesis-protocol.md", D / "step31-preregistration.json", D / "step31-evidence-matrix.json", D / "step31-decision-gate.json", D / "step31-summary.json"
LOCK = {"docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd", "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4",
        "docs/research/step20-b6-holdout-summary.json": "fe2043b30aaba17d34e3d9a780379de9612541b75caa4ed487a10931a784d93b", "docs/research/step21-diagnostic-summary.json": "d310eaadf64324286de80e485e9944998665d14d2599ca80133cf3d25b406fbd",
        "docs/research/step22-summary.json": "0093d1c0ab8c73195c76b11da1ddf0609555f5ff49c2698069e31b0a76f4e5bd", "docs/research/step22-limitation-assessment.json": "88eeb25543025d9697ffd4e5cadcf1a0dd376a4eccc7752df009752b7fc4bd3b",
        "docs/research/step22-future-test-matrix.json": "55f6afd8c9c63f93e6472fed12fc636f1468160e1deaa5840c7c5c221d09ba93", "docs/research/step25c-test02-protocol.json": "7ff8468ea8399b8bf9d563980a184203b1b69c55a52cf7a493d1c140c97901ab",
        "docs/research/step25c-paired-table.csv": "3a5c6b1a339c050a053279514299004a7be5bd614cf6e542433953888c78e002", "docs/research/step25c-summary.json": "42965f31980b47ca9f5dedecc9976a969a6e00d22e9bf227464fbbeea460e78d",
        "docs/research/step26-summary.json": "d908506d058180c12017cc887b597b007fefb9c5a794a10c4eaba8abf9d25b03", "docs/research/step26-phase-b-summary.json": "bc242bb58cf98630c529e6c5f8dfaf1e05bce5b218ced248ced29aab22a3fce6",
        "docs/research/step27-depth-execution-summary.json": "d9c54f1df827af17b25c388b71f3b57357fc80d8db713f713572cf578322ae03", "docs/research/step28-field-summary.json": "a81350b33403e1da48384a2217e156ed9bbdaa3e1da685c17bbe08df5aab4175",
        "docs/research/step29-stokes-paired-table.csv": "972ec47f28c637a8116e2f107f71c2e0a64cc10e2421a96181c2242f1ac9c568", "docs/research/step29-stokes-summary.json": "921783b2db14cb069f4578cb4a7aff29edf0672866c61eb495b7883a20a61e1f",
        "docs/research/step29-stokes-evaluation.json": "acb1a5389e64e6e2f31207f7c32af4ed8f02c4a681ec3c349f96163ba9e2813b", "docs/research/step29-stokes-manifest.json": "8906b46090db07a9254382b6fa953f871833d611ad6958eac44e9f5c7459e936",
        "docs/research/step30a-rule.json": "9251be51fc3fc8cc3a3b9570a0b3902c01e653754389da55852bdd4e83ab803d", "docs/research/step30a-preregistration.json": "2abab8c30d4a45c6d2925155e5114663c1de1af73ad6ca24268e9f7179a9db8c",
        "docs/research/step30a-phase-b-preregistration.json": "dae4e7bb448ba9070198c88e51aa9a896f7b2acf2e1e343fac5950a17ec0208f", "docs/research/step30a-validator-r3-preregistration.json": "ae63eeeb290a827ae6ffec8ed2078267c4ec84afad4dc45287e052241001b121",
        "docs/research/step30a-final-candidate-summary.json": "faaf891fa7c5308db70f97add419d370efa7346ee560c30e307ac33d0a01c504", "docs/research/step30a-final-candidate-evaluation.json": "1fe96b3ce1b104d9334cd2f92954cfa0d0e44f8771bc81489b6e8e702227e5ae",
        "docs/research/step30a-final-candidate-table.csv": "b01a5b3d53d3a702952143f53637c21d2027bd04010903b8c93ffefa4cbe61d3", "tools/research/check_step30a_final_candidate_r3.py": "3a6f8fcf5cbc0ba9bddbe8dc81c49f749aef5f930dbfcfc88c91c5de0a5f4e32",
        "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "4bb4342b", "e0e7cfd2", "db6cea2f", "2841f511", "929d3468", "c974ce42", "86266b3a", "a4474eb8", "3338c7e4", "79a0d69d", "4942421a", "289815d6", "f0149153", "94d414b6", "d30607c8", "471e8af9", "813e1954")
COMPONENTS = ["alpha windage", "ocean spatial resolution", "ocean depth", "ocean product identity", "Stokes drift", "ocean temporal resolution", "surface-current structure", "coastal/bathymetric", "mixed-layer / vertical shear", "wave-current coupling"]
STRENGTH = {"DIRECTLY_SUPPORTED", "SUPPORTED_INDICATION", "PLAUSIBLE_BUT_UNTESTED", "INSUFFICIENT_EVIDENCE"}
LOCKED = {"ALPHA": "NOT_ESTABLISHED_AS_SUPERIOR", "SPATIAL_RESOLUTION": "NO_CLEAR_EFFECT", "DEPTH": "NO_CLEAR_EFFECT", "STOKES": "NO_CLEAR_SUPERIORITY", "GLORYS": "NO_CLEAR_SUPERIORITY_OVER_HYCOM", "HYCOM": "NOT_ESTABLISHED_AS_UNIVERSALLY_SUPERIOR", "AVISO": "REFERENCE_ONLY", "TEMPORAL_OCEAN_FORCING": "UNTESTED_HIGH_PRIORITY", "SURFACE_MIXED_LAYER_NON_GEOSTROPHIC_TRANSPORT": "UNRESOLVED_PHYSICAL_COMPONENT"}
PRIORITY = ["TEMPORAL_FORCING", "EXPANDED_INDEPENDENT_HOLDOUT", "MIXED_LAYER_VERTICAL_SHEAR", "SURFACE_NON_GEOSTROPHIC", "COASTAL_BATHYMETRIC"]
LABEL_TOKENS = re.compile(r"NOT_ESTABLISHED_AS_(UNIVERSALLY_)?SUPERIOR|NO_CLEAR_SUPERIORITY(_OVER_HYCOM)?|holdout superiority|operational[- ]superiority|universal superiority|established as superior|scientifically established", re.I)
LANG = re.compile(r"\bproven\b|\bproves?\b|\bcauses?\b|\bcausal\b(?! claim| or| attribution)|\btruth\b|\boptimal\b|\bbest\b|\bsuperior\b|\bvalidated\b|production[- ]ready|statistically significant|\bselected as final\b", re.I)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def scan(text):
    text = LABEL_TOKENS.sub("", text).replace("NOT_OPERATIONALLY_VALIDATED", "").replace("causal claim", "").replace("causalClaim", "").replace("causal or", "").replace("causalAttribution", "").replace("no statistical significance, generalization, causal", "")
    return [m.group(0) for m in LANG.finditer(text)]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for short in COMMITS:
        check(git("cat-file", "-t", short).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", short, "HEAD").returncode == 0, f"1 ancestry: {short}")
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"2 immutability: {rel}")
    for name in ("__init__.py", "datasets.py", "models.py", "models_v2.py", "wind.py", "cli.py", "cli_v2.py", "registry.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"2 runtime unchanged: {name}")
    q, M, G, S = load(PREREG), load(MATRIX), load(GATE), load(SUMMARY)
    check(q["status"] == "PREREGISTRATION LOCKED" and q["gitCommitAtDesign"] == "813e1954" and q["protocolSha256"] == sha(PROTO) and q["evidenceMatrixSha256"] == sha(MATRIX) and q["decisionGateSha256"] == sha(GATE) and q["summarySha256"] == sha(SUMMARY) and q["validator"]["sha256"] == sha(__file__) and q["ruleId"] == M["ruleId"] == G["ruleId"] == S["ruleId"] == "model-evidence-synthesis-step31", "preregistration binds protocol / matrix / gate / summary / validator")
    for rel, expected in M["sources"].items():
        check(sha(ROOT / rel) == expected == q["sources"].get(rel), f"4 source unchanged and recorded: {rel}")
    check(M["resultModification"] is False and M["recomputation"] is False and M["interpretation"] == "SYNTHESIS ONLY" == S["interpretation"], "4 no result modification / no recomputation")
    s20a, s20h, s21, s22, s25, s26, s27, s28, s29, s30 = (load(D / f) for f in ("step20-selected-alpha.json", "step20-b6-holdout-summary.json", "step21-diagnostic-summary.json", "step22-summary.json", "step25c-summary.json", "step26-phase-b-summary.json", "step27-depth-execution-summary.json", "step28-field-summary.json", "step29-stokes-summary.json", "step30a-final-candidate-summary.json"))
    chain = {c["step"]: c for c in M["evidenceChain"]}
    check(list(chain) == ["STEP20", "STEP21", "STEP22", "STEP25C", "STEP26", "STEP27", "STEP28", "STEP29", "STEP30A"], "3 evidence chain covers STEP 20-30A")
    h20 = s20h["overall"]["72h"]; v = chain["STEP20"]["values"]
    check(v["selectedAlpha"] == s20a["selectedAlpha"] == 0.002 and v["holdout72h"] == {"median_delta": h20["delta"]["median_delta"], "wins": h20["wins_alpha0.002"], "losses": h20["losses_alpha0.002"]} and s20h["alphaReselection"] is False and chain["STEP20"]["label"] == "NOT_ESTABLISHED_AS_SUPERIOR", "3 STEP 20 finding = source")
    c21 = s21["overall"]["CALIBRATION"]["a002"]; v = chain["STEP21"]["values"]
    check(v == {"E24": c21["E24"]["median"], "E48": c21["E48"]["median"], "E72": c21["E72"]["median"], "bearing24": c21["bearing_diff_24h"]["median"], "bearing48": c21["bearing_diff_48h"]["median"]} and v["E24"] < v["E48"] < v["E72"], "3 STEP 21 finding = source (temporal growth)")
    check(chain["STEP22"]["values"] == {"priorityCounts": s22["priorityCounts"], "evidenceCounts": s22["evidenceCounts"]} and s22["modelValidationClaim"] is False, "3 STEP 22 finding = source")
    v = chain["STEP25C"]["values"]
    check(all(v[f"{h}h"] == {"median_delta": s25["strata"]["overall"][f"{h}h"]["delta"]["median_delta"], "wins_GLORYS": s25["strata"]["overall"][f"{h}h"]["wins_GLORYS"], "losses_GLORYS": s25["strata"]["overall"][f"{h}h"]["losses_GLORYS"]} for h in (24, 48, 72)) and v["72h"]["median_delta"] == 2.167 and s25["descriptiveLabel"]["primary"] == "NO CLEAR DESCRIPTIVE DIFFERENCE" and chain["STEP25C"]["label"] == "NO_CLEAR_DESCRIPTIVE_DIFFERENCE", "3 STEP 25C finding = source")
    v = chain["STEP26"]["values"]
    check(v["comparison2_72h_median_delta"] == s26["strata"]["overall"]["72h"]["comparison2_C_vs_D"]["delta"]["median_delta"] == 0.198 and v["comparison1"] == s26["comparisons"]["1"]["status"] == "BLOCKED" and v["comparison3"] == "BLOCKED" and s26["descriptiveLabel"]["comparison2"]["primary"] == "NO_CLEAR_SPATIAL_REPRESENTATION_DIFFERENCE" == chain["STEP26"]["label"], "3 STEP 26 finding = source (Comparison 1/3 BLOCKED)")
    o27 = s27["strata"]["overall"]["72h"]; v = chain["STEP27"]["values"]
    check(v == {"D05_vs_D15": o27["D05_vs_D15"]["delta"]["median_delta"], "D10_vs_D15": o27["D10_vs_D15"]["delta"]["median_delta"], "D20_vs_D15": o27["D20_vs_D15"]["delta"]["median_delta"], "depthSelection": s27["depthSelection"]} and s27["depthSelection"] == "NONE" and s27["descriptiveLabel"]["primary"] == "NO_CLEAR_DEPTH_SENSITIVITY" == chain["STEP27"]["label"], "3 STEP 27 finding = source")
    q28 = s28["questions"]; v = chain["STEP28"]["values"]; a28 = {w["windowId"]: w["comparisons"]["A"] for w in s28["windows"] if w["status"] == "EVALUATED" and "A" in w["comparisons"]}
    check(v["Q2_Q3_counts"] == q28["Q2_Q3"]["counts"] == {"GLORYS": 4, "HYCOM": 0} and v["Q6"] == q28["Q6"]["label"] == "MIXED" and v["Q4"] == q28["Q4"]["label"] and v["medianAbsDirDiffPerWindow"] == {k: x["medianAbsDirDiff"] for k, x in a28.items()} and all(0.2 <= x["medianVecDiff"] <= 0.3 and 30 <= x["medianAbsDirDiff"] <= 40 for x in a28.values()) and "not ground truth" in s28["avisoRole"] and chain["STEP28"]["label"] == "AVISO_REFERENCE_ONLY", "3 STEP 28 finding = source (vector diff ~0.25 m/s, direction ~35 deg, AVISO reference only)")
    v = chain["STEP29"]["values"]; h29 = s29["strata"]["holdout"]["72h"]["primary_alpha0.002"]
    check(all(v[f"{h}h"] == {"median_delta": s29["strata"]["overall"][f"{h}h"]["primary_alpha0.002"]["delta"]["median_delta"], "wins_stokes": s29["strata"]["overall"][f"{h}h"]["primary_alpha0.002"]["wins_stokes"], "losses_stokes": s29["strata"]["overall"][f"{h}h"]["primary_alpha0.002"]["losses_stokes"]} for h in (24, 48, 72)) and v["72h"]["median_delta"] == -3.496 and v["holdout72h"] == {"median_delta": h29["delta"]["median_delta"], "wins_stokes": h29["wins_stokes"], "losses_stokes": h29["losses_stokes"]} == {"median_delta": -3.832, "wins_stokes": 8, "losses_stokes": 4} and s29["descriptiveLabel"]["primary"] == "NO_CLEAR_STOKES_DIFFERENCE" == chain["STEP29"]["label"], "3 STEP 29 finding = source")
    v = chain["STEP30A"]["values"]; h30 = s30["strata"]["holdout"]["72h"]
    check(all(v[f"{h}h"] == {"median_delta": s30["strata"]["overall"][f"{h}h"]["delta"]["median"], "wins_candidate": s30["strata"]["overall"][f"{h}h"]["wins_candidate"], "losses_candidate": s30["strata"]["overall"][f"{h}h"]["losses_candidate"]} for h in (24, 48, 72)) and v["72h"] == {"median_delta": -4.244, "wins_candidate": 19, "losses_candidate": 14} and v["consistency72h"] == s30["primary72h"]["consistency_candidate"] == 0.5758 and v["holdout72h"] == {"median_delta": h30["delta"]["median"], "wins_candidate": h30["wins_candidate"], "losses_candidate": h30["losses_candidate"]} and s30["descriptiveLabel"]["primary"] == "NO_CLEAR_DESCRIPTIVE_DIFFERENCE" == chain["STEP30A"]["label"], "3 STEP 30A finding = source")
    check(all(c["evidence"] in STRENGTH for c in M["evidenceChain"]), "6 evidence chain strength vocabulary")
    comps = {c["component"]: c for c in M["componentDecisionMatrix"]}
    check(list(comps) == COMPONENTS and all(set(c) >= {"component", "evidence", "result", "status", "recommendation", "strength"} and c["strength"] in STRENGTH for c in comps.values()), "5 component decision matrix: 10 components with evidence/result/status/recommendation/strength")
    check(comps["ocean temporal resolution"]["status"] == "UNTESTED_HIGH_PRIORITY" and comps["ocean temporal resolution"]["strength"] == "PLAUSIBLE_BUT_UNTESTED" and comps["surface-current structure"]["status"] == "UNRESOLVED_PHYSICAL_COMPONENT" and comps["alpha windage"]["status"] == "NOT_ESTABLISHED_AS_SUPERIOR" and comps["ocean spatial resolution"]["status"] == "NO_CLEAR_EFFECT" and comps["ocean depth"]["status"] == "NO_CLEAR_EFFECT" and comps["Stokes drift"]["status"] == "NO_CLEAR_SUPERIORITY", "5 component statuses consistent with locked conclusions")
    check(G["lockedConclusions"] == LOCKED == S["lockedConclusions"] and set(G["evidenceStrength"]) == set(LOCKED) and set(G["evidenceStrength"].values()) <= STRENGTH and M["evidenceStrengthVocabulary"] == sorted(STRENGTH, key=["DIRECTLY_SUPPORTED", "SUPPORTED_INDICATION", "PLAUSIBLE_BUT_UNTESTED", "INSUFFICIENT_EVIDENCE"].index), "4/6 locked conclusions and strength classification")
    u = G["unresolved"]
    check(u["TEMPORAL_OCEAN_FORCING"]["label"] == "UNTESTED_HIGH_PRIORITY" and "Comparison 1" in u["TEMPORAL_OCEAN_FORCING"]["reason"] and "BLOCKED" in u["TEMPORAL_OCEAN_FORCING"]["reason"] and u["TEMPORAL_OCEAN_FORCING"]["causalClaim"] is False and S["unresolvedHighPriority"] == "TEMPORAL_OCEAN_FORCING" and G["evidenceStrength"]["TEMPORAL_OCEAN_FORCING"] == "PLAUSIBLE_BUT_UNTESTED", "7 temporal forcing identified as untested, no causal claim")
    check(u["SURFACE_MIXED_LAYER_NON_GEOSTROPHIC_TRANSPORT"]["label"] == "UNRESOLVED_PHYSICAL_COMPONENT" and "does not establish which product is wrong" in u["SURFACE_MIXED_LAYER_NON_GEOSTROPHIC_TRANSPORT"]["reason"] and u["SURFACE_MIXED_LAYER_NON_GEOSTROPHIC_TRANSPORT"]["causalClaim"] is False and S["unresolvedPhysicalComponent"] == "SURFACE / MIXED-LAYER / NON-GEOSTROPHIC TRANSPORT", "8 surface / non-geostrophic component identified as unresolved")
    g = G["modelSelectionGate"]
    check(g["Q1"]["answer"] == "NO" and g["Q2"]["answer"] == "NO" and g["Q3"]["answer"] == "NO" and g["Q4"]["answer"] == "NO" and g["Q5"]["answer"] == "NO" and g["Q6"]["answer"] == "YES" and G["finalResearchGate"]["decision"] == "MODEL_SELECTION_NOT_READY" == S["modelSelection"] == q["expectedGate"], "9 model selection gate: NOT_READY; Q1-Q5 NO; Q6 YES")
    check(G["currentResearchModel"]["status"] == "CANDIDATE_ONLY" == S["candidateStatus"] and G["currentResearchModel"]["operational"] == "NOT_OPERATIONALLY_VALIDATED" and G["currentResearchModel"]["alpha"] == 0.002 and G["currentResearchModel"]["depthMeters"] == 15.81007 == S["depthMetersPrimary"] and "1.0" in G["currentResearchModel"]["stokes"] and G["frozenReferenceBaseline"]["status"] == "FROZEN_REFERENCE_BASELINE" == S["frozenReferenceStatus"] and G["frozenReferenceBaseline"]["alpha"] == 0.002 and G["frozenReferenceBaseline"]["depthMeters"] == 15.0 and G["counters"]["MODEL_SELECTION"] == "NO" and G["counters"]["BLENDING"] == "NO", "9 candidate = CANDIDATE_ONLY; HYCOM = FROZEN_REFERENCE_BASELINE; no selection / blending")
    check(G["counters"]["ALPHA_CHANGE"] == "NO" == S["alphaChange"] and G["counters"]["DEPTH_CHANGE"] == "NO" == S["depthChange"] and G["counters"]["FORCING_SELECTION"] == "NO" == S["forcingSelection"] and S["alpha"] == 0.002 and q["alphaChange"] == "NO" and q["depthChange"] == "NO" and q["forcingSelection"] == "NO", "10 no parameter tuning / depth / forcing selection")
    check(G["counters"]["NEW_DATA"] == 0 == S["newData"] == q["newData"] and G["counters"]["NEW_TRAJECTORIES"] == 0 == S["newTrajectories"] == q["newTrajectories"] and not (ROOT / "data/research/step31").exists(), "11 no new data / trajectories")
    check(G["counters"]["MODEL_RUN_COUNT"] == 0 == S["modelRunCount"] == q["modelRunPlan"] and G["noNewPerformanceExperimentNow"] is True and not any(D.glob("step31-*manifest*")) and not any(D.glob("step31-*trajector*")), "12 no model runs / no execution outputs")
    p = G["nextExperimentPriority"]
    check([x["rank"] for x in p] == [1, 2, 3, 4, 5] and [x["name"] for x in p] == PRIORITY == S["nextPriority"] and all(x["executedHere"] is False for x in p) and p[0]["id"] == "TEST-TEMPORAL" and "HYCOM_NATIVE_3H vs HYCOM_DAILY" in p[0]["purpose"] and "no current holdout reused" in p[1]["requirement"] and "without post-hoc depth selection" in p[2]["purpose"] and "only if future evidence" in p[4]["requirement"], "13 future priority ordering 1-5 registered, nothing executed")
    check(G["step32Candidate"]["id"] == "STEP32" and G["step32Candidate"]["name"] == "INDEPENDENT EXPANDED VALIDATION / TEMPORAL FORCING TEST" == S["step32Candidate"] and G["step32Candidate"]["modelRunsDesigned"] is False and "STEP 32 Phase A" in G["step32Candidate"]["note"], "14 STEP 32 registered as candidate phase only")
    tw = M["threeWayFinalEvidence"]["rows"]
    check(all(tw[f"{h}h"]["paired_delta"]["Stokes_minus_HYCOM_step30a"]["median"] == s30["strata"]["overall"][f"{h}h"]["delta"]["median"] and tw[f"{h}h"]["paired_delta"]["GLORYS_minus_HYCOM_step25c"]["median"] == s25["strata"]["overall"][f"{h}h"]["delta"]["median_delta"] and tw[f"{h}h"]["paired_delta"]["Stokes_minus_GLORYS_step29"]["median"] == s29["strata"]["overall"][f"{h}h"]["primary_alpha0.002"]["delta"]["median_delta"] and tw[f"{h}h"]["median_M3"] == {"HYCOM": s30["strata"]["overall"][f"{h}h"]["threeWayFrozen"]["A_HYCOM_step25c_error_H002"]["median"], "GLORYS": s30["strata"]["overall"][f"{h}h"]["threeWayFrozen"]["B_GLORYS_step25c_error_G002"]["median"], "GLORYS_Stokes": s30["strata"]["overall"][f"{h}h"]["threeWayFrozen"]["C_STOKES_step29_error_T002"]["median"]} for h in (24, 48, 72)) and M["threeWayFinalEvidence"]["holdout72h"]["Stokes_minus_HYCOM_step30a"]["median"] == h30["delta"]["median"], "3/4 three-way final evidence = frozen values (24/48/72 h + holdout)")
    hits = []
    for name, obj in (("matrix", M), ("gate", G), ("summary", S), ("preregistration", q)):
        hits += [f"{name}:{h}" for h in scan(json.dumps(obj, ensure_ascii=False))]
    hits += [f"protocol:{h}" for h in scan(PROTO.read_text(encoding="utf-8"))]
    check(not hits, f"15 no overclaim language ({hits[:8]})")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "phase": "A", "gate": G["finalResearchGate"]["decision"], "candidate": G["currentResearchModel"]["status"], "modelRunCount": G["counters"]["MODEL_RUN_COUNT"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
