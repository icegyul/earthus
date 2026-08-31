
# EARTHUS V2 — CLAUDE CODE FULL DEVELOPMENT MASTER DIRECTIVE v5.3 CORRECTED CANONICAL
## PHYSICAL 3D INTELLIGENCE LOCK · mapped.earth MINIMUM BAR · Intelligence/LLM-to-3D · Earth Intelligence Feed · Event Room · My Earth

**문서 목적:** 이 문서 하나만 읽어도 Claude Code가 EARTHUS V2를 **GLOBAL부터 UNDERWATER까지 연속된 실제 데이터 기반 3D Earth**로 구현하고, Intelligence와 LLM의 모든 설명/분석/예측/시나리오가 그 동일한 3D Earth에서 표현되도록 기존 repository/working tree 위에서 재기획 없이 끝까지 개발할 수 있게 한다. 본 문서는 기존 v5.3의 2D/photo/shell fallback 충돌을 수정한 CORRECTED CANONICAL이다.

**정본 실행 대상:** Claude Code  
**기존 Repository:** `icegyul/earthus`  
**기본 원칙:** 기존 working tree를 보존하고 새 프로젝트로 재시작하지 않는다.  
**제품 문장:** **WHERE EARTH BECOMES ONE**  
**실행 철학:** **COMPUTE ONCE, SERVE MANY / CHANGE ONLY WHAT CHANGED**

---

# 0A. NON-NEGOTIABLE CANONICAL OVERRIDE — PHYSICAL 3D INTELLIGENCE WORLD

> **이 절은 아래의 모든 과거 문서, v0.x/v3.x/v4.x/v5.1/v5.2 및 기존 v5.3의 시각 관련 문구보다 우선한다.**  
> 현재 사용자의 명시적 제품 결정과 충돌하는 과거 `shell`, `photo-as-world`, `imagery fallback`, `flat heatmap`, `pseudo-3D`, `2D fallback` 지시는 **SUPERSEDED / DO NOT IMPLEMENT**다.

## 0A.1 Visual Minimum Acceptance Bar

**`https://mapped.earth/earth`는 EARTHUS의 참고 이미지가 아니라 GLOBAL 3D 경험의 최소 합격선이다.**

- mapped.earth보다 낮은 수준의 flat globe / photo sphere / raster-only Earth / painted pseudo terrain은 **FAIL**.
- mapped.earth를 복제하는 것이 목표는 아니다.
- EARTHUS는 최소 동급의 **실제 Terrain 공간감, 연속 Globe interaction, data-driven relief/flow, zoom-based detail increase**를 제공하고, 그 위에서 Ocean Depth / Trench / Underwater / 3D Cloud / Subsurface / Event Intelligence / Scenario로 넘어가야 한다.
- `mapped.earth-level`은 **목표 상한이 아니라 최소 바닥선**이다.

## 0A.2 GLOBAL부터 이미 3D다

```text
GLOBAL       LOW-LOD REAL 3D
  ↓
CONTINENT    MEDIUM-LOD REAL 3D
  ↓
COUNTRY      COUNTRY-FOCUSED REAL 3D
  ↓
REGION       HIGH-DETAIL REAL 3D
  ↓
LOCAL        HIGHEST AVAILABLE VERIFIED 3D
  ↓
UNDERWATER   REAL BATHYMETRY + WATER COLUMN + 3D EVENT CONTEXT
```

**줌에 따라 바뀌는 것은 차원이 아니라 정밀도다.**  
`2D → 3D` 전환을 금지하고 `LOW 3D → MEDIUM 3D → HIGH 3D`만 허용한다.

## 0A.3 NO PHOTO-AS-WORLD / NO IMAGE-SHELL FALLBACK

Raster / satellite / camera imagery는 다음 용도로만 허용한다.

- `OBSERVATION_SOURCE`
- `ALBEDO / MATERIAL_INPUT`
- `CLASSIFICATION_INPUT`
- `TEXTURE_DETAIL` — **이미 존재하는 검증된 geometry의 표면 재질로만 사용**

Raster/image가 다음을 대체하면 FAIL이다.

- Terrain geometry
- Ocean surface / water column
- Bathymetry / trench
- Cloud 3D state
- Atmosphere
- Forest/canopy structure
- Hydrology/flood geometry
- Population/crowd geometry-like data relief
- Subsurface event geometry

## 0A.4 3D 성능 fallback의 유일한 방향

```text
HIGH_3D
→ MEDIUM_3D
→ LOW_3D
→ STATIC_3D
→ OFF
```

- `STATIC_3D`는 **카메라/animation update가 멈춘 저비용 3D geometry/field**다. 2D screenshot이나 photo sphere가 아니다.
- 성능이 부족하다는 이유로 `SATELLITE_SHELL`, `PHOTO_SPHERE`, `FLAT_TILE_ONLY`로 후퇴하지 않는다.
- 데이터가 부족하면 `INSUFFICIENT_DATA` 또는 `OFF`로 내려간다. **사진으로 과학적 3D 상태를 가장하지 않는다.**

## 0A.5 Physical Earth → Intelligence → 3D → LLM은 하나의 폐루프다

```text
REAL / OFFICIAL / MODEL DATA
→ DOMAIN ENGINE
→ INTELLIGENCE EVENT / EVIDENCE / CONFIDENCE
→ 3D SCENE PROJECTION
→ USER SEES / EXPLORES / COMPARES IN 3D
→ LLM EXPLAINS THE SAME VERIFIED SCENE STATE
→ USER QUESTION / APPROVED SCENE ACTION
→ FND-017 / SCENE ORCHESTRATOR
→ UPDATED 3D VIEW
```

**LLM은 별도 텍스트 챗봇이 아니다.** LLM은 source-backed Intelligence Packet을 설명하고, 사용자의 질문을 승인된 `SceneIntent`로 변환하여 동일한 3D Earth를 탐색하게 하는 인터페이스다. 단, 수치·확률·geometry·원인·물리 계산은 LLM이 만들지 않는다.

## 0A.6 Source-of-Truth Priority — 제품 목표와 구현 상태를 분리한다

제품 목표 충돌 시:
1. 현재 사용자의 명시적 결정
2. 본 v5.3 CORRECTED CANONICAL
3. 최신 Intelligence canonical의 truth/evidence/LLM boundary
4. current repository architecture
5. 과거 directives

현재 구현 상태 판정 시:
1. current repository + measured browser/device evidence
2. provider/runtime evidence
3. document status

**현재 코드가 photo/shell fallback을 갖고 있다는 사실은 제품 목표의 정당성이 아니다. 구현 상태로만 기록하고 제거/교정 대상으로 취급한다.**

---

# 0. 이 프로젝트가 왜 존재하는가

EARTHUS는 “지도에 데이터를 올리는 웹사이트”가 아니다. 목표는 **사용자가 지금 지구가 어떤 상태인지 눈으로 이해하고, 무엇이 변했는지 발견하고, 왜 중요한지 확인하고, 다음에 무엇이 일어날 가능성이 있는지 검증된 근거와 함께 판단할 수 있게 하는 Living Earth / Digital Earth Operating System**이다.

이 목적 때문에 지구의 땅, 바다, 구름, 대기, 눈·얼음, 도시, 사람의 흐름, 지하와 해저를 단순한 장식 레이어로 만들면 안 된다. 각 시각요소는 제품의 “사실을 이해하는 인터페이스”다.

## 0.1 왜 땅을 실제 3D로 보여야 하는가

산맥과 계곡은 배경 장식이 아니다. 강수, 바람, 홍수, 산사태, 도시열, 교통, 인구분포, 관광, 재난경로는 지형의 영향을 받는다.

따라서 EARTHUS의 LAND는 **GLOBAL부터 실제 elevation 기반 3D 공간**이어야 한다.

- GLOBAL: coarse verified terrain geometry. 평평한 ellipsoid/photo sphere를 최종 표현으로 사용하지 않는다.
- CONTINENT/COUNTRY: 중간 LOD terrain과 실제 해안선/산맥 구조.
- REGION/LOCAL: source가 허용하는 고해상도 terrain geometry.
- satellite/raster는 geometry가 아니라 material/albedo 입력이다.
- vertical exaggeration, procedural fake geometry, painted mountain texture로 acceptance를 속이지 않는다.
- mapped.earth 수준 이하의 terrain 공간감은 GLOBAL visual acceptance FAIL이다.
- **산맥/계곡/능선/해안의 3D 구조가 Intelligence의 원인·영향 설명에 직접 사용 가능해야 한다.**

## 0.2 왜 바다를 실제 3D/동적 구조로 보여야 하는가

바다는 파란 이미지가 아니다. EARTHUS의 OCEAN은 같은 3D planet state 안에서 **해수면 / 수체 / 해저지형**이 공간적으로 분리되어야 한다.

```text
ATMOSPHERE
~~~~~~~~~~~~ VERIFIED 0m OCEAN SURFACE ~~~~~~~~~~~~
        WATER COLUMN / CURRENT / WAVE STATE
________________ REAL BATHYMETRY _________________
                    \
                     \\ TRENCH / SEAFLOOR
```

- GLOBAL: 저비용이지만 실제 0m 3D water surface와 ocean mask/lighting이 존재.
- REGION/LOCAL: wave/current/tide/SST 등을 실제 데이터 의미에 맞는 surface/flow/field로 추가.
- UNDERWATER: verified bathymetry가 있을 때만 water column과 seafloor 사이로 진입.
- 파도/해류가 무겁다면 해상도·update cadence·active region을 줄이지 2D 이미지로 대체하지 않는다.
- 해저와 해수면을 하나의 파란 raster로 합치지 않는다.

## 0.3 왜 구름을 실제 높이와 부피로 표현해야 하는가

**기존 v5.3의 `Satellite Shell / cloud texture / VOLUME → CTH_RELIEF → SHELL` 최종 표현 규칙은 폐기한다.** 위성영상은 3D 구름 상태를 만드는 입력이지 최종 구름 그 자체가 아니다.

EARTHUS Cloud production visual ladder:

```text
HIGH_3D_VOLUME / VOXEL
→ MEDIUM_3D_VOLUME / VOXEL
→ LOW_3D_VOLUME / COARSE VOXEL
→ CTH_3D_RELIEF / CLOUD MESH
→ STATIC_3D_CLOUD
→ OFF
```

- GLOBAL에서도 cloud가 표시될 경우 **coarse 3D cloud geometry/state**여야 한다.
- GK2A/위성의 cloud mask/phase/top-height/optical information을 3D state 입력으로 사용한다.
- True Volume은 Cesium `VoxelPrimitive / 3D Tiles Voxels` 또는 현재 canonical Cesium scene과 depth/occlusion을 공유하는 동급 경로를 우선한다.
- CTH만 존재하면 실제 CTH meter height 기반 3D relief/mesh로 표현한다.
- vertical structure가 없으면 가짜 volume을 만들지 않는다.
- 기기 성능이 부족하면 voxel resolution/steps/update cadence/active region을 줄인다.
- **2D satellite shell은 production final cloud renderer로 사용하지 않는다.**

## 0.4 왜 해구와 수중까지 만들어야 하는가

지구는 육지만의 시스템이 아니다. 해구, 해저지형, 수심, 해저단면은 쓰나미·판구조·해양과학·지질재난을 이해하기 위한 중요한 공간이다.

Mariana/Trench를 별도 “볼거리”로 만드는 게 아니라:
- 지상의 지형과 동일한 truth-first 원칙으로 실제 bathymetry를 사용하고,
- 수면 아래로 카메라가 전환되어도 같은 planet state를 유지하고,
- underwater lighting/attenuation은 geometry truth를 바꾸지 않는 presentation이어야 한다.

## 0.5 왜 인구와 사람의 흐름을 3D로 보여야 하는가

인구는 숫자 표가 아니라 공간 패턴이다. 사용자가 국가를 선택했을 때 인구밀도는 “도시 봉우리”처럼 나타나고, 이동/교통/관광은 “빛의 흐름”으로 표현될 수 있다. 이는 장식이 아니라 인간 활동의 구조를 직관적으로 읽게 하기 위한 semantic visualization이다.

- 인구: 지역 밀도와 도시 중심을 3D peak/relief로
- 이동: flow field / route pulse
- 위험: 표면의 절제된 signal
- 단층: 지하의 균열/단면
- 강우: 물길/relief
- 해류: 해양 흐름
- 선택 국가/지역만 명확히 밝히고 주변은 dim

**한 화면에 모든 데이터를 동시에 켜지 않는다. One Data Hero가 원칙이다.**

## 0.6 왜 “사실적인 지구”와 “과학 시각화”를 동시에 유지해야 하는가

EARTHUS는 NASA 사진을 그대로 복제하는 서비스도 아니고, 추상적인 데이터 아트만 보여주는 서비스도 아니다.

기본 지구는:
- “NASA형 사실성보다 조금 더 정돈된 반사실적 지구”
- 실제 지구로 인지되는 geometry/terrain/ocean/cloud/atmosphere + source-backed material
- Neo-Minimal UI
- 색은 절제하고 의미가 있을 때만 강하게 사용

분석 모드에서는:
- 현실 위에 데이터가 왜곡 없이 올라간다.
- 3D Relief, Flow, Envelope, Pulse가 의미론적으로 작동한다.
- Reality / Official / Derived / Model / AI / Simulation / Counterfactual / Uncertainty가 시각적으로 구분된다.

---

# 1. 사용자가 원한 최종 경험

## 1.1 첫 화면

사용자가 처음 접속했을 때 “데모 지도”가 아니라 **지금 이 순간의 지구**가 보여야 한다.

첫 프레임에는:
- 아름답고 절제된 글로벌 Earth
- atmosphere + sunlight + terminator
- 가벼운 ocean
- coarse but real 3D cloud state/geometry (data supports); no photo/satellite shell
- 계절감 있는 snow/ice context
- 밤 지역은 과장되지 않은 city lights
- minimal controls

중요:
- 첫 화면에서 최고해상도 terrain/high-res cloud/global heavy current를 불러오지 않는다. 단, LAND/OCEAN/CLOUD가 표시되면 이미 3D이며 LOD만 낮다.
- “와, 지구다”라는 느낌은 렌더링 비용과 동일하지 않다.
- 멀리서도 실제 3D 공간이 읽혀야 하고, 가까이 갈수록 동일한 3D의 detail만 증가한다.

## 1.2 확대 경험

카메라가 `GLOBAL → CONTINENT → COUNTRY → REGION → LOCAL → UNDERWATER`로 이동하면서:
- 데이터 해상도
- 3D geometry
- visual detail
- intelligence depth
- network payload
가 함께 변화한다.

이것이 EARTHUS의 핵심이다. 사용자는 하나의 지구를 계속 확대한다고 느끼지만 내부적으로는 여러 LOD 정책이 작동한다.

## 1.3 선택 경험

국가/도시/사건을 선택하면:
- 선택 영역이 중심이 된다.
- 주변 context는 어둡게/dim 처리된다.
- 핵심 데이터 하나가 hero가 된다.
- 필요한 수치/근거만 옆에 표시된다.
- 더 깊은 질문은 panel/LLM/analysis mode로 연다.

## 1.4 FREE / EXPLORER PRO / INTELLIGENCE PRO

v5.3의 사용자 요금제는 세 단계로 단순화한다.

- **FREE — SEE THE EARTH:** 이미 계산된 Current Earth, 기본 Earth Event, 공식 안전정보와 표시된 사실 근거를 빠르게 본다.
- **EXPLORER PRO — UNDERSTAND THE EARTH:** Full Intelligence Feed, Event Room, WHY/NEXT/PAST/COMPARE/FOR ME/EVIDENCE, Watch/Follow, 3D Replay, My Earth를 사용한다.
- **INTELLIGENCE PRO — INVESTIGATE THE EARTH:** Explorer Pro 전체에 Evidence Graph, deep history, model/revision compare, Scenario/Counterfactual, custom analysis, report/export/API quota를 추가한다.

Research Lab은 독립 소비자 Tier에서 제거하고 향후 Team/Institution add-on capability로 다룬다.

공식 경보·대피·폐쇄·안전정보 자체와 표시된 과학적 근거는 paywall 뒤에 두지 않는다.

---

# 2. 레퍼런스 이미지에서 가져와야 하는 구조

아래 이미지는 픽셀 복제 대상이 아니라 **사용자가 원한 제품 문법을 해석하는 레퍼런스**다.

![EARTHUS Visual Style Reference](refs/ref_data_relief_platform.png){width=92%}

### Reference A — “박물관에 전시된 미래형 살아있는 지구”
이 레퍼런스에서 반드시 보존할 의도:
1. 기본 Earth는 사진 그대로가 아니라 정돈된 반사실적 realism.
2. 국가별 데이터는 평면 heatmap보다 3D data relief/peaks로 읽힌다.
3. 기상/해양은 흐름과 부피를 사용하되 색상은 절제한다.
4. 재난/지질은 지하 단면과 파동 등 “보이지 않는 지구”를 보여준다.
5. 유료 분석은 graphite background와 deeper analytics.
6. 기본 UI는 거의 숨기고 데이터 근처에 필요한 정보만 둔다.

![EARTHUS Intelligence Platform Development Reference](refs/ref_intelligence_platform.png){width=92%}

### Reference B — Earth Intelligence Platform
이 레퍼런스에서 제품 구조로 가져올 것:
- Data Relief 3D
- Forecast fusion / uncertainty
- Hazard intelligence
- globe interaction
- timeline morph
- Decision / Trust / Memory / World Model / Simulation / Personal Agent 방향
- 모바일과 데스크톱을 각각 다른 density profile로 설계

**금지:** 레퍼런스 이미지에 나온 숫자·경로·위험값을 제품 live data로 복사하지 않는다. 레퍼런스는 layout/semantic 표현의 방향만 제공한다.

---

# 3. EARTHUS 전체 개념도

```text
                        EARTHUS V2
             "WHERE EARTH BECOMES ONE"

 ┌────────────────────────────────────────────────────────────┐
 │                  EXPERIENCE EARTH                          │
 │  Living Earth / One Data Hero / 3D-4D / LLM / Alerts      │
 └───────────────────────▲────────────────────────────────────┘
                         │ compact read models
 ┌───────────────────────┴────────────────────────────────────┐
 │                 MATERIALIZED EARTH                         │
 │ Digest · Snapshot · Event Capsule · Tiles · Earth Diff     │
 └───────────────────────▲────────────────────────────────────┘
                         │ publish / cache / CDN
 ┌───────────────────────┴────────────────────────────────────┐
 │                INTELLIGENCE EARTH                          │
 │ Event · Evidence · Confidence · Forecast · Risk · Impact   │
 │ Memory · Analog · Scenario · Calibration · Decision Trace  │
 └───────────────────────▲────────────────────────────────────┘
                         │ canonical state
 ┌───────────────────────┴────────────────────────────────────┐
 │                     RAW EARTH                              │
 │ Provider Receipt · Observation · Official Model · Archive  │
 └───────────────────────▲────────────────────────────────────┘
                         │
 Satellite / Weather / Ocean / Terrain / City / Human / IoT
```

## 3.1 Truth chain

```text
Provider
→ Raw Artifact / Receipt
→ Canonical Signal
→ State / Event
→ Engine / Algorithm
→ Evidence Bundle
→ Confidence / Uncertainty
→ Risk / Impact / Decision Trace
→ Materialized Read Model
→ 3D/UI
→ LLM Explanation
→ Actual Outcome
→ Calibration / Memory
```

## 3.2 절대로 순서를 뒤집지 않는다

- UI가 scientific truth를 만들지 않는다.
- LLM이 수치/확률을 만들지 않는다.
- subscription tier가 truth를 바꾸지 않는다.
- 렌더링 최적화가 과학 계산 subset을 임의로 줄이지 않는다.
- fixture가 production truth가 되지 않는다.
- “보이는 것”과 “계산된 것”을 명확히 분리한다.

---

# 4. Intelligence v5.3의 의미

v5.1은 **EARTHUS가 어떻게 진실하게 생각하는가**, v5.2는 **언제 계산하고 언제 재사용하는가**를 정의했다.

```text
TRUTH → EVENT → EVIDENCE → CONFIDENCE
→ IMPACT → SCENARIO → 3D → LEARNING

PRECOMPUTE → MATERIALIZE → CACHE → DELTA INVALIDATE
→ SERVE MANY → PREMIUM COMPUTE → CACHE → LEARN
```

v5.3은 **왜 사용자가 오늘 들어오고, 사건이 바뀔 때 다시 들어오고, 다음 달에도 구독할 이유가 있는가**를 정의한다.

```text
DETECT → VERIFY → EVENT ROOM → WHY/NEXT
→ FOLLOW → REVISION → COMPARE → POSTMORTEM
→ MEMORY → NEXT EVENT
```

핵심은 새 Intelligence 엔진이 아니라 기존 Event/Evidence/Memory/Paid owner를 **Earth Intelligence Feed + Event Room + My Earth** 제품으로 승격하는 것이다.

---

# 5. Compute Class C0–C5

| Class | 목적 | 실행 시점 | 일반 사용자 영향 |
|---|---|---|---|
| C0 STATIC_BASELINE | Terrain/topology/boundary 등 | source version 변경 시 | 즉시 조회 |
| C1 MATERIALIZED_SHARED | current state/basic forecast/risk | cadence/freshness | 즉시 조회 |
| C2 EVENT_DELTA | typhoon/fire/flood/crowd anomaly | event/revision | 사용자 수와 무관 |
| C3 SHARED_DEEP | evidence/impact/analog/cause expansion | 중요 사건/공통 deep query | 계산 1회 후 공유 |
| C4 PREMIUM_PROJECTION | personal/route/business context | entitled request | 작은 private delta |
| C5 PREMIUM_SCENARIO | what-if/counterfactual/decision comparison | 명시적 유료 요청 | 고비용, quota |

Global/free first load는 C0/C1만 허용한다.

---

# 6. Materialized Earth

## 6.1 왜 필요한가

사용자가 서울을 클릭할 때마다 위성/기상/인구/API/모델/LLM을 처음부터 실행하면 사용자가 늘수록 비용이 선형으로 증가한다. EARTHUS는 **미리 계산된 세계 상태를 읽는 서비스**여야 한다.

## 6.2 계층

`WORLD → CONTINENT → COUNTRY → REGION → CITY → LOCAL CELL → EVENT FOCUS`

각 계층은 자신에게 필요한 작은 read model만 가진다.

예:
```json
{
  "area": "KR/SEOUL",
  "validAt": "2026-08-30T12:00:00Z",
  "state": {"weather":"...","air":"...","crowd":"..."},
  "activeEvents": ["evt_..."],
  "primaryRisk": {"type":"HEAT","class":"HIGH"},
  "confidence": {"grade":"HIGH"},
  "sourceRefs": ["..."],
  "freshness": {"weatherSec":600,"airSec":1800}
}
```

브라우저는 원본 20개 API를 직접 합치지 않는다.

---

# 7. Earth Version / Earth Diff

전체 지구를 매번 다시 저장하지 않는다.

```text
EarthVersion 82931
baseVersion: 82930
changedKeys:
  KR/SEOUL/weather
  KR/BUSAN/typhoon
  ID/KALIMANTAN/fire
```

이 구조의 목적:
- 재계산 범위 최소화
- snapshot lineage
- “아침 이후 뭐가 달라졌어?” 기능
- audit/replay
- cache invalidation
- 동일 계산 재사용

---

# 8. 4-way LOD

## Spatial LOD
`GLOBAL → CONTINENT → COUNTRY → REGION → LOCAL → UNDERWATER`

## Temporal LOD
`NOW/high detail → near future → medium range → long range → historical aggregation`

## Intelligence LOD
`STATUS → CHANGE → EVIDENCE → IMPACT → DEEP → SCENARIO`

## Visual LOD
`FULL_3D / BALANCED_3D / LITE_3D / STATIC_3D`

4개의 LOD를 별도 구현하되 최종 정책은 FND-017이 단일 권한으로 결정한다.

---

# 9. 인프라 확장과 Compute Economics

## 9.1 목적

유료 사용자가 늘었다는 이유만으로 GPU를 구매하지 않는다. 먼저 실제 compute telemetry를 측정한다.

측정:
- Materialized/cache hit ratio
- ReuseFactor = served responses / actual heavy compute executions
- SingleFlight coalesced request count
- CPU core seconds
- GPU seconds
- memory GB-seconds
- provider API calls
- object storage ops
- network egress
- LLM tokens/calls
- queue p95/p99
- request p95/p99
- C4/C5 mix
- cost per shared event result
- cost per premium projection/scenario

## 9.2 scaling ladder
- L0: CPU + cache/CDN + Materialized Earth
- L1: 측정된 GPU-eligible bottleneck만 bounded GPU pilot
- L2: sustained workload에서 queued/pool GPU workers
- L3: 지속적인 이용률/queue/reliability/cost 근거가 생겼을 때 dedicated/self-hosted cluster

Base Earth와 공식 안전정보, C0/C1 materialized intelligence는 GPU가 꺼져도 동작해야 한다.

## 9.3 Compute Budget
각 engine/runtime capability에:
- `computeClass`
- `estimatedCost`
- `ttl`
- `freshnessHalfLife`
- `dependencyKeys`
- `invalidationKeys`
- `regionGranularity`
- `timeGranularity`
- `shareScope`
- `premiumOnly`
- `maxRuntime`
- `fallbackMode`
를 등록한다.

---

# 10. Claude Code가 반드시 이해해야 할 “왜”

EARTHUS의 개발 목표를 단순 task checklist로 해석하지 않는다.

### Terrain을 만드는 이유
현실의 공간적 원인과 결과를 시각적으로 설명하기 위해.

### Ocean을 만드는 이유
지구를 육지 중심 UI가 아닌 연결된 물리 시스템으로 보여주기 위해.

### Cloud를 만드는 이유
현재 지구가 “살아있음”을 느끼게 하고, 기상/태풍 intelligence와 자연스럽게 연결하기 위해.

### Bathymetry/Underwater를 만드는 이유
지상의 현상과 해저/판구조/해양 위험을 동일한 planet context에서 이해시키기 위해.

### Human Flow를 만드는 이유
위험의 의미는 자연현상 자체가 아니라 사람/시설/경제와 만날 때 발생하기 때문에.

### Intelligence를 만드는 이유
레이어를 많이 보여주는 것만으로는 사용자가 무엇이 중요한지 알 수 없기 때문에.

### Materialization을 만드는 이유
많은 사용자가 같은 세계 상태를 볼 때 동일 계산을 반복하지 않기 위해.

### Memory/Calibration을 만드는 이유
예측을 한 뒤 실제 결과와 비교하지 않는 시스템은 지능적으로 개선되지 않기 때문에.

### 3D를 만드는 이유
멋을 위한 것이 아니라 위치·관계·높이·흐름·시간을 한 번에 이해시키기 위해.

---

# 11. 개발 원칙

1. 기존 repository/current worktree 먼저 감사.
2. 이미 있는 255 Engine/198 Algorithm을 우선 재사용.
3. 신규 Engine ID는 gap evidence가 있을 때만.
4. 한 개 Cesium Viewer / 한 개 canonical Earth runtime.
5. provider truth와 presentation controller 권한 분리.
6. real geometry를 fake visual로 대체하지 않는다.
7. global heavy render 금지.
8. browser direct provider call 최소화; adapter/cache 계층 사용.
9. observable state: `LIVE / STALE / PARTIAL / UNAVAILABLE`.
10. 안전정보는 실패/결측을 `0`, “안전”으로 대체하지 않는다.
11. browser/device evidence 없으면 production ready 아님.
12. Git reset/clean/restore destructive operation 금지.

---

# 12. 실제 엔진 개발 공통 방법

모든 Engine은 아래 순서로 개발한다.

```text
A. PURPOSE
B. EXISTING OWNER AUDIT
C. INPUT CONTRACT
D. OUTPUT CONTRACT
E. TRUTH CLASS
F. PROVIDER / DEPENDENCY
G. PURE COMPUTE CORE
H. I/O ORCHESTRATION
I. STORAGE / VERSION / HASH
J. CACHE / MATERIALIZATION / INVALIDATION
K. API CONTRACT
L. VISUAL CONSUMER
M. INTELLIGENCE CONNECTION
N. FAILURE / STALE / PARTIAL
O. TEST
P. PERFORMANCE
Q. EVIDENCE MANIFEST
R. ROLLBACK
```

### 12.1 Engine 완료 조건
- 실제 source 또는 공식/고정 fixture
- constant placeholder 아님
- source/validAt/retrievedAt/model/config/input hash 존재
- unit/integration/E2E
- browser visual evidence 필요 시 screenshot
- resource disposal
- performance budget
- fail-soft
- regression
- known limitations
- rollback

---

# 13. Intelligence 개발 방법

## 13.1 데이터가 아니라 Event를 중심으로
태풍/폭우/산불/혼잡을 “레이어”로 끝내지 않는다.

```text
Observation
→ Official Forecast
→ Model Signal
→ Derived/AI Analysis
→ Event
→ Revision
→ Impact
→ User/Business Impact
→ Actual Outcome
→ Calibration
```

## 13.2 Truth classes
- OBSERVED
- OFFICIAL_FORECAST
- DERIVED
- MODEL_SIGNAL
- AI_SIGNAL
- SIMULATION_ONLY
- COUNTERFACTUAL
- INSUFFICIENT_DATA

UI와 LLM 모두 이 class를 유지한다.

## 13.3 Confidence와 Uncertainty
Confidence 하나의 숫자로 모든 것을 덮지 않는다.
- source quality
- freshness
- spatial fit
- temporal fit
- cross-source agreement
- model validation
- coverage
- unresolved conflicts
를 기록하고, 불확실성 범위/원인을 별도로 보여준다.

## 13.4 Hypothesis/Active Observation
항상 실행하지 않는다.
`High Impact × High Uncertainty`일 때만:
- 가능한 원인 가설 생성
- 어떤 evidence가 부족한지 Observation Gap 계산
- 가장 정보가치가 높은 provider 1~2개만 갱신
- 충분한 confidence가 되면 중단

## 13.5 Memory
과거 raw 전체를 매번 읽지 않는다.

```text
FULL EVENT
→ EVENT CAPSULE
→ EVENT GENOME / VECTOR + metadata
→ TOP-K ANALOG
→ RAW REHYDRATE only if needed
```

## 13.6 LLM — Evidence-bound Explanation + 3D Interaction
LLM은 scientific compute의 마지막 설명/interaction 계층이다. 단순 텍스트 패널로 끝나지 않는다.
- “NOW / WHY / NEXT / PAST / COMPARE / WHAT IF / FOR ME / EVIDENCE”를 source-backed Intelligence Packet으로 설명한다.
- 승인된 Scene Tool을 통해 동일한 3D Earth의 focus/time/truth/compare/scenario view를 조작한다.
- LLM의 scene action은 반드시 Tool Orchestrator → IntelligenceContext → FND-017 → SceneIntent → Scene Orchestrator를 통과한다.
- 수치/확률/경보/폐쇄/재고/원인/geometry/좌표를 생성하지 않는다.
- 3D 표현에 필요한 물리 상태는 Domain Engine/Intelligence가 만들고, LLM은 선택·탐색·설명만 한다.

---

# 14. Shared Compute + Private Projection

개인화의 95%를 다시 계산하지 않는다.

```text
REGIONAL SHARED IMPACT
            +
      PRIVATE CONTEXT
(location / route / saved place / schedule)
            ↓
      SMALL PROJECTION
```

Private output은 public cache에 저장하지 않는다.
정확한 movement history는 필요 최소화/명시적 consent 없이는 사용하지 않는다.

---

# 15. 시각 시스템 개발 규칙

## 15.1 Main Earth
- Semi-realistic Living Earth
- Neo-Minimal
- 주변 dimming
- One Data Hero
- primary dynamic engine 원칙 1개
- 필요 시 secondary 1개
- GLOBAL은 mapped.earth 수준 이상의 실제 3D 공간감이 최소 합격선이며, 고가 효과보다 verified geometry/flow/LOD/현재성을 우선한다

## 15.2 Relief
Relief는 data value를 geometry-like form으로 시각화하는 presentation이다.
원본 terrain geometry를 바꾸지 않는다.
예:
- rainfall mountain
- population peaks
- temperature relief
- crowd relief

## 15.3 Flow
- wind
- ocean current
- movement/logistics
- river flow
데이터의 방향/속도 의미를 유지한다.

## 15.4 Underground
지진/단층/해구는 surface icon만으로 끝내지 않고, 필요할 때 cross-section/subsurface visual을 제공한다.

## 15.5 Truth Lens
Observed와 Model을 동일 색/선으로 합치지 않는다.
Uncertainty는 translucent envelope/range.
Counterfactual은 ghost/alternate state.
Simulation은 명시적 badge.

---


# 17A. PHYSICAL 3D WORLD REPRESENTATION CONTRACT

모든 domain output은 최종 UI에 오기 전에 **공간 표현 유형**을 가져야 한다. 3D가 과학적 의미를 만들지는 않지만, EARTHUS Intelligence가 계산한 위치·관계·높이·깊이·흐름·영향·시간을 사용자가 이해하려면 표현 가능한 공간 계약이 필요하다.

| Domain / State | Canonical 3D representation | 데이터가 부족할 때 | 금지 |
|---|---|---|---|
| LAND / Mountain | verified elevation `GEOMETRY` | lower-LOD 3D terrain | photo sphere, painted mountain |
| OCEAN SURFACE | 0m `SURFACE` + mask + physical material | coarse 3D surface | blue raster as ocean |
| BATHYMETRY / TRENCH | negative-elevation `GEOMETRY` | lower-LOD verified bathymetry / OFF | invented trench |
| WATER COLUMN | bounded `VOLUME` only when meaningful | simplified optical medium / OFF | fake scientific density |
| CLOUD | `VOXEL/VOLUME` or CTH `3D RELIEF/MESH` | STATIC_3D / OFF | satellite shell final renderer |
| ATMOSPHERE | analytic/volumetric scattering | lower quality scattering | flat glow pretending physics |
| SNOW / ICE | terrain `MATERIAL/STATE`; thickness geometry only with depth data | extent-only material | invented depth/SWE |
| FOREST COVER | terrain-linked `RELIEF/MATERIAL` | coarse class relief | forest photo overlay as structure |
| CANOPY HEIGHT | canopy `RELIEF/INSTANCE FIELD` from height data | lower-density instances / relief | random decorative trees |
| RIVER | verified channel `GEOMETRY` + `FLOW` | line/flow with scale disclosure | invented channel width/depth |
| FLOOD / INUNDATION | terrain-following `SURFACE/VOLUME` from validated solver/observation | extent polygon draped on 3D terrain | fake water depth |
| RAIN / SNOW | `FIELD/VOLUME/PARTICLE` only to supported dimension | surface field / curtain | invented vertical profile |
| WIND | vector `FLOW`; multi-level 3D only with vertical levels | 2.5D surface flow | fake upper-air flow |
| TEMPERATURE / PRESSURE | layer/field/isosurface appropriate to available dimensions | terrain/surface field | fake 3D atmosphere from 2D data |
| OCEAN CURRENT | `FLOW` at observed/model depth level | surface-only flow | fabricated deep current |
| WAVE / SWELL | 3D surface response + direction field, amplitude bounded by data semantics | symbolic surface/flow | film-like arbitrary waves |
| POPULATION / CROWD | `TOWER/RELIEF` with geometry provenance | aggregate cluster/tower | flat heatmap as canonical view |
| HUMAN MOVEMENT | `FLOW/NETWORK/TRACK` only with direction evidence | scalar change without vector | invented OD direction |
| EARTHQUAKE | true hypocenter `SUBSURFACE POINT/VOLUME` | point depth only | surface-only dot when depth exists |
| FAULT / PLATE | verified `SUBSURFACE GEOMETRY/CROSS-SECTION` | boundary/context only | invented slab geometry |
| TSUNAMI | water-surface `PROPAGATION FIELD` from official/model/validated solver | official travel-time/alert context | decorative rings sold as simulation |
| VOLCANO | terrain + verified plume/ash `VOLUME/FIELD` | event marker + terrain | invented plume |
| WILDFIRE | terrain + verified hotspots/perimeter + smoke `FLOW/VOLUME` when supported | hotspots only | invented perimeter/smoke |
| AIR / POLLUTION | ground `FIELD` or 3D plume only with vertical/model data | surface field | fake plume volume |
| GLACIER / CRYOSPHERE | terrain + ice extent/thickness/velocity where available | extent/material only | invented ice thickness |
| RADIATION / NUCLEAR | source/event point + measured/model `FIELD/PLUME/VOLUME` + impact context | source/event context | unsupported exposure cone |
| TOURISM / TRAVEL | terrain + crowd tower + route/flow + event beacons | verified POI/crowd only | decorative pseudo crowd |

## 17A.1 Visual data dimension rule

`sourceDimension`과 `renderDimension`을 저장한다.

```text
0D point       → point/beacon/depth point
1D line        → track/river/fault line
2D surface     → field/relief/surface material
2.5D height    → relief/tower/CTH mesh
3D volume      → voxel/volume/isosurface
4D time        → time-morph / replay / revision
```

`renderDimension > sourceDimension`일 경우 반드시 **어떤 물리/통계 모델로 차원을 확장했는지** `derivationMethod`, `modelVersion`, `uncertainty`가 있어야 한다. 없으면 차원 승격을 금지한다.

---

# 17B. INTELLIGENCE → 3D SCENE PROJECTION CONTRACT

기존 v5.1의 `Evidence → Event → Confidence → Scene` 철학을 **실행 가능한 3D 계약**으로 고정한다. 모든 중요 Intelligence output은 `sceneProjection`을 가질 수 있어야 한다. 데이터가 3D 표현을 지원하지 않으면 `sceneProjection.status=INSUFFICIENT_DATA`가 정답이다.

```json
{
  "eventId": "evt_...",
  "revisionId": "rev_...",
  "truthClass": "OBSERVED|OFFICIAL_FORECAST|DERIVED|MODEL_SIGNAL|AI_SIGNAL|SIMULATION_ONLY|COUNTERFACTUAL",
  "sceneProjection": {
    "status": "READY|DEGRADED|INSUFFICIENT_DATA",
    "sceneIntent": "EARTH_FOCUS|EVENT_FOCUS|COMPARE|SCENARIO|UNDERWATER",
    "scope": "GLOBAL|CONTINENT|COUNTRY|REGION|LOCAL|UNDERWATER",
    "focusGeometry": {},
    "timeMode": "LIVE|FORECAST|HISTORY|SCENARIO",
    "primary": {"visualType":"GEOMETRY|SURFACE|RELIEF|FIELD|FLOW|VOLUME|SUBSURFACE|TRACK|PULSE"},
    "context": [],
    "uncertaintyGeometry": {},
    "sourceRefs": [],
    "renderBudgetClass": "LIGHT|MEDIUM|HEAVY",
    "fallback3D": ["MEDIUM_3D","LOW_3D","STATIC_3D","OFF"]
  }
}
```

### 규칙

- Intelligence가 `WHY`를 계산하면 evidence/cause 후보는 **지형·고도·흐름·시간 관계로 보일 수 있는 SceneProjection**을 같이 구성한다.
- `NEXT`는 official/model/derived forecast의 서로 다른 3D semantics를 사용한다.
- `PAST`는 동일 scene recipe를 과거 Event Capsule로 rehydrate한다.
- `COMPARE`는 A/B toggle, split-time, delta geometry/field를 사용하되 두 개의 무거운 지구를 동시에 돌리지 않는다.
- `WHAT IF`는 immutable baseline을 clone한 `SIMULATION_ONLY/COUNTERFACTUAL` branch다.
- `EVIDENCE`는 3D object/field를 source/time/quality/evidence record와 역추적 가능해야 한다.

---

# 17C. LLM → 3D EARTH INTERACTION CONTRACT

기존 문서의 "LLM은 마지막 설명 계층"만으로는 부족하다. **LLM은 계산 엔진이 아니지만, 검증된 Intelligence Packet을 사용자가 3D로 탐색하는 인터페이스**가 되어야 한다.

## 17C.1 허용 역할

LLM은 다음을 할 수 있다.

1. 질문 의도 해석
2. 필요한 Intelligence Packet / Event Revision / Evidence 요청
3. 승인된 Scene Tool 호출 제안
4. 3D scene focus/time/truth-lens/compare/scenario view 전환
5. 현재 3D 장면을 source-backed 언어로 설명
6. 보고서/brief 생성

LLM은 다음을 할 수 없다.

- terrain/ocean/cloud geometry 생성
- 임의 좌표/고도/수심 생성
- 확률/원인/책임 생성
- physics solver 대체
- live scene state 직접 mutation
- renderer 직접 제어

## 17C.2 Approved Scene Tools

LLM Tool Orchestrator가 호출할 수 있는 scene-level capability는 **SceneIntent로만** 표현한다.

```text
focus_area(event/place/geometry)
set_scope(GLOBAL..UNDERWATER)
set_time(LIVE/FORECAST/HISTORY/SCENARIO, t)
set_truth_lens(classes[])
show_primary_visual(visualId)
show_context_visual(visualId)
compare_revision(a,b)
open_scenario(branchId)
show_uncertainty(mode)
show_evidence(claimId/sourceRef)
reset_scene_to_verified_state()
```

모든 Scene Tool은:

`LLM → Tool Orchestrator → capability/auth → IntelligenceContext → FND-017 → SceneIntent → Scene Orchestrator → Visual Engine`

경로를 통과한다.

## 17C.3 질문 예시 — 한파

사용자: **"왜 한파가 오래 지속돼? 앞으로도 지속될 가능성이 왜 있어?"**

LLM은 텍스트만 답하지 않는다. verified inputs가 있을 때 다음 3D scene을 구성한다.

- 지상: snow/ice + temperature anomaly field
- 850 hPa: temperature/advection field
- 500 hPa: geopotential/blocking field
- upper atmosphere: jet/polar-vortex flow/volume only if supported
- time axis: past → current → subseasonal signal
- compare: historical analog / current model revisions
- uncertainty: horizon이 길어질수록 envelope/range 증가

데이터가 없는 AO/NAO/MJO/stratosphere 요소는 장면에 넣지 않는다.

## 17C.4 질문 예시 — 빙하/빙하호 산악 사고

- real terrain / slope geometry
- glacier/ice extent on terrain
- lake/river geometry if verified
- temperature/precip/snow history
- before/after satellite as **evidence input**, not world replacement
- causal claim class
- validated runoff/GLOF model이 있을 때만 scenario water propagation

LLM은 "얼음이 녹아서 발생"이라고 기사만 보고 단정하지 않고, 3D 장면에서 **확인된 공간적/시간적 evidence와 부족한 evidence를 함께 보여준다.**

---

# 17D. USER REFERENCE CANONICAL REGISTRY — 누락 방지

다음은 사용자가 직접 제공하거나 중요하다고 명시한 reference다. 더 이상 "Reference A/B" 두 장으로 뭉뚱그리지 않는다. 각 reference의 **보존해야 할 제품 문법**을 정본에 고정한다.

## R-00 mapped.earth/earth — GLOBAL MINIMUM BAR

`https://mapped.earth/earth`

- **지위:** MINIMUM VISUAL ACCEPTANCE, 단순 영감 아님.
- 보존: 실제 terrain 공간감, continuous globe navigation, zoom에 따른 3D detail 증가, data-driven relief/flow.
- Earthus 확장: 3D cloud, ocean depth, trench, underwater, subsurface, Intelligence scene, scenario.

## R-01 Manhattan 3D vertical bars — 실시간 인구/혼잡 시간 변화

![R-01 Manhattan vertical bars](refs/33F384D8-1D9F-4003-A96F-4E0445A45D97(1).jpeg){width=58%}

- 보존: 도시 전체에서 수많은 vertical bars가 실제 지리 위에 솟고 time scrub으로 상태가 바뀌는 문법.
- 금지: 평면 heatmap으로 대체.

## R-02 San Francisco Bay 3D bars — 광역권 population/crowd field

![R-02 San Francisco bars](refs/IMG_5707(1).jpeg){width=58%}

- 보존: 도시/광역권 LOD, 해안/도로/지명 context 위 data tower.

## R-03 Türkiye Population Relief — Country Data Sculpture

![R-03 Türkiye Population](refs/IMG_5704(1).jpeg){width=58%}

- 보존: 국가 경계를 유지한 채 인구밀도가 도시 봉우리/relief로 읽히는 구조.

## R-04 Italy Forest Cover Relief — 산림 분포

![R-04 Italy Forest](refs/IMG_5701(1).jpeg){width=58%}

- 보존: terrain 위 forest cover를 높이/밀도/재질로 읽는 country-scale vegetation structure.

## R-05 Türkiye Forest Type Relief — 산림 유형

![R-05 Türkiye Forest Type](refs/IMG_5703.jpeg){width=58%}

- 보존: Evergreen/Deciduous/Mixed 등 type semantics를 country relief와 결합.

## R-06 Türkiye Canopy Height — 실제 canopy height 3D

![R-06 Türkiye Canopy Height](refs/IMG_5702.jpeg){width=58%}

- 보존: canopy height가 실제 height 데이터로 솟는 구조. tree photo texture가 아니라 **height-driven 3D structure**.

## R-07 India Country Focus — 선택 국가 집중

![R-07 India Focus](refs/IMG_5689.jpeg){width=58%}

- 보존: 선택 국가 boundary/focus를 밝히고 주변 context를 dim. 선택 국가만 detail/data budget을 높인다.

## R-08 Tsunami History — Event + Bathymetry + Timeline/Archive

![R-08 Tsunami History](refs/IMG_5705.jpeg){width=58%}

- 보존: 3D globe/bathymetry와 historical event records를 하나의 사건 탐색 경험으로 연결.
- Earthus 확장: official alert / observed gauges / model travel-time / validated scenario를 Truth Lens로 분리.

## R-09 Nuclear / Radiation — Multi-layer Hazard Intelligence Story

![R-09 Nuclear Radiation](refs/IMG_5699.jpeg){width=58%}

- 보존: source/event → spatial field/plume → timeline → human/area impact를 하나의 3D Event Room에서 설명하는 문법.
- 현재 provider/solver가 없으면 **REFERENCE/P1 GAP**로 유지; 임의 radiation plume 생성 금지.

## R-10 Mariana Trench — Deep Ocean / Underwater spatial experience

![R-10 Mariana](refs/0918FB1E-A7D2-4579-BDF3-233EB59B6D0C.jpeg){width=58%}

- 보존: 0m surface와 real bathymetry 사이를 실제 depth로 이동, depth labels/evidence, underwater presentation.
- 가상 수심은 반드시 가상이라고 표시.

## R-11 Dive Replay — 실제/추정 경로를 분리한 3D 기록

![R-11 Dive Replay](refs/5A657FD7-B059-42B5-A1A4-CC120C06B9A7.jpeg){width=58%}

- 보존: time-depth profile, photo/event points, route replay.
- actual track = solid, estimated horizontal path = dashed; 측정된 depth와 추정 위치를 혼동하지 않는다.

## R-12 Taiwan Rainfall / Portugal Population / Layer Mix / Timeline Morph

![R-12 Data Relief Reference](refs/image-gen-1(10).png){width=72%}

- 보존: rainfall relief, population density relief, layer mix, timeline morph, country-scale data sculpture.

## R-13 Earth Intelligence Platform Design Reference

![R-13 Intelligence Platform](refs/EARTHUS 지구 인텔리전스 플랫폼 설계도.png){width=72%}

- 보존: Forecast fusion, hazard intelligence, Data Relief 3D, globe interaction, Decision/Trust/Memory/World Model/Simulation/Personal Agent를 3D Earth에 연결.

## R-14 Myeongdong LIVE CROWD — 실시간 도시 인구 + 예측 + 출처

![R-14 Myeongdong LIVE CROWD](refs/ref_myeongdong_live_crowd.png){width=72%}

- 보존: 실제 도시 3D context 위 density tower, 현재/예측 시간대 변화, source freshness, Watch/Alert 연결.
- 인구/혼잡이 aggregate 데이터일 경우 cell-level 정밀도로 가장하지 않는다.
- 제품 연결: Human Flow Intelligence → Population/Crowd `TOWER/RELIEF` → Time Morph → MY EARTH Watch.

### Reference governance

- reference의 숫자/데이터를 live truth로 복사하지 않는다.
- reference의 **표현 원리**는 제품 계약으로 승격한다.
- reference와 현재 문서가 충돌하면 본 registry의 승인된 intent가 우선한다.
- 새로운 reference가 추가되면 `Reference ID / product intent / forbidden interpretation / target engine`을 기록한다.

---

# 17E. DOCUMENT-WIDE CONFLICT AUDIT & OVERRIDE MAP

다음 문서군을 재검수했고, 현재 제품 결정과 충돌하는 문구를 아래와 같이 처리한다.

| Document family | 유지 | 폐기/수정 |
|---|---|---|
| Intelligence v5.0/v5.1 | Evidence/Event/Confidence/Scenario/Truth Lens, LLM truth boundary | 3D를 단순 "표현 계층"으로만 두지 않고 **필수 scene projection contract** 추가 |
| v5.2/v5.3 | FND-017, progressive LOD, Materialized Earth, paid/event intelligence | cloud shell/texture fallback, global earth skin 표현 폐기 |
| Planet Render Production | Terrain/Bathymetry/Underwater truth, resource ownership | Satellite Shell final cloud path 폐기 |
| Cloud Engine v0.1 | GK2A CTH preprocessing, provenance, bounded volume | SHELL as final fallback 폐기 |
| Production Render Architecture v0.3 | Cesium VoxelPrimitive/3D Tiles Voxels 우선 | fallback 끝은 CTH_3D/STATIC_3D/OFF; shell 금지 |
| Frontend Scene Composition | one Viewer, SceneIntent, generation/abort/rollback | BASE의 imagery는 material/context일 뿐 physical world 대체 금지 |
| Tourism Intelligence reference | 3D density tower, no heatmap, time morph | 없음; v5.3 canonical에 승격 |
| Ocean Premium / Diver | actual vs estimated, bathymetry/depth truth, replay | Underwater를 FUTURE_VISION으로만 잠그는 오래된 catalog 상태는 현재 active-hardening과 충돌하므로 재감사 필요 |
| Old v0.x/v3.x source basis | owner IDs/reuse evidence | `mixed LOD, shell, static fallback` 중 2D/photo fallback 의미는 SUPERSEDED |

**과거 문서 자체를 삭제하지 않는다.** 역사적 provenance로 보존하되 Claude Code는 본 CORRECTED CANONICAL과 충돌하는 시각 지시를 실행하지 않는다.

## 17E.1 Mandatory migration blockers found in current/historical runtime

다음이 current worktree에 남아 있으면 **PHYSICAL_3D_INTELLIGENCE_ACCEPTANCE 전에 반드시 제거/재해석**한다.

1. `earthus-planet-render-runtime-v03.js` 계열의 `cloudContext ? 'SHELL' : 'OFF'` / `setRequestedMode('SHELL')` 호출: **coarse 3D cloud mode 또는 OFF로 migration**. `SHELL`은 production physical cloud 최종 표현으로 금지.
2. `SOURCE_BASIS`의 `mixed LOD, shell, volume, ... static fallback` 문구: 3D quality ladder로 재해석. Earth physical plane에서 `STATIC`은 `STATIC_3D`만 의미한다.
3. FND-018의 `FULL/BALANCED/LITE/STATIC`: Earth visual runtime에서는 `FULL_3D/BALANCED_3D/LITE_3D/STATIC_3D` semantics로 강제한다.
4. BASE slot의 imagery/globe shell: material/reference owner일 뿐 Terrain/Ocean/Cloud geometry substitute가 아니다.
5. GEO-004 `Underwater Camera Level 3 = FUTURE_VISION` historical catalog row와 현재 P4 `REAL_DATA_WIRED` evidence가 충돌한다. 현재 repo/module/evidence를 재감사하여 **historical status와 active hardening status를 분리 기록**한다. 임의로 DONE으로 승격하지 않는다.
6. `visual-fidelity-controller` / ArcGIS imagery ownership: imagery는 material presentation만 소유하고 elevation geometry/physical state ownership을 가져가지 않는다.
7. 오래된 `low-LOD real 3D Earth geometry/material state`, `satellite shell`, `cloud texture` golden screenshot은 새 canonical acceptance의 기준으로 재사용하지 않는다.


---

# 16. 모바일/데스크톱

### Mobile
- 첫 화면 lighter visual
- compact status
- heavy panel은 bottom sheet
- thermal/battery budget 우선
- rotation/orientation
- touch conflict
- reduced motion

### Desktop
- larger viewport
- detailed legend/evidence drawer
- deeper compare
- premium analysis

### Large Display / Spatial
- wall/visionOS는 별도 quality profile
- 동일 science state를 사용하고 단지 표현량만 증가

---

# 17. 개발 우선순위

1. Current worktree audit
2. single authority / FND-017 closeout
3. Global Current Earth
4. Real Terrain
5. Ocean/Coast
6. Bathymetry/Trench/Underwater
7. Cloud progressive stack
8. Atmosphere/Lighting/Living Earth composition
9. Progressive Streaming Planet
10. Materialized Earth
11. Earth Version/Diff + Dependency Invalidation
12. Truth Lens/Event Intelligence
13. Weather/Typhoon first intelligence vertical slice
14. Human Flow/Tourism/Air/Ocean/Hydro/Geo expansion
15. Memory/Calibration
16. Premium Projection
17. Premium Scenario
18. Load/Cost/Device/Golden acceptance

---

# 18. 상세 P0–P12 continuation
아래 기존 continuation 지시는 제품의 실제 현재 상태와 구현 순서를 위한 정본 참고다. Claude Code는 current local working tree와 대조한 뒤 실행해야 한다.

# EARTHUS V2 — CODEX MASTER CONTINUATION DIRECTIVE P0–P12

## TASK NAME

EARTHUS V2 — INTELLIGENCE-GOVERNED PROGRESSIVE LIVING EARTH
P0 → P12 CONTINUATION
EXISTING REPOSITORY / EXISTING WORKTREE / DO NOT RESTART

Reference remote:
- Repository: `icegyul/earthus`
- Branch: `earthus-v2/real-living-earth-render`
- Handoff reference HEAD: `84a7381ac2a6a43a8400e0a982631168c5bf5a77`

Intelligence canonical:
- `EARTHUS_INTELLIGENCE_FINAL_INTEGRATED_CLAUDE_HANDOFF_v5.1_2026-08-30.zip`
- SHA-256: `ad7518fb5fcbce9715b006331928f514849659da6a5f11940daacb10db81d9cb`

---

# 0. ABSOLUTE CONTINUATION RULES

This is NOT a new implementation.

Do NOT:
- replan from zero
- replace the architecture with React / Next / Vite
- create a second Cesium Viewer
- duplicate Terrain/Ocean/Cloud/Intelligence engines
- build a second Planet Orchestrator
- use synthetic production truth
- use visual tricks as a substitute for real provider geometry
- lower acceptance thresholds just to get green CI
- declare `DONE` merely because a test exits 0
- deploy production or merge main without the user's explicit instruction

Git safety — NEVER do this without explicit user permission:
- `git reset`
- `git reset --hard`
- `git checkout .`
- `git restore .`
- `git clean`
- destructive branch rewrites
- stash as an automatic “cleanup” step

The local working tree may contain work not present on GitHub.
It is precious.

---

# 1. FIRST 10 MINUTES — MANDATORY AUDIT BEFORE EDITING

Run and record:

```bash
pwd
git remote -v
git branch --show-current
git rev-parse HEAD
git status --short
git log -12 --oneline --decorate
```

Locate the EARTHUS V2 repository by the `icegyul/earthus` remote.
Possible historical Mac paths include:
- `/Volumes/700gb/## APP/EARTHUS v2_APP`
- `/Volumes/740GB/## APP/EARTHUS v2_APP`

Do not assume either path exists.

Then:

1. Compare local branch / HEAD to `earthus-v2/real-living-earth-render` and `84a7381ac2a6a43a8400e0a982631168c5bf5a77`.
2. If local has later commits or dirty/untracked changes, DO NOT reset to this handoff HEAD.
3. Inspect local changes before touching the same files.
4. Read:
   - this directive
   - `CURRENT_STATUS_HEAD_84a7381.md`
   - `EVIDENCE_INDEX.md`
   - v5.1 final directive / status master / reuse mandate / provider plan.
5. Only then continue implementation.

---

# 2. SOURCE OF TRUTH

Priority order:

1. Current user's explicit instructions
2. This continuation directive
3. v5.1 final integrated Intelligence canonical
4. current repository implementation + actual browser evidence
5. older archived directives

v5.1 contains many historical directives.
Do NOT blindly execute an old directive that contradicts the current continuation state.

---

# 3. PRODUCT PRINCIPLE

The final Earthus must be:

**a light Current Earth at first load**
→ **progressively more detailed as the user zooms**
→ **only the viewed region becomes expensive**
→ **FND-017 decides the render/resource policy**
→ **real provider truth remains separate from model/AI/simulation truth**
→ **LLM explains; it does not invent measurements**

The user experience is one continuous Earth.

Internally:
`GLOBAL → CONTINENT → COUNTRY → REGION → LOCAL → UNDERWATER`

Do NOT create multiple concurrent Viewers or literal duplicate Earth globes.

---

# 4. PERFORMANCE / DESIGN PRINCIPLE

GLOBAL first screen target:
- mapped.earth-level GLOBAL 3D visual fidelity is the minimum PASS bar, not a target ceiling
- light, elegant, current, seasonal
- no need for full high-resolution Terrain at startup

Only load high-cost assets as the camera approaches.

While camera is moving:
- FAST/BALANCED quality
- lower detail
- low prefetch
- do not chase high-res tiles continuously

After camera stabilizes:
- REFINING
- center-first
- HIGH DETAIL where the eye is looking

Use:
- semantic zoom
- hysteresis
- center-first refinement
- device/network governor
- memory/GPU budget
- cache eviction
- requestRenderMode where appropriate
- actual resource readiness loading UI

No fake 0–100 loader.
If an exact byte total is unknown, show readiness of required resources, not invented percentage.

---

# 5. P0 — INTELLIGENCE AUTHORITY

Current status: `RUNTIME_WIRED`

Already verified:
FND-017 scope/policy reaches live Cesium.

Do not rebuild it.

Next P0 closeout task:
remove remaining split ownership between FND-017 and presentation code.

Target chain:

`IntelligenceContext`
→ `FND-017 Planet Intelligence Orchestrator`
→ `RenderPolicy`
→ `Visual Fidelity presentation`
→ `canonical real-living-earth runtime`
→ `single Cesium Viewer`

Critical immediate refactor:
`visual-fidelity-controller.js` still has legacy `sessionDetailLayer` / provider hot-swap behavior.
`real-living-earth.js` now owns canonical ArcGIS imagery/material input. **Imagery ownership은 imagery-as-world를 허용하지 않으며, physical geometry owner는 별도 canonical terrain/ocean/cloud runtime이다.**

Remove provider replacement from Visual Fidelity.
Visual Fidelity may:
- show/hide
- alpha/brightness/saturation/contrast
- presentation-specific camera/light
but must not independently construct/replace the canonical Esri provider.

Also avoid two independent authorities fighting over SSE/preload.
FND-017 policy must win during normal EARTH scope.
Explicit Trench/Underwater modes may have a clearly scoped exception if technically necessary; document it.

Acceptance:
- one Viewer / one canvas
- FND-017 runs fail-soft
- base Earth usable if Intelligence fails
- live Cesium render settings match policy
- no provider replacement race

---

# 6. P1 — GLOBAL CURRENT EARTH

Current status: `FOUNDATION_CODE`

Goal:
first load should be beautiful and light, not highest-detail terrain-heavy; 그러나 GLOBAL부터 real 3D terrain/ocean/cloud state여야 한다.

Visual content:
- low-LOD real 3D terrain geometry
- real 0m ocean surface
- atmosphere
- low-LOD real 3D cloud geometry/state
- day/night
- subtle city lights
- current snow/ice extent
- seasonal surface feeling

Snow/ice:
- NOAA / USNIC IMS 1 km
- meaning = snow/ice EXTENT
- NOT snow depth
- NOT SWE
- use as OBSERVED context layer, not emergency decision truth

Correct data plane:
`NOAA IMS → aws/current-earth-snow-ice adapter → cache → browser`

Do not allow browser direct NOAA calls.

Current failure:
`IMS_OBSERVED_TIMEOUT` / cache-test 502.

Required work:
1. Run adapter fetch in isolation.
2. Capture exact upstream status/timing/body identity.
3. Make adapter resilient:
   - timeout
   - retries with bounded backoff
   - stale-last-good cache
   - provider receipt
   - validAt/retrievedAt
4. Test cache contract locally without pretending it has been deployed.
5. Do not deploy the production cache unless explicitly authorized.
6. Browser must remain usable when snow/ice is unavailable.

P1 browser acceptance must show actual observed seasonal surface.
Manual screenshot review required.

---

# 7. P2 — LAND / REAL TERRAIN

Current status: `REAL_DATA_WIRED`

This is the highest visual blocker.

Real provider:
Esri WorldElevation3D Terrain3D.

Required evidence sequence:
1. Global Earth
2. Asia
3. Korea
4. Seorak mountain
5. Sokcho coast

Current Seorak failure:
- actual terrain heights exist
- but latest screen nearly uniform
- localEdgeMean ≈ 0.0003485
- texturedCellCount = 0

Do NOT:
- lower gate
- add vertical exaggeration
- fake geometry
- paint procedural mountain texture

Required investigation order:
1. Finish canonical imagery ownership cleanup from P0.
2. Log actual detail imagery provider class / URL / maximum level / precached status.
3. Log Esri imagery requested tile-level histogram for mountain view.
4. Confirm Terrain3D tile/refinement actually reaches close view.
5. Reduce observer altitude to a physically reasonable close-mountain framing.
   Current test historically used ~48km; test a substantially lower real camera altitude and smaller offset.
   Do not hardcode a guessed value without evidence.
6. Keep sampled highest point centered.
7. Wait for visual refinement using actual Cesium readiness, not arbitrary fixed sleep alone.
8. Re-capture and MANUALLY inspect.

P2 cannot become BROWSER_VERIFIED until ridges/valleys/coast are visibly legible.

---

# 8. P3 — OCEAN SURFACE / COAST

Current status: `FOUNDATION_CODE`

Goal:
- cheap global ocean from space
- progressively richer ocean near the surface
- believable coast transition
- no global heavy simulation

Develop:
- ocean color/light/reflection
- coastline/detail LOD
- actual water mask only when provider supports it
- sea-level mode transition
- device quality tiers
- avoid forcing high-cost waves at global scale

Do not confuse “blue imagery” with completed ocean rendering. Ocean PASS requires a 0m 3D water surface spatially separated from verified bathymetry; imagery/material alone is never Ocean PASS.

---

# 9. P4 — BATHYMETRY / TRENCH / UNDERWATER

Current status: `REAL_DATA_WIRED`

Trench substage currently PASS.
Protect it.

Existing truth:
- Esri TopoBathy3D sampled geometry
- synthetic=false
- verticalExaggeration=1

Underwater latest failure:
- full localEdgeMean ≈ 0.0016400
- center ≈ 0.00155535

Do not lower gate.

Improve actual visible detail through:
- camera placement
- mesh resolution only when justified by source resolution/network budget
- physically meaningful shading using actual normals
- underwater light/attenuation
- source-backed material/optical detail that never substitutes for or alters bathymetric geometry
- center-first local detail

Regression:
Trench must remain PASS while Underwater improves.

---

# 10. P5 — CLOUD

Current status: `REAL_DATA_WIRED`

Existing foundations:
- NOAA NESDIS GMGSI / GK2A imagery as OBSERVATION INPUT only
- GK2A CTH as actual-height 3D relief/mesh
- GFS/NWP vertical cloud state as bounded 3D volume/voxel input

Target progressive policy:

GLOBAL:
- coarse verified 3D cloud state; if 3D data is insufficient, OFF/INSUFFICIENT_DATA rather than photo shell

CONTINENT:
- medium 3D cloud mesh/voxel from verified cloud state

KOREA/REGION:
- GK2A actual cloud-top-height 3D relief/mesh

LOCAL, only when useful/device capable:
- bounded volumetric/voxel representation

Automatic capability fallback:
`HIGH_VOLUME → MEDIUM_VOLUME → LOW_VOLUME → CTH_3D_RELIEF → STATIC_3D → OFF`

Never render global high-cost volumetric clouds everywhere, and never use 2D satellite shell as final fallback.

Truth class must remain explicit:
observed vs official/derived vs modelled.

---

# 11. P6 — ATMOSPHERE / LIGHTING / LIVING EARTH

Current status: `RUNTIME_WIRED`

Latest full visual failure:
`earth:chroma:0.02836`

Do not lower chroma gate merely to pass.

Build final composition:
- atmosphere scattering
- sunlight
- day/night terminator
- cloud shadow
- terrain shading
- ocean lighting
- night light restraint
- seasonal snow/ice integration
- no “plastic globe” look

Visual target:
first global view can be simple, but it must feel alive and current.

---

# 12. P7 — PROGRESSIVE STREAMING PLANET

Current status: `RUNTIME_WIRED`

The skeleton exists; finish the product behavior.

Scopes:
- GLOBAL
- CONTINENT
- COUNTRY
- REGION
- LOCAL
- UNDERWATER

Implement/close:
- hysteresis between scope boundaries
- camera-motion quality state
- center-first refinement
- region resource manifests
- next-region limited prefetch
- previous-region eviction
- memory/GPU budget
- device/network quality governor
- requestRenderMode / frame-budget control
- resource lifecycle observability
- real readiness loading UI

Target memory policy:
CURRENT VIEW priority 100%
+ small next-view prefetch
+ bounded recent cache
+ unload irrelevant high-detail data

---

# 13. P8 — TRUTH LENS + EVENT INTELLIGENCE

Current status: `SPEC_ONLY`

Implement based on v5.1; do not invent a parallel framework.

Truth classes must visually and semantically separate at least:
- OBSERVED
- OFFICIAL_FORECAST
- DERIVED
- MODEL_SIGNAL
- AI_SIGNAL
- SIMULATION_ONLY
- COUNTERFACTUAL
- INSUFFICIENT_DATA

A typhoon/storm/fire/congestion item is not merely a map layer.
Create a canonical Event lineage:

observation
→ official forecast
→ model signal
→ derived/AI analysis
→ impact
→ user impact
→ actual outcome
→ calibration

Every claim must preserve source/provenance/valid time/confidence.

---

# 14. P9 — DOMAIN INTELLIGENCE

Current status: `SPEC_ONLY`

Integrate domains under the same Event/Truth/Orchestration fabric:

- Weather
- Cloud
- Typhoon / tropical systems
- Ocean
- Hydrology
- Air quality
- Human flow / tourism / congestion
- Disaster
- Geological / Earth Pulse

Before adding a new engine:
search v5.1 Engine/Algorithm Status Master and existing repository.

Reuse first.

---

# 15. P10 — ADVANCED INTELLIGENCE

Current status: `SPEC_ONLY`

Implement v5.1 advanced loop:

- Observation Gap Intelligence
- Calibration Ledger / Skill Map
- Intelligence Memory / Event Capsule
- Decision Trace
- Counterfactual Branch Graph
- Uncertainty Lens

Closed loop:

prediction / analysis
→ actual observation
→ error
→ calibration
→ future orchestration weighting

Keep counterfactual/simulation clearly separate from observed reality.

---

# 16. P11 — LLM EARTH INTELLIGENCE UX

Current status: `SPEC_ONLY`

LLM은 physics/data engine이 아니지만 **3D Earth Intelligence interaction interface**다.

Required pipeline:

```text
User Question
→ LLM Intent Interpretation
→ Approved Tool Orchestrator
→ Intelligence Packet / Evidence / SceneProjection
→ Capability + Truth + Rights Validation
→ IntelligenceContext
→ FND-017 Planet Intelligence Orchestrator
→ SceneIntent
→ Scene Orchestrator / Visual Engine
→ SAME 3D EARTH
→ LLM source-backed explanation
```

User UX:
- NOW
- WHY
- NEXT
- PAST
- COMPARE
- WHAT IF
- FOR ME
- EVIDENCE

LLM이 할 수 있는 것:
- area/event focus
- scope/zoom 요청
- time/history/revision 선택
- Truth Lens 선택
- verified primary/context visual 선택
- scenario branch 열기
- uncertainty/evidence 강조
- 현재 3D 장면 설명

LLM이 절대 할 수 없는 것:
- measurement/provider status/official warning 생성
- event probability/closure/emergency truth 생성
- terrain/ocean/cloud/bathymetry geometry 생성
- source 없는 좌표/높이/수심/경로 생성
- physics solver 또는 scenario result 생성
- correlation을 cause로 승격
- Cesium/runtime state 직접 mutation

3D scene action은 반드시 승인된 SceneIntent tool path를 사용한다. Evidence가 부족하거나 3D 차원 승격 근거가 없으면 `INSUFFICIENT_DATA`/`OFF`가 정답이다.

---

# 17. P12 — GOLDEN / DEVICE / PRODUCTION ACCEPTANCE

Current status: `SPEC_ONLY`

Golden visual set:

- G01 Global
- G02 Asia
- G03 Korea land
- G04 Pacific
- G05 Mariana / trench
- G06 Global cloud
- G07 Korea cloud
- G08 Final Living Earth
- Seasonal Current Earth
- Intelligence panel / Truth Lens

For every evidence item record:
- URL
- branch
- HEAD
- timestamp
- provider
- truth state
- quality tier
- browser
- viewport

Then real-device acceptance:
- desktop
- iPhone
- Android

Measure:
- first meaningful Earth time
- progressive transition time
- FPS/frame time
- memory
- GPU pressure
- heat/battery behavior
- slow network fallback
- retry/fail-soft
- orientation / portrait / landscape

Do NOT call `PRODUCTION_READY` before real device evidence passes.

Production deployment and main merge require explicit user authorization.

---

# 18. IMMEDIATE EXECUTION ORDER FROM THIS HANDOFF

Do not jump directly to P8 just because v5.1 exists.

Execute:

### A. Repository/worktree audit
Preserve local work.

### B. Fix current static CI contract
Update stale contract expectations to the intended canonical imagery architecture.
Never re-introduce duplicate provider code just to satisfy grep.

### C. Finish P0 ownership cleanup
Remove Visual Fidelity ArcGIS hot-swap / split ownership.

### D. Re-run
- Intelligence browser
- static CI
- Mountain browser

Intelligence and Trench currently PASS and must stay green.

### E. Close P2 Terrain visual blocker
This is the immediate visual priority.
Manual evidence review.

### F. Repair P1 Current Earth adapter/cache reliability
No synthetic snow.
No production deployment without authorization.

### G. Continue P3 → P7
Physical Living Earth + progressive streaming.

### H. Continue P8 → P11
v5.1 Intelligence productization.

### I. P12
Golden + actual devices.

Continue through P12 unless a true blocker requires an external credential, provider approval, production permission, or physical device.

When blocked:
- implement everything possible before the external boundary
- write exact blocker/evidence
- do not fake completion
- proceed with independent non-conflicting work where safe.

---

# 19. REPORT FORMAT AFTER EACH MAJOR PHASE

Report:

```text
PHASE:
STATUS:
BRANCH:
HEAD:

IMPLEMENTED:
REAL DATA/PROVIDERS:
TESTS:
BROWSER EVIDENCE:
VISUAL REVIEW:

OPEN BLOCKERS:
REGRESSIONS:
NEXT:
```

Use only the allowed maturity labels.

---

# 20. FINAL PRODUCT BAR

The final target is not “tests passed.”

The product must satisfy all four:

1. **Truthful** — real vs forecast/model/AI/simulation are distinguishable.
2. **Beautiful** — global Earth immediately feels alive, not demo/plastic.
3. **Progressive** — zoom increases detail without loading the entire planet.
4. **Intelligent** — Earthus understands evidence, uncertainty, causal context, prediction, user impact, and can explain it.

Continue existing work. Do not restart.


# 19. Engine Catalog 255 — Existing Owners First

이 목록의 목적은 새 엔진을 만드는 것이 아니라 **기존 owner를 먼저 찾고 재사용**하기 위한 것이다.

| id       | name                                           | category                   | priority   | maturity               | phase           | module                                                  | intelligence_layer              | v4_action                                                                                     |
|:---------|:-----------------------------------------------|:---------------------------|:-----------|:-----------------------|:----------------|:--------------------------------------------------------|:--------------------------------|:----------------------------------------------------------------------------------------------|
| ANA-001  | Privacy-Safe Product Telemetry Engine          | Analytics                  | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | analytics/telemetry.js                                  | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| ANA-002  | Intelligence Funnel Engine                     | Analytics                  | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | analytics/funnel.js                                     | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| ANA-003  | Alert Effectiveness Engine                     | Analytics                  | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | analytics/alert-effectiveness.js                        | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| ANA-004  | Engine Cost Attribution Engine                 | Analytics                  | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | analytics/cost-attribution.js                           | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| CLD-001  | Satellite Product and Tile Broker              | Cloud                      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | cloud/satellite-product-broker.js                       | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| CLD-002  | Cloud Top Retrieval                            | Cloud                      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | cloud/cloud-state.js                                    | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| CLD-003  | Cloud Base Retrieval                           | Cloud                      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | cloud/cloud-state.js                                    | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| CLD-004  | Multilayer Cloud Detection                     | Cloud                      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | cloud/cloud-state.js                                    | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| CLD-005  | Canonical Cloud State                          | Cloud                      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | cloud/cloud-state.js                                    | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| CLD-006  | 0-6h Cloud Nowcast                             | Cloud                      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | weather/nowcast.js                                      | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| CLD-007  | 6h-10d Forecast Cloud Volume                   | Cloud                      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | cloud/cloud-forecast.js                                 | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| CLD-008  | Cloud Confidence and Uncertainty               | Cloud                      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | cloud/cloud-forecast.js                                 | CONFIDENCE_UNCERTAINTY          | REUSE/HARDEN_CONFIDENCE; NUMERIC_CONFIDENCE_REQUIRES_CALIBRATION                              |
| CLD-009  | Adaptive Cloud Renderer                        | Cloud                      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | cloud/cloud-render-policy.js                            | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| CLD-010  | Procedural Cloud Detail Synthesizer            | Cloud                      | P2         | IMPLEMENTED_FOUNDATION | Wave 3          | cloud/procedural-detail.js                              | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| DAT-001  | Provider Adapter SDK                           | Data Plane                 | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | data/provider-adapter-sdk.js                            | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| DAT-002  | Canonical Tile Compiler                        | Data Plane                 | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | data/tile-compiler.js                                   | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| DAT-003  | Reprojection and Resampling Engine             | Data Plane                 | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | data/reprojection-resampling.js                         | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| DAT-004  | Time Slice Compiler                            | Data Plane                 | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | data/time-slice.js                                      | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| DAT-005  | Multi-tier Cache Coordinator                   | Data Plane                 | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | data/cache-coordinator.js                               | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| DAT-006  | Adaptive Tile Prefetch Engine                  | Data Plane                 | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | data/adaptive-prefetch.js                               | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| DAT-007  | Revision and Reconciliation Engine             | Data Plane                 | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | data/revision-engine.js                                 | EVIDENCE_TRUTH_DATA             | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| DAT-008  | Feature Snapshot Store Contract                | Data Plane                 | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | data/feature-snapshot.js                                | EVIDENCE_TRUTH_DATA             | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| DAT-009  | Spatial Identity Resolution Engine             | Data Plane                 | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | data/spatial-identity-resolution.js                     | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| DAT-010  | Learning Data Factory                          | Data Plane                 | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | data/learning-data-factory.js                           | EVIDENCE_TRUTH_DATA             | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| FND-001  | Cesium Globe Core Adapter                      | Foundation                 | P0         | REUSE_AS_IS            | Wave 0          | adapters/v8-compat.js                                   | FOUNDATION_SUPPORT              | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| FND-002  | Thermal and Render Quality Adapter             | Foundation                 | P0         | REUSE_AS_IS            | Wave 0          | core/resource-governor.js                               | FOUNDATION_SUPPORT              | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| FND-003  | Truth and Evidence Contract Adapter            | Foundation                 | P0         | REUSE_AS_IS            | Wave 0          | core/canonical-signal.js                                | EVIDENCE_TRUTH_DATA             | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| FND-004  | Unified Time Adapter                           | Foundation                 | P0         | REUSE_WITH_ADAPTER     | Wave 0          | adapters/v8-compat.js                                   | FOUNDATION_SUPPORT              | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| FND-005  | Provider and Source Registry                   | Foundation                 | P0         | HARDEN                 | Wave 0          | paid/rights-gate.js                                     | EVIDENCE_TRUTH_DATA             | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| FND-006  | Canonical Signal Contract                      | Foundation                 | P0         | IMPLEMENTED_FOUNDATION | Wave 0          | core/canonical-signal.js                                | EVIDENCE_TRUTH_DATA             | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| FND-007  | Engine Runtime SDK                             | Foundation                 | P0         | IMPLEMENTED_FOUNDATION | Wave 0          | core/engine-runtime.js                                  | FOUNDATION_SUPPORT              | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| FND-008  | Resource Ownership Governor                    | Foundation                 | P0         | IMPLEMENTED_FOUNDATION | Wave 0          | core/resource-governor.js                               | FOUNDATION_SUPPORT              | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| FND-009  | Scene Orchestrator                             | Foundation                 | P0         | IMPLEMENTED_FOUNDATION | Wave 0          | core/scene-orchestrator.js                              | FOUNDATION_SUPPORT              | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| FND-010  | Truth Budget Engine                            | Foundation                 | P0         | IMPLEMENTED_FOUNDATION | Wave 0          | core/truth-budget.js                                    | EVIDENCE_TRUTH_DATA             | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| FND-011  | Visual Manifest and Semantic Linter            | Foundation                 | P0         | IMPLEMENTED_FOUNDATION | Wave 0          | visual/visual-manifest.js + visual/semantic-linter.js   | FOUNDATION_SUPPORT              | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| FND-012  | Canonical Signal Lake Index                    | Foundation                 | P0         | IMPLEMENTED_FOUNDATION | Wave 0          | storage/canonical-lake.js                               | EVIDENCE_TRUTH_DATA             | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| FND-013  | Geospatial Reference Engine                    | Foundation                 | P0         | IMPLEMENTED_FOUNDATION | Wave 0          | geo/geospatial-reference.js                             | FOUNDATION_SUPPORT              | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| FND-014  | Country Focus Geometry and Dimming             | Foundation                 | P0         | IMPLEMENTED_FOUNDATION | Wave 0          | geo/country-focus.js                                    | FOUNDATION_SUPPORT              | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| FND-015  | Terrain Source and LOD Broker                  | Foundation                 | P0         | IMPLEMENTED_FOUNDATION | Wave 0          | geo/terrain-source-broker.js + geo/terrain-lod.js       | FOUNDATION_SUPPORT              | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| FND-016  | Paid Intelligence Delivery Shell               | Foundation                 | P0         | IMPLEMENTED_FOUNDATION | Wave 0          | paid/entitlement.js + paid/intelligence-orchestrator.js | FOUNDATION_SUPPORT              | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| FND-017  | Planet Intelligence Orchestrator               | Foundation                 | P0         | IMPLEMENTED_FOUNDATION | Wave 0          | core/planet-intelligence-orchestrator.js                | FUSION_STATE_ORCHESTRATION      | PROMOTE_AS_ROOT_ORCHESTRATOR; DO_NOT_CREATE_SECOND_INTELLIGENCE_ORCHESTRATOR                  |
| FND-018  | Device Network Battery Governor                | Foundation                 | P0         | IMPLEMENTED_FOUNDATION | Wave 0          | core/device-network-governor.js                         | FOUNDATION_SUPPORT              | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| GEO-001  | Terrain/Data Morph Engine                      | Geo/Terrain                | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | geo/terrain-data-morph.js                               | EXPERIENCE_RENDER               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| GEO-002  | Bathymetry and Trench Level 1                  | Geo/Terrain                | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | geo/bathymetry-policy.js                                | EXPERIENCE_RENDER               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| GEO-003  | Trench Camera Level 2                          | Geo/Terrain                | P2         | IMPLEMENTED_FOUNDATION | Wave 3          | geo/trench-camera.js                                    | EXPERIENCE_RENDER               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| GEO-004  | Underwater Camera Level 3                      | Geo/Terrain                | P2         | FUTURE_VISION          | Future          | nan                                                     | LOCKED_FUTURE                   | KEEP_LOCKED_NO_IMPLEMENTATION_WITHOUT_GAP_GATE                                                |
| GEO-005  | Place Hierarchy Resolver                       | Geo/Terrain                | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | geo/place-hierarchy.js                                  | EXPERIENCE_RENDER               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HAZ-001  | Unified Official Warning Engine                | Hazard                     | P0         | IMPLEMENTED_FOUNDATION | Wave 3          | hazards/warning-engine.js                               | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HAZ-002  | Hazard Event Graph                             | Hazard                     | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | hazards/event-graph.js                                  | EVENT_REASONING_INTELLIGENCE    | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| HAZ-003  | Earthquake Depth Engine                        | Hazard                     | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | hazards/earthquake-depth.js                             | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HAZ-004  | Seismic Cluster Context Engine                 | Hazard                     | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | hazards/earthquake-depth.js                             | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HAZ-005  | Tsunami Official Alert Integrator              | Hazard                     | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | hazards/tsunami-alert.js                                | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HAZ-006  | Tsunami Travel-Time Visualizer                 | Hazard                     | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | hazards/tsunami-alert.js                                | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HAZ-007  | Lightning Cell Tracking Engine                 | Hazard                     | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | hazards/lightning-track.js                              | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HAZ-008  | Wildfire Hotspot Fusion Engine                 | Hazard                     | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | hazards/wildfire-smoke.js                               | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HAZ-009  | Smoke Exposure Engine                          | Hazard                     | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | hazards/wildfire-smoke.js                               | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HAZ-010  | Cyclone Multi-Agency Track Resolver            | Hazard                     | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | hazards/cyclone-resolver.js                             | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HAZ-011  | Cross-Agency Event Fusion Engine               | Hazard                     | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | hazards/event-fusion.js                                 | FUSION_STATE_ORCHESTRATION      | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| HF-001   | Spatiotemporal Fusion                          | Human Flow                 | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | human-flow/spatiotemporal-fusion.js                     | FUSION_STATE_ORCHESTRATION      | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HF-002   | Earthus Spatial Cell Registry                  | Human Flow                 | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | human-flow/spatial-cell-registry.js                     | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HF-003   | Density Algorithm                              | Human Flow                 | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | human-flow/algorithms.js                                | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HF-004   | Trend Algorithm                                | Human Flow                 | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | human-flow/algorithms.js                                | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HF-005   | Evidence-limited Flow Algorithm                | Human Flow                 | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | human-flow/algorithms.js                                | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HF-006   | Baseline Crowd Forecast v0                     | Human Flow                 | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | human-flow/algorithms.js                                | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HF-007   | Ground Truth Verification                      | Human Flow                 | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | human-flow/forecast-lifecycle.js                        | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HF-008   | Calibration Loop v1                            | Human Flow                 | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | human-flow/forecast-lifecycle.js                        | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HF-009   | Confidence Engine                              | Human Flow                 | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | core/confidence.js                                      | CONFIDENCE_UNCERTAINTY          | REUSE/HARDEN_CONFIDENCE; NUMERIC_CONFIDENCE_REQUIRES_CALIBRATION                              |
| HF-010   | Anomaly Engine                                 | Human Flow                 | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | human-flow/algorithms.js                                | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HF-011   | Capacity Engine                                | Human Flow                 | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | human-flow/algorithms.js                                | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HF-012   | Risk Hard-Gate Engine                          | Human Flow                 | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | human-flow/algorithms.js                                | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HF-013   | Spatial Graph Engine                           | Human Flow                 | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | human-flow/spatial-graph.js                             | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HF-014   | Spatial Digital Twin                           | Human Flow                 | P2         | IMPLEMENTED_FOUNDATION | Wave 4          | human-flow/digital-twin.js                              | SCENARIO_COUNTERFACTUAL_SUPPORT | REUSE_FOR_DIGITAL_STATE_BASELINE; DO_NOT_RENAME                                               |
| HF-015   | Domain Policy Registry                         | Human Flow                 | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | core/domain-policy.js                                   | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HF-016   | Best Window Engine                             | Human Flow                 | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | core/domain-policy.js                                   | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HF-017   | Watch and Notification Decision                | Human Flow                 | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | human-flow/watch-notification-decision.js               | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HF-018   | Human Flow Scenario                            | Human Flow                 | P2         | IMPLEMENTED_FOUNDATION | Wave 4          | human-flow/scenario.js                                  | SCENARIO_COUNTERFACTUAL_SUPPORT | REUSE_FOR_SCENARIO_SANDBOX; COUNTERFACTUAL_CONTRACT_IS_OVERLAY_NOT_NEW_ENGINE_ID              |
| HYD-001  | Hydrography Network                            | Hydrology                  | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | hydrology/hydrography-network.js                        | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HYD-002  | River Visual Network Adapter                   | Hydrology                  | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | hydrology/river-visual-network.js                       | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HYD-003  | Runoff Engine                                  | Hydrology                  | P2         | IMPLEMENTED_FOUNDATION | Wave 4          | hydrology/runoff-routing.js                             | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HYD-004  | River Routing Engine                           | Hydrology                  | P2         | IMPLEMENTED_FOUNDATION | Wave 4          | hydrology/runoff-routing.js                             | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| HYD-005  | Flood/Inundation Scenario                      | Hydrology                  | P2         | IMPLEMENTED_FOUNDATION | Wave 4          | hydrology/runoff-routing.js                             | SCENARIO_COUNTERFACTUAL_SUPPORT | REUSE_FOR_SCENARIO_SANDBOX; COUNTERFACTUAL_CONTRACT_IS_OVERLAY_NOT_NEW_ENGINE_ID              |
| HYD-006  | Tsunami Bathymetric Propagation                | Hydrology                  | P2         | FUTURE_VISION          | Wave 4          | nan                                                     | LOCKED_FUTURE                   | KEEP_LOCKED_NO_IMPLEMENTATION_WITHOUT_GAP_GATE                                                |
| INT-001  | Planet State Graph                             | Intelligence               | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | intelligence/planet-state-graph.js                      | EVENT_REASONING_INTELLIGENCE    | REUSE_FOR_DIGITAL_STATE_BASELINE; DO_NOT_RENAME                                               |
| INT-002  | Cross-Domain Correlation Engine                | Intelligence               | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | intelligence/correlation.js                             | EVENT_REASONING_INTELLIGENCE    | REUSE_FOR_EVIDENCE_RELATION; CORRELATION/CAUSE_CANDIDATE_MUST_NOT_BE_PROMOTED_TO_PROVEN_CAUSE |
| INT-003  | Analog Event Retrieval Engine                  | Intelligence               | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | intelligence/analog-retrieval.js                        | EVENT_REASONING_INTELLIGENCE    | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| INT-004  | Regime Detection Engine                        | Intelligence               | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | intelligence/regime-detector.js                         | EVENT_REASONING_INTELLIGENCE    | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| INT-005  | Personal Impact Engine                         | Intelligence               | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | intelligence/personal-impact.js                         | EVENT_REASONING_INTELLIGENCE    | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| INT-006  | Route Exposure Engine                          | Intelligence               | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | intelligence/route-exposure.js                          | EVENT_REASONING_INTELLIGENCE    | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| INT-007  | Decision Explanation Engine                    | Intelligence               | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | intelligence/decision-explanation.js                    | EVENT_REASONING_INTELLIGENCE    | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| INT-008  | Event Story Orchestrator                       | Intelligence               | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | intelligence/story-orchestrator.js                      | EVENT_REASONING_INTELLIGENCE    | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| OCN-001  | Ocean State Fusion Engine                      | Ocean                      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ocean/ocean-state.js                                    | FUSION_STATE_ORCHESTRATION      | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OCN-002  | Surface Current Vector Engine                  | Ocean                      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ocean/ocean-state.js                                    | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OCN-003  | Wave State Engine                              | Ocean                      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ocean/wave-engine.js                                    | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OCN-004  | Swell Arrival Engine                           | Ocean                      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ocean/swell-arrival.js                                  | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OCN-005  | Tide and Sea-Level Engine                      | Ocean                      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ocean/tide-sea-level.js                                 | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OCN-006  | Marine Observation Fusion                      | Ocean                      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ocean/marine-observation.js                             | FUSION_STATE_ORCHESTRATION      | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OCN-007  | SST Front and Eddy Feature Engine              | Ocean                      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ocean/sst-features.js                                   | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OCN-008  | Coastal Exposure Engine                        | Ocean                      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ocean/coastal-exposure.js                               | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OPS-001  | Provider Health Engine                         | Operations/Governance      | P0         | IMPLEMENTED_FOUNDATION | Wave 1          | ops/provider-health.js                                  | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OPS-002  | Circuit Breaker and Backoff                    | Operations/Governance      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ops/provider-health.js                                  | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OPS-003  | Job Dependency DAG                             | Operations/Governance      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ops/job-dag.js                                          | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OPS-004  | Dead Letter Recovery                           | Operations/Governance      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ops/dead-letter-recovery.js                             | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OPS-005  | Freshness SLO Registry                         | Operations/Governance      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ops/freshness-slo.js                                    | EVIDENCE_TRUTH_DATA             | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| OPS-006  | ModelOps Lifecycle                             | Operations/Governance      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ops/modelops.js                                         | OPS_GOVERNANCE                  | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| OPS-007  | Champion/Challenger Selector                   | Operations/Governance      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ops/modelops.js                                         | OPS_GOVERNANCE                  | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| OPS-008  | Country Data Passport Compiler                 | Operations/Governance      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ops/readiness-compiler.js                               | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OPS-009  | Observation Gap Lens                           | Operations/Governance      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ops/observation-gap.js                                  | OPS_GOVERNANCE                  | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| OPS-010  | Cost Observability                             | Operations/Governance      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ops/cost-observability.js                               | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OPS-011  | Cost-to-Value Scheduler                        | Operations/Governance      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ops/cost-observability.js                               | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OPS-012  | Rollback Engine                                | Operations/Governance      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ops/rollback-engine.js                                  | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OPS-013  | Performance and Thermal Lab                    | Operations/Governance      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ops/performance-lab.js                                  | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OPS-014  | Regional Standards and Localization            | Operations/Governance      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | core/localization.js                                    | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OPS-015  | Platform Delivery Capability Gate              | Operations/Governance      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | core/platform-capability.js                             | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OPS-016  | Source Governance and Paid Use                 | Operations/Governance      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | ops/source-governance-paid-use.js                       | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OPS-017  | Fail-Soft Scene Profile Compiler               | Operations/Governance      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | core/fail-soft-scene.js                                 | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OPS-018  | Trust Ledger Drill-down                        | Operations/Governance      | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | core/trust-ledger.js                                    | EVIDENCE_TRUTH_DATA             | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| OPS-019  | Engine Reuse Enforcement Gate                  | Operations/Governance      | P0         | IMPLEMENTED_FOUNDATION | Wave 0          | ops/engine-reuse-enforcer.js                            | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PAY-001  | Entitlement Engine                             | Paid/Business              | P0         | IMPLEMENTED_FOUNDATION | Wave 1          | paid/entitlement.js                                     | DELIVERY_BUSINESS               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PAY-002  | Intelligence Panel Orchestrator                | Paid/Business              | P0         | IMPLEMENTED_FOUNDATION | Wave 1          | paid/intelligence-orchestrator.js                       | DELIVERY_BUSINESS               | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| PAY-003  | Usage Metering                                 | Paid/Business              | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | paid/usage-metering.js                                  | DELIVERY_BUSINESS               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PAY-004  | Quota Engine                                   | Paid/Business              | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | paid/usage-metering.js                                  | DELIVERY_BUSINESS               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PAY-005  | Personal Context Engine                        | Paid/Business              | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | paid/personal-context.js                                | DELIVERY_BUSINESS               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PAY-006  | Comparison Engine                              | Paid/Business              | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | paid/comparison.js                                      | SCENARIO_COUNTERFACTUAL_SUPPORT | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| PAY-007  | Scenario Engine                                | Paid/Business              | P2         | IMPLEMENTED_FOUNDATION | Wave 4          | paid/scenario.js                                        | SCENARIO_COUNTERFACTUAL_SUPPORT | REUSE_FOR_SCENARIO_SANDBOX; COUNTERFACTUAL_CONTRACT_IS_OVERLAY_NOT_NEW_ENGINE_ID              |
| PAY-008  | Report and API Engine                          | Paid/Business              | P2         | IMPLEMENTED_FOUNDATION | Wave 4          | paid/report-api-engine.js                               | DELIVERY_BUSINESS               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PAY-009  | Country Unlock Ledger                          | Paid/Business              | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | paid/country-unlock.js                                  | DELIVERY_BUSINESS               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PAY-010  | Commercial Rights Gate                         | Paid/Business              | P0         | IMPLEMENTED_FOUNDATION | Wave 1          | paid/rights-gate.js                                     | DELIVERY_BUSINESS               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PAY-011  | Subscription State Engine                      | Paid/Business              | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | paid/subscription-state.js                              | DELIVERY_BUSINESS               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PAY-012  | Premium Cache Engine                           | Paid/Business              | P1         | IMPLEMENTED_FOUNDATION | Wave 4          | paid/premium-cache.js                                   | DELIVERY_BUSINESS               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PAY-013  | Offline Trip Pack                              | Paid/Business              | VNEXT      | IMPLEMENTED_FOUNDATION | Wave 4          | paid/offline-trip-pack.js                               | DELIVERY_BUSINESS               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| QA-001   | Engine Contract Harness                        | Quality                    | P0         | IMPLEMENTED_FOUNDATION | Wave 1          | qa/contract-harness.js                                  | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| QA-002   | Fault Injection Engine                         | Quality                    | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | qa/fault-injection.js                                   | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| QA-003   | Replay Regression Engine                       | Quality                    | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | qa/replay-regression.js                                 | OPS_GOVERNANCE                  | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| QA-004   | Launch Gate Compiler                           | Quality                    | P0         | IMPLEMENTED_FOUNDATION | Wave 1          | qa/launch-gate.js                                       | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| QA-005   | Completion Evidence Compiler                   | Quality                    | P0         | IMPLEMENTED_FOUNDATION | Wave 0          | qa/completion-evidence.js                               | OPS_GOVERNANCE                  | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| SEC-001  | Secret Redaction Middleware                    | Security                   | P0         | IMPLEMENTED_FOUNDATION | Wave 1          | security/redaction.js                                   | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| SEC-002  | Public Endpoint Abuse Guard                    | Security                   | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | security/abuse-guard.js                                 | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| SEC-003  | Privacy Minimization Engine                    | Security                   | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | security/privacy-minimization.js                        | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| SEC-004  | Access Audit Ledger                            | Security                   | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | security/audit-ledger.js                                | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| SPC-001  | Earthus-Aetherus Space Event Bridge            | Space                      | P2         | IMPLEMENTED_FOUNDATION | Wave 4          | space/space-event-bridge.js                             | EARTH_SPACE_BRIDGE              | RETAIN_EARTHUS_AETHERUS_BRIDGE; PRESERVE_SPACE_UNCERTAINTY/SCREENING_LABELS                   |
| SPC-002  | Launch Event Lifecycle Engine                  | Space                      | P2         | IMPLEMENTED_FOUNDATION | Wave 4          | space/launch-event.js                                   | EARTH_SPACE_BRIDGE              | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| SPC-003  | Celestial Local Context Engine                 | Space                      | P2         | IMPLEMENTED_FOUNDATION | Wave 4          | space/celestial-context.js                              | EARTH_SPACE_BRIDGE              | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| STO-001  | Archive Packager                               | Storage/Archive            | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | storage/archive-packager.js                             | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| STO-002  | NAS Archive Agent                              | Storage/Archive            | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | storage/nas-archive-agent.js                            | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| STO-003  | Archive State Machine                          | Storage/Archive            | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | storage/archive-state-machine.js                        | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| STO-004  | Archive Verification and Deletion Gate         | Storage/Archive            | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | storage/archive-verification.js                         | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| STO-005  | Archive Catalog                                | Storage/Archive            | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | storage/archive-catalog.js                              | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| STO-006  | Restore Engine                                 | Storage/Archive            | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | storage/restore-planner.js                              | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| STO-007  | Retention and Storage Governor                 | Storage/Archive            | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | storage/archive-verification.js                         | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| STO-008  | Delta Cloud Keyframe Pack                      | Storage/Archive            | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | storage/delta-pack.js                                   | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| STO-009  | Event Capsule Builder                          | Storage/Archive            | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | storage/event-capsule.js                                | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| STO-010  | Replay Rehydration Engine                      | Storage/Archive            | P2         | IMPLEMENTED_FOUNDATION | Wave 3          | storage/replay-rehydration.js                           | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| VIS-001  | DATA TOWER                                     | Visual                     | P0         | IMPLEMENTED_FOUNDATION | Wave 1          | visual/tower-runtime-v2.js                              | EXPERIENCE_RENDER               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| VIS-002  | DATA RELIEF                                    | Visual                     | P1         | REUSE_WITH_ADAPTER     | Wave 1          | geo/terrain-data-morph.js                               | EXPERIENCE_RENDER               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| VIS-003  | DATA FIELD                                     | Visual                     | P0         | REUSE_WITH_ADAPTER     | Wave 1          | visual/visual-manifest.js                               | EXPERIENCE_RENDER               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| VIS-004  | DATA FLOW                                      | Visual                     | P1         | REUSE_WITH_ADAPTER     | Wave 1          | visual/flow.js                                          | EXPERIENCE_RENDER               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| VIS-005  | DATA NETWORK                                   | Visual                     | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | human-flow/spatial-graph.js                             | EXPERIENCE_RENDER               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| VIS-006  | DATA VOLUME                                    | Visual                     | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | visual/volume.js                                        | EXPERIENCE_RENDER               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| VIS-007  | DATA PULSE                                     | Visual                     | P1         | REUSE_WITH_ADAPTER     | Wave 1          | visual/semantic-linter.js                               | EXPERIENCE_RENDER               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| VIS-008  | DATA TRACK                                     | Visual                     | P1         | REUSE_WITH_ADAPTER     | Wave 1          | adapters/v8-compat.js                                   | EXPERIENCE_RENDER               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| VIS-009  | DATA BEACON                                    | Visual                     | P0         | REUSE_WITH_ADAPTER     | Wave 1          | visual/visual-manifest.js                               | EXPERIENCE_RENDER               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| VIS-010  | Visual Material Grammar Engine                 | Visual                     | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | visual/material-grammar.js                              | EXPERIENCE_RENDER               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| VIS-011  | Color and Accessibility Semantics              | Visual                     | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | visual/color-accessibility.js                           | EXPERIENCE_RENDER               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| VIS-012  | Label and Annotation Budget Engine             | Visual                     | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | visual/label-budget.js                                  | EXPERIENCE_RENDER               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| VIS-013  | Picking and Inspection Engine                  | Visual                     | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | visual/picking-inspection.js                            | EXPERIENCE_RENDER               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| VIS-014  | Focus Transition and Camera Choreography       | Visual                     | P1         | IMPLEMENTED_FOUNDATION | Wave 1          | visual/camera-choreography.js                           | EXPERIENCE_RENDER               | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| WX-001   | Weather Detail Information Architecture        | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/weather-detail-ia.js                            | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| WX-002   | Weather Spatiotemporal Fusion                  | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/weather-spatiotemporal-fusion.js                | FUSION_STATE_ORCHESTRATION      | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| WX-003   | Observation Quality and Provenance             | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/observation-quality-provenance.js               | EVIDENCE_TRUTH_DATA             | REUSE/HARDEN_CONFIDENCE; NUMERIC_CONFIDENCE_REQUIRES_CALIBRATION                              |
| WX-004   | Multi-Model Ensemble                           | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/ensemble.js                                     | FUSION_STATE_ORCHESTRATION      | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| WX-005   | Local Bias Correction                          | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/ensemble.js                                     | DOMAIN_ENGINE                   | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| WX-006   | Radar/Satellite Nowcast                        | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/nowcast.js                                      | DOMAIN_ENGINE                   | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| WX-007   | Weather Event Detector                         | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/weather-event-detector.js                       | EVENT_REASONING_INTELLIGENCE    | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| WX-008   | Moisture Source Attribution                    | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/moisture-attribution.js                         | CAUSAL_IMPACT                   | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| WX-009   | SST Anomaly Support                            | Weather                    | P1         | REUSE_WITH_ADAPTER     | Wave 2          | weather/moisture-attribution.js                         | CAUSAL_IMPACT                   | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| WX-010   | Cyclone Remnant Interaction                    | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/cyclone-remnant-interaction.js                  | CAUSAL_IMPACT                   | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| WX-011   | Forecast Gap Scanner                           | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/forecast-gap.js                                 | DOMAIN_ENGINE                   | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| WX-012   | Evidence Graph                                 | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/evidence-graph.js                               | EVENT_REASONING_INTELLIGENCE    | REUSE_FOR_EVIDENCE_RELATION; CORRELATION/CAUSE_CANDIDATE_MUST_NOT_BE_PROMOTED_TO_PROVEN_CAUSE |
| WX-013   | Weather Claim Gate                             | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/evidence-graph.js                               | EVENT_REASONING_INTELLIGENCE    | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| WX-014   | Weather Narrative Composer                     | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/narrative.js                                    | EVENT_REASONING_INTELLIGENCE    | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| WX-015   | Weather Action Intelligence                    | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/weather-action-intelligence.js                  | CAUSAL_IMPACT                   | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| WX-016   | Precipitation State Engine                     | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/precipitation.js                                | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| WX-017   | Precipitation Nowcast                          | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/nowcast.js                                      | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| WX-018   | Rain/Snow Phase Engine                         | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/precipitation.js                                | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| WX-019   | Rain Curtain Renderer                          | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/precipitation.js                                | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| WX-020   | Weather Ground Truth and ModelOps              | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 2          | weather/weather-modelops.js                             | FUSION_STATE_ORCHESTRATION      | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| WX-021   | Forecast Scenario Cluster Engine               | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | weather/forecast-scenario-cluster.js                    | FUSION_STATE_ORCHESTRATION      | REUSE_FOR_SCENARIO_SANDBOX; COUNTERFACTUAL_CONTRACT_IS_OVERLAY_NOT_NEW_ENGINE_ID              |
| WX-022   | Forecast Reconciliation Engine                 | Weather                    | P1         | IMPLEMENTED_FOUNDATION | Wave 3          | weather/forecast-reconciliation.js                      | FUSION_STATE_ORCHESTRATION      | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| ACT-001  | Public Action Source Registry                  | Earth Pulse/Public Action  | P0         | IMPLEMENTED_FOUNDATION | Wave PULSE-1    | action/source-registry.js                               | EVENT_PULSE_SUPPORT             | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| ACT-002  | Public Action & Event Ingestion Engine         | Earth Pulse/Public Action  | P0         | IMPLEMENTED_FOUNDATION | Wave PULSE-1    | action/ingestion.js                                     | EVENT_PULSE_SUPPORT             | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| ACT-003  | Activity Normalization Engine                  | Earth Pulse/Public Action  | P0         | IMPLEMENTED_FOUNDATION | Wave PULSE-1    | action/normalization.js                                 | EVENT_PULSE_SUPPORT             | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| ACT-004  | Action Trust Verification Engine               | Earth Pulse/Public Action  | P0         | IMPLEMENTED_FOUNDATION | Wave PULSE-1    | action/trust-verification.js                            | EVENT_PULSE_SUPPORT             | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| ACT-005  | Action Status Resolver                         | Earth Pulse/Public Action  | P0         | IMPLEMENTED_FOUNDATION | Wave PULSE-1    | action/status-resolver.js                               | EVENT_PULSE_SUPPORT             | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| ACT-006  | Location Precision Guard Engine                | Earth Pulse/Public Action  | P0         | IMPLEMENTED_FOUNDATION | Wave PULSE-1    | action/location-precision.js                            | EVENT_PULSE_SUPPORT             | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PUL-001  | Earth Pulse Orchestrator                       | Earth Pulse                | P0         | IMPLEMENTED_FOUNDATION | Wave PULSE-1    | pulse/earth-pulse-orchestrator.js                       | EVENT_PULSE_SUPPORT             | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PUL-002  | Pulse Scene Budget Engine                      | Earth Pulse                | P0         | IMPLEMENTED_FOUNDATION | Wave PULSE-1    | pulse/pulse-scene-budget.js                             | EVENT_PULSE_SUPPORT             | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| NEWS-001 | News Geospatial Event Linker                   | News/Earth Pulse           | P0         | IMPLEMENTED_FOUNDATION | Wave PULSE-1    | news/news-event-linker.js                               | EVENT_PULSE_SUPPORT             | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| TRV-001  | Tourism Discovery Engine                       | Tourism Intelligence       | P0         | IMPLEMENTED_FOUNDATION | Wave PULSE-1    | tourism/discovery.js                                    | DOMAIN_ENGINE                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| TRV-002  | Travel Context Composer                        | Tourism Intelligence       | P0         | IMPLEMENTED_FOUNDATION | Wave PULSE-1    | tourism/travel-context.js                               | CAUSAL_IMPACT                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| ENV-001  | Pollution Lens Orchestrator                    | Environment Intelligence   | P0         | IMPLEMENTED_FOUNDATION | Wave PULSE-1    | environment/pollution-lens.js                           | CAUSAL_IMPACT                   | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-001  | Ingestion Run Ledger                           | Backend/Data Plane         | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-0  | backend/ingestion-run-ledger.js                         | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-002  | Raw Artifact Receipt & Immutable Store Adapter | Backend/Data Plane         | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-0  | backend/raw-artifact-store.js                           | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-003  | Schema Contract & Drift Detector               | Backend/Data Plane         | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-0  | backend/schema-drift.js                                 | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-004  | Watermark & Revision Controller                | Backend/Data Plane         | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-0  | backend/watermark-revision.js                           | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-005  | Idempotency & Deduplication Engine             | Backend/Data Plane         | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-0  | backend/idempotency-dedup.js                            | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-006  | Provider Quota & Rate Budget Engine            | Backend/Data Plane         | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-0  | backend/provider-budget.js                              | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-007  | Conditional Fetch Coordinator                  | Backend/Data Plane         | P1         | IMPLEMENTED_FOUNDATION | Wave BACKEND-1  | backend/conditional-fetch.js                            | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-008  | Durable Outbox & Dispatch Engine               | Backend/Operations         | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-1  | backend/outbox-dispatch.js                              | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-009  | Poison Record Quarantine Engine                | Backend/Operations         | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-0  | backend/quarantine.js                                   | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-010  | Backfill & Replay Planner                      | Backend/Operations         | P1         | IMPLEMENTED_FOUNDATION | Wave BACKEND-1  | backend/backfill-replay.js                              | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-011  | Canonical Event Store                          | Backend/Event Intelligence | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-1  | backend/canonical-event-store.js                        | EVIDENCE_TRUTH_DATA             | REUSE_AS_CANONICAL_EVENT_AND_LINEAGE_STORE; ADD_REVISION/SCENARIO_LINKS_BY_ADAPTER            |
| BCK-012  | Event Lineage Graph Persistence                | Backend/Event Intelligence | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-1  | backend/event-lineage.js                                | EVIDENCE_TRUTH_DATA             | REUSE_AS_CANONICAL_EVENT_AND_LINEAGE_STORE; ADD_REVISION/SCENARIO_LINKS_BY_ADAPTER            |
| BCK-013  | Backend API Envelope & Typed Error Contract    | Backend/API                | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-2  | backend/api-envelope.js                                 | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-014  | Trace Correlation & Structured Log Engine      | Backend/Operations         | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-0  | backend/trace-correlation.js                            | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-015  | Secret Vault Adapter Contract                  | Backend/Security           | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-0  | backend/secret-vault-adapter.js                         | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-016  | Release Configuration Snapshot Engine          | Backend/Release            | P1         | IMPLEMENTED_FOUNDATION | Wave BACKEND-2  | backend/release-config-snapshot.js                      | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-017  | Atomic Publish & Last-Good Promotion Engine    | Backend/Data Plane         | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-1  | backend/atomic-publish.js                               | EVIDENCE_TRUTH_DATA             | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| NEWS-002 | News Source Registry                           | News/Backend               | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-1  | news/source-registry.js                                 | EVENT_PULSE_SUPPORT             | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| NEWS-003 | News Ingestion & Clustering Engine             | News/Backend               | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-1  | news/ingestion-cluster.js                               | EVENT_PULSE_SUPPORT             | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-018  | Canonical Provider Registry Compiler           | Backend/Governance         | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-3  | backend/provider-registry-compiler.js                   | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-019  | Versioned Schema Registry                      | Backend/Data Plane         | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-3  | backend/versioned-schema-registry.js                    | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-020  | Distributed Job Lease & Fencing Engine         | Backend/Operations         | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-3  | backend/distributed-job-lease.js                        | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-021  | Cross-Signal Snapshot Consistency Engine       | Backend/Data Plane         | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-3  | backend/snapshot-consistency.js                         | EVIDENCE_TRUTH_DATA             | REUSE_AS_INTELLIGENCE_CORE_OR_SUPPORT; EXTEND_BY_CONTRACT/ADAPTER_ONLY                        |
| BCK-022  | Geo-Temporal Query Planner                     | Backend/Query Plane        | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-3  | backend/geotemporal-query.js                            | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-023  | Request Coalescing SingleFlight Engine         | Backend/Query Plane        | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-3  | backend/request-coalescing.js                           | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-024  | Backend Cache Policy Resolver                  | Backend/Query Plane        | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-3  | backend/cache-policy.js                                 | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-025  | Synthetic Runtime Probe Engine                 | Backend/Operations         | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-3  | backend/synthetic-runtime-probe.js                      | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-026  | DB Migration Compatibility Gate                | Backend/Release            | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-3  | backend/migration-compatibility-gate.js                 | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-027  | Backup & Restore Drill Verifier                | Backend/Recovery           | P1         | IMPLEMENTED_FOUNDATION | Wave BACKEND-3  | backend/restore-drill-verifier.js                       | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-028  | Query Cost & Result Budget Guard               | Backend/Query Plane        | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-3  | backend/query-budget-guard.js                           | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-029  | Materialized Read Model Builder                | Backend/Query Plane        | P1         | IMPLEMENTED_FOUNDATION | Wave BACKEND-3  | backend/read-model-builder.js                           | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PRV-001  | KMA Unified Official Adapter                   | Provider Adapter           | P0         | IMPLEMENTED_FOUNDATION | Wave PROVIDER-0 | provider/kma-official-adapter.js                        | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PRV-002  | AirKorea Observation & Alert Adapter           | Provider Adapter           | P0         | IMPLEMENTED_FOUNDATION | Wave PROVIDER-0 | provider/airkorea-adapter.js                            | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PRV-003  | Seoul Population Adapter                       | Provider Adapter           | P0         | IMPLEMENTED_FOUNDATION | Wave PROVIDER-0 | provider/seoul-population-adapter.js                    | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PRV-004  | KTO Tourism Discovery Adapter                  | Provider Adapter           | P0         | IMPLEMENTED_FOUNDATION | Wave PROVIDER-0 | provider/kto-discovery-adapter.js                       | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PRV-005  | Korea Marine Water Quality Adapter             | Provider Adapter           | P1         | IMPLEMENTED_FOUNDATION | Wave PROVIDER-1 | provider/korea-marine-water-quality-adapter.js          | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PRV-006  | Copernicus Ocean Colour Adapter                | Provider Adapter           | P1         | IMPLEMENTED_FOUNDATION | Wave PROVIDER-1 | provider/copernicus-ocean-colour-adapter.js             | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PRV-007  | Sentinel-1 Oil Slick Candidate Adapter         | Provider Adapter           | P1         | IMPLEMENTED_FOUNDATION | Wave PROVIDER-1 | provider/sentinel1-oil-slick-adapter.js                 | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PRV-008  | EPA Toxic Release & Contaminated Site Adapter  | Provider Adapter           | P1         | IMPLEMENTED_FOUNDATION | Wave PROVIDER-1 | provider/epa-contamination-adapter.js                   | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PRV-009  | EEA Industrial Emissions Adapter               | Provider Adapter           | P1         | IMPLEMENTED_FOUNDATION | Wave PROVIDER-1 | provider/eea-industrial-emissions-adapter.js            | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PRV-010  | NASA EMIT Plume Adapter                        | Provider Adapter           | P1         | IMPLEMENTED_FOUNDATION | Wave PROVIDER-1 | provider/emit-plume-adapter.js                          | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PRV-011  | Public Action Feed Adapter                     | Provider Adapter           | P0         | IMPLEMENTED_FOUNDATION | Wave PROVIDER-1 | provider/public-action-feed-adapter.js                  | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| PRV-012  | Governed News Feed Adapter                     | Provider Adapter           | P0         | IMPLEMENTED_FOUNDATION | Wave PROVIDER-1 | provider/news-feed-adapter.js                           | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| NTF-001  | Push Token Lifecycle Engine                    | Notification/Backend       | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-RC | notification/token-lifecycle.js                         | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| NTF-002  | Consent & Channel Preference Engine            | Notification/Backend       | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-RC | notification/consent-preference.js                      | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| NTF-003  | Notification Delivery Receipt Engine           | Notification/Backend       | P1         | IMPLEMENTED_FOUNDATION | Wave BACKEND-RC | notification/delivery-receipt.js                        | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| NTF-004  | Notification Fatigue & Cooldown Engine         | Notification/Backend       | P1         | IMPLEMENTED_FOUNDATION | Wave BACKEND-RC | notification/fatigue.js                                 | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| NTF-005  | Watch Trigger Evaluation Engine                | Notification/Backend       | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-RC | notification/watch-trigger.js                           | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OPS-020  | Production Incident State Machine              | Operations                 | P1         | IMPLEMENTED_FOUNDATION | Wave BACKEND-RC | ops/incident-state-machine.js                           | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OPS-021  | SLO & Error Budget Engine                      | Operations                 | P1         | IMPLEMENTED_FOUNDATION | Wave BACKEND-RC | ops/slo-error-budget.js                                 | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| OPS-022  | Degraded Mode Control Plane                    | Operations                 | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-RC | ops/degraded-mode.js                                    | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| REL-001  | Feature Flag & Canary Release Engine           | Release                    | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-RC | release/feature-flag-canary.js                          | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| REL-002  | Release Evidence Gate                          | Release                    | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-RC | release/release-evidence-gate.js                        | OPS_GOVERNANCE                  | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-030  | Backend Health Aggregation Engine              | Backend/Operations         | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-RC | backend/health-aggregation.js                           | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |
| BCK-031  | Provider Failover Router                       | Backend/Data Plane         | P0         | IMPLEMENTED_FOUNDATION | Wave BACKEND-RC | backend/provider-failover-router.js                     | DATA_BACKEND_SUPPORT            | PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE                              |

# 20. Algorithm Catalog 198 — Reuse Before New

| id           | name                                                                              | domain                     | priority   | module                                         | status                 | intelligence_layer           | v4_action                                                                    |
|:-------------|:----------------------------------------------------------------------------------|:---------------------------|:-----------|:-----------------------------------------------|:-----------------------|:-----------------------------|:-----------------------------------------------------------------------------|
| ALG-ANA-001  | Alert effectiveness metrics                                                       | Analytics                  | P1         | analytics/alert-effectiveness.js               | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-ANA-002  | Engine cost attribution                                                           | Analytics                  | P1         | analytics/cost-attribution.js                  | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-CLD-001  | Satellite product/tile source score                                               | Cloud                      | P1         | cloud/satellite-product-broker.js              | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-CLD-002  | Cloud-top retrieval                                                               | Cloud                      | P1         | cloud/cloud-state.js                           | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-CLD-003  | Cloud-base retrieval                                                              | Cloud                      | P1         | cloud/cloud-state.js                           | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-CLD-004  | Multilayer detection                                                              | Cloud                      | P1         | cloud/cloud-state.js                           | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-CLD-005  | Cloud density profile                                                             | Cloud                      | P1         | cloud/cloud-state.js                           | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-CLD-006  | Observation/model/ensemble horizon blend                                          | Cloud                      | P1         | cloud/cloud-forecast.js                        | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-CLD-007  | Cloud uncertainty visual mapping                                                  | Cloud                      | P1         | cloud/cloud-render-policy.js                   | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-CLD-008  | Procedural cloud detail budget                                                    | Cloud                      | P2         | cloud/procedural-detail.js                     | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-CORE-001 | Canonical signal fingerprint                                                      | Core                       | P0         | core/canonical-signal.js                       | IMPLEMENTED_FOUNDATION | RUNTIME_RENDER_SUPPORT       | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-CORE-002 | Cross-domain confidence                                                           | Core                       | P1         | core/confidence.js                             | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-CORE-003 | Truth budget                                                                      | Core                       | P0         | core/truth-budget.js                           | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-CORE-004 | Trust ledger status                                                               | Core                       | P1         | core/trust-ledger.js                           | IMPLEMENTED_FOUNDATION | RUNTIME_RENDER_SUPPORT       | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-CORE-005 | Device-network-battery adaptive quality                                           | Core                       | P0         | core/device-network-governor.js                | IMPLEMENTED_FOUNDATION | RUNTIME_RENDER_SUPPORT       | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-CORE-006 | Planet execution plan compiler                                                    | Core                       | P0         | core/planet-intelligence-orchestrator.js       | IMPLEMENTED_FOUNDATION | RUNTIME_RENDER_SUPPORT       | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-DAT-001  | Bilinear grid resampling                                                          | Data Plane                 | P1         | data/reprojection-resampling.js                | IMPLEMENTED_FOUNDATION | DATA_EVIDENCE_SUPPORT        | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-DAT-002  | Canonical time-slice selection                                                    | Data Plane                 | P1         | data/time-slice.js                             | IMPLEMENTED_FOUNDATION | DATA_EVIDENCE_SUPPORT        | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-DAT-003  | Bounded scalar quantization                                                       | Data Plane                 | P1         | data/tile-compiler.js                          | IMPLEMENTED_FOUNDATION | DATA_EVIDENCE_SUPPORT        | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-DAT-004  | Revision fingerprint and classification                                           | Data Plane                 | P1         | data/revision-engine.js                        | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-DAT-005  | Adaptive frame prefetch                                                           | Data Plane                 | P1         | data/adaptive-prefetch.js                      | IMPLEMENTED_FOUNDATION | DATA_EVIDENCE_SUPPORT        | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-DAT-006  | Ambiguity-aware spatial identity resolution                                       | Data                       | P1         | data/spatial-identity-resolution.js            | IMPLEMENTED_FOUNDATION | DATA_EVIDENCE_SUPPORT        | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-DAT-007  | Ground-truth learning example builder                                             | Data                       | P1         | data/learning-data-factory.js                  | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-GEO-001  | Antimeridian-safe bounds                                                          | Geo                        | P0         | geo/geospatial-reference.js                    | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-GEO-002  | Country camera fit                                                                | Geo                        | P0         | geo/country-focus.js                           | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-GEO-003  | Terrain source score                                                              | Geo                        | P0         | geo/terrain-source-broker.js                   | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-GEO-004  | Screen-space terrain LOD                                                          | Geo                        | P0         | geo/terrain-lod.js                             | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-GEO-005  | Terrain/data morph                                                                | Geo                        | P1         | geo/terrain-data-morph.js                      | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-GEO-006  | Trench Level-2 camera plan                                                        | Geo                        | P2         | geo/trench-camera.js                           | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HAZ-001  | Official warning precedence merge                                                 | Hazard                     | P0         | hazards/warning-engine.js                      | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HAZ-002  | Hypocenter depth visual mapping                                                   | Hazard                     | P1         | hazards/earthquake-depth.js                    | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HAZ-003  | Seismic context clustering                                                        | Hazard                     | P1         | hazards/earthquake-depth.js                    | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HAZ-004  | Lightning centroid tracking                                                       | Hazard                     | P1         | hazards/lightning-track.js                     | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HAZ-005  | Wildfire hotspot clustering                                                       | Hazard                     | P1         | hazards/wildfire-smoke.js                      | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HAZ-006  | Cyclone agency resolver                                                           | Hazard                     | P1         | hazards/cyclone-resolver.js                    | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HAZ-007  | Cross-agency hazard event fusion                                                  | Hazard                     | P1         | hazards/event-fusion.js                        | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HF-001   | Density                                                                           | Human Flow                 | P1         | human-flow/algorithms.js                       | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HF-002   | Calibrated crowd index                                                            | Human Flow                 | P1         | human-flow/algorithms.js                       | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HF-003   | Persistent trend                                                                  | Human Flow                 | P1         | human-flow/algorithms.js                       | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HF-004   | Evidence-limited scalar flow                                                      | Human Flow                 | P1         | human-flow/algorithms.js                       | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HF-005   | Explainable crowd forecast v0                                                     | Human Flow                 | P1         | human-flow/algorithms.js                       | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HF-006   | Robust anomaly                                                                    | Human Flow                 | P1         | human-flow/algorithms.js                       | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HF-007   | Validated capacity pressure                                                       | Human Flow                 | P1         | human-flow/algorithms.js                       | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HF-008   | Risk hard gate                                                                    | Human Flow                 | P1         | human-flow/algorithms.js                       | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HF-009   | Shortest path with status/capacity penalties                                      | Human Flow                 | P1         | human-flow/spatial-graph.js                    | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HF-010   | Forecast verification metrics                                                     | Human Flow                 | P1         | human-flow/forecast-lifecycle.js               | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HF-011   | Champion/challenger                                                               | ModelOps                   | P1         | human-flow/forecast-lifecycle.js               | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HF-012   | Spatiotemporal snapshot selection                                                 | Human Flow                 | P1         | human-flow/spatiotemporal-fusion.js            | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HF-013   | Spatial cell provider mapping                                                     | Human Flow                 | P1         | human-flow/spatial-cell-registry.js            | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HF-014   | Digital twin capacity provenance gate                                             | Human Flow                 | P2         | human-flow/digital-twin.js                     | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HF-015   | Scenario isolation                                                                | Human Flow                 | P2         | human-flow/scenario.js                         | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HYD-001  | SCS runoff foundation                                                             | Hydrology                  | P2         | hydrology/runoff-routing.js                    | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HYD-002  | Linear reservoir routing foundation                                               | Hydrology                  | P2         | hydrology/runoff-routing.js                    | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HYD-003  | River visual semantic LOD                                                         | Hydrology                  | P1         | hydrology/river-visual-network.js              | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-INT-001  | Cross-domain Pearson association                                                  | Intelligence               | P1         | intelligence/correlation.js                    | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-INT-002  | Analog feature distance                                                           | Intelligence               | P1         | intelligence/analog-retrieval.js               | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-INT-003  | Regime classifier foundation                                                      | Intelligence               | P1         | intelligence/regime-detector.js                | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-INT-004  | Route exposure integration                                                        | Intelligence               | P1         | intelligence/route-exposure.js                 | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-INT-005  | Decision contribution ranking                                                     | Intelligence               | P1         | intelligence/decision-explanation.js           | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OCN-001  | Ocean vector magnitude/direction                                                  | Ocean                      | P1         | ocean/ocean-state.js                           | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OCN-002  | Wave visual exaggeration                                                          | Ocean                      | P1         | ocean/wave-engine.js                           | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OCN-003  | Deep-water swell ETA foundation                                                   | Ocean                      | P1         | ocean/swell-arrival.js                         | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OCN-004  | Sea-level residual                                                                | Ocean                      | P1         | ocean/tide-sea-level.js                        | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OCN-005  | SST front gradient                                                                | Ocean                      | P1         | ocean/sst-features.js                          | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OCN-006  | Coastal exposure score                                                            | Ocean                      | P1         | ocean/coastal-exposure.js                      | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OPS-001  | Provider health state                                                             | Operations                 | P0         | ops/provider-health.js                         | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OPS-002  | Exponential backoff                                                               | Operations                 | P1         | ops/provider-health.js                         | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OPS-003  | Cost-to-value schedule                                                            | Operations                 | P1         | ops/cost-observability.js                      | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OPS-004  | Observation gap lens                                                              | Operations                 | P1         | ops/observation-gap.js                         | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OPS-005  | Fail-soft scene selection                                                         | Operations                 | P1         | core/fail-soft-scene.js                        | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OPS-006  | Job DAG topological execution                                                     | Ops                        | P1         | ops/job-dag.js                                 | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OPS-007  | Dead-letter recovery classification                                               | Ops                        | P1         | ops/dead-letter-recovery.js                    | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OPS-008  | Freshness SLO state                                                               | Ops                        | P1         | ops/freshness-slo.js                           | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OPS-009  | Safe rollback planner                                                             | Ops                        | P1         | ops/rollback-engine.js                         | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OPS-010  | Performance acceptance compiler                                                   | Ops                        | P1         | ops/performance-lab.js                         | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OPS-011  | New-engine reuse enforcement                                                      | Ops                        | P0         | ops/engine-reuse-enforcer.js                   | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PAY-001  | Entitlement resolution                                                            | Paid                       | P0         | paid/entitlement.js                            | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PAY-002  | Country readiness                                                                 | Paid                       | P1         | paid/country-unlock.js                         | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PAY-003  | Offline trip pack selection                                                       | Paid                       | VNEXT      | paid/offline-trip-pack.js                      | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PAY-004  | Personal context minimization                                                     | Paid                       | P1         | paid/personal-context.js                       | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PAY-005  | Comparison semantic normalization                                                 | Paid                       | P1         | paid/comparison.js                             | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PAY-006  | Scenario entitlement gate                                                         | Paid                       | P2         | paid/scenario.js                               | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PAY-007  | Subscription state transition                                                     | Paid                       | P1         | paid/subscription-state.js                     | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PAY-008  | Premium analysis cache key                                                        | Paid                       | P1         | paid/premium-cache.js                          | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-QA-001   | Required launch-gate compilation                                                  | Quality                    | P0         | qa/launch-gate.js                              | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-QA-002   | Completion evidence gate                                                          | Quality                    | P0         | qa/completion-evidence.js                      | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-SEC-001  | Secret query redaction                                                            | Security                   | P0         | security/redaction.js                          | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-SEC-002  | Token-bucket abuse control                                                        | Security                   | P1         | security/abuse-guard.js                        | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-SPC-001  | Launch lifecycle state machine                                                    | Space                      | P2         | space/launch-event.js                          | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-STO-001  | Archive deletion proof                                                            | Storage                    | P1         | storage/archive-verification.js                | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-STO-002  | Cloud delta keyframe plan                                                         | Storage                    | P1         | storage/delta-pack.js                          | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-STO-003  | Replay rehydration compatibility                                                  | Storage                    | P2         | storage/replay-rehydration.js                  | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-STO-004  | Archive package manifest plan                                                     | Storage                    | P1         | storage/archive-packager.js                    | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-STO-005  | NAS outbound pull state machine                                                   | Storage                    | P1         | storage/nas-archive-agent.js                   | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-STO-006  | Archive catalog time lookup                                                       | Storage                    | P1         | storage/archive-catalog.js                     | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-VIS-001  | Bounded logarithmic tower mapping                                                 | Visual                     | P0         | visual/tower.js                                | IMPLEMENTED_FOUNDATION | RUNTIME_RENDER_SUPPORT       | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-VIS-002  | Mass-preserving estimated distribution                                            | Visual                     | P1         | visual/tower.js                                | IMPLEMENTED_FOUNDATION | RUNTIME_RENDER_SUPPORT       | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-VIS-003  | Bilinear vector sampling                                                          | Visual                     | P1         | visual/flow.js                                 | IMPLEMENTED_FOUNDATION | RUNTIME_RENDER_SUPPORT       | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-VIS-004  | Adaptive volume render policy                                                     | Visual                     | P1         | visual/volume.js                               | IMPLEMENTED_FOUNDATION | RUNTIME_RENDER_SUPPORT       | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-VIS-010  | Semantic label budget                                                             | Visual                     | P1         | visual/label-budget.js                         | IMPLEMENTED_FOUNDATION | RUNTIME_RENDER_SUPPORT       | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-VIS-011  | Semantic material grammar                                                         | Visual                     | P1         | visual/material-grammar.js                     | IMPLEMENTED_FOUNDATION | RUNTIME_RENDER_SUPPORT       | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-WX-001   | Skill-weighted model ensemble                                                     | Weather                    | P1         | weather/ensemble.js                            | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-WX-002   | Local bias correction                                                             | Weather                    | P1         | weather/ensemble.js                            | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-WX-003   | Semi-Lagrangian nowcast                                                           | Weather                    | P1         | weather/nowcast.js                             | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-WX-004   | Evidence-backed claim gate                                                        | Weather                    | P1         | weather/evidence-graph.js                      | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-WX-005   | Precipitation observed blend                                                      | Weather                    | P1         | weather/precipitation.js                       | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-WX-006   | Rain/snow phase foundation                                                        | Weather                    | P1         | weather/precipitation.js                       | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-WX-007   | Forecast gap / Early Signal                                                       | Weather                    | P1         | weather/forecast-gap.js                        | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-WX-008   | Moisture source contribution                                                      | Weather                    | P1         | weather/moisture-attribution.js                | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-WX-009   | Weather detail section compiler                                                   | Weather                    | P1         | weather/weather-detail-ia.js                   | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-WX-010   | Weather truth-class fusion                                                        | Weather                    | P1         | weather/weather-spatiotemporal-fusion.js       | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-WX-011   | Weather event evidence detector                                                   | Weather                    | P1         | weather/weather-event-detector.js              | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-WX-012   | Cyclone remnant interaction support score                                         | Weather                    | P1         | weather/cyclone-remnant-interaction.js         | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-WX-013   | Weather action hard-gate ranking                                                  | Weather                    | P1         | weather/weather-action-intelligence.js         | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-WX-014   | Weather forecast verification metrics                                             | Weather                    | P1         | weather/weather-modelops.js                    | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-WX-015   | Ensemble scenario medoid clustering                                               | Weather                    | P1         | weather/forecast-scenario-cluster.js           | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-WX-016   | Official-vs-derived forecast reconciliation                                       | Weather                    | P1         | weather/forecast-reconciliation.js             | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-HF-016   | Watch notification decision with safety priority, confidence, cooldown and dedupe | Human Flow/Action          | P1         | human-flow/watch-notification-decision.js      | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-WX-017   | Observation quality/provenance state and confidence cap                           | Weather/Data Quality       | P1         | weather/observation-quality-provenance.js      | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OPS-012  | Source operation governance matrix for paid use                                   | Operations/Governance      | P1         | ops/source-governance-paid-use.js              | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PAY-009  | Evidence-linked report/API delivery authorization                                 | Paid/Business              | P2         | paid/report-api-engine.js                      | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-VIS-012  | Truth-preserving tower spatial mode and stable pool                               | Visual                     | P0         | visual/tower-runtime-v2.js                     | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-ACT-001  | Public action source trust resolution                                             | Earth Pulse/Public Action  | P0         | action/source-registry.js                      | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-ACT-002  | Public action normalization and classification                                    | Earth Pulse/Public Action  | P0         | action/normalization.js                        | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-ACT-003  | Public action status resolution                                                   | Earth Pulse/Public Action  | P0         | action/status-resolver.js                      | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-ACT-004  | Public action location precision guard                                            | Earth Pulse/Public Action  | P0         | action/location-precision.js                   | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-ACT-005  | Public action truth classification                                                | Earth Pulse/Public Action  | P0         | action/trust-verification.js                   | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PUL-001  | Earth Pulse priority with safety override                                         | Earth Pulse                | P0         | pulse/earth-pulse-orchestrator.js              | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PUL-002  | Pulse scene beacon budget and LOD                                                 | Earth Pulse                | P0         | pulse/pulse-scene-budget.js                    | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-NEWS-001 | News-to-EarthEvent evidence link                                                  | News/Earth Pulse           | P0         | news/news-event-linker.js                      | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-TRV-001  | Tourism discovery score with safety gates                                         | Tourism Intelligence       | P0         | tourism/discovery.js                           | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-TRV-002  | Travel context reason composition                                                 | Tourism Intelligence       | P0         | tourism/travel-context.js                      | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-ENV-001  | Pollution evidence state fusion                                                   | Environment Intelligence   | P0         | environment/pollution-lens.js                  | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-ENV-002  | Pollution transport proof gate                                                    | Environment Intelligence   | P0         | environment/pollution-lens.js                  | IMPLEMENTED_FOUNDATION | DOMAIN_ALGORITHM             | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-001  | Legal ingestion-run transition state machine                                      | Backend/Data Plane         | P0         | backend/ingestion-run-ledger.js                | IMPLEMENTED_FOUNDATION | DATA_EVIDENCE_SUPPORT        | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-002  | Raw artifact SHA-256 receipt                                                      | Backend/Data Plane         | P0         | backend/raw-artifact-store.js                  | IMPLEMENTED_FOUNDATION | DATA_EVIDENCE_SUPPORT        | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-003  | Raw-to-normalized provenance link validation                                      | Backend/Data Plane         | P0         | backend/raw-artifact-store.js                  | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-004  | Schema drift severity classifier                                                  | Backend/Data Plane         | P0         | backend/schema-drift.js                        | IMPLEMENTED_FOUNDATION | DATA_EVIDENCE_SUPPORT        | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-005  | Monotonic provider watermark                                                      | Backend/Data Plane         | P0         | backend/watermark-revision.js                  | IMPLEMENTED_FOUNDATION | DATA_EVIDENCE_SUPPORT        | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-006  | Revision supersession resolver                                                    | Backend/Data Plane         | P0         | backend/watermark-revision.js                  | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-007  | Canonical idempotency-key compiler                                                | Backend/Data Plane         | P0         | backend/idempotency-dedup.js                   | IMPLEMENTED_FOUNDATION | DATA_EVIDENCE_SUPPORT        | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-008  | Duplicate versus identity-collision detector                                      | Backend/Data Plane         | P0         | backend/idempotency-dedup.js                   | IMPLEMENTED_FOUNDATION | DATA_EVIDENCE_SUPPORT        | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-009  | Provider quota reserve gate                                                       | Backend/Data Plane         | P0         | backend/provider-budget.js                     | IMPLEMENTED_FOUNDATION | DATA_EVIDENCE_SUPPORT        | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-010  | Conditional HTTP fetch decision                                                   | Backend/Data Plane         | P1         | backend/conditional-fetch.js                   | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-011  | Durable outbox lease and dispatch                                                 | Backend/Operations         | P0         | backend/outbox-dispatch.js                     | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-012  | Quarantine evidence release gate                                                  | Backend/Operations         | P0         | backend/quarantine.js                          | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-013  | Bounded backfill chunk planner                                                    | Backend/Operations         | P1         | backend/backfill-replay.js                     | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-014  | Replay priority ordering                                                          | Backend/Operations         | P1         | backend/backfill-replay.js                     | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-015  | Canonical EarthEvent merge evidence                                               | Backend/Event Intelligence | P0         | backend/canonical-event-store.js               | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-016  | Event lineage acyclic edge insertion                                              | Backend/Event Intelligence | P0         | backend/event-lineage.js                       | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-017  | Safe Internal API error mapping                                                   | Backend/API                | P0         | backend/api-envelope.js                        | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-018  | Trace/span correlation and structured log sanitation                              | Backend/Operations         | P0         | backend/trace-correlation.js                   | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-019  | Server secret reference validation                                                | Backend/Security           | P0         | backend/secret-vault-adapter.js                | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-020  | Release config canonical hash                                                     | Backend/Release            | P1         | backend/release-config-snapshot.js             | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-021  | Atomic last-good publish gate                                                     | Backend/Data Plane         | P0         | backend/atomic-publish.js                      | IMPLEMENTED_FOUNDATION | DATA_EVIDENCE_SUPPORT        | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-NEWS-002 | Governed news-source fetch policy                                                 | News/Backend               | P0         | news/source-registry.js                        | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-NEWS-003 | Bounded news normalization and clustering                                         | News/Backend               | P0         | news/ingestion-cluster.js                      | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-022  | Provider registry compile validation                                              | Backend/Governance         | P0         | backend/provider-registry-compiler.js          | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-023  | Provider registry drift diff                                                      | Backend/Governance         | P0         | backend/provider-registry-compiler.js          | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-024  | Immutable schema version/hash registration                                        | Backend/Data Plane         | P0         | backend/versioned-schema-registry.js           | IMPLEMENTED_FOUNDATION | DATA_EVIDENCE_SUPPORT        | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-025  | Schema publish approval gate                                                      | Backend/Data Plane         | P0         | backend/versioned-schema-registry.js           | IMPLEMENTED_FOUNDATION | DATA_EVIDENCE_SUPPORT        | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-026  | Distributed lease fencing                                                         | Backend/Operations         | P0         | backend/distributed-job-lease.js               | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-027  | Cross-source snapshot skew gate                                                   | Backend/Data Plane         | P0         | backend/snapshot-consistency.js                | IMPLEMENTED_FOUNDATION | DATA_EVIDENCE_SUPPORT        | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-028  | Geo-temporal bounded query                                                        | Backend/Query Plane        | P0         | backend/geotemporal-query.js                   | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-029  | SingleFlight request coalescing                                                   | Backend/Query Plane        | P0         | backend/request-coalescing.js                  | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-030  | Data-class cache policy resolution                                                | Backend/Query Plane        | P0         | backend/cache-policy.js                        | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-031  | Synthetic route acceptance probe                                                  | Backend/Operations         | P0         | backend/synthetic-runtime-probe.js             | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-032  | Migration destructive-change detector                                             | Backend/Release            | P0         | backend/migration-compatibility-gate.js        | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-033  | Restore drill manifest verification                                               | Backend/Recovery           | P1         | backend/restore-drill-verifier.js              | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-034  | Query resource budget gate                                                        | Backend/Query Plane        | P0         | backend/query-budget-guard.js                  | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-035  | Latest canonical read-model materialization                                       | Backend/Query Plane        | P1         | backend/read-model-builder.js                  | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-036  | Cache freshness predicate                                                         | Backend/Query Plane        | P0         | backend/cache-policy.js                        | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PRV-001  | KMA Unified Official Adapter normalization contract                               | Provider Adapter           | P0         | provider/kma-official-adapter.js               | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PRV-002  | AirKorea Observation & Alert Adapter normalization contract                       | Provider Adapter           | P0         | provider/airkorea-adapter.js                   | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PRV-003  | Seoul Population Adapter normalization contract                                   | Provider Adapter           | P0         | provider/seoul-population-adapter.js           | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PRV-004  | KTO Tourism Discovery Adapter normalization contract                              | Provider Adapter           | P0         | provider/kto-discovery-adapter.js              | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PRV-005  | Korea Marine Water Quality Adapter normalization contract                         | Provider Adapter           | P1         | provider/korea-marine-water-quality-adapter.js | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PRV-006  | Copernicus Ocean Colour Adapter normalization contract                            | Provider Adapter           | P1         | provider/copernicus-ocean-colour-adapter.js    | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PRV-007  | Sentinel-1 Oil Slick Candidate Adapter normalization contract                     | Provider Adapter           | P1         | provider/sentinel1-oil-slick-adapter.js        | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PRV-008  | EPA Toxic Release & Contaminated Site Adapter normalization contract              | Provider Adapter           | P1         | provider/epa-contamination-adapter.js          | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PRV-009  | EEA Industrial Emissions Adapter normalization contract                           | Provider Adapter           | P1         | provider/eea-industrial-emissions-adapter.js   | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PRV-010  | NASA EMIT Plume Adapter normalization contract                                    | Provider Adapter           | P1         | provider/emit-plume-adapter.js                 | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PRV-011  | Public Action Feed Adapter normalization contract                                 | Provider Adapter           | P0         | provider/public-action-feed-adapter.js         | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-PRV-012  | Governed News Feed Adapter normalization contract                                 | Provider Adapter           | P0         | provider/news-feed-adapter.js                  | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-NTF-001  | Push token upsert/invalidation lifecycle                                          | Notification/Backend       | P0         | notification/token-lifecycle.js                | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-NTF-002  | Notification consent gate                                                         | Notification/Backend       | P0         | notification/consent-preference.js             | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-NTF-003  | Delivery outcome aggregation                                                      | Notification/Backend       | P1         | notification/delivery-receipt.js               | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-NTF-004  | Notification fatigue window/cooldown                                              | Notification/Backend       | P1         | notification/fatigue.js                        | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-NTF-005  | Watch trigger hard-gate evaluation                                                | Notification/Backend       | P0         | notification/watch-trigger.js                  | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OPS-020  | Incident legal state transition                                                   | Operations                 | P1         | ops/incident-state-machine.js                  | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OPS-021  | SLO error-budget burn                                                             | Operations                 | P1         | ops/slo-error-budget.js                        | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-OPS-022  | Backend degraded-mode resolution                                                  | Operations                 | P0         | ops/degraded-mode.js                           | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-REL-001  | Deterministic canary assignment                                                   | Release                    | P0         | release/feature-flag-canary.js                 | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-REL-002  | Safety/entitlement feature decision                                               | Release                    | P0         | release/feature-flag-canary.js                 | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-REL-003  | Release mandatory-evidence gate                                                   | Release                    | P0         | release/release-evidence-gate.js               | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-037  | Worst-state health aggregation                                                    | Backend/Operations         | P0         | backend/health-aggregation.js                  | IMPLEMENTED_FOUNDATION | SUPPORT                      | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-038  | Truth-preserving provider failover                                                | Backend/Data Plane         | P0         | backend/provider-failover-router.js            | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |
| ALG-BCK-039  | Fail-soft read-only decision                                                      | Backend/Operations         | P0         | ops/degraded-mode.js                           | IMPLEMENTED_FOUNDATION | INTELLIGENCE_CORE_OR_SUPPORT | REUSE_EXISTING_ALGORITHM; CHANGE_ONLY_WITH_VERSIONED_EVIDENCE_AND_REGRESSION |

# 21. Capability 구현 상세

## 21.1 Compute Policy Registry
### 목적
모든 엔진이 자신이 얼마나 비싼지, 언제 재사용 가능한지, 언제 무효화되는지 선언하도록 한다.

### 구현
1. 기존 FND-017 및 cache/query/cost owner를 찾는다.
2. 선언형 registry를 만든다.
3. engine/module별 policy를 schema validation한다.
4. Orchestrator는 compute 전에 policy를 조회한다.
5. free/global first load에서 C3–C5 plan이 나오면 hard fail.
6. telemetry에 plan/actual cost를 남긴다.

### 예시 contract
```json
{
  "owner":"FND-017",
  "computeClass":"C1",
  "ttlSec":600,
  "staleWhileRevalidateSec":1800,
  "freshnessHalfLifeSec":900,
  "shareScope":"REGION",
  "dependencyKeys":["weather/radar","weather/forecast"],
  "invalidationKeys":["providerRevision"],
  "premiumOnly":false,
  "maxRuntimeMs":3000,
  "fallbackMode":"LAST_GOOD_STALE"
}
```

## 21.2 Materialized Earth Service
### 목적
복잡한 Intelligence Graph를 browser-friendly compact read model로 바꾼다.

### 저장
- immutable versioned object
- atomic pointer/latest manifest
- CDN-friendly key
- public/private separation
- source refs and freshness

### publish
`build → validate → write version → integrity check → atomic latest pointer switch`

부분 작성된 snapshot을 최신 상태로 노출하지 않는다.

## 21.3 Dependency & Invalidation
### 목적
provider 하나가 바뀌었다고 전체 지구를 다시 계산하지 않는다.

Graph:
`Provider Revision → Canonical Signal → Event/State → Derived Product → Materialized Read Model`

Algorithm:
1. revision changed keys 생성
2. dependency index에서 affected node 탐색
3. scope/time bounding
4. stale mark
5. priority queue
6. recompute
7. atomic republish
8. dependent cache purge

## 21.4 Intelligence LOD Policy
Inputs:
- camera scope
- camera motion/stable
- device capability
- network
- thermal
- user entitlement
- event importance
- uncertainty
- selected mode

Output:
- data resolution
- visual fidelity
- intelligence depth
- prefetch budget
- compute admission

## 21.5 Shared + Private Projection
1. shared result를 먼저 찾는다.
2. user context 최소 allowlist.
3. context fingerprint 생성.
4. entitlement check.
5. small projection only.
6. private TTL cache.
7. no public cache leakage.

## 21.6 Earth Version / Diff
State는 append-only.
새 version은 previous base + changed refs.
Diff는 compact semantic change를 우선 제공하고 raw diff는 분석 모드에서만.

## 21.7 Infrastructure Scaling & Compute Economics
Telemetry collector + cost ledger + capacity recommender를 별도 capability로 둔다.
**user count alone은 hardware scale trigger가 아니다.**

Scale decision:
`Measured bottleneck → software efficiency check → cache/materialization check → CPU/GPU benchmark → cost/reliability comparison → recommendation`

---

# 22. Acceptance Matrix

## Visual
- G01 Global
- G02 Asia
- G03 Korea
- G04 Pacific
- G05 Mariana/Trench
- G06 Global Cloud
- G07 Korea Cloud
- G08 Final Living Earth
- Seasonal Current Earth
- Truth Lens / Intelligence Panel

## Runtime
- one Cesium Viewer
- no provider race
- FND-017 single authority
- fail-soft base Earth
- disposal/no runaway memory
- cache/invalidation correctness
- no thundering herd

## Compute Economics
- 10k/100k/1M cached reads do not produce linear heavy compute
- 100 identical C3/C5 requests coalesce when share-safe
- GPU disabled still serves base/materialized Earth
- cost ledger uses measured usage + versioned rate inputs
- private result never crosses tenant/user cache boundary

## Device
- Desktop
- iPhone
- Android
- portrait/landscape
- slow network
- thermal/battery
- reduced motion

---

# 23. Claude Code 작업 응답 형식

각 phase 후:
1. Phase/Engine/Capability ID
2. 목적
3. 기존 구현 재사용 판정
4. 변경 파일
5. 실행 명령
6. unit/integration/E2E
7. browser/device evidence
8. performance/memory/GPU/network
9. provenance/freshness/truth
10. cost/reuse metrics
11. known limitations
12. blockers
13. rollback
14. commit SHA (커밋했을 때만)
15. 다음 task

**검증하지 않은 것은 PASS라고 쓰지 않는다.**

---

# 24. 최종 DONE 정의

EARTHUS V2가 완료됐다는 것은 문서나 함수가 존재한다는 뜻이 아니다.

다음 체인이 실제로 닫혀야 한다.

```text
REAL/OFFICIAL SOURCE
→ RECEIPT
→ CANONICAL SIGNAL
→ ENGINE
→ EVENT/STATE
→ EVIDENCE/CONFIDENCE
→ MATERIALIZED EARTH
→ CACHE/CDN
→ 3D/UI
→ LLM
→ ACTUAL OUTCOME
→ CALIBRATION/MEMORY
```

그리고 사용자가 지구를 봤을 때:
- 첫 화면은 빠르고 아름답고 현재의 지구처럼 느껴져야 한다.
- 확대하면 땅/바다/구름/해저의 실제 detail이 자연스럽게 늘어나야 한다.
- 무엇이 사실이고 무엇이 모델/AI/시뮬레이션인지 혼동되지 않아야 한다.
- 많은 사용자가 들어와도 같은 계산을 반복하지 않아야 한다.
- 유료의 가치는 깊은 분석과 개인/기업/시나리오 계산에서 나와야 한다.
- 실패한 provider 하나가 전체 지구를 망가뜨리지 않아야 한다.
- 실제 브라우저와 실기기 evidence가 있어야 한다.

이 문서가 존재하는 목적은 “기능을 많이 넣기 위해서”가 아니라 **EARTHUS가 왜 이런 구조여야 하는지를 개발자가 잃지 않게 하기 위해서**다.


---

# 25. v5.3 전환 선언 — SUBSCRIPTION PRODUCTIZATION

v5.3은 새로운 Planet Intelligence 아키텍처를 만드는 버전이 아니다. v5.2의 255 Engine / 198 Algorithm, Materialized Earth, Truth/Evidence, Event/Memory, Paid/Business, Security/Operations foundation을 보존하고, **사용자가 매주 돌아오고 매달 돈을 낼 이유가 있는 제품 표면**으로 묶는 버전이다.

v5.3의 제품 중심은 세 개다.

```text
EARTH INTELLIGENCE FEED
        ↓
EVENT ROOM
        ↓
MY EARTH
```

그리고 상위 사용자를 위한 깊이는 다음으로 확장한다.

```text
EVENT ROOM
→ EVIDENCE GRAPH
→ MODEL / REVISION COMPARE
→ ANALOG / HISTORY
→ SCENARIO / COUNTERFACTUAL
→ REPORT / EXPORT
→ POSTMORTEM / CALIBRATION
```

**뉴스는 제품이 아니다. 뉴스와 공식 발표는 Event Detection의 Trigger다. Earthus가 판매하는 것은 사건의 공간·시간·원인 후보·미래 가능성·불확실성·개인 영향·과거 비교·시뮬레이션을 하나의 3D Earth에서 근거와 함께 이해하는 경험이다.**

## 25.1 v5.3에서 폐기하는 오해

- 유료 = 레이어를 더 많이 켜주는 요금제가 아니다.
- 유료 = 데이터 해상도만 높이는 요금제가 아니다.
- Research Lab이라는 이름 자체가 독립 요금제의 이유가 되지 않는다.
- 뉴스 기사 요약을 Earth Intelligence라고 부르지 않는다.
- 기사 한 개의 원인 설명을 그대로 Earthus의 과학적 인과 주장으로 승격하지 않는다.
- 3D 애니메이션이 실제 물리 시뮬레이션을 증명하지 않는다.
- 모든 국가·모든 분야의 동일한 데이터 깊이를 출시 전제조건으로 삼지 않는다.

---

# 26. v5.3 서비스 제공 가능성 감사

## 26.1 결론

**조건부 가능하다.** 현재 foundation에는 v5.3 제품을 만들 수 있는 대부분의 핵심 소유자가 이미 있다. 따라서 `Intelligence Feed`, `Event Room`, `My Earth`를 위해 두 번째 Event Store, 두 번째 Intelligence Orchestrator, 두 번째 News pipeline, 두 번째 Scenario Engine을 만들지 않는다.

### 이미 존재하여 재사용할 핵심 owner

| Capability | Existing owner / basis | v5.3 action |
|---|---|---|
| 뉴스 수집·클러스터 | NEWS-002, NEWS-003, PRV-012 | HARDEN / source trust / untrusted-content isolation |
| 뉴스→Earth Event 연결 | NEWS-001 | REUSE / evidence link 강화 |
| Earth Pulse 사건 우선화 | PUL-001, PUL-002 | REUSE / event-feed recipe 추가 |
| Canonical Event / lineage | BCK-011, BCK-012 | REUSE / revision·scenario link 강화 |
| Event reasoning | HAZ-002, INT-001~008 | REUSE / cause-claim gate 추가 |
| Analog / history | INT-003, STO-005, STO-009, STO-010 | REUSE / Event Capsule productization |
| Paid panel | PAY-002 | PROMOTE as Event Room payload owner |
| Compare | PAY-006 | REUSE |
| Scenario | PAY-007 | REUSE; domain solver 검증 없으면 simulation unavailable |
| Report/API | PAY-008 | HARDEN / deploy parity / rights gate |
| Watch/notification | HF-017, NTF-001~005 | REUSE / meaningful-revision trigger |
| Subscription | PAY-001, PAY-003, PAY-004, PAY-011 | REUSE / 3-tier capability map |
| Source rights | OPS-016, PAY-010 | REUSE / paidAnalysis/export/API/AIUse 분리 |
| Privacy/security | SEC-001~004, BCK-015 | HARDEN |
| Materialized/caching | Materialized Earth, BCK-017, PAY-012 | REUSE / public-private cache separation |
| 3D semantics | VIS-001~014, Truth Lens | REUSE / observed-vs-simulation visual separation |

## 26.2 현재 그대로는 부족한 영역

다음은 v5.3 출시 전에 닫아야 하는 실제 gap이다.

1. **Event-centered Data Depth**: 중요한 사건이 발생했을 때 관련 provider·과거자료·모델런·위성·지형을 자동으로 모으는 manifest가 없다.
2. **Causal Claim Gate**: correlation / contributing factor / strong evidence / confirmed cause를 제품 언어로 분리하는 공통 gate가 부족하다.
3. **Untrusted News Content Security**: 기사 본문·RSS·HTML은 LLM 지시문이 아니라 untrusted data로 격리해야 한다.
4. **Cryosphere Event Pack**: 빙하·빙하호·적설·해빙·고산 지형 사고 분석용 데이터/알고리즘은 현재 catalog에서 충분히 독립적으로 닫혀 있지 않다.
5. **Subseasonal / Regime Pack**: 한파·폭염 장기 지속을 설명하려면 AO/NAO/PNA/MJO/ENSO, blocking, stratosphere/polar-vortex 관련 verified inputs와 history가 필요하다.
6. **Research/Report production parity**: report 기능은 foundation이 있으나 운영 drift를 닫아야 한다.
7. **Real-device Watch delivery**: backend tick만 아니라 실제 iPhone/Android delivery receipt evidence가 필요하다.
8. **Scenario Domain Validation**: 공통 Scenario Engine은 있어도 각 재난의 물리 solver가 검증되지 않았다면 3D Scenario를 과학적 예측으로 보여주면 안 된다.

---

# 27. 최종 3단계 구독 체계

v5.3에서 사용자에게 보여주는 요금제는 세 단계만 유지한다.

| Tier | Product promise | 핵심 사용자 |
|---|---|---|
| **FREE** | SEE WHAT IS HAPPENING | 모든 사용자 |
| **EXPLORER PRO** | UNDERSTAND WHAT IS HAPPENING | 지구·기상·해양·재난·지도·다이빙·과학 덕후, 헤비유저 |
| **INTELLIGENCE PRO** | INVESTIGATE WHAT IS HAPPENING | 최상위 덕후, 분석가, 언론/콘텐츠, 교수·학생·전문가·기관 개인 사용자 |

Research Lab은 독립 소비자 Tier에서 제거한다. 팀·대학·기관 요구는 향후 `INTELLIGENCE PRO + TEAM/INSTITUTION ADD-ON` capability로 처리한다. 코드에서는 plan 이름에 직접 분기하지 않고 existing entitlement/capability owner를 통해 판단한다.

## 27.1 FREE

무료는 Earthus를 체험판으로 만들지 않는다.

- Living Earth
- 현재 Weather / Ocean / Air / Human / Hazard 기본 상태
- 공식 경보·대피·폐쇄·안전정보
- 주요 Earth Event 발견
- Event Room의 NOW / official facts / source preview
- 기본 3D 위치·지형·사건 표시
- 제한 없는 사실 근거 확인

공식 안전정보와 표시된 과학적 근거는 paywall 뒤에 두지 않는다.

## 27.2 EXPLORER PRO

Explorer Pro의 주력 구매 이유는 **Full Intelligence Feed + Full Event Room + My Earth**다.

- Daily / live Earth Intelligence Feed
- Full Event Room: NOW / WHY / NEXT / PAST / COMPARE / FOR ME / EVIDENCE
- Event Follow / Watch / meaningful revision alerts
- Event Replay / 3D historical reconstruction
- Analog Event
- Postmortem / forecast-vs-outcome review
- MY EARTH: saved places, followed events, collections, trips, dives, brief
- Expert Weather / Ocean / Geo / Climate lenses where data depth passes
- Deep Ocean / Trench / Dive experience and personal log features
- Event-centered historical archive
- Daily Brief / Weekly Deep Dive

Explorer Pro는 `C3 SHARED_DEEP`를 주로 사용하고 entitlement가 허용하는 범위에서 작은 `C4 PRIVATE PROJECTION`을 사용한다. 고비용 C5는 preview 또는 제한 quota만 허용한다.

## 27.3 INTELLIGENCE PRO

Intelligence Pro는 연구자라는 신분이 아니라 **깊게 파고들고 싶은 사용자**에게 판매한다.

- Explorer Pro 전체
- Full Evidence Graph
- Full Model / Revision Compare
- Deep Historical Archive
- Custom region / time window
- Analog library / Event Genome
- Scenario Lab
- Counterfactual branches
- Advanced 3D simulation where validated solver exists
- Custom Intelligence Brief
- Professional Event Report
- PDF/CSV/allowed derived export
- API quota where source rights allow
- Priority compute / larger C5 quota

`UNLIMITED SCENARIO`는 판매하지 않는다. C5는 비용과 provider quota를 계측하고 quota를 사용한다.

---

# 28. EARTH INTELLIGENCE FEED

## 28.1 목적

Feed는 뉴스피드가 아니다. **오늘 지구에서 이해할 가치가 있는 변화와 사건을 Earth Event로 보여주는 재방문 표면**이다.

대표 카테고리:

- Weather / Typhoon / Extreme Cold / Heat
- Flood / Drought / Landslide
- Earthquake / Tsunami / Volcano
- Wildfire / Smoke / Air Quality
- Ocean / Marine Heat / Current / Wave
- Cryosphere / Glacier / Snow / Ice
- Environment / Pollution
- Human / Crowd / Travel disruption
- Exceptional Earth change detected from satellite

## 28.2 Feed item 최소 구조

```text
EVENT TITLE
WHERE
WHEN
STATUS
WHAT CHANGED
WHY IT MATTERS
TRUTH CLASS
CONFIDENCE / UNCERTAINTY SUMMARY
PRIMARY SOURCE
LAST REVISION
OPEN EVENT ROOM
FOLLOW
```

Feed card는 headline clickbait를 최적화하지 않는다. `importanceReason[]`를 저장하여 왜 노출되는지 설명 가능해야 한다.

## 28.3 사건 선정

News alone은 사건을 만들지 않는다.

```text
NEWS / OFFICIAL / OBSERVATION / SATELLITE / MODEL SIGNAL
                      ↓
                 CANDIDATE EVENT
                      ↓
             IDENTITY / DEDUPE / GEO LINK
                      ↓
              EVIDENCE AVAILABILITY
                      ↓
               IMPACT / SAFETY GATE
                      ↓
                 PUBLISH DECISION
```

사건 우선순위는 적어도 다음을 고려한다.

- official safety severity
- population / infrastructure exposure
- geographic scale
- rate of change
- novelty / revision magnitude
- data depth available
- user follow interest
- uncertainty / conflict

공식 안전 이벤트는 engagement score 때문에 억제되지 않는다.

---

# 29. EVENT ROOM — v5.3 핵심 유료 화면

모든 중요한 Earth Event는 하나의 Event Room contract를 따른다.

## 29.1 탭

| Tab | 질문 | 기본 데이터 |
|---|---|---|
| NOW | 지금 무슨 일이 일어나고 있나 | observation / official / latest state |
| WHY | 왜 발생했나 / 원인 후보는 무엇인가 | evidence graph / hypothesis / cause class |
| NEXT | 다음에 무엇이 일어날 가능성이 있나 | official forecast / model signal / analysis |
| PAST | 과거에는 어떻게 변해왔나 | historical archive / Earth Diff |
| COMPARE | 무엇과 비교해야 이해되는가 | prior event / place / time / model / revision |
| WHAT IF | 조건이 달라지면 무엇이 달라지나 | isolated scenario / counterfactual |
| FOR ME | 내 관심 지역·여행·일정에는 어떤 의미인가 | private projection |
| EVIDENCE | 근거·출처·해상도·시간·불확실성 | provenance / quality / rights |
| REPORT | 사건 전체를 저장·공유·내보내기 | evidence-linked report |

## 29.2 Event Intelligence Packet

```json
{
  "eventId": "evt_...",
  "revisionId": "rev_...",
  "eventType": "...",
  "status": "ACTIVE|WATCH|RESOLVED|POSTMORTEM",
  "where": {},
  "time": {},
  "officialFacts": [],
  "observations": [],
  "changes": [],
  "hypotheses": [],
  "causalClaims": [],
  "forecast": [],
  "analogs": [],
  "scenarios": [],
  "exposure": [],
  "personalProjection": null,
  "evidenceRefs": [],
  "dataDepth": {},
  "sceneRecipe": {},
  "sceneProjection": {"status":"READY|DEGRADED|INSUFFICIENT_DATA","sceneIntent":"EVENT_FOCUS","primary":{},"context":[],"fallback3D":["MEDIUM_3D","LOW_3D","STATIC_3D","OFF"]},
  "llmSceneActionsAllowed": [],
  "watchRevisionKey": "..."
}
```

LLM은 이 Packet을 설명하고, Packet에 포함된 `sceneProjection`과 승인된 Scene Tool을 통해 동일한 3D Earth를 탐색하게 한다. 원시 기사나 인터넷 문장을 근거 없이 재구성하여 원인·수치·확률·geometry를 생성하지 않는다.

---

# 30. 인과 분석 — 기사 요약과 Earth Intelligence의 경계

예를 들어 고산지역 사고가 발생하고 기사에서 "빙하가 녹아 발생"이라고 표현하더라도 Earthus는 이를 자동으로 확정 원인으로 기록하지 않는다.

## 30.1 Cause Class

모든 인과 문장은 다음 중 하나를 가져야 한다.

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

`INT-002 Cross-Domain Correlation` 결과는 자동으로 `CONFIRMED_CAUSE`가 될 수 없다.

## 30.2 인과 승격 조건

인과 강도를 올리려면 최소한 다음을 검토한다.

- official investigation / authoritative scientific statement
- temporal ordering
- spatial consistency
- mechanism plausibility
- independent source agreement
- alternative explanations
- sensor/model quality
- missing evidence

`WHY` 화면은 "원인" 대신 필요 시 "현재 근거가 지지하는 요인"으로 표현한다.

## 30.3 사고 후 정정

공식 조사 결과가 바뀌면 Event Revision을 새로 만들고 이전 설명을 덮어쓰지 않는다.

```text
REVISION 1: HYPOTHESIS
REVISION 2: STRONG_EVIDENCE
REVISION 3: OFFICIAL FINDING
```

Correction/Retraction은 Event Lineage와 Audit Ledger에 남긴다.

---

# 31. 장기 예측 / 한파·폭염 지속 분석

"왜 한파가 한 달 이상 지속될 것인가?"와 같은 질문은 deterministic 30-day weather forecast로 답하지 않는다.

## 31.1 필요한 계층

```text
CURRENT OBSERVATION
→ MEDIUM-RANGE ENSEMBLE
→ SUBSEASONAL SIGNAL
→ REGIME / TELECONNECTION CONTEXT
→ HISTORICAL ANALOG
→ MODEL AGREEMENT / DISAGREEMENT
→ CALIBRATED CONFIDENCE
```

## 31.2 v5.3 신규 데이터-depth gap

다음 provider/variable은 실제 권리·해상도·historical availability를 감사한 뒤 활성화한다.

- AO / NAO / PNA
- MJO
- ENSO / IOD context where relevant
- blocking index / geopotential pattern
- polar vortex / stratospheric state
- snow cover / sea ice
- 500 hPa / 850 hPa fields
- ensemble persistence and run revision

특정 index가 없으면 해당 원인 설명을 생략한다. "한 달 지속"이라는 단일 확정 문구 대신 기간별 confidence degradation을 보여준다.

## 31.3 사건 종료 후 Postmortem

```text
WHAT WE EXPECTED
→ WHAT ACTUALLY HAPPENED
→ WHICH MODELS / SIGNALS WERE USEFUL
→ WHAT FAILED
→ WHY THE EVENT PERSISTED / ENDED
→ CALIBRATION UPDATE
```

Postmortem은 Event Capsule에 저장되어 다음 analog 분석의 자산이 된다.

---

# 32. Cryosphere / Glacier Event Recipe

빙하·빙하호·적설·해빙과 연관된 산악 사고를 Earthus가 분석하려면 v5.2의 Weather / Terrain / Hydro / Satellite만 묶는 것으로 충분하지 않은 경우가 있다.

v5.3에서는 먼저 **새 Engine 생성이 아니라 existing owner gap audit**을 수행한다.

필요 capability 후보:

- glacier extent / retreat history
- glacier-lake extent change
- snow/ice cover history
- surface temperature anomaly
- precipitation / snow accumulation
- DEM / slope / valley geometry
- river / drainage network
- satellite before/after imagery
- known event / scientific report archive

## 32.1 3D 표현

Observed geometry와 Scenario geometry를 분리한다.

- 실제 DEM: Reality
- 위성 관측 변화: Observed/Derived
- 추정 유출 경로: Estimated/Simulation
- 검증된 hydrodynamic solver 결과: Simulation with model/version

검증된 solver 없이 "홍수가 이 경로로 확정 이동한다"고 표시하지 않는다.

---

# 33. Event-Centered Data Depth

v5.3은 전 지구 모든 데이터를 균일하게 깊게 만드는 전략을 사용하지 않는다.

**중요 사건 주변을 빠르게 깊게 만든다.**

```text
EVENT
→ REGION BOUNDS
→ RELEVANT TIME WINDOW
→ DOMAIN RECIPE
→ VERIFIED PROVIDERS
→ HISTORICAL QUERY
→ MODEL RUNS
→ SATELLITE / TERRAIN
→ EVIDENCE BUNDLE
→ MATERIALIZED EVENT CAPSULE
```

## 33.1 Data Depth Passport

모든 Event Room / Expert Layer는 사용자에게 데이터 깊이를 숨기지 않는다.

```text
CURRENT        AVAILABLE
FORECAST       AVAILABLE / LIMITED / UNAVAILABLE
HISTORY        1982-2026 / 7D / LIMITED
SPATIAL        0.25deg / station / aggregate / polygon
TEMPORAL       hourly / daily / monthly
TRUTH          OBSERVED / MODEL / DERIVED
EXPORT         ALLOWED / BLOCKED
SOURCE RIGHTS  DISPLAY / ANALYSIS / EXPORT
QUALITY        LIVE / DEGRADED / STALE / UNAVAILABLE
```

## 33.2 Depth floor

Explorer Pro의 `WHY/NEXT`는 관련 핵심 신호가 최소 기준을 충족하지 못하면 deep analysis를 잠그는 대신 `INSUFFICIENT_DATA`를 보여준다.

Intelligence Pro의 Scenario 버튼은 validated domain model이 없으면 `SCENARIO_UNAVAILABLE`로 표시한다.

---

# 34. MY EARTH — 반복 구독의 홈

MY EARTH는 단순 저장 목록이 아니라 **사용자의 개인 Earth Intelligence inbox**다.

## 34.1 구성

- TODAY BRIEF
- FOLLOWING EVENTS
- SAVED PLACES
- WATCHES
- ALERTS
- COLLECTIONS
- TRIPS
- DIVES
- RECENT EVENT ROOMS
- WEEKLY DEEP DIVE
- POSTMORTEMS READY

## 34.2 Watch가 알려야 하는 것

raw update가 아니라 의미 있는 revision만 알린다.

예:

- 공식 경로 수정
- 모델 spread 급증/감소
- confidence class 변화
- 새로운 official finding
- observed intensity threshold crossing
- watch region에 영향 시작/해제
- Event Room에 Postmortem 공개

동일 상태 반복 push를 금지한다.

---

# 35. Daily / Weekly / Postmortem Content System

반복구독을 위해 자동화 가능한 콘텐츠 cadence를 제품 contract로 만든다.

## Daily Earth Brief

"오늘 지구에서 이해해야 할 변화" 3~7개를 개인 관심분야와 안전우선으로 구성한다.

## Active Event Updates

활성 Event는 revision이 생겼을 때만 업데이트한다.

## Weekly Deep Dive

한 사건 또는 하나의 planetary pattern을 긴 형식으로 설명한다.

## Postmortem

사건 종료 후 forecast-vs-outcome, 원인 evidence, model skill, impact를 정리한다.

## Monthly Earth Patterns

한 달 동안 반복된 regime / anomaly / event family를 분석한다. 통계적 근거가 없으면 단순 뉴스 빈도를 "지구가 변했다"는 주장으로 바꾸지 않는다.

---

# 36. 3D Event Simulation 계약

3D는 v5.3의 강력한 차별점이지만 가장 쉽게 과장될 수 있는 영역이다.

## 36.1 3D 상태 분리

```text
REALITY / OBSERVED
DERIVED
OFFICIAL_FORECAST
MODEL_SIGNAL
SIMULATION_ONLY
COUNTERFACTUAL
UNCERTAINTY
```

각 상태는 material/line/badge semantics가 다르다.

## 36.2 Scenario Layer

Scenario는 LIVE state를 mutate하지 않는다.

```text
LIVE EVENT SNAPSHOT
        ↓ clone immutable baseline
SCENARIO INPUT
        ↓
DOMAIN MODEL
        ↓
SCENARIO OUTPUT
        ↓
SEPARATE 3D SCENE BRANCH / OVERLAY
```

사용자가 Scenario를 닫으면 canonical Earth는 그대로여야 한다. Scenario 결과도 가능한 경우 3D field/flow/volume/surface/subsurface로 표현하며, 2D animation이 physics simulation을 대신하지 않는다.

## 36.3 Solver validation

`PAY-007 Scenario Engine`은 orchestration/entitlement owner다. 실제 물리 계산은 domain owner가 책임진다.

- validated domain engine exists → simulation enabled
- simplified proxy only → `SIMULATION_ONLY / LOW_FIDELITY`
- no validated engine → unavailable

---

# 37. v5.3 보안 강화 — NEWS / LLM / EVENT / PREMIUM

기존 SEC-001~004, BCK-015, OPS-016, PAY-010을 재사용하면서 다음 보안 규칙을 추가한다.

## 37.1 News / Web ingestion은 Untrusted Data

기사·RSS·HTML·외부 설명문은 절대로 instruction으로 취급하지 않는다.

필수:

- allowlisted News Source Registry
- server-side fetch only
- URL canonicalization
- SSRF protection: private/loopback/link-local address deny
- redirect count / destination revalidation
- MIME allowlist
- payload size/time budget
- script/style/active content 제거
- HTML sanitize
- canonical article hash / receipt
- source timestamp / fetchedAt
- duplicate cluster
- external text에 `UNTRUSTED_CONTENT` metadata

## 37.2 Prompt Injection 방어

외부 기사에 "이전 지시를 무시하라" 같은 문장이 있어도 LLM 권한에 영향을 주지 않는다.

- LLM system policy는 외부 텍스트보다 항상 상위
- raw article은 quote/data container로만 전달
- external content가 tool 권한을 요청할 수 없음
- provider credential / secret / internal URL은 모델 context에 전달하지 않음
- tool execution authority는 FND-017 / approved orchestrator만 보유
- LLM 출력은 Claim Validator와 Evidence Gate 통과 후 표시

## 37.3 Source poisoning / misinformation

- source tier / authority class 저장
- 한 기사만으로 재난 원인 확정 금지
- official source conflict는 conflict state로 표시
- synthetic/AI-generated article을 primary evidence로 사용하지 않음
- source correction/deletion을 revision으로 추적

## 37.4 Account / Subscription

- entitlement는 server-side final authority
- client CSS/route hidden state는 보안 아님
- payment callback idempotency
- replayed billing event 방지
- grace/renew/refund state machine
- C5 quota를 server에서 검증

## 37.5 Personalization privacy

- exact location은 명시적 consent가 있을 때만 사용
- 위치·route·trip context 최소화
- precise movement history 기본 미수집
- user context fingerprint는 원문 위치정보를 복원할 수 없게 설계
- delete/export 제공
- private projection은 public cache 금지

## 37.6 Premium cache isolation

cache key에는 최소:

```text
feature
canonical event revision
engine/model versions
entitlement class
user/tenant scope when private
context fingerprint
truth version
```

private result가 다른 사용자에게 재사용되면 P0 security failure다.

## 37.7 Report / Export security

- 모든 section evidence linked
- source operation rights 확인
- restricted raw source leakage 금지
- private location / account identifiers 기본 redaction
- signed export URL + expiry
- audit trail

## 37.8 Admin / Editorial security

Event featured/publish/correction/retraction 권한은 최소권한 역할로 분리한다.

- Source Operator
- Event Analyst
- Scientific Reviewer
- Safety Reviewer
- Publisher
- Security/Privacy Operator

고위험 사건의 causal deep analysis와 3D Scenario는 최소 scientific/safety review gate를 지원해야 한다.

---

# 38. Event Editorial / Automation Boundary

완전 자동 뉴스 생성 서비스로 만들지 않는다.

## Auto-publish 허용 후보

- official warning ingest
- source-backed observation update
- canonical event revision summary
- simple factual NOW card

## Review-required 후보

- 사망/대형 재난의 원인 단정
- 장기 기후 원인 설명
- controversial causality
- 고위험 scenario/impact map
- legal/health attribution
- headline이 시장·안전을 크게 움직일 수 있는 분석

Review 여부 자체도 Event revision metadata에 기록한다.

---

# 39. 5.3 출시용 Domain Vertical 우선순위

모든 것을 한 번에 깊게 만들지 않는다.

## P0 Flagship

### Weather / Typhoon
- observed / radar / satellite
- multi-model / ensemble
- revisions
- SST / atmospheric context
- WHY/NEXT
- watch/postmortem

### Ocean / Deep Ocean
- SST / wave / swell / current / tide
- bathymetry / trench
- marine observations
- dive experience

### Earthquake / Tsunami / Geo
- hypocenter depth
- plate/fault context where verified
- official tsunami
- historical analog / 3D cross-section

### Cryosphere / Mountain Hazard pilot
- glacier/snow/ice change
- terrain/slope/hydro
- satellite before/after
- evidence-limited causal analysis

## P1

- Wildfire / smoke / air
- Flood / drought / hydro
- Human / travel disruption
- Forest / canopy / ecosystem change

---

# 40. v5.3 구현 순서

1. Current worktree / v5.2 catalog audit
2. No-duplicate proof for all v5.3 capabilities
3. 3-tier entitlement mapping
4. News source / ingestion security hardening
5. Canonical Event + Event Room contract
6. Causal Claim Gate
7. Event Data Depth Passport
8. Intelligence Feed
9. MY EARTH / Watch / actual-device notification evidence
10. Weather/Typhoon flagship Event Room
11. Earthquake/Tsunami flagship Event Room
12. Ocean/Deep Ocean + Dive integration
13. Cryosphere pilot
14. Event Capsule / Replay / Postmortem
15. Explorer Pro purchase/renew/refund acceptance
16. Scenario separation + validated domain simulation
17. Intelligence Pro evidence/model/scenario/report surface
18. Report/export rights and cache isolation
19. security/fault/performance/device acceptance
20. staged paid launch

새 Engine ID는 각 단계에서 existing owner가 계약으로 수용할 수 없다는 gap evidence가 있을 때만 발급한다.

---

# 41. v5.3 Paid Launch Gate

## 41.1 FREE launch gate

- Living Earth stable
- official safety always free
- basic Feed NOW facts source-backed
- no false precision

## 41.2 EXPLORER PRO launch gate

다음이 닫히기 전에는 정식 월구독 판매를 열지 않는다.

- Full Intelligence Feed
- Event Room NOW/WHY/NEXT/PAST/COMPARE/EVIDENCE
- 최소 3개 flagship vertical의 real provider depth
- MY EARTH
- Watch + actual device delivery evidence
- Event revision / correction
- Event Replay 또는 Postmortem
- subscription state / restore / refund path
- source rights for paid analysis
- mobile performance / thermal acceptance
- untrusted-content / prompt-injection security tests

## 41.3 INTELLIGENCE PRO launch gate

- Explorer Pro gate 전부
- Full Evidence Graph
- Model/Revision Compare
- Deep History for supported verticals
- Scenario isolation proven
- 최소 1개 이상의 validated domain simulation 또는 해당 기능을 명확히 unavailable 처리
- report/export production parity
- C5 quota / cost accounting
- private cache isolation
- custom analysis audit trail

Research/Team 기능은 이 gate와 별도로 add-on으로 단계적으로 열 수 있다.

---

# 42. v5.3 Acceptance Matrix

| Area | PASS condition |
|---|---|
| News Trigger | article alone never becomes scientific truth |
| Event Identity | duplicates merge without losing source lineage |
| Cause | correlation never silently promoted to confirmed cause |
| Forecast | official/model/analysis horizons remain distinct |
| Long-range | uncertainty visibly increases with horizon |
| Scenario | never mutates LIVE state |
| 3D | visual truth class matches data truth class; mapped.earth minimum bar; no photo/shell fallback |
| Evidence | every deep claim has evidence refs or is suppressed |
| Data Depth | history/resolution/rights are visible |
| Watch | meaningful revision only; dedupe/cooldown |
| Postmortem | prior forecast snapshot preserved and compared to outcome |
| Subscription | FREE / EXPLORER_PRO / INTELLIGENCE_PRO capability is server enforced |
| Safety | official alerts never paywalled |
| Privacy | personal context minimized and deletable |
| Cache | no private cross-user leakage |
| Export | rights gate blocks restricted raw data |
| News security | SSRF/XSS/prompt injection payloads fail safely |
| Device | iPhone/Android/desktop real evidence |
| Performance | heavy Event Room/Scenario cannot make base Earth unusable; degrade only HIGH_3D→MEDIUM_3D→LOW_3D→STATIC_3D→OFF |
| Correction | retraction/revision remains auditable |

---


# 42A. PHYSICAL 3D + INTELLIGENCE + LLM FINAL ACCEPTANCE GATE

v5.3 CORRECTED는 다음이 모두 PASS여야 완료다.

1. GLOBAL 첫 화면이 mapped.earth 수준 미만의 flat/photo/pseudo-3D가 아니다.
2. GLOBAL→LOCAL zoom에서 2D→3D 전환이 발생하지 않고 3D LOD만 증가한다.
3. LAND는 verified terrain geometry, OCEAN은 0m surface, BATHYMETRY는 negative geometry로 공간 분리된다.
4. CLOUD는 3D volume/voxel/CTH mesh/STATIC_3D/OFF만 사용하고 production satellite-shell final fallback이 없다.
5. FOREST/CANOPY/POPULATION/HUMAN FLOW 등 사용자가 지정한 reference intent가 canonical visual contracts에 연결되어 있다.
6. Weather/Typhoon, Ocean, Geo/Hazard, Cryosphere flagship Event의 Intelligence Packet이 `sceneProjection`을 생성한다.
7. `NOW/WHY/NEXT/PAST/COMPARE/WHAT IF/EVIDENCE`가 텍스트 패널만이 아니라 동일 3D Earth에서 spatial state로 재현 가능하다.
8. LLM 질문이 승인된 SceneIntent를 통해 3D focus/time/truth/compare/scenario view를 조작할 수 있다.
9. LLM은 과학 수치/원인/geometry를 만들지 않는다. Engine/Intelligence result만 scene으로 투영한다.
10. sourceDimension보다 높은 renderDimension은 derivation/model/uncertainty가 없으면 차단된다.
11. device degradation은 HIGH_3D→MEDIUM_3D→LOW_3D→STATIC_3D→OFF만 허용한다.
12. browser/device golden evidence에서 위 규칙 위반이 0이어야 한다.

**하나라도 실패하면 `PHYSICAL_3D_INTELLIGENCE_ACCEPTANCE = FAIL`이다.**

---

# 43. v5.3 최종 제품 문장

v5.2가 **Living Earth + Planetary Intelligence를 계산·재사용하는 방법**을 완성했다면, v5.3은 그 지능을 매일 사용할 이유가 있는 상품으로 만든다.

```text
FREE
SEE THE EARTH

EXPLORER PRO
UNDERSTAND THE EARTH

INTELLIGENCE PRO
INVESTIGATE THE EARTH
```

그리고 Earthus의 반복구독 루프는 다음으로 고정한다.

```text
EVENT DETECTED
→ VERIFY
→ SHOW ON EARTH
→ WHY
→ NEXT
→ FOLLOW
→ REVISION
→ COMPARE
→ POSTMORTEM
→ MEMORY
→ NEXT EVENT
```

**EARTHUS는 뉴스를 모으는 앱이 아니다. 지구에서 벌어지는 사건을 실제 데이터와 근거, 불확실성, 시간, 3D 공간으로 이해하게 하고 그 사건이 변할 때마다 다시 돌아오게 만드는 Earth Intelligence Service다.**


---

# APPENDIX — CORRECTION SUMMARY

본 수정은 기능 추가보다 **정본 오류 제거**가 목적이다.

- 기존 v5.3의 cloud shell / cloud texture / Earth skin fallback을 제거했다.
- mapped.earth를 최소 GLOBAL visual bar로 승격했다.
- GLOBAL부터 모든 physical world가 3D이며 zoom은 detail 증가만 허용한다.
- Intelligence output에 `sceneProjection`을 추가했다.
- LLM을 explanation-only에서 **evidence-bound explanation + approved 3D scene interaction interface**로 보강했다.
- 사용자가 제공한 Manhattan/SF population bars, Türkiye population, Italy/Türkiye forest, canopy height, India focus, tsunami history, nuclear/radiation, Mariana, Dive Replay, Taiwan/Portugal relief, Intelligence platform reference, Myeongdong LIVE CROWD reference를 canonical registry로 복구했다.
- 사진/위성/raster는 source/material input이며 physical world final renderer가 아니라는 규칙을 고정했다.
- historical directives의 상충 규칙은 삭제하지 않고 `SUPERSEDED`로 분류했고, 실제 runtime의 SHELL/STATIC/Underwater status migration blocker까지 명시했다.
