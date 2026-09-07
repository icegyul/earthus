"""STEP 39 variant (derived from the validated STEP 32 tool by identity/path patches only; algorithm unchanged): STEP 36 cohort, STEP 38 acquisition/freeze, STEP 39 daily/candidate manifests; validationPlanId = STEP 37 rule id.
REVISION r3 (uncommitted; r2 kept unchanged; see docs/research/step32-phase-b-revisions.json): chunked/single datasets distinguished by the recorded flag, not by isinstance(dict) (a single validated dataset is a dict).
REVISION r2 (STEP 32 Phase B, uncommitted file-level revision; r1 kept unchanged on disk; see docs/research/step32-phase-b-revisions.json): every condition of a window is blocked when the B2 gate is not PASS (registered WINDOW_BLOCKED rule).
STEP 32 Phase B — shared run construction used identically by the runner (in-process) and the separate-process replay.
Condition A = HYCOM_NATIVE_3H (STEP 17/20 normalized dataset; STEP 20 B-3 segmented integration when the window is chunked), B =
HYCOM_DAILY (B3 daily dataset), C = candidate GLORYS + Stokes (B6 composite; chunked/segmented under the same B-3 rule when needed).
Everything else is identical across conditions: wind file, alpha 0.002, computation area (ocean box clipped to +-40 deg, STEP 18b/20 rule),
release positions and IDs (locked matrix), RK4 300 s, output 900 s, 72 h, spec built by run_step18b_model.build_spec with the STEP 18b
preregistration. No parameter is read from any performance file."""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps")); sys.path.insert(0, str(ROOT / "tools/research"))
import run_step18b_model as r18  # noqa: E402
import step20_segmented as seg  # noqa: E402
from research_runtime import models_v2  # noqa: E402
from research_runtime.datasets import digest, validate_dataset  # noqa: E402
from research_runtime.wind import validate_wind_dataset  # noqa: E402

QC = D / "step38-data-freeze-manifest.json"
MATRIX, ACQ, DAILY, CAND = D / "step36-cohort-extension-manifest.json", D / "step38-source-acquisition-manifest.json", D / "step39-daily-derivation-manifest.json", D / "step39-candidate-forcing-manifest.json"
PREREG18B = D / "step18b-preregistration.json"
PREREG18B_SHA = "02935e81e9c93690078ff96231c74ad51c86dfaffa89bfa17a2e2ba082306316"
ALPHA = 0.002
PLAN = {"A": "experiment-preregistration-step37", "B": "experiment-preregistration-step37", "C": "experiment-preregistration-step37"}
EQUATION = {"A": "dX/dt = U_HYCOM_3h + 0.002 * U_wind", "B": "dX/dt = U_HYCOM_daily + 0.002 * U_wind", "C": "dX/dt = U_GLORYS + U_Stokes + 0.002 * U_wind"}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def inputs(wid, cond):
    """Resolve the SHA-verified dataset(s) and wind for one window/condition. Returns (datasets dict or single, wind, meta)."""
    M = load(MATRIX); acq = {w["windowId"]: w for w in load(ACQ)["windows"]}; w = dict(next(x for x in M["windows"] if x["windowId"] == wid)); w["t0"] = w["start"]; w["releasePositions"] = [{"drifterId": d["drifterId"], "lon": d["startLon"], "lat": d["startLat"]} for d in w["drifters"]]; a = acq[wid]
    if sha(PREREG18B) != PREREG18B_SHA:
        raise r18.Stop("STEP32_BLOCKED_IMMUTABILITY: STEP 18b preregistration")
    qc = next(x for x in load(QC)["windows"] if x["windowId"] == wid)
    if qc["hycomStatus"] != "HYCOM_PASS":
        raise r18.Stop(f"WINDOW_BLOCKED: {wid} HYCOM source {qc['hycomStatus']} (missing registered frames: {qc.get('missingRegisteredFrames')})")
    wind_path = ROOT / a["wind"]["file"]
    if sha(wind_path) != a["wind"]["fileSha256"]:
        raise r18.Stop(f"STEP32_BLOCKED_IMMUTABILITY: wind {wid}")
    wind = validate_wind_dataset(load(wind_path))
    if cond == "A":
        nat = a["hycomNative3h"]
        if nat["chunked"]:
            ds = {}
            for n, c in nat["chunks"].items():
                if sha(ROOT / c["file"]) != c["fileSha256"]:
                    raise r18.Stop(f"STEP32_BLOCKED_IMMUTABILITY: chunk {n} {wid}")
                ds[n] = validate_dataset(load(ROOT / c["file"]))
            meta = {"chunked": True, "files": {n: c["file"] for n, c in nat["chunks"].items()}, "fileSha256": {n: c["fileSha256"] for n, c in nat["chunks"].items()}, "gridSha256": {n: c["gridSha256"] for n, c in nat["chunks"].items()}}
        else:
            if sha(ROOT / nat["file"]) != nat["fileSha256"]:
                raise r18.Stop(f"STEP32_BLOCKED_IMMUTABILITY: native dataset {wid}")
            ds = validate_dataset(load(ROOT / nat["file"])); meta = {"chunked": False, "file": nat["file"], "fileSha256": nat["fileSha256"], "gridSha256": nat["gridSha256"]}
        depth = 15.0
    elif cond == "B":
        dm = next(x for x in load(DAILY)["windows"] if x["windowId"] == wid)
        if dm.get("status") != "DERIVED" or sha(ROOT / dm["derived"]["file"]) != dm["derived"]["fileSha256"]:
            raise r18.Stop(f"STEP32_BLOCKED_IMMUTABILITY: daily dataset {wid}")
        ds = validate_dataset(load(ROOT / dm["derived"]["file"])); meta = {"chunked": False, "file": dm["derived"]["file"], "fileSha256": dm["derived"]["fileSha256"], "gridSha256": dm["derived"]["gridSha256"]}; depth = 15.0
    elif cond == "C":
        cm = next(x for x in load(CAND)["windows"] if x["windowId"] == wid)
        if cm.get("status") != "BUILT":
            raise r18.Stop(f"WINDOW_BLOCKED: candidate forcing {wid} {cm.get('status')}")
        t = cm["treatment"]
        if t.get("chunked"):
            ds = {}
            for n, c in t["chunks"].items():
                if sha(ROOT / c["file"]) != c["fileSha256"]:
                    raise r18.Stop(f"STEP32_BLOCKED_IMMUTABILITY: candidate chunk {n} {wid}")
                ds[n] = validate_dataset(load(ROOT / c["file"]))
            meta = {"chunked": True, "files": {n: c["file"] for n, c in t["chunks"].items()}, "fileSha256": {n: c["fileSha256"] for n, c in t["chunks"].items()}, "gridSha256": {n: c["gridSha256"] for n, c in t["chunks"].items()}}
        else:
            if sha(ROOT / t["file"]) != t["fileSha256"]:
                raise r18.Stop(f"STEP32_BLOCKED_IMMUTABILITY: candidate dataset {wid}")
            ds = validate_dataset(load(ROOT / t["file"])); meta = {"chunked": False, "file": t["file"], "fileSha256": t["fileSha256"], "gridSha256": t["gridSha256"]}
        depth = 15.81007
    else:
        raise r18.Stop(f"unknown condition {cond}")
    for d in (ds.values() if meta["chunked"] else [ds]):
        if d["manifest"]["surfaceDepthMeters"] != depth:
            raise r18.Stop(f"STEP32_BLOCKED_IMMUTABILITY: depth {cond} {wid} = {d['manifest']['surfaceDepthMeters']}")
    box = w["oceanBox"]; area = {"west": box["west"], "east": box["east"], "south": max(box["south"], -40.0), "north": min(box["north"], 40.0)}
    points = [(d["drifterId"], d["lon"], d["lat"]) for d in sorted(w["releasePositions"], key=lambda d: d["drifterId"])]
    unit = {"windowId": wid, "t0": w["t0"], "end": w["end"], "computationArea": area, "drifterCount": len(points), "points": points}
    meta.update({"wind": {"file": a["wind"]["file"], "fileSha256": a["wind"]["fileSha256"], "gridSha256": a["wind"]["gridSha256"]}, "depthMeters": depth, "area": area, "points": points})
    return ds, wind, unit, meta


def run(wid, cond):
    """Execute one condition for one window on the frozen runtime. Returns (result, specs, meta)."""
    ds, wind, unit, meta = inputs(wid, cond)
    p18b = load(PREREG18B); run_id = f"step39-{cond}-alpha0.002-{wid}"
    if meta["chunked"]:
        result, segments = seg.run_segmented(p18b, unit, ds, wind, ALPHA, run_id, models_v2, PLAN[cond])
        specs = {name: spec for name, spec, _ in segments}
    else:
        spec = r18.build_spec(p18b, unit, ds, wind, {"alpha": ALPHA}, unit["points"]); spec["validationPlanId"] = PLAN[cond]
        pre = models_v2.preflight(spec, ds, wind)
        if not pre["ok"]:
            raise r18.Stop("MODEL_RUN_BLOCKED_PREFLIGHT: " + "; ".join(pre["errors"]))
        result = models_v2.run_experiment(spec, ds, wind, run_id=run_id); specs = {"single": spec}
    prov = result["provenance"]
    if prov["windage"]["alpha"] != ALPHA or prov["integrationStepSeconds"] != 300 or prov["outputStepSeconds"] != 900:
        raise r18.Stop("MODEL_RUN_FAIL: post-run parameter verification failed")
    meta.update({"runId": run_id, "resultArraySha256": digest(result["trajectories"]), "modelSourceSha256": prov["modelSourceSha256"], "segmented": meta["chunked"], "equation": EQUATION[cond]})
    return result, specs, meta
