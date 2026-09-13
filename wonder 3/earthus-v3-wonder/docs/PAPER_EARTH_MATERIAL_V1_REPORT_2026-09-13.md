# PAPER EARTH MATERIAL v1 — 적용 보고 (2026-09-13 밤)

PD 지시: `wonder 3/material pack_01/EARTHUS_V3_WONDER_PAPER_EARTH_MATERIAL_v1.zip` 을 적용하고 로컬에서 볼 수 있게 할 것.
**기존 V3 수정 0 · AWS 변경 0 · 원본 ZIP 은 읽기만.**

## 이 팩이 무엇인가

배경 그림이 아니라 **지구 표면에 입히는 PBR 재질**이다. 팩 문서(`assets/material/MATERIAL_INTEGRATION.pack-v1.md`)가 직접 그렇게 적고 있다 — "시안 이미지가 아니라 Globe Renderer 에 직접 적용하는 실제 Material Pack". manifest 도 `geography_baked: false`, `labels_baked: false`, `characters_baked: false`, `ui_baked: false` 다. 즉 **지리는 이 팩이 정하지 않는다.** 지리는 그대로 Natural Earth 자료가 정하고, 이 팩은 "그 위에 어떤 종이를 붙이는가"만 준다. 그래서 지역 배경(`assets/background/`)이 아니라 지구 재질(`assets/material/`)로 편입했다.

| | 값 |
|---|---|
| ZIP | 6,213,282 B · sha256 `a96fecd146a9ff3bd2116e35ddf1e13fd17d64b3d2370b0eb0a7ed95580ba878` · testzip OK |
| 텍스처 | 10장, 전부 2048×2048 WebP, 합계 5,927 KB |
| 편입 위치 | `assets/material/paper-earth/*.webp` (바이트 그대로, 10/10 sha 일치) |
| manifest | `assets/material/paper_earth_material_manifest.json` (실측·쓰임·이음새 판정) + 팩 원본 사본 |
| 재생성 | `python scripts/import-material-pack.py` |

## 10장을 어디에 썼는가

| 텍스처 | 층 | 쓰임 | v1 |
|---|---|---|---|
| `paper_ocean_albedo` | 1 | 바다 바탕 종이 | 사용 |
| `paper_land_albedo` | 2 | 땅 기본 종이(초원·스텝) | 사용 |
| `paper_forest_albedo` | 2 | 숲·정글 띠 (0~13° · 41~63°) | 사용 |
| `paper_desert_albedo` | 2 | 사막 띠 (19~33°) | 사용 |
| `paper_ice_albedo` | 2 | 극지 (66°+) 와 바다 만년빙 | 사용 |
| `paper_fiber` | 3 | 전체 종이 섬유 한 겹 (multiply 0.45) | 사용 |
| `paper_normal` | 4 | three.js `normalMap` — 거울 반복 타일 | 사용 |
| `paper_roughness` | 5 | three.js `roughnessMap` | 사용 |
| `paper_height` | 4 | **등록만** — normalMap 과 같은 결이라 겹치면 골판지처럼 보인다 | 미사용 |
| `paper_edge_softmask` | 8 | **등록만** — 카드 모양 사각 마스크라 구면 해안선에 안 맞는다(해안은 경로 합성으로 그린다) | 미사용 |

팩 문서의 shader layer 1~8 중 **6·7·8(해안 자른 단면 · 종이 두께 그림자 · 빛 받는 모서리)은 텍스처가 아니라 경로 합성**으로 그린다. 나라 경로를 그냥 stroke 하면 나라마다 선이 그어져 정치 지도가 되기 때문에, 땅을 투명 오프스크린에 그린 뒤 `source-atop`(땅 위) / `destination-over`(땅 바깥 = 해안)로 갈라 해안에만 긋는다.

## 어떻게 합치는가

```
첫 화면            절차적 종이 지구 (받을 것 0)           265~336ms
   ↓ requestIdleCallback
재질 받기          manifest + 텍스처 8장 (4.7MB)
   ↓
다시 굽기          1 바다 → 2 땅(기본 + 숲·사막·얼음 위도 띠) → 지형 장식 → 6·7·8 해안 → 극지 얼음 → 3 섬유
   ↓
three 재질         4 normalMap · 5 roughnessMap (거울 반복 타일, 지리와 무관하니 굽지 않는다)
   ↓
견본 놓아 주기      앨비도 6장 unload — 상주는 normal·roughness 둘뿐
```

- **첫 화면을 늦추지 않는다.** 재질은 첫 그림 뒤에만 받는다. 실패하면 절차적 종이 지구가 그대로 남는다(화면이 비는 경로 없음).
- **레지스트리가 유일한 색인**(ARCHITECTURE_LOCK §5): 10장 전부 kind `paper-material` · root `project` · load `on-demand` 로 등록, `?v=sha12` 불변 캐시.
- 위도 띠 배정은 `SWATCH_ZONES` 와 5° 페더. 정밀 기후 자료가 아니라 **의도된 단순화**이고, 실제 자료는 PHASE 2 LOD 의 몫이다.

## 고친 것 (이번에 밟은 함정)

1. **종이 결이 사라졌다.** 견본을 등장방형 폭의 1/4 로 줄여 깔았더니 2048² 의 결이 1픽셀 아래로 내려가 그냥 단색이 됐다. 앨비도는 폭의 1/2(경도 180°마다 한 장), 섬유는 1/1(한 바퀴에 한 장 = 원래 결 크기)로 바꿨다.
2. **색이 뿌옇게 떴다.** 섬유(평균 밝기 229의 흰 종이)를 `soft-light` 로 깔면 전체를 들어 올려 견본 색이 죽는다. `multiply` 0.45 로 바꿨다 — 어두워지는 폭은 4~5%뿐이고 결은 그대로 남는다.

## 다각 검토에서 잡은 것 (5개 관점 × 적대적 검증, 지적 40건 중 12건 확정)

적용 직후 스스로 검토를 돌렸다. 관점 다섯(합성 정확성 · 메모리/성능 · 프로젝트 규칙 · 재질 충실도 · 견고성)이 따로 읽고,
나온 지적마다 세 렌즈(정확성 · 영향 · 의도 중복)로 반박을 시도해 둘 이상이 실재라고 한 것만 남겼다. 12건 전부 고쳤다.

| | 무엇이 잘못됐나 | 어떻게 고쳤나 |
|---|---|---|
| **치명** | **숲·사막·얼음 종이가 한 장도 안 들어갔다.** `destination-in` 은 그린 사각형 *바깥*의 목적지를 전부 지운다. 기둥(4px)마다 부르니 세 번째 기둥에서 작업대가 통째로 비었다. 땅 전체가 기본 종이 한 장이었다 | 띠 알파 마스크를 따로 다 그린 뒤 **한 번만** `destination-in` 한다 |
| **치명** | `layers` 배열이 안 그린 층을 그렸다고 보고했다 — 그래서 내 첫 브라우저 검수가 이 회귀를 놓쳤다 | 층을 적기 전에 **실제로 남았는지 센다**(`coverage`). 0 이면 안 적는다 |
| **치명** | LRU 예산이 압축 파일 크기로 계산돼 실제 메모리의 1/28만 셌다(2048² WebP 68KB → 디코드 16.8MB). 예산이 사실상 꺼져 있었다 | 레지스트리에 `decodedBytes` 를 굽고 로더가 그걸로 센다. `status()` 가 `residentBytes`(예산)와 `residentFileBytes`(전송)를 나눠 보고 |
| **치명** | ARCHITECTURE_LOCK §4-C "그림 파일을 지구에 쓰지 않는다" 를 어겨 놓고 잠금 문서를 안 고쳤다 | §4-C 를 "**지리를 담은** 그림 파일" 로 좁히고, §4-D 「Paper Earth Material 규칙」을 새로 썼다 |
| **치명** | 부분 실패면 이미 받은 견본들이 세션 내내 안 풀렸다 | 굽기를 `try/finally` 로 감싸 성공·실패 무관하게 `unload` |
| 중간 | 굽기 400ms 가 메인 스레드를 잡는다 — 돌리는 중에 화면이 멈춘다 | 손이 지구를 만지고 있으면 미룬다(`camera.dragging`·`animating`) |
| 중간 | 거울 반복이 ±180° 에서 이어진 건 반복 수가 우연히 짝수여서였다 | `applyMaterial` 이 반복 수를 짝수로 강제하고 이유를 적는다 |
| 중간 | 자료 404 면 진입이 `approaching` 에서 굳고 오류가 삼켜졌다 | 진입 구간을 `try/catch` 로 감싸 `flow.abort()` + 안내 문구. 떠 있는 호출에 `.catch` 부착 |
| 낮음 | `metrics().textureBytes` 가 실제 GPU 의 1/6만 보고했다(노멀·거칠기 누락) | `albedoCanvasBytes` 로 이름을 좁히고 `gpuTextureBytes`(실측 53.3MB)를 따로 낸다 |
| 낮음 | 벤더 문서를 `docs/` 에 덮어썼고, manifest 의 `integration` 이 없는 파일을 가리켰다 | 팩 원본은 `assets/material/*.pack-v1.*` 로. `integration` 은 실제 두 지점을 가리키고, **시험이 그 파일·함수가 실재하는지 검사**한다 |
| 낮음 | 견본 타일을 굽기 한 번에 8장이나 새로 만들었다 | 같은 견본은 타일 한 장만 만들어 돌려 쓴다 |
| 낮음 | `/favicon.ico` 404 가 콘솔을 더럽혔다 | 인라인 SVG 아이콘 선언(요청 0) |

기각된 28건에는 "bandWobble 이 180° 에서 0.38° 끊긴다", "모바일도 2048² 원본을 받는다" 같은 것이 있다. 뒤엣것은 사실이지만 **남은 것**으로 옮겨 적었다.

## 검증

| | 결과 |
|---|---|
| TESTED | `node --test` **77/77** (신규 `tests/paper-material.test.mjs` 6: 편입·해시·쓰임·레지스트리·위도 배정·integration 경로 실재). `build-registry --check` 최신 |
| BROWSER (1440×900) | 재질 적용 ✅ · 텍스처 8장 4,722KB · 굽기 362ms · normalMap·roughnessMap 물림 ✅ · 첫 그림 280ms · 콘솔 **0**(새 탭 기준) |
| 픽셀 검사 | 구운 텍스처를 위도·경도로 찍어 견본 평균색과 대조: 사하라·아라비아·호주내륙 → **사막 종이**, 아마존·콩고·시베리아·캐나다·유럽 → **숲 종이**, 그린란드 → **얼음 종이**, 태평양 → **바다 종이**. 띠 덮임 forest 51.5% · desert 16.4% · ice 40.0% |
| 메모리 | 굽고 나면 자산 런타임 상주 **0**(evict 7), GPU 텍스처 53.3MB(앨비도 8 + 노멀 22.4 + 거칠기 22.4), heap 6.4MB |
| BROWSER (375×812) | 재질 적용 ✅ · 지름 350 · tile 512 · repeatX 4 · heap 10.5MB · 첫 그림 276ms · 콘솔 0 |
| 재질 뒤 조작 | 회전 −42.62° · 지역 진입 active · 🌍 지구 복귀 ✅ · 콘솔 0 |
| `?material=0` | 재질 요청 0 · normalMap 없음 · 절차적 2048×1024 유지 ✅ (비교용) |
| 메모리 | 앨비도 6장 unload 뒤 상주 2장(2.8MB), heap 8~10.5MB |
| DEVICE | **0건** — 실기기 미검증 |

화면 기록: `docs/screenshots/material-asia.webp`(아시아) · `material-africa.webp`(사하라 모래 띠가 보인다) · `material-zoom.webp`(확대 — 종이 결) · `material-375.webp`(폰).

## 로컬에서 보기

```bash
cd "D:\## APP\EARTHUS v2_APP\wonder 3\earthus-v3-wonder"
npm run dev
```

→ `http://localhost:8790/apps/web/`

폰에서도 보려면 같은 Wi‑Fi 에서 `node scripts/dev-server.mjs 8790 --lan` 을 띄우고 `http://192.168.219.115:8790/apps/web/` 를 연다(주소는 콘솔에 찍힌다).
주소 뒤: `?material=0`(재질 끄고 비교) · `?debug=1`(상태 기록) · `?nolabel`(대륙 이름표 끄기).

## 남은 것

- 모바일 half‑res: manifest 는 작은 화면에서 1024 로 줄여 쓰라고 하고 타일은 512로 깔지만, **내려받는 파일은 여전히 2048²** 이다. 반해상도 사본을 만들지 별도 결정 필요.
- `paper_height` · `paper_edge_softmask` 2장은 등록만 하고 안 쓴다(이유는 위 표).
- 배포 0 — 스테이징/`wonder-test` 는 아직 이전 빌드다(AWS 변경 금지 지시 유지). 빌드 허용 목록에는 재질 경로를 넣어 뒀다.
- 실기기 검증 0.
