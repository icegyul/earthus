"""STEP 26 Phase B runner — Condition C (GLORYS_NATIVE_DAILY, STEP 25C normalized forcing) and Condition D (GLORYS_COARSE_DAILY,
derived forcing) on the frozen runtime, alpha 0.002 only, six locked windows -> 12 runs. Order: 6 C runs, then the mandatory
C-reproduction gate against the STEP 25C GLORYS alpha 0.002 result arrays (bitwise digest of the numeric trajectory arrays, plus
CSV rows identical after removing the run_id column); only if every window passes are the 6 D runs executed. Each run is replayed
in a separate process (tools/research/replay_step25c_run.py, locked at 4953719d) from the on-disk spec/forcing/wind. No HYCOM run,
no Condition B, no alpha 0. Helpers reused verbatim from run_step18b_model.py."""
import csv
import hashlib
import io
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVICE = ROOT / "services/research-runtime"
sys.path.insert(0, str(SERVICE)); sys.path.insert(0, str(SERVICE / ".deps")); sys.path.insert(0, str(ROOT / "tools/research"))
import run_step18b_model as r18  # noqa: E402

RULE = ROOT / "docs/research/step26-forcing-decomposition-rule.json"
PREREG = ROOT / "docs/research/step26-preregistration.json"
PBLOCK = ROOT / "docs/research/step26-phase-b-preregistration.json"
DERIVED = ROOT / "docs/research/step26-derived-forcing-manifest.json"
RUNS25C = ROOT / "docs/research/step25c-run-manifest.json"
PREREG18B = ROOT / "docs/research/step18b-preregistration.json"
REPLAY = ROOT / "tools/research/replay_step25c_run.py"
OUT = ROOT / "data/research/step26/trajectories"
MANIFEST = ROOT / "docs/research/step26-forcing-decomposition-manifest.json"
LOCKED = {RULE: None, PREREG: None, PREREG18B: "02935e81e9c93690078ff96231c74ad51c86dfaffa89bfa17a2e2ba082306316", RUNS25C: "75d6a52b212b40e9e331bd06f362e888e1592873e150f942f8b0320add307e2d", REPLAY: "5dd8c14da33dcd75c50c8e52dc517456d46a1a2f4ad38b3918687d16b4a73ff5",
          ROOT / "docs/research/step25c-test02-protocol.json": "7ff8468ea8399b8bf9d563980a184203b1b69c55a52cf7a493d1c140c97901ab", ROOT / "docs/research/step20-calibration-manifest.json": "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498", ROOT / "docs/research/step20-b6-holdout-manifest.json": "968da55a4553c00f373d6a0f26bc2b1c9e3f3af421d37db7a1e58e99a5727653"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "ed746129", "2841f511", "929d3468", "c974ce42", "86266b3a")
ALPHA = 0.002


def precheck(R, q, pb):
    if r18.sha(RULE) != q["ruleSha256"] or q["status"] != "PREREGISTRATION LOCKED" or pb["ruleSha256"] != r18.sha(RULE) or pb["status"] != "PREREGISTRATION LOCKED":
        raise r18.Stop("STEP26_BLOCKED_IMMUTABILITY: rule/preregistration")
    for path, expected in LOCKED.items():
        if expected and r18.sha(path) != expected:
            raise r18.Stop(f"STEP26_BLOCKED_IMMUTABILITY: {path.relative_to(ROOT)}")
    for t, expected in pb["tools"].items():
        if r18.sha(ROOT / t) != expected:
            raise r18.Stop(f"STEP26_BLOCKED_IMMUTABILITY: tool {t}")
    for short in COMMITS:
        if subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() != "commit":
            raise r18.Stop(f"STEP26_BLOCKED_IMMUTABILITY: commit {short}")
    if MANIFEST.exists() or OUT.exists():
        raise r18.Stop("STEP26_BLOCKED_IMMUTABILITY: run outputs already exist; no overwrite")
    dm = r18.load(DERIVED)
    if dm["ruleSha256"] != r18.sha(RULE) or dm["windowCount"] != 6 or dm["derivationScript"]["sha256"] != pb["tools"]["tools/research/derive_step26_coarse.py"]:
        raise r18.Stop("STEP26_BLOCKED_IMMUTABILITY: derived forcing manifest")
    for w in R["windows"]:
        d = next(x for x in dm["windows"] if x["windowId"] == w["windowId"])
        if r18.sha(ROOT / d["derived"]["file"]) != d["derived"]["fileSha256"] or d["targetGrid"]["axesSha256"] != w["hycomGrid"]["axesSha256"] or d["source"]["fileSha256"] != w["glorysNormalized"]["fileSha256"]:
            raise r18.Stop(f"STEP26_BLOCKED_IMMUTABILITY: derived forcing {w['windowId']}")
        if r18.sha(ROOT / w["glorysNormalized"]["file"]) != w["glorysNormalized"]["fileSha256"] or r18.sha(ROOT / w["wind"]["file"]) != w["wind"]["sha256"] or r18.sha(ROOT / w["hycomReference"]["file"]) != w["hycomReference"]["sha256"]:
            raise r18.Stop(f"STEP26_BLOCKED_IMMUTABILITY: inputs {w['windowId']}")
    return dm


def csv_without_run_id(path):
    with open(path, encoding="utf-8", newline="") as fh:
        rows = [r[1:] for r in csv.reader(fh)]
    buf = io.StringIO(newline=""); csv.writer(buf, lineterminator="\n").writerows(rows)
    return hashlib.sha256(buf.getvalue().encode("utf-8")).hexdigest()


def execute(p18b, w, cond, forcing_file, expected_grid_sha, models_v2, cli_v2, validate_dataset, validate_wind_dataset):
    dataset = validate_dataset(r18.load(ROOT / forcing_file)); wind = validate_wind_dataset(r18.load(ROOT / w["wind"]["file"]))
    if dataset["manifest"]["sha256"] != expected_grid_sha or wind["manifest"]["sha256"] != w["wind"]["gridSha256"] or dataset["manifest"]["surfaceDepthMeters"] != 15.81007 or dataset["manifest"]["timeStepSeconds"] != 86400:
        raise r18.Stop(f"STEP26_BLOCKED_IMMUTABILITY: forcing identity {cond} {w['windowId']}")
    wid = w["windowId"]; points = [(d["drifterId"], d["lon"], d["lat"]) for d in sorted(w["releasePositions"], key=lambda d: d["drifterId"])]
    unit = {"windowId": wid, "t0": w["t0"], "computationArea": w["computationArea"], "drifterCount": w["drifterCount"]}
    run_id = f"step26-{cond}-alpha0.002-{wid}"
    spec = r18.build_spec(p18b, unit, dataset, wind, {"alpha": ALPHA}, points); spec["validationPlanId"] = "forcing-decomposition-step26"
    check = models_v2.preflight(spec, dataset, wind)
    rec = {"runId": run_id, "windowId": wid, "role": w["role"], "condition": cond, "alpha": ALPHA, "alphaText": "0.002", "drifterCount": w["drifterCount"], "released": len(points), "drifterIds": [d for d, *_ in points], "integrationStepSeconds": spec["integrationStepSeconds"], "outputStepSeconds": spec["outputStepSeconds"], "durationSeconds": spec["durationSeconds"],
           "area": unit["computationArea"], "datasetVersions": spec["datasetVersions"], "windDataset": spec["windDataset"], "forcingFile": forcing_file, "forcingFileSha256": r18.sha(ROOT / forcing_file), "gridSha256": dataset["manifest"]["sha256"], "sourceSha256": dataset["manifest"]["sourceSha256"], "windGridSha256": wind["manifest"]["sha256"], "depthMeters": dataset["manifest"]["surfaceDepthMeters"],
           "preflight": {"ok": check["ok"], "errors": check["errors"], "estimate": check.get("estimate")}}
    if not check["ok"]:
        rec["status"] = "MODEL_RUN_BLOCKED_PREFLIGHT"; r18.log("preflight", "BLOCKED", runId=run_id, errors=check["errors"]); return rec
    r18.log("run", "START", runId=run_id, particles=len(points)); t = time.perf_counter(); started = r18.utc_now()
    try:
        result = models_v2.run_experiment(spec, dataset, wind, run_id=run_id)
    except Exception as exc:
        rec.update(status="MODEL_RUN_FAIL", error=str(exc)); r18.log("run", "EXCEPTION", runId=run_id, error=str(exc)); return rec
    prov = result["provenance"]
    if prov["windage"]["alpha"] != ALPHA or prov["integrationStepSeconds"] != 300 or prov["outputStepSeconds"] != 900 or result["summary"]["durationSeconds"] != 259200:
        rec.update(status="MODEL_RUN_FAIL", error="post-run parameter verification failed"); return rec
    out_dir = OUT / cond / wid; out_dir.mkdir(parents=True, exist_ok=True)
    res_path = out_dir / "alpha0.002.result.json"; res_path.write_bytes(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=1).encode("utf-8"))
    spec_path = out_dir / "alpha0.002.spec.json"; spec_path.write_bytes(json.dumps(spec, ensure_ascii=False, sort_keys=True, indent=1).encode("utf-8"))
    csv_bytes, rows = r18.export_rows(run_id, "0.002", [d for d, *_ in points], result, unit["computationArea"], [])
    csv_path = out_dir / "alpha0.002.trajectories.csv"; csv_path.write_bytes(csv_bytes)
    final = {}
    for tr in result["trajectories"]:
        last = tr["samples"][-1]; key = r18.map_status(last["status"], last["lon"], last["lat"], unit["computationArea"]); final[key] = final.get(key, 0) + 1
    rec.update({"status": "COMPLETED", "startedAtUTC": started, "completedAtUTC": r18.utc_now(), "wallSeconds": round(time.perf_counter() - t, 1), "modelCommit": prov["modelCommit"], "modelId": prov["modelId"], "modelVersion": prov["modelVersion"], "engineVersion": prov["engineVersion"], "modelSourceSha256": prov["modelSourceSha256"], "dependencyLockSha256": prov["dependencyLockSha256"],
                "specSha256": prov["specSha256"], "resultArraySha256": prov["resultArraySha256"], "environment": prov["environment"], "resultFile": str(res_path.relative_to(ROOT)).replace("\\", "/"), "resultSha256": r18.sha(res_path), "specFile": str(spec_path.relative_to(ROOT)).replace("\\", "/"),
                "trajectoriesFile": str(csv_path.relative_to(ROOT)).replace("\\", "/"), "trajectoriesSha256": r18.sha(csv_path), "trajectoriesSha256WithoutRunId": csv_without_run_id(csv_path), "rows": len(rows), "finalStatusCounts": final, "runtimeStatusCounts": result["summary"]["statusCounts"], "qualityStatus": result["qualityStatus"],
                "endpoints72h": [{"drifterId": did, "lon": tr["samples"][-1]["lon"], "lat": tr["samples"][-1]["lat"], "timeUTC": tr["samples"][-1]["timeUTC"], "finalStatus": tr["finalStatus"]} for (did, *_), tr in zip(points, result["trajectories"])]})
    proc = subprocess.run([sys.executable, str(REPLAY), str(spec_path), str(ROOT / forcing_file), str(ROOT / w["wind"]["file"]), run_id], capture_output=True, text=True, cwd=ROOT)
    outcome = {}
    if "{" in proc.stdout:
        try:
            outcome = json.loads(proc.stdout[proc.stdout.rfind("{"):])
        except json.JSONDecodeError:
            outcome = {}
    matched = proc.returncode == 0 and outcome.get("ok") is True and outcome.get("resultArraySha256") == prov["resultArraySha256"] and outcome.get("specSha256") == prov["specSha256"] and outcome.get("modelSourceSha256") == prov["modelSourceSha256"]
    rec["replay"] = {"process": "separate python tools/research/replay_step25c_run.py (on-disk spec/forcing/wind)", "replayToolSha256": r18.sha(REPLAY), "returncode": proc.returncode, "replayResultSha256": outcome.get("resultArraySha256"), "stderrTail": (proc.stderr or "")[-300:] if proc.returncode else ""}
    rec["replayMatched"] = matched
    if not matched:
        rec["status"] = "MODEL_RUN_FAIL"; rec["error"] = "replay mismatch"
    r18.log("run", rec["status"], runId=run_id, wall=rec["wallSeconds"], replay=matched, final=final)
    return rec


def main():
    R = r18.load(RULE); q = r18.load(PREREG); pb = r18.load(PBLOCK)
    try:
        dm = precheck(R, q, pb)
    except r18.Stop as exc:
        print(json.dumps({"status": str(exc)})); return 2
    from research_runtime import models_v2, cli_v2
    from research_runtime.datasets import validate_dataset
    from research_runtime.wind import validate_wind_dataset
    if models_v2.model_source_sha256() != R["modelMechanics"]["modelSourceSha256"]:
        print(json.dumps({"status": "STEP26_BLOCKED_IMMUTABILITY: runtime model source"})); return 2
    p18b = r18.load(PREREG18B); r25c = {r["windowId"]: r for r in r18.load(RUNS25C)["runs"] if r["alpha"] == 0.002}
    runs = []; started = r18.utc_now(); status = "STEP26_RUNS_PASS"
    for w in R["windows"]:
        rec = execute(p18b, w, "C", w["glorysNormalized"]["file"], w["glorysNormalized"]["gridSha256"], models_v2, cli_v2, validate_dataset, validate_wind_dataset)
        ref = r25c[w["windowId"]]
        rec["reproduction"] = {"reference": "STEP 25C GLORYS alpha 0.002", "referenceRunId": ref["runId"], "referenceResultArraySha256": ref["resultArraySha256"], "referenceTrajectoriesFile": ref["trajectoriesFile"], "referenceTrajectoriesSha256": ref["trajectoriesSha256"],
                              "resultArrayBitwiseEqual": rec.get("resultArraySha256") == ref["resultArraySha256"], "csvRowsEqualWithoutRunId": rec.get("trajectoriesSha256WithoutRunId") == csv_without_run_id(ROOT / ref["trajectoriesFile"]) if rec.get("status") == "COMPLETED" else False,
                              "comparedOn": "numeric result array (particleId, samples timeUTC/lon/lat/status, finalStatus) via canonical SHA-256; CSV rows (drifter_id, timestamp, lat, lon, alpha, status, valid) after removing run_id"}
        rec["reproduction"]["pass"] = rec["reproduction"]["resultArrayBitwiseEqual"] and rec["reproduction"]["csvRowsEqualWithoutRunId"]
        runs.append(rec)
    c_ok = all(r["status"] == "COMPLETED" and r["replayMatched"] and r["reproduction"]["pass"] for r in runs)
    if not c_ok:
        status = "STEP26_BLOCKED_GLORYS_REPRODUCTION" if all(r["status"] == "COMPLETED" for r in runs) else "STEP26_FAILED"
        r18.log("gate", status, condition="C")
    else:
        r18.log("gate", "C_REPRODUCTION_PASS", windows=6)
        for w in R["windows"]:
            d = next(x for x in dm["windows"] if x["windowId"] == w["windowId"])
            rec = execute(p18b, w, "D", d["derived"]["file"], d["derived"]["gridSha256"], models_v2, cli_v2, validate_dataset, validate_wind_dataset)
            rec["derivedForcing"] = {"targetGridAxesSha256": d["targetGrid"]["axesSha256"], "derivedGridSha256": d["derived"]["gridSha256"], "derivedFileSha256": d["derived"]["fileSha256"], "algorithm": d["algorithm"]}
            runs.append(rec)
        if not all(r["status"] == "COMPLETED" and r["replayMatched"] for r in runs):
            status = "STEP26_FAILED"
    manifest = {"schemaVersion": "1.0", "ruleId": R["ruleId"], "ruleSha256": r18.sha(RULE), "phaseBPreregistrationSha256": r18.sha(PBLOCK), "derivedForcingManifestSha256": r18.sha(DERIVED), "status": status, "modelRunCount": len(runs), "conditionRuns": {"A": 0, "B": 0, "C": sum(1 for r in runs if r["condition"] == "C"), "D": sum(1 for r in runs if r["condition"] == "D")},
                "hycomRerun": False, "conditionBExecuted": False, "alpha": ALPHA, "alpha0Runs": 0, "modelSourceSha256": models_v2.model_source_sha256(), "runnerSha256": r18.sha(__file__), "replayToolSha256": r18.sha(REPLAY), "readerSha256": pb["tools"]["tools/research/glorys_reader_step25c.py"], "derivationScriptSha256": dm["derivationScript"]["sha256"],
                "conditionCReproduction": {"pass": c_ok, "windows": {r["windowId"]: r["reproduction"]["pass"] for r in runs if r["condition"] == "C"}}, "runs": runs, "startedAtUTC": started, "completedAtUTC": r18.utc_now(), "log": r18.LOG}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": status, "runs": len(runs), "completed": sum(1 for r in runs if r["status"] == "COMPLETED"), "replayMatched": sum(1 for r in runs if r.get("replayMatched")), "cReproduction": c_ok}))
    return 0 if status == "STEP26_RUNS_PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
