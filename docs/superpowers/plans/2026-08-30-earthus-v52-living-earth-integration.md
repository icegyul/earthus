# EARTHUS V2 v5.2 Living Earth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a production-deployable `/v2` progressive Living Earth with v5.2 Materialized Earth and measured compute economics, without changing the production root or merging `main`.

**Architecture:** Keep one Cesium Viewer and one canonical Earth provider owner. Add small tested runtime-policy modules, a public AWS/S3 materialized read plane, and a server-authorized private projection boundary. Close P0-P7 visual/runtime failures before allowing deep intelligence.

**Tech Stack:** Static ES modules, Cesium 1.143, Node.js tests, AWS Lambda/S3/CloudFront, Supabase Edge Functions, Playwright Chromium.

**Spec:** `docs/superpowers/specs/2026-08-30-earthus-v52-living-earth-integration-design.md`

## Global Constraints

- Preserve all dirty/untracked work; never reset, restore, clean, or stash.
- No production-root upload, broad S3 sync, broad invalidation, or `main` merge.
- One Cesium Viewer; no synthetic production truth or fake geometry.
- `clampToGround`, infinite animation, random copy, and removal of accident comments are forbidden.
- Official safety stays free; private/premium data never enters public surfaces.
- Each behavior change begins with a failing test and ends with fresh verification.

---

### Task 1: Reconcile source and freeze baseline

**Files:**
- Create: `docs/earthus-v2/V5_2_LIVE_RECONCILIATION_REPORT.md`
- Verify: `prototype/v2/**`, `aws/current-earth-snow-ice/**`, `tools/test_v2_*`

- [ ] Record branch/HEAD/status/worktrees and the preserved untracked inventory.
- [ ] Record package evidence separately from fresh local/browser evidence.
- [ ] Run syntax and current browser tests without changing gates.
- [ ] Record each P0-P12 state using the allowed maturity labels.

### Task 2: Make P0 the sole render/provider authority

**Files:**
- Modify: `prototype/v2/js/visual-fidelity-controller.js`
- Modify: `prototype/v2/js/real-living-earth.js`
- Modify: `tools/test_v2_intelligence_runtime_browser.mjs`
- Create: `tools/test_v2_canonical_imagery_ownership.mjs`

**Interfaces:**
- Consumes: `realEarth.detailImageryLayer()` and FND-017 render policy.
- Produces: one immutable provider/layer identity for the session.

- [ ] Write a failing test that detects any second ArcGIS detail provider or layer replacement.
- [ ] Run it and verify failure against `sessionDetailLayer` ownership.
- [ ] Remove provider creation/swap from the presentation controller.
- [ ] Expose only the canonical layer through `real-living-earth.js`.
- [ ] Re-run Intelligence, mountain, living-Earth, and one-Viewer tests.

### Task 3: Close P1-P7 physical Earth failures

**Files:**
- Modify: `aws/current-earth-snow-ice/index.mjs`
- Modify: `prototype/v2/js/current-earth-seasonal.js`
- Modify: `prototype/v2/js/real-living-earth.js`
- Modify: `prototype/v2/js/visual-fidelity-controller.js`
- Modify: `prototype/v2/js/trench-bathymetry-mesh.js`
- Modify: `prototype/v2/js/gk2a-cth-relief.js`
- Modify: `prototype/v2/js/gfs-cloud-volume.js`
- Modify: `prototype/v2/js/progressive-planet-intelligence.js`
- Test: `tools/test_v2_*browser.mjs`

- [ ] Add failing cache/last-good tests for IMS timeout and unchanged semantic revision.
- [ ] Make the server adapter publish only validated observed receipts and preserve last-good.
- [ ] Add failing visual regression coverage for mountain imagery readiness and canonical provider identity.
- [ ] Fix mountain/coast presentation without geometry exaggeration or threshold weakening.
- [ ] Preserve the existing Trench pass and add failing underwater visibility/resource-disposal tests.
- [ ] Improve source-derived underwater lighting/tone only; keep exaggeration `1`.
- [ ] Verify Shell -> CTH -> Volume truth/fallback and bounded resource cleanup.
- [ ] Verify polar, atmosphere, lighting, global composition, abort generation, and idle rendering.

### Task 4: Implement v5.2 policy, materialization, invalidation, LOD, and versioning

**Files:**
- Create: `prototype/js/earthus2/v04/core/compute-policy-registry.js`
- Create: `prototype/js/earthus2/v04/core/intelligence-lod-policy.js`
- Create: `aws/materialized-earth/lib/materialized-earth-service.mjs`
- Create: `aws/materialized-earth/lib/singleflight.mjs`
- Create: `aws/materialized-earth/lib/dependency-invalidation.mjs`
- Create: `aws/materialized-earth/lib/earth-version-diff.mjs`
- Create: `prototype/v2/js/materialized-earth-runtime.js`
- Test: `tools/earthus-v52/*.test.mjs`

**Interfaces:**
- Produces: `resolveComputePolicy(request, context)`, `buildMaterializedArtifact(spec)`, `invalidateRevision(change)`, `buildEarthVersion(input)`, `diffEarthVersions(a,b)`.

- [ ] Write failing C1 first-load, SWR, SingleFlight, scoped-invalidation, revision-race, and manifest-diff tests.
- [ ] Implement schema-validated policies and deterministic canonical keys.
- [ ] Implement immutable artifact + atomic pointer adapter with last-good.
- [ ] Implement one-leader/follower SingleFlight and generation fencing.
- [ ] Implement bounded dependency invalidation and content-addressed Earth Version/Diff.
- [ ] Connect camera/device state to independent compute and visual ceilings.
- [ ] Connect the browser only to compact public materialized reads.

### Task 5: Implement Compute Economics and private isolation

**Files:**
- Create: `aws/materialized-earth/lib/compute-telemetry.mjs`
- Create: `aws/materialized-earth/lib/compute-cost-ledger.mjs`
- Create: `aws/materialized-earth/lib/capacity-planner.mjs`
- Create: `aws/materialized-earth/lib/workload-router.mjs`
- Create: `prototype/supabase/functions/_shared/v52-entitlement-policy.js`
- Create: `prototype/supabase/functions/v52-projection/index.ts`
- Test: `tools/earthus-v52/compute-economics.test.mjs`
- Test: `tools/earthus-v52/private-isolation.test.mjs`

- [ ] Write failing telemetry-schema, versioned-rate, follower-accounting, CPU-only, and private-cache tests.
- [ ] Implement bounded asynchronous telemetry with a dropped-event counter.
- [ ] Implement deterministic cost calculation that preserves unknown rates.
- [ ] Implement measured workload replay and categorical capacity recommendations.
- [ ] Implement server-side entitlement, minimized private context, no-store response, quota, and metering.
- [ ] Verify public static/API/OG/push/analytics payloads contain zero private fields.

### Task 6: Build the real Weather/Typhoon materialized slice

**Files:**
- Create: `aws/materialized-earth/weather-typhoon.mjs`
- Create: `aws/materialized-earth/index.mjs`
- Create: `prototype/v2/js/materialized-weather-typhoon.js`
- Test: `tools/earthus-v52/weather-typhoon-slice.test.mjs`
- Test: `tools/earthus-v52/weather-typhoon-browser.mjs`

- [ ] Write a failing end-to-end test using complete recorded official-cache receipts.
- [ ] Materialize region snapshot and event capsule with truth/source/revision metadata.
- [ ] Publish one Earth Version delta and rebuild only affected region/event products.
- [ ] Read the compact result in the existing Intelligence panel.
- [ ] Verify no browser upstream fan-out and no C3-C5 on first load.

### Task 7: Full local and production verification

**Files:**
- Create: `tools/verify_v52_local_release.mjs`
- Create: `tools/verify_v52_public_release.mjs`
- Create: `docs/earthus-v2/V5_2_COMPLETION_REPORT.md`

- [ ] Run all syntax, unit, integration, browser, load, privacy, disposal, and diff checks.
- [ ] Run desktop and mobile viewport browser acceptance with screenshot review.
- [ ] Record payload sizes, materialized hit/reuse, compute executions, queue, and cost fields.
- [ ] Commit scoped application/test/docs files with a Korean defect-focused message.
- [ ] Deploy only the exact V2 allowlist, preserving `config.local.js`.
- [ ] Invalidate only `/v2`, `/v2/`, and `/v2/*`.
- [ ] Prove deployed bytes, MIME/cache headers, product identity, no root leakage, and unchanged root hashes.
- [ ] Produce the physical-device test checklist and keep device-only results `NOT TESTED` until executed on hardware.
