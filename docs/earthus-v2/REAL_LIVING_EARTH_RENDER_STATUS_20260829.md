# EARTHUS V2 — REAL LIVING EARTH RENDER STATUS

Date: 2026-08-29
Branch: `earthus-v2/real-living-earth-render`
Base remote commit: `75d5015bebdd745ff31f238a24a44119fdf19c19`

## Purpose

Replace the V2 preview's smooth ellipsoid + NaturalEarthII model-globe path with a truth-first Living Earth render path while preserving the existing EARTHUS V2 UI shell and canonical Cesium viewer lifecycle.

This branch is intentionally isolated because the remote GitHub baseline is older than the current local canonical EARTHUS V2 worktree. Do not force-merge or overwrite the newer local worktree. Rebase/cherry-pick the relevant changes into the current local canonical source after auditing the local tree.

## Implemented render path

- V2 bootstrap no longer creates its own `Cesium.EllipsoidTerrainProvider` or attaches Cesium `NaturalEarthII` as the product Earth path.
- Reuses the canonical `prototype/js/viewer.js` singleton via `initViewer()`; no second Cesium Viewer is created by the new runtime.
- Real combined land + seafloor elevation path: Esri `WorldElevation3D/TopoBathy3D` through `Cesium.ArcGISTiledElevationTerrainProvider.fromUrl()`.
- Real land fallback: Esri `Terrain3D`; only then the canonical ellipsoid fallback, never invented elevation.
- NASA GIBS Blue Marble Shaded Relief Bathymetry for global context, Esri World Imagery for close detail, VIIRS City Lights for night context.
- Existing EARTHUS NOAA NESDIS GMGSI observed cloud product renders on a separate atmospheric shell. Its 12 km shell placement is explicitly display-only and never exposed as observed CTH.
- `OCEAN -> Bathymetry / Trench`: uses negative TopoBathy3D elevation, separates a local 0 m sea surface, and reads a real provider depth sample.
- `OCEAN -> Underwater`: opens only after a valid negative TopoBathy3D depth sample. Collision/translucency/fog/background/underground-color changes are local to the mode and are restored on exit/dispose.

## Real cloud fidelity ladder implemented

The V2 Clouds action now uses this strict order:

1. `VOLUME` — bounded Cesium `VoxelPrimitive` volume from NOAA NCEP GFS 0.50 degree NWP vertical cloud structure.
2. `CTH_RELIEF` — GK-2A AMI Level 2 official cloud-top-height mesh at source CTh metre heights, no vertical exaggeration.
3. `SHELL` — observed NOAA NESDIS GMGSI global cloud shell.

There is no synthetic cloud fallback.

### GK-2A CTH producer

Files:
- `aws/gk2a-clouds/cth_pipeline.py`
- `aws/gk2a-clouds/combined_handler.py`
- `aws/gk2a-clouds/deploy_cth_into_existing.sh`
- `prototype/v2/js/gk2a-cth-relief.js`

Truth contract:
- official Level 2 `CTh` only;
- units must explicitly be km or m;
- `CTH_flag == 0` when the quality flag exists;
- invalid/missing cells do not generate triangles;
- direct lat/lon grids are preferred;
- otherwise the existing EARTHUS-verified GK2A GEOS scan convention is used to recover geography;
- source CTh height is preserved with no display exaggeration;
- output declares `OBSERVED_DERIVED_OFFICIAL_L2`, `synthetic:false`.

The existing scheduled `gk2a-clouds` Lambda can be preserved and overlaid with the CTH producer instead of creating a parallel satellite ingestion system. CTH failure is fail-soft: the existing observed satellite imagery remains valid and V2 falls back to the shell.

### NOAA GFS true vertical volume producer

Files:
- `aws/gfs-cloud-volume/handler.py`
- `aws/gfs-cloud-volume/requirements.txt`
- `aws/gfs-cloud-volume/deploy.sh`
- `prototype/v2/js/gfs-cloud-volume.js`

Truth contract:
- NCEP NOMADS GFS 0.50 degree source;
- bounded East Asia request only;
- pressure-level `TCDC`, `HGT`, plus `CLWMR` and `ICMR` provenance statistics;
- TCDC cloud fraction is resampled by real GFS HGT onto a bounded uniform geometric-altitude axis;
- missing TCDC/HGT causes the build to fail instead of becoming invented clear sky;
- GRIB horizontal axes are normalized to voxel west->east / south->north orientation;
- output density is UINT8 representation of model TCDC fraction;
- output declares `MODELLED_NWP`, `production:true`, `synthetic:false`;
- browser renderer uses Cesium `VoxelPrimitive` in the existing Viewer.

## Fail-closed behavior

- No real TopoBathy3D -> Trench/Underwater does not open.
- No valid provider depth sample -> Underwater does not open.
- No GFS volume artifact or no Cesium voxel runtime -> try real GK2A CTH.
- No valid GK2A CTH artifact -> retain observed NOAA GMGSI shell.
- No layer invents terrain, bathymetry, trench depth, CTH, or NWP cloud density.

## Automated verification

Workflow: `.github/workflows/real-living-earth-ci.yml`

GitHub Actions run `33221087958`: **SUCCESS**.

Verified by CI:
- Python syntax for GK2A CTH / combined handler / GFS volume producer;
- JavaScript syntax for GK2A relief / GFS voxel / real-living-earth runtime;
- V2 product bootstrap contains no direct `new Cesium.EllipsoidTerrainProvider` model path;
- V2 product bootstrap contains no `NaturalEarthII` model path;
- real runtime import exists;
- Bathymetry / Trench and Underwater entries exist;
- cloud truth labels and fallback ladder exist;
- deployment helper shell syntax passes;
- no second Cesium Viewer constructor exists in the new V2 runtime.

## Still required before the word COMPLETE may be used

1. Execute the GK2A producer against the actual deployed AWS runtime and prove `clouds/gk2a/cth/manifest.json` + `grid.json` from a current real Level 2 frame.
2. Execute the GFS producer and prove `clouds/gfs/volume/east-asia/manifest.json` + `density.u8` from a current NOMADS cycle.
3. Render those artifacts in the actual browser and capture visual evidence for Earth, CTH, Volume, Trench, and Underwater.
4. Run Chrome/Safari and physical iPhone/Android acceptance: FPS, memory/GPU texture bytes, battery/thermal, context loss, and repeated mode transitions.
5. Integrate into the user's newer local canonical worktree without resetting or overwriting its newer uncommitted/committed work.

Current honest status:

`REAL TERRAIN + REAL BATHYMETRY + UNDERWATER + OBSERVED CLOUD SHELL + REAL GK2A CTH PRODUCER/RENDERER + REAL GFS NWP VOXEL PRODUCER/RENDERER: IMPLEMENTED ON ISOLATED BRANCH`

`STATIC / TRUTH-CONTRACT CI: PASS`

`LIVE AWS ARTIFACT + BROWSER/PHYSICAL-DEVICE ACCEPTANCE: NOT YET CLOSED`
