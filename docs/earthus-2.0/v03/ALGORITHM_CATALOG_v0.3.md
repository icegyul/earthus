# EARTHUS 2.0 Algorithm Catalog v0.3

- Total algorithms: **83**
- New in v0.3: **30**

## Analytics

### ALG-ANA-001 · Alert effectiveness metrics
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `analytics/alert-effectiveness.js`
- Formula: `opened/sent and acted/sent`
- Inputs: notification events
- Outputs: open rate, action rate
- Guardrails: Delivery/open/action states are not inferred

### ALG-ANA-002 · Engine cost attribution
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `analytics/cost-attribution.js`
- Formula: `sum compute+storage+egress+request cost by engine`
- Inputs: cost rows
- Outputs: engine cost map
- Guardrails: Safety collection cannot be disabled solely by cost

## Cloud

### ALG-CLD-001 · Satellite product/tile source score
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `cloud/satellite-product-broker.js`
- Formula: `regional preference + freshness + resolution + angle + time + channel + parallax + reliability + cost`
- Inputs: satellite products/tile/time
- Outputs: primary/secondary/calibration
- Guardrails: Eligibility gates for rights, health, day/night and missing tiles

### ALG-CLD-002 · Cloud-top retrieval
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `cloud/cloud-state.js`
- Formula: `argmin_z |T_profile(z)-BT_IR| + correction/uncertainty`
- Inputs: IR brightness temp, NWP profile
- Outputs: top height + uncertainty
- Guardrails: Parallax and limb flags

### ALG-CLD-003 · Cloud-base retrieval
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `cloud/cloud-state.js`
- Formula: `first persistent RH/cloud-fraction layer, blended with LCL or ceilometer`
- Inputs: RH/cloud profile, LCL, ceilometer
- Outputs: base height + state
- Guardrails: Estimated unless directly observed

### ALG-CLD-004 · Multilayer detection
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `cloud/cloud-state.js`
- Formula: `persistent cloud-fraction intervals above threshold`
- Inputs: vertical cloud profile
- Outputs: layers/multilayer flag
- Guardrails: Thin/ambiguous layers retain flags

### ALG-CLD-005 · Cloud density profile
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `cloud/cloud-state.js`
- Formula: `weighted cloud fraction + RH + optical depth + mask + condensate - uncertainty`
- Inputs: layer variables
- Outputs: density 0..1
- Guardrails: Store state, not rendered voxel texture

### ALG-CLD-006 · Observation/model/ensemble horizon blend
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `cloud/cloud-forecast.js`
- Formula: `alpha(h)*obs + beta(h)*deterministic + gamma(h)*ensemble`
- Inputs: cloud states, horizon
- Outputs: 0-10d state
- Guardrails: 7d+ becomes probabilistic and soft

### ALG-CLD-007 · Cloud uncertainty visual mapping
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `cloud/cloud-render-policy.js`
- Formula: `opacity/detail decrease and blur increases with uncertainty/horizon`
- Inputs: confidence, uncertainty, horizon
- Outputs: render policy
- Guardrails: Long range must not look current

### ALG-CLD-008 · Procedural cloud detail budget
- Priority / status: **P2 / IMPLEMENTED_FOUNDATION**
- Module: `cloud/procedural-detail.js`
- Formula: `detail = confidence*(1-uncertainty)*device*thermal*horizon scale`
- Inputs: cloud state quality, device, thermal, horizon
- Outputs: deterministic visual-only detail plan
- Guardrails: May not change meteorological coverage or meaning

## Core

### ALG-CORE-001 · Canonical signal fingerprint
- Priority / status: **P0 / IMPLEMENTED_FOUNDATION**
- Module: `core/canonical-signal.js`
- Formula: `fingerprint = FNV1a64(stable canonical signal without signalId)`
- Inputs: canonical signal
- Outputs: stable fingerprint
- Guardrails: No secret/raw payload inclusion

### ALG-CORE-002 · Cross-domain confidence
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `core/confidence.js`
- Formula: `weighted quality components with mandatory-source caps`
- Inputs: freshness, coverage, agreement, historical accuracy, mapping, stability
- Outputs: confidence + band + reason codes
- Guardrails: Missing mandatory source caps result

### ALG-CORE-003 · Truth budget
- Priority / status: **P0 / IMPLEMENTED_FOUNDATION**
- Module: `core/truth-budget.js`
- Formula: `max fidelity = min(evidence, resolution, confidence, rights, device, thermal)`
- Inputs: evidence, resolution, confidence, rights, device
- Outputs: allowed visual fidelity
- Guardrails: No fine tower without actual grid

### ALG-CORE-004 · Trust ledger status
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `core/trust-ledger.js`
- Formula: `support/counter evidence count and confidence produce SUPPORTED/CONTESTED/UNSUPPORTED`
- Inputs: support evidence, counter evidence
- Outputs: trust ledger
- Guardrails: Every evidence item keeps source, time and provenance

## Data Plane

### ALG-DAT-001 · Bilinear grid resampling
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `data/reprojection-resampling.js`
- Formula: `bilinear interpolation in normalized grid coordinates`
- Inputs: source grid, target size
- Outputs: resampled grid
- Guardrails: Dataset requiring conservative mass preservation must use a dataset-specific conservative method

### ALG-DAT-002 · Canonical time-slice selection
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `data/time-slice.js`
- Formula: `nearest valid frame within max staleness window`
- Inputs: records, target time, max age
- Outputs: canonical frame or null
- Guardrails: Evidence modes cannot mix implicitly

### ALG-DAT-003 · Bounded scalar quantization
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `data/tile-compiler.js`
- Formula: `map finite min..max to Qbits with reserved no-data code`
- Inputs: scalar values, bit depth
- Outputs: quantized values, min/max metadata
- Guardrails: No-data remains explicit

### ALG-DAT-004 · Revision fingerprint and classification
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `data/revision-engine.js`
- Formula: `stable object fingerprint; same-time change => provider revision`
- Inputs: previous, next
- Outputs: revision state, fingerprints
- Guardrails: Provider revision is not a new observation time

### ALG-DAT-005 · Adaptive frame prefetch
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `data/adaptive-prefetch.js`
- Formula: `bounded forward/back window from playback/network/memory state`
- Inputs: frame index, network, memory
- Outputs: prefetch frame ids
- Guardrails: No unbounded background download

## Geo

### ALG-GEO-001 · Antimeridian-safe bounds
- Priority / status: **P0 / IMPLEMENTED_FOUNDATION**
- Module: `geo/geospatial-reference.js`
- Formula: `unwrap longitudes and choose minimum span`
- Inputs: GeoJSON geometry
- Outputs: bounds/centroid/date-line flag
- Guardrails: Polygon and MultiPolygon only for containment

### ALG-GEO-002 · Country camera fit
- Priority / status: **P0 / IMPLEMENTED_FOUNDATION**
- Module: `geo/country-focus.js`
- Formula: `camera height proportional to geodesic diameter and viewport aspect`
- Inputs: country geometry, viewport
- Outputs: camera + dimming + clipping
- Guardrails: No global high-resolution download

### ALG-GEO-003 · Terrain source score
- Priority / status: **P0 / IMPLEMENTED_FOUNDATION**
- Module: `geo/terrain-source-broker.js`
- Formula: `resolution + freshness + continuity + datum + cost + regional priority`
- Inputs: terrain sources, region/zoom
- Outputs: primary/fallback source
- Guardrails: Rights/coverage/health are eligibility gates

### ALG-GEO-004 · Screen-space terrain LOD
- Priority / status: **P0 / IMPLEMENTED_FOUNDATION**
- Module: `geo/terrain-lod.js`
- Formula: `SSE = geometricError*viewportHeight/(2*distance*tan(FOV/2))`
- Inputs: tile error, camera distance, viewport
- Outputs: selected LOD
- Guardrails: Tile budget cap

### ALG-GEO-005 · Terrain/data morph
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `geo/terrain-data-morph.js`
- Formula: `displayZ = lerp(terrainZ, terrainZ + normalizedData*reliefScale, mix)`
- Inputs: terrain elevation, normalized data
- Outputs: display elevation
- Guardrails: Raw values unchanged and capped

## Hazard

### ALG-HAZ-001 · Official warning precedence merge
- Priority / status: **P0 / IMPLEMENTED_FOUNDATION**
- Module: `hazards/warning-engine.js`
- Formula: `official first, then severity, then latest issue time`
- Inputs: warnings
- Outputs: primary warning, active list
- Guardrails: Earthus cannot downgrade active official warning

### ALG-HAZ-002 · Hypocenter depth visual mapping
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `hazards/earthquake-depth.js`
- Formula: `display radius=Earth radius-depth*bounded exaggeration`
- Inputs: depth, magnitude
- Outputs: 3D depth placement
- Guardrails: Not P/S wave propagation

### ALG-HAZ-003 · Seismic context clustering
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `hazards/earthquake-depth.js`
- Formula: `spatiotemporal radius grouping`
- Inputs: earthquakes
- Outputs: context clusters
- Guardrails: Not aftershock prediction

### ALG-HAZ-004 · Lightning centroid tracking
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `hazards/lightning-track.js`
- Formula: `spatial cluster then nearest-centroid matching`
- Inputs: lightning points
- Outputs: cell clusters, motion evidence
- Guardrails: Motion is estimated

### ALG-HAZ-005 · Wildfire hotspot clustering
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `hazards/wildfire-smoke.js`
- Formula: `spatiotemporal hotspot radius grouping`
- Inputs: thermal hotspots
- Outputs: hotspot clusters
- Guardrails: Cluster is not burn perimeter

### ALG-HAZ-006 · Cyclone agency resolver
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `hazards/cyclone-resolver.js`
- Formula: `region-specific official agency priority; preserve alternates`
- Inputs: agency tracks, region
- Outputs: primary, alternates
- Guardrails: Never average official agency tracks

## Human Flow

### ALG-HF-001 · Density
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `human-flow/algorithms.js`
- Formula: `raw_density = population/effective_area`
- Inputs: population estimate, validated area
- Outputs: density
- Guardrails: Unknown area -> UNKNOWN

### ALG-HF-002 · Calibrated crowd index
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `human-flow/algorithms.js`
- Formula: `weighted percentile + relative ratio + robust z + official level`
- Inputs: density history, official level
- Outputs: 0-100 index
- Guardrails: Official level has UI/safety precedence

### ALG-HF-003 · Persistent trend
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `human-flow/algorithms.js`
- Formula: `EWMA + Theil-Sen slope + persistence filter`
- Inputs: time series
- Outputs: trend/slope/acceleration
- Guardrails: Single spike cannot create trend

### ALG-HF-004 · Evidence-limited scalar flow
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `human-flow/algorithms.js`
- Formula: `in=max(0,delta)/dt; out=max(0,-delta)/dt`
- Inputs: population series
- Outputs: in/out rate
- Guardrails: No direction without OD/graph evidence

### ALG-HF-005 · Explainable crowd forecast v0
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `human-flow/algorithms.js`
- Formula: `baseline + trend + event + weather + mobility + provider factor`
- Inputs: feature snapshot
- Outputs: forecast + contributions
- Guardrails: Provider and Earthus forecasts remain distinct

### ALG-HF-006 · Robust anomaly
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `human-flow/algorithms.js`
- Formula: `abs(current-seasonalMedian)/(1.4826*MAD) with persistence`
- Inputs: current/history/events
- Outputs: anomaly state
- Guardrails: Anomaly is not automatically a disaster

### ALG-HF-007 · Validated capacity pressure
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `human-flow/algorithms.js`
- Formula: `occupancy/validated_capacity`
- Inputs: occupancy, validated capacity
- Outputs: pressure
- Guardrails: Never infer legal capacity from area

### ALG-HF-008 · Risk hard gate
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `human-flow/algorithms.js`
- Formula: `max(official,weather,crowd,capacity,bottleneck)+reliability penalty`
- Inputs: risk signals
- Outputs: SAFE/CAUTION/WARNING/CRITICAL/UNKNOWN
- Guardrails: Official emergency overrides score

### ALG-HF-009 · Shortest path with status/capacity penalties
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `human-flow/spatial-graph.js`
- Formula: `Dijkstra over verified typed edges`
- Inputs: spatial graph
- Outputs: path/cost
- Guardrails: Closed or inaccessible edges excluded

### ALG-HF-010 · Forecast verification metrics
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `human-flow/forecast-lifecycle.js`
- Formula: `error=actual-predicted; MAE/RMSE/bias by filters`
- Inputs: forecast, actual
- Outputs: metrics
- Guardrails: Every forecast keeps issued/target/model version

## Hydrology

### ALG-HYD-001 · SCS runoff foundation
- Priority / status: **P2 / IMPLEMENTED_FOUNDATION**
- Module: `hydrology/runoff-routing.js`
- Formula: `Q=(P-Ia)^2/(P+(1-lambda)S)`
- Inputs: precipitation, curve number
- Outputs: runoff mm
- Guardrails: Requires basin calibration; scenario only

### ALG-HYD-002 · Linear reservoir routing foundation
- Priority / status: **P2 / IMPLEMENTED_FOUNDATION**
- Module: `hydrology/runoff-routing.js`
- Formula: `outflow=storage/K; storage+=inflow-outflow`
- Inputs: inflow, storage, K
- Outputs: outflow/storage
- Guardrails: Replace/validate per basin

## Intelligence

### ALG-INT-001 · Cross-domain Pearson association
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `intelligence/correlation.js`
- Formula: `Pearson r with minimum valid pair count`
- Inputs: aligned series
- Outputs: r, n
- Guardrails: Correlation is not causation

### ALG-INT-002 · Analog feature distance
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `intelligence/analog-retrieval.js`
- Formula: `weighted normalized Euclidean distance`
- Inputs: target features, historical cases
- Outputs: ranked analogs
- Guardrails: Expose feature basis and distance

### ALG-INT-003 · Regime classifier foundation
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `intelligence/regime-detector.js`
- Formula: `coefficient of variation + normalized end-to-end slope`
- Inputs: time series
- Outputs: stable/rising/falling/volatile
- Guardrails: Domain thresholds remain configurable

### ALG-INT-004 · Route exposure integration
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `intelligence/route-exposure.js`
- Formula: `length-weighted hazard intensity with official gates`
- Inputs: route segments, signals
- Outputs: route exposure
- Guardrails: Official closure/warning overrides score

### ALG-INT-005 · Decision contribution ranking
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `intelligence/decision-explanation.js`
- Formula: `rank absolute contribution; hard gate first`
- Inputs: decision, contributions, gates
- Outputs: primary reason, ranked factors
- Guardrails: No unexplained recommendation

## ModelOps

### ALG-HF-011 · Champion/challenger
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `human-flow/forecast-lifecycle.js`
- Formula: `relative MAE improvement + calibration improvement`
- Inputs: champion/challenger metrics
- Outputs: promotion decision
- Guardrails: No promotion on accuracy alone

## Ocean

### ALG-OCN-001 · Ocean vector magnitude/direction
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `ocean/ocean-state.js`
- Formula: `speed=sqrt(u^2+v^2); direction=atan2(u,v)`
- Inputs: u, v
- Outputs: speed, direction
- Guardrails: No U/V means no flow direction

### ALG-OCN-002 · Wave visual exaggeration
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `ocean/wave-engine.js`
- Formula: `display=min(cap,Hs*visualExaggeration)`
- Inputs: significant wave height
- Outputs: display height, exaggeration
- Guardrails: Clearly labeled as visualization, not fluid simulation

### ALG-OCN-003 · Deep-water swell ETA foundation
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `ocean/swell-arrival.js`
- Formula: `group velocity=g*T/(4*pi); eta=distance/cg`
- Inputs: distance, period
- Outputs: group velocity, arrival time
- Guardrails: Nearshore refraction/shoaling not included

### ALG-OCN-004 · Sea-level residual
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `ocean/tide-sea-level.js`
- Formula: `residual=observed-astronomical prediction`
- Inputs: observed level, predicted tide
- Outputs: residual
- Guardrails: Observed/predicted/residual kept separate

### ALG-OCN-005 · SST front gradient
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `ocean/sst-features.js`
- Formula: `central-difference gradient magnitude threshold`
- Inputs: SST grid
- Outputs: front candidates
- Guardrails: Derived feature, not official ocean-front label

### ALG-OCN-006 · Coastal exposure score
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `ocean/coastal-exposure.js`
- Formula: `bounded weighted wave+swell+tide residual+wind; official warning hard gate`
- Inputs: marine conditions, warning
- Outputs: risk state, score
- Guardrails: Official warning overrides score

## Operations

### ALG-OPS-001 · Provider health state
- Priority / status: **P0 / IMPLEMENTED_FOUNDATION**
- Module: `ops/provider-health.js`
- Formula: `auth/schema/quota gates then freshness and failure thresholds`
- Inputs: last success/SLA/failures
- Outputs: health state
- Guardrails: Do not equate job success with source freshness

### ALG-OPS-002 · Exponential backoff
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `ops/provider-health.js`
- Formula: `min(max, base*2^attempt)*(1+jitter)`
- Inputs: attempt/rates
- Outputs: delay
- Guardrails: No retry for auth/parameter errors at adapter layer

### ALG-OPS-003 · Cost-to-value schedule
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `ops/cost-observability.js`
- Formula: `value/cost efficiency with hard safety override`
- Inputs: cost/users/value/budget
- Outputs: RUN/DOWNSAMPLE/DEFER
- Guardrails: Safety-critical jobs cannot be deferred for cost

### ALG-OPS-004 · Observation gap lens
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `ops/observation-gap.js`
- Formula: `observed coverage + station density + freshness + resolution + model coverage`
- Inputs: coverage metrics
- Outputs: knowledge/model-dependence state
- Guardrails: Data absence is not risk absence

### ALG-OPS-005 · Fail-soft scene selection
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `core/fail-soft-scene.js`
- Formula: `select truthful fallback from data state, vector/grid availability, device and thermal constraints`
- Inputs: requested engine, data state, capabilities, thermal state
- Outputs: fallback scene plan
- Guardrails: Never invent direction, grid or safety state

## Paid

### ALG-PAY-001 · Entitlement resolution
- Priority / status: **P0 / IMPLEMENTED_FOUNDATION**
- Module: `paid/entitlement.js`
- Formula: `tier rank + country + rights + quota + safety exception`
- Inputs: user/tier/feature
- Outputs: ALLOW/PREVIEW/DENY
- Guardrails: Official safety always free

### ALG-PAY-002 · Country readiness
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `paid/country-unlock.js`
- Formula: `weighted data/license/visual/performance/QA/terrain/localization`
- Inputs: country gates
- Outputs: score/blockers
- Guardrails: Funding alone cannot open a country

### ALG-PAY-003 · Offline trip pack selection
- Priority / status: **VNEXT / IMPLEMENTED_FOUNDATION**
- Module: `paid/offline-trip-pack.js`
- Formula: `priority-first bounded packing with official safety override`
- Inputs: trip range, assets, entitlement, byte budget
- Outputs: offline pack plan
- Guardrails: Official safety assets are never excluded by premium status

## Quality

### ALG-QA-001 · Required launch-gate compilation
- Priority / status: **P0 / IMPLEMENTED_FOUNDATION**
- Module: `qa/launch-gate.js`
- Formula: `required FAIL => FAIL; else required UNKNOWN => UNKNOWN; else PASS`
- Inputs: gate states
- Outputs: release state
- Guardrails: UNKNOWN required evidence blocks completion

## Security

### ALG-SEC-001 · Secret query redaction
- Priority / status: **P0 / IMPLEMENTED_FOUNDATION**
- Module: `security/redaction.js`
- Formula: `replace known secret query keys/values with [REDACTED]`
- Inputs: URL/text, secret aliases
- Outputs: redacted representation
- Guardrails: Never log original secret

### ALG-SEC-002 · Token-bucket abuse control
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `security/abuse-guard.js`
- Formula: `capacity + time-based refill - request cost`
- Inputs: requests, time
- Outputs: allow/deny, retry-after
- Guardrails: Protect cost surface without changing safety truth

## Space

### ALG-SPC-001 · Launch lifecycle state machine
- Priority / status: **P2 / IMPLEMENTED_FOUNDATION**
- Module: `space/launch-event.js`
- Formula: `validated state transitions with telemetry evidence gate`
- Inputs: launch state, evidence
- Outputs: next state
- Guardrails: No ascent/success/failure progress without evidence

## Storage

### ALG-STO-001 · Archive deletion proof
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `storage/archive-verification.js`
- Formula: `all checksum/count/size/snapshot/grace/shadow checks must pass`
- Inputs: S3/NAS evidence
- Outputs: DELETE_ELIGIBLE/BLOCKED
- Guardrails: No date-only deletion

### ALG-STO-002 · Cloud delta keyframe plan
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `storage/delta-pack.js`
- Formula: `keyframes + delta frames; estimate saving and random access penalty`
- Inputs: frame count/size/ratio
- Outputs: pack plan
- Guardrails: Use only after reconstruction validation

### ALG-STO-003 · Replay rehydration compatibility
- Priority / status: **P2 / IMPLEMENTED_FOUNDATION**
- Module: `storage/replay-rehydration.js`
- Formula: `select overlapping archive chunks only after processor/schema compatibility checks`
- Inputs: archive manifest, region/time request, supported versions
- Outputs: rehydration plan
- Guardrails: Never serve directly from NAS

## Visual

### ALG-VIS-001 · Bounded logarithmic tower mapping
- Priority / status: **P0 / IMPLEMENTED_FOUNDATION**
- Module: `visual/tower.js`
- Formula: `height = hMin + boundedLog(value/p95)*(hMax-hMin)`
- Inputs: value, distribution
- Outputs: height/opacity
- Guardrails: Original value remains visible

### ALG-VIS-002 · Mass-preserving estimated distribution
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `visual/tower.js`
- Formula: `cell_i = total*w_i/sum(w), integer remainder by largest fraction`
- Inputs: aggregate total, approved weights
- Outputs: estimated cells
- Guardrails: Sum must exactly equal provider total; estimated badge

### ALG-VIS-003 · Bilinear vector sampling
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `visual/flow.js`
- Formula: `bilinear interpolate U/V over four grid cells`
- Inputs: vector grid, normalized coordinate
- Outputs: U/V vector
- Guardrails: Missing vector returns null

### ALG-VIS-004 · Adaptive volume render policy
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `visual/volume.js`
- Formula: `mode/resolution/ray steps from device, thermal, confidence, uncertainty, horizon`
- Inputs: device, thermal, confidence, uncertainty
- Outputs: shell/volume policy
- Guardrails: Mobile and ECO avoid heavy volume

### ALG-VIS-010 · Semantic label budget
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `visual/label-budget.js`
- Formula: `priority=safety>selected>primary>context>decorative`
- Inputs: candidate labels, device cap
- Outputs: visible labels
- Guardrails: Safety cannot be evicted by decorative labels

### ALG-VIS-011 · Semantic material grammar
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `visual/material-grammar.js`
- Formula: `domain+evidence+selection+thermal => material tokens`
- Inputs: scene state
- Outputs: material tokens
- Guardrails: Risk/scenario semantics reserved

## Weather

### ALG-WX-001 · Skill-weighted model ensemble
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `weather/ensemble.js`
- Formula: `weighted mean; spread from weighted variance`
- Inputs: model members, skill/freshness weights
- Outputs: consensus/spread/agreement
- Guardrails: No public probability before calibration

### ALG-WX-002 · Local bias correction
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `weather/ensemble.js`
- Formula: `corrected = raw - bias(location,variable,lead,regime)`
- Inputs: forecast, bias
- Outputs: corrected forecast
- Guardrails: Promote after shadow backtest

### ALG-WX-003 · Semi-Lagrangian nowcast
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `weather/nowcast.js`
- Formula: `field(t+dt)=sample(field, x-u*dt, y-v*dt)+growth-decay`
- Inputs: field, vector field
- Outputs: advected field
- Guardrails: Lead-time validation required

### ALG-WX-004 · Evidence-backed claim gate
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `weather/evidence-graph.js`
- Formula: `claim allowed only when required evidence count/confidence and counter evidence rules pass`
- Inputs: claim rules, evidence
- Outputs: allow/block + confidence
- Guardrails: No invented numbers or unsupported causal claims

### ALG-WX-005 · Precipitation observed blend
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `weather/precipitation.js`
- Formula: `quality-weighted radar+gauge+model, observed sources define state`
- Inputs: radar/gauge/model rates
- Outputs: rate/intensity/state
- Guardrails: Cloud and precipitation are separate

### ALG-WX-006 · Rain/snow phase foundation
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `weather/precipitation.js`
- Formula: `wet-bulb + warm/cold layer depth rules`
- Inputs: temperature profile
- Outputs: phase/confidence
- Guardrails: Explicit uncertainty

### ALG-WX-007 · Forecast gap / Early Signal
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `weather/forecast-gap.js`
- Formula: `gap=consensus-official; require persistence, agreement, skill`
- Inputs: official forecast, model consensus
- Outputs: NONE/WATCH/EARLY_SIGNAL
- Guardrails: Official warning always wins

### ALG-WX-008 · Moisture source contribution
- Priority / status: **P1 / IMPLEMENTED_FOUNDATION**
- Module: `weather/moisture-attribution.js`
- Formula: `trajectory + flux convergence + TPW + ascent + SST support + radar growth - dry-air counter`
- Inputs: multi-signal evidence
- Outputs: contribution score/state
- Guardrails: SST alone cannot establish cause
