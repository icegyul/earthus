# AETHERUS V2 — FINAL BUILD LIST & CHATGPT/LOCAL EXECUTION PLAN

## 1. 최종 목표

Aetherus V2를 `SPACE + CONTROL + ORBIT`이 하나의 Persistent Universe State, Universal Space Time, Evidence/Intelligence Core, LLM interface를 공유하는 **Space Intelligence & Visual Control System**으로 완성한다.

최종 인수인계 시 Claude Code가 새 기획을 하지 않고, 이미 고정된 contract를 repository에 적용·실데이터 연결·운영배포·실기기 acceptance만 수행할 수 있는 상태를 목표로 한다.

## 2. 최종적으로 반드시 만들어야 할 제품 시스템

### A. Foundation / Truth Layer
- E01 Source Ingestion & Raw Artifact
- E02 Canonical Object Identity
- E03 Evidence & Provenance
- E04 Universal Space Time
- E05 Coordinate / Reference Frame
- E06 Digital State / Snapshot / Version
- E07 Space Knowledge Graph & Archive

### B. SPACE
- E08 Solar System Ephemeris
- E09 Celestial Event
- E10 Solar / Space Weather Context
- E11 NEO / Small Body Tracking
- E12 Deep-Space Mission Tracking
- Earth → LEO → MEO → GEO → Moon → Solar System continuous visual experience

### C. CONTROL
- E13 Mission Registry
- E14 Launch Schedule / Window
- E15 Launch State Machine & Countdown
- E16 Telemetry Fusion
- E17 Launch Trajectory / Flight Dynamics Adapter
- E18 Mission Timeline & Recorder
- E19 Mission Replay & Mission-to-Orbit Handover
- Launch Control / Mission Operations / Orbital Operations / Debris Watch / Space Weather workspaces

### D. ORBIT
- E20 Orbit Propagation
- E21 Conjunction Screening / TCA
- E22 Pc / Risk Provenance
- E23 Risk Graph
- E24 Orbital Environment / Congestion
- E25 Genealogy / Origin
- E26 Fragmentation Scenario
- E27 Re-entry
- E28 Photometry / Rotation
- E29 Observation Planning
- E30 Citizen Observation QA
- E31 Counterfactual / Intervention Benefit
- E32 Affected Subgraph
- E33 PROTECT / Candidate OCM

### E. Visual
- E34 Multi-Scale Scene
- E35 Semantic Zoom / Camera Focus
- E36 LEO/MEO/GEO Orbital Shell & LOD
- E37 Visual Semantics: Reality / Derived / Model / AI / Uncertainty / Simulation / Counterfactual

### F. Intelligence
- E38 Orchestrator
- E39 Evidence Fusion / Cross Validation
- E40 Signal Classification / Promotion Gate
- E41 Event Intelligence
- E42 Revision Intelligence
- E43 Confidence / Uncertainty
- E44 Importance / Why-it-matters / Attribution / Decision
- Intelligence Connection Matrix 및 runtime enforcement

### G. LLM
- L01 Gateway
- L02 Model Router
- L03 Approved Tool Orchestrator
- L04 Context Composer
- L05 Explanation Agent
- L06 Claim / Citation Validator
- L07 Personal Context / Subscription Context
- L08 Briefing / Report Generator
- LLM은 Intelligence Packet을 설명/탐색/조작하는 interface이며 scientific source-of-truth가 아님

### H. Platform
- S01 API/Auth
- S02 Subscription Capability
- S03 Workspace/Widget/Control Room
- S04 Follow/Alert
- S05 Search/Discovery
- S06 Media/Live Stream Resolver
- S07 Research Dataset/Benchmark
- S08 Operations/Tenant/Audit
- S09 Queue/Scheduler
- S10 Observability/Evidence Manifest
- S11 Security/License/Governance
- S12 Deployment/Backup/DR

### I. Subscription products
- Free Explorer
- Aetherus+
- Pro / Research
- Control / Institution
- Operations
- Removal Intelligence
- 안전/공공 핵심정보는 paywall로 숨기지 않고 깊이/개인화/기록/분석/워크플로우를 과금

## 3. 최종 산출물 파일군

### Canonical human specs
1. Master Product/System Spec
2. Engine Registry E01~E44
3. Intelligence Core Spec
4. Intelligence Connection Matrix & Boundary Contract
5. LLM Layer Spec
6. SPACE Solar System Spec
7. CONTROL Mission Control Spec
8. ORBIT Debris Spec
9. Visual/UI/UX Spec
10. Data/DB/API Contracts
11. Subscription/Personalization/RBAC
12. Platform Services S01~S12
13. Test/Acceptance/Evidence
14. Implementation Phases
15. Deployment/Operations/Security
16. IP/Patent Boundary/Traceability
17. Repository/Code Contracts
18. Final Handoff Checklist

### Machine-readable contracts to create/finalize
- `AETHERUS_V2_ENGINE_REGISTRY.yaml`
- `AETHERUS_V2_INTELLIGENCE_CONNECTION_MATRIX.csv`
- `AETHERUS_V2_PHASE_PLAN.yaml`
- `AETHERUS_V2_ACCEPTANCE_MATRIX.csv`
- `openapi/aetherus-v2.openapi.yaml`
- `schemas/*.json` for Evidence/Signal/Event/Revision/State/Scenario/IntelligencePacket
- `db/schema.sql` + migration plan
- `capabilities/subscription_capabilities.yaml`
- `events/event_catalog.yaml`
- `visual/visual_semantics.yaml`
- `providers/provider_registry.yaml`
- `models/model_registry.yaml`
- `security/claim_policy.yaml`

### Executable code repository to build
- web app
- scientific/domain packages
- API service
- async workers
- DB repositories/migrations
- provider adapters
- Intelligence runtime
- LLM gateway/tools
- tests/golden fixtures/benchmarks
- Docker/dev environment
- evidence generator

## 4. 지금 이 ChatGPT 환경에서 실제로 만들 수 있는 것

### 완전히 만들 수 있음
- 위 모든 canonical 문서/registry/schema/OpenAPI/SQL/JSON Schema/phase/acceptance contract
- Repository scaffold 및 대부분의 application/domain code
- Deterministic pure-core 알고리즘과 공식/고정 fixture 기반 tests
- Intelligence Orchestrator/Event/Revision/Confidence/Uncertainty/Packet runtime의 로컬 구현
- LLM Gateway/Tool contract/Claim Validator의 provider-neutral 구현
- React/TypeScript/Cesium UI skeleton과 Control/Orbit/Space 화면 컴포넌트
- LEO/MEO/GEO shell, Semantic Zoom, Universal Time, Mission Timeline의 UI/logic prototype
- Docker Compose/dev config, CI template, evidence manifest generator
- 특허 core(Benefit/PROTECT/Affected Subgraph)용 interface/algorithm/test harness
- UI reference image/prototype와 디자인 contract

### 코드까지 만들 수 있지만 운영 검증은 외부환경 필요
- CelesTrak/Space-Track/TraCSS/NASA/JAXA/ESA 등 live provider adapters
- live launch schedule/telemetry/media resolver
- true operational CDM/Pc validation
- large-catalog performance benchmark
- real object storage/Redis/Postgres production tuning
- LLM provider billing/rate-limit/failover validation

### 여기서 최종 PASS를 선언할 수 없음
- 사용자의 실제 API key/secret이 필요한 provider live acceptance
- 계약/라이선스가 필요한 데이터의 재배포 권한 확인
- 실제 운영 서버/VPC/DNS/SSL/CDN/Secret Manager 연결
- production DB/queue/object storage backup/restore drill
- 여러 실제 장비의 browser/WebGL 성능/실기기 acceptance
- 실시간 발사 중 실제 telemetry continuity 검증
- production security penetration/load/DR evidence

## 5. 여기서 제작하는 권장 순서

### WORKSTREAM 0 — Canonical freeze
- 기존 3 source document + 이번 V2 대화 확정사항 traceability 정리
- E01~E44/L01~L08/S01~S12 최종 ID freeze
- Intelligence Connection Matrix freeze
- Master/Acceptance/Phase version `v2.0-dev-contract` 고정

### WORKSTREAM 1 — Machine contracts
- JSON Schema 8종 이상
- OpenAPI
- SQL schema/migrations
- Event catalog
- Capability/RBAC policy
- Provider/model registries
- Intelligence Packet/Claim policy

### WORKSTREAM 2 — Executable foundation
- monorepo scaffold
- domain types
- DB/repository
- queue/jobs
- evidence/provenance/time/snapshot
- test/evidence harness

### WORKSTREAM 3 — SPACE + Visual
- solar ephemeris adapter interface
- multi-scale coordinate abstraction
- Earth/Orbit/Cislunar/Solar scenes
- semantic zoom
- Universal Time Bar

### WORKSTREAM 4 — CONTROL
- Mission Registry/Schedule/State Machine
- telemetry truth-vs-model contract
- trajectory/timeline/recorder/replay
- adaptive mission control dashboard
- Mission-to-Orbit handover

### WORKSTREAM 5 — ORBIT
- orbit/CA/TCA/Pc/risk graph
- LEO/MEO/GEO environment
- debris/re-entry/fragmentation/observation
- Benefit/Affected/PROTECT

### WORKSTREAM 6 — Intelligence
- signal gate
- orchestrator
- fusion/cross-validation
- event correlation
- revision delta
- confidence/uncertainty factor model
- importance/why-it-matters
- observation feedback loop
- counterfactual attribution/decision result

### WORKSTREAM 7 — LLM
- gateway/router
- approved tools
- Intelligence Packet context
- claim/citation validator
- General/Enthusiast/Research explanation depth
- ASK AETHERUS navigation/control actions

### WORKSTREAM 8 — Subscription/Workspace
- My Aetherus
- Follow/Alert
- Personal Control Room
- widgets
- Time Machine/Archive
- capability/RBAC enforcement

### WORKSTREAM 9 — Local closeout
- integration/E2E
- full-vs-affected regression
- visual state evidence
- package SHA
- known blockers
- Claude Code final deployment handoff

## 6. 최종 Claude Code에 남겨야 할 작업

가능한 경우 Claude Code에도 새 설계를 맡기지 않는다. 최종 패키지 기준으로:

1. 실제 repository/current working tree audit
2. 이미 만든 code package merge/migrate
3. 실제 API credentials/secret 주입
4. live provider acceptance
5. 실제 DB/Redis/Object Storage 연결
6. 대규모 카탈로그 benchmark/tuning
7. staging deployment
8. browser/device acceptance
9. production security/backup/DR
10. DNS/SSL/CDN/observability
11. final commit/push/release

## 7. 개발 완료의 정의

`문서가 존재함`, `UI가 렌더됨`, `테스트 몇 개가 통과함`은 완료가 아니다.

```text
REAL/OFFICIAL/FIXED INPUT
→ NORMALIZATION + PROVENANCE
→ DOMAIN ENGINE
→ INTELLIGENCE CONNECTION CONTRACT
→ STORAGE
→ API
→ UI/LLM
→ TEST
→ BENCHMARK(if applicable)
→ EVIDENCE MANIFEST
```

까지 닫힌 기능만 `DONE`이다. 운영 입력이 없어 검증하지 못한 기능은 code-complete라도 `READY_FOR_LIVE_VALIDATION`으로 남긴다.
