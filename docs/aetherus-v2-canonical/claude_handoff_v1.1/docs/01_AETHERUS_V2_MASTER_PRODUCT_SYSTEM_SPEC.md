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
