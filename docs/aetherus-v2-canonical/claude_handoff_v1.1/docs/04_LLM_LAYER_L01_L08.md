# AETHERUS V2 — LLM LAYER L01~L08


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

## 원칙

LLM은 Aetherus의 계산 두뇌가 아니다. Aetherus의 source of truth는 Data/Evidence/Engine/Intelligence다. LLM은 질문을 이해하고 필요한 Intelligence Tool을 호출하고 결과를 설명·탐색·보고서화하며, UI/카메라/시간을 자연어로 제어할 수 있다.

### LLM이 직접 하면 안 되는 것

- 궤도/ephemeris/TCA/Pc 계산
- re-entry exact time 생성
- live telemetry 합성
- Benefit/PROTECT 순위 생성
- Confidence 임의 산출
- official/observed 상태 선언
- 근거 없는 안전/위험/충돌 확정

## 공통 Tool 계약

```text
get_object
get_current_state
get_space_state
get_mission
get_launch_status
get_event
get_event_revisions
get_evidence
get_conjunction
get_reentry
get_orbital_environment
get_archive
compare_time
create_scenario
run_scenario
get_benefits
get_protect_candidates
set_focus
set_time_cursor
set_workspace
```

Tool은 capability + role + data access policy를 검사한다. LLM provider에 private ephemeris나 민감 데이터를 무조건 전달하지 않고 tenant/policy에 따라 server-side tool result를 최소화한다.

## Claim validation pipeline

```text
DRAFT ANSWER
   ↓
extract factual claims
   ↓
map claim → evidence/intelligence field
   ↓
validation state / allowed_claims check
   ↓
unsupported high-risk claim? → remove/soften
   ↓
attach source/evidence reference
   ↓
FINAL ANSWER
```

예: `충돌합니다`는 대부분 금지. `현재 공개 GP 기반 screening에서 근접사건 후보로 유지되며, covariance가 없어 Pc는 제공되지 않습니다`는 Intelligence Packet이 이를 지원할 때 허용.

## L01 — LLM Gateway

**목적:** OpenAI/Claude/Gemini/enterprise/local 등 모델 공급자를 교체 가능하게 추상화하고 Aetherus 지식의 source of truth를 모델 자체에 두지 않는다.

**Claude Code 구현 요구**

- provider-neutral interface와 concrete adapter를 분리한다.
- 모든 tool call에 request_id/user/workspace/capability/audit context를 포함한다.
- streaming 응답과 tool execution trace를 저장하되 secret/raw private data를 로그에서 제거한다.
- LLM 장애가 Engine/Intelligence pipeline을 중단시키지 않도록 별도 timeout/circuit breaker를 둔다.
- 질문에 최신 데이터가 필요한 경우 항상 Aetherus tool을 우선하고 모델 기억을 사실 source로 사용하지 않는다.
- 비용/latency/token usage를 model/provider/feature별 metric으로 기록한다.

**필수 테스트**

- tool 결과가 없는 숫자 hallucination 차단
- SCREENING_ONLY claim guardrail
- private tenant context leakage 방지
- provider fallback
- same Intelligence Packet → semantically consistent summary

---

## L02 — Model Router

**목적:** 질문 난이도·비용·지연·구독 등급에 따라 template/fast/standard/reasoning 경로를 선택한다.

**Claude Code 구현 요구**

- provider-neutral interface와 concrete adapter를 분리한다.
- 모든 tool call에 request_id/user/workspace/capability/audit context를 포함한다.
- streaming 응답과 tool execution trace를 저장하되 secret/raw private data를 로그에서 제거한다.
- LLM 장애가 Engine/Intelligence pipeline을 중단시키지 않도록 별도 timeout/circuit breaker를 둔다.
- 질문에 최신 데이터가 필요한 경우 항상 Aetherus tool을 우선하고 모델 기억을 사실 source로 사용하지 않는다.
- 비용/latency/token usage를 model/provider/feature별 metric으로 기록한다.

**필수 테스트**

- tool 결과가 없는 숫자 hallucination 차단
- SCREENING_ONLY claim guardrail
- private tenant context leakage 방지
- provider fallback
- same Intelligence Packet → semantically consistent summary

---

## L03 — Tool Orchestrator

**목적:** LLM이 Aetherus API/Intelligence tool을 호출하도록 하되 과학 계산은 엔진에 위임하고 tool permission을 capability로 제어한다.

**Claude Code 구현 요구**

- provider-neutral interface와 concrete adapter를 분리한다.
- 모든 tool call에 request_id/user/workspace/capability/audit context를 포함한다.
- streaming 응답과 tool execution trace를 저장하되 secret/raw private data를 로그에서 제거한다.
- LLM 장애가 Engine/Intelligence pipeline을 중단시키지 않도록 별도 timeout/circuit breaker를 둔다.
- 질문에 최신 데이터가 필요한 경우 항상 Aetherus tool을 우선하고 모델 기억을 사실 source로 사용하지 않는다.
- 비용/latency/token usage를 model/provider/feature별 metric으로 기록한다.

**필수 테스트**

- tool 결과가 없는 숫자 hallucination 차단
- SCREENING_ONLY claim guardrail
- private tenant context leakage 방지
- provider fallback
- same Intelligence Packet → semantically consistent summary

---

## L04 — Context Composer

**목적:** 질문과 현재 Universe State에 필요한 Event/Revision/Evidence만 최소 컨텍스트로 조립한다.

**Claude Code 구현 요구**

- provider-neutral interface와 concrete adapter를 분리한다.
- 모든 tool call에 request_id/user/workspace/capability/audit context를 포함한다.
- streaming 응답과 tool execution trace를 저장하되 secret/raw private data를 로그에서 제거한다.
- LLM 장애가 Engine/Intelligence pipeline을 중단시키지 않도록 별도 timeout/circuit breaker를 둔다.
- 질문에 최신 데이터가 필요한 경우 항상 Aetherus tool을 우선하고 모델 기억을 사실 source로 사용하지 않는다.
- 비용/latency/token usage를 model/provider/feature별 metric으로 기록한다.

**필수 테스트**

- tool 결과가 없는 숫자 hallucination 차단
- SCREENING_ONLY claim guardrail
- private tenant context leakage 방지
- provider fallback
- same Intelligence Packet → semantically consistent summary

---

## L05 — Explanation Agent

**목적:** 같은 Intelligence Packet을 일반/애호가/연구자/운영자 수준별 설명으로 변환한다.

**Claude Code 구현 요구**

- provider-neutral interface와 concrete adapter를 분리한다.
- 모든 tool call에 request_id/user/workspace/capability/audit context를 포함한다.
- streaming 응답과 tool execution trace를 저장하되 secret/raw private data를 로그에서 제거한다.
- LLM 장애가 Engine/Intelligence pipeline을 중단시키지 않도록 별도 timeout/circuit breaker를 둔다.
- 질문에 최신 데이터가 필요한 경우 항상 Aetherus tool을 우선하고 모델 기억을 사실 source로 사용하지 않는다.
- 비용/latency/token usage를 model/provider/feature별 metric으로 기록한다.

**필수 테스트**

- tool 결과가 없는 숫자 hallucination 차단
- SCREENING_ONLY claim guardrail
- private tenant context leakage 방지
- provider fallback
- same Intelligence Packet → semantically consistent summary

---

## L06 — Claim & Citation Validator

**목적:** LLM 문장의 핵심 주장마다 Evidence/ValidationState/AllowedClaim을 검사하고 근거 없는 위험·수치·확정 표현을 제거한다.

**Claude Code 구현 요구**

- provider-neutral interface와 concrete adapter를 분리한다.
- 모든 tool call에 request_id/user/workspace/capability/audit context를 포함한다.
- streaming 응답과 tool execution trace를 저장하되 secret/raw private data를 로그에서 제거한다.
- LLM 장애가 Engine/Intelligence pipeline을 중단시키지 않도록 별도 timeout/circuit breaker를 둔다.
- 질문에 최신 데이터가 필요한 경우 항상 Aetherus tool을 우선하고 모델 기억을 사실 source로 사용하지 않는다.
- 비용/latency/token usage를 model/provider/feature별 metric으로 기록한다.

**필수 테스트**

- tool 결과가 없는 숫자 hallucination 차단
- SCREENING_ONLY claim guardrail
- private tenant context leakage 방지
- provider fallback
- same Intelligence Packet → semantically consistent summary

---

## L07 — Personal / Workspace Context

**목적:** Follow, Control Room, Collection, alert preference, role/capability를 질의 문맥에 제한적으로 연결한다.

**Claude Code 구현 요구**

- provider-neutral interface와 concrete adapter를 분리한다.
- 모든 tool call에 request_id/user/workspace/capability/audit context를 포함한다.
- streaming 응답과 tool execution trace를 저장하되 secret/raw private data를 로그에서 제거한다.
- LLM 장애가 Engine/Intelligence pipeline을 중단시키지 않도록 별도 timeout/circuit breaker를 둔다.
- 질문에 최신 데이터가 필요한 경우 항상 Aetherus tool을 우선하고 모델 기억을 사실 source로 사용하지 않는다.
- 비용/latency/token usage를 model/provider/feature별 metric으로 기록한다.

**필수 테스트**

- tool 결과가 없는 숫자 hallucination 차단
- SCREENING_ONLY claim guardrail
- private tenant context leakage 방지
- provider fallback
- same Intelligence Packet → semantically consistent summary

---

## L08 — Briefing & Report Generator

**목적:** Daily Space Brief, Mission Brief, Event Report, Research/Scenario Report를 구조화된 Intelligence만으로 생성한다.

**Claude Code 구현 요구**

- provider-neutral interface와 concrete adapter를 분리한다.
- 모든 tool call에 request_id/user/workspace/capability/audit context를 포함한다.
- streaming 응답과 tool execution trace를 저장하되 secret/raw private data를 로그에서 제거한다.
- LLM 장애가 Engine/Intelligence pipeline을 중단시키지 않도록 별도 timeout/circuit breaker를 둔다.
- 질문에 최신 데이터가 필요한 경우 항상 Aetherus tool을 우선하고 모델 기억을 사실 source로 사용하지 않는다.
- 비용/latency/token usage를 model/provider/feature별 metric으로 기록한다.

**필수 테스트**

- tool 결과가 없는 숫자 hallucination 차단
- SCREENING_ONLY claim guardrail
- private tenant context leakage 방지
- provider fallback
- same Intelligence Packet → semantically consistent summary

---

