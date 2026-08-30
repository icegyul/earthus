# EARTHUS V2 Default Physical Earth Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/v2` entry composition that reads as a wrapped photograph with a source-backed land/ocean/cloud 3D composition.

**Architecture:** Keep the existing Cesium Viewer and provider authority. Add a physical-surface presentation module, a Natural Earth water-mask asset, and a GFS data-derived layered cloud fallback; wire them into the default Earth path without changing Trench/Underwater truth contracts.

**Tech Stack:** CesiumJS 1.143, ES modules, Python/Pillow deterministic asset build, Node tests, Playwright browser/readPixels verification, S3/CloudFront scoped deploy.

**Spec:** `docs/superpowers/specs/2026-08-31-earthus-v2-default-physical-earth-correction-design.md`

## Global Constraints

- Preserve the current dirty/untracked worktree; no reset, restore, clean, or stash.
- No `main` merge.
- No synthetic cloud coverage or undisclosed terrain scale.
- No infinite animation or automatic rotation.
- Production root `/`, `/index.html`, and `/sw.js` remain unchanged.

### Task 1: Lock the physical default acceptance in failing tests

**Files:**
- Create: `tools/earthus-v52/gfs-layered-cloud.test.mjs`
- Create: `tools/test_v2_physical_surface_assets.py`
- Create: `tools/test_v2_default_physical_earth_browser.mjs`

- [ ] Write pure-data tests for low/mid/high density collapse with a hand-checked fixture.
- [ ] Write asset tests for deterministic 2:1 Natural Earth ocean mask, land/ocean samples, source metadata, and water normal dimensions.
- [ ] Write a browser test requiring default terrain exaggeration, Water material, non-shell default cloud, and screen-space cloud/ground separation.
- [ ] Run each test and record the expected missing-module/flat-default failure.

### Task 2: Implement deterministic ocean assets and physical surface policy

**Files:**
- Create: `tools/build_v2_physical_surface_assets.py`
- Create: `prototype/v2/assets/physical-earth/ocean-specular-mask.png`
- Create: `prototype/v2/assets/physical-earth/water-normal.jpg`
- Create: `prototype/v2/assets/physical-earth/manifest.json`
- Create: `prototype/v2/js/physical-earth-presentation.js`
- Modify: `prototype/v2/js/real-living-earth.js`
- Modify: `prototype/v2/js/visual-fidelity-controller.js`

- [ ] Generate and verify the Natural Earth mask and vendored Cesium normal asset with hashes/credits.
- [ ] Implement distance-bounded 12×→1× terrain exaggeration and static Water material ownership.
- [ ] Restore material/exaggeration correctly across Earth, Trench, Underwater and disposal.
- [ ] Run pure and browser tests until surface gates pass.

### Task 3: Make valid GFS vertical structure visible by default

**Files:**
- Create: `prototype/v2/js/gfs-cloud-layered-fallback.js`
- Modify: `prototype/v2/js/gfs-cloud-volume.js`
- Modify: `prototype/v2/js/real-living-earth.js`

- [ ] Implement low/mid/high density collapse from the real altitude axis and density bytes.
- [ ] Render three bounded regional shell meshes with real bounds and representative altitudes.
- [ ] Add a no-camera-takeover option to desktop voxel activation.
- [ ] Upgrade the default after base first-frame readiness; preserve truthful shell-only failure.
- [ ] Run unit/browser/readPixels and repeated mode-transition disposal tests.

### Task 4: Strengthen CI and production acceptance

**Files:**
- Modify: `.github/workflows/real-living-earth-ci.yml`
- Modify: `.github/workflows/real-living-earth-visual-browser.yml`
- Modify: `.github/workflows/real-living-earth-intelligence-browser.yml`

- [ ] Add syntax, pure asset/data tests, and default physical browser evidence to CI.
- [ ] Run 19 existing v5.2 tests, load replay, mobile acceptance, and all Living Earth browser gates.
- [ ] Human-review desktop/mobile screenshots; reject flat composition even if numeric gates pass.
- [ ] Commit and push only task files to the feature branch.
- [ ] Require all seven workflows to pass on the exact deploy SHA.
- [ ] Deploy tracked `/v2` only, invalidate `/v2*`, prove S3 bytes and production-root invariance, then repeat production desktop/mobile browser acceptance.
