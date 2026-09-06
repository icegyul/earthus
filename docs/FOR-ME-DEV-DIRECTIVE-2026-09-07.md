# FOR ME 개발지시서 v1.0

작성 2026-09-07 · 대상 STEP 2~6 · 전제 STEP 1 완료(커밋 dd68a697, SQL 적용 912b525c)
정본 우선순위: v5.3 §1.4 > `docs/MARITIME-INTELLIGENCE-PRODUCT-SPEC-2026-09-06.md` > `docs/V1-V2-UPSELL-MAP-2026-09-06.md` > 이 문서

## 0. 한 줄 목표

**어느 메뉴에 있든 "이 현상이 내 위치에 영향을 주는가?"를 누를 수 있고, 누른 뒤 어디까지 갔는지 숫자로 남는다.**
2주 뒤 `forme_funnel_daily` 뷰 한 장이 "사용자가 실제로 가장 많이 묻는 것"의 증거가 된다.

## 0.5 비포 → 애프터 (기존 메뉴별로 어디가 어떻게 달라지나)

원칙: **기존 화면은 한 줄도 지우지 않는다.** 각 시트의 "사실" 부분은 그대로 두고, 맨 아래(안전 행동 버튼 바로 위)에 **한 줄**이 생긴다. 무료 사용자가 잃는 것은 없고, 얻는 것은 "내 위치에는?"이라는 다음 질문 하나다.

### v1 태풍 시트 (`ui.js:403-437`)
```
BEFORE                                   AFTER
┌ 태풍 13호 ──────────────┐              ┌ 태풍 13호 ──────────────┐
│ 현재 위치 · 중심기압      │              │ 현재 위치 · 중심기압      │  ← 그대로
│ 최대풍속 · 이동방향       │              │ 최대풍속 · 이동방향       │
│ 공식 진로 (KMA 먼저 발표) │              │ 공식 진로 (KMA 먼저 발표) │
│ 뉴스 · 공식 링크 · 공유   │              │ 뉴스 · 공식 링크 · 공유   │
│ [안전 행동] 대피·연락     │              │ ⚠️ 부산 · 영향 가능성 있음 │  ← 신설 한 줄
└────────────────────────┘              │        언제·왜 → 🔒 EXPLORER│
                                        │ [안전 행동] 대피·연락     │  ← 항상 맨 아래 유지
                                        └────────────────────────┘
달라지는 것: "이 태풍이 어디로 가나"(사실)에서 끝나던 화면이 "내 동네는?"(판단)으로 이어진다.
누르면: v2 내 장소 탭 → 이 태풍 카드(구간·원인·🔒상세). 동네 미설정이면 위치 권한창.
```

### v1 지진 시트 (`ui.js:573-643`)
```
BEFORE                                   AFTER
│ 규모 · 깊이 · 발생시각     │              │ 규모 · 깊이 · 발생시각     │
│ USGS ↔ JMA 대조           │              │ USGS ↔ JMA 대조           │
│ 단층 · 상세 행             │              │ 단층 · 상세 행             │
│ [안전 행동]               │              │ 강릉 · 지금은 영향 신호 없음 · 감시 중│ ← 400km 밖이면 이 줄
                                        │ [안전 행동]               │
달라지는 것: 지진 정보만 보던 화면에 "우리 동네 400km 안인가"가 붙는다. 신호 없을 땐 잠금 없이 안심 문구.
```

### v1 쓰나미 시트 (`ui.js:333-350`)
```
BEFORE                                   AFTER
│ 발생 · PTWC/JMA 공식 게시 │              │ 발생 · PTWC/JMA 공식 게시 │
│ 연안 10지점 기본 ETA      │              │ 연안 10지점 기본 ETA      │
│ [안전 행동]               │              │ 강릉 · 기관 발표 구역에 포함 → 🔒 내 위치 도달시간│
                                        │ [안전 행동]               │
달라지는 것: 이 시트만은 우리 해석 문구를 쓰지 않는다. "구역 포함/미포함"(기관 발표)만. 잠금 뒤 v2 의 ETA 는 SIMULATION_ONLY 배지.
```

### v1 날씨 시트 (`ui-weather.js:392-413`)
```
BEFORE                                   AFTER
│ 현재 · 시간별 · 일별       │              │ 현재 · 시간별 · 일별       │
│ (특보 발효 시) INTELLIGENCE 카드│         │ (특보 발효 시) INTELLIGENCE 카드│
│                           │              │   └ ⚠️ 부산 · 영향 가능성 있음 · 왜 → 🔒│ ← 특보 있을 땐 카드 바로 아래
│ 상세                      │              │ 상세                      │
│ [비] [바람] [미세먼지] 레이어│            │ [비] [바람] [미세먼지] 레이어│
                                        │ 부산 · 지금은 영향 신호 없음 · 감시 중│ ← 특보 없을 땐 맨 아래
달라지는 것: 특보 카드가 "발효 중입니다"에서 끝나던 것이 "왜 · 나에게는"으로 이어진다.
```

### v1 해양 MY OCEAN (`ui-ocean.js:212-230`)
```
BEFORE                                   AFTER
│ MY OCEAN · 바다 화면 모아보기│           │ MY OCEAN · 바다 화면 모아보기│
│ [안전][서핑][낚시]         │              │ ⚠️ 강릉 · 파고 임계 초과 예상 → 🔒 언제│ ← 위젯 위 한 줄
│ [생물][다이빙][항로]        │              │ [안전][서핑][낚시]         │
                                        │ [생물][다이빙][항로]        │
달라지는 것: 여섯 위젯이 "지금 바다"였다면, 한 줄이 "내 해변은 언제부터"를 연다. 지역은 서핑 화면의 선택 순서(사용자 선택→지도 중심→내 위치) 재사용.
```

### v1 대기질 (한국 패널 `ui-korea.js:610-649`)
```
BEFORE                                   AFTER
│ 대기질 — 실제로 잰 값       │              │ 대기질 — 실제로 잰 값       │
│ 가까운 관측소 큰 숫자       │              │ 가까운 관측소 큰 숫자       │
│ 관측소 주소 · 도별 평균     │              │ 관측소 주소 · 도별 평균     │
                                        │ 부산 · 지금은 영향 신호 없음 · 감시 중│ ← 나쁨 이상이면 ⚠️
달라지는 것: 이미 "내 동네 관측소"를 찾고 있어 계산 추가 없이 한 줄만 붙는다. 미세먼지도 FOR ME 로 모인다.
```

### v1 검색 (`search.js:358-369`)
```
BEFORE                                   AFTER
│ 강릉 (도시)               │              │ 강릉 (도시)               │
│ 강릉 해수욕장             │              │ 강릉 해수욕장             │
│ 「강릉」 물어보기          │              │ 「강릉」 물어보기          │
                                        │ 📍 강릉을 내 동네로 · 영향 알림 받기│ ← 지명일 때만
달라지는 것: 검색이 "찾기"에서 "등록"까지 간다. 동네 설정의 가장 짧은 길. 여기서 `forme.set_location` 이 찍힌다.
```

### v2 내 장소 탭 (`main.js:3228-3285`) — 도착지
```
BEFORE                                   AFTER
│ MY EARTH                  │              │ 내 장소 · FOR ME           │  ← 탭 이름
│ 하늘 · 내 특보 구역        │              │ 하늘 · 내 특보 구역        │  ← 그대로
│ 특보 · 대기질 · 바람/기온   │              │ 특보 · 대기질 · 바람/기온   │
│ 감시                      │              │ 감시                      │
│ ▸ 각 자료의 기준 시각      │              │ ┌ 태풍 13호 ─────────────┐│  ← 신설 카드 묶음
                                        │ │ 부산 · ⚠️ 영향 가능성 있음 ││     FREE
                                        │ │ 예상 시점 약 36~48시간 내 ││     EXPLORER(구간)
                                        │ │ 원인 강풍 + 파고          ││
                                        │ │ 상세 분석 🔒              ││     INTELLIGENCE
                                        │ └────────────────────────┘│
                                        │ ┌ 파고 ───────────────────┐│
                                        │ │ 강릉 · 지금은 신호 없음    ││
                                        │ └────────────────────────┘│
                                        │ ▸ 각 자료의 기준 시각      │
달라지는 것: 지금은 "내 동네의 지금"(관측)만 있다. 여기에 "내 동네에 걸린 사건"(판단)이 사건마다 카드로 붙고, 카드 안에서 무료→EXPLORER→INTELLIGENCE 로 깊어진다. 모든 v1 한 줄이 여기로 온다.
```

### v2 사건 방 (`intel-feed.js:451-471`)
```
BEFORE                                   AFTER
│ ← 사건 헤더 · 기관 스택     │              │ ← 사건 헤더 · 기관 스택     │
│ EVIDENCE · PAST · 비교 · 검증│            │ EVIDENCE · PAST · 비교 · 검증│
│ WHY 카드 (.paysub)         │              │ WHY 카드 (.paysub)         │
                                        │ ⚠️ 부산 · 영향 가능성 있음 · 언제·왜 → 🔒│ ← 신설
달라지는 것: 사건 방은 "이 사건"을 설명한다. 한 줄이 "이 사건과 나"로 바꾼다. 누르면 내 장소 탭의 그 사건 카드.
```

### v2 해양 카드 (`main.js:2797-2821`)
```
BEFORE                                   AFTER
│ 해양 모델 · 파고와 바람     │              │ 해양 모델 · 파고와 바람     │
│ 지점 · 유의파고 · 너울 · 풍속│             │ 지점 · 유의파고 · 너울 · 풍속│  ← 클릭 지점 기준(그대로)
│ [부이 실측 보기]           │              │ [부이 실측 보기]           │
│ paycard: 시뮬레이션 실행    │              │ 강릉 · 파고 임계 초과 예상 → 🔒 언제│ ← 내 동네 기준(신설)
                                        │ paycard: 시뮬레이션 실행    │
달라지는 것: 카드는 "클릭한 바다"를 말한다. 한 줄은 "내 해변"을 말한다. 둘이 다른 지점이라는 걸 글자로 드러낸다.
```

### 손대지 않는 메뉴
인공위성(AETHERUS 스위치가 이미 v2 입구) · 이동 · 설정 · Intelligence(이미 문) · 항공편(hidden, 보류).

### 한 줄 요약
| | BEFORE | AFTER |
|---|---|---|
| 무료 사용자가 보는 것 | 사실(현재 값·공식 발표) | 사실 + "내 동네에는?" 한 줄(상태만) |
| 유료의 이유 | "v2 에 기능이 많다" | 내가 누른 질문이 잠겨 있다 |
| 메뉴 사이 관계 | 태풍·지진·해양이 각각 끝남 | 전부 내 장소 탭 하나로 모임 |
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
