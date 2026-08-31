# EARTHUS 2.0 Engine Catalog v0.3

- Total engine/components: **179**
- v0.3 new engines/components: **55**
- Total algorithm contracts: **83**
- v0.3 new algorithms: **30**

> v0.3 does not replace verified 1.0 assets. It fills domain/runtime gaps around the v0.2 foundation.

## Analytics

| ID | Name | Priority | Maturity | Phase | Module / action |
|---|---|---|---|---|---|
| ANA-001 | Privacy-Safe Product Telemetry Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | analytics/telemetry.js |
| ANA-002 | Intelligence Funnel Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | analytics/funnel.js |
| ANA-003 | Alert Effectiveness Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | analytics/alert-effectiveness.js |
| ANA-004 | Engine Cost Attribution Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | analytics/cost-attribution.js |

## Cloud

| ID | Name | Priority | Maturity | Phase | Module / action |
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

## Data Plane

| ID | Name | Priority | Maturity | Phase | Module / action |
|---|---|---|---|---|---|
| DAT-001 | Provider Adapter SDK | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | data/provider-adapter-sdk.js |
| DAT-002 | Canonical Tile Compiler | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | data/tile-compiler.js |
| DAT-003 | Reprojection and Resampling Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | data/reprojection-resampling.js |
| DAT-004 | Time Slice Compiler | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | data/time-slice.js |
| DAT-005 | Multi-tier Cache Coordinator | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | data/cache-coordinator.js |
| DAT-006 | Adaptive Tile Prefetch Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | data/adaptive-prefetch.js |
| DAT-007 | Revision and Reconciliation Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | data/revision-engine.js |
| DAT-008 | Feature Snapshot Store Contract | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | data/feature-snapshot.js |

## Foundation

| ID | Name | Priority | Maturity | Phase | Module / action |
|---|---|---|---|---|---|
| FND-001 | Cesium Globe Core Adapter | P0 | REUSE_AS_IS | Wave 0 | adapters/v8-compat.js |
| FND-002 | Thermal and Render Quality Adapter | P0 | REUSE_AS_IS | Wave 0 | core/resource-governor.js |
| FND-003 | Truth and Evidence Contract Adapter | P0 | REUSE_AS_IS | Wave 0 | core/canonical-signal.js |
| FND-004 | Unified Time Adapter | P0 | REUSE_WITH_ADAPTER | Wave 0 | adapters/v8-compat.js |
| FND-005 | Provider and Source Registry | P0 | HARDEN | Wave 0 | paid/rights-gate.js |
| FND-006 | Canonical Signal Contract | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | core/canonical-signal.js |
| FND-007 | Engine Runtime SDK | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | core/engine-runtime.js |
| FND-008 | Resource Ownership Governor | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | core/resource-governor.js |
| FND-009 | Scene Orchestrator | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | core/scene-orchestrator.js |
| FND-010 | Truth Budget Engine | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | core/truth-budget.js |
| FND-011 | Visual Manifest and Semantic Linter | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | visual/visual-manifest.js + visual/semantic-linter.js |
| FND-012 | Canonical Signal Lake Index | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | storage/canonical-lake.js |
| FND-013 | Geospatial Reference Engine | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | geo/geospatial-reference.js |
| FND-014 | Country Focus Geometry and Dimming | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | geo/country-focus.js |
| FND-015 | Terrain Source and LOD Broker | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | geo/terrain-source-broker.js + geo/terrain-lod.js |
| FND-016 | Paid Intelligence Delivery Shell | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | paid/entitlement.js + paid/intelligence-orchestrator.js |

## Geo/Terrain

| ID | Name | Priority | Maturity | Phase | Module / action |
|---|---|---|---|---|---|
| GEO-001 | Terrain/Data Morph Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | geo/terrain-data-morph.js |
| GEO-002 | Bathymetry and Trench Level 1 | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | geo/bathymetry-policy.js |
| GEO-003 | Trench Camera Level 2 | P2 | SPECIFIED_NEXT | Wave 3 | Country/ocean to trench camera transition and depth labels |
| GEO-004 | Underwater Camera Level 3 | P2 | FUTURE_VISION | Future | Limited underwater entry with fog/light/particles |
| GEO-005 | Place Hierarchy Resolver | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | geo/place-hierarchy.js |

## Hazard

| ID | Name | Priority | Maturity | Phase | Module / action |
|---|---|---|---|---|---|
| HAZ-001 | Unified Official Warning Engine | P0 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/warning-engine.js |
| HAZ-002 | Hazard Event Graph | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/event-graph.js |
| HAZ-003 | Earthquake Depth Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/earthquake-depth.js |
| HAZ-004 | Seismic Cluster Context Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/earthquake-depth.js |
| HAZ-005 | Tsunami Official Alert Integrator | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/tsunami-alert.js |
| HAZ-006 | Tsunami Travel-Time Visualizer | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/tsunami-alert.js |
| HAZ-007 | Lightning Cell Tracking Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/lightning-track.js |
| HAZ-008 | Wildfire Hotspot Fusion Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/wildfire-smoke.js |
| HAZ-009 | Smoke Exposure Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/wildfire-smoke.js |
| HAZ-010 | Cyclone Multi-Agency Track Resolver | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/cyclone-resolver.js |

## Human Flow

| ID | Name | Priority | Maturity | Phase | Module / action |
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

| ID | Name | Priority | Maturity | Phase | Module / action |
|---|---|---|---|---|---|
| HYD-001 | Hydrography Network | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | hydrology/hydrography-network.js |
| HYD-002 | River Visual Network Adapter | P1 | SPECIFIED_NEXT | Wave 4 | Bind hydrography hierarchy to DATA NETWORK |
| HYD-003 | Runoff Engine | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | hydrology/runoff-routing.js |
| HYD-004 | River Routing Engine | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | hydrology/runoff-routing.js |
| HYD-005 | Flood/Inundation Scenario | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | hydrology/runoff-routing.js |
| HYD-006 | Tsunami Bathymetric Propagation | P2 | FUTURE_VISION | Wave 4 | Numerical propagation only after bathymetry and validation |

## Intelligence

| ID | Name | Priority | Maturity | Phase | Module / action |
|---|---|---|---|---|---|
| INT-001 | Planet State Graph | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | intelligence/planet-state-graph.js |
| INT-002 | Cross-Domain Correlation Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | intelligence/correlation.js |
| INT-003 | Analog Event Retrieval Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | intelligence/analog-retrieval.js |
| INT-004 | Regime Detection Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | intelligence/regime-detector.js |
| INT-005 | Personal Impact Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | intelligence/personal-impact.js |
| INT-006 | Route Exposure Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | intelligence/route-exposure.js |
| INT-007 | Decision Explanation Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | intelligence/decision-explanation.js |
| INT-008 | Event Story Orchestrator | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | intelligence/story-orchestrator.js |

## Ocean

| ID | Name | Priority | Maturity | Phase | Module / action |
|---|---|---|---|---|---|
| OCN-001 | Ocean State Fusion Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ocean/ocean-state.js |
| OCN-002 | Surface Current Vector Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ocean/ocean-state.js |
| OCN-003 | Wave State Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ocean/wave-engine.js |
| OCN-004 | Swell Arrival Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ocean/swell-arrival.js |
| OCN-005 | Tide and Sea-Level Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ocean/tide-sea-level.js |
| OCN-006 | Marine Observation Fusion | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ocean/marine-observation.js |
| OCN-007 | SST Front and Eddy Feature Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ocean/sst-features.js |
| OCN-008 | Coastal Exposure Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ocean/coastal-exposure.js |

## Operations/Governance

| ID | Name | Priority | Maturity | Phase | Module / action |
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

| ID | Name | Priority | Maturity | Phase | Module / action |
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

## Quality

| ID | Name | Priority | Maturity | Phase | Module / action |
|---|---|---|---|---|---|
| QA-001 | Engine Contract Harness | P0 | IMPLEMENTED_FOUNDATION | Wave 1 | qa/contract-harness.js |
| QA-002 | Fault Injection Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | qa/fault-injection.js |
| QA-003 | Replay Regression Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | qa/replay-regression.js |
| QA-004 | Launch Gate Compiler | P0 | IMPLEMENTED_FOUNDATION | Wave 1 | qa/launch-gate.js |

## Security

| ID | Name | Priority | Maturity | Phase | Module / action |
|---|---|---|---|---|---|
| SEC-001 | Secret Redaction Middleware | P0 | IMPLEMENTED_FOUNDATION | Wave 1 | security/redaction.js |
| SEC-002 | Public Endpoint Abuse Guard | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | security/abuse-guard.js |
| SEC-003 | Privacy Minimization Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | security/privacy-minimization.js |
| SEC-004 | Access Audit Ledger | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | security/audit-ledger.js |

## Space

| ID | Name | Priority | Maturity | Phase | Module / action |
|---|---|---|---|---|---|
| SPC-001 | Earthus-Aetherus Space Event Bridge | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | space/space-event-bridge.js |
| SPC-002 | Launch Event Lifecycle Engine | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | space/launch-event.js |
| SPC-003 | Celestial Local Context Engine | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | space/celestial-context.js |

## Storage/Archive

| ID | Name | Priority | Maturity | Phase | Module / action |
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

| ID | Name | Priority | Maturity | Phase | Module / action |
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
| VIS-010 | Visual Material Grammar Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | visual/material-grammar.js |
| VIS-011 | Color and Accessibility Semantics | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | visual/color-accessibility.js |
| VIS-012 | Label and Annotation Budget Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | visual/label-budget.js |
| VIS-013 | Picking and Inspection Engine | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | visual/picking-inspection.js |
| VIS-014 | Focus Transition and Camera Choreography | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | visual/camera-choreography.js |

## Weather

| ID | Name | Priority | Maturity | Phase | Module / action |
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
