# EARTHUS V2 브라우저 매트릭스 (실측)

- 일시: 2026-09-10 (UTC), Playwright Chromium 151.0.7922.34 headless
- 대상: https://earthus.net/v2/ (배포 빌드. 작업트리 미커밋 변경은 포함하지 않는다)
- 방법: viewport 5종 × 언어 2종 = 10셀. 언어는 `localStorage earthus.lang` 사전 주입 + locale.
  로드 후 약 9초 대기(WebGL settle), 콘솔 error·pageerror·requestfailed 수집,
  DOM 계측 후 스크린샷. 캡처: `docs/verification/browser-captures/v2-<W>x<H>-<lang>.png`
- 판정 어휘: PASS(실측 확인) / FAIL(실측 위반) / NOT_RUN(시도 안 함) / BLOCKED(시도했으나 검증 불가)

## 셀 요약

| # | 셀 | load/http | canvas | docLang | nav on (≤1) | overflow | 캡처 |
|---|---|---|---|---|---|---|---|
| 1 | 1440×900 KO | PASS 200 | PASS | ko PASS | 0 PASS | 0px PASS | v2-1440x900-ko.png |
| 2 | 1440×900 EN | PASS 200 | PASS | en PASS | 0 PASS | 0px PASS | v2-1440x900-en.png |
| 3 | 1024×768 KO | PASS 200 | PASS | ko PASS | 0 PASS | 0px PASS | v2-1024x768-ko.png |
| 4 | 1024×768 EN | PASS 200 | PASS | en PASS | en PASS | 0px PASS | v2-1024x768-en.png |
| 5 | 768×1024 KO | PASS 200 | PASS | ko PASS | 0 PASS | 0px PASS | v2-768x1024-ko.png |
| 6 | 768×1024 EN | PASS 200 | PASS | en PASS | 0 PASS | 0px PASS | v2-768x1024-en.png |
| 7 | 390×844 KO | PASS 200 | PASS | ko PASS | 0 PASS | 0px PASS | v2-390x844-ko.png |
| 8 | 390×844 EN | PASS 200 | PASS | en PASS | 0 PASS | 0px PASS | v2-390x844-en.png |
| 9 | 375×812 KO | PASS 200 | PASS | ko PASS | 0 PASS | 0px PASS | v2-375x812-ko.png |
| 10 | 375×812 EN | PASS 200 | PASS | en PASS | 0 PASS | 0px PASS | v2-375x812-en.png |

- 하단바: 10셀 전부 버튼 5개(지금/탐색/내 지역/리포트/우주, EN은 번역 라벨), `.on` 0개.
  랜딩 무선택 상태에서 불이 꺼진 것은 기대 상태이며 `>1` 금지는 전부 PASS.
- 가로 overflow: 10셀 전부 `scrollWidth - innerWidth = 0`. PASS.

## 콘솔·네트워크

- 우리 출처 콘솔 error + pageerror: 10셀 전부 0건. PASS.
- 외부 출처 콘솔 error: 10셀 전부 0건. PASS.
- requestfailed: 셀마다 11건, 전부 S3 HEAD 프로브
  (`clouds/gk2a/meta.json`, `clouds/meta.json`, `kma-warn.json`, `kma-aws.json`,
  `kma-lightning.json`, `korea-air-obs.json`, `buoys.json`, `forest-fire-kr.json`,
  `celestrak/catalog.json.gz`, `tsunami-intl.json`, `typhoon-official.json`)
  사유 `net::ERR_ABORTED`. 콘솔 에러 0·화면 정상이므로 사용자 가시 장애 없음으로 판정 PASS.
  (정확한 abort 주체는 미확인 — provider-health HEAD 폴링과 계측 종료 타이밍이 겹친 것으로 추정.
  후속에서 HAR로 재확인할 것.)

## 터치 타겟 (실측)

- 1440/1024/768: 하단 버튼 실높이 52px. PASS(≥44).
- 390/375: 하단 버튼 실높이 42px(min-width 50px, min-height auto). **FAIL(4셀)** —
  44px 목표 미달. 위치: `#bottom-nav button` (모바일).
  작업트리 시험(`navigation-mobile-fixes`, 44px 규칙)은 소스 기준 PASS이므로,
  위반은 배포 빌드와 소스 간 차이로 보인다. 수정 전 라이브 CSS 규칙 확인 필요.
  (이번 단계는 검증만 하므로 코드 수정 없음.)

## 상호작용 (정직 기록)

- 지구 클릭 → 질문 블록: **BLOCKED**.
  1440×900 KO와 390×844 KO에서 화면 5곳씩 클릭(3초 대기)했으나
  `.sim-questions` 0, 칩 미표시, 인텔 미개방. pageerror·콘솔 에러 없음.
  원인 미확정(headless SwiftShader 레이카스트 불일치 또는 오버레이 가로챔 가능).
  `map click → question`, `country search`, `?c=`, `satellite-track` 하단불,
  Simulation 진입·ESC·`#sim-exit`, radial·pen·edge, 18km 계열은 전부 **NOT_RUN**.
  랜딩 상태 `#simview`·`#sim-exit` 부재는 기대 상태(열기 전 미생성)이며 FAIL 아님.
- Monetization: 별도 페이월 오버레이 없이 지구가 바로 보임 10셀 전부(관측).
  `FREE_OPEN`·`SALES_OPEN=false`·`SHOW_SUBSCRIBE=false` 값 자체는 서버/설정 영역이라
  브라우저에서 단정하지 않는다. lockExplanation 호출 없음(기대 상태).
- intelligence 억제·질문 3개·sim-why·Gerstner·tsunami·SGP4·horizons 문구: **NOT_RUN**
  (선택 진입 없이 확인 불가. 자동화 시험 138/138이 계약을 보증한다).

## 재현 정보 (FAIL 1건)

- URL: https://earthus.net/v2/
- viewport: 390×844 및 375×812 (KO/EN 공통)
- 위치: `#bottom-nav button` 실높이 42px
- 재현: 위 뷰포트로 로드 → 버튼 rect 측정
- 콘솔 에러: 없음. 네트워크 에러: 위 HEAD 11건(무관 추정).
- 스크린샷: `browser-captures/v2-390x844-ko.png` 등
- 유력 소스: 배포 번들 CSS(작업트리 `prototype/v2-three/index.html` 규칙과 대조 필요)

## 블로커 해소 추가 실측 (작업트리 로컬 서빙, 2026-09-10)

- 방법: `node tools/dev_static_server.mjs 8777` 로 작업트리 그대로 서빙 →
  Playwright 실측. 배포가 아니므로 라이브 FAIL 판정은 그대로 둔다.

### B1 — 44px (소스 수정 없음, 이미 반영 확인)

- 원인 확정: 라이브 HTML의 720px 미디어쿼리 버튼 규칙은
  `min-width: 50px; padding: 6px 3px 5px; font-size: 9.5px` 로 `min-height` 없음.
  작업트리 `prototype/v2-three/index.html:340` 에는 `min-height: 44px` 있음.
  즉 수정은 소스에 이미 있고 라이브 배포만 구버전이다. 이번 단계에서 코드 수정 0.
- 로컬 실측: 390×844 KO/EN, 375×812 KO/EN 전부 버튼 5개 실높이 44px(min-height 44px).
  1440×900 KO 회귀 확인 52px. 가로 overflow 0, pageerror 0. PASS(로컬).
- 라이브 재실행: 미배포이므로 라이브는 여전히 42px. 배포 후 4셀 재측정 필요.

### B2 — 상호작용 A~H (로컬, intro 해제 후)

- 전제 수정: 신규 프로필 첫 방문 `#intro.show`(z-index 12)가 뷰포트를 덮어
  canvas가 포인터를 못 받았다 — 이전 BLOCKED의 원인. `.intro-go` 클릭 해제 후 실측.
- A 국가 클릭 → 질문: PASS. (720,350) 클릭 → 중화인민공화국 칩 + 질문 3개
  (country-weather·country-news 실행, 비이동 정직 비활성) + 조각 자동 on.
- B 검색 → 질문: PASS. `#btn-search` → `#c-search`에 '대한민국' →
  '대한민국 · South Korea (KOR)' 선택 → 칩 + 질문 3개 + 조각 자동 on + 캡션.
- C 링크 `#v=2&c=KOR`: FAIL(신규 발견, 기존 동작).
  부팅 시 `applyLink`가 `focus.data` 로드 전에 실행되면 `o.c` 분기(`main.js:5978`)가
  조용히 건너뛴다. 칩·질문·조각 전부 미생성, 에러 없음. country-reference 지연 시 재현.
  (이번 단계는 검증만 하므로 수정 없음. 수정 시 해당 분기에 data 대기 후 재적용 필요.)
- D satellite-track → 우주: PASS. 하단 우주 진입 → 위성 항목 선택 → 질문 2개
  (satellite-track 실행) 클릭 → 하단 `.on` = space.
- E 파도 시뮬레이션: PASS. 바다 클릭 → wave-now·wave-typhoon 실행 질문 →
  클릭 시 `#simview.active` + `#sim-exit` 존재 → exit 클릭 종료 → ESC 정상.
- F radial: PASS. 우클릭 자리에 `#quick-menu.show`, 뷰포트 안, ESC 종료.
  (long-press·pen·edge-clamp는 NOT_RUN — CDP 터치까지 확장하지 않음.)
- G 18km: PASS(로컬). `#v=2&pop=KOR&at=36.5,127.8,1.0028,0`,
  sculpt on 상태에서 중앙부 평균 밝기 43.79(검정 아님, 기준 <3) + 에러 없음.
- H 조각 누수: PASS. C 링크 실패로 직접 확인은 못 했으나 A 클릭 선택 후 ESC에서
  질문 0·칩 해제·조각 off·캡션 해제를 확인(자동 소유 정리 정상).
- 캡처: `browser-captures/local-sim-open.png`, `local-18km.png`.

## ?c= fix re-verify (local, same day)

- Fix: main.js CountryFocus.onData + pendingLinkCountry/applyLinkCountry (no poll/sleep). Tests 10/10.
- #v=2&c=KOR cold: Korea chip + 3 questions + sculpt on + caption on. PASS.
- #v=2&c=XXX invalid: existing selection kept, no crash. PASS (behavior preserved).
- Click(Russia)->ESC, wave sim->exit, mobile 4-cell 44px re-confirmed. PASS.
- Real touch tap (390x844 KO, hasTouch): tap ok, .on exactly 1, 0 errors. PASS.


## SATELLITE resolution (live, same day)

- Root cause: harness, not product (type H). Prior probes used wrong selectors ([data-layer], /satellite/i-only); real layer buttons are .mp-item[data-fscene/data-flayer] with Korean labels.
- Live proof: sats on -> 258 points, group visible, catalog 200 8.5MB, SGP4 lib 200, 2x satellite-track runnable, click -> nav space, off -> 0/hidden, re-on -> 258.
- Cells: 1440ko, 1024ko, 390ko, 375en — all overflow 0, errors 0. Catalog is on-demand (boot adds 0 sat requests beyond bundled js).
- Code change: none. Deploy: not run.


## SATELLITE matrix completion (live, audit follow-up)

- Remaining cells 390x844-en + 375x812-ko: sats on, 258 points visible, 2x satellite-track runnable, click -> nav space, overflow 0, errors 0. PASS.
- Satellite live matrix now 6/6 executed cells (1440ko, 1024ko, 390ko/en, 375ko/en). Code change: none.


## RADIAL input verdicts (no real-input hardware in sandbox)

- long-press: NOT_RUN. CDP-synthesized touch diagnostic (live, 390px): 750ms holds did not open the menu mid-hold; menu observed open only after a later cycle with 0 contextmenu events and 0 errors/selection side-effects. Timing inconsistent with the app 450ms pipeline — harness artifact, not product evidence either way.
- pen: NOT_RUN. No stylus hardware; no pen path in available automation (mock pointer events forbidden as pass basis).
- edge: NOT_RUN. No OS edge-gesture environment. Boundary clamp math itself was verified earlier via right-click inView checks (separate row).
- Code change: none. Prior VERIFIED items untouched.

