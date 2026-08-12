# Release evidence — HUD and Earth–Moon restoration — 2026-08-12

## Scope

- Restore the collapsed `HUD` handle on ordinary public URLs. The panel remains
  user-controlled and remembers only the user's own open/closed choice.
- Keep the HUD below the AETHERUS Earth-return control so neither blocks the
  other.
- Enable Cesium's time-positioned Moon in the main Earth scene.
- Add a visible Moon mesh and orbit beside Earth in the AETHERUS Solar System.

## Representation boundary

The main Earth scene uses Cesium's time-dependent celestial direction; the Moon
is not forced onto the screen when its real direction is outside the camera.
The AETHERUS Solar-System Moon is an explicitly labelled educational schematic:
its synodic phase advances deterministically, while its size and Earth distance
are compressed so both bodies remain visible at the product's logarithmic Solar
System scale. The HUD states this limitation in Korean and English.

## Protected behavior

- No continuous animation or new network polling is introduced.
- The Moon texture reuses the existing licensed celestial-body asset contract.
- Earth still exits AETHERUS to the Earth scene when selected; the Moon remains
  independently selectable.
- Existing `#dev` diagnostics are not required to open the restored HUD handle.

## Verification

- Syntax-check `viewer.js`, `ui.js`, `cosmic3d.js`, and `main.js` as ES modules.
- Run every `tools/test_aetherus_*.mjs` regression.
- Inspect the actual Solar-System view for Earth, Moon, Moon label, HUD text,
  and Earth-return/HUD non-overlap before and after deployment.
- Verify production SHA-256, JavaScript/CSS MIME, cache policy, and a
  cache-busting browser load.
