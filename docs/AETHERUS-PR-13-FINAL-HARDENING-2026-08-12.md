# AETHERUS Final Hardening & Codex Handoff — 2026-08-12

## Implemented, tested, and deployable now

| Slice | Evidence |
|---|---|
| AI Intent → Evidence | read-only intent, injection rejection, evidence ledger citation coverage, zero external-model budget, model text cannot mutate state |
| Remote Observatory | single-use authorization, stale weather/dome/mount SAFE_HOLD, target mismatch hold, emergency stop, zero driver/cloud bypass |
| SDK / Marketplace | versioned manifest, capabilities/resource limits, signature/review gate, sandbox-only result, sales/webhook/entitlement disabled |
| Personal / Community / Science | local ownership/export/delete, human publish request/moderation, dimensional reputation, campaign evidence/consent/WCS/rights/duplicate/review/retraction |

All are static ES-module contracts. They intentionally have no active public UI consumer until the related
runtime surface can display provenance, privacy, rights, failure and rollback state correctly.

## Final hard gates that are NOT IMPLEMENTED

These need new authority or real external evidence and must not be claimed as complete:

1. Supabase migrations plus authenticated principal A/B RLS denial for Personal/Community/Reviewer roles.
2. Real physical observatory hardware-in-loop, weather/dome/mount telemetry, emergency-stop device proof.
3. Licensed model credentials/cost approval, real model evaluation data, and any action escalation beyond read-only.
4. Plugin signing key custody, isolated runtime execution, commerce entitlement, payment/webhook authorization.
5. Institution campaign contract, partner data-transfer agreement, DOI/storage/reviewer process.
6. Public UI surfaces and real-device accessibility/performance validation for each new feature.

## Release gate

Run all `tools/test_aetherus_*.mjs`, catalog validators, syntax checks, and this hardening test. Deploy only
changed static modules with correct content type and `no-cache`; compare cache-busting production SHA-256.
No release may turn an `OUT_OF_SCOPE`, `NOT_CONFIGURED`, `SAFE_HOLD`, `NOT_PUBLISHED`, or `UNKNOWN` state
into success text.

## Production static evidence

- CloudFront invalidation: `I6LYU0WAFE9931M380LCNONFMA` for the three modules below.
- `ai-evidence.js`: `2c1ffdc974cc884d2905f166172785ea5ad558c2e7e738f90176b3e2d4fced50`
- `remote-observatory.js`: `5dafcbcfab4ed536a618fe57c2b59c779e1b6a80868df8ed847197229cfedfb1`
- `plugin-sandbox.js`: `af818678baf2940c80d69b3348f79537384558dc8a967646b16704fea0f49b25`

Each cache-busting production URL returned HTTP 200 with
`text/javascript; charset=utf-8` and `cache-control: no-cache`; its body matched the
corresponding checked-out module byte for byte. These modules have no public UI
consumer, model provider, device driver, payment route, or network runtime.
