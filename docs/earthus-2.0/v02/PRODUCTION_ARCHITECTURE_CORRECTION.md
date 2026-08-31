# Production Architecture Correction v0.2

## Executive decision

EARTHUS 2.0 is not a greenfield rewrite. It is a controlled extension of the verified Earthus 1.0 globe, data plane and control plane. This package creates an adapter-first runtime, then adds only the missing computation, trust, country-focus, weather/cloud, paid-intelligence and archive layers.

## Corrected architecture

```text
Verified EARTHUS 1.0
  Cesium Globe + power/quality + v8 truth/time/source contracts
  AWS Lambda/EventBridge -> S3 objects -> CloudFront
  Supabase auth/plans/orders/watch/push/analytics
                   |
                   v
EARTHUS 2.0 Adapter & Contract Layer
  Canonical Signal + Provider Registry + Evidence/Truth Budget
  Engine Runtime SDK + Resource Governor + Scene Orchestrator
  Geospatial Reference + Country Focus + Terrain Broker/LOD
                   |
        +----------+-----------+----------------+
        |                      |                |
        v                      v                v
  Human Flow              Weather/Cloud      Visual Engines
  Density/Trend           Fusion/Claims      Tower/Relief/Field
  Forecast/GT             Satellite Broker   Flow/Network/Volume
  Domain Policy           0-10d Cloud        Pulse/Track/Beacon
        |                      |                |
        +----------------------+----------------+
                               v
                    Earth Intelligence Panel
          NOW / WHY / NEXT / FOR ME / COMPARE / SCENARIO / EVIDENCE
                               |
                 Entitlement + Rights + Quota + Usage
                               |
                    S3 HOT + NAS COLD Archive
```

## Priority correction

The earlier foundation had too many P0 items. v0.2 fixes the **true foundation P0** to 16 contracts:

| ID | Foundation contract |
|---|---|
| FND-001 | Cesium Globe Core Adapter |
| FND-002 | Thermal and Render Quality Adapter |
| FND-003 | Truth and Evidence Contract Adapter |
| FND-004 | Unified Time Adapter |
| FND-005 | Provider and Source Registry |
| FND-006 | Canonical Signal Contract |
| FND-007 | Engine Runtime SDK |
| FND-008 | Resource Ownership Governor |
| FND-009 | Scene Orchestrator |
| FND-010 | Truth Budget Engine |
| FND-011 | Visual Manifest and Semantic Linter |
| FND-012 | Canonical Signal Lake Index |
| FND-013 | Geospatial Reference Engine |
| FND-014 | Country Focus Geometry and Dimming |
| FND-015 | Terrain Source and LOD Broker |
| FND-016 | Paid Intelligence Delivery Shell |


Other P0 product entries may be delivered after the foundation but do not redefine the foundation boundary.

## Forecast/calibration correction

Incorrect linear dependency:

```text
Calibration -> Forecast
```

Correct closed loop:

```text
Baseline Forecast v0
 -> SHADOW execution
 -> target time arrives
 -> Ground Truth attachment
 -> error metrics by horizon/region/domain
 -> Calibration v1
 -> Champion/Challenger review
 -> CANARY
 -> ACTIVE or ROLLBACK
```

## Algorithm/renderer separation

Example:

```text
Density Algorithm
  population + validated area + historical baseline + official crowd level
  -> density/crowd index/trend/confidence

DATA TOWER Renderer
  crowd value + evidence kind + spatial resolution + LOD budget
  -> height/width/color/opacity/instances
```

A renderer may not infer a missing algorithmic input. Aggregate population may become an aggregate cluster; it may not become an actual fine grid.

## Terrain and Country Focus correction

Country selection is a scene operation, not a country-specific database duplication. It uses:

- antimeridian-safe geometry and MultiPolygon handling;
- country bounds and camera fit;
- context dimming and clipping;
- terrain source selection by region/zoom/rights/health;
- screen-space-error LOD and device tile budgets;
- bounded terrain/data morphing with original values preserved.

## Weather and cloud correction

- Satellite selection is product/tile/time/day-night aware.
- Current cloud observation, 0-6h nowcast, 6h-7d forecast and 7-10d probabilistic outlook are distinct.
- Cloud State stores retrieved state and uncertainty, not full rendered voxels.
- Procedural detail is deterministic and visual-only; it may not change cloud coverage.
- Cloud and precipitation are different engines.
- Precipitation, runoff, river routing and flood scenarios are different stages.

## Fail-soft scene correction

When data, vector fields, spatial grids or device capability are insufficient, EARTHUS degrades honestly:

- no vector -> scalar FIELD or unavailable, never invented arrows;
- no actual crowd grid -> aggregate cluster, never actual cell towers;
- low thermal state -> shell/static profile;
- unavailable domain data -> official safety-only where applicable;
- no rights -> block the operation, not fabricate or relabel the output.

## Storage correction

The Canonical Signal Lake remains object-storage-first. The package adds indices, revision manifests, watermarks and backfill windows without pretending Supabase is the provider observation database.

NAS is cold storage only:

```text
S3 HOT -> package -> NAS outbound pull -> checksum/count/size/snapshot/grace
       -> DELETE_ELIGIBLE -> S3 cleanup

Historical request -> NAS -> temporary S3 -> CloudFront -> expiry
```

No direct NAS serving is permitted.

## Production acceptance boundary

`IMPLEMENTED_FOUNDATION` means pure executable contracts and tests exist. Production acceptance additionally requires:

- verified provider contract and current data;
- integration into the canonical local repository;
- browser/Cesium acceptance;
- actual iPhone and low-end Android thermal tests;
- rights and paid-use checks;
- AWS/Supabase/NAS integration evidence;
- `/v2` isolated deployment and rollback proof.
