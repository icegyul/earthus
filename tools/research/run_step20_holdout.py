"""STEP 20 Phase B-2: HOLDOUT RUNS ONLY — exactly 6 runtime calls: KE-H1, KE-H2, KE-H3 × {alpha* = 0.002 (locked), 0 (baseline)}.
Model mechanics identical to STEP 18b (export/status helpers imported unchanged from run_step18b_model.py; spec built by the same
build_spec). Forcing = R1 holdout acquisition only (docs/research/step20-holdout-forcing-manifest.json, validated PASS first).
Release positions = STEP 20 preregistration holdout units. Separate-process replay per run. Executed exactly once."""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVICE = ROOT / "services/research-runtime"
sys.path.insert(0, str(SERVICE)); sys.path.insert(0, str(SERVICE / ".deps")); sys.path.insert(0, str(ROOT / "tools/research"))
import run_step18b_model as r18  # noqa: E402

PREREG20 = ROOT / "docs/research/step20-preregistration.json"
PREREG18B = ROOT / "docs/research/step18b-preregistration.json"
ALPHA = ROOT / "docs/research/step20-selected-alpha.json"
FM = ROOT / "docs/research/step20-holdout-forcing-manifest.json"
OUT = ROOT / "data/research/step20/holdout/trajectories"
MANIFEST = ROOT / "docs/research/step20-holdout-manifest.json"
LOCKED = {PREREG20: "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4", ALPHA: "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd",
          PREREG18B: "02935e81e9c93690078ff96231c74ad51c86dfaffa89bfa17a2e2ba082306316", ROOT / "docs/research/step20-generalization-protocol.md": "65b004589570e7e409201e82c9388b17ec53002c4b31282112056d005baabb00",
          ROOT / "docs/research/step20-selection-rule-sha256.txt": "5d980be74fbeb752160143c2e44ecb6611f01f21e94ea528908fc5867d9b46d7"}
ALPHA_TEXT = {0.002: "0.002", 0.0: "0"}


def precheck(p20, art, fm):
    for path, expected in LOCKED.items():
        if r18.sha(path) != expected:
            raise r18.Stop(f"HOLDOUT_BLOCKED_IMMUTABILITY: {path.relative_to(ROOT)}")
    if float(art["selectedAlpha"]) != 0.002 or art["frozen"] is not True or art["holdoutUsed"] is not False:
        raise r18.Stop("HOLDOUT_BLOCKED_IMMUTABILITY: selected-alpha artifact")
    for short in ("155995dd", "73fafffb"):
        if subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() != "commit":
            raise r18.Stop(f"HOLDOUT_BLOCKED_IMMUTABILITY: commit {short}")
    if fm["primaryStatus"] != "FORCING_ACQUISITION_PASS" or fm["acquiredAfterAlphaLock"] is not True:
        raise r18.Stop("HOLDOUT_BLOCKED_FORCING: R1 not PASS")
    if subprocess.run([sys.executable, str(ROOT / "tools/research/check_step20_holdout_forcing.py")], cwd=ROOT, capture_output=True, text=True).returncode != 0:
        raise r18.Stop("HOLDOUT_BLOCKED_FORCING: forcing validator FAIL")
    if MANIFEST.exists() or OUT.exists():
        raise r18.Stop("HOLDOUT_BLOCKED: holdout runs already exist; the holdout is evaluated exactly once")
    cal = {d for u in p20["calibration"]["runUnits"] for d in u["drifterIds"]}; hold = {d for u in p20["holdout"]["runUnits"] for d in u["drifterIds"]}
    if cal & hold or len(hold) != 13:
        raise r18.Stop("HOLDOUT_BLOCKED_IMMUTABILITY: cohort overlap")


def execute(p18b, fm, unit, alpha, models_v2, cli_v2, validate_dataset, validate_wind_dataset):
    f = next(x for x in fm["runUnits"] if x["windowId"] == unit["windowId"])
    for kind in ("hycom", "ncep"):
        if r18.sha(ROOT / f[kind]["normalized"]["file"]) != f[kind]["normalized"]["fileSha256"]:
            raise r18.Stop(f"HOLDOUT_BLOCKED_IMMUTABILITY: normalized {kind} {unit['windowId']}")
    dataset = validate_dataset(r18.load(ROOT / f["hycom"]["normalized"]["file"])); wind = validate_wind_dataset(r18.load(ROOT / f["ncep"]["normalized"]["file"]))
    points = [(d["drifterId"], d["lon"], d["lat"]) for d in sorted(unit["releasePositions"], key=lambda d: d["drifterId"])]
    box = f["oceanDomain"]; area = {"west": box["west"], "east": box["east"], "south": max(box["south"], -40.0), "north": min(box["north"], 40.0)}   # STEP 18b/20 computation area rule
    run_id = f"step20-hold-alpha{ALPHA_TEXT[alpha]}-{unit['windowId']}"
    spec = r18.build_spec(p18b, {**unit, "computationArea": area}, dataset, wind, {"alpha": alpha}, points)
    spec["validationPlanId"] = "model-protocol-step20-generalization-parameter-validation"
    check = models_v2.preflight(spec, dataset, wind)
    rec = {"runId": run_id, "windowId": unit["windowId"], "alpha": alpha, "alphaText": ALPHA_TEXT[alpha], "role": "selected" if alpha else "baseline", "drifterCount": unit["drifterCount"], "released": len(points),
           "integrationStepSeconds": spec["integrationStepSeconds"], "outputStepSeconds": spec["outputStepSeconds"], "durationSeconds": spec["durationSeconds"], "computationArea": area, "area": area,
           "datasetVersions": spec["datasetVersions"], "windDataset": spec["windDataset"], "forcingSha256": f["forcingSha256"], "gridSha256": dataset["manifest"]["sha256"], "windGridSha256": wind["manifest"]["sha256"],
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
    csv_bytes, rows = r18.export_rows(run_id, ALPHA_TEXT[alpha], [d for d, *_ in points], result, area, [])
    csv_path = out_dir / f"alpha{ALPHA_TEXT[alpha]}.trajectories.csv"; csv_path.write_bytes(csv_bytes)
    final = {}
    for tr in result["trajectories"]:
        last = tr["samples"][-1]; key = r18.map_status(last["status"], last["lon"], last["lat"], area); final[key] = final.get(key, 0) + 1
    rec.update({"status": "COMPLETED", "startedAtUTC": started, "completedAtUTC": r18.utc_now(), "wallSeconds": round(time.perf_counter() - t, 1), "modelCommit": prov["modelCommit"],
                "modelSourceSha256": prov["modelSourceSha256"], "specSha256": prov["specSha256"], "resultArraySha256": prov["resultArraySha256"], "environment": prov["environment"],
                "resultFile": str(res_path.relative_to(ROOT)).replace("\\", "/"), "resultSha256": r18.sha(res_path), "trajectoriesFile": str(csv_path.relative_to(ROOT)).replace("\\", "/"),
                "trajectoriesSha256": r18.sha(csv_path), "rows": len(rows), "finalStatusCounts": final, "runtimeStatusCounts": result["summary"]["statusCounts"]})
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
    if not matched:
        rec["status"] = "MODEL_RUN_FAIL"; rec["error"] = "replay mismatch"
    r18.log("run", rec["status"], runId=run_id, wall=rec["wallSeconds"], replayMatched=matched, final=final)
    return rec


def main():
    p20, p18b, art, fm = r18.load(PREREG20), r18.load(PREREG18B), r18.load(ALPHA), r18.load(FM)
    started = r18.utc_now()
    try:
        precheck(p20, art, fm)
    except r18.Stop as exc:
        r18.log("precheck", "BLOCKED", reason=str(exc)); print(str(exc)); return 2
    r18.log("precheck", "PASS", head=subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip())
    from research_runtime import models_v2, cli_v2
    from research_runtime.datasets import validate_dataset
    from research_runtime.wind import validate_wind_dataset
    runs = []
    for unit in p20["holdout"]["runUnits"]:
        for alpha in (0.002, 0.0):
            try:
                runs.append(execute(p18b, fm, unit, alpha, models_v2, cli_v2, validate_dataset, validate_wind_dataset))
            except r18.Stop as exc:
                runs.append({"runId": f"step20-hold-alpha{ALPHA_TEXT[alpha]}-{unit['windowId']}", "windowId": unit["windowId"], "alpha": alpha, "status": str(exc).split(":")[0], "error": str(exc)})
                r18.log("run", "BLOCKED", runId=f"{unit['windowId']}/{alpha}", reason=str(exc))
    complete = len(runs) == 6 and all(x.get("status") == "COMPLETED" and x.get("replayMatched") for x in runs)
    status = "HOLDOUT_RUNS_PASS" if complete else ("MODEL_RUN_BLOCKED_PREFLIGHT" if any(x.get("status") == "MODEL_RUN_BLOCKED_PREFLIGHT" for x in runs) else "MODEL_RUN_FAIL")
    manifest = {"schemaVersion": "1.0", "ruleId": p20["ruleId"], "phase": "B-2 HOLDOUT RUNS (KE)", "status": status, "lockCommit": "155995dd", "alphaLockCommit": "73fafffb",
                "selectedAlpha": 0.002, "baselineAlpha": 0.0, "selectedAlphaArtifactSha256": LOCKED[ALPHA], "step20PreregistrationSha256": LOCKED[PREREG20], "step18bPreregistrationSha256": LOCKED[PREREG18B],
                "holdoutForcingManifestSha256": r18.sha(FM), "aggregateForcingSha256": fm["aggregateForcingSha256"], "observationSha256": p20["immutabilityCheck"]["observationSha256"],
                "modelId": p18b["model"]["modelId"], "modelVersion": p18b["model"]["modelVersion"], "modelSourceSha256": next((x["modelSourceSha256"] for x in runs if "modelSourceSha256" in x), None),
                "modelCommit": next((x["modelCommit"] for x in runs if "modelCommit" in x), None), "environment": next((x["environment"] for x in runs if "environment" in x), None),
                "orchestrator": {"file": "tools/research/run_step20_holdout.py", "sha256": r18.sha(__file__)}, "runs": runs, "runOrder": [x["runId"] for x in runs],
                "agHoldout": "HOLDOUT_UNAVAILABLE", "otherAlphasRun": 0, "holdoutEvaluatedOnce": True, "startedAtUTC": started, "createdAtUTC": r18.utc_now(), "deterministic": True, "randomSeed": None,
                "resultFilesCommitted": False, "interpretation": "NONE", "log": r18.LOG}
    MANIFEST.write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    r18.log("manifest", status, file=str(MANIFEST.relative_to(ROOT)))
    return 0 if status == "HOLDOUT_RUNS_PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
