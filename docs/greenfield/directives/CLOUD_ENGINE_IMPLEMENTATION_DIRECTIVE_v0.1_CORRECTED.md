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

# EARTHUS 2.0 Cloud Engine Implementation Directive v0.1

Status: **FEASIBILITY IMPLEMENTED / REAL GK2A RUNTIME NOT YET VERIFIED**

This package turns the existing v3.5 cloud specification into a bounded implementation spike. It does not create new engine IDs. It implements runtime pieces for the already-defined `CLD-001` through `CLD-010` direction, especially `CLD-002 Cloud Top`, `CLD-005 Canonical Cloud State`, and `CLD-009 Adaptive Cloud Renderer`.

## Locked product behavior

- Global / far camera: low-LOD real 3D cloud mesh/state. Satellite image is observation/material input only.
- Country / nearer camera: Cloud-Top 3D Relief from real CTH.
- Region / explicit user cloud-detail request on capable desktop: bounded Cesium Voxel/3D Volume.
- Mobile current policy: low-LOD 3D or CTH relief only. No automatic full volume.
- SAFE thermal state: STATIC_3D or OFF. No photo/static shell.
- No synthetic fixture may enter production runtime.
- Layer OFF / scene change must abort fetches and destroy Primitive, WebGPU texture, buffer, animation frame, and overlay canvas.
- Existing `globalThis.__earthusViewer` is mandatory. Production integration must never instantiate a second Cesium Viewer.

## Real GK2A data contract

KMA API Hub exposes GK2A Level 2 meteorological products using the path family:

`/api/typ05/api/GK2A/LE2/{product}/{area}/data?date=yyyymmddHHMM&authKey=...`

The product list includes `CTPS` (cloud phase/top temperature/top height/top pressure), `CLA` (cloud analysis information), and `CLD` (cloud detection). KMA/NMSC product documentation describes CTPS as NetCDF using GEOS coordinates and includes `CTh`, `CTH_flag` and related quality fields. CTH is documented in kilometres.

The API key is a runtime secret. This package contains only URL builders and never a key.

## v0.1 relief artifact contract

The preprocessor writes:

- `manifest.json`
- `lat.f32`
- `lon.f32`
- `cth.f32` in metres
- `valid.u8`
- optional future `cloud-fraction.f32`

Geolocation is fail-closed. The compiler accepts embedded lat/lon, a CF-style GEOS projection with x/y arrays, or an external KMA lat/lon grid file. It must not invent a geographic bounding box.

## v0.2 WebGPU volume spike

Historical spike note: the independent WebGPU overlay path was a feasibility experiment. Production priority is same-scene `Cesium VoxelPrimitive / 3D Tiles Voxels` (or equivalent same-depth renderer) so terrain/globe occlusion and camera depth remain coherent. Separate WebGPU overlay is fallback research only, not the canonical production path.

This is intentionally a regional renderer. It is not a whole-Earth 65-level always-on volume.

Known gap for this spike: terrain-depth compositing is not yet production-complete. The current bridge hides the volume when its region is behind the globe, but precise Cesium terrain depth cannot be shared directly across the separate WebGL/WebGPU contexts. This remains a later integration problem, not a reason to fabricate completion.

## v0.3 adaptive runtime

`AdaptiveCloudRuntime` chooses among OFF / STATIC_3D / LOW_3D / CTH_RELIEF / MEDIUM_VOLUME / HIGH_VOLUME using camera height, device class, thermal state, data readiness and explicit user intent. `SHELL/STATIC_SHELL` final modes are superseded.

No mode switch is considered complete unless the previous owner disposes all resources.

## Definition of Done for the next real-data step

Real GK2A Cloud Relief can be called DONE only after all of the following exist:

1. an authenticated real CTPS download or existing verified Earthus CTPS object;
2. inspector output with the exact CTH variable, units, dimensions, flags and projection;
3. a compiled relief artifact with source time and provenance;
4. actual browser rendering on the existing Earthus Cesium Viewer;
5. desktop and mobile screenshots;
6. FPS / memory / network measurements;
7. Cloud OFF cleanup evidence;
8. rollback path.

Until then, status is `PARTIAL_EVIDENCE` / `BLOCKED_REAL_DATA` for the real-provider portion.
