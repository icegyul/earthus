"""STEP 27 Phase B — normalize the D05 / D10 / D20 native-level GLORYS files (STEP 27B / 27C, SHA-verified) into the frozen
runtime's JSON grid contract with the locked STEP 25C reader (glorys_reader_step25c.build_dataset, depth = actual native level).
D15 is NOT re-normalized: it is the STEP 25C Condition C forcing (SHA-locked). Only the manifest wording that the locked reader
hard-codes for 15.81 m (datasetId, depthMeaning) is rewritten to state the actual level; grid values and the grid SHA are untouched
(re-validated after the rewrite). Writes data/research/step27/forcing/<D>/<wid>.glorys.dataset.json (gitignored) and
docs/research/step27-depth-forcing-manifest.json. No model run."""
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/research"))
import glorys_reader_step25c as reader  # noqa: E402
from research_runtime.datasets import validate_dataset  # noqa: E402

RULE = ROOT / "docs/research/step27-depth-rule.json"
PBLOCK = ROOT / "docs/research/step27-phase-b-preregistration.json"
M27B = ROOT / "docs/research/step27-depth-acquisition-manifest.json"
M27C = ROOT / "docs/research/step27c-d20-acquisition-manifest.json"
F25C = ROOT / "docs/research/step25c-glorys-forcing-manifest.json"
OUT = ROOT / "data/research/step27/forcing"
MANIFEST = ROOT / "docs/research/step27-depth-forcing-manifest.json"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main():
    R = load(RULE); pb = load(PBLOCK); m27b = load(M27B); m27c = load(M27C); f25c = load(F25C)
    if sha(RULE) != pb["ruleSha256"] or pb["status"] != "PREREGISTRATION LOCKED":
        raise SystemExit("STEP27_BLOCKED_IMMUTABILITY: rule/preregistration")
    if MANIFEST.exists() or OUT.exists():
        raise SystemExit("STEP27_BLOCKED: forcing outputs already exist; no overwrite")
    sources = {"D05": next(d for d in m27b["depths"] if d["id"] == "D05"), "D10": next(d for d in m27b["depths"] if d["id"] == "D10"), "D20": m27c["depths"][0]}
    levels = pb["depths"]; records = []
    for did in ("D05", "D10", "D15", "D20"):
        level = levels[did]["nativeLevelMeters"]
        for w in pb["windows"]:
            if did == "D15":
                fw = next(x for x in f25c["windows"] if x["windowId"] == w["windowId"]); path = ROOT / fw["normalized"]["file"]
                if sha(path) != fw["normalized"]["fileSha256"]:
                    raise SystemExit(f"STEP27_BLOCKED_IMMUTABILITY: D15 forcing {w['windowId']}")
                ds = validate_dataset(load(path))
                records.append({"depth": did, "windowId": w["windowId"], "nativeLevelMeters": ds["manifest"]["surfaceDepthMeters"], "rawFile": fw["rawSha256"] and next(x for x in load(ROOT / "docs/research/step25b-glorys-acquisition-manifest.json")["windows"] if x["windowId"] == w["windowId"])["file"], "rawSha256": fw["rawSha256"],
                                "normalized": {"file": fw["normalized"]["file"], "fileSha256": fw["normalized"]["fileSha256"], "gridSha256": ds["manifest"]["sha256"], "shape": [len(ds["grid"]["timeUTC"]), len(ds["grid"]["lat"]), len(ds["grid"]["lon"])], "timeUTC": ds["grid"]["timeUTC"]}, "source": "STEP 25C Condition C forcing (not re-normalized)", "status": "REUSED"})
                continue
            src = next(x for x in sources[did]["windows"] if x["windowId"] == w["windowId"]); raw = ROOT / src["file"]
            if src["status"] != "ok" or sha(raw) != src["sha256"] or abs(src["returnedDepthLevelsMeters"][0] - level) > 0.01:
                raise SystemExit(f"STEP27_BLOCKED_IMMUTABILITY: raw {did} {w['windowId']}")
            request = {"requestedAtUTC": src["requestedAtUTC"], "requestedTime": src["requestedTime"], "requestedBox": src["requestedBox"], "requestedDepthTargetMeters": src["requestedDepthTargetMeters"], "command": src["command"]}
            dataset, source, meta = reader.build_dataset(f"glorys12v1-{did}-{level:.6f}m-{w['windowId']}", "step27-1", raw, src["returnedDepthLevelsMeters"][0], w["windowId"], request)
            man = dataset["manifest"]; man["datasetId"] = f"glorys12v1-{did}-{level:.6f}m-{w['windowId']}"
            man["depthMeaning"] = f"single native GLORYS level {src['returnedDepthLevelsMeters'][0]} m (STEP 27 condition {did}, target {levels[did]['targetMeters']} m label only); no vertical interpolation, no depth search"
            dataset = validate_dataset({"manifest": man, "grid": dataset["grid"]})
            out_dir = OUT / did; out_dir.mkdir(parents=True, exist_ok=True); path = out_dir / f"{w['windowId']}.glorys.dataset.json"
            path.write_bytes(json.dumps(dataset, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))
            g = dataset["grid"]; box = w["computationArea"]
            if not (g["lon"][0] <= box["west"] and box["east"] <= g["lon"][-1] and g["lat"][0] <= box["south"] and box["north"] <= g["lat"][-1] and g["timeUTC"][0] <= w["t0"] and w["end"] <= g["timeUTC"][-1]):
                raise SystemExit(f"STEP27_BLOCKED_COVERAGE: {did} {w['windowId']}")
            records.append({"depth": did, "windowId": w["windowId"], "nativeLevelMeters": man["surfaceDepthMeters"], "rawFile": src["file"], "rawSha256": src["sha256"], "normalized": {"file": str(path.relative_to(ROOT)).replace("\\", "/"), "fileSha256": sha(path), "gridSha256": man["sha256"], "shape": meta["shape"], "timeUTC": g["timeUTC"], "maskedNodes": meta["maskedNodes"], "maxAbsoluteCoordinateCorrectionDegrees": meta["corrections"]},
                            "source": "STEP 27B" if did != "D20" else "STEP 27C", "status": "NORMALIZED"})
            print(json.dumps({"depth": did, "window": w["windowId"], "level": man["surfaceDepthMeters"], "shape": meta["shape"]}), flush=True)
    d15 = [r for r in records if r["depth"] == "D15"]
    same_grid = all(r["normalized"]["shape"][1:] == d["normalized"]["shape"][1:] and r["normalized"]["timeUTC"] == d["normalized"]["timeUTC"] for d in d15 for r in records if r["windowId"] == d["windowId"])
    manifest = {"schemaVersion": "1.0", "ruleId": R["ruleId"], "ruleSha256": sha(RULE), "phaseBPreregistrationSha256": sha(PBLOCK), "reader": {"file": "tools/research/glorys_reader_step25c.py", "sha256": sha(ROOT / "tools/research/glorys_reader_step25c.py"), "version": reader.READER}, "depths": levels, "records": records, "sameGridAndFramesAcrossDepths": same_grid, "modelRunCount": 0, "createdAtUTC": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "FORCING_NORMALIZED", "records": len(records), "sameGridAndFrames": same_grid})); return 0


if __name__ == "__main__":
    raise SystemExit(main())
