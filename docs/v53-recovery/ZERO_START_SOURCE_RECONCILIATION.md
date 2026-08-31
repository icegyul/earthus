# Zero-Start Source Reconciliation

## 원칙

- Current repository가 제품 본체다.
- Zero-Start는 Greenfield/DR source foundation이다.
- 파일 존재는 runtime/production 증거가 아니다.
- direct path가 없다고 current capability가 없는 것으로 판정하지 않는다.
- 기존 owner/Engine ID/Algorithm ID를 유지한다.

## Direct path 전수 대조

`09_ALL_SOURCE_FOUNDATION/reconstructed_source` 487개를 current repository의 동일 상대경로와 byte 비교했다.

| status | count | evidence |
|---|---:|---|
| `SAME` | 2 | `prototype/js/earthus2/v04/core/device-network-governor.js`, `planet-intelligence-orchestrator.js` |
| `DIFFERENT` | 1 | `prototype/v2/index.html` |
| `MISSING` direct path | 484 | current repo에 같은 경로 없음 |

`MISSING` 484는 일괄 PORT 대상이 아니다. 현재 제품은 `prototype/v2/js/*`, `aws/materialized-earth/*`, 기존 `prototype/js/v8/*`, AWS/Supabase owner로 별도 발전했기 때문이다.

## Capability reconciliation

| source path | zero-start pack | current repo equivalent | status | existing owner | engine ID | algorithm ID | runtime status | v5.3 relevance | action | reason |
|---|---|---|---|---|---|---|---|---|---|---|
| `greenfield/physical-3d-policy.js` | 01/05/08 | 없음; 현재 `real-living-earth.js` 정책으로 분산 | `MISSING` | FND-017 + canonical renderer | FND-017, FND-015, CLD-009 | ALG-CORE-006, ALG-GEO-003, ALG-CLD-007 | spec helper only | 전체 fallback gate | `PORT` | 작은 fail-closed guard로만 이식; 새 authority 금지 |
| `greenfield/scope-resolver.js` | 01/05/08 | `progressive-planet-intelligence.js` + visual controller scope | `SUPERSEDED` | FND-017 | FND-017, FND-015 | ALG-CORE-006 | `RUNTIME_WIRED` | G6 | `REWORK` | skeleton threshold를 복사하지 말고 기존 scope owner에 흡수 |
| `greenfield/scene-evidence-snapshot.js` | 01/05/08 | intelligence snapshot/evidence runtime | `MISSING` direct, capability partial | FND-017 | FND-017 | ALG-CORE-006 | partial | I1 | `PORT` | 현재 camera/scope/resource fields와 schema를 맞춘 뒤 이식 |
| `greenfield/simulation-branch-runtime.js` | 01/05/08 | Earth Version/Diff foundation | `MISSING` direct | existing scenario/Earth Version owners | PAY-007, BCK lineage | catalog-owned | foundation only | S1 | `PORT` | immutable branch 계약만 재사용; domain solver 없으면 unavailable |
| `v04/core/planet-intelligence-orchestrator.js` | 01/05/06/08/09 | 동일 파일 + `prototype/v2/js/v52/planet-intelligence-orchestrator.js` | `SAME` source, current adapter duplicate | FND-017 | FND-017 | ALG-CORE-006 | `RUNTIME_WIRED` | P0/G6/I1/I2 | `KEEP_CURRENT` | 두 번째 orchestrator 금지; 후속에는 current owner만 사용 |
| `v04/core/device-network-governor.js` | 01/05/06/08/09 | 동일 파일 + v52 copy | `SAME` source, policy conflict | FND-018 | FND-018 | catalog-owned | `RUNTIME_WIRED` | device fallback | `REWORK` | `THREE_SHELL/STATIC_SHELL`을 3D-only ladder로 교정 |
| `v02/geo/terrain-source-broker.js` | 01/02/05/08/09 | `real-living-earth.js::installTerrain` | `SUPERSEDED` | canonical real Earth renderer | FND-015 | ALG-GEO-003 | `REAL_DATA_WIRED` | G2 | `KEEP_CURRENT` | current Esri Terrain3D/TopoBathy3D가 최신 product path |
| `v02/geo/terrain-lod.js` | 01/02/05/08/09 | FND-017 render policy + Cesium globe SSE | `UNSAFE` | FND-017/FND-015 | FND-015 | catalog-owned | historical foundation | G2/G6 | `DO_NOT_USE` | `verticalExaggeration` helper가 corrected P2와 충돌 |
| `recovered_render/earthus-terrain-engine-adapter.js` | 08/09 | current `installTerrain` | `UNSAFE` incomplete | FND-015 | FND-015 | ALG-GEO-003 | imports missing | G2 | `REFERENCE_ONLY` | missing `cesium-terrain-runtime.js`; direct runtime 사용 불가 |
| `recovered_render/earthus-planet-render-runtime-v03.js` | 08/09 | `real-living-earth.js` + visual controller | `LEGACY` | FND-017 | FND-017 | ALG-CORE-006 | imports missing | G2-G6 | `DO_NOT_USE` | default ELLIPSOID와 EARTH cloud SHELL이 corrected canonical 위반 |
| `recovered_render/earthus-ocean-engine-adapter.js` | 08/09 | current trench/underwater + v8 ocean owner | `MISSING` dependency graph | OCN/GEO owner | OCN-001~, GEO-002/003/004 | ALG-OCN-* | foundation reference | G3/P4 | `REFERENCE_ONLY` | 다수 import 부재; current TopoBathy/trench 보존 |
| `recovered_render/cesium-voxel-cloud-runtime.js` | 08/09 | `prototype/v2/js/gfs-cloud-volume.js` | `SUPERSEDED` | CLD-009 | CLD-009 | ALG-CLD-007 | `REAL_DATA_WIRED` | G5 | `KEEP_CURRENT` | current VoxelPrimitive path가 실제 GFS manifest와 연결됨 |
| `recovered_render/earthus-cloud-engine-adapter-v02.js` | 08/09 | GFS Voxel + GK2A CTH runtime | `LEGACY` | CLD-009 | CLD-009 | ALG-CLD-007 | imports missing | G5 | `DO_NOT_USE` | shell을 final fallback graph에 포함 |
| `v02/cloud/cloud-render-policy.js` | 01/02/05/06/09 | current cloud fidelity runtime | `UNSAFE` | CLD-009 | CLD-009 | ALG-CLD-007 | historical foundation | G5 | `REWORK` | `THREE_SHELL/STATIC_SHELL` 제거 필요 |
| `llm/scene-intent-contract.js` | 06 | current direct equivalent 없음 | `MISSING` | FND-017 approved-tool path | FND-017 | catalog-owned | foundation only | I2 | `PORT` | Cesium direct mutation 금지 contract로 이식 |
| `llm/intelligence-packet-contract.js` | 06 | current evidence/intelligence runtime partial | `MISSING` direct | existing Intelligence owner | INT-* | catalog-owned | foundation only | I1/I2 | `PORT` | current Event/Evidence schema와 reconcile 후 이식 |
| frontend-v10 runtime | 08/09 | current `/prototype/v2` app/runtime | `SUPERSEDED` | current V2 UI | existing owners | existing catalog | current UI operating locally | all | `KEEP_CURRENT` | framework/second shell migration 금지 |
| `prototype/v2/index.html` | 08/09 | current same path | `DIFFERENT` | current V2 app | UI owner | n/a | current browser boot | all | `KEEP_CURRENT` | Zero-Start reconstructed entry로 최신 UI를 덮지 않음 |
| backend/data-plane reconstructed modules | 03/07/09 | current AWS + `aws/materialized-earth` + Supabase | `MISSING` direct / capability newer | existing backend owners | BCK/STO/OPS/PAY | catalog-owned | mixed foundation/runtime | I/S | `REFERENCE_ONLY` | source별 재검증 없이 bulk port 금지 |
| Engine catalog 255 | 01/09 | current docs catalog/history | `REFERENCE` | catalog | 255 IDs | n/a | source catalog | all | `REFERENCE_ONLY` | ID/owner lookup 정본; runtime 완료 증거 아님 |
| Algorithm catalog 198 | 02/09 | current docs catalog/history | `REFERENCE` | catalog | n/a | 198 IDs | source catalog | all | `REFERENCE_ONLY` | algorithm 변경 전 owner/version lookup |

## Current v5.2 reusable runtime

| capability | current evidence | status |
|---|---|---|
| canonical Cesium Viewer singleton | `prototype/js/viewer.js`; `new Cesium.Viewer` owner 1개 | `RUNTIME_WIRED` |
| Esri Terrain3D | `real-living-earth.js::installTerrain` | `REAL_DATA_WIRED`, G2 visual FAIL |
| Esri TopoBathy3D | same owner | `REAL_DATA_WIRED` |
| Mariana sampled mesh | `trench-bathymetry-mesh.js` | code + tests present; current turn device not rerun |
| Underwater foundation | current mode/translucency/detail mesh | code present; device evidence `UNKNOWN` |
| GK2A CTH | `gk2a-cth-relief.js` | `REAL_DATA_WIRED`; local simple server artifact 404, not reverified |
| GFS VoxelPrimitive | `gfs-cloud-volume.js` | `REAL_DATA_WIRED`; current artifact not reverified |
| NOAA IMS snow/ice | `current-earth-seasonal.js` + local current-earth artifact | foundation/current cache path present |
| Materialized Earth | `aws/materialized-earth/*` + browser reader | fresh pure test PASS |
| Earth Version / Diff | `earth-version-diff.mjs` | fresh pure test PASS |
| SingleFlight | `singleflight.mjs` | fresh 100-request test PASS |
| dependency invalidation | `dependency-invalidation.mjs` | fresh pure test PASS |
| Compute Policy | `prototype/v2/js/v52/compute-policy-registry.js` | fresh pure test PASS |
| Cost Ledger | `compute-cost-ledger.mjs` | fresh unknown-rate test PASS |
| Capacity planning | `capacity-planner.mjs` | fresh measured-bottleneck test PASS |
| Intelligence runtime | `progressive-planet-intelligence.js` + FND-017 | `RUNTIME_WIRED` |
| AWS backends | 79 top-level directories | source exists; live account not reverified |
| Supabase | 41 source/migration/function files | source exists; production migration not authorized |
| V2 UI | current `/prototype/v2` | clean HEAD local browser boots; visual G2 FAIL |
| CI | 7 real-living-earth workflows | definitions exist; current dirty SHA CI not run |

Fresh `node --test tools/earthus-v52/*.test.mjs` result: `23/23 PASS`. 이 결과에는 현재 canonical과 충돌하는 old vertical-exaggeration test 2개도 포함되므로 “모두 승인”으로 해석하지 않는다.

## Uncommitted candidate 판정

| candidate | status | action |
|---|---|---|
| `real-living-earth.js` physical default wiring | runtime crash reproduced | `REWORK` |
| `physical-earth-presentation.js` | active 12× vertical exaggeration + Water globe material | `DO_NOT_USE_AS_IS` |
| physical surface assets/build/test | sources/licenses traceable, but G3 scope | `KEEP_UNTRACKED`, defer to G3 redesign |
| GFS layered cloud fallback/test | real GFS bytes, but rectangle shells and G5 scope | `REWORK_G5`, do not include in G2 commit |
| default physical browser test | asserts 12× + Water, now canonical conflict | `REWORK` |

## R0 reconciliation status

`R0 SOURCE RECONCILIATION: PASS`

G2에 필요한 Zero-Start 요소는 코드를 복사하는 것이 아니라 corrected physical policy와 owner/ID gate다. 실제 G2 구현은 current Terrain3D owner를 보존해 진행한다.
