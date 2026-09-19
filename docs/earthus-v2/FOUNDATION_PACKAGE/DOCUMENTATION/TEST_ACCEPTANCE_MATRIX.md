# Test and Acceptance Matrix v0.2

## Package tests

- Node built-in test runner only; no dependency installation required.
- 148 tests pass.
- All `prototype/js/earthus2/v02/*.js` files must pass `node --check`.
- Engine catalog dependency waves must have no internal cycle.
- Package manifest checks size and SHA-256 for every listed file.

## What pure tests cover

- Canonical evidence/freshness/confidence.
- One-data-hero and resource ownership.
- Geospatial dateline handling, country camera and terrain LOD.
- Tower truth, mass preservation, flow vector requirements and volume fallback.
- Human Flow density/trend/forecast/anomaly/risk/ground-truth lifecycle.
- Weather ensemble, nowcast, evidence claims, precipitation and moisture attribution.
- Satellite broker, Cloud State, horizon blend and uncertainty rendering.
- Entitlement, quota, paid panel, country unlock and rights.
- Archive state/verification/restore/delta/event capsule/replay plan.
- Provider health, model promotion, cost and observation gap.
- Fail-soft scene, Trust Ledger, procedural cloud detail and Offline Trip Pack.

## What still requires repository integration

| Area | Required proof |
|---|---|
| Existing engine reuse | Capability audit on canonical local checkout |
| Provider integration | Contract fixture + safe smoke + freshness/status |
| Cesium rendering | Before/after screenshots, object counts, picking and disposal |
| `/v2` isolation | Root `/` untouched, separate Service Worker/cache/analytics namespace |
| Mobile | Actual iPhone and low-end Android 30-minute playback |
| Thermal | temperature/quality transitions and battery measurements |
| AWS | job success/error/throttle/duration, target delivery, cost and rollback |
| Supabase | RLS, entitlement E2E, Edge deployment parity and refund/expiry |
| NAS | 14-day shadow copy, checksum/snapshot, deletion block and restore drill |
| Rights | display/derivative/history/export/API operation allowed per source |

## Completion language

- `FOUNDATION_TESTED`: pure package tests pass.
- `INTEGRATED_PREVIEW`: connected to the canonical repository and `/v2` local/staging preview.
- `DEVICE_QUALIFIED`: real-device performance/thermal gates pass.
- `PRODUCTION_ACTIVE`: code, schedule/call path and current runtime evidence are all confirmed.
