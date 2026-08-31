# G2 Browser Evidence

검증 대상: preserved dirty working tree의 G2 rework

```text
AUTOMATED G2 CONTRACT: PASS
GLOBAL LOW-LOD TERRAIN RELIEF: PASS
GLOBAL→ASIA→KOREA→SEORAK→SOKCHO: BROWSER_VERIFIED
TRENCH REGRESSION: PASS
UNDERWATER REGRESSION: PASS
MANUAL UI-OFF G2 TERRAIN ACCEPTANCE: PASS
G2 GLOBAL REAL 3D: LOCAL_PASS
```

배포·origin push·main merge는 수행하지 않았다. 이 판정은 G2 육지 Gate에만 적용하며 G3 Ocean, G4 Atmosphere, G5 Cloud, G6 Region Streaming을 대신하지 않는다.

## 이전 실패와 교정

| state | evidence | result |
|---|---|---|
| clean `19c22c01` | 32,820 km, small Earth, observed cloud shell, imagery dominant | `FAIL` photo globe |
| 기존 dirty attempt | 12× `Scene.verticalExaggeration` + Water globe material | `FAIL`; fragment texture units 16 초과 |
| 1× direct terrain only | actual Terrain3D는 존재하지만 global relief가 `0.374px` | runtime PASS, visual FAIL |
| 최종 G2 | Terrain3D level-2 height 10,368개로 shadow-only low-LOD material 생성 | G2 local acceptance PASS |

## GlobalTerrainReliefPass

- 기존 FND-015 Terrain3D provider만 사용한다.
- provider: `ESRI_WORLDELEVATION3D_TERRAIN3D`
- truth class: `PROVIDER_DERIVED_TERRAIN_MATERIAL`
- synthetic: `false`
- sample level: `2`
- material grid: `144×72`, `10,368` samples
- positive land samples: `3,710`
- sampled range: `-27.02m`–`5,338.32m`
- observed load duration: `928ms` warm / `5,789ms` cold run
- geometry/camera/measurement scale: `1×`
- material meaning: actual height-gradient shadow only
- Global/Asia: visible
- Korea/Local/Trench/Underwater: hidden
- raster is existing verified geometry의 material input이며 terrain geometry를 대체하지 않는다.

## Runtime evidence

- Viewer/canvas: `1/1`
- Terrain provider URL: `.../WorldElevation3D/Terrain3D/ImageServer/`
- `verticalExaggeration`: `1`
- FND-017 stable GLOBAL SSE: `1.05`
- rendered terrain levels: `1–2`
- Terrain3D requests: `57–58`
- Everest point sample: `8,838.8126m`
- source-height screen response: `0.3743px`
- Globe material: source height/slope, texture samplers `0`
- low-LOD shadow material: one bounded single-tile derived material
- cloud: `OFF` during G2
- ocean material: none; G3 deferred
- requestRenderMode: `true`
- idle frames / 1s: `0`
- failed requests / HTTP errors / console errors / uncaught errors: `0`
- same-frame relief ON SHA-256: `38c931a0704a7b67785d9e525c731bea63bd761fd7ed0684b041297f3beb10a0`
- same-frame relief OFF SHA-256: `79265e49af7c146cbb480c862ba6c36a63104bed9938fc5447559e68d104b690`

`globe.tilesLoaded`는 high-detail normal refinement가 계속되는 동안 false일 수 있다. G2 first visual readiness는 별도 bounded low-LOD relief pass의 provider sample 완료, layer attachment, source metadata, UI-off frame으로 판정한다. 확대 sequence의 Korea·Seorak·Sokcho에서는 기존 strict tile-ready gate를 그대로 통과했다.

## G2 acceptance matrix

| gate | status | evidence |
|---|---|---|
| UI/label OFF actual 3D | `PASS` | 1× Terrain3D + source-derived shadow material, no shell |
| camera-dependent terrain response | `PASS` | global screen response + oblique/default and nadir/close sequence |
| GLOBAL real terrain geometry | `PASS` | ArcGIS heightmap requests, provider identity, real samples |
| photo sphere only가 아님 | `PASS` | terrain-derived material and height/slope shader are active |
| Earth presence | `PASS` | 14.5Mm oblique framing |
| zoom information increase | `PASS` | relief pass ON at Global/Asia, OFF at Korea/Local, actual high-LOD Terrain3D handoff |
| runtime evidence | `PASS` | provider/network/camera/resources/errors/frame metrics captured |
| mapped.earth G2 terrain floor | `PASS_G2_ONLY` | UI-off terrain structure is legible; dynamic ocean/cloud/flow comparison remains later Gates |

## Regression

- default G2 browser contract: PASS
- canonical imagery owner: Viewer 1, canvas 1, ArcGIS imagery owner 1
- mountain/coast sequence: PASS
- sampled Mariana Trench mesh: PASS
- sub-kilometer Underwater detail: PASS
- no second Viewer, no Water globe material, no photo/shell fallback in default G2

## Screenshots

- `G2_DEFAULT_UI_ON.png` — SHA-256 `cf9d12646440dfbbc1bc401992e25285b939664b8143f2acdb008a15c0f2cc30`
- `G2_DEFAULT_UI_OFF.png` — SHA-256 `38c931a0704a7b67785d9e525c731bea63bd761fd7ed0684b041297f3beb10a0`

## Final

```text
R0 RECONCILIATION: PASS
G2 GLOBAL REAL 3D: LOCAL_PASS
G3 REAL OCEAN: NOT STARTED
READY FOR PRODUCTION: NO
```
