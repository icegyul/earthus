# AETHERUS V2 — FULL COMBINED CLAUDE CODE DEVELOPMENT DIRECTIVE

**주의:** 실행은 모듈 문서 기준. 이 파일은 검색/인수인계/인쇄용 합본이다.


<!-- BEGIN 00_START_HERE_CLAUDE_CODE.md -->

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


<!-- END 00_START_HERE_CLAUDE_CODE.md -->


<!-- BEGIN 01_AETHERUS_V2_MASTER_PRODUCT_SYSTEM_SPEC.md -->

# AETHERUS V2 — MASTER PRODUCT & SYSTEM SPECIFICATION


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

## Aetherus V2 제품 정의

**Aetherus V2 = Space Intelligence & Visual Operations System.**

세 개의 제품 축을 하나의 공간·시간·Intelligence로 통합한다.

- **SPACE** — 지구에서 멀어질수록 LEO → MEO → GEO → Cislunar → Solar System으로 이어지는 실시간/계산 가능한 우주 시각화와 Solar/Celestial/Deep-space Intelligence.
- **CONTROL** — 발사 전 일정/창구/기상/미션 정보를 시작으로 Countdown → Liftoff → Ascent → Separation → Orbit Insertion → Payload Deployment → Mission Record/Replay까지 이어지는 Visual Mission Control.
- **ORBIT** — 활동/비활성 위성, rocket body, debris, conjunction, re-entry, observation, fragmentation, Benefit/PROTECT를 다루는 Orbital Environment Intelligence.

세 모드가 공유하는 공통 축은 다음과 같다.

```text
                    AETHERUS V2

        SPACE          CONTROL          ORBIT
          \               |               /
           \              |              /
             PERSISTENT UNIVERSE STATE
                       |
               UNIVERSAL SPACE TIME
                       |
              DIGITAL STATE / SNAPSHOT
                       |
                 DOMAIN ENGINES
                       |
              INTELLIGENCE CORE
                       |
                  LLM LAYER
                       |
              VISUAL / API / REPORT
```

### 공간 UX — Spatial Ladder

```text
SOLAR SYSTEM
      ↑
CISLUNAR / MOON
      ↑
GEO
──────────────
      ↑
MEO
──────────
      ↑
LEO
───────
      ↑
EARTH
```

LEO/MEO/GEO는 단순 궤도선이 아니라 반투명 Orbital Shell/Environment Layer로 작동한다. Global에서는 shell/density/important event만, 확대하면 constellation/family/object, Object Focus에서는 해당 궤도와 관련 Event, Event Focus에서는 관계 객체와 불확실성만 강조한다.

### 시간 UX — Universal Space Time

```text
PAST ---------------- NOW ---------------- FUTURE
ARCHIVED/RECONSTRUCTED   LIVE STATE        MODEL/PREDICTED
```

모든 모드에서 동일 Time Bar를 공유한다. Mission Replay, conjunction TCA, re-entry window, solar/celestial event, scenario는 같은 시간 엔진을 사용한다.


## 제품 목표와 사용자가 경험해야 하는 핵심 문장

Aetherus V2는 "우주에 있는 점을 많이 보여주는 사이트"가 아니다. 사용자가 **어디에 있는가(WHERE), 무엇이 일어났는가(WHAT), 무엇이 바뀌었는가(CHANGE), 왜 중요한가(WHY), 얼마나 확실한가(CONFIDENCE/UNCERTAINTY), 다른 조건이면 무엇이 달라지는가(WHAT IF)**를 하나의 3D 우주에서 이해하게 한다.

### 공통 질문 문법

- `WHERE IS IT?` — 현재/선택 시점의 위치와 상태.
- `WHERE DID IT COME FROM?` — Mission, launch, parent body, fragmentation, source.
- `WHAT IS HAPPENING?` — Event.
- `WHAT CHANGED?` — Revision delta.
- `WHY DOES IT MATTER?` — Importance/Why-It-Matters packet.
- `HOW SURE ARE WE?` — Confidence + Uncertainty.
- `WHAT HAPPENS NEXT?` — 명시된 model/prediction/official forecast.
- `WHAT IF?` — Counterfactual Scenario.
- `SHOW ME THE HISTORY.` — Archive/Replay/Revision.

## One Universe / Three Modes

### SPACE

초기 진입은 Earth 중심이다. 사용자가 카메라를 뒤로 빼거나 SPACE mode를 선택하면 정보 LOD가 Earth→Orbital→Cislunar→Solar로 변한다. Solar System view에서는 모든 천체/소행성을 무조건 표시하지 않고 planets, Moon, selected missions, important events를 기본으로 하며 세부 layer는 선택형으로 연다.

### CONTROL

CONTROL은 새로운 페이지가 아니라 동일 Universe의 전문 Workspace다. 중앙 3D Earth를 유지하고 주변 패널이 Adaptive Mission Control로 전개된다. `Next Launches`, `Following`, `Mission/Event Queue`, `Live Stream`, `Mission Timeline`, `Launch Site Weather`, `Space Weather`, `Orbital Radar`, `Launch Calendar`, `Satellites Overhead`, `Debris Watch`, `System Status`, `Control Rooms`를 Widget으로 제공하되, 발사 상태에 따라 중요한 위젯이 자동 전면화된다.

### ORBIT

ORBIT에서는 LEO/MEO/GEO Orbital Stack이 중심이다. Global에서 shell, density, important events를 보고, shell을 선택하면 해당 영역만 밝아지며, object/event focus로 들어가면 관련 궤도/edge/uncertainty만 남긴다. Debris/rocket body/satellite/conjunction/re-entry/fragmentation/observation을 동일 Digital State와 Event Intelligence로 연결한다.

## Persistence 규칙

Mode가 바뀌어도 가능한 한 다음 상태를 유지한다.

```json
{
  "time_context": "NOW or replay/scenario cursor",
  "camera_context": "solar/cislunar/orbital/object/event",
  "selected_object": "nullable canonical id",
  "selected_event": "nullable event id",
  "active_workspace": "SPACE|CONTROL|ORBIT|custom",
  "layer_state": {},
  "scenario_context": null
}
```

Mode 변경은 Universe를 재생성하는 것이 아니라 **관찰 목적과 정보 LOD를 바꾸는 동작**이다.

## 제품 완료의 정의

Aetherus V2의 제품 완료는 "52개 모듈이 파일로 존재"하는 것이 아니다. 다음 체인이 최소 한 번 이상 실제/공식 fixture와 통합돼야 한다.

```text
SOURCE → RAW HASH → CANONICAL OBJECT/STATE → ENGINE RESULT → SIGNAL CLASS
→ INTELLIGENCE EVENT → REVISION/CONFIDENCE/UNCERTAINTY
→ API → 3D/UI → LLM EXPLANATION → EVIDENCE MANIFEST
```

Mission 체인은 별도로 다음을 닫는다.

```text
MISSION REGISTRY → WINDOW → COUNTDOWN → STATE/TIMELINE
→ TELEMETRY or MODELLED TRAJECTORY → RECORD → REPLAY
→ PAYLOAD/STAGE HANDOVER → ORBITAL OBJECT → ORBIT UI
```

Counterfactual 체인은 다음을 닫는다.

```text
BASELINE SNAPSHOT → SCENARIO → AFFECTED SUBGRAPH
→ RECOMPUTE → RISK DELTA → BENEFICIARY ATTRIBUTION
→ PROTECT/DECISION COMPARISON → VISUAL + REPORT
```

## 품질 등급

과학/분석 결과는 최소 다음 상태를 사용한다.

- `VALIDATED_PIPELINE`
- `PUBLIC_SCREENING`
- `SCREENING_ONLY`
- `RESEARCH_ONLY`
- `VALIDATION_PENDING`
- `INSUFFICIENT_DATA`
- `STALE`
- `UNAVAILABLE`

데이터 유무와 검증등급을 `0`이나 "안전" 같은 단순값으로 대체하지 않는다.

## 초기 비기능 목표

- catalog ID는 6자리 이상 문자열을 안전하게 수용.
- 과학 canonical storage는 PostgreSQL/PostGIS 중심; raw는 content hash 기반 object storage; cache는 재생성 가능해야 함.
- 대규모 계산은 API request thread에서 직접 실행하지 않고 async worker/job queue 사용.
- 초기 Global render에서 모든 orbit polyline을 활성화하지 않음.
- 서버/브라우저가 동일 계산을 병행하면 algorithm/version sync evidence가 있어야 함.
- 모든 비동기 run은 `RUNNING/SUCCEEDED/FAILED/PARTIAL` 또는 명시된 상태를 저장.
- 실제 spacecraft command endpoint는 존재하지 않거나 명시적으로 차단.


<!-- END 01_AETHERUS_V2_MASTER_PRODUCT_SYSTEM_SPEC.md -->


<!-- BEGIN 02_ENGINE_REGISTRY_E01_E44.md -->

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



<!-- END 02_ENGINE_REGISTRY_E01_E44.md -->


<!-- BEGIN 03_INTELLIGENCE_CORE_E38_E44.md -->

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



<!-- END 03_INTELLIGENCE_CORE_E38_E44.md -->


<!-- BEGIN 04_LLM_LAYER_L01_L08.md -->

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



<!-- END 04_LLM_LAYER_L01_L08.md -->


<!-- BEGIN 05_SPACE_SOLAR_SYSTEM_SPEC.md -->

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



<!-- END 05_SPACE_SOLAR_SYSTEM_SPEC.md -->


<!-- BEGIN 06_CONTROL_MISSION_CONTROL_SPEC.md -->

# AETHERUS V2 — CONTROL / MISSION CONTROL SPEC


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

## CONTROL 철학

CONTROL은 같은 Earth/Time/Selection을 유지한 채 mission operations 정보가 펼쳐지는 Workspace다. 사용자가 제공한 레퍼런스처럼 중앙 3D Earth가 주인공이고 주변에 dense dashboard가 배치되지만, 항상 모든 패널을 동시에 강조하지 않는다. Mission State에 따라 Adaptive Workspace가 핵심 위젯을 자동 전면화한다.

## 기본 Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ AETHERUS     SPACE   CONTROL   ORBIT   MISSIONS   EVENTS   │
├───────────────┬───────────────────────────┬─────────────────┤
│ NEXT LAUNCHES │                           │ LIVE STREAM     │
│ FOLLOWING     │        3D EARTH           │ TIMELINE        │
│ EVENT QUEUE   │  launch/orbit/shells      │ WEATHER         │
│               │                           │ SPACE WEATHER   │
├───────────────┼───────────────────────────┼─────────────────┤
│ ORBITAL RADAR │ CALENDAR / PASSES / WATCH│ SYSTEM / ROOMS  │
├───────────────┴───────────────────────────┴─────────────────┤
│ PAST ---------------- NOW ---------------- FUTURE           │
└─────────────────────────────────────────────────────────────┘
```

## Adaptive Workspace 상태

### Pre-launch
- Next Launch/Countdown
- official source status
- launch site/weather
- mission timeline
- target orbit
- stream availability

### Ascent
- Live Telemetry 또는 MODELLED TRAJECTORY 명확 표시
- flight path, stage state, target orbit
- mission timeline
- live/official stream
- relevant space weather/weather context

### Orbit insertion / deployment
- payload/stage objects
- target vs achieved/known state (source grade 명시)
- mission-to-orbit handover status
- follow/save controls

### Post mission
- Mission Record
- Replay
- created objects / current locations
- GO TO ORBIT / WHERE IS IT NOW

## Control Rooms

- Launch Control
- Mission Operations
- Orbital Operations
- Debris Watch
- Space Weather Lab
- Observation Desk

Control Room은 UI template일 뿐 별도 truth store가 아니다. Widget은 동일 API/Intelligence Core를 소비한다.

## Telemetry 표시 원칙

`LIVE TELEMETRY`, `OFFICIAL EVENT UPDATE`, `MODELLED TRAJECTORY`, `RECONSTRUCTED`는 서로 다른 Visual Semantics를 사용한다. 데이터가 없으면 모델 궤적을 사용할 수 있지만 반드시 모델/가정/시각을 표시하고 Live처럼 보이지 않게 한다.

## Mission life-cycle 연결

```text
MISSION
  ↓
VEHICLE / STAGES / PAYLOADS
  ↓
LIFTOFF / ASCENT / INSERTION / DEPLOYMENT
  ↓
MISSION RECORD
  ↓
HANDOVER
  ├→ PAYLOAD → SATELLITE / SPACE OBJECT
  └→ UPPER STAGE → ROCKET BODY
                    ↓
                   ORBIT
                    ↓
           CONJUNCTION / REENTRY / DEBRIS
```
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



<!-- END 06_CONTROL_MISSION_CONTROL_SPEC.md -->


<!-- BEGIN 07_ORBITAL_ENVIRONMENT_DEBRIS_SPEC.md -->

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



<!-- END 07_ORBITAL_ENVIRONMENT_DEBRIS_SPEC.md -->


<!-- BEGIN 08_VISUAL_UI_UX_SYSTEM_SPEC.md -->

# AETHERUS V2 — VISUAL / UI / UX SYSTEM SPEC


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

## 디자인 목표

- 미래형 관제 시스템이지만 정보가 많다는 이유로 모든 패널이 같은 우선순위를 갖지 않는다.
- 중앙 3D Universe/Earth를 제품의 주인공으로 유지.
- dark graphite/navy 기반, subtle emissive accents. 색상은 의미를 가져야 하며 장식용 위험색 남용 금지.
- 모드가 바뀌어도 Persistent Universe State를 유지.
- 모바일/태블릿/데스크톱/대형 wall display의 정보밀도를 별도 profile로 설계.

## Visual Semantics

권장 의미 매핑(최종 색/스타일은 design tokens에서 결정):

- Observed/Official: solid/confirmed treatment
- Derived: 계산 표식 + method disclosure
- Modelled: 점선/모델 badge
- AI Signal: 독립 AI_SIGNAL badge, 관측값과 합치지 않음
- Uncertainty: translucent envelope/range
- Simulation: simulation label
- Counterfactual: ghost/alternate world/path
- Screening: screening badge
- Validated: validation badge

## 화면 목록

1. Home / SPACE NOW
2. SPACE Solar System
3. Earth / Orbital Stack
4. CONTROL Center
5. Live Mission Focus
6. Mission Replay
7. ORBIT Shell Focus
8. Object Detail
9. Event Focus
10. Scenario Lab
11. MY AETHERUS
12. Control Room Builder
13. Archive / Time Machine
14. Compare Time
15. Research / Evidence Drawer
16. Operations Fleet Workspace

## Home / SPACE NOW

초기 진입에서 Earth, terminator, Moon relation, 약한 orbital shells, important event pulses만 보인다. UI는 최소화한다. `SPACE / CONTROL / ORBIT`와 Universal Time, 작은 `SPACE NOW` 카드가 핵심이다.

## Orbital Stack interaction

- Hover shell: 환경 summary
- Click shell: other shells dim, camera reframe
- Zoom in: cluster→object
- Select object: selected orbit + relevant neighbors
- Select event: unrelated objects dim; event geometry/uncertainty/time shown
- Escape/back: prior FocusState restore

## Event pulse 규칙

Pulse는 Importance를 의미하며 Risk와 동일하지 않다. density brightness, risk edge, importance pulse, uncertainty envelope를 분리한다.

## CONTROL reference 반영

사용자가 제공한 관제 이미지의 핵심 패턴(중앙 globe, 좌우 dense panels, live stream, mission timeline, orbital radar, weather/space-weather, launch calendar, control rooms)을 채택하되, Aetherus V2는 Adaptive Workspace와 Visual Semantics를 추가한다.

## Accessibility

- 색상만으로 상태 구분 금지.
- keyboard focus/navigation.
- data visualization legend text.
- reduced motion mode.
- screen reader용 semantic labels.
- high-contrast profile.
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



<!-- END 08_VISUAL_UI_UX_SYSTEM_SPEC.md -->


<!-- BEGIN 09_DATA_DB_API_CONTRACTS.md -->

# AETHERUS V2 — DATA / DB / API CONTRACTS


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

## 저장 계층

- PostgreSQL/PostGIS: canonical relational truth, objects, missions, events, revisions, scenario results, access/audit metadata.
- Object Storage: raw source artifacts, large immutable files, media/cache where license allows, research manifests.
- Parquet/DuckDB-compatible Research Store: large snapshots/exports/benchmarks.
- Redis/Cache: latest lookup, ephemeral job status, rendered/query cache. Redis 유실이 canonical science result 손실을 의미하면 실패.

## Canonical 핵심 테이블 — V2 제안

기존 orbital schema를 유지/마이그레이션하면서 다음 계층을 추가한다.

```text
data_source
raw_artifact
ingestion_run
space_object / aliases
celestial_object
mission / mission_payload / launch_window / mission_state / mission_timeline_event
orbit_solution / propagation_artifact
conjunction_event / conjunction_snapshot / risk_metric / risk_edge
reentry_prediction / fragmentation_run
intervention_scenario / scenario_run / benefit_result
observation_station / request / submission / qa

evidence / provenance_link
signal
intelligence_event / event_object_link / event_signal_link
event_revision / revision_delta
confidence_assessment / uncertainty_assessment
importance_assessment
attribution_result / decision_comparison

object_relation
archive_index
workspace / widget_layout / follow / alert_rule
capability / role / subscription_entitlement
audit_log
```

## API 공통 Envelope

```json
{
  "request_id": "uuid",
  "generated_at": "...Z",
  "data_status": "OK|STALE|PARTIAL|UNAVAILABLE|RESEARCH_ONLY|SCREENING_ONLY",
  "data": {},
  "provenance": {"source_ids": [], "model_version": null, "input_hash": null},
  "warnings": []
}
```

## 주요 Endpoint 그룹

### Space
- `GET /v1/space/ephemeris`
- `GET /v1/space/events`
- `GET /v1/space/neo`
- `GET /v1/space/missions`
- `GET /v1/space-weather/current`

### Control
- `GET /v1/missions`
- `GET /v1/launches/upcoming`
- `GET /v1/missions/{id}/state`
- `GET /v1/missions/{id}/telemetry`
- `GET /v1/missions/{id}/trajectory`
- `GET /v1/missions/{id}/timeline`
- `GET /v1/missions/{id}/replay`
- `GET /v1/missions/{id}/objects`

### Orbit
- `GET /v1/objects`
- `GET /v1/objects/{id}/ephemeris`
- `GET /v1/conjunctions`
- `GET /v1/reentry`
- `GET /v1/orbit/shells`
- `POST /v1/scenarios`
- `POST /v1/scenarios/{id}/run`
- `GET /v1/scenarios/{id}/benefits`
- `POST /v1/protect/{id}/candidates`

### Intelligence
- `GET /v1/intelligence/events`
- `GET /v1/intelligence/important-now`
- `GET /v1/intelligence/events/{id}`
- `GET /v1/intelligence/events/{id}/revisions`
- `GET /v1/intelligence/events/{id}/evidence`
- `GET /v1/intelligence/events/{id}/confidence`
- `GET /v1/intelligence/events/{id}/why`
- `GET /v1/intelligence/scenarios/{id}/attribution`

### Personal / Workspace
- `GET/POST /v1/follows`
- `GET/POST /v1/workspaces`
- `GET/POST /v1/alerts/rules`
- `GET /v1/my/space-now`

## 데이터 migration 원칙

- 기존 orbital tables가 있으면 새 schema로 덮어쓰지 않고 migration + compatibility view를 사용.
- append-only science/history를 destructive update로 바꾸지 않음.
- schema version을 명시.
- migration test는 empty DB + legacy fixture DB 두 경로.


<!-- END 09_DATA_DB_API_CONTRACTS.md -->


<!-- BEGIN 10_SUBSCRIPTION_PERSONALIZATION_RBAC.md -->

# AETHERUS V2 — SUBSCRIPTION / PERSONALIZATION / RBAC


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

## 철학

Free/paid 차이는 공공 안전정보 자체를 숨기는 것이 아니라 **깊이, 시간, 개인화, 분석, 시뮬레이션, 저장, API, 전문 workflow**에서 만든다.

### Tier 제안

| Tier | 핵심 경험 |
|---|---|
| FREE / Explorer | SPACE/CONTROL/ORBIT 기본 공개 탐색, 공개 Mission/Event, 기본 Why It Matters |
| AETHERUS+ | Unlimited Follow, MY AETHERUS, Personal Control Room, Intelligence Alerts, Time Machine, Collections |
| PRO | Revision deep history, raw evidence/provenance, Scenario Lab, advanced compare, dataset/API quota, reports |
| CONTROL / Institution | Team Control Rooms, wall/presentation mode, collaboration, larger quotas |
| OPERATIONS | Private Fleet overlay, candidate OCM compare, tenant isolation, SLA/audit |
| REMOVAL INTELLIGENCE | Benefit/PROTECT/fragmentation/target analysis professional workflow |

## Capability model

```text
space.explore
control.public
orbit.public
follow.object
follow.mission
workspace.personal
timemachine.history
archive.compare
intelligence.revision
scenario.simple
research.raw
research.dataset
research.api
workspace.team
operations.private_fleet
operations.ocm
operations.audit
removal.benefit
removal.protect
```

코드 전체에서 `if plan == 'pro'`를 반복하지 않는다. `CapabilityService.can(user, capability, resource)`를 사용한다.

## MY AETHERUS

- MY SPACE NOW
- FOLLOWING
- CONTROL ROOMS
- INTELLIGENCE FEED
- TIMELINE / ARCHIVE
- ALERTS
- COLLECTIONS

## Alerts

알림은 raw update가 아니라 의미 있는 변화 중심이다.

- launch window revised
- mission state changed
- event revision changed
- confidence/uncertainty materially changed
- re-entry window changed/narrowed
- followed object observation window
- solar/space weather context relevant to follow/workspace

모든 alert는 trigger event/revision/evidence에 trace 가능해야 한다.

## Control Room Widget

Widget은 query/render contract만 가지며 scientific logic을 포함하지 않는다. Widget layout은 개인/팀별 저장 가능하나 데이터 source of truth는 동일 API/Intelligence다.


<!-- END 10_SUBSCRIPTION_PERSONALIZATION_RBAC.md -->


<!-- BEGIN 11_TEST_ACCEPTANCE_EVIDENCE.md -->

# AETHERUS V2 — TEST / ACCEPTANCE / EVIDENCE MASTER


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

## Test pyramid

- Unit: parser, transforms, pure science, classification, reducers.
- Property: ID length, time monotonicity, probability bounds, serialization, append-only invariants.
- Golden: official/spec fixture, static public snapshot, known astronomy/mission cases where available.
- Integration: source→raw→canonical→engine→DB→API.
- Intelligence: signal→event→revision→confidence/uncertainty→why.
- E2E: browser interaction→async job→result→3D/UI.
- Benchmark: 10k/30k/100k synthetic/real mix for orbit/affected/render where appropriate.
- Chaos: source outage, worker failure, stale data, provider rate limit, LLM provider failure.
- Security: tenant isolation, secret log scan, capability, audit.

## Evidence Manifest schema

```json
{
  "phase": "Pxx",
  "engine_ids": ["E.."],
  "commit": "git-sha",
  "input": [],
  "tests": [{"cmd":"...","passed":true}],
  "database_assertions": [],
  "api_assertions": [],
  "ui_assertions": [],
  "benchmarks": {},
  "validation_state": "...",
  "limitations": [],
  "artifacts": []
}
```

## 판정 상태

- `NOT_STARTED`
- `DESIGN_READY`
- `IMPLEMENTING`
- `BLOCKED`
- `TESTING`
- `ACCEPTED_LOCAL`
- `ACCEPTED_STAGING`
- `ACCEPTED_PRODUCTION`

`DONE`이라는 단어만 단독 사용하지 않는다. 어느 환경에서 어떤 evidence로 accepted인지 기록한다.

## 공통 Acceptance

1. fake number 0건.
2. placeholder scientific function 0건.
3. source/epoch/model/version/hash 추적 가능.
4. unavailable/stale/partial UI 정상 표시.
5. archived/model/counterfactual 시각 구분.
6. same input deterministic where required.
7. API schema + auth/capability.
8. browser E2E에서 UI가 실제 API를 사용.
9. regression suite 통과.
10. evidence manifest 생성.

| Test ID | Engine | Domain | Case | Automation | Gate |
| --- | --- | --- | --- | --- | --- |
| E01-T01 | E01 | FOUNDATION | duplicate raw hash dedupe | AUTOMATED | REQUIRED |
| E01-T02 | E01 | FOUNDATION | 429/backoff policy | AUTOMATED | REQUIRED |
| E01-T03 | E01 | FOUNDATION | partial parse quarantine | AUTOMATED | REQUIRED |
| E01-T04 | E01 | FOUNDATION | secret redaction | AUTOMATED | REQUIRED |
| E01-T05 | E01 | FOUNDATION | source outage stale behavior | AUTOMATED | REQUIRED |
| E02-T01 | E02 | FOUNDATION | 6+ digit catalog ID | AUTOMATED | REQUIRED |
| E02-T02 | E02 | FOUNDATION | same catalog renamed alias | AUTOMATED | REQUIRED |
| E02-T03 | E02 | FOUNDATION | COSPAR conflict quarantine | AUTOMATED | REQUIRED |
| E02-T04 | E02 | FOUNDATION | unknown origin not inferred | AUTOMATED | REQUIRED |
| E02-T05 | E02 | FOUNDATION | mission-created object handover | AUTOMATED | REQUIRED |
| E03-T01 | E03 | FOUNDATION | missing source rejects intelligence promotion | AUTOMATED | REQUIRED |
| E03-T02 | E03 | FOUNDATION | hash chain reproducibility | AUTOMATED | REQUIRED |
| E03-T03 | E03 | FOUNDATION | source-grade separation | AUTOMATED | REQUIRED |
| E03-T04 | E03 | FOUNDATION | license policy propagation | AUTOMATED | REQUIRED |
| E04-T01 | E04 | FOUNDATION | naive datetime rejection | AUTOMATED | REQUIRED |
| E04-T02 | E04 | FOUNDATION | UTC/local roundtrip | AUTOMATED | REQUIRED |
| E04-T03 | E04 | FOUNDATION | replay deterministic cursor | AUTOMATED | REQUIRED |
| E04-T04 | E04 | FOUNDATION | future model vs archived state separation | AUTOMATED | REQUIRED |
| E05-T01 | E05 | FOUNDATION | frame roundtrip tolerance | AUTOMATED | REQUIRED |
| E05-T02 | E05 | FOUNDATION | unsupported frame fail | AUTOMATED | REQUIRED |
| E05-T03 | E05 | FOUNDATION | EOP stale downgrade | AUTOMATED | REQUIRED |
| E05-T04 | E05 | FOUNDATION | solar/earth frame consistency fixture | AUTOMATED | REQUIRED |
| E06-T01 | E06 | FOUNDATION | append-only state | AUTOMATED | REQUIRED |
| E06-T02 | E06 | FOUNDATION | same input deterministic hash | AUTOMATED | REQUIRED |
| E06-T03 | E06 | FOUNDATION | archived vs reconstructed label | AUTOMATED | REQUIRED |
| E06-T04 | E06 | FOUNDATION | baseline snapshot immutability | AUTOMATED | REQUIRED |
| E07-T01 | E07 | FOUNDATION | typed relation source required | AUTOMATED | REQUIRED |
| E07-T02 | E07 | FOUNDATION | mission-to-object lineage | AUTOMATED | REQUIRED |
| E07-T03 | E07 | FOUNDATION | time-consistent traversal | AUTOMATED | REQUIRED |
| E07-T04 | E07 | FOUNDATION | unknown relation uncertainty | AUTOMATED | REQUIRED |
| E08-T01 | E08 | SPACE | known epoch cross-check | AUTOMATED | REQUIRED |
| E08-T02 | E08 | SPACE | past/future deterministic | AUTOMATED | REQUIRED |
| E08-T03 | E08 | SPACE | provider/kernel version captured | AUTOMATED | REQUIRED |
| E08-T04 | E08 | SPACE | observer/frame explicit | AUTOMATED | REQUIRED |
| E09-T01 | E09 | SPACE | known event fixture | AUTOMATED | REQUIRED |
| E09-T02 | E09 | SPACE | rule version stored | AUTOMATED | REQUIRED |
| E09-T03 | E09 | SPACE | boundary time zone | AUTOMATED | REQUIRED |
| E09-T04 | E09 | SPACE | official vs derived separation | AUTOMATED | REQUIRED |
| E10-T01 | E10 | SPACE | source timestamp preserved | AUTOMATED | REQUIRED |
| E10-T02 | E10 | SPACE | observed vs forecast separated | AUTOMATED | REQUIRED |
| E10-T03 | E10 | SPACE | stale handling | AUTOMATED | REQUIRED |
| E10-T04 | E10 | SPACE | drag context is context not direct orbit correction | AUTOMATED | REQUIRED |
| E11-T01 | E11 | SPACE | source grade | AUTOMATED | REQUIRED |
| E11-T02 | E11 | SPACE | close approach timestamp | AUTOMATED | REQUIRED |
| E11-T03 | E11 | SPACE | uncertainty preserved | AUTOMATED | REQUIRED |
| E11-T04 | E11 | SPACE | no impact claim without source | AUTOMATED | REQUIRED |
| E12-T01 | E12 | SPACE | mission status source | AUTOMATED | REQUIRED |
| E12-T02 | E12 | SPACE | trajectory provenance | AUTOMATED | REQUIRED |
| E12-T03 | E12 | SPACE | missing live telemetry -> model/official state label | AUTOMATED | REQUIRED |
| E13-T01 | E13 | CONTROL | duplicate mission merge policy | AUTOMATED | REQUIRED |
| E13-T02 | E13 | CONTROL | source precedence | AUTOMATED | REQUIRED |
| E13-T03 | E13 | CONTROL | payload provisional status | AUTOMATED | REQUIRED |
| E13-T04 | E13 | CONTROL | site coordinates | AUTOMATED | REQUIRED |
| E14-T01 | E14 | CONTROL | window revision history | AUTOMATED | REQUIRED |
| E14-T02 | E14 | CONTROL | TBD vs confirmed | AUTOMATED | REQUIRED |
| E14-T03 | E14 | CONTROL | timezone conversion | AUTOMATED | REQUIRED |
| E14-T04 | E14 | CONTROL | countdown only with resolved window | AUTOMATED | REQUIRED |
| E15-T01 | E15 | CONTROL | invalid transition reject | AUTOMATED | REQUIRED |
| E15-T02 | E15 | CONTROL | countdown pause/hold | AUTOMATED | REQUIRED |
| E15-T03 | E15 | CONTROL | scrub reset | AUTOMATED | REQUIRED |
| E15-T04 | E15 | CONTROL | official event transition evidence | AUTOMATED | REQUIRED |
| E16-T01 | E16 | CONTROL | live vs modelled separation | AUTOMATED | REQUIRED |
| E16-T02 | E16 | CONTROL | out-of-order sample handling | AUTOMATED | REQUIRED |
| E16-T03 | E16 | CONTROL | source fail fallback | AUTOMATED | REQUIRED |
| E16-T04 | E16 | CONTROL | unit/schema validation | AUTOMATED | REQUIRED |
| E17-T01 | E17 | CONTROL | trajectory source label | AUTOMATED | REQUIRED |
| E17-T02 | E17 | CONTROL | stage separation geometry | AUTOMATED | REQUIRED |
| E17-T03 | E17 | CONTROL | target orbit frame | AUTOMATED | REQUIRED |
| E17-T04 | E17 | CONTROL | model version/assumption | AUTOMATED | REQUIRED |
| E18-T01 | E18 | CONTROL | event order | AUTOMATED | REQUIRED |
| E18-T02 | E18 | CONTROL | revisions preserved | AUTOMATED | REQUIRED |
| E18-T03 | E18 | CONTROL | video timestamp optional | AUTOMATED | REQUIRED |
| E18-T04 | E18 | CONTROL | record hash reproducibility | AUTOMATED | REQUIRED |
| E19-T01 | E19 | CONTROL | replay deterministic | AUTOMATED | REQUIRED |
| E19-T02 | E19 | CONTROL | handover provisional->confirmed | AUTOMATED | REQUIRED |
| E19-T03 | E19 | CONTROL | stage/payload identity | AUTOMATED | REQUIRED |
| E19-T04 | E19 | CONTROL | GO TO LAUNCH / WHERE IS IT NOW relation | AUTOMATED | REQUIRED |
| E20-T01 | E20 | ORBIT | known epoch golden | AUTOMATED | REQUIRED |
| E20-T02 | E20 | ORBIT | deterministic hash | AUTOMATED | REQUIRED |
| E20-T03 | E20 | ORBIT | stale flag | AUTOMATED | REQUIRED |
| E20-T04 | E20 | ORBIT | invalid elements -> unavailable | AUTOMATED | REQUIRED |
| E20-T05 | E20 | ORBIT | frame conversion | AUTOMATED | REQUIRED |
| E21-T01 | E21 | ORBIT | injected close pair recall | AUTOMATED | REQUIRED |
| E21-T02 | E21 | ORBIT | known TCA tolerance | AUTOMATED | REQUIRED |
| E21-T03 | E21 | ORBIT | boundary minimum | AUTOMATED | REQUIRED |
| E21-T04 | E21 | ORBIT | multi-minima | AUTOMATED | REQUIRED |
| E21-T05 | E21 | ORBIT | verification corpus metrics | AUTOMATED | REQUIRED |
| E22-T01 | E22 | ORBIT | missing covariance -> null not zero | AUTOMATED | REQUIRED |
| E22-T02 | E22 | ORBIT | Pc bounds | AUTOMATED | REQUIRED |
| E22-T03 | E22 | ORBIT | method mismatch warning | AUTOMATED | REQUIRED |
| E22-T04 | E22 | ORBIT | spec fixture path | AUTOMATED | REQUIRED |
| E22-T05 | E22 | ORBIT | dilution/covariance validity | AUTOMATED | REQUIRED |
| E23-T01 | E23 | ORBIT | edge deterministic | AUTOMATED | REQUIRED |
| E23-T02 | E23 | ORBIT | metric split | AUTOMATED | REQUIRED |
| E23-T03 | E23 | ORBIT | aggregate config version required | AUTOMATED | REQUIRED |
| E23-T04 | E23 | ORBIT | graph snapshot hash | AUTOMATED | REQUIRED |
| E24-T01 | E24 | ORBIT | shell boundaries | AUTOMATED | REQUIRED |
| E24-T02 | E24 | ORBIT | coverage ratio | AUTOMATED | REQUIRED |
| E24-T03 | E24 | ORBIT | source gap partial | AUTOMATED | REQUIRED |
| E24-T04 | E24 | ORBIT | threshold version | AUTOMATED | REQUIRED |
| E25-T01 | E25 | ORBIT | known family links | AUTOMATED | REQUIRED |
| E25-T02 | E25 | ORBIT | unknown origin no inference | AUTOMATED | REQUIRED |
| E25-T03 | E25 | ORBIT | chronological timeline | AUTOMATED | REQUIRED |
| E25-T04 | E25 | ORBIT | multinational separation | AUTOMATED | REQUIRED |
| E26-T01 | E26 | ORBIT | fixed seed reproducibility | AUTOMATED | REQUIRED |
| E26-T02 | E26 | ORBIT | assumption exposure | AUTOMATED | REQUIRED |
| E26-T03 | E26 | ORBIT | remove path indirect delta | AUTOMATED | REQUIRED |
| E26-T04 | E26 | ORBIT | model validation state | AUTOMATED | REQUIRED |
| E27-T01 | E27 | ORBIT | TIP parse | AUTOMATED | REQUIRED |
| E27-T02 | E27 | ORBIT | no TIP -> no fake exact time | AUTOMATED | REQUIRED |
| E27-T03 | E27 | ORBIT | version history | AUTOMATED | REQUIRED |
| E27-T04 | E27 | ORBIT | grade visible | AUTOMATED | REQUIRED |
| E28-T01 | E28 | ORBIT | synthetic sinusoid | AUTOMATED | REQUIRED |
| E28-T02 | E28 | ORBIT | alias ambiguous | AUTOMATED | REQUIRED |
| E28-T03 | E28 | ORBIT | too few points | AUTOMATED | REQUIRED |
| E28-T04 | E28 | ORBIT | uncertainty downgrade | AUTOMATED | REQUIRED |
| E29-T01 | E29 | ORBIT | known pass | AUTOMATED | REQUIRED |
| E29-T02 | E29 | ORBIT | sun/eclipse flag | AUTOMATED | REQUIRED |
| E29-T03 | E29 | ORBIT | mount limit | AUTOMATED | REQUIRED |
| E29-T04 | E29 | ORBIT | info gain ordering | AUTOMATED | REQUIRED |
| E29-T05 | E29 | ORBIT | no visibility -> no request | AUTOMATED | REQUIRED |
| E30-T01 | E30 | ORBIT | duplicate dedupe | AUTOMATED | REQUIRED |
| E30-T02 | E30 | ORBIT | bad timestamp quarantine | AUTOMATED | REQUIRED |
| E30-T03 | E30 | ORBIT | outlier reject | AUTOMATED | REQUIRED |
| E30-T04 | E30 | ORBIT | accepted-only hook | AUTOMATED | REQUIRED |
| E30-T05 | E30 | ORBIT | license missing | AUTOMATED | REQUIRED |
| E31-T01 | E31 | ORBIT | direct remove exact delta | AUTOMATED | REQUIRED |
| E31-T02 | E31 | ORBIT | metric channels separated | AUTOMATED | REQUIRED |
| E31-T03 | E31 | ORBIT | same input repeat hash | AUTOMATED | REQUIRED |
| E31-T04 | E31 | ORBIT | no data no fake beneficiary | AUTOMATED | REQUIRED |
| E31-T05 | E31 | ORBIT | new risk surfaced | AUTOMATED | REQUIRED |
| E32-T01 | E32 | ORBIT | injected influence included | AUTOMATED | REQUIRED |
| E32-T02 | E32 | ORBIT | full-vs-selective equivalence | AUTOMATED | REQUIRED |
| E32-T03 | E32 | ORBIT | new OCM path candidate | AUTOMATED | REQUIRED |
| E32-T04 | E32 | ORBIT | rollback on mismatch | AUTOMATED | REQUIRED |
| E33-T01 | E33 | ORBIT | known ranking | AUTOMATED | REQUIRED |
| E33-T02 | E33 | ORBIT | inactive protected object research mode | AUTOMATED | REQUIRED |
| E33-T03 | E33 | ORBIT | new risk penalty | AUTOMATED | REQUIRED |
| E33-T04 | E33 | ORBIT | same-designator exclusion | AUTOMATED | REQUIRED |
| E33-T05 | E33 | ORBIT | candidate provenance | AUTOMATED | REQUIRED |
| E34-T01 | E34 | VISUAL | scale transition continuity | AUTOMATED | REQUIRED |
| E34-T02 | E34 | VISUAL | floating precision budget | AUTOMATED | REQUIRED |
| E34-T03 | E34 | VISUAL | layer source labels | AUTOMATED | REQUIRED |
| E34-T04 | E34 | VISUAL | device profile fallback | AUTOMATED | REQUIRED |
| E35-T01 | E35 | VISUAL | focus persistence across modes | AUTOMATED | REQUIRED |
| E35-T02 | E35 | VISUAL | back navigation | AUTOMATED | REQUIRED |
| E35-T03 | E35 | VISUAL | object->event->object | AUTOMATED | REQUIRED |
| E35-T04 | E35 | VISUAL | NOW reset preserves expected focus | AUTOMATED | REQUIRED |
| E36-T01 | E36 | VISUAL | global view object cap | AUTOMATED | REQUIRED |
| E36-T02 | E36 | VISUAL | shell selection focus | AUTOMATED | REQUIRED |
| E36-T03 | E36 | VISUAL | viewport query | AUTOMATED | REQUIRED |
| E36-T04 | E36 | VISUAL | render subset != science subset | AUTOMATED | REQUIRED |
| E37-T01 | E37 | VISUAL | all evidence classes mapped | AUTOMATED | REQUIRED |
| E37-T02 | E37 | VISUAL | screening vs validated distinct | AUTOMATED | REQUIRED |
| E37-T03 | E37 | VISUAL | uncertainty visible | AUTOMATED | REQUIRED |
| E37-T04 | E37 | VISUAL | contrast/accessibility | AUTOMATED | REQUIRED |
| E38-T01 | E38 | INTELLIGENCE | idempotent trigger | AUTOMATED | REQUIRED |
| E38-T02 | E38 | INTELLIGENCE | dependency ordering | AUTOMATED | REQUIRED |
| E38-T03 | E38 | INTELLIGENCE | partial failure recovery | AUTOMATED | REQUIRED |
| E38-T04 | E38 | INTELLIGENCE | no circular task graph | AUTOMATED | REQUIRED |
| E38-T05 | E38 | INTELLIGENCE | replay from event log | AUTOMATED | REQUIRED |
| E39-T01 | E39 | INTELLIGENCE | independent source weighting | AUTOMATED | REQUIRED |
| E39-T02 | E39 | INTELLIGENCE | stale disagreement | AUTOMATED | REQUIRED |
| E39-T03 | E39 | INTELLIGENCE | conflicting official sources preserved | AUTOMATED | REQUIRED |
| E39-T04 | E39 | INTELLIGENCE | missing evidence remains missing | AUTOMATED | REQUIRED |
| E40-T01 | E40 | INTELLIGENCE | class required | AUTOMATED | REQUIRED |
| E40-T02 | E40 | INTELLIGENCE | AI cannot overwrite observed | AUTOMATED | REQUIRED |
| E40-T03 | E40 | INTELLIGENCE | counterfactual cannot become official | AUTOMATED | REQUIRED |
| E40-T04 | E40 | INTELLIGENCE | unknown class quarantine | AUTOMATED | REQUIRED |
| E41-T01 | E41 | INTELLIGENCE | same event correlation | AUTOMATED | REQUIRED |
| E41-T02 | E41 | INTELLIGENCE | duplicate suppression | AUTOMATED | REQUIRED |
| E41-T03 | E41 | INTELLIGENCE | new event boundary | AUTOMATED | REQUIRED |
| E41-T04 | E41 | INTELLIGENCE | domain-specific event types | AUTOMATED | REQUIRED |
| E41-T05 | E41 | INTELLIGENCE | insufficient data event allowed | AUTOMATED | REQUIRED |
| E42-T01 | E42 | INTELLIGENCE | append-only revisions | AUTOMATED | REQUIRED |
| E42-T02 | E42 | INTELLIGENCE | change cause linked | AUTOMATED | REQUIRED |
| E42-T03 | E42 | INTELLIGENCE | no-change revision suppression policy | AUTOMATED | REQUIRED |
| E42-T04 | E42 | INTELLIGENCE | rollback/correction lineage | AUTOMATED | REQUIRED |
| E43-T01 | E43 | INTELLIGENCE | confidence != uncertainty | AUTOMATED | REQUIRED |
| E43-T02 | E43 | INTELLIGENCE | missing covariance raises uncertainty/limits claim | AUTOMATED | REQUIRED |
| E43-T03 | E43 | INTELLIGENCE | factor traceability | AUTOMATED | REQUIRED |
| E43-T04 | E43 | INTELLIGENCE | versioned weighting | AUTOMATED | REQUIRED |
| E44-T01 | E44 | INTELLIGENCE | importance reasons traceable | AUTOMATED | REQUIRED |
| E44-T02 | E44 | INTELLIGENCE | change rate can outrank static magnitude under policy | AUTOMATED | REQUIRED |
| E44-T03 | E44 | INTELLIGENCE | decision shows new risk | AUTOMATED | REQUIRED |
| E44-T04 | E44 | INTELLIGENCE | scenario assumptions surfaced | AUTOMATED | REQUIRED |
| E44-T05 | E44 | INTELLIGENCE | no single-option recommendation without policy | AUTOMATED | REQUIRED |



<!-- END 11_TEST_ACCEPTANCE_EVIDENCE.md -->


<!-- BEGIN 12_IMPLEMENTATION_PHASES_CLAUDE_CODE.md -->

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



<!-- END 12_IMPLEMENTATION_PHASES_CLAUDE_CODE.md -->


<!-- BEGIN 13_DEPLOYMENT_OPERATIONS_SECURITY.md -->

# AETHERUS V2 — DEPLOYMENT / OPERATIONS / SECURITY


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

## 환경 분리

- local/dev
- CI test
- staging
- production

각 환경은 provider credentials, DB/cache/object-store, allowed origins, rate limits, LLM providers, feature/capability policy를 별도 설정한다.

## 운영 안전

- secrets는 env/secret manager only; 로그 금지.
- private fleet/ephemeris는 tenant-scoped encryption + access audit.
- provider terms/rate limit을 adapter policy로 코드화.
- license-restricted raw는 research export에서 제외.
- source outage: last valid snapshot + STALE, fake fallback 금지.
- worker outage: read existing data 가능; new scenario job은 pending/disabled.
- LLM outage: science/intelligence core 계속 작동; explanation only degraded.

## Observability

Provider: last success, status, rate-limit, parse rejects.  
Orbit/CA: propagation failures, pair counts, candidates, precise pairs, runtime, validation.  
Mission: feed freshness, telemetry source grade, state transitions, replay errors.  
Intelligence: orchestration queue, event/revision counts, confidence gaps, duplicate suppression.  
UI: WebGL loss, frame time, scene transitions, API errors.  
LLM: provider latency, tool errors, claim-validator blocks, token/cost per feature.

## Backup / Restore

- Postgres PITR/backup policy
- object storage immutability/versioning where available
- research manifest checksums
- restore drill
- audit log retention
- deployment rollback

## Production cutover

Production은 staging evidence와 실데이터 provider health, backup restore test, security scan, device/browser matrix가 통과한 후 별도 승인한다. `LOCAL ACCEPTED`를 `PRODUCTION READY`와 혼동하지 않는다.


<!-- END 13_DEPLOYMENT_OPERATIONS_SECURITY.md -->


<!-- BEGIN 14_IP_PATENT_BOUNDARY_TRACEABILITY.md -->

# AETHERUS V2 — IP / PATENT BOUNDARY / TRACEABILITY


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

## 특허 #1 구현 보존축 [SOURCE-DERIVED]

1. 개입대상 중심 Beneficiary Attribution.
2. 보호대상 중심 PROTECT reverse query.
3. Baseline / Counterfactual Risk Graph delta.
4. Affected Subgraph selective recomputation.
5. Risk Provenance / metric separation / versioning.
6. Candidate OCM 비교에서 resolved/new/changed risk edges.
7. validation dataset/answer-key gate와 validation status.

## 코드 traceability

Patent concept → Engine → tests → evidence path를 manifest로 연결한다.

| 특허/기술축 | V2 Engine | 필수 evidence |
|---|---|---|
| Baseline/Counterfactual | E31 | scenario input hash, graph delta, benefit rows |
| Beneficiary Attribution | E31/E44 | object-level benefit + metric provenance |
| Affected Subgraph | E32 | full-vs-selective equivalence + benchmark |
| PROTECT | E33/E44 | candidate runs + Benefit(k→Y) + new risk |
| OCM comparison | E33 | candidate hash + resolved/new edges |
| Risk Provenance | E03/E22 | source/method/snapshot/model/hash |

## FTO / 선행기술 경계

- 3D visualization, SGP4, 일반 collision probability, 일반 Digital Twin을 독자 핵심 IP라고 가정하지 않는다.
- 기존/후속 특허의 단계구성/청구항을 그대로 복제하지 않는다.
- new TLE generation, collision probability implementations, command guidance 등은 실제 상용화 전 최신 FTO 검토.
- source docs의 특허 메모는 법률의견이 아니며 변리사 검토를 전제로 한다.

## 공개 전 관리

핵심 알고리즘 상세를 public repository/blog/presentation에 공개하기 전 출원/우선권/비밀관리 정책을 확인한다. 개발 evidence(설계, commits, experiment manifests)를 보관한다.


<!-- END 14_IP_PATENT_BOUNDARY_TRACEABILITY.md -->


<!-- BEGIN 15_REPOSITORY_STRUCTURE_AND_CODE_CONTRACTS.md -->

# AETHERUS V2 — REPOSITORY STRUCTURE & CODE CONTRACTS


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

## 권장 구조

```text
aetherus-v2/
  apps/
    web/                         # React/Next/Vite는 기존 repo 기술선택 audit 후 결정
  services/
    api/
    worker/
    intelligence/
    llm-gateway/
  packages/
    domain/
    contracts/
    providers/
    science/
      space/
      mission/
      orbit/
      risk/
      benefit/
      fragmentation/
      reentry/
      photometry/
      observation/
    intelligence/
      orchestration/
      fusion/
      signal/
      event/
      revision/
      confidence/
      decision/
    visual/
      scene/
      camera/
      orbital-shell/
      semantics/
    subscription/
    workspace/
  migrations/
  research/
  fixtures/
  benchmarks/
  tests/
    unit/
    integration/
    golden/
    e2e/
    performance/
    security/
  artifacts/
    audit/
    evidence/
  infra/
    docker/
    deployment/
  docs/
```

**주의:** 실제 repository가 이미 존재하면 이 구조로 강제 migration하지 않는다. 기존 구조를 audit하고 책임 경계만 만족시키도록 최소 변경한다.

## 코드 규칙

- UI에 궤도/과학 계산 숨기지 않음.
- provider raw mapping은 provider layer; canonical type은 domain.
- notebook prototype는 production package + test로 port되기 전 DONE 아님.
- DB access는 repository/service layer로 캡슐화.
- pure-core와 I/O orchestration 분리.
- model/config version은 code constant가 아니라 registry/config manifest로 추적.
- feature/capability는 중앙 service.
- async scientific run은 idempotency key.
- import cycle 방지: domain/contracts ← science/services ← API/UI 방향.

## Engine interface 예

```python
class EngineResult(BaseModel):
    engine_id: str
    engine_version: str
    input_hash: str
    status: str
    generated_at: datetime
    data: dict
    provenance: dict
    warnings: list[str] = []

class Engine(Protocol):
    id: str
    version: str
    def validate(self, input): ...
    async def run(self, input, context) -> EngineResult: ...
```

Intelligence Engine은 domain engine 결과를 직접 mutate하지 않고 reference/hash로 소비한다.


<!-- END 15_REPOSITORY_STRUCTURE_AND_CODE_CONTRACTS.md -->


<!-- BEGIN 16_FINAL_HANDOFF_CHECKLIST.md -->

# AETHERUS V2 — FINAL HANDOFF / ACCEPTANCE CHECKLIST


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

## 제품 영역

- [ ] SPACE: Earth→Orbital→Cislunar→Solar scale 전환
- [ ] CONTROL: Mission registry→countdown→tracking→record→replay→handover
- [ ] ORBIT: shell→object→event→scenario
- [ ] MY AETHERUS / subscription capability
- [ ] Research/Operations boundaries

## Intelligence

- [ ] E38 Orchestrator
- [ ] E39 Evidence Fusion
- [ ] E40 Signal Classification
- [ ] E41 Event
- [ ] E42 Revision
- [ ] E43 Confidence/Uncertainty
- [ ] E44 Importance/Why/Attribution/Decision
- [ ] LLM 없어도 위 파이프라인 동작

## LLM

- [ ] provider-neutral gateway
- [ ] model router
- [ ] tool-only fresh science retrieval
- [ ] claim validator
- [ ] tenant/context privacy
- [ ] briefing/report

## Scientific / Data

- [ ] provenance for every scientific result
- [ ] UTC/time/frame explicit
- [ ] Pc null when covariance unavailable
- [ ] screening vs validated separated
- [ ] counterfactual vs reality separated
- [ ] append-only revisions/snapshots
- [ ] benefit/protect provenance

## Visual

- [ ] LEO/MEO/GEO Shell
- [ ] global render subset separate from science subset
- [ ] uncertainty visible
- [ ] model/simulation disclosure
- [ ] adaptive Control Center
- [ ] Universal Time Bar

## Deployment

- [ ] backup/restore tested
- [ ] secrets scan
- [ ] tenant isolation
- [ ] source outage behavior
- [ ] LLM outage behavior
- [ ] browser/device acceptance
- [ ] staging evidence
- [ ] production decision explicitly approved

## 최종 판정 문구

Claude Code는 최종 보고서에서 다음을 별도로 판정한다.

```text
CANONICAL SPEC IMPLEMENTED: YES/NO/PARTIAL
LOCAL PRODUCT ACCEPTED: YES/NO
INTELLIGENCE CORE ACCEPTED: YES/NO
LLM LAYER ACCEPTED: YES/NO
SAFE FOR STAGING: YES/NO
STAGING ACCEPTED: YES/NO
SAFE FOR PRODUCTION CUTOVER: YES/NO
KNOWN LIMITATIONS: ...
BLOCKERS: ...
```


<!-- END 16_FINAL_HANDOFF_CHECKLIST.md -->


<!-- BEGIN 17_PLATFORM_SERVICES_S01_S12.md -->

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



<!-- END 17_PLATFORM_SERVICES_S01_S12.md -->


<!-- BEGIN 18_INTELLIGENCE_CONNECTION_MATRIX.md -->

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


<!-- END 18_INTELLIGENCE_CONNECTION_MATRIX.md -->


<!-- BEGIN 19_FINAL_BUILD_LIST_AND_CHATGPT_LOCAL_PLAN.md -->

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


<!-- END 19_FINAL_BUILD_LIST_AND_CHATGPT_LOCAL_PLAN.md -->
