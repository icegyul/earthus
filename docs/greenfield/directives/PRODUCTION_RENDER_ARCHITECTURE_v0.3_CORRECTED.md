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

# EARTHUS 2.0 Planet Render Production Architecture v0.3

## 중요 변경

구름 True Volume의 기본 경로를 **별도 WebGPU canvas overlay**에서 **CesiumJS VoxelPrimitive / 3D Tiles voxels** 우선으로 바꾼다. EARTHUS가 사용하는 CesiumJS 1.143에서 voxel renderer는 WebGL2 3D texture 기반이며 `screenSpaceError`, `stepSize`, `statistics.texturesByteLength`를 직접 조절/측정할 수 있다. 이 방식은 별도 카메라 동기화와 두 렌더러 합성을 제거하고 terrain/occlusion/depth를 같은 Cesium scene에서 처리한다.

Fallback은 `HIGH_VOLUME → MEDIUM_VOLUME → LOW_VOLUME → CTH_3D_RELIEF → STATIC_3D → OFF`이다. Voxel API 기능 탐지에 실패하면 lower-LOD 3D로 내려간다. `GLOBAL SHELL`은 production final renderer로 금지한다.

## Terrain / Ocean

LAND는 `WORLD_TERRAIN` 또는 승인된 Quantized Mesh/3D Tiles Terrain을 사용한다. OCEAN/TRENCH는 `WORLD_BATHYMETRY` 또는 승인된 bathymetry terrain을 사용한다. Bathymetry provider가 없으면 실제 해구/수중 지형은 공개하지 않는다.

World Bathymetry처럼 land+seafloor가 한 terrain provider에 존재하는 경우 OCEAN 모드에서 별도 거대 bathymetry mesh를 만들지 않는다. 이것이 메모리와 seam 문제를 줄이는 기본 경로다.

## Ocean surface

해저 terrain과 해수면은 다른 개념이다. 수중/해구 focus에서 별도 0m surface를 그릴 때는 `oceanOnly=true`로 검증된 영역만 허용한다. 임의 rectangle이 섬/육지를 물로 덮는 것을 금지한다. Global ocean mask가 준비되면 이 regional guard를 polygon mask로 대체한다.

## Cloud truth

- Global Low-LOD 3D Cloud: 관측/모델 cloud image는 mask/optical/material input으로만 사용하고, 표시되는 cloud는 3D mesh/height/voxel state다
- CTH Relief: 실제 CTH grid를 meter 높이의 3D mesh/relief로 표현하며 imagery는 material input일 뿐 geometry를 대체하지 않는다
- True Volume: density + vertical structure + confidence gate
- synthetic fixture는 production=true와 함께 사용할 수 없다.

## Definition of Done

코드 파일 존재는 DONE이 아니다. 실제 terrain/bathymetry/GK2A/NWP provider 연결, browser render, real device 3D interaction, performance/heat test, mode transition 50회, resource disposal, stale async guard까지 증거가 있어야 production DONE이다.
