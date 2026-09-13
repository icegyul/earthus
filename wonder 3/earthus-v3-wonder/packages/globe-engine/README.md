# @earthus-v3-wonder/globe-engine (PHASE 1 — Paper Earth)

Master Directive §2 Paper Earth · §32 PHASE 1 (Globe · camera · rotation · zoom · touch · earth return) + PD 지시(region entry · responsive).

| 모듈 | 성격 | 내용 |
|---|---|---|
| `src/geo.mjs` | 순수 | 좌표식(ARCHITECTURE_LOCK §4) `llToVec`·`vecToLL`·`haversineKm`·`equirect`·`wrapLon` |
| `src/camera.mjs` | 순수 | `OrbitCamera` 상태기 — 3단 줌 잠금, 60°/s 상한, 극 ±85°, 관성, 트윈, 움직임 줄이기. 지구 목표 지름 720/660/580/350(§2.2) → 카메라 거리 |
| `src/regions.mjs` | 순수 | §3 지역 9 + 보완 3(Africa · Middle East/Central Asia · Siberia). `regionAt(lat, lon)` |
| `src/paper-texture.mjs` | 캔버스 | Natural Earth 국가 폴리곤 → 종이 오려 붙인 등장방형 텍스처(그림자·단면·종이 결). 그림 파일 없이 자료로 굽는다 |
| `src/earth.mjs` | three.js | 구 + 재질 + 빛 + 지역 표식(구 뒤로 가면 가려짐) + 레이캐스트 `pick` + `metrics` |
| `src/input.mjs` | DOM 이벤트 | 한 손가락 회전(관성) · 두 손가락 핀치(줌 단) · 톡(탭) · 휠 · 키보드 |

three.js r184 는 `packages/shared/vendor/three/` (MIT, LICENSE 동봉). CDN 없음.
검증: `node --test "tests/*.test.mjs"` (geo·camera·regions), 브라우저는 `apps/web/` (PHASE 1 보고서).
