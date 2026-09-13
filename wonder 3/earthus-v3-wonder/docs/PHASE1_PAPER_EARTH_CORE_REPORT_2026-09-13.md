# PHASE 1 — PAPER EARTH CORE 보고 (2026-09-13 밤)

PD "PHASE 1 START AUTHORIZATION" 의 결과. 승인된 Paper Earth reference(어두운 종이 우주 · 겹친 종이 지구)를 기준으로 Paper Earth Core 를 세웠다.
**기존 V3 수정 0 · AWS 변경 0 · legacy cleanup 0.** "완료" 는 Browser Verified 까지 통과한 것에만 쓴다.

## PHASE 0 승인 기록 (PD DECISION)

| # | 항목 | PD 결정 | 반영 |
|---|---|---|---|
| 1 | MASTER DIRECTIVE | PASS | `docs/MASTER_DEVELOPMENT_DIRECTIVE.md` 기준 문서 유지(sha `e41a6652…`, 18,656 B) |
| 2 | STACK | ESM LOCK | 번들러 없음·React 없음 그대로. 변경 0 |
| 3 | DEPLOYMENT | 설계 유지 · AWS 변경 금지 | 이번 세션 AWS 쓰기 **0**. 스테이징/`wonder-test` 는 이전 빌드 그대로 |
| 4 | CHARACTER WEBP | 1024/Q85 승인 · 원본 PNG 삭제 금지 · 124 일괄은 적절한 시점 | 기준 유지. 이번 세션 변환 실행 안 함(원본 PNG 무수정) |
| 5 | LEGACY CLEANUP | 계속 보류 | `prototype/v3-*`·AWS·CI·`sw.js` 변경 0 |
| 6 | BACKGROUND 24 | **RUNTIME CANDIDATE ONLY · PRODUCTION APPROVAL = REJECT FOR NOW** | `assets/background_quality_report.json` 에 `pdDecision` 으로 기록. 24장 삭제하지 않고 candidate/fallback 유지. 교체 시 같은 Asset ID·경로, `version`·`sha256` 만 갱신하는 경로가 이미 있다 |

## PHASE 1 ACCEPTANCE — 실측

네 폭에서 **합성 터치 PointerEvent + 실제 클릭/휠/키보드**로 확인. 값은 인앱 Chromium 실측이다.

| 기준 | 1440×900 | 1024×768 | 390×844 | 375×812 |
|---|---|---|---|---|
| Earth appears immediately | 첫 그림 **269ms** | **249ms** | **263ms** | **253ms** |
| globe is large enough | **720** / 목표 720 | **660** / 660 | **350** / 350 | **350** / 350 |
| rotation works (가로) | −17.20° (예상 −17.20) | −18.38 (−18.38) | −40.56 (−40.56) | +40.33 (+40.33) |
| rotation works (세로) | +9.55° | +10.21° | +22.54° | −22.40° |
| touch works | 터치 드래그·톡 ✅ | ✅ | ✅ | ✅ |
| pinch works | 0→2단, 지름 1944 | 0→2, 1782 | 0→2, 945 | 0→2, 945 |
| zoom works | 휠 0→1(1188px)·버튼 ±·핀치 되돌림 0 | 휠 0→1 | 핀치 0→2→0 | 핀치 0→2→0 |
| inertial movement works | 뗀 뒤 계속 굴러 **100ms 에 남은 거리의 55.07%** | 55.06% | 55.07% | 55.07% |
| Earth return works | ✅ (진입 중·활성 중 둘 다) | ✅ | ✅ | ✅ |
| console error = 0 | **0** | **0** | **0** | **0** |
| no legacy V3 dependency | ✅ (아래) | ✅ | ✅ | ✅ |

- **관성**: PD ROTATION RULE LOCK 으로 잠근 V2 규칙은 속도 관성(fling)이 아니라 **목표 따라가기 감쇠** `k = 1−exp(−dt·8)` 다. 손을 뗀 뒤에도 지구가 계속 굴러 부드럽게 멈춘다. 이론값 `1−exp(−0.8) = 55.07%` 와 네 폭 실측이 소수 둘째 자리까지 일치한다.
- **Earth return**: 지역에 **들어가는 도중**(approaching/unfolding)에 🌍 지구 를 눌러도 돌아온다 — 예전에는 그 구간에서 버튼이 먹지 않았다(아래 §고친 것 2).
- **줌 되돌림**: 핀치 아웃·버튼·휠 모두 0단으로 복귀하며 지름이 목표값으로 정확히 돌아온다.

## IMPLEMENTED

1. **2.5D Paper Earth 텍스처 재작성** `packages/globe-engine/src/paper-texture.mjs`
   층: 깊은 종이 바다(가로 섬유) → 대륙붕 헤일로(아래 종이 한 장) → 땅 그림자 → **생물군 위도 띠**(기둥마다 물결지게 민 세로 그라디언트) → 종이 두께(안쪽 그늘) → 빛 받는 모서리 → 나라별 옅은 색 차이 → 자른 단면 선 → 극지 얼음(물결 가장자리) → 종이 결.
   장식: 종이 나무 1,500(숲·정글 띠에만), 모래 결(사막 띠), **장식 산줄기 16개**(히말라야·안데스·로키…, 종이 삼각형 + 눈 모자). 생물군 색은 `landToneAt(lat)` 로 기준 위도 7개를 부드럽게 섞는다. 그림 파일 0 — 전부 Natural Earth 자료에서 런타임에 굽는다.
2. **어두운 종이 우주** `apps/web/earth.css` · `index.html`
   6정거장 방사 그라디언트(중간 색 경계가 테로 보이지 않게) + SVG feTurbulence 종이 결 한 겹. UI 는 어두운 배경용으로 다시 칠했다(브랜드·힌트·줌 버튼·발치).
3. **지구 둘레** `packages/globe-engine/src/ambient.mjs` + `earth.mjs`
   별 420개(먼 구면, 지구를 돌리면 같이 흐름) · 대기 테두리 빛(실루엣에 붙는 번짐) · **종이 구름 10장**(r 1.03~1.16, 12~17분에 한 바퀴, 구 뒤로 가면 가려짐) · **대륙 이름표 6개**(종이 태그, 세계 줌에서 앞면일 때만 서서히).
4. **첫 그림 앞당기기** `apps/web/src/earth-main.mjs` · `index.html`
   three.js·지구 자료 `modulepreload`/`preload` → 낮은 해상도(1024×512)로 먼저 굽고 **rAF 를 기다리지 않고 즉시 첫 프레임** → 한가할 때 2048×1024 로 다시 구워 텍스처만 갱신. 환경 카탈로그는 지구가 뜬 뒤에 붙는다.
5. **화면 정리(대시보드 금지)** 개발 표시(로그·PHASE 칩·무대 링크·출처)는 기본으로 숨기고 `?debug=1`·`?qa=1` 에서만 보인다. 라벨은 대륙 6개뿐 — 나라·바다 이름 없음.
6. **고친 것 2건** (아래 §고친 것)

## TESTED

`node --test` **71/71** (이전 70 + 0×0 창 방어 1). `build-registry.mjs --check` 최신.
새 시험 `tests/paper-earth.test.mjs` 6: 위도→생물군 띠(남북 대칭) · 종이색이 1°씩 훑어도 끊기지 않음(밝기 ≤4, 색상 ≤12) · 나라별 색 차이는 alpha ≤0.12 이고 결정적 · 장식 산줄기 앵커 좌표·id · 구름 10장(반지름·속도·경도 분포) · 별 420(거리 20~40)·이름표 6(바다 이름 없음).
`tests/globe-engine.test.mjs` 에 0×0 창 방어 1건 추가.

## BROWSER VERIFIED

위 ACCEPTANCE 표 전부. 그 밖에:

| 항목 | 결과 |
|---|---|
| 첫 화면 네트워크 | 22건 — 코드·css·three·`country-reference.json`·`environments.json` 뿐. **배경 팩 요청 0** (Paper Earth 는 background candidate 와 분리) |
| 텍스처 승급 | 1024×512 → 2048×1024 (데스크톱), 모바일은 1024×512 유지 |
| 움직임 줄이기 | 구름 정지 ✅ · 카메라 즉시 따라감 ✅ |
| 키보드 | ←/→/↑/↓ 40px 상당(−4.78°), +/−, Escape |
| 개발 표시 | 기본 숨김 ✅ · `?debug=1` 에서 표시 ✅ |
| 콘솔 | 오류 0 (네 폭 + debug) |
| 4xx/5xx | 0 |

## DEVICE VERIFIED

**없음 (0건).** 실기기는 PD 몫이고, 이번 세션은 AWS 변경 금지라 새 빌드를 스테이징에 올리지 않았다. `https://earthus.net/wonder-test/` 는 아직 이전 빌드(`1018db1a` 계열)다.

## NOT DONE

- PHASE 2 범위: WORLD/REGION/COUNTRY/LOCAL LOD, 국경선·해안선·glow, country/local navigation.
- AI · Premium · Voice · 124종 semantic rig · AWS production deploy · legacy cleanup — 전부 손대지 않았다.
- 새 Paper Earth 를 스테이징/`wonder-test` 에 올리는 일(= AWS 쓰기) — PD 결정 대기.
- 124 WebP 일괄 변환 — 기준만 승인됨, 실행은 적절한 시점에.

## 고친 것 (이번에 발견)

1. **창이 0×0 이 되면 지구가 영영 사라졌다.** 패널이 숨겨진 순간 `clientWidth` 가 0 이면 `targetDiameter→distanceForDiameter` 가 NaN 이 되고, 카메라의 위도·경도가 NaN 으로 물들어 그 뒤로는 아무리 크기가 돌아와도 아무것도 안 보였다(드래그 속도도 80°/px 로 폭주). 세 겹으로 막았다: 목표 지름·거리 함수가 언제나 숫자를 돌려주고, `resize(0,0)` 은 무시하고, `tick` 이 NaN 을 만나면 `heal()` 로 제자리에 돌려놓는다. 생성자도 0×0 이면 1440×900 으로 시작한다. 시험 1건 추가.
2. **들어가는 중에는 🌍 지구 버튼이 먹지 않았다.** `approaching`/`unfolding` 구간에서 `returnToEarth()` 가 "전환 중" 으로 거절했다. 이제 그 구간에서 `flow.abort()` 로 진입을 취소하고 지구로 돌아온다. 펼쳐지는 중에 취소되면 열린 환경 층도 도로 닫는다.
3. **대기 테두리 빛이 지구에서 떨어진 고리로 보였다.** 방사 그라디언트의 시작 반지름을 0 이 아닌 값으로 줘서 정거장 비율이 실루엣과 어긋났다. 시작 반지름 0 + `HALO_SCALE` 상수로 맞췄다.

## 디자인 기준 대조

| PD 기준 | 상태 |
|---|---|
| 승인된 Paper Earth reference | 어두운 종이 우주 + 별 + 겹친 종이 지구 + 떠 있는 종이 구름 + 종이 태그 라벨 — 맞춤 |
| earth 자체가 주인공 | 화면에 지구 하나. UI 는 가장자리(브랜드·줌 3개·힌트·움직임 줄이기)뿐 |
| 복잡한 dashboard 금지 | 개발 표시 기본 숨김. 검색·좌측 메뉴·Featured 카드 등 reference 의 주변 UI 는 **만들지 않았다**(PHASE 1 범위 밖) |
| 과도한 label 금지 | 대륙 6개만, 세계 줌에서 앞면일 때만, 나라·바다 이름 없음 |
| 중국풍 장식 금지 | 없음 |
| warm natural paper palette | 열대 초록 → 사바나 → 모래 → 스텝 → 온대 → 타이가 → 흰 종이 7색 |
| layered paper depth | 대륙붕 헤일로 · 땅 그림자 · 안쪽 그늘 · 빛 받는 모서리 · 자른 단면 선 |
| children picture-book quality | 종이 나무·장식 산줄기·물결치는 얼음 가장자리 |
| background candidate 는 Environment 테스트용으로만 | 첫 화면 배경 요청 **0**. 배경은 지역 진입 뒤 `.env-bg` 층에서만 |

## legacy V3 의존 0

`apps/`·`packages/` 안에서 `prototype/`·`v3-paper`·`v3-kids` 를 가리키는 import·fetch·링크 **0건**(grep). 런타임 전역에도 legacy 이름 0. 지구 그림은 자료에서 굽고, three.js 는 프로젝트 안에 vendored.

## BLOCKERS

없음(구현·브라우저). PD 결정 대기: ① 새 Paper Earth 를 스테이징/`wonder-test` 에 올릴지(AWS 쓰기) ② 그 뒤 실기기 게이트 ③ PHASE 2 착수.
