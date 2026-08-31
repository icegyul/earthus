# G3 Ocean Surface Evidence

검증 대상: preserved dirty working tree의 G3 독립 해양 표면

```text
AUTOMATED G3 CONTRACT: PASS
PINNED PHYSICAL SURFACE ASSETS: PASS
UI-OFF OCEAN ON/OFF DIFFERENTIAL: PASS
TRENCH OCEAN VISIBILITY REGRESSION: PASS
UNDERWATER OCEAN VISIBILITY REGRESSION: PASS
G2 DEFAULT / IMAGERY OWNER / MOUNTAIN SEQUENCE REGRESSION: PASS
G3 REAL OCEAN: LOCAL_PASS
```

배포·origin push·main merge는 수행하지 않았다. 이 판정은 G3 Ocean Gate에만 적용하며 G4 Atmosphere, G5 Cloud, G6 Region Streaming을 대신하지 않는다.

## 이전 실패와 교정

| state | evidence | result |
|---|---|---|
| `Globe.material=Water` | G2 terrain material과 sampler 예산을 공유 | `FAIL`; fragment texture units 16 초과 |
| 별도 1.5m primitive + polygon offset | 표면에 1° 격자 경계 노출 | `FAIL`; 렌더 아티팩트 |
| depth test OFF | 가까운 표면은 부드럽지만 지구 뒷면 바다가 육지를 덮음 | `FAIL`; far-side leakage |
| 최종 G3 | 별도 depth-tested primitive, 0m truth, Global-only 50m presentation epsilon | local acceptance PASS |

## OceanSurfacePass

- Terrain3D/Globe와 분리된 단일 `Primitive`다.
- scientific truth height: `0m`
- presentation-only render offset: `50m`
- depth policy: `DEPTH_TESTED_GLOBAL_PRESENTATION_EPSILON`
- Global/Continent에 해당하는 `EARTH` + 카메라 고도 2,500km 이상에서만 visible
- Korea/Local/Trench/Underwater에서는 hidden
- depth test: ON, depth write: OFF, back-face culling: ON
- animation: `false`
- synthetic: `false`
- `requestRenderMode`: `true`
- `Globe.material=Water`를 사용하지 않는다. G2 `EarthusTerrainRelief`의 소유권을 보존한다.

## Provenance-locked assets

| asset | source | license | SHA-256 | meaning |
|---|---|---|---|---|
| `ocean-specular-mask.png` | Natural Earth admin 0 countries | Public domain | `05fefcbf59e5018ae580db9f0dbc874153d10025a6ea05b35a2251af4f1f56f1` | 흰색=해양 반사 응답, 검정=육지 |
| `water-normal.jpg` | CesiumJS 1.143 `waterNormalsSmall.jpg` | Apache-2.0 | `b9f9500dc8092a6f007b251db3827c7f4e7741ff5098d060c8abf45f4e0cd4aa` | 렌더링 전용 정적 법선 교란; 관측 파랑 데이터가 아님 |

브라우저 로드 시 두 파일을 다시 SHA-256 검증하고 불일치하면 G3를 활성화하지 않는다. 자산 검증은 2048×1024 mask의 한국·히말라야 육지와 태평양 해양 표본, 512×512 RGB normal까지 확인했다.

## Runtime evidence

- Viewer/canvas: `1/1`
- terrain truth: `ESRI_TERRAIN3D`
- globe material owner: `EarthusTerrainRelief`
- ocean material: `EarthusOceanSurface`
- primitive count: `4`
- mask bytes: `20,056`
- normal bytes: `66,386`
- observed warm load: `12ms`
- truth height: `0m`
- presentation offset: `50m`
- minimum visible camera height: `2,500,000m`
- mode/visibility at capture: `EARTH / true`
- requestRenderMode: `true`
- idle frames / 1s: `0`
- console / uncaught errors: `0`
- same-frame ocean ON SHA-256: `d0bf852ae63a714afa1578d59aed2bcdca2589bb9449f01cb4957643c5ce50da`
- same-frame ocean OFF SHA-256: `76b8bac474fdf421ab435b66e3586fbca331363750c1b64fe5ac5127b8bd59f4`

UI를 끈 동일한 지구 프레임의 ON/OFF 이미지를 직접 점검했다. ON 프레임은 해양에만 저강도 Fresnel·정적 normal 응답이 생기며, 육지 덮임·지구 뒷면 누출·1° 해양 격자 아티팩트는 관찰되지 않았다.

## G3 acceptance matrix

| gate | status | evidence |
|---|---|---|
| 독립 0m 해양 표면 | `PASS` | terrain height와 분리된 primitive, truth `0m` |
| land/ocean separation | `PASS` | provenance-pinned Natural Earth land mask |
| 카메라 각도 반응 | `PASS` | bounded Fresnel alpha `0.10–0.35`, specular `0.08–0.50` |
| 무한 애니메이션 금지 | `PASS` | static normal, animation false, idle frames 0 |
| local/deep mode 비간섭 | `PASS` | Trench/Underwater runtime `visible=false` |
| G2 terrain ownership 보존 | `PASS` | globe material remains `EarthusTerrainRelief` |
| single viewer/canvas | `PASS` | runtime `1/1` |
| source/license/hash | `PASS` | manifest + browser SHA verification + asset unit test |

## Regression

- 29 Node contract tests: PASS
- physical surface asset Python unittest: PASS
- default G2 browser contract after G3: PASS
- canonical imagery owner: Viewer 1, canvas 1, ArcGIS imagery owner 1
- Global→Asia→Korea→Seorak→Sokcho: PASS
- sampled Mariana Trench mesh: PASS, ocean hidden
- sub-kilometer Underwater detail: PASS, ocean hidden
- syntax and `git diff --check`: PASS

## Screenshots

- `G3_OCEAN_SURFACE_ON.png` — SHA-256 `d0bf852ae63a714afa1578d59aed2bcdca2589bb9449f01cb4957643c5ce50da`
- `G3_OCEAN_SURFACE_OFF.png` — SHA-256 `76b8bac474fdf421ab435b66e3586fbca331363750c1b64fe5ac5127b8bd59f4`

## Final

```text
R0 RECONCILIATION: PASS
G2 GLOBAL REAL 3D: LOCAL_PASS
G3 REAL OCEAN: LOCAL_PASS
G4 ATMOSPHERE/LIGHT: NOT STARTED
READY FOR PRODUCTION: NO
```
