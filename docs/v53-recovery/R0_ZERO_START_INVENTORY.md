# R0 Zero-Start Package Inventory

감사 대상:

```text
/Volumes/700gb/## APP/Earthus v2_DOC/v2.5.3/EARTHUS_V2_ZERO_START_ALL_SOURCE_PACKS_v1.0
```

압축은 현재 저장소가 아닌 `/private/tmp/earthus-v53-zero-start-audit.TllpCd`에 pack별로 분리해 풀었다.

## Root 확인

`README_FIRST.md`는 이 묶음이 최신 working tree의 byte snapshot이 아니라, 434-file add-only reconstruction + Intelligence v11 + recovered render source를 모은 Greenfield/DR foundation이라고 명시한다. 그러므로 live repository가 있으면 overwrite가 아니라 reconcile해야 한다.

## ZIP 및 checksum

| pack | bytes | SHA-256 |
|---|---:|---|
| `00_ZERO_START_MASTER` | 11,653 | `96f805fbe61e80c0e5cf331cc20c86ae876f5683dc97150ee526d3ce9b48de56` |
| `01_ENGINE_SOURCE_255_GREENFIELD` | 236,032 | `068d779bb0990d8c2255218dfdc9722035e99538096d65439a356d9a6b732a28` |
| `02_ALGORITHM_198_GREENFIELD` | 187,207 | `0d199b3d41cb4b56e816dd7d87321191c13b043aa3a900e357d0a1196fffde5f` |
| `03_BACKEND_DATA_PLANE_GREENFIELD` | 78,623 | `0352d824430fde0f7c937905337ce98e677d7b7096f471e4fb76fc2840057580` |
| `04_PROVIDER_ADAPTERS_GREENFIELD` | 19,167 | `964c9d87b753888285546b72aae677474077582c2282c0855bd04bd3b9b54d88` |
| `05_PHYSICAL_3D_PLANET_RENDER_GREENFIELD` | 98,251 | `ad02241971c98470ded4690a6be3c8b424a14fa17aa2d2ffe10ca52b8eac5b4a` |
| `06_INTELLIGENCE_LLM_GREENFIELD` | 145,958 | `23f30c0540c4c93859dd1fdb4cc9579476abc4fa028e0380a74ddaf64a56e` |
| `07_INFRA_DEPLOYMENT_GREENFIELD` | 30,467 | `08fe67ec6ee1644d544f58e0b935538569ea28496a694114e6b01be24ce7e008` |
| `08_FRONTEND_APP_GREENFIELD` | 93,651 | `d702eb5a1bfa4eb30449f5acfdf89582f87dc0e357e1fe6c0cd5a2416600e164` |
| `09_ALL_SOURCE_FOUNDATION_GREENFIELD` | 2,223,745 | `37d2d0bdf0243c5feb08631caff01f34a4bbff5a347ca992cdc605d709c0c444` |

`EARTHUS_V2_SOURCE_PACKS_SHA256.txt`는 경로를 `/mnt/data/...`로 고정해 두어 표준 `shasum -c`는 파일을 못 찾는다. manifest의 expected hash를 현재 basename과 다시 대조한 결과는 `10/10 OK`다. 경로 결함과 byte 무결성을 분리해 기록한다.

## 실제 압축 해제 파일 통계

| pack | files | JS | MJS | TS | Python | SQL | HTML | CSS | JSON | `*.test.mjs` |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 00 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 01 | 224 | 218 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 02 | 176 | 171 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 03 | 78 | 70 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| 04 | 19 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 05 | 76 | 66 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 06 | 86 | 82 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| 07 | 33 | 26 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| 08 | 72 | 64 | 0 | 0 | 0 | 0 | 1 | 2 | 1 | 0 |
| 09 | 503 | 296 | 49 | 0 | 0 | 3 | 1 | 2 | 37 | 43 |
| all ZIP entries | 1,272 | 1,008 | 49 | 0 | 0 | 7 | 2 | 4 | 39 | 43 |

pack 사이 중복을 제거하면 logical path `795`, content hash `545`개다. `09_ALL_SOURCE_FOUNDATION` 자체는 source-bearing recovery pack `503`개이며, 그중 `reconstructed_source` 487, `recovered_render_source` 6, canonical 3, catalogs 3, patches 2, README/manifest 2다.

## Catalog

- `ENGINE_CATALOG_GREENFIELD_255.csv`: header + `255` rows
- `ALGORITHM_CATALOG_GREENFIELD_198.csv`: header + `198` rows
- ID rename 없음
- `FND-013/014/015/017/018` 유지
- `GEO-004`: source completed가 아니라 `REQUIRED_P0_PHYSICAL_3D_GAP`
- `HYD-006`: validated solver가 없으면 `SCENARIO_UNAVAILABLE`

## Source status boundary

이 inventory가 증명하는 것:

- ZIP 10개 존재
- 현재 byte가 checksum expected와 일치
- 실제 executable source, SQL, HTML/CSS, 43 test source 존재
- 255/198 catalog 행 수 일치

증명하지 않는 것:

- 최신 repository와 동일
- runtime wired
- provider/rights 준비
- browser/device pass
- production ready

## R0 상태

`R0 ZERO-START INVENTORY: PASS`
