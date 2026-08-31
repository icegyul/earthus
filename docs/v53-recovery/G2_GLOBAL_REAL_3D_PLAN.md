# G2 Global Real 3D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 단일 Cesium Viewer와 Esri Terrain3D owner를 보존하면서, vertical exaggeration과 photo/shell 착시 없이 기본 EARTH가 큰 1× real-terrain globe로 읽히게 한다.

**Architecture:** `real-living-earth.js`가 provider/runtime owner로 남고, 현재 미추적 presentation module은 G2 terrain-only policy로 rework한다. G3 Water material과 G5 cloud fallback은 기본 부팅에서 분리한다. 실제 provider identity, terrain request/refinement, sampled height, screen-space relief response, screenshot을 함께 기록한다.

**Tech Stack:** CesiumJS 1.143, static ES modules, Node test runner, Playwright, in-app browser.

**Spec:** `docs/v53-recovery/ZERO_START_SOURCE_RECONCILIATION.md`, Zero-Start v5.3 corrected canonical P2.

## Global Constraints

- Existing Viewer 1개만 사용한다.
- Esri Terrain3D가 height authority다.
- `scene.verticalExaggeration === 1`을 유지한다.
- G2에서 Water globe material, ocean asset, GFS layered cloud를 stage하지 않는다.
- default cloud satellite shell은 G2 terrain screenshot을 가리지 않게 OFF/hidden 처리한다.
- imagery는 existing terrain의 material/albedo일 뿐 geometry acceptance가 아니다.
- production deploy, origin push, main merge 없음.

---

### Task 1: Lock corrected G2 contracts in failing tests

**Files:**
- Modify: `tools/earthus-v52/physical-earth-presentation.test.mjs`
- Modify: `tools/test_v2_default_physical_earth_browser.mjs`

**Interfaces:**
- Consumes: `terrainPresentationForHeight(heightM)`, `physicalAmbientCamera()`
- Produces: 1× terrain policy and browser G2 gate

- [ ] **Step 1: Replace the rejected exaggeration expectation**

```js
test('global terrain stays at source scale while presentation requests real LOD', () => {
  assert.equal(terrainPresentationForHeight(10_800_000).verticalExaggeration, 1);
  assert.ok(terrainPresentationForHeight(10_800_000).maximumScreenSpaceError <= 2);
});
```

- [ ] **Step 2: Run the unit test and verify RED**

Run: `node --test tools/earthus-v52/physical-earth-presentation.test.mjs`
Expected: FAIL because `terrainPresentationForHeight` does not exist and old code returns 12×.

- [ ] **Step 3: Replace browser assertions**

```js
assert.equal(state.verticalExaggeration, 1);
assert.notEqual(state.materialType, 'Water');
assert.equal(state.terrainProviderClass, 'ArcGISTiledElevationTerrainProvider');
assert.ok(state.esriTerrainRequests > 0);
assert.ok(state.sampledReliefM > 1000);
assert.ok(state.reliefScreenDeltaPx > 0);
assert.equal(state.canvasCount, 1);
assert.equal(errors.length, 0);
```

- [ ] **Step 4: Run the browser test and verify RED**

Expected current result: rendering stops with `MAX_TEXTURE_IMAGE_UNITS(16)` or fails 1×/no-Water assertions.

### Task 2: Rework presentation to truth-scale G2

**Files:**
- Modify: `prototype/v2/js/physical-earth-presentation.js`
- Modify: `prototype/v2/js/real-living-earth.js`

**Interfaces:**
- Consumes: existing Viewer, Esri Terrain3D, canonical imagery owner
- Produces: `defaultPhysicalSnapshot()` with `terrainScale=1`, camera, SSE, provider identity

- [ ] **Step 1: Implement minimal 1× terrain policy**

```js
export function terrainPresentationForHeight(heightM) {
  return Object.freeze({
    verticalExaggeration: 1,
    maximumScreenSpaceError: heightM > 7_000_000 ? 2 : 1.5,
  });
}
```

- [ ] **Step 2: Remove G2 ownership of ocean material**

`PhysicalEarthPresentationRuntime` must not create or install a Water material. It may set camera, 1× terrain scale, lighting, and bounded SSE only.

- [ ] **Step 3: Make the default camera large and oblique**

Use the existing evidence-backed 10.8 Mm desktop / 12.5 Mm mobile framing, but keep actual terrain at 1×.

- [ ] **Step 4: Keep G3/G5 candidates untracked and inactive**

Do not delete their files. Do not import Water assets or activate layered shell fallback during G2 boot.

- [ ] **Step 5: Run unit test and verify GREEN**

Run: `node --test tools/earthus-v52/physical-earth-presentation.test.mjs`

### Task 3: Prove actual terrain geometry and visual response

**Files:**
- Modify: `tools/test_v2_default_physical_earth_browser.mjs`
- Create: `docs/v53-recovery/evidence/G2_RUNTIME_SNAPSHOT.json`
- Create: `docs/v53-recovery/evidence/G2_BROWSER.md`

**Interfaces:**
- Consumes: browser runtime, Terrain3D network requests, sampled terrain
- Produces: runtime/provider/camera/resource/error/frame evidence

- [ ] **Step 1: Capture provider and network identity**

Record actual ArcGIS elevation URLs and request count; do not accept badge text alone.

- [ ] **Step 2: Sample real terrain and measure response**

Use `Cesium.sampleTerrainMostDetailed` on a visible high-relief point and compare projected source-height vs ellipsoid point before/after a bounded camera change.

- [ ] **Step 3: Record resource/frame state**

Record camera, scope, region, terrain provider, `tilesLoaded`, tile levels, imagery layers, primitives, errors, timeouts, and frame metrics available in the browser.

- [ ] **Step 4: Capture UI-off screenshot and manually compare**

Compare large Earth presence, terrain readability, depth, interaction, and zoom information increase against `https://mapped.earth/earth`; no pixel-copy requirement.

- [ ] **Step 5: Run regression**

```text
node --test tools/earthus-v52/*.test.mjs
node tools/test_v2_canonical_imagery_ownership.mjs
node tools/test_v2_mountain_terrain_browser.mjs
node tools/test_v2_trench_mesh_browser.mjs
```

If a browser dependency or real provider is unavailable, record `BLOCKED_BY_REAL_DEPENDENCY`; do not infer PASS.

### Task 4: Gate and local commit

**Files:**
- Modify: `docs/v53-recovery/evidence/G2_BROWSER.md`

- [ ] **Step 1: Re-read all eight G2 acceptance conditions**
- [ ] **Step 2: Mark G2 PASS only with runtime plus manual visual evidence**
- [ ] **Step 3: Keep G3/G5 files out of the G2 stage set**
- [ ] **Step 4: Run `git diff --check` and exact tests again**
- [ ] **Step 5: Commit only R0 + G2 files with a Korean problem-statement subject**

No push, merge, deploy, or production migration.
