"""V1 / V2 / baseline comparison for the pre-registered cohort (pure statistics, no physics).

Inputs are comparator reports produced by research_runtime.validation.compare — the same function,
unchanged, for V1 (frozen reports) and V2 — so the metric definition is identical by construction.
"""
from __future__ import annotations

import random
import statistics

HORIZONS = (86400, 172800, 259200)


def _rows(report, horizon):
    return {row["particleId"]: row for row in report["comparisons"] if row["horizonSeconds"] == horizon}


def _track_ids(report):
    return {t["particleId"]: t.get("trackId") for t in report["trackEligibility"]}


def paired_v1_v2(v1_report, v2_report, region):
    """One row per (drifter, horizon). Strict sign classification; ties are UNCHANGED, never IMPROVED."""
    if v1_report["observationTracksSha256"] != v2_report["observationTracksSha256"]:
        raise ValueError("V1 and V2 were not compared against the same observation tracks")
    names = _track_ids(v2_report)
    out = []
    for horizon in HORIZONS:
        a, b = _rows(v1_report, horizon), _rows(v2_report, horizon)
        for pid in sorted(set(a) | set(b)):
            if pid not in a or pid not in b:
                out.append({"drifterId": names.get(pid), "particleId": pid, "region": region, "horizonHours": horizon // 3600,
                            "v1ErrorKm": a[pid]["separationMeters"] / 1000 if pid in a else None,
                            "v2ErrorKm": b[pid]["separationMeters"] / 1000 if pid in b else None,
                            "stationaryErrorKm": None, "initialVelocityErrorKm": None, "deltaV2MinusV1Km": None,
                            "classification": "UNAVAILABLE_IN_" + ("V2" if pid not in b else "V1")})
                continue
            if abs(a[pid]["stationarySeparationMeters"] - b[pid]["stationarySeparationMeters"]) > 1e-6:
                raise ValueError(f"baseline mismatch for particle {pid}: V1 and V2 targets differ")
            delta = b[pid]["separationMeters"] - a[pid]["separationMeters"]
            out.append({"drifterId": names.get(pid), "particleId": pid, "region": region, "horizonHours": horizon // 3600,
                        "v1ErrorKm": a[pid]["separationMeters"] / 1000, "v2ErrorKm": b[pid]["separationMeters"] / 1000,
                        "stationaryErrorKm": b[pid]["stationarySeparationMeters"] / 1000,
                        "initialVelocityErrorKm": b[pid]["initialVelocitySeparationMeters"] / 1000,
                        "deltaV2MinusV1Km": delta / 1000,
                        "classification": "IMPROVED" if delta < 0 else "WORSE" if delta > 0 else "UNCHANGED"})
    return out


def paired_summary(rows):
    summary = {}
    for hours in (24, 48, 72):
        subset = [r for r in rows if r["horizonHours"] == hours and r["deltaV2MinusV1Km"] is not None]
        deltas = [r["deltaV2MinusV1Km"] for r in subset]
        summary[str(hours)] = {"n": len(subset),
                               "improved": sum(r["classification"] == "IMPROVED" for r in subset),
                               "worse": sum(r["classification"] == "WORSE" for r in subset),
                               "unchanged": sum(r["classification"] == "UNCHANGED" for r in subset),
                               "unavailable": sum(r["horizonHours"] == hours and r["deltaV2MinusV1Km"] is None for r in rows),
                               "medianDeltaKm": statistics.median(deltas) if deltas else None,
                               "meanDeltaKm": statistics.mean(deltas) if deltas else None,
                               "medianV1Km": statistics.median(r["v1ErrorKm"] for r in subset) if subset else None,
                               "medianV2Km": statistics.median(r["v2ErrorKm"] for r in subset) if subset else None}
    return summary


def baseline_summary(rows, model_key="v2ErrorKm"):
    """V2 (or any model column) against stationary and initial-velocity persistence, per horizon."""
    out = {}
    for hours in (24, 48, 72):
        subset = [r for r in rows if r["horizonHours"] == hours and r.get(model_key) is not None and r["stationaryErrorKm"] is not None]
        model = [r[model_key] for r in subset]
        block = {"n": len(subset)}
        for name, key in (("model", model_key), ("stationary", "stationaryErrorKm"), ("initialVelocity", "initialVelocityErrorKm")):
            values = [r[key] for r in subset]
            block[name] = {"medianKm": statistics.median(values) if values else None, "meanKm": statistics.mean(values) if values else None,
                           "minKm": min(values) if values else None, "maxKm": max(values) if values else None}
        for name, key in (("stationary", "stationaryErrorKm"), ("initialVelocity", "initialVelocityErrorKm")):
            block[f"modelVs_{name}"] = {"improved": sum(r[model_key] < r[key] for r in subset), "worse": sum(r[model_key] > r[key] for r in subset),
                                        "unchanged": sum(r[model_key] == r[key] for r in subset)}
        out[str(hours)] = block
    return out


def bootstrap(rows, seed, iterations=2000, hours=72):
    """Drifter-level resampling of 72 h medians. Supplementary only — never an acceptance criterion."""
    subset = [r for r in rows if r["horizonHours"] == hours and r["deltaV2MinusV1Km"] is not None]
    rng = random.Random(seed)
    stats = {"medianV2Km": [], "medianV1Km": [], "medianDeltaV2MinusV1Km": [], "medianV2MinusStationaryKm": [], "medianV2MinusPersistenceKm": []}
    n = len(subset)
    for _ in range(iterations):
        sample = [subset[rng.randrange(n)] for _ in range(n)]
        stats["medianV2Km"].append(statistics.median(r["v2ErrorKm"] for r in sample))
        stats["medianV1Km"].append(statistics.median(r["v1ErrorKm"] for r in sample))
        stats["medianDeltaV2MinusV1Km"].append(statistics.median(r["deltaV2MinusV1Km"] for r in sample))
        stats["medianV2MinusStationaryKm"].append(statistics.median(r["v2ErrorKm"] - r["stationaryErrorKm"] for r in sample))
        stats["medianV2MinusPersistenceKm"].append(statistics.median(r["v2ErrorKm"] - r["initialVelocityErrorKm"] for r in sample))
    def ci(values):
        ordered = sorted(values)
        return {"p2.5": ordered[int(0.025 * (len(ordered) - 1))], "p50": ordered[int(0.5 * (len(ordered) - 1))], "p97.5": ordered[int(0.975 * (len(ordered) - 1))]}
    return {"method": "nonparametric bootstrap, drifter-level resampling with replacement", "seed": seed, "iterations": iterations,
            "horizonHours": hours, "n": n, "role": "SUPPLEMENTARY — not a pre-registered acceptance criterion",
            "intervals": {key: ci(values) for key, values in stats.items()}}


def sensitivity_table(rows_by_alpha, primary_alpha):
    """Per alpha: 72 h medians against baselines. Reporting only; never used to choose alpha."""
    table = []
    for alpha, rows in sorted(rows_by_alpha.items()):
        subset = [r for r in rows if r["horizonHours"] == 72 and r["v2ErrorKm"] is not None]
        table.append({"alpha": alpha, "role": "PRIMARY" if alpha == primary_alpha else "SENSITIVITY", "n": len(subset),
                      "medianModelKm": statistics.median(r["v2ErrorKm"] for r in subset) if subset else None,
                      "medianStationaryKm": statistics.median(r["stationaryErrorKm"] for r in subset) if subset else None,
                      "medianPersistenceKm": statistics.median(r["initialVelocityErrorKm"] for r in subset) if subset else None,
                      "medianDeltaVsV1Km": statistics.median(r["deltaV2MinusV1Km"] for r in subset) if subset else None,
                      "improvedVsV1": sum(r["classification"] == "IMPROVED" for r in subset)})
    return table
