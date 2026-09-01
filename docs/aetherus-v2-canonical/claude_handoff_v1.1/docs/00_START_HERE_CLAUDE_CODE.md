# AETHERUS V2 — CLAUDE CODE START HERE


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

## Intelligence 연결 경계 — 반드시 먼저 읽기

모든 E01~E44 엔진이 Intelligence에 직접 연결되는 것이 아니다. 구현 전 `docs/18_INTELLIGENCE_CONNECTION_MATRIX.md`와 `AETHERUS_V2_INTELLIGENCE_CONNECTION_MATRIX.csv`를 읽고 `DIRECT_SIGNAL / EVIDENCE_PROVIDER / CONTEXT_ONLY / INTELLIGENCE_TOOL / COMPUTE_HELPER / CONSUMER_ONLY / INTELLIGENCE_CORE` 경계를 지켜야 한다. UI/Subscription/LLM은 scientific result를 변경할 수 없다.

## Claude Code 최초 실행 순서

아래 순서를 변경하지 않는다.

```text
STEP 0  repository/root 확인
STEP 1  git status / branch / HEAD / remotes / uncommitted files 기록
STEP 2  기존 docs/source_materials 전수 인덱싱
STEP 3  기존 구현을 E01~E44/S01~S12/L01~L08에 mapping
STEP 4  REUSE / MIGRATE / NEW / RETIRE / BLOCKED 판정표 생성
STEP 5  Phase P0 audit 결과를 사용자에게 보고
STEP 6  사용자가 별도 제한하지 않았다면 가장 앞의 unblocked phase부터 구현
STEP 7  각 phase마다 test + evidence + regression
STEP 8  Phase gate가 닫히기 전 다음 phase 완료 선언 금지
```

### 최초 생성해야 할 감사 산출물

- `artifacts/audit/REPOSITORY_BASELINE.md`
- `artifacts/audit/GIT_STATE.json`
- `artifacts/audit/ENGINE_IMPLEMENTATION_MATRIX.csv`
- `artifacts/audit/LEGACY_REUSE_MAP.md`
- `artifacts/audit/MISSING_INPUTS.md`
- `artifacts/audit/PHASE_READINESS.md`

### Claude Code 응답 형식

모든 작업 응답은 최소 다음을 포함한다.

1. 현재 Phase / Engine ID
2. 변경한 파일
3. 실제 실행한 명령
4. 테스트 결과
5. DB/API/UI evidence
6. known limitations
7. blockers
8. evidence manifest path
9. commit 여부/commit SHA (커밋을 수행한 경우)
10. 다음 unblocked task

**절대 금지:** 확인하지 않은 항목을 PASS로 쓰지 않는다. 브라우저/실기기/API/provider 접근이 불가능하면 `UNVERIFIED` 또는 `BLOCKED`로 둔다.

## 읽기 순서

1. `01_AETHERUS_V2_MASTER_PRODUCT_SYSTEM_SPEC.md`
2. `02_ENGINE_REGISTRY_E01_E44.md`
3. `03_INTELLIGENCE_CORE_E38_E44.md`
4. `04_LLM_LAYER_L01_L08.md`
5. `05_SPACE_SOLAR_SYSTEM_SPEC.md`
6. `06_CONTROL_MISSION_CONTROL_SPEC.md`
7. `07_ORBITAL_ENVIRONMENT_DEBRIS_SPEC.md`
8. `08_VISUAL_UI_UX_SYSTEM_SPEC.md`
9. `09_DATA_DB_API_CONTRACTS.md`
10. `10_SUBSCRIPTION_PERSONALIZATION_RBAC.md`
11. `11_TEST_ACCEPTANCE_EVIDENCE.md`
12. `12_IMPLEMENTATION_PHASES_CLAUDE_CODE.md`
13. `13_DEPLOYMENT_OPERATIONS_SECURITY.md`
14. `14_IP_PATENT_BOUNDARY_TRACEABILITY.md`
15. `15_REPOSITORY_STRUCTURE_AND_CODE_CONTRACTS.md`
16. `16_FINAL_HANDOFF_CHECKLIST.md`
