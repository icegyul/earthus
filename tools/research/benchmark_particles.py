"""Measure wall time of the fixed HYCOM fixture at larger particle counts.

Numbers are for the machine that ran this script only. Run from services/research-runtime
with `.deps` on PYTHONPATH:  python ../../tools/research/benchmark_particles.py
"""
import json
import platform
import sys
import time
from pathlib import Path

from research_runtime.datasets import validate_dataset
from research_runtime.models import preflight, run_experiment

ROOT = Path(__file__).resolve().parents[2]
EXAMPLES = ROOT / "services/research-runtime/examples"
OUT = ROOT / "docs/research/evidence/benchmark-particles.json"


def grid_points(area, n):
    """n points on a regular lattice strictly inside the area (release must stay in the area)."""
    import math
    side = math.ceil(math.sqrt(n))
    pts = []
    for i in range(side):
        for j in range(side):
            if len(pts) >= n:
                break
            pts.append({"lon": round(area["west"] + 0.2 + (area["east"] - area["west"] - 0.4) * (j + 0.5) / side, 4),
                        "lat": round(area["south"] + 0.2 + (area["north"] - area["south"] - 0.4) * (i + 0.5) / side, 4)})
    return pts


def main():
    dataset = validate_dataset(json.loads((EXAMPLES / "hycom-2015-atlantic.dataset.json").read_text(encoding="utf-8")))
    base = json.loads((EXAMPLES / "hycom-2015-atlantic.experiment.json").read_text(encoding="utf-8"))
    cases = [(1000, 259200, 300), (2000, 259200, 300), (10000, 86400, 1200)]
    rows = []
    for count, duration, step in cases:
        spec = dict(base)
        spec.update({"particleCount": count, "durationSeconds": duration, "integrationStepSeconds": step,
                     "releaseDefinition": {"type": "points", "points": grid_points(base["area"], count)}})
        check = preflight(spec, dataset)
        row = {"particleCount": count, "durationSeconds": duration, "integrationStepSeconds": step,
               "preflightOk": check["ok"], "preflightErrors": check["errors"]}
        if check["ok"]:
            t0 = time.perf_counter()
            result = run_experiment(spec, dataset)
            row.update({"wallSeconds": round(time.perf_counter() - t0, 2), "qualityStatus": result["qualityStatus"],
                        "statusCounts": result["summary"].get("statusCounts"),
                        "particleSteps": count * duration // step,
                        "secondsPerParticleStep": round((time.perf_counter() - t0) / (count * duration // step), 6)})
        rows.append(row)
        print(json.dumps(row), flush=True)
    OUT.write_text(json.dumps({"measuredAtUTC": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                               "machine": {"platform": platform.platform(), "python": sys.version.split()[0], "processor": platform.processor()},
                               "engine": "OceanParcels 3.1.4 ScipyParticle (no JIT)", "dataset": dataset["manifest"]["datasetId"],
                               "note": "Wall time on this machine only; not a guarantee. 10,000 particles x 72 h at 300 s exceeds the declared 2,000,000 particle-step budget and was not run.",
                               "cases": rows}, indent=2) + "\n", encoding="utf-8")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
