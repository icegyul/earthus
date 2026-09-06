"""STEP 27 Phase B runner — depth sensitivity: D05 / D10 / D15 / D20 GLORYS12V1 native-level forcing on the frozen runtime, alpha
0.002 only, six locked windows -> 24 distinct runs. Order: (1) D15 x 6 windows with the mandatory reproduction gate against the STEP 25C
GLORYS alpha 0.002 result arrays (bitwise digest + CSV rows without run_id) — STOP before any other depth if it fails; (2) per window
KE-1, KE-2, AG-1, AG-2, KE-H1, KE-H3: D05, D10, D20 (D15 already executed in phase 1; never re-run). Depth identity is re-read from every
forcing manifest before each run (tolerance 0.01 m). Each run is a single continuous t0 -> t0+72 h trajectory at one fixed native
depth, replayed in a separate process (tools/research/replay_step25c_run.py, locked). No HYCOM, no alpha 0, no other depth."""
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

RULE = ROOT / "docs/research/step27-depth-rule.json"
PBLOCK = ROOT / "docs/research/step27-phase-b-preregistration.json"
FORCING = ROOT / "docs/research/step27-depth-forcing-manifest.json"
RUNS25C = ROOT / "docs/research/step25c-run-manifest.json"
PREREG18B = ROOT / "docs/research/step18b-preregistration.json"
REPLAY = ROOT / "tools/research/replay_step25c_run.py"
OUT = ROOT / "data/research/step27/trajectories"
MANIFEST = ROOT / "docs/research/step27-depth-manifest.json"
REPLAY_MANIFEST = ROOT / "docs/research/step27-depth-replay-manifest.json"
LOCKED = {PREREG18B: "02935e81e9c93690078ff96231c74ad51c86dfaffa89bfa17a2e2ba082306316", RUNS25C: "75d6a52b212b40e9e331bd06f362e888e1592873e150f942f8b0320add307e2d", REPLAY: "5dd8c14da33dcd75c50c8e52dc517456d46a1a2f4ad38b3918687d16b4a73ff5",
          ROOT / "docs/research/step25c-test02-protocol.json": "7ff8468ea8399b8bf9d563980a184203b1b69c55a52cf7a493d1c140c97901ab"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "ed746129", "2841f511", "929d3468", "c974ce42", "a4474eb8", "2a5c8f9a", "d5fb2a62", "d242165d", "b9078805", "0c2b3cb7")
ALPHA = 0.002
WINDOWS = ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H3"]


def csv_without_run_id(path):
    with open(path, encoding="utf-8", newline="") as fh:
        rows = [r[1:] for r in csv.reader(fh)]
    buf = io.StringIO(newline=""); csv.writer(buf, lineterminator="\n").writerows(rows)
    return hashlib.sha256(buf.getvalue().encode("utf-8")).hexdigest()


def precheck(R, pb):
    if r18.sha(RULE) != pb["ruleSha256"] or pb["status"] != "PREREGISTRATION LOCKED":
        raise r18.Stop("STEP27_BLOCKED_IMMUTABILITY: rule/preregistration")
    for path, expected in LOCKED.items():
        if r18.sha(path) != expected:
            raise r18.Stop(f"STEP27_BLOCKED_IMMUTABILITY: {path.relative_to(ROOT)}")
    for t, expected in pb["tools"].items():
        if r18.sha(ROOT / t) != expected:
            raise r18.Stop(f"STEP27_BLOCKED_IMMUTABILITY: tool {t}")
    for short in COMMITS:
        if subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() != "commit":
            raise r18.Stop(f"STEP27_BLOCKED_IMMUTABILITY: commit {short}")
    if MANIFEST.exists() or OUT.exists() or REPLAY_MANIFEST.exists():
        raise r18.Stop("STEP27_BLOCKED_IMMUTABILITY: run outputs already exist; no overwrite")
    fm = r18.load(FORCING)
    if fm["ruleSha256"] != r18.sha(RULE) or fm["phaseBPreregistrationSha256"] != r18.sha(PBLOCK) or len(fm["records"]) != 24 or fm["sameGridAndFramesAcrossDepths"] is not True:
        raise r18.Stop("STEP27_BLOCKED_IMMUTABILITY: forcing manifest")
    for rec in fm["records"]:
        if r18.sha(ROOT / rec["normalized"]["file"]) != rec["normalized"]["fileSha256"] or abs(rec["nativeLevelMeters"] - pb["depths"][rec["depth"]]["nativeLevelMeters"]) > 0.01:
            raise r18.Stop(f"STEP27_BLOCKED_IMMUTABILITY: forcing {rec['depth']} {rec['windowId']}")
    for w in pb["windows"]:
        if r18.sha(ROOT / w["wind"]["file"]) != w["wind"]["sha256"]:
            raise r18.Stop(f"STEP27_BLOCKED_IMMUTABILITY: wind {w['windowId']}")
    return fm


def execute(p18b, w, did, rec, expected_level, models_v2, cli_v2, validate_dataset, validate_wind_dataset):
    dataset = validate_dataset(r18.load(ROOT / rec["normalized"]["file"])); wind = validate_wind_dataset(r18.load(ROOT / w["wind"]["file"]))
    if dataset["manifest"]["sha256"] != rec["normalized"]["gridSha256"] or wind["manifest"]["sha256"] != w["wind"]["gridSha256"] or abs(dataset["manifest"]["surfaceDepthMeters"] - expected_level) > 0.01 or dataset["manifest"]["timeStepSeconds"] != 86400:
        raise r18.Stop(f"DEPTH_IDENTITY_FAIL: {did} {w['windowId']}")
    wid = w["windowId"]; points = [(d["drifterId"], d["lon"], d["lat"]) for d in sorted(w["releasePositions"], key=lambda d: d["drifterId"])]
    unit = {"windowId": wid, "t0": w["t0"], "computationArea": w["computationArea"], "drifterCount": w["drifterCount"]}
    run_id = f"step27-{did}-alpha0.002-{wid}"
    spec = r18.build_spec(p18b, unit, dataset, wind, {"alpha": ALPHA}, points); spec["validationPlanId"] = "depth-sensitivity-step27"
    check = models_v2.preflight(spec, dataset, wind)
    out = {"runId": run_id, "windowId": wid, "role": w["role"], "depth": did, "depthTargetMeters": {"D05": 5, "D10": 10, "D15": 15, "D20": 20}[did], "nativeDepthMeters": dataset["manifest"]["surfaceDepthMeters"], "alpha": ALPHA, "alphaText": "0.002", "drifterCount": w["drifterCount"], "released": len(points), "drifterIds": [d for d, *_ in points],
           "integrationStepSeconds": spec["integrationStepSeconds"], "outputStepSeconds": spec["outputStepSeconds"], "durationSeconds": spec["durationSeconds"], "area": unit["computationArea"], "datasetVersions": spec["datasetVersions"], "windDataset": spec["windDataset"],
           "forcingFile": rec["normalized"]["file"], "forcingFileSha256": rec["normalized"]["fileSha256"], "gridSha256": dataset["manifest"]["sha256"], "sourceSha256": dataset["manifest"]["sourceSha256"], "windGridSha256": wind["manifest"]["sha256"], "preflight": {"ok": check["ok"], "errors": check["errors"], "estimate": check.get("estimate")}}
    if not check["ok"]:
        out["status"] = "MODEL_RUN_BLOCKED_PREFLIGHT"; r18.log("preflight", "BLOCKED", runId=run_id, errors=check["errors"]); return out
    r18.log("run", "START", runId=run_id, particles=len(points)); t = time.perf_counter(); started = r18.utc_now()
    try:
        result = models_v2.run_experiment(spec, dataset, wind, run_id=run_id)
    except Exception as exc:
        out.update(status="MODEL_RUN_FAIL", error=str(exc)); r18.log("run", "EXCEPTION", runId=run_id, error=str(exc)); return out
    prov = result["provenance"]
    if prov["windage"]["alpha"] != ALPHA or prov["integrationStepSeconds"] != 300 or prov["outputStepSeconds"] != 900 or result["summary"]["durationSeconds"] != 259200:
        out.update(status="MODEL_RUN_FAIL", error="post-run parameter verification failed"); return out
    out_dir = OUT / did / wid; out_dir.mkdir(parents=True, exist_ok=True)
    res_path = out_dir / "alpha0.002.result.json"; res_path.write_bytes(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=1).encode("utf-8"))
    spec_path = out_dir / "alpha0.002.spec.json"; spec_path.write_bytes(json.dumps(spec, ensure_ascii=False, sort_keys=True, indent=1).encode("utf-8"))
    csv_bytes, rows = r18.export_rows(run_id, "0.002", [d for d, *_ in points], result, unit["computationArea"], [])
    csv_path = out_dir / "alpha0.002.trajectories.csv"; csv_path.write_bytes(csv_bytes)
    final = {}
    for tr in result["trajectories"]:
        last = tr["samples"][-1]; key = r18.map_status(last["status"], last["lon"], last["lat"], unit["computationArea"]); final[key] = final.get(key, 0) + 1
    out.update({"status": "COMPLETED", "startedAtUTC": started, "completedAtUTC": r18.utc_now(), "wallSeconds": round(time.perf_counter() - t, 1), "modelCommit": prov["modelCommit"], "modelId": prov["modelId"], "modelVersion": prov["modelVersion"], "engineVersion": prov["engineVersion"], "modelSourceSha256": prov["modelSourceSha256"], "dependencyLockSha256": prov["dependencyLockSha256"],
                "specSha256": prov["specSha256"], "resultArraySha256": prov["resultArraySha256"], "environment": prov["environment"], "resultFile": str(res_path.relative_to(ROOT)).replace("\\", "/"), "resultSha256": r18.sha(res_path), "specFile": str(spec_path.relative_to(ROOT)).replace("\\", "/"),
                "trajectoriesFile": str(csv_path.relative_to(ROOT)).replace("\\", "/"), "trajectoriesSha256": r18.sha(csv_path), "trajectoriesSha256WithoutRunId": csv_without_run_id(csv_path), "rows": len(rows), "finalStatusCounts": final, "runtimeStatusCounts": result["summary"]["statusCounts"], "qualityStatus": result["qualityStatus"],
                "endpoints72h": [{"drifterId": did_, "lon": tr["samples"][-1]["lon"], "lat": tr["samples"][-1]["lat"], "timeUTC": tr["samples"][-1]["timeUTC"], "finalStatus": tr["finalStatus"]} for (did_, *_), tr in zip(points, result["trajectories"])]})
    proc = subprocess.run([sys.executable, str(REPLAY), str(spec_path), str(ROOT / rec["normalized"]["file"]), str(ROOT / w["wind"]["file"]), run_id], capture_output=True, text=True, cwd=ROOT)
    outcome = {}
    if "{" in proc.stdout:
        try:
            outcome = json.loads(proc.stdout[proc.stdout.rfind("{"):])
        except json.JSONDecodeError:
            outcome = {}
    matched = proc.returncode == 0 and outcome.get("ok") is True and outcome.get("resultArraySha256") == prov["resultArraySha256"] and outcome.get("specSha256") == prov["specSha256"] and outcome.get("modelSourceSha256") == prov["modelSourceSha256"]
    out["replay"] = {"process": "separate python tools/research/replay_step25c_run.py (on-disk spec/forcing/wind)", "replayToolSha256": r18.sha(REPLAY), "returncode": proc.returncode, "replayResultSha256": outcome.get("resultArraySha256"), "replaySpecSha256": outcome.get("specSha256"), "stderrTail": (proc.stderr or "")[-300:] if proc.returncode else ""}
    out["replayMatched"] = matched
    if not matched:
        out["status"] = "MODEL_RUN_FAIL"; out["error"] = "replay mismatch"
    r18.log("run", out["status"], runId=run_id, wall=out["wallSeconds"], replay=matched, final=final)
    return out


def main():
    R = r18.load(RULE); pb = r18.load(PBLOCK)
    try:
        fm = precheck(R, pb)
    except r18.Stop as exc:
        print(json.dumps({"status": str(exc)})); return 2
    from research_runtime import models_v2, cli_v2
    from research_runtime.datasets import validate_dataset
    from research_runtime.wind import validate_wind_dataset
    if models_v2.model_source_sha256() != pb["modelSourceSha256"]:
        print(json.dumps({"status": "STEP27_BLOCKED_IMMUTABILITY: runtime model source"})); return 2
    p18b = r18.load(PREREG18B); r25c = {r["windowId"]: r for r in r18.load(RUNS25C)["runs"] if r["alpha"] == 0.002}
    recs = {(r["depth"], r["windowId"]): r for r in fm["records"]}; wins = {w["windowId"]: w for w in pb["windows"]}
    runs = []; started = r18.utc_now(); status = "STEP27_RUNS_PASS"
    try:
        for wid in WINDOWS:  # phase 1: D15 x 6 + reproduction gate
            rec = execute(p18b, wins[wid], "D15", recs[("D15", wid)], pb["depths"]["D15"]["nativeLevelMeters"], models_v2, cli_v2, validate_dataset, validate_wind_dataset)
            ref = r25c[wid]
            rec["reproduction"] = {"reference": "STEP 25C GLORYS alpha 0.002", "referenceRunId": ref["runId"], "referenceResultArraySha256": ref["resultArraySha256"], "referenceTrajectoriesFile": ref["trajectoriesFile"], "referenceTrajectoriesSha256": ref["trajectoriesSha256"],
                                  "resultArrayBitwiseEqual": rec.get("resultArraySha256") == ref["resultArraySha256"], "csvRowsEqualWithoutRunId": rec.get("trajectoriesSha256WithoutRunId") == csv_without_run_id(ROOT / ref["trajectoriesFile"]) if rec.get("status") == "COMPLETED" else False}
            rec["reproduction"]["pass"] = rec["reproduction"]["resultArrayBitwiseEqual"] and rec["reproduction"]["csvRowsEqualWithoutRunId"]; runs.append(rec)
        d15_ok = all(r["status"] == "COMPLETED" and r["replayMatched"] and r["reproduction"]["pass"] for r in runs)
        if not d15_ok:
            status = "STEP27_BLOCKED_D15_REPRODUCTION" if all(r["status"] == "COMPLETED" for r in runs) else "STEP27_FAILED"; r18.log("gate", status, depth="D15")
        else:
            r18.log("gate", "D15_REPRODUCTION_PASS", windows=6)
            for wid in WINDOWS:  # phase 2: per window D05, D10, D20 (D15 executed in phase 1)
                for did in ("D05", "D10", "D20"):
                    runs.append(execute(p18b, wins[wid], did, recs[(did, wid)], pb["depths"][did]["nativeLevelMeters"], models_v2, cli_v2, validate_dataset, validate_wind_dataset))
            if not (len(runs) == 24 and all(r["status"] == "COMPLETED" and r["replayMatched"] for r in runs)):
                status = "STEP27_REPRODUCIBILITY_FAIL" if all(r["status"] in ("COMPLETED", "MODEL_RUN_FAIL") and r.get("error") == "replay mismatch" for r in runs if r["status"] != "COMPLETED") else "STEP27_FAILED"
    except r18.Stop as exc:
        status = str(exc).split(":")[0]; r18.log("gate", status)
    manifest = {"schemaVersion": "1.0", "ruleId": R["ruleId"], "ruleSha256": r18.sha(RULE), "phaseBPreregistrationSha256": r18.sha(PBLOCK), "forcingManifestSha256": r18.sha(FORCING), "status": status, "modelRunCount": len(runs), "plannedRuns": 24,
                "depthRuns": {d: sum(1 for r in runs if r["depth"] == d) for d in ("D05", "D10", "D15", "D20")}, "depths": pb["depths"], "alpha": ALPHA, "alpha0Runs": 0, "hycomRuns": 0, "executionOrder": "phase 1: D15 x KE-1..KE-H3 (reproduction gate); phase 2: per window D05, D10, D20",
                "modelSourceSha256": models_v2.model_source_sha256(), "runnerSha256": r18.sha(__file__), "replayToolSha256": r18.sha(REPLAY), "readerSha256": pb["tools"]["tools/research/glorys_reader_step25c.py"], "d15Reproduction": {"pass": all(r.get("reproduction", {}).get("pass") for r in runs if r["depth"] == "D15") and sum(1 for r in runs if r["depth"] == "D15") == 6, "windows": {r["windowId"]: r["reproduction"]["pass"] for r in runs if r["depth"] == "D15"}},
                "runs": runs, "startedAtUTC": started, "completedAtUTC": r18.utc_now(), "log": r18.LOG}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    replay = {"schemaVersion": "1.0", "ruleId": R["ruleId"], "runManifestSha256": r18.sha(MANIFEST), "replayTool": {"file": "tools/research/replay_step25c_run.py", "sha256": r18.sha(REPLAY)}, "replays": [{"runId": r["runId"], "depth": r["depth"], "windowId": r["windowId"], "nativeDepthMeters": r.get("nativeDepthMeters"), "resultArraySha256": r.get("resultArraySha256"), "replayResultSha256": r.get("replay", {}).get("replayResultSha256"), "specSha256": r.get("specSha256"), "forcingFileSha256": r.get("forcingFileSha256"), "trajectoriesSha256": r.get("trajectoriesSha256"), "matched": r.get("replayMatched", False)} for r in runs],
              "matchedCount": sum(1 for r in runs if r.get("replayMatched")), "total": len(runs), "allMatched": len(runs) == 24 and all(r.get("replayMatched") for r in runs)}
    REPLAY_MANIFEST.write_text(json.dumps(replay, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": status, "runs": len(runs), "completed": sum(1 for r in runs if r["status"] == "COMPLETED"), "replayMatched": replay["matchedCount"], "d15Reproduction": manifest["d15Reproduction"]["pass"]}))
    return 0 if status == "STEP27_RUNS_PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
