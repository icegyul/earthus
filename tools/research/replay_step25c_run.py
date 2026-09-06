"""STEP 25C r2 — separate-process replay of one TEST-02 run from the on-disk inputs (spec JSON, normalized GLORYS forcing file,
normalized wind file). Re-executes the frozen runtime (models_v2.run_experiment, unchanged) and prints the result-array SHA-256 so
the runner can compare it with the in-process result. Equivalent to `cli_v2 replay` except the dataset comes from disk instead of
the bundle (the GLORYS manifest is marked non-redistributable, so the bundle exporter omits it by design). No model change."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVICE = ROOT / "services/research-runtime"
sys.path.insert(0, str(SERVICE)); sys.path.insert(0, str(SERVICE / ".deps"))


def main(spec_path, forcing_path, wind_path, run_id):
    from research_runtime import models_v2
    from research_runtime.datasets import validate_dataset, digest
    from research_runtime.wind import validate_wind_dataset
    spec = json.loads(Path(spec_path).read_text(encoding="utf-8"))
    dataset = validate_dataset(json.loads(Path(forcing_path).read_text(encoding="utf-8"))); wind = validate_wind_dataset(json.loads(Path(wind_path).read_text(encoding="utf-8")))
    result = models_v2.run_experiment(spec, dataset, wind, run_id=run_id)
    print(json.dumps({"ok": True, "resultArraySha256": digest(result["trajectories"]), "specSha256": digest(spec), "datasetSha256": dataset["manifest"]["sha256"], "windDatasetSha256": wind["manifest"]["sha256"], "modelSourceSha256": models_v2.model_source_sha256()}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(*sys.argv[1:5]))
