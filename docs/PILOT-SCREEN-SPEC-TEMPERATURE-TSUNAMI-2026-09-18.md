# PILOT SCREEN SPEC — Temperature · Tsunami

**문서 ID**: PILOT-SCREEN-SPEC-TEMPERATURE-TSUNAMI-2026-09-18
**성격**: `EARTHUS-CORE-ARCHITECTURE-AND-EXECUTION-CONTRACT-2026-09-14.md` §C-0(Interaction Intent Contract)를 현상 둘에 대해 화면 단위로 끝까지 채운 것. 새 화면 디자인이 아니라 **한 현상을 완전히 통과시키는 검증**이다 — 이게 되면 나머지 64개 현상은 같은 틀에 값만 갈아 끼우면 된다.
**선정 이유**: `weather.temperature` = SIMULATION이 항상 `not_available`인 **빈 케이스**(66개 중 대부분이 이 상태). `hazards.tsunami` = SIMULATION이 `available`인 **유일한 물리 케이스**. 둘 다 통과해야 "빈 것"과 "꽉 찬 것" 양쪽이 정직하게 그려지는지 안다.

각 단계는 **화면에 뜨는 것 / 읽는 것(어느 패킷·API) / 호출하는 것 / 호출하지 않는 것**을 명시한다(§C-0).

---

## 1. Temperature — 빈 capability 케이스

### SELECT (탭)

- **뜨는 것**: `서울 28.4°C · 20:10`. 배지 없음(레이어가 이미 그려 둔 값).
- **읽는 것**: 이미 렌더링된 레이어의 픽셀/좌표 값(`weather.temperature` 레이어가 이미 화면에 그려져 있어야 탭이 성립). 새 fetch 없음.
- **호출하지 않는 것**: 패킷 fetch, LLM, Simulation — 전부 없음.

### INFORMATION (바텀시트 half)

- **뜨는 것**:
  ```
  SEOUL · TEMPERATURE
  28.4°C                    [OFFICIAL_OBSERVATION 실선]
  1h  +0.6°C
  6h  +2.1°C
  24h 추이 그래프
  습도 72% · 바람 2.1 m/s    (같은 관측소 동반 관측치, 있으면)
  기상청 동네예보 81h         [OFFICIAL_FORECAST 실선]
  20:10 관측 · 기상청
  ```
  **ANOMALY(평년 대비)는 안 뜬다** — `weather.temperature`엔 아직 평년값 산식이 없다(§G-2 등재 9건 중 하나, 사유: "기온 예보는 기상청 발표를 인용합니다. 우리가 만든 기온 계산은 없습니다"). **없는 절은 숨긴다** — 빈 칸을 만들지 않는다.
- **읽는 것**: `intel/weather.temperature.json`의 `current`+`change` 절(P0/P1 산출물). `anomaly` 절은 `coverage.missing`에 사유와 함께 없음.
- **호출하지 않는 것**: LLM, Simulation.

### INTELLIGENCE (사용자가 명시적으로 "왜?" 누름)

```
WHY        오늘은 안 뜸(고기압 정체 등 conditions[] 없음) → 절 자체 숨김
WHAT       "1시간 전보다 0.6°C 올랐고, 6시간 전보다 2.1°C 올랐습니다."
NEXT       "기상청 동네예보: 오늘 밤 24°C, 내일 오전 22°C"  [OFFICIAL_FORECAST, 유형 A]
           (EARTHUS_ANALYSIS 기준선 없음 — 이 현상엔 아직 없다)
IMPACT     폭염특보 발효 중이면 OFFICIAL_WARNING 칩 표시, 아니면 절 숨김
EVIDENCE   기상청 ○○관측소 · 관측 20:10 · 예보 발표 17:00
```

- **읽는 것**: 위와 같은 패킷 절.
- **호출하는 것**: `earthus-llm` — WHAT·NEXT 문장을 패킷 값으로만 서술(§C-2 규칙, §C-1 넘기지 않는 것 그대로). 켜진 레이어 0이면 호출 안 함(기존 게이트).

### SIMULATION

- **뜨는 것**: `UnavailableCard` — "기온 예보 계산은 하지 않습니다. 위 NEXT의 기상청 예보를 참고하세요." 실행 버튼 없음.
- **읽는 것**: `SIM_CAPABILITIES['weather.temperature']` → `not_available`, `reasonKo` 필드.
- **호출하지 않는 것**: 아무것도. Scenario·Preview·Run 전부 없음 — 여기가 §H NEVER("자체 기상 예보")와 정확히 만나는 지점이다.

---

## 2. Tsunami — 완전한 케이스 (단, 뒤에 중요한 발견 있음)

### SELECT (탭)

- **평시**: 관측소 마커 탭 → `속초 · 감시 중 · 이상 없음`.
- **사건 발생 시**: 사건 마커 탭 → `M7.2 · 08:14 발생`.
- **읽는 것**: 이미 로드된 사건/관측소 레이어. 새 fetch 없음.

### INFORMATION

```
TSUNAMI · KOREA COAST
M7.2 · 08:14 · 진원 37.1N 141.8E     [OFFICIAL_OBSERVATION, USGS]
관측소 39곳 상태: 정상 37 · 지연 2
최근 특보: 없음 / [OFFICIAL_WARNING 원문 카드]
08:14 발표 · USGS FDSN
```

- **읽는 것**: 사건 패킷(있으면) 또는 `ocean/tsunami-eta.json` 색인의 `current`. 사건 없으면 "최근 30일 이력 없음"(HISTORY, 감시 상태).
- **호출하지 않는 것**: LLM, Simulation.

### INTELLIGENCE

```
WHY        "진앙이 해저이고 규모가 M6.5 이상입니다" (conditions[] — 계산 트리거 조건, 인과 아님)
WHAT       "39개 관측소를 감시 중이며, 2곳은 자료가 지연되고 있습니다."
NEXT       "도달시간 계산이 가능합니다 →"  [유형 C, SIMULATION으로 안내]
           + 기상청 지진해일통보문 원문 있으면 병기 [유형 A]
IMPACT     특보구역 ≤350km 이내 co_located 목록
EVIDENCE   USGS FDSN · GEBCO 0.2° · 기상청 통보문 · 관측 08:14
```

- **호출하는 것**: `earthus-llm`(WHY·NEXT 서술). NEXT가 자연스럽게 SIMULATION 진입 버튼을 겸한다(§C-0 "IMPACT는 FOR ME와 같은 것"과 별개로, 여기 NEXT가 §K 진입점).

### SIMULATION

- **capability**: `available` — `engineRef: aws/tsunami-eta/handler.py`.

```
BASELINE   이 사건(진앙·규모·발생시각) — 고정
SCENARIO   (없음 — 아래 "발견" 참조)
TIME       등시선 재생: 30 / 60 / … / 720분        ← §K-4, 거의 공짜(isochronesMin 이미 시간별)
PREVIEW    (없음 — 아래 참조)
RUN        [실행] → 동의 → PRO → 사람 승인(REQUESTED) → 엔진 → SimulationRunRecord
RESULT     runRef: eta-v1:20260918-0512
           limits: 장파 근사 · GEBCO 0.2° · 게시문 표 없으면 null
           39개 관측소 도달시간 표 + 등시선 지도
```

---

## 3. 중요한 발견 — Tsunami는 §K의 Scenario/Preview를 온전히 증명하지 못한다

`aws/tsunami-eta`는 **사건별 단회 계산**이다(`horizons`: "계속 미끄러지는 예보가 아니다"). 진앙·규모·발생시각은 실제 지진에서 고정으로 들어오고, **사용자가 바꿀 수 있는 "허용된 매개변수" 자체가 없다.** 그래서:

- **Scenario 단계가 정직하게는 비어 있다** — 바꿀 슬라이더가 없다.
- **Preview도 의미가 약하다** — 미리 볼 "달라진 조건"이 없다.
- **RUN은 사실 "재계산 요청"에 가깝다** — 새 시나리오 실행이 아니라 이미 정해진 계산을 승인해서 돌리는 것.

**§K-1~K-3(SCENARIO·Preview)을 실제로 증명하는 첫 사례는 Tsunami가 아니라 표류(S-A 이후)다** — 표류는 `windage α` 스윕이라는 진짜 "허용된 조건 변경"이 있다. Tsunami 파일럿은 **RUN→runRef→RESULT→TIME 재생**까지만 증명하고, Scenario/Preview 증명은 S-A로 미룬다.

이 발견은 §K에 반영한다: K-3 "허용된 조건" 예시에서 **쓰나미를 빼고 표류·태풍 B파라미터만 남긴다.**

---

## 4. 계획 반영

| 파일럿 | 필요한 것 | 이미 있는 것 |
|---|---|---|
| Temperature | `intel/weather.temperature.json` 패킷(P0), INFORMATION·INTELLIGENCE 화면(P1) | `SIM_CAPABILITIES` not_available 등재(§G-2 즉시 가능) |
| Tsunami INFORMATION·INTELLIGENCE | 사건 패킷 v1 승격(P1, 이미 계획됨) | RUN·RESULT·TIME 전부 운영 중 |
| §K 정정 | Scenario 예시에서 쓰나미 제거 | — |

두 파일럿 다 **새 엔진·새 데이터 모델 없이**, P0·P1이 이미 만들기로 한 것 위에서 완성된다.
