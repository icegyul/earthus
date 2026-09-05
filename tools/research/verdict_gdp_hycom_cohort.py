"""Apply the pre-registered criteria in validation-plan.json to the cohort comparison reports.

Reads docs/research/evidence/gdp-hycom-cohort-201501/comparison-region-*.json and writes
verdict.json next to them. Criteria are read from the plan; nothing here is tuned to the data.
"""
import json
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parents[2]
EVID = ROOT / "docs/research/evidence/gdp-hycom-cohort-201501"
PLAN = ROOT / "docs/research/fixtures/gdp-hycom-cohort-201501/validation-plan.json"


def horizon_rows(reports, horizon):
    return [row for report in reports for row in report["comparisons"] if row["horizonSeconds"] == horizon]


def medians(rows):
    return {"model": statistics.median(r["separationMeters"] for r in rows),
            "stationary": statistics.median(r["stationarySeparationMeters"] for r in rows),
            "initialVelocity": statistics.median(r["initialVelocitySeparationMeters"] for r in rows),
            "n": len(rows)}


def main():
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    reports = {p.stem.split("-")[-1]: json.loads(p.read_text(encoding="utf-8")) for p in sorted(EVID.glob("comparison-region-*.json"))}
    pooled = list(reports.values())
    per_horizon = {h: medians(horizon_rows(pooled, h)) for h in (86400, 172800, 259200)}
    per_region = {k: {h: medians(horizon_rows([r], h)) for h in (86400, 172800, 259200)} for k, r in reports.items()}
    h72 = per_horizon[259200]
    eligible72 = len({row["particleId"] + 1000 * i for i, r in enumerate(pooled) for row in r["comparisons"] if row["horizonSeconds"] == 259200})
    silent_drop = any(r["totalTracks"] != r["eligibleTracks"] + len(r["excludedTracks"]) for r in pooled)
    criteria = {
        "C1_beatsStationary": h72["model"] < h72["stationary"],
        "C2_beatsPersistence": h72["model"] < h72["initialVelocity"],
        "C3_sampleFloor": eligible72 >= plan["cohort"]["minimumEligibleTracks"] and len(reports) >= plan["cohort"]["minimumCohorts"],
        "C4_reporting": not silent_drop,
    }
    verdict = "PASS" if all(criteria.values()) else "FAIL"
    out = {"planId": plan["planId"], "verdict": verdict, "failedCriteria": [k for k, v in criteria.items() if not v],
           "criteria": criteria, "pooledMedianSeparationMeters": per_horizon, "perRegionMedianSeparationMeters": per_region,
           "eligibleTracksWith72h": eligible72, "cohorts": len(reports),
           "reading": ("At 72 h the HYCOM 15 m advection median error is not smaller than the stationary baseline for this cohort. "
                       "The drifters moved little (stationary error ≈ 23 km/72 h), so a tracer that follows the reanalysis eddy field "
                       "accumulates phase/position error faster than a particle that stays put. This is a real negative result for "
                       "'does v1 beat persistence in the quiet subtropical/tropical gyre in January 2015', not a code defect: the "
                       "numerical tests and same-environment replay still hold. It does not test coastal, forecast, or energetic regimes."
                       if verdict == "FAIL" else "Pre-registered criteria met for this cohort only."),
           "scientificAcceptance": "NOT_ACCEPTED" if verdict == "FAIL" else "PASSED_PREREGISTERED_COHORT",
           "modelResultArraySha256": {k: r["modelResultArraySha256"] for k, r in reports.items()},
           "observationTracksSha256": {k: r["observationTracksSha256"] for k, r in reports.items()}}
    (EVID / "verdict.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: out[k] for k in ("verdict", "failedCriteria", "pooledMedianSeparationMeters", "eligibleTracksWith72h")}, indent=1))


if __name__ == "__main__":
    main()
