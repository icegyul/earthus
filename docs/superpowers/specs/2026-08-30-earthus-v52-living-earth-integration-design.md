# EARTHUS V2 v5.2 Living Earth Integration Design

## Status and authority

- Execution branch: `earthus-v2/real-living-earth-render`
- Reconciled base: `84a7381ac2a6a43a8400e0a982631168c5bf5a77`
- Production target: `https://earthus.net/v2/`
- Production root `/` is out of scope and must remain byte-identical.
- `main` merge is out of scope.
- Current dirty and untracked work is preserved; no reset, restore, clean, or stash.

This design implements the user-approved v5.2 R2 handoff in the actual current
source. Package claims are specifications or recorded evidence, not live proof.

## Product outcome

EARTHUS V2 must provide one truthful progressive Earth that remains useful on
the first frame, gains physical detail as the camera stabilizes, reads shared
materialized intelligence instead of recomputing per browser, and reserves
private/scenario work for server-authorized bounded compute.

The final acceptance path is:

```text
real provider/cache receipts
-> canonical current Earth
-> P0-P7 progressive physical globe
-> materialized Weather/Typhoon read plane
-> Earth Version/Diff
-> browser Truth Lens
-> compute/reuse/cost telemetry
-> scoped /v2 deploy
-> production desktop/mobile browser evidence
-> physical-device handoff
```

## Evidence baseline

| Area | Base status | Required outcome |
|---|---|---|
| P0 FND-017 | `RUNTIME_WIRED` | single provider/layer authority and one Viewer |
| P1 Snow/Ice | `FOUNDATION_CODE`, browser failure | Earthus cache read with observed receipt or explicit unavailable |
| P2 Terrain | real data, visual failure | mountain/coast gates pass with real Terrain3D and exaggeration 1 |
| P3 Ocean | foundation | progressive surface/coast state and truthful fallback |
| P4 Trench | browser pass | preserve pass while improving underwater detail |
| P4 Underwater | real data, visual failure | visible source-derived slopes and bounded resource lifecycle |
| P5 Cloud | real data wired | Shell -> CTH -> Volume, each truth-labelled and fail-soft |
| P6 Living Earth | runtime wired, visual failure | global chroma/polar/composition gates pass |
| P7 Streaming | runtime wired | generation ownership, abort, disposal, cache/prefetch budget |
| Device | not verified | production URL ready for physical iPhone/Android testing |

## Architecture

### One visual authority

`real-living-earth.js` owns canonical imagery, terrain, bathymetry, cloud,
polar, and ocean runtime objects. `visual-fidelity-controller.js` may change
presentation properties of those objects but cannot create or swap a second
ArcGIS detail provider. FND-017 controls render policy and the shared Viewer.

### Physical Earth before deep intelligence

The first global load uses only base visual assets and C0/C1 materialized
metadata. Camera motion suppresses deep work. Stable focus performs bounded,
center-first refinement. Missing data stays `INSUFFICIENT_DATA` or unavailable.

### Runtime economics

The v5.2 capability modules are support modules under existing Engine IDs, not
new Engines:

1. Compute Policy: FND-017 with BCK-024/028 and OPS/PAY gates.
2. Materialized Earth: BCK-029/BCK-021/DAT-008 semantics.
3. Dependency Invalidation: DAT-007/BCK-012 with SingleFlight and fencing.
4. Intelligence LOD: FND-017/FND-018 and the current camera policy.
5. Shared/Private Projection: shared immutable base plus server-private delta.
6. Earth Version/Diff: content-addressed regional manifests and bounded diffs.
7. Compute Economics: measured telemetry, versioned cost rates, capacity report.

Only two v5.1 catalog module-evidence paths exist at the reconciled base. The
unapplied v0.2 Foundation package is donor/reference code. It is not applied as
a 92-file bundle because that would duplicate Terrain/Cloud/Orchestrator
responsibility. Relevant small modules may be adapted only after behavioral
tests prove the required boundary.

### Public/shared data plane

AWS producers write immutable compact artifacts and current pointers beneath a
V2-specific object prefix. Public materialized artifacts may use S3/CloudFront.
The browser reads compact manifests and references; it never fans out to NOAA,
KMA, or multiple domain providers to assemble intelligence.

### Private compute plane

Supabase Edge Functions remain the server authorization boundary. Private
projection and C4/C5 endpoints must re-check entitlement at read and compute
time, use private/no-store responses, minimize context, meter actual compute,
and never leak fields into public JSON, CDN, OG, push, analytics, or logs.

## Seven capability contracts

### Compute Policy

Every product declares owner IDs, C0-C5 class, TTL/SWR/max-stale, dependencies,
share scope, cache dimensions, budget, truth restrictions, and fallback. Global
free first load has a C1 ceiling.

### Materialized Earth

The first vertical slice produces `GLOBAL_DIGEST`, `REGION_SNAPSHOT`, and
`EVENT_CAPSULE_SUMMARY`. Builds write immutable payloads, validate them, then
atomically advance a current pointer. Failed builds retain last-good.

### Invalidation and SingleFlight

Semantic revision fingerprints ignore receipt-only timestamp churn. Changed
keys invalidate only bounded downstream products. One fingerprint has one
leader; followers share its immutable result. Late generations cannot publish
over newer revisions.

### Four-way LOD

Spatial, temporal, intelligence, and visual LOD are independent. Visual quality
never changes truth. Moving cameras allow C0/C1 only; stabilized focus may read
C2 and explicitly requested/authorized work may reach C3-C5.

### Shared/private projection

Shared keys exclude user identity. Private keys contain only opaque principal
scope and a minimized-context fingerprint. Logout or entitlement expiry denies
reuse. Official safety remains free.

### Earth Version/Diff

Versions are manifest trees, not whole-world copies. Identical content reuses
hashes. Diffs traverse only changed branches and preserve parent/version
integrity. Periodic checkpoints bound reconstruction depth.

### Compute Economics

Telemetry records planned/executed class, materialized/cache hits,
SingleFlight leader/followers, runtime/resource deltas, provider/LLM/egress
units, and dropped telemetry. A versioned rate card may leave rates unknown; it
must never invent cost. GPU is optional and benchmark-gated.

## First real vertical slice

Weather/Typhoon is the first slice because current official/cache sources and
event identity already exist. The materializer consumes the existing Earthus
cache, emits evidence-bearing region/event artifacts, publishes an Earth
Version delta, and exposes a compact browser read. No browser provider fan-out
is allowed.

## Failure behavior

- Official warning revision changes bypass ordinary stale tolerance.
- Safe last-good responses include freshness and source revision.
- No last-good returns `INSUFFICIENT_DATA`, never zero/clear/safe.
- Telemetry failure never breaks the product path.
- Pressure preserves base Earth and official safety, stops speculative prefetch,
  and queues/rejects unique C5 work.
- Deployment rollback restores the previous exact V2 object manifest; root
  production remains untouched.

## Verification

Automated checks cover syntax, pure contracts, 100-request SingleFlight,
scoped invalidation, revision races, cache/privacy isolation, C1 first load,
CPU-only operation, deterministic cost reports, one Viewer, and resource
disposal. Browser gates retain framebuffer metrics plus human screenshot review.

Production acceptance requires exact deployed bytes, MIME/cache headers,
`/v2`, `/v2/`, and `/v2/index.html` identity, no root asset leakage, desktop and
mobile interactions, no console errors, and unchanged production-root hashes.

Physical iPhone/Android, Safari, battery, thermal, and assistive-technology
observations remain separate human-device evidence; they cannot be inferred
from desktop emulation.
