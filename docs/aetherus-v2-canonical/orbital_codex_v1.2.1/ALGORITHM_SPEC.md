# Algorithm Specification

## Orbit propagation
GP/OMM with SGP4; precision OEM/OCM uses numerical/ephemeris path. Never convert a precision source to TLE as the canonical scientific source. Record frame and time scale.

## Coarse conjunction screening
Use a conservative filter whose job is to reduce pairs **without false negatives on validated corpora**. Start with orbit-shell bounds and time-window spatial envelopes; later optimize with spatial indexing. Exact thresholds are configuration, versioned and benchmarked.

## Precise TCA
1. Propagate both states over bracket window.
2. Find candidate minima on coarse samples.
3. Refine each candidate with scalar minimization of squared relative distance.
4. Return global minimum and boundary flag.
5. Compute relative velocity at TCA.

## Pc
Transform combined covariance to encounter frame; integrate 2D Gaussian over combined hard-body radius using a validated method. If covariance is missing/invalid, do **not invent Pc**. Return screening metrics separately.

## Benefit
For scenario s and beneficiary i: `Benefit_i(s,h,m) = R_i(G0,h,m) - R_i(Gs,h,m)`. Preserve horizon h and metric m. Direct, indirect fragmentation and environmental benefit are separate classes.

## Affected Subgraph
Union of: target incident risk edges; orbit-overlap candidates within conservative bounds; candidate maneuver swept volume; potential fragmentation influence region; protected-object reverse-query candidates. Recompute only union; reuse unaffected baseline values. A regression test must compare against full recompute.

## Observation information gain
Estimate expected covariance reduction using measurement model H and noise R; rank opportunities by risk relevance × expected information gain × observability × data scarcity. Actual post-observation information gain is computed from covariance/fit improvement after QA.
