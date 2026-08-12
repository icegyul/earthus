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

## Release result

- Commits: `7846114` (evidence beta) and `c3dca48` (cache-busting UI import).
- CloudFront invalidation: `I4XHGLYKGMOD9J7PP1TVR0JKDX` for `/js/main.js` and
  `/js/ui-sky.js`.
- Production `main.js` SHA-256:
  `11e0e7db53e5343134a7a5ecf1c8eb12c0af97ce67777efee2340a9748376686`.
- Production `ui-sky.js` SHA-256:
  `ebb4abcb9fe3fb443c082a0d69259bfa01698f816f17c6277e6fd6d6b03cdb27`.
- Both cache-busting URLs returned HTTP 200 with
  `text/javascript; charset=utf-8` and `cache-control: no-cache`; each body
  matched its checked-out file.
- In the live desktop UI, `EARTHUS → 취미 → 하늘` displayed the Korea
  stargazing evidence-beta block with the no-location, no-recommendation text.
