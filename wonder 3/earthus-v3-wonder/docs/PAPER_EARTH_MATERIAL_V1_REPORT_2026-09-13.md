# PAPER EARTH MATERIAL v1 — 적용 보고 (2026-09-13 밤)

PD 지시: `wonder 3/material pack_01/EARTHUS_V3_WONDER_PAPER_EARTH_MATERIAL_v1.zip` 을 적용하고 로컬에서 볼 수 있게 할 것.
**기존 V3 수정 0 · AWS 변경 0 · 원본 ZIP 은 읽기만.**

## 이 팩이 무엇인가

배경 그림이 아니라 **지구 표면에 입히는 PBR 재질**이다. 팩 문서(`docs/MATERIAL_INTEGRATION.md`)가 직접 그렇게 적고 있다 — "시안 이미지가 아니라 Globe Renderer 에 직접 적용하는 실제 Material Pack". manifest 도 `geography_baked: false`, `labels_baked: false`, `characters_baked: false`, `ui_baked: false` 다. 즉 **지리는 이 팩이 정하지 않는다.** 지리는 그대로 Natural Earth 자료가 정하고, 이 팩은 "그 위에 어떤 종이를 붙이는가"만 준다. 그래서 지역 배경(`assets/background/`)이 아니라 지구 재질(`assets/material/`)로 편입했다.

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

## 검증

| | 결과 |
|---|---|
| TESTED | `node --test` **76/76** (신규 `tests/paper-material.test.mjs` 5: 편입·해시·쓰임·레지스트리·위도 배정). `build-registry --check` 최신 |
| BROWSER (1440×900) | 재질 적용 ✅ · 텍스처 8장 4,722KB · 굽기 446ms · 전체 461ms · normalMap·roughnessMap 물림 ✅ · 첫 그림 336ms · 콘솔 0 |
| BROWSER (375×812) | 재질 적용 ✅ · 지름 350 · tile 512 · repeatX 4 · heap 10.5MB · 첫 그림 276ms · 콘솔 0 |
| 재질 뒤 조작 | 회전 −42.62° · 지역 진입 active · 🌍 지구 복귀 ✅ · 콘솔 0 |
| `?material=0` | 재질 요청 0 · normalMap 없음 · 절차적 2048×1024 유지 ✅ (비교용) |
| 메모리 | 앨비도 6장 unload 뒤 상주 2장(2.8MB), heap 8~10.5MB |
| DEVICE | **0건** — 실기기 미검증 |

화면 기록: `docs/screenshots/material-asia.webp`(전체) · `material-zoom.webp`(확대 — 종이 결이 보인다) · `material-375.webp`(폰).

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
