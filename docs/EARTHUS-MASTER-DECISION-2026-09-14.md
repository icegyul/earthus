# EARTHUS MASTER DECISION — 2026-09-14

**성격**: PD 확정 결정문. 이 문서는 *무엇을 소유하고 무엇을 연결하는가*를 정한다.
**정본 우선순위에서의 자리**: `PRODUCT-STRUCTURE-AND-TIERS-2026-09-14` > `INTELLIGENCE-LAYER-PLAN-2026-09-14` > **이 문서** > `INTELLIGENCE-DEV-DIRECTIVE-2026-09-05` > 전략문서(REFERENCE MASTER, Simulation Vision).
**관련**: `EARTHUS_V2_INTELLIGENCE_SIMULATION_DEV_DIRECTIVE_v1.1_2026-09-14.md`(개발지시서), `SIMULATION_PLATFORM_MAPPING.md`, `TRUTH_VOCABULARY_CANONICAL.md`.

---

## 0. 한 문장

**EARTHUS는 AI를 소유하지 않아도 된다. 그러나 EARTHUS Intelligence와 EARTHUS Simulation Engine은 EARTHUS가 소유한다. 외부 AI는 대체 엔진이 아니라 사용자가 고르는 또 하나의 인터페이스다.**

---

## 1. 소유·연결 경계

| 층 | 소유 | 근거 |
|---|---|---|
| 자료·산출물(S3 정본, 패킷) | **EARTHUS** | STORAGE §0.1 |
| Intelligence(띠·패킷·배지·연결표) | **EARTHUS** | LAYER-PLAN: "LLM 없이 띠 전체가 동작한다" |
| Simulation Engine(물리·수치·검증·runRef) | **EARTHUS** | §N ①~⑤, 재현성 9규칙 |
| 서술자(WHY·NEXT 문장) | **교체 가능 부품** | 기본 `earthus-llm`, 사용자 AI 선택 가능 |
| 사용자 인터페이스 | **EARTHUS UI 또는 사용자 AI** | 양방향 |

> **Intelligence ≠ LLM.** 띠·패킷·배지는 LLM 없이 동작한다. LLM은 서술만 맡으며 패킷에 없는 값은 말하지 못한다. "우리 AI를 없앤다"가 없앨 수 있는 것은 서술자뿐이고, Intelligence는 없앨 대상이 아니다.

---

## 2. 양방향 구조

```
                       USER
                         │
             ┌───────────┴───────────┐
        EARTHUS UI              External AI
             │              (ChatGPT/Claude/Grok, 선택)
             └───────────┬───────────┘
                         ↓
                  INTELLIGENCE  (띠·패킷·배지 — LLM 없이 동작)
                         ↓
                  TOOL / DATA LAYER
                         ↓
                 SIMULATION ENGINE  (EARTHUS 소유)
                         ↓
                   SIMULATION RUN → runRef
                         ↓
             ┌───────────┴───────────┐
        3D Result                Report / 서술
```

- **외부 AI → EARTHUS**: 사용자의 AI가 EARTHUS를 도구로 호출(원격 MCP). 모델비는 사용자 구독.
- **EARTHUS → 외부 AI**: 앱 안 서술자를 사용자가 고름(기본 EARTHUS / 내 키). 규칙은 우리 서버가 강제.
- 어느 쪽이든 **값은 패킷에서만, 계산은 우리 엔진에서만**.

---

## 3. 결정표 (2026-09-14 확정)

| # | 결정 | 상태 |
|---|---|---|
| 1 | 미추적 파일 전부 연결·활용(A커밋/B기록/C ignore/D보관) | **유지** |
| 2 | Postgres 정본 SQL PD 직접 적용 → LIVE 대조 | **유지** |
| 3 | 팔레트 흑연+구리/호박, 적색은 OFFICIAL_WARNING 전용 | **유지** |
| 4 | 확률 표기 좁은 예외(D5) | **유지** |
| 5 | 우리 LLM 완전 제거 | **수정 → 자체 Intelligence 유지, 서술자는 얇게 유지** |
| 6 | 사용자 ChatGPT/Claude/Grok 연결 | **추가 기능으로 유지**(대체 아님) |
| 7 | AI에게 Simulation 계산 위임 | **폐기** |
| 8 | Simulation은 EARTHUS Engine이 계산 | **핵심 원칙 확정** |
| 9 | GPU 없으면 Simulation 불가 | **폐기** — 현재 엔진은 CPU로 충분 |
| 10 | 장기 고해상도·coupled에 GPU/HPC 계층 필요 | **확정** — 지시서 §5.5 Track B(Batch GPU 스팟, L2 이후, 실행당 승인) |
| 11 | AI 연결 동의가 있어야 Simulation | **수정 → 분리** |
| 12 | Simulation 사용 전 자체 동의(데이터 이용·계산 처리) + PRO | **확정** |
| 13 | 19개 Simulation 비전 | **Master Vision으로 유지** |
| 14 | 19개가 현재 구현됐다고 간주 | **금지** — `SIM_CAPABILITIES`에 사유와 함께 `not_available` 등재 |

### 3.1 결정 11·12 — 동의 흐름 (확정)

```
Simulation 실행 요청
      ↓  ① 시뮬 사용 동의 (데이터 이용·계산 처리, 철회 가능·기록)
      ↓  ② PRO 권한 확인
      ↓  ③ 사람 승인 REQUESTED
      ↓  ④ EARTHUS Engine 실행 → SimulationRunRecord(runRef·limits)
```
- **외부 AI 연결은 선택사항이며 이 흐름의 조건이 아니다.** AI 연결 없이도 PRO Simulation을 쓸 수 있다 — `PRO = Simulation` 약속을 깨지 않는다.
- 외부 AI로 데이터가 나가는 것은 **별도 동의** 항목(제3자 전송)으로 둔다.

### 3.2 결정 6 — 연결의 실제 형태

사용자가 서술자를 고른다: `[EARTHUS Intelligence] [내 ChatGPT] [내 Claude] [내 Grok] [API/Developer]`

정직하게 적어 둘 제약(2026-09 공식 문서 실측):
- **구독 계정 그대로 연결은 불가.** Anthropic은 서드파티 앱의 Claude.ai 로그인·Pro/Max 자격증명 경유를 명문 금지. OpenAI "Sign in with ChatGPT"는 신원(이름·이메일)만 제공하고 쿼터를 주지 않는다. → "내 ChatGPT"를 고른 사용자는 **별도 API 키**가 필요하다.
- **원격 MCP 도달**: Claude(Free 1개~Max, 웹·데스크톱; 모바일 베타) 넓음 / ChatGPT는 Business·Enterprise·Edu 웹 중심, Pro 일부 제약, **모바일 불가** / Grok·Gemini 조건 미확인. → **한국 FREE 안드로이드 시민 도달은 사실상 0.** MCP는 소비자 채널이 아니라 *계약 고객 API + Claude 사용자 보조 채널*로 자리매김한다.
- 어느 경로든 **사용자 모델의 문장은 강제할 수 없다.** 우리가 강제하는 것은 우리가 내보내는 바이트뿐이다. 그래서 앱 안 서술자를 없애지 않는다.

---

## 4. Simulation Tier (Master Vision 단계)

| Tier | 내용 | 현재 |
|---|---|---|
| **0 Foundation** | Terrain/DEM · Time Engine · Spatial Grid · Data Provenance · RunRef · Simulation API · Result Layer | 일부 존재, P0·S-A·V-gate에서 완성 |
| **1 검증 완료** | 쓰나미 ETA 계열 | **운영 1건** |
| **2 구현 대상** | Flood · Hydrology · Extreme Rain · Storm Surge · Landslide · Glacier · GLOF · Wildfire · Ocean | 대부분 기관 인용(A)부터, 물리는 §N 통과분만 |
| **3 고급** | Sea Ice · Permafrost · Coupled Ocean · Atmosphere · 장기 기후 시나리오 | 자료 적재부터 |
| **4 최종** | Earth System (Cascade) | 지금은 연결표, 다음은 runRef 연쇄 |

- Tier 2 이상의 각 항목이 **A(기관 인용) / B(검증 통계모델) / C(물리 시뮬) / D(문헌 관계)** 중 무엇으로 나가는지는 `SIMULATION-VISION-LADDER`(작성 중)에서 항목별로 확정한다.
- **Cascade는 두 층이다.** ① 지금 = `phenomenon-relations.js`의 `computed/co_located/reference` 연결 ② 다음 = 검증된 엔진끼리 `runRef` 잇기(오늘 성립하는 것은 지진→쓰나미 ETA 하나). 커플드 수치 모델은 Tier 4.

---

## 5. 문구 규칙 (Simulation 결과 표기)

| 쓰지 않는다 | 대신 쓴다 |
|---|---|
| 발생 확률 72% · 발생 가능성 | 4단계 등급 + 근거 3줄 / 기관이 낸 확률은 원문 인용(D5) |
| 피해 가능지역 · 예상 피해 인원 | 노출: "침수 범위 안 거주 인구 약 N명(출처·연도), 시설 M곳" |
| 예상 영향권 · 정밀 미래 예측 | 기관 예보 인용 + "기준선 대비 KMA −40 km" |

허용 출력: Simulated extent · Simulated arrival time · Exposed area · Exposed population · Change from baseline · Model-derived index · Official warning overlay.
UI에서 **SIMULATION / FORECAST / OFFICIAL WARNING**을 배지·테두리로 분리한다(§7.2 토큰).

---

## 6. 계획 반영

7주 계획(R0→P0→P1+M1→§14 1차→P2a→P3→P4→S-A→P2b·P5·P6)의 **순서는 바뀌지 않는다.**

| 단계 | 이 결정이 더하는 것 | 델타 |
|---|---|---|
| P0 | 패킷 `intel/`(FREE 절, 공개) · `intel-plus/`(EXPLORER 절, 비공개) 물리 분리 | +0.5d |
| P1 | §14 1차에 Ask 회수·tokens·경로 계수 추가 (지금 tokens 미기록) | +0.5d |
| P4 | 서버 결정적 검사(금지어·퍼센트·confidence 숫자화·특보 status 모순), 특보 본문 미전달 + 원문 카드 결정 삽입, 배지 어휘 통일, ageMin/slaMin 실제 전송 | +1.5d |
| 시뮬 동의 | 동의 화면·기록·철회 + `sim-questions.js`에 `consent_required` 사유 | +1d |
| M-MCP | 읽기 전용 도구 3~4개 — **P3 뒤, PD 승인 조건부, 9/30 이후** | 6~8d |
| 서술자 선택(내 키) | 앱 안 서술자 경로에 사용자 키 수용 — §14 1차 측정 뒤 | 2d |

---

## 7. 미결정 (PD)

| # | 결정 |
|---|---|
| D-A | "MCP 도구 = Ask Earthus의 앱 밖 채널(같은 티어표), export만 API"로 정의할지 |
| D-B | STORAGE §0.2를 읽기 전용 MCP 끝점까지 넓힐지 / 실행 자리(Supabase Edge Function vs 토큰 검증 Lambda) |
| D-C | S3 공개 접두사 8→9(`intel/`), `intel-plus/` 비공개 명시 |
| D-D | `anomaly.percentile` 4단계 전환 vs "확률 아님" 주석 유지 |
| D-E | FREE Ask 한도의 숫자와 성격(비용 통제 vs 유료 전환 장치). MCP 한도 ≤ 앱 한도 |
| D-H | 외부 AI의 특보 오독을 원문 링크·status·발표시각 이상으로 못 막는다는 사실을 받아들이고 MCP를 열지 |
| D-3 | GLOF §N-R 연구 예외 (S-B 착수 시점에 재질의) |

**법률 확인 필요(§9.3 추가)**: 기상법 예보 발표 제한(외부 AI가 "EARTHUS 예보"로 재서술할 때) · 기상청 API허브·공공누리 자료의 제3자 재배포 범위 · MCP 이용 기록·좌표 딥링크의 PIPA·위치정보 처리 → 약관 개정(D7과 같은 R0에 묶음).

---

## 8. 이 문서가 뒤집은 것 (기록)

1. "시뮬레이션은 사용자 AI 연결 동의 뒤에만" → **시뮬 사용 동의 + PRO로 분리.** 이유: AI 연결을 게이트로 두면 ChatGPT Plus·안드로이드 사용자가 PRO를 결제해도 시뮬을 못 쓴다.
2. "사용자 AI 연결은 세상에 없다"(구두) → **과한 표현.** 없는 것은 "서버가 사용자 구독 쿼터를 대신 소비하는 경로" 하나다.
3. "우리 LLM은 서버비 0"(구두) → **부정확.** GPU가 0이고 토큰 비용은 0이 아니며, tokens가 기록되지 않아 크기를 말할 근거가 없다(P1에서 계수 추가).
4. "Simulation에 GPU가 필요 없다"(구두) → **현재 엔진에 한해 참.** Tier 3·4와 Track B는 GPU/HPC 계층이 필요하다(§5.5).
