"""STEP 20 B-4.1 — SEGMENTED-RUN EQUIVALENCE GATE (B-3 §3.5). KE-1 (STEP 17 forcing, chunked exactly as B-3 §3) is integrated as two
segments for alpha 0 and alpha 0.002; the merged trajectories must be BITWISE identical to the STEP 20 calibration single runs
(result-array digest and exported CSV). Any difference → HOLDOUT_BLOCKED_SEGMENTATION. Calibration data only; no holdout access."""
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps")); sys.path.insert(0, str(ROOT / "tools/research"))
import run_step18b_model as r18  # noqa: E402
import build_step20_chunked_forcing as chunker  # noqa: E402
import step20_segmented as seg  # noqa: E402
from research_runtime import models_v2  # noqa: E402
from research_runtime.datasets import validate_dataset  # noqa: E402
from research_runtime.wind import validate_wind_dataset  # noqa: E402

CAL = ROOT / "docs/research/step20-calibration-manifest.json"
CAL_SHA = "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498"
FM17 = ROOT / "docs/research/step17-forcing-manifest.json"
FM17_SHA = "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86"
B3RULE = ROOT / "docs/research/step20-b3-forcing-resolution-selection-rule.json"
B3RULE_SHA = "87f7750bd3f95089402da565a8801677955f2e078c8616905752bef9e17e9126"
OUT = ROOT / "docs/research/step20-b4-segmentation-gate.json"
GATE_DATA = ROOT / "data/research/step20/holdout/gate"


def main():
    for path, expected in ((CAL, CAL_SHA), (FM17, FM17_SHA), (B3RULE, B3RULE_SHA)):
        if r18.sha(path) != expected:
            raise SystemExit(f"GATE_BLOCKED_IMMUTABILITY: {path.name}")
    cal = r18.load(CAL); fm17 = r18.load(FM17); rule = r18.load(B3RULE); p18b = r18.load(ROOT / "docs/research/step18b-preregistration.json")
    unit17 = next(u for u in fm17["runUnits"] if u["windowId"] == "KE-1"); unit18b = next(u for u in p18b["runUnits"] if u["windowId"] == "KE-1")
    cohort = r18.load(ROOT / "docs/research/cohort-step16.json")
    points = r18.release_points(cohort, unit18b)
    wind = validate_wind_dataset(r18.load(ROOT / unit17["ncep"]["normalized"]["file"]))
    chunker.DATA = ROOT / "data/research/step17"
    chunks, _ = chunker.build_chunks("KE-1", "gate-ke-1", unit17["hycom"]["files"], unit17["oceanDomain"], datetime.strptime(unit17["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc))
    datasets = {name: validate_dataset(ds) for name, (ds, _) in chunks.items()}
    GATE_DATA.mkdir(parents=True, exist_ok=True)
    gate = {"schemaVersion": "1.0", "gate": "STEP 20 B-3 §3.5 segmented-run equivalence", "unit": "KE-1 (calibration; STEP 17 forcing chunked as B-3 §3)", "calibrationManifestSha256": CAL_SHA, "b3RuleSha256": B3RULE_SHA,
            "chunks": {n: {"datasetId": ds["manifest"]["datasetId"], "gridSha256": ds["manifest"]["sha256"], "frames": len(ds["grid"]["timeUTC"])} for n, ds in datasets.items()}, "tests": [], "createdAtUTC": r18.utc_now()}
    all_ok = True
    for alpha, text in ((0.0, "0"), (0.002, "0.002")):
        ref = next(r for r in cal["runs"] if r["windowId"] == "KE-1" and float(r["alpha"]) == alpha)
        unit = {**unit18b, "points": points}
        result, segments = seg.run_segmented(p18b, unit, datasets, wind, alpha, ref["runId"], models_v2, "model-protocol-step20-generalization-parameter-validation")
        csv_bytes, rows = r18.export_rows(ref["runId"], text, [d for d, *_ in points], result, unit18b["computationArea"], [])
        ref_csv = (ROOT / ref["trajectoriesFile"]).read_bytes()
        ref_result = r18.load(ROOT / ref["resultFile"])
        digest_ok = result["provenance"]["resultArraySha256"] == ref["resultArraySha256"]
        csv_ok = csv_bytes == ref_csv
        traj_ok = result["trajectories"] == ref_result["trajectories"]
        (GATE_DATA / f"KE-1.alpha{text}.segmented.result.json").write_bytes(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=1).encode("utf-8"))
        (GATE_DATA / f"KE-1.alpha{text}.segmented.trajectories.csv").write_bytes(csv_bytes)
        test = {"alpha": alpha, "calibrationRunId": ref["runId"], "expectedResultArraySha256": ref["resultArraySha256"], "segmentedResultArraySha256": result["provenance"]["resultArraySha256"], "resultArrayIdentical": digest_ok,
                "trajectoriesListIdentical": traj_ok, "expectedTrajectoriesSha256": ref["trajectoriesSha256"], "segmentedTrajectoriesSha256": hashlib.sha256(csv_bytes).hexdigest(), "csvBitwiseIdentical": csv_ok,
                "samplesCompared": sum(len(t["samples"]) for t in result["trajectories"]), "continuedParticles": result["provenance"]["segmentation"]["continuedParticles"],
                "segments": result["provenance"]["segmentation"]["segments"], "pass": digest_ok and csv_ok and traj_ok}
        all_ok &= test["pass"]; gate["tests"].append(test)
        print(json.dumps({"alpha": alpha, "resultArrayIdentical": digest_ok, "csvBitwiseIdentical": csv_ok, "trajectoriesListIdentical": traj_ok}), flush=True)
    gate["status"] = "SEGMENTED_EQUIVALENCE_PASS" if all_ok else "SEGMENTED_EQUIVALENCE_FAIL"
    gate["gitHead"] = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    OUT.write_text(json.dumps(gate, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"gate": gate["status"], "file": str(OUT.relative_to(ROOT)), "sha256": r18.sha(OUT)}), flush=True)
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
