# AETHERUS V2 — INTELLIGENCE CORE E38~E44 DEEP SPEC


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

## Intelligence Connection Contract

Intelligence가 전체 시스템을 총괄한다는 말은 모든 엔진이 Event/Confidence를 직접 생성한다는 뜻이 아니다. `docs/18_INTELLIGENCE_CONNECTION_MATRIX.md`가 canonical boundary다. 특히 E34~E37 Visual은 `CONSUMER_ONLY`, E32는 `COMPUTE_HELPER`, E26/E29/E31/E33은 `INTELLIGENCE_TOOL`이며 현실 Event store에 직접 승격할 수 없다. E01/E03/E18/E30은 Evidence provider, E02/E04~E07/E13/E19/E25는 Context 역할을 우선한다.

## Intelligence의 정확한 위치

Intelligence는 Engine 위, LLM 아래에 있는 독립 실행 시스템이다. Domain Engine들이 수치/상태/후보를 계산하지만 전체 상황을 "이해"하지 않는다. Intelligence Core는 어떤 계산을 더 해야 하는지 orchestration하고, 서로 다른 Evidence를 교차검증하며, 사건을 만들고, 변화 이력을 Revision으로 관리하고, Confidence/Uncertainty와 중요도를 산출한 뒤 Scenario/Attribution/Decision 결과를 구조화한다.

```text
DATA / OBSERVATION
       ↓
DOMAIN ENGINES
       ↓
CLASSIFIED SIGNALS
       ↓
E39 FUSION/CROSS VALIDATION
       ↓
E41 EVENT
       ↓
E42 REVISION
       ↓
E43 CONFIDENCE + UNCERTAINTY
       ↓
E44 WHY IT MATTERS / ATTRIBUTION / DECISION
       ↓
LLM + UI + ALERTS

E38 ORCHESTRATOR는 위 흐름 전체의 실행 그래프를 관리한다.
```

## Intelligence Packet — LLM/UI 공통 출력

```json
{
  "event_id": "uuid",
  "event_type": "CONJUNCTION|LAUNCH|REENTRY|SOLAR|...",
  "domain": "SPACE|CONTROL|ORBIT",
  "current_revision": "rev-id",
  "state": "SCREENING_ONLY",
  "what_happened": {},
  "what_changed": {},
  "why_it_matters": {},
  "objects": [],
  "evidence": [],
  "signals": [],
  "confidence": {"level": "MEDIUM", "factors": []},
  "uncertainty": {"representation": "range|covariance|distribution|qualitative", "data": {}},
  "validation_state": "PUBLIC_SCREENING",
  "scenario_results": [],
  "known_limitations": [],
  "allowed_claims": [],
  "prohibited_claims": [],
  "generated_at": "...Z"
}
```

## Event correlation 규칙

- 동일 object pair + 유사 TCA window + 동일 source event lineage는 기존 conjunction Event Revision 후보.
- 같은 mission의 launch window 변경은 새 Mission이 아니라 Schedule/State Revision.
- re-entry window 변화는 동일 re-entry Event Revision이며 과거 window를 보존.
- official correction/withdrawal은 기존 revision을 삭제하지 않고 correction revision으로 연결.
- event correlation이 불확실하면 자동 merge하지 않고 `CORRELATION_AMBIGUOUS` 상태로 보류.

## Confidence / Uncertainty 설계

Confidence는 "근거를 얼마나 신뢰할 수 있는가"이고 Uncertainty는 "결과 범위가 얼마나 넓은가"다. 둘은 별도 데이터 타입과 별도 UI를 가진다.

Confidence factor 예: source grade, freshness, completeness, multi-source agreement, time alignment, validation pass, input coverage.  
Uncertainty 예: covariance, prediction interval, Monte Carlo percentile, time window, measurement noise, model spread.

**금지:** `confidence=87%` 같은 단일 숫자를 근거 없이 만들어 UI 장식으로 쓰지 않는다. 수치형 confidence를 사용할 경우 weighting/config/version과 factor contribution을 다운로드 가능하게 한다.

## Orchestration 예 — Orbit update

```text
NEW ORBIT SOLUTION
   ↓
E38 resolve impacted object
   ↓
E20 propagate affected windows
   ↓
compare previous predicted state / residual signal
   ↓
E21 related conjunction candidates
   ↓
E22 risk metric if inputs allow
   ↓
E39 fuse sources
   ↓
E41 existing/new event decision
   ↓
E42 revision delta
   ↓
E43 confidence/uncertainty
   ↓
E44 importance + why-it-matters
   ↓
S04 alert if subscriber/policy threshold
```

## Orchestration 예 — Mission

```text
OFFICIAL LAUNCH WINDOW UPDATE
→ E14 schedule revision
→ E15 mission state reevaluate
→ E41 mission event
→ E42 revision
→ E44 importance
→ CONTROL widgets / subscribed alerts
```

## Orchestration 예 — Low confidence high importance

```text
Event importance HIGH
+ Confidence LOW
+ Uncertainty HIGH
       ↓
E44/E43 create evidence gap
       ↓
E38 requests E29 Observation Planning
       ↓
Observation Request
       ↓
E30 QA accepted measurement
       ↓
new Evidence
       ↓
re-run affected engines
       ↓
new Event Revision
```

## Counterfactual / Attribution 규칙

- Baseline snapshot ID는 run 동안 고정.
- 동일 시간격자/metric/model 정의를 가능한 한 유지.
- Scenario에는 intervention, modelVersion, config/seed, assumption, input hash를 저장.
- `Benefit(k→i)`는 개입대상 외 객체의 위험 감소 귀속값이며 사업적/법적 수혜 확정을 의미하지 않음.
- Candidate OCM은 기존 위험 감소와 신규 risk edge를 동시에 보여야 함.
- Decision Comparison은 하나의 정답 명령이 아니라 option-by-option evidence를 제공.

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

