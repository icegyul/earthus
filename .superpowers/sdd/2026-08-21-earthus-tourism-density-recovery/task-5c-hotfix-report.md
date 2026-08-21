# Task 5C hotfix report — canonical snapshot sidecar and density2 cache migration

## Status

- **Implementation: VERIFIED LOCAL.** The canonical Seoul official 121-place snapshot is no longer
  extended with collector health or KTO summary fields. Both auxiliary-success and auxiliary-failure
  browser paths pass the unchanged strict official validator and produce the same canonical allocation
  audit.
- **Release: NOT DEPLOYED.** This turn did not fetch, rebase, push, deploy, invalidate CloudFront, or
  edit the SDD ledger. Production remains on the Task 5B bytes until a separately authorized release.
- The official snapshot used for verification remains honestly classified as `STALE`.
- **Fix round 1: VERIFIED LOCAL.** OFF now invalidates the whole tourism activation generation, so a
  delayed health/KTO completion cannot assign state, emit events, rebuild cells, reopen UI, or move
  the camera after a newer activation has taken ownership.

## Root cause and TDD proof

`prototype/js/layers/tourism-flow.js` validated the raw `tourism/seoul-flow.json`, then wrote successful
auxiliary responses into that same object as top-level `snapshot.health` and `snapshot.ktoSummary`.
The hardened official allowlist correctly rejects those non-canonical keys. Task 5B's local verifier
returned 404 for both auxiliary routes, so only production exercised the mutation branch.

The new full browser regression uses the captured official 121-place snapshot and returns HTTP 200 for
both live-like auxiliary routes.

```text
RED: Error: OFFICIAL_SNAPSHOT_SCHEMA_INVALID
     at assertOfficialTourismSnapshot(...)
```

After the fix:

```text
tourism auxiliary sidecar browser: PASS
  (success/failure canonical 121 audit identical)
```

### Fix round 1 — OFF/abort activation race

The auxiliary catches previously swallowed `AbortError` and continued the same activation. Aborting
the request did not revoke the async function's ownership, so an old run could pass through canonical
snapshot/sidecar assignment, events, entity rendering, and first-focus camera code after OFF. A later
fresh ON could also be overwritten by that stale completion.

The new browser regression delays a successful health `json()` in one fresh context and a successful
KTO `json()` in another. In each case it turns tourism OFF, completes a fresh subsequent ON, turns OFF
again, and only then releases the old response.

```text
RED: AssertionError: health: stale snapshot replaced fresh state
GREEN: tourism activation race browser: PASS
       (health/KTO stale completions ignored)
```

`tourismFlow` now gives each refresh an activation generation and treats a run as current only while
the generation, controller identity, non-aborted signal, and store ON state all match. That guard is
checked after canonical fetch/JSON, local fallback, both auxiliary fetch/JSON/catch boundaries, event
boundaries, and ADM2 completion. OFF increments the generation before aborting. A dead abort returns
without creating a null/`UNAVAILABLE` sidecar, while ordinary live 404 auxiliary responses still
produce the existing explicit unavailable UI for the current activation.

The regression proves that after stale completion:

- the fresh canonical snapshot and auxiliary object identities remain current;
- snapshot, auxiliary, and unavailable-error event counts do not change;
- the fresh density entities are neither cleared nor rebuilt;
- the map UI remains hidden after OFF and the camera flight count does not change;
- a fresh subsequent ON still loads all 121 canonical places and successful health/KTO sidecars.

The test verifies all of the following:

- successful health and KTO responses are available through the separate `tourismFlow.auxiliary`
  runtime sidecar;
- the official snapshot is byte-structure equivalent between auxiliary success and failure;
- both snapshots pass the unchanged 26-negative official validator;
- both paths have the exact sorted 121-place allocation audit, 9–25 contributions per place, and
  weight `1.0` per place;
- the tourism sheet still renders collector health and KTO received state on success, and its previous
  explicit unavailable wording on auxiliary failure.

## Implementation

- `tourismFlow.snapshot` remains the canonical official record.
- `tourismFlow.auxiliary` is the explicitly named sidecar `{ health, ktoSummary }`.
- The official event remains `earthus:tourism-snapshot`; auxiliary state uses the separate
  `earthus:tourism-auxiliary` event.
- `tourismSheet` and the combined weather/tourism verifier now read health and KTO state from the
  sidecar. No consumer reads auxiliary keys from the official snapshot.
- `tools/tourism-official-snapshot-validator.mjs` and its allowlists were not changed.

## Token-2 migration and deploy scope

- Final release token: `20260821-tourism-density2` in `index.html`, `main.js`, `registry.js`, browser
  tests, and live verifiers.
- Current service-worker cache: `earthus-shell-2026-08-21-tourism-density2`.
- `earthus-shell-2026-08-21-tourism-density1` was added to explicit legacy cleanup without removing
  the previous legacy cache entries. The upgrade test also proves an unrelated cache is retained.
- The fake-AWS behavior test still records exactly **15 uploads** and one exact-path invalidation call;
  no asset was added to or removed from the deployment manifest.

## Changed files

Runtime/cache wiring:

- `prototype/index.html`
- `prototype/js/layers/registry.js`
- `prototype/js/layers/tourism-flow.js`
- `prototype/js/main.js`
- `prototype/js/ui-tourism.js`
- `prototype/sw.js`

Tests and verifiers:

- `tools/test_tourism_auxiliary_sidecar_browser.mjs` (new)
- `tools/test_tourism_activation_race_browser.mjs` (new in fix round 1)
- `tools/test_tourism_density_release_manifest.mjs`
- `tools/test_tourism_density_visual_browser.mjs`
- `tools/test_tourism_flow_browser.mjs`
- `tools/test_tourism_flow_ui.mjs`
- `tools/test_tourism_relief_live_visual.mjs`
- `tools/test_tourism_sw_upgrade_browser.mjs`
- `tools/verify_tourism_density_live.mjs`
- `tools/verify_weather_tourism_live.mjs`

This report is the only changed documentation file. The deployment script itself was not changed.
Fix round 1 additionally changes only `prototype/js/layers/tourism-flow.js`, the new race regression,
and the `.tf-kto` synchronization inside `tools/test_tourism_flow_browser.mjs`. The release token stays
`20260821-tourism-density2`, and the deploy manifest remains exactly 15 assets.

## Verification evidence

Static and official-data gates:

```text
tourism flow contract: PASS
tourism density grid: PASS
tourism density labels: PASS
tourism flow public UI wiring: PASS
EARTHUS v8 active source context: PASS
EARTHUS v8 provenance dock wiring: PASS
tourism official snapshot validator: PASS (26 negatives, STALE accepted)
tourism density live allocation gate: PASS (exact canonical 121-place audit)
tourism official 121-place catalog: PASS
tourism density release manifest: PASS (15 scoped uploads, token 2)
```

Fix-round-1 race and stability gates:

```text
tourism activation race browser: PASS (delayed health and delayed KTO cases)
tourism auxiliary sidecar browser: PASS ×3
  each run exercised both HTTP 200 and 404 auxiliary paths with identical canonical 121 audit
tourism flow browser: PASS ×3
  each run completed mobile and desktop behavior without a detached .tf-kto action
```

The `.tf-kto` test no longer acts on an element retained across an asynchronous sheet rerender. It
reacquires the current connected element after rerender and performs the scroll in the same browser
evaluation; no whole-test retry or assertion weakening was added.

Actual Chrome gates:

```text
EARTHUS v8 provenance dock browser: PASS
mobile sample: 34 cells, labels 1/1, height 92.6–160.3m, overflow 0
desktop sample: 34 cells, labels 1/1, height 92.6–160.3m, overflow 0

official desktop overview:
  source 121, cells 2313, labels 10, occupied bins 1513
  nearest-neighbor p50 8.40806239089905px, height 12–154.445339823709m
  allocation errors 0, runtime errors 0
  idle 5000ms: entities 402→402, rebuild delta 0, requestRender delta 0

official mobile overview:
  source 121, cells 768, labels 6, occupied bins 439
  nearest-neighbor p50 8.775504727104657px, height 12–146.67963902926826m
  allocation errors 0, runtime errors 0
  idle 5000ms: entities 432→432, rebuild delta 0, requestRender delta 0

desktop relief: source 121, cells 2313, labels 10, allocation errors 0, runtime errors 0
mobile relief: source 121, cells 768, labels 6, allocation errors 0, runtime errors 0

tourism service worker upgrade: PASS
  density1 and weather-tourism1 deleted, density2 retained, unrelated cache retained
```

The token-2 local live verifier ran with the captured official snapshot plus successful captured health
and KTO summary responses:

```text
asset bytes: PASS (15/15, release 20260821-tourism-density2)
desktop: cells 2313, labels 10, occupied bins 1513, runtime errors 0
mobile: cells 768, labels 6, occupied bins 439, runtime errors 0
desktop/mobile/reload: PASS with service-worker controller
tourism density live: PASS
```

Fix-round-1 local token-2 verification repeated the same gate with exact local bytes:

```text
asset bytes: PASS (15/15, release 20260821-tourism-density2)
desktop: cells 2313, labels 10, occupied bins 1513, runtime errors 0
mobile: cells 768, labels 6, occupied bins 439, runtime errors 0
desktop/mobile/reload: PASS with service-worker controller
```

Syntax and hygiene:

- changed runtime `.js` files copied to `.mjs` and checked with `node --check`: exit 0;
- all changed/new `.mjs` tests and verifiers checked with `node --check`: exit 0;
- `bash -n tools/deploy_tourism_density.sh`: exit 0;
- `git diff --check`: exit 0.

Latest local screenshots inspected:

- `/private/tmp/earthus-tourism-density-desktop-overview.png`
- `/private/tmp/earthus-tourism-density-desktop-detail.png`
- `/private/tmp/earthus-tourism-density-mobile-overview.png`
- `/private/tmp/earthus-tourism-density-mobile-detail.png`
- `/private/tmp/earthus-tourism-density-live-desktop.png`
- `/private/tmp/earthus-tourism-density-live-mobile.png`

They retain regional density cells, monotonic warm-color relief, bounded labels, inline lower-left
source text, and no OD arrow or fabricated route.

## Limitations and release concern

- Production has not received token 2, so production E2E remains **BLOCKED** until the reviewed exact
  15-file manifest is deployed and the no-injection live verifier passes against `earthus.net`.
- CloudFront invalidation completion cannot be queried with the current deploy principal unless its
  permissions change; byte/header checks remain required after release.
- Safari, actual iPhone/Android, VoiceOver, heat, and battery remain `UNKNOWN`.

Final local label: **HOTFIX_VERIFIED_LOCAL / RELEASE_NOT_STARTED**.
