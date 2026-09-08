# EARTHUS V2 — PHASE 3 STEP 3.1 UI 감사

| 항목 | 값 |
|---|---|
| 상태 | STEP 3.1 완료 (감사만, 코드 변경 없음) |
| 작성일 | 2026-09-08 |
| 기준 커밋 | `f44f3416` (PHASE 2 완료) |
| 방법 | 3개 영역을 각각 조사하고, 각 주장을 별도 검증자가 file:line 을 다시 열어 반박 |

> 봉인 인계 패키지(2026-08-27)의 일부가 아니다. `SHA256SUMS` 대상이 아니다.

---

## 0. 한 줄 결론

**§0.3 이 겨냥한 "최상위 Intelligence" 는 두 개인데, 둘의 성격이 완전히 다르다.** 하나는 건드리면 안 되고, 하나가 진짜 대상이다. 이것을 구분하지 않으면 제품 이름을 지우게 된다.

---

## 1. "Intelligence" 가 최상위에 있는 두 자리 — 하나는 제품명이다

| | ① `.es-switch` 의 "Intelligence" | ② `#intel-tab` 의 "EARTH INTELLIGENCE" |
|---|---|---|
| 위치 | 좌상단 알약 (`earth-switch.js:69`) | 우측 가장자리 손잡이 (`ui-shell.js:496`) |
| 정체 | **v2 제품 자체의 공개 이름** | 우측 패널을 여는 버튼 |
| 주소 | `/Intelligence` (공개 별칭. `/v2` 는 숨은 직통) | 없음 |
| 형제 | EARTHUS(현재) · **Intelligence(미래)** · WONDER(과거) | — |
| §0.3 대상인가 | **아니다** | **그렇다** |

`earth-switch.js:1-11` 이 스스로 설명한다 — 하나의 서비스가 시간축이 다른 세 지구를 갖고, v2 는 그중 "미래" 지구이며 그 이름이 Intelligence 다. 그리고 같은 주석이 **"AETHERUS(우주)는 여기 넣지 않는다 — 지구가 아니고, 기존처럼 메뉴 안에 둔다"** 고 못박는다.

→ **①은 제품 정체성이자 배포된 공개 URL 이다. PHASE 3 에서 건드리지 않는다.** 지우면 세 제품 사이 이동이 끊기고 `/Intelligence` 링크가 죽는다.

→ **②가 §0.3 이 말하는 "독립적인 최상위 기능처럼 보이는 Intelligence" 다.** 여기를 현상 문맥으로 바꾼다.

덧붙여 "Intelligence" 라는 낱말이 사용자에게 보이는 자리는 최소 11곳이다 — 제품명(`earth-switch.js:69`) · 패널명(`ui-shell.js:496`) · 능력명(`ui-shell.js:653`) · 궤도 인텔리전스(`ui-shell.js:207`) · 온보딩 3번째 카드 제목(`onboard.js:34/55`) · FOR ME 소제목/버튼/머리글(`main.js:3341/3342/3346`) · 쓰나미 안내문(`main.js:3267`) · INTELLIGENCE PRO(`main.js:4322`) · ROUTE INTELLIGENCE(`ext/hobby-vessel.js:35`). 같은 낱말이 제품·패널·능력 세 층위를 동시에 가리킨다.

---

## 2. 항목 1·2 — 현재 메뉴와 진입점 수

상시 진입점(아무것도 열지 않아도 눌러지는 것): **넓은 화면 29개 · 좁은 화면 24개**

| 무리 | 수 | 위치 |
|---|---:|---|
| `#chrome` 아이콘 | 7 | `index.html:1100-1107` (⌕ ✦ ⤴ ? ⚙ ○ ⚗) |
| 하단 바 | 6 | `ui-shell.js:531-542` |
| 브랜드 edge 탭 | 2 | `ui-shell.js:246-255` |
| 우측 패널 손잡이 + 탭 + 닫기 | 8 | `ui-shell.js:496-509` |
| 타임스트립 | 3 | `ui-shell.js:711-715` |
| 좌상단 지구 전환기 | 3 (좁은 화면 1) | `earth-switch.js:182-204` |

**`index.html` 의 `<body>` 는 1095~1212 뿐이다.** 화면에 늘 보이는 것의 절반 이상이 마크업이 아니라 `initShell()` 이 만든 DOM 이다. 그래서 "메뉴를 줄인다" 는 작업은 HTML 편집이 아니라 `ui-shell.js` 편집이다.

메뉴 항목: **EARTHUS 플라이아웃 100** + **AETHERUS 플라이아웃 9** = 109.

---

## 3. 항목 3·4·5 — 메뉴 → 레이어 → 현상 → 능력

레지스트리에서 결정적으로 계산했다(`docs/earthus-v2/menu-migration-map.md` 의 109행이 원본).

| | 값 |
|---|---:|
| 레이어 | 109 |
| 현상에 매핑됨 | **100** |
| 현상이 아님(배경·조작·진입점) | **9** |
| 현상 | **66** |
| 레이어를 2개 이상 흡수하는 현상 | **20** (이들이 54개 레이어를 흡수) |
| 레이어 1개짜리 현상 | 46 |

**즉 메뉴를 현상 단위로 접으면 100항목이 66항목이 된다.** 그러나 §3 이 말한 대로 목적은 "100을 66으로 줄이는 것"이 아니라 **처음부터 100을 안 보여주는 것**이다. 그 장치가 도메인 7개다.

### 도메인별 현상 수와 준비 상태

| 도메인 | 현상 | ready | partial | planned |
|---|---:|---:|---:|---:|
| ocean | 18 | 16 | 1 | 1 |
| weather | 16 | 7 | 9 | 0 |
| space | 8 | 6 | 2 | 0 |
| land | 7 | 6 | 1 | 0 |
| hazards | 7 | 5 | 1 | 1 |
| travel | 6 | 3 | 1 | 2 |
| people | 4 | 4 | 0 | 0 |

ocean 18 · weather 16 은 한 목록으로 보기엔 여전히 많다. 준비 상태 순 정렬이 1차 완화책이다.

### 능력별 현상 수

`current=47 · history=6 · intelligence=44 · forecast=13 · simulation=2 · evidence=62 · report=7`

---

## 4. 항목 6 — 중복 진입점

**20개 목적지가 서로 다른 67개 경로로 도달된다(중복 47개).**

가장 큰 것들:

| 목적지 | 경로 |
|---|---|
| `#intel` feed 탭 | 하단바 '무슨 일' · 탭 버튼 · 메뉴 3항목 · WHY 의 '사건 열기' · FOR ME '근거 보기' · **첫 방문 자동 열림**(`main.js:4837-4851`) — 6경로 |
| EARTHUS 플라이아웃 | EARTHUS edge 탭 · 하단바 '더보기' · 하단바 날씨/바다(섹션 스크롤) — 4경로 |
| AETHERUS 플라이아웃 | AETHERUS edge 탭 · 하단바 '우주' — 2경로 |
| 구름·눈·등심선 상태 | 메뉴 레이어 · 설정 서랍 — 각 2경로 |

**하단 바 6개 중 5개가 다른 진입점이 이미 가는 곳으로 다시 간다.** 그리고 하단 바는 씬을 켜지 않는다 — 메뉴만 연다(`gotoScene` 은 `openPanel`+스크롤, `ui-shell.js:545-551`).

---

## 5. 항목 7 — 고아

- **현상 체계 밖 레이어 9개**: `hazards/feed` · `lab/reports` · `lab/requests` · `land/base-bluemarble` · `land/base-ne2` · `land/base-truecolor` · `land/globe` · `land/locate` · `ocean/oceanfocus`. 이들을 고르면 `getPhenomenonContext()` 가 null 이라 능력 줄이 안 붙는다.
- **화면 없는 메뉴 항목**: `ocean/typhoonsim` (`ui-shell.js:83`, '태풍 해상 시뮬레이션')은 아무것도 렌더하지 않고 `showTab('scenario')` 로 탭만 바꾼다(`main.js:4204-4208`). 그런데 `engine-bridge.js:179` 가 이 키에 `kind:SIMULATION` 진리등급까지 붙여 뒀다.
- **링크 안 되는 독립 페이지**: `prototype/aetherus-lab.html` · `aetherus-device-qa.html` 은 v2-three 어디에서도 참조되지 않는다.
- **`research.html` 이 두 파일**: `prototype/research.html`(15,295 B)과 `prototype/v2-three/research.html`(12,585 B)이 이름만 같고 내용이 다르다.

---

## 6. 항목 8 — 레거시 직접 진입 경로

| 종류 | 값 |
|---|---|
| 해시 파라미터 8개 | `v · at · base · cloud · live · q · pop · c` (`main.js:5626-5697`). `v=1` 이 없으면 통째로 무시 |
| 쿼리 파라미터 3개 | `tab · event · from` (`main.js:5905-5914`) |
| 독립 HTML | v2-three 에서 링크되는 것 8개 |

**딥링크의 구멍**: `?tab=` 은 `my` 하나만 처리한다 — 나머지 5탭은 딥링크가 없다. 그리고 해시에는 **선택한 레이어·현상·사건·탭이 하나도 들어 있지 않다**(`linkState` 는 카메라·base·cloud·live·q·pop·c 뿐). → §23 의 "현상 문맥 재현" 은 지금 불가능하다. 새 라우팅을 도입하지 않고 해시에 필드를 더하는 것이 최소 변경이다.

---

## 7. 항목 9·10·11 — Intelligence · Simulation · Report 진입점

### Intelligence
질문창 `#ask-drawer` 는 **좌상단 `#panel` 안**에 있고 우측 패널과 연결이 없다(PHASE 0 부터 확인된 사실). `/api/ask` 로 POST 한다. 우측 패널은 탭 6개 중 5개가 전역이다.

### Simulation — "시뮬레이션" 이 최소 네 가지를 가리킨다
1. `#intel` `scenario` 탭 (`ui-shell.js:508`) — 태풍 시나리오
2. 설정 서랍 '시뮬레이션 · 표현 튜닝' (`index.html:1150-1179`) — **물리가 아니라 셰이더 유니폼 4개 + 수동 조명 3개.** 시뮬레이션이 아니다
3. 진리등급 배지 어휘 (`engine-bridge.js:63`)
4. 메뉴 항목 이름 '태풍 해상 시뮬레이션' (`ui-shell.js:83`) — 화면 없음

**진짜 시뮬레이션 엔진은 둘뿐이다**: `sim-ocean.js`(Gerstner 14성분) · `aws/tsunami-eta`(√(g·h) Dijkstra). 저장소 전체에 세 번째는 없다.

⚠️ **능력과 내용이 어긋나는 곳**: `hazards.tsunami` 는 `simulation:true` 라 scenario 탭이 열리는데, `getScenario()`(`main.js:4291-4324`)에 쓰나미 분기가 없어 **태풍 카드가 나온다.** 쓰나미 도달시간은 실제로 계산되지만 사건 방에만 있고 버튼이 없다.

### Report
v2 의 리포트 진입로는 `lab/reports` **하나뿐**이고, 그것은 v1 패널을 빌려 `/lab-reports.html` 로 링크한다.

⚠️ **`capabilities.report=true` 인 현상 7종 · 레이어 14개에 리포트 진입 버튼이 0개다.** `CAP_TAB`(`ui-shell.js:298`)에 `report` 키가 없다. 능력은 참인데 갈 곳이 없다.

---

## 8. §30 위반 — 실제 기능 없이 보이는 것

| 것 | 판정 |
|---|---|
| **⚗ 연구 작업 공간** (`index.html:1107`) | **위반.** `js/research/api-client.js:2` 가 `/api/research` 를 부르는데 **운영에 그 백엔드가 없다** — `aws/` 아래 research 서비스가 없고 CloudFront 에 등록된 `/api` 경로는 `/api/ask` 하나뿐이다. 유일한 구현은 로컬 개발 서버(`.claude/launch.json`, 8788). 그런데 `research.html` 은 배포 번들에 실려 나간다. 운영에서 이 단추는 언제나 '계산 서비스 연결 안 됨' + 전 버튼 비활성으로 끝난다 |
| `ocean/typhoonsim` 메뉴 항목 | **위반에 가깝다.** 렌더가 없고 탭만 바꾸는데 이름은 '태풍 해상 시뮬레이션' 이고 진리등급까지 붙어 있다 |
| `hazards.tsunami` scenario 탭 | **위반.** 능력이 약속한 것과 탭이 내놓는 것이 다르다 |
| `LOCKED` 레이어 4개 | **위반 아님.** '데이터 미연결 — 가짜 값 없음' 이라고 정직하게 적는다 |
| EXPLORER PRO 문구 | **위반 아님.** '아직입니다 / not built yet' 이라 명시하고 '사실 근거와 공식 안전정보는 항상 무료' 를 덧붙인다 |
| 🔒 아이콘 (`main.js:3342`) | 반대 사례. 버튼은 **실제로 동작하는데** 자물쇠만 붙어 있다. 같은 줄이 '🔒 는 유료 개시 전까지 모양만입니다' 라고 밝힌다 |

---

## 9. §35 — AETHERUS 구조 결론

**AETHERUS 는 별도 제품 영역도, 별도 navigation context 도 아니다. 완전한 문맥 공유다.**

근거 다섯:
- **같은 DOM** — 같은 `#menu-panel` 을 열고 `SCENES` 를 `group` 으로 거를 뿐(`ui-shell.js:398`). 검색·클릭 위임·`onLayerAction` 이 전부 같은 코드
- **같은 씬** — `new AetherusLink(scene)`(`main.js:2959`) 로 지구와 같은 `THREE.Scene` 에 붙는다
- **같은 카메라** — `hooks.onScene` 은 `main.js:3897` 에서 no-op
- **같은 패널** — 모든 space 레이어 카드가 `#intel` 'now' 탭에 뜬다
- **같은 선택 문맥** — `getPhenomenonContext`·`applyCapabilityGating` 이 space 레이어에도 그대로 돈다

합치면 깨지는 것은 **표현층뿐**이다(group 필터 한 줄 · `.aeth` CSS · 하단바 '우주' 재배선 · i18n 머리글 · 온보딩 문장). 데이터·렌더는 하나도 안 깨진다 — 키가 전부 `space/…` 라 group 과 무관하다.

**그러나 브랜드 결정은 이미 반대 방향으로 문서화돼 있다.** `earth-switch.js:11` 이 "AETHERUS 는 지구가 아니므로 전환기에 넣지 않고 메뉴 안에 둔다" 고 명시하고, 지금 코드가 그 결정을 지킨다.

→ **PHASE 3 에서 AETHERUS 를 EARTHUS 도메인에 합치지 않는다.** 기존 의도와 충돌한다(§35). 정리가 필요한 쪽은 AETHERUS 가 아니라 Intelligence 다.

기록해 둘 결함: 공유 링크는 AETHERUS 9레이어 중 `liveLayers` 계열(aurora·launch·solaract)만 복원하고 `satLayer`(sats·starlink)·`aethLink`(aeth-orbit)는 복원하지 않는다.

---

## 10. PHASE 3 이 실제로 손대야 하는 것 — 우선순위

1. **`#intel-tab` 을 현상 문맥으로** — §0.3 의 진짜 대상. 제품명(`.es-switch`)은 건드리지 않는다.
2. **`report` 능력에 진입점 부여** — 7현상 14레이어가 갈 곳이 없다.
3. **`hazards.tsunami` scenario 내용 수정** — 능력과 내용의 불일치.
4. **해시에 현상·사건 필드 추가** — §23 문맥 재현. 새 라우팅 도입 없이.
5. **중복 진입점 정리** — 67경로 → 목적지 20개.
6. **⚗ 연구 단추** — 운영에 백엔드가 없다. 숨기거나, 로컬 전용임을 밝히거나, 백엔드를 배포한다. **판단이 필요한 항목이라 이번 단계에서 임의로 지우지 않는다.**

---

## 11. 다음

STEP 3.2 — `docs/earthus-v2/ui-information-architecture.md` (OLD → DOMAIN → PHENOMENON → CAPABILITY → NEW ENTRY 매핑)
STEP 3.3 — `docs/earthus-v2/phase-3-ui-contract.md` (UI invariant 10개)
