# Photo-As-World Conflict Audit

## Search scope

Current repository의 active V2/owner/test source와 Zero-Start 압축 해제 source에서 다음 문자열을 대소문자 무시로 검색했다.

```text
SHELL, STATIC_SHELL, SATELLITE_SHELL, THREE_SHELL,
VOLUME_DEGRADE_TO_SHELL, cloud shell, satellite shell,
Blue Marble, ELLIPSOID, verticalExaggeration,
ImageryLayer, satimage, satellite image, cloud imagery
```

`shell`은 service-worker app shell이나 UI shell도 잡으므로 문자열 존재 자체를 위반으로 보지 않았다.

## Current repository classification

| path/use | classification | action/reason |
|---|---|---|
| `prototype/v2/js/loading-ui.js`의 `shell` stage | `LEGACY_ONLY` | loading label일 뿐 photo renderer 아님; 후속 명칭 정리 가능 |
| service-worker cache 이름의 `earthus-shell-*` | `LEGACY_ONLY` | app-shell cache 의미; physical Earth와 무관 |
| `provider-runtime.js`의 UI shell 표현 | `LEGACY_ONLY` | app integration shell 의미 |
| `real-living-earth.js::installImagery`의 Blue Marble/Esri imagery | `MATERIAL_OK` | terrain geometry 위 albedo/material 입력으로만 유지 가능 |
| `current-earth-seasonal.js`의 IMS imagery | `OBSERVATION_OK` | snow/ice extent 관측 입력; depth/geometry 아님 |
| `real-living-earth.js::addCloudShell` | `OBSERVATION_OK` only when explicitly observed 2D context | G5 production final fallback에서는 사용 금지 |
| `real-living-earth.js` default `cloudFidelity=SHELL`와 terminal `return "SHELL"` | `PRODUCTION_PHOTO_AS_WORLD_VIOLATION` | G5에서 `STATIC_3D → OFF`로 교정; G2 기본에는 숨김 |
| `device-network-governor.js`의 `THREE_SHELL/STATIC_SHELL` | `PRODUCTION_PHOTO_AS_WORLD_VIOLATION` | FND-018 3D-only fallback으로 교정 필요 |
| `planet-intelligence-orchestrator.js`의 `VOLUME_DEGRADE_TO_SHELL` | `PRODUCTION_PHOTO_AS_WORLD_VIOLATION` | FND-017 warning/action 교정 필요 |
| `physical-earth-presentation.js`의 `scene.verticalExaggeration` 12× | `PRODUCTION_PHOTO_AS_WORLD_VIOLATION` | corrected P2가 명시적으로 금지; G2에서 1×로 rework |
| `physical-earth-presentation.js` Water globe material | `MATERIAL_OK` intent, runtime `UNSAFE` | 실제 브라우저에서 texture-unit overflow; G3 independent surface로 이동 |
| `trench-bathymetry-mesh.js`의 `verticalExaggeration: 1` | `OBSERVATION_OK` | truth scale 고정 증거 |
| `EllipsoidSurfaceAppearance` geometry classes | `MATERIAL_OK` when actual height/geometry exists | 이름만으로 ellipsoid fallback 판정하지 않음 |
| `ELLIPSOID_FALLBACK` terrain success path | `PRODUCTION_PHOTO_AS_WORLD_VIOLATION` if accepted as G2 | base UI fail-soft는 가능하지만 G2 PASS 금지 |

## Zero-Start classification

| path/use | classification | action/reason |
|---|---|---|
| `greenfield/physical-3d-policy.js` banned-mode set | `LEGACY_ONLY` reference/guard | forbidden values를 탐지하는 안전 코드; PORT 후보 |
| `v02/geo/terrain-lod.js::verticalExaggeration` | `PRODUCTION_PHOTO_AS_WORLD_VIOLATION` under corrected P2 | `REAL` mode 1× test만 참고, helper는 이식 금지 |
| `v02/cloud/cloud-render-policy.js` THREE/STATIC shell | `PRODUCTION_PHOTO_AS_WORLD_VIOLATION` | corrected source라고 이름 붙었어도 historical implementation |
| `v02/visual/volume.js` shell modes | `PRODUCTION_PHOTO_AS_WORLD_VIOLATION` | sourceDimension보다 낮은 2D fallback; DO_NOT_USE |
| `v02/core/fail-soft-scene.js` THREE_SHELL | `PRODUCTION_PHOTO_AS_WORLD_VIOLATION` | OFF/INSUFFICIENT_DATA로 rework |
| `v04/core/device-network-governor.js` shell modes | `PRODUCTION_PHOTO_AS_WORLD_VIOLATION` | current 동일 파일도 교정 대상 |
| recovered planet runtime default `ELLIPSOID` | `PRODUCTION_PHOTO_AS_WORLD_VIOLATION` | missing real terrain이 조용히 success가 됨 |
| recovered planet runtime EARTH cloud `SHELL` | `PRODUCTION_PHOTO_AS_WORLD_VIOLATION` | production final default 금지 |
| recovered cloud adapters accepting satellite shell | `OBSERVATION_OK` as input/context only | final renderer/fallback 사용 금지 |
| earthquake depth `verticalExaggeration` | `MATERIAL_OK` only if explicitly semantic display scale | terrain acceptance와 분리; truth depth 보존 필요 |

## Actual browser evidence

### Clean `19c22c01`

- runtime error 없음
- 실제 Terrain3D provider label 있음
- 그러나 32,820 km 카메라, small globe, imagery + observed shell composition
- 산맥/깊이/지형 silhouette가 읽히지 않음
- `G2 FAIL: photo globe appearance`

### Dirty working tree

- 10,800 km oblique camera와 12× terrain label
- Water material 적용 직후 Cesium shader link failure
- 2회 연속 같은 `MAX_TEXTURE_IMAGE_UNITS(16)` 오류
- 화면 렌더 중단
- `G2 FAIL: runtime broken` 및 `vertical exaggeration conflict`

## Audit status

`PHOTO_AS_WORLD CONFLICT AUDIT: PASS`

PASS는 conflict를 찾아 분류했다는 뜻이다. 제품 visual acceptance는 아직 `FAIL`이다.
