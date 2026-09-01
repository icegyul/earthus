# AETHERUS V2 — CLAUDE CODE IMPLEMENTATION PHASES


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
## P0 — Repository Audit & Baseline

기존 repo/working tree/source docs/implementation을 inventory하고 파괴적 변경 없이 정본 baseline을 만든다.

**필수 산출물**

- E01-E44 mapping
- legacy reuse map
- git state
- missing inputs

**Hard Gate:** audit artifacts complete.

**Claude Code 실행 패턴**

```text

PHASE: P0 Repository Audit & Baseline
1. Read master + relevant domain/engine specs.
2. Audit existing implementation before editing.
3. Write exact file/module/test change plan.
4. Implement smallest complete vertical slice.
5. Run phase tests + regression.
6. Produce DB/API/UI evidence where applicable.
7. Write artifacts/evidence/p0.json.
8. Do not claim acceptance if Hard Gate is not proven.
9. Preserve known-good earlier phases.
```

## P1 — Foundation Truth Core

E01~E07, S09/S10/S11 최소 골격.

**필수 산출물**

- raw storage
- canonical identity
- provenance
- time/frame
- snapshot
- knowledge graph

**Hard Gate:** source→snapshot reproducible.

**Claude Code 실행 패턴**

```text

PHASE: P1 Foundation Truth Core
1. Read master + relevant domain/engine specs.
2. Audit existing implementation before editing.
3. Write exact file/module/test change plan.
4. Implement smallest complete vertical slice.
5. Run phase tests + regression.
6. Produce DB/API/UI evidence where applicable.
7. Write artifacts/evidence/p1.json.
8. Do not claim acceptance if Hard Gate is not proven.
9. Preserve known-good earlier phases.
```

## P2 — SPACE Core

E08~E12 + 기본 SPACE API.

**필수 산출물**

- ephemeris
- celestial events
- space weather context
- NEO
- deep-space mission

**Hard Gate:** Earth→Solar System data path.

**Claude Code 실행 패턴**

```text

PHASE: P2 SPACE Core
1. Read master + relevant domain/engine specs.
2. Audit existing implementation before editing.
3. Write exact file/module/test change plan.
4. Implement smallest complete vertical slice.
5. Run phase tests + regression.
6. Produce DB/API/UI evidence where applicable.
7. Write artifacts/evidence/p2.json.
8. Do not claim acceptance if Hard Gate is not proven.
9. Preserve known-good earlier phases.
```

## P3 — Multi-Scale Visual Foundation

E34~E37.

**필수 산출물**

- Earth/Orbital/Cislunar/Solar scene
- semantic zoom
- shell LOD
- visual semantics

**Hard Gate:** no fake visual data; scale transition tests.

**Claude Code 실행 패턴**

```text

PHASE: P3 Multi-Scale Visual Foundation
1. Read master + relevant domain/engine specs.
2. Audit existing implementation before editing.
3. Write exact file/module/test change plan.
4. Implement smallest complete vertical slice.
5. Run phase tests + regression.
6. Produce DB/API/UI evidence where applicable.
7. Write artifacts/evidence/p3.json.
8. Do not claim acceptance if Hard Gate is not proven.
9. Preserve known-good earlier phases.
```

## P4 — Mission Registry & Pre-Launch Control

E13~E15.

**필수 산출물**

- mission registry
- launch windows
- countdown/state machine
- basic control widgets

**Hard Gate:** schedule revisions + state transitions.

**Claude Code 실행 패턴**

```text

PHASE: P4 Mission Registry & Pre-Launch Control
1. Read master + relevant domain/engine specs.
2. Audit existing implementation before editing.
3. Write exact file/module/test change plan.
4. Implement smallest complete vertical slice.
5. Run phase tests + regression.
6. Produce DB/API/UI evidence where applicable.
7. Write artifacts/evidence/p4.json.
8. Do not claim acceptance if Hard Gate is not proven.
9. Preserve known-good earlier phases.
```

## P5 — Live/Modelled Mission Tracking

E16~E19.

**필수 산출물**

- telemetry fusion
- trajectory
- timeline recorder
- replay
- handover

**Hard Gate:** mission→orbit E2E.

**Claude Code 실행 패턴**

```text

PHASE: P5 Live/Modelled Mission Tracking
1. Read master + relevant domain/engine specs.
2. Audit existing implementation before editing.
3. Write exact file/module/test change plan.
4. Implement smallest complete vertical slice.
5. Run phase tests + regression.
6. Produce DB/API/UI evidence where applicable.
7. Write artifacts/evidence/p5.json.
8. Do not claim acceptance if Hard Gate is not proven.
9. Preserve known-good earlier phases.
```

## P6 — Orbital Core

E20~E24.

**필수 산출물**

- propagation
- screen/TCA
- Pc/provenance
- risk graph
- shell metrics

**Hard Gate:** golden/verification + Orbital Stack API.

**Claude Code 실행 패턴**

```text

PHASE: P6 Orbital Core
1. Read master + relevant domain/engine specs.
2. Audit existing implementation before editing.
3. Write exact file/module/test change plan.
4. Implement smallest complete vertical slice.
5. Run phase tests + regression.
6. Produce DB/API/UI evidence where applicable.
7. Write artifacts/evidence/p6.json.
8. Do not claim acceptance if Hard Gate is not proven.
9. Preserve known-good earlier phases.
```

## P7 — Debris & Observation

E25~E30.

**필수 산출물**

- genealogy
- fragmentation
- reentry
- photometry
- observation planner
- citizen QA

**Hard Gate:** research/safety gates.

**Claude Code 실행 패턴**

```text

PHASE: P7 Debris & Observation
1. Read master + relevant domain/engine specs.
2. Audit existing implementation before editing.
3. Write exact file/module/test change plan.
4. Implement smallest complete vertical slice.
5. Run phase tests + regression.
6. Produce DB/API/UI evidence where applicable.
7. Write artifacts/evidence/p7.json.
8. Do not claim acceptance if Hard Gate is not proven.
9. Preserve known-good earlier phases.
```

## P8 — Counterfactual Patent Core

E31~E33.

**필수 산출물**

- Benefit
- Affected Subgraph
- PROTECT/OCM

**Hard Gate:** full-vs-selective equivalence + new risk.

**Claude Code 실행 패턴**

```text

PHASE: P8 Counterfactual Patent Core
1. Read master + relevant domain/engine specs.
2. Audit existing implementation before editing.
3. Write exact file/module/test change plan.
4. Implement smallest complete vertical slice.
5. Run phase tests + regression.
6. Produce DB/API/UI evidence where applicable.
7. Write artifacts/evidence/p8.json.
8. Do not claim acceptance if Hard Gate is not proven.
9. Preserve known-good earlier phases.
```

## P9 — Intelligence Foundation

E38~E40.

**필수 산출물**

- orchestrator
- fusion
- classification

**Hard Gate:** engine outputs become classified traceable signals.

**Claude Code 실행 패턴**

```text

PHASE: P9 Intelligence Foundation
1. Read master + relevant domain/engine specs.
2. Audit existing implementation before editing.
3. Write exact file/module/test change plan.
4. Implement smallest complete vertical slice.
5. Run phase tests + regression.
6. Produce DB/API/UI evidence where applicable.
7. Write artifacts/evidence/p9.json.
8. Do not claim acceptance if Hard Gate is not proven.
9. Preserve known-good earlier phases.
```

## P10 — Event / Revision / Confidence

E41~E43.

**필수 산출물**

- event lifecycle
- revision
- confidence
- uncertainty

**Hard Gate:** WHAT CHANGED/HOW SURE E2E.

**Claude Code 실행 패턴**

```text

PHASE: P10 Event / Revision / Confidence
1. Read master + relevant domain/engine specs.
2. Audit existing implementation before editing.
3. Write exact file/module/test change plan.
4. Implement smallest complete vertical slice.
5. Run phase tests + regression.
6. Produce DB/API/UI evidence where applicable.
7. Write artifacts/evidence/p10.json.
8. Do not claim acceptance if Hard Gate is not proven.
9. Preserve known-good earlier phases.
```

## P11 — Why / Attribution / Decision

E44.

**필수 산출물**

- importance
- why-it-matters
- attribution
- decision compare

**Hard Gate:** SPACE NOW + Scenario decision packet.

**Claude Code 실행 패턴**

```text

PHASE: P11 Why / Attribution / Decision
1. Read master + relevant domain/engine specs.
2. Audit existing implementation before editing.
3. Write exact file/module/test change plan.
4. Implement smallest complete vertical slice.
5. Run phase tests + regression.
6. Produce DB/API/UI evidence where applicable.
7. Write artifacts/evidence/p11.json.
8. Do not claim acceptance if Hard Gate is not proven.
9. Preserve known-good earlier phases.
```

## P12 — Personalization & Subscription

S02~S04.

**필수 산출물**

- capability
- MY AETHERUS
- Control Rooms
- Follow/Alerts

**Hard Gate:** Free/Plus/Pro behavior tests.

**Claude Code 실행 패턴**

```text

PHASE: P12 Personalization & Subscription
1. Read master + relevant domain/engine specs.
2. Audit existing implementation before editing.
3. Write exact file/module/test change plan.
4. Implement smallest complete vertical slice.
5. Run phase tests + regression.
6. Produce DB/API/UI evidence where applicable.
7. Write artifacts/evidence/p12.json.
8. Do not claim acceptance if Hard Gate is not proven.
9. Preserve known-good earlier phases.
```

## P13 — LLM Layer

L01~L08.

**필수 산출물**

- gateway/router/tools/context/explanation/claim validator/reports

**Hard Gate:** LLM without hallucinated science.

**Claude Code 실행 패턴**

```text

PHASE: P13 LLM Layer
1. Read master + relevant domain/engine specs.
2. Audit existing implementation before editing.
3. Write exact file/module/test change plan.
4. Implement smallest complete vertical slice.
5. Run phase tests + regression.
6. Produce DB/API/UI evidence where applicable.
7. Write artifacts/evidence/p13.json.
8. Do not claim acceptance if Hard Gate is not proven.
9. Preserve known-good earlier phases.
```

## P14 — Research / Operations

S07/S08.

**필수 산출물**

- datasets
- benchmark
- tenant/private fleet
- audit

**Hard Gate:** tenant isolation + reproducibility.

**Claude Code 실행 패턴**

```text

PHASE: P14 Research / Operations
1. Read master + relevant domain/engine specs.
2. Audit existing implementation before editing.
3. Write exact file/module/test change plan.
4. Implement smallest complete vertical slice.
5. Run phase tests + regression.
6. Produce DB/API/UI evidence where applicable.
7. Write artifacts/evidence/p14.json.
8. Do not claim acceptance if Hard Gate is not proven.
9. Preserve known-good earlier phases.
```

## P15 — Hardening / Staging / Production

S01/S05/S06/S10~S12.

**필수 산출물**

- security
- observability
- load
- outage
- backup/restore
- device acceptance

**Hard Gate:** staging evidence then production decision.

**Claude Code 실행 패턴**

```text

PHASE: P15 Hardening / Staging / Production
1. Read master + relevant domain/engine specs.
2. Audit existing implementation before editing.
3. Write exact file/module/test change plan.
4. Implement smallest complete vertical slice.
5. Run phase tests + regression.
6. Produce DB/API/UI evidence where applicable.
7. Write artifacts/evidence/p15.json.
8. Do not claim acceptance if Hard Gate is not proven.
9. Preserve known-good earlier phases.
```

