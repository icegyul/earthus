# EARTHUS V3 콜드로드 실측

- 일시: 2026-09-10 (UTC), Playwright Chromium 151.0.7922.34 headless, viewport 1280×800
- 대상: https://earthus.net/v3/ (실제 공개 빌드. 응답 HTML에 `src/main.js` 포함 = v3-paper)
- 방법: 신규 브라우저 컨텍스트(프로필 콜드)로 `domcontentloaded` 진입 →
  `load` 대기 → 10초 관찰. Navigation Timing + paint + resource 타이밍,
  request/response 로그(바이트는 `response.body()` 실측), 스크린샷 `browser-captures/v3-coldload.png`
- 원칙: 측정 못한 값은 NOT_MEASURED. "<1초" 같은 추정 문구 없음.

## 타이밍 (실측, ms)

| 지표 | 값 |
|---|---|
| first-paint | 1320 |
| first-contentful-paint | 1320 |
| DOMContentLoaded | 2520 |
| load | 2530 |
| LCP | 3848ms (2차 실측, PerformanceObserver. 대상 요소 URL empty·size 9085) |
| interactive readiness | first-input delay 1072ms / duration 1112ms (2차 실측, 합성 클릭 1회. longtask 최대 1899ms, 22건 관측) |
| navigation transferSize | 7174 B (문서, 1차 실측) |

> 1차: FCP 1320 / DCL 2520 / load 2530. 2차: DCL 4920 / load 5440.
> 회차 간 편차는 네트워크 변동이다. 제품 코드 변경 없이 하네스만으로 계측했다.

## 요청·바이트 (실측)

- resource 엔트리 72개, transfer 합계 약 14,206,109 B
- response body 합계 약 19,768,227 B (72 응답. 압축 해제 후 기준이라 transfer와 다름)
- 최대 개별: `data/global-bathymetry.i16` 3,240,000 B,
  `data/pacific-bathymetry-contours.json` 2,456,223 B,
  `data/global-bathymetry-contours.json` 1,993,015 B,
  `data/pacific-bathymetry.i16` 1,958,400 B,
  `data/country-paper-borders.json` 1,594,234 B (상위 15개는 원시 로그 참조)

## 검증 질문 (실측)

1. paper-fiber PNG fetch = **0건**. PASS.
   `assets/paper-fiber.webp` 140,034 B 1건. PASS.
2. 초기 blocking path에 지연 자산 없음. PASS(10초 관찰 기준):
   quakes 0건, turtles 0건, paleo 0건.
3. pack124 lazy path. PASS:
   `pack124/docs/EARTHUS_V3_RUNTIME_MANIFEST_124.json` 1건(11,694 B) +
   `src/characters/pack124-loader.js` 1건. 캐릭터 이미지 대량 fetch 없음.
4. country-reference / peaks 중복 없음. PASS:
   `data/country-reference.json` 1건(435,784 B), peaks 관련 요청 0건.
5. 첫 인터랙션 전 대용량 blocking: ESTIMATED 아님 — FCP 1320ms에
   수심·등치선 MB급이 병렬로 흐른다(위 바이트 표). 첫 페인트 자체는 빠르나
   총량은 크다. "차단된다/안 된다"는 워터폴 별도 분석이 필요하므로 NOT_MEASURED로 둔다.

## 원시 로그

- 전체 요청 로그는 계측 스크립트 출력에 보관(본 문서에는 상위 15개만 요약).
  재측정: 본 문서 방법절 그대로 Playwright로 재실행하면 된다.
