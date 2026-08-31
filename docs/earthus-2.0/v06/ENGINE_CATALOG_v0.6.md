# EARTHUS 2.0 Engine Catalog v0.6

- Total Engine/Component: **200**
- New in v0.6: **12**

| ID | Engine | Category | P | Maturity | Module |
|---|---|---|---|---|---|
| ANA-001 | Privacy-Safe Product Telemetry Engine | Analytics | P1 | IMPLEMENTED_FOUNDATION | `analytics/telemetry.js` |
| ANA-002 | Intelligence Funnel Engine | Analytics | P1 | IMPLEMENTED_FOUNDATION | `analytics/funnel.js` |
| ANA-003 | Alert Effectiveness Engine | Analytics | P1 | IMPLEMENTED_FOUNDATION | `analytics/alert-effectiveness.js` |
| ANA-004 | Engine Cost Attribution Engine | Analytics | P1 | IMPLEMENTED_FOUNDATION | `analytics/cost-attribution.js` |
| CLD-001 | Satellite Product and Tile Broker | Cloud | P1 | IMPLEMENTED_FOUNDATION | `cloud/satellite-product-broker.js` |
| CLD-002 | Cloud Top Retrieval | Cloud | P1 | IMPLEMENTED_FOUNDATION | `cloud/cloud-state.js` |
| CLD-003 | Cloud Base Retrieval | Cloud | P1 | IMPLEMENTED_FOUNDATION | `cloud/cloud-state.js` |
| CLD-004 | Multilayer Cloud Detection | Cloud | P1 | IMPLEMENTED_FOUNDATION | `cloud/cloud-state.js` |
| CLD-005 | Canonical Cloud State | Cloud | P1 | IMPLEMENTED_FOUNDATION | `cloud/cloud-state.js` |
| CLD-006 | 0-6h Cloud Nowcast | Cloud | P1 | IMPLEMENTED_FOUNDATION | `weather/nowcast.js` |
| CLD-007 | 6h-10d Forecast Cloud Volume | Cloud | P1 | IMPLEMENTED_FOUNDATION | `cloud/cloud-forecast.js` |
| CLD-008 | Cloud Confidence and Uncertainty | Cloud | P1 | IMPLEMENTED_FOUNDATION | `cloud/cloud-forecast.js` |
| CLD-009 | Adaptive Cloud Renderer | Cloud | P1 | IMPLEMENTED_FOUNDATION | `cloud/cloud-render-policy.js` |
| CLD-010 | Procedural Cloud Detail Synthesizer | Cloud | P2 | IMPLEMENTED_FOUNDATION | `cloud/procedural-detail.js` |
| DAT-001 | Provider Adapter SDK | Data Plane | P1 | IMPLEMENTED_FOUNDATION | `data/provider-adapter-sdk.js` |
| DAT-002 | Canonical Tile Compiler | Data Plane | P1 | IMPLEMENTED_FOUNDATION | `data/tile-compiler.js` |
| DAT-003 | Reprojection and Resampling Engine | Data Plane | P1 | IMPLEMENTED_FOUNDATION | `data/reprojection-resampling.js` |
| DAT-004 | Time Slice Compiler | Data Plane | P1 | IMPLEMENTED_FOUNDATION | `data/time-slice.js` |
| DAT-005 | Multi-tier Cache Coordinator | Data Plane | P1 | IMPLEMENTED_FOUNDATION | `data/cache-coordinator.js` |
| DAT-006 | Adaptive Tile Prefetch Engine | Data Plane | P1 | IMPLEMENTED_FOUNDATION | `data/adaptive-prefetch.js` |
| DAT-007 | Revision and Reconciliation Engine | Data Plane | P1 | IMPLEMENTED_FOUNDATION | `data/revision-engine.js` |
| DAT-008 | Feature Snapshot Store Contract | Data Plane | P1 | IMPLEMENTED_FOUNDATION | `data/feature-snapshot.js` |
| DAT-009 | Spatial Identity Resolution Engine | Data Plane | P1 | IMPLEMENTED_FOUNDATION | `data/spatial-identity-resolution.js` |
| DAT-010 | Learning Data Factory | Data Plane | P1 | IMPLEMENTED_FOUNDATION | `data/learning-data-factory.js` |
| FND-001 | Cesium Globe Core Adapter | Foundation | P0 | REUSE_AS_IS | `adapters/v8-compat.js` |
| FND-002 | Thermal and Render Quality Adapter | Foundation | P0 | REUSE_AS_IS | `core/resource-governor.js` |
| FND-003 | Truth and Evidence Contract Adapter | Foundation | P0 | REUSE_AS_IS | `core/canonical-signal.js` |
| FND-004 | Unified Time Adapter | Foundation | P0 | REUSE_WITH_ADAPTER | `adapters/v8-compat.js` |
| FND-005 | Provider and Source Registry | Foundation | P0 | HARDEN | `paid/rights-gate.js` |
| FND-006 | Canonical Signal Contract | Foundation | P0 | IMPLEMENTED_FOUNDATION | `core/canonical-signal.js` |
| FND-007 | Engine Runtime SDK | Foundation | P0 | IMPLEMENTED_FOUNDATION | `core/engine-runtime.js` |
| FND-008 | Resource Ownership Governor | Foundation | P0 | IMPLEMENTED_FOUNDATION | `core/resource-governor.js` |
| FND-009 | Scene Orchestrator | Foundation | P0 | IMPLEMENTED_FOUNDATION | `core/scene-orchestrator.js` |
| FND-010 | Truth Budget Engine | Foundation | P0 | IMPLEMENTED_FOUNDATION | `core/truth-budget.js` |
| FND-011 | Visual Manifest and Semantic Linter | Foundation | P0 | IMPLEMENTED_FOUNDATION | `visual/visual-manifest.js + visual/semantic-linter.js` |
| FND-012 | Canonical Signal Lake Index | Foundation | P0 | IMPLEMENTED_FOUNDATION | `storage/canonical-lake.js` |
| FND-013 | Geospatial Reference Engine | Foundation | P0 | IMPLEMENTED_FOUNDATION | `geo/geospatial-reference.js` |
| FND-014 | Country Focus Geometry and Dimming | Foundation | P0 | IMPLEMENTED_FOUNDATION | `geo/country-focus.js` |
| FND-015 | Terrain Source and LOD Broker | Foundation | P0 | IMPLEMENTED_FOUNDATION | `geo/terrain-source-broker.js + geo/terrain-lod.js` |
| FND-016 | Paid Intelligence Delivery Shell | Foundation | P0 | IMPLEMENTED_FOUNDATION | `paid/entitlement.js + paid/intelligence-orchestrator.js` |
| FND-017 | Planet Intelligence Orchestrator | Foundation | P0 | IMPLEMENTED_FOUNDATION | `core/planet-intelligence-orchestrator.js` |
| FND-018 | Device Network Battery Governor | Foundation | P0 | IMPLEMENTED_FOUNDATION | `core/device-network-governor.js` |
| GEO-001 | Terrain/Data Morph Engine | Geo/Terrain | P1 | IMPLEMENTED_FOUNDATION | `geo/terrain-data-morph.js` |
| GEO-002 | Bathymetry and Trench Level 1 | Geo/Terrain | P1 | IMPLEMENTED_FOUNDATION | `geo/bathymetry-policy.js` |
| GEO-003 | Trench Camera Level 2 | Geo/Terrain | P2 | IMPLEMENTED_FOUNDATION | `geo/trench-camera.js` |
| GEO-004 | Underwater Camera Level 3 | Geo/Terrain | P2 | FUTURE_VISION | `None` |
| GEO-005 | Place Hierarchy Resolver | Geo/Terrain | P1 | IMPLEMENTED_FOUNDATION | `geo/place-hierarchy.js` |
| HAZ-001 | Unified Official Warning Engine | Hazard | P0 | IMPLEMENTED_FOUNDATION | `hazards/warning-engine.js` |
| HAZ-002 | Hazard Event Graph | Hazard | P1 | IMPLEMENTED_FOUNDATION | `hazards/event-graph.js` |
| HAZ-003 | Earthquake Depth Engine | Hazard | P1 | IMPLEMENTED_FOUNDATION | `hazards/earthquake-depth.js` |
| HAZ-004 | Seismic Cluster Context Engine | Hazard | P1 | IMPLEMENTED_FOUNDATION | `hazards/earthquake-depth.js` |
| HAZ-005 | Tsunami Official Alert Integrator | Hazard | P1 | IMPLEMENTED_FOUNDATION | `hazards/tsunami-alert.js` |
| HAZ-006 | Tsunami Travel-Time Visualizer | Hazard | P1 | IMPLEMENTED_FOUNDATION | `hazards/tsunami-alert.js` |
| HAZ-007 | Lightning Cell Tracking Engine | Hazard | P1 | IMPLEMENTED_FOUNDATION | `hazards/lightning-track.js` |
| HAZ-008 | Wildfire Hotspot Fusion Engine | Hazard | P1 | IMPLEMENTED_FOUNDATION | `hazards/wildfire-smoke.js` |
| HAZ-009 | Smoke Exposure Engine | Hazard | P1 | IMPLEMENTED_FOUNDATION | `hazards/wildfire-smoke.js` |
| HAZ-010 | Cyclone Multi-Agency Track Resolver | Hazard | P1 | IMPLEMENTED_FOUNDATION | `hazards/cyclone-resolver.js` |
| HAZ-011 | Cross-Agency Event Fusion Engine | Hazard | P1 | IMPLEMENTED_FOUNDATION | `hazards/event-fusion.js` |
| HF-001 | Spatiotemporal Fusion | Human Flow | P1 | IMPLEMENTED_FOUNDATION | `human-flow/spatiotemporal-fusion.js` |
| HF-002 | Earthus Spatial Cell Registry | Human Flow | P1 | IMPLEMENTED_FOUNDATION | `human-flow/spatial-cell-registry.js` |
| HF-003 | Density Algorithm | Human Flow | P1 | IMPLEMENTED_FOUNDATION | `human-flow/algorithms.js` |
| HF-004 | Trend Algorithm | Human Flow | P1 | IMPLEMENTED_FOUNDATION | `human-flow/algorithms.js` |
| HF-005 | Evidence-limited Flow Algorithm | Human Flow | P1 | IMPLEMENTED_FOUNDATION | `human-flow/algorithms.js` |
| HF-006 | Baseline Crowd Forecast v0 | Human Flow | P1 | IMPLEMENTED_FOUNDATION | `human-flow/algorithms.js` |
| HF-007 | Ground Truth Verification | Human Flow | P1 | IMPLEMENTED_FOUNDATION | `human-flow/forecast-lifecycle.js` |
| HF-008 | Calibration Loop v1 | Human Flow | P1 | IMPLEMENTED_FOUNDATION | `human-flow/forecast-lifecycle.js` |
| HF-009 | Confidence Engine | Human Flow | P1 | IMPLEMENTED_FOUNDATION | `core/confidence.js` |
| HF-010 | Anomaly Engine | Human Flow | P1 | IMPLEMENTED_FOUNDATION | `human-flow/algorithms.js` |
| HF-011 | Capacity Engine | Human Flow | P1 | IMPLEMENTED_FOUNDATION | `human-flow/algorithms.js` |
| HF-012 | Risk Hard-Gate Engine | Human Flow | P1 | IMPLEMENTED_FOUNDATION | `human-flow/algorithms.js` |
| HF-013 | Spatial Graph Engine | Human Flow | P1 | IMPLEMENTED_FOUNDATION | `human-flow/spatial-graph.js` |
| HF-014 | Spatial Digital Twin | Human Flow | P2 | IMPLEMENTED_FOUNDATION | `human-flow/digital-twin.js` |
| HF-015 | Domain Policy Registry | Human Flow | P1 | IMPLEMENTED_FOUNDATION | `core/domain-policy.js` |
| HF-016 | Best Window Engine | Human Flow | P1 | IMPLEMENTED_FOUNDATION | `core/domain-policy.js` |
| HF-017 | Watch and Notification Decision | Human Flow | P1 | IMPLEMENTED_FOUNDATION | `human-flow/watch-notification-decision.js` |
| HF-018 | Human Flow Scenario | Human Flow | P2 | IMPLEMENTED_FOUNDATION | `human-flow/scenario.js` |
| HYD-001 | Hydrography Network | Hydrology | P1 | IMPLEMENTED_FOUNDATION | `hydrology/hydrography-network.js` |
| HYD-002 | River Visual Network Adapter | Hydrology | P1 | IMPLEMENTED_FOUNDATION | `hydrology/river-visual-network.js` |
| HYD-003 | Runoff Engine | Hydrology | P2 | IMPLEMENTED_FOUNDATION | `hydrology/runoff-routing.js` |
| HYD-004 | River Routing Engine | Hydrology | P2 | IMPLEMENTED_FOUNDATION | `hydrology/runoff-routing.js` |
| HYD-005 | Flood/Inundation Scenario | Hydrology | P2 | IMPLEMENTED_FOUNDATION | `hydrology/runoff-routing.js` |
| HYD-006 | Tsunami Bathymetric Propagation | Hydrology | P2 | FUTURE_VISION | `None` |
| INT-001 | Planet State Graph | Intelligence | P1 | IMPLEMENTED_FOUNDATION | `intelligence/planet-state-graph.js` |
| INT-002 | Cross-Domain Correlation Engine | Intelligence | P1 | IMPLEMENTED_FOUNDATION | `intelligence/correlation.js` |
| INT-003 | Analog Event Retrieval Engine | Intelligence | P1 | IMPLEMENTED_FOUNDATION | `intelligence/analog-retrieval.js` |
| INT-004 | Regime Detection Engine | Intelligence | P1 | IMPLEMENTED_FOUNDATION | `intelligence/regime-detector.js` |
| INT-005 | Personal Impact Engine | Intelligence | P1 | IMPLEMENTED_FOUNDATION | `intelligence/personal-impact.js` |
| INT-006 | Route Exposure Engine | Intelligence | P1 | IMPLEMENTED_FOUNDATION | `intelligence/route-exposure.js` |
| INT-007 | Decision Explanation Engine | Intelligence | P1 | IMPLEMENTED_FOUNDATION | `intelligence/decision-explanation.js` |
| INT-008 | Event Story Orchestrator | Intelligence | P1 | IMPLEMENTED_FOUNDATION | `intelligence/story-orchestrator.js` |
| OCN-001 | Ocean State Fusion Engine | Ocean | P1 | IMPLEMENTED_FOUNDATION | `ocean/ocean-state.js` |
| OCN-002 | Surface Current Vector Engine | Ocean | P1 | IMPLEMENTED_FOUNDATION | `ocean/ocean-state.js` |
| OCN-003 | Wave State Engine | Ocean | P1 | IMPLEMENTED_FOUNDATION | `ocean/wave-engine.js` |
| OCN-004 | Swell Arrival Engine | Ocean | P1 | IMPLEMENTED_FOUNDATION | `ocean/swell-arrival.js` |
| OCN-005 | Tide and Sea-Level Engine | Ocean | P1 | IMPLEMENTED_FOUNDATION | `ocean/tide-sea-level.js` |
| OCN-006 | Marine Observation Fusion | Ocean | P1 | IMPLEMENTED_FOUNDATION | `ocean/marine-observation.js` |
| OCN-007 | SST Front and Eddy Feature Engine | Ocean | P1 | IMPLEMENTED_FOUNDATION | `ocean/sst-features.js` |
| OCN-008 | Coastal Exposure Engine | Ocean | P1 | IMPLEMENTED_FOUNDATION | `ocean/coastal-exposure.js` |
| OPS-001 | Provider Health Engine | Operations/Governance | P0 | IMPLEMENTED_FOUNDATION | `ops/provider-health.js` |
| OPS-002 | Circuit Breaker and Backoff | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | `ops/provider-health.js` |
| OPS-003 | Job Dependency DAG | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | `ops/job-dag.js` |
| OPS-004 | Dead Letter Recovery | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | `ops/dead-letter-recovery.js` |
| OPS-005 | Freshness SLO Registry | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | `ops/freshness-slo.js` |
| OPS-006 | ModelOps Lifecycle | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | `ops/modelops.js` |
| OPS-007 | Champion/Challenger Selector | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | `ops/modelops.js` |
| OPS-008 | Country Data Passport Compiler | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | `ops/readiness-compiler.js` |
| OPS-009 | Observation Gap Lens | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | `ops/observation-gap.js` |
| OPS-010 | Cost Observability | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | `ops/cost-observability.js` |
| OPS-011 | Cost-to-Value Scheduler | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | `ops/cost-observability.js` |
| OPS-012 | Rollback Engine | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | `ops/rollback-engine.js` |
| OPS-013 | Performance and Thermal Lab | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | `ops/performance-lab.js` |
| OPS-014 | Regional Standards and Localization | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | `core/localization.js` |
| OPS-015 | Platform Delivery Capability Gate | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | `core/platform-capability.js` |
| OPS-016 | Source Governance and Paid Use | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | `ops/source-governance-paid-use.js` |
| OPS-017 | Fail-Soft Scene Profile Compiler | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | `core/fail-soft-scene.js` |
| OPS-018 | Trust Ledger Drill-down | Operations/Governance | P1 | IMPLEMENTED_FOUNDATION | `core/trust-ledger.js` |
| OPS-019 | Engine Reuse Enforcement Gate | Operations/Governance | P0 | IMPLEMENTED_FOUNDATION | `ops/engine-reuse-enforcer.js` |
| PAY-001 | Entitlement Engine | Paid/Business | P0 | IMPLEMENTED_FOUNDATION | `paid/entitlement.js` |
| PAY-002 | Intelligence Panel Orchestrator | Paid/Business | P0 | IMPLEMENTED_FOUNDATION | `paid/intelligence-orchestrator.js` |
| PAY-003 | Usage Metering | Paid/Business | P1 | IMPLEMENTED_FOUNDATION | `paid/usage-metering.js` |
| PAY-004 | Quota Engine | Paid/Business | P1 | IMPLEMENTED_FOUNDATION | `paid/usage-metering.js` |
| PAY-005 | Personal Context Engine | Paid/Business | P1 | IMPLEMENTED_FOUNDATION | `paid/personal-context.js` |
| PAY-006 | Comparison Engine | Paid/Business | P1 | IMPLEMENTED_FOUNDATION | `paid/comparison.js` |
| PAY-007 | Scenario Engine | Paid/Business | P2 | IMPLEMENTED_FOUNDATION | `paid/scenario.js` |
| PAY-008 | Report and API Engine | Paid/Business | P2 | IMPLEMENTED_FOUNDATION | `paid/report-api-engine.js` |
| PAY-009 | Country Unlock Ledger | Paid/Business | P1 | IMPLEMENTED_FOUNDATION | `paid/country-unlock.js` |
| PAY-010 | Commercial Rights Gate | Paid/Business | P0 | IMPLEMENTED_FOUNDATION | `paid/rights-gate.js` |
| PAY-011 | Subscription State Engine | Paid/Business | P1 | IMPLEMENTED_FOUNDATION | `paid/subscription-state.js` |
| PAY-012 | Premium Cache Engine | Paid/Business | P1 | IMPLEMENTED_FOUNDATION | `paid/premium-cache.js` |
| PAY-013 | Offline Trip Pack | Paid/Business | VNEXT | IMPLEMENTED_FOUNDATION | `paid/offline-trip-pack.js` |
| QA-001 | Engine Contract Harness | Quality | P0 | IMPLEMENTED_FOUNDATION | `qa/contract-harness.js` |
| QA-002 | Fault Injection Engine | Quality | P1 | IMPLEMENTED_FOUNDATION | `qa/fault-injection.js` |
| QA-003 | Replay Regression Engine | Quality | P1 | IMPLEMENTED_FOUNDATION | `qa/replay-regression.js` |
| QA-004 | Launch Gate Compiler | Quality | P0 | IMPLEMENTED_FOUNDATION | `qa/launch-gate.js` |
| QA-005 | Completion Evidence Compiler | Quality | P0 | IMPLEMENTED_FOUNDATION | `qa/completion-evidence.js` |
| SEC-001 | Secret Redaction Middleware | Security | P0 | IMPLEMENTED_FOUNDATION | `security/redaction.js` |
| SEC-002 | Public Endpoint Abuse Guard | Security | P1 | IMPLEMENTED_FOUNDATION | `security/abuse-guard.js` |
| SEC-003 | Privacy Minimization Engine | Security | P1 | IMPLEMENTED_FOUNDATION | `security/privacy-minimization.js` |
| SEC-004 | Access Audit Ledger | Security | P1 | IMPLEMENTED_FOUNDATION | `security/audit-ledger.js` |
| SPC-001 | Earthus-Aetherus Space Event Bridge | Space | P2 | IMPLEMENTED_FOUNDATION | `space/space-event-bridge.js` |
| SPC-002 | Launch Event Lifecycle Engine | Space | P2 | IMPLEMENTED_FOUNDATION | `space/launch-event.js` |
| SPC-003 | Celestial Local Context Engine | Space | P2 | IMPLEMENTED_FOUNDATION | `space/celestial-context.js` |
| STO-001 | Archive Packager | Storage/Archive | P1 | IMPLEMENTED_FOUNDATION | `storage/archive-packager.js` |
| STO-002 | NAS Archive Agent | Storage/Archive | P1 | IMPLEMENTED_FOUNDATION | `storage/nas-archive-agent.js` |
| STO-003 | Archive State Machine | Storage/Archive | P1 | IMPLEMENTED_FOUNDATION | `storage/archive-state-machine.js` |
| STO-004 | Archive Verification and Deletion Gate | Storage/Archive | P1 | IMPLEMENTED_FOUNDATION | `storage/archive-verification.js` |
| STO-005 | Archive Catalog | Storage/Archive | P1 | IMPLEMENTED_FOUNDATION | `storage/archive-catalog.js` |
| STO-006 | Restore Engine | Storage/Archive | P1 | IMPLEMENTED_FOUNDATION | `storage/restore-planner.js` |
| STO-007 | Retention and Storage Governor | Storage/Archive | P1 | IMPLEMENTED_FOUNDATION | `storage/archive-verification.js` |
| STO-008 | Delta Cloud Keyframe Pack | Storage/Archive | P1 | IMPLEMENTED_FOUNDATION | `storage/delta-pack.js` |
| STO-009 | Event Capsule Builder | Storage/Archive | P1 | IMPLEMENTED_FOUNDATION | `storage/event-capsule.js` |
| STO-010 | Replay Rehydration Engine | Storage/Archive | P2 | IMPLEMENTED_FOUNDATION | `storage/replay-rehydration.js` |
| VIS-001 | DATA TOWER | Visual | P0 | IMPLEMENTED_FOUNDATION | `visual/tower-runtime-v2.js` |
| VIS-002 | DATA RELIEF | Visual | P1 | REUSE_WITH_ADAPTER | `geo/terrain-data-morph.js` |
| VIS-003 | DATA FIELD | Visual | P0 | REUSE_WITH_ADAPTER | `visual/visual-manifest.js` |
| VIS-004 | DATA FLOW | Visual | P1 | REUSE_WITH_ADAPTER | `visual/flow.js` |
| VIS-005 | DATA NETWORK | Visual | P1 | IMPLEMENTED_FOUNDATION | `human-flow/spatial-graph.js` |
| VIS-006 | DATA VOLUME | Visual | P1 | IMPLEMENTED_FOUNDATION | `visual/volume.js` |
| VIS-007 | DATA PULSE | Visual | P1 | REUSE_WITH_ADAPTER | `visual/semantic-linter.js` |
| VIS-008 | DATA TRACK | Visual | P1 | REUSE_WITH_ADAPTER | `adapters/v8-compat.js` |
| VIS-009 | DATA BEACON | Visual | P0 | REUSE_WITH_ADAPTER | `visual/visual-manifest.js` |
| VIS-010 | Visual Material Grammar Engine | Visual | P1 | IMPLEMENTED_FOUNDATION | `visual/material-grammar.js` |
| VIS-011 | Color and Accessibility Semantics | Visual | P1 | IMPLEMENTED_FOUNDATION | `visual/color-accessibility.js` |
| VIS-012 | Label and Annotation Budget Engine | Visual | P1 | IMPLEMENTED_FOUNDATION | `visual/label-budget.js` |
| VIS-013 | Picking and Inspection Engine | Visual | P1 | IMPLEMENTED_FOUNDATION | `visual/picking-inspection.js` |
| VIS-014 | Focus Transition and Camera Choreography | Visual | P1 | IMPLEMENTED_FOUNDATION | `visual/camera-choreography.js` |
| WX-001 | Weather Detail Information Architecture | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/weather-detail-ia.js` |
| WX-002 | Weather Spatiotemporal Fusion | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/weather-spatiotemporal-fusion.js` |
| WX-003 | Observation Quality and Provenance | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/observation-quality-provenance.js` |
| WX-004 | Multi-Model Ensemble | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/ensemble.js` |
| WX-005 | Local Bias Correction | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/ensemble.js` |
| WX-006 | Radar/Satellite Nowcast | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/nowcast.js` |
| WX-007 | Weather Event Detector | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/weather-event-detector.js` |
| WX-008 | Moisture Source Attribution | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/moisture-attribution.js` |
| WX-009 | SST Anomaly Support | Weather | P1 | REUSE_WITH_ADAPTER | `weather/moisture-attribution.js` |
| WX-010 | Cyclone Remnant Interaction | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/cyclone-remnant-interaction.js` |
| WX-011 | Forecast Gap Scanner | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/forecast-gap.js` |
| WX-012 | Evidence Graph | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/evidence-graph.js` |
| WX-013 | Weather Claim Gate | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/evidence-graph.js` |
| WX-014 | Weather Narrative Composer | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/narrative.js` |
| WX-015 | Weather Action Intelligence | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/weather-action-intelligence.js` |
| WX-016 | Precipitation State Engine | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/precipitation.js` |
| WX-017 | Precipitation Nowcast | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/nowcast.js` |
| WX-018 | Rain/Snow Phase Engine | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/precipitation.js` |
| WX-019 | Rain Curtain Renderer | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/precipitation.js` |
| WX-020 | Weather Ground Truth and ModelOps | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/weather-modelops.js` |
| WX-021 | Forecast Scenario Cluster Engine | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/forecast-scenario-cluster.js` |
| WX-022 | Forecast Reconciliation Engine | Weather | P1 | IMPLEMENTED_FOUNDATION | `weather/forecast-reconciliation.js` |
| ACT-001 | Public Action Source Registry | Earth Pulse/Public Action | P0 | IMPLEMENTED_FOUNDATION | `action/source-registry.js` |
| ACT-002 | Public Action & Event Ingestion Engine | Earth Pulse/Public Action | P0 | IMPLEMENTED_FOUNDATION | `action/ingestion.js` |
| ACT-003 | Activity Normalization Engine | Earth Pulse/Public Action | P0 | IMPLEMENTED_FOUNDATION | `action/normalization.js` |
| ACT-004 | Action Trust Verification Engine | Earth Pulse/Public Action | P0 | IMPLEMENTED_FOUNDATION | `action/trust-verification.js` |
| ACT-005 | Action Status Resolver | Earth Pulse/Public Action | P0 | IMPLEMENTED_FOUNDATION | `action/status-resolver.js` |
| ACT-006 | Location Precision Guard Engine | Earth Pulse/Public Action | P0 | IMPLEMENTED_FOUNDATION | `action/location-precision.js` |
| PUL-001 | Earth Pulse Orchestrator | Earth Pulse | P0 | IMPLEMENTED_FOUNDATION | `pulse/earth-pulse-orchestrator.js` |
| PUL-002 | Pulse Scene Budget Engine | Earth Pulse | P0 | IMPLEMENTED_FOUNDATION | `pulse/pulse-scene-budget.js` |
| NEWS-001 | News Geospatial Event Linker | News/Earth Pulse | P0 | IMPLEMENTED_FOUNDATION | `news/news-event-linker.js` |
| TRV-001 | Tourism Discovery Engine | Tourism Intelligence | P0 | IMPLEMENTED_FOUNDATION | `tourism/discovery.js` |
| TRV-002 | Travel Context Composer | Tourism Intelligence | P0 | IMPLEMENTED_FOUNDATION | `tourism/travel-context.js` |
| ENV-001 | Pollution Lens Orchestrator | Environment Intelligence | P0 | IMPLEMENTED_FOUNDATION | `environment/pollution-lens.js` |

## v0.6 additions

### ACT-001 — Public Action Source Registry
- **Purpose:** Register official API/RSS/page/event-platform/social/news sources with trust and allowed operations
- **Reuse basis:** Source Registry and Rights Registry exist, but no NGO/public-action source taxonomy
- **Dependencies:** FND-005, OPS-016
- **DoD:** Every public action has a registered source, trust class, attribution and allowed operation; no unknown page is silently promoted to official.

### ACT-002 — Public Action & Event Ingestion Engine
- **Purpose:** Normalize records from RSS/API/official pages/event platforms into canonical PublicActionEvent
- **Reuse basis:** Provider Adapter SDK exists; public-action ingestion is missing
- **Dependencies:** ACT-001, ACT-003, ACT-004, ACT-005, ACT-006, DAT-001
- **DoD:** Official source record becomes a canonical action event with truth, status and map precision; raw text alone never creates a LIVE action.

### ACT-003 — Activity Normalization Engine
- **Purpose:** Classify action type and environmental topic while preserving raw/source fields
- **Reuse basis:** No common NGO/public action schema
- **Dependencies:** ACT-001
- **DoD:** Campaign/cleanup/restoration/research/citizen-science/education/expedition/advocacy are normalized without inventing dates or locations.

### ACT-004 — Action Trust Verification Engine
- **Purpose:** Separate OFFICIAL_ACTION, NEWS_REPORTED, COMMUNITY_REPORTED and UNVERIFIED
- **Reuse basis:** Truth Contract exists but no action-specific official/news/community classes
- **Dependencies:** FND-003, ACT-001
- **DoD:** LIVE ACTION label requires official source plus ACTIVE status; news-only reports cannot be displayed as official NGO action.

### ACT-005 — Action Status Resolver
- **Purpose:** Resolve SCHEDULED/ACTIVE/ONGOING_CAMPAIGN/COMPLETED/CANCELLED/UNKNOWN
- **Reuse basis:** Unified Time exists; public campaign states are missing
- **Dependencies:** FND-004
- **DoD:** Status is deterministic from published schedule/cancellation evidence and never inferred from article tone.

### ACT-006 — Location Precision Guard Engine
- **Purpose:** Restrict mapping to EXACT_PUBLIC/CITY/REGION/COUNTRY/MAP_DISABLED
- **Reuse basis:** Spatial Identity exists but does not define privacy/public-location publication levels
- **Dependencies:** DAT-009, SEC-003
- **DoD:** Exact coordinate is rendered only when explicitly public; otherwise Earthus degrades to city/region/country and never geocodes a private or undisclosed action site.

### PUL-001 — Earth Pulse Orchestrator
- **Purpose:** Join Event + News + Public Action + Observation + Official + Earthus Analysis into one Earth Event experience
- **Reuse basis:** Event Fusion, Event Story and News layer exist separately
- **Dependencies:** HAZ-011, INT-008, ACT-002, NEWS-001, FND-017
- **DoD:** One EarthEvent detail can show OBSERVATION/OFFICIAL/NEWS/ACTION/EARTHUS without changing the truth class of any source; official safety always ranks first.

### PUL-002 — Pulse Scene Budget Engine
- **Purpose:** Bound visible global/country/regional Pulse beacons by device/thermal budget
- **Reuse basis:** Label budget, device governor and beacon renderer exist
- **Dependencies:** FND-018, VIS-009, VIS-012
- **DoD:** Global scene never becomes a news pin cloud; desktop/mobile/thermal budgets are enforced and lower-priority events remain panel-only.

### NEWS-001 — News Geospatial Event Linker
- **Purpose:** Link and cluster news to Earth Events using topic/place/time evidence
- **Reuse basis:** 1.0 News/GDELT layer exists; canonical EarthEvent linking is missing
- **Dependencies:** HAZ-011, DAT-009
- **DoD:** Many articles about one event collapse into one event cluster; low-confidence matches remain unlinked and article text never becomes observation data.

### TRV-001 — Tourism Discovery Engine
- **Purpose:** Rank data-derived travel discoveries using demand/novelty/relations/diversity/dwell/weather/accessibility with safety gates
- **Reuse basis:** KTO services, Human Flow, Best Window and weather context exist separately
- **Dependencies:** HF-016, HF-015, WX-015, DAT-009
- **DoD:** Official restrictions/critical hazards exclude a place before scoring; result is labelled EARTHUS_DISCOVERY and never misrepresented as official KTO recommendation or proven hidden gem.

### TRV-002 — Travel Context Composer
- **Purpose:** Compose WHY NOW, weather, visit window, nearby places and evidence IDs for a selected discovery
- **Reuse basis:** Weather detail, related tourism and place data exist separately
- **Dependencies:** TRV-001, WX-001, HF-016, INT-007
- **DoD:** Every recommendation reason is evidence-linked, max four clear reasons, and absence of crowd/weather data is not converted into a positive claim.

### ENV-001 — Pollution Lens Orchestrator
- **Purpose:** Unify AIR/FIRE/OCEAN/LAND pollution signals while preserving OBSERVED/REPORTED/DETECTED/MODELLED semantics and transport proof gates
- **Reuse basis:** Air grid, wildfire, smoke, ocean and land signals exist across current layers
- **Dependencies:** VIS-003, VIS-004, VIS-007, HAZ-008, HAZ-009, OCN-001, FND-003
- **DoD:** Pollution layers remain domain-separated; transport arrows/paths require vector proof; detected/modelled signals are never presented as measured source attribution.
