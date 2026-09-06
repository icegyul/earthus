"""Independent validator for STEP 30A Phase A (final candidate benchmark preregistration). exit 0 = PASS. Deterministic output.
Verifies: ancestry (incl. f0149153) · immutability (STEP 17–29 locks + runtime) · candidate identity (STEP 29 treatment alpha 0.002, GLORYS
15.810070 m, Stokes 1.0) · baseline identity (STEP 25C HYCOM alpha 0.002, 15.000 m) · exact trajectory sources (files + SHAs re-read from the
locked STEP 29 / STEP 25C manifests and on disk) · exact metric (M3 haversine 6371008.8 m, exact UTC, tie 1e-6, median primary) · exact windows
(six; KE-H2 excluded) · no tuning · no model run · no new data · calibration/holdout separation · interpretation rule (A/B/C, 72 h, 2/3)."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
PROTO, RULE, PREREG, SUM = D / "step30a-final-candidate-protocol.md", D / "step30a-rule.json", D / "step30a-preregistration.json", D / "step30a-summary.json"
LOCK = {"docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd", "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4",
        "docs/research/step20-calibration-manifest.json": "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498", "docs/research/step20-b6-holdout-manifest.json": "968da55a4553c00f373d6a0f26bc2b1c9e3f3af421d37db7a1e58e99a5727653",
        "docs/research/step25c-test02-protocol.json": "7ff8468ea8399b8bf9d563980a184203b1b69c55a52cf7a493d1c140c97901ab", "docs/research/step25c-run-manifest.json": "75d6a52b212b40e9e331bd06f362e888e1592873e150f942f8b0320add307e2d",
        "docs/research/step25c-paired-table.csv": "3a5c6b1a339c050a053279514299004a7be5bd614cf6e542433953888c78e002", "docs/research/step25c-summary.json": "42965f31980b47ca9f5dedecc9976a969a6e00d22e9bf227464fbbeea460e78d",
        "docs/research/step26-phase-b-summary.json": "bc242bb58cf98630c529e6c5f8dfaf1e05bce5b218ced248ced29aab22a3fce6", "docs/research/step27-depth-execution-summary.json": "d9c54f1df827af17b25c388b71f3b57357fc80d8db713f713572cf578322ae03",
        "docs/research/step28-field-summary.json": "a81350b33403e1da48384a2217e156ed9bbdaa3e1da685c17bbe08df5aab4175", "docs/research/step29-stokes-license-status.json": "8a8640ac534c1fb9b8551a4a1e777f8a96d6f6c271d896246ed13b8cf93cb24b",
        "docs/research/step29-phase-b-preregistration.json": "82101494c9035557613905d7c26815aabf384f231a827a07452f7c3ab3917745", "docs/research/step29-stokes-manifest.json": "8906b46090db07a9254382b6fa953f871833d611ad6958eac44e9f5c7459e936",
        "docs/research/step29-stokes-paired-table.csv": "972ec47f28c637a8116e2f107f71c2e0a64cc10e2421a96181c2242f1ac9c568", "docs/research/step29-stokes-summary.json": "921783b2db14cb069f4578cb4a7aff29edf0672866c61eb495b7883a20a61e1f",
        "docs/research/step29-stokes-evaluation.json": "acb1a5389e64e6e2f31207f7c32af4ed8f02c4a681ec3c349f96163ba9e2813b", "docs/research/step29-stokes-forcing-manifest.json": "a38e1672472592bd1e90c6c671514178e501b613033dad17f9cd970d3dad7d44",
        "docs/research/step29-stokes-replay-manifest.json": "71cc1da4137671efb683fa76d11080ee8bf5b91874da86bb5581cd9929828875", "tools/research/check_step29_stokes_execution.py": "d38203064cf8a9033120c940ceac891aa7f9b0ac600b556434006f110ee2d1a6",
        "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "4bb4342b", "e0e7cfd2", "db6cea2f", "2841f511", "929d3468", "c974ce42", "86266b3a", "a4474eb8", "3338c7e4", "79a0d69d", "4942421a", "289815d6", "b6660f8a", "f0149153")
WINDOWS = ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H3"]
SELECT = re.compile(r"operational(ly)? superior|\boptimal\b|\bsuperior\b|\bproves?\b|\bcauses?\b|best (model|forcing)|(is|was) selected for", re.I)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"immutability: {rel}")
    for short in COMMITS:
        check(subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() == "commit", f"ancestry: {short}")
    for name in ("__init__.py", "datasets.py", "models.py", "models_v2.py", "wind.py", "cli.py", "cli_v2.py", "registry.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"runtime unchanged: {name}")
    R = load(RULE); q = load(PREREG); S = load(SUM); proto = PROTO.read_text(encoding="utf-8"); p25 = load(D / "step25c-test02-protocol.json"); m29 = load(D / "step29-stokes-manifest.json")
    check(q["status"] == "PREREGISTRATION LOCKED" and q["gitCommitAtDesign"] == "f0149153" and q["protocolSha256"] == sha(PROTO) and q["ruleSha256"] == sha(RULE) and q["summarySha256"] == sha(SUM) and q["validator"]["sha256"] == sha(__file__) and R["ruleId"] == q["ruleId"] == S["ruleId"] == "final-candidate-benchmark-step30a" and R["baseCommit"] == "f0149153", "lock cross references")
    c = R["candidate"]; b = R["baseline"]
    check(c["ocean"] == "GLORYS12V1 native 15.810070 m" and c["depthMeters"] == 15.81007 and c["stokes"] == "WW3 GLOB-30M CFSR surface Stokes drift" and c["stokesCoefficient"] == 1.0 and c["alpha"] == 0.002 and c["equation"] == "dX/dt = U_GLORYS + U_Stokes + 0.002 * U_wind" and c["source"] == "STEP 29 treatment alpha 0.002" and c["rerun"] is False, "candidate identity")
    check(b["ocean"] == "HYCOM GOFS 3.1 GLBv0.08 15.000 m 3-hourly" and b["depthMeters"] == 15.0 and b["alpha"] == 0.002 and b["equation"] == "dX/dt = U_HYCOM + 0.002 * U_wind" and b["source"] == "STEP 25C hycomBaseline 0.002 (STEP 20 trajectories)" and b["rerun"] is False, "baseline identity")
    p25w = {w["windowId"]: w for w in p25["windows"]}; t29 = {r["windowId"]: r for r in m29["runs"] if r["condition"] == "treatment" and r["alpha"] == 0.002}
    check([w["windowId"] for w in R["windows"]] == WINDOWS and R["excluded"]["KE-H2"]["paired"] is False and R["excluded"]["AG-holdout"] == "UNAVAILABLE", "exact windows; KE-H2 excluded")
    for w in R["windows"]:
        wid = w["windowId"]; pw = p25w[wid]; tr = t29[wid]
        check(w["candidate"]["file"] == tr["trajectoriesFile"] and w["candidate"]["sha256"] == tr["trajectoriesSha256"] == sha(ROOT / tr["trajectoriesFile"]) and w["candidate"]["runId"] == tr["runId"] and tr["stokesCoefficient"] == 1.0, f"exact candidate trajectory source: {wid}")
        check(w["baseline"]["file"] == pw["hycomBaseline"]["0.002"]["file"] and w["baseline"]["sha256"] == pw["hycomBaseline"]["0.002"]["sha256"] == sha(ROOT / pw["hycomBaseline"]["0.002"]["file"]), f"exact baseline trajectory source: {wid}")
        check(w["t0"] == pw["t0"] and w["drifterIds"] == pw["drifterIds"] and w["role"] == pw["role"] and w["region"] == pw["region"] and w["releasePositions"] == pw["releasePositions"], f"window identity = STEP 25C: {wid}")
    m = R["metrics"]; check(m["M3"]["radiusMeters"] == 6371008.8 and m["M3"]["horizonsHours"] == [24, 48, 72] and m["M3"]["exactUTC"] is True and m["M3"]["observationInterpolation"] is False and m["delta"] == "E_candidate - E_HYCOM (km); negative = candidate lower error" and m["tieToleranceKm"] == 1e-6 and m["primaryStatistic"] == "paired median delta" and m["secondaryStatistic"] == "paired mean delta" and set(m["secondary"]) == {"M1", "M2", "M4", "M5"} and m["pairing"] == "exact drifter_id and exact UTC timestamp; both sources and the observation valid; no interpolation, no nearest matching, no imputation", "exact metric / pairing")
    ir = R["interpretationRule"]; check(ir["scope"] == "overall stratum" and ir["primaryHorizonHours"] == 72 and ir["consistencyFraction"] == 2 / 3 and set(ir["labels"]) == {"CANDIDATE_DESCRIPTIVELY_FAVORED", "HYCOM_DESCRIPTIVELY_FAVORED", "NO_CLEAR_DESCRIPTIVE_DIFFERENCE"} and ir["newThreshold"] is False and ir["operationalSuperiorityClaim"] is False, "interpretation rule")
    check(R["forbidden"] == {"alphaChange": False, "stokesCoefficientChange": False, "depthChange": False, "forcingChange": False, "timestepChange": False, "interpolationChange": False, "addedPhysics": False, "hycomGlorysBlending": False, "ensembleOptimization": False, "trajectoryGeneration": False, "outlierRemoval": False, "reranking": False, "holdoutSelection": False}, "no tuning")
    check(R["modelRun"] == "FORBIDDEN" and R["modelRunCount"] == 0 and S["modelRunCount"] == 0 and S["evaluation"] == "NOT RUN" and S["newData"] == 0 and R["newData"] == 0 and not any(x for x in D.glob("step30a-final-candidate-*") if not x.name.endswith("-protocol.md")) and not (ROOT / "data/research/step30a").exists(), "no model run / no new data / evaluation not run")
    check(R["strata"]["calibration"] == ["KE-1", "KE-2", "AG-1", "AG-2"] and R["strata"]["holdout"] == ["KE-H1", "KE-H3"] and R["strata"]["holdoutRole"] == "descriptive only; candidate already fixed; no re-ranking", "calibration/holdout separation")
    check(R["context"]["threeWay"] == {"A": "HYCOM (STEP 25C error_H002)", "B": "GLORYS (STEP 25C error_G002)", "C": "GLORYS + Stokes (STEP 29 error_T002)"} and R["context"]["mandatoryDistinction"] == "STEP 29 = C vs B; STEP 30A = C vs A; never confused" and R["context"]["recompute"] is False, "three-way context registered")
    check(not SELECT.search(re.sub(r"operational-superiority claim|no operational-superiority claim|Do not declare operational superiority", "", proto + json.dumps(R, ensure_ascii=False) + json.dumps(S, ensure_ascii=False))), "no selection / superiority language")
    check(S["status"] == "PREREGISTRATION_LOCKED" and S["baseline"] == "HYCOM STEP25C" and S["candidate"] == "GLORYS + Stokes STEP29" and S["alpha"] == 0.002 and S["stokesCoefficient"] == 1.0 and S["depthMeters"] == 15.81007 and S["windows"] == 6 and S["interpretation"] == "NONE", "summary consistent")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "ruleSha256": sha(RULE), "protocolSha256": sha(PROTO), "windows": len(R["windows"]), "modelRunCount": S["modelRunCount"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
