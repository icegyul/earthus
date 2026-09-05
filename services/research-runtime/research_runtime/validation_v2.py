"""Mechanical C1..C5 verdict from validation-plan-v2.json. No literal PASS is written by hand;
every criterion is computed from the plan's numbers and the comparison rows."""
from __future__ import annotations

import re
import statistics

REQUIRED_EVIDENCE = ("validation-plan-v2.json", "model.json", "observation.json", "dataset.json", "wind-dataset.json", "parameters.json",
                     "run-primary.json", "run-sensitivity.json", "comparison-v1-v2.json", "comparison-baselines.json", "bootstrap.json",
                     "replay.json")


def c5_threshold(plan):
    """The plan states C5 in prose ('at least 14 of 21 tracks improved'); parse it rather than hard-code it."""
    text = plan["acceptanceCriteria"]["C5_improvesOnV1"]
    match = re.search(r"at least (\d+) of (\d+)", text)
    if not match:
        raise ValueError("plan C5 threshold not parseable")
    return int(match.group(1)), int(match.group(2))


def c3_thresholds(plan):
    """C3 is stated in prose ('>= 20 tracks ..., >= 2 cohorts'); parse the pre-registered numbers."""
    text = plan["acceptanceCriteria"]["C3_sampleFloor"]
    tracks = re.search(r">=\s*(\d+)\s*tracks", text)
    cohorts = re.search(r">=\s*(\d+)\s*cohorts", text)
    if not tracks or not cohorts:
        raise ValueError("plan C3 thresholds not parseable")
    return int(tracks.group(1)), int(cohorts.group(1))


def verdict(plan, paired_rows, primary_alpha, regions, evidence_present, replay, reports_complete):
    """paired_rows: comparison_v2.paired_v1_v2 rows for the PRIMARY alpha only."""
    if primary_alpha != plan["windage"]["alphaPrimary"]:
        raise ValueError("verdict must be computed on the pre-registered primary alpha only")
    rows72 = [r for r in paired_rows if r["horizonHours"] == 72 and r["deltaV2MinusV1Km"] is not None]
    n = len(rows72)
    med = lambda key: statistics.median(r[key] for r in rows72) if rows72 else None
    need, of = c5_threshold(plan)
    min_tracks, min_cohorts = c3_thresholds(plan)
    improved = sum(r["classification"] == "IMPROVED" for r in rows72)
    criteria = {
        "C1_beatsStationary": {"pass": bool(rows72) and med("v2ErrorKm") < med("stationaryErrorKm"),
                                "medianV2Km": med("v2ErrorKm"), "medianStationaryKm": med("stationaryErrorKm")},
        "C2_beatsPersistence": {"pass": bool(rows72) and med("v2ErrorKm") < med("initialVelocityErrorKm"),
                                 "medianV2Km": med("v2ErrorKm"), "medianPersistenceKm": med("initialVelocityErrorKm")},
        "C3_sampleFloor": {"pass": n >= min_tracks and regions >= min_cohorts,
                           "tracksWith72h": n, "regions": regions, "minimumTracks": min_tracks, "minimumCohorts": min_cohorts},
        "C4_reporting": {"pass": bool(reports_complete) and all(name in evidence_present for name in REQUIRED_EVIDENCE) and bool(replay and replay.get("matched")),
                         "reportsComplete": bool(reports_complete), "missingEvidence": [name for name in REQUIRED_EVIDENCE if name not in evidence_present],
                         "replayMatched": bool(replay and replay.get("matched"))},
        "C5_improvesOnV1": {"pass": bool(rows72) and med("deltaV2MinusV1Km") < 0 and improved >= need and n == of,
                            "improved": improved, "required": need, "of": of, "n": n, "medianDeltaKm": med("deltaV2MinusV1Km")},
    }
    all_pass = all(c["pass"] for c in criteria.values())
    accepted = all(criteria[k]["pass"] for k in ("C1_beatsStationary", "C2_beatsPersistence", "C3_sampleFloor", "C4_reporting"))
    return {"planId": plan["planId"], "primaryAlpha": primary_alpha, "criteria": criteria,
            "failedCriteria": [k for k, c in criteria.items() if not c["pass"]],
            "verdict": "PASS" if all_pass else "NOT_ACCEPTED",
            "v2Accepted": "V2_ACCEPTED" if accepted else "V2_NOT_ACCEPTED",
            "v2ImprovesV1": "V2_IMPROVES_V1" if criteria["C5_improvesOnV1"]["pass"] else "V2_DOES_NOT_IMPROVE_V1",
            "scope": "pre-registered 2015-01 North Atlantic drogued-drifter cohort only; not a general accuracy claim",
            "v1VerdictUnchanged": "FAIL / NOT_ACCEPTED (IMMUTABLE-V1.json)"}
