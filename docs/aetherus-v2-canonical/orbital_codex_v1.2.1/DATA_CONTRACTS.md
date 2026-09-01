# Data Contracts

## Canonical identity
- `catalog_id` is a string; never assume 5 digits.
- NORAD catalog ID and COSPAR/International Designator are identifiers, not display names.
- Source-specific names are aliases; `canonical_name` can change without identity change.

## Provenance envelope (required on scientific outputs)
```json
{
  "source_ids": ["celestrak_gp"],
  "source_snapshot_at": "...",
  "input_artifact_hashes": ["sha256:..."],
  "model_id": "sgp4-vallado",
  "model_version": "...",
  "config_hash": "...",
  "quality_grade": "PUBLIC_GP",
  "limitations": []
}
```

## Risk metric separation
`PC`, `MAX_PC`, `MISS_DISTANCE`, `CONJUNCTION_EXPOSURE`, `DENSITY`, `FRAGMENTATION` are separate channels. Never overwrite one with another. Composite research scores must preserve components and weights/version.

## Source grades
`OPERATIONAL_CDM`, `OFFICIAL_VERIFICATION`, `PUBLIC_GP`, `PUBLIC_SCREENING`, `SPEC_EXAMPLE`, `CITIZEN_OBSERVATION_VALIDATED`, `CITIZEN_OBSERVATION_PENDING`, `SIMULATION_ONLY`.
