# EARTHUS 2.0 — VS-00 FIRST PAGE / QUIET EARTH VIEW

## Result
`earthus.net/v2` opens on a beautiful, quiet Earth. The existing Cesium viewer is reused. No dynamic data engine is active by default.

## Mandatory reuse
- `prototype/js/viewer.js` / `globalThis.__earthusViewer`
- `power.js`, `render-quality.js`
- current scene/store/resource ownership
- Engine Foundation Truth/Time/Device/Reuse/Completion contracts

## Hard rules
- Never create a second `new Cesium.Viewer`.
- Initial primary dynamic engine count = 0.
- No fake pressure/cloud/temp/crowd/forecast numbers.
- Earth Intelligence panel opening is UI-only until the user selects a context.
- Root `/` remains untouched while `/v2` is under acceptance.
- 30 mount/unmount cycles must not leak DOM roots, postRender listeners, timers, fetches or GPU-owned resources.

## Layout
Top-left EARTHUS / top-center search / top-right location+account / left domain rail / right collapsed EARTH INTELLIGENCE / bottom LIVE EARTH + NOW + camera context. Mobile turns the domain rail into a bottom rail and intelligence into a bottom-sheet-like panel.

## Preview
`prototype/v2/index.html` is structure-only and uses an approved-direction concept image. Production must mount `home-first-page.js` on the real existing Cesium viewer.

## DONE token
`EARTHUS_V2_VS00_FIRST_PAGE_RUNTIME_COMPLETE`
