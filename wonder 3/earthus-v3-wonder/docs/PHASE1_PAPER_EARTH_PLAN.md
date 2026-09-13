# EARTHUS V3 WONDER — PHASE 1 PAPER EARTH 계획 (준비 문서, 미착수)

PHASE 1 은 `PHASE1_READINESS.md` 의 7항목이 전부 PASS 인 뒤에만 시작한다. 이 문서는 시작 전 준비다. **코드는 아직 없다.**
범위는 PD 지시의 8항목뿐. AI·결제·SNS·대규모 콘텐츠는 넣지 않는다.

**Master Directive 정렬 (2026-09-13 13:5x 편입 뒤 추가):**
- §32 PHASE 1 = Globe · camera · rotation · zoom · touch · earth return. PD 지시의 region entry · responsive 를 더한 8항목이 이 문서의 범위다.
- §2.2 지구 목표 크기 **Desktop 약 720px · Laptop 660 · Tablet 580 · Mobile 350**, inertia 필수, **캐릭터가 지구 뒤로 돌아가는 깊이감**(구면 뒤쪽 가림 = 깊이 테스트 포함), 실제 구면 좌표.
- §2.1 참고 기준: paper-cut / layered paper / collage, 실제 대륙 배치, 따뜻한 자연색. 금지: 평면 지도처럼 보이는 연출, 과도한 게임 UI, 유치한 장난감 렌더.
- §30 검증 폭 **1440 · 1024 · 390 · 375** + touch/pinch · safe area · reduced motion · keyboard fallback.
- §31 패키지 이름은 `globe-engine` (아래 `paper-earth` 표기는 정렬 전 이름 — `MASTER_DIRECTIVE_RECONCILIATION.md` R2).
- §3 LOD(WORLD→REGION→COUNTRY→LOCAL)와 §4 국경/해안 glow 선은 **PHASE 2**. PHASE 1 의 지구는 대륙 색면만.

## 1. 범위와 인수 기준

| # | 항목 | 인수 기준 (Browser Verified 기준) | Device |
|---|---|---|---|
| 1 | Paper Earth | 단위 구 하나에 종이 재질(땅·바다 2톤 + 종이 결). 자료 없는 지형은 그리지 않음(윤곽은 실제 자료). 첫 그림 ≤ 1.5 s(로컬) | 폰 실기기 첫 그림 시간 |
| 2 | camera | 지구 중심을 보는 궤도 카메라. 거리 3단(멀리·보통·가까이), FOV 고정 | — |
| 3 | rotate | 드래그 회전(관성 포함), 60°/s 상한(키즈 규칙), 극 넘김 잠금 | 손가락 회전 |
| 4 | zoom | 휠/버튼 줌. **3단 잠금**(키즈 규칙 "줌은 3칸 잠금") — 연속 줌 아님 | — |
| 5 | touch/pinch | 한 손가락 회전, 두 손가락 핀치 = 줌 단 이동, 탭 = 지역 선택. 브라우저 기본 제스처 차단 | **핀치 실기기 필수** |
| 6 | region entry | 지역(국가/한국 4곳/지역 16) 탭 → 카메라가 그 좌표로 이동 → 무대(배경+캐릭터)로 전환. 전환 동안 입력 잠금 | — |
| 7 | Earth return | 무대에서 "지구로" 버튼/뒤로 제스처 → 카메라 복귀, 무대 해제 | — |
| 8 | responsive | 375×812 ~ 데스크톱. DPR 상한 2(폰 발열), 캔버스 iOS 한도(4096²/메모리) 고려, 회전·리사이즈에 즉시 재배치 | 회전·안전영역 |

## 2. 구조 (ARCHITECTURE_LOCK §3)

```
packages/paper-earth/
├─ src/geo.mjs            좌표식(LOCK §4) · llToVec · vecToLL · 대권거리 (순수, 테스트)
├─ src/camera.mjs         궤도 카메라 상태기: {lat, lon, zoomStep} → 위치. 관성·상한 (순수, 테스트)
├─ src/gestures.mjs       포인터 → 회전/핀치/탭 해석 (DOM 이벤트 → 순수 명령), 기존 apps/web/src/gestures.mjs 의 톡/꾹과 통합
├─ src/earth.mjs          three 장면: 구 메시·종이 재질·조명 (루트 canvas 주입)
├─ src/regions.mjs        지역 목록(=replacement-manifest 24 + 국가) → 히트 판정 (순수, 테스트)
└─ README.md
apps/web/vendor/three-r184.module.min.js (+ three.core.min.js, LICENSE)   ← prototype/vendor 에서 파일 복사(서드파티)
apps/web/src/main.mjs     지구 ↔ 무대 전환 결합
```

- 지형 자료: 국가 윤곽은 기존 `prototype/data/country-reference.json`(435 KB, 자료) 또는 v3-paper `data/country-paper-borders.json`(1.6 MB, Natural Earth 계열) 중 **자료 하나**를 라이선스 문서와 함께 `content/geo/` 로 반입(코드 아님). 결정은 PHASE 1 첫 작업.
- 텍스처는 캔버스에 **런타임으로 굽는다**(자료 → 종이 색면). 그림 파일에 의존하지 않으므로 배경 24장 납품과 독립.
- 한 좌표식(LOCK §4)만 쓴다. v3-paper 의 `geo.js` 는 참고만.

## 3. 테스트 계획

| 층 | 검사 |
|---|---|
| node --test | `geo`: llToVec/vecToLL 왕복 오차 < 1e-9, 서울–부산 325 km / `camera`: 줌 3단 경계, 60°/s 상한, 극 잠금 / `regions`: 24+국가 히트 판정, 좌표 → 가장 가까운 지역 |
| Browser | 회전(합성 포인터 드래그) 뒤 카메라 lon 변화, 줌 단 전환, 탭 → 무대 전환 → 복귀, 콘솔 오류 0, 375×812, WebGL 컨텍스트 손실 없음 |
| Device | 핀치·관성·발열·첫 그림 시간 — 사람 확인 |

## 4. 위험

- iOS 캔버스 한도(기존 실측: 지역 텍스처 2048 이 1024 한도에 걸림) → 텍스처 크기를 `maxTextureSize` 로 캡.
- 브라우저 자동 검증은 입력이 없으면 rAF 가 멈춘다(기존 실측) → 검증은 합성 입력을 넣고 잰다.
- 60°/s·3단 줌 등 키즈 규칙은 UI-V3-WONDER 결정. 바꾸려면 DECISION 기록.

## 5. 산출 보고

PHASE 1 보고서는 8항목 각각에 IMPLEMENTED / TESTED / BROWSER VERIFIED / DEVICE VERIFIED / NOT DONE / BLOCKERS 를 적는다.
