# AETHERUS V2 — INTELLIGENCE CONNECTION MATRIX & BOUNDARY CONTRACT

## 목적

Aetherus V2의 모든 엔진을 Intelligence에 무조건 직접 연결하지 않는다. **Intelligence가 전체 제품 흐름을 총괄하되, 과학 판단 입력/근거/문맥/시뮬레이션 도구/표현/인프라의 권한을 분리**한다. 이 경계는 Claude Code가 임의 변경할 수 없는 canonical contract다.

## 연결 모드 7종

1. **DIRECT_SIGNAL** — 실제 또는 파생된 도메인 signal을 Intelligence에 공급한다. Event 후보/Revision으로 승격되기 전 반드시 Signal Gate/Evidence/Validation을 통과한다.
2. **EVIDENCE_PROVIDER** — 원문·provenance·QA accepted measurement·기록을 공급한다. 독립적으로 Product Event를 만들 수 없다.
3. **CONTEXT_ONLY** — ID/시간/좌표/Snapshot/Knowledge Graph 같은 문맥을 제공한다. 위험·중요도·Confidence를 임의 판단하지 않는다.
4. **INTELLIGENCE_TOOL** — Intelligence 또는 명시적 사용자 시나리오가 호출한다. Observation planning, Fragmentation simulation, Benefit, PROTECT 같은 연구/의사결정 계산이며 observed fact로 승격할 수 없다.
5. **COMPUTE_HELPER** — 상위 과학 엔진의 내부 계산/최적화 도우미다. E32 Affected Subgraph처럼 직접 Intelligence output이 되지 않는다.
6. **CONSUMER_ONLY** — 3D/Camera/LOD/Visual semantics처럼 Intelligence를 표현만 한다. presentation이 과학 결과를 바꿀 권한이 없다.
7. **INTELLIGENCE_CORE** — E38~E44. orchestration/fusion/signal promotion/event/revision/confidence/importance/attribution을 담당하되 Domain Engine의 과학 계산을 복제하지 않는다.

Platform S01~S12 중 Auth/Subscription/Billing/Queue/Deployment 등은 **INFRA_ONLY** 또는 **INTELLIGENCE_CONSUMER**이며 scientific Intelligence를 변경할 수 없다. LLM L01~L08은 **LLM_INTERFACE**로 분류하고 Intelligence Packet/approved tools만 소비한다.

## 절대 경계

- UI/Subscription/RBAC/Widget/LLM은 `risk`, `Pc`, `TCA`, `Confidence`, `Uncertainty`, `Benefit`, `PROTECT rank`를 임의 생성·수정할 수 없다.
- `DIRECT_SIGNAL`의 모든 periodic update가 Event가 되는 것이 아니다. `Signal Gate → Cross Validation → Event Correlation`을 통과한다.
- `INTELLIGENCE_TOOL` 결과는 `SIMULATION_ONLY`, `COUNTERFACTUAL`, `ATTRIBUTION_RESULT` 등 명확한 EvidenceClass로 저장한다.
- Replay/Reconstruction이 현재 현실 Event를 새로 생성하면 실패다.
- Visual LOD로 숨겨진 객체를 과학 계산 대상에서 자동 제외하면 실패다.
- Infrastructure 장애/구독등급은 scientific confidence를 높이거나 낮추지 않는다. 단, source freshness/coverage 같은 실제 Evidence 상태는 E39/E43을 통해 반영 가능하다.

## Signal Gate 표준

```text
DOMAIN ENGINE OUTPUT
        ↓
EvidenceClass + Provenance + Time + Object Identity
        ↓
Change/Threshold/Pattern Gate
        ↓
E39 Cross Validation / Evidence Fusion
        ↓
E40 Signal Classification / Promotion Policy
        ↓
E41 Event Correlation
        ↓
E42 Revision
        ↓
E43 Confidence / Uncertainty
        ↓
E44 Importance / Why-it-matters
```

예: 30,000개의 orbit periodic update가 들어와도 30,000개의 Event를 만들지 않는다. 변경·잔차·근접관계 등 정책에 의해 notable signal로 축소된 뒤 Event 후보가 된다.

## E01~E44 Matrix

| ID | Domain | Engine | Mode | Event seed | Revision | Confidence | Uncertainty | Intel invokes | Intel consumer |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| E01 | FOUNDATION | Source Ingestion & Raw Artifact Engine | **EVIDENCE_PROVIDER** | - | - | Y | Y | - | - |
| E02 | FOUNDATION | Canonical Object Identity Engine | **CONTEXT_ONLY** | - | - | - | - | - | - |
| E03 | FOUNDATION | Evidence & Provenance Engine | **EVIDENCE_PROVIDER** | - | - | Y | Y | - | - |
| E04 | FOUNDATION | Universal Space Time Engine | **CONTEXT_ONLY** | - | - | - | - | - | - |
| E05 | FOUNDATION | Coordinate & Reference Frame Engine | **CONTEXT_ONLY** | - | - | - | Y | - | - |
| E06 | FOUNDATION | Digital State / Snapshot / Version Engine | **CONTEXT_ONLY** | - | Y | Y | Y | - | - |
| E07 | FOUNDATION | Space Knowledge Graph & Archive Engine | **CONTEXT_ONLY** | - | - | Y | - | - | - |
| E08 | SPACE | Solar System Ephemeris Engine | **DIRECT_SIGNAL** | - | Y | Y | Y | - | - |
| E09 | SPACE | Celestial Event Engine | **DIRECT_SIGNAL** | Y | Y | Y | Y | - | - |
| E10 | SPACE | Solar / Space Weather Context Engine | **DIRECT_SIGNAL** | Y | Y | Y | Y | - | - |
| E11 | SPACE | NEO / Small Body Tracking Engine | **DIRECT_SIGNAL** | Y | Y | Y | Y | - | - |
| E12 | SPACE | Deep-Space Mission Tracking Engine | **DIRECT_SIGNAL** | Y | Y | Y | Y | - | - |
| E13 | CONTROL | Mission Registry Engine | **CONTEXT_ONLY** | - | - | Y | - | - | - |
| E14 | CONTROL | Launch Schedule / Window Engine | **DIRECT_SIGNAL** | Y | Y | Y | - | - | - |
| E15 | CONTROL | Launch State Machine & Countdown Engine | **DIRECT_SIGNAL** | Y | Y | Y | - | - | - |
| E16 | CONTROL | Telemetry Fusion Engine | **DIRECT_SIGNAL** | Y | Y | Y | Y | - | - |
| E17 | CONTROL | Launch Trajectory / Flight Dynamics Adapter Engine | **DIRECT_SIGNAL** | Y | Y | Y | Y | - | - |
| E18 | CONTROL | Mission Timeline & Recorder Engine | **EVIDENCE_PROVIDER** | - | Y | Y | - | - | - |
| E19 | CONTROL | Mission Replay & Mission-to-Orbit Handover Engine | **CONTEXT_ONLY** | - | - | Y | - | - | - |
| E20 | ORBIT | Orbit Propagation & Frames Engine | **DIRECT_SIGNAL** | Y | Y | Y | Y | - | - |
| E21 | ORBIT | Conjunction Screening & Precise TCA Engine | **DIRECT_SIGNAL** | Y | Y | Y | Y | - | - |
| E22 | ORBIT | Collision Probability & Risk Provenance Engine | **DIRECT_SIGNAL** | Y | Y | Y | Y | - | - |
| E23 | ORBIT | Risk Graph Engine | **DIRECT_SIGNAL** | Y | Y | Y | Y | - | - |
| E24 | ORBIT | Orbital Environment / Congestion Engine | **DIRECT_SIGNAL** | Y | Y | Y | Y | - | - |
| E25 | ORBIT | Debris Genealogy / Origin Engine | **CONTEXT_ONLY** | - | - | Y | Y | - | - |
| E26 | ORBIT | Fragmentation Scenario Engine | **INTELLIGENCE_TOOL** | - | - | Y | Y | Y | - |
| E27 | ORBIT | Re-entry Intelligence Engine | **DIRECT_SIGNAL** | Y | Y | Y | Y | - | - |
| E28 | ORBIT | Photometry / Rotation Intelligence Engine | **DIRECT_SIGNAL** | Y | Y | Y | Y | - | - |
| E29 | ORBIT | Observation Planning Engine | **INTELLIGENCE_TOOL** | - | - | Y | Y | Y | - |
| E30 | ORBIT | Citizen Observation QA & Contribution Engine | **EVIDENCE_PROVIDER** | - | Y | Y | Y | - | - |
| E31 | ORBIT | Intervention Benefit / Counterfactual Engine | **INTELLIGENCE_TOOL** | - | - | Y | Y | Y | - |
| E32 | ORBIT | Affected Subgraph Engine | **COMPUTE_HELPER** | - | - | - | Y | - | - |
| E33 | ORBIT | PROTECT Reverse Query & Candidate OCM Comparison Engine | **INTELLIGENCE_TOOL** | - | - | Y | Y | Y | - |
| E34 | VISUAL | Multi-Scale Space Scene Engine | **CONSUMER_ONLY** | - | - | - | - | - | Y |
| E35 | VISUAL | Semantic Zoom / Camera Focus Engine | **CONSUMER_ONLY** | - | - | - | - | - | Y |
| E36 | VISUAL | Orbital Shell & LOD Engine | **CONSUMER_ONLY** | - | - | - | - | - | Y |
| E37 | VISUAL | Visual Semantics Engine | **CONSUMER_ONLY** | - | - | - | - | - | Y |
| E38 | INTELLIGENCE | Aetherus Intelligence Orchestrator | **INTELLIGENCE_CORE** | Y | Y | - | - | Y | - |
| E39 | INTELLIGENCE | Evidence Fusion & Cross Validation Intelligence | **INTELLIGENCE_CORE** | - | Y | Y | Y | - | - |
| E40 | INTELLIGENCE | Signal Classification Intelligence | **INTELLIGENCE_CORE** | Y | Y | Y | Y | - | - |
| E41 | INTELLIGENCE | Event Intelligence Engine | **INTELLIGENCE_CORE** | Y | Y | Y | Y | - | - |
| E42 | INTELLIGENCE | Revision Intelligence Engine | **INTELLIGENCE_CORE** | - | Y | Y | Y | - | - |
| E43 | INTELLIGENCE | Confidence & Uncertainty Intelligence Engine | **INTELLIGENCE_CORE** | - | Y | Y | Y | - | - |
| E44 | INTELLIGENCE | Importance / Why-It-Matters / Attribution & Decision Intelligence Engine | **INTELLIGENCE_CORE** | - | Y | Y | Y | Y | - |

## Claude Code 구현 규칙

각 Engine implementation card와 runtime manifest에 아래 계약을 추가한다.

```yaml
intelligence_connection:
  mode: DIRECT_SIGNAL | EVIDENCE_PROVIDER | CONTEXT_ONLY | INTELLIGENCE_TOOL | COMPUTE_HELPER | CONSUMER_ONLY | INTELLIGENCE_CORE
  produces_intelligence_signal: true|false
  may_seed_event_candidate: true|false
  may_drive_event_revision: true|false
  may_affect_confidence: true|false
  may_affect_uncertainty: true|false
  may_be_invoked_by_intelligence: true|false
  consumes_intelligence_for_presentation: true|false
  requires_signal_gate: true|false
  may_change_scientific_result_from_subscription_or_ui: false
```

### Runtime enforcement

- 직접 DB 접근으로 이 경계를 우회하지 않는다.
- Event Service는 `may_seed_event_candidate=false` 엔진의 직접 Event create 요청을 거부한다.
- Confidence Service는 capability matrix상 허용되지 않은 UI/Subscription/Consumer source를 factor로 거부한다.
- Simulation/Counterfactual tool은 현실 Event store와 별도 namespace/class를 강제한다.
- E34~E37은 read-only Intelligence Packet/ViewModel을 소비한다.
- LLM은 E38~E44 및 승인된 Domain Tool API만 호출하며 DB/worker를 직접 제어하지 않는다.

## Acceptance Boundary Tests

- `DIRECT_SIGNAL`: Signal Gate 우회 Event 생성 실패 검증.
- `CONTEXT_ONLY`: Event/Confidence 직접 mutation 403/domain rejection 검증.
- `INTELLIGENCE_TOOL`: Counterfactual 결과를 OBSERVED로 저장하려 하면 실패.
- `COMPUTE_HELPER`: helper 결과를 Intelligence Packet에 직접 노출하면 schema test 실패.
- `CONSUMER_ONLY`: UI/LOD/Subscription 변경 전후 scientific result hash 동일.
- `LLM_INTERFACE`: tool 결과에 없는 수치 claim은 Claim Validator에서 reject/qualify.

이 문서와 `AETHERUS_V2_INTELLIGENCE_CONNECTION_MATRIX.csv`, `AETHERUS_V2_ENGINE_REGISTRY.yaml`이 서로 불일치하면 **더 엄격한 권한을 우선 적용하고 BLOCKED로 보고**한다.
