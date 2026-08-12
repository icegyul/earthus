# Korea-first Nationwide Stargazing — Shadow static release evidence

## Scope

Two pure static modules were deployed without a public UI entry, network call,
place catalog, reservation flow or recommendation action.

- `korea-stargazing-preflight.js`: KMA-gated, nationwide Korean-coordinate
  evidence completeness for cloud, visibility, humidity, precipitation, moon
  illumination and darkness margin.
- `regional-warning-adapter.js`: fail-closed supplied-official-snapshot contract
  for Korea (KMA), Japan (JMA) and Taiwan (CWA).

The Korea module retains `publicRecommendation=null`, `action=null` and
`reservation=null`; all missing/stale/unknown safety or factor evidence is
`WITHHELD`. Japan and Taiwan remain official-warning-only shapes, with no active
source adapter or public result.

## Production evidence

- CloudFront invalidation: `I5Y8VLM1R9L2MK1P4BP0TMN7RA`.
- Both cache-busting production responses were HTTP 200, byte-identical and
  served as `text/javascript; charset=utf-8` with `cache-control: no-cache`.
- `korea-stargazing-preflight.js`:
  `b7b6ab93513ec7daa4ca2f4bcf2f387ef813b09a97d822d9398fef698853b672`
- `regional-warning-adapter.js`:
  `c1f5f3f1dbbc28c0317e6c7e9c8ea8ef8e0c52cefaf6ce4145f7c2c9e1ffe953`

## Verification

- Korea preflight: KMA gate, all six factors, out-of-scope, unknown safety and
  missing evidence tests pass.
- KR/JP/TW warning adapter: official evidence and stale/missing fail-closed
  tests pass.
- Full Aetherus, Decision, Reservation, Fusion, PR-11, catalog and ephemeris
  regressions pass.

## Still closed

KMA official warning-boundary/hierarchy evidence, Korea's six live source
adapters and their rights/freshness approvals, profile review, device testing,
canary and PD flag approval remain required before public recommendation.
