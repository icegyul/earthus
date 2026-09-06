# FOR ME 개발지시서 v1.0

> ⚠️ **v2.0 으로 대체됨 (2026-09-07)** — `FOR-ME-DEV-DIRECTIVE-v2.0-2026-09-07.md`. 이 문서의 §0.5 코드 줄 목록과 §2 부품 표는 v2.0 이 참조하므로 남긴다. "한 줄 추가"·"유료의 이유 = 잠긴 질문" 정의는 v2.0 §0·§3 으로 바뀌었다.

작성 2026-09-07 · 대상 STEP 2~6 · 전제 STEP 1 완료(커밋 dd68a697, SQL 적용 912b525c)
정본 우선순위: v5.3 §1.4 > `docs/MARITIME-INTELLIGENCE-PRODUCT-SPEC-2026-09-06.md` > `docs/V1-V2-UPSELL-MAP-2026-09-06.md` > 이 문서

## 0. 한 줄 목표

**어느 메뉴에 있든 "이 현상이 내 위치에 영향을 주는가?"를 누를 수 있고, 누른 뒤 어디까지 갔는지 숫자로 남는다.**
2주 뒤 `forme_funnel_daily` 뷰 한 장이 "사용자가 실제로 가장 많이 묻는 것"의 증거가 된다.

## 0.5 비포 → 애프터 (기존 메뉴별로 어디가 어떻게 달라지나)

> 2026-09-07 정정: 처음 판은 비포 화면을 도식으로 줄이면서 실제 요소를 많이 빼먹었다(PD 지적). 아래는 **코드에서 뽑은 실제 요소 전체**다. 원칙은 하나 — **기존 요소는 하나도 지우지도, 옮기지도 않는다.** 바뀌는 것은 "추가되는 한 줄"과 그 줄이 여는 곳뿐이다.

### v1 태풍 시트 — `ui.js:403-437` + `ui-cyclone.js:282 renderCycloneExtras`
| | 지금 있는 것(순서대로) | 변경 |
|---|---|---|
| 1 | `cyclones.detail()` 행: 위치·중심기압·최대풍속·이동방향/속도·발표기관·발표시각 등 (`:410-415`) | 없음 |
| 2 | `_note` 주의 문구 (`:416`) | 없음 |
| 3 | 로딩 안내 `.tc-ld` (`:422-425`) | 없음 |
| 4 | `helperBar` "같이 보면 좋은 화면" 레이어 칩 (`ui-cyclone.js:46`) | 없음 |
| 5 | `explainBlocks` "태풍은 어떻게 생기나" · "왜 기관마다 진로가 다른가" (`:84`) | 없음 |
| 6 | `newsBlock` 관련 뉴스 (`:163`) | 없음 |
| 7 | `linksBlock` 공식 링크 KMA·JMA·JTWC (`:209`) | 없음 |
| 8 | `shareRow` 공유 (`:227`) | 없음 |
| **+** | **FOR ME 한 줄** — "⚠️ 부산 · 영향 가능성 있음 · 언제·왜 → 🔒 EXPLORER" | **8 과 9 사이에 추가** |
| 9 | `safetyActions` 안전 행동(대피·연락) (`ui.js:432`) | 없음, 항상 맨 아래 |

누르면: v2 내 장소 탭 → 이 태풍 카드. 동네 미설정이면 위치 권한창(`myLocation.locate(true)`).
달라지는 것: 1~8 은 "이 태풍이 무엇이고 어디로 가나". 한 줄이 "내 동네는?"을 연다. 그게 전부다.

### v1 지진 시트 — `ui.js:573-643`
| | 지금 있는 것 | 변경 |
|---|---|---|
| 1 | `renderPlaceLine` 발생 지명 (`:583`) | 없음 |
| 2 | `renderOfficial` USGS 공식 링크·이벤트 페이지 (`:585`, `official.js:136`) | 없음 |
| 3 | `renderAgencyCheck` USGS ↔ JMA 대조 (`:626`) | 없음 |
| 4 | `renderFault` 단층 정보 (`:628`) | 없음 |
| 5 | `m.data` 상세 행: 규모·깊이·시각·좌표 등 (`:629-635`) | 없음 |
| **+** | **FOR ME 한 줄** — 400km 안 M5+ 면 "⚠️ 강릉 · 영향 가능성 있음", 아니면 "강릉 · 지금은 영향 신호 없음 · 감시 중" | **5 와 6 사이** |
| 6 | `safetyActions` (`:640`) | 없음 |
| 7 | `_booking` 예약 CTA (있을 때, `:644`) | 없음 |

### v1 쓰나미 시트 — `ui.js:333-350`, 행 정의 `js/layers/tsunami.js detail()`
| | 지금 있는 것 | 변경 |
|---|---|---|
| 1 | 등급 | 없음 |
| 2 | 발표 기관 (NWS/PTWC/JMA/기상청) | 없음 |
| 3 | 대상 구역 | 없음 |
| 4 | 지진 규모 | 없음 |
| 5 | 요약 | 없음 |
| 6 | 발표 시각 · 유효 시각 | 없음 |
| 7 | 원문 게시문 링크 | 없음 |
| 8 | 주의 문구 (`_note`) | 없음 |
| **+** | **FOR ME 한 줄** — 문구는 **"강릉 · 기관 발표 구역에 포함 / 미포함"만**. `ui.js:331` "우리 해석 한 줄도 넣지 않는다" 규칙 준수 | **8 과 9 사이** |
| 9 | `safetyActions` (`:347`) | 없음 |

누르면: v2 내 장소 탭 → 쓰나미 카드. 거기서 우리 ETA 는 SIMULATION_ONLY 배지를 달고 🔒 뒤에 있다.

### v1 날씨 시트 — `ui-weather.js:392-413 _renderV7`
| | 지금 있는 것(섹션 class) | 변경 |
|---|---|---|
| 1 | `renderHero` 현재 날씨 큰 숫자·아이콘 (`:869`) | 없음 |
| 2 | `.wcv7-alert` 공식 특보 띠 (`:398-403`) | 없음 |
| 3 | `wcv7-hourly` 시간별 (`:430`) | 없음 |
| 4 | `wcv7-daily` 일별 (`:892`) | 없음 |
| 5 | `wcv7-intelligence` "EARTHUS WEATHER INTELLIGENCE" 카드 — **특보 발효 중일 때만** (`:921`, gate `OFFICIAL_WARNING_ACTIVE`) | 없음 |
| **+a** | **FOR ME 한 줄** — 특보 발효 중이면 **5 바로 아래** ("⚠️ 부산 · 영향 가능성 있음 · 왜 → 🔒") | 추가 |
| 6 | `wcv7-details` 상세(습도·기압·가시거리…) (`:960`) | 없음 |
| 7 | `wcv7-sources` 출처 (`:1058`) | 없음 |
| 8 | `wcv7-earth` [비][바람][미세먼지] 레이어 버튼 3개 (`:1082`) | 없음 |
| **+b** | **FOR ME 한 줄** — 특보 없으면 **8 아래** ("부산 · 지금은 영향 신호 없음 · 감시 중") | 추가 |

+a 와 +b 는 둘 중 하나만 그린다(같은 줄이 자리만 다르다).

### v1 해양 MY OCEAN — `ui-ocean.js:212-230 myView`
| | 지금 있는 것 | 변경 |
|---|---|---|
| 1 | 제목 "MY OCEAN · 바다 화면 모아보기" | 없음 |
| **+** | **FOR ME 한 줄** — "⚠️ 강릉 · 파고 임계 초과 예상 → 🔒 언제" / "강릉 · 지금은 신호 없음" | **1 과 2 사이** |
| 2 | `.ocean-widget-grid` 6칸: SAFETY · SURF · FISHING · MARINE LIFE · DIVE · ROUTES (`:213-227`) | 없음 |

지역은 `ui-surf.js:523` 순서(① 사용자 선택 ② 지도 중심 ③ 내 위치 ④ 양양) 그대로 재사용. 홈·레이어·항로·생물 뷰는 손대지 않는다.

### v1 대기질 — 한국 패널 `ui-korea.js:610-649 _airObs`
| | 지금 있는 것 | 변경 |
|---|---|---|
| 1 | `<h4>대기질 — 실제로 잰 값</h4>` (`:618`) | 없음 |
| 2 | `.kr-big` 가까운 관측소 큰 숫자·등급 (`:622-627`) | 없음 |
| 3 | `.kr-note` 관측소 주소 (`:631-633`) | 없음 |
| 4 | `.kr-row` 도별 평균(관측소 없을 때 대체) (`:643-646`) | 없음 |
| **+** | **FOR ME 한 줄** — `nearest()` 등급이 나쁨 이상이면 ⚠️, 아니면 "신호 없음" | **4 아래, 출처 줄 위** |
| 5 | 출처 줄 `_src(lf)` | 없음 |

한국 패널의 다른 탭(강수·기온·특보 등)은 손대지 않는다.

### v1 검색 — `search.js:358-369 find()`
| | 지금 있는 것 | 변경 |
|---|---|---|
| 1 | 검색 결과 최대 24행 (도시·레이어·사건·위성…) (`:356`) | 없음 |
| 2 | `type:'ask'` 「…」 물어보기 행 — 2글자 이상이면 항상 맨 아래 (`:358-369`) | 없음 |
| **+** | `type:'for-me'` "📍 강릉을 내 동네로 · 영향 알림 받기" — **검색어가 지명일 때만**, 2 아래 | 추가. `ICON`(`:400`)·타입 태그(`:406`)에 `for-me` 항목 추가 |

24행 상한은 `:356` 에서 먼저 잘리므로 뒤에 붙는 행은 잘리지 않는다(ask 행과 같은 방식).

### v2 내 장소 탭 (도착지) — `main.js:3228-3285 getMyHtml`
| | 지금 있는 것 | 변경 |
|---|---|---|
| 0 | 동네 미설정 상태: MY EARTH 카드 + [내 위치] GPS 버튼 + 위도/경도 직접 입력 + [지도 중심] (`:3230-3235`, `manualPlaceHtml :3227`) | 없음 |
| 1 | 하늘 (천리안 관측 텍스처, 범위 밖이면 그렇다고 씀) (`:3248-3251`) | 없음 |
| 2 | 내 특보 구역 (`:3254`) | 없음 |
| 3 | 구역 특보 (`:3256-3258`) | 없음 |
| 4 | ⚠ 특보 — 주변 60km 유효 특보 (`:3262-3264`) | 없음 |
| 5 | 💨 대기질 — 400km 안 에어코리아 측정소 (`:3265-3270`) | 없음 |
| 6 | 🌬 바람·기온 (`:3271-3274`) | 없음 |
| 7 | 감시 카드 — ON/OFF, 조건 3종(내 구역 특보·팔로우 사건 새 회차·400km M5+ 지진), "앱 열 때·⟳ 때만 판정" (`:3275-3284`) | 없음 |
| **+** | **FOR ME 카드 묶음** — 내 동네에 걸린 사건마다 카드 1장(태풍→쓰나미→지진→파고→특보→대기질). 카드 = FREE 상태 줄 + EXPLORER 구간·원인 + INTELLIGENCE 🔒. 없으면 "지금 내 동네에 걸린 사건 없음 · 감시 중" 한 줄 | **7 과 8 사이** |
| 8 | `<details>각 자료의 기준 시각</details>` + "조회 … 한국 관측망 기준" 푸터 (`:3285`) | 없음 |
| 탭 | 라벨 `my` "내 장소" (`ui-shell.js:439-444`) | "내 장소 · FOR ME" 로 |

달라지는 것: 1~7 은 **내 동네의 지금**(관측·특보). 추가되는 묶음은 **내 동네에 걸린 사건**(판단). 7 의 감시 카드가 이미 400km 지진·내 구역 특보를 판정하고 있으므로, FOR ME 카드는 그 판정을 **재사용**하고 태풍·쓰나미·파고를 더한다. 감시 카드의 "앱 열 때·⟳ 때만 판정" 원칙도 그대로 따른다.

### v2 사건 방 (태풍·지진 공통) — `intel-feed.js:451-471 roomHtml`
| | 지금 있는 것 | 변경 |
|---|---|---|
| 1 | ← 피드로 (`:454`) | 없음 |
| 2 | 사건 헤더 카드: 제목·진실 배지·EVENT_FOCUS 배지 / 위치 / facts 행들 / 상태 (`:455-461`) | 없음 |
| 3 | 사건 방 — 기관 스택 (공식 트랙·앙상블·해상관측·연안 침수·특보) (`:462`) | 없음 |
| 4 | EVIDENCE 카드: 1차 출처·시각 줄·좌표 원칙·트랙 라인·진원 깊이·공식 링크 (`:463-464`) | 없음 |
| 5 | `pastHtml` 과거·공식 발표 타임라인 (`:465`, `:172-190`) | 없음 |
| 6 | `compareHtml` "이전 발표와 비교" (`:466`, `:564`) | 없음 |
| 7 | `verifyHtml` "당시 전망 검증" (`:467`, `:603`) | 없음 |
| 8 | WHY 카드: 인과 주장 게이트 + `.paysub` "근거 그래프·전망은 EXPLORER PRO 에서 제공 예정 · 공식 경보는 항상 무료" (`:468-471`) | 없음 |
| **+** | **FOR ME 한 줄** — "⚠️ 부산 · 영향 가능성 있음 · 언제·왜 → 🔒" | **8 아래(맨 끝)** |

누르면: 내 장소 탭으로 이동하고 이 사건의 카드가 펼쳐진다(`shell.setTab('my')`).

### v2 해양 카드 — `main.js:2797-2821 seaCardHtml` (`now` 탭 안)
| | 지금 있는 것 | 변경 |
|---|---|---|
| 1 | 헤더 "해양 모델 · 파고와 바람" + MODEL_SIGNAL 배지 (`:2807`) | 없음 |
| 2 | 지점 · 유의파고 · 너울 · 풍파 · 풍속 (`:2809-2813`) — **클릭한 바다 지점** 기준 | 없음 |
| 3 | 주의 문구 2줄 (`:2814-2815`) | 없음 |
| 4 | [부이 실측 보기] `marine-buoys` (`:2816`) | 없음 |
| **+** | **FOR ME 한 줄** — "강릉 · 파고 임계 초과 예상 → 🔒 언제" — **내 동네** 기준. 2 와 다른 지점임을 글자로 드러냄 | **4 와 5 사이** |
| 5 | `.paycard` [시뮬레이션 실행] `sim-now` + `.paysub` (`:2818-2821`) | 없음 |

### 손대지 않는 메뉴
인공위성(AETHERUS 스위치가 이미 v2 입구) · 이동 · 설정 · Intelligence(이미 문) · 항공편(hidden, 보류) · 한국 패널의 대기질 외 탭 · MY OCEAN 외 해양 뷰.

### 한 줄 요약
| | BEFORE | AFTER |
|---|---|---|
| 기존 요소 | 시트마다 5~9개 블록 | **전부 그대로** (지움 0, 이동 0) |
| 추가 | — | 시트당 한 줄(v2 내 장소 탭만 카드 묶음) |
| 무료 사용자가 보는 것 | 사실(현재 값·공식 발표·설명·뉴스·링크) | 사실 + "내 동네에는?" 상태 한 줄 |
| 유료의 이유 | "v2 에 기능이 많다" | 내가 누른 질문이 잠겨 있다 |
| 메뉴 사이 관계 | 태풍·지진·해양이 각각 끝남 | 전부 내 장소 탭으로 모임 |
| 남는 숫자 | 없음(집계 유실 중이었음) | 메뉴별 클릭률 표 |

## 1. 바꾸지 않는 것 (불가침)

1. 예보를 만들지 않는다. 기관 발표는 옮기고, 우리 계산은 "추정"이라 부른다.
2. 기관이 발표한 것은 시간이 있어도 전부 무료. 우리 계산은 상태만 무료, 시간·이유·크기는 유료.
3. 쓰나미 시트에는 우리 해석을 한 줄도 넣지 않는다 (`prototype/js/ui.js:331`). "기관 발표 구역 포함/미포함"만.
4. v1 은 예/아니오만 계산한다. 새 fetch 없음. 시간·이유·크기는 v2.
5. 개인 식별자는 어디에도 보내지 않는다. 계측 이름에는 메뉴 이름만.
6. 지금은 FREE_OPEN 모드. 잠금은 **모양만** 나오고 실제로 잠그지 않는다. 잠금 판정은 `access-mode.js decideCapabilityAccess` 로만.
7. 계산값이 없으면 그 질문은 그 순간 노출하지 않는다. 가짜 예시 금지.

## 2. 이미 있는 부품 (STEP 1)

| 부품 | 위치 | 쓰는 법 |
|---|---|---|
| 한 줄 버튼 | `prototype/js/for-me-row.js` | `mountForMeRow(container, {kind, id, signal, text?}, {track, onPick, navigate})` |
| 동네 저장 | 같은 파일 | `getMyPlace()` / `setMyPlace({lat,lon,name}, {overwrite})` — 키 `earthus.myplace` 하나 |
| 딥링크 | 같은 파일 | `forMeDeepLink({kind,id})` → `/v2/?tab=my&event=…&from=forme.<kind>` / v2 쪽 `readFromParam()` |
| 계측 | `prototype/js/usage.js` | `usage.track('forme.<step>.<menu>')` — 허용 50개, 서버 동일 |
| 검사 | `tools/v1/test_for_me_row.mjs` | `node tools/v1/test_for_me_row.mjs` → PASS 5항목 |

## 3. STEP 2 — v2 내 장소 탭 (도착지부터)

### 3.1 번들 규칙 (첫 작업, 이게 안 되면 나머지 전부 막힘)

`tools/build-v2-bundle.sh` 는 번들 안 `../../` 잔존을 FAIL 로 막는다(89행). 공용 두 파일을 번들에 **복사**하고 경로를 **재작성**한다.

```
== 2/4 =: mkdir -p "$OUT/js/shared"
          cp "$ROOT/prototype/js/for-me-row.js" "$ROOT/prototype/js/usage.js" "$OUT/js/shared/"
== 3/4 =: sed -e 's#\.\./\.\./js/for-me-row\.js#./shared/for-me-row.js#g'
              -e 's#\.\./\.\./js/usage\.js#./shared/usage.js#g'
```
- `usage.js` 안의 `./for-me-row.js` 는 같은 폴더라 재작성 불필요.
- `prototype/v2-three/js/usage.js` 를 `export { usage, USAGE_EVENTS } from '../../js/usage.js';` 껍데기로 바꾼다.
- 끝 판정: `bash tools/build-v2-bundle.sh` 가 FAIL 없이 끝나고, `grep -rn '\.\./\.\./js/' prototype/v2-deploy/js --exclude-dir=aetherus` 가 0줄.

### 3.2 주소 파라미터 받기

v2 는 상태를 해시(`#v=1&at=…`)로 다룬다. `?tab=my&event=…&from=forme.<menu>` 쿼리를 **읽기만** 추가한다(쓰지 않는다).
- 위치: `prototype/v2-three/js/main.js` 초기화 구간(해시 파싱 근처 — 정확한 줄은 작업 시 `grep -n "location.hash" main.js` 로 확정).
- 동작: `tab=my` 면 `shell.setTab('my')` (`ui-shell.js:700/716`), `from` 이 있으면 `usage.track('forme.v2_opened.'+menu)` **한 번만**, `event` 가 있으면 내 장소 탭의 해당 카드를 펼친다.
- 끝 판정: `/v2/?tab=my&from=forme.cyclone` 으로 열면 내 장소 탭이 열리고 `usage.snapshot().pending` 에 `forme.v2_opened.cyclone` 이 1.

### 3.3 FOR ME 카드 묶음

- 위치: `main.js:3228 getMyHtml()` 안, `:3285` `<details>기준 시각` **앞**.
- 내용: 내 동네에 걸린 사건마다 카드 1장. 순서 태풍 → 쓰나미 → 지진 → 파고 → 특보 → 대기질.
- 카드 문법(매핑표 「정보 해상도 차등」):
  ```
  [FREE]         부산 · ⚠️ 영향 가능성 있음                 ← 항상 보임
  [EXPLORER]     예상 시점 약 36~48시간 내 · 원인 강풍+파고   ← 구간, 원인 두 단어
  [INTELLIGENCE] 상세 분석 🔒                               ← 시각·모델비교·과거·Confidence
  ```
  FREE_OPEN 이므로 지금은 세 층이 다 보이되 🔒 표시만 붙는다.
- 사건별 판정 재료(전부 v2 가 이미 받는 자료):
  | 사건 | 신호 판정 | EXPLORER 구간 | 원천 |
  |---|---|---|---|
  | 태풍 | 공식 예보원 반경 안 (0~120h) | 진입 예상 시각을 ±6h 구간으로 | `events/typhoon-official.json` |
  | 태풍 120~240h | 반경 100km 안 멤버 수 ≥ 8/64 (원시 개수 표기, 확률 아님) | "N/64 멤버 접근" | `events/tropical-guidance-v2.json` |
  | 쓰나미 | 내 동네가 기관 발표 구역에 포함 | 우리 ETA 는 SIMULATION_ONLY 배지로만 | `events/tsunami-intl.json`, `ocean/tsunami-eta.json` |
  | 지진 | 400km 안 M5+ (watch.js 규칙 그대로) | 여진 기대수 | `events/quake-asia.json`, `lab-events` |
  | 파고 | 반경 안 격자 최대 파고 ≥ 2.0m (기본 임계, §7 결정 대기) | 초과 시각 ±6h 구간 | `ocean/marine.json` |
  | 특보 | 내 특보 구역에 발효 중 | 기관 발표라 **전부 무료** | kma-warn |
- 계측: 카드가 그려질 때 `forme.shown.<menu>` 는 **찍지 않는다**(v1/사건방 한 줄이 찍는다). EXPLORER 줄 클릭 `forme.explorer_cta.<menu>`, INTELLIGENCE 줄 클릭 `forme.intelligence_cta.<menu>`.
- 걸린 게 없으면 한 줄: "지금 내 동네에 걸린 사건 없음 · 감시 중".
- 끝 판정: 동네를 부산으로 두고 태풍이 있는 날 카드 3층이 뜬다. 없는 날 "없음" 한 줄. 콘솔 오류 0. `node tools/v1/test_for_me_row.mjs` PASS 유지.

### 3.4 탭 이름·정합

- `ui-shell.js:439-444` `my` 탭 라벨을 "내 장소 · FOR ME" 로. i18n 두 언어.
- `js/ext/hobby-para.js:162`, `hobby-sea-common.js:127` 의 "v2 에는 myLocation 이 없다" 를 `getMyPlace()` 로 통일.

### 3.5 배포

1. `bash tools/build-v2-bundle.sh`
2. `bash tools/deploy-v1.sh js/for-me-row.js js/usage.js` (이미 올라가 있어도 다시 — v1 먼저)
3. `bash tools/deploy-v2-three.sh`
4. 확인: `https://earthus.net/v2/?tab=my&from=forme.cyclone` 열고 콘솔 오류 0, Supabase `select * from usage_counters where event_name like 'forme.%'` 에 v2_opened 1건.
- 되돌리기: `git revert` 후 2·3 재실행. 번들은 `prototype/v2-deploy` 를 HEAD 로 되돌리면 된다.

## 4. STEP 3 — v2 사건 방·해양 카드에 한 줄

| 화면 | 삽입 | 코드 |
|---|---|---|
| 사건 방(태풍·지진) | `intel-feed.js:471` WHY 카드 **뒤** | `mountForMeRow(el, {kind: it.kind==='tc'?'cyclone':'quake', id: it.id, signal}, {track: usage.track.bind(usage), onPick, navigate: () => shell.setTab('my')})` |
| 해양 카드 | `main.js:2816` 부이 버튼과 `:2818` paycard **사이** | `kind:'wave'`, 판정은 클릭 지점이 아니라 **내 동네** 기준 |

- 사건 방의 signal 은 3.3 표와 같은 함수를 쓴다. 함수는 한 파일(`prototype/v2-three/js/for-me-signal.js`, 신설)에 모으고 v1 은 쓰지 않는다.
- 끝 판정: 태풍 사건 방 맨 아래 한 줄이 뜨고, 누르면 내 장소 탭의 그 태풍 카드가 펼쳐진다. `forme.shown/clicked.cyclone` 이 순서대로 쌓인다.

## 5. STEP 4 — v1 시트 7개 (한 시트씩 배포)

공용 규칙: 각 시트가 **이미 가진 자료로만** 예/아니오. `import { mountForMeRow, getMyPlace } from './for-me-row.js'`, `import { usage } from './usage.js'`. v1 은 `usage.init()` 을 부르지 않는다(app.opened 섞임 방지) — `track` 만 쓴다.

| 순서 | 시트 | 삽입 | signal 판정(v1 안에서) | onPick |
|---|---|---|---|---|
| 1 | 태풍 | `ui.js:432` `safetyActions` **앞** | 공식 예보원 반경 안 (`m._tc` 에 있는 반경) | `myLocation.locate(true)` 성공 시 `setMyPlace` |
| 2 | 지진 | `ui.js:631` **앞** | 400km 안 M5+ (haversine, 시트의 `m` 좌표) | 같음 |
| 3 | 날씨 | `ui-weather.js:413` `renderEarthActions` **뒤**; 특보 발효 중이면 `renderIntelligence` 카드 바로 아래 | 특보 구역 발효 여부(`warningGate`) | 같음 |
| 4 | 쓰나미 | `ui.js:347` **앞** | 기관 발표 구역 포함 여부만, `text:'기관 발표 구역에 포함'/'미포함'` | 같음 |
| 5 | 해양 MY OCEAN | `ui-ocean.js:230` 위젯 그리드 **위** | 클릭/선택 지점 파고 ≥ 기본 임계 | `ui-surf.js:523` 지역 선택 순서 재사용 |
| 6 | 대기질 | `ui-korea.js:649` `_airObs` 끝 | `nearest()` 관측소 등급 ≥ 나쁨 | 같음 |
| 7 | 검색 | `search.js:369` ask 행 **뒤** | 지명 검색 시 `type:'for-me'` 행 "📍 {지명}을 내 동네로" | 그 지명 좌표로 `setMyPlace` + `forme.set_location` |

- 배포: 시트 하나마다 `bash tools/deploy-v1.sh js/<파일>` (전체 sync 금지 — 다른 작업의 미완성 파일이 올라간다).
- 끝 판정(시트마다): 폰에서 시트 맨 아래 한 줄이 보이고, 동네 미설정 → 누르면 위치 권한창, 설정 후 → 누르면 `/v2/?tab=my&from=forme.<menu>` 로 이동. `tools/v1/test_menu_exclusive.mjs` 는 v1 lean 에서 못 쓰므로 수동 확인 + 콘솔 오류 0.

## 6. STEP 5·6 — 2주 수집과 강화

- 수집 시작일 = STEP 4 마지막 시트 배포일. 그날부터 14일.
- 매주 월요일 `select * from forme_funnel_daily order by day desc limit 14` 를 `docs/forme-funnel-weekly-<날짜>.md` 로 남긴다. 각주 필수: **행동 횟수이지 사람 수가 아니다.**
- 보고서 한 장(매핑표 「2주 뒤 보고서」 형식): 메뉴 / 보임 / 신호 / 클릭 / 클릭률 / v2 도착 / EXPLORER CTA / INTELLIGENCE CTA.
- STEP 6: 클릭률 1위 메뉴의 EXPLORER 답(구간·원인)부터 채운다. 2위까지. 나머지는 손대지 않는다.
- 항만 인터뷰는 STEP 4 중간부터 병행. 들고 갈 것: 이 표.

## 7. PD 결정 필요 (막히는 순서대로)

| # | 결정 | 기본값(답 없으면 이걸로 감) |
|---|---|---|
| 1 | 파고 기본 임계값 | 2.0 m (항만 관행 2.0~3.0 중 보수적으로) |
| 2 | 태풍 120~240h 신호 문턱 | 멤버 8/64 이상 접근 |
| 3 | 내 장소 탭 라벨 | "내 장소 · FOR ME" |
| 4 | 대기질 신호 등급 | 나쁨 이상 |
| 5 | 주간 보고서 위치 | `docs/forme-funnel-weekly-*.md` |

## 8. 일정(작업일 기준, 검증 포함)

| STEP | 내용 | 일수 |
|---|---|---|
| 2 | 번들 규칙 1 + 파라미터 1 + 카드 묶음 3 + 배포·확인 1 | 6 |
| 3 | 사건 방·해양 한 줄 + signal 함수 | 2 |
| 4 | 시트 7개 × 0.5 + 배포·폰 확인 | 4 |
| 5 | 수집 | 14(대기) |
| 6 | 1·2위 메뉴 EXPLORER 답 | 4 |

## 9. 매 단계 공통 체크

- [ ] `node --check` 통과, `node tools/v1/test_for_me_row.mjs` PASS
- [ ] 콘솔 오류 0 (미리보기 탭은 rAF 5초 안전망으로 측정)
- [ ] 무료 줄에 시각·거리·원인 없음
- [ ] 계측 이름이 허용 목록 안 (아니면 서버가 조용히 버림)
- [ ] 배포 순서 v1 → v2
- [ ] 커밋 메시지에 "왜"가 있음, push 까지
