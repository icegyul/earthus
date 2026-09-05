"""Versioned model registry. V1 stays bound to models.py (byte-identical); V2 to models_v2.py.

resolve() rejects unknown modelIds and modelId/modelVersion mismatches. Each entry carries its own
source snapshot and hash so that replay of a V1 bundle is judged against the V1 snapshot and a
V2 bundle against the V2 snapshot — the two are never mixed.
"""
from __future__ import annotations

from . import models as v1
from . import models_v2 as v2

MODELS = {
    v1.MODEL_ID: {"module": v1, "version": v1.MODEL_VERSION, "needsWind": False,
                  "preflight": lambda spec, dataset, wind=None: v1.preflight(spec, dataset),
                  "run": lambda spec, dataset, wind=None, **kw: v1.run_experiment(spec, dataset, **{k: v for k, v in kw.items() if k in ("progress", "cancelled")}),
                  "snapshot": v1.model_source_snapshot, "sha256": v1.model_source_sha256, "describe": v1.describe},
    v2.MODEL_ID: {"module": v2, "version": v2.MODEL_VERSION, "needsWind": True,
                  "preflight": lambda spec, dataset, wind=None: v2.preflight(spec, dataset, wind),
                  "run": lambda spec, dataset, wind=None, **kw: v2.run_experiment(spec, dataset, wind, **kw),
                  "snapshot": v2.model_source_snapshot, "sha256": v2.model_source_sha256, "describe": v2.describe},
}


def resolve(spec):
    if not isinstance(spec, dict):
        raise ValueError("ExperimentSpec must be an object")
    entry = MODELS.get(spec.get("modelId"))
    if entry is None:
        raise ValueError(f"unknown modelId {spec.get('modelId')!r}; registered: {sorted(MODELS)}")
    if spec.get("modelVersion") != entry["version"]:
        raise ValueError(f"modelVersion {spec.get('modelVersion')!r} does not match registered {entry['version']} for {spec['modelId']}")
    return entry


def resolve_recorded(provenance):
    """Choose the adapter a recorded result was produced with (used by replay)."""
    return resolve({"modelId": provenance.get("modelId"), "modelVersion": provenance.get("modelVersion")})
