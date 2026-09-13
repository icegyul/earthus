# WONDER EARTH — ASSETS v1.2 실제 적용 보고서

- 날짜: 2026-09-13
- 지시서: PD 「WONDER EARTH — ASSETS v1.2 실제 적용 작업 지시서」 (§1~§15)
- 대상: `wonder 3/earthus-v3-wonder` (NEW BUILD). 기존 V3/v3-paper/v3-kids/V1/V2/AETHERUS/DAMC 는 **한 줄도 건드리지 않았다.**
- 원본 팩: `wonder 3/assets 1.2/WONDER_EARTH_ASSETS_v1_2.zip`
  sha256 `ae3bc7627e041996324c1db1a5b4b5a59aa8182fef3e9cafee6c7a4f581ff483` · 100개 항목 · 읽기 전용 검사 후 바이트 동일 복사

---

## STATUS

| 게이트 | 결과 |
|---|---|
| Implemented | **DONE** — 편입·레지스트리·LOD 런타임·종이 마무리·UI 연결 |
| Tested | **DONE** — `node --test "tests/*.test.mjs"` **94 PASS / 0 FAIL** (지구 자산 전용 17건 신규) |
| Browser Verified | **DONE** — 인앱 브라우저 1440×900 · 390×844 · 375×812, 12개 시점 × 줌 3단, 콘솔 오류 0 |
| Device Verified | **NOT DONE** — 실기기 확인은 PD 몫(자동화로 대체 불가) |

**"완료" 로 부르는 범위**: 데스크톱·모바일 브라우저 검증까지. 실기기는 아직이다.

---

## ASSET LOAD

| 항목 | 값 |
|---|---|
| 편입 파일 | **81** (16지역 × 5 + 오버뷰 1) + manifest 1 |
| 레지스트리 등록 | 81 (kind `earth-region`, root `project`, load `lod-stream`, id·path 중복 0) |
| 첫 화면에 받는 지구 자산 | **0바이트** — manifest 도 지역도 승급 함수 안에서만 받는다 |
| LOD0 | `shared/overview_1k.avif` 1024×512 · 179KB · 굽기 0~1ms |
| LOD1 동시 상주 | 데스크톱 6곳 · 모바일 4곳. 나머지는 `forget` (12개 시점 순회에서 누적 52곳 정리) |
| 한 시점 전환 비용 | 2~6곳 새로 받기 **74~453ms** (파일 6~18장) |
| 상주 자산 메모리 | **0.00MB** — 그린 즉시 원본 그림을 놓아 준다 |
| 첫 그림 | 데스크톱 291ms · 모바일 335~343ms |

전송은 필요한 것만 받는다. 전지구를 다 보려고 16지역을 한꺼번에 받는 경로는 만들지 않았다(§11-2).

---

## LAND

6개 대륙(Africa · Asia · Europe · North_America · Oceania · South_America)을 **각각 독립 레이어**로 둔다.
`color.avif` 의 알파가 곧 그 대륙의 모양이라 사각형이 드러나지 않는다.

- 대륙 텍스처에 구름·UI·설명문·라벨을 굽지 않았다. 대륙 이름표 6개는 **three 스프라이트**(`ambient.mjs`)로 지구 밖에 있다.
- 해안선은 팩의 알파 경계를 그대로 쓰고, 그 위에 **크림색 단면 한 줄**을 긋는다. 나라 경계에는 긋지 않는다 — 정치 지도가 되면 안 된다.
- 위도 팔레트는 절차적 Paper Earth 와 **같은 색**(`landToneAt`)을 쓴다. 자산 지구와 종이 지구를 오가도 색이 튀지 않는다.

## OCEANS

8개 대양(Atlantic_North · Atlantic_South · Indian · Mediterranean · Pacific_East · Pacific_West · Regional_Seas · Southern_Ocean).

- Pacific_West · Regional_Seas · Southern_Ocean 은 경도를 한 바퀴 도는 **띠**라 경도 거리로 고르지 않고 위도 상자로 고른다. 5개 경도(−170·−90·0·90·170)에서 모두 선택됨을 시험으로 못 박았다.
- 그리는 차례는 **바다 → 극지 → 대륙**. 겹치는 1.33% 에서 해안이 바다에 먹히지 않는다.
- 팩의 수심 그라데이션은 **종이 바다 3층**으로 갈아 끼웠다(깊은 바다 / 중간 / 대륙붕). 사진 같은 연속 계조를 지구에 올리지 않는다.

## POLAR

Arctic · Antarctica 두 지역을 따로 둔다.

- 둘 다 경도 전폭 띠. 북극 위(89°N)·남극 위(80°S)에서 각각 0° 로 1등으로 뽑힌다.
- 극 근처 텍스처 늘어남: 등장방형이라 극에서 가로로 늘어나는 것은 투영의 성질이다. 노멀은 `ClampToEdgeWrapping` 으로 끝 픽셀을 고정해 **극점에서 조명이 뒤집히지 않는다**.
- 얼음은 밝고 채도 낮은 화소를 한 층(`PAPER_ICE`)으로 모은다. 그린란드·남극 빙상이 종이 한 장처럼 보인다.

---

## 2.5D

지시서 §9 "CSS box-shadow·filter 로 흉내내지 말 것" 을 지켰다. 전부 실제 재질이다.

| 요소 | 방법 |
|---|---|
| Base Color | 지역 `color.avif` 를 등장방형 캔버스에 마스크 합성 |
| Height | 지역 `height.png` 를 `multiply` 0.16 으로, **color 알파로 오려서** 얹는다(층 사이 그늘) |
| Normal | 지역 `normal.png` 를 별도 등장방형 노멀 캔버스에 같은 마스크로 합성 → `MeshStandardMaterial.normalMap`(경도 반복 / 위도 고정), 세기 0.5 |
| Layer Offset | 해안 단면(크림 한 줄) + 대륙붕 헤일로 |
| Soft Shadow | 노멀 + 방향광. **돌려도 깊이가 유지된다** — CSS 가 아니라 조명이라서 |

돌리는 동안 깊이가 살아 있는지는 12개 시점 × 3줌에서 매번 렌더해 확인했다.

---

## LOD

| 단계 | 내용 | v1.2 상태 |
|---|---|---|
| LOD0 | 전지구 저해상 1장 | **있음** (1024×512) |
| LOD1 | 보이는 대륙·대양 중해상 | **있음** (지역별 crop, 마스터 2048 밀도) |
| LOD2 | 확대용 고해상 | **없음** |
| LOD3 | 근접용 초고해상 | **없음** |

LOD2·LOD3 가 없다는 것은 추정이 아니라 실측이다: **16지역 전부 5.689 px/°** 로 마스터와 같다. 지역 파일은 마스터를 잘라낸 것이지 더 높은 해상도로 다시 그린 것이 아니다.
따라서 **줌 3단(1.62 거리)까지가 이 팩이 버티는 한계**다. 더 들어가면 화소가 커진다. 지시서 §11-5 대로 "해상도만 올려서" 해결하지 않았고, 대신 LOD2 를 **없다고 적었다**.

---

## 이음새 (§7)

같은 잣대로 세 가지 합성을 실측 비교했다(이웃 화소 차이 ÷ 텍스처 전체 평균, 1.0 이면 경계가 안 보인다는 뜻).

| 합성 방법 | 구멍 | 지역 경계 최댓값 |
|---|---|---|
| 지역을 사각형째 깔기 | 0% | **3.4배** (네모가 눈에 보인다) |
| 마스크만 쓰기 | **3.27%** (바다가 뚫린다) | — |
| **LOD0 바탕 + 마스크**(채택) | **0%** | **2.03배** |

- 12개 시점에서 실측한 경계 최댓값: **1.56 ~ 2.03배**. 15개 경계 중 2배를 넘는 것은 1개(Asia 북쪽 83.7°N — 북극 제도의 진짜 해안선이 있는 자리)다.
- 텍스처 전체에서 가장 차이가 큰 12개 열은 **전부 인도네시아·필리핀 군도**(실제 지형)였고, 지역 경계와 겹치는 것은 **0개**였다.
- 4×4 정렬 디더로 층 경계의 한 줄 단차를 흩었다: Pacific_West 북쪽 경계 **2.12배 → 1.62배**.
- ±180° 자오선은 경도 반복(`RepeatWrapping`)으로 잇고, 해안선 검사도 경도를 감아서 한다.

---

## 성능 (§14)

측정 환경: 인앱 크로미엄, `readPixels` 로 GPU 완료를 강제한 프레임 비용(1440×900 / 375×812).

| 항목 | 데스크톱 1440×900 | 모바일 375×812 |
|---|---|---|
| 프레임 비용 | 0.93~1.48ms | 0.92~1.75ms |
| 환산 상한 | 673~1078 fps | 571~1087 fps |
| 실제 프레임율 | **60.2 fps**(화면 상한) | — |
| GPU 텍스처 | **21.3MB 고정** | **5.3MB 고정** |
| 텍스처 개수 | 13 (이름표가 보일 때마다 올라가 평탄) | 12 |
| 앨비도 캔버스 | 8.0MB (2048×1024) | 2.0MB (1024×512) |
| 그리기 호출 / 삼각형 | 13 / 12,118 | 동일 |
| 종이 마무리 | 27~103ms (바뀐 네모만) | 13~25ms |
| JS 힙 | 14~53MB | — |

**줌·이동으로 GPU 메모리가 늘지 않는다**: 12개 시점 × 3줌 = 36회 전환 내내 21.3MB 고정. 텍스처 개수도 13에서 멈춘다(20회 추가 전환에서 증가 0).
드래그 중 프레임 비용 1.44ms — 굽기는 손이 지구에 닿아 있으면 미루므로 회전이 끊기지 않는다.

---

## 화풍 (§3) — **PD 판단이 필요한 항목**

**팩 그림은 2.5D 종이 오려붙인 Wonder Earth 가 아니다.** ETOPO 계열의 사실적 지형·수심도다. 그대로 올리면 §3 의 "지나치게 사실적인 위성사진 스타일 금지" 를 정면으로 어긴다.

지리는 팩 것을 그대로 쓰고 **색과 층만** 종이로 갈아 끼우는 마무리(`paperize`)를 넣어 §3 을 지켰다.

- 바다 3층 / 땅은 위도 팔레트 × 밝기 4층 / 얼음 1층 / 해안 크림 단면 / 종이 결(재질 팩 fiber) multiply 0.38
- 비교용 손잡이: `?paper=0` 이면 팩 원본 화소가 그대로 나온다.
- 두 화면을 같이 뒀다: `docs/screenshots/earth-world.webp`(종이 마무리) vs `docs/screenshots/earth-raw-pack.webp`(팩 원본).

PD 가 팩 원본 화풍을 원한다면 `?paper=0` 을 기본으로 바꾸면 되지만, 그 경우 §3 은 **어긴 채로** 간다. 판단을 요청한다.

---

## 알려진 결함 20건 (manifest `defects`)

1. **`shape.svg` 16장 전부 `d=""`** — 벡터 원본이 비어 있다. 지시서 §6 의 "선·경계는 SVG/GeoJSON 우선" 을 이 팩으로는 **할 수 없다**. 해안선은 래스터 알파로 간다.
2. **마스크 합성 구멍 3.27% · 겹침 1.33%** — LOD0 바탕이 필수인 이유.
3. **확대용 고해상 없음** — 위 LOD 표 참조.
4. `color.avif` 알파가 2단계(부드러운 가장자리 0%) — 경계가 딱 끊긴다. 종이 단면을 우리가 긋는 이유이기도 하다.
5. 알파 0 아래에도 유효한 그림이 들어 있다(검은 화소 0%) — 사각형째 깔면 이웃 지역과 이중으로 겹친다.

KTX2 는 팩에 없다. 지시서 §6 대로 "무조건 전부 변환" 하지 않고, **실측**으로 AVIF+PNG 로 충분함을 확인했다(첫 그림 291ms, GPU 21.3MB 고정).

---

## 기존 UI 보존 (§12)

렌더링·텍스처 시스템만 갈았다. 메뉴·상호작용은 그대로다.

- 회전 규칙(§4-A, V2 이식) · 줌 3단 · 핀치 · 탭 · 지역 진입 · 🌍 복귀 · 움직임 줄이기 — 모두 손대지 않았다.
- 한국(36.5N, 127.8E) 탭 → `동아시아` 진입, 표식 링이 손가락 자리에 붙는다. 확인함.
- `?earth=material`(종이 재질 팩) · `?earth=paper`(절차적) 경로도 그대로 산다. 자산 로드가 실패하면 자동으로 그 순서로 내려간다.

---

## 고친 버그 (이번 작업에서 발견)

**three.js 가 캔버스 크기 변경을 모르고 옛 텍스처에 덮어쓰고 있었다.**
`textureCanvas` 를 1024×512 → 2048×1024 로 키운 뒤 `needsUpdate` 만 세우면 three 는 `texSubImage2D` 로 부분 갱신을 시도한다. 결과는 `GL_INVALID_VALUE: glTexSubImage2D: Offset overflows texture dimensions` 경고 한 줄과, **화면에는 옛 그림이 그대로 남는 것**이었다.

- 증상이 지독했던 이유: `state.textureCanvas` 에는 새 그림이 제대로 들어 있고, 로그도 "승급 완료" 라고 말한다. 눈으로 봐도 지구는 멀쩡하다. 다만 **옛 지구**였다.
- 이 버그는 지구 자산뿐 아니라 **Paper Earth Material v1 승급도 통째로 무효로 만들고 있었다**(같은 경로). 그래서 어제 "재질 적용됨" 으로 본 화면은 사실 절차적 종이였다.
- 수정: `refreshTexture()` 가 캔버스 크기 변화를 보면 `map.dispose()` 를 먼저 부른다(`packages/globe-engine/src/earth.mjs`).

---

## 바꾼 파일

| 파일 | 내용 |
|---|---|
| `scripts/import-earth-assets.py` | ZIP 읽기 전용 검사 → 바이트 동일 복사 → 실측 manifest + 결함 20건 |
| `assets/earth/**` (81장) | 팩 사본. `earth_assets_manifest.json` 이 색인 |
| `packages/globe-engine/src/earth-assets.mjs` | 가시 지역 계산 · 아틀라스 합성 · 종이 마무리 · 네모 자르기 |
| `packages/globe-engine/src/earth.mjs` | `applyEquirectNormal` · `refreshEquirectNormal` · **크기 변경 시 `map.dispose()`** |
| `apps/web/src/earth-main.mjs` | LOD 사다리 연결 · 스트리밍 · `stylize()` · `?earth=` · `?paper=` |
| `scripts/build-registry.mjs` | kind `earth-region` 81장 + `decodedBytes` |
| `tests/earth-assets.test.mjs` | 신규 17건 |
| `tests/registry.test.mjs` | kind 허용 목록에 `earth-region`, PNG 규칙을 **자료 맵만 예외**로 좁힘 |
| `docs/ARCHITECTURE_LOCK.md` | §4-E 추가 |

---

## 하지 않은 것 (지시서·기존 결정 유지)

- AWS 변경 0 · DELETE 0 · production cutover 없음 · `app/wonder/live/` · `app/v3/` · V1 · V2 무변경
- legacy cleanup 없음 · 배경 24장 `production_approved` 그대로 0 · PHASE 2(WORLD/REGION/COUNTRY/LOCAL LOD) 미착수
- AI · Premium · Voice · 124종 full semantic rig 미착수
- `git push` 없음 (PD 결정 대기)
