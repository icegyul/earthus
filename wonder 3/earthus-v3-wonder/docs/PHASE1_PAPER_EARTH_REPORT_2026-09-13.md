# EARTHUS V3 WONDER — PHASE 1 PAPER EARTH 보고서 (2026-09-13)

기준: `MASTER_DEVELOPMENT_DIRECTIVE.md` §2 · §32 PHASE 1 + PD DECISION LOCK 2026-09-13 §5~§8. 착수 전 점검은 `PHASE1_PRESTART_CHECK.md`(6/6 PASS).
**"완료"는 Browser Verified 까지 통과한 항목에만 쓴다. Device Verified 는 이 보고서에 하나도 없다.**

## 게이트 요약

| 항목 | IMPLEMENTED | TESTED (자동) | BROWSER VERIFIED | DEVICE VERIFIED |
|---|---|---|---|---|
| 1 Paper Earth (구 + 종이 텍스처, 실제 대륙) | ✅ | ✅ geo·equirect | ✅ 4폭 | ❌ |
| 2 camera (궤도, 3단 거리, 목표 지름) | ✅ | ✅ 거리↔지름 왕복, 720/660/580/350 | ✅ 지름 = 목표 (1440:720 · 1024:660 · 390:350 · 375:350) | ❌ |
| 3 rotate (드래그 + 관성, 60°/s 상한, 극 잠금) | ✅ | ✅ 상한·잠금·감쇠 | ✅ 합성 드래그 −20.2°(상한 적용), 관성 −19.1° 뒤 정지 | ❌ |
| 4 zoom (3단 잠금, 휠·버튼) | ✅ | ✅ 단 잠금 | ✅ 휠 0→1→2, 지름 660→1089→1782, 버튼 복귀, 점 표시 | ❌ |
| 5 touch/pinch | ✅ | — (DOM) | ✅ 합성 두 손가락 핀치 → 단 2. **실제 손가락 미검증** | ❌ |
| 6 region entry (탭 → 지역 → 카메라 이동 + 표식 + 칩) | ✅ | ✅ 19 도시 판정 | ✅ 한국 탭 → 동아시아, 트윈 (35,115), 지름 1782, 표식·칩·EARTH 버튼, 제목 | ❌ |
| 7 Earth return (EARTH 버튼·Escape) | ✅ | — | ✅ 단 0 복귀, 표식 숨김, 칩 숨김, 힌트 복원 | ❌ |
| 8 responsive (1440/1024/390/375, DPR≤2, safe-area) | ✅ | ✅ targetDiameter | ✅ 4폭, 가로 넘침 0, DPR 2 버퍼 750×1624, 폰은 텍스처 1024×512 | ❌ |
| 깊이감(§2.2 "지구 뒤로") | ✅ 표식이 구 뒤로 가면 가려짐 | — | ✅ 180° 회전 시 markerFacing false → 복귀 true | ❌ |
| reduced motion | ✅ | ✅ 즉시 도착 | ✅ 체크 시 줌 즉시(660→1089), 트윈 없음 | ❌ |

## 1. 변경 파일 목록 (M)

| 파일 | 내용 |
|---|---|
| `apps/web/index.html` | PHASE 0 무대 진입 → **종이 지구 진입**으로 교체(캔버스·EARTH/지역 칩·줌 버튼·힌트·움직임 줄이기·자료 출처) |

## 2. 신규 파일 목록 (A, 13)

| 파일 | 내용 |
|---|---|
| `packages/globe-engine/src/geo.mjs` | 좌표식(LOCK §4) · `llToVec/vecToLL/wrapLon/clampLat/haversineKm/equirect/shortestLonDelta` |
| `packages/globe-engine/src/camera.mjs` | `OrbitCamera` 상태기 · `targetDiameter/distanceForDiameter/diameterAtDistance/zoomDistances` |
| `packages/globe-engine/src/regions.mjs` | 지역 12(§3 9 + 보완 3) · `regionAt/regionFocus` |
| `packages/globe-engine/src/paper-texture.mjs` | Natural Earth 폴리곤 → 종이 오려 붙인 등장방형 텍스처(그림자·단면·결) |
| `packages/globe-engine/src/earth.mjs` | three r184 장면 · 구·재질·빛·표식·`pick`·`metrics` |
| `packages/globe-engine/src/input.mjs` | 포인터 회전(관성)·핀치(단)·탭·휠·키보드 |
| `packages/globe-engine/README.md` | 패키지 설명 |
| `apps/web/src/earth-main.mjs` | 부팅·UI 결합·ambient(6초 뒤 0.45°/s)·계측·`window.__wonder`(검증용, `stepFrames`) |
| `apps/web/earth.css` | 종이 지구 화면 스타일(safe-area, 640px 이하 배치) |
| `apps/web/stage/index.html` | PHASE 0 무대 페이지 이동본(경로만 `../`) |
| `tests/globe-engine.test.mjs` | geo 3 · camera 4 · regions 1 = 8 테스트 |
| `docs/PHASE1_PRESTART_CHECK.md` | 착수 전 점검 6항목 |
| `wonder 3/.gitattributes` | `* text=auto eol=lf` + 그림 binary — autocrlf 가 레지스트리 sha256 을 깨지 않게 |

## 3. 삭제 파일 목록

**없음.** 이동만 3건(R100): `apps/web/vendor/{three-r184.module.min.js, three.core.min.js, three-r184-LICENSE.txt}` → `packages/shared/vendor/three/` (packages 가 apps 를 참조하지 않게 — ARCHITECTURE_LOCK §2).
기준선 커밋 전 이동: `tools/` → `scripts/`(4파일), `content/characters/webp/` → `content/characters/runtime/`.

## 4. 테스트 결과

`node --test "tests/*.test.mjs"` → **tests 28 · pass 28 · fail 0** (interaction-runtime 10 · registry/review/resolver 7 · background-replacement 3 · **globe-engine 8**). `scripts/build-registry.mjs --check` → 최신.
globe-engine 8: 좌표식 4방향 · 왕복 200점 <1e-9 · wrapLon/clampLat/equirect/거리 · 목표 지름 4폭 · 거리↔지름 왕복 · 60°/s 상한·극 잠금·3단 잠금 · 트윈 0.9s 도착·최단 경도·관성 감쇠 · 지역 19도시 + 바다 null + 극 반구.

## 5. Browser Verification (인앱 Chromium, `http://localhost:8790/apps/web/`, 콘솔 오류 0 · 네트워크 전부 200)

| 확인 | 결과 |
|---|---|
| 부팅 내역 (1024×768) | 자료 16ms · 텍스처 57ms(2048×1024, 나라 177) · GL 초기화 186ms(첫 실행 626ms) · **첫 프레임 2.2~3.2s 는 인앱 패널이 앞에 올 때까지 rAF 가 멈추는 환경 지연**(기존 실측 함정, 자료·코드 시간 아님). 실기기 첫 그림 시간은 미측정 |
| 회전 | 합성 포인터 12회 이동 → −20.2°(상한 60°/s 적용, vLon=−60), 손 뗀 뒤 관성 −19.1° → 0 |
| 줌 | 휠 −120 → 단 1(1089px) → 단 2(1782px) = 660×{1.65, 2.7} · 버튼 −− → 단 0(660) · 점 표시 |
| 핀치 | 두 포인터 벌리기 → 단 2 (합성 이벤트) |
| 지역 진입 | 화면 중앙(36,127) 탭 → `east-asia`, 칩 "동아시아 · East Asia", EARTH 버튼, 트윈 후 (35,115)·1782px, 표식 보임, 제목 변경 |
| 깊이 | 카메라 경도 +180° → `markerFacing=false`(구 뒤) → 되돌리면 true |
| 지구 복귀 | EARTH 클릭 → 즉시 view=world, 칩·버튼 숨김, 트윈 후 660px, 표식 숨김 |
| 움직임 줄이기 | 체크 → zoomIn 즉시 1089px(animating=false) |
| 반응형 | 1440×900: 720/720 · 1024×768: 660/660 · 390×844: 350/350(텍스처 1024×512, 탭→지역 945px) · 375×812: 350/350, DPR 2(750×1624), scrollWidth 375 |
| 무대 페이지(이동본) | `/apps/web/stage/` 부팅, 레지스트리 286 · 그림 준비 124/124, 예티 그림 로드 |

## 6. Asset loading 결과

| 자원 | 크기 | 비고 |
|---|---|---|
| three r184 (module + core) | 733 KB | `packages/shared/vendor/three`, CDN 없음 |
| `content/geo/country-reference.json` | 426 KB | Natural Earth admin 0, public domain |
| 앱·패키지 코드 6 + css | 42 KB | |
| **합계 11 요청 · 1,198 KB** | | **캐릭터·배경 0 요청**(§19: 124 initial load 금지, PNG 일괄 금지) |
| 지구 텍스처 | 런타임 생성 2048×1024(8 MB GPU) / 폰 1024×512(2 MB) | 그림 파일 없음, 15~57ms |

## 7. Memory / resident budget 결과

| 항목 | 값 |
|---|---|
| JS heap (Chromium `performance.memory`) | 부팅 4.7~5.8 MB · 지역 진입↔복귀 12회 왕복(1,440 프레임) 뒤 4.3 → 6.5 MB (GC 전 잡음 수준, 누적 증가 없음) |
| GPU | 텍스처 2(지도 + three 기본) · 기하 3(구·표식·링) · 삼각형 12,096/프레임 · draw call 1~3 |
| 드로잉 버퍼 | DPR ≤ 2 캡: 1024×768@1 · 750×1624@2 |
| 예산 판단 | §18 "숫자는 device tier 에 맞춰" — 폰은 텍스처 반으로. 절대 상한은 실기기 뒤 정한다 |

## 8. git commit SHA

- 기준선(PHASE 0 + 착수 전 준비): `b3796259` — 329파일
- **PHASE 1 코드: `71e1b3c4cb0bcd7a4c92be40b1bebbb824a33015`** — 17파일(+886/−33), `git add -- "wonder 3"` 경로 지정, 다른 세션 변경 0건 포함
- 보고서·상태 문서: 이 문서의 커밋(다음)
- **push 안 함** — "깃허브에는 v1·v2 만"(2026-09-05 PD 결정)과 "원격은 백업"(2026-09-03) 이 충돌. PD 결정 대기.

## 9. NOT DONE

- 환경 unfold·랜드마크·캐릭터 on globe·지명 라벨·국경/해안 glow(PHASE 2·4·6) — 지역 진입은 **카메라 포커스 + 표식 + 칩**까지
- 실제 손가락 핀치·관성 손맛·발열·첫 그림 시간(실기기)
- iOS Safari · 저사양 안드로이드
- `.claude/launch.json` `earthus-v3-wonder` 항목: 공유 파일이라 미커밋(partial-stage 함정)
- 배경 24장 재제작(PHASE 4 전 필요), 캐릭터 124 WebP 눈 검수(접촉 시트) — PHASE 6 전

## 10. BLOCKERS

1. **Device Verified 0건** — 실기기(아이폰·안드로이드) 확인은 사람이 해야 한다. 확인용 주소: 로컬 `http://<PC IP>:8790/apps/web/`(dev-server 는 127.0.0.1 바인딩이라 LAN 노출 옵션 추가 필요) 또는 스테이징 `app/wonder/next/` 배포(PD 승인 후)
2. push 여부(§8)
3. 지역 12개 중 보완 3개(Africa · Middle East/Central Asia · Siberia) PD 확인 — 지시서 §3 는 "예" 목록
4. 인앱 브라우저의 rAF 정지 — 자동 검증은 `__wonder.stepFrames` 로 대신했고, 실제 프레임은 스크린샷 시점에만 돈다
