"""STEP 20 Phase B-1: CALIBRATION RUNS ONLY. 4 locked calibration units x 5 locked alphas = 20 runtime calls in the fixed
order (unit KE-1, KE-2, AG-1, AG-2; alpha 0, 0.0003, 0.0007, 0.0010, 0.0020), STEP 17 forcing only, STEP 18b model mechanics
unchanged (export/status functions imported from run_step18b_model.py). alpha 0 / 0.0007 result-array SHAs must equal the
STEP 18b manifest (CALIBRATION_BLOCKED_REPRODUCIBILITY otherwise). Separate-process replay per run. No holdout access."""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVICE = ROOT / "services/research-runtime"
sys.path.insert(0, str(SERVICE)); sys.path.insert(0, str(SERVICE / ".deps")); sys.path.insert(0, str(ROOT / "tools/research"))
import run_step18b_model as r18  # noqa: E402  (pure helpers reused: sha, load, log, utc_now, release_points, build_spec, export_rows, map_status, Stop)

PREREG20 = ROOT / "docs/research/step20-preregistration.json"
PROTO20 = ROOT / "docs/research/step20-generalization-protocol.md"
RULE20 = ROOT / "docs/research/step20-selection-rule-sha256.txt"
PREREG18B = ROOT / "docs/research/step18b-preregistration.json"
MANIFEST18B = ROOT / "docs/research/step18b-model-manifest.json"
FM17 = ROOT / "docs/research/step17-forcing-manifest.json"
OUT = ROOT / "data/research/step20/calibration"
MANIFEST = ROOT / "docs/research/step20-calibration-manifest.json"
LOCKED = {PROTO20: "65b004589570e7e409201e82c9388b17ec53002c4b31282112056d005baabb00", PREREG20: "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4",
          RULE20: "5d980be74fbeb752160143c2e44ecb6611f01f21e94ea528908fc5867d9b46d7", ROOT / "tools/research/check_step20_preregistration.py": "ce197824c10dc063df40439871614fa35196cb08a7cede533244b468d8fe32b3",
          PREREG18B: "02935e81e9c93690078ff96231c74ad51c86dfaffa89bfa17a2e2ba082306316", MANIFEST18B: "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe",
          FM17: "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86", ROOT / "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd")
ALPHA_TEXT = {0: "0", 0.0003: "0.0003", 0.0007: "0.0007", 0.0010: "0.001", 0.0020: "0.002"}
HOLDOUT_TOKENS = ("KE-H", "holdout")


def precheck(p20, m18b):
    for path, expected in LOCKED.items():
        if r18.sha(path) != expected:
            raise r18.Stop(f"CALIBRATION_BLOCKED_IMMUTABILITY: {path.relative_to(ROOT)}")
    for short in COMMITS:
        if subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() != "commit":
            raise r18.Stop(f"CALIBRATION_BLOCKED_IMMUTABILITY: commit {short}")
    if subprocess.run([sys.executable, str(ROOT / "tools/research/check_step20_preregistration.py")], cwd=ROOT, capture_output=True, text=True).returncode != 0:
        raise r18.Stop("CALIBRATION_BLOCKED_IMMUTABILITY: STEP 20 preregistration checker FAIL")
    if MANIFEST.exists() or OUT.exists():
        raise r18.Stop("CALIBRATION_BLOCKED_IMMUTABILITY: calibration outputs already exist; no overwrite")
    for run in m18b["runs"]:
        for key, fkey in (("trajectoriesSha256", "trajectoriesFile"), ("resultSha256", "resultFile")):
            if r18.sha(ROOT / run[fkey]) != run[key]:
                raise r18.Stop(f"CALIBRATION_BLOCKED_IMMUTABILITY: STEP 18b {run[fkey]}")
    fm = r18.load(FM17)
    for u in p20["calibration"]["runUnits"]:
        f = next(x for x in fm["runUnits"] if x["windowId"] == u["windowId"])
        for kind, key in (("hycom", "hycomGridSha256"), ("ncep", "ncepGridSha256")):
            if f[kind]["normalized"]["gridSha256"] != u[key]:
                raise r18.Stop(f"CALIBRATION_BLOCKED_IMMUTABILITY: grid {u['windowId']}")
        for x in f["hycom"]["files"] + f["ncep"]["files"]:
            path = ROOT / "data/research/step17" / u["windowId"] / ("hycom" if x["product"].startswith("water") else "ncep") / x["filename"]
            if r18.sha(path) != x["sha256"]:
                raise r18.Stop(f"CALIBRATION_BLOCKED_IMMUTABILITY: raw forcing {x['filename']}")
        if f["forcingSha256"] != u["forcingSha256"]:
            raise r18.Stop(f"CALIBRATION_BLOCKED_IMMUTABILITY: forcingSha256 {u['windowId']}")
    return fm


def execute(p18b, cohort, fm, unit, alpha, expected_sha, models_v2, cli_v2, validate_dataset, validate_wind_dataset):
    f = next(x for x in fm["runUnits"] if x["windowId"] == unit["windowId"])
    dataset = validate_dataset(r18.load(ROOT / f["hycom"]["normalized"]["file"])); wind = validate_wind_dataset(r18.load(ROOT / f["ncep"]["normalized"]["file"]))
    if r18.sha(ROOT / f["hycom"]["normalized"]["file"]) != f["hycom"]["normalized"]["fileSha256"] or r18.sha(ROOT / f["ncep"]["normalized"]["file"]) != f["ncep"]["normalized"]["fileSha256"]:
        raise r18.Stop("CALIBRATION_BLOCKED_IMMUTABILITY: normalized forcing file")
    points = r18.release_points(cohort, unit)
    run_id = f"step20-cal-alpha{ALPHA_TEXT[alpha]}-{unit['windowId']}"
    spec = r18.build_spec(p18b, unit, dataset, wind, {"alpha": alpha}, points)
    spec["validationPlanId"] = "model-protocol-step20-generalization-parameter-validation"
    check = models_v2.preflight(spec, dataset, wind)
    rec = {"runId": run_id, "windowId": unit["windowId"], "alpha": alpha, "alphaText": ALPHA_TEXT[alpha], "drifterCount": unit["drifterCount"], "released": len(points),
           "integrationStepSeconds": spec["integrationStepSeconds"], "outputStepSeconds": spec["outputStepSeconds"], "durationSeconds": spec["durationSeconds"], "area": unit["computationArea"],
           "datasetVersions": spec["datasetVersions"], "windDataset": spec["windDataset"], "forcingSha256": unit["forcingSha256"], "gridSha256": dataset["manifest"]["sha256"], "windGridSha256": wind["manifest"]["sha256"],
           "preflight": {"ok": check["ok"], "errors": check["errors"], "estimate": check.get("estimate")}}
    if not check["ok"]:
        rec["status"] = "MODEL_RUN_BLOCKED_PREFLIGHT"; r18.log("preflight", "BLOCKED", runId=run_id, errors=check["errors"]); return rec
    r18.log("run", "START", runId=run_id, particles=len(points)); t = time.perf_counter(); started = r18.utc_now()
    try:
        result = models_v2.run_experiment(spec, dataset, wind, run_id=run_id)
    except Exception as exc:
        r18.log("run", "EXCEPTION", runId=run_id, error=str(exc))
        try:
            result = models_v2.run_experiment(spec, dataset, wind, run_id=run_id); rec["retried"] = True
        except Exception as exc2:
            rec.update(status="MODEL_RUN_FAIL", error=str(exc2)); return rec
    prov = result["provenance"]
    if prov["windage"]["alpha"] != alpha or prov["integrationStepSeconds"] != 300 or prov["outputStepSeconds"] != 900:
        rec.update(status="MODEL_RUN_FAIL", error="post-run parameter verification failed"); return rec
    out_dir = OUT / unit["windowId"]; out_dir.mkdir(parents=True, exist_ok=True)
    res_path = out_dir / f"alpha{ALPHA_TEXT[alpha]}.result.json"; res_path.write_bytes(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=1).encode("utf-8"))
    csv_bytes, rows = r18.export_rows(run_id, ALPHA_TEXT[alpha], [d for d, *_ in points], result, unit["computationArea"], [])
    csv_path = out_dir / f"alpha{ALPHA_TEXT[alpha]}.trajectories.csv"; csv_path.write_bytes(csv_bytes)
    final = {}
    for tr in result["trajectories"]:
        last = tr["samples"][-1]; key = r18.map_status(last["status"], last["lon"], last["lat"], unit["computationArea"]); final[key] = final.get(key, 0) + 1
    rec.update({"status": "COMPLETED", "startedAtUTC": started, "completedAtUTC": r18.utc_now(), "wallSeconds": round(time.perf_counter() - t, 1), "modelCommit": prov["modelCommit"],
                "modelSourceSha256": prov["modelSourceSha256"], "specSha256": prov["specSha256"], "resultArraySha256": prov["resultArraySha256"], "environment": prov["environment"],
                "resultFile": str(res_path.relative_to(ROOT)).replace("\\", "/"), "resultSha256": r18.sha(res_path), "trajectoriesFile": str(csv_path.relative_to(ROOT)).replace("\\", "/"),
                "trajectoriesSha256": r18.sha(csv_path), "rows": len(rows), "finalStatusCounts": final, "runtimeStatusCounts": result["summary"]["statusCounts"]})
    if expected_sha is not None:
        rec["step18bResultArraySha256"] = expected_sha; rec["matchesStep18b"] = prov["resultArraySha256"] == expected_sha
        if not rec["matchesStep18b"]:
            rec["status"] = "CALIBRATION_BLOCKED_REPRODUCIBILITY"
    bundles = out_dir / "bundles"; bundles.mkdir(exist_ok=True)
    bundle = Path(cli_v2.export_bundle(spec, dataset, wind, result, bundles / f"alpha{ALPHA_TEXT[alpha]}.zip"))
    proc = subprocess.run([sys.executable, "-m", "research_runtime.cli_v2", "replay", str(bundle)], capture_output=True, text=True, cwd=SERVICE, env={**os.environ, "PYTHONPATH": ".;.deps"})
    outcome = {}
    if "{" in proc.stdout:
        try:
            outcome = json.loads(proc.stdout[proc.stdout.find("{"):])
        except json.JSONDecodeError:
            outcome = {}
    matched = proc.returncode == 0 and outcome.get("matched") is True and outcome.get("resultArraySha256") == prov["resultArraySha256"]
    rec["replay"] = {"process": "separate python -m research_runtime.cli_v2 replay", "bundle": str(bundle.relative_to(ROOT)).replace("\\", "/"), "bundleSha256": r18.sha(bundle), "returncode": proc.returncode, "replayResultSha256": outcome.get("resultArraySha256")}
    rec["replayMatched"] = matched
    if not matched and rec["status"] == "COMPLETED":
        rec["status"] = "MODEL_RUN_FAIL"; rec["error"] = "replay mismatch"
    r18.log("run", rec["status"], runId=run_id, wall=rec["wallSeconds"], replayMatched=matched, final=final, matchesStep18b=rec.get("matchesStep18b"))
    return rec


def main():
    p20, p18b, m18b = r18.load(PREREG20), r18.load(PREREG18B), r18.load(MANIFEST18B)
    started = r18.utc_now()
    try:
        fm = precheck(p20, m18b)
    except r18.Stop as exc:
        r18.log("precheck", "BLOCKED", reason=str(exc)); print(str(exc)); return 2
    r18.log("precheck", "PASS", head=subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip())
    from research_runtime import models_v2, cli_v2
    from research_runtime.datasets import validate_dataset
    from research_runtime.wind import validate_wind_dataset
    cohort = r18.load(ROOT / "docs/research/cohort-step16.json")
    expected = {(run["windowId"], run["alpha"]): run["resultArraySha256"] for run in m18b["runs"]}
    runs = []
    for unit in p20["calibration"]["runUnits"]:
        if any(tok in unit["windowId"] for tok in HOLDOUT_TOKENS):
            raise SystemExit("HOLDOUT FIREWALL: holdout unit in calibration list")
        for alpha in p20["alphaCandidates"]:
            try:
                runs.append(execute(p18b, cohort, fm, unit, alpha, expected.get((unit["windowId"], float(alpha))), models_v2, cli_v2, validate_dataset, validate_wind_dataset))
            except r18.Stop as exc:
                runs.append({"runId": f"step20-cal-alpha{ALPHA_TEXT[alpha]}-{unit['windowId']}", "windowId": unit["windowId"], "alpha": alpha, "status": str(exc).split(":")[0], "error": str(exc)})
                r18.log("run", "BLOCKED", runId=f"{unit['windowId']}/{alpha}", reason=str(exc))
    complete = len(runs) == 20 and all(x.get("status") == "COMPLETED" and x.get("replayMatched") for x in runs)
    status = "CALIBRATION_RUNS_PASS" if complete else ("CALIBRATION_BLOCKED_REPRODUCIBILITY" if any(x.get("status") == "CALIBRATION_BLOCKED_REPRODUCIBILITY" for x in runs)
                                                        else ("MODEL_RUN_BLOCKED_PREFLIGHT" if any(x.get("status") == "MODEL_RUN_BLOCKED_PREFLIGHT" for x in runs) else "MODEL_RUN_FAIL"))
    manifest = {"schemaVersion": "1.0", "ruleId": p20["ruleId"], "phase": "B-1 CALIBRATION RUNS", "status": status, "lockCommit": "155995dd",
                "step20ProtocolSha256": r18.sha(PROTO20), "step20PreregistrationSha256": r18.sha(PREREG20), "step20SelectionRuleSha256": r18.sha(RULE20),
                "step18bPreregistrationSha256": LOCKED[PREREG18B], "step18bManifestSha256": LOCKED[MANIFEST18B], "forcingManifestSha256": LOCKED[FM17], "cohortSha256": LOCKED[ROOT / "docs/research/cohort-step16.json"],
                "observationSha256": p20["immutabilityCheck"]["observationSha256"], "alphaCandidates": p20["alphaCandidates"], "alphaText": {str(k): v for k, v in ALPHA_TEXT.items()},
                "modelId": p18b["model"]["modelId"], "modelVersion": p18b["model"]["modelVersion"], "modelSourceSha256": next((x["modelSourceSha256"] for x in runs if "modelSourceSha256" in x), None),
                "modelCommit": next((x["modelCommit"] for x in runs if "modelCommit" in x), None), "environment": next((x["environment"] for x in runs if "environment" in x), None),
                "orchestrator": {"file": "tools/research/run_step20_calibration.py", "sha256": r18.sha(__file__)}, "runs": runs, "runOrder": [x["runId"] for x in runs],
                "step18bReproducibility": {f"{x['windowId']}/{x['alphaText']}": x.get("matchesStep18b") for x in runs if "matchesStep18b" in x},
                "holdoutAccess": 0, "forcingDownloads": 0, "holdoutEvaluation": 0, "startedAtUTC": started, "createdAtUTC": r18.utc_now(), "deterministic": True, "randomSeed": None,
                "resultFilesCommitted": False, "interpretation": "NONE", "log": r18.LOG}
    MANIFEST.write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    r18.log("manifest", status, file=str(MANIFEST.relative_to(ROOT)))
    return 0 if status == "CALIBRATION_RUNS_PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
