# AETHERUS V2 — SPACE / SOLAR SYSTEM SPEC


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

## 사용자 경험

첫 진입의 기준점은 Earth다. 사용자가 줌아웃하면 Orbital Stack이 나타나고, 더 멀어지면 Moon/Cislunar, Inner Solar System, Solar System으로 전환한다. 전환은 시각적으로 연속적이어야 하지만 엔진 내부에서는 scale/frame/LOD를 명시적으로 분리한다.

### SPACE 기본 화면

- Earth 중심 + 현재 terminator/lighting.
- 약한 LEO/MEO/GEO shell.
- Moon current position.
- 멀리서 planets/major mission markers.
- 오른쪽 `SPACE NOW`는 important Event만 표시.
- Timeline은 NOW 기본. 과거/미래로 이동 시 `ARCHIVED/RECONSTRUCTED/MODELLED` disclosure.

### Solar System View

기본 표시: Sun, planets, Moon relation, 선택된 major missions, important celestial/solar events. 모든 small body를 처음부터 렌더하지 않는다. Search/Layer로 NEO 등 세부 그룹을 연다.

### Sun Detail

`SUN NOW`, current observed/context state, source time, recent Event, why-it-matters, Earth/LEO context. 공식 경보와 Aetherus research interpretation을 분리한다.

### 신규 provider 원칙 [V2-NEW][VALIDATE]

태양계/천체/space-weather provider는 실제 개발 전에 라이선스·rate limit·precision·redistribution을 검증하고 adapter registry에 등록한다. provider 이름 자체를 domain model에 하드코딩하지 않는다. 공식 ephemeris/kernel 계열과 public space-weather sources를 우선하며, source-specific schema를 canonical model과 분리한다.

## SPACE 엔진 연결

```text
E08 Ephemeris ─┐
E09 Events ────┼→ E39 Fusion → E41 Event → E42 Revision → E43/E44
E10 Weather ───┤
E11 NEO ───────┤
E12 Missions ──┘
       ↓
E34/E35 Visual Scale
       ↓
SPACE UI / LLM
```
## E08 — Solar System Ephemeris Engine

**도메인:** `SPACE`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 태양·행성·달·선택 천체/탐사선의 현재/과거/미래 위치를 검증된 천문 ephemeris 소스로 계산해 Solar System Digital State를 제공한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- ephemeris provider data
- kernel/version
- time range
- target observer

**출력 계약**

- CelestialState
- EphemerisSeries
- EphemerisProvenance

**선행 의존 엔진**

- E03
- E04
- E05

**저장 계약**

- celestial_object
- celestial_ephemeris_cache

**API / 인터페이스**

- /v1/space/ephemeris
- /v1/space/objects/{id}

**Intelligence / 상위 연결**

- E09 celestial event
- E34 solar scene
- E41 event intelligence

**UI/UX 연결**

- 지구→달→태양계 Spatial Ladder
- 현재 위치/궤도

### Claude Code 구현 절차

```text

1. 기존 repository에서 E08와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e08.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E08-T01 | known epoch cross-check | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E08-T02 | past/future deterministic | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E08-T03 | provider/kernel version captured | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E08-T04 | observer/frame explicit | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e08.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 행성 CCTV 실시간처럼 표현하지 않음
- experience scale을 물리 scale로 오해시키지 않음

---

## E09 — Celestial Event Engine

**도메인:** `SPACE`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 일식/월식/행성 접근/합·충/엄폐/중요 관측 시점 등 천체 상태에서 의미 있는 Event 후보를 생성한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- E08 ephemerides
- event rule/config
- official event feeds optional

**출력 계약**

- CelestialEventCandidate
- EventGeometry

**선행 의존 엔진**

- E08

**저장 계약**

- celestial_event_candidate

**API / 인터페이스**

- /v1/space/events

**Intelligence / 상위 연결**

- E41 event
- E44 importance

**UI/UX 연결**

- SPACE NOW
- Solar System event markers

### Claude Code 구현 절차

```text

1. 기존 repository에서 E09와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e09.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E09-T01 | known event fixture | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E09-T02 | rule version stored | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E09-T03 | boundary time zone | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E09-T04 | official vs derived separation | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e09.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 공식 천문현상을 자체 모델만으로 official이라고 라벨링하지 않음

---

## E10 — Solar / Space Weather Context Engine

**도메인:** `SPACE`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 태양활동·태양풍·지자기·열권/drag context를 수집·정규화하여 Space와 Orbit 양쪽에 설명 가능한 환경 신호를 제공한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- official solar/geomagnetic observations
- forecast/context feeds
- time-aligned orbit context

**출력 계약**

- SpaceWeatherState
- SolarEventSignal
- DragContext

**선행 의존 엔진**

- E01
- E03
- E04

**저장 계약**

- space_weather_state
- solar_event_signal

**API / 인터페이스**

- /v1/space-weather/current
- /v1/space-weather/history

**Intelligence / 상위 연결**

- E27 reentry
- E43 uncertainty
- E44 why-it-matters

**UI/UX 연결**

- Space Weather Lab
- CONTROL launch context
- SPACE Sun panel

### Claude Code 구현 절차

```text

1. 기존 repository에서 E10와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e10.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E10-T01 | source timestamp preserved | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E10-T02 | observed vs forecast separated | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E10-T03 | stale handling | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E10-T04 | drag context is context not direct orbit correction | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e10.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 공식 우주기상 경보를 대체하지 않음

---

## E11 — NEO / Small Body Tracking Engine

**도메인:** `SPACE`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 공개/공식 small-body 궤도 및 근접 자료를 정규화하여 지구근접천체를 SPACE 모드에서 추적하고 Event Intelligence에 연결한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- NEO catalog/ephemeris
- close approach data
- uncertainty/quality metadata

**출력 계약**

- SmallBodyState
- CloseApproachCandidate

**선행 의존 엔진**

- E03
- E04
- E05
- E08

**저장 계약**

- small_body
- small_body_snapshot

**API / 인터페이스**

- /v1/space/neo
- /v1/space/neo/{id}

**Intelligence / 상위 연결**

- E41 event
- E43 uncertainty

**UI/UX 연결**

- Solar System optional layer
- Important NEO events

### Claude Code 구현 절차

```text

1. 기존 repository에서 E11와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e11.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E11-T01 | source grade | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E11-T02 | close approach timestamp | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E11-T03 | uncertainty preserved | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E11-T04 | no impact claim without source | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e11.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 충돌확률/위험을 임의 생성하지 않음

---

## E12 — Deep-Space Mission Tracking Engine

**도메인:** `SPACE`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 심우주 탐사선과 주요 우주망원경의 공식 ephemeris/mission state를 SPACE 모드에 연결하여 태양계 객체와 임무의 관계를 추적한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- official mission ephemeris/state
- mission registry
- media/evidence

**출력 계약**

- DeepSpaceMissionState
- MissionEncounter

**선행 의존 엔진**

- E03
- E07
- E08

**저장 계약**

- deep_space_mission_state

**API / 인터페이스**

- /v1/space/missions

**Intelligence / 상위 연결**

- E41 event
- E07 graph

**UI/UX 연결**

- SPACE mission markers
- JWST/Hubble/planetary mission detail

### Claude Code 구현 절차

```text

1. 기존 repository에서 E12와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e12.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E12-T01 | mission status source | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E12-T02 | trajectory provenance | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E12-T03 | missing live telemetry -> model/official state label | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e12.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 비공개 telemetry를 추정 생성하지 않음

---

