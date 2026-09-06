"""STEP 25C / TEST-02 r2 — revision of run_step25c_test02.py (locked at aee3943c): the r1 separate-process replay used the
runtime bundle, which omits the dataset when manifest.redistributionAllowed is false (GLORYS), so every replay returned
"bundle input missing" (returncode 2) although all 12 runs completed. r2 replays each run in a separate process from the
on-disk spec/forcing/wind files (replay_step25c_run.py) and additionally records the attempt-1 result-array SHA for comparison.
Everything else is identical.

Model B runs: GLORYS12V1 (15.81 m native, daily mean) + NCEP R2 wind, alpha 0.002 (primary) and
alpha 0 (structural pair), six locked paired windows -> 12 runs, fixed order. Model mechanics are the frozen research
runtime (models_v2, unchanged; source SHA verified at import and after every run). HYCOM (Model A) is NOT re-run: the
SHA-locked STEP 20 trajectories are the baseline. Each run: preflight -> run -> CSV export -> bundle -> separate-process
replay (result-array SHA must match). Helpers reused verbatim from run_step18b_model.py (sha, load, log, utc_now,
release_points, build_spec, export_rows, map_status, Stop). No alpha search, no post-hoc change."""
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

PROTO = ROOT / "docs/research/step25c-test02-protocol.json"
PREREG = ROOT / "docs/research/step25c-preregistration.json"
RULE = ROOT / "docs/research/step25c-rule-sha256.txt"
FORCING = ROOT / "docs/research/step25c-glorys-forcing-manifest.json"
PREREG18B = ROOT / "docs/research/step18b-preregistration.json"
OUT = ROOT / "data/research/step25c/trajectories"
MANIFEST = ROOT / "docs/research/step25c-run-manifest.json"
ATTEMPT1 = ROOT / "docs/research/step25c-run-manifest.attempt1-replay-unavailable.json"
LOCKED = {PREREG18B: "02935e81e9c93690078ff96231c74ad51c86dfaffa89bfa17a2e2ba082306316", ROOT / "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474",
          ROOT / "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4", ROOT / "docs/research/step20-calibration-manifest.json": "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498",
          ROOT / "docs/research/step20-b6-holdout-manifest.json": "968da55a4553c00f373d6a0f26bc2b1c9e3f3af421d37db7a1e58e99a5727653", ROOT / "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd",
          ROOT / "docs/research/step25a-forcing-experiment-protocol.json": "792ea745f11dc0e468daae97e053e8c374e9d5bc3c7483c6247f3302b93f07f1", ROOT / "docs/research/step25b-glorys-quality-gates.json": "56dcc6182d14346d6345de82bf16ad5b438f9ce739ba45a15d8807fd1b5cfb12"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "ed746129", "2841f511", "1a6a3173", "c6179242", "c17bd469", "929d3468")
ALPHA_TEXT = {0.002: "0.002", 0.0: "0"}
ATTEMPT1_RUNS = {}


def precheck(proto, prereg):
    if r18.sha(PROTO) != prereg["protocolSha256"] or prereg["status"] != "PREREGISTRATION LOCKED":
        raise r18.Stop("TEST02_BLOCKED_IMMUTABILITY: protocol/preregistration")
    rule = {l.split()[1]: l.split()[0] for l in RULE.read_text(encoding="utf-8").splitlines() if len(l.split()) == 2}
    for rel, expected in rule.items():
        if rel != "docs/research/step25c-rule-sha256.txt" and r18.sha(ROOT / rel) != expected:
            raise r18.Stop(f"TEST02_BLOCKED_IMMUTABILITY: {rel}")
    for path, expected in LOCKED.items():
        if r18.sha(path) != expected:
            raise r18.Stop(f"TEST02_BLOCKED_IMMUTABILITY: {path.relative_to(ROOT)}")
    for short in COMMITS:
        if subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() != "commit":
            raise r18.Stop(f"TEST02_BLOCKED_IMMUTABILITY: commit {short}")
    if MANIFEST.exists() or OUT.exists():
        raise r18.Stop("TEST02_BLOCKED_IMMUTABILITY: run outputs already exist; no overwrite")
    if ATTEMPT1.exists():
        ATTEMPT1_RUNS.update({r["runId"]: r.get("resultArraySha256") for r in r18.load(ATTEMPT1)["runs"]})
    fm = r18.load(FORCING)
    if fm["protocolSha256"] != r18.sha(PROTO) or fm["windowCount"] != 6:
        raise r18.Stop("TEST02_BLOCKED_IMMUTABILITY: forcing manifest")
    for w in fm["windows"]:
        if r18.sha(ROOT / w["normalized"]["file"]) != w["normalized"]["fileSha256"] or r18.sha(ROOT / w["wind"]["file"]) != w["wind"]["sha256"]:
            raise r18.Stop(f"TEST02_BLOCKED_IMMUTABILITY: forcing {w['windowId']}")
        for a in ("0.002", "0"):
            if r18.sha(ROOT / w["hycomBaseline"][a]["file"]) != w["hycomBaseline"][a]["sha256"]:
                raise r18.Stop(f"TEST02_BLOCKED_IMMUTABILITY: HYCOM baseline {w['windowId']} alpha {a}")
    return fm


def execute(p18b, proto_window, fw, alpha, models_v2, cli_v2, validate_dataset, validate_wind_dataset):
    dataset = validate_dataset(r18.load(ROOT / fw["normalized"]["file"])); wind = validate_wind_dataset(r18.load(ROOT / fw["wind"]["file"]))
    if dataset["manifest"]["sha256"] != fw["normalized"]["gridSha256"] or wind["manifest"]["sha256"] != fw["wind"]["gridSha256"]:
        raise r18.Stop("TEST02_BLOCKED_IMMUTABILITY: grid sha")
    if dataset["manifest"]["surfaceDepthMeters"] != 15.81007 or dataset["manifest"]["timeStepSeconds"] != 86400:
        raise r18.Stop("TEST02_BLOCKED_IMMUTABILITY: GLORYS identity")
    wid = proto_window["windowId"]
    points = [(d["drifterId"], d["lon"], d["lat"]) for d in sorted(proto_window["releasePositions"], key=lambda d: d["drifterId"])]
    unit = {"windowId": wid, "t0": proto_window["t0"], "computationArea": proto_window["computationArea"], "drifterCount": proto_window["drifterCount"]}
    run_id = f"step25c-glorys-alpha{ALPHA_TEXT[alpha]}-{wid}"
    spec = r18.build_spec(p18b, unit, dataset, wind, {"alpha": alpha}, points)
    spec["validationPlanId"] = "forcing-sensitivity-test02-step25c"
    check = models_v2.preflight(spec, dataset, wind)
    rec = {"runId": run_id, "windowId": wid, "role": proto_window["role"], "model": "B-GLORYS12V1", "alpha": alpha, "alphaText": ALPHA_TEXT[alpha], "drifterCount": proto_window["drifterCount"], "released": len(points), "drifterIds": [d for d, *_ in points],
           "integrationStepSeconds": spec["integrationStepSeconds"], "outputStepSeconds": spec["outputStepSeconds"], "durationSeconds": spec["durationSeconds"], "area": unit["computationArea"],
           "datasetVersions": spec["datasetVersions"], "windDataset": spec["windDataset"], "gridSha256": dataset["manifest"]["sha256"], "forcingFileSha256": fw["normalized"]["fileSha256"], "sourceSha256": dataset["manifest"]["sourceSha256"], "windGridSha256": wind["manifest"]["sha256"],
           "preflight": {"ok": check["ok"], "errors": check["errors"], "estimate": check.get("estimate")}}
    if not check["ok"]:
        rec["status"] = "MODEL_RUN_BLOCKED_PREFLIGHT"; r18.log("preflight", "BLOCKED", runId=run_id, errors=check["errors"]); return rec
    r18.log("run", "START", runId=run_id, particles=len(points)); t = time.perf_counter(); started = r18.utc_now()
    try:
        result = models_v2.run_experiment(spec, dataset, wind, run_id=run_id)
    except Exception as exc:
        rec.update(status="MODEL_RUN_FAIL", error=str(exc)); r18.log("run", "EXCEPTION", runId=run_id, error=str(exc)); return rec
    prov = result["provenance"]
    if prov["windage"]["alpha"] != alpha or prov["integrationStepSeconds"] != 300 or prov["outputStepSeconds"] != 900 or result["summary"]["durationSeconds"] != 259200:
        rec.update(status="MODEL_RUN_FAIL", error="post-run parameter verification failed"); return rec
    out_dir = OUT / wid; out_dir.mkdir(parents=True, exist_ok=True)
    res_path = out_dir / f"alpha{ALPHA_TEXT[alpha]}.result.json"; res_path.write_bytes(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=1).encode("utf-8"))
    spec_path = out_dir / f"alpha{ALPHA_TEXT[alpha]}.spec.json"; spec_path.write_bytes(json.dumps(spec, ensure_ascii=False, sort_keys=True, indent=1).encode("utf-8"))
    csv_bytes, rows = r18.export_rows(run_id, ALPHA_TEXT[alpha], [d for d, *_ in points], result, unit["computationArea"], [])
    csv_path = out_dir / f"alpha{ALPHA_TEXT[alpha]}.trajectories.csv"; csv_path.write_bytes(csv_bytes)
    final = {}
    for tr in result["trajectories"]:
        last = tr["samples"][-1]; key = r18.map_status(last["status"], last["lon"], last["lat"], unit["computationArea"]); final[key] = final.get(key, 0) + 1
    rec.update({"status": "COMPLETED", "startedAtUTC": started, "completedAtUTC": r18.utc_now(), "wallSeconds": round(time.perf_counter() - t, 1), "modelCommit": prov["modelCommit"], "modelId": prov["modelId"], "modelVersion": prov["modelVersion"],
                "engineVersion": prov["engineVersion"], "modelSourceSha256": prov["modelSourceSha256"], "dependencyLockSha256": prov["dependencyLockSha256"], "specSha256": prov["specSha256"], "resultArraySha256": prov["resultArraySha256"], "environment": prov["environment"],
                "resultFile": str(res_path.relative_to(ROOT)).replace("\\", "/"), "resultSha256": r18.sha(res_path), "trajectoriesFile": str(csv_path.relative_to(ROOT)).replace("\\", "/"), "trajectoriesSha256": r18.sha(csv_path), "rows": len(rows),
                "finalStatusCounts": final, "runtimeStatusCounts": result["summary"]["statusCounts"], "qualityStatus": result["qualityStatus"],
                "endpoints72h": [{"drifterId": did, "lon": tr["samples"][-1]["lon"], "lat": tr["samples"][-1]["lat"], "timeUTC": tr["samples"][-1]["timeUTC"], "finalStatus": tr["finalStatus"]} for (did, *_), tr in zip(points, result["trajectories"])]})
    bundles = out_dir / "bundles"; bundles.mkdir(exist_ok=True)
    bundle = Path(cli_v2.export_bundle(spec, dataset, wind, result, bundles / f"alpha{ALPHA_TEXT[alpha]}.zip"))
    proc = subprocess.run([sys.executable, str(ROOT / "tools/research/replay_step25c_run.py"), str(spec_path), str(ROOT / fw["normalized"]["file"]), str(ROOT / fw["wind"]["file"]), run_id], capture_output=True, text=True, cwd=ROOT)
    outcome = {}
    if "{" in proc.stdout:
        try:
            outcome = json.loads(proc.stdout[proc.stdout.rfind("{"):])
        except json.JSONDecodeError:
            outcome = {}
    matched = proc.returncode == 0 and outcome.get("ok") is True and outcome.get("resultArraySha256") == prov["resultArraySha256"] and outcome.get("specSha256") == prov["specSha256"] and outcome.get("modelSourceSha256") == prov["modelSourceSha256"]
    rec["replay"] = {"process": "separate python tools/research/replay_step25c_run.py (on-disk spec/forcing/wind)", "replayTool": "tools/research/replay_step25c_run.py", "replayToolSha256": r18.sha(ROOT / "tools/research/replay_step25c_run.py"), "specFile": str(spec_path.relative_to(ROOT)).replace("\\", "/"), "specSha256": prov["specSha256"],
                     "bundle": str(bundle.relative_to(ROOT)).replace("\\", "/"), "bundleSha256": r18.sha(bundle), "bundleContainsDataset": False, "returncode": proc.returncode, "replayResultSha256": outcome.get("resultArraySha256"), "stderrTail": (proc.stderr or "")[-300:] if proc.returncode else ""}
    a1 = ATTEMPT1_RUNS.get(run_id)
    rec["attempt1"] = {"resultArraySha256": a1, "identicalToAttempt1": a1 == prov["resultArraySha256"]} if a1 else None
    rec["replayMatched"] = matched
    if not matched:
        rec["status"] = "MODEL_RUN_FAIL"; rec["error"] = "replay mismatch"
    r18.log("run", rec["status"], runId=run_id, wall=rec["wallSeconds"], replay=matched, final=final)
    return rec


def main():
    proto = r18.load(PROTO); prereg = r18.load(PREREG)
    try:
        fm = precheck(proto, prereg)
    except r18.Stop as exc:
        print(json.dumps({"status": str(exc)})); return 2
    from research_runtime import models_v2, cli_v2
    from research_runtime.datasets import validate_dataset
    from research_runtime.wind import validate_wind_dataset
    if models_v2.model_source_sha256() != proto["modelMechanics"]["modelSourceSha256"]:
        print(json.dumps({"status": "TEST02_BLOCKED_IMMUTABILITY: runtime model source"})); return 2
    p18b = r18.load(PREREG18B); runs = []; started = r18.utc_now()
    for w in proto["windows"]:
        fw = next(x for x in fm["windows"] if x["windowId"] == w["windowId"])
        for alpha in (0.002, 0.0):
            runs.append(execute(p18b, w, fw, alpha, models_v2, cli_v2, validate_dataset, validate_wind_dataset))
    ok = len(runs) == 12 and all(r["status"] == "COMPLETED" and r["replayMatched"] for r in runs)
    manifest = {"schemaVersion": "1.0", "ruleId": proto["ruleId"], "protocolSha256": r18.sha(PROTO), "forcingManifestSha256": r18.sha(FORCING), "status": "TEST02_RUNS_PASS" if ok else "TEST02_RUNS_FAIL", "modelRunCount": len(runs), "hycomRerun": False,
                "modelA": "STEP 20 SHA-locked HYCOM trajectories (not re-run)", "revision": "r2 (on-disk separate-process replay)", "attempt1Manifest": str(ATTEMPT1.relative_to(ROOT)).replace("\\", "/") if ATTEMPT1.exists() else None, "identicalToAttempt1": all((r.get("attempt1") or {}).get("identicalToAttempt1") for r in runs) if ATTEMPT1_RUNS else None, "modelSourceSha256": models_v2.model_source_sha256(), "runs": runs, "startedAtUTC": started, "completedAtUTC": r18.utc_now(), "log": r18.LOG}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": manifest["status"], "runs": len(runs), "completed": sum(1 for r in runs if r["status"] == "COMPLETED"), "replayMatched": sum(1 for r in runs if r.get("replayMatched"))}))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
