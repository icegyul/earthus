# EARTHUS v8 master package

상태: `STATIC_OPERATING` · `FORECAST_BOUNDARY_OPERATING` ·
`FORECAST_OUTPUT_NOT_RELEASED` · `PAID_E2E_NOT_ACCEPTED` · `SALES_CLOSED`

운영 배포와 검증 증거는 `PRODUCTION-RELEASE-2026-08-21.md`에 기록한다.
`PHASE-3-LOCAL-CLOSEOUT-2026-08-21.md`는 배포 직전 로컬 상태를 보존한 기록이다.

이 디렉터리는 EARTHUS v7의 강한 기반을 유지하면서 Visual Earth 경험을 v8로
재구성하는 정본 안내다. mapped.earth는 데이터 표현과 상호작용을 검토하는 참고일 뿐,
고유 UI·브랜드·시각 정체성을 복제하지 않는다.

## 1. 문서 우선순위

충돌 시 다음 순서로 판단한다.

1. `docs/HANDOVER.md`의 사실성·안전·배포 원칙
2. 이 문서의 v8 제품 경계와 분류
3. `prototype/js/v8/`의 실행 계약
4. 각 기능 구현과 테스트
5. v7 및 이전 참고 문서

이전 자료는 삭제하지 않는다. 고유 내용을 확인해 정본으로 옮긴 뒤에만
`ARCHIVE_CANDIDATE`로 표시하며, 실제 보관 이동은 별도 승인과 백업 후 진행한다.

## 2. KEEP / MERGE / REWORK / NEW / ARCHIVE

### KEEP

- Forecast의 ingest → QC → bias → skill → fusion → confidence → verification 구조
- Hazard와 공식 경보 우선, Hard Gate, 안전 정보 무료 원칙
- Trust의 출처·시각·상태·권리·Kill Switch·Cost Governor
- Best Window, Personal Agent, Story, Memory, Simulation

### MERGE

- 기존 Data Relief와 개별 시각 레이어를 `Visual Earth Engine`으로 통합
- 기존 바람·해류·이동 흐름 표현을 하나의 Shared Flow 계약으로 통합
- 현재·공식 예보·Earthus 예보·시뮬레이션 시간을 Unified Time으로 통합
- 여행은 새 데이터 복제품이 아니라 지구의 `tourism`·`poi` 레이어를 다시 쓰는 목적별 입구

### REWORK

- 관광의 가늘고 높은 원기둥을 낮고 촘촘한 고정 표시 셀 블록으로 변경
- 출처 전체 목록을 상시 노출하지 않고 좌하단 한 줄 Dock + 요청 시 상세로 변경
- 지구 메뉴를 레이어 중심으로, 사람·도시를 지구 데이터 계층으로 재배치
- 바다는 실제 이용 가능한 수심·벡터·권리 상태만 표시하고 없는 Follow/Cinema는 비활성화

### NEW

- Visual Earth Registry: Relief / Flow / Field / Volume / Event / Orbit / Story
- Ocean Engine, Shared Flow, Unified Time, Scene State
- Follow Camera와 Cinema Mode의 근거·권리·모션 안전 계약
- Truth Contract, Source Registry, Entitlement Contract
- Earthus 자체 예보의 서버 전용 premium boundary와 release audit

### ARCHIVE

- 같은 데이터를 다른 이름으로 다시 설명하는 중복 기획
- 모든 자료를 Relief 한 방식으로만 그리려는 이전 표현
- 클라이언트에서 tier를 보고 premium JSON을 숨기는 구상
- 출처 상세를 큰 패널로 상시 노출하는 UI

`ARCHIVE`는 삭제 명령이 아니다. 고유 내용 전수 확인과 보관본 생성 전에는 원본을 유지한다.

## 3. clean master structure

```text
docs/earthus-v8/
  README.md
  PHASE-3-LOCAL-CLOSEOUT-2026-08-21.md
  PRODUCTION-RELEASE-2026-08-21.md

prototype/js/v8/
  truth-contract.js
  source-registry.js
  entitlement-contract.js
  unified-time.js
  scene-state.js
  motion-controllers.js
  visual-layer-registry.js
  shared-flow.js
  human-relief.js
  ocean-engine.js
  forecast-boundary.js
  provenance-dock.js
  runtime-coordinator.js

prototype/js/layers/
  tourism-flow.js
  registry.js

prototype/js/
  layerbar.js
  ui-tourism.js
  ui-outdoor.js

prototype/supabase/functions/
  _shared/forecast-v8-policy.js
  forecast-v8/index.ts

prototype/supabase/migrations/
  20260821120000_earthus_v8_forecast_private.sql

tools/
  test_v8_*.mjs
  test_tourism_flow_*.mjs
  test_ocean_*.mjs
```

## 4. 제품 경계

- 공식 관측·공식 예보·공식 경보는 무료 공개 경로를 유지한다.
- Earthus가 융합·보정·판단한 자체 예보와 안내만 유료 이용권 대상이다.
- 안전 정보는 구독과 무관하게 공개한다.
- 유료 결과는 브라우저에 먼저 보낸 뒤 숨기지 않는다. 서버 인증·서버 이용권·RELEASED·
  다섯 release gate를 통과한 경우에만 `private, no-store`로 응답한다.
- `FREE_OPEN`과 `SALES_OPEN=false`는 결제 서버와 권리 검증이 끝날 때까지 유지한다.
- AETHERUS 업데이트는 EARTHUS v8 완료 후 별도 단계로 진행한다.

## 5. Visual Earth 표시 원칙

| Layer family | 주 표현 | 대표 데이터 |
|---|---|---|
| Relief | 낮은 면·셀의 높이와 색 | 관광 혼잡, 인구, 강수, 적설 |
| Flow | 방향 근거가 있는 입자·선 | 바람, 해류, 이동 |
| Field | 연속 스칼라/벡터장 | 기온, 압력, 대기질 |
| Volume | 실제 3차원 근거가 있는 부피 | 구름, 연기, 대기 단면 |
| Event | 시간과 위치가 분명한 사건 | 지진, 태풍, 산불, 경보 |
| Orbit | 궤도·시각·프레임 근거 | 위성, 천체 |
| Story | 검증된 장면·카메라·레이어 순서 | Story, Memory, Replay |

표현은 데이터의 실제 의미와 해상도를 넘어 정밀해 보이면 안 된다. 관광 블록의 420m
발자국은 공식 장소 면적이나 건물이 아니라 `FIXED_DISPLAY_CELL`임을 계약과 범례에 남긴다.
