# EARTHUS V3 WONDER — ARCHITECTURE LOCK v1 (2026-09-13)

DECISION LOCK 2(STACK)의 구체화. 이 문서에 없는 구조 변경은 먼저 이 문서를 고치고 승인받는다.

## 1. 스택 (LOCKED)

| 항목 | 결정 |
|---|---|
| 언어·모듈 | 브라우저가 직접 읽는 **ES 모듈(.mjs)**. 번들러·트랜스파일러 없음 |
| 프레임워크 | **없음.** React/Next/Vue/Svelte 전환 금지 |
| 타입 | JSDoc 주석. 팩의 `.ts` 계약은 `packages/*/contract/` 에 원본 그대로 두고 실행체는 `.mjs` |
| 도구·테스트 런타임 | Node ≥ 20 (실측 24.18). `node --test` |
| 서드파티 | `apps/web/vendor/` 에 **파일로 복사**(라이스선스 고지 동반). CDN 금지. 현재 후보: three r184(MIT), earcut(ISC), satellite.js(MIT) — 필요한 PHASE 에서 |
| 스타일 | 단일 `styles.css` + 컴포넌트별 `.css` 허용. CSS-in-JS 없음 |
| 상태 | 전역 상태 라이브러리 없음. `apps/web/src/main.mjs` 의 `state` 객체 하나 + 패키지는 무상태 함수/팩토리 |

## 2. 디렉터리와 의존 방향 (LOCKED)

```
content/   ← 자료. 코드가 없다. registry 가 유일한 색인
packages/  ← 순수 로직 + 무대/렌더 엔진. apps 를 모른다
apps/web/  ← DOM·입력·화면 결합. packages 와 content 를 쓴다
scripts/   ← Node 스크립트(레지스트리·변환·벤치마크·dev 서버). 브라우저에 실리지 않는다
tests/     ← node --test. packages 와 tools 와 content 의 계약을 검사한다
docs/      ← 결정·지도·보고서
benchmarks/← 실험 산출물. 레지스트리 대상 아님
```

- **의존 방향은 한쪽이다:** `apps/web → packages → (sibling packages)`. `packages` 가 `apps` 를 import 하면 위반.
- `packages/*` 는 `window`·`document` 를 **직접 잡지 않는다.** DOM 이 필요한 엔진(무대·지구)은 팩토리 인자로 루트 요소를 받는다(`createStage(root, …)` 방식).
- `content/*` 는 코드에서 **상대 URL 로만** 읽는다. 절대 경로(`/content/…`)를 쓰면 배포 prefix 가 바뀔 때 깨진다(`main.mjs` 의 `CONTENT_BASE = new URL('../../../', import.meta.url)`).
- 기존 V3(`prototype/v3-kids`, `prototype/v3-paper`) 코드 import·복사 금지. 규약(리그·동작 어휘·좌표식)은 값으로만 채택.

## 3. 패키지 경계 (현재 + 예정)

| 패키지 | 역할 | 상태 | DOM |
|---|---|---|---|
| `interaction-runtime` | 제스처 → 동작 시퀀스, manifest 정규화·검증, 프로필 | PHASE 0 ✅ | 없음 |
| `stage-engine` | 배경 선택기(좌표→지역), 이후 무대 겹 관리 | PHASE 0 일부 (선택기) | 무대 부분은 루트 주입 |
| `globe-engine` | 종이 지구: 좌표·카메라·지역·종이 텍스처·three 장면(글로우 링·썸네일 스프라이트)·입력 | PHASE 1 ✅ · 1-B 확장 | 캔버스 루트 주입 |
| `wonder-environment` | 흐름 상태기(earth→approaching→unfolding→active→folding→zooming-out), 환경 카탈로그 조회 | PHASE 1-B ✅ (순수) | 없음 — DOM 층은 `apps/web/src/environment.mjs` |
| `asset-runtime` | 레지스트리 해시 로더: dedupe·재시도·타임아웃·취소·LRU 예산(30MB)·unload·stale | PHASE 1-B ✅ | 없음 — `defaultImageLoader` 만 브라우저 |
| `character-renderer` | 전신 빌보드 + 몸 전체 변형, 재생 큐, (나중에) 관절 파츠 슬롯 | PHASE 3 | 무대 루트 주입 |
| `content-registry` (scripts) | 레지스트리 생성·검사 | PHASE 0 ✅ (scripts/) | — |

`apps/web/src/stage.mjs`·`gestures.mjs` 는 PHASE 0 의 임시 위치다. PHASE 2 에서 `stage-engine`/`character-renderer` 로 옮긴다(동작 변경 없이 이동만, 테스트 유지).

## 4. 좌표 규약 (LOCKED — 값)

지구 반지름 1 의 단위 구. 위도 φ, 경도 λ (도 → 라디안):

```
x =  cos φ · cos λ
y =  sin φ
z = −cos φ · sin λ
```

북극 = +y, 경도 0°(그리니치) = +x, 동경 = −z 방향. 모든 패키지가 이 식 하나를 쓴다(`packages/paper-earth/src/geo.mjs` 에 두고 다른 곳에서 재정의 금지).
기존 두 판(v3-kids `surfaceNormal`, v3-paper `geo.js`)의 식이 서로 달랐던 것이 이식 사고의 원인이었으므로 **하나로 못 박는다.**

## 4-A. 지구 회전 규칙 (LOCKED — 2026-09-13 PD ROTATION RULE LOCK, 원본 = EARTHUS V2)

원본: `prototype/v2-three/js/main.js` `class OrbitCam` (563~757행, v2-deploy·라이브 번들 동일). V3 는 새 회전 알고리즘을 만들지 않고 이 규칙을 옮긴다. 구조는 **Globe Interaction(`globe-engine/src/input.mjs`) → Rotation State(`camera.mjs`) → Paper Earth Visual(`earth.mjs`, `pose()` 만 읽음)** 으로 분리한다.

| 항목 | V2 규칙(그대로) | V3 위치 |
|---|---|---|
| 입력 | Pointer Events 한 벌(마우스·터치·펜), 캔버스 `touch-action:none` + `user-select:none` + `-webkit-touch-callout:none`, 캡처는 상태를 정한 뒤에 | `input.mjs` · `earth.css #globe` |
| 드래그 속도 | 1px = 손가락 아래 지점 1px: `2·tan(fov/2)·(targetDist−1)/H` rad/px. **상한 없음** | `camera.dragSpeedRad` · `degPerPx()` |
| 방향 | `targetLon −= dx·speed`, `targetLat += dy·speed` (손가락이 가는 쪽으로 지구가 따라온다) | `camera.drag` |
| 위도 | ±(π/2 − 0.05) rad = ±87.135°. 경도는 감지 않음(`pose()` 에서만 접음) | `PITCH_LIMIT_DEG` |
| 관성 | **속도 관성 없음**. 목표를 `k = 1−exp(−dt·8.0)` 로 따라감(프로그램 이동 3.2) | `camera.tick` |
| 두 손가락 | 회전 아님(`dragging=false`). 핀치 = 줌(V3 는 3단: 비율 1.3 마다 한 단). 하나를 떼면 남은 손가락이 제 자리에서 이어받음 | `input.mjs` `lift` |
| 취소 | `pointercancel` = `pointerup` 과 같은 lift | `input.mjs` |
| iOS | `document` 의 `gesturestart/change/end` preventDefault(카드·패널 위 예외) — touch-action 으로는 페이지 핀치 줌이 안 막힘 | `input.mjs` |
| 줌 | V3 유지: 휠·버튼·핀치 = 3단 잠금, 이동은 트윈 0.9s. 트윈 중 드래그하면 줌은 따라가기로 마저 가고 회전은 손이 가진다 | `camera.setZoomStep` |
| 없는 것 | V2 의 틸트(가운데 버튼·두 손가락 세로)·자동회전 토글은 V3 범위 밖 | — |

이전 V3 규칙(60°/s 상한 · 속도 관성 · 위도 ±85° · `degPerPx` 임의식 150°/지름)은 **폐기**. `docs/PHASE1_PAPER_EARTH_PLAN.md` 의 "60°/s 상한(키즈 규칙)" 은 역사 기록이다. 근거·검증: `docs/ROTATION_RULE_PORT_2026-09-13.md`.

## 5. 콘텐츠 규칙 (LOCKED)

1. `content/registry/asset-registry.json` 이 유일한 자산 색인. 레지스트리에 없는 파일은 화면에 싣지 않는다.
2. 등록 전 **눈 검수** — 팩류 자산은 접촉 시트로 보고 `*-review.json` 에 판정을 남긴다. 검수 ok 가 아닌 자산은 `load: blocked-by-review`.
3. 레거시 PNG 원본·런타임 번들은 등록하지 않는다. 그림은 WebP 만(변환 기준은 `CHARACTER_WEBP_BENCHMARK.md` 승인 뒤).
4. 사실 규칙(기존 결정 계승): 과장은 크기까지, 위치·존재는 사실 / 자료 없으면 안 그림 / 위험기상은 웃지 않는다 / GPS 안 씀.
5. 캐릭터 동작: 전신 스프라이트 폴백이 정상 경로. "관절 애니메이션 완료"를 주장하지 않는다.

## 6. 런타임 규칙 (LOCKED)

- 서비스워커 **없음**(새 캐시 네임스페이스 필요 시 별도 승인). 캐시는 HTTP 헤더로만(배포 지도 §4).
- `localStorage` 는 언어 설정(`earthus.lang`, v1·v2 와 같은 키)만.
- 위치 권한 요청 금지. 외부 링크는 부모 관문 뒤 공식 페이지만(기존 결정).
- 네트워크: 같은 출처의 `content/` + 승인된 데이터 발행본(PHASE 1 이후 목록 관리). 제3자 SDK 없음.
- 디버그 손잡이는 `window.__wonder` 하나. 운영 기능이 그것에 의존하지 않는다.

## 7. 검증 규칙 (LOCKED)

| 게이트 | 방법 |
|---|---|
| Implemented | 파일 존재 + 실행 경로 연결 |
| Tested | `node --test "tests/*.test.mjs"` 전부 PASS (현재 17) |
| Browser Verified | 인앱 브라우저 데스크톱 + 375×812. 콘솔 오류 0, 네트워크 200, 실제 입력(클릭/합성 포인터) |
| Device Verified | 실기기(아이폰·안드로이드) 사람 확인 또는 원격 실기기. **자동화로 대체 불가** |

"완료" = Browser Verified 통과. Device 미확인은 항상 NOT DONE 에 적는다.

## 8. 지금 하지 않는 것

AI 대화·결제·SNS·대규모 콘텐츠 추가·PWA 설치·오프라인. PHASE 1 은 Paper Earth 8항목만.

## 9. Master Directive §31 과의 정렬 (2026-09-13 편입 뒤 추가)

지시서 §31 은 루트 `wonder 3/` 직하 `apps/ packages/ content/ tests/ docs/ scripts/` 와 패키지 11종(`globe-engine world-lod wonder-environment wonder-discovery character-engine story-engine asset-runtime asset-registry ai-gateway child-safety shared`)을 **권장**하고 "architecture boundary 는 유지"라고 적었다.
이 문서 §2 의 의존 방향·경계 규칙은 그대로 유효하다. 이름·경로 정렬(R1~R3)은 `MASTER_DIRECTIVE_RECONCILIATION.md` 의 PD 결정 뒤 한 번에 한다. 그 전까지 §3 의 현재 이름을 쓴다.
