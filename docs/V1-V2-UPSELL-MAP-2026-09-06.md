# EARTHUS v1 → v2 유료 유도 매핑표 v0.1

작성 2026-09-06 · 상태 DRAFT · 문법 정본: v5.3 §1.4 (FREE=SEE / EXPLORER=UNDERSTAND / INTELLIGENCE=INVESTIGATE)

## 원칙

1. **모든 주요 메뉴에 유료 유도가 있다.** 단, 같은 paywall 이 아니라 **그 메뉴에 맞는 '다음 질문' 하나**다.
2. 무료 사용자는 **위쪽 결과(SEE)를 전부 본다.** 아래 질문(WHY/NEXT/PAST/COMPARE/FOR ME)을 누르는 순간 v2 가치가 보인다.
3. **잠금 화면은 결과 일부를 먼저 보여준다.** "PRO 가입하세요"만 있는 잠금은 금지.
4. 공식 경보·대피·안전정보와 표시된 근거는 어떤 층에서도 잠그지 않는다.
5. v1 과 v2 는 한 제품이다. "지구를 보는 서비스"로 들어와 "궁금한 것을 분석하는 서비스"로 넘어간다.
6. 배너·툴바형 CTA 는 만들지 않는다. CTA 는 항상 **답의 마지막 줄**이다.

## Paywall 원칙 (2026-09-06 확정)

**무료는 궁금증을 만들고, 유료는 궁금증을 해결한다.**
무료 = "무슨 일이 있는가?" / 유료 = "언제 · 왜 · 얼마나 · 내게 어떤 영향인가?"

| | 무료 | 유료 |
|---|---|---|
| **기관이 발표한 것** (특보 발효 시각, 공식 진로, PTWC 공식 ETA, 대피 지시) | **전부 무료.** 시간이 들어 있어도 잠그지 않는다 | — |
| **우리가 계산한 것** | 상태만: "⚠️ 영향 가능성 있음" | 시간·이유·크기·비교·과거·권고 |

무료에서 보여주면 안 되는 것(우리 계산에 한함): 정확한 시간, 정확한 거리, 상세 위험도, 상세 원인, 모델 비교, 과거 유사사례, 영향 예상치, 개인화 권고.
무료에서 보여줄 수 있는 것: 현재 상태, 기본 현상, 위험 여부의 존재, "상세 분석 가능"이라는 사실, 다음 질문의 제목.

### 정보 해상도 차등 (같은 질문, 층마다 다른 답)

```
FREE          부산항 · ⚠️ 영향 가능성 있음
EXPLORER      + 예상 시점 "약 36~48시간 내"(구간) · 주요 원인 "강풍 + 높은 파고" · 상세 🔒
INTELLIGENCE  + 시작 "36시간 후"(시각) · 최대 구간 48~60h · 원인 풍속/파고/수위
              + 모델 비교 IFS ENS/AIFS ENS · 과거 유사 3건 · Confidence · Scenario · Report
```

EXPLORER 는 **구간**, INTELLIGENCE 는 **시각**. 같은 계산의 해상도만 다르다.

### FOR ME 는 v2 의 입구

어느 메뉴에 있든 "이 현상이 내 위치에 영향을 주는가?" 를 누를 수 있다. 날씨·태풍·해양·지진·쓰나미·미세먼지·폭우 전부 FOR ME 로 모이고, 나중에 "내 위치 1개 → 내 자산 50개" 로 BUSINESS 가 된다. 첫 버전은 로그인 없이 동네 한 번 고르기(브라우저 저장), 결제 시 계정으로 이전.

## 공통 카드 문법

```
[제목]
현재 값 · 현재 값 · 현재 값          ← FREE, 전부 보임
──────────────
🔒 WHY      왜 그런가요?
🔒 NEXT     72시간 뒤 어떻게 되나요?
🔒 PAST     과거 비슷한 경우는?
🔒 COMPARE  기관·모델 비교
🔒 FOR ME   내 위치에는 언제?
```

잠금 화면(미리보기) 문법:

```
[질문 제목]
[결과의 첫 줄 — 실제 계산값]      ← 예: "부산항 · 약 41시간 후 위험구간 진입 가능성"
[근거 한 줄 — 출처·배지]
🔒 EXPLORER에서 상세 분석
```

미리보기의 첫 줄은 **실제 계산값**이어야 한다. 가짜 예시·정적 문구 금지. 계산값이 없으면 그 질문은 그 순간 노출하지 않는다.

## 메뉴별 매핑

상태: ● = v1 lean 1단 메뉴에 지금 보임 / ○ = v1 에 있으나 `hidden` / △ = v2 에만 있음

| 상태 | v1 메뉴 | 무료 노출 (SEE) | 유료 미리보기 (첫 줄에 실제값) | 결제 CTA | v2 기능 · 데이터 원천 | 층 |
|---|---|---|---|---|---|---|
| ● | 날씨 시트 | 현재 날씨, 동네예보, 특보 카드(발효 중일 때) | WHY: "지금 비는 정체전선 남하 때문" 한 줄 | 🔒 EXPLORER 원인 분석 | WHY 원인 / NEXT 변화 / COMPARE IFS·AIFS 97지점 비교 (`ecmwf-ingest`) | EXPLORER → COMPARE 는 INTELLIGENCE |
| ● | 경보·재난 → 태풍 | 공식 위치·풍속·공식 진로(KMA/JMA/JTWC 먼저 발표한 곳) | NEXT: "64개 멤버 중 51개가 반경 100km 접근 (120~240h)" | 🔒 EXPLORER 앙상블 보기 | NEXT 앙상블 회랑(`tropical-guidance-v2`), PAST analog(`cyclone-analog`), COMPARE 기관 비교, FOR ME 내 위치 영향 | EXPLORER / COMPARE·리포트는 INTELLIGENCE |
| ● | 경보·재난 → 지진 | 발생 정보(USGS·JMA·KMA 각각) | PAST: "같은 해역 M6+ 최근 3건, 여진 기대수 N" | 🔒 EXPLORER 영향권·비교 | 영향권, 여진 기대수(Reasenberg-Jones, `lab-events`), 과거 비교, EVIDENCE | EXPLORER / EVIDENCE 는 INTELLIGENCE |
| ● | 경보·재난 → 쓰나미 | 발생, PTWC/JMA 공식, 연안 10지점 기본 ETA | FOR ME: "내 위치(강릉) 도달 약 92분 · SIMULATION_ONLY" | 🔒 EXPLORER 내 위치 도달시간 | FOR ME 내 위치 ETA(`tsunami-eta`), 등시선, 게시문 대조 | EXPLORER |
| ● | 전체레이어 → 해양 | 파고·너울·수온·해류 격자, 부이 실측 | FOR ME: "내 해변·항구 기준 36시간 후 파고 3.4m" | 🔒 EXPLORER 위험 시간 보기 | 파고 예측 시계열, 위험 시간, 모델·실측 차이; **자산 영향은 BUSINESS** (Maritime 트랙) | EXPLORER / 자산은 BUSINESS |
| ● | 전체레이어 → 기상·대기 | 구름·바람·기압·미세먼지 현재 | NEXT: "예보 구름 24시간 뒤" 한 프레임 | 🔒 EXPLORER 예보 재생 | GFS 예보구름 프레임(`gfs-cloud-forecast`), 시간 전환, 한 번에 보기 | EXPLORER |
| ● | 인공위성 | 궤도·예정 발사·AETHERUS 스위치 | AETHERUS 위험 패널 상단 1줄 | 이미 v2 입구. 추가 CTA 없음 | 궤도 위험 패널, 제거 시나리오 | EXPLORER / 시나리오는 INTELLIGENCE |
| ● | 검색(물어보기) | 기본 검색, 맨 아래 「…」 물어보기 | 답의 첫 문단 | 🔒 EXPLORER 이어서 보기 | FOR ME / WHY / NEXT / PAST / COMPARE 다섯 질문으로 라우팅 | EXPLORER |
| ● | 지구 보기(3D) | 현재 지구 | Replay 첫 3초 | 🔒 EXPLORER 되감기 | 3D Replay, Time Travel, 분석 레이어, My Earth | EXPLORER |
| ● | Intelligence | v2 로 가는 문 | — | 문 자체 | 전체 | — |
| ● | 이동·설정 | 도구 | **없음** | **없음** | — | — |
| ○ | 뉴스(hidden) | 관련 뉴스 | 이벤트별 통합 분석 요약 첫 줄 | 🔒 EXPLORER 이벤트 룸 | 이벤트별 통합·신뢰도·영향(`news-brief`, `gdelt-events`) | EXPLORER |
| ○ | LAB(hidden) | 보고서 목록 | 보고서 요약(detail)만 | 🔒 INTELLIGENCE 보고서 열기 | LAB 8현상 보고서·세션(`lab-events`, `lab-report-index`) | INTELLIGENCE |
| ○ | 여행(hidden) | 기본 정보 | "이번 주말 강릉: 날씨 양호·혼잡 높음·이안류 주의" | 🔒 EXPLORER 추천 | 날씨·혼잡(`tourism-flow`)·위험(`khoa-coast`) 결합 추천 | EXPLORER |
| ○ | 항공편(hidden) | 항적 | — | 보류 | — | — |


## 화면별 삽입 계획 (2026-09-06, 코드 대조 완료)

### 공통 부품 하나: `forMeRow()`

v1·v2 공용 모듈 `prototype/js/for-me-row.js` (v2-three 는 상대경로 import). 입력 `{kind, id, lat, lon}` (사건 종류·ID·사건 좌표). 출력은 한 줄짜리 `<button class="forme-row">` 세 상태:

| 상태 | 왼쪽 글자 | 오른쪽 글자 | 누르면 |
|---|---|---|---|
| 동네 미설정 | 📍 내 동네 고르기 | 이 {태풍}이 내 위치에 영향 주는지 알려드립니다 | 동네 고르기 시트(v1: mylocation.js GPS 또는 지도 중심 / v2: MY EARTH 빈 카드) |
| 설정됨 · 신호 있음 | ⚠️ 강릉 · 영향 가능성 있음 | 언제 · 왜 → 🔒 EXPLORER | v2 `/v2/?tab=my&event={id}` 딥링크 → FOR ME 상세 카드 |
| 설정됨 · 신호 없음 | 강릉 · 지금은 영향 신호 없음 | 감시 중 | 같은 딥링크 (잠금 없음) |

- **동네 저장 키는 하나**: `earthus.myplace` (v2 가 이미 씀, `main.js:3138`). v1 도 같은 키를 읽고 쓴다. earthus.net 같은 origin 이라 /v1·/v2 가 공유한다. v1 `mylocation.js` 는 세션용이라 GPS 성공 시 이 키에 저장하도록 한 줄 추가.
- **v1 은 "있음/없음"만 계산**한다. 그 시트에 이미 로드된 자료로만: 태풍=공식 예보원 반경 안, 지진=400 km 안 M5+(v2 `watch.js` 규칙 그대로), 쓰나미=우리 해석 없이 기관 구역 일치만, 파고=클릭 지점 격자값≥기본 임계. 새 fetch 없음.
- **v2 가 시간·이유·크기를 계산**한다. 잠금 판정은 `access-mode.js decideCapabilityAccess({requiredTier:'explorer'})`. FREE_OPEN 모드에선 전부 열림.
- 계측: 아래 「계측 — 깔때기」 절의 6단계 이름을 쓴다. 한 줄이 그려질 때 `shown`, 신호면 `signal`, 누르면 `clicked` 를 같은 자리에서 찍는다.

### v2 (`prototype/v2-three/`)

| 화면 | 삽입 위치 | 현재 마지막 요소 | 넣는 것 |
|---|---|---|---|
| MY EARTH 탭 (`my` 내 장소) | `js/main.js:3285` `<details>기준 시각` **앞** | 기준 시각 details + 푸터 | **FOR ME 카드 묶음**: 지금 내 동네에 걸린 사건마다 카드 1장 (태풍·지진·쓰나미·파고·특보). 카드 = 상태 줄(무료) + "예상 시점 36~48시간 내 · 원인 강풍+파고"(EXPLORER) + "상세 🔒"(INTELLIGENCE). 사건 0건이면 "지금 내 동네에 걸린 사건 없음 · 감시 중" 한 줄 |
| 사건 룸 (태풍·지진 공통) | `js/intel-feed.js:471` WHY 카드 **뒤** | WHY 카드 `.paysub` | `forMeRow()` 한 줄. 누르면 MY EARTH 탭으로 이동하고 해당 사건 카드 펼침 |
| 해양 카드 (파고·바람) | `js/main.js:2816` 부이 버튼과 `:2818` paycard **사이** | `.paycard sim-now` | `forMeRow({kind:'wave'})`. 클릭 지점이 아니라 **내 동네 기준** 파고 |
| 탭 이름 | `js/ui-shell.js:439-444` | `my` 내 장소 | 라벨을 "내 장소 · FOR ME" 로. 탭 자체는 그대로(무료) |
| 취미 모듈 | `js/ext/hobby-para.js:162`, `hobby-sea-common.js:127` | "v2 에는 myLocation 이 없다" 주석 | `earthus.myplace` 읽도록 통일 (불일치 제거) |

### v1 (`prototype/`)

| 화면 | 삽입 위치 | 현재 마지막 요소 | 넣는 것 |
|---|---|---|---|
| 날씨 시트 | `js/ui-weather.js:413` `renderEarthActions` **뒤** | `.wcv7-earth` 레이어 버튼 3개 | `<section class="wcv7-section wcv7-forme">` 에 `forMeRow({kind:'weather'})`. 특보 발효 중이면 `renderIntelligence` 카드 바로 아래로 올린다 |
| 태풍 시트 | `js/ui.js:432` `safetyActions` **앞** | `safety-actions` | `forMeRow({kind:'cyclone', id})`. 안전 행동 버튼은 항상 그 아래 그대로 |
| 지진 시트 | `js/ui.js:631` `safetyActions` **앞** | `safety-actions` | `forMeRow({kind:'quake', id})`. 400 km 규칙 |
| 쓰나미 시트 | `js/ui.js:347` `safetyActions` **앞** | `safety-actions` | `forMeRow({kind:'tsunami'})`. **글자는 "내 동네가 {기관} 발표 구역에 포함"/"미포함"만.** `ui.js:331` 규칙(우리 해석 금지) 준수. 잠금은 v2 쪽 ETA 에만 |
| 해양 시트 MY OCEAN | `js/ui-ocean.js:230` 위젯 그리드 **위** | `.ocean-widget-grid` 6칸 | `forMeRow({kind:'wave'})` 한 줄. 지역 선택은 `ui-surf.js:523` 순서(사용자 선택→지도 중심→내 위치) 재사용 |
| 대기질 (한국 패널) | `js/ui-korea.js:649` `_airObs` 끝 | `.kr-row` 도별 평균 | `forMeRow({kind:'air'})`. 이미 `nearest()` 로 내 동네 관측소를 찾으므로 상태 계산 비용 0 |
| 검색 | `js/search.js:369` 물어보기 행 **뒤** | `type:'ask'` 행 | 검색어가 지명이면 `type:'for-me'` 행 "📍 {지명}을 내 동네로 · 영향 알림 받기". `ICON`(:400)·태그(:406)에 `for-me` 추가 |
| 인공위성·이동·설정·Intelligence | — | — | **넣지 않음** |

### 순서 (1단계 안에서)

1. `for-me-row.js` + `earthus.myplace` 통일 + 깔때기 6단계 계측(마이그레이션 포함) → 아직 화면에 안 붙임.
2. v2 MY EARTH 카드 묶음 (딥링크 목적지부터).
3. v2 사건 룸·해양 카드 줄.
4. v1 태풍 → 지진 → 날씨 → 쓰나미 → 해양 → 대기질 → 검색 순. 각 시트 하나씩 배포(`tools/deploy-v1.sh` 파일 단위).
5. 2주 계측 뒤 "첫 질문" 조정.

## 메뉴별 "가장 강한 질문" 하나

메뉴마다 다섯 질문을 다 보여주지 않는다. **첫 노출은 하나**, 나머지는 펼침.

| 메뉴 | 첫 질문 | 이유 |
|---|---|---|
| 날씨 | WHY | 현재 날씨 다음에 사람이 묻는 건 "왜" |
| 태풍 | NEXT | 공식 진로가 5일에서 끝난다. 그 다음이 궁금하다 |
| 지진 | PAST | "전에도 이랬나"가 첫 반응 |
| 쓰나미 | FOR ME | 도달시간은 내 위치가 아니면 의미 없다 |
| 해양 | FOR ME | 파고는 내 해변·내 항구 기준이어야 행동이 된다 |
| 기상·대기 | NEXT | 구름·바람은 "내일"이 궁금 |
| 검색 | (질문 자체가 입구) | 다섯 질문으로 라우팅 |
| 3D | PAST(Replay) | 지구를 돌리다 "어제는?" |

## 계측 — 클릭 수가 아니라 깔때기 (2026-09-06 PD 정정)

"눌렀다"만 세면 어디서 새는지 모른다. **무엇을 눌렀는지 + 그 뒤 어디까지 갔는지**를 단계별로 기록한다.

### 이벤트 6단계

| 순서 | 이벤트 이름 | 언제 찍나 | 찍는 앱 |
|---|---|---|---|
| 0 | `forme.set_location` | 동네를 처음 저장했을 때 | v1·v2 |
| 1 | `forme.shown.{menu}` | 그 메뉴 시트에 FOR ME 한 줄이 **보였을 때** (분모) | v1·v2 |
| 2 | `forme.signal.{menu}` | 그 한 줄이 "영향 가능성 있음"이었을 때 | v1·v2 |
| 3 | `forme.clicked.{menu}` | 한 줄을 눌렀을 때 | v1·v2 |
| 4 | `forme.v2_opened.{menu}` | v2 내 장소 탭이 실제로 열렸을 때 | v2 |
| 5 | `forme.explorer_cta.{menu}` | EXPLORER 잠금 줄을 눌렀을 때 | v2 |
| 6 | `forme.intelligence_cta.{menu}` | INTELLIGENCE 잠금 줄을 눌렀을 때 | v2 |

`{menu}` = `cyclone` · `quake` · `tsunami` · `wave` · `weather` · `air` · `search`. 7종 × 6단계 + 1 = **43개 이름**.

### 2주 뒤 보고서 한 장

```
메뉴      보임    신호   클릭   클릭률   v2도착   EXPLORER CTA   INTELLIGENCE CTA
태풍     1,240    310    228   18.4%      201          64               9
쓰나미     380     52     56   14.7%       49          12               2
해양       910     88     84    9.2%       70          19               3
날씨     3,100    120    211    6.8%      160          31               4
지진       640     14     20    3.1%       15           3               0
```

클릭률 = 클릭 ÷ 보임. 이 표 한 장이 "사용자가 실제로 가장 많이 묻는 것이 '내 위치에 영향이 있느냐'였다"의 증거가 된다. 항만 고객에게 들고 가는 자료다.

### 저장소 구조가 정하는 것 둘

1. **행동 횟수이지 사람 수가 아니다.** `usage_counters` 는 (날짜, 이벤트명, 횟수)만 저장하고 사람·세션·IP 를 저장하지 않는다(개인정보 원칙, `supabase/migrations/20260903_earthus_usage_counters.sql`). 그래서 "클릭률"은 사람 비율이 아니라 **노출 대비 클릭 횟수**다. 한 사람이 세 번 누르면 3이다. 보고서 각주에 반드시 적는다. 사람 수가 필요해지면 그때 로그인 사용자 한정 `analytics_events` 로 옮긴다.
2. **v1 → v2 이어 세기.** 두 앱이 다른 페이지라 v1 클릭과 v2 도착을 잇는 값이 필요하다. v1 이 `/v2/?tab=my&event=…&from=forme.cyclone` 로 보내고, v2 가 로드 시 `from` 을 읽어 `forme.v2_opened.cyclone` 을 찍는다. 개인 식별자가 아니라 메뉴 이름만 넘긴다.
3. 허용 목록은 SQL 함수 안 배열이라 **마이그레이션 한 장**(`20260906_forme_funnel_events.sql`)으로 43개 이름을 추가한다. 목록에 없는 이름은 RPC 가 버린다.

## 구현 시 주의

- v1 lean 의 hidden 메뉴(뉴스·LAB·여행)는 되살릴 때 `index.html` hidden 을 걷고 `main.js` lazy 표가 init 을 맡는지 확인한다.
- 미리보기 계산은 v1 이 직접 하지 않는다. v2 가 만든 산출물(S3 JSON)의 **첫 줄만** 읽는다. v1 무게를 늘리지 않는다.
- 잠금 판정은 `access-mode.js` 의 `decideCapabilityAccess` 로만 한다. FREE_OPEN 모드에서는 잠금 대신 전부 열린다(현행 방침: 유료 개시 전엔 게이팅 없음).
- 소비자 FOR ME(관심 지점·기본 임계값)와 BUSINESS(org 자산·임계값 편집)의 경계는 Maritime 명세서 §5 를 따른다.
