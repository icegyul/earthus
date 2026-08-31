# CODEX APPLY DIRECTIVE — EARTHUS 2.0 Engine Foundation v0.3

## Objective

Apply v0.3 only after recovering the current canonical EARTHUS repository state. Reuse verified 1.0/v8 assets and add v0.3 as adapters/contracts, not a rewrite.

## Repository safety

1. Read `AGENTS.md`, `.agents/skills/luna-chat-coder/SKILL.md`, `docs/HANDOVER.md`, and latest dated handover.
2. Verify local git status, current SHA, `origin/main...main`, worktrees and unrelated dirty/untracked paths.
3. The historical audit observed local `main` ahead of origin by 72 commits. Treat that as historical evidence, not a permanent assumption; re-check current state before editing.
4. Never `reset --hard`, `clean`, or overwrite unrelated work.
5. Use an isolated branch/worktree such as `earthus-2.0-v2-preview`.
6. Do not deploy production during foundation integration.

## Apply order

### Gate 0 — existing capability audit
Map every v0.3 `REUSE_*`/`HARDEN` target to current files and tests. If current code is stronger than this package, keep current code and write an adapter.

### Gate 1 — security and data plane
- SEC-001 Secret Redaction Middleware
- QA-001 Engine Contract Harness
- QA-004 Launch Gate Compiler
- DAT-001 Provider Adapter SDK
- DAT-003 Reprojection/Resampling
- DAT-004 Time Slice Compiler
- DAT-007 Revision/Reconciliation

### Gate 2 — visual/runtime integration
- VIS-010 Material Grammar
- VIS-011 Accessibility Semantics
- VIS-012 Label Budget
- VIS-013 Picking/Inspection
- VIS-014 Camera Choreography
Integrate through the existing Cesium/power/render-quality/runtime ownership paths.

### Gate 3 — ocean/hazard first real scenes
Do not activate a visual if the required provider variables are absent.
- OCN-001..008
- HAZ-001..010
Official warnings remain free and primary.

### Gate 4 — cross-domain intelligence
- INT-001 Planet State Graph
- INT-002 Correlation (never causation)
- INT-003 Analog Retrieval
- INT-005 Personal Impact
- INT-006 Route Exposure
- INT-007 Decision Explanation

### Gate 5 — archive/analytics/space bridge
Reuse v0.2 archive foundation. Add v0.3 analytics and Earthus-Aetherus event handoff only after ownership boundaries are verified.

## Must-not rules

- Do not invent U/V ocean current from scalar speed.
- Do not infer burn perimeter from satellite hotspots.
- Do not call seismic clustering aftershock prediction.
- Do not average conflicting official cyclone tracks into a fake official consensus.
- Do not compute or display tsunami propagation as official unless source/model contract supports it.
- Do not turn statistical correlation into a causal Weather Brief claim.
- Do not store precise user movement by default.
- Do not let cost optimization disable official safety collection.

## Completion evidence

For each activated engine record:
- exact source files and commit SHA
- provider/source contract and rights
- observed/valid timestamps
- unit/coordinate/resolution contract
- automated tests
- degraded/fault-injection result
- Cesium owner/abort/dispose evidence if visual
- desktop/mobile FPS/memory/thermal if dynamic
- rollback procedure

Completion token after all selected foundation gates are actually verified:
`EARTHUS_V03_PLANETARY_COMPLETENESS_FOUNDATION_VERIFIED`
