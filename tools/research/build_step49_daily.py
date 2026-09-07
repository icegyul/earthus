"""STEP 49 variant of build_step39_daily.py, derived by identity/path patches only; algorithm unchanged (same precedent as the STEP 39 tools derived from STEP 32).
Inputs: LOCKED STEP 47 cohort and FROZEN STEP 48 sources through the STEP 49 bridge views. No re-acquisition, no cohort change, no parameter change.
STEP 39 variant (derived from the validated STEP 32 tool by identity/path patches only; algorithm unchanged): STEP 38 acquisition/freeze manifests, data/research/step39 outputs; daily configuration = frozen STEP 32 matrix conditions.B.dailyDerivation (= STEP 37 field 12/18).
STEP 32 Phase B — B3: build HYCOM_DAILY (condition B) for every window that passed the B2 gate. Per UTC day exactly the eight native
frames 00,03,...,21Z are read with the unchanged reader (read_hycom_parts) from the day file; u_daily = mean(u_00..u_21), v_daily =
mean(v_00..v_21), unweighted, computed independently for u and v; a node whose eight frames are not all finite is None (no gap filling).
The daily field carries the label 00:00Z of its UTC day; six daily frames (D-1..D+4) form a regular 86400 s axis bracketing t0..t0+72h.
landMask = union of non-finite over the 48 source frames; it must equal condition A's landMask (STEP 17 reader union over the 25 window
frames; registered as identical between A and B) — otherwise STEP32_FAIRNESS_MASK_MISMATCH and STOP. No smoothing, no filtering, no
temporal weighting, no spatial change, no reconstruction, no optimization. Grid axes are the identical HYCOM axes. Provenance per day: source
file SHA, eight frame timestamps, per-frame u/v SHA, daily u/v SHA; script SHA and configuration SHA. Writes
data/research/step32/forcing/normalized/<wid>.hycom15m.daily.dataset.json and docs/research/step32-daily-derivation-manifest.json
(`--out DIR` derives into another directory for the independent re-run)."""
import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
import numpy as np  # noqa: E402
from research_runtime.datasets import digest, validate_dataset  # noqa: E402
from research_runtime.netcdf_reader import read_hycom_parts  # noqa: E402

MATRIX, ACQ, QC = ROOT / "data/research/step49/bridge/step49-cohort-matrix.json", ROOT / "data/research/step49/bridge/step49-acq-bridge.json", ROOT / "data/research/step49/bridge/step49-freeze-bridge.json"
OUT = ROOT / "data/research/step49/forcing/normalized"
MANIFEST = ROOT / "data/research/step49/step49-daily-derivation-manifest.json"
ALGORITHM = "hycom-3h-to-utc-daily-mean/1"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def canonical(v):
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def frame_sha(plane):
    return hashlib.sha256(json.dumps(plane, separators=(",", ":")).encode()).hexdigest()


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out_dir = Path(argv[argv.index("--out") + 1]) if "--out" in argv else OUT
    man_path = out_dir / MANIFEST.name if "--out" in argv else MANIFEST
    M = load(MATRIX); A = load(ACQ); Q = load(QC)
    if Q["acquisitionManifestSha256"] != sha(ACQ) or sha(MATRIX) != "a2a237545058b48942cc2b27c7941269e3e34100968e3af1a1e13e1fd7680c67":
        raise SystemExit("STEP39_BLOCKED_IMMUTABILITY: acquisition / freeze / matrix (daily configuration source)")
    if "--out" not in argv and man_path.exists():
        raise SystemExit("STEP32_BLOCKED: daily derivation manifest exists; no overwrite")
    out_dir.mkdir(parents=True, exist_ok=True)
    cfg = M["conditions"]["B"]["dailyDerivation"]; cfg_sha = hashlib.sha256(canonical(cfg)).hexdigest()
    qc = {w["windowId"]: w for w in Q["windows"]}; records = []; stop = None
    for rec in A["windows"]:
        wid = rec["windowId"]
        if qc[wid]["hycomStatus"] != "HYCOM_PASS":
            records.append({"windowId": wid, "status": qc[wid]["hycomStatus"], "derived": False}); print(json.dumps({"window": wid, "status": qc[wid]["hycomStatus"]})); continue
        nat = rec["hycomNative3h"]; base_man = load(ROOT / (nat["file"] if not nat["chunked"] else nat["chunks"]["A"]["file"]))["manifest"]
        days = []; u_daily = []; v_daily = []; times = []; axes = None; nan_union = None
        for e in rec["hycomDayParts"]:
            path = ROOT / "data/research/step48/forcing" / wid / "hycom-days" / e["filename"]
            if sha(path) != e["sha256"]:
                raise SystemExit(f"STEP32_BLOCKED_IMMUTABILITY: day file {wid} {e['filename']}")
            grid, sources, _, meta = read_hycom_parts([(path, e["query"])], 15)
            exp = [f"{e['utcDay']}T{h:02d}:00:00Z" for h in range(0, 24, 3)]
            if grid["timeUTC"] != exp or meta["shape"][0] != 8:
                raise SystemExit(f"WINDOW_BLOCKED: {wid} {e['utcDay']} does not contain exactly the eight frames 00..21Z")
            if axes is None:
                axes = (grid["lon"], grid["lat"])
            elif axes != (grid["lon"], grid["lat"]):
                raise SystemExit(f"STEP32_BLOCKED: axes differ across day files {wid}")
            u = np.array([[[np.nan if x is None else x for x in row] for row in plane] for plane in grid["u"]], float); v = np.array([[[np.nan if x is None else x for x in row] for row in plane] for plane in grid["v"]], float)
            um = u.mean(axis=0); vm = v.mean(axis=0)   # unweighted arithmetic mean; NaN propagates (no gap filling)
            nn = ~(np.isfinite(um) & np.isfinite(vm)); nan_union = nn if nan_union is None else (nan_union | nn)
            tolist = lambda A_: [[None if not math.isfinite(x) else float(x) for x in row] for row in A_.tolist()]
            ul, vl = tolist(um), tolist(vm); u_daily.append(ul); v_daily.append(vl); times.append(f"{e['utcDay']}T00:00:00Z")
            days.append({"utcDay": e["utcDay"], "sourceFile": str(path.relative_to(ROOT)).replace("\\", "/"), "sourceFileSha256": e["sha256"], "sourceBytes": e["bytes"], "frameTimestamps": grid["timeUTC"], "frameCount": 8,
                         "sourceUSha256": [frame_sha(p) for p in grid["u"]], "sourceVSha256": [frame_sha(p) for p in grid["v"]], "dailyUSha256": frame_sha(ul), "dailyVSha256": frame_sha(vl), "dailyLabelUTC": f"{e['utcDay']}T00:00:00Z", "nodesNotFiniteInAllEightFrames": int(nn.sum())})
        land = nan_union.tolist(); mask_sha = hashlib.sha256(canonical(land)).hexdigest()
        identical = mask_sha == nat["landMaskSha256"]
        man = dict(base_man)
        man.update({"datasetId": f"hycom-gofs31-53x-{wid.lower()}-15m-daily", "version": "step49-daily-1", "sha256": None, "validTimeStartUTC": times[0], "validTimeEndUTC": times[-1], "timeStepSeconds": 86400,
                    "timeMeaning": "UTC-day mean of the eight native 3-hourly frames 00..21Z, labelled 00:00Z of that day (STEP 32 condition B); linear interpolation between daily labels in the runtime exactly as for any time axis",
                    "issuedAtUTC": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "issuedAtMeaning": "derived-fixture-creation (STEP 32 condition B HYCOM_DAILY); not original product publication",
                    "landMaskVersion": f"HYCOM-wet-validity-mask/53X-{wid}-48-frame-union", "landMaskMeaning": f"{int(nan_union.sum())} of {nan_union.size} nodes not finite in all 48 source frames -> landMask=true, u/v null; identical to condition A mask: {identical}",
                    "supportedUse": "STEP 32 temporal forcing test condition B only", "sourceSha256": digest([{"utcDay": d["utcDay"], "sha256": d["sourceFileSha256"]} for d in days]), "sourceSha256Scope": "SHA-256 of the canonical JSON list of the six UTC-day source files",
                    "processingHistory": list(base_man["processingHistory"]) + [{"operation": ALGORITHM, "framesPerUtcDay": 8, "frameHoursUTC": [0, 3, 6, 9, 12, 15, 18, 21], "method": cfg["method"], "weighting": False, "temporalSmoothing": False, "spatialSmoothing": False, "gapFilling": False, "missingFrameReconstruction": False, "filtering": False, "parameterOptimization": False,
                                                                                "labelTimeUTC": "00:00Z", "derivationScript": "tools/research/build_step49_daily.py", "derivationScriptSha256": sha(__file__), "derivationConfigurationSha256": cfg_sha}]})
        grid = {"lon": axes[0], "lat": axes[1], "timeUTC": times, "u": u_daily, "v": v_daily, "landMask": land}; man["sha256"] = digest(grid)
        ds = validate_dataset({"manifest": man, "grid": grid})
        path = out_dir / f"{wid}.hycom15m.daily.dataset.json"; path.write_bytes(canonical(ds) + b"\n")
        r = {"windowId": wid, "status": "DERIVED" if identical else "STEP32_FAIRNESS_MASK_MISMATCH", "derived": True, "algorithm": ALGORITHM, "days": days, "frameTotal": 48, "dailyFrames": len(times), "timeUTC": times, "shape": [len(times), len(axes[1]), len(axes[0])],
             "derived": {"file": str(path.relative_to(ROOT)).replace("\\", "/") if path.is_relative_to(ROOT) else path.name, "fileSha256": sha(path), "gridSha256": man["sha256"], "datasetId": man["datasetId"], "version": man["version"], "valuesCount": len(times) * len(axes[1]) * len(axes[0]) * 2},
             "landMask": {"sha256": mask_sha, "masked": int(nan_union.sum()), "total": int(nan_union.size), "identicalToNative3h": identical, "native3hLandMaskSha256": nat["landMaskSha256"]}, "derivationScriptSha256": sha(__file__), "derivationConfigurationSha256": cfg_sha, "nativeGridSha256": nat.get("gridSha256") or {n: c["gridSha256"] for n, c in nat.get("chunks", {}).items()}}
        records.append(r); print(json.dumps({"window": wid, "status": r["status"], "shape": r["shape"], "masked": r["landMask"]["masked"], "maskIdentical": identical}), flush=True)
        if not identical:
            stop = wid
    doc = {"schemaVersion": "1.0", "ruleId": M["ruleId"], "phase": "B3", "algorithm": ALGORITHM, "configuration": cfg, "configurationSha256": cfg_sha, "dailyConfigurationSource": "STEP 49 bridge of the frozen STEP 32 matrix conditions.B.dailyDerivation (unchanged)", "experimentMatrixSha256": sha(MATRIX), "acquisitionManifestSha256": sha(ACQ), "qualityReportSha256": sha(QC), "derivationScript": {"file": "tools/research/build_step49_daily.py", "sha256": sha(__file__)},
           "windows": records, "derivedCount": sum(1 for r in records if r.get("status") == "DERIVED"), "status": "STEP32_FAIRNESS_MASK_MISMATCH" if stop else "DERIVED", "modelRunCount": 0, "createdAtUTC": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    man_path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": doc["status"], "derived": doc["derivedCount"]}))
    return 0 if doc["status"] == "DERIVED" else 2


if __name__ == "__main__":
    raise SystemExit(main())
