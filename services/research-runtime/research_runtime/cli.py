"""Offline validate/run/export/replay entry point: python -m research_runtime.cli."""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import sys
import zipfile

from .datasets import canonical_bytes, digest, validate_dataset
from .models import dependency_lock_text, model_source_sha256, model_source_snapshot, preflight, run_experiment

MAX_BUNDLE_BYTES = 256 * 1024 * 1024


def read_json(path):
    path = Path(path)
    if path.stat().st_size > MAX_BUNDLE_BYTES:
        raise ValueError("input exceeds the local 256 MiB limit")
    return json.loads(path.read_text(encoding="utf-8"))


def export_bundle(spec, dataset, result, output):
    dataset = validate_dataset(dataset)
    if result.get("provenance", {}).get("specSha256") != digest(spec) or result["provenance"].get("datasetSha256") != dataset["manifest"]["sha256"]:
        raise ValueError("result does not belong to this immutable experiment and dataset")
    if result["provenance"].get("resultArraySha256") != digest(result["trajectories"]):
        raise ValueError("result trajectory integrity failure")
    if result["provenance"].get("modelSourceSha256") != model_source_sha256():
        raise ValueError("current model source differs from the executed source; export the saved run snapshot")
    if result["provenance"].get("dependencyLockSha256") != digest(dependency_lock_text()):
        raise ValueError("current dependency lock differs from the executed lock")
    values = {"experiment.json": spec, "datasets/manifest.json": dataset["manifest"], "results/result.json": result,
              "model/manifest.json": {k: result["provenance"][k] for k in ("modelId", "modelVersion", "engineVersion", "backend", "modelSourceSha256")},
              "environment/lock-and-runtime.json": {k: result["provenance"][k] for k in ("python", "platform", "dependencies", "positionPrecision", "forcingPrecision")}}
    if dataset["manifest"]["redistributionAllowed"]:
        values["datasets/input.json"] = dataset
    files = {name: canonical_bytes(value) for name, value in values.items()}
    summary = io.StringIO(newline="")
    writer = csv.writer(summary)
    writer.writerow(["particleId", "finalStatus", "displacementMeters"])
    for index, trajectory in enumerate(result["trajectories"]):
        writer.writerow([trajectory["particleId"], trajectory["finalStatus"], result["summary"]["displacementMeters"][index]])
    files["results/summary.csv"] = summary.getvalue().encode("utf-8")
    files.update({f"model/source/research_runtime/{name}": source.encode("utf-8") for name, source in model_source_snapshot().items()})
    files["environment/dependencies.lock.txt"] = dependency_lock_text().encode("utf-8")
    files["README-reproduce.md"] = ("# Reproduce EARTHUS experiment\n\nInstall the pinned requirements in an isolated environment.\n"
                                     "Run `python -m research_runtime.cli replay experiment.zip`.\n"
                                     "Without datasets/input.json, reacquire the exact original input and its version before replay.\n"
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


def _safe_name(name):
    path = PurePosixPath(name)
    if not name or path.is_absolute() or ".." in path.parts or ":" in name or "\\" in name or str(path) != name:
        raise ValueError("unsafe archive path")
    return name


def read_bundle(path):
    path = Path(path)
    files = {}
    total = 0
    if path.is_dir():
        root = path.resolve()
        for item in path.rglob("*"):
            if item.is_file():
                if not item.resolve().is_relative_to(root) or item.is_symlink():
                    raise ValueError("bundle contains an external path or symbolic link")
                total += item.stat().st_size
                if total > MAX_BUNDLE_BYTES:
                    raise ValueError("bundle expanded size exceeds 256 MiB")
                files[_safe_name(item.relative_to(path).as_posix())] = item.read_bytes()
    else:
        with zipfile.ZipFile(path) as archive:
            if len(archive.infolist()) > 1000:
                raise ValueError("bundle entry limit exceeded")
            for item in archive.infolist():
                if item.is_dir():
                    continue
                name = _safe_name(item.filename)
                if name in files or (item.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError("duplicate or symbolic-link archive entry")
                total += item.file_size
                if total > MAX_BUNDLE_BYTES:
                    raise ValueError("bundle expanded size exceeds 256 MiB")
                files[name] = archive.read(item)
    if "checksums.sha256" not in files:
        raise ValueError("bundle requires checksums.sha256")
    checked = set()
    for line in files["checksums.sha256"].decode("utf-8").splitlines():
        parts = line.split(None, 1)
        if len(parts) != 2:
            raise ValueError("invalid checksum entry")
        expected, name = parts
        name = _safe_name(name.lstrip("*"))
        if name in checked or name not in files or hashlib.sha256(files[name]).hexdigest() != expected:
            raise ValueError(f"bundle checksum mismatch: {name}")
        checked.add(name)
    if checked != set(files) - {"checksums.sha256"}:
        raise ValueError("all bundle files must be covered by checksums")
    return files


def replay_bundle(path):
    files = read_bundle(path)
    required = {"experiment.json", "datasets/input.json", "results/result.json"}
    if not required.issubset(files):
        raise ValueError("bundle input missing: reacquire the original dataset; full replay unavailable")
    spec, dataset, expected = (json.loads(files[name]) for name in ("experiment.json", "datasets/input.json", "results/result.json"))
    if expected.get("provenance", {}).get("specSha256") != digest(spec):
        raise ValueError("bundle specification hash does not match recorded provenance")
    manifest = validate_dataset(dataset)["manifest"]
    provenance = expected["provenance"]
    if any(provenance.get(key) != value for key, value in {"modelId": spec.get("modelId"), "modelVersion": spec.get("modelVersion"),
                                                         "datasetId": manifest["datasetId"], "datasetVersion": manifest["version"],
                                                         "datasetSha256": manifest["sha256"], "resultArraySha256": digest(expected["trajectories"])}.items()):
        raise ValueError("bundle model/dataset/result provenance mismatch")
    if provenance.get("modelSourceSha256") != model_source_sha256():
        raise ValueError("replay model source differs from the recorded source; restore the bundled registered model before replay")
    source = {name: files.get(f"model/source/research_runtime/{name}", b"").decode("utf-8") for name in model_source_snapshot()}
    if digest(source) != provenance["modelSourceSha256"]:
        raise ValueError("bundled source snapshot does not match executed source")
    if "environment/dependencies.lock.txt" not in files or digest(files["environment/dependencies.lock.txt"].decode("utf-8")) != provenance.get("dependencyLockSha256"):
        raise ValueError("bundled dependency lock does not match executed environment")
    if digest(dependency_lock_text()) != provenance["dependencyLockSha256"]:
        raise ValueError("installed model dependency lock differs from recorded lock")
    model_manifest = json.loads(files.get("model/manifest.json", b"{}"))
    if any(model_manifest.get(key) != provenance.get(key) for key in ("modelId", "modelVersion", "backend", "engineVersion", "modelSourceSha256")):
        raise ValueError("bundled model manifest mismatch")
    expected_backend = expected["provenance"].get("backend")
    available_backend = preflight(spec, dataset).get("backend")
    if available_backend != expected_backend:
        raise ValueError(f"replay requires original backend {expected_backend}; available {available_backend}")
    result = run_experiment(spec, dataset)
    actual_hash = digest(result["trajectories"])
    expected_hash = digest(expected["trajectories"])
    if actual_hash != expected_hash:
        raise ValueError("replay numerical array hash differs; environment/engine/data must be investigated")
    return {"matched": True, "resultArraySha256": actual_hash, "backend": result["provenance"]["backend"],
            "observationValidation": "NOT_PERFORMED", "result": result}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    validate = commands.add_parser("validate")
    validate.add_argument("--dataset", required=True)
    validate.add_argument("--spec")
    run = commands.add_parser("run")
    run.add_argument("--dataset", required=True)
    run.add_argument("--spec", required=True)
    run.add_argument("--output", required=True)
    export = commands.add_parser("export")
    for name in ("dataset", "spec", "result", "output"):
        export.add_argument("--" + name, required=True)
    replay = commands.add_parser("replay")
    replay.add_argument("bundle")
    replay.add_argument("--output")
    args = parser.parse_args(argv)
    try:
        if args.command == "validate":
            dataset = validate_dataset(read_json(args.dataset))
            result = preflight(read_json(args.spec), dataset) if args.spec else {"ok": True, "datasetId": dataset["manifest"]["datasetId"]}
            print(json.dumps(result, indent=2))
            return 0 if result["ok"] else 2
        if args.command == "run":
            result = run_experiment(read_json(args.spec), read_json(args.dataset))
            Path(args.output).write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
            print(json.dumps({"output": args.output, "qualityStatus": result["qualityStatus"], "provenance": result["provenance"]}, indent=2))
        elif args.command == "export":
            print(export_bundle(read_json(args.spec), read_json(args.dataset), read_json(args.result), args.output))
        else:
            result = replay_bundle(args.bundle)
            if args.output:
                Path(args.output).write_text(json.dumps(result["result"], indent=2) + "\n", encoding="utf-8")
            print(json.dumps({k: v for k, v in result.items() if k != "result"}, indent=2))
        return 0
    except (ValueError, OSError, KeyError, zipfile.BadZipFile) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
