"""STEP 20 Phase B-6.2 — HOLDOUT RUNS, exactly once: KE-H1 (segmented per B-3 §3 on the B-3 chunk datasets) and KE-H3 (single) ×
{alpha 0.002 (locked), 0 (baseline)} = 4 runs. KE-H2 is FORCING_UNAVAILABLE and is not modeled. Requires the B-6 gate record
SEGMENTATION_EQUIVALENCE_PASS. Forcing re-verified by SHA right before execution. Model mechanics unchanged (runtime models_v2; export and
status helpers from run_step18b_model.py). Separate-process replay per runtime call (segment or single run)."""
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
import step20_segmented as seg  # noqa: E402

PREREG20 = ROOT / "docs/research/step20-preregistration.json"
PREREG18B = ROOT / "docs/research/step18b-preregistration.json"
ALPHA = ROOT / "docs/research/step20-selected-alpha.json"
B2 = ROOT / "docs/research/step20-holdout-forcing-manifest.json"
B3 = ROOT / "docs/research/step20-b3-holdout-forcing-manifest.json"
B5 = ROOT / "docs/research/step20-b5-numerical-equivalence-selection-rule.json"
GATE = ROOT / "docs/research/step20-b6-segmentation-gate.json"
OUT = ROOT / "data/research/step20/holdout/trajectories"
MANIFEST = ROOT / "docs/research/step20-b6-holdout-manifest.json"
LOCKED = {PREREG20: "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4", ALPHA: "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd", PREREG18B: "02935e81e9c93690078ff96231c74ad51c86dfaffa89bfa17a2e2ba082306316",
          B2: "8e4c55928707cfe4c6f9c5d962cd789ebd2767737af23407ffb5cb48e60b065b", B3: "10c4f7420d16757b7cd3f23805ce63dde1f58ea63591e8dc9411647d7bc27701", B5: "dd3916b840b921165771c022e29db5b72b3a26769775503044fef5c004cc7595",
          ROOT / "docs/research/step20-b5-numerical-equivalence-protocol.md": "a61140347320519b623eeb382d18470a0759d4e51597c4d2896730889a737f42", ROOT / "docs/research/step20-b3-forcing-resolution-protocol.md": "b7a2ad2309553c05f261598773df7ca5295a8dcd92ef76fd3467e4d1787ef466"}
ALPHA_TEXT = {0.002: "0.002", 0.0: "0"}
PLAN = "model-protocol-step20-generalization-parameter-validation"


def replay(cli_v2, spec, dataset, wind, result, bundle_path):
    bundle = Path(cli_v2.export_bundle(spec, dataset, wind, result, bundle_path))
    proc = subprocess.run([sys.executable, "-m", "research_runtime.cli_v2", "replay", str(bundle)], capture_output=True, text=True, cwd=SERVICE, env={**os.environ, "PYTHONPATH": ".;.deps"})
    outcome = {}
    if "{" in proc.stdout:
        try:
            outcome = json.loads(proc.stdout[proc.stdout.find("{"):])
        except json.JSONDecodeError:
            outcome = {}
    matched = proc.returncode == 0 and outcome.get("matched") is True and outcome.get("resultArraySha256") == result["provenance"]["resultArraySha256"]
    return {"bundle": str(bundle.relative_to(ROOT)).replace("\\", "/"), "bundleSha256": r18.sha(bundle), "returncode": proc.returncode, "replayResultSha256": outcome.get("resultArraySha256"), "matched": matched}


def precheck(p20, art, b2, b3, gate):
    for path, expected in LOCKED.items():
        if r18.sha(path) != expected:
            raise r18.Stop(f"HOLDOUT_BLOCKED_IMMUTABILITY: {path.relative_to(ROOT)}")
    for short in ("155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098"):
        if subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() != "commit":
            raise r18.Stop(f"HOLDOUT_BLOCKED_IMMUTABILITY: commit {short}")
    if float(art["selectedAlpha"]) != 0.002 or art["frozen"] is not True or art["holdoutUsed"] is not False:
        raise r18.Stop("HOLDOUT_BLOCKED_IMMUTABILITY: selected-alpha artifact")
    if gate["status"] != "SEGMENTATION_EQUIVALENCE_PASS" or gate["b5SelectionRuleSha256"] != LOCKED[B5]:
        raise r18.Stop("HOLDOUT_BLOCKED_SEGMENTATION: gate not PASS")
    if MANIFEST.exists() or OUT.exists():
        raise r18.Stop("HOLDOUT_BLOCKED: holdout runs already exist; the holdout is evaluated exactly once")
    cal = {d for u in p20["calibration"]["runUnits"] for d in u["drifterIds"]}; hold = {d for u in p20["holdout"]["runUnits"] for d in u["drifterIds"]}
    if cal & hold or len(hold) != 13:
        raise r18.Stop("HOLDOUT_BLOCKED_IMMUTABILITY: cohort overlap")
    # forcing: raw files (B-2), normalized single (KE-H3) and chunk files (KE-H1) re-verified
    for u in b2["runUnits"]:
        for f in u["hycom"]["files"] + u["ncep"]["files"]:
            if r18.sha(ROOT / "data/research/step20/holdout/forcing" / u["windowId"] / ("hycom" if f["product"].startswith("water") else "ncep") / f["filename"]) != f["sha256"]:
                raise r18.Stop(f"HOLDOUT_BLOCKED_FORCING: raw {f['filename']}")
    for u in b3["runUnits"]:
        if u["status"] == "FORCING_AVAILABLE_CHUNKED":
            for c in ("A", "B"):
                if r18.sha(ROOT / u["hycom"]["chunks"][c]["file"]) != u["hycom"]["chunks"][c]["fileSha256"]:
                    raise r18.Stop(f"HOLDOUT_BLOCKED_FORCING: chunk {u['windowId']} {c}")
        elif u["status"] == "FORCING_AVAILABLE":
            if r18.sha(ROOT / u["hycom"]["normalized"]["file"]) != u["hycom"]["normalized"]["fileSha256"]:
                raise r18.Stop(f"HOLDOUT_BLOCKED_FORCING: normalized {u['windowId']}")
        if r18.sha(ROOT / u["ncep"]["normalized"]["file"]) != u["ncep"]["normalized"]["fileSha256"]:
            raise r18.Stop(f"HOLDOUT_BLOCKED_FORCING: wind {u['windowId']}")


def main():
    p20, p18b, art, b2, b3, gate = (r18.load(x) for x in (PREREG20, PREREG18B, ALPHA, B2, B3, GATE))
    started = r18.utc_now()
    try:
        precheck(p20, art, b2, b3, gate)
    except r18.Stop as exc:
        r18.log("precheck", "BLOCKED", reason=str(exc)); print(str(exc)); return 2
    r18.log("precheck", "PASS", head=subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip(), gate=gate["status"])
    from research_runtime import models_v2, cli_v2
    from research_runtime.datasets import validate_dataset
    from research_runtime.wind import validate_wind_dataset
    units3 = {u["windowId"]: u for u in b3["runUnits"]}
    runs = []
    for unit in p20["holdout"]["runUnits"]:
        f3 = units3[unit["windowId"]]
        if f3["status"] == "FORCING_UNAVAILABLE":
            for alpha in (0.002, 0.0):
                runs.append({"runId": f"step20-hold-alpha{ALPHA_TEXT[alpha]}-{unit['windowId']}", "windowId": unit["windowId"], "alpha": alpha, "drifterCount": unit["drifterCount"], "status": "FORCING_UNAVAILABLE",
                             "missingRequiredOceanFrames": f3["missingRequiredOceanFrames"], "modeled": False})
            r18.log("unit", "FORCING_UNAVAILABLE", window=unit["windowId"], missing=f3["missingRequiredOceanFrames"]); continue
        wind = validate_wind_dataset(r18.load(ROOT / f3["ncep"]["normalized"]["file"]))
        box = f3["oceanDomain"]; area = {"west": box["west"], "east": box["east"], "south": max(box["south"], -40.0), "north": min(box["north"], 40.0)}
        points = [(d["drifterId"], d["lon"], d["lat"]) for d in sorted(unit["releasePositions"], key=lambda d: d["drifterId"])]
        u = {**unit, "computationArea": area, "points": points}
        for alpha in (0.002, 0.0):
            run_id = f"step20-hold-alpha{ALPHA_TEXT[alpha]}-{unit['windowId']}"; t = time.perf_counter(); started_run = r18.utc_now()
            rec = {"runId": run_id, "windowId": unit["windowId"], "alpha": alpha, "alphaText": ALPHA_TEXT[alpha], "role": "selected" if alpha else "baseline", "drifterCount": unit["drifterCount"], "released": len(points),
                   "integrationStepSeconds": 300, "outputStepSeconds": 900, "durationSeconds": 259200, "computationArea": area, "forcingSha256": f3["forcingSha256"], "windGridSha256": wind["manifest"]["sha256"], "modeled": True}
            try:
                r18.log("run", "START", runId=run_id, particles=len(points), segmented=f3["status"] == "FORCING_AVAILABLE_CHUNKED")
                if f3["status"] == "FORCING_AVAILABLE_CHUNKED":
                    datasets = {c: validate_dataset(r18.load(ROOT / f3["hycom"]["chunks"][c]["file"])) for c in ("A", "B")}
                    result, segments = seg.run_segmented(p18b, u, datasets, wind, alpha, run_id, models_v2, PLAN)
                    rec.update({"segmented": True, "gridSha256": {c: datasets[c]["manifest"]["sha256"] for c in datasets}, "datasetVersions": {c: {"datasetId": datasets[c]["manifest"]["datasetId"], "version": datasets[c]["manifest"]["version"]} for c in datasets},
                                "segments": result["provenance"]["segmentation"]["segments"], "continuedParticles": result["provenance"]["segmentation"]["continuedParticles"]})
                    out_dir = OUT / unit["windowId"]; out_dir.mkdir(parents=True, exist_ok=True); bundles = out_dir / "bundles"; bundles.mkdir(exist_ok=True)
                    reps = []
                    for name, spec, res in segments:
                        ds = datasets["A"] if name == "seg1" else datasets["B"]
                        reps.append({"segment": name, **replay(cli_v2, spec, ds, wind, res, bundles / f"alpha{ALPHA_TEXT[alpha]}.{name}.zip")})
                    rec["replay"] = reps; rec["replayMatched"] = all(x["matched"] for x in reps)
                else:
                    dataset = validate_dataset(r18.load(ROOT / f3["hycom"]["normalized"]["file"]))
                    spec = r18.build_spec(p18b, u, dataset, wind, {"alpha": alpha}, points); spec["validationPlanId"] = PLAN
                    check = models_v2.preflight(spec, dataset, wind)
                    if not check["ok"]:
                        raise r18.Stop("MODEL_RUN_BLOCKED_PREFLIGHT: " + "; ".join(check["errors"]))
                    result = models_v2.run_experiment(spec, dataset, wind, run_id=run_id)
                    rec.update({"segmented": False, "gridSha256": dataset["manifest"]["sha256"], "datasetVersions": spec["datasetVersions"], "specSha256": result["provenance"]["specSha256"]})
                    out_dir = OUT / unit["windowId"]; out_dir.mkdir(parents=True, exist_ok=True); bundles = out_dir / "bundles"; bundles.mkdir(exist_ok=True)
                    rep = replay(cli_v2, spec, dataset, wind, result, bundles / f"alpha{ALPHA_TEXT[alpha]}.zip"); rec["replay"] = [rep]; rec["replayMatched"] = rep["matched"]
                prov = result["provenance"]
                if prov["windage"]["alpha"] != alpha or prov["integrationStepSeconds"] != 300 or prov["outputStepSeconds"] != 900:
                    raise r18.Stop("MODEL_RUN_FAIL: post-run parameter verification")
                res_path = out_dir / f"alpha{ALPHA_TEXT[alpha]}.result.json"; res_path.write_bytes(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=1).encode("utf-8"))
                csv_bytes, rows = r18.export_rows(run_id, ALPHA_TEXT[alpha], [d for d, *_ in points], result, area, [])
                csv_path = out_dir / f"alpha{ALPHA_TEXT[alpha]}.trajectories.csv"; csv_path.write_bytes(csv_bytes)
                final = {}
                for tr in result["trajectories"]:
                    last = tr["samples"][-1]; key = r18.map_status(last["status"], last["lon"], last["lat"], area); final[key] = final.get(key, 0) + 1
                rec.update({"status": "COMPLETED" if rec["replayMatched"] else "MODEL_RUN_FAIL", "startedAtUTC": started_run, "completedAtUTC": r18.utc_now(), "wallSeconds": round(time.perf_counter() - t, 1),
                            "modelCommit": prov["modelCommit"], "modelSourceSha256": prov["modelSourceSha256"], "resultArraySha256": prov["resultArraySha256"], "environment": prov["environment"],
                            "resultFile": str(res_path.relative_to(ROOT)).replace("\\", "/"), "resultSha256": r18.sha(res_path), "trajectoriesFile": str(csv_path.relative_to(ROOT)).replace("\\", "/"),
                            "trajectoriesSha256": r18.sha(csv_path), "rows": len(rows), "finalStatusCounts": final, "runtimeStatusCounts": result["summary"]["statusCounts"]})
                if not rec["replayMatched"]:
                    rec["error"] = "replay mismatch"
            except r18.Stop as exc:
                rec.update(status=str(exc).split(":")[0], error=str(exc))
            except Exception as exc:
                rec.update(status="MODEL_RUN_FAIL", error=f"{type(exc).__name__}: {exc}"[:300])
            runs.append(rec); r18.log("run", rec["status"], runId=run_id, wall=rec.get("wallSeconds"), replayMatched=rec.get("replayMatched"), final=rec.get("finalStatusCounts"))
    modeled = [x for x in runs if x.get("modeled")]
    complete = len(modeled) == 4 and all(x["status"] == "COMPLETED" and x["replayMatched"] for x in modeled) and sum(x["drifterCount"] for x in modeled if x["alpha"] == 0.002) == 12
    status = "HOLDOUT_RUNS_PASS" if complete else "HOLDOUT_FAILED"
    manifest = {"schemaVersion": "1.0", "ruleId": p20["ruleId"], "phase": "B-6.2 HOLDOUT RUNS (KE, revised)", "status": status, "lockCommit": "155995dd", "alphaLockCommit": "73fafffb", "b3Commit": "9113e8b5", "b5Commit": "c395a098",
                "selectedAlpha": 0.002, "baselineAlpha": 0.0, "selectedAlphaArtifactSha256": LOCKED[ALPHA], "gateFile": str(GATE.relative_to(ROOT)).replace("\\", "/"), "gateSha256": r18.sha(GATE), "gateStatus": gate["status"],
                "b2HoldoutForcingManifestSha256": LOCKED[B2], "b3HoldoutForcingManifestSha256": LOCKED[B3], "observationSha256": p20["immutabilityCheck"]["observationSha256"],
                "modelId": p18b["model"]["modelId"], "modelVersion": p18b["model"]["modelVersion"], "modelSourceSha256": next((x["modelSourceSha256"] for x in modeled if "modelSourceSha256" in x), None),
                "modelCommit": next((x["modelCommit"] for x in modeled if "modelCommit" in x), None), "environment": next((x["environment"] for x in modeled if "environment" in x), None),
                "orchestrator": {"file": "tools/research/run_step20_b6_holdout.py", "sha256": r18.sha(__file__)}, "segmentedModule": {"file": "tools/research/step20_segmented.py", "sha256": r18.sha(ROOT / "tools/research/step20_segmented.py")},
                "runs": runs, "holdout": {"preregistered": 13, "evaluable": 12, "unavailable": 1, "KE-H2": "FORCING_UNAVAILABLE (missing source frame 2010-08-18T12:00:00Z; no interpolation, no substitution, no run)"},
                "agHoldout": "HOLDOUT_UNAVAILABLE", "otherAlphasRun": 0, "holdoutEvaluatedOnce": True, "startedAtUTC": started, "createdAtUTC": r18.utc_now(), "deterministic": True, "randomSeed": None,
                "resultFilesCommitted": False, "interpretation": "NONE", "log": r18.LOG}
    MANIFEST.write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    r18.log("manifest", status, file=str(MANIFEST.relative_to(ROOT)))
    return 0 if status == "HOLDOUT_RUNS_PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
