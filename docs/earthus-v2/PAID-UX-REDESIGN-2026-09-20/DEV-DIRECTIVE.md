# EARTHUS V2 유료 UX 전면개편 — 개발지시서

> **상태: 승인됨 — 2026-09-20 PD "모두 진행해". 실행 중.** 진행 상황은 §6 게이트 표 아래 '실행 기록'.
> 2026-09-20 · 정본: 같은 폴더의 PD 보고서(`EARTHUS_V2_PAID_MENU_BY_MENU_UX_REDESIGN_REPORT.docx` · `images/` 14장 · `REPORT-TEXT.txt`)
> 이 문서는 그 보고서의 **목표 화면에 지금 코드와 자료로 어떻게·어떤 순서로 도달하는가**를 적는다. 목표를 새로 정하지 않는다.
> 근거: 본 세션의 실측 조사 7건(바람·기온·해수면/파고·미반영 감사 72건·전 메뉴 66현상 Before/After/반박 검증·기준 사이트 2곳 직접 확인).
> 모든 "지금" 서술은 코드 파일:줄 또는 공개 파일 실측이다. 추측은 추측이라고 적었다.

---

## 0. 한 장 요약

**판정.** 지금 v2 는 유료 구독을 받을 수 없다. 이유는 배관이 아니라 **지구 그림**이다.

| 돈 내는 사람이 1초 안에 보는 것 | 지금 | 목표(PD 정본) |
|---|---|---|
| 기온 | 5° 격자(한 칸 555 km)를 선형 램프 + 선형 필터로 **두 번 뭉갠** 수채화 | 5°C **구간색 10단 + 흰 등온선 + 지구 위 숫자 라벨** |
| 바람 | 관측소 3,000곳에 **선분(막대기)**, 입자는 자기 선분 위만 왕복 | 전지구를 흐르는 **입자 유선 + 속도 구간색**, 저기압 소용돌이가 읽힘 |
| 바다 | 색면이 반지름 고정 껍질이라 **해발 153 m 이하 육지를 덮음**(확대하면 1,529 m 까지) | 바다에만 칠해진 SST 구간색 + 해류 유선 |
| 해수면 상승 | 해안선에 **막대기 1,016개** | 물이 차오르는 면 |
| 시간 | 5일 타임라인에 **구름·태풍 경로·서울 혼잡 셋만** 반응 | **모든 현상**이 타임라인 하나를 따라 움직임 |
| 값 읽기 | 색 눈금(범례) 없음 · 지도 위 숫자 없음 | 구간 범례 상시 · 등치선 라벨 · 클릭 한 번에 정확값 |
| Intelligence | 34현상 중 4개만 띠가 뜨고, 원인·확률을 **스스로 검열** | 수치 → 출처 → **원인·확률(%)** 문장 |

**좋은 소식.** 가장 어려운 재료는 이미 저장소에 있다(§2). 새로 발명할 것은 거의 없고, **있는 것을 v2 에 연결하지 않은 것**이 문제의 대부분이다.

**등뼈.** 이 지시서의 모든 작업은 하나의 문법을 채우기 위한 것이다(§1): 9개 메뉴 각각이 **① 극적으로 보인다 → ② 정확한 값을 읽는다 → ③ 출처를 확인한다 → ④ 시간축을 움직인다 → ⑤ 모델을 비교한다 → ⑥ Intelligence 를 본다 → ⑦ Simulation 으로 들어간다** 를 관통한다. 상품은 "3D 지구 지도"가 아니라 **"지구를 이해하고 미래를 시험해보는 시스템"** 이다.

**순서.** W0 자료(GFS 필드 프레임) → W1 공통 렌더러 → W2 기온(기준 구현체) → W3 바람 → W4 강수 → W5 셸 → W6 바다 → W7 나머지 현상 → W8 Compare → W9 Intelligence → W10 Simulation.
W0~W4 가 끝나면 **화면 인상이 바뀐다.** 거기까지가 첫 게이트다.

---

## 0-1. 두 서비스 — 이 지시서의 전제

`AGENTS.md` 맨 위 표가 정본이다. 요지만 옮긴다.

- **v1(EARTHUS)** 과 **v2(EARTHUS Intelligence)** 는 **다른 서비스다.** v2 는 v1 의 고급판이 아니다.
- v2 는 **예보한다(5일)**. v2 는 **원인과 확률을 말한다** — 그러려고 만든 시스템이다. 금지는 '근거 없는' 원인·확률뿐이다.
- 확률은 **시안처럼 %** 로 보여주고 근거(앙상블 51개 중 38개)를 바로 아래 둔다.
- `docs/HANDOVER.md` 원칙 §1 "예보하지 않는다"는 v1 의 원칙이다. 이 지시서의 어떤 작업에도 적용하지 않는다.

---

## 1. Premium UX 문법 — 메뉴 11개(9 + Life · Travel) × 7단계

> PD(2026-09-20): "현재 9개 메뉴 각각을 눌렀을 때 **반드시** ① 극적으로 보인다 → ② 정확한 값을 읽는다 → ③ 출처를 확인한다 → ④ 시간축을 움직인다 → ⑤ 모델을 비교한다 → ⑥ Intelligence 를 본다 → ⑦ Simulation 으로 들어간다 라는 **동일한 Premium UX 문법**을 만들어야 한다. 그렇게 되면 EARTHUS 의 진짜 상품이 '3D 지구 지도'가 아니라 **'지구를 이해하고 미래를 시험해보는 시스템'** 으로 바뀐다."

> **PD 추가 결정(2026-09-20): "라이프 · 트래블은 메뉴에 넣어줘."** 좌측 메뉴는 **11개**다 — 현상 9개(기온·바람·강수·구름·해양·재해·대기질·우주·지형) + **L Life** + **T Travel**. PD 정본의 작업 공간 번호(10 Compare · 11 Intelligence · 12 Simulation)는 그대로 둔다. 두 메뉴도 **같은 7단계**를 받는다 — 다만 물리 격자장이 아니라 기록·집계·장소 자료라, ① 은 단계색 면·숫자 원판·리본으로, ④ 는 자료가 가진 시간만, ⑤·⑦ 은 재료가 없으면 입구 + 사유로 채운다.

**이 절이 지시서의 등뼈다.** §3 의 작업(W0~W10)은 아래 공용 부품을 만드는 일이고, §4 의 메뉴별 표는 각 메뉴가 그 부품에 무엇을 공급하는가다.

### 1-0. 7단계 = 공용 부품 7개

메뉴마다 새로 만들지 않는다. 메뉴는 설정(`PhenomenonDescriptor`)만 공급한다.

| 단계 | 사용자가 하는 것 | 공용 부품 | 만드는 작업 | 요금 |
|---|---|---|---|---|
| **① 극적으로 보인다** | 1탭 뒤 3초 안에 지구가 그 현상의 자료로 바뀐다. 구간색 + 등치선 + 숫자 라벨 / 흐르는 입자 / 심각도 구간색 사건 기호 | `FieldRenderer` · `ParticleField` · `EventLayer` · `Legend` | W0 · W1 · W2~W4 · W6 · W7 | 무료 |
| **② 정확한 값을 읽는다** | 지도 클릭 1회 → 값 · 단위 · **정밀도의 한계**(모델 격자 평균인가, 실측 지점인가) | `Inspector.ValueCard` (+ 텍스처 CPU 사본 읽기, 네트워크 0건) | W1 · W5 | 기본값 무료 · 정확값·실측 대조 EXPLORER |
| **③ 출처를 확인한다** | 같은 카드에서 기관 · 관측/모델 · 시각(observed / run / valid) · 해상도 · 라이선스 | `Inspector.ProvenanceCard` + 배지 | W0(매니페스트) · W5 | 무료(출처는 숨기지 않는다) |
| **④ 시간축을 움직인다** | 화면에 **하나뿐인** Global Timeline 으로 과거 ↔ 지금 ↔ +5일 | `GlobalTimeline` + 공용 프레임 저장소 | W0 · W5 | +24h 무료 · +120h EXPLORER(제안) |
| **⑤ 비교한다** | 두 개를 **같은 조건**(카메라 · 시간 · 고도 · 범례)으로 나란히 — split / wipe / diff | `Compare workspace` | W8 | PRO |
| **⑥ Intelligence 를 본다** | 수치 → 출처 → **원인과 확률(%)** 문장 → 자세히 | `Intelligence Inspector` + 인텔 패킷(`attribution[]` · `probability[]`) | W9 | EXPLORER |
| **⑦ Simulation 으로 들어간다** | 지금 상태를 스냅샷으로 들고 별도 작업 공간으로. Current → Baseline → Scenario → Result | `Simulation workspace` + `SIM_CAPABILITIES` + `SimulationRunRecord` | W10 | PRO |

**두 가지 규칙.**
1. **⑤ 의 '모델 비교'는 메뉴마다 정직하게 성립하는 짝으로 읽는다.** 모델 ↔ 모델(GFS\|ECMWF) · 런 ↔ 런(최신\|이전) · 기관 ↔ 기관(JTWC\|JMA\|KMA) · 관측 ↔ 모델 · 시각 ↔ 시각 · 시나리오 ↔ 기준선. 부품은 하나(Compare workspace), 짝은 메뉴가 공급한다. 없는 짝을 지어내지 않는다.
2. **문법은 같고 가용성은 정직하다.** 어떤 메뉴에 ⑤·⑥·⑦ 의 재료가 아직 없으면 **입구는 같은 자리에 두고** 없는 이유를 말한다(`sim-questions.js` 가 이미 그렇게 한다). 빈 단계를 억지로 채워 거짓을 만들지 않는다. 잠금 아이콘으로 때우지도 않는다 — 먼저 결과의 일부가 보이고, 그다음에 깊이가 유료다.

### 1-1. 지금 상태 — 77칸 중 몇 칸이 채워져 있나

코드를 열어 확인한 결과다. ✅ 된다 **0** · 🟡 있긴 한데 목표에 못 미친다 **48** · ❌ 없다 **29** (총 77칸).

| 메뉴 | ① 극적으로 보인다 | ② 정확한 값 | ③ 출처 | ④ 시간축 | ⑤ 비교 | ⑥ Intelligence | ⑦ Simulation |
|---|---|---|---|---|---|---|---|
| **01 Temperature 기온** | 🟡 | 🟡 | 🟡 | ❌ | ❌ | 🟡 | 🟡 |
| **02 Wind 바람** | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 |
| **03 Rain 강수** | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ |
| **04 Clouds 구름** | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ |
| **05 Ocean 해양** | 🟡 | 🟡 | 🟡 | ❌ | ❌ | 🟡 | 🟡 |
| **06 Hazards 재해** | 🟡 | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| **07 Air Quality 대기질** | 🟡 | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 |
| **08 Space 우주** | 🟡 | ❌ | 🟡 | ❌ | ❌ | 🟡 | 🟡 |
| **09 Terrain 지형** | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | ❌ | 🟡 |
| **L Life 생명·사람** | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | ❌ | 🟡 |
| **T Travel 여행(한국)** | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | ❌ |
| **단계별 ✅** | 0/11 | 0/11 | 0/11 | 0/11 | 0/11 | 0/11 | 0/11 |

### 1-2. `PhenomenonDescriptor` — 메뉴가 공용 부품에 공급하는 설정 하나

> 비평가 에이전트가 세션 사용 한도로 실패해, 이 절(1-2·1-3·1-5)은 본 세션이 9개 메뉴 결과를 직접 읽고 썼다.

9개 메뉴의 descriptor 초안을 하나로 통합하면 아래 모양이다. **부품은 descriptor 만 읽는다 — 메뉴 이름으로 분기하지 않는다.**

```js
// prototype/v2-three/js/phenomenon-descriptors.js (신규 · 얼린 ES 모듈)
{
  id: '01-temperature',
  rail: { no: '01', ko: '기온', en: 'Temperature', icon: 'temperature' },
  phenomena: ['weather.temperature', 'weather.temperature_anomaly'],   // 흡수한 레지스트리 id — 레이어 id 는 개명하지 않는다
  modes: [{ id: 'actual', ko: '실제' }, { id: 'anomaly', ko: '평년 대비' }],   // 칩. 슬라이더 금지

  // ① 극적으로 보인다 — FieldRenderer · ParticleField · EventLayer · Legend 가 읽는다
  view: {
    kind: 'field',                 // 'field' | 'particles' | 'events' | 'imagery' | 'terrain'
    field: 't',                    // 공용 프레임 저장소의 키
    scale: 'temperature',          // field-scales.js 의 표 이름 — 색·경계·범례·등치선이 전부 여기서 나온다
    isolines: { step: [2, 5], bold: 'x % 10 === 0', labels: { desktop: 24, mobile: 12 } },
    particles: null,               // 바람·해류: { field: 'u', presets: ['1/3', '2/3', 'all'] }
    mask: 'none',                  // 'ocean' 이면 육지에서 discard (바다 색면이 육지를 덮던 버그의 구조적 해법)
  },
  // ② 정확한 값 — Inspector.ValueCard
  value: {
    read: 'frameTexture',          // 'frameTexture' | 'array' | 'eventPick' | 'stationNearest' | 'terrainHeight'
    decode: 'v = -80 + byte * 0.5', unit: '°C',
    precision: { model: 0.5, note: '0.5° 격자(약 55 km) 평균 — 지점값 아님' },
    obsNearest: { sources: ['wind/gts-global.json', 'wind/kma-aws.json'], maxKm: 25, showWhen: 'now' },
  },
  // ③ 출처 — Inspector.ProvenanceCard
  provenance: {
    model: { source: 'NOAA NCEP GFS', grid: '0.5°', license: 'public domain', run: 'manifest.run', valid: 'manifest.steps[].valid' },
    obs:   { source: '기상청 ASOS / GTS SYNOP', license: '공공누리 1유형', observed: 'doc.observedKst' },
    staleAfterH: 12,
  },
  // ④ 시간축 — GlobalTimeline + 공용 프레임 저장소
  frames: { store: 'gfs-fc', key: 't', stepH: 3, maxH: 120, interp: 'linear', past: { available: false, reason: '기온 프레임 이력을 쌓기 전' } },
  // ⑤ 비교 — Compare workspace. 짝은 메뉴가 공급한다
  compare: { pairs: [
    { type: 'time',  a: 'valid T', b: 'T+24h', diff: true,  available: true },
    { type: 'run',   a: 'latest',  b: 'previous', diff: true,  available: false, reason: 'manifest 에 runs[] 포인터가 없다' },
    { type: 'model', a: 'GFS',     b: 'ECMWF',    diff: true,  available: false, reason: 'ECMWF 격자 수집기 없음' },
  ] },   // type: 'time' | 'run' | 'model' | 'agency' | 'revision' | 'obsModel' | 'date' | 'scenario'
  // ⑥ Intelligence — Intelligence Inspector
  intel: { host: 'wind/kma-aws.json', path: 'intel', sections: ['WHAT', 'WHY', 'NEXT', 'EVIDENCE'],
           attribution: ['ridge500-persistence'], probability: { source: 'ENSEMBLE', available: false, reason: '격자 앙상블 없음' } },
  // ⑦ Simulation — Simulation workspace
  simulation: { capabilityId: 'weather.temperature', scenarios: [
    { id: 'climate-plus2', ko: '+2°C 기후 시나리오', engine: null, available: false, reason: 'CMIP6 자료·엔진 없음' } ] },
  tierExceptions: null,            // 요금은 전역 규칙(§1-0 표). 예외만 적는다 — 재해: 안전 정보는 ⑥ 기본까지 무료
}
```

**어느 부품이 어느 칸을 읽나**

| descriptor 칸 | 읽는 부품 | 비고 |
|---|---|---|
| `view` + `field-scales.js[scale]` | FieldRenderer · ParticleField · EventLayer · Legend | 색 경계 = 범례 경계 = 등치선 값. 표는 한 곳 |
| `value` | Inspector.ValueCard | 클릭 → 텍스처 CPU 사본 / 배열 / 사건 pick. 네트워크 0건 |
| `provenance` | Inspector.ProvenanceCard + 배지 | 매니페스트·문서의 필드 경로만 적는다 — 문구를 메뉴마다 새로 쓰지 않는다 |
| `frames` | GlobalTimeline + 공용 프레임 저장소 | `past.available:false` 면 타임라인의 과거 구간이 회색 + 사유 |
| `compare.pairs[]` | Compare workspace | `available:false` 인 짝도 **칩으로 보이고** 사유를 말한다 |
| `intel` | Intelligence Inspector | 패킷이 없으면 입구 + 사유 |
| `simulation` | Simulation workspace | `sim-questions.js` SIM_CAPABILITIES 와 **같은 표**를 본다(두 번 적지 않는다) |

### 1-3. 첫 관통과 공용 부품을 만드는 순서

**첫 관통(First Vertical).** **06 재해 — '지진 1탭 → 쓰나미 도달시간'.** 9개 메뉴 중 ①~⑦ 이 '진짜'로 가장 많이 채워지는 사슬이다(🟡 6 · ❌ 1).
- **⑦ 이 진짜다.** `aws/tsunami-eta` 는 SIM_CAPABILITIES 에서 유일한 AVAILABLE 이고(15분 스케줄 · 연안 38곳 · PTWC 게시문 대조), Current → Baseline(PTWC ETA) → Scenario(이 사건 / 최근 30일 다른 사건) → Result(연안 ETA + 기준 대비 차) 가 **새 엔진 없이** 성립한다.
- **⑥ 에 패킷이 있다.** 지진 인텔 패킷(`ocean/earthquake-intel.json`)이 여진 순서를 실제 대 모형으로 채점까지 해서 싣는다. 태풍은 5절 전부.
- **⑤ 에 자료가 있다.** 태풍 회차 ↔ 회차(`revisions[]` + 불변 아카이브)와 KMA \| JMA 기관 비교가 이미 표로 돌아간다(`intel-feed.js:605-637`). 남은 것은 작업 공간뿐이다.
- **매일 시연된다.** M4.5+ 지진은 매일 있고 쓰나미 계산본 색인은 최근 30일을 든다 — 태풍 비수기에도 보여줄 수 있다.
- **무료다.** 안전 정보는 구독과 무관하게 열려 있으므로, 이 사슬은 **모든 방문자에게 7단계 문법을 가르치는 입구**가 된다.

그래서 길을 둘로 낸다.
- **가로(G1)** — W0 → W1 → 기온 · 바람 · 강수 · 해양: 4개 메뉴의 ① 과 ④ 를 한꺼번에 채운다. *화면 인상*이 바뀐다.
- **세로(First Vertical)** — 재해 한 메뉴를 ①~⑦ 끝까지: Inspector · Compare · Intelligence Inspector · Simulation 작업 공간이 **최소 형태로 일찍 태어난다.** *문법*이 증명된다.
두 길은 부품이 겹치지 않아 동시에 갈 수 있다(가로 = 렌더러·프레임 / 세로 = Inspector·작업 공간).

**공용 부품을 만드는 순서.**

1. **공용 프레임 저장소 + W0** — GFS 프레임 로더를 `CloudManager` 에서 떼어내고(`main.js:1814-1844`), 수집기에 TMP 2m · UGRD/VGRD 10m · PRMSL · APCP 를 추가한다. 매니페스트에 **`runs[]` 포인터**(최근 4런)를 같이 넣는다 — 이 한 줄이 기온·바람·강수·구름의 ⑤ '런 ↔ 런'을 연다. ①·④·⑤ 의 재료가 여기서 한 번에 나온다.
2. **`field-scales.js` + FieldRenderer + Legend** — 색 경계 · 범례 · 등치선이 한 표에서 나온다. 기온이 기준 구현체, 강수·수온·대기질·고도가 두 번째 소비자. ① 이 채워진다.
3. **Inspector 껍데기 + ValueCard + ProvenanceCard + 클릭 규칙** — ②·③. ⚠️ 지금 좌클릭은 국가 선택으로 간다(`main.js:2793-2843`) — **'현상이 켜져 있으면 값 판독이 먼저'** 라는 규칙을 셸에서 한 번 정한다(9개 메뉴가 각자 정하면 문법이 갈라진다).
4. **GlobalTimeline ↔ descriptor.frames** — ④. 지금 `setTimeOffset` 은 서울 혼잡과 태풍 경로 둘만 분기한다(`live-layers.js:2857-2902`). 메뉴별 분기를 없애고 저장소가 descriptor 를 읽게 한다.
5. **EventLayer + 사건 pick** — 재해의 ①·②. 규모 × 깊이 구간색 점, 14건 절단 제거, 공용 Legend 의 첫 '사건' 구현.
6. **Compare workspace 최소형** — 새 자료가 필요 없는 짝부터: **시각 ↔ 시각**(바람·강수 — 저장소의 두 프레임) · **회차 ↔ 회차**(태풍 — 이미 있는 `revisions[]`) · **날짜 ↔ 날짜**(지형 위성 바탕 — `loadGibsBase` 가 이미 `dayShift` 를 받는다). split · wipe 먼저, diff 는 **같은 물리량끼리만**(구름의 관측 IR 대 모델 구름수처럼 물리량이 다르면 diff 금지). 그다음 런 ↔ 런, 관측 ↔ 모델, 마지막이 모델 ↔ 모델(ECMWF 격자 수집기 뒤).
7. **Intelligence Inspector** — 수치 → 출처 → 문장. 패킷에 `attribution[]` · `probability[]` 절, 서술 가드 개정(근거 있으면 통과). 첫 확률은 **태풍**(ECMWF 51멤버 경로가 이미 있다)과 **오로라**(SWPC 공식 확률 + `lab-events` 가 이미 채점 중 — W37 평균오차 0.91 Kp).
8. **Simulation workspace 최소형** — `tsunami-eta` 를 감싸는 것으로 시작한다. 그다음 **엔진 하나로 세 메뉴**: `transport-simulator.js` 의 `advectPoint`(RK2 · cos 위도 · vectorProof 필수 · 지금 v2 소비자 0건) + W0 의 u/v 41프레임 = 바람 '여기서 놓은 공기는 어디로 갈까' · 구름 '이 구름은 언제 내 위에 오나' · 대기질 '이 먼지는 어디서 왔나'. 이어서 해양 표류(`research-runtime`, 계약 §I S-A) · 우주 위성 통과(SGP4).

### 1-4. 메뉴별 7단계

#### 01 Temperature 기온

| 단계 | 지금 | 끝났을 때 사용자가 보고 하는 것 | 이 메뉴가 공급할 것 | 선행 | 요금 |
|---|---|---|---|---|---|
| **① 극적으로 보인다** | 🟡 색면은 뜨지만 PD 금지 표현(그라데이션 단독) 그대로다. prototype/v2-three/js/live-layers.js:582 tempgrid → buildField(data,'t',TEMP_RAMP,airShell) · :2969-2972 TEMP_RAMP 정지점 8개 선형 램프(rampFrom… | 기온 1탭 뒤 3초 안에 지구가 5°C 단색 11칸(<-10 … ≥35)으로 나뉘고 칸 경계마다 흰 등온선이 선다. 0°C 선과 10°C 배수 선은 굵고, 앞 반구에 '20°C'·'30°C'·'-10°C' 라벨이 읽힌다(데스크톱 ≤24 · 모바일 ≤12). 타임라인이 '지금'일 때만 GTS·기상청 실측 숫자가 OBS 점과 함께 얹힌다. 좌하단 범례는 11칸 + 'MODEL · NOAA GFS 0.5° · run ○○Z · +○h 예보 · valid ○○ KST' 를 상시 보이고, 상단 칩은 Actual \| Anomaly·한국 관측(숫자 마커 '+3.2', 발산형 11칸).<br>⚠️ *말하면 안 되는 것:* 5° Open-Meteo 격자에 새 렌더러만 먼저 얹지 않는다(555km 블록·가짜 곡선). '현재 기온'이라 부르지 않는다 — '지금' 프레임도 실제로는 +6~12h 예보다. 모델 격자값을 도시 숫자로 지구 위에 찍지 않는다. Anomaly 는 83지점 점 자료라 등치선·보간면을 만들지 않는다('장이 없어 contour 생략' 명시). '<-10' 한 칸에 극지 -60~-10°C 가 다… | field-scales.js 기온 표: levels [-10,-5,0,5,10,15,20,25,30,35] · 11색 팔레트(NearestFilter 1×11) · 등온선 간격 칩 2°C\|5°C(uniform 1개) · 굵은 선 규칙(0°C, 10°C 배수) · 값 디코드 v=-80+byte×0.5 · 라벨 예산 24/12 · 관측 숫자 출처(wind/gts-global.json ta, wind/kma-aws.json) + showWhen offset==0… | W0(GFS TMP 2m → t{step}.png, NOMADS 레벨 문자열 인벤토리 확인) · 공용 프레임 저장소(CloudManager 분리) · W1 FieldRenderer · W2 · W5 범례 슬롯(늦으면 임시 범례 1개) · PD 결정: 극지 확장 칸, CONTINUOUS… | FREE |
| **② 정확한 값** | 🟡 기온 레이어를 켜고 지구를 좌클릭해도 기온값은 나오지 않는다: main.js:2793-2843 좌클릭 → extScene/travel/seafloor pick → focus.pick(국가 선택 + popMetricMenu '인구' :2837) 또는 바다면 marineSelect(:2842). 기온값 경… | 지구를 한 번 클릭하면 우측 Inspector 값 카드에 두 줄이 뜬다. ① 모델: '~23.5°C · GFS 0.5° 격자(약 55km) 평균 · 눈금 0.5°C'(무료는 1°C 반올림 '약 24°C'), 프레임 사이면 '모델 프레임 사이 보간'. ② 최근접 실측: '서울(108) 24.1°C · 3.2km · 14:00 KST 관측 · OBS'(EXPLORER 0.1°C) — 25km 안에 실측이 있으면 실측을 먼저, 없으면 모델값에 '~'. Anomaly 탭에서는 지점 마커 클릭 → 어제 평균·평년(평균/최고/최저)·편차·표본수. 네트워크 탭에 api.open-meteo.com 요청 0건.<br>⚠️ *말하면 안 되는 것:* 모델에서 0.1°C 정확값은 만들 수 없다(8bit 0.5°C 눈금 + 격자 평균). 5°·0.5° 격자값을 도시값처럼 말하지 않는다. 타임라인이 지금이 아니면 실측 줄은 '관측은 미래가 없음' 한 줄로 바뀐다. 평년값 없는 지점(대구 등)에는 편차를 만들지 않는다. | 디코드 함수(-80+byte×0.5) · 표시 정밀도 규칙(모델 0.5°C/무료 1°C 반올림, 실측 0.1°C) · 정밀도 한계 문구('0.5° 격자 평균 — 지점값 아님') · 최근접 실측 소스와 거리 한도(25km 우선 규칙, 레지스트리 scope 의 400km 표기는 재검토) · °C/°F 변환 · Anomaly 지점 카드 필드(value·baseline·delta·method·samples — intel_temp.py:162-167 과 같은 모양). | W0 · 공용 프레임 저장소 · W1 #7 · W5 우측 Inspector · main.js:2932 Open-Meteo 직접 호출 제거(이 메뉴 담당분) · 좌클릭 경로에 '현상 활성 시 값 판독 우선' 분기 추가(국가 선택과의 충돌 규칙은 W5 에서 결정). | FREE |
| **③ 출처** | 🟡 출처·시각은 나오지만 클릭 값에 붙지 않고, 문구가 틀리고, 모델을 특정하지 않는다. ui-shell.js:65 메뉴 줄 state 'MODEL' · src 'Open-Meteo 격자 5°'. 레이어를 켜면 main.js:4264-4273 이 liveLayers.card + layerTruthLine… | 값 카드 바로 아래 출처 카드가 같은 클릭으로 채워진다. 모델 줄: 'MODEL · NOAA NCEP GFS 0.5°(약 55km) · run 09-20 00Z · +9h 예보 · valid 18:00 KST · 8bit 0.5°C 눈금 · 미국 정부 퍼블릭 도메인'. 실측 줄: 'OBS · 기상청 ASOS / GTS SYNOP(기상청 API허브) · 관측 14:00 KST · 공공누리 1유형'. Anomaly: 'DERIVED(관측−평년) · 기상청 ASOS 정시 · 평년 1991~2020 · 어제 하루 평균 · 24회(또는 8회) 평균'. 런이 12시간 넘게 늙으면 '지연' 배지.<br>⚠️ *말하면 안 되는 것:* '현재'·'실황'이라는 말을 모델 줄에 쓰지 않는다. Open-Meteo 파생을 NOAA 로 바꿔 적지 않는다 — 자료원이 실제로 GFS 프레임으로 바뀐 뒤에만 이 출처표가 선다. 프레임 사이 보간값은 '모델 출력 아님'을 밝힌다. | 출처표: {gfs: manifest.source·run·steps[].valid·grid(0.5°)·encoding·license 'public domain'} · {obs: gts-global source/license(aws/gts-global/handler.py:311-313), kma-aws observedKst} · {anomaly: kma-normal period·source, method·samples} · 신선도 SLA(런 12h, 관측 120분… | W0 매니페스트에 temp 필드·encoding 기재 · W5 Inspector · live-layers.js:1191 문구 정정 · ui-shell.js:65 src 교체(Open-Meteo 문구 제거). | FREE |
| **④ 시간축** | ❌ 공용 슬라이더는 하나 있다(ui-shell.js:1334 ts-range min -1440 · max 7200분 = -24h~+120h, :1351 hooks.onTimeOffset). 그러나 기온은 반응 0: main.js:4891-4898 onTimeOffset → clouds.setForecast… | 하단 Global Timeline 하나를 밀면 기온 색면·등온선·라벨이 3시간 프레임 사이를 값 보간으로 함께 움직인다(지금 ↔ +120h, 41프레임, ▶ 5일 재생). 타임라인 옆에 'GFS 00Z · 9h ago' 가 항상 붙는다. 지금이 아니면 관측 숫자와 Anomaly 마커는 사라지고 '관측은 미래가 없음' 한 줄이 남는다. 과거 구간은 기온 프레임 이력이 없으므로 회색 + '이력 수집 시작일'. EXPLORER 는 클릭 지점의 5일 기온 곡선(텍스처 41장에서 읽음, 호출 0)을 Inspector 에서 본다.<br>⚠️ *말하면 안 되는 것:* 무료 +24h · EXPLORER +120h(재료의 제안 — PD 확정 필요). '지금' 프레임도 +6~12h 예보이므로 run/+h 를 항상 적는다. 프레임 사이 값은 보간이며 모델 출력이 아니다. 과거 색면은 자료가 없어 만들지 않는다(한국 지점 이력 wind/series/stations 는 Inspector 시계열로만). | 프레임 생산자: clouds/gfs-fc/{run_tag}/t{step}.png 41×3h + manifest steps[].temp 키 · 프레임 선택 규칙(valid 기준 앞뒤 두 장 mix) · 관측 오버레이 showWhen offset==0 · 과거 구간 가용성 선언(past:false + 사유) · 5일 곡선 읽기 규칙(41장 CPU 사본, 지연 프리페치). | W0(fields_from_grib '없으면 그 프레임만 생략' 분리 · describe 선별 해독 · elapsedS 재실측) · 공용 프레임 저장소(지금은 setCloud('gfs') 안에서만 로드) · W1 #8 · 전송량(S3 us-east-2 직접 → CloudFront 경유… | FREE |
| **⑤ 비교** | ❌ 필드 비교 UI 0. v2-three/js 의 compare 는 scenario-compare.js:1-25(SIMULATION 기록 기준↔가지 전용, truthStatus 검사) · main.js:4853-4855 'feed-compare'(인텔 피드 개정판 비교) · intel-feed.js · r… | TOP 'Compare' 를 누르면 기온이 보던 상태(카메라·valid 시각·범례)를 그대로 들고 split 또는 wipe 로 들어간다. 1순위 짝 'GFS 최신 런 \| 이전 런(-6h·-12h·-24h)' 을 같은 valid 시각에 나란히 놓고, diff 모드는 ±1·2·4·6°C 발산형 구간색으로 '예보가 이만큼 바뀌었다'를 보인다. 각 면에 run 시각·해상도, 공통 scale 고정. 한국 확대에서는 'IFS \| AIFS 97지점 5일 2m 기온' 점 마커 diff(채점이 쌓이면 선행시간별 MAE). 'GFS \| ECMWF' 칩은 같은 자리에 있되 '격자 수집기 없음' 사유를 말한다.<br>⚠️ *말하면 안 되는 것:* GFS\|ECMWF 격자 비교는 자료가 없어 말할 수 없다. 런↔런 차이는 '예보의 변화'이지 '오차'가 아니다. IFS\|AIFS 는 한 회차뿐이라 '어느 쪽이 맞나'를 아직 말할 수 없다 — ECMWF open data 는 2~3일만 보관해 지나간 회차는 되돌릴 수 없다. 관측−모델 차이는 지점 대 55km 평균이라 모델 오차로 단정하지 않는다. | 비교 짝 목록과 가용성: run↔run(gfs) · obs↔model(Inspector 줄) · IFS↔AIFS(97지점) · GFS↔ECMWF(unavailable+reason) · diff scale(±1·2·4·6°C) · 이전 런 포인터(manifest 에 runs[] 또는 manifest-prev.json 추가) · 97지점 자료 키 archive/ecmwf/<run>.json · URL 공유 파라미터(variable·runA·runB·valid). | W0 · W1 · W8 · gfs-fc 이전 런 프레임 보존 확인(핸들러는 run_tag 폴더에 immutable 로 올리고 manifest.json 만 덮어쓴다 handler.py:368-377, :429 — S3 lifecycle 은 UNKNOWN) · ecmwf-ingest 정기… | PRO |
| **⑥ Intelligence** | 🟡 기온 본체에는 띠가 없고, 평년차에만 수치 패킷이 있으며, 원인·확률 문장은 0이다. phenomenon-registry.js:755 weather.temperature intelligence:true 이지만 main.js:4098-4112 intelHostFor 는 weather.temperature… | 위치를 고르고 Intelligence 를 열면 Now 탭이 위에서부터 ① '서울 28.4°C · OBS · 기상청 ASOS · 14:00 KST' ② '어제 하루 평균 26.9°C · 평년(1991–2020) 대비 +2.3°C · DERIVED · 24회 평균' ③ 출처·시각 ④ 그 아래 문장 순이다(수치는 예시). 원인 문장 예: '500hPa 능선이 한반도 상공에 4일째 머물렀고(GFS 분석장에서 계산 · run 00Z), 능선 아래 하강 기류와 맑은 하늘은 지면 가열을 키우는 기작으로 알려져 있습니다(문헌 인용) — 평년보다 2.3°C 높은 원인으로 귀속, 강도: 중'. 확률 문장 예: '내일 서울 최고기온이 33°C 이상일 확률 77%' 바로 아래 'GEFS 31멤버 중 24개 · run 00Z', 기관 인용 '기상청 단기예보 내일 최고 32°C(11:00 발표)'. Forecast 탭은 5일 곡선, Climatology 탭은 366일 평년 곡선 위 오늘 점과 최근 30일 편차 막대, 말한 확률에는 사후 채점(Brier) 표기.<br>⚠️ *말하면 안 되는 것:* 지금은 원인·확률 문장을 낼 수 없다: attribution[]·probability[] 절 미구현, 500hPa 분석장 미수집(gfs-cloud-forecast 는 구름·700hPa 바람·강수만 handler.py:99-109), 기온 앙상블 없음(GEFS 해독 미확인). 그때까지는 '수치 → 출처 → 기관 예보 인용'까지만 나오고, 문장 자리는 '근거 준비 중 — 무엇이 없어서'를 말한… | 패킷 생산자 aws/kma-aws/intel_temp.py 확장: 7→83지점 · next 절에 기상청 단기예보 최고/최저 인용 · pattern(평년 초과 연속 일수 — wind/series/stations 이력) · attribution 규칙 세트(500hPa 능선 지속 일수 · SST 편차 · 지면 건조) · probability 생산자(GEFS 임계 초과 멤버 수) · weather.temperature 도 같은 패킷을 읽도록 intelHostFor 연… | W9(attribution[]·probability[] 절 · 채점 · §C-2 가드 개정 — narration_guard.py 는 옛 표라 운영 미반영) · W0 에 HGT 500hPa 추가(W0 목록에 없음 — 추가 요청) · GEFS 를 grib2lite 가 푸는지 한 파일 검증… | EXPLORER |
| **⑦ Simulation** | 🟡 입구와 사유 문장은 있으나 작업 공간·스냅샷·시나리오 칩이 없고 엔진은 0이다. sim-questions.js:309-322 weather.temperature engine:null · status NOT_AVAILABLE · 질문 'temp-future' + reasonKo '기온 예보는 기관 발표를… | TOP 'Simulation' 을 누르면 기온을 보던 상태(카메라·run·valid·클릭 지점·범례)가 스냅샷으로 저장되고 별도 작업 공간이 Current → Baseline → Scenario → Result 로 열린다. 1차 출시에서는 'Current' 칩만 활성이고 '+2°C'·'+4°C' 칩은 같은 자리에 비활성으로 서서 '기후 시나리오 자료(CMIP6)를 아직 받지 않습니다 — 5일 기온은 시뮬레이션이 아니라 모델 예보 인용입니다'를 말한다. 자료 확보 뒤에는 Variable(연평균·여름 최고) · Season · Model(CMIP6 다중모델) 을 고르고 결과를 absolute 와 delta 로 동시에 보며 해상도·모델 출처가 붙는다.<br>⚠️ *말하면 안 되는 것:* 기온 계산 엔진은 저장소에 없다. 5일 예보(④)를 시뮬레이션이라 부르지 않는다. 산악 감률 환산(5.5°C/km)은 결정론적 환산이지 시뮬레이션이 아니다. CMIP6 델타를 '이 도시의 미래 기온'으로 말하지 않는다(거친 격자·다중모델 평균·시나리오 가정). 입구는 두되 없는 결과를 채우지 않는다. | 스냅샷 필드(phenomenonId · run · valid · camera · 선택 지점 · scale) · 시나리오 칩 정의(id · 라벨 · status · reason) · SIM_CAPABILITIES['weather.temperature'] 에 scenarios[] 추가(전부 not_available + 사유) · 결과 scale(absolute = 기온 11칸, delta = 발산형). | W10 작업 공간 · CMIP6 자료 신규 확보(라이선스·해상도·기준 기간 확인, W10 후보 중 가장 뒤) · PD 결정. | PRO |

- **⑤ 비교 짝:** 1순위 = GFS 런↔런(최신 런 \| 이전 런, 같은 valid 시각, diff ±1·2·4·6°C) — 새 라이선스 0, "예보가 어떻게 바뀌었나". 성립 근거: aws/gfs-cloud-forecast/handler.py:368-377 이 프레임을 clouds/gfs-fc/{run_tag}/ 에 immutable 로 올리고 덮어쓰는 것은 manifest.json 하나(:429)라 이전 런 프레임이 남는 구조다. 단 ① 기온 프레임(t{step}.png)은 W0 뒤에만 존재 ② 이전 런을 가리키는 포인터(manifest runs[] 또는 manifest-prev)가 없다 ③ S3 lifecycle 삭제 규칙은 UNKNOWN. → 지금 자료로는 아직 안 되고, W0 + 포인터 추가(S)면 된다.<br>2순위 = 관측↔모델(Inspector 안 한 줄: 최근접 GTS/KMA 실측 − GFS 격자값). 새 자료 0(wind/gts-global.json · wind/kma-aws.json 이미 있음). 워크스페이스가 아니라 값 카드 안의 비교이며 '지점 대 55km 평균' 주의 문구가 붙는다.<br>3순위 = IFS(물리)↔AIFS(AI) 한국 97지점 5일 2m 기온(aws/ecmwf-ingest, CC-BY-4.0) — 기준 사이트에 없는 고유 비교. 지금은 수동 1회분(2026-08-01 12Z)뿐이고 정기 실행 등록은 PD 권한(README:35-41), 채점기 미구현(:72-80). 스케줄을 늦추면 그 기간 자료는 영영 없다.<br>불가 = GFS\|ECMWF 격자: ECMWF 격자 수집기 없음(AEC 압축 → eccodes 필요, 별도 L). 칩은 같은 자리에 두고 사유를 말한다.<br>제외 = 지금 화면의 Open-Meteo 5° 자료로 만들 수 있는 어떤 짝도 유료 핵심 그림에 쓰지 않는다. 시각↔시각(오늘\|+24h)은 타임라인이 이미 하는 일이라 Compare 의 보조 프리셋으로만.
- **⑦ 시나리오:** 저장소에 기온 계산 엔진은 없다(직접 확인): sim-questions.js:309-322 weather.temperature = engine null · NOT_AVAILABLE · services/research-runtime = OceanParcels 표층 입자 표류 · prototype/js/earthus2/v02/weather/ensemble.js(36줄, 멤버 가중 평균)·forecast-gap.js(16줄, 기관값 대 합의값 격차 판정)는 판정 함수이지 시뮬이 아님 · prototype/v2-deploy/engine-v11/environment/transport-simulator.js = 벡터장 위 점 이류(RK2) · engine-v11/forecast/calibration.js·ground-truth.js 는 채점 도구(→ ⑤ IFS/AIFS 채점과 ⑥ 확률 채점에 재사용 후보) · aws/climate-daily 빈 디렉터리 · aws/tsunami-eta 는 쓰나미 전용.<br>의미 있는 시나리오 후보: PD 시안 12 의 기후 시나리오 칩(Current / +2°C / +4°C — CMIP6 다중모델, Variable·Season 선택, absolute+delta 동시). 필요한 것: CMIP6(또는 IPCC AR6 Atlas) 격자 자료 신규 확보·라이선스 확인·정적 자산화 — DEV-DIRECTIVE W10 후보 중 가장 뒤.<br>1차 출시: 입구는 TOP 'Simulation' 같은 자리 + 진입 시 현재 상태 스냅샷(SimulationRunRecord 모양) + Current 칩만 활성 + 나머지 칩 비활성과 사유 문장. 5일 GFS 예보와 산악 감률 환산은 시뮬레이션으로 포장하지 않는다.
- **첫 단면(7단계를 전부 관통하는 가장 얇은 출시):** 넣는 것(7단계 전부 관통): ⓪ W0 최소분 — gfs-cloud-forecast 에 TMP 2m 한 필드만 추가(t{step}.png, '없으면 그 프레임만 생략' 분리, describe 선별 해독, elapsedS 재실측) + GFS 프레임 로더를 CloudManager 에서 떼어 공용 프레임 저장소로. ① FieldRenderer 기온판: 5°C 11칸 단색 + 셰이더 흰 등온선(0°C 굵게) + 임시 범례 1개(11칸 + MODEL·GFS 0.5°·run·+h·valid). 지구 위 라벨과 관측 숫자는 2차로 미뤄도 '그라데이션 단독 금지'는 충족된다. ② 좌클릭 1회 → 값 텍스처 CPU 사본에서 모델값('~23.5°C · 0.5° 격자 평균') + 최근접 실측 한 줄(gts-global·kma-aws), main.js:2932 Open-Meteo 직접 호출 제거. ③ 같은 카드에 run/valid/해상도/퍼블릭 도메인 + 실측의 관측시각·기관, '관측 범위'→'모델 범위' 정정. ④ live-layers setTimeOffset 에 기온 분기: 두 프레임 값 mix, 기존 단일 슬라이더(ui-shell.js:1334)로 +120h, 지금이 아니면 실측 줄 숨김. ⑤ Compare 입구를 TOP 같은 자리에 두고 '런↔런 — 이전 런 보존 확인·포인터 추가 뒤 열림, GFS\|ECMWF — 격자 수집기 없음'을 말한다(수집기에는 이번에 manifest runs[] 만 미리 넣는다). ⑥ Intelligence: 기존 평년차 패킷(7지점)을 weather.temperature 에서도 읽게 intelHostFor 를 잇고, 배치를 수치 → 출처·시각 순으로만 그린다. 문장 자리는 '원인·확률 근거 준비 중(500hPa 분석장·앙상블 없음)'. ⑦ Simulation 입구 + 진입 시 스냅샷 저장 + Current 칩 + '+2°C/+4°C' 비활성 칩과 사유.<br>미루는 것: 지구 위 등온선 라벨·관측 숫자(2차) · Anomaly 탭 83지점 숫자 마커(P1) · Land surface 칩 A/B단계 · Summits 토글 · 850hPa · °F · 5일 곡선 · IFS/AIFS 채점 · attribution/probability 생산자(W9) · CMIP6.<br>한 줄 기준: 5° Open-Meteo 자료 위에는 어떤 단면도 출시하지 않는다 — 렌더러와 GFS 자료가 같이 나간다.
- 비고: PD 결정 필요 6건: ① '<-10' 극지 확장 칸(View 옵션) ② 지표온도(land/lst)를 01 의 'Land surface(위성 관측)' 칩으로 넣을지 + ≥60°C 확장 구간 ③ 산 정상 날씨 'Summits' 토글의 레일 자리(v1 이관이어도 kma-mountain 시간별 보관·mountain-verify 유효시각 필드는 자료 보존 때문에 먼저) ④ ecmwf-ingest 정기 실행 등록(events 권한은 PD 만 — 늦출수록 지나간 회차는 영영 없다) ⑤ 무료 +24h / EXPLORER +120h 경계 ⑥ CONTINUOUS_LAYERS §2 레벨표(−25,−10,0…) → PD 5°C 간격으로 갱신 승인.<br>UNKNOWN: clouds/gfs-fc 이전 런 폴더의 S3 lifecycle · t{step}.png 크기(참고: 구름 234KB·강수 107KB·바람 8KB/스텝) · NOMADS 'TMP · 2 m above ground' 레벨 문자열(인벤토리 확인 전 확정 금지) · grib2lite 의 GEFS 해독 가능 여부 · wind/series/stations collectingSince.<br>이번에 직접 열지 않고 선행 분석을 그대로 인용한 것: 지표온도(live-layers.js:12-38, 1576-1607) · 산 정상(ext/hobby-mountain.js, aws/kma-mountain) · 프레임 로더 위치(main.js:1814-1844). nowEvidence 에는 넣지 않았다.<br>⑥ 문구 기준: 계산 과제 앞부분의 '§C-2 에 따라 인과·확률 금지' 주의와 뒷부분의 '원인과 확률을 실제로 말하는 예' 지시가 어긋나는데, AGENTS.md '제품 의도'(정본 0번, :61-69, :92-94)가 §C-2 를 개정 대상으로 못박고 '패킷에 근거가 실리면 말한다'고 정했으므로 그쪽을 따랐다. 단 지금 패킷에는 근거가 없어 문장이 실제로 나오지는 못한다 — honestLimit 에 적었다. W0 목록에 HGT 500hPa 가 없어 기온 원인 귀속의 첫 규칙(능선 지속 일수)을 만들 재료가 빠져 있다 → W0 에 추가 요청.<br>발견한 부수 결함: phenomenon-registry.js:770 평년차 temporalMode 가 '지금 실황 − 평년'(일변화 섞임)으로 적혀 있고 레이어도 그렇게 계산한다(live-layers.js:1451-1453) — 인텔 패킷(어제 하루 평균 기준)과 같은 화면에서 서로 다른 편차가 나온다. 레지스트리 scope(:759)의 '400km 이내 지점'은 25km 실측 우선 규칙과 맞지 않는다.<br>관련 파일(절대 경로): D:\## APP\EARTHUS v2_APP\prototype\v2-three\js\live-layers.js · main.js · ui-shell.js · sim-questions.js · intel-strip.js · intel-questions.js · phenomenon-registry.js · scenario-compare.js / D:\## APP\EARTHUS v2_APP\aws\gfs-cloud-forecast\handler.py · aws\kma-aws\intel_temp.py · aws\ecmwf-ingest\README.md · aws\gts-global\handler.py / D:\## APP\EARTHUS v2_APP\docs\earthus-v2\PAID-UX-REDESIGN-2026-09-20\DEV-DIRECTIVE.md(W0~W10) · D:\## APP\EARTHUS v2_APP\AGENTS.md.

<details><summary>descriptor 초안</summary>

```js
{
  id: 'temperature', rail: 1, label: { ko: '기온', en: 'Temperature' },
  phenomena: ['weather.temperature', 'weather.temperature_anomaly' /* + 'land.surface_temperature', 'weather.mountain_summit' — PD 결정 뒤 */],
  tabs: [
    { id: 'actual', label: 'Actual', field: 't2m' },
    { id: 'anomaly', label: 'Anomaly · 한국 관측', layer: 'weather/tempanom', flyTo: 'korea', render: 'markers' },
  ],
  fields: {
    t2m: {
      producer: 'aws/gfs-cloud-forecast', frames: 'clouds/gfs-fc/{run}/t{step}.png', manifest: 'clouds/gfs-fc/manifest.json',
      grid: { ni: 720, nj: 361, res: 0.5 }, encoding: { bits: 8, channels: 1, decode: 'v = -80 + byte * 0.5', unit: '°C' },
      level: '2 m above ground', /* 850hPa = 2단계 PRO */ mask: null, shell: 'terrain-following lift',
    },
  },
  scale: {
    table: 'field-scales.js#temperature', levels: [-10, -5, 0, 5, 10, 15, 20, 25, 30, 35], bins: 11,
    isolines: { chips: [2, 5], default: 5, bold: [0, 'every10'], color: '#fff' },
    labels: { source: 'contour-math.js (2° 솎은 격자 180×91, 키프레임 변경 시만)', max: { desktop: 24, mobile: 12 } },
    polarExtension: 'PD_DECISION',
  },
  units: { primary: '°C', alt: '°F', switch: 'legend-only', modelPrecision: 0.5, freePrecision: 1, obsPrecision: 0.1 },
  obsOverlay: { sources: ['wind/gts-global.json#ta', 'wind/kma-aws.json#temp_c'], badge: 'OBS', showWhen: 'timeOffset === 0', nearestKm: 25 },
  anomaly: { source: 'wind/kma-anom.json (예정, kma-aws Lambda 가 83지점 산출)', basis: '어제 하루 평균 − 평년 평균(1991–2020)', stations: 83,
             bins: [-8, -6, -4, -2, -0.5, 0.5, 2, 4, 6, 8], todayChip: { enabledAfterKst: 18, note: '정시 관측 기준(잠정)' }, contour: false },
  sources: [
    { id: 'gfs', badge: 'MODEL', org: 'NOAA NCEP GFS 0.5°', times: ['run', 'valid'], license: 'US Gov public domain', staleAfterH: 12 },
    { id: 'kma-asos', badge: 'OBS', org: '기상청 ASOS 정시', times: ['observed'], license: '공공누리 1유형', slaMin: 120 },
    { id: 'gts', badge: 'OBS', org: 'GTS SYNOP (기상청 API허브 · 좌표 NOAA ISD)', times: ['observed'] },
    { id: 'kma-normal', badge: 'DERIVED-BASE', org: '기상청 평년값 1991–2020 (sfc_norm1)' },
  ],
  frames: { stepH: 3, count: 41, horizonH: 120, past: false, pastReason: '기온 프레임 이력 없음 — 수집 시작일부터 쌓임', interpolate: 'value-mix (모델 출력 아님 표기)' },
  inspector: { chips: ['Surface (2m)' /* 고정 표기, 선택지 하나면 칩으로 가장하지 않음 */, 'Isotherm on/off', '2°C|5°C', 'Model: GFS (고정 라벨)'], valueLines: ['model', 'nearestObs'], curve5d: 'EXPLORER' },
  compare: [
    { pair: 'run|run', model: 'gfs', status: 'after-W0', needs: ['manifest runs[] 포인터', 'S3 lifecycle 확인'], diffBins: [-6, -4, -2, -1, 1, 2, 4, 6] },
    { pair: 'obs|model', where: 'inspector-line', status: 'after-W0' },
    { pair: 'IFS|AIFS', scope: '한국 ASOS 97지점 · 24~120h', data: 'archive/ecmwf/<run>.json', status: 'blocked: 정기 실행 미등록(PD)' },
    { pair: 'GFS|ECMWF', status: 'unavailable', reason: 'ECMWF 격자 수집기 없음(eccodes · L)' },
  ],
  intel: { packets: ['weather.temperature_anomaly (aws/kma-aws/intel_temp.py)'], hostFix: 'intelHostFor 가 weather.temperature 에도 패킷을 돌려주게',
           planned: { attribution: ['z500 능선 지속 일수', 'SST 편차', '지면 건조'], probability: { source: 'ENSEMBLE', model: 'NOAA GEFS 31', status: '해독 미확인' }, next: '기상청 단기예보 최고/최저 인용' },
           layout: ['value', 'anomaly', 'source+time', 'sentence'], tabs: ['Now', 'Forecast', 'Climatology', 'Analysis'] },
  simulation: { capability: "SIM_CAPABILITIES['weather.temperature']", status: 'not_available', entry: 'top-bar', snapshot: ['run', 'valid', 'camera', 'point', 'scale'],
                scenarios: [{ id: 'current', status: 'available(스냅샷만)' }, { id: 'plus2c', status: 'not_available', reason: 'CMIP6 자료 미보유' }, { id: 'plus4c', status: 'not_available', reason: 'CMIP6 자료 미보유' }] },
  tiers: { 1: 'FREE', 2: 'FREE(1°C 반올림) / EXPLORER(실측 0.1°C 대조)', 3: 'FREE', 4: 'FREE(+24h) / EXPLORER(+120h · 5일 곡선)', 5: 'PRO', 6: 'EXPLORER', 7: 'PRO' },
}
```

</details>

#### 02 Wind 바람

| 단계 | 지금 | 끝났을 때 사용자가 보고 하는 것 | 이 메뉴가 공급할 것 | 선행 | 요금 |
|---|---|---|---|---|---|
| **① 극적으로 보인다** | 🟡 prototype/v2-three/js/live-layers.js:2132-2248 buildWind — 관측소마다 LineSegments 선분(:2163 길이 0.003+min(ws/25,1)x0.011, :2176) + 입자 P_PER=2(:2184)가 셰이더에서 p=position+aDir*t(:… | 좌레일 '바람' 1탭 → 공용 프레임 저장소가 지금 시각의 10 m u/v 프레임 2장만 받아 3초 안에 전지구(바다 포함)에 흰 입자 꼬리가 흐르고, 그 아래 풍속이 PD 8칸(<1 · 1~5 · 5~10 · 10~20 · 20~30 · 30~40 · 40~50 · 50 이상 m/s) 단색 띠로 갈린다. 자동 회전 중에도 꼬리가 지구에 붙어 흐르고(월드 공간 이력 선분) 날짜변경선을 끊김 없이 넘으며, 저기압·태풍 둘레의 소용돌이가 입자로 읽힌다. 범례(m/s·kt 두 줄 + 'MODEL · GFS 0.5도 · run/valid' + '입자 속도·꼬리는 과장 표현')가 상시 보이고 막대기 선분은 어디에도 없다 — 관측소 3,000곳은 'Show Stations'(기본 OFF)의 숫자+화살촉+OBS 마커로만. P1 에 Pressure 토글이 생기면 흰 4 hPa 등압선(20 hPa 굵게, 전지구 뷰 8 hPa 솎음)과 'L 992'/'H 1026' 이 입자 위에 겹쳐 '선이 촘촘한 곳 = 바람 센 곳'이 읽힌다.<br>⚠️ *말하면 안 되는 것:* '현재 바람'이라 부르지 않는다 — GFS '지금' 프레임은 실제로 +6~12시간 예보이므로 '지금 시각의 모델 바람(run · +h)'. 40~50 · 50 이상 칸이 보인다고 약속하지 않는다(0.5도는 태풍 중심을 무디게 담는다). 입자 속도·꼬리 길이는 과장 표현임을 범례가 말한다. 입자는 MODEL 이다 — 관측 공백(중국·몽골·러시아)을 관측으로 메운 것처럼 말하지 않고 관측소 마… | [필드] wind10m = u{step}.png R=u·G=v, 8bit 선형 0.5 m/s, +-64 m/s, 0.5도 720x361(지시서 W0 표 — 검증 분석문의 'uv{step}.png' 와 파일명이 다르다, W0 표를 따른다). speed = length(u,v) 를 셰이더와 CPU 가 같은 식으로. (P1) mslp = m{step}.png 8bit 선형 0.5 hPa 940~1067, highp 필수. [눈금] field-scales.js 의 w… | W0(UGRD/VGRD 10 m 추가 · describe 로 levelType/levelValue 분기[10 m = lt 103/10, 700hPa = lt 100/70000] · 새 필드는 missing 목록에 넣지 않음 · elapsedS<600 · 공용 프레임 저장소를 Cloud… | FREE |
| **② 정확한 값** | 🟡 prototype/v2-three/js/main.js:2775-2844 왼쪽 클릭 경로 = extScene.pick(:2799) → travel.pick(:2807) → seafloor.pick(:2821) → focus.pick 국가 선택 + 인구 지표 메뉴(:2831-2837) → 그 밖(바다)은… | 지구를 한 번 클릭하면 우측 Inspector ValueCard 에 '~14.0 m/s (27 kt) · 남서풍 225도'가 뜨고 바로 아래 '0.5도 격자(약 55 km) 평균 · 격자점 35.5N 126.5E · 클릭 지점에서 18 km · 눈금 0.5 m/s'. 값은 지금 물려 있는 두 프레임의 CPU 사본에서 읽어 네트워크 호출 0건이다. 25 km 안에 관측소가 있고 타임라인이 '지금'이면 OBS 값이 먼저 나온다: 'OBS 11.2 m/s 서남서 · 군산 · 3.8 km · 14:00 KST'. 태풍 중심 500 km 안이면 Hazards 의 공식 최대풍속을 기관명·발표 시각과 함께 병기하고, Pressure 토글이 켜져 있으면 같은 카드에 '~1004 hPa' 한 줄(H/L 라벨과 1 hPa 안에서 일치). (예시 수치)<br>⚠️ *말하면 안 되는 것:* 0.1 m/s 정밀을 말하지 않는다(8bit 눈금 0.5 · 55 km 격자 평균). 격자값을 도시·지점값처럼 말하지 않는다(물결표 + 격자점 좌표·거리). 태풍 눈벽 풍속은 모델 격자에서 공식 발표보다 낮게 나온다 — 그래서 공식값을 병기하고 모델값을 '최대풍속'이라 부르지 않는다. 돌풍은 말하지 않는다(GFS GUST 필드가 W0 목록에 없다). 해륙풍·산곡풍·협곡풍 같은 국지풍은 0.… | sampler = 공용 프레임 저장소의 u 프레임 A/B CPU 사본 + 시간 보간 f(u·v 성분 선형, 각도 보간 금지). 표기 = 풍속 m/s + kt 동시, 풍향은 '불어오는 방위' 16방위 + 도, 물결표, 눈금 0.5. 정밀도 문구 '0.5도 격자 평균 — 지점값 아님'. obsFirst 규칙 = 25 km · wind/kma-aws.json(wind_ms·wind_dir) + wind/gts-global.json(ws·wd) — 이미 받는 파일,… | W0(u 프레임) · W1(sampleAt 일반화 — main.js:1980-2019 를 공용 sampler 로) · W5(우측 Inspector) · W3. main.js:2898·2900·2932 의 api.open-meteo.com 직접 호출 제거(지시서 W2 가 :2932 를… | FREE |
| **③ 출처** | 🟡 prototype/v2-three/js/ui-shell.js:1244 패널 헤더에 selectedMenu.l.src + dataBadge(state) — 메뉴 줄 값은 ui-shell.js:66-67('Open-Meteo 격자 5도' · MODEL), :80('KMA AWS·GTS' · OBSERVED… | ValueCard 바로 아래 같은 카드에서 ProvenanceCard 가 'MODEL · NOAA NCEP GFS 0.5도(약 55 km) · run 09-20 00Z · valid 09-20 09:00Z(+9 h) · 프레임 사이 선형 보간 · 퍼블릭 도메인'을 보인다. OBS 행이 있으면 'OBSERVED · 기상청 AWS · 군산 · 관측 14:00 KST · 공공누리 1유형'이 MODEL 행과 배지로 갈려 나란히 선다. run 이 12시간 넘게 늙으면 '지연' 배지, 태풍 공식값에는 기관명·발표 시각. 화면 어디에도 Open-Meteo 출처 문구가 없고, 시안 02 의 'Model ECMWF' 는 자료가 없으므로 적지 않는다(Model = GFS 고정 라벨).<br>⚠️ *말하면 안 되는 것:* 'GFS/ECMWF'처럼 모델을 뭉뚱그려 적지 않는다. ECMWF 바람은 저장소에 없다(aws/ecmwf-ingest 는 2t 점값 + 태풍 경로뿐) — 적지 않는다. 모델값에 '관측'이라는 말을 쓰지 않는다(지금 live-layers.js:1191 이 그렇게 쓴다). 관측 시각을 모르는 OBS 값은 보이지 않는다. 보간된 시각의 값을 '모델 출력'이라 부르지 않는다. | 출처표: gfs10m {org NOAA NCEP · model GFS · kind MODEL · res 0.5도 · license public domain · 시각 3종 run/valid/leadH · interp 고지 · staleAfterH 12} — W0 매니페스트(run·generatedAt·grid·steps[].valid, aws/gfs-cloud-forecast/handler.py:392-428 에 이미 있는 필드)에서 읽는다. kmaAws {기상… | W0(매니페스트에 model·run·해상도·각 프레임 valid·license 필드) · W5(Inspector) · W1(배지 규약). 작은 선행: metaWind 에 관측 시각 보강(필드는 이미 온다). 결정 필요: 요금 — PD 요금표는 'source·time'을 EXPLORER… | FREE |
| **④ 시간축** | ❌ 타임라인 자체는 하나로 이미 있다 — prototype/v2-three/js/ui-shell.js:1334 #ts-range(min -1440 · max 7200 · step 30분 = -24h~+120h), :1347-1356 applyTime → hooks.onTimeOffset. main.js:4… | 화면 맨 아래 하나뿐인 Global Timeline 을 밀면 입자장·풍속 색면(·P1 등압선과 H/L)이 같은 시계로 지금 → +120h 를 3시간 프레임 사이 선형 보간으로 끊김 없이 움직이고, 옆에 'GFS 00Z · 9 h ago · +36 h'가 항상 붙는다. 재생 중에는 등압선 선 라벨이 숨고 H/L 만 남으며 멈추면 돌아온다. 시각이 '지금'을 벗어나면 Show Stations 의 OBS 숫자와 Inspector 의 OBS 행이 사라진다. 과거 쪽(-24h)은 이전 런들의 짧은 예보(+0~+5h) 프레임을 이어 붙인 것이고 그렇게 표기한다 — 런 보존이 확인되기 전에는 이 메뉴에서 과거 쪽을 비활성으로 두고 사유를 말한다. 첫 화면은 2프레임만 받고 나머지는 사용자가 시간을 만질 때(기존 prefetchFrames 규칙).<br>⚠️ *말하면 안 되는 것:* 과거 쪽 바람장을 '분석장'이나 '관측'이라 부르지 않는다(재분석·관측 격자가 없다 — 이전 런의 짧은 예보다). +120 h 너머는 없다. 프레임 사이 값은 보간이며 모델 출력이 아니다. 예보 시각의 화면에 현재 관측을 얹지 않는다. 무료(지금~+24 h 제안)와 EXPLORER(+120 h)의 경계는 잠금 아이콘이 아니라 '결과 일부를 보인 뒤'의 문법으로. | 프레임 = u{step}.png 41장 · 3 h · 0~120 h(+P1 m{step}.png). 보간 규칙 = u·v 성분 선형(풍향 각도를 보간하지 않는다) + Inspector 에 '모델 프레임 사이 보간' 고지. 스크럽 규칙 = 한 프레임 넘게 뛰면 바람장만 교체하고 꼬리 링버퍼를 비운다(옛 시각의 꼬리가 새 시각 위에 남지 않게). 매니페스트 steps[].hl(스텝별 H/L). onlyAtNow 목록 = 관측소 마커 · OBS 행 · Flying… | W0(u/m 프레임 41장 · missingSteps=[] · DEADLINE 초과 시 +120h 쪽이 먼저 빈다 = 유료 구간) · 공용 프레임 저장소(W0 끝 항목 — 지금은 구름이 GFS 모드일 때만 프레임이 로드된다 main.js:1814-1866) · W5(타임라인 옆 run… | EXPLORER |
| **⑤ 비교** | ❌ prototype/v2-three/js 전체에서 compare\|split\|wipe 를 grep 한 결과, 지구 비교 UI 는 0건이다. ui-shell.js 의 일치(:590 · :608 · :804 · :833 · :1142)는 localeCompare/split 문자열 함수뿐. scenario-… | TOP 의 Compare(또는 Inspector 의 Compare 버튼)를 누르면 지금 보던 카메라·시각·고도·범례를 그대로 들고 Compare 작업 공간이 열린다. 왼쪽 'GFS 09-20 06Z 런' \| 오른쪽 'GFS 09-20 00Z 런', 같은 valid 시각(+24 h), 두 쪽 입자가 같은 씨앗으로 흐르고 wipe 막대를 끌면 저기압 소용돌이가 런 사이에 얼마나 옮겨졌는지 보인다. diff 모드는 풍속 차이를 발산형 구간색(-20 · -10 · -5 · -2 · +2 · +5 · +10 · +20 m/s)으로 칠하고 Inspector 에 '이 지점 +2.5 m/s · 6Z 런이 더 세게 본다'. 양쪽 머리에 run 시각·해상도(0.5도)·'공통 눈금'이 적히고 URL 로 공유된다. P1 에 Variable = 해면기압이 붙으면 'L 중심이 런 사이 180 km 이동'이 간판 그림이 된다. (예시 수치)<br>⚠️ *말하면 안 되는 것:* GFS \| ECMWF 를 지어내지 않는다 — 시안 02·10 의 ECMWF 는 자료가 없다. 런 간 차이를 '오차'라 부르지 않는다(예보가 바뀐 양이지 정답과의 차이가 아니다 — 어느 런이 맞았는지는 채점이 말한다). 모델 - 관측 차이에는 지점 대표성(55 km 평균 대 10 m 한 점)이 들어 있다고 적는다. valid 시각이 다른 두 장을 같은 것처럼 나란히 놓지 않는다(scenar… | 비교 짝 목록(준비 상태와 사유를 함께): run-run(간판 · 새 라이선스 0 · manifest-prev 필요) / time-time(같은 런의 valid T \| T+24 h · 새 자료 0 · 첫날부터 됨) / obs-model(관측소 마커에 '모델 - 관측' · 지금 시각만 · split 이 아니라 지점 오버레이) / gfs-ecmwf(ready:false — ECMWF 격자 수집기 없음) / scorecard(ready:false — Open-Me… | W8(Compare workspace · L) · W1 · W3 · W0 에 manifest-prev(또는 manifest history) 한 줄 + 이전 런 폴더 보존 확인. GFS \| ECMWF 는 ECMWF 격자 수집기(별도 L · AEC 압축이라 eccodes 필요 · dep… | PRO |
| **⑥ Intelligence** | ❌ prototype/v2-three/js/phenomenon-registry.js:815 weather.wind capabilities.intelligence = true → intel-questions.js:59-60 hasIntel 참. 그러나 main.js:4098-4112 intelHostFor… | 위치를 고르면 Intelligence Inspector 가 위에서부터 (1) 수치 '~14.0 m/s 남서풍 · 24시간 전 같은 시각 대비 +6.5' (2) 출처 'MODEL · GFS 0.5도 · run/valid' + 'OBS 군산 11.2 m/s 14:00 KST' (3) 그 아래 문장 순으로 선다. 원인 문장 예: '남서쪽 약 420 km 에 저기압 중심(L 992 hPa)이 있고 이 지점의 기압 경도는 100 km 에 2.4 hPa 입니다(GFS 해면기압, 같은 run/valid). 이 경도면 지균풍 관계로 약 23 m/s 가 기대되고 10 m 모델 풍속은 그 0.6배입니다 — 이 바람은 그 저기압 둘레의 기압 경도 때문입니다.' 근거 = 측정된 조건(PRMSL 프레임의 경도 + Lambda 가 찾은 L 중심) + 문헌 기작(지균·경도풍 균형, 지면 마찰). 확률 문장 예(태풍 문맥일 때): '태풍 중심이 이 지점 300 km 안을 지날 확률 75% — ECMWF 앙상블 51개 중 38개(run …). 경로의 확률이며 풍속의 확률이 아닙니다.' 근거 = events/typhoon-ecmwf.json 51멤버 세기. 채점 이력이 쌓인 뒤: 'GFS 가 +24 h 에 10 m/s 이상을 예보한 212건 중 131건(62%)에서 실제 10 m/s 이상이 관측됐습니다 — 기상청 ASOS, 최근 180일.' 발효 중인 강풍특보(기상청)는 기관명·발표 시각과 함께 그대로 인용. (모든 수치는 예시)<br>⚠️ *말하면 안 되는 것:* 풍속 자체의 확률(%)은 지금 말할 수 없다 — 바람 격자 앙상블이 없고 채점 이력이 없다. 그때까지 확률 문장은 태풍 경로 앙상블(경로의 확률)뿐이고, 없는 절은 빈 카드로 만들지 않고 coverage.missing 에 사유를 적는다. 기압 경도 귀속은 위도 15도 안쪽(코리올리 약함)과 국지풍(해륙풍·산곡풍·협곡풍 — 0.5도 모델 밖)에서는 하지 않고 '함께 나타난 조건'에서 멈춘다.… | 패킷 생산자(신규 — 지금 0개): phenomenonId weather.wind. 재료는 W0 Lambda 가 어차피 만드는 것과 겹친다 — 스텝별 systems[](H/L 중심·중심기압 = 등압선 H/L 표식과 같은 목록) + 전지구 최대 풍속 격자와 위치 + 20 m/s 이상 면적 비율 + 이전 런 같은 valid 대비 change. attribution 규칙 2개: pressure-gradient{condition: m 프레임 경도 + 최근접 L/H +… | W9(attribution[]/probability[] 절 신설 · narration_guard 개정 — 지금은 '때문에'·'가능성'을 무조건 막는다 · 채점 구조) · W0(m 프레임 + Lambda H/L — 렌더러는 P1 이어도 자료는 W0 에 같이 온다) · W5(Inspect… | EXPLORER |
| **⑦ Simulation** | 🟡 prototype/v2-three/js/sim-questions.js:337-350 weather.wind = engine null · engineRef null · status NOT_AVAILABLE, 질문 하나('바람은 앞으로 어떻게 불까?')와 사유('바람장은 기관 수치예보를 그대로 그립니다 —… | Inspector 하단과 TOP 의 Simulation — 9개 메뉴가 같은 자리 — 을 누르면 지금 상태(카메라 · 타임라인 시각 · GFS run/valid · 클릭 지점과 값 · 켠 토글)가 스냅샷으로 저장되고 별도 작업 공간이 Current → Baseline → Scenario → Result 로 열린다. Current 칸에는 방금 보던 바람이 그대로 있다. 첫 시나리오 '여기서 놓은 공기는 어디로 갈까?': 출발점 = 클릭 지점, 기간 칩 24 h \| 72 h \| 120 h, Baseline = 최신 런, Scenario 칩 = 이전 런. Result 는 두 궤적 선과 '120 h 뒤 끝점 1,840 km 동북동 · 두 런의 끝점 차이 310 km'(절대와 차이 동시) + '10 m 수평 바람만 따라간 선 — 공기의 상승·하강과 확산은 없다'. 엔진이 붙기 전에는 같은 자리에서 Current 칸까지만 열리고 Baseline 부터는 'EARTHUS 가 만든 바람 계산은 아직 없습니다 — 바람장은 NOAA 수치예보 그대로입니다'와 준비 중인 후보를 말한다. (예시 수치)<br>⚠️ *말하면 안 되는 것:* 지금 EARTHUS 가 만든 바람 계산은 없다 — 그 사실을 같은 입구에서 말한다. 공기 궤적은 기관 예보 바람 위의 10 m 수평 운동학 궤적이다: 연직 운동·확산·침적이 없으므로 '오염물질이 어디로 퍼지나'의 답이 아니고(대기질 확산은 sim-questions.js:332-334 에서 NOT_AVAILABLE), 출처 귀속도 하지 않는다(엔진이 SOURCE_NOT_ATTRIBUTED 를… | SIM_CAPABILITIES['weather.wind'] 개정안: (a) wind-future('앞으로 어떻게 불까')는 W3 뒤 타임라인이 답한다 → limited + 액션 '예보 재생' + 한계 문장 '기관 예보를 재생합니다 — 계산이 아닙니다'. (b) 신규 air-parcel('여기서 놓은 공기는 어디로 갈까?') — engineRef prototype/js/earthus2/v11/environment/transport-simulator.js(실재 파… | W10(작업 공간 · 스냅샷 · SimulationRunRecord) · W3(u 프레임 · CPU 사본) · 공용 프레임 저장소 · manifest-prev(가지 = 이전 런). available 승격 조건: 서버 실행 + 기록 + 검증 — 검증안: 예보로 그린 궤적을 뒤에 온 런들… | PRO |

- **⑤ 비교 짝:** 간판 짝 = 런 대 런: 'GFS 최신 런 \| GFS 이전 런', 같은 valid 시각. 이유: (1) 새 라이선스 0 · 새 수집기 0 — W0 가 만드는 u/m 프레임이 런 폴더(clouds/gfs-fc/{run_tag}/, aws/gfs-cloud-forecast/handler.py:368-377)에 그대로 남는다 (2) 질문이 분명하다 — '예보가 6시간 사이에 어떻게 바뀌었나, 저기압이 얼마나 옮겨졌나' (3) 같은 모델·같은 격자·같은 눈금이라 diff 가 정직하다. 필요한 것: manifest-prev(또는 최근 4런 history) 한 줄과 이전 런 폴더 보존 확인 — 핸들러에 삭제 코드는 없지만 S3 수명주기 규칙은 UNKNOWN 이고 manifest.json 은 최신 런만 가리킨다(:429).<br>첫날부터 되는 대체 짝 = 시각 대 시각: 같은 런의 'valid T \| T+24 h'. 공용 프레임 저장소에 이미 있는 두 프레임이라 추가 자료가 0 이다('내일 이맘때 바람이 얼마나 세지나').<br>지금 자료로 되는 또 하나 = 관측 대 모델: 관측소 3,000곳(wind/kma-aws.json + wind/gts-global.json)의 OBS 와 그 자리 GFS 격자값을 '지금' 시각에 '모델 - 관측' 지점 마커로. split 지구가 아니라 지점 오버레이이고, 55 km 평균 대 한 점이라는 대표성 한계를 적는다.<br>지금 안 되는 것: (a) GFS \| ECMWF split — ECMWF 격자 수집기가 없다(aws/ecmwf-ingest 는 ASOS 97지점 2t 점값 + 태풍 경로 51멤버뿐, AEC 압축이라 eccodes 필요 · 별도 L). 시안 02 의 'Model ECMWF' 와 시안 10 의 GFS\|ECMWF 는 그때까지 적지 않는다. (b) 채점 있는 비교 — aws/kma-verify 가 이미 gfs_seamless 대 ecmwf_ifs025 의 wind_speed_10m 을 +24/+48 h 로 기상청 ASOS 와 채점해 wind/series/verify-daily.json 에 쌓고 있어(handler.py:58-60) 저장소에서 유일한 '바람 모델 대 모델' 자료지만, Open-Meteo 파생이라(handler.py:48 · R0 감사 :26) 유료 화면에 못 올린다. 대체 경로는 R0 감사가 적어 둔 'NOMADS GFS + ecmwf-ingest 에 10u/10v 추가'. (c) 기관 대 기관(JTWC\|JMA\|KMA)은 태풍 풍속의 짝이라 06 Hazards 소속 — 02 Wind 는 Inspector 에 공식 최대풍속을 병기만 한다.<br>P1 에 기압이 붙으면 Variable = 해면기압의 런 간 diff(L 중심 이동)가 Compare 의 간판 변수가 된다.
- **⑦ 시나리오:** 저장소에 이미 있는 것부터:<br>1) sim-questions.js:337-350 — weather.wind 는 engine null · NOT_AVAILABLE, 질문 1개 + 사유. 입구는 있고 엔진은 없다. 기압·패러글라이딩은 항목 자체가 없다.<br>2) prototype/js/earthus2/v11/environment/transport-simulator.js (사본 prototype/v2-deploy/engine-v11/environment/) — advectPoint: RK2 중점법 · cos(위도) 보정 · vectorProof(WIND_VECTOR · sourceId · observedAt) 없으면 거부 · 벡터 공백이면 VECTOR_GAP 으로 멈춤 · 결과에 MODELLED_TRANSPORT / SOURCE_NOT_ATTRIBUTED. v2-three 에서 import 0건(미배선). → 02 Wind 의 정직한 첫 시나리오 후보 '여기서 놓은 공기는 어디로 갈까?': GFS 10 m u/v 41프레임을 vectorSampler 로, 기간 칩 24/72/120 h, Baseline = 최신 런, Scenario = 이전 런, Result = 두 궤적 + 끝점 거리(절대) + 런 간 끝점 차이(Δ). 필요한 것: W0 u 프레임 · 공용 프레임 저장소의 CPU 사본 · manifest-prev · W10 작업 공간. 가용성: 브라우저 계산이라 지어지면 limited(기록 남는 계산 아님). available 로 올리려면 서버 실행 + SimulationRunRecord + 검증(예보 궤적 대 뒤에 온 런들의 +0~+3 h 프레임으로 다시 그린 궤적의 끝점 오차를 리드타임별로 채점).<br>3) services/research-runtime/research_runtime/models_v2.py:25 surface-passive-advection.v2.windage + wind.py — 해류 + 바람 끌림(alpha x U10, RK4 전 단계, OceanParcels)으로 표류를 계산하고 기록을 남기는 진짜 계산, scenario-compare.js 가 기준/가지(windage alpha)를 비교한다. 다만 이것은 바다 표류다(바람 입력은 NCEP R2 재분석 10 m, GFS 예보가 아님) → Ocean 메뉴 소속. 02 Wind 에서는 결과 화면의 건너가기 링크로만 잇는다.<br>4) aws/tsunami-eta(유일한 available) · sim-ocean Gerstner 는 바람 메뉴와 무관(파도 장면이 풍속을 입력으로 받을 뿐).<br>없는 것: 바람장을 스스로 계산하는 엔진(수치예보)은 없고 만들 계획도 없다 — 바람장은 NOAA 예보 그대로다. 기후 시나리오 바람(CMIP6)은 자료가 없다. 대기질 확산은 NOT_AVAILABLE 로 선언돼 있다.<br>입구: 9개 메뉴와 같은 자리(Inspector 하단 + TOP Simulation). 엔진이 붙기 전에는 스냅샷을 든 Current 칸까지만 열리고 Baseline 부터는 기존 사유 문장과 준비 중인 후보(공기 궤적)를 말한다. 'wind-future' 질문은 W3 뒤에는 타임라인이 답하므로 limited('기관 예보를 재생합니다 — 계산이 아닙니다')로 바꾸는 것을 제안한다.
- **첫 단면(7단계를 전부 관통하는 가장 얇은 출시):** 가장 얇은 단면 = 'GFS 0.5도 · 10 m · 한 고도'로 7단계를 한 번에 꿰는 것. 기압 토글 · Show Stations 마커 · Flying sites · 상층 · ECMWF 는 전부 뒤로 민다.<br>(1) 보인다 — W0 의 u{step}.png + 공용 프레임 저장소 + W1/W2 의 구간화 셰이더로: 입자장(기본 ON, 월드 공간 꼬리) + 풍속 8칸 구간색 + 범례(m/s·kt · MODEL · GFS 0.5도 · run/valid · 과장 고지). 기존 weather/wind 막대와 weather/windgrid·presgrid 5도 색면은 이 단면이 나가는 날 같이 내린다(대체물 없이 먼저 없애지 않는다, 레이어 id 는 유지). 관측소는 이 단면에서 지구 위에 그리지 않고 Inspector 의 OBS 행으로만 남긴다.<br>(2) 읽는다 — 클릭 1회 → u 프레임 CPU 사본에서 '~N m/s (kt) · 16방위 · 격자점 좌표·거리 · 눈금 0.5', 25 km 안 관측소는 OBS 행 먼저(이미 받는 kma-aws.json · gts-global.json). 네트워크 0건. main.js:2898·2900·2932 의 Open-Meteo 호출은 이 경로로 대체.<br>(3) 출처 — 같은 카드에 'MODEL · NOAA GFS 0.5도 · run · valid(+h) · 보간 · 퍼블릭 도메인' / 'OBSERVED · 기관 · 지점 · 관측 시각'. 매니페스트에 이미 있는 run · generatedAt · grid · steps[].valid 를 읽는다.<br>(4) 시간 — 기존 #ts-range(ui-shell.js:1334) 하나가 u 프레임을 지금 → +120 h 로 움직인다(무료 +24 h 제안). 과거 쪽은 이 메뉴에서 비활성 + 사유('이 메뉴의 과거 프레임은 이전 런 보존 확인 뒤'). 새 슬라이더 0개.<br>(5) 비교 — Compare 입구는 제자리에. 첫 동작은 split/wipe 없이 되는 단일 지구 diff: 'valid T+24 h - 지금'(같은 런, 새 자료 0)을 같은 FieldRenderer 의 발산형 구간색으로. manifest-prev 가 확인되면 곧바로 'GFS 최신 런 \| 이전 런' diff 로 승격. split/wipe 는 W8 이 오면 같은 짝 정의를 그대로 쓴다. GFS\|ECMWF 칸은 만들지 않는다.<br>(6) Intelligence — 입구는 제자리에. 첫 패킷 = WHAT(격자값 · 이전 런 대비 변화) + EVIDENCE(출처) + NEXT(GFS 스텝값을 기관 예보 인용으로) + 발효 중 강풍특보 인용. 원인 문장은 규칙 하나(pressure-gradient)만 — m 프레임과 Lambda H/L 이 W0 에 같이 오므로 렌더러(P1)를 기다리지 않아도 된다. 다만 W9 의 가드 개정 전에는 '함께 나타난 조건'으로만 내보낸다. 확률은 태풍 문맥일 때 ECMWF 51멤버 경로 확률 하나. 풍속 자체의 확률은 '입구 + 사유'(앙상블 없음 · 채점 이력 없음 — coverage.missing).<br>(7) Simulation — 입구는 제자리에. 스냅샷(카메라 · 시각 · run/valid · 클릭 지점 · 값)을 들고 Current 칸까지 열리고, Baseline 부터는 sim-questions.js 의 기존 사유 문장 + '준비 중: 여기서 놓은 공기는 어디로 갈까(예보 바람을 따라간 궤적)'. W10 작업 공간이 아직 없으면 지금의 sq-na 버튼이 같은 Inspector 자리에서 그 역할을 한다.<br>미루는 것과 순서: Pressure 토글(등압선 · H/L — W1 등치선 셰이더 뒤, P1) → Show Stations 숫자 마커 → run-run split/wipe(W8) → 공기 궤적 limited(W10) → 채점기 · VERIFIED_MODEL 확률(W9) → 상층 850/500/250 hPa → 서태평양 0.25도 창 → ECMWF 격자와 GFS\|ECMWF → Flying sites(PD 결정 뒤).<br>게이트: W0 실측(elapsedS < 600 · missingSteps = [] · 구름 이류용 700hPa u/v 가 10 m 에 덮이지 않았는지) → 꼬리 기법 1일 스파이크 → 폰(폭 375)에서 입자 5,000개 이하와 ECO 단계 감소 확인.
- 비고: 경로는 모두 D:\## APP\EARTHUS v2_APP 기준. 읽기 전용으로만 작업했다(수정·커밋·배포 없음). advisor 도구는 호출 한도에 걸려 쓰지 못했다.<br>[직접 열어 확인한 파일] prototype/v2-three/js/live-layers.js(:480-604 · :1072-1196 · :2130-2304 · :2850-2919) · main.js(:1805-1879 · :1960-2019 · :2396-2416 · :2775-3104 · :4060-4170 · :4870-5035) · ui-shell.js(:50-85 · :315-357 · :1195-1250 · :1325-1364) · phenomenon-registry.js(:695-845 · :1040-1128) · sim-questions.js(:1-80 · :325-360) · intel-strip.js(:1-125) · intel-questions.js(:1-100) · scenario-compare.js(:1-60) · prototype/js/earthus2/v11/environment/transport-simulator.js · services/research-runtime/research_runtime/wind.py · aws/gfs-cloud-forecast/handler.py(:345-432) · aws/kma-verify/handler.py(:1-110) · aws/report-engine/adapters/kma_verify_adapter.py(:1-60) · docs/earthus-v2/PAID-UX-REDESIGN-2026-09-20/DEV-DIRECTIVE.md(:60-260) · docs/R0-OPEN-METEO-AUDIT-2026-09-20.md(grep). v1 windfield.js · flow.js 는 상수와 export 줄만 확인했고(windfield.js:25 COUNT_MAX 4200, flow.js:3·24·34) 나머지 줄 번호는 검증 분석을 그대로 썼다.<br>[이번에 새로 확인한 것 — 검증 분석에 없던 것]<br>1. weather.wind 는 capabilities.intelligence:true(phenomenon-registry.js:815)인데 생산자가 없다 — intelHostFor(main.js:4098-4112)에 분기가 없어 띠가 빈 문자열이다. 능력 선언이 생산자를 앞서 있다.<br>2. 바람의 '모델 대 모델' 자료가 저장소에 하나 있다: aws/kma-verify 가 GFS 대 ECMWF IFS 의 wind_speed_10m 을 +24/+48 h 로 기상청 ASOS 와 채점한다(ME/MAE/RMSE/n, 760일 보관). report-engine 이 이미 이것으로 weather.wind 리포트를 만든다(kma_verify_adapter.py:34). 다만 Open-Meteo 파생(R0 감사 :26) — Compare 의 '채점 있는 비교'와 Intelligence 의 VERIFIED_MODEL 확률의 원형이지만 대체가 선행.<br>3. 미배선 엔진 transport-simulator.js(advectPoint)가 바람 메뉴의 정직한 첫 시뮬레이션 후보다. vectorProof 의 필드명이 observedAt 인데 모델 예보를 넣으면 이름이 어긋난다.<br>4. metaWind(live-layers.js:2294-2304)에는 관측 시각이 없다 — 자료에는 온다(kma-aws observedKst, gts observedUtc). 관측 레이어가 시각을 말하지 않는 것은 정직성 규칙 위반.<br>5. 우클릭 '바람' → pointWeather 는 풍향을 요청하고(main.js:2932) 표시하지 않는다(:2943). 바람 값이 나오는 두 길(:2898-2900 · :2932)이 모두 브라우저의 Open-Meteo 직접 호출이다.<br>6. phenomenon-registry.js:818(바람) · :734(기압)의 '격자 1시간 갱신'은 낡았다 — R0 감사 :21 과 intel-rollup/rollup.py:24 는 wind-grid 를 3시간 주기로 적는다.<br>7. 타임라인은 이미 하나다(-24 h~+120 h, ui-shell.js:1334). 바람 메뉴에 새로 만들 것은 슬라이더가 아니라 setTimeOffset(live-layers.js:2857)에 물릴 프레임이다.<br>8. gfs-cloud-forecast 핸들러에는 이전 런 폴더를 지우는 코드가 없다(:345-432). 런 간 비교·과거 타임라인의 가능 여부는 S3 수명주기 규칙(UNKNOWN)에 달렸다.<br>9. 태풍 강풍반경(r15/r25)은 v2 태풍 레이어에 없다(live-layers.js grep 0건) — Inspector 와 Intelligence 는 '강풍반경 안'이라 말할 수 없고 중심까지 거리 + 공식 최대풍속만 말한다.<br>[문서 사이 불일치 — 정리 필요]<br>- 바람 프레임 파일명: 검증 분석은 uv{step}.png, 지시서 W0 표는 u{step}.png(R=u · G=v). 이 매트릭스는 W0 표를 따랐다.<br>- 기압 인코딩: 검증 분석은 920~1075 hPa · 0.61 hPa 눈금 예시, 지시서 W0 표는 940~1067 hPa · 0.5 hPa. 0.5 hPa 눈금이면 4 hPa 등압선 값이 전부 눈금 위에 놓이므로 W0 표 쪽을 권한다(940 미만 태풍 중심은 끝값으로 잘리므로 매니페스트에 실제 min/max 를 실수로 적는다).<br>[요금 표기] 지금은 FREE_OPEN(전부 열림). (2)(3)을 FREE 로 적은 근거는 전제 7('기본 그림은 무료에서도 완성돼 보여야 하고 유료는 깊이로 판다') + 정직성 규칙('자료 시각과 출처를 항상 말한다') + DoD('모든 수치에 source+timestamp'). PD 요금표는 '정확값 → source·time'을 EXPLORER 에 두므로 충돌 — 기본 한 줄은 무료, 깊이(OBS 대조표 · 5일 점 곡선 · 계보)는 EXPLORER 로 나누는 안을 냈다. 강풍특보와 태풍 공식 최대풍속은 안전 정보라 무료.<br>[PD 결정 필요 목록] (a) 10 m 전용 세분 눈금 (b) 패러글라이딩 자리 — 02 Wind 'Flying sites' 토글 / v1 이관 / 삭제(좌레일에 자리 없음) (c) 무료 타임라인 상한(+24 h 제안)과 25 km OBS 값의 무료 포함 여부 (d) 상층 고도의 등급 (e) 이전 런 보존(S3 수명주기 · 권한) (f) kma-verify 의 Open-Meteo 대체 승인 (g) W9 가드 개정 — 근거가 실린 인과·확률 문장의 허용 조건.<br>(6)의 문장 예와 모든 수치(14.0 m/s · 2.4 hPa/100 km · 지균풍 23 m/s · 75% = 38/51 · 62% = 131/212 · 1,840 km 등)는 형식을 보이기 위한 예시이며 실측값이 아니다. 기압 경도 2.4 hPa/100 km → 지균풍 약 23 m/s 는 위도 36도 · 공기밀도 1.2 kg/m3 로 계산한 값이다.

<details><summary>descriptor 초안</summary>

```js
export const WIND_DESCRIPTOR = {
  id: 'wind', rail: 2, label: { ko: '바람', en: 'Wind' },
  phenomena: {
    primary: 'weather.wind',
    merged: ['weather.pressure'],          // Inspector 'Pressure (hPa)' 토글 · P1 — 동작하는 날 나타난다(죽은 토글 금지)
    pendingPD: ['weather.paragliding'],    // 'Flying sites' 토글 / v1 이관 / 삭제 — PD 결정 필요
    keepLayerIds: ['weather/wind', 'weather/windgrid', 'weather/presgrid', 'hobby/para'],   // 개명 금지
  },
  sources: {
    gfs10m: { org: 'NOAA NCEP', model: 'GFS', kind: 'MODEL', res: '0.5deg (~55 km)', license: 'public domain',
              manifest: 'clouds/gfs-fc/manifest.json', times: ['run', 'valid', 'leadH'], lateAfterH: 12 },
    kmaAws: { org: '기상청 AWS', kind: 'OBSERVED', doc: 'wind/kma-aws.json', timeField: 'observedKst', license: '공공누리 1유형' },
    gts:    { org: 'GTS SYNOP', kind: 'OBSERVED', doc: 'wind/gts-global.json', timeField: 'observedUtc' },
    tcOfficial: { ref: 'hazards.typhoon', kind: 'OFFICIAL_FORECAST', use: '공식 최대풍속 병기(기관 · 발표 시각)' },
    banned: ['wind/global.json (Open-Meteo 5deg)', 'wind/wind-ea.json', 'wind/pressure-ea.json', 'api.open-meteo.com 직접 호출'],
  },
  fields: {
    wind10m: { type: 'vector2', frame: 'u{step}.png', channels: { R: 'u', G: 'v' },
               decode: 'm/s = byte/255*128 - 64', quantum: 0.5, unit: 'm/s',
               level: { label: '10 m', fixed: true }, grib: { levelType: 103, levelValue: 10 } },
    speed:   { type: 'scalar', derive: 'length(wind10m)' },                 // 셰이더와 CPU 가 같은 식
    dirFrom: { type: 'angle', derive: 'atan2(-u, -v)', format: '16방위 + deg (불어오는 방위)' },
    mslp:    { type: 'scalar', frame: 'm{step}.png', decode: 'hPa = 940 + byte*0.5', unit: 'hPa',
               precision: 'highp', phase: 'P1', systems: 'manifest.steps[i].hl[]' },   // H/L 은 Lambda 가 실수 값에서
  },
  scale: {
    speed: { breaks: [1, 5, 10, 20, 30, 40, 50], units: ['m/s', 'kt'], ktLabels: [2, 10, 19, 39, 58, 78, 97],
             palette: 'field-scales.js#wind8', mode: 'stepped', contour: null /* 등풍속선 금지 */, noPromise: ['40~50', '>=50'] },
    mslp:  { fill: null, isoline: { interval: 4, boldEvery: 20, farInterval: 8, farAltKm: 12000 } },
    diffSpeed: { breaks: [-20, -10, -5, -2, 2, 5, 10, 20], mode: 'stepped-diverging' },   // 제안값 — PD 확인
  },
  render: {
    colorField: { field: 'speed', radioGroup: 'atmos-field' /* 01·03 과 상호배타 */, shell: 'airShell', dimsCloudAndBase: true },
    particles:  { field: 'wind10m', defaultOn: true, overlayOn: ['temperature', 'wind', 'rain'],
                  advect: 'v1 windfield.js 구면 이류(랩 bilinear · cos 위도 · 경도 랩 · out 재사용)',
                  trail: 'world-space ring buffer — 1일 스파이크로 확정',
                  density: { chips: ['1/3', '2/3', 'all'], budget: 'flowRenderBudget(device, thermal) * thermal.particleScale' },
                  color: { fieldOn: '#ffffff', fieldOff: 'speed bins' }, onScrubJump: '장만 교체 · 꼬리 비움' },
    stations:   { toggle: 'Show Stations', defaultOn: false, glyph: '숫자 + 화살촉 + OBS 배지', onlyAtNow: true, noSticks: true },
    isolines:   { field: 'mslp', labels: 'contour-math @2deg · 키프레임 때만 · 재생 중 숨김',
                  hl: 'L 파랑 / H 주황 · 고지대 미표기 · labelBudget 안', phase: 'P1' },
  },
  legend: { lines: ['m/s', 'kt'], provenance: 'MODEL · GFS 0.5deg · run {run} · valid {valid} (+{leadH}h)',
            notes: ['입자 속도·꼬리 길이는 방향과 상대 세기를 보이기 위한 과장 표현'], lateBadge: '지연' },
  inspector: {
    controls: [ { label: 'Level', value: '10 m' }, { label: 'Model', value: 'GFS' },        // 선택지 하나 = 고정 라벨
                { toggle: 'Particles' }, { chips3: 'Density' }, { toggle: 'Show Stations' },
                { toggle: 'Pressure (hPa)', showWhen: 'mslp frames + isoline renderer ready' },
                { toggle: 'Flying sites', showWhen: 'PD 결정' } ],
    value: { sampler: 'cpuCopy(frameA, frameB, f) — 네트워크 0', grid: 'nearest 0.5deg point',
             format: '~{speed} m/s ({kt} kt) · {dir16} {deg}deg',
             precisionNote: '0.5deg 격자(약 55 km) 평균 · 눈금 0.5 m/s · 지점값 아님',
             obsFirst: { radiusKm: 25, show: ['value', 'station', 'distanceKm', 'observedAt'], onlyAtNow: true },
             tcCrossRef: { withinKm: 500, show: '공식 최대풍속 · 기관 · 발표 시각' } },
    provenance: { rows: ['org', 'OBS|MODEL', 'run', 'valid', 'leadH', 'interp', 'res', 'gridPoint', 'license'] },
  },
  frames: { store: 'shared frame store', stepH: 3, count: 41, rangeH: [0, 120], firstLoad: 2,
            interp: 'u·v 성분 선형(각도 보간 금지) — 모델 프레임 사이 보간이라 고지',
            past: { mode: 'prevRuns(+0~+5h)', needs: 'manifest history + 런 폴더 보존', fallback: '과거 쪽 비활성 + 사유' },
            freeMaxLeadH: 24 /* 제안 */ },
  compare: {
    pairs: [
      { id: 'run-run',   a: 'GFS latest run', b: 'GFS previous run', sameValid: true, needs: 'manifest-prev', newLicense: 0, flagship: true },
      { id: 'time-time', a: 'valid T', b: 'valid T+24h', sameRun: true, needs: null },
      { id: 'obs-model', form: 'station markers (model - obs)', onlyAtNow: true },
      { id: 'gfs-ecmwf', ready: false, reason: 'ECMWF 격자 수집기 없음 — 별도 L · eccodes' },
      { id: 'scorecard', src: 'wind/series/verify-daily.json', ready: false, reason: 'Open-Meteo 파생 — 대체 뒤' },
    ],
    variables: ['speed', 'particles', 'mslp (P1)'], modes: ['split', 'wipe', 'diff'],
    sync: ['camera', 'time', 'level', 'legend', 'particleSeed'], scaleChoice: ['common', 'per-side'], shareUrl: true,
  },
  intel: {
    phenomenonId: 'weather.wind', producer: null /* 신규 — 지금 생산자 없음(intelHostFor 에 분기 없음) */,
    packet: { current: ['maxSpeed + 위치', 'area>=20m/s %', 'systems[]'], change: 'vs 이전 런 같은 valid', next: '스텝별 값(기관 예보 인용)' },
    attribution: [
      { id: 'pressure-gradient', condition: 'm 프레임 경도 + 최근접 L/H(systems[]) · |lat| >= 15', mechanism: '지균·경도풍 균형 + 지면 마찰(문헌)', strength: 'V10/Vg' },
      { id: 'tc-proximity', condition: '공식 태풍 중심까지 거리 + 공식 최대풍속', mechanism: '열대저기압 풍속 구조(문헌)' } ],
    probability: [
      { source: 'ENSEMBLE', event: '태풍 중심 300 km 이내 통과', data: 'events/typhoon-ecmwf.json (51)', when: '태풍 문맥일 때만', ready: true },
      { source: 'VERIFIED_MODEL', event: '예보 >=X m/s 일 때 실측 >=X m/s 비율', ready: false, reason: '채점 이력 누적 전' },
      { source: 'ENSEMBLE', model: 'NOAA GEFS', ready: false, reason: 'grib2lite 해독 미확인' } ],
    agencyQuote: ['기상청 강풍특보(발효 사실 · 발표 시각)'], order: ['value', 'source', 'sentence'],
  },
  simulation: {
    entry: 'Inspector 하단 + TOP Simulation (9개 메뉴 같은 자리)', capability: "SIM_CAPABILITIES['weather.wind']", statusNow: 'not_available',
    snapshot: ['camera', 'timeOffset', 'run', 'valid', 'clickedPoint', 'value', 'toggles'],
    candidates: [
      { id: 'air-parcel', ko: '여기서 놓은 공기는 어디로 갈까?', engineRef: 'prototype/js/earthus2/v11/environment/transport-simulator.js',
        input: 'GFS 10 m u/v 41 frames', chips: ['24h', '72h', '120h'], baseline: 'latest run', scenario: 'previous run',
        result: '궤적 + 끝점 거리(절대) + 런 간 끝점 차이(delta)', statusWhenBuilt: 'limited', limits: '10 m 수평 운동학 궤적 — 연직·확산 없음' },
      { id: 'windage-drift', linkTo: 'ocean', engineRef: 'services/research-runtime/research_runtime/models_v2.py', note: '바람은 강제력 — 바다 메뉴 소속' } ],
  },
  tiers: { FREE: ['입자 + 구간색 + 범례', '클릭 기본값(~격자값) · 출처 · 시각', '타임라인 ~+24h(제안)', '강풍특보 · 태풍 공식값'],
           EXPLORER: ['+120h', 'OBS 대조 · 내 위치 5일 풍속 곡선', '짧은 Intelligence(원인 · 확률)'],
           PRO: ['Compare(run-run → GFS|ECMWF)', 'Simulation', 'export'] },
};
```

</details>

#### 03 Rain 강수

| 단계 | 지금 | 끝났을 때 사용자가 보고 하는 것 | 이 메뉴가 공급할 것 | 선행 | 요금 |
|---|---|---|---|---|---|
| **① 극적으로 보인다** | 🟡 메뉴의 대표 레이어 weather/radar(phenomenon-registry.js:925 role primary)는 live-layers.js:588 에서 `obj: new THREE.Group()` — '강수'를 눌러도 지구 위 객체 0개. 같은 메뉴의 raingrid 는 Open-Meteo 5°… | '강수' 1탭 → 3초 안에(지금 시각 두 프레임, 스텝당 평균 107KB) 지구에 PD 8칸 단색면(0.1~0.5·0.5~1·1~2·2~5·5~10·10~20·20~50·≥50 mm/h)이 뜬다. 아래 두 칸은 옅게(전지구 15~17%가 0.1mm/h 초과라 구름·지표를 덮지 않게), 2mm/h 이상은 진하게, 태풍·전선의 10·20mm/h 코어는 굵은 흰 셰이더 선과 코어 최댓값 숫자 라벨 상위 N개(둘 다 P1)로 읽힌다. 눈은 같은 구간의 찬색 램프, 어는비는 보라. 좌하단 Legend 에 mm/h 8칸 + 'MODEL · GFS 0.5° · run ○Z · +○h · 격자 평균'이 상시 있고 맨 위 두 칸에는 '30mm/h 이상 구분 불가(인코딩 상한)'. 구름이 위성 모드든 꺼져 있든 비는 뜨고, 과장 50× 에서도 airShell 높이라 산 밑에 묻히지 않는다.<br>⚠️ *말하면 안 되는 것:* '현재 강우'라고 말하지 않는다 — '지금' 프레임은 항상 +6~12h 예보(12Z 런이 22:10Z 게시). 0.5° 칸 평균이라 국지 호우 극값은 안 보인다(≥50 칸이 비는 것이 정상). 30mm/h 초과는 인코딩 상한으로 구분 불가. 전지구 '관측' 강수는 스택에 없다. 한국 레이더는 좌표계 없는 그래픽이라 지구에 얹지 않는다. 강수 종류는 모델 판정이다. | 필드 prate(p{step}.png R채널 log 복호 — 상수는 manifest.encoding 수치 필드에서) · 범주 채널 G(비/어는비/눈 — 보간 금지, 구간 판정) · 눈금 breaks [0.1,0.5,1,2,5,10,20,50] mm/h · 칸별 alpha 초안(아래 두 칸 0.30·0.42) · discardBelow 0.1 · 8칸 색 초안 = 현 rainRamp 의 앵커 8색(precip-field.js:45-51)을 단색으로 · snow… | ①공용 프레임 저장소 분리 — CloudManager.loadGfs/frameTexAt(main.js:1814-1909)를 구름 모드에서 떼기(01 Temperature 와 공유, 최우선 선행) ②FieldRenderer 기준 구현체(01) ③Legend 셸 슬롯 ④메뉴 연결 변경:… | FREE |
| **② 정확한 값** | 🟡 왼쪽 클릭 경로 main.js:2775-2844 는 extScene.pick → travel.pick → seafloor.pick → focus.pick(국가) → marineSelect(바다; Open-Meteo Marine fetch :2898-2900)로 끝난다 — 강수 값 분기 0. 퀵메뉴 po… | 지구 어디든 클릭 1회 → 우측 Inspector.ValueCard 에 큰 숫자 '3.4 mm/h · 비' + 구간 칩(2~5) + 'MODEL 격자 평균 0.5°(약 55km 칸) — 이 지점 실측이 아닙니다' + 읽은 격자점 좌표. 네트워크 호출 0건(p 텍스처 CPU 사본, 최근접 칸 — 보간값을 말하지 않는다). 0.05 미만은 '0 (모델 강수 없음)', 0.05~0.1 은 '0.1 미만'. 한국 안이면 둘째 줄에 가장 가까운 AWS 실측 'OBS · 15분 0.5mm · 60분 3.5mm · ○○지점 3.2km · 14:50 KST'(30분 넘게 늙으면 '관측 지연'). EXPLORER 는 같은 카드에서 '언제부터 얼마나' 41스텝 시계열.<br>⚠️ *말하면 안 되는 것:* 0.5° 칸 평균을 '이 동네 강수량'이라 말하지 않는다. 프레임 사이 시각에는 혼합값이 아니라 가까운 실제 프레임 값과 그 valid 시각을 말한다(3시간 간격). 30mm/h 초과는 '30 이상'. AWS 실측은 한국만이고 지점값이지 면적값이 아니다. 요금 주의: PD 표는 '정확값=EXPLORER'인데 DoD 는 '클릭 한 번으로 정확값' — 비는 안전 성격이라 한 점의 지금 값은 F… | sampler(prate: R→mm/h, G→종류; 최근접) · 정밀도 문구('격자 평균 0.5°') · 양자화 폭(8bit log, 한 계단 약 2.5% → 유효숫자 2자리) · 0/미만/상한('30 이상') 표기 규칙 · 한국 OBS 짝(wind/kma-aws-min.json 의 rn15·rn60·rnday + 지점 거리 + 늙음 가드 30분) · 41스텝 시계열 읽기(프레임 41장 약 4.4MB — 요청 시에만 받음) | Inspector 셸(P0) · 클릭 경로에 '필드 현상이 켜져 있으면 값 샘플 우선' 분기(main.js:2793 이후 — 국가 포커스와의 우선순위는 셸 공통 결정) · sampleAt 을 공용 프레임 저장소로 이동(mode 가드 제거) · manifest.encoding 수치 필드… | FREE |
| **③ 출처** | 🟡 GFS 모드일 때만 구름 noteEl 에 'MODEL 배지 · GFS 0.50° 예보 T+○h · 유효 M/D HH시'(main.js:2053-2054) — 구름 문구이고 강수·run 시각·라이선스·'격자 평균' 없음(run 은 로드 라벨 main.js:1864 에만). 레이더 카드(live-layer… | 같은 Inspector 의 ProvenanceCard: [MODEL] NOAA NCEP GFS 0.5°(칸 약 55km) · run 09-19 12Z · valid 09-20 00Z(+12h) · 게시 22:10Z(런 나이 ○h) · 변수 PRATE(지표 강수율)·종류 CRAIN/CSNOW/CFRZR/CICEP 모델 판정 · 복호 grib2lite · 'NOAA — public domain' · '프레임 사이는 선형 혼합 — 모델 출력 아님'. 한국이면 [OBS] 기상청 AWS 매분 · 관측 14:50 KST · 공공누리 / [OBS] 기상청 HSR 레이더 · 5분 · 그래픽(좌표계 없음) 줄이 따로 선다. Legend 밑 한 줄('MODEL · GFS 0.5° · run 12Z · +12h')은 Inspector 를 열지 않아도 항상 보인다.<br>⚠️ *말하면 안 되는 것:* GFS 단일 결정론 런이다 — 'ECMWF'·'관측'·'다중 모델'이라 적지 않는다. 라이선스 문구는 클라이언트 상수로 박지 않고 서버 manifest 가 싣는다. 요금 주의: 배지 한 줄(기관·MODEL/OBS·시각)은 정직성 규칙상 항상 FREE, 확장 상세(런 나이·게시 지연·복호기·라이선스)만 EXPLORER 로 나눌 수 있다. | 출처표 3줄(GFS PRATE / KMA AWS 매분 / KMA HSR 레이더) — 각 줄에 기관·관측/모델·시각 3종(observed·run·valid)·해상도·라이선스·truthClass · 게시 지연 계산(generatedAt − run) · 늙음 가드(AWS 30분, manifest 런 나이 경고) · '혼합 프레임' 고지 문구 | manifest 에 license 와 encoding 수치 필드 추가(서버 S, handler.py:392-427) · Inspector 셸 · 기존 dataBadge 재사용 · raingrid 메뉴 연결 제거(Open-Meteo 출처가 유료 핵심 그림에 남지 않게) · pointWe… | FREE |
| **④ 시간축** | 🟡 시간축은 하나다 — ui-shell.js:1334 `#ts-range` -1440~+7200분 → :1351 hooks.onTimeOffset → main.js:4891-4898 → clouds.setForecastOffset → `this.precip.set(a.precip, b.precip, f)`… | Global Timeline 하나로 8칸 강수면이 지금 → +120h 흐른다(3h 프레임, 사이는 혼합 — 배지에 표기), 구름 모드와 무관하게. 눈금 위에 'run 12Z' 시작점과 '지금'이 찍히고 런 이전 구간은 회색 비활성('이 런에 없는 시각'). 시간을 움직이면 Inspector 값·valid 시각·Legend 배지가 같이 바뀐다. 누적 칩(P1)을 켜면 같은 타임라인이 '앞으로 3h·24h 예상 누적'의 창 끝을 움직이고 범례가 mm 로 바뀐다. 한국 레이더 1시간 루프(5분×13장)는 새 슬라이더 없이 타임라인의 −60분~0 구간에 물려 Inspector 안 영상이 따라온다.<br>⚠️ *말하면 안 되는 것:* GFS 로 '과거 강수'를 보여 주지 않는다 — 런 시각 이전 프레임은 없고, 런 시각~지금 구간도 분석이 아니라 예보다. 프레임 사이 값은 선형 혼합이며 모델 출력이 아니다. 전지구 과거 관측 강수는 없다(IMERG 수집기 없음). 과거 실측은 한국 레이더 1h·AWS 뿐이다. FREE 는 +24h, +120h 와 누적은 EXPLORER. | frames 기술자{manifest: clouds/gfs-fc/manifest.json, 41스텝·3h, file 키 'precip', blend 'linear(표기)', range [run, run+120h]} · 런 이전 구간 정책(비활성) · 누적 창 정의(P1: APCP 앞으로 3h/24h) · OBS 과거 1h(kma-radar frames 13장) 시간축 매핑 · prefetch 정책 유지(시간을 만진 사람만 — main.js:1914-1933) ·… | 공용 프레임 저장소 분리(mode==='gfs' 가드 제거) · frameIndexAt clamp 정직화 · timeNote 에 강수 문구 추가 · P1: APCP 파서(서버 M — pdt 8, f000 부재, done 모은 뒤 후처리 합산; grib2lite 통계 구간 노출 UNKN… | FREE |
| **⑤ 비교** | ❌ v2-three/js 에서 compare\|split\|wipe grep — 필드 비교 UI 0건. scenario-compare.js:1-27 은 research-runtime 표류 실행(SIMULATION 기록) 전용 비교표이지 지구 비교가 아니다. main.js 의 'compare' 적중은 '부이… | TOP 의 Compare → 작업 공간. 기본 짝 [시각↔시각]: 같은 GFS 런의 '지금' \| '+24h' 를 split globe(카메라·고도·8칸 범례 동기, wipe 전환) — diff 모드는 mm/h 차를 발산 구간색(−10·−5·−2·−0.5·+0.5·+2·+5·+10)으로 칠해 비가 어디서 어디로 옮겨 가는지 10초 안에 읽힌다. 한국으로 확대하면 둘째 짝 [기관↔모델]: 기상청 동네예보 97지점 PCP·POP 숫자 마커 \| GFS 0.5° 같은 valid 시각 칸 값(나란히 + 표). 헤더에 양쪽의 run/발표 시각·해상도, URL 공유(짝·시각·카메라). 목록 맨 아래에 'GFS \| ECMWF 강수 — ECMWF 격자 수집기 준비 중'이 사유와 함께 보인다(잠금 아이콘 아님).<br>⚠️ *말하면 안 되는 것:* 'GFS \| ECMWF 강수 비교'는 지금 못 한다 — PD 가 Pro 핵심으로 꼽은 바로 그 짝이다. 'multi-model'이라 부르지 않는다. 기관↔모델은 한국 97지점뿐이고 PCP 는 범주 문자열일 수 있어(kma-fcst/handler.py:326 '문자열이면 원문 그대로') diff 를 계산하지 않는다. 시각↔시각 diff 는 '예보된 변화'이지 관측된 변화가 아니다. | 비교 짝 목록 + 가용성 플래그(time-time: now / agency-model KR: now / obs-model KR: P1 / run-run: 서버 S / model-model: 불가) · diff 발산 8칸 눈금 · 공통 scale 고정(양쪽 같은 8칸) · 단위 정합 규칙(PRATE 순간 mm/h ≠ PCP 1h 누적 mm ≠ rn60 — 같은 이름으로 부르지 않고 뺄셈하지 않음) · 런↔런용 이전 런 manifest 주소 | Compare workspace(P1 공용) · 공용 프레임 저장소의 '두 시각 동시 보유' · wind/kma-fcst.json 클라이언트 fetch(이미 main.js:3425 가 태풍 문맥으로 받는 파일) · 런↔런: 런 폴더마다 manifest 사본 쓰기(서버 S — 지금 ha… | PRO |
| **⑥ Intelligence** | ❌ phenomenon-registry.js:719 capabilities.intelligence:false → hasIntel false(intel-questions.js:59-60) → intelStripHtml 이 '' 반환(intel-strip.js:80). intelHostFor(main.js:4… | 위치 선택 → Inspector Intelligence 탭(Now/Forecast/Climatology/Analysis), 순서 고정: ①수치 'GFS 4.2 mm/h · 비(+9h · 격자 평균)' · 한국이면 'AWS 60분 3.5mm(○○, 14:50)' ②출처·시각 ③그 아래 문장. 확률 문장 예: "기상청 동네예보는 가장 가까운 지점(서울, 4.1km)의 15~18시 강수확률을 80%로 발표했습니다(11시 발표). GFS 12Z 런도 같은 시간대 3~5mm/h 를 냅니다 — 두 예보가 같은 방향입니다." 원인 문장 예: "이 비는 대류성입니다 — GFS 가 이 칸 강수의 78%를 대류강수로 계산했고 CAPE 가 1,900 J/kg 입니다. 불안정한 대기의 상승류가 만드는 소나기형 강수 기작과 일치합니다." / "태풍 ○○ 중심이 기상청 09시 공식 경로상 280km 에 있고 강수역이 그 나선대 위에 있습니다 — 태풍 외곽 강수대." Forecast 탭은 41스텝 '언제부터 얼마나'.<br>⚠️ *말하면 안 되는 것:* 확률(%)은 한국 97지점에서만 말할 수 있다(기상청 POP 인용, '가장 가까운 지점 기준' 명시). 한국 밖은 GFS 단일 결정론 런뿐 — GEFS 31멤버 해독 미확인이라 %를 말하지 않는다. '채점된 모형' 확률(GFS 가 비라 한 곳에 실제로 온 비율)은 AWS 이력 저장이 없어 아직 불가. 원인 문장은 조건 값과 문헌 기작이 패킷에 실렸을 때만 — 지금은 생산자가 없어 한 문장도… | 5번째 패킷 생산자(신규, 지점형 'weather.precipitation'): WHAT(GFS 칸 값·AWS 실측) · NEXT(기상청 동네예보 PCP·POP 인용 = 유형 A OFFICIAL_FORECAST) · probability[]{p, kind:'AGENCY_POP', issuer:'KMA', issuedAt, validFrom/To, station, distanceKm} · attribution[]{조건·값·출처·문헌 기작 ref}: 대류강수 비율… | 인텔 패킷 v1 의 attribution[]·probability[] 확장(공용) · 생산자 신설(서버 M: kma-fcst 에 intel 블록, gfs-cloud-forecast 가 이미 받는 CPRAT·CAPE 원값(handler.py:101, :165)을 지점에서 뽑아 싣기 —… | EXPLORER |
| **⑦ Simulation** | ❌ sim-questions.js:114-128 — 'weather.precipitation' engine:null · engineRef:null · status NOT_AVAILABLE, 질문 2개(precip-move :123, precip-6h :125) 모두 NOT_AVAILABLE + 사유. re… | TOP 의 Simulation 과 Inspector 맨 아래 'Simulation 으로' 가 다른 8개 메뉴와 같은 자리에 있다. 누르면 지금 상태(카메라·valid 시각·필드 prate·선택 지점 값)를 스냅샷으로 들고 작업 공간으로 들어가 Current 칸에 그 스냅샷이 보이고, Scenario 칸에는 후보 칩 '예상 누적 ×1 / ×1.5 / ×2 → 유출 깊이(mm)'가 비활성으로 서며 사유가 붙는다: '강수 시나리오 계산 엔진이 아직 없습니다 — 유출 계산(SCS-CN)은 토양·피복 곡선번호, 하천망, 보정이 준비돼야 열립니다. 비의 이동은 GFS 예보 프레임으로 보세요(타임라인)'. 기록 남는 계산이 생기면 같은 자리에서 absolute 와 delta 가 나란히 나온다.<br>⚠️ *말하면 안 되는 것:* 기록 남는 강수 계산은 0건이다. v02 의 advectScalarField(nowcast.js:20)로 GFS 프레임을 우리 손으로 밀어 '미래 비'를 만들지 않는다 — 이미 있는 모델 예보를 중복하고 sim-questions.js:126('우리가 만든 미래 값은 없습니다')과 충돌한다. 레이더 이류 초단기 예측도 불가(기상청 레이더는 좌표계 없는 그래픽). '시뮬레이션'이라는 말을 타임… | 스냅샷 필드(view·timeOffset·field 'prate'·run·point 값) · 시나리오 후보 정의(예상 누적 배율 칩 → SCS-CN 유출 깊이; P2 이후 CMIP6 강수 변화 칩) · 가용성 사유 문장(ko/en) · sim-questions.js:124 사유 고쳐 쓰기(지금 문장은 '이류 엔진을 연결하면 된다'로 읽혀 :126 과 어긋난다) | Simulation workspace(P2 공용) · APCP 누적(P1, 입력) · 곡선번호(토양·피복) 격자·DEM·하천망·보정 — floodScenarioGate(prototype/js/earthus2/v02/hydrology/runoff-routing.js:19-23)가 셋 다… | PRO |

- **⑤ 비교 짝:** 1순위(지금 자료로 즉시, 전지구): 시각↔시각 — 같은 GFS 런의 '지금' \| '+24h'(임의 두 valid 시각). 공용 프레임 저장소가 두 장을 동시에 들면 되고 서버 작업 0. split/wipe + diff(mm/h 차 발산 8칸).<br>2순위(지금 자료로 즉시, 한국): 기관↔모델 — 기상청 동네예보 97지점 PCP·POP(wind/kma-fcst.json · 81h · 1h 간격 · 공공누리 · v2 가 이미 main.js:3425 에서 받는 파일) \| GFS 0.5° 같은 valid 시각 칸 값. 나란히만 보이고 뺄셈은 하지 않는다(PCP 는 범주 문자열일 수 있고, 1h 누적 vs 순간 강수율).<br>3순위(P1, APCP 파서 뒤): 관측↔모델 — 한국 AWS rn60 \| GFS 1h 환산 누적.<br>4순위(서버 S): 런↔런 — 프레임은 clouds/gfs-fc/{YYYYMMDDHH}/p###.png 로 런마다 폴더가 갈리고 핸들러에 삭제 코드가 없지만, manifest 는 최신 것만 남는다(handler.py:429). 런 폴더에 manifest 사본을 쓰면 '예보가 어떻게 바뀌었나'가 된다. 버킷 lifecycle 이 옛 런을 지우는지는 UNKNOWN.<br>안 되는 것: GFS \| ECMWF — ECMWF 강수 격자 수집기가 없다(ecmwf-ingest 는 한국 97지점 2t 의 IFS 대 AIFS 뿐, README:93-95 가 강수는 따로 설계하라고 적어 둠). PD 가 Pro 핵심으로 꼽은 짝을 지금은 줄 수 없고, 화면에는 잠금이 아니라 사유로 적는다. 강수 앙상블(GEFS)도 없어 '멤버 간 비교'도 불가.
- **⑦ 시나리오:** 저장소에 있는 후보 엔진(직접 열어 봄) — 어느 것도 지금 정직하게 열 수 없다:<br>- prototype/js/earthus2/v02/weather/nowcast.js — advectScalarField(:20, 반라그랑주 이류 + 성장/소멸) · blendNowcastWithNwp(:43). 브라우저 라이브러리, 검증·SimulationRunRecord 없음. GFS 프레임에 쓰면 이미 있는 모델 예보를 우리 손으로 다시 만드는 셈이고(sim-questions.js:126 과 충돌), 본래 용도인 레이더 초단기 이류는 기상청 레이더가 좌표계 없는 그래픽이라 입력이 없다.<br>- prototype/v2-deploy/engine-v11/environment/transport-simulator.js — advectPoint(:3, 중점법, vectorProof 필수). 점 궤적용. v2-deploy 는 생성물이고 강수장 계산이 아니다.<br>- prototype/js/earthus2/v02/hydrology/runoff-routing.js — scsRunoffMm(:3 SCS-CN) · routeLinearReservoir(:12) · floodScenarioGate(:19). 이 메뉴에 가장 의미 있는 시나리오('예상 24h 누적 ×1/×1.5/×2 → 유출 깊이, absolute+delta')의 재료지만 곡선번호 격자·DEM·하천망·보정이 모두 준비돼야 게이트가 열린다 — 그 자료의 존재는 UNKNOWN, 입력인 APCP 누적도 P1.<br>- services/research-runtime 은 OceanParcels 표층 표류 전용, aws/tsunami-eta 는 쓰나미 — 무관.<br>- v02/weather/precipitation.js(상 판정·관측 혼합 상태), ensemble.js, forecast-gap.js 는 계산 부품이지 시나리오 엔진이 아니다.<br>결론: status 는 not_available 유지, 입구는 다른 메뉴와 같은 자리(TOP Simulation + Inspector 하단)에 두고 스냅샷을 들고 들어가 '엔진 없음 + 필요한 것'을 말한다. 장기 후보: ①유출 깊이 시나리오(APCP + CN 격자 + §N 검증) ②CMIP6 강수 변화 칩(+2°C/+4°C — 자료 없음). sim-questions.js:124 의 사유 문장('이류 엔진이 있지만 연결되지 않았다')은 연결하면 된다는 뜻으로 읽혀 고쳐 써야 한다.
- **첫 단면(7단계를 전부 관통하는 가장 얇은 출시):** 넣는 것(7단계 전부 관통):<br>(1) '강수' 1탭 = 공용 프레임 저장소(구름 GFS 모드에서 분리)에서 지금 시각 두 장 → PrecipField 셰이더를 8칸 구간 판정·discard 0.1·아래 두 칸 옅게·airShell 로 바꿔 즉시 표시 + Legend 8칸과 배지 한 줄('MODEL · GFS 0.5° · run ○Z · +○h · 격자 평균', 상한 고지 포함). raingrid 는 메뉴에서 뺀다.<br>(2) 지도 클릭 → 이미 있는 복호(main.js:2010-2016 sampleAt)를 저장소 쪽으로 옮겨 Inspector.ValueCard 에 'N mm/h · 종류 · 격자 평균 0.5°' — 호출 0건.<br>(3) 같은 카드에 manifest 의 source·run·valid·grid + 'NOAA public domain'(manifest 에 license 필드 추가, 서버 S).<br>(4) 기존 단일 타임라인 그대로 — 강수면은 이미 main.js:2043 으로 흐른다. mode 가드 제거, 런 이전 구간 비활성, 무료 +24h.<br>(5) Compare 입구 + 시각↔시각('지금' \| '+24h') split 한 짝. Compare workspace 가 아직 없으면 입구 + 사유('시각↔시각부터 열립니다 · GFS\|ECMWF 는 ECMWF 강수 수집기가 없어 불가').<br>(6) Intelligence 탭은 증거 우선 배치로 수치→출처까지 채우고, 문장 자리에는 '이 현상의 인텔 패킷 생산자가 아직 없습니다 — 한국은 기상청 강수확률 인용부터 붙습니다'.<br>(7) Simulation 입구는 같은 자리, 스냅샷을 들고 들어가 고쳐 쓴 사유(엔진 없음 + 필요한 것)를 보여 준다.<br>미루는 것: 코어 등치선·코어 라벨, 인코딩 상한 30→100(복호 2곳 단일화 뒤), APCP 누적 칩, AWS 실측 숫자 마커와 1h 칩, 레이더 1h 루프, 41스텝 시계열, 기관↔모델·런↔런 짝과 diff, 패킷 생산자, 유출 시나리오, IMERG 전지구 관측.
- 비고: - 읽기 전용으로만 조사했다(수정·커밋·배포 없음). 주요 파일: D:\## APP\EARTHUS v2_APP\prototype\v2-three\js\precip-field.js · main.js · live-layers.js · ui-shell.js · sim-questions.js · intel-strip.js · intel-questions.js · phenomenon-registry.js · scenario-compare.js, D:\## APP\EARTHUS v2_APP\aws\gfs-cloud-forecast\handler.py · aws\kma-fcst\handler.py · aws\kma-aws-min\handler.py · aws\ecmwf-ingest\README.md, D:\## APP\EARTHUS v2_APP\prototype\js\earthus2\v02\weather\nowcast.js · hydrology\runoff-routing.js.<br>- 새로 확인한 것 ①: (6)의 '확률'은 지금 자료로 한국에서 성립한다 — 기상청 동네예보 POP(wind/kma-fcst.json, 97지점 81h)가 이미 수집되고 있고 v2 는 강수 용도로 한 번도 안 쓴다. 한국 밖 확률은 근거가 없다.<br>- 새로 확인한 것 ②: 값 읽기 부품은 이미 있다 — clouds.sampleAt 이 텍스처 CPU 사본에서 mm/h·종류를 복호한다. 다만 호출처가 '지구에 묻기' 스냅샷 하나뿐이라 클릭과 연결만 하면 (2)가 선다.<br>- 새로 확인한 것 ③: 타임라인 과거 구간의 정직성 결함 — frameIndexAt 의 0 clamp(main.js:1871)로 런 시각 이전이 f000 으로 고정돼 과거처럼 보인다.<br>- 새로 확인한 것 ④: 퀵메뉴 pointWeather(main.js:2932)는 클릭마다 Open-Meteo 를 직접 호출하고 강수를 기간 없는 'mm'로 적는다 — 비상업 조항 위험과 단위 결함이 같이 있다.<br>- 새로 확인한 것 ⑤: sim-questions.js:124 의 사유 문장은 '엔진을 연결하면 된다'로 읽혀 :126 과 어긋난다 — 고쳐 쓸 것.<br>- 요금 충돌 2건(PD 확인 필요): (2) PD 표 'EXPLORER=정확값' 대 DoD '클릭 한 번으로 정확값'; (3) PD 표 'EXPLORER=source·time' 대 정직성 규칙 '출처·시각은 항상'. 이 매트릭스는 둘 다 기본 한 줄은 FREE, 깊이(시계열·누적·확장 상세)는 EXPLORER 로 적었다.<br>- UNKNOWN: S3 버킷 lifecycle 의 옛 런 폴더 삭제 여부 · grib2lite 의 통계 구간 노출 여부 · 곡선번호/하천망 자료 존재 · 구름 셸의 실제 반지름(airShell 과 같은 식이라는 주석만 확인 — 강수면과의 그리기 순서는 renderOrder 로 정해야 함) · W0~W10 정의(전달되지 않아 dependsOn 은 이름으로 적음).<br>- aws/kma-radar/handler.py 의 '좌표계 없음' 근거는 직접 열지 않았고 전달된 검증 분석과 live-layers.js:1238 카드 문구에 의존했다.

<details><summary>descriptor 초안</summary>

```js
{
  id: 'rain', menu: '03 Rain', phenomenonId: 'weather.precipitation',
  layers: {
    primary: 'weather/precip',            // 신규 id 추가(개명 아님) — 지금 cloud-gfs 안에 묻힌 GFS 강수면
    obsCards: ['weather/radar'],          // 지구에 얹지 않음 — Inspector 안 1h 루프(P1)
    removeFromMenu: ['weather/raingrid'], // Open-Meteo 5° — 유료 핵심 그림에서 제외
    movedOut: { 'weather/cloud-gfs': '04 Clouds(Forecast)' },
  },
  fields: [
    { id: 'prate', label: { ko: '강수율', en: 'Precipitation rate' }, unit: 'mm/h', truth: 'MODEL',
      texture: { store: 'gfs-fc', fileKey: 'precip', channel: 'R',
        decode: { type: 'log10', lo: 0.05, hi: 30 /* manifest.encoding 수치 필드에서 읽는다 — 지금은 precip-field.js:37 · main.js:2012 하드코딩 */ } },
      category: { channel: 'G', interpolate: false,
        classes: [{ id: 'rain', v: 0 }, { id: 'freezing', v: 128, tol: 17 }, { id: 'snow', min: 184 }] },
      grid: { res: 0.5, ni: 720, nj: 361, cellKmEq: 55, meaning: 'cell-mean' } },
    { id: 'apcpNext3h', unit: 'mm', status: 'P1 — APCP 파서 뒤' },
    { id: 'apcpNext24h', unit: 'mm', status: 'P1' },
  ],
  scale: {
    type: 'stepped', unit: 'mm/h', breaks: [0.1, 0.5, 1, 2, 5, 10, 20, 50], discardBelow: 0.1,
    colors: ['#75BDF5', '#6BE0D1', '#73DB66', '#F2E652', '#F29433', '#E63D3D', '#E040C7', '#F28CF2'], // 초안 = 현 rainRamp 앵커 8색을 단색으로
    alpha:  [0.30, 0.42, 0.62, 0.78, 0.86, 0.90, 0.93, 0.95],   // 초안 — 아래 두 칸 옅게(wetGt01 15~17%)
    ramps: { snow: 'same breaks, cold ramp', freezing: '#B88CF2' },
    isolines: { values: [10, 20], style: 'shader-white-bold', labels: 'none', phase: 'P1' },
    coreLabels: { mode: 'local-max', minValue: 10, topN: 12, suffix: 'MODEL 격자 평균', phase: 'P1' },
    ceilingNote: { above: 30, ko: '30mm/h 이상은 구분 불가(인코딩 상한)' },
    altScales: { accumulation: { unit: 'mm', breaks: [1, 5, 10, 20, 50, 100, 200] } },
    shell: 'airShell',   // live-layers.js:1169-1172 — 1.0012 고정 금지
  },
  chips: ['now-rate(지금 시각 · 모델 강수율)', 'type(눈·비)', 'accum-next-3h(P1)', 'accum-next-24h(P1)', 'kr-obs-1h(P1 · 한국 AWS 실측)'],
  sources: [
    { id: 'gfs', badge: 'MODEL', org: 'NOAA NCEP GFS 0.5°', license: 'public domain (manifest 에 필드 추가)', times: ['run', 'valid', 'generatedAt'], manifest: 'clouds/gfs-fc/manifest.json' },
    { id: 'kma-aws-min', badge: 'OBS', org: '기상청 AWS 매분', file: 'wind/kma-aws-min.json', fields: ['rn15', 'rn60', 'rnday'], staleAfterMin: 30, region: 'KR', phase: 'P1' },
    { id: 'kma-radar', badge: 'OBS', org: '기상청 HSR 레이더', file: 'wind/kma-radar.json', frames: 13, stepMin: 5, onGlobe: false, region: 'KR' },
    { id: 'kma-fcst', badge: 'OFFICIAL_FORECAST', org: '기상청 동네예보', file: 'wind/kma-fcst.json', fields: ['pop', 'pcp', 'pty'], points: 97, region: 'KR' },
  ],
  frames: { store: 'gfs-fc(공용 — 01·02·04 와 공유)', steps: 41, stepHours: 3, range: ['run', 'run+120h'], between: 'linear-blend(표기)', beforeRun: 'disabled', prefetch: 'on-first-scrub', obsPast: { source: 'kma-radar', window: '-60min..0' } },
  inspector: {
    value: { sample: 'nearest-cell', precision: '2 sig. digits', zeroRule: '<0.05 → 0 · 0.05~0.1 → "0.1 미만" · >30 → "30 이상"', limitNote: 'MODEL 격자 평균 0.5°(약 55km 칸)', krObs: 'nearest kma-aws-min station + 거리' },
    series: { steps: 41, tier: 'EXPLORER' },
  },
  compare: { pairs: [
    { id: 'time-time', a: 'valid=now', b: 'valid=+24h', modes: ['split', 'wipe', 'diff'], available: true },
    { id: 'agency-model-kr', a: 'kma-fcst PCP·POP(97지점)', b: 'gfs prate(같은 valid)', modes: ['split', 'table'], diff: false, available: true },
    { id: 'obs-model-kr', a: 'kma-aws-min rn60', b: 'gfs apcp 1h', available: 'P1' },
    { id: 'run-run', a: 'latest run', b: 'previous run(같은 valid)', available: 'server S — 런 폴더 manifest 사본' },
    { id: 'model-model', a: 'GFS', b: 'ECMWF', available: false, reason: 'ECMWF 강수 격자 수집기 없음' },
  ], diffScale: [-10, -5, -2, -0.5, 0.5, 2, 5, 10], sharedScale: true },
  intel: { producer: null, // 신규 필요 — 5번째 생산자
    planned: { what: ['gfs prate', 'kma-aws-min rn60'], next: ['kma-fcst PCP·POP (OFFICIAL_FORECAST)'],
      probability: [{ kind: 'AGENCY_POP', issuer: 'KMA', region: 'KR 97지점' }],
      attribution: ['convective share CPRAT/PRATE', 'CAPE', 'official typhoon track distance', 'PRMSL low distance(GFS PRMSL 추가 뒤)'] },
    registryFlag: 'capabilities.intelligence 는 패킷이 나간 뒤에만 true' },
  simulation: { status: 'not_available', engineRef: null, entry: 'same-slot',
    snapshot: ['view', 'timeOffset', 'field', 'run', 'pointValue'],
    candidates: [{ id: 'runoff-depth', chips: ['×1', '×1.5', '×2'], needs: ['APCP', 'curve-number grid', 'DEM·hydrography', 'calibration', '§N'], lib: 'prototype/js/earthus2/v02/hydrology/runoff-routing.js' },
                 { id: 'cmip6-precip-change', chips: ['Current', '+2°C', '+4°C'], needs: ['CMIP6 data — 없음'] }] },
  tiers: { FREE: ['field+legend', 'point value now', 'provenance badge', 'timeline +24h', 'KR radar loop · AWS obs', '호우 특보'], EXPLORER: ['+120h', 'accumulation', '41-step series', 'intel', 'AWS 대조 리포트'], PRO: ['compare', 'export', 'rain-start alert', 'simulation'] },
}
```

</details>

#### 04 Clouds 구름

| 단계 | 지금 | 끝났을 때 사용자가 보고 하는 것 | 이 메뉴가 공급할 것 | 선행 | 요금 |
|---|---|---|---|---|---|
| **① 극적으로 보인다** | 🟡 그림 자체는 v2 에서 가장 완성돼 있다: 접속 250ms 뒤 GMGSI 관측 구름 자동 켜짐(main.js:6419-6435) · 운정고도 변위(관측 CTH 창 우선, 창 밖은 IR×11km 근사 = DERIVED, main.js:1178-1216) · 지표 그림자(2119-2127). 공개 파일 실… | 레일 '구름' 1탭 → 다른 현상의 색면이 걷히고 입체 구름만 남으며 3초 안에 범례·Inspector 가 구름 것으로 바뀐다(첫 줄 세그먼트 [Observation \| Forecast], 칩 [구름(위성)][운정고도][저·중·고층], Satellite quick mode 칩 [천리안 10분][동아시아 2km][수증기 6.3µm][밤 안개 후보]). [운정고도]를 켜면 흰 구름이 2km 구간 7단색(2 미만 · 2~4 · 4~6 · 6~8 · 8~10 · 10~12 · 12km 이상)으로 물들고 가장 높은 운정 몇 곳에 '12 km' 숫자 라벨이 선다 — KMA L2 관측 창(동아시아) 안만, 창 밖은 해칭 + 'IR 밝기 근사 · DERIVED'. [수증기]는 밝기온도 5°C 구간 8단(−25 … −60°C 이하, 갈색→청록)을 원본 8.35km 화소 그대로 bbox-UV 로 그리고, [밤 안개 후보]는 흰 구름을 지우지 않고 그 위에 호박색 2단을 겹친다. [저·중·고층]은 GFS 3층 비율 25·50·75·100% 3색(MODEL). '구름 끄기'와 불투명도·릴리프·3D 볼륨은 View > Appearance 로 간다.<br>⚠️ *말하면 안 되는 것:* 운정고도 색·숫자는 KMA L2 관측 창 안에서만 — 창 밖 IR 근사(DERIVED)에는 숫자를 달지 않는다. 브라우저가 받는 CTH 격자는 약 28km 표본이다 — '2km'라고 쓰지 않는다. 수증기 밝기온도를 '습도·수증기량'이라 부르지 않고, 원반 안의 알파 0 은 '−25°C 이상'이지 '자료 없음'이 아니며 −62°C 아래는 눈금 끝(포화)이다. 안개는 '후보 · 미보정 문턱',… | 필드 7종(obs.ir · obs.gk2a · obs.cth · obs.wv063 · obs.nightlow · fc.cwat/top · fc.layers)과 decode 식(수증기 BT = −25 − 37×A/255 °C · 안개 2단 = 알파 0.37 문턱 · GFS 구름수 = 10^(A/255×2.6021−2.3010) kg/m² · 운정 = 회색/255×16000 m) / 눈금 4벌(cth7 · wvBT8 · frac4×3색 · fog2) / 커버리지… | W1(구간색 셰이더 · field-scales.js · Legend) · W5(레일 · Inspector · View 분리) · W7(구름) · W0 확장의 l{step}.png(층별 1° RGB — 층별 칩에만) / 서버 변경 0: 수증기 · 안개(gk2a-clouds 는 대회 이후… | FREE |
| **② 정확한 값** | 🟡 지도 클릭 경로에 구름 분기가 없다: pointerup(main.js:2775-2844)은 extScene.pick → travel.pick → seafloor.pick → focus.pick(국가 선택) → marineSelect(바다 조회) 순이라 구름을 눌러도 나라가 골라지거나 해양 조회가 뜬다.… | 구름 위를 1회 클릭 → Inspector.ValueCard, 네트워크 호출 0건. Observation 이면 '운정고도 11.8 km — KMA GK2A L2 관측 · 약 28km 표본값'(창 밖이면 '운정고도 관측 없음 — IR 근사는 값으로 말하지 않음')과 '구름 신호 72% — GMGSI IR 합성 3×3 평균 · 표현 신호이지 구름량이 아님'. 수증기 칩이면 '밝기온도 −43°C · 6.3µm · 8.35km 화소'(눈금 끝이면 '−62°C 이하'). Forecast 면 '구름수 0.42 kg/m²(로그 64단계 · 한 눈금 약 10%) · 운정 9,300 m(DERIVED · 252m 눈금) · 저 80 / 중 40 / 고 10 %(l 프레임 이후) — GFS 0.5° 격자(약 55km) 평균 · 프레임 사이 보간 중'. 무료는 기본 위치값(구름 있음/없음 · 운정 구간)까지, 정확값 전부가 EXPLORER. '내 하늘'(mysky)은 같은 카드의 '내 위치' 버튼이 된다.<br>⚠️ *말하면 안 되는 것:* GMGSI '신호 %'는 구름량(할 · 옥타)도 광학두께도 아니다 — '구름량 %'라 쓰지 않는다. GFS 운정은 층별 비율에서 유도한 대표 고도(2,200 / 6,200 / 11,000 m 조합, aws/gfs-cloud-forecast/handler.py:178-189)라 관측 운정과 같은 말로 부르지 않는다. 8bit · 로그 눈금과 격자 평균에서 소수 둘째 자리 정밀은 나오지 않는다… | 모드별 sampler 4종과 각자의 정밀도 문구: GMGSI 알파 3×3(신호 %) · CTH 격자 최근접 조회(LO/LA/HM/V 배열, valid 만) · 수증기 알파 → °C(0.15°C 눈금) · GFS c/l 프레임 복호 / '관측 범위 밖 ≠ 구름 없음' 판정(sampleSkyAt:3306-3312 규칙 승계) / 클릭 우선순위 선언(구름 메뉴 활성 시 값 읽기가 국가 포커스 · 해양 조회보다 먼저) / '내 위치' 진입(기존 weather/mysk… | W5(Inspector · 클릭 라우팅을 현상 문맥으로) · W0(프레임 로더를 CloudManager 에서 분리 → sampler 공용화) · W1(ValueCard 의 격자 · 정밀도 문구 규칙) / 결정: 클릭 충돌 규칙(국가 선택 vs 값 읽기) — 9개 메뉴 공통으로 한 번만… | EXPLORER |
| **③ 출처** | 🟡 문구는 있다: GMGSI 라벨 '관측 실황 · NOAA GMGSI · {t}Z · DERIVED: IR→고도 근사'(main.js:1465-1467) · GK2A(:1517) · GFS 'MODEL GFS 0.50° T+h · 유효 시각 · 사이는 700hPa 바람으로 이류한 보간이며 모델 출력이 아닙… | 값 바로 아래 ProvenanceCard. 관측: 'OBS · NOAA NESDIS GMGSI · 관측 23:00Z(1시간 25분 전) · 다중위성 IR 합성 · 약 13km · ±72.7° 밖 자료 없음 · NOAA 공개 자료'. 예보: 'MODEL · NOAA GFS 0.5°(약 55km) · run 09-19 12Z · valid 09-21 00Z(+36h) · 프레임 사이는 700hPa 바람 이류 보간 — 모델 출력 아님 · 퍼블릭 도메인'. 운정고도: 'OBS(L2 산출) · 기상청 국가기상위성센터 GK2A CTH · 23:50Z · 약 28km 표본', VIIRS 폴백이면 '하루 한 장 · 낮 쪽만', GFS 를 못 받으면 '예보 구름 자료 없음(UNAVAILABLE)' — Open-Meteo 로 물러나지 않는다. OBS/MODEL 배지 · 기관 · 시각 한 줄은 무료에서도 항상 보이고, 펼친 카드(run/valid · 해상도 · 보간 · 양자화 · 라이선스)가 EXPLORER.<br>⚠️ *말하면 안 되는 것:* GFS '지금' 프레임을 '현재 구름'이라 부르지 않는다 — 공개 실측으로 12Z 런이 22:10Z 에 만들어졌고 00:25Z 에도 최신이었다(지금 = 약 +12h 예보). 관측 시각과 조회 시각을 섞지 않는다. 라이선스 문안이 확인되지 않은 자료(GK2A · KMA L2)는 확인 전까지 '출처'만 적고 '자유 이용'이라 쓰지 않는다. | 출처표 6행(GMGSI · GK2A 채널 4 · KMA L2 CTH · GFS · VIIRS 폴백)마다 기관 · 관측/모델 구분 · 시각 필드의 위치(clouds/meta.json time · gk2a/meta.json channels[ch].at · cth/manifest.json validAt · gfs-fc/manifest.json run · generatedAt · steps[].valid) · 해상도 · 커버리지 · 라이선스 · 파생 고지문(IR→고도… | W5(ProvenanceCard) · W0(매니페스트의 모델 · run · 해상도 · valid — 이미 실려 있음, 공개 실측 확인) / S 크기 선행 수리 3건: cloudBadgeFor 를 startsWith('gk2a') 로 · '10분 주기'를 meta 의 at 에서 · Op… | EXPLORER |
| **④ 시간축** | 🟡 이 메뉴가 앱에서 시간축에 가장 잘 물려 있다: 타임스트립 하나(ui-shell.js:1326-1383, −1440~+7200분 · 30분 눈금 · ▶) → onTimeOffset(main.js:4891-4899) → clouds.setForecastOffset(2021-2055, 프레임 2장 blen… | 시간축은 화면 아래 GlobalTimeline 하나뿐. '지금'은 위성 관측, ±1시간 밖 미래로 밀면 0.4초 교차 페이드로 GFS 예보 구름이 되고 Inspector 세그먼트가 Forecast 로, 배지가 'OBS · NOAA GMGSI · ○분 전' → 'MODEL · GFS 0.5° · run 12Z · +36h'로 바뀌며 토스트 1회('관측은 미래에 없습니다 — 예보 구름, 약 13km → 55km'). 타임라인 옆에 'GFS 12Z · 12 h ago' 상시. 수증기 · 안개 · 관측 운정고도 칩은 '지금'에서만 활성 — 시간을 옮기면 비활성 + 사유, 돌아오면 되살아난다. '지금' 왼쪽(과거)은 구름 메뉴에서 회색 구간 + '과거 위성 프레임은 아직 적재 전'. 무료 +24h, EXPLORER +120h.<br>⚠️ *말하면 안 되는 것:* 과거 구름을 관측처럼 재생할 수 없다(프레임이 없다) — 지난 GFS 런으로 과거를 채우더라도 그것은 MODEL 이지 '그때의 하늘'이 아니다. 프레임 사이 값은 우리 보간이지 모델 출력이 아니다. 수증기 · 안개 · 관측 운정고도에는 예보가 없다. +120h 너머는 말하지 않는다. | frames 선언 2벌: obs = 단일 시각(meta.time · 나이 · 늙음 문턱) / fc = gfs-fc manifest steps 41 · 3h · run · 프레임 사이 보간 방식(700hPa 이류, '모델 출력 아님' 고지) / 전환 규칙(offset 절댓값 1h 이상 → forecast, 복귀 시 이전 관측 모드 복원 — cloudBeforeScrub 승계) / 칩별 시간 가용성(now-only 목록과 사유문) / 프리페치 정책(만진 사람만 ·… | W0(프레임 로더 분리 — 지시서 W0 에 이미 명시 · runs.json 색인 · 3시간마다 같은 런 재생성 건너뛰기) · W5(타임라인 옆 run 표기 · Inspector 세그먼트) / Open-Meteo 폴백 제거(S) / 과거 위성 프레임은 archiver 적재가 선행(gk2… | FREE |
| **⑤ 비교** | ❌ 구름 비교 UI 0건: prototype/v2-three/js 의 compare\|wipe 검색 결과는 태풍 발표 회차 비교(main.js:4853-4855 feed-compare → intel-feed.js)와 시뮬 실행 비교(scenario-compare.js:37-73)뿐. 구조도 막혀 있다 —… | 상단 Compare → 지금 화면(카메라 · 시각 · 칩)을 그대로 들고 작업 공간으로. 기본 짝은 관측 ↔ 모델: 왼쪽 'OBS · GMGSI 23:00Z' \| 오른쪽 'MODEL · GFS run 09-19 00Z · +24h(valid 09-20 00Z)', draggable wipe, 오른쪽 리드타임 칩 [+6h][+12h][+24h][+48h] — '어제의 예보가 오늘 하늘을 얼마나 맞혔나'가 10초 안에 보인다. 둘째 탭 런 ↔ 런: 같은 valid(예: 내일 09시)를 최신 런 \| 직전 런으로, split / wipe / diff(Δ구름수 발산 5단) — '예보가 회차마다 얼마나 흔들리나'. 각 패널 머리에 run · 해상도 · valid, 범례 · 카메라 · 시간 동기, URL 공유. GFS \| ECMWF 칩은 같은 자리에 비활성 + 사유('ECMWF 격자 수집기 없음').<br>⚠️ *말하면 안 되는 것:* GFS \| ECMWF 구름 비교는 지금 팔지 않는다(자료 없음). 관측(IR 밝기 신호)과 모델(구름수 kg/m²)은 물리량이 달라 차이를 숫자로 말하지 않는다 — 나란히 놓기만 한다. 런 간 차이를 '확률' · '신뢰도 %'로 부르지 않는다 — 앙상블이 아니다. 관측 쪽은 '지금' 한 장뿐이라 obs-vs-model 은 valid = 지금에서만 성립한다. | 비교 짝 선언 3: obs-vs-model(모드 split · wipe 만, diff 금지 사유) · run-vs-run(split · wipe · diff) · model-vs-model(unavailable + 사유) / valid 고정 → (run, step) 역산 함수(3h 격자 · 6h 런 주기) / 런 URL 규칙 '{run_tag}/c{step}.png' + runs.json / diff 눈금(Δ구름수 −0.5 · −0.1 · +0.1 · +0.5… | W8(Compare workspace) · W0(runs.json — 최근 N런의 run · steps · missing, S) · W7(CloudShell 인스턴스화) / 확인: 지난 런 폴더의 S3 보존 기간(UNKNOWN — 09-10 것까지 남아 있음만 실측) / 3순위 선행:… | PRO |
| **⑥ Intelligence** | ❌ 레지스트리는 weather.cloud 에 intelligence:true 를 선언하지만(phenomenon-registry.js:659) intelHostFor(main.js:4098-4112)는 태풍 · 지진 · ocean.sst · weather.temperature_anomaly 넷만 돌려주고 구… | 클릭한 지점에서 Inspector 'Intelligence': ① 수치 '운정고도 12.4 km · 구름 신호 88% · (예보) 구름수 0.9 kg/m²' → ② 출처 'KMA GK2A L2 23:50Z(OBS) · NOAA GMGSI 23:00Z(OBS) · GFS run 12Z(MODEL)' → ③ 그 아래 문장. 원인 문장 예: '이 구름은 대기 불안정으로 솟은 깊은 대류운입니다 — 운정 12.4 km(관측)와 같은 칸의 CAPE 2,100 J/kg · 대류강수 4 mm/h(GFS)가 함께 있고, 불안정한 공기가 솟아 찬 운정을 만드는 기작(문헌 인용)이 붙습니다 · 근거 강도 보통(조건의 절반이 모델값)' / '태풍 ○○ 중심에서 320 km 안의 구름 — 계산된 연결(JMA 분석 위치와의 거리)'. 확률 문장 예: '내일 09시 이 지점이 구름에 덮일 확률 70% — GFS 가 +24h 에 구름을 예보했을 때 실제 GMGSI 에 구름이 관측된 비율(최근 30일 · 이 위도대 · n 표기 · VERIFIED_MODEL)'. 탭 Now / Forecast / Analysis(Climatology 는 구름 평년 자료가 없어 비활성 + 사유).<br>⚠️ *말하면 안 되는 것:* 지금은 구름에 대해 원인도 확률도 말할 수 없다 — 생산자도 채점표도 없다. 채점표가 생기기 전 % 금지: 런 간 일치율이나 구름수 크기를 확률로 환산하지 않는다. '깊은 대류운' 분류는 관측 CTH 창 안 + 조건값이 패킷에 실릴 때만, 창 밖(IR 근사)에서는 말하지 않는다. '비가 온다 · 갠다'는 단정 금지(03 Rain 소관). 안개 후보 · 수증기에는 인텔 문장을 붙이지 않는다(… | 패킷 생산자 신설(구름은 지금 0개): WHAT(운정 · 신호 · 구름수 · 층별) · attribution 규칙 3(① 깊은 대류: 관측 CTH 10 km 이상 ∧ CAPE 1,000 이상 ∧ 대류강수 있음 ② 태풍 연관: 활동 중 TC 중심 거리 ③ 기압골 · 전선대: PRMSL — W0 뒤) · NEXT(같은 칸 GFS +24/+48h 구름수) · probability(source VERIFIED_MODEL = 채점표) · EVIDENCE / 채점 Lam… | W9(attribution · probability 절, 가드 개정 — 지금은 intel-strip.js:9 와 narration_guard 가 원인 표현을 막는다) · W5 / 신규 M: 구름 채점 Lambda(입력 둘 다 확보 — 지난 런 폴더는 S3 에 남아 있고(실측) GMGS… | EXPLORER |
| **⑦ Simulation** | ❌ 입구 자체가 없다: SIM_CAPABILITIES(sim-questions.js:40-352)에 weather.cloud · weather.fog · weather.upper_moisture 항목이 없고(cloud\|fog\|moisture 검색 0건), 레지스트리 simulation:false(phe… | Inspector 맨 아래 'Simulation 으로'(다른 8개 메뉴와 같은 자리) → 지금 상태(카메라 · 시각 · 칩 · 클릭 지점 · 관측 시각 · GFS run)를 스냅샷으로 저장하고 작업 공간으로. Current(지금 위성 구름과 고른 구름 덩어리) → Baseline(GFS 가 말하는 +3h · +6h 구름) → Scenario 칩 [그대로 흘러간다면 · 700hPa 바람] (+ 비활성 칩 [+2°C 기후] — 사유 '구름 기후 시나리오 자료 없음') → Result: 옮겨진 구름 윤곽의 +1 · +2 · +3 · +6h 위치와 '내 위치에 닿는 시각(폭 포함)', Baseline 과 나란히 + 어긋남. 다음 GMGSI 관측이 오면 '맞혔나'가 기록에 붙는다. 엔진을 잇기 전에는 같은 자리에 입구 + '구름 이동 계산은 아직 화면 자료와 연결되지 않았습니다 — 점 이류 엔진은 있으나 기록 남는 실행과 채점이 없습니다'.<br>⚠️ *말하면 안 되는 것:* 이류만 한다 — 구름이 생기고 사라지는 것은 계산하지 않는다. 700hPa 한 고도 · 4° 평균 바람이라 상층운 · 하층운은 다르게 움직인다. +6h 너머는 말하지 않고, 예보가 아니며 GFS 예보를 대신하지 않는다. 채점 전에는 SIMULATION 배지를 달지 않는다(limited · 장면 계산). 기후 시나리오(+2°C 구름)는 자료가 없어 입구 + 사유만. | SIM_CAPABILITIES['weather.cloud'] 신설(menu · engine · engineRef = 실제 파일 · status not_available → limited → available · 질문 2: '이 구름은 어디로 흘러갈까?' · '내 위치에 언제 닿을까?' · 사유문) / vectorSampler(w{step}.png CPU 사본 → east · north m/s) + vectorProof(kind WIND_VECTOR · sour… | W10(작업 공간 · RunRecord) · W0(공용 프레임 저장소 — 바람 텍스처 CPU 사본) / 계약: 브라우저 장면 계산은 simulation_run 대상이 아니다(sim-questions.js:9-11) → available 이 되려면 서버 실행 + 채점, 그 전에는 lim… | PRO |

- **⑤ 비교 짝:** 1순위 — 관측 ↔ 모델 (지금 자료로 됨): 지금의 GMGSI 관측 \| 같은 valid 를 겨냥한 지난 GFS 런의 +6 / +12 / +24 / +48h 프레임.<br> 이유: 구름에서는 '모델끼리'보다 '예보가 실제 하늘을 맞혔나'가 가장 정직하고 10초 안에 읽히는 비교이고, 두 자료가 모두 이미 S3 에 있다 — 핸들러가 런별 폴더에 쓰고(aws/gfs-cloud-forecast/handler.py:368-377) 공개 실측으로 2026-09-10 런까지 c024.png 가 200 이다.<br> 되는 것: split · wipe · 리드타임 칩. 안 되는 것: diff 숫자(IR 밝기 신호 vs 구름수 kg/m² — 물리량이 다르다) · valid ≠ 지금(관측은 한 장뿐, 과거 프레임 없음).<br>2순위 — 런 ↔ 런 (지금 자료로 됨, runs.json 한 장만 추가): 같은 valid 를 최신 런 \| 직전 런. 같은 물리량이라 diff(Δ구름수) 가능. '회차마다 얼마나 흔들리나'를 보여 주되 확률이라 부르지 않는다.<br> 안 되는 것: manifest.json 이 최신 런만 가리켜(:429) 지난 런이 41장 완비인지 지금은 알 수 없다 · S3 보존 기간 UNKNOWN.<br>3순위 — 모델 ↔ 모델 GFS \| ECMWF: 자료 없음. ECMWF 격자 수집기(L · eccodes)가 선행. 입구는 같은 자리에 비활성 + 사유.<br>성립하지 않는 짝: 기관 ↔ 기관(구름에는 기관 발표 짝이 없다) · 관측 운정(KMA L2) ↔ GFS 운정(GFS 쪽이 대표 고도 3개의 조합이라 차이가 자료의 조잡함만 보여 준다 — 팔지 않는다).<br>부수: 위성 채널 나란히(적외 \| 수증기)는 같은 시각 · 같은 위성이라 정직하게 성립한다 — 무료 quick mode 의 덤으로 둘 수 있다.
- **⑦ 시나리오:** 후보 = '구름 이동 가정(수동 이류)': 지금의 관측 구름이 700hPa 바람을 타고 그대로 흘러간다면 +1~+6h 에 어디에 있나 / 내 위치에 언제 닿나.<br>있는 엔진 우선: prototype/js/earthus2/v11/environment/transport-simulator.js 의 advectPoint(구면 위경도 · cos 위도 · RK2 중점 · vectorProof 필수 · MODELLED_TRANSPORT 라벨)를 쓴다. v02/weather/nowcast.js advectScalarField 는 정규화 좌표라 위도 보정 · 날짜변경선 랩이 없어 전지구 격자에 그대로는 못 쓴다(동아시아 상자 한정이면 근사 가능) — 지시서가 flow.js advectNormalized 를 재사용 불가로 본 것과 같은 결함이다.<br>입력은 전부 이미 있다: GMGSI 관측 구름(clouds/global.png) + GFS 700hPa 바람 w{step}.png(4° 평균, handler.py:293-320).<br>이 메뉴에 맞는 이유: 다음 GMGSI 관측이 1시간 안팎에 오므로 채점이 빠르고 공개적이다 — 맞히면 남기고 못 맞히면 내린다(lab-events 선례).<br>가용성: 지금 not_available(SIM_CAPABILITIES 에 구름 항목 자체가 없다 → 신설해 같은 자리에 입구 + 사유) → 브라우저에 이으면 limited(장면 계산 · 기록 없음, sim-questions.js:9-11 규약) → 서버 실행 + SimulationRunRecord + 채점 뒤 available.<br>없는 것: 구름 생성 · 소멸 물리, 다층 바람(700hPa 하나뿐), 기후 시나리오(+2°C 구름 — CMIP6 자료 없음, 입구 + 사유만). services/research-runtime(해양 표층 입자 2종) · aws/tsunami-eta 는 구름과 무관하다.
- **첫 단면(7단계를 전부 관통하는 가장 얇은 출시):** '관측 구름 한 장 + GFS 예보 + 클릭 한 번'으로 7단계를 관통한다.<br>넣는 것<br>(1) 레일 '구름' 진입 + 지금의 입체 구름 그대로 + [Observation \| Forecast] 세그먼트 + 범례 1벌(운정고도 7단 — CTH 텍스처가 이미 셰이더에 올라가 있어 구간색 물들임만 추가) + 'cloud-off' 줄 삭제.<br>(2) 클릭 → ValueCard: 이미 있는 sampleSkyAt(신호 %) · clouds.sampleAt(GFS 구름수 · 운정)에 CTH 최근접 조회 하나만 추가. 네트워크 0건.<br>(3) ProvenanceCard: 이미 받는 meta.json · manifest 필드로 채움 + S 수리 3건(cloudBadgeFor 를 startsWith 로 · '10분 주기' 하드코딩 제거 · Open-Meteo 폴백 → UNAVAILABLE 와 ui-shell.js:77 문구).<br>(4) 기존 타임스트립 그대로 + 전환 토스트 1회 + 'GFS 12Z · ○h ago' 표기 + 과거 구간 비활성 사유.<br>(5) Compare 입구 + 관측 ↔ 모델 wipe 한 짝만(지난 런 URL 은 규칙으로 계산, valid = 지금, 리드타임 +24h 고정). 두 번째 지구를 만들지 않고 한 메시 안에서 화면 x 로 A/B 텍스처를 가르는 wipe 가 가장 얇다(검증 필요). W8 전이면 입구 + 사유('비교 작업 공간 준비 전 — 자료는 이미 있음').<br>(6) Intelligence 입구 + 수치 · 출처 카드까지. 문장 자리에는 '구름에는 아직 원인 · 확률의 근거가 패킷에 없습니다 — 예보 채점표를 만드는 중'이라는 사유 한 줄.<br>(7) SIM_CAPABILITIES['weather.cloud'] 를 not_available 로 신설 → 같은 자리에 입구 + 사유, 스냅샷 저장은 동작.<br>미루는 것: 수증기 밝기온도 구간색과 bbox-UV 직접 매핑 · 안개 호박색 겹침 · 층별 l{step}.png · 런 ↔ 런 diff 와 runs.json · 구름 채점 Lambda 와 attribution/probability 패킷 · 이류 시나리오 엔진 연결 · 과거 위성 프레임 · ECMWF · TPW(03 Rain — PD 결정 뒤).
- 비고: 1. [재료와의 충돌 — PD 확인 필요] 재료의 '메뉴 1탭 = 구름 켜짐/꺼짐 토글'은 7단계 문법 (1)과 부딪힌다: 구름은 기본으로 켜져 있어(main.js:6427-6435) 첫 탭이 '끄기'가 된다. 권고 — 레일 탭은 '진입'(구름이 주인공이 되고 범례 · Inspector 가 바뀜), 끄기는 View > Appearance 의 '배경 구름'. 레지스트리도 cloud-off 를 role control · status demote 로 적어 두었다(phenomenon-registry.js:919). 'cloud-off 줄 삭제'는 어느 쪽이든 같다.<br>2. [재료 정정] '운정고도 2km 칸'은 실측과 다르다 — 브라우저가 받는 grid.json 은 215×186 · stride 14(약 28km, main.js:1574 주석 · 공개 manifest). 2km 로 그리려면 CTH 생산자가 촘촘한 격자(또는 PNG)를 따로 내야 하고, 그 전에 KMA 허브 용량 공유 함정을 점검해야 한다.<br>3. [재료 정정 권고] 재료의 paidHook 'EXPLORER: 운정고도 · 층별 칩'은 같은 묶음 수증기의 반박 검증 결론('현재 시각화를 잠그지 않는다')과 어긋난다. 현재 그림은 모든 칩이 무료, 정확값 · +120h · 리포트 · 인텔이 EXPLORER 로 통일할 것을 권고(PD 확인).<br>4. [새 실측] 지난 GFS 런 폴더가 S3 에 남아 있다(2026-09-10 런까지 c024.png 200). Compare 1 · 2순위와 Intelligence 채점의 재료가 이미 쌓이고 있다는 뜻 — 다만 보존 기간과 저장 비용은 UNKNOWN(수명주기 규칙 확인 필요).<br>5. [버그] cloudBadgeFor(main.js:3794-3800)가 'gk2a:*' 모드를 몰라 수증기 · 안개 · 동아시아 2km 에서 NOW 카드 배지가 UNAVAILABLE 로 나온다 — 관측을 '자료 없음'이라 말하는 셈이다.<br>6. [시간축] 과거 쪽(−24h)에서 구름은 런의 f000 으로 잘린다(main.js:1871). 라벨은 유효시각을 말하지만 슬라이더 위치와 어긋난다 — 구름 메뉴에서는 과거 구간을 비활성으로.<br>7. [레지스트리 불일치] weather.cloud intelligence:true 인데 생산자 0 · 띠 0. W9 전까지 능력 표를 내리거나 사유를 띄워야 '빈 약속'이 아니다.<br>8. weather/cloud-gfs 는 레지스트리에서 weather.precipitation 의 data_product 다(:916). 04 Clouds 의 Forecast 세그먼트가 같은 'gfs' 모드를 쓰게 되므로, Forecast 모드의 비 · 눈 색면과 번개 표식(main.js:2043-2046)은 03 Rain 쪽 토글로 넘기고 구름 메뉴에서는 구름만 그린다(id 는 그대로).<br>9. 수증기 PNG 는 −25°C 이상이 알파 0, −62°C 이하가 255 로 포화한다(aws/gk2a-clouds/handler.py:110-112, 591, 618 · 공개 meta 의 실제 범위 −83.3 ~ −14.1°C). 범례 양 끝을 열어 두고, 원반 안 알파 0 을 '자료 없음'으로 칠하지 않도록 원반 판정을 기하로 따로 한다. 안개 2단 문턱 0.37 은 ((3−1.5)/4.5)^0.9 로 확인(handler.py:159, 578).<br>10. TPW 는 이 메뉴가 아니라 03 Rain 보조 칩 권고(재료 그대로) — PD 결정 필요. fog · upper_moisture 는 04 Clouds 의 Satellite quick mode 칩으로 MERGE, 현상 id · 레이어 id 는 그대로.<br>11. (6)의 원인 · 확률 문장 예는 지금의 렌더러 계약(intel-strip.js:9 '원인이라고 쓰지 않는다')과 어긋난다 — 지시서 W9 의 가드 개정('패킷에 근거가 실려 있으면 통과')이 선행돼야 화면에 나갈 수 있다.<br>12. 자문(advisor) 도구는 호출 한도로 응답하지 않았다 — 이 매트릭스는 코드와 공개 파일 실측만으로 작성했고 2차 검토를 거치지 않았다.<br>관련 파일(절대 경로): D:\## APP\EARTHUS v2_APP\prototype\v2-three\js\main.js · D:\## APP\EARTHUS v2_APP\prototype\v2-three\js\ui-shell.js · D:\## APP\EARTHUS v2_APP\prototype\v2-three\js\phenomenon-registry.js · D:\## APP\EARTHUS v2_APP\prototype\v2-three\js\sim-questions.js · D:\## APP\EARTHUS v2_APP\prototype\v2-three\js\intel-strip.js · D:\## APP\EARTHUS v2_APP\aws\gfs-cloud-forecast\handler.py · D:\## APP\EARTHUS v2_APP\aws\gk2a-clouds\handler.py · D:\## APP\EARTHUS v2_APP\aws\gmgsi-clouds\handler.py · D:\## APP\EARTHUS v2_APP\prototype\js\earthus2\v11\environment\transport-simulator.js · D:\## APP\EARTHUS v2_APP\prototype\js\earthus2\v02\weather\nowcast.js · D:\## APP\EARTHUS v2_APP\docs\earthus-v2\PAID-UX-REDESIGN-2026-09-20\DEV-DIRECTIVE.md

<details><summary>descriptor 초안</summary>

```js
// PhenomenonDescriptor 초안 — 04 Clouds (공용 부품이 읽는 설정. 레이어 id 는 개명하지 않는다)
{
  id: 'clouds', rail: 4, label: { ko: '구름', en: 'Clouds' },
  phenomena: ['weather.cloud', 'weather.fog', 'weather.upper_moisture'],   // fog · upper_moisture = MERGE(칩)
  layerIds: {
    data: ['weather/cloud-obs', 'weather/cloud-gk2a', 'weather/cloud-ea', 'weather/cloud-wv', 'weather/cloud-fog', 'weather/cloud-gfs'],
    toInspector: ['weather/mysky'],                                  // '내 위치' 버튼
    toViewAppearance: ['weather/cloud-off', 'weather/cloud-vol'],    // + 불투명도 · 릴리프
  },
  renderer: 'CloudShell',   // FieldRenderer 계약(값 텍스처 → decode → scale → 2프레임 blend)의 구름 전용 구현
  segment: { options: ['observation', 'forecast'], auto: 'timeOffset 절댓값 1h 이상 → forecast, 복귀 시 이전 관측 모드' },
  chips: [
    { id: 'sat',    field: 'obs.ir',    default: true },
    { id: 'cth',    field: 'obs.cth',   scale: 'cth7',  nowOnly: true, outsideWindow: '해칭 + "IR 밝기 근사 · DERIVED"' },
    { id: 'layers', field: 'fc.layers', scale: 'frac4', status: 'PLANNED (W0: l{step}.png)' },
  ],
  satelliteQuick: { exclusive: ['gk2a', 'gk2a:ir112ea', 'gk2a:wv063'], overlay: ['gk2a:nightlow'] },
  fields: {
    'obs.ir':       { url: 'clouds/global.png', time: 'clouds/meta.json#time', kind: 'OBS', agency: 'NOAA NESDIS GMGSI',
                      grid: '3072x1844 ≈ 13 km', coverageLat: [-72.74, 72.72], value: null /* 표현 신호 — 물리량 아님 */,
                      sampler: 'alpha3x3 → 신호 %', staleAfterH: 3, fallback: 'VIIRS (하루 한 장 · 낮 쪽만)' },
    'obs.cth':      { url: 'clouds/gk2a/cth/grid.json', time: 'cth/manifest.json#validAt', kind: 'OBS_L2', agency: 'KMA NMSC GK2A',
                      units: 'm', grid: '215x186 · stride 14 ≈ 28 km', window: 'EA', sampler: 'nearest (valid 만)' },
    'obs.wv063':    { url: 'clouds/gk2a/wv063.png', time: 'gk2a/meta.json#channels.wv063.at', kind: 'OBS', units: '°C (밝기온도)',
                      decode: 'BT = -25 - 37 * A/255', ends: ['A=0 → -25 이상', 'A=255 → -62 이하 (포화)'],
                      grid: '1600² ≈ 8.35 km', mapping: 'bbox-UV 직접', scale: 'wvBT8', nowOnly: true },
    'obs.nightlow': { url: 'clouds/gk2a/nightlow.png', kind: 'OBS_DERIVED', decode: 'A 0.37 이상 → 짙음 (BTD ≈ 3 K)', scale: 'fog2',
                      overlay: true, nightOnly: true, nowOnly: true,
                      label: '낮은 구름·안개 후보 — 지상 관측과 대조 전 · 미보정 문턱' },
    'fc.cwat':      { url: 'clouds/gfs-fc/{run}/c{step}.png#A', kind: 'MODEL', model: 'NOAA GFS 0.5°', units: 'kg/m²',
                      decode: '10^(A/255*2.6021 - 2.3010)', quant: 'log 64단계', grid: '720x361 ≈ 55 km' },
    'fc.top':       { url: '…/c{step}.png#gray', units: 'm', decode: 'g/255*16000', derived: true, quant: '252 m' },
    'fc.layers':    { url: 'clouds/gfs-fc/{run}/l{step}.png', units: '%', channels: { R: 'low', G: 'mid', B: 'high' }, grid: '1°', status: 'PLANNED' },
    'fc.wind700':   { url: '…/w{step}.png', units: 'm/s', decode: 'v = c/255*128 - 64', grid: '4°',
                      use: ['프레임 사이 이류 보간', 'Simulation vectorSampler'] },
  },
  scales: {   // field-scales.js 한 곳에서 셰이더 · 범례가 같이 읽는다
    cth7:  { bounds: [2, 4, 6, 8, 10, 12], units: 'km', contour: false, labels: '운정 극대점, 앞 반구 12개 이하' },
    wvBT8: { bounds: [-30, -35, -40, -45, -50, -55, -60], units: '°C', palette: 'brown → teal', openEnds: true, contour: false },
    frac4: { bounds: [25, 50, 75], units: '%', palettes: ['low', 'mid', 'high'] },
    fog2:  { classes: ['옅음', '짙음'], palette: 'amber-2', note: 'BTD 1.5~3 / 3~6 K · 미보정 문턱' },
  },
  sources: [
    { id: 'GMGSI', agency: 'NOAA NESDIS', kind: 'OBS', license: 'NOAA 공개(퍼블릭 도메인)' },
    { id: 'GK2A',  agency: '기상청 국가기상위성센터', kind: 'OBS', license: 'UNKNOWN — 착수 전 확인' },
    { id: 'KMA_L2_CTH', agency: '기상청 (API 허브)', kind: 'OBS_L2', license: 'UNKNOWN — 착수 전 확인', quotaTrap: 'KMA 허브 키 공유' },
    { id: 'GFS',   agency: 'NOAA NCEP', kind: 'MODEL', license: '퍼블릭 도메인' },
    { id: 'VIIRS', agency: 'NASA GIBS', kind: 'OBS', role: 'fallback' },
  ],   // Open-Meteo 없음 — 폴백도 금지, 못 받으면 UNAVAILABLE
  frames: {
    observation: { kind: 'single', time: 'meta.time', past: 'UNAVAILABLE (프레임 미적재)' },
    forecast:    { manifest: 'clouds/gfs-fc/manifest.json', steps: 41, stepH: 3, maxH: 120, run: 'manifest.run',
                   between: '700hPa 이류 보간 — 모델 출력 아님', prefetch: 'on-touch', onMissing: 'UNAVAILABLE' },
    tiers: { FREE: '+24h', EXPLORER: '+120h' },
  },
  compare: {
    pairs: [
      { id: 'obs-vs-model', a: 'obs.ir@now', b: 'fc.cwat@(run = now - lead, step = lead)', leads: [6, 12, 24, 48],
        modes: ['split', 'wipe'], diff: false, why: '물리량이 다르다' },
      { id: 'run-vs-run', a: 'fc.cwat@latest', b: 'fc.cwat@previous', sameValid: true,
        modes: ['split', 'wipe', 'diff'], diffBounds: [-0.5, -0.1, 0.1, 0.5], needs: 'runs.json' },
      { id: 'gfs-vs-ecmwf', available: false, reason: 'ECMWF 격자 수집기 없음' },
    ],
  },
  intel: {
    producer: null,   // 신설 필요 — 지금 구름 패킷 생산자 0
    packet: 'intel v1 + attribution[] + probability[]',
    rules: ['deep-convection (관측 CTH · CAPE · 대류강수)', 'tc-colocation (TC 중심 거리)', 'trough (PRMSL — W0 뒤)'],
    probability: { source: 'VERIFIED_MODEL', scorer: 'GFS 지난 런 c 프레임 ↔ noaa-gmgsi-pds', status: 'MISSING' },
    excluded: ['weather.fog', 'weather.upper_moisture'],
  },
  simulation: {
    capabilityKey: 'weather.cloud', status: 'not_available',
    engineRef: 'prototype/js/earthus2/v11/environment/transport-simulator.js',
    scenarios: [
      { id: 'drift-700', ko: '그대로 흘러간다면 (700hPa 바람)', horizonH: 6 },
      { id: 'climate-plus2', available: false, reason: '구름 기후 시나리오 자료 없음' },
    ],
    limits: ['이류만 — 생성·소멸 없음', '700hPa 한 고도 · 4°', '6h 이하', '예보 아님'],
    scoring: '다음 GMGSI 관측과 대조',
  },
  tiers: {
    FREE:     ['현재 구름(모든 칩의 현재 그림)', 'Observation | Forecast 구분', '+24h', '배지·기관·시각 한 줄', '기본 위치값'],
    EXPLORER: ['정확값 전부', 'ProvenanceCard 펼침', '+120h', '내 하늘 리포트', 'Intelligence'],
    PRO:      ['Compare', 'Simulation', 'export', '과거 위성 프레임 (적재 후)'],
  },
}
```

</details>

#### 05 Ocean 해양

| 단계 | 지금 | 끝났을 때 사용자가 보고 하는 것 | 이 메뉴가 공급할 것 | 선행 | 요금 |
|---|---|---|---|---|---|
| **① 극적으로 보인다** | 🟡 1탭에 자료는 뜨지만 PD가 싫어하는 두 문법(뭉갠 그라데이션·막대)으로만 뜬다. 색면 3종은 같은 buildField: live-layers.js:573-574,592(sstfield·wavefield·sstanom) → :1072-1121 — rampFrom 선형 보간(:2931-2944, SST_… | Ocean 레일 1탭 → 3초 안에 SST 탭이 기본으로 뜬다: 전지구가 PD 정본 10단(<0·0~4·4~8·8~12·12~16·16~20·20~24·24~28·28~32·≥32°C) 구간색으로 끊겨 쿠로시오·멕시코 만류 경계가 색 경계로 서고, 4°C 간격 흰 등온선과 지구 위 숫자 라벨('20°C'·'24°C', 최대 24개)이 붙으며, 어떤 줌·과장에서도 육지 위에 수온 색이 없다. 그 위로 해류 입자(속도 구간색 m/s·kn)가 흐른다 — 해류 u/v 자료가 붙기 전에는 '비활성 토글'이 아니라 토글 자체를 두지 않는다. 같은 렌더러에 구간표만 바꿔 SSTA 탭(±0.5°C 비움, +2°C 굵은 선+'+2°C' 라벨), Waves 칩(구간색+3m·5m 기준선+파면 glyph), Ice 칩(남색~흰색 5단+오늘 15% 선/1981–2010 중앙값 선, 카메라 극 이동), Show Stations(흰 테두리 원+실측 숫자)가 선다. 좌하단 Legend 에 구간·단위·자료일·'관측 분석장 — 예보 아님' 배지가 상시 보이고, 움직이지 않는 막대 기호는 화면에 하나도 없다.<br>⚠️ *말하면 안 되는 것:* 5° Open-Meteo 파고·해류를 유료 핵심 그림으로 세우지 않는다. 입자가 그리는 디테일은 자료 해상도(0.5°≈55km)까지라고 범례에 적는다 — 해류 입자는 D-3 분석장의 시각화이지 '지금'도 '이동 예측'도 아니다. 쌍선형 값의 등온선은 칸 경계에서 꺾인다('어느 줌에서도 매끈'이라 약속하지 않는다). 3m·5m 선은 모델 기준선이지 특보가 아니다. OISST 에 'HD' 표기… | ① 필드: sst(°C)·ssta(±°C)·hs/mwd/mwp(+swell h/dir/per)·current u/v(m/s)·ice conc(%)·stations(kmasea/buoys/argo). ② 눈금: SST 10단(PD 정본) · SSTA ≤−3/−3~−2/−2~−1/−1~−0.5/[비움]/+0.5~+1/+1~+2/+2~+3/≥+3(PD 확인) · 파고 <0.5/0.5~1/1~2/2~3/3~4/4~5/5~7/7~10/≥10m(PD 확인) · 해류 <0… | W1 FieldRenderer(마스크·결측 채널 포함) → W2 기온 구간화 셰이더 → W6. Currents: W3 입자 엔진 + 신규 해류 수집기(NOAA CoastWatch ERDDAP — 상업 이용 서면 확인 선행, 막히면 RTOFS). Waves: 신규 파랑 수집기 2종(EC… | FREE |
| **② 정확한 값** | 🟡 클릭 분기 main.js:2793-2843 은 extScene.pick(:2799) → travel.pick(:2807) → seafloor.pick(:2821) → focus.pick(:2831) → 그 외 바다면 marineSelect(:2842). LiveLayers 에는 pick 이 없어 관측… | 바다를 한 번 클릭하면 우측 Inspector.ValueCard 에 지금 켜진 모드의 값이 뜬다 — SST: '23.4 °C · 가장 가까운 OISST 원격자 칸 값 · 칸 약 55km · 격자 분석값(지점 실측 아님)', SSTA: '편차 +2.3 °C · 오늘 수온 25.7 · 평년값 23.4(1991–2020)'를 한 카드에, Currents: '0.82 m/s(1.6 kn) · NE 48°', Waves: 유의파고·평균파향·주기(+GFS-Wave 뒤 너울 높이/주기/방향 별도), Ice: 농도 구간·'25km 격자값'. 값은 값 텍스처의 CPU 사본에서 최근접 칸을 읽어 네트워크 호출 0건이고 보간값을 말하지 않는다. 육지·결측 칸이면 '이 칸에 자료 없음'(이웃 칸으로 바꿔 읽지 않는다). Show Stations 마커는 '바다 지점 선택'보다 먼저 잡혀(화면 px 임계) 지점명·kind·실측 전 항목·관측 시각(KST)을 낸다. 무료는 기본 칸 값 1개와 배지, EXPLORER 부터 소수 정밀도·편차·평년값·지점 전 항목.<br>⚠️ *말하면 안 되는 것:* 격자 분석값을 지점 실측처럼 말하지 않는다(칸 크기 병기). 보간값을 '정확값'이라 하지 않는다. 0.25~0.5° 파랑 격자는 방파제·만 안쪽을 못 본다 — '앞바다 격자값 · 항 안쪽 아님'. 기압·바람이 어느 종류 지점에 비는지는 런타임 미확인(UNKNOWN) — 빈 항목은 0 이 아니라 '—'. 바다 안전과 직결된 부이 실측(파고·수온)은 요금과 무관하게 무료로 둔다. | 필드별 {key, unit, decimals, precisionNote}: sst °C 0.1 '원격자 칸 값·칸 크기' / ssta ±°C 0.1 + baseline(평년값) / current m/s 0.01 + kn + 16방위·도 / hs m 0.1 · mwp s · mwd °(진행 방향으로 수집기에서 고정) / ice % 구간 / station: kma-ocean 이 실제로 내는 것만(wh·tw·ta·pa·hm·wd/ws/gust·kind·tm, 부이만… | W5 Right Inspector · W1 값 텍스처 CPU 사본(main.js sampleAt 문법 — DEV-DIRECTIVE.md:55 인용, 미열람) · W6 pick 신설(main.js:2799-2831 분기 앞에 관측 마커). 첫 단면은 기존 ocean/sst-global.… | EXPLORER |
| **③ 출처** | 🟡 출처·시각은 레이어를 켤 때 나오는 카드 문장(cardHtml)에만 있다: metaSst live-layers.js:1717-1727(d.source·관측일 d.observed·sampling·'예보가 아닙니다', badge OBSERVED), metaSstAnom :1703-1715(평년 기간·관측일… | ValueCard 바로 아래 ProvenanceCard 가 같은 클릭으로 뜬다. SST: [관측 분석장 · 예보 아님] 배지 + 'NOAA OISST v2.1 · 관측일 09-18(오늘이 아님 — 수집기가 최대 8일 뒤로 물러난다) · 수집 시각 · 원격자 0.25° → 표시 0.5° 표본(보간 없음) · NOAA public domain', SSTA 는 '+ 평년 NOAA PSL ltm 1991–2020 · 같은 칸끼리 뺌'. Currents: '위성 고도계 지형류 분석 · 자료일 D-3 · 크레딧 NOAA·Copernicus Sentinel·AVISO+ · 해류≠조류, 연안·바람 직접 성분 없음'. Waves: 모델명 · run 00Z · valid +24h · 0.25°→0.5° · CC-BY-4.0 / public domain · [모델 예보] 배지. Ice: 'NSIDC Sea Ice Index G02135 · 25km · 지연 1~3일 · 두 선 모두 15% 기준'. Stations: '기상청 해양관측망 · tm(KST) · 공공누리 1유형 · [관측]'. 배지·기관명·자료일은 Legend 에도 상시 떠서 무료에서도 보인다.<br>⚠️ *말하면 안 되는 것:* OISST 를 '오늘 관측'이라 하지 않는다. 해류를 '지금'이라 하지 않는다. Open-Meteo 파생값에 '기관'이라 부르지 않는다(PROVIDER_FORECAST). NOAA CoastWatch 의 상업 이용 명시·AVISO+ 파생물 조건은 UNKNOWN — 확인 전에는 유료 핵심 그림의 출처로 쓰지도 적지도 않는다. 라이선스 칸을 추정으로 채우지 않는다(모르면 '확인 중'). 배지와… | 출처표 sources[]: {id, agency, product, kind, times{observed\|run\|valid\|retrieved}, nativeRes, shownRes, sampling, license, credit, latencyNote, caveat}. 바다 고유 공급값은 latencyNote(OISST ≤8일 marine-grid/handler.py:188 · 해류 D-3 · 해빙 1~3일) — '최신'의 위치가 레이어마다 다르다는 사실을… | W5 Inspector · W6 수집기별 meta 확장 · REFRESH_MIN 에 sstanom·argo 등록(S) · 해류 라이선스 서면 확인(PD) · R0 Open-Meteo 결정(D-OM1/D-OM2). | EXPLORER |
| **④ 시간축** | ❌ 공용 타임라인 자체는 하나 있다 — ui-shell.js:1326-1362, #ts-range min=-1440 max=7200 step=30(−1일~+5일, :1334). 그러나 main.js:4891-4899 onTimeOffset 은 clouds.setForecastOffset·liveLayers… | 타임라인은 화면에 하나뿐이고 Ocean 은 '레이어마다 다른 시간 성질'을 거기에 공급한다: SST·SSTA·Ice = 일별 관측(과거 방향만, + 구간은 회색 '관측 자료 — 예보 없음'), Currents = 일별 분석장(최신 눈금이 D-3 에 찍힌다), Waves = 3h 스텝 모델 예보(지금~+5일, 옆에 'GFS-Wave 00Z · 6h ago'), Stations = 최근 24h(이력 적재 시작일부터). 스크럽하면 색면·입자·glyph·마커 숫자·Inspector 값·배지가 같은 시각으로 함께 바뀐다. 이력이 아직 없는 과거는 회색 + '이력 수집 시작일 YYYY-MM-DD'. '작년 같은 날'은 새 슬라이더가 아니라 타임라인의 점프 칩(−1y). 무료는 최신 장 + 파고 +24h(안전 창), EXPLORER 는 해빙 최근 1년·서핑/낚시 예보 길이, PRO 는 전 구간 재생·임의 날짜.<br>⚠️ *말하면 안 되는 것:* 관측 레이어에 미래 값을 만들지 않는다 — SST·SSTA·Ice·Currents 의 + 구간은 비우고 지속성 외삽도 하지 않는다. 이력이 0건인 과거를 보간으로 채우지 않는다. 미래 스웰과 현재 실측 바람을 한 판정에 섞지 않는다(offset≠0 이면 바람도 MODEL 배지). 이안류는 offset≠0 에서 '예보 없음'. 조위 예보는 KHOA 조석예보 수집기가 생기기 전에는 없다. | 필드별 frames 매니페스트 {axis:'past'\|'future', step:'1d'\|'3h'\|'10min', latestAt, historyStart, gaps[]} + 날짜 키를 명시한 값 PNG 프레임(S3 Versioning OFF). 타임라인에 요구하는 확장 3가지: ① 과거축이 지금 −1일뿐 → 일 단위·수년 범위 줌, ② 레이어별 '최신 위치' 눈금(OISST ≤8일·해류 D-3·해빙 1~3일), ③ 회색 구간 문구. 백필: OISST 연… | W0 공용 프레임 저장소(CloudManager 에서 분리) · W5 GlobalTimeline · W6 수집기(OISST 전용 함수 분리+일별 프레임 적재 / 파랑 프레임 / 해류 / NSIDC) · archiver 에 kma-buoy 추가(S) · ExtScene 시간 훅(S —… | PRO |
| **⑤ 비교** | ❌ 비교 UI 0건 — ui-shell.js 에서 compare\|Compare\|split\|wipe grep 결과는 문자열 .split 호출·정렬·설명문뿐(:590,:608,:692,:804,:833,:1142). 가장 가까운 것은 main.js:4681-4685 'marine-buoys': 해양 모델… | TOP Compare 를 바다 변수로 열면 같은 카메라·시각·범례로 두 장이 선다. 1순위(지금 자료로 됨) 'OISST 칸 값 \| 기상청 부이 수온(tw)': 좌 = SST 구간색, 우 = 같은 구간색으로 채운 흰 테두리 관측 마커+숫자, diff 모드는 마커 옆 '격자 분석값 − 지점 실측 = +0.6°C'. 2순위 시각↔시각 '오늘 \| 작년 같은 날' SST·SSTA·Ice wipe + 증감 diff(이력·백필 뒤). 3순위 Ice '오늘 15% 선 \| 1981–2010 중앙값 선'(같은 제품). 4순위(PRO 간판) 'GFS-Wave \| ECMWF-WAM' 유의파고·평균파향·평균주기 — run 시각·해상도 표기, 공통 scale 기본. SST↔SSTA 탭 전환은 비교가 아니라 변수 전환이라 Compare 에 넣지 않는다.<br>⚠️ *말하면 안 되는 것:* '오차'·'검증'이라 부르지 않는다 — OISST 는 부이를 이미 흡수한 분석장이라 독립 검증이 아니고, 등표·조위관측소 같은 연안 지점은 0.5~1° 칸이 대표하지 못한다. 5° Open-Meteo 파고와 부이를 비교하지 않는다(격자 크기 차이를 오차로 오독). 수온·해류의 GFS\|ECMWF 비교는 없다 — 그런 격자를 받지 않는다. ECMWF 에 너울 분리 변수가 없어 너울은 모델 비… | compare.pairs[]: {id:'sst.grid_vs_buoy', kind:'관측 분석장\|지점 관측', ready:'now', diffLabel:'격자 분석값과 지점 실측의 차', forbid:'오차'} · {id:'sst.date_vs_date', ready:'일별 이력/백필 뒤'} · {id:'ice.today_vs_median', ready:'NSIDC 수집기 뒤'} · {id:'wave.gfswave_vs_ecmwf', vars:['hs','m… | W8 Compare workspace · W1(렌더러 두 번) · W5 · ocean/kma-buoy.json(있음) + W6 pick · 2~4순위는 각 수집기·백필. 새 PD 결정 없음(짝은 자료가 정한다). | PRO |
| **⑥ Intelligence** | 🟡 패킷 생산자는 바다에서 ocean.sst 하나 — aws/marine-grid/intel_sst.py: current = 한국 3해 기준 격자칸(:54-58,:113-125), anomaly = 같은 관측일일 때만 평년 대비(:130-166), related = 교과서 관계 1건(reference, G… | 칸(또는 한국 3해 기준 칸)을 고르면 Inspector Intelligence 탭 Now 가 '동해 기준 칸 26.1°C' → '평년 대비 +2.3°C(NOAA 1991–2020, 같은 칸)' → '출처 NOAA OISST · 관측일 09-18' 순으로 뜨고 그 아래에 문장이 온다. 문장 예(근거가 패킷에 실렸을 때만): "이 칸의 수온은 평년보다 2.3°C 높습니다. 같은 칸에서 최근 10일 평균 10m 풍속이 3.1 m/s 로 약했고 해면기압이 1018 hPa 로 높게 이어졌습니다(GFS 분석장) — 바람이 약하면 표층 혼합이 줄어 표층이 데워지는 기작(문헌 인용)이 이 조건과 맞습니다. NOAA CPC 는 올겨울 라니냐 확률을 71%로 발표했습니다(기관 발표 확률 · 발표일)." 앞 문장의 근거는 attribution{condition 2건(측정값·출처·시각) + mechanism 1건(문헌)}, 뒤 문장은 probability{source:AGENCY}. 탭 Forecast 는 '이 해역 유의파고 3m 이상 — GFS-Wave·ECMWF-WAM 두 모델 모두 +36h'(확률이 아니라 모델 일치 표기), Climatology 는 '북극 해빙 면적 · 같은 날 역대 n번째(1979~) · DERIVED', Analysis 는 표류 추정 채점표(lab-events ocean-drift 평균 오차 km).<br>⚠️ *말하면 안 되는 것:* 지금 패킷으로는 원인도 확률도 말할 수 없다 — conditions 절이 비어 있고(intel_sst.py:172-173) next 도 없다(:181). 예문의 풍속·기압은 W0 프레임이 생겨야 실리고 ENSO %는 수집기가 없다. 그 전에는 '평년보다 +2.3°C'까지만 말하고 엘니뇨·고기압을 원인으로 붙이지 않는다. 바다 변수의 앙상블은 없다 → 확률 %를 만들지 않는다(모델 2종 일치… | 생산자: 기존 aws/marine-grid/intel_sst.py(ocean.sst, 문서 ocean/sst-global.json 의 intel 칸). 확장: anomaly 전지구화(SSTA 0.5° 뒤) · change/pattern(일별 이력 롤업 뒤 '+2°C 이상 n일째') · conditions(W0 GFS 10m 바람·PRMSL 의 같은 칸 값). 신규 생산자 후보: ocean.sea_ice(ocean/series/seaice-daily.json 순… | W9(attribution·probability 스키마 · narration_guard '근거 있으면 통과' 개정 · 채점) · W0(GFS 10m 바람·PRMSL — conditions 재료) · P2a 변화 롤업/일별 이력 · CPC ENSO 수집기 신규(또는 채점된 지속 모형)… | EXPLORER |
| **⑦ Simulation** | 🟡 sim-questions.js: ocean.wave = LIMITED(Gerstner 파도 장면, '기록 남는 계산 아님' :44-57, preview PREVIEW_TYPHOON_SEA :32-36) · ocean.surface_current :129-141 · ocean.sst :142-154 ·… | Ocean 어느 탭에서도 Simulation 입구는 같은 자리(Inspector 하단·TOP)에 있다. 누르면 지금 상태(탭·시각·카메라·선택 칸·프레임 키)를 스냅샷으로 저장하고 작업공간으로 들어간다: Current(최근 해류 분석장+선택 지점) → Baseline(방출점·72h·바람 끌림 α=0) → Scenario 칩 [α=0 \| α=0.002 \| 방출 시각 +12h] → Result(궤적 absolute + 기준 대비 분리거리 delta, ScenarioCompare 표). 결과 옆에 검증 상태 'NOT_ACCEPTED — 사전등록 검증에서 정지 기준선을 이기지 못함'과 한계(확산·Stokes·풍화 없음)가 상시 붙는다. 엔진이 공개 배포되기 전에는 같은 입구가 '표류 계산은 연구 런타임(로컬 단일 사용자)에만 있습니다 — 공개 실행까지 남은 것: 인증·작업 큐·한국 주변 검증'이라는 사유 카드를 연다. Waves 탭의 Gerstner 장면은 Preview(SIMULATION 배지 없음)로 남고, SST·Ice·Argo 는 같은 입구에서 sim-questions.js 의 NOT_AVAILABLE 사유를 말한다.<br>⚠️ *말하면 안 되는 것:* 표류 계산이 돈다는 것과 관측 검증을 통과했다는 것은 다르다 — 사전등록 검증 FAIL(72h 중앙 분리거리 모델 24.3km vs 정지 19.2km, docs/research/IMPLEMENTATION_STATUS.md PR-08), 홀드아웃에서 α=0.002 가 α=0 대비 일관된 개선 없음(24h 6승 6패 · 48h 4승 8패, step20-b6-holdout-summary.json… | 시나리오: drift{engine:'research-runtime surface-passive-advection.v1 / .v2.windage', chips:[α=0, α=0.002, 방출 시각 이동], duration≤72h, forcing:{manifest, grid(lon·lat·timeUTC·u·v·landMask, 최소 2프레임 — README.md:57)}}. 해류 수집기 출력(u/v 프레임)을 이 격자로 바꾸는 어댑터가 바다 메뉴의 공급물. pre… | W10 작업공간 · W6 해류 수집기(u/v 프레임 2장 이상) → research-runtime 격자 어댑터 · 계약 §I S-A(인증·테넌트 격리·작업 큐 — README.md:17 '별도 배포 필요') · 계약 §N 지역별 재검증(한국 주변 코호트 없음) · simulation_… | PRO |

- **⑤ 비교 짝:** 1순위(지금 자료로 바로 됨) — '관측 분석장 \| 지점 관측': NOAA OISST 칸 값(ocean/sst-global.json, 이미 수집) 대 기상청 해양관측망 수온 tw(ocean/kma-buoy.json, 이미 수집·10분, engine-bridge.js:185 slaMin 90). 같은 구간 LUT 로 좌는 색면, 우는 흰 테두리 마커+숫자, diff 는 '격자 분석값과 지점 실측의 차'. 이유: 바다 메뉴에서 두 자료가 모두 운영 중이고 Open-Meteo 와 무관한 유일한 짝이며, 기본 탭(SST)에서 성립한다. 단 '오차'·'검증'이라 부르지 않는다 — OISST 는 부이를 이미 흡수한 분석장이고 연안 지점은 0.5~1° 칸이 대표하지 못한다. 필요한 것은 Compare 작업공간(W8)과 마커 pick(W6)뿐, 새 수집 0.<br>2순위 — 시각↔시각 '오늘 \| 작년 같은 날'(SST·SSTA·Ice wipe + 증감 diff): 지금은 안 된다(이력 0건 — archiver/handler.py:369-378,:633-642 에 sst-global 없음). OISST 연도 파일 백필 + 일별 프레임 적재 뒤.<br>3순위 — 기준선 비교 Ice '오늘 15% 선 \| 1981–2010 중앙값 선': 같은 제품(NSIDC G02135)·같은 문턱이라 정직하게 성립. NSIDC 농도 격자 수집기 뒤.<br>4순위(PRO 간판, PD 의 '모델 비교') — 'GFS-Wave \| ECMWF-WAM' 유의파고·평균파향·평균주기. 지금은 안 된다: 저장소에 파랑 수집기 0개, ECMWF 격자 수집기도 없다(ecmwf-ingest 는 97지점 점값+태풍 경로). 너울 분리는 ECMWF 에 없어 비교 변수에서 뺀다.<br>성립하지 않는 짝: 수온·해류의 GFS\|ECMWF(그런 격자를 받지 않는다) · 5° Open-Meteo 파고 \| 부이(격자 크기 차를 오차로 오독) · 정의가 다른 해빙 두 선(IMS/GIBS MUR vs NSIDC). SST↔SSTA 탭 전환은 비교가 아니라 변수 전환이다.
- **⑦ 시나리오:** 있는 엔진 우선 — 표류(drift). services/research-runtime 의 surface-passive-advection.v1 / .v2.windage (OceanParcels 3.1.4 표층 수동 입자 RK4, README.md:23-25). 주변 부품도 이미 있다: aws/_shared/simulation_link.py:258-301 from_research_runtime(→ SimulationRunRecord, limits·validation·reproducibility 포함), prototype/v2-three/js/scenario-compare.js(표류가 첫 baseline↔branch, 비교 가능성 검사 :17-27), 계약 §I S-A '표류 승격', §K-3 'Scenario·Preview 를 실제로 증명하는 첫 사례는 표류'. 시나리오 칩: 바람 끌림 α=0 \| α=0.002 \| 방출 시각 이동 — 계약이 이미 허용한 매개변수만.<br>가용성(정직하게): ① 런타임은 127.0.0.1 단일 사용자 전용(README.md:17) — 공개 실행에는 인증·테넌트 격리·작업 큐가 필요. ② 관측 검증 NOT_ACCEPTED: 2015-01 북대서양 drogue 21기에서 72h 중앙 분리 모델 24.3km vs 정지 19.2km(IMPLEMENTATION_STATUS.md PR-08), 쿠로시오 연장역 홀드아웃에서 α=0.002 는 α=0 대비 24h 6승6패·48h 4승8패(step20-b6-holdout-summary.json). ③ 강제자료는 HYCOM GOFS 3.1 15m 고정 예제이고 v2 의 해류 레이어(지금 Open-Meteo 5°)와 무관 — W6 해류 수집기(u/v, 2프레임 이상)→{manifest,grid(u,v,landMask)} 어댑터가 필요(README.md:57). ④ 한국 주변 지역 검증 코호트 없음(§N 재검증 필요). → 출시 시점 status 는 not_available 또는 limited, 입구는 같은 자리에 두고 위 사유를 말한다.<br>Preview 로 유지: sim-ocean.js Gerstner 파도 장면(sim-questions.js:44-57 LIMITED, SIMULATION 배지 없음). 단 입력이 Open-Meteo 직호출 값(main.js:2898)이라 파랑 프레임 격자점 값으로 교체 필요.<br>엔진 없음(입구+사유): '바닷물 온도는 어떻게 변할까'(:142-154) · '해빙은 어떻게 움직일까'(:267-280) · '깊은 바다의 물은'(:295-308). 의미 있는 다음 후보: 해수면 상승 노출 셈(AR6 전망 높이 × 지형 고도 — DEV-DIRECTIVE.md:203,:244 가 W10 첫 후보 ②로 지목, sim-questions.js:281-294 NOT_AVAILABLE) — 새 계산이라 validationPlan·한계 문구(방조제·지반 침하 미반영)가 선행. 기후 시나리오(+2/+4°C SST, CMIP6)는 새 자료 확보가 필요해 가장 뒤.<br>참고로 있는 것: aws/lab-events 'ocean-drift'(handler.py:716-791 — Argo 직전 변위 지속성 추정 + 다음 부상 위치로 채점). 채점된 통계 모형이지만 1000m 정지수심 흐름이고 레지스트리에 대응 현상이 없다(phenomenon-registry.js:997) — Simulation 이 아니라 Intelligence Analysis 탭의 채점표 재료.
- **첫 단면(7단계를 전부 관통하는 가장 얇은 출시):** SST 탭 하나로 7단계를 끝까지 관통한다 — 새 수집기 0, 기존 ocean/sst-global.json(1°, 360×161) 그대로.<br>(1) W1·W2 의 구간화 렌더러를 두 번째 소비자로 받아 SST 10단 구간색 + 4°C 흰 등온선 + 숫자 라벨 + 바다 마스크(sampleHeight<0 AND 유효) + 상시 Legend. 이것만으로 '육지가 잠기는' 버그와 뭉갠 그라데이션이 함께 사라진다. 등온선 1°C·2°C 칩은 1° 자료에서는 켜지 않는다(4°C 고정, 그 사실을 범례에).<br>(2) 바다 클릭 → 이미 메모리에 있는 sst 배열에서 최근접 칸 값(intel_sst.py cell_value 와 같은 식) → Inspector.ValueCard '23.4°C · 칸 약 111km(1° 표본) · 격자 분석값'. 네트워크 0건. SST 탭에서는 marineSelect(Open-Meteo 직호출)를 타지 않게 한다.<br>(3) 문서가 이미 싣는 source·observed·sampling·attribution·dataType 으로 ProvenanceCard — '관측 분석장 · 예보 아님 · 관측일(오늘 아님)'. license·nativeRes 두 필드만 수집 문서에 추가.<br>(4) 타임라인에 SST 의 '최신 위치' 눈금(관측일)을 찍고, 과거는 회색 '이력 수집 시작일 —', 미래는 회색 '관측 자료 — 예보 없음'. 같은 날 archiver 에 sst-global 일별 복사를 걸어 그날부터 이력이 쌓이게 한다(재생은 쌓인 뒤).<br>(5) Compare 1쌍만: 'OISST 칸 값 \| 기상청 부이 tw'(kma-buoy.json, 이미 수집) — 같은 LUT 의 마커+숫자, '격자 분석값과 지점 실측의 차'. Compare 작업공간(W8)이 아직이면 Inspector 에 한 줄 차이값 + '비교 작업공간에서 열기' 입구(사유: 준비 중이 아니라 W8 일정 명시).<br>(6) 기존 intel_sst 패킷을 Inspector Intelligence 탭에 수치→출처→문장 순으로 재배치(한국 3해 기준 칸 · 평년 대비 · Gray 1968 교과서 관계). 원인·확률 문장은 아직 없다 — '함께 잰 조건(바람·기압) 자료가 붙으면 원인을, 기관 확률이 붙으면 확률을 말합니다'라는 사유를 같은 자리에.<br>(7) 같은 자리에 Simulation 입구 — 스냅샷 저장까지는 동작하고, 작업공간에서는 sim-questions.js 의 ocean.sst NOT_AVAILABLE 사유 + '표류 계산은 연구 런타임에만 있습니다(검증 NOT_ACCEPTED)' 안내.<br>미루는 것: 0.5° 전지구 값 PNG·OISST 전용 Lambda 분리, SSTA 전지구(동아시아 조각은 첫 단면에서 SSTA 탭을 '동아시아 한정'으로 표기하거나 탭을 늦춘다), Currents(PD 의 '기본 ON' — 해류 수집기·라이선스 확인이 바다 묶음의 임계 경로라 첫 단면에서 빠진다고 분명히 적는다), Waves(파랑 수집기 2종), Ice(NSIDC 격자), Stations 전체 pick·라벨, Argo 단면, 서핑·낚시, 이력 백필·재생, 모델↔모델 비교, 표류 공개 실행.
- 비고: 【PD 결정 필요】 ① SSTA·파고·해류 구간값(정본에 값 없음). ② 'Ice' 다섯째 칩 신설과 '눈·얼음' 묶음 해체(phenomenon-registry.js:1089). ③ Argo 를 관측 토글 묶음에 넣을지. ④ 여가 3현상(ocean.coastal_spots·surf_conditions·fishing_conditions — 지금 '생태·사람·여행' 묶음 :1108)의 자리: Waves 탭 'Show spots' 흡수(권고) / v1 이관 / 삭제. ⑤ 해류 출처(NOAA CoastWatch 상업 이용 서면 확인 vs RTOFS). ⑥ R0 Open-Meteo 결정(D-OM1/2/5) — 새 파랑 격자 전까지 5° 파고·해류를 내릴지. ⑦ 표류를 현상으로 등재할지(:997).<br>【문서 간 불일치 — 조정 필요】 DEV-DIRECTIVE.md:198 은 'Contour(1°C) 토글 · OISST 0.25° 그대로'라 하나, 반박 검증을 거친 분석은 '0.5° 전지구 한 장 · 4°C 기본 · 1°C 는 조건부 · 0.25°는 P2'. DEV-DIRECTIVE.md:199 는 해류 대체로 CMEMS 를 들지만 분석은 NOAA CoastWatch ERDDAP(라이선스 미확정)+RTOFS 대안. DEV-DIRECTIVE.md:49 는 flow.js advectNormalized 재사용 불가(날짜변경선 clamp·cos 위도 보정 없음)라 했으므로 분석 자료의 reuse 목록 중 flow.js 는 flowRenderBudget 만 쓰고 이류는 W3 엔진(v1 windfield.js 알고리즘 이식)을 쓴다.<br>【코드 불일치】 phenomenon-registry.js:335·:347·:407 이 intelligence:true 인데 main.js:4098-4112 intelHostFor 에는 ocean.sst 분기뿐 — 띠가 뜰 수 없는 현상에 능력이 선언돼 있다. REFRESH_MIN(live-layers.js:344-349)에 sstanom·argo 누락.<br>【직접 열어 본 파일】 D:\## APP\EARTHUS v2_APP\prototype\v2-three\js\live-layers.js · main.js · ui-shell.js · intel-strip.js · sim-questions.js · phenomenon-registry.js · scenario-compare.js · engine-bridge.js(grep) · aws\marine-grid\handler.py · aws\marine-grid\intel_sst.py · aws\archiver\handler.py · aws\lab-events\handler.py(:700-791) · aws\_shared\simulation_link.py(:255-301) · services\research-runtime\README.md · docs\research\IMPLEMENTATION_STATUS.md · docs\research\step19/20/22 요약 json · docs\earthus-v2\PAID-UX-REDESIGN-2026-09-20\DEV-DIRECTIVE.md(:26,:46-58,:176-244).<br>【미열람 — 분석 자료·지시서 인용】 main.js sampleAt(:1979-2016) · buildArgo/argoSectionSvg(live-layers.js:2689-2767) · buildGibsShell(:1576-1607) · aws/kma-ocean·marine-ea·khoa-coast·ecmwf-ingest·climatology·argo-floats 수집기 · hobby-surf/hobby-fishing · NOMADS/ERDDAP/ECMWF 외부 확인 내용. step20 홀드아웃 72h 승패는 출력이 잘려 미확인(24h·48h 만 적음).<br>읽기 전용 준수 — 파일 수정·커밋·배포·빌드 없음.

<details><summary>descriptor 초안</summary>

```js
{
  id: 'ocean', rail: 5, label: { ko: '해양', en: 'Ocean' }, defaultMode: 'sst',
  // 색면 라디오(한 번에 하나) — 기존 레이어 id 그대로(개명 금지)
  modes: [
    { id: 'sst',   ui: 'tab',  layer: 'ocean/sstfield',  phenomenon: 'ocean.sst' },
    { id: 'ssta',  ui: 'tab',  layer: 'ocean/sstanom',   phenomenon: 'ocean.sst_anomaly' },
    { id: 'waves', ui: 'chip', layer: 'ocean/wavefield', phenomenon: 'ocean.wave', gate: 'DATA — 파랑 프레임(ECMWF wave / GFS-Wave) 전에는 유료 레일에 올리지 않음' },
    { id: 'ice',   ui: 'chip', layer: 'land/seaice',     phenomenon: 'ocean.sea_ice', camera: 'pole', hemisphereChips: ['Arctic','Antarctic'], gate: 'PD 결정 + NSIDC 농도 격자 수집기' },
  ],
  // 색면과 분리된 토글
  overlays: [
    { id: 'currents', layer: 'ocean/current', render: 'ParticleField', defaultOn: true, gate: 'DATA — 해류 u/v 수집기 전에는 토글 자체를 두지 않음' },
    { id: 'stations', layers: ['ocean/kmasea', 'ocean/buoys'], render: 'StationMarkers', order: 'kmasea 먼저(한국 먼저)', labelMax: 40 },
    { id: 'argo',     layer: 'ocean/argo', render: 'StationMarkers+SectionPanel', gate: 'PD 결정(정본에 자리 없음)' },
    { id: 'spots',    layers: ['ocean/surf', 'hobby/surf', 'hobby/fishing'], onlyIn: 'waves', chips: ['서핑','낚시'], gate: 'PD 결정(레일 자리 없음) + 파랑 프레임' },
  ],
  fields: {
    sst:  { unit: '°C', decimals: 1, source: 'noaa-oisst', valueTex: { res: 0.5, w: 720, h: 321, enc: 'u16×2 (value×valid, valid)', alpha: false }, mask: 'sea: sampleHeight<0 && valid>=0.5', readout: 'nearestNativeCell', precisionNote: '격자 분석값 · 칸 약 55km' },
    ssta: { unit: '°C', signed: true, source: 'noaa-oisst − noaa-psl-ltm-1991-2020 (같은 칸)', grid: 'sst 와 동일', neutralBand: [-0.5, 0.5] },
    hs:   { unit: 'm', decimals: 1 }, mwd: { unit: '°', convention: '진행 방향 — 수집기에서 고정·시험' }, mwp: { unit: 's' },
    swell:{ h: 'm', dir: '°', per: 's', only: 'GFS-Wave(ECMWF 에 너울 분리 없음)' },
    cur:  { u: 'm/s', v: 'm/s', altUnit: 'kn', res: '0.25° 원천 → 0.5°(stride 2)', source: 'noaa-coastwatch-blended-nrt(라이선스 확인 전 후보) | noaa-rtofs(대안)' },
    ice:  { unit: '%', grid: '25km 극투영 → 1440×720', flags: { 251: '극점 구멍', 253: '해안', 254: '육지', 255: '결측' }, source: 'nsidc-g02135' },
    station: { keys: ['wh','tw','ta','pa','hm','wd','ws','gust','kind','tm(KST)'], buoyOnly: ['whMax','whAvg','wp','wo'] },
  },
  scales: {
    sst:  { type: 'stepped', breaks: [0,4,8,12,16,20,24,28,32], classes: 10, origin: 'PD 정본' },
    ssta: { type: 'stepped-diverging', breaks: [-3,-2,-1,-0.5,0.5,1,2,3], skip: [-0.5,0.5], origin: '제안 — PD 확인' },
    hs:   { type: 'stepped', breaks: [0.5,1,2,3,4,5,7,10], origin: '제안 — PD 확인' },
    cur:  { type: 'stepped', breaks: [0.1,0.25,0.5,0.75,1.0,1.5], units: ['m/s','kn'], origin: '제안 — PD 확인' },
    ice:  { type: 'stepped', breaks: [15,30,50,70,90], below15: '비움', colors: ['#1F4E79','#2F7FB5','#6CB8E0','#BFE6F5','#FFFFFF'] },
  },
  contours: {
    sst:  { chips: [4,2,1], default: 4, rule: '1°C 는 자료>=0.5° && 선 간격>=26px 일 때만, 아니면 2°C 로 올리고 범례에 적음', labels: { max: 24, anchor: 'contour-math.js 1회' } },
    ssta: { levels: [-3,-2,-1,1,2,3], bold: [2,3], label: '+2°C' },
    hs:   { levels: [3,5], legendNote: '모델 예보의 기준선 — 특보 발효 여부는 기상청 발표만' },
    ice:  { levels: [15], reference: { id: 'median-1981-2010', style: '주황 점선', sameProduct: true } },
    cur:  null,   // 속도 등치선 없음
  },
  particles: { field: 'cur', budget: 'flow.js flowRenderBudget (18000/5000)', dieOn: ['land','missing'], waveGlyph: { reuse: 'ParticleField 인스턴스 + 호(弧) 스프라이트', note: '이동 속도∝주기는 표현 — 실제 파속 축척 아님' } },
  sources: [
    { id: 'noaa-oisst', agency: 'NOAA PSL', product: 'OISST v2.1 daily', kind: '관측 분석장(위성+부이)', nativeRes: '0.25°', license: 'public domain', latencyNote: '최대 8일 뒤로 물러남', collector: 'aws/marine-grid → OISST 전용 함수로 분리' },
    { id: 'noaa-psl-ltm-1991-2020', kind: '평년', collector: 'aws/marine-ea(동아시아 조각 → 전지구 전환 후 폐기)' },
    { id: 'kma-ocean', agency: '기상청', kind: '관측', license: '공공누리 1유형', step: '10min', doc: 'ocean/kma-buoy.json' },
    { id: 'ndbc-gts', doc: 'ocean/buoys.json', kind: '관측' },
    { id: 'argo', agency: 'Argo GDAC (Ifremer ERDDAP)', doc: 'ocean/argo-floats.json', kind: '관측' },
    { id: 'ecmwf-wave', license: 'CC-BY-4.0', nativeRes: '0.25°', status: '수집기 없음' },
    { id: 'gfs-wave', agency: 'NOAA', license: 'public domain', status: '수집기 없음 · 패킹 UNKNOWN' },
    { id: 'nsidc-g02135', kind: '관측 기반 일별 분석', status: '면적 CSV 만 수집 중 · 농도 격자 수집기 없음' },
    { id: 'open-meteo-marine', status: '유료 핵심 그림에서 제외(R0 감사)' },
  ],
  frames: {
    sst:  { axis: 'past', step: '1d', latestLag: '<=8d', history: 'OISST 연도 파일 백필 뒤' }, ssta: 'sst 와 동일',
    ice:  { axis: 'past', step: '1d', latestLag: '1-3d', history: '1979~ 는 2단계 배치' },
    cur:  { axis: 'past', step: '1d', latestLag: '3d', history: '원천 2015~ 에서 재생성' },
    waves:{ axis: 'future', step: '3h', horizon: '+5d', runLabel: true },
    stations: { axis: 'past', step: '10min', window: '24h', from: '이력 적재 시작일' },
    free: { latestOnly: true, wavesFutureHours: 24 },
  },
  compare: { pairs: [
    { id: 'sst.grid_vs_buoy', ready: 'now', diffLabel: '격자 분석값과 지점 실측의 차', forbidWords: ['오차','검증'] },
    { id: 'sst.date_vs_date', ready: '일별 이력 뒤', jump: '-1y' },
    { id: 'ice.today_vs_median', ready: 'NSIDC 수집기 뒤' },
    { id: 'wave.gfswave_vs_ecmwf', vars: ['hs','mwd','mwp'], ready: '파랑 수집기 2종 뒤', scale: 'common' },
  ] },
  intel: {
    producers: [{ phenomenon: 'ocean.sst', ref: 'aws/marine-grid/intel_sst.py', host: 'ocean/sst-global.json#intel', sections: ['current','anomaly','related'] }],
    planned: ['ocean.sst_anomaly(전지구 편차 뒤)', 'ocean.sea_ice(seaice-daily.json 순위·평년 대비)', 'ocean.wave(프레임+부이)', 'ocean.sea_observation(24h 변화)'],
    attribution: { conditions: ['GFS 10m 풍속(같은 칸)', 'GFS PRMSL(같은 칸)'], mechanismRef: 'phenomenon-relations.js(혼합층 기작 — 등재 필요)' },
    probability: { AGENCY: 'NOAA CPC ENSO 확률(수집기 없음)', ENSEMBLE: null, VERIFIED_MODEL: null },
    order: ['value','provenance','sentence'],
  },
  simulation: {
    entry: 'same-slot', snapshot: ['mode','timeOffset','camera','selectedCell','frameKey'],
    scenarios: [{ id: 'drift', engine: 'services/research-runtime surface-passive-advection.v1|.v2.windage', chips: ['α=0','α=0.002','방출 시각 +12h'], status: 'not_available→limited(공개 배포·지역 검증 뒤)', validation: 'NOT_ACCEPTED 상시 표기' }],
    preview: [{ id: 'wave-now', engine: 'prototype/v2-three/js/sim-ocean.js', badge: null }],
    notAvailable: ['sst-change','seaice-move','argo-deep','current-flow','slr-exposure'],
  },
  tiers: { FREE: ['현재 구간색·등치선·입자·범례','기본 칸 값','배지·자료일','부이 실측','파고 +24h'], EXPLORER: ['정확값·편차·평년값','출처 카드 전체','해빙 최근 1년','짧은 인텔'], PRO: ['Compare','전 구간 재생','표류 시뮬','export·알림'] },
}
```

</details>

#### 06 Hazards 재해

| 단계 | 지금 | 끝났을 때 사용자가 보고 하는 것 | 이 메뉴가 공급할 것 | 선행 | 요금 |
|---|---|---|---|---|---|
| **① 극적으로 보인다** | 🟡 1탭에 점은 찍히지만 심각도 구간색·범례·숫자 라벨이 0이다(PARTIAL 의 하한 — 공용 부품 기준으로는 0). 지진: 메뉴 hazards/eq·tc·feed 는 피드 패널만 열고 지구에 아무것도 켜지 않는다(main.js:4528-4537). 지구 표식은 DOM 비컨 앞 14건(intel-feed… | 재해 1탭 → 3초 안에 '지금 활성인 사건' 전부가 EventLayer 한 문법으로 뜬다. 지진=규모 4단 크기(M4.5~5·5~6·6~7·≥7)×깊이 7단 구간 고정색(0·25·50·100·200·400·800km)+M≥6 숫자 라벨+최근 1시간 확산 링 / 태풍=3px 이상 리본(기관 발표 최대풍속 17·25·33·44·54 m/s 구간색, 과거 실선·예보 점선)+JMA 70% 확률원 면+h=0 강풍역(노랑)·폭풍역(빨강)+점선 폭풍경계역 / 특보=구역 면 3단(주의보·경보·중대경보) / 낙뢰=나이 5단색(0~10·10~20·20~30·30~45·45~60분)×G 채움·C 속빈 / 산불=FRP 5단(30~100·100~300·300~1,000·1,000~3,000·≥3,000 MW) 크기+색, 일반 블렌딩 / 쓰나미=발표 분류별 아이콘+등시선 6단색(≤60·120·180·300·480·초과 분)+'부산 +95분' 라벨. Legend 하나가 하위 칩(태풍/특보/낙뢰/산불/지진/쓰나미)에 따라 눈금·단위·출처·자료시각을 바꾸고, 0건이면 '현재 활성 태풍 없음 · KMA/JMA/NHC · 확인 HH:MM' 같은 빈 상태 칩이 지구 위에 뜬다. 하위 레이어 높이는 하늘(aboveCloudsR)·지표(surfR) 두 가지로 통일해 50× 과장에서 묻히지 않는다.<br>⚠️ *말하면 안 되는 것:* 태풍 색을 'Category'라 부르지 않는다(NHC 피드도 등급 번호 없음). h>0 의 stormArea 를 실황 폭풍역과 같은 색면으로 그리지 않는다(태풍이 자라는 것처럼 읽힘). 특보 표시색을 '기상청 공식색'이라 부르지 않는다(대조 전). '새 불'은 발화가 아니라 EARTHUS 첫 탐지. 화선(perimeter)·375m 화점·KMA 확률원·JMA 중심기압·일본 낙뢰 종류는 자료… | 사건 종류별 눈금표 6벌(위 target 의 경계값 그대로)과 단위(m/s · km · MW · 분 · kA · 단계명), 기호 모양 규칙(G 채움/C 속빈, 발표 분류별 아이콘, 회전 사이클론 기호), 심각도 의미(무엇이 '더 위험'인가: 풍속·단계·FRP·규모), 빈 상태 칩 문구 6종, 상시 고지 문구(열점≠산불·12km 군집 / 근사 경계—공식 구역 폴리곤 미제공 / JMA 70% 확률원—태풍 크기 아님 / 풍속 평균시간 기관마다 다름 / SIMULAT… | 공용 굵은 선 부품(three/examples/jsm/lines 벤더링 또는 자체 리본 메시 — P0 Temperature 등온선과 공용) · 공용 지구 라벨 부품(P0 Temperature 등온선 라벨) · 정점별 크기 셰이더 점(makeCyclones aSize 일반화 — 지진·낙… | FREE |
| **② 정확한 값** | ❌ 지도 클릭 경로에 재해 레이어 픽이 없다. pointerup 은 extScene.pick → travel.pick → seafloor.pick → focus.pick(국가) 순으로만 보고(main.js:2793-2838), 아무것도 안 걸리면 marineSelect 로 떨어져 Open-Meteo mar… | 지구 위 사건 기호·면·리본 구간을 1회 클릭 → 우측 Inspector.ValueCard 가 메모리의 사건 객체에서 즉시(네트워크 0건) 값을 낸다: 지진 'M6.8 · 깊이 35km · 발생 09-20 14:02 KST(05:02 UTC)', 태풍 스텝 '+48h 예보 위치 · 최대풍속 35 m/s(10분 평균 · JMA)', 특보 '강원북부산지 · 호우 · 경보 · 발효 09-20 13:00', 낙뢰 '−38 kA · 대지방전 · 12분 전', 산불 'FRP 420 MW(12km 군집 합산 · 탐지 17건)', 쓰나미 'Warning · PTWC' 와 연안 지점 '부산 +95분(SIMULATION_ONLY)'. 값 옆에 정밀도 한계 한 줄이 붙는다 — '기관 발표 원문 값' / '군집 합산이지 한 불의 값이 아님' / '근사 경계 — 내 구역 판정은 최근접 관측지점 규칙' / '0.2° 격자 첫 파 도달 추정, 파고 아님'. 재해 칩이 켜진 동안 빈 곳을 누르면 Open-Meteo 지점 조회로 새지 않고 '이 자리에 활성 재해 사건 없음'을 같은 카드에 말한다. 무료 범위에 '내 장소까지 거리·폭풍경계역 포함 여부'(기존 for-me 계산)를 둔다.<br>⚠️ *말하면 안 되는 것:* 군집 FRP 를 '이 산불의 세기'라 말하지 않는다. 특보 면의 경계로 '구역 안/밖'을 말하지 않는다(면과 최근접 지점 판정이 어긋나면 판정이 우선). NHC 값(1분 평균 kt)을 환산해 KMA/JMA 와 같은 줄에 세우지 않는다. 쓰나미 값은 도달시각뿐 — 파고·침수 없음. ShakeMap·진도는 있는 사건에만, 한국·일본 진도는 지역명 문자열 그대로. EXPLORER 깊이(가장 가까… | 사건 종류별 필드 사전(지진 mag·depthKm·time / 태풍 스텝 h·windMs·hpa·validUtc\|validKst / 특보 zone·kind·level·issuedKst·effectiveKst / 낙뢰 tm·kA·type·ht / 산불 frp·peak·count·spanKm·firstSeen / 쓰나미 category·center·유효기간 + stations[].etaMin), 단위·자릿수, 정밀도 한계 문구, '미제공' 표기 규칙(JMA 중심… | (1)의 EventLayer 가 사건 객체 배열을 메모리에 들고 있을 것 · P0 셸의 Right Inspector · 클릭 분기에서 재해 칩 ON 동안 marineSelect/pointWeather(Open-Meteo) 우회 결정 · 특보 면 픽은 구역 id 래스터 자산 뒤. | FREE |
| **③ 출처** | 🟡 출처·시각은 '레이어 단위 카드'에만 있고 고른 사건 단위가 아니다. 선택 자료 헤더에 l.src · dataBadge(ui-shell.js:1244), 레이어 카드에 기관·수집시각: metaLightning(live-layers.js:692-701) · metaFire(:712-720) · metaW… | 같은 Inspector 의 ProvenanceCard 가 고른 사건마다 기관 · 배지(OBSERVED / OFFICIAL_FORECAST / OFFICIAL_WARNING / PROVIDER_FORECAST / SIMULATION_ONLY / HISTORY) · 시각 3종(사건·발표 시각 / EARTHUS 수집 시각 / 화면 수신 시각) · 해상도(12km 군집 · 0.2° 격자 · 10km 셀 · 근사 경계) · 라이선스 · 기관 원문 링크를 같은 자리에 낸다. 예: 'JMA · OFFICIAL_FORECAST · 발표 09-20 15:00 KST · 수집 15:12 · 풍속 10분 평균 · 출처표기', 'NASA FIRMS VIIRS NRT · OBSERVED · 수집 3시간 전 · 12km 군집', 'EARTHUS 계산 · SIMULATION_ONLY · 계산 09-20 05:20Z · GEBCO 0.2° · PTWC 게시문 대조 평균 차 N분'. PD 06 의 '공식 발표 시각·기관명 상시'는 Legend 옆 상주 한 줄로 충족하고, 거짓 문구 2건은 '표시색'·'5분 수집'으로 고친다.<br>⚠️ *말하면 안 되는 것:* 표시 지연(수집 5분+CDN+재수신)은 실측 전 UNKNOWN — '실시간'이라 쓰지 않고 자료 시각을 그대로 적는다. 25년 지진 번들은 '오늘'이 아니라 '2026-09-01 수집분'. 특보 해제 예정 시각은 자료에 없어 칸을 만들지 않는다(레지스트리 temporalMode 는 validToKst 를 언급 phenomenon-registry.js:806 — 검증된 분석과 어긋남, 대조… | 사건 종류별 출처표: 기관명(ko/en) · 배지 · 시각 필드 매핑(태풍 issued·validUtc\|validKst / 특보 issuedKst·effectiveKst / 낙뢰 tm·generated / FIRMS generated·firstSeen / USGS time·updated / 쓰나미 발표·유효기간·computedAt) · 해상도 문구 · 라이선스(USGS·NOAA 퍼블릭 도메인, 기상청 공공누리 1유형, JMA 출처 명기, FIRMS 출처표기,… | P0 Right Inspector · 수집기 문서가 generated·source 를 일관되게 실을 것(대부분 이미 실음) · 거짓 문구 2건 수정(S) · REFRESH_MIN 에 fireglobal·tyens 추가(S) · 기상청·산림청 범례색 대조(확인 전 '공식색' 금지). | FREE |
| **④ 시간축** | 🟡 화면의 타임 스트립은 하나다(ui-shell.js:1327-1362, 범위 −1440~+7200분·30분 스텝 :1334) → onTimeOffset → 구름 + liveLayers.setTimeOffset(main.js:4891-4899). 그러나 setTimeOffset 이 움직이는 재해 레이어는… | 시간축은 Global Timeline 하나. 재해 하위 레이어는 '시각 접근자'만 등록한다: 태풍=스텝 validUtc\|validKst → 리본 위 예보 위치 표식이 움직이고, 미래로 밀면 h=0 강풍역·폭풍역은 사라지고 점선 폭풍경계역만 남으며 ENS 멤버 점이 같은 시각으로 따라온다. 낙뢰=tm ≤ now+ms 필터(−60분), 지진=발생시각 필터(−24h/7일/30일 칩), 쓰나미=진원시각+등시선 레벨 ≤ now+ms 인 선만 보이는 전파 재생(SIMULATION_ONLY), 특보=발효 예정(점선)→발효(채움) 전환만, 산불=공개 롤업 뒤 24h 8프레임. '25 Years' 칩은 타임라인의 범위를 2001~자료 끝으로 교체하고 자막은 '2001 → 2026-09-01 수집분'. 시간에 반응하지 않는 레이어는 '이 자료는 HH:MM 관측에 고정' 칩을 띄운다.<br>⚠️ *말하면 안 되는 것:* 미래 쪽에 관측을 남기지 않는다(h=0 실황 면·'지금' 위치는 지금일 때만). NHC 는 현재점 하나라 스크럽 없음. 특보는 해제 시각이 없어 띠의 끝을 그리지 않는다. 지진·낙뢰·산불에는 예보 프레임이 없다 — 미래로 밀어도 새 점을 만들지 않는다. 낙뢰 실황 파일은 4,000건에서 오래된 것부터 잘려 −60분 초반이 빌 수 있다('오래된 N건 생략' 칩). 무료=공식 자료의 −24h~… | 레이어별 시각 접근자와 유효 범위: 태풍 steps[].t(−0~+120h, 기관별) · ENS members[].steps[].h · 낙뢰 tm(−60분, 일본 −30분) · 지진 time(−24h~−30d) · 쓰나미 origin+isoLevelMin(0~720분) · 특보 effectiveKst(시작만) · 산불 frames(롤업 뒤). 타임라인에 요구하는 모드 2개: 과거 분 단위 모드(−60분, 현 30분 스텝은 낙뢰에 거칠다)와 범위 교체 모드(20… | validKst 판독 수정(S — 이 메뉴의 첫 커밋) · P0 Single Timeline 의 과거 분 단위 모드·범위 교체 모드 · 산불 공개 롤업 events/wildfire-24h.json(S~M, 수집 주기 복원은 비용 결정) · 낙뢰 24h 점 이력 저장(M, 유료 재생용)… | FREE |
| **⑤ 비교** | 🟡 Compare workspace(split/wipe/diff)는 0건 — v2-three/js 의 compare 검색은 intel-feed·event-room·scenario-compare·research/workspace·main(액션 1개)뿐. 있는 것은 사건 방 카드 안의 표다: 태풍 회차↔회차(… | 상단 Compare 를 누르면 지금 보던 사건·카메라·시각 그대로 분할된다. 태풍 1순위 짝은 회차↔회차: 왼쪽=이전 발표, 오른쪽=최신 발표, diff 모드는 같은 예보시각 위치 이동 km·최대풍속 변화와 확률원 겹침을 그리고 회차 칩 두 개로 A/B 를 고른다. 2순위 기관↔기관 KMA\|JMA(같은 10분 평균 m/s 눈금, 확률원은 JMA 쪽에만 '미제공' 표기), 3순위 쓰나미 '공식 ETA(PTWC 게시문) \| EARTHUS 계산' — 연안 지점별 차(분)를 지점 마커 색과 표로. 헤더에 각 쪽의 발표 시각·기관·배지, URL 공유는 기존 ?event=&compare= 를 승계한다.<br>⚠️ *말하면 안 되는 것:* GFS\|ECMWF 같은 모델 격자 비교는 이 메뉴에 격자장이 없어 성립하지 않는다(02 Wind 겹치기로만). JTWC 는 수집 불가(403)라 칩을 만들지 않는다. 한 사건의 오차로 기관의 우열을 말하지 않는다(기존 검증표 규칙 승계 — 리드타임이 다른 오차를 섞어 순위 매기지 않음). ENS 멤버는 '51개 중 파일에 담긴 N개'이고 평균 트랙이 아니다. 특보는 한국 기관이 하나라 기… | 비교 짝 목록과 가용성(compareChoice 참조) · 짝마다의 diff 정의(트랙: 같은 h 의 대권 거리 km + 풍속 차 / ETA: 지점별 diffMin / 지진: 규모 차·진앙 거리 km) · 공통 눈금(풍속 17·25·33·44·54) · 짝이 성립하지 않을 때의 사유 문구('첫 회차 — 비교 대상 없음', '공식 ETA 대조 불가 — 게시문 없음', 'NHC 는 다른 해역·현재점 하나 — 나란히 비교 대상 아님') · 회차 아카이브 source… | P1 Compare workspace · (1)의 태풍 렌더가 기관을 인자로 받아 두 번 그릴 수 있을 것(첫 기관 고정 :2804 해제) · 발표 회차 아카이브 색인 파일(S — 객체는 있고 색인만 없음) · quake-asia 를 지구 레이어로 연결(지진 기관 비교용) · 산불 시… | PRO |
| **⑥ Intelligence** | 🟡 패킷 호스트는 태풍·지진 둘뿐이다(main.js:4098-4112). 지진 패킷은 피드가 ocean/earthquake-intel.json 을 한 번 받아 두고 USGS id 로 꺼낸다(intel-feed.js:29, :105-106, :121-123). 띠는 선택 현상 헤더 아래에 붙고(ui-shel… | 사건 선택 → Inspector 에 수치(ValueCard) → 출처(ProvenanceCard) → 그 아래 Intelligence 문장, 탭은 Now / Forecast / Climatology / Analysis. 확률 문장 예(근거가 패킷에 있는 것만): 'JMA 는 +72h 중심이 이 원(반경 260km) 안에 들 확률을 70%로 발표했다 — JMA 확률원 · 09-20 15:00 KST 발표', 'ECMWF ENS 파일에 담긴 N개 멤버 중 M개가 +72h 에 내 장소 300km 안을 지난다 — 멤버 비율이며 보정된 확률이 아님(PROVIDER_FORECAST)', '본진 뒤 1~7일 M4 이상 여진 기대 3.2회 · 실제 2회 — EARTHUS Reasenberg–Jones 일반형(지역 보정 없음), 직전 구간 0~1일은 기대 5.1·실제 4'. 원인 문장 예(측정된 조건+문헌 기작 — attribution[] 신설 뒤): '중심 아래 해수면 온도 29.1°C(관측) — 약 26.5°C 이상 해역에서 열대저기압이 발달·유지된다는 문헌 기작에 해당하는 조건이 측정됨', 특보 '이 구역 AWS 3시간 강수 72mm(기상청 AWS 14:00) — 기상청 호우주의보 발표 기준에 해당하는 값이 관측됨(기준 수치는 기상청 고시 원문을 패킷에 옮겨 싣는다)'. 패킷 생산자가 없는 낙뢰·산불·쓰나미는 같은 자리에 '이 현상은 아직 분석 패킷이 없습니다 — 수치와 출처만 보여 줍니다'. Climatology 탭에 tyanalog(sample·bins·recurve 만)와 25년 지진 반경 통계를 옮긴다.<br>⚠️ *말하면 안 되는 것:* 지금 계약 v1 은 인과 어휘를 서버에서 거부한다 — attribution[]·probability[] 는 계약 개정 전에는 화면에 나올 수 없다. ENS 멤버 비율에 %를 붙여 '확률'이라 부르지 않는다(수집기 스스로 금지). RJ 기대수를 Poisson 으로 바꾼 '여진 확률 N%'는 패킷에 없는 새 계산 — 생산자가 계산·채점(Brier)한 뒤에만. 산불 발화 원인(FIRMS 는 열점… | 패킷 생산자 현황: 태풍(aws/cyclone-analog intel_v1)·지진(aws/lab-events intel_quake) 있음 / 신규 후보 = 특보(kma-warn × kma-aws 실황값 대 발표 기준표 조인), 쓰나미(tsunami-intl × tsunami-eta: 공식 분류·ETA 대조), 산불(wildfire.json 군집 변화: FRP·탐지 수 증감 — 원인 없음). probability[] 재료: JMA 확률원 70%(기관 확률), E… | 인텔 계약 v1 개정(attribution[]·probability[] 필드와 FORBIDDEN_CAUSAL 예외 규칙 — PD 결정·계약 문서) · P1 Intelligence inspector · intelHostFor 에 현상 분기 추가 또는 레지스트리 intelligence 플… | EXPLORER |
| **⑦ Simulation** | 🟡 입구가 현상마다 다르고 둘은 아예 없다. 쓰나미: SIM_CAPABILITIES AVAILABLE(sim-questions.js:58-78) → 질문을 누르면 시나리오 탭의 안내 카드(main.js:4564-4577) → 사건 방에서 연안 ETA·PTWC 대조(event-room.js:260-284)와… | 여섯 현상 모두 Inspector 맨 아래 같은 자리에 'Simulation →' 입구가 있고, 누르면 지금 상태(사건 id·카메라·시각·켜진 칩)를 스냅샷으로 들고 작업 공간으로 간다. 쓰나미가 기준 구현체다: Current(이 지진의 실제 계산본 — 등시선 6단색+연안 38곳 ETA) → Baseline(PTWC 게시문 ETA, 없으면 '게시문 없음') → Scenario 칩('이 사건' / '최근 30일 다른 사건' / '가정 진원 프리셋' — 슬라이더 없음) → Result(지점별 ETA absolute + 기준 대비 delta 분) + SimulationRunRecord(runRef tsunami-eta:{usgsId}). 태풍은 같은 틀에 'ENS 실제 멤버를 시나리오로 고르기(서쪽/중앙/동쪽 → 내 장소 최근접 거리)'를 PROVIDER_FORECAST 배지로, 바다 가정 장면은 Preview 로 남기되 슬라이더를 칩으로 바꾼다. 지진·산불·낙뢰·특보는 입구는 같고 눌렀을 때 사유를 말한다: '여진 기대수는 채점 이력 공개 기준 결정 뒤', '확산 계산 엔진 없음', '뇌우 이동 계산 엔진 없음 — 뇌우 가능 구역은 04 Clouds 예보', '특보는 기관의 판단 — 시뮬레이션 대상 아님'.<br>⚠️ *말하면 안 되는 것:* 진짜 계산은 쓰나미 도달시각 1건뿐 — 파고·침수·피해는 계산하지 않는다. 계산본을 공식 경보처럼 읽히게 하지 않는다(공식 발표가 항상 위, SIMULATION_ONLY 고정). 가정 진원 프리셋은 '실제 지진 아님'을 화면에 고정. 태풍 이동을 우리가 계산하지 않는다 — ENS 멤버 선택은 SIMULATION 배지를 받지 않고, 바다 가정 장면은 Preview(기록 남는 계산 아님)이며… | SIM_CAPABILITIES 항목 6개(쓰나미 available · 태풍 limited+preview · 지진 not_available(엔진 후보 명시) · 산불 not_available · 낙뢰·특보 신규 not_available + 사유 문구) · 스냅샷 필드(eventId·camera·timeOffset·activeChips·agency) · 쓰나미 시나리오 칩 정의와 프리셋 진원 표(신규 — 위치·규모의 문헌 근거 필요) · Result 표 스키마(지… | P2 Simulation workspace · SIM_CAPABILITIES 에 낙뢰·특보 항목 추가(S) · 쓰나미 프리셋 진원 사전계산(수심이 고정이라 1회 계산 파일로 가능, S~M · 프리셋 선정 PD 결정) · tsunami-reach 요금 문 정리(PD 결정: 실제 사건 계… | PRO |

- **⑤ 비교 짝:** 1순위(지금 자료로 바로 됨) — 태풍 회차↔회차(최신 발표 \| 이전 발표): 사건 패킷 revisions[] 와 불변 아카이브 sourceRef 가 이미 있고, 표·변경 목록·이전 회차 트랙 겹치기·공유 URL 까지 돌아간다(intel-feed.js:605-637, :537, :623). Compare workspace 에 올리면 split(왼쪽 이전 / 오른쪽 현재)과 diff(같은 예보시각 위치 이동 km · 최대풍속 변화)가 새 자료 없이 성립한다. 남은 일은 칩 두 개 선택 UI(main.js:4853-4855 가 '다음 단계'로 미뤄 둠)와 작업 공간 자체.<br>2순위 — 태풍 기관↔기관 KMA \| JMA: 같은 패킷 agencies 에 두 기관 h0/h24 가 있고(compareHtml :615-621 이 둘 다 돈다) typhoon-official.json 도 agencies[] 를 주지만, 지구는 첫 기관만 그린다(live-layers.js:2804) → 렌더가 기관을 인자로 받게 고쳐야 한다. 두 기관 모두 10분 평균 m/s 라 같은 눈금이 정직하다. 확률원은 JMA 쪽에만 있고 KMA 쪽은 '미제공(수집 안 됨)'.<br>3순위 — 쓰나미 공식 ETA(PTWC 게시문) ↔ EARTHUS 계산: 파일에 official.compare[].diffMin 이 이미 있다(event-room.js:272-274). 게시문이 없는 사건은 '공식 ETA 대조 불가 — 게시문 없음'(기존 문구).<br>4순위 — 관측/공식 ↔ 모델: 공식 트랙 ↔ ECMWF ENS 멤버(events/typhoon-ecmwf.json, PROVIDER_FORECAST, '51개 중 파일에 담긴 N개'). 자료는 있고 높이 통일(aboveCloudsR)만 필요.<br>5순위 — 지진 기관↔기관 USGS ↔ 기상청/JMA(규모 차·진앙 거리): quake-asia 자료는 있으나 v2 에서는 내 장소 카드에만 연결(main.js:3419) — 지구 레이어 연결 뒤.<br>6순위 — 시각↔시각: 특보(에피소드 760일 이력으로 '어제 이 시각 \| 지금'), 산불(공개 롤업 wildfire-24h 뒤), 낙뢰(점 이력 저장 뒤).<br>지금도 앞으로도 안 되는 것: GFS\|ECMWF 격자 비교(이 메뉴에 격자장 없음 — 02 Wind 겹치기로만), JTWC(403 수집 불가), NHC 와 KMA/JMA 나란히(다른 해역 · 현재점 하나 · 1분 평균 kt), 특보 기관↔기관(한국은 기상청 하나 · NWS/JMA 는 다른 나라), 산불·낙뢰의 모델 짝(모델이 없다). 없는 짝은 만들지 않고 Compare 입구에서 사유를 말한다.
- **⑦ 시나리오:** 있는 엔진 1순위 = aws/tsunami-eta(√(g·h) · GEBCO 0.2° Dijkstra · 연안 38곳 · 30~720분 등시선 · 15분 스케줄). SIM_CAPABILITIES 에서 유일한 AVAILABLE(sim-questions.js:58-78)이고 PTWC 게시문 대조까지 파일에 있다(event-room.js:272-274). 재해 메뉴 (7)의 기준 구현체로 쓴다: Current=선택 지진의 실제 계산본 → Baseline=PTWC 게시문 ETA → Scenario 칩 ①'이 사건'(지금 됨) ②'최근 30일 다른 사건 계산본'(색인 ocean/tsunami-eta.json, 지금 됨) ③'가정 진원 프리셋'(수심 격자가 고정이므로 프리셋 진원별 1회 사전계산 파일로 가능 — 신규 S~M, '실제 지진 아님' 라벨 고정, 프리셋 위치·규모는 문헌 근거와 PD 결정 필요) → Result=연안 ETA(absolute)+기준 대비 차(delta 분). 파고·침수는 계산하지 않는다. 404=계산 대상 아님(M6.5 이상 · 깊이 100km 이하 · 바다 지진만)이며 '위험 없음'이 아니다.<br>2순위(LIMITED) = 태풍. 우리 이동 계산 엔진은 없다(sim-questions.js:79-96). 지금 있는 것은 공식 +24h 를 기준선으로 한 sim-ocean Gerstner '가정 장면'(Preview · 기록 남는 계산 아님 · main.js:4580-4609)이고, 풍속→파고는 가정표 TY_CAT(:2981-2984), 본문이 '슬라이더는 편차'(:4586)라 PD 금지(슬라이더)와 충돌 → 칩(기준선 / 풍속 ±5 m/s / 눈까지 50·100·200km)으로 교체. 정직한 시나리오 후보는 '우리 계산'이 아니라 ECMWF ENS 실제 멤버를 시나리오로 고르는 것(서쪽/중앙/동쪽 멤버 → 내 장소 최근접 거리·시각) — PROVIDER_FORECAST 배지, SIMULATION 배지 금지, 멤버 비율은 확률이 아님. PRO 깊이로 tropical-guidance-v2(15일)는 v2-three 미연결(검증된 분석 기준).<br>3순위 후보 = 지진 여진 기대수. aws/lab-events 의 rj_expected(Reasenberg–Jones 1989 일반형, handler.py:218-223)와 구간별 실제 수 대조(:246-253)가 이미 돌고, 인텔 패킷 WHAT 에 실려 화면에 나온다(intel-strip.js:160-168). 그런데 SIM_CAPABILITIES 는 eq-aftershock 을 NOT_AVAILABLE('채점 이력을 갖춘 뒤 공개')로 선언(sim-questions.js:239-252) — 표와 화면이 어긋난다. 승격(LIMITED/AVAILABLE) 기준은 PD·계약 결정. 캘리포니아 일반 매개변수라 지역 보정 없음을 항상 적는다.<br>엔진 없음 = 산불 확산(NOT_AVAILABLE :168-180). 재료는 prototype/js/earthus2/v11/environment/transport-simulator.js 의 advectPoint(RK2 이류 · vectorProof 필수 · 출력 라벨 MODELLED_TRANSPORT)와 비공개 aws/atmos-transport-spike(Open-Meteo 바람 → 유료 화면 불가 · 스스로 '연기 예측 아님' 선언)뿐. 02 Wind 의 GFS u/v 가 생긴 뒤 '연기 이동 민감도 경로'로만 가능하고 불 번짐은 말하지 않는다.<br>입구 자체가 없음 = 낙뢰 · 특보. SIM_CAPABILITIES 에 키가 없어 질문 블록이 안 그려진다(ui-shell.js:1205). NOT_AVAILABLE 항목 2개를 추가(S)해 같은 자리에 입구를 세우고 사유를 말한다: 낙뢰 '뇌우 이동 계산 엔진 없음 — GFS 파생 뇌우 가능 구역은 04 Clouds 예보', 특보 '특보는 기관의 판단 — 시뮬레이션 대상 아님'.<br>무관/미연결: services/research-runtime(해양 표류 실험)은 이 메뉴 현상이 아니고, scenario-compare.js(기준 실행 vs 가지 실행 비교)는 v2-three/js 어디서도 import 되지 않는다 — 쓰나미 프리셋이 생기면 Result 의 delta 표에 재사용 후보.
- **첫 단면(7단계를 전부 관통하는 가장 얇은 출시):** 단면 이름: '지진 1탭 → 쓰나미 도달시간'. 재해 메뉴에서 (7)이 진짜 AVAILABLE 이고 (6)에 채점 구간이 있는 패킷이 있고 (5)에 실제 diff 자료가 있는 유일한 사슬이며, M4.5 이상 지진은 매일 있어 태풍 비수기에도 시연된다(쓰나미 계산본은 색인이 최근 30일을 들고 있다).<br>넣는 것:<br>(1) hazards/eq 1탭 → USGS 4.5_day 전건을 WebGL 점으로(makeCyclones 의 aSize 셰이더 재사용 live-layers.js:627-659, 규모 4단 크기 × 깊이 7단 '구간 고정' 색, surfR). 14건 절단·400km 숨김·규모 기반 자체 경보색 제거. 공용 Legend 의 첫 구현(크기 · 깊이 7단 · USGS · 수집시각)과 0건 칩.<br>(2) 점 픽(메모리 배열 최근접 · 네트워크 0) → Inspector.ValueCard 'M · 깊이 · 발생시각 UTC/KST' + 한계 한 줄. 재해 칩이 켜진 동안 빈 곳 클릭이 marineSelect(Open-Meteo)로 새지 않게 우회.<br>(3) ProvenanceCard: USGS · OBSERVED · 발생/갱신/수집 시각 · public domain · 원문 링크(피드 p.url 이미 있음 intel-feed.js:400).<br>(4) 기존 슬라이더의 −24h 구간으로 발생시각 ≤ now+ms 필터, 쓰나미 계산본이 있는 사건은 진원시각+등시선 레벨 ≤ now+ms 인 선만 보이는 전파 재생. 새 슬라이더 0개.<br>(5) Compare 입구 → '공식 ETA(PTWC 게시문) ↔ EARTHUS 계산' 지점별 diff 표(official.compare[].diffMin 이미 있음). 게시문이 없으면 '대조 불가' 사유. split/wipe 는 입구만.<br>(6) 지진 패킷 WHAT(RJ 기대수 대 실제 · 모형 주석)을 '수치 → 출처 → 문장' 순서로 재배치. 패킷이 없는 사건은 '본진 30일 밖이거나 대상 아님'.<br>(7) Simulation 입구 → 스냅샷(사건 id · 카메라 · 시각) → Current(이 사건 계산본) → Baseline(PTWC) → Scenario 칩('이 사건'만 활성, '가정 진원 프리셋'은 사유와 함께 비활성) → Result(연안 38곳 ETA 표 + 등시선 6단색). 계산 대상이 아닌 지진은 '계산 대상 아님 — 위험 없음이 아님'.<br>같이 넣는 S 수정(나머지 다섯 현상을 여는 열쇠): ① 태풍 스텝 시각 validKst 판독(live-layers.js:2832) ② 거짓 문구 2건 — '기상청 공식 특보 색'(:740)→'표시색', 낙뢰 '10분 주기'(:699)→5분 ③ SIM_CAPABILITIES 에 낙뢰·특보 NOT_AVAILABLE 항목과 사유 ④ REFRESH_MIN 에 fireglobal·tyens 추가 ⑤ 다섯 현상의 빈 상태 칩과 (5)(6)(7) 입구·사유 문구를 같은 자리에.<br>미루는 것(입구와 사유만 선다): 태풍 리본·확률원·강풍역/폭풍경계역(L — 굵은 선·면·라벨 공용 부품 뒤), 특보 구역 면(L — 매칭률 검증과 구역 래스터 도구 뒤), 낙뢰 나이색·G/C 모양·10km 셀(M), 산불 FRP 5단·한국 위험지수 면(M), 등시선·등진도선 숫자 라벨과 굵기(라벨·굵은 선 부품 뒤), 25년 타임라인 범위 교체, KMA\|JMA split, 가정 진원 프리셋 사전계산, attribution[]·probability[] 계약 개정.
- 비고: 읽기 전용으로 수행 — 파일 수정·커밋·배포 없음. nowEvidence 의 파일:줄은 이번에 직접 열거나 Grep 으로 확인한 것만 적었고, 수집기 쪽 세부(handler.py 줄 번호 대부분)·라이선스·자료 필드는 '검증된 분석'을 재료로 target/menuSupplies 에만 썼다.<br>코드와 결정이 어긋나는 곳(조용히 고르지 않고 올린다 — PD 결정 필요):<br>1. 쓰나미 도달시간의 요금 문이 둘이다. 추천 질문 tsunami-reach 는 유료 모드에서 PRO 로 잠그는데(main.js:4732-4739, TIER.INTELLIGENCE) 사건 방의 같은 ETA 행은 잠금 없이 나온다(event-room.js:260-284). PD 원칙(안전 정보는 무료)과 검증된 분석(등시선·연안 ETA 무료)에 맞춰 '실제 사건 계산본 열람=FREE, 시나리오·비교·기록·export=PRO'를 제안.<br>2. 지진 여진 기대수: SIM_CAPABILITIES 는 NOT_AVAILABLE('채점 이력 뒤 공개' sim-questions.js:239-252)인데 같은 값이 인텔 패킷 WHAT 으로 이미 화면에 나온다(intel-strip.js:160-168, aws/lab-events/handler.py:218-223). 표와 화면을 맞추는 결정 필요.<br>3. 레지스트리 intelligence:true 인데 패킷 호스트가 없는 현상 3개(산불 :105 · 쓰나미 :81 · 특보 :803) — 띠가 빈 문자열이라 사용자에게는 '아무 일도 없음'. 생산자를 만들거나 플래그를 내린다.<br>4. 인텔 계약 v1 은 인과 어휘를 서버에서 거부한다(aws/_shared/intel_contract.py:55, :76-81). '원인과 확률을 말한다'는 목표는 attribution[]·probability[] 계약 개정이 선행 조건이다. 그 전까지 (6)의 원인 문장은 '함께 나타난 조건'으로만 나간다. ENS 멤버 비율은 수집기 스스로 '보정된 확률 아님'이라 못박았다(aws/tropical-intelligence/handler.py:17, :601).<br>5. weather.warning 레지스트리 temporalMode 가 validToKst 를 말한다(phenomenon-registry.js:806) — 검증된 분석은 kma-warn 에 해제 예정 시각이 없다고 확정. 레지스트리 문구 대조 필요(어느 쪽이 맞는지 이번에 수집기를 열어 재확인하지는 않았다).<br>6. 태풍 시나리오 탭 본문이 '슬라이더는 편차'(main.js:4586) — PD 금지(메뉴마다 슬라이더)와 충돌, 칩으로 교체.<br>PD 06 에 자리가 없는 재해 묶음 멤버(MENU_GROUPS hazard, phenomenon-registry.js:1080-1084) — 억지로 끼우지 않고 제안만: hazards.crustal_motion·land.crustal_motion → 지진의 컨텍스트 토글(판 경계선 옆)로 MERGE / ocean.coastal_inundation(khoaflood) → Hazards 의 '연안 침수' 사건 칩으로 남길지 05 Ocean 해수면 상승과 묶을지 / hazards.glacial_lake_flood → availability 'planned'·자료 미유입이라 레일에서 숨김(REMOVE until data). 셋 다 'PD 결정 필요'.<br>(1)을 PARTIAL 로 둔 이유: 다섯 현상은 1탭에 자료가 지구에 찍히기는 한다. 다만 심각도 구간색·Legend·숫자 라벨·빈 상태 칩은 0이고 지진은 1탭에 아무것도 안 켜지므로 PARTIAL 의 하한이다. (2)는 main.js 클릭 경로에 재해 픽이 전무하고 Open-Meteo 호출로 새므로 MISSING(피드 DOM 비컨은 예외로 적음).<br>W0~W10 선행 작업 번호의 정의는 이 작업자에게 전달되지 않았다 — dependsOn 은 번호 대신 내용(굵은 선 부품 · 라벨 부품 · 정점별 크기 점 · 구역 래스터 · P0 타임라인 모드 · 계약 개정 등)으로 적었다. 번호 매핑은 UNKNOWN.<br>관련 파일(절대경로): D:\## APP\EARTHUS v2_APP\prototype\v2-three\js\main.js · live-layers.js · intel-feed.js · event-room.js · intel-strip.js · intel-questions.js · sim-questions.js · ui-shell.js · quake-history.js · scenario-compare.js · phenomenon-registry.js / D:\## APP\EARTHUS v2_APP\aws\lab-events\handler.py · aws\tsunami-eta\handler.py · aws\typhoon-official\handler.py · aws\tropical-intelligence\handler.py · aws\atmos-transport-spike\handler.py · aws\_shared\intel_contract.py / D:\## APP\EARTHUS v2_APP\prototype\js\earthus2\v11\environment\transport-simulator.js

<details><summary>descriptor 초안</summary>

```js
{
  id: 'menu.hazards', rail: 6, label: { ko: '재해', en: 'Hazards' }, grammar: 'event-first', safetyInfoFree: true,
  chips: ['typhoon', 'warning', 'lightning', 'wildfire', 'earthquake', 'tsunami'],   // 1탭 = 활성 사건이 있는 칩 ON, 0건이면 빈 상태 칩
  unplaced: ['hazards.crustal_motion', 'land.crustal_motion', 'ocean.coastal_inundation', 'hazards.glacial_lake_flood'],   // MENU_GROUPS hazard 멤버(phenomenon-registry.js:1080-1084) 중 PD 06 에 자리 없음 — PD 결정 필요
  renderer: { kind: 'EventLayer', radius: { sky: 'aboveCloudsR', ground: 'surfR' }, blending: 'normal', sizedPoints: 'aSize shader', ribbonMinPx: 3 },
  events: {
    'hazards.typhoon': {
      source: { url: '/events/typhoon-official.json', agencies: ['KMA', 'JMA'], pointOnly: ['NHC'], badge: 'OFFICIAL_FORECAST', refreshMin: 30 },
      time: { keys: ['validUtc', 'validKst'], mode: 'forecast-steps' },
      track: { past: 'solid(아카이브 h=0 롤업 또는 GDACS 표기)', forecast: 'dashed', colorBy: 'windMs', bands: [17, 25, 33, 44, 54], unit: 'm/s', legendNote: '풍속 평균시간 KMA·JMA 10분 / NHC 1분' },
      cone: { field: 'circleKm', agencies: ['JMA'], label: 'JMA 70% 확률원 — 태풍 크기 아님', missing: { KMA: '확률원 미제공(수집 안 됨)' } },
      windArea: { onlyAt: 'h=0', gale: { field: 'galeArea', color: 'yellow' }, storm: { field: 'stormArea', color: 'red' }, asymmetric: true },
      watchArea: { when: 'h>0 && stormIsWatch', style: 'dashed-outline', name: '폭풍경계역(JMA 예보·진로 불확실성 포함)' },
      ensemble: { url: '/events/typhoon-ecmwf.json', badge: 'PROVIDER_FORECAST', label: '51개 중 파일에 담긴 N개', license: 'CC-BY-4.0' },
      labels: { rule: '날짜가 바뀌는 첫 스텝 + 마지막 스텝', fmt: 'D일 HH시 · NN m/s' },
      climatology: { url: '/ocean/cyclone-analog.json', use: ['sample', 'bins', 'recurve'], exclude: ['guidance', 'steering'] },   // Open-Meteo 파생 제외
      empty: '현재 활성 태풍 없음 · KMA/JMA/NHC · 확인 HH:MM',
    },
    'weather.warning': {
      source: { url: '/events/kma-warn.json', badge: 'OFFICIAL_WARNING', refreshMin: 10, license: '공공누리 1유형' },
      geometry: { kind: 'zoneIdRaster+terrainDrape', legendNote: '근사 경계 — 기상청 공식 구역 폴리곤 미제공', seaZones: 'icon-only', unmatched: 'icon-only' },
      levels: ['주의보', '경보', '중대경보'], levelStyle: ['옅은 채움+1.5px', '진한 채움+3px', '진한 채움+이중 외곽선'],
      colorName: '표시색',   // 기상청 범례 대조 전 '공식색' 표기 금지
      states: { upcoming: 'dashed-outline', active: 'fill' }, noValidTo: true,
      history: { url: '/events/kma-warn-episodes.json', days: 760, endIsObserved: true },
      empty: '현재 유효 특보 없음 · 기상청 · HH:MM',
    },
    'hazards.lightning': {
      source: { url: '/events/kma-lightning.json', badge: 'OBSERVED', refreshMin: 5, windowMin: 60 },
      extra: { url: '/events/lightning.json', region: 'JP', windowMin: 30, typeUnknown: true, glyph: 'neutral' },
      ageBandsMin: [0, 10, 20, 30, 45, 60], ageRecalcSec: 30,
      shape: { G: 'filled(+0~10분 확산 링)', C: 'hollow(기본 흐림 · 토글)' },
      sizeBy: { field: '|kA|', bands: [20, 50], only: 'G' },
      zoomOut: { cellKm: 10, countBands: [1, 5, 10, 25, 50, 100], producedBy: 'collector(잘림 전 전체 자료)' },
      truncatedChip: '오래된 N건 생략', empty: '최근 60분 낙뢰 0회 · 기상청 · HH:MM 관측',
    },
    'hazards.wildfire': {
      hotspots: { url: '/events/wildfire.json', badge: 'OBSERVED', refreshMin: 60, frpBandsMW: [30, 100, 300, 1000, 3000], sizeAndColor: 'same-5-bands', legendNote: '12km 군집 합산 FRP · 열점 ≠ 산불 · 구름 가림 · VIIRS NRT', newRing: '첫 탐지 24시간 이내(EARTHUS 수집 기준)' },
      riskKR: { url: '/events/forest-fire-kr.json', badge: 'OFFICIAL_FORECAST', steps: ['1단계', '2단계', '3단계', '4단계'], geometry: 'zoneIdRaster(특보와 공용)', unmatched: 'list-only' },
      perimeter: null,   // 자료 없음 — 범례에 'hot spot only — 화선 자료 없음'
      frames: { url: '/events/wildfire-24h.json', status: 'NOT_BUILT' },
    },
    'hazards.earthquake': {
      source: { urls: { '24h': 'USGS 4.5_day', '7d': 'USGS 4.5_week', '30d': 'USGS 4.5_month' }, badge: 'OBSERVED', refreshMin: 10, license: 'public domain' },
      sizeBy: { field: 'mag', bands: [4.5, 5, 6, 7] }, colorBy: { field: 'depthKm', bands: [0, 25, 50, 100, 200, 400, 800], stepped: true },
      label: { when: 'mag>=6', fmt: 'M6.8' }, ring: { when: 'age<=60min' }, modes: ['Live', '25 Years', 'Depth'],
      history: { asset: 'quakes.bin', caption: '2001 → 2026-09-01 수집분', timeline: 'range-swap' },
      shakemap: { product: 'cont_mmi.json', missingText: '이 사건은 USGS ShakeMap 없음' },
      regional: { url: '/events/quake-asia.json', intensity: 'text-only', separateChip: true }, context: { plates: 'toggle' },
    },
    'hazards.tsunami': {
      bulletins: { url: '/events/tsunami-intl.json', badge: 'OFFICIAL_WARNING', refreshMin: 10, iconBy: 'category(Warning/Advisory/Information)', greyNote: '회색 = 유효 경보 아님' },
      eta: { index: '/ocean/tsunami-eta.json', perEvent: '/ocean/tsunami-eta/{usgsId}.json', badge: 'SIMULATION_ONLY', isoBandsMin: [60, 120, 180, 300, 480], isoLabel: true,
             stations: { first: 'KOR', fmt: '부산 +95분', nullRule: 'skip' }, limits: ['파고·침수 아님', '0.2° 격자', '진원은 점'], notFound: '계산 대상 아님 — 위험 없음이 아님' },
      empty: '유효기간이 확인된 쓰나미 발표 없음 · NOAA/PTWC · HH:MM 수집 — 경보 유무는 기관 원문 확인',
    },
  },
  inspector: { value: 'in-memory event object (network 0)', precisionNotes: true, emptyClick: '이 자리에 활성 재해 사건 없음', noOpenMeteoFallback: true,
               provenance: ['agency', 'badge', 'eventOrIssuedAt', 'collectedAt', 'receivedAt', 'resolution', 'license', 'officialUrl'] },
  timeline: { single: true,
              accessors: { typhoon: 'steps[].t', ensemble: 'members[].steps[].h', lightning: 'tm', earthquake: 'time', tsunami: 'origin+isoLevelMin', warning: 'effectiveKst(시작만)', wildfire: 'frames(롤업 뒤)' },
              needs: ['past-minute mode(−60분)', 'range-swap(2001~자료 끝)'], fixedChip: '이 자료는 HH:MM 관측에 고정' },
  compare: [
    { pair: 'run↔run', of: 'typhoon', ready: true, diff: '같은 h 의 위치 이동 km + 풍속 차' },
    { pair: 'agency↔agency', of: 'typhoon', a: 'KMA', b: 'JMA', ready: 'render-fix(첫 기관 고정 해제)' },
    { pair: 'official↔computed', of: 'tsunami.eta', a: 'PTWC 게시문', b: 'EARTHUS', ready: true, diff: 'station diffMin' },
    { pair: 'official↔model', of: 'typhoon', a: 'official track', b: 'ECMWF ENS members', ready: true },
    { pair: 'agency↔agency', of: 'earthquake', a: 'USGS', b: 'KMA/JMA', ready: 'wire quake-asia' },
    { pair: 'time↔time', of: ['warning', 'wildfire', 'lightning'], ready: ['episodes', 'after-rollup', 'after-history-store'] },
  ],
  intel: { hosts: { 'hazards.typhoon': 'ocean/cyclone-events/{id}.json → intel', 'hazards.earthquake': 'ocean/earthquake-intel.json → packets[usgsId]' },
           missingProducers: ['weather.warning', 'hazards.tsunami', 'hazards.wildfire'], none: ['hazards.lightning'],
           order: ['value', 'provenance', 'sentence'], tabs: ['Now', 'Forecast', 'Climatology', 'Analysis'],
           probability: [{ kind: 'agency', src: 'JMA circleKm 70%' }, { kind: 'ensemble-share', src: 'ECMWF ENS', calibrated: false }, { kind: 'scored-model', src: 'RJ expected M4+ count', unit: 'count' }],
           attribution: [{ condition: 'sstAtCenter', mechanism: 'citation required' }, { condition: 'AWS 실황값', mechanism: '기상청 특보 발표 기준표' }],   // 계약 v1 개정 뒤
           tiers: { WHAT: 'FREE', NEXT: 'FREE', EVIDENCE: 'FREE', WHY: 'EXPLORER', IMPACT: 'EXPLORER' } },
  simulation: { entry: 'same-slot-for-all-6', snapshot: ['eventId', 'agency', 'camera', 'timeOffset', 'activeChips'],
                capabilities: { 'hazards.tsunami': 'available', 'hazards.typhoon': 'limited(+preview)', 'hazards.earthquake': 'not_available(RJ 엔진 있음 — 승격 결정 대기)', 'hazards.wildfire': 'not_available', 'hazards.lightning': 'ADD not_available', 'weather.warning': 'ADD not_available' },
                tsunamiScenarioChips: ['이 사건', '최근 30일 다른 사건', '가정 진원 프리셋(사전계산 · 실제 지진 아님)'], result: ['etaMin(absolute)', 'deltaMin(vs baseline)'],
                runRecord: 'SimulationRunRecord(runRef tsunami-eta:{usgsId})', noSliders: true },
  tiers: { FREE: ['render', 'value', 'provenance', 'official timeline −24h~+5d', 'computed ETA view', '내 구역·내 장소 거리', '공식 알림'],
           EXPLORER: ['history rewind', 'revision compare card', 'intel WHY/IMPACT', '짧은 리포트', '개인화 조건 알림'],
           PRO: ['compare workspace', 'ENS + 15d guidance', 'scenario workspace', 'export'] },
}
```

</details>

#### 07 Air Quality 대기질

| 단계 | 지금 | 끝났을 때 사용자가 보고 하는 것 | 이 메뉴가 공급할 것 | 선행 | 요금 |
|---|---|---|---|---|---|
| **① 극적으로 보인다** | 🟡 그려지긴 하지만 PD 금지 표현(연속 그라데이션 단독·무숫자 점)이다. prototype/v2-three/js/live-layers.js:515-516 pm25grid·uvgrid 가 /wind/air.json(5°) 하나를 받고 :585-586 buildField(data,'pm25'\|'uv',RA… | 좌측 레일 07 을 1탭 → 3초 안에 PM2.5 6단 구간색(0~15 #2FBF71 α0.18 · 15~25 #F2E14B · 25~50 #F7B733 · 50~75 #F2762E · 75~150 #D7263D · ≥150 #7A1E5C)이 지형에 드레이프되어(1.0746 껍질 폐기) 깨끗한 태평양은 거의 맨 지구로, 인도-갠지스·화북·사하라 먼지대는 경계가 끊긴 주황~자주 덩어리로 보인다. 0.4°(임시 0.5°) 자료가 있는 곳에서만 25·50·150 흰 등치선과 지구 위 숫자 라벨('50')이 붙는다. 한반도를 확대하면 측정소가 흰 테두리 원+숫자(µg/m³, 색면과 같은 LUT — 통합지수 등급색 폐기)로, 축소하면 시도 채움 '서울 38 · 측정소 n곳 평균'으로 바뀐다. 상단 물질 칩(1차 PM2.5·PM10)을 1탭 전환하고 범례는 '모델 / 관측' 두 줄, 슬라이더는 없다. UV 칩(PD 결정 시)은 기본 '오늘 최대' 5단 위도 띠라 밤에도 빈 지구가 아니다.<br>⚠️ *말하면 안 되는 것:* 5° 자료 위에는 등치선·숫자 라벨을 그리지 않는다(격자 모양 다각형이 된다). 5° 값을 보간해 0.4° 처럼 보이게 하면서 해상도를 숨기지 않는다 — 임시 기간 범례에 '5° 격자(한 칸 약 550km) · Open-Meteo 경유(CAMS)'를 그대로 적는다. 구간색은 '농도 구간'이지 환경부·WHO '등급'이 아니다(등급은 Inspector 에 기관 원문 인용만). dust 는 먼지… | ① 물질별 구간표·색·알파(PM2.5 6단 확정안, PM10·O3·NO2 구간값은 PD 결정) ② 등치선 레벨 [25,50,150] 과 해상도 게이트(contourMinResDeg 0.5 — 5° 에서는 등치선·라벨 금지) ③ 값 인코딩 제안(8bit 1채널 선형: pm25 = round(v)+1, 0=자료없음, 255=≥254 포화; pm10 은 4 µg/m³ 단계 — 값 PNG 계약에서 확정. 255 를 자료없음으로 쓰지 않는다: GMGSI 255 함정 선… | (W 번호표는 이 에이전트에 전달되지 않아 내용 이름으로 적는다) 공용 FieldRenderer·지형 드레이프 슬롯(Temperature P0 기준 구현체) · 공용 Legend · StationLayer(station_obs 와 공유) · [자료] CAMS ADS 직수신 수집기(선행… | FREE |
| **② 정확한 값** | ❌ 지도 클릭으로 이 현상의 값이 나오는 경로가 없다. prototype/v2-three/js/main.js:2793-2843 클릭 사슬 = extScene.pick(:2799) → travel.pick(:2807) → seafloor.pick(:2821) → focus.pick(:2831, 국가 선택 +… | 지도 클릭 1회 → 우측 Inspector.ValueCard. 색면 위를 누르면 'PM2.5 38 µg/m³ · 25~50 구간 · CAMS 0.4° 격자 평균 — 지점값 아님', 한국 안이면 둘째 줄에 가장 가까운 측정소(이름·거리 km·실측값)를 병기한다. 측정소 원을 누르면 '종로구 41 µg/m³ 실측(1시간값) · 24시간 평균 35 · PM10 62 · O3 · NO2 · 도시대기/도로변대기 · 주소', 환경부 등급은 자료의 pm25Grade·khaiGrade 원문 그대로(우리가 계산하지 않는다), 결측이면 flags 사유를 그대로 보여 준다. 네트워크 호출 0건(값 텍스처 CPU 사본 + 메모리 안 stations[]). UV 칩: 'UVI 7 · 높음(WHO/기상청 구간) · 오늘 최고 13시(예보) · 0.4° 격자값', 시도 칩은 '서울(시도) 7'.<br>⚠️ *말하면 안 되는 것:* 격자값을 도시값처럼 말하지 않는다 — 5° 임시판에서는 '5° 격자 평균(약 550km) — 이 도시의 값이 아닙니다'를 값과 같은 크기로. 측정소가 없는 나라에서 '가장 가까운 측정소'를 수백 km 밖에서 끌어오지 않는다. 등급을 우리가 계산하지 않는다. 포화·결측을 0 으로 읽지 않는다(air-grid handler 의 '없는 값을 0 으로 채우지 않는다' 원칙 유지). 요금: 공공 실… | fields 별 단위·표시 정밀도(pm25·pm10 1 µg/m³ 정수, UVI 0.5 단위) · 정밀도 한계 문구 템플릿('{res}° 격자 평균 — 지점값 아님' / '측정소 실측 — {kind}') · 측정소 히트 반경(화면 px 기준)과 '가장 가까운 측정소' 최대 거리(현 MY EARTH 는 400km — 대기질엔 과하다, PD/설계 결정: 제안 30km) · 관측 레코드 필드 맵(aws/air-korea/handler.py:176-190: pm10·… | 우측 단일 Inspector(P0 셸) · 클릭 사슬에 '활성 현상의 FieldRenderer/StationLayer 먼저 묻기' 단계 추가(main.js:2793 사슬 앞단 — 국가 선택·인구 메뉴와의 우선순위는 셸 설계 결정) · FieldRenderer 의 값 텍스처 CPU 사본… | FREE |
| **③ 출처** | 🟡 출처·시각은 레이어를 켤 때 Intel 패널 카드로만 나오고 클릭한 값에 붙지 않는다. main.js:4261-4273 LIVE_LAYER_KEYS 토글 → liveLayers.card(lid) + :4270 layerTruthLine(증거종류·SLA). live-layers.js:2116-2127 m… | ValueCard 바로 아래 ProvenanceCard 두 줄. 모델: 'Copernicus CAMS 전지구 대기조성 예보 · MODEL 배지 · run 09-20 00Z · valid 09-20 15:00 KST(+6h) · 0.4°(약 44km) · 라이선스: CAMS 출처표기'. 관측: '한국환경공단 에어코리아(공공데이터포털 경유) · OBSERVED 배지 · 15:00 KST · 좌표 있는 측정소 n/673곳 · 공공누리 제1유형'. 환산 필드는 DERIVED 배지와 식을 상시 표기('UVI = 40 × CAMS UV 선량', 'O3 µg/m³ = 혼합비 × 공기밀도', '오늘 최대 = 모델 예보의 현지일 최대'). SLA 를 넘기면 STALE. 임시 기간에는 'Open-Meteo 경유(CAMS) · 5°/0.5° · 수집 09-20 15:00Z — run 시각은 이 경로로 알 수 없음'이라고 그대로 적는다.<br>⚠️ *말하면 안 되는 것:* 임시판에서 run 시각을 지어내지 않는다(수집 시각을 run 처럼 적지 않는다). 'CAMS'만 적어 Open-Meteo 경유를 숨기지 않는다. CAMS 라이선스는 '출처표기 조건의 상업 이용 허용'으로 알려져 있으나 약관 원문은 PD 계정 수락 때 확인 — 확인 전에는 라이선스 칸에 단정문을 쓰지 않는다. 요금 충돌: PD 사다리는 'source·time'을 EXPLORER 에 두지만 정… | 출처표(sources[]): id·기관명·경유(via)·kind(관측/모델)·해상도·갱신 주기·SLA 분·라이선스·시각 필드 매핑(observed=korea-air-obs.observedKst, run/valid=CAMS 수집기가 새로 내야 하는 필드, collectedAt=임시판 time) · DERIVED 식 문자열 · 메뉴 행 src 문구를 카드와 일치시키는 단일 출처 문자열(ui-shell.js:68-69 의 'CAMS 격자 5°' 교체) · UV 시도… | 우측 Inspector(P0 셸) · 공용 배지 어휘(evidence-popover.js · source-context.js 재사용) · CAMS 수집기가 run·valid·resolution·license 필드를 문서에 싣기 · [PD 결정] 출처의 어느 깊이부터 EXPLORER 인… | FREE |
| **④ 시간축** | ❌ 스트립은 하나 있으나 이 레이어는 반응하지 않는다. ui-shell.js:1326-1362 #timestrip range −1440~+7200분(step 30) → :1351 hooks.onTimeOffset. main.js:4891-4899 onTimeOffset → clouds.setForecast… | 화면에 하나뿐인 Global Timeline 을 +방향으로 끌면 PM2.5 색면이 CAMS 3시간×41프레임(+120h)으로 바뀌고, 미래 구간에서는 관측 원이 사라지며 FORECAST 배지와 범례 'valid +27h · run 00Z'가 뜬다. 과거 방향은 관측·모델 이력이 공개 저장소에 쌓인 기간만 열리고, 없는 구간은 타임라인 위에 빗금 '대기질 자료 없음'으로 보인다(현재 0일). 프레임은 현재 시각 ±1 만 프리패치한다. UV 칩의 '오늘 최대'는 현지일 단위라 시간축과 무관함을 표시하고, '지금' 모드만 프레임을 따라간다. 메뉴 안에 슬라이더를 만들지 않는다.<br>⚠️ *말하면 안 되는 것:* 지금은 +120h 도 과거도 없다 — 시간을 옮겼는데 현재값을 그 시각 값처럼 두지 않는다(흐리게 + 문구). 관측을 미래로 외삽하지 않는다. 프레임 사이를 시간 보간해 없는 시각을 만들지 않는다(3시간 프레임이면 3시간 단위로 스냅, 보간한다면 'DERIVED·시간 보간' 표기 — 공용 저장소 규칙을 따른다). 무료에서도 '지금' 그림은 완성돼 보여야 한다. | frames 선언: { variable:'pm25', stepH:3, count:41, horizonH:120, runsPerDay:2, keyPattern, 프리패치 ±1 } — 1단계는 PM2.5 한 물질만(PM10·UV 는 증분). 공개 접두사 주의: air/ 접두사는 브라우저 403(aws/air-ea/handler.py 머리말) → 프레임 키는 공개 접두사 아래로. 미래 구간 규칙(관측 원 숨김·FORECAST 배지) · 과거 구간 가용 범위 선언(a… | GlobalTimeline·프레임 저장소(P0 셸) · CAMS ADS 수집기의 예보 시간축(제출/수령 분리 — ADS 큐는 Lambda 900초 보장 없음) · 값 PNG 계약 · 관측 이력 공개 저장(현재 archive/ 접두사는 비공개 — reports/published 만 공개… | EXPLORER |
| **⑤ 비교** | ❌ 이 메뉴에 쓸 수 있는 비교 UI 가 없다. prototype/v2-three/js/scenario-compare.js:1-25 는 SimulationRunRecord 기준/가지 비교(truthStatus 둘 다 SIMULATION 필수)로 표류(research-runtime) 전용이고 main.js·… | TOP Compare 버튼 → Compare workspace, 이 메뉴의 기본 짝은 '관측 ↔ 모델'. split: 왼쪽 CAMS PM2.5 색면, 오른쪽 같은 LUT 의 측정소 원·시도 채움(카메라·시간·범례 동기화). diff: 측정소마다 (관측 − 그 위치 격자값)을 발산 구간색 값 원(−30 이하 · −30~−15 · −15~−5 · ±5 · +5~+15 · +15~+30 · +30 이상 µg/m³)으로 찍어 모델이 과소·과대한 지역이 한눈에 보인다. 둘째 짝 PM2.5 \| PM10 wipe(같은 문서·같은 시각), 셋째 짝 최신 run \| 이전 run 또는 now \| +24h valid(CAMS 하루 2회 run). 공통/짝별 scale 선택, run 시각·해상도 표시, URL 공유.<br>⚠️ *말하면 안 되는 것:* 모델↔모델(GFS\|ECMWF 식)은 이 메뉴에 자료가 없다 — CAMS 하나뿐이고 GEFS-Aerosols·GEOS-CF 는 필드·지연 미확인이라 약속하지 않는다. 5° 임시판에서는 '격자점 vs 측정소 지점'을 나란히 놓지 않는다(격자 vs 실측 규칙). 차이는 차이로만 적는다 — '모델이 틀렸다/맞았다'는 판정은 채점 이력이 말할 일이다(scenario-compare.js 의 태도:… | 비교 짝 목록과 가용성 플래그: obs_vs_model(지금 자료로 가능·품질 제한) · species_vs_species(pm25\|pm10 가능) · run_vs_run·time_vs_time(CAMS 직수신 뒤) · model_vs_model(없음) · UV: clearsky_vs_allsky(CAMS 두 필드 직수신 뒤). diff 눈금(발산 7단) · 5° 구간의 비교 단위 규칙('셀 평균 vs 셀 안 측정소 n곳 평균·범위') · 측정소 kind(도… | Compare workspace(P1) · FieldRenderer 2-인스턴스 동기화 · CAMS 0.4° 직수신(지점 대 격자 비교가 정직해지는 조건) · run 보존(이전 run 프레임을 덮어쓰지 않는 저장 규칙) · PRO 채점은 '측정소 위치 격자값 vs 그 측정소 실측'으로… | PRO |
| **⑥ Intelligence** | ❌ 이 현상에는 인텔 패킷 생산자도 띠도 없다. main.js:4098-4112 intelHostFor 는 hazards.typhoon·hazards.earthquake·ocean.sst·weather.temperature_anomaly 만 분기 — weather.air_quality 는 null. doc… | 위치 선택 → Intelligence Inspector 가 위에서부터 Current '서울 PM2.5 62 µg/m³(측정소 40곳 평균 · 15:00 KST)' → 대비 '모델 대비 +21 · 어제 같은 시각 대비(이력이 쌓인 뒤)' → Data Source(에어코리아 · CAMS run) → 그 아래에 문장 → View Details. 탭 Now/Forecast/Climatology(자료 없음은 비워서 말함)/Analysis. 근거 슬롯이 채워졌을 때의 문장 형태(수치는 자리표시): [원인] '서울 PM10 중 CAMS 먼지 성분이 약 70%이고, GFS 850hPa 바람을 72시간 거꾸로 따라간 경로(MODELLED_TRANSPORT)가 40°N 104°E 부근 고농도 먼지 구역을 지난다 — 먼지 수송 기여. 근거: 모델 성분비 + 역궤적, 문헌 기작: 편서풍대 먼지 장거리 수송. 함께 나타난 조건: 기상청 대기확산지수 낮음(서울·시도 단위).' [확률] '내일 15시 서울 PM2.5 가 35 µg/m³ 를 넘을 확률 70% — 근거: CAMS +24h 예보가 35 초과였던 지난 N회 중 그 측정소 실측도 초과였던 비율(채점 적중률).' 슬롯이 비면 그 자리에 '원인 판정 없음 — 이동 경로 계산이 공개 검증 전' '확률 없음 — 앙상블·채점 이력 없음'을 적는다.<br>⚠️ *말하면 안 되는 것:* 지금은 원인(attribution)도 확률(probability)도 말할 근거가 없다 — 성분 필드는 Open-Meteo 경유 dust 뿐이고, 역궤적은 v2 에 연결되지 않았으며(advectPoint 소비자 0), 앙상블·측정소 단위 채점 이력이 없다. 그 전에는 '함께 나타난 조건' 나열 + 기관 발표 인용만 한다. dust 를 '황사'로, 역궤적 통과를 '발원지'로 단정하지 않는다(t… | 새 패킷 생산자(제안: aws/air-korea 에 intel_v1 부착 또는 별도 aws/air-intel — cyclone-analog/intel_v1.py 형식 재사용): WHAT(시도 평균·n·최고 측정소·등급 원문) · CHANGE(이력 저장 뒤) · NEXT(CAMS +24h valid — 임시판은 PROVIDER_FORECAST 표기, intel-strip.js:35-39 NEXT_KIND) · WHY(함께 나타난 조건: 기상청 대기확산지수·GFS… | 우측 Intelligence Inspector(P1) · 인텔 패킷 v1 확장(attribution[]·probability[]) 스키마 확정 · attribution: CAMS 성분 필드 직수신 + gfs-cloud-forecast 의 UGRD/VGRD 프레임 + advectPoin… | EXPLORER |
| **⑦ Simulation** | 🟡 입구와 '없다'는 이유 문장은 있으나 엔진도 작업 공간도 없다. prototype/v2-three/js/sim-questions.js:323-336 'weather.air_quality' engine:null · status NOT_AVAILABLE · 질문 'air-spread'(미세먼지는 어디로 퍼… | TOP 의 같은 자리 Simulation 버튼 → 지금 상태(물질·시각·카메라·선택 지점) 스냅샷 저장 → 별도 작업 공간 Current → Baseline → Scenario → Result. 시나리오 칩(슬라이더 없음): '이류만 +24h(기준: GFS 10m 바람)' · '850hPa 바람' · '풍속 ×0.5 / ×1.5' · '풍향 ±30°'. 결과는 선택한 고농도 덩이(PM2.5 ≥75 구간 경계에 놓은 입자들)의 +24h 도달 위치 띠를 absolute 로, 기준 대비 이동 차(km)를 delta 로 동시에 보여 주고 SimulationRunRecord 로 기록한다. 화면 고정 문구: '바람만 따라간 이동 — 침적·세정·화학 반응·배출 없음 · 농도 예측 아님 · 발원지 판정 아님'. 엔진 검증 전에는 같은 입구가 현재 이유 문장 + '무엇이 있으면 열리는가'(GFS 바람 프레임·6회차 증거·사후 검증)를 말한다.<br>⚠️ *말하면 안 되는 것:* 지금은 available 이 아니다 — 기록 남는 검증된 계산은 저장소 전체에 쓰나미 1건뿐. PD 콘셉트의 '+2°C/+4°C' 기후 칩은 이 메뉴에 엔진·자료(CMIP6 대기질)가 없어 만들지 않는다. '배출 −30%면?' 같은 시나리오는 화학수송모형이 필요하다 — 없으며 약속하지 않는다. 이류만으로 농도·도달 시각·건강 영향을 말하지 않는다. atmos-transport-spike 는… | SIM_CAPABILITIES['weather.air_quality'] 갱신안: engine 'advectPoint — 바람장 수동 이류', engineRef 'prototype/js/earthus2/v11/environment/transport-simulator.js', inputs 'CAMS PM2.5 구간 경계 + GFS UGRD/VGRD 프레임(vectorProof)', outputs '+24h 이류 위치 띠', horizons '단회 +24h', st… | Simulation workspace·SimulationRunRecord(P2) · aws/gfs-cloud-forecast 에 UGRD/VGRD 10m(+선택 850hPa) 프레임 추가(확정된 결정) · CAMS 직수신 색면(입자 시작점) · air-evidence-archive g… | PRO |

- **⑤ 비교 짝:** 1순위 = 관측 ↔ 모델(에어코리아 측정소 실측 \| CAMS 격자). 이유: 이 메뉴에서 '모델↔모델'은 성립하지 않는다(전지구 대기조성 모델은 CAMS 하나만 들어오고, 그것도 지금은 Open-Meteo 경유). 반면 관측↔모델은 오늘 받는 두 문서(wind/korea-air-obs.json · wind/air.json, 한반도 주변은 wind/air-ea.json 0.5°)만으로 성립하고, aws/air-evidence-archive/handler.py 가 이미 둘을 같은 회차로 묶어 보존하는 구조다. 지금 되는 것: 클릭한 측정소의 (실측 − 격자값) 숫자 하나, 0.5° air-ea 상자(20~50N 90~150E) 안에서의 측정소별 diff 원 — 단 5° 전지구판에서는 '셀 평균 vs 셀 안 측정소 n곳 평균·범위'로만 말한다. 지금 안 되는 것: PRO 상품으로서의 채점(aws/lab-events/handler.py:678-692 는 CAMS_OPENMETEO·6도시·PM10·격자점 vs 시도평균 → CAMS 0.4° 직수신 뒤 '측정소 위치 격자값 vs 그 측정소 실측'으로 다시 지어야 함). 2순위 = 물질 ↔ 물질(PM2.5 \| PM10, 같은 문서·같은 시각 → 지금 가능). 3순위 = 런 ↔ 런 / 시각 ↔ 시각(CAMS 하루 2회 run, now \| +24h) — 예보 프레임·run 보존이 없어 지금 불가(관측 이력도 덮어쓰기·archive 비공개: aws/report-engine/adapters/air_quality_adapter.py PROBED 표). UV 칩: 청천 ↔ 전천(CAMS 두 공식 필드) — 직수신 뒤. 없는 짝: GFS\|ECMWF 식 모델↔모델, 기관↔기관(에어코리아 예보통보 수집기 없음).
- **⑦ 시나리오:** 저장소에 이미 있는 것: ① prototype/js/earthus2/v11/environment/transport-simulator.js advectPoint — 바람 벡터를 중점법으로 적분하는 수동 이류, vectorProof(sourceId·observedAt·kind WIND_VECTOR) 없으면 거부, 결과 라벨 MODELLED_TRANSPORT·SOURCE_NOT_ATTRIBUTED, 시험 있음(tools/earthus2-v11/pollution-action-news.test.mjs), v2-three 소비자 0건. 같은 폴더 pollution-lens-service.js·pollution-event-builder.js 가 증거 묶음 → 이동 계산을 잇는다. ② aws/atmos-transport-spike — FIRMS 열점에서 850/700/500hPa 바람을 따라간 비공개 민감도 경로, 스스로 '연기 예측이 아니다'라 적고 바람을 Open-Meteo 로 받으므로 유료 공급자 불가(적분·결측 기록의 선례로만). ③ aws/air-evidence-archive — 모델·관측 동시 보존 + 게이트(서로 다른 6회차 전에는 계산 준비 상태를 열지 않음, LAB 보고서 금지). 정직한 시나리오 후보는 하나: '지금 이 고농도 덩이는 +24h 에 바람만 따라 어디로 가나' — 칩은 바람 고도(10m\|850hPa)·풍속 ×0.5/×1.5·풍향 ±30°(허용된 조건만 바꾸는 기준/가지 문법, scenario-compare.js 재사용). 가용성: 지금은 not_available(sim-questions.js:323-336 그대로) — 열리려면 gfs-cloud-forecast 의 UGRD/VGRD 프레임(vectorProof 공급자), CAMS 직수신 색면(시작점), 6회차 증거와 종료 사건 사후 검증이 필요하다. 입구는 다른 메뉴와 같은 TOP Simulation 자리에 두고, 누르면 이유와 '무엇이 있으면 열리는지'를 말한다. 만들지 않는 것: +2°C/+4°C 기후 칩(자료·엔진 없음), 배출 감축 시나리오(화학수송모형 없음), 농도·도달 시각 예측. UV: 시뮬 시나리오 없음 — SIM_CAPABILITIES 에 항목이 없어 입구도 없으므로 not_available 항목을 추가해 같은 자리에서 이유를 말하게 한다.
- **첫 단면(7단계를 전부 관통하는 가장 얇은 출시):** 7단계를 전부 관통하는 가장 얇은 단면 — 'PM2.5 한 물질 · 지금 한 시각 · 한국 관측소'. 새 수집기 없이 지금 받는 세 문서만 쓴다. 전제: 색면이 Open-Meteo 경유이므로 이 단면 전체가 'FREE_OPEN 임시'이며 결제 개시 조건에서 제외한다(범례에 'Open-Meteo 경유(CAMS)' 상시 표기, 새 호출 0).<br>(1) 공용 FieldRenderer 에 wind/air.json(5°)을 넣고 한반도 주변은 wind/air-ea.json(0.5°)을 읽기 전용으로 덧그린다(v1 FINE_BOX 규칙). PM2.5 6단 구간색 + 0~15 구간 알파 0.18 + 지형 드레이프(1.0746 껍질 폐기) — 그라데이션과 '바다까지 덮는 막'이 이것만으로 사라진다. 5° 를 NearestFilter 로 굽지 않는다(사용자 신고였던 '네모'가 돌아온다 — 값 보간 → 셰이더 구간색이 공용 부품의 정의다). 등치선·라벨은 0.5° 상자 안에서만, 5° 구간은 금지. 측정소는 흰 테두리 원+숫자(같은 LUT, khaiGrade 색 폐기), 범례 2줄.<br>(2) 클릭 → 메모리 안 두 문서로 ValueCard(격자값 + 가장 가까운 측정소, nearestOf 재사용). 네트워크 0건. '5° 격자 평균 — 도시값 아님' 문구 포함.<br>(3) ProvenanceCard 에 문서가 이미 싣고 있는 source·time·observedKst·sources[].license(공공누리 1유형)를 표시하고, 임시판은 '수집 시각 — run 미상'이라고 적는다. ui-shell 행의 'CAMS 격자 5°'를 같은 문자열로 맞춘다.<br>(4) 입구 + 정직한 사유: Global Timeline 을 60분 넘게 옮기면 대기질 색면·원을 흐리게 하고 '대기질: 현재값(이 시각 아님) — 예보 프레임은 CAMS 직수신 뒤'를 띄운다(main.js:4917 이 이미 인정하는 사실을 그림으로 옮기는 것). 새 슬라이더 없음.<br>(5) 입구 + 숫자 하나: 측정소 클릭 시 (실측 − 격자값)을 ValueCard 에 한 줄(0.5° 상자 안에서만, 밖은 '셀 안 n곳 평균 vs 셀 값'). TOP Compare 버튼은 같은 자리에 있고, 누르면 'PM2.5 \| PM10'과 '관측 \| 모델' 짝이 준비 중인 이유를 말한다.<br>(6) 수치 → 출처 → 문장 배치로 최소 패킷: air-korea 의 시도 집계로 WHAT·EVIDENCE 절만 생산하고 WHY 에는 기상청 대기확산지수(kma-life)를 '함께 나타난 조건'으로 인용. attribution·probability 슬롯은 빈 이유를 적는다. 동시에 registry 의 intelligence:true 플래그가 실체를 앞서는 문제를 해소한다.<br>(7) 입구 동일: TOP Simulation → 'air-spread' not_available 이유 + 열리는 조건 세 가지(GFS 바람 프레임·6회차 증거·사후 검증). UV 에도 not_available 항목을 추가한다.<br>미루는 것: CAMS ADS 직수신(선행 A)·0.4° 전지구 등치선·+120h 41프레임·O3/NO2/Dust/UV 칩·먼지 입자·Compare 워크스페이스 본체·측정소 단위 채점·이류 시뮬 엔진·관측 이력 공개 저장.
- 비고: 1) 정직성 불일치(지금 고칠 수 있음): phenomenon-registry.js:635 가 weather.air_quality 에 intelligence:true·forecast:true 를 선언하지만 생산자가 없어(INTEL-COVERAGE:38, main.js:4098-4112) 화면은 '패킷이 아직 없습니다'(intel-questions.js:96)를 띄운다 — 능력 플래그가 실체보다 앞선다. ui-shell.js:68-69 의 src 'CAMS 격자 5°'는 Open-Meteo 경유를 숨기고 같은 레이어의 카드(live-layers.js:1182)는 밝힌다 — 두 곳의 출처 표기가 다르다. 관측 점의 색이 PM2.5 가 아니라 통합대기지수 등급(khaiGrade)이라 'PM2.5 색면'과 같은 눈금이 아니다.<br>2) 요금 충돌(PD 결정 필요): PD 사다리는 '정확값·source·time'을 EXPLORER 에 두지만 정직성 규칙 6(자료 시각과 출처를 항상 말한다)과 공공 실측(공공누리 1유형)의 성격상 (2)(3)의 기본은 FREE 로 두었다. 제안한 갈림: 무료 = 값·기관·시각·관측/모델 배지 / EXPLORER = run·valid 상세·해상도·라이선스·(관측−모델)·다물질·24h 평균·내 장소 시계열·+120h / PRO = Compare·채점·시뮬·export·임계 알림. 대기질 경보·황사 특보는 구독과 무관하게 무료.<br>3) 결제 개시의 실질 차단 요인은 자료다: 격자 두 판 모두 Open-Meteo 경유(aws/air-grid/handler.py:146, aws/air-ea/handler.py:251)이고 CAMS·GEFS-Aerosols·GEOS-CF 수집기는 aws/ 에 0건. CAMS ADS 직수신(PD 계정 D-OM4, 제출/수령 분리)이 (1)(4)(5)(6)의 공통 선행이며 이 메뉴의 크기를 XL 로 만드는 부분이다. 공개 접두사 함정: air/ 로 올리면 브라우저 403(air-ea 머리말) — 새 프레임 키는 공개 접두사 아래여야 한다.<br>4) UNKNOWN: aws/air-evidence-archive 의 배포·스케줄 여부(본 트리에 배포 문서 없음, 출력은 비공개 archive/). CAMS 의 O3·NO2 지표 농도·UV 선량 필드명과 단위, GEFS-Aerosols 해독 가능 여부, 에어코리아 예보통보 API 연결 가능 여부는 구현 전 확인 대상. W0~W10 번호표는 이 에이전트에 전달되지 않아 dependsOn 을 내용 이름으로 적었다.<br>5) 현재 자리 매핑 한 줄: registry:1091-1098 'observation' 묶음(대기질·자외선·station_obs·climate_series·surface_temperature·terrain) 중 07 로 오는 것은 대기질(+UV 칩)뿐 — station_obs 는 Show Stations 공용 부품, climate_series 는 Intelligence Climatology 탭, surface_temperature 는 01 Temperature, terrain 은 09 후보이며 전부 PD 결정 필요(이 메뉴 범위 밖).<br>6) 운영 주의: UV 시도 칩·대기확산지수는 KMA 허브 키(Lambda 여럿 공유, 일일 용량 초과 시 특보·AWS 가 함께 묵음)를 쓰는 kma-life 산출물을 '읽기만' 한다 — 이 메뉴 때문에 호출 주기를 올리지 않는다. air-ea 도 같은 원칙(감사 D-OM3 의 3시간 축소 권고 대상).<br>관련 파일(절대경로): D:\## APP\EARTHUS v2_APP\prototype\v2-three\js\live-layers.js · main.js · ui-shell.js · phenomenon-registry.js · sim-questions.js · intel-strip.js · intel-questions.js · scenario-compare.js · engine-bridge.js / D:\## APP\EARTHUS v2_APP\prototype\js\earthus2\v11\environment\transport-simulator.js · pollution-lens-service.js / D:\## APP\EARTHUS v2_APP\prototype\js\gridoverlay.js / D:\## APP\EARTHUS v2_APP\aws\air-grid\handler.py · air-ea\handler.py · air-korea\handler.py · air-evidence-archive\handler.py · atmos-transport-spike\handler.py · kma-life\handler.py · lab-events\handler.py · report-engine\adapters\air_quality_adapter.py / D:\## APP\EARTHUS v2_APP\docs\R0-OPEN-METEO-AUDIT-2026-09-20.md · INTEL-COVERAGE-2026-09-20.md

<details><summary>descriptor 초안</summary>

```js
{
  id: 'air_quality', rail: '07', label: { ko: '대기질', en: 'Air Quality' },
  phenomena: ['weather.air_quality', 'weather.uv' /* MERGE — PD 결정 필요 */],
  chips: [
    { id: 'pm25', default: true, stage: 1 },
    { id: 'pm10', stage: 1 /* 구간값 PD 결정 */ },
    { id: 'o3',  stage: 2, derived: '혼합비×공기밀도 환산 가능성 — 변수 확인 전 약속 안 함' },
    { id: 'no2', stage: 2, note: '격자 없음 · 관측소에는 있음(korea-air-obs no2)' },
    { id: 'uv',  stage: 3, phenomenon: 'weather.uv', pdDecision: true },
    { id: 'dust', pdDecision: true, note: '질량 µg/m³ vs Dust AOD 정의 PD 확정' },
  ],
  fields: {
    pm25: {
      renderer: 'FieldRenderer', mode: 'stepped', unit: 'µg/m³', precision: 1,
      bands: [[0,15,'#2FBF71',0.18],[15,25,'#F2E14B'],[25,50,'#F7B733'],[50,75,'#F2762E'],[75,150,'#D7263D'],[150,Infinity,'#7A1E5C']],
      bandLabel: '농도 구간(등급 아님)',
      contours: { levels: [25,50,150], labels: true, minResDeg: 0.5 /* 5° 금지 */ },
      drape: 'terrain' /* airShell 1.0746 폐기 */,
      encoding: { bits: 8, channels: 1, fn: 'round(v)+1', nodata: 0, saturate: 255 /* = ≥254, 255 를 nodata 로 쓰지 않는다 */ },
    },
    pm10: { renderer: 'FieldRenderer', mode: 'stepped', unit: 'µg/m³', bands: 'PD_DECISION', encoding: { fn: 'round(v/4)+1', nodata: 0 } },
    uv: {
      renderer: 'FieldRenderer', mode: 'stepped', unit: 'UVI',
      bands: [[0,3,'#289500'],[3,6,'#F7E400'],[6,8,'#F85900'],[8,11,'#D8001D'],[11,Infinity,'#6B49C8']],
      contours: { levels: [3,6,8,11], labels: 'UV {v}', minResDeg: 0.5 },
      modes: ['dailyMax' /* 기본 · DERIVED */, 'now' /* 밤 빗금 "밤 — 자외선 0" + 낮 반구 카메라 */],
      derived: 'UVI = 40 × CAMS UV 선량(단위 환산) — 필드명·단위 구현 전 확인',
    },
  },
  stations: {
    layer: 'StationLayer', source: 'airkorea', colorBy: 'activeChip' /* 색면과 같은 LUT — khaiGrade 색 폐기 */,
    glyph: 'white-ring + number', lod: { desktop: 160, mobile: 60 },
    zoomedOut: { mode: 'sidoFill', label: '{sido} {pm25} · 측정소 {n}곳 평균', polygons: 'prototype/data/korea-admin-reference.json (regionKo 로 묶음)' },
    hideInFuture: true,
    uvChips: { source: 'kma-life', label: '{sido}(시도) {uv} {levelKo}', badge: 'KMA FORECAST', noData: ['광주','전남'] /* 조용히 빼지 않는다 */ },
  },
  particles: { enabled: false, after: 'Wind P0', field: 'dust', preset3: true, fixedNote: '먼지 질량이며 발원지를 뜻하지 않습니다' },
  sources: [
    { id: 'cams-ads', role: 'model', kind: 'MODEL', org: 'Copernicus CAMS', resDeg: 0.4, runsPerDay: 2, horizonH: 120, license: '출처표기 조건(약관 원문 PD 확인 · D-OM4)', status: 'COLLECTOR_MISSING' },
    { id: 'openmeteo-cams-global', role: 'model', kind: 'PROVIDER_FORECAST', key: '/wind/air.json', resDeg: 5, label: 'Open-Meteo 경유(CAMS)', time: 'collectedAt(정시 절삭) — run 미상', interim: true, paidOk: false, slaMin: 360 },
    { id: 'openmeteo-cams-ea', role: 'model', kind: 'PROVIDER_FORECAST', key: '/wind/air-ea.json', resDeg: 0.5, box: [20,50,90,150], interim: true, paidOk: false, readOnly: true /* 호출 늘리지 않음 */ },
    { id: 'airkorea', role: 'observation', kind: 'OFFICIAL_OBSERVATION', key: '/wind/korea-air-obs.json', via: '공공데이터포털', license: '공공누리 제1유형', time: 'observedKst', slaMin: 120, fields: ['pm25','pm10','pm25_24h','pm10_24h','o3','no2','co','so2','khai','grade','pm25Grade','pm10Grade','kind','addr','flags'] },
    { id: 'kma-life', role: 'agency-index', kind: 'OFFICIAL_FORECAST', key: '/wind/kma-life.json', fields: ['uv','disp'], scope: '시도 15/17 · 3시간' },
  ],
  inspector: {
    value: { gridLimit: '{res}° 격자 평균 — 지점값 아님', stationLimit: '측정소 실측 · {kind}', nearestStationMaxKm: 30 /* 제안 */, gradeQuote: 'pm25Grade/khaiGrade 원문 인용' },
    provenance: { lines: ['model','observation'], showDerivedFormula: true },
  },
  frames: { variable: 'pm25', stepH: 3, count: 41, horizonH: 120, prefetch: 1, past: { availableFrom: null /* 공개 이력 없음 */ }, keyPrefix: 'PUBLIC_PREFIX_REQUIRED /* air/ 는 403 */', interimBehavior: 'dim + "대기질: 현재값(이 시각 아님)" when |offset|>60min' },
  compare: {
    default: 'obs_vs_model',
    pairs: [
      { id: 'obs_vs_model', now: 'LIMITED' /* 0.5° 상자 안 지점 diff · 5° 는 셀 평균 vs 셀 안 n곳 평균 */, diffBands: [-30,-15,-5,5,15,30] },
      { id: 'pm25_vs_pm10', now: 'AVAILABLE' },
      { id: 'run_vs_run', now: 'NEEDS_CAMS_DIRECT' }, { id: 'now_vs_plus24h', now: 'NEEDS_CAMS_DIRECT' },
      { id: 'uv_clearsky_vs_allsky', now: 'NEEDS_CAMS_DIRECT' },
      { id: 'model_vs_model', now: 'NO_DATA' },
    ],
  },
  intel: {
    producer: null /* 없음 — 제안: aws/air-korea 에 intel_v1 부착 */, hostKey: 'weather.air_quality',
    sections: { WHAT: 'sido 평균·n·최고 측정소', NEXT: 'CAMS +24h valid', WHY: ['kma-life.disp 대기확산지수','GFS 10m 풍속','CAMS dust/PM10 비'], EVIDENCE: true },
    attribution: { basisNeeded: ['MODEL_COMPONENT(CAMS 직수신)','BACK_TRAJECTORY(advectPoint + GFS 프레임)'], emptyText: '원인 판정 없음 — 이동 경로 계산이 공개 검증 전' },
    probability: { basisNeeded: ['SCORED_MODEL_HITRATE(측정소 위치 채점 아카이브)','ENSEMBLE_FRACTION(GEFS-Aerosols — 미확인)'], emptyText: '확률 없음 — 앙상블·채점 이력 없음' },
    quoteOnly: ['환경부 등급 설명','WHO/기상청 행동요령'],
  },
  simulation: {
    entry: 'TOP/Simulation', capabilityKey: 'weather.air_quality', status: 'not_available',
    engineRef: 'prototype/js/earthus2/v11/environment/transport-simulator.js#advectPoint',
    vectorProof: 'aws/gfs-cloud-forecast UGRD/VGRD 10m 프레임(추가 예정) — Open-Meteo 바람 불가',
    scenarioChips: ['advect+24h@10m','advect+24h@850hPa','speed×0.5','speed×1.5','dir±30°'],
    result: ['absolute: +24h 위치 띠','delta: 기준 대비 이동 차 km'],
    fixedNote: '바람만 따라간 이동 — 침적·세정·화학·배출 없음 · 농도 예측 아님 · 발원지 판정 아님',
    gates: ['air-evidence-archive 6회차','종료 사건 사후 검증'],
    uv: { status: 'not_available', reason: '자외선은 기관·모델 예보를 인용합니다 — 우리가 만든 복사 계산은 없습니다' },
  },
  safetyAlwaysFree: ['대기질 경보','황사 특보'],
  tiers: { FREE: ['now field','stations','legend','basic value','org·time·badge'], EXPLORER: ['+120h timeline','species drill-down','my-place series','obs−model','short intel'], PRO: ['compare workspace','scoring','simulation','export','threshold alerts'] },
}
```

</details>

#### 08 Space 우주

| 단계 | 지금 | 끝났을 때 사용자가 보고 하는 것 | 이 메뉴가 공급할 것 | 선행 | 요금 |
|---|---|---|---|---|---|
| **① 극적으로 보인다** | 🟡 오로라: 1° 칸마다 고정 픽셀 점(4~10px) + '그 시각 최댓값' 상대 눈금 + AdditiveBlending — prototype/v2-three/js/live-layers.js:1505(MIN=5)·1513(t=(v-MIN)/(maxV-MIN))·1532·1548. 발사: 발사대마다 수직 L… | Space 를 누르면 3초 안에 카메라가 북극권 구도로 옮겨 가고(옮겼다고 적음) OVATION 확률이 5단 절대 구간색 띠로 선다: 0~20 회색(5% 미만 투명) · 20~40 연두 · 40~60 초록 · 60~80 시안 · ≥80 보라, 경계 20·40·60·80 은 셰이더 선. 조용한 날은 얇은 회색·연두 고리, 폭풍일은 보라 코어가 중위도로 내려온 두꺼운 띠 — 같은 색은 어느 날이든 같은 %. 낮 쪽 띠는 해칭+반투명. Satellites 모드는 실척 고도 점 구름 위에 정거장·한국 위성 아이콘/이름표, 발사장은 임박도 5단 링 + 숫자 배지(막대 없음), Solar 모드는 직하점 마커와 낮/밤 경계선만(색면 없음). 좌하단 Legend 상시: 5단 색 + '<5% 표시 안 함' + 'Probability % · OVATION · 예보 HH:MMZ · N분 전', 모드가 바뀌면 군별 색 점·기수 / 임박도 5단으로 교체.<br>⚠️ *말하면 안 되는 것:* OVATION 은 1°×1° 칸의 단일 예보(+30~90분)다 — 도시 값처럼, '지금 보인다'처럼 그리지 않는다. 낮·구름을 고려하지 않은 값이라는 사실을 범례에 둔다. 위성 위치는 SGP4 계산값이지 관측이 아니다. 발사 전 궤적선은 그리지 않는다(LL2 가 방향·경사각을 주지 않고 orbit-math.js 는 상승 가지만 계산). Solar 모드는 지구에 색면을 칠하지 않는다(D-RA… | 필드 aurora.prob(360×181 uint8, R=%, RepeatWrapping+반 텍셀·극점 UV 보정) · 눈금 5단 절대 breaks[20,40,60,80]·hideBelow 5 · 메쉬 옵션(\|위도\|≥35° 극 모자, 지형 추종 surfR + 칸 안 3×3 최대 고도, onExaggerChanged 재생성) · 낮쪽 해칭 마스크(subsolarPoint main.js:85) · EventLayer 기호표: 위성 군 9칩 색 / 고도 6구간(… | W1(FieldRenderer — 구간화 셰이더는 W2 기온에서 처음 만들어짐, 지시서 DEV-DIRECTIVE.md:104) · W5(좌레일 'Space'·Legend 자리) · W7(우주, 지시서:213). 선행 핫픽스(전부 S, 지시서:1422): ④ 오로라 절대 눈금+REFRE… | FREE |
| **② 정확한 값** | ❌ 지도 클릭 사슬 main.js:2793-2843 은 extScene.pick → travel.pick → seafloor.pick → focus.pick(나라) → marineSelect(바다) 순서뿐이고 Space 레이어 값 조회 분기가 0 이다('.pick(' grep 5건 전부 타 모듈: 2799… | 띠 위 한 점을 클릭하면 우측 Inspector.ValueCard 에 '62 %' 큰 숫자 + '1°×1° 칸 값(OVATION 모델 출력) — 지점 실측 아님' + 칸 중심 좌표 + 그 지점 태양 고도각 −18°(계산값). 값은 이미 받아 둔 값 텍스처의 CPU 사본에서 최근접 칸을 읽는다 — 네트워크 0건. 5% 미만 칸은 '표시 문턱 미만 — 값 N%'. 위성은 클릭/탭 때만 화면 공간 최근접 탐색(지구 뒤편 제외) → 이름·NORAD·군·고도 km·속도 km/s·직하점 + 앞으로 1주기 경로 흰 선. 발사장 링 클릭 → 발사체·기관·NET(KST/UTC)·상태·1초 tick 카운트다운. Solar 모드는 X선 등급·플럭스가 Inspector 상단에 상시 있고 지도 클릭 대상은 직하점뿐이다.<br>⚠️ *말하면 안 되는 것:* 칸 값을 그 도시의 가시 확률로 말하지 않는다. 위성 고도·속도는 DERIVED(계산값)이고 요소 epoch 에서 멀수록 나빠진다 — 요소 나이를 값 옆에 둔다. '다음 통과'는 passesOver(model.js:397)의 기하 통과(고도각≥10°)일 뿐 육안 가시 여부가 아니다(위성 조명·하늘 밝기·구름 무관). X선 0 은 결측이지 A 급이 아니다(live-layers.js:1246-… | valueAt 어댑터 3종 — aurora: uint8 사본 → %(정밀도 문구 'OVATION 1° 칸 값') / satellite: pickNearestScreen(임계 px 데스크톱·모바일 별도, 뒤편 제외) → spaceops/model.js fromSat(:153)·elementsOf(:60)·orbitClass(:89) / launch: 링 pick → fromLaunch(:212)·launchStatus(:251). 단위·자릿수표: % 정수 · 고… | W5(Inspector) · W1 의 텍스처 CPU 사본 점값 계약(선례 main.js:1979-2016 sampleAt) · 위성: prototype/js/spaceops/model.js 를 setSatLib(:26)로 주입(머리말 1행 'Cesium·DOM 없음') · main.j… | FREE |
| **③ 출처** | 🟡 오로라 카드에는 출처·관측 기준→예보 시각·퍼블릭 도메인·OFFICIAL_FORECAST 배지가 이미 있다(live-layers.js:1558-1573). 그러나 (a) REFRESH_MIN(344-349)에 aurora·solaract·launch 가 없어 예보 시각이 지나도 배지가 그대로다. (b)… | 같은 Inspector 의 ProvenanceCard 한 장: 'NOAA SWPC · OVATION Aurora Forecast · OFFICIAL_FORECAST · 관측 기준 18:25Z → 예보 시각 19:05Z · 1°×1° · 미국 정부 저작물(퍼블릭 도메인) · 받은 시각 18:31Z'. 예보 시각이 지나면 배지가 STALE. Kp 는 제품명을 섞지 않는다: '3시간 Kp(관측·SWPC) 슬롯 18–21 UTC · time_tag' 또는 '1분 추정 Kp'. 위성: 'CelesTrak GP+SATCAT · 카탈로그 시각 · 요소 epoch 나이 9시간 · 위치=SGP4 계산(DERIVED)'. 발사: 'LL2 축약본 · 받은 시각 HH:MM · 발사기관 발표 NET — 자주 바뀜'. Solar: 'GOES 1–8Å · 관측 시각 xrayAt · OBSERVED / SDO AIA 193Å · NASA/SDO'.<br>⚠️ *말하면 안 되는 것:* CelesTrak·LL2 의 상업 이용 조건은 '미결'이라고 적는다 — '허용'이라고 쓰지 않는다. 수집 실행 시각을 관측 시각 자리에 두지 않는다. 3시간 Kp 와 1분 추정 Kp 를 한 라벨에 섞지 않고 'Kp 지금'만 단독으로 쓰지 않는다. R/S/G 배지는 SWPC 공식 현재값 피드(수집기 없음·URL 형식 UNKNOWN)를 받기 전에는 달지 않는다. PD 요금표는 source·ti… | 출처표 7행: OVATION(SWPC·PD·1°·observed→valid) / Kp 3h 관측+3일 예보(SWPC·PD·state 필드) / 1분 추정 Kp(SWPC·PD·archiver) / GOES X선(SWPC·PD) / SDO 193Å(NASA·PD·'NASA/SDO' 표기) / CelesTrak GP+SATCAT(상업 조건 미결 — docs/master-plan-2026.md:360) / LL2 축약본(상업 이용 미결 — AETHERUS-PR-15:… | W5(Inspector) · 핫픽스 ③ aws/ocean-solar/handler.py xrayAt 수정 배포(미커밋, git status 'M') · 핫픽스 ② launch 축약본 전환 · Kp 축약본 space/kp.json 신규(S — 지금 Kp 는 analysis/aurora-… | FREE |
| **④ 시간축** | ❌ 전역 슬라이더는 하나 있고 범위는 −24h~+5일이다(ui-shell.js:1334 min=-1440 max=7200 step=30 → 1351 hooks.onTimeOffset). 그러나 onTimeOffset(main.js:4891-4899)은 구름·liveLayers.setTimeOffset·sy… | 전용 슬라이더 0개. 타임라인을 +3h 로 밀면 위성 점·ISS 이름표·1주기 경로가 함께 움직이고(SGP4 at now+offset) 터미네이터와 낮쪽 해칭이 따라간다. 타임라인 위 Space 눈금: Kp 3시간 슬롯 막대(관측=채움, 예보=테두리, +72h 까지) · 발사 NET ◆ · 위성 선택 시 머리 위 통과 구간. 오로라 띠는 자기 프레임의 예보 시각 창에서만 보이고, 그 밖으로 밀면 띠를 내리고 Inspector 에 '이 시각 OVATION 프레임 없음 — Kp 예보만(+72h 까지), 그 뒤는 자료 없음'. X선 그래프에는 타임라인 시각이 세로선. 타임라인은 모드별 가용 구간 밖을 빗금으로 보인다.<br>⚠️ *말하면 안 되는 것:* +5일 슬라이더가 있다고 +5일 오로라를 그리지 않는다 — OVATION 은 한 장(+30~90분)이다. 보관 재생은 미러를 켠 날부터만 되고 소급 경로는 UNKNOWN. 위성을 요소 나이 7일 밖으로 밀면 위치를 흐리게 하거나 그리지 않고 이유를 적는다(prototype/js/aetherus/core.js MAX_ELEMENT_AGE_S 와 같은 규율). 발사 NET 은 기관 발표값이라… | 모드별 지평 선언: OVATION=단일 프레임(+30~90분), 과거는 미러 시작일 이후만 / Kp=과거 7일(1분 추정, events/history.json)·관측 슬롯~+72h(SWPC 3일 예보) / 위성=요소 epoch ±7일(그 밖은 흐리게+'요소 나이 N일 — 정밀도 저하'), 과거는 celestrak/archive/dt=… 일별(색인 실측 2026-09-06~, 45일) / 발사=launches[].net 눈금 30건, '지금'에서 1초 tick… | W5(단일 타임라인 계약) · W0 의 공용 프레임 저장소(CloudManager 에서 분리 — 지시서:91) · satLayer timeOffset 연결(S — P0 셸 작업에 동승해야 함) · OVATION 미러+프레임 보관 신규(S, 원천 갱신 주기·프레임 크기 UNKNOWN —… | FREE |
| **⑤ 비교** | ❌ v2-three/js 의 'compare' 30건은 scenario-compare.js(같은 자료 해시의 SIMULATION 기록끼리만 비교 — :17-27), intel-feed.js(태풍 기관 경로), research/(표류)이고 Space 0건, split/wipe UI 0건. 다만 짝 자체는 이… | Compare 작업 공간에서 Space 의 1순위 짝은 예보↔관측이다: 같은 3시간 슬롯 축 위에 'SWPC 예보 Kp(발표 시각별)' \| '관측 Kp' 를 나란히, 아래 diff 막대(예보−관측), 머리에 n·평균오차·적중/놓침/오경보. EARTHUS 지속성 기준선은 세 번째 줄로 놓되 우열 문장은 없다. Kp 는 전지구 스칼라라 지구 두 장이 같은 그림이 된다 — 지구는 한 장(오로라 띠) + 하단 비교 스트립. 2순위 런↔런(위성): 선택 위성에 '오늘 카탈로그 요소' \| 'N일 전 보관 요소'를 같은 시각으로 전파한 두 점·두 경로 + 거리 차 km, 근·원지점 14일 추세. 3순위 시각↔시각(발사): NET 개정 이력('09-12 발표 NET → 09-18 발표 NET'). OVATION 프레임↔프레임(조용한 날\|폭풍일, 같은 5단 범례 split)은 미러 보관이 쌓인 뒤.<br>⚠️ *말하면 안 되는 것:* 모델↔모델은 Space 에 없다 — OVATION 과 나란히 놓을 두 번째 오로라 모델 수집기가 없고 지어내지 않는다(PD 시안 08 에도 모델 이름이 없다). SWPC 와 EARTHUS 지속성의 우열을 선언하지 않는다. G1 '판정 일치'는 조용한 슬롯이 대부분이라 높게 나온다(W38 693/693 은 폭풍이 없던 주) — 적중/놓침/오경보로 나누기 전에는 '정확도 97%'라고 광고하지… | 짝 선언 4개: {id:'kp-forecast-vs-observed', kind:OBS_VS_FORECAST, rows[{slot,swpc,observed,state}], 공통 눈금 Kp 0~9 + G 구간선 5·6·7·8·9} · {id:'elements-run-vs-run', kind:RUN_VS_RUN, A=celestrak/catalog.json.gz, B=celestrak/archive/dt=…, 동기화=시각·카메라·선택 NORAD, history=c… | W8(Compare) · Kp 짝: analysis/ 접두사가 비공개(403 실측)라 공개 색인에서 읽거나 space/kp.json 축약본에 rows 를 싣는다(S) · 리드별 분리 채점(handler.py:494-499 가 리드 합산이라 우열 금지를 명시) — W9 채점과 공유 ·… | PRO |
| **⑥ Intelligence** | 🟡 인텔 띠에 Space 없음 — intel-strip.js 에 'space.'·'aurora' grep 0건, intelHostFor(main.js:4098-4112)는 태풍·지진·수온·평년 대비 기온만 돌려주고 그 밖은 null. 패킷 생산자 4개에 Space 없음. 그런데 레지스트리는 Space 8현… | Inspector 에서 수치 → 출처 → 문장 순서. 예(트롬쇠 부근 칸): ① 62 % · 1° 칸 값 · 예보 19:05Z ② NOAA SWPC OVATION · OFFICIAL_FORECAST / Kp 18–21Z 슬롯 5.33(SWPC 예보 · G1) ③ 문장 '이 칸에서 오로라가 보일 확률 62% — NOAA SWPC OVATION 발표값입니다(기관 확률). 같은 시간대 SWPC 는 Kp 5.33(G1)을 예보했고, 이 Kp 예보는 지난주 976슬롯에서 관측과 평균 0.91 Kp 차이였습니다(EARTHUS 채점). 원인: L1 태양풍이 남향 Bz −11 nT · 640 km/s 로 측정됐고(SWPC 실시간 태양풍, 18:20Z), 남향 자기장은 자기권 재결합으로 오로라대 에너지 유입을 키웁니다(Newell 외 2007 결합함수 — OVATION 의 입력). 함께 나타난 조건: 태양 고도 −18°(계산값) · GFS 구름량 20 %(MODEL).' 위성은 '다음 머리 위 통과 21:14 KST · 최고 고도각 63°(SGP4 계산 · 요소 나이 9시간)' — 확률 문장 없음. 탭은 Now·Forecast·Analysis(채점표)만, Climatology 는 '자료 없음'.<br>⚠️ *말하면 안 되는 것:* 확률은 OVATION(기관 발표)만 %로 말한다 — 우리 지속성 추정(평균오차 1.56 Kp, SWPC 0.91 보다 나쁨)으로 %를 만들지 않는다. 위 원인 문장은 태양풍 수집기와 문헌 연결표 등재가 끝난 뒤의 목표 문장이다 — 오늘 attribution[] 은 비어 있으므로 'SWPC 발표 인용 + 함께 나타난 조건'까지만 나간다(Newell 2007 서지는 저장소 밖 — 등재 전 확인… | 패킷 생산자 신규 1개 'space-weather'(aws/lab-events 의 _swpc :351-371 · g_scale :374 · aurora_scores :448-474 재사용) → space/intel.json: probability[{event:'aurora visible in this 1° cell', p:<OVATION 값>, source:'AGENCY', model:'OVATION', run:<Observation Time>, valid:<… | W9(attribution[]·probability[] 절과 가드 개정 — 지시서:230-236; 개정 전 narration_guard 는 '때문에'·'가능성'을 무조건 막는다) · 신규 수집(S): SWPC 실시간 태양풍(Bz·속도) — 저장소에 수집기 없음(lab-events 가… | EXPLORER |
| **⑦ Simulation** | 🟡 SIM_CAPABILITIES 에 Space 는 space.satellite 하나, status LIMITED('SGP4 전파는 장면 표현 — 기록 남는 계산 아님', sim-questions.js:97-113). 질문 2개의 action 'satellite-track' 은 shell.gotoScene… | TOP 'Simulation' 과 Inspector 하단 'Simulation 으로 →' 가 다른 8메뉴와 같은 자리에 있다. 누르면 지금 상태(모드·시각·선택 위성/칸·카메라·Kp 슬롯·카탈로그 시각)를 스냅샷으로 저장하고 작업 공간으로. Satellites: Current(지금 요소) → Baseline(앞으로 48h 머리 위 통과·직하점 경로 일괄 계산) → Scenario 칩 [내 위치\|서울\|트롬쇠] × [고도각 ≥10°\|≥30°] → Result(통과 표 + 지구 위 경로, absolute 와 기준선 대비 delta=통과 횟수·최고 고도각 차), SimulationRunRecord 에 요소 epoch·카탈로그 해시·관측자·SGP4 판. Aurora: 칩 [Current\|Kp 5\|Kp 7\|Kp 9] → '남쪽 경계 ≈ 지자기 위도 N°' 선 하나 + 지금 OVATION 20% 경계와의 차 — SIMULATION 배지가 아니라 'SCENARIO PREVIEW · 기관 안내 환산'. Debris: 'IDEALIZED_REMOVAL' 칩은 입구만 — 누르면 '엔진은 있으나 운영 서버와 기준선 근접사건이 없어 실행할 수 없습니다'.<br>⚠️ *말하면 안 되는 것:* Space 에 기록 남는 검증된 계산은 지금 0건이다 — 입구는 같은 자리에 두되 LIMITED/NOT_AVAILABLE 과 이유를 그대로 보인다. 지자기 폭풍·오로라를 우리가 예측하지 않는다(태양풍 입력 없음). Kp 시나리오 경계선은 'NOAA 일반 안내의 거친 환산'이며 예보가 아니다 — 구름·달·광공해 별도. IDEALIZED_REMOVAL 은 반사실 계산일 뿐 실제 제거·기동·명령… | SIM_CAPABILITIES 등재 4건: space.satellite(LIMITED 유지 → 통과 일괄 계산이 §N 검증을 통과하면 AVAILABLE; 검증안 = 보관 요소로 예측한 통과 시각 vs 최신 요소로 재계산한 시각의 차) · space.aurora(LIMITED, preview 'Kp 시나리오 경계' — aurora_lat, aws/lab-events/handler.py:378-380 '거친 값') · space.solar_activity(NOT_… | W10(작업 공간) · W5(입구 자리) · 위성 통과 엔진: spaceops/model.js passesOver(:397)·trackSamples(:130)·closestApproach(:308) 이식 + §N 검증 설계 · Aurora 칩: 지자기 좌표 변환이 저장소에 없다(신규… | PRO |

- **⑤ 비교 짝:** 1순위(지금 자료로 바로 됨) — Aurora/Solar 의 '예보↔관측': SWPC 3시간 Kp 예보 ↔ SWPC 관측 Kp. aws/lab-events 가 이미 같은 슬롯끼리 채점해 공개한다(ocean/lab-reports.json 실측 2026-09-20, aurora 5건: W37 SWPC 평균오차 0.91 Kp · G1 판정 일치 954/976 / EARTHUS 지속성 1.56 · 822/976; 폭풍일 09-09 SWPC 0.76 · 280/302; 09-08 SWPC 1.05 · 65/78). 고른 이유: Space 에서 자료·채점·라이선스(퍼블릭 도메인)가 모두 갖춰진 유일한 짝이고, PD 시안 08 에 모델 이름이 없어 '모델↔모델'은 이 메뉴에 성립하지 않는다(두 번째 오로라 모델 수집기 없음 — 지어내지 않는다). 안 되는 것: v2 에 Compare UI 0(W8), analysis/aurora-reports.json 은 비공개(403)라 브라우저는 1.5MB 색인에서만 읽을 수 있다 → space/kp.json 축약본(S) 필요. 평균오차가 리드 합산이라 SWPC↔EARTHUS 지속성 우열은 선언 금지(handler.py:494-499), G1 일치율은 조용한 슬롯이 지배하므로 적중/놓침/오경보 표로 나누기 전에는 광고 문구로 쓰지 않는다.<br>2순위(자료 있음·UI 없음) — Satellites 의 '런↔런': 오늘 카탈로그 요소 ↔ N일 전 보관 요소를 같은 시각으로 전파(celestrak/archive/dt=… 일별, 색인 실측 2026-09-06~, celestrak/history-14d.json.gz 로 근·원지점 추세). 요소 열화를 km 로 보여 주는 정직한 비교다. 단 실제 위치 오차는 아니다.<br>3순위(자료 있음) — 발사 '시각↔시각': NET 개정 이력. aws/space-archive/handler.py:136 LAUNCH_KEEP 에 net 이 있고 시간별 스냅샷이 upcoming 30건을 남긴다. 축약본 어댑터가 선행.<br>보류 — OVATION 프레임↔프레임(조용한 날\|폭풍일, 같은 5단 범례 split globe): 보관 프레임 0, 미러를 켠 날부터만 쌓인다. 기관↔기관(근접사건 AETHERUS\|SOCRATES)은 SOCRATES 이용 조건 UNKNOWN 이라 제안하지 않는다.
- **⑦ 시나리오:** 저장소에 이미 있는 엔진 3개, 기록 남는 검증된 계산은 0건이다.<br>(a) 브라우저 SGP4 — prototype/v2-three/js/sat-layer.js(장면) + prototype/js/spaceops/model.js passesOver(:397)·trackSamples(:130)·closestApproach(:308). sim-questions.js:97-113 이 LIMITED 로 등재('장면 표현 — 기록 남는 계산 아님'), 액션은 메뉴를 여는 gotoScene 뿐(main.js:4749-4750). 1순위 후보: '이 위성이 내 머리 위를 언제 지나가나(48h)'를 SimulationRunRecord 로 남기는 일괄 계산. 검증 재료가 이미 있다 — 보관 카탈로그(2026-09-06~)로 과거 요소의 예측을 최신 요소와 대조. §N 통과 전에는 LIMITED 그대로.<br>(b) services/aetherus-orbital P5 'Intervention Benefit Engine' — IDEALIZED_REMOVAL 반사실 계산(Benefit = R(G0) − R(Gs), 입력·설정·모형 해시, append-only; artifacts/evidence/P5.json). Space 유일의 '시나리오→결과' 엔진이고 PRO 에 가장 어울린다. 가용성은 3중으로 막혀 있다: FastAPI+Postgres 상시 서버 없음(core.js:32-35, 발행은 수동 스크립트·2026-09-04 에서 멈춤), 기준선 근접사건이 0 이면 INSUFFICIENT_DATA(P5.json), 패키지 NOT ACCEPTED·v2 웹 클라이언트 없음(core.js 는 conjunctions/manifest 읽기만). → 입구만 두고 NOT_AVAILABLE + 사유. 서버 비용은 PD 결정.<br>(c) aws/lab-events 오로라 — 지속성 추정(채점됨, SWPC 보다 나쁨)과 aurora_lat(kp)=66−2.3·Kp(handler.py:378-380, 'NOAA 일반 안내·거친 값'). Kp 5/7/9 시나리오 칩의 '남쪽 경계 ≈' 선으로 쓸 수 있으나 SIMULATION 이 아니라 SCENARIO PREVIEW 이고 지자기 좌표 변환이 저장소에 없다(신규).<br>없는 것: 지자기 폭풍·플레어 예측 엔진(태양풍 입력 없음), 발사 궤적(방향 자료 없음). services/research-runtime 은 표류(Parcels) 전용, aws/tsunami-eta 는 재해 메뉴. prototype/v2-deploy/engine-v11 은 최상위 목록(action·forecast·tourism 등)에 우주·궤도 모듈이 없음을 목록으로만 확인했다(내용 미확인). 입구는 다른 메뉴와 같은 자리(TOP Simulation + Inspector 하단)에 두고, 오늘 가능한 최소 단위는 sim-questions.js 에 space.aurora·space.solar_activity·space.orbital_debris 를 사유 문장과 함께 등재하는 것이다.
- **첫 단면(7단계를 전부 관통하는 가장 얇은 출시):** Aurora 를 척추로 7단계를 한 줄로 관통시키고, Satellites 는 시간축 연결 하나만 동승한다. 새 공용 부품(W1·W5·W8·W9·W10)을 기다리지 않고 지금 코드 위에서 되는 것만 넣는다.<br>0) 과금 전제 핫픽스(S·P0): 궤도 인텔리전스의 거짓 머리말·LIVE 배지(지시서:1454-1467, core.js:558 vs state():428 · main.js:4288).<br>(1) 오로라 절대 5단 눈금(구간별 고정색, 상대 눈금 live-layers.js:1513 폐기) + Additive→일반 알파 + REFRESH_MIN 에 aurora + 켤 때 북극권 카메라 + 임시 DOM 범례('<5% 표시 안 함' 포함). 극 모자 LUT 면은 W1/W2 뒤로 미룬다 — 점 구름이지만 같은 색이 같은 % 가 된다.<br>(2) Space 레이어가 켜져 있으면 main.js:2799 사슬 앞에 분기 하나: 이미 메모리에 있는 l.data.coordinates 에서 최근접 1° 칸을 찾아 기존 카드에 'NN % · 1° 칸 값 · 태양 고도각(계산값)'. 네트워크 0건.<br>(3) 같은 카드에 받은 시각과 '예보 시각 경과 → STALE' 판정, ocean-solar xrayAt 수정 배포, 위성 배지 LIVE→DERIVED(main.js:4359).<br>(4) onTimeOffset(main.js:4891)에서 satLayer 로 시각을 넘기고 sat-layer.js:213 을 now+offset 으로. 오로라는 예보 시각 창 밖으로 밀면 띠를 내리고 '이 시각 OVATION 프레임 없음' 한 줄 — 보관·Kp 막대는 미룬다.<br>(5) 카드에 'Compare' 입구 → 지금은 LAB 오로라 보고서의 예보↔관측 검증표(/lab-reports.html?kind=aurora)로 보낸다. 사유 문구 '분할 비교 작업 공간은 준비 중 — 이 짝은 이미 채점돼 있습니다'.<br>(6) 카드 순서를 수치 → 출처 → 문장으로 재배열. 문장은 '기관 확률(OVATION %) + LAB 채점 인용(n·평균오차) + 함께 나타난 조건(태양 고도각)'까지. 원인 문장은 태양풍 수집 뒤.<br>(7) sim-questions.js 에 space.aurora(NOT_AVAILABLE, '지자기 폭풍을 계산하는 엔진이 없습니다 — NOAA SWPC 예보를 인용합니다')·space.solar_activity·space.orbital_debris 를 사유와 함께 등재 → 질문 버튼이 같은 자리에 생기고 누르면 이유를 말한다. satellite-track 은 LIMITED 그대로.<br>미루는 것: 극 모자 구간색 면·셰이더 경계선, 정식 Inspector/Legend, OVATION S3 미러와 프레임 보관, Kp 축약본·3일 막대, 위성 선택·아이콘·군 칩·기기 실측 상한, Solar 6시간 그래프, 발사 링(막대 제거)과 축약본 어댑터(핫픽스 ②로 별도 선행), Compare 작업 공간, space-weather 패킷 생산자, 통과 일괄 계산·검증.
- 비고: 읽기 전용으로 조사했다(수정·커밋·배포 없음). 외부 호출은 자사 공개 버킷 GET 뿐이다.<br>[Space 묶음은 8현상 — phenomenon-registry.js:1115-1121] 입력으로 받은 4현상 밖의 4개는 새로 결정하지 않고 지시서 처분을 그대로 인용한다: space.orbital_debris = MERGE(Satellites 의 'Debris' 칩 + 'Events: 근접사건') · 확정 범위는 P0 거짓 문구 핫픽스 S 뿐(DEV-DIRECTIVE.md:1454-1467) / space.solar_system · space.photo · space.galaxy = MOVE(v1 무료로) · P3 · S(지시서:1499·1514·1529) — 세 장면은 지구를 가리는 전체 화면(main.js:4333-4352 open())이고 태양계는 자체 날짜 슬라이더(solar-view.js:57)로 '타임라인 하나' 규칙을 어긴다. space.rocket_launch 의 MERGE 를 포함해 전부 'PD 결정 필요'.<br>[PD 결정이 필요한 충돌 2건] ① 요금표는 '정확값·source·time'을 EXPLORER 에 두지만 정직성 규칙과 DoD 는 모든 수치에 출처+시각을 요구한다 → (2)(3)을 FREE 로 두고 깊이(해상도·라이선스·요소 나이·내 장소 카드)를 EXPLORER 로 나누는 안을 적었다. ② (6)의 원인·확률 문장은 W9 가드 개정(패킷에 근거가 실리면 통과)을 전제로 한다 — 개정 전 narration_guard 는 '때문에'·'가능성'을 무조건 막는다.<br>[이번에 실측한 것] solar/meta.json 에 xrayAt 없음(2026-09-20T00:10Z 생성분) · events/launches.json 200·37KB, 스키마는 launches[] 평면 키(id,name,net,statusAbbrev,provider,lat,lon,orbitAbbrev…; probability 필드 없음) · events/launches-recent.json 200 · events/space-archive/index.json 200, 첫 날 2026-09-06 · celestrak/catalog.json.gz 1.59MB(2026-09-19 18:01Z) · celestrak/history-14d.json.gz 320KB · analysis/aurora-reports.json · solar/xray-6h.json · space/kp.json 은 403(없음/비공개) · ocean/lab-reports.json 1.5MB 안에 aurora 5건.<br>[부수 발견] (a) 위성 증거 등급이 세 곳에서 다르다: main.js:4359 'LIVE' / sat-layer.js:204 'DERIVED' / registry:529 OFFICIAL_OBSERVATION. (b) 레지스트리는 Space 7현상을 intelligence:true 로 적지만 패킷 생산자는 0 이다. (c) LAB 보고서 aurora:2026-09-09 의 제목은 '최대 Kp 5.67'인데 headline 은 '최대 Kp 3.0 (관측)' — 불일치, 원인 UNKNOWN(handler.py:477-487 이 마지막 스냅샷의 maxObserved 만 쓰는 탓일 수 있으나 미확인). (d) W38 주간 감시의 G1 일치 693/693 은 폭풍이 없던 주의 값이라 정확도 지표로 쓰면 오해를 부른다. (e) research.html 표류 작업 공간은 v2 셸에서 가는 길이 0 이다.<br>[확인하지 않은 것] OVATION 원천 갱신 주기·프레임 크기, SWPC 실시간 태양풍·예보 토의문·R/S/G 현재값·플레어 확률 제품의 URL·형식(저장소에 수집기 없음 — 전부 UNKNOWN, 구현 전 실측), Newell 외 2007 서지(저장소 밖), engine-v11 내부.<br>[관련 파일] D:\## APP\EARTHUS v2_APP\prototype\v2-three\js\live-layers.js · sat-layer.js · main.js · ui-shell.js · sim-questions.js · phenomenon-registry.js · scenario-compare.js · intel-strip.js · research\workspace.js / D:\## APP\EARTHUS v2_APP\prototype\js\spaceops\model.js · prototype\js\aetherus\core.js / D:\## APP\EARTHUS v2_APP\aws\lab-events\handler.py · aws\space-archive\handler.py · aws\ocean-solar\handler.py · aws\archiver\handler.py · aws\launch-feed\handler.py · aws\celestrak-proxy\index.mjs / D:\## APP\EARTHUS v2_APP\services\aetherus-orbital\artifacts\evidence\P5.json / D:\## APP\EARTHUS v2_APP\docs\earthus-v2\PAID-UX-REDESIGN-2026-09-20\DEV-DIRECTIVE.md

<details><summary>descriptor 초안</summary>

```js
{
  id: 'space', rail: 8, label: { ko: '우주', en: 'Space' },
  modes: ['aurora' /* 기본 진입 */, 'satellites', 'solar'],
  enter: { camera: 'north-polar', cameraNote: '북극권이 보이게 카메라를 옮겼습니다', chips: ['남반구 보기'], clearWeatherFields: true, keepView: ['clouds', 'nightlights'] },
  fields: {
    'aurora.prob': { phenomenon: 'space.aurora', renderer: 'FieldRenderer', kind: 'scalar',
      grid: { nx: 360, ny: 181, res: 1.0 }, texture: 'uint8 R=percent', wrap: 'repeatLon+halfTexel+poleRowUV',
      mesh: { type: 'polarCap', minAbsLat: 35, terrainFollow: 'surfR + cellMax3x3', rebuildOn: 'exaggeration' },
      blend: 'alpha' /* Additive 폐기 */, contour: 'shaderEdgeAtBreaks', labelsOnGlobe: false,
      dayMask: { by: 'subsolarPoint(now+offset)', style: 'hatch+dim', legendNote: 'OVATION 값은 낮·구름을 고려하지 않는다' },
      valueAt: 'cpuCopy.nearestCell', precisionNote: '1°×1° 칸 값(모델 출력) — 지점 실측 아님' },
  },
  events: {
    satellites: { phenomenon: 'space.satellite', renderer: 'EventLayer.points+icons',
      groups: ['korea', 'stations', 'weather', 'science', 'nav', 'comm', 'earth', 'starlink', 'all'], defaultOn: ['korea', 'stations'],
      colorBy: ['group', 'altitude'], altitudeBandsKm: [600, 1200, 2000, 'MEO', 'GEO', 'HEO'],
      cap: { rule: 'deviceMeasuredBudget', tickBudgetMs: 8, capMin: 400, sampling: 'stratified(inclination×shell)', legend: '전체 N기 중 M기 표시' },
      pick: 'screenNearest(excludeFarSide)', onSelect: ['track1Orbit(earthFixed)', 'subpointRing'], toggles: ['Show Orbits'], badge: 'DERIVED' },
    launches: { phenomenon: 'space.rocket_launch', status: 'MERGE 제안 — PD 결정 필요', renderer: 'EventLayer.ring+countBadge',
      severity: { by: 'hoursToNET', breaks: [24, 72, 168, 336] }, trajectory: null /* 발사 방향 자료 없음 */, tick1s: true, tierLock: 'FREE' },
    debris: { phenomenon: 'space.orbital_debris', status: 'MERGE 제안 — PD 결정 필요 · P0 거짓 문구 핫픽스 선행', symbols: { payload: '●', rocketBody: '▲', debris: '◆' } },
    subsolar: { renderer: 'EventLayer.marker+terminatorLine', badge: 'DERIVED(계산값)' },
  },
  scale: {
    'aurora.prob': { type: 'stepped-absolute', breaks: [20, 40, 60, 80], hideBelow: 5, colors: ['gray', 'yellowgreen', 'green', 'cyan', 'violet'], legendNote: '<5% 표시 안 함' },
    kp: { type: 'stepped', breaks: [5, 6, 7, 8, 9], labels: ['G1', 'G2', 'G3', 'G4', 'G5'] /* lab-events g_scale 과 같은 표 */, style: { observed: 'fill', forecast: 'outline' } },
    xray: { type: 'log-bands', breaksWm2: [1e-7, 1e-6, 1e-5, 1e-4], labels: ['A', 'B', 'C', 'M', 'X'], gap: 'breakLine(0=결측)' },
  },
  units: { 'aurora.prob': '%', kp: 'Kp', altitude: 'km', speed: 'km/s', xray: 'W/m²', net: ['KST', 'UTC'] },
  inspector: { header: 'KpCard{value, product:"3h Kp"|"1분 추정 Kp", time_tag, G}', toggles: ['Probability', 'Satellites', 'Show Orbits'], sliders: 0, appearanceMovedToView: ['auroraShimmer'] },
  sources: [
    { id: 'ovation', agency: 'NOAA SWPC', product: 'OVATION Aurora Forecast', kind: 'OFFICIAL_FORECAST', res: '1°', times: { observed: 'Observation Time', valid: 'Forecast Time' }, license: 'PD(US Gov)', path: '신규 S3 미러(S) | 현행 services.swpc.noaa.gov 직접(live-layers.js:529)' },
    { id: 'kp3h', agency: 'NOAA SWPC', product: 'planetary K-index 3h + 3-day forecast', kind: 'OBSERVED|OFFICIAL_FORECAST', license: 'PD', path: 'space/kp.json (신규 S — 지금은 lab-reports 안에만)' },
    { id: 'kp1m', agency: 'NOAA SWPC', product: 'estimated 1-min Kp', kind: 'ESTIMATED', license: 'PD', path: 'events/history.json(archiver)', rule: '3h Kp 와 한 라벨 금지' },
    { id: 'goes-xray', agency: 'NOAA SWPC', kind: 'OBSERVED', license: 'PD', path: 'solar/meta.json(+xrayAt 배포 필요) · solar/xray-6h.json(신규 S)' },
    { id: 'sdo', agency: 'NASA SDO', credit: 'NASA/SDO', license: 'PD', path: 'solar/latest.jpg' },
    { id: 'celestrak', product: 'GP(OMM)+SATCAT', kind: 'DERIVED(SGP4)', path: 'celestrak/catalog.json.gz', license: 'UNRESOLVED — docs/master-plan-2026.md:360' },
    { id: 'll2', product: 'Launch Library 2 축약본', kind: 'OFFICIAL_FORECAST', path: 'events/launches.json · events/launches-recent.json', adapter: 'launches[]·lat/lon/net/statusAbbrev → buildLaunch', license: 'UNRESOLVED — AETHERUS-PR-15:111' },
  ],
  frames: {
    'aurora.prob': { type: 'single-forecast', horizonMin: [30, 90], archive: '미러 시작일 이후만(지금 0)', outside: 'hide + "이 시각 OVATION 프레임 없음 — Kp 예보만"' },
    kp: { type: 'slots-3h', past: '관측 슬롯 + 7일 1분 추정', futureH: 72 },
    satellites: { type: 'computed', fn: 'SGP4(now+timeOffsetMs)', validFor: 'epoch±7d', archive: 'celestrak/archive/dt=YYYY-MM-DD (2026-09-06~, 색인 45일)' },
    launches: { type: 'ticks', from: 'launches[].net', archive: 'events/space-archive/dt=…/hh=….json' },
    xray: { type: 'series-6h', cursor: 'timelineLine' },
    refreshMin: { aurora: 'UNKNOWN — 원천 주기 실측 뒤', solaract: 30, launch: 15 },
  },
  compare: { view: 'single-globe + strip-diff', sync: ['camera', 'time', 'legend'], modelVsModel: null,
    pairs: [
      { id: 'kp-forecast-vs-observed', kind: 'OBS_VS_FORECAST', ready: '자료·채점 있음 / UI 없음', source: 'lab-events aurora rows', caveat: '리드 합산 — 우열 선언 금지' },
      { id: 'elements-run-vs-run', kind: 'RUN_VS_RUN', ready: '자료 있음 / UI 없음', metric: 'Δkm·근원지점 14일 추세' },
      { id: 'launch-net-revisions', kind: 'TIME_VS_TIME', ready: '자료 있음 / 어댑터 필요' },
      { id: 'ovation-frame-vs-frame', kind: 'TIME_VS_TIME', ready: false, need: '미러 보관' } ] },
  intel: { producer: null /* 신규 'space-weather' */, host: 'space/intel.json', hostBranch: 'main.js intelHostFor',
    probability: [{ event: 'aurora visible in this 1° cell', p: '<OVATION>', source: 'AGENCY', model: 'OVATION', run: '<Observation Time>', valid: '<Forecast Time>' }],
    attribution: [] /* SWPC 실시간 태양풍·예보 토의문 수집기 없음 — 생기면 {claim, condition{Bz,speed,source,at}, mechanism{cite}, strength} */,
    verification: { from: 'lab-events aurora_scores', fields: ['n', 'meanAbsError', 'contingency'] },
    forbidden: ['충돌확률', '발사 성사 확률', '오늘 밤 보인다 단정', '플레어→오로라 인과(기관 발표 없을 때)'], reports: ['aurora', 'space-reentry'] },
  simulation: { snapshot: ['mode', 't', 'selection', 'camera', 'kpSlot', 'catalogGenerated'],
    entries: {
      'space.satellite': { status: 'limited', engineRef: 'prototype/v2-three/js/sat-layer.js + prototype/js/spaceops/model.js', scenarioChips: ['내 위치', '서울', '트롬쇠', '고도각≥10°', '고도각≥30°'], promoteWhen: '§N 검증 통과' },
      'space.aurora': { status: 'limited(preview)', engineRef: 'aws/lab-events/handler.py aurora_lat', scenarioChips: ['Current', 'Kp 5', 'Kp 7', 'Kp 9'], badge: 'SCENARIO PREVIEW' },
      'space.orbital_debris': { status: 'not_available', engineRef: 'services/aetherus-orbital (P5 IDEALIZED_REMOVAL)', reason: '운영 서버·기준선 근접사건 없음 · 패키지 미인수' },
      'space.solar_activity': { status: 'not_available', reason: '플레어·지자기 예측 엔진 없음 — SWPC 예보 인용' } } },
  tiers: { FREE: ['구간색 띠·범례·Kp(제품명·시각)', '클릭 값 1개', '출처·시각·배지 한 줄', '지금±스크럽', '발사 전부'],
           EXPLORER: ['내 장소 오늘 밤 카드', 'Kp 3일 막대', '궤도요소·요소 나이·머리 위 통과', 'LAB 오로라 리포트·짧은 인텔', '알림'],
           PRO: ['Compare 작업 공간', '보관 프레임·보관 카탈로그 재생', '14일 궤도 이력·이벤트 타임라인', 'Simulation', '내보내기'] },
}
```

</details>

#### 09 Terrain 지형

| 단계 | 지금 | 끝났을 때 사용자가 보고 하는 것 | 이 메뉴가 공급할 것 | 선행 | 요금 |
|---|---|---|---|---|---|
| **① 극적으로 보인다** | 🟡 ① 지형은 1급 메뉴가 아니다 — MENU_GROUPS 에서 'observation(대기질·관측)' 묶음의 마지막 멤버(phenomenon-registry.js:1092-1097), 수심·해구는 'sea'(:1074), 밤의 불빛은 'society'(:1105). ② land/terrain 을 누르면… | 좌측 레일 09 Terrain 1탭 → 새 네트워크 0건(고도 텍스처는 이미 GPU 에 있다 → uniform 전환만, 3초 기준 충족)으로 육지가 Elevation 10단 구간색(<0 · 0~100 · 100~250 · 250~500 · 500~1000 · 1000~2000 · 2000~3000 · 3000~4000 · 4000~5000 · ≥5000 m), 바다가 수심 6단(0~200 · 200~1000 · 1000~2000 · 2000~4000 · 4000~6000 · ≥6000 m)으로 바뀐다. 1000 m 주곡선 위에 '2,000 m'·'4,000 m', 바다의 고정 지수 등심선(200·1000·2000·4000·6000 m) 위에 '1000 m'·'4000 m' 숫자 라벨, Feature labels 토글로 해구 축선·이름표가 함께 뜬다. 범례(m)는 상시, 켜는 순간 사진 혼합 0 + 조명 뒤 무광 합성이라 낮·밤 반구에서 범례색=화면색. 데이터 패널에는 Elevation / Contours(육 100·250·500·1000 m, 바다 200·500·1000·2000 m 칩) / Hillshade / Satellite(Natural Earth · Blue Marble · 오늘의 지구 · 밤의 불빛 라디오) 넷만 있고 input[type=range] 는 0개 — 과장·음영·위성 혼합·태양은 View > Appearance 프리셋 칩. 전지구 시점에서는 100·250 m 칩이 비활성이고 '전역 고도맵 9.8 km/px — 가까이 가면 켜집니다'가 붙는다.<br>⚠️ *말하면 안 되는 것:* 전역 고도맵은 z4 ≈ 9.8 km/px(main.js:4479) — 전지구 시점에서 100·250 m 등고선을 그리면 없는 정밀도다(칩 비활성+사유). 화면 안 최고점·봉우리 고도 라벨 금지(9.8 km 평균이라 실제보다 낮다). 해저는 육상 DEM 보다 원본이 성기다(main.js:347-350) → 수심 구간 경계는 그 해상도까지라고 범례에 적는다. 밤의 불빛은 색 입힌 사진이지 값이… | field elevation_m(decode R*256+G+B/256-32768, CPU 사본 heightAtJs) · 구간 눈금 2표(육상 10단·수심 6단 — 제안값, PD 확정 필요) · 등고선 프리셋 2표 + 시점별 활성 규칙(전지구 1000 / 대륙 500 / 디테일 창 z9·local z10 에서 250·100) · 고정 지수 등심선 세트[200,1000,2000,4000,6000] · 라벨 규칙(주곡선·지수선에만, 상한 24 또는 기존 라벨 풀 8… | (W0~W10 번호표는 이 작업에 전달되지 않아 이름으로 적는다) P0 Global Shell(좌측 레일 9개 · View > Appearance 신설 — 슬라이더 6개 이전은 그 작업 소속) → P0 Temperature 기준 FieldRenderer(구간색·등치선·라벨·Legend… | FREE |
| **② 정확한 값** | 🟡 지도 클릭 경로(main.js:2775-2844): extScene.pick → travel.pick → seafloor.pick(해구가 켜져 있을 때만, :2821-2830) → focus.pick(국가 선택 + 인구 지표 메뉴, :2831-2837) → 그 밖의 바다는 marineSelect 가 O… | Terrain 모드에서 지도 클릭 1회 → 우측 Inspector.ValueCard. 육지: 즉시 '고도 1,240 m — 전역 고도맵 약 10 km 평균'(heightAtJs CPU 사본, 네트워크 0건). EXPLORER 는 같은 카드가 그 지점 Terrarium z10 타일 1장을 받아 '1,947 m · 타일 z10 · 약 122 m/px'로 승급되고 '주변 25 km 최저 310 · 최고 1,708 · 평균 827 m(z4 기준)'이 붙는다(디코더 재사용 local-terrain.js:157). 바다: 즉시 '수심 3,420 m — Terrarium z4', EXPLORER 는 oceanDepth.query 로 '3,512 m · GEBCO 0.1° 격자(약 11 km) 셀 최심값 기반 · 항해용 아님'. 해구: 수심 범위(depthMin~depthMax, 하나로 줄이지 않는다). 모든 카드 하단 고정 문구 '과장은 표현일 뿐 값은 실측 그대로 · 설정 50× / 지금 표시 12×'. Terrain 모드에서는 바다 클릭이 Open-Meteo 해상 조회로 새지 않는다(ValueCard 가 먼저). Satellite·밤의 불빛 모드에서는 '사진 자료 — 읽을 값이 없습니다'.<br>⚠️ *말하면 안 되는 것:* z4 값은 9.8 km 겹선형 평균 — 봉우리·협곡의 값이 아니다(라벨 필수). z10 도 약 100~150 m/px 라 정상 표고와 다를 수 있다 — '정상 1,708 m' 같은 지명 표고를 말하지 않는다. GEBCO 값은 '15초 원본 24×24 칸의 최심값을 보존한 0.1° 정보 제품'(tools/build_depth_grid.py:125)이지 실측 측심이 아니고 항해 안전 자료가 아… | 판독기 3종: ① cpuSample=heightAtJs(z4, 동기) ② preciseSample=Terrarium z10 타일 1장 비동기(실패 시 ①을 '약 10 km 평균' 라벨로 유지) ③ seaPrecise=prototype/js/ocean/depth.js oceanDepth.query(lat,lon) — 반환에 resolution·method·source·limitations·safety·gridSha256 이 이미 실려 있다(depth.js:76-… | P0 Right Inspector(ValueCard 계약 · 클릭 라우터가 '지금 메뉴'를 알아야 한다) · main.js pointerup 분기(:2793-2843) 재배선 · PD 결정: 무료 '기본 위치값'(z4 평균)과 EXPLORER '정확값'(z10·GEBCO)의 경계 —… | EXPLORER |
| **③ 출처** | 🟡 흩어져 있고 일부는 틀리다. ① 좌하단 #srcNote 는 고정 문자열 'AWS Terrarium 지형 · Natural Earth II 기본색'(main.js:5046-5047) — 바탕을 Blue Marble·밤의 불빛으로 바꿔도 'Natural Earth II'라고 계속 말한다(paintSrc 는… | ValueCard 바로 아래 같은 Inspector 의 ProvenanceCard. 고도: 'AWS Terrain Tiles (Terrarium) · 정적 자료 — 관측 시각 없음(자료 기준일 고정) · 전역 z4 ≈ 9.8 km/px / 이 값은 z10 ≈ 122 m/px · 원천 DEM 구성·라이선스 문구: 확인 전(UNKNOWN 으로 표기)'. 구간색·등고선: 배지 EARTHUS_ANALYSIS — '고도맵에서 EARTHUS 가 유도한 선·색, 값은 원자료 그대로'. 수심 정밀값: manifest 그대로 'GEBCO 격자 title · DOI · credit · 원본 15초 · 0.1° 최심값 집계 · 수직 기준 mean sea level(얕은 곳은 원천마다 다름) · gridBuilt · sha256 · 항해용 아님'. 해구: 'GEBCO SCUFN 가제티어(IHO DCDB/NOAA NCEI) feature id — 축선=기관 자료 / 옆 수심=EARTHUS 분석'. 위성 바탕: '산출물명 · 촬영일 · 타일 N/50 · 일별\|합성본 · NASA 출처표기(보증 암시 없음)', 폴백이면 '2016 합성본 — 현재 불빛 아님'. 좌하단 출처 줄은 지금 켜진 바탕을 따라간다.<br>⚠️ *말하면 안 되는 것:* 정적 자료에 'Obs time'을 지어내지 않는다 — '자료 기준일 고정'이라고만 한다. Terrarium 이 어느 지역에 어느 DEM 을 썼는지, 수직 기준면이 무엇인지는 저장소에 근거가 없다 → 모르면 UNKNOWN. Esri 사진은 타일마다 촬영일이 달라 단일 날짜를 말할 수 없다. 합성본(2016·2012)을 '이틀 전 관측'으로 표기하면 거짓이다. 등고선·구간색을 OBSERVED… | 출처표 5행: terrarium{name, grid z4/z5~9/z10, time:static, composition:UNKNOWN, license:UNKNOWN} · gebco-depth-grid{manifest.source 의 title/doi/url/credit/created 2026-04-17/15 arc-second/verticalDatum, method, limitations, sha256 — tools/build_depth_grid.py:113-… | P0 Right Inspector(ProvenanceCard) · Terrarium 원천 구성·라이선스 확인(1회 조사 — 확인 전에는 UNKNOWN 표기로 출시 가능) · Esri World Imagery 유료 이용 조건 확인(오늘도 키 없이 호출 중: main.js:949, :11… | EXPLORER |
| **④ 시간축** | 🟡 타임라인은 이미 화면에 하나다(#ts-range −1440~+7200분 = −24h~+5일, ui-shell.js:1334). onTimeOffset(main.js:4891-4899)이 하는 일: 구름 예보 오프셋, liveLayers.setTimeOffset(서울 혼잡·태풍 예보 위치만 반응, liv… | Global Timeline 은 그대로 하나. Terrain 의 Elevation·Contours·Hillshade 에서는 타임라인 옆에 '정적 자료 — 태양만 움직입니다' 상태 칩이 뜨고, 스크럽하면 그 시각의 실제 태양 방위·고도로 그림자가 움직인다(예: +14h 로 끌면 설악산 동사면에 해가 든다 · 라벨 'T+14:00 · 태양 재계산'). View > Appearance 의 태양이 '고정'이면 칩이 '태양 고정됨 — 시간축과 분리'로 바뀐다. Satellite 의 '오늘의 지구'·'밤의 불빛'에서는 타임라인이 날짜 모드(1일 단위, 과거 방향만)로 바뀌어 그 날짜의 GIBS 타일을 받아 보여 주고, 미래 구간은 회색 + '위성 사진에는 예보가 없습니다'. 공개 지연 안쪽(트루컬러 36h·밤 불빛 54h)은 '아직 공개 전'. +5일 예보 구간에서 지형 자료는 그대로이고 그림자만 천문 계산으로 움직인다. 태양 스크럽은 지금처럼 FREE 로 남고, 위성 날짜 축(과거 보관분)은 EXPLORER.<br>⚠️ *말하면 안 되는 것:* 지형의 과거·미래 프레임을 만들지 않는다(지형 변화 자료 없음). 위성 사진의 미래 날짜는 없다. 타일이 25/50 미만인 날은 그리지 않고 '그 날짜 자료 부족'이라고 한다. 밤의 불빛 날짜를 바꿔 밝기가 달라 보여도 구름·달빛·갭필 차이일 수 있다 — 변화라고 말하지 않는다. | temporal 선언: data=static / sun=astronomical(subsolarPoint) / imagery=date축{step 1d, past only, lagH 36\|54, 최소 타일 25/50 — main.js:5826}. 프레임 로더 loadGibsBase(st, dayShift) 재사용(날짜를 직접 받도록 인자만 일반화). 상태 칩 문구 3종(정적·태양 고정·공개 전). 시작 때 받은 밤 텍스처를 프레임 저장소에 {tex,date,la… | P0 Single Timeline(모드 개념·상태 칩 자리) · P0 View > Appearance(태양 실시간/고정) · 공용 프레임 저장소 계약(Temperature 기준 구현체가 먼저 정한다) · GIBS 과거 날짜 타일 가용 범위 실측(일별 산출물별 보관 시작일 — UNKNO… | EXPLORER |
| **⑤ 비교** | ❌ v2-three 전체에서 split globe·wipe·compareMode·CompareWorkspace 검색 0건(js·html·css). ui-shell.js 의 'compare' 일치는 localeCompare·문장 속 단어뿐(:590, :608, :692). 설정 서랍의 '비교: Cesium… | TOP 의 Compare(모든 메뉴 같은 자리) → Terrain 에서는 Variable 기본값이 'Satellite imagery': 왼쪽 2026-09-18 \| 오른쪽 2026-09-11 의 '오늘의 지구'(또는 밤의 불빛)를 split 또는 draggable wipe 로, 카메라·태양 시각 동기화. 각 쪽 머리에 '촬영일 · 타일 N/50 · 일별\|합성본'. 사진이라 공통 legend·diff 모드는 없고 그 사유가 diff 버튼 자리에 적힌다('값이 없는 사진 — 차이를 계산하지 않습니다'). 두 번째 짝: Elevation 구간색 \| Satellite wipe(같은 곳의 값과 모습). Inspector 에서 바다를 클릭하면 Compare 줄에 'Terrarium z4 3,420 m \| GEBCO 0.1° 3,512 m · 차 92 m — 해상도·집계 방식 차이이며 어느 쪽도 실측 측심이 아닙니다'. URL 공유 compare=terrain.sat:2026-09-18\|2026-09-11.<br>⚠️ *말하면 안 되는 것:* 모델↔모델·런↔런은 이 메뉴에 없다 — GFS\|ECMWF 칸을 비워 두지 말고 '지형에는 모델이 없습니다'라고 쓴다. DEM↔DEM 면 비교는 두 번째 DEM(Copernicus GLO-30 등) 수집기가 없어 불가. 밤의 불빛 두 날짜의 값 차이(diff)는 복사휘도 자료(VNP46A2 HDF5)가 없어 불가 — 사진 wipe 까지만. 사진 두 장의 차이를 '변화'로 단정하지 않는다(구… | 비교 짝 선언 4개: time-time(위성 바탕 날짜 A\|B, ready) · source-source(지점 수심 Terrarium z4 vs GEBCO 0.1°, Inspector 줄, ready) · view-view(Elevation\|Satellite wipe, ready) · point-point(A–B 고도 단면, 도구 없음 — 신규). notApplicable=[model-model, run-run, agency-agency]와 그 사유 문장.… | P1 Compare workspace(split/wipe·카메라/시간 동기화·URL 공유) · (4)의 위성 날짜 프레임 저장소 · 지구 셰이더의 uBaseMap 을 좌우 2장으로 받는 변형(uniform 1개 + wipe 위치) · 단면 도구는 신규(v2-three/js/measur… | PRO |
| **⑥ Intelligence** | ❌ intelHostFor 가 패킷을 돌려주는 현상은 hazards.typhoon · hazards.earthquake · ocean.sst · weather.temperature_anomaly 넷뿐(main.js:4098-4112) — 지형·수심·해구·밤의 불빛은 null. 레지스트리도 capabilit… | Inspector 의 Intelligence(탭 Now·Analysis 만 채워지고 Forecast·Climatology 는 '지형에는 해당 없음'). 배치는 수치→출처→문장. 바다 클릭 예: '수심 4,012 m · 이 수심의 장파 속도 198 m/s(약 714 km/h)' → 'GEBCO 0.1° 셀 최심값 기반 · c=√(g·h)' → 문장 '이 바다에서 쓰나미 첫 파가 시속 약 710 km 로 갈 수 있는 원인은 수심 4,012 m 입니다 — 장파 속도는 수심의 제곱근에 비례합니다. EARTHUS 쓰나미 도달시간 계산(eta-v1)이 같은 식과 같은 격자를 씁니다.'(attribution kind=computed). 해구 클릭 예: '마리아나 해구 축선은 PB2002 수렴 경계에서 N km 안에 있습니다. 해구는 한 판이 다른 판 아래로 들어가는 곳에 생깁니다 — 교과서 기작이며 이 자리에서 EARTHUS 가 계산한 것은 거리뿐입니다.'(co_located + reference). 육지 예: '고도 1,947 m · 주변 25 km 평균보다 +1,120 m'. 확률 칸: '지형에는 확률로 말할 미래가 없습니다 — 이 지형 위 사건의 확률은 Hazards(태풍 51멤버 통과 비율)에서 봅니다' + 링크.<br>⚠️ *말하면 안 되는 것:* **확률(%)은 이 메뉴에서 말할 수 없다** — 기관 확률·앙상블 비율·채점된 모형 어느 것도 지형에는 없다. 원인은 두 종류만: 물리식으로 계산되는 것(수심→장파 속도)과 교과서 기작(reference 라고 표기, 이 자리에 대한 EARTHUS 의 검증 아님). '고도가 높아서 N°C 춥다'는 표준 기온감률(6.5°C/km) 참고값으로만 — GFS 0.5° 기온은 산을 분해하지 못해 실… | 신규 패킷 생산자 'terrain-point-packet'(Lambda 아님 — 이미 받은 CPU 사본과 (2)의 값으로 클라이언트에서 조립, 새 요청 0건이라 계약 §C-0 의 '띠는 요청·계산하지 않는다'와 충돌하지 않지만 '생산자는 서버'라는 관례와 다르므로 계약 확인 필요). WHAT: elevation·relief25km·slope·depth·longWaveSpeed. attribution[]: {kind:'computed', mechanism:'c=… | P1 Intelligence Inspector · 인텔 패킷 v1 의 attribution[]/probability[] 확장(공용 작업) · (2) ValueCard 판독기 · PB2002 선분까지의 거리 계산(소규모 신규) · 계약 확인: 클라이언트 조립 패킷 허용 여부. | EXPLORER |
| **⑦ Simulation** | 🟡 SIM_CAPABILITIES['land.terrain'] = status NOT_AVAILABLE, engine null, 질문 'terrain-change'(sim-questions.js:207-219). 메뉴를 고르면 선택 문맥에 '궁금한 점' 버튼(sq-na)으로 뜨고 누르면 이유 문장을 말한다… | TOP 의 Simulation(모든 메뉴 같은 자리)을 누르면 지금 상태 스냅샷{카메라·시각·모드 elevation·등고선 간격·클릭 지점}을 저장하고 별도 작업 공간으로 들어간다: Current(지금 Terrain 화면) → Baseline → Scenario 칩 → Result. 칩 3개가 모두 보이되 지금은 비활성이고 각자 사유를 말한다 — '가상 진원 쓰나미 도달시간: 엔진은 있습니다(eta-v1). 지금은 실제 M6.5+ 사건에만 계산합니다 — 사용자 지정 진원 입력 경로가 아직 없습니다' · '해수면 +1 m: 침수 노출 셈은 검증 뒤 공개(ocean.sea_level_rise 소속)' · '지형 변화: 계산 엔진이 없습니다 — 지형은 AWS Terrain Tiles 고도를 그대로 그립니다'. Result 자리에는 '최근 실제 사건의 쓰나미 도달시간 계산 보기'(available) 링크 — 이 메뉴의 수심이 그 계산의 입력이라는 한 줄과 함께. 슬라이더 없음, 빠져나오면 스냅샷으로 복귀.<br>⚠️ *말하면 안 되는 것:* 고도맵 물채움(bathtub)을 시뮬레이션이라 부르지 않는다 — z4 9.8 km/px·수직 정밀도·제방·연결성 무시. 가상 진원 계산이 열려도 그것은 '첫 파 도달시간의 물리 근사'이지 파고·침수·피해가 아니고 공식 경보가 아니다(handler.py:8-11). 지형 변화(침식·융기·산사태)는 엔진도 자료도 없다 — 그림으로 흉내 내지 않는다. 태양·계절 그림자는 천문 계산이지만 View… | 시나리오 선언 3개(id·engineRef·status·reason·need): tsunami-virtual-source{engineRef aws/tsunami-eta/handler.py, not_available, need: on-demand 호출 경로+가상 시나리오 배지+RunRecord} · sea-level-plus{engine null, owner ocean.sea_level_rise sim-questions.js:281-294} · terrain-c… | P2 Simulation workspace(스냅샷·칩·RunRecord) · 가상 진원을 하려면 tsunami-eta 를 사건 스케줄(15분)에서 on-demand 로 부르는 경로(Function URL 은 CloudFront OAC·AWS_IAM 제약 있음) — 별도 결정 · 해수면… | PRO |

- **⑤ 비교 짝:** 1순위(지금 자료로 바로 됨) — 시각↔시각: 위성 바탕의 날짜 A \| 날짜 B (VIIRS True Color 일별, 밤의 불빛 Black Marble 일별). GIBS 는 날짜 지정 WMTS 이고 loadGibsBase 가 이미 dayShift 인자를 받는다(main.js:5801-5805). 값 없는 사진이므로 split·wipe 만, diff 금지, 양쪽에 촬영일·타일 N/50·일별/합성본 표기, '구름·연무·달빛 차이일 수 있음' 고지.<br>2순위(지금 됨, 점 단위) — 자료원↔자료원: 클릭 지점 수심을 Terrarium z4(heightAtJs) \| GEBCO 0.1° 셀 최심값(prototype/js/ocean/depth.js Range 조회)으로 Inspector Compare 줄에 나란히. 면 비교는 아니다(depth-grid 는 13MB Range 조회용 — 텍스처로 올리지 않는다).<br>3순위(지금 됨) — 표현↔표현: Elevation 구간색 \| Satellite 사진 wipe. 엄밀히는 '비교'보다 '겹쳐 보기'라 Compare workspace 의 wipe 부품만 빌린다.<br>4순위(신규 작업, PRO) — 지점↔지점: A–B 고도·수심 단면. 도구가 없다(v2-three/js/measure.js 는 ?measure=1 UX 현장 측정판).<br>안 되는 짝(지어내지 않는다): 모델↔모델·런↔런·기관↔기관(지형에는 모델·런·발표기관 경쟁이 없다) · DEM↔DEM 면 비교(두 번째 DEM 수집기 없음) · 밤의 불빛 값 diff(VNP46A2 복사휘도 수집기 없음 — 2단계 '자료 확보' 뒤에만, 한·일·대 타일 한정이면 L).
- **⑦ 시나리오:** 저장소에 있는 엔진 1순위: aws/tsunami-eta (eta-v1, SIM_CAPABILITIES hazards.tsunami = available). 이 메뉴의 자료(GEBCO 수심 격자 ocean/depth-grid.bin)가 곧 그 엔진의 입력이다(handler.py:34, c=√(g·h) 0.2° Dijkstra). 정직한 시나리오 = '가상 진원 쓰나미 도달시간'. 가용성: 지금은 NOT_AVAILABLE — 엔진이 USGS M6.5+·깊이 100 km 이하 실제 사건에만 15분 스케줄로 돌고(404 = 계산 대상 아님) 사용자 지정 진원 입력 경로·가상 시나리오 배지·SimulationRunRecord 가 없다. 그래서 Terrain 의 Simulation 입구는 칩을 비활성+사유로 두고 '최근 실제 사건 계산 보기'(available)로 연결한다.<br>부품만 있음: prototype/js/earthus2/v02/hydrology/runoff-routing.js — scsRunoffMm·routeLinearReservoir·floodScenarioGate(23줄 순수 함수, v2-three 참조 0건). 게이트가 demReady·hydrographyReady·calibrationReady 를 모두 요구 → 하천망·보정 자료가 없어 SCENARIO_BLOCKED. local-terrain.js:2 의 '향후 홍수·GLOF' 는 예고일 뿐.<br>엔진 없음: 지형 변화(sim-questions.js:207-219 NOT_AVAILABLE 유지) · 해수면 +N m 노출(ocean.sea_level_rise :281-294 소속, NOT_AVAILABLE 유지 — 고도맵 물채움은 시뮬레이션이라 부르지 않는다).<br>해당 없음: services/research-runtime 의 모델 2종(surface-passive-advection v1 · v2.windage)은 해양 표류라 지형과 무관. prototype/v2-deploy/engine-v11/environment/transport-simulator.js 는 오염 이송 — 지형 메뉴 시나리오 아님.<br>의미 있는 다음 후보와 필요한 것: ① 가상 진원(엔진 있음 — on-demand 경로+RunRecord) ② 해수면 +1/+2/+5 m 노출(고해상 연안 DEM·연결성·검증 필요, 수집기 없음) ③ 유역 유출(하천망·CN·보정 필요). 입구는 세 경우 모두 TOP > Simulation 같은 자리.
- **첫 단면(7단계를 전부 관통하는 가장 얇은 출시):** 7단계를 전부 관통하는 가장 얇은 단면 — '육지 Elevation 한 모드'로 뚫는다.<br>(1) Elevation 구간색 10단 + 1000 m 등고선(등심선 셰이더를 h≥0 으로 일반화, 이미 읽은 h 재사용) + 상시 범례 + 주곡선 라벨 최대 8개(기존 라벨 풀 재사용). 켜면 사진 혼합 0·조명 뒤 합성. 새 네트워크 0건.<br>(2) 지도 클릭 1회 → Inspector.ValueCard 에 heightAtJs 값 '고도 N m — 약 10 km 평균' + '설정 과장 50× / 지금 표시 N×'. 바다는 'Terrarium z4 수심'. Terrain 모드에서는 바다 클릭이 Open-Meteo 해상 조회를 부르지 않는다.<br>(3) ProvenanceCard 'AWS Terrain Tiles (Terrarium) · 정적 자료 · z4 ≈ 9.8 km/px · 원천 구성 UNKNOWN' + 배지 EARTHUS_ANALYSIS(구간색·등고선). 같이 고친다: main.js:5046 고정 출처 문자열이 현재 바탕을 따라가게, sim-questions.js:217 출처 문구.<br>(4) Global Timeline 에 '정적 자료 — 태양만 움직입니다' 상태 칩(코드는 이미 태양을 재계산한다 — 말만 붙인다).<br>(5) Compare 입구(공통 자리) + 위성 바탕 날짜 A\|B wipe 한 짝(loadGibsBase dayShift 재사용). Compare workspace(P1)가 오기 전에는 입구 + '지형에는 모델이 없습니다 — 위성 사진 두 날짜 비교가 준비 중' 사유.<br>(6) Intelligence: 수치(고도·주변 25 km 기복) → 출처 → 문장 1종만 — 바다 클릭 시 '수심 → 장파 속도 c=√(g·h)'(computed). probability 는 빈 배열 + 사유 한 줄 + Hazards 링크.<br>(7) Simulation 입구(공통 자리) + 스냅샷 저장 + 칩 3개 비활성 사유 + '최근 실제 쓰나미 계산 보기' 링크. SIM_CAPABILITIES 에 ocean.bathymetry 등재.<br>미루는 것: 바다 수심 구간색 · 고정 지수 등심선과 그 라벨 · 100/250 m 프리셋(디테일 창 안에서만) · z10 정밀 고도와 GEBCO 0.1° 값(EXPLORER) · 해구 MERGE · 밤의 불빛 picker 이동(1a)·고해상(1b)·복사휘도(2단계 — 수집기 부재, 별도 '자료 확보') · 위성 날짜 축 · A–B 단면 · PB2002 거리 문장 · 가상 진원. 슬라이더 6개의 View > Appearance 이전은 이 단면이 아니라 P0 Global Shell 작업에 속한다(선행 조건).
- 비고: ■ 선행 분석과 다른 실측(이번에 직접 열어 확인)<br>1. 'depth-grid.bin 브라우저 소비자 0건'은 틀렸다 — prototype/js/ocean/depth.js:45-87 이 S3 Range(약 7KB)로 GEBCO 0.1° 지점 수심을 읽고 v2 의 ext/hobby-dive.js:35 가 이미 쓴다. Inspector 수심값에 Lambda(aws/ocean-depth)가 필요 없다. manifest 가 title·DOI·credit·created(2026-04-17)·15 arc-second·verticalDatum 을 싣는다(tools/build_depth_grid.py:113-124) → ProvenanceCard 를 그대로 채울 수 있다.<br>2. 'measure.js 확장으로 단면도'는 오독 — prototype/v2-three/js/measure.js 는 ?measure=1 UX 현장 측정판(과제 5개 탭 수·FPS)이다. 거리·단면 도구는 v2 에 없다 → 신규 작업.<br>3. 좌하단 출처 줄이 고정 문자열이다(main.js:5046) — 바탕을 Blue Marble·밤의 불빛으로 바꿔도 'Natural Earth II 기본색'이라고 말한다. 작지만 정직성 버그.<br>4. 배지 불일치 — 등심선 카드는 'OBSERVED'(main.js:4482), engine-bridge 는 EARTHUS_ANALYSIS(engine-bridge.js:189-190; 레지스트리 문구의 :188/:190 은 지금 :190/:192 로 밀려 있다).<br>5. 설정 서랍 base-seg 에는 버튼이 3개(ne2·bluemarble·truecolor, index.html:1471-1475)뿐이고 '밤'은 없다 — 밤의 불빛은 land/base-night 메뉴 줄(ui-shell.js:53, main.js:4417-4418)로만 켠다.<br>6. 지형은 지금 'observation(대기질·관측)' 묶음 소속(phenomenon-registry.js:1092-1097) — 1탭 진입 DoD 불충족.<br>■ PD 결정 필요 목록: 육상 10단·수심 6단 구간값 / 바다 등심선 간격 표 / 콘셉트 09 'Exaggeration 2x' 패널 vs 본문(View>Appearance) / 무료 기본값(z4)과 EXPLORER 정확값(z10·GEBCO)의 경계 / 출처·시각을 EXPLORER 에 두는 요금표 vs 정직성 규칙 6(제안: 한 줄은 무료, 상세는 EXPLORER) / hobby/trench 상세 카드 10곳의 자리 / 밤의 불빛 MOVE / 클라이언트 조립 인텔 패킷 허용 여부.<br>■ 이 메뉴의 정직한 결론: 7단계 중 (5)·(6)·(7)은 다른 메뉴보다 얇을 수밖에 없다 — 지형에는 모델·런·확률·예보가 없다. 문법(같은 자리의 입구·같은 부품)은 지키되, 비교는 '날짜↔날짜 사진'과 '자료원↔자료원 지점값', 인텔은 '계산되는 물리(수심→장파 속도)+교과서 기작', 시뮬은 '입구+사유+쓰나미 계산으로 가는 링크'로 채운다. 유료 가치는 정밀값·출처 깊이·날짜 보관분·단면·export 에서 나오며, Esri 고해상 위성은 이용 조건 확인 전 약속하지 않는다.<br>■ 확인하지 못한 것(UNKNOWN): Terrarium 원천 DEM 구성·라이선스·수직 기준면 / GIBS 일별 산출물의 과거 보관 시작일 / GIBS EPSG:3857 에 VNP46A2 고배율 층 존재 여부 / Esri World Imagery 유료 이용 조건 / W0~W10 번호표(이 작업에 전달되지 않아 dependsOn 은 작업 이름으로 적었다). advisor 도구는 호출 한도로 응답하지 않아 검토 없이 제출한다.

<details><summary>descriptor 초안</summary>

```js
{
  id: 'terrain', rail: 9, label: { ko: '지형', en: 'Terrain' },
  phenomena: ['land.terrain', 'ocean.bathymetry', 'ocean.trench'],   // trench = MERGE(Feature labels)
  viewOnly: ['people.night_lights'],                                  // MOVE → Satellite imagery picker (값 없음) — PD 결정 필요
  temporal: { data: 'static', sun: 'astronomical', imagery: 'date' }, // GlobalTimeline 모드: sun-only | date
  modes: ['elevation', 'contours', 'hillshade', 'satellite'],         // 데이터 패널은 이 넷뿐 · range 입력 0개
  fields: {
    elevation_m: {
      source: { kind: 'height-texture', uniform: 'uHeightMap', decode: 'terrarium(R*256+G+B/256-32768)', cpu: 'heightAtJs' }, // 새 텍스처·새 수집기 없음
      unit: 'm', precision: 0, badge: 'STATIC',                         // 모델 아님 · 관측 시각 없음
      grid: { global: 'z4 ≈ 9.8 km/px', detail: 'z5~z9 창', point: 'z10 타일 1장 ≈ 153 m/px × cos(lat)' },
    },
  },
  scale: {
    land: { type: 'stepped', breaks: [0, 100, 250, 500, 1000, 2000, 3000, 4000, 5000], unit: 'm', status: 'PROPOSED — PD 확정 필요' },
    sea:  { type: 'stepped', breaks: [-200, -1000, -2000, -4000, -6000], unit: 'm', status: 'PROPOSED — PD 확정 필요' },
    compose: { photoMixWhenOn: 0, order: 'after-lighting-matte', seaMask: 'h<0' },  // 범례색 = 화면색(낮·밤)
  },
  contours: {
    land: { presets: [100, 250, 500, 1000], majorEvery: 5,
            enableBy: { global: [1000], continent: [500, 1000], detailWindow: [100, 250, 500, 1000] }, disabledReason: '전역 고도맵 9.8 km/px' },
    sea:  { presets: [200, 500, 1000, 2000], index: [200, 1000, 2000, 4000, 6000] },  // 라벨은 고정 지수선에만
    shader: 'main.js EARTH_FRAG 등심선 블록(501-521)을 육지로 일반화 · 줌 2배 성김 유지 · h 재사용(모바일 1탭)',
    labels: { anchor: 'prototype/js/contour-math.js @512px 솎은 격자', max: 24, onlyOn: ['major', 'index'], peakLabels: false },
    forbidden: [],
  },
  features: { trench: { module: 'seafloor.js', toggle: 'Feature labels', evidence: { axis: 'OFFICIAL_OBSERVATION', depthBeside: 'EARTHUS_ANALYSIS' }, range: 'depthMin~depthMax' } },
  imagery: [
    { id: 'ne2', src: 'Natural Earth II', static: true },
    { id: 'bluemarble', src: 'NASA GIBS BlueMarble_ShadedRelief_Bathymetry', date: '2004-01-01' },
    { id: 'truecolor', src: 'NASA GIBS VIIRS SNPP True Color', daily: true, lagH: 36 },
    { id: 'night', src: 'NASA Black Marble VNP46A2 (GIBS)', daily: true, lagH: 54, values: false,
      fallback: [{ layer: 'VIIRS_Black_Marble', label: '2016 합성본 — 현재 불빛 아님' }, { layer: 'VIIRS_CityLights_2012', label: '2012 합성본 — 현재 불빛 아님' }],
      cache: '{tex, date, label} 를 묶어서' },
    { id: 'esri-zoom', src: 'Esri World Imagery (줌인 표면)', terms: 'UNKNOWN — 유료 가치로 약속 금지 · 출처를 설정값으로' },
  ],
  inspector: {
    value: [
      { tier: 'FREE',     from: 'heightAtJs (네트워크 0)', label: '전역 고도맵 약 10 km 평균' },
      { tier: 'EXPLORER', from: 'Terrarium z10 타일 1장', label: '타일 z · 약 m/px', fallback: 'z4 값 유지' },
      { tier: 'EXPLORER', sea: 'prototype/js/ocean/depth.js oceanDepth.query (Range ≈7KB)', label: 'GEBCO 0.1° 셀 최심값 기반 · 항해용 아님' },
    ],
    relief: { radiusKm: 25, from: 'z4 CPU 사본', out: ['min', 'max', 'mean'] },
    fixedNote: '과장은 표현일 뿐 값은 실측 그대로', exaggeration: ['exagUser(설정)', 'uExagger(지금 표시)'],
    clickPriority: ['ValueCard', 'trench pick', 'country focus'], suppress: ['marineSelect(Open-Meteo)'],
  },
  sources: [
    { id: 'terrarium', name: 'AWS Terrain Tiles (Terrarium)', time: 'static', composition: 'UNKNOWN', license: 'UNKNOWN(확인 필요)', datum: 'UNKNOWN' },
    { id: 'gebco-depth-grid', name: 'ocean/depth-grid.bin + manifest(title·doi·credit·created 2026-04-17)', res: '0.1° (원본 15 arc-second 24×24 최심값)', datum: 'mean sea level(얕은 곳은 원천마다 다름)', note: '정보 제품 · 항해용 아님' },
    { id: 'scufn', name: 'GEBCO SCUFN Gazetteer (IHO DCDB / NOAA NCEI)' },
    { id: 'gibs', name: 'NASA GIBS WMTS', note: '출처표기 · NASA 보증 암시 금지' },
  ],
  frames: { data: null, imagery: { axis: 'date', step: '1d', past: true, future: false, minTiles: 25, loader: 'loadGibsBase(st, date)' } },
  compare: {
    pairs: [
      { kind: 'time-time', variable: 'satellite imagery', modes: ['split', 'wipe'], diff: false, ready: true },
      { kind: 'source-source', variable: 'sea depth @point', a: 'Terrarium z4', b: 'GEBCO 0.1°', where: 'Inspector Compare row', ready: true },
      { kind: 'view-view', a: 'elevation bands', b: 'satellite', modes: ['wipe'], ready: true },
      { kind: 'point-point', variable: 'A–B profile', ready: false, need: '단면 도구 신규' },
    ],
    notApplicable: { 'model-model': '지형에는 모델이 없습니다', 'run-run': '런이 없습니다', 'agency-agency': '발표기관 경쟁이 없습니다' },
  },
  intel: {
    producer: 'terrain-point-packet (신규 · 클라이언트 조립 · 새 요청 0건 — 계약 확인 필요)', packet: 'intel v1',
    what: ['elevation', 'relief25km', 'slope', 'depth', 'longWaveSpeed = √(g·h)'],
    attribution: [
      { kind: 'computed',   mechanism: '장파 속도 c=√(g·h)', ref: 'aws/tsunami-eta eta-v1' },
      { kind: 'co_located', with: 'PB2002 수렴 경계', metric: 'distanceKm' },
      { kind: 'reference',  note: '교과서 기작 — 이 자리에서 계산한 연결 아님' },
    ],
    probability: [], probabilityReason: '기관 확률·앙상블·채점 모형이 지형에는 없다 → Hazards 로 링크',
    tabs: { now: true, analysis: true, forecast: false, climatology: false },
  },
  simulation: {
    entry: 'TOP > Simulation (공통 자리)', snapshot: ['camera', 'time', 'mode', 'contourStep', 'point'],
    scenarios: [
      { id: 'tsunami-virtual-source', engineRef: 'aws/tsunami-eta/handler.py', status: 'not_available', need: '사용자 지정 진원 on-demand 경로 + 가상 시나리오 배지 + SimulationRunRecord' },
      { id: 'sea-level-plus', engineRef: null, status: 'not_available', owner: 'ocean.sea_level_rise' },
      { id: 'terrain-change', engineRef: null, status: 'not_available' },
    ],
    linkOut: { to: 'hazards.tsunami', label: '최근 실제 사건의 도달시간 계산 보기', status: 'available' },
    registryFixes: ['sim-questions.js:217 출처 문구(GEBCO·Copernicus → AWS Terrain Tiles)', 'ocean.bathymetry 항목 등재'],
  },
  tiers: {
    free: ['4개 데이터 모드 · 범례 · 등고선 칩', '기본 위치값(z4)', '출처 한 줄(배지·기관·기준일)', '태양 시간 스크럽'],
    explorer: ['z10 정밀 고도 · GEBCO 수심', 'ProvenanceCard 상세', '위성 날짜 축', 'Terrain Intelligence'],
    pro: ['Compare(날짜 wipe·자료원 대조)', 'A–B 단면 · export', 'Simulation workspace'],
    never: ['잠금 아이콘만으로 표현', 'Esri 고해상 위성을 PRO 가치로 약속(조건 확인 전)'],
  },
}
```

</details>

#### L Life 생명·사람

| 단계 | 지금 | 끝났을 때 사용자가 보고 하는 것 | 이 메뉴가 공급할 것 | 선행 | 요금 |
|---|---|---|---|---|---|
| **① 극적으로 보인다** | 🟡 공용 범례가 없다(ui-shell.js 에서 'legend\|범례' grep 0건). 숲: 릴리프 메시는 있으나 색이 FOREST_RAMP(v) 정점색 선형 보간(live-layers.js:2495, vertexColors :2513-2515), STEP 칸마다 한 화소만 집고(:2467-2478) '… | Life 를 누르면 3초 안에 한국 위에 숲이 4단 단계색 릴리프(수관 20~40 · 40~60 · 60~80 · 80~100%, 셰이더가 aCover 를 끊어 등급 경계가 곧 선)로 서고, 우하단 공용 Legend 에 4칸 + '수관비율 % · ESA WorldCover 2021 스냅샷 · 관측 · 화면 격자 약 1.7km 평균(원자료 550m) · 20% 미만은 그리지 않음'이 상시 보인다. 칩 [숲 \| 산림 감소 \| 인구 \| 지금 붐빔 \| 새 \| 바다거북]으로 1탭 전환: 산림 감소 = 3단색 네모(2001~2010 적갈 · 2011~2018 주황 · 2019~2023 밝은 노랑), 인구 = 명/㎢ 절대 8단 릴리프 면(1px 세로선 0개, 봉우리 상위 5곳 숫자 라벨, 첫 클릭에 한국 자동), 지금 붐빔 = 서울시 공식 4단계 색 원판 + 범위 라벨('강남역 5.2만~5.4만'), 새 = 5km 칸 면 5단 / 숫자 원판 37개 / 3단 굵기 파선 호. 어느 칩에도 막대기·단색 점 구름·선형 그라데이션이 없다.<br>⚠️ *말하면 안 되는 것:* 화면 격자를 원자료 해상도처럼 말하지 않는다(숲 한국 ≈1.7km · 일본 ≈5km, 인구 한국 ≈1.9×1.5km · 일본 0.058°). 소실 PNG 의 R 은 '그 해'가 아니라 250m 칸의 '평균 소실 연도'이고 '모든 수관 소실 · 순감소 아님'이다(forest/loss-index.json encoding · note). 조류 조사 색은 '새가 많은 곳'이 아니라 '조사 기록이… | 눈금 5벌: 수관 % 4단[20,40,60,80,100] · 소실 연도 3단[2001,2011,2019,2024) · 명/㎢ 8단[100,500,1000,2500,5000,10000,20000](<100 거의 투명) · 서울시 공식 4단계(색은 seoul-flow.json official.color 그대로) · 기록 수/개체 수 로그 5단(경계는 실제 분포를 보고 확정 — 지금은 TBD). 등치선 금지 플래그(수관은 양봉 분포, 인구는 뾰족한 장 — 1.7km… | W1(공통 렌더러 · Legend) · W7(나머지 현상) · 공용 리본 메시 헬퍼 신규(철새 · 거북 · 항로 공용). W0(GFS 프레임)에는 의존하지 않는다 — Life 는 자기 정적 자료로 돈다(병행 가능). PD 결정: 혼잡 R-01 수직 막대 보존(live-layers.js… | FREE |
| **② 정확한 값** | 🟡 LiveLayers 에 pick 메서드가 없다(live-layers.js 에서 '^\s+pick\w*\(' grep 0건). 그래서 숲 · 혼잡 · 인구를 눌러도 그 현상의 값이 나오지 않는다 — 클릭은 extScene.pick → travel.pick → seafloor.pick → focus.pic… | 지도 클릭 1회 → 우측 Inspector.ValueCard, 네트워크 0건. 숲: 원본 PNG 의 그 화소 1개(550m) → '수관 78% · 550m 칸 평균 · 기준 2021'(산림 감소 모드면 '평균 소실 연도 2013 · 사라진 비율 34%'). 인구: '약 8,400명/㎢ · 칸 1.9×1.5km · 8bit 양자화로 ±4% 안팎'. 혼잡: 원판 클릭 → '강남역 · 5.2만~5.4만 명(서울시 발표 범위) · 붐빔' + 12스텝 예측 표. 새 · 거북은 기존 ext pick 을 ValueCard 어댑터로 감싼다(정점 EB-07: 누적 3,412마리 · 조사 58회 · 1회당 59마리). 값이 없는 곳은 '자료 범위 밖(한 · 일 · 대만만)' 또는 '수관 20% 미만 — 그리지 않는 구간'이라고 말한다.<br>⚠️ *말하면 안 되는 것:* 지시서 표는 '기본값 무료 · 정확값 · 실측 대조 EXPLORER'다 — Life 에서 EXPLORER 몫은 표(정점 9년 표 · 반경 5km 연도별 소실 면적 합)이지 값 자체의 잠금이 아니다. 조류 조사(제3자 권리) · 바다거북(4유형) · 철새는 값을 유료로 가르지 않는다. 혼잡의 '가운데값'은 지금 코드가 높이 계산용으로만 쓰는 파생값(live-layers.js:792-793)이… | value.read 4종: 'pngPixel'(숲 · 소실 — 클릭 때 1×1 만 읽는다. 일본 PNG 3400×3040 화소 배열 상주 금지 — 재료: 41MB) · 'arrayCell'(인구 — v = max·(u8/255)^3 을 행별 cos(위도) 칸 면적으로 나눠 명/㎢) · 'eventPick'(혼잡 121곳 최근접 — 반경은 121곳 간격을 보고 확정, 지금 UNKNOWN) · 'extPick'(hobby-*.pick 어댑터). 정밀도 문구 표:… | W1 · W5(Inspector) + LiveLayers.pick 신규(클릭 → 위경도 사슬은 main.js:2793-2831 에 이미 있다). ext pick 5건은 어댑터만. | FREE |
| **③ 출처** | 🟡 출처 · 시각은 있으나 전부 카드 본문 끝 문장에 묻혀 있다: 숲 '출처 ${d.index.source} · ${d.index.license}'(live-layers.js:2571) — 기준년 2021 이 '지금 아님'으로 따로 표시되지 않는다, 배지 OBSERVED(:2552). 산림 감소 '출처 ·… | 같은 Inspector 의 ProvenanceCard 에 5줄 고정: 기관 / 종류 배지(OBSERVED · MODEL · HISTORY · FORECAST) / 시각 / 해상도(원자료 ↔ 화면) / 라이선스. 숲: 'ESA WorldCover 10m v200 · 관측 · 기준 2021(지금 아님) · 원자료 550m ↔ 화면 1.7km 평균 · CC BY 4.0'. 인구: 'WorldPop R2025A constrained UN-adjusted · 모델 추정 · 2025 · 0.0167° · CC BY 4.0'. 혼잡: '서울특별시 실시간 도시데이터 · 관측 14:05 / 예측 구간은 FORECAST · 서울시 · STALE 이면 범례가 회색 + ○시간 전 자료'. 조류 조사: '국립생태원 에코뱅크 · 공공누리 1유형 · 제3자 권리 포함 — 유료 가공물은 서면 확인 뒤' + 미수신(truncated) 건수. 바다거북: '국립해양생물자원관 · 추적 종료 개체 · 실시간 아님 · 공공누리 4유형'.<br>⚠️ *말하면 안 되는 것:* 출처는 유료로 가릴 수 없다 — EARTHUS 규칙(시각 · 출처 상시)이자 CC BY 4.0 · 공공누리의 출처표시 의무다. 서울 혼잡의 실제 EventBridge 주기와 서울시 키 3개 상태는 UNKNOWN(재료: schedules.sh 기준 5분이나 배포값 미확인) — SLA 를 숫자로 적지 않는다. WorldPop 을 '관측'이라 부르지 않는다. 철새 도착지 좌표는 손으로 정한 대표… | 출처표 8행(기관 · kind · time{refYear \| generatedAt \| period} · grid{source, screen} · license · rightsLock). 새 필드 둘: rightsLock(paidDerivatives:false — 조류 조사 · 바다거북) · screenGrid(블록 평균 뒤 실제 화면 격자 km — 숲 · 인구). 시각 불일치 배지 규칙: 과거 경로(거북)와 지금 수온을 같이 켜면 '경로는 과거 · 수온은… | W5(Inspector). 지시서 표의 W0 매니페스트는 GFS 용이라 무관 — Life 는 forest/index.json · loss-index.json · popgrid/index.json 과 각 S3 문서의 source · license · updated 가 매니페스트다(이미… | FREE |
| **④ 시간축** | 🟡 공용 시간축은 하나 있다: ts-range min −1440 · max 7200분 · step 30(ui-shell.js:1334) → hooks.onTimeOffset(:1351) → main.js:4891-4898. Life 에서 여기에 반응하는 레이어는 혼잡 하나뿐이다: liveLayers.set… | 시간 조작부는 하단 Global Timeline 하나, 칩에 따라 눈금 모드만 바뀐다. 지금 붐빔: 분 눈금 — +3h 로 밀면 원판이 속 빈 고리로 바뀌고 'FORECAST · 서울시' 배지, 예측 끝 시각 뒤는 감춘다. 산림 감소 · 바닷새 · 철새: 연 눈금 모드(2001~2023 / 조사 연도 / 2021~2025) — 그때 loss-year · loss-play 를 지운다. 숲 · 인구 · 조류 조사 · 거북: 시간축이 비활성으로 보이되 '2021 스냅샷 — 움직일 시간이 없습니다' 사유를 말한다. 스트립 문구에 '서울 혼잡: 서울시 공식 예측'을 추가한다.<br>⚠️ *말하면 안 되는 것:* 지시서 ④ 는 '+24h 무료 · +120h EXPLORER(제안)'이다. Life 에서 미래가 있는 자료는 서울시 공식 예측(약 +24h 안, live-layers.js:785)뿐이라 단계 자체는 FREE — 재료의 paidHook(예측 타임라인 전체 · 지난주 대비 · 숲 연도 재생 = EXPLORER)은 이 표와 어긋나므로 PD 가 고른다. v2 의 '5일 예보'는 이 메뉴에 해당 없… | frames 선언 3종: {kind:'minutes', future: forecast[] 끝 시각, past: history-index.json 48h} · {kind:'years', range:[2001,2023] \| seabird years[] \| [2021,2025]} · {kind:'none', reasonKo}. 연 눈금 모드 요구(신규 — 지금 슬라이더는 분 단위뿐). 혼잡 과거 방향 자료: aws/tourism-flow 의 history-ind… | W5(Global Timeline) + 연 눈금 모드 신규 + tourism-flow 스냅샷 집계(S). W0 무관. 연 눈금 모드가 생길 때까지 산림 감소 슬라이더는 그대로 둔다 — 세 번째 조작부를 만들지 않는다(규칙 2 부채로 명시). | FREE |
| **⑤ 비교** | ❌ v2 의 비교 코드는 scenario-compare.js 하나이고 SimulationRunRecord 둘(truthStatus 'SIMULATION' · 같은 runtime · 같은 입력 해시 · 같은 공간/시간 범위)만 받는다(:17-27, :37-59) — Life 자료는 어느 것도 해당하지 않는다… | TOP 의 Compare → split 또는 wipe, 카메라 · 범례 동기화. 1순위 '지금 붐빔': 왼쪽 관측(지금) \| 오른쪽 서울시 공식 예측(+3h) — 같은 121곳 · 같은 4단계 색, diff 는 '단계 차(−3…+3)' 색만. 2순위 숲(한국): 2001~2011 소실 \| 2012~2023 소실 wipe, 또는 한국 \| 일본 수관을 같은 4단 눈금으로(양쪽에 화면 격자 1.7km / 5km 표기). 3순위 바닷새: 2016 \| 2024 조사 1회당. 철새 · 조류 조사 · 거북은 Compare 입구는 같은 자리에 있되 '비교할 둘째 자료가 없습니다(179건 정적 / 칸별 연도 없음 / 라이선스)'를 말한다.<br>⚠️ *말하면 안 되는 것:* 모델 ↔ 모델은 성립하지 않는다 — 저장소에 둘째 인구 모델 · 둘째 산림 자료가 없다(GHS-POP 등은 후보일 뿐, 수집 · 라이선스 미확인). 서울시 '지금 있는 사람'과 WorldPop '사는 사람'은 정의와 넓이가 달라 diff · 비율을 색으로 쓰지 않는다 — 나란히 놓더라도 배지를 분리한다. 혼잡 인구는 밴드라 범위끼리 뺄셈하지 않는다. 소실 R 은 '평균 소실 연도'라 기간… | 비교 짝 선언: crowding{pair:'time↔time', a:'now(OBSERVED)', b:'+Nh(FORECAST · 서울시)', diff:'level-delta'} · forestloss{pair:'period↔period', 같은 kor-loss.png R 채널에서 두 기간 마스크 — uYear 유니폼 방식 확장} · forest{pair:'country↔country', sharedScale:true, screenGrid 양쪽 표기} · se… | W8(Compare workspace) · ① 의 단계색 · Legend · ④ 의 연 눈금. 인구 나라↔나라는 인구 릴리프(재료 1단계) 뒤. | PRO |
| **⑥ Intelligence** | ❌ intelHostFor 가 패킷을 돌려주는 현상은 hazards.typhoon · hazards.earthquake · ocean.sst · weather.temperature_anomaly 넷뿐(main.js:4098-4112) — Life 8현상은 전부 null. 띠는 패킷이 없으면 아무것도 그리지… | Inspector 의 Intelligence 는 수치 → 출처 → 문장 순서. 혼잡 예: '강남역 5.2만~5.4만 명 · 붐빔' → '서울특별시 실시간 도시데이터 · 14:05 관측' → '서울시 공식 예측은 17시에 「약간 붐빔」입니다(기관 예보 인용). 서울시 예측이 +3시간 「붐빔」을 냈을 때 실제로 「붐빔」이었던 비율은 지난 30일 ○○%(n=○○, 121곳)입니다 — EARTHUS 가 불변 스냅샷으로 채점한 값이며 서울시가 발표한 확률이 아닙니다.' 이 확률 문장은 채점 생산자가 생긴 뒤에만 뜨고, 그 전에는 probability:[] + 사유. 숲 예: '이 지점 수관 78% · 한국 육지 평균 64.1% 대비 +14%p' → 출처 → '반경 5km 에서 2001~2023 소실로 기록된 칸 ○○개, 가장 많았던 해 2013' — 원인 문장 없음. 인구 예: 06 Hazards 패킷과 이어 '태풍 ○○ 51멤버 중 N멤버(○○%)가 지나는 반경 안 거주 인구 합 약 ○○만 명(WorldPop 2025 추정 · 산술 합)' — IMPACT 절, 인과 아님.<br>⚠️ *말하면 안 되는 것:* 지금 Life 어느 현상에도 원인을 말할 근거(측정된 조건 + 문헌 기작)가 패킷에 없다. 숲 소실: Hansen 자료는 원인을 나누지 않는다('벌채 · 산불 · 병해충 · 수확 포함' — loss-index.json note) → 원인 문장 금지. 소실 원인 분류 자료(1km 원인 분류류)는 저장소 밖 후보이고 존재 · 라이선스 · 해독을 확인하지 못했다(UNKNOWN) — 확인 전에는… | 신규 생산자 후보 2건. ① crowding-verify: 입력 = app/tourism/history/ 불변 스냅샷(각 스냅샷에 그 시점 forecast[] 가 같이 저장된다 — handler.py:378-381), 틀 = prototype/js/earthus2/v02/human-flow/forecast-lifecycle.js 의 ForecastVerificationStore(addForecast · attachGroundTruth · metrics — v2… | W9(Intelligence Inspector · 패킷 v1 확장) · 신규 생산자 crowding-verify(스냅샷 보관 기간 확인 선행) · 06 Hazards Inspector(P1 — exposure-link). PD 결정: intelligence:true 깃발 3개를 생산자… | EXPLORER |
| **⑦ Simulation** | 🟡 SIM_CAPABILITIES 에 Life 현상은 people.population 하나뿐이다 — status NOT_AVAILABLE · engine null · 질문 'pop-move'('인구 이동 계산 엔진이 아직 없습니다 — 인구 기둥은 …', sim-questions.js:181-193). 나머… | TOP 의 Simulation(모든 메뉴 같은 자리)을 누르면 지금 상태 스냅샷{카메라 · 칩 · 나라 · timeOffset · 선택 지점}을 저장하고 별도 작업 공간으로: Current → Baseline → Scenario 칩 → Result. Life 의 칩은 셋이 보이되 지금은 전부 비활성이고 각자 사유를 말한다 — '노출 인구 셈(기관 침수 예상도 · 쓰나미 도달 T분 안): 산술 합은 가능하지만 칸 부분 겹침 규칙과 행정 인구 대조 검증 전입니다(ocean.sea_level_rise slr-exposure 와 같은 상태)' · '혼잡 가정(이 장소 방문 +20%면?): 계산 틀(forecastCrowd)은 있으나 계수가 없고 채점 기록이 비어 있습니다 — 지금은 서울시 공식 예측만 인용합니다' · '인구 이동 · 숲 변화: 계산 엔진이 없습니다'. Result 자리에는 available 인 쓰나미 도달시간 계산으로 가는 링크 한 줄. 슬라이더 없음, 나오면 스냅샷으로 복귀.<br>⚠️ *말하면 안 되는 것:* Life 에는 기록 남는 계산이 하나도 없다 — 그렇게 말한다. 노출 인구 셈은 '시뮬레이션'이 아니라 산술 합이다: 1.9×1.5km 인구 칸과 수백 m 침수 폴리곤이 부분 겹칠 때 '칸 안 균등 분포'를 가정해야 하고 그 가정을 Result 에 적어야 한다. forecastCrowd 는 계수를 넣어 주는 덧셈 틀일 뿐 — 계수를 채점 이력으로 맞추기 전에 돌리면 값을 지어내는 것이다.… | SIM_CAPABILITIES 항목 7건 추가(engine:null · engineRef:null · NOT_AVAILABLE + reasonKo/En — 기존 9건 등재와 같은 틀, sim-questions.js:220-350): land.forest '숲은 앞으로 얼마나 더 사라질까?' · people.crowding '사람이 더 몰리면 단계가 어떻게 될까?'(사유는 강수 선례 문장형 — '틀은 있으나 화면 자료와 연결되지 않았고 채점 기록이 없습니다',… | W10(Simulation workspace) · 06 Hazards Inspector(P1) · 노출 셈 검증(행안부 주민등록 인구 대조 — 자료 확보 UNKNOWN) · crowding-verify 채점 기록(⑥). tools/earthus-v53 시험이 SIM_CAPABILITI… | PRO |

- **⑤ 비교 짝:** 1순위(지금 자료로 바로 됨) — 지금 붐빔: 시각↔시각, '관측(지금) \| 서울시 공식 예측(+Nh)'. 같은 파일(seoul-flow.json 의 official + forecast[]) · 같은 121곳 · 같은 기관 4단계 색이라 Compare 작업공간이 카메라 · 범례만 동기화하면 성립한다. 공용 시간축에 이미 묶여 있어(live-layers.js:2857-2863) 한쪽 시각만 밀면 된다. diff 는 '단계 차(−3…+3)'만 — 인구는 기관이 밴드로 발표하므로 범위끼리 뺄셈하지 않는다. 한쪽은 OBSERVED, 한쪽은 FORECAST · 서울시 배지.<br>2순위 — 숲(한국): 기간↔기간 '2001~2011 소실 \| 2012~2023 소실' wipe. 같은 kor-loss.png 의 R 채널에서 두 기간 마스크를 만든다(지금의 uYear 유니폼 방식 확장, live-layers.js:2406-2414). 한계: R 은 250m 칸의 '평균 소실 연도'라 경계 부근 칸이 모호 — 범례 고지. 나라↔나라(한국 \| 일본 \| 대만 수관, 같은 4단)도 가능하되 화면 격자(1.7km / 5km)를 양쪽에 적는다.<br>3순위 — 바닷새: 연도↔연도(같은 37정점, 지표는 조사 1회당 yc/yn, 그 해 조사 없는 정점은 빈 고리). 자료는 이미 파일에 있다(hobby-seabird.js:128-145 가 같은 값을 카드 막대로 그린다).<br>4순위 — 인구: 나라↔나라(같은 절대 8단 명/㎢, 21개국 popgrid/index.json). 격자 해상도가 나라마다 달라(한국 0.0167° · 일본 0.058° · 미국 0.275°) 양쪽에 표기해야 하고, 인구 릴리프 재구축 뒤에만.<br>안 되는 것: 모델↔모델(둘째 인구 · 산림 모델이 저장소에 없다 — GHS-POP 등은 미확인 후보) · 서울시 관측 ↔ WorldPop 을 diff/비율 색으로(정의 · 넓이가 다르다 — 나란히 두더라도 배지 분리, 지금의 livemix 배율은 참고값) · '지난주 같은 시각 \| 지금'(tourism-flow 스냅샷 집계 S 선행) · 일본 · 대만 소실(자료 없음) · 철새 · 조류 조사 · 바다거북(둘째 자료 없음 / 칸별 연도 없음 / 라이선스) — 이들은 Compare 입구 + 사유. 기존 scenario-compare.js 는 SimulationRunRecord 전용이라(:17-27) 이 짝들에 재사용되지 않는다.
- **⑦ 시나리오:** 저장소의 기존 엔진 중 Life 입력을 받는 것은 없다. SIM_CAPABILITIES 의 Life 항목은 people.population 하나(NOT_AVAILABLE · 'pop-move', sim-questions.js:181-193)이고 나머지 7현상은 항목이 없어 셸이 질문 블록을 그리지 않는다(ui-shell.js:1205) — 첫 작업은 7건을 NOT_AVAILABLE + 사유로 등재해 입구를 같은 자리에 세우는 것이다. aws/tsunami-eta(available)는 hazards 소속, research-runtime models_v2.py 는 OceanParcels 해양 표류, engine-v11/environment/transport-simulator.js 의 advectPoint 는 바람 · 해류 · 유출 벡터장 이류(지시서 DEV-DIRECTIVE.md:174 가 바람 · 구름 · 대기질에 배정)라 Life 와 무관하다.<br>부품으로 있는 것: prototype/js/earthus2/v02/human-flow/ — algorithms.js(calculateCrowdIndex · calculateTrend · estimateScalarFlow(vector:null — 방향 없음) · forecastCrowd(계수 없는 덧셈 틀) · detectAnomaly · capacityPressure · calculateRisk) + forecast-lifecycle.js(ForecastVerificationStore · 모델 상태 사다리). v2-three 소비자 0건. 강수 선례(sim-questions.js:123-124 '엔진이 있지만 화면 자료와 연결되지 않았다')와 같은 문장형으로 사유를 적는다.<br>정직한 시나리오 후보(모두 지금은 not_available): ① 노출 인구 셈 — Scenario = 기관 발자국(국립해양조사원 침수 예상도 khoaflood, 쓰나미 도달 T분 등시선) · Result = 그 안 WorldPop 거주 인구 산술 합(absolute + Current 대비 delta). 필요한 것: 06 Hazards Inspector(P1), 칸 부분 겹침 규칙(균등 분포 가정의 고지), 행정 인구 대조 검증 — sim-questions.js:290-292 의 slr-exposure('침수 범위 노출 셈은 검증 뒤 공개')와 같은 길이다. 계산이 아니라 산술이라고 부른다. ② 혼잡 가정('이 장소 방문 +20%면 단계는?') — forecastCrowd 틀은 있으나 계수가 없다. crowding-verify 로 서울시 예측을 채점한 기록이 쌓이고 계수를 맞춘 뒤에야 의미가 있고, 그 전에는 서울시 공식 예측 인용(limited)이 전부다. calculateRisk · capacityPressure 는 수집기 규칙(handler.py:12 — 집계 인구에서 법적 수용력 · 안전 판정을 만들지 않는다) 때문에 범위 밖. ③ 숲 · 인구 이동 · 새 · 거북: 엔진도 근거도 없다 — 외삽하지 않고 '계산 대상이 아닙니다'를 말한다. SSP 격자 인구 같은 문헌 시나리오는 저장소 밖(미확인)이며 들여와도 인용이지 계산이 아니다.
- **첫 단면(7단계를 전부 관통하는 가장 얇은 출시):** 기준 구현체는 '숲(한국)' 하나 + 이미 공용 시간축에 묶여 있는 '지금 붐빔' 하나로 7단계를 끝까지 뚫는다. 숲을 고른 이유: 정적이고 CC BY 4.0 이라 권리 문제가 없고, 그림을 고치는 데 PD 결정이 걸려 있지 않으며, 여기서 만든 'relief + 셰이더 단계색'이 곧 인구 릴리프의 부품이 된다.<br>① 숲 — buildForest 를 STEP×STEP 블록 평균 + aCover 셰이더 4단으로 바꾸고 공용 Legend(4칸 · ESA WorldCover 2021 · 관측 · 화면 격자 km)를 붙인다. Life 첫 탭 = 한국 숲 자동.<br>② LiveLayers.pick 최소형 — 숲 클릭 → 원본 PNG 1화소 → ValueCard(수관 % · 550m 칸 평균). ext pick 5건은 어댑터로 같은 카드에.<br>③ ProvenanceCard 5줄 — forest/index.json 의 source · license + 기준년 2021 을 '지금 아님'으로.<br>④ 지금 붐빔 칩 — 새 조작부 없이 기존 공용 시간축 그대로(live-layers.js:2857-2863). 예측 구간에 'FORECAST · 서울시' 배지를 달고 시간 스트립 문구(main.js:4911-4918)에 혼잡을 추가한다. 숲은 '2021 스냅샷 — 움직일 시간이 없습니다' 사유. 산림 감소 슬라이더는 연 눈금 모드가 생길 때까지 그대로 둔다(규칙 2 부채로 기록).<br>⑤ Compare 입구 + 사유 — W8 전. 첫 짝은 '관측(지금) \| 서울시 공식 예측(+3h)'으로 예약해 두고 '비교 작업공간 준비 전'을 말한다.<br>⑥ Intelligence 입구 — 수치 → 출처까지만(이 지점 수관 vs 나라 평균 64.1%, 단계별 장소 수). 문장 자리는 'probability: [] · 채점 기록 전' 사유. 패킷 생산자 없음을 숨기지 않는다.<br>⑦ SIM_CAPABILITIES 에 Life 7현상을 NOT_AVAILABLE + 사유로 등재 → 입구가 다른 메뉴와 같은 자리에 선다(tools/earthus-v53 시험 동반).<br>미루는 것: 인구 릴리프(L · 절대 8단은 PD 확인) — 바로 다음 조각, 혼잡 원판(R-01 결정 뒤), 새 3종 MERGE와 리본 헬퍼, 산림 감소 3단 네모, Global Timeline 연 눈금 모드, crowding-verify 생산자, 노출 인구 셈. 바다거북은 동결(기관 서면 문의만), 심해는 PD A/B/C 결정 뒤.
- 비고: [PD 결정 목록 — 이 표는 정하지 않았다]<br>1. 혼잡: 지시서 R-01 '수직 막대 보존 · 평면 heatmap 대체 금지'(live-layers.js:776-778) ↔ PD '막대기 금지'. 원판은 heatmap 이 아니라 지점 마커라는 점을 같이 제시.<br>2. 인구: 기존 분위 로그 10등급(이전 PD 지시 — 재료) → 절대 8단 명/㎢ 변경 여부.<br>3. 바다거북: 공공누리 4유형 — 국립해양생물자원관 서면 문의, 불가면 REMOVE. 결정 전 신규 개발 금지(동결). v1 이관으로는 풀리지 않는다.<br>4. 심해: A(Life 서랍) / B(v1) / C(Bathymetry Inspector 의 '여기로 잠수' 액션만 — 재료 권고).<br>5. 새 3종을 '새' 칩 하나로 MERGE 할지.<br>6. ④ 요금: 지시서 표(+24h 무료)에 따르면 서울시 공식 예측은 FREE — 재료의 paidHook('예측 타임라인 전체 = EXPLORER')와 어긋난다.<br>7. capabilities.intelligence:true 깃발 3개(숲 :153 · 혼잡 :419 · 인구 :455)를 생산자가 생길 때까지 유지할지 내릴지 — 지금은 깃발만 있고 띠가 뜨지 않는다.<br>8. Life 첫 탭 기본 칩: 숲(권고 — 결정 의존 없음) vs 인구(PD 가 가장 싫어하는 막대기가 가장 많은 화면).<br>[자리] 사용자 지시("라이프 트래블은 메뉴에 넣어줘")로 8현상의 '자리 없음'은 해소 — 자리는 이 메뉴다. 지금 레지스트리는 society 한 묶음에 생태 · 사람 · 여행 20현상을 같이 담는다(phenomenon-registry.js:1099-1111) → Life / Travel 둘로 가른다. people.night_lights 는 기존 매트릭스에서 09 Terrain 으로 MOVE 됐고, people.news 는 어느 메뉴에도 배정되지 않았으며 재료를 받지 못해 칸을 채우지 않았다(PD 결정 필요). tools/directive-2026-09-20/by-menu.json 은 '10 Compare · 11 Intelligence · 12 Simulation'으로 번호를 쓰고 있다 — PD 정본에서 그 셋은 TOP 바이므로 좌측 레일 10 = Life 와 충돌하지 않지만 파일 번호는 맞춰야 한다(이 작업은 읽기 전용이라 손대지 않음).<br>[Travel 동결과의 경계] 혼잡 자료는 aws/tourism-flow 가 만들지만 v2 레이어는 people/seoul(live-layers.js · main.js)이라 Life 로 옮겨도 Travel 씬 구조를 건드리지 않는다. 재료의 대안 'Travel 공간의 지금 붐빔'은 10-23 까지 동결 대상.<br>[코드에서 새로 확인한 어긋남] (a) live-layers.js:782-783 머리말 '예측 구간은 막대를 비우고 테두리만' ↔ 구현 :866 색×0.55. (b) 시간 스트립 안내문이 혼잡의 시간 반응을 말하지 않는다(main.js:4911-4918). (c) intelligence:true 깃발 3 · 생산자 0. (d) prototype/js/earthus2/v02/human-flow/(혼잡 지수 · 추세 · 이상 탐지 · 예측 채점 저장소)가 있는데 v2-three 소비자 0건 — ⑥ 의 채점 확률과 ⑦ 의 사유 문장에 쓸 재료. (e) sim-questions.js:191 사유 문장의 '인구 기둥'은 릴리프 재구축 뒤 고쳐야 한다.<br>[UNKNOWN] app/tourism/history/ 스냅샷 보관 기간과 STALE 공백 · 배포된 EventBridge 주기 · 혼잡 eventPick 반경 · ext 확장 화면(hobby/*)에서 셸의 현상 문맥(getPhenomenonContext)이 잡혀 sim/intel 블록이 그려지는지 · 소실 원인 분류 자료와 SSP 격자 인구의 존재 · 라이선스 · hobby-turtle.js · hobby-dive.js 의 build 본문(열지 않음 — pick 줄 번호만 grep 으로 확인). aws/*/handler.py 중 직접 연 것은 tourism-flow 뿐이고 migbird · ecobird · seabird · sea-turtle 수집기 줄 번호는 재료 인용이다.<br>[유료 가치의 정직한 평가] Life 는 정적 기관 기록이 대부분이라 유료 동기가 약하다. EXPLORER 에 설 수 있는 것은 표(정점 9년 · 반경 5km 소실 면적 · 지난주 대비)와 채점된 혼잡 확률, PRO 는 Compare 첫 짝과 노출 인구 셈(Hazards 와 묶일 때)뿐이다. 철새 · 조류 조사 · 바다거북은 끝까지 무료 고정. 이 메뉴는 W0(GFS)에 의존하지 않아 W1 · W5 와 병행할 수 있다.<br>읽은 파일(절대경로): D:\## APP\EARTHUS v2_APP\prototype\v2-three\js\phenomenon-registry.js · sim-questions.js · main.js · live-layers.js · pop-sculpture.js · ui-shell.js · intel-strip.js · intel-questions.js · scenario-compare.js · information-contract.js · ext\hobby-seabird.js · ext\hobby-ecobird.js · ext\hobby-migbird.js · D:\## APP\EARTHUS v2_APP\prototype\v2-three\forest\loss-index.json · popgrid\index.json · D:\## APP\EARTHUS v2_APP\aws\tourism-flow\handler.py · D:\## APP\EARTHUS v2_APP\prototype\js\earthus2\v02\human-flow\algorithms.js · forecast-lifecycle.js · D:\## APP\EARTHUS v2_APP\docs\earthus-v2\PAID-UX-REDESIGN-2026-09-20\DEV-DIRECTIVE.md(:28, :56-62, :174) · D:\## APP\EARTHUS v2_APP\tools\directive-2026-09-20\grammar-matrix.json · by-menu.json.

<details><summary>descriptor 초안</summary>

```js
{
  id: '10-life',
  rail: { no: '10', ko: '생명·사람', en: 'Life', icon: 'life' },   // 2026-09-20 PD 결정. 지금의 society 묶음(phenomenon-registry.js:1099-1111)에서 travel.* 등을 뺀 것. 레이어 id 는 개명하지 않는다
  phenomena: ['land.forest', 'people.population', 'people.crowding', 'land.bird_migration', 'land.bird_survey', 'ocean.seabird', 'ocean.sea_turtle'],
  actionOnly: ['ocean.deep_sea'],        // 메뉴 줄 0 — 09 Terrain Bathymetry Inspector 의 '여기로 잠수'(PD 가 C 안을 고를 때)
  unplaced: ['people.news'],             // 재료 없음 · PD 결정 필요 (people.night_lights 는 09 Terrain 이 이미 가져갔다)
  defaultMode: 'forest', defaultRegion: 'KOR',      // 1탭 뒤 빈 화면 금지 · 메뉴는 항상 한국 먼저
  modes: [                                          // 칩. range 입력 0개
    { id: 'forest', ko: '숲' }, { id: 'forestloss', ko: '산림 감소', region: 'KOR' },
    { id: 'population', ko: '인구' }, { id: 'crowding', ko: '지금 붐빔', region: 'SEOUL' },
    { id: 'birds', ko: '새', sub: ['migration', 'survey', 'seabird'] },            // MERGE — PD 확인
    { id: 'turtle', ko: '바다거북', frozen: 'KOGL-4 — 기관 서면 확인 전 신규 개발 금지' },
  ],
  members: [
    { key: 'forest.cover', layer: 'land/forest', badge: 'OBSERVED',
      view: { kind: 'relief', attr: 'aCover', scale: 'forestCover', isolines: null, blockMean: 'STEP×STEP 산술 평균', heightFollows: 'View>Appearance.terrainExaggeration' },
      scale: { type: 'stepped', unit: '%', breaks: [20, 40, 60, 80, 100], below: 'not-drawn(<20%)' },
      value: { read: 'pngPixel', file: 'forest/{iso}-cover.png', residentArray: false, precision: '550 m 칸 평균 · 1/255 눈금' },
      source: { agency: 'ESA WorldCover 10m v200', kind: 'observation', refYear: 2021, license: 'CC BY 4.0',
                grid: { source: '0.005° ≈ 550 m', screen: { KOR: '≈1.7 km 평균', JPN: '≈5 km 평균' } } },
      frames: { kind: 'none', reasonKo: '2021 스냅샷 — 움직일 시간이 없습니다' },
      labels: ['forest/index.json regions[].meanCover', 'clicked-point'] },
    { key: 'forest.loss', layer: 'land/forestloss', badge: 'OBSERVED',
      view: { kind: 'cells', shape: 'square@cellDeg', mobileMax: 60000 },
      scale: { type: 'stepped', unit: '평균 소실 연도', breaks: [2001, 2011, 2019, 2024] },
      value: { read: 'pngPixel', file: 'forest/kor-loss.png', decode: 'R→2000+R(평균 소실 연도) · A→사라진 비율' },
      source: { agency: 'Hansen GFC-2023 v1.11 (UMD)', license: 'CC BY 4.0', grid: '0.0025° ≈ 250 m', caveatKo: '모든 수관 소실 · 순감소 아님' },
      frames: { kind: 'years', range: [2001, 2023], via: 'GlobalTimeline.yearTicks', interim: '연 눈금 모드 전에는 기존 loss-year 슬라이더 유지(규칙 2 부채)' } },
    { key: 'population.density', layer: 'people/sculpt', absorbs: ['people/pop', 'people/poptower'], badge: 'MODEL',
      view: { kind: 'relief', attr: 'aDensity', scale: 'popDensity', isolines: null, faceRule: 'any-corner-has-value', autoRegion: 'KOR' },
      scale: { type: 'stepped', unit: '명/㎢', breaks: [100, 500, 1000, 2500, 5000, 10000, 20000], below100: 'near-transparent',
               status: 'PROPOSED — 지금은 분위 로그 10등급(PD 지시) · 변경은 PD 확인' },
      value: { read: 'arrayCell', decode: 'max·(u8/255)^3 ÷ 칸 면적(행별 cos φ)', precision: "'약' — 8bit 세제곱근 양자화" },
      source: { agency: 'WorldPop R2025A constrained UN-adjusted', kind: 'model', refYear: 2025, license: 'CC BY 4.0', grid: { KOR: '0.0167°', JPN: '0.058°', USA: '0.275°' } },
      frames: { kind: 'none', reasonKo: '2025년 추정 한 장' }, labels: ['findPeaks top5'] },
    { key: 'crowding.level', layer: 'people/seoul', badge: { now: 'OBSERVED', future: 'FORECAST · 서울시' },
      view: { kind: 'discs', size: 'fixed', forecast: 'hollow-ring', labelsAlways: 12, decision: 'R-01 수직 막대 보존 ↔ 막대기 금지 — PD 결정 필요' },
      scale: { type: 'agency-categorical', levels: ['여유', '보통', '약간 붐빔', '붐빔'], colors: 'official.color 그대로' },
      value: { read: 'eventPick', card: ['populationRange(밴드 그대로)', 'level', 'forecast[] 표'] },
      source: { agency: '서울특별시 실시간 도시데이터', time: 'generatedAt', stale: "state==='STALE' → 범례 회색 + '○시간 전 자료'" },
      frames: { kind: 'minutes', future: 'forecast[] 끝 시각까지 · 그 뒤 감춤', past: 'history-index.json 48h — 집계 S 선행' } },
    { key: 'birds.migration', layer: 'hobby/migbird', badge: 'HISTORY',
      view: { kind: 'arcs', dash: true, pulse: 'direction-only', endAt: 'dest-circle-edge', needs: 'ribbon helper' },
      scale: { type: 'stepped-width', unit: '건', breaks: [1, 2, 5], color: 'top6 + 기타 회색' },
      value: { read: 'extPick' }, source: { agency: '농림축산검역본부 위치추적 요약', period: '2021~2025', license: '제한 없음' },
      frames: { kind: 'years', range: [2021, 2025] }, legendNoteKo: '파선 = 실제 경로 아님 · 흐름 = 방향(속도·시기 아님)' },
    { key: 'birds.survey', layer: 'hobby/ecobird', badge: 'HISTORY',
      view: { kind: 'cells', cellDeg: 0.05, lift: 'max(corner heights)+margin' },
      scale: { type: 'stepped-log', classes: 5, breaks: 'TBD — 실제 분포로 확정', units: ['기록 수', '종 수'] },
      value: { read: 'extPick' }, source: { agency: '국립생태원 에코뱅크', license: '공공누리 1유형 + 제3자 권리 포함', rightsLock: { paidDerivatives: false } },
      frames: { kind: 'none' }, legendNoteKo: "색 = 조사 기록이 쌓인 양(새가 많은 곳 아님) · truncated>0 이면 '미수신 ○건'" },
    { key: 'birds.seabird', layer: 'hobby/seabird', badge: 'HISTORY',
      view: { kind: 'discs', size: 'fixed', numberInside: true, noSurveyYear: 'hollow-ring' },
      scale: { type: 'stepped', classes: 5, breaks: 'TBD', unit: { all: '마리(누적)', year: '마리/조사 1회' } },
      value: { read: 'extPick', table: 'stations[].by → [연도, 조사 횟수, 개체수, 1회당]' },
      source: { agency: '국가해양생태계종합조사', license: '제한 없음' }, frames: { kind: 'years', from: 'years[]' } },
    { key: 'turtle.track', layer: 'hobby/turtle', badge: 'HISTORY',
      view: { kind: 'paths', decimate: false, merged: 'one LineSegments' }, value: { read: 'extPick' },
      source: { agency: '국립해양생물자원관', license: '공공누리 4유형(상업 이용·변경 금지)', rightsLock: { paidDerivatives: false, frozen: true } },
      frames: { kind: 'none', reasonKo: '추적 종료 개체 — 공용 시간축에 묶지 않음' } },
  ],
  compare: {
    first: { member: 'crowding.level', pair: 'time↔time', a: 'now(OBSERVED)', b: '+Nh(FORECAST · 서울시)', sync: ['camera', 'legend'], diff: 'level-delta(−3…+3)' },
    next: [ { member: 'forest.loss', pair: 'period↔period', a: [2001, 2011], b: [2012, 2023] },
            { member: 'forest.cover', pair: 'country↔country', sharedScale: true },
            { member: 'birds.seabird', pair: 'year↔year', metric: 'per-survey' },
            { member: 'population.density', pair: 'country↔country', sharedScale: true, after: 'relief rebuild' } ],
    unavailable: { 'model↔model': '둘째 인구·산림 모델이 저장소에 없음', 'birds.migration': '179건 정적', 'birds.survey': '칸별 연도 없음 + 권리', 'turtle.track': '라이선스' },
  },
  intel: {
    producers: [],                        // 기존 4개 중 Life 0 — intelHostFor(main.js:4098-4112) 에 가지 없음
    planned: [
      { id: 'crowding-verify', member: 'crowding.level', input: 'app/tourism/history/YYYY/MM/DD/*.json', harness: 'earthus2/v02/human-flow/forecast-lifecycle.js ForecastVerificationStore',
        yields: "probability[]{ kind:'scored_forecast', horizonMin, level, hitRate, n, window }" },
      { id: 'exposure-link', member: 'population.density', input: 'Hazards 패킷(기관 확률·51멤버 비율) × popgrid 산술 합', yields: 'IMPACT 절 — 인과 아님' } ],
    attribution: [], attributionReasonKo: '측정된 조건+문헌 기작 쌍이 Life 어느 현상에도 없다 — 숲 소실 자료는 원인을 나누지 않는다',
    probability: [], probabilityReasonKo: '서울시 예측은 기관 예보 인용이며 확률이 아니다 · 채점 기록 전',
    noSentences: ['turtle.track', 'birds.survey'],
  },
  simulation: {
    registry: { 'people.population': 'not_available (sim-questions.js:181-193)', add: ['land.forest', 'people.crowding', 'land.bird_migration', 'land.bird_survey', 'ocean.seabird', 'ocean.sea_turtle', 'ocean.deep_sea'] },
    scenarios: [
      { id: 'exposure-count', chips: ['Current', '기관 침수 예상도', '쓰나미 도달 T분'], status: 'not_available', kind: 'arithmetic-sum', needs: ['Hazards Inspector(P1)', '칸 부분 겹침 규칙', '행정 인구 대조 검증'] },
      { id: 'crowd-whatif', chips: ['Current', '+20%'], status: 'not_available', partsExist: 'human-flow forecastCrowd(계수 없음)', needs: ['crowding-verify 채점 기록', '계수 보정'], forbidden: ['calculateRisk', 'capacityPressure'] } ],
    snapshot: ['camera', 'mode', 'region', 'timeOffsetMs', 'selected'],
  },
  tiers: { FREE: ['① 그림', '② 기본값', '③ 출처', '④ 서울시 공식 예측(+24h 안)'], EXPLORER: ['정점 9년 표 · 반경 5km 소실 면적 표 · 지난주 대비 · 짧은 인텔'], PRO: ['Compare', 'Simulation', 'export'],
           alwaysFree: ['birds.migration', 'birds.survey', 'turtle.track'] },
}
```

</details>

#### T Travel 여행(한국)

| 단계 | 지금 | 끝났을 때 사용자가 보고 하는 것 | 이 메뉴가 공급할 것 | 선행 | 요금 |
|---|---|---|---|---|---|
| **① 극적으로 보인다** | 🟡 prototype/v2-three/js/travel.js:253-296 build() — 시군구 228곳을 7px THREE.Points 로 찍는다(:275-278). 밝기 = 점수 선형(discover) / 제곱근(:266 — 실제로는 visitors 전용), 게이트 걸린 곳은 어두운 색(:268),… | Travel 을 1탭 하면 3초 안에 한국으로 글라이드하고 칩 [오늘 갈 곳 \| 목적별 장소 \| 방문자] 가 뜬다. 공용 EventLayer 의 숫자 원판으로 시군구 228곳이 5단 단계색으로 보인다 — 오늘 갈 곳은 점수 0~100 고정 5단 + 상위 10곳에 '순위 이름 점수' 라벨(형식 예: '1 속초 78'), 게이트에 걸린 곳은 회색 빗금 원판. 방문자는 외지인 일평균 5분위(경계 27,226 · 52,506 · 89,860 · 153,408명 — 2026-07 자료의 분위값이며 고정 등급 아님) + 자료 없는 30곳은 빈 고리. 목적별 장소는 멀리서 시군구 건수 원판(무장애 5분위 17 · 28 · 39 · 68), 300km 아래에서는 현재 쪽 24건이 번호 핀(목록 n번 = 지도 n번)으로 바뀐다. Legend 상시: 5칸 + 단위 + 'EARTHUS DISCOVERY(KTO 공식 추천 아님)' + 자료 시각 2종. 면 채색·기둥·점 구름 없음.<br>⚠️ *말하면 안 되는 것:* 시군구 폴리곤이 없어 '지역을 칠한' 그림은 만들 수 없다 — 원판까지만. 5분위 경계는 자료가 바뀌면 바뀐다(고정 등급처럼 말하지 않는다). 점수는 EARTHUS 가 유도한 후보 점수이지 KTO 추천·인기 순위가 아니다. 연관 관광지는 좌표 없는 명칭 그래프라 호를 그리지 않는다(이름 대조율 UNKNOWN). | 눈금 3벌(score 고정 5단 / visitors.domestic 5분위 / count 5분위 — 분위 경계는 자료에서 계산해 범례에 수치로) · 상태 3종(normal / blocked=회색 빗금 / nodata=빈 고리) · 라벨 포맷 '{rank} {nameKo} {value}' 상위 10 · 줌 전환 임계(시군구 원판 ↔ 번호 핀 300km) · 핀 번호 = pageResult 인덱스(24/page) · 범례 고정 문구('이동통신 기반 방문자 — 관광… | 공용 EventLayer · Legend(P1 공통 renderer contract). 그 전에도 travel.js 안에서 Sprite 원판으로 선행 가능 — 대회 동결(접수 09-30 · 발표 10-23) 범위인 '그림·문구만'에 해당. 목적별 건수 원판은 지금 죽어 있는 :256-… | FREE |
| **② 정확한 값** | 🟡 prototype/v2-three/js/main.js:2807-2819 — 지도 클릭 → travel.pick(lat,lon)(travel.js:310-328, 반경 35km 최근접; 목록 모드는 현재 쪽 항목만 :314) → regionCard 를 lockedNote 로 → shell.openInte… | 원판 클릭 1회 → 우측 Inspector.ValueCard 에 큰 수 하나 + 단위 + '정밀도의 한계' 한 줄. 예(속초, 자료 실측값): '외지인 방문자 83,474명/일 · 2026-07-06~07-19 14일 평균' / '무장애 여행지 124곳' / '오늘 점수 nn/100'. 한계 줄: '시군구 중심점(경계 bbox 중점) 기준 · 장소는 최근접 배정 근사 · 이동통신 기반 방문자(관광객 수 아님)'. 그 아래 성분 표: 목적 밀도 × 0.6 + 덜 붐빔 × 0.4, 게이트(특보·대기질) 상태, KTO 집중률 예측 평균 47.6 · 최대 99.8(이미 받은 자료 — 새 요청 0건). 장소 핀 클릭은 기존 placeCard 를 같은 틀에 담고 '이곳 다음에 간 곳 Top 5'(related — 공식 명칭이 일치할 때만)를 한 절로 붙인다.<br>⚠️ *말하면 안 되는 것:* 기본값(점수·건수·방문자·게이트 사유)은 무료 — 게이트 사유는 안전 정보다. 성분 전체 분해 · 집중률 · 외지인/현지인/외국인 구분은 EXPLORER 깊이. 시군구값을 '그 장소의 값'처럼 말하지 않는다. 방문자수는 관광객 수도 현재 혼잡도 아니다. 집중률 187곳 중 81곳은 rowCount=1000(수집 상한)에 정확히 걸려 있어 평균·최대가 잘린 행에서 계산됐을 수 있다(실측 —… | fields: score(/100, 정수, EARTHUS_ANALYSIS) · visitors.domestic\|local\|foreign(명/일 14일 평균, HISTORY) · count.bf\|wl\|en(곳·건, OFFICIAL_INFORMATION) · concentration.mean\|max(상대지수, PROVIDER_FORECAST) · limitNote 문구 3종 · pick 규칙(35km 최근접 / 목록 모드는 현재 쪽 24건) · 성분 분해… | 공용 Right Inspector(P0 셸). travel.pick · regionCard · placeCard 재사용. 집중률 행 추가는 자료가 이미 번들에 있어 선행 없음(동결 기간에도 가능한 '문구·그림' 범위). related Top5 는 장소명 ↔ related 키 일치 실측… | FREE |
| **③ 출처** | 🟡 travel.js:336-340 provLine(기관명 · 건수 · 수집일), :369-380 근거 줄마다 renderBadge + 출처, :397-404 sourceFooter(출처 · 수집 시각 KST · 원자료 링크 · 사진 미사용), :429 장소별 공식 콘텐츠 ID · 원문 수정시각 · 공공누… | 같은 Inspector 의 ProvenanceCard 한 장에 줄마다 기관 · 구분 배지 · 시각 · 해상도 · 라이선스. 예: '목적 밀도 — 한국관광공사 무장애 여행 정보 · OFFICIAL · 수집 2026-09-02 · 시군구 중심점 최근접 배정(60km 초과 미배정 19건)' / '방문자 — 한국관광공사 빅데이터 지역별 방문자수 · HISTORY · 2026-07-06~07-19 14일 평균' / '집중률 — KTO 관광지 집중률 예측 · PROVIDER_FORECAST · 대상 09-02~10-01' / '특보 — 기상청 · OFFICIAL_WARNING · 발표 HH:MM' / '대기질 — 에어코리아 ○○측정소 3km · 측정 HH:MM'. '매일 다시 점수' 문장은 지우고 '특보·대기질은 지금 값 · 목적 밀도·방문자는 09-02 집계'로 바꾼다.<br>⚠️ *말하면 안 되는 것:* 출처 기관·시각 한 줄은 잠그지 않는다(공공데이터 출처표시 의무 + DoD '모든 수치에 source+timestamp'). 데이터셋 단위의 상업 이용 조건은 열어 보지 않았다 — UNKNOWN, 유료 전환 전 확인 필요. 방문자 원천(통신사·표본)은 자료에 없으므로 말하지 않는다. '오늘'이라는 말은 게이트에만 쓴다. | 출처표 8행(barrierFree · wellness · english · visitors · concentration · related + 게이트 2) — kto-discovery.json provenance(sourceName · sourceUrl · fetchedAt · sourceType · itemCount)를 그대로 매핑 · 시각 3종 매핑(observed=게이트 측정/발표 시각, collected=fetchedAt, valid=집계 기간 dateF… | 공용 ProvenanceCard(P0 Right Inspector). 문구 수정(:353)과 게이트 시각 출력(:379-380)은 즉시 가능 — 동결 범위 안. events/kma-warn.json 의 발표 시각 필드명은 이번 조사에서 열어 보지 않음(UNKNOWN). | FREE |
| **④ 시간축** | ❌ main.js:4891-4899 onTimeOffset → clouds.setForecastOffset · liveLayers.setTimeOffset · syncCloudToTime 뿐, travel 호출 없음. live-layers.js:2857-2867 setTimeOffset 은 seoul ·… | 슬라이더를 새로 만들지 않는다. Travel 이 켜지면 하나뿐인 Global Timeline 이 '날짜 모드'로 눈금을 바꾼다(같은 부품의 모드): 오늘 → +30일, 1일 스텝, 'FORECAST · KTO 집중률 예측' 배지. 날짜를 옮기면 방문자 칩의 원판이 그날 집중률 지수(시군구 평균) 5단색으로 바뀌고 Inspector 에 30일 곡선과 그날 위치가 찍힌다. 과거 쪽은 방문자 집계 창(07-06~07-19) 하나만 눈금으로 서고 나머지는 '자료 없음'으로 비활성. 날짜를 옮기면 게이트(특보·대기질) 줄은 '현재값 — 이 날짜의 것이 아님'으로 회색 처리된다.<br>⚠️ *말하면 안 되는 것:* 집중률은 상대지수(100=가장 붐비는 시기)이지 인원 수도 확률도 아니다. 무엇을 100 으로 잡는지(관광지별인지 공통인지)는 자료 설명에서 확인하지 못했다 — UNKNOWN, 확인 전에는 지역 간 절대 비교 문장을 쓰지 않는다. 시군구 평균은 관광지별 지수를 우리가 평균한 값이다. 방문자 과거는 창이 하나라 '추세'를 말할 수 없다. 81/187곳은 수집 상한(1,000행)에 걸려 30일… | frames 선언: { mode:'date', step:'1d', range:[today, today+30d], kind:'PROVIDER_FORECAST', product:'tourism/kto/concentration-daily.json(신규 — 시군구×날짜 mean · max · spotCount, 187×30)' } + 과거 단일 창 { from:'2026-07-06', to:'2026-07-19', kind:'HISTORY' } · 시간 무관 필드 목… | ① 집계 단계(build_kto_discovery.py 또는 일일 Lambda)가 날짜별 행을 버리지 않고 시군구×날짜로 남길 것(M) ② GlobalTimeline 날짜 모드(P0 Single Timeline 의 모드 확장) ③ 스윕 pageSize 1000 · pageLimit 1… | EXPLORER |
| **⑤ 비교** | ❌ prototype/v2-three/js 전체에 splitGlobe\|split-globe\|wipe\|compareWorkspace 0건(Grep). ui-shell.js 의 compare 매치는 localeCompare 정렬과 예보 채점 설명문뿐(:590, :608, :692). travel.js 는… | TOP 의 Compare 를 누르면 Travel 은 기본 짝 '지역 ↔ 지역'으로 열린다: 원판 두 개를 차례로 눌러 A · B 를 고정하면 Inspector 가 두 열(예: 속초 \| 강릉)로 같은 행 — 점수 · 성분 · 무장애/웰니스/영문 건수 · 외지인/현지인/외국인 일평균 · 집중률 평균/최대 · 게이트 — 을 같은 단위 · 같은 집계 기간으로 나란히 놓고 차이 열을 붙인다. split globe 짝은 '방문자 구분 ↔ 구분'(외지인 \| 외국인 — 같은 출처 · 같은 14일 · 같은 단위, 면별 5분위 범례 + diff 는 '외국인 비중 %'). 카메라 · 칩 · 범례 동기화와 URL 공유는 공용 Compare 가 한다.<br>⚠️ *말하면 안 되는 것:* 모델↔모델 짝은 이 메뉴에 없다 — 관광 예측 제공자가 KTO 하나다. 방문자 실적(명)과 집중률(상대지수)은 수치 diff 금지 — 순위 비교만, 배지 HISTORY vs PROVIDER_FORECAST 를 양쪽에. 방문자 시각↔시각은 창이 하나라 지금 불가. KTO 가 예측을 매일 갱신하는지는 UNKNOWN — 런↔런은 보관본 이틀치를 실측한 뒤 착수 여부를 정한다. 지금 Travel… | comparePairs: [ region↔region(entity pin, 지금 됨) · visitors.domestic↔visitors.foreign(split, scale per-side, diff='share%', 지금 됨) · count.bf↔count.en(split, 지금 됨) · date↔date(needs concentration-daily) · run↔run(needs archive/tourism/kto/raw 집계) · history↔fore… | 공용 Compare workspace(P1). TravelScene 이 두 필드를 동시에 그릴 수 있게(지금 mode 단일). 날짜↔날짜는 (4)의 daily 산출물. 런↔런은 aws/tourism-flow/kto_collector.py:319 의 raw 보관본(archive/ — 공… | PRO |
| **⑥ Intelligence** | ❌ main.js:4098-4112 intelHostFor 는 hazards.typhoon · hazards.earthquake · ocean.sst · weather.temperature_anomaly 만 돌려주고 travel.* 는 null. 패킷 생산자 4개에 여행 없음. 그런데 registry 는… | Inspector 의 Intelligence 절이 수치 → 출처 → 문장 순서로 선다. 수치: '오늘 점수 nn/100 = 목적 밀도 dd × 0.6 + 덜 붐빔 qq × 0.4'. 출처: '한국관광공사 5종(수집 09-02) · 기상청 특보(발표 HH:MM) · 에어코리아 ○○측정소 3km(측정 HH:MM)'. 문장: '[원인 — 게이트 규칙] ○○군이 오늘 후보에서 빠진 원인은 호우주의보 발효(기상청)입니다 — 규칙이 결정적이라 기여 100%.' / '[원인 — 점수 분해] 속초가 상위인 것은 목적 밀도 기여 dd점, 덜 붐빔 기여 qq점.' / '[앞으로 — 제공자 예측 인용] KTO 집중률 예측 09-02~10-01 평균 47.6 · 최대 99.8(상대지수, 인원 수 아님).' attribution[] 은 '우리 점수·게이트의 원인'에 한해 결정적으로 실리고, probability[] 는 비운다.<br>⚠️ *말하면 안 되는 것:* '왜 붐비는가'(축제 · 연휴 · 날씨)의 원인은 측정된 조건도 문헌 기작도 패킷에 없다 → 말하지 않는다. '붐빌 확률 %'는 말할 수 없다 — KTO 지수는 확률이 아니고, 예측 대 실제 방문자 채점은 단위가 달라 설계조차 없다. 기관 확률로 실을 수 있는 후보는 기상청 동네예보 강수확률(aws/kma-fcst → wind/kma-fcst.json, POP)뿐인데 97지점 최근접이라 시… | 다섯 번째 패킷 생산자 '여행 패킷' — 일일 집계 단계가 kto-discovery 옆에 intel 을 실어 보낸다(띠는 계산·요청하지 않는다, intel-strip.js:5-7 계약 §C-0): WHAT=점수 · 성분 · 게이트 / WHY(attribution)=게이트 사유(결정적) · 성분 기여 / NEXT=KTO 집중률 인용(PROVIDER_FORECAST — intel-strip.js:38 에 이미 있는 '예보 제공자 인용' 분류) / EVIDENCE=… | 인텔 패킷 v1 의 attribution[] · probability[] 확장(공용) · 일일 집계 Lambda 단계(today_pick 의 '매일 바뀌는 오늘' M 항목과 같은 작업) · registry capabilities 정정(지금의 true 는 빈 약속) · 대회 동결 뒤. | EXPLORER |
| **⑦ Simulation** | ❌ prototype/v2-three/js/sim-questions.js:194-206 — travel.visitor_pressure 하나만 등재, engine:null, status NOT_AVAILABLE, 질문 '여행객이 늘면 어디가 달라질까?' + 사유 문장. today_pick · place_ca… | Simulation 입구는 다른 메뉴와 같은 자리(TOP · Inspector 하단). 누르면 지금 상태(선택 시군구 · 칩 · 게이트 시각 · 자료 집계일)를 스냅샷으로 들고 작업 공간으로 간다: Current(지금 순위) → Baseline(같은 것, 고정) → Scenario 칩 [한산 우선 0.3/0.7 \| 목적 우선 0.8/0.2 \| 특보 해제 가정] → Result(순위표 + 순위 변화 Δ 원판, 절대 점수와 Δ 동시). 배지 'SCENARIO · 재점수 — 예측 아님 · 기록 남는 계산 아님'. 등재된 질문 '여행객이 늘면…'은 같은 공간 첫 줄에 NOT_AVAILABLE 과 사유 그대로 선다.<br>⚠️ *말하면 안 되는 것:* 수요 · 이동 모형이 없다 — '여행객이 늘면/줄면', '축제가 열리면', '비가 오면 방문자가 몇 % 준다'는 말할 수 없다(채점된 모형 없음). 재점수는 우리 공식의 민감도이지 세계의 예측이 아니다. '특보 해제 가정'은 실제 발효 중인 특보를 화면에서 지우지 않는다(안전 정보 상시 · 무료). LIMITED 는 기존 선례(main.js:4730-4731 — PRO 잠금은 기록 남는 S… | SIM_CAPABILITIES 신규 항목 'travel.today_pick'(status LIMITED · engineRef 'prototype/v2-three/js/travel.js' computeScores · inputs '이미 받은 kto-discovery + 게이트' · outputs '순위 · Δ' · horizons '현재 자료 기준 — 예보 아님') · 시나리오 칩 3개 정의(가중치 쌍 2 + 게이트 가정 1) · 스냅샷 필드 목록 · visit… | 공용 Simulation workspace(P2). computeScores 를 가중치 · 게이트 인자를 받는 순수 함수로(지금은 this.data 를 제자리에서 바꾼다 :182-190). sim-q 분기 추가. 대회 동결 뒤. | PRO |

- **⑤ 비교 짝:** 1순위(지금 자료로 바로 됨) = 지역 ↔ 지역: 시군구 A · B 를 고정해 Inspector 2열로 같은 변수 · 같은 집계 기간 · 같은 출처를 나란히(점수 · 성분 · 목적 건수 · 외지인/현지인/외국인 · 집중률 평균/최대 · 게이트). 새 자료 0, 새 렌더러 0. 2순위(지금 됨, split globe) = 방문자 구분 ↔ 구분(외지인 \| 외국인): 같은 출처 · 같은 14일(2026-07-06~07-19) · 같은 단위라 diff(외국인 비중 %)가 정직하다. 3순위(지금 됨) = 목적 ↔ 목적(무장애 \| 영문 건수). 지금 안 되는 짝: 날짜 ↔ 날짜(이번 토요일 \| 다음 토요일 집중률) — 날짜별 행이 번들에서 버려져 있어(build_kto_discovery.py:217-226) daily 산출물이 선행. 런 ↔ 런(어제 발표 \| 오늘 발표) — raw 보관본(kto_collector.py:319)은 있으나 집계가 없고 KTO 의 일일 갱신 여부 UNKNOWN. 방문자 시각 ↔ 시각 — 창이 하나라 불가. 실적 ↔ 예측은 단위가 달라(명 vs 상대지수) 순위 비교만 허용. 모델 ↔ 모델은 이 메뉴에 성립하지 않는다(제공자 KTO 하나) — 지어내지 않는다.
- **⑦ 시나리오:** 저장소에 Travel 용 시뮬레이션 엔진은 없다. sim-questions.js:194-206 의 travel.visitor_pressure 는 engine:null · NOT_AVAILABLE('방문객 증가 계산 엔진이 아직 없습니다'). prototype/js/earthus2/v11/tourism/ 의 best-window.js · discovery-ranker.js 는 가중합 채점기(SHADOW)이지 시뮬레이션이 아니고 v2-three 가 쓰지 않는다. aws/tsunami-eta · research-runtime · transport-simulator 는 이 메뉴와 무관. 정직한 후보는 하나: travel.js:174-191 computeScores 를 인자화한 '재점수 시나리오' — 칩 [한산 우선 0.3/0.7 \| 목적 우선 0.8/0.2 \| 특보 해제 가정], 결과는 순위와 Δ. 브라우저 안의 결정적 재계산이라 상태는 LIMITED(기록 남는 simulation_run 아님), 등재 위치는 visitor_pressure 가 아니라 신규 'travel.today_pick'. 날짜 시나리오(이번 토요일 기준 재점수)는 (4)의 daily 집중률 산출물이 생긴 뒤. 수요 예측 · 방문자 증감 시나리오는 모형도 채점 자료도 없어 NOT_AVAILABLE 유지 — 입구는 같은 자리에 두고 사유를 말한다.
- **첫 단면(7단계를 전부 관통하는 가장 얇은 출시):** 대회 동결(접수 09-30 · 발표 10-23) 안에서 '그림·문구만'으로 7단계를 전부 관통한다 — 새 자료 의존성 0, 메뉴 이동 0. (1) travel.js build() 의 7px 점을 5단 단계색 숫자 원판 + 상위 10 순위 라벨 + 게이트 회색 빗금 + 자료 없음 빈 고리로, 목록 모드의 24점에 번호를 붙이고, 범례를 상시 띄운다. (2) 같은 클릭 경로(main.js:2807-2819)를 유지한 채 카드 맨 위를 '큰 수 + 단위 + 한계 한 줄'로 재배열하고, 이미 받아 둔 KTO 집중률 평균·최대 행을 추가한다(새 요청 0건). (3) sceneCard :353 의 '매일 다시 점수 매깁니다'를 사실 문장으로 바꾸고, 담아 두고도 안 찍던 대기질 측정 시각(:160)과 특보 발표 시각을 출력하며, 방문자=HISTORY / 집중률=PROVIDER_FORECAST 배지를 가른다. (4) 타임라인은 건드리지 않고 Inspector 에 '이 메뉴의 자료 시간표'(방문자 07-06~07-19 · 집중률 대상 09-02~10-01 · 연관 2026-06 · 게이트=지금) 한 표 — 입구 + 사유 '날짜 눈금은 날짜별 집중률 산출물이 생기면 열립니다'. (5) Compare 입구를 같은 자리에 두고 누르면 '지역 ↔ 지역' 2열 Inspector 만(기존 pick 두 번) — split 은 사유와 함께 뒤로. (6) Intelligence 절은 수치 → 출처 → 문장 배치만 먼저: 게이트 사유와 점수 분해를 '우리 규칙의 원인'으로 말하고 KTO 집중률은 제공자 예측 인용으로, 확률 칸은 '확률을 말할 근거가 없습니다(지수는 확률 아님)'. (7) Simulation 입구 + 사유: sim-questions.js 의 visitor_pressure NOT_AVAILABLE 문장을 그대로 보여 준다. 미루는 것(10-23 뒤): MENU_GROUPS 에서 Travel 분리 · 일일 집계 Lambda('매일 바뀌는 오늘') · 시군구×날짜 집중률 산출물과 타임라인 날짜 모드 · 목적별 건수 원판(죽은 경로 복구) · split 비교 · 여행 패킷 생산자 · 재점수 시나리오 등재 · 연관 관광지 호(이름 대조율 실측 뒤).
- 비고: 1) 메뉴 자리에 정본이 둘이다: ui-shell.js:134-149 에는 이미 별도 'travel' 장면(레이어 6개)이 있는데, 정본이라는 phenomenon-registry.js MENU_GROUPS(:1099-1111)는 여행 6현상을 'society(생태·사람·여행)' 묶음에 넣어 두었다. PD 의 09-20 결정(Travel 독립 메뉴)은 셸 쪽과 일치한다 — registry 분리는 대회 동결이 끝나는 10-23 뒤로 잡는다. 2) 재료의 place_catalog 'before' 는 v2 에서 틀렸다: bf·wl·en 에서 시군구 건수 비콘은 도달 불가 코드이고(travel.js:255 조기 반환), 지구에는 현재 쪽 24건만 찍힌다. wl 의 실제 지점 203개 분기(:280-286)도 죽어 있다. 3) registry 의 빈 약속: 여행 4현상 intelligence=true 인데 패킷 생산자 · intelHostFor 분기가 없다. visitor_pressure 는 forecast=false 인데 scope 문장은 30일 예측 창을 말한다(:623, :627). 4) 집중률 수집 절단: 187곳 중 81곳이 rowCount=1000 에 정확히 걸린다(스윕 pageSize 1000 · pageLimit 1, configure-kto-sweep-schedules.sh:23; 34곳×30일=1,020). 5) v2 는 받아 둔 집중률 예측을 화면에 한 번도 쓰지 않는다(v1 은 쓴다). 6) 요금: 재료는 네 현상 모두 'PRO: 없음'이었다 — 이 매트릭스도 같은 결론이다. (5)(7)의 tier 는 PD 문법대로 PRO 로 적었지만 지금 Travel 에 PRO 값을 하는 내용은 없고, 파는 것은 EXPLORER 의 (2) 성분 분해 · (4) 30일 곡선 · 한산한 날 알림이다. 7) 열어 보지 않아 UNKNOWN 으로 둔 것: kma-warn.json 발표 시각 필드명, KTO 데이터셋 단위 상업 이용 조건, 집중률 지수의 100 기준 단위, KTO 예측의 일일 갱신 여부, related 장소명 ↔ 카탈로그 이름 일치율. 관련 파일: D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/travel.js · travel-catalog.js · main.js · sim-questions.js · phenomenon-registry.js · ui-shell.js · engine-bridge.js · intel-strip.js, D:/## APP/EARTHUS v2_APP/prototype/v2-three/data/tourism/kto-discovery.json, D:/## APP/EARTHUS v2_APP/tools/build_kto_discovery.py, D:/## APP/EARTHUS v2_APP/aws/tourism-flow/kto_collector.py, D:/## APP/EARTHUS v2_APP/aws/configure-kto-sweep-schedules.sh, D:/## APP/EARTHUS v2_APP/prototype/js/ui-travel-discovery.js, D:/## APP/EARTHUS v2_APP/prototype/js/earthus2/v11/tourism/.

<details><summary>descriptor 초안</summary>

```js
{
  id: 'travel',
  label: { ko: '여행(한국)', en: 'Travel (Korea)' }, accent: '#F2A2C4',
  scope: 'KR 시군구 228 — 중심점(bbox 중점), 폴리곤 없음',
  rendererKind: 'EventLayer',            // FieldRenderer · ParticleField 미사용
  frozenUntil: '2026-10-23',             // 데이터랩 대회: 구조 이동 동결, 그림·문구만
  phenomena: ['travel.today_pick', 'travel.place_catalog', 'travel.place_sequence', 'travel.visitor_pressure'],
  // travel.poi · travel.flight 는 availability 'planned' — 칩을 만들지 않는다
  chips: [
    { id: 'discover', phen: 'travel.today_pick',       layers: ['travel/discover'], default: true },
    { id: 'places',   phen: 'travel.place_catalog',    layers: ['travel/bf', 'travel/wl', 'travel/en'], sub: ['무장애', '웰니스', 'English'], pageSize: 24 },
    { id: 'visitors', phen: 'travel.visitor_pressure', layers: ['travel/visitors'] },
  ],
  // travel/related(place_sequence)는 칩이 아니라 Inspector 절 'Top 5'
  fields: {
    score:      { unit: '/100', precision: 0, kind: 'EARTHUS_ANALYSIS', formula: '목적 밀도 0.6 + 덜 붐빔 0.4 · 게이트 걸리면 0' },
    visitors:   { keys: ['domestic', 'local', 'foreign'], unit: '명/일(14일 평균)', kind: 'HISTORY', coverage: '198/228', nodata: 'ring' },
    count:      { keys: ['barrierFree', 'wellness', 'english'], unit: '곳·건', kind: 'OFFICIAL_INFORMATION' },
    concentration: { keys: ['mean', 'max'], unit: '상대지수(100=가장 붐비는 시기)', kind: 'PROVIDER_FORECAST', coverage: '187/228', caveat: '81곳 rowCount=1000 상한' },
    gate:       { keys: ['warn', 'air'], kind: 'OFFICIAL_WARNING|OFFICIAL_OBSERVATION', nowOnly: true, free: true },
  },
  scale: {
    score:    { type: 'stepped', bins: [0, 20, 40, 60, 80, 100] },
    visitors: { type: 'quantile5', cutsFromData: [27226, 52506, 89860, 153408], note: '2026-07 자료의 분위값 — 고정 등급 아님' },
    count:    { type: 'quantile5', cutsFromData: { barrierFree: [17, 28, 39, 68] } },
    concentration: { type: 'quantile5', cutsFromData: [38.7, 41.9, 47.4, 53.5] },
    states:   { blocked: 'grey-hatch', nodata: 'empty-ring' },
  },
  marks: { far: 'numberDisc', near: { belowKm: 300, mark: 'numberedPin', index: 'pageResult' }, labels: { top: 10, format: '{rank} {nameKo} {value}' } },
  legend: { always: true, lines: ['EARTHUS DISCOVERY — KTO 공식 추천 아님', '이동통신 기반 방문자 — 관광객 수 아님', '자료 시각 2종(집계일 / 게이트 현재 시각)'] },
  inspector: {
    pick: { fn: 'travel.pick', maxKm: 35, network: 0, exception: '장소 상세 summary.json 1건' },
    limitNote: ['시군구 중심점 기준', '장소는 최근접 배정 근사(60km 초과 미배정)', '방문자 ≠ 관광객'],
    sections: ['value', 'components', 'gate', 'concentration', 'relatedTop5'],
  },
  sources: 'data/tourism/kto-discovery.json#provenance (6행) + events/kma-warn.json + wind/korea-air-obs.json',
  times: { observed: 'gate.at / 특보 발표 시각', collected: 'provenance.*.fetchedAt', valid: 'visitors.dateFrom~dateTo · concentration.dateFrom~dateTo · related.month' },
  frames: {
    mode: 'date', step: '1d',
    forecast: { range: ['today', 'today+30d'], product: 'tourism/kto/concentration-daily.json', status: 'NOT_BUILT', kind: 'PROVIDER_FORECAST' },
    history:  { windows: [{ from: '2026-07-06', to: '2026-07-19' }], kind: 'HISTORY' },
    timeless: ['count.*', 'related'],
  },
  compare: {
    pairs: [
      { id: 'region-region', ui: 'inspector-2col', now: true },
      { id: 'visitor-segment', a: 'visitors.domestic', b: 'visitors.foreign', ui: 'split', scale: 'per-side', diff: 'share%', now: true },
      { id: 'purpose-purpose', a: 'count.barrierFree', b: 'count.english', ui: 'split', now: true },
      { id: 'date-date', needs: 'concentration-daily' },
      { id: 'run-run', needs: 'archive/tourism/kto/raw 집계', unknown: 'KTO 일일 갱신 여부' },
      { id: 'history-forecast', diff: 'rank-only' },
    ],
    forbidden: ['model-model(제공자 1곳)', '명 ↔ 상대지수 수치 diff'],
  },
  intel: { producer: null, planned: '여행 패킷(일일 집계 단계)', attribution: 'own-score-and-gate-only', probability: [], hostFor: ['travel.today_pick', 'travel.visitor_pressure'] },
  simulation: {
    entries: [
      { phen: 'travel.today_pick', status: 'limited', engineRef: 'prototype/v2-three/js/travel.js#computeScores', chips: ['한산 우선 0.3/0.7', '목적 우선 0.8/0.2', '특보 해제 가정'], register: 'NOT_YET' },
      { phen: 'travel.visitor_pressure', status: 'not_available', question: '여행객이 늘면 어디가 달라질까?' },
    ],
  },
  tiers: { 1: 'FREE', 2: 'FREE', 3: 'FREE', 4: 'EXPLORER', 5: 'PRO', 6: 'EXPLORER', 7: 'PRO' },
}
```

</details>

### 1-5. 비평 — 같은 문법이 깨지는 곳과 위험

> 이 비평은 현상 9개 메뉴의 63칸을 읽고 쓴 것이다. Life · Travel(14칸)은 그 뒤에 추가됐고 같은 규칙을 적용한다 — 두 메뉴의 ②·③ 은 무료, ④ 는 자료가 가진 시간만, ⑤·⑦ 은 입구 + 사유.

**메뉴마다 다르게 적힌 곳(같은 문법이 깨지는 곳).**

- **요금이 메뉴마다 다르게 적혔다 — 같은 문법이 가장 크게 깨지는 곳.** ② 값 읽기: 6개 메뉴는 무료, 구름·해양·지형은 EXPLORER. ③ 출처: 6개는 무료, 구름·해양·지형은 EXPLORER. ④ 시간축: 기온·강수·구름·재해·우주는 무료, 바람·대기질·지형은 EXPLORER, **해양은 PRO.** 같은 단계가 메뉴마다 다른 값에 열리면 사용자는 규칙을 배울 수 없다 → 전역 규칙 하나로 통일한다(아래 '고쳐야 하는 칸').
- **③ 출처를 유료로 적은 칸이 있다(구름·해양·지형).** 출처를 숨기면 '모든 값에 출처와 시각'이라는 v1·v2 공통 원칙과 부딪힌다. 출처·시각·관측/모델 구분은 **언제나 무료**다. 유료는 출처의 *깊이*(원자료 링크 · 처리 이력 · 채점 기록)에서 판다.
- **② 의 '클릭'이 메뉴마다 다른 것을 가리킨다.** 기온·바람·강수는 격자 칸 값, 재해·우주는 사건·물체 pick, 대기질은 측정소, 지형은 고도. 부품은 하나(ValueCard)로 두고 `value.read` 로 갈라야 한다 — 지금 초안들은 메뉴마다 다른 패널 이름을 쓴다.
- **⑤ 의 짝 이름이 제각각이다.** '런↔런'·'회차↔회차'·'런 간 비교'·'리드타임 비교'가 섞여 있다. `type` 을 8개로 고정한다: time · run · model · agency · revision · obsModel · date · scenario.
- **⑦ 에서 '입구 + 사유'와 '칩 비활성'이 섞여 있다.** 강수·구름은 ❌(입구 자체가 없음), 나머지는 입구는 있고 엔진이 없음. PD 문법은 '입구는 같은 자리'이므로 **9개 전부 입구를 두고** 가용성만 다르게 말한다.
- **대기질만 자료가 Open-Meteo 경유다**(CAMS 를 Open-Meteo 가 중계). 그 메뉴의 첫 단면은 스스로 'FREE_OPEN 임시 — 결제 개시 조건에서 제외'라고 적었다. 옳은 판단이고, 다른 메뉴의 문법과 섞이지 않게 **범례에 상시 표기**해야 한다.

**고쳐야 하는 칸.**

| 메뉴 | 단계 | 어떻게 |
|---|---|---|
| 04 구름 · 05 해양 · 09 지형 | ② 정확한 값 | 기본값 읽기는 **무료**로 통일. EXPLORER 는 '정확값(실측 0.1 단위) + 최근접 관측 대조 + 내 위치 5일 곡선'. |
| 04 구름 · 05 해양 · 09 지형 | ③ 출처 | 출처·시각·관측/모델 구분은 **무료**로 통일. 유료는 출처의 깊이(원자료 링크·처리 이력·채점 기록). |
| 02 바람 · 07 대기질 · 09 지형 · 05 해양 | ④ 시간축 | 전역 규칙으로 통일: **+24 h 무료 · +120 h EXPLORER.** 해양의 PRO 는 내린다(시간축은 PRO 의 가치가 아니다 — PRO 는 ⑤·⑦). 지형처럼 시간이 없는 자료는 '이 자료는 시간에 따라 바뀌지 않는다'를 타임라인이 말한다. |
| 03 강수 · 04 구름 | ⑦ Simulation | ❌ → 입구를 같은 자리에 두고 사유를 말한다. 구름은 '수동 이류(advectPoint + 700hPa 바람)' 후보가 있으므로 '준비 중'이 아니라 **'엔진 있음 · 화면 미연결'** 로 정직하게. 강수는 '정직하게 열 수 있는 엔진 없음'(초단기 이류는 레이더가 좌표계 없는 그래픽이라 입력이 없다). |
| 06 재해 | ② 정확한 값 | ❌ 의 원인은 사건 pick 부재. EventLayer 의 pick 을 ValueCard 의 `read: 'eventPick'` 으로 연결 — 규모·깊이·시각·기관을 한 카드에. |
| 전 메뉴 | ⑤ 비교 | `compare.pairs[].type` 을 8종으로 고정하고, `available:false` 인 짝도 **칩으로 보이게** 한다(사유 포함). 'GFS \| ECMWF' 는 9개 메뉴 어디서도 아직 안 된다 — 숨기지 말고 '격자 수집기 없음'. |
| 전 메뉴 | ① 극적으로 보인다 | 'EXISTS' 의 정의를 고정한다: **그 칸의 완료 기준(§4 의 acceptance)을 운영 화면에서 통과**했을 때만 ✅. 지금 63칸에 ✅ 가 0 인 것은 이 정의 때문이고, 그게 맞다. |

**이 문법을 모든 메뉴에 강제할 때의 위험.**

- **빈 단계를 억지로 채워 거짓이 되는 것.** ⑤·⑦ 의 재료가 없는 메뉴에 그럴듯한 화면을 만들면 이 제품의 가장 큰 자산(정직성)을 판다. 방어: descriptor 의 `available:false + reason` 을 부품이 그대로 말한다. 입구는 있고, 거짓은 없다.
- **좌클릭 충돌.** 값 판독 · 국가 선택 · 사건 pick · 관측소 pick 이 한 클릭을 두고 다툰다. 메뉴마다 규칙이 다르면 ② 가 메뉴마다 다르게 느껴진다. 셸에서 한 번 정한다: 현상 켜짐 → 값 / 사건 위 → 사건 / 아무것도 없음 → 국가.
- **발열·성능.** FieldRenderer + 입자 + 라벨 + Compare(렌더러 두 벌)가 겹치면 폰이 못 버틴다. Compare 에서는 입자를 끄고, 모바일은 split 대신 wipe(한 벌 + 마스크), 라벨 예산은 descriptor 에서.
- **'런 ↔ 런'이 S3 수명주기에 달려 있다.** 핸들러에 삭제 코드는 없지만 버킷 lifecycle 은 확인 못 했다(UNKNOWN). 이전 런이 지워지면 네 메뉴의 1순위 비교가 한꺼번에 사라진다 — W0 에서 확인하고, 없으면 '최근 4런 보존'을 명시한다.
- **요금 경계가 한 번도 실행된 적이 없다**(`FREE_OPEN`). 7단계에 요금을 입히는 날이 등급 판정 코드가 처음 도는 날이다. G3 전에 PAID 모드로 63칸을 한 번 걸어 보는 시험이 필요하다.
- **descriptor 가 비대해지는 것.** 9개 메뉴의 예외를 다 받아 주면 '설정'이 아니라 '메뉴별 코드'가 된다. 규칙: 부품에 `if (menu === …)` 가 생기면 descriptor 설계가 틀린 것이다.
- **대기질의 자료 토대.** 지금 CAMS 는 Open-Meteo 경유다. 유료 핵심 그림으로 세우려면 CAMS 직접 수집(Copernicus 계정 · 출처표시)이 선행 — 그 전에는 이 메뉴만 '임시'라는 사실을 숨기지 않는다.


---

## 2. 이미 있는 재료 — 새로 만들지 말 것

| 재료 | 위치 | 상태 | 어디에 쓰나 |
|---|---|---|---|
| **GFS 0.5° 5일 41프레임 파이프라인** | `aws/gfs-cloud-forecast/handler.py` + `grib2lite.py` | **운영 중.** NOAA NOMADS → 순수 파이썬 GRIB 해독(eccodes 2.48 과 일치 검증) → PNG + 매니페스트 → `clouds/gfs-fc/`. 이미 UGRD·VGRD(700hPa)·PRATE·CAPE·강수 종류를 받는다 | **W0** — 기온·바람 10m·기압을 같은 요청에 추가 |
| 마칭 스퀘어 등치선 | `prototype/js/contour-math.js`(154줄) + `gridmath.js` | Cesium·DOM 의존 **없음.** 격자 형식 `{nx,ny,lat0,lon0,res}` 이 v2 `buildField` 와 동일. 날짜변경선·결측 처리 끝나 있음 | **W1** 등치선 라벨 경로 |
| 입자 이류 알고리즘 | `prototype/js/windfield.js` (v1) | 구면 이류가 검증돼 있다: 랩 bilinear(`:275-288`) · cos(위도) 보정(`:523`) · 경도 랩(`:567`) · 줌 정규화 · 재배치. Cesium 2D 캔버스 부분만 빼고 **알고리즘을 이식** | **W3** |
| 입자 예산 함수 | `prototype/js/earthus2/v02/visual/flow.js` `flowRenderBudget` | 기기·발열 단계별 상한. ⚠️ 같은 파일의 `advectNormalized` 는 **재사용 불가**(x 를 0~1 로 clamp 해 날짜변경선에서 멈추고, cos 위도 보정이 없고, 표본마다 객체를 만든다 — 반박 검증에서 확인) | **W3** 예산만 |
| 화면 간격이 일정한 선 셰이더 | `prototype/v2-three/js/main.js:502-519` (해저 등심선) | `exp2(ceil(log2(fwidth(f0)*26.0)))` — 줌에 상관없이 선 간격 26px 유지 | **W1** 셰이더 등치선 |
| 등치선·단계색 계약 | `docs/earthus-v23/CONTINUOUS_LAYERS.md` §2 (2026-08-12) | v1 은 지금도 지킨다(`gridoverlay.js` stepped · `continuous-contours.js` · `isobars.js` 4hPa + H/L) | **W1·W2** 레벨 값의 출처 |
| 도시 값 라벨 규칙 | `prototype/js/gridoverlay.js:826-872` · `readability.js:376-390` | 도시 최근접 격자값 + `~` 표기(격자값을 도시값처럼 말하지 않는다) | **W1** 지도 위 숫자 |
| ECMWF 태풍 경로 앙상블(51멤버) | `aws/ecmwf-ingest` → `events/typhoon-ecmwf.json` (BUFR) | **태풍 경로만.** 기온·강수의 격자 앙상블은 **없다**(이 수집기는 격자를 받지 않는다) | **W9** 태풍 확률은 바로 가능 |
| IFS 대 AIFS 97지점 예보 + 관측 채점 구상 | `aws/ecmwf-ingest` (한국 ASOS 97곳 2m 기온, 24~120h) | 수동 1회분뿐 — **정기 실행 미등록**(README). ECMWF GRIB 은 AEC 압축이라 `grib2lite` 로 못 풀고 eccodes 필요(`deploy-ecmwf.sh` 에 패키징 있음) | **W8·W9** "AI 모델 대 물리 모델, 한국에서 누가 맞나" — 채점 있는 비교 |
| 텍스처 CPU 사본에서 점값 읽기 | `prototype/v2-three/js/main.js:1979-2016` `sampleAt` | 구름에 쓰는 중 | **W1·W2** 클릭 값·내 위치 5일 곡선을 **네트워크 호출 0건**으로 |
| 값 텍스처 → 프래그먼트 판정 + 두 프레임 blend | `prototype/v2-three/js/precip-field.js` | GFS 강수에 쓰는 중 | **W1** 렌더러의 뼈대가 이미 있다 |
| 채점 선례 | `aws/lab-events` (여진 기대수 채점) | 모형이 빗나가면 내리는 규율이 이미 돈다 | **W9** |
| 연안 침수 폴리곤 | `live-layers.js:1362-1418` `loadFloodDistrict` (국립해양조사원) | 앱에서 유일하게 설계된 '물이 육지를 덮는' 그림. '재해' 묶음에 있고 시군구를 눌러야 받는다 | **W6** |

---

## 3. 작업 흐름

크기: **S** 1일 이내 · **M** 2~4일 · **L** 1~2주 · **XL** 그 이상. 크기는 어림이고, 각 W 의 끝은 **화면에서 확인하는 완료 기준**으로 닫는다.

### W0 — 자료: GFS 필드 프레임 (M) · **모든 것의 선행**

**Before.** 기온·바람·기압·강수·자외선·PM2.5 격자가 전부 `wind/global.json` 한 파일 — **Open-Meteo 5° 격자, '지금' 한 시각.**
한 칸 555 km 라 렌더러를 아무리 잘 만들어도 목표 그림이 안 나온다. 타임라인을 밀어도 값이 없다. Open-Meteo 는 비상업 조항 위험이 감사로 확인됐다(`docs/R0-OPEN-METEO-AUDIT-2026-09-20.md`) — **유료 상품의 핵심 그림을 그 위에 세우면 안 된다.**

**After.** `aws/gfs-cloud-forecast` 가 같은 NOMADS 요청에서 아래를 **추가로** 받아 필드 프레임을 만든다. 0~120h · 3h 간격 · 41장 · 0.5°(720×361).

| 필드 | GFS 변수 · 레벨 | 프레임 | 인코딩 |
|---|---|---|---|
| 기온 2m | `TMP` · 2 m | `t{step}.png` 720×361 | **8bit 1채널 선형**, 0.5°C 눈금, −80~+47.5°C |
| 바람 10m | `UGRD`·`VGRD` · 10 m | `u{step}.png` 720×361 | R = u, G = v · 8bit 선형 0.5 m/s, ±64 m/s (지금 700hPa 바람과 같은 식 — 다만 **4° 가 아니라 0.5°**) |
| 해면기압 | `PRMSL` | `m{step}.png` | 8bit 선형 0.5 hPa, 940~1067 hPa(밖은 끝값) |
| 강수 | 이미 받는 `PRATE`·종류·뇌우 + `APCP`(누적) | `p{step}.png` | 지금 1°(360×181) → **0.5°** |
| 상층(2단계 · PRO) | `TMP`·`UGRD`·`VGRD` · 850·500 hPa | 같은 방식 | 필드가 늘수록 해독 시간이 는다 — 1단계에서 뺀다 |

- ⚠️ **16bit PNG 를 쓰지 않는다**(반박 검증에서 뒤집힌 것). 브라우저는 PNG 를 캔버스·텍스처로 올릴 때 8bit 로 내려 읽는다. 대신 **8bit 1채널 선형**으로 두면 하드웨어 `LinearFilter` 보간이 곧 **값 보간**이 된다 — 두 채널에 나눠 담으면 바이트 경계에서 보간이 깨진다.
  눈금은 **구간 경계가 정확히 표현되는 값**으로 고른다(기온 0.5°C → 5°C·2°C 경계가 전부 눈금 위). 보간된 값은 연속이라 등치선은 계단이 되지 않는다.
- **`gl.describe` 로 필요한 메시지만 해독한다.** NOMADS 는 변수×레벨을 교차로 주기 때문에 필요 없는 메시지(TMP surface·700mb 등)가 같이 온다. 지금은 전부 해독한다(`handler.py:147-148`).
- ⚠️ **등압면을 하나라도 더 켜면 구름이 조용히 망가진다.** `fields_from_grib :160-163` 은 'cat 2 · lt 100' 만 보고 `levelValue` 를 안 본다 — 850hPa 를 켜는 순간 구름 이류용 700hPa u/v 가 덮인다. `describe` 의 `levelType/levelValue` 로 분기한다(10 m = lt 103 / 10, 700hPa = lt 100 / 70000). `url_for` 가 변수×레벨 **교차곱**이라(`:99-110`) 10 m 를 켜면 TMP 가 surface·2m·700 에 다 딸려 온다.
- **한도를 넘으면 유료 구간부터 빈다.** DEADLINE(840초)을 넘기면 늦게 끝난 스텝부터 탈락하는데(`:356-358`) 그게 대개 +120h 쪽이다. 완료 조건을 **`elapsedS < 600` · `missingSteps = []`** 로 둔다. 같은 런을 3시간마다 다시 만드는 중복(하루 8회 실행 · GFS 는 4런)은 매니페스트 run 비교로 건너뛴다.
- **새 필드는 '없으면 그 프레임만 생략'.** 지금 `fields_from_grib` 은 하나라도 없으면 스텝 전체를 버린다(`:169-174`) — 그대로 두면 기온 한 장이 빠질 때 구름까지 같이 죽는다.
- NOMADS 레벨 문자열(`lev_2_m_above_ground` 등)은 이 저장소에서 검증된 적이 없다. **인벤토리에서 문자열을 확인한 뒤 확정**한다 — 틀리면 0바이트/500 이다(CWAT 때 밟은 함정).
- 기준 실측(2026-09-19 12Z 런): 41스텝 **270.4초 / 한도 900초** · 2048 MB · `rate(3 hours)`. 변수 추가 뒤 다시 잰다.
- 매니페스트에 **모델 이름 · 실행 시각(run) · 해상도 · 각 프레임의 유효 시각**을 적는다. Inspector 와 "GFS 18Z · 5 h ago" 표시가 이걸 읽는다.
- **'지금'의 정직.** 실측으로 12Z 런이 22:10Z 에 올라왔다 — v2 의 GFS '지금' 프레임은 실제로는 **+6~12시간 예보**다. windy 가 "ref 12Z, 2시간 44분 전"을 밝히듯, 배지에 run 과 +h 를 **항상** 적는다. '현재 기온'이라 부르지 않고 '지금 시각의 모델 기온'이라 한다.
- **프레임 로더를 `CloudManager` 에서 떼어 공용 프레임 저장소로.** 지금은 구름이 GFS 모드일 때만 프레임이 로드된다(`main.js:1814-1844`, `4442-4443`) — 구름이 위성 모드여도 기온·바람 프레임이 떠야 한다. **W1·W2·W3·W4 공통 선행.**
- 받지 못한 스텝은 매니페스트에 넣지 않는다(기존 규칙 유지). 빈 프레임을 만들지 않는다.
- ⚠️ 0.25° 는 못 간다 — 스텝당 GRIB 10.8 MB, 순수 파이썬 해독이 41스텝을 Lambda 시간 안에 못 끝낸다(파일 머리 주석, 기억 `gfs-forecast-frames`). **0.5°(55 km)가 지금 구조의 천장이고, 지구본 축척에서는 충분하다.** 한반도 확대용 고해상은 W2 의 2단계(기상청 격자)로 따로 푼다.
- ⚠️ `marine-grid` 가 300초 한도에 278초까지 간 전례가 있다. 이 Lambda 도 변수 추가 뒤 **실행 시간을 실측**하고, 넘치면 변수별 함수로 쪼갠다.

**완료 기준.** ① `clouds/gfs-fc/manifest.json`(또는 새 접두사)에 t·u·m 프레임 41장이 실리고 run 시각이 있다 ② 브라우저에서 t 프레임 한 장을 받아 서울 칸 값을 풀면 기상청 실황과 ±3°C 안이다 ③ Lambda 실행 시간 < 한도의 70%.

### W1 — 공통 렌더러 계약 `FieldRenderer` (L) · **한 번 잘 만들어 여섯 번 쓴다**

**Before.** `live-layers.js:1072-1121 buildField` — 72×36 캔버스에 `rampFrom`(선형 보간, `:2931-2944`)으로 색을 **먼저** 칠하고 `LinearFilter`(`:1108-1109`)로 늘린다. 색을 섞은 뒤 또 섞는다. 반지름 1.0012 고정 구 껍질(`:1113`)이라 지형을 모른다. 등치선·라벨·범례 없음. 9개 레이어가 이 함수를 쓴다.

**After — 원칙은 하나다: _값을 보간하고, 색은 양자화한다._**

1. **값 텍스처.** W0 의 8bit 1채널 선형 PNG 를 텍스처로 올린다. 필터는 Linear — 색이 아니라 **값**을 매끄럽게 잇는다. `precip-field.js` 에서 가져올 것은 **'프레임 2장 blend + 구면 UV' 구조까지**다 — 그 파일의 색은 `mix` 연속 램프라 구간화 코드가 아니다. **구간화 셰이더는 W2 기온에서 새로 만들고** 나머지 현상이 그것을 쓴다.
2. **프래그먼트 셰이더에서 구간색.** `value = decode(texture)` → 레벨 배열에서 구간 찾기 → 팔레트 텍스처(1×N, **NearestFilter**)에서 색. 구간 경계가 격자 칸 모양이 아니라 **매끄러운 곡선**으로 나온다(시안의 등온선 모양). 색 섞임 0.
3. **셰이더 등치선.** `fract(value/interval)` + `fwidth` 로 선을 긋는다(등심선 셰이더와 같은 기법, `main.js:502-519`). 줌과 무관하게 선 굵기 일정. 주 레벨(예: 10°C 마다)은 굵게.
4. **라벨.** 선은 셰이더가 긋고, `contour-math.js` 는 **라벨 자리 찾기 전용**으로만 쓴다(수정 없이 v2 로). 2° 로 솎은 격자(180×91)에서 **키프레임이 바뀔 때만** 실행, 앞 반구 라벨 데스크톱 ≤ 24 · 모바일 ≤ 12.
   이유: ① 3시간 프레임 사이를 blend 하는 동안에도 색 경계와 선이 **항상 일치**한다 ② 41프레임 재생 중 CPU 재계산이 0이다(v1 `isobars.js:16-17` 발열 규칙) ③ 720×361 × 11레벨 마칭 스퀘어를 키프레임마다 돌리면 모바일에서 끊긴다.
5. **육지/바다 마스크.** 바다 현상(SST·파고·해류)은 셰이더에서 **지형 고도 > 0 이면 discard** — 껍질이 육지를 덮는 버그(§W6)가 구조적으로 사라진다. 대기 현상은 지형 위 고정 고도가 아니라 **지형을 따라 lift** 한다.
6. **범례 컴포넌트.** 팔레트와 레벨 배열은 **한 곳**(`field-scales.js`)에서 나온다 — 셰이더와 범례가 같은 표를 읽어야 "색 경계 = 범례 경계 = 등치선 값"이 깨지지 않는다(지금 파고가 계약 1·2·3·4·6·9 m 와 다른 0·1·2.5·4·6·8 로 들어가 있는 사고의 원인).
7. **지도 위 숫자.** 지구 위에 찍는 숫자는 **실측 관측소 값**(GTS SYNOP + 기상청, `wind/gts-global.json`·`wind/kma-aws.json` — 이미 있다, 허브 호출 증가 0)을 'OBS' 점과 함께. 모델 격자값을 도시값처럼 찍지 않는다.
   **타임라인이 '지금'이 아니면 관측 숫자를 숨긴다** — 예보 시각의 색면 위에 현재 관측을 얹으면 관측과 예보가 섞인다. 예보 시각에는 등치선 라벨이 숫자 역할을 한다.
   클릭 값: 모델값은 **0.5°C 눈금 + "0.5° 격자(약 55 km) 평균"** 으로, 0.1°C 는 **최근접 실측 지점값**(이름·거리·관측 시각)에만 쓴다 — 8bit 눈금과 격자 평균에서 0.1°C 정밀은 나오지 않는다. 값은 텍스처의 CPU 사본에서 읽는다(`sampleAt`) — **네트워크 호출 0건.**
8. **시간.** `setTimeOffset(ms)` 에서 두 프레임을 골라 셰이더에서 값 보간(`mix(v0, v1, f)`). 보간 구간은 Inspector 에 "모델 프레임 사이 보간"이라고 말한다.
9. **입자와 색면은 분리.** 색면은 라디오(하나), 입자는 토글. 기온 색면 위로도 바람이 흐른다(mapped.earth 문법).

**`field-scales.js` 에 들어갈 표(PD 정본 이미지에서 읽은 값 — 계약 `CONTINUOUS_LAYERS.md` 와 다르면 PD 정본이 이긴다):**

| 현상 | 구간 경계 | 등치선 | 단위 |
|---|---|---|---|
| 기온 | −10 · −5 · 0 · 5 · 10 · 15 · 20 · 25 · 30 · 35 (11단) | 2°C / 5°C 선택, 10°C 마다 굵게 + 라벨 | °C |
| 풍속 | 1 · 5 · 10 · 20 · 30 · 40 · 50 (8단) | **없음**(5° 교훈: 풍속 등치선은 격자 모양이 된다 — v1 이 09-08 에 뺐다. 0.5° 에서 재평가는 W3 뒤) | m/s · kt 동시 |
| 기압 | 색면은 옅게 | **4 hPa 등압선 + H/L 기호**(v1 `isobars.js`) | hPa |
| 강수 | 0.1 · 0.5 · 1 · 2 · 5 · 10 · 20 · 50 (8단) | 강한 코어(≥10) 윤곽 | mm/h ↔ 누적 mm 자동 전환 |
| SST | 0 · 4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 (10단) | 1°C 토글 · **26·29°C 강조**(태풍 발달·산호 백화 경계) | °C |
| SST 편차 | −1.5 · −0.5 · 0.5 · 1.5 (+바깥) | **0 선 강조** | °C |
| 파고 | 1 · 2 · 3 · 4 · 6 · 9 | 같은 값 | m |
| PM2.5 | 15 · 25 · 50 · 75 · 150 (6단) | — | µg/m³ |

**완료 기준.** ① 같은 팔레트 표에서 셰이더·범례·등치선이 나온다(시험: 표를 한 줄 바꾸면 셋이 같이 바뀐다) ② 1440p 에서 60fps, 모바일 중급기에서 30fps ③ 레이어 전환 시 UI reflow 없음.

### W2 — 기온 (M) · **기준 구현체**

**Before.** `tempgrid` → `buildField(data,'t',TEMP_RAMP)`. 정지점 8개 선형 램프. 카드에 해상도·칸 수는 적혀 있으나 색을 값으로 되돌릴 눈금이 없다. '내일 최고/최저' 레이어는 v2 에 **통째로 없다**(v1 에는 있다).

**After (시안 01 그대로).** 5°C 구간색 11단 + 흰 등온선 + 지구 위 "20°C"·"30°C"·"−10°C" 라벨. Inspector: `Surface (2m) ▾`(2단계에서 850hPa) · `Isotherm` 토글 + `2°C | 5°C` · `Model GFS` + run 시각 · `Actual | Anomaly` 전환. 타임라인을 밀면 5일 예보가 움직인다.
- **Anomaly 탭**: 1단계는 **한국 관측** — `평년 대비 기온` 메뉴 줄을 없애고 이 탭으로 넣는다. 점(9px) → **숫자 마커("+3.2")**, 발산형 구간색 11칸. 비교는 같은 것끼리: **어제 하루 평균 − 그날 평년 평균**(`intel_temp.py` 규칙, 지금 7지점 → 평년이 있는 **83지점**으로 확장). "지금 기온 − 하루 평균 평년"은 매일 오후를 덥게 만든다 — 지금 레이어가 그렇게 하고 있다(`live-layers.js:1451-1453`).
  2단계 전지구: ERA5 1991–2020 평년(Copernicus, 출처표시)을 한 번 받아 정적 자산으로 — **PD 결정 5-2 #3.**
- **Open-Meteo 직접 호출을 걷어낸다.** 브라우저가 `api.open-meteo.com` 을 직접 부르는 곳이 **5곳**이다: `main.js:1706`(구름 폴백) · `2898`·`2900`(바다 클릭) · `2932`(날씨 클릭) · `3403`(서핑). 기온 작업은 `2932` 를 텍스처 읽기로 바꾼다.
- 카드 문구 정정: 모델값인데 "관측 범위"라고 적혀 있다(`live-layers.js:1191`) → "모델 범위".
- 한반도 확대(2단계): 기상청 동네예보 격자(5 km)를 한국 상자에 덧씌운다.

**완료 기준(PD 정본).** 연속 그라데이션 단독 표현이 없다 · 온도 경계가 구간 팔레트로 보인다 · 등온선에 숫자 라벨 · 관측/예보/평년 편차를 같은 UI 에서 전환 · 범례가 항상 의미와 단위를 말한다 · **10초 안에 "어디가 얼마나 다른가"를 말할 수 있다.**

### W3 — 바람 (L) · **P0 범위는 'GFS 0.5° · 10 m 한 고도'로 자른다**

**Before.** `buildWind`(`live-layers.js:2130-2248`) — 관측소마다 `LineSegments` 선분(19~89 km), 입자 2개가 자기 선분 위만 왕복(`:2184`, `:2227`), `gl_PointSize 3.2` 고정. 이류·유선 0건. v2 는 첫 커밋(`70366d4e`)부터 이랬고 `NEXT_STEPS.md:96` 에 '바람장'이 남은 일로 적혀 있었다. 격자(`windgrid`)는 u/v 를 `Math.hypot` 으로 속력만 남기고 **방향을 버린다**(`:1154-1166`). 5° 격자는 전지구 최대가 23.8 m/s, 30 m/s 이상이 **0칸** — 태풍이 격자 사이로 빠진다.

**After (시안 02).** 속도 구간색 8단 위로 **입자 유선**이 전지구(바다 포함)를 흐른다. 저기압·태풍이 소용돌이로 읽힌다.
- **과도기 화면을 만들지 않는다.** 5° 나 동아시아 1°(둘 다 Open-Meteo)로는 출시하지 않는다. 자료는 W0 의 GFS 10 m u/v 프레임뿐. 엔진 개발 중 시험은 이미 있는 `w{step}.png`(4° 700hPa)로 하되 화면에 '지상 바람'으로 내보내지 않는다.
- **이류**: v1 `windfield.js` 의 구면 이류를 이식한다(랩 bilinear · cos 위도 · 경도 랩 · out 재사용으로 GC 회피). `flow.js` 에서는 예산 함수만 쓴다.
- **꼬리 — 초안을 뒤집었다.** 나는 v1·mapped.earth 식 '화면 공간 페이드'를 적었는데, **v2 는 자동 회전이 기본이다**(`main.js:581`, `706`). 화면 공간 페이드는 지구가 도는 동안 꼬리가 옆으로 미끄러지거나 매 프레임 지워진다(두 기준 사이트는 지구를 자동 회전시키지 않고, 움직이는 동안 입자를 비운다). 권고는 **월드 공간 이력 선분**(입자당 링버퍼, 드로우콜 1개). **1일 스파이크**로 데스크톱·폰 프레임 시간과 폰 DPR 2 에서의 선 굵기(WebGL 1px 한계)를 재고 확정한다.
- **입자 수**: 18,000 / 5,000 은 상한일 뿐이다 — v1 실측 상한은 **4,200**(`windfield.js:25`)이었다. `입자 강도` 3단 칩은 고정 숫자가 아니라 **'기기 예산의 1/3 · 2/3 · 전부'**, 기기 예산 = `flowRenderBudget` × `ThermalGovernor` 의 `particleScale`(`main.js:2404-2413`).
- 색면 ON 이면 입자는 흰색, OFF 면 입자가 속도 구간색. 입자와 색면은 같은 반지름에 둔다(시차 방지). 입자 토글은 **기온·강수 색면 위에서도 유지**된다(색면 라디오와 무관한 공용 오버레이).
- **기억에 남긴 네 함정을 지킨다**(`windfield-particle-speed`): 밀도는 CSS 픽셀 기준 · 줌 정규화 · 색 단계 · 풍속 등치선 금지.
- **색면**: PD m/s 8칸. v1 계약의 '풍속 색면에 stepped 금지'는 5° + nearest 강제 때문이었다 — 0.5° + 보간 후 구간화면 그 원인이 없다. 등풍속선은 그리지 않는다.
  ⚠️ 40~50 · ≥50 칸은 **약속하지 않는다**(GFS 0.5° 는 태풍 중심을 무디게 담는다). 그래서 태풍 부근을 클릭하면 Inspector 에 **재해 쪽 공식 최대풍속**을 기관명·발표 시각과 함께 병기한다.
- **범례**: m/s·kt 두 줄 + `MODEL · GFS 0.5° · run/valid` + "입자 속도·꼬리 길이는 방향과 상대 세기를 보이기 위한 과장 표현" 한 줄. 런이 12시간 넘게 늙으면 '지연'.
- **Inspector**: 선택지가 하나면 칩으로 가장하지 않는다 — P0 에서 Level 은 '10 m' 고정 표기, Model 은 'GFS' 고정 라벨. `Pressure` 토글은 기압이 실제로 동작하는 날 나타난다(**죽은 토글 금지**).
  클릭: 최근접 0.5° 격자점의 풍속·풍향(16방위+도)을 `~` 와 "격자점 좌표·거리·눈금 0.5 m/s"와 함께. 25 km 안에 관측소가 있으면 OBS 값을 먼저.
- **관측소 3,000곳**: 막대 폐기 → `Show Stations`(기본 OFF), 확대 시 숫자 + 작은 화살촉 + OBS 배지. 모델 입자와 섞지 않고 관측 공백은 비워 둔다.
- 후속(이 L 에 넣지 않는다): 상층 850/500/250 hPa(M · P1) · 서태평양 0.25° 창(M · P2) · GFS|ECMWF(ECMWF 격자 L 선행). 그 전까지 Compare 짝은 **'GFS 최신 런 | 이전 런'** — 새 라이선스 0, "예보가 어떻게 바뀌었나".
- PD 결정 하나: PD 8칸 눈금이 10 m 바람에는 성기다(실측 중앙값 6.1 · 99% 17.2 m/s) — 평온한 날 전지구가 사실상 3칸 색이다. 눈금은 정본대로 두고 칸 안의 차이는 입자가 맡되, 10 m 전용 세분 눈금을 둘지는 **5절**.

**완료 기준.** ① 자동 회전 중에도 꼬리가 지구에 붙어 흐르고, 입자가 날짜변경선을 끊김 없이 넘으며 극 근처에서 폭주하지 않는다 ② 전지구 뷰에서 저기압 둘레 소용돌이가 읽히고 색면이 단색 띠로 나뉜다 ③ 클릭하면 `~N m/s · 방위 · 격자점 · GFS run/valid`, 25 km 안 관측소는 OBS 로 따로. Open-Meteo 출처 문구가 어디에도 없다 ④ 폰(375)에서 입자 ≤ 5,000, 발열 시 눈에 띄게 줄고 드래그가 안 끊긴다. **막대기 선분은 어디에도 없다.**

### W4 — 강수 (M)

**Before.** `radar`(한국 레이더)가 primary, 전지구는 `raingrid`(Open-Meteo 5°) 색면과 `cloud-gfs`(GFS 5일 예보 — 구름 밑 비/눈/뇌우). 현재 강우와 누적의 구분이 없다.

**After (시안 03).** mm/h 구간색 8단 + 강한 코어 윤곽. 칩: `현재 강우 | 1h · 3h · 24h 누적 | 비·눈 타입 | 레이더·모델`. 누적을 고르면 범례 단위가 mm 로 **자동 전환**. 한국은 레이더(관측)를 우선하고 배지로 구분.
- 누적은 W0 프레임에서 **브라우저가 더한다**(PRATE × 3h 합) — 새 수집 없음. "모델 강수율의 합산"이라고 Inspector 가 말한다.

**완료 기준.** 현재와 누적이 시각적으로 확실히 다르다 · 단위 명시 · 타임라인 이동 시 범례 단위가 맞게 바뀐다.

### W5 — 셸: 좌레일 9 · Inspector · 타임라인 하나 · View 분리 (L)

**Before.** 하단 탭 5개(지금·탐색·내 지역·리포트·우주) + 탐색 서랍 안 묶음 6개 66현상 + 우측 패널(탭 5개) + 상단 버튼 7개 + 설정 서랍에 **데이터(구름 소스·눈얼음)와 렌더 튜닝(지형 과장·음영·위성 혼합·태양각)이 섞여 있음.** 모바일에서 메뉴를 골라도 서랍이 안 닫혀 지구가 가려진다(UX 수리 지시서 §7.2 미이행).

**After (PD 정본 §2).**
- **LEFT RAIL** 11개: 기온 · 바람 · 강수 · 구름 · 해양 · 재해 · 대기질 · 우주 · 지형 + **Life · Travel**(2026-09-20 PD 추가 결정). 1탭 진입. 9개 현상 메뉴와 두 메뉴 사이에 가는 구분선 하나 — 성격이 다르다는 것을 레일이 말한다.
- **RIGHT INSPECTOR** 하나: 현상 컨트롤(칩·토글) + 범례 + 클릭한 곳의 `값 · 단위 · 출처 · 관측/모델 시각 · 모델` + `Compare` · `Intelligence` 진입.
- **BOTTOM** Global Timeline **하나**. 메뉴마다 슬라이더를 새로 만들지 않는다. 모델·run 시각("GFS 18Z · 5 h ago")이 항상 옆에.
- **TOP** Search(돋보기 하나가 검색+물어보기 — 2026-09-20 PD 결정) · Share · View · Compare · Intelligence · Simulation · Account.
- **VIEW > Appearance** 로 이동: 3D Earth/Terrain 전환 · 위성 혼합 · 대기 · 음영 · 지형 과장 · 태양 조명 · 자동 회전 · 지구 바탕 그림(09-20 에 설정으로 옮긴 것).
- 모바일: 메뉴를 고르면 **서랍이 닫히고 지구가 최대 영역을 되찾는다.** Inspector 는 바텀시트(이미 3단으로 만들어 둠).

**66현상의 행선지 — §4-0 표의 '자리' 칸과 §5-1.** PD 정본의 9개 레일에 자리가 없던 27현상은 이렇게 갔다: **Life 8 · Travel 4 (PD 확정)** · 9개 메뉴로 흡수 7 · v1 로 보냄 4 · 상단/Inspector 1 · 뺌 3 (**2026-09-20 PD "모두 진행해" — 전부 승인**).

**완료 기준.** 어떤 현상이든 1탭 · 타임라인 1개 · Inspector 1개 · 데이터 패널에 렌더 튜닝값 0개 · 1440p 에서 레이어 전환 시 reflow 없음.

### W6 — 바다 (M~L)

**Before / 버그.** 바다 색면 3종(`wavefield`·`sstfield`·`sstanom`)이 `SphereGeometry(1.0012)` 고정 껍질. 지형은 `max(h,0)/6371000 × uExagger(50)` 로 솟으므로 **해발 153 m 이하 육지가 전부 물빛 아래로 들어간다.** 가까이 가면 과장이 자동으로 낮아져(`main.js:6244`) 764 m → 1,529 m 까지 잠긴다. PD 가 본 "파고를 누르면 육지가 잠긴다"는 기능이 아니라 이 버그다. `ocean/slr` 은 AR6 조위관측소 1,016곳의 **기둥**이다.

**After (시안 05).**
- W1 의 육지 마스크로 **버그가 구조적으로 사라진다.** (W1 전에 급한 불만 끄려면: 셰이더에서 고도>0 discard 한 줄 — **S**.)
- `SST | SSTA` 탭 · 구간색 10단 · `Contour (1°C)` 토글 · 26·29°C 강조. 자료는 이미 있는 NOAA OISST(0.25° 원자료를 1° 로 표본 중 → **0.25° 그대로** 쓰도록 `marine-grid` 조정).
- **해류**: 화살표 선분 → **입자 유선**(W3 엔진 재사용, 기본 ON). 자료는 지금 Open-Meteo Marine — 라이선스 대체로 Copernicus Marine(CMEMS, 출처표시) 검토.
- **파고**: 방향 + 높이 glyph, 파고와 너울을 별도 수치. GFS-Wave(NOAA, 퍼블릭 도메인 · 0.25°)가 W0 와 같은 방식으로 들어온다.
- **해수면 상승 전망**: 기둥을 걷고 **'잠기는 면'** 으로. 두 층으로 나눈다.
  ① 한국: 국립해양조사원 침수 폴리곤(`khoaflood`)을 '재해'에서 **해양 > 해수면 상승**으로 옮기고, 시군구를 누르기 전에도 전국 색인이 보이게 한다. 기관 산출물 그대로.
  ② 전지구: AR6 전망 높이를 지형 고도와 비교한 **노출 셈**. 이건 EARTHUS 의 새 계산이다 — `sim-questions.js` 에 이미 "해수면이 오르면 어디가 잠길까?"가 NOT_AVAILABLE 로 있다. **Simulation(W10)의 첫 시나리오 후보.** 방조제·지반 침하를 모른다는 한계를 결과 옆에 둔다.

**완료 기준.** 어떤 줌에서도 바다 색이 육지를 덮지 않는다 · SST 와 SSTA 의 색 의미가 다르다 · 해류가 흐른다 · 해양 자료의 갱신 시각·출처가 Inspector 에 고정.

### W7 — 재해 · 대기질 · 구름 · 우주 · 지형 (각 M)

공통: W1 렌더러 계약 + W5 Inspector. 현상별 Before/After 는 §4 표. 원칙만 적는다.
- **재해(시안 06)**: Event-first. 태풍 = `Track · Forecast Cone · Wind Area` 토글 + 범주 범례. 지진 = 진앙·규모·깊이 동시. 산불 = hot spot 과 perimeter 구분. **공식 발표 시각·기관명 상시. 안전 정보는 구독과 무관하게 무료.** severity 는 구간색.
- **대기질(시안 07)**: `PM2.5 | PM10 | O₃ | NO₂` 칩 1탭 · 오염물질별 기준 구간 · `Show Stations` 토글(관측소와 모델 field 를 섞지 않는다). 전지구 모델은 CAMS(Copernicus, 출처표시) — 지금은 Open-Meteo 5° 라 **교체 대상.**
- **구름(시안 04)**: `Observation | Forecast` 를 **먼저** 구분 · Satellite 는 별도 quick mode · 칩(구름량·운정고·저중고층) · 불투명도·입체감은 View 로. 관측 시각과 현재 시각을 함께.
- **우주(시안 08)**: Aurora 확률 구간(NOAA OVATION 공식 확률 — **기관 발표라 %가 정당하다**) + Kp · 위성 선택 시 궤도·고도·속도·다음 통과.
- **지형(시안 09)**: Elevation · Contours(100/250/500/1000 m 프리셋) · Hillshade · Satellite 만. 과장·태양각은 View 로.
- **Life(신설 메뉴)**: 숲 · 새(철새 \| 육상 조사 \| 바닷새) · 사람(인구 \| 서울 실시간 혼잡) · 심해 체험 · 바다거북. **막대기·점 구름을 여기서도 없앤다** — 철새 꺾은선 → 대권 호 리본, 조류 조사 점 → 0.05° 칸 면 단계색, 바닷새 점 → 숫자 원판, 인구 1px 기둥 숲 → 밀도 릴리프 면 단계색(명/㎢), 서울 혼잡 상자 → 지표 원판 + 공식 4단계 색 + 범위 라벨. ⚠️ 바다거북은 공공누리 4유형(상업적 이용금지·변경금지) — 기관 서면 확인 전 **동결**. 조류 조사는 '제3자 권리 포함' — 권리 확인 전 FREE 고정.
- **Travel(신설 메뉴 · 한국)**: 칩 `오늘 갈 곳 | 목적별 장소 | 방문자`, 연관 관광지는 장소 Inspector 의 '이곳 다음에 간 곳 Top 5'로. 7px 밝기 점 → 점수·건수 5단 단계색 숫자 원판 + 상위 10곳 순위 라벨. ⚠️ **관광 데이터랩 대회(접수 2026-09-30 · 발표심사 10-23) 출품 모듈이다 — 그때까지 구조 이동은 동결하고 그림·문구만 고친다.** "매일 다시 점수 매깁니다"는 사실이 아니다(점수 몸통은 09-02 정적 파일) → 사실대로 고친다(S, 즉시).

### W8 — Compare (L) · **PRO 핵심 가치**

**Before.** 없다. **After (시안 10).** split globe 또는 draggable wipe · `Model A | Model B` · Variable · Level · Time · 공통/모델별 scale **명시 선택** · difference mode · 각 모델 run 시각·해상도 · URL 공유. 카메라·시간·고도·범례 동기화.
- 두 번째 모델은 **ECMWF open data**(CC-BY-4.0, 0.25°, IFS). ⚠️ **지금 저장소에 ECMWF 격자 수집기는 없다** — `aws/ecmwf-ingest` 는 한국 97지점 점값과 태풍 경로만 받는다. ECMWF GRIB 은 AEC 압축(5.42)이라 `grib2lite` 로 못 풀고 **eccodes 가 필요**하다(`deploy-ecmwf.sh` 에 eccodes 패키징과 `.index` Range 수신이 이미 있어 재사용). **격자 수집기는 별도 L 작업이고 Compare 의 선행 조건이다.**
- 렌더는 W1 을 두 번 — 새 렌더러를 만들지 않는다.
- **먼저 팔 수 있는 비교가 하나 있다:** `ecmwf-ingest` 가 이미 받는 **IFS(물리) 대 AIFS(AI), 한국 97지점 5일 기온.** 기상청 관측과 채점하면 "한국 날씨에서 AI 모델이 슈퍼컴퓨터를 이기는가"를 말할 수 있다 — 기준 사이트 어디에도 없는 것. 정기 실행 등록(PD 권한)이 선행이다. ECMWF open data 는 2~3일치만 보관해서, 지나간 회차는 되돌릴 수 없다.

### W9 — Intelligence: 원인과 확률을 말할 자격을 만드는 기계 장치 (XL) · **EXPLORER 핵심 가치**

**Before.** `intelligence:true` 34현상 중 패킷 생산자 4개(태풍·수온·지진·평년 대비 기온). WHY 는 "함께 나타난 조건"에서 멈춘다. 2026-09-20 새벽에 만든 서술 가드(`aws/earthus-llm/narration_guard.py`)는 '때문에'·'가능성'을 **무조건** 막는다 — 계약 §C-2 표를 글자 그대로 구현한 것인데, 그 표가 제품 의도와 어긋난다. **운영에 올리지 않았다.**

**After (시안 11).** 위치 선택 → `28.4°C` → `+2.3°C vs Normal` → `Data Source KMA (Observation) · 시각` → **그 아래** "…고기압이 N일째 머물러 평년보다 2.3°C 높습니다. 앞으로 3일 더 이어질 확률 **75%**" → View Details. 탭 `Now | Forecast | Climatology | Analysis`.

만들 것 넷:
1. **귀속 규칙(attribution).** 패킷에 `attribution[]` 절 신설: `{claim, condition(측정값·출처·시각), mechanism(문헌 인용), strength}`. 조건과 기작이 **둘 다** 실릴 때만 인과 문장을 허용. 첫 규칙 세트(기온): 500hPa 능선 지속 일수(GFS 분석장) · 해수면 온도 편차 · 지면 건조. 문헌은 연결표 `phenomenon-relations.js` 에 이미 자리가 있다.
2. **앙상블 확률.** 패킷에 `probability[]`: `{event, p, source: ENSEMBLE | AGENCY | VERIFIED_MODEL, members: 38, total: 51, model, run}`. **화면은 %(시안대로)**, 근거 "51개 중 38개"는 바로 아래.
   - **지금 바로 되는 것: 태풍.** ECMWF 51멤버 경로가 이미 있다(`events/typhoon-ecmwf.json`) — "한반도 300 km 안을 지날 확률"을 센다. FOR ME 카드가 이미 개수를 세고 있다(`facts.ens`).
   - **기온·강수·바람은 격자 앙상블이 없다 — 새로 받아야 한다.** 1순위 후보는 **NOAA GEFS**(31멤버 · 0.5° · 퍼블릭 도메인 · NOMADS 필터). ⚠️ `grib2lite` 가 GEFS 의 패킹을 푸는지는 **확인 안 됨** — 착수 전에 한 파일로 검증한다. 31멤버 × 스텝이라 무겁다: 변수 2~3개 · 하루 간격 · 한국 상자부터. 2순위 ECMWF ENS(eccodes 필요).
   - 기관이 발표한 확률은 그대로 인용한다(오로라 OVATION · 기상청 강수확률).
3. **채점.** 말한 확률을 결과와 대조(Brier·신뢰도 곡선). `lab-events` 채점 구조 재사용. 등급이 떨어지면 그 확률은 내린다(여진 모형을 내린 선례).
4. **가드 개정.** 계약 §C-2 표와 `narration_guard.py` 를 **"패킷에 근거가 실려 있으면 통과, 없으면 차단"** 으로. 골든 세트에 **반드시 통과해야 하는** 사례(근거 있는 원인 문장·근거 있는 확률)를 추가 — 지금 50건은 전부 차단 사례다.

**완료 기준.** AI 문장보다 원 수치가 먼저 보인다 · 각 문장에 출처·시각이 달린다 · 편차와 신뢰가 분리 표시 · '왜'와 '다음' 두 카드 · 결과를 Simulation 으로 넘길 수 있다 · **근거 있는 원인·확률 문장이 실제로 나온다**(금지 시험만 통과하는 것은 완료가 아니다).

### W10 — Simulation 작업 공간 (XL) · **PRO**

**Before.** 21현상 중 진짜 계산은 쓰나미 1건. 버튼 24개 중 실제로 무언가 일어나는 것은 6개, 18개는 사유 문장만. 시나리오 슬라이더가 일반 패널에 섞여 있다.
**After (시안 12).** 별도 작업 공간 · `Current → Baseline → Scenario → Result` 4단계 · 슬라이더 대신 **이름 붙은 시나리오 칩** · 결과는 absolute 와 delta 동시 · 진입 전 현재 상태 스냅샷 자동 저장 · 해상도와 모델 출처 표시.
- 첫 시나리오 후보: ① 쓰나미 도달시간(이미 있음) ② 해수면 상승 노출(W6) ③ 기후 시나리오 +2°C/+4°C(CMIP6 — 시안의 예. 새 자료 확보 필요, 가장 뒤).

---

## 4. 메뉴별 Before / After — 66현상

> 아래 표는 묶음별 3단계 분석(현황 실측 → PD 정본 기준 개선안 → 자료·라이선스·정직성·성능 반박 검증)의 최종 결과다.

**전체 67현상.** 지금 등급 — D 망가져 보인다 13 · C 빈약하다 29 · B 손보면 된다 23 · A 팔 수 있다 1 · ? 1.
처분 — 다시 만든다 11 · 고친다 11 · 합친다 26 · 옮긴다 16 · 뺀다 3. 우선순위 — P0 5 · P1 20 · P2 24 · P3 18.

### 4-0. 한눈에

| 옛 묶음 | 메뉴 줄 | **새 자리** | 지금 | 처분 | 우선 | 크기 | 바꾼 뒤(한 줄) |
|---|---|---|---|---|---|---|---|
| 대기 | 기온 | **?** | D | 다시 만든다 | P0 | XL | [→ 01 Temperature · 기준 구현체] PD 목표 화면(5°C 11칸 단색 · 흰 등온선+지구 위 숫자 라벨 · 범례 · Inspector 칩 · Actual/Anomaly)은 그대로 둔다. 도달 경로만… |
| 대기 | 평년 대비 기온 | **?** | B | 합친다 | P1 | M | [→ 01 Temperature 의 'Actual \| Anomaly' 탭] 독립 메뉴 줄을 없애고 PD 정본의 전환 자리에 넣는다. 1단계 범위는 한국 관측이고 탭 라벨에 'Anomaly · 한국 관측'이라 밝힌… |
| 대기 | 오늘의 극값 | **11 Intelligence** | C | 옮긴다 | P2 | M | [→ 자리 없음 · **PD 결정 필요**] 현상이 아니라 도구다. 권고 = MOVE: 좌측 레일에서 빼고 11 Intelligence 'Now' 탭 맨 위 '오늘의 극값' 카드 묶음으로.<br>① 카드 본체(DO… |
| 대기 | 강수 | **?** | D | 다시 만든다 | P0 | L | [→ 03 Rain] PD 목표(mm/h 8칸 단계색 · 강한 코어 contour · 칩: 현재/누적/타입/레이더·모델 · 누적 시 범례 단위 자동 변경)는 그대로. **P0 는 코어만**, 나머지는 P1 로 내린… |
| 대기 | 구름 | **?** | A | 고친다 | P1 | M | [→ 04 Clouds] 그림은 유지하고 셸만 PD 정본에 맞춘다.<br>① 메뉴 1탭 = 켜짐/꺼짐 토글. 'cloud-off' 줄 삭제, 기본 켜짐 유지.<br>② Inspector 첫 줄 세그먼트 [Obser… |
| 대기 | 안개·낮은구름 | **?** | C | 합친다 | P3 | S | [→ 04 Clouds › Satellite quick mode 의 '밤 안개 후보' 칩] 독립 메뉴 줄을 없앤다. 04 Clouds(P1)가 먼저 나가야 자리가 생긴다.<br>① 구름을 대체하지 않고 겹친다: C… |
| 대기 | 바람 | **?** | D | 다시 만든다 | P0 | L | [→ 02 Wind] P0 범위를 'GFS 0.5° · 10m 한 고도'로 자른다. 상층·0.25° 창·ECMWF 는 후속으로 뗀다.<br>① 입자장(토글, 기본 ON)<br>- 자료는 GFS 10m u/v 프레임… |
| 대기 | 기압 | **?** | D | 합친다 | P1 | M | [→ 02 Wind Inspector 의 'Pressure (hPa)' 토글 · 10 Compare 의 대표 변수] 독립 색면 메뉴는 GFS 등압선이 동작하는 날 같이 내린다(대체물 없이 먼저 없애지 않는다). 현… |
| 대기 | 상층 수증기 | **?** | B | 합친다 | P2 | M | [→ 04 Clouds › Satellite quick mode 의 채널 칩 '수증기 6.3µm'] 독립 메뉴 줄을 없앤다. 현상 id 와 레이어 id 'weather/cloud-wv' 는 그대로 둔다.<br>①… |
| 바다 | 바다 색면 3종 공통 — 육지 덮임 핫픽스 (수온·평년 대비 수온·파고) | **?** | — | 고친다 | P0 | S | 렌더러 재작성을 기다리지 않고 먼저 고친다. 선택지 셋(판정은 구현자): (가) CPU 마스크 — buildField 캔버스를 0.25°급(1440×720)으로 키워 기존 색 캔버스를 확대해 그린 뒤, 픽셀마다 h… |
| 바다 | 해수면 온도 | **?** | D | 다시 만든다 | P1 | M | [→ 05 Ocean · SST 탭 = 바다 기본 화면] 목표 화면은 PD 정본 그대로(10단 <0·0~4·4~8·8~12·12~16·16~20·20~24·24~28·28~32·≥32°C, 흰 등온선 + 지구 위… |
| 바다 | 평년 대비 수온 | **?** | D | 합친다 | P1 | M | [→ 05 Ocean · SSTA 탭(PD 'SST \| SSTA'), 독립 메뉴 줄 폐지] ① SST 렌더러에 구간표만 교체: ≤−3 · −3~−2 · −2~−1 · −1~−0.5 · [−0.5~+0.5 칠하지… |
| 바다 | 파고와 너울 | **?** | D | 다시 만든다 | P1 | XL | [→ 05 Ocean · Waves 칩] 목표 화면 유지(구간색 + 기준선 + 방향·높이 glyph + 파고·너울 별도 수치). 도달 경로를 둘로 쪼갠다. 【A 자료 확보 — 선행】 A-1 ECMWF 오픈데이터 파… |
| 바다 | 표층 해류 | **?** | C | 다시 만든다 | P1 | L | [→ 05 Ocean · Currents 입자 토글(PD: 기본 ON)] ① 막대 전부 삭제. P0 Wind 입자 렌더러를 그대로 공유(u/v 격자 이류·혜성 꼬리, 데스크톱 18,000/모바일 5,000). 색=… |
| 바다 | 바다 실측 | **?** | C | 고친다 | P1 | M | [→ 05 Ocean · 'Show Stations' 토글(07 Air Quality 관측소 토글 문법) + 10 Compare 의 Model\|Observation] ① 독립 메뉴 줄 → Ocean 패널 관측 토… |
| 바다 | 수심별 수온 | **?** | B | 합친다 | P2 | M | [→ 05 Ocean 관측 토글의 'Argo 플로트' 칩 — PD 정본에 자리 없음 · PD 결정 필요(안: 바다 실측과 한 토글 묶음)] ① 지구 위 문법 유지(부상점=실선 점, 사이=점선 추정). 마지막 부상점… |
| 바다 | 해수면 상승 전망 | **?** | C | 옮긴다 | P2 | M | [→ 12 Simulation · Variable='Sea level' — PD 결정 필요 2건: (a) 12 는 PRO 인데 '기본 그림은 무료 완성' 원칙과 부딪힘 → 05 Ocean 에 무료 1장(SSP5-8… |
| 바다 | 바다 깊이 | **?** | B | 고친다 | P2 | M | [→ 09 Terrain · Contours 의 바다 쪽 + Elevation 모드 수심 구간색] (제안서의 이 항목은 dataNeed 중간에서 잘려 도착했다 — 보이는 부분만 검증) ① 등심선 셰이더는 그대로 둔… |
| 바다 | 해구 | **?** | C | 합친다 | P3 | S | [→ 09 Terrain · 등심선의 지형 이름표로 MERGE] 렌더는 유지 — 선·라벨·pick 이 이미 PD 문법(선 + 지구 위 라벨 + 클릭)에 맞다. 독립 메뉴 줄을 없애고 Bathymetry 를 켜면 '… |
| 바다 | 심해 | **L Life** | B | 옮긴다 | P3 | S | [자리 없음 — PD 결정 필요] 둘로 가른다. ① '이 지점 수심' 읽기는 Bathymetry Inspector 로 흡수(ocean-depth 조회 재사용). ② 잠수 연출 + OBIS 생물 요약은 데이터 현상이… |
| 바다 | 선박 | **뺌** | C | 뺀다 | P2 | S | [REMOVE — PD 결정 필요] 유료 레일·Ocean 패널에서 줄을 뺀다. 그릴 자료가 없는 줄은 PD 금지 항목 '유료를 잠금 아이콘만으로 표현'과 같은 인상을 준다. 항로 질문은 지금처럼 검색창 구간 입력으… |
| 재해 | 태풍 | **?** | B | 고친다 | P1 | L | [→ 06 Hazards · Event-first] 목표 화면은 PD 06 그대로, 도달 방법만 고친다. ① Track: 3~4px 리본(과거=실선·예보=점선), 구간색 = 기관 발표 최대풍속 m/s 단계색(경계… |
| 재해 | 기상 특보 | **?** | C | 다시 만든다 | P1 | L | [→ 06 Hazards · severity band 우선] 점 → **구역 면**. ① 면 색 = 종류별 표시색. '기상청 공식색'이라 부르지 않는다 — 기상청 특보 지도 범례와 대조해 맞춘 뒤에만 '공식색' 표… |
| 재해 | 낙뢰 | **?** | C | 고친다 | P2 | M | [→ 06 Hazards, 03 Rain 화면에도 같은 토글] ① 나이 단계색 5단: 0~10분 흰색 · 10~20 노랑 · 20~30 주황 · 30~45 빨강 · 45~60 암적색. 첫 구간을 0~5분으로 잡지… |
| 재해 | 산불 | **?** | B | 고친다 | P2 | M | [→ 06 Hazards · hot spot 과 perimeter 구분] 이 M 은 **지금 자료로 되는 것만** 덮는다. ① Hot spot: 크기+색 모두 FRP 5단 — **30~100 · 100~300 ·… |
| 재해 | 지진 | **?** | C | 다시 만든다 | P1 | L | [→ 06 Hazards · 진앙·규모·깊이 동시] ① DOM 비컨 폐기 → WebGL 실황 지진 점(정점별 크기 셰이더). 크기=규모 4단(M4.5~5 · 5~6 · 6~7 · ≥7), 색=깊이 **단계색 7단*… |
| 재해 | 지각 이동 속도 | **09 지형** | C | 합친다 | P2 | S | [→ 자리 없음 · PD 결정 필요] 메뉴 행을 없애고 land.crustal_motion 하나로 **MERGE**. 카드 내용(한국·일본 중앙값 속도·방위, '판 전체가 함께 간다' 설명, 자료 한계)은 합쳐진… |
| 재해 | 지각 이동 | **09 지형** | C | 옮긴다 | P2 | M | [→ 자리 없음 · PD 결정 필요] 1안 09 Terrain 의 'Plates & Motion', 2안 06 Hazards > Earthquake 컨텍스트 토글, 3안 v1. 어느 안이든 hazards.crust… |
| 재해 | 쓰나미 | **?** | C | 고친다 | P1 | M | [→ 06 Hazards · Event-first] ① 공식 발표가 먼저: 발표 기관·분류(Warning/Advisory/Information)·발표시각·유효기간을 Inspector 맨 위에(OFFICIAL_WAR… |
| 재해 | 연안 침수 범위 | **05 해양** | B | 옮긴다 | P2 | S | [→ 자리 PD 결정 필요] Event-first 인 06 Hazards 에 사건이 아닌 시나리오 지도가 있는 것이 어색하다 — 1안 05 Ocean 의 'Sea level & Inundation' 보조 모드, 2… |
| 재해 | 빙하호 홍수 | **뺌(보류)** | D | 뺀다 | P3 | S | [→ REMOVE · PD 결정 필요] 자료가 운영에 들어오기 전에는 좌측 레일·메뉴에 자리를 만들지 않는다('자료 없는 칸은 안 만듦' 규칙). 레지스트리 항목은 지우지 않고 planned 로 둔다. 복귀 조건:… |
| 눈·얼음 + 대기질·관측 | 눈 덮임 | **03 강수** | C | 합친다 | P2 | L | [→ 자리 없음 · PD 결정 필요] 목표 화면은 원안 유지 = MERGE: 03 Rain 칩 줄 끝 '쌓인 눈(관측)'. 도달 경로를 3단계로 고친다.<br>[0단계 · 선행 · 자료 확보] IMS 수집기 복구(… |
| 눈·얼음 + 대기질·관측 | 해빙 | **?** | C | 옮긴다 | P1 | L | [→ 05 Ocean · 다섯째 칩 'Ice' · PD 결정 필요] 목표 화면은 원안 유지: 얼음으로 읽히는 5단 구간색(15~30 #1F4E79 · 30~50 #2F7FB5 · 50~70 #6CB8E0 · 70~… |
| 눈·얼음 + 대기질·관측 | 대기질 | **?** | C | 다시 만든다 | P1 | XL | [→ 07 Air Quality] 목표 화면은 정본·원안 유지: 물질 칩 1탭 전환 · PM2.5 6단 threshold band(0~15 #2FBF71 · 15~25 #F2E14B · 25~50 #F7B733 ·… |
| 눈·얼음 + 대기질·관측 | 자외선 | **?** | C | 합친다 | P2 | M | [→ 07 Air Quality · 'UV' 칩 · PD 결정 필요] 독립 메뉴를 없애고 MERGE — 원안 유지. WHO/기상청 공통 5단 구간색(0~2 #289500 · 3~5 #F7E400 · 6~7 #F85… |
| 눈·얼음 + 대기질·관측 | 지상 관측 | **01·02·03·07** | C | 합친다 | P1 | L | [→ 자리 없음 · PD 결정 필요] 목표는 원안 유지 = MERGE: 독립 메뉴를 없애고 01 Temperature · 02 Wind · 03 Rain · 07 Air Quality 의 Inspector 에 공통… |
| 눈·얼음 + 대기질·관측 | 기후 시계열 | **?** | B | 옮긴다 | P1 | M | [→ 11 Intelligence · Climatology 탭] 제안 = MOVE. **PD 결정 필요**: 정본의 좌측 레일 9개에 이 현상의 자리가 없다. 좌측 메뉴 항목을 없애고 Inspector 의 Now… |
| 눈·얼음 + 대기질·관측 | 지표온도 | **?** | D | 합친다 | P1 | L | 제안 = MERGE [→ 01 Temperature · 'Land surface(위성 관측)' 칩]. 정본에 없는 칩이라 **PD 확인 필요**. MERGE 는 메뉴 자리만 바꾼다. 레이어 id 'land/lst'… |
| 눈·얼음 + 대기질·관측 | 지형 | **?** | B | 고친다 | P1 | M | [→ 09 Terrain] + 렌더 조작은 View > Appearance 로 옮긴다. 우선순위를 둘로 나눈다.<br>■ P0 조각 (S) — PD 정본 P0 의 'Data/View 분리' 산출물. Global S… |
| 생태·사람·여행 | 숲 | **L Life** | B | 옮긴다 | P2 | M | [자리 없음 · PD 결정 필요] PD 정본 09 Terrain AFTER 는 데이터 모드를 Elevation/Contours/Hillshade/Satellite 넷으로 '단순화'한다고 적는다 — 다섯 번째 칩 추… |
| 생태·사람·여행 | 철새 | **L Life** | B | 합친다 | P3 | M | [자리 없음 · PD 결정 필요] 철새·조류 조사·바닷새를 'Life' 보조 서랍의 '새' 메뉴 하나(칩 [철새 이동 \| 육상 조사 \| 바닷새])로 MERGE. 대안: v1 이관 또는 삭제. 화면: 꺾은선 17… |
| 생태·사람·여행 | 조류 조사 기록 | **L Life** | C | 합친다 | P3 | S | [자리 없음 · PD 결정 필요] 'Life > 새' 의 '육상 조사' 칩으로 MERGE. 권리 확인 전에는 FREE 고정. 화면: 단색 점 구름 → 0.05° 칸을 한 BufferGeometry 에 합친 칸 면… |
| 생태·사람·여행 | 바다거북 | **L Life** | B | 옮긴다 | P3 | S | [자리 없음 · PD·법무 결정 필요] 새 투자 없이 동결하고 결정만 받는다. v1(무료)로 옮겨도 위험은 그대로다 — v1 은 유료 v2 로 이끄는 입구라 '상업적 이용' 해당 여부가 똑같이 걸린다. 선택지: ①… |
| 생태·사람·여행 | 바닷새 | **L Life** | C | 합친다 | P3 | S | [자리 없음 · PD 결정 필요] 'Life > 새' 의 '바닷새' 칩으로 MERGE(지구 위 정보량이 정점 37개라 단독 메뉴 가치 없음). 화면: 단색 점 → 정점마다 숫자 든 원판 마커(크기 고정, 값은 색+… |
| 생태·사람·여행 | 인구 | **L Life** | B | 다시 만든다 | P2 | L | [자리 없음 · PD 결정 필요] 1안 Terrain 의 다섯 번째 칩 'Population'(정본의 '단순화' 문장과 어긋나므로 PD 승인 필요), 2안 'Life/People' 보조 서랍. 어느 쪽이든 그림은… |
| 생태·사람·여행 | 실시간 혼잡 | **L Life** | B | 합친다 | P2 | M | [자리 없음 · PD 결정 필요] 인구가 Terrain/People 어디로 가든 그 서울 확대 단계의 'Live' 칩으로 MERGE(대안: Travel 공간의 '지금 붐빔'). 이 묶음에서 유일하게 시간이 살아 있… |
| 생태·사람·여행 | 밤의 불빛 | **?** | C | 옮긴다 | P2 | M | [→ 09 Terrain > Satellite imagery source picker] 값 없는 바탕 교체이므로 규칙 3(Data/View 분리)상 View 성격 — 자료 메뉴 줄에서 빼고 picker(라디오: N… |
| 생태·사람·여행 | 지역 뉴스 | **상단 · 재해 Inspector** | C | 옮긴다 | P2 | M | [자리 없음 · PD 결정 필요] 좌측 레일 밖으로 MOVE — TOP 바 진입 또는 이벤트룸 + 06 Hazards Inspector 의 '관련 보도'. 0단계(S, 오류 고치기 — 바로 가능): 분홍 막대 5개… |
| 생태·사람·여행 | 오늘 갈 곳 | **T Travel** | C | 옮긴다 | P3 | M | [원 개선안 After 미수신(입력 절단) — 코드 근거로 최소안 작성] [자리 없음 · PD 결정 필요] 여행 6현상은 'Travel(한국)' 보조 작업공간 하나로 묶고 칩 [오늘 갈 곳 \| 목적별 장소 \|… |
| 생태·사람·여행 | 목적별 관광지 | **T Travel** | C | 합친다 | P3 | M | [원 개선안 미수신 — 최소안] [자리 없음 · PD 결정 필요] 'Travel(한국)' 작업공간의 '목적별 장소' 칩 하나로 MERGE(무장애 \| 웰니스 \| English 하위 칩). 멀리서는 시군구별 건수… |
| 생태·사람·여행 | 연관 관광지 | **T Travel** | D | 합친다 | P3 | S | [원 개선안 미수신 — 최소안] 독립 메뉴를 없애고 '목적별 장소' Inspector 의 '이곳 다음에 간 곳 Top 5' 목록으로 MERGE(S). 지구 위 호는 장소명을 KTO 카탈로그의 공식 좌표와 이름으로… |
| 생태·사람·여행 | 지역 방문자 | **T Travel** | C | 합친다 | P3 | S | [원 개선안 미수신 — 최소안] 'Travel(한국)' 의 '방문자' 칩으로 MERGE. 숫자 원판 5단 단계색(하루 평균 방문자, 분위 경계를 범례에 수치로) + 상위 10곳 숫자 라벨. 자료 없는 30곳은 빈… |
| 생태·사람·여행 | 여행지 | **뺌** | D | 뺀다 | P3 | S | [원 개선안 미수신 — 최소안] 메뉴에서 REMOVE(PD 결정 필요). '자료 없는 칸은 만들지 않는다'는 기존 메뉴 규칙과 맞추고, 한국은 '목적별 장소'가 같은 질문에 공식 자료로 답한다. 전세계 OSM 장소… |
| 생태·사람·여행 | 항공편 | **→ v1** | D | 옮긴다 | P3 | S | [원 개선안 미수신 — 최소안] [자리 없음 · PD 결정 필요] '비행기가 실제 어디에 있나'는 FACT 질문이고 v1 에 이미 구현이 있다 → v2 메뉴에서는 빼고 v1 로 MOVE(권고). v2 에 남긴다면:… |
| 생태·사람·여행 | 해변과 낚시터 | **?** | C | 합친다 | P2 | S | [→ 05 Ocean · Waves 탭, PD 결정 필요] 이 현상은 '생태·사람·여행' 묶음(phenomenon-registry.js:1108)이라 PD 정본 레일에 자리가 없다 — (a) Ocean 토글로 흡수… |
| 생태·사람·여행 | 서핑 | **?** | B | 합친다 | P2 | L | [→ 05 Ocean · Waves 탭 토글 'Surf spots', PD 결정 필요(레일에 자리 없음)] 부모 그림(파고 단계색+방향 glyph)은 05 담당. 핵심 정정 = **자료를 따로 받지 않는다**: 마… |
| 생태·사람·여행 | 낚시 | **?** | B | 합친다 | P2 | L | [→ 05 Ocean · Waves 탭 토글 'Fishing spots', PD 결정 필요(레일에 자리 없음)] 서핑과 같은 'Show spots' 부품의 다른 칩. 파랑 숫자는 서핑과 같이 05 Ocean 파랑… |
| 생태·사람·여행 | 패러글라이딩 | **?** | C | 합친다 | P3 | S | [→ 02 Wind 토글 'Flying sites', PD 결정 필요(레일에 자리 없음)] 부모 그림(입자+풍속 구간색)은 02 Wind(P0) 담당. 1차 값을 **모델에서 실측으로 뒤집는다**: kma-aws-… |
| 생태·사람·여행 | 산 정상 날씨 | **?** | B | 합친다 | P1 | M | [→ 01 Temperature 토글 'Summits', PD 결정 필요(레일에 자리 없음)] 부모 그림(5°C 10단+흰 등온선+숫자 라벨)은 01 담당. 정직성 정정 ①: mountain.js 가 내는 두 번째… |
| 우주 | 오로라 예보 (지금 보이는 곳) → Space › Aurora (08… | **?** | B | 다시 만든다 | P1 | M | [→ 08 Space · Aurora 모드. P1 핵심(M)과 P2 후속(M)으로 나눈다]<br>── P1 핵심 ──<br>1) 점 구름을 구간색 면(띠)으로: OVATION 360×181 값 텍스처(R=확률)를… |
| 우주 | 위성 추적 + 스타링크 → Space › Satellites (군 칩:… | **?** | B | 고친다 | P2 | L | [→ 08 Space · Satellites 모드]<br>1) 실척 고도 점 구름은 유지한다(LEO 띠와 GPS 껍질이 한눈에 갈리는 지금의 장점). 그 위에 아이콘 층: 정거장·한국 위성·선택한 위성만 아이콘 +… |
| 우주 | 궤도 인텔리전스 (우주쓰레기·근접사건) → [확정 범위: 0단계 거짓… | **08 우주** | D | 합친다 | P0 | S | [확정 범위 = 0단계 핫픽스(S·P0)뿐이다. 최종 자리는 Space › Satellites 로 MERGE — PD 하위 모드에 이름이 없으므로 PD 결정 필요]<br>0단계(즉시, 재설계와 무관):<br>- p… |
| 우주 | 오늘의 태양 (실황 관측) → Space › Solar activity… | **?** | C | 고친다 | P2 | M | [→ 08 Space · Solar activity 모드. 기존 카드의 결측 규율과 자료 배관은 유지, Inspector 만 새로 짠다]<br>1) 지구 위: 값을 만들지 않는 범위에서만 — 태양 직하점 마커와 낮… |
| 우주 | 발사 일정 (세계 로켓) → Space › Satellites 안의 '… | **?** | C | 합친다 | P2 | M | [→ 08 Space · Satellites 모드의 'Events' 목록(발사 · 근접사건)으로 MERGE — PD 하위 모드 3개에 이름이 없음 · PD 결정 필요(대안: v1 무료로 보냄)]<br>0) 선행(S… |
| 우주 | 오늘의 태양계 → PD 레일에 자리 없음 · v1(무료)로 보냄 제안… | **→ v1** | B | 옮긴다 | P3 | S | [PD 좌측 레일·Space 하위 모드에 자리 없음 · PD 결정 필요] 지구를 대체하는 전체 화면 장면은 PD 셸(CENTER = 3D Earth + data field)에 맞지 않고, 전용 슬라이더는 규칙 2(… |
| 우주 | 우주 사진관 59점 → PD 레일에 자리 없음 · v1(무료)로 보냄… | **→ v1** | B | 옮긴다 | P3 | S | [PD 레일·Space 하위 모드에 자리 없음 · PD 결정 필요] 제안: v1(무료)로 보낸다 — v1 cosmic3d 에 사진 아틀라스 진입점이 이미 있다(prototype/js/main.js:298-300 o… |
| 우주 | 우리은하 — 우리는 어디 있나 → PD 레일에 자리 없음 · v1(무료… | **→ v1** | B | 옮긴다 | P3 | S | [PD 레일·Space 하위 모드에 자리 없음 · PD 결정 필요] 제안: v1(무료·교육)로 보낸다(같은 계열 원본 cosmic3d, prototype/js/main.js:92). 대안: 'More' 보조 서랍… |

### 4-1. 대기

> 【입력 절단 고지】 개선안 JSON 이 weather.fog 의 reuse 필드 중간("prototype/v2-thre")에서 잘려 도착했다. '대기' 묶음은 9개 현상인데(phenomenon-registry.js:1062-1066) 6개만 받았다 — weather.upper_moisture · weather.wind · weather.pressure 의 개선안은 받지 못해 검증하지 않았고, 지어내지도 않았다. 특히 weather.wind 는 PD P0(02 Wind)이므로 그 항목의 Red Team 은 다시 돌려야 한다. fog 의 reuse 는 코드에서 다시 확인해 채웠다.<br>> 【구조 공격 1 — Lambda 하나를 네 항목이 따로 고친다】 01 기온(TMP 2m), 03 강수(APCP·인코딩 상한), 04 구름(층별 l{step}.png)이 모두 aws/gfs-cloud-forecast/handler.py 를 고친다. 받지 못한 02 Wind(10m UGRD/VGRD — 지금은 700hPa 4° 이류용뿐, handler.py:58, 293-320)와 기압(PRMSL)도 같은 파일일 가능성이 높다. 항목마다 따로 열면 배포·실측을 네 번 한다. **'GFS 확장'을 묶음 공통 선행 작업(M) 하나로 분리**하기를 권한다: 변수 목록을 한 번에 정하고(TMP 2m · UGRD/VGRD 10m · PRMSL · APCP · 층별 출력), gl.describe 로 선별 해독하고, 새 필드는 '없으면 그 프레임만 생략'으로 분리해(fields_from_grib :169-174 는 하나라도 없으면 스텝 전체를 버린다) 구름이 같이 죽지 않게 한다. 기준 실측: 2026-09-19 12Z 런, 41스텝 270.4초 / 한도 900초 / 2048MB / rate(3 hours). 0.25° 는 불가(해독 약 2,800초). NOMADS 레벨 문자열은 저장소에 검증된 예가 없어 인벤토리 확인이 먼저다.<br>> 【구조 공격 2 — 시안의 모델 이름 대 저장소 수집기】<br>> - GFS: 있음(gfs-cloud-forecast 0.5° 구름·강수·700hPa 바람 / tpw-grid 0.25°→1° 동아시아 TPW, eccodes). 기온·10m 바람·기압·누적강수는 아직 없음.<br>> - ECMWF: **격자 없음.** aws/ecmwf-ingest 는 ASOS 97지점의 2t 점값(24~120h 5스텝), 정기 실행 미등록('수동 실행분 한 회차뿐', README:35-38), AEC 압축(5.42)이라 grib2lite 로 못 풀고 eccodes 필요. 재사용 가능한 것은 .index Range 수신과 deploy-ecmwf.sh 패키징. 0.25° 격자 수집기는 별도 L 작업이고 10 Compare(P1)의 선행 조건이다 — 세 항목의 PRO 훅에서 'Compare'를 '확보 후'로 내렸다.<br>> - CAMS: aws/air-grid 는 air-quality-api.open-meteo.com 경유다(handler.py:52) — CAMS 직접 수집기가 아니다(07 Air Quality 묶음에서 다룰 것).<br>> - 동아시아 1° 기압·바람 보강판(wind/pressure-ea.json · wind-ea.json)도 Open-Meteo 다(aws/pressure-grid/handler.py) — 유료 핵심 그림의 토대로 쓰면 안 된다.<br>> 【구조 공격 3 — 프레임 로더】 GFS 프레임 로더가 CloudManager 안에 있고 구름 GFS 모드에서만 돈다(main.js:1814-1844, 4442-4443). 기온·강수·바람이 구름 모드와 무관하게 뜨려면 공용 프레임 저장소 분리가 01·03 공통 선행이다. 점값 읽기는 이미 있다(sampleAt main.js:1979-2016) — Inspector 클릭값·내 위치 시계열을 네트워크 호출 0건으로 만들 수 있다.<br>> 【Open-Meteo 직접 호출은 5곳】 main.js:1706(구름 폴백) · 2898 · 2900(바다 클릭) · 2932(날씨 클릭) · 3403(서핑). 원안은 2925-2945 한 곳만 적었다. 이 묶음 담당은 2932(→01)와 1706(→04).<br>> 【P0 정리】 이 묶음의 P0 는 01 기온(기준 구현체, XL)과 03 강수의 코어(1탭 즉시 색면·8칸·범례·타임라인·껍질 높이)뿐이다. 둘 다 PD P0 'Global Shell'(범례·Inspector·Timeline 슬롯)에 의존한다 — 셸이 늦으면 임시 범례로만 나간다. 나머지는 P1(평년 대비·구름) · P2(극값, PD 결정 필요) · P3(안개).<br>> 【'지금'의 정직】 실측으로 12Z 런이 22:10Z 에 게시됐다. v2 의 모든 GFS '지금' 프레임은 +6~12h 예보다. windy 가 'ref 12Z, 2시간 44분 전'을 밝히듯 기온·강수·구름 예보 배지에 run 과 +h 를 상시 적는 것을 묶음 공통 규칙으로 둔다.<br>> 【재검증분 — 대기(바람·기압·상층 수증기)】 시안의 모델 이름을 aws/ 에서 대조한 결과(이 묶음 범위):<br>> - GFS: 수집기 있음. aws/gfs-cloud-forecast(NOMADS filter_gfs_0p50, 전지구 0.5° 41스텝, grib2lite 순수 파이썬 — 지금 담는 바람은 700hPa 4° 평균 한 장뿐, 10m·PRMSL·PWAT·TMP 2m 분기는 없음) · aws/tpw-grid(0.25° f000 → 1° 동아시아 PWAT, eccodes) · aws/gfs-cloud-volume(동아시아 구름 21층, 바람 없음, 스케줄 미확인). <br>> - ECMWF: aws/ecmwf-ingest 는 ASOS 97지점 2m 기온 점값(PARAMS=['2t']), 미스케줄, AEC 압축이라 eccodes 필요. 격자 수집기는 없다 → GFS\|ECMWF Compare 는 별도 L 선행. 그 전까지 PRO Compare 의 짝은 'GFS 최신 런 \| 이전 런'(새 라이선스 0)으로 채울 수 있다 — 이전 런 폴더 보존 여부와 manifest-prev 가 필요(보존 기간 UNKNOWN).<br>> - CAMS · JTWC · CMIP6: 이 묶음 소관 아님.<br>> 묶음 공통 선행 'GFS 확장'(M)에 이 묶음이 요구하는 것: UGRD/VGRD 10m · PRMSL · (싸게 얹는) PWAT. 반드시 같이 고칠 코드 함정 셋 — (1) url_for 가 var×lev 교차곱이라 레벨을 켤수록 안 쓰는 메시지가 딸려 온다, (2) fields_from_grib :160-163 이 levelValue 를 안 봐서 등압면을 더 켜면 구름 이류용 700hPa 바람이 조용히 덮인다, (3) :147-148 이 모든 메시지를 decode 한 뒤 버린다(describe 선별 해독이 기준 시간도 줄인다). 새 필드는 missing 목록(:169-174)에 넣지 않는다. 디코드는 GIL 에 묶여 스레드가 CPU 를 못 나누므로 필드 수가 곧 실행시간이다 — 완료 조건을 'elapsedS < 600 · missingSteps = []'로 두고, DEADLINE(840초) 초과 시 +120h 쪽(유료 구간)이 먼저 빈다는 점을 기억한다. 같은 런을 3시간마다 다시 만드는 중복은 매니페스트 run 비교로 건너뛸 수 있다. 상층 3고도(850/500/250)는 공통 M 에 넣지 않고 별도 M 후속으로 둔다. H/L 중심 탐색도 Lambda 몫이라 공통 M 의 시간 예산에 포함한다.<br>> 순서 권고: 공통 GFS 확장(M) + 공용 프레임 저장소 → 01 Temperature 기준 구현체(구간화 셰이더·등치선 셰이더·라벨 배치기·범례) → 02 Wind 입자 엔진(L, P0) → 기압 등압선 토글(M, P1 의 첫 번째 — 자료는 이미 와 있다) → 상층 고도(M) → 수증기 칩/TPW(M, P2) → 0.25° 창 · ECMWF 격자.<br>> Open-Meteo 출구: 이 묶음의 v2 화면은 wind/global.json · wind-ea.json · pressure-ea.json 을 하나도 쓰지 않게 된다. 과도기 화면은 만들지 않는다(버릴 코드 + 라이선스 노출). v1 과 해당 Lambda 의 정리는 R0 감사의 소관이다.<br>> NOMADS 가 v2 유료 핵심 그림 전체(기온·바람·비·기압·예보구름)의 단일 장애점이 된다. 폴백 후보(NOAA AWS Open Data 의 .idx Range 수신)는 저장소 안에 근거가 없어 UNKNOWN 이다 — 선행 확인 항목으로 남긴다. 런이 늙으면 범례에 '지연'을 표기하는 것을 공통 renderer contract 에 넣는다.<br>> v1 교훈의 재해석: '색면에 stepped 금지'는 5° 격자 + nearest 강제 때문이었다. PD 규칙 4(구간색 의무)와는 '0.5° 값을 보간한 뒤 셰이더에서 구간화'로 양립한다. '풍속 등치선 금지'는 그대로 유지한다.

#### 기온 · `weather.temperature` — 다시 만든다 · P0 · XL

| | |
|---|---|
| **Before** | 5° 격자(72×36 텍셀)를 rampFrom 선형 색 보간과 LinearFilter로 두 번 번지게 한 색면 한 장이다(live-layers.js:582 buildField, 자료는 /wind/global.json = Open-Meteo 5°, live-layers.js:511-514 · ui-shell.js:65). 등온선·단계색·범례·시간축·지점값이 없다. 카드 문구는 모델값인데 '관측 범위'라고 적는다(live-layers.js:1191). 지구 클릭 값은 브라우저가 api.open-meteo.com 을 직접 부른다(main.js:2932). |
| 돈 내는 사람 눈 | 지구 전체에 파스텔 얼룩이 번진 한 장이다. 한반도가 한 칸(555km)이라 서울·부산, 해안·내륙 차이가 없고, 0°C 선이 어디인지·어디가 35°C 를 넘는지 눈으로 집을 수 없다. 색이 몇 도인지 알려 주는 범례도 없어 windy·mapped.earth 의 같은 메뉴 옆에 놓으면 미완성으로 보인다. (D 망가져 보인다) |
| 기준 사이트 | mapped.earth: AIR › Temp 색면 + 범례 막대(-40~45°C) + 'GFS 18Z · 5 h ago' 상시, 색면 위 바람 입자는 별도 토글. windy: 기온 색면 + 등치선 토글 + 도시 숫자 + 타임라인 + 'ref 12Z, 2시간 44분 전'. 두 곳 모두 '지금'이 실제로는 몇 시간 전 런의 예보임을 런 시각으로 밝힌다 — EARTHUS 도 같은 표기를 해야 한다(실측: 우리 GFS 프레임은 12Z 런이 22:10Z 에 게시됐다). |
| **After** | [→ 01 Temperature · 기준 구현체] PD 목표 화면(5°C 11칸 단색 · 흰 등온선+지구 위 숫자 라벨 · 범례 · Inspector 칩 · Actual/Anomaly)은 그대로 둔다. 도달 경로만 고친다.<br>단계 0 — 자료(묶음 공통 'GFS 확장' 1회로 처리, 아래 groupNotes)<br>- gfs-cloud-forecast 에 2m 기온을 추가해 t{step}.png(720×361, 회색 1채널 8bit, 선형 0.5°C 눈금 -80~+47.5°C)를 낸다. 16bit PNG 는 쓰지 않는다 — 브라우저가 캔버스/텍스처로 올릴 때 8bit 로 내려 읽는다.<br>- 850hPa 는 1단계에서 뺀다(PRO 2단계). 필드가 늘수록 순수 파이썬 해독 시간이 는다.<br>- NOMADS 레벨 문자열(2 m above ground · 850 mb)은 이 저장소에서 검증된 적이 없다 — 인벤토리 문자열 확인 후 확정. 잘못 주면 0바이트/500 이다(CWAT 때 겪은 함정).<br>단계 1 — 렌더러(FieldRenderer 계약: 값 텍스처 2장 + blend → 값 보간 → 셰이더 구간 판정)<br>- 색이 아니라 값을 보간한 뒤 floor 로 11칸 단색을 고른다. 8bit 선형 1채널이라 LinearFilter 보간이 곧 값 보간이고 mediump 로 충분하다.<br>- 등온선은 CPU 마칭스퀘어가 아니라 **셰이더 선**(값/간격의 경계를 fwidth 로 그림)으로 긋는다. 이유: ① 3시간 프레임 사이 blend 중에도 색 경계와 선이 항상 일치한다 ② 41프레임 재생 중 CPU 재계산이 0이다(v1 isobars.js:16-17 발열 규칙) ③ 720×361 격자 × 11레벨 마칭스퀘어를 키프레임마다 돌리면 모바일에서 끊긴다. 0°C 선은 굵게, 간격 칩 2°C/5°C 는 uniform 하나.<br>- contour-math.js 는 **라벨 자리 찾기 전용**으로만 쓴다: 2° 로 솎은 격자(180×91)에서 키프레임이 바뀔 때만 실행, 앞 반구 라벨 데스크톱 ≤24 · 모바일 ≤12.<br>- GFS 프레임 로더를 CloudManager 에서 떼어 공용 프레임 저장소로 만든다. 지금은 setCloud('gfs') 안에서만 프레임이 로드된다(main.js:1814-1844, 4442-4443) — 구름이 위성 모드여도 기온 프레임이 떠야 한다.<br>단계 2 — 숫자와 클릭<br>- 모델 격자값을 도시값처럼 찍지 않는다. 지구 위 숫자는 실측 관측소(GTS SYNOP + KMA, /wind/gts-global.json · /wind/kma-aws.json)만 'OBS' 점과 함께 찍는다.<br>- **타임라인이 '지금'이 아니면 관측 숫자를 숨긴다** — 예보 시각의 색면 위에 현재 관측 숫자를 얹으면 관측과 예보가 섞인다.<br>- 클릭 값은 네트워크 호출 0건: 값 텍스처의 CPU 사본에서 읽는다(CloudManager.sampleAt 방식, main.js:1979-2016). main.js:2932 의 Open-Meteo 직접 호출을 이것으로 대체한다.<br>- 모델값 표기는 0.5°C 눈금 + '0.5° 격자(약 55km) 평균'. **0.1°C 정확값은 모델에는 없다**(8bit 눈금 + 격자 평균) — 0.1°C 는 최근접 실측 지점값(이름·거리·관측시각)에만 쓴다.<br>단계 3 — 셸 의존<br>- 범례·Inspector·Global Timeline 은 PD P0 'Global Shell'(이 묶음 밖)의 슬롯에 꽂는다. 이 항목은 '범례 데이터(11칸·단위·run/valid)'와 'Inspector 칩 정의'를 공급한다. 전용 슬라이더는 만들지 않는다(기존 단일 시계 main.js:4897-4898, 5454-5474).<br>- 범례 문구: 'MODEL · NOAA GFS 0.5° · run ○○Z · +○h 예보 · valid ○○ KST'. '현재 기온'이라 부르지 않고 '지금 시각의 모델 기온'이라 한다.<br>- °C/°F 는 범례 전환만. 불투명도·음영은 View>Appearance.<br>- '<-10' 한 칸에 극지 -60~-10°C 가 다 들어가는 문제는 범례 변경이므로 **PD 결정 필요**(View 옵션 '극지 확장 칸').<br>이 항목에서 뺀 것<br>- 바람 입자 오버레이: 02 Wind 완료 뒤 독립 토글로 붙인다(이 항목 DoD 아님).<br>- Anomaly 탭 내용: weather.temperature_anomaly 항목.<br>- GFS\|ECMWF Compare: 격자 수집기가 없어 blocker 로 내렸다.<br>같이 고칠 것<br>- metaGrid '관측 범위' → '모델 범위'(live-layers.js:1191).<br>- Open-Meteo 직접 호출은 한 곳이 아니라 5곳이다(main.js:1706, 2898, 2900, 2932, 3403). 이 항목 담당은 2932 와 tempgrid 자료원. 1706 은 04 Clouds, 2898·2900·3403 은 바다 묶음.<br>- CONTINUOUS_LAYERS §2 레벨표 갱신은 PD 승인 뒤.<br>⚠️ 렌더러만 먼저 바꾸면 5° 격자에서 555km 블록/가짜 곡선이 된다. 렌더러와 GFS 자료는 반드시 같이 나간다. |
| 표현 | 단계색+등치선 |
| 자료 | 지금 자료(wind/global.json, Open-Meteo 5°, aws/wind-grid)로는 불가 — 해상도 부족 + 비상업 조항 위험.<br>- 해법: aws/gfs-cloud-forecast/handler.py 의 NOMADS 요청(:93-111)에 TMP + 2m 레벨 추가. 0.5° 720×361(:62-66), 41스텝, grib2lite(5.0/5.2/5.3) 그대로. NOAA GFS = public domain.<br>- 실측(2026-09-19 12Z 런 manifest.json): 41스텝 elapsedS 270.4초, 누락 0, 한도 900초(DEADLINE_S 840, :70), 2048MB. 스케줄은 rate(3 hours) — EventBridge 규칙 earthus-gfs-cloud-forecast(tools/deploy-gfs-forecast.sh:67, schedules.sh 에는 없음).<br>- var×lev 교차로 불필요한 메시지(TMP surface·700mb 등)가 같이 온다. 지금은 모든 메시지를 decode 한다(:147-148) — gl.describe 로 먼저 걸러 필요한 것만 해독해야 시간 증가를 막는다.<br>- fields_from_grib 는 필드 하나라도 없으면 스텝 전체를 버린다(:169-174) — 새 필드는 '없으면 그 프레임만 생략' 으로 분리해야 구름이 같이 죽지 않는다.<br>- t{step}.png 크기는 UNKNOWN(실측 필요). 참고 실측: 구름 234KB · 강수 107KB · 바람 8KB/스텝.<br>- 0.25° 는 불가(핸들러 주석 :59-61: 스텝당 10.8MB, 해독 약 2,800초).<br>- 관측 숫자: 기존 /wind/gts-global.json(ta·tmax·tmin 포함, aws/gts-global/handler.py:280-281) · /wind/kma-aws.json 재사용. KMA 허브 호출 증가 0.<br>- ECMWF: aws/ecmwf-ingest 는 **격자가 아니다** — ASOS 97지점의 2t 점값, 24~120h 5스텝, 정기 실행 미등록(README:35-38). ECMWF GRIB 은 AEC(5.42)라 grib2lite 로 못 풀고 eccodes 가 필요하다(handler.py:24-28). 재사용 가능한 것은 .index Range 수신(~650KB/변수·스텝)과 deploy-ecmwf.sh 의 eccodes 패키징뿐. |
| 재사용 | prototype/v2-three/js/precip-field.js(값 텍스처→프래그먼트 판정+두 프레임 blend 구조) · prototype/v2-three/js/main.js:1979-2016(sampleAt — 텍스처 CPU 사본에서 점값 읽기) · main.js:1814-1844(GFS 프레임 로더, 분리 대상) · main.js:4897-4898, 5454-5474(단일 시계) · prototype/v2-three/js/live-layers.js:1169-1172(airShell) · prototype/js/contour-math.js + gridmath.js(라벨 자리 전용) · prototype/js/continuous-contours.js(라벨 배치 규칙) · aws/gfs-cloud-forecast/handler.py · grib2lite.py(describe/decode) |
| 무료 / 유료 | 무료: 지금 시각 단계색+등온선+범례+관측 숫자 · 클릭 기본값(모델 0.5° 격자 평균, 1°C 반올림) · 출처·런 시각·MODEL 배지 · +24h 재생(제안).<br>EXPLORER: +120h 타임라인 · 최근접 실측 지점 대조(실측 0.1°C, 관측시각) · Anomaly 탭 전체 · 내 위치 5일 기온 곡선(텍스처 41장에서 읽음, 호출 0) · 짧은 인텔 리포트(기온 인텔 패킷 재사용, 배치는 수치→출처→문장, 문장은 계약 §C-2).<br>PRO: 850hPa(2단계) · export · GFS\|ECMWF Compare 는 **ECMWF 격자 수집기 확보 후**(별도 L 작업). |
| 걸리는 것 | · 자료 없음: GFS 2m 기온을 아직 받지 않는다. 해법 = 묶음 공통 'GFS 확장'을 선행 작업(M)으로 분리하고 기온·강수·바람·기압이 한 번에 변수를 추가한다. NOMADS 레벨 문자열은 인벤토리에서 확인 후 확정.<br>· Lambda 시간: 지금 270.4초/900초(실측). 필드 추가 시 describe 로 선별 해독하지 않으면 증가폭이 커진다. 배포 전 elapsedS 를 다시 실측한다.<br>· ECMWF Compare 는 자료가 없다: ecmwf-ingest 는 97지점 점값·미스케줄·eccodes 필요. 격자 수집기는 별도 L 작업이며 Compare workspace(P1) 쪽 선행 조건으로 옮긴다.<br>· 거짓 정밀: 8bit 0.5°C 눈금 + 0.5° 격자 평균에서 '0.1°C 정확값'은 만들 수 없다. 해법 = 0.1°C 는 실측 지점값에만, 모델값은 0.5°C 눈금과 '격자 평균' 표기.<br>· 관측/예보 혼합: 예보 시각 색면 위에 현재 관측 숫자가 남으면 섞인다. 해법 = 타임라인이 '지금'일 때만 관측 숫자 표시.<br>· 프레임 로더가 CloudManager 에 묶여 있다(main.js:1814). 공용 프레임 저장소로 분리해야 기온·강수·바람이 구름 모드와 무관하게 뜬다.<br>· 셸 의존: 범례·Inspector·Global Timeline 슬롯은 PD P0 Global Shell 작업이다. 셸이 늦으면 이 항목은 임시 범례 1개로만 나간다.<br>· 전송: 프레임은 S3 us-east-2 를 직접 읽는다(main.js:1815). 프레임 종류가 늘면 5일 스크럽 전송량이 는다 — 지연 프리페치 유지, CloudFront 경유 검토.<br>· 계약 문서 충돌: CONTINUOUS_LAYERS §2(-25,-10,0,10,20,30,40)와 PD 5°C 간격이 다르다. PD 승인 뒤 문서를 갱신한다. |
| **완료 기준** | · 기온 1탭 → 지구 색면이 5°C 단색 11칸으로 보이고 칸 안에 그라데이션이 없다. 칸 경계마다 흰 등온선이 있고 0°C 선이 더 굵다.<br>· 한반도~일본 범위로 확대하면 등온선 위에 '20°C' 같은 숫자 라벨이 앞 반구에서 읽히고, 좌하단 범례에 11칸과 'MODEL · NOAA GFS 0.5° · run ○○Z · +○h 예보 · valid ○○ KST'가 항상 보인다.<br>· 지구를 한 번 클릭하면 Inspector 에 모델값(0.5°C 눈금, '0.5° 격자 평균')과 최근접 실측 지점(이름·거리·관측시각) 두 줄이 뜨고, 네트워크 탭에 api.open-meteo.com 요청이 없다.<br>· 타임라인을 +24h 로 밀면 색면과 등온선이 함께 바뀌고 관측소 숫자는 사라지며, 모바일(375px)에서 5일 재생이 끊기지 않는다. |

#### 평년 대비 기온 · `weather.temperature_anomaly` — 합친다 · P1 · M

| | |
|---|---|
| **Before** | 한국 지점마다 9px 고정 색 점 하나(buildTempAnom live-layers.js:1438-1476). 한 시각의 기온(temp_c)에서 하루 평균 평년(rec[0])을 빼므로(:1451-1453) 일변화가 주 신호가 된다. ±6°C 하드코딩으로 색이 포화된다(:1466). 범례가 없다. 카드 문구는 이 결함을 스스로 고지하고 있다(:1486-1488). |
| 돈 내는 사람 눈 | 한국 위에 색 점 수백 개가 찍힌다. 실측이고 출처·한계 고지가 정직한 것은 좋다. 다만 점이 9px 고정이라 전국이 비슷한 주황(또는 하늘색) 점밭으로 보이고, '어디가 얼마나 이상한가'가 한눈에 들어오지 않는다. 전지구 메뉴 사이에서 혼자 한국 전용이라는 것도 켜 봐야 안다. (B 손보면 된다) |
| 기준 사이트 | mapped.earth: 기온 평년차 메뉴 없음(SSTA 만). windy: 실측한 메뉴 목록에 없음('48개 더' 안은 UNKNOWN). 관측소 실측 − 기상청 공식 평년(1991~2020) 조합은 기준 사이트에 없다 — EARTHUS 고유(한국). |
| **After** | [→ 01 Temperature 의 'Actual \| Anomaly' 탭] 독립 메뉴 줄을 없애고 PD 정본의 전환 자리에 넣는다. 1단계 범위는 한국 관측이고 탭 라벨에 'Anomaly · 한국 관측'이라 밝힌다. 탭을 누르면 카메라가 한국으로 간다.<br>① 표현: 9px 점 → 숫자 마커('+3.2'). 줌아웃 시 시·도 대표 20~30곳, 확대 시 전 지점. **상한은 83지점**이다 — 평년값 파일이 83곳뿐이고 대구(143)는 없다(aws/kma-aws/intel_temp.py:44). 없는 지점에는 마커를 만들지 않는다.<br>② 색: 발산형 단계 11칸(≤-8 · -8~-6 · -6~-4 · -4~-2 · -2~-0.5 · ±0.5 회색 · 0.5~2 · 2~4 · 4~6 · 6~8 · ≥8°C). ±6 하드코딩(live-layers.js:1466) 제거. 마커 크기 \|편차\| 3단.<br>③ 비교 기준 — 원안을 뒤집는다<br>- 원안의 '오늘 최고(지금까지) − 최고 평년 / 오전엔 최저'는 **오전 10시의 최고는 오늘 최고가 아니므로** 오전~이른 오후 내내 가짜 음의 편차를 만든다. 시각에 따라 기준이 바뀌는 것도 읽는 사람을 속인다.<br>- 저장소는 이미 같은-것끼리 규칙을 정해 놨다(intel_temp.py:8-14): **어제(한국 날짜) 하루 평균 − 그날 평년 평균기온**, 24회 또는 3시간 간격 8회가 다 있을 때만 싣고 아니면 싣지 않는다. 기본 마커는 이 값으로 한다(지금 7지점 → 83지점 확장).<br>- '오늘' 칩은 18시 KST 이후에만 활성: '오늘(잠정) · ○시까지 정시 관측 최고 − 최고 평년'. 정시 관측 최고는 기상청 공식 일 최고(분 자료 기반)보다 낮게 나오므로 '정시 관측 기준'을 같이 적는다.<br>- 기준 문구를 마커 위 한 줄로 상시 표기.<br>④ 등치선·보간면은 그리지 않는다 — 83개 점에서 면·선을 만들면 없는 값을 만드는 것이다. PD 규칙 4 중 구간색·숫자 라벨은 지키고 contour 는 '장(field)이 없어 생략'이라 명시.<br>⑤ 범례: 발산형 막대 상시 + 'DERIVED(관측−평년) · 기상청 ASOS 정시 관측 · 평년 1991~2020 · 어제 하루 평균 기준'.<br>⑥ Inspector(지점 클릭): 어제 평균·평년(평균/최고/최저)·편차·관측 기간, 366일 평년 곡선 위 점, 최근 30일 편차 막대(있는 날만 — 빠진 날은 빈칸).<br>⑦ 계산 위치: 서버. kma-aws Lambda 가 이미 어제 이력과 평년을 읽어 인텔 패킷을 만든다(handler.py:389, intel_temp.build). 같은 자리에서 83지점 편차를 /wind/kma-anom.json 으로 낸다 — 클라이언트가 하루치 시간별 이력 파일을 통째로 받지 않게.<br>⑧ 전지구 Anomaly 는 1단계에서 그리지 않는다. 평년 격자 수집기가 없다(2단계: 'GFS 분석장 − 재분석 평년 = DERIVED(모델−평년)'). |
| 표현 | 아이콘/마커 |
| 자료 | **지금 자료로 된다 — 원안의 선행 조건 두 개는 사실이 아니다.**<br>- 시간별 관측 이력은 이미 쌓이고 있다: kma-aws store_history()가 매시 지점값을 wind/series/stations/<날짜>.json 에 누적하고 760일 보관, 색인 wind/series/stations.json(collectingSince 포함)(aws/kma-aws/handler.py:62-64, 164-228). '서버가 하루치를 누적해야 한다 · archiver 적재부터'는 틀렸다. 30일 막대의 실제 가용 일수는 collectingSince 에 달렸다(값은 UNKNOWN — 색인 파일에서 읽으면 된다).<br>- 평년: wind/kma-normal.json — 평균·최고·최저·강수 366칸(aws/kma-normal/handler.py:54), **83지점**(intel_temp.py:44). 실황은 ASOS 97지점(kma_sfctm3)이다 — 'AWS'가 아니다.<br>- KMA 허브 호출 증가 0(기존 kma-aws 실행 안에서 계산).<br>- 공식 일 최고/최저(분 자료 기반)가 필요하면 기상청 일자료 API 가 있어야 하나 저장소에 수집기가 없다(grep 0건) — 선택 사항, 하루 1회 호출.<br>- 전지구 평년 격자: 수집기 없음. 후보 ERA5 1991~2020 월평년(Copernicus 라이선스 착수 전 재확인). |
| 재사용 | prototype/v2-three/js/live-layers.js:1438-1495(지점 매칭·월일 칸 찾기) · prototype/v2-three/js/ext/ext-scene.js:169-184(makeLabel 숫자 Sprite) · aws/kma-aws/intel_temp.py(daily_mean·normal_index — 같은-것끼리 규칙과 결측 규칙) · aws/kma-aws/handler.py:164-228(store_history) · aws/kma-normal/handler.py |
| 무료 / 유료 | 무료: Anomaly 탭 + 시·도 대표 지점 숫자 마커 + 범례.<br>EXPLORER(핵심 가치 '평년 대비'): 전 83지점 · 지점 클릭 시 평년 곡선 대비 · 최근 30일 편차 막대 · 짧은 인텔 리포트(어제 하루 평균 비교는 이미 인텔 패킷에 있다).<br>PRO: 전지구 모델−평년 Anomaly(2단계, 자료 확보 후) · export. |
| 걸리는 것 | · 정직성: 부분일 최고/최저를 평년 최고/최저와 비교하면 오전에 가짜 음의 편차가 나온다. 해법 = 기본은 '어제 완결된 하루 평균 − 평년 평균'(intel_temp 규칙), '오늘(잠정)'은 18시 KST 이후에만.<br>· 범위 상한 83지점(대구 없음). 해법 = 범례 옆에 '평년값 있는 83지점' 표기, 없는 지점은 마커를 만들지 않는다.<br>· 01 Temperature 의 Actual\|Anomaly 탭 셸에 의존한다 — 01 이 먼저 나가야 한다(그래서 P1).<br>· 전지구 Anomaly 는 평년 격자 수집기가 없어 1단계 범위 밖. 탭 라벨에 '한국 관측'을 밝혀 전지구로 오해하지 않게 한다.<br>· 이력 결측: 허브 용량 초과일에는 시간 관측이 빈다(KMA 허브 용량 함정). 24회/8회 규칙을 못 채운 날은 값을 싣지 않고 빈칸으로 둔다. |
| **완료 기준** | · 01 Temperature 에서 Anomaly 탭을 누르면 카메라가 한국으로 가고 지점마다 '+3.2' 같은 숫자 마커가 발산형 단계색으로 보인다. 마커 위에 '어제 하루 평균 − 평년(1991~2020)' 기준 문구가 보인다.<br>· 지점 마커를 누르면 Inspector 편차값이 마커 숫자와 같고, 366일 평년 곡선 위에 그날 점이 찍히며 관측 기간·출처가 보인다.<br>· 오전에는 '오늘(잠정)' 칩이 비활성이고 이유가 적혀 있다. 18시 KST 이후 켜면 '○시까지 정시 관측 기준' 표기가 붙는다.<br>· 평년값이 없는 지점(예: 대구)에는 마커가 없고 범례 옆에 '평년값 있는 83지점'이 적혀 있다. |

#### 오늘의 극값 · `weather.daily_extremes` — 옮긴다 · P2 · M

| | |
|---|---|
| **Before** | 지구 위 7px 점 9개 + 작은 글자 라벨, 옆에 DOM 카드 9장(ext/lab-today.js:69-121). 값은 5° 격자 칸의 최댓값이라 실제 극값보다 낮고, 9개 중 6개가 Open-Meteo 격자에서 나온다(prototype/js/today.js:66-127). 레지스트리는 이미 role 'tool' · status 'reclassify' 로 적어 뒀다(phenomenon-registry.js:856). |
| 돈 내는 사람 눈 | 카드 목록은 읽을 만하다 — 썸네일·값·장소가 있고 누르면 그 자리로 날아가는 것은 좋다. 그러나 지구 위에는 7px 점 9개와 작은 글자뿐이라 이름에 비해 화면이 조용하고, 값이 555km 격자 칸의 최댓값이라 '오늘 지구에서 가장 더운 곳'의 숫자가 실제 관측 극값보다 낮게 나온다. (C 빈약하다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. mapped.earth·windy 는 '오늘 지구에서 가장 ○○한 곳'을 뽑아 주지 않는다. windy 에서 가장 가까운 것은 태풍 타일의 '4 active' 배지(지금 볼 만한 것의 입구). |
| **After** | [→ 자리 없음 · **PD 결정 필요**] 현상이 아니라 도구다. 권고 = MOVE: 좌측 레일에서 빼고 11 Intelligence 'Now' 탭 맨 위 '오늘의 극값' 카드 묶음으로.<br>① 카드 본체(DOM)는 유지(썸네일·값·장소·좌표, 탭하면 비행).<br>② 값의 근거 — 원안에서 고친 것<br>- 최고/최저 기온은 '현재 기온 스냅샷의 최댓값'이 아니라 **관측소가 보고한 tmax/tmin** 을 쓴다. GTS 파일에 이미 들어 있다(aws/gts-global/handler.py:64, 280-281). 다만 SYNOP 의 최고/최저는 지역마다 기준 시간대가 다르다 → 카드에 '관측소 보고값 · 기준 시간은 지역마다 다름 · 관측시각 ○○'을 적는다.<br>- 이상값 검사는 이미 서버에 있다(sanity: 기온 -95~60°C 등, handler.py:109, 133). 새 검사를 만들지 않는다.<br>- 문구는 '지구에서 가장 더운 곳'이 아니라 **'보고된 관측소 중 최고'**. 중국·몽골·러시아 관측 공백 고지를 카드 묶음 아래 한 줄로.<br>- 최다 강수 카드는 1단계에서 **한국만**(kma-aws-min 의 rnday — 일 누적으로 기간이 같다). GTS 의 rn 은 지점마다 누적 기간이 섞여 있어(기간 UNKNOWN) 서로 비교하면 거짓 순위가 된다.<br>- 최대 풍속은 GTS ws + KMA(순간 관측값, '관측시각' 표기).<br>- 모델 픽(먼지·UV·시정·파고·SST)은 Open-Meteo 파생이다(air-grid 도 air-quality-api.open-meteo.com, aws/air-grid/handler.py:52). 유료 화면에서는 비-Open-Meteo 자료로 바뀔 때까지 **카드에서 뺀다**. 시정은 관측이 아니므로(today.js:41) 뺀다.<br>③ 카드를 탭하면 해당 현상 메뉴(01/02/03)를 켠 채 그 자리로 비행(today.js p.layer :118-119). 극값이 단계색 장 안에서 맥락과 함께 보인다.<br>④ 지구 위 7px 점 9개 폐지. 선택한 카드 1건만 핀+값 라벨.<br>⑤ 바다 카드는 05 Ocean 쪽으로.<br>⑥ 계산 위치: gts-global Lambda 가 파일 끝에 extremes 블록을 붙인다(클라이언트가 3,000지점을 매번 훑지 않게).<br>PD 선택지: (a) 11 Intelligence Now 탭(권고) · (b) 각 현상 Inspector 하단 '오늘 관측 최고/최저' 한 줄로 분해 · (c) v1(FACT)로 보냄. |
| 표현 | DOM 카드 |
| 자료 | 관측 극값(기온·풍속)은 지금 자료로 된다 — 추가 수집 0, KMA 허브 호출 증가 0.<br>- GTS: ta·tmax·tmin·ws·rn, 좌표는 NOAA ISD 지점표로 붙임, sanity 필터 있음(aws/gts-global/handler.py).<br>- 한국 일 누적 강수: wind/kma-aws-min.json rnday(aws/kma-aws-min/handler.py:50, 194-195).<br>- 기록 경신·어제 대비: 한국은 wind/series/stations 이력(760일 보관)으로 어제 대비가 가능하다. 전지구는 이력이 없다 — archiver 에 일별 극값 적재를 시작해야 한다.<br>- 모델 픽은 GFS 확장(기온·바람)이 끝나도 먼지·UV·파고·SST 는 남는다 — 각 묶음의 자료 교체를 따라간다. |
| 재사용 | prototype/v2-three/js/ext/lab-today.js · prototype/js/today.js · prototype/v2-three/js/ext/ext-scene.js · aws/gts-global/handler.py(tmax/tmin·sanity) · aws/kma-aws-min/handler.py(rnday) · aws/kma-aws/handler.py(이력) |
| 무료 / 유료 | 무료: 오늘의 극값 카드(관측 기반) + 탭→비행. 재방문을 만드는 무료 입구.<br>EXPLORER: 어제·최근 7일 극값(한국은 즉시, 전지구는 적재 후) · 평년 대비 · 공유용 짧은 리포트.<br>PRO: 극값 이력 export · 조건 알림('한국 관측 최고 35°C 이상'). |
| 걸리는 것 | · 자리: PD 정본 좌측 레일에 자리가 없다 — **PD 결정 필요**(Intelligence Now 탭 / Inspector 한 줄 / v1).<br>· 의존: 11 Intelligence inspector(P1)가 있어야 옮길 곳이 생긴다 → P2 유지.<br>· 정직성: GTS 강수 rn 의 누적 기간이 지점마다 다르다. 해법 = 강수 극값은 1단계에서 한국 rnday 만.<br>· 정직성: SYNOP tmax/tmin 의 기준 시간대가 지역마다 다르다. 해법 = '관측소 보고값' 표기 + 관측시각, 순위 문구는 '보고된 관측소 중'.<br>· 라이선스: 모델 픽 6종이 Open-Meteo 파생. 해법 = 유료 화면에서는 카드에서 빼고 자료 교체 뒤 복귀. |
| **완료 기준** | · Intelligence › Now 탭 맨 위에 '오늘의 극값' 카드가 보이고, 각 카드에 값·지점명·관측시각·'관측소 보고값' 배지가 있다. Open-Meteo 파생 카드는 없다.<br>· 최고기온 카드를 누르면 01 Temperature 가 켜진 채 그 지점으로 비행하고, 지구에는 핀 1개와 값 라벨만 보인다(점 9개가 동시에 찍히지 않는다).<br>· 카드 문구가 '보고된 관측소 중 최고'이고 묶음 아래에 관측 공백 지역 고지가 보인다. 강수 카드에는 '한국 · 일 누적'이 적혀 있다. |

#### 강수 · `weather.precipitation` — 다시 만든다 · P0 · L

| | |
|---|---|
| **Before** | 대표 레이어 weather/radar 가 빈 THREE.Group 이라 '강수'를 눌러도 지구에 객체가 0개다(live-layers.js:588). 그림은 카드 속 레이더 PNG 최신 1장뿐(:1227-1242). 볼 만한 GFS 강수 색면(PrecipField)은 '비·눈·태풍 5일 예보' 줄(ui-shell.js:77) 안에 구름 GFS 모드와 묶여 있고(main.js:4442-4443) 범례가 없다. 색은 구간 안에서 mix 로 번지고(precip-field.js:44-52) 0.5mm/h 미만을 버린다(:70). |
| 돈 내는 사람 눈 | '강수'를 눌러도 지구는 그대로고 옆 패널에 기상청 레이더 그림 한 장이 뜬다 — 돈 낸 사람은 먼저 고장을 의심한다. 정작 볼 만한 그림(GFS 5일 강수 색면: 윈디식 구간 색·눈 구분·재생)은 펼치기 안 세 번째 줄 '비·눈·태풍 5일 예보 ▶'에 숨어 있다. 그 색면 자체는 이 묶음에서 구름 다음으로 잘 만든 것이다. (D 망가져 보인다) |
| 기준 사이트 | windy: '비/번개'·'누적 강수량'·'날씨 레이더'가 각각 타일, 레이더 루프·타임라인·단위 있는 범례·모델/갱신 시각 상시. mapped.earth: 강수는 부가 토글 'rainfall', AIR 에 TPW·CAPE. 두 곳 모두 누르면 지도가 즉시 변한다 — 지금 v2 만 그러지 않는다. |
| **After** | [→ 03 Rain] PD 목표(mm/h 8칸 단계색 · 강한 코어 contour · 칩: 현재/누적/타입/레이더·모델 · 누적 시 범례 단위 자동 변경)는 그대로. **P0 는 코어만**, 나머지는 P1 로 내린다.<br>■ P0 코어 — 이것 없이는 유료 불가<br>① '강수' 1탭 = GFS 강수 장을 대표로 승격. 누르는 즉시 지구가 변한다. 강수 프레임을 구름 GFS 모드에서 떼어 공용 프레임 저장소에서 받는다(01 과 공유) — 구름이 위성 모드여도 비가 떠야 한다.<br>② 색: PD 8칸 단색(0.1~0.5 · 0.5~1 · 1~2 · 2~5 · 5~10 · 10~20 · 20~50 · ≥50). rainRamp 의 mix 를 구간 판정으로, discard 0.5 → 0.1. 눈은 같은 구간의 별도 램프, 어는비는 보라(현 구분 유지).<br>③ 0.1 문턱의 대가를 미리 막는다: 실측(2026-09-19 12Z 런 manifest 의 wetGt01) **지구의 15.1~17.1% 가 0.1mm/h 초과**다. 지금 그리는 ≥1.5mm/h 는 1.1%(precip-field.js:82). 아래 두 칸(0.1~1)은 낮은 불투명도로 두어 지구와 구름을 덮지 않게 한다. PD 범례 칸은 그대로.<br>④ '지금'의 정직: 실측으로 12Z 런이 22:10Z 에 게시됐다 — '지금' 프레임은 항상 +6~12h **예보**다. 칩 이름은 '현재 강우'가 아니라 '지금 시각 · 모델 강수율', 배지 'MODEL · GFS 0.5° · run ○Z · +○h · 격자 평균'.<br>⑤ 껍질 높이: 반지름 1.0012 고정(precip-field.js:105) → airShell() 계약(live-layers.js:1169-1172). 과장 50× 에서 비가 지형 밑으로 묻히는 것을 없앤다.<br>⑥ 범례 8칸 + mm/h 상시(셸 슬롯), 눈/어는비 보조 칩. 시간은 Global Timeline 하나.<br>⑦ raingrid(5° Open-Meteo, ui-shell.js:64) 삭제. 레이어 id 개명 없이 메뉴 연결만 바꾼다.<br>■ P1 — 코어 뒤<br>⑧ 강한 코어: 10·20mm/h 굵은 흰 선은 **셰이더 선**(01 과 같은 방식). 강수는 듬성듬성한 장이라 등치선 라벨은 난삽해진다 → 라벨은 코어 최댓값 셀에 값 1개씩 상위 N개('MODEL 격자 평균').<br>⑨ 인코딩 상한: PRATE_HI 30→100 은 '서버 상수 1개'가 아니다. 클라이언트 복호 상수가 **두 곳에 하드코딩**돼 있다(precip-field.js:37, main.js:2012). manifest.encoding 에 수치 필드를 싣고 두 곳이 그것을 읽게 한 뒤에 올린다(uGfsTexel 때와 같은 함정). 그 전까지 범례 맨 위 두 칸에는 '30mm/h 이상은 구분 불가(인코딩 상한)'를 적는다. 0.5° 격자 평균에서 ≥50 은 드물다 — 비어 있는 것이 정상이라 고지.<br>⑩ 누적 칩: GFS APCP 로 '**앞으로** 3h · 24h 예상 누적(MODEL)'. 과거 누적이 아님을 칩 이름에 넣는다. 누르면 범례가 mm(1·5·10·20·50·100·200)로 바뀐다.<br>⑪ [1h 누적] = 한국 AWS 실측에서만. **서버 누적·이력 저장은 필요 없다** — 기상청이 rn15·rn60·rn12h·rnday 를 직접 준다(aws/kma-aws-min/handler.py:50, 194-195, 10분 cron schedules.sh:83). v2 는 아직 이 파일을 한 번도 안 쓴다(참조 0건) → 클라이언트 fetch + 지점 숫자 마커(0 은 찍지 않음)만 만들면 된다. 30분 넘게 늙으면 '관측 지연'으로 바꾼다(허브 용량 함정).<br>⑫ 한국 레이더는 지구에 얹지 않는다(기상청 그래픽 PNG, 좌표계 없음 — aws/kma-radar/handler.py:1-6, 재투영은 위치 추측). Inspector 안에서 최근 1시간 루프(5분×13장, 이력 슬롯 :26-27)를 재생, 'OBS · 기상청 HSR'.<br>⑬ cloud-gfs 의 구름 부분은 04 Forecast, 강수·번개 부분은 03 으로 분리. 번개 표식 높이(main.js:6306)도 airShell 로. |
| 표현 | 단계색+등치선 |
| 자료 | P0 코어는 **지금 자료로 나온다** — p{step}.png 720×361(0.5°), R=log mm/h(0.05~30), G=종류, 41스텝 누락 0, 평균 107KB/스텝(실측 manifest). NOAA GFS = public domain. 스케줄 rate(3 hours).<br>- 누적(P1): APCP 는 통계 구간 메시지(pdt 8)인데 현 파서는 지표 수분을 pdt==0 만 받는다(handler.py:164). f000 에는 APCP 가 없고, fields_from_grib 는 하나라도 없으면 스텝을 버리며(:169-174), 스텝이 서로 독립으로 빌드돼(:352-353) 24h 합산은 done 을 모은 뒤 후처리여야 한다. grib2lite 가 통계 구간(시간 범위)을 내주는지는 UNKNOWN — 서버 작업 M.<br>- 인코딩 상한 변경은 서버 1곳 + 클라이언트 2곳 + manifest 수치 필드.<br>- 한국 1h 실측: wind/kma-aws-min.json(핸들러 주석 510지점, 09-07 실측 메모 736지점 — 화면은 파일의 실제 지점 수를 적는다). 허브 호출 증가 0.<br>- 레이더 루프: wind/kma-radar.json frames + wind/kma-radar-history 13슬롯(이미 있음). 지금 '최신 1장만' 쓰는 것은 클라이언트 결함.<br>- NOW 시각에 대류강수율 없음(main.js:4449)은 번개 표식 문제로 03 코어와 무관.<br>- 전지구 '관측' 강수는 스택에 없다. 후보 NASA GPM IMERG Early(수집기 없음, Earthdata 계정·상업 조건 착수 전 재확인) — P2 후속. |
| 재사용 | prototype/v2-three/js/precip-field.js(셰이더·두 프레임 blend) · prototype/v2-three/js/main.js:1811-1844(GFS 프레임 로더), 1979-2016(sampleAt — 점값·시계열 읽기), 4897-4898, 5454-5474(단일 시계) · prototype/v2-three/js/live-layers.js:1169-1172(airShell), 1227-1242(metaRadar) · aws/gfs-cloud-forecast/handler.py · aws/kma-radar/handler.py · aws/kma-aws-min/handler.py |
| 무료 / 유료 | 무료: 지금 시각 강수 단계색+범례 · +24h 재생 · 한국 레이더 1시간 루프와 AWS 실측(안전 성격).<br>EXPLORER: +120h · 앞으로 3h·24h 예상 누적 · 내 위치 '언제부터 얼마나' 시계열(텍스처 41장에서 읽음, 호출 0) · AWS 실측 대조 리포트.<br>PRO: 누적 export · 강수 시작 알림 · GFS\|ECMWF 강수 비교는 **ECMWF 격자 수집기 확보 후**(ecmwf-ingest README 도 '강수는 누적 방식이 달라 따로 설계'라고 적어 뒀다).<br>호우 특보 등 공식 안전 정보는 구독과 무관하게 무료(06 Hazards 원칙). |
| 걸리는 것 | · P0 남발 방지: 원안은 코어·누적·레이더·AWS·IMERG 를 한 덩어리 P0 로 묶었다. P0 는 ①~⑦(1탭 즉시 색면·8칸·범례·타임라인·껍질 높이)뿐이고 ⑧~⑬은 P1.<br>· 프레임 로더가 구름 GFS 모드에 묶여 있다(main.js:4442-4443). 해법 = 01 과 공유하는 공용 프레임 저장소 분리가 선행.<br>· 인코딩 상한 변경은 클라이언트 복호 2곳(precip-field.js:37, main.js:2012)을 manifest 수치로 바꾼 뒤에만. 순서를 어기면 조용히 값이 틀린다.<br>· 누적 자료: APCP 파서(pdt 8·f000 부재·후처리 합산) 서버 작업 M. grib2lite 의 통계 구간 노출 여부 UNKNOWN.<br>· 정직성: '현재 강우'는 실제로 +6~12h 예보다. 해법 = 칩·배지에 run 과 +h 표기, '격자 평균' 명시. 누적은 '앞으로 예상'임을 칩 이름에.<br>· 표현: 0.1mm/h 문턱이면 지구의 15~17%가 칠해진다(실측 wetGt01). 해법 = 아래 두 칸은 낮은 불투명도, 전지구 뷰에서 구름·지표가 가려지지 않는지로 판정.<br>· 한국 레이더는 좌표계 없는 그래픽이라 지구에 얹을 수 없다(확정). 해법 = Inspector 루프 + 지구 위에는 AWS 실측 숫자.<br>· KMA 허브 용량 공유로 AWS 매분 피드가 몇 시간씩 묵을 수 있다. 해법 = 30분 늙음 가드. |
| **완료 기준** | · 강수를 1탭하면 즉시 지구에 색면이 나타난다(지금은 객체 0개). 색은 8칸 단색이고 좌하단 범례에 mm/h 8칸과 'MODEL · GFS 0.5° · run ○Z · +○h'가 보인다.<br>· 전지구 뷰에서 0.1~1mm/h 옅은 칸이 구름과 지표를 가리지 않고, 태풍·전선의 ≥10mm/h 코어는 굵은 흰 선으로 구분된다.<br>· 지형 과장 50× 로 한반도를 확대해도 강수 색면이 산 밑으로 묻히지 않는다.<br>· [1h 누적] 칩은 '한국 AWS 실측'에서만 활성이고, 누르면 범례가 mm 로 바뀌며 지점 숫자에 관측시각이 붙는다. 자료가 30분 넘게 늙으면 '관측 지연'이 뜬다. |

#### 구름 · `weather.cloud` — 고친다 · P1 · M

| | |
|---|---|
| **Before** | GMGSI 위성 IR 합성 영상을 입체 껍질(운정고도 릴리프+음영+그림자)로 그리고, 시간을 밀면 GFS 5일 예보 구름으로 넘어간다(main.js:1383-1468, 2074-2130, 5454-5474). 묶음 안에서 유일하게 팔 수 있는 화면이지만, 메뉴를 눌러도 지구가 변하지 않고 자료 이름으로 된 줄이 나열돼 있다(ui-shell.js:62, 71-78). GFS 매니페스트를 못 받으면 Open-Meteo 지점 방식으로 물러난다(main.js:1821-1823, 1706). |
| 돈 내는 사람 눈 | 이 묶음에서 유일하게 첫인상이 좋은 화면이다. 실제 위성 구름이 입체로 솟아 있고 밤에도 보이며, 시간을 밀면 5일 예보 구름으로 넘어가고 돌아오면 관측으로 복귀한다. 그대로 팔 수 있는 수준이고 windy·mapped.earth 의 구름 표현에 밀리지 않는다. (A 팔 수 있다) |
| 기준 사이트 | windy: '위성'과 '구름'이 별도 타일(관측 영상과 모델 구름 분리), 타임라인 상시. mapped.earth: 구름 색면 메뉴 없음(지구 바탕). 입체로 솟은 실제 위성 구름·밤에도 보이는 구름·관측→예보 자동 전환은 두 곳 모두에 없다 — EARTHUS 고유 강점이므로 그림은 건드리지 않는다. |
| **After** | [→ 04 Clouds] 그림은 유지하고 셸만 PD 정본에 맞춘다.<br>① 메뉴 1탭 = 켜짐/꺼짐 토글. 'cloud-off' 줄 삭제, 기본 켜짐 유지.<br>② Inspector 첫 줄 세그먼트 [Observation \| Forecast]. 타임라인이 미래로 가면 자동 Forecast, 배지 'OBS · NOAA GMGSI · ○분 전' → 'MODEL · GFS 0.5° · run ○Z · +○h'. 전환 순간 0.4초 교차 페이드 + 토스트 1회(해상도가 13km→55km 로 떨어지는 것을 설명).<br>③ 자료 이름 줄 → 칩 3개 [구름(위성)][운정고도][저·중·고층].<br>- 운정고도: KMA L2 CTH 관측 창(동아시아)만 2km 칸 단계색+범례, 창 밖은 'IR 밝기 근사 · DERIVED' 해칭.<br>- 저·중·고층: GFS 3층 구름비율 25·50·75·100% 단계 3색, MODEL 배지. **원안의 '미사용 R·G 채널에 담는다'는 성립하지 않는다** — 지금 c{step}.png 는 그레이+알파 2채널이다(handler.py:230-244, encode_png(...,4); 맨 위 독스트링 :21 의 'R, G = 0'은 옛 문구). RGBA 로 되돌리면 330→229KB 절감을 잃는다. 해법 = 바람 w{step}.png 처럼 **별도 저해상 파일 l{step}.png(1°, RGB = 저·중·고 비율)** 을 낸다. 세 변수는 이미 요청·해독 중이라(:99, :154-159) 해독 시간 증가는 없다. 비트 팩(층당 2bit)은 선형 보간이 안 돼 쓰지 않는다.<br>④ Satellite quick mode: 채널 칩 [천리안 10분][동아시아 2km][수증기 6.3µm][밤 안개 후보] — 관측 영상 그대로. 기존 레이어 id(cloud-gk2a·cloud-ea·cloud-wv·cloud-fog)는 개명하지 않고 연결만 바꾼다.<br>⑤ 재배치: '내 하늘'(mysky) → Inspector 위치 카드 · '3D 볼륨' → View>Appearance 실험 옵션 · 불투명도·릴리프 → View>Appearance.<br>⑥ 상시 표기: 관측 나이 · ±72.7° 밖 극지 '자료 없음' · 3시간 넘게 늙어 VIIRS 로 폴백하면 '하루 한 장 · 낮 쪽만'.<br>⑦ **Open-Meteo 폴백 제거**: 매니페스트를 못 받으면 loadGfsPoints(Open-Meteo 450지점)로 물러나지 말고 '예보 구름 자료 없음(UNAVAILABLE)'을 띄운다. 메뉴의 출처 문구 'GFS·Open-Meteo'(ui-shell.js:77)도 고친다.<br>⑧ 문구 정리: GFS 예보 프레임 갱신은 rate(3 hours) 로 확인됐다(tools/deploy-gfs-forecast.sh:67). GMGSI 쪽 레지스트리 180분 vs 핸들러 1시간 불일치는 실제 EventBridge 규칙을 확인해 맞춘다(UNKNOWN). |
| 표현 | 유지 |
| 자료 | 그림은 지금 자료로 된다.<br>- 층별 칩: gfs-cloud-forecast 에 l{step}.png 출력 추가(요청·해독 추가 0, 인코딩+업로드만). 파일 크기 UNKNOWN(실측 필요, 참고: 구름 234KB · 바람 8KB/스텝).<br>- aws/gfs-cloud-global-low 는 자료원으로 쓰지 않는다 — v2 코드에 참조가 0건이고, 09-03 기록상 eccodes 라이브러리 누락으로 한 번도 배포된 적이 없다(현재 배포 여부는 UNKNOWN).<br>- 과거 위성 프레임 재생은 archiver 적재가 선행 조건이고, gk2a-clouds 변경은 비용 절감 보류 대상(대회 이후)이다.<br>- ECMWF 구름 비교는 격자 수집기가 없다(ecmwf-ingest = 97지점 2t 점값). |
| 재사용 | prototype/v2-three/js/main.js:1178-1355(구름 셰이더), 1383-1519(loadObserved·loadGmgsi·loadGk2a), 1521~(loadCth), 2074-2130(CloudManager.set), 4366-4376(setCloud), 4426-4443(메뉴 분기), 5454-5474(syncCloudToTime) · prototype/v2-three/js/ui-shell.js:62-78 · aws/gmgsi-clouds/handler.py · aws/gk2a-clouds/handler.py · aws/gfs-cloud-forecast/handler.py(wind_png 방식의 저해상 별도 파일) |
| 무료 / 유료 | 무료: 실시간 위성 입체 구름 · +24h 예보 구름 · Observation/Forecast 구분.<br>EXPLORER: +120h · 운정고도·층별 칩 · 내 위치 '하늘 상태' 리포트(mysky).<br>PRO: 과거 위성 프레임(적재 후) · 볼륨 렌더 · export · GFS\|ECMWF 구름 비교는 **ECMWF 격자 수집기 확보 후**. |
| 걸리는 것 | · 층별 자료: 원안이 전제한 '빈 R·G 채널'은 없다(구름 PNG 는 2채널). 해법 = 1° RGB l{step}.png 별도 출력(묶음 공통 'GFS 확장'에 포함).<br>· 라이선스: GFS 매니페스트 부재 시 Open-Meteo 로 물러나는 폴백(main.js:1706, 1821-1823)이 유료 화면에 남으면 안 된다. 해법 = UNAVAILABLE 표기로 교체.<br>· 셸 의존: Observation\|Forecast 세그먼트·배지 전환은 Global Timeline·Inspector(P0 셸)가 있어야 한다.<br>· 메뉴 구조 변경은 레이어 id 개명 금지 규칙과 tools/test_v2_ui_information_architecture.mjs 불변식을 통과해야 한다.<br>· ECMWF 비교·과거 위성 프레임은 자료가 없다 — PRO 훅에서 '확보 후'로 표기, 지금 팔지 않는다. |
| **완료 기준** | · 구름 메뉴 1탭으로 구름이 꺼지고 다시 1탭으로 켜진다. 메뉴에 '구름 끄기' 줄이 없다.<br>· 타임라인을 미래로 밀면 Inspector 세그먼트가 Forecast 로 바뀌고 배지가 'OBS · NOAA GMGSI · ○분 전'에서 'MODEL · GFS 0.5° · run ○Z · +○h'로 바뀌며 토스트가 1회 뜬다.<br>· [운정고도] 칩을 켜면 동아시아 창 안은 2km 칸 단계색과 범례가, 창 밖은 해칭과 'IR 밝기 근사 · DERIVED' 표기가 보인다.<br>· GFS 매니페스트를 받지 못한 상태에서 '예보 구름 자료 없음'이 뜨고 네트워크 탭에 api.open-meteo.com 요청이 없다. |

#### 안개·낮은구름 · `weather.fog` — 합친다 · P3 · S

| | |
|---|---|
| **Before** | 천리안 밤 전용 BTD(11.2−3.8µm) 영상을 구름과 같은 껍질·같은 흰색 셰이더로 그린다. 구름과 겹치지 않고 구름을 대체한다(main.js:4429 setCloud('gk2a:nightlow'), 1472-1519). 낮에는 빈 화면이다. 문턱값이 보정되지 않은 '후보'인데(aws/gk2a-clouds/handler.py:152-160) 화면 문구는 '골라냅니다'라고 단정한다(main.js:1507). |
| 돈 내는 사람 눈 | 낮에 누르면 동아시아가 텅 빈다(밤 전용). 밤에 눌러도 평소 구름과 같은 흰 얼룩이라 안개인지 구름인지 구분되지 않고, 그 대신 구름은 사라진다. 안개를 돈 내고 보는 사람(운전·항공·낚시·등산)은 시정 몇 m, 어느 도로·공항인지를 원하는데 그 값이 없다. (C 빈약하다) |
| 기준 사이트 | mapped.earth: 안개 메뉴 없음. windy: 실측한 타일·칩 목록에 없음('48개 더' 안은 UNKNOWN). 위성 BTD 기반 밤 안개 후보는 기준 사이트에서 확인되지 않았다 — EARTHUS 고유. 다만 지금 품질로는 강점이 아니라 약점이다. |
| **After** | [→ 04 Clouds › Satellite quick mode 의 '밤 안개 후보' 칩] 독립 메뉴 줄을 없앤다. 04 Clouds(P1)가 먼저 나가야 자리가 생긴다.<br>① 구름을 대체하지 않고 겹친다: CloudManager 배타 모드 밖의 얇은 별도 껍질 Mesh. 텍스처는 기존 nightlow.png 그대로.<br>② 흰색을 쓰지 않는다: 연한 호박색 2단. **Lambda 변경 없이 된다** — 서버가 굽는 알파가 clip((BTD−1.5)/4.5)^0.9 로 단조 증가한다(handler.py:577-580). 3K 경계 = 알파 약 0.37 이므로 셰이더가 알파 문턱 하나로 2단을 가른다. 회색 채널은 캔버스 경유 시 알파 곱으로 깎일 수 있어 알파로 판정한다. gk2a-clouds 는 비용 절감 보류 대상이라 건드리지 않는다.<br>③ 낮 영역은 서버가 이미 비운다(해 고도<0 만 그림, :575). 화면 중심이 낮이면 칩을 비활성으로 두고 '해가 진 곳에서만 계산됩니다(3.8µm 에 햇빛 반사가 섞임)' 고지. 주야 경계선 표시.<br>④ 라벨: '낮은 구름·안개 후보 — 지상 관측과 대조 전'. main.js:1507 의 '골라냅니다'를 고친다.<br>⑤ 범례 2단. **K 숫자를 보정된 기준처럼 내걸지 않는다** — floor 1.5·hi 6.0 은 핸들러가 '실측으로 다시 맞춰야 한다'고 적은 미보정 값이다(:158-159). 범례는 '옅음 / 짙음 · BTD 1.5~3 / 3~6K(미보정 문턱) · OBS 파생 · GK2A · 10분'.<br>⑥ 시정 숫자(몇 m)는 관측 자료가 생길 때까지 표시하지 않는다.<br>⑦ Global Timeline 의 '지금'에서만 활성. 예보 없음. |
| 표현 | 고해상 색면 |
| 자료 | 그림은 지금 자료로 된다(clouds/gk2a/nightlow.png, 전면 FD, 10분 — 픽셀 크기는 이번에 확인하지 않아 UNKNOWN).<br>- 2단 구간화는 클라이언트만으로 된다(알파 역산). 서버 변경 0.<br>- 동아시아 2km 판은 gk2a-clouds 에 EA 채널 추가가 필요한데(현재 area 'FD'만, :154-155) 보류 대상이라 하지 않는다.<br>- 시정 실측 없음. v2 의 '시정'은 Open-Meteo 5° 모델값뿐(prototype/js/today.js:41). 후보 NOAA AWC METAR(수집기 없음, 라이선스 착수 전 확인). KMA 시정 추가는 허브 용량 공유 함정 먼저 점검. |
| 재사용 | prototype/v2-three/js/main.js:1472-1519(loadGk2a — nightlow 텍스처 로드), 4429(메뉴 분기) · aws/gk2a-clouds/handler.py:141-160(BTD 원리·미보정 고지), 566-583(알파·회색 인코딩) · (원안의 reuse 필드는 잘려서 도착해 위 목록은 코드에서 다시 확인한 것이다) |
| 무료 / 유료 | 무료: 후보 영역 표시(위성 quick mode 안의 칩).<br>EXPLORER 는 METAR·AWS 시정이 들어온 뒤에만 성립한다(공항·내 위치 시정 대조, 새벽 안개 알림). 그 전에는 유료 가치가 없다 — 독립 메뉴로 팔지 않는다. |
| 걸리는 것 | · 의존: 04 Clouds 의 Satellite quick mode(P1)가 먼저 있어야 옮길 자리가 생긴다.<br>· 정직성: 미보정 문턱(1.5/6.0K)을 범례 숫자로 내걸면 검증된 기준처럼 읽힌다. 해법 = '미보정 문턱'·'후보' 표기, 시정 숫자 금지.<br>· 캔버스 경유 텍스처에서 회색 채널이 알파 곱으로 깎일 수 있다. 해법 = 알파 채널 문턱(약 0.37)으로 2단 판정.<br>· gk2a-clouds 는 비용 절감 보류 대상(대회 이후). 해법 = 서버 변경이 0인 경로만 택한다.<br>· 유료 가치는 시정 관측(METAR 등) 수집기가 생긴 뒤에만 성립 — 지금은 자료 없음. |
| **완료 기준** | · 밤 쪽 동아시아에서 [밤 안개 후보] 칩을 켜면 흰 구름은 그대로 있고 그 위에 호박색 2단 면이 겹쳐 보인다(구름이 사라지지 않는다).<br>· 칩 라벨과 범례가 '낮은 구름·안개 후보 — 지상 관측과 대조 전 · 미보정 문턱'이고 '골라냅니다'라는 문구가 화면 어디에도 없다.<br>· 화면 중심이 낮인 곳에서는 칩이 비활성이고 '해가 진 곳에서만 계산됩니다' 고지가 보인다. 시정(m) 숫자는 어디에도 없다. |

#### 바람 · `weather.wind` — 다시 만든다 · P0 · L

| | |
|---|---|
| **Before** | 관측소 약 3,000곳마다 선분(19~89km)을 긋고 입자 2개(P_PER=2)가 자기 선분 위만 왕복한다. 이류·유선 0건(buildWind live-layers.js:2130~, 입자부 :2180~). 격자(windgrid)는 u/v 를 Math.hypot 으로 속력만 남기고 방향을 버린 뒤 5° 선형 색면 한 장으로 그린다(buildWindGrid :1154-1166 → buildField, airShell :1169-1172). 범례 없음. PD 가 싫어하는 '막대기' 그 자체다. |
| 돈 내는 사람 눈 | PD 가 싫어하는 바로 그 막대기다. 유럽·한국·일본에만 짧은 막대가 빽빽하고 바다와 중국·러시아는 텅 비어, 지구의 바람이 아니라 관측소 분포도로 보인다. 입자는 제자리에서 왕복할 뿐 흘러가지 않아 mapped.earth·windy 의 첫 화면과는 비교가 되지 않는다. (D 망가져 보인다) |
| 기준 사이트 | mapped.earth: 'Wind animation' 입자 토글이 색면 라디오와 분리, 고도 Sfc/850/500/250, 속도색 혜성 꼬리 입자가 전지구를 흐르고 범례 '0 — Wind — 30 m/s' 상시, 모델·자료시각 표기. windy: 입자 토글 + 풍속 색면(태풍이 동심 과녁으로 읽힘) + 등치선 토글(기압) + kt 범례 + 타임라인 상시. 두 곳 모두 지구를 자동 회전시키지 않고, 지도를 움직이는 동안은 입자를 비운다 — v2 는 자동 회전이 기본(main.js:581,706)이라 같은 기법을 그대로 못 쓴다. |
| **After** | [→ 02 Wind] P0 범위를 'GFS 0.5° · 10m 한 고도'로 자른다. 상층·0.25° 창·ECMWF 는 후속으로 뗀다.<br>① 입자장(토글, 기본 ON)<br>- 자료는 GFS 10m u/v 프레임(uv{step}.png)뿐이다. 5° global.json 이나 wind-ea(Open-Meteo)로는 출시하지 않는다(과도기 화면 없음). 엔진 개발 중 시험은 이미 있는 w{step}.png(4° 700hPa)로 하되 화면에 '지상 바람'으로 내보내지 않는다.<br>- 이류는 v1 windfield.js 의 구면 이류를 이식한다: 랩 bilinear(:275-288), cos(위도) 보정(:523), 경도 랩(:567), out 재사용으로 GC 회피(:506 주석). flow.js 의 advectNormalized 는 쓰지 않는다(x 를 0~1 로 clamp 해 날짜변경선에서 멈추고 cos 위도 보정이 없으며 표본마다 Object.freeze 객체를 만든다).<br>- 꼬리는 '월드 공간 이력 선분(입자당 링버퍼, 드로우콜 1개)'을 권고한다. v2 는 자동 회전이 기본이라 v1 식 화면 공간 페이드는 꼬리가 옆으로 미끄러지거나 매 프레임 지워진다. 최종 결정은 1일 스파이크(데스크톱·폰 프레임 시간 실측)로 한다.<br>- 강도 3단 칩은 고정 숫자가 아니라 '기기 예산의 1/3 · 2/3 · 전부'다. 기기 예산 = flowRenderBudget(deviceClass, thermalState) × ThermalGovernor 의 budget.particleScale(main.js:2404-2413). 18,000/5,000 은 상한일 뿐이고 실측 통과 전에는 약속하지 않는다(v1 실측 상한은 4,200 — windfield.js:25).<br>- 색면 ON 이면 입자는 흰색, OFF 면 입자가 속도 구간색. 입자와 색면은 같은 airShell 반지름에 둔다(시차 방지).<br>- 수명 뒤 재배치 · 뒤쪽 반구 컬링 · 줌 정규화(천저 기준)는 v1 계약 그대로.<br>② 풍속 색면(라디오, 01·03 과 상호배타, 입자와 독립)<br>- PD m/s 8칸(<1 · 1~5 · 5~10 · 10~20 · 20~30 · 30~40 · 40~50 · ≥50). 값을 LinearFilter 로 보간한 뒤 셰이더에서 구간화 — 이 셰이더는 새로 쓴다(precip-field.js 는 mix 연속 램프라 구간화 코드가 아니다. 재사용은 '프레임 2장 blend + 구면 UV' 구조뿐).<br>- v1 계약 '색면에 stepped 금지'는 5° + nearest 강제 때문이었다. 0.5° + 보간 후 구간화면 그 원인이 없다. 등풍속선은 그리지 않는다.<br>- 20~30 / 30~40 칸은 폭풍역에서 보일 것으로 기대하지만, 40~50 · ≥50 칸은 첫 프레임을 실측하기 전에는 약속하지 않는다(GFS 0.5° 는 태풍 중심을 무디게 담는다).<br>- 색면 ON 이면 구름·바탕을 누른다(v1 교훈 3-b) — 01 Temperature 기준 구현체의 공통 renderer contract 몫.<br>③ 범례 상시<br>- m/s·kt 두 줄(0·1·5·10·20·30·40·50 m/s = 0·2·10·19·39·58·78·97 kt) + 'MODEL · GFS 0.5° · run/valid'.<br>- '입자 속도·꼬리 길이는 방향과 상대 세기를 보이기 위한 과장 표현' 한 줄. 런이 12시간 넘게 늙으면 '지연' 표기.<br>④ Inspector<br>- Level 은 P0 에 '10m' 고정 표기(선택지가 하나면 칩으로 가장하지 않는다). Model 도 'GFS' 고정 라벨. Particles 토글 + 3단. Pressure 토글은 기압 항목이 실제로 동작하는 날 나타난다(죽은 토글 금지).<br>- 클릭 1회: 최근접 0.5° 격자점의 풍속·풍향(16방위+도)을 물결표와 '격자점 좌표·거리·눈금 0.5 m/s'와 함께. 25km 안에 관측소가 있으면 OBS 값·관측시각을 먼저 보인다(grid-vs-observation 규칙). 태풍 부근이면 Hazards 의 공식 최대풍속을 병기한다(모델 격자값은 공식 발표보다 낮게 나온다).<br>⑤ 관측소 3,000곳: 막대 폐기 → 'Show Stations'(기본 OFF), 확대 시 숫자+작은 화살촉 + OBS 배지. 모델 입자와 섞지 않고 관측 공백은 비워 둔다.<br>⑥ 시간: Global Timeline 하나. 프레임 사이 u/v 는 선형 보간이고 '보간'이라 고지.<br>⑦ 입자 토글은 01 Temperature·03 Rain 위에서도 유지(색면 라디오와 무관한 공용 오버레이 엔진).<br>후속(이 항목 크기에 넣지 않음): 상층 850/500/250hPa(M · P1 — ±128 m/s·1 m/s 눈금, 실행시간이 600초를 넘으면 같은 함수의 별도 호출로 분리) · 서태평양 0.25° 창(M · P2) · GFS\|ECMWF 비교(ECMWF 격자 L 선행) · 그 전까지 Compare 짝은 'GFS 최신 런 \| 이전 런'. |
| 표현 | 입자장 + 단계색(등치선 없음) |
| 자료 | 지금 자료(wind/global.json, Open-Meteo 5°)로는 불가. 5° 전지구 최대 23.8m/s · 30m/s 이상 0칸(aws/pressure-grid/handler.py:27 실측)이라 태풍이 격자 사이로 빠지고, 유료 핵심 그림이 비상업 조항 위에 선다.<br>선행 = 묶음 공통 'GFS 확장'(M) 의 UGRD/VGRD 10m. 코드에서 확인한 함정:<br>- url_for(handler.py:93-111)는 var × lev 교차곱이다. lev_10_m_above_ground 를 켜면 TMP 가 surface·2m·700 에 다 딸려 온다 — 받는 바이트가 는다.<br>- fields_from_grib :160-163 은 'cat 2 · lt 100' 만 보고 levelValue 를 안 본다. 등압면을 하나라도 더 켜면 구름 이류용 700hPa u/v 가 조용히 덮인다. describe 의 levelType/levelValue(grib2lite.py:103-105)로 분기해야 한다(10m = lt 103/값 10, 700hPa = lt 100/값 70000).<br>- :147-148 은 모든 메시지를 decode 한 뒤 버린다(pdt 8 평균장 포함). describe 먼저 → 선별 해독이 이웃 결정이고, 이게 기준 시간도 줄인다.<br>- 새 필드는 missing 목록(:169-174)에 넣지 않는다 — 넣으면 10m 바람 하나가 빠진 날 구름 프레임까지 죽는다.<br>- 인코딩: 10m 는 기존 _wind_byte(:210-214) ±64 m/s · 0.5 m/s 눈금 그대로, 0.5° RG 2채널. ±128 은 상층 후속에만(1 m/s 눈금은 1~5 칸에 너무 거칠다).<br>- 전송량 추정: 1° RGBA 바람이 스텝당 108KB 였다(handler.py:13-15 실측) → 0.5° RG 는 250~450KB 로 추정(미실측). 5일 전체 훑기는 구름만으로 이미 14.2MB 라 바람이 그만큼을 더한다. 첫 화면은 2프레임만 받는다. '입자용 1° / 색면용 0.5°' 분리는 실측 뒤 결정. CloudFront 전송이 사용자 수에 비례하는 유일한 비용이다.<br>- 실행시간: 기준 270.4초/900초. 디코드가 순수 파이썬이라 스레드 4개가 CPU 를 나누지 못한다(GIL). 5필드 추가분은 미실측. DEADLINE 840초를 넘으면 늦게 끝난 스텝부터 탈락한다(:356-358) — 대개 +120h 쪽, 즉 유료 구간이 먼저 빈다.<br>- NOMADS 단일 장애점: 폴백 후보는 NOAA AWS Open Data 의 .idx Range 수신(ecmwf-ingest 의 Range 코드 재사용) — 저장소 안에 근거가 없어 UNKNOWN, 선행 확인.<br>라이선스: NOAA GFS 는 public domain. wind-ea.json(1° 동아시아, Open-Meteo)은 v2 입자·색면에 쓰지 않는다.<br>ECMWF: aws/ecmwf-ingest 는 ASOS 97지점의 2m 기온 점값뿐이다(PARAMS=['2t'] :64, SRC_STATIONS :49, AEC 압축 :25). 바람 격자 수집기는 저장소에 없다.<br>0.25° 창: aws/tpw-grid 가 filter_gfs_0p25.pl + subregion(:68-81)을 이미 쓰지만 해독은 eccodes(:111)다. 0.25°(28km)도 눈벽은 못 담는다 — 그래서 Inspector 에 공식 최대풍속을 병기한다. |
| 재사용 | prototype/js/windfield.js(:275-288 랩 bilinear · :523 cos 위도 · :567 경도 랩 · 줌 정규화 · 재배치 — 알고리즘만, Cesium 2D 캔버스 부분 제외) · prototype/js/earthus2/v02/visual/flow.js(flowRenderBudget 만. sampleVectorGrid/advectNormalized 는 재사용 불가) · prototype/v2-three/js/precip-field.js(프레임 2장 blend + 구면 UV 구조만 — 구간화는 신규) · prototype/v2-three/js/main.js:1814-1866(loadGfs 매니페스트·세대 쿼리), :2404-2413(ThermalGovernor), :4891-4898(onTimeOffset 단일 시계) · prototype/v2-three/js/live-layers.js:2130~(관측소 자료 로딩부만), :1169-1172(airShell) · aws/gfs-cloud-forecast/handler.py(_wind_byte :210-214, encode_png :195-203) · aws/gfs-cloud-forecast/grib2lite.py:94-112(describe) |
| 무료 / 유료 | 무료: 10m 입자 + 풍속 구간색 + 범례(m/s·kt) + 클릭 기본값(격자값, 물결표) + 가까운 시간(+24h 는 제안).<br>EXPLORER: +120h · 정확값과 최근접 실측 대조 · 내 위치 풍속 시계열 · 짧은 리포트(수치→출처→문장). 상층 고도는 자료 확보 뒤이고 등급은 PD 결정.<br>PRO: 런 간 비교(GFS 최신 \| 이전 런 — 새 라이선스 0, '예보가 어떻게 바뀌었나') → ECMWF 격자 확보 뒤 GFS\|ECMWF split/wipe/diff · 태풍 0.25° 창 · export.<br>강풍 알림은 PD 정본의 P2(alerts)로 미룬다. |
| 걸리는 것 | · 자료: 5° Open-Meteo 로는 목표 그림이 안 나온다(최대 23.8m/s, 30m/s 이상 0칸) → 공통 'GFS 확장'(M)의 UGRD/VGRD 10m 가 선행. 그 전에는 출시하지 않는다(과도기 화면을 만들지 않는다).<br>· 수집기 함정: url_for 가 var×lev 교차곱(:99-110)이고 fields_from_grib :160-163 이 levelValue 를 안 본다 → 등압면을 더 켜는 순간 구름 이류 바람이 덮인다. describe 분기(lt 103/10m, lt 100/70000Pa)를 공통 M 의 필수 항목으로 명시.<br>· 실행시간: 270초 → 추가분 미실측, DEADLINE 초과 시 +120h 쪽 스텝부터 탈락 → 완료 조건을 'elapsedS < 600 · missingSteps = []'로 두고, 넘으면 상층을 별도 호출로 뗀다. 같은 런을 3시간마다 다시 만드는 중복(하루 8회 실행 · GFS 는 4런)도 매니페스트 run 비교로 건너뛰면 GB-초가 준다.<br>· flow.js 재사용 과대평가: advectNormalized 는 날짜변경선 랩·cos 위도 보정이 없고 표본마다 객체를 만든다 → windfield.js 의 구면 이류를 이식하고 flow.js 에서는 예산 함수만 쓴다.<br>· 꼬리 기법 미결정: v2 는 자동 회전이 기본(main.js:581,706)이라 화면 공간 페이드는 꼬리가 미끄러진다 → 월드 공간 이력 선분 권고, 1일 스파이크로 데스크톱·폰 프레임 시간을 재고 확정. WebGL 선 굵기 1px 한계는 폰 DPR 2 에서 흐리게 보일 수 있어 같은 스파이크에서 확인.<br>· 입자 수: 18,000 은 v1 실측 상한(4,200)의 4.3배이고 미실측 → 3단 칩을 '기기 예산의 비율'로 정의하고 열 상태(particleScale)에 물린다.<br>· precip-field.js 는 구간화 셰이더가 아니다(rainRamp 가 mix 연속 램프, :44-52) → 구간화 셰이더는 01 Temperature 기준 구현체에서 새로 만들고 풍속이 그것을 쓴다.<br>· PD 8칸 눈금이 10m 분포에 성기다: 5° 실측 중앙값 6.1 · 99% 17.2 m/s(windfield.js 주석) → 평온한 날 전지구가 사실상 3칸 색이다. 눈금은 PD 정본대로 두고 칸 안의 차이는 입자 속도·꼬리가 맡는다. 10m 전용 세분 눈금(예: 5~10 과 10~20 을 둘로)은 PD 결정 필요.<br>· 태풍 중심 풍속은 0.5° 모델 격자에서 공식 발표보다 낮다 → Inspector 에 Hazards 공식 최대풍속을 기관명·발표시각과 함께 병기, 40~50·≥50 칸은 약속하지 않는다.<br>· 범위: 상층 3고도 · 0.25° 창 · ECMWF 비교까지 넣으면 XL 이다 → P0 는 10m·GFS 단일로 자르고 나머지를 후속 M/M/L 로 분리. 선행(공통 GFS 확장 M · 공용 프레임 저장소 · P0 셸/Inspector/Timeline)은 이 L 에 포함하지 않는다. |
| **완료 기준** | · 첫 화면(자동 회전 중)에서도 입자 꼬리가 지구에 붙어 흐르고, 입자가 날짜변경선(180°)을 끊김 없이 넘으며 극 근처에서 동서로 폭주하지 않는다.<br>· 전지구 뷰에서 저기압·태풍 둘레의 소용돌이가 입자로 읽히고, 풍속 색면이 PD 8칸의 단색 띠로 나뉘어 경계가 또렷하다(그라데이션 없음). 범례에 m/s·kt 두 줄과 'MODEL · GFS 0.5° · run/valid', '입자 속도는 과장 표현' 문구가 상시 보인다.<br>· 지도를 한 번 클릭하면 Inspector 에 '~N m/s · 방위 · 격자점 좌표와 거리 · GFS run/valid'가 나오고, 25km 안 관측소가 있으면 OBS 값과 관측시각이 따로 나온다. Open-Meteo 출처 문구는 어디에도 없다.<br>· 폰(폭 375)에서 입자가 5,000개를 넘지 않고, 열 상태가 ECO 로 내려가면 입자 수가 눈에 띄게 줄며 지구 드래그가 끊기지 않는다. 막대기 선분은 어디에도 없고 'Show Stations'를 켜야만 OBS 숫자 마커가 나온다. |

#### 기압 · `weather.pressure` — 합친다 · P1 · M

| | |
|---|---|
| **Before** | presgrid = buildField(data,'mslp',PRES_RAMP,airShell()) (live-layers.js:583, PRES_RAMP :2974-2977). 5° 선형 색면 한 장이고 등압선·고저기압 표식 0개, 범례 없음. 등압선용 1° 동아시아판(wind/pressure-ea.json)은 서버에 있으나 v2 가 읽지 않는다(phenomenon-registry.js:735). 그 판은 Open-Meteo 파생이다(aws/pressure-grid/handler.py:53). 스케줄은 aws/schedules.sh:38 에 rate(1 hour)로 적혀 있지만 R0 감사(docs/R0-OPEN-METEO-AUDIT-2026-09-20.md:24)는 실제 규칙을 rate(3 hours)로 적는다 — .sh 가 낡았다. |
| 돈 내는 사람 눈 | 기압을 보러 온 사람은 등압선과 H/L 을 기대한다. 지금은 청록~남색이 번진 색판 한 장이라 고기압·저기압 중심이 어디인지, 기압 경도가 어디서 급한지(=바람이 어디서 센지) 읽을 수 없다. 태풍 같은 수백 km 저기압은 555km 한 칸에 묻혀 보이지 않는다. (D 망가져 보인다) |
| 기준 사이트 | mapped.earth: AIR › MSLP 색면 라디오. windy: '등치선' 토글(종류: 기압) — 바람 입자·색면 위에 흰 등압선이 겹친다. 기압은 독립 메뉴가 아니라 어느 레이어 위에나 얹는 선이다. PD 정본 02 Wind Inspector 에도 'Pressure(hPa) 등압선 토글'로 들어 있다. |
| **After** | [→ 02 Wind Inspector 의 'Pressure (hPa)' 토글 · 10 Compare 의 대표 변수] 독립 색면 메뉴는 GFS 등압선이 동작하는 날 같이 내린다(대체물 없이 먼저 없애지 않는다). 현상 id 와 레이어 id 'weather/presgrid' 는 개명하지 않는다.<br>① 등압선 = 셰이더 선(이웃 결정과 일치)<br>- PRMSL 8bit 1채널 프레임 두 장을 blend 한 값에서 4hPa 간격(기상청 지상일기도 간격), 20hPa 마다 굵게. 인코딩 예: 920~1075hPa → 0.61hPa 눈금, 범위 밖은 clip 하고 실제 min/max 를 매니페스트에 실수로 적는다.<br>- 셰이더는 highp 필수. 선 굵기는 화면 미분으로 일정하게.<br>- 0.5° 잔물결이 보이면 평활은 셰이더의 몇 탭 평균으로 하고, 했으면 범례에 '평활'이라 적는다(Lambda 의 순수 파이썬 평활은 실행시간을 먹는다).<br>② 전지구 뷰 솎음: 고도 약 12,000km 이상에서 간격 uniform 을 8hPa 로(v1 isobars.js SHOW_MAX_M 의 교훈).<br>③ H/L 중심은 Lambda 가 실수 값에서 찾아 매니페스트에 스텝별로 싣는다<br>- 1° 평균 뒤 이웃 2칸(≈222km, v1 HL_RADIUS 와 같은 물리 반경 — 0.5° 에서 하면 4칸).<br>- 브라우저에서 8bit 값으로 찾지 않는다. 넓은 고기압 중심이 같은 값의 고원이 되어 v1 extrema 의 엄격 부등호(isobars.js:63-64)가 중심을 못 찾는다.<br>- 'H 1026' / 'L 992' 는 모델 값 그대로(정수 hPa), 고기압 주황·저기압 파랑. 해면 환산이 허구인 고지대(티베트·안데스·남극·그린란드)의 중심은 찍지 않는다 — 표고 임계는 실측 뒤 정한다.<br>- 화면의 라벨 수는 v2 labelBudget 안에서, 깊이가 큰 중심부터.<br>④ 선 위 숫자 라벨('1008'): contour-math 는 솎은 격자(2°)에서 라벨 자리 찾기 전용, 키프레임이 바뀔 때만. 재생 중에는 선 라벨을 숨기고 H/L 만 남긴다(선은 blend 로 미끄러지는데 라벨은 키프레임마다 튄다). 멈추면 돌아온다.<br>⑤ 겹치기: 입자와 겹치면 '선이 촘촘한 곳 = 바람 센 곳'이 읽힌다. 01 Temperature·03 Rain 위에도 같은 토글.<br>⑥ 범례: '등압선 4 hPa · MODEL · GFS 0.5° · run/valid'.<br>⑦ 시간: Global Timeline.<br>주의: 과도기(pressure-ea.json) 경로는 v2 에 만들지 않는다. PRMSL 은 공통 GFS 확장에 같이 실려 오므로 과도기 구현은 버릴 코드이자 라이선스 노출이다. 5° 격자로는 등압선을 그리지 않는다(pressure-grid 주석: 없는 정밀도를 있는 척하는 것). |
| 표현 | 등치선(셰이더 선) + H/L 표식 — 색면 없음 |
| 자료 | 전지구는 지금 자료(5°)로 불가.<br>- 해법: 공통 'GFS 확장'(M)에 var_PRMSL + lev_mean_sea_level. 그 레벨에는 지금 켠 다른 변수가 없어 교차곱으로 딸려 오는 것이 없다. fields_from_grib 에 PRMSL 분기(cat 3 · num 1 · lt 101)는 아직 없다 — 신규. 0.5° 전지구 41스텝, 새 Lambda 0개, NOAA GFS public domain.<br>- 자료는 P0 공통 M 과 같이 도착하고, P1 인 것은 렌더러뿐이다.<br>- H/L 탐색은 Lambda 에서 한다. 순수 파이썬이라 1° 평균 격자(65k칸)에서 4이웃 선별 뒤 5×5 판정으로 비용을 누른다(미실측).<br>- wind/pressure-ea.json: Open-Meteo 1°, 20~50N·110~160E(handler.py:56-58), 실제 주기 3시간(R0 감사 :24). v2 는 쓰지 않는다.<br>- Compare 짝: 당장은 'GFS 최신 런 \| 이전 런'(같은 S3 접두사의 런 폴더 — 이전 런 폴더의 보존 기간은 UNKNOWN, 매니페스트는 최신 런만 가리키므로 manifest-prev 가 필요). ECMWF msl 은 별도 L — aws/ecmwf-ingest 는 .index Range 수신 코드는 재사용할 수 있으나 받는 것은 2t 지점값뿐이고(:64), AEC 압축(:25)이라 eccodes 패키징(deploy-ecmwf.sh)이 필요하며 미스케줄이다. ECMWF 오픈데이터는 CC-BY-4.0(:15). 격자 해상도는 저장소 안에 근거가 없다(UNKNOWN). |
| 재사용 | prototype/js/isobars.js(4hPa·20hPa 굵은 선·솎음 고도·H/L 색 — 규칙만, extrema 는 Lambda 로 옮김) · prototype/js/contour-math.js(contourSegments·stitchSegments·contourPathMidpoint — 라벨 자리 전용) · prototype/js/gridmath.js · 01 Temperature 기준 구현체의 등치선 셰이더·라벨 배치기 · prototype/v2-three/js/live-layers.js:1169-1172(airShell) · prototype/v2-three/js/main.js:4888(labelBudget), :4891-4898(단일 시계) · aws/gfs-cloud-forecast/handler.py(encode_png, 매니페스트) · aws/ecmwf-ingest/handler.py(.index Range 수신부 — 후속 L 용) |
| 무료 / 유료 | 무료: 등압선과 H/L 표식(02 Wind 기본 그림의 일부).<br>EXPLORER: +120h 기압 배치 재생 · 내 위치 기압 시계열.<br>PRO: 런 간 diff(저기압 위치가 런마다 어떻게 옮겨졌나 — 새 라이선스 0) → ECMWF 격자 확보 뒤 GFS\|ECMWF 해면기압 split/wipe/diff(Compare 의 간판 변수) · export. |
| 걸리는 것 | · 정밀도: precip-field.js 는 'precision mediump float'(:25)다. 폰 GPU 의 fp16 은 1000hPa 부근 눈금이 0.5~1hPa 라 4hPa 선이 계단진다 → 등압선 셰이더는 highp 로 쓰거나 (p−1000) 오프셋으로 계산한다.<br>· 8bit 양자화(약 0.6hPa): 중위도는 선 위치 오차가 격자 한 칸 안이지만, 기압 경도가 약한 열대에서는 선이 격자 크기로 흔들릴 수 있다 → 먼저 8bit 로 실측하고, 흔들리면 PRMSL 만 예외로 RG 2바이트 + NearestFilter + 셰이더 4탭 수동 보간(2바이트를 LinearFilter 로 읽으면 바이트 경계에서 값이 깨진다).<br>· H/L: 8bit 값에서는 넓은 고기압이 고원이 되어 엄격 극값 판정(isobars.js:63-64)이 실패한다 → Lambda 가 실수 값에서 찾아 매니페스트에 싣는다. Lambda 실행시간에 더해지므로 공통 M 의 시간 예산에 포함.<br>· PRMSL 은 고지대에서 해면 환산 잡음이 크다 → 고지대 중심 미표기 + 라벨 예산. 임계 표고는 실측 뒤 결정(UNKNOWN).<br>· 라이선스: pressure-ea.json 은 Open-Meteo 다 → v2 과도기 경로를 만들지 않는다. 원안의 '동아시아만 즉시 가능'은 철회.<br>· 선행 의존: 01 Temperature 의 등치선 셰이더·라벨 배치기(P0)와 공용 프레임 저장소(main.js:1814-1844 에서 분리)가 먼저다. 이것 없이 단독으로 하면 M 이 아니라 L 이다.<br>· 02 Wind 는 P0 인데 이 토글은 P1 이다 → 그 사이 Inspector 에 죽은 토글을 두지 않는다(동작하는 날 나타난다).<br>· ECMWF 비교는 격자 수집기가 없어 별도 L 선행 → 그 전까지 PRO 가치는 '런 간 diff'로 채운다(이전 런 보존 여부 확인 필요). |
| **완료 기준** | · 02 Wind 에서 Pressure 토글을 켜면 흰 등압선이 4hPa 간격으로 그려지고 1000·1020hPa 선이 굵으며 선 위에 '1008' 같은 숫자가 읽힌다. 폰에서도 선이 계단지지 않는다.<br>· 저기압·고기압 중심에 'L 992' / 'H 1026' 이 찍히고, 같은 점을 클릭한 Inspector 값과 1hPa 안에서 맞는다. 티베트·남극 위에 H/L 글자가 무더기로 뜨지 않는다.<br>· 전지구 뷰로 물러나면 선이 8hPa 로 솎여 실뭉치가 되지 않는다. 타임라인을 재생하면 선이 끊김 없이 움직이고, 재생 중에는 선 라벨이 사라졌다가 멈추면 돌아온다.<br>· 범례에 '등압선 4 hPa · MODEL · GFS 0.5° · run/valid' 가 보이고, 기압 화면 어디에도 Open-Meteo 출처 문구와 5° 색면이 없다. |

#### 상층 수증기 · `weather.upper_moisture` — 합친다 · P2 · M

| | |
|---|---|
| **Before** | setCloud('gk2a:wv063')(main.js:4428)로 그린다. 천리안 6.3µm 영상을 구름 껍질에 흰 밝기 알파로 그리고 구름을 대체한다(배타). 1600×1600 원본(8.35km/px, aws/gk2a-clouds/handler.py:69)을 2048×1024 전지구 캔버스에 다시 그려(main.js:1486-1496) 원반이 약 683px(≈19.5km/px)로 줄어든다. 범례 없음. 라벨에 '10분 주기'가 하드코딩돼 있고(main.js:1517) 문구는 '제트기류와 기압골의 흐름이 보입니다'(:1506)라고 단정한다. 질문은 '상층 대기의 흐름은'(phenomenon-registry.js:778)인데 흐름(바람)은 그리지 않는다. |
| 돈 내는 사람 눈 | 실제 위성 수증기 영상이라 자료는 진짜고 기상에 관심 있는 사람에게는 흥미롭다. 그러나 흰 베일 한 장이 정지해 있을 뿐이라 메뉴가 약속한 '제트기류의 흐름'은 움직이지 않고, 전공자가 아니면 구름과 무엇이 다른지 알 수 없다. (B 손보면 된다) |
| 기준 사이트 | mapped.earth: AIR › TPW — 공기 기둥의 수증기 총량을 전지구 모델 색면으로, 쉬운 말 한 줄 설명. 6.3µm 위성 수증기 영상은 두 기준 사이트에서 확인되지 않았다(windy 위성 타일의 채널 구성은 UNKNOWN). EARTHUS 에서 TPW 에 대응하는 것은 천리안 영상이 아니라 GFS 의 PWAT 다. |
| **After** | [→ 04 Clouds › Satellite quick mode 의 채널 칩 '수증기 6.3µm'] 독립 메뉴 줄을 없앤다. 현상 id 와 레이어 id 'weather/cloud-wv' 는 그대로 둔다.<br>① 채널 칩은 위성 모드 안에서 배타다(적외 / 가시 / 수증기 중 하나). 원안의 '구름 위에 비배타로 겹친다'는 철회 — 수증기 영상은 원반 전체를 덮는 장이라(핸들러 주석 :108-109 '통째로 덮는 게 맞다') 겹치면 아래 구름이 가려질 뿐이다.<br>② 색 = 밝기온도 구간색, 값은 PNG 의 알파에서 읽는다<br>- gk2a 핸들러 ir 분기에서 회색은 clip(t×1.35)(:591-592)라 약 −52°C 아래가 포화한다. wv063 은 floor 0 · gamma 1(:110-112)이라 알파 = t(:618), 즉 밝기온도 = −25 − 37 × A/255 (°C) 선형이다. Lambda 수정 없이 된다.<br>- 구간(예: 5°C 간격, −25 … −60°C)을 셰이더에서 구간화. 따뜻한 쪽 갈색·주황 → 차가운 쪽 흰색·청록. 흰 구름 화면과 구분된다.<br>- 범례 단위는 °C(밝기온도)이고 '따뜻할수록 상층이 건조, 차가울수록 상층이 습하거나 높은 구름'이라 적는다. '습도'나 '수증기량'이라고 부르지 않는다.<br>- 가장자리: 서버 12px 페더(:667)와 클라이언트 3° 페더(main.js:1498-1500)가 알파를 깎아 원반 가장자리에 가짜 '건조' 띠가 생긴다 → 이 칩에서는 클라이언트 페더를 값에 쓰지 않고, 불투명도는 셰이더가 bbox 거리로 따로 준다.<br>- 해상도: 2048 전지구 캔버스에 다시 그리지 말고 1600² 원본을 bbox-UV 로 직접 매핑한다(8.35km/px 그대로).<br>③ 표기: 'OBS · GK2A 6.3µm · 관측시각(meta.json 의 at) · 동아시아 원반'. '10분 주기'를 하드코딩하지 않는다(gk2a-clouds 는 Lambda 비용 1위라 주기가 바뀔 수 있다).<br>④ 문구: '제트기류와 기압골의 흐름이 보입니다' → '따뜻한(어두운) 띠와 차가운(밝은) 띠의 배치'. '흐름'이라는 말은 02 Wind 후속의 250hPa 입자가 들어와 같이 켤 수 있을 때만 쓴다.<br>⑤ 시간: '지금'만. Global Timeline 을 1시간 이상 옮기면 기존 syncCloudToTime(main.js:5454-5474)이 gk2a* 모드를 GFS 예보 구름으로 바꾼다 — 이 동작이 '지금만'의 집행이다. 그때 칩은 비활성 + 사유('관측은 미래에 없다').<br>⑥ 가강수량(TPW) = [자리 없음 · PD 결정 필요]<br>- 권고: 03 Rain Inspector 의 보조 칩 '수증기량(TPW)'. 10mm 구간 단계색 + 등치선 10·20·30·40·50·60·70mm(v1 continuous-contours.js:35 와 동일 레벨). 'MODEL · GFS' 배지. 높은 TPW 만으로 비가 온다고 말하지 않는다(tpw-grid 주석 규칙).<br>- 자료는 tpw-ea.json 과도기 없이 바로 GFS 프레임의 PWAT(전지구 0.5° 41스텝)로 간다. 현재값 색면은 무료, 깊이(+120h·비교)가 유료. |
| 표현 | 단계색(위성 밝기온도, 관측) · TPW 는 단계색+등치선(모델) |
| 자료 | 수증기 칩은 지금 자료로 된다: clouds/gk2a/wv063.png(LA 2채널, FD 120°×120°, 1600², −25…−62°C 가 알파에 선형 — handler.py:69, :110-112, :591-592, :618). Lambda 변경 0. 캔버스를 거치면 premultiplied alpha 로 회색은 깨지지만 알파는 그대로다 — 그래서 알파를 읽는다. 과거 프레임은 없다(같은 키를 덮어쓴다).<br>TPW: aws/gfs-cloud-forecast 요청에 var_PWAT 만 추가. 레벨 lev_entire_atmosphere_(…)는 이미 켜져 있어(handler.py:105) NOMADS 쪽 추가는 메시지 1개다. fields_from_grib 에 분기(cat 1 · num 3 · lt 200)는 신규. 8bit 0~80mm → 0.31mm 눈금. 공통 'GFS 확장'(M)에 같이 넣는 것이 가장 싸다(스텝당 디코드 1개). NOAA GFS public domain.<br>기존 aws/tpw-grid(NOAA GFS 0.25° f000 → 1° 동아시아 20~55N·90~180E, eccodes 해독, wind/tpw-ea.json)는 v1 용으로 그대로 둔다. v2 는 읽지 않는다 — 분석장 한 장(f000)뿐이라 Global Timeline 을 못 따른다.<br>'상층 흐름' 질문에 바람으로 답하려면 02 Wind 후속의 250hPa u/v(M · P1)가 필요하다. 지금 저장소에 상층 바람 격자 수집기는 없다(gfs-cloud-volume 은 동아시아 구름 21층뿐, 바람 없음). |
| 재사용 | prototype/v2-three/js/main.js:1472-1519(loadGk2a — meta·bbox·세대 쿼리), :5454-5474(syncCloudToTime) · 01 Temperature 기준 구현체의 구간화 셰이더·등치선·범례 · prototype/js/continuous-contours.js:35(TPW 레벨) · prototype/js/contour-math.js(라벨 자리) · aws/gk2a-clouds/handler.py(변경 없음) · aws/gfs-cloud-forecast/handler.py(PWAT 분기 추가) · aws/tpw-grid/handler.py(v1 용 유지, 규칙 문구만 참조) |
| 무료 / 유료 | 무료: 위성 수증기 채널 칩(관측) + TPW 현재 색면.<br>EXPLORER: TPW +120h · 강수 색면과 겹쳐 보기 · 짧은 리포트('함께 나타난 조건'으로만 서술, 수치→출처→문장 순).<br>PRO: TPW 런 간 비교 → ECMWF 격자 확보 뒤 GFS\|ECMWF · export. |
| 걸리는 것 | · 원안의 '구간화는 셰이더에서'는 어느 채널을 읽는지 없었다. 회색은 −52°C 에서 포화하고(handler.py:592) 캔버스를 거치면 premultiply 로 깨진다 → 알파(= 선형 밝기온도)를 읽는다.<br>· 페더가 값을 오염시킨다(서버 12px + 클라이언트 3°) → 값과 불투명도를 분리한다. 서버 12px(약 100km) 띠는 남으므로 원반 가장자리 그만큼은 색을 칠하지 않는다.<br>· '고해상 색면'은 과장이었다: 원본 8.35km/px 를 v2 가 19.5km/px 로 줄여 그린다 → bbox-UV 직접 매핑으로 원본 해상도를 살린다. 폰 최대 텍스처 크기 안(1600²)이다.<br>· '비배타로 겹친다'는 그림상 의미가 없다(전면을 덮는 장) → 위성 모드 안의 배타 채널 칩으로.<br>· 정직성: 밝기온도는 습도가 아니다. 차가운 값은 상층 수증기일 수도 높은 구름일 수도 있다 → 범례 단위를 °C 로 두고 해석 문구를 한 줄로 제한, '제트기류가 보입니다' 단정 삭제.<br>· '10분 주기' 하드코딩(main.js:1517): gk2a-clouds 주기가 비용 절감으로 바뀌면 화면이 거짓이 된다 → meta.json 의 at 에서 읽는다.<br>· TPW 는 PD 정본 12메뉴에 자리가 없다 → PD 결정 필요(권고: 03 Rain 보조 칩). 결정 전에는 PWAT 를 공통 GFS 확장에 싣는 것까지만 한다(디코드 1개라 싸다).<br>· 원안의 'EXPLORER: TPW 칩'은 현재 시각화를 잠그는 방식이다 → 현재 색면은 무료로 열고 시간축·비교·리포트를 유료로. |
| **완료 기준** | · 04 Clouds 의 Satellite 모드에서 '수증기 6.3µm' 칩을 누르면 동아시아 원반이 갈색~청록의 단색 띠로 나뉘어 보이고, 범례에 °C 눈금과 'OBS · GK2A 6.3µm · 관측시각'이 나온다. 원반 가장자리에 가짜 갈색 테두리가 없다.<br>· 한반도까지 확대해도 수증기 영상이 지금 화면보다 또렷하다(원본 8km 급 화소가 보인다).<br>· Global Timeline 을 1시간 이상 옮기면 수증기 칩이 비활성으로 바뀌고 사유가 표시되며, 화면은 GFS 예보 구름으로 넘어간다. '지금'으로 돌아오면 칩이 되살아난다.<br>· (PD 가 TPW 자리를 승인한 경우) 03 Rain 에서 '수증기량(TPW)' 칩을 누르면 10mm 구간 단계색과 '30' '50' 같은 등치선 숫자가 전지구에 보이고, 범례에 'MODEL · GFS · run/valid'가 있으며 '비가 온다'는 문장은 어디에도 없다. |

<details><summary>반박 검증에서 뒤집거나 낮춘 것 (41)</summary>

- [기온] size L → XL. 원안은 Lambda 확장·단계색 셰이더·등치선·라벨·범례·°C/°F·Inspector 칩·Anomaly 탭·타임라인 연결·Open-Meteo 제거·문서 갱신을 L 하나에 담았다. 범례·Inspector·타임라인은 PD P0 Global Shell 의존으로 빼고, 850hPa·Compare·바람 입자 오버레이는 뒤로 미뤄도 자료 확장(M)+렌더러(L)+라벨·관측숫자·클릭값(M)이다.
- [기온] 등온선을 CPU 마칭스퀘어(contour-math.js)에서 셰이더 선으로 뒤집었다. 720×361 격자 × 11레벨을 키프레임마다 돌리면 모바일에서 끊기고, 3시간 프레임 blend 중에 색 경계와 선이 어긋난다. contour-math.js 는 2° 솎은 격자에서 라벨 자리 찾기 전용으로만 남긴다.
- [기온] 'EXPLORER 정확값 0.1°C'를 낮췄다. 8bit 0.5°C 눈금 + 0.5° 격자 평균에서 0.1°C 는 거짓 정밀이다. '16bit PNG' 선택지도 뺐다 — 브라우저가 8bit 로 내려 읽는다. 0.1°C 는 실측 지점값에만 쓴다.
- [기온] 관측 숫자는 타임라인이 '지금'일 때만 표시하도록 추가했다. 원안대로면 예보 시각 색면 위에 현재 관측 숫자가 남아 관측과 예보가 섞인다.
- [기온·강수·구름] 'GFS\|ECMWF Compare'를 paidHook 에서 blockers 로 내렸다. aws/ecmwf-ingest 는 격자가 아니라 ASOS 97지점 2t 점값이고(handler.py:49, 61-68), 정기 실행도 등록되지 않았으며(README:35-38), AEC 압축이라 eccodes 가 필요하다(handler.py:24-28). 격자 수집기는 별도 L 작업이다.
- [기온] 'Open-Meteo 직접 호출 제거(main.js:2925-2945)'는 한 곳이 아니라 5곳이다: main.js:1706, 2898, 2900, 2932, 3403. 가장 위험한 것은 1706 — GFS 매니페스트가 없을 때 Open-Meteo 로 물러나는 구름 폴백이다(→ 04 Clouds 로 배정).
- [기온·구름] 'gfs-cloud-forecast 실행 주기 UNKNOWN'을 해소했다: EventBridge 규칙 earthus-gfs-cloud-forecast, rate(3 hours)(tools/deploy-gfs-forecast.sh:67, schedules.sh 에는 없음). 실측 manifest: 41스텝 270.4초, 누락 0.
- [평년 대비] '당일 최고·최저가 없어 서버가 하루치를 누적해야 한다 / 이력은 archiver 적재부터'는 틀렸다. kma-aws store_history()가 이미 매시 지점값을 wind/series/stations/<날짜>.json 에 쌓고 760일 보관한다(aws/kma-aws/handler.py:62-64, 164-228). 선행 조건을 제거했다.
- [평년 대비] '평년값 지점 수 UNKNOWN(100곳 남짓)'을 83지점으로 확정했다(aws/kma-aws/intel_temp.py:44, 대구 143 없음). 실황은 'AWS'가 아니라 ASOS 97지점(kma_sfctm3)이다.
- [평년 대비] 비교 기준 '오늘 최고(지금까지) − 최고 평년, 오전엔 최저'를 뒤집었다. 오전의 '지금까지 최고'는 오늘 최고가 아니어서 가짜 음의 편차가 나온다. 저장소가 이미 정한 같은-것끼리 규칙(어제 하루 평균 − 평년 평균, 24회/8회 다 있을 때만 — intel_temp.py:8-14)을 기본으로 하고 '오늘(잠정)'은 18시 KST 이후에만 연다.
- [극값] '현재 기온의 최대·최소 탐색 + 단순 범위 검사'를 고쳤다. GTS 파일에 관측소가 보고한 tmax/tmin 이 이미 있고(aws/gts-global/handler.py:64, 280-281) sanity 필터도 서버에 있다(:109, :133). 다만 SYNOP 최고/최저는 기준 시간대가 지역마다 달라 '관측소 보고값' 표기가 필요하다.
- [극값] '최다 강수'를 전지구 GTS 에서 뽑는 안을 낮췄다. rn 의 누적 기간이 지점마다 달라 순위가 거짓이 된다 → 1단계는 한국 rnday 만. Open-Meteo 파생 모델 픽은 '배지 유지'가 아니라 유료 화면에서 제외로 바꿨다(air-grid 도 Open-Meteo 경유, aws/air-grid/handler.py:52).
- [강수] 'PRATE_HI 상한은 상수 1개'는 틀렸다. 클라이언트 복호 상수가 두 곳에 하드코딩돼 있다(precip-field.js:37, main.js:2012). manifest 수치 필드를 읽게 바꾼 뒤에만 올릴 수 있다. P1 로 내렸다.
- [강수] '한국 1h 실측은 서버가 누적해야 하고 이력 저장이 선행'은 틀렸다. 기상청이 rn15·rn60·rn12h·rnday 를 직접 준다(aws/kma-aws-min/handler.py:50, 194-195). v2 가 이 파일을 아직 안 쓸 뿐이다(참조 0건) — 클라이언트 작업으로 낮췄다.
- [강수] 'var_APCP 를 추가해 서버에서 합산'은 과소평가다. APCP 는 통계 구간 메시지(pdt 8)인데 파서는 pdt==0 만 받고(handler.py:164), f000 에 없으며, 하나라도 없으면 스텝을 버리고(:169-174), 스텝이 독립 빌드라 합산은 후처리여야 한다. 서버 M 으로 올리고 P1 로 내렸다. 칩 이름도 '앞으로 예상 누적(MODEL)'로 고쳤다 — 과거 누적이 아니다.
- [강수] P0 범위를 줄였다. 원안은 코어·누적·코어 contour·레이더 루프·AWS 마커·IMERG 를 한 P0 로 묶었다. P0 는 '1탭 즉시 색면·8칸 단색·범례·타임라인·껍질 높이'뿐이고 나머지는 P1/P2 다. 전체 size 는 L 유지.
- [강수] '현재 강우율' 칩 이름을 고쳤다. 실측으로 12Z 런이 22:10Z 에 게시돼 '지금' 프레임은 +6~12h 예보다. 0.1mm/h 문턱이면 지구의 15.1~17.1% 가 칠해진다(manifest wetGt01 실측) — 아래 두 칸의 불투명도를 낮추는 조건을 넣었다.
- [강수] 코어 contour 를 '10·20·50 등치선+숫자 라벨'에서 '셰이더 선 + 코어 최댓값 라벨'로 바꿨다. 0.5° 순간 강수는 듬성듬성한 장이라 등치선 라벨이 난삽해지고 50mm/h 는 격자 평균에서 거의 없다.
- [구름] '현재 미사용인 R·G 채널에 LCDC/MCDC/HCDC 를 담는다'는 틀렸다. c{step}.png 는 그레이+알파 2채널이고(handler.py:230-244, encode_png(...,4)) 독스트링 :21 은 옛 문구다. 1° RGB 별도 파일 l{step}.png 로 바꿨다(요청·해독 추가 0).
- [구름] 'aws/gfs-cloud-global-low 도 이미 있다'를 자료원에서 뺐다. v2 참조가 0건이고 09-03 기록상 eccodes 누락으로 배포된 적이 없다(현재 상태 UNKNOWN).
- [안개] '구간화는 셰이더가 한다'를 구체화했다. PNG 에는 원 BTD 가 아니라 단조 램프 알파(clip((BTD−1.5)/4.5)^0.9, handler.py:577-580)가 들어 있다 — 알파 문턱(약 0.37)으로 2단을 가르면 Lambda 변경 0 이다. 미보정 문턱(:158-159)을 범례 숫자로 단정하지 않도록 '미보정' 표기를 넣었다. '약 8km/px'는 확인하지 못해 UNKNOWN 으로 돌렸다.
- 바람: 상층 850/500/250hPa 를 P0 범위에서 뺐다(별도 M · P1 후속). 이유 — 이웃 결정의 공통 M 은 10m 만 포함하고, 고도마다 720×361 순수 파이썬 PNG 루프 ×41스텝이 270→900초 예산에 미실측으로 얹히며, fields_from_grib :160-163 이 levelValue 를 안 봐 구름 이류 바람을 덮는 버그가 생긴다. 원안 그대로면 크기는 L 이 아니라 XL 이다.
- 바람: 강도 3단 칩을 고정 숫자(6,000/12,000/18,000)에서 '기기 예산의 1/3·2/3·전부'로 바꿨다. 이유 — 고정 숫자는 모바일 상한 5,000 과 모순이고, 18,000 은 v1 실측 상한 4,200(windfield.js:25)의 4.3배로 미실측이다. 예산은 flowRenderBudget × ThermalGovernor particleScale 에 물린다.
- 바람: flow.js 재사용을 '예산 함수만'으로 낮췄다. 이유 — advectNormalized 는 x 를 0~1 로 clamp 해 날짜변경선에서 멈추고 cos(위도) 보정이 없으며 표본마다 Object.freeze 객체를 만든다. 구면 이류는 windfield.js(:275-288, :523, :567)를 이식한다.
- 바람: 'precip-field.js 방식의 구간화 셰이더'를 뒤집었다. 이유 — precip-field.js 의 rainRamp(:44-52)는 mix 연속 램프(그라데이션)이고 mediump 다. 재사용은 프레임 blend·구면 UV 구조뿐, 구간화 셰이더는 01 Temperature 기준 구현체에서 새로 쓴다.
- 바람: '0.5°에서 40~50 칸이 동심 과녁으로 읽힌다'를 미검증으로 낮췄다. 이유 — GFS 0.5° 는 태풍 중심을 무디게 담는다. 20~30/30~40 은 기대, 40~50·≥50 은 첫 프레임 실측 전 약속하지 않고 Inspector 에 공식 최대풍속을 병기한다.
- 바람: 꼬리 기법을 미결정에서 '월드 공간 이력 선분 권고 + 1일 스파이크'로 구체화했다. 이유 — v2 는 자동 회전이 기본(main.js:581,706)이라 v1 식 화면 공간 페이드(카메라가 움직이면 통째로 지움)는 첫 화면에서 꼬리가 안 보인다.
- 바람: 'v1 네 교훈 중 stepped'의 해석을 바로잡았다. v1 계약은 'stepped 를 주지 말라'(5°+nearest 가 550km 네모를 드러냄)였다. v2 에서는 0.5° 값을 보간한 뒤 구간화하므로 PD 규칙 4 와 양립한다.
- 바람: 프레임 전송량 'UNKNOWN'을 추정치로 바꿨다(1° RGBA 108KB 실측 → 0.5° RG 250~450KB 추정, 미실측 표기). 과도기용 wind-ea.json(Open-Meteo) 사용은 철회했다.
- 바람: Level·Model 을 P0 에서 칩이 아니라 고정 라벨로 낮췄다(선택지가 하나인데 칩으로 보이면 없는 선택을 있는 척한다). '강풍 알림'은 PD 정본 P2(alerts)로 옮겼다. '상층 고도 = EXPLORER'는 PD 결정으로 남겼다.
- 기압: '과도기에 pressure-ea.json 으로 동아시아만 즉시 가능'을 철회했다. 이유 — Open-Meteo 파생이고, PRMSL 은 공통 GFS 확장에 같이 오므로 과도기 구현은 버릴 코드 + 라이선스 노출이다.
- 기압: 스케줄 '1시간 주기(schedules.sh:38)'를 정정했다. R0 감사(:24)는 실제 EventBridge 규칙을 rate(3 hours)로 적는다(09-18 비용 절감). .sh 가 낡았다.
- 기압: 등압선을 'contour-math 로 선을 만든다'에서 '셰이더 선 + contour-math 는 라벨 자리 전용'으로 바꿨다(이웃 결정과 일치). 그에 따라 highp 필수(precip-field.js 는 mediump — fp16 은 1000hPa 부근 눈금 0.5~1hPa)와 8bit 양자화의 열대 흔들림 폴백(RG 2바이트 + Nearest + 수동 4탭)을 추가했다.
- 기압: H/L 중심 탐색을 브라우저(v1 extrema)에서 Lambda(실수 값)로 옮겼다. 이유 — 8bit 로 내려온 값에서는 넓은 고기압이 같은 값의 고원이 되어 엄격 부등호 판정(isobars.js:63-64)이 중심을 못 찾는다. 반경은 칸 수가 아니라 물리 거리(≈222km)로, 고지대 해면 환산 잡음은 미표기로 처리한다.
- 기압: '1° 평균으로 평활한 뒤 contour'를 '선은 0.5° 값 그대로, 필요하면 셰이더 몇 탭 평활(했으면 표기)'로 바꿨다. Lambda 의 순수 파이썬 평활은 실행시간을 먹는다. 1° 평균은 H/L 탐색에만 쓴다.
- 기압: PRO 가치가 ECMWF 격자(별도 L) 전에는 비어 있었다 → 'GFS 런 간 diff'를 과도기 Compare 짝으로 추가했다(이전 런 보존 여부 UNKNOWN). P1 은 유지하되 '자료는 P0 공통 M 과 같이 오고 P1 인 것은 렌더러뿐'임을 명시했다.
- 상층 수증기: 구간화가 읽을 채널을 회색에서 알파로 바꿨다. 이유 — 회색은 clip(t×1.35)(gk2a handler.py:592)라 −52°C 에서 포화하고 캔버스 premultiply 로 깨진다. wv063 은 floor 0·gamma 1 이라 알파 = 선형 밝기온도(−25…−62°C, :110-112, :618)다. 범례 단위도 '건조/습윤'에서 °C(밝기온도)로 바꿨다.
- 상층 수증기: '구름 위에 비배타로 겹친다'를 뒤집어 위성 모드 안의 배타 채널 칩으로 했다. 수증기 영상은 원반 전체를 덮는 장이라 겹치면 아래가 가려질 뿐이다.
- 상층 수증기: renderType '고해상 색면'을 낮췄다. 원본은 8.35km/px(1600² / 120°)이고 v2 는 2048 전지구 캔버스를 거쳐 19.5km/px 로 줄여 그린다(main.js:1486-1496) → bbox-UV 직접 매핑을 After 에 넣었다. 페더(서버 12px + 클라이언트 3°)가 값을 오염시키는 문제와 '10분 주기' 하드코딩(main.js:1517)도 추가로 잡았다.
- 상층 수증기: TPW 과도기(tpw-ea.json, 1° 동아시아 f000 한 장)를 v2 에서 건너뛰고 바로 GFS 프레임의 PWAT 로 가게 했다 — 분석장 한 장은 Global Timeline 을 못 따르고, PWAT 는 레벨이 이미 켜져 있어(handler.py:105) 메시지 1개 추가로 끝난다. 또 'EXPLORER: TPW 칩'(현재 시각화를 잠금)을 '현재 색면은 무료, 시간축·비교가 유료'로 바꿨다.
- 상층 수증기: '시간 — WV 칩은 지금만'에 집행 수단을 붙였다. 기존 syncCloudToTime(main.js:5454-5474)이 gk2a* 모드를 1시간 이상 이동 시 GFS 로 바꾸는 동작을 그대로 쓰고, 칩을 비활성+사유 표기로 한다.

</details>

### 4-2. 바다

> 【입력 잘림】 개선안 JSON 은 ocean.bathymetry 의 dataNeed 중간("…GEBCO 0.1° 최심 격자…가 수심 구간")에서 끊겨 도착했다. MENU_GROUPS 'sea' 구성원(phenomenon-registry.js:1071-1074)은 11개인데 받은 것은 8개다. bathymetry 는 보이는 부분만 검증했고, trench·deep_sea·vessel_traffic 3종은 제안서 없이 레지스트리와 코드로 최소 항목을 재구성했다(제안자가 뭐라고 썼는지는 지어내지 않았다). 여기에 묶음에서 유일하게 P0 급인 '육지 덮임 핫픽스'를 별도 항목(ocean.common.land_mask_hotfix)으로 떼어 총 12항목.<br>> 【총평】 목표 화면(PD 05 Ocean)은 그대로 둔다. 제안서의 약점은 셋이다. (1) 바다가 자기 렌더러를 따로 짜려 했다 — PD 우선순위상 P0 Temperature 가 기준 구현체이고 P1 Ocean 은 그 '공통 renderer contract'의 소비자다. 입자도 P0 Wind 렌더러를 공유한다. 그래서 바다 묶음의 크기는 렌더가 아니라 '자료 확보'가 결정한다. (2) 자료 확보가 과소평가됐다 — 파고(L→XL)와 해류(L, 임계 경로)는 새 수집기 없이는 한 픽셀도 못 그린다. (3) 실제 값 분포를 보지 않고 구간을 정했다 — KHOA 해수면은 시나리오 안 폭이 3~7cm 라 10cm 구간이면 한 색 평면이 된다.<br>> 【권고 순서】 0) 육지 덮임 핫픽스(P0·S, 즉시) → 1) SST+SSTA(P0 렌더러 직후, 자료는 NOAA OISST 라 라이선스 깨끗) → 2) 바다 실측 마커·pick(자료 준비 완료, 한국 먼저, 무료 안전 가치) → 3) 해류 수집기 + 라이선스 확인(SST 작업과 병행 착수 — PD 의 'Currents 기본 ON' 때문에 05 Ocean 이 콘셉트와 같아지는 임계 경로) → 4) 파고 A-1 ECMWF → A-2 GFS-Wave → 5) P2: 등심선 라벨·구간색, Argo, 해수면 전망, 메뉴 정리(해구·심해·선박).<br>> 【시안 모델명 vs 저장소 수집기(aws/ 확인)】 GFS: gfs-cloud-forecast·tpw-grid·gfs-cloud-volume 있음(구름·가강수량·층 자료) — 파랑은 없음. ECMWF: ecmwf-ingest 있음(CC-BY-4.0, .index Range + eccodes) — 단 2t 하나·97지점 채점용, 격자·파랑 없음. '기관 수집기 있음 ≠ 변수 수집기 있음'. CAMS·JTWC·CMIP6 는 이 묶음 범위 밖. 해류는 어떤 수집기도 없음.<br>> 【본 세션에서 외부 확인한 것 3건】 NOMADS gribfilter ds=gfswave(격자·변수 목록) / NOAA CoastWatch ERDDAP noaacwBLENDEDNRTcurrentsDaily(0.25°, u·v, ~2026-09-17, 사용 문구) / ECMWF open data 파랑 파라미터·0.25°·CC-BY-4.0. 그 밖의 외부 사실(RTOFS 배포 형태, OSCAR, Copernicus Marine, mapped.earth·windy 메뉴 구성)은 본 검증에서 확인하지 않았다 — UNKNOWN 또는 '제안서 기준'.<br>> 【라이선스 노출】 이 묶음에서 Open-Meteo 에 서 있는 것: marine-grid(5° 파고·너울·해류) · marine-ea(0.5° 동아시아) · 브라우저 직접 호출 2곳(main.js:2898-2900, 3403). 묶음 밖이지만 같은 노출: hobby/surf·hobby/fishing(registry:251,361 — Open-Meteo Marine 조위/파랑). SST/SSTA 는 NOAA OISST 라 깨끗하지만 수집이 marine-grid 한 함수에 Open-Meteo 호출과 묶여 있다 → OISST 전용 함수로 분리해야 Open-Meteo 정리 때 수온이 같이 멈추지 않는다.<br>> 【단일 타임라인과 바다의 시간 성질】 한 화면에 시간 성질이 다른 레이어가 겹친다 — SST/SSTA 는 일별 관측(관측일이 1~수일 전, 과거만) · 해류는 일별 분석장(D-3, 과거만) · 파고는 모델 예보(미래 3h 스텝) · 실측은 10~20분 · 해수면 전망·등심선은 시간축 없음. Global Timeline 은 하나로 두되 레이어마다 '이 시각에 가장 가까운 자료 시각'을 범례·Inspector 에 따로 적어야 한다. 타임라인이 '지금'인데 SST 는 이틀 전, 해류는 사흘 전이라는 사실을 숨기면 정직성 규칙 위반이다. 이력은 sst-global·kma-buoy 모두 0건(archiver/handler.py:633-642, :205) — '재생' 훅은 백필·적재 뒤에만 판다.<br>> 【성능】 three r184(WebGL2 전용) — half-float 값 텍스처 선형 필터 사용 가능. EARTH_FRAG 는 이미 샘플러 9개(main.js:194-195, 277-302) — 바다 색면을 지구 셰이더에 합성하면 10~11개(WebGL2 최소 16 안쪽), 별도 껍질 ShaderMaterial 이면 3~4개. 지구 위 숫자 라벨은 Sprite 1개=드로우콜 1 → 레이어당 상한(등치선 24, 관측 마커 40)과 충돌 솎기 필수. 입자는 모바일 5,000 예산 공유 — 해류 입자와 파면 glyph 를 동시에 켜면 합산 예산으로 나눈다.<br>> 【PD 결정 필요 목록】 SSTA·파고·해류·수심의 구간값(정본에 없음) / 바다 등심선 간격 표 / Argo 의 자리 / 해수면 전망의 자리 2건(무료 1장, Simulation 공간에 기관 전망) / khoaflood 편입 / hobby/trench·hobby/dive 의 자리 / 선박 줄 제거 / 새 파랑·해류 격자가 뜰 때까지 5° Open-Meteo 색면의 처리(R0 감사 D-OM1·D-OM2).

#### 바다 색면 3종 공통 — 육지 덮임 핫픽스 (수온·평년 대비 수온·파고) · `ocean.common.land_mask_hotfix` — 고친다 · P0 · S

| | |
|---|---|
| **Before** | buildField 가 바다 격자 3종(sstfield·wavefield·sstanom)을 반지름 1.0012 고정 구 껍질에 MeshBasicMaterial 로 칠한다(live-layers.js:1113). 지형은 max(h,0)/R×과장 으로만 솟으므로(main.js:270) 과장 50×에서 해발 약 153m 이하 육지가 껍질 아래에 놓여 덮이고, 저해상 캔버스 + LinearFilter(live-layers.js:1108-1109)가 해안 밖으로 색을 번지게 한다. PD 가 본 '육지가 잠김'은 이 버그다. 제안서는 이것을 SST 재작성(M) 안에 묻어 두었다. |
| 기준 사이트 | mapped.earth · windy 모두 바다 변수 색면이 해안선에서 끊긴다(육지를 덮지 않는다). 기준 사이트와의 격차 중 유일하게 '버그'인 항목. |
| **After** | 렌더러 재작성을 기다리지 않고 먼저 고친다. 선택지 셋(판정은 구현자): (가) CPU 마스크 — buildField 캔버스를 0.25°급(1440×720)으로 키워 기존 색 캔버스를 확대해 그린 뒤, 픽셀마다 heightAtJs(main.js:2707 — LiveLayers 가 이미 생성자로 받는다 main.js:3132) ≥ 0 이면 알파 0. 셰이더 변경 0, 함수 하나 안에서 끝난다. 해안 정밀도는 z4 9.8km/px. (나) EARTH_FRAG 합성 — 색 텍스처를 지구 프래그먼트 셰이더에 넘겨 h<0 에서만 섞는다(등심선 main.js:506 과 같은 자리, coast=smoothstep(-15,15,h) main.js:384 재사용). 껍질과 과장 불일치 자체가 사라지고 디테일 창(z5~z9) 해안선을 따른다. 샘플러 9→10개. (다) 껍질을 ShaderMaterial 로 바꿔 uHeightMap/uDetailMap 을 공유하고 육지 프래그먼트를 discard — P1 공통 렌더러가 갈 길과 같다. 권고: (가)로 즉시 막고 (다)를 P1 렌더러에서 정식화. 선형 그라데이션 폐기는 이 핫픽스 범위 밖이다(그건 P1). |
| 표현 | 색면(기존 유지) + 육지 마스크 |
| 자료 | 새 자료 없음. 지구본이 이미 가진 Terrarium z4 고도맵(9.8km/px)과 heightAtJs. |
| 재사용 | prototype/v2-three/js/live-layers.js:1072-1121(buildField) · main.js:2707(heightAtJs)·3132(LiveLayers 생성자 인자) · main.js:384,506(EARTH_FRAG 의 coast·h<0 조건) · main.js:193-255(TERRAIN_GLSL) |
| 무료 / 유료 | 없음 — 결제 이전의 신뢰 문제. 이 버그가 보이는 상태로는 어떤 요금제도 설득되지 않는다. |
| 걸리는 것 | · 해수면 아래 육지(간척지·내륙 함몰지)가 h<0 으로 읽혀 바다로 칠해질 가능성 — 본 세션 미검증. 해법: 격자의 null(육지) 칸은 지금도 알파 0(live-layers.js:1092)이므로 '값 있음 AND h<0' 두 조건을 함께 건다.<br>· z4 고도맵 해안선은 9.8km/px — 확대하면 해안을 따라 칠해지지 않는 얇은 띠가 남는다. 지금의 5° 칸(555km)+번짐보다 수십 배 낫다고 적고, 정밀 해안은 (나)/(다)에서 푼다.<br>· 1440×720 캔버스에서 heightAtJs 약 100만 회 — 모바일 소요 시간 UNKNOWN. 해법: 마스크 캔버스를 1회 만들어 3종이 공유(캐시). |
| **완료 기준** | · 수온·파고·평년 대비 수온을 각각 켜고 서해안·낙동강 하구·방글라데시 해안을 확대해도 육지 위에 색이 칠해지지 않는다.<br>· 지형 과장을 1×와 50×로 바꿔도 해안 밖 육지에 색면이 보이지 않는다.<br>· 색면을 켠 채 지구를 돌릴 때 모바일에서도 프레임이 눈에 띄게 떨어지지 않는다. |

#### 해수면 온도 · `ocean.sst` — 다시 만든다 · P1 · M

| | |
|---|---|
| **Before** | NOAA OISST 1° 관측 분석장(바다 묶음에서 자료는 최상)을 r=1.0012 고정 구 껍질에 rampFrom 선형 보간 + LinearFilter 로 칠해(live-layers.js:573,1072-1121,2957) 난류·한류 경계가 서지 않고 저지대 육지까지 덮는다. 범례·등온선·시간축 0. |
| 돈 내는 사람 눈 | 바다 묶음에서 자료는 가장 좋다(관측 · 1° · 매일 · NOAA). 그런데 화면은 매끈한 무지개 그라데이션이라 난류·한류의 경계가 선으로 서지 않고, 확대하면 색면이 해안 육지 위까지 번져 잠긴 것처럼 보인다. (D 망가져 보인다) |
| 기준 사이트 | mapped.earth OCEAN › SST · SST HD — 색면 라디오 + 상시 범례 + 자료 시각 상시, 그 위로 Currents 입자. windy 의 수온 항목은 제안서도 UNKNOWN 으로 남겼고 본 검증에서도 확인하지 않았다 — UNKNOWN. mapped.earth 'SST HD'의 원천 자료가 무엇인지도 UNKNOWN(OISST 0.25°와 같은 급이라는 근거 없음). |
| **After** | [→ 05 Ocean · SST 탭 = 바다 기본 화면] 목표 화면은 PD 정본 그대로(10단 <0·0~4·4~8·8~12·12~16·16~20·20~24·24~28·28~32·≥32°C, 흰 등온선 + 지구 위 숫자 라벨, Contour 토글, 우측 Inspector, 상시 범례). 도달 경로만 고친다. ① 자체 셰이더를 새로 짜지 않는다 — P0 Temperature 의 단계색+등치선 렌더러(기준 구현체)의 두 번째 소비자가 된다. 바다가 더하는 것은 구간표·'바다 마스크' 옵션·결측 처리 셋뿐. ② 값 텍스처 함정: 육지 null(지금은 live-layers.js:1092 가 건너뛰는 칸)을 센티넬로 넣고 선형 보간하면 모든 해안에 가짜 구간 띠가 선다 → 2채널(값×유효, 유효) half-float 텍스처(three r184 = WebGL2 전용이라 half-float 선형 필터가 코어)로 올려 셰이더에서 값÷유효로 복원, 유효<0.5 는 버린다. ③ 육지 마스크는 sampleHeight(디테일 창 포함, main.js:224-234,344)<0 AND 유효. 제안서가 든 등심선은 선을 5탭 평활값 displacementHeight 로 긋는다(main.js:508) — 마스크에는 평활값이 아니라 sampleHeight 를 쓴다. ④ 등온선은 셰이더 fwidth 선(등심선 문법). '어느 줌에서도 매끈한 곡선'은 철회 — 쌍선형 값의 등치선은 칸 경계에서 꺾인다. 4탭 bicubic 샘플로 완화하고, 간격 칩 4°C(기본 — 구간 경계와 일치)/2°C/1°C 중 1°C 는 0.5° 이상 자료 + 화면상 선 간격 26px 이상일 때만 켜진다. 그 밖에서는 칩이 스스로 2°C 로 올라가고 그 사실을 범례에 적는다. ⑤ 자료는 1° 솎음판 대신 전지구 0.5° 한 장(720×321, 같은 OISST 원격자 2칸 간격)을 값 PNG 로 — 동아시아 0.5° 조각과 해상도가 같아져 SST·SSTA 모두 '전지구↔동아시아 전환'이 필요 없어진다. OISST 수집은 지금 Open-Meteo 호출과 한 Lambda(marine-grid)에 묶여 있으므로 전용 함수로 떼어 낸다 — Open-Meteo 정리 때 수온이 같이 멈추지 않게. ⑥ Inspector 값은 보간값이 아니라 '가장 가까운 원격자 칸 값'과 칸 크기(약 55km)를 함께 — 격자값을 지점값처럼 말하지 않는다. 관측일은 '오늘'이 아니라 OISST 실제 관측일(수집기가 최대 8일 뒤로 물러난다 marine-grid/handler.py:188). vs Normal 은 SSTA 전지구 격자가 생긴 뒤에야 전지구, 그 전에는 동아시아 상자 밖 '평년값 없음'. 배지 '관측 분석장(위성+부이) — 예보 아님'. ⑦ 지구 위 숫자 라벨은 Sprite 최대 24개(라벨 1개=드로우콜 1, seafloor.js 의 라벨 충돌 솎기 :250-256 문법). 앵커는 contour-math.js 마칭 스퀘어를 0.5° 격자에 1회. ⑧ Global Timeline: 일별 관측 — 과거 방향만. 이력이 0건(archiver/handler.py:633-642 EXPECTED·collect 에 sst-global 없음)이라 재생은 OISST 연도 파일 백필 작업 뒤. ⑨ 'SST HD 0.25°'는 PRO 훅에서 내린다 — OISST 는 0.25° 격자의 분석장이라 'HD' 표기가 과장이고 92만 값 ASCII 당김은 미검증. P2 로 분리, 이름은 '0.25° 원격자'. ⑩ Intelligence 는 수치→출처→문장 순, 문장은 '함께 나타난 조건'만. |
| 표현 | 단계색+등치선 (P0 공통 렌더러 + 바다 마스크) |
| 자료 | 1°는 지금 된다(ocean/sst-global.json 360×161, marine-grid/handler.py:63-67). 권고 0.5° 전지구: 같은 PSL THREDDS OPeNDAP 에서 2칸 간격 — 약 23만 값. 현행 1° 당김(5.8만 값, timeout 90초 marine-grid/handler.py:139)의 4배라 응답 시간 UNKNOWN, marine-grid 에는 timeout-seconds.txt 도 없어 Lambda 제한시간 UNKNOWN → 위도 띠 분할 또는 .dods 이진. 값 PNG 작성기는 aws/gfs-cloud-forecast/handler.py:195-207 encode_png 재사용 가능하나 8비트 전용 → 값을 2채널 16비트로 포장하고 알파 채널은 쓰지 않는다(캔버스 premultiply 가 값을 망친다 — RGB 색유형 2). 이력: 백필 Lambda 1회 + 하루 1장 추가. NOAA OISST = public domain, Open-Meteo 무관. |
| 재사용 | P0 Temperature 단계색+등치선 렌더러(선행 산출물) · main.js:193-255 TERRAIN_GLSL(sampleHeight·mercatorUV) · main.js:501-521(등심선 fwidth·줌 적응 문법) · prototype/js/contour-math.js + gridmath.js(라벨 앵커) · seafloor.js(makeLabel·라벨 충돌 솎기) · aws/marine-grid/handler.py:137-219(OISST 당김) + intel_sst.py · aws/gfs-cloud-forecast/handler.py:195-207(encode_png) |
| 무료 / 유료 | 무료: 관측일의 구간색+등온선+범례+클릭 칸 값 — 그 자체로 완성된 그림. EXPLORER: 정확값·관측일·출처·평년 대비(전지구 편차 격자 후)·한국 3해역 짧은 리포트(aws/marine-grid/intel_sst.py 패킷 재사용). PRO: 이력 재생(백필 후) · 작년 같은 날 wipe/diff(10 Compare) · export. 'HD'는 훅에서 제외. |
| 걸리는 것 | · P0 Temperature 렌더러·Right Inspector·상시 범례·Global Timeline 이 선행. 이것 없이 단독 착수하면 M 이 아니라 L 이고 같은 렌더러를 두 번 만들게 된다 → P0 렌더러 계약에 '마스크 옵션·결측 채널'을 처음부터 넣는다.<br>· 결측 센티넬 보간 함정 → 값×유효 2채널 + 유효 임계로 해결.<br>· 0.5° 전지구 ASCII 당김 시간 미검증 → OISST 전용 함수 분리 + 위도 띠 분할.<br>· 이력 0건 → 백필 전에는 타임라인 과거 구간을 회색으로 두고 '이력 수집 시작일'을 적는다.<br>· 1°C 등온선은 열대 약경도 해역에서 분석장 잡음을 따라 구불거린다 → 줌·해상도 조건부 칩. |
| **완료 기준** | · 전지구 시점에서 쿠로시오·멕시코 만류의 수온 경계가 색 구간의 또렷한 경계로 보이고 범례 10단과 색이 일치한다.<br>· 한반도 확대 시 20°C·24°C 등 4°C 간격 흰 등온선과 숫자 라벨이 보이고, 선이 격자 모양 계단으로 보이지 않는다.<br>· 서해안·남해안을 확대해도 육지 위에 수온 색이 없다.<br>· 바다를 한 번 클릭하면 Inspector 에 수온(°C)·칸 크기·관측일·NOAA OISST·'관측 분석장' 배지가 함께 뜬다. |

#### 평년 대비 수온 · `ocean.sst_anomaly` — 합친다 · P1 · M

| | |
|---|---|
| **Before** | 동아시아 0.5° 직사각형 조각(23–47N·114–150E, 49×73칸 — marine-ea/handler.py:166-168)만 발산형 선형 그라데이션으로 칠해(live-layers.js:592,2999) 지구본에서 잘린 패치로 보이고 +2°C 경계가 서지 않으며, 범례·등치선·시간축이 없고 REFRESH_MIN 에도 빠져 있다(live-layers.js:344-349). |
| 돈 내는 사람 눈 | '평년보다 몇 도 뜨거운가'는 질문 자체가 유료 가치가 있고, 발산형 색과 0 근처를 비우는 설계도 옳다. 다만 동아시아 네모 조각만 칠해져 지구본에서는 잘린 패치로 보이고, 그라데이션이라 +2°C·+4°C 경계가 서지 않는다. (D 망가져 보인다) |
| 기준 사이트 | mapped.earth OCEAN › SSTA — 전지구 색면 + 상시 범례. windy 는 UNKNOWN. |
| **After** | [→ 05 Ocean · SSTA 탭(PD 'SST \| SSTA'), 독립 메뉴 줄 폐지] ① SST 렌더러에 구간표만 교체: ≤−3 · −3~−2 · −2~−1 · −1~−0.5 · [−0.5~+0.5 칠하지 않음] · +0.5~+1 · +1~+2 · +2~+3 · ≥+3°C(PD 정본에 값 없음 — PD 확인). 현행 '0 근처를 비우는' 취지(\|v\|<0.25 칠하지 않음, live-layers.js:2999) 유지. ② 등치선 ±1·±2·±3°C, +2°C 이상은 굵게 + 지구 위 라벨 '+2°C'. ③ 제안서의 '확대 시 0.5° 자동 전환'은 철회 — 두 해상도 텍스처의 이음매가 상자 경계에 서고 전환 로직만 늘어난다. SST 와 같은 전지구 0.5° 한 장에서 같은 칸끼리 (일별 − 1991–2020 같은 날 평년)을 빼 한 파일로 만든다. marine-ea 의 동아시아 조각은 전환 완료 후 폐기. ④ 육지 마스크·Inspector(편차 ±°C·오늘 수온·평년값·관측일·출처·'관측' 배지)·Global Timeline(과거 방향 일별)은 SST 와 공유. ⑤ REFRESH_MIN 등록. ⑥ 문장은 '평년보다 +2.3°C'까지만 — 원인(엘니뇨·고기압 등)을 붙이지 않는다. |
| 표현 | 단계색+등치선 (SST 렌더러에 발산형 구간표) |
| 자료 | 동아시아 0.5°는 지금 된다(ocean/sst-anom-ea.json). 전지구는 새 출처 0 — NOAA OISST 1991–2020 일별 평년(marine-ea/handler.py:46-47 OISST_NORMAL)을 SST 와 같은 색인으로 한 번 더 당겨 빼면 된다. 평년 색인이 doy=min(364,step)(marine-ea/handler.py:180)이라 윤년 2월 29일 이후 하루 어긋난다(2028년 전 수정, 영향 미미). 전지구 23만 값 당김 시간은 SST 와 같이 UNKNOWN. NOAA public domain. 이력 저장 0건도 SST 와 같음. |
| 재사용 | ocean.sst 공통 렌더러·수집 함수 전부 · aws/marine-ea/handler.py:44-47,159-201(편차 계산 — 같은 격자끼리만 뺀다는 원칙 포함) · live-layers.js:2999(0 근처 비움 규칙) |
| 무료 / 유료 | 무료: 관측일의 전지구 편차 구간색 1장+범례. EXPLORER: 지점 편차 정확값·평년값·출처 + 한국 3해역 평년 대비 리포트. PRO: 편차 시계열 재생(이력 적재 후) · 작년 대비 diff · 기준(+2°C 등) 도달 알림 · export. |
| 걸리는 것 | · ocean.sst 렌더러와 0.5° 전지구 수집이 선행 — 그 뒤라면 렌더 쪽은 구간표 교체뿐이다.<br>· PD 정본에 SSTA 구간값이 없다 → 제안 구간 PD 확인.<br>· 전지구 평년 당김(23만 값) 시간 미검증 → SST 와 같은 띠 분할. |
| **완료 기준** | · SSTA 탭에서 전지구가 잘린 사각 조각 없이 칠해지고, ±0.5°C 이내 해역은 칠해지지 않는다.<br>· +2°C 이상 해역이 굵은 등치선과 '+2°C' 라벨로 구분된다.<br>· SST↔SSTA 탭 전환 시 카메라·타임라인·Inspector 선택 위치가 유지되고 범례만 바뀐다.<br>· 클릭하면 편차·오늘 수온·평년값(1991–2020)·관측일이 한 Inspector 에 나온다. |

#### 파고와 너울 · `ocean.wave` — 다시 만든다 · P1 · XL

| | |
|---|---|
| **Before** | Open-Meteo Marine 5° 격자(한 칸 555km, marine-grid/handler.py:49,53)를 r=1.0012 껍질에 선형 그라데이션으로 칠해 얼룩처럼 보이고 저지대 육지를 덮는다(live-layers.js:574,1113). 받아 둔 파향·너울·주기는 그리지 않고 ocean/marine 진입은 안내문 한 장이다(main.js:4451-4453). 바다 클릭 지점값과 3일 시계열은 브라우저가 Open-Meteo 를 직접 부른다(main.js:2898-2900, 3403). |
| 돈 내는 사람 눈 | 한 칸 555km 짜리 물감 번짐이 바다 위에 떠 있고, 확대하면 해안 저지대까지 색이 덮는다. 파향·너울·주기는 그림에 없고 어디가 몇 m 인지 읽을 눈금도 없어 파고 지도라기보다 얼룩으로 보인다. (D 망가져 보인다) |
| 기준 사이트 | mapped.earth OCEAN › Waves · Wave period — 색면 라디오·상시 범례·모델/자료 시각 상시. windy '파도' — 입자 애니메이션 토글, 상시 타임라인, 단위 있는 상시 범례, 태풍이 색면에서 과녁으로 즉시 읽힌다. |
| **After** | [→ 05 Ocean · Waves 칩] 목표 화면 유지(구간색 + 기준선 + 방향·높이 glyph + 파고·너울 별도 수치). 도달 경로를 둘로 쪼갠다. 【A 자료 확보 — 선행】 A-1 ECMWF 오픈데이터 파랑을 먼저: 본 세션에서 ECMWF 공개 페이지로 확인 — swh·mwd·mwp·pp1d·mp2, 0.25°, CC-BY-4.0(상업 이용·재배포 허용, 출처 표기). 해독 경로가 이미 운영에서 입증됐다(ecmwf-ingest 가 같은 eccodes 2.42.0 wheel 로 5.42 AEC 를 푼다 — deploy-grib-python.sh:78). 단 ecmwf-ingest 는 2t 하나를 97지점에서만 뽑는다(handler.py:64 PARAMS=['2t']) — 격자 프레임 출력은 신규. ECMWF 공개 목록에 너울 분리 변수는 없다 → A-1 만으로는 '유의파고\|주기' 칩과 평균파향 glyph 까지. A-2 NOAA GFS-Wave 로 너울 칩과 두 번째 모델을 채운다: 본 세션 NOMADS 확인 — gribfilter ds=gfswave, global.0p25·global.0p16, HTSGW·DIRPW·PERPW·SWELL·SWDIR·SWPER·WVHGT. 패킹 템플릿 UNKNOWN — grib2lite 는 5.40 을 거부하고(grib2lite.py:8,169) eccodes wheel 의 JPEG2000 지원 여부는 저장소에서 확인 불가 → 시험 다운로드 1회가 첫 작업. 출력은 값 PNG 프레임 + 매니페스트(clouds/gfs-fc 구조), 전지구 0.5°(2칸 솎음, 720×361)로 시작 — 5° 대비 10배라 등치선이 합법이 되고 프레임 크기·Lambda 시간이 준다. 0.25°는 PRO 확대용으로 뒤에. 【B 렌더】 ① 구간색 m: <0.5·0.5~1·1~2·2~3·3~4·4~5·5~7·7~10·≥10(PD 정본에 값 없음 — PD 확인) — P0 단계색 렌더러 + 바다 마스크. ② 3m·5m 선만 굵게 + 라벨, 범례에 '모델 예보의 기준선 — 특보 발효 여부는 기상청 발표만'. ③ glyph 는 P0 Wind 입자 렌더러의 인스턴스 1드로우콜에 호(弧) 스프라이트만 교체, 모바일 5,000 예산(flow.js flowRenderBudget). 파향의 방향 규약(오는 쪽/가는 쪽)은 변수별 UNKNOWN — 수집기에서 '진행 방향'으로 고정하고 시험으로 못 박는다(해류 cdir 은 '흘러가는 쪽' live-layers.js:1769). 이동 속도∝주기는 표현이며 실제 파속 축척이 아님을 범례에. ④ Inspector: 유의파고·평균파향·주기(+A-2 뒤 너울 높이/주기/방향)·Model·run/valid·'모델 예보' 배지·[부이 실측과 비교] 1급 버튼(지금은 카드 속 동선 main.js:4681-4685). ⑤ 브라우저 직접 Open-Meteo 호출 두 곳을 프레임 격자점 값으로 교체. ⑥ Timeline 미래 방향 3h 스텝, 새 슬라이더 없음. ⑦ ocean/marine 안내 카드 삭제, ocean/typhoonsim 은 12 Simulation 으로(VISUALIZATION_ONLY 배지 유지). 【그 사이】 새 격자가 뜰 때까지 5° Open-Meteo 파고 색면은 유료 레일에 올리지 않는다 — 핫픽스로 육지 덮임만 막고 무료·'모델' 배지로 두거나 내린다(R0 감사 D-OM1/D-OM2 PD 결정). |
| 표현 | 단계색+등치선 + 입자장(파면 glyph) |
| 자료 | 지금 자료로는 안 된다 — Open-Meteo Marine 5°는 비상업 조항 위험(docs/R0-OPEN-METEO-AUDIT-2026-09-20.md 감사표 marine-grid·marine-ea 행, '없는 것: 파랑(WW3/ECMWF wave)')이고 등치선 금지 해상도다. A-1 ECMWF wave(CC-BY-4.0, 0.25°): 파랑 파일의 .index 존재 여부 UNKNOWN(ecmwf-ingest 의 Range 방식이 이것에 의존), 공개 지연 약 8시간(ecmwf-ingest RUN_DELAY_H=8), 보존 2~3일. A-2 NOAA GFS-Wave(public domain): NOMADS 변수·지역 필터(aws/tpw-grid 패턴, URL 형식은 다름), 패킹 UNKNOWN. 값 PNG 는 gfs-cloud-forecast encode_png(8비트 전용 → 2채널 16비트 포장, 알파 금지). |
| 재사용 | aws/ecmwf-ingest/handler.py(.index Range + eccodes) · aws/deploy-ecmwf.sh · aws/tpw-grid/handler.py(NOMADS 필터 + ecCodes) · aws/deploy-grib-python.sh · aws/gfs-cloud-forecast/handler.py(프레임·매니페스트·encode_png :195-207) · prototype/js/earthus2/v02/visual/flow.js(sampleVectorGrid·advectNormalized·flowRenderBudget) · P0 Wind 입자 렌더러 · P0 단계색 렌더러 · main.js:4681-4685(marine-buoys 동선) |
| 무료 / 유료 | 무료: 현재 시각 파고 구간색 + glyph + 3m/5m 기준선 + 범례 + 클릭 기본 파고(안전 기준선은 무료). EXPLORER: 너울·주기·파향 정확값 + run/valid·출처 + 내 해역 부이 실측 대조 + 짧은 리포트. PRO: 타임라인 전체 길이(무료 +24h) · Compare GFS-Wave \| ECMWF-WAM(유의파고·평균파향·평균주기만 — ECMWF 에 너울 분리 없음) · 기준 파고 도달 알림 · export. |
| 걸리는 것 | · 자료 없음 — 수집기 신규 2종이 선행. 자료 확보(A)만 L, 렌더(B)는 P0 렌더러 2종 재사용 전제로 M. 제안서의 L 은 과소평가.<br>· ECMWF 파랑 파일 .index 존재·공개 지연 UNKNOWN → 첫 작업에서 HEAD 1회로 확인, run 시각을 Inspector 에 상시.<br>· GFS-Wave 패킹 UNKNOWN(5.40 이면 grib2lite 불가) → eccodes 경로로 시험 다운로드 1회 후 A-2 크기 확정.<br>· 브라우저 직접 Open-Meteo 호출 2곳(main.js:2898-2900, 3403)이 남아 있으면 유료 화면이 Open-Meteo 위에 선다 → 프레임 격자점 값 + 가까운 KMA 부이로 교체.<br>· encode_png 8비트 전용 → 16비트 포장 변경, 알파 채널 금지.<br>· P0 Wind 입자 렌더러·P0 단계색 렌더러·Global Timeline 선행.<br>· 3m·5m 모델 등치선이 특보처럼 읽힐 위험 → 범례 문구 + Hazards 의 공식 특보로 가는 링크. |
| **완료 기준** | · 태풍이 있는 날 파고 구간이 태풍 중심 둘레의 동심 띠로 보이고 5m 선에 '5 m' 라벨이 붙는다.<br>· 파면 glyph 가 파향을 따라 움직이고 모바일에서도 끊기지 않는다(입자 5,000 이하).<br>· 바다를 클릭하면 Inspector 에 유의파고·파향·주기와 모델명·run/valid 시각·'모델 예보' 배지가 뜨고, 네트워크 기록에 open-meteo.com 호출이 없다.<br>· 타임라인을 +24h 로 끌면 색면과 glyph 가 같은 시각으로 함께 바뀌고 새 슬라이더가 생기지 않는다. |

#### 표층 해류 · `ocean.surface_current` — 다시 만든다 · P1 · L

| | |
|---|---|
| **Before** | Open-Meteo Marine 5° 격자 칸마다 움직이지 않는 색 선분 1개(r=1.0022 고정, 길이 0.004~0.020, 방향은 밝기 기울기뿐)라 쿠로시오도 만류도 흐름으로 읽히지 않는다(live-layers.js:1742-1788) — PD 가 싫어하는 막대기 기호 그 자체. |
| 돈 내는 사람 눈 | 555km 간격으로 짧은 색 막대가 흩어져 있을 뿐 쿠로시오도 멕시코 만류도 '흐름'으로 읽히지 않는다. 카드가 스스로 '격자 사이를 보간한 유선은 그리지 않습니다'라고 말한다. (C 빈약하다) |
| 기준 사이트 | mapped.earth OCEAN › Currents [animated] — 전지구 입자 애니메이션이 색면과 분리된 토글이라 SST 색면 위로 해류가 흐른다. windy 의 해류 항목은 UNKNOWN. |
| **After** | [→ 05 Ocean · Currents 입자 토글(PD: 기본 ON)] ① 막대 전부 삭제. P0 Wind 입자 렌더러를 그대로 공유(u/v 격자 이류·혜성 꼬리, 데스크톱 18,000/모바일 5,000). 색=속도 구간 m/s <0.1·0.1~0.25·0.25~0.5·0.5~0.75·0.75~1.0·1.0~1.5·≥1.5(PD 정본에 값 없음 — PD 확인), kn 병기. ② 색면(라디오)과 분리된 토글 — SST/SSTA 위에 겹친다. ③ 자료: NOAA CoastWatch ERDDAP griddap 'noaacwBLENDEDNRTcurrentsDaily' — 본 세션에서 직접 확인: 전지구 0.25°(720×1440), u_current·v_current m/s, 시간축 2015-01-15~2026-09-17(제안서의 '2017~'은 데이터셋 제목 표기). 마지막 자료가 조회일(09-20)보다 3일 전 → 배지는 '오늘 장'이 아니라 '최근 분석장(D-3) · 위성 고도계 지형류 — 예보 아님', Global Timeline 에서 이 레이어의 '최신' 위치도 3일 전이다. ④ 0.25° 전지구 2변수 = 약 207만 값이라 marine-grid 식 ASCII 당김은 불가 → griddap stride 2(0.5°, 약 52만 값)로 시작하거나 .dods/.nc 이진 파서. 0.5°(55km)는 서안경계류 폭을 겨우 해상한다 — '입자가 그리는 디테일은 자료 해상도까지'를 범례에. ⑤ 육지·결측에서 입자 소멸. 적도대·해빙역 결측은 비워 두고 범례에 '자료 없음'(데이터셋의 적도대 처리 방식 UNKNOWN — 첫 당김에서 확인). ⑥ Inspector: 유속 m/s·kn · 유향(16방위+도) · 자료일 · 출처 · '해류≠조류, 바람이 직접 미는 표층 성분·연안·조류 없음'. ⑦ 자료가 붙기 전에는 토글을 '비활성'으로 두지 않고 아예 두지 않는다. 현 5° 막대 레이어는 유료 레일에서 내린다. ⑧ sim-questions.js 의 '해류는 어디로 흐를까?' NOT_AVAILABLE 은 유지하고 사유 문구만 '입자는 최근 분석장의 시각화이지 이동 예측이 아닙니다'로. |
| 표현 | 입자장 |
| 자료 | 새 수집기 없이는 불가 — 지금 값은 Open-Meteo 5°(marine-grid/handler.py:81-82)이고 R0 감사가 '없는 것: 해류(CMEMS/RTOFS)'로 적었다. 1순위 NOAA CoastWatch ERDDAP(위 확인 내용). 라이선스: 페이지 문구는 '무료 사용·재배포 가능, 법적 용도 아님'이고 NOAA·Copernicus Sentinel·AVISO+ 크레딧을 요구한다. 상업 이용 명시 없음, AVISO+ 파생물 조건 UNKNOWN. 대안 NOAA RTOFS Global(public domain)은 제안서 기준 NOMADS 통파일뿐이라 배치 필요(본 세션 미검증). NASA OSCAR·Copernicus Marine 은 미검증. |
| 재사용 | P0 Wind 입자 렌더러(선행 산출물) · prototype/js/earthus2/v02/visual/flow.js · aws/marine-grid/handler.py('해류≠조류' 표기 원칙, 육지 None 원칙) · sim-questions.js(ocean.surface_current 절) |
| 무료 / 유료 | 무료: 전지구 해류 입자 + 속도 구간색 + 범례. EXPLORER: 지점 유속·유향 정확값·자료일·출처·한국 주변 해역 요약 리포트. PRO: 이력 재생(데이터셋이 2015년부터 보유 — 우리 적재 없이 원천에서 재생성 가능) · SST/SSTA 와 동기 비교 · export. |
| 걸리는 것 | · 수집기 없음 → ERDDAP 수집 Lambda 신규(이진 파서 또는 stride). PD 의 'Currents 기본 ON' 때문에 05 Ocean 기본 화면이 콘셉트와 같아지려면 이 자료 확보가 바다 묶음의 임계 경로다.<br>· 라이선스 확인 1건: 상업 이용 명시 문구가 없다 → 유료 핵심 그림으로 쓰기 전 NOAA CoastWatch 에 서면 확인, 크레딧 3자 표기. 막히면 RTOFS(public domain) 배치 경로.<br>· P0 Wind 입자 렌더러 선행.<br>· 3일 지연 자료를 '지금'처럼 보이게 하면 정직성 위반 → 범례·Inspector 에 자료일 상시, 타임라인 최신 위치 D-3. |
| **완료 기준** | · 전지구 시점에서 쿠로시오·멕시코 만류·남극순환류가 빠른 구간색의 입자 흐름으로 이어져 보인다.<br>· SST 색면을 켠 채 해류 입자가 그 위로 흐르고, 육지 위로는 입자가 지나가지 않는다.<br>· 범례에 m/s·kn 구간과 '자료일 MM-DD · 위성 고도계 분석(예보 아님)'이 항상 보인다.<br>· 지도에 움직이지 않는 막대 기호가 하나도 없다. |

#### 바다 실측 · `ocean.sea_observation` — 고친다 · P1 · M

| | |
|---|---|
| **Before** | 10~20분 신선도의 진짜 실측인데 메뉴를 누르면 북미 편중 전지구 부이가 먼저 뜨고 한국 193지점은 펼치기 안, 파고는 막대 기둥(live-layers.js:1918-1938), 어느 점도 눌러서 값을 읽을 수 없다 — 클릭 분기(main.js:2799-2831)에는 extScene·travel·seafloor·focus 의 pick 만 있고 LiveLayers 에는 pick 이 없다. |
| 돈 내는 사람 눈 | 10~20분 신선도의 진짜 실측이라 자료 가치는 높다. 그러나 메뉴를 누르면 먼저 뜨는 것은 4px 색점(분포상 북미 편중)이고, 한국 193지점은 펼치기 안에 있으며, 어느 점도 눌러서 그 부이의 값을 읽을 수 없다. (C 빈약하다) |
| 기준 사이트 | windy POI 오버레이 — 관측값을 지도 위 숫자로 직접 찍는다. mapped.earth 에는 관측소 오버레이 없음. 격자 색면과 실측 점을 같은 구간색으로 겹치는 것은 기준 사이트에 없는 EARTHUS 고유. |
| **After** | [→ 05 Ocean · 'Show Stations' 토글(07 Air Quality 관측소 토글 문법) + 10 Compare 의 Model\|Observation] ① 독립 메뉴 줄 → Ocean 패널 관측 토글. 대표를 kmasea(한국 193지점, 10분)로 — 한국 먼저. buoys(NDBC+GTS)는 같은 토글의 범위 확장. ② 막대 삭제. 마커=흰 테두리 원(관측 문법 — 모델 field 와 혼동 금지), 채움=지금 켜진 색면 변수의 같은 구간색. ③ 제안서의 '색이 어긋나는 곳이 곧 모델 오차'는 하향한다 — OISST 는 부이를 이미 흡수한 분석장이라 독립 검증이 아니고, 등표·조위관측소 같은 연안 지점은 0.5~1° 칸이 대표하지 못한다. 화면 문구는 '격자 분석값과 지점 실측의 차'까지만, '오차'라 부르지 않는다. 파고 비교는 새 파랑 격자 뒤에만 켠다(5° 값과 부이를 비교하면 격자 크기 차이를 오차로 오독). ④ 값 숫자 라벨은 확대 시 화면 안 최대 40개(Sprite 1개=드로우콜 1) + 충돌 솎기. 항목 미보고 지점은 회색 작은 점 유지. ⑤ 클릭 pick 신설 — main.js:2799-2831 분기에 관측 마커를 '바다 지점 선택'보다 앞에 넣고 임계는 km 가 아니라 화면 px 기준. ⑥ Inspector 항목은 수집기가 실제로 내는 것만: 전 지점 공통 wh 유의파고·tw 수온·ta 기온·pa 기압·hm 습도·wd/ws/gust 바람·kind 종류·tm 관측 시각(kma-ocean/handler.py:112-120), 부이에만 whMax 최대파고·whAvg·wp 파주기·wo 파향(:134-139, 수집기 주석 '파고·파주기는 부이에만' :176-179). 시각은 KST 로 온다(:175) — Inspector 에 시간대 명기. 기압·바람이 어느 종류 지점에 비는지는 런타임 확인(UNKNOWN). ⑦ 24h 시계열은 day-one 불가 — kma-buoy 는 archiver 에 0건(collect_buoys 는 archiver/handler.py:205, NDBC 쪽). 이력 적재를 먼저 걸고 '수집 시작일부터'라고 적는다. ⑧ khoa-coast(조위·이안류) 편입은 P2 로 미룬다. |
| 표현 | 아이콘/마커 (지도 위 값 숫자) |
| 자료 | 지금 자료로 된다 — ocean/kma-buoy.json(aws/kma-ocean, 공공누리 제1유형) · ocean/buoys.json(NDBC+GTS). KMA 허브 공유 키 함정: 새 호출을 늘리지 않는다 — 이력은 이미 받은 S3 문서를 archiver 가 복사해 쌓는다. '격자−실측 차'는 파랑 격자 교체 뒤에만 의미가 있다. |
| 재사용 | live-layers.js:1906-1948(buildKmaSea 자료 파싱부 — 막대만 제거) · seafloor.js(pick·라벨 충돌 솎기 패턴) · main.js:2799-2831(클릭 분기)·4681-4685(marine-buoys 동선) · aws/kma-ocean · aws/archiver(collect_buoys :205 를 본떠 kma-buoy 추가) |
| 무료 / 유료 | 무료: 관측 마커+값 숫자+클릭 기본값 — 바다 안전과 직결된 실측은 구독과 무관하게 무료. EXPLORER: 지점 전 항목·관측 시각·출처 + 24h 시계열(이력 적재 후) + 격자값과의 차. PRO: Model\|Observation 비교 작업공간 · 임계 도달 알림 · export. |
| 걸리는 것 | · P0 Right Inspector 선행.<br>· pick 경로 신설 — 관측 마커가 '바다 지점 선택'과 클릭을 다투므로 우선순위·px 임계를 정한다.<br>· kma-buoy 이력 0건 → archiver 에 추가(S), 시계열은 적재 시작일 이후만.<br>· 전지구 부이 1,000개 이상에 라벨을 다 붙이면 모바일 드로우콜 폭증 → 화면 안 상한 40 + 줌 임계.<br>· '오차' 표현 금지 — 분석장은 부이를 이미 포함한다. |
| **완료 기준** | · 관측 토글을 켜면 한반도 주변 193지점이 먼저 보이고 막대 기둥이 없다.<br>· 서해를 확대하면 마커 옆에 '1.8 m'·'23.4°' 같은 실측 숫자가 겹치지 않게 보인다.<br>· 마커를 한 번 클릭하면 Inspector 에 지점명·종류·실측값·관측 시각(KST)·기상청 출처·'관측' 배지가 뜬다.<br>· 파고를 보고하지 않는 지점은 색 없이 회색 점으로 남는다. |

#### 수심별 수온 · `ocean.subsurface_profile` — 합친다 · P2 · M

| | |
|---|---|
| **Before** | 관측(점)과 추정(점선)을 가르는 정직한 문법은 좋으나 메뉴가 약속한 '수심별 수온'은 지구가 아니라 카드 속 268×132px SVG(live-layers.js:2733-2767)이고 색 눈금이 없으며 플로트를 고를 수 없다. REFRESH_MIN 에도 없다(:344-349). |
| 돈 내는 사람 눈 | 관측(점)과 추정(점선)을 그림 문법으로 가르고 실측 단면을 그대로 칠한 것은 이 묶음에서 가장 정직하고 설명도 좋다. 다만 메뉴가 약속한 '수심별 수온'은 지구가 아니라 카드 속 작은 그림 2장이고, 보고 싶은 플로트를 고를 수 없다. (B 손보면 된다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. |
| **After** | [→ 05 Ocean 관측 토글의 'Argo 플로트' 칩 — PD 정본에 자리 없음 · PD 결정 필요(안: 바다 실측과 한 토글 묶음)] ① 지구 위 문법 유지(부상점=실선 점, 사이=점선 추정). 마지막 부상점은 표층 수온을 SST 10단 구간색 원으로 + 확대 시 숫자. 파일은 시간 역순 정렬이므로(argo-floats/handler.py:81) '한국 주변 먼저'는 클라이언트 정렬. ② pick 신설(바다 실측과 같은 경로) → Inspector 폭 전체에 수심–수온 단면, 색은 SST 10단 + °C 범례 막대. ③ 제안서의 '4°C 등온선'은 기둥 사이를 잇지 않는다 — 단면의 가로 칸은 부상 사이클이고, 이 그림의 원칙이 '플로트가 층마다 잰 값을 그대로 칠한 것, 우리가 만든 곡선이 아니다'(live-layers.js:2731-2732). 기둥 사이를 등온선으로 이으면 사이클 사이(약 열흘)를 지어내게 된다 → 각 기둥 안에서 4°C 배수가 지나는 깊이에 짧은 눈금+숫자만(한 프로파일 안 인접 층 사이 선형 내삽이라는 사실 명기). ④ 세로축 제곱근 수심(0/100/500/1000/2000m) 유지·명기. ⑤ Inspector: WMO 번호 · 마지막 부상 시각 · 표층/200m/1000m 수온 · 출처 Argo(Ifremer ERDDAP) · '관측' 배지 · '잠수 중 위치는 관측이 아님'. ⑥ REFRESH_MIN 등록. ⑦ 타임라인 부상 눈금은 P0 Global Timeline 뒤. |
| 표현 | 아이콘/마커 + Inspector 단면(DOM/SVG) |
| 자료 | 지금 자료로 된다 — ocean/argo-floats.json(aws/argo-floats, 최근 20일 활성 RECENT_DAYS=20 · 궤적 400일 TRACK_DAYS=400, handler.py:40-41). 단면을 가진 플로트 수는 문서의 counts.withSection(handler.py:196) — 본 세션 런타임 미확인(UNKNOWN). |
| 재사용 | live-layers.js:2689-2729(buildArgo — 유지)·2733-2767(argoSectionSvg — 확대·범례·눈금 추가) · ocean.sst 구간색표 · ocean.sea_observation 의 pick 경로 · aws/argo-floats |
| 무료 / 유료 | 무료: 플로트 위치 + 선택 1대의 최신 단면. EXPLORER: 사이클 이력 단면 · 표층값과 OISST 칸 값 나란히 · 출처·시각. PRO: 두 플로트/두 시점 단면 비교 · export(CSV/PNG). |
| 걸리는 것 | · PD 정본에 자리 없음 → PD 결정 필요(Ocean 관측 토글 편입 권고).<br>· pick·Right Inspector 선행(바다 실측 항목과 공유).<br>· 기둥 사이 등온선 금지 — 정직성 규칙. 기둥 안 눈금으로 대체. |
| **완료 기준** | · 플로트를 클릭하면 Inspector 에 패널 폭 전체의 수심–수온 단면과 °C 범례가 보인다.<br>· 단면의 기둥 사이에 이어진 등온선이 없고, 각 기둥 안에 4°C 배수 눈금이 있다.<br>· 지구 위에서 부상점은 실선 점, 부상점 사이는 점선으로 구분된다. |

#### 해수면 상승 전망 · `ocean.sea_level_rise` — 옮긴다 · P2 · M

| | |
|---|---|
| **Before** | AR6 조위관측소 1,016곳에 SSP5-8.5·2100 고정값으로 1px 선분 기둥+점(live-layers.js:1841-1879, 색은 1.2m 에서 포화 :1855), 한국 KHOA 격자 19,160점은 점 구름, 시나리오는 메뉴 4줄(ui-shell.js:104-107) — 막대기 기호 그 자체이고 '어디가 얼마나 다른가'가 읽히지 않는다. |
| 돈 내는 사람 눈 | 지구에 색 막대기 1,016개가 서 있고 카드에 한국 5곳 수치가 나온다. '2100년에 어디가 잠기나'를 기대하고 누른 사람에게 물이 육지를 덮는 그림은 하나도 없다 — 수치는 정직하지만 돈 낼 장면은 아니다. (C 빈약하다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. |
| **After** | [→ 12 Simulation · Variable='Sea level' — PD 결정 필요 2건: (a) 12 는 PRO 인데 '기본 그림은 무료 완성' 원칙과 부딪힘 → 05 Ocean 에 무료 1장(SSP5-8.5·2100), 시나리오×연도·delta 는 12. (b) 이 현상은 EARTHUS 계산이 아니라 기관 시나리오 전망(registry capabilities.simulation=false) — Simulation 공간에 두면 우리가 계산한 것처럼 읽힌다 → 배지 '기관 시나리오 전망 — EARTHUS 계산 아님' 상시] ① 막대·점 구름 삭제. 시나리오 칩 4개(khoasl 메뉴 4줄을 칩으로 — registry:277 '선택자이지 메뉴 4줄이 아니다'와 일치), 연도 칩 2050/2100/2150 은 AR6 에만. 타임라인에 올리지 않는다. ② 전지구 AR6 관측소=화면 고정 크기 구간색 원반. 구간 cm(제안·PD 확인): <0 하강 · 0~20 · 20~40 · 40~60 · 60~80 · 80~100 · 100~120 · ≥120. 본 세션 실측 분포(SSP5-8.5·2100, 1,016곳): 최소 −1.27m · 중앙 0.78m · 최대 2.61m — 음수(상대 해수면 하강 관측소)를 제안서의 '<20' 한 칸에 묻으면 거짓이 된다. 한국 관측소는 24곳(북측 포함) — 상시 라벨 5곳은 'SSP5-8.5·2100 상위 5' 같은 규칙을 적는다. ③ 한국 KHOA 면: 제안서의 10cm 구간 + 10cm 등치선은 철회. 본 세션 실측 분포상 한 시나리오 안 p5–p95 폭이 3~7cm 뿐이다(SSP1-2.6 40.3–43.5 / SSP2-4.5 48.2–53.2 / SSP3-7.0 57.4–63.1 / SSP5-8.5 65.1–72.3cm) → 10cm 면 한국 바다 전체가 한 색, 등치선 0~1줄. 극적인 차이는 공간이 아니라 시나리오 사이(중앙 41.6→50.5→59.6→67.8cm)에 있다 → 네 시나리오 공통 5cm 구간(35~40 … ≥75)으로 칩 전환 때 면 전체가 한 단 이상 바뀌게 하고, 공간 구조는 1cm 등치선+라벨. ④ 래스터화: 경도는 0.05° 정규(161열)지만 위도 간격은 약 0.0425°(고유 위도 172개: 32.018·32.060·32.103…) — '0.05° 정규 격자' 전제는 틀렸다. lat/lon 배열 색인으로 172×161 텍스처를 만들고 위도 축은 그 배열로 매핑. 채워진 칸 19,160/27,692. 최솟값 −0.2·0.5·0.5·2.4cm 는 p1(39cm 이상)과 동떨어진 소수 칸 — 지우지 않고 원값 그대로, Inspector 에 표기. ⑤ 한 범례 통일 철회: AR6(m, 1995–2014 기준, 관측소 상대 해수면)와 KHOA(cm, 목표 연도·기준기간 메타데이터 없음 — 파일 unitNote '기준연도는 기관 명세를 따른다')는 같은 바다에서 값이 크게 다르다(AR6 목포 98cm vs KHOA SSP5-8.5 중앙 67.8cm). 한 범례·한 '2100' 칩 아래 두면 모순으로 읽힌다 → 범례를 따로, Inspector 에 '두 산출물은 방법·기준이 달라 직접 비교하지 않는다'. ⑥ 결과는 absolute + delta(시나리오 A−B). ⑦ '물이 육지를 덮는 그림'은 점값으로 그리지 않는다. Inspector '이 지역 침수예상도' → khoaflood(국립해양조사원 폴리곤, 재해 묶음) 연결, 편입은 PD 결정. sim-questions '어디가 잠길까' NOT_AVAILABLE 유지. ⑧ Inspector: 중앙값 · 17~83% 범위 · 기준기간 · 출처(IPCC AR6·NASA/JPL CC BY 4.0 / 국립해양조사원 공공누리). |
| 표현 | 단계색+등치선(한국 KHOA 면) + 아이콘/마커(전지구 관측소 구간색 원반) |
| 자료 | 지금 자료로 된다 — 번들 정적 sealevel/ar6.json(본 세션 확인: 1,016곳, ssp126/245/370/585 × 2050/2100/2150, 값=[중앙, 17%, 83%], m, CC BY 4.0) · sealevel/khoa-kr.json(scenarios[SSP].val 배열 19,160, 단위 cm, 공공누리). KHOA 목표 연도·기준기간은 파일에 없다 — UNKNOWN. 전지구 침수면은 하지 않는다(Terrarium z4 정수 m 로는 1m 미만 상승을 해상 못 함). |
| 재사용 | live-layers.js:1841-1879(buildSlr 자료 파싱)·1278-1320(buildKhoaSl)·3002(SLR_KHOA_RAMP → 구간표) · P0 단계색 렌더러(KHOA 면) · khoaflood(live-layers.js:542,601) · sim-questions.js |
| 무료 / 유료 | 무료: SSP5-8.5·2100 기본 1장(원반+한국 면) + 한국 상위 5곳 수치. EXPLORER: 지점 정확값 + 17–83% 범위 + 출처·기준기간 + 내 해안 짧은 리포트. PRO: 시나리오 4 × 연도 3 전환 · A/B split·delta · export. |
| 걸리는 것 | · KHOA 목표 연도·기준기간 미확인 → data.go.kr 기관 명세 확인(S) 전에는 KHOA 면에 연도를 적지 않는다.<br>· PD 결정 2건(무료 1장의 자리 / Simulation 공간에 기관 전망을 두는 것).<br>· P0 단계색 렌더러 + 12 Simulation 작업공간(P2) 선행.<br>· KHOA 위도 축 비정규 → 배열 색인 기반 래스터.<br>· AR6 CC BY 4.0·KHOA 공공누리 출처표시 상시. |
| **완료 기준** | · 시나리오 칩을 SSP1-2.6→SSP5-8.5 로 바꾸면 한국 바다 면 전체 색이 한 단 이상 바뀌고 1cm 등치선 라벨이 보인다.<br>· 지구 위에 기둥·점 구름이 없고 관측소는 구간색 원반이며, 상대 해수면이 내려가는 관측소는 별도 색(<0)으로 보인다.<br>· AR6 관측소와 KHOA 면의 범례가 따로 표시되고 Inspector 에 기준기간·출처·'기관 시나리오 전망' 배지가 있다.<br>· 메뉴에 SSP 시나리오가 네 줄로 나열되지 않는다. |

#### 바다 깊이 · `ocean.bathymetry` — 고친다 · P2 · M

| | |
|---|---|
| **Before** | 지구 프래그먼트 셰이더가 고도맵에서 직접 그리는 등심선(fwidth 1px·줌 적응 간격·주곡선, main.js:501-521)으로 묶음에서 PD 의 '레벨별 선'에 가장 가깝지만, 선에 숫자가 없고 수심 구간색이 없으며 간격 조절이 '설정 ▸ 시뮬레이션 · 표현 튜닝' 슬라이더(200~2,000m)에 숨어 있다(main.js:4474-4480 안내문). |
| 돈 내는 사람 눈 | 이 묶음에서 PD 가 말한 '레벨별 선'에 가장 가까운 그림이다 — 선이 뭉개지는 대신 스스로 성겨지고, 대륙붕 끝과 해구가 선의 밀도로 또렷이 선다. 다만 선에 수심 숫자가 없고 깊이를 단계색으로 칠하지 않아 '얼마나 깊은가'는 여전히 글로 읽어야 한다. (B 손보면 된다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. |
| **After** | [→ 09 Terrain · Contours 의 바다 쪽 + Elevation 모드 수심 구간색] (제안서의 이 항목은 dataNeed 중간에서 잘려 도착했다 — 보이는 부분만 검증) ① 등심선 셰이더는 그대로 둔다 — 다른 색면의 본보기. ② 간격 칩 200/500/1000/2000m — 지금 슬라이더 범위와 같다. 슬라이더는 설정에서 빼 Terrain 데이터 패널의 프리셋 칩으로(PD 09 Contours 프리셋과 같은 자리, 육상 100/250/500/1000m 과 별도 표 — PD 확인). ③ 수심 구간색 0~200·200~1000·1000~2000·2000~4000·4000~6000·≥6000m(PD 정본에 값 없음 — PD 확인)는 새 자료 없이 EARTH_FRAG 가 이미 가진 h(sampleHeight, main.js:344)로 칠한다. 제안서가 든 depth-grid.bin(GEBCO 0.1°)은 브라우저 소비자가 0건인 Lambda 전용 조회 자료(aws/ocean-depth/handler.py — 본 세션 grep 으로 prototype/ 아래 참조 0건 확인)라 면 칠하기용이 아니다 — 클릭 Inspector 수심값에만 쓴다. ④ 숫자 라벨: 등심선 간격은 프래그먼트마다 fwidth 로 2배씩 성겨진다(main.js:512) — 같은 화면 안에서도 경사에 따라 선이 있는 깊이가 달라 CPU 라벨이 선 없는 곳에 뜰 수 있다 → 라벨은 적응 간격 선이 아니라 '고정 지수 등심선'(200·1000·2000·4000·6000m, 항상 그리는 별도 굵은 선)에만 붙인다. 앵커는 고도 캔버스를 512px 급으로 줄여 마칭 스퀘어 1회, Sprite 상한 24. ⑤ 클릭 → Inspector 수심(hobby/dive 가 쓰는 ocean-depth 조회 재사용) · 배지 'GEBCO 0.1° 셀 최심값 기반 정보 제품 — 항해용 아님'. ⑥ 해구 축선·이름표(ocean.trench) 흡수. ⑦ 정적 자료 — 타임라인 비활성 표시. |
| 표현 | 단계색+등치선 (등치선 셰이더 유지, 구간색·고정 지수선 추가) |
| 자료 | 지금 자료로 된다 — 지구본이 이미 쓰는 Terrarium z4 고도맵(9.8km/px). 해저는 육상 DEM 보다 원본이 성기다(main.js:347-350 주석) → 구간 경계 정밀도는 그 해상도까지라고 범례에. 클릭 값만 aws/ocean-depth(GEBCO 0.1° 최심 격자, S3 ocean/depth-grid.bin + manifest). |
| 재사용 | main.js:501-521(등심선 셰이더 — 유지)·344(h)·193-255(TERRAIN_GLSL) · prototype/js/contour-math.js(라벨 앵커) · seafloor.js(라벨·pick) · aws/ocean-depth/handler.py(클릭 수심) |
| 무료 / 유료 | 무료: 등심선+수심 구간색+범례+클릭 수심. EXPLORER: 지점 수심 + 출처·한계 + 가까운 해구. PRO: 두 지점 사이 수심 단면(measure 도구 연계 — 구현 범위 UNKNOWN) · export. |
| 걸리는 것 | · 적응 간격 선과 CPU 라벨의 불일치 → 고정 지수 등심선 세트를 셰이더에 추가(라벨은 그 선에만).<br>· P0 Data/View 분리 셸 선행(슬라이더를 칩으로 옮길 자리).<br>· PD 정본의 Contours 프리셋은 육상용 → 바다 간격 표·수심 구간값 PD 확인.<br>· 이미 동작하는 기능이라 유료 전환의 임계 경로가 아니다 → P2. |
| **완료 기준** | · 등심선 간격을 슬라이더가 아니라 200/500/1000/2000m 칩으로 바꾼다.<br>· 동해·서태평양을 볼 때 '1000 m'·'4000 m' 라벨이 항상 실제 그려진 선 위에 있다.<br>· 대륙붕(0~200m)과 해구(≥6000m)가 서로 다른 구간색으로 보이고 범례가 상시 보인다.<br>· 바다를 클릭하면 Inspector 에 수심과 '항해용 아님' 배지가 뜬다. |

#### 해구 · `ocean.trench` — 합친다 · P3 · S

| | |
|---|---|
| **Before** | (제안서 미수신 — 입력이 잘려 이 항목은 레지스트리·코드로 재구성) 전지구 해구 축선(선)+최심점+이름표를 seafloor.js 가 그리고(:188-224) 클릭 선택(pick :258-272)도 있으나 독립 메뉴 줄이고(main.js:4518 ocean/trenches), 상세 카드 10곳은 hobby/trench 확장 화면(ext-scene.js:50)에 따로 있다. |
| 돈 내는 사람 눈 | 지구 위에는 점 10개와 이름표뿐이고 내용은 옆 카드의 글이다. 수심 범위를 하나로 줄이지 않는 정직함은 좋지만, '가장 깊은 바다'를 깊이로 느끼게 하는 그림(단면·깊이 비교)이 지구에도 카드에도 없다. (C 빈약하다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. |
| **After** | [→ 09 Terrain · 등심선의 지형 이름표로 MERGE] 렌더는 유지 — 선·라벨·pick 이 이미 PD 문법(선 + 지구 위 라벨 + 클릭)에 맞다. 독립 메뉴 줄을 없애고 Bathymetry 를 켜면 'Feature labels' 토글로 해구 축선·이름표가 함께 뜬다. 클릭 → Inspector 에 해구명 · 수심 범위(depthMin~depthMax 를 하나로 줄이지 않는다 — registry:387) · 출처 GEBCO 2026·SCUFN · 배지. 해구 옆 수심 숫자는 EARTHUS_ANALYSIS 라는 기존 구분(registry:203) 유지. hobby/trench 상세 카드 10곳의 자리는 PD 결정 필요('Life/취미' 보조 서랍 또는 v1). |
| 표현 | 선+라벨 (유지) |
| 자료 | 지금 자료로 된다 — 정적 카탈로그(GEBCO 2026·SCUFN, 2026-08-09 생성). |
| 재사용 | prototype/v2-three/js/seafloor.js(build·pick·라벨 충돌 솎기 전부) · ext/hobby-trench.js(카드) |
| 무료 / 유료 | 무료: 축선·이름표·클릭 수심 범위. 유료 훅 없음 — 억지로 잠그지 않는다. |
| 걸리는 것 | · P0 Right Inspector 선행(카드 → Inspector 이관).<br>· hobby/trench 상세 카드의 자리 — PD 결정 필요. |
| **완료 기준** | · 메뉴에 '해구' 독립 줄이 없고 Terrain 의 등심선을 켜면 해구 축선과 이름표가 함께 보인다.<br>· 해구를 클릭하면 Inspector 에 수심 범위와 출처가 뜬다. |

#### 심해 · `ocean.deep_sea` — 옮긴다 · P3 · S

| | |
|---|---|
| **Before** | (제안서 미수신 — 재구성) hobby/dive 확장 화면(ext-scene.js:51) — 고른 지점의 수심 기둥을 GEBCO 0.1° 격자로 내려가는 연출 + OBIS 5° 해역 생물 기록 요약. '우리가 만든 값, 항해용 아님' 고지는 정직하나(registry:239-241) PD 좌측 레일 9개에 자리가 없다. |
| 돈 내는 사람 눈 | 바다 묶음에서 유일하게 '체험'이 있는 메뉴다 — 슬라이더로 수면에서 해저까지 내려가며 생물과 비교물이 나온다. 하지만 그 체험은 좁은 옆 패널 카드 안에서 일어나고 지구본은 점 하나만 찍힌 채 멈춰 있어 v2 의 3D 지구와 따로 논다. (B 손보면 된다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. |
| **After** | [자리 없음 — PD 결정 필요] 둘로 가른다. ① '이 지점 수심' 읽기는 Bathymetry Inspector 로 흡수(ocean-depth 조회 재사용). ② 잠수 연출 + OBIS 생물 요약은 데이터 현상이 아니라 체험 콘텐츠 → 안 A 'Life' 보조 서랍 / 안 B v1(무료 FACT)로 보냄 / 안 C Bathymetry Inspector 의 '여기로 잠수' 액션 버튼으로만 진입. 권고 C — 메뉴 줄 0, 기존 화면 그대로 재사용. OBIS 요약은 '기록 수이지 개체수·현재 분포가 아님' 문구를 유지하고 5° 요약을 색면으로 키우지 않는다. |
| 표현 | DOM 카드/확장 화면 (유지) |
| 자료 | 지금 자료로 된다 — GEBCO 0.1° 최심 격자(aws/ocean-depth) + OBIS 요약(aws/obis-summary, 주 1회). |
| 재사용 | prototype/v2-three/js/ext/hobby-dive.js · aws/ocean-depth · aws/obis-summary |
| 무료 / 유료 | 없음 — 체험 콘텐츠. 유료 훅으로 쓰지 않는다. |
| 걸리는 것 | · PD 결정 필요(A/B/C).<br>· OBIS 5° 기록 수를 분포처럼 보이게 하는 확장은 금지 — 격자값 오독. |
| **완료 기준** | · 좌측 레일·Ocean 패널에 '심해' 독립 줄이 없다.<br>· 바다 클릭 Inspector 에 수심값이 보이고, PD 가 C 안을 고른 경우 '여기로 잠수' 버튼으로 기존 잠수 화면에 들어간다. |

#### 선박 · `ocean.vessel_traffic` — 뺀다 · P2 · S

| | |
|---|---|
| **Before** | (제안서 미수신 — 재구성) availability 'planned' — 지구에 아무것도 그리지 않는다. AIS 위치는 정책상 재배포하지 않으며(registry:395-399) 메뉴 줄만 두 곳(ocean/vessel · hobby/vessel, ext-scene.js:49)에 있다. |
| 돈 내는 사람 눈 | '선박'을 누르면 배는 한 척도 안 나오고 안내문과 외부 링크가 나온다. 카드가 말하는 '북극항로 · 무역항로 인텔리전스'는 제목뿐이고 눌러도 지구에 항로 선 하나 그려지지 않는다 — 돈 낸 사람에게는 빈 메뉴다. (C 빈약하다) |
| 기준 사이트 | 기준 사이트 mapped.earth·windy 의 선박 항목은 UNKNOWN(본 검증에서 확인하지 않음). |
| **After** | [REMOVE — PD 결정 필요] 유료 레일·Ocean 패널에서 줄을 뺀다. 그릴 자료가 없는 줄은 PD 금지 항목 '유료를 잠금 아이콘만으로 표현'과 같은 인상을 준다. 항로 질문은 지금처럼 검색창 구간 입력으로, 실시간 위치·여객선 운항은 해양교통안전정보시스템(MTIS) 안내를 Search 결과에서. 자료·라이선스가 확보되는 날 Ocean 의 토글로 재등장. |
| 표현 | 없음 |
| 자료 | 자료 없음(정책상 AIS 재배포 안 함). 확보 계획 UNKNOWN. |
| 재사용 | prototype/v2-three/js/route.js(검색창 구간 안내 — 유지) |
| 무료 / 유료 | 없음. |
| 걸리는 것 | · PD 결정 필요 — 메뉴에서 빼는 것 자체는 P0 셸 재배치 때 '옮겨 담지 않으면' 끝난다. |
| **완료 기준** | · Ocean 패널과 좌측 레일 어디에도 눌러서 빈 화면이 나오는 '선박' 줄이 없다.<br>· 검색창에 항로를 넣으면 기존 구간 안내가 그대로 동작한다. |

<details><summary>반박 검증에서 뒤집거나 낮춘 것 (24)</summary>

- [분리·승격] '육지가 잠김' 수정을 SST 재작성(M·P1) 안에서 꺼내 3종 공통 핫픽스(S·P0)로 떼었다 — PD 가 직접 본 버그이고 렌더러 재작성을 기다릴 이유가 없다. 이 묶음에서 P0 는 이것 하나뿐이다.
- [뒤집음] SST '자체 셰이더 방식' → P0 Temperature 단계색+등치선 렌더러의 재사용. PD 우선순위가 Temperature 를 기준 구현체로, Ocean 을 P1 '공통 renderer contract'로 정했다. 단독 착수면 M 이 아니라 L 이고 같은 렌더러를 두 번 만든다.
- [추가] 값 텍스처 + 선형 보간의 해안 오염 함정 — 육지 null 을 센티넬로 넣으면 모든 해안에 가짜 구간 띠가 선다. 값×유효 2채널 half-float 로 해결(three r184 = WebGL2).
- [정정] '육지 마스크는 main.js:506 과 같은 값' — :506 의 조건은 h(sampleHeight)이지만 등심선 자체는 5탭 평활값 displacementHeight(:508)로 긋는다. 마스크는 sampleHeight + 격자 유효 채널의 AND 여야 디테일 창 해안선을 따르고 해수면 아래 육지를 바다로 칠하지 않는다.
- [철회] SST '어느 줌에서도 매끈한 곡선' — 쌍선형 값의 등치선은 칸 경계에서 꺾인다. bicubic 샘플 + 1°C 칩은 0.5° 이상 자료·화면 간격 26px 이상에서만.
- [하향] 'SST HD 0.25°'를 PRO 핵심 훅에서 내리고 P2 로 분리 — OISST 는 0.25° 격자의 분석장이라 'HD' 표기가 과장이고, stride 1 당김(약 92만 값 ASCII, timeout 90초 marine-grid/handler.py:139, Lambda 제한시간 UNKNOWN)은 미검증. 대신 전지구 0.5° 한 장을 기본으로.
- [철회] SSTA '확대 시 0.5° 자동 전환' — 두 해상도의 이음매와 전환 로직만 늘어난다. SST 와 같은 전지구 0.5° 한 장에서 편차를 계산한다.
- [상향] 파고 L → XL(자료 확보 L + 렌더 M 으로 분리). 수집기 2종 신규 + 값 PNG 16비트 포장 + glyph + Inspector 재배선 + 브라우저 직접 Open-Meteo 호출 2곳 교체가 한 항목에 들어 있었다.
- [순서 뒤집음] 파고 자료 'GFS-Wave 우선' → 'ECMWF 파랑 먼저, GFS-Wave 다음'. 제안서가 UNKNOWN 으로 둔 ECMWF 파랑은 본 세션 확인으로 해소(swh·mwd·mwp·pp1d·mp2, 0.25°, CC-BY-4.0)됐고 해독 경로(eccodes 2.42.0, 5.42 AEC)가 ecmwf-ingest 로 운영 입증됐다. GFS-Wave 는 패킹 UNKNOWN(5.40 이면 grib2lite.py:8,169 거부). 단 ECMWF 에는 너울 분리가 없어 너울 칩과 Compare 의 두 번째 모델은 GFS-Wave 가 채운다 — Compare 는 유의파고·평균파향·평균주기만.
- [정정] 제안서의 'ecmwf = 모델 있음' 뉘앙스 — ecmwf-ingest 는 PARAMS=['2t'](handler.py:64) 하나를 97지점에서만 뽑는다. 격자·파랑 출력은 전부 신규다.
- [하향·정정] 해류 'marine-grid 의 ASCII 부분 추출 방식으로' — 0.25° 전지구 2변수는 약 207만 값이라 ASCII 불가. stride 2(0.5°) 또는 이진(.dods/.nc) 파서가 필요하다.
- [갱신] 해류 데이터셋은 제안자 주장이 아니라 본 세션 직접 확인으로 바꿨다: 시간축은 2015-01-15 부터(제안서 '2017~'은 제목 표기), 최신 2026-09-17 = 3일 지연 → '오늘 장' 표현 금지, 배지 '최근 분석장(D-3)'. 라이선스는 '무료 사용·재배포 가능' 문구만 확인 — 상업 이용 명시 없음·AVISO+ 조건 UNKNOWN 을 확인 과제로 남겼다.
- [뒤집음] 해류 '기본 ON 토글(자료 준비 후)' → 자료가 붙기 전에는 비활성 토글이 아니라 토글 부재, 현 5° 막대 레이어는 유료 레일에서 내린다.
- [하향] 바다 실측 '색이 어긋나는 곳이 곧 모델 오차' — OISST 는 부이를 이미 흡수한 분석장이라 독립 검증이 아니고 연안 지점은 격자 칸이 대표하지 못한다. '격자 분석값과 지점 실측의 차'로만 말한다. 24h 시계열은 kma-buoy 이력 0건이라 day-one 불가.
- [확인 후 유지] 바다 실측 Inspector 의 '최대파고·파향' — 첫 검색에서는 출력에 없어 보였으나 수집기를 끝까지 읽으니 부이 상세(kma-ocean/handler.py:134-139 whMax·wo)로 병합된다. 부이에만 있다는 단서를 붙여 유지했다.
- [뒤집음] Argo 단면의 '4°C 등온선' — 기둥(부상 사이클) 사이를 선으로 이으면 측정 사이를 지어낸다. 이 그림의 원칙(live-layers.js:2731-2732 '우리가 만든 곡선이 아니다')과 충돌 → 기둥 안 눈금으로.
- [뒤집음] 해수면 전망 KHOA '10cm 구간 + 10cm 등치선' — 본 세션 실측 분포: 시나리오 안 p5–p95 폭이 3~7cm(SSP5-8.5 65.1–72.3cm)라 한 색 평면이 된다. 시나리오 공통 5cm 구간 + 1cm 등치선으로. 극적인 차이는 시나리오 사이에 있다.
- [정정] KHOA '0.05° 정규 격자' — 경도만 0.05°, 위도 간격은 약 0.0425°(고유 위도 172개). 래스터화는 배열 색인 기반.
- [추가] AR6 에 음수(최소 −1.27m, 상대 해수면 하강)가 있다 — 제안서의 '<20cm' 한 칸에 묻으면 거짓. '<0 하강' 구간 추가. 한국 관측소는 5곳이 아니라 24곳.
- [철회] 해수면 전망 'AR6 와 KHOA 를 cm 범례 하나로 통일' — KHOA 는 목표 연도·기준기간 메타데이터가 없고(unitNote), 같은 바다에서 AR6 목포 98cm vs KHOA 중앙 67.8cm 로 크게 다르다. 범례를 따로 두고 직접 비교하지 않는다고 적는다.
- [정정] 등심선 수심 구간색의 자료 — depth-grid.bin 은 브라우저 소비자 0건인 Lambda 전용 조회 자료다. 면은 EARTH_FRAG 가 이미 가진 고도 h 로 칠하고 depth-grid 는 클릭 값에만.
- [추가] 등심선 숫자 라벨 — 간격이 프래그먼트별 fwidth 로 적응(main.js:512)해 CPU 라벨과 선이 어긋난다. '고정 지수 등심선' 세트에만 라벨. 크기 S 가 아니라 M.
- [우선순위 하향] 등심선 P1 상당 → P2 — 이미 동작하고 PD 의 P1 목록(Ocean/Hazards/Air Quality/Clouds)에 Terrain 이 없다.
- [입력 결함] 제안서가 bathymetry 중간에서 잘려 trench·deep_sea·vessel_traffic 을 받지 못했다 — 레지스트리로 재구성: trench MERGE(S·P3), deep_sea MOVE(S·P3, PD 결정), vessel_traffic REMOVE(S·P2, PD 결정).

</details>

### 4-3. 재해

> 경로는 모두 D:\## APP\EARTHUS v2_APP\ 기준. 읽기 전용으로만 조사했다(수정·커밋·빌드 없음).<br>> [입력 절단] 받은 개선안 JSON 이 "phenomenonId": "hazards.ts 에서 끊겼다. 재해 묶음은 phenomenon-registry.js:1081-1083 에 10개인데 7개만 받았다. 미수신 3건(hazards.tsunami · ocean.coastal_inundation · hazards.glacial_lake_flood)은 코드 실측만으로 보수적 기준안을 채웠고 before 첫 문장에 '원안 미수신'을 적었다 — 오케스트레이터가 가진 원안과 대조해야 한다.<br>> [콘셉트의 모델·기관 이름 vs aws/ 수집기] JTWC: 수집기 없음, 403 봇 차단으로 수집 불가(aws/typhoon-official/handler.py:29-30). ECMWF: 있음 — 단 태풍 트랙·앙상블(aws/ecmwf-ingest → events/typhoon-ecmwf.json), 15일 가이던스(aws/tropical-intelligence, v2 미연결), 지점 예보뿐이고 전지구 장(field)은 없다. GFS: 구름 파이프라인(gfs-cloud-*)뿐, 재해 겹치기용 바람장 수집기 없음. CAMS·CMIP6: 재해 묶음과 무관. → 06 Hazards 의 'Model(JTWC 등)' 칩은 'Agency KMA/JMA(+다른 해역 NHC 점)' + 'ECMWF ENS(MODEL 배지)' 토글로 바꾼다. 'Category 5~1' 범례는 어느 수집 자료로도 나오지 않는다(NHC 피드도 HU/TS/TD+kt 만).<br>> [묶음 공통 선행 부품 — v2 에 지금 없다] ① 굵은 선: prototype/vendor 에 three-r184·earcut·satellite 뿐, Line2\|LineMaterial 0건, LineBasicMaterial 은 항상 1px → three/examples/jsm/lines 벤더링(MIT) 또는 리본 메시(공통 S). ② 지구 위 텍스트 라벨 공용 부품(지금은 18개 파일이 제각각 CanvasTexture). ③ 범례 부품(v2 에 없음 — 전제 사실 2). ④ 정점별 크기 점 셰이더의 공용화(makePoints 는 단일 size :606-623, makeCyclones aSize :627-659 가 재료). ⑤ 한국 구역 id 래스터 + 지형 드레이프 패치(특보·산불위험 공용, buildForest :2456-2524 패턴). ⑥ P0 글로벌 타임라인의 '과거 범위·범위 교체' 모드(낙뢰 −60분, 산불 24h, 지진 25년). ①②③은 P0 Temperature 기준 구현체(등온선+라벨+범례)의 산출물과 같으므로, 재해 항목의 크기는 그것들이 먼저 나온다는 전제다 — 아니면 L 세 건은 각각 XL 이 된다. 반대로 하늘 높이 면(확률원·강풍역)의 삼각분할은 준비돼 있다(earcut 벤더링 + ShapeGeometry 패턴).<br>> [우선순위] P0 없음 — 재해는 PD 정본에서 P1 이고 '안전 정보는 구독과 무관하게 무료'라 '이것 없이는 유료 불가'에 해당하지 않는다. P1 순서: 태풍(L) → 기상 특보(L) → 지진(L) + 쓰나미(M, 지진 선택에서 1탭 연결). P2: 낙뢰·산불·지각 2건·연안 침수. P3: 빙하호, 그리고 분리해 낸 과제들(산불 375m 타일 L · 화선 M · NWS 구역 폴리곤 M · 판 기준 잔차/입자 · NHC cone).<br>> [안전 무료 원칙과 알림 — PD 결정 필요] 원안은 '내 장소 알림'을 EXPLORER 에 넣었다. 공식 특보·쓰나미 발표 알림과 '내 장소까지 거리·폭풍경계역 포함 여부' 같은 안전 판단 값은 무료로, 개인화 조건 알림(반경·규모 조건·다중 장소)·이력·비교·리포트·export 를 유료로 나누는 안을 각 항목 paidHook 에 반영했다. 최종 선은 PD 가 정한다.<br>> [자리 없음 · PD 결정 필요] hazards.crustal_motion(MERGE) · land.crustal_motion(MOVE, 재작업 전 레일 비노출) · ocean.coastal_inundation(MOVE) · hazards.glacial_lake_flood(REMOVE, 자료 들어오면 사건 카드로 복귀).<br>> [성능] 어느 항목도 모바일 예산을 넘지 않는다 — 확률원·강풍역 면 수십 개(링 분할 포함 수천 삼각형), 낙뢰 ≤4,000점, 화점 ≤900, 실황 지진 30일 수백 점(25년 18만 점은 이미 도는 셰이더), 화살표 1,352 InstancedMesh(드로우콜 1), 한국 구역 래스터 2048² 1장(저사양은 1024²) + 드레이프 패치 1개.<br>> [라이선스] 재해 묶음의 핵심 그림은 Open-Meteo 에 서 있지 않다(KMA 공공누리 1유형 · JMA 출처 명기 · USGS/NOAA/NASA 미 정부 자료 · ECMWF Open Data CC-BY-4.0 · UNR MIDAS 인용 · PB2002 ODC-BY · geoBoundaries CC BY 3.0). 유일한 오염은 cyclone-analog 의 steering/guidance 블록(Open-Meteo)과, 02 Wind 에 종속된 'Wind 겹치기' 토글이다.

#### 태풍 · `hazards.typhoon` — 고친다 · P1 · L

| | |
|---|---|
| **Before** | 공식 경로를 1px 선(THREE.Line+LineBasicMaterial) + 5px 점 + 회전 기호로만 그리고(buildTyphoon live-layers.js:2798-2853) 색은 강도가 아니라 태풍 순번이다(STORM_COLORS :2807). 확률원·강풍역·폭풍역은 JMA 스텝에 받아 두고도(aws/typhoon-official/handler.py:183-186,:239) 안 그린다. 기관은 발표가 가장 이른 첫 기관 하나만 그린다(:2804, 정렬은 handler.py:540). 공식선(aboveCloudsR, 50×에서 r≈1.090 :247-249)·앙상블(고정 1.006/1.008 :1679,:1682)·피드 트랙(1.006 intel-feed.js:741-743)의 높이가 달라 어긋나고, 고정 1.006 은 50× 에서 해발 약 764m 이상 지형에 묻힌다. [추가 실측 버그] JMA 스텝의 시각 키는 validKst 뿐인데(handler.py:229) buildTyphoon 은 validUtc 만 읽는다(:2832, parseValidUtc :51-56) — JMA 가 첫 기관인 태풍은 타임 스크럽 표식이 조용히 죽는다. NHC 는 h=0 한 점뿐이라(handler.py:424-435) 선도 스크럽도 없다. 절대 규칙 2(단일 타임라인)의 전제가 이미 깨져 있다. |
| 돈 내는 사람 눈 | 태풍이 있는 날에는 회전하는 기호와 공식 경로, 51줄 앙상블이 한 화면에 올라와 재해 묶음 중 가장 '살아 있는' 그림이다. 다만 windy·기상청 화면에서 당연히 보이는 확률원·강풍역·폭풍역이 없어 '얼마나 큰 태풍이고 어디까지 위험한가'가 1픽셀 선 한 줄로만 읽힌다. 태풍이 없는 날은 빈 화면이다. (B 손보면 된다) |
| 기준 사이트 | windy: 메뉴 타일 '태풍 추적기' + 활성 개수 배지, 풍속 색면에서 태풍이 동심원 과녁으로 읽히고 타임라인·모델 선택이 상시. mapped.earth: 태풍 전용 메뉴 없음(Wind·MSLP 에서 소용돌이로만). 두 곳 모두 '기관 공식 경로+확률원+강풍역'을 한 화면에 주지 않는다 — KMA·JMA 원문값을 가진 EARTHUS 가 이길 자리. (원안의 실측을 그대로 인용, 이번 검증에서 재방문하지 않음) |
| **After** | [→ 06 Hazards · Event-first] 목표 화면은 PD 06 그대로, 도달 방법만 고친다. ① Track: 3~4px 리본(과거=실선·예보=점선), 구간색 = 기관 발표 최대풍속 m/s 단계색(경계 17·25·33·44·54). 범례에 '풍속 평균시간은 기관마다 다름(KMA·JMA 10분 / NHC 1분)' 상시. 공식 파일에는 과거 위치가 없으므로 과거 실선은 (a) 발표 아카이브의 h=0 점을 이은 롤업(신규 S) 또는 (b) GDACS 경로를 'GDACS' 출처 표기로. ② Forecast Cone(토글): JMA 스텝 circleKm 을 이은 반투명 면 + 외곽선, 라벨 'JMA 70% 확률원 — 태풍 크기 아님'. KMA 를 고르면 '확률원 미제공(수집 안 됨)'. 겹친 원의 알파 누적은 스텐실 1회 칠로 막는다. ③ Wind Area(토글)는 **h=0 실황 전용**: galeArea=노랑·stormArea=빨강, 방위별 비대칭 폴리곤. 타임라인을 미래로 밀면 실황 면은 사라진다. h>0 의 stormArea 는 '폭풍경계역(JMA 예보·진로 불확실성 포함)'이라는 **별도 토글·점선 외곽·다른 이름**으로만 — 실황 폭풍역과 같은 색면으로 그리지 않는다(태풍이 자라는 것처럼 읽히는 거짓 방지, v1 cyclone.js:735-750 규칙 승계). ④ 지구 위 라벨: v1 규칙대로 '날짜가 바뀌는 첫 스텝 + 마지막 스텝'에만 '21일 15시 · 35 m/s'(모든 스텝 라벨은 v1 에서 30개가 뭉쳐 폐기된 방식 cyclone.js:786-799). 현재 위치 라벨은 이름·최대풍속, 중심기압은 값이 있는 기관만. ⑤ 기관 칩은 실질 KMA/JMA 2개(서태평양). NHC 는 다른 해역·현재점 하나뿐이라 '같은 태풍 나란히 비교' 대상이 아니고 점+Inspector 로만. JTWC 칩 없음(수집 불가). 'Category 5~1' 범례는 쓰지 않는다 — NHC 피드도 등급 번호를 주지 않고 HU/TS/TD 분류와 kt 만 준다. 기관 고유 등급명은 Inspector 에 원문 그대로. ⑥ Ensemble(토글, MODEL 배지): 멤버 선 + 타임라인 시각의 멤버 위치 점(멤버 스텝이 h 기준이라 가능), '51개 중 파일에 담긴 N개' 표기. ⑦ 모든 태풍 하위 레이어를 aboveCloudsR 하나로. 큰 면은 동심 링 2~3단으로 나눠 현(弦) 처짐 방지. ⑧ Wind field 겹치기는 02 Wind 완성 후. 켜면 트랙 구간색을 끄고 흰 리본으로(한 화면에 m/s 범례 2개 금지). ⑨ 활성 없음: '현재 활성 태풍 없음 · KMA/JMA/NHC · 확인 HH:MM' 칩. '종료된 태풍' 회색 트랙은 아카이브 색인(S)이 생긴 뒤. ⑩ tyanalog 는 지구 기본 레이어에서 빼 Intelligence > Climatology 로(sample·bins·recurve 만, guidance·steering 블록 제외), hazards/tc 피드는 Inspector 사건 목록으로. 타임 스크럽 버그(validKst) 수정은 이 작업의 첫 커밋. |
| 표현 | 폴리곤 면(확률원·실황 강풍역/폭풍역·폭풍경계역 점선) + 굵은 선(풍속 단계색 리본) + 아이콘/마커(회전 기호·날짜 라벨) + 점 구름(앙상블 멤버 위치) |
| 자료 | 지금 자료로 되는 것: JMA 스텝 circleKm·galeArea(h=0 에만)·stormArea+stormIsWatch(aws/typhoon-official/handler.py:152-188,:239), KMA 스텝 위치·풍속·기압(:389-397), events/typhoon-ecmwf.json(ECMWF Open Data CC-BY-4.0, aws/ecmwf-ingest/handler.py:324-357,:445), 발표 회차 아카이브 events/typhoon-official/archive/{태풍}/{기관}-{시각}.json(공개·불변 handler.py:52-90 — 색인 파일만 없음). 없는 것(확정): KMA 반경·확률원(수집기가 f[13]~f[17] 5열을 버림 handler.py:276-287 — 그 열에 15/25m/s 반경·70% 반경이 있는지는 기상청 API 문서 확인 필요, 있으면 수집기 S 수정), NHC 예보 트랙·cone(CurrentStorms.json 은 현재점만 — cone 은 NHC GIS 별도 수집기, P2), JMA 중심기압(수집기가 안 담음 :227-241), JTWC(403 봇 차단 handler.py:29-30 — 수집 불가). PRO 깊이: aws/tropical-intelligence → events/tropical-guidance-v2.json(ECMWF IFS/AIFS ENS 15일, CC-BY-4.0, handler.py:38,:57-63,:587)은 v2-three/js 참조 0건 = 미연결 확정. 라이선스: tyanalog 의 sample 경로는 IBTrACS(퍼블릭 도메인 aws/cyclone-analog/handler.py:414-416)지만 steering 필드와 multi-source guidance 의 DEEP_LAYER_STEERING(가중 .35)은 Open-Meteo(:691,:711,:1068-1081,:2003-2005) — 유료 화면에는 guidance·steering 을 올리지 않거나 GFS(NOMADS, public domain)로 교체. 매칭 자체가 steering 을 쓰는지는 UNKNOWN. JMA bosai 엔드포인트는 문서화되지 않은 경로(SLA 없음) — 실패 시 cone·면을 안 그리고 칩으로 알린다. |
| 재사용 | prototype/js/layers/cyclone.js:729-799(radiusFn·ringDegrees·실황/예보 구분·라벨 규칙 — 알고리즘만, Cesium 의존부 제외) · live-layers.js buildTyphoon(:2798-)·makeCyclones aSize 셰이더(:627-659)·setTimeOffset(:2857-2902)·aboveCloudsR(:247-249) · for-me-signal.js:65-75(galeArea/circleKm 판독) · intel-feed.js compareHtml(:605-) · prototype/vendor/earcut.module.js(면 삼각분할) · aws/typhoon-official/handler.py archive_records(:68-90) |
| 무료 / 유료 | 무료(안전 정보): 공식 Track·Cone·실황 Wind Area·폭풍경계역·범례·발표시각·현재 스텝 값, 그리고 '내 장소까지 거리·폭풍경계역 포함 여부'(for-me-signal.js 기존 계산 — 안전 판단에 닿는 값은 잠그지 않는다). EXPLORER: 이전 발표 회차 비교(intel-feed compareHtml :605- + 아카이브 sourceRef), 짧은 태풍 리포트, 개인화 조건 알림. PRO: KMA\|JMA split/diff(10 Compare), ECMWF ENS + 15일 가이던스(MODEL 배지), 과거 유사 태풍(Climatology), 경로·면 export. |
| 걸리는 것 | · 굵은 선 부품이 v2 에 없다 — prototype/vendor 에 three-r184·earcut·satellite 뿐, v2-three/js 에 Line2\|LineMaterial 0건, LineBasicMaterial 은 WebGL 에서 항상 1px. 해법: three/examples/jsm/lines 4파일(MIT) 벤더링 또는 자체 리본 메시 — P0 Temperature 등온선과 공용(묶음 공통 S 작업).<br>· 지구 위 텍스트 라벨 공용 부품이 없다(CanvasTexture 를 18개 파일이 제각각 구현) — P0 Temperature 의 등온선 라벨 부품을 공용으로 받아 쓴다. 없으면 이 항목은 XL.<br>· 타임 스크럽이 JMA 트랙에서 죽어 있다(validKst 미판독 live-layers.js:2832) — cone·면의 시각 연동 전에 먼저 고친다(S).<br>· stormArea 의 뜻이 h=0(실제 폭풍역)과 h>0(폭풍경계역)에서 다르다(handler.py:153-160,:185-187) — 같은 면으로 시간 재생하면 정직성 위반. 토글·이름·선 모양을 분리.<br>· KMA 반경·확률원·JMA 기압은 수집기가 버리거나 안 담는다 — API 문서 확인 후 수집기 S 수정. 확인 전에는 '미제공'으로 표기.<br>· JTWC 403·NHC 현재점만 — 콘셉트의 Model(JTWC) 칩·Category 범례는 만들지 않는다.<br>· cyclone-analog 의 steering/guidance 는 Open-Meteo — 유료 화면 제외 또는 GFS 교체.<br>· Wind field 겹치기는 02 Wind 의 비-Open-Meteo 바람장 확보(별도 자료 과제)에 종속 — 이 항목의 완료 조건에서 뺀다. |
| **완료 기준** | · JMA 발표가 있는 태풍을 켜면 70% 확률원을 이은 반투명 면과 'JMA 70% 확률원' 라벨이 보이고, 기관 칩을 KMA 로 바꾸면 '확률원 미제공'이 보인다.<br>· 현재 위치에 강풍역(노랑)·폭풍역(빨강)이 방위별 비대칭 면으로 보이고, 타임라인을 +48h 로 밀면 그 면은 사라지며 점선 '폭풍경계역(JMA 예보)'만 남는다.<br>· 트랙이 3px 이상 리본으로 보이고 구간색이 m/s 범례와 일치하며, 50× 과장에서 일본·대만 산지 위에서도 공식선·앙상블·확률원이 같은 높이로 겹쳐 보인다(묻히지 않음).<br>· 활성 태풍이 없을 때 지구에 '현재 활성 태풍 없음 · KMA/JMA/NHC · 확인 HH:MM' 칩이 보이고, JMA 가 첫 기관인 태풍에서도 타임라인을 밀면 예보 위치 표식이 움직인다. |

#### 기상 특보 · `weather.warning` — 다시 만든다 · P1 · L

| | |
|---|---|
| **Before** | 발효 중 특보를 특보구역 대표점(구역 안 관측지점 좌표 평균 aws/kma-warn/handler.py:133-135)에 7px 색 점 하나로만 찍어(buildWarn live-layers.js:723-728) 구역 범위·종류·단계가 지구 위에서 안 읽히고, 같은 구역의 복수 특보는 점이 포개지며 범례가 없다. [추가 실측·정직성 버그] 카드가 '지역 점 색상 = 기상청 공식 특보 색'이라 적지만(:740) 그 색은 수집기 주석이 스스로 '앱에서 쓰기 좋게 여기서 정한다'고 한 EARTHUS 자체 표다(handler.py:55-72). 아이콘은 이모지 문자다. |
| 돈 내는 사람 눈 | 한반도 위에 색 점 수십 개가 찍힐 뿐이라 '어디부터 어디까지 경보인가'가 보이지 않는다. 기상청 앱·windy 의 색칠된 특보 구역에 익숙한 사람에게는 무료 앱보다 못한 첫인상이다. 색이 공식색이라는 점과 카드의 집계는 정직하고 쓸 만하다. (C 빈약하다) |
| 기준 사이트 | windy: 분류 칩에 '경고'가 있다(원안 실측은 칩 존재까지). mapped.earth: 특보 메뉴 없음. 한국 15분 주기 공식 특보 + 760일 사건 이력은 EARTHUS 고유. |
| **After** | [→ 06 Hazards · severity band 우선] 점 → **구역 면**. ① 면 색 = 종류별 표시색. '기상청 공식색'이라 부르지 않는다 — 기상청 특보 지도 범례와 대조해 맞춘 뒤에만 '공식색' 표기(그 전엔 '표시색', 현 카드 문구도 수정). 단계는 **3단**: 주의보=옅은 채움+1.5px, 경보=진한 채움+3px, 중대경보=진한 채움+이중 외곽선(LEVEL 표에 3단 handler.py:74). ② 종류는 면 중앙 아이콘 — 이모지가 아니라 아이콘 시스템 v1.2 스프라이트. ③ 겹친 특보: 최고 단계 색 + 아이콘 나란히, Inspector 에 전부. ④ 기하: 공식 폴리곤은 API 에 없다(확정). 기본 기하를 정하기 전에 **선행 검증(S)**: 특보구역명 ↔ korea-admin-reference.json nameKo 매칭률을 오프라인 스크립트로 잰다. 1:1 로 맞는 구역은 ADM2 경계, 분할 구역(산지/평지·권역)은 부모 ADM2 합집합 안에서 kma-warn-stations.json 최근접 지점 분할로 나눈다(앱의 '내 구역' 판정과 같은 규칙). 어느 쪽이든 범례에 '근사 경계 — 기상청 공식 구역 폴리곤 미제공' 상시. ⑤ 렌더: 시군 크기 면을 loadFloodDistrict 처럼 '면 하나=높이 하나'로 놓으면 50× 과장에서 구역 안 산이 면을 뚫고 나온다(그 함수 주석이 정점별 높이는 수직 벽으로 찢어진다고 직접 경고 :1385-1388). → **한국 구역 id 래스터(정적 자산, 약 400m/px) + 지형에 드레이프된 패치**(buildForest 의 격자 드레이프 패턴 :2456-2524)로 그리고, 발효 특보는 구역→색 조회표만 갱신한다. 이 래스터는 산불 위험지수 시도·시군구 면과 공용. ⑥ 해상 특보구역은 기하가 없어 대표점 아이콘 유지. ⑦ 타임라인: 자료에 **해제 예정 시각이 없다**(rec 에 issuedKst·effectiveKst·commandState 만 :447-457). '발효 예정(예비특보 upcoming)=점선 외곽 · 발효 중=채움'까지만. 발효 구간 띠는 시작점만 찍고 끝은 '해제 발표 시'. ⑧ Inspector: 구역명·종류·단계·발표시각·발효시각·기관·원문 링크 + '내 위치 구역'(warning-banner.js 와 같은 판정). '해제예정' 칸은 만들지 않는다. ⑨ 0건: '현재 유효 특보 없음 · 기상청 · HH:MM' 칩. ⑩ 세계(NWS)·일본은 이 항목에서 분리(P2): NWS 는 수집기가 구역 중심점만 저장(world-alerts/handler.py:107,:156-159) → zone geometry 단순화 캐시(M) 필요, jma-warn 은 운영 정지. |
| 표현 | 폴리곤 면(구역 id 래스터를 지형에 드레이프 + 조회표 색) + 아이콘/마커(종류·해상구역) |
| 자료 | 실황: events/kma-warn.json(15분, 공공누리 1유형) 그대로 — active/upcoming·3단 level·issuedKst·effectiveKst(handler.py:447-506). 구역 기하 재료: events/kma-warn-stations.json(지점→구역 대응표, 파일 스스로 '경계선 자료가 아니라 근사' :137-150) + prototype/data/korea-admin-reference.json(geoBoundaries KOR ADM2 228개, CC BY 3.0 출처표기, purpose 가 'not a legal or safety boundary'). 매칭률·정확도는 재기 전까지 UNKNOWN — 기상청 특보구역 shape 확보 가능 여부도 UNKNOWN(확보되면 그것이 정본). 이력은 이미 있다: events/kma-warn-episodes.json 이 구역×종류 사건을 760일 보관(:52-53,:297-394, 끝 시각은 '사라진 걸 본 시각'으로 최대 15분 늦음 endIsObserved, 수집 공백 구간은 누락, collectingSince 이전은 없음). 회차 전문 보관은 아님. |
| 재사용 | live-layers.js buildForest 격자 드레이프(:2456-2524) · metaWarn(:730-742) · loadFloodDistrict 의 earcut 면 패턴은 하늘 높이 면에만(:1362-1418) · prototype/data/korea-admin-reference.json · aws/kma-warn/handler.py(STN_ZONE :49,:137-150 · EPISODES :48,:297-394) · prototype/v2-three/js/warning-banner.js · 아이콘 시스템 v1.2 |
| 무료 / 유료 | 무료(안전 정보): 구역 면·아이콘·범례·발표/발효 시각·내 구역 표시·공식 특보 알림. EXPLORER: 사건 이력으로 최근 30일 되감기, '이 구역 특보 일수'(collectingSince 이후 집계 사실만, 수집 공백 고지), 개인화 조건 알림. PRO: 특보 면 위에 실황 관측(강수·풍속) 겹쳐 비교, 이력 export. |
| 걸리는 것 | · 안전 정보에 근사 경계를 그리는 위험 — 경계 근처 사용자가 '나는 밖'으로 오독할 수 있다. 해법: 범례 상시 고지 + Inspector 의 '내 위치 구역'은 면이 아니라 기존 최근접 지점 판정으로 말한다(면과 판정이 어긋나면 판정이 우선).<br>· 구역명↔ADM2 매칭률 미측정 — 선행 검증(S) 뒤에 기본 기하를 확정. 맞지 않는 구역은 지어내지 않고 대표점 아이콘으로 남긴다.<br>· 시군 크기 면은 단일 높이로 못 놓는다(50× 과장에서 산이 뚫음, live-layers.js:1385-1388 경고) — 구역 id 래스터 + 드레이프 패치로. 래스터 빌드 도구(신규 M)가 필요.<br>· 해제 예정 시각·validTo 는 자료에 없다 — 타임라인 띠·Inspector 에서 제거.<br>· 표시색은 EARTHUS 자체 표(handler.py:55-72) — 기상청 범례 확인 전에는 '공식색' 표기 금지, 현 카드 문구(:740) 수정.<br>· 굵은 외곽선(3px)은 묶음 공통 굵은 선 부품에 종속(래스터 방식이면 셰이더 경계 검출로 대체 가능). |
| **완료 기준** | · 특보 발효 시 한반도 확대 화면에서 해당 구역이 점이 아니라 면으로 칠해지고, 주의보/경보/중대경보가 채움 세기·외곽선 3단으로 구분된다.<br>· 범례에 '근사 경계 — 기상청 공식 구역 폴리곤 미제공'과 발표기관·수집시각이 상시 보이고, 50× 과장에서 강원 산지 구역의 면이 지형에 묻히거나 뜨지 않는다.<br>· 면을 한 번 클릭하면 Inspector 에 구역명·종류·단계·발표시각·발효시각·기관이 뜨고 '해제 예정' 칸은 없다.<br>· 특보 0건일 때 '현재 유효 특보 없음 · 기상청 · HH:MM' 칩이 보이고, 카드 어디에도 '기상청 공식 특보 색'이라는 문구가 없다(대조 확인 전). |

#### 낙뢰 · `hazards.lightning` — 고친다 · P2 · M

| | |
|---|---|
| **Before** | 최근 60분 낙뢰 전부를 같은 크기 8px 가산합성 점으로 찍고, 대지방전(G)과 구름방전(C)은 #fff3a0 / #ffe066 으로 눈에 구분되지 않는다(buildLightning live-layers.js:679-690) — 수집기가 '낙뢰와 번개를 절대 섞지 말 것, 화면에서도 나눠 그린다'고 적어 둔 규칙(aws/kma-lightning/handler.py:7-11) 위반이다. 방금 친 것과 55분 전 것이 구분되지 않고, 0회일 때 지구에 변화가 없으며, 카드는 5분 수집을 '10분 주기'라 적는다(:699). |
| 돈 내는 사람 눈 | 뇌우가 있는 날 한반도에 노란 점이 흩뿌려지고, 없는 날(대부분의 날)은 눌러도 지구에 아무 일도 없다. 5분 주기 실측이라는 자료 자체는 유료급인데, 화면은 '방금 친 번개'와 '55분 전 번개'를 똑같은 점으로 그려 windy·Blitzortung 의 시간색·번쩍임에 크게 못 미친다. (C 빈약하다) |
| 기준 사이트 | windy: 메뉴 타일 '비/번개' — 강수 색면 위에 번개 표식. mapped.earth: 없음. 기상청 낙뢰관측망 점 자료(시각·kA·종류)는 EARTHUS 고유. |
| **After** | [→ 06 Hazards, 03 Rain 화면에도 같은 토글] ① 나이 단계색 5단: 0~10분 흰색 · 10~20 노랑 · 20~30 주황 · 30~45 빨강 · 45~60 암적색. 첫 구간을 0~5분으로 잡지 않는 이유: 수집 5분 + CDN max-age 120초(handler.py:153) + 화면 재수신 5분(REFRESH_MIN)이라 표시 시점에 이미 수 분이 지나 있다 — 실제 지연은 UNKNOWN 이므로 범례에 '자료 시각 HH:MM'을 같이 둔다. 나이는 tm 으로 클라이언트가 30초마다 다시 계산(재수신 없이 색 단계가 넘어감). ② **종류는 모양으로 분리**: G=채운 표식(0~10분은 확산 링), C=속 빈 작은 표식(기본 흐리게, 토글). 나이 색은 둘 다에 적용. ③ 크기 = \|kA\| 3단(<20 · 20~50 · ≥50)은 G 에만 — makePoints 는 점마다 크기를 못 준다(:606-623). makeCyclones 의 aSize 셰이더(:627-659)를 쓴다. ④ 줌아웃: 10km 셀 '60분 횟수' 단계색(1 · 5 · 10 · 25 · 50 · ≥100). **셀 집계는 수집기에서 전체 자료로** 만든다 — 실황 파일은 4,000건에서 오래된 것부터 잘리므로(handler.py:50,:118-121) 화면에서 세면 큰 뇌우일수록 적게 센다. 숫자 라벨은 상위 N셀만. ⑤ 잘렸으면 '오래된 N건 생략' 칩(truncated 필드 :147). ⑥ 0회: '최근 60분 낙뢰 0회 · 기상청 · HH:MM 관측' 칩. ⑦ 일본: fetch 교체가 아니라 **병렬 추가** — kma-lightning.json(5분·60분 창)을 유지하고 events/lightning.json 의 JMA 행만 더한다. 일본 점은 종류·세기가 없으므로(aws/lightning/handler.py:78-82) G/C 모양을 쓰지 않는 중립 표식 + '일본: 최근 30분 · 종류 미상' 범례(창을 60분으로 올리면 문구 변경). ⑧ 타임라인 −60분 스크럽은 P0 글로벌 타임라인이 '과거 분 단위 범위'를 지원할 때. 그 전엔 나이 색만(새 슬라이더 금지). ⑨ lightning-marks.js 의 GFS 파생 표식은 04 Clouds > Forecast 의 '뇌우 가능 구역(DERIVED)'으로 이름·아이콘을 달리해 분리. ⑩ 카드 '10분 주기' → 5분. |
| 표현 | 아이콘/마커(나이 단계색 × G/C 모양 × kA 크기, 확산 링) + 단계색 셀(줌아웃 집계) |
| 자료 | 지금 자료로 된다: events/kma-lightning.json 점마다 tm·kA·type(+C 는 ht)(handler.py:90-100), 5분 수집, 공공누리 1유형. 수집기 S 수정 1건: 잘림 전 전체 pts 로 10km 셀 집계를 만들어 파일에 동봉. 일별 집계는 이미 있다(events/kma-lightning-daily.json 760일, G/C 횟수·최강 kA — 점 좌표는 없음). 24h 점 재생(유료)은 점 이력 보관이 없어 신규 저장 필요(M). 일본: JMA bosai liden GeoJSON(출처 명기, 문서화 안 된 경로·SLA 없음), type 0/1 의 뜻 미공개(aws/lightning/handler.py:78-80) → 종류 표시 금지. 관측망 범위 다각형은 자료에 없음 — 그리지 않고 '한국·일본 지상 관측망 범위만' 문구로. |
| 재사용 | prototype/js/layers/lightning.js:118-125(fresh=1−age/MAX)·:153(pulse 규칙) · live-layers.js makeCyclones aSize 셰이더(:627-659) · quake-history.js 번쩍임 셰이더(:83-87) · aws/kma-lightning/handler.py · aws/lightning/handler.py |
| 무료 / 유료 | 무료: 60분 실황·나이 색·G/C 구분·범례·0회 칩. EXPLORER: '가장 가까운 낙뢰 거리·방위·몇 분 전'(좌표 거리 계산, 예측 아님), 일별 집계 리포트(daily.json), 개인화 반경 알림. PRO: 24h 점 재생(이력 저장 후), 강수·레이더 겹쳐 비교, export. |
| 걸리는 것 | · 4,000건 잘림 — 셀 집계·타임라인 초반이 비게 된다. 해법: 수집기에서 전체로 셀 집계 + '생략 N건' 칩.<br>· makePoints 는 단일 크기 — 정점별 크기 셰이더로 교체(지진·산불과 공용 부품).<br>· −60분 스크럽은 P0 글로벌 타임라인의 과거 범위 모드에 종속. 그 전엔 넣지 않는다.<br>· JMA 점은 창 30분·10분 주기·종류 미상 — 한국 점과 같은 문법으로 그리면 거짓. 중립 표식과 별도 범례 줄.<br>· 표시 지연(수집+캐시+재수신)은 실측 전 UNKNOWN — 첫 구간을 0~10분으로 넓히고 자료 시각을 상시 표기. |
| **완료 기준** | · 낙뢰가 있을 때 범례에 '몇 분 전' 5단 색과 자료 시각이 보이고, 새로 받지 않아도 1분 안에 점의 색 단계가 시간 경과에 따라 넘어간다.<br>· 대지방전(G)은 채운 표식, 구름방전(C)은 속 빈 표식으로 눈에 구분된다.<br>· 0회일 때 '최근 60분 낙뢰 0회 · 기상청 · HH:MM 관측' 칩이, 4,000건 초과 시 '오래된 N건 생략' 칩이 보인다.<br>· 한반도 전체 시점에서는 10km 셀 횟수 단계색, 확대하면 개별 낙뢰로 바뀐다. |

#### 산불 · `hazards.wildfire` — 고친다 · P2 · M

| | |
|---|---|
| **Before** | FIRMS 12km 군집 최대 900곳을 4.5px 고정 크기 가산합성 점으로 찍고 FRP 는 log 연속 그라데이션 색에만 반영한다(buildFireGlobal live-layers.js:1124-1137). 한국 산불위험지수는 시도 16개 점뿐이고(buildFire :704-710, 단계색은 코드에 박은 자체 색) 시군구 약 250곳은 목록만, 시간축·범례가 없고 fireglobal 은 자동 갱신 표에 없다(REFRESH_MIN :344-349). |
| 돈 내는 사람 눈 | 전지구로 보면 아프리카·남미에 주황 점이 빛나 '지금 지구가 어디서 타는가'가 한눈에 들어온다 — FIRMS·windy 의 화점 지도와 비슷한 수준의 첫인상이다. 그러나 확대하면 12km 군집 점 하나뿐이라 불의 크기·번짐·새로 난 불이 안 보이고, 한국 위험지수는 점 16개라 빈약하다. (B 손보면 된다) |
| 기준 사이트 | mapped.earth: LAND > Fires(전지구 화점). windy: POI '화재'. 둘 다 hot spot 점 지도 수준 — 세기 크기·지속·새 탐지는 주지 않는다. |
| **After** | [→ 06 Hazards · hot spot 과 perimeter 구분] 이 M 은 **지금 자료로 되는 것만** 덮는다. ① Hot spot: 크기+색 모두 FRP 5단 — **30~100 · 100~300 · 300~1,000 · 1,000~3,000 · ≥3,000 MW**. 원안의 '8~30' 구간은 비어 있다(군집 합산 30MW 미만은 수집기가 버림 aws/wildfire/handler.py:83). 범례에 '12km 군집 합산 FRP'. ② **가산합성 폐기** — 아프리카·동남아 밀집 지역에서 단계색이 흰 덩어리로 합쳐진다. 일반 블렌딩 + 어두운 테두리 + FRP 큰 것이 위. 정점별 크기는 makeCyclones aSize 셰이더로. ③ '새 불' 링의 이름을 고친다: isNew/firstSeen 은 **EARTHUS 가 처음 본 시각**이지 발화가 아니고(handler.py:320-332), 상위 900 진입·12시간 관측 끊김 뒤 재등장도 새 ID 가 된다(:64,:84). → '첫 탐지 24시간 이내(EARTHUS 수집 기준)' 흰 링, 지속 라벨은 '첫 탐지 후 3일(연결은 추정)'(ID 승계는 수집기 스스로 추정이라 적음 :39-42). ④ 24h 재생: wildfire.json 은 현재 상태 한 장뿐이고 개별 화재 시계열은 비공개 archive/ 에만 쌓인다(aws/archiver/handler.py:28-29,:735-757). → 공개 파생 파일 events/wildfire-24h.json(수집 3시간 간격이면 8프레임) 롤업(S~M) 뒤에. 그 전엔 재생 없음. ⑤ 열점≠산불·구름 가림·12km 군집 고지를 범례 옆 상시 문구로. ⑥ 한국 위험지수(OFFICIAL_FORECAST 배지, 별도 칩): 점 → 시도 면 4단계 + 시군구 면(이름 매칭되는 곳만, 나머지는 목록 유지). 면은 특보와 공용인 한국 구역 id 래스터 드레이프. 색은 산림청 범례 확인 후에만 '공식색' 표기. 관측(FIRMS)과 예보(위험지수)는 배지·칩으로 분리. ⑦ REFRESH_MIN 에 fireglobal 60분 추가. ⑧ Wind 겹치기는 02 Wind 완성 후, 번짐 방향을 말하는 문장은 쓰지 않는다. [분리 — 선행 '자료 확보'] 확대 시 375m 원 화점(FIRMS 지역 타일 수집기 신규, L)·Perimeter(미국 NIFC WFIGS 수집기 신규 M, 미국만; 그 밖 지역은 범례에 'hot spot only — 화선 자료 없음')는 이 항목 완료 조건이 아니다. |
| 표현 | 아이콘/마커(FRP 단계 크기·색, 일반 블렌딩) + 폴리곤 면(한국 위험지수 — 구역 래스터 드레이프) |
| 자료 | 지금 자료: events/wildfire.json 군집별 frp·peak·count·spanKm·firstSeen·peakFrp·movedKm·isNew·link(aws/wildfire/handler.py:234-246,:306-332), 제약 = 12km 군집·픽셀 FRP≥8·군집 FRP≥30·상위 900(:79-84)·수집 3시간(절약 모드). NASA FIRMS 는 공개·출처표기. 이력: archive/wildfire 에 fid 시계열이 쌓이지만 비공개 접두사 → 공개 롤업 필요. 한국: events/forest-fire-kr.json(산림청, 3시간) + korea-admin-reference.json(ADM2 228, CC BY 3.0) — 시군구명 매칭률 UNKNOWN(2020 경계라 행정구역 변경분 불일치 예상). 산림청 공식 범례색 UNKNOWN. Perimeter: FIRMS 에 없음. NIFC WFIGS(미 정부 public domain), EFFIS(이용 조건 확인 필요), 한국 산림청 실시간 현황 API 유무 UNKNOWN. |
| 재사용 | live-layers.js buildFireGlobal(:1124-1137)·buildFire(:704-710)·makeCyclones aSize 셰이더(:627-659)·buildForest 드레이프(:2456-2524) · aws/wildfire/handler.py · aws/archiver/handler.py(:735-757 롤업 원천) · aws/forest-fire/handler.py · prototype/data/korea-admin-reference.json |
| 무료 / 유료 | 무료: 전지구 hot spot(단계 크기·색)·첫 탐지 링·한국 위험지수 면·범례·24h 재생(롤업 후). EXPLORER: 7일 이력 재생, 군집별 FRP 추이 미니 그래프(archive 기반 — '같은 불' 연결은 추정 고지)+리포트, 개인화 반경 알림. PRO: 화선·바람·습도 겹쳐 비교, 기간 diff, export. |
| 걸리는 것 | · 원안 dataNeed 가 '(수집기 확장, L)'이라 적고 size 는 M 인 자기모순 — 375m 타일(L)·Perimeter(M)를 선행 자료 확보 작업으로 분리하고 M 은 ①②③⑤⑥⑦ 만 덮는다.<br>· '새 불'·'N일째'는 수집기의 추정 연결 — 이름과 Inspector 문구로 '첫 탐지·추정'을 밝힌다.<br>· 24h 재생은 공개 롤업 파일이 생기기 전엔 불가(archive/ 비공개). 3시간 수집이면 8프레임 — 유료 공개 전 수집 주기 복원은 비용 결정(PD).<br>· 한국 면은 특보와 공용 구역 래스터에 종속(특보 항목의 선행 작업).<br>· 산림청 색·시군구 매칭률 UNKNOWN — 확인 전 '공식색' 표기 금지, 안 맞는 시군구는 목록 유지. |
| **완료 기준** | · 전지구 시점에서 화점이 30MW 부터 5단의 크기·색으로 구분되고, 아프리카·동남아 밀집 지역에서도 흰 덩어리로 뭉개지지 않고 단계색이 읽힌다.<br>· 범례 옆에 '열점 ≠ 산불 · 12km 군집 합산 FRP · VIIRS NRT · 수집 N시간 전'이 상시 보인다.<br>· 흰 링이 붙은 화점을 누르면 Inspector 에 '첫 탐지 시각(EARTHUS 수집 기준) · 같은 불 연결은 추정'이 적혀 있다.<br>· 한국 확대 시 위험지수가 시도 면 4단계색으로 보이고 FIRMS(OBSERVED)와 위험지수(OFFICIAL_FORECAST) 배지가 다르다. |

#### 지진 · `hazards.earthquake` — 다시 만든다 · P1 · L

| | |
|---|---|
| **Before** | 메뉴를 눌러도 지구에는 아무것도 켜지지 않고 피드 패널만 열린다(main.js:4528-4537). 지구 위 표식은 USGS 4.5_day 피드의 앞 14건만(intel-feed.js:22,:377) 크기·색이 거의 같은 DOM 점이고 고도 400km 아래에서 전부 사라진다(:800). 색은 규모로 우리가 매긴 Red/Orange/Green 이다(:388 — 기관 경보 등급 아님). 극적인 '지진 25년'(181,751건)·'지진 깊이'는 펼치기 안에 있고, 25년 점의 깊이 색은 셰이더에서 연속 보간이다(quake-history.js:44-58 — 범례는 7단인데 그림은 그라데이션). 자막은 '2001 → 오늘'인데(:344) 자료는 2026-09-01 에 받은 정적 번들이다(quakes/quakes.json retrieved). |
| 돈 내는 사람 눈 | '지진'을 누르면 목록 패널이 열릴 뿐 지구는 그대로고, 떠 있는 것은 크기도 색도 거의 같은 10px 점 14개다 — 확대하면 그마저 사라져 고장처럼 보인다. 반면 한 단계 안쪽의 '지진 25년'과 '지진 깊이'는 판 경계가 스스로 그려지고 섭입대가 지구 속으로 파고드는, 이 앱에서 손꼽히게 극적이고 그대로 팔 수 있는 그림이다. 좋은 것이 대표 자리에 없다. (C 빈약하다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. 25년 재생·실제 진원 깊이·쓰나미 도달시간 연결은 두 사이트에 없는 팔 거리. |
| **After** | [→ 06 Hazards · 진앙·규모·깊이 동시] ① DOM 비컨 폐기 → WebGL 실황 지진 점(정점별 크기 셰이더). 크기=규모 4단(M4.5~5 · 5~6 · 6~7 · ≥7), 색=깊이 **단계색 7단**(0·25·50·100·200·400·800km — 셰이더의 mix 보간을 구간 고정으로 바꿔 실황·25년이 같은 눈금, 절대 규칙 4). M≥6 은 'M6.8' 숫자 라벨, 최근 1시간은 확산 링. 14건 절단·400km 숨김·규모 기반 자체 경보색 제거, surfR 로 지형 위에. 기간 칩 24시간/7일/30일(USGS 4.5_week·4.5_month, 30일 수백 건). ② 사건 선택 → Inspector(규모·깊이·발생시각 UTC/KST·기관·원문) + ShakeMap 등진도선(USGS cont_mmi.json, 색은 파일 값 그대로). **ShakeMap 이 없는 사건이 많다** → '이 사건은 USGS ShakeMap 없음' 표기, 만들지 않는다. 한국·일본 진도는 quake-asia 의 **지역명 문자열**(예: 최대진도 Ⅱ(경남,전남광주))이라 우선 Inspector 텍스트로. 시도명이 ADM2 regionKo 와 맞는 것만 지구 라벨(P2), 안 맞으면 텍스트로만. 쓰나미 도달시간 파일이 있으면 1탭 연결(intel-feed.js:712 이미 연결). ③ Inspector 칩 'Live / 25 Years / Depth' 로 첫 화면 1탭 승격. eqhistory 자체 재생바는 P0 글로벌 타임라인이 '범위 교체(2001~자료 끝)'를 지원하면 폐기. 그 전 과도기에는 25년 모드에서 글로벌 타임라인을 숨겨 화면에 시간축이 하나만 보이게. 자막은 '2001 → 2026-09-01 수집분'. ④ 판 경계선은 컨텍스트 토글, 고정 1.0022(quake-history.js:380) → 지형 타기. ⑤ 실황 10분 재수신. ⑥ quake-asia 조기경보 전문의 '우리 전달은 늦을 수 있다' 유지. ⑦ 지역 기관 소규모 지진(events/regional.json)은 USGS 와 중복되므로 섞지 않고 별도 칩(수집기 주석의 규칙). ⑧ 범례 상시: 규모 크기 + 깊이 7단 + MMI + 출처·수집시각. |
| 표현 | 아이콘/마커(규모 크기 × 깊이 단계색 셰이더 점, 확산 링, 숫자 라벨) + 등치선(ShakeMap 등진도선·쓰나미 등시선) |
| 자료 | 실황: USGS 4.5_day/week/month.geojson(미 정부 public domain, CORS 열림). ShakeMap cont_mmi.json 은 사건 상세 → products.shakemap 2회 요청, v1 이 이미 받음(prototype/js/layers/eventfocus.js:12). 한국·일본: events/quake-asia.json(기상청 공공누리 1유형·JMA 출처 명기, 10분 schedules.sh:43) — v2 에서는 내 장소 카드에만 쓰임(main.js:3419, for-me-signal.js:20), 지구 레이어 미연결. intensity 는 문자열(aws/quake-asia/handler.py:100-130,:168). 25년: 정적 번들 quakes.bin(1.0MB, retrieved 2026-09-01T12:44Z) — 갱신은 Lambda 가 아니라 tools/build-quakes.py 재실행+재배포(S, 자동화하면 M). |
| 재사용 | quake-history.js(셰이더 점 :30-90, 깊이 팔레트 :14-22, 범례 :334-352, togglePlates :363-399) · prototype/js/layers/eventfocus.js(등진도선 알고리즘 — Cesium 그리기부 제외) · intel-feed.js(ingestEQ :374-410 · drawIsochrones :582-598 · 사건 방) · live-layers.js makeCyclones aSize(:627-659)·surfR(:241-244) · tools/build-quakes.py · aws/quake-asia/handler.py · aws/regional-hazards/handler.py |
| 무료 / 유료 | 무료(안전 정보): 실황 지진·선택·ShakeMap·진도·쓰나미 연결, 25년 전지구 재생(미끼). EXPLORER: 내 장소 반경 25년 통계 리포트(횟수·최대 규모·깊이 분포 — 발생 확률·예측 문장 없음), 지역·기간·규모 필터 재생. PRO: 섭입대 깊이 단면 도구, USGS vs 기상청/JMA 규모·위치 비교(10 Compare), export, 규모 조건 알림. |
| 걸리는 것 | · '25년 → 글로벌 타임라인 모드'는 P0 셸의 타임라인이 범위 교체를 지원해야 한다 — 과도기엔 글로벌 타임라인을 숨기고 기존 재생바 하나만.<br>· 등진도선 굵기·'M6.8' 라벨은 묶음 공통 굵은 선·라벨 부품에 종속.<br>· 깊이 색이 셰이더에서 연속 보간(quake-history.js:52-57) — 구간 고정으로 바꿔야 범례 7단과 그림이 일치.<br>· ShakeMap 은 모든 사건에 있지 않다 — 없으면 없다고 적는다. 진도 문자열의 지역명→좌표 매칭은 한 단계 더 필요(안 맞으면 텍스트).<br>· 25년 번들은 수동 재생성 — '오늘'이라 쓰지 않고 자료 끝 날짜를 표기. 유료에서 최신을 팔려면 build-quakes.py 월 1회 재실행 운영 절차(S). |
| **완료 기준** | · 지진 메뉴를 1탭 하면 패널만이 아니라 지구에 최근 24시간 지진이 규모 크기 × 깊이 단계색 점으로 즉시 보이고, 고도 400km 아래로 확대해도 사라지지 않는다.<br>· 범례의 깊이 7단 색과 지구 위 점 색이 구간 단위로 일치한다(그라데이션 아님), M≥6 사건에는 'M6.8' 같은 숫자 라벨이 붙는다.<br>· 사건을 한 번 클릭하면 Inspector 에 규모·깊이·발생시각·기관·원문이 뜨고, ShakeMap 이 있는 사건은 등진도선이, 없는 사건은 'ShakeMap 없음'이 보인다.<br>· '25 Years' 칩을 누르면 화면에 시간축이 하나만 보이고 자막이 '2001 → 2026-09-01 수집분'처럼 실제 자료 끝 날짜를 말한다. |

#### 지각 이동 속도 · `hazards.crustal_motion` — 합친다 · P2 · S

| | |
|---|---|
| **Before** | 메뉴를 눌러도 지구에는 아무것도 그려지지 않고 lab/crust DOM 카드 한 장만 뜬다(main.js:4197-4209 — 원안 인용, 카드 본문은 ext/lab-crust.js). 바로 아랫줄 '지각 이동'과 같은 파일(events/crustal.json)·같은 질문의 중복 행이고, 레지스트리도 어긋난다(PHENOMENA.dataProducts :36 은 hazards/crustal 포함, LAYER_PHENOMENON :826 은 그 레이어를 land.crustal_motion 소속으로, :853 은 lab/crust 만 이 현상으로). 카드의 2011 동일본대지진 변위 수치(3.42m·1.97m·대전 2.3cm)는 코드에 박힌 글자이고 출처 표기가 없다. |
| 돈 내는 사람 눈 | 재해 메뉴에서 '지각 이동 속도'를 누르면 글 카드 한 장이 뜨고 지구는 그대로다. 글 자체는 정직하고 잘 썼지만(못 하는 것을 먼저 말함), 바로 아랫줄 '지각 이동'이 같은 파일로 화살표를 그리고 있어 메뉴가 중복으로 보인다. (C 빈약하다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. |
| **After** | [→ 자리 없음 · PD 결정 필요] 메뉴 행을 없애고 land.crustal_motion 하나로 **MERGE**. 카드 내용(한국·일본 중앙값 속도·방위, '판 전체가 함께 간다' 설명, 자료 한계)은 합쳐진 레이어의 Inspector > Analysis 탭으로 — 수치→출처→설명 순서(절대 규칙 7). 2011 사례 수치는 **출처를 달 수 있을 때만** 옮기고, 못 달면 뺀다(없는 근거로 숫자를 말하지 않는다). '그 레이어 켜기' 버튼(lab-crust.js)은 사라진다. 레지스트리는 현상만 합치고 **레이어 id 는 바꾸지 않는다**(hazards/crustal·lab/crust 그대로, 검사기 통과 확인). 최종 자리는 PD 결정(09 Terrain 'Plates & Motion' / 06 Hazards > Earthquake 컨텍스트 / 보조 서랍 / v1). |
| 표현 | DOM 카드 → Inspector 탭으로 흡수 |
| 자료 | 추가 자료 불필요 — events/crustal.json(UNR MIDAS, 하루 1회 aws/schedules.sh:46). 2011 사례 수치의 출처는 UNKNOWN(코드에 없음). |
| 재사용 | prototype/v2-three/js/ext/lab-crust.js(문안·중앙값 표시) · phenomenon-registry.js(:26-37,:826,:853 정리 대상) |
| 무료 / 유료 | 단독 유료 가치 없음. 합쳐진 '지각 이동'의 Inspector 설명으로만 남는다. |
| 걸리는 것 | · 레지스트리는 얼린 ES 모듈이고 레이어 id 개명 금지 규칙이 있다 — 현상 키만 합치고 검사기(LAYER_TRUTH 포함)를 돌려 확인.<br>· 2011 사례 수치의 출처가 코드에 없다 — 출처 확보 또는 삭제.<br>· 자리는 PD 결정 필요. |
| **완료 기준** | · 재해 메뉴에 '지각 이동'이 한 줄만 보인다(중복 행 없음).<br>· 합쳐진 레이어의 Inspector Analysis 탭에 한국·일본 중앙값(mm/년·방위)이 출처·수집시각과 함께 먼저, 설명 문장이 그 아래에 보인다.<br>· 출처를 달지 못한 사례 수치는 화면에 없다. |

#### 지각 이동 · `land.crustal_motion` — 옮긴다 · P2 · M

| | |
|---|---|
| **Before** | GNSS 실측 1,352점을 화살촉 없는 1px 선분 + 2.6px 점으로 그려(buildCrustal live-layers.js:1610-1638) PD 가 싫어하는 '막대기 밭'이고, 전지구 시점에서는 선이 몇 픽셀이라 흐린 점 떼로 보이며 색은 연속 보간, 범례가 없다. 판 경계선은 고정 반지름 1.0022(quake-history.js:380). |
| 돈 내는 사람 눈 | 실측 GNSS 1,352점이라는 재료는 드물고 값진데, 화면은 PD 가 싫어하는 바로 그 '짧은 막대기' 밭이다. 화살촉이 없어 어느 쪽으로 가는지 한눈에 안 읽히고, 전지구에서는 점구름, 확대해야 겨우 선이다. 판 경계·지진 25년과 겹치면 이야기가 되지만 그 조합은 사용자가 직접 찾아 켜야 한다. (C 빈약하다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. |
| **After** | [→ 자리 없음 · PD 결정 필요] 1안 09 Terrain 의 'Plates & Motion', 2안 06 Hazards > Earthquake 컨텍스트 토글, 3안 v1. 어느 안이든 hazards.crustal_motion 을 흡수한 하나의 현상. **재작업 전까지는 레일에서 내려 둔다**(막대기 밭을 유료 화면에 노출하지 않기). 그림(지금 자료로): ① 막대기 폐기 → 화살촉 있는 화살표 글리프(InstancedMesh, 드로우콜 1). **길이는 고정(방향만 말한다), 빠르기는 단계색 5단**(mm/년 0~5 · 5~15 · 15~30 · 30~50 · ≥50) — 원안의 '최소 픽셀 길이 보장'은 길이가 속도를 뜻하지 않게 만들므로 길이 인코딩 자체를 버린다. ② 전지구 시점은 격자 솎기 + 'N곳 중 M곳 표시' 문구, 한국·일본 확대 시 전부. ③ 켤 때 카메라를 강제로 옮기지 않고 '한국·일본 보기' 칩으로. 라벨 '한국 중앙값 N mm/년 → 방위'(crustal.json korea/japan). ④ 판 경계선(PB2002) 기본 ON, 지형 타기. ⑤ 범례 상시: mm/년 5단 + '연평균 속도 · 최종 좌표 약 한 달 지연 · UNR MIDAS', 타임라인 비활성 표시. [분리 — P3] '판 기준 잔차' 모드와 '판 회전 모델 입자'는 새 자료(오일러 극 표 + 판 폴리곤)와 기준계 정합 검토가 필요한 별도 과학 작업이고 유료 견인력이 없다 — 이 항목 범위에서 뺀다. |
| 표현 | 아이콘/마커(고정 길이 화살표 글리프·속도 단계색) + 선(판 경계) |
| 자료 | 지금 자료로 된다 — events/crustal.json(UNR MIDAS IGS14, 1,352점 표시 / 원본 20,168지점, 하루 1회, 인용 표기) + 번들 quakes/plates.json(Bird 2003 PB2002, ODC-BY 1.0, 선 241개 — 폴리곤 아님). 분리한 P3 에는 강체 판 회전 모델(예: NNR-MORVEL56 오일러 극, 공개 논문 수치)과 PB2002 판 폴리곤이 추가로 필요. 사건 변위 시계열은 자료에 없음 — 만들지 않는다. |
| 재사용 | live-layers.js buildCrustal(:1610-1638)·surfR(:241-244) · quake-history.js togglePlates(:363-399) · ext/lab-crust.js · tools/build-plates.mjs |
| 무료 / 유료 | 무료: 화살표·판 경계·범례·한국/일본 중앙값. EXPLORER: 관측점 클릭 정확값(속도·방위·불확도·관측 기간)+지역 요약. PRO: 지진 25년·깊이와 동기화 비교, export. 돈을 끄는 메뉴가 아니라 지진의 맥락 자산. |
| 걸리는 것 | · 원안 ④⑤(잔차·판 입자)는 없는 자료 전제 + 과학 검증 부담 — P3 별도 항목으로 분리.<br>· '최소 픽셀 길이 보장'은 길이=속도 인코딩을 깨뜨린다 — 길이 고정·색 단계로.<br>· 1,352개 화살표는 전지구 시점에서 다시 떼가 된다 — 줌 단계 솎기와 표시 개수 고지.<br>· 자리는 PD 결정 필요. 결정 전까지 레일 비노출. |
| **완료 기준** | · 한국·일본 확대 시 관측점마다 화살촉이 있는 같은 길이의 화살표가 실측 방위를 가리키고, 색이 범례의 mm/년 5단과 일치한다.<br>· 전지구 시점에서 화살표가 솎여 보이고 'N곳 중 M곳 표시'가 적혀 있다.<br>· 범례에 '연평균 속도 · 최종 좌표 약 한 달 지연 · UNR MIDAS'가 상시 보이고 타임라인은 비활성으로 표시된다. |

#### 쓰나미 · `hazards.tsunami` — 고친다 · P1 · M

| | |
|---|---|
| **Before** | [원안 미수신 — 입력 JSON 이 이 항목에서 잘렸다. 아래는 코드 실측만으로 쓴 기준안] 공식 발표를 11px 점 3색(유효=빨강·정보문=하늘·기타=회색)으로만 찍는다(buildTsunami live-layers.js:745-753). EARTHUS 도달시간 계산(SIMULATION_ONLY)의 등시선은 지진 사건 방을 열었을 때만, 13단 레벨(aws/tsunami-eta/handler.py LEVELS_MIN)을 **한 가지 주황 1px 선**으로, 고정 반지름 1.006 에 그린다(intel-feed.js:582-598,:712) — 30분선과 12시간선이 같은 색이고 숫자 라벨·범례가 없다. |
| 돈 내는 사람 눈 | '쓰나미'를 누르면 태평양에 점 몇 개가 찍히고(대부분 회색·파랑 = 위험 없음 기록) 그게 전부다. 이 앱이 실제로 가진 가장 유료다운 자산 — 우리 해안 도달시간 계산과 등시선 — 은 이 메뉴에서 닿지 않고 '지진→사건→방' 세 번을 돌아가야 나온다. (C 빈약하다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유(도달시간 계산 연결). |
| **After** | [→ 06 Hazards · Event-first] ① 공식 발표가 먼저: 발표 기관·분류(Warning/Advisory/Information)·발표시각·유효기간을 Inspector 맨 위에(OFFICIAL_WARNING), '회색 점은 유효 경보가 아니다' 고지 유지. 분류별 아이콘 모양을 달리해 색만으로 구분하지 않게. ② 사건 선택 시 등시선을 **시간 단계색 6단**(≤60 · 120 · 180 · 300 · 480 · 그 이상 분 — v1 eventfocus.js ISO_COLOR 그대로) + 선 위 '60분·120분' 숫자 라벨 + 범례. ③ 연안 지점 ETA 마커(STATIONS, 한국 10곳 먼저)에 '부산 +95분' 라벨. 값이 null 인 지점은 그리지 않는다. ④ SIMULATION_ONLY 배지와 한계 3줄(파고·침수 아님 / 0.2° 격자 / 진원은 점)을 범례 옆 상시. PTWC 게시문 ETA 가 있으면 Inspector 에 '공식 ETA vs EARTHUS 계산' 차이를 나란히. ⑤ 등시선은 바다 위 선이라 해수면 반지름에(육지 위로 지나가지 않게 기존 데이터 그대로). ⑥ 유효 발표 0건: '유효기간이 확인된 쓰나미 발표 없음 · NOAA/PTWC · HH:MM 수집 — 경보 유무는 기관 원문 확인' 칩(현 카드 문구 승계). ⑦ 색면(도달시간 밴드 채움)은 지금 파일로 불가 — 파일에 등시선 선분만 있고 격자가 없다. 필요하면 수집기가 0.5° 양자화 격자를 동봉(S)한 뒤. |
| 표현 | 등치선(도달시간 단계색 + 숫자 라벨) + 아이콘/마커(발표 분류·연안 ETA) |
| 자료 | 지금 자료로 된다 — events/tsunami-intl.json(NOAA tsunami.gov·PTWC·NTWC, 미 정부 자료) + ocean/tsunami-eta/{usgsId}.json·색인 ocean/tsunami-eta.json(최근 30일, M≥6.5·깊이≤100km 바다 지진만, GEBCO 0.2° Dijkstra, 등시선은 0.5° 판, 15분 스케줄). 404=계산 대상 아님. 파고·침수는 계산하지 않는다 — 만들지 않는다. |
| 재사용 | prototype/js/layers/eventfocus.js:22-26(ISO_COLOR) · intel-feed.js drawIsochrones(:582-598) · event-room.js:32-34(TSU_ETA_URL) · live-layers.js buildTsunami·metaTsunami(:745-773) · watch.js:87-100 · aws/tsunami-eta/handler.py |
| 무료 / 유료 | 무료(안전 정보): 공식 발표·등시선·연안 ETA·범례 전부, 공식 발표 알림. EXPLORER: 내 해안 기준 도달시간 알림 조건(watch.js tsunami-eta-sim 이미 있음, simulation:true 고지), 최근 30일 사건 되돌려 보기. PRO: 과거 사건 계산본 비교·export. |
| 걸리는 것 | · 원안 미수신 — 오케스트레이터가 가진 원안과 대조 필요.<br>· 등시선 굵기·숫자 라벨은 묶음 공통 굵은 선·라벨 부품에 종속.<br>· 계산본을 공식 경보처럼 읽히게 하면 안 된다 — 공식 발표를 항상 위에, SIMULATION_ONLY 배지 고정.<br>· 밴드 채움은 격자 미동봉으로 불가 — 선+라벨로 가고, 채움은 수집기 S 수정 뒤. |
| **완료 기준** | · M6.5 이상 바다 지진을 선택하면 등시선이 시간 단계색 6단으로 보이고 선 위에 '60분·120분' 숫자가 읽힌다.<br>· 한국 연안 지점에 '부산 +NN분' 라벨이 보이고, 계산값이 없는 지점은 표식이 없다.<br>· 범례 옆에 SIMULATION_ONLY 배지와 '파고·침수 아님' 문구가 상시 보이고, Inspector 맨 위는 공식 발표(기관·분류·시각)다. |

#### 연안 침수 범위 · `ocean.coastal_inundation` — 옮긴다 · P2 · S

| | |
|---|---|
| **Before** | [원안 미수신 — 코드 실측만으로 쓴 기준안] 국립해양조사원 침수 예상도를 시군구 bbox 중심의 9px 점으로만 보여 주고(buildFloodIndex live-layers.js:1326-1341), '물이 육지를 덮는' 폴리곤은 카드 안 시군구 버튼을 눌러야 받는다(metaFloodIndex :1345-1347, loadFloodDistrict :1362-1418). 기관이 제공하는 70개 시군구만 있고 강원 동해안은 원본에 없다. 정적 시나리오 자료이고 수동 Lambda 호출로만 갱신된다(registry :214-217). '재해' 묶음에 있지만 사건이 아니라 기관 시나리오다. |
| 돈 내는 사람 눈 | 시군구를 고른 뒤의 화면 — 실제 해안선 위로 깊이별 색면이 덮이고 카메라가 비스듬히 내려가는 장면 — 은 이 앱에서 유일하게 '물이 땅을 덮는' 그림이고 돈 낼 만한 설득력이 있다. 문제는 입구다: 처음 보이는 것은 파란 점 70개와 버튼 70개짜리 카드라, 그 장면이 있다는 것을 모르고 지나치기 쉽다. (B 손보면 된다) |
| 기준 사이트 | 기준 사이트에 없음. |
| **After** | [→ 자리 PD 결정 필요] Event-first 인 06 Hazards 에 사건이 아닌 시나리오 지도가 있는 것이 어색하다 — 1안 05 Ocean 의 'Sea level & Inundation' 보조 모드, 2안 12 Simulation 의 '기관 시나리오' 입구, 3안 현 위치 유지. 그림: ① 버튼 클릭 대신 **카메라가 연안 축척으로 들어오면 화면 안 시군구(최대 2~3곳)만 자동 온디맨드 로드** — 70곳 선로드 금지. 전지구·권역 시점에서는 점 대신 '자료 있는 해안선 구간' 강조. ② 깊이 구간(m) 단계색 범례 상시(자료가 이미 구간형 f.v). ③ Inspector: 기관·산출 기준시각·시나리오 가정 원문 + '현재 침수 관측이나 이번 태풍 예보가 아닙니다' 상시. ④ 자료 없는 곳 목록 유지('없음=위험 없음이 아님'). ⑤ 이 자료를 '해수면이 오르면 어디가 잠길까'(sim-questions NOT_AVAILABLE)의 답으로 연결하지 않는다 — 기관 시나리오의 가정이 해수면 상승인지 확인되기 전에는(UNKNOWN) 서로 다른 제품이다. |
| 표현 | 폴리곤 면(깊이 구간 단계색, 온디맨드) |
| 자료 | 지금 자료로 된다 — ocean/khoa/flood-index.json + ocean/khoa/flood/{sggCd}.json(국립해양조사원, aws/khoa-coast 수동 호출). 시나리오 가정(해일·조위·재현빈도 등)이 파일 note 에 어떻게 적혀 있는지는 이번에 열어 보지 않음 — UNKNOWN. |
| 재사용 | live-layers.js buildFloodIndex·metaFloodIndex·loadFloodDistrict(:1326-1423) |
| 무료 / 유료 | 무료: 침수 예상 범위·범례·가정 고지. EXPLORER: 내 장소가 침수 예상 범위 안/밖인지와 깊이 구간(기관 값 그대로), 시군구 요약 리포트. PRO: export. |
| 걸리는 것 | · 원안 미수신 — 오케스트레이터가 가진 원안과 대조 필요.<br>· 자리는 PD 결정 필요(Hazards / Ocean / Simulation).<br>· 시나리오 가정 미확인 — 확인 전에는 해수면 상승 전망과 연결하는 문장을 쓰지 않는다. |
| **완료 기준** | · 연안 도시로 확대하면 버튼을 누르지 않아도 화면 안 시군구의 침수 예상 범위가 깊이 구간 단계색 면으로 보인다.<br>· 범례 옆에 '기관 산출 시나리오 · 현재 침수 관측·이번 태풍 예보 아님'과 산출 기준시각이 상시 보인다.<br>· 자료가 없는 해안(강원 동해안 등)에는 면이 없고 '자료 없음' 목록에 이름이 있다. |

#### 빙하호 홍수 · `hazards.glacial_lake_flood` — 뺀다 · P3 · S

| | |
|---|---|
| **Before** | [원안 미수신 — 코드 실측만으로 쓴 기준안] 레지스트리에서 availability 'planned', 능력 7칸 전부 false, evidenceProfile 'NONE' 이다(phenomenon-registry.js:50-63). 수집기(aws/glacial-lake-us)는 배포 대기이고 live-layers.js 에 이 레이어의 fetch·build 분기가 없다. 대상은 알래스카 주노 멘덴홀 강 한 곳뿐이며, 그것도 호수가 아니라 호수 아래 강 수위다. |
| 돈 내는 사람 눈 | 돈 낸 사람이 재해 메뉴 맨 아래 줄을 누르면 '제공하지 않습니다'가 나온다. 정직하긴 하지만 유료 메뉴에 죽은 줄이 하나 걸려 있는 것이고, 한국 사용자에게는 애초에 와닿지 않는 현상이다. (D 망가져 보인다) |
| 기준 사이트 | 기준 사이트에 없음. |
| **After** | [→ REMOVE · PD 결정 필요] 자료가 운영에 들어오기 전에는 좌측 레일·메뉴에 자리를 만들지 않는다('자료 없는 칸은 안 만듦' 규칙). 레지스트리 항목은 지우지 않고 planned 로 둔다. 복귀 조건: events/glof-alaska.json 이 운영에 들어오고 USGS 실측·NWS 공식 예보를 그대로 인용할 수 있을 때, 06 Hazards 의 **사건 카드 하나**(지점 마커 + 수위 시계열 + NWS 홍수 단계선)로 — 전용 메뉴 행이 아니라. 빙하호 붕괴 물길은 어느 곳도 계산하지 않는다(계약 §H 유지). |
| 표현 | 없음(현재) → 복귀 시 아이콘/마커 1개 + Inspector 시계열 |
| 자료 | 지금 자료 없음 — aws/glacial-lake-us 배포 대기(registry :59-60). 복귀 시 USGS 15052500·NWS MNDA2(미 정부 자료). |
| 재사용 | phenomenon-registry.js:50-63 · aws/glacial-lake-us · aws/configure-glacial-lake-us-schedule.sh |
| 무료 / 유료 | 없음. |
| 걸리는 것 | · 원안 미수신 — 오케스트레이터가 가진 원안과 대조 필요.<br>· 메뉴에서 내리는 것은 PD 결정 필요(자료가 들어오면 사건 카드로 복귀). |
| **완료 기준** | · 재해 메뉴에 '빙하호 홍수' 행이 보이지 않는다(자료 운영 전).<br>· 레지스트리 검사기가 통과한다(항목은 planned 로 남아 있음). |

<details><summary>반박 검증에서 뒤집거나 낮춘 것 (21)</summary>

- [태풍·정직성] 원안 ③ 'Wind Area 를 타임라인에 따라 그 시각 스텝의 면으로 바꾼다'를 뒤집었다. galeArea 는 실황(h=0)에만 나오고, h>0 의 stormArea 는 실제 폭풍역이 아니라 진로 불확실성을 더한 '폭풍경계역'이다(aws/typhoon-official/handler.py:153-160,:183-187 — 주석이 '+12h 230km → +117h 440km, 태풍이 커지는 게 아니다'라고 경고). 같은 면으로 재생하면 태풍이 자라는 거짓이 된다 → 실황 면은 h=0 전용, 폭풍경계역은 별도 토글·점선·다른 이름(v1 cyclone.js:735-750 규칙).
- [태풍·자료] 'KMA·NHC 스텝에 같은 필드가 있는지 UNKNOWN'을 KNOWN 으로: KMA 스텝에는 반경·확률원이 없다(handler.py:389-397, 수집기가 f[13]~f[17] 5열을 버림 :276-287 — 그 열의 내용은 API 문서 확인 필요), NHC 는 h=0 한 점뿐이라 트랙·cone 자체가 없다(:424-435). 기관 비교 칩은 실질 KMA/JMA 2개로 줄였다.
- [태풍·버그 추가] before 에 없던 실측 버그: JMA 스텝 시각 키는 validKst(handler.py:229), KMA 는 validUtc(:390)인데 buildTyphoon 은 validUtc 만 읽는다(live-layers.js:2832, parseValidUtc :51-56). JMA 가 첫 기관(issue 오름차순 handler.py:540)인 태풍은 타임 스크럽이 조용히 죽는다 — cone·면의 시각 연동보다 먼저 고쳐야 한다.
- [태풍·범례] 원안의 'NHC 를 골랐을 때만 Category 5~1 범례'도 낮췄다: NHC CurrentStorms.json 은 classification(HU/TS/TD)과 kt 만 준다(handler.py:418,:428) — 등급 번호는 우리가 환산해야 하므로 범례에서 빼고 원문 분류만 Inspector 에. m/s 단계 범례에는 '풍속 평균시간이 기관마다 다름(KMA·JMA 10분 / NHC 1분)' 고지를 추가.
- [태풍·자료] '보관본 색인 가능 여부 UNKNOWN' → 발표 회차 아카이브가 이미 공개·불변으로 쌓인다(handler.py:52-90, events/typhoon-official/archive/...). 없는 것은 색인 파일뿐 → '종료된 태풍' 트랙과 공식 과거 경로는 색인/롤업 S 작업 뒤로. 공식 파일에 과거 위치가 없다는 점(원안 ① '과거=실선'의 자료 공백)도 명시.
- [태풍·자료] 'JTWC 추가 시 이용 조건 확인'을 '수집 불가(403 봇 차단 handler.py:29-30) — 계획에서 제외'로. 'tropical-guidance-v2 v2 연결 여부 UNKNOWN'은 v2-three/js grep 0건으로 미연결 확정.
- [태풍·라이선스] 'tyanalog 를 GFS/ECMWF 로 교체'를 좁혔다: 지구에 그리는 sample 경로는 IBTrACS(퍼블릭 도메인 aws/cyclone-analog/handler.py:414-416)이고 Open-Meteo 는 steering 필드와 multi-source guidance 의 DEEP_LAYER_STEERING(:691,:711,:1068-1081,:2003-2005)에만 있다 → 유료 화면에서 guidance·steering 만 제외/교체. 매칭이 steering 을 쓰는지는 UNKNOWN.
- [태풍·라벨] 원안 ④ '스텝마다 라벨'을 v1 교훈대로 낮췄다: 모든 스텝 라벨은 v1 에서 기관×스텝 30개가 뭉쳐 폐기됐다(prototype/js/layers/cyclone.js:786-799) → 날짜가 바뀌는 첫 스텝 + 마지막 스텝만. JMA 중심기압은 수집기가 담지 않는다(handler.py:227-241).
- [특보·정직성] 원안 ① '기상청 공식 특보색(w.color) 그대로'는 거짓 전제다. w.color 는 수집기 주석이 '앱에서 쓰기 좋게 여기서 정한다'고 한 EARTHUS 자체 표(aws/kma-warn/handler.py:55-72)이고, 현재 카드(live-layers.js:740 '기상청 공식 특보 색')도 같은 오기다 → '표시색'으로 부르고 기상청 범례 대조 후에만 '공식색'. 산불 위험지수의 '산림청 공식색 그대로'도 같은 이유로 UNKNOWN 처리(buildFire :705 는 코드에 박은 색).
- [특보·자료] 원안 ⑤⑦의 validTo·'해제예정'은 자료에 없다 — rec 에는 issuedKst·effectiveKst·commandState 만(handler.py:447-457), 해제는 별도 발표. 타임라인 띠는 시작만, Inspector 의 해제예정 칸은 삭제. 단계는 2단이 아니라 3단(주의보·경보·중대경보 LEVEL :74).
- [특보·자료] '이력 보관 여부 UNKNOWN' → events/kma-warn-episodes.json 이 구역×종류 사건을 760일 보관한다(handler.py:48,:52-53,:297-394; 끝 시각은 최대 15분 늦은 관측 시각, 수집 공백 누락). EXPLORER 의 '30일 되감기·특보 일수'는 이 파일로 된다(회차 전문 보관은 아님).
- [특보·렌더] 원안의 reuse 'loadFloodDistrict 패턴'을 지상 구역 면에는 쓰지 않도록 고쳤다: 그 함수는 면 하나를 높이 하나에 놓고, 정점별 지형 높이는 50× 과장에서 수직 벽으로 찢어진다고 직접 적었다(live-layers.js:1385-1388). 시군 크기 면을 단일 높이로 놓으면 구역 안 산이 면을 뚫는다 → 구역 id 래스터 + buildForest 식 격자 드레이프(:2456-2524). 기하 선택(보로노이 기본 vs ADM2 기본)은 원안의 권고를 확정하지 않고 '매칭률 선행 측정(S)' 뒤로 미뤘다. NWS 구역 폴리곤(수집기가 중심점만 저장 world-alerts/handler.py:107,:156-159)·일본은 P2 로 분리.
- [낙뢰·정직성] 원안 ①③ '색=나이, 종류는 Inspector 에만'은 수집기 규칙 위반이다 — '낙뢰(G)와 번개(C)를 절대 섞지 말 것, 화면에서도 나눠 그린다'(aws/kma-lightning/handler.py:7-11). 종류를 모양(G 채움 / C 속 빔)으로 분리했다.
- [낙뢰·자료] '일본 확장은 fetch 한 줄 교체'를 뒤집었다: events/lightning.json 은 JMA 창 30분(aws/lightning/handler.py:46)·10분 주기(schedules.sh:49)라 교체하면 한국 쪽 창 60→30분·갱신 5→10분으로 **줄어든다** → kma-lightning.json 유지 + JMA 행만 병렬 추가, 일본 점은 종류·세기 없음(:78-82)이라 중립 표식.
- [낙뢰·자료] 원안 ④ 10km 셀 집계를 화면에서 세면 안 된다: 실황 파일은 4,000건에서 오래된 것부터 잘린다(handler.py:50,:118-121, truncated :147) → 큰 뇌우일수록 과소 집계. 수집기가 잘림 전 전체로 셀을 만들어 동봉(S) + '오래된 N건 생략' 칩. 나이 첫 구간 0~5분은 수집 5분+캐시 120초(:153)+재수신 5분 때문에 상시 비기 쉬워 0~10분으로 넓히고 자료 시각을 병기(실제 지연은 UNKNOWN).
- [산불·자료] 원안 FRP 5단의 첫 구간 '8~30MW'는 비어 있다 — 군집 합산 30MW 미만은 수집기가 버린다(aws/wildfire/handler.py:83 MIN_CLUSTER_FRP). 구간을 30부터로 고쳤다. 원안의 '가산합성 유지'도 뒤집었다: 밀집 지역에서 단계색이 흰색으로 합쳐져 단계 표현을 무너뜨린다.
- [산불·정직성] '새 불'·'3일째'는 발화가 아니라 EARTHUS 첫 탐지 기준이고 ID 승계는 수집기 스스로 '추정'이라 적었다(handler.py:39-42,:320-332; 상위 900 진입·12시간 끊김 뒤 재등장도 새 ID :64,:84) → 이름을 '첫 탐지 24시간 이내(수집 기준)·연결은 추정'으로.
- [산불·범위] 원안은 dataNeed 에 '(수집기 확장, L)'이라 적고 size 를 M 으로 둔 자기모순이 있었다 → 375m 타일(L)·Perimeter(M, 미국만)를 선행 '자료 확보' 과제로 분리하고 M 은 지금 자료로 되는 것만 덮는다. 24h 재생도 공개 롤업 파일이 필요하다(개별 화재 시계열은 비공개 archive/ 에만 aws/archiver/handler.py:28-29,:735-757).
- [지진] 원안의 수치는 실측과 일치했다(slice 14 intel-feed.js:377 · altKm<400 :800 · 4.5_day :22 · r=1.0022 quake-history.js:380 · '→ 오늘' :344 · 181,751건·retrieved 2026-09-01 quakes.json). 고친 것: ① '깊이 7단 색 그대로 재사용'은 그림이 실제로는 연속 보간이다(quake-history.js:52-57) → 구간 고정으로 바꿔야 규칙 4 충족. ② '25년 증분 수집기(신규 M)' → 이미 tools/build-quakes.py 가 있어 재실행+재배포(S). ③ 'quake-asia v2 미연결' → 내 장소 카드에는 쓰인다(main.js:3419, for-me-signal.js:20), 지구 레이어만 미연결. ④ '지역별 진도를 지역 라벨로' → 자료는 좌표가 아니라 지역명 문자열(aws/quake-asia/handler.py:100-130,:168)이라 우선 Inspector 텍스트. ⑤ ShakeMap 없는 사건 처리와 자체 경보색(:388) 제거를 추가.
- [지각 이동] 원안 land.crustal_motion ④⑤(판 기준 잔차·판 회전 입자)는 없는 자료(오일러 극 표·판 폴리곤 — 번들 plates.json 은 선 241개뿐)와 기준계 검증을 전제로 하고 유료 견인력이 없어 P3 별도 과제로 분리했다. '화면 픽셀 최소 길이 보장'은 길이=속도 인코딩을 깨므로 길이 고정·색 단계로 바꿨다. 강제 카메라 이동은 칩으로. hazards.crustal_motion 의 2011 사례 수치는 코드에 박힌 글자이고 출처가 없어(ext/lab-crust.js) '출처를 달 수 있을 때만 이관'으로.
- [유료 선] 원안이 EXPLORER 에 둔 '내 장소 확률원 진입 시각·낙뢰 반경 알림' 등 안전 판단에 닿는 값은 PD 의 '안전 정보는 구독과 무관하게 무료'와 부딪힌다 → 거리·포함 여부·공식 발표 알림은 무료, 개인화 조건 알림·이력·비교·리포트·export 를 유료로 재배치(최종 선은 PD 결정).

</details>

### 4-4. 눈·얼음 + 대기질·관측

> 저장소 D:\## APP\EARTHUS v2_APP, 읽기 전용으로 검증(수정·커밋·배포 없음). 외부 확인은 공개 GET 5회(우리 S3 객체 2, NOAA IMS 서비스 메타·카탈로그·exportImage)뿐이고 받은 파일은 세션 scratchpad 에만 있다.<br>> [입력 절단] 받은 개선안 JSON 은 5번째 항목 weather.station_obs 의 paidHook 중간("무료: 어느 현상에서든 Show")에서 끊겼다. 그 항목의 paidHook·size·priority·action·reuse 는 검증자가 채웠다(표기함). 같은 묶음의 weather.climate_series · land.surface_temperature · land.terrain(phenomenon-registry.js:1094-1097)은 제안 본문을 받지 못해 미검증이다 — Before/After 를 지어내지 않았다. 참고만: land/lst 는 해빙과 같은 GIBS 껍질 경로(live-layers.js:526·594)라 해빙의 값 PNG·드레이프 결론이 그대로 적용되고, climate_series 는 정본 11 Intelligence 의 Climatology 탭, terrain 은 정본 09 Terrain 자리가 있다.<br>> [이 묶음의 결론] 1) 개선안이 '이미 있다'고 전제한 자료 3건이 실제로는 없다: IMS 눈·얼음은 빈 그림, 'CAMS 채점'은 Open-Meteo 경유, 관측 이력은 저장되지 않는다. 2) 시안의 모델명 점검: CAMS 수집기 0건 · GFS 는 구름/가강수/구름 이류용 바람뿐(지표 기온·바람 없음) · ECMWF 는 ASOS 97지점 2m 기온만(CC-BY-4.0). 3) 라이선스가 깨끗해 유료 그림으로 먼저 세울 수 있는 순서: 해빙(NSIDC) → 눈(IMS, 수집기 복구 후) → 관측 칩(약관 확인 후) → 대기질·자외선(CAMS 직수신 후). 가장 값진 대기질이 가장 많이 막혀 있다. 4) 이 묶음에 P0 는 없다. 다섯 항목 모두 P0 산출물(공통 구간 LUT 드레이프 · Right Inspector · Global Timeline · Wind 입자)에 의존한다.<br>> [공통 선행 3가지] (a) EARTH_FRAG 공통 드레이프 슬롯 한 쌍(uDataTex+uDataLut) — 셰이더는 이미 샘플러 9개(main.js:194-302)라 레이어마다 하나씩 늘리지 않는다. 한 번에 자료 색면 하나(정본의 라디오 칩과 일치). (b) 값 PNG 계약 — Lambda 가 굽는 단일 채널 등경위도 PNG + meta.json(부호화·플래그·자료 시각·출처) + '전면 투명/전면 결측 거부' 검증. GIBS 타일 50장을 5120×2560 RGBA(약 52MB)로 합치는 현 경로(live-layers.js:12-38, main.js:5734-5767)는 모바일 차단 요인. (c) Show Stations 값 칩 부품 — 대기질·자외선·눈·관측이 함께 쓴다.<br>> [PD 결정 필요] 눈 덮임의 자리(03 Rain 칩 권고) · 해빙의 05 Ocean 'Ice' 칩 · 07 의 Dust/UV 칩과 물질별 구간값 · 지상 관측 독립 메뉴 폐지와 WMO 기입모형의 View 프리셋화 · CAMS ADS 계정·약관 수락(D-OM4) · air-ea 축소(D-OM3).<br>> 관련 파일: D:\## APP\EARTHUS v2_APP\aws\current-earth-snow-ice\index.mjs · png-contract.mjs / aws\climatology\build_seaice_series.py / aws\air-grid\handler.py · aws\air-ea\handler.py · aws\air-korea\handler.py · aws\lab-events\handler.py / aws\kma-life\handler.py / aws\archiver\handler.py · aws\ecmwf-ingest\handler.py / prototype\v2-three\js\main.js · live-layers.js · station-model.js · phenomenon-registry.js / prototype\data\korea-admin-reference.json / docs\R0-OPEN-METEO-AUDIT-2026-09-20.md<br>> 【재검증분 — 관측·지형(기후 시계열·지표온도·지형)】 묶음 결론<br>> 세 항목 모두 Open-Meteo 와 무관하다. 코드 확인: OISST·CPC 는 PSL THREDDS, NSIDC 는 CSV, GHCN 은 NCEI, 지표온도는 NASA GIBS, 지형은 AWS Terrarium 이다. 그래서 유료 핵심 그림으로 세워도 라이선스상 안전하고, 이웃 선행 작업 'GFS 확장(M)'에 묶이지 않는다. 의존은 지표온도 B단계가 P0 Temperature 구간 렌더러에 의존하는 것 하나뿐이다. 1차안은 셋 다 '얼마 만에'를 과소평가했다.<br>> 1) 공통 계약 — 단일 자료 슬롯<br>>   - '모든 자료 색면을 지형 셰이더에 드레이프'는 옳다.<br>>   - 다만 EARTH_FRAG 가 이미 sampler 9개를 쓴다(main.js:194-302, WebGL2 보장 16). 레이어마다 sampler 를 늘릴 수 없다.<br>>   - 자료 색면은 슬롯 하나만 쓴다. Compare 용 둘째 슬롯까지만 허용한다.<br>>   - 조명·밤낮 마스크 뒤에 무광으로 합성한다.<br>>   - 눈 패턴(main.js:414-419)을 그대로 따라 하면 자료색이 밤면에서 5.5%로 꺼져(:425-427) 범례 색과 화면 색이 달라진다.<br>>   - 첫 구현은 P0 Temperature 기준 렌더러가 한다. 이 묶음은 계약을 선언만 한다.<br>>   - 세 가지 껍질 버그가 같은 뿌리다: GIBS 1.0014(live-layers.js:1584), 바다 1.0012(:1113), 대기 airShell 1.0746@50×(:1169-1172).<br>> 2) 시간축<br>>   - Global Timeline 은 −1일~+5일, 분 단위뿐이다(ui-shell.js:1334).<br>>   - 기후 시계열의 '날짜 짚기→지구'와 지표온도의 '작년 같은 날·30일 재생'은 모두 P0 Single Timeline 에 '기록 날짜 모드'가 생겨야 한다.<br>>   - ▶ 재생이 구름을 모델로 바꾸는 훅(:1375)은 모드를 구분해야 한다.<br>> 3) GIBS<br>>   - 날짜가 세 곳에 하드코딩돼 있다(live-layers.js:13, main.js:5735, 5801-5805). 공용 함수 하나로 묶는다(S).<br>>   - 브라우저가 날짜당 50타일, 5120×2560 RGBA(약 52MB)를 직접 받는 방식은 재생과 모바일(4096 한도, main.js:110)에서 성립하지 않는다.<br>>   - 서버 캐시 어댑터 패턴(aws/current-earth-snow-ice/index.mjs)으로 값 PNG 를 굽는 'gibs-value' 수집기 하나가 지표온도·눈·해빙을 함께 해결한다.<br>> 4) 시안의 모델 이름과 저장소 실태(aws/)<br>>   - GFS: 구름과 UGRD/VGRD 만 받는다(gfs-cloud-forecast/handler.py:100, 170).<br>>   - ECMWF: 점값이다(이웃 결정).<br>>   - CAMS: Open-Meteo 경유뿐이다(air-grid/handler.py:27).<br>>   - ERA5: 수집기가 없고 카탈로그 tier B 뿐이다(catalog/build_catalog.py:345-364).<br>>   - CMIP6: grep 0건이다.<br>>   - 이 묶음에서 모델이 필요한 것은 ERA5 time machine(XL·P2) 하나다.<br>> 5) PD 결정 필요<br>>   - 기후 시계열을 Climatology 탭으로 MOVE.<br>>   - 지표온도를 01 Temperature 의 셋째 칩으로 MERGE, ≥60°C 확장 구간.<br>>   - Terrain 의 Elevation 구간값.<br>>   - Terrain 의 무료/Explorer 경계.<br>>   - 콘셉트 09 의 Exaggeration 패널과 정본 본문의 충돌.<br>> 6) P0 조각<br>>   - 슬라이더 6개와 수동 조명을 View > Appearance 로 옮기는 일(S)은 land.terrain 의 priority(P1)와 별개다.<br>>   - P0 Global Shell 'Data/View 분리' 산출물로 취급해야 한다.<br>>   - 이 묶음에서 P0 에 걸리는 것은 그것 하나다.<br>> 재사용으로 새로 찾은 것<br>>   - aws/kma-normal(기상청 공식 평년 1991–2020, 약 100지점)이 콘셉트 11 의 'vs Normal'을 한국 지점에 대해 바로 채운다.<br>> 미검증으로 남긴 것<br>>   - 1차안의 '409×188px'.<br>>   - 1차안의 '메뉴 재클릭 토글 버그'.<br>>   - GIBS 야간·8일 합성 레이어.<br>>   - colormap 구간 폭.<br>>   - Terra 종료 일정.<br>>   - Esri 이용 조건.<br>>   - Terrarium 원천 목록.

#### 눈 덮임 · `land.snow_cover` — 합친다 · P2 · L

| | |
|---|---|
| **Before** | 지구 본체 셰이더가 GIBS NDSI 타일의 '밝기'를 눈의 양으로 보고 지표색에 흰색 한 가지를 최대 85% 섞는다(prototype/v2-three/js/main.js:414-419). 만년빙 바탕색(397-401)·극지 poleFade(422)와 같은 흰색이라 자료와 바탕이 구분되지 않고, 혼합이 야간 감쇠(426-427) 앞이라 밤 반구에서 사라진다. 범례·경계선·숫자·시간축 없음. 타일 50장을 5120×2560 RGBA 캔버스로 합친다(main.js:5736-5740, GPU 약 52MB). ⚠️ 개선안이 '이미 수집·배포 중'이라 한 IMS 자료는 실제로는 빈 그림이다(아래 blockers 1). |
| 돈 내는 사람 눈 | 9월 현재 북반구에서 '눈 덮임'을 눌러도 화면이 바뀐 것을 알아볼 수 없다 — 알래스카 실화면에서 켬/끔(uHasSnow 1↔0)을 비교했는데 산맥의 흰색은 끈 상태에도 그대로였다(바탕의 만년빙·고도 채색). 계절 탓이지 버그는 아니지만, 겨울에도 '항상 있는 얼음'과 '오늘의 눈'이 같은 흰색이라 무엇이 자료인지 구분할 수 없다. (C 빈약하다) |
| 기준 사이트 | mapped.earth 실측 메뉴에 눈 덮임 없음. windy 는 분류 칩 '비, 눈'까지만 확인, 적설 레이어 표현은 UNKNOWN. → 기준 사이트에 없음, EARTHUS 고유. 강점은 모델 적설이 아니라 분석관이 확정한 '관측 기반 눈 범위'. |
| **After** | [→ 자리 없음 · PD 결정 필요] 목표 화면은 원안 유지 = MERGE: 03 Rain 칩 줄 끝 '쌓인 눈(관측)'. 도달 경로를 3단계로 고친다.<br>[0단계 · 선행 · 자료 확보] IMS 수집기 복구(blockers 1~3). 이것 없이는 1단계 그림이 0픽셀이다.<br>[1단계 · 무료 기본 그림] 북반구 눈 범위 면(채움 #F4FBFF) + 설선(청록 #39C5FF 1.5px) + 상시 범례 + Inspector. 설선은 지오메트리가 아니라 셰이더에서 분류 마스크의 0.5 경계를 fwidth 로 그린다(드로우콜 추가 0). 값 텍스처는 Lambda 가 구운 단일 채널 PNG(모바일 2048×512, 데스크톱 4096×1024; 0~90°N) — 클라이언트에서 5120×2560 캔버스를 만들지 않는다. 합성은 main.js:427(낮/밤 혼합) 뒤에 얹고 음영만 약하게(0.75+0.25×hillshade) 곱해 밤 반구에서도 같은 밝기. 레이어 ON 동안 만년빙·poleFade 바탕은 회청 #9FB2C4 로 누른다(원안 ③ 유지). 켜는 순간 눈이 있는 위도로 카메라 이동(원안 유지).<br>범례 상시: '눈 덮임 범위 · 관측 기반 분석(분석관 작성) · NOAA/USNIC IMS · 원자료 1km / 표시 약 6km · 분석일 · 깊이 아님 · 북반구만(남반구 자료 없음)'. 'IMS 1km' 단독 표기 금지 — 우리가 보여 주는 해상도를 말한다.<br>[철회] ⑤ '관측 없음 회색 빗금': IMS 는 분석관이 구름을 메운 분석장이라 '관측 없음' 분류가 없고, GIBS NDSI 타일은 눈 없음과 구름·밤을 똑같이 투명으로 준다(구분 불가) → 빗금을 그리면 없는 분류를 만드는 것. NDSI 모드 범례에 '빈 곳 = 눈 없음 또는 구름·밤(구분 불가)' 고정 문구로 대체.<br>[철회] '지금 북반구 눈 덮임은 연중 최소기' 문구: 계산 근거 없는 계절 문장. 이력이 1년 쌓이거나 기관 기후값을 인용할 수 있을 때까지 쓰지 않는다.<br>[2단계] ② NDSI 4단(10~30 #5FA8D3 · 30~50 #9CCFEA · 50~80 #D6EEF9 · 80~100 #FFFFFF): 색→값 역변환은 Lambda 에서만(클라이언트 1,300만 픽셀 getImageData 금지), GIBS colormap XML 확인 후. '7일 변화' 칩은 수집기 복구일부터 날짜 키로 저장해 7일 뒤부터 활성(그 전에는 칩을 흐리게 + '이력 n일째 수집 중'). '작년 같은 날'은 NSIDC G02156 백필(극투영 재투영) 별도 작업 뒤.<br>지도 위 숫자: (a) 북반구 면적 라벨은 Lambda 가 원 분류값에서 위도 가중 합산한 값만 표시(표시용 PNG 에서 세지 않는다), 'DERIVED · IMS 분류 합산 · 격자 n km' 명기 — 1단계에서는 생략 가능. (b) 적설 관측 칩(KMA SD cm · AMeDAS snow cm)은 station_obs 의 Show Stations 부품을 공유, 값이 있는 지점만(9월에는 0곳이 정상 — '적설 관측 없음(계절)' 한 줄).<br>Inspector: 눈 있음/없음 · 분석일 · 출처 · '관측 기반 분석' · '표시 약 6km 격자값' · '깊이 아님(범위만)' · 가까운 적설 관측소 값(있을 때). 컨트롤은 칩 3개(오늘/7일 변화/작년 같은 날), 슬라이더 없음. 시간축은 Global Timeline 일 단위, 미래 구간은 '관측은 미래가 없음 — 마지막 분석일 고정'. |
| 표현 | 고해상 색면(분류 마스크 드레이프 + 셰이더 외곽선) |
| 자료 | 지금 자료로는 1단계 그림이 나오지 않는다. (1) IMS: 수집기 코드는 있으나(aws/current-earth-snow-ice/index.mjs) 공개 객체 app/v2/data/current-earth/snow-ice.png 는 8,222B·2048×1024·전 픽셀 (0,0,0,0) 이다(09-20 실측). 같은 매개변수로 NOAA 를 직접 불러도 sha256 이 같은 빈 그림(99400c40…)이 온다. 원인: 서비스 카탈로그의 maxps=10000 — 10km/px 보다 성긴 요청은 빈 그림. 수집기 요청은 360°/2048px ≈ 19.5km/px(index.mjs:26-39). 실측 대조: 원 투영 24km/px → 빈 그림(4,144B), 8km/px → 47,507B·비투명 2색. 상류는 살아 있다(idp_filedate 2026-09-19T22:57Z). 서비스 값 범위 0~4(U8), 투영 Polar Stereographic(중앙경선 −80°, 표준위선 60°), maxImageWidth 15000·Height 4100. 미국 정부 저작물·출처 표기. 남반구 없음. (2) NDSI 비율: GIBS colormap XML 색→값 표 구현 전 확인, Lambda 굽기. (3) 이력: S3 Versioning OFF 이므로 날짜 키(snow-ice/YYYY-MM-DD.png)로 명시 저장, 과거분은 NSIDC G02156(구현 전 경로·포맷 확인). (4) 적설 깊이: wind/kma-aws.json snow_cm(aws/kma-aws/handler.py:91), wind/jp-amedas.json snow(aws/jma-amedas/handler.py:113) 수집 중 — 확인함. Open-Meteo 의존 없음 → 복구만 되면 유료 그림으로 세워도 라이선스 위험 없음. |
| 재사용 | prototype/v2-three/js/main.js(EARTH_FRAG 414-419 의 지형 추종 혼합 구조, setSnow 5867-5892 의 revision 가드) · aws/current-earth-snow-ice/index.mjs(영수증·발행 구조는 재사용, exportUrl·검증은 고침) · prototype/v2/js/current-earth-seasonal.js(영수증 검증) · aws/kma-aws/handler.py · aws/jma-amedas/handler.py · 공통 드레이프 슬롯(uDataTex+uDataLut, Temperature P0 산출물) |
| 무료 / 유료 | 무료: 오늘의 눈 범위 면 + 설선 + 범례 + 클릭 시 있음/없음·분석일·출처. EXPLORER: 7일 변화(이력이 쌓인 날부터) · 최근 60일 재생 · 지역별 면적 수치와 짧은 리포트(수치→출처→문장, 인과 없음). PRO: 두 날짜 split/wipe/diff(Compare 작업공간 의존) + PNG·CSV 내보내기 + '첫눈 덮임 관측' 알림. 시뮬레이션 없음(NOT_AVAILABLE 유지). |
| 걸리는 것 | · [자료·최우선] IMS 산출물이 빈 그림이다. 원인은 상류가 아니라 우리 요청(19.5km/px > maxps 10km). 해법: (a) ≤10km/px 로 요청 — 원 투영 전체 extent 24,576km 는 2,458px 이상(권장 4096×4096 ≈ 6km/px, maxImageHeight 4100 이내) (b) Polar Stereographic(−80°/60°)→등경위도 재투영을 Lambda 에서 (4326 직접 요청이 ≤10km/px 에서 되는지는 미시험 — 먼저 시험) (c) png-contract.mjs:1-12 는 폭·높이만 본다 → '비투명 픽셀 비율 하한' 검증 추가, 미달이면 발행 거부 (d) 독립 M 크기 선행 작업.<br>· [운영] aws/schedules.sh 에 이 함수가 없다. 공개 객체 Last-Modified 2026-08-31, meta 의 validAt 08-29, meta 에 index.mjs 가 쓰지 않는 dimensions 필드와 Cache-Control 86400(index.mjs 는 1800) → Lambda 가 아니라 tools/build_current_earth_snapshot.mjs 1회 업로드로 보인다(추정). 해법: 일 1회 스케줄 + health.json 감시 + 분석일이 3일 넘으면 화면에 '오래된 분석' 배지. 배포는 PD AWS 로그인 필요.<br>· [정직성] 색→분류(0~4) 표를 코드 어디에서도 해독하지 않는다. 9월 8km/px 렌더는 비투명 2색 (139,0,139)·(49,130,189)뿐 — 어느 쪽이 눈이고 해빙인지 UNKNOWN. 해법: 서비스 /legend 확인 또는 rasterFunction None 으로 원시 분류값 요청. 확인 전에는 눈/해빙을 색으로 단정하지 않는다.<br>· [성능] 현 NDSI 경로는 5120×2560 RGBA 캔버스(약 52MB GPU, main.js:5736-5763) — MAX_TEXTURE_SIZE 4096 인 모바일에서 축소·실패 위험. 해법: Lambda 단일 채널 값 PNG + 공통 드레이프 슬롯 한 개(EARTH_FRAG 는 이미 샘플러 9개: main.js:194,195,277,278,289,294,298,300,302 → 슬롯 공유로 11개 상한).<br>· [범위] '7일 변화'는 복구일+7일 뒤, '작년 같은 날'은 G02156 백필 뒤에야 가능 — 1단계 완료 기준에 넣지 않는다. 겨울 전에는 적설 관측 칩을 화면에서 검증할 수 없다.<br>· [PD 결정] 좌측 레일에 자리 없음 — 03 Rain 칩(MERGE, 권고) / 09 Terrain 지표 상태 / 설정 서랍 유지 중 택일. |
| **완료 기준** | · '쌓인 눈(관측)' 칩을 켜면 북반구에 눈 범위 면과 청록 설선이 보이고 그린란드·북극권이 비어 있지 않다. 수신한 그림이 전 픽셀 투명이면 레이어가 켜지지 않고 '자료 없음' 배지가 뜬다.<br>· 범례에 '관측 기반 분석 · NOAA/USNIC IMS · 원자료 1km / 표시 약 6km · 분석일 YYYY-MM-DD · 깊이 아님 · 북반구만'이 상시 보이고 분석일이 오늘 기준 3일 이내다.<br>· 지구를 돌려 밤 반구를 보면 눈 면이 낮 반구와 같은 밝기로 보이고, 만년빙 바탕(그린란드 내륙)은 회청색으로 눌려 자료 색과 구분된다.<br>· 지도를 한 번 클릭하면 우측 Inspector 에 눈 있음/없음 · 분석일 · 출처 · '깊이 아님'이 뜬다. |

#### 해빙 · `ocean.sea_ice` — 옮긴다 · P1 · L

| | |
|---|---|
| **Before** | NASA 가 칠한 무지개 팔레트 타일(GHRSST_L4_MUR_Sea_Ice_Concentration, live-layers.js:524)을 반지름 1.0014 고정 구 껍질에 그대로 얹는다(live-layers.js:1576-1590). 앱이 색의 값을 몰라 범례·판독이 없고(metaGibs 1592-1607 은 타일 수·날짜만), 켜도 카메라가 극으로 가지 않으며, 1979년부터의 면적 계열(ocean/series/seaice-daily.json, 매일 03:45 UTC 갱신 — aws/deploy-climatology.sh:81)과 연결이 없다. 타일 50장을 5120×2560 RGBA 캔버스로 합친다(live-layers.js:12-38, GPU 약 52MB). |
| 돈 내는 사람 눈 | 해상도는 이 묶음에서 가장 좋고 얼음 가장자리의 결이 실제로 보인다. 그런데 얼음이 빨강으로 칠해져 있어 '뜨거운 곳'처럼 읽히고 범례가 없어 농도를 읽을 수 없으며, 기본 시점(한국, 거리 3.0)에서는 화면 꼭대기의 작은 빨간 조각으로만 보인다. (C 빈약하다) |
| 기준 사이트 | mapped.earth OCEAN 메뉴에 해빙 없음, windy 실측 기록에도 없음 → EARTHUS 고유. 강점은 NSIDC 일별 면적 계열(보유)과 지구본을 한 화면에서 잇는 것. |
| **After** | [→ 05 Ocean · 다섯째 칩 'Ice' · PD 결정 필요] 목표 화면은 원안 유지: 얼음으로 읽히는 5단 구간색(15~30 #1F4E79 · 30~50 #2F7FB5 · 50~70 #6CB8E0 · 70~90 #BFE6F5 · 90~100 #FFFFFF, 15% 미만 비움) + 오늘 가장자리(흰 실선) vs 1981–2010 중앙값 가장자리(주황 점선) + 극점 옆 면적 숫자 + 극 위로 카메라 이동 + Arctic/Antarctic 칩. 고친 것은 도달 경로다.<br>[자료를 한 제품군으로 통일] 농도 색면 · 오늘 선 · 중앙값 선을 모두 NSIDC Sea Ice Index(G02135) 에서 받는다. 두 선의 비교가 정직하려면 같은 제품·같은 15% 문턱이어야 한다. IMS 의 해빙 분류(분석관 범위, 15% 문턱 아님)나 GIBS MUR 색과 섞지 않는다.<br>[철회] '최소안 = GIBS colormap 색→% 역변환': 5120×2560 캔버스(52MB)를 getImageData 로 1,300만 픽셀 돌리는 경로라 모바일 불가. Lambda 굽기 하나로 간다.<br>[값 PNG 계약] 등경위도 1440×720 단일 채널(0~100 = 농도 %, 251 극점 구멍 · 253 해안 · 254 육지 · 255 결측 — NSIDC 플래그를 그대로 옮김) + meta.json(자료일·출처·부호화). 공통 드레이프 슬롯에 얹고 셰이더가 값을 선형 보간한 뒤 구간 LUT 로 끊는다(색 보간 없음). 빗금 '관측 없음'은 NSIDC 플래그가 있는 칸에만 — 구멍을 지어내지 않는다. 레이어 ON 동안 poleFade 바탕(main.js:371·422)은 끈다.<br>[1단계 · 무료 핵심 · P1] 오늘 색면 + 두 선 + 면적 숫자 + 범례 + Inspector. 오늘 선은 같은 농도 격자에서 15% 선을 contour-math.js 로 추출(NSIDC 일별 extent shapefile 이 있으면 그것을 우선 — 구현 전 확인). 중앙값 선은 월별 12×2반구 = 24개를 1회 변환해 정적 JSON 으로 둔다(1981–2010 은 변하지 않음). 면적 숫자·평년 대비·순위는 seaice-daily.json 에서 계산하고 'DERIVED · extent(15% 이상 칸의 넓이 합)' 명기, 1978–87 격일 관측의 빈 날은 평균에서 빼고 n 을 적는다.<br>[2단계 · 유료 깊이 · P2] 일별 프레임 이력(날짜 키) → Global Timeline 재생 · '작년 같은 날' · Compare split/wipe/diff. 1979~ 전 기간 백필(약 3.4만 파일)은 1회성 배치로 분리. 곡선 날짜↔타임라인 양방향 연결은 Global Timeline(P0)과 Intelligence Climatology 탭(P1) 이후.<br>범례 상시: '% 해빙 농도 · 위성 관측 기반 일별 분석(NSIDC Sea Ice Index, 25km 격자) · 자료일 · 지연 1~3일'. Inspector: 농도 구간 · '25km 격자값' · 자료일 · 출처 · 반구 면적 · 평년 대비(DERIVED) · '면적 시계열 열기'. 컨트롤: Arctic/Antarctic 칩 · 평년선 토글 · Contour 토글, 슬라이더 없음. 시뮬 '해빙은 어떻게 움직일까'는 NOT_AVAILABLE 유지(sim-questions.js:276). |
| 표현 | 단계색+등치선 |
| 자료 | 해상도가 아니라 '값'이 없다. 새 수집기 1개가 선행이다: NSIDC G02135 일별 농도 GeoTIFF(북·남, 25km 극투영) → 등경위도 값 PNG + meta, 일 1회. aws/climatology/build_seaice_series.py 가 같은 서버(noaadata.apps.nsidc.org/NOAA/G02135)에서 면적 CSV 를 이미 받고 있어 출처·UA·CORS 우회 구조를 재사용한다. GeoTIFF 경로·압축·플래그 값은 구현 전 확인. 월별 중앙값 가장자리 polyline shapefile → 극투영 역변환 → 정적 JSON(1회). NOAA@NSIDC 공개·인용 표기, Open-Meteo 의존 없음 → 이 묶음에서 유료 핵심 그림으로 세워도 라이선스 위험이 없는 첫 후보. 25km 는 확대 한계가 있다(고도 약 1,500km 이하에서 칸이 보임) — 고해상(EUMETSAT OSI SAF 10km)은 라이선스 확인 뒤 별도. 면적 계열 ocean/series/seaice-daily.json 은 보유·매일 갱신. |
| 재사용 | aws/climatology/build_seaice_series.py + handler.py + aws/deploy-climatology.sh(같은 출처·스케줄 구조) · prototype/js/contour-math.js + gridmath.js(15% 선 추출, Cesium 무의존) · prototype/v2-three/js/main.js EARTH_FRAG(공통 드레이프 슬롯) · prototype/js/ui-charts.js · prototype/v2-three/js/ext/lab-charts.js(해빙 스파게티 그래프) · live-layers.js metaGibs 1592-1607(카드 문구) |
| 무료 / 유료 | 무료: 오늘의 구간색 해빙 + 오늘 선 vs 중앙값 선 + 반구 면적 숫자·출처·자료일(이것만으로 그림이 완성). EXPLORER: 최근 1년 재생 · '작년 같은 날' · 같은 날 역대 순위·평년 대비 · 짧은 Intelligence 리포트(수치→출처→문장, '함께 나타난 조건'만). PRO: 1979~ 임의 두 날짜 split/wipe + 증가/감소 diff · 계열 CSV·이미지 export · 연 최소·최대 갱신 알림. 유료 항목은 전부 2단계(이력 프레임) 뒤에만 약속한다. |
| 걸리는 것 | · [자료] 농도 격자 수집기가 없다(aws/ 에 NSIDC 는 면적 CSV 빌더뿐). 해법: climatology Lambda 에 seaice-grid 작업 추가 — GeoTIFF 해독 + 극투영→등경위도 재투영 + 플래그 보존 + 빈 그림 거부 검증. 독립 M.<br>· [정직성] 오늘 선과 중앙값 선은 같은 제품·같은 15% 문턱이어야 한다. IMS 해빙 분류·GIBS MUR 색으로 '오늘 선'을 그리고 NSIDC 중앙값과 나란히 놓으면 정의가 다른 두 선을 비교하는 것 — 금지. 범례에 두 선 모두 'NSIDC Sea Ice Index · 15% 기준' 명기.<br>· [성능] 현 GIBS 경로는 52MB RGBA 캔버스 + NASA 로 50회 직접 요청. 값 PNG 1440×720 단일 채널(약 1MB GPU) 1회 요청으로 대체. 드레이프는 슬롯 공유(EARTH_FRAG 샘플러 이미 9개).<br>· [의존] 구간 LUT 드레이프 렌더러는 Temperature(P0 기준 구현체)에서 먼저 나와야 한다 — 그 전에 착수하면 해빙 전용 렌더러를 한 번 더 만들게 된다.<br>· [범위] 1979~ 백필·Timeline 재생·Compare 는 2단계로 분리(Global Timeline·Compare 작업공간 의존). S3 Versioning OFF 이므로 날짜 키 명시 저장.<br>· [PD 결정] 정본 05 Ocean 은 SST/SSTA/Currents/Waves 4모드 — 'Ice' 칩 추가와 '눈·얼음' 묶음 해체 승인 필요. |
| **완료 기준** | · Ocean > Ice 칩을 누르면 카메라가 북극 위로 이동하고 해빙이 남색~흰색 5단 구간색으로 보이며 빨강·무지개색이 없다.<br>· 오늘 가장자리(흰 실선, 라벨 '오늘 MM-DD')와 1981–2010 중앙값(주황 점선) 두 선이 함께 보이고, 범례에 두 선 모두 'NSIDC Sea Ice Index · 15% 기준'으로 적혀 있다.<br>· 극점 옆 면적 숫자(백만 km² · extent · 자료일)가 ocean/series/seaice-daily.json 의 마지막 값과 일치하고, 값이 없으면 숫자 자체가 표시되지 않는다.<br>· 지형 과장 50×에서 시베리아 북안 같은 해안 저지대가 해빙 색에 덮이지 않는다. |

#### 대기질 · `weather.air_quality` — 다시 만든다 · P1 · XL

| | |
|---|---|
| **Before** | 메뉴를 누르면 한국 측정소의 5.5px 무숫자 점만 뿌려지고(live-layers.js:2109-2114, makePoints 606-624), 전지구 PM2.5 는 Open-Meteo 5° 격자(aws/air-grid/handler.py:54 RES=5.0)를 선형 램프+LinearFilter 로 뭉갠 색면이 반지름 1.0746 껍질(airShell 1169-1172, 과장 50× 기준)에 떠서 깨끗한 바다까지 덮는다(PM25_RAMP 2987 하한 컷 없음). 범례·숫자·시간축 없음. 수집기는 '지금' 한 시각만 받는다(air-grid/handler.py:84 current). |
| 돈 내는 사람 눈 | 대기질을 누르면 한국 위에 파랑·초록 작은 점 672개가 뿌려질 뿐이고, 어디가 몇 ㎍인지 숫자도 흐름도 없다. 전지구 격자를 켜면 지구가 파란 막에 싸이고 번진 얼룩만 보인다 — PD 가 싫어하는 '뭉개진 그라데이션' 그 자체다. (C 빈약하다) |
| 기준 사이트 | mapped.earth: AIR 아래 PM2.5·Aerosol·Dust·SO₂·CO 를 색면 라디오로 고르고 바람 입자는 그 위에서 계속 흐른다. 단위 있는 범례·자료 시각·출처 상시. windy: '대기질' 독립 칩, 'Air quality stations' 별도 POI 오버레이, 범례·타임라인 상시. |
| **After** | [→ 07 Air Quality] 목표 화면은 정본·원안 유지: 물질 칩 1탭 전환 · PM2.5 6단 threshold band(0~15 #2FBF71 · 15~25 #F2E14B · 25~50 #F7B733 · 50~75 #F2762E · 75~150 #D7263D · ≥150 #7A1E5C, 0~15 는 불투명도 0.18) · Show Stations(흰 테두리 원+숫자, 같은 LUT) · Model 표시 · 범례 2줄(모델/관측 분리) · Inspector · 슬라이더 없음 · 1.0746 껍질 폐기 후 지형 드레이프. 고친 것은 순서와 크기다.<br>[선행 A · 자료 확보 · 독립 L] CAMS 직수신 수집기. aws/ 에 CAMS·ADS·GEFS·GEOS-CF 수집기는 0건이다(grep 확인, docs/R0-OPEN-METEO-AUDIT-2026-09-20.md:57 도 '없는 것: CAMS'). ADS 계정·약관 수락은 PD 직접(D-OM4). ADS 는 요청이 큐에 들어가므로 Lambda 900초 안에 끝난다는 보장이 없다 → '제출'과 '수령'을 다른 실행으로 나눈다. 1차 필드는 PM2.5·PM10(직접 필드)만. O3·NO2 지표 농도(µg/m³)와 Dust 질량은 혼합비×공기밀도 환산이 필요할 가능성이 높다(변수 목록 구현 전 확인) → 2차, 범례에 '단위 환산(DERIVED)' 표기. Dust 칩의 값 정의(질량 µg/m³ vs Dust AOD)는 PD 확정.<br>[선행 B] 구간 LUT 드레이프 공통 렌더러(Temperature P0 기준 구현체) · 값 PNG 계약(0.4° ≈ 900×451 단일 채널, 물질×시각당 1장).<br>[1단계 · P1] PM2.5 색면(전지구 0.4°) + 한국 관측소 값 원 + 범례 2줄 + Inspector + 25·50·150 등치선과 라벨(0.4° 자료에서만 — 5° 금지 유지).<br>[임시 · FREE_OPEN 한정] 동아시아 0.5° 판(wind/air-ea.json)을 v2 가 '읽기만' 하는 것은 가능하나 '즉시 연결하면 정본에 근접'이라는 원안 평가는 낮춘다: air-ea 는 Open-Meteo 호출의 62%·429 의 주원인이고 감사가 3시간 간격 축소를 권고했다(같은 문서 :12-13, :63, :73). 새 호출을 늘리지 않는 범위에서만 쓰고, 범례 출처에 'Open-Meteo 경유(CAMS)'를 그대로 적고, 결제 개시 전에 CAMS 직수신판으로 교체한다.<br>[관측소 문법] 원안 유지 + 보정: 전지구·대륙 시점의 시도 채움은 에어코리아 수집기가 이미 내는 시도 평균(aws/air-korea/handler.py:209-224)을 쓰되 그것은 측정소 산술평균이므로 라벨을 '서울 38 · 측정소 n곳 평균'으로. 지도 색은 농도 구간 하나로 통일, 환경부 등급은 Inspector 에 원문 인용(우리가 등급을 계산하지 않는다). 확대 시 값 원은 station_obs 의 Show Stations 부품·LOD 상한(데스크톱 160/모바일 60)을 공유.<br>[입자 토글] 02 Wind 렌더러(P0)가 나온 뒤에만. '먼지 질량이며 발원지를 뜻하지 않습니다' 고정 문구 유지.<br>[시간축] +120h 예보는 새 수집기에서만 가능(현 수집기는 current 한 시각). 1단계는 PM2.5 한 물질 × 3시간 × 41프레임. 미래 구간에서 관측 원은 사라지고 FORECAST 배지.<br>[Intelligence 칸] 수치→출처→문장. 문장은 '함께 나타난 조건' 나열 + 기관 발표 인용만. |
| 표현 | 단계색+등치선 |
| 자료 | 지금 자료로는 유료 핵심 그림을 세울 수 없다. 격자 두 판(wind/air.json 5° · wind/air-ea.json 0.5°)이 모두 Open-Meteo 경유다. 시안의 모델명 CAMS 는 저장소에 수집기가 없다 → 자료 확보가 선행. 후보: ① Copernicus CAMS 전지구 예보 ADS 직수신(약 0.4°, 하루 2회, +120h; 라이선스는 출처 표기 조건의 상업 이용 허용으로 알려져 있으나 약관 원문은 PD 계정 수락 때 확인). GRIB 해독은 aws/deploy-grib-python.sh·aws/deploy-ecmwf.sh 의 ecCodes 스택 재사용. ② 퍼블릭 도메인 대안 NOAA GEFS-Aerosols · NASA GEOS-CF — 필드·지연 구현 전 확인. ③ Open-Meteo 상용 키(감사 D-OM1)는 '지점 조회' 용도이고 격자 대량 수집에는 호출량이 맞지 않는다. 관측: 에어코리아 673곳(wind/korea-air-obs.json)은 PM10·PM2.5·O3·NO2 를 모두 담고 있다(aws/air-korea/handler.py:181-183) — 원안의 'NO2 없음'은 '격자에 없음'으로 고친다. 시도 채움용 폴리곤: prototype/data/korea-admin-reference.json 은 시군구(geoBoundaries ADM2, CC-BY 3.0)라 regionKo 로 묶는 전처리가 필요(같은 시도의 시군구를 같은 색으로 채우면 dissolve 없이도 가능). 전지구 관측소(OpenAQ 등)는 출처별 라이선스 확인 전에는 약속하지 않는다. |
| 재사용 | prototype/v2-three/js/live-layers.js(buildAirq 2109-2114·metaAirq 2116-2128 의 시도 집계 표시, buildField 1072-1121 은 교체 대상) · prototype/js/contour-math.js + gridmath.js + gridoverlay.js(FINE_BOX — 전지구판 위 보강판 규칙) · aws/air-korea/handler.py · aws/air-ea·aws/air-grid(필드 이름표를 새 수집기와 맞춤) · aws/deploy-grib-python.sh + aws/deploy-ecmwf.sh(ecCodes) · aws/air-evidence-archive(모델·관측 동시 보존 구조) · prototype/js/earthus2/v02/visual/flow.js(입자) · prototype/v2-three/js/evidence-popover.js · source-context.js · prototype/data/korea-admin-reference.json |
| 무료 / 유료 | 무료: 현재 시각 PM2.5 구간색면 + 한국 관측소 값 원 + 범례·출처·시각 + 클릭 기본값. 대기질 경보·황사 특보는 구독과 무관하게 상시. EXPLORER: 물질 칩 drill-down · +120h 예보 타임라인 · 내 장소 관측소 시계열(이력이 쌓인 기간만) · 짧은 리포트. PRO: 모델 vs 관측소 채점 · 두 시각/두 물질 split/wipe/diff · 임계 알림 · export. ⚠️ 원안이 '이미 돌고 있다'고 한 CAMS 24h 채점은 Open-Meteo 경유다(aws/lab-events/handler.py:651 호출, :686 agency 'CAMS_OPENMETEO') — 6개 도시·PM10 만, 격자점값을 시도 평균과 비교한다. CAMS 직수신 뒤 '측정소 위치 격자값 vs 그 측정소 실측'으로 다시 짓기 전에는 PRO 상품으로 내놓지 않는다(별도 M). 잠금 표현은 '타임라인 뒷부분이 흐리게 보이고 누르면 요금 안내' 유지. |
| 걸리는 것 | · [자료·라이선스] CAMS 수집기 없음 + 격자 두 판 모두 Open-Meteo. 해법: CAMS ADS 직수신 수집기를 독립 L 선행 작업으로 분리(PD 계정 D-OM4 · 큐 비동기 제출/수령 · ecCodes · health 감시). 이것이 끝나기 전의 화면은 '임시'로 표기하고 결제 개시 조건에서 제외.<br>· [정직성] O3·NO2·Dust 의 µg/m³ 는 CAMS 직접 필드가 아닐 가능성이 높다(혼합비 환산). 확인 전에는 칩을 약속하지 않고, 환산이면 범례에 'DERIVED · 단위 환산' 표기. 1차는 PM2.5·PM10 만.<br>· [운영] air-ea 는 429 다발·감사의 축소 권고 대상 — v2 임시 연결이 호출을 늘리면 안 된다(읽기 전용, 3시간 주기 전제).<br>· [유료 훅] lab-events 의 채점은 Open-Meteo 경유·6도시·PM10·격자점 vs 시도평균 → PRO 불가. 직수신 뒤 재구축.<br>· [성능] 값 PNG 900×451 단일 채널 × 41프레임은 필요할 때만 받는다(현재 시각 ±1 프리패치). 관측 원은 DOM 칩이면 데스크톱 160/모바일 60 상한. 드레이프는 공통 슬롯 공유(샘플러 9→11).<br>· [의존] 공통 구간 렌더러(Temperature P0) · 입자(Wind P0) · Global Timeline·Inspector(P0 셸) 뒤에 온다 — 이 항목 자체는 P1.<br>· [PD 결정] Dust·UV 칩 추가 · PM10 등 물질별 구간값 · '농도 구간(등급 아님)' 표기 · 시도 채움 LOD. |
| **완료 기준** | · Air Quality 진입 시 PM2.5 가 6단 구간색으로 보이고, 0~15 구간인 태평양 한가운데가 색 막에 덮이지 않으며 지구 가장자리에 떠 있는 이중 윤곽이 없다.<br>· 한반도를 확대하면 측정소가 흰 테두리 원 + 숫자(µg/m³)로 보이고, 범례에 '모델 CAMS · run 시각'과 '관측 에어코리아 · 시각'이 두 줄로 따로 적혀 있다.<br>· 지도를 한 번 클릭하면 Inspector 에 값·단위·'0.4° 격자값 — 지점값 아님'·run 시각이 뜨고, 측정소를 클릭하면 실측값·환경부 등급 원문·dataTime·(관측−모델) 차이가 뜬다.<br>· 결제 개시 시점의 화면에서 색면 출처에 'Open-Meteo' 가 남아 있지 않다. |

#### 자외선 · `weather.uv` — 합친다 · P2 · M

| | |
|---|---|
| **Before** | Open-Meteo 5° 격자의 '지금' 자외선지수를 선형 램프+LinearFilter 로 뭉개 반지름 1.0746 껍질에 얹는다(live-layers.js:586, UV_RAMP 2989-2992 — 0.5 미만은 비움). 밤을 비우므로 지구의 절반 이상이 비고 카메라도 낮 쪽으로 가지 않아 아침·저녁·밤의 한국에서는 '켰는데 아무것도 없는' 화면이다. 범례 없음. |
| 돈 내는 사람 눈 | 아침·저녁·밤에 한국에서 켜면 '켜졌는데 아무것도 없는' 화면이다. 낮이어도 555km 칸이 번진 얼룩이라 '내 동네 자외선'은 읽을 수 없고, 몇이 위험인지 알려 주는 범례도 없다. (C 빈약하다) |
| 기준 사이트 | mapped.earth 메뉴에 자외선 없음. windy 실측 기록에서 자외선 레이어 미확인(UNKNOWN). PD 정본 07 의 CURRENT 설명은 'PM2.5·PM10·오존·자외선'을 한 범위로 묶는다. |
| **After** | [→ 07 Air Quality · 'UV' 칩 · PD 결정 필요] 독립 메뉴를 없애고 MERGE — 원안 유지. WHO/기상청 공통 5단 구간색(0~2 #289500 · 3~5 #F7E400 · 6~7 #F85900 · 8~10 #D8001D · 11+ #6B49C8), 등급 경계 3·6·8·11 흰 선+'UV 8' 라벨(0.5° 이하 자료에서만), 기본 모드 '오늘 최대', '지금' 모드는 밤 빗금 '밤 — 자외선 0'+낮·밤 경계선+낮 반구로 카메라 이동, 1.0746 껍질 폐기 후 드레이프, 한국 시도 칩(기상청 예보, 'KMA FORECAST' 배지, 광주·전남은 '자료 없음' 칩), 슬라이더 없음.<br>[정직성 보정] 원안은 'GFS UV-B 플럭스를 지수로 환산하면 없는 값을 만드는 것'이라며 거부했는데, CAMS 도 지수가 아니라 자외선 선량 필드를 준다(지수 = 40 × 선량 W/m², WHO 정의). 둘 중 하나로 일관되게 간다 → 채택: 정의에 따른 단위 환산은 허용하되 범례·Inspector 에 'UVI = 40 × CAMS UV 선량(단위 환산)'을 상시 표기. 필드명·단위는 구현 전 확인. '오늘 최대'는 '모델 예보의 현지일 최대(DERIVED)'로 표기(원안 유지).<br>[의존] 이 항목은 air_quality 의 CAMS 수집기(전천·청천 두 필드 + 예보 시간축)와 공통 구간 렌더러가 선 뒤에만 착수한다. 현 수집기는 current 한 시각만 받으므로(aws/air-grid/handler.py:84) '오늘 최대'는 지금 자료로 계산할 수 없다. ADS 계정 없이 가는 대안 후보: NOAA/NCEP UV Index 예보 GRIB(공공) — 존재·경로·해상도 구현 전 확인.<br>[시도 칩] 시도 단위 예보값이므로 칩 라벨은 '서울(시도) 7 높음' — 도시 지점값처럼 쓰지 않는다. Show Stations 부품 공유.<br>Inspector: 값 · WHO 등급 · '오늘 최고 시각(예보)' · 모델/기관 구분 · run 시각 · '0.4° 격자값 — 지점값 아님'. 행동요령은 기상청/WHO 문구 인용만. |
| 표현 | 단계색+등치선 |
| 자료 | 지금 자료로는 안 된다: wind/air.json 의 uv 는 Open-Meteo 5°(비상업 조항 위험), 동아시아 0.5° 판도 같은 경유. 교체는 air_quality 와 같은 CAMS 직수신 한 개에서 UV 두 필드(전천·청천)를 함께 받는다. 한국 지점값: wind/kma-life.json — 기상청 getUVIdxV3, 시도 17곳 중 15곳, 3시간 간격(aws/kma-life/handler.py:66 NO_DATA_SIDO 광주·전남, :76-77 등급표, :197 구간 문자열) 수집 중. KMA 허브 일일 용량을 Lambda 여럿이 공유하므로 호출을 늘리지 않는다. '오늘 최대'는 수집기에서 예보 시간축을 경도 기준 현지일로 묶어 미리 계산. |
| 재사용 | air_quality 항목의 CAMS 수집기·값 PNG 계약·공통 구간 렌더러·Inspector · aws/kma-life/handler.py · aws/air-ea/handler.py(필드명 uv 유지) · live-layers.js UV_RAMP 2989-2992(경계값 참고만) · station_obs 의 값 칩 부품 |
| 무료 / 유료 | 무료: '오늘 최대' 구간색면 + 범례 + 내 위치 등급. EXPLORER: 내 장소 3일 시간별 곡선과 최고 시각 · 시도 예보 칩 전체 · UV 8 이상 예보 알림. PRO: 청천 vs 전천 두 공식 필드 split/diff · export. 단독 판매 메뉴가 아니라 07 Air Quality 의 깊이에 포함. |
| 걸리는 것 | · [의존·자료] CAMS 수집기(air_quality 선행 A) 없이는 착수 불가. 크기 M 은 그 위의 증분(일 최대 계산 S + UV LUT·범례 S + 밤 빗금·경계선·카메라 S + 시도 칩 S)이다.<br>· [정직성] 지수는 선량×40 단위 환산 — 표기 필수. 원안의 'GFS 는 환산이라 안 된다'는 논거는 CAMS 에도 적용되므로 철회하고, GFS 를 쓰지 않는 이유는 '지수 정의에 맞는 가중 선량 필드가 아님(구현 전 확인)'으로 바꾼다.<br>· [정직성] 시도 예보값을 도시 지점값처럼 쓰지 않는다 — 칩에 '(시도)' 표기, 광주·전남은 '자료 없음' 칩을 조용히 빼지 않는다.<br>· [운영] KMA 허브 키는 Lambda 여럿이 공유(일일 용량 초과 시 특보·AWS 가 함께 묵음) — UV 칩 때문에 호출 주기를 올리지 않는다.<br>· [PD 결정] 정본 4칩(PM2.5/PM10/O3/NO2)에 다섯째 'UV' 칩 추가. |
| **완료 기준** | · 한국 시각 밤에 Air Quality > UV 칩을 눌러도 '오늘 최대' 모드로 지구 전체가 5단 구간색 위도 띠로 채워져 있다(빈 지구가 아니다).<br>· 범례에 '모델 예보의 현지일 최대(DERIVED) · UVI = 40 × CAMS UV 선량 · run 시각'이 적혀 있다.<br>· 한국을 확대하면 시도 칩 15개와 '광주 자료 없음'·'전남 자료 없음' 칩이 보이고 배지는 KMA FORECAST 다.<br>· '지금' 모드에서 밤 반구는 빗금 '밤 — 자외선 0'으로 보이고 낮·밤 경계선이 그려지며, 켜는 순간 카메라가 낮 반구로 이동한다. |

#### 지상 관측 · `weather.station_obs` — 합친다 · P1 · L

| | |
|---|---|
| **Before** | DOM/SVG 일기도 기입 모형(흰 단색 바람 깃+작은 숫자, station-model.js:293-313)이 고도 6,000km 이상에서 0개라(LOD 표 :26) 메뉴를 눌러도 지구가 그대로이고, 확대해도 최대 90개(:30), 자료는 kma-aws 97곳 + GTS 뿐이며(:21-22) 한 번 받으면 세션 내내 다시 받지 않는다(:223). 레이어 전체가 pointer-events:none(:203)이라 관측소를 누를 수 없다. 3프레임마다 전 지점을 투영하고 O(배치×후보) 겹침 검사 뒤 left/top 으로 옮긴다(:319-361). |
| 돈 내는 사람 눈 | 메뉴를 눌러도 지구는 그대로다 — 기본 고도에서는 기호가 0개이고 카메라도 움직이지 않으며 '확대하세요'라는 안내도 없다. 확대하면 흰 막대기 깃과 작은 숫자 십여 개가 뜨는데, 일기도를 읽을 줄 아는 사람에게만 뜻이 있고 중국·북미는 비어 있다. (C 빈약하다) |
| 기준 사이트 | windy: 지도 위 도시마다 값 숫자가 직접 찍히고 '기상 관측소 · 보고된 바람/온도 · 공항'을 색면 위에 겹치는 POI 토글. mapped.earth: 관측소 표현 없음. |
| **After** | [→ 자리 없음 · PD 결정 필요] 목표는 원안 유지 = MERGE: 독립 메뉴를 없애고 01 Temperature · 02 Wind · 03 Rain · 07 Air Quality 의 Inspector 에 공통 'Show Stations' 토글로 흡수. 값 칩(둥근 라벨+숫자, 채움색 = 켜진 현상의 구간 LUT, 흰 테두리 = 관측), 바람은 숫자+풍향 쐐기, WMO 기입모형은 View > Appearance 프리셋으로 보존(PD 결정), 3시간 넘은 칩은 회색 테두리+시각, 미래 시각에서는 칩이 사라지고 '관측은 미래가 없음'. 고친 것:<br>[LOD 상한] '그 아래 화면 내 전부' 철회. DOM 칩은 데스크톱 최대 160 · 모바일 60, 기본 고도에서 앵커 약 40개. 피드를 다 연결하면 지점이 약 3,200 → 약 7,000 으로 늘어 현 update 루프로는 모바일에서 끊긴다 → 격자 해시 겹침 검사 · transform 이동 · 카메라가 멈췄을 때만 재배치. 300개 이상이 필요해지면 GPU 인스턴스 칩(숫자 아틀라스)로 별도 작업.<br>[앵커 칩 정직성] 칩 라벨은 관측소 이름이 기본. 도시 이름은 도시 중심 10km 안 관측소일 때만, 그 밖에는 '서울(관측소 김포공항 · 15km)' 식으로 거리를 붙인다 — 관측소값을 도시값처럼 말하지 않는다.<br>[모델 대조값] 원안의 'GFS 0.25° 직수신'은 수집기가 없다(aws/ 의 GFS 수집기는 구름·가강수·구름 이류용 한 층 바람뿐). 1단계는 이미 있는 ECMWF 오픈데이터 수집(aws/ecmwf-ingest — IFS·AIFS 지상 2m 기온, 기상청 ASOS 97지점, CC-BY-4.0)으로 '기온 관측−모델'만 보여 주고, 바람·강수·전 세계 지점은 Temperature/Wind P0 의 GFS 지표 수집기가 선 뒤에 붙인다.<br>[이력] 과거 시각 재생·지점 시계열의 재료가 없다: aws/archiver 의 수집 대상은 quake·tsunami·news·buoy·cyclone·solar·wind(격자)·forecast 8종뿐이고(handler.py:370-378) wind/stations.json 은 결측 원장 목록에만 있다(:634-642). 지상관측 이력 저장을 지금 시작하고, 재생·시계열은 '쌓인 날부터'만 연다.<br>[철회] '관측망 없음 옅은 빗금 면': 경계를 우리가 그어야 하는 면이라 지어낸 도형이 된다. 대신 계산 가능한 사실로 — 범례에 '이 화면 안 관측소 n곳', 관측소 없는 곳을 클릭하면 Inspector 에 '반경 300km 안 관측소 없음 — 날씨가 없는 것이 아니라 관측이 들어오지 않습니다'.<br>[신선도] 자료별 재수신 주기(기상청 10분 · AMeDAS 10분 · METAR 30~60분 · GTS 3시간). [클릭] 레이어는 pointer-events:none 유지, 칩만 auto(지구 드래그를 막지 않게).<br>Inspector(관측소 클릭): 값·단위·관측 시각·기관(KMA/JMA/GTS/METAR/CWA)·지점 고도 → 그 아래 '같은 칸 모델값(격자값, 지점값 아님)'과 (관측−모델) → 최근 시계열(유료, 쌓인 기간만) → 기온은 기상청 평년값(1991~2020) 대비. 일기(WW) 기호는 97곳 중 3곳뿐이고 전선 좌표는 없다 → 일기도 완성은 약속하지 않는다(원안 유지). |
| 표현 | 아이콘/마커 |
| 자료 | 기본 그림은 지금 자료로 나온다. v2 가 읽는 것: wind/kma-aws.json(97) + wind/gts-global.json. 받아 놓고 v2 가 안 읽는 것: wind/stations.json(전세계 공항 METAR, NOAA AWC, 800곳 미만이면 덮어쓰지 않는 가드 aws/land-stations/handler.py:128) · wind/jp-amedas.json(JMA 비공식 JSON 경로 — 규격 변경 위험, health 감시 필수) · wind/kma-aws-min.json · wind/cwa-observations.json(schedules.sh:36, 10분). 네 피드의 필드 이름이 다 달라(temp_c/ta/temp 등) 정규화 어댑터가 필요. 기상청·JMA·CWA 자료의 유료 상품 내 재배포 조건은 구현 전 각 기관 약관 확인(UNKNOWN), Met Office 는 노출 금지 유지. 모델 대조: 1단계 aws/ecmwf-ingest(CC-BY-4.0, 97지점 2t), 이후 GFS 지표 수집기(없음 — Temperature/Wind P0 의 선행 작업에 의존). 이력: 새 보관 데이터셋 필요(비공개 archive/ 접두사). Open-Meteo 의존 없음. |
| 재사용 | prototype/v2-three/js/station-model.js(load 의 피드 병합·okta→10분법 환산 고지·cover 집계 228-288, 기입모형 SVG 293-313 은 View 프리셋으로 보존) · aws/land-stations · aws/jma-amedas · aws/kma-aws · aws/kma-aws-min · aws/cwa-observations · aws/gts-global · aws/ecmwf-ingest · aws/kma-normal · aws/archiver(새 데이터셋 추가 위치) · 각 현상의 구간 LUT(공통 렌더러) |
| 무료 / 유료 | (입력이 이 칸 중간에서 끊겨 검증자가 채움) 무료: 어느 현상에서든 Show Stations 값 칩 + 클릭 시 값·단위·관측 시각·기관. EXPLORER: (관측−모델) 차이 · 지점 최근 시계열(이력이 쌓인 기간만) · 기온 평년 대비(기상청 1991~2020) · 짧은 리포트(수치→출처→문장). PRO: 모델별(IFS/AIFS, 이후 GFS) 지점 채점 비교 · CSV export · 임계 알림. 안전 정보(특보)는 이 부품과 무관하게 무료. |
| 걸리는 것 | · [성능] 현 update 루프(station-model.js:319-361)는 3프레임마다 전 지점 투영 + O(배치×후보) + left/top 갱신. 지점 약 7,000 · 칩 300 이면 모바일에서 끊긴다. 해법: 상한(데스크톱 160/모바일 60) · 격자 해시 · transform · 정지 시 재배치.<br>· [자료] GFS 지표(2m 기온·10m 바람) 수집기 없음 → 모델 대조는 1단계 ecmwf-ingest(기온·ASOS 97지점)로 한정하고 나머지는 P0 자료 확보에 의존.<br>· [자료] 지상관측 이력 미저장(archiver 8종에 없음) → 새 보관 데이터셋을 먼저 시작. '최근 시계열'·과거 시각 재생은 쌓인 날부터 — EXPLORER 훅을 출시일에 약속하지 않는다.<br>· [라이선스] 기상청·JMA(비공식 경로)·CWA 재배포 약관 UNKNOWN — 유료 개시 전 확인, 확인 전에는 무료 표시만.<br>· [정직성] 도시 이름 칩은 관측소 거리 조건을 지킨다 · '관측망 없음' 면은 그리지 않는다 · 일기도 완성(WW·전선) 약속 금지.<br>· [의존] 칩 채움색은 각 현상의 구간 LUT(공통 렌더러) · 클릭은 Right Inspector(P0 셸)에 의존 — 이 부품 자체는 P1.<br>· [PD 결정] 독립 메뉴 폐지 · WMO 기입모형을 View 프리셋으로 내리는 것(PD 가 기호표를 주며 요청한 기록 station-model.js:3-5 과 '막대기 기호 금지'의 충돌). |
| **완료 기준** | · 기본 고도(약 12,700km)에서 어느 현상이든 Show Stations 를 켜면 값 칩이 0개가 아니라 40개 안팎 보이고 한국·일본 쪽이 먼저 채워진다.<br>· 칩은 흰 테두리 + 숫자이고 채움색이 켜진 현상의 구간색과 같다. 관측 후 3시간이 넘은 칩은 회색 테두리와 관측 시각(hh:mm)이 붙는다.<br>· 칩을 한 번 누르면 Inspector 에 값·단위·관측 시각·기관이 뜨고, 기상청 ASOS 지점의 기온에는 그 아래 'IFS 격자값 — 지점값 아님'과 (관측−모델) 차이가 보인다.<br>· 타임라인을 미래로 옮기면 칩이 사라지고 '관측은 미래가 없음' 한 줄이 보이며, 모바일에서 칩이 60개를 넘지 않는다. |

#### 기후 시계열 · `weather.climate_series` — 옮긴다 · P1 · M

| | |
|---|---|
| **Before** | 지구에는 아무것도 그리지 않고 v1 의 chartsPanel 을 오른쪽 패널에 그대로 붙인다(prototype/v2-three/js/ext/lab-charts.js:18-67). 그래프 크기는 v1 시트 기준으로 고정된다 — chartBox() 가 v1 요소 #sheet 를 재고 W 를 300~700, H 를 190~320 으로 자른다(prototype/js/ui-charts.js:114-131). v2 는 그 SVG 를 width:100% 로 늘일 뿐이다(lab-charts.js:49). 첫 화면은 외부 도구 링크 3개다(ui-charts.js:569-587). '지금 기온 — 지역별' 막대는 Open-Meteo 5° wind 격자의 상자평균이다(prototype/js/stats.js:183-200, ui-charts.js:620-637). 그래프는 정적 SVG 문자열이라 날짜 짚기(포인터→날짜)가 없고, 지구본·시간축과 연결도 없다. 1차안의 '409×188px'와 '메뉴 재클릭 시 머리말 카드만 남는 토글 버그'는 코드로 확인하지 못했다(미검증). |
| 돈 내는 사람 눈 | 이 묶음에서 유일하게 '값의 차이가 극적으로' 보인다 — 올해 빨간 선이 40년 다발 위로 올라가 있는 것이 설명 없이 읽히고, 출처·가중 방법까지 적혀 있다. 다만 좁은 옆 패널 안에서 도구 링크 세 개 아래로 스크롤해야 나오고, 지구본과는 아무 연결이 없다. (B 손보면 된다) |
| 기준 사이트 | mapped.earth: 'Time machine — monthly climate back to 1940'. 시간 스테퍼로 지구 자체가 과거 월별 기후 그림으로 바뀐다. windy: 같은 것이 없다. 40년 스파게티 곡선은 EARTHUS 가 기관 원자료에서 직접 계산한 고유 자산이다. |
| **After** | [→ 11 Intelligence · Climatology 탭] 제안 = MOVE. **PD 결정 필요**: 정본의 좌측 레일 9개에 이 현상의 자리가 없다. 좌측 메뉴 항목을 없애고 Inspector 의 Now / Forecast / Climatology / Analysis 중 Climatology 로 옮긴다. 두 단계로 나누고, 1단계만 이 항목의 크기(M)에 넣는다.<br>■ 1단계 (M · P1 · 선행 작업: P0 Right Inspector)<br>① 맨 위 숫자 세 줄:<br>  - '최신값(자료일)': '오늘 값'이라고 쓰지 않는다. OISST·NSIDC 는 2~3일, GHCN 은 그보다 더 늦다.<br>  - '같은 달력일 1991–2020 평균 대비'.<br>  - '기록 기간 n년 중 같은 날 순위'.<br>  - 셋 다 계열에서 계산하므로 DERIVED 로 표기한다. OISST 최근 구간에는 '잠정'을 붙인다. 해빙은 1979–87 이 격일 관측이라 순위에 비교 가능한 해의 수 n 을 적는다.<br>② 출처·자료일·기준 기간.<br>③ 스파게티 그래프. 지금 문법(올해 빨강, 10년 단위 색, 나머지 회색)을 유지한다.<br>④ 그 아래에 문장. 관측 사실, 함께 나타난 조건, 기관 예보 인용만 쓴다.<br>공간 범위 고정 표기(정직성):<br>  - 계열 넷 중 셋은 전지구·대륙 평균이다. 제목에 '60°S–60°N 바다 평균', '아시아 육지 평균(CPC 0.5° 상자) — 선택 지점 값 아님', '한국 고정 10소 평균'을 박는다. 선택한 위치의 값처럼 읽히면 안 된다.<br>  - 위치를 선택했을 때 지점값은 별도 줄이다. 한국이면 kma-aws 현재 관측과 기상청 공식 평년(aws/kma-normal → wind/kma-normal.json, 1991–2020)으로 'Current → vs Normal → KMA Observation·시각'을 만든다. 콘셉트 11 과 그대로 맞는다.<br>  - 한국 밖은 '이 지점의 장기 계열 없음 — 대륙 평균만 있음'이라고 말한다.<br>문맥 연동: Ocean>SST → OISST, Ice → NSIDC 북극·남극, Temperature → CPC 대륙별과 한국. 계열이 없는 현상은 '장기 계열 없음'.<br>넓게 보기: 하단 시트(1440p 에서 약 1,300×420)로 펼친다. spaghetti() 에 box 인자를 추가한다(기본값은 지금 동작 그대로). 이 파일은 v1 과 공유하므로 v1 회귀 확인이 필요하다.<br>정리:<br>  - 도구 링크 3개는 탭 맨 아래 'Tools'로 옮긴다.<br>  - '지금 기온 — 지역별' 막대와 그 안의 '전지구 해수면온도 평균' 참고줄을 삭제한다(Open-Meteo 5° 상자평균).<br>  - '국가별 공항 관측소 평균'은 유지한다(aviationweather.gov METAR, aws/land-stations/handler.py:41).<br>1단계에서는 그래프가 시간축을 움직이지 않는다. 새 슬라이더는 0개다.<br>■ 2단계 (L · P2 · 이 항목 크기에 넣지 않음 · 선행 작업: P0 Single Timeline 의 '기록 날짜 모드')<br>날짜를 짚으면 지구가 그날 그림으로 바뀐다.<br>  - 지금 Global Timeline 은 −1일~+5일뿐이다(ui-shell.js:1334, min=-1440 max=7200 분). ▶ 재생은 구름을 모델로 바꾸는 훅을 부른다(ui-shell.js:1375). 기록 모드는 이 훅을 타지 않아야 한다.<br>  - 프레임은 GIBS 날짜 인자화로 되는 레이어만 쓴다(해빙 MUR·지표온도·눈·트루컬러, 2000년대 이후). 그 이전 날짜는 '그날의 지구 그림 없음 — 계열값만 있음'.<br>  - OISST 0.25° 임의 날짜 프레임은 새 수집기와 44년×365≈16,000장 백필이 필요하므로 하지 않는다. 필요하면 최근 30일 창만 굽는다.<br>  - 날짜 짚기는 makeZoomable 의 확대·이동 제스처와 충돌하므로 별도 picking 층이 필요하다.<br>  - 전지구 기온의 과거 그림(ERA5)은 XL·P2 그대로 둔다. |
| 표현 | DOM 카드(Inspector 탭 + 하단 시트) |
| 자료 | 1단계는 지금 자료로 된다. 계열 넷은 Open-Meteo 와 무관하다(코드 확인).<br>  - OISST v2.1: PSL THREDDS OPeNDAP, 10° 솎음(build_sst_series.py:44-51).<br>  - CPC Global Daily Temp: 같은 THREDDS, 4° 솎음 + 한국 상자는 0.5°(build_land_series.py:43-79).<br>  - NSIDC G02135 v4.0 CSV(build_seaice_series.py:44).<br>  - GHCN-Daily CSV 10소(build_korea_series.py:49-63).<br>  - Lambda 하루 1회, EventBridge 규칙 4개(aws/climatology/handler.py:18-30).<br>추가로 필요한 것:<br>  (a) 한국 관측소별 계열. 지금 korea-daily.json 은 10소 평균 한 줄뿐이다(build_korea_series.py:126-136). 관측소별 배열이 없다. 빌더가 wind/series/korea/{sid}.json 을 따로 내면 된다(S). 그 전에는 '내 장소 최근접 관측소 계열'을 약속하지 않는다.<br>  (b) wind/kma-normal.json 재사용(기상청 공식 평년 1991–2020, 약 100지점).<br>  (c) 2단계 프레임. GIBS 날짜 고정을 푼다(S). 세 곳이다: live-layers.js:13, main.js:5735, main.js:5801-5805.<br>ERA5: 수집기 없음. 카탈로그에만 tier B 로 등재돼 있다(aws/catalog/build_catalog.py:345-364, Copernicus licence 는 출처표시 필요, '절대 미러하지 않는다').<br>제거 대상: 5° wind 격자 상자평균 막대. |
| 재사용 | prototype/js/ui-charts.js(chartsPanel 415-682 · spaghetti 151-276 에 box 인자 추가 · legendOf · rangeNote · makeZoomable), prototype/js/stats.js(sstSeries·landSeries·koreaSeries·seaIceSeries 260-272, countries 212-), prototype/v2-three/js/ext/lab-charts.js · ext-scene.js:37, aws/climatology/*(빌더 4종 + handler.py), aws/kma-normal/handler.py(공식 평년), aws/kma-aws(현재 관측), prototype/v2-three/js/intel-strip.js · report-center.js |
| 무료 / 유료 | 무료: 올해 선이 40년 다발 위에 있는 그래프 전체 + 출처·자료일. 가치가 먼저 보여야 하므로 잠그지 않는다.<br>EXPLORER(핵심 가치): 숫자 세 줄(최신값·평년 대비·순위), 한국 지점의 기상청 공식 평년 대비, 짧은 Intelligence 리포트 저장·공유. 빌더 추가 후에는 가장 가까운 장기 관측소 계열(거리 표기)도 넣는다.<br>PRO: 계열 CSV·고해상 이미지 export, 기록 갱신 알림. 2단계 이후에는 두 해의 같은 날을 Compare split globe 로 본다. |
| 걸리는 것 | · Global Timeline 이 −1일~+5일(분 단위)뿐이다(ui-shell.js:1334). 수십 년 전 날짜로 옮길 수 없다. → 지구 연동은 2단계(L·P2)로 분리한다. P0 Single Timeline 에 '기록 날짜 모드'가 생긴 뒤에만 한다. onPlay 훅(ui-shell.js:1375)은 모드를 구분해야 한다.<br>· '내 장소 최근접 관측소 계열'은 자료에 없다. korea-daily.json 은 10소 평균만 담는다(build_korea_series.py:126-136). → 빌더가 관측소별 파일을 내게 한다(S). 거리를 표기하고, 50km 를 넘으면 '내 장소 값 아님' 라벨을 붙인다. 고정 10소는 해안·섬 위주라 대전·대구·광주는 최근접이 100km 이상이다.<br>· chartBox() 가 W≤700·H≤320 으로 자르고 v1 의 #sheet 를 잰다(ui-charts.js:114-131). 1,300×420 시트는 '그대로'로는 안 된다. → spaghetti(series,{box}) 선택 인자를 추가한다. 공유 파일이라 v1 회귀 확인이 필요하다(v1 배포가 의존성).<br>· 자료 지연·잠정값. OISST·NSIDC 는 2~3일, GHCN 은 더 늦다. → '오늘 값' 대신 '최신값(자료일)'로 쓰고, 순위 문장에는 '잠정'과 n년을 표기한다.<br>· 대륙 CPC 상자평균이 선택 지점의 값처럼 읽힐 위험이 있다(5° 격자≠도시값과 같은 규칙). → 계열 제목에 공간 범위를 고정 표기한다. 지점값은 KMA 관측·평년 줄로 분리한다.<br>· P0 Right Inspector 가 선행 작업이다. Inspector 가 없으면 옮길 자리가 없다.<br>· 좌측 레일에 자리가 없으므로 MOVE 자체가 PD 결정 사항이다. |
| **완료 기준** | · Inspector 의 Climatology 탭을 열면 위에서부터 (1) 숫자 세 줄 (2) 출처·기준 기간 (3) 스파게티 그래프 (4) 문장 순으로 보인다. 숫자 세 줄에는 '자료일 · DERIVED · 기준 1991–2020 · n년 중 순위'가 붙어 있다.<br>· 화면 어디에도 '지금 기온 — 지역별' 막대가 없고, 외부 도구 링크 3개는 탭 맨 아래에 있다.<br>· 1440p 에서 '넓게 보기'를 누르면 그래프가 폭 1,200px 이상으로 펼쳐진다. 글자는 확대·늘림 없이 지정한 크기다. 화면 전체에서 시간용 input[type=range] 는 1개뿐이다.<br>· 한국 지점을 선택하면 '현재 관측값 · 기상청 평년(1991–2020) 대비 ±x.x°C · 관측소명·거리·관측시각'이 나온다. 대륙 계열 제목에는 '육지 평균 — 선택 지점 값 아님'이 보인다. |

#### 지표온도 · `land.surface_temperature` — 합친다 · P1 · L

| | |
|---|---|
| **Before** | MODIS 주간 지표온도 타일 50장(1km TileMatrixSet level 3, 10×5×512px)을 브라우저가 GIBS 에서 직접 받아 5120×2560 캔버스로 만든다. 이것을 반지름 1.0014 고정 구 껍질에 NASA 색 그대로 얹는다(live-layers.js:12-38, 526, 1576-1590).<br>  - 0.0014×6,371km÷50 = 해발 약 178m 이므로, 과장 50× 에서 그보다 높은 땅은 전부 지형 밑에 깔린다.<br>  - 날짜는 '이틀 전'으로 고정돼 있다(:13).<br>  - LinearFilter 가 팔레트 색끼리 섞는다(:1579-1580).<br>  - 5120px 캔버스는 MAX_TEXTURE_SIZE 4096 기기의 한도를 넘는다(main.js:110 에 적힌 함정). RGBA 로 약 52MB 다.<br>  - 범례·시간축·판독이 없다.<br>  - 카드 문구는 '2m 기온과 다르다'를 지키고 있다(metaGibs 1592-1607). |
| 돈 내는 사람 눈 | 켜면 강 하구와 평야에만 노란 조각이 붙고 대륙 안쪽은 텅 비어 '자료가 거의 없는 레이어'로 보인다. 실제로는 대륙 전체를 덮는 촘촘한 관측이 있는데 과장된 산과 고원 밑에 깔려 있다 — 고치면 이 묶음에서 가장 극적인 그림이 될 재료다. (D 망가져 보인다) |
| 기준 사이트 | mapped.earth 의 Temp 는 GFS 모델 기온 색면(범례 상시)이고 위성 지표온도는 없다. windy 에도 없다. → 기준 사이트에 없는 EARTHUS 고유 그림이다. 강점은 모델이 아니라 '관측'이고, Open-Meteo 와 무관해 유료 핵심 그림으로 세워도 안전하다는 점이다. |
| **After** | 제안 = MERGE [→ 01 Temperature · 'Land surface(위성 관측)' 칩]. 정본에 없는 칩이라 **PD 확인 필요**. MERGE 는 메뉴 자리만 바꾼다. 레이어 id 'land/lst' 는 바꾸지 않는다(레지스트리 복합키, 개명 금지). 크기는 L 이고 두 단계로 나눈다.<br>■ A단계 (S~M · 버그부터 · 지금 메뉴 자리에서)<br>1) 껍질 메시를 버리고 지형 셰이더에 드레이프한다.<br>  - sampler 를 레이어마다 늘리지 않는다. EARTH_FRAG 는 이미 sampler2D 9개를 쓴다(main.js:194-302).<br>  - **자료 색면용 단일 슬롯 하나**(가칭 uFieldTex)를 둔다. Compare 용 둘째 슬롯까지만 허용한다. 한 번에 자료 색면은 하나다.<br>2) 조명 뒤에 무광으로 합성한다.<br>  - 눈 패턴(main.js:414-419)은 ground 에 섞인다. 그래서 밤면에서 0.055배(:426), 낮면에서 0.42+0.70·hillshade(:425)로 어두워진다.<br>  - 자료색을 그렇게 섞으면 범례 색과 화면 색이 달라진다.<br>  - 자료색은 조명·밤낮 마스크 뒤에 합성한다. 지형 음영은 약하게만 곱한다.<br>3) 범례.<br>  - GIBS colormap XML(버전 고정)의 구간을 읽어 NASA 원 범례를 그대로 쓴다.<br>  - 상시 문구: '지표온도 — 2m 기온 아님 · MODIS Terra 주간 · 위성 통과 약 10:30 지방시(일 최고 아님) · 관측일 · OBSERVED'.<br>4) 클릭 판독.<br>  - 셰이더 색이 아니라 CPU 캔버스의 정확한 팔레트 색을 구간으로 바꾼다. 보간은 없다.<br>  - 팔레트와 일치하지 않으면 '판독 불가'로 답한다.<br>5) 구름 틈.<br>  - 육지이면서 관측이 없는 곳만 구분한다. 바다는 '대상 아님'이다.<br>  - 전면 회색 빗금은 하루 관측에서 육지 절반 이상을 덮어 고장처럼 보인다.<br>  - 대신 바탕 지형을 무채색으로 낮추고, 범례에 '오늘 육지의 N% 관측'을 적는다. 빗금은 확대했을 때만 옅게 쓴다.<br>※ A단계의 NASA 연속 팔레트는 정본 규칙 4(구간색)를 아직 만족하지 않는 임시 상태다. Temperature 칩으로의 편입은 B단계에서 한다.<br>■ B단계 (M · 선행 작업: P0 Temperature 구간 렌더러 + 값 수집기)<br>1) 값 수집기 'gibs-value'(가칭).<br>  - aws/current-earth-snow-ice/index.mjs 패턴을 따른다. 서버가 받아 PNG 와 meta.json 을 S3 에 둔다. 사용자 요청이 기관 서버로 직접 가지 않는다.<br>  - 1순위 경로: GIBS 팔레트 PNG 의 색→구간 역변환. 자격증명과 HDF 가 필요 없다. colormap 버전을 고정하고, 정확히 일치하는 색만 값으로 쓰며, 불일치 픽셀은 결측으로 둔다.<br>  - 2순위 경로(PRO 에서 수치가 필요할 때만): MOD11C1. HDF4 + Earthdata 로그인이라 Lambda 패키징이 별도 M 이다. 접근 경로는 UNKNOWN 이다.<br>  - 눈·해빙도 같은 수집기로 처리한다.<br>2) 인코딩(이웃 결정과 동일).<br>  - 8bit 1채널 선형, 0.5°C 눈금, −50~+77°C. 범위 밖은 포화시킨다. 끝 구간이 '<-10'·'≥60'이라 표시 손실은 없다.<br>  - 별도 유효 마스크를 둔다.<br>  - ⚠ GMGSI 255 함정과 같은 구조다. 결측과 값을 LinearFilter 로 섞으면 구름 가장자리에 가짜 저온 띠가 생긴다. 마스크<1 표본은 버리거나 NEAREST 로 읽는다.<br>  - 3600×1800 R8 ≈6.5MB 다. 모바일은 1800×900 을 쓴다. 4096 한도와 52MB 문제가 함께 풀린다.<br>3) 구간색.<br>  - 01 Temperature 10단에 위쪽 35~40 · 40~45 · 45~50 · 50~60 · ≥60 을 더한다. 확장은 이 칩에서만 한다. **PD 확인 필요**.<br>  - 역변환 경계 오차(= 팔레트 한 칸)를 범례에 명기한다.<br>  - 등치선은 기본 OFF 다.<br>  - 지도 위 라벨은 솎은 격자에서 최고 구간 덩어리 상위 3~5곳만, 구간으로만 표시한다('≥60°C').<br>4) 칩.<br>  - 주간/야간: 야간 레이어는 타일 실측 전 UNKNOWN.<br>  - 하루/8일 합성: 레이어 존재 UNKNOWN. 있으면 구름 틈이 메워져 가장 극적이다.<br>  - 오늘/작년 같은 날: 수집기 백필로 만든다. GIBS 는 과거 날짜 타일을 준다.<br>5) Inspector.<br>  - 구간·관측일·출처·'2m 기온 아님'을 보여준다.<br>  - 가까운 관측소의 2m 기온은 **자기 관측시각·거리와 함께 따로** 보여준다.<br>  - LST 는 −2일 오전 통과 시각이고 관측소는 지금이다. 따라서 '같은 날'이라는 말을 쓰지 않는다.<br>6) 30일 재생.<br>  - 미리 구운 저해상 프레임으로만 한다.<br>  - 브라우저가 GIBS 에서 날짜당 50타일씩 받으면 1,500요청이 되므로 금지한다.<br>7) 범위에서 뺀 것.<br>  - level 4(200타일) 확대 스트리밍은 P2.<br>  - 12 Simulation 과 섞지 않는다(엔진 없음 — NOT_AVAILABLE). |
| 표현 | 고해상 색면(지형 드레이프 · 구간색 · 등치선 없음) |
| 자료 | 해상도는 지금 자료로 충분하다. level 3 은 약 7.8km/px 이고 5° 기온 격자보다 약 70배 촘촘하다. Open-Meteo 의존이 없다.<br>부족한 것은 '값'과 '캐시'다.<br>  (1) 값 수집기 신규(M).<br>  (2) GIBS 날짜 고정 풀기(S). 세 곳이다: live-layers.js:13, main.js:5735, main.js:5801-5805.<br>  (3) colormap XML 의 구간 폭·버전. 구현 전 실측이 필요하다(UNKNOWN).<br>모델 수집기 확인(aws/):<br>  - 01 Temperature 의 2m 기온(GFS)은 이웃 선행 작업 'GFS 확장(M)'이 생겨야 나온다. 지금 aws/gfs-cloud-forecast 는 구름과 UGRD/VGRD 만 받는다(handler.py:100, 170).<br>  - 지표온도 칩은 관측이라 Model 칸을 비운다.<br>위험:<br>  - MODIS Terra 는 노후 위성이고 임무 종료 일정은 UNKNOWN 이다(구현 전 확인). 수집기의 레이어 id 를 설정값으로 두어 VIIRS 계열 LST 로 교체할 수 있게 한다.<br>  - NASA 자료는 공개이고 인용 표기가 필요하다. |
| 재사용 | prototype/v2-three/js/live-layers.js(loadGibs 12-38 · metaGibs 1592-1607 문구 유지 · buildGibsShell 1576-1590 은 폐기), prototype/v2-three/js/main.js(EARTH_FRAG 드레이프 위치 414-427 · uniforms 2497-2529 · heightAtJs 2707-), aws/current-earth-snow-ice/index.mjs(서버 캐시 어댑터 패턴 · png-contract.mjs), 01 Temperature 구간 렌더러·범례 계약(docs/earthus-v23/CONTINUOUS_LAYERS.md §2), prototype/js/contour-math.js(라벨 자리 전용), aws/kma-aws · aws/land-stations(나란한 2m 기온) |
| 무료 / 유료 | 무료: 오늘(−2일) 주간 지표온도 전지구 그림 + 범례 + 클릭 구간값. A단계만 고쳐도 이 묶음에서 가장 극적인 무료 그림이다.<br>EXPLORER: 최근 30일 재생(구운 프레임), 작년 같은 날, 가까운 관측소 2m 기온과 나란한 판독(각자의 시각 표기), 도시 단위 짧은 리포트.<br>PRO: 두 날짜 split/wipe/diff, 주간−야간 차이(야간 레이어 확인 후), 관심 영역 구간 시계열·export. |
| 걸리는 것 | · 크기 과소평가. 드레이프+범례+판독(S~M)과 값 수집기+구간 재착색+칩+Inspector(M)는 별개 작업이다. → L 로 올리고 A/B 두 단계로 나눈다. MERGE(Temperature 칩 편입)는 B단계에서 한다.<br>· sampler 예산. EARTH_FRAG 는 이미 9개를 쓴다(main.js:194-302, WebGL2 보장 16). → 단일 자료 슬롯 규칙(한 번에 색면 하나, Compare 용 둘째 슬롯까지)을 둔다. 중급 모바일에서 renderer.capabilities.maxTextures 를 실측한 뒤 확정한다.<br>· 눈 드레이프 패턴을 그대로 쓰면 자료색이 밤면에서 5.5%로 꺼진다(main.js:425-427). → 자료색은 조명·dayMask 뒤에 무광으로 합성한다.<br>· 결측과 값의 선형 보간 오염(GMGSI 255 함정과 같은 구조). → 값과 유효 마스크를 분리하고, 마스크<1 표본은 버린다.<br>· 모바일. 5120×2560 RGBA 는 약 52MB 이고 4096 한도를 넘는다(main.js:110). → 3600×1800(모바일 1800×900) R8 값 PNG 를 쓴다.<br>· 정직성. Terra '주간'은 약 10:30 지방시 통과값이지 일 최고가 아니다. 관측소 기온과는 날짜·시각이 다르다. → 범례와 Inspector 에 시각을 각각 적고 '같은 날'이라는 문구를 쓰지 않는다.<br>· UNKNOWN 5건: 야간 레이어, 8일 합성 레이어, colormap 구간 폭, Terra 종료 일정과 VIIRS 대체, MOD11C1 접근 경로. → 구현 전 타일·XML 을 실측한다. 확인 전에는 화면에 약속하지 않는다.<br>· P0 Temperature 구간 렌더러가 선행 작업이다(B단계가 같은 구간·범례 계약을 쓴다).<br>· 정본에 없는 칩과 ≥60°C 확장 구간은 PD 확인이 필요하다. |
| **완료 기준** | · 과장 50× 로 티베트(32°N 88°E)와 이란 고원을 보면 지표온도 색이 지형 표면을 그대로 덮는다. 떠 있는 껍질이나 산에 뚫린 구멍이 없다. 밤 반구에서도 범례와 같은 색으로 보인다.<br>· 범례에 '°C 지표온도 · 2m 기온 아님 · MODIS Terra 주간 · 통과 약 10:30 지방시 · 관측일 YYYY-MM-DD · OBSERVED'가 상시 보인다. B단계 이후에는 연속 띠가 아니라 5°C 구간 칸(≥60°C 까지)이다.<br>· 구름에 가린 육지는 색 없이 '관측 없음(구름)'으로 구분된다. 범례에 '육지의 N% 관측'이 있다. 구름 가장자리에 저온색 테두리가 생기지 않는다.<br>· 지도를 한 번 클릭하면 Inspector 에 '구간 45~50°C · 관측일 · NASA MODIS/LP DAAC'가 나온다. 가까운 관측소 2m 기온은 자기 관측시각·거리와 함께 따로 나오고, '같은 날'이라는 문구는 없다. |

#### 지형 · `land.terrain` — 고친다 · P1 · M

| | |
|---|---|
| **Before** | 지형은 항상 켜진 기본 씬이라 메뉴를 눌러도 안내 카드 한 줄만 뜬다(main.js:4391-4393). 조작은 설정 서랍의 '시뮬레이션 · 표현 튜닝'에 슬라이더 6개와 수동 조명 체크로 자료 선택과 섞여 있다. 슬라이더는 지형 과장 1~80×, 등심선 간격, 음영 강도, 위성 색 혼합, 태양 방위각·고도각이다(index.html:1488-1518). v2 에 View > Appearance 패널은 아직 없다(grep 0건).<br>  - 고도색 함수 hypsometric() 은 있지만 smoothstep 연속 그라데이션이고(main.js:314-325) 바탕 사진과 80% 섞인다(:2504).<br>  - 등고선 셰이더는 바다(h<0) 전용이다(:506).<br>  - 고도 판독용 heightAtJs 는 전역 z4 캔버스만 겹선형으로 읽는다(:2707-2729). z4 는 적도 기준 약 9.8km/px 다.<br>  - 범례와 Inspector 고도 판독이 없다.<br>  - sim-questions.js:217 은 출처를 'GEBCO·Copernicus 고도'라고 적었지만 실제 메시는 AWS Terrarium 이다(main.js:107-108). |
| 돈 내는 사람 눈 | 입체 지형 자체는 v2 의 간판이고 실화면에서도 가장 보기 좋다 — 산맥의 결과 음영이 살아 있고 확대하면 위성사진이 붙는다. 하지만 '지형' 메뉴를 누르면 글 카드 한 장이 뜰 뿐이고, 질문('높낮이가 실제로 얼마나 다른가')에 답하는 숫자·범례·단면은 없다. (B 손보면 된다) |
| 기준 사이트 | mapped.earth: 지형을 표현 도구로 쓰고(인구 밀도만큼 땅이 솟는다) 튜닝 패널은 없다. windy: 지형 메뉴가 없고, Altitude 는 자료 고도 선택이며 표현 보조는 'Display on map'으로 분리돼 있다. |
| **After** | [→ 09 Terrain] + 렌더 조작은 View > Appearance 로 옮긴다. 우선순위를 둘로 나눈다.<br>■ P0 조각 (S) — PD 정본 P0 의 'Data/View 분리' 산출물. Global Shell 작업에 귀속시킨다.<br>  - index.html:1488-1518 의 슬라이더 6개와 수동 조명 체크를 설정 서랍에서 없앤다. 신설하는 View > Appearance 에 프리셋 칩으로 옮긴다.<br>  - 프리셋: 지형 과장 1×(실제) / 10× / 25× / 50×(기본), 음영 약/중/강, 위성 색 혼합 3단, 태양 '실시간 / 고정'.<br>  - 방위·고도각은 Advanced 에만 둔다. 자동 회전과 지구 바탕 그림도 여기로 옮긴다.<br>  - ⚠ 과장은 '그린 값'을 표기한다. 프레임 루프가 uExagger = min(exagUser, exagCeil) 로 낮춰 그리기 때문이다(main.js:6268-6269). 예: '설정 50× · 지금 표시 12×'.<br>  - 콘셉트 이미지 09 의 'Exaggeration 2x' 패널과 정본 본문(Advanced View 에만)이 충돌한다. 본문을 따른다. **PD 확인 필요**.<br>■ P1 본체 (M) — 09 Terrain 데이터 모드<br>① Elevation 구간색 10단.<br>  - 구간: <0 · 0~100 · 100~250 · 250~500 · 500~1000 · 1000~2000 · 2000~3000 · 3000~4000 · 4000~5000 · ≥5000 m. 구간값은 제안값이다. **PD 확정 필요**.<br>  - hypsometric() 을 계단 함수로 바꾼다.<br>  - 켜면 사진 혼합을 0 으로 내린다. 자료색은 조명·밤낮 마스크 뒤에 합성한다. 지금처럼 80% 사진 + 밤면 0.055배면 범례 색과 화면 색이 다르다.<br>② Contour 토글 + 프리셋 칩 100/250/500/1000 m.<br>  - 5번째마다 주곡선을 그린다. 등심선 셰이더(main.js:501-521)를 육지로 일반화한다. 줌에 따른 2배 성김 로직은 유지한다.<br>  - ⚠ 해상도: 전역 z4 는 적도 기준 약 9.8km/px 다(main.js:107, 4479). 1차안의 '2.4km/px'는 오류다(그건 z6).<br>  - 따라서 전지구 시점은 1000m 만, 대륙 시점은 500m, 250/100m 는 디테일 창(z9 ≈306 m/px)이나 local-terrain(z10) 안에서만 활성이다. 나머지 칩은 비활성으로 두고 이유를 표시한다.<br>  - 숫자 라벨은 이웃 결정과 같다. 선은 셰이더가 그린다. contour-math 는 라벨 자리 찾기 전용이다(솎은 격자, 간격·시점이 바뀔 때만 계산). 기존 라벨 풀 8개 예산(ui-shell.js:1390)을 공유한다.<br>  - 성능: 등심선은 픽셀마다 displacementHeight 5탭(main.js:245-254, 508)을 더 읽는다. 육지까지 넓히면 전 화면이 5탭이 된다. 이미 읽은 h 를 재사용하거나 모바일에서는 1탭으로 줄인다.<br>③ Hillshade 켬/끔.<br>④ Satellite imagery picker.<br>  - index.html:1470-1475 의 세그먼트를 이전한다.<br>  - '시간에 따라 변하지 않는 자료' 배지는 Elevation/Contour/Hillshade 에만 붙인다. '오늘의 지구'는 일별 관측이라 관측일을 표기한다.<br>Inspector.<br>  - 클릭하면 그 지점의 고배율 Terrarium 타일 1장(z≥10)을 받아 고도를 읽는다. '고도 m · 타일 z · 약 m/px · 출처 AWS Terrain Tiles'를 보여준다.<br>  - 실패하면 z4 값을 '약 10km 평균값' 라벨과 함께 보여준다.<br>  - '과장은 표현일 뿐 값은 실측 그대로'를 고정 문구로 둔다.<br>뺀 것.<br>  - '화면 안 최고점 고도 라벨'을 뺀다. z4 는 9.8km 평균이라 봉우리가 실제보다 낮게 읽힌다. 없는 정밀도를 만들지 않는다. 디테일 창 안에서만 가능한 P2 다.<br>드레이프 계약(이 항목은 **선언만** 한다. 구현은 첫 소비자인 P0 Temperature 기준 렌더러와 P1 공통 renderer contract 가 한다).<br>  - 자료 색면은 구 껍질이 아니라 지형 셰이더의 **단일 자료 슬롯**에 조명 뒤 무광으로 합성한다. 바다 색면은 h<0 마스크를 쓴다.<br>  - 근거 1: GIBS 껍질 1.0014 고정(live-layers.js:1584)은 178m 위가 묻힌다.<br>  - 근거 2: 바다 색면 1.0012(:1113)는 153m 아래 육지를 덮는다.<br>  - 근거 3: 대기 색면 airShell = 1.004+과장×9000m(:1169-1172)는 50× 에서 반지름 1.0746 이라 해안선과 시차가 난다.<br>sim 선언은 유지한다. land.terrain 의 질문은 'terrain-change'다(sim-questions.js:216). '해수면이 오르면 어디가 잠길까'는 :290 의 다른 현상 소속이다. 둘 다 NOT_AVAILABLE 그대로 둔다. 고도맵 물채움을 시뮬레이션이라 부르지 않는다. |
| 표현 | 단계색+등치선(지형 셰이더 내) + View>Appearance 프리셋 칩 |
| 자료 | 새 수집기는 필요 없다.<br>  - AWS Terrain Tiles(Terrarium) 전역 z4(4096×4096 웹메르카토르, 적도 약 9.8km/px)와 지역 z5~z9 디테일 창을 같은 셰이더에서 읽는다.<br>  - Inspector 의 정밀 고도는 클릭 지점의 고배율 타일 1장을 즉석에서 받으면 된다(S).<br>확인할 것:<br>  - Terrarium 의 구성 원천별 출처 목록은 UNKNOWN 이다(구현 전 확인). sim-questions.js:217 의 'GEBCO·Copernicus' 표기는 실제 자료(main.js:108)와 맞지 않아 수정 대상이다.<br>⚠ Esri World Imagery 는 지금도 키 없이 호출 중이다(main.js:949, 1101 · local-terrain.js:8).<br>  - 유료 전환 시점의 이용 조건이 UNKNOWN 이다. 'PRO 의 약속' 문제가 아니라 오늘의 위험이다.<br>  - 확인 전에는 고해상 위성을 유료 가치로 약속하지 않는다. NASA GIBS/Blue Marble 로 바꿔 끼울 수 있게 출처를 설정값으로 둔다.<br>모델 수집기는 해당 없음(정적 자료). |
| 재사용 | prototype/v2-three/js/main.js(hypsometric 314-325 → 계단화 · 등심선 셰이더 501-521 일반화 · uIsobath/uIsobathStep 2501-2502 · bind 2612-2633 → 프리셋 칩 · exagCeil 6268-6269 · heightAtJs 2707- · setBaseStyle 5837- · ocean/isobath 분기 4467-4483), prototype/v2-three/index.html(1470-1518 → View>Appearance), prototype/js/contour-math.js(라벨 자리 전용), prototype/v2-three/js/ui-shell.js(라벨 풀 1385-1396), local-terrain.js · measure.js, sim-questions.js:207-219 · :290(선언 유지, :217 출처 문구 수정) |
| 무료 / 유료 | 무료: 3D 실지형 + Elevation 구간색 + 등고선 프리셋 + 클릭 고도값. 정본은 Explorer 'terrain & contours'이지만 기본 그림은 무료에서 완성돼 보여야 한다. 경계는 **PD 결정 필요**.<br>EXPLORER: 두 지점 단면도(measure.js 확장), 저장된 뷰·프리셋.<br>PRO: 고해상 지역 3D(local-terrain.js, Esri 조건 확인 후), 경사·향 프리셋, 뷰 export. |
| 걸리는 것 | · P0 과대 지정. PD 정본의 P0·P1 목록에 Terrain 이 없다. → 슬라이더 이전(S)만 P0 'Data/View 분리'로 Global Shell 작업에 넘긴다. 데이터 모드 본체는 P1·M 으로 둔다.<br>· 해상도 오기. 전역 z4 는 9.8km/px 다(main.js:107, 4479). → 등고선 프리셋은 시점별로 활성화한다(전지구 1000m / 대륙 500m / 디테일 창 250·100m).<br>· 없는 정밀도. z4 값으로 봉우리 고도 라벨을 찍으면 실제보다 낮다. → 최고점 라벨을 제거한다. Inspector 는 클릭 지점의 고배율 타일로 판독하고 m/px 를 표기한다.<br>· 과장 표기 불일치. 그리는 값은 min(exagUser, exagCeil) 이다(main.js:6268-6269). → '설정값 / 지금 표시값'을 둘 다 보여준다.<br>· 범례색≠화면색. 사진 혼합 80%(:2504)와 밤면 0.055배(:426)가 원인이다. → Elevation 을 켜면 사진 혼합을 0 으로 내리고 조명 뒤에 합성한다.<br>· 등고선 5탭 비용이 전 화면으로 확대된다(main.js:245-254, 508). → h 를 재사용하거나 모바일에서 1탭으로 줄인다. 중급 모바일에서 프레임 시간을 실측한 뒤 확정한다.<br>· Esri World Imagery 를 키 없이 호출 중이다. 유료 이용 조건은 UNKNOWN 이다. → 확인 전에는 PRO 가치로 약속하지 않고, GIBS/Blue Marble 로 바꿀 수 있게 준비한다.<br>· 출처 문구 불일치(sim-questions.js:217 'GEBCO·Copernicus' vs 실제 Terrarium). Terrarium 의 원천 목록은 UNKNOWN 이다. → 확인 후 Inspector 와 credit 문구를 일치시킨다.<br>· View > Appearance 패널이 v2 에 아직 없다. P0 Global Shell 이 선행 작업이다. |
| **완료 기준** | · 설정 서랍에 input[type=range] 가 0개다. 같은 조작(과장·음영·위성 혼합·태양)이 View > Appearance 에 프리셋 칩으로 있다. Terrain 패널에는 Elevation / Contour / Hillshade / Satellite 넷만 있다.<br>· Elevation 을 켜면 육지가 구간색 10단으로 칠해진다. 범례(m)의 색과 화면의 색이 낮·밤 반구 모두에서 같다.<br>· Contour 1000 m 를 켜고 히말라야를 보면 굵은 주곡선 위에 'N,000 m' 숫자 라벨이 보인다. 전지구 시점에서는 100 m·250 m 칩이 비활성이고 이유가 표시된다.<br>· 지도를 한 번 클릭하면 Inspector 에 '고도 N m · 타일 z · 약 m/px · AWS Terrain Tiles · 설정 과장 50× / 지금 표시 N×'가 나온다. |

<details><summary>반박 검증에서 뒤집거나 낮춘 것 (47)</summary>

- [뒤집음 · 최우선] 눈 덮임 dataNeed 의 '(1) 이미 수집·배포 중인 IMS PNG · 일 1회'는 사실이 아니다. 공개 객체는 8,222B·전 픽셀 투명이고 Last-Modified 08-31, aws/schedules.sh 에 함수가 없다. 같은 매개변수로 NOAA 를 직접 불러도 sha256 이 같은 빈 그림이 온다. 원인은 서비스의 maxps=10km 인데 수집기는 약 19.5km/px 로 요청한다(8km/px 로 부르면 47.5KB·2색이 온다). png-contract.mjs 는 폭·높이만 검사해 이를 못 잡았다. → '수집기 복구'를 독립 M 선행 작업으로 분리.
- [올림] 눈 덮임 size M→L: 수집기 복구(요청 해상도·재투영·내용 검증·스케줄) + 드레이프 렌더 + 이력 저장 시작. 우선순위 P2 는 유지.
- [고침] 눈 덮임 범례의 'IMS 1km' 단독 표기 → '원자료 1km / 표시 약 6km'. 우리가 보여 주는 해상도를 말한다. 색→분류(0~4) 표는 저장소 어디에도 없어 UNKNOWN 으로 두고 /legend 확인을 blocker 로 넣었다.
- [철회] 눈 덮임 ⑤ '관측 없음 회색 빗금': IMS 는 분석관이 구름을 메운 분석장이라 그런 분류가 없고, GIBS NDSI 타일은 눈 없음과 구름·밤을 똑같이 투명으로 준다 — 빗금은 없는 분류를 만드는 것. 고정 문구로 대체.
- [철회] 눈 덮임 '지금 북반구 눈 덮임은 연중 최소기' 문구: 자료에서 계산하지 않은 계절 문장이다. 이력 1년 또는 기관 기후값 인용 전에는 쓰지 않는다.
- [낮춤] 눈 덮임 '7일 변화'·'작년 같은 날'·면적 라벨을 1단계 완료 기준에서 뺐다. 이력은 복구일부터 쌓이고(S3 Versioning OFF → 날짜 키), 면적은 표시용 PNG 가 아니라 원 분류값에서 Lambda 가 합산할 때만 표시.
- [철회] 해빙 '최소안 = GIBS colormap 색→% 역변환(클라이언트)': 5120×2560 RGBA 캔버스 52MB 를 1,300만 픽셀 돌리는 경로라 모바일 불가. Lambda 값 PNG 하나로 간다.
- [고침] 해빙의 두 선(오늘 가장자리 · 1981–2010 중앙값)은 같은 제품군(NSIDC Sea Ice Index, 15% 문턱)에서만 받는다. 복구된 IMS 의 해빙 분류로 '오늘 선'을 그리는 지름길은 정의가 다른 두 선을 비교하게 되므로 채택하지 않았다.
- [올림] 해빙 size M→L, 1단계(무료 핵심 그림, P1)와 2단계(이력 프레임·재생·Compare, P2)로 분리. 농도 격자 수집기가 없고(면적 CSV 빌더만 있음) 1979~ 백필은 약 3.4만 파일의 별도 배치다. P1 을 유지한 이유: Open-Meteo 의존이 없어 이 묶음에서 라이선스 위험 없이 유료 등급 그림을 세울 수 있는 첫 후보.
- [뒤집음] 대기질 paidHook 의 '이미 도는 CAMS 24h 예보 실측 대조'는 Open-Meteo 경유다(aws/lab-events/handler.py:651, :686 agency 'CAMS_OPENMETEO'). 6개 도시·PM10 만, 격자점값을 시도 평균과 비교한다 → CAMS 직수신 뒤 다시 짓기 전에는 PRO 상품이 될 수 없다.
- [낮춤] 대기질 '동아시아 0.5° 판을 즉시 연결하면 정본 07 에 근접' → FREE_OPEN 한정 임시. air-ea 는 Open-Meteo 호출의 62%·429 주원인이고 감사가 3시간 축소를 권고했다(docs/R0-OPEN-METEO-AUDIT-2026-09-20.md:12-13·63·73).
- [고침] 대기질 'NO2 칩은 수집 필드에 없다' → 관측소에는 있다(aws/air-korea/handler.py:183), 격자에만 없다. 또 O3·NO2·Dust 의 µg/m³ 는 CAMS 직접 필드가 아니라 혼합비 환산일 가능성이 높아 1차 범위를 PM2.5·PM10 으로 줄였다(변수 목록 구현 전 확인).
- [올림] 대기질 size L→XL: CAMS ADS 수집기(계정·큐 비동기·GRIB 해독)가 독립 L 선행 작업이고, 시도 채움용 폴리곤은 시군구 자산(prototype/data/korea-admin-reference.json, ADM2)을 시도로 묶는 전처리가 필요하다. 우선순위 P1 유지(P0 아님).
- [고침] 자외선: 원안은 GFS UV-B 환산을 '없는 값 생성'이라며 거부했지만 CAMS 도 지수가 아니라 선량 필드다(지수 = 40 × 선량, WHO 정의). 논거를 일관되게 — 정의에 따른 단위 환산은 허용하되 상시 표기. size 는 M 유지(수집기 제외 증분)이나 CAMS 수집기 없이는 착수 불가임을 blocker 로 명시. 시도 예보 칩은 '(시도)'를 붙여 도시 지점값처럼 쓰지 않는다.
- [채움] 지상 관측은 입력이 paidHook 중간에서 끊겨 paidHook·size(L)·priority(P1)·action(MERGE)·reuse·blockers·acceptance 를 검증자가 채웠다.
- [철회] 지상 관측 '그 아래 화면 내 전부' LOD → 데스크톱 160/모바일 60 상한. 피드를 다 연결하면 지점이 약 7,000 이 되고 현 update 루프(station-model.js:319-361)는 O(배치×후보)+left/top 갱신이라 모바일에서 끊긴다.
- [뒤집음] 지상 관측 '같은 칸 모델값(GFS 0.25° 직수신)': 그 수집기는 없다. 1단계는 이미 있는 aws/ecmwf-ingest(IFS 2m 기온·ASOS 97지점·CC-BY-4.0)로 기온만, 나머지는 P0 자료 확보에 의존.
- [뒤집음] 지상 관측 과거 시각 재생·최근 시계열: aws/archiver 의 수집 대상 8종에 지상관측이 없다(handler.py:370-378; :634-642 의 wind/stations.json 은 결측 원장 목록일 뿐). 이력 저장을 새로 시작해야 하며 EXPLORER 훅은 '쌓인 기간만'으로 낮췄다.
- [철회] 지상 관측 '관측망 없음 옅은 빗금 면': 경계를 우리가 그어야 하는 도형이라 지어낸 면이 된다 → '이 화면 안 관측소 n곳'·'반경 300km 안 관측소 없음' 같은 계산 가능한 사실 문구로 대체.
- [미검증] weather.climate_series · land.surface_temperature · land.terrain 은 제안 본문 미수신으로 항목을 만들지 않았다.
- [기후 시계열] '날짜를 짚으면 Global Timeline 이 그 날로 이동'을 1단계(M)에서 빼고 2단계(L·P2)로 내렸다. Timeline 은 min=-1440 · max=7200 분, 즉 −1일~+5일뿐이고(ui-shell.js:1334), ▶ 재생은 구름을 모델로 바꾸는 훅을 부른다(:1375). 수십 년 전 날짜는 '기록 날짜 모드' 없이는 갈 수 없다. 이 모드는 P0 Single Timeline 소관이다.
- [기후 시계열] '한국 10개 관측소 중 가장 가까운 곳의 계열'과 EXPLORER '내 장소 최근접 관측소 계열'을 철회했다. 빌더 추가가 조건이다. korea-daily.json 은 10소를 평균한 연도별 한 줄만 저장한다(build_korea_series.py:126-136). 관측소별 배열이 없다. 또한 고정 10소는 해안·섬 위주라 내륙 도시에서는 100km 이상 떨어진다. 거리 표기와 '내 장소 값 아님' 라벨이 필요하다.
- [기후 시계열] '그래프 코드는 그대로'를 뒤집었다. chartBox() 가 W 300~700 · H 190~320 으로 자르고 v1 의 #sheet 를 잰다(ui-charts.js:114-131). 그래프는 정적 SVG 문자열이라 날짜 picking 도 없다. 1,300×420 시트에는 box 인자 추가가 필요하고, v1 공유 파일이라 회귀 확인이 필요하다.
- [기후 시계열] '오늘 값'을 '최신값(자료일)'로 고쳤다. OISST·NSIDC 는 2~3일 지연이다(build_seaice_series.py:12 에 실측 주석). GHCN 은 더 늦다. 최근 OISST 는 잠정값이다. 해빙 1979–87 은 격일 관측이라 순위에 n년을 표기한다.
- [기후 시계열] 공간 범위 고정 표기를 추가했다. 계열 넷 중 셋은 전지구·대륙 상자평균이다(build_land_series.py:59-79). 위치 기반 탭에서 선택 지점 값처럼 읽히면 '5° 격자≠도시값'과 같은 위반이다. 한국 지점의 '평년 대비'는 10소 평균이 아니라 기상청 공식 평년(aws/kma-normal/handler.py, 1991–2020)을 쓴다.
- [기후 시계열] '지구 연동용 일별 프레임은 추가 필요'(M 안에 포함)를 분리했다. OISST 0.25° 임의 날짜 프레임은 새 수집기와 약 16,000장 백필이 필요해 하지 않는다. 연동은 GIBS 날짜 인자화(하드코딩 세 곳: live-layers.js:13, main.js:5735, 5801-5805)로 되는 레이어·기간으로만 한정한다.
- [기후 시계열] ERA5 'Copernicus 라이선스 — 구현 전 확인'을 구체화했다. 저장소 카탈로그에 이미 tier B, '출처표시 필요', '절대 미러하지 않는다'로 등재돼 있다(aws/catalog/build_catalog.py:64-68, 345-364). 수집기는 없다. XL·P2 는 유지한다.
- [기후 시계열] before 의 '409×188px'와 '메뉴 재클릭 토글 버그'를 미검증으로 낮췄다. 코드에서 확인하지 못했다.
- [기후 시계열] 유지한 것: 5° 상자평균 막대 삭제는 옳다(stats.js:183-200 이 gridOverlay 'wind' = Open-Meteo 를 읽는다). 그 블록 안의 '전지구 해수면온도 평균' 참고줄(ui-charts.js:633-637)도 함께 삭제한다. '국가별 공항 관측소 평균'은 aviationweather.gov METAR(aws/land-stations/handler.py:41)라 유지한다.
- [지표온도] size 를 M 에서 L 로 올렸다. 드레이프·범례·판독(S~M)과 값 수집기·구간 재착색·칩·Inspector(M)는 별개 작업이다. A/B 단계로 나누고, MERGE(Temperature 칩 편입)는 구간색이 되는 B단계에서만 한다. A단계의 NASA 연속 팔레트는 정본 규칙 4 를 만족하지 않는 임시 상태라고 명시했다.
- [지표온도] '눈 덮임과 같은 방식으로 칠한다'를 수정했다. 눈은 ground 에 섞여 낮 0.42+0.70·hillshade, 밤 0.055배로 조명된다(main.js:414-427). 자료색을 그렇게 섞으면 범례 색과 화면 색이 달라지고 밤 반구에서 사라진다. 조명 뒤에 무광으로 합성하도록 바꿨다.
- [지표온도·지형 공통] '모든 자료 색면을 지형 셰이더에 드레이프'를 '단일 자료 슬롯' 규칙으로 좁혔다. EARTH_FRAG 가 이미 sampler2D 9개를 쓴다(main.js:194-302, WebGL2 보장 16).
- [지표온도] 값 경로의 우선순위를 정했다. 1순위는 GIBS 팔레트 PNG 역변환이다. 자격증명·HDF 가 필요 없고, 버전을 고정하며, 정확히 일치하는 색만 값으로 쓴다. 2순위는 MOD11C1(HDF4 + Earthdata 로그인, Lambda 패키징 별도 M, 접근 경로 UNKNOWN)이다. 수집기는 aws/current-earth-snow-ice/index.mjs 의 서버 캐시 패턴을 따른다.
- [지표온도] '회색 빗금으로 구름 틈 채우기'를 약화했다. 하루 관측에서 육지 절반 이상이 구름이라 전면 빗금은 고장처럼 보인다. 바탕 지형을 무채색으로 낮추고 범례에 '육지의 N% 관측' 숫자를 둔다. 빗금은 확대했을 때만 옅게 쓴다.
- [지표온도] 결측과 값의 LinearFilter 혼합 함정을 추가했다(GMGSI 255 와 같은 구조). 값과 유효 마스크를 분리한다. 인코딩은 이웃 결정(8bit 1채널 선형 0.5°C)에 맞췄다.
- [지표온도] '같은 날 가장 가까운 관측소 기온' 예문을 철회했다. LST 는 −2일 오전 통과(약 10:30 지방시, 일 최고 아님)이고 관측소는 지금 값이다. 두 시각을 각각 적고 '같은 날'이라는 말을 쓰지 않는다.
- [지표온도] 'level 4 200타일 시야 스트리밍'과 '브라우저 직접 30일 재생'을 범위에서 뺐다. 30일 재생은 1,500요청이고 5120×2560 RGBA 는 약 52MB 다. 구운 저해상 프레임으로 대체한다.
- [지표온도] Terra 노후(종료 일정 UNKNOWN)와 VIIRS 대체 준비를 blocker 로 추가했다. 야간·8일 합성 레이어는 타일 실측 전 UNKNOWN 으로 남겼다.
- [지형] priority 를 P0 에서 P1 로 낮췄다. PD 정본의 P0·P1 목록에 Terrain 이 없다. P0 에 해당하는 것은 슬라이더 6개와 수동 조명을 View > Appearance 로 옮기는 일(S)뿐이고, 이는 Global Shell 'Data/View 분리' 산출물로 넘겼다. 드레이프 계약은 이 항목에서 선언만 하고 구현은 P0 Temperature 기준 렌더러에 맡긴다.
- [지형] '전역 z4 는 약 2.4km/px'를 뒤집었다. TERRARIUM_ZOOM=4 는 4096×4096 이고(main.js:107), 코드 주석도 '적도 약 9.8 km/px'라고 적는다(:4479). 2.4km 는 z6 값이다. 등고선 프리셋 활성 조건을 다시 잡았다: 전지구 1000m, 대륙 500m, 디테일 창(z9 ≈306m/px)에서만 250·100m.
- [지형] '화면 안 최고점 고도 라벨'을 제거했다. z4 는 9.8km 평균이라 봉우리가 실제보다 낮게 읽힌다. 없는 정밀도를 만들지 않는다. Inspector 고도도 heightAtJs(z4 겹선형, main.js:2707-2729)가 아니라 클릭 지점의 고배율 타일로 판독하고 m/px 를 표기한다.
- [지형] 과장 프리셋 표기를 수정했다. 실제로 그리는 값은 매 프레임 min(exagUser, exagCeil) 이다(main.js:6268-6269). '설정값 / 지금 표시값'을 둘 다 보여준다.
- [지형] '고도 구간색 없음'을 정정했다. hypsometric() 은 있다(main.js:314-325). 다만 smoothstep 연속 그라데이션이고 바탕 사진과 80% 섞인다(:2504). 새로 만들지 않고 계단화한다. Elevation 모드에서는 사진 혼합을 0 으로 내린다.
- [지형] sim-questions.js 인용을 정정했다. :207-219 의 land.terrain 질문은 'terrain-change'다. '해수면이 오르면 어디가 잠길까'는 :290 의 다른 현상 소속이다. :217 의 'GEBCO·Copernicus 고도' 표기는 실제 메시(AWS Terrarium, main.js:107-108)와 맞지 않아 수정 대상으로 올렸다.
- [지형] Esri 를 'PRO 약속 보류'에서 '오늘의 위험'으로 올렸다. 이미 키 없이 호출 중이다(main.js:949, 1101 · local-terrain.js:8). 이용 조건은 UNKNOWN 이다.
- [지형] '시간에 따라 변하지 않는 자료' 배지를 Elevation/Contour/Hillshade 로 한정했다. 같은 패널의 '오늘의 지구'(VIIRS 일별, main.js:5776-5778)와 모순되기 때문이다.
- [지형] 등고선 성능 비용을 추가했다. 등심선은 픽셀마다 displacementHeight 5탭을 더 읽는다(main.js:245-254, 508). 육지로 넓히면 전 화면이 5탭이 된다. 모바일에서는 h 를 재사용하거나 1탭으로 줄인다.

</details>

### 4-5. 생태·사람·여행

> ① 입력 절단: 전달된 개선안 JSON 은 travel.today_pick 의 reference 중간에서 끊겼다. 완전한 항목 9개(숲·철새·조류 조사·바다거북·바닷새·인구·혼잡·밤의 불빛·뉴스)만 반박 검증했고, today_pick 은 before 만 받았다. 나머지 5개(place_catalog·place_sequence·visitor_pressure·poi·flight)는 원안을 보지 못해 레지스트리(phenomenon-registry.js:558-629, MENU_GROUPS :1103-1107)와 travel.js·route.js·aws 코드에서 직접 읽은 사실만으로 '최소안'을 적고 항목마다 [원 개선안 미수신]으로 표시했다 — 이 6개는 검증 결과가 아니다. ② 콘셉트 이미지 14장을 열어 확인했다(image1 = 12면 보드, image2~13 = 01~12 절 그림, image14 = Temperature 기준 설명): 모든 그림의 좌측 레일은 9현상뿐이고 생태·사람·여행의 자리는 어느 그림에도 없다. 09 Terrain 그림은 고도 지형 위에 Elevation · Contour 500m · Exaggeration 2x · Hillshade 토글만 있고 인구 릴리프는 없다 — 그림 속 'Exaggeration 2x'는 본문 AC('terrain exaggeration 은 Advanced View 에만')와 어긋나므로 본문을 따른다(문서 스스로 그림을 시안이라 한다). 이 묶음에 P0 는 없다. PD 정본의 P0/P1 목록 어디에도 이 15현상이 없고, 자리가 정본 본문에 있는 것은 밤의 불빛(09 Terrain 'Satellite 는 imagery source picker 로 분리') 하나뿐이다. 인구는 09 절에서 MAPPED.earth 칸의 서술일 뿐 EARTHUS AFTER 칸(데이터 모드 4개로 '단순화')에는 없다. ③ 공용 선행 부품 4개 — 항목마다 크기를 부풀리지 않고 여기 한 번 적는다: (a) 범례 컴포넌트(v2 에 0줄, Temperature 기준 구현체 산출물) (b) LiveLayers.pick — 클릭→위경도 사슬은 main.js:2793-2831 에 있고(extScene→travel→seafloor→focus) LiveLayers 만 빠져 있다, S~M, 숲·인구·혼잡·뉴스가 쓴다 (c) 리본/굵은 선 메시 헬퍼 — prototype/vendor 에는 three-r184 본체·earcut·satellite 뿐이고 Line2 가 없다, ext ctx.makeLine 의 linewidth 는 WebGL 에서 무시된다(ext-scene.js:140-148), M, 철새·거북·항로·연관 관광지가 쓴다 (d) Global Timeline 의 축 모드 — 지금 있는 것은 '지금±오프셋(ms)' 스크럽 하나(main.js:3053, :4892-4897; 혼잡이 이미 물려 있다). 연 눈금(숲 소실 2001~2023 · 바닷새 9개 조사연도 · 철새 2021~2025)과 날짜 눈금(밤의 불빛 · 집중률 예측)은 없다 — P0 셸 작업이고, 생기기 전에는 새 슬라이더를 만들지 말고 Inspector 칩이나 기존 조작부로 버틴다. ④ 대회 동결: 여행 6현상은 한국관광 데이터랩 경진대회 출품 모듈이다(접수 2026-09-30 14:00 · 발표심사 10-23). 그 전에는 메뉴 이동·삭제를 하지 않고 문구·단계색만 고친다. ⑤ 모델 이름 확인(aws/): GFS = gfs-cloud-forecast·gfs-cloud-global-low·gfs-cloud-volume(구름만) 있음 / ECMWF = ecmwf-ingest(IFS·AIFS 오픈데이터, CC-BY-4.0) 있음 / CAMS = 직접 수집기 없음, air-grid 등이 Open-Meteo Air Quality API 경유로만 받는다(air-grid/handler.py:27, :52 — 라이선스 위험 경로) / JTWC = typhoon-official 이 '403 봇 차단으로 못 받는다'고 적음(handler.py:29) / CMIP6 = aws/ 전체에 0건. 이 묶음 15현상은 어느 모델에도 기대지 않는다(전부 관측·통계·정적 자료) — 예외는 travel.flight 임시 항로의 Open-Meteo 공항 날씨(route.js:332) 하나. ⑥ 유료 가치 총평: 이 묶음에서 구독 동기가 서는 것은 인구(재해 노출 집계, Hazards Inspector 뒤)·혼잡(예측 타임라인·알림)·오늘 갈 곳(30일 집중률)·밤의 불빛 2단계(수집기 신설 뒤) 넷뿐이다. 새·거북·숲·뉴스 링크는 무료 고정이 정직하다. ⑦ 범위 밖에서 본 것 하나: 밤의 불빛이 들어갈 imagery picker 에는 Esri World Imagery 도 함께 놓인다(main.js:949, :1101) — Esri 타일의 유료 상품 내 이용 조건은 이번에 확인하지 못했다(UNKNOWN, 별도 확인 권고). ⑧ 작업 파일: 최종안 사본은 C:\Users\Dalur\AppData\Local\Temp\claude\D-----APP-EARTHUS-v2-APP\66c90b2a-d114-47d4-8192-1ee8a5abecad\scratchpad\redteam-life-people-travel.json (저장소는 건드리지 않았다).<br>> 【재검증분 — 여가(해변·서핑·낚시·패러글라이딩·산 정상)】 [여가 5현상 공통 — 크기에 넣지 않은 선행 조건]<br>> 1) 자리: 다섯 현상 모두 MENU_GROUPS 'society(생태·사람·여행)' 소속이다(phenomenon-registry.js:1108-1109). PD 정본 레일에 자리가 없으므로 전 항목 action=MERGE 는 **권고일 뿐 PD 결정 필요**(부모 현상 토글로 흡수 / v1 이관 / 'Life' 보조 서랍 / 삭제). 패러글라이딩(26곳)이 이관·삭제 1순위, 산 정상이 흡수 1순위.<br>> 2) 셸 의존: 우측 Inspector·'Show Stations/spots' 토글 부품은 v2 에 아직 없다(ui-shell.js·main.js·live-layers.js grep 0건). 다섯 항목은 전부 P0 셸(Inspector·Single Timeline) 뒤에만 시작할 수 있고, P0 는 하나도 없다 — 맞다.<br>> 3) 공용 마커 부품(M, 07 Air Quality 'Show Stations' 와 한 부품): 지금 ext 마커는 PointsMaterial 원 텍스처 하나(회전·아이콘 불가, ext-scene.js:97-138), 라벨은 개당 CanvasTexture+Sprite=드로우콜 1(ext-scene.js:169-184), CONTRACT 가 '객체 수백 개 이내'. 필요한 것: 아이콘 아틀라스+회전 attribute Points 셰이더(전 마커 1드로우콜) · 라벨 아틀라스(예산 데스크톱 ≤40 / 모바일 ≤16) · 고도별 클러스터 · 픽→Inspector. 이게 없으면 '12곳 제한 해제'는 모바일에서 못 돈다.<br>> 4) ExtScene 시간 훅(S): main.js:4891-4897 onTimeOffset 은 clouds.setForecastOffset·liveLayers.setTimeOffset 만 부른다. ext 모듈에는 시간 개념이 없다 — 네 항목의 '타임라인을 밀면' 문장의 전제.<br>> 5) 자료 원천 원칙: 마커 숫자는 **부모 현상이 그리는 프레임을 지점에서 읽는다**(서핑·낚시=05 Ocean 파랑 프레임, 패러=02 Wind GFS 프레임). 지점 전용 수집기를 따로 세우면 색면과 마커 숫자가 서로 다른 모델에서 와 어긋난다. 8bit 1ch 선형 프레임·공용 프레임 저장소(이웃 결정)와 그대로 맞물린다.<br>> 6) 자료 확보 선행(이웃 'GFS 확장 M' 에 **없는 것**): 파랑(수집기 0개 — R0 감사 §4), 조석예보(수집기 0개), 돌풍 GUST·850hPa(확장 목록에 없음). 파랑은 05 Ocean 소유 L, 조석예보는 낚시 항목 소유 S~M.<br>> 7) Open-Meteo: beaches.js:226 · fishing.js:293 · para.js:136 은 R0 감사 §2 '브라우저 직접 호출'에 이미 올라 있다(config.js:84,86). 감사 추천 D-OM1(C)·D-OM5 는 '소량·임의 지점은 Standard 유료 키' — 임시 경로로 가능하나 키를 브라우저에 둘 수 없어 서버측 수집기로 옮겨야 하고, PD 결정 사항이다. 패러·산 정상은 Open-Meteo 없이 기상청 자료만으로 선다.<br>> 8) 문서 충돌: ecmwf-ingest 스케줄 — README:37 '미스케줄'(schedules.sh 에도 없음) vs R0 감사 §4 'cron(40 2,8,14,20) 실측'. 실측 UNKNOWN, 이웃 결정(미스케줄)을 전제로 썼다.<br>> 9) 시안 모델 이름 대 저장소: GFS=있음(aws/gfs-cloud-forecast, NOMADS 0.5°), ECMWF=점값 97지점뿐(격자 아님), GFS-Wave/ECMWF-WAM=없음, CAMS=없음, JTWC=이 묶음과 무관, CMIP6=이 묶음과 무관.<br>> 10) 지금 당장 권고(읽기 전용이라 실행 안 함): mountain-verify rows 에 예보 유효시각 1필드 추가 + kma-mountain 시간별 계열 보관 — 되돌릴 수 없는 축적 자료라 UI 결정과 무관하게 먼저.

#### 숲 · `land.forest` — 옮긴다 · P2 · M

| | |
|---|---|
| **Before** | ESA WorldCover 수관비율 PNG(파일 격자 0.005°≈550m, 한·일·대)를 정점색+높이 릴리프 메시 한 장으로 그린다. 다만 화면 격자는 550m 가 아니다 — buildForest 가 정점을 150,000개로 맞추려고 STEP 칸마다 한 화소만 집는다(평균 아님, live-layers.js:2467-2478): 한국 STEP 3≈1.65km, 일본 STEP 9≈5km. 색은 FOREST_RAMP 선형, 범례·지점 클릭 없음. 산림 감소(한국만)는 최대 26만 개 둥근 점(:2329, :2397)이고 카드 안 자체 연도 슬라이더·재생 버튼으로 돈다(:2431-2434, main.js:4687-4710). 소실 PNG 의 R 채널은 '그 해'가 아니라 250m 칸의 '평균 소실 연도'다(forest/loss-index.json encoding). |
| 돈 내는 사람 눈 | 한국 산줄기가 녹색 입체 면으로 솟아 보여 이 묶음에서 드물게 '면'으로 읽히는 그림이고, 산림 감소는 연도를 밀면 자국이 늘어나는 재생이 실제로 된다. 다만 색이 연속 그라데이션이고 눈금이 없어 '여기가 몇 %인지'는 화면만으로 알 수 없다. (B 손보면 된다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. mapped.earth 의 'population 을 terrain relief 로'와 같은 계열의 면 표현이라 릴리프 메시는 살릴 자산이다(PD 정본 09 절 MAPPED.earth 칸). |
| **After** | [자리 없음 · PD 결정 필요] PD 정본 09 Terrain AFTER 는 데이터 모드를 Elevation/Contours/Hillshade/Satellite 넷으로 '단순화'한다고 적는다 — 다섯 번째 칩 추가는 그 문장과 어긋난다. 1안 'Life/Land' 보조 서랍, 2안 Terrain 칩(PD 가 허용할 때만). 화면: 릴리프 메시 유지. ① 색 = 단계색 4단(수관 20~40 · 40~60 · 60~80 · 80~100%)을 정점색 보간이 아니라 셰이더에서 aCover 속성을 끊어 칠한다 — 삼각형 안에서 등급이 바뀌는 자리가 곧 경계선이 되므로 별도 마칭스퀘어 등치선(60·80%)은 만들지 않는다(수관은 산/평지 양봉 분포라 1.65km 격자 등치선은 잔고리 색종이가 된다). ② 한 화소 집기를 STEP×STEP 산술 평균으로 바꾸고 범례에 '화면 격자 한국 약 1.7km 평균 · 일본 약 5km 평균 · 원자료 550m'를 그대로 적는다. ③ 범례 상시: 4칸 + '수관비율 % · ESA WorldCover 2021 스냅샷 · 관측 · 20% 미만은 그리지 않음'. ④ 지도 클릭 한 번 → 원본 PNG 의 그 화소(550m) 값을 Inspector 에: 수관 %, 소실 모드면 '평균 소실 연도 · 사라진 비율', 출처, 기준년(2021 — '지금'이 아님을 Obs time 칸에). ⑤ 지구 위 숫자 라벨은 index.json 에 있는 나라 평균(한국 64.1% 등)과 클릭 지점값만. 국립공원·시도 평균 라벨은 경계 폴리곤이 저장소에 없어(kr-places 는 중심점) 보류. ⑥ 산림 감소: InstancedMesh 26만 quad 는 폐기(인스턴스 행렬만 16MB) — 지금의 Points 를 네모·실제 칸 크기 투영으로 바꾸고 색 3단(2001~2010 적갈 · 2011~2018 주황 · 2019~2023 밝은 노랑), 모바일은 기존 '고르게 솎기'를 6만 점 상한으로(개수만 줄였다고 이미 카드가 밝힌다). ⑦ 연도 재생은 공용 Global Timeline 의 '연 눈금 모드'가 생긴 뒤 그쪽으로 옮기고 그때 loss-year/loss-play 를 지운다 — 그 전에는 세 번째 조작부를 만들지 않고 지금 슬라이더를 둔다. ⑧ 높이 과장 0.00075 는 View > Appearance. 범례 하단에 '모든 수관 소실(벌채·산불·병해충·수확 포함) · 순감소 아님' 유지. |
| 표현 | 폴리곤 면(릴리프 메시) + 셰이더 단계색 / 소실은 네모 점 3단색 |
| 자료 | 단계색·블록 평균·지점값·3단색은 지금 자료로 된다(prototype/v2-three/forest/ PNG 4장 + index 2개, CC BY 4.0 정적). 지점 클릭은 LiveLayers 에 pick 이 없어 공용 부품이 선행(클릭→위경도 사슬은 main.js:2793-2831 에 이미 있다). 일본 PNG 는 3400×3040 이라 화소 배열을 들고 있으면 41MB — 클릭 때 1화소만 읽는다. 전지구·일본/대만 소실·시군구 표는 자료 없음(각각 WorldCover 0.05° 전지구판 1회 생성, Hansen GFC 추가 추출, 시군구 폴리곤 확보가 선행). 갱신 주기가 없어 '지금'은 팔 수 없다. |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/live-layers.js (buildForest :2456-2524 · buildForestLoss :2316-2403 · setLossYear :2406) · D:/## APP/EARTHUS v2_APP/prototype/v2-three/forest/index.json · loss-index.json |
| 무료 / 유료 | 무료: 단계색 릴리프 + 범례 + 클릭 값. EXPLORER: 연도 재생 + 클릭 지점 반경 5km 의 연도별 소실 면적 표(PNG 산술 합, 원수치·출처 먼저) — 시군구별 표는 폴리곤 확보 뒤. PRO: 두 시기 wipe·산불 피해지 겹침은 Compare 작업공간(P1) 뒤. 정적 자료라 유료 동기는 약하다 — 그렇게 적는다. |
| 걸리는 것 | · 자리: PD 정본 좌측 레일에 숲이 없다 → PD 결정(Life/Land 서랍 · Terrain 칩 · v1 이관 중 하나). 결정 전에는 지금 메뉴 자리에서 그림만 고친다.<br>· 공용 부품 3개 의존: 범례(Temperature 기준 구현체) · LiveLayers.pick · Global Timeline 연 눈금 모드 → 앞의 둘이 생기면 S 로 끝나고, 연도 재생 이전만 셸(P0) 뒤로 미룬다.<br>· 정직성: 화면 격자가 550m 가 아니다(1.7km/5km) → 블록 평균으로 바꾸고 범례에 실제 화면 격자를 적는다. 소실 연도는 '평균 소실 연도'로 표기한다.<br>· 성능: 26만 점은 데스크톱 전용 → 모바일 6만 점 상한(기존 솎기 재사용, 개수만 줄임을 고지). 일본 PNG 화소 배열 상주 금지.<br>· 과장 연동: 숲 릴리프 높이는 지형 과장과 무관한 고정값(live-layers.js:2481 H=0.00075, 100% 수관 ≈ 4.8km)이다. 콘셉트 09 그림처럼 지형 과장이 낮아지면(2x) 숲이 산보다 높이 선다 → 인구처럼 과장 배율에 비례시키고(pop-sculpture.js:649 방식) View > Appearance 의 한 조절로 묶는다. |
| **완료 기준** | · 한국을 켜면 숲 릴리프가 4단 색으로 끊겨 보이고, 우하단 범례에 4칸·'ESA WorldCover 2021·관측'·화면 격자 km 가 함께 보인다.<br>· 설악산 부근을 한 번 누르면 Inspector 에 그 지점 수관 %, 기준년 2021, 출처가 뜬다.<br>· 산림 감소를 켜면 소실 자국이 3단 색 네모로 보이고 범례에 '모든 수관 소실 · 순감소 아님'이 있다.<br>· 높이 과장 조절이 숲 카드 안에 없고 View > Appearance 에만 있다. |

#### 철새 · `land.bird_migration` — 합친다 · P3 · M

| | |
|---|---|
| **Before** | 이동 179건을 건마다 3점 꺾은선 THREE.Line 으로 그린다(ext/hobby-migbird.js:84-92). ctx.makeLine 은 LineBasicMaterial.linewidth 를 쓰는데 WebGL 이 무시해 늘 1px 이다(ext-scene.js:140-148). 출발지 8px 점, 도착지 반경 원. 종 색은 7색 배열을 나머지 연산으로 돌려 쓰므로(:18-19) 종이 7을 넘으면 서로 다른 종이 같은 색이 된다. 정지 화면. |
| 돈 내는 사람 눈 | 한국에서 중국·러시아 쪽 원으로 가는 가는 선 다발이 보이고, 종·연도 칩으로 걸러 보는 것과 '선은 실제 경로가 아니다'는 고지는 잘 돼 있다. 다만 1px 꺾은선이라 '새가 날아간다'는 느낌은 없고 정지 화면이다. (B 손보면 된다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. 방향 표시만 mapped.earth·windy 의 '흐르는 선' 문법을 빌린다. |
| **After** | [자리 없음 · PD 결정 필요] 철새·조류 조사·바닷새를 'Life' 보조 서랍의 '새' 메뉴 하나(칩 [철새 이동 \| 육상 조사 \| 바닷새])로 MERGE. 대안: v1 이관 또는 삭제. 화면: 꺾은선 179개 → 대권 호(32분절) 리본 메시 2~5px, 폭 3단 = 같은 출발-도착 쌍의 건수(1 · 2~4 · ≥5, 단순 셈). 호는 도착 원의 '가운데'가 아니라 출발지 쪽 원 테두리에서 끝낸다 — 가운데 점은 places.py 가 손으로 정한 좌표라 그리로 선을 꽂으면 없는 정밀도를 만든다. 호 전체 파선 + 출발→도착 밝은 펄스(route.js 의 uTime 대시 셰이더 재사용, ext 모듈 update 훅으로 구동). 펄스는 방향 표시일 뿐이므로 범례에 '파선 = 실제 경로 아님 · 흐름 = 방향(속도·시기 아님)'. 색: 건수 상위 6종만 고유색, 나머지는 회색 '기타'로 묶고 종을 고르면 그 종만 강조 — 같은 색이 두 종을 가리키는 범례를 없앤다. 도착 원은 옅은 면 + 중앙 숫자 라벨('도착 12건'). 범례 상시: 종 색 칩 + '● 출발(시·군 ±12km) ○ 도착 범위 · 농림축산검역본부 위치추적 요약 · 2021~2025 · 자료 갱신일'. 연도 칩은 Global Timeline 연 눈금 모드가 생기면 그리로, 그 전에는 Inspector 칩으로 둔다(슬라이더 신설 금지). Inspector: 클릭한 호의 종·출발지·도착 범위 반경·원문 날짜 그대로('21.2.10)·추적기 코드·출처. |
| 표현 | 아이콘/마커 + 흐르는 호(리본 메시·파선 펄스) |
| 자료 | 지금 자료로 된다(S3 events/migbird.json — trips 에 종·연도·원문 날짜·추적기 코드·출발/도착, 이용허락 제한 없음; aws/migbird/handler.py:107-114). 중간 경로는 원자료에 없다 — 만들지 않는다. 리본 부품이 없다: prototype/vendor 에는 three-r184 본체·earcut·satellite 뿐이고 Line2/LineMaterial 이 없다 → 공용 리본 메시 헬퍼(M)를 한 번 만들어 거북·항로·등산로가 같이 쓴다. 'EXPLORER 출발 시기 기온·바람 병기'는 2021~2025 출발일의 과거 관측을 돌려주는 산출물을 저장소에서 확인하지 못해(UNKNOWN) 뺀다 — 있다면 그때 다시 연다. |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/ext/hobby-migbird.js · D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/ext-scene.js (update 훅 :336-345) · D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/route.js (대시 셰이더 :116-120, tick :297-300) |
| 무료 / 유료 | 무료: 전부(기관 관측 요약). EXPLORER·PRO: 없음 — 179건 정적 자료로는 리포트·비교·시뮬 재료가 없다. 유료 가치는 없다고 적는다. |
| 걸리는 것 | · 자리 없음 → PD 결정(Life > 새 / v1 / 삭제).<br>· 리본 메시 헬퍼 부재(vendor 에 Line2 없음) → 공용 부품으로 1회 제작, 이 항목은 그 뒤 S.<br>· 정직성: 흐르는 펄스가 '이 길로 이 속도로 날았다'로 읽힐 위험 → 전 구간 파선 + 범례 문구 + 호를 도착 원 테두리에서 끊기.<br>· 종 색 중복(7색/나머지 연산) → 상위 6종 + 기타 회색. |
| **완료 기준** | · 철새를 켜면 1px 실선이 아니라 굵기가 3단으로 다른 파선 호가 출발지에서 도착 원 테두리까지 흐른다.<br>· 범례에서 서로 다른 두 종이 같은 색으로 나오지 않는다(상위 6종 + 기타).<br>· 범례에 '파선 = 실제 경로 아님'과 출처·기간이 상시 보인다.<br>· 호를 누르면 Inspector 에 종·출발지·도착 범위·원문 날짜·출처가 뜬다. |

#### 조류 조사 기록 · `land.bird_survey` — 합친다 · P3 · S

| | |
|---|---|
| **Before** | 0.05°(약 5km) 칸 4,521개를 단일 청록 점 3크기(2.4/3.2/4.5px)로 찍는다(ext/hobby-ecobird.js:25-29, :45-59). 파일의 칸에는 lat·lon·n(기록 수)·spc(종 수) 넷뿐이다 — 수집기가 칸별 연도(yrs)를 모으고도 내보내지 않고(aws/ecobird/handler.py:173, :218, :230-234), 칸×종 표와 칸별 조사 종류도 없다. 종 목록은 전국 상위 60종 합계뿐(:237). 15분 Lambda 예산(720초) 때문에 못 받은 건수 truncated 가 0 이 아닐 수 있다(:184-188, :252). |
| 돈 내는 사람 눈 | 남한 위에 같은 색 작은 점이 구름처럼 깔린다. 점 크기 차이가 2.4~4.5px 뿐이라 어디가 기록이 많은지 눈으로 거의 구분되지 않는다. (C 빈약하다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. |
| **After** | [자리 없음 · PD 결정 필요] 'Life > 새' 의 '육상 조사' 칩으로 MERGE. 권리 확인 전에는 FREE 고정. 화면: 단색 점 구름 → 0.05° 칸을 한 BufferGeometry 에 합친 칸 면 4,521개(삼각형 약 9천), 기록 수 로그 5단 단계색(경계는 실제 분포를 보고 확정). 5km 평면 칸은 지형 과장 50× 에서 산에 묻히므로 네 귀퉁이 지표 높이의 최댓값 + 여유로 띄운다. 상위 10칸 숫자 라벨('4,210건 · 87종'). 모드 칩 [기록 수 \| 종 수] — 둘 다 파일에 있다. 종 필터·'어느 조사'·조사 연도는 지금 파일로는 불가능하므로 화면에서 뺀다(UNKNOWN 이 아니라 '없음'으로 확정). 범례 상시: 5칸 + '색 = 조사 기록이 쌓인 양(새가 많은 곳 아님) · 빈 칸 = 위치 있는 조사 기록 없음 · 국립생태원 에코뱅크 · 집계일' + truncated>0 이면 '미수신 ○건 — 칸 색이 실제보다 옅을 수 있음'을 범례에 올린다(지금은 카드 작은 글씨에만 있다). Inspector: 칸 클릭(기존 pick 재사용) → 기록 수·종 수·위치 없음/좌표 이상/미수신 건수·출처·권리 고지. |
| 표현 | 폴리곤 면(5km 칸) 단계색 |
| 자료 | 칸 면·단계색·범례·두 모드는 지금 자료로 된다(S3 events/ecobird.json). 종 필터·조사 종류·연도는 aws/ecobird 재집계가 선행(칸별 상위 5종·조사별 건수·연도 범위를 cells 에 추가 — 전체 칸×종 행렬은 파일이 너무 커진다). 권리: 공공누리 1유형이나 API 가 '제3자 권리 포함' — 수집기·화면이 이미 '유료 가공물은 서면 확인 뒤'로 잠가 둠(handler.py:243-248, hobby-ecobird.js:99-102). |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/ext/hobby-ecobird.js (pick :110-128 그대로) · D:/## APP/EARTHUS v2_APP/aws/ecobird/handler.py |
| 무료 / 유료 | 권리 확인 전: 유료 없음(FREE 고정). 확인 + 재집계 뒤에만 EXPLORER 후보(칸별 종 목록 리포트). |
| 걸리는 것 | · 자리 없음 → PD 결정.<br>· 권리(제3자 권리 포함) → 국립생태원 서면 확인 전에는 유료 화면의 가치로 세우지 않는다.<br>· 자료: 종·조사·연도 칸별 값이 파일에 없다 → 화면 범위에서 빼고, 필요하면 aws/ecobird 재집계(S)를 별도 작업으로.<br>· 정직성: truncated 가 0 이 아니면 칸 색이 과소 → 범례에 미수신 건수 상시 표기. |
| **완료 기준** | · 조류 조사를 켜면 점이 아니라 5km 칸 면이 5단 색으로 칠해지고 범례 5칸이 보인다.<br>· 범례에 '색 = 조사 기록이 쌓인 양(새가 많은 곳 아님)'이 상시 보인다.<br>· [기록 수 \| 종 수] 칩을 바꾸면 같은 칸이 다른 5단 색으로 다시 칠해지고 범례 단위가 같이 바뀐다.<br>· 칸을 누르면 기록 수·종 수·출처가 Inspector 에 뜬다. |

#### 바다거북 · `ocean.sea_turtle` — 옮긴다 · P3 · S

| | |
|---|---|
| **Before** | 거북 45마리의 발신기 추적점 28,770개를 보간·솎기 없이 이은 1px 선 45개와 마지막 수신점 이모지 스프라이트를 종 3색으로 그리고 한 마리 선택 시 강조한다(ext/hobby-turtle.js:55-76). 자료는 공공누리 제4유형(출처표시·상업적 이용금지·변경금지)이고 수집기는 점을 골라 버리는 것도 '변경'으로 본다(aws/sea-turtle/handler.py:8-13, :60, :238). |
| 돈 내는 사람 눈 | 제주·남해에서 동중국해·일본까지 이어지는 실제 추적 경로 45개가 종별 색으로 보이고, 한 마리를 고르면 그 길만 밝아져 볼 만하다. 다만 이 자료는 상업 이용 금지라 '돈 내는 이유'가 될 수 없다. (B 손보면 된다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. |
| **After** | [자리 없음 · PD·법무 결정 필요] 새 투자 없이 동결하고 결정만 받는다. v1(무료)로 옮겨도 위험은 그대로다 — v1 은 유료 v2 로 이끄는 입구라 '상업적 이용' 해당 여부가 똑같이 걸린다. 선택지: ① 국립해양생물자원관에 이용 범위 서면 문의 → 허락되면 무료 'Life' 서랍에 유지 ② 답이 없거나 불가면 REMOVE. 허락된 경우의 화면(그때만): 원자료 점을 그대로 잇는 원칙 유지, 45개 선을 한 LineSegments 로 묶되(드로우콜 45→1, 자료 변경 아님) 점은 하나도 솎지 않는다. 기본은 마지막 수신점 마커 + 개체 번호가 주인공, 선은 0.25 로 옅게, 한 마리를 고르면 그 경로만 0.95 + 시작 ○/끝 ● + 자료의 first/last 날짜 라벨. 굵은 리본은 공용 리본 헬퍼가 생긴 뒤에만(이 항목 때문에 만들지 않는다). 범례 상시: 종 3색 + '추적이 끝난 개체만 공개 · 실시간 아님 · 국립해양생물자원관 · 공공누리 제4유형 · 수집 시각'. 시간 재생·평활·분석 문장 없음, Global Timeline 에 묶지 않음. 05 Ocean 수온과 동시 표시하면 Inspector 에 '경로는 과거(추적 종료) · 수온은 지금 — 같은 시각이 아닙니다' 배지를 띄운다. |
| 표현 | 아이콘/마커 + 경로선(원자료 그대로) |
| 자료 | 지금 자료로 된다(S3 events/sea-turtle.json 45마리·28,770점, 1일 수집). 천장은 라이선스: 제4유형은 유료 서비스 안의 무료 화면에도 걸릴 수 있다 — 기관 서면 확인이 유일한 해법. |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/ext/hobby-turtle.js · D:/## APP/EARTHUS v2_APP/aws/sea-turtle/handler.py |
| 무료 / 유료 | 무료: 전부. 유료: 없음(라이선스상 불가). 리포트·알림·분석 어느 것도 이 자료 위에 세우지 않는다. |
| 걸리는 것 | · 라이선스: 공공누리 제4유형(상업 이용·변경 금지) — v1 이관으로는 풀리지 않는다 → 기관 서면 문의, 불가 시 REMOVE. 결정 전 신규 개발 금지.<br>· 성능: 변경금지 때문에 모바일에서도 28,770점을 솎지 못한다 → 선 45개를 한 객체로 묶는 것만 허용(정점 수는 그대로, 부담은 작다).<br>· 정직성: 과거 경로와 현재 수온을 겹치면 '이 수온의 바다를 지났다'로 읽힌다 → 시각 불일치 배지. |
| **완료 기준** | · 범례에 '공공누리 제4유형 · 추적 종료 개체 · 실시간 아님'이 상시 보인다.<br>· 한 마리를 고르면 그 경로만 진해지고 시작·끝 날짜 라벨 두 개가 보인다.<br>· 거북 화면 어디에도 유료 잠금·리포트 버튼·분석 문장이 없다. |

#### 바닷새 · `ocean.seabird` — 합친다 · P3 · S

| | |
|---|---|
| **Before** | 조사정점 37곳을 단일 청록 점 3크기(7/12/20px)로만 찍는다(ext/hobby-seabird.js:27-31, :65-79). 파일에는 정점별·종별로 해마다 [연도, 조사 횟수, 센 개체수]가 이미 있다(aws/seabird/handler.py:261, :270, :284). 수집기 스스로 '해마다 조사 횟수가 2.7배까지 달라 개체수만 견주면 새가 줄었다로 잘못 읽힌다 — 조사 1회당으로 견줘라'고 적어 두었다(:205-208, :292-296). 개체수 빈 줄은 0 으로 세지 않는다(:195-196). |
| 돈 내는 사람 눈 | 한반도 연안에 청록 점 37개가 크기 세 가지로 찍힌 것이 전부라 지구 위 그림은 빈약하다. 카드의 9년 변화와 멸종위기 종 목록은 읽을 만하다. (C 빈약하다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. 표현은 windy 의 '지점마다 값 숫자'를 빌린다. |
| **After** | [자리 없음 · PD 결정 필요] 'Life > 새' 의 '바닷새' 칩으로 MERGE(지구 위 정보량이 정점 37개라 단독 메뉴 가치 없음). 화면: 단색 점 → 정점마다 숫자 든 원판 마커(크기 고정, 값은 색+숫자로만). 전체 보기: 색 = 누적 센 개체수 5단(경계는 실제 분포로 확정), 라벨 'EB-07 · 3,412 · 조사 58회'. 연도를 고르면 색 = 조사 1회당 개체수(yc/yn) 5단으로 바뀌고 라벨에 그 해 조사 횟수를 같이 적는다 — 원안의 '그 해 개체수로 다시 칠한다'는 수집기 경고를 어긴다. 그 해 조사가 없는 정점은 빈 고리. 종을 고르면 species[].at 로 그 종이 기록된 정점만 남기고 원판을 점선 테두리로 바꿔 '색·숫자는 정점 전체 합(정점×종 개체수 자료 없음)'을 범례에 띄운다. 멸종위기 고리(I급 붉은/II급 주황)는 유지하되 Inspector 에 '자료에 등급이 적힌 줄 ○/○ — EARTHUS 채택 규칙(2줄·5% 이상)'을 밝힌다. 범례 상시: 5단 + 단위(마리 또는 마리/조사 1회) + '센 개체수(개체수 미기재 줄 제외) · 정점 없는 바다 = 조사하지 않음 · 국가해양생태계종합조사 · 갱신일'. 연도 조작은 Global Timeline 연 눈금 모드가 생기면 그리로, 그 전에는 Inspector 의 연도 칩(슬라이더 신설 금지). Inspector: 정점 클릭(기존 pick) → 연도별 [조사 횟수 · 개체수 · 1회당] 표와 작은 차트, 종 목록, 출처. |
| 표현 | 아이콘/마커(숫자 원판) 단계색 |
| 자료 | 지금 자료로 된다(S3 events/seabird.json, 이용허락 제한 없음). 정점×종×연도 개체수는 파일에 없다 — 필요하면 aws/seabird 재집계. 정점 37곳이라 그림의 밀도는 구조적으로 낮다. |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/ext/hobby-seabird.js (pick :173~) · D:/## APP/EARTHUS v2_APP/aws/seabird/handler.py |
| 무료 / 유료 | 무료: 마커·범례·연도 전환. EXPLORER: 정점별 9년 '조사 1회당' 변화 + 멸종위기종 기록 요약 리포트(원수치·조사 횟수 먼저). PRO: 없음. |
| 걸리는 것 | · 자리 없음 → PD 결정.<br>· 정직성: 연도별 원 개체수 비교는 조사 노력 차이를 새의 증감으로 읽게 만든다 → 연도 모드는 조사 1회당 값 + 조사 횟수 병기.<br>· Global Timeline 연 눈금 모드 부재 → 그 전에는 Inspector 연도 칩으로. |
| **완료 기준** | · 바닷새를 켜면 정점 37곳이 크기 같은 숫자 원판으로 보이고 색이 5단으로 끊긴다.<br>· 연도를 고르면 범례 단위가 '마리/조사 1회'로 바뀌고 라벨에 그 해 조사 횟수가 같이 보인다.<br>· 종을 고르면 그 종이 기록된 정점만 남고 범례에 '색·숫자는 정점 전체 합'이 뜬다.<br>· 범례에 '정점 없는 바다 = 조사하지 않음'과 출처·갱신일이 상시 보인다. |

#### 인구 · `people.population` — 다시 만든다 · P2 · L

| | |
|---|---|
| **Before** | 메뉴를 눌러도 나라를 고르기 전에는 빈 화면이고, 고르면 WorldPop 셀마다 1px 수직 선분(LineSegments, opacity 0.5)이 나라별 분위 로그 10등급 높이로 선다(pop-sculpture.js:441, :526-551, :700-725). 국가 총계는 1국 1선(live-layers.js:990-1050), 도시 500m 는 InstancedMesh 상자(:2586-2633)로 문법·색이 제각각이다. 격자는 u8 세제곱근 양자화(v = max·(u8/255)³)이고 '1km'라 부르지만 한국 0.0167°(약 1.9×1.5km), 일본 0.058°, 미국 0.275° 다. 밀도(명/㎢) 환산은 격자 중앙 위도 한 값으로만 한다(:565-567). 대만 국가 격자는 없다(popgrid 21개국에 TWN 없음, 타이베이 도시 격자만). |
| 돈 내는 사람 눈 | 나라를 고르면 국경 안쪽에서 장미색 기둥 숲이 솟고 캡션에 색 눈금과 밀집 상위 5곳이 붙어, 이 묶음에서 가장 '포스터'처럼 완성돼 보인다. 다만 메뉴를 처음 누른 순간에는 지구에 아무 변화가 없고, 기둥이 1px 선이라 가까이 가면 털처럼 성기게 보일 수 있다. (B 손보면 된다) |
| 기준 사이트 | mapped.earth LAND > Population — 밀도만큼 땅이 솟는 릴리프 면. 단, PD 정본 09 절에서 이것은 'MAPPED.earth' 칸의 서술이고 'EARTHUS AFTER' 칸은 Terrain 데이터 모드를 Elevation/Contours/Hillshade/Satellite 넷으로 '단순화'한다고 적는다 — 인구의 자리를 PD 정본이 정해 준 것은 아니다. 09 콘셉트 그림에도 인구 릴리프는 없다. |
| **After** | [자리 없음 · PD 결정 필요] 1안 Terrain 의 다섯 번째 칩 'Population'(정본의 '단순화' 문장과 어긋나므로 PD 승인 필요), 2안 'Life/People' 보조 서랍. 어느 쪽이든 그림은 같다. 1단계(M, 한국): 1px 기둥 숲 폐기 → 격자 정점을 밀도만큼 들어 올린 릴리프 면(숲 메시와 같은 기술). 면은 '네 귀퉁이 중 하나라도 값이 있으면' 만들고 값 0 귀퉁이는 지표 높이에 둔다 — 숲 소실에서 겪은 '네 귀퉁이 모두' 규칙은 흩어진 농촌 칸을 통째로 지운다(live-layers.js:2325-2327 교훈). 색은 셰이더에서 등급을 끊는 단계색, 단위 명/㎢(행마다 cos(위도)로 칸 면적을 나눈 산술 — 중앙 위도 한 값은 일본 격자에서 북단 −15% · 남단 +11%, 한국에서 ±3.5% 틀린다), 절대 8단(<100 · 100~500 · 500~1,000 · 1,000~2,500 · 2,500~5,000 · 5,000~10,000 · 10,000~20,000 · ≥20,000). <100 은 거의 투명하게 — 09-08 PD 지적('전국토가 다 많아 보인다')을 절대 등급에서도 지킨다. 마칭스퀘어 등치선은 만들지 않는다: 인구는 기온과 달리 뾰족한 장이라 1,000·5,000 등치선은 읍마다 잔고리가 된다 — 셰이더의 등급 경계가 선 역할을 한다. 지구 위 숫자 라벨은 기존 봉우리 상위 5곳('1위 서울 ○○ · 약 ○천 명/㎢') 유지. 범례 상시: 8칸 + 단위 + 'WorldPop R2025A · 2025 추정(모델) · 화면 격자 약 1.9×1.5km'. 첫 클릭 = 한국 자동 선택(빈 화면 제거). 지도 클릭 한 번 → Inspector 에 그 칸의 밀도('약' + 8비트 양자화 오차 고지)·칸 크기·출처·기준년. 높이 과장은 View > Appearance. 2단계(M): 고도 >2,000km 에서 국가 총계를 막대 대신 국가 폴리곤 단계색 면 + 숫자 라벨로, <300km 서울·도쿄·타이베이·런던은 500m 릴리프로 — 같은 범례 틀. people/pop·people/poptower 흡수. 3단계(S, 자료): 일본 0.02° 재집계, 대만 국가 격자 추가, u16 재인코딩. 미국은 손대지 않는다(PD 지시). |
| 표현 | 폴리곤 면(릴리프 메시) + 셰이더 단계색 |
| 자료 | 1단계는 지금 자료로 된다(prototype/v2-three/popgrid/kor.json 380×330=125,400 정점, CC BY 4.0). 2단계 국가 폴리곤은 있다 — data/country-reference.json(Natural Earth, public domain, 177개국·정점 22,316, 전지구 1:110m / 한·북·일 1:10m, live-layers.js:482 에서 이미 읽음). 다만 구면 폴리곤 채우기는 v2 에 없다: earcut 이 prototype/vendor 에 있으나 v2-three/js 어디서도 쓰지 않는다 → 러시아·캐나다처럼 큰 면은 세분 없이는 지구를 뚫는다(신규 작업). World Bank API 브라우저 직호출(live-layers.js:974)은 S3 캐시로. 대만 1km 격자·일본 세밀판은 tools 재생성 필요. 모두 Open-Meteo 와 무관. |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/pop-sculpture.js (findPeaks·labelPool :420-435 · makeBreaks :526-551) · D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/live-layers.js (숲 릴리프 메시 :2456-2524) · D:/## APP/EARTHUS v2_APP/prototype/v2-three/data/country-reference.json · D:/## APP/EARTHUS v2_APP/prototype/vendor/earcut.module.js |
| 무료 / 유료 | 무료: 한국 릴리프 + 범례 + 클릭 밀도. EXPLORER: 재해 노출 — 태풍 강풍 반경·침수 폴리곤(khoaflood)·진도 영역 '안의 인구 합'(산술 합·출처·시각, 인과 아님)을 06 Hazards Inspector 에서 — Hazards Inspector(P1)가 먼저 있어야 한다. PRO: Simulation 결과의 '영향 인구' delta, 도시 500m 디테일(한·일·대·영), export. |
| 걸리는 것 | · 자리: PD 정본 09 AFTER 에도 09 콘셉트 그림에도 Population 이 없다 → PD 결정. 승인되면 1단계(한국 릴리프)만 P1 로 당길 수 있다 — PD 가 가장 싫어하는 '막대기'가 가장 많이 선 화면이기 때문.<br>· 이전 PD 지시와 충돌: 분위 로그 10등급·밀집 언덕 규칙은 PD 지시로 들어간 것(pop-sculpture.js:524-525, :574) → 절대 8단으로 바꾸려면 PD 확인.<br>· 정직성: u8 세제곱근 양자화로 클릭값은 근사(밀도 1,000명/㎢ 부근에서 한 눈금 약 4%) → Inspector 에 '약' + 고지, 근본 해법은 u16 재인코딩. WorldPop 은 모델 추정 → 배지 MODEL, 서울시 관측과 같은 배지로 합치지 않는다.<br>· 성능: 독일 25.7만·미국 24.8만 정점 → 모바일은 2칸 블록 합(합산은 산술)으로 정점 1/4, 범례에 화면 격자 표기.<br>· 2단계 국가 면: 구면 폴리곤 채우기 미구현 → earcut + 변 세분 헬퍼를 새로 짠다(M). |
| **완료 기준** | · 인구를 누르면 나라를 고르지 않아도 한국 릴리프 면이 바로 솟고, 1px 세로선이 한 개도 없다.<br>· 수도권·부산·대구가 서로 다른 단계색으로 끊겨 보이고 범례 8칸에 '명/㎢ · WorldPop 2025 추정(모델) · 화면 격자 km'가 있다.<br>· 서울 한복판을 한 번 누르면 Inspector 에 '약 ○○명/㎢'·칸 크기·출처·기준년이 뜬다.<br>· 인구 카드 안에 높이 과장 조절이 없다. |

#### 실시간 혼잡 · `people.crowding` — 합친다 · P2 · M

| | |
|---|---|
| **Before** | 서울 121곳에 InstancedMesh 수직 상자(높이 = 인구 범위 가운데값의 제곱근, 색 = 서울시 공식 4단계)를 세우고, 이미 있는 공용 시간 스크럽(main.js:3053 timeOffsetMs → :4897 liveLayers.setTimeOffset)으로 공식 예측 12스텝을 민다(live-layers.js:786-875). 예측 구간은 색을 0.55 로 누르기만 한다(:866) — 같은 파일 머리말은 '막대를 비우고 테두리만'이라고 적었지만(:782-783) 구현은 다르다. 상자 클릭·범례 없음. 머리말은 지시서 R-01 을 인용해 '수직 막대 보존 · 평면 heatmap 대체 금지'라고 못박는다(:776-778). |
| 돈 내는 사람 눈 | 서울 위에 색 상자 121개가 솟고, 시간 막대를 밀면 서울시 공식 예측으로 막대가 실제로 바뀌는 것은 이 묶음에서 유일하게 '시간이 살아 있는' 화면이다. 그러나 막대를 눌러도 어느 장소인지 알 수 없고 색 4단계의 눈금이 화면에 없다. (B 손보면 된다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. windy 의 '지점마다 값 숫자' + 상시 타임라인 문법. |
| **After** | [자리 없음 · PD 결정 필요] 인구가 Terrain/People 어디로 가든 그 서울 확대 단계의 'Live' 칩으로 MERGE(대안: Travel 공간의 '지금 붐빔'). 이 묶음에서 유일하게 시간이 살아 있는 레이어이고 공용 시간축에 이미 묶여 있다 — 새 조작부를 만들지 않는다. 화면: 수직 상자 121개 → 장소마다 지표 밀착 원판(크기 고정) + 서울시 공식 4단계 색 그대로 + 기관이 준 인구 범위 라벨('강남역 5.2만~5.4만'). 상위 12곳은 상시, 나머지는 확대 시(라벨 폭주 금지 — newsbubble 머리말의 2,843개 사고). 예측 구간은 빗금 대신 속 빈 고리(이 파일이 원래 정해 둔 문법) + 'FORECAST · 서울시' 배지, 예측 지평 밖은 감춘다. sqrt 높이 변환 삭제. 범례 상시: 4단계 색 견본 + 자료 시각, STALE 이면 범례를 회색으로 + '○시간 전 자료'. WorldPop(모델·거주)과 서울시(관측+공식 예측)는 배지로 구분. Inspector: 원판 클릭 한 번 → 장소명·현재 범위·단계·12스텝 예측 표·출처·시각. livemix 배율은 '참고'로만 — 장소 면적과 3×3 격자(약 24㎢) 거주 인구라는 서로 다른 넓이를 나눈 값이라(pop-sculpture.js:296-330) 색·라벨에는 쓰지 않는다. |
| 표현 | 아이콘/마커(단계색 원판 + 범위 라벨, 예측은 빈 고리) |
| 자료 | 지금 자료로 된다(https://earthus.net/tourism/seoul-flow.json 121곳, 관측+공식 예측 구분). 이력은 UNKNOWN 이 아니다 — aws/tourism-flow 가 장소별 48시간 이력(history-index.json, 장소당 576행)과 실행마다 불변 스냅샷(app/tourism/history/YYYY/MM/DD/)을 쌓는다(handler.py:6-7, :262-282, :381). '지난주 같은 시각 대비'는 새 저장이 아니라 스냅샷에서 한 값을 꺼내 seoul-flow.json 에 싣는 소규모 집계(S). 일정은 schedules.sh:64 기준 rate(5 minutes) — 조사 때 STALE 은 스케줄 공백보다 서울시 API·키 쪽일 가능성이 크나 배포된 EventBridge 값은 UNKNOWN(확인 필요). 서울 밖은 자료 없음. |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/live-layers.js (_seoulApply :825-875 시간 선택 로직 그대로) · D:/## APP/EARTHUS v2_APP/aws/tourism-flow/handler.py (update_history :262-282) |
| 무료 / 유료 | 무료: 지금 단계색 원판 + 클릭 값(기관 발표는 무료). EXPLORER: 예측 타임라인 전체 + 지난주 같은 시각 대비(스냅샷 집계 뒤) + '붐빔' 진입 알림. PRO: 없음. |
| 걸리는 것 | · 지시서 충돌: R-01 은 수직 막대 보존·평면 대체 금지(live-layers.js:776-778), PD 는 막대를 싫어한다 → PD 가 어느 쪽인지 정해야 착수. 원판은 heatmap 이 아니라 지점 마커라는 점을 함께 제시.<br>· LiveLayers.pick 부재 → 공용 부품 선행(클릭 사슬은 main.js:2793-2831 에 있다).<br>· SLA: 조사 시점 STALE → 유료 알림을 팔기 전에 EventBridge 실제 주기·서울시 키 3개 상태를 health.json 으로 확인.<br>· 자리 없음 → PD 결정. |
| **완료 기준** | · 혼잡을 켜면 서울에 세로 상자가 하나도 없고 4단계 색 원판과 '5.2만~5.4만' 같은 범위 라벨이 보인다.<br>· 하단 공용 시간축을 +3시간으로 밀면 원판이 속 빈 고리로 바뀌고 'FORECAST · 서울시' 배지가 뜨며, 새 슬라이더는 생기지 않는다.<br>· 원판을 한 번 누르면 Inspector 에 현재 범위·단계·12스텝 예측·출처·시각이 뜬다.<br>· 자료가 STALE 이면 범례가 회색으로 바뀌고 '○시간 전 자료'가 보인다. |

#### 밤의 불빛 · `people.night_lights` — 옮긴다 · P2 · M

| | |
|---|---|
| **Before** | NASA Black Marble GIBS 타일 50장(레벨 3)을 5120×2560 캔버스(약 7.8km/px)로 붙여 지구 바탕 텍스처를 통째로 교체한다(main.js:5801-5835). 앱 시작 때 밤면 발광용으로 같은 50장을 이미 한 번 받는데(:6398-6417) 메뉴로 켜면 또 받는다(:5838-5864). 시작 경로에는 2016·2012 합성본 폴백이 있으나 메뉴 경로에는 없다(실패 시 '기존 베이스 유지', :5861) — 레지스트리 설명과 다르다. 값·범례·날짜 선택 없음. |
| 돈 내는 사람 눈 | 전지구로 물러서 보면 검은 지구에 도시 불빛이 뜨는 익숙한 Black Marble 그림이라 첫인상은 괜찮다. 확대하면 7.8km 화소라 서울이 몇 픽셀 얼룩이 되고, 한번 켜면 같은 메뉴로 끌 수 없다. (C 빈약하다) |
| 기준 사이트 | 기준 사이트에 없음. PD 정본 09 Terrain AFTER: 'Satellite 는 imagery source picker 로 분리' — 이 항목은 PD 정본 본문에 자리가 있다(09 콘셉트 그림에는 picker 가 그려져 있지 않다). |
| **After** | [→ 09 Terrain > Satellite imagery source picker] 값 없는 바탕 교체이므로 규칙 3(Data/View 분리)상 View 성격 — 자료 메뉴 줄에서 빼고 picker(라디오: Natural Earth / Blue Marble / Black Marble 밤)로 옮긴다. 라디오라 '끌 수 없음'이 저절로 풀린다. 1a(S): picker 이동 + 시작 때 받은 텍스처를 baseCache.night 로 재사용(50장 재다운로드 제거) — 단 그 텍스처가 일별인지 2016/2012 합성본인지 날짜·이름표를 함께 넘겨 합성본이 '이틀 전 관측'으로 표기되는 일을 막는다 + 메뉴 경로에도 같은 폴백 + Inspector 'Obs time' 에 요청 날짜(약 54시간 지연)·타일 성공 수 상시. 1b(M): 확대 시 고해상 — 지금의 위성 표면 스트리밍은 Esri 주소가 WebMercator z/y/x 로 박혀 있다(main.js:949, :1101, local-terrain.js:8). GIBS 의 EPSG:3857 끝점에 VNP46A2 층이 Level8(약 600m/px)로 있는지 먼저 확인하고, 있으면 주소만 매개변수화해 재사용. 천장은 500m — 고도 300km 아래에서는 화소가 보인다고 범례에 적는다. 2단계(별도 '자료 확보' 작업, L): 복사휘도 nW/cm²/sr 단계색 6단 + 범례 + 클릭 지점값 + Global Timeline 날짜 축 + 두 날짜 diff — GIBS 타일은 색 입힌 그림이라 값이 없으므로 LAADS VNP46A2 HDF5 수집·타일링 Lambda 가 선행한다. |
| 표현 | 고해상 색면(타일) — 2단계에서만 단계색 |
| 자료 | 1a·1b 는 지금 자료로 된다(NASA GIBS WMTS — 저장소 조사 기록 docs/research-2026-07.md:861: NASA 산출물은 출처표기 + 'NASA 보증 암시 금지' 조건으로 상업 이용 가능, 비NASA 파트너 층은 제공기관 조건을 따름; VNP46A2 는 NASA 산출물). 2단계는 안 된다: aws/ 에 VNP46A2 수집기가 없다. 전지구 일별(10° 타일 수백 장, HDF5)은 Lambda 비용·용량이 크므로 한·일·대 타일 6~8장으로 한정해야 L 에 머문다(전지구면 XL). Earthdata 토큰·h5py 레이어·구름/달빛 품질 플래그 동봉 필요. 날짜 축은 Global Timeline 날짜 모드(P0 셸) 의존. |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/main.js (BASE_STYLES·NIGHT_FALLBACK :5782-5792 · loadGibsBase :5801-5835 · setBaseStyle :5838-5864 · uNightMap :6398-6417) |
| 무료 / 유료 | 무료: 밤 지구 바탕(1a·1b). EXPLORER(2단계 뒤): 날짜 선택 + 재해 전후 불빛 비교 리포트('함께 나타난 변화', 구름 가림·달빛 고지, 인과 단정 금지). PRO: diff export. 2단계 없이는 유료 가치 없음 — 그렇게 적는다. |
| 걸리는 것 | · View > Appearance·imagery picker 자체가 Global Shell(P0) 산출물 → 1a 의 재사용·폴백·Obs time 은 지금 자리에서 먼저 하고, 이동은 셸 뒤.<br>· 1b: GIBS EPSG:3857 에 이 층이 있는지 UNKNOWN → 타일 주소 1건 실측 후 착수. 없으면 EPSG:4326 상위 레벨을 패치 캔버스에 직접 붙이는 별도 경로(M 그대로).<br>· 텍스처 공유 함정: 시작 경로가 합성본으로 떨어졌을 때 그것을 '일별'로 캐시하면 거짓 표기 → {tex, date, label} 을 묶어 캐시.<br>· 2단계는 수집기 부재 → '자료 확보(L)'로 분리, 이 항목의 크기에 넣지 않는다. |
| **완료 기준** | · 자료 메뉴 줄에 '밤의 불빛'이 없고 Satellite imagery picker 에서 라디오로 고르고 되돌릴 수 있다.<br>· 밤 바탕을 켜도 네트워크에 GIBS 타일 50장이 다시 요청되지 않는다.<br>· Inspector 의 Obs time 에 촬영 날짜가 보이고, 합성본으로 내려갔을 때는 '2016 합성본 — 현재 불빛 아님'이 보인다.<br>· 어디에도 nW 값·단계 범례가 없다(2단계 전에는 값을 말하지 않는다). |

#### 지역 뉴스 · `people.news` — 옮긴다 · P2 · M

| | |
|---|---|
| **Before** | 지역 대표점 5곳(동남아·오세아니아·중동·아프리카·남미)에 1px 분홍 수직선(높이 = 기사 수)과 점 하나씩만 서고 헤드라인은 카드에만 있으며(46자 절단) 클릭이 안 된다(live-layers.js:919-967). v2 LiveLayers 는 GDELT 확정 사건(events/global.json)을 읽지 않는다 — 뉴스는 regional-news.json 하나뿐(:477). |
| 돈 내는 사람 눈 | 지구 위에 분홍 막대기 5개가 서 있을 뿐이라 '뉴스가 지도에 있다'는 느낌이 없다. 읽을 거리는 옆 카드의 링크 목록이 전부다. (C 빈약하다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. 기준은 PD 09-07 지시: '지구 위 네모칸 유지 · 더 다양·디테일하게 · 오류부터 고치고 나머지는 기획부터(바로 만들지 말 것)'. |
| **After** | [자리 없음 · PD 결정 필요] 좌측 레일 밖으로 MOVE — TOP 바 진입 또는 이벤트룸 + 06 Hazards Inspector 의 '관련 보도'. 0단계(S, 오류 고치기 — 바로 가능): 분홍 막대 5개·점 5개 삭제, 지역 묶음은 지도 위 DOM 칩('동남아 24건 ▸') → 누르면 Inspector 목록(제목 전문 · 매체 · ○시간 전 · 원문 링크). 1단계(M, PD 지시대로 기획 승인 뒤): v1 네모칸(prototype/js/newsbubble.js — canvas 말풍선, 테두리 색 = 성격)을 THREE.Sprite 로 이식. 머리말 두 규칙을 그대로 지킨다: ① 개수 상한(데스크톱 12 · 모바일 6 — 하나가 텍스처 한 장) ② 미확정 사건에는 절대 달지 않는다. 좌표 있는 GDELT 확정 사건은 그 자리에 네모칸(제목 1줄 · 매체 · ○시간 전), 좌표 없는 지역 RSS 는 묶음 칩 그대로. 매체 확장은 한국 먼저지만 민영 언론 RSS 는 약관에 비상업·재배포 금지가 흔하므로 공공 피드(정책브리핑 korea.kr·기상청·행안부 보도자료 등 — 각 피드의 공공누리 유형은 추가 전 확인)부터, 민영은 매체별 약관 확인 뒤. Inspector 순서: 제목·매체·시각·링크 먼저, 그 아래에만 브리핑 문장(news-brief 가 살아난 뒤, 사실 항목마다 출처, 인과·확률 금지). 본문·요약·사진 없음. 범례: 테두리 색 분류 + '확정만 표시 · 자료 시각'. |
| 표현 | DOM 칩/카드 + 아이콘/마커(canvas 네모칸 Sprite, 상한 있음) |
| 자료 | 0단계는 지금 자료로 된다. 1단계: events/global.json(15분, GDELT — 'Unlimited and unrestricted use; cite and link' 로 수집기에 기록됨, aws/gdelt-events/handler.py:558-559) 로더와 v1 의 '확정' 판정 로직을 v2 로 옮겨야 한다(지금 v2 에 없음). newsbubble.js 의 Cesium 의존은 두 곳(:7 주석, :110 Color)뿐. aws/news-brief → events/briefs.json 은 403(산출물 없음, 09-07 실측) — 배포·ANTHROPIC_API_KEY 선행. 매체 추가는 aws/regional-news FEEDS 확장(제목·링크·시각·매체만). |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/js/newsbubble.js · D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/event-room.js · D:/## APP/EARTHUS v2_APP/aws/regional-news/handler.py (FEEDS :44-62) · D:/## APP/EARTHUS v2_APP/aws/news-brief/handler.py |
| 무료 / 유료 | 무료: 네모칸·칩 + 원문 링크(링크 모음은 팔 수 없다, 재해 관련 보도는 안전 정보라 무료). EXPLORER(news-brief 배포 뒤 조건부): 재해 사건 브리핑 + 그 위치의 지금 기상·해양 값 병기 + 관심 지역 알림. PRO: 없음. |
| 걸리는 것 | · PD 09-07 지시 '기획부터, 바로 만들지 말 것' → 1단계는 계획 승인 뒤 착수. 0단계(막대 삭제)는 '오류 고치기'라 바로 가능.<br>· 라이선스: 한국·일본 민영 매체 RSS 약관(비상업·재배포 제한 여부 UNKNOWN — 매체별 확인 필요) → 공공 피드 먼저, 민영은 매체별 확인 목록을 만든 뒤.<br>· 성능: 네모칸 1개 = 텍스처 1장(과거 라벨 2,843개 발열 사고) → 상한 12/6 하드코딩 + 나머지는 점.<br>· news-brief 미배포 → 브리핑·EXPLORER 가치는 그 뒤. |
| **완료 기준** | · 뉴스를 켜면 분홍 세로선이 하나도 없다.<br>· 지역 칩 '동남아 ○건'을 누르면 Inspector 에 제목 전문·매체·○시간 전·원문 링크 목록이 뜬다.<br>· (1단계 뒤) 지구 위 네모칸이 12개를 넘지 않고, 미확정 사건에는 네모칸이 없다.<br>· 어떤 기사에도 본문·요약·사진이 없다. |

#### 오늘 갈 곳 · `travel.today_pick` — 옮긴다 · P3 · M

| | |
|---|---|
| **Before** | 시군구 228곳 중심점에 7px 점(밝기 = 점수 선형)과 상위 10곳 라벨을 찍고 점을 누르면 '왜 지금' 근거 카드를 준다(travel.js:253-296, :310-328). 카드는 '매일 다시 점수 매깁니다'라고 말하지만(:353) 점수 몸통은 정적 파일이다 — data/tourism/kto-discovery.json generatedAt 2026-09-02, 방문자 2026-07-06~07-19 14일 평균. 매일 바뀌는 것은 특보·대기질 게이트뿐(:118-169). 한편 KTO 일일 스윕(집중률 예측·연관·카탈로그)은 매일 S3 app/tourism/kto/ 에 새로 올라오는데(aws/configure-kto-sweep-schedules.sh) travel.js 는 읽지 않는다. |
| 돈 내는 사람 눈 | 한국 위에 분홍 점 228개가 밝기만 조금씩 다르게 찍히고 상위 10곳 이름이 붙는다. 점을 누르면 나오는 근거 카드는 정직하고 잘 짜였지만, '오늘'이라는 이름과 달리 점수의 몸통은 7월 방문자와 콘텐츠 건수라 날마다 거의 같은 답이 나온다. (C 빈약하다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유(한국관광 데이터랩 경진대회 출품 모듈 EARTHUS TRAVEL DISCOVERY). |
| **After** | [원 개선안 After 미수신(입력 절단) — 코드 근거로 최소안 작성] [자리 없음 · PD 결정 필요] 여행 6현상은 'Travel(한국)' 보조 작업공간 하나로 묶고 칩 [오늘 갈 곳 \| 목적별 장소 \| 방문자]로 — 대안은 v1 이관. 단 대회 접수 09-30·발표심사 10-23 까지 구조 이동은 동결하고 그림·문구만 고친다. 즉시(S): ① '매일 다시 점수 매깁니다' 문장을 사실대로 — '특보·대기질은 지금 값, 목적 밀도·방문자는 ○월 ○일 집계'. ② 밝기 선형 점 → 점수 5단 단계색 원판 + 상위 10곳에 순위 숫자 라벨('1 속초 78'). ③ 게이트에 걸린 곳은 회색 빗금 원판 + 사유('호우주의보 발효' — 안전 정보는 무료). ④ 시군구 폴리곤이 없으므로(kr-places 는 bbox 중심점) 면 채색은 하지 않는다 — 원판까지만. ⑤ 범례 상시: 5칸 + 'EARTHUS DISCOVERY(KTO 공식 추천 아님) · 점수 = 목적 밀도 0.6 + 덜 붐빔 0.4 · 자료 시각 2종'. 다음(M): tools/build_kto_discovery.py 의 집계를 일일 Lambda 단계로 옮겨 S3 의 그날 집중률 예측을 '덜 붐빔' 성분에 쓰면 '오늘'이 실제로 매일 바뀐다(KTO 공식 예측 · FORECAST 배지). Inspector: 기존 '왜 지금' 근거 5줄을 수치·출처·시각 먼저, 문장 나중 순서로 재배열. |
| 표현 | 아이콘/마커(단계색 원판 + 순위 라벨) |
| 자료 | 즉시 항목은 지금 자료로 된다. '매일 바뀌는 오늘'은 자료는 있고 배선이 없다: app/tourism/kto/concentration/tatsCnctrRatedList.json(매일 20:00 UTC 스윕)을 점수에 연결하는 집계 단계가 선행(M). 방문자수는 이동통신 기반이라 관광객 수가 아니다 — 문구 유지. KTO 공공데이터라 Open-Meteo 와 무관. |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/travel.js (computeScores :174-191 · regionCard :363~) · D:/## APP/EARTHUS v2_APP/aws/tourism-flow/kto_collector.py · D:/## APP/EARTHUS v2_APP/aws/configure-kto-sweep-schedules.sh |
| 무료 / 유료 | 무료: 오늘 상위 10 + 게이트 사유. EXPLORER: 시군구별 근거 전체 + 앞으로 30일 집중률 예측 곡선(KTO 공식 예측 인용) + 관심 지역 '한산한 날' 알림. PRO: 없음. |
| 걸리는 것 | · 입력 절단: 원 개선안의 After 를 받지 못했다 → 이 After 는 검증 결과가 아니라 코드 근거 최소안이다.<br>· 대회 동결: 데이터랩 접수 09-30 14:00 · 발표 10-23 → 그 전에는 메뉴 이동·삭제 금지, 문구·단계색만.<br>· 정직성: '매일 다시 점수'는 절반만 참 → 즉시 문구 수정, 근본 해법은 일일 집계 배선.<br>· 자리 없음 → PD 결정(Travel 작업공간 / v1). |
| **완료 기준** | · 오늘 갈 곳을 켜면 시군구 점이 5단 색 원판으로 보이고 상위 10곳에 순위 숫자가 붙는다.<br>· 특보가 걸린 시군구는 회색 빗금 원판이고 누르면 특보 이름과 발표 기관이 보인다.<br>· 카드·범례에 '목적 밀도·방문자 집계일'과 '특보·대기질 현재 시각'이 따로 적혀 있고 '매일 다시 점수'라는 문장이 없다. |

#### 목적별 관광지 · `travel.place_catalog` — 합친다 · P3 · M

| | |
|---|---|
| **Before** | [원 개선안 미수신] 무장애 11,649 · 웰니스 203 · 영문 25,405건(KTO 공식). 지구에는 시군구 228곳 7px 점(밝기 = 건수 제곱근)과, 목록 모드에서는 현재 쪽의 장소만 점으로 찍힌다(travel.js:253-286, :543-555). 장소마다 실제 좌표가 있다(:426 position). kto-english.json 은 4.7MB 다. |
| 돈 내는 사람 눈 | 검색되는 공식 관광지 주소록으로는 제 기능을 하지만, 지구 위에는 현재 페이지의 점 24개만 찍혀 '내 조건에 맞는 곳이 어디에 몰려 있나'가 보이지 않는다. 무장애 목록인데 정작 주차·출입구·화장실 같은 접근성 항목은 한 건도 수집돼 있지 않다. (C 빈약하다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. |
| **After** | [원 개선안 미수신 — 최소안] [자리 없음 · PD 결정 필요] 'Travel(한국)' 작업공간의 '목적별 장소' 칩 하나로 MERGE(무장애 \| 웰니스 \| English 하위 칩). 멀리서는 시군구별 건수 숫자 원판 5단 단계색, 300km 아래에서는 검색·현재 쪽 결과를 번호 핀으로(목록 번호와 1:1). Inspector = 기존 placeCard(주소·좌표·공식 상세·수집 시각). 사진 없음 유지. 대회 동결 기간에는 단계색·번호 핀만. |
| 표현 | 아이콘/마커(숫자 원판 · 번호 핀) |
| 자료 | 지금 자료로 된다(prototype/v2-three/data/tourism/*.json, KTO 공공데이터). 영문 4.7MB 는 모바일 부담 → 시도 단위 분할 또는 지연 로드. |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/travel.js · D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/travel-catalog.js |
| 무료 / 유료 | 무료: 검색·핀·공식 상세. EXPLORER: 조건 조합(무장애 + 오늘 한산 + 특보 없음) 저장·알림. PRO: 없음. |
| 걸리는 것 | · 입력 절단으로 원안 미검증.<br>· 대회(09-30 접수 · 10-23 발표) 전 구조 변경 동결.<br>· 자리 없음 → PD 결정. |
| **완료 기준** | · 무장애를 켜면 시군구마다 건수 숫자가 든 5단 색 원판이 보인다.<br>· 검색 결과 목록의 3번 항목과 지도 위 3번 핀이 같은 장소다. |

#### 연관 관광지 · `travel.place_sequence` — 합친다 · P3 · S

| | |
|---|---|
| **Before** | [원 개선안 미수신] 출발지 944곳 × 상위 5(원본 22,234행, 기준월 2026-06). 지구에는 아무것도 그리지 않는다 — 카드가 '좌표가 없는 명칭 그래프라 지구 위에는 찍지 않습니다'라고 밝힌다(travel.js:562-570). |
| 돈 내는 사람 눈 | 메뉴를 눌러도 지구는 그대로고, 옆 카드에 임의의 관광지 4곳의 '다음 행선지' 목록만 나온다. 내가 궁금한 장소를 고를 방법이 없어 미완성으로 보인다. (D 망가져 보인다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. |
| **After** | [원 개선안 미수신 — 최소안] 독립 메뉴를 없애고 '목적별 장소' Inspector 의 '이곳 다음에 간 곳 Top 5' 목록으로 MERGE(S). 지구 위 호는 장소명을 KTO 카탈로그의 공식 좌표와 이름으로 맞춘 것만, 공용 리본 헬퍼가 생긴 뒤에(M) — 못 맞춘 이름은 그리지 않고 '○곳 중 ○곳만 좌표 확인'을 범례에 적는다. 좌표를 추정해 만들지 않는다. |
| 표현 | DOM 카드(목록) → 뒤에 흐르는 호 |
| 자료 | 목록은 지금 자료로 된다(kto-discovery.json related). 호는 이름 대조 작업이 선행 — 대조율 UNKNOWN. |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/travel.js (relatedCard :562~) |
| 무료 / 유료 | EXPLORER: 연관 흐름 리포트(기준월·원수치 먼저). 무료: Top 5 목록. |
| 걸리는 것 | · 입력 절단으로 원안 미검증.<br>· 좌표 없음 → 공식 카탈로그와 이름 대조된 것만 그린다(대조율 실측 뒤 호 착수 여부 결정). |
| **완료 기준** | · 장소를 누르면 Inspector 에 '이곳 다음에 간 곳 Top 5'와 기준월·출처가 보인다.<br>· 자료 메뉴 줄에 '연관 관광지'가 따로 없다. |

#### 지역 방문자 · `travel.visitor_pressure` — 합친다 · P3 · S

| | |
|---|---|
| **Before** | [원 개선안 미수신] 228곳 중 198곳에 방문자 자료(2026-07-06~07-19 14일 하루 평균, 이동통신 기반), 187곳에 집중률 예측(2026-09-02~10-01). 지구에는 7px 점(밝기 = 방문자 제곱근)뿐이다(travel.js:42, :266). |
| 돈 내는 사람 눈 | 현상의 질문은 '어느 기간에 방문이 많았나'인데 화면에는 두 달 전 2주 평균 한 장뿐이라 기간을 비교할 수 없다. 그림은 분홍 점 밝기 차이뿐이고 표가 실질 내용이다. (C 빈약하다) |
| 기준 사이트 | 기준 사이트에 없음 — EARTHUS 고유. |
| **After** | [원 개선안 미수신 — 최소안] 'Travel(한국)' 의 '방문자' 칩으로 MERGE. 숫자 원판 5단 단계색(하루 평균 방문자, 분위 경계를 범례에 수치로) + 상위 10곳 숫자 라벨. 자료 없는 30곳은 빈 고리('자료 없음' — 0 아님). 범례 상시: '이동통신 기반 방문자(관광객 수 아님) · 2026-07-06~07-19 평균 · 한국관광 데이터랩'. 집중률 예측 30일은 이 묶음의 두 번째 시간 자료 — Global Timeline 날짜 모드가 생기면 일 단위로 연결하고 'FORECAST · KTO' 배지, 그 전에는 Inspector 표로만. |
| 표현 | 아이콘/마커(숫자 원판) 단계색 |
| 자료 | 지금 자료로 된다. 방문자 수치는 7월 것 — 최신화는 KTO 방문자 API 특성(시작일만 응답·공표 지연)에 묶여 있다. 집중률은 상대 지수(100 = 가장 붐비는 시기)이지 인원 수가 아니다. |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/travel.js (visitorsCard :556~) |
| 무료 / 유료 | 무료: 단계색 원판 + 클릭 값. EXPLORER: 30일 집중률 곡선 + 한산한 날 알림. PRO: 없음. |
| 걸리는 것 | · 입력 절단으로 원안 미검증.<br>· 대회 전 구조 변경 동결.<br>· Global Timeline 날짜 모드 부재 → 예측은 우선 Inspector 표. |
| **완료 기준** | · 방문자를 켜면 198곳이 5단 색 숫자 원판, 자료 없는 곳은 빈 고리로 보인다.<br>· 범례에 '관광객 수 아님'과 집계 기간이 상시 보인다. |

#### 여행지 · `travel.poi` — 뺀다 · P3 · S

| | |
|---|---|
| **Before** | [원 개선안 미수신] availability 'planned' — 잠금 상태라 화면에 나오는 자료가 없고 '여행지 목록 열기'가 travel/discover 로 보낸다(phenomenon-registry.js:594-605). 공용 Overpass 가 504 로 불안정해 자체 프록시·캐시가 선행이라고 적혀 있다. |
| 돈 내는 사람 눈 | 유료 메뉴 안에 눌러도 '제공하지 않습니다'만 나오는 죽은 줄이다. 바로 위의 '오늘 갈 곳'과 이름도 겹쳐 혼란스럽다. (D 망가져 보인다) |
| 기준 사이트 | 기준 사이트에 없음. |
| **After** | [원 개선안 미수신 — 최소안] 메뉴에서 REMOVE(PD 결정 필요). '자료 없는 칸은 만들지 않는다'는 기존 메뉴 규칙과 맞추고, 한국은 '목적별 장소'가 같은 질문에 공식 자료로 답한다. 전세계 OSM 장소는 자체 추출·캐시가 생기는 날 새 항목으로 다시 연다(OSM 은 ODbL — 출처표기·파생DB 공개 조건, 착수 전 조건 재확인). |
| 표현 | 없음(메뉴 제거) |
| 자료 | 자료 없음. aws/ 에 Overpass 프록시·OSM 추출기 없음. |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/phenomenon-registry.js (MENU_GROUPS :1103-1107) |
| 무료 / 유료 | 없음. |
| 걸리는 것 | · 입력 절단으로 원안 미검증.<br>· 레지스트리 id 는 지우지 않고 메뉴 members 에서만 뺀다(레이어 id 개명·삭제 금지 규칙). |
| **완료 기준** | · 탐색 메뉴에 눌러도 아무것도 안 나오는 '여행지' 줄이 없다.<br>· '여행지 정보를 찾으려면' 질문으로 들어온 사용자는 '목적별 장소' 검색으로 바로 안내된다. |

#### 항공편 · `travel.flight` — 옮긴다 · P3 · S

| | |
|---|---|
| **Before** | [원 개선안 미수신] availability 'planned' — 잠금. 레지스트리는 'CORS 헤더가 없어 Lambda 프록시가 있어야 한다'고 적지만(phenomenon-registry.js:567) 프록시 코드는 이미 있고(aws/flight-track/handler.py — adsb.lol ODbL 1.0, CORS 헤더 포함) v1 flight.js 가 그 방식을 쓴다. 임시 항로(route.js)는 대권 파선 + 공항 날씨를 Open-Meteo 지점 API 브라우저 직호출로 받는다(route.js:332). |
| 돈 내는 사람 눈 | '항공편'을 누르면 비행기는 한 대도 안 보이고 안내문만 나온다. 돈을 내는 사람이 기대하는 것(지금 떠 있는 비행기)과 가장 거리가 먼 메뉴다. (D 망가져 보인다) |
| 기준 사이트 | 기준 사이트에 없음. PD 정본 좌측 레일에 자리 없음. |
| **After** | [원 개선안 미수신 — 최소안] [자리 없음 · PD 결정 필요] '비행기가 실제 어디에 있나'는 FACT 질문이고 v1 에 이미 구현이 있다 → v2 메뉴에서는 빼고 v1 로 MOVE(권고). v2 에 남긴다면: 막힌 것은 인프라가 아니라 배선이다 — flight-track 의 배포 여부만 확인하고 v2 에 연결(S~M), 실제 항적은 실선·관측 배지, 대권 추정은 파선·DERIVED 로 구분, 대양 수신 공백은 선을 끊어 그린다. 임시 항로의 공항 날씨는 Open-Meteo 를 걷어내고 NOAA aviationweather METAR(미 연방정부 자료) 또는 기상청 공항기상으로 바꾼다 — 유료 상품 안에서 Open-Meteo 직호출은 감사 문서가 지적한 위험이다. |
| 표현 | 경로선(실선 = 관측 항적 / 파선 = 추정) |
| 자료 | 항적: adsb.lol(ODbL 1.0, 출처표기 — aws/flight-track/handler.py 머리말) — 수집 프록시 코드는 있고 배포 상태 UNKNOWN(aws/deploy-lite.sh 주석에 예시로만 등장). 공항 날씨: METAR 수집기 없음 → 대체 경로 확보가 선행(S). |
| 재사용 | D:/## APP/EARTHUS v2_APP/aws/flight-track/handler.py · D:/## APP/EARTHUS v2_APP/prototype/js/flight.js · D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/route.js |
| 무료 / 유료 | 없음(권고대로 v1 이관 시). 남길 경우 EXPLORER: 내 항공편 경로 위 뇌전·화산재(VAAC) 겹침 알림 — 06 Hazards 자료가 선 다음. |
| 걸리는 것 | · 입력 절단으로 원안 미검증.<br>· 라이선스: route.js:332 Open-Meteo 직호출 → METAR/기상청으로 교체.<br>· 레지스트리의 잠금 사유가 낡았다(프록시 코드는 존재) → 배포 여부 확인 후 사유 문구 갱신.<br>· 자리 없음 → PD 결정(v1 이관 권고). |
| **완료 기준** | · v2 탐색 메뉴에 잠긴 '항공편' 줄이 없다(v1 이관 시) — 또는 남긴 경우 실선 항적과 파선 추정이 범례로 구분된다.<br>· v2 어디에서도 api.open-meteo.com 으로 가는 공항 날씨 요청이 없다. |

#### 해변과 낚시터 · `ocean.coastal_spots` — 합친다 · P2 · S

| | |
|---|---|
| **Before** | 한국 해변 271곳(노랑 6px)·낚시 946곳(청록 3.5px)을 값 없는 단색 점 두 무리로 찍고 클릭이 안 된다(live-layers.js:1802-1816). 읽는 파일은 v2-three/data/ 의 사본 두 개뿐이라(live-layers.js:490-497) 일본 756+63곳은 이 레이어에 없다 — 같은 좌표를 hobby 모듈은 v1 /data/ 에서 따로 읽는다(원천 2벌). |
| 돈 내는 사람 눈 | 한국 해안선을 따라 노랑·청록 점이 빽빽이 찍히지만 눌러도 이름조차 나오지 않는다. 같은 자료로 값까지 보여주는 '서핑'·'낚시' 메뉴가 바로 아래 있어 이 줄은 존재 이유가 약하다. (C 빈약하다) |
| 기준 사이트 | windy POI '서핑 지점'·'조석' — 값과 함께 찍힌다. 값 없는 점만 찍는 메뉴는 두 기준 사이트에 없다. |
| **After** | [→ 05 Ocean · Waves 탭, PD 결정 필요] 이 현상은 '생태·사람·여행' 묶음(phenomenon-registry.js:1108)이라 PD 정본 레일에 자리가 없다 — (a) Ocean 토글로 흡수 (b) v1 로 보냄 (c) 삭제 중 PD 가 고른다. 권고는 (a) MERGE: 현상 ocean.coastal_spots 를 메뉴에서 빼고, 레이어 id 'ocean/surf' 는 개명하지 않은 채 Waves 탭 'Show spots'(칩 [서핑\|낚시]) 토글의 원거리(>300km) 바탕 점으로만 남긴다(Points 1개 = 드로우콜 1). 좌표 원천은 /data/beaches.json·fishing.json(+jp) 한 벌로 통일하고 v2-three/data 사본은 없앤다. 정정: 방위(facing) 계산값은 271곳 중 206곳뿐이고 일본 756곳은 0곳이다 — '해변 방위를 남긴다'는 206곳에만 해당. 점을 누르면 Inspector 에 이름·종류·좌표 출처(OpenStreetMap ODbL)·기준일만 뜬다(값은 서핑·낚시 칩이 담당). |
| 표현 | 아이콘/마커(원거리 바탕 점) |
| 자료 | 지금 자료로 된다 — prototype/data/beaches.json(271, facing 206)·fishing.json(946)·data/jp/*(756+63). OSM ODbL 1.0: 상업 가능, 출처 표기 + 파생 DB(방위 계산값) 동일조건 공개 — 이미 공개 JSON 이라 충족. 갱신 주기 없음(고정 기준일, HISTORY). |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/data/beaches.json · D:/## APP/EARTHUS v2_APP/prototype/data/fishing.json · D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/live-layers.js (buildSurf :1802) |
| 무료 / 유료 | 없음(무료). 유료 깊이는 surf_conditions·fishing_conditions 에서 판다. |
| 걸리는 것 | · PD 결정 필요: 여가 5현상의 자리(Ocean/Wind/Temperature 토글 흡수 vs v1 이관 vs 'Life' 보조 서랍 vs 삭제). 결정 전에는 메뉴에서 빼지 않는다.<br>· 'Show spots' 토글 부품과 우측 Inspector 가 v2 에 아직 없다(ui-shell.js·main.js grep 0건) — P0 셸 + P1 'Show Stations' 부품이 선행. 그 전에 이 메뉴만 지우면 좌표가 갈 곳이 없다.<br>· 현상을 레지스트리에서 빼면 검사기·MENU_GROUPS·engine-bridge.js:140 truth 표를 같이 고쳐야 한다. 레이어 id 'ocean/surf' 는 개명 금지(기존 규칙). |
| **완료 기준** | · 메뉴(레일·서랍 어디에도) '해변과 낚시터' 항목이 없고, Ocean · Waves 탭 Inspector 의 'Show spots' 토글을 켰을 때만 점이 나타난다.<br>· 300km 위에서 토글을 켜면 한국·일본 해변·낚시터가 모두 보이고(일본이 빠지지 않음), 점을 누르면 Inspector 에 이름·종류·'OpenStreetMap ODbL'·기준일이 뜬다.<br>· 네트워크 탭에서 beaches.json·fishing.json 이 한 경로(/data/)에서만 내려온다. |

#### 서핑 · `ocean.surf_conditions` — 합친다 · P2 · L

| | |
|---|---|
| **Before** | 카메라 근처 해변 12곳(N_SHOW)에 8px 점(색=스웰 노출 4판정)과 이름표 최대 6~12개('너울 m·수온')를, 300km 위에서는 권역마다 표본 3곳으로 낸 대표점을 찍는다. 파랑·수온·조위는 브라우저가 Open-Meteo Marine 을 직접 부르고(prototype/js/beaches.js:226, current 한 시점 + 조위 2일), 파면 판정의 바람만 KMA AWS 실측이다(ext/hobby-surf.js:33-36, 84-116). 타임라인 훅이 ext 모듈에 없다(ext-scene.js grep 0건). |
| 돈 내는 사람 눈 | 해변 점 색과 '양양 0.8m · 22°' 같은 라벨, 부이 실측과 모델을 나란히 놓고 안전 경고를 맨 위에 둔 카드는 이 묶음에서 가장 '서비스'답다. 하지만 서퍼가 돈을 내는 이유인 며칠치 예보가 없고 지금 값만 있으며, 그 값의 출처가 상업 이용이 불확실한 Open-Meteo 다. (B 손보면 된다) |
| 기준 사이트 | windy — 파도·너울 색면 위 '서핑 지점' POI, 누르면 지점의 파고·주기·방향·바람·조석 타임라인. mapped.earth — Waves·Wave period 색면만. |
| **After** | [→ 05 Ocean · Waves 탭 토글 'Surf spots', PD 결정 필요(레일에 자리 없음)] 부모 그림(파고 단계색+방향 glyph)은 05 담당. 핵심 정정 = **자료를 따로 받지 않는다**: 마커 숫자는 05 Ocean 이 그리는 파랑 프레임(8bit 1ch 선형, 공용 프레임 저장소)을 해변의 앞바다 점(beaches.js offshore())에서 CPU 로 읽은 값이다 — 색면과 마커 숫자가 같은 원천이라 어긋나지 않고, Global Timeline 이 공짜로 따라온다. 최근접 텍셀이 육지/결측이면 반경 N텍셀 안 가장 가까운 유효 바다 텍셀을 쓰고, 없으면 '파랑 자료 없음'(0 으로 채우지 않음). 마커: 방위 아이콘(부채꼴+스웰 화살)은 facing 이 있는 206곳만, 나머지 821곳(한국 65+일본 756)은 중립 원판+숫자만 — 회색 '자료 없음' 아이콘으로 지도를 덮지 않는다. 노출 4색은 '정면·비스듬·스침·막힘' 기하 사실로 범례 표기, 흰 테두리 원판(이중 부호 회피). **스웰 분리 변수(너울 높이·방향·주기)가 프레임에 없으면 노출 4판정은 끄고 숫자만** — 전체 파향을 스웰 방향인 척 쓰지 않는다. 시간 혼용 차단: offset=0 은 ② 파면 바람 = KMA AWS 실측(25km 이내, OBSERVED), offset≠0 은 02 Wind GFS 0.5° 10m 프레임 값(MODEL·run 시각 표기, '격자 55km — 해륙풍 미반영') — 미래 스웰×현재 실측 바람을 한 판정에 섞지 않는다. 이안류는 관측 전용이라 offset≠0 에서 '예보 없음'. 라벨 예산: 데스크톱 ≤40 · 모바일 ≤16, 그 밖은 클러스터(권역 최대 너울 + '○곳 중'). Inspector: 안전(이안류 KHOA 10곳·여름 한정 문구) → ①②③ → 부이 실측(120km 이내, 30분 주기 수집) \| 모델 나란히 → 조위. suit() 슈트 가늠은 수치 아래 '참고(공인 기준 아님)' 로 격하. 점수·'타기 좋습니다' 없음. |
| 표현 | 아이콘/마커(회전 아이콘 Points 셰이더 1드로우콜 + 숫자 라벨 아틀라스) |
| 자료 | 지금 자료로는 유료 불가 — 파랑·수온·조위 전부 Open-Meteo Marine 브라우저 직호출. **저장소에 파랑 수집기는 0개**(R0 감사 §4 '없는 것: 파랑'; aws/marine-ea·marine-grid 도 Open-Meteo). 이웃의 'GFS 확장(M)'에는 파랑이 없다(TMP·UGRD/VGRD·PRMSL·APCP 뿐) → 파랑 자료 확보는 별도 선행 L, 소유는 05 Ocean. 후보 ① NOAA GFS-Wave 0.25°(public domain, 너울 분리 변수 제공으로 알려짐) — 단 grib2lite.py:8 은 JPEG2000(5.40)을 거부하고 GFS-Wave 패킹 템플릿은 미확인(UNKNOWN, 스파이크 필요; 막히면 deploy-ecmwf.sh 의 eccodes 경로). 후보 ② ECMWF Open Data wave — ecmwf-ingest 는 oper 하드코딩(handler.py:100)·levtype=='sfc' 필터(:135)·PARAMS=['2t']·ASOS 97지점·24~120h 5스텝뿐이라 '가장 싼 확장'이 아니다(2,000지점×다스텝 find_nearest + 해안 육지셀 결측 처리 신규). wave 스트림에 너울 분리가 있는지는 UNKNOWN. 수온: 모델 대신 kma-ocean 부이 실측(OBSERVED, 거리 표기) 또는 NOAA OISST(일 1회 0.25°, marine-ea 에 경로 있음). 조위 예보: 저장소에 KHOA 조석예보 수집기 0건 — fishing 항목이 소유. 임시 경로(PD 결정 D-OM1·D-OM5): Open-Meteo Standard 유료 키 + 서버측 수집기(키를 브라우저에 둘 수 없으므로 직호출은 어차피 제거). |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/ext/hobby-surf.js · D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/ext/hobby-sea-common.js · D:/## APP/EARTHUS v2_APP/prototype/js/surf.js (judge) · D:/## APP/EARTHUS v2_APP/prototype/js/beaches.js (offshore, tideOf) · D:/## APP/EARTHUS v2_APP/aws/kma-ocean/handler.py · D:/## APP/EARTHUS v2_APP/aws/khoa-coast/handler.py |
| 무료 / 유료 | 무료: 마커·노출·현재 값 + 안전 정보(이안류·너울 경고). EXPLORER: 타임라인(파랑 프레임 길이만큼) + 내 해변 저장 + 사용자 임계 알림. '모델 대 부이 30일 검증 이력'은 **지금 축적이 0**(archiver 는 NDBC 부이·격자 스냅샷만 보관) — 파랑 수집기 가동 후 30일이 지나야 팔 수 있다, 출시 시점 혜택으로 적지 않는다. PRO: Compare 의 파랑 모델 비교는 두 번째 파랑 원천이 생긴 뒤. |
| 걸리는 것 | · [선행 L · 소유 05 Ocean] 파랑 프레임 수집기 신규(파고·파향·주기 + 너울 분리). 없으면 이 항목은 시작 불가. 해법: 05 Ocean 작업에 '너울 분리 3채널 + 해안 유효 텍셀' 요구를 지금 전달.<br>· [선행 M · 공용] 회전 아이콘 마커 + 라벨 아틀라스 + 클러스터 + Inspector 픽 부품. 지금은 makeLabel 이 라벨마다 CanvasTexture+Sprite(ext-scene.js:169-184), makePoints 는 원 텍스처 하나·회전 불가(:97-138) — 1,027곳에 그대로 쓰면 모바일에서 못 돈다. 07 'Show Stations' 와 한 부품으로 만든다.<br>· [선행 S] ExtScene 에 시간 훅 추가 — main.js:4891-4897 onTimeOffset 은 clouds·liveLayers 만 부른다.<br>· 방위 아이콘은 206/1,027곳(20%)뿐. 일본 facing 은 같은 OSM 해안선 축평균 방법(beaches.json method)으로 오프라인 계산 가능(S~M, 선택) — 지어내는 값이 아니라 같은 계산식.<br>· ecmwf-ingest 스케줄: README:37 '미스케줄' vs R0 감사 §4 'cron(40 2,8,14,20) 실측' — 문서 충돌, 실측 UNKNOWN. 이웃 결정(미스케줄)을 전제로 둔다.<br>· PD 결정 필요: 레일 자리 + Open-Meteo 임시 유료 키(D-OM1·D-OM5). |
| **완료 기준** | · Waves 탭에서 'Surf spots' 를 켜면 화면 안 해변이 전부 마커로 뜨고(12곳 제한 없음), 한 해변의 마커 숫자가 그 자리 파고 색면의 범례 구간과 일치한다.<br>· 타임라인을 +24h 로 밀면 마커 숫자가 바뀌고 Inspector 바람 행의 배지가 OBSERVED(기상청 AWS·관측시각)에서 MODEL(GFS·run 시각)로 바뀌며 이안류 행은 '예보 없음'이 된다.<br>· 일본 해변과 facing 없는 한국 해변은 부채꼴 없이 숫자 원판만 보이고 Inspector 에 '바다 방향 자료 없음'이 적힌다.<br>· 네트워크 탭에 marine-api.open-meteo.com 호출이 0건이고, 모바일(375px)에서 라벨이 16개를 넘지 않는다. |

#### 낚시 · `ocean.fishing_conditions` — 합친다 · P2 · L

| | |
|---|---|
| **Before** | 카메라 근처 낚시터 12곳에 8px 점(색=종류 5색)과 이름표 최대 6~12개('조차·너울')를 찍고 너울 1.5m 이상만 글자를 붉게 한다(ext/hobby-fishing.js:79-108). 조위 5일·파랑·수온 모두 Open-Meteo Marine 브라우저 직호출이고(prototype/js/fishing.js:293) 서핑과 달리 앞바다로 밀지 않은 원좌표로 물어 항구 안쪽은 파랑이 빈다(fishing.js askPoint). 권역 '최대 조차'는 권역당 표본 3곳의 최대다(hobby-sea-common.js:20,203). |
| 돈 내는 사람 눈 | 안전을 맨 위에 두고 조차·만조 시각·너울을 지점별로 주는 카드는 실용적이고 정직하다. 다만 물때를 곡선으로 보여주지 않고, 지도는 점 12개와 글자라 '오늘 어느 바다가 움직이나'가 그림으로 안 보인다. (B 손보면 된다) |
| 기준 사이트 | windy POI '조석' + 파도 색면. mapped.earth 에는 없다. 안전을 맨 위에 두는 구성은 EARTHUS 고유. |
| **After** | [→ 05 Ocean · Waves 탭 토글 'Fishing spots', PD 결정 필요(레일에 자리 없음)] 서핑과 같은 'Show spots' 부품의 다른 칩. 파랑 숫자는 서핑과 같이 05 Ocean 파랑 프레임을 지점에서 읽는다(육지 텍셀이면 가장 가까운 유효 바다 텍셀, 없으면 비움 — '조위만 있는 지점'은 물때만 보여주는 기존 규칙 유지). 마커: 종류 아이콘 5종(색은 '무엇인지'만) + 숫자 라벨. 색으로 말하는 유일한 것은 안전 고리: **너울 높이** ≥1.0m 주황 · ≥1.5m 붉음(fishing.js SWELL_WATCH/DANGER — 문턱이 '너울' 기준이므로 프레임에 너울 분리가 없으면 유의파고로 슬쩍 바꾸지 않고 고리를 끈 채 '너울 분리 자료 없음'). 바람 고리는 AWS 실측 30km 이내일 때만(WIND 8/12 m/s). 물때 정정: 파랑 수집기는 조위를 주지 않는다 → KHOA 조석예보(기관 예측, OFFICIAL_FORECAST) 수집기 신규. 라벨은 '조차 3.2m' 가 아니라 **'○○ 예보지점 · N km'** 를 Inspector 첫 줄에 — 서해는 수십 km 에 조차가 크게 달라(fishing.js 실측 주석: 대천 5.53m · 인천 6.87m) 남의 지점 값을 이 포인트 값처럼 말하면 안 된다. 거리 상한은 khoa-coast 관측 조위 45곳으로 인접 지점 간 차이를 재서 정하고, 넘으면 '가까운 조석 예보지점 없음'. 원거리 클러스터: '권역 최대 조차'는 표본 3곳이 아니라 예보지점 전수에서 내고 '○지점 중' 표기. Inspector: 안전(너울·바람·이안류, 기관·관측시각) → 물때(만조·간조, 조차, 예보지점·거리) → 수온(부이 실측 우선). 조황·어종 없음. offset≠0: 너울=MODEL, 물때=KHOA 예측, 바람=GFS MODEL, 이안류='예보 없음'. |
| 표현 | 아이콘/마커(종류 아이콘 + 숫자 라벨 + 안전 고리) |
| 자료 | 지금 자료로는 유료 불가(Open-Meteo 직호출). ① 파랑: 서핑과 같은 05 Ocean 파랑 프레임(선행 L, 저장소에 수집기 0개). ② 물때: KHOA 조석예보 — 저장소 전체 grep 0건(aws/khoa-coast 는 관측 조위 45곳 + 이안류 10곳, 15분 주기). data.go.kr API 는 건별 승인이 필요했다(khoa-coast 머리말) → PD 신청 선행, 예보지점 수·응답 형식 UNKNOWN. ③ 실측: kma-ocean(부이, 30분 수집) · kma-aws-min(736지점 매분, wss=최대순간풍속) · khoa-coast — 전부 공공누리. |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/ext/hobby-fishing.js · D:/## APP/EARTHUS v2_APP/prototype/js/fishing.js (safety·FISH_RULES·tideOf) · D:/## APP/EARTHUS v2_APP/aws/khoa-coast/handler.py (data.go.kr 호출 뼈대) |
| 무료 / 유료 | 무료: 마커 + 지금의 안전 정보(구독과 무관). EXPLORER: 물때 7일 + 시간대별 조건표(값 나열, 추천 아님) + 너울 경고 알림 + 내 포인트 저장. PRO: 없음. |
| 걸리는 것 | · [이 항목 소유 · S~M] KHOA 조석예보 수집기 신규 + data.go.kr 활용 신청(PD 직접). 이것 없이는 Open-Meteo 를 떼는 순간 낚시의 핵심 숫자(조차·만조 시각)가 사라진다 → 크기를 M 에서 L 로 올린 이유.<br>· [선행 L · 소유 05 Ocean] 파랑 프레임 + 너울 분리. 안전 고리의 문턱이 너울 높이 기준이라 유의파고만 오면 고리 의미가 바뀐다.<br>· [선행 M · 공용] 마커·라벨 아틀라스·클러스터·Inspector 부품, [선행 S] ExtScene 시간 훅 — 서핑과 공유.<br>· 0.25~0.5° 파랑 격자는 방파제 안쪽·만 안을 못 본다 — Inspector 에 '앞바다 격자값 · 항 안쪽 아님' 상시 표기(격자값을 지점값으로 말하지 않기).<br>· PD 결정 필요: 레일 자리. |
| **완료 기준** | · Waves 탭에서 'Fishing spots' 칩을 켜면 화면 안 낚시터가 전부 종류 아이콘으로 뜨고, 너울 1.5m 이상인 곳만 붉은 고리(흰 외곽선)를 두른다 — 아이콘 색 자체는 위험을 말하지 않는다.<br>· 포인트를 누르면 Inspector 맨 위가 안전(너울·바람·이안류와 각 기관·시각)이고, 물때 행에 '○○ 조석 예보지점 · N km · 국립해양조사원'이 적힌다. 상한보다 먼 포인트는 '가까운 조석 예보지점 없음'으로 뜬다.<br>· 타임라인을 밀면 조위·너울 숫자가 그 시각 값으로 바뀌고 배지가 MODEL/기관 예측으로 구분된다.<br>· 네트워크 탭에 marine-api.open-meteo.com 호출이 0건이다. |

#### 패러글라이딩 · `weather.paragliding` — 합친다 · P3 · S

| | |
|---|---|
| **Before** | 한국 활공장 26곳에 9px 점(색=바람 5구간)과 '풍속·16방위' 이름표를 찍고, 바람·돌풍·기온·이슬점을 Open-Meteo forecast current 한 시점으로 브라우저가 직접 받는다(ext/hobby-para.js:176-205, prototype/js/para.js:136). para.json 메타가 count:17 인데 sites 는 26개다(메타 불일치). |
| 돈 내는 사람 눈 | 전국 26곳에 색 점과 '풍속 방위' 라벨이 붙어 한눈에 읽히는 것은 장점이다. 그러나 값이 산 정상 좌표의 10m 모델 바람 한 시점뿐이라, 실제 이륙 판단에 돈을 낼 만한 깊이(시간별 예보·고도별 바람·이륙장 방향)는 없다. (C 빈약하다) |
| 기준 사이트 | windy POI '패러글라이딩 지점' — 바람 입자·색면 위 마커, 누르면 지점 예보와 고도별 바람. mapped.earth 에는 없다. |
| **After** | [→ 02 Wind 토글 'Flying sites', PD 결정 필요(레일에 자리 없음)] 부모 그림(입자+풍속 구간색)은 02 Wind(P0) 담당. 1차 값을 **모델에서 실측으로 뒤집는다**: kma-aws-min(736지점 매분)에 ws10·wd10·wss(최대 순간풍속)·ta·td 가 다 있다 → 활공장과 '같은 산' 조건(mountain.js 의 8km 이내 · 고도가 활공장의 55% 이상 규칙을 빌림)을 만족하는 관측소가 있으면 그 실측을 OBSERVED 로 앞에, '○○관측소 · N km · 고도차 M m' 와 함께. 조건을 만족하는 관측소가 없으면 02 Wind 의 GFS 0.5° 프레임 값을 MODEL 로('격자 55km 값 — 활공장 값 아님, 지상 10m') 표시하고 **돌풍 고리는 그리지 않는다** — severity 를 남의 골짜기 값으로 만들지 않는다. 마커: 풍향 화살(서핑과 같은 회전 아이콘 Points) + 5구간 색(PARA_RULES 수치 그대로, '우리가 정한 표시 구간 — 협회 기준 아님') + 숫자 라벨. 돌풍차 고리(≥4 주황 · ≥7 붉음)는 wss−ws10 실측이 있을 때만, 범례에 '최대 순간풍속 − 10분 평균(기상청 AWS)' 로 정의를 적는다(Open-Meteo wind_gusts_10m 과 정의가 다르다). 구름 밑면은 실측 ta·td 로 같은 Espy 식(EARTHUS_ANALYSIS, ±수백 m) — ECMWF 2d 추가는 불필요. 고도 선택은 02 Wind 가 실제로 제공하는 고도만 따른다(850hPa 는 이웃 GFS 확장 목록에 없음 = UNKNOWN). 범례 상시: '좌표는 산 정상이지 이륙장이 아님 · 이륙장 방위 자료 없음 · 실측 ○/26곳'(분모는 list.length). '날기 좋다' 없음. |
| 표현 | 아이콘/마커(풍향 화살 + 숫자 라벨 + 조건부 돌풍 고리) |
| 자료 | 현재 값은 **새 수집기 없이** 된다 — aws/kma-aws-min(공공누리 1유형, 매분, 자료 지연 2~3분). 같은 산 조건을 만족하는 관측소가 26곳 중 몇 곳인지는 UNKNOWN(런타임 실측 후 화면에 ○/26). 예보(타임라인)는 02 Wind 의 GFS 0.5° 10m 프레임 샘플 — 이웃 결정상 0.25° 불가, 개선안의 'GFS 0.25° 10m·850hPa' 는 틀렸다. 돌풍 예보는 GFS GUST 필드가 이웃 확장 목록(TMP·UGRD/VGRD·PRMSL·APCP)에 없어 지금 계획으로는 없음 — 필요하면 그 M 작업에 1필드 추가 요청. kma-fcst(동네예보)는 ASOS 97지점 전용이고 돌풍 항목이 없으며 KMA 허브 일일 용량을 15개 Lambda 가 나눠 써 26지점 추가는 권하지 않는다. 활공장 목록 OSM ODbL. |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/ext/hobby-para.js · D:/## APP/EARTHUS v2_APP/prototype/js/para.js (windBand·PARA_RULES·cloudBaseM) · D:/## APP/EARTHUS v2_APP/prototype/js/mountain.js (LOCAL_KM·LOCAL_FRAC 짝짓기 규칙) · D:/## APP/EARTHUS v2_APP/aws/kma-aws-min/handler.py |
| 무료 / 유료 | 무료: 마커·지금 값(실측). EXPLORER: 타임라인(02 Wind 프레임 길이만큼, MODEL 표기) + 사용자 설정 임계 알림. 돌풍 예보·고도별 바람은 자료가 생긴 뒤에만 적는다. PRO: 없음. 26곳이라 단독 유료 가치는 낮다 — 02 Wind 의 부가 가치. |
| 걸리는 것 | · [선행 P0] 02 Wind 렌더러 + 우측 Inspector. [선행 M · 공용] 회전 아이콘 마커·라벨 부품, [선행 S] ExtScene 시간 훅.<br>· 산 위 활공장 대 골짜기 관측소: 같은 산 조건 밖의 관측소 값은 쓰지 않는다 → 실측이 붙는 곳이 소수일 수 있다(UNKNOWN). 그 경우 이 메뉴의 그림은 대부분 MODEL 격자값이 되며 그 사실을 범례에 적는다.<br>· para.json 메타 count:17 ≠ sites 26 — 화면 분모는 메타가 아니라 목록 길이로.<br>· PD 결정 필요: 레일 자리(26곳·한국 전용이라 v1 이관/삭제 후보 1순위). |
| **완료 기준** | · 02 Wind 에서 'Flying sites' 를 켜면 26곳이 풍향 화살 마커로 뜨고, 화살 방향이 바탕 입자 흐름 방향과 눈으로 일치한다(모델값 마커의 경우).<br>· 실측이 붙은 활공장을 누르면 Inspector 첫 행이 'OBSERVED · ○○관측소 · N km · 고도차 M m · 관측시각' 이고, 실측이 없는 곳은 'MODEL · GFS 0.5° 격자값' 이며 돌풍 고리가 없다.<br>· 범례에 '우리가 정한 표시 구간 — 협회 기준 아님 · 좌표는 산 정상 · 실측 ○/26곳' 이 상시 보인다.<br>· 네트워크 탭에 api.open-meteo.com 호출이 0건이다. |

#### 산 정상 날씨 · `weather.mountain_summit` — 합친다 · P1 · M

| | |
|---|---|
| **Before** | 기상청 산악예보 봉우리에 7px 점 3색(예보만/고지대 관측소 있음/선택)만 찍고 값이 지구 위에 없다. 봉우리를 고르면 OSM 등산로를 sac 등급색 LineBasicMaterial 1px 선분으로 그린다(ext/hobby-mountain.js:297-326). 수집기가 항목마다 **가장 이른 예보값 하나만** 남겨(aws/kma-mountain/handler.py:144 reduce_one) 시간축이 자료에 없다. 스케줄은 하루 4회(schedules.sh:79)이고 허브 예산이 앞서면 회차를 건너뛴다(handler pace). |
| 돈 내는 사람 눈 | '예보는 몇 도인데 실제로 잰 값은 몇 도'를 나란히 놓는 뼈대가 분명하고 자료도 기상청 공식이라 이 묶음에서 가장 믿고 팔 수 있는 화면이다. 지도 쪽은 작은 점과 1px 등산로 선이라 눈길을 끌지는 못한다. (B 손보면 된다) |
| 기준 사이트 | windy — 기온 색면 위 도시별 숫자 + POI '기상 관측소'. 산 정상의 '예보 대 실측 병기'는 두 기준 사이트에 없음 — EARTHUS 고유. |
| **After** | [→ 01 Temperature 토글 'Summits', PD 결정 필요(레일에 자리 없음)] 부모 그림(5°C 10단+흰 등온선+숫자 라벨)은 01 담당. 정직성 정정 ①: mountain.js 가 내는 두 번째 숫자는 '실측'이 아니라 **고지대 관측소 실측을 정상 고도로 감률 환산한 값(est)** 이다(mountain.js lapseTo, 5.5°C/km, 600m 이내만) — OBSERVED 배지를 붙이면 없는 관측을 만든 것이 된다. 라벨은 '설악산 1,708m  예보 4°(기상청) \| 환산 1°(EARTHUS 분석 · 중청 1,596m 실측 2° 기준)' 로, 가까이서는 관측소 원값(OBSERVED)과 환산값(EARTHUS_ANALYSIS)을 갈라 쓴다. 고리: \|예보−환산\| ≥ 3°C(MARK.gapC). 환산 짝이 없는 봉우리는 예보 숫자만. 정정 ②: '평지 색면과 마커 색 차이가 곧 답'은 철회 — 바탕은 GFS 0.5° 모델(봉우리를 뭉갠 격자), 마커는 기상청 산악예보로 **서로 다른 두 모델**이다. 마커 색은 01 팔레트를 그대로 쓰되(같은 범례), '정상은 아래보다 얼마나 추운가'의 답은 mountain.js 가 이미 계산하는 base/drop(35km 이내·400m 이상 낮은 AWS 실측 대 정상 예보)을 Inspector 첫 행과 근접 라벨('아래 ○○ 215m 실측 12° → 정상 예보 4°')에 둔다. 범례 상시: 예보 발표시각 · 유효시각 · 관측시각 3줄 + '응답 ○/165곳 · 환산 짝 ○곳'(meta.withEst) + 자료 나이(회차 건너뜀 대비). 라벨 예산 데스크톱 ≤40 · 모바일 ≤16, 고도 높은 순. Global Timeline: 수집기가 시간별 계열을 보관하도록 고친 뒤에만 연결(관측은 offset=0 에서만, offset≠0 은 예보 숫자만). 등산로: WebGL 은 linewidth 를 무시하므로 Line2/LineMaterial 애드온 추가 또는 리본 메시로 2px, sac 6등급 범례('국제 등급 — 우리가 매긴 것 아님 · 폐쇄·통제 미포함'). '안전합니다'·'등산하기 좋습니다' 없음. Inspector: 수치(아래 실측→정상 예보→고지대 실측→환산·차이) → 출처·시각 → 그 아래 문장. |
| 표현 | 아이콘/마커(두 숫자 라벨 + 차이 고리) + 경로선(등산로 굵은 선) |
| 자료 | 현재 값 그림은 지금 자료로 되고 라이선스가 깨끗하다(전부 공공누리 1유형): aws/kma-mountain(165곳 요청, 하루 4회, 회차당 124~145곳 응답) · aws/kma-aws-min(736지점 매분 — 개선안의 'aws/kma-aws 10분'은 ASOS 97 정시판이라 틀린 지목). **타임라인은 지금 자료로 안 된다** — reduce_one 이 가장 이른 값만 남긴다. 같은 응답에 60여 시간이 들어 있으므로(핸들러 머리말) 허브 호출 추가 없이 TMP·WSD·VEC·POP·SKY 시간별 배열을 보관하도록 고치면 된다(S, 165곳×~60시각 ≈ 수백 KB, 받는 즉시 줄이는 메모리 규칙 유지). 검증 이력: aws/mountain-verify 가 매시간 '예보−환산' 을 archive/mtgap 과 일별 집계로 쌓는 중 — 단 rows 에 **예보 유효시각·선행시간이 없다**(handler.py:127-138) → 나중에 선행시간별로 못 가른다. 되돌릴 수 없는 자료라 tempFcstKst 1필드 추가를 UI 결정과 무관하게 지금 권고. 등산로 OSM ODbL 104봉(최대 164KB/봉). |
| 재사용 | D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/ext/hobby-mountain.js · D:/## APP/EARTHUS v2_APP/prototype/js/mountain.js (est·gap·base·drop·MARK) · D:/## APP/EARTHUS v2_APP/aws/mountain-verify/handler.py · D:/## APP/EARTHUS v2_APP/aws/kma-mountain/handler.py (reduce_one) · D:/## APP/EARTHUS v2_APP/prototype/data/trails/ |
| 무료 / 유료 | 무료: 두 숫자 마커 + 지금 값(기관 예보·실측은 무료). EXPLORER: 검증 이력 리포트 — 문장은 '이 산에서 지난 30일 **가장 이른 예보시각의** 예보는 고지대 실측 환산값보다 평균 +N°C(표본 n, 기간, 감률 5.5°C/km, 관측소는 정상이 아니라 중턱)' 까지. 선행 24h·48h 예보의 정확도는 말하지 못한다(그 짝을 쌓은 적이 없다). 환산 짝이 있는 봉우리에만 제공. + 시간별 타임라인(수집기 수정 후) + 영하 진입·강풍 알림. PRO: 없음. |
| 걸리는 것 | · [선행 P0] 01 Temperature 렌더러 + 우측 Inspector + Global Timeline. [선행 M · 공용] 마커·라벨 아틀라스 부품 — 지금 makeLabel 은 라벨당 텍스처+드로우콜이라 165곳 두 숫자 라벨을 못 감당한다.<br>· [이 항목 소유 · S] kma-mountain 시간별 계열 보관 + mountain-verify rows 에 유효시각 추가. KMA 허브 추가 호출 0 — 다만 배포는 허브 회계 동봉 함정(kma_hub 를 같이 담아야 함) 주의.<br>· [이 항목 소유 · S] 굵은 선: vendor 에 three-r184.module.min.js 하나뿐이고 Line2/LineMaterial 은 v2-three 전체 grep 0건 — 애드온 4파일 벤더링 또는 리본 메시.<br>· 환산 짝이 있는 봉우리 수가 문서마다 다르다(mountain.js 머리말 '85봉 중 14' vs mountain-verify 주석 '산 84곳') = UNKNOWN → 화면이 meta.withHigh/withEst 를 상시 표기해 스스로 말하게 한다. 겨울 표본은 이번 겨울이 지나야 생긴다.<br>· PD 결정 필요: 레일 자리. 결정이 'v1 이관'이어도 수집기 2건(S)은 자료 보존 때문에 먼저 한다. |
| **완료 기준** | · 01 Temperature 에서 'Summits' 를 켜면 봉우리 마커에 '예보 N°' 가, 환산 짝이 있는 봉우리에는 '\| 환산 N°' 가 다른 배지색으로 함께 보이고, 어느 숫자에도 환산값에 OBSERVED 배지가 붙어 있지 않다.<br>· 봉우리를 누르면 Inspector 첫 행이 '아래 ○○(고도) 실측 N° → 정상 예보 N°' 이고, 예보 발표시각·유효시각·관측시각 세 줄과 '응답 ○/165곳 · 환산 짝 ○곳' 이 보인다.<br>· 차이 3°C 이상인 봉우리만 고리를 두르고, 범례에 '예보 − 고지대 실측 환산(5.5°C/km) · 우리가 정한 표시 기준' 이 적혀 있다.<br>· 등산로가 1440p 와 모바일 모두에서 2px 이상 굵기로 보이고 sac 6등급 범례에 '폐쇄·통제 미포함' 이 있다. |

<details><summary>반박 검증에서 뒤집거나 낮춘 것 (31)</summary>

- people.population — P1 → P2, '[→ 09 Terrain]' → '자리 없음 · PD 결정 필요'. 원안은 'PD 정본 09 절이 이 기법을 직접 짚는다'고 했으나 그 문장은 MAPPED.earth 칸의 서술이고(EARTHUS AFTER 칸은 데이터 모드 4개로 '단순화'), PD 의 P0/P1 목록에도 인구는 없다. 09 Terrain 콘셉트 그림(docx image10)도 고도 지형 + Elevation/Contour/Exaggeration/Hillshade 뿐이고 인구 릴리프는 그려져 있지 않다. PD 가 Terrain>Population 을 승인하면 1단계(한국 릴리프)만 P1 로 당길 수 있다고 남겼다.
- people.population — 흰 등치선(1,000·5,000·20,000) 삭제. 인구는 뾰족한 장이라 등치선이 읍마다 잔고리가 된다; 셰이더 단계색의 등급 경계가 선 역할을 한다. PD 규칙 4 의 대상 목록(온도·강수·대기질·해양 편차·위험도)에도 인구는 없다.
- people.population — 원안이 놓친 결함 4건 추가: ① '네 귀퉁이 모두 값' 면 규칙은 흩어진 농촌 칸을 지운다(숲 소실에서 이미 겪음) → '하나라도 값' 규칙 ② 밀도 환산이 중앙 위도 한 값(pop-sculpture.js:565-567) → 일본 격자 북단 −15% · 남단 +11% 오차, 행별 cos 로 ③ u8 세제곱근 양자화라 클릭값은 '약' ④ 대만 국가 격자가 없다. 또 '국가 폴리곤 위치 UNKNOWN' → 있음(data/country-reference.json, Natural Earth public domain)으로 확정하되, 구면 폴리곤 채우기는 미구현(earcut 미사용)이라 2단계는 신규 작업임을 명시.
- land.forest — 60%·80% 흰 등치선 삭제(양봉 분포 + 화면 격자 1.65km 한 화소 집기 → 색종이). '550m' 는 파일 격자이고 화면 격자는 한국 1.65km·일본 5km 이며 평균이 아니라 한 화소 집기라는 사실을 before 에 추가, 블록 평균으로 교정. 숲 릴리프 높이가 지형 과장과 연동되지 않는 고정값이라는 점(콘셉트 그림의 2x 과장에서 숲이 산보다 높아짐)을 blockers 에 추가.
- land.forest — 소실 'InstancedMesh quad 26만' 폐기(인스턴스 행렬만 약 16MB, 모바일 불가) → 기존 Points 를 네모·3단색으로, 모바일 6만 상한. Inspector '소실연도' → '평균 소실 연도'(PNG R 채널 정의). '국립공원·시도 평균 라벨'과 '시군구별 소실 표'는 경계 폴리곤이 저장소에 없어 보류 — 나라 평균·클릭 지점·반경 5km 합으로 대체.
- land.forest — 'Terrain 다섯 번째 칩' 1안을 2안으로 내림: PD 정본이 Terrain 을 4모드로 '단순화'한다고 적었고 09 그림에도 다섯 번째 모드가 없기 때문.
- land.bird_survey — 원안의 '칸×종 표 UNKNOWN'을 '없음'으로 확정: 수집기는 칸에 lat·lon·n·spc 만 쓰고(aws/ecobird/handler.py:230-234), 모아 둔 yrs 도 내보내지 않는다 → 종 필터·조사 종류·연도를 화면 범위에서 삭제하고 aws/ecobird 재집계를 별도 선행 작업으로 분리. truncated(미수신) 범례 고지와 5km 평면 칸이 과장 지형에 묻히는 문제를 추가.
- ocean.seabird — '그 해 개체수로 다시 칠한다'를 뒤집음: 수집기 스스로 조사 횟수가 해마다 2.7배 달라 원 개체수 비교는 오독이라고 적었다(aws/seabird/handler.py:205-208, :292-296) → 연도 모드 색은 '조사 1회당 개체수' + 조사 횟수 병기. 개체수 미기재 줄 제외 고지, 멸종위기 등급이 EARTHUS 채택 규칙(2줄·5%)임을 Inspector 에 표기.
- people.crowding — '이력 보관 여부 UNKNOWN'을 '있음'으로 확정(48시간 history-index + 불변 스냅샷, aws/tourism-flow/handler.py:6-7, :262-282, :381) → '지난주 대비'는 이력 저장 선행이 아니라 소규모 집계(S). STALE 원인은 스케줄(schedules.sh:64 rate 5분)보다 상류일 가능성 — 단 배포값은 UNKNOWN 으로 남김.
- people.crowding — 예측 표현을 '빗금 + 어둡게'에서 '속 빈 고리'로: 같은 파일 머리말(live-layers.js:782-783)이 이미 정해 둔 문법이고 InstancedMesh 에서 빗금 셰이더보다 싸다. livemix 배율은 넓이가 다른 두 값을 나눈 것이라 Inspector '참고'로 강등.
- ocean.sea_turtle — 'v1 로 옮기면 안전'을 뒤집음: v1 은 유료 v2 의 입구라 제4유형 '상업적 이용' 위험이 그대로다 → 기관 서면 문의 또는 REMOVE, 결정 전 신규 개발 금지. 과거 경로와 현재 수온을 겹칠 때의 시각 불일치 배지 추가. 변경금지 때문에 모바일 솎기도 불가함을 성능 항목에 명시.
- land.bird_migration — 원안이 놓친 종 색 중복(7색을 나머지 연산으로 돌림, hobby-migbird.js:18-19)을 before 에 추가하고 '상위 6종 + 기타'로 교정. 호를 도착 원 '가운데'가 아니라 테두리에서 끊도록 수정(가운데 좌표는 places.py 가 손으로 정한 값). EXPLORER '출발 시기 기온·바람 병기'는 2021~2025 출발일의 과거 관측 산출물을 확인하지 못해(UNKNOWN) 삭제 → 유료 가치 없음으로 낮춤.
- people.night_lights — size S → M: 1단계를 1a(S: picker·텍스처 재사용·폴백·Obs time)와 1b(M: 확대 스트리밍)로 쪼갬. 위성 표면 스트리밍은 Esri WebMercator 주소가 박혀 있어 GIBS EPSG:3857 에 이 층이 있는지부터 확인해야 한다(UNKNOWN). 2단계(LAADS 수치 수집)는 '자료 확보(L, 전지구면 XL)'로 분리. 텍스처 재사용 시 합성본이 '일별'로 표기되는 함정을 추가.
- people.news — PD 09-07 지시('오류부터 고치고 나머지는 기획부터, 바로 만들지 말 것')를 반영해 0단계(막대 삭제·칩, 즉시)와 1단계(네모칸 이식, 계획 승인 뒤)로 분리. v2 에 GDELT 확정 사건 로더가 없다는 사실을 추가(M 의 근거). '한국·일본 매체 먼저 추가'는 민영 언론 RSS 약관이 확인되지 않아(UNKNOWN) 공공 피드 먼저로 고침.
- travel.today_pick 외 5개 — 원 개선안을 받지 못해(입력 절단) 검증이 아니라 코드 근거 최소안을 작성. 공통으로 '대회(09-30·10-23) 전 구조 변경 동결'을 걸었고, today_pick 의 '매일 다시 점수 매깁니다'(travel.js:353)가 절반만 참이라는 점과 매일 올라오는 KTO 스윕 산출물이 화면에 연결돼 있지 않다는 점을 새로 적었다. travel.flight 는 레지스트리의 잠금 사유(프록시 필요)가 낡았고(aws/flight-track 존재) 임시 항로가 Open-Meteo 를 직호출한다는 점을 적었다.
- [서핑·낚시] 'aws/ecmwf-ingest 에 swh·mwd·mwp 를 더하는 확장이 가장 싸다'를 뒤집음 — handler.py:100 이 oper 스트림 하드코딩, :135 가 levtype=='sfc' 필터, PARAMS=['2t'], ASOS 97지점·24~120h 5스텝·eccodes find_nearest 방식이라 2,000지점×다스텝 + 해안 육지셀 결측 처리는 사실상 새 수집기다. wave 스트림에 너울 분리 변수가 있는지도 UNKNOWN 인데 서핑 판정 ①(스웰 방향 대 해변 방위)과 낚시 안전 문턱(너울 높이)은 너울 분리가 필수다.
- [서핑·낚시] 지점 전용 수집기 → '05 Ocean 파랑 프레임을 지점에서 읽기'로 구조를 바꿈 — 색면과 마커 숫자가 다른 모델에서 오면 이중 부호가 아니라 이중 진실이 된다. 파랑 자료 확보(L)는 이웃의 'GFS 확장 M'에 들어 있지 않으므로 별도 선행으로 분리하고 05 Ocean 소유로 적음. GFS-Wave 는 grib2lite.py:8 이 JPEG2000 을 거부하고 패킹 템플릿이 미확인이라 '후보'를 조건부로 낮춤.
- [서핑] 'Global Timeline 을 밀면 마커·노출이 바뀐다'에 시간 혼용 결함 — 파면 판정 바람은 AWS 현재 실측(hobby-sea-common.js:159-174)이라 그대로 두면 미래 스웰×현재 바람이 한 판정에 섞인다. offset≠0 은 GFS MODEL 바람으로 바꾸고 이안류는 '예보 없음'으로.
- [서핑] '해변마다 방위 아이콘'을 낮춤 — facing 은 271곳 중 206곳, 일본 756곳은 0곳(beaches.json withFacing). 1,027곳의 80% 가 회색 '자료 없음' 아이콘이 되는 설계라 facing 없는 곳은 숫자 원판만 찍도록 고침.
- [서핑] EXPLORER '모델 대 부이 30일 검증 이력'을 출시 혜택에서 뺌 — 그 짝을 쌓는 수집기가 없고(archiver 는 NDBC 부이·격자 스냅샷만), 지금 모델값은 Open-Meteo 라 유료 근거로 못 쓴다. 파랑 수집기 가동 30일 뒤부터.
- [서핑·낚시·패러] '12곳 제한 대신 화면 안 전부'를 조건부로 낮춤 — 라벨이 개당 텍스처+드로우콜(ext-scene.js:169-184)이고 마커 회전·아이콘 프리미티브가 없다. 공용 마커 부품(M) 선행 + 라벨 예산(≤40/≤16) 명시.
- [낚시] size M → L 로 올림 — Open-Meteo 를 떼면 핵심 숫자(조차·만조 시각)의 원천이 0 이 된다. KHOA 조석예보 수집기는 저장소 grep 0건이고 data.go.kr 건별 승인(PD 직접)이 필요하며 이 항목만 쓰는 선행이라 크기에 넣었다. 또 '조차 3.2m'를 포인트 값처럼 라벨에 쓰지 않고 '○○ 예보지점 · N km'를 의무화(서해는 수십 km 에 조차가 크게 다르다 — fishing.js 실측 주석).
- [낚시] 안전 고리 문턱은 '너울 높이' 기준(fishing.js SWELL_WATCH/DANGER, swellH) — 대체 자료가 유의파고만 주면 문턱을 슬쩍 옮기지 않고 고리를 끄도록 고침. '권역 최대 조차'가 표본 3곳의 최대(REGION_SAMPLES=3)였다는 점도 '○지점 중' 표기로 정정.
- [패러] 'GFS 0.25° 10m·850hPa'를 뒤집음 — 이웃 결정상 0.25° 불가(0.5°), 850hPa 와 GUST 는 확장 목록(TMP·UGRD/VGRD·PRMSL·APCP)에 없다. 0.5° 격자값을 산 위 활공장 값처럼 말할 수 없으므로 1차 값을 kma-aws-min 실측(ws10·wss·ta·td 모두 있음 — handler.py:49,193)으로 뒤집고, 같은 산 조건 밖이면 돌풍 고리를 그리지 않게 함.
- [패러] '구름 밑면은 ecmwf-ingest 에 2d 추가'를 철회 — 실측 ta·td 가 이미 있어 새 수집 없이 같은 Espy 식이 된다. '예보는 aws/kma-fcst'도 낮춤 — ASOS 97지점 전용이고 돌풍 항목이 없으며 KMA 허브 일일 용량을 공유한다. '10분 실측 aws/kma-aws' 지목도 정정(매분·736지점은 aws/kma-aws-min, kma-aws 는 ASOS 97 정시).
- [산 정상] '실측 1° — OBSERVED 배지'를 뒤집음 — mountain.js·mountain-verify 가 비교하는 값은 고지대 관측소 실측을 5.5°C/km 로 정상까지 끌어올린 환산값(est)이다. 환산값에 OBSERVED 를 붙이면 없는 관측을 만든 것. 관측소 원값(OBSERVED)과 환산값(EARTHUS_ANALYSIS)을 라벨에서 가름.
- [산 정상] '평지 색면과 마커 색 차이가 곧 그림 답'을 철회 — 바탕은 GFS 0.5°(봉우리를 뭉갠 모델 지형), 마커는 기상청 산악예보로 서로 다른 두 모델의 비교다. 답은 mountain.js 가 이미 내는 base/drop(산 아래 AWS 실측 대 정상 예보)을 Inspector 첫 행으로.
- [산 정상] '지금 자료로 된다'를 부분 철회 — 현재 값 그림은 되지만 타임라인은 안 된다. kma-mountain reduce_one(handler.py:144)이 항목별 가장 이른 예보값만 남긴다(UI 한계가 아니라 수집기 출력 한계). 하루 8회가 아니라 4회(schedules.sh:79)이고 허브 예산에 따라 건너뛴다 → 자료 나이 표기 추가. 검증 이력 리포트는 rows 에 유효시각·선행시간이 없어 '가장 이른 예보시각' 한정으로 문장을 좁힘.
- [산 정상] '1px 선 → 2px 리본'은 설정 변경이 아님 — WebGL 은 LineBasicMaterial.linewidth 를 무시하고 vendor 에 three-r184 단일 모듈뿐, Line2/LineMaterial 은 v2-three 전체 0건. 애드온 벤더링 또는 리본 메시(S)를 블로커로 올림. size M·priority P1 은 유지하되 '공용 마커 부품의 첫 재사용 사례 + 수집기 2건 선행'이라는 조건을 붙임.
- [해변·낚시터] '남기는 것은 좌표 목록(해변 271+일본 756, 낚시 946+일본 63)'을 정정 — ocean/surf 레이어가 읽는 것은 v2-three/data 의 한국 사본 2개뿐(live-layers.js:490-497), 일본은 v1 모듈이 따로 읽는다. 원천 2벌을 /data/ 한 벌로 합치는 일을 MERGE 범위에 넣음. 레이어 id 'ocean/surf' 는 개명하지 않는다.
- [전 항목] after 머리의 '[→ 05 Ocean]·[→ 02 Wind]·[→ 01 Temperature]' 흡수를 확정처럼 쓴 것을 'PD 결정 필요'로 낮춤 — 다섯 현상 모두 레일에 자리 없는 society 묶음이다.

</details>

### 4-6. 우주

> 검증 방법: 개선안이 인용한 파일:줄을 전부 열어 대조했다. 인용은 거의 다 맞다 — buildAurora 상대 눈금(live-layers.js:1513)·REFRESH_MIN 누락(344-350)·SWPC 직접 호출(529) / sat-layer 1,500 절단(14, 152)·군 4개(16-21)·new Date()(213) / core.js:558 거짓 머리말 vs state():428·main.js:4288 LIVE·ui-shell.js:218 / solaract 빈 Group(589)·xrayAt 미커밋 diff / buildLaunch 막대(2056-2078)·6건 절단(2091)·LL2 직접(472). PD 콘셉트 08(docx image9.png)도 직접 열어 범례 5단·토글 3개·'Kp Index' 를 확인했다.<br>> 입력 결함: 개선안 JSON 이 space.rocket_launch 의 size 에서 잘려 들어왔다. 그 항목의 size·priority·action 과, 레지스트리에 있으나 입력에 없던 3현상(space.solar_system·space.photo·space.galaxy, phenomenon-registry.js:474-557)은 검증자가 코드에서 직접 작성했다.<br>> 시안 모델 이름 점검: 콘셉트 08 에는 GFS·ECMWF·CAMS·JTWC·CMIP6 가 등장하지 않는다. 이 묶음의 원천과 aws/ 수집기 현황은 — OVATION: 수집기 없음(브라우저 직접) / Kp: lab-events 3시간 주기(리포트 안에만)·archiver 1분 추정 Kp 를 실행당 1표본 / GOES X선: ocean-solar 30분, 최신 1점만 게시 / CelesTrak: celestrak-proxy 일 1회 + space-archive 보관 / LL2: launch-feed 15분(v2 는 안 읽음) / AETHERUS 근접사건: 수동 발행, 스케줄 없음, FastAPI+Postgres. Open-Meteo 의존은 이 묶음에 없다('오늘 밤' 구름은 GFS 0.5°로 지정).<br>> 우선순위: PD 의 P0·P1 목록에 Space 는 한 줄도 없다. 그래서 P0 는 정확히 하나 — 궤도 인텔리전스의 거짓 문구 핫픽스(S)뿐이다. 오로라만 P1(구간색 공통 renderer contract 의 가장 싼 소비자 + 퍼블릭 도메인 + 08 의 주인공 그림), 나머지는 P2·P3.<br>> 재설계와 무관한 선행 핫픽스 묶음(전부 S): ① aeth-orbit 거짓 머리말·LIVE 배지(P0) ② launch LL2 직접 호출 → S3 축약본 + 어댑터 ③ ocean-solar xrayAt 수정 배포 ④ aurora 상대 눈금 → 절대 눈금 + REFRESH_MIN 추가. ②~④는 P1 초입에 묶어 처리하기를 권한다.<br>> 라이선스 관문(묶음 공통): CelesTrak(docs/master-plan-2026.md:360, research-2026-07.md:983)과 LL2(AETHERUS-PR-15:111)의 상업 이용 조건이 저장소에 미결로 남아 있다. 원자료에 과금하기 전에 소스별 라이선스 매트릭스가 선행돼야 한다. '계산에만 과금'은 완화책이지 해결이 아니다. SWPC·SDO 는 퍼블릭 도메인이라 문제없다.<br>> 셸 위반: 태양계·사진관·은하 세 장면은 지구를 가리는 전체 화면(main.js:4333-4352)이라 PD 셸(CENTER = 3D Earth)에 맞지 않고, 태양계 장면은 자체 날짜 슬라이더(solar-view.js:57)로 규칙 2 도 어긴다. 세 건 모두 'v1 무료로 보냄'을 제안하되 PD 결정 필요로 남겼다. 발사 일정과 우주쓰레기도 PD 하위 모드 3개에 이름이 없어 Satellites 안으로 MERGE 를 제안했고 PD 결정 필요다.<br>> 의존 순서: P0 셸(우측 Inspector·전역 타임라인·상시 범례) → Temperature P0 구간 LUT 셰이더 → Aurora(P1) → Satellites(P2) → Debris 칩·Events(P2) / Solar activity(P2).

#### 오로라 예보 (지금 보이는 곳) → Space › Aurora (08 의 기본 진입 모드) · `space.aurora` — 다시 만든다 · P1 · M

| | |
|---|---|
| **Before** | OVATION 1° 칸 중 확률 5% 이상인 칸마다 고정 픽셀 점(4~10px)을 찍고, 색은 '그 시각 최댓값' 상대 눈금이다(live-layers.js:1505, 1513, 1532). 조용한 날(최대 12%)과 폭풍일(최대 90%)이 같은 자홍이 된다. 재질이 AdditiveBlending(1548)이라 낮 반구에서는 씻겨 보인다. 범례·Kp·시간축이 없고 REFRESH_MIN(344-350)에 aurora 가 없어 켠 순간에 멈춘다. 브라우저가 SWPC 에서 65,160행 JSON 을 직접 받아 메인 스레드에서 돈다(529, 1499-1516). 점이 남·북 양극에 있어 coverage()(271-290)가 global:true 로 판정하므로, 저위도를 보다 켜면 화면에 아무 변화가 없다. |
| 돈 내는 사람 눈 | 전지구에서 보면 극 둘레에 초록~자홍 타원이 은은하게 일렁여 '오로라 고리'로 읽힌다 — 이 묶음에서 지구 위 그림으로는 가장 낫고, 5% 미만을 뺐다는 사실까지 카드에 적는 점이 정직하다. 다만 가까이 가면 1° 점 격자가 드러나고, 색이 몇 %를 뜻하는지 화면에 눈금이 없으며, '내가 있는 곳에서 오늘 밤 보이나'에는 답하지 않는다. (B 손보면 된다) |
| 기준 사이트 | PD 콘셉트 08(docx word/media/image9.png, 직접 열어 확인): 극 둘레를 채운 띠 + 5단 범례(≥80% 보라 · 60~80% 시안 · 40~60% 초록 · 20~40% 연두 · 0~20% 회색) + Inspector 토글 Probability/Satellites/Show Orbits + 'Kp Index [Now ▾]'. 이 시안에는 흰 등치선과 지도 위 숫자가 없다(Temperature 시안과 다르다). mapped.earth 의 SKY › Aurora 는 앞 세션 실측 메뉴에 있었으나 렌더 세부는 UNKNOWN(이번에 재검증하지 않음). windy 에는 없다. |
| **After** | [→ 08 Space · Aurora 모드. P1 핵심(M)과 P2 후속(M)으로 나눈다]<br>── P1 핵심 ──<br>1) 점 구름을 구간색 면(띠)으로: OVATION 360×181 값 텍스처(R=확률)를 극 모자 메쉬(\|위도\|≥35°)에 입히고 프래그먼트 셰이더에서 임계로 끊어 구간 LUT 로 칠한다. 일반 알파 블렌딩(Additive 폐기).<br>2) 색은 PD 범례 5단 그대로 절대 눈금: 0~20% 회색(5% 미만은 투명 + 범례에 '<5% 표시 안 함') · 20~40% 연두 · 40~60% 초록 · 60~80% 시안 · ≥80% 보라. 상대 눈금(1513) 폐기 — 어느 날이든 같은 색이 같은 확률이다. 조용한 날은 얇은 회색·연두 고리, 폭풍일은 보라 코어가 중위도로 내려온 두꺼운 띠가 된다.<br>3) 띠 경계(20·40·60·80%)는 색 구간의 경계와 같은 값이므로 별도 마칭 스퀘어 패스를 만들지 않고 셰이더 경계선(fwidth)으로 얇게 긋는다. P1 에서는 지도 위 숫자를 두지 않는다 — 정확값은 클릭 한 번 → Inspector(DoD '지도 클릭 한 번으로 정확값').<br>4) 껍질: 지형 추종 메쉬(surfR, live-layers.js:241)를 유지하되 정점 높이는 점 표본이 아니라 칸 안 최대 고도(3×3 표본 max)로 잡는다. onExaggerChanged(410-427)가 과장 변경 시 재생성한다.<br>5) 낮/밤: subsolarPoint()(main.js:85, 2868)로 터미네이터를 긋고 낮 쪽 띠는 해칭+반투명. 범례에 'OVATION 값은 낮·구름을 고려하지 않는다'. OVATION 값 자체는 바꾸지 않는다.<br>6) Kp 동시 표시(PD 수용 기준 1): Inspector 상단에 Kp 값 + 제품명 + time_tag. '3시간 Kp(관측·SWPC) 슬롯 HH–HH UTC'와 '1분 추정 Kp'를 한 라벨에 섞지 않고, 'Kp 지금'이라는 말만 단독으로 쓰지 않는다. G-scale 칩은 lab-events g_scale()(handler.py:373-374)와 같은 표. 3일 예보 막대(관측=채움, 예보=테두리, OBSERVED/OFFICIAL_FORECAST 배지). 콘셉트의 'Kp Index [Now ▾]'는 별도 시간 컨트롤이 아니라 전역 타임라인 시각의 슬롯 표시.<br>7) 클릭 → Inspector: 확률 % · '1°×1° 칸 값' · 관측 기준시각→예보 시각(+30~90분) · 그 지점 태양 고도각(계산값) · 출처 NOAA SWPC OVATION · OFFICIAL_FORECAST. Intelligence 문장은 수치·출처 아래, SWPC 발표 인용과 '함께 나타난 조건'(낮밤·구름량)만.<br>8) 켜면 카메라를 북극권이 보이는 구도로 옮기고(옮겼다는 사실을 적음) '남반구 보기' 칩을 둔다.<br>9) 범례 좌하단 상시: 5단 색 + 'Probability % · OVATION · 예보 시각 HH:MMZ · N분 전'. REFRESH_MIN 에 aurora 추가, 예보 시각이 지나면 STALE.<br>10) 서버 미러(S): SWPC 직접 호출을 S3 경유 360×181 uint8 프레임으로 바꾼다(모바일 다운로드·파싱 절감, SWPC 장애 시 직전 프레임+STALE).<br>11) Inspector 토글 Probability · Satellites · Show Orbits 는 콘셉트 그대로 — Satellites 는 기존 점 구름(sat-layer)을 그대로 켠다. 일렁임(±25%)은 View > Appearance 로.<br>── P2 후속 ──<br>보관 프레임으로 전역 타임라인 재생(프레임 없는 시각은 '이 시각 OVATION 프레임 없음 — Kp 예보만', 지어내지 않음) · 고위도 도시 숫자 핀('NN% · 1° 칸 값' 표기) · 문턱 알림 · 남북 동시 보기 · 공용 contour/label 패스가 생기면 경계 숫자 라벨. |
| 표현 | 단계색 면 (지형 추종 극 모자 메쉬 + 값 텍스처 구간 LUT + 셰이더 경계선) + DOM Inspector·범례 |
| 자료 | 기본 그림은 지금 자료로 나온다 — NOAA SWPC OVATION 전지구 1°×1° 65,160칸, 미국 정부 저작물(퍼블릭 도메인). 이 묶음에서 해상도와 라이선스가 목표 그림에 모두 충분한 유일한 현상이다. 수집기 현황(aws/ 실측): OVATION 수집기는 없다(aws/ 전체에서 'ovation' 0건, 브라우저 직접 호출) → S3 미러 신규(S). Kp 는 두 갈래로 이미 받는다 — 3시간 관측 + 3일 예보(aws/lab-events/handler.py:347-348, cron 40 */3, 산출물은 analysis/aurora-reports.json 안에만 있음)와 1분 추정 Kp(aws/archiver/handler.py:58, 247-253 → events/history.json 7일, 실행당 표본 1개). 지도용 축약본(space/kp.json 류)은 없다 → 신규(S). 재생용 프레임 보관은 0 — 미러가 돌기 시작한 날부터만 쌓인다(소급 경로 UNKNOWN). '오늘 밤' 카드의 구름은 GFS 0.5° 구름 예보(clouds/gfs-fc, 퍼블릭 도메인, MODEL 배지)를 쓴다 — GK2A 는 고위도를 못 덮고 Open-Meteo 는 쓰지 않는다. |
| 재사용 | prototype/v2-three/js/live-layers.js(fetch·meta·surfR·REFRESH_MIN·onExaggerChanged), Temperature P0 구간 LUT 셰이더(신규 공용 부품 — 아직 없음), main.js subsolarPoint()(85)·timeOffsetMs(3053), aws/lab-events/handler.py(_swpc·g_scale), aws/archiver/handler.py(Kp 시계열), clouds/gfs-fc |
| 무료 / 유료 | 무료: 구간색 띠 · 범례 · Kp(제품명·시각 포함) · 클릭 시 확률 — 그림이 완성돼 보인다. EXPLORER: 내 장소 '오늘 밤' 카드(확률 · 낮밤 · GFS 구름량을 나란히, 인과 없이), Kp 3일 예보 막대, 문턱 알림, 이미 있는 LAB 오로라 리포트(SWPC 예보를 관측 Kp 로 채점, lab-events/handler.py:379-504). PRO: 보관 프레임 재생(수집 시작일 이후만), 남·북 동시, 플레어·Kp·오로라 이벤트 타임라인(시각을 나란히 놓을 뿐 인과 단정 없음), 내보내기. |
| 걸리는 것 | · 구간 LUT 셰이더가 v2 에 없다(prototype/v2-three/js 에서 uDataTex\|uFieldTex\|uOverlay\|drape grep 0건). Temperature P0 렌더러가 먼저 만든 공용 부품을 쓰는 것이 전제다 — 오로라가 먼저 나가면 오로라가 그 부품을 만들어야 하고 size 는 M→L.<br>· P1 근거: PD 우선순위 P0·P1 목록에 Space 는 없다. 오로라만 P1 에 두는 이유는 Space 에서 유일한 '구간색 스칼라 면'이라 P1 '공통 renderer contract'의 가장 싼 두 번째 소비자이고 자료가 퍼블릭 도메인이기 때문이다. PD 가 받아들이지 않으면 P2 로 내리고, 핫픽스(절대 눈금 + REFRESH_MIN, S)만 P1 에 남긴다.<br>· 우측 Inspector·상시 범례·전역 타임라인은 P0 셸 산출물이다 — 그 전에는 기존 카드에 임시로 싣는다.<br>· OVATION S3 미러 수집기 신규(S): 프레임 크기·원천 갱신 주기는 저장소에 기록이 없다(UNKNOWN) — 구현 전 실측.<br>· Kp 제품 혼동: intel-rollup/rollup.py:126 이 archiver 의 값을 '1분 추정값'이라 부른다. 3시간 Kp 와 한 라벨에 섞으면 관측/추정 혼동이다. lab-events 는 3시간 주기라 값이 최대 3시간 묵는다 — time_tag 를 반드시 적는다.<br>· 지형 관통: lift 0.012(≈76km)는 과장 50×에서 기복 1.5km 에 해당한다 — 1° 점 표본이면 알래스카·스칸디나비아·톈산에서 산이 띠를 뚫는다 → 칸 최대 고도. 고정 반지름 껍질(airShell, 50×에서 1.0746)은 비스듬히 보는 극지에서 시차가 수백 km 라 쓰지 않는다.<br>· coverage()(live-layers.js:271-290)가 양극 모자를 global:true 로 판정한다 → 켤 때 북극권 이동을 따로 넣어야 한다.<br>· 텍스처 이음매: 경도 0/360 RepeatWrapping + 반 텍셀 보정, 위도 181행(극점 포함) UV 보정. |
| **완료 기준** | · 조용한 날(최대 12%) 프레임과 폭풍일(최대 90%) 프레임을 차례로 열면 띠의 색과 두께가 다르다 — 범례의 같은 색은 언제나 같은 % 구간이고, 구간 경계가 번짐 없이 선으로 선다. 0~20% 회색 띠가 낮·밤 양쪽에서 구별된다.<br>· Aurora 를 켜면 카메라가 북극권이 보이는 구도로 옮겨 가고, 좌하단에 5단 범례 + '<5% 표시 안 함' + '예보 시각 HH:MMZ · N분 전'이 상시 보인다. 예보 시각이 지나면 배지가 STALE 로 바뀐다.<br>· 띠 위 한 점을 클릭하면 우측 Inspector 에 확률 % · '1°×1° 칸 값' · 관측 기준시각→예보 시각 · 태양 고도각(계산값) · NOAA SWPC OVATION · OFFICIAL_FORECAST 가 뜨고, Kp 값 옆에 제품명('3시간 Kp' 또는 '1분 추정')과 time_tag 가 보인다.<br>· 지형 과장 50×에서 알래스카·스칸디나비아를 확대해도 산이 띠를 뚫고 나오지 않는다. |

#### 위성 추적 + 스타링크 → Space › Satellites (군 칩: 한국·정거장·기상·과학·항법·통신·지구관측·스타링크·전체) · `space.satellite` — 고친다 · P2 · L

| | |
|---|---|
| **Before** | THREE.Points 최대 5벌이 실척 고도에서 250ms 마다 SGP4 로 움직일 뿐이다(sat-layer.js:13, 208-229). 군은 4개뿐이고(16-21) 한국 위성군이 빠져 있으며 스타링크는 앞 1,500기만 잘라 그린다(14, 152). 전파 시각이 new Date() 고정(213)이고 onTimeOffset(main.js:4891-4899)이 satLayer 를 부르지 않아 전역 타임라인과 끊겨 있다. 지구 클릭은 raycastGlobe(main.js:2670)뿐이라 점을 집는 코드가 없다 — 선택·이름표·궤도선·상시 범례가 없다. 무료 v1 관제센터는 같은 카탈로그로 선택·검색·통과·14일 이력을 이미 한다. |
| 돈 내는 사람 눈 | 실척 고도에서 실제로 움직이는 점 구름은 정직하고, LEO 띠와 GPS 껍질이 한눈에 갈려 첫인상은 나쁘지 않다 — 이건 좋은 것이다. 그러나 어느 점이 ISS 인지 누를 수도, 이름을 볼 수도, 궤도를 볼 수도 없어 메뉴 질문 '위성은 지금 어디에 있는가'에 특정 위성 단위로는 답하지 못한다. 무료 v1 관제센터(prototype/js/spaceops — 선택·검색·아카이브 슬라이더 있음)보다 유료 v2 가 얕다. (B 손보면 된다) |
| 기준 사이트 | PD 콘셉트 08(image9.png): 위성 아이콘 + 'LEO' 꼬리표 + 얇은 흰 호. PD 08절 수용 기준: 궤도 ON/OFF·개별 선택, 선택 시 orbit/altitude/speed/next pass, 기상 지도와 모드 분리. mapped.earth 의 위성 표시는 이번 세션에서 확인하지 못했다(UNKNOWN). windy 에 없다. 내부 기준선은 무료 v1 관제센터(prototype/js/spaceops). |
| **After** | [→ 08 Space · Satellites 모드]<br>1) 실척 고도 점 구름은 유지한다(LEO 띠와 GPS 껍질이 한눈에 갈리는 지금의 장점). 그 위에 아이콘 층: 정거장·한국 위성·선택한 위성만 아이콘 + 이름표 + 궤도급 꼬리표(LEO/MEO/GEO — model.js:89 orbitClass). 막대·직하점 수직선 없음, 선택 시 지표 직하점 링만.<br>2) 클릭 선택: 클릭/탭 때만 화면 공간 최근접 탐색(전 점 투영 O(n) + 지구 뒤편 제외). 선택하면 '앞으로 1주기 경로'를 얇은 흰 선으로 그린다(trackSamples, model.js:130). 지구 고정 좌표라 닫힌 타원이 아니라 조금 어긋나는 곡선이다 — 그렇게 적는다. 'Show Orbits' 토글은 기본군(정거장·한국)의 경로를 상시 켜고 끈다.<br>3) 군 칩 다중 토글, 한국 먼저(서버 카탈로그에 이미 있음: aws/celestrak-proxy/index.mjs:30-41 GROUPS, 52-75 KOREA_NORAD). 군사·아마추어는 '더보기'.<br>4) 개수 상한: 1,500 고정 절단을 v1 의 '기기 실측 상한'으로 교체한다(prototype/js/layers/space.js:204-220, 442-470 — 맥 실측 위성 1기 0.00614ms, 스타링크 10,776기 66ms, 전체 16,123기 99ms, 폰은 3~5배 느림 → 틱 예산 8ms, CAP_MIN 400). 상한에 걸리면 경사각·고도 껍질이 고루 남게 층화 추출하고 범례에 '전체 N기 중 M기 표시(기기 실측 예산)'. N등분 돌려 갱신은 쓰지 않는다 — 점마다 최대 한 바퀴만큼 묵은 자리가 되어 '적힌 시각의 위치'가 아니게 되고 지역 확대에서 떨린다. 전체 껍질을 다 그리는 길은 Web Worker SGP4(데스크톱, P2 후속)다.<br>5) 색 기준 칩 '군별 \| 고도별'(<600 · 600~1,200 · 1,200~2,000 · MEO · GEO · HEO 구간색).<br>6) 범례 좌하단 상시: 군별 색 점과 기수 + '위치 = 공식 궤도요소의 SGP4 계산값(관측 아님) · 카탈로그 시각 · N시간 전'.<br>7) Inspector: 이름 · NORAD · 군 · 운용국 / 고도 km · 속도 km/s · 직하점 / 경사각 · 주기 · 근·원지점 / 요소 epoch 나이 / 출처 CelesTrak GP+SATCAT / 배지 DERIVED. '다음 통과'는 passesOver(model.js:397)가 기하 통과(고도각≥10°)만 계산한다 — 라벨을 '머리 위 통과(기하) — 위성 조명·하늘 밝기·구름 무관, 육안 가시 여부 아님'으로. 정지궤도는 '항상 같은 자리'. 검색은 model.js:504 search.<br>8) 시간축: satLayer.update 의 시각을 Date.now()+timeOffsetMs 로 바꾸고 onTimeOffset 에 연결한다. 요소 epoch 에서 멀어지면 점을 흐리게 + '요소 나이 N일 — 정밀도 저하'. 과거 날짜 재생(보관 카탈로그)은 P2 후속(Pro).<br>9) 모드 분리(PD 수용 기준 4): Space 진입 시 기상 색면 라디오 해제, 구름·야경 같은 View 요소는 유지. |
| 표현 | 아이콘/마커 (Points 구름 + 아이콘·이름표 + 1주기 경로 Line + 직하점 링 + DOM Inspector) |
| 자료 | 지금 자료로 된다. celestrak/catalog.json.gz(하루 1회, 1.59MB gzip)에 korea·comm·earth·all 이 이미 있는데 v2 가 읽지 않을 뿐이다(v1 과 같은 파일, 추가 수집 없음). 경로·통과는 브라우저 SGP4 계산이라 서버 추가가 없다. 과거 재생·이력은 aws/space-archive 가 이미 쌓는다(celestrak/archive/dt=…/catalog.json.gz 일별, celestrak/history-14d.json.gz — handler.py 머리말). 라이선스: CelesTrak 재배포·상업 조건은 저장소 문서가 '소스별 라이선스 매트릭스 작성 후 유료화 [확인 필요]'로 남겨 두었다(docs/master-plan-2026.md:360, docs/research-2026-07.md:983) — 미결. |
| 재사용 | prototype/v2-three/js/sat-layer.js(점·SGP4 유지), prototype/js/spaceops/model.js(머리말 1행 'Cesium·DOM 없음': passesOver·trackSamples·elementsOf·orbitClass·search·historyOf·historyTrend·classify, satellite.js 는 setSatLib 로 주입), prototype/js/layers/space.js(기기 실측 상한 로직), aws/celestrak-proxy/index.mjs, aws/space-archive/handler.py, main.js timeOffsetMs·onTimeOffset |
| 무료 / 유료 | 무료: 군 칩 · 점 구름 · 정거장/한국 위성 이름표 · 클릭 시 이름·고도·속도 · 범례. EXPLORER: 머리 위 통과(내 장소), 궤도요소·요소 나이·출처 전체, ISS·천리안 통과 알림, 저장 목록(PD 08 'Explorer: Aurora/satellite overview'). PRO: 14일 궤도 이력·근지점 추세(model.js:462-481), 보관 카탈로그로 과거 시각 재생, 근접사건 타임라인(orbital_debris 후속과 합침), CSV(PD 08 'Pro: orbit analysis·event timeline'). 라이선스가 풀리기 전에는 원자료가 아니라 EARTHUS 계산에만 과금한다 — 이것은 완화책이지 해결이 아니다. |
| 걸리는 것 | · PD 우선순위 P0·P1 목록에 Space 가 없고 크기가 L 이다 → P2. 그때까지 기존 점 구름은 Space 모드 안에서 그대로 동작하고, Aurora 의 Satellites 토글이 이것을 켠다. 단 timeOffset 연결과 'Space 진입 시 기상 색면 해제'는 P0 셸 작업에 같이 들어가야 한다(S).<br>· CelesTrak 재배포·상업 조건 미확인(docs/master-plan-2026.md:360) — 유료 전환 전에 라이선스 매트릭스가 선행돼야 한다. 대체 경로(Space-Track 등)의 약관은 UNKNOWN.<br>· 성능: v1 이 실측으로 확인한 '이 앱 최악의 발열 경로'(space.js:205)다. 기기 실측 상한 없이 1,500 절단만 없애면 폰 메인 스레드가 포화된다. 모바일 기본은 스타링크/전체 칩 off.<br>· 점 선택 코드가 없다(raycastGlobe 만 있음). sizeAttenuation:false 점은 THREE.Points 기본 raycast 임계(월드 단위)가 맞지 않는다 → 화면 공간 탐색 신규.<br>· 의존: 우측 Inspector·전역 타임라인(P0 셸). |
| **완료 기준** | · 위성 하나를 클릭(모바일 탭)하면 Inspector 에 이름·NORAD·고도 km·속도 km/s·요소 epoch 나이·DERIVED 가 뜨고, 앞으로 1주기 경로(지구 고정 좌표)가 얇은 흰 선으로 그려진다. 지구 뒤편 위성은 집히지 않는다.<br>· '머리 위 통과' 칸에 시작/최고/끝 시각·방위와 함께 '기하 통과(고도각≥10°) — 육안 가시 여부 아님' 문구가 붙고, 정지궤도 위성은 '항상 같은 자리'로 나온다.<br>· 스타링크/전체 칩을 켜면 범례에 '전체 N기 중 M기 표시(기기 실측 예산)'가 뜨고, 폰에서 지구를 돌려도 끊기지 않는다.<br>· 전역 타임라인을 +3시간으로 밀면 위성 점과 ISS 이름표가 함께 움직이고 Space 전용 슬라이더는 생기지 않는다. Space 에 들어가면 기온 등 기상 색면이 꺼진다. |

#### 궤도 인텔리전스 (우주쓰레기·근접사건) → [확정 범위: 0단계 거짓 문구 핫픽스] · 최종 자리는 Space › Satellites 의 'Debris' 칩 + 'Events: 근접사건' · `space.orbital_debris` — 합친다 · P0 · S

| | |
|---|---|
| **Before** | 운영 스냅샷이 묵어(2026-09-04 발행, 요소 상한 7일 — core.js:50 MAX_ELEMENT_AGE_S) 지구에 0기를 그린다. 그런데 카드 머리말은 '…기를 지금 자리에 그렸습니다'라고 말한다 — core.js:558 이 shownN=this.entries.length 를 positionsUsable() 와 무관하게 쓰기 때문이고, 같은 파일의 state()(428)는 올바르게 0 을 쓴다. 올바른 '위치 비표시' 문구는 접힌 details 안에만 있다(462-464, 572). 배지는 LIVE 고정(main.js:4288), 메뉴 출처는 'AETHERUS API · 서버 SGP4'(ui-shell.js:218), 나이는 '약 N시간 전'(core.js:451-452). 발행은 127.0.0.1:8000 의 FastAPI 를 부르는 수동 스크립트다(tools/publish-aetherus-snapshot.sh:25). |
| 돈 내는 사람 눈 | 켜면 지구에는 아무 변화가 없는데 카드 첫 줄은 '지구 둘레를 도는 물체 500기를 지금 자리에 그렸습니다'라고 말하고 배지는 LIVE 다. 돈 내는 사람 눈에는 고장이거나 거짓말이다. 설계 자체(나이 상한을 넘기면 위치를 안 그린다, 쉬운 말 요약+접이식 근거 카드)는 이 묶음에서 가장 정직하고 잘 만든 것인데, 발행이 멈춰 그 장점이 전부 묻혔다. (D 망가져 보인다) |
| 기준 사이트 | 기준 사이트에 없음(EARTHUS 고유). PD 08 의 'Pro: orbit analysis·event timeline'에 가장 직접 닿지만, PD 하위 모드 3개(Aurora/Satellites/Solar activity)에 이 현상의 이름은 없다. |
| **After** | [확정 범위 = 0단계 핫픽스(S·P0)뿐이다. 최종 자리는 Space › Satellites 로 MERGE — PD 하위 모드에 이름이 없으므로 PD 결정 필요]<br>0단계(즉시, 재설계와 무관):<br>- positionsUsable() 이 false 면 카드 첫 줄을 '위치 표시 안 함 — 스냅샷 N일 전(상한 7일)'로 바꾼다(core.js:558-564 가 state():428 과 같은 값을 쓰게).<br>- 배지 LIVE → STALE/SNAPSHOT(main.js:4288).<br>- 메뉴 출처 '발행 스냅샷 · 브라우저 SGP4'(ui-shell.js:218).<br>- 자료 나이는 'N일 전'(core.js:451-452).<br>- 자료가 묵은 동안 메뉴 칩을 회색 '자료 묵음'.<br>돈 내는 사람에게 보이는 거짓말을 먼저 없애는 단계다.<br>후속 1단계(M·P2, Satellites 개편에 얹음): 'Debris' 칩 — 같은 선택·경로·Inspector. 기호는 v1 규약(model.js:30-39 KIND: 위성 ● · 로켓바디 ▲ · 파편 ◆), 운용 위성 하늘색·파편 주황, 범례 상시. 파편 행은 celestrak/catalog.json.gz 에 합치지 않고 별도 파일로 둔다 — v1 도 받는 1.59MB 파일을 불리지 않는다.<br>후속 2단계(L~XL·P2, PD 비용 결정 뒤): 근접사건을 Hazards 식 event-first 로 — 목록에서 고르면 카메라가 그 짝으로 가고 전역 타임라인이 TCA 로 옮겨 가며 두 경로·최근접 링·거리 'N.N km' 라벨. Inspector 에 두 물체·최근접 거리·상대속도·TCA·스크리닝 시각·출처. 충돌확률은 계산하지도 말하지도 않는다(model.js:9-10). 발행이 자동화되기 전에는 Pro 가치로 내세우지 않는다.<br>밀도: 지구 위는 점 구름, Inspector 에 고도 50km 구간별 물체 수 히스토그램 — 표본이면 '표본 N기' 명시. |
| 표현 | DOM 카드 문구·배지 수정(0단계) → 후속: 아이콘/마커 (Satellites 렌더러 공용 ●▲◆ + 근접 짝 연결·최근접 링) |
| 자료 | 0단계는 자료가 필요 없다. 1단계: aws/celestrak-proxy 에 파편 그룹 추가(일 1회) — 그룹 슬러그는 UNKNOWN(구현 전 실측), 오래된 파편운은 이미 대부분 재돌입했을 수 있다(확인 필요). 2단계: 근접사건은 AETHERUS 서비스의 스크리닝 산출물이고, 그 서비스는 FastAPI + DB 다(services/aetherus-orbital: Dockerfile·docker-compose.yml·.env 의 DATABASE_URL postgresql) — Lambda 하나로 옮길 물건이 아니다. 일 1회 컨테이너 배치 + DB 는 월 고정비가 생기는 PD 결정이다. aws/ 에 스케줄 없음(aws/space-archive/handler.py 머리말: '발행 스냅샷은 여기서 새로 만들지 않는다'). CelesTrak SOCRATES 대체는 이용 조건 UNKNOWN. 라이선스는 위성 항목과 같다. |
| 재사용 | prototype/js/aetherus/core.js(나이 상한·근거 카드 규율 유지, state():425-446 의 올바른 분기), prototype/js/aetherus/layer-three.js, prototype/js/spaceops/model.js(classify·closestApproach·closeApproaches·fromAetherus), aws/celestrak-proxy/index.mjs, aws/space-archive/handler.py(근접사건 시간별 보관), tools/publish-aetherus-snapshot.sh |
| 무료 / 유료 | 0단계에는 과금 포인트가 없다 — 과금 전제 조건이다. 후속: 무료 Debris 칩 점 구름·범례·자료 나이 / EXPLORER 선택 물체 정보·출처 / PRO 근접사건 타임라인·TCA 재생·감시 알림·내보내기. 묵은 스냅샷 위에 과금하면 지금의 거짓말이 유료로 옮겨 갈 뿐이다. |
| 걸리는 것 | · 이 항목의 S·P0 는 0단계만이다. 1단계(M)·2단계(L~XL)를 P0 로 읽으면 안 된다 — Satellites 개편(L·P2)과 발행 자동화에 의존한다.<br>· core.js 는 v1·v2 공용이다(카드 머리말 주석 '세 지구가 같은 글을 쓴다', 448) — 핫픽스는 v1 에도 같이 나간다. 배포는 v1→v2 순서.<br>· 2단계 실행 환경: FastAPI + Postgres 컨테이너 배치는 PD 비용 결정. AETHERUS 패키지 자체가 아직 인수 완료 상태가 아니다(메모리: NOT ACCEPTED 기준선).<br>· 파편 그룹 슬러그·SOCRATES 이용 조건 UNKNOWN. CelesTrak 라이선스 매트릭스 미결(docs/master-plan-2026.md:360).<br>· 독립 메뉴 폐지 여부는 PD 결정 필요(PD 하위 모드 3개에 이름 없음). |
| **완료 기준** | · 스냅샷이 7일을 넘은 상태에서 레이어를 켜면 카드 첫 줄이 '위치 표시 안 함 — 스냅샷 N일 전(상한 7일)'이고 '…기를 지금 자리에 그렸습니다' 문장이 나오지 않는다.<br>· 같은 상태에서 배지는 LIVE 가 아니라 STALE(또는 SNAPSHOT)이고 메뉴 출처 줄은 '발행 스냅샷 · 브라우저 SGP4'다.<br>· 자료 나이가 '약 390시간 전'이 아니라 'N일 전'으로 적히고, 묵은 동안 메뉴 칩이 회색 '자료 묵음'으로 보인다. |

#### 오늘의 태양 (실황 관측) → Space › Solar activity (우주기상: X선·Kp·SDO) · `space.solar_activity` — 고친다 · P2 · M

| | |
|---|---|
| **Before** | 지구 위에는 아무것도 그리지 않는다(빈 THREE.Group, live-layers.js:589). 우측 카드에 SDO 193Å 사진 1장과 X선 등급 한 줄만 있다(metaSolarAct 1245-1275 — 결측 0 을 'A'로 바꾸지 않는 규율은 이미 있다). 시계열·Kp·자동 갱신(REFRESH_MIN 에 solaract 없음)이 없다. 관측 시각 xrayAt 를 싣는 수집기 수정은 작업 트리에만 있고 미커밋·미배포다(git diff aws/ocean-solar/handler.py: +14 −4). |
| 돈 내는 사람 눈 | 우주 레이어를 켰는데 지구는 그대로고 오른쪽에 태양 사진 한 장과 등급 한 줄이 뜬다. 사진은 진짜 관측이고 결측을 '조용함'으로 꾸미지 않는 점은 좋다. 하지만 '그래서 지금 태양이 평소보다 센가, 나한테 무슨 영향이 있나'를 볼 그래프도 이력도 없어 무료 NOAA 페이지보다 나을 것이 없다. (C 빈약하다) |
| 기준 사이트 | 기준 사이트에 없음(EARTHUS 고유). PD 08절 AFTER 가 'Aurora / Satellites / Solar activity 를 하위 모드로 둔다'고 이름을 명시했으므로 자리는 있다. 콘셉트 이미지에는 이 모드의 화면이 없다. |
| **After** | [→ 08 Space · Solar activity 모드. 기존 카드의 결측 규율과 자료 배관은 유지, Inspector 만 새로 짠다]<br>1) 지구 위: 값을 만들지 않는 범위에서만 — 태양 직하점 마커와 낮/밤 경계선(subsolarPoint, main.js:85 — '계산값' 표기). 색으로 칠한 면은 두지 않는다. R-scale 배지는 X선 등급에서 우리가 환산해 붙이지 않는다 — SWPC 가 발표하는 공식 R/S/G 현재값을 수집기가 받을 때만 'SWPC 발표 R2 · 시각'으로 인용한다(그 전에는 배지 없음).<br>2) 본체는 Inspector:<br>- X선 플럭스 6시간 시계열, 로그축 + 등급 구간 배경 띠(A<1e-7 · B · C 1e-6~ · M 1e-5~ · X ≥1e-4 W/m² — 수집기 handler.py 의 등급 경계와 같은 값). 구간형이라 그라데이션이 없고 B3.7 과 M5 의 차이가 띠 높이로 보인다.<br>- 현재 등급 큰 숫자 + 관측 시각(xrayAt) + OBSERVED.<br>- 0 채움 결측 표본(실측 6시간 358줄 중 44줄)은 선을 끊는다.<br>- 그 아래 Kp 막대 — Aurora 와 같은 부품·같은 규칙(제품명·time_tag, 관측=채움·예보=테두리).<br>- SDO 193Å 사진은 누르면 원본 확대.<br>3) 연쇄 이동 칩 'Aurora 에서 보기 →'·'Satellites 에서 보기 →'는 모드 이동만, 인과 문장 없음(§C-2). Intelligence 칸은 수치·출처 아래 SWPC 발표문 인용만.<br>4) 시간축: 전역 타임라인 시각을 그래프 위 세로선으로. 전용 슬라이더 없음.<br>5) REFRESH_MIN 에 solaract 30(서버 30분 주기와 같다 — 비용 감사 실측 30일 1,461회). |
| 표현 | DOM 카드 (Inspector 시계열·구간 띠 차트) + 지구 위 직하점 마커·터미네이터 선 |
| 자료 | 절반은 지금 자료로 된다. 서버가 GOES X선 6시간 피드를 이미 받는데(aws/ocean-solar/handler.py:50, 448) meta.json 에 최신 1점만 싣는다 → solar/xray-6h.json 저장 추가(S). 먼저 미커밋 xrayAt 수정을 배포한다. Kp 는 Aurora 항목의 축약본을 같이 쓴다. EXPLORER '7일 이력'은 archiver 의 events/history.json 으로 만들면 안 된다 — 실행당 표본 1개(시간 단위, handler.py:431-436)라 몇 분짜리 플레어 정점을 놓친다 → SWPC 의 1분 7일 X선 피드/플레어 목록 수집 추가(URL·형식 UNKNOWN, 실측 필요). 공식 R/S/G 현재값 피드도 수집기가 없다(UNKNOWN, 실측 필요). 낮 반구 면 칠하기(D-RAP)는 수집기·형식 모두 UNKNOWN — 이번 범위에서 뺀다. 라이선스: NOAA SWPC·NASA SDO 는 미국 정부 저작물(퍼블릭 도메인, 'NASA/SDO' 표기). |
| 재사용 | aws/ocean-solar/handler.py, aws/lab-events/handler.py(_swpc·g_scale), prototype/v2-three/js/live-layers.js(metaSolarAct 1245-1275 결측 규율), main.js subsolarPoint(), Aurora 의 Kp 막대 부품 |
| 무료 / 유료 | 무료: 현재 등급 · 6시간 X선 그래프 · SDO 사진 · Kp(제품명·시각). EXPLORER: 7일 이력(1분 피드 수집 뒤), M급 이상·Kp≥5 알림, 짧은 리포트(관측값 + SWPC 발표 인용). PRO: 플레어·Kp·오로라 프레임을 한 타임라인에 나란히 되감는 이벤트 타임라인, 내보내기. 돈을 받을 이유가 약한 모드다 — Aurora 와 묶어 판다. |
| 걸리는 것 | · 미커밋·미배포: aws/ocean-solar/handler.py 의 xrayAt·'값 있는 최신 표본' 수정이 작업 트리에만 있다 — 배포 전에는 관측 시각을 못 적는다(S, 선행).<br>· 의존: 우측 Inspector(P0 셸)와 Aurora 의 Kp 축약본·막대 부품.<br>· R-scale 을 X선 등급에서 직접 환산해 지구에 붙이는 것은 기관 발표와 우리 파생을 섞는 일이다 → 공식 R/S/G 피드를 받을 때까지 배지 없음. 피드 URL·형식은 저장소 밖(UNKNOWN).<br>· 7일 이력의 자료원: archiver 시간 표본은 플레어 정점을 놓친다 → 1분 7일 피드 수집 추가(S~M)가 EXPLORER 기능의 전제. |
| **완료 기준** | · Inspector 의 6시간 X선 그래프가 로그축 + A/B/C/M/X 배경 띠로 그려지고, 결측 구간은 선이 끊기며 0 으로 내려가지 않는다.<br>· 현재 등급 옆에 관측 시각(xrayAt)과 OBSERVED 배지가 있다 — 수집 실행 시각이 관측 시각 자리에 오지 않는다.<br>· 지구 위에는 태양 직하점 마커와 낮/밤 경계선만 '계산값' 표기와 함께 그려지고 색으로 칠한 면이 없다. R-scale 배지는 SWPC 공식값을 받은 경우에만 기관명·시각과 함께 뜬다.<br>· 전역 타임라인 시각이 그래프 위 세로선으로 표시되고, 이 모드 전용 슬라이더가 없다. |

#### 발사 일정 (세계 로켓) → Space › Satellites 안의 'Events: 발사' 목록 (PD 결정 필요) · `space.rocket_launch` — 합친다 · P2 · M

| | |
|---|---|
| **Before** | 발사대마다 수직 LineSegments 막대 1개(길이 0.012~0.032 단위 ≈ 76~204km)와 점 1개를 그린다(live-layers.js:2056-2078) — PD 가 지목한 막대기 기호다. 같은 발사장의 발사들은 완전히 겹친다. T-마이너스는 카드를 만든 순간의 문자열로 멈춰 있고 목록은 6건에서 잘린다(2084-2099). 브라우저가 LL2 를 직접 호출한다(471-472) — 서버 축약본 수집기 머리말이 '사용자가 몇 명만 돼도 목록이 통째로 비었다(실측 429)'고 적은 바로 그 경로다(aws/launch-feed/handler.py:4-5). |
| 돈 내는 사람 눈 | 지구 위에 짧은 막대 몇 개가 서 있는 것이 전부다 — PD 가 싫다고 지목한 '막대기 기호' 그대로다. 카드의 T-마이너스 목록과 '발사장 보기' 버튼은 쓸모 있지만, 카운트다운이 켠 순간에 멈춰 있고 발사가 어디로 날아가는지는 전혀 보이지 않는다. (C 빈약하다) |
| 기준 사이트 | 기준 사이트에 없음(EARTHUS 고유). 구조는 event-first(사건 수 배지 → 목록 선택 → 지도)를 따른다. 무료 v1 관제센터에 이미 더 깊은 발사 기능(진행 중·과거·중계·저장)이 있다. |
| **After** | [→ 08 Space · Satellites 모드의 'Events' 목록(발사 · 근접사건)으로 MERGE — PD 하위 모드 3개에 이름이 없음 · PD 결정 필요(대안: v1 무료로 보냄)]<br>0) 선행(S, 재설계와 무관하게 먼저): LL2 직접 호출을 events/launches.json(aws/launch-feed, 15분, 진행 중·중계 포함)과 events/launches-recent.json 으로 교체. URL 만 바꾸는 일이 아니다 — 축약본은 compact()(handler.py:96-110)가 id/name/net/lat/lon… 으로 편 형식이고 buildLaunch/metaLaunch 는 원본 LL2 모양(r.pad.latitude · r.status.abbrev · r.launch_service_provider.name)을 읽는다 → 어댑터 필요.<br>1) 막대를 없앤다. 발사장은 지표 링 마커 + 임박도 5단 구간색(T-24h 이내 · 1~3일 · 3~7일 · 7~14일 · 14일+). 같은 발사장의 발사는 링 하나 + 숫자 배지('3').<br>2) 발사 전 궤적선은 기본으로 그리지 않는다. orbit-math.js groundTrack(68-87)은 asin 으로 상승(북행) 가지만 고르고 하강 발사를 다루지 않는다 — 남쪽으로 나가는 SSO 발사나 남동쪽으로 나가는 발사장에서는 선이 반대로 그려진다. LL2 는 경사각도 방향도 주지 않으므로 이 선은 '없는 값'이다. 대신 Inspector 에 '궤적 그리지 않음 — 발사 방향 자료 없음'을 적고, 발사 뒤 카탈로그에 등재되면 'Satellites 에서 실제 궤도 보기 →'(등재 뒤에만)를 띄운다. PD 가 근사 궤적을 원하면 정거장행(exact:true — ISS 51.6°·톈궁 41.5°)에 한해, 실제 발사와 방향을 눈으로 대조한 발사장만 허용 목록에 올리고 '근사 · 방향 가정' 배지를 붙인다.<br>3) 전역 타임라인 범위 안의 NET 에 눈금(◆). '지금'에서는 1초 tick 카운트다운 — 캐시된 HTML 고정(live-layers.js:292-295)은 폐기.<br>4) Inspector: 발사체 · 기관 · 발사장 · NET(KST/UTC) · 상태(model.js:247-251 launchStatus) · 목표 궤도 종류 · 공식 중계 링크 · '발사기관 발표 NET — 자주 바뀜' · 출처 LL2 축약본 · 받은 시각 · OFFICIAL_FORECAST. 목록 30건 전부.<br>5) 발사 뒤 결과(성공/실패) 표시는 launches-recent.json 으로. |
| 표현 | 아이콘/마커 (지표 링 + 숫자 배지 + 타임라인 눈금 + DOM Inspector) — 발사 전 궤적선 없음 |
| 자료 | 지금 자료로 된다 — v2 만 안 쓰고 있다. events/launches.json(15분)·events/launches-recent.json(과거 20건, 1시간 TTL — handler.py:36-45). 시간별 보관은 aws/space-archive. 라이선스: LL2 의 캐시·표시·상업 이용 권리 검토가 미결이다(docs/AETHERUS-PR-15-LAUNCH-MOMENT-CAPSULE-2026-08-31.md:111) → 유료 핵심 그림으로 세우지 않고 무료 층에 둔다. LL2 이미지는 지금처럼 싣지 않는다(handler.py:17). |
| 재사용 | aws/launch-feed/handler.py(events/launches.json), prototype/js/spaceops/model.js(fromLaunch·launchStatus·fmtTPlus·readSavedLaunches), prototype/v2-three/js/live-layers.js(metaLaunch 문구), prototype/js/layers/orbit-math.js(PD 가 근사 궤적을 택할 때만 — i18n.js import 의존 있음) |
| 무료 / 유료 | 무료에서 전부 보인다(일정 · 카운트다운 · 발사장 · 중계 링크) — 유입용 메뉴다. EXPLORER: 저장·T-1h 알림(v1 관제패널 규칙과 같게: 무료 3건). PRO: 따로 없음 — Satellites 이벤트 타임라인에 함께 실린다. 과금 포인트로 삼지 않는다. |
| 걸리는 것 | · 입력 개선안 JSON 이 이 항목의 size 에서 잘려 들어왔다 — size·priority·action 은 검증자가 정했다.<br>· 피드 교체(S)는 P2 를 기다리지 말고 먼저 한다: 유료 사용자가 늘수록 이 메뉴가 429 로 가장 먼저 빈다. 어댑터가 필요하다(위 0).<br>· 발사 방향 자료 없음: orbit-math.js 는 상승 가지만 계산한다(하강·방향 처리 코드 0건). 허용 목록 없이 궤적을 그리면 '없는 값 생성'이다.<br>· LL2 상업 이용 권리 미결(AETHERUS-PR-15:111) → 무료 층 고정.<br>· 독립 메뉴 폐지 vs v1 로 보냄: PD 결정 필요. 의존: Satellites 모드(L·P2)·전역 타임라인(P0 셸). |
| **완료 기준** | · 같은 발사장의 발사 3건이 지표 링 하나 + 숫자 배지 '3'으로 보이고 수직 막대가 없다.<br>· '지금'에서 T- 카운트다운이 1초마다 줄고, 목록이 30건 전부 보이며, 출처 줄이 'LL2 축약본 · 받은 시각 HH:MM'이다.<br>· 발사를 선택하면 Inspector 에 발사체·기관·발사장·NET(KST/UTC)·상태·중계 링크·'발사기관 발표 NET — 자주 바뀜'이 뜨고, 방향 근거가 없는 발사에는 궤적선 대신 '궤적 그리지 않음 — 발사 방향 자료 없음'이 적힌다. |

#### 오늘의 태양계 → PD 레일에 자리 없음 · v1(무료)로 보냄 제안 (PD 결정 필요) · `space.solar_system` — 옮긴다 · P3 · S

| | |
|---|---|
| **Before** | 메뉴를 누르면 서랍을 닫고 지구를 가리는 전체 화면 장면(SolarView)이 열린다(main.js:4340-4345). 행성 위치는 NASA/JPL 근사 궤도요소를 기기에서 계산한 값(DERIVED)이고 거리·크기는 로그 압축한 표현값이다(solar-view.js:1-4, 24-27). 장면 안에 전용 날짜 슬라이더(−365~+365일, solar-view.js:57)가 있다. |
| 돈 내는 사람 눈 | 행성 8개가 오늘 위치에 텍스처 입고 떠 있고, 이름을 누르면 지구까지 거리·빛 이동시간이 나오며, 날짜를 밀면 행성이 움직인다 — 기본 그림으로는 완성돼 보이고 표현값/실제값 고지도 정직하다. 다만 토성에 고리가 없고 달이 없으며, 가까이 당기면 512px 텍스처가 뭉개진다. 한 번 둘러보면 더 할 것이 없다. (B 손보면 된다) |
| 기준 사이트 | 기준 사이트에 없음. PD 08 하위 모드는 Aurora / Satellites / Solar activity 셋뿐이다. |
| **After** | [PD 좌측 레일·Space 하위 모드에 자리 없음 · PD 결정 필요] 지구를 대체하는 전체 화면 장면은 PD 셸(CENTER = 3D Earth + data field)에 맞지 않고, 전용 슬라이더는 규칙 2(메뉴별 슬라이더 금지)에 어긋난다. 제안: v2 현상 메뉴에서 빼고 v1(무료·교육)로 보낸다 — v1 에 같은 계열 원본(cosmic3d)이 lazy 로 이미 있다(prototype/js/main.js:92, 185). 삭제가 아니라 이동이다. 대안: v2 셸 바깥 'More › 우주 교육 장면' 보조 서랍에 링크만. 어느 쪽이든 Space 레일에는 세 모드만 남긴다. 과금 포인트 없음. |
| 표현 | DOM·별도 장면 (지구 셸 밖) |
| 자료 | 추가 자료 없음 — 번들 내 kepler.js 계산. |
| 재사용 | prototype/v2-three/js/solar-view.js · kepler.js(그대로), v1 prototype/js/space/cosmic3d.js |
| 무료 / 유료 | 없음 — 무료 교육 장면. 유료 깊이(시간축·비교·보고서)를 걸 값이 없다. |
| 걸리는 것 | · 입력 개선안 JSON 이 절단돼 이 현상의 항목이 없었다 — 검증자가 레지스트리(phenomenon-registry.js:546-557)와 코드에서 직접 작성.<br>· 행선지(v1 / 보조 서랍 / 삭제)는 PD 결정 필요. |
| **완료 기준** | · Space 레일의 하위 모드가 Aurora / Satellites / Solar activity 셋뿐이고 '오늘의 태양계'는 PD 가 정한 자리(v1 링크 또는 More 서랍)에서만 열린다.<br>· 장면을 열었다 닫으면 지구 카메라·전역 타임라인·Inspector 상태가 그대로 돌아오고, 지구 셸 안에는 이 장면의 날짜 슬라이더가 남아 있지 않다. |

#### 우주 사진관 59점 → PD 레일에 자리 없음 · v1(무료)로 보냄 제안 (PD 결정 필요) · `space.photo` — 옮긴다 · P3 · S

| | |
|---|---|
| **Before** | 전체 화면 천구 장면(SkyView)이 지구를 가린다(main.js:4347-4352). HST·JWST 공식 공개 사진 59점을 SIMBAD 적경·적위 방향에 놓고, 배경 별은 장식이라고 카드에 적는다(sky-view.js:1-5). 2026-08-14 에 만든 고정 카탈로그다(phenomenon-registry.js:506) — 시간축·값·비교가 없다. |
| 돈 내는 사람 눈 | 사진을 나열하지 않고 실제 하늘 방향에 걸어 둔 발상이 좋고, 크레딧·이용 조건·좌표 출처까지 다 달려 있어 신뢰가 간다. 그러나 사진이 세로 300px 썸네일이라 제임스 웹 사진의 값어치인 디테일을 앱 안에서 볼 수 없고(원본은 외부 링크), 별자리 기준이 없어 '하늘 어디'라는 감각은 실제로는 잘 안 생긴다. (B 손보면 된다) |
| 기준 사이트 | 기준 사이트에 없음. PD 08 하위 모드에 이름 없음. |
| **After** | [PD 레일·Space 하위 모드에 자리 없음 · PD 결정 필요] 제안: v1(무료)로 보낸다 — v1 cosmic3d 에 사진 아틀라스 진입점이 이미 있다(prototype/js/main.js:298-300 openPhotoAtlas). 대안: 'More' 보조 서랍 링크. Space 레일에는 세 모드만 남긴다. 과금 포인트 없음. |
| 표현 | DOM·별도 장면 (지구 셸 밖) |
| 자료 | 추가 자료 없음 — 번들 assets/skyphotos/catalog.json. 사진별 출처·라이선스 표기는 기존 카드 규율 유지. |
| 재사용 | prototype/v2-three/js/sky-view.js(그대로), v1 cosmic3d 사진 아틀라스 |
| 무료 / 유료 | 없음 — 무료 교육·감상 장면. |
| 걸리는 것 | · 입력 개선안 JSON 절단으로 항목이 없었다 — 검증자가 직접 작성.<br>· 행선지는 PD 결정 필요. |
| **완료 기준** | · Space 레일에 '우주 사진관'이 없고, PD 가 정한 자리(v1 링크 또는 More 서랍)에서 59점이 그대로 열린다.<br>· 장면을 닫으면 지구 카메라·타임라인·Inspector 상태가 그대로 돌아온다. |

#### 우리은하 — 우리는 어디 있나 → PD 레일에 자리 없음 · v1(무료)로 보냄 제안 (PD 결정 필요) · `space.galaxy` — 옮긴다 · P3 · S

| | |
|---|---|
| **Before** | 전체 화면 장면(GalaxyView)이 지구를 가린다(main.js:4333-4338). 별 배치는 관측된 구조 수치(지름 10만 광년 · 태양까지 26,000광년 · 나선팔 4개)에 맞춘 재구성 도식이고 그 사실을 화면과 카드에 적는다(galaxy-view.js:1-6, 레지스트리 VISUALIZATION_ONLY :481). 자료 갱신·시간축이 없다. |
| 돈 내는 사람 눈 | 나선 은하 점 구름에 '여기가 태양'이 찍혀 있어 질문 하나에는 10초 만에 답한다. '사진이 아니라 재구성'이라고 화면과 카드 양쪽에 못박은 정직성은 모범적이다. 다만 숫자 4개짜리 도식이라 한 번 보면 끝이고, 돈을 내는 이유가 될 깊이는 없다 — 무료 기본 그림으로는 충분하다. (B 손보면 된다) |
| 기준 사이트 | 기준 사이트에 없음. PD 08 하위 모드에 이름 없음. |
| **After** | [PD 레일·Space 하위 모드에 자리 없음 · PD 결정 필요] 제안: v1(무료·교육)로 보낸다(같은 계열 원본 cosmic3d, prototype/js/main.js:92). 대안: 'More' 보조 서랍 링크. '재구성 도식' 고지는 그대로 유지. 과금 포인트 없음. |
| 표현 | DOM·별도 장면 (지구 셸 밖) |
| 자료 | 추가 자료 없음 — data/milky-way-structure.json(출처 명시). |
| 재사용 | prototype/v2-three/js/galaxy-view.js(그대로) |
| 무료 / 유료 | 없음. |
| 걸리는 것 | · 입력 개선안 JSON 절단으로 항목이 없었다 — 검증자가 직접 작성.<br>· 행선지는 PD 결정 필요. |
| **완료 기준** | · Space 레일에 '우리은하'가 없고, PD 가 정한 자리에서 열리며 '재구성 도식' 고지가 화면에 그대로 보인다.<br>· 장면을 닫으면 지구 카메라·타임라인·Inspector 상태가 그대로 돌아온다. |

<details><summary>반박 검증에서 뒤집거나 낮춘 것 (15)</summary>

- 입력 절단 보정: 개선안 JSON 이 space.rocket_launch 의 size 에서 끊겼다. rocket_launch 의 size(M)·priority(P2)·action(MERGE)은 검증자가 정했고, 입력에 없던 space.solar_system·space.photo·space.galaxy 3건(MOVE·S·P3·PD 결정 필요)은 레지스트리와 main.js:4333-4352 를 근거로 검증자가 추가했다.
- aurora — 범위를 줄였다: 원안 11개 항 + 수집기는 M 이 아니라 L 이다. P1 핵심(띠·절대 눈금·범례·Kp·클릭 Inspector·자동 갱신·S3 미러)만 M 으로 확정하고, 보관 프레임 재생·도시 숫자 핀·알림·남북 동시는 P2 후속으로 내렸다.
- aurora — '구간 LUT 셰이더 재사용'은 전제가 틀렸다: v2-three/js 에 텍스처 룩업 기반 코드는 0건(grep 실측)이다. Temperature P0 렌더러 선행을 blocker 로 올렸고, 오로라가 먼저면 M→L 이라고 적었다.
- aurora — 등확률선 마칭 스퀘어 line pass 를 뺐다(검증자가 들여온 설계 변경): 20·40·60·80% 는 색 구간 경계와 같은 값이라 중복이고, PD 규칙 4 의 열거 범주(온도·강수·대기질·해양 편차·위험도)에 오로라 확률이 없으며 콘셉트 image9 에도 흰 등치선·지도 위 숫자가 없다. 셰이더 경계선으로 대체했고, P1 에서 지도 위 숫자는 없다 — 정확값은 클릭 → Inspector 로 푼다.
- aurora — Kp '관측' 단일 라벨을 고쳤다: 저장소는 두 제품을 받는다(3시간 Kp: lab-events/handler.py:347-348, cron 40 */3 / 1분 추정 Kp: archiver/handler.py:58, rollup.py:126 이 '1분 추정값'이라 명명). 'Kp 지금' 단독 표기를 금지하고 제품명·time_tag 를 같이 적게 했다. '지도용 축약 JSON 만 추가하면 된다'는 맞지만 그 파일은 아직 없다(신규 S).
- aurora — 지형 추종 점 표본을 '칸 최대 고도'로 고쳤다: lift 0.012(≈76km)는 과장 50×에서 기복 1.5km 에 불과해 1° 점 표본이면 산이 띠를 뚫는다. AdditiveBlending(1548) 유지 시 회색 띠가 보이지 않는 문제와 coverage() 가 global:true 라 켜도 카메라가 안 움직이는 문제(271-290)를 새로 올렸다.
- aurora — P1 을 유지하되 근거를 명시했다: PD P0·P1 목록에 Space 가 없으므로 '구간색 공통 renderer contract 의 가장 싼 소비자'라는 논거를 적었고, PD 가 거부하면 P2 로 내리고 핫픽스(S)만 P1 에 남기도록 했다.
- satellite — P1 → P2 로 낮췄다: PD 우선순위 목록에 Space 없음 + size L + CelesTrak 라이선스 미결. 기존 점 구름은 그동안 그대로 동작한다. timeOffset 연결과 Space 진입 시 기상 색면 해제(S)만 P0 셸 작업에 포함시켰다.
- satellite — 'N등분 돌려 가며 SGP4 갱신'을 폐기했다: 점마다 최대 한 바퀴만큼 묵은 자리가 되어 '적힌 시각의 위치'가 아니게 되고(정직성), 지역 확대에서 떨린다. v1 이 이미 실측으로 정한 기기별 상한(prototype/js/layers/space.js:204-220 — 1기 0.00614ms, 전체 16,123기 99ms, 폰 3~5배 느림, 틱 예산 8ms)으로 바꿨다. '1,500 절단을 없앤다'는 '기기 실측 상한으로 교체한다'로 고쳤다.
- satellite — '다음 통과'와 '1주기 궤도선'의 말을 고쳤다: passesOver(model.js:397)는 기하 통과만 계산하므로 '육안 가시 여부 아님'을 붙이고, trackSamples(model.js:130)는 지구 고정 좌표라 닫힌 타원이 아닌 '1주기 경로'라고 적는다. onTimeOffset(main.js:4891-4899)이 satLayer 를 부르지 않는 것과 점 선택 코드가 없는 것(raycastGlobe 뿐)을 실측으로 확인해 blocker 에 올렸다.
- orbital_debris — M·P0 → S·P0 로 줄였다: P0 는 0단계 거짓 문구 핫픽스에만 해당한다. 1단계(Debris 칩, M)와 2단계(근접사건 event-first, L~XL)는 P2 후속으로 분리했다. 근접사건 발행 자동화는 FastAPI + Postgres 서비스(services/aetherus-orbital 의 Dockerfile·docker-compose.yml·.env)라 Lambda 이전이 아니라 컨테이너 배치이고 PD 비용 결정이다. 파편 행은 v1 도 받는 catalog.json.gz 에 합치지 말고 별도 파일로 두게 했다. core.js 가 v1·v2 공용이라 핫픽스가 v1 에도 나간다는 점을 추가했다.
- solar_activity — REBUILD → IMPROVE: 지구 위에 다시 지을 렌더러가 없고 metaSolarAct 의 결측 규율과 자료 배관은 그대로 쓴다. 새로 짜는 것은 Inspector 차트뿐이다.
- solar_activity — X선 등급에서 R-scale 을 직접 환산해 낮 반구에 배지를 붙이는 안을 뺐다: 기관 발표와 우리 파생을 섞는다. SWPC 공식 R/S/G 현재값을 수집기가 받을 때만 인용한다(피드 URL·형식은 저장소 밖, UNKNOWN). EXPLORER '7일 이력'의 자료원도 바꿨다 — archiver 는 실행당 표본 1개라 몇 분짜리 플레어 정점을 놓치므로 1분 7일 피드 수집이 전제다.
- rocket_launch — '경사각 근거가 있는 경우에만 궤적을 그린다'를 '발사 전 궤적선은 기본 비표시'로 뒤집었다: orbit-math.js groundTrack(68-87)은 상승 가지만 계산하고 하강·방향 처리 코드가 없다(grep 0건). LL2 는 경사각도 방향도 주지 않는다. 남쪽·남동쪽으로 나가는 발사에서는 선이 반대로 그려져 '없는 값 생성'이 된다. PD 가 원하면 정거장행 + 눈으로 대조한 발사장 허용 목록에 한해 '근사 · 방향 가정' 배지로만 허용한다.
- rocket_launch — 'LL2 → events/launches.json 교체는 S'는 맞지만 URL 교체만이 아니다: 축약본은 compact()(aws/launch-feed/handler.py:96-110)가 편 형식이고 buildLaunch/metaLaunch 는 원본 LL2 모양을 읽는다 → 어댑터 필요. 또 orbit-math.js 는 'Cesium 무의존'이 맞지만 ../i18n.js 를 import 한다.

</details>


---

## 5. PD 결정이 필요한 것

### 5-1. PD 정본의 9개 메뉴에 자리가 없던 27현상 — 어디로 갔나

**전부 PD 확정이다.** Life · Travel 12개는 2026-09-20 "라이프 트래블은 메뉴에 넣어줘", 나머지 15개는 같은 날 "모두 진행해"(추천안 전부 승인).

| 상태 | 메뉴 줄 | 새 자리 | 어떻게 |
|---|---|---|---|
| ✅ PD 확정 | 심해 | **L Life** | 심해 체험(수심 읽기는 09 지형 Inspector 로) |
| ✅ PD 확정 | 숲 | **L Life** | 숲 |
| ✅ PD 확정 | 철새 | **L Life** | 새 › 철새 이동 |
| ✅ PD 확정 | 조류 조사 기록 | **L Life** | 새 › 육상 조사 |
| ✅ PD 확정 | 바다거북 | **L Life** | 바다거북 — 기관 서면 확인 전 동결 |
| ✅ PD 확정 | 바닷새 | **L Life** | 새 › 바닷새 |
| ✅ PD 확정 | 인구 | **L Life** | 사람 › 인구 |
| ✅ PD 확정 | 실시간 혼잡 | **L Life** | 사람 › 서울 실시간 혼잡 |
| ✅ PD 확정 | 오늘 갈 곳 | **T Travel** | 오늘 갈 곳 |
| ✅ PD 확정 | 목적별 관광지 | **T Travel** | 목적별 장소 |
| ✅ PD 확정 | 연관 관광지 | **T Travel** | 장소 Inspector 의 '다음에 간 곳 Top 5' |
| ✅ PD 확정 | 지역 방문자 | **T Travel** | 방문자 |
| ✅ PD 승인(추천안) | 지상 관측 | **01·02·03·07** | 공통 'Show Stations' 토글 — 독립 메뉴 폐지 |
| ✅ PD 승인(추천안) | 눈 덮임 | **03 강수** | '쌓인 눈(관측)' 칩 — IMS 수집기 복구가 선행 |
| ✅ PD 승인(추천안) | 연안 침수 범위 | **05 해양** | 해수면 상승 · 침수 보조 모드('재해'에서 옮김) |
| ✅ PD 승인(추천안) | 궤도 인텔리전스 (우주쓰레기·근접사건) → [확정 범위: 0단계 거짓… | **08 우주** | Satellites 의 'Debris' 칩 + 근접사건(거짓 문구 핫픽스는 P0) |
| ✅ PD 승인(추천안) | 지각 이동 속도 | **09 지형** | 'Plates & Motion' 으로 합침 |
| ✅ PD 승인(추천안) | 지각 이동 | **09 지형** | 'Plates & Motion' |
| ✅ PD 승인(추천안) | 오늘의 극값 | **11 Intelligence** | Now 탭 맨 위 '오늘의 극값' 카드 |
| ✅ PD 승인(추천안) | 항공편 | **→ v1** | 사실(FACT) 질문이고 v1 에 구현이 있다 |
| ✅ PD 승인(추천안) | 오늘의 태양계 → PD 레일에 자리 없음 · v1(무료)로 보냄 제안… | **→ v1** | 지구를 대체하는 전체 화면 · 전용 슬라이더 — v2 셸에 안 맞는다 |
| ✅ PD 승인(추천안) | 우주 사진관 59점 → PD 레일에 자리 없음 · v1(무료)로 보냄… | **→ v1** | v1 cosmic3d 에 사진 아틀라스 진입점이 이미 있다 |
| ✅ PD 승인(추천안) | 우리은하 — 우리는 어디 있나 → PD 레일에 자리 없음 · v1(무료… | **→ v1** | 교육 콘텐츠 — v1 |
| ✅ PD 승인(추천안) | 선박 | **뺌** | 그릴 자료가 없다(AIS 미연결) — 자료가 생기면 다시 연다 |
| ✅ PD 승인(추천안) | 여행지 | **뺌** | 자료 없음 — 한국은 '목적별 장소'가 같은 질문에 답한다 |
| ✅ PD 승인(추천안) | 빙하호 홍수 | **뺌(보류)** | 수집기(glacial-lake-us) 배포 전 — 자료가 들어오면 06 재해로 |
| ✅ PD 승인(추천안) | 지역 뉴스 | **상단 · 재해 Inspector** | '관련 보도' — 좌측 메뉴 밖. 분홍 막대 5개는 즉시 삭제(S) |

⚠️ 취미·야외 활동 5줄(해변과 낚시터 · 서핑 · 낚시 · 패러글라이딩 · 산 정상 날씨)은 분석에서 물리 메뉴(해양 · 바람 · 기온)의 활동 오버레이로 들어갔다. Travel 이 메뉴가 된 지금, **Travel 에 '야외 활동' 칩을 두고 누르면 해당 물리 메뉴의 오버레이를 여는** 입구를 하나 더 둔다(자료와 그림은 한 곳에만 둔다) — 2026-09-20 "모두 진행해"로 승인.

### 5-1b. 자리는 있지만 **세부를 정해 주셔야 하는** 현상 (15)

| 묶음 | 메뉴 | 들어갈 자리와 정할 것(요약) |
|---|---|---|
| 대기 | 기온 | [→ 01 Temperature · 기준 구현체] PD 목표 화면(5°C 11칸 단색 · 흰 등온선+지구 위 숫자 라벨 · 범례 · Inspector 칩 · Actual/Anomaly)은 그대로…<br>… KST'. '현재 기온'이라 부르지 않고 '지금 시각의 모델 기온'이라 한다.<br>- °C/°F 는 범례 전환만. 불투명도·음영은 View>Appearance.<br>- '<-10' 한 칸에 극지 -60~-10°C 가 다 들어가는 문제는 범례 변경이므로 **PD 결정 필요**(View 옵션 '극지 확장 칸').<br>이 항목에서 뺀 것<br>- 바람 입자 오버레이: 02 Wind 완료 뒤 독립 토글로 붙인다(이 항목 DoD 아님).<br>- Anomaly 탭 내용: weather.temperature_anomaly 항목.<br>- GFS\|ECMWF Compa … |
| 대기 | 상층 수증기 | [→ 04 Clouds › Satellite quick mode 의 채널 칩 '수증기 6.3µm'] 독립 메뉴 줄을 없앤다. 현상 id 와 레이어 id 'weather/cloud-wv' 는 그대로…<br>… 기존 syncCloudToTime(main.js:5454-5474)이 gk2a* 모드를 GFS 예보 구름으로 바꾼다 — 이 동작이 '지금만'의 집행이다. 그때 칩은 비활성 + 사유('관측은 미래에 없다').<br>⑥ 가강수량(TPW) = [자리 없음 · PD 결정 필요]<br>- 권고: 03 Rain Inspector 의 보조 칩 '수증기량(TPW)'. 10mm 구간 단계색 + 등치선 10·20·30·40·50·60·70mm(v1 continuous-contours.js:35 와 동일 레벨). 'MODEL · GFS' 배지. 높은 TPW 만 … |
| 바다 | 파고와 너울 | [→ 05 Ocean · Waves 칩] 목표 화면 유지(구간색 + 기준선 + 방향·높이 glyph + 파고·너울 별도 수치). 도달 경로를 둘로 쪼갠다. 【A 자료 확보 — 선행】 A-1 ECM…<br>… 으로(VISUALIZATION_ONLY 배지 유지). 【그 사이】 새 격자가 뜰 때까지 5° Open-Meteo 파고 색면은 유료 레일에 올리지 않는다 — 핫픽스로 육지 덮임만 막고 무료·'모델' 배지로 두거나 내린다(R0 감사 D-OM1/D-OM2 PD 결정). … |
| 바다 | 수심별 수온 | [→ 05 Ocean 관측 토글의 'Argo 플로트' 칩 — PD 정본에 자리 없음 · PD 결정 필요(안: 바다 실측과 한 토글 묶음)] ① 지구 위 문법 유지(부상점=실선 점, 사이=점선 추정…<br>… [→ 05 Ocean 관측 토글의 'Argo 플로트' 칩 — PD 정본에 자리 없음 · PD 결정 필요(안: 바다 실측과 한 토글 묶음)] ① 지구 위 문법 유지(부상점=실선 점, 사이=점선 추정). 마지막 부상점은 표층 수온을 SST 10단 구간색 원으로 + 확대 시 숫자. 파일은 시간 역순 정렬이므로(argo-floats/handler.py:81) '한국 주변 먼저'는 … |
| 바다 | 해수면 상승 전망 | [→ 12 Simulation · Variable='Sea level' — PD 결정 필요 2건: (a) 12 는 PRO 인데 '기본 그림은 무료 완성' 원칙과 부딪힘 → 05 Ocean 에 무료…<br>… [→ 12 Simulation · Variable='Sea level' — PD 결정 필요 2건: (a) 12 는 PRO 인데 '기본 그림은 무료 완성' 원칙과 부딪힘 → 05 Ocean 에 무료 1장(SSP5-8.5·2100), 시나리오×연도·delta 는 12. (b) 이 현상은 EARTHUS 계산이 아니라 기관 시나리오 전망(registry capabil … |
| 바다 | 해구 | [→ 09 Terrain · 등심선의 지형 이름표로 MERGE] 렌더는 유지 — 선·라벨·pick 이 이미 PD 문법(선 + 지구 위 라벨 + 클릭)에 맞다. 독립 메뉴 줄을 없애고 Bathyme…<br>… 하나로 줄이지 않는다 — registry:387) · 출처 GEBCO 2026·SCUFN · 배지. 해구 옆 수심 숫자는 EARTHUS_ANALYSIS 라는 기존 구분(registry:203) 유지. hobby/trench 상세 카드 10곳의 자리는 PD 결정 필요('Life/취미' 보조 서랍 또는 v1). … |
| 눈·얼음 + 대기질·관측 | 해빙 | [→ 05 Ocean · 다섯째 칩 'Ice' · PD 결정 필요] 목표 화면은 원안 유지: 얼음으로 읽히는 5단 구간색(15~30 #1F4E79 · 30~50 #2F7FB5 · 50~70 #6C…<br>… [→ 05 Ocean · 다섯째 칩 'Ice' · PD 결정 필요] 목표 화면은 원안 유지: 얼음으로 읽히는 5단 구간색(15~30 #1F4E79 · 30~50 #2F7FB5 · 50~70 #6CB8E0 · 70~90 #BFE6F5 · 90~100 #FFFFFF, 15% 미만 비움) + 오늘 가장자리(흰 실선) vs 1981–2010 … |
| 눈·얼음 + 대기질·관측 | 자외선 | [→ 07 Air Quality · 'UV' 칩 · PD 결정 필요] 독립 메뉴를 없애고 MERGE — 원안 유지. WHO/기상청 공통 5단 구간색(0~2 #289500 · 3~5 #F7E400…<br>… [→ 07 Air Quality · 'UV' 칩 · PD 결정 필요] 독립 메뉴를 없애고 MERGE — 원안 유지. WHO/기상청 공통 5단 구간색(0~2 #289500 · 3~5 #F7E400 · 6~7 #F85900 · 8~10 #D8001D · 11+ #6B49C8), 등급 경계 3·6·8·11 흰 선+'UV 8' 라벨(0.5° 이 … |
| 눈·얼음 + 대기질·관측 | 기후 시계열 | [→ 11 Intelligence · Climatology 탭] 제안 = MOVE. **PD 결정 필요**: 정본의 좌측 레일 9개에 이 현상의 자리가 없다. 좌측 메뉴 항목을 없애고 Inspec…<br>… [→ 11 Intelligence · Climatology 탭] 제안 = MOVE. **PD 결정 필요**: 정본의 좌측 레일 9개에 이 현상의 자리가 없다. 좌측 메뉴 항목을 없애고 Inspector 의 Now / Forecast / Climatology / Analysis 중 Climatology 로 옮긴다. 두 단계로 나누고, 1단계만 이 항목의 크기(M)에 넣는다. … |
| 생태·사람·여행 | 해변과 낚시터 | [→ 05 Ocean · Waves 탭, PD 결정 필요] 이 현상은 '생태·사람·여행' 묶음(phenomenon-registry.js:1108)이라 PD 정본 레일에 자리가 없다 — (a) Oc…<br>… [→ 05 Ocean · Waves 탭, PD 결정 필요] 이 현상은 '생태·사람·여행' 묶음(phenomenon-registry.js:1108)이라 PD 정본 레일에 자리가 없다 — (a) Ocean 토글로 흡수 (b) v1 로 보냄 (c) 삭제 중 PD 가 고른다. 권고는 (a) MERGE: 현상 ocean.coastal_ … |
| 생태·사람·여행 | 서핑 | [→ 05 Ocean · Waves 탭 토글 'Surf spots', PD 결정 필요(레일에 자리 없음)] 부모 그림(파고 단계색+방향 glyph)은 05 담당. 핵심 정정 = **자료를 따로 받…<br>… [→ 05 Ocean · Waves 탭 토글 'Surf spots', PD 결정 필요(레일에 자리 없음)] 부모 그림(파고 단계색+방향 glyph)은 05 담당. 핵심 정정 = **자료를 따로 받지 않는다**: 마커 숫자는 05 Ocean 이 그리는 파랑 프레임(8bit 1ch 선형, 공용 프레임 저장소)을 해변의 앞바다 점(beaches.js offsh … |
| 생태·사람·여행 | 낚시 | [→ 05 Ocean · Waves 탭 토글 'Fishing spots', PD 결정 필요(레일에 자리 없음)] 서핑과 같은 'Show spots' 부품의 다른 칩. 파랑 숫자는 서핑과 같이 05…<br>… [→ 05 Ocean · Waves 탭 토글 'Fishing spots', PD 결정 필요(레일에 자리 없음)] 서핑과 같은 'Show spots' 부품의 다른 칩. 파랑 숫자는 서핑과 같이 05 Ocean 파랑 프레임을 지점에서 읽는다(육지 텍셀이면 가장 가까운 유효 바다 텍셀, 없으면 비움 — '조위만 있는 지점'은 물때만 보여주는 기존 규칙 유지). 마커 … |
| 생태·사람·여행 | 패러글라이딩 | [→ 02 Wind 토글 'Flying sites', PD 결정 필요(레일에 자리 없음)] 부모 그림(입자+풍속 구간색)은 02 Wind(P0) 담당. 1차 값을 **모델에서 실측으로 뒤집는다**…<br>… [→ 02 Wind 토글 'Flying sites', PD 결정 필요(레일에 자리 없음)] 부모 그림(입자+풍속 구간색)은 02 Wind(P0) 담당. 1차 값을 **모델에서 실측으로 뒤집는다**: kma-aws-min(736지점 매분)에 ws10·wd10·wss(최대 순간풍속)·ta·td 가 다 있다 → 활공장과 '같은 산' 조건(mou … |
| 생태·사람·여행 | 산 정상 날씨 | [→ 01 Temperature 토글 'Summits', PD 결정 필요(레일에 자리 없음)] 부모 그림(5°C 10단+흰 등온선+숫자 라벨)은 01 담당. 정직성 정정 ①: mountain.js…<br>… [→ 01 Temperature 토글 'Summits', PD 결정 필요(레일에 자리 없음)] 부모 그림(5°C 10단+흰 등온선+숫자 라벨)은 01 담당. 정직성 정정 ①: mountain.js 가 내는 두 번째 숫자는 '실측'이 아니라 **고지대 관측소 실측을 정상 고도로 감률 환산한 값(est)** 이다(mountain.js lapseT … |
| 우주 | 발사 일정 (세계 로켓) → Space › Satellites 안의 'Events: 발사' 목록 (PD 결정 필요) | [→ 08 Space · Satellites 모드의 'Events' 목록(발사 · 근접사건)으로 MERGE — PD 하위 모드 3개에 이름이 없음 · PD 결정 필요(대안: v1 무료로 보냄)]<br>… [→ 08 Space · Satellites 모드의 'Events' 목록(발사 · 근접사건)으로 MERGE — PD 하위 모드 3개에 이름이 없음 · PD 결정 필요(대안: v1 무료로 보냄)]<br>0) 선행(S, 재설계와 무관하게 먼저): LL2 직접 호출을 events/launches.json(aws/launch-feed, 15분, 진행 중·중계 포함)과 events/launches-recent.json 으로 교체. URL 만 바꾸는 … |

### 5-2. 그 밖에 정해야 하는 것

| # | 결정 | 제 추천 | 이유 |
|---|---|---|---|
| 1 | **0.5°(55 km)를 1차 해상도로 받아들일지** | 받아들인다 | 0.25° 는 지금 Lambda 구조에서 못 돈다(스텝당 10.8 MB). 지구본 축척에서는 0.5° + 셰이더 구간색이면 시안의 그림이 나온다. 한반도 확대는 기상청 5 km 격자로 따로 푼다 |
| 2 | **Open-Meteo 를 걷어낼 범위** | 유료 핵심 그림(기온·바람·기압·강수·파고·대기질)은 전부 교체 | 비상업 조항 위험. 대체: NOAA GFS·GFS-Wave(퍼블릭 도메인) · ECMWF open data(CC-BY-4.0) · CAMS·CMEMS·ERA5(Copernicus, 출처표시) · 기상청(공공누리) |
| 3 | **Copernicus(CAMS·CMEMS·ERA5) 출처표시 조건 수용** | 수용 | 무료·상업 이용 가능, 출처 표기만 요구. 계정 가입이 필요하다(사람 일) |
| 4 | **두 번째 모델을 ECMWF 로 할지** | 그렇게 한다 | Compare 의 의미는 GFS 대 ECMWF 다. open data 0.25° 가 공개돼 있다. 다만 **격자 수집기가 지금 없다**(eccodes 필요, 별도 L 작업) — G3 의 선행 조건 |
| 4-1 | **`ecmwf-ingest` 정기 실행 등록**(6시간마다) | 지금 등록 | 수동 1회분뿐이다. ECMWF 는 2~3일치만 보관해 지나간 회차는 영영 못 받는다. "한국에서 AI 모델 대 물리 모델" 채점의 재료다. `events:*` 권한이 없어 PD 가 해야 한다 |
| 4-2 | **앙상블 확률의 자료원** | NOAA GEFS(31멤버 · 퍼블릭 도메인) | 기온·강수의 격자 앙상블이 지금 없다. 태풍 확률은 있는 자료(ECMWF 51멤버 경로)로 바로 된다 |
| 5 | **유료 경계를 언제 켤지**(`FREE_OPEN` → 유료) | G3 뒤 | 지금 켜면 팔 것이 없다. 등급 판정 코드는 한 번도 실행된 적이 없어 켜기 전에 시험이 필요하다 |
| 6 | **관측소 바람(막대기)의 처분** | '지상 관측' 현상의 값 라벨로 옮긴다 | 자료는 귀하다(기상청·GTS 3,000곳). 표현만 막대기에서 숫자로 바꾼다 |
| 7 | **계약 §C-2 개정** | PD 가 2026-09-20 에 방향을 정했다(근거 있으면 통과) — 문구 확정만 남음 | `AGENTS.md` 에 개정 대상으로 표시해 둠 |
| 8 | **남은 PD 배포 4건**(공개 API 키 · 빙하호 · 변화 창고 · LLM) | `docs/PD-DEPLOY-2026-09-20.md` | 🔴 공개 API 키는 지금도 익명으로 읽힌다 |


---

## 6. 순서와 게이트

| 게이트 | 7단계에서 채워지는 칸 | 끝나면 화면에서 보이는 것 | 포함 |
|---|---|---|---|
| **G1 — 그림이 바뀐다** | **①** (기온·바람·강수·해양) + **④** (그 넷이 타임라인을 따른다) | 구간색 + 등온선 + 라벨, 흐르는 바람, 강수 구간색, 5일 타임라인, 바다가 육지를 안 덮는다 | W0 · W1 · W2 · W3 · W4 · W6 의 껍질 버그 |
| **G2 — 읽을 수 있다** | **② ③** 11개 메뉴 전부 · **①** 나머지 메뉴(Life · Travel 포함) | 좌레일 11 · Inspector(값 · 출처) · 타임라인 하나 · View 분리 · 범례 상시 | W5 · W6 나머지 · W7 |
| **G3 — 돈 받을 이유가 생긴다** | **⑤ ⑥** | 분할 비교 · 원인과 확률을 말하는 Intelligence | W8 · W9 |
| **G4 — 미래를 시험한다** | **⑦** | Simulation 작업 공간 | W10 |

**첫 관통(First Vertical).** 9개 메뉴를 가로로 한 단계씩 채우는 것과 별개로, **메뉴 하나를 ①~⑦ 끝까지 먼저 관통**시킨다 — 문법이 실제로 성립하는지 가장 빨리 증명하는 길이다. 어느 메뉴인지는 §1-3.

### 실행 기록

| 날짜 | 작업 | 상태 | 커밋 · 확인 |
|---|---|---|---|
| 2026-09-20 | 지시서 승인("모두 진행해") — 추천안 15건 포함 전부 | ✅ | 이 문서 |
| 2026-09-20 | 찾기·묻기를 상단 돋보기(⌕) 하나로 — 메뉴 안 '메뉴·질문 검색' 칸 제거, ✦ 숨김, v1 문법의 '「…」 물어보기' 줄, 서랍 닫기(✕·Esc) | ✅ 운영 | `0b0977e4` · 운영 화면 확인(✦ 숨김 · 돋보기가 메뉴를 찾음) |
| 2026-09-20 | 핫픽스 — 바다 색면(수온·파고·평년 대비 수온)이 저지대 육지를 덮던 버그. 고도 부호 가림판(0.25° · alphaMap) | ✅ 운영 | `2059ae9d` `297c3511` · 서해안·산둥·장쑤·방글라데시 Before/After. **남은 한계:** 해안 15~40 km 와 좁은 바다(다도해·대한해협)에 색이 빈다 — 프래그먼트 단위 해안선은 W1 |
| 2026-09-20 | 핫픽스 — 우주 쓰레기 카드가 0기를 그리면서 '500기를 지금 자리에 그렸습니다'라고 하던 거짓 문구. 머리말·칩·배지가 '그릴 수 있는 수' 하나를 본다 | ✅ 운영(v1·v2) | `e75906f0` `94dceac3` · 운영 카드 '위치 표시 안 함 — 스냅샷 16일 전(상한 7일)' · 배지 '이전 자료'. **근본 원인(스냅샷 발행이 09-04 이후 멈춤)은 남아 있다** |
| 2026-09-20 | 핫픽스 — '오늘 갈 곳' 카드 "매일 다시 점수 매깁니다". 지금 값(특보·대기질 시각)과 집계한 값(집계일·방문자 기간)을 자료에서 읽어 가른다. 대회 모듈이라 문구만 | ✅ 운영 | `07ad1ef1` `e1ad6f0d` |
| 2026-09-20 | 핫픽스 — 지역 뉴스 분홍 막대 5·점 5 → 지역마다 네모칸 하나('동남아 24건'). 누르면 목록이 뜨는 것은 W5 | ✅ 운영 | `bd9dcb63` |
| 2026-09-20 | W0 — GFS 0.5° 필드 프레임 t(기온 2m)·u(바람 10m)·m(해면기압)·a(누적강수) + 매니페스트 schema 2 · runs[] | ✅ 운영 | `149d15c3` · pytest 345 · 운영 첫 실행(런 2026092000): 41/41 스텝 · 네 필드 누락 0 · **381초**(기준 276초 · 한도 900초 · 완료 기준 <600) · 서울 칸 f003 27.5°C·1016.0hPa vs 기상청 12시 27.4°C·1016.1hPa · 5일 구름 예보 T+115h 재생 확인. **다음:** 브라우저에서 이 프레임을 읽는 코드는 아직 없다 — 공용 프레임 저장소 → W1 |
| 2026-09-20 | 시험 3건이 줄바꿈(CRLF)에 걸려 워크트리 5개가 전부 같은 가짜 실패를 봤다 — LF 로 맞춰 읽는다 | ✅ | `79d9599a` · npm test 269/269 |
| 2026-09-20 | 뉴스 카드가 남의 RSS 글자(제목·매체·링크)를 escape 없이 innerHTML 에 넣던 것 — escape + http(s) 링크만 | ✅ 운영 | `b902f7df` · 적대적 RSS 시험 · npm test 270/270 |
| 2026-09-20 | 기압 프레임 범위 940~1067.5 → 870~1125 hPa(1 hPa 눈금) — 첫 실행에서 태풍 중심 354칸이 바닥에 눌림 | ✅ 배포(다음 3시간 스케줄부터) | `c90b0fd5` · pytest 345 |
| 2026-09-20 | 2차 묶음(바닥 부품): 공용 GFS 프레임 저장소 `gfs-frames.js` · 색 눈금표 `field-scales.js` + 상시 범례 `field-legend.js` · 바람 입자 엔진 `wind-particles.js` · 시간 버스 `time-bus.js` | ✅ 합침 · 화면 배선은 3차 | `9260d7bc` `ef47cea8` `e2c219da` `8f263d4f` `ef860f50` · npm test 359/359 · 로컬 브라우저에서 운영 프레임으로 확인: 서울 28.2°C(f003↔f006 보간) · 바람 u 1.7 · v −3.1 m/s · 1014.2 hPa · 범례 데스크톱/375폭 |
| 2026-09-20 | 3차 묶음: W1 FieldRenderer + W2 기온(구간색 · 등온선 · 숫자 라벨 · 범례 · 타임라인 · 클릭 값) ∥ W3 바람 입자 배선 + 막대기 제거 ∥ 관측 숫자(OBS) — 빌드 → 반박 검증 → 수정 | 🟡 진행 중 | 워크트리 3개 |
| 2026-09-20 | **PD 결정 — 구간색은 A(시안 그대로: 파랑→청록→초록→노랑→주황→빨강).** 밝기는 노랑에서 가장 밝고 양끝이 어둡다. '밝기 한 방향'(B)은 택하지 않음 — 값은 등온선·숫자 라벨·범례·클릭 값이 말한다. 기온·풍속·강수 공통, 수온·대기질도 같은 계열 | ✅ 확정 | `field-scales.js`(e2c219da)에 이미 A — 표 한 줄이 색면·범례·등치선을 같이 바꾼다 |
| 2026-09-20 | **3차 묶음 — W1 FieldRenderer + W2 기온**(구간색 · 흰 등온선 2/5°C · 10°C 굵게 · 숫자 라벨 · 범례 · 5일 타임라인 · 클릭 값 네트워크 0건) ∥ **W3 바람**(GFS 10 m 입자 · 막대기 제거 · 강도 3단 · 클릭 값) ∥ **관측 숫자(OBS)** | ✅ 운영 | `0d7a3ce7`…`d77f1456` · `c0eb663b`…`c22ae85d` · `1c18f196`…`54703b25` · 셰이더 2종 실제 브라우저(로컬+운영)에서 첫 실행에 컴파일 · 남북·태풍 반시계 확인 · 운영에서 T+72h 로 밀어 f078↔f081 보간·범례 유효시각·OBS 숨김 확인 |
| 2026-09-20 | 합친 화면을 직접 보고 넣은 것 — 색면이 켜지면 **구름이 물러난다** · '바람'을 켜면 **풍속 구간색(windgrid → GFS 10 m · magnitudeRG)이 같이 깔리고 입자는 흰색** · 입자 밀도 460→230 · 색면 위 **나라·해안 윤곽선**(field-outlines.js) | ✅ 운영 | `ee2f5e2f` `bab15de9` · npm test 512/512 · Before/After + 테스트 안내서 전송 |
| 2026-09-20 | 4차 선행 — 기압 H/L 중심 찾기(pressure-centers.js · 화면 미연결) · 옛 프레임 3종(구름·700hPa·강수) 디코드 상수를 매니페스트 fields{} 에 | ✅ 합침 · Lambda 배포(다음 3시간 스케줄부터) | `58c8d242` `09d423fb` · pytest 360 · C1 반박 검증 'ship' |
| 2026-09-20 | 반박 검증 재실행(사용량 한도로 끊겼던 B1 기온 렌더러 · B2 바람 · C2 기압 중심) + 관측 숫자 수정(10분 주기 한국 자료 · 범례에 관측 시각 · 자동 회전 깜빡임 제거 외 6건) | 🟡 진행 중 | 결함이 나오면 고쳐서 바로 재배포 |
| 2026-09-20 | 반박 검증(기온 렌더러 · 바람 · 기압 중심) 결과 중 **화면에서 재현된 4건**을 본 세션이 직접 고침 — 색면끼리 겹침(색면은 한 번에 하나) · 범례 주인 스택(색면 10 · 입자 5) · 입자를 색면과 같은 지표 높이로(태풍 소용돌이가 색면의 눈과 약 100px 어긋나던 것) · 카드가 화면과 다른 말(모델 범위 · 입자 색) | ✅ 운영 | `84b6d93c` · npm test 514/514 · 운영 화면 확인: 기온 구간색+등온선+관측 숫자 위로 **흰 입자**가 흐르고 태풍 소용돌이가 색면과 겹친다 |
| 2026-09-20 | Fable 사용량 한도로 수정 에이전트 4개 실패 — 모델을 Opus 5 로 바꿔 본 세션이 직접 수정·배포 | — | 검증 에이전트 3개는 완주(결함 30건 · blocker 0) |
| 2026-09-20 | 4차 묶음 착수: **기압**(옅은 색면 + 4 hPa 등압선 + H/L 기호 · 고지대 가짜 고기압 제외) ∥ **강수**(mm/h 구간색 8단 + 강한 코어 윤곽) ∥ **바다 3종·대기질을 새 렌더러로**(해안 계단 제거 · 반 칸 등록 오차 교정) | 🟡 진행 중 | 워크트리 3개 · 빌드→반박 검증→수정 |
| 2026-09-20 | **D1 기압** — `presgrid` 를 Open-Meteo 5° 한 시각 그라데이션에서 GFS 0.5° 5일 예보로. 옅은 구간색(칸마다 0.4 → 화면 0.32) + **4 hPa 등압선**(20 hPa 굵게 · 1012 강조 · 굵은 선에만 숫자) + **H/L 기호**(새 모듈 `field-symbols.js` — 키프레임에서만 찾고 사이는 대권 보간 · 글자별 텍스처 · 앞 반구 H 8·L 8/폰 5·5 · 히스테리시스). 카드에 등압선·기호 켬/끔(동작하는 것만) · 메뉴 줄 출처 정정 | ✅ 합침 · 화면 확인 대기 | `953f0957` `4c72bb0b` `<D1-2>` · npm test 533/533 · 번들 무결성 4/4 · **반박 검증 결함 3건을 먼저 고쳤다**(고지대 가짜 H — 운영 f003 에서 H 12개 중 8개 · 전지구 상한 12 · hPa 안 보는 짝짓기). 운영 프레임 + 진짜 z4 고도로 재측정: 가짜 9자리 전부 사라지고 북태평양 H 1030(46,169) · 남대서양 H 1029(−30.5,−30.5) · 북서대서양 H 1025(47,−67) 복귀 · 36 hPa 글자 점프 0건. **남은 한계:** 1,500 m 로 둘러싸인 분지(타림)의 두드러짐은 산 위 경정값으로 잰다 |
| 2026-09-20 | **D1 기압** — `presgrid` 를 Open-Meteo 5° 한 시각 그라데이션에서 GFS 0.5° 5일 예보로. 옅은 구간색(칸마다 0.4 → 화면 0.32) + **4 hPa 등압선**(20 hPa 굵게 · 1012 강조 · 굵은 선에만 숫자) + **H/L 기호**(새 모듈 `field-symbols.js` — 키프레임에서만 찾고 사이는 대권 보간 · 글자별 텍스처 · 앞 반구 H 8·L 8/폰 5·5 · 히스테리시스). 카드에 등압선·기호 켬/끔(동작하는 것만) · 메뉴 줄 출처 정정 | ✅ 합침 · 화면 확인 대기 | `953f0957` `4c72bb0b` `ba211ecc` · npm test 533/533 · 번들 무결성 4/4 · **반박 검증 결함 3건을 먼저 고쳤다**(고지대 가짜 H — 운영 f003 에서 H 12개 중 8개 · 전지구 상한 12 · hPa 안 보는 짝짓기). 운영 프레임 + 진짜 z4 고도로 재측정: 가짜 9자리 전부 사라지고 북태평양 H 1030(46,169) · 남대서양 H 1029(−30.5,−30.5) · 북서대서양 H 1025(47,−67) 복귀 · 36 hPa 글자 점프 0건. **남은 한계:** 1,500 m 로 둘러싸인 분지(타림)의 두드러짐은 산 위 경정값으로 잰다 |

**G1 전에는 다른 일을 하지 않는다.** 2026-09-20 새벽의 교훈: 배관 15단계를 다 밟아도 화면이 그대로면 PD 에게는 아무 일도 안 일어난 것이다.

---

## 7. 일하는 법 (이 지시서의 모든 작업에 적용)

1. 작업을 시작할 때 **"이게 화면에서 무엇을 바꾸나"** 를 한 문장으로 말한다.
2. 끝낼 때 **운영 화면 스크린샷**으로 Before/After 를 보인다. 시험 통과 숫자는 완료의 증거가 아니다.
3. 완료 기준은 **금지가 아니라 결과**로 쓴다.
4. 팔레트·레벨·범례는 **한 표**에서 나온다. 같은 값을 두 곳에 적지 않는다.
5. 애매하면 덜 말하는 쪽을 고르지 말고 **묻는다.**
6. 자료가 그림을 못 받치면 렌더러를 탓하기 전에 **자료를 바꾼다**(W0 이 맨 앞인 이유).

---

## 부록 A — 기획 대비 미반영 감사 (72건)

문서가 **수치·이름으로** 약속한 72건을 뽑아 각각 코드를 열어 재검증했다. 없음 16 · 부분 40 · 확인 불가 3 · 됨 13. (1차 조사의 주장 39건이 재검증에서 뒤집혔다.)

### A-시각 표현 (18건 — 없음 11 · 부분 5 · 됨 2)

| 판정 | 체감 | 크기 | 약속 | 출처 | 왜 중요한가 |
|---|---|---|---|---|---|
| 없음 | HIGH | MEDIUM | 구간 경계가 섞이지 않는 단계색 — 기온·기압·바람·SST·SST편차·파고 6개 변수 전부 | docs/earthus-v23/CONTINUOUS_LAYERS.md:12, 25-32 (2026-08-12) | 돈 내고 켠 색면이 경계 없는 그라데이션이라 '지금 몇 도 구간인지'를 눈으로 구분할 수 없다. |
| 없음 | HIGH | MEDIUM | 기온 등치선 -25,-10,0,10,20,30,40°C (7레벨) + 긴 경로부터 레벨당 최대 두 라벨 | docs/earthus-v23/CONTINUOUS_LAYERS.md:25, 34-35 (2026-08-12) | '몇 도 선이 어디까지 올라왔나'가 기온 레이어를 보는 이유인데 그 선이 화면에 없다. |
| 없음 | HIGH | MEDIUM | 기압 등치선 4hPa 간격 + 고·저기압 중심 H/L 기호 | docs/earthus-v23/CONTINUOUS_LAYERS.md:27 (2026-08-12) | 등압선 간격이 곧 바람 세기라는 판독이 통째로 빠져 있어, 색면만으로는 '어디가 높나'만 알고 '얼마나 급한가'를 모른다. |
| 없음 | HIGH | MEDIUM | SST 등치선 4,10,16,22,26,29°C (6레벨) | docs/earthus-v23/CONTINUOUS_LAYERS.md:30 (2026-08-12) | 26·29°C는 산호 백화·태풍 발달을 가르는 경계인데 선으로도 색 경계로도 표시되지 않는다. |
| 없음 | HIGH | MEDIUM | SST 편차 등치선 -1.5,-0.5,0,0.5,1.5°C (5레벨, 0 강조) | docs/earthus-v23/CONTINUOUS_LAYERS.md:31 (2026-08-12) | 평년보다 뜨거운지 차가운지를 가르는 0 선이 없어, 편차 레이어에서 가장 중요한 경계를 눈으로 짚을 수 없다. |
| 없음 | HIGH | SMALL | 파고 1,2,3,4,6,9m 경계 단계색 · 등치선도 같은 경계값 | docs/earthus-v23/CONTINUOUS_LAYERS.md:32 (2026-08-12) | 색 경계가 계약과 다른 대표 사례로, 색면과 등치선이 같은 값이어야 한다는 규칙 자체가 깨져 있다. |
| 없음 | HIGH | MEDIUM | 현재 화면 주요 도시의 최근접 원격자값 (지구 위 도시 값 라벨) | docs/earthus-v23/CONTINUOUS_LAYERS.md:14 (2026-08-12) + prototype/js/readability.js:1-5 | 색면을 켠 상태에서 화면 안 도시의 실제 수치가 한 개도 안 떠서, 유료 화면이 '예쁜 색 한 장'으로 끝난다. |
| 없음 | HIGH | MEDIUM | 내일 최고/최저 기온 — 각 전용 단계색 · 범례 경계값 · °C 원격자 (tmax 0,12,22,28,33,38 / tmin -20,-10,0,8,16,24) | docs/earthus-v23/CONTINUOUS_LAYERS.md:26 (2026-08-12) + prototype/js/continuous-contours.… | 계약 표 8행 중 한 행이 레이어째로 없어, v2 날씨 메뉴에 '내일'을 색으로 보는 화면이 하나도 없다. |
| 없음 | MEDIUM | SMALL | 기압 선은 동아시아 1° 전용판(pressure-ea.json), 전지구 5°로 가짜 정밀선 금지 | docs/earthus-v23/CONTINUOUS_LAYERS.md:27 (2026-08-12) | 등압선을 넣으려 해도 전제가 되는 1° 자료가 v2 에 연결돼 있지 않아 선 작업보다 앞에 와야 하는 항목이다. |
| 없음 | MEDIUM | MEDIUM | TPW — 10mm 단계색 · 등치선 10~70mm · mm 원격자 (공개 승인 전 TPW_READY=false 유지) | docs/earthus-v23/CONTINUOUS_LAYERS.md:29 (2026-08-12) | v1 에서도 공개 플래그가 걸린 층이라 급하지 않지만, 승인이 나도 v2 에는 켤 코드 자체가 없다. |
| 없음 | LOW | MEDIUM | 대륙 포커스(§19.4 Continent Focus) — 국가 bbox 유니온으로 다음 단계 | prototype/v2-three/NEXT_STEPS.md:78, '## 3. 알려진 프로토타입 한계' 절 (2026-09-01) | 문서가 스스로 '미구현'이라 적어 둔 한계라 약속 위반은 아니고, 사용자가 없는 줄도 모르는 기능이다. |
| 부분 | HIGH | SMALL | 범례의 해상도 · 유효 원격자 n · 위도 범위 · 등치선 기준 · 결측 처리 (5항목) | docs/earthus-v23/CONTINUOUS_LAYERS.md:16 (2026-08-12) | 카드가 '몇 칸·어느 범위'까지는 정직하게 적지만 색 눈금이 없어, 화면에 칠해진 색 하나를 값으로 되돌릴 방법이 없다. |
| 부분 | HIGH | LARGE | 바람 입자는 방향 판독용 과장 — 전지구 u/v 입자장 | docs/earthus-v23/CONTINUOUS_LAYERS.md:28, 47 (2026-08-12) + prototype/v2-three/NEXT_STEPS… | 바다와 관측 공백 지역에는 흐름이 한 줄도 흐르지 않아, 전지구 화면에서 바람이 '어디서 어디로 가는지'가 보이지 않는다. |
| 부분 | MEDIUM | MEDIUM | 지점을 누른 좌표·원격자값·단위·시각·출처 Evidence — 화면 숫자는 보간 픽셀이 아니라 원격자값 | docs/earthus-v23/CONTINUOUS_LAYERS.md:15 (2026-08-12) + prototype/js/readability.js:4-5 | 눌러서 나온 숫자와 그 자리에 칠해진 색이 서로 다른 자료라 어긋날 수 있는데, 화면은 그 사실을 말하지 않는다. |
| 부분 | MEDIUM | LARGE | 1.0 지구 스타일 46레이어를 v2 씬별 레이어로 분산 | prototype/v2-three/NEXT_STEPS.md:9 표 (2026-09-01) + v1 실목록 prototype/js/layerbar.js | v1 에서 무료로 보던 색면 10종이 유료 v2 에는 없어, 요금을 내면 볼 수 있는 것이 오히려 줄어 보인다. |
| 부분 | MEDIUM | SMALL | TIME 등시선 재생 30 / 60 / … / 720분 · RESULT '관측소 도달시간 표 + 등시선 지도' | docs/PILOT-SCREEN-SPEC-TEMPERATURE-TSUNAMI-2026-09-18.md:99, 104 (가장 최신 화면 명세) | 쓰나미 화면에서 '몇 분 뒤 어디까지'가 핵심인데, 주황 선 뭉치만 보이고 시간을 읽을 수 없다. |
| 됨 | HIGH | SMALL | P6 대기 산란 (2026-09-01 남은 것) | prototype/v2-three/NEXT_STEPS.md 웨이브2 '남은 것' (2026-09-01) | 이미 구현돼 있으므로 미구현으로 세면 안 된다 — 첫 화면 인상에 가장 크게 기여하는 부분이다. |
| 됨 | MEDIUM | SMALL | 해저 등심선 · 해수면/해저 분리 (P3 남은 것) | prototype/v2-three/NEXT_STEPS.md 웨이브2·P4 절 (2026-09-01) | 구현돼 있을 뿐 아니라, v2 가 '선을 못 그려서' 기상 등치선이 없는 게 아님을 보여주는 근거다. |

### A-요금제·상품 (20건 — 없음 2 · 부분 13 · 됨 2)

| 판정 | 체감 | 크기 | 약속 | 출처 | 왜 중요한가 |
|---|---|---|---|---|---|
| 없음 | HIGH | SMALL | 유료 경계가 실제로 작동한다는 전제 — 정본 39~48행 표 전체(FREE/EXPLORER/PRO 칸 구분) | docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md:39-48 (2026-09-14 정본) + prototype/js/confi… | 1차 감사가 통째로 빠뜨린 항목 — 지금 유료 구독이라는 것이 아예 열려 있지 않고, 아래 모든 경계는 스위치를 켜는 날 처음 돌아가는 코드다. |
| 없음 | MEDIUM | MEDIUM | Ask Earthus — FREE 는 '기본(한도)', EXPLORER·PRO 는 ✓(무제한) | docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md:46 (2026-09-14 정본) | 요금표에서 유료의 근거가 '한도 해제'인데 무료 쪽에 풀 한도가 없어 구독해도 달라지는 것이 없다. |
| 부분 | HIGH | LARGE | PRO(₩29,000/월) 한 문장 = '지구의 조건을 바꾸어 시뮬레이션한다'. SCENARIO·SIMULATION·결과 해석이 PRO 전용 칸 | docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md:41,48,70 (2026-09-14 정본) | PRO 칸에서 '기록 남는 계산'이라 부를 수 있는 것은 쓰나미 하나이고 나머지 다섯 버튼은 장면이거나 기관 예보 인용이다. |
| 부분 | HIGH | MEDIUM | Scenario = 태풍 가정 실험 baseline(§F: 풍속 ±15 m/s·눈까지 거리, baselineEventId 기록), 요금 PRO | docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md:29 (2026-09-14 정본) | 기준선은 기록되지만 그 기록이 이 기기 localStorage 안에만 있어, 구독자가 기기를 바꾸면 자기 실험이 사라진다. |
| 부분 | HIGH | LARGE | EXPLORER(₩9,900/월) = REPORT ✓. 리포트 센터는 최신·월간·분기·연간·전망 다섯 갈래 | docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md:47 (2026-09-14 정본) + prototype/v2-three/js… | EXPLORER 를 파는 한 문장이 '보고서를 만든다'인데 정기 발행물은 한 달치 한 장뿐이고 탭은 다섯 개다. |
| 부분 | HIGH | MEDIUM | COMPARE(비교) 탭을 CONTROL → PLUS 로 내린다 = EXPLORER 가 산다. 고급 Intelligence 에 '과거 비교' 포함 | docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md:45,80 (2026-09-14 정본) | '과거 비교'는 태풍 사건에서 실제로 작동하고 있으므로 EXPLORER 가 살 물건이 아예 없는 것은 아니지만, 지금은 무료로 나가고 태풍 밖에서는 없다. |
| 부분 | HIGH | MEDIUM | 고급 Intelligence 7종(ANOMALY·WHY·RELATION·IMPACT/FOR ME·Confidence·변화 추적·과거 비교)을 EXPLORER 가 전부 받는다 | docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md:45 (2026-09-14 정본) | 요금표가 ✓ 하나로 묶어 파는 7종 중 EXPLORER 결제가 실제로 열어 주는 것은 3종이고, 나머지는 이미 무료이거나 태풍에만 있다. |
| 부분 | HIGH | LARGE | 기본 Intelligence(WHAT·CHANGE·기관 예보·특보)는 FREE, 고급은 EXPLORER — 즉 현상마다 인텔 띠가 뜬다는 전제 | docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md:44-45 (2026-09-14 정본) | 구독자가 지구에서 아무 현상이나 눌렀을 때 인텔 띠를 볼 확률이 34분의 4이고, 5칸이 다 차는 것은 태풍 하나다. |
| 부분 | HIGH | SMALL | 구독 화면이 파는 목록 — EXPLORER 11항목 / INTELLIGENCE 11항목 | prototype/js/billing.js:100-127 (EXPLORER_FEATURES), 133-165 (INTELLIGENCE_FEATURES) — 개발… | 결제 화면 22줄 중 18줄이 '준비 중'인데 그중 일부는 이미 만들어져 있어, 사용자는 있는 것도 없다고 읽고 없는 것도 살 수 있다고 읽는다. |
| 부분 | MEDIUM | SMALL | REPORT = EXPLORER 영역(표 47행). 요금 id 는 explorer / intelligence 두 단 | docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md:47,69-70 (2026-09-14 정본) | 동작은 맞지만 자료를 그대로 읽는 사람(내부 감사·문서)은 280건이 전부 ₩29,000 칸에 있는 것으로 오해한다. |
| 부분 | MEDIUM | MEDIUM | REPORT·SIMULATION 은 유료 칸 — 즉 v2 화면이 사용자 등급을 알아야 한다 | docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md:47-48 (2026-09-14 정본) | 판매가 열리면 v1 을 거치지 않고 /v2/ 로 바로 들어온 구독자는 무료로 보이고, 반대로 localStorage 한 줄이면 누구나 PRO 화면이 된다. |
| 부분 | MEDIUM | LARGE | 연구 작업 공간 — 자료·조건을 고정해 실험을 실행하고 재현한다 (지구 화면 ⚗ 버튼) | prototype/v2-three/index.html:1432 (라이브 버튼) + prototype/v2-three/js/research/api-client.j… | 운영에서 ⚗ 를 누른 구독자는 빈 작업공간과 '로컬 서버를 실행하라'는 개발자용 안내를 받는다. |
| 부분 | MEDIUM | MEDIUM | 유사 사건(analog) · 사후 리뷰(예보 대 실제) — EXPLORER 가 지금 사는 것(soon 아님) | prototype/js/billing.js:101-104 (EXPLORER_FEATURES, soon 없음) | 결제 화면이 '지금 파는 것' 두 줄로 적은 것 중 하나는 태풍에서 실제로 작동하고 하나는 화면이 없다. |
| 부분 | LOW | SMALL | 사건 추적 · 알림 — 관심 지점 20곳까지, 의미 있는 정정이 나오면 알린다 (무료는 1곳) | prototype/js/billing.js:105-106 (EXPLORER_FEATURES, soon 없음 = 지금 파는 것) | 지금 사용자는 손해가 없지만, 판매를 여는 날 EXPLORER 의 핵심 차별(20곳)을 구현할 코드가 아직 한 줄도 없다. |
| 부분 | LOW | SMALL | 발행본은 reports/published/ 아래에 있고 버킷 정책이 그 접두사를 연다 → 공개 200 | aws/_shared/publication_privacy.py:52 + docs/earthus-v2/INTEGRATION-10-RESULT.md:99 | 지금은 보이지만 reportBase 를 상대경로로 되돌리는 순간 리포트 센터 전체가 403 이 되므로, 유료 칸의 유일한 발행물이 설정 한 줄에 매달려 있다. |
| 확인 불가 | HIGH | SMALL | 창립 멤버 500명 — '언제나 정가의 반값'(이용약관 제8조 제7항). 사전등록 화면에 라이브로 걸려 있다 | prototype/index.html (라이브) · docs/FOUNDING-500.md:9-15 vs AGENTS.md:40 | 반값 경로가 실제로 운영 DB 에 없는 채 판매를 열면 창립 멤버가 정가를 내고 그건 약관 제8조 제7항 위반이다. |
| 확인 불가 | LOW | SMALL | (요금제 정본에 약속 없음 — 과제가 확인을 요청한 항목) 오프라인 팩 | prototype/js/earthus2/v02/paid/offline-trip-pack.js · docs/PRODUCT-STRUCTURE-AND-TIERS-20… | 돈을 받는데 없는 것이 아니라 아무 데도 약속되지 않은 채 라이브러리에만 있는 것이라, 팔 생각이면 문서부터 있어야 한다. |
| 확인 불가 | LOW | SMALL | (요금제 정본에 약속 없음 — 과제가 확인을 요청한 항목) 국가 잠금해제 | prototype/js/earthus2/v02/paid/country-unlock.js · docs/PRODUCT-STRUCTURE-AND-TIERS-2026-… | 후원으로 국가를 여는 상품은 어느 요금제 문서에도 없어서, 구독자 관점에서는 존재하지 않는 기능이다. |
| 됨 | HIGH | SMALL | 쓰나미 도달시간 = Physics 시뮬레이션, PRO(정본 표 30행) | docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md:30 (2026-09-14 정본) | PRO 가 오늘 온전히 파는 유일한 계산이고, 기관 발표와 대조까지 붙어 있는 것도 이것 하나다. |
| 됨 | HIGH | SMALL | LAB 사건 분석 보고서 — 사건 당시 입력과 계산 회차를 보존하고 종료 뒤 관측과 대조한다 | prototype/lab-reports.html (라이브) · docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md:47 REPO… | EXPLORER 결제로 손에 쥘 수 있는 가장 큰 실물 덩어리이고, 실제로 운영에 280건이 올라가 있다. |

### A-인텔리전스·자료 (17건 — 없음 1 · 부분 11 · 됨 5)

| 판정 | 체감 | 크기 | 약속 | 출처 | 왜 중요한가 |
|---|---|---|---|---|---|
| 없음 | HIGH | SMALL | ANOMALY·PATTERN = EXPLORER (FREE 는 결과 일부 노출 뒤 잠금) — 1차가 빠뜨린 항목 | docs/INTELLIGENCE-LAYER-PLAN-2026-09-14.md:96 (§3.1) + docs/PRODUCT-STRUCTURE-AND-TIERS-2… | EXPLORER(₩9,900/월)가 66현상을 통틀어 독점으로 파는 내용이 오늘 현상 2개 3칸뿐이고, 가장 값어치 있는 '평년 대비'와 '여진 모형'은 무료로 나간다. |
| 부분 | HIGH | SMALL | phenomenon-registry `intelligence:true` 34현상 — 고르면 문맥 한 줄에 '해석' 칩이 뜨고 5절(WHAT/WHY/NEXT/IMPACT/EVIDENCE) 띠가 붙는다 (계약 §C-0 표, LAYER-PLAN §2.2) | docs/EARTHUS-CORE-ARCHITECTURE-AND-EXECUTION-CONTRACT-2026-09-14.md:99-109 (2026-09-14) +… | 유료 등급이 파는 '해석'이라는 말이 화면에 34번 찍히는데 실제로 열리는 것은 4번뿐이라, 구독자가 나머지 30번을 만날 때마다 속았다고 느낀다. |
| 부분 | HIGH | LARGE | §D PRO Simulation 8단계 — `Simulation Request → ①Consent Check → ②PRO Check → ③Human Approval → ④Engine → ⑤SimulationRunRecord → ⑥runRef → ⑦Result → ⑧3D·Report·Narration`,… | docs/EARTHUS-CORE-ARCHITECTURE-AND-EXECUTION-CONTRACT-2026-09-14.md:146-156 (§D), :419 (§… | PRO(₩29,000/월)가 'SIMULATE THE EARTH'로 파는 것은 오늘 실행 권한이 아니라 '이미 배치로 계산돼 있는 도달시간을 볼 권한'이다 — 구독자가 조건을 바꿔 돌릴 수 있는 것이 하나도 없다. |
| 부분 | HIGH | SMALL | `capabilities.forecast: true` → 인텔 패널의 NEXT 탭이 열리고 '예보' 칩이 붙는다 (CAP_TAB `next: 'forecast'`) | prototype/v2-three/js/ui-shell.js:318 + 계약 §C-0:105 'NEXT — Intelligence의 핵심 상품' | '예보' 칩을 보고 NEXT 탭을 연 구독자가 빈 카드를 만나는 현상이 3개 있고, 그중 지진은 사람들이 가장 앞을 궁금해하는 현상이다. |
| 부분 | MEDIUM | MEDIUM | J-7 `동의·PRO·승인 없이 실행 요청 거절` — 검사 자리는 `sim-link.js` + 서버. §E `화면의 모든 시뮬 값은 runRef 링크와 limits[] 문장을 달고 나간다` | docs/EARTHUS-CORE-ARCHITECTURE-AND-EXECUTION-CONTRACT-2026-09-14.md:408 (J-7), :200 (§E) | 한계 문장은 정직하게 뜨지만 runRef 원장이 비어 있어, 구독자가 본 시뮬 값이 어느 실행의 산출인지 되짚을 방법이 없다. |
| 부분 | MEDIUM | SMALL | P4 서술 — earthus-llm 에 §C-2 일곱 검사(FORBIDDEN_CAUSAL·%·confidence 숫자·coverage.missing 절 이름·대피 어휘·특보 해제 오독·스냅샷에 없는 수치)를 '프롬프트 약속이 아니라 서버 바이트' 로 건다 | docs/EARTHUS-CORE-ARCHITECTURE-AND-EXECUTION-CONTRACT-2026-09-14.md:120-136 (§C-2) | 가드가 아직 안 올라가 있다면 '지구와 대화' 답이 인과·확률 문장을 낼 수 있고, 그것 하나가 EARTHUS 가 파는 '정직함' 전체를 깎는다. |
| 부분 | MEDIUM | MEDIUM | P5 보고서 — report-engine 에 `phenomenon-intel` 종류. 완료 기준 '`reports/published/` 에 한 건 · 색인 갱신' | docs/INTELLIGENCE-LAYER-PLAN-2026-09-14.md:88 (P5) | 요금제 정본이 'EXPLORER = Report' 라고 선을 그었는데(PRODUCT-STRUCTURE:50) 그 Report 가 아직 CLI 안에만 있어, EXPLORER 가 파는 두 기둥 중 하나가 화면에 없다. |
| 부분 | MEDIUM | MEDIUM | 요금제 게이트 — ANOMALY·PATTERN·WHY·RELATED·IMPACT·Confidence = EXPLORER, 시뮬 실행 = PRO, FREE 는 결과 일부 노출 뒤 잠금 | docs/INTELLIGENCE-LAYER-PLAN-2026-09-14.md:96-98 (§3.1) + docs/PRODUCT-STRUCTURE-AND-TIER… | 오늘은 구독 자체가 닫혀 있어(SALES_OPEN:false) 아무도 돈을 낼 수 없고, PAID 로 켜는 순간 잠글 내용이 아래 항목만큼밖에 없다. |
| 부분 | LOW | MEDIUM | P2a 변화 창고 — `intel/change/{layer}.json` 롤업 Lambda `aws/intel-rollup/`. 완료 기준 '롤업 파일 생성 주기 확인' | docs/INTELLIGENCE-LAYER-PLAN-2026-09-14.md:85 (P2a) | '변화 추적'은 EXPLORER 로 파는 항목인데 그 창고가 배포도 안 됐고 화면이 읽지도 않아, 태풍 말고는 변화가 나올 곳이 없다. |
| 부분 | LOW | SMALL | §L-4 선행조건 3 — `phenomenon-registry.js` 갱신: `hazards.glacial_lake_flood` 를 알래스카 지역 한정으로 켠다. §I P0 에 배치. 신규 수집기 `aws/glacial-lake-us` | docs/EARTHUS-CORE-ARCHITECTURE-AND-EXECUTION-CONTRACT-2026-09-14.md:525 (§L-4), :531 (§L-… | 보류 이유가 코드에 적혀 있어 정직하지만, 메뉴에 LOCKED 항목이 하나 더 남는다. |
| 부분 | LOW | MEDIUM | S-A `ScenarioCompare` 컴포넌트 — baseline vs branch 비교. §K-5 '내 시뮬레이션 목록'의 비교 화면 | docs/EARTHUS-CORE-ARCHITECTURE-AND-EXECUTION-CONTRACT-2026-09-14.md:360 (§I S-A), :460 (§… | 비교할 실행이 아직 0건이라 지금 배선해도 보여 줄 것이 없다 — 계약 §I 순서상 일정대로 미배선이다. |
| 부분 | LOW | SMALL | §2.3 연결표 `prototype/v2-three/js/phenomenon-relations.js` — `{from,to,relation,evidenceRef}` 로 RELATED·IMPACT 를 만들고, `reference` 는 문헌 표기와 함께 화면에 '교과서 관계'로 보인다 — 1차가 빠뜨린 항목 | docs/INTELLIGENCE-LAYER-PLAN-2026-09-14.md:74-76 (§2.3) | 계약 §C-0 이 빈 띠를 금지하므로 지금은 배선해도 보일 곳이 없다 — 띠가 넓어질 때 같이 이어야 할 숙제다. |
| 됨 | LOW | SMALL | P0 완료 기준 — `phenomenon-registry` 의 `intelligence:true` 66건 재감사 | docs/INTELLIGENCE-LAYER-PLAN-2026-09-14.md:83 (2026-09-14) vs docs/INTEL-REAUDIT-2026-09-… | 사용자에게는 보이지 않는다 — 계획 문서 한 줄의 숫자 오타다. |
| 됨 | LOW | SMALL | §G-2 실측 — `SIM_CAPABILITIES` 는 12항목이고 그중 `not_available` 이 8건. §I '여진 승격 — PRO 엔진 수 2→3' | docs/EARTHUS-CORE-ARCHITECTURE-AND-EXECUTION-CONTRACT-2026-09-14.md:264 · :368 vs docs/IN… | 사용자에게는 보이지 않지만, PRO 가 오늘 실제로 파는 엔진이 1개라는 사실이 계약 본문에는 2개로 적혀 있다. |
| 됨 | LOW | SMALL | P2 (b) 기후값 확장 — 한국 ASOS 30년 평년. 산출물 `aws/climatology/build_kma_normals.py`. 완료 기준 '평년 출처·기간이 패킷 `baseline` 에 찍힘' | docs/INTELLIGENCE-LAYER-PLAN-2026-09-14.md:85 (P2b) | '평년보다 몇 도'는 구독자가 가장 먼저 묻는 해석이고, 그 근거 기간(1991-2020)이 화면 값에 실제로 붙어 나간다. |
| 됨 | LOW | SMALL | §C-3 어휘 단일 정본 — EVIDENCE_KIND 10종·FORBIDDEN_CAUSAL 9어휘·고정 문장을 한 파일에 두고 Python·JS 가 같이 읽는다. '정규식을 두 언어에 중복해 박지 않는다' | docs/EARTHUS-CORE-ARCHITECTURE-AND-EXECUTION-CONTRACT-2026-09-14.md:138-140 | 사용자에게 보이지 않는다 — 금지 어휘가 두 언어에서 어긋날 위험이 시험으로 잠겨 있다. |
| 됨 | LOW | SMALL | P6 완료 기준 — '현상별 5칸 표' 생성물 | docs/INTELLIGENCE-LAYER-PLAN-2026-09-14.md:89 (P6) — 1차가 빠뜨린 항목 | 사용자에게는 안 보이지만, 이 표가 있어 '어느 현상이 어디까지 되는가'를 팔기 전에 내부에서 먼저 볼 수 있다. |

### A-UI·모바일 (17건 — 없음 2 · 부분 11 · 됨 4)

| 판정 | 체감 | 크기 | 약속 | 출처 | 왜 중요한가 |
|---|---|---|---|---|---|
| 없음 | HIGH | SMALL | UX 수리 지시서 §7.2 "사용자가 1차 메뉴를 선택하면: 1. Navigation drawer를 닫는다 … 4. 지구가 다시 최대 영역을 확보한다" + §10 체크 "모바일에서 메뉴가 지구를 가리지 않도록 한다" | docs/icon-system/EARTHUS_V2_CURRENT_UX_PROBLEM_REPAIR_DIRECTIVE_v1.0.md:293-299, 371 (202… | 돈을 낸 사람이 폰에서 자료를 하나 켜면 방금 산 결과 카드가 서랍 뒤에 가려져, 한 번 더 지구를 눌러 서랍을 치워야 값을 볼 수 있다. |
| 없음 | HIGH | LARGE | PILOT SCREEN SPEC — 쓰나미 INTELLIGENCE 에 WHY/WHAT/NEXT/IMPACT/EVIDENCE 5절을 채운다 | docs/PILOT-SCREEN-SPEC-TEMPERATURE-TSUNAMI-2026-09-18.md:79-90 (2026-09-18) | '완전한 케이스'로 고른 파일럿 현상조차 Intelligence 띠가 뜨지 않아, 구독자가 제품의 대표 기능을 한 번도 제대로 볼 수 없다. |
| 부분 | HIGH | MEDIUM | 인텔리전스 능력 줄은 "없는 능력은 적지 않는다 — '준비 중'으로 위장하면 사용자는 곧 열린다고 읽는다" (해당 코드 자신의 규칙) · 계약 §C-0 "빈 NEXT 카드를 만들지 않는다 — 결과가 없으면 절 전체를 숨긴다" | prototype/v2-three/js/ui-shell.js:1167-1169 주석, docs/EARTHUS-CORE-ARCHITECTURE-AND-EXECUT… | 유료 구독의 핵심 상품인 '해석'이 30개 현상에서 글자로만 존재해, 눌러도 아무것도 안 나오는 경험이 4번 중 3번 이상 반복된다. |
| 부분 | HIGH | SMALL | 정보 접근성 CSS 가 맡는 것 = "글자 크기·대비·최소 터치 영역(44px)·포커스 표시" | prototype/v2-three/js/information-access.css:3 (2026-09-05), prototype/v2-three/index.htm… | 2026-09-20 에 권역 이동 칩을 없애면서 지역 이동의 유일한 통로가 된 ⌕ 검색이 30×28px 이라, 폰에서 장소를 찾는 첫 동작부터 잘 안 눌린다. |
| 부분 | MEDIUM | SMALL | 정보 접근성 보고서 §7 "텍스트를 200% 확대해도 정보와 기능이 사라지지 않는 기준으로 실제 검수해야 한다"(W3C resize-text 인용) + information-access.css 가 맡는 것에 "글자 크기" 포함 | docs/information-access-20260905/report.md §7 표 아래 단락 (2026-09-05), prototype/v2-three/js… | 글자를 키워 읽는 구독자가 브라우저 확대라는 마지막 수단까지 막혀 있어, 접근성을 표방한 화면이 정작 본인에게는 안 맞는다. |
| 부분 | MEDIUM | LARGE | PILOT SCREEN SPEC — 기온 INFORMATION(바텀시트 half)에 '28.4°C [OFFICIAL_OBSERVATION] / 1h +0.6°C / 6h +2.1°C / 24h 추이 그래프 / 습도 72% · 바람 2.1 m/s / 기상청 동네예보' 를 띄운다 | docs/PILOT-SCREEN-SPEC-TEMPERATURE-TSUNAMI-2026-09-18.md:19-33 (2026-09-18) | '서울 기온'이라는 가장 기본적인 질문에서 구독자가 받는 것은 모델 분석값 네 줄이고, 파일럿이 약속한 관측·변화·추이는 아직 없다. |
| 부분 | MEDIUM | MEDIUM | 아이콘 적용 지시서 V2 §6 "On selecting a subject, expose: Current / Change / Anomaly / Compare / Intelligence" · UX 수리 지시서 §4 "선택 후 context panel: 현재 / 변화 / 이상징후 / 비교 / Intellig… | docs/icon-system/EARTHUS_V1_V2_ICON_APPLICATION_DIRECTIVE_v1.0.md:30-36, docs/icon-system… | '두 조건을 비교한다'는 유료 티어의 대표 약속인데 모듈과 시험만 있고 화면에 문이 없어, 구독자가 그 기능에 도달할 방법이 없다. |
| 부분 | MEDIUM | SMALL | 첫 방문 안내 2단계 — "EARTHUS는 지형·날씨·해양·사람·재해, AETHERUS는 우주·궤도" (영어 'terrain, weather, ocean, people and hazards') | prototype/v2-three/js/onboard.js:51 (한국어), :30 (영어) | 첫 화면에서 읽는 다섯 이름 중 둘이 서랍에 없어, 돈 낼지 판단하는 첫 1분에 '지형은 어디 갔지'로 시간을 쓴다. |
| 부분 | MEDIUM | SMALL | 첫 방문 안내 3단계 — "지구를 우클릭하면 그 자리의 빠른 메뉴가 뜹니다" / 'Right-click the globe for a quick menu' | prototype/v2-three/js/onboard.js:58 (한국어), :35 (영어) | 폰 구독자에게 '우클릭'이라고만 알려 줘, 이미 만들어 둔 가장 빠른 진입 경로를 끝까지 모르고 쓴다. |
| 부분 | MEDIUM | MEDIUM | 정보 접근성 보고서 §7 지도 접근성 — "지도와 대응하는 목록/표, 키보드 선택, 색 외 단위·문자" / 완료 조건 "지구 드래그 없이도 장소의 값을 찾을 수 있음" | docs/information-access-20260905/report.md §7 표 '지도 접근성' 행 (2026-09-05) | 마우스를 못 쓰는 구독자는 지구 위 사건을 직접 고를 수 없고, 포커스가 지구에 멈추면 아무 키도 듣지 않는다. |
| 부분 | MEDIUM | SMALL | '권역 이동' — 한반도·전 지구·동북아시아·동남아시아·남아시아·오세아니아·유럽·중동·아프리카·북미·남미·북극·남극 13칸으로 그 구도로 날아간다 | docs/information-access-20260905/menu-inventory.json:289-481 (2026-09-05 생성 스냅샷), 대체 주장은… | 확대해 들어간 구독자가 '전 지구로 돌아가기'와 극지 구도를 부를 버튼이 없어, 휠로 직접 빼는 수밖에 없다. |
| 부분 | LOW | SMALL | '내 위치로 이동' — 내 주변 정보를 보려고 카메라를 내 위치로 옮긴다 | docs/information-access-20260905/menu-inventory.json:705 (2026-09-05), 대체 주장은 prototype/v… | '내 지역'을 등록해도 지구는 그 자리로 가지 않아, 내 동네를 눈으로 확인하려면 직접 돌려 찾아야 한다. |
| 부분 | LOW | SMALL | PILOT SCREEN SPEC EVIDENCE 절 "기상청 ○○관측소 · 관측 20:10 · 예보 발표 17:00" / 정보 접근성 보고서 §7 "observedAt / validAt / issuedAt / retrievedAt 분리" | docs/PILOT-SCREEN-SPEC-TEMPERATURE-TSUNAMI-2026-09-18.md:44, docs/information-access-2026… | 관측 시각과 발표 시각은 이미 화면에 나오고 EVIDENCE 절에서만 상대시간이라, 구독자가 실제로 헷갈릴 여지는 작다. |
| 됨 | LOW | SMALL | 계약 §C-0 M1 — 폰에서는 3단 바텀시트(peek → half → full), Context Action 은 새 부품이 아니라 이 시트에 흡수 / 모바일 안전영역(viewport-fit=cover) | docs/EARTHUS-CORE-ARCHITECTURE-AND-EXECUTION-CONTRACT-2026-09-14.md:89-95 (2026-09-14) | 모바일 셸 자체는 약속대로 들어가 있어, 문제는 이 시트가 아니라 그 앞을 막는 서랍과 30×28 상단 버튼이다. |
| 됨 | LOW | SMALL | menu-inventory.json 5절 v2 제안 — '메뉴·질문 검색'(menu-search)과 '켜진 자료만'(active-only) 구현됨 | docs/information-access-20260905/menu-inventory.json:257,267 · :271,283 (2026-09-05) | 57개 레이어에서 원하는 것을 찾는 통로는 실제로 작동하므로 여기에 시간을 쓸 필요가 없다. |
| 됨 | LOW | SMALL | menu-inventory.json: v1 생활 질문 진입점 5개(지금 날씨 / 지금 어떤 경보 / 바다 활동 / 오늘 어디를 / 오늘 밤 하늘) 구현됨(menu-information.js) | docs/information-access-20260905/menu-inventory.json:2235,2251,2267,2283,2299 (2026-09-05) | 무료 v1 의 생활 질문 진입은 그대로라, 유료 판단에 영향이 없다. |
| 됨 | LOW | SMALL | menu-inventory.json AETHERUS: ISS 수동 위치 입력은 보고서 6절이 '추가로 필요'라 적었지만 이미 구현됨(mission-observer.js) | docs/information-access-20260905/menu-inventory.json:4363, docs/information-access-202609… | 위치 권한 없이도 ISS 통과를 볼 수 있어, AETHERUS 쪽 접근성에는 구멍이 없다. |

