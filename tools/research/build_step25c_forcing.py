"""STEP 25C — normalize the STEP 25B GLORYS12V1 files of the six paired windows into the frozen runtime's JSON grid contract
(isolated reader glorys_reader_step25c.py). Verifies every raw file against the STEP 25B manifest SHA-256, records the wind
dataset and HYCOM baseline references (SHA-verified) per window, writes data/research/step25c/forcing/*.dataset.json
(gitignored) and docs/research/step25c-glorys-forcing-manifest.json. No model run."""
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/research"))
import glorys_reader_step25c as reader  # noqa: E402

PROTO = ROOT / "docs/research/step25c-test02-protocol.json"
PREREG = ROOT / "docs/research/step25c-preregistration.json"
M25B = ROOT / "docs/research/step25b-glorys-acquisition-manifest.json"
OUT = ROOT / "data/research/step25c/forcing"
MANIFEST = ROOT / "docs/research/step25c-glorys-forcing-manifest.json"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main():
    proto = load(PROTO); prereg = load(PREREG); m25b = load(M25B)
    if sha(PROTO) != prereg["protocolSha256"] or prereg["status"] != "PREREGISTRATION LOCKED":
        raise SystemExit("STEP25C_BLOCKED_IMMUTABILITY: protocol/preregistration")
    if MANIFEST.exists() or OUT.exists():
        raise SystemExit("STEP25C_BLOCKED: forcing outputs already exist; no overwrite")
    if sha(M25B) != proto["inputs"]["step25bManifestSha256"]:
        raise SystemExit("STEP25C_BLOCKED_IMMUTABILITY: STEP 25B manifest")
    OUT.mkdir(parents=True, exist_ok=True)
    depth = proto["modelB"]["depthMeters"]; records = []
    for w in proto["windows"]:
        b = next(x for x in m25b["windows"] if x["windowId"] == w["windowId"])
        raw = ROOT / b["file"]
        if b["status"] != "ok" or sha(raw) != b["sha256"] or raw.stat().st_size != b["bytes"]:
            raise SystemExit(f"STEP25C_BLOCKED_IMMUTABILITY: raw GLORYS {w['windowId']}")
        for ref in (w["wind"], w["hycomBaseline"]["0.002"], w["hycomBaseline"]["0"]):
            if sha(ROOT / ref["file"]) != ref["sha256"]:
                raise SystemExit(f"STEP25C_BLOCKED_IMMUTABILITY: reference {ref['file']}")
        request = {"requestedAtUTC": b["requestedAtUTC"], "requestedTime": b["requestedTime"], "requestedBox": b["requestedBox"], "requestedDepthMeters": b["requestedDepthMeters"], "command": b["command"], "toolbox": m25b["tool"]}
        dataset, source, meta = reader.build_dataset(f"glorys12v1-15.81m-{w['windowId']}", "step25c-1", raw, depth, w["windowId"], request)
        path = OUT / f"{w['windowId']}.glorys15.81m.dataset.json"
        path.write_bytes(json.dumps(dataset, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))
        g = dataset["grid"]; box = w["computationArea"]
        inside = g["lon"][0] <= box["west"] and box["east"] <= g["lon"][-1] and g["lat"][0] <= box["south"] and box["north"] <= g["lat"][-1]
        covers = g["timeUTC"][0] <= w["t0"] and w["end"] <= g["timeUTC"][-1]
        if not (inside and covers):
            raise SystemExit(f"STEP25C_BLOCKED_COVERAGE: {w['windowId']}")
        records.append({"windowId": w["windowId"], "role": w["role"], "t0": w["t0"], "end": w["end"], "computationArea": box, "rawFile": b["file"], "rawSha256": b["sha256"], "rawBytes": b["bytes"],
                        "normalized": {"file": str(path.relative_to(ROOT)).replace("\\", "/"), "fileSha256": sha(path), "gridSha256": dataset["manifest"]["sha256"], "sourceSha256": dataset["manifest"]["sourceSha256"],
                                       "datasetId": dataset["manifest"]["datasetId"], "version": dataset["manifest"]["version"], "readerVersion": reader.READER, "shape": meta["shape"], "timeUTC": g["timeUTC"],
                                       "timeStepSeconds": 86400, "surfaceDepthMeters": depth, "depthLevelMeters": meta["depthLevelMeters"], "maxAbsoluteCoordinateCorrectionDegrees": meta["corrections"], "maskedNodes": meta["maskedNodes"],
                                       "uRange": meta["uRange"], "vRange": meta["vRange"], "valuesCount": meta["shape"][0] * meta["shape"][1] * meta["shape"][2] * 2},
                        "coverage": {"areaInsideGrid": inside, "timeBracketsWindow": covers, "gapInterpolated": False, "substitution": False},
                        "wind": w["wind"], "hycomBaseline": w["hycomBaseline"], "status": "NORMALIZED"})
        print(json.dumps({"window": w["windowId"], "shape": meta["shape"], "gridSha256": dataset["manifest"]["sha256"][:16]}), flush=True)
    manifest = {"schemaVersion": "1.0", "ruleId": proto["ruleId"], "protocolSha256": sha(PROTO), "step25bManifestSha256": sha(M25B), "reader": {"file": "tools/research/glorys_reader_step25c.py", "sha256": sha(ROOT / "tools/research/glorys_reader_step25c.py"), "version": reader.READER, "isolatedFromRuntime": True},
                "modelB": proto["modelB"], "windows": records, "windowCount": len(records), "MODEL_RUN": "NOT_PERFORMED_IN_THIS_TOOL", "modelRunCount": 0, "createdAtUTC": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "FORCING_NORMALIZED", "windows": len(records)})); return 0


if __name__ == "__main__":
    raise SystemExit(main())
