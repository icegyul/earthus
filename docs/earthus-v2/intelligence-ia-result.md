# EARTHUS V2 — FINAL INTELLIGENCE IA RESULT

```text
STATUS:        PASS
BASELINE:      ffc0725e  (PRODUCTION_BOUNDARY_LOCK)
HEAD BEFORE:   2b547c64
HEAD AFTER:    682d3aa6
DATE:          2026-09-09
```

---

## 0. 먼저 정정 — 어제 내 보고가 놓친 것

`tools/test_v2_ui_information_architecture.mjs` 는 **어떤 시험 묶음에도 물려 있지 않았다**
(`npm test` 는 `tools/earthus-v52|v53/*.test.mjs` 만 돌린다).
그래서 어제의 `505/505 · UNRELATED = 0` 은 내가 돌린 네 묶음에 대해서는 참이지만
이 파일을 세지 않았고, 그 사이 내 변경이 2건을 깼다.

```text
ffc0725e (내 작업 전)   32 중 31 통과    ← 1건은 그 전부터 실패(낡은 기대)
ba4be7ad (내 작업 후)   32 중 29 통과    ← 2건이 내 탓
682d3aa6 (지금)         33 중 33 통과    ← npm test 에 물렸다
```

그 파일의 절 제목이 이렇게 적혀 있다.

```js
// ── 불변식 1 — Intelligence 는 최상위 기능 메뉴가 아니다 ─────────────────────
```

**저장소가 이번 지시를 이미 불변식으로 갖고 있었다.** 가드는 있었는데 돌지 않았다.

---

## CURRENT MENU TAXONOMY

```text
SCENES     9      레이어 109          ui-shell.js:24
PHENOMENA 66      복합키 scene/layer   phenomenon-registry.js:25
DOMAINS    7      메뉴에 6 + 우주 1    phenomenon-registry.js:15
```

지시서의 예시(기후·바람·바다·재난·위성)와 실제가 다르다 — '기후'도 '바람'도
독립 씬이 아니라 `weather(날씨)` 안의 레이어다. 실제 taxonomy 로 작업했다.

```text
탐색(EARTHUS)   땅7 · 날씨16 · 바다18 · 사람4 · 여행6 · 재해7   + '지구 표현·이동' 9
우주(AETHERUS)  우주 8
```

## OLD INTELLIGENCE → NEW INFORMATION ARCHITECTURE

```text
전                                  후
하단바 Intelligence 칸 1개    →    없음
  누르면 7탭이 통째로            하단바 다섯은 전부 '무엇을 보는가':
  이력  "현상을 고르면 …"          지금(사건) · 탐색(현상) · 내 지역(사용자) · 리포트 · 우주
  시뮬  "사건 탭에서 태풍을 …"     어느 칸도 인텔리전스를 이름으로 달지 않는다
```

**Intelligence 는 목적지가 아니라 지금 보고 있는 것의 문맥층이다.**

```text
지금    → 사건 문맥        탭 4 (사건·내 지역·선택 자료·자료의 근거)
내 지역 → 사용자 문맥       탭 4  ← 씬이 아니다. 한 장소에서 태풍·지진·쓰나미·파고를
                                  가로지른다(for-me-signal.js:210,360,392,442)
탐색 → 현상 → 그 현상의 문맥  능력 있는 탭만
리포트 → 그 현상의 문맥
```

## 무엇을 고쳤나 — 둘뿐이다

### ① 하단바에서 'Intelligence' 칸을 뺐다

```js
const NAV_ITEMS = [
  { id: 'feed',    ko: '지금',    en: 'Now' },       // 사건 문맥
  { id: 'explore', ko: '탐색',    en: 'Explore' },   // 현상 문맥
  { id: 'myplace', ko: '내 지역',  en: 'My place' },  // 사용자 문맥
  { id: 'report',  ko: '리포트',  en: 'Reports' },
  { id: 'space',   ko: '우주',    en: 'Space' },
];
```

새 메뉴를 만들지 않았다. 뺀 것은 어제 내가 만든 칸 하나뿐이다.

### ② 게이팅 — 현상이 없으면 능력도 없다

```diff
- const hide = !!ctx && !ctx.capabilities[cap];    // ctx 가 null 이면 전부 통과 → 빈 약속
+ const hide = !ctx  || !ctx.capabilities[cap];
```

그리고 **여는 순간에도** 건다. 전에는 '선택이 바뀔 때'에만 걸어서(817·841·860·1340·1341),
앱을 켠 직후처럼 선택이 없던 상태로 열면 `btn.hidden` 이 아직 아무에게도 안 걸려
일곱 탭이 통째로 열렸다.

```js
if (open) applyCapabilityGating();   // setIntelOpen
```

이름표는 패널 자신이 단다(`intel.setAttribute('aria-label', …)`). 손잡이도 메뉴 칸도
없으니 남은 표면은 접근성뿐이다 — 보이는 글자를 새로 만들지 않았다(§8).

### 되돌린 판단 하나 — 정직하게 적는다

'사건'을 탐색 안으로 내리려 했다. 레지스트리가 `hazards/feed` 를
`role:'entrypoint', status:'demote'` 로 적어 두었기 때문이다. **실측해 보니 틀렸다** —
`phenomenon:null` 이라 재해 절이 아니라 **접힌 '지구 표현·이동'** 절로 빠진다.
묻어 두는 것은 이동이 아니라 상실이다. `role:'entrypoint'` 로 가르는 일반 규칙은
`land/locate`(내 위치로 이동)까지 잘못 옮긴다. 되돌렸다.

## 7기능의 실제 CONTEXT

| 기능 | 지금 어디에 매여 있나 (코드) | CONTEXT |
|---|---|---|
| 이력 history | `ui-shell.js:1004` ctx 로 시작 | 현상 (능력 있는 것만) |
| 시뮬 scenario | `main.js:4313` ctx 를 읽어 tsunami 분기 | ocean.wave · hazards.tsunami **둘뿐** |
| 예보 next | 노출은 ctx, 본문은 전역 | forecast 있는 현상 13 |
| 선택 자료 now | `lockedNote` 한 변수 | 고른 현상 |
| 자료의 근거 why | 전역(켜진 레이어) | 고른 현상 옆 |
| 사건 feed | 전역 · TC·EQ 둘 | 사건 문맥 |
| 내 지역 my | `localStorage earthus.myplace` | **사용자 문맥 — 씬 아님(N/A)** |

## ACCEPTANCE

```text
INDEPENDENT_INTELLIGENCE_MENU   0
FLOATING_INTELLIGENCE           0
BOTTOM_INTELLIGENCE_BUTTON      0
하단바에 'Intelligence' 글자      0
```

| 항목 | 결과 | 근거 |
|---|---|---|
| MY_EARTH_CONTEXT | PASS | 탭 4 · 능력 탭 3 숨김 · 하이라이트 정확 |
| PHENOMENON_CONTEXT | PASS | 지진=예보·이력 / 파고와 너울=시뮬 / 해수면온도=근거만 |
| WEATHER(기후·바람) | PASS | 날씨 16현상 · forecast 5 |
| OCEAN | PASS | 바다 18현상 · simulation 1(ocean.wave) |
| HAZARDS | PASS | 재해 7현상 · forecast 3 · history 2 · simulation 1 |
| SATELLITE(우주) | PASS | 우주 8현상 · forecast 3 · history 1 |
| LOCAL | PASS | 내 지역 = 사용자 문맥 |
| PROVENANCE / FORECAST / HISTORY / SIMULATION | PASS | 능력 표대로 |
| CLIMATE / WIND 독립 씬 | **N/A** | 존재하지 않는다 — 날씨 안의 레이어다 |
| REPORT → PHENOMENON | PASS | 17절 렌더 · '자세히 보기'→해수면 온도 문맥 |
| PHENOMENON → INTELLIGENCE | PASS | aria-label 이 현상 이름을 단다 |

## BROWSER (라이브 earthus.net)

| 폭·언어 | 하단바 | Intelligence 칸 | 런처 | 좌표 적중 | 게이팅 | 겹침 | overflow | 콘솔 |
|---|---|---|---|---|---|---|---|---|
| 1440 KO | 5칸 | 0 | 0 | 5/5 | ✅ | 0 | 0 | 0 |
| 1440 EN | 5칸 | 0 | 0 | 5/5 | ✅ | 0 | 0 | 0 |
| 1024 EN | 5칸 | 0 | 0 | 5/5 | ✅ | 0 | 0 | 0 |
| 375 EN | 5칸 | 0 | 0 | 5/5 | ✅ | 0 | 0 | 0 |
| 375 KO | 5칸 | 0 | 0 | 5/5 | ✅ | 0 | 0 | 0 |

```text
375 하단바   x 53–321 (폭 375 안) · 버튼 5개 각 50×42
REAL_POINTER  elementFromPoint 로 확인 — element.click() 만으로 통과시키지 않았다
              (어제 이 방법이 없어서 opacity:0 + pointer-events:none 을 못 잡았다)
```

### 고치지 않은 것 — 고쳤다고 적지 않는다

```text
375 하단바 버튼 높이 42px   44px 권장치 미달. 이번 변경과 무관한 기존 값이고
                          #bottom-nav button 규칙을 건드리지 않았다(diff 확인).
```

## TESTS

```text
TOTAL 538 · PASS 538 · FAIL 0     (삭제·skip·완화 0)
  report-engine + _shared   357
  distribution               71
  cyclone-analog + lab-events 32
  npm                        78   ← 45 + IA 가드 33 (32 기존 + 1 신규)
```

신규 시험: `현상이 없으면 능력 탭을 만들지 않는다 — 빈 약속 금지`

## SOURCE = DEPLOY

```text
번들 멱등 sha256   be10b9a44ae07e4e5b47cca01e1954f11f9ccea965a47c934808ab2e95d5945d
공개 매니페스트    6b54bdab7baf05b1  (3,599 파일)
CloudFront         IAR84FF9AXACOVCIUT7JHILGAW  (완료 확인)

200 IDENTICAL  index.html · js/ui-shell.js · js/main.js
               js/report-center.js · js/phenomenon-registry.js
```

## PRODUCTION BOUNDARY

```text
지운 95건 되살아남   0     익명 {403: 95}
공개 정상 파일       9/9   200
비공개 경계          7/7   403
PRODUCTION_BOUNDARY_LOCK   MAINTAINED (문서 갱신)
```

## NOT CHANGED

```text
Intelligence 계산 · data provider · report-engine · 보고서 스키마 · forecast engine ·
simulation engine · Supabase · DB schema · 인증 · S3 정책 · Docker · API 계약 ·
레이어/현상/사건 ID · React·Next·Vite 이관 없음 · 새 자산 없음
```

바꾼 파일:

```text
prototype/v2-three/js/ui-shell.js   NAV_ITEMS · 게이팅 · 이름표 · 하이라이트
prototype/v2-deploy/js/ui-shell.js  번들 재생성 결과
package.json                        IA 가드를 test 에 물림
tools/ ×7                           가드 기대값 2 + 낡은 기대 1 + QA 선택자 6종
docs/earthus-v2/INTELLIGENCE-IA-AUDIT.md   실사 기록
```

---

```text
PRODUCTION_PUBLISH_READY:  YES
COMMIT:                    682d3aa6
BLOCKERS:                  없음
```

## 남은 사실 — 이번 범위 밖이지만 적어 둔다

```text
375 하단바 버튼 42px (44px 미달)                     기존 값 · 미수정
LAYER_TRUTH 미등재 20개 → 근거줄이 빈 문자열          hobby 11 · lab 5 · 그 밖 4
#mapview·#localview 는 어떤 메뉴·주소로도 첫 진입 불가  둘이 서로만 연다
hazards.earthquake 의 forecast:true 에 예보 산출물 없음  레지스트리 대 실제 불일치
prototype/v2-deploy/js 사본과 v2-three 를 diff 하지 않았다  위 file:line 은 v2-three 기준
```
