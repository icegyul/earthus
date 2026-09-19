# Package File Map

## Runtime source

- `prototype/js/earthus2/v02/core/` — canonical truth, runtime, resource, scene, localization, fail-soft and trust contracts.
- `prototype/js/earthus2/v02/geo/` — coordinate, country focus, terrain, bathymetry and morph foundations.
- `prototype/js/earthus2/v02/visual/` — manifest, linter, tower, flow and volume foundations.
- `prototype/js/earthus2/v02/human-flow/` — algorithms, graph and forecast lifecycle.
- `prototype/js/earthus2/v02/weather/` — ensemble, nowcast, evidence, narrative, precipitation, gap and moisture.
- `prototype/js/earthus2/v02/cloud/` — satellite broker, Cloud State, forecast, render and procedural detail.
- `prototype/js/earthus2/v02/hydrology/` — hydrography and runoff foundations.
- `prototype/js/earthus2/v02/paid/` — entitlement, usage, panel, country unlock, rights and offline pack.
- `prototype/js/earthus2/v02/storage/` — canonical lake, archive, verification, restore, delta, event and replay.
- `prototype/js/earthus2/v02/ops/` — health, modelops, readiness, cost and observation gap.
- `prototype/js/earthus2/v02/adapters/` — existing v8 compatibility boundaries.

Runtime JavaScript modules: **61**.

## Contracts and catalogs

- `ENGINE_CATALOG_v0.2.md/.csv/.json`
- `ALGORITHM_CATALOG_v0.2.md/.csv/.json`
- `IMPLEMENTATION_WAVES_v0.2.md/.json`
- `REUSE_DECISION_MATRIX.md/.csv`

## Tests and tools

- `tools/earthus2-v02/*.test.mjs`
- `run_all_checks.sh`
- `audit_engine_capabilities.mjs`
- `generate_engine_waves.mjs`
- `verify_package_manifest.mjs`

## Fixtures

- Antimeridian country geometry.
- Regional satellite-source fixtures.

## Package-only deliverables

- DOCX overview outside the repo-add patch.
- ZIP package.
- Git patch containing only new repository paths.
