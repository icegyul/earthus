# EARTHUS V2 — INTELLIGENCE UI 통합 결과보고서

```text
STATUS:   COMPLETE
PARENT:   ffc0725e   (PRODUCTION_BOUNDARY_LOCK)
COMMIT:   ba4be7ad
DATE:     2026-09-09
범위:     Intelligence 진입점 통합만. 새 기능 없음
```

---

## 1. UI_STRUCTURE_AFTER

```text
전            지금 · 탐색 · 내 지역 · 리포트 · 우주        + 떠 있는 손잡이(#intel-tab)
후            Intelligence · 탐색 · 리포트 · 우주          손잡이 없음
```

`지금`(사건 탭)·`내 지역`(내 지역 탭)·떠 있던 손잡이는 **셋 다 같은 패널**을
열던 중복 진입점이었다. 하나로 합쳤다.

```text
INTELLIGENCE_ENTRY_POINTS = 1     (하단 메뉴 'Intelligence')
FLOATING_LAUNCHER          = 0     DOM 제거 (CSS 로 숨기지 않았다)
SUB_ITEMS                  = 7     사건 · 내 지역 · 선택 자료 · 자료의 근거 ·
                                   예보·예정 · 이력 · 시뮬레이션
```

같은 칸을 다시 누르면 닫힌다 — 없앤 손잡이가 토글이었으므로 그 동작을 살렸다.

## 2. 여는 길을 먼저 하나로 모았다

지우는 순서가 이 작업의 전부였다.

```text
손잡이에 click() 을 합성해 열던 자리   4  (리포트→현상 · 리포트→분석 · 하단바 2)
내보낸 openIntel 훅을 쓰는 main.js 자리 14 (바다 클릭 · 국가 클릭 · 내 지역 …)
                                     ──
                                     18
```

`setIntelOpen(open)` 하나를 만들어 열여덟 자리가 전부 그 문으로 들어오게 한 **뒤에**
DOM 을 지웠다. 반대로 했으면 열여덟 자리가 조용히 죽는다.

## 3. 화면을 찍어 보고서야 잡은 것

```css
body:has(#intel.open) #bottom-nav { opacity: 0; pointer-events: none; }
```

손잡이가 따로 있던 시절엔 맞는 규칙이다(하단 바는 '지름길'이었다).
진입점을 이 바 한 곳으로 모은 뒤로는 **패널이 열리면 유일한 문이 사라지는** 규칙이 된다.

```text
같은 칸을 다시 눌러 닫기        불가
탐색 · 리포트 · 우주            불가
켜진 하이라이트                  안 보임
```

`opacity:0` + `pointer-events:none` 이라 **스크립트 `click()` 은 그대로 통과**했다.
그래서 내 시험은 내내 초록이었고, 실제 손가락만 canvas 에 닿았다.
`elementFromPoint` 적중 검사로 바꾸고 나서야 드러났다.

규칙을 없애고 패널을 바 위로 비켜 세웠다.

```text
#intel bottom     14  → 156     (하단 바 윗변 148 위 8px)
좁은 화면(≤720)   66  → 220     (바 158 + 높이 ~56 위)
```

부수적으로 두 겹침이 같이 사라진다.

```text
1272px 아래   패널 왼쪽 끝과 가운데 바가 가로로 겹쳐, z=6 인 바가 패널 글을 덮었다
375px         출처 상자(#hud, z=7)가 패널 아래쪽 79px 를 덮었다
```

## 4. NAVIGATION_TEST

라이브(earthus.net)에서 네 폭. **적중 검사**는 `elementFromPoint` 로,
`pointer-events` 를 그대로 반영한다.

| 폭 · 언어 | 손잡이 | 메뉴 | 7항목 | 패널 열림 시 메뉴 적중 | 겹침 | overflow | 콘솔(우리 origin) |
|---|---|---|---|---|---|---|---|
| 1440 KO | 0 | 4칸 | 7 | intel·explore·report·space | 0 | 0 | 0 |
| 1440 EN | 0 | 4칸 | 7 | intel·explore·report·space | 0 | 0 | 0 |
| 1024 KO | 0 | 4칸 | 7 | intel·explore·report·space | 0 | 0 | 0 |
|  375 KO | 0 | 4칸 | 7 | intel·explore·report·space | 0 | 0 | 0 |
|  375 EN | 0 | 4칸 | 7 | intel·explore·report·space | 0 | 0 | 0 |

1024 는 지시서에 없지만 넣었다 — 겹침이 가장 심하던 띠(721~1271)의 한가운데다.

```text
375   패널 161–584 · 메뉴 602–654 · 출처 666–746     서로 닿지 않는다
1440  패널 178–736 · 메뉴 752–816
1024  패널 127–604 · 메뉴 620–684
```

일곱 갈래 전부 실제 내용이 들어온다(빈 탭 0):

```text
feed 850 · my 201 · now 346 · why 490 · next 302 · history 89 · scenario 331   (자수)
```

### 남은 사실 하나 — 고치지 않았고, 고쳤다고도 하지 않는다

```text
375 폭 하단 메뉴 버튼 높이  42px   (44px 터치 권장치 미달)
```

이번 변경과 무관한 기존 값이다. `#bottom-nav button` 규칙을 건드리지 않았고
(diff 에서 확인), 항목 수만 5→4 로 줄어 **폭**만 달라졌다. 별도 과제로 남긴다.

## 5. REPORT_INTELLIGENCE_LINK

```text
리포트 → 자세히 보기   패널 열림 · 이름표 '해수면 온도 — 현재·해석·근거' · 탭 now
리포트 → 분석          패널 열림 · 이름표 '기온 — 현재·해석·근거' · 탭 why · 710자
발행 보고서 표시        2026-08 · 17절 렌더 (회귀 확인)
```

## 6. 이름표를 옮겼다

손잡이가 달던 현상 이름표를 **메뉴 버튼**이 단다.

```text
보이는 글자   'Intelligence' 고정 — 주 메뉴 글자가 바뀌면 누르려던 자리가 움직인다
title·aria    '해수면 온도 — 현재·해석·근거'  (현상을 고르면)
              '지구 인텔리전스' / 'EARTH INTELLIGENCE'  (고른 것이 없으면)
```

`innerHTML` 을 다시 쓰는 `renderNav` 가 이름표를 버튼째 지우고 있었다
(`refreshPanelIdentity` 가 이름표→renderNav 순서였다). 부르는 쪽 순서에 맡기지 않고
**그리는 쪽**이 다시 달게 했다.

## 7. QA 하네스 — 지우지 않고 맞췄다

없앤 선택자 `#intel-tab` 을 기다리던 하네스 일곱이 있었다.

```text
capture_v2_mobile_screens · perf_v2_measure · qa_v2_failure · qa_v2_master ·
qa_v2_mobile_extra · test_v2_three_intelligence_browser        (선택자 17곳)
build_information_inventory                                     (목록 항목 1)
```

삭제·skip·완화 없이 새 진입점 `#bottom-nav button[data-nav="intel"]` 로 바꿨다.
정보 목록기는 항목을 지우지 않고 '상단 도구' → '하단 메뉴'로 **옮겨 적었다**.

## 8. SOURCE = DEPLOY

```text
prototype/v2-three  →  tools/build-v2-bundle.sh  →  prototype/v2-deploy
                    →  aws/build-public.py       →  build/public-app
                    →  tools/deploy-v2-three.sh  →  S3 app/v2/  →  CloudFront
```

**멱등성** — 같은 소스로 두 번 빌드해 번들 전체 sha256 이 같았다.

```text
69afe811d5cbbeb5f5ff35b61fb215c8bc23e94186874f1a02d43a207daeca76   (997 파일)
```

**라이브 바이트 대조** — 손으로 옮기지 않았다는 증거는 명령 출력이 아니라 응답 본문이다.

```text
200 IDENTICAL  index.html            a03414c4167e171a
200 IDENTICAL  js/ui-shell.js        27b13d5f0ccc1d11
200 IDENTICAL  js/main.js            5c1747f30b256dba
200 IDENTICAL  js/report-center.js   f8872f403e471a30
200 IDENTICAL  js/pop-metric-menu.js 79611e6a494f832d
200 IDENTICAL  js/pop-sculpture.js   726c1c26f291310d
```

```text
공개 빌드 매니페스트   fcd07d73c5d11531  (3,599 파일)
CloudFront 무효화      I4LGMB6E19L26HH6GTPC2CTLT6   (완료 확인)
```

## 9. REGRESSION

```text
TOTAL 505 · PASS 505 · FAIL 0     (삭제·skip·완화 0)
  report-engine + _shared   357
  distribution               71
  cyclone-analog + lab-events 32
  npm (mjs)                  45
```

## 10. PRODUCTION_BOUNDARY — 배포 뒤 다시 물었다

```text
지운 95건 되살아남     0     익명 응답 {403: 95} · head-object 잔존 0
공개 정상 파일         9/9   200
비공개 경계            7/7   403  (archive · analysis · reports 초안 · character-studio · UNKNOWN)
매니페스트 안의 금지건  0     (3,599 중)
```

## 11. NOT CHANGED

지시서 §9 금지 목록 전부 그대로다.

```text
Intelligence 계산 로직 · 데이터 provider · Supabase · API · report-engine ·
보고서 스키마 · 시뮬레이션 엔진 · 예보 로직 · 인증 · 저장 정책 · S3 정책 ·
배포 구조 · Docker · DB 스키마 · 레이어/현상/사건 ID
React·Next·Vite 이관 없음 · 새 자산 없음(아이콘은 기존 것을 썼다)
```

바꾼 파일은 넷 갈래뿐이다.

```text
prototype/v2-three/index.html      CSS: 죽은 규칙 제거 · 겹침 회피 · 가시성 규칙 제거
prototype/v2-three/js/ui-shell.js  진입점 통합 · 이름표 이동
prototype/v2-deploy/…              번들 재생성 결과 (직접 고치지 않았다)
tools/ ×7                          QA 하네스 선택자 · 정보 목록기
```

---

## 결론

```text
INTELLIGENCE_ENTRY_POINTS     1
FLOATING_LAUNCHER             0
SUB_ITEMS                     7
NAVIGATION_TEST               PASS   (1440·1024·375 × KO/EN)
REPORT_INTELLIGENCE_LINK      PASS
SOURCE = DEPLOY               PASS   (멱등 sha256 + 라이브 바이트 일치)
TESTS                         505/505
CONSOLE (우리 origin)          0
OVERFLOW                      0
PRODUCTION_BOUNDARY_LOCK      MAINTAINED
PRODUCTION_PUBLISH_READY      YES
```

### CONSOLE 을 정확히 적는다

우리 origin(earthus.net · earthus-cache-kr)에서 나는 오류는 **0** 이다.
서드파티는 이 잠금의 통제 밖이고, 이번 변경과 무관하다
(`elevation-tiles-prod` 간헐 403/404 · `api.worldbank.org` CORS —
[잠금 문서](integration-11-production-boundary-lock.md) 참조).
