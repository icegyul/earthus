# EARTHUS CORE ARCHITECTURE & EXECUTION CONTRACT

**문서 ID**: EARTHUS-CORE-ARCHITECTURE-AND-EXECUTION-CONTRACT-2026-09-14
**성격**: 구현 계약. 원칙을 다시 논의하지 않는다. 여기 적힌 것은 파일·함수·필드·시험으로 내려간다.
**상위**: `EARTHUS-MASTER-DECISION-2026-09-14.md`(Core Principle 확정). 이 문서는 그 결정을 구현 명세로 내린 것이다.
**정본 우선순위**: PRODUCT-STRUCTURE 09-14 > LAYER-PLAN 09-14 > MASTER DECISION > **이 문서** > 지시서 09-05 > 전략문서.

> **Core Principle = 확정 / Implementation Policy = 일부 미결정.**
> 미결정 항목(MASTER DECISION §7의 D-A~D-H·D-3)은 이 문서에서도 미결정이다. 결정 전에는 해당 항목에 손대지 않는다.

---

## §A. System Ownership

| Layer | Owner | 교체 | 실체 |
|---|---|---|---|
| Data / Provenance | **EARTHUS** | 내부 | S3 `archive/`(불변) · 공개 접두사 8종 · Supabase 색인 |
| Intelligence | **EARTHUS** | 내부 | 인텔 패킷 v1 · `EVIDENCE_KIND` 10종 · `phenomenon-relations` |
| Simulation Engine | **EARTHUS** | 내부 | 계산 엔진 5종 · `SimulationRunRecord` · `runRef` |
| Narrator | 교체 가능 | **YES** | `aws/earthus-llm`(기본) · 사용자 선택 모델 |
| External AI | 사용자 선택 | **YES** | MCP 커넥터 · 내 키 서술자 |

**불변식 1** — Owner가 EARTHUS인 층은 외부 모델이 만든 값으로 채워지지 않는다.
**불변식 2** — 교체 가능한 층이 사라져도 Owner 층은 그대로 동작한다(띠는 LLM 없이 돈다).

---

## §B. Core Architecture (승격)

```
USER
  ├── EARTHUS UI ──────────┐
  └── External AI (선택) ──┤
                           ▼
                     INTELLIGENCE        ← 사실·근거를 만든다 (LLM 아님)
                           ▼
                     TOOL / DATA
                           ▼
              EARTHUS SIMULATION ENGINE  ← 계산한다
                           ▼
                    SimulationRunRecord
                           ▼
                        runRef           ← 계산의 정본을 증명한다
                           ▼
                     RESULT LAYER
                           ▼
              3D  ·  Report  ·  Narration
```

**폐기**: `AI → Simulation`(AI가 계산한다).
**확정**: `AI는 EARTHUS를 호출할 수 있다. Simulation은 EARTHUS Engine이 수행한다.`

---

## §C. Intelligence Contract

Intelligence가 먼저 `data → packet → badge → evidence → context`를 만든다. Narrator는 그 다음 `packet → explanation`만 한다.

### C-0. Interaction Intent Contract — 2026-09-18 추가

**새 제품 철학이 아니다.** 기존 L1/L2/L3 점진적 공개(LAYER-PLAN)와 §C·§K·§L의 실행 경계를 UX에서 더 정확하게 드러내는 작업이다.

```
SELECT ≠ INFORMATION ≠ INTELLIGENCE ≠ SIMULATION

SELECT
사용자가 지구상의 현상/대상을 선택한다.
이미 로드된 데이터 및 패킷만 사용한다. 새 요청 없음.

INFORMATION
선택된 컨텍스트의 관측·상태·비교·근거를 표시한다.
이미 생성된 패킷을 읽을 뿐, 새로운 심층 분석을 자동 실행하지 않는다.

INTELLIGENCE
사용자가 명시적으로 요청했을 때 packet을 기반으로 설명/서술을 제공한다.
LLM은 사실·수치·상태·확률을 새로 계산하지 않는다 — packet이 이미 다 만든 것을 문장으로 입힐 뿐이다.

SIMULATION
사용자가 명시적으로 선택한 경우에만 검증된 capability를 확인하고 Scenario UI로 진입한다.

RUN SIMULATION
실제 계산은 사용자가 RUN을 명시적으로 요청했을 때만 실행한다.
```

**실시간 계산 경계는 정확히 둘뿐이다**: **① LLM/Narrator 호출(INTELLIGENCE 진입 시)** · **② Simulation RUN(§D 정식 흐름)**. SELECT·INFORMATION 둘 다 "계산 안 함"이 아니라 **"이미 배치 Lambda가 만들어 둔 패킷을 읽을 뿐"**이다 — Intelligence의 사실·근거 자체는 EARTHUS가 먼저 packet으로 만들고, Narrator는 그 packet을 설명하는 역할일 뿐이라는 원칙(위 문단)과 정확히 같은 말이다. **"LLM이 Intelligence 데이터를 계산한다"는 문장은 어디에도 쓰지 않는다.**

이 계약이 막는 것: 개발자가 "탭했으니까 Intelligence API 한번 부르자"처럼 구현하는 것. SELECT·INFORMATION 단계에서 LLM 호출·Simulation 실행이 일어나면 계약 위반이다.

**Context Action은 새 UI 컴포넌트가 아니다.** M1의 바텀시트(peek/half/full)에 흡수한다:

```
탭 → SELECT
바텀시트 peek → SELECT
바텀시트 half/full → INFORMATION → (버튼) INTELLIGENCE / SIMULATION
```

**롱프레스를 Context Action의 기본 제스처로 확정하지 않는다** — 레이어 피커에 이미 "길게 눌러 핀"이 있어서, 같은 제스처에 의미가 두 개 생긴다. 데스크톱 우클릭은 이 계약에서 다루지 않는 별도 결정 사항으로 남긴다.

**INTELLIGENCE 화면 구성 — WHY/WHAT/NEXT/IMPACT/EVIDENCE(5절)**: 기존 "질문 5개"(why/next/impact/related/report, LAYER-PLAN §4.1)를 그대로 재편한 것이다 — 새 내용이 아니다.

| 절 | 패킷 근거 | 없으면 |
|---|---|---|
| WHY | `conditions[]` — 함께 나타난 조건, 인과 아님 | 절 자체를 숨김 |
| WHAT | `current`+`change`+`anomaly`+`pattern` | 절 자체를 숨김 |
| NEXT | 부록 B 4유형(A 기관인용/B 검증통계모델/C 물리시뮬/D 문헌) — **Intelligence의 핵심 상품, 빠뜨리지 않는다** | 절 자체를 숨김 |
| IMPACT | `related[]` (= FOR ME와 같은 것) | 절 자체를 숨김 |
| EVIDENCE | `sources[]`+`confidence`+`coverage.missing` | 항상 있음(최소 출처) |

**REPORT는 이 5절에 없다** — EXPLORER 티어의 별도 발행 산출물(P5)이지 Intelligence 패널의 절이 아니다. **빈 NEXT 카드를 만들지 않는다** — 결과가 없으면 절 전체를 숨긴다(패킷 계약의 `coverage.missing` 원칙 그대로).

### C-1. 서술자에게 넘기는 것 / 넘기지 않는 것

| 넘긴다 | 넘기지 않는다 |
|---|---|
| 인텔 패킷 v1의 절(current/change/anomaly/pattern/conditions/related/sources) | `coverage.missing`에 있는 절 (프롬프트에서 **제거**해서 준다) |
| `confidence.grade` (HIGH/MEDIUM/LOW/UNKNOWN) | `confidence` 내부 수치·가중치 |
| 특보 **메타**: `{id, kind, status, issuedAt, officialUrl}` | 특보 **본문** (원문 카드는 코드가 결정적으로 삽입) |
| `ageMin` · `slaMin` (숫자) | — |

### C-2. API 레벨 규칙 (프롬프트 약속이 아니라 서버 바이트)

> **LLM은 packet 외의 숫자·상태·확률·결과를 생성할 수 없다.**

`aws/earthus-llm/`에 결정적 후처리를 둔다. 정규식·문자열 비교만 하며 그 이상으로 키우지 않는다(새 엔진 아님).

| 검사 | 걸리면 |
|---|---|
| `FORBIDDEN_CAUSAL` 9어휘 | 답 전체를 `insufficient`로 교체 |
| `%` · 확률 어휘 — 패킷 `quotedOfficial` 필드와 **정확히 일치할 때만** 통과 | 〃 |
| `confidence` 근처 숫자 (4단계 외) | 〃 |
| `coverage.missing` 절 이름 언급 | 〃 |
| 대피·피난·피해액 어휘 (§J) | 〃 |
| 특보 `status`가 유효한데 "해제·종료·lifted·cancelled" | 〃 |
| 스냅샷에 없는 수치 | 〃 |

**부분 삭제 금지** — 문장을 잘라내면 더 위험하다. 답 전체를 교체하고 사유 코드를 남긴다.

### C-3. 어휘 단일 정본

`EVIDENCE_KIND` 10종 · `FORBIDDEN_CAUSAL` 9어휘 · 고정 문장(ko/en)을 **한 파일**에 두고 Python·JS가 같이 읽는다. 정규식을 두 언어에 중복해 박지 않는다.

---

## §D. Simulation Contract

```
Simulation Request
      ↓  ① Consent Check      시뮬 사용 동의(데이터 이용·계산 처리) — 철회 가능·기록
      ↓  ② PRO Check
      ↓  ③ Human Approval     REQUESTED
      ↓  ④ Simulation Engine  Lambda(초) | Fargate·Batch(분)
      ↓  ⑤ SimulationRunRecord
      ↓  ⑥ runRef
      ↓  ⑦ Result Layer
      ↓  ⑧ 3D · Report · Narration
```

**불변식 3** — External AI는 이 흐름에 없다. 아래 경로만으로 완전히 동작해야 한다.

```
PRO User → EARTHUS Intelligence → Simulation
```

`PRO = Simulation` 상품 약속이 여기에 걸려 있다.

**불변식 4** — 외부에서 들어온 숫자는 `SIMULATION` 배지를 받지 못한다. 사용자 AI가 계산해 온 값은 `VISUALIZATION_ONLY`(점선·"진리 주장 없음")까지만 올라가며, 푸시·FOR ME 카드·안전 판단에는 들어가지 않는다.

**불변식 5** — 자동 실행 없음. research-runtime은 `127.0.0.1:8788`이라 공개 앱이 부를 수 없고, 불러서도 안 된다. 연결은 "사람이 돌린 실행을 사건에 등재하는" 방향이 먼저다.

**상태 기계**: `REQUESTED → QUEUED → RUNNING → SUCCEEDED | FAILED | CANCELLED`

---

## §E. runRef — immutable provenance reference

`runRef`를 단순 ID가 아니라 **하나의 실행에 대한 불변 출처 참조**로 승격한다.

**원장을 둘로 만들지 않는다.** 정본 스키마는 `SIMULATION_PLATFORM_MAPPING.md` §6.2의 `SimulationRunRecord`이고, 새 스키마를 만들지 않는다. 아래는 **이미 있는 칸 ↔ 이번에 추가하는 칸**의 대조다.

| 필요한 것 | 정본 칸 | 상태 |
|---|---|---|
| engineVersion | `reproducibility.engineVersion` | 있음 |
| modelVersion | `modelVersion` | 있음 |
| inputDatasetVersion | `datasetVersions[] {datasetId, version, sha256, evidenceKind}` | 있음 |
| parameters | `forcing.params` · `assumptions[]` | 있음 |
| executionTime | `computedAt` | 있음 |
| resultArtifact | `outputRef` | 있음 |
| 재현 | `reproducibility.{modelSourceSha256, dependencyLockSha256, resultArraySha256}` | 있음 |
| 검증 | `validation.{planId, performed, method, result, resultRef}` | 있음 |
| **spatialExtent** | — | **추가** |
| **temporalRange** | — | **추가** |
| **approval** | — | **추가** — `{by, at, method}` 사람 승인(§D ③) |
| **consent** | — | **추가** — `{scope, at, revocable:true}` 시뮬 사용 동의(§D ①) |

규칙(변경 없음): `truthStatus`는 항상 `'SIMULATION'` 상수 — 계산하지 않는다. `assumptions[]`·`limits[]`는 비울 수 없다. `validation.performed=false`면 `result`는 `null`이며 0으로 채우지 않는다. 런타임이 안 주는 칸은 `null` — 있는 척하지 않는다.

**검증기 `aws/_shared/simulation_link.py`는 아직 존재하지 않는다. 만든다.**
미등재 runtime/modelId 거절 · `truthStatus` 강제 · 빈 `assumptions`/`limits` 거절 · `performed=false`인데 `result` 있으면 거절 · 위 4개 신규 필드 필수 검사.

**결과 표시**: 화면의 모든 시뮬 값은 `runRef` 링크와 `limits[]` 문장을 달고 나간다. 패킷에 결과값을 복사하지 않는다 — `runRef`만 참조한다.

---

## §F. Narrator Adapter

```
EARTHUS Core
├── Intelligence
├── Simulation Engine
├── Provenance
├── Result Layer
└── Narrator Adapter
      ├── EARTHUS Narrator (기본 · earthus-llm)
      ├── OpenAI
      ├── Claude
      └── Grok
```

- 어댑터는 **서술자만** 바꾼다. §C-1 입력 계약과 §C-2 후처리는 어댑터 뒤가 아니라 **앞**에 있다 — 어떤 모델이든 같은 문을 지난다.
- 모델이 바뀌어도 **EARTHUS Core는 그대로**다.
- 기본 서술자를 제거하지 않는다. 제거하면 키 없는 사용자가 서술을 잃는다.
- 사용자가 고르는 것은 서술자이지 계산기가 아니다.

**정직하게 적어 둘 것**: 구독 계정을 그대로 연결하는 경로는 없다(별도 API 키 필요). 어댑터 뒤 모델의 문장은 강제할 수 없다 — 우리가 강제하는 것은 우리가 내보내는 바이트뿐이다.

---

## §G. Simulation Capability Registry

정본: `prototype/v2-three/js/sim-questions.js` `SIM_CAPABILITIES`. 현재 형태 그대로 쓴다.

```js
'hazards.tsunami': {
  menu, engine, engineRef: 'aws/tsunami-eta/handler.py',
  status: SIM_STATUS.AVAILABLE,
  inputs, outputs, horizons,
  questions: [{ id, ko, en, action, status }],
}

'hazards.flood': {
  status: SIM_STATUS.NOT_AVAILABLE,
  questions: [{ id, ko, en, reasonKo: '검증된 수문 엔진이 없습니다', reasonEn: '…' }],  // action 없음
}
```

### G-1. 잠긴 시험이 실제로 강제하는 것

`tools/earthus-v53/simulation-questions.test.mjs` 실측:

| 단정 | 뜻 |
|---|---|
| `PHENOMENA` 개수 = **66** | **새 현상 추가는 이 수를 바꾼다 → PD 승인 사항** |
| 모든 능력 id ∈ `PHENOMENA` | 정본에 없는 현상의 능력을 만들 수 없다 |
| 질문 1~3개, ko/en 양쪽 필수 | |
| `SIM_STATUS` = 정확히 5종 | |
| `available`·`limited` → `engine` + `engineRef` + **파일이 실제로 존재** | 거짓말 금지 |
| `not_available` → `action` 없음 + `reasonKo`/`reasonEn` 필수 | 없는 이유를 말한다 |

> **"능력 정확히 3개"라는 단정은 없다.** 기존 현상에 대해 `not_available` + 사유로 등재하는 것은 지금 바로 가능하며, 시험은 그것을 막는 게 아니라 정직함을 강제한다.

### G-2. 등재 작업

**대조표 완료: `SIMULATION-CAPABILITY-CROSSWALK-2026-09-14.md`.** 판정은 셋이다 — 지금 등재 가능 **9건**(기존 현상 있음, PD 승인 불요) / 현상 신설 필요 **8건**(66 변경, PD 승인) / 정정 **3건**(`ocean.wave`·`space.satellite`·`hazards.typhoon`).
실측: `SIM_CAPABILITIES`는 이미 **12항목**이고 그중 `not_available`이 8건 — `not_available` + 사유 등재는 새 관행이 아니라 기존 방식의 확장이다.

**"Simulation"의 경계는 이미 정본에 있다.** `SIMULATION_PLATFORM_MAPPING.md` §0.1: *"그 밖 브라우저 내 계산(`sim-ocean.js` Gerstner 파도, `sat-layer.js` SGP4)은 **장면 표현**이지 기록 남는 실행이 아니다. `simulation_run` 대상이 아니다."*
→ **`available` = 기록 남는 검증된 계산(`simulation_run` 대상)**. 브라우저 장면 계산은 `limited` + 사유. 정정 후 `available`은 **1건**(`hazards.tsunami`)이 된다.
→ 정정은 `sim-questions.js`(status·사유) + `phenomenon-registry.js`(`capabilities.simulation`)를 **한 변경 단위로** 묶는다.

1. 19영역 ↔ `PHENOMENA` 66현상 **대조표**를 만든다. 대응 현상이 있으면 즉시 `not_available` + 사유로 등재.
2. 대응 현상이 없는 영역은 등재하지 않는다(현상 추가 = 66 변경 = PD 승인).
3. `ui-shell.js`의 GLOF 항목 문구 `'DEM+파열모델'`은 **실체 없는 문구다 — 제거**하고 사유 문장으로 바꾼다.
4. `MODEL`·`ILLUSTRATIVE` 같은 라벨은 `EVIDENCE_KIND` 10종에 없다 — 쓰지 않는다.

### G-3. status 승격 조건 (변경 없음)

`engineRef`(실제 파일) + `validationPlanId` + `limits[]` 가 없으면 status를 올리지 못한다. 허위 status 0건.

### G-4. 지역 UX와의 관계 — 2026-09-18 추가

축은 그대로 **현상(phenomenon)**이다. `SIM_CAPABILITIES`를 지역×현상 스키마로 바꾸지 않는다 — **이번 수정 범위 밖**이다.

§L의 `Phenomenon → Region → Capability` 흐름은 새 데이터 모델 없이, 기존 `not_available`/`limited` 사유 문장 **안에서 지역 정보를 서술로** 표현한다(예: "이 호수 한 곳만의 관측값입니다"). 지역별 상태를 지도에 공간적으로 색칠하는 것(Coverage Map)은 현상×지역 capability를 담을 새 스키마가 필요한 별도 작업이다 — §H에 향후 확장으로만 기록한다.

---

## §H. Tier → 개발 우선순위

### 지리적 확장 원칙 — 2026-09-18 추가 (가장 중요한 정정)

> **Simulation capability = 엔진 + 적용 지역 + 검증된 물리 가정.**
> 지역 확장은 엔진의 좌표 재사용이 아니라 **새 capability의 §N 재검증**이다.

**"엔진 하나를 만들면 지역은 따라온다"는 표현을 이 문서에서 완전히 제거한다.** 근거는 추측이 아니라 오늘 직접 확인한 사실이다 — GLOF의 Walder–Costa 공식을 알래스카(빙하댐·터널 배수)에서 네팔 남로낙(모레인댐)으로 좌표만 바꿔 그대로 쓰면, **실제 관측 첨두유량과 8~80배 차이**가 난다. 댐 형식이 다르면 물리 자체가 다르고, 물리가 다르면 §N ①(교과서 물리)부터 다시 통과해야 한다.

```
Tsunami Engine + 한국   → Capability A (운영, 39관측소, PTWC 대조로 검증됨)
Tsunami Engine + 일본   → Capability B (미착수 — JMA 検潮所 대조로 별도 검증 필요)
GLOF(터널배수식) + 알래스카 → Capability C (관측 인용만, 계산 아님)
GLOF(모레인댐식) + 네팔     → Capability D (다른 공식 필요 — Capability C의 확장이 아니다)
```

아래 Tier 표는 **"이 현상이 언젠가 이렇게 된다"가 아니라 "이 현상의 첫 capability 하나가 이 지역에서 이렇게 된다"**로 읽는다. 다른 지역은 각자 §N을 처음부터 다시 통과해야 승격된다.

| Tier | 내용 | 현황 | 계약상 지위 |
|---|---|---|---|
| **0** | Terrain/DEM · Time Engine · Spatial Grid · Provenance · runRef · Simulation API · Result Layer | 일부 존재 | **먼저 끝낸다.** §E·§G가 Tier 0이다 |
| **1** | 쓰나미 ETA 계열(한국) | 운영 1건 | 유일한 `available` 물리 — **이 capability 하나가 검증된 것이지, "쓰나미"라는 현상 전체가 검증된 게 아니다** |
| **2** | Flood · Hydrology · Extreme Rain · Storm Surge · Landslide · Glacier · GLOF · Wildfire · Ocean | 0건 | 대부분 **A(기관 인용)**부터. 물리는 지역별로 §N 통과분만 |
| **3** | Sea Ice · Permafrost · Coupled Ocean · Atmosphere · 장기 기후 | 자료 적재 전 | 자료부터 |
| **4** | Earth System Cascade | 연결표만 | runRef 연쇄 → 커플드는 그 뒤 |

**향후 확장 항목(이번엔 안 만듦)**: 현상×지역 capability를 공간에 표시하는 Coverage Map. 새 스키마(현상별 지리적 capability 상태)가 선행돼야 한다 — §G-4·§L-3 참조.

- 항목별 배치는 `SIMULATION-VISION-LADDER-2026-09-14.md`에서 확정했다. **축을 섞지 않는다**(같은 문서 §0):
  - **유형 A/B/C/D** = 증거 종류(배지·요금제 결정) — 부록 B 정본. 난이도가 아니다.
  - **단계 NOW / NEXT / RND / FUTURE / NEVER** = 언제 손대나.
  - **Tier 0~4** = 제품 성숙도.
  - 한 도메인이 여러 유형을 동시에 가진다(태풍 = A 인용 + C 가정 실험 + D 문헌). 도메인당 글자 하나가 아니다.
- 사다리가 잡은 **운영 중 규율 위반 9건**(§2)은 새 기능보다 먼저다. 특히 Open-Meteo 비상업 조항이 20+ Lambda에 걸려 있다.
- **19개를 제품 메뉴에 먼저 박아 개발된 것처럼 보이게 하지 않는다.** 등재는 §G-2대로 `not_available` + 사유로만.
- 3D 지형을 계산 격자로 쓰는 것은 V-gate 1(지형)·2(해구) 실기기 통과 뒤다. 그 전까지 계산 격자는 서버 쪽 GEBCO·DEM COG다.

---

## §I. 빌드 순서 — 전체 보강 반영 (2026-09-18 확정: "다 한다")

**PD 결정(2026-09-18)**: 4개 우선순위(기반·PRO 가치·배선 정정·PD 결정 적체) 중 하나만 고르지 않는다. 전부 이번 회차에 넣는다. 아래가 R0→P6의 **하나로 합친 순서**다 — 7주 뼈대(R0→P0→P1+M1→§14→P2a→P3→P4→S-A→P2b·P5·P6)는 안 바뀌고, 오늘 나온 보강 항목이 각자의 정확한 자리에 들어간다.

```
R0  재현 가능 상태
    ├─ 미추적 정리·정본 커밋·Postgres·CI            (기존)
    ├─ D7 사전등록자 확인·삭제                      (기존)
    ├─ [신규] Open-Meteo 비상업 조항 감사표         (L-1) — 걸리는 Lambda 20+ 목록만 R0에서 만든다.
    │        전환 여부(유료 구독 vs GFS/ECMWF 직접)는 PD 결정, 실행은 이후 단계
    └─ [신규] jma-warn 피드 정지를 health.json에 기록 (2026-05-28~, 사다리 V-8)

P0  계약
    ├─ intel_contract.py · intel-questions.js · phenomenon-relations.js · 66건 재감사  (기존)
    ├─ kma-warn cap 필드                                                            (기존)
    ├─ [신규] §G-2 정정 3건: ocean.wave·space.satellite → limited,
    │        hazards.typhoon temporalMode 문구 수정                — PD 승인 필요
    ├─ [신규] §G-2 등재 9건 (표에 있음) + 알래스카 GLOF 신규 수집기
    │        `aws/glacial-lake-us`(가칭) + phenomenon-registry 알래스카 한정 갱신     — §L 선행조건
    └─ [신규] `aws/_shared/simulation_link.py` 신설 ← 원래 S-A 항목이었으나 앞당김.
             이유: 2순위(엔진 개수) 결핍의 유일한 진짜 병목. 여기서 안 만들면
             S-A가 이것부터 다시 만들어야 해서 늦어진다. §D/§E 계약이 이미 이 문서에 있다.

P1+M1+T  태풍 띠 + 모바일 셸 + 티어 정합 (병행, 기존 그대로 T를 여기로 당김)
    ├─ cyclone-events→v1 패킷, intel-strip.js, 모바일 셸               (기존)
    ├─ entitlement.js·access-mode.js·i18n.js·billing.sql 정합 (T)      (기존, 위치만 당김)
    ├─ §L 지역 UX (독립 목록 아님 — 기존 현상 메뉴에 지역선택+capability 표시 추가) (개정)
    └─ [신규] §L 티어 정정: 태풍·알래스카 GLOF 카드 = FREE로 내림.
             PRO는 쓰나미 실행(sim-q) 한 칸만 게이트

§14 1차 측정

S-A  표류 승격
    ├─ (simulation_link.py는 P0에서 이미 있으므로) 등재만: 사람 실행 → SimulationRunRecord → Fargate 큐   (기존, 더 빨라짐)
    └─ [신규] `ScenarioCompare` 컴포넌트 착수 — 표류가 첫 baseline vs branch 비교 대상
             (2순위 "만약에" 결핍의 실제 구현 지점)

P2a → P3 → P4 서술
    (기존 그대로: 롤업 → ocean.sst·hazards.earthquake → earthus-llm 규칙 7·8 + 골든셋)

§14 2차 측정

[신규] 여진(아프터샥) 승격 — §N 순서의 다음 물리 엔진. PRO 엔진 수 2→3.
       simulation_link.py·ScenarioCompare 둘 다 이미 있어 S-A보다 빠르게 붙는다.

[신규] FOR ME × 시뮬 연결 — 감시(E, 09-07 기존 기능)에 시뮬 결과를 붙이는 배선 작업.
       "내가 안 찾아도 알려준다"는 2순위 결핍의 실제 구현 지점.

P2b · P5 · P6
    ├─ 평년값 · phenomenon-intel 보고서 발행 · 나머지 현상               (기존)
    └─ [보강 후보] P5(보고서·runRef export)를 이 묶음 앞쪽으로 당길지 — PD 판단
       (2순위 "내보내기" 결핍이 여기 걸려 있어 당길수록 PRO 가치가 빨리 두터워진다)

MCP  P3 뒤 · PD 승인 조건부 · 9/30 이후 (기존, 안 바뀜)
```

**PD 결정 적체를 실행이 막히기 전에 미리 배치한다** — 각 결정이 실제로 필요한 시점:

| 결정 | 필요 시점 |
|---|---|
| §G-2 정정 3건 승인 | P0 착수 전 |
| Open-Meteo 전환 방향(L-1) | R0 감사표 나온 직후 |
| `EARTHUS_ANALYSIS`가 §J "새 엔진"인지(L-4) | P0~P1 사이, 묶음 3(기준선류) 착수 전 |
| §L 신설 8건(현상 추가, `PHENOMENA` 66 변경) | 손대지 않는다 — 이번 순서엔 없음 |
| D-A~D-H(MCP 정의 등) | MCP 착수(9/30 이후) 전까지만 필요, 급하지 않음 |

**MCP는 Core가 아니다.** Core를 외부에서 호출하는 창구이므로 마지막이다. Core가 없으면 빈 도구가 된다.

**개발자 1명 기준**: 신규 엔진(여진)은 표류(S-A) 뒤에 붙는다 — 동시 진행 안 한다(사다리 L-7 "동시 2개 이하" 그대로 적용).

---

## §J. 계약 위반 검사 (시험으로 잠근다)

| # | 검사 | 자리 |
|---|---|---|
| J-1 | 패킷 값에 `unit`·`kind`·`source`·`at`이 없으면 거절 | `intel_contract` 검사기 |
| J-2 | 산식 id 없는 `confidence` 절 거절 → `coverage.missing` | 〃 |
| J-3 | `conditions[]`·`related[]`에 `FORBIDDEN_CAUSAL` 0건 | 〃 |
| J-4 | 서술 응답에 §C-2 일곱 검사 위반 0건 (골든셋 50건 정적) | 서술자 시험 |
| J-5 | `SimulationRunRecord` 4필드(spatialExtent·temporalRange·approval·consent) 필수 | `simulation_link.py` |
| J-6 | `truthStatus != 'SIMULATION'` 거절 · 빈 `assumptions`/`limits` 거절 | 〃 |
| J-7 | 동의·PRO·승인 없이 실행 요청 거절 | `sim-link.js` + 서버 |
| J-8 | `available`인데 `engineRef` 파일 없음 0건 | 기존 잠긴 시험 |
| J-9 | `not_available`인데 사유 없음 0건 | 〃 |
| J-10 | 화면 수치 중 배지·출처·시각 없는 것 0건 | `test_lab_wording` 확장 |

---

## §K. Simulation 화면 — SCENARIO · 3D · TIME · RESULT (2026-09-18 추가)

**티어 경험 사다리** (상품구조 정합, §6.5와 어긋나지 않음):

> FREE = **SEE**(무엇이 일어나는가) · EXPLORER = **UNDERSTAND**(왜 그런가, Intelligence) · **PRO = WHAT IF**(조건을 바꾸면?, Simulation 실행)

**PRO는 "지역이 열리는 것"이 아니라 검증된 capability를 실행할 권한이다** — §H 지리적 확장 원칙과 정합. "PRO니까 한국만 된다"가 아니라 "PRO니까 검증된 capability를 실행할 수 있다"이고, 오늘은 그게 한국 쓰나미 하나다.

### K-1. 네 요소만

```
① 3D EARTH   결과를 보는 공간 — 기존 지구본 재사용, 새 뷰 아님
② SCENARIO   조건 변경 — baseline 사건 위에서 §D·§F가 이미 허용한 매개변수만
③ TIME       결과의 시간 변화 재생
④ RESULT     runRef · limits[] · 저장
```

### K-2. Preview와 RUN을 분리한다 — 배지가 다르다

| | 트리거 | 계산 위치 | 배지 | 게이트 |
|---|---|---|---|---|
| **Preview** | 슬라이더 드래그 | 가벼운 근사 또는 이미 계산된 값 사이 보간(클라이언트) | **없음** — 점선 또는 "미리보기" 라벨 | 없음 — 동의·PRO 불필요 |
| **RUN SIMULATION** | 버튼 클릭 | §D 정식 흐름(동의→PRO→승인→엔진) | **SIMULATION**(이중선) | §D 그대로 |

**Preview에 `SIMULATION` 배지를 붙이지 않는다.** 슬라이더만 만졌는데 계산된 것처럼 보이면, `runRef` 없는 숫자가 진짜처럼 보이는 §J 위반과 같은 문제가 생긴다. 시각 언어(점선·흐린 색·"미리보기")로 RESULT와 분명히 다르게 그린다.

### K-3. SCENARIO는 "허용된 조건"만 — 자유 배치 아님

진원 위치·규모를 아무 데나 놓지 않는다. **baseline 사건(`baselineEventId`) 위에서 §D·§F가 이미 정의한 매개변수만** 움직인다 — 표류의 windage α 스윕, 태풍 B 파라미터 스윕 같은 것. 새로 정의할 필요 없이 이미 계약에 있다.

**쓰나미(`hazards.tsunami`)는 지금 여기 해당하지 않는다** — 사건별 단회 계산이라 사용자가 바꿀 수 있는 매개변수 자체가 없다(`PILOT-SCREEN-SPEC-TEMPERATURE-TSUNAMI-2026-09-18.md` §3). Scenario·Preview를 실제로 증명하는 첫 사례는 표류(S-A)다. 쓰나미의 SIMULATION 화면은 BASELINE·TIME·RUN·RESULT만 있고 SCENARIO·PREVIEW는 비어 있는 게 정직하다.

### K-4. TIME 재생 — 지금 되는 것과 안 되는 것

| 현상 | 시간 재생 |
|---|---|
| 쓰나미 | **가능, 거의 공짜** — `isochronesMin`(30·60분 등시선)이 이미 시간별 자료다 |
| 표류(S-A 이후) | 가능 — 궤적 자체가 시계열 |
| 산불 확산 | **불가능** — §H NEVER(자체 확산 모델·특허 위험) |
| 홍수 침수 확장 | **불가능** — 수문 파이프라인 없음(§H Tier 2 FUTURE) |

시간 재생은 **쓰나미부터 시작한다.** 다른 현상으로 넓히는 건 그 현상이 §H Tier를 올라간 뒤의 일이다.

### K-5. My Simulations — 새 스키마 아님

`SimulationRunRecord`(§E)가 이미 `eventId`·`computedAt`을 갖는다. "내 시뮬레이션 목록"은 이 표를 사용자별로 조회하는 쿼리·UI 레이어이지 새 데이터 모델이 아니다. `ScenarioCompare`가 그 비교 화면이다(§I S-A에서 착수).

### K-6. Simple → Advanced

1단계: Baseline / 조건 변경(허용된 것만) / Time / Run. Advanced는 나중에(limits·검증 리포트·매개변수 원값)만 연다.

### K-7. 계획 반영

`ScenarioCompare` 착수(S-A) 시점에 K-1~K-2(4요소 골격 + Preview/RUN 분리)를 같이 만든다. K-4 시간 재생은 쓰나미 데이터로 §14 1차 이후 아무 때나 붙일 수 있다(새 엔진 불필요, 기존 `isochronesMin` 시각화만).

---

## §L. 지역 UX — Simulation Coverage (전면 개정: 2026-09-18)

**폐기**: "서비스 범위는 한국·일본·미국(일부)로 좁힌다"(9/18 초판). 이 문장이 EARTHUS를 일부 지역만 다루는 서비스처럼 보이게 하는 **가장 큰 UX 왜곡**이었다. 독립된 "시뮬레이션 가능한 지역" 목록 화면도 폐기한다 — 있던 현상 메뉴 옆에 쪽문을 하나 더 만든 것이었다.

### 관통 원칙 (§G-4·§H·§K·상품구조 전체에 적용)

1. **EARTHUS의 탐색 공간은 전 세계다.**
2. **Simulation의 지리적 범위는 현재 검증된 계산 능력에 의해 결정된다.**
3. **지역 확장은 엔진의 단순 복제가 아니라 지역별 검증을 통과한 capability의 추가다.**

### L-1. 흐름 — 있던 것에 얹는다, 새 진입점이 아니다 (2026-09-18 개정)

**"조건이 달라지면? → §K Simulation 실행" 문구를 삭제한다** — WHAT IF가 독립 단계처럼 보였다. §C-0 Interaction Intent Contract에 맞춰 다시 그린다:

```
기본 지구본(전 세계, 확대 제한 없음)
  ↓ Phenomenon 선택          ← phenomenon-registry.js, LAYER-PLAN 그대로
Context 선택 (지점 SELECT / 지역 REGION)
  ↓
INFORMATION                  ← 바텀시트 peek/half, 이미 있는 패킷만 읽음
  ├─ INTELLIGENCE            ← 사용자가 명시적으로 열 때만(§C-0). WHY/WHAT/NEXT/IMPACT/EVIDENCE
  └─ SIMULATION               ← capability 확인(§G) → 가능한 경우만
          ↓
       Scenario → Preview / Run(§K)
          ↓
       Result → runRef
```

핵심은 그대로다: **전 세계를 탐색하고 → 현상을 선택하고 → 지역/컨텍스트를 보고 → 가능한 capability를 이용한다.** 바뀐 건 Intelligence·Simulation을 사용자에게 노출하는 방식뿐이다.

어느 지역을 봐도 **정직한 상태가 뜬다.** 대부분은 `not_available` + 사유(`UnavailableCard`)이고, 오늘 기준 세 조합만 그 이상이다. **막는 게 아니라 "여기까지 안다"고 보여준다.**

### L-2. 오늘(2026-09-18) 기준 — 비어 있지 않은 조합 3건 (예시이지 닫힌 목록이 아니다)

| 지역 | 배지 | 근거 |
|---|---|---|
| 한국 전 해안 | **✅ SIMULATION**(계산됨) | `hazards.tsunami` `available`, 운영 중 |
| 한국·일본 | 📋 `OFFICIAL_FORECAST`(기관 인용) | KMA+JMA 베스트트랙+ECMWF ENS — 계산 아님 |
| 미국 알래스카 주노 | 📋 `OFFICIAL_OBSERVATION`(기관 인용) | NWS NWPS(`MNDA2`)+USGS NWIS(`15052500`) — **수집기 미존재, 신규 필요** |

배지는 **✅ 계산됨 / 📋 기관 인용** 둘로만 나눈다. 셋을 같은 표시로 섞지 않는다(§J).

**"미국"은 알래스카 주노 한 곳뿐이다.** 다른 지역(아프리카·유럽 등)을 봤을 때도 **화면은 열려 있고**, 안에 `not_available` + 이유만 있을 뿐이다 — 지역 자체를 안 보여주지 않는다.
**일본은 특보 원문이 지금 안 나온다** — `jma-warn` 피드가 2026-05-28부터 정지 상태(§H 사다리 V-8). 문구에 "태풍 경로만 가능·특보 원문은 자료 지연"을 명시한다.

### L-3. Coverage Map(공간 지도)은 이번엔 안 만든다

현상×지역 상태를 지구 위에 색칠해서 보여주는 지도는 매력적이지만, **새 데이터 모델**(현상별 지리적 capability 스키마)이 선행돼야 한다 — 지금 `SIM_CAPABILITIES`는 현상 하나에 상태 하나뿐이라 "한국 해안은 되고 칠레는 안 된다"를 표현할 자리가 없다. **향후 확장 항목으로 기록만** 한다(§G-4·§H).

### L-4. 선행 조건 (변경 없음)

1. **정정 3건**(§G-2): `ocean.wave`·`space.satellite` → `limited` 강등, `hazards.typhoon` 문구 수정.
2. **신규 소형 수집기**(가칭 `aws/glacial-lake-us/handler.py`): NWS NWPS API + USGS NWIS(둘 다 무인증·퍼블릭 도메인)를 당겨 `hazards/glof-alaska.json`(가칭)에 쓴다.
3. **`phenomenon-registry.js` 갱신**: `hazards.glacial_lake_flood`를 **알래스카 지역 한정**으로 켠다 — `scope`·문구로 "이 호수 하나의 관측값"임을 못 박는다. 전지구 GLOF 능력이 열린 것처럼 보이면 안 된다.

### L-5. 계획 반영 — 어디에 끼우나

| 단계 | 더하는 것 |
|---|---|
| P0 | 정정 3건 + 신규 수집기(`glacial-lake-us`) + `phenomenon-registry.js` 알래스카 한정 갱신 |
| P1 | **독립 목록 아님** — 기존 현상 메뉴(`intel-strip.js`)에 지역 선택 + capability 표시를 추가. `main.js`의 `onAction`(`ds.sim === 'tsunami-reach' | 'cyclone-track' | ...`) 라우팅 재사용 |
| §14 1차 | 기존 성공기준 시험("메뉴→NEXT 3탭 이내")이 그대로 검사 대상 포함 |

**R0의 순서는 안 바뀐다.**

---

## §M. 이 문서가 손대지 않는 것

미결정(MASTER DECISION §7): D-A(MCP 정의) · D-B(실행 자리) · D-C(공개 접두사) · D-D(percentile) · D-E(FREE Ask 한도) · D-H(특보 오독 수용) · D-3(GLOF §N-R).

법률(§9.3): 기상법 예보 발표 제한 · 기관 자료 제3자 재배포 범위 · PIPA·위치정보.

이 항목들은 결정·확인 전까지 구현하지 않는다.
