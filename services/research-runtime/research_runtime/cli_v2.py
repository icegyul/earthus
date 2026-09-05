"""Registry-aware validate/run/export/replay: python -m research_runtime.cli_v2.

V1 bundles keep replaying through the unchanged research_runtime.cli. V2 bundles carry
datasets/wind.json and the V2 source snapshot, and are replayed with the V2 adapter only.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import sys
import zipfile

from . import cli as v1cli
from .datasets import canonical_bytes, digest, validate_dataset
from .registry import resolve, resolve_recorded
from .wind import validate_wind_dataset


def read_json(path):
    return v1cli.read_json(path)


def export_bundle(spec, dataset, wind, result, output):
    entry = resolve(spec)
    if not entry["needsWind"]:
        return v1cli.export_bundle(spec, dataset, result, output)
    dataset, wind = validate_dataset(dataset), validate_wind_dataset(wind)
    provenance = result.get("provenance", {})
    checks = {"specSha256": digest(spec), "datasetSha256": dataset["manifest"]["sha256"], "windDatasetSha256": wind["manifest"]["sha256"],
              "resultArraySha256": digest(result["trajectories"]), "modelSourceSha256": entry["sha256"](),
              "dependencyLockSha256": digest(entry["module"].dependency_lock_text())}
    for key, value in checks.items():
        if provenance.get(key) != value:
            raise ValueError(f"result {key} does not match the current immutable inputs/source")
    values = {"experiment.json": spec, "datasets/manifest.json": dataset["manifest"], "datasets/wind-manifest.json": wind["manifest"],
              "results/result.json": result,
              "model/manifest.json": {k: provenance[k] for k in ("modelId", "modelVersion", "engineVersion", "backend", "modelSourceSha256", "modelSourceFiles", "windage")},
              "environment/lock-and-runtime.json": {k: provenance.get(k) for k in ("python", "platform", "dependencies", "positionPrecision", "forcingPrecision")}}
    if dataset["manifest"]["redistributionAllowed"]:
        values["datasets/input.json"] = dataset
    if wind["manifest"]["redistributionAllowed"]:
        values["datasets/wind.json"] = wind
    files = {name: canonical_bytes(value) for name, value in values.items()}
    summary = io.StringIO(newline="")
    writer = csv.writer(summary)
    writer.writerow(["particleId", "finalStatus", "displacementMeters"])
    for index, trajectory in enumerate(result["trajectories"]):
        writer.writerow([trajectory["particleId"], trajectory["finalStatus"], result["summary"]["displacementMeters"][index]])
    files["results/summary.csv"] = summary.getvalue().encode("utf-8")
    files.update({f"model/source/research_runtime/{name}": source.encode("utf-8") for name, source in entry["snapshot"]().items()})
    files["environment/dependencies.lock.txt"] = entry["module"].dependency_lock_text().encode("utf-8")
    files["README-reproduce.md"] = ("# Reproduce EARTHUS experiment (v2 windage)\n\nInstall the pinned requirements in an isolated environment.\n"
                                     "Run `python -m research_runtime.cli_v2 replay experiment.zip`.\n"
                                     "Without datasets/input.json or datasets/wind.json, reacquire the exact original inputs and versions before replay.\n"
                                     "Numerical repeatability is separate from validation against observations.\n").encode()
    files["checksums.sha256"] = "".join(f"{hashlib.sha256(data).hexdigest()}  {name}\n" for name, data in sorted(files.items())).encode()
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + ".tmp")
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
            for name, data in files.items():
                bundle.writestr(name, data)
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    return str(output)


def replay_bundle(path):
    files = v1cli.read_bundle(path)
    if "experiment.json" not in files or "results/result.json" not in files:
        raise ValueError("bundle requires experiment.json and results/result.json")
    spec, expected = json.loads(files["experiment.json"]), json.loads(files["results/result.json"])
    entry = resolve(spec)
    if not entry["needsWind"]:
        return v1cli.replay_bundle(path)
    required = {"datasets/input.json", "datasets/wind.json"}
    if not required.issubset(files):
        raise ValueError("bundle input missing: reacquire the original current and wind datasets; full replay unavailable")
    dataset, wind = json.loads(files["datasets/input.json"]), json.loads(files["datasets/wind.json"])
    provenance = expected.get("provenance", {})
    if resolve_recorded(provenance) is not entry:
        raise ValueError("recorded provenance model does not match the bundle specification model")
    manifest, wmanifest = validate_dataset(dataset)["manifest"], validate_wind_dataset(wind)["manifest"]
    expectations = {"specSha256": digest(spec), "datasetId": manifest["datasetId"], "datasetVersion": manifest["version"], "datasetSha256": manifest["sha256"],
                    "windDatasetId": wmanifest["datasetId"], "windDatasetVersion": wmanifest["version"], "windDatasetSha256": wmanifest["sha256"],
                    "resultArraySha256": digest(expected["trajectories"])}
    for key, value in expectations.items():
        if provenance.get(key) != value:
            raise ValueError(f"bundle provenance mismatch: {key}")
    if provenance.get("modelSourceSha256") != entry["sha256"]():
        raise ValueError("replay model source differs from the recorded v2 source; restore the bundled snapshot before replay")
    source = {name: files.get(f"model/source/research_runtime/{name}", b"").decode("utf-8") for name in entry["snapshot"]()}
    if digest(source) != provenance["modelSourceSha256"]:
        raise ValueError("bundled source snapshot does not match executed source")
    if "environment/dependencies.lock.txt" not in files or digest(files["environment/dependencies.lock.txt"].decode("utf-8")) != provenance.get("dependencyLockSha256"):
        raise ValueError("bundled dependency lock does not match executed environment")
    if digest(entry["module"].dependency_lock_text()) != provenance["dependencyLockSha256"]:
        raise ValueError("installed model dependency lock differs from recorded lock")
    if (provenance.get("windage") or {}).get("alpha") != spec.get("windage", {}).get("alpha"):
        raise ValueError("recorded windage alpha differs from the bundle specification")
    check = entry["preflight"](spec, dataset, wind)
    if not check.get("ok"):
        raise ValueError("replay preflight failed: " + "; ".join(check.get("errors", [])))
    result = entry["run"](spec, dataset, wind, run_id=provenance.get("runId"))
    actual_hash = digest(result["trajectories"])
    if actual_hash != provenance["resultArraySha256"]:
        raise ValueError("replay numerical array hash differs; environment/engine/data must be investigated")
    return {"matched": True, "resultArraySha256": actual_hash, "modelId": spec["modelId"], "windageAlpha": spec["windage"]["alpha"],
            "backend": result["provenance"]["backend"], "observationValidation": "NOT_PERFORMED", "result": result}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    validate = commands.add_parser("validate")
    validate.add_argument("--dataset", required=True)
    validate.add_argument("--wind")
    validate.add_argument("--spec", required=True)
    run = commands.add_parser("run")
    run.add_argument("--dataset", required=True)
    run.add_argument("--wind")
    run.add_argument("--spec", required=True)
    run.add_argument("--output", required=True)
    run.add_argument("--run-id")
    export = commands.add_parser("export")
    for name in ("dataset", "spec", "result", "output"):
        export.add_argument("--" + name, required=True)
    export.add_argument("--wind")
    replay = commands.add_parser("replay")
    replay.add_argument("bundle")
    replay.add_argument("--output")
    args = parser.parse_args(argv)
    try:
        if args.command == "replay":
            outcome = replay_bundle(args.bundle)
            if args.output:
                Path(args.output).write_text(json.dumps(outcome["result"], indent=2) + "\n", encoding="utf-8")
            print(json.dumps({k: v for k, v in outcome.items() if k != "result"}, indent=2))
            return 0
        spec = read_json(args.spec)
        entry = resolve(spec)
        wind = read_json(args.wind) if getattr(args, "wind", None) else None
        if entry["needsWind"] and wind is None:
            raise ValueError("--wind is required for this model")
        dataset = read_json(args.dataset)
        if args.command == "validate":
            check = entry["preflight"](spec, dataset, wind)
            print(json.dumps(check, indent=2))
            return 0 if check["ok"] else 2
        if args.command == "run":
            result = entry["run"](spec, dataset, wind, run_id=args.run_id)
            Path(args.output).write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
            print(json.dumps({"output": args.output, "qualityStatus": result["qualityStatus"], "resultArraySha256": result["provenance"]["resultArraySha256"], "runId": result["provenance"].get("runId")}, indent=2))
            return 0
        print(export_bundle(spec, dataset, wind, read_json(args.result), args.output))
        return 0
    except (ValueError, OSError, KeyError, zipfile.BadZipFile) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
