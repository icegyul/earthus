# EARTHUS 2.0 — Pre-Device Integration Runbook

## Purpose

This runbook controls the Earthus 2.0 integration phase that ends immediately before real-device testing. It is an execution checklist for `implementation_plan.md`, not a replacement for it.

Target repository/ref:

- Repository: `icegyul/earthus`
- Branch: `earthus-v2/actual-first-screen-preview`
- Production `main`: **DO NOT WRITE**
- Initial source freeze for this workstream: `619aaed5454cd8f40239855ec75870fc4522e202`

## 1. Preflight — Every Work Batch

Before changing code:

1. Resolve the exact target branch HEAD from GitHub.
2. Record the HEAD SHA in the work log/commit context.
3. Materialize the exact branch/commit source into the execution environment.
4. Confirm repository guidance in `AGENTS.md`, `.agents/skills/luna-chat-coder/SKILL.md`, `docs/HANDOVER.md`.
5. Inspect existing implementation before adding a parallel replacement.
6. Never place real API keys, social credentials, auth tokens or encryption material in source/config examples.
7. If the branch has advanced unexpectedly, stop and rebase/re-read affected source rather than overwriting it.

After changing code:

1. Run `git status --short`.
2. Run `git diff --check`.
3. Review `git diff --stat` and the complete relevant diff.
4. Run the repository's affected tests/lint/build checks.
5. Scan changed files/build output for secret-like values.
6. Verify the write target is still `earthus-v2/actual-first-screen-preview`.
7. Commit only bounded changes for the active batch.

## 2. Batch A — 1.0 Reuse Inventory

Evidence to capture before implementation:

### Startup / Loader

- [ ] Identify the exact Earthus 1.0 logo/loading HTML/CSS/JS.
- [ ] Identify bootstrap lifecycle and existing progress semantics.
- [ ] Identify existing error/retry behavior.
- [ ] Decide: direct reuse / adapter / partial rewrite.

### Member/Admin

- [ ] Identify existing user/member schema and admin pages.
- [ ] Identify current authorization enforcement location.
- [ ] Identify current subscription/payment indicators without changing payment behavior yet.
- [ ] Identify administrator/staff management code.

### SNS Automation

- [ ] Identify event/data trigger sources.
- [ ] Identify screenshot/image renderer.
- [ ] Identify video renderer/encoder.
- [ ] Identify caption/metadata generator.
- [ ] Identify social channel adapters and credential handling.
- [ ] Identify publish history/retry/idempotency behavior.

### Provider Configuration

- [ ] Inventory all current provider names and where their credentials are loaded.
- [ ] Mark secrets currently coming from environment/server configuration.
- [ ] Mark any unsafe client-side/hardcoded credential flow as a P0 remediation.

Output: an evidence table with exact paths and `reuse`, `adapt`, `replace`, or `retire` classification.

## 3. Batch B — Loading UX

### Shared task model

Every heavy operation should expose a normalized task shape equivalent to:

- task id
- resource/layer id
- provider/source
- stage
- progress if measurable
- indeterminate flag when progress cannot be measured honestly
- started/updated/completed timestamps
- cancellable flag
- retryable flag
- sanitized error code/message

Do not convert an unknown duration into a fake 0–100% animation. Use an indeterminate stage until measurable work resumes.

### Startup loader acceptance

- [ ] Earthus logo renders before expensive bootstrap work.
- [ ] progress bar advances on real startup milestones.
- [ ] ready state waits for the minimum viable first render.
- [ ] auth/provider errors do not create an infinite loader.
- [ ] retry is safe and idempotent.

### Heavy layer acceptance

For satellite, cloud, typhoon, ocean/SST and terrain:

- [ ] loading indicator appears at request start.
- [ ] current stage is understandable.
- [ ] stale request can be aborted/replaced.
- [ ] timeout produces a recoverable state.
- [ ] retry does not duplicate layer instances.
- [ ] cached content does not show fake network progress.
- [ ] completion only fires after the layer is usable/visible.

## 4. Batch C — Membership / RBAC

### Membership class

- `FREE`
- `PAID`
- `INVITE`

### Staff roles

- `SUPER_ADMIN`
- `DEVELOPER`
- `OPERATIONS`

### Authorization matrix — minimum

| Capability | FREE/PAID/INVITE user | OPERATIONS | DEVELOPER | SUPER_ADMIN |
|---|---:|---:|---:|---:|
| Use entitled public/member features | yes | yes | yes | yes |
| View member operations console | no | yes | limited/as granted | yes |
| Modify ordinary member state | no | yes | no by default | yes |
| View provider status | no | operational view | yes | yes |
| Submit/rotate provider secrets | no | no by default | capability-gated | yes |
| View SNS job queue/history | no | yes | debug view | yes |
| Approve/publish SNS job | no | yes | no by default | yes |
| Assign staff roles | no | no | no | yes |
| Change legal/public feature gates | no | no | no by default | yes |

Server-side capability checks are mandatory for every privileged mutation.

## 5. Batch D — API / Provider Registry

### Admin page sections

1. Provider overview
2. Provider detail/status
3. Credential add/rotate form
4. Connection test
5. Operational history
6. Audit history

### Display fields

- provider
- category
- environment
- credential alias
- configured/not configured
- enabled/disabled
- current connection health
- last test time
- last success
- sanitized last failure
- expiry if known
- rate-limit/quota note if known
- documentation/source note

### Secret handling

- Raw secret may be typed once over an authenticated/admin transport.
- Client sends the raw value to the server secret endpoint and immediately discards it.
- Server stores it using the configured secret/encryption layer.
- Read APIs return only metadata and optional safe mask/fingerprint.
- Browser storage is forbidden for real secrets.
- Audit logs contain actor/action/provider/alias/result, never raw secret material.

### Initial provider placeholders

Create registry entries only as metadata, with status `UNCONFIGURED` unless a real existing integration is verified:

- KMA
- AirKorea
- KTO
- Seoul city/real-time data
- ECMWF / AIFS
- JMA
- NOAA
- additional verified Earthus 1.0 providers discovered in inventory

The operator can later enter collected keys from the admin UI. No repository edit should be required to rotate a key.

## 6. Batch E — SNS Automation Upgrade

### Pipeline state machine

Recommended job stages:

`QUEUED → DATA_SNAPSHOT → RENDER → ENCODE → METADATA → REVIEW → PUBLISH → VERIFY → COMPLETED`

Failure states retain the stage and retryability.

### Required controls

- [ ] dry-run
- [ ] manual review/approval
- [ ] scheduled/automatic mode only when deliberately enabled
- [ ] per-channel enable switch
- [ ] destination account/environment separation
- [ ] duplicate prevention/idempotency key
- [ ] retry with backoff
- [ ] final publish verification when channel API supports it
- [ ] source/data snapshot link or identifier for audit
- [ ] image/video preview before approval

Development/staging must not publish to production social destinations by default.

## 7. Batch F — SEO / GEO

### SEO validation

- [ ] important public routes produce crawlable HTML/text.
- [ ] title/meta description are unique and data-aware.
- [ ] canonical URL is stable.
- [ ] localized equivalents use valid `hreflang`.
- [ ] sitemap contains only public canonical URLs.
- [ ] admin/auth/private/debug paths are excluded and `noindex` where appropriate.
- [ ] Open Graph previews resolve to stable public assets.
- [ ] structured data is used only when schema meaning matches the page.

### GEO / AI answerability validation

Every significant generated explanation/data card intended for public indexing should be able to expose:

- geographic subject
- source/provider
- observation/forecast/model/derived classification
- issue time
- valid time/range
- update time
- unit
- confidence/uncertainty where applicable
- source link/identifier when licensing/product rules permit

WebGL-only visuals require a corresponding accessible explanatory text/data representation.

## 8. Batch G — 15-Day Weather / Tropical Intelligence

### Display hierarchy

#### 0–5 days

- official tropical advisories/tracks where available
- official visual styling and explicit source/time

#### 6–10 days

- model/ensemble guidance
- corridor/spread presentation
- never visually merge into the official track as if official

#### 11–15 days

- tropical genesis/formation-zone probability or ensemble density
- no single precision track unless an authoritative source product explicitly provides and is labeled as such

### Tropical candidate card

Required fields when the source supports them:

- Earthus candidate ID
- basin / formation zone
- formation-window range
- source/model list
- source-native probability and/or ensemble support
- model agreement
- run persistence
- issue time
- valid time
- next available name list shown separately

### Next three names

- [ ] Obtain the authoritative current sequence at data refresh time.
- [ ] Store effective/version metadata.
- [ ] Show three `next available` names.
- [ ] Never label a candidate with one of those names before official assignment.
- [ ] Official assignment replaces the Earthus candidate naming display only after the official source reports it.

### Legal/public feature gate

Pre-device default:

- official forecast display: available when verified
- model guidance: available when verified/licensed and clearly labeled
- Earthus-calculated public forecast: internal/disabled
- Earthus-calibrated public probability: internal/disabled

## 9. Pre-Device QA Matrix

Run before handing the build to real-device testing.

### Network / loading

- [ ] normal broadband
- [ ] high latency
- [ ] throttled bandwidth
- [ ] provider timeout
- [ ] provider 4xx/5xx
- [ ] offline after initial load
- [ ] repeated rapid layer toggles

### Auth / admin

- [ ] FREE
- [ ] PAID
- [ ] INVITE
- [ ] OPERATIONS
- [ ] DEVELOPER
- [ ] SUPER_ADMIN
- [ ] unauthenticated access
- [ ] expired/revoked session

### Security

- [ ] raw API key absent from network read responses after create
- [ ] raw API key absent from localStorage/sessionStorage/IndexedDB unless a separately approved encrypted design explicitly requires otherwise; current P0 assumes forbidden
- [ ] raw API key absent from console/logs
- [ ] privileged API rejects insufficient role even when called manually
- [ ] admin/private URLs are not indexable

### SNS

- [ ] dry-run renders image/video without publishing
- [ ] failed encode retains retry context
- [ ] publish retry does not duplicate a post
- [ ] production social publishing remains disabled in dev/staging

### Tropical / weather

- [ ] official and guidance layers remain visually/semantically separate
- [ ] missing model cycle is reported, not interpolated as fact
- [ ] stale cycle warning works
- [ ] long-range data shows appropriate uncertainty
- [ ] next names are not assigned to candidates
- [ ] Earthus-derived public forecast feature gates remain closed unless explicitly approved

### SEO/GEO

- [ ] canonical/meta rendered
- [ ] sitemap/robots correct
- [ ] admin/private noindex
- [ ] localized route relationships correct
- [ ] crawlable text represents core 3D data meaning
- [ ] provenance timestamps/source classifications are present

## 10. Handoff Gate to Real-Device Test

Real-device testing may begin only when:

- [ ] all P0 implementation rows in `implementation_plan.md` are complete or an explicit blocker is accepted
- [ ] branch is green under available lint/test/build checks
- [ ] `git diff --check` passes
- [ ] there are no committed/client-exposed secrets
- [ ] loaders have recoverable failure states
- [ ] RBAC mutations are server-enforced
- [ ] provider registry safely accepts/rotates real keys without source edits
- [ ] SNS automation is safe in dry-run/staging
- [ ] SEO/GEO baseline is crawlable and private surfaces are excluded
- [ ] 15-day tropical intelligence is source/time/provenance aware and legally gated
- [ ] exact handoff commit SHA is recorded

At this point stop and hand the exact commit/build to the real-device test procedure. Do not report real-device success before a real device is actually tested.

## 11. Rollback Principle

Each integration batch should be independently revertible. Do not combine unrelated loader/auth/SNS/SEO/tropical changes into one irreversible commit. A rollback must not require exposing or re-entering a secret from Git history.
