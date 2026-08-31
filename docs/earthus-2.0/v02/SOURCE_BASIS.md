# Source Basis and Precedence

## Precedence

1. Current EARTHUS 2.0 product decisions in the Final Master Directive v3.2.
2. Evidence-based EARTHUS 1.0 current-system audit.
3. Planet Human Flow Intelligence Engine Final v1.2.
4. 3D Visual Data Strategy integration material.
5. Concept references, only according to their approval status.

## Source files

- `EARTHUS_2.0_FINAL_MASTER_DEVELOPMENT_DIRECTIVE_v3.2_PAID_UX_GLOBAL_3D_CLOUD_HYBRID_NAS_ARCHIVE.docx`
- `EARTHUS_1.0_CURRENT_SYSTEM_AUDIT.md`
- `EARTHUS_1.0_RUNTIME_EVIDENCE.json`
- `EARTHUS_1.0_PROVIDER_DATA_MATRIX.csv`
- `EARTHUS_1.0_ROUTE_JOB_DB_MATRIX.csv`
- `EARTHUS_1.0_2.0_REUSE_GAP_MATRIX.csv`
- `EARTHUS_Planet_Human_Flow_Intelligence_Engine_FINAL_v1.2_DEVELOPMENT_CONTRACT_COMPLETE(1).docx`
- `EARTHUS_3D_VISUAL_DATA_STRATEGY_INTEGRATION_v1.0.docx/.md`
- `EARTHUS_55_LAYER_INTEGRATION_MATRIX_REVISED_v1.0.csv`

## Audit facts preserved by this package

- EARTHUS 1.0 is a static Web/PWA with Cesium, AWS Lambda/EventBridge collection, S3/CloudFront public data objects and a Supabase control plane.
- Seoul `citydata_ppltn`, KMA and AirKorea have production paths; KTO is partial; generic Seoul `citydata` was not found in the audited checkout.
- Provider observations are primarily stored as S3 objects, not a shared relational observation database.
- The audited layer definition count was 61, not 55.
- The current Seoul tourism renderer is an aggregate radial cylinder kernel, not an actual fine spatial grid.
- Globe Core and Thermal/Quality are reuse-as-is candidates.
- Code existence, schedule connection and current runtime evidence are separate statuses. No package status may promote a component without evidence.

## Visual strategy facts preserved

- One data hero at a time.
- Country/region selection dims surrounding context and activates only needed data.
- Common visual engines are reused across menus.
- Observation, forecast, estimated distribution, Earthus analysis and simulation are visibly distinct.
- 3D is implemented with mixed LOD, shell, volume, tile, ribbon, particle and static fallback techniques.
- Official hazard/warning/evacuation information is not paywalled.
- Terrain Relief, Bathymetry/Trench, Population Sculpture, Cloud/Wind and Earthquake Depth are technical gates before mass-producing advanced layers.

## Interpretation rule

When the files conflict with the verified repository or runtime, the latest verified repository evidence wins. When no evidence exists, use `UNKNOWN`, `NOT_VERIFIED`, `BLOCKED` or `SPECIFIED_NEXT`; never silently fill the gap.
