# MOBILE GLOBE ROTATION RULE LOCK — V2 회전 규칙 이식 보고 (2026-09-13)

PD 지시: 모바일 Device Gate 에서 발견된 "드래그 시 남극으로 내려가고 이후 회전이 잠기는 문제"를 새 규칙으로 재설계하지 않고 **EARTHUS V2 의 검증된 Globe Rotation 규칙**을 V3 WONDER 기준으로 쓴다. V2 코드는 읽기만 했다(수정 0). 단순 위도 clamp 로 숨기지 않았다 — 아래 [BEHAVIOR] 의 차이를 전부 V2 규칙으로 바꿨다.

## [V2 SOURCE] — V2 에서 확인한 실제 회전 구현

| 항목 | 위치(읽기 전용) | 확인한 내용 |
|---|---|---|
| 클래스 | `prototype/v2-three/js/main.js` **`class OrbitCam`** 563~757행 (`constructor(camera, dom)` 564, `update(dt)` 700) | `prototype/v2-deploy/js/main.js` 563행과 200행 diff **IDENTICAL**, 라이브 번들 `https://earthus.net/v2/js/main.js` 에도 `class OrbitCam` 존재 |
| pointer/touch 입력 | 601·637~639 `pointerdown/pointerup/pointercancel/pointermove` (Pointer Events 한 벌) | 터치는 `this.touches` Map 에만 등록, 마우스·펜은 `dragging` 플래그 |
| 캡처 순서 | 598~600 주석 + 616·623 `capture(e)` | "포인터 캡처는 항상 상태를 정한 **뒤에** 잡는다 — 앞에서 잡으면 캡처 실패 예외가 드래그 상태를 통째로 날린다" |
| drag 방향 | 672~673 `targetYaw -= dx * speed; targetPitch += dy * speed;` | 손가락이 가는 쪽으로 지구가 따라온다 |
| horizontal rotation / longitude | yaw 무한 — 감지 않음 | 4894·5931 등 읽을 때만 `((deg+540)%360)−180` 로 접음 |
| vertical rotation / latitude | 674~675 `lim = π/2 − 0.05; targetPitch = clamp(−lim, lim)` | **±87.135°**. 극 근처 특별 처리 없음 — yaw 드래그는 계속 받는다 |
| drag 속도 | 583~589 `dragSpeed()` = `2·tan(fov/2)·(targetDist−1)/clientHeight` rad/px | 주석: "1픽셀 끌면 손가락 아래 지점이 정확히 1픽셀 따라오는 회전량. 옛 상수식은 어디서나 약 3배 빨랐다" |
| inertia / velocity decay | `update(dt)` 704~710: `k = 1−exp(−dt·damp)`, damp 8.0(평상) / 3.2(`glide>0`, 국가 포커스 핏) | **속도 관성 없음, 속도 상한 없음.** 목표(target)를 지수 감쇠로 따라간다 |
| pointer capture / pointercancel | 616~625 `lift` = `pointerup` 과 `pointercancel` 공용 | "두 손가락 중 하나만 떼면 남은 손가락으로 회전을 이어받는다 — 이어받지 않으면 손가락이 화면에 남아 있는데도 지구가 굳어버린다" |
| pinch 와 rotation 분리 | 610 `if (touches.size >= 2) { dragging = false; return; }`, 643~665 두 손가락 = 핀치(거리 비율 → `targetDist`) + 틸트(중점 세로), `dragging=false; return` | 두 손가락 동안 회전 0 |
| touch-action | `prototype/v2-three/index.html` 53~60 `canvas { touch-action:none; user-select:none; -webkit-touch-callout:none }` | 주석: auto 면 브라우저가 한 손가락 드래그를 페이지 팬으로 가져가 "지구가 조금만 돌다 만다" |
| iOS | 687~697 `document` 의 `gesturestart/gesturechange/gestureend` preventDefault(패널 위 예외) | "iOS 사파리는 touch-action:none 으로도 페이지 핀치 줌을 막지 못한다" |
| wheel | 681~685 `targetDist *= exp(deltaY·0.0011)` 연속 | V3 는 3단 잠금이라 단(step)만 옮긴다 |
| desktop/mobile 차이 | 같은 핸들러. 데스크톱 가운데 버튼 = 틸트, 모바일 두 손가락 세로 = 틸트. 첫 화면 자동회전은 첫 pointerdown/wheel 에서 끝 | 틸트·자동회전 토글은 V3 범위 밖(옮기지 않음) |
| 카메라 배치 | 713~722 `position = (sin yaw·cos pitch, sin pitch, cos yaw·cos pitch)·dist; lookAt(0,0,0)` | up 기본(+y). V3 는 ARCHITECTURE_LOCK §4 축 배치(x=cosφcosλ, z=−cosφsinλ)로 같은 의미 |

## [V3 PORT] — 옮긴 파일/함수 (구조: Globe Interaction → Rotation State → Paper Earth Visual)

| 층 | 파일 | 무엇을 |
|---|---|---|
| Rotation State | `packages/globe-engine/src/camera.mjs` | `dragSpeedRad()`(V2 dragSpeed), `OrbitCamera.degPerPx / beginDrag / drag / endDrag / nudgeLon / tick`, `PITCH_LIMIT_DEG = (π/2−0.05)·180/π`, `DAMP_FOLLOW 8.0`, `DAMP_GLIDE 3.2`, `MIN_ALT_R 0.0006`. `targetLat/targetLon/targetDist` + 현재값. `tick()` = V2 `update()`. `pose()` 에서만 경도를 접는다. 줌 3단 트윈은 V3 그대로(트윈 중 드래그하면 트윈 목표를 따라가기 목표로 바꿔 줌은 마저 가고 회전은 손이 가진다). `beginDrag` 는 V2 pointerdown 처럼 목표를 되돌리지 않는다 |
| Globe Interaction | `packages/globe-engine/src/input.mjs` | `attachGlobeInput`: `touches` Map(터치만), `down`(상태 → 캡처 순서, 두 손가락이면 `dragging=false`), `move`(두 손가락 = 핀치 단·회전 0, 한 손가락 = 첫 픽셀부터 `camera.drag(dx,dy)`), `lift`(pointerup = pointercancel, 남은 손가락 이어받기), iOS `gesture*` preventDefault(`#storyCard, #qa, #log` 예외). V3 고유 유지: 탭(≤8px·500ms·pointerup 만), 휠 단, 키보드. 휠 쿨다운 초기값 버그(첫 320ms 의 휠 무시) 수정 |
| Visual | `packages/globe-engine/src/earth.mjs` | 변경 없음 — `render(pose)` 가 `llToVec(lat, lon, dist)` + `lookAt(0,0,0)` + up(0,1,0). V2 와 같은 배치 |
| 앱 | `apps/web/src/earth-main.mjs` · `apps/web/earth.css` | 첫 화면 자동 회전을 `camera.nudgeLon()`(현재값·목표 동시)로. `#globe` 에 `-webkit-touch-callout:none` 추가(`touch-action:none` 은 이미 있었음) |
| QA | `apps/web/src/qa-overlay.mjs` v2 | 15번째 단계 **pole**: 드래그로 \|lat\| ≥ 80 도달 뒤 드래그로 \|lat\| < 60 복귀(지역 접근 트윈 제외). `tests/device-gate.test.mjs` 가 v1(14)·v2(15) 를 구분 |
| 시험 | `tests/globe-engine.test.mjs`(카메라 4), `tests/globe-interaction.test.mjs`(신규 6 — 가짜 요소로 포인터 규칙) | 아래 [REGRESSION] |

폐기한 V3 규칙: 60°/s 상한(`MAX_RATE_DEG_S`), 속도 관성(`vLon/vLat`·exp(−3.2t)), 위도 ±85°(`LAT_LIMIT`), `degPerPx` 임의식(지름 가로질러 150°). 기록: `docs/ARCHITECTURE_LOCK.md §4-A`, `docs/DECISION_LOCK_2026-09-13.md` 9.

## [BEHAVIOR] — V2 와 V3 동작 비교

| 동작 | V2 (원본) | V3 이전 | V3 지금 |
|---|---|---|---|
| 드래그 속도 | 손가락 1:1 (`2·tan(fov/2)·(dist−1)/H`) | 임의식 — 375px 폰 0.43°/px(약 1.5배), 1440 에서 0.21°/px | **V2 식**: 1440×900 0.1194°/px · 1024×768 0.1276 · 390×844 0.2817 · 375×812 0.2800 |
| 상한 | 없음 | 60°/s (프레임당 잘라냄 → 폰의 빠른 플릭에서 손보다 한참 느림) | **없음** |
| 관성 | 없음 — 목표 따라가기 k=1−exp(−8dt) (첫 프레임 12.5%, 0.5s 98%) | 속도 관성 60°/s, exp(−3.2t) 감쇠 → 손을 떼도 최대 19° 더 감 | **V2 와 같음** |
| 위도 한계 | ±87.135° | ±85° | **±87.135°** |
| 극 근처 | 한계에서 멈추고 가로·반대 드래그 계속 받음 | 관성이 극으로 밀어붙인 뒤 clamp — 가로 드래그는 극 둘레 회전으로만 보여 "잠김" 으로 읽힘 | **관성이 없어 손이 놓은 자리에서 멈춘다.** 가로 드래그 경도 변화·반대 드래그 복귀 검증(아래) |
| 두 손가락 | 회전 0, 핀치·틸트 | 회전 0, 핀치 단 | 회전 0, 핀치 단(틸트 없음) |
| 한 손가락 뗌 | 남은 손가락이 이어받음 | 이어받음 | 이어받음 — 제 자리 기준, 점프 0(검증) |
| pointercancel | lift 와 같음 | 삭제만 | **lift 와 같음** |
| iOS 페이지 핀치 줌 | gesture* 막음 | 없음 → 두 손가락 뒤 페이지가 확대되면 한 손가락은 페이지 팬(지구 "잠김") | **막음**(카드·QA 패널 위 예외) |
| 캡처 순서 | 상태 뒤 | 상태 앞(try/catch) | 상태 뒤 |
| 방향 | yaw −= dx, pitch += dy | 같음 | 같음 |
| 줌 | 연속(휠 exp, 핀치 비율) | 3단 트윈 | **3단 트윈 유지**(PD "기존 V3 줌 유지") |

## [MOBILE] — Android/iOS 결과

- **실기기: 0건 (Device Verified 없음).** Claude Code 는 실기기를 만질 수 없다. PD 가 스테이징 `https://earthus.net/wonder/next/apps/web/?qa=1&device=1` 에서 Android Chrome·iOS Safari 로 15단계(극 시험 포함)를 다시 돌린다 → [복사] JSON → `docs/device-gate/device/` → `npm test`.
- 인앱 Chromium 모바일 에뮬레이션(Android UA·터치 5점·`touch-action:none` 확인)에서 합성 터치 PointerEvent 로 구현 검증(게이트 근거 아님):

| 폭 | 지름 | °/px | 한 손가락 150px | 극 | 극에서 가로 | 반대로 | 핀치 | 이어받기 | 취소 후 드래그 |
|---|---|---|---|---|---|---|---|---|---|
| 390×844 (로컬) | 350 | 0.2817 | −42.254° (예상 −42.254) | −87.135°(위로 끌기) | Δlon −11.27° | +81.88° 까지(169° 이동) | 단 0→2, 경도 불변 | Δlon −2.4458 (예상 −2.4458) | Δlon −3.2611 (예상 −3.2611) |
| 375×812 (로컬) | 350 | 0.2800 | +42.007° (예상 +42.007, 왼쪽) | +87.135°(아래로 끌기) | Δlon +11.20° | −80.89° 까지 | 인 0→2 · 아웃 →0, 경도 불변 | — | — |
| 375×812 (**스테이징** `d5fcec37`) | 350 | 0.2800 | −42.007° (예상 −42.007) | −87.135° | Δlon −11.20° | +24.88° 로 복귀 | 단 0→2, 경도 불변 | Δlon −2.4098 (예상 −2.4098) | — |

스테이징(375): 4xx 0 · 프로젝트 밖 요청 0 · QA 패널 15단계 표시(초기 로드·드래그·핀치 자동 체크됨).

데스크톱(실제 마우스 드래그): 1440×900 지름 720, 200px 드래그 → 경도 127 → 103.21 (예상 103.12, 도구 드래그 ±1px) · 휠 1틱 → 단 1, 지름 1188(=720×1.65), °/px 0.0607. 1024×768 지름 660, 100px → −12.761° (예상 −12.761). 콘솔 오류 0(현재 페이지 4xx 0), 요청 전부 프로젝트 안.

## [POLE TEST] — 북극/남극 주변

| 화면 | 도달 | 극에서 가로 드래그 | 반대 드래그 | 그 뒤 새 드래그 |
|---|---|---|---|---|
| 1440 마우스 | +87.135 | Δlon −7.165° | 39.37° 로 복귀 | 정상(경도 −4.8°) |
| 1024 마우스 | +87.135 | Δlon −6.381° | 10.57° 로 복귀 | — |
| 390 터치 | −87.135 | Δlon −11.268° | +81.88° 로 복귀 | 정상 |
| 375 터치(로컬) | +87.135 | Δlon +11.202° | −80.89° 로 복귀 | 정상 |
| 375 터치(스테이징) | −87.135 | Δlon −11.202° | +24.88° 로 복귀 | — |
| node(가짜 요소) | ±87.135 양극 | 경도 변화 확인 | 위도 30° 로 정확 복귀 | 정상 |

어느 단계에서도 입력 불능 없음. **실기기 극 시험은 QA 오버레이 15번(pole)** 이 자동 체크한다(입력 불능이면 체크가 안 남는다 = FAIL).

## [PINCH] — pinch / rotate 충돌

- 둘째 손가락이 닿는 순간 `dragging=false`; 두 손가락 이동은 회전 목표를 바꾸지 않는다(브라우저·node 모두 `lonUnchanged: true`).
- 핀치는 거리 비율 1.3 마다 한 단(V3 3단 유지). 390: 0→2, 375: 인 0→2 · 아웃 2→0.
- 한 손가락을 떼면 남은 손가락이 **제 자리에서** 회전을 이어받는다(점프 0: Δlon 이 예상값과 1e-4 안).
- 충돌 없음.

## [REGRESSION]

- `node --test` **56/56** (이전 48 → 카메라 시험 개편 + interaction 6 신규 + device-gate v1/v2). `build-registry --check` 최신.
- 데스크톱 1440·1024 / 모바일 390·375 브라우저 검증 위 표. 콘솔 오류 0, 4xx 0.
- **스테이징 재배포**: `bash scripts/deploy-staging.sh` → `app/wonder/next/**` **10 put**(earth-main.mjs · qa-overlay.mjs · camera.mjs · input.mjs · earth.css + 디렉터리/주소 키 4 + BUILD.json), **삭제 0**, prefix 객체 295 → 295, 커밋 **`d5fcec37`**(CDN `BUILD.json`·`camera.mjs`·`qa-overlay.mjs` v2 확인). production(`live/`·별칭 3키 2026-09-07 그대로)·`app/v3`·V1·V2 변경 0.

## DO NOT 준수

기존 V2 코드 수정 0 · V2 회전 규칙 임의 변경 0(틸트·자동회전·연속 줌은 "옮기지 않음" 으로 기록, 바꾼 것 아님) · `app/v3` 0 · AWS production 0 · background approval 0(production_approved 0 유지) · Phase 2 0 · push 0.

## BLOCKERS

없음(구현·브라우저). 남은 것은 PD 몫: **실기기 Android/iOS 재수행(15단계)** + 배경 production 승인.
