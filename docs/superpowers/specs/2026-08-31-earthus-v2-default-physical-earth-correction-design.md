# EARTHUS V2 Default Physical Earth Correction Design

Status: `USER_REJECTED_FLAT_COMPOSITE` → implement the already approved 2026-08-25 3D Earth direction in `/v2`.

## Problem

The deployed default view is truthful about its sources but visually wrong for the product. At entry it uses a 29.2 Mm nadir camera, terrain exaggeration 1, `WATER: imagery surface`, and `CLOUD: SHELL`. Real Terrain3D and GFS volume exist but are not visible in the default composition. The result is a photograph wrapped around an ellipsoid.

Source truth is not visual acceptance. The default view must visibly separate land geometry, ocean material, and cloud geometry before a menu is opened.

## Required default composition

### Land

- Keep Esri Terrain3D as the height authority.
- Use `Scene.verticalExaggeration` only at global/continental distance, relative to the ellipsoid, with a disclosed maximum of 12×.
- Fade to 1× before regional/detail work so measurements and close terrain remain source scale.
- Use an oblique ambient camera and a larger globe silhouette so relief produces an actual horizon/parallax response.

### Ocean

- Build a deterministic Natural Earth public-domain ocean specular mask from the tracked country geometry.
- Apply a Cesium Water globe material with that mask and a vendored Cesium water-normal asset.
- Set water animation speed to zero. Fresnel/specular response may change with camera and light, but idle rendering must not be kept alive.
- Trench and Underwater keep their existing separate flat-surface/bathymetry contracts and restore the default material on exit.

### Clouds

- Default desktop attempts the existing real GFS `VoxelPrimitive` without taking over the camera.
- If voxel rendering is blocked by device policy, derive low/mid/high regional shell alpha from the same `density.u8` and its real geometric altitude axis. This is `MODELLED_NWP_LAYERED`, not observed volume.
- The NOAA GMGSI observed shell remains the horizontal observed context at reduced opacity; it is not presented as vertical evidence.
- If GFS and GK2A are unavailable, retain the honest observed shell with `OBSERVED_2D_FALLBACK`.

## Runtime ownership

`real-living-earth.js` remains the single visual owner. New focused modules only derive physical presentation values or own the layered GFS fallback. `visual-fidelity-controller.js` changes LOD properties but creates no providers.

## Default acceptance

The default `/v2/` view must prove all of the following in real browser state:

1. `Scene.verticalExaggeration > 1` at the default global camera and returns to 1 at detail distance.
2. Globe material is Water and uses the tracked Natural Earth ocean mask.
3. Default cloud fidelity becomes `VOLUME`, `MODELLED_NWP_LAYERED`, or `CTH_RELIEF` when corresponding data is valid; a valid GFS artifact may not remain unused behind `SHELL`.
4. Camera motion changes the screen-space separation of a cloud altitude point and its ground point.
5. Ocean brightness/specular response changes with view direction while land-mask samples remain non-water.
6. No infinite animation, duplicate Viewer, synthetic cloud coverage, horizontal overflow, or console/page error.
7. The UI discloses terrain exaggeration, cloud truth class and valid time, and ocean mask/material source.

## Release boundary

Do not merge `main`. Deploy only tracked `/v2` files after local browser evidence and all seven branch CI workflows pass on one exact SHA. Production root files remain byte-identical. Physical iPhone/Android thermal evidence stays separate.
