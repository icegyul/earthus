# AETHERUS V2 — ORBITAL ENVIRONMENT / DEBRIS SPEC


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

## 역할

이 문서는 기존 Orbital Environment 초상세본을 Aetherus V2의 세 번째 제품 축으로 재배치한다. 기존 Orbit/CA/Risk/Benefit/PROTECT/Affected Subgraph/Observation/Fragmentation/Re-entry 설계를 최대한 재사용하고, V2 공통 Time/State/Event/Intelligence/Visual 체계에 연결한다.

## Orbital Stack UX

```text
                    GEO
            ─────────────────

                    MEO
               ───────────

                    LEO
                  ───────
                    🌍
```

실제 UI는 spherical band/shell이며 물리 경계와 experience representation을 구분한다. Shell hover/click은 객체 수만 보여주는 것이 아니라 coverage, source freshness, conjunction activity, re-entry watch, important events를 제공한다.

### Object Focus

- Identity / origin
- live/selected time orbit state
- data age / source grade
- risk/conjunction channels
- history/genealogy
- actions: Follow / Observe / Simulate / Protect (권한/validation에 따라)

### Event Focus

- WHAT HAPPENED?
- WHAT CHANGED?
- WHY IT MATTERS?
- HOW SURE ARE WE?
- Evidence / metric type / method
- Time to TCA or window
- History
- Scenario if permitted

## Safety boundary

Aetherus ORBIT은 초기 제품에서 research/advisory system이다. 공식 collision avoidance recommendation, command uplink, legal removal authority 판정, exact re-entry impact point를 제공하지 않는다.

## Benefit / PROTECT 핵심 보존

- 대상 object의 위험 감소 자체가 아니라 **비대상 beneficiary object별 위험 감소 귀속**을 핵심으로 유지.
- 보호대상 Y를 먼저 지정한 reverse query를 독립 UX/engine으로 유지.
- Affected Subgraph는 성능 최적화이며 full-vs-selective 등가성 통과 전 활성화하지 않음.
- metric provenance를 분리하고 Pc/MaxP/density/fragmentation을 하나의 의미 없는 값으로 강제 변환하지 않음.
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

