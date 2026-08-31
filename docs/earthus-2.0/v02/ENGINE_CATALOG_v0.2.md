# EARTHUS 2.0 Engine Catalog v0.2

- Total engine/components: **124**
- Executable algorithms/catalog entries: **53**
- Priority correction: true P0 is limited to the 16 foundation contracts listed below.

## True P0 Foundation (16)

| ID | Engine | Maturity | Existing basis | v0.2 action |
|---|---|---|---|---|
| FND-001 | Cesium Globe Core Adapter | REUSE_AS_IS | prototype/js/viewer.js; Cesium 1.143 | Freeze renderer contract and expose v2 scene adapter only |
| FND-002 | Thermal and Render Quality Adapter | REUSE_AS_IS | prototype/js/power.js; render-quality.js | Reuse and bind v2 thermal profiles; rerun real-device gates |
| FND-003 | Truth and Evidence Contract Adapter | REUSE_AS_IS | prototype/js/v8/truth-contract.js | Map v8 data classes to v2 evidence kinds without semantic drift |
| FND-004 | Unified Time Adapter | REUSE_WITH_ADAPTER | prototype/js/v8/unified-time.js | Extend to LIVE/FORECAST/HISTORY/SCENARIO slices and availability manifests |
| FND-005 | Provider and Source Registry | HARDEN | v8 source-registry + handler constants | Unify endpoint, schema, rights, freshness, health, quota and provenance |
| FND-006 | Canonical Signal Contract | IMPLEMENTED_FOUNDATION | No shared provider observation model in 1.0 | Create immutable canonical signal with geometry/time/evidence/fingerprint |
| FND-007 | Engine Runtime SDK | IMPLEMENTED_FOUNDATION | v8 runtime coordinator is partial | Provide common lifecycle and adapter contract for all v2 engines |
| FND-008 | Resource Ownership Governor | IMPLEMENTED_FOUNDATION | Feature-specific abort/dispose paths exist | Centralize requests, timers, GPU disposers and one-data-hero ownership |
| FND-009 | Scene Orchestrator | IMPLEMENTED_FOUNDATION | v8 scene-state/runtime coordinator | Coordinate 6 scene modes, focus, dimming, labels and resource transitions |
| FND-010 | Truth Budget Engine | IMPLEMENTED_FOUNDATION | New v0.2 proposal derived from no-fabricated-precision rule | Cap visual fidelity from evidence, resolution, confidence, rights and thermal state |
| FND-011 | Visual Manifest and Semantic Linter | IMPLEMENTED_FOUNDATION | v8 visual-layer-registry | Generate menus from one manifest and lint visual truth semantics |
| FND-012 | Canonical Signal Lake Index | IMPLEMENTED_FOUNDATION | S3 object data plane; no shared observation DB | Add versioned keys, revision manifest, watermarks and backfill windows |
| FND-013 | Geospatial Reference Engine | IMPLEMENTED_FOUNDATION | WGS84 used per feature; no shared antimeridian engine | Normalize WGS84, dateline geometries, bounds, centroids and spatial tests |
| FND-014 | Country Focus Geometry and Dimming | IMPLEMENTED_FOUNDATION | Country reference assets and v8 scene state | Calculate focus camera, clipping and context dimming without data duplication |
| FND-015 | Terrain Source and LOD Broker | IMPLEMENTED_FOUNDATION | Existing Cesium terrain and reference builders | Select global/national/precision DEM and screen-space LOD by budget |
| FND-016 | Paid Intelligence Delivery Shell | IMPLEMENTED_FOUNDATION | Supabase plans/orders and v8 entitlement boundary | Expose NOW/WHY/NEXT/FOR ME/COMPARE/SCENARIO/EVIDENCE as allow/preview/deny |

## Cloud

| ID | Name | Priority | Maturity | Phase | Module / next action |
|---|---|---|---|---|---|
| CLD-001 | Satellite Product and Tile Broker | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | cloud/satellite-product-broker.js |
| CLD-002 | Cloud Top Retrieval | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | cloud/cloud-state.js |
| CLD-003 | Cloud Base Retrieval | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | cloud/cloud-state.js |
| CLD-004 | Multilayer Cloud Detection | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | cloud/cloud-state.js |
| CLD-005 | Canonical Cloud State | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | cloud/cloud-state.js |
| CLD-006 | 0-6h Cloud Nowcast | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | weather/nowcast.js |
| CLD-007 | 6h-10d Forecast Cloud Volume | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | cloud/cloud-forecast.js |
| CLD-008 | Cloud Confidence and Uncertainty | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | cloud/cloud-forecast.js |
| CLD-009 | Adaptive Cloud Renderer | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | cloud/cloud-render-policy.js |
| CLD-010 | Procedural Cloud Detail Synthesizer | P2 | IMPLEMENTED_FOUNDATION | Wave 3 | cloud/procedural-detail.js |

## Geo/Terrain

| ID | Name | Priority | Maturity | Phase | Module / next action |
|---|---|---|---|---|---|
| GEO-001 | Terrain/Data Morph Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | geo/terrain-data-morph.js |
| GEO-002 | Bathymetry and Trench Level 1 | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | geo/bathymetry-policy.js |
| GEO-003 | Trench Camera Level 2 | P2 | SPECIFIED_NEXT | Wave 3 | Country/ocean to trench camera transition and depth labels |
| GEO-004 | Underwater Camera Level 3 | P2 | FUTURE_VISION | Future | Limited underwater entry with fog/light/particles |

## Human Flow

| ID | Name | Priority | Maturity | Phase | Module / next action |
|---|---|---|---|---|---|
| HF-001 | Spatiotemporal Fusion | P1 | SPECIFIED_NEXT | Wave 2 | Align space, time, units, resolution and source mapping |
| HF-002 | Earthus Spatial Cell Registry | P1 | SPECIFIED_NEXT | Wave 2 | Canonical area/cell/POI mapping with geometry provenance |
| HF-003 | Density Algorithm | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/algorithms.js |
| HF-004 | Trend Algorithm | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/algorithms.js |
| HF-005 | Evidence-limited Flow Algorithm | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/algorithms.js |
| HF-006 | Baseline Crowd Forecast v0 | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/algorithms.js |
| HF-007 | Ground Truth Verification | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/forecast-lifecycle.js |
| HF-008 | Calibration Loop v1 | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/forecast-lifecycle.js |
| HF-009 | Confidence Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | core/confidence.js |
| HF-010 | Anomaly Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/algorithms.js |
| HF-011 | Capacity Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/algorithms.js |
| HF-012 | Risk Hard-Gate Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/algorithms.js |
| HF-013 | Spatial Graph Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/spatial-graph.js |
| HF-014 | Spatial Digital Twin | P2 | SPECIFIED_NEXT | Wave 4 | Bind verified facilities and status to graph |
| HF-015 | Domain Policy Registry | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | core/domain-policy.js |
| HF-016 | Best Window Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | core/domain-policy.js |
| HF-017 | Watch and Notification Decision | P1 | HARDEN | Wave 2 | Cooldown, dedupe, confidence, consent, deep link |
| HF-018 | Human Flow Scenario | P2 | SPECIFIED_NEXT | Wave 4 | Graph/rule what-if isolated from LIVE |

## Hydrology

| ID | Name | Priority | Maturity | Phase | Module / next action |
|---|---|---|---|---|---|
| HYD-001 | Hydrography Network | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | hydrology/hydrography-network.js |
| HYD-002 | River Visual Network Adapter | P1 | SPECIFIED_NEXT | Wave 4 | Bind hydrography hierarchy to DATA NETWORK |
| HYD-003 | Runoff Engine | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | hydrology/runoff-routing.js |
| HYD-004 | River Routing Engine | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | hydrology/runoff-routing.js |
| HYD-005 | Flood/Inundation Scenario | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | hydrology/runoff-routing.js |
| HYD-006 | Tsunami Bathymetric Propagation | P2 | FUTURE_VISION | Wave 4 | Numerical propagation only after bathymetry and validation |

## Operations/Governance

| ID | Name | Priority | Maturity | Phase | Module / next action |
|---|---|---|---|---|---|
| OPS-001 | Provider Health Engine | P0 | IMPLEMENTED_FOUNDATION | Wave 1 | ops/provider-health.js |
| OPS-002 | Circuit Breaker and Backoff | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/provider-health.js |
| OPS-003 | Job Dependency DAG | P1 | SPECIFIED_NEXT | Wave 3 | Declare collector/fusion/forecast/archive dependencies |
| OPS-004 | Dead Letter Recovery | P1 | SPECIFIED_NEXT | Wave 3 | DLQ/quarantine/replay for critical providers |
| OPS-005 | Freshness SLO Registry | P1 | SPECIFIED_NEXT | Wave 3 | Per dataset SLA and stale UX contract |
| OPS-006 | ModelOps Lifecycle | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/modelops.js |
| OPS-007 | Champion/Challenger Selector | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/modelops.js |
| OPS-008 | Country Data Passport Compiler | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/readiness-compiler.js |
| OPS-009 | Observation Gap Lens | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/observation-gap.js |
| OPS-010 | Cost Observability | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/cost-observability.js |
| OPS-011 | Cost-to-Value Scheduler | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/cost-observability.js |
| OPS-012 | Rollback Engine | P1 | SPECIFIED_NEXT | Wave 3 | Versioned /v2 rollback for app/data/model |
| OPS-013 | Performance and Thermal Lab | P1 | SPECIFIED_NEXT | Wave 3 | Automated 30-cycle/context-loss/30-minute playback evidence |
| OPS-014 | Regional Standards and Localization | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | core/localization.js |
| OPS-015 | Platform Delivery Capability Gate | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | core/platform-capability.js |
| OPS-016 | Source Governance and Paid Use | P1 | HARDEN | Wave 3 | Enforce source rights at display/derivative/export/API boundaries |
| OPS-017 | Fail-Soft Scene Profile Compiler | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | core/fail-soft-scene.js |
| OPS-018 | Trust Ledger Drill-down | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | core/trust-ledger.js |

## Paid/Business

| ID | Name | Priority | Maturity | Phase | Module / next action |
|---|---|---|---|---|---|
| PAY-001 | Entitlement Engine | P0 | IMPLEMENTED_FOUNDATION | Wave 1 | paid/entitlement.js |
| PAY-002 | Intelligence Panel Orchestrator | P0 | IMPLEMENTED_FOUNDATION | Wave 1 | paid/intelligence-orchestrator.js |
| PAY-003 | Usage Metering | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | paid/usage-metering.js |
| PAY-004 | Quota Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | paid/usage-metering.js |
| PAY-005 | Personal Context Engine | P1 | SPECIFIED_NEXT | Wave 4 | Resolve schedule, place, activity, route with minimal collection |
| PAY-006 | Comparison Engine | P1 | SPECIFIED_NEXT | Wave 4 | Compare location/time/model/baseline with resolution disclosure |
| PAY-007 | Scenario Engine | P2 | SPECIFIED_NEXT | Wave 4 | Isolated what-if runs with quotas and audit log |
| PAY-008 | Report and API Engine | P2 | HARDEN | Wave 4 | Evidence-linked export and API quotas |
| PAY-009 | Country Unlock Ledger | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | paid/country-unlock.js |
| PAY-010 | Commercial Rights Gate | P0 | IMPLEMENTED_FOUNDATION | Wave 1 | paid/rights-gate.js |
| PAY-011 | Subscription State Engine | P1 | SPECIFIED_NEXT | Wave 4 | Trial/grace/renewal/expiry/refund entitlement lifecycle |
| PAY-012 | Premium Cache Engine | P1 | SPECIFIED_NEXT | Wave 4 | Reuse identical WHY/NEXT/COMPARE calculations |
| PAY-013 | Offline Trip Pack | VNEXT | IMPLEMENTED_FOUNDATION | Wave 4 | paid/offline-trip-pack.js |

## Storage/Archive

| ID | Name | Priority | Maturity | Phase | Module / next action |
|---|---|---|---|---|---|
| STO-001 | Archive Packager | P1 | SPECIFIED_NEXT | Wave 3 | Create Zarr/Parquet/JSON/tar.zst day-region package |
| STO-002 | NAS Archive Agent | P1 | SPECIFIED_NEXT | Wave 3 | Outbound pull, resume, least privilege and capacity reporting |
| STO-003 | Archive State Machine | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | storage/archive-state-machine.js |
| STO-004 | Archive Verification and Deletion Gate | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | storage/archive-verification.js |
| STO-005 | Archive Catalog | P1 | SPECIFIED_NEXT | Wave 3 | Index region/time/resolution/source/path/restore state |
| STO-006 | Restore Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | storage/restore-planner.js |
| STO-007 | Retention and Storage Governor | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | storage/archive-verification.js |
| STO-008 | Delta Cloud Keyframe Pack | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | storage/delta-pack.js |
| STO-009 | Event Capsule Builder | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | storage/event-capsule.js |
| STO-010 | Replay Rehydration Engine | P2 | IMPLEMENTED_FOUNDATION | Wave 3 | storage/replay-rehydration.js |

## Visual

| ID | Name | Priority | Maturity | Phase | Module / next action |
|---|---|---|---|---|---|
| VIS-001 | DATA TOWER | P0 | REFACTOR | Wave 1 | visual/tower.js |
| VIS-002 | DATA RELIEF | P1 | REUSE_WITH_ADAPTER | Wave 1 | geo/terrain-data-morph.js |
| VIS-003 | DATA FIELD | P0 | REUSE_WITH_ADAPTER | Wave 1 | visual/visual-manifest.js |
| VIS-004 | DATA FLOW | P1 | REUSE_WITH_ADAPTER | Wave 1 | visual/flow.js |
| VIS-005 | DATA NETWORK | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | human-flow/spatial-graph.js |
| VIS-006 | DATA VOLUME | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | visual/volume.js |
| VIS-007 | DATA PULSE | P1 | REUSE_WITH_ADAPTER | Wave 1 | visual/semantic-linter.js |
| VIS-008 | DATA TRACK | P1 | REUSE_WITH_ADAPTER | Wave 1 | adapters/v8-compat.js |
| VIS-009 | DATA BEACON | P0 | REUSE_WITH_ADAPTER | Wave 1 | visual/visual-manifest.js |

## Weather

| ID | Name | Priority | Maturity | Phase | Module / next action |
|---|---|---|---|---|---|
| WX-001 | Weather Detail Information Architecture | P1 | SPECIFIED_NEXT | Wave 2 | Current -> Brief -> hourly -> 10-day -> radar/precip -> details |
| WX-002 | Weather Spatiotemporal Fusion | P1 | SPECIFIED_NEXT | Wave 2 | Canonical location/time/unit/altitude/evidence snapshot |
| WX-003 | Observation Quality and Provenance | P1 | HARDEN | Wave 2 | Shared station/radar/satellite/model QC |
| WX-004 | Multi-Model Ensemble | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/ensemble.js |
| WX-005 | Local Bias Correction | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/ensemble.js |
| WX-006 | Radar/Satellite Nowcast | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/nowcast.js |
| WX-007 | Weather Event Detector | P1 | SPECIFIED_NEXT | Wave 2 | Detect fronts, convergence and rapid cooling as evidence |
| WX-008 | Moisture Source Attribution | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/moisture-attribution.js |
| WX-009 | SST Anomaly Support | P1 | REUSE_WITH_ADAPTER | Wave 2 | weather/moisture-attribution.js |
| WX-010 | Cyclone Remnant Interaction | P1 | SPECIFIED_NEXT | Wave 2 | Track remnant moisture/front/jet interactions |
| WX-011 | Forecast Gap Scanner | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/forecast-gap.js |
| WX-012 | Evidence Graph | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/evidence-graph.js |
| WX-013 | Weather Claim Gate | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/evidence-graph.js |
| WX-014 | Weather Narrative Composer | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/narrative.js |
| WX-015 | Weather Action Intelligence | P1 | SPECIFIED_NEXT | Wave 2 | Translate weather to schedule/activity impacts |
| WX-016 | Precipitation State Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/precipitation.js |
| WX-017 | Precipitation Nowcast | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/nowcast.js |
| WX-018 | Rain/Snow Phase Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/precipitation.js |
| WX-019 | Rain Curtain Renderer | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/precipitation.js |
| WX-020 | Weather Ground Truth and ModelOps | P1 | SPECIFIED_NEXT | Wave 2 | Store run/valid/actual by region and horizon |