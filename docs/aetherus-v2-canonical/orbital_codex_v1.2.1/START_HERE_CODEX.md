# START HERE — Codex / OpenCode execution instructions

You are implementing **Aetherus Orbital Environment**, not a visual mock-up.

## Read in this exact order before changing code
1. `README_CODEX.md`
2. `MASTER_DEVELOPMENT_SPEC.md`
3. `IMPLEMENTATION_ORDER.md`
4. `DATA_CONTRACTS.md`
5. `ALGORITHM_SPEC.md`
6. `schema.sql`
7. `openapi.yaml`
8. `schemas/*.json`
9. `QUALITY_GATES.md`
10. `acceptance_matrix.csv`

## Hard execution rule
Implement **one phase at a time**. Do not skip phase gates to make UI progress look impressive. P0 must pass before P1, P1 before P2, etc. A downstream route may be stubbed only if it is explicitly marked `BLOCKED_BY_PHASE_<n>` and cannot expose fabricated scientific results.

## Definition of DONE
A phase is DONE only when:
- production code exists (no TODO/pass/constant-return placeholder in required paths),
- migrations/schema changes are committed,
- automated tests pass,
- required fixtures or real provider snapshots are recorded,
- API contract is exercised,
- persistence is verified where specified,
- observability/error paths exist,
- `artifacts/evidence/<phase>.json` is generated,
- known limitations are listed,
- the phase gate in the Master Spec is satisfied.

A screenshot, page, route, component, chart, 3D dot, or count **is not evidence of scientific completion**.

## Scientific truth rules
- Never invent Pc, TCA, miss distance, position, confidence, re-entry time, object counts, country ownership, benefit score, or image provenance.
- If covariance is absent, do not calculate/label operational Pc. Return an explicit insufficient-data state.
- Never relabel SOCRATES MaxProbability as CDM Collision Probability.
- OMM/OCM are first-class. Do not design identifiers or parsers around five-digit TLE assumptions.
- Preserve source, snapshot, epoch, model version, method, input hash, and validation status for derived scientific results.
- Rejected citizen observations cannot mutate the canonical orbit solution.
- Candidate maneuver evaluation must report **newly created conjunction edges**, not only removed risk.

## Required response after each phase
Report only:
1. phase implemented,
2. files changed,
3. migrations run,
4. tests run and exact results,
5. evidence artifact path,
6. real/fixture source IDs used,
7. benchmark numbers where required,
8. blockers/limitations,
9. next allowed phase.

Do not say “complete” or “done” if any required gate is missing.
