# G5 Real 3D Cloud Evidence

검증 대상: preserved dirty working tree의 G5 실제 cloud output ladder

```text
LIVE GFS EAST ASIA ARTIFACT: PASS
REAL GFS LOW/MID/HIGH LAYERED FALLBACK: LOCAL_PASS
SATELLITE SHELL REMOVAL: PASS
VOLUME → LAYERED → CTH_RELIEF → OFF: PASS
GLOBAL LOW-LOD 3D CLOUD: FAIL_NO_GLOBAL_VERTICAL_ARTIFACT
LOCAL TRUE VOXEL BROWSER: NOT_EXECUTED_DEVICE_POLICY
G5 REAL 3D CLOUD: FAIL_BLOCKED_GLOBAL_INPUT
```

배포·origin push·main merge는 수행하지 않았다. G5가 PASS가 아니므로 지시서에 따라 G6 Region Streaming으로 넘어가지 않는다.

## Source reality

2026-08-31 UTC에 공개 EARTHUS cache를 직접 조회했다.

| source | state | validAt | coverage |
|---|---|---|---|
| NOAA NCEP GFS 0.50° volume | ready, production, `synthetic:false`, `MODELLED_NWP` | `2026-08-30T18:00:00Z` | `108–155°E, 18–52°N` |
| KMA GK2A AMI L2 CTh | ready, `synthetic:false`, `OBSERVED_DERIVED_OFFICIAL_L2` | `2026-08-31T02:20:00Z` | East Asia, 215×186 |
| NOAA NESDIS GMGSI | observation input | `2026-08-31T02:00:00Z` | global 2D image |

GFS manifest SHA-256는 `acda4408097872a3b4d1a1cc5015cd7a4845fd4a6e92cda16504f064f2bc2700`, density SHA-256는 `aa694815b83d624f7edfad3965b7696af03f0e5fc0a8f05b86aaf8ecd3e00ce7`이다. density는 `95×69×32 = 209,760 bytes`이며 GFS pressure-level TCDC와 GFS HGT로 만든 model analysis다.

## Corrected production ladder

```text
VOLUME
→ LAYERED
→ CTH_RELIEF
→ OFF
```

- `SHELL`은 ladder에서 제거했다.
- NOAA GMGSI 2D observation은 cloud shadow 입력으로만 사용한다.
- GMGSI에 관측 cloud height를 부여하지 않는다.
- VOLUME이 device policy로 차단되면 같은 실제 GFS density의 zero-thickness altitude planes로 내려간다.
- GFS artifact가 stale/invalid/synthetic/byte-incomplete이면 layered path는 fail closed 한다.
- layered와 CTH도 실패하면 임의 cloud thickness를 만들지 않고 `OFF`다.

## East Asia layered runtime

save-data device policy로 true voxel을 의도적으로 차단한 browser에서 실제 공개 GFS bytes를 그대로 제공해 fallback을 실행했다.

| layer | altitude | maximum density | mean density | coverage |
|---|---:|---:|---:|---:|
| LOW | `1,399m` | 255 | 41.624 | 0.386270 |
| MID | `4,905m` | 255 | 50.645 | 0.389474 |
| HIGH | `11,916m` | 255 | 73.828 | 0.508619 |

- truth class: `MODELLED_NWP_LAYERED`
- source: `NOAA_NCEP_GFS_0P50_NOMADS`
- freshness: `CURRENT_MODEL_ANALYSIS`
- scope: `BOUNDED_REGION`
- fake thickness: `false`
- geometry: 실제 altitude axis band 평균의 zero-thickness planes
- texture presentation: 4× linear interpolation + edge feather
- interpolation은 low-resolution density를 화면에 부드럽게 보이기 위한 presentation-only 처리이며 새 cloud cell을 생성하지 않는다.
- observed shell primitive count: `0`
- one Viewer/canvas: `1/1`
- requestRenderMode: `true`
- idle frames / 1s: `0`
- load duration: `4,896ms`

첫 browser frame은 95×69 texture의 사각 경계와 과도한 alpha가 드러나 visual reject했다. 최종 frame은 alpha를 제한하고 edge feather·presentation-only interpolation을 적용해 bounds cut를 완화했다.

## Browser differential

- layered ON SHA-256: `08b8d0d18889d1e76a59f4257621c9c27ce1fc84068bd076d34abb89d7c251eb`
- layered OFF SHA-256: `01d3f2de518acc7b62b19e24c74388227cbe56c4af74ddcd31e803dbe2d73a49`
- three attached primitives: `LOW`, `MID`, `HIGH`
- observed shell primitive: `0`
- browser errors: `0`

## Why G5 is still FAIL

1. 지시서는 `GLOBAL LOW-LOD 3D`를 요구한다.
2. 현재 검증된 vertical artifact는 East Asia bounds뿐이다.
3. global GMGSI는 2D observation input이며, shell로 사용하면 명시적 금지사항을 위반한다.
4. global vertical data가 없으므로 합성 altitude/thickness로 채울 수 없다.
5. Cesium true voxel code와 live density는 존재하지만 이번 browser는 save-data/SwiftShader policy로 VOLUME을 실행하지 않았다. physical hardware GPU acceptance가 남아 있다.

따라서 East Asia regional layered path의 성공을 G5 전체 PASS나 global cloud로 확대 해석하지 않는다.

## Regression

- Node contract suite: 35/35 PASS
- G2 default physical Earth: PASS, cloud fidelity `OFF`
- sampled Mariana Trench: PASS, cloud fidelity `OFF`
- sub-kilometer Underwater: PASS, cloud fidelity `OFF`
- syntax and `git diff --check`: PASS

## Screenshots

- `G5_EAST_ASIA_LAYERED_ON.png` — SHA-256 `08b8d0d18889d1e76a59f4257621c9c27ce1fc84068bd076d34abb89d7c251eb`
- `G5_EAST_ASIA_LAYERED_OFF.png` — SHA-256 `01d3f2de518acc7b62b19e24c74388227cbe56c4af74ddcd31e803dbe2d73a49`

## Final

```text
R0 RECONCILIATION: PASS
G2 GLOBAL REAL 3D: LOCAL_PASS
G3 REAL OCEAN: LOCAL_PASS
G4 ATMOSPHERE / LIGHT: LOCAL_PASS
G5 REAL 3D CLOUD: FAIL_BLOCKED_GLOBAL_INPUT
G6 REGION STREAMING: NOT STARTED
READY FOR PRODUCTION: NO
```
