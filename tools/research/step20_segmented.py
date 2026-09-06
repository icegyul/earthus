"""STEP 20 B-3 §3.3 segmented integration: ONE continuous t0 → t0+72h trajectory computed as two runtime calls on the two temporal
chunks (segment 1 = t0..t0+36h on chunk A; segment 2 = t0+36h..t0+72h on chunk B, released from the segment-1 end positions at full
float64 precision). The runtime (models_v2, unchanged) is called exactly as for a single run; nothing else changes.
Merging rule: segment-1 samples (its final "COMPLETED" sample at t0+36h becomes "ACTIVE" for particles that continue) + segment-2 samples
excluding the release sample at t0+36h (which must equal the segment-1 end sample exactly). Particles terminated in segment 1 keep their
terminal status and are not released in segment 2. The merged trajectories list has the single-run schema, so digest(trajectories) is
directly comparable with a single-run resultArraySha256."""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps")); sys.path.insert(0, str(ROOT / "tools/research"))
from research_runtime.datasets import digest  # noqa: E402
import run_step18b_model as r18  # noqa: E402

SEGMENT_SECONDS = 36 * 3600


def _utc(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def run_segmented(p18b, unit, datasets, wind, alpha, run_id, models_v2, validation_plan_id):
    """unit: dict with windowId, t0, end, computationArea; points: list of (drifterId, lon, lat) sorted by id. datasets: {"A": ds, "B": ds}.
    Returns (merged_result, [(segment_name, spec, result), ...])."""
    points = unit["points"]; t0 = _utc(unit["t0"]); t36 = (t0 + timedelta(seconds=SEGMENT_SECONDS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    # ---- segment 1 ----
    spec1 = r18.build_spec(p18b, {**unit, "t0": unit["t0"]}, datasets["A"], wind, {"alpha": alpha}, points)
    spec1.update({"validationPlanId": validation_plan_id, "durationSeconds": SEGMENT_SECONDS})
    pre1 = models_v2.preflight(spec1, datasets["A"], wind)
    if not pre1["ok"]:
        raise r18.Stop("MODEL_RUN_BLOCKED_PREFLIGHT: segment 1: " + "; ".join(pre1["errors"]))
    res1 = models_v2.run_experiment(spec1, datasets["A"], wind, run_id=run_id + "-seg1")
    # ---- segment 2: continue every particle that reached t0+36h ----
    cont = [i for i, tr in enumerate(res1["trajectories"]) if tr["finalStatus"] == "COMPLETED"]
    for i in cont:
        assert res1["trajectories"][i]["samples"][-1]["timeUTC"] == t36
    points2 = [(points[i][0], res1["trajectories"][i]["samples"][-1]["lon"], res1["trajectories"][i]["samples"][-1]["lat"]) for i in cont]
    segments = [("seg1", spec1, res1)]
    res2 = None
    if points2:
        spec2 = r18.build_spec(p18b, {**unit, "t0": t36}, datasets["B"], wind, {"alpha": alpha}, points2)
        spec2.update({"validationPlanId": validation_plan_id, "durationSeconds": SEGMENT_SECONDS, "startTimeUTC": t36})
        pre2 = models_v2.preflight(spec2, datasets["B"], wind)
        if not pre2["ok"]:
            raise r18.Stop("MODEL_RUN_BLOCKED_PREFLIGHT: segment 2: " + "; ".join(pre2["errors"]))
        res2 = models_v2.run_experiment(spec2, datasets["B"], wind, run_id=run_id + "-seg2")
        segments.append(("seg2", spec2, res2))
    # ---- merge ----
    merged = []
    for i, tr in enumerate(res1["trajectories"]):
        samples = [dict(s) for s in tr["samples"]]; final = tr["finalStatus"]
        if i in cont:
            j = cont.index(i); tr2 = res2["trajectories"][j]
            first = tr2["samples"][0]
            if (first["timeUTC"], first["lon"], first["lat"]) != (samples[-1]["timeUTC"], samples[-1]["lon"], samples[-1]["lat"]):
                raise r18.Stop("SEGMENT_BOUNDARY_MISMATCH: segment-2 release sample differs from segment-1 end sample")
            samples[-1]["status"] = "ACTIVE"
            samples += [dict(s) for s in tr2["samples"][1:]]; final = tr2["finalStatus"]
        merged.append({"particleId": tr["particleId"], "samples": samples, "finalStatus": final})
    counts = {}
    for tr in merged:
        counts[tr["finalStatus"]] = counts.get(tr["finalStatus"], 0) + 1
    prov = dict(res1["provenance"])
    prov.update({"runId": run_id, "segmentation": {"rule": "STEP 20 B-3 §3.3", "splitUTC": t36, "segments": [{"name": n, "runId": r["provenance"]["runId"], "specSha256": r["provenance"]["specSha256"], "datasetId": r["provenance"]["datasetId"],
                                                                                                      "datasetSha256": r["provenance"]["datasetSha256"], "resultArraySha256": r["provenance"]["resultArraySha256"]} for n, s, r in segments],
                                                   "continuedParticles": len(cont), "terminatedInSegment1": len(points) - len(cont)},
                 "specSha256": None, "datasetId": [r["provenance"]["datasetId"] for _, _, r in segments], "datasetSha256": [r["provenance"]["datasetSha256"] for _, _, r in segments],
                 "resultArraySha256": digest(merged), "wallSeconds": sum(r["provenance"]["wallSeconds"] for _, _, r in segments)})
    result = {"schemaVersion": "1.0", "qualityStatus": "COMPLETE" if counts.get("COMPLETED", 0) == len(points) else "PARTIAL", "trajectories": merged,
              "summary": {"particleCount": len(points), "statusCounts": {k: counts.get(k, 0) for k in ("ACTIVE", "STRANDED", "OUT_OF_DOMAIN", "MISSING_FORCING", "COMPLETED")}, "durationSeconds": 259200,
                          "boundaryTimeResolutionSeconds": max(r["summary"]["boundaryTimeResolutionSeconds"] for _, _, r in segments), "observationValidation": "NOT_PERFORMED", "segmented": True},
              "provenance": prov}
    return result, segments
