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

## Production result

- Feature commit: `79b2f11`; shared-viewer recovery: `e937d0e`; service-worker
  entry revision: `efbcdaf`.
- Final CloudFront invalidation: `I7C3XZTJEXBLLZO55K7WDWWSOO` for `/` and
  `/index.html`, after `I64WDI2LTW9OBV5NWECK9IOUB6` refreshed the recovered
  `main.js`.
- Final production SHA-256:
  - `index.html`: `b74e266eb50b326805020c2f61a3f475dc60c37131499253ca290f7da4f20f68`
  - `app.css`: `a427fa555277f14b8006d8789ced6d93a8f3ab66f0cf4112d775788b8110d5fa`
  - `main.js`: `7b15a605b5785c06db3d502526b46562e87a3d6a3f3370c6fe47ed771870d65d`
  - `viewer.js`: `14fd6da5382d69502ec910034c63208a477eb7fe08e04743257708a55d600c51`
  - `ui.js`: `6efb7e6d912add5e50e0a6dbadebdeb2e475803a8e52dc8eda0036a93dd9f274`
  - `cosmic3d.js`: `d38a45056f7560b7901fd29e635a2cdc392e34d81f3c6cdfa0165661d852dff5`
- Production files returned the expected HTML, CSS, or JavaScript MIME and
  `cache-control: no-cache`; downloaded bytes matched the checked-out files.
- Live `?aetherus=3&solar=1` showed the Solar-System HUD, Earth, Moon label,
  compressed-distance notice, restored HUD handle, and working Earth-return
  control. Opening the HUD produced no overlap with Earth return.
- A browser release check caught and immediately corrected a transient module
  singleton split: versioning only one `viewer.js` import created two module
  instances and left `scene` undefined. The final entry uses the single shared
  unversioned `viewer.js` URL and a new `main.js` entry revision; the live app no
  longer reports initialization failure.
