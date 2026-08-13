# PR-00 Contract & Measurement Foundation — ADR

상태: **로컬 완료 · 운영 배포 없음**

측정 시각: 2026-08-13 06:49 UTC

측정 기준 커밋: `0997015f7dcb1d55607bd4ead61e14c391e31a42`

다음 단계: **PR-01 ImageryLayerGroup Lifecycle**

## 1. 결정

현재 화면 동작은 바꾸지 않고 다음 계약과 계측을 먼저 고정했다.

- `SatelliteFrameContract`는 관측 본체와 시각 효과의 경계를 강제한다.
- NOAA GMGSI, GK-2A, Himawari를 같은 필드로 정규화하되 관측시각·채널·범위·결측을
  합치거나 보간하지 않는다.
- module query 중복, base/depth sibling 수, provider request, 실제 네트워크 key,
  mask 처리 시간, WebGL texture, 3초 유휴 render를 같은 기준선에서 잰다.
- PR-00은 진단 전용이다. production entry import와 정적 운영 배포를 하지 않는다.

PR-01은 레이어를 더 만들기 전에 base와 visual sibling을 하나의 소유·취소·폐기 단위로
바꿔야 한다. PR-02는 그 뒤 동일 `frame/z/x/y` 다운로드를 1회로 줄인다.

## 2. 산출물

- 계약: [`../../prototype/js/satellite-frame-contract.js`](../../prototype/js/satellite-frame-contract.js)
- 순수 진단 함수: [`../../prototype/js/satellite-diagnostics.js`](../../prototype/js/satellite-diagnostics.js)
- 계약 fixture: [`../../tools/fixtures/satellite-frame-v1.json`](../../tools/fixtures/satellite-frame-v1.json)
- module query 기준선: [`../../tools/fixtures/module-specifier-baseline.json`](../../tools/fixtures/module-specifier-baseline.json)
- 자동검사: [`../../tools/test_visual_pr00.mjs`](../../tools/test_visual_pr00.mjs)
- module 감사: [`../../tools/module-specifier-audit.mjs`](../../tools/module-specifier-audit.mjs)
- 재현 측정기: [`../../tools/measure_visual_pr00.mjs`](../../tools/measure_visual_pr00.mjs)
- 원측정 JSON: [`evidence/pr00/baseline.json`](evidence/pr00/baseline.json)

계약은 알 수 없는 필드, 시간대 없는 시각, 역전된 발표시각, 비 HTTPS 원본, 가짜 가시광
alpha, 관측에 없는 강수량 필드를 거절한다. 실패 사유는 `UNAVAILABLE`, `STALE`,
`UNUSABLE_AT_NIGHT`, `SCHEMA_MISMATCH`, `CORS_BLOCKED`, `DECODE_FAILED`로 제한한다.

## 3. 재현 명령

```bash
node tools/test_visual_pr00.mjs
node tools/module-specifier-audit.mjs
node tools/module-specifier-audit.mjs --strict
node tools/measure_visual_pr00.mjs
```

- 계약/진단 자동검사: 유효 fixture 3개 통과, 잘못된 fixture 5개 거절
- 기본 module gate: JS 184개, 기존 불일치 5개, 신규 불일치 0, 오래된 baseline 0
- strict module gate: 기존 불일치 5개 때문에 의도대로 실패
- 측정기: 로컬 read-only 서버와 Chrome 151, 1280×720·390×844, DPR 1

현재 5개 module query 불일치는 이 PR에서 묵인한 새 표준이 아니다. baseline에 정확히
고정해 **여섯 번째 불일치부터 기본 gate가 실패**하게 했고, PR-01 병합 전 별도 작은 변경
또는 PR-01의 선행 hunk로 strict 0을 만든다.

## 4. 기준선 결과

`요청`은 브라우저가 실제로 시작한 위성 관련 request이고, `중복`은 같은 정규화 key의
두 번째 이후 요청이다. `provider 시도`는 Cesium scheduler가 거절한 호출까지 포함하므로
네트워크 요청과 같은 숫자가 아니다. texture는 WebGL 생성-삭제 차이인 진단 proxy이며
Cesium cache와 실제 leak를 아직 구분하지 않는다.

| 화면·장면 | layer / sibling | 요청 / 고유 / 중복 | 중복 기회 | mask p95 / max | 3초 유휴 render | live texture |
|---|---:|---:|---:|---:|---:|---:|
| Desktop 첫 Earth | 5 / 1 | 6 / 2 / 4 | 66.7% | 해당 없음 | 0 | 86 |
| Desktop Himawari | 9 / 3 | 66 / 34 / 32 | 48.5% | 0.8 / 1.4 ms | 314 | 935 |
| Desktop GK-2A | 9 / 3 | 491 / 267 / 224 | 45.6% | 0.8 / 1.7 ms | 0 | 736 |
| Desktop 위성 OFF 뒤 | 5 / 1 | 118 / 118 / 0 | 0% | 해당 없음 | 0 | 676 |
| Mobile 첫 Earth | 5 / 1 | 6 / 2 / 4 | 66.7% | 해당 없음 | 0 | 86 |
| Mobile Himawari | 9 / 3 | 61 / 36 / 25 | 41.0% | 0.9 / 1.7 ms | 0 | 825 |
| Mobile GK-2A | 9 / 3 | 372 / 212 / 160 | 43.0% | 1.2 / 1.3 ms | 0 | 530 |
| Mobile 위성 OFF 뒤 | 5 / 1 | 49 / 49 / 0 | 0% | 해당 없음 | 0 | 478 |

두 viewport 모두 가로 overflow와 page error는 0이었다. mask 50ms 초과 long task도 0이다.
관측시각은 원측정 JSON에 provider별로 보존하며 이 표에서는 동적으로 바뀌는 값을 재전재하지
않는다.

## 5. 확인한 결함과 해석

### P0 — PR-01에서 먼저 고칠 것

- Himawari/GK-2A의 base와 depth가 같은 원본을 따로 받아 중복 기회가 41~49%다.
- Himawari에서 GK-2A로 바꾼 뒤에도 desktop 448건, mobile 322건의 이전 GIBS 요청이
  GK-2A 측정 구간에 도착했다.
- 위성을 끈 뒤에도 GK-2A 요청이 desktop 118건, mobile 49건 도착했다.
- OFF 뒤 layer 수는 5로 돌아왔지만 live texture는 시작 86에서 desktop 676,
  mobile 478로 남았다. cache인지 leak인지는 30회 교대 soak 전에는 단정하지 않는다.
- Himawari는 두 viewport 모두 렌더 안정화 대기 제한을 넘었다. 이어진 3초 구간에서
  desktop은 314회, mobile은 0회 렌더되어 provider retry·tile churn의 타이밍 변동을
  PR-01에서 분리 계측해야 한다.

PR-01 완료 조건에는 `OFF/channel switch 뒤 이전 owner의 accepted request 0`, orphan task 0,
30회 교대 뒤 layer/texture 증가 0을 넣는다. `attempted`와 `accepted` provider 호출을 따로
기록해 scheduler의 정상 throttle과 실제 중복을 혼동하지 않는다.

### P1 — PR-02에서 고칠 것

같은 `provider/frame/channel/z/x/y`는 base/depth가 공유하는 bounded promise cache를 거쳐
네트워크 1회만 허용한다. 현재 mask 자체는 이 환경에서 p95 0.8~1.2ms로 잠정 예산 안이므로,
먼저 네트워크와 수명주기를 고치고 worker 이관 여부는 지원 최저 모바일 실측으로 결정한다.

### P1 — PR-04에 반영할 것

두 viewport의 WebGL `MAX_TEXTURE_SIZE`는 16,384였지만 코드가 읽는 Cesium 내부 속성은
`null`이라 desktop도 `mobile-4k`를 선택했다. 6K를 강제하지 않고 공개 WebGL capability,
decode 실패, device memory, save-data를 함께 보는 6K→4K→2K 폴백으로 교체한다.

## 6. Golden 화면

- Desktop: [첫 Earth](evidence/pr00/desktop-1280x720-earth.png) ·
  [Himawari](evidence/pr00/desktop-1280x720-himawari.png) ·
  [GK-2A](evidence/pr00/desktop-1280x720-gk2a.png)
- Mobile: [첫 Earth](evidence/pr00/mobile-390x844-earth.png) ·
  [Himawari](evidence/pr00/mobile-390x844-himawari.png) ·
  [GK-2A](evidence/pr00/mobile-390x844-gk2a.png)

캡처는 회귀 기준선이지 자료의 과학적 정답이나 모든 시간대의 대표 장면이 아니다. Safari,
실제 iPhone, Retina 2×, 장시간 열·배터리는 PR-07 전까지 `UNKNOWN`이다.

## 7. 종료 판정

PR-00의 계약·fixture·자동검사·desktop/mobile 기준선·ADR가 재현되므로 stop gate를 통과했다.
확인된 성능 결함은 숨기지 않고 PR-01/02/04의 합격 조건으로 이관했다. 사용자 기능을
바꾸지 않았으므로 이 PR은 운영 배포하지 않는다.
