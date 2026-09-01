# AETHERUS V2 — PLATFORM SERVICES S01~S12


## 문서의 출처와 권위

이 패키지는 다음 세 첨부 문서를 우선 기반으로 재구성한다.

1. `Aetherus_Orbital_Environment_개발지침서_v1.1_초상세본.docx` — 기존 Orbital Environment/SSA/STM/Debris 엔진, DB/API/테스트/Hard Gate의 1차 source.
2. `Aetherus_우주물체_개입효과_특허명세서_마스터_v2.0.docx` — Baseline/Counterfactual Risk Graph, Beneficiary Attribution, PROTECT, Affected Subgraph, Risk Provenance, Candidate OCM, validation gate의 권리/기술 source.
3. `EARTHUS_AETHERUS_INTELLIGENCE_CONCEPT_MASTER_v1.0_KO.docx` — Engine/AI/Intelligence/LLM 계층 분리, Evidence/Event/Revision/Confidence/Uncertainty/Counterfactual/Attribution의 source.

이 문서에서 **[SOURCE-DERIVED]**는 위 자료의 구조를 유지·통합한 항목이고, **[V2-NEW]**는 사용자가 이번 대화에서 확정한 Aetherus V2 범위(태양계, 발사관제, 우주쓰레기, 멀티스케일 UX, 구독, LLM)와 이를 구현하기 위한 신규 설계다. **[VALIDATE]**는 실제 provider/API/라이선스/FTO/운영환경 확인 후 확정해야 한다.

기존 문서의 `Codex` 표기는 레거시 실행대상이다. **Aetherus V2의 기본 구현·인수인계 대상은 Claude Code**이며, 기존 Codex 지시는 동일한 안전원칙을 유지하되 Claude Code 실행 계약으로 대체한다.

## S01 — API Gateway / Auth / Request Envelope

request_id/generated_at/data_status/provenance/warnings 공통 envelope, auth, rate limit.

**공통 구현 요구**

- domain/science truth와 presentation convenience를 분리한다.
- audit/request id를 유지한다.
- capability/security/license를 server-side에서 enforce한다.
- failure를 UI에서 숨기지 않고 적절한 data_status로 전달한다.
- unit/integration/security evidence를 생성한다.

## S02 — Subscription Capability Service

Free/Plus/Pro/Control/Operations/Removal의 capability 기반 권한; 코드 전역 plan 조건문 금지.

**공통 구현 요구**

- domain/science truth와 presentation convenience를 분리한다.
- audit/request id를 유지한다.
- capability/security/license를 server-side에서 enforce한다.
- failure를 UI에서 숨기지 않고 적절한 data_status로 전달한다.
- unit/integration/security evidence를 생성한다.

## S03 — Workspace / Widget / Control Room Service

Personal/Team Control Room, adaptive widget layout, workspace templates.

**공통 구현 요구**

- domain/science truth와 presentation convenience를 분리한다.
- audit/request id를 유지한다.
- capability/security/license를 server-side에서 enforce한다.
- failure를 UI에서 숨기지 않고 적절한 data_status로 전달한다.
- unit/integration/security evidence를 생성한다.

## S04 — Follow / Alert Service

Object/Mission/Event/Shell follow와 Revision/Confidence/Window 변화 기반 Intelligence alert.

**공통 구현 요구**

- domain/science truth와 presentation convenience를 분리한다.
- audit/request id를 유지한다.
- capability/security/license를 server-side에서 enforce한다.
- failure를 UI에서 숨기지 않고 적절한 data_status로 전달한다.
- unit/integration/security evidence를 생성한다.

## S05 — Search / Discovery Service

object/mission/event/archive 통합 검색, canonical ID/alias 지원.

**공통 구현 요구**

- domain/science truth와 presentation convenience를 분리한다.
- audit/request id를 유지한다.
- capability/security/license를 server-side에서 enforce한다.
- failure를 UI에서 숨기지 않고 적절한 data_status로 전달한다.
- unit/integration/security evidence를 생성한다.

## S06 — Media / Live Stream Resolver

공식 영상/이미지/라이선스/stream embed metadata를 과학 상태와 분리 관리.

**공통 구현 요구**

- domain/science truth와 presentation convenience를 분리한다.
- audit/request id를 유지한다.
- capability/security/license를 server-side에서 enforce한다.
- failure를 UI에서 숨기지 않고 적절한 data_status로 전달한다.
- unit/integration/security evidence를 생성한다.

## S07 — Research Dataset / Benchmark Service

versioned dataset, Parquet/CSV/JSON, hash/license manifest, benchmark reproducibility.

**공통 구현 요구**

- domain/science truth와 presentation convenience를 분리한다.
- audit/request id를 유지한다.
- capability/security/license를 server-side에서 enforce한다.
- failure를 UI에서 숨기지 않고 적절한 data_status로 전달한다.
- unit/integration/security evidence를 생성한다.

## S08 — Operations / Tenant / Audit Service

private fleet, tenant isolation, audit, advisory-only operations.

**공통 구현 요구**

- domain/science truth와 presentation convenience를 분리한다.
- audit/request id를 유지한다.
- capability/security/license를 server-side에서 enforce한다.
- failure를 UI에서 숨기지 않고 적절한 data_status로 전달한다.
- unit/integration/security evidence를 생성한다.

## S09 — Job Queue / Scheduler

ingest/propagate/screen/scenario/replay/report async jobs, idempotency, retries.

**공통 구현 요구**

- domain/science truth와 presentation convenience를 분리한다.
- audit/request id를 유지한다.
- capability/security/license를 server-side에서 enforce한다.
- failure를 UI에서 숨기지 않고 적절한 data_status로 전달한다.
- unit/integration/security evidence를 생성한다.

## S10 — Observability / Evidence Manifest

metrics/logs/traces + phase evidence JSON. UI가 보이는 것과 제품 DONE을 분리.

**공통 구현 요구**

- domain/science truth와 presentation convenience를 분리한다.
- audit/request id를 유지한다.
- capability/security/license를 server-side에서 enforce한다.
- failure를 UI에서 숨기지 않고 적절한 data_status로 전달한다.
- unit/integration/security evidence를 생성한다.

## S11 — Security / License / Data Governance

secret manager, provider terms, private ephemeris, retention, license access policy.

**공통 구현 요구**

- domain/science truth와 presentation convenience를 분리한다.
- audit/request id를 유지한다.
- capability/security/license를 server-side에서 enforce한다.
- failure를 UI에서 숨기지 않고 적절한 data_status로 전달한다.
- unit/integration/security evidence를 생성한다.

## S12 — Deployment / Backup / DR

dev compose, staging, prod orchestration, backup restore, incident runbook.

**공통 구현 요구**

- domain/science truth와 presentation convenience를 분리한다.
- audit/request id를 유지한다.
- capability/security/license를 server-side에서 enforce한다.
- failure를 UI에서 숨기지 않고 적절한 data_status로 전달한다.
- unit/integration/security evidence를 생성한다.

