# EARTHUS 2.0 Algorithm Catalog v0.4

Total algorithms/contracts: **117**

## ALG-ANA-001 · Alert effectiveness metrics
- Domain / Priority: **Analytics / P1**
- Module: `analytics/alert-effectiveness.js`
- Formula/Rule: `opened/sent and acted/sent`
- Inputs: notification events
- Outputs: open rate, action rate
- Guardrails: Delivery/open/action states are not inferred
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-ANA-002 · Engine cost attribution
- Domain / Priority: **Analytics / P1**
- Module: `analytics/cost-attribution.js`
- Formula/Rule: `sum compute+storage+egress+request cost by engine`
- Inputs: cost rows
- Outputs: engine cost map
- Guardrails: Safety collection cannot be disabled solely by cost
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-CLD-001 · Satellite product/tile source score
- Domain / Priority: **Cloud / P1**
- Module: `cloud/satellite-product-broker.js`
- Formula/Rule: `regional preference + freshness + resolution + angle + time + channel + parallax + reliability + cost`
- Inputs: satellite products/tile/time
- Outputs: primary/secondary/calibration
- Guardrails: Eligibility gates for rights, health, day/night and missing tiles
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-CLD-002 · Cloud-top retrieval
- Domain / Priority: **Cloud / P1**
- Module: `cloud/cloud-state.js`
- Formula/Rule: `argmin_z |T_profile(z)-BT_IR| + correction/uncertainty`
- Inputs: IR brightness temp, NWP profile
- Outputs: top height + uncertainty
- Guardrails: Parallax and limb flags
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-CLD-003 · Cloud-base retrieval
- Domain / Priority: **Cloud / P1**
- Module: `cloud/cloud-state.js`
- Formula/Rule: `first persistent RH/cloud-fraction layer, blended with LCL or ceilometer`
- Inputs: RH/cloud profile, LCL, ceilometer
- Outputs: base height + state
- Guardrails: Estimated unless directly observed
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-CLD-004 · Multilayer detection
- Domain / Priority: **Cloud / P1**
- Module: `cloud/cloud-state.js`
- Formula/Rule: `persistent cloud-fraction intervals above threshold`
- Inputs: vertical cloud profile
- Outputs: layers/multilayer flag
- Guardrails: Thin/ambiguous layers retain flags
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-CLD-005 · Cloud density profile
- Domain / Priority: **Cloud / P1**
- Module: `cloud/cloud-state.js`
- Formula/Rule: `weighted cloud fraction + RH + optical depth + mask + condensate - uncertainty`
- Inputs: layer variables
- Outputs: density 0..1
- Guardrails: Store state, not rendered voxel texture
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-CLD-006 · Observation/model/ensemble horizon blend
- Domain / Priority: **Cloud / P1**
- Module: `cloud/cloud-forecast.js`
- Formula/Rule: `alpha(h)*obs + beta(h)*deterministic + gamma(h)*ensemble`
- Inputs: cloud states, horizon
- Outputs: 0-10d state
- Guardrails: 7d+ becomes probabilistic and soft
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-CLD-007 · Cloud uncertainty visual mapping
- Domain / Priority: **Cloud / P1**
- Module: `cloud/cloud-render-policy.js`
- Formula/Rule: `opacity/detail decrease and blur increases with uncertainty/horizon`
- Inputs: confidence, uncertainty, horizon
- Outputs: render policy
- Guardrails: Long range must not look current
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-CLD-008 · Procedural cloud detail budget
- Domain / Priority: **Cloud / P2**
- Module: `cloud/procedural-detail.js`
- Formula/Rule: `detail = confidence*(1-uncertainty)*device*thermal*horizon scale`
- Inputs: cloud state quality, device, thermal, horizon
- Outputs: deterministic visual-only detail plan
- Guardrails: May not change meteorological coverage or meaning
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-CORE-001 · Canonical signal fingerprint
- Domain / Priority: **Core / P0**
- Module: `core/canonical-signal.js`
- Formula/Rule: `fingerprint = FNV1a64(stable canonical signal without signalId)`
- Inputs: canonical signal
- Outputs: stable fingerprint
- Guardrails: No secret/raw payload inclusion
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-CORE-002 · Cross-domain confidence
- Domain / Priority: **Core / P1**
- Module: `core/confidence.js`
- Formula/Rule: `weighted quality components with mandatory-source caps`
- Inputs: freshness, coverage, agreement, historical accuracy, mapping, stability
- Outputs: confidence + band + reason codes
- Guardrails: Missing mandatory source caps result
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-CORE-003 · Truth budget
- Domain / Priority: **Core / P0**
- Module: `core/truth-budget.js`
- Formula/Rule: `max fidelity = min(evidence, resolution, confidence, rights, device, thermal)`
- Inputs: evidence, resolution, confidence, rights, device
- Outputs: allowed visual fidelity
- Guardrails: No fine tower without actual grid
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-CORE-004 · Trust ledger status
- Domain / Priority: **Core / P1**
- Module: `core/trust-ledger.js`
- Formula/Rule: `support/counter evidence count and confidence produce SUPPORTED/CONTESTED/UNSUPPORTED`
- Inputs: support evidence, counter evidence
- Outputs: trust ledger
- Guardrails: Every evidence item keeps source, time and provenance
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-CORE-005 · Device-network-battery adaptive quality
- Domain / Priority: **Core / P0**
- Module: `core/device-network-governor.js`
- Formula/Rule: `quality = min(device memory, network/save-data, battery, thermal, accessibility budget)`
- Inputs: device/network/battery/thermal/accessibility
- Outputs: FULL/BALANCED/LITE/STATIC policy
- Guardrails: Reduce fidelity before fabricating or overfetching
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-CORE-006 · Planet execution plan compiler
- Domain / Priority: **Core / P0**
- Module: `core/planet-intelligence-orchestrator.js`
- Formula/Rule: `scene + manifest + truth budget + device profile -> one primary execution plan`
- Inputs: scene, layer manifest, truth budget, device profile
- Outputs: engine/fetch/degrade/disposal plan
- Guardrails: One dynamic data hero; Dispose previous primary
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-DAT-001 · Bilinear grid resampling
- Domain / Priority: **Data Plane / P1**
- Module: `data/reprojection-resampling.js`
- Formula/Rule: `bilinear interpolation in normalized grid coordinates`
- Inputs: source grid, target size
- Outputs: resampled grid
- Guardrails: Dataset requiring conservative mass preservation must use a dataset-specific conservative method
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-DAT-002 · Canonical time-slice selection
- Domain / Priority: **Data Plane / P1**
- Module: `data/time-slice.js`
- Formula/Rule: `nearest valid frame within max staleness window`
- Inputs: records, target time, max age
- Outputs: canonical frame or null
- Guardrails: Evidence modes cannot mix implicitly
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-DAT-003 · Bounded scalar quantization
- Domain / Priority: **Data Plane / P1**
- Module: `data/tile-compiler.js`
- Formula/Rule: `map finite min..max to Qbits with reserved no-data code`
- Inputs: scalar values, bit depth
- Outputs: quantized values, min/max metadata
- Guardrails: No-data remains explicit
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-DAT-004 · Revision fingerprint and classification
- Domain / Priority: **Data Plane / P1**
- Module: `data/revision-engine.js`
- Formula/Rule: `stable object fingerprint; same-time change => provider revision`
- Inputs: previous, next
- Outputs: revision state, fingerprints
- Guardrails: Provider revision is not a new observation time
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-DAT-005 · Adaptive frame prefetch
- Domain / Priority: **Data Plane / P1**
- Module: `data/adaptive-prefetch.js`
- Formula/Rule: `bounded forward/back window from playback/network/memory state`
- Inputs: frame index, network, memory
- Outputs: prefetch frame ids
- Guardrails: No unbounded background download
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-DAT-006 · Ambiguity-aware spatial identity resolution
- Domain / Priority: **Data / P1**
- Module: `data/spatial-identity-resolution.js`
- Formula/Rule: `external exact ID first; else normalized name/address + geodesic proximity score`
- Inputs: provider place, Earthus candidates
- Outputs: MATCHED/AMBIGUOUS/UNMATCHED
- Guardrails: Ambiguous entity never auto-merges
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-DAT-007 · Ground-truth learning example builder
- Domain / Priority: **Data / P1**
- Module: `data/learning-data-factory.js`
- Formula/Rule: `forecast + actual + feature snapshot + regime + rights -> privacy-minimized learning row`
- Inputs: forecast, ground truth, features, rights
- Outputs: training example or reject reason
- Guardrails: Ground truth and AI-use rights required; User identifiers removed
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-GEO-001 · Antimeridian-safe bounds
- Domain / Priority: **Geo / P0**
- Module: `geo/geospatial-reference.js`
- Formula/Rule: `unwrap longitudes and choose minimum span`
- Inputs: GeoJSON geometry
- Outputs: bounds/centroid/date-line flag
- Guardrails: Polygon and MultiPolygon only for containment
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-GEO-002 · Country camera fit
- Domain / Priority: **Geo / P0**
- Module: `geo/country-focus.js`
- Formula/Rule: `camera height proportional to geodesic diameter and viewport aspect`
- Inputs: country geometry, viewport
- Outputs: camera + dimming + clipping
- Guardrails: No global high-resolution download
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-GEO-003 · Terrain source score
- Domain / Priority: **Geo / P0**
- Module: `geo/terrain-source-broker.js`
- Formula/Rule: `resolution + freshness + continuity + datum + cost + regional priority`
- Inputs: terrain sources, region/zoom
- Outputs: primary/fallback source
- Guardrails: Rights/coverage/health are eligibility gates
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-GEO-004 · Screen-space terrain LOD
- Domain / Priority: **Geo / P0**
- Module: `geo/terrain-lod.js`
- Formula/Rule: `SSE = geometricError*viewportHeight/(2*distance*tan(FOV/2))`
- Inputs: tile error, camera distance, viewport
- Outputs: selected LOD
- Guardrails: Tile budget cap
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-GEO-005 · Terrain/data morph
- Domain / Priority: **Geo / P1**
- Module: `geo/terrain-data-morph.js`
- Formula/Rule: `displayZ = lerp(terrainZ, terrainZ + normalizedData*reliefScale, mix)`
- Inputs: terrain elevation, normalized data
- Outputs: display elevation
- Guardrails: Raw values unchanged and capped
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-GEO-006 · Trench Level-2 camera plan
- Domain / Priority: **Geo / P2**
- Module: `geo/trench-camera.js`
- Formula/Rule: `overview/close camera heights scale with verified trench depth and viewport; camera remains non-submerged`
- Inputs: target lon/lat/depth, viewport, reduced motion
- Outputs: camera waypoints, depth/source labels
- Guardrails: No full underwater navigation; No invented seafloor/subduction geometry
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HAZ-001 · Official warning precedence merge
- Domain / Priority: **Hazard / P0**
- Module: `hazards/warning-engine.js`
- Formula/Rule: `official first, then severity, then latest issue time`
- Inputs: warnings
- Outputs: primary warning, active list
- Guardrails: Earthus cannot downgrade active official warning
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HAZ-002 · Hypocenter depth visual mapping
- Domain / Priority: **Hazard / P1**
- Module: `hazards/earthquake-depth.js`
- Formula/Rule: `display radius=Earth radius-depth*bounded exaggeration`
- Inputs: depth, magnitude
- Outputs: 3D depth placement
- Guardrails: Not P/S wave propagation
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HAZ-003 · Seismic context clustering
- Domain / Priority: **Hazard / P1**
- Module: `hazards/earthquake-depth.js`
- Formula/Rule: `spatiotemporal radius grouping`
- Inputs: earthquakes
- Outputs: context clusters
- Guardrails: Not aftershock prediction
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HAZ-004 · Lightning centroid tracking
- Domain / Priority: **Hazard / P1**
- Module: `hazards/lightning-track.js`
- Formula/Rule: `spatial cluster then nearest-centroid matching`
- Inputs: lightning points
- Outputs: cell clusters, motion evidence
- Guardrails: Motion is estimated
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HAZ-005 · Wildfire hotspot clustering
- Domain / Priority: **Hazard / P1**
- Module: `hazards/wildfire-smoke.js`
- Formula/Rule: `spatiotemporal hotspot radius grouping`
- Inputs: thermal hotspots
- Outputs: hotspot clusters
- Guardrails: Cluster is not burn perimeter
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HAZ-006 · Cyclone agency resolver
- Domain / Priority: **Hazard / P1**
- Module: `hazards/cyclone-resolver.js`
- Formula/Rule: `region-specific official agency priority; preserve alternates`
- Inputs: agency tracks, region
- Outputs: primary, alternates
- Guardrails: Never average official agency tracks
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HAZ-007 · Cross-agency hazard event fusion
- Domain / Priority: **Hazard / P1**
- Module: `hazards/event-fusion.js`
- Formula/Rule: `group by type + time window + spatial proximity`
- Inputs: agency events
- Outputs: canonical event groups
- Guardrails: Agency geometry/values not averaged; Conflicts remain inspectable
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HF-001 · Density
- Domain / Priority: **Human Flow / P1**
- Module: `human-flow/algorithms.js`
- Formula/Rule: `raw_density = population/effective_area`
- Inputs: population estimate, validated area
- Outputs: density
- Guardrails: Unknown area -> UNKNOWN
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HF-002 · Calibrated crowd index
- Domain / Priority: **Human Flow / P1**
- Module: `human-flow/algorithms.js`
- Formula/Rule: `weighted percentile + relative ratio + robust z + official level`
- Inputs: density history, official level
- Outputs: 0-100 index
- Guardrails: Official level has UI/safety precedence
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HF-003 · Persistent trend
- Domain / Priority: **Human Flow / P1**
- Module: `human-flow/algorithms.js`
- Formula/Rule: `EWMA + Theil-Sen slope + persistence filter`
- Inputs: time series
- Outputs: trend/slope/acceleration
- Guardrails: Single spike cannot create trend
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HF-004 · Evidence-limited scalar flow
- Domain / Priority: **Human Flow / P1**
- Module: `human-flow/algorithms.js`
- Formula/Rule: `in=max(0,delta)/dt; out=max(0,-delta)/dt`
- Inputs: population series
- Outputs: in/out rate
- Guardrails: No direction without OD/graph evidence
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HF-005 · Explainable crowd forecast v0
- Domain / Priority: **Human Flow / P1**
- Module: `human-flow/algorithms.js`
- Formula/Rule: `baseline + trend + event + weather + mobility + provider factor`
- Inputs: feature snapshot
- Outputs: forecast + contributions
- Guardrails: Provider and Earthus forecasts remain distinct
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HF-006 · Robust anomaly
- Domain / Priority: **Human Flow / P1**
- Module: `human-flow/algorithms.js`
- Formula/Rule: `abs(current-seasonalMedian)/(1.4826*MAD) with persistence`
- Inputs: current/history/events
- Outputs: anomaly state
- Guardrails: Anomaly is not automatically a disaster
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HF-007 · Validated capacity pressure
- Domain / Priority: **Human Flow / P1**
- Module: `human-flow/algorithms.js`
- Formula/Rule: `occupancy/validated_capacity`
- Inputs: occupancy, validated capacity
- Outputs: pressure
- Guardrails: Never infer legal capacity from area
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HF-008 · Risk hard gate
- Domain / Priority: **Human Flow / P1**
- Module: `human-flow/algorithms.js`
- Formula/Rule: `max(official,weather,crowd,capacity,bottleneck)+reliability penalty`
- Inputs: risk signals
- Outputs: SAFE/CAUTION/WARNING/CRITICAL/UNKNOWN
- Guardrails: Official emergency overrides score
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HF-009 · Shortest path with status/capacity penalties
- Domain / Priority: **Human Flow / P1**
- Module: `human-flow/spatial-graph.js`
- Formula/Rule: `Dijkstra over verified typed edges`
- Inputs: spatial graph
- Outputs: path/cost
- Guardrails: Closed or inaccessible edges excluded
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HF-010 · Forecast verification metrics
- Domain / Priority: **Human Flow / P1**
- Module: `human-flow/forecast-lifecycle.js`
- Formula/Rule: `error=actual-predicted; MAE/RMSE/bias by filters`
- Inputs: forecast, actual
- Outputs: metrics
- Guardrails: Every forecast keeps issued/target/model version
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HF-011 · Champion/challenger
- Domain / Priority: **ModelOps / P1**
- Module: `human-flow/forecast-lifecycle.js`
- Formula/Rule: `relative MAE improvement + calibration improvement`
- Inputs: champion/challenger metrics
- Outputs: promotion decision
- Guardrails: No promotion on accuracy alone
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HF-012 · Spatiotemporal snapshot selection
- Domain / Priority: **Human Flow / P1**
- Module: `human-flow/spatiotemporal-fusion.js`
- Formula/Rule: `select nearest valid signal per variable inside variable-specific staleness window`
- Inputs: canonical signals, snapshot time, freshness rules
- Outputs: aligned snapshot, rejections, missing required variables
- Guardrails: Different timestamps are never merged as equally current
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HF-013 · Spatial cell provider mapping
- Domain / Priority: **Human Flow / P1**
- Module: `human-flow/spatial-cell-registry.js`
- Formula/Rule: `provider/service/externalId -> Earthus cell mapping with explicit mapping quality/version`
- Inputs: Earthus cell, external mapping
- Outputs: stable cell registry, provider mapping
- Guardrails: Provider external ID is not Earthus master ID
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HF-014 · Digital twin capacity provenance gate
- Domain / Priority: **Human Flow / P2**
- Module: `human-flow/digital-twin.js`
- Formula/Rule: `capacity value accepted only with capacity provenance`
- Inputs: twin entity
- Outputs: validated twin entity
- Guardrails: Never infer legal/safe capacity from area alone
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HF-015 · Scenario isolation
- Domain / Priority: **Human Flow / P2**
- Module: `human-flow/scenario.js`
- Formula/Rule: `scenario = deep-cloned baseline + explicit deltas; LIVE snapshot is immutable`
- Inputs: baseline, occupancy delta, closed edges, capacity overrides
- Outputs: SIMULATION result
- Guardrails: Scenario never mutates LIVE state
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HYD-001 · SCS runoff foundation
- Domain / Priority: **Hydrology / P2**
- Module: `hydrology/runoff-routing.js`
- Formula/Rule: `Q=(P-Ia)^2/(P+(1-lambda)S)`
- Inputs: precipitation, curve number
- Outputs: runoff mm
- Guardrails: Requires basin calibration; scenario only
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HYD-002 · Linear reservoir routing foundation
- Domain / Priority: **Hydrology / P2**
- Module: `hydrology/runoff-routing.js`
- Formula/Rule: `outflow=storage/K; storage+=inflow-outflow`
- Inputs: inflow, storage, K
- Outputs: outflow/storage
- Guardrails: Replace/validate per basin
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-HYD-003 · River visual semantic LOD
- Domain / Priority: **Hydrology / P1**
- Module: `hydrology/river-visual-network.js`
- Formula/Rule: `minimum stream order rises as camera zooms out; line width follows verified stream order`
- Inputs: hydrography segments, zoom, basin
- Outputs: DATA NETWORK segments
- Guardrails: No flow direction unless verified
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-INT-001 · Cross-domain Pearson association
- Domain / Priority: **Intelligence / P1**
- Module: `intelligence/correlation.js`
- Formula/Rule: `Pearson r with minimum valid pair count`
- Inputs: aligned series
- Outputs: r, n
- Guardrails: Correlation is not causation
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-INT-002 · Analog feature distance
- Domain / Priority: **Intelligence / P1**
- Module: `intelligence/analog-retrieval.js`
- Formula/Rule: `weighted normalized Euclidean distance`
- Inputs: target features, historical cases
- Outputs: ranked analogs
- Guardrails: Expose feature basis and distance
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-INT-003 · Regime classifier foundation
- Domain / Priority: **Intelligence / P1**
- Module: `intelligence/regime-detector.js`
- Formula/Rule: `coefficient of variation + normalized end-to-end slope`
- Inputs: time series
- Outputs: stable/rising/falling/volatile
- Guardrails: Domain thresholds remain configurable
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-INT-004 · Route exposure integration
- Domain / Priority: **Intelligence / P1**
- Module: `intelligence/route-exposure.js`
- Formula/Rule: `length-weighted hazard intensity with official gates`
- Inputs: route segments, signals
- Outputs: route exposure
- Guardrails: Official closure/warning overrides score
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-INT-005 · Decision contribution ranking
- Domain / Priority: **Intelligence / P1**
- Module: `intelligence/decision-explanation.js`
- Formula/Rule: `rank absolute contribution; hard gate first`
- Inputs: decision, contributions, gates
- Outputs: primary reason, ranked factors
- Guardrails: No unexplained recommendation
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-OCN-001 · Ocean vector magnitude/direction
- Domain / Priority: **Ocean / P1**
- Module: `ocean/ocean-state.js`
- Formula/Rule: `speed=sqrt(u^2+v^2); direction=atan2(u,v)`
- Inputs: u, v
- Outputs: speed, direction
- Guardrails: No U/V means no flow direction
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-OCN-002 · Wave visual exaggeration
- Domain / Priority: **Ocean / P1**
- Module: `ocean/wave-engine.js`
- Formula/Rule: `display=min(cap,Hs*visualExaggeration)`
- Inputs: significant wave height
- Outputs: display height, exaggeration
- Guardrails: Clearly labeled as visualization, not fluid simulation
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-OCN-003 · Deep-water swell ETA foundation
- Domain / Priority: **Ocean / P1**
- Module: `ocean/swell-arrival.js`
- Formula/Rule: `group velocity=g*T/(4*pi); eta=distance/cg`
- Inputs: distance, period
- Outputs: group velocity, arrival time
- Guardrails: Nearshore refraction/shoaling not included
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-OCN-004 · Sea-level residual
- Domain / Priority: **Ocean / P1**
- Module: `ocean/tide-sea-level.js`
- Formula/Rule: `residual=observed-astronomical prediction`
- Inputs: observed level, predicted tide
- Outputs: residual
- Guardrails: Observed/predicted/residual kept separate
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-OCN-005 · SST front gradient
- Domain / Priority: **Ocean / P1**
- Module: `ocean/sst-features.js`
- Formula/Rule: `central-difference gradient magnitude threshold`
- Inputs: SST grid
- Outputs: front candidates
- Guardrails: Derived feature, not official ocean-front label
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-OCN-006 · Coastal exposure score
- Domain / Priority: **Ocean / P1**
- Module: `ocean/coastal-exposure.js`
- Formula/Rule: `bounded weighted wave+swell+tide residual+wind; official warning hard gate`
- Inputs: marine conditions, warning
- Outputs: risk state, score
- Guardrails: Official warning overrides score
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-OPS-001 · Provider health state
- Domain / Priority: **Operations / P0**
- Module: `ops/provider-health.js`
- Formula/Rule: `auth/schema/quota gates then freshness and failure thresholds`
- Inputs: last success/SLA/failures
- Outputs: health state
- Guardrails: Do not equate job success with source freshness
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-OPS-002 · Exponential backoff
- Domain / Priority: **Operations / P1**
- Module: `ops/provider-health.js`
- Formula/Rule: `min(max, base*2^attempt)*(1+jitter)`
- Inputs: attempt/rates
- Outputs: delay
- Guardrails: No retry for auth/parameter errors at adapter layer
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-OPS-003 · Cost-to-value schedule
- Domain / Priority: **Operations / P1**
- Module: `ops/cost-observability.js`
- Formula/Rule: `value/cost efficiency with hard safety override`
- Inputs: cost/users/value/budget
- Outputs: RUN/DOWNSAMPLE/DEFER
- Guardrails: Safety-critical jobs cannot be deferred for cost
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-OPS-004 · Observation gap lens
- Domain / Priority: **Operations / P1**
- Module: `ops/observation-gap.js`
- Formula/Rule: `observed coverage + station density + freshness + resolution + model coverage`
- Inputs: coverage metrics
- Outputs: knowledge/model-dependence state
- Guardrails: Data absence is not risk absence
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-OPS-005 · Fail-soft scene selection
- Domain / Priority: **Operations / P1**
- Module: `core/fail-soft-scene.js`
- Formula/Rule: `select truthful fallback from data state, vector/grid availability, device and thermal constraints`
- Inputs: requested engine, data state, capabilities, thermal state
- Outputs: fallback scene plan
- Guardrails: Never invent direction, grid or safety state
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-OPS-006 · Job DAG topological execution
- Domain / Priority: **Ops / P1**
- Module: `ops/job-dag.js`
- Formula/Rule: `Kahn topological order over explicit dependencies`
- Inputs: job graph
- Outputs: execution order, runnable jobs
- Guardrails: Unknown dependency/cycle fails closed
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-OPS-007 · Dead-letter recovery classification
- Domain / Priority: **Ops / P1**
- Module: `ops/dead-letter-recovery.js`
- Formula/Rule: `retry only retryable error + idempotency + attempts < max; else quarantine`
- Inputs: dead-letter messages
- Outputs: RETRY/QUARANTINE plan
- Guardrails: No replay without idempotency key
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-OPS-008 · Freshness SLO state
- Domain / Priority: **Ops / P1**
- Module: `ops/freshness-slo.js`
- Formula/Rule: `age <= live => LIVE; <= stale => STALE; else UNAVAILABLE`
- Inputs: reference time, SLO
- Outputs: freshness state, age
- Guardrails: Collector success does not imply LIVE data
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-OPS-009 · Safe rollback planner
- Domain / Priority: **Ops / P1**
- Module: `ops/rollback-engine.js`
- Formula/Rule: `rollback allowed only with verified rollback artifact and reversible data boundary`
- Inputs: current/previous version, migration state
- Outputs: rollback steps, blockers
- Guardrails: No automatic production rollback
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-OPS-010 · Performance acceptance compiler
- Domain / Priority: **Ops / P1**
- Module: `ops/performance-lab.js`
- Formula/Rule: `min FPS + p95 frame + memory growth + thermal maxima against budgets`
- Inputs: runtime samples, budgets
- Outputs: PASS/FAIL, metrics
- Guardrails: Pure unit tests do not substitute real-device samples
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-OPS-011 · New-engine reuse enforcement
- Domain / Priority: **Ops / P0**
- Module: `ops/engine-reuse-enforcer.js`
- Formula/Rule: `catalog capability-token similarity + mandatory repository/catalog/gap evidence`
- Inputs: new-engine proposal, catalog, gap evidence
- Outputs: BLOCK_NEW_ENGINE or reviewable NEW
- Guardrails: Convenience is not a reason to duplicate engines
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-PAY-001 · Entitlement resolution
- Domain / Priority: **Paid / P0**
- Module: `paid/entitlement.js`
- Formula/Rule: `tier rank + country + rights + quota + safety exception`
- Inputs: user/tier/feature
- Outputs: ALLOW/PREVIEW/DENY
- Guardrails: Official safety always free
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-PAY-002 · Country readiness
- Domain / Priority: **Paid / P1**
- Module: `paid/country-unlock.js`
- Formula/Rule: `weighted data/license/visual/performance/QA/terrain/localization`
- Inputs: country gates
- Outputs: score/blockers
- Guardrails: Funding alone cannot open a country
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-PAY-003 · Offline trip pack selection
- Domain / Priority: **Paid / VNEXT**
- Module: `paid/offline-trip-pack.js`
- Formula/Rule: `priority-first bounded packing with official safety override`
- Inputs: trip range, assets, entitlement, byte budget
- Outputs: offline pack plan
- Guardrails: Official safety assets are never excluded by premium status
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-PAY-004 · Personal context minimization
- Domain / Priority: **Paid / P1**
- Module: `paid/personal-context.js`
- Formula/Rule: `allowlist context fields only after explicit consent`
- Inputs: user context, consent
- Outputs: minimal context, dropped fields
- Guardrails: Precise movement/user secrets are not accepted by default
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-PAY-005 · Comparison semantic normalization
- Domain / Priority: **Paid / P1**
- Module: `paid/comparison.js`
- Formula/Rule: `comparison requires same variable/unit; large resolution mismatch is disclosed`
- Inputs: comparison items
- Outputs: comparable result or block reason
- Guardrails: No misleading cross-variable/unit comparison
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-PAY-006 · Scenario entitlement gate
- Domain / Priority: **Paid / P2**
- Module: `paid/scenario.js`
- Formula/Rule: `Control/Business + quota + no LIVE mutation`
- Inputs: plan, quota, scenario request
- Outputs: allow/deny
- Guardrails: Official safety remains outside paywall
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-PAY-007 · Subscription state transition
- Domain / Priority: **Paid / P1**
- Module: `paid/subscription-state.js`
- Formula/Rule: `explicit finite-state transition table`
- Inputs: current state, billing event
- Outputs: next state or invalid transition
- Guardrails: No implicit entitlement from UI state
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-PAY-008 · Premium analysis cache key
- Domain / Priority: **Paid / P1**
- Module: `paid/premium-cache.js`
- Formula/Rule: `feature+country+versioned user scope/context fingerprint`
- Inputs: feature, country, context, engine versions
- Outputs: cache key
- Guardrails: Entitlement is still checked outside cache
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-QA-001 · Required launch-gate compilation
- Domain / Priority: **Quality / P0**
- Module: `qa/launch-gate.js`
- Formula/Rule: `required FAIL => FAIL; else required UNKNOWN => UNKNOWN; else PASS`
- Inputs: gate states
- Outputs: release state
- Guardrails: UNKNOWN required evidence blocks completion
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-QA-002 · Completion evidence gate
- Domain / Priority: **Quality / P0**
- Module: `qa/completion-evidence.js`
- Formula/Rule: `DONE only if engine/algorithm IDs + actual data + runtime + browser/device + tests + visual + performance + dispose + regression + no-duplicate evidence pass`
- Inputs: completion evidence
- Outputs: DONE_EVIDENCE_ACCEPTED/NOT_DONE
- Guardrails: File/class/interface existence alone is never completion
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-SEC-001 · Secret query redaction
- Domain / Priority: **Security / P0**
- Module: `security/redaction.js`
- Formula/Rule: `replace known secret query keys/values with [REDACTED]`
- Inputs: URL/text, secret aliases
- Outputs: redacted representation
- Guardrails: Never log original secret
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-SEC-002 · Token-bucket abuse control
- Domain / Priority: **Security / P1**
- Module: `security/abuse-guard.js`
- Formula/Rule: `capacity + time-based refill - request cost`
- Inputs: requests, time
- Outputs: allow/deny, retry-after
- Guardrails: Protect cost surface without changing safety truth
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-SPC-001 · Launch lifecycle state machine
- Domain / Priority: **Space / P2**
- Module: `space/launch-event.js`
- Formula/Rule: `validated state transitions with telemetry evidence gate`
- Inputs: launch state, evidence
- Outputs: next state
- Guardrails: No ascent/success/failure progress without evidence
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-STO-001 · Archive deletion proof
- Domain / Priority: **Storage / P1**
- Module: `storage/archive-verification.js`
- Formula/Rule: `all checksum/count/size/snapshot/grace/shadow checks must pass`
- Inputs: S3/NAS evidence
- Outputs: DELETE_ELIGIBLE/BLOCKED
- Guardrails: No date-only deletion
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-STO-002 · Cloud delta keyframe plan
- Domain / Priority: **Storage / P1**
- Module: `storage/delta-pack.js`
- Formula/Rule: `keyframes + delta frames; estimate saving and random access penalty`
- Inputs: frame count/size/ratio
- Outputs: pack plan
- Guardrails: Use only after reconstruction validation
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-STO-003 · Replay rehydration compatibility
- Domain / Priority: **Storage / P2**
- Module: `storage/replay-rehydration.js`
- Formula/Rule: `select overlapping archive chunks only after processor/schema compatibility checks`
- Inputs: archive manifest, region/time request, supported versions
- Outputs: rehydration plan
- Guardrails: Never serve directly from NAS
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-STO-004 · Archive package manifest plan
- Domain / Priority: **Storage / P1**
- Module: `storage/archive-packager.js`
- Formula/Rule: `archive id from dataset/region/time/schema/processor/record contract`
- Inputs: archive metadata
- Outputs: archive manifest plan
- Guardrails: Rendered voxels are not the canonical long-term source
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-STO-005 · NAS outbound pull state machine
- Domain / Priority: **Storage / P1**
- Module: `storage/nas-archive-agent.js`
- Formula/Rule: `COPY_PENDING -> COPYING -> VERIFYING -> NAS_VERIFIED; failure returns retry state`
- Inputs: archive job, events
- Outputs: archive transfer state
- Guardrails: LIVE service never directly reads NAS
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-STO-006 · Archive catalog time lookup
- Domain / Priority: **Storage / P1**
- Module: `storage/archive-catalog.js`
- Formula/Rule: `filter archive metadata by dataset/region and inclusive time range`
- Inputs: catalog, query
- Outputs: matching archives
- Guardrails: Catalog online even when NAS offline
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-VIS-001 · Bounded logarithmic tower mapping
- Domain / Priority: **Visual / P0**
- Module: `visual/tower.js`
- Formula/Rule: `height = hMin + boundedLog(value/p95)*(hMax-hMin)`
- Inputs: value, distribution
- Outputs: height/opacity
- Guardrails: Original value remains visible
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-VIS-002 · Mass-preserving estimated distribution
- Domain / Priority: **Visual / P1**
- Module: `visual/tower.js`
- Formula/Rule: `cell_i = total*w_i/sum(w), integer remainder by largest fraction`
- Inputs: aggregate total, approved weights
- Outputs: estimated cells
- Guardrails: Sum must exactly equal provider total; estimated badge
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-VIS-003 · Bilinear vector sampling
- Domain / Priority: **Visual / P1**
- Module: `visual/flow.js`
- Formula/Rule: `bilinear interpolate U/V over four grid cells`
- Inputs: vector grid, normalized coordinate
- Outputs: U/V vector
- Guardrails: Missing vector returns null
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-VIS-004 · Adaptive volume render policy
- Domain / Priority: **Visual / P1**
- Module: `visual/volume.js`
- Formula/Rule: `mode/resolution/ray steps from device, thermal, confidence, uncertainty, horizon`
- Inputs: device, thermal, confidence, uncertainty
- Outputs: shell/volume policy
- Guardrails: Mobile and ECO avoid heavy volume
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-VIS-010 · Semantic label budget
- Domain / Priority: **Visual / P1**
- Module: `visual/label-budget.js`
- Formula/Rule: `priority=safety>selected>primary>context>decorative`
- Inputs: candidate labels, device cap
- Outputs: visible labels
- Guardrails: Safety cannot be evicted by decorative labels
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-VIS-011 · Semantic material grammar
- Domain / Priority: **Visual / P1**
- Module: `visual/material-grammar.js`
- Formula/Rule: `domain+evidence+selection+thermal => material tokens`
- Inputs: scene state
- Outputs: material tokens
- Guardrails: Risk/scenario semantics reserved
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-WX-001 · Skill-weighted model ensemble
- Domain / Priority: **Weather / P1**
- Module: `weather/ensemble.js`
- Formula/Rule: `weighted mean; spread from weighted variance`
- Inputs: model members, skill/freshness weights
- Outputs: consensus/spread/agreement
- Guardrails: No public probability before calibration
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-WX-002 · Local bias correction
- Domain / Priority: **Weather / P1**
- Module: `weather/ensemble.js`
- Formula/Rule: `corrected = raw - bias(location,variable,lead,regime)`
- Inputs: forecast, bias
- Outputs: corrected forecast
- Guardrails: Promote after shadow backtest
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-WX-003 · Semi-Lagrangian nowcast
- Domain / Priority: **Weather / P1**
- Module: `weather/nowcast.js`
- Formula/Rule: `field(t+dt)=sample(field, x-u*dt, y-v*dt)+growth-decay`
- Inputs: field, vector field
- Outputs: advected field
- Guardrails: Lead-time validation required
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-WX-004 · Evidence-backed claim gate
- Domain / Priority: **Weather / P1**
- Module: `weather/evidence-graph.js`
- Formula/Rule: `claim allowed only when required evidence count/confidence and counter evidence rules pass`
- Inputs: claim rules, evidence
- Outputs: allow/block + confidence
- Guardrails: No invented numbers or unsupported causal claims
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-WX-005 · Precipitation observed blend
- Domain / Priority: **Weather / P1**
- Module: `weather/precipitation.js`
- Formula/Rule: `quality-weighted radar+gauge+model, observed sources define state`
- Inputs: radar/gauge/model rates
- Outputs: rate/intensity/state
- Guardrails: Cloud and precipitation are separate
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-WX-006 · Rain/snow phase foundation
- Domain / Priority: **Weather / P1**
- Module: `weather/precipitation.js`
- Formula/Rule: `wet-bulb + warm/cold layer depth rules`
- Inputs: temperature profile
- Outputs: phase/confidence
- Guardrails: Explicit uncertainty
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-WX-007 · Forecast gap / Early Signal
- Domain / Priority: **Weather / P1**
- Module: `weather/forecast-gap.js`
- Formula/Rule: `gap=consensus-official; require persistence, agreement, skill`
- Inputs: official forecast, model consensus
- Outputs: NONE/WATCH/EARLY_SIGNAL
- Guardrails: Official warning always wins
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-WX-008 · Moisture source contribution
- Domain / Priority: **Weather / P1**
- Module: `weather/moisture-attribution.js`
- Formula/Rule: `trajectory + flux convergence + TPW + ascent + SST support + radar growth - dry-air counter`
- Inputs: multi-signal evidence
- Outputs: contribution score/state
- Guardrails: SST alone cannot establish cause
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-WX-009 · Weather detail section compiler
- Domain / Priority: **Weather / P1**
- Module: `weather/weather-detail-ia.js`
- Formula/Rule: `fixed CURRENT -> BRIEF -> HOURLY -> 10DAY -> PRECIP/RADAR -> DETAILS -> AQI -> ALERTS -> DEEP order`
- Inputs: available sections, plan
- Outputs: section/access manifest
- Guardrails: Information order inspired by usability, not copied UI
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-WX-010 · Weather truth-class fusion
- Domain / Priority: **Weather / P1**
- Module: `weather/weather-spatiotemporal-fusion.js`
- Formula/Rule: `spatiotemporal alignment + separate official/Earthus/model partitions`
- Inputs: weather canonical signals
- Outputs: weather snapshot
- Guardrails: Truth classes are not merged into one source type
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-WX-011 · Weather event evidence detector
- Domain / Priority: **Weather / P1**
- Module: `weather/weather-event-detector.js`
- Formula/Rule: `threshold/compound signatures produce candidate evidence only`
- Inputs: precipitation, pressure tendency, CAPE, convergence
- Outputs: event evidence candidates
- Guardrails: Never self-declare official warning
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-WX-012 · Cyclone remnant interaction support score
- Domain / Priority: **Weather / P1**
- Module: `weather/cyclone-remnant-interaction.js`
- Formula/Rule: `weighted proximity+moisture+front+jet+ascent+freshness support`
- Inputs: remnant/moisture/front/jet/ascent
- Outputs: support band, causal-claim gate
- Guardrails: Causal claim needs multi-signal support
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-WX-013 · Weather action hard-gate ranking
- Domain / Priority: **Weather / P1**
- Module: `weather/weather-action-intelligence.js`
- Formula/Rule: `official gates exclude windows before score/confidence ranking`
- Inputs: official gates, candidate windows, activity
- Outputs: recommended window/alternatives
- Guardrails: Convenience never overrides official safety
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-WX-014 · Weather forecast verification metrics
- Domain / Priority: **Weather / P1**
- Module: `weather/weather-modelops.js`
- Formula/Rule: `MAE/RMSE/bias over forecast-ground truth pairs`
- Inputs: forecast/actual records
- Outputs: metrics, promotion gate
- Guardrails: No promotion without calibration and rollback readiness
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-WX-015 · Ensemble scenario medoid clustering
- Domain / Priority: **Weather / P1**
- Module: `weather/forecast-scenario-cluster.js`
- Formula/Rule: `deterministic k-medoid-like clustering using RMS member-vector distance`
- Inputs: ensemble member trajectories
- Outputs: representative scenarios, member proportions
- Guardrails: Scenario probability is member share, not official probability
- Status: **IMPLEMENTED_FOUNDATION**

## ALG-WX-016 · Official-vs-derived forecast reconciliation
- Domain / Priority: **Weather / P1**
- Module: `weather/forecast-reconciliation.js`
- Formula/Rule: `derived consensus gap vs official; Early Signal only with divergence+persistence+calibration`
- Inputs: official, ensemble, Earthus, persistence, calibration
- Outputs: ALIGNED/DIVERGENT, Early Signal
- Guardrails: Official baseline is never overwritten
- Status: **IMPLEMENTED_FOUNDATION**
