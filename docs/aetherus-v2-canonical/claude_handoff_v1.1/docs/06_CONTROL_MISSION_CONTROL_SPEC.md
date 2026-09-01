# AETHERUS V2 — CONTROL / MISSION CONTROL SPEC


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

## CONTROL 철학

CONTROL은 같은 Earth/Time/Selection을 유지한 채 mission operations 정보가 펼쳐지는 Workspace다. 사용자가 제공한 레퍼런스처럼 중앙 3D Earth가 주인공이고 주변에 dense dashboard가 배치되지만, 항상 모든 패널을 동시에 강조하지 않는다. Mission State에 따라 Adaptive Workspace가 핵심 위젯을 자동 전면화한다.

## 기본 Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ AETHERUS     SPACE   CONTROL   ORBIT   MISSIONS   EVENTS   │
├───────────────┬───────────────────────────┬─────────────────┤
│ NEXT LAUNCHES │                           │ LIVE STREAM     │
│ FOLLOWING     │        3D EARTH           │ TIMELINE        │
│ EVENT QUEUE   │  launch/orbit/shells      │ WEATHER         │
│               │                           │ SPACE WEATHER   │
├───────────────┼───────────────────────────┼─────────────────┤
│ ORBITAL RADAR │ CALENDAR / PASSES / WATCH│ SYSTEM / ROOMS  │
├───────────────┴───────────────────────────┴─────────────────┤
│ PAST ---------------- NOW ---------------- FUTURE           │
└─────────────────────────────────────────────────────────────┘
```

## Adaptive Workspace 상태

### Pre-launch
- Next Launch/Countdown
- official source status
- launch site/weather
- mission timeline
- target orbit
- stream availability

### Ascent
- Live Telemetry 또는 MODELLED TRAJECTORY 명확 표시
- flight path, stage state, target orbit
- mission timeline
- live/official stream
- relevant space weather/weather context

### Orbit insertion / deployment
- payload/stage objects
- target vs achieved/known state (source grade 명시)
- mission-to-orbit handover status
- follow/save controls

### Post mission
- Mission Record
- Replay
- created objects / current locations
- GO TO ORBIT / WHERE IS IT NOW

## Control Rooms

- Launch Control
- Mission Operations
- Orbital Operations
- Debris Watch
- Space Weather Lab
- Observation Desk

Control Room은 UI template일 뿐 별도 truth store가 아니다. Widget은 동일 API/Intelligence Core를 소비한다.

## Telemetry 표시 원칙

`LIVE TELEMETRY`, `OFFICIAL EVENT UPDATE`, `MODELLED TRAJECTORY`, `RECONSTRUCTED`는 서로 다른 Visual Semantics를 사용한다. 데이터가 없으면 모델 궤적을 사용할 수 있지만 반드시 모델/가정/시각을 표시하고 Live처럼 보이지 않게 한다.

## Mission life-cycle 연결

```text
MISSION
  ↓
VEHICLE / STAGES / PAYLOADS
  ↓
LIFTOFF / ASCENT / INSERTION / DEPLOYMENT
  ↓
MISSION RECORD
  ↓
HANDOVER
  ├→ PAYLOAD → SATELLITE / SPACE OBJECT
  └→ UPPER STAGE → ROCKET BODY
                    ↓
                   ORBIT
                    ↓
           CONJUNCTION / REENTRY / DEBRIS
```
## E13 — Mission Registry Engine

**도메인:** `CONTROL`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 발사 임무를 Mission 단위로 등록하고 vehicle/payload/site/organization/target orbit/source를 표준화한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- official mission notices
- launch provider feeds
- manual verified admin input

**출력 계약**

- Mission
- MissionSourceLink
- PayloadManifest

**선행 의존 엔진**

- E01
- E02
- E03
- E07

**저장 계약**

- mission
- mission_payload
- launch_site

**API / 인터페이스**

- /v1/missions
- /v1/missions/{id}

**Intelligence / 상위 연결**

- E14 launch window
- E18 timeline
- E19 handover

**UI/UX 연결**

- CONTROL mission list
- Mission detail

### Claude Code 구현 절차

```text

1. 기존 repository에서 E13와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e13.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E13-T01 | duplicate mission merge policy | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E13-T02 | source precedence | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E13-T03 | payload provisional status | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E13-T04 | site coordinates | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e13.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- rumor를 confirmed mission으로 승격하지 않음

---

## E14 — Launch Schedule / Window Engine

**도메인:** `CONTROL`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 발사 예정시간과 window 변경을 Revision 가능한 상태로 관리하고 공식/예상/미정 상태를 구분한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- mission registry
- official schedule revisions
- window constraints

**출력 계약**

- LaunchWindow
- ScheduleRevision

**선행 의존 엔진**

- E13
- E04

**저장 계약**

- launch_window
- launch_schedule_revision

**API / 인터페이스**

- /v1/launches/upcoming
- /v1/missions/{id}/window

**Intelligence / 상위 연결**

- E15 countdown
- E42 revision
- E44 importance

**UI/UX 연결**

- Next Launches
- Countdown
- Launch Calendar

### Claude Code 구현 절차

```text

1. 기존 repository에서 E14와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e14.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E14-T01 | window revision history | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E14-T02 | TBD vs confirmed | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E14-T03 | timezone conversion | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E14-T04 | countdown only with resolved window | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e14.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 불확실한 시간에 정밀 countdown 생성 금지

---

## E15 — Launch State Machine & Countdown Engine

**도메인:** `CONTROL`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** PLANNED→COUNTDOWN→LIFTOFF→ASCENT→SEPARATION→ORBIT_INSERTION→COMPLETE 등 mission operational state를 명시적으로 관리한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- mission
- launch window
- official event updates
- telemetry events

**출력 계약**

- MissionOperationalState
- CountdownState
- StateTransitionLog

**선행 의존 엔진**

- E13
- E14

**저장 계약**

- mission_state
- mission_transition

**API / 인터페이스**

- /v1/missions/{id}/state

**Intelligence / 상위 연결**

- E18 timeline
- E38 orchestrator
- E41 mission events

**UI/UX 연결**

- Adaptive Control Center
- status badge

### Claude Code 구현 절차

```text

1. 기존 repository에서 E15와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e15.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E15-T01 | invalid transition reject | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E15-T02 | countdown pause/hold | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E15-T03 | scrub reset | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E15-T04 | official event transition evidence | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e15.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 모델 trajectory만으로 실제 liftoff를 확정하지 않음

---

## E16 — Telemetry Fusion Engine

**도메인:** `CONTROL`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 실제 공개/허가 telemetry, 공식 event updates, 모델 궤적을 서로 다른 EvidenceClass로 병렬 처리하고 가장 신뢰 가능한 현재 mission state를 구성한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- live telemetry optional
- official event feed
- modelled trajectory
- vehicle metadata

**출력 계약**

- TelemetrySample
- TelemetryState
- TelemetrySourceGrade

**선행 의존 엔진**

- E03
- E04
- E13

**저장 계약**

- telemetry_sample
- telemetry_session

**API / 인터페이스**

- /v1/missions/{id}/telemetry

**Intelligence / 상위 연결**

- E17 trajectory
- E18 recorder
- E39 fusion
- E43 confidence

**UI/UX 연결**

- LIVE TELEMETRY / MODELLED TRAJECTORY badge
- flight metrics

### Claude Code 구현 절차

```text

1. 기존 repository에서 E16와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e16.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E16-T01 | live vs modelled separation | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E16-T02 | out-of-order sample handling | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E16-T03 | source fail fallback | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E16-T04 | unit/schema validation | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e16.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 없는 telemetry를 합성해 LIVE로 표시하지 않음

---

## E17 — Launch Trajectory / Flight Dynamics Adapter Engine

**도메인:** `CONTROL`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** mission trajectory를 실제 telemetry 또는 명시된 모델/공식 trajectory source로 3D 공간에 제공하며 target orbit과 현재 ascent를 연결한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- E16 telemetry
- official trajectory/ephemeris
- vehicle stage data
- launch site
- target orbit

**출력 계약**

- FlightPath
- StageState
- TargetOrbitOverlay

**선행 의존 엔진**

- E05
- E16

**저장 계약**

- flight_path_artifact
- stage_state

**API / 인터페이스**

- /v1/missions/{id}/trajectory

**Intelligence / 상위 연결**

- E34 visual scene
- E19 handover
- E41 event

**UI/UX 연결**

- Launch follow camera
- target orbit overlay

### Claude Code 구현 절차

```text

1. 기존 repository에서 E17와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e17.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E17-T01 | trajectory source label | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E17-T02 | stage separation geometry | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E17-T03 | target orbit frame | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E17-T04 | model version/assumption | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e17.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 실제 guidance/command 계산 엔진으로 사용하지 않음

---

## E18 — Mission Timeline & Recorder Engine

**도메인:** `CONTROL`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 발사 전부터 종료까지 공식 이벤트, telemetry, weather context, timeline milestones를 하나의 불변 Mission Record로 저장한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- mission state
- telemetry
- timeline events
- weather/space weather context
- stream timestamp refs

**출력 계약**

- MissionTimeline
- MissionRecord
- TimelineEvent

**선행 의존 엔진**

- E10
- E15
- E16
- E17

**저장 계약**

- mission_timeline_event
- mission_record_manifest

**API / 인터페이스**

- /v1/missions/{id}/timeline

**Intelligence / 상위 연결**

- E19 replay
- E07 archive
- E42 revision

**UI/UX 연결**

- Mission Timeline
- Event click -> time/camera jump

### Claude Code 구현 절차

```text

1. 기존 repository에서 E18와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e18.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E18-T01 | event order | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E18-T02 | revisions preserved | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E18-T03 | video timestamp optional | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E18-T04 | record hash reproducibility | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e18.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 영상 하나를 Mission Record 전체로 간주하지 않음

---

## E19 — Mission Replay & Mission-to-Orbit Handover Engine

**도메인:** `CONTROL`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** Mission Record를 시간축과 3D 상태로 재생하고 payload/stage가 orbital object로 전환될 때 canonical object와 lineage를 생성한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- mission record
- timeline
- payload manifest
- post-launch catalog matches

**출력 계약**

- ReplaySession
- HandoverRecord
- MissionObjectRelation

**선행 의존 엔진**

- E02
- E04
- E07
- E18

**저장 계약**

- mission_handover
- replay_manifest

**API / 인터페이스**

- /v1/missions/{id}/replay
- /v1/missions/{id}/objects

**Intelligence / 상위 연결**

- E20 orbit
- E25 genealogy
- E41 event

**UI/UX 연결**

- REPLAY MISSION
- handover to ORBIT

### Claude Code 구현 절차

```text

1. 기존 repository에서 E19와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e19.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E19-T01 | replay deterministic | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E19-T02 | handover provisional->confirmed | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E19-T03 | stage/payload identity | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E19-T04 | GO TO LAUNCH / WHERE IS IT NOW relation | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e19.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 미확인 payload를 확정 catalog object로 자동 merge하지 않음

---

