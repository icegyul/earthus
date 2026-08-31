# EARTHUS V2 — ZERO-START / GREENFIELD MASTER v1.0
## EMPTY FOLDER → PHYSICAL 3D EARTH → INTELLIGENCE → LLM → SIMULATION → PRODUCTION

**목적:** 이 문서는 기존 `icegyul/earthus` 저장소가 없어도, 빈 디렉터리에서 EARTHUS V2를 다시 구축할 수 있게 하는 재현/재난복구/Greenfield 정본이다.

**중요:** 기존 v5.3 corrected master는 제품 철학과 최종 제품 규칙의 정본이고, 본 Greenfield Master는 그 제품을 **제로에서 어떻게 조립하는지**를 정의한다.

**제로 스타트 선언**
- 기존 repository가 없어도 시작 가능하다.
- 기존 working tree를 전제로 하지 않는다.
- 최초 Cesium Viewer는 여기서 **정확히 하나만 생성**한다.
- 이후 두 번째 Viewer 생성은 금지한다.
- 255 Engine / 198 Algorithm은 제공된 Greenfield Catalog와 Source Foundation 패키지를 사용한다.
- Source Foundation은 Production 완료가 아니다. 실제 provider/browser/device evidence가 최종 권한이다.
- `mapped.earth/earth` 수준은 GLOBAL 3D의 최소 구조적 합격선이다.
- 사진/위성영상을 지구/구름/바다의 최종 대체물로 사용하지 않는다.

---

# 1. 최종 제품 정의

EARTHUS는 지구사진 위에 AI를 붙이는 서비스가 아니다.

EARTHUS는 실제 지구의 관측·지형·해양·대기·인간 활동을 `Canonical Earth State`와 `Earth Version`으로 구성하고, 이를 하나의 연속된 3D/4D Earth에 공간적으로 투영하며, Intelligence가 사건·원인 후보·예측·영향·시나리오를 계산하고 LLM이 그 결과를 Evidence에 묶어 설명하고 승인된 SceneIntent로 탐색하게 하는 Earth Digital Twin Operating System이다.

최종 흐름:

```text
Provider / Observation / Official / Model
→ Raw Artifact + Receipt
→ Canonical Signal
→ Canonical Earth State + Earth Version
→ Event / Evidence / Confidence / Lineage
→ Domain Engine + Intelligence
→ SceneRecipe / RenderPolicy
→ Physical 3D/4D Earth
→ SceneEvidenceSnapshot
→ LLM Explanation + Approved SceneIntent

Scenario:
Immutable Earth Version A
→ Scenario Branch B
→ Domain recompute
→ Earth Diff
→ Impact
→ 3D/4D Delta
→ LLM Explanation
```

---

# 2. 전달 패키지와 설치 순서

제로 스타트에서는 아래 패키지를 모두 같은 작업 폴더에 둔다.

1. `EARTHUS_V2_00_ZERO_START_MASTER_v1.0.zip`
2. `EARTHUS_V2_01_ENGINE_SOURCE_255_GREENFIELD.zip`
3. `EARTHUS_V2_02_ALGORITHM_198_GREENFIELD.zip`
4. `EARTHUS_V2_03_BACKEND_DATA_PLANE_GREENFIELD.zip`
5. `EARTHUS_V2_04_PROVIDER_ADAPTERS_GREENFIELD.zip`
6. `EARTHUS_V2_05_PHYSICAL_3D_PLANET_RENDER_GREENFIELD.zip`
7. `EARTHUS_V2_06_INTELLIGENCE_LLM_GREENFIELD.zip`
8. `EARTHUS_V2_07_INFRA_DEPLOYMENT_GREENFIELD.zip`

원칙:
- 같은 상대경로의 source가 중복될 수 있다. Greenfield corrected source가 historical source보다 우선한다.
- `*_HISTORICAL_*` 파일은 감사용이다.
- `*_GREENFIELD_*` catalog가 구현 판단의 우선 기준이다.
- 과거 `cloud shell`, `static shell`, `global Earth skin`, `Underwater FUTURE-only` 문구는 구현 지시로 사용하지 않는다.

---

# 3. 권장 기술 기준

## 3.1 Client / 3D

- Static Web/PWA, ES Modules
- CesiumJS `1.143.x` 기준
- 한 개의 canonical Cesium Viewer
- WebGL2 baseline
- Cesium Voxel/3D Tiles voxel은 capability gate
- 서버 secret을 browser source에 하드코딩하지 않는다.

## 3.2 Build / Tooling

- Node.js 22 LTS 이상 권장
- Python 3.11 이상: 데이터 preprocessor/validation
- Git
- AWS CLI v2
- PostgreSQL/Supabase CLI는 실제 운영 선택에 따라 설치

## 3.3 Backend / Data Plane

기본 구조:

```text
Provider
→ Lambda/Collector/Adapter
→ Private Raw S3
→ Receipt / Hash / Schema / Rights
→ Canonical Processor
→ Public/Versioned S3 Object / Tile / Manifest
→ CloudFront
→ Browser

Control / Index Plane:
Supabase/PostgreSQL
→ provider_contract
→ provenance index
→ event / lineage
→ user / plan / watch
→ audit / operation metadata
```

---

# 4. 빈 폴더에서 최초 저장소 생성

```bash
mkdir earthus-v2
cd earthus-v2

git init

mkdir -p \
  prototype/v2 \
  prototype/js/earthus2 \
  config \
  docs/canonical \
  docs/greenfield \
  tools \
  tests \
  aws \
  supabase/migrations \
  evidence \
  artifacts
```

`package.json` 최소값:

```json
{
  "name": "earthus-v2",
  "private": true,
  "type": "module",
  "scripts": {
    "check:syntax": "find prototype/js -name '*.js' -print0 | xargs -0 -n1 node --check",
    "test": "node --test tests/**/*.test.mjs",
    "serve": "python3 -m http.server 8080 -d prototype"
  }
}
```

`.gitignore`:

```text
.env
.env.*
!/.env.example
node_modules/
.DS_Store
artifacts/private/
evidence/device-local/
*.log
```

---

# 5. 환경변수와 Secret

`.env.example`에는 이름만 둔다.

```text
EARTHUS_ENV=development
AWS_REGION=
EARTHUS_RAW_BUCKET=
EARTHUS_PUBLIC_BUCKET=
EARTHUS_CLOUDFRONT_DISTRIBUTION_ID=

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

CESIUM_ION_TOKEN=

KMA_API_KEY=
AIRKOREA_API_KEY=
KTO_API_KEY=
```

원칙:
- 실제 key는 Git에 넣지 않는다.
- Service Role, provider secret은 server-side only.
- browser가 필요한 public/scoped runtime config는 별도 `config/runtime.json` 생성 단계에서 주입한다.
- URL/query 로그에 secret이 남지 않게 redaction을 먼저 구축한다.

---

# 6. 최초 Cesium Viewer — Greenfield에서 정확히 하나 생성

Continuation 문서에서는 기존 Viewer를 재사용하지만 Greenfield에서는 Viewer 자체가 없으므로 **최초 1개를 생성해야 한다.**

`prototype/js/viewer.js`:

```js
let viewerSingleton = null;

export async function initEarthusViewer({ Cesium, container, terrainProvider }) {
  if (!Cesium) throw new Error('CESIUM_REQUIRED');
  if (viewerSingleton && !viewerSingleton.isDestroyed?.()) return viewerSingleton;
  if (!terrainProvider) throw new Error('REAL_TERRAIN_PROVIDER_REQUIRED');

  viewerSingleton = new Cesium.Viewer(container, {
    terrainProvider,
    animation: false,
    timeline: false,
    geocoder: false,
    baseLayerPicker: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    requestRenderMode: true
  });

  globalThis.__earthusViewer = viewerSingleton;
  return viewerSingleton;
}
```

절대 규칙:
- `new Cesium.Viewer`는 이 canonical owner 한 곳에만 존재.
- production physical Earth가 필요한 상태에서 real terrain provider가 없으면 조용히 사진 지구/ellipsoid를 성공 화면으로 보여주지 않는다.
- 개발모드의 임시 geometry는 명확히 `DEV_NOT_ACCEPTED`로 표시하고 Golden acceptance에서 제외한다.

---

# 7. Physical 3D Earth 정본

## 7.1 절대 시각 규칙

```text
GLOBAL:
LOW-LOD REAL 3D
↓
CONTINENT:
MID-LOD REAL 3D
↓
COUNTRY:
REGION-AWARE 3D
↓
REGION:
HIGHER DATA + GEOMETRY
↓
LOCAL:
HIGH-DETAIL REAL 3D
↓
UNDERWATER:
REAL BATHYMETRY SPACE
```

차원 fallback은 없다.

```text
HIGH_3D
→ MEDIUM_3D
→ LOW_3D
→ STATIC_3D
→ OFF
```

금지:

```text
PHOTO
IMAGE_SHELL
SATELLITE_SHELL_AS_WORLD
BLUE_MARBLE_AS_PHYSICAL_EARTH
PSEUDO_3D
```

## 7.2 LAND

- Height source가 geometry를 소유.
- Imagery/RGB/Land Cover는 material/albedo 입력.
- `verticalExaggeration=1`이 실제 지형 기본.
- 데이터 relief는 실제 terrain raw geometry와 구분한다.
- GLOBAL에서도 낮은 LOD의 실제 terrain 실루엣이 읽혀야 한다.

## 7.3 OCEAN

```text
0m Water Surface
+ ocean-only mask
+ normal
+ Fresnel/reflection
+ lighting
+ wave/current state when supported

below:
Bathymetry Geometry
```

바다는 위성사진의 파란 픽셀이 아니다.

## 7.4 CLOUD

입력:

```text
Satellite observation
CTH
cloud phase
cloud fraction
NWP vertical state
```

출력:

```text
GLOBAL      LOW_3D_CLOUD
CONTINENT   MEDIUM_3D_CLOUD
REGION      CTH / multilayer 3D
LOCAL       bounded HIGH_3D_VOLUME
```

실제 vertical evidence가 없으면 임의 cloud thickness를 만들지 않는다.

## 7.5 ATMOSPHERE

- sun direction
- day/night terminator
- Rayleigh/Mie style scattering
- restrained limb
- cloud shadow
- terrain/ocean light coherence
- city lights only on night side

---

# 8. Scope / Region / Resource 구조

다음 capability는 필수다. 새 독립 authority로 만들지 않고 FND-017 아래에 둔다.

```text
ScopeResolver
RegionResolver
RegionResourceManifest
RegionResourceManager
TerrainLayerHost
SceneEvidenceSnapshot
```

Scope:

```text
GLOBAL
CONTINENT
COUNTRY
REGION
LOCAL
UNDERWATER
```

Resource policy:

```text
CURRENT VIEW = priority 100%
NEXT probable region = small prefetch
PREVIOUS = bounded cache
IRRELEVANT high-detail = dispose
CAMERA MOVING = lower fidelity
CAMERA STABLE = center-first refine
BOUNDARY = hysteresis
```

각 scope 전환은 다음을 함께 바꾼다.

- geometry LOD
- provider set
- official authority/source registry
- data resolution
- time resolution
- compute class
- intelligence depth
- network payload
- GPU/CPU budget

---

# 9. Engine 255 구축법

`01_ENGINE_SOURCE_255_GREENFIELD`의 catalog를 먼저 읽는다.

각 Engine은 다음 순서로 닫는다.

```text
PURPOSE
→ EXISTING FOUNDATION SOURCE
→ INPUT CONTRACT
→ OUTPUT CONTRACT
→ TRUTH CLASS
→ PROVIDER/DEPENDENCY
→ PURE COMPUTE
→ IO ORCHESTRATION
→ VERSION/HASH
→ CACHE/INVALIDATION
→ API
→ 3D VISUAL CONSUMER
→ INTELLIGENCE CONNECTION
→ FAILURE/STALE/PARTIAL
→ TEST
→ PERFORMANCE
→ EVIDENCE
→ ROLLBACK
```

`SOURCE_FOUNDATION_AVAILABLE`은 시작 코드가 있다는 뜻이다.

아래 상태는 별도다.

```text
SPEC_ONLY
FOUNDATION_CODE
RUNTIME_WIRED
REAL_DATA_WIRED
BROWSER_VERIFIED
DEVICE_VERIFIED
PRODUCTION_READY
```

## 9.1 Greenfield gap

- `GEO-004 Underwater Camera Level 3`: 이번 Greenfield에서는 Future-only가 아니다. Physical 3D 제품의 required gap이다.
- `HYD-006 Tsunami Bathymetric Propagation`: validated solver가 없으면 구현 완료로 가장하지 않는다. `SCENARIO_UNAVAILABLE`로 유지한다.

---

# 10. Algorithm 198 구축법

Algorithm은 LLM보다 아래의 계산 권한이다.

- raw input/units 검증
- deterministic function 또는 versioned model
- calibration/version 기록
- truth state 보존
- regression fixture
- evidence manifest

렌더링 성능 때문에 algorithm input을 임의로 제거하면 안 된다.

예:

```text
VISIBLE SUBSET != SCIENCE COMPUTE SUBSET
```

화면에서 particle을 줄였다고 과학 계산에서 wind grid를 제거하면 실패다.

---

# 11. Provider 구축 순서

초기 P0 provider는 실제 계정/권리를 확보한 순서로 연다.

한국 초기 예:

- KMA
- AirKorea
- Seoul real-time city/population data
- KTO
- KHOA/해양
- GK2A/NMSC
- Terrain/Bathymetry provider

각 provider:

```text
Source Contract
→ Secret/rights
→ Fetch
→ Raw receipt
→ Schema validation
→ Quarantine on drift
→ Canonical normalize
→ Revision/watermark
→ Materialize
→ Health/Freshness
```

누락값은 `0`으로 대체하지 않는다.

---

# 12. Backend 구축 순서

## B0 Security first

- secret redaction
- request IDs
- provider budget/quota
- idempotency
- audit
- rate/abuse guard

## B1 Raw Plane

- immutable raw artifact
- source hash
- retrievedAt
- source version
- rights metadata

## B2 Canonical Plane

- canonical signal
- time normalization
- WGS84/spatial identity
- units
- truth class

## B3 Revision / Event

- watermark
- revision
- canonical EarthEvent
- lineage graph
- correction/retraction

## B4 Materialized Earth

```text
WORLD
CONTINENT
COUNTRY
REGION
CITY
LOCAL CELL
EVENT FOCUS
```

Client는 원본 API 20개를 직접 합치지 않는다.

## B5 Query/API

- geotemporal query
- budget guard
- request coalescing
- cache policy
- read model
- failover preserving truth

---

# 13. Intelligence 구축

Intelligence의 기준 상태:

```text
Canonical Earth State
+ Earth Version
+ Event
+ Evidence
+ Confidence/Uncertainty
```

질문:

```text
NOW
WHY
NEXT
PAST
COMPARE
WHAT IF
FOR ME
EVIDENCE
REPORT
```

인과 class:

```text
CONFIRMED_CAUSE
STRONG_EVIDENCE
CONTRIBUTING_FACTOR
CONSISTENT_WITH
CORRELATED
HYPOTHESIS
DISPUTED
UNKNOWN
```

Correlation은 자동으로 cause가 되지 않는다.

---

# 14. SceneEvidenceSnapshot

LLM과 UX에 현재 화면 문맥을 전달한다.

```text
camera
scope
region
selected feature
time
visible semantic layers
canonical signal refs
evidence refs
truth classes
source readiness
```

중요:

**SceneEvidenceSnapshot은 scientific truth database의 대체물이 아니다.**

Intelligence가 계산할 때는 canonical state/event/evidence를 조회하고, Scene snapshot은 사용자가 무엇을 보고 있는지 연결한다.

---

# 15. LLM 구축

LLM의 역할:

- source-backed explanation
- query decomposition
- approved tool calls
- approved SceneIntent
- briefing/report
- evidence/citation validation

금지:

- measurement 생성
- probability 생성
- 공식 warning 생성/변경
- geometry/좌표 생성
- cause 확정
- simulation physics 계산
- private context leakage

Scene action:

```text
User question
→ LLM
→ Approved Tool Orchestrator
→ IntelligenceContext
→ FND-017
→ SceneIntent
→ SceneRecipe
→ Visual Engine
```

LLM 장애가 Base Earth/official safety를 중단시키면 안 된다.

---

# 16. Simulation / Earth Diff

Reality를 덮어쓰지 않는다.

```text
EarthVersion A (immutable OBSERVED baseline)
→ Branch
→ Scenario B (SIMULATION_ONLY)
→ Domain Engine recompute
→ Earth Diff
→ Impact
→ 3D Delta
→ Explanation
```

모든 Scenario는:
- model version
- seed/config
- assumptions
- intervention
- uncertainty
- baselineVersion
을 저장한다.

---

# 17. 첫 화면을 만드는 실제 순서

**G0 — Empty Repo**
- 구조
- config
- tests
- CI

**G1 — One Viewer**
- canonical Viewer 1개
- first frame
- resource lifecycle

**G2 — Real Global Terrain**
- 실제 low-LOD terrain
- mapped.earth minimum global structural comparison

**G3 — Ocean**
- independent surface
- mask
- Fresnel
- bathymetry separation

**G4 — Atmosphere**
- sun
- terminator
- scattering
- night lights

**G5 — 3D Cloud**
- low 3D global
- CTH region
- bounded volume local
- no shell fallback

**G6 — Scope/Region**
- semantic zoom
- official source switch
- manifests
- disposal

이 G0-G6를 통과하기 전 Intelligence UI를 앞세워 첫 화면 문제를 가리지 않는다.

---

# 18. 데이터 3D 표현

공통 grammar:

```text
Terrain          Geometry
Ocean            Surface + Volume context
Bathymetry       Geometry
Cloud            3D field/volume
Atmosphere       analytic/volumetric scattering
Population       3D Relief/Tower
Crowd            3D Density
Wind             Flow field
Ocean Current    Flow field
Rain             Field/particle/curtain
River            geometry/network + flow
Earthquake       subsurface depth
Fault            subsurface geometry
Tsunami          validated propagation field
Forest           cover/type/canopy 3D
Snow/Ice         terrain state/material; thickness only if evidence
```

---

# 19. Performance

4개의 LOD를 분리한다.

```text
Spatial LOD
Temporal LOD
Intelligence LOD
Visual LOD
```

FND-017이 최종 정책을 컴파일한다.

GPU를 먼저 사지 않는다.

측정:
- frame time/FPS
- GPU memory
- heap
- provider calls
- cache hit
- network egress
- LLM tokens
- scenario compute
- battery/thermal

---

# 20. 테스트

## 20.1 Unit

Engine/Algorithm pure contracts.

## 20.2 Integration

```text
Provider → Canonical → Event → Intelligence → SceneRecipe
```

## 20.3 Browser

- one Viewer
- global terrain
- ocean material
- cloud parallax
- scope transition
- resource disposal
- SceneEvidence alignment
- Scenario isolation

## 20.4 Physical device

- Desktop
- iPhone
- Android
- portrait/landscape
- thermal
- battery
- context loss/recovery

---

# 21. Visual Acceptance

다음은 반드시 실제 화면으로 증명한다.

- 라벨을 숨겨도 육지/바다/구름이 공간적으로 구분된다.
- 산맥 silhouette가 실제 terrain camera 관계에 따라 변한다.
- 구름과 지표 사이 parallax가 측정된다.
- ocean highlight/Fresnel이 카메라·태양 방향에 반응하고 육지에는 적용되지 않는다.
- GLOBAL→LOCAL scope가 바뀔 때 실제 request/resource manifest도 바뀐다.
- 벗어난 high-detail resource가 dispose된다.
- Intelligence response scope/region/time이 SceneEvidenceSnapshot과 일치한다.
- Scenario가 baseline EarthVersion을 mutate하지 않는다.
- 동일/유사 카메라에서 mapped.earth보다 낮은 구조적 3D 지형 인지/깊이/연속 탐색이면 FAIL.

비교는 pixel-copy가 아니라:
- terrain readability
- depth perception
- globe scale
- continuous zoom
- spatial data embodiment
- interaction quality
기준이다.

---

# 22. Production Gate

다음이 하나라도 없으면 `PRODUCTION_READY=NO`.

```text
REAL_PROVIDER
RIGHTS/LICENSE
RUNTIME_WIRING
BROWSER_EVIDENCE
DEVICE_EVIDENCE
PERFORMANCE/THERMAL
RESOURCE_DISPOSAL
SECURITY
ROLLBACK
VISUAL_GOLDEN
TRUTH/PROVENANCE
```

---

# 23. 외부에서 사람이 준비해야 하는 것

코드로 만들 수 없는 외부 gate:

- AWS account/IAM
- S3/CloudFront
- Supabase project
- DNS/TLS
- Cesium ion 또는 승인 terrain/bathymetry endpoint
- KMA/AirKorea/KTO 등 발급 key
- 상업용 데이터 계약
- Apple/Google push credential
- 실제 iPhone/Android

Claude Code는 이 경계 전까지 구현/테스트를 진행하고, key나 권리가 없으면 정확한 blocker를 기록한다.

---

# 24. Zero-Start Claude Code 시작 지시

```text
TASK:
EARTHUS V2 — GREENFIELD ZERO-START BUILD

This is a true empty-repository build.
Do NOT assume an existing EARTHUS repository, Viewer, AWS Lambda, Supabase schema, Engine runtime, or frontend shell exists.

FIRST:
1. Read EARTHUS_V2_ZERO_START_MASTER_v1.0_KO.md.
2. Read the corrected v5.3 canonical.
3. Load ENGINE_CATALOG_GREENFIELD_255.csv.
4. Load ALGORITHM_CATALOG_GREENFIELD_198.csv.
5. Inventory all source packages supplied with this handoff.

BUILD ORDER:
G0 repo/tooling
→ G1 single canonical Viewer
→ G2 global real 3D terrain
→ G3 physical ocean + bathymetry boundary
→ G4 atmosphere/light
→ G5 3D cloud without photo/shell final fallback
→ G6 scope/region/resource runtime
→ backend/provider/canonical state
→ Event/Evidence/Intelligence
→ SceneEvidenceSnapshot
→ LLM approved SceneIntent
→ immutable Simulation/Earth Diff
→ browser/device acceptance
→ staging/production only after gates.

NON-NEGOTIABLE:
mapped.earth/earth is the minimum GLOBAL structural 3D acceptance bar.
GLOBAL is already real 3D.
Zoom means increasing geometry/data/compute detail, not texture enlargement.
Raster/satellite is observation/material input only.
Physical fallback is HIGH_3D → MEDIUM_3D → LOW_3D → STATIC_3D → OFF.
Never use a photo/satellite shell as physical Earth/Cloud/Ocean success fallback.
Create exactly one Cesium Viewer.
FND-017 becomes the single authority for scope/resource/render planning.
LLM never invents geometry, coordinates, measurement, probability or cause.
Simulation never mutates OBSERVED baseline.
Do not claim DONE from source existence or unit tests.
```

---

# 25. 최종 완료 정의

제로에서 다시 만든 EARTHUS가 완료됐다고 부를 수 있는 시점은:

```text
EMPTY FOLDER
→ REPRODUCIBLE BUILD
→ REAL PROVIDERS
→ CANONICAL EARTH STATE
→ PHYSICAL 3D GLOBAL EARTH
→ CONTINUOUS SCOPE/REGION ZOOM
→ DOMAIN 3D VISUALS
→ EVENT/EVIDENCE INTELLIGENCE
→ LLM SCENE INTERFACE
→ IMMUTABLE SCENARIO
→ REAL DEVICE
→ PRODUCTION GATES
```

가 실제 evidence로 닫혔을 때다.

**이 문서는 기존 저장소가 없어도 시작할 수 있게 작성된 Greenfield/Disaster-Recovery 정본이다.**
