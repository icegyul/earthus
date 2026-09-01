# AETHERUS V2 — ENGINE REGISTRY E01~E44


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
| 범위 | 엔진 |
| --- | --- |
| FOUNDATION | E01, E02, E03, E04, E05, E06, E07 |
| SPACE | E08, E09, E10, E11, E12 |
| CONTROL | E13, E14, E15, E16, E17, E18, E19 |
| ORBIT | E20, E21, E22, E23, E24, E25, E26, E27, E28, E29, E30, E31, E32, E33 |
| VISUAL | E34, E35, E36, E37 |
| INTELLIGENCE | E38, E39, E40, E41, E42, E43, E44 |

## E01 — Source Ingestion & Raw Artifact Engine

**도메인:** `FOUNDATION`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 공식/계약/공개 우주 데이터를 공급자별 정책을 지키며 수집하고 원문을 불변 저장한 뒤 정규화 파이프라인으로 전달한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- provider selector
- credentials reference
- poll policy
- source request metadata

**출력 계약**

- RawArtifact
- IngestionRun
- NormalizedCandidateBatch

**선행 의존 엔진**

- 없음. 단 공통 logging/config/runtime 규칙 적용.

**저장 계약**

- data_source
- ingestion_run
- raw_artifact

**API / 인터페이스**

- /internal/providers/health
- /internal/ingestion/runs

**Intelligence / 상위 연결**

- E03 provenance
- E06 snapshot
- E38 orchestration

**UI/UX 연결**

- 관리자 Provider Health
- 일반 UI에는 OK/STALE/PARTIAL/UNAVAILABLE만 노출

### Claude Code 구현 절차

```text

1. 기존 repository에서 E01와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e01.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E01-T01 | duplicate raw hash dedupe | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E01-T02 | 429/backoff policy | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E01-T03 | partial parse quarantine | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E01-T04 | secret redaction | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E01-T05 | source outage stale behavior | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e01.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- provider 응답을 곧바로 제품 상태로 간주하지 않음
- API key를 로그/DB 평문으로 저장하지 않음

---

## E02 — Canonical Object Identity Engine

**도메인:** `FOUNDATION`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** NORAD/COSPAR/provider alias를 단일 canonical object로 연결하고 행성·탐사선·발사체·로켓단·위성·파편까지 V2 공통 객체 식별체계를 유지한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- provider object record
- catalog_id
- cospar_id
- source alias
- mission relation hints

**출력 계약**

- CanonicalObject
- ObjectAlias
- IdentityConflict

**선행 의존 엔진**

- E01

**저장 계약**

- space_object
- space_object_alias
- identity_conflict

**API / 인터페이스**

- /v1/objects
- /v1/objects/{id}

**Intelligence / 상위 연결**

- E07 knowledge graph
- E19 mission handover
- E25 genealogy

**UI/UX 연결**

- Object Detail identity
- 검색/필터

### Claude Code 구현 절차

```text

1. 기존 repository에서 E02와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e02.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E02-T01 | 6+ digit catalog ID | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E02-T02 | same catalog renamed alias | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E02-T03 | COSPAR conflict quarantine | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E02-T04 | unknown origin not inferred | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E02-T05 | mission-created object handover | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e02.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 이름 유사도만으로 자동 merge 금지
- OWNER/ORIGIN/SOURCE 혼합 금지

---

## E03 — Evidence & Provenance Engine

**도메인:** `FOUNDATION`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 모든 관측·공식정보·파생계산·AI 신호·시뮬레이션 결과가 어디서, 언제, 어떤 버전으로 생성되었는지 증명 가능한 계보를 만든다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- raw artifact refs
- engine result metadata
- model/config version
- license/access policy

**출력 계약**

- EvidenceRecord
- ProvenanceBundle
- SourceGrade

**선행 의존 엔진**

- E01

**저장 계약**

- evidence
- provenance_link
- source_grade_registry

**API / 인터페이스**

- /v1/evidence/{id}
- /v1/provenance/{id}

**Intelligence / 상위 연결**

- E39 evidence fusion
- E43 confidence
- L06 claim validator

**UI/UX 연결**

- Source drawer
- Evidence badge
- Data age

### Claude Code 구현 절차

```text

1. 기존 repository에서 E03와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e03.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E03-T01 | missing source rejects intelligence promotion | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E03-T02 | hash chain reproducibility | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E03-T03 | source-grade separation | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E03-T04 | license policy propagation | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e03.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 출처 없는 숫자를 제품 Intelligence로 승격하지 않음

---

## E04 — Universal Space Time Engine

**도메인:** `FOUNDATION`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** Aetherus 전체에서 PAST/NOW/FUTURE를 단일 UTC 중심 시간축으로 관리하고 기록 시점, 관측 시점, 계산 시점, 시뮬레이션 시점을 구분한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- UTC aware timestamps
- time scale metadata
- user local timezone
- replay/scenario cursor

**출력 계약**

- CanonicalTimeContext
- TimelineCursor
- TimeWindow

**선행 의존 엔진**

- 없음. 단 공통 logging/config/runtime 규칙 적용.

**저장 계약**

- time_context_manifest
- timeline_bookmark

**API / 인터페이스**

- /v1/time/now
- /v1/time/resolve

**Intelligence / 상위 연결**

- E06 snapshot
- E18 mission timeline
- E41 events
- E42 revisions

**UI/UX 연결**

- Universal Time Bar
- NOW reset
- mission replay
- scenario time comparison

### Claude Code 구현 절차

```text

1. 기존 repository에서 E04와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e04.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E04-T01 | naive datetime rejection | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E04-T02 | UTC/local roundtrip | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E04-T03 | replay deterministic cursor | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E04-T04 | future model vs archived state separation | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e04.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- UTC/TAI/UT1 무표기 혼용 금지

---

## E05 — Coordinate & Reference Frame Engine

**도메인:** `FOUNDATION`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** TEME/ITRF/GCRF/ICRF/heliocentric 등 서로 다른 좌표계를 명시적으로 변환하여 지구궤도부터 태양계까지 하나의 시각 경험으로 연결한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- state vector
- frame
- time system
- EOP/kernel version

**출력 계약**

- TransformedState
- GeodeticPosition
- FrameProvenance

**선행 의존 엔진**

- E04

**저장 계약**

- frame_transform_manifest

**API / 인터페이스**

- /internal/frames/transform

**Intelligence / 상위 연결**

- E08 ephemeris
- E20 orbit
- E34 multiscale scene

**UI/UX 연결**

- 좌표표시는 Research mode에서만 상세

### Claude Code 구현 절차

```text

1. 기존 repository에서 E05와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e05.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E05-T01 | frame roundtrip tolerance | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E05-T02 | unsupported frame fail | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E05-T03 | EOP stale downgrade | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E05-T04 | solar/earth frame consistency fixture | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e05.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- frame 미상 데이터를 임의 추정해 정밀 위치로 표시하지 않음

---

## E06 — Digital State / Snapshot / Version Engine

**도메인:** `FOUNDATION`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 특정 시각의 현실·모델·재구성·시나리오 상태를 불변 Snapshot으로 저장하고 새 데이터가 들어와도 과거 상태를 덮어쓰지 않는다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- canonical objects
- evidence refs
- engine outputs
- time context

**출력 계약**

- DigitalState
- SnapshotManifest
- VersionLineage

**선행 의존 엔진**

- E02
- E03
- E04

**저장 계약**

- digital_state
- snapshot_manifest
- state_version

**API / 인터페이스**

- /v1/states/{id}
- /v1/snapshots/{id}

**Intelligence / 상위 연결**

- E41 event
- E42 revision
- E31 benefit
- E07 archive

**UI/UX 연결**

- ARCHIVED STATE / RECONSTRUCTED STATE / NOW 표기

### Claude Code 구현 절차

```text

1. 기존 repository에서 E06와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e06.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E06-T01 | append-only state | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E06-T02 | same input deterministic hash | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E06-T03 | archived vs reconstructed label | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E06-T04 | baseline snapshot immutability | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e06.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 현재 데이터로 과거를 재계산한 값을 당시 실제 기록처럼 표시하지 않음

---

## E07 — Space Knowledge Graph & Archive Engine

**도메인:** `FOUNDATION`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** Mission→Vehicle→Stage→Payload→Space Object→Orbit→Event→Evidence의 관계와 장기 이력을 연결하여 Aetherus의 우주 역사 그래프와 Archive를 만든다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- canonical objects
- mission records
- event links
- genealogy
- snapshots

**출력 계약**

- TypedRelation
- ObjectLifeHistory
- ArchiveIndex

**선행 의존 엔진**

- E02
- E06

**저장 계약**

- object_relation
- archive_index
- collection_manifest

**API / 인터페이스**

- /v1/graph/{id}
- /v1/archive/search

**Intelligence / 상위 연결**

- E19 mission handover
- E25 genealogy
- L04 context composer

**UI/UX 연결**

- HISTORY
- GO TO LAUNCH
- WHERE IS IT NOW?
- Archive

### Claude Code 구현 절차

```text

1. 기존 repository에서 E07와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e07.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E07-T01 | typed relation source required | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E07-T02 | mission-to-object lineage | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E07-T03 | time-consistent traversal | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E07-T04 | unknown relation uncertainty | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e07.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 정치적/법적 책임을 origin relation에서 추론하지 않음

---

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

## E20 — Orbit Propagation & Frames Engine

**도메인:** `ORBIT`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** OMM/GP/OEM/OCM 등 궤도해를 등급에 맞는 전파모델로 계산하고 현재/미래 상태·데이터 나이·모델·프레임을 함께 반환한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- OrbitSolution
- target times
- model selector
- EOP/time data

**출력 계약**

- StateVectorSeries
- GeodeticSeries
- PropagationProvenance

**선행 의존 엔진**

- E02
- E03
- E04
- E05

**저장 계약**

- orbit_solution
- propagation_artifact/cache

**API / 인터페이스**

- /v1/objects/{id}/ephemeris

**Intelligence / 상위 연결**

- E21 conjunction
- E24 environment
- E34 3D

**UI/UX 연결**

- Object orbit
- Data age

### Claude Code 구현 절차

```text

1. 기존 repository에서 E20와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e20.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E20-T01 | known epoch golden | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E20-T02 | deterministic hash | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E20-T03 | stale flag | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E20-T04 | invalid elements -> unavailable | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E20-T05 | frame conversion | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e20.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 브라우저 계산과 backend 결과가 버전 불일치한 이중 truth가 되지 않음

---

## E21 — Conjunction Screening & Precise TCA Engine

**도메인:** `ORBIT`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 대규모 객체 쌍을 보수적으로 coarse screening한 뒤 후보에 대해 최근접 시각/거리/상대속도를 정밀 계산한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- propagable object set
- screening window
- versioned config

**출력 계약**

- CandidatePair
- ConjunctionEventCandidate
- TCAResult

**선행 의존 엔진**

- E20

**저장 계약**

- conjunction_event
- conjunction_snapshot

**API / 인터페이스**

- /v1/conjunctions

**Intelligence / 상위 연결**

- E22 Pc
- E23 risk graph
- E41 event

**UI/UX 연결**

- Conjunction event marker
- Event Focus

### Claude Code 구현 절차

```text

1. 기존 repository에서 E21와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e21.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E21-T01 | injected close pair recall | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E21-T02 | known TCA tolerance | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E21-T03 | boundary minimum | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E21-T04 | multi-minima | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E21-T05 | verification corpus metrics | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e21.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 후보 수가 적다는 이유로 성공 판정 금지

---

## E22 — Collision Probability & Risk Provenance Engine

**도메인:** `ORBIT`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 공분산 등 필요한 조건이 충족될 때만 Pc를 계산하며 MaxProbability/miss distance/기타 metric과 절대 혼동하지 않고 계보를 보존한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- relative state at TCA
- covariances
- HBR
- Pc method config
- source risk metrics

**출력 계약**

- RiskMetric
- PcResult
- QualityFlags
- RiskProvenance

**선행 의존 엔진**

- E03
- E21

**저장 계약**

- risk_metric
- risk_provenance

**API / 인터페이스**

- /v1/conjunctions/{id}/risk

**Intelligence / 상위 연결**

- E23 risk graph
- E43 uncertainty
- E44 importance

**UI/UX 연결**

- SCREENING_ONLY / VALIDATED_RISK
- metric type/method

### Claude Code 구현 절차

```text

1. 기존 repository에서 E22와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e22.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E22-T01 | missing covariance -> null not zero | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E22-T02 | Pc bounds | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E22-T03 | method mismatch warning | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E22-T04 | spec fixture path | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E22-T05 | dilution/covariance validity | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e22.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- MaxProbability를 Pc로 이름 변경 금지
- TLE-only를 정밀 충돌위험으로 승격 금지

---

## E23 — Risk Graph Engine

**도메인:** `ORBIT`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 객체 간 metric-specific risk edge를 시간지평별로 저장해 향후 Benefit/PROTECT/Revision을 재현 가능한 관계망으로 만든다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- conjunction metrics
- environment features
- metric configuration

**출력 계약**

- RiskEdge
- RiskGraphSnapshot
- ObjectRiskAggregate optional

**선행 의존 엔진**

- E22
- E06

**저장 계약**

- risk_edge
- risk_graph_manifest

**API / 인터페이스**

- /v1/risk-graph
- /v1/objects/{id}/risk

**Intelligence / 상위 연결**

- E31 benefit
- E32 affected
- E33 protect
- E41 events

**UI/UX 연결**

- Research graph
- Object risk panel

### Claude Code 구현 절차

```text

1. 기존 repository에서 E23와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e23.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E23-T01 | edge deterministic | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E23-T02 | metric split | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E23-T03 | aggregate config version required | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E23-T04 | graph snapshot hash | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e23.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- UI용 composite score 때문에 원 metric 삭제 금지

---

## E24 — Orbital Environment / Congestion Engine

**도메인:** `ORBIT`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** LEO/MEO/GEO 및 세부 shell별 객체·밀도·활동·conjunction/re-entry context를 원지표에서 계산하여 Orbital Stack Intelligence의 기초를 만든다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- object snapshot
- orbit states
- conjunction feed
- reentry states

**출력 계약**

- ShellMetric
- OrbitalWeatherSnapshot
- CoverageMetric

**선행 의존 엔진**

- E20
- E21
- E27

**저장 계약**

- environment_metric
- orbital_weather_snapshot

**API / 인터페이스**

- /v1/orbital-weather/current
- /v1/orbit/shells

**Intelligence / 상위 연결**

- E36 orbital shell
- E44 importance

**UI/UX 연결**

- LEO/MEO/GEO Shell panel
- density brightness

### Claude Code 구현 절차

```text

1. 기존 repository에서 E24와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e24.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E24-T01 | shell boundaries | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E24-T02 | coverage ratio | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E24-T03 | source gap partial | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E24-T04 | threshold version | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e24.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 단순 object count를 위험이라고 부르지 않음

---

## E25 — Debris Genealogy / Origin Engine

**도메인:** `ORBIT`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** launch/parent rocket/fragmentation event/object family를 source 기반 관계로 연결하여 WHERE DID IT COME FROM?을 제공한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- object metadata
- mission handover
- fragmentation event
- launch metadata

**출력 계약**

- GenealogyGraph
- OriginProfile
- FamilyCandidate

**선행 의존 엔진**

- E07
- E19

**저장 계약**

- object_relation
- genealogy_group

**API / 인터페이스**

- /v1/genealogy/{id}

**Intelligence / 상위 연결**

- E07 archive
- E41 event

**UI/UX 연결**

- Object History
- Origin Mission

### Claude Code 구현 절차

```text

1. 기존 repository에서 E25와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e25.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E25-T01 | known family links | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E25-T02 | unknown origin no inference | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E25-T03 | chronological timeline | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E25-T04 | multinational separation | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e25.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- owner/origin/legal responsibility 혼합 금지

---

## E26 — Fragmentation Scenario Engine

**도메인:** `ORBIT`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 관측된/가정된 충돌·파편화 조건을 versioned breakup model과 Monte Carlo로 연구 시뮬레이션하여 downstream exposure와 indirect benefit을 산출한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- parent states
- mass/range
- relative state
- breakup model config
- seed policy

**출력 계약**

- FragmentCohort
- FragmentationScenarioResult
- ExposureDelta

**선행 의존 엔진**

- E20
- E23

**저장 계약**

- fragmentation_run
- research object store/parquet

**API / 인터페이스**

- /v1/scenarios/fragmentation

**Intelligence / 상위 연결**

- E31 benefit
- E32 affected
- E41 event

**UI/UX 연결**

- WHAT IF THEY COLLIDE?
- SIMULATION_ONLY badge

### Claude Code 구현 절차

```text

1. 기존 repository에서 E26와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e26.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E26-T01 | fixed seed reproducibility | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E26-T02 | assumption exposure | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E26-T03 | remove path indirect delta | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E26-T04 | model validation state | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e26.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 가상 fragment를 실제 catalog object로 등록하지 않음

---

## E27 — Re-entry Intelligence Engine

**도메인:** `ORBIT`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** decaying/TIP/공식 추정/모델 context를 품질 등급별로 통합하고 re-entry window 변화와 Revision을 보존한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- TIP/decay sources
- orbit decay trend
- space weather context

**출력 계약**

- ReentryPrediction
- ReentryWatch
- PredictionRevision

**선행 의존 엔진**

- E10
- E20

**저장 계약**

- reentry_prediction
- reentry_revision

**API / 인터페이스**

- /v1/reentry
- /v1/reentry/{id}

**Intelligence / 상위 연결**

- E41 event
- E42 revision
- E43 uncertainty

**UI/UX 연결**

- Re-entry Watch
- window visualization

### Claude Code 구현 절차

```text

1. 기존 repository에서 E27와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e27.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E27-T01 | TIP parse | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E27-T02 | no TIP -> no fake exact time | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E27-T03 | version history | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E27-T04 | grade visible | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e27.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 단일 낙하지점 확정 금지

---

## E28 — Photometry / Rotation Intelligence Engine

**도메인:** `ORBIT`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 광도 관측을 QA하고 회전주기 후보/alias/불확실성을 산출하되 형상·자세를 과도하게 단정하지 않는다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- photometry series
- station metadata
- uncertainty

**출력 계약**

- PeriodCandidate
- RotationEstimate
- PhotometryQuality

**선행 의존 엔진**

- E03

**저장 계약**

- photometry_series
- rotation_estimate

**API / 인터페이스**

- /v1/objects/{id}/rotation

**Intelligence / 상위 연결**

- E30 observation
- E43 uncertainty

**UI/UX 연결**

- Rotation tab
- estimated label

### Claude Code 구현 절차

```text

1. 기존 repository에서 E28와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e28.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E28-T01 | synthetic sinusoid | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E28-T02 | alias ambiguous | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E28-T03 | too few points | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E28-T04 | uncertainty downgrade | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e28.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- highest peak 하나를 확정 회전주기로 단정하지 않음

---

## E29 — Observation Planning Engine

**도메인:** `ORBIT`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 위험 관련성·관측가능성·정보이득·데이터 희소성을 결합해 어떤 객체를 언제 어떤 관측소에서 관측할지 후보 요청을 생성한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- object uncertainty
- station capabilities
- visibility geometry
- noise model
- optional Earthus weather

**출력 계약**

- ObservationRequest
- VisibilityWindow
- ExpectedInformationGain

**선행 의존 엔진**

- E20
- E43

**저장 계약**

- observation_station
- observation_request

**API / 인터페이스**

- /v1/observations/requests

**Intelligence / 상위 연결**

- E38 orchestrator feedback loop
- E30 QA

**UI/UX 연결**

- Observation Desk
- Why this request

### Claude Code 구현 절차

```text

1. 기존 repository에서 E29와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e29.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E29-T01 | known pass | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E29-T02 | sun/eclipse flag | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E29-T03 | mount limit | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E29-T04 | info gain ordering | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E29-T05 | no visibility -> no request | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e29.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 긴급성을 임의 생성하지 않음

---

## E30 — Citizen Observation QA & Contribution Engine

**도메인:** `ORBIT`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 시민/대학/천문대 관측을 시간·장비·잔차·중복·라이선스 기준으로 검증하고 ACCEPTED 데이터만 후속 궤도결정 후보로 전달한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- observation submission
- station/equipment
- raw artifact
- request context

**출력 계약**

- QAResult
- ValidatedMeasurement
- ContributionRecord

**선행 의존 엔진**

- E01
- E03
- E29

**저장 계약**

- observation_submission
- observation_qa
- contribution

**API / 인터페이스**

- /v1/observations/submissions

**Intelligence / 상위 연결**

- E38 re-orchestration
- E42 revision
- E43 confidence

**UI/UX 연결**

- Contribution history
- QA status

### Claude Code 구현 절차

```text

1. 기존 repository에서 E30와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e30.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E30-T01 | duplicate dedupe | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E30-T02 | bad timestamp quarantine | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E30-T03 | outlier reject | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E30-T04 | accepted-only hook | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E30-T05 | license missing | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e30.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 실제 before/after 근거 없이 개선 퍼센트 생성 금지

---

## E31 — Intervention Benefit / Counterfactual Engine

**도메인:** `ORBIT`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 고정 baseline과 REMOVE/NUDGE/LOWER 등 개입 후 risk graph를 동일 기준으로 비교하여 비대상 수혜 객체별 위험감소량을 귀속한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- baseline risk graph
- scenario definition
- metric config
- horizon

**출력 계약**

- ScenarioRun
- BenefitResult
- EnvironmentBenefit
- NewRiskDelta

**선행 의존 엔진**

- E23
- E26

**저장 계약**

- intervention_scenario
- scenario_run
- benefit_result

**API / 인터페이스**

- /v1/scenarios
- /v1/scenarios/{id}/run
- /v1/scenarios/{id}/benefits

**Intelligence / 상위 연결**

- E32 affected
- E33 protect
- E44 attribution/decision

**UI/UX 연결**

- SIMULATE REMOVE
- Scenario Lab
- Benefit visualization

### Claude Code 구현 절차

```text

1. 기존 repository에서 E31와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e31.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E31-T01 | direct remove exact delta | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E31-T02 | metric channels separated | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E31-T03 | same input repeat hash | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E31-T04 | no data no fake beneficiary | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E31-T05 | new risk surfaced | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e31.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- remove animation만 구현하고 계산 결과 없는 상태를 완료로 인정하지 않음

---

## E32 — Affected Subgraph Engine

**도메인:** `ORBIT`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 개입으로 바뀔 가능성이 있는 관계만 보수적으로 정밀 재계산하여 대규모 counterfactual 계산 비용을 줄이되 full recompute 등가성으로 정확성을 검증한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- baseline graph
- scenario path
- conservative filter config

**출력 계약**

- AffectedObjectSet
- AffectedEdgeSet
- ReuseManifest

**선행 의존 엔진**

- E23
- E31

**저장 계약**

- scenario_run artifacts
- affected_manifest

**API / 인터페이스**

- /internal/scenarios/{id}/affected

**Intelligence / 상위 연결**

- E31 benefit
- E33 protect
- E44 decision

**UI/UX 연결**

- Research performance detail only

### Claude Code 구현 절차

```text

1. 기존 repository에서 E32와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e32.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E32-T01 | injected influence included | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E32-T02 | full-vs-selective equivalence | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E32-T03 | new OCM path candidate | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E32-T04 | rollback on mismatch | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e32.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 속도 향상을 위해 threshold 임의 축소 금지

---

## E33 — PROTECT Reverse Query & Candidate OCM Comparison Engine

**도메인:** `ORBIT`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 보호대상 Y를 먼저 지정해 개입 후보별 Benefit(k→Y), 신규 위험, confidence를 비교하고 nominal/candidate OCM 차이를 같은 외부 객체집합에서 평가한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- protected object
- candidate policy
- scenario kinds
- candidate OCMs optional

**출력 계약**

- CandidateInterventionRank
- EdgeDelta
- CandidateSummary
- BenefitMatrixSlice

**선행 의존 엔진**

- E31
- E32

**저장 계약**

- scenario/benefit reuse
- candidate_compare_manifest

**API / 인터페이스**

- /v1/protect/{id}/candidates
- /v1/operations/fleets/{id}/maneuver-candidates

**Intelligence / 상위 연결**

- E44 decision comparison
- P08 Operations

**UI/UX 연결**

- PROTECT THIS OBJECT
- Candidate Comparison

### Claude Code 구현 절차

```text

1. 기존 repository에서 E33와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e33.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E33-T01 | known ranking | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E33-T02 | inactive protected object research mode | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E33-T03 | new risk penalty | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E33-T04 | same-designator exclusion | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E33-T05 | candidate provenance | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e33.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 단순 가장 위험한 debris 정렬로 대체 금지
- 자동 기동 명령 금지

---

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

## E38 — Aetherus Intelligence Orchestrator

**도메인:** `INTELLIGENCE`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 새 데이터/상태 변화/사용자 시나리오에 따라 어떤 엔진을 어떤 순서로 실행할지 결정하고 결과를 Event/Revision/Scenario 파이프라인으로 연결하는 상위 총괄 런타임이다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- ingestion events
- engine completion events
- user commands
- schedule triggers

**출력 계약**

- OrchestrationRun
- EngineTaskGraph
- IntelligenceUpdateRequest

**선행 의존 엔진**

- E01
- E06

**저장 계약**

- orchestration_run
- task_lineage

**API / 인터페이스**

- /internal/intelligence/runs

**Intelligence / 상위 연결**

- E39-E44
- job queue

**UI/UX 연결**

- 직접 노출하지 않음; status는 admin/ops

### Claude Code 구현 절차

```text

1. 기존 repository에서 E38와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e38.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E38-T01 | idempotent trigger | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E38-T02 | dependency ordering | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E38-T03 | partial failure recovery | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E38-T04 | no circular task graph | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E38-T05 | replay from event log | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e38.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 과학결과를 자체 생성하지 않음
- LLM이 orchestration source of truth가 되지 않음

---

## E39 — Evidence Fusion & Cross Validation Intelligence

**도메인:** `INTELLIGENCE`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 다중 source와 engine result를 시간·품질·출처등급·독립성·일치도 관점에서 비교하고 서로 충돌하는 근거를 숨기지 않은 Evidence Bundle을 만든다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- EvidenceRecords
- engine results
- source grades
- time alignment

**출력 계약**

- FusedEvidenceBundle
- AgreementMetrics
- ConflictFlags

**선행 의존 엔진**

- E03
- E38

**저장 계약**

- evidence_fusion_run
- evidence_conflict

**API / 인터페이스**

- /v1/intelligence/events/{id}/evidence

**Intelligence / 상위 연결**

- E43 confidence
- E41 event
- L04 context

**UI/UX 연결**

- Evidence drawer
- source agreement explanation

### Claude Code 구현 절차

```text

1. 기존 repository에서 E39와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e39.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E39-T01 | independent source weighting | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E39-T02 | stale disagreement | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E39-T03 | conflicting official sources preserved | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E39-T04 | missing evidence remains missing | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e39.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 다수결로 사실 확정하지 않음

---

## E40 — Signal Classification Intelligence

**도메인:** `INTELLIGENCE`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 관측값·파생계산·모델신호·AI신호·공식예보·시뮬레이션·Counterfactual 등을 강제 분류해 정보 종류가 섞이지 않게 한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- engine outputs
- AI outputs
- official feeds
- scenario outputs

**출력 계약**

- ClassifiedSignal
- EvidenceClass
- ValidationState

**선행 의존 엔진**

- E03
- E38

**저장 계약**

- signal
- signal_classification

**API / 인터페이스**

- /v1/intelligence/signals

**Intelligence / 상위 연결**

- E37 visuals
- E41 events
- L06 claims

**UI/UX 연결**

- Evidence Class badge

### Claude Code 구현 절차

```text

1. 기존 repository에서 E40와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e40.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E40-T01 | class required | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E40-T02 | AI cannot overwrite observed | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E40-T03 | counterfactual cannot become official | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E40-T04 | unknown class quarantine | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e40.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- AI를 Intelligence 자체로 취급하지 않음

---

## E41 — Event Intelligence Engine

**도메인:** `INTELLIGENCE`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 수많은 상태/신호 중 사용자가 이해해야 할 의미 있는 사건을 식별하고 기존 Event와 매칭하여 event lifecycle을 관리한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- classified signals
- digital state changes
- domain event candidates
- fusion bundle

**출력 계약**

- IntelligenceEvent
- EventCandidateDecision
- EventLinks

**선행 의존 엔진**

- E39
- E40

**저장 계약**

- intelligence_event
- event_object_link
- event_signal_link

**API / 인터페이스**

- /v1/intelligence/events
- /v1/intelligence/events/{id}

**Intelligence / 상위 연결**

- E42 revision
- E44 importance
- P04 alerts

**UI/UX 연결**

- SPACE NOW
- Mission events
- Orbital events

### Claude Code 구현 절차

```text

1. 기존 repository에서 E41와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e41.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E41-T01 | same event correlation | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E41-T02 | duplicate suppression | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E41-T03 | new event boundary | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E41-T04 | domain-specific event types | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E41-T05 | insufficient data event allowed | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e41.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 모든 update를 새 Event로 생성하지 않음

---

## E42 — Revision Intelligence Engine

**도메인:** `INTELLIGENCE`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 동일 Event에 새 근거/계산이 들어올 때 무엇이 바뀌었는지, 왜 바뀌었는지, 어떤 결과가 폐기/유지되었는지를 Revision으로 기록한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- current event
- new signals
- previous revision
- engine diff

**출력 계약**

- EventRevision
- ChangeSet
- RevisionExplanationData

**선행 의존 엔진**

- E41
- E06

**저장 계약**

- event_revision
- revision_delta

**API / 인터페이스**

- /v1/intelligence/events/{id}/revisions

**Intelligence / 상위 연결**

- E43 confidence
- E44 importance
- L05 explanation

**UI/UX 연결**

- WHAT CHANGED?
- Revision timeline

### Claude Code 구현 절차

```text

1. 기존 repository에서 E42와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e42.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E42-T01 | append-only revisions | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E42-T02 | change cause linked | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E42-T03 | no-change revision suppression policy | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E42-T04 | rollback/correction lineage | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e42.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 과거 revision destructive overwrite 금지

---

## E43 — Confidence & Uncertainty Intelligence Engine

**도메인:** `INTELLIGENCE`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** 근거를 얼마나 믿을 수 있는지(Confidence)와 결과 범위가 얼마나 넓은지(Uncertainty)를 분리 계산하고 이유/범위/방법 버전을 함께 저장한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- fused evidence
- source freshness
- coverage
- agreement
- covariance/model uncertainty
- validation state

**출력 계약**

- ConfidenceAssessment
- UncertaintyAssessment
- ReasonFactors

**선행 의존 엔진**

- E39
- E42

**저장 계약**

- confidence_assessment
- uncertainty_assessment

**API / 인터페이스**

- /v1/intelligence/events/{id}/confidence

**Intelligence / 상위 연결**

- E29 observation
- E44 importance
- L06 validator

**UI/UX 연결**

- HOW SURE ARE WE?
- confidence reasons
- uncertainty envelope

### Claude Code 구현 절차

```text

1. 기존 repository에서 E43와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e43.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E43-T01 | confidence != uncertainty | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E43-T02 | missing covariance raises uncertainty/limits claim | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E43-T03 | factor traceability | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E43-T04 | versioned weighting | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e43.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 근거 없는 0-100 신뢰점수 장식 금지

---

## E44 — Importance / Why-It-Matters / Attribution & Decision Intelligence Engine

**도메인:** `INTELLIGENCE`  
**상태:** V2 canonical design / Claude Code implementation required  
**목적:** Event의 절대값·변화율·신뢰도·최근성·관련성·영향을 종합해 지금 볼 가치와 이유를 구조화하고, Scenario 결과의 Attribution/Decision Comparison을 생성한다.

### 책임 경계

이 엔진은 자신의 입력 계약을 검증하고 정의된 출력만 생성한다. 다른 엔진의 내부 알고리즘을 복제하지 않는다. I/O orchestration과 순수 계산 core를 분리하고, 모든 계산·분류·변환에는 버전과 input hash를 남긴다. 실패를 0 또는 성공처럼 처리하지 않고 `FAILED`, `PARTIAL`, `UNAVAILABLE`, `STALE`, `RESEARCH_ONLY` 중 적절한 상태로 승격한다.

**입력 계약**

- event revision
- confidence/uncertainty
- risk/mission/space context
- scenario/benefit results
- user relevance optional

**출력 계약**

- ImportanceAssessment
- WhyItMattersPacket
- AttributionResult
- DecisionComparison

**선행 의존 엔진**

- E31
- E33
- E43

**저장 계약**

- importance_assessment
- attribution_result
- decision_comparison

**API / 인터페이스**

- /v1/intelligence/important-now
- /v1/intelligence/events/{id}/why
- /v1/intelligence/scenarios/{id}/attribution

**Intelligence / 상위 연결**

- L04-L08
- P04 alerts
- all main UI

**UI/UX 연결**

- WHY IT MATTERS
- WHAT IF?
- COMPARE
- SPACE NOW

### Claude Code 구현 절차

```text

1. 기존 repository에서 E44와 동일하거나 부분적으로 겹치는 구현을 검색한다.
2. 기존 구현이 있으면 REUSE / MIGRATE / REPLACE / RETIRE 후보를 기록하고 근거 없이 새 구현을 병렬 생성하지 않는다.
3. domain type/interface를 먼저 확정하고 provider-specific raw type과 분리한다.
4. pure-core 함수와 I/O orchestration을 분리한다.
5. DB migration 또는 schema 변화가 필요하면 backward/rollback 계획과 함께 작성한다.
6. API contract와 worker contract를 먼저 테스트로 고정한다.
7. 실제 source 또는 공식/고정 fixture로 happy path + failure path를 구현한다.
8. 결과에 source/model/config/input hash/validation state가 연결되는지 검증한다.
9. UI가 해당 API/contract만 소비하도록 연결하고 임의 계산/placeholder를 제거한다.
10. evidence manifest `artifacts/evidence/e44.json`을 생성한다.
```

### 필수 테스트 / Hard Gate

| ID | 검증항목 | 종류 | 통과조건 |
| --- | --- | --- | --- |
| E44-T01 | importance reasons traceable | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E44-T02 | change rate can outrank static magnitude under policy | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E44-T03 | decision shows new risk | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E44-T04 | scenario assumptions surfaced | 자동화 | PASS 증거 + 로그/DB/API 결과 |
| E44-T05 | no single-option recommendation without policy | 자동화 | PASS 증거 + 로그/DB/API 결과 |

**DONE Gate**

- 실데이터 또는 공식/고정 fixture 입력이 존재한다.
- 핵심 함수가 placeholder/constant-return이 아니다.
- 결과가 정해진 storage에 저장되고 input hash 및 provenance가 연결된다.
- API schema validation 및 오류 상태가 통과한다.
- 해당 UI가 API 결과를 사용하고 fake number를 생성하지 않는다.
- 단위/통합/E2E 테스트가 통과한다.
- 성능이 중요한 엔진은 hardware/object count/config와 함께 benchmark를 기록한다.
- Known limitations와 source/license/validation state가 문서화된다.
- `artifacts/evidence/e44.json`이 존재한다.

**DO NOT IMPLEMENT / 금지사항**

- 법적/운영상 자동 명령·공식 제거추천·확정 인과 증명으로 승격하지 않음

---

