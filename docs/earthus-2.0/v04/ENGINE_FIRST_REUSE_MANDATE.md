# EARTHUS ENGINE-FIRST REUSE MANDATE — v0.4

This is a **mandatory development gate**, not guidance.

## Rule 1 — Search before code
Before any engine/algorithm/class/renderer is created, the implementation agent must search:
1. verified EARTHUS 1.0/v8 runtime,
2. Engine Catalog v0.4,
3. Algorithm Catalog v0.4,
4. existing adapters and tests.

## Rule 2 — Required reuse decision
Every implementation task records one of:
`REUSE_AS_IS`, `REUSE_WITH_ADAPTER`, `HARDEN`, `REFACTOR`, `NEW`.

`NEW` is permitted only with a Gap Evidence Record containing:
- repository search evidence,
- catalog search evidence,
- capability mismatch,
- why Adapter/Hardening cannot satisfy the requirement,
- proposed new engine ID and owner.

Convenience, different naming, or “v2 should be clean” are not valid reasons for duplication.

## Rule 3 — Foundation modules are implementation assets
v0.2/v0.3/v0.4 modules and algorithms are not brainstorming references. Reuse them directly or adapt them into the verified repository. Do not rewrite equivalent formulas or policies from prose.

## Rule 4 — Completion is runtime evidence
Files, interfaces, TODO completion, mocks, fixture-only tests and successful syntax checks do **not** equal DONE.
A feature is DONE only when Completion Evidence Compiler requirements pass: actual data, runtime invocation, browser/device evidence, tests, screenshots, performance where applicable, resource disposal, regression and no-duplicate evidence.

## Required completion report fields
- USED_ENGINE_IDS
- USED_ALGORITHM_IDS
- REUSED_FILES
- ADAPTED_FILES
- NEW_FILES
- GAP_EVIDENCE_FOR_NEW_ENGINES
- ACTUAL_DATA_EVIDENCE
- RUNTIME_EVIDENCE
- SCREENSHOT_OR_DEVICE_EVIDENCE
- TEST_RESULTS
- PERFORMANCE_RESULTS
- DISPOSE_RESULTS
- REGRESSION_RESULTS
- ROLLBACK
