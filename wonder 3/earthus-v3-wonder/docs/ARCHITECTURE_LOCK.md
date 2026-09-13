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

## 4-C. Paper Earth 시각 규칙 (2026-09-13 PHASE 1, 승인된 reference)

- 바탕은 **어두운 종이 우주**(방사 그라디언트 + SVG 종이 결 한 겹 + 별 420). 지구가 화면의 유일한 주인공이다.
- 지구 텍스처는 **자료에서 런타임에 굽는다**(`paper-texture.mjs`, Natural Earth). **지리를 담은 그림 파일을 지구에 쓰지 않는다** — Background Pack 후보와 완전히 분리. 지리가 없는 종이 재질 견본은 §4-D 가 정한 조건에서만 허용한다(2026-09-13 개정, 그전 문구는 "그림 파일을 지구에 쓰지 않는다" 였다).
- 층: 바다 → 대륙붕 헤일로 → 그림자 → 생물군 위도 띠(물결 경계) → 종이 두께 → 빛 모서리 → 나라별 옅은 차이 → 자른 단면 → 극지 얼음 → 종이 결. 장식(나무·산줄기·모래)은 **고도 자료가 아니다**.
- 둘레 장식은 `ambient.mjs` 의 순수 계획으로만 만든다: 별·종이 구름 10장·대륙 이름표 6개. **나라·바다 이름표 금지**(PHASE 2 LOD 의 몫), 대시보드 UI 금지, 중국풍 장식 금지.
- 개발 표시(로그·PHASE 칩·출처·무대 링크)는 `?debug=1`·`?qa=1` 에서만 보인다.
- 창이 0×0 이 되어도 카메라 값이 NaN 이 되지 않는다(목표 지름·거리 하한, `resize(0,0)` 무시, `tick` 의 `heal()`). 지구가 사라진 채 남는 경로를 만들지 않는다.

## 4-D. Paper Earth Material 규칙 (2026-09-13, PD "이거 배경으로 적용시켜봐")

지구 표면에 **지리가 없는 종이 재질 견본**을 쓰는 것을 허용한다. §4-C 의 "그림 파일을 지구에 쓰지 않는다" 는 그에 맞춰 "지리를 담은 그림 파일" 로 좁혔다.

- 조건: 팩 manifest 가 `geography_baked: false` · `labels_baked: false` · `characters_baked: false` · `ui_baked: false` 여야 한다. 넷 중 하나라도 true 면 지구에 쓰지 않는다.
- 위치: `assets/material/paper-earth/`(content/ 밖 독립 콘텐츠). 레지스트리 kind `paper-material` · root `project` · load `on-demand`. 팩 원본 문서·manifest 사본은 같은 폴더에 `*.pack-v1.*` 로 둔다(`docs/` 는 우리가 쓴 문서 자리).
- 지리는 여전히 Natural Earth 자료가 정한다. 견본을 어디에 붙일지는 `SWATCH_ZONES`(위도 띠 + 5° 페더)가 정하고, 그 배정은 PHASE 2 LOD 에서 실제 자료로 대체한다.
- 첫 화면에 재질을 받지 않는다. 절차적 종이로 먼저 그리고, 한가할 때 갈아 끼우며, **실패하면 절차적 종이가 남는다**. 굽는 중 손이 지구를 만지고 있으면 미룬다.
- 굽고 나면 앨비도 견본은 성공·실패 무관하게 `unload` 한다(2048² 디코드가 세션 내내 남지 않게). 노멀·거칠기는 three 재질이 잡는다.
- 층을 "그렸다"고 보고하기 전에 실제로 그려졌는지 센다(`coverage`). 안 그린 층을 적으면 회귀를 놓친다.
- `§2` 디렉터리: `assets/` 는 `background/`(지역 배경 후보)와 `material/`(지구 재질) 두 갈래다. `§6` 네트워크 허용에 `assets/material/**` 를 포함한다.

근거·검증: `docs/PAPER_EARTH_MATERIAL_V1_REPORT_2026-09-13.md`.

## 4-E. Wonder Earth Assets v1.2 규칙 (2026-09-13, PD "ASSETS v1.2 실제 적용 작업 지시서")

지구 표면에 **지리를 담은 그림 팩**(등장방형 마스터 2048×1024 를 16지역으로 자른 것)을 쓰는 것을 허용한다. §4-C 의 "자료에서 런타임에 굽는다" 는 절차적 경로(`?earth=paper`)로 남고, 기본 경로는 자산 팩이 된다.

- **LOD 사다리**: LOD0 `shared/overview_1k.avif` 한 장(1024×512, 179KB)이 전지구를 빈틈없이 덮고, LOD1 은 **카메라가 보는 지역만** `uv_bounds` 자리에 얹는다. 데스크톱 6곳·모바일 4곳 동시 상주, 나머지는 `forget`. **v1.2 에 LOD2 이상은 없다**(지역 파일이 마스터의 잘라내기라 픽셀 밀도 5.689 px/° 가 전부 같다).
- **이음새(§7)**: 지역을 사각형째 깔지 않는다 — 실측 이웃차가 기준의 3.4배로 네모가 드러난다. 반대로 마스크만 쓰면 3.27% 가 빈다. **오버뷰 바탕 + 마스크 합성**만 허용한다(구멍 0, 네모 선 없음, 실측 최대 2.03배).
- **그리는 차례**: 바다 → 극지 → 대륙(`paintOrder`). 겹치는 1.33% 에서 해안이 바다에 먹히지 않게 한다.
- **종이 마무리(§3, 필수)**: 팩 그림은 ETOPO 계열 **사실적 지형·수심도**다. 그대로 지구에 올리면 "지나치게 사실적인 위성사진 스타일 금지" 를 어긴다. 그래서 `paperize` 가 바다 3층 · 땅은 위도 팔레트(`landToneAt`, §4-C 와 같은 색) × 밝기 4층 · 얼음 1층으로 갈아 끼우고, 땅이 바다에 닿는 줄에만 크림색 단면을 긋는다. 나라 경계에는 긋지 않는다. 4×4 정렬 디더로 층 경계의 한 줄 단차를 흩는다. **끄는 손잡이는 비교용 `?paper=0` 뿐이고, 기본은 항상 켜짐.**
- **합성 원본 분리**: 아틀라스는 `rawCanvas` 에 합성하고, 화면에 물리는 텍스처에만 종이 마무리를 입힌다. 같은 캔버스에 겹쳐 입히면 지역이 하나 올라올 때마다 색이 눌려 검어진다.
- **다시 칠하는 범위**: 새로 올린 지역들의 네모 합집합(사방 1px)만 다시 칠한다. 전체 2백만 픽셀을 매번 도는 것과 실측 190ms → 27~103ms 차이다.
- **메모리(§10)**: 그린 지역의 원본 그림은 즉시 `unload`. 상주 자산 0바이트가 정상이다. GPU 텍스처는 데스크톱 21.3MB · 모바일 5.3MB 로 **줌·이동에 따라 늘지 않는다**.
- **캔버스 크기가 바뀌면 `map.dispose()`**: three 는 크기가 같다고 보고 `texSubImage2D` 로 부분 갱신을 시도해 `GL_INVALID_VALUE` 를 내고 **옛 그림이 화면에 그대로 남는다**. 이 한 줄이 없어서 자산·재질 승급이 통째로 무효였다(2026-09-13 실측).
- **첫 화면에 받지 않는다**: manifest 도 지역 파일도 승급 함수 안에서만 받는다. 지역 경로를 코드에 박지 않는다 — manifest 가 정한다.
- 위치: `assets/earth/`(content/ 밖 독립 콘텐츠). 레지스트리 kind `earth-region` · root `project` · load `lod-stream`. mask·height·normal 은 **자료 맵**이라 PNG 를 유지한다(§5-3 의 "레거시 PNG 금지" 예외, 손실 압축 금지).
- 알려진 결함은 `assets/earth/earth_assets_manifest.json` 의 `defects` 20건에 적혀 있다: `shape.svg` 16장 전부 빈 path(벡터 우선 §6 불가), 마스크 구멍 3.27%, 확대용 고해상 없음.

근거·검증: `docs/WONDER_EARTH_ASSETS_V12_REPORT_2026-09-13.md`.

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

## 4-B. 배경(Background Pack) 규칙 (2026-09-13 밤, PD BACKGROUND PACK INSERTION)

- 배경은 `assets/background/`(content/ 밖 독립 콘텐츠, 레지스트리 kind `environment-background`, root `project`). manifest = 실제 파일(bytes·sha256) 이어야 빌드가 된다.
- 24장 initial preload 금지. 지역 진입 때 선택기(`packages/wonder-environment/src/background-select.mjs`)가 **한 장**만 고른다: 환경 지정 > 한국 4곳 좌표 > 지역 배정 > 시각. REJECT(`blocked-by-review`) 는 절대 고르지 않는다.
- 배경은 `.env-bg` 레이어에 한 장, 캐릭터는 `.env-stage`, 모션은 `.env-motion` — 서로 다른 레이어. 그림 파일 안에 캐릭터·UI·글자를 굽지 않는다. 모션 예산 MAIN 1 + SECONDARY ≤ 2.
- 여백이 있는 후보(REVIEW)는 `safeCropPx` 를 뺀 안전 상자로 화면을 덮는다(`coverLayout`, 원본 무수정). production 승인은 PD 결정(`assets/background_quality_report.json`).
- 종료 시 unpin → LRU 30MB. 캐시는 `?v=sha12` 불변. 교체는 id·path 유지, version·sha 만 갱신.

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
| Tested | `node --test "tests/*.test.mjs"` 전부 PASS (현재 94) |
| Browser Verified | 인앱 브라우저 데스크톱 + 375×812. 콘솔 오류 0, 네트워크 200, 실제 입력(클릭/합성 포인터) |
| Device Verified | 실기기(아이폰·안드로이드) 사람 확인 또는 원격 실기기. **자동화로 대체 불가** |

"완료" = Browser Verified 통과. Device 미확인은 항상 NOT DONE 에 적는다.

## 8. 지금 하지 않는 것

AI 대화·결제·SNS·대규모 콘텐츠 추가·PWA 설치·오프라인. PHASE 1 은 Paper Earth 8항목만.

## 9. Master Directive §31 과의 정렬 (2026-09-13 편입 뒤 추가)

지시서 §31 은 루트 `wonder 3/` 직하 `apps/ packages/ content/ tests/ docs/ scripts/` 와 패키지 11종(`globe-engine world-lod wonder-environment wonder-discovery character-engine story-engine asset-runtime asset-registry ai-gateway child-safety shared`)을 **권장**하고 "architecture boundary 는 유지"라고 적었다.
이 문서 §2 의 의존 방향·경계 규칙은 그대로 유효하다. 이름·경로 정렬(R1~R3)은 `MASTER_DIRECTIVE_RECONCILIATION.md` 의 PD 결정 뒤 한 번에 한다. 그 전까지 §3 의 현재 이름을 쓴다.
