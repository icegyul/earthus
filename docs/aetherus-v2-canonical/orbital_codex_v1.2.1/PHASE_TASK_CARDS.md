# PHASE TASK CARDS — paste one card at a time into Codex

## P0 Repository / CI / evidence
Implement only P0 from the Master Spec. Create the repository skeleton, services, migrations, CI, tests, Docker Compose, health checks and evidence generator. Do not implement scientific features yet. Run clean-clone boot verification. Return evidence JSON and stop.

## P1 Ingestion / canonical identity
Implement adapters and raw immutable snapshots. CelesTrak first, Space-Track credential adapter second. Canonical object identity must support 6+ digit IDs as strings, aliases, international designators and source conflicts. OMM-first. Add source rate-limit/cache behavior, provider outage states, snapshot hashes, migrations and tests. Return evidence and stop.

## P2 Orbit / time / frames
Implement SGP4 plus UTC/time-scale/frame conversion and ephemeris API. Golden fixtures and deterministic cross-validation are mandatory. Do not render UI positions from any placeholder. Return evidence and stop.

## P3 Explore UI
Render only API-derived positions. Implement LOD, selected-object orbit line, source age/provenance badges and explicit unavailable states. Browser network inspection must prove coordinates come from API. Return evidence and stop.

## P4 Conjunction
Implement conservative coarse screening -> refined TCA -> covariance-aware Pc plug-in -> CDM parser -> risk provenance. Operational Pc is forbidden without valid covariance/method. Verification fixtures must pass tolerances before `VALIDATED`. Return event recall/false-event/TCA/Pc evidence and stop.

## P5 Benefit
Implement baseline graph, REMOVE counterfactual graph, affected-subgraph selective recomputation, direct beneficiary attribution and persisted Benefit(k→i). Prove full-vs-selective equivalence within documented tolerance and benchmark speed/memory. Return evidence and stop.

## P6 PROTECT / candidate OCM
Implement protected-object reverse ranking and scenario groups for nominal + candidate OCMs. Evaluate all scenarios against a common external object set. Report removed, changed **and newly created** conjunction edges. Return evidence and stop.

## P7 Genealogy / origin / media
Implement typed parent/source-event relationships, origin uncertainty and visual resolver. Every image must have source + license/cache policy + truth label. A launch/source image cannot be labeled actual debris. Return evidence and stop.

## P8 Fragmentation / long horizon
Implement research-only breakup cohorts and Monte Carlo long-horizon propagation with explicit assumptions/model version. Never present scenario outputs as observed facts. Return evidence and stop.

## P9 Observation Intelligence / Citizen Science
Implement station registry, visibility, information-gain ranking, requests, submissions, QA and contribution records. Rejected observations must never update canonical orbit solutions. Return before/after covariance evidence only on validated test data and stop.

## P10 Research datasets / benchmark
Implement immutable dataset versions, raw/derived/provenance separation, manifests, hashes, license checks, CSV/JSON/Parquet exports and algorithm benchmark runner. Reconstruct one dataset entirely from its manifest. Return evidence and stop.

## P11 Operations
Implement tenant-separated fleet views, candidate-maneuver comparison, authorization and audit. Product is advisory only: no spacecraft command/transmission endpoint. Return security/isolation tests and stop.

## P12 Production hardening
Run source-outage, rate-limit, load, security, observability, backup/restore and disaster-recovery exercises. No phase completion without recorded evidence and unresolved limitations list.
