"""STEP 20 B-6.1 — SEGMENTATION GATE judged by the LOCKED B-5 numerical equivalence criterion (c395a098).
Re-executes the KE-1 calibration segmented run (STEP 17 forcing chunked per B-3 §3; unchanged runtime) for alpha 0 and 0.002 and
compares against the STEP 20 calibration single runs: A timestamps, B particle IDs, C ordering, D status, E forcing values,
F landMask exact; G |dlon|,|dlat| <= 1e-12 deg per sample; H/I sample counts; J endpoint separation at 24/48/72 h <= 1e-6 km;
alpha 0 additionally bitwise identical. Calibration data only; no holdout access; no fallback."""
import hashlib
import json
import math
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps")); sys.path.insert(0, str(ROOT / "tools/research"))
import run_step18b_model as r18  # noqa: E402
import build_step20_chunked_forcing as chunker  # noqa: E402
import step20_segmented as seg  # noqa: E402
from research_runtime import models_v2  # noqa: E402
from research_runtime.datasets import validate_dataset  # noqa: E402
from research_runtime.wind import validate_wind_dataset  # noqa: E402

B5 = ROOT / "docs/research/step20-b5-numerical-equivalence-selection-rule.json"
B5_SHA = "dd3916b840b921165771c022e29db5b72b3a26769775503044fef5c004cc7595"
CAL = ROOT / "docs/research/step20-calibration-manifest.json"
CAL_SHA = "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498"
FM17 = ROOT / "docs/research/step17-forcing-manifest.json"
FM17_SHA = "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86"
OUT = ROOT / "docs/research/step20-b6-segmentation-gate.json"
GATE_DATA = ROOT / "data/research/step20/holdout/gate-b6"
RADIUS_M = 6371008.8


def hav_km(a, b):
    p1, p2 = math.radians(a[1]), math.radians(b[1]); h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b[0] - a[0]) / 2) ** 2
    return 2 * RADIUS_M * math.asin(math.sqrt(h)) / 1000


def main():
    for path, expected in ((B5, B5_SHA), (CAL, CAL_SHA), (FM17, FM17_SHA)):
        if r18.sha(path) != expected:
            raise SystemExit(f"GATE_BLOCKED_IMMUTABILITY: {path.name}")
    b5 = r18.load(B5); crit = b5["criterion"]
    tol = crit["level2Positional"]["absoluteToleranceDegrees"]; jkm = crit["endpointImpact"]["conditionJ"]["maxSeparationKm"]
    cal = r18.load(CAL); fm17 = r18.load(FM17); p18b = r18.load(ROOT / "docs/research/step18b-preregistration.json")
    unit17 = next(u for u in fm17["runUnits"] if u["windowId"] == "KE-1"); unit18b = next(u for u in p18b["runUnits"] if u["windowId"] == "KE-1")
    points = r18.release_points(r18.load(ROOT / "docs/research/cohort-step16.json"), unit18b)
    wind = validate_wind_dataset(r18.load(ROOT / unit17["ncep"]["normalized"]["file"]))
    full = validate_dataset(r18.load(ROOT / unit17["hycom"]["normalized"]["file"]))
    chunker.DATA = ROOT / "data/research/step17"
    t0 = datetime.strptime(unit17["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    chunks, _ = chunker.build_chunks("KE-1", "gate-ke-1", unit17["hycom"]["files"], unit17["oceanDomain"], t0)
    # E/F: forcing values and landMask exact vs the single-reader dataset; chunk overlap exact
    eqv = chunker.equivalence(chunks, full)
    a, b = chunks["A"][0]["grid"], chunks["B"][0]["grid"]; ia = {t: i for i, t in enumerate(a["timeUTC"])}
    overlap_ok = all(a["u"][ia[t]] == b["u"][b["timeUTC"].index(t)] and a["v"][ia[t]] == b["v"][b["timeUTC"].index(t)] for t in b["timeUTC"] if t in ia) and a["landMask"] == b["landMask"] == full["grid"]["landMask"]
    datasets = {n: validate_dataset(ds) for n, (ds, _) in chunks.items()}
    GATE_DATA.mkdir(parents=True, exist_ok=True)
    horizons = {h: (t0 + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ") for h in (24, 48, 72)}
    gate = {"schemaVersion": "1.0", "gate": "STEP 20 B-6.1 segmentation gate under B-5 criterion", "b5SelectionRuleSha256": B5_SHA, "criterion": {"positionToleranceDeg": tol, "endpointMaxKm": jkm, "alphaZeroBitwise": True},
            "calibrationManifestSha256": CAL_SHA, "forcingEquivalence": {"E_forcingValuesExact": eqv["framesCompared"] == eqv["framesEqual"] and eqv["axesEqual"], "framesCompared": eqv["framesCompared"], "framesEqual": eqv["framesEqual"], "F_landMaskExact": eqv["landMaskEqual"] and overlap_ok, "chunkOverlapExact": overlap_ok},
            "tests": [], "createdAtUTC": r18.utc_now()}
    all_ok = gate["forcingEquivalence"]["E_forcingValuesExact"] and gate["forcingEquivalence"]["F_landMaskExact"]
    for alpha, text in ((0.0, "0"), (0.002, "0.002")):
        ref = next(r for r in cal["runs"] if r["windowId"] == "KE-1" and float(r["alpha"]) == alpha)
        result, segments = seg.run_segmented(p18b, {**unit18b, "points": points}, datasets, wind, alpha, ref["runId"], models_v2, "model-protocol-step20-generalization-parameter-validation")
        reference = r18.load(ROOT / ref["resultFile"])
        csv_bytes, _ = r18.export_rows(ref["runId"], text, [d for d, *_ in points], result, unit18b["computationArea"], [])
        (GATE_DATA / f"KE-1.alpha{text}.segmented.result.json").write_bytes(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=1).encode("utf-8"))
        (GATE_DATA / f"KE-1.alpha{text}.segmented.trajectories.csv").write_bytes(csv_bytes)
        st, rt = result["trajectories"], reference["trajectories"]
        cond = {"A_timestamps": True, "B_particleIds": len(st) == len(rt) and all(x["particleId"] == y["particleId"] for x, y in zip(st, rt)), "C_ordering": [x["particleId"] for x in st] == [y["particleId"] for y in rt],
                "D_status": True, "H_noMissingSamples": True, "I_noExtraSamples": True, "G_positions": True, "J_endpoints": True}
        maxd = 0.0; ndiff = 0; nsamp = 0; ends = {h: 0.0 for h in horizons}; max_dlon = 0.0; max_dlat = 0.0
        for x, y in zip(st, rt):
            cond["D_status"] &= x["finalStatus"] == y["finalStatus"]
            cond["H_noMissingSamples"] &= len(x["samples"]) >= len(y["samples"]); cond["I_noExtraSamples"] &= len(x["samples"]) <= len(y["samples"])
            for sx, sy in zip(x["samples"], y["samples"]):
                nsamp += 1; cond["A_timestamps"] &= sx["timeUTC"] == sy["timeUTC"]; cond["D_status"] &= sx["status"] == sy["status"]
                dlon, dlat = abs(sx["lon"] - sy["lon"]), abs(sx["lat"] - sy["lat"]); max_dlon = max(max_dlon, dlon); max_dlat = max(max_dlat, dlat); maxd = max(maxd, dlon, dlat); ndiff += (dlon > 0 or dlat > 0)
                cond["G_positions"] &= dlon <= tol and dlat <= tol
                for h, ts in horizons.items():
                    if sx["timeUTC"] == ts:
                        ends[h] = max(ends[h], hav_km((sx["lon"], sx["lat"]), (sy["lon"], sy["lat"])))
        cond["J_endpoints"] = all(v <= jkm for v in ends.values())
        release_ok = all(abs(x["samples"][0]["lon"] - y["samples"][0]["lon"]) == 0 and abs(x["samples"][0]["lat"] - y["samples"][0]["lat"]) == 0 for x, y in zip(st, rt))
        bitwise = result["provenance"]["resultArraySha256"] == ref["resultArraySha256"]
        test = {"alpha": alpha, "calibrationRunId": ref["runId"], "expectedResultArraySha256": ref["resultArraySha256"], "segmentedResultArraySha256": result["provenance"]["resultArraySha256"], "bitwiseIdentical": bitwise,
                "conditions": cond, "releaseCoordinatesExact": release_ok, "samplesCompared": nsamp, "differingSamples": ndiff, "maxAbsDeltaLonDeg": max_dlon, "maxAbsDeltaLatDeg": max_dlat, "maxAbsDeltaDeg": maxd,
                "endpointMaxSeparationKm": {f"{h}h": v for h, v in ends.items()}, "csvSha256": hashlib.sha256(csv_bytes).hexdigest(), "csvBitwiseIdentical": csv_bytes == (ROOT / ref["trajectoriesFile"]).read_bytes(),
                "segments": result["provenance"]["segmentation"]["segments"], "continuedParticles": result["provenance"]["segmentation"]["continuedParticles"]}
        test["pass"] = all(cond.values()) and release_ok and (bitwise if alpha == 0.0 else True)
        all_ok &= test["pass"]; gate["tests"].append(test)
        print(json.dumps({"alpha": alpha, "bitwise": bitwise, "pass": test["pass"], "maxAbsDeltaDeg": maxd, "differing": ndiff, "endpointsKm": test["endpointMaxSeparationKm"], "conditions": cond}), flush=True)
    gate["status"] = "SEGMENTATION_EQUIVALENCE_PASS" if all_ok else "SEGMENTATION_EQUIVALENCE_FAIL"
    gate["gitHead"] = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    OUT.write_text(json.dumps(gate, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"gate": gate["status"], "file": str(OUT.relative_to(ROOT)), "sha256": r18.sha(OUT)}), flush=True)
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
