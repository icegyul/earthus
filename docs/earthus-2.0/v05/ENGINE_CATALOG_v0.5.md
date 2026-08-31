# EARTHUS 2.0 Engine Catalog v0.5

**188 Engine/Component — Required Hardening + First Page**

| ID | Engine | Category | Priority | Maturity | Wave | Module |
|---|---|---|---|---|---|---|
| ANA-001 | Privacy-Safe Product Telemetry Engine | Analytics | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | analytics/telemetry.js |
| ANA-002 | Intelligence Funnel Engine | Analytics | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | analytics/funnel.js |
| ANA-003 | Alert Effectiveness Engine | Analytics | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | analytics/alert-effectiveness.js |
| ANA-004 | Engine Cost Attribution Engine | Analytics | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | analytics/cost-attribution.js |
| CLD-001 | Satellite Product and Tile Broker | Cloud | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | cloud/satellite-product-broker.js |
| CLD-002 | Cloud Top Retrieval | Cloud | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | cloud/cloud-state.js |
| CLD-003 | Cloud Base Retrieval | Cloud | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | cloud/cloud-state.js |
| CLD-004 | Multilayer Cloud Detection | Cloud | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | cloud/cloud-state.js |
| CLD-005 | Canonical Cloud State | Cloud | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | cloud/cloud-state.js |
| CLD-006 | 0-6h Cloud Nowcast | Cloud | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | weather/nowcast.js |
| CLD-007 | 6h-10d Forecast Cloud Volume | Cloud | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | cloud/cloud-forecast.js |
| CLD-008 | Cloud Confidence and Uncertainty | Cloud | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | cloud/cloud-forecast.js |
| CLD-009 | Adaptive Cloud Renderer | Cloud | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | cloud/cloud-render-policy.js |
| CLD-010 | Procedural Cloud Detail Synthesizer | Cloud | P2 | IMPLEMENTED_FOUNDATION | Wave 3 | cloud/procedural-detail.js |
| DAT-001 | Provider Adapter SDK | Data Plane | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | data/provider-adapter-sdk.js |
| DAT-002 | Canonical Tile Compiler | Data Plane | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | data/tile-compiler.js |
| DAT-003 | Reprojection and Resampling Engine | Data Plane | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | data/reprojection-resampling.js |
| DAT-004 | Time Slice Compiler | Data Plane | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | data/time-slice.js |
| DAT-005 | Multi-tier Cache Coordinator | Data Plane | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | data/cache-coordinator.js |
| DAT-006 | Adaptive Tile Prefetch Engine | Data Plane | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | data/adaptive-prefetch.js |
| DAT-007 | Revision and Reconciliation Engine | Data Plane | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | data/revision-engine.js |
| DAT-008 | Feature Snapshot Store Contract | Data Plane | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | data/feature-snapshot.js |
| DAT-009 | Spatial Identity Resolution Engine | Data Plane | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | data/spatial-identity-resolution.js |
| DAT-010 | Learning Data Factory | Data Plane | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | data/learning-data-factory.js |
| FND-001 | Cesium Globe Core Adapter | Foundation | P0 | REUSE_AS_IS | Wave 0 | adapters/v8-compat.js |
| FND-002 | Thermal and Render Quality Adapter | Foundation | P0 | REUSE_AS_IS | Wave 0 | core/resource-governor.js |
| FND-003 | Truth and Evidence Contract Adapter | Foundation | P0 | REUSE_AS_IS | Wave 0 | core/canonical-signal.js |
| FND-004 | Unified Time Adapter | Foundation | P0 | REUSE_WITH_ADAPTER | Wave 0 | adapters/v8-compat.js |
| FND-005 | Provider and Source Registry | Foundation | P0 | HARDEN | Wave 0 | paid/rights-gate.js |
| FND-006 | Canonical Signal Contract | Foundation | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | core/canonical-signal.js |
| FND-007 | Engine Runtime SDK | Foundation | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | core/engine-runtime.js |
| FND-008 | Resource Ownership Governor | Foundation | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | core/resource-governor.js |
| FND-009 | Scene Orchestrator | Foundation | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | core/scene-orchestrator.js |
| FND-010 | Truth Budget Engine | Foundation | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | core/truth-budget.js |
| FND-011 | Visual Manifest and Semantic Linter | Foundation | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | visual/visual-manifest.js + visual/semantic-linter.js |
| FND-012 | Canonical Signal Lake Index | Foundation | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | storage/canonical-lake.js |
| FND-013 | Geospatial Reference Engine | Foundation | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | geo/geospatial-reference.js |
| FND-014 | Country Focus Geometry and Dimming | Foundation | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | geo/country-focus.js |
| FND-015 | Terrain Source and LOD Broker | Foundation | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | geo/terrain-source-broker.js + geo/terrain-lod.js |
| FND-016 | Paid Intelligence Delivery Shell | Foundation | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | paid/entitlement.js + paid/intelligence-orchestrator.js |
| FND-017 | Planet Intelligence Orchestrator | Foundation | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | core/planet-intelligence-orchestrator.js |
| FND-018 | Device Network Battery Governor | Foundation | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | core/device-network-governor.js |
| GEO-001 | Terrain/Data Morph Engine | Geo/Terrain | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | geo/terrain-data-morph.js |
| GEO-002 | Bathymetry and Trench Level 1 | Geo/Terrain | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | geo/bathymetry-policy.js |
| GEO-003 | Trench Camera Level 2 | Geo/Terrain | P2 | IMPLEMENTED_FOUNDATION | Wave 3 | geo/trench-camera.js |
| GEO-004 | Underwater Camera Level 3 | Geo/Terrain | P2 | FUTURE_VISION | Future | existing runtime / future gate |
| GEO-005 | Place Hierarchy Resolver | Geo/Terrain | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | geo/place-hierarchy.js |
| HAZ-001 | Unified Official Warning Engine | Hazard | P0 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/warning-engine.js |
| HAZ-002 | Hazard Event Graph | Hazard | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/event-graph.js |
| HAZ-003 | Earthquake Depth Engine | Hazard | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/earthquake-depth.js |
| HAZ-004 | Seismic Cluster Context Engine | Hazard | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/earthquake-depth.js |
| HAZ-005 | Tsunami Official Alert Integrator | Hazard | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/tsunami-alert.js |
| HAZ-006 | Tsunami Travel-Time Visualizer | Hazard | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/tsunami-alert.js |
| HAZ-007 | Lightning Cell Tracking Engine | Hazard | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/lightning-track.js |
| HAZ-008 | Wildfire Hotspot Fusion Engine | Hazard | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/wildfire-smoke.js |
| HAZ-009 | Smoke Exposure Engine | Hazard | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/wildfire-smoke.js |
| HAZ-010 | Cyclone Multi-Agency Track Resolver | Hazard | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/cyclone-resolver.js |
| HAZ-011 | Cross-Agency Event Fusion Engine | Hazard | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | hazards/event-fusion.js |
| HF-001 | Spatiotemporal Fusion | Human Flow | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/spatiotemporal-fusion.js |
| HF-002 | Earthus Spatial Cell Registry | Human Flow | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/spatial-cell-registry.js |
| HF-003 | Density Algorithm | Human Flow | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/algorithms.js |
| HF-004 | Trend Algorithm | Human Flow | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/algorithms.js |
| HF-005 | Evidence-limited Flow Algorithm | Human Flow | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/algorithms.js |
| HF-006 | Baseline Crowd Forecast v0 | Human Flow | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/algorithms.js |
| HF-007 | Ground Truth Verification | Human Flow | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/forecast-lifecycle.js |
| HF-008 | Calibration Loop v1 | Human Flow | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/forecast-lifecycle.js |
| HF-009 | Confidence Engine | Human Flow | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | core/confidence.js |
| HF-010 | Anomaly Engine | Human Flow | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/algorithms.js |
| HF-011 | Capacity Engine | Human Flow | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/algorithms.js |
| HF-012 | Risk Hard-Gate Engine | Human Flow | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/algorithms.js |
| HF-013 | Spatial Graph Engine | Human Flow | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/spatial-graph.js |
| HF-014 | Spatial Digital Twin | Human Flow | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | human-flow/digital-twin.js |
| HF-015 | Domain Policy Registry | Human Flow | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | core/domain-policy.js |
| HF-016 | Best Window Engine | Human Flow | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | core/domain-policy.js |
| HF-017 | Watch and Notification Decision | Human Flow | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | human-flow/watch-notification-decision.js |
| HF-018 | Human Flow Scenario | Human Flow | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | human-flow/scenario.js |
| HYD-001 | Hydrography Network | Hydrology | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | hydrology/hydrography-network.js |
| HYD-002 | River Visual Network Adapter | Hydrology | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | hydrology/river-visual-network.js |
| HYD-003 | Runoff Engine | Hydrology | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | hydrology/runoff-routing.js |
| HYD-004 | River Routing Engine | Hydrology | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | hydrology/runoff-routing.js |
| HYD-005 | Flood/Inundation Scenario | Hydrology | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | hydrology/runoff-routing.js |
| HYD-006 | Tsunami Bathymetric Propagation | Hydrology | P2 | FUTURE_VISION | Wave 4 | existing runtime / future gate |
| INT-001 | Planet State Graph | Intelligence | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | intelligence/planet-state-graph.js |
| INT-002 | Cross-Domain Correlation Engine | Intelligence | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | intelligence/correlation.js |
| INT-003 | Analog Event Retrieval Engine | Intelligence | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | intelligence/analog-retrieval.js |
| INT-004 | Regime Detection Engine | Intelligence | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | intelligence/regime-detector.js |
| INT-005 | Personal Impact Engine | Intelligence | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | intelligence/personal-impact.js |
| INT-006 | Route Exposure Engine | Intelligence | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | intelligence/route-exposure.js |
| INT-007 | Decision Explanation Engine | Intelligence | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | intelligence/decision-explanation.js |
| INT-008 | Event Story Orchestrator | Intelligence | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | intelligence/story-orchestrator.js |
| OCN-001 | Ocean State Fusion Engine | Ocean | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ocean/ocean-state.js |
| OCN-002 | Surface Current Vector Engine | Ocean | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ocean/ocean-state.js |
| OCN-003 | Wave State Engine | Ocean | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ocean/wave-engine.js |
| OCN-004 | Swell Arrival Engine | Ocean | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ocean/swell-arrival.js |
| OCN-005 | Tide and Sea-Level Engine | Ocean | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ocean/tide-sea-level.js |
| OCN-006 | Marine Observation Fusion | Ocean | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ocean/marine-observation.js |
| OCN-007 | SST Front and Eddy Feature Engine | Ocean | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ocean/sst-features.js |
| OCN-008 | Coastal Exposure Engine | Ocean | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ocean/coastal-exposure.js |
| OPS-001 | Provider Health Engine | Operations/Governance | P0 | IMPLEMENTED_FOUNDATION | Wave 1 | ops/provider-health.js |
| OPS-002 | Circuit Breaker and Backoff | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/provider-health.js |
| OPS-003 | Job Dependency DAG | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/job-dag.js |
| OPS-004 | Dead Letter Recovery | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/dead-letter-recovery.js |
| OPS-005 | Freshness SLO Registry | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/freshness-slo.js |
| OPS-006 | ModelOps Lifecycle | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/modelops.js |
| OPS-007 | Champion/Challenger Selector | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/modelops.js |
| OPS-008 | Country Data Passport Compiler | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/readiness-compiler.js |
| OPS-009 | Observation Gap Lens | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/observation-gap.js |
| OPS-010 | Cost Observability | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/cost-observability.js |
| OPS-011 | Cost-to-Value Scheduler | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/cost-observability.js |
| OPS-012 | Rollback Engine | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/rollback-engine.js |
| OPS-013 | Performance and Thermal Lab | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/performance-lab.js |
| OPS-014 | Regional Standards and Localization | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | core/localization.js |
| OPS-015 | Platform Delivery Capability Gate | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | core/platform-capability.js |
| OPS-016 | Source Governance and Paid Use | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | ops/source-governance-paid-use.js |
| OPS-017 | Fail-Soft Scene Profile Compiler | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | core/fail-soft-scene.js |
| OPS-018 | Trust Ledger Drill-down | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | core/trust-ledger.js |
| OPS-019 | Engine Reuse Enforcement Gate | Operations/Governance | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | ops/engine-reuse-enforcer.js |
| PAY-001 | Entitlement Engine | Paid/Business | P0 | IMPLEMENTED_FOUNDATION | Wave 1 | paid/entitlement.js |
| PAY-002 | Intelligence Panel Orchestrator | Paid/Business | P0 | IMPLEMENTED_FOUNDATION | Wave 1 | paid/intelligence-orchestrator.js |
| PAY-003 | Usage Metering | Paid/Business | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | paid/usage-metering.js |
| PAY-004 | Quota Engine | Paid/Business | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | paid/usage-metering.js |
| PAY-005 | Personal Context Engine | Paid/Business | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | paid/personal-context.js |
| PAY-006 | Comparison Engine | Paid/Business | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | paid/comparison.js |
| PAY-007 | Scenario Engine | Paid/Business | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | paid/scenario.js |
| PAY-008 | Report and API Engine | Paid/Business | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | paid/report-api-engine.js |
| PAY-009 | Country Unlock Ledger | Paid/Business | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | paid/country-unlock.js |
| PAY-010 | Commercial Rights Gate | Paid/Business | P0 | IMPLEMENTED_FOUNDATION | Wave 1 | paid/rights-gate.js |
| PAY-011 | Subscription State Engine | Paid/Business | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | paid/subscription-state.js |
| PAY-012 | Premium Cache Engine | Paid/Business | P1 | IMPLEMENTED_FOUNDATION | Wave 4 | paid/premium-cache.js |
| PAY-013 | Offline Trip Pack | Paid/Business | VNEXT | IMPLEMENTED_FOUNDATION | Wave 4 | paid/offline-trip-pack.js |
| QA-001 | Engine Contract Harness | Quality | P0 | IMPLEMENTED_FOUNDATION | Wave 1 | qa/contract-harness.js |
| QA-002 | Fault Injection Engine | Quality | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | qa/fault-injection.js |
| QA-003 | Replay Regression Engine | Quality | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | qa/replay-regression.js |
| QA-004 | Launch Gate Compiler | Quality | P0 | IMPLEMENTED_FOUNDATION | Wave 1 | qa/launch-gate.js |
| QA-005 | Completion Evidence Compiler | Quality | P0 | IMPLEMENTED_FOUNDATION | Wave 0 | qa/completion-evidence.js |
| SEC-001 | Secret Redaction Middleware | Security | P0 | IMPLEMENTED_FOUNDATION | Wave 1 | security/redaction.js |
| SEC-002 | Public Endpoint Abuse Guard | Security | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | security/abuse-guard.js |
| SEC-003 | Privacy Minimization Engine | Security | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | security/privacy-minimization.js |
| SEC-004 | Access Audit Ledger | Security | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | security/audit-ledger.js |
| SPC-001 | Earthus-Aetherus Space Event Bridge | Space | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | space/space-event-bridge.js |
| SPC-002 | Launch Event Lifecycle Engine | Space | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | space/launch-event.js |
| SPC-003 | Celestial Local Context Engine | Space | P2 | IMPLEMENTED_FOUNDATION | Wave 4 | space/celestial-context.js |
| STO-001 | Archive Packager | Storage/Archive | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | storage/archive-packager.js |
| STO-002 | NAS Archive Agent | Storage/Archive | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | storage/nas-archive-agent.js |
| STO-003 | Archive State Machine | Storage/Archive | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | storage/archive-state-machine.js |
| STO-004 | Archive Verification and Deletion Gate | Storage/Archive | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | storage/archive-verification.js |
| STO-005 | Archive Catalog | Storage/Archive | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | storage/archive-catalog.js |
| STO-006 | Restore Engine | Storage/Archive | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | storage/restore-planner.js |
| STO-007 | Retention and Storage Governor | Storage/Archive | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | storage/archive-verification.js |
| STO-008 | Delta Cloud Keyframe Pack | Storage/Archive | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | storage/delta-pack.js |
| STO-009 | Event Capsule Builder | Storage/Archive | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | storage/event-capsule.js |
| STO-010 | Replay Rehydration Engine | Storage/Archive | P2 | IMPLEMENTED_FOUNDATION | Wave 3 | storage/replay-rehydration.js |
| VIS-001 | DATA TOWER | Visual | P0 | IMPLEMENTED_FOUNDATION | Wave 1 | visual/tower-runtime-v2.js |
| VIS-002 | DATA RELIEF | Visual | P1 | REUSE_WITH_ADAPTER | Wave 1 | geo/terrain-data-morph.js |
| VIS-003 | DATA FIELD | Visual | P0 | REUSE_WITH_ADAPTER | Wave 1 | visual/visual-manifest.js |
| VIS-004 | DATA FLOW | Visual | P1 | REUSE_WITH_ADAPTER | Wave 1 | visual/flow.js |
| VIS-005 | DATA NETWORK | Visual | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | human-flow/spatial-graph.js |
| VIS-006 | DATA VOLUME | Visual | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | visual/volume.js |
| VIS-007 | DATA PULSE | Visual | P1 | REUSE_WITH_ADAPTER | Wave 1 | visual/semantic-linter.js |
| VIS-008 | DATA TRACK | Visual | P1 | REUSE_WITH_ADAPTER | Wave 1 | adapters/v8-compat.js |
| VIS-009 | DATA BEACON | Visual | P0 | REUSE_WITH_ADAPTER | Wave 1 | visual/visual-manifest.js |
| VIS-010 | Visual Material Grammar Engine | Visual | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | visual/material-grammar.js |
| VIS-011 | Color and Accessibility Semantics | Visual | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | visual/color-accessibility.js |
| VIS-012 | Label and Annotation Budget Engine | Visual | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | visual/label-budget.js |
| VIS-013 | Picking and Inspection Engine | Visual | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | visual/picking-inspection.js |
| VIS-014 | Focus Transition and Camera Choreography | Visual | P1 | IMPLEMENTED_FOUNDATION | Wave 1 | visual/camera-choreography.js |
| WX-001 | Weather Detail Information Architecture | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/weather-detail-ia.js |
| WX-002 | Weather Spatiotemporal Fusion | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/weather-spatiotemporal-fusion.js |
| WX-003 | Observation Quality and Provenance | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/observation-quality-provenance.js |
| WX-004 | Multi-Model Ensemble | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/ensemble.js |
| WX-005 | Local Bias Correction | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/ensemble.js |
| WX-006 | Radar/Satellite Nowcast | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/nowcast.js |
| WX-007 | Weather Event Detector | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/weather-event-detector.js |
| WX-008 | Moisture Source Attribution | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/moisture-attribution.js |
| WX-009 | SST Anomaly Support | Weather | P1 | REUSE_WITH_ADAPTER | Wave 2 | weather/moisture-attribution.js |
| WX-010 | Cyclone Remnant Interaction | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/cyclone-remnant-interaction.js |
| WX-011 | Forecast Gap Scanner | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/forecast-gap.js |
| WX-012 | Evidence Graph | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/evidence-graph.js |
| WX-013 | Weather Claim Gate | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/evidence-graph.js |
| WX-014 | Weather Narrative Composer | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/narrative.js |
| WX-015 | Weather Action Intelligence | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/weather-action-intelligence.js |
| WX-016 | Precipitation State Engine | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/precipitation.js |
| WX-017 | Precipitation Nowcast | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/nowcast.js |
| WX-018 | Rain/Snow Phase Engine | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/precipitation.js |
| WX-019 | Rain Curtain Renderer | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/precipitation.js |
| WX-020 | Weather Ground Truth and ModelOps | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 2 | weather/weather-modelops.js |
| WX-021 | Forecast Scenario Cluster Engine | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | weather/forecast-scenario-cluster.js |
| WX-022 | Forecast Reconciliation Engine | Weather | P1 | IMPLEMENTED_FOUNDATION | Wave 3 | weather/forecast-reconciliation.js |
