# EARTHUS 2.0 — FINAL PRE-IMPLEMENTATION MASTER INDEX

Version: `PREIMPLEMENTATION_FREEZE_v1.0`  
Date: 2026-08-26  
Purpose: Codex가 설계 재작업 없이 **실제 Earthus 2.0 구현·연결·검증**에만 토큰을 쓰도록 모든 정본 진입점을 고정한다.

## 0. 가장 먼저 읽을 것

1. 저장소 `AGENTS.md`
2. `.agents/skills/luna-chat-coder/SKILL.md`
3. `docs/HANDOVER-2026-08-22.md` + 최신 운영 증거
4. 이 파일
5. `02_CODEX_APPLY_DIRECTIVE.md`
6. `09_CODEX_MINIMUM_TOKEN_EXECUTION_PLAN.md`

## 1. Foundation freeze

| 영역 | 정본 | 상태 |
|---|---|---|
| Engine/Algorithm | Backend/Engine Foundation v1.0 | FROZEN — 실제 Gap Evidence 없이는 신규 Engine 금지 |
| Backend Data Plane | v1.0 Backend Closed Loop | FROZEN — Provider wiring 우선 |
| Advanced Intelligence | v11 Advanced Intelligence | SHADOW-FIRST |
| Frontend | Frontend Foundation v1.0 | FROZEN — Scene/Resource Contract 우선 |
| Menu composition | `prototype/js/earthus2/config/menu-composition-rules.v1.json` | REQUIRED |
| Wiring | `prototype/js/earthus2/config/wiring-manifest.v1.json` | REQUIRED |
| UI Tokens | `prototype/js/earthus2/ui/tokens.v1.json` | REQUIRED |
| First Screen | `prototype/v2/` | ACTUAL CODE, add-only preview |

## 2. Actual implementation order

`VS-00 Quiet Earth → VS-01 Scene/Menu Stress → VS-02 Seoul Population → VS-03 Weather → VS-04 Hazard → VS-05 Pulse → VS-06 Travel Discovery → VS-07 Pollution Lens`

각 VS는 다음 evidence 없이는 DONE 아님:

- real input 또는 명시적 fixture-only test
- engine/runtime 실제 소비
- browser-visible result
- truth/source/observed time
- OFF disposal
- stale async commit 0
- desktop/mobile regression
- screenshot/evidence

## 3. 메뉴·Scene 절대규칙

- Dynamic Primary는 항상 최대 1개.
- 승인된 Context만 Secondary 1개.
- Safety Overlay는 메뉴와 독립적으로 유지.
- SPACE는 exclusive.
- PULSE는 Primary renderer가 아니라 orchestrator.
- 메뉴 버튼이 다른 Feature Engine을 직접 켜고 끄는 코드 금지.
- 모든 전환은 `SceneIntent → Recipe → Transaction → Resource Ownership`을 통과.
- OFF는 DOM 숨김이 아니라 fetch/timer/RAF/worker/Cesium resource까지 dispose.

## 4. 실제 첫 화면

`prototype/v2/index.html`

- 첫 진입 dynamic engine count = 0.
- 지구는 자동 무한회전하지 않는다.
- EARTH / WEATHER / OCEAN / HAZARD / HUMAN / PULSE / SPACE 7개 메뉴를 제공한다.
- 데이터가 없는 상태에서 수치/사건/추천을 만들어내지 않는다.

현재 preview branch의 `prototype/v2/index.html`은 standalone VS-00 실제 Cesium 화면이다. 최종 통합 적용 시에는 기존 `prototype/js/viewer.js` singleton 및 Scene Composition runtime을 재사용하는 integrated form으로 교체한다.

## 5. Test Fixture Pack

모든 fixture는 `fixtureOnly: true`. Provider가 꺼졌을 때 UI/algorithm test를 위한 deterministic input이며 LIVE/공식값으로 노출 금지.

## 6. Advanced Intelligence activation

고급 Intelligence 결과는 기본 `SHADOW`.

- Travel Discovery: real KTO/KMA evidence + safety gate + pilot 전 ACTIVE 금지
- Pollution Transport: vector proof 없으면 path 생성 금지
- Source attribution: transport와 별도 evidence 없으면 `SOURCE_NOT_ATTRIBUTED`
- News/NGO: 공개 위치 정밀도 이상 추정 금지
- Forecast: Ground Truth + calibration 없이 ACTIVE 금지

## 7. Codex token policy

Codex에게 새 아키텍처·중복 엔진·UI 재설계·framework 교체를 다시 시키지 않는다.

Codex가 해야 할 일은 `APPLY → WIRE → RUN → VERIFY → FIX → EVIDENCE`다.

## 8. Git/배포

- `/` 운영본은 건드리지 않는다.
- `/v2` add-only.
- 실제 AWS deploy는 자격증명/사용자 승인/현재 branch 확인 뒤 scoped upload.
- `aws/deploy-app.sh` 전체 sync를 첫 v2 검증에 무심코 사용하지 않는다.
- Service Worker와 Content-Type, CloudFront invalidation을 별도 검증한다.
