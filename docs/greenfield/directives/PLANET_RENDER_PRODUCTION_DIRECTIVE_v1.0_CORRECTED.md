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

# EARTHUS 2.0 PLANET RENDER PRODUCTION DIRECTIVE v1.0

## 1. 목적

EARTHUS의 3D 지구를 장식용 데모가 아닌 실제 서비스용 렌더 파운데이션으로 구현한다.
대상은 Terrain, Cloud, Ocean Surface, Bathymetry, Underwater/Trench이며 기존 Cesium Viewer와 동일한 camera/scene lifecycle 안에서 동작한다.

## 2. Runtime 계층

```text
Existing Cesium Viewer singleton
        │
RenderActivityController
        │
PlanetPerformanceGovernor ── GPU Budget Ledger
        │
        ├── TerrainRuntime
        ├── OceanRuntime
        │    ├── OceanSurfaceRuntime
        │    ├── BathymetryRuntime
        │    ├── GlobeTranslucencyRuntime
        │    └── UnderwaterRuntime
        └── CloudRuntime
             ├── Low-LOD 3D Cloud Mesh/State
             ├── CTH 3D Relief/Mesh
             └── bounded Cesium Voxel/3D Volume
```

## 3. LAND / TERRAIN

- Global view도 verified low-LOD terrain geometry를 유지한다. 최고 DEM detail만 요구하지 않는다.
- 국가/지역 확대에서 Quantized Mesh Terrain을 사용한다.
- source는 `ELLIPSOID`, `ION_QUANTIZED_MESH`, `URL_QUANTIZED_MESH`를 정식 경로로 지원한다.
- 3D Tiles Terrain은 명시적 experimental gate 없이는 실행하지 않는다.
- Terrain Provider 실패 시 앱은 fail-soft할 수 있으나 Ellipsoid는 `DEGRADED_NO_TERRAIN` 비상 표시일 뿐 visual acceptance PASS가 아니다. 가능하면 lower-LOD verified 3D terrain로 degrade하고, 그것도 없으면 terrain capability를 UNAVAILABLE로 표시한다.
- `maximumScreenSpaceError`와 `tileCacheSize`는 Performance Governor가 소유한다.
- source height를 시각 효과 때문에 과장하지 않는다.

## 4. OCEAN / BATHYMETRY / TRENCH

- Canonical bathymetry는 `depthsM = positive down`을 유지한다.
- renderer에서만 `height = -depthM`로 변환한다.
- 해구 수심은 시각 효과 때문에 과장하지 않는다.
- Ocean Surface는 지역 focus primitive이며 무한 wave animation을 사용하지 않는다.
- 해저 보기에서 Globe translucency를 임시 활성화하고 exit/dispose 때 기존 상태를 정확히 복구한다.
- 수중 카메라는 실제 bathymetry가 존재할 때만 허용한다.
- 수중에서 collision/fog/background/undergroundColor를 임시 변경하고 원상복구한다.

## 5. CLOUD

### L0 — Low-LOD 3D Cloud State
전지구/원거리도 3D를 유지한다. 위성 이미지는 cloud mask/optical/material input일 뿐 final shell renderer가 아니다. 실제 CTH/vertical evidence가 부족하면 STATIC_3D 또는 OFF/INSUFFICIENT_DATA로 내려간다.

### L1 — Cloud Top Relief
국가/지역. 공식/파생 CTH를 실제 meter 단위 높이로 geometry에 사용. 누락/invalid cell은 triangle 생성에서 제외한다.

### L2 — True Volume
지역 bounded volume만 허용. 입력은 real/derived 3D density R8 + provenance.
- raw R8를 binary로 전달한다. Base64 JSON 금지.
- WebGPU GPU-memory budget을 통과해야 한다.
- 저층운(<2200m)은 terrain-aware mask가 없으면 Relief로 fallback한다.
- iOS는 실제기기 canary 완료 전 Volume 자동 활성화 금지.
- HOT/CRITICAL pressure면 `MEDIUM_3D → LOW_3D → CTH_RELIEF → STATIC_3D → OFF`로 즉시 하향한다. Satellite/photo shell fallback은 금지한다.

## 6. Performance / Thermal 정책

브라우저는 실제 device temperature를 제공하지 않는다. 따라서 코드가 "온도가 몇 도"라고 주장하지 않는다.
대신 다음 신호를 사용한다.

- render frame p90
- Long Task count
- GPU allocation budget
- device class / pixel load / memory hint / cores
- document visibility
- camera movement / idle

품질 단계:

| Profile | Resolution | Terrain SSE | Mobile tile cache | Mobile Volume steps | 역할 |
|---|---:|---:|---:|---:|---|
| FULL | 1.00 | 2.0 | 170 | 56 | 데스크톱 고품질 중심 |
| BALANCED | 1.00 | 3.0 | 130 | 44 | 기본 모바일/일반 |
| ECO | 0.86 | 5.0 | 90 | 32 | 지속 압박 |
| SAFE | 0.72 | 8.0 | 64 | 24 | 심한 압박/보호 |

모바일 interactive target은 안정적 30fps다. 자동 recovery는 기기의 최초 safe ceiling보다 고품질 단계로 올라가지 않는다.

## 7. Idle 렌더링

- `scene.requestRenderMode = true`
- `maximumRenderTimeChange = 60`
- 카메라/데이터/품질 변화 시 `scene.requestRender()`
- 일조 변화는 1분 tick만 허용
- production module에 `requestAnimationFrame` hot loop 금지
- Volume도 camera 움직임 중 최대 약 10fps mobile / 18fps desktop만 갱신하고 idle에서는 정지

## 8. Resource ownership

모든 엔진은 OFF/dispose에서 다음을 제거한다.

- AbortController/fetch
- Cesium Primitive
- WebGPU texture/buffer
- overlay canvas
- timer
- Cesium event listener
- DOM event listener

새 SceneIntent가 이전 async fetch 결과를 덮지 않도록 generation guard를 사용한다.

## 9. Truth / Fail-closed

`SYNTHETIC_FIXTURE`는 production contract에서 거부한다.
지원 truth class만 통과시키며 sourceId/observedAt을 보존한다.
실 bathymetry가 없으면 Underwater 진입 금지. Voxel/volume capability가 없거나 GPU budget을 넘으면 lower-LOD 3D cloud/CTH relief/STATIC_3D로 하향한다. Terrain 실패 시 flat/photo Earth로 PASS 처리하지 않는다.

## 10. Production 완료 조건

다음이 모두 있어야 '완성형 배포 완료'다.

1. 정본 source checkout에 실제 통합
2. 실제 Terrain provider render
3. 실제 bathymetry + 해구 visual verification
4. 실제 GK2A CTH relief
5. 실제 NWP density WebGPU bounded volume
6. Desktop Chrome/Safari visual regression
7. iPhone/Android 실기기 20분 interaction + idle thermal/battery test
8. 100회 메뉴 전환 후 orphan resource 0
9. context loss / tab hide / page restore 검증
10. production provider outage에서 degrade/fallback 검증

이 패키지는 1~10을 달성하기 위한 production code foundation이며, 실데이터/실기기 증거가 없는 항목을 완료라고 표시하지 않는다.


## CORRECTION — Cloud True Volume Renderer Priority
True Volume의 production 우선 경로는 현재 canonical Cesium scene과 depth/occlusion을 공유하는 `Cesium VoxelPrimitive / 3D Tiles Voxels` 또는 동급 same-scene renderer다. 별도 WebGPU canvas overlay는 실험/보조 경로로만 남긴다.
