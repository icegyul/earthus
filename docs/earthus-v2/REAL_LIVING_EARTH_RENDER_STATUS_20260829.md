# EARTHUS V2 — REAL LIVING EARTH RENDER STATUS

Date: 2026-08-29
Branch: `earthus-v2/real-living-earth-render`
Base remote commit: `75d5015bebdd745ff31f238a24a44119fdf19c19`

## Purpose

Replace the V2 preview's smooth ellipsoid + NaturalEarthII model-globe path with a truth-first Living Earth render path while preserving the existing EARTHUS V2 UI shell and canonical Cesium viewer lifecycle.

This branch is intentionally isolated because the remote GitHub baseline is older than the current local canonical EARTHUS V2 worktree. Do not force-merge or overwrite the newer local worktree. Rebase/cherry-pick the relevant changes into the current local canonical source after auditing the local tree.

## Implemented

- V2 bootstrap no longer creates its own `Cesium.EllipsoidTerrainProvider` or attaches Cesium `NaturalEarthII` as the production Earth path.
- Reuses the canonical `prototype/js/viewer.js` singleton via `initViewer()`; no second Cesium Viewer is created by the new runtime.
- Attempts real combined land + seafloor elevation with Esri `WorldElevation3D/TopoBathy3D` through `Cesium.ArcGISTiledElevationTerrainProvider.fromUrl()`.
- Falls back to Esri `Terrain3D` for real land terrain if TopoBathy3D is unavailable; only then falls back to the existing ellipsoid instead of inventing elevation.
- Uses NASA GIBS Blue Marble Shaded Relief Bathymetry as global context, Esri World Imagery for closer land detail, and VIIRS City Lights for night context.
- Loads the existing EARTHUS NOAA NESDIS GMGSI observed cloud product (`API.CLOUDS/meta.json` + `global.png`) and renders it on a separate atmospheric shell instead of painting it on the ground.
- Cloud distribution/time is observed data. The shell's 12 km placement is explicitly `DISPLAY_ONLY_NOT_CTH`; it is not exposed as observed cloud-top height.
- Reuses existing observed-cloud-derived visual shadow code. The shadow remains explicitly visual-only and is not treated as cloud height, irradiance, or hazard truth.
- Adds `OCEAN -> Bathymetry / Trench` mode. It uses TopoBathy3D negative elevation directly, separates a local 0 m sea surface, enables an oblique camera, and reads a provider terrain sample near the Challenger Deep region.
- Trench mode fails closed when combined real bathymetry is unavailable.
- Provider/truth state is visible on-screen instead of silently substituting synthetic fixtures.
- Cleanup closes cloud refresh timers, Cesium camera listeners, document listeners, primitives/entities, added imagery layers, and V2 source UI across retry/dispose.
- Leaving the trench feature restores the normal Earth scene instead of retaining stale trench state.

## Files

- `prototype/v2/index.html`
- `prototype/v2/js/real-living-earth.js`

## Static verification completed

- V2 inline JavaScript: `node --check` PASS
- `real-living-earth.js`: `node --check` PASS
- `EllipsoidTerrainProvider` absent from the V2 bootstrap HTML
- `NaturalEarthII` absent from the V2 bootstrap HTML
- Real runtime import present
- `Bathymetry / Trench` feature present
- No synthetic terrain/bathymetry/trench fixture is used in the new runtime

## Not yet closed / do not claim complete

1. Real GK2A CTH (cloud-top-height) L1 geometry is not wired from a verified provider in this remote baseline.
2. Real NWP cloud vertical density/base/top L2 volume is not wired from a verified provider in this remote baseline.
3. Actual deployed Chrome/Safari/iPhone/Android visual evidence has not been produced from this isolated branch.
4. Real-device FPS, memory, battery, thermal, context-loss, and repeated mode-transition acceptance are not yet evidenced.
5. Because the user's latest local canonical repository is newer than this GitHub branch, local integration must preserve that worktree and audit conflicts before applying these changes.

Until those gates are closed, the honest status is:

`REAL TERRAIN + REAL BATHYMETRY + OBSERVED CLOUD SHELL FOUNDATION: IMPLEMENTED ON ISOLATED BRANCH`

`TRUE 3D CTH/NWP CLOUD + REAL-DEVICE PRODUCTION ACCEPTANCE: NOT YET CLOSED`
