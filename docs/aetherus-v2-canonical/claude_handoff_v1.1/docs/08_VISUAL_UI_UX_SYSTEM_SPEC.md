# AETHERUS V2 — VISUAL / UI / UX SYSTEM SPEC


## 문서의 출처와 권위

이 패키지는 다음 세 첨부 문서를 우선 기반으로 재구성한다.

1. `Aetherus_Orbital_Environment_개발지침서_v1.1_초상세본.docx` — 기존 Orbital Environment/SSA/STM/Debris 엔진, DB/API/테스트/Hard Gate의 1차 source.
2. `Aetherus_우주물체_개입효과_특허명세서_마스터_v2.0.docx` — Baseline/Counterfactual Risk Graph, Beneficiary Attribution, PROTECT, Affected Subgraph, Risk Provenance, Candidate OCM, validation gate의 권리/기술 source.
3. `EARTHUS_AETHERUS_INTELLIGENCE_CONCEPT_MASTER_v1.0_KO.docx` — Engine/AI/Intelligence/LLM 계층 분리, Evidence/Event/Revision/Confidence/Uncertainty/Counterfactual/Attribution의 source.

이 문서에서 **[SOURCE-DERIVED]**는 위 자료의 구조를 유지·통합한 항목이고, **[V2-NEW]**는 사용자가 이번 대화에서 확정한 Aetherus V2 범위(태양계, 발사관제, 우주쓰레기, 멀티스케일 UX, 구독, LLM)와 이를 구현하기 위한 신규 설계다. **[VALIDATE]**는 실제 provider/API/라이선스/FTO/운영환경 확인 후 확정해야 한다.

기존 문서의 `Codex` 표기는 레거시 실행대상이다. **Aetherus V2의 기본 구현·인수인계 대상은 Claude Code**이며, 기존 Codex 지시는 동일한 안전원칙을 유지하되 Claude Code 실행 계약으로 대체한다.


## 절대 원칙 — Claude Code가 임의 변경하면 안 되는 것

1. **Aetherus V2는 하나의 우주, 세 모드다.** `SPACE`, `CONTROL`, `ORBIT`은 서로 다른 사이트가 아니라 동일한 Persistent Universe State를 공유하는 관찰 모드다.
2. **Engine → Intelligence → LLM 계층을 뒤집지 않는다.** 물리/수학 계산은 Engine, 패턴 탐지는 AI Signal, 종합 판단은 Intelligence, 자연어 설명/명령 인터페이스는 LLM이다.
3. **LLM은 과학 계산값을 만들어내지 않는다.** 궤도, TCA, Pc, re-entry time, telemetry, Benefit, PROTECT 순위, Confidence를 임의 생성하지 않는다.
4. **현실과 가상은 저장부터 분리한다.** `OBSERVED`, `DERIVED`, `MODEL_SIGNAL`, `AI_SIGNAL`, `OFFICIAL`, `SIMULATION_ONLY`, `COUNTERFACTUAL`, `ATTRIBUTION_RESULT`를 혼합하지 않는다.
5. **TLE/GP-only 결과는 기본적으로 screening grade다.** covariance가 없으면 Pc를 생성하지 않는다. 값이 없으면 `UNAVAILABLE/INSUFFICIENT_DATA`가 정상 결과다.
6. **3D가 Digital Twin을 의미하지 않는다.** 현실 상태를 계산 가능한 Digital State로 만들고 Snapshot/Version/Time/Provenance로 재현 가능해야 한다.
7. **화면이 보인다고 DONE이 아니다.** 실데이터/fixture → 계산 → DB → API → UI → 테스트 → Evidence Manifest가 닫혀야 한다.
8. **운영 command 기능 금지.** 초기 V2는 advisory/research/visual control system이며 실제 spacecraft command, 자동 회피기동 승인, 제거 명령, 법적 판단을 수행하지 않는다.
9. **기존 working tree를 보존한다.** 사용자의 명시적 승인 없이 `git reset --hard`, `git clean`, `git restore .`, 대규모 덮어쓰기, 임의 stash를 하지 않는다.
10. **특허 핵심을 약화시키지 않는다.** Beneficiary Attribution, PROTECT, Affected Subgraph, Baseline/Counterfactual Risk Graph, Risk Provenance는 독립 축으로 유지한다.
11. **안전/공공정보를 결제벽으로 숨기지 않는다.** Free/paid 차이는 정보 깊이, 기록, 개인화, 시뮬레이션, API, 워크플로우에서 만든다.
12. **대량 UI 렌더 subset과 과학 계산 subset을 분리한다.** 프레임 성능을 위해 숨긴 객체가 과학 계산에서 자동 제외되면 실패다.

## 디자인 목표

- 미래형 관제 시스템이지만 정보가 많다는 이유로 모든 패널이 같은 우선순위를 갖지 않는다.
- 중앙 3D Universe/Earth를 제품의 주인공으로 유지.
- dark graphite/navy 기반, subtle emissive accents. 색상은 의미를 가져야 하며 장식용 위험색 남용 금지.
- 모드가 바뀌어도 Persistent Universe State를 유지.
- 모바일/태블릿/데스크톱/대형 wall display의 정보밀도를 별도 profile로 설계.

## Visual Semantics

권장 의미 매핑(최종 색/스타일은 design tokens에서 결정):

- Observed/Official: solid/confirmed treatment
- Derived: 계산 표식 + method disclosure
- Modelled: 점선/모델 badge
- AI Signal: 독립 AI_SIGNAL badge, 관측값과 합치지 않음
- Uncertainty: translucent envelope/range
- Simulation: simulation label
- Counterfactual: ghost/alternate world/path
- Screening: screening badge
- Validated: validation badge

## 화면 목록

1. Home / SPACE NOW
2. SPACE Solar System
3. Earth / Orbital Stack
4. CONTROL Center
5. Live Mission Focus
6. Mission Replay
7. ORBIT Shell Focus
8. Object Detail
9. Event Focus
10. Scenario Lab
11. MY AETHERUS
12. Control Room Builder
13. Archive / Time Machine
14. Compare Time
15. Research / Evidence Drawer
16. Operations Fleet Workspace

## Home / SPACE NOW

초기 진입에서 Earth, terminator, Moon relation, 약한 orbital shells, important event pulses만 보인다. UI는 최소화한다. `SPACE / CONTROL / ORBIT`와 Universal Time, 작은 `SPACE NOW` 카드가 핵심이다.

## Orbital Stack interaction

- Hover shell: 환경 summary
- Click shell: other shells dim, camera reframe
- Zoom in: cluster→object
- Select object: selected orbit + relevant neighbors
- Select event: unrelated objects dim; event geometry/uncertainty/time shown
- Escape/back: prior FocusState restore

## Event pulse 규칙

Pulse는 Importance를 의미하며 Risk와 동일하지 않다. density brightness, risk edge, importance pulse, uncertainty envelope를 분리한다.

## CONTROL reference 반영

사용자가 제공한 관제 이미지의 핵심 패턴(중앙 globe, 좌우 dense panels, live stream, mission timeline, orbital radar, weather/space-weather, launch calendar, control rooms)을 채택하되, Aetherus V2는 Adaptive Workspace와 Visual Semantics를 추가한다.

## Accessibility

- 색상만으로 상태 구분 금지.
- keyboard focus/navigation.
- data visualization legend text.
- reduced motion mode.
- screen reader용 semantic labels.
- high-contrast profile.
## E34 — Multi-Scale Space Scene Engine

**도메인:** `VISUAL`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** Earth/Orbital/Cislunar/Solar System scale을 사용자에게는 연속 우주처럼 보이게 하면서 내부적으로 좌표정밀도·LOD·렌더링 전략을 분리한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- digital states
- scene mode
- camera scale
- visual data contracts

**출력 계약**

- SceneState
- RenderableLayerSet

**선행 의존 엔진**

- E05
- E06
- E08
- E20

**저장 계약**

- scene config/version

**API / 인터페이스**

- frontend scene state

**Intelligence / 상위 연결**

- E35 camera
- E36 shell
- E37 semantics

**UI/UX 연결**

- Earth→LEO→MEO→GEO→Moon→Solar System

### Claude Code 구현 절차

```text

1. 기존 repository에서 E34와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e34.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E34-T01 | scale transition continuity | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E34-T02 | floating precision budget | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E34-T03 | layer source labels | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E34-T04 | device profile fallback | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e34.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 모든 scale을 하나의 naïve 물리 scale로 강제해 사용성/정밀도 훼손 금지

---

## E35 — Semantic Zoom / Camera Focus Engine

**도메인:** `VISUAL`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 카메라 거리와 사용자의 선택 의도에 따라 Universe/Planet/Shell/Object/Event Focus를 전환하고 정보 의미와 UI 밀도를 조정한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- camera pose
- focus target
- mode SPACE/CONTROL/ORBIT
- time context

**출력 계약**

- FocusState
- CameraTransition
- InformationLOD

**선행 의존 엔진**

- E34

**저장 계약**

- focus presets
- camera bookmarks optional

**API / 인터페이스**

- frontend state machine

**Intelligence / 상위 연결**

- P03 workspace
- L03 tool control

**UI/UX 연결**

- Persistent Universe State
- smooth focus transitions

### Claude Code 구현 절차

```text

1. 기존 repository에서 E35와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e35.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E35-T01 | focus persistence across modes | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E35-T02 | back navigation | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E35-T03 | object->event->object | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E35-T04 | NOW reset preserves expected focus | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e35.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 페이지 전환 때 우주 상태를 무조건 초기화하지 않음

---

## E36 — Orbital Shell & LOD Engine

**도메인:** `VISUAL`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** LEO/MEO/GEO를 반투명 Shell/Band와 데이터 밀도/이벤트 overlay로 표현하고 줌 수준에 따라 cluster→object→orbit를 점진 노출한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- shell metrics
- object states
- camera LOD
- event importance

**출력 계약**

- ShellRenderModel
- ObjectRenderSubset
- OrbitLineSubset

**선행 의존 엔진**

- E24
- E34

**저장 계약**

- LOD config/version

**API / 인터페이스**

- /v1/orbit/render-set optional

**Intelligence / 상위 연결**

- E44 importance
- E35 camera

**UI/UX 연결**

- LEO/MEO/GEO Orbital Stack

### Claude Code 구현 절차

```text

1. 기존 repository에서 E36와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e36.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E36-T01 | global view object cap | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E36-T02 | shell selection focus | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E36-T03 | viewport query | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E36-T04 | render subset != science subset | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e36.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 렌더링 성능 때문에 과학 계산 대상까지 임의 누락 금지

---

## E37 — Visual Semantics Engine

**도메인:** `VISUAL`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** OBSERVED/DERIVED/MODEL/AI_SIGNAL/UNCERTAINTY/SIMULATION/COUNTERFACTUAL/VALIDATED 상태를 일관된 시각 문법으로 표시한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- evidence class
- validation state
- confidence
- uncertainty
- scene mode

**출력 계약**

- VisualStyleToken
- LegendModel
- DisclosureLabel

**선행 의존 엔진**

- E03
- E40
- E43

**저장 계약**

- visual_semantics_version

**API / 인터페이스**

- design tokens/config

**Intelligence / 상위 연결**

- all UI

**UI/UX 연결**

- legend
- badges
- ghost path
- uncertainty envelope

### Claude Code 구현 절차

```text

1. 기존 repository에서 E37와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e37.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E37-T01 | all evidence classes mapped | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E37-T02 | screening vs validated distinct | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E37-T03 | uncertainty visible | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E37-T04 | contrast/accessibility | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e37.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 색 하나로 density/risk/importance를 모두 표현하지 않음

---

