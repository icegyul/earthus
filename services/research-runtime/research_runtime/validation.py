"""Compare fixed trajectories with eligible, source-hashed drifter observations.

This reports observed errors and baselines, never scientific acceptance. Missing
UTC matches, drogue/depth/QC/independence evidence are exclusions, not zero error.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import statistics

from .datasets import digest, utc_seconds, utc_string
from .models import distance_m

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_TRACKS = 1000
MAX_SAMPLES = 1_000_000
RADIUS_M = 6371008.8


def _finite(value):
    return not isinstance(value, bool) and isinstance(value, (float, int)) and math.isfinite(value)


def _position(sample):
    if not isinstance(sample, dict) or not _finite(sample.get("lon")) or not _finite(sample.get("lat")):
        raise ValueError("sample coordinates must be finite numbers")
    if not -180 <= sample["lon"] <= 180 or not -90 <= sample["lat"] <= 90:
        raise ValueError("sample coordinates outside WGS84 longitude/latitude range")
    return sample["lon"], sample["lat"]


def _samples(samples):
    if not isinstance(samples, list) or not samples:
        raise ValueError("track samples must be a nonempty list")
    indexed, previous = {}, None
    for sample in samples:
        _position(sample)
        seconds = utc_seconds(sample.get("timeUTC"))
        if previous is not None and seconds <= previous:
            raise ValueError("sample times must be unique and strictly increasing")
        indexed[seconds] = sample
        previous = seconds
    return indexed


def _sha(value, name):
    if not isinstance(value, str) or len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
        raise ValueError(f"{name} must be a lowercase SHA-256")


def validate_observations(observations, source_bytes):
    if not isinstance(observations, dict) or not isinstance(observations.get("manifest"), dict):
        raise ValueError("observations require manifest and tracks")
    manifest, tracks = observations["manifest"], observations.get("tracks")
    for key in ("datasetId", "version", "sourceURI", "provider", "citation", "license", "sourceFile", "qualityControl", "qualityControlURI"):
        if not isinstance(manifest.get(key), str) or not manifest[key].strip():
            raise ValueError(f"observation manifest.{key} is required")
    if manifest.get("evidenceKind") not in {"OBSERVATION", "SYNTHETIC_TEST"}:
        raise ValueError("observation evidenceKind must be OBSERVATION or SYNTHETIC_TEST")
    expected_qc = "PROVIDER_QC" if manifest["evidenceKind"] == "OBSERVATION" else "SYNTHETIC_TEST"
    if manifest["qualityControl"] != expected_qc:
        raise ValueError(f"observation qualityControl must be {expected_qc}")
    if manifest.get("hashScope") != "canonical-observation-tracks-json":
        raise ValueError("unsupported observation hashScope")
    _sha(manifest.get("sha256"), "observation manifest.sha256")
    _sha(manifest.get("sourceSha256"), "observation manifest.sourceSha256")
    if not isinstance(source_bytes, bytes) or len(source_bytes) > MAX_FILE_BYTES:
        raise ValueError("original source bytes are required and must be at most 10 MiB")
    if hashlib.sha256(source_bytes).hexdigest() != manifest["sourceSha256"]:
        raise ValueError("original observation source SHA-256 mismatch")
    if not isinstance(tracks, list) or not tracks or len(tracks) > MAX_TRACKS:
        raise ValueError("observations require 1 to 1000 tracks")
    if sum(len(track.get("samples", [])) for track in tracks if isinstance(track, dict)) > MAX_SAMPLES:
        raise ValueError("observation sample budget exceeded")
    if digest(tracks) != manifest["sha256"]:
        raise ValueError("observation tracks SHA-256 mismatch")
    seen = set()
    for track in tracks:
        if not isinstance(track, dict) or type(track.get("particleId")) is not int or track["particleId"] < 0:
            raise ValueError("observation track requires nonnegative integer particleId")
        if track["particleId"] in seen:
            raise ValueError("duplicate observation particleId; explicit one-to-one pairing required")
        seen.add(track["particleId"])
        _samples(track.get("samples"))
    return observations


def _persistent_position(lon, lat, u, v, duration):
    """Great-circle propagation at the initial observed speed and bearing."""
    speed = math.hypot(u, v)
    if speed == 0:
        return lon, lat
    phi, lam, bearing = math.radians(lat), math.radians(lon), math.atan2(u, v)
    delta = speed * duration / RADIUS_M
    phi2 = math.asin(max(-1, min(1, math.sin(phi) * math.cos(delta) + math.cos(phi) * math.sin(delta) * math.cos(bearing))))
    lam2 = lam + math.atan2(math.sin(bearing) * math.sin(delta) * math.cos(phi), math.cos(delta) - math.sin(phi) * math.sin(phi2))
    return (math.degrees(lam2) + 180) % 360 - 180, math.degrees(phi2)


def _percentile(values, probability):
    ordered = sorted(values)
    index = (len(ordered) - 1) * probability
    low, high = math.floor(index), math.ceil(index)
    return ordered[low] + (ordered[high] - ordered[low]) * (index - low)


def compare(result, observations, source_bytes, horizons=(86400, 172800, 259200), depth_tolerance_m=0.1):
    validate_observations(observations, source_bytes)
    if not isinstance(result, dict) or result.get("qualityStatus") not in {"COMPLETE", "PARTIAL"}:
        raise ValueError("only COMPLETE or PARTIAL validated model results may be compared")
    provenance = result.get("provenance", {})
    trajectories = result.get("trajectories")
    if not isinstance(trajectories, list) or not trajectories or len(trajectories) > MAX_TRACKS:
        raise ValueError("model result must contain 1 to 1000 trajectories")
    if sum(len(track.get("samples", [])) for track in trajectories if isinstance(track, dict)) > MAX_SAMPLES:
        raise ValueError("model sample budget exceeded")
    if digest(trajectories) != provenance.get("resultArraySha256"):
        raise ValueError("model result array SHA-256 mismatch")
    if not _finite(depth_tolerance_m) or not 0 <= depth_tolerance_m <= 1:
        raise ValueError("depth tolerance must be between 0 and 1 meter")
    if not horizons or len(horizons) > 20 or any(type(h) is not int or h <= 0 or h > 259200 for h in horizons) or len(set(horizons)) != len(horizons):
        raise ValueError("horizons must be unique positive integer seconds at most 72 hours")
    models = {}
    for track in trajectories:
        pid = track.get("particleId")
        if type(pid) is not int or pid < 0 or pid in models:
            raise ValueError("model particle IDs must be unique nonnegative integers")
        models[pid] = _samples(track.get("samples"))
    model_depth = provenance.get("surfaceDepthMeters")
    excluded, unavailable, rows = [], [], []
    eligible_ids = []
    for track in observations["tracks"]:
        pid, reasons = track["particleId"], []
        if pid not in models:
            reasons.append("MODEL_PARTICLE_NOT_FOUND")
        if track.get("qualityControl") != "PASSED":
            reasons.append("TRACK_QC_NOT_PASSED")
        if track.get("drogueStatus") != "ATTACHED":
            reasons.append("DROGUE_" + (track.get("drogueStatus") if track.get("drogueStatus") in {"LOST", "UNKNOWN"} else "UNKNOWN"))
        depth = track.get("depthMeters")
        if not _finite(depth) or not _finite(model_depth):
            reasons.append("DEPTH_UNKNOWN")
        elif depth < 0 or model_depth < 0 or abs(depth - model_depth) > depth_tolerance_m:
            reasons.append("DEPTH_MISMATCH")
        if track.get("independenceStatus") != "INDEPENDENT" or not isinstance(track.get("independenceEvidence"), str) or not track["independenceEvidence"].strip():
            reasons.append("INDEPENDENCE_NOT_ESTABLISHED")
        observed = _samples(track["samples"])
        if reasons:
            excluded.append({"particleId": pid, "reasons": reasons})
            continue
        model = models[pid]
        start = min(model)
        initial = observed.get(start)
        if initial is None:
            excluded.append({"particleId": pid, "reasons": ["NO_EXACT_START_TIME_MATCH"]})
            continue
        if distance_m(_position(model[start]), _position(initial)) > 1:
            excluded.append({"particleId": pid, "reasons": ["START_POSITION_MISMATCH_OVER_1M"]})
            continue
        u, v = initial.get("uMps"), initial.get("vMps")
        if not _finite(u) or not _finite(v) or abs(u) > 20 or abs(v) > 20:
            excluded.append({"particleId": pid, "reasons": ["INITIAL_OBSERVED_VELOCITY_MISSING_OR_INVALID"]})
            continue
        if track.get("drogueLostAtUTC") is not None and utc_seconds(track["drogueLostAtUTC"]) <= start + max(horizons):
            excluded.append({"particleId": pid, "reasons": ["DROGUE_LOSS_DURING_WINDOW"]})
            continue
        eligible_ids.append(pid)
        for horizon in sorted(horizons):
            time = start + horizon
            model_point, observation = model.get(time), observed.get(time)
            reason = "NO_EXACT_MODEL_TIME_MATCH" if model_point is None else "NO_EXACT_OBSERVATION_TIME_MATCH" if observation is None else None
            if reason is None and model_point.get("status") not in {"ACTIVE", "COMPLETED"}:
                reason = "MODEL_PARTICLE_NOT_ACTIVE_AT_HORIZON"
            if reason:
                unavailable.append({"particleId": pid, "horizonSeconds": horizon, "reason": reason})
                continue
            target = _position(observation)
            initial_position = _position(initial)
            error = distance_m(_position(model_point), target)
            stationary_error = distance_m(initial_position, target)
            persistent = _persistent_position(*initial_position, u, v, horizon)
            persistence_error = distance_m(persistent, target)
            rows.append({"particleId": pid, "horizonSeconds": horizon, "timeUTC": utc_string(time),
                         "separationMeters": error, "stationarySeparationMeters": stationary_error,
                         "initialVelocitySeparationMeters": persistence_error,
                         "modelMinusStationaryMeters": error - stationary_error,
                         "modelMinusInitialVelocityMeters": error - persistence_error})
    summaries = []
    for horizon in sorted(horizons):
        points = [row for row in rows if row["horizonSeconds"] == horizon]
        errors = [row["separationMeters"] for row in points]
        summaries.append({"horizonSeconds": horizon, "sampleCount": len(points),
                          "meanSeparationMeters": statistics.mean(errors) if errors else None,
                          "medianSeparationMeters": statistics.median(errors) if errors else None,
                          "p95SeparationMeters": _percentile(errors, 0.95) if errors else None,
                          "meanStationarySeparationMeters": statistics.mean(row["stationarySeparationMeters"] for row in points) if points else None,
                          "meanInitialVelocitySeparationMeters": statistics.mean(row["initialVelocitySeparationMeters"] for row in points) if points else None})
    synthetic = observations["manifest"]["evidenceKind"] == "SYNTHETIC_TEST" or provenance.get("evidenceKind") == "SYNTHETIC_TEST"
    counts = Counter(reason for item in excluded for reason in item["reasons"])
    return {"schemaVersion": "1.0", "status": "NOT_VALIDATED" if not rows else "NUMERICAL_TEST_ONLY" if synthetic else "COMPARISON_COMPUTED",
            "scientificAcceptance": "NOT_EVALUATED", "observationValidationPassed": False,
            "observationProvenance": {key: observations["manifest"][key] for key in ("provider", "sourceURI", "citation", "license", "qualityControl", "qualityControlURI", "evidenceKind")},
            "observationDatasetId": observations["manifest"]["datasetId"], "observationVersion": observations["manifest"]["version"],
            "observationTracksSha256": observations["manifest"]["sha256"], "observationSourceSha256": observations["manifest"]["sourceSha256"],
            "modelResultArraySha256": provenance["resultArraySha256"], "modelDatasetSha256": provenance.get("datasetSha256"),
            "totalTracks": len(observations["tracks"]), "eligibleTracks": len(eligible_ids),
            "tracksWithComparedHorizons": len({row["particleId"] for row in rows}),
            "excludedTracks": excluded, "exclusionReasonCounts": dict(counts), "unavailableHorizons": unavailable,
            "trackEligibility": [{"particleId": track["particleId"], "trackId": track.get("trackId"),
                                  "qualityControl": track.get("qualityControl"), "drogueStatus": track.get("drogueStatus", "UNKNOWN"),
                                  "observationDepthMeters": track.get("depthMeters"), "modelDepthMeters": model_depth,
                                  "independenceStatus": track.get("independenceStatus", "UNKNOWN"),
                                  "independenceEvidence": track.get("independenceEvidence", ""),
                                  "eligible": track["particleId"] in eligible_ids} for track in observations["tracks"]],
            "summary": summaries, "comparisons": rows,
            "method": {"timeAlignment": "exact UTC instants only; no temporal interpolation or nearest-time substitution",
                       "depthToleranceMeters": depth_tolerance_m, "initialPositionToleranceMeters": 1,
                       "distance": "WGS84 coordinates; spherical haversine radius 6371008.8m",
                       "stationaryBaseline": "fixed initial observed position",
                       "initialVelocityBaseline": "great-circle propagation at initial observed speed and bearing",
                       "independence": "explicit caller-supplied evidence required; provenance assertion is recorded, not independently certified",
                       "acceptance": "error metrics are not a pass/fail threshold; preregister domain criteria and held-out cohort before evaluation"}}


def _load(path):
    if path.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("input exceeds 10 MiB")
    return json.loads(path.read_text(encoding="utf-8-sig"))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--result", required=True, type=Path)
    parser.add_argument("--observations", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)
    observations = _load(args.observations)
    source_name = observations.get("manifest", {}).get("sourceFile", "")
    source_relative = Path(source_name)
    if not source_name or source_relative.is_absolute() or ".." in source_relative.parts:
        raise ValueError("sourceFile must be a relative file within the observation package")
    base = args.observations.resolve().parent
    source = (base / source_relative).resolve()
    if not source.is_relative_to(base) or not source.is_file() or source.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("sourceFile is missing, outside observation package, or exceeds 10 MiB")
    report = compare(_load(args.result), observations, source.read_bytes())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")
    print(json.dumps({"output": str(args.output), "status": report["status"], "eligibleTracks": report["eligibleTracks"],
                      "comparisons": len(report["comparisons"])}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError, KeyError, TypeError) as error:
        raise SystemExit(str(error)) from error
