# NEW EARTHUS 3D Weather Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/newearthus.html`에 실제 관측·GFS/ECMWF 7일 예측·태풍을 연결한 독립 PBR 3D Earth Engine을 운영 배포한다.

**Architecture:** vendored Three.js r184로 PBR surface/night/atmosphere/volume/event pass를 구성하고, 신규 Lambda가 GFS·ECMWF cloud layer/precipitation을 2.5° RGBA frame으로 원자 배포한다. NOAA 관측은 footprint, 모델 low/mid/high field는 vertical support이며 모든 frame은 Unified Time 의미와 source metadata를 가진다.

**Tech Stack:** static ES modules, Three.js r184, WebGL2 GLSL3, Canvas/WebP/PNG, Python 3.12 Lambda + Pillow, S3/CloudFront, Node `.mjs` unit/browser tests.

**Spec:** `docs/superpowers/specs/2026-08-25-newearthus-3d-weather-engine-design.md`

## Global Constraints

- 기존 `prototype/index.html`과 현재 Cesium Earth를 변경하지 않는다.
- `Aetherus 823_Orbital/`, `Aetherus_Orbital_Environment_Codex_Package_v1.2/`를 읽거나 수정하지 않는다.
- 관측·모델 분석·예측·extended outlook을 동일 material/copy로 표시하지 않는다.
- GFS·ECMWF 값을 평균하지 않는다. 공통 영역은 channel별 min, 차이는 absolute difference다.
- `clampToGround`, 무한 RAF, 무한 재생, 무작위 구름·경로·문구를 사용하지 않는다.
- 다른 작업자의 dirty file을 stage·revert·deploy하지 않는다.
- 테스트 도구·설계 문서는 static bucket에 업로드하지 않는다.

---

### Task 1: NASA/Natural Earth 기반 3D asset pipeline

**Files:**
- Create: `tools/build_newearthus_assets.py`
- Create: `prototype/assets/newearthus/asset-manifest.json`
- Create: `prototype/assets/newearthus/earth-day-4096.webp`
- Create: `prototype/assets/newearthus/earth-night-4096.webp`
- Create: `prototype/assets/newearthus/earth-land-mask-2048.webp`
- Test: `tools/test_newearthus_assets.py`

**Interfaces:**
- Produces: manifest `{assets:[{id,path,width,height,sha256,sourceUrl,credit}]}`.
- Consumes: NASA SVS WMS 2915/2916 and `prototype/data/country-reference.json`.

- [ ] Write a failing test that rejects missing source/credit/hash, non-2:1 texture, and non-binary land mask extrema.
- [ ] Run `python3 tools/test_newearthus_assets.py`; expect failure because builder/assets do not exist.
- [ ] Implement deterministic download input validation, 4096×2048 WebP derivation, Natural Earth raster mask, and manifest hashes.
- [ ] Run the test and `sips -g pixelWidth -g pixelHeight` checks; expect all assets to pass.
- [ ] Commit only Task 1 paths with Korean cause/result message.

### Task 2: GFS·ECMWF 7-day forecast frame collector

**Files:**
- Create: `aws/cloud-forecast-global/handler.py`
- Create: `aws/cloud-forecast-global/requirements.txt`
- Create: `aws/cloud-forecast-global/timeout-seconds.txt`
- Test: `tools/test_cloud_forecast_global.py`

**Interfaces:**
- Produces: `forecast/clouds/v1/latest.json` and immutable RGBA PNG frames.
- Frame channels: `R=low`, `G=mid`, `B=high`, `A=min(precipitation_mm_h/25,1)`.
- Models: `GFS`, `ECMWF`, plus derived `AGREEMENT` and `DIFFERENCE` frame sets.

- [ ] Write fixtures for complete GFS/ECMWF responses, missing times, invalid percentages, future run, and one-provider failure.
- [ ] Run `python3 tools/test_cloud_forecast_global.py`; expect missing module failure.
- [ ] Implement 2.5° global grid batching with fixed `/v1/gfs` and `/v1/ecmwf` host/path allowlist, request timeout, byte ceiling, and retry budget.
- [ ] Quantize 0–120h every 3h and 126–168h every 6h; reject inconsistent time sets.
- [ ] Build model, agreement-min, and absolute-difference PNGs; hash every object before publishing `latest.json` last.
- [ ] Run unit tests, `python3 -m py_compile`, and deterministic replay hash test.
- [ ] Commit Task 2 paths.

### Task 3: NOAA observed cloud history without changing latest behavior

**Files:**
- Modify: `aws/gmgsi-clouds/handler.py`
- Test: `tools/test_gmgsi_cloud_history.py`

**Interfaces:**
- Preserves: `clouds/global.png`, `clouds/meta.json` byte/schema behavior.
- Adds: `clouds/history/<observedAt>.png`, `clouds/history/index.json`.

- [ ] Write failing tests that latest output is unchanged, duplicate observedAt is idempotent, index includes only written objects, and missing hours are not synthesized.
- [ ] Run the tests; expect history contract failure.
- [ ] Extract the existing LA conversion into a pure function and archive the same bytes after the latest write succeeds.
- [ ] Implement bounded initial backfill for source frames actually found in the supported lookback.
- [ ] Run current GMGSI tests plus history tests and syntax compile.
- [ ] Commit Task 3 paths.

### Task 4: Event-driven Three.js Earth engine foundation

**Files:**
- Create: `prototype/js/newearthus/render-scheduler.js`
- Create: `prototype/js/newearthus/camera-controller.js`
- Create: `prototype/js/newearthus/solar-position.js`
- Create: `prototype/js/newearthus/earth-material.js`
- Create: `prototype/js/newearthus/atmosphere-material.js`
- Create: `prototype/js/newearthus/engine.js`
- Test: `tools/test_newearthus_3d_foundation.mjs`
- Browser test: `tools/test_newearthus_3d_foundation_browser.mjs`

**Interfaces:**
- `new NewEarthEngine({container, quality, assets})`
- `engine.setTime(iso)`, `engine.requestRender(reason)`, `engine.dispose()`.
- `solarDirectionAt(iso): {x,y,z}` in engine coordinates.

- [ ] Write failing solar/equinox, finite scheduler, camera clamp, and dispose tests.
- [ ] Run unit tests; expect missing modules.
- [ ] Implement PBR earth shader with day/night blend, land/ocean roughness and atmosphere shell.
- [ ] Implement pointer drag, wheel, pinch and keyboard reset without automatic rotation.
- [ ] Implement finite render scheduler and context-loss fallback.
- [ ] Run unit/browser tests and capture desktop/mobile PBR-only screenshots.
- [ ] Commit Task 4 paths.

### Task 5: Forecast store and bounded texture lifecycle

**Files:**
- Create: `prototype/js/newearthus/forecast-contract.js`
- Create: `prototype/js/newearthus/forecast-store.js`
- Create: `prototype/js/newearthus/observed-store.js`
- Test: `tools/test_newearthus_forecast_store.mjs`

**Interfaces:**
- `ForecastStore.loadManifest()` validates schema/source/time/hash paths.
- `ForecastStore.framePair(mode, cursor)` returns adjacent frame textures and mix factor.
- Keeps at most previous/current/next textures per active model.

- [ ] Write failing tests for forecast boundary, 120/168 classification, partial provider, hash/path traversal, and LRU disposal.
- [ ] Run tests; expect missing store.
- [ ] Implement same-origin manifest/frame loading with AbortController and generation ownership.
- [ ] Implement observed history index loading and NOW seam without nearest-frame substitution.
- [ ] Run tests and commit Task 5 paths.

### Task 6: Spherical 3D cloud volume and mobile fallback

**Files:**
- Create: `prototype/js/newearthus/cloud-volume-material.js`
- Create: `prototype/js/newearthus/cloud-shell-fallback.js`
- Create: `prototype/js/newearthus/cloud-shadow-material.js`
- Test: `tools/test_newearthus_cloud_volume.mjs`
- Browser/perf test: `tools/test_newearthus_cloud_volume_browser.mjs`

**Interfaces:**
- `createCloudVolume(THREE,{quality,frameA,frameB,mix,sunDirection,observationAlpha})`.
- `setFrames(a,b,mix,truth)` rejects observation-as-forecast and missing vertical support.

- [ ] Write failing channel/altitude, observation footprint gate, forecast truth, raymarch-step profile, and dispose tests.
- [ ] Run tests; expect missing volume modules.
- [ ] Implement WebGL2 spherical-shell raymarch using low/mid/high fields and sun lighting.
- [ ] Implement observed footprint + model-analysis vertical support and explicit thin-shell fallback.
- [ ] Implement mobile three-shell fallback and ground shadow pass.
- [ ] Verify cloud parallax, on/off screenshot, 30fps mobile target, 3s idle render 0, and texture baseline after 30 switches.
- [ ] Commit Task 6 paths.

### Task 7: Unified 7-day timeline and source modes

**Files:**
- Create: `prototype/js/newearthus/timeline-controller.js`
- Create: `prototype/js/newearthus/truth-view.js`
- Modify: `prototype/newearthus.html`
- Modify: `prototype/css/newearthus.css`
- Test: `tools/test_newearthus_timeline.mjs`
- Browser test: `tools/test_newearthus_timeline_browser.mjs`

**Interfaces:**
- Modes: `OBSERVED`, `GFS`, `ECMWF`, `AGREEMENT`, `DIFFERENCE`.
- Bands: `PAST`, `NOW`, `PRIMARY`, `MEDIUM`, `EXTENDED`.

- [ ] Write failing tests for mode/band copy, no future satellite frame, finite play, 5-day boundary and 7-day end.
- [ ] Run tests; expect missing controller.
- [ ] Implement slider/play/NOW/source controls and 280–420ms texture crossfade.
- [ ] Implement Truth strip with authority/access provider/issued/valid/retrieved/resolution.
- [ ] Verify 44px, keyboard, reduced motion, no overlap/overflow, and finite stop.
- [ ] Commit Task 7 paths.

### Task 8: Three.js cyclone overlay bound to the same cursor

**Files:**
- Create: `prototype/js/newearthus/cyclone-contract.js`
- Create: `prototype/js/newearthus/cyclone-overlay.js`
- Test: `tools/test_newearthus_cyclone_overlay.mjs`
- Browser test: `tools/test_newearthus_cyclone_browser.mjs`

**Interfaces:**
- Consumes existing `cyclone-tracks.json`, `typhoon-official.json`, `typhoon-ecmwf.json`.
- Produces observed solid/dash, official segmented, ECMWF dotted, ensemble faint line groups.

- [ ] Write failing tests for observed/forecast separation, missing time gaps, antimeridian split, +120h cap, and no synthetic centerline.
- [ ] Run tests; expect missing overlay.
- [ ] Implement geodesic lifted lines/points and cursor visibility without `clampToGround`.
- [ ] Add current storm cloud-volume emphasis only from the cloud field, never a decorative spiral texture.
- [ ] Run existing cyclone geometry/timeline regressions plus new browser tests.
- [ ] Commit Task 8 paths.

### Task 9: Bootstrap integration and complete local acceptance

**Files:**
- Rewrite: `prototype/js/newearthus.js`
- Retire from page only: old Cesium imports; do not delete shared Cesium modules.
- Update: `prototype/newearthus.html`, `prototype/css/newearthus.css`
- Modify tests: `tools/test_newearthus_model.mjs`, `tools/test_newearthus_browser.mjs`
- Create: `tools/verify_newearthus_3d_release.mjs`

- [ ] Write failing integration test requiring Three.js renderer, PBR passes, volume/fallback state, timeline, cyclone, provenance and idle gate.
- [ ] Wire assets/stores/engine/volume/timeline/cyclone in one bootstrap with fail-closed error states.
- [ ] Run all new unit tests and existing cloud/cyclone/visual pipeline regressions.
- [ ] Run desktop 1280×720, 1440×900, Retina and mobile 390×844 browser tests.
- [ ] Compare live candidate against the supplied reference and 822 V-18; document intentional deviations.
- [ ] Commit Task 9 paths.

### Task 10: Backend deployment, data verification, frontend release

**Files:**
- Deploy code only: `aws/cloud-forecast-global`, changed `aws/gmgsi-clouds`.
- Deploy app only: `newearthus.html`, new CSS/JS/assets/vendor references.
- Do not deploy tests/docs.

- [ ] Re-run fresh full verification and record local hashes.
- [ ] Deploy Lambda code with existing env preserved; invoke canary and verify S3 manifest/frame bytes, times, dimensions, model separation, and history index.
- [ ] Add/verify 6-hour EventBridge schedule only after canary success.
- [ ] Upload exact app files with MIME and `no-cache`, then invalidate exact CloudFront paths.
- [ ] Compare live/local SHA for every released file and verify headers.
- [ ] Run `verify_newearthus_3d_release.mjs` against `https://earthus.net/newearthus.html` desktop/mobile.
- [ ] Report `STATIC_OPERATING_3D` only if live PBR, clouds, timeline, sources and idle gate pass; keep physical-device thermal status `UNKNOWN`.
