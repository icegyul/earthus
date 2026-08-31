# CODEX APPLY DIRECTIVE — EARTHUS 2.0 Engine Foundation v0.2

## Objective

Apply the v0.2 foundation to the verified canonical local EARTHUS repository and create an isolated `/v2` preview without modifying or deploying the existing root service.

## Hard preflight

1. Read `AGENTS.md`, `.agents/skills/luna-chat-coder/SKILL.md`, `docs/HANDOVER.md` and the latest dated handover.
2. Run:

```bash
git status --short --branch
git rev-parse HEAD
git branch -vv
git rev-list --left-right --count origin/main...main
git worktree list
```

3. Confirm the current local commit is the intended canonical state. The audit baseline was `2eb7c4ba...`; at audit it was 72 commits ahead of `origin/main`. Do not reset or overwrite unfamiliar local work.
4. Stop if branch identity, tracked changes or source ownership is unclear.

## Task branch

Create or reuse a protected task branch such as:

```text
earthus-2.0-v2-preview
```

Do not implement directly on production `main`.

## Phase A — engine capability audit

Run:

```bash
node tools/earthus2-v02/audit_engine_capabilities.mjs <repo-root>
```

For every existing candidate record:

```text
component
path
exists
runtime consumer
input/output
status evidence
reuse decision
adapter boundary
known tests
performance evidence
```

Do not replace existing `viewer.js`, `power.js`, `render-quality.js`, v8 truth/time/source contracts, KTO/Seoul/KMA/AirKorea collectors or proven visual modules.

## Phase B — isolated foundation

1. Copy the package's new paths only:
   - `prototype/js/earthus2/v02/`
   - `tools/earthus2-v02/`
   - `docs/earthus-2.0/v02/`
   - `fixtures/earthus2-v02/`
2. Integrate through `adapters/v8-compat.js`.
3. Create `/v2` preview assets and a separate Service Worker/cache namespace.
4. Root `/`, root service worker and production data objects must remain untouched.

## Phase C — Wave 0 only

Implement/integrate the 16 foundation contracts:

- Globe/thermal/truth/time/source adapters
- Canonical Signal
- Engine Runtime SDK and Resource Governor
- Scene Orchestrator
- Truth Budget and Visual Semantic Linter
- Canonical Signal Lake index
- Geospatial Reference
- Country Focus
- Terrain Broker/LOD
- Paid Intelligence delivery shell

Do not start full 3D cloud, forecast, NAS deletion or mass layer conversion before Wave 0 gates pass.

## Required tests

```bash
bash tools/earthus2-v02/run_all_checks.sh <repo-root>
```

Additionally prove:

- existing root app regression;
- one dynamic engine + one static context maximum;
- all owned requests/timers/GPU resources disposed on layer OFF;
- actual-grid absence never becomes actual fine tower;
- vector absence never becomes flow arrows;
- official warning/evacuation/safety remains free;
- premium tabs use preview, not hidden menus;
- forecast/analysis/simulation styles are distinct;
- `/v2` cache and analytics do not pollute `/`.

## Stop conditions

Stop and report instead of guessing when:

- local source identity cannot be established;
- an existing engine is newer or different than the package assumption;
- provider contract/rights are unknown;
- a requested visual requires fabricated data;
- actual spatial grid or vector data is absent;
- formal `/v2` isolation cannot be guaranteed;
- a test requires production mutation or secret disclosure.

## Required report

Create:

- `docs/earthus-2.0/v02/INTEGRATION_STATUS.md`
- `docs/earthus-2.0/v02/REUSE_EVIDENCE_LOG.md`
- exact changed-file list
- before/after tests
- local `/v2` screenshots
- FPS/memory/network/resource-disposal measurements
- blocked/unknown items
- rollback instructions

Completion token for this first integration only:

```text
EARTHUS_V2_WAVE0_INTEGRATED_PREVIEW_COMPLETE
```

This token does not mean production deployment, device qualification or full Earthus 2.0 completion.
