# Aetherus Orbital Environment — Implementation Order

**Applies to:** Codex, OpenCode, 0x Alpha, Claude Code, or any coding agent operating on the Aetherus Orbital Environment repository  
**Package baseline:** v1.2.1 corrective release  
**Canonical product specification:** `MASTER_DEVELOPMENT_SPEC.md`  
**Execution rule:** One phase at a time. A later phase never compensates for a failed earlier gate.

---

## 0. Why this file exists

This file defines the only allowed implementation sequence.

The package contains specifications, schemas, validation fixtures, patent-boundary material, and completion gates. It is **not evidence that the product has been implemented**. Existing repositories, branches, screenshots, routes, old test logs, or previous “PASSED” reports are historical inputs only until the current canonical repository reproduces the required evidence.

The current restart baseline shall be treated as:

```text
PRODUCT BASELINE: NOT ACCEPTED
P0: BLOCKED UNTIL REVALIDATED
DOWNSTREAM PHASE STATUS: HISTORICAL / UNVERIFIED UNTIL IMPORTED AND RETESTED
```

Do not begin P6–P12 merely because partial code exists. First close the canonical repository, P0 infrastructure, and P1–P5 scientific data path.

---

## 1. Mandatory read order

Before changing any code, read these files in exactly this order:

1. `START_HERE_CODEX.md`
2. `README_CODEX.md`
3. `MASTER_DEVELOPMENT_SPEC.md`
4. `IMPLEMENTATION_ORDER.md`
5. `PHASE_TASK_CARDS.md`
6. `DATA_CONTRACTS.md`
7. `ALGORITHM_SPEC.md`
8. `schema.sql`
9. `openapi.yaml`
10. `schemas/*.json`
11. `QUALITY_GATES.md`
12. `acceptance_matrix.csv`
13. `validation/*`
14. `PATENT_SOURCE_MAP.md`

After reading, the agent must produce a short **pre-change plan** containing:

- canonical repository path and branch,
- current Git status and uncommitted changes,
- existing services and infrastructure,
- exact phase being implemented,
- files expected to change,
- migrations expected to run,
- tests and evidence required for the phase,
- blockers that prevent a real implementation.

No implementation begins until this plan exists.

---

## 2. Canonical repository intake — required before P0

### 2.1 Preserve existing work

Never run any destructive command before the working tree is audited.

Forbidden unless the user explicitly authorizes it after seeing an audit:

```text
git reset
git reset --hard
git checkout .
git restore .
git clean
git stash
rm -rf on existing source trees
```

Record:

```text
repository root
remote URL
current branch
HEAD SHA
origin branch SHA
working-tree status
untracked files
worktrees
candidate implementation branches
```

### 2.2 Select one canonical product root

There must be one canonical repository root. Duplicate repositories or worktrees may be used as evidence sources, but they cannot both be treated as production truth.

Create:

```text
docs/audit/CANONICAL_REPOSITORY_DECISION.md
```

It must state:

- selected canonical root,
- reason for selection,
- branches/worktrees treated as reference sources,
- files or commits proposed for selective import,
- files explicitly rejected as obsolete, mock-only, or conflicting.

### 2.3 Existing-code import rule

Existing P1–P5 code is not copied wholesale.

For each candidate commit/module:

1. identify the phase and acceptance IDs it claims to satisfy;
2. inspect for mock, fixture, constant-return, graph-edge deletion, or UI-only behavior;
3. verify contracts against current `schema.sql`, `openapi.yaml`, and JSON schemas;
4. port only the valid portion into the canonical repository;
5. add or update automated tests;
6. regenerate current evidence;
7. record source commit and imported paths.

Create one import record per imported unit:

```text
docs/audit/imports/<phase>-<source-sha>.md
```

Old logs are historical evidence, not current PASS evidence.

---

## 3. Universal per-phase workflow

Every phase P0–P12 follows this exact loop.

### Step A — Scope lock

- Implement only the current phase and explicitly required dependencies.
- Do not add later-phase UI merely to make progress appear larger.
- Mark unavailable downstream surfaces as `BLOCKED_BY_PHASE_<n>`.

### Step B — Contract first

Before business logic:

- confirm request/response schema,
- confirm persistence tables and migrations,
- confirm error/status enums,
- confirm provenance fields,
- confirm source-grade and validation-state rules.

### Step C — Pure scientific core

Scientific calculations must live in testable pure-core modules. HTTP handlers, UI components, notebooks, and database repositories may orchestrate but may not hide the only implementation of the mathematics.

### Step D — Persistence and lineage

Every derived scientific result must be traceable to:

```text
source ID
raw artifact hash
source snapshot/retrieval time
epoch/time system/frame
algorithm name and version
configuration version
input hash
validation state
known limitations
```

### Step E — API and UI

- API returns the defined envelope and error states.
- UI consumes the API; it does not recreate or invent scientific values.
- `0` is permitted only when a calculation produced zero.
- Missing prerequisites produce `UNAVAILABLE`, `INSUFFICIENT_DATA`, `STALE`, `PARTIAL`, `VALIDATION_PENDING`, or `RESEARCH_ONLY` as appropriate.

### Step F — Tests

Run:

- phase unit tests,
- phase integration tests,
- contract/schema tests,
- required golden/official fixtures,
- relevant regression suite,
- E2E tests when UI/API is part of the phase,
- performance/equivalence tests when specified.

### Step G — Evidence

Write:

```text
artifacts/evidence/<phase>.json
```

Required minimum fields:

```json
{
  "phase": "P0",
  "repository": "<canonical-root>",
  "branch": "<branch>",
  "commit": "<git-sha>",
  "started_at": "<UTC>",
  "finished_at": "<UTC>",
  "inputs": [],
  "migrations": [],
  "tests": [],
  "database_assertions": [],
  "api_assertions": [],
  "ui_assertions": [],
  "benchmarks": {},
  "source_artifacts": [],
  "limitations": [],
  "acceptance_ids": [],
  "gate": "PASS|FAIL|BLOCKED"
}
```

### Step H — Stop

After producing the phase report, stop. Do not start the next phase until the current evidence is reviewed and accepted.

---

# 4. Required implementation sequence

## P0 — Repository, infrastructure, CI, migrations, evidence

### Goal

Establish a reproducible product runtime. P0 is not satisfied by source files alone.

### Required deliverables

```text
canonical monorepo/repository structure
API service
worker service
web service shell
PostgreSQL + PostGIS
Redis
S3-compatible object storage (MinIO acceptable for local)
migration framework
health/readiness endpoints
structured logging
CI lint/type/unit/integration workflow
evidence generator
.env.example with no secrets
clean-clone/bootstrap instructions
```

### Required proof

- clean checkout starts from documented commands;
- Postgres, Redis, object storage, API, worker, and web are healthy;
- migration applies to an empty database and re-running is safe;
- object-store write/read/hash round trip succeeds;
- Redis write/read/expiry succeeds;
- worker accepts and completes a trivial non-scientific job;
- API and web readiness checks pass;
- tests run in CI or an equivalent reproducible local command;
- `artifacts/evidence/P0.json` exists.

### P0 forbidden shortcuts

- SQLite in place of the specified canonical Postgres path without an explicit temporary test adapter;
- local filesystem treated as production object storage without an S3-compatible adapter contract;
- health endpoint that always returns 200 without dependency checks;
- evidence JSON manually written without test-run inputs;
- hidden Docker dependency not captured in setup instructions.

### P0 exit gate

P0 passes only when a clean environment reproduces the stack and the evidence. If Docker or equivalent infrastructure cannot run, P0 is `BLOCKED`, not `PASS`.

---

## P1 — Provider ingestion, immutable raw artifacts, canonical identity

### Goal

Create the first real data path:

```text
provider -> raw immutable artifact -> parser -> canonical object/orbit record -> DB/API -> provenance
```

### Required implementation

- provider-neutral adapter interface;
- CelesTrak GP/OMM adapter first;
- Space-Track credentialed adapter contract second;
- rate-limit/backoff/cache policies;
- immutable raw artifact in object storage with SHA-256;
- ingestion run status and error JSON;
- canonical `space_object`, aliases, source keys, origin uncertainty;
- `catalog_id` stored as text and supporting 6+ digits;
- OMM-first normalization;
- malformed-record quarantine;
- append/version behavior rather than destructive overwrite.

### Required proof

- known object fetched from a real source or fixed recorded provider snapshot;
- raw bytes stored and hash verified;
- normalized rows visible in Postgres;
- repeated identical payload deduplicates raw artifact but records ingestion runs;
- 6+ digit ID survives ingestion/search/serialization;
- provider 429 and outage produce controlled stale/retry behavior;
- malformed record does not poison the whole batch;
- credentials never appear in logs;
- `artifacts/evidence/P1.json` passes.

### Exit gate

No P2 until a real or immutable recorded source artifact can be traced through the DB and API.

---

## P2 — Orbit propagation, time systems, coordinate frames, ephemeris API

### Goal

Turn canonical orbit solutions into reproducible positions and velocities.

### Required implementation

- SGP4 path for valid GP/OMM inputs;
- UTC-aware timestamps;
- epoch handling and data-age policy;
- explicit TEME/Earth-fixed/geodetic frames;
- precision ephemeris interface for OEM/OCM without silently downgrading it to GP;
- deterministic input/result hashes;
- ephemeris API with time-range and sample limits;
- stale and invalid-element states.

### Required proof

- trusted golden state at epoch;
- forward/backward deterministic checks;
- frame conversion and configured tolerance;
- invalid elements return explicit error, never NaN to UI;
- data age and provenance appear in API response;
- browser or consumer coordinates match the backend result;
- `artifacts/evidence/P2.json` passes.

### Exit gate

No 3D implementation may claim live tracking until P2 golden tests pass.

---

## P3 — Explore 3D product surface

### Goal

Provide an honest public-facing exploration experience using only P1/P2 outputs.

### Required implementation

- API-derived object positions;
- global/mid/focus LOD;
- selected-object orbit line;
- object identity, type, origin/source, and data-age labels;
- loading, stale, partial, unavailable, and WebGL error states;
- no all-object orbit-line rendering on first load;
- provenance/research drawer entry point;
- network/E2E proof that the UI does not use hardcoded position data.

### Required proof

- known object search/select/focus path;
- coordinates in UI correspond to API payload;
- stale/unavailable fixture produces the correct UI state;
- global view remains usable under the defined device profile;
- `artifacts/evidence/P3.json` passes.

### Exit gate

A beautiful 3D globe is not P3 PASS unless the data lineage is demonstrable.

---

## P4 — Conjunction screening, TCA, Pc, CDM, risk provenance

### Goal

Create a physically meaningful conjunction pipeline.

### Required implementation

```text
conservative coarse screening
-> candidate pairs
-> precise TCA refinement
-> miss distance and relative velocity
-> covariance validation
-> Pc plugin only when prerequisites pass
-> CDM parse/versioning
-> metric-specific risk provenance
```

### Required proof

- injected/verification close pairs survive screening;
- false-negative gate is satisfied on the chosen validation corpus;
- known TCA and boundary cases pass tolerance;
- multi-minimum windows are handled;
- missing/invalid covariance returns `PC_UNAVAILABLE`, not 0;
- Pc stays in [0,1] and method/HBR/units are recorded;
- MaxProbability and Pc remain separate metric types;
- same event can append multiple snapshots without overwrite;
- current event/API records exist;
- `artifacts/evidence/P4.json` passes.

### Exit gate

Do not use edge deletion, imported risk values without lineage, or a composite “risk score” as a substitute for P4.

---

## P5 — Baseline/counterfactual Benefit engine and affected-subgraph equivalence

### Goal

Implement the patented product core:

```text
baseline risk graph G0
-> intervention scenario
-> physically recomputed scenario graph Gs
-> per-object metric delta
-> Benefit(target -> beneficiary)
```

### Required implementation

- immutable baseline snapshot;
- scenario definition and run separated;
- idealized REMOVE with explicit assumption;
- target state modification at an effective time;
- affected-object/edge selection with reason codes;
- real CA/risk recomputation for affected paths;
- safe reuse only for proven unaffected baseline regions;
- direct benefit attribution;
- metric channels preserved independently;
- environment benefit stored separately;
- persisted benefit rows and result hash;
- PARTIAL science behavior where needed.

### Explicitly invalid P5 implementation

The following is `SIMULATION_ONLY` and cannot satisfy P5:

```text
copy baseline graph
remove every edge incident to target
call the remaining graph the scenario result
```

P5 requires trajectory/state intervention and P4 recalculation over the affected domain.

### Required proof

- synthetic exact-delta test;
- real or official-fixture scientific path;
- no-data case generates no fake beneficiaries;
- full recomputation and affected-subgraph output agree within policy tolerance;
- beneficiary-set difference is empty within policy;
- speed/memory benefit is reported separately from physics equivalence;
- DB contains `scenario_run` and `benefit_result` rows;
- API returns beneficiary, metric, baseline, scenario value, delta, confidence/provenance;
- UI highlights only API-returned beneficiaries;
- `artifacts/evidence/P5.json` passes.

### Exit gate

No P6 until operational Benefit results exist and full-vs-selective equivalence passes.

---

## P6 — PROTECT reverse query and candidate OCM scenario groups

### Goal

Support both:

```text
REMOVE A -> WHO BENEFITS?
PROTECT Y -> WHAT SHOULD CHANGE?
```

and compare nominal/candidate OCMs without hiding new risks.

### Required implementation

- protected-object candidate generation with traceable reasons;
- `Benefit(k -> Y)` ranking;
- confidence and new-risk penalty;
- inactive/research protected-object mode;
- nominal plus one-or-more candidate OCM group;
- fixed external object snapshot;
- same-designator self-screen exclusion;
- resolved, changed, and newly created edge lists;
- candidate file/input hashes;
- advisory-only wording and no command path.

### Required proof

- deterministic synthetic reverse-ranking test;
- low-confidence case suggests more observation rather than fabricating certainty;
- candidate that reduces one edge but creates another displays both;
- API and persisted scenario/benefit evidence;
- `artifacts/evidence/P6.json` passes.

---

## P7 — Genealogy, origin/source intelligence, visual assets

### Goal

Explain where an object came from and show truthful media.

### Required implementation

- typed object/launch/event/parent/mission relationships;
- OWNER, SOURCE, ORIGIN, launch state, and political responsibility kept distinct;
- ambiguous/unknown/multinational states;
- object/event relation provenance;
- visual-asset resolver priority:

```text
ACTUAL PHOTO
RECOVERED FRAGMENT
RADAR IMAGE
TELESCOPE IMAGE
SOURCE SATELLITE
LAUNCH IMAGE
OFFICIAL GRAPHIC
AETHERUS SIMULATION
```

- source, license, cache policy, captured time, verification state;
- broken-media fallback.

### Required proof

- known debris family genealogy;
- unknown origin remains unknown;
- launch image is visibly labeled `LAUNCH IMAGE`, never `ACTUAL PHOTO`;
- source and license visible;
- `artifacts/evidence/P7.json` passes.

---

## P8 — Fragmentation and long-horizon research simulation

### Goal

Model hypothetical collision/breakup consequences as research scenarios.

### Required implementation

- versioned breakup-model plugin;
- known values or explicit distributions/ranges for unknown mass/structure;
- reproducible Monte Carlo seed policy;
- fragment cohorts instead of pretending every simulated fragment is a tracked catalog object;
- long-horizon propagation and exposure metrics;
- indirect Benefit attribution;
- assumption, percentile, model-version, and `RESEARCH_ONLY` labels.

### Required proof

- same seed/config reproduces result hash;
- assumptions are downloadable and visible;
- removal of the relevant breakup path decreases modeled indirect exposure;
- simulation output is never inserted as observed catalog truth;
- `artifacts/evidence/P8.json` passes.

---

## P9 — Observation Intelligence and Citizen Science

### Goal

Generate scientifically useful observation missions and safely validate submissions.

### Required implementation

- station/equipment/timing/calibration registry;
- pass visibility, horizon mask, azimuth/elevation, illumination/eclipse, solar/moon constraints where supported;
- mount angular-rate and optional Earthus weather constraints;
- expected information-gain estimate with versioned measurement-noise model;
- observation-priority explanation;
- request/submission/QA lifecycle;
- immutable raw upload/hash;
- duplicate, time, station, residual, calibration, and license checks;
- accepted-only orbit-determination hook;
- realized information gain calculated separately from expected gain;
- user contribution record backed by before/after metrics.

### Required proof

- known visibility window;
- mount/weather constraints exclude an impossible request;
- bad timestamp/outlier cannot update canonical orbit;
- accepted measurement emits the controlled downstream event;
- no unsupported “your observation improved 10%” value;
- `artifacts/evidence/P9.json` passes.

---

## P10 — Research datasets and benchmark platform

### Goal

Publish reproducible raw/derived/provenance datasets and algorithm validation.

### Required implementation

- immutable dataset/version records;
- manifest containing source hashes, snapshots, schema/model/config versions, row counts, licenses, limitations;
- CSV/JSON/JSONL/Parquet export as appropriate;
- checksum and license filters;
- CA/TCA/Pc/Benefit/runtime benchmark runner;
- full-vs-affected equivalence benchmark;
- isolated execution design for later third-party model submissions.

### Required proof

- one dataset fully reconstructed from its manifest;
- deterministic rows/hash where applicable;
- restricted source excluded or linked according to license;
- checksum verified;
- `artifacts/evidence/P10.json` passes.

---

## P11 — Operations, fleet, and removal intelligence

### Goal

Provide private enterprise analysis on top of the validated scientific core.

### Required implementation

- tenant isolation and authorization;
- private ephemeris encryption/access/retention policy;
- fleet exposure;
- candidate OCM comparison reusing P6;
- removal-target report using P5/P8 and supplied engineering inputs;
- access and analysis audit logs;
- advisory-only product boundary;
- no spacecraft command or transmission endpoint.

### Required proof

- cross-tenant record leakage = zero;
- candidate new-risk results visible;
- access/action audit records exist;
- command attempts are explicitly rejected and no command endpoint exists;
- `artifacts/evidence/P11.json` passes.

---

## P12 — Production hardening and operational acceptance

### Goal

Prove the product survives realistic failures and load.

### Required implementation and exercises

- provider outage and stale-cache behavior;
- rate-limit and retry policy;
- worker failure/restart and idempotency;
- API load and queue backpressure;
- database backup/restore;
- object-store recovery/checksum;
- Redis-loss recovery from canonical stores;
- security scans and secret redaction;
- observability dashboards/alerts;
- WebGL/context-loss handling;
- disaster-recovery and runbook test;
- unresolved limitation register.

### Required proof

- dated exercise reports;
- logs/metrics/traces;
- recovery point and recovery time results;
- security/tenant regression;
- no falsely completed jobs after restart;
- `artifacts/evidence/P12.json` passes.

---

# 5. Dependency map

```text
P0
└── P1
    └── P2
        └── P3
        └── P4
            └── P5
                ├── P6
                ├── P7
                ├── P8
                └── P9
                    └── P10
                        └── P11
                            └── P12
```

Additional rules:

- P3 may proceed after P2, but it may expose only P1/P2 truth.
- P5 depends on validated P4 calculations; imported edges alone do not satisfy the dependency.
- P6 depends on real P5 Benefit attribution.
- P8 indirect Benefit depends on P5 data contracts.
- P9 may build station/QA plumbing earlier on a branch, but it is not product-accepted until P0/P1/P2 and accepted-only update paths are proven.
- P10 benchmark claims cannot be validated against unaccepted P4/P5 science.
- P11 cannot compensate for missing P4/P5/P6.

---

# 6. Allowed parallel work

Parallel branches are permitted only when contracts are frozen and dependencies are respected.

Safe examples:

- P3 UI skeleton may be built while P2 is being tested, but all scientific fields remain unavailable until real APIs pass.
- P7 media-license ingestion can be developed independently from P4, but cannot be declared product-complete before canonical identity is stable.
- P9 station registry/UI may be developed independently, while observation influence on orbit remains disabled until accepted-only integration passes.

Unsafe examples:

- building P6 rankings from hardcoded or edge-deletion P5 output;
- building enterprise dashboards on fixture risk numbers;
- building citizen “contribution percentage” without before/after OD metrics;
- publishing research datasets before hashes, licenses, and versions are implemented.

---

# 7. Completion language

Use only one of these verdicts:

```text
PASS — every required gate and current evidence passed
FAIL — implementation exists but a required test/gate failed
BLOCKED — a real external/infrastructure dependency prevents completion
PARTIAL — only when the phase contract explicitly permits partial scientific output; phase itself remains not PASS unless all phase gates allow it
HISTORICAL — old evidence not reproduced in the current canonical repository
NOT STARTED — no qualifying implementation exists
```

Never use “done”, “complete”, “implemented”, or “finished” as a substitute for a gate verdict.

---

# 8. Mandatory phase report template

```markdown
# Aetherus Orbital Environment — <PHASE> Result

## Verdict
PASS | FAIL | BLOCKED | HISTORICAL | NOT STARTED

## Canonical source
- Repository:
- Branch:
- Commit:
- Working tree:

## Implemented scope
- ...

## Files changed
- ...

## Migrations
- command
- result

## Real or recorded inputs
- provider/source:
- artifact/hash:
- snapshot/epoch:

## Tests
- command:
- passed/failed/skipped:

## Database assertions
- ...

## API assertions
- ...

## UI/E2E assertions
- ...

## Benchmarks/equivalence
- ...

## Evidence
- `artifacts/evidence/<phase>.json`

## Known limitations
- ...

## Unimplemented items
- ...

## Next allowed phase
- ...
```

---

# 9. Restart instruction for the current project

For the current redevelopment effort, execute in this order:

```text
1. Audit all repositories/worktrees and select the canonical root.
2. Preserve existing changes; classify old code/evidence as HISTORICAL.
3. Close P0 with live Postgres/PostGIS, Redis, object storage, migrations, CI, workers, and evidence.
4. Import or rebuild P1 ingestion/identity and reproduce current evidence.
5. Import or rebuild P2 orbit/time/frame and reproduce golden evidence.
6. Connect P3 Explore only to accepted P1/P2 APIs.
7. Complete P4 operational scientific path: screening, TCA, CDM/covariance-aware Pc, provenance.
8. Replace graph-edge-deletion P5 logic with true state/trajectory intervention and P4 recomputation.
9. Prove full-vs-affected equivalence and persist real Benefit results.
10. Only then begin P6, followed by P7 through P12.
```

This order is mandatory even when later-phase folders or old passing reports already exist.
