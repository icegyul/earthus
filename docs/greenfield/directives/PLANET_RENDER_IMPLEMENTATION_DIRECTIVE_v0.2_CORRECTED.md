# CANONICAL SUPERSESSION NOTICE — PHYSICAL 3D INTELLIGENCE LOCK

> **STOP. 이 문서의 과거 시각/렌더 규칙은 EARTHUS V2 v5.3 CORRECTED CANONICAL과 충돌할 경우 실행하지 않는다.**
>
> 최상위 규칙:
> - `https://mapped.earth/earth` 수준은 GLOBAL 3D 경험의 **최소 PASS bar**다. 상한이 아니다.
> - EARTHUS는 `GLOBAL → CONTINENT → COUNTRY → REGION → LOCAL → UNDERWATER` 전 구간에서 **하나의 연속된 실제 데이터 기반 3D Earth**다.
> - 줌은 `2D → 3D`가 아니라 `LOW-LOD 3D → HIGH-LOD 3D`다.
> - Raster/satellite imagery는 observation/material input일 뿐 physical geometry/volume의 최종 대체물이 아니다.
> - 성능 fallback은 `HIGH_3D → MEDIUM_3D → LOW_3D → STATIC_3D → OFF`만 허용한다. `PHOTO_SPHERE`, `SATELLITE_SHELL`, `FLAT_TILE_ONLY` final fallback은 금지한다.
> - Canonical Earth State / Event / Evidence / Confidence가 truth를 만들고, 3D/4D Scene은 이를 공간적으로 표현한다.
> - Intelligence와 LLM은 분리한다. LLM은 수치·확률·원인·geometry를 생성하지 않으며, 승인된 SceneIntent를 통해 동일 3D Earth를 탐색/설명한다.
> - Simulation은 immutable observed baseline에서 branch하여 `Earth Diff`를 계산한다. LIVE/OBSERVED state를 mutate하지 않는다.
> - 이 문서 안의 `cloud shell`, `global Earth skin`, `imagery as world`, `VOLUME → ... → SHELL`, `Underwater FUTURE-only` 등 과거 문구는 아래 corrected clause 또는 v5.3 CORRECTED CANONICAL이 우선한다.

**CURRENT CANONICAL:** `EARTHUS_V2_CLAUDE_CODE_FULL_DEVELOPMENT_MASTER_v5.3_KO` (CORRECTED CANONICAL content)

---

# EARTHUS 2.0 Planet Render Implementation Directive v0.2

Status: **FOUNDATION CODE IMPLEMENTED / REAL PROVIDER + DEVICE EVIDENCE PENDING**

## Locked render stack

Quiet Earth:
1. existing Cesium Viewer singleton;
2. atmosphere + sun/lighting;
3. low-LOD real 3D cloud state/geometry; no photo/satellite shell final renderer;
4. terrain remains real 3D globally at low LOD; only detail density stays light.

Land focus:
1. streaming Terrain provider;
2. adaptive screen-space error and tile cache;
3. regional high-detail DEM only when a verified provider/data asset exists;
4. dynamic data is a separate layer, never baked into terrain truth.

Ocean focus:
1. bathymetry relief;
2. separate 0 m ocean surface;
3. one scalar field OR one flow system;
4. buoy/station beacons;
5. no full volumetric effect on mobile while FLOW is active.

Trench / underwater:
- L0: verified bathymetry renders below 0 m.
- L1: sea surface and seafloor are visually separated; trench camera/navigation works above water.
- L2: underwater camera, underwater visual treatment, and memory/thermal real-device evidence all pass.
- precision subduction slabs, P/S waves, and tsunami depth refraction remain blocked until this gate passes with verified regional data.

## Truth rules

- Terrain and bathymetry values are not visually invented.
- Bathymetry source convention is normalized to `depthM = positive down`; Cesium display height is `-depthM`.
- Vertical exaggeration is display metadata only and never mutates source values.
- Synthetic fixtures are allowed only in tests/spikes and must fail closed in production adapters.
- Underwater L2 cannot self-certify: `realDeviceMemoryVerified=true` must come from actual measured device evidence.

## Cloud continuation v0.2

Cloud state now requires explicit source/time/truth classification. Full volume eligibility requires real or model-supported vertical structure (top + base + fraction). Mobile/ECO/SAFE policies do not auto-promote to WebGPU volume.

## Cesium terrain contract

Current CesiumJS supports `viewer.terrainProvider` and asynchronous terrain helpers. The source broker allows runtime Cesium World Terrain (ion token not committed), custom Quantized Mesh URLs, experimental 3D Tiles terrain URLs. Ellipsoid is emergency `DEGRADED_NO_TERRAIN` availability only and cannot satisfy 3D visual acceptance. Production must choose a licensed/approved provider and keep attribution.

## Definition of Done for Land

- real terrain source configured;
- country + regional zoom evidence;
- mobile tile/memory/FPS measurements;
- provider failure falls back safely;
- no second Cesium Viewer;
- OFF/scene transition leaves no orphan timers/workers/primitives.

## Definition of Done for Ocean/Trench

- verified bathymetry dataset + license/attribution;
- 0 m sea surface separation proven;
- trench depth matches source values within display transform;
- camera can enter/exit without clipping/collision corruption;
- desktop and real mobile memory/thermal measurements;
- L2 remains closed if the mobile/device gate fails.


## CORRECTION — Cloud/Visual Fallback
Cloud fallback is `HIGH_3D_VOLUME → MEDIUM_3D → LOW_3D → CTH_3D_RELIEF → STATIC_3D → OFF`. `SHELL/STATIC_SHELL` photo fallback is superseded. Satellite imagery remains observation/material input only.
