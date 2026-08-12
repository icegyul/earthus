# Release evidence — Korea stargazing evidence beta — 2026-08-12

## Delivered surface

`prototype/js/ui-sky.js` adds the public Korea stargazing evidence block to the
existing **Sky** panel. It is not a new decision, weather or reservation
system. With a selected Korean coordinate it shows:

1. `Recommendation withheld` rather than a positive recommendation.
2. The existing KMA official-warning Safety outcome, without inferring an
   all-clear from a missing warning.
3. The count of verified required factors and the KMA warning reference time.

Without a selected coordinate it asks only for device location. Outside Korea it
states the country limit. It makes no network request other than the existing
KMA warning reader and it sends no location to a new endpoint.

## Explicit non-claims

- No place, observatory, campground, route, inventory, reservation, payment or
  notification behavior exists.
- The six required nationwide evidence readers are not yet approved/connected,
  so the UI shows `0/6` and keeps recommendation withheld.
- The available warning-zone mapping is nearest-KMA-station approximation; it
  cannot establish a non-warning safe state.

## Verification required for release

1. `node --check` for `ui-sky.js`.
2. Korea preflight and regional-warning adapter tests.
3. All `tools/test_aetherus_*.mjs` tests.
4. Production cache-busting SHA-256, MIME and no-cache verification after
   selective S3 upload and CloudFront invalidation.
5. Actual desktop and mobile Sky-panel inspection after the release.
