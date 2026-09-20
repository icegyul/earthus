# -*- coding: utf-8 -*-
"""매트릭스 결과에 비평(critic)을 합친다.
비평가 에이전트는 세션 사용 한도로 실패했다(2026-09-20 09:4x). 아래 비평은 본 세션이 9개 메뉴 결과(63칸)를
직접 읽고 쓴 것이다 — 에이전트 산출물이 아니라는 사실을 문서에도 적는다.
사용: python merge_critic.py <matrix-output.json> <merged.json>"""
import json
import sys

src, out = sys.argv[1:3]
doc = json.load(open(src, encoding="utf-8"))
res = doc.get("result", doc)

CONTRACT = """> 비평가 에이전트가 세션 사용 한도로 실패해, 이 절(1-2·1-3·1-5)은 본 세션이 9개 메뉴 결과를 직접 읽고 썼다.

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
| `simulation` | Simulation workspace | `sim-questions.js` SIM_CAPABILITIES 와 **같은 표**를 본다(두 번 적지 않는다) |"""

FIRST_VERTICAL = """**06 재해 — '지진 1탭 → 쓰나미 도달시간'.** 9개 메뉴 중 ①~⑦ 이 '진짜'로 가장 많이 채워지는 사슬이다(🟡 6 · ❌ 1).
- **⑦ 이 진짜다.** `aws/tsunami-eta` 는 SIM_CAPABILITIES 에서 유일한 AVAILABLE 이고(15분 스케줄 · 연안 38곳 · PTWC 게시문 대조), Current → Baseline(PTWC ETA) → Scenario(이 사건 / 최근 30일 다른 사건) → Result(연안 ETA + 기준 대비 차) 가 **새 엔진 없이** 성립한다.
- **⑥ 에 패킷이 있다.** 지진 인텔 패킷(`ocean/earthquake-intel.json`)이 여진 순서를 실제 대 모형으로 채점까지 해서 싣는다. 태풍은 5절 전부.
- **⑤ 에 자료가 있다.** 태풍 회차 ↔ 회차(`revisions[]` + 불변 아카이브)와 KMA \\| JMA 기관 비교가 이미 표로 돌아간다(`intel-feed.js:605-637`). 남은 것은 작업 공간뿐이다.
- **매일 시연된다.** M4.5+ 지진은 매일 있고 쓰나미 계산본 색인은 최근 30일을 든다 — 태풍 비수기에도 보여줄 수 있다.
- **무료다.** 안전 정보는 구독과 무관하게 열려 있으므로, 이 사슬은 **모든 방문자에게 7단계 문법을 가르치는 입구**가 된다.

그래서 길을 둘로 낸다.
- **가로(G1)** — W0 → W1 → 기온 · 바람 · 강수 · 해양: 4개 메뉴의 ① 과 ④ 를 한꺼번에 채운다. *화면 인상*이 바뀐다.
- **세로(First Vertical)** — 재해 한 메뉴를 ①~⑦ 끝까지: Inspector · Compare · Intelligence Inspector · Simulation 작업 공간이 **최소 형태로 일찍 태어난다.** *문법*이 증명된다.
두 길은 부품이 겹치지 않아 동시에 갈 수 있다(가로 = 렌더러·프레임 / 세로 = Inspector·작업 공간)."""

BUILD_ORDER = [
    "**공용 프레임 저장소 + W0** — GFS 프레임 로더를 `CloudManager` 에서 떼어내고(`main.js:1814-1844`), 수집기에 TMP 2m · UGRD/VGRD 10m · PRMSL · APCP 를 추가한다. 매니페스트에 **`runs[]` 포인터**(최근 4런)를 같이 넣는다 — 이 한 줄이 기온·바람·강수·구름의 ⑤ '런 ↔ 런'을 연다. ①·④·⑤ 의 재료가 여기서 한 번에 나온다.",
    "**`field-scales.js` + FieldRenderer + Legend** — 색 경계 · 범례 · 등치선이 한 표에서 나온다. 기온이 기준 구현체, 강수·수온·대기질·고도가 두 번째 소비자. ① 이 채워진다.",
    "**Inspector 껍데기 + ValueCard + ProvenanceCard + 클릭 규칙** — ②·③. ⚠️ 지금 좌클릭은 국가 선택으로 간다(`main.js:2793-2843`) — **'현상이 켜져 있으면 값 판독이 먼저'** 라는 규칙을 셸에서 한 번 정한다(9개 메뉴가 각자 정하면 문법이 갈라진다).",
    "**GlobalTimeline ↔ descriptor.frames** — ④. 지금 `setTimeOffset` 은 서울 혼잡과 태풍 경로 둘만 분기한다(`live-layers.js:2857-2902`). 메뉴별 분기를 없애고 저장소가 descriptor 를 읽게 한다.",
    "**EventLayer + 사건 pick** — 재해의 ①·②. 규모 × 깊이 구간색 점, 14건 절단 제거, 공용 Legend 의 첫 '사건' 구현.",
    "**Compare workspace 최소형** — 새 자료가 필요 없는 짝부터: **시각 ↔ 시각**(바람·강수 — 저장소의 두 프레임) · **회차 ↔ 회차**(태풍 — 이미 있는 `revisions[]`) · **날짜 ↔ 날짜**(지형 위성 바탕 — `loadGibsBase` 가 이미 `dayShift` 를 받는다). split · wipe 먼저, diff 는 **같은 물리량끼리만**(구름의 관측 IR 대 모델 구름수처럼 물리량이 다르면 diff 금지). 그다음 런 ↔ 런, 관측 ↔ 모델, 마지막이 모델 ↔ 모델(ECMWF 격자 수집기 뒤).",
    "**Intelligence Inspector** — 수치 → 출처 → 문장. 패킷에 `attribution[]` · `probability[]` 절, 서술 가드 개정(근거 있으면 통과). 첫 확률은 **태풍**(ECMWF 51멤버 경로가 이미 있다)과 **오로라**(SWPC 공식 확률 + `lab-events` 가 이미 채점 중 — W37 평균오차 0.91 Kp).",
    "**Simulation workspace 최소형** — `tsunami-eta` 를 감싸는 것으로 시작한다. 그다음 **엔진 하나로 세 메뉴**: `transport-simulator.js` 의 `advectPoint`(RK2 · cos 위도 · vectorProof 필수 · 지금 v2 소비자 0건) + W0 의 u/v 41프레임 = 바람 '여기서 놓은 공기는 어디로 갈까' · 구름 '이 구름은 언제 내 위에 오나' · 대기질 '이 먼지는 어디서 왔나'. 이어서 해양 표류(`research-runtime`, 계약 §I S-A) · 우주 위성 통과(SGP4).",
]

INCONSISTENCIES = [
    "**요금이 메뉴마다 다르게 적혔다 — 같은 문법이 가장 크게 깨지는 곳.** ② 값 읽기: 6개 메뉴는 무료, 구름·해양·지형은 EXPLORER. ③ 출처: 6개는 무료, 구름·해양·지형은 EXPLORER. ④ 시간축: 기온·강수·구름·재해·우주는 무료, 바람·대기질·지형은 EXPLORER, **해양은 PRO.** 같은 단계가 메뉴마다 다른 값에 열리면 사용자는 규칙을 배울 수 없다 → 전역 규칙 하나로 통일한다(아래 '고쳐야 하는 칸').",
    "**③ 출처를 유료로 적은 칸이 있다(구름·해양·지형).** 출처를 숨기면 '모든 값에 출처와 시각'이라는 v1·v2 공통 원칙과 부딪힌다. 출처·시각·관측/모델 구분은 **언제나 무료**다. 유료는 출처의 *깊이*(원자료 링크 · 처리 이력 · 채점 기록)에서 판다.",
    "**② 의 '클릭'이 메뉴마다 다른 것을 가리킨다.** 기온·바람·강수는 격자 칸 값, 재해·우주는 사건·물체 pick, 대기질은 측정소, 지형은 고도. 부품은 하나(ValueCard)로 두고 `value.read` 로 갈라야 한다 — 지금 초안들은 메뉴마다 다른 패널 이름을 쓴다.",
    "**⑤ 의 짝 이름이 제각각이다.** '런↔런'·'회차↔회차'·'런 간 비교'·'리드타임 비교'가 섞여 있다. `type` 을 8개로 고정한다: time · run · model · agency · revision · obsModel · date · scenario.",
    "**⑦ 에서 '입구 + 사유'와 '칩 비활성'이 섞여 있다.** 강수·구름은 ❌(입구 자체가 없음), 나머지는 입구는 있고 엔진이 없음. PD 문법은 '입구는 같은 자리'이므로 **9개 전부 입구를 두고** 가용성만 다르게 말한다.",
    "**대기질만 자료가 Open-Meteo 경유다**(CAMS 를 Open-Meteo 가 중계). 그 메뉴의 첫 단면은 스스로 'FREE_OPEN 임시 — 결제 개시 조건에서 제외'라고 적었다. 옳은 판단이고, 다른 메뉴의 문법과 섞이지 않게 **범례에 상시 표기**해야 한다.",
]

CELL_FIXES = [
    {"menu": "04 구름 · 05 해양 · 09 지형", "step": 2, "fix": "기본값 읽기는 **무료**로 통일. EXPLORER 는 '정확값(실측 0.1 단위) + 최근접 관측 대조 + 내 위치 5일 곡선'."},
    {"menu": "04 구름 · 05 해양 · 09 지형", "step": 3, "fix": "출처·시각·관측/모델 구분은 **무료**로 통일. 유료는 출처의 깊이(원자료 링크·처리 이력·채점 기록)."},
    {"menu": "02 바람 · 07 대기질 · 09 지형 · 05 해양", "step": 4, "fix": "전역 규칙으로 통일: **+24 h 무료 · +120 h EXPLORER.** 해양의 PRO 는 내린다(시간축은 PRO 의 가치가 아니다 — PRO 는 ⑤·⑦). 지형처럼 시간이 없는 자료는 '이 자료는 시간에 따라 바뀌지 않는다'를 타임라인이 말한다."},
    {"menu": "03 강수 · 04 구름", "step": 7, "fix": "❌ → 입구를 같은 자리에 두고 사유를 말한다. 구름은 '수동 이류(advectPoint + 700hPa 바람)' 후보가 있으므로 '준비 중'이 아니라 **'엔진 있음 · 화면 미연결'** 로 정직하게. 강수는 '정직하게 열 수 있는 엔진 없음'(초단기 이류는 레이더가 좌표계 없는 그래픽이라 입력이 없다)."},
    {"menu": "06 재해", "step": 2, "fix": "❌ 의 원인은 사건 pick 부재. EventLayer 의 pick 을 ValueCard 의 `read: 'eventPick'` 으로 연결 — 규모·깊이·시각·기관을 한 카드에."},
    {"menu": "전 메뉴", "step": 5, "fix": "`compare.pairs[].type` 을 8종으로 고정하고, `available:false` 인 짝도 **칩으로 보이게** 한다(사유 포함). 'GFS | ECMWF' 는 9개 메뉴 어디서도 아직 안 된다 — 숨기지 말고 '격자 수집기 없음'."},
    {"menu": "전 메뉴", "step": 1, "fix": "'EXISTS' 의 정의를 고정한다: **그 칸의 완료 기준(§4 의 acceptance)을 운영 화면에서 통과**했을 때만 ✅. 지금 63칸에 ✅ 가 0 인 것은 이 정의 때문이고, 그게 맞다."},
]

RISKS = [
    "**빈 단계를 억지로 채워 거짓이 되는 것.** ⑤·⑦ 의 재료가 없는 메뉴에 그럴듯한 화면을 만들면 이 제품의 가장 큰 자산(정직성)을 판다. 방어: descriptor 의 `available:false + reason` 을 부품이 그대로 말한다. 입구는 있고, 거짓은 없다.",
    "**좌클릭 충돌.** 값 판독 · 국가 선택 · 사건 pick · 관측소 pick 이 한 클릭을 두고 다툰다. 메뉴마다 규칙이 다르면 ② 가 메뉴마다 다르게 느껴진다. 셸에서 한 번 정한다: 현상 켜짐 → 값 / 사건 위 → 사건 / 아무것도 없음 → 국가.",
    "**발열·성능.** FieldRenderer + 입자 + 라벨 + Compare(렌더러 두 벌)가 겹치면 폰이 못 버틴다. Compare 에서는 입자를 끄고, 모바일은 split 대신 wipe(한 벌 + 마스크), 라벨 예산은 descriptor 에서.",
    "**'런 ↔ 런'이 S3 수명주기에 달려 있다.** 핸들러에 삭제 코드는 없지만 버킷 lifecycle 은 확인 못 했다(UNKNOWN). 이전 런이 지워지면 네 메뉴의 1순위 비교가 한꺼번에 사라진다 — W0 에서 확인하고, 없으면 '최근 4런 보존'을 명시한다.",
    "**요금 경계가 한 번도 실행된 적이 없다**(`FREE_OPEN`). 7단계에 요금을 입히는 날이 등급 판정 코드가 처음 도는 날이다. G3 전에 PAID 모드로 63칸을 한 번 걸어 보는 시험이 필요하다.",
    "**descriptor 가 비대해지는 것.** 9개 메뉴의 예외를 다 받아 주면 '설정'이 아니라 '메뉴별 코드'가 된다. 규칙: 부품에 `if (menu === …)` 가 생기면 descriptor 설계가 틀린 것이다.",
    "**대기질의 자료 토대.** 지금 CAMS 는 Open-Meteo 경유다. 유료 핵심 그림으로 세우려면 CAMS 직접 수집(Copernicus 계정 · 출처표시)이 선행 — 그 전에는 이 메뉴만 '임시'라는 사실을 숨기지 않는다.",
]

res["critic"] = {
    "contract": CONTRACT, "firstVertical": FIRST_VERTICAL, "sharedBuildOrder": BUILD_ORDER,
    "inconsistencies": INCONSISTENCIES, "cellFixes": CELL_FIXES, "risks": RISKS,
    "_by": "main session (critic agent failed: session limit)",
}
json.dump({"result": res}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("merged ·", len(res["rows"]), "menus · critic sections", [k for k in res["critic"] if not k.startswith("_")])
