# Earthus 2.0 — Pre-Device Integration Plan

## 0. Scope Freeze

- Repository: `icegyul/earthus`
- Target branch: `earthus-v2/actual-first-screen-preview`
- Frozen starting HEAD: `619aaed5454cd8f40239855ec75870fc4522e202`
- Canonical Earthus 2.0 prototype: `prototype/v2/index.html`
- Legacy source of truth for reusable behavior: Earthus 1.0 loading UX, member/admin functions, SNS automation and existing provider integrations
- Production `main` is **out of scope and must not be written to** during this phase.
- Goal of this phase: complete integration and QA **up to, but not including, real-device testing**.

## 1. P0 Completion Definition

The pre-device phase is complete only when every P0 item below is implemented, wired to the Earthus 2.0 runtime or admin runtime, validated in browser/PWA simulation, and has an explicit failure state. Placeholder-only UI does not count as complete.

### P0-LOAD-01 — First Launch Loading UX

Reuse the recognizable Earthus 1.0 startup behavior in Earthus 2.0:

- Earthus logo remains visible during the first application bootstrap.
- A visible progress bar shows startup progress.
- Progress must be tied to real bootstrap stages rather than a decorative timer.
- Minimum stages: shell/bootstrap, configuration, auth/session restore, globe/runtime initialization, essential providers, first render, ready.
- A failed stage must transition to a readable error/retry state; the UI must never appear permanently frozen.
- Startup loading telemetry must record stage, duration, outcome and failure reason without user secrets.

Acceptance:

- No blank black/white screen during bootstrap.
- Progress is monotonic and finishes only after the minimum ready condition is met.
- Retry does not duplicate initialized globe layers or event listeners.

### P0-LOAD-02 — Heavy Resource / Layer Loading

Add local loading UX whenever Earthus loads a heavy dataset or creates a heavy 3D layer. Initial required targets:

- satellite imagery
- cloud imagery / cloud volume
- typhoon / tropical cyclone data
- ocean / SST layers
- terrain or other heavy globe assets

The loader must expose meaningful stages where available, for example:

`request → download → decode/parse → transform → build layer → attach to globe → ready`

Requirements:

- Per-resource progress/state instead of one fake global spinner.
- The rest of the application should remain usable unless that specific operation genuinely requires a global block.
- Timeout, cancellation, retry and provider-error states.
- Abort stale requests when the user rapidly changes time/layer/source.
- Prevent duplicate layer attachment after retry.
- Cache-aware behavior: cache hits must not replay fake download progress.
- Log real load duration and provider/result status for operations diagnostics.

### P0-AUTH-01 — Membership Classes

Canonical member classes for this phase:

1. `FREE`
2. `PAID`
3. `INVITE` — invitation-only member class; distinct from ordinary paid/free accounts

Membership class and authorization role are separate concepts. A user can have one membership class while receiving zero or more staff/admin roles.

Required account states:

- active
- invited / pending activation
- suspended
- cancelled/expired where applicable

### P0-RBAC-01 — Admin / Staff Authorization

Canonical administrative roles:

- `SUPER_ADMIN` — final administrator; highest authority
- `DEVELOPER` — development team role
- `OPERATIONS` — operations team role

Rules:

- Authorization is enforced server-side; hiding a button in the UI is never sufficient.
- `SUPER_ADMIN` can manage staff roles and all operational controls.
- `DEVELOPER` receives only the technical/provider/debug capabilities necessary for development.
- `OPERATIONS` receives member, content, publishing and operational capabilities necessary for service operation.
- Destructive actions, role changes and secret operations require audit records.
- No role is inferred from an email string or client-side flag.

Minimum management UI:

- member search/filter
- membership class filter (`FREE` / `PAID` / `INVITE`)
- account state
- subscription/invite status
- staff role assignment where authorized
- audit/event history for privileged changes

### P0-ADMIN-API — Provider / API Key Registry

Create a dedicated admin provider registry so API keys and provider credentials can be collected and entered later without editing application source.

Minimum provider record:

- provider name
- provider/service category
- environment (`development`, `staging`, `production`)
- credential alias / key alias
- credential type
- enabled/disabled state
- connection status
- last connection test
- last successful fetch
- last failure and sanitized error category
- expiry date when applicable
- quota / rate-limit notes when known
- documentation/source notes
- owner/team note

Security rules:

- Secret values are submitted to the server secret layer and must never be stored in browser local storage, repository source, page HTML or client logs.
- After creation, the raw secret is never returned to the browser. The admin UI shows only an alias and a masked fingerprint/suffix if safe.
- Server-side encryption/secret-store integration is mandatory before production activation.
- Actions: add, rotate/replace, test connection, enable/disable, revoke/delete where supported.
- Secret operations require `SUPER_ADMIN` or an explicitly granted technical capability and create an audit trail.
- Do not invent credentials, keys, endpoints or quota values. Unknown values remain `UNCONFIGURED`.

Initial registry must be able to represent current/expected Earthus providers including KMA, AirKorea, KTO, Seoul city data, ECMWF/AIFS, JMA, NOAA and future providers without schema changes.

### P0-SNS-01 — Existing Earthus SNS Automation Upgrade

Reuse the already-built Earthus 1.0 image/video generation and SNS distribution system rather than replacing it blindly.

Upgrade objectives:

- Separate `capture/render`, `encode`, `caption/metadata`, `approval`, `publish`, and `result tracking` stages.
- Support multiple output aspect ratios/templates used by social channels.
- Preserve Earthus source/provenance and update timestamp in generated content metadata when relevant.
- Add dry-run and manual-review mode before external publishing.
- Make publish jobs idempotent to avoid duplicate posts after retries.
- Per-channel publish state, returned post identifier/URL when available, failure reason, retry count and final status.
- Provider/social credentials remain server-side.
- Never publish automatically from development/test environments unless a dedicated test destination is explicitly configured.
- Retain production history so the admin can see what image/video was generated from which Earthus event/data snapshot.

### P0-SEO-01 — Search Engine Optimization

Earthus must not depend on WebGL-only content for discoverability.

Required baseline:

- crawlable public landing/content routes for important Earthus entities and data stories
- unique page title and meta description
- canonical URL
- `robots.txt`
- `sitemap.xml` (and split/index sitemap when scale requires it)
- Open Graph / social preview metadata
- structured data / JSON-LD where the entity type is supported
- `hreflang` for localized equivalents
- stable URLs for country/region/topic pages
- readable text equivalent for meaningful 3D/WebGL information
- explicit `noindex` for admin, auth, private member and internal-debug routes
- avoid indexing temporary query/session identifiers

### P0-GEO-01 — Generative Engine Optimization / Answerability

For this plan, `GEO` means generative/AI search discoverability, not a replacement for ordinary geolocation.

Required baseline:

- important public statements have machine-readable provenance
- dataset/provider/source name
- observation/model/forecast classification
- `updated_at` / valid time
- geographic entity and coordinates/region identifiers where appropriate
- units and time zone
- official vs model-guidance vs Earthus-derived distinction
- stable explanatory text accompanying visual-only data
- structured FAQ/explanation pages only where the content genuinely exists
- no fabricated citations, values or certainty

SEO/GEO must share the same canonical public data/provenance model so search crawlers and users see consistent facts.

## 2. Fifteen-Day Weather / Tropical Intelligence P0

### P0-WX-15D — Long-Range Weather Presentation

Earthus must no longer imply that the product only understands five days because an official typhoon track is commonly presented over five days.

Presentation layers:

- short/medium official forecast: use official provider products within their documented scope
- extended official outlook where an official provider offers it
- longer-range numerical/model guidance: displayed separately with uncertainty and source
- do not draw a precise hourly/icon forecast at long range when the available product does not justify that precision

Every weather datum must carry a provenance class:

- `OFFICIAL_OBSERVATION`
- `OFFICIAL_FORECAST`
- `MODEL_GUIDANCE`
- `EARTHUS_DERIVED`

### P0-TC-GENESIS — Pre-Genesis Tropical Candidates

The typhoon menu must surface tropical-cyclone formation candidates before official naming when model/official source products support it.

Candidate UI must show, when available:

- candidate identifier (Earthus internal, not an official storm name)
- basin/formation zone
- expected formation window as a range
- source/model support
- ensemble member support or source-native probability
- model agreement level
- run-to-run persistence
- data issue/valid time

A candidate must never be presented as an already-formed official typhoon.

### P0-TC-TRACK — 0–15 Day Layering

Target presentation:

- **0–5 days:** official track/advisory products where available; visually dominant and explicitly `OFFICIAL`
- **6–10 days:** numerical/ensemble `MODEL GUIDANCE`; use corridors/spread rather than one deterministic extension masquerading as an official track
- **11–15 days:** genesis/formation-zone probability or ensemble-density visualization; avoid a single fake precision track

The UI must support cases where a provider/model has a shorter valid horizon without fabricating missing hours.

### P0-TC-NAMES — Next Available Names

The typhoon menu shows the next three names in the authoritative Western North Pacific naming sequence as **next available names**.

Rules:

- Never bind an unformed Earthus candidate to a future official name.
- Display language must mean `next available names`, not `predicted typhoon names`.
- Naming list is provider/admin data with effective date/version so retired/replaced names can be updated without code changes.
- Once the responsible official center assigns a name, Earthus switches from candidate ID to the official identifier/name from the official source.

### P0-TC-CONFIDENCE — Confidence and Agreement

Do not manufacture a calibrated percentage merely from a member ratio unless calibration has been validated.

Before calibrated Earthus probability is approved, display source-native probability and/or transparent evidence such as:

- supporting ensemble members / total members
- number of independent model systems supporting genesis
- model agreement class (`LOW`, `MEDIUM`, `HIGH`)
- run-to-run persistence
- spread/corridor width
- issue/valid time

### P0-TC-LEGAL-GATE — Public Product Gate

Until legal/compliance approval for Earthus-derived public forecasting is complete, use feature flags/capabilities that keep derived forecast products separable from official/model-source products.

Minimum intended policy:

- `OFFICIAL_FORECAST`: public when source/licensing terms permit
- `MODEL_GUIDANCE`: public when source/licensing terms permit and clearly labeled
- `EARTHUS_CALCULATED_FORECAST`: internal by default
- `EARTHUS_CALIBRATED_PROBABILITY`: internal by default

Do not bypass this gate by changing labels only.

## 3. Observability / Audit P0

### P0-OBS-01

Capture operational evidence for:

- startup loader stage/duration/result
- heavy-layer request, provider, duration and failure class
- auth/RBAC deny events
- privileged admin mutations
- provider connection tests
- SNS render/publish job lifecycle
- 15-day tropical data issue time/source/model availability

No API secret, auth token or private user payload may be written to analytics/logs.

## 4. Integration Order

### Batch A — Source freeze and inventory

- [ ] Verify branch HEAD before each write batch.
- [ ] Inventory exact 1.0 files for startup loader, admin/member, SNS automation and provider config.
- [ ] Inventory exact 2.0 runtime integration points.
- [ ] Mark reusable / adapter-needed / replace decisions with evidence.

### Batch B — Loading infrastructure

- [ ] Shared resource-task state/progress contract.
- [ ] Startup loader adapter.
- [ ] Satellite/cloud loader.
- [ ] Typhoon loader.
- [ ] Ocean/SST/terrain loader.
- [ ] retry/cancel/timeout/dedup tests.

### Batch C — Auth and RBAC

- [ ] `FREE` / `PAID` / `INVITE` membership schema.
- [ ] `SUPER_ADMIN` / `DEVELOPER` / `OPERATIONS` authorization.
- [ ] server enforcement.
- [ ] admin member/staff UI.
- [ ] audit trail.

### Batch D — Provider/API registry

- [ ] provider schema.
- [ ] secret submission/storage adapter.
- [ ] masked registry UI.
- [ ] connection test endpoint/job.
- [ ] rotate/disable/delete workflow.
- [ ] audit trail and redaction tests.

### Batch E — SNS automation upgrade

- [ ] inventory existing 1.0 pipeline.
- [ ] adapter into 2.0 admin.
- [ ] dry-run/manual review.
- [ ] render/publish job history.
- [ ] idempotent retry.
- [ ] credential isolation.

### Batch F — SEO/GEO

- [ ] public crawlable route strategy.
- [ ] canonical/meta/OG/structured data.
- [ ] sitemap/robots/noindex policy.
- [ ] localization/hreflang.
- [ ] provenance/answerability payload.
- [ ] WebGL text-equivalent validation.

### Batch G — 15-day Weather / Tropical Intelligence

- [ ] provider/model ingestion inventory and licensing/access status.
- [ ] official/model/Earthus-derived provenance schema.
- [ ] 0–5 official track display.
- [ ] 6–10 model-guidance corridor.
- [ ] 11–15 genesis probability/density view.
- [ ] candidate system.
- [ ] next-three-name registry/display.
- [ ] agreement/persistence UI.
- [ ] legal/compliance feature gates.

### Batch H — Pre-device integration QA

- [ ] browser/PWA simulated mobile viewport validation.
- [ ] loading/error/offline/slow-network validation.
- [ ] auth/RBAC matrix tests.
- [ ] no secrets in repository/client bundles/logs.
- [ ] SNS remains dry-run in test environment.
- [ ] SEO rendered metadata/crawl validation.
- [ ] tropical source/provenance/label validation.
- [ ] no write to `main`.
- [ ] real-device handoff checklist generated.

## 5. Mandatory Quality Gates

Before declaring this phase complete:

1. Exact target branch and current HEAD are re-verified.
2. `git diff --check` passes on a materialized exact working tree.
3. Project lint/test/build checks available in the repository pass or failures are documented with evidence.
4. No credential or secret value exists in committed source, built client assets or test snapshots.
5. Startup/heavy-layer failures are recoverable and visible.
6. RBAC is verified server-side for every privileged mutation.
7. SNS test execution cannot accidentally publish to production.
8. SEO/GEO pages and metadata are generated from real data/provenance rather than placeholder claims.
9. Long-range tropical information is visibly separated from official 0–5-day track information.
10. Real-device testing has **not** yet been claimed; this phase ends at the handoff gate immediately before it.

## 6. Source Materialization Rule

Code edits require an exact materialized copy of the target branch/commit so diffs and project checks can be run before remote writes. If the execution sandbox cannot resolve GitHub directly, use a verified repository archive/artifact or another bounded GitHub transport. Do not reconstruct large production files from memory and do not write speculative code directly to the branch.

## 7. Definition of Done

This plan is done when Earthus 2.0 can enter real-device testing with:

- working startup and heavy-resource loading feedback,
- complete member/admin authorization baseline,
- secure provider/API registry,
- enhanced but controlled SNS automation,
- crawlable SEO/GEO baseline,
- 15-day weather/tropical intelligence presentation with clear provenance and uncertainty,
- observable failures and audit evidence,
- and no unresolved P0 blocker hidden behind placeholder UI.
