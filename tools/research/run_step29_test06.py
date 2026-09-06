"""STEP 29 Phase B runner — TEST-06: per window (KE-1, KE-2, AG-1, AG-2, KE-H1, KE-H3) in order control alpha 0.002, treatment alpha
0.002, control alpha 0, treatment alpha 0 -> 24 distinct runs on the frozen runtime with the STEP 29 composite forcings (control =
GLORYS 15.810070 m at 3-hourly instants; treatment = same + WW3 Stokes drift, coefficient 1.0, inside U_ocean so it is never multiplied by
alpha) and the identical STEP 17 / STEP 20 B-3 wind files. Each run is replayed in a separate process (tools/research/replay_step25c_run.py,
locked). The control alpha 0.002 / alpha 0 runs are compared descriptively with the STEP 25C GLORYS runs (72 h endpoint separation per
drifter) as a consistency record, not a gate (the composite time axis and mask differ by construction). Helpers reused verbatim from
run_step18b_model.py."""
import csv
import hashlib
import io
import json
import math
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVICE = ROOT / "services/research-runtime"
sys.path.insert(0, str(SERVICE)); sys.path.insert(0, str(SERVICE / ".deps")); sys.path.insert(0, str(ROOT / "tools/research"))
import run_step18b_model as r18  # noqa: E402

PBLOCK = ROOT / "docs/research/step29-phase-b-preregistration.json"
FORCING = ROOT / "docs/research/step29-stokes-forcing-manifest.json"
FAIR = ROOT / "docs/research/step29-stokes-fairness-report.json"
P25C = ROOT / "docs/research/step25c-test02-protocol.json"
RUNS25C = ROOT / "docs/research/step25c-run-manifest.json"
PREREG18B = ROOT / "docs/research/step18b-preregistration.json"
REPLAY = ROOT / "tools/research/replay_step25c_run.py"
OUT = ROOT / "data/research/step29/trajectories"
MANIFEST = ROOT / "docs/research/step29-stokes-manifest.json"
REPLAY_MANIFEST = ROOT / "docs/research/step29-stokes-replay-manifest.json"
LOCKED = {PREREG18B: "02935e81e9c93690078ff96231c74ad51c86dfaffa89bfa17a2e2ba082306316", RUNS25C: "75d6a52b212b40e9e331bd06f362e888e1592873e150f942f8b0320add307e2d", REPLAY: "5dd8c14da33dcd75c50c8e52dc517456d46a1a2f4ad38b3918687d16b4a73ff5", P25C: "7ff8468ea8399b8bf9d563980a184203b1b69c55a52cf7a493d1c140c97901ab"}
COMMITS = ("551668ef", "155995dd", "73fafffb", "2841f511", "929d3468", "c974ce42", "a4474eb8", "3338c7e4", "4942421a", "289815d6")
ORDER = [("control", 0.002), ("treatment", 0.002), ("control", 0.0), ("treatment", 0.0)]
ALPHA_TEXT = {0.002: "0.002", 0.0: "0"}
WINDOWS = ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H3"]
RADIUS_M = 6371008.8


def hav(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * RADIUS_M * math.asin(math.sqrt(a)) / 1000


def precheck(pb):
    if pb["status"] != "PREREGISTRATION LOCKED":
        raise r18.Stop("STEP29_BLOCKED_IMMUTABILITY: preregistration")
    for path, expected in LOCKED.items():
        if r18.sha(path) != expected:
            raise r18.Stop(f"STEP29_BLOCKED_IMMUTABILITY: {path.relative_to(ROOT)}")
    for t, expected in pb["tools"].items():
        if r18.sha(ROOT / t) != expected:
            raise r18.Stop(f"STEP29_BLOCKED_IMMUTABILITY: tool {t}")
    for short in COMMITS:
        if subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() != "commit":
            raise r18.Stop(f"STEP29_BLOCKED_IMMUTABILITY: commit {short}")
    if MANIFEST.exists() or OUT.exists() or REPLAY_MANIFEST.exists():
        raise r18.Stop("STEP29_BLOCKED_IMMUTABILITY: run outputs already exist; no overwrite")
    fm = r18.load(FORCING); fr = r18.load(FAIR)
    if fm["phaseBPreregistrationSha256"] != r18.sha(PBLOCK) or fm["licenseStatus"] != "LICENSE_CONFIRMED" or not fr["allPass"] or fm["builder"]["sha256"] != pb["tools"]["tools/research/build_step29_forcing.py"]:
        raise r18.Stop("STEP29_FAIRNESS_FAIL" if not fr["allPass"] else "STEP29_BLOCKED_IMMUTABILITY: forcing manifest")
    for w in fm["windows"]:
        if w["status"] != "BUILT" or w["ww3Gate"]["status"] != "PASS":
            raise r18.Stop(f"WINDOW_BLOCKED: {w['windowId']} ({w['ww3Gate'].get('status')})")
        for k in ("control", "treatment"):
            if r18.sha(ROOT / w[k]["file"]) != w[k]["fileSha256"]:
                raise r18.Stop(f"STEP29_BLOCKED_IMMUTABILITY: forcing {k} {w['windowId']}")
        if r18.sha(ROOT / w["wind"]["file"]) != w["wind"]["sha256"]:
            raise r18.Stop(f"STEP29_BLOCKED_IMMUTABILITY: wind {w['windowId']}")
    return fm


def execute(p18b, pw, fw, kind, alpha, models_v2, validate_dataset, validate_wind_dataset):
    dataset = validate_dataset(r18.load(ROOT / fw[kind]["file"])); wind = validate_wind_dataset(r18.load(ROOT / fw["wind"]["file"]))
    if dataset["manifest"]["sha256"] != fw[kind]["gridSha256"] or wind["manifest"]["sha256"] != fw["wind"]["gridSha256"] or dataset["manifest"]["surfaceDepthMeters"] != 15.81007 or dataset["manifest"]["timeStepSeconds"] != 10800:
        raise r18.Stop(f"STEP29_BLOCKED_IMMUTABILITY: forcing identity {kind} {pw['windowId']}")
    wid = pw["windowId"]; points = [(d["drifterId"], d["lon"], d["lat"]) for d in sorted(pw["releasePositions"], key=lambda d: d["drifterId"])]
    unit = {"windowId": wid, "t0": pw["t0"], "computationArea": pw["computationArea"], "drifterCount": pw["drifterCount"]}
    run_id = f"step29-{kind}-alpha{ALPHA_TEXT[alpha]}-{wid}"
    spec = r18.build_spec(p18b, unit, dataset, wind, {"alpha": alpha}, points); spec["validationPlanId"] = "test06-stokes-step29"
    check = models_v2.preflight(spec, dataset, wind)
    rec = {"runId": run_id, "windowId": wid, "role": pw["role"], "condition": kind, "equation": "dX/dt = U_GLORYS + U_Stokes + alpha * U_wind" if kind == "treatment" else "dX/dt = U_GLORYS + alpha * U_wind", "stokesCoefficient": 1.0 if kind == "treatment" else 0.0, "alpha": alpha, "alphaText": ALPHA_TEXT[alpha], "drifterCount": pw["drifterCount"], "released": len(points), "drifterIds": [d for d, *_ in points],
           "integrationStepSeconds": spec["integrationStepSeconds"], "outputStepSeconds": spec["outputStepSeconds"], "durationSeconds": spec["durationSeconds"], "area": unit["computationArea"], "datasetVersions": spec["datasetVersions"], "windDataset": spec["windDataset"],
           "forcingFile": fw[kind]["file"], "forcingFileSha256": fw[kind]["fileSha256"], "gridSha256": dataset["manifest"]["sha256"], "sourceSha256": dataset["manifest"]["sourceSha256"], "glorysSourceSha256": fw["glorysSource"]["sha256"], "ww3SourceSha256": [s["sha256"] for s in fw["ww3Sources"]], "windGridSha256": wind["manifest"]["sha256"], "windFileSha256": fw["wind"]["sha256"],
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
    out_dir = OUT / wid / f"{kind}-alpha{ALPHA_TEXT[alpha]}"; out_dir.mkdir(parents=True, exist_ok=True)
    res_path = out_dir / "result.json"; res_path.write_bytes(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=1).encode("utf-8"))
    spec_path = out_dir / "spec.json"; spec_path.write_bytes(json.dumps(spec, ensure_ascii=False, sort_keys=True, indent=1).encode("utf-8"))
    csv_bytes, rows = r18.export_rows(run_id, ALPHA_TEXT[alpha], [d for d, *_ in points], result, unit["computationArea"], [])
    csv_path = out_dir / "trajectories.csv"; csv_path.write_bytes(csv_bytes)
    final = {}
    for tr in result["trajectories"]:
        last = tr["samples"][-1]; key = r18.map_status(last["status"], last["lon"], last["lat"], unit["computationArea"]); final[key] = final.get(key, 0) + 1
    rec.update({"status": "COMPLETED", "startedAtUTC": started, "completedAtUTC": r18.utc_now(), "wallSeconds": round(time.perf_counter() - t, 1), "modelCommit": prov["modelCommit"], "modelId": prov["modelId"], "modelVersion": prov["modelVersion"], "engineVersion": prov["engineVersion"], "modelSourceSha256": prov["modelSourceSha256"], "dependencyLockSha256": prov["dependencyLockSha256"],
                "specSha256": prov["specSha256"], "resultArraySha256": prov["resultArraySha256"], "environment": prov["environment"], "resultFile": str(res_path.relative_to(ROOT)).replace("\\", "/"), "resultSha256": r18.sha(res_path), "specFile": str(spec_path.relative_to(ROOT)).replace("\\", "/"), "trajectoriesFile": str(csv_path.relative_to(ROOT)).replace("\\", "/"), "trajectoriesSha256": r18.sha(csv_path), "rows": len(rows),
                "finalStatusCounts": final, "runtimeStatusCounts": result["summary"]["statusCounts"], "qualityStatus": result["qualityStatus"], "endpoints72h": [{"drifterId": did, "lon": tr["samples"][-1]["lon"], "lat": tr["samples"][-1]["lat"], "timeUTC": tr["samples"][-1]["timeUTC"], "finalStatus": tr["finalStatus"]} for (did, *_), tr in zip(points, result["trajectories"])]})
    proc = subprocess.run([sys.executable, str(REPLAY), str(spec_path), str(ROOT / fw[kind]["file"]), str(ROOT / fw["wind"]["file"]), run_id], capture_output=True, text=True, cwd=ROOT)
    outcome = {}
    if "{" in proc.stdout:
        try:
            outcome = json.loads(proc.stdout[proc.stdout.rfind("{"):])
        except json.JSONDecodeError:
            outcome = {}
    matched = proc.returncode == 0 and outcome.get("ok") is True and outcome.get("resultArraySha256") == prov["resultArraySha256"] and outcome.get("specSha256") == prov["specSha256"] and outcome.get("modelSourceSha256") == prov["modelSourceSha256"]
    rec["replay"] = {"process": "separate python tools/research/replay_step25c_run.py (on-disk spec/forcing/wind)", "replayToolSha256": r18.sha(REPLAY), "returncode": proc.returncode, "replayResultSha256": outcome.get("resultArraySha256"), "replaySpecSha256": outcome.get("specSha256"), "stderrTail": (proc.stderr or "")[-300:] if proc.returncode else ""}
    rec["replayMatched"] = matched
    if not matched:
        rec["status"] = "MODEL_RUN_FAIL"; rec["error"] = "replay mismatch"
    r18.log("run", rec["status"], runId=run_id, wall=rec["wallSeconds"], replay=matched, final=final)
    return rec


def main():
    pb = r18.load(PBLOCK)
    try:
        fm = precheck(pb)
    except r18.Stop as exc:
        print(json.dumps({"status": str(exc)})); return 2
    from research_runtime import models_v2
    from research_runtime.datasets import validate_dataset
    from research_runtime.wind import validate_wind_dataset
    if models_v2.model_source_sha256() != pb["modelSourceSha256"]:
        print(json.dumps({"status": "STEP29_BLOCKED_IMMUTABILITY: runtime model source"})); return 2
    p18b = r18.load(PREREG18B); p25 = {w["windowId"]: w for w in r18.load(P25C)["windows"]}; fws = {w["windowId"]: w for w in fm["windows"]}
    r25 = {(r["windowId"], r["alpha"]): r for r in r18.load(RUNS25C)["runs"]}
    runs = []; started = r18.utc_now(); status = "STEP29_RUNS_PASS"
    try:
        for wid in WINDOWS:
            for kind, alpha in ORDER:
                rec = execute(p18b, p25[wid], fws[wid], kind, alpha, models_v2, validate_dataset, validate_wind_dataset)
                if kind == "control" and rec.get("status") == "COMPLETED":  # consistency record vs STEP 25C GLORYS run (same alpha); not a gate
                    ref = r25[(wid, alpha)]; ends = {e["drifterId"]: e for e in ref.get("endpoints72h", [])}
                    seps = [hav(e["lon"], e["lat"], ends[e["drifterId"]]["lon"], ends[e["drifterId"]]["lat"]) for e in rec["endpoints72h"] if e["drifterId"] in ends]
                    rec["step25cConsistency"] = {"referenceRunId": ref["runId"], "referenceResultArraySha256": ref["resultArraySha256"], "resultArrayBitwiseEqual": rec["resultArraySha256"] == ref["resultArraySha256"], "endpointSeparationKm": {"max": round(max(seps), 6) if seps else None, "n": len(seps)}, "note": "composite time axis (3 h) and mask differ from STEP 25C by construction; descriptive consistency only"}
                runs.append(rec)
        if not (len(runs) == 24 and all(r["status"] == "COMPLETED" and r["replayMatched"] for r in runs)):
            status = "STEP29_REPRODUCIBILITY_FAIL" if all(r["status"] == "COMPLETED" or r.get("error") == "replay mismatch" for r in runs) and len(runs) == 24 else "STEP29_RUNS_FAIL"
    except r18.Stop as exc:
        status = str(exc).split(":")[0]; r18.log("gate", status)
    manifest = {"schemaVersion": "1.0", "ruleId": "stokes-license-and-experiment-gate-step29", "phaseBPreregistrationSha256": r18.sha(PBLOCK), "forcingManifestSha256": r18.sha(FORCING), "fairnessReportSha256": r18.sha(FAIR), "status": status, "modelRunCount": len(runs), "plannedRuns": 24,
                "conditionRuns": {f"{k}-alpha{ALPHA_TEXT[a]}": sum(1 for r in runs if r["condition"] == k and r["alpha"] == a) for k, a in ORDER}, "alphaValues": [0.002, 0.0], "stokesCoefficient": 1.0, "equationControl": "dX/dt = U_GLORYS + alpha * U_wind", "equationTreatment": "dX/dt = U_GLORYS + U_Stokes + alpha * U_wind", "stokesMultipliedByAlpha": False,
                "modelSourceSha256": models_v2.model_source_sha256(), "runnerSha256": r18.sha(__file__), "replayToolSha256": r18.sha(REPLAY), "readerSha256": pb["tools"]["tools/research/glorys_reader_step25c.py"], "builderSha256": pb["tools"]["tools/research/build_step29_forcing.py"], "runs": runs, "startedAtUTC": started, "completedAtUTC": r18.utc_now(), "log": r18.LOG}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    replay = {"schemaVersion": "1.0", "ruleId": manifest["ruleId"], "runManifestSha256": r18.sha(MANIFEST), "replayTool": {"file": "tools/research/replay_step25c_run.py", "sha256": r18.sha(REPLAY)}, "replays": [{"runId": r["runId"], "condition": r["condition"], "alpha": r["alpha"], "windowId": r["windowId"], "resultArraySha256": r.get("resultArraySha256"), "replayResultSha256": r.get("replay", {}).get("replayResultSha256"), "specSha256": r.get("specSha256"), "forcingFileSha256": r.get("forcingFileSha256"), "windFileSha256": r.get("windFileSha256"), "trajectoriesSha256": r.get("trajectoriesSha256"), "matched": r.get("replayMatched", False)} for r in runs],
              "matchedCount": sum(1 for r in runs if r.get("replayMatched")), "total": len(runs), "allMatched": len(runs) == 24 and all(r.get("replayMatched") for r in runs)}
    REPLAY_MANIFEST.write_text(json.dumps(replay, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": status, "runs": len(runs), "completed": sum(1 for r in runs if r["status"] == "COMPLETED"), "replayMatched": replay["matchedCount"]}))
    return 0 if status == "STEP29_RUNS_PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
