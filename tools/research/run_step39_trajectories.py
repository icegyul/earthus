"""STEP 39 variant (derived from the validated STEP 32 tool by identity/path patches only; algorithm unchanged): STEP 39 paths and identities; nothing else changed.
REVISION r3 (uncommitted; r2 kept unchanged; see docs/research/step32-phase-b-revisions.json): uses step32_runs_r3 / replay_step32_run_r3.
REVISION r2 (STEP 32 Phase B, uncommitted file-level revision; r1 kept unchanged on disk; see docs/research/step32-phase-b-revisions.json): WINDOW_BLOCKED runs are recorded and do not fail the manifest; blocked/evaluable windows listed; uses step32_runs_r2 / replay_step32_run_r2.
STEP 32 Phase B — B4 runner: for every window in the locked matrix order, condition A (HYCOM_NATIVE_3H) then B (HYCOM_DAILY), alpha
0.002, on the frozen runtime via step32_runs.run (identical construction for the separate-process replay tools/research/replay_step32_run.py).
Writes data/research/step32/trajectories/<wid>/<cond>-alpha0.002/{spec(s).json,result.json,trajectories.csv} and
docs/research/step32-temporal-run-manifest.json + step32-temporal-replay-manifest.json. `--out DIR` executes the whole experiment again into
an independent directory (B5 replay verification compares the outputs byte for byte). `--conditions A,B` default; `--conditions C` runs
the candidate (B6) into the same layout with manifest names step32-candidate-run-manifest.json / step32-candidate-replay-manifest.json.
No parameter, window, drifter or forcing is changed here; nothing is selected."""
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
sys.path.insert(0, str(ROOT / "tools/research"))
import run_step18b_model as r18  # noqa: E402
import step39_runs as S  # noqa: E402

REPLAY = ROOT / "tools/research/replay_step39_run.py"
OUT = ROOT / "data/research/step39/trajectories"


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out_root = Path(argv[argv.index("--out") + 1]) if "--out" in argv else OUT
    conds = argv[argv.index("--conditions") + 1].split(",") if "--conditions" in argv else ["A", "B"]
    kind = "candidate" if conds == ["C"] else "temporal"
    man_path = (out_root / f"step39-{kind}-run-manifest.json") if "--out" in argv else D / f"step39-{kind}-run-manifest.json"
    rep_path = (out_root / f"step39-{kind}-replay-manifest.json") if "--out" in argv else D / f"step39-{kind}-replay-manifest.json"
    if "--out" not in argv and man_path.exists():
        print(json.dumps({"status": "STEP39_BLOCKED: run manifest exists; no overwrite"})); return 2
    M = S.load(S.MATRIX); runs = []; status = "STEP32_RUNS_PASS"; started = r18.utc_now()
    try:
        for w in M["windows"]:
            wid = w["windowId"]
            for cond in conds:
                t = time.perf_counter(); s0 = r18.utc_now()
                try:
                    result, specs, meta = S.run(wid, cond)
                except r18.Stop as exc:
                    runs.append({"runId": f"step32-{cond}-alpha0.002-{wid}", "windowId": wid, "condition": cond, "status": str(exc).split(":")[0], "error": str(exc)}); r18.log("run", "BLOCKED", runId=wid + cond, error=str(exc)); continue
                out_dir = out_root / wid / f"{cond}-alpha0.002"; out_dir.mkdir(parents=True, exist_ok=True)
                res_path = out_dir / "result.json"; res_path.write_bytes(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=1).encode("utf-8"))
                spec_files = {}
                for name, spec in specs.items():
                    p = out_dir / (f"spec.{name}.json" if name != "single" else "spec.json"); p.write_bytes(json.dumps(spec, ensure_ascii=False, sort_keys=True, indent=1).encode("utf-8")); spec_files[name] = {"file": str(p.relative_to(ROOT)).replace("\\", "/") if p.is_relative_to(ROOT) else p.name, "sha256": r18.sha(p)}
                ids = [d for d, *_ in meta["points"]]
                csv_bytes, rows = r18.export_rows(meta["runId"], "0.002", ids, result, meta["area"], [])
                csv_path = out_dir / "trajectories.csv"; csv_path.write_bytes(csv_bytes)
                final = {}
                for tr in result["trajectories"]:
                    last = tr["samples"][-1]; key = r18.map_status(last["status"], last["lon"], last["lat"], meta["area"]); final[key] = final.get(key, 0) + 1
                rec = {"runId": meta["runId"], "windowId": wid, "role": "NEW_HOLDOUT", "condition": cond, "conditionName": {"A": "HYCOM_NATIVE_3H", "B": "HYCOM_DAILY", "C": "GLORYS_STOKES_CANDIDATE"}[cond], "equation": meta["equation"], "alpha": 0.002, "alphaText": "0.002", "depthMeters": meta["depthMeters"],
                       "drifterCount": len(ids), "released": len(ids), "drifterIds": ids, "integrationStepSeconds": 300, "outputStepSeconds": 900, "durationSeconds": 259200, "area": meta["area"], "segmented": meta["segmented"], "forcing": {k: meta[k] for k in ("chunked",) if k in meta} | ({"files": meta["files"], "fileSha256": meta["fileSha256"], "gridSha256": meta["gridSha256"]} if meta["chunked"] else {"file": meta["file"], "fileSha256": meta["fileSha256"], "gridSha256": meta["gridSha256"]}),
                       "wind": meta["wind"], "modelSourceSha256": meta["modelSourceSha256"], "resultArraySha256": meta["resultArraySha256"], "specs": spec_files, "resultFile": str(res_path.relative_to(ROOT)).replace("\\", "/") if res_path.is_relative_to(ROOT) else res_path.name, "resultSha256": r18.sha(res_path),
                       "trajectoriesFile": str(csv_path.relative_to(ROOT)).replace("\\", "/") if csv_path.is_relative_to(ROOT) else csv_path.name, "trajectoriesSha256": r18.sha(csv_path), "rows": len(rows), "finalStatusCounts": final, "runtimeStatusCounts": result["summary"]["statusCounts"], "startedAtUTC": s0, "completedAtUTC": r18.utc_now(), "wallSeconds": round(time.perf_counter() - t, 1),
                       "endpoints72h": [{"drifterId": did, "lon": tr["samples"][-1]["lon"], "lat": tr["samples"][-1]["lat"], "timeUTC": tr["samples"][-1]["timeUTC"], "finalStatus": tr["finalStatus"]} for did, tr in zip(ids, result["trajectories"])]}
                proc = subprocess.run([sys.executable, str(REPLAY), wid, cond], capture_output=True, text=True, cwd=ROOT)
                outcome = {}
                if "{" in proc.stdout:
                    try:
                        outcome = json.loads(proc.stdout[proc.stdout.rfind("{"):])
                    except json.JSONDecodeError:
                        outcome = {}
                matched = proc.returncode == 0 and outcome.get("ok") is True and outcome.get("resultArraySha256") == meta["resultArraySha256"] and outcome.get("modelSourceSha256") == meta["modelSourceSha256"]
                rec["replay"] = {"process": "separate python tools/research/replay_step32_run.py (same construction, on-disk inputs)", "replayToolSha256": r18.sha(REPLAY), "returncode": proc.returncode, "replayResultSha256": outcome.get("resultArraySha256"), "stderrTail": (proc.stderr or "")[-300:] if proc.returncode else ""}
                rec["replayMatched"] = matched; rec["status"] = "COMPLETED" if matched else "MODEL_RUN_FAIL"
                if not matched:
                    rec["error"] = "replay mismatch"
                runs.append(rec); r18.log("run", rec["status"], runId=meta["runId"], wall=rec["wallSeconds"], replay=matched, final=final)
                print(json.dumps({"run": meta["runId"], "status": rec["status"], "segmented": meta["segmented"], "wall": rec["wallSeconds"], "final": final}), flush=True)
    except r18.Stop as exc:
        status = str(exc).split(":")[0]
    planned = len(M["windows"]) * len(conds)
    blocked = [r for r in runs if str(r.get("status", "")).startswith("WINDOW_BLOCKED")]
    if status == "STEP32_RUNS_PASS" and not (len(runs) == planned and all(r.get("status") == "COMPLETED" or str(r.get("status", "")).startswith("WINDOW_BLOCKED") for r in runs) and any(r.get("status") == "COMPLETED" for r in runs)):
        status = "STEP32_RUNS_PARTIAL"
    manifest = {"schemaVersion": "1.0", "ruleId": "experiment-preregistration-step37", "phase": "STEP39", "kind": kind, "conditions": conds, "cohortManifestSha256": r18.sha(S.MATRIX), "acquisitionManifestSha256": r18.sha(S.ACQ), "dailyManifestSha256": r18.sha(S.DAILY) if S.DAILY.exists() else None, "candidateManifestSha256": r18.sha(S.CAND) if kind == "candidate" and S.CAND.exists() else None,
                "status": status, "modelRunCount": sum(1 for r in runs if r.get("status") == "COMPLETED"), "plannedRuns": planned, "alpha": 0.002, "modelSourceSha256": S.models_v2.model_source_sha256(), "runnerSha256": r18.sha(__file__), "runner": "tools/research/run_step39_trajectories.py", "sharedModuleSha256": r18.sha(ROOT / "tools/research/step39_runs.py"), "replayToolSha256": r18.sha(REPLAY), "segmentationRule": "STEP 20 B-3 (36 h split) only where the 25-frame dataset exceeds the runtime value limit",
                "blockedRuns": [{"runId": r["runId"], "windowId": r["windowId"], "condition": r["condition"], "status": r["status"], "error": r.get("error")} for r in blocked], "blockedWindows": sorted({r["windowId"] for r in blocked}), "evaluableWindows": [w["windowId"] for w in M["windows"] if w["windowId"] not in {r["windowId"] for r in blocked}], "runs": runs, "startedAtUTC": started, "completedAtUTC": r18.utc_now(), "log": r18.LOG}
    man_path.parent.mkdir(parents=True, exist_ok=True); man_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    replay = {"schemaVersion": "1.0", "ruleId": "experiment-preregistration-step37", "kind": kind, "runManifestSha256": r18.sha(man_path), "replayTool": {"file": "tools/research/replay_step39_run.py", "sha256": r18.sha(REPLAY)}, "replays": [{"runId": r["runId"], "windowId": r["windowId"], "condition": r["condition"], "resultArraySha256": r.get("resultArraySha256"), "replayResultSha256": r.get("replay", {}).get("replayResultSha256"), "trajectoriesSha256": r.get("trajectoriesSha256"), "matched": r.get("replayMatched", False)} for r in runs],
              "matchedCount": sum(1 for r in runs if r.get("replayMatched")), "total": len(runs), "allMatched": len(runs) == planned and all(r.get("replayMatched") for r in runs if not str(r.get("status", "")).startswith("WINDOW_BLOCKED")) and any(r.get("replayMatched") for r in runs), "blockedCount": len(blocked)}
    rep_path.write_text(json.dumps(replay, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": status, "runs": len(runs), "completed": manifest["modelRunCount"], "replayMatched": replay["matchedCount"]}))
    return 0 if status == "STEP32_RUNS_PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
