# EARTHUS 1.0 → 2.0 Reuse Inventory

Target branch: `earthus-v2/actual-first-screen-preview`

This inventory is evidence-based. It records the exact Earthus 1.0 runtime assets that should be reused or adapted before new 2.0 code is introduced.

## Decision labels

- **REUSE** — behavior/contract is already appropriate and should be shared or moved with minimal changes.
- **ADAPT** — proven 1.0 behavior exists, but its UI/runtime/security contract must be adapted for 2.0.
- **REPLACE** — existing implementation conflicts with the 2.0 production/security requirement.
- **RETAIN-1.0** — keep in 1.0 while 2.0 receives an adapter; do not break the current service.

## 1. Startup / loading

| Path | Existing evidence | Decision | 2.0 action |
|---|---|---|---|
| `prototype/index.html` | `#loading` contains Earthus brand logo, loading bar and loading text. `#runtimeLoading` exists for long-running data work. | ADAPT | Preserve the recognizable logo/loading composition, but bind progress to actual 2.0 bootstrap milestones. |
| `prototype/css/app.css` | Defines `#loading`, `.load-box`, `.load-bar`, brand entrance and runtime loader styling. Current startup bar animates toward 88% based on time. | ADAPT | Reuse visual language, replace timer-derived progress with real milestone progress. Use indeterminate state when progress is not measurable. |
| `prototype/js/main.js` | Maintains concurrent runtime load keys and displays a runtime loading bar. Current copy is cyclone-specific. | ADAPT | Generalize to resource-scoped task UI for satellite/cloud/typhoon/ocean/terrain while retaining concurrent-task semantics. |
| `prototype/js/net.js` | `fetchT()` supplies 12 s default timeout, AbortController fallback, caller signal propagation and `getJSON`. | REUSE | Share the timeout/abort semantics with v2 provider adapters; avoid unbounded third-party fetches. |
| `prototype/js/imagery-layer-group.js` | Tracks active imagery groups, pending tile requests, cancels pending requests, clears owner cache and disposes grouped layers. | REUSE | Use as the reference lifecycle contract when v2 activates real satellite/cloud imagery. |
| `prototype/js/layers/imagery.js` | Cloud loading already has pending-request dedupe, generation IDs, AbortController replacement and group-based swap/dispose. | REUSE/ADAPT | Connect v2 resource-task telemetry/UI to the existing request/layer lifecycle instead of rewriting provider logic. |
| `prototype/js/viewer.js` | Mature single Cesium viewer initialization, device-resolution behavior, tile cache and mobile camera/render constraints. | ADAPT | Keep v2’s one-viewer rule; port proven performance constraints deliberately rather than creating a second viewer. |

### Loading conclusion

Earthus 1.0 already solved the hard parts of timeout, cancellation and layer ownership. The missing piece is a **shared, resource-agnostic task/progress contract** and its wiring into the 2.0 shell.

## 2. Membership / authentication / authorization

| Path | Existing evidence | Decision | 2.0 action |
|---|---|---|---|
| `prototype/js/auth.js` | Supabase OAuth, single-init protection, session restore, profile loading, invitation claiming, consent, account deletion/export and paid-tier readback. | REUSE/ADAPT | Reuse session/profile lifecycle. Add canonical `FREE` / `PAID` / `INVITE` membership normalization and server-returned capabilities/roles. |
| `prototype/js/auth.js` | `isAdmin()` currently accepts configured client UID or a hard-coded owner email. | REPLACE | Admin authorization must come from server-side RBAC/capabilities. Client email/UID checks may not authorize privileged data or mutations. |
| `prototype/admin.html` | Existing protected-UI intent, Supabase RLS warning, operational stats/health and links to member/studio/social admin surfaces. | ADAPT | Keep operational structure, introduce role-aware navigation/capabilities and provider registry without exposing secrets. |
| `prototype/members.html` | Existing member management surface in 1.0. | ADAPT | Normalize member class/state and make privileged actions server-authorized/audited. |
| `prototype/js/billing.js`, `prototype/js/ui-subscribe.js`, `prototype/js/access-mode.js` | Existing subscription/access behavior. | RETAIN-1.0 / ADAPT | Preserve current payment behavior; map authoritative subscription result into v2 membership class rather than reimplementing payment. |

### RBAC target

Membership class and staff role remain separate:

- membership: `FREE`, `PAID`, `INVITE`
- staff roles: `SUPER_ADMIN`, `DEVELOPER`, `OPERATIONS`

Every privileged mutation must be checked server-side and audited.

## 3. API / provider administration

| Path | Existing evidence | Decision | 2.0 action |
|---|---|---|---|
| `prototype/js/ui-apikeys.js` | Maintains provider/application metadata, expiry reminders, Lambda/environment-variable mapping and connection-oriented operational guidance. Explicitly does not put API secrets in the browser. | REUSE/ADAPT | Reuse provider catalogue/expiry/health knowledge. Replace browser-local application-date state with server provider metadata and add secure secret submit/rotate/test workflow. |
| `prototype/js/config.local.example.js` / `prototype/js/config.js` | Existing separation of local/configured values and public runtime constants. | ADAPT | Public IDs/config remain client-safe; all provider secrets move behind the server secret adapter. |
| `prototype/js/admin-health.js` | Existing collector/provider health presentation. | REUSE | Feed its status model into the unified provider registry where fields align. |

### API registry rule

The v2 admin UI must never read a raw provider secret after creation. It receives only provider metadata, status and a safe masked fingerprint/suffix if implemented server-side.

## 4. SNS automation

| Path | Existing evidence | Decision | 2.0 action |
|---|---|---|---|
| `prototype/js/main.js` | Exposes a controlled Cesium studio capture handle and renders/captures within the same call because `preserveDrawingBuffer` is off. | REUSE | Keep this capture constraint when 2.0 studio connects to the live globe. |
| `prototype/studio.html`, `prototype/js/studio.js` | Existing Earthus image/video studio runtime. | REUSE/ADAPT | Do not rebuild renderer from scratch; adapt job orchestration and 2.0 scene inputs. |
| `prototype/js/studio-social.js`, `prototype/js/social-settings.js` | Existing social publishing/settings code. | ADAPT | Introduce explicit render → encode → metadata → review → publish → verify job lifecycle, dry-run, idempotency and environment isolation. |
| `prototype/social-settings.html` | Existing social connection management surface. | ADAPT | Keep credentials server-side and expose connection/status controls only. |

## 5. SEO / GEO

| Path | Existing evidence | Decision | 2.0 action |
|---|---|---|---|
| `prototype/index.html` | Existing title/description/keywords, canonical, OG, verification, JSON-LD, crawler-readable explanation and `<noscript>` service/source text. | REUSE/ADAPT | Carry the mature baseline to public 2.0 routes, but keep preview/admin/private routes `noindex`. |
| `prototype/v2/index.html` | Current preview intentionally uses `noindex,nofollow` and is mostly WebGL/UI state. | RETAIN UNTIL PUBLIC GATE | Do not index the preview. Build crawlable public metadata/text route strategy before flipping indexing. |

### GEO rule

Public machine-readable content must distinguish official observation/forecast, model guidance and Earthus-derived analysis, with source/issue/valid/update time and geographic subject.

## 6. Weather / cyclone

| Path | Existing evidence | Decision | 2.0 action |
|---|---|---|---|
| `prototype/js/layers/cyclone.js` | Mature current-storm runtime with GDACS, JMA official forecast, ECMWF model track distinction, 12 s timeout/fallback philosophy, retained post-list tracks and explicit official-vs-model semantics. | REUSE/EXTEND | Preserve current official/current-storm code and add separate 0–5 / 6–10 / 11–15-day data products instead of stretching one track. |
| `prototype/js/ui-cyclone.js` | Existing typhoon detail sheet, pressure/wind/cloud/lightning helper layers, official-source explanation and news linkage. | REUSE/ADAPT | Add candidate/genesis and long-range panels while keeping source/uncertainty language. |
| `prototype/js/jma.js`, `prototype/js/official.js` | Existing official-source integration helpers. | REUSE | Treat as official-source adapters; do not blend their output into Earthus-derived probability. |
| `prototype/js/kma-fcst.js`, `prototype/js/forecast-confidence.js`, `prototype/js/weather-contract-v7.js`, `prototype/js/weather-data-v7.js` | Existing weather forecast/confidence/data contracts. | ADAPT | Reuse time/source/confidence conventions when building 15-day weather contract. |

### Typhoon 2.0 target

- `0–5 d`: official products where available, explicitly `OFFICIAL_FORECAST`
- `6–10 d`: model/ensemble guidance corridors, `MODEL_GUIDANCE`
- `11–15 d`: genesis/formation-zone probability or ensemble density; no fake deterministic track
- pre-genesis Earthus candidate IDs; never pre-assign an official name
- separate `next available names` list (three names) from the authoritative WNP sequence
- source-native probability/evidence until Earthus calibration is validated
- Earthus-calculated public forecast/probability remains feature-gated until compliance approval

## 7. 2.0 integration point

`prototype/v2/index.html` is currently a compact single-file Cesium preview. It has a real Cesium Viewer and the EARTH/WEATHER/OCEAN/HAZARD/HUMAN/PULSE/SPACE shell, but layer selection currently only changes preview UI/toasts. It has no 1.0 provider, auth, admin, SNS or cyclone runtime wiring yet.

Therefore the safe migration strategy is:

1. add small v2 shared runtime modules,
2. connect the existing v2 bootstrap to real task states,
3. adapt proven 1.0 modules behind explicit v2 adapters,
4. keep one Cesium Viewer and one authoritative state owner,
5. do not duplicate provider logic merely to make the v2 preview look complete.

## 8. First implementation batch

The first code batch is intentionally bounded:

- add `prototype/v2/js/resource-tasks.js`
- add v2 loading UI/styles
- wire real v2 bootstrap milestones (shell → Cesium → viewer → base imagery → first render → ready)
- expose resource-task state for subsequent satellite/cloud/typhoon/ocean/terrain adapters
- keep failed/indeterminate states honest

Only after this is stable do we wire real 1.0 layer/provider functions into the 2.0 feature selection path.
